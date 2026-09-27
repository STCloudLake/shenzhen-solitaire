/* ============================================================================
 * SHENZHEN SOLITAIRE — 规则引擎（纯逻辑，不依赖 DOM，可在 Node 下测试）
 * ----------------------------------------------------------------------------
 * 牌堆构成（40 张）：
 *   3 个花色 × 数字牌 1..9          = 27
 *   3 个花色 × 龙牌（中 / 發 / 白）各 4 张 = 12
 *   花牌 ❀                          =  1
 * 牌序编码：id = suit*13 + (rank-1)         数字牌
 *           id = suit*13 + 9 + k  (k=0..3)   龙牌
 *           id = 39                          花牌
 * ==========================================================================*/
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SZEngine = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  /* ---------------------------------------------------------------- 常量 */

  var SUITS = [
    { id: 0, key: 'tong', name: '筒', dragon: '中', ink: 'red', inkHex: '#a8260e' },
    { id: 1, key: 'suo', name: '索', dragon: '發', ink: 'green', inkHex: '#0d6b47' },
    { id: 2, key: 'wan', name: '萬', dragon: '白', ink: 'black', inkHex: '#161616' }
  ];

  var PILE_COUNT = 8;      // 桌面列数
  var PILE_HEIGHT = 5;     // 开局每列张数
  var CELL_COUNT = 3;      // 左上角空格
  var DECK_SIZE = 40;
  var NUM_RANKS = 9;

  var CARDS = [];
  (function buildCards() {
    for (var s = 0; s < 3; s++) {
      for (var r = 1; r <= NUM_RANKS; r++) CARDS.push({ id: s * 13 + r - 1, suit: s, rank: r });
      for (var k = 0; k < 4; k++) CARDS.push({ id: s * 13 + 9 + k, suit: s, rank: 'D' });
    }
    CARDS.push({ id: 39, suit: -1, rank: 'F' });
    CARDS.sort(function (a, b) { return a.id - b.id; });
  })();

  function card(id) { return CARDS[id]; }
  function isNumber(id) { return typeof CARDS[id].rank === 'number'; }
  function isDragon(id) { return CARDS[id].rank === 'D'; }
  function isFlower(id) { return CARDS[id].rank === 'F'; }
  function rankOf(id) { return CARDS[id].rank; }
  function suitOf(id) { return CARDS[id].suit; }

  /* ------------------------------------------------------------ 伪随机数 */

  function mulberry32(seed) {
    var a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function shuffle(arr, rng) {
    for (var i = arr.length - 1; i >= 1; i--) {
      var j = Math.floor(rng() * (i + 1));
      var t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
  }

  /* ---------------------------------------------------------------- 状态 */

  function newState() {
    var piles = [];
    for (var i = 0; i < PILE_COUNT; i++) piles.push([]);
    return {
      piles: piles,                 // 8 列，每列自底向顶存 cardId
      cells: [null, null, null],    // 左上角 3 个空格
      locked: [false, false, false],// 该空格是否已被龙牌锁死
      lockSuit: [null, null, null], // 锁死空格里是哪一色龙
      foundSlot: [null, null, null],// 右上角 3 个基位各属于哪一花色
      foundTop: [0, 0, 0],          // 每花色基位已放到的点数（0 = 还没开始）
      flower: false                 // 花牌是否已归位
    };
  }

  function cloneState(s) {
    return {
      piles: s.piles.map(function (p) { return p.slice(); }),
      cells: s.cells.slice(),
      locked: s.locked.slice(),
      lockSuit: s.lockSuit.slice(),
      foundSlot: s.foundSlot.slice(),
      foundTop: s.foundTop.slice(),
      flower: s.flower
    };
  }

  function serialize(s) {
    return s.piles.map(function (p) { return p.join('.'); }).join('|') + '#' +
      s.cells.join('.') + '#' + s.locked.join('') + '#' + s.foundSlot.join('.') + '#' +
      s.foundTop.join('.') + '#' + (s.flower ? 1 : 0);
  }

  /* ---------------------------------------------------------------- 发牌 */

  // 只发牌，不做自动上牌（便于测试/回放）
  function dealPiles(seed) {
    seed = (seed >>> 0) || 1;
    var rng = mulberry32(seed);
    var deck = CARDS.map(function (c) { return c.id; });
    shuffle(deck, rng);
    var s = newState();
    for (var i = 0; i < PILE_COUNT; i++) {
      s.piles[i] = deck.slice(i * PILE_HEIGHT, (i + 1) * PILE_HEIGHT);
    }
    return s;
  }

  // 返回 { seed, state, initialMoves }：发牌后立即结算开局就能自动上牌的牌
  function createGame(seed) {
    seed = (seed >>> 0) || 1;
    var s = dealPiles(seed);
    var initialMoves = applyAutoMoves(s);
    return { seed: seed, state: s, initialMoves: initialMoves };
  }

  /* ------------------------------------------------------------ 取牌/合法性 */

  // 桌面某列从 index 起的一叠是否构成「点数递减 1 且花色交替」的数字牌连叠
  function isRun(s, pileIdx, index) {
    var p = s.piles[pileIdx];
    if (index < 0 || index >= p.length) return false;
    for (var j = index; j < p.length; j++) {
      if (!isNumber(p[j])) return false;
      if (j > index) {
        var above = CARDS[p[j - 1]], here = CARDS[p[j]];
        if (above.suit === here.suit) return false;
        if (above.rank - here.rank !== 1) return false;
      }
    }
    return true;
  }

  // 能否从该列该位置整体拿起（顶牌任意；其下必须是合法连叠）
  function canLift(s, pileIdx, index) {
    var p = s.piles[pileIdx];
    if (index < 0 || index >= p.length) return false;
    if (index === p.length - 1) return true;
    return isRun(s, pileIdx, index);
  }

  function groupFromPile(s, pileIdx, index) {
    return s.piles[pileIdx].slice(index);
  }

  // 目标描述：
  //   {type:'pile', idx}  {type:'cell', idx}  {type:'found', suit}  {type:'flower'}
  function legalTarget(s, group, target) {
    if (!group || group.length === 0) return false;
    var lead = CARDS[group[0]];

    switch (target.type) {
      case 'cell':
        return group.length === 1 && !s.locked[target.idx] && s.cells[target.idx] === null;

      case 'flower':
        return group.length === 1 && lead.rank === 'F' && !s.flower;

      case 'found': {
        if (group.length !== 1) return false;
        if (typeof lead.rank !== 'number') return false;
        if (lead.suit !== target.suit) return false;
        if (s.foundTop[lead.suit] === 0) {
          return lead.rank === 1 && s.foundSlot.indexOf(null) !== -1;
        }
        return s.foundTop[lead.suit] === lead.rank - 1;
      }

      case 'pile': {
        var dest = s.piles[target.idx];
        if (dest.length === 0) return true;
        var top = CARDS[dest[dest.length - 1]];
        if (typeof top.rank !== 'number' || typeof lead.rank !== 'number') return false;
        return top.suit !== lead.suit && top.rank === lead.rank + 1;
      }
    }
    return false;
  }

  // 列出当前这叠牌所有可落点（用于高亮）
  function legalTargets(s, group, from) {
    var out = [];
    var i;
    for (i = 0; i < PILE_COUNT; i++) {
      if (from && from.type === 'pile' && from.idx === i && group.length === s.piles[i].length - from.index) continue;
      var t = { type: 'pile', idx: i };
      if (legalTarget(s, group, t)) out.push(t);
    }
    if (group.length === 1) {
      for (i = 0; i < CELL_COUNT; i++) {
        var c = { type: 'cell', idx: i };
        if (legalTarget(s, group, c)) out.push(c);
      }
      if (isNumber(group[0])) {
        var f = { type: 'found', suit: CARDS[group[0]].suit };
        if (legalTarget(s, group, f)) out.push(f);
      }
      if (isFlower(group[0])) {
        var fl = { type: 'flower' };
        if (legalTarget(s, group, fl)) out.push(fl);
      }
    }
    return out;
  }

  /* ------------------------------------------------------------ 移动执行 */

  function takeGroup(s, from) {
    if (from.type === 'pile') {
      return s.piles[from.idx].splice(from.index);
    }
    // cell
    var g = [s.cells[from.idx]];
    s.cells[from.idx] = null;
    return g;
  }

  function putGroup(s, group, to) {
    var i;
    if (to.type === 'pile') {
      for (i = 0; i < group.length; i++) s.piles[to.idx].push(group[i]);
    } else if (to.type === 'cell') {
      s.cells[to.idx] = group[0];
    } else if (to.type === 'flower') {
      s.flower = true;
    } else if (to.type === 'found') {
      var c = CARDS[group[0]];
      s.foundTop[c.suit] = c.rank;
      if (c.rank === 1) {
        var slot = s.foundSlot.indexOf(null);
        if (slot !== -1) s.foundSlot[slot] = c.suit;
      }
    }
  }

  function moveGroup(s, from, to) {
    var g = takeGroup(s, from);
    putGroup(s, g, to);
    return g;
  }

  /* ------------------------------------------------------------ 龙牌合并 */

  function visibleDragonCount(s, suit) {
    var n = 0, i;
    for (i = 0; i < CELL_COUNT; i++) {
      if (s.cells[i] !== null && isDragon(s.cells[i]) && suitOf(s.cells[i]) === suit) n++;
    }
    for (i = 0; i < PILE_COUNT; i++) {
      var p = s.piles[i];
      if (p.length && isDragon(p[p.length - 1]) && suitOf(p[p.length - 1]) === suit) n++;
    }
    return n;
  }

  // 某花色 4 张龙牌是否全部露出，且存在可用的空格（空的，或已放有同色龙牌的）
  function canConsolidate(s, suit) {
    if (visibleDragonCount(s, suit) !== 4) return false;
    var hasHome = false;
    for (var i = 0; i < CELL_COUNT; i++) {
      if (s.locked[i]) continue;
      if (s.cells[i] === null || (isDragon(s.cells[i]) && suitOf(s.cells[i]) === suit)) { hasHome = true; break; }
    }
    if (!hasHome) return false;
    // 该花色若已锁死则不必再合并
    for (var k = 0; k < CELL_COUNT; k++) if (s.locked[k] && s.lockSuit[k] === suit) return false;
    return true;
  }

  function consolidate(s, suit) {
    if (!canConsolidate(s, suit)) return null;
    var spot = -1, i;
    for (i = 0; i < CELL_COUNT; i++) {
      if (s.locked[i]) continue;
      if (s.cells[i] === null || (isDragon(s.cells[i]) && suitOf(s.cells[i]) === suit)) { spot = i; break; }
    }
    var moved = [];
    // 空格里的
    for (i = 0; i < CELL_COUNT; i++) {
      if (s.cells[i] !== null && isDragon(s.cells[i]) && suitOf(s.cells[i]) === suit) {
        moved.push({ card: s.cells[i], from: { type: 'cell', idx: i } });
        s.cells[i] = null;
      }
    }
    // 列顶的
    for (i = 0; i < PILE_COUNT; i++) {
      var p = s.piles[i];
      while (p.length && isDragon(p[p.length - 1]) && suitOf(p[p.length - 1]) === suit) {
        moved.push({ card: p[p.length - 1], from: { type: 'pile', idx: i, index: p.length - 1 } });
        p.pop();
      }
    }
    // 用第一个找到的龙牌作代表放进空格
    var rep = moved.length ? moved[0].card : null;
    s.cells[spot] = rep;
    s.locked[spot] = true;
    s.lockSuit[spot] = suit;
    return { suit: suit, spot: spot, cards: moved.map(function (m) { return m.card; }), moved: moved };
  }

  /* ------------------------------------------------------------ 自动上牌 */

  // 安全规则：1 立刻可上；点数 n>1 时，必须另外两色都已至少上到 n-1
  function safetyOk(s, suit, rank) {
    if (rank === 1) return true;
    for (var k = 0; k < 3; k++) {
      if (k === suit) continue;
      if (s.foundTop[k] < rank - 1) return false;
    }
    return true;
  }

  // 一张牌能否自动上基位：
  //   1) 自己花色的基位正好等着它（1 需要有空基位）
  //   2) 另外两色都已经上到「前一等级」（保证自动上牌不会把局面走死）
  function canAutoMove(s, id) {
    if (!isNumber(id)) return false;
    var c = CARDS[id];
    var top = s.foundTop[c.suit];
    if (c.rank === 1) return top === 0 && s.foundSlot.indexOf(null) !== -1;
    return top === c.rank - 1 && safetyOk(s, c.suit, c.rank);
  }

  function sendToFoundation(s, id, from) {
    var c = CARDS[id];
    if (from.type === 'cell') s.cells[from.idx] = null;
    else s.piles[from.idx].pop();
    s.foundTop[c.suit] = c.rank;
    if (c.rank === 1) {
      var slot = s.foundSlot.indexOf(null);
      if (slot !== -1) s.foundSlot[slot] = c.suit;
    }
    return { card: id, from: from, to: { type: 'found', suit: c.suit } };
  }

  function autoMoveStep(s) {
    var i, id;

    // 1) 花牌永远优先飞回花位
    if (!s.flower) {
      for (i = 0; i < CELL_COUNT; i++) {
        id = s.cells[i];
        if (id !== null && isFlower(id)) {
          s.cells[i] = null; s.flower = true;
          return { card: id, from: { type: 'cell', idx: i }, to: { type: 'flower' } };
        }
      }
      for (i = 0; i < PILE_COUNT; i++) {
        var p = s.piles[i];
        if (p.length && isFlower(p[p.length - 1])) {
          id = p.pop(); s.flower = true;
          return { card: id, from: { type: 'pile', idx: i, index: p.length }, to: { type: 'flower' } };
        }
      }
    }

    // 2) 空格里的数字牌
    for (i = 0; i < CELL_COUNT; i++) {
      id = s.cells[i];
      if (id === null || !isNumber(id)) continue;
      if (canAutoMove(s, id)) return sendToFoundation(s, id, { type: 'cell', idx: i });
    }

    // 3) 列顶的数字牌
    for (i = 0; i < PILE_COUNT; i++) {
      var q = s.piles[i];
      if (!q.length) continue;
      id = q[q.length - 1];
      if (!isNumber(id)) continue;
      if (canAutoMove(s, id)) return sendToFoundation(s, id, { type: 'pile', idx: i, index: q.length - 1 });
    }
    return null;
  }

  function applyAutoMoves(s) {
    var out = [], ev;
    while ((ev = autoMoveStep(s))) out.push(ev);
    return out;
  }

  /* ---------------------------------------------------------------- 胜负 */

  function isWin(s) {
    if (!s.flower) return false;
    for (var k = 0; k < 3; k++) if (s.foundTop[k] !== NUM_RANKS) return false;
    for (var i = 0; i < PILE_COUNT; i++) if (s.piles[i].length) return false;
    for (var c = 0; c < CELL_COUNT; c++) if (!s.locked[c]) return false;
    return true;
  }

  // 剩下的牌数量（用于判断是否僵局 / 进度显示）
  function remaining(s) {
    var n = 0, i;
    for (i = 0; i < PILE_COUNT; i++) n += s.piles[i].length;
    for (i = 0; i < CELL_COUNT; i++) if (s.cells[i] !== null) n++;
    return n;
  }

  /* ---------------------------------------------------------------- 求解器
   * 用于「保证可解」发牌。状态搜索 + 访问集合去重（自动上牌视为强制动作）。
   * 找不到解/超时返回 null。
   * -------------------------------------------------------------------- */

  var TIMEOUT = { timeout: true }; // 保留：外部可用来判断预算耗尽

  function firstEmptyPile(s, exclude) {
    for (var i = 0; i < PILE_COUNT; i++) if (i !== exclude && s.piles[i].length === 0) return i;
    return -1;
  }
  function firstEmptyCell(s) {
    for (var i = 0; i < CELL_COUNT; i++) if (!s.locked[i] && s.cells[i] === null) return i;
    return -1;
  }

  // 生成全部合法动作。等价目标（多个空列 / 多个空格）只生成一个，压缩分支
  function generateMoves(s) {
    var moves = [], i, j, k, group, t, from;
    var emptyPile = firstEmptyPile(s, -1);
    var emptyCell = firstEmptyCell(s);

    for (i = 0; i < PILE_COUNT; i++) {
      var p = s.piles[i];
      for (j = p.length - 1; j >= 0; j--) {
        if (!canLift(s, i, j)) break;
        group = p.slice(j);
        if (isFlower(group[0])) continue;              // 花牌只会被自动上牌处理
        var single = group.length === 1;
        from = { type: 'pile', idx: i, index: j };

        // 空列（各空列等价，只取第一个）
        if (emptyPile !== -1 && emptyPile !== i) {
          moves.push({ from: from, to: { type: 'pile', idx: emptyPile }, group: group.slice() });
        }
        // 压到其它列上
        for (k = 0; k < PILE_COUNT; k++) {
          if (k === i || s.piles[k].length === 0) continue;
          t = { type: 'pile', idx: k };
          if (legalTarget(s, group, t)) moves.push({ from: from, to: t, group: group.slice() });
        }
        // 空格
        if (single && emptyCell !== -1) {
          t = { type: 'cell', idx: emptyCell };
          if (legalTarget(s, group, t)) moves.push({ from: from, to: t, group: group.slice() });
        }
        // 基位
        if (single && isNumber(group[0])) {
          t = { type: 'found', suit: CARDS[group[0]].suit };
          if (legalTarget(s, group, t)) moves.push({ from: from, to: t, group: group.slice() });
        }
      }
    }

    // 空格 -> 桌面 / 基位
    for (i = 0; i < CELL_COUNT; i++) {
      if (s.cells[i] === null || s.locked[i]) continue;
      group = [s.cells[i]];
      from = { type: 'cell', idx: i };
      if (emptyPile !== -1) {
        moves.push({ from: from, to: { type: 'pile', idx: emptyPile }, group: group.slice() });
      }
      for (k = 0; k < PILE_COUNT; k++) {
        if (s.piles[k].length === 0) continue;
        t = { type: 'pile', idx: k };
        if (legalTarget(s, group, t)) moves.push({ from: from, to: t, group: group.slice() });
      }
      if (isNumber(group[0])) {
        t = { type: 'found', suit: CARDS[group[0]].suit };
        if (legalTarget(s, group, t)) moves.push({ from: from, to: t, group: group.slice() });
      }
    }

    // 龙牌合并（复合动作）
    for (i = 0; i < 3; i++) {
      if (canConsolidate(s, i)) moves.push({ consolidate: i });
    }
    return moves;
  }

  // 动作排序：合并 > 上基位 > 空格回桌面 > 搬空一列 > 其它桌面内互调 > 进空格
  function moveScore(s, m) {
    if (m.consolidate !== undefined) return 1000;
    if (m.to.type === 'found') return 500;
    if (m.from.type === 'cell') return 300;
    if (m.to.type === 'cell') return 40;
    if (m.to.type === 'pile') {
      if (m.from.type === 'pile' && m.from.index === 0) return 200;
      return 100;
    }
    return 0;
  }

  function orderMoves(s, moves) {
    return moves.sort(function (a, b) { return moveScore(s, b) - moveScore(s, a); });
  }

  // 规范化状态：桌面各列、空格彼此等价，排序后作为搜索去重键（大幅压缩状态空间）
  function canonKey(s) {
    var piles = s.piles.map(function (p) { return p.join('.'); }).sort();
    var cells = [];
    for (var i = 0; i < CELL_COUNT; i++) {
      cells.push(s.locked[i] ? ('L' + s.lockSuit[i]) : (s.cells[i] === null ? '' : String(s.cells[i])));
    }
    cells.sort();
    return piles.join('|') + '#' + cells.join(',') + '#' + s.foundTop.join('.') + '#' + (s.flower ? 1 : 0);
  }

  // 回溯深搜（带访问集合去重与动作排序），超预算返回 null
  function solve(state, opts) {
    opts = opts || {};
    var nodeLimit = opts.nodes || 200000;
    var timeLimit = opts.ms || 1500;
    var deadline = Date.now() + timeLimit;
    var seen = new Set();
    var nodes = 0;

    var root = cloneState(state);
    applyAutoMoves(root);
    if (isWin(root)) return [];

    seen.add(canonKey(root));
    var stack = [{ s: root, moves: orderMoves(root, generateMoves(root)), i: 0, move: null, parent: -1 }];

    while (stack.length) {
      if (++nodes > nodeLimit) return null;
      if ((nodes & 127) === 0 && Date.now() > deadline) return null;

      var frame = stack[stack.length - 1];
      if (frame.i >= frame.moves.length) { stack.pop(); continue; }
      var m = frame.moves[frame.i++];

      var ns = cloneState(frame.s);
      if (m.consolidate !== undefined) consolidate(ns, m.consolidate);
      else moveGroup(ns, m.from, m.to);
      applyAutoMoves(ns);

      if (isWin(ns)) {
        var path = [m], idx = stack.length - 1;
        while (idx > 0) { path.push(stack[idx].move); idx = stack[idx].parent; }
        path.reverse();
        return path;
      }

      var key = canonKey(ns);
      if (seen.has(key)) continue;
      seen.add(key);
      stack.push({ s: ns, moves: orderMoves(ns, generateMoves(ns)), i: 0, move: m, parent: stack.length - 1 });
    }
    return null;
  }

  // 依次尝试若干种子，返回第一个可解牌局
  function createSolvableGame(seed, opts) {
    opts = opts || {};
    var tries = opts.tries || 8;
    var last = null;
    for (var k = 0; k < tries; k++) {
      var g = createGame(seed + k);
      last = g;
      var sol = solve(g.state, { nodes: opts.nodes || 200000, ms: opts.ms || 1200 });
      if (sol) { g.solution = sol; return g; }
    }
    return last;
  }

  /* ---------------------------------------------------------------- 导出 */

  return {
    SUITS: SUITS, CARDS: CARDS,
    PILE_COUNT: PILE_COUNT, PILE_HEIGHT: PILE_HEIGHT, CELL_COUNT: CELL_COUNT, DECK_SIZE: DECK_SIZE,
    card: card, isNumber: isNumber, isDragon: isDragon, isFlower: isFlower,
    rankOf: rankOf, suitOf: suitOf,
    mulberry32: mulberry32, shuffle: shuffle,
    newState: newState, cloneState: cloneState, serialize: serialize,
    createGame: createGame, dealPiles: dealPiles,
    isRun: isRun, canLift: canLift, groupFromPile: groupFromPile,
    legalTarget: legalTarget, legalTargets: legalTargets,
    takeGroup: takeGroup, putGroup: putGroup, moveGroup: moveGroup,
    visibleDragonCount: visibleDragonCount, canConsolidate: canConsolidate, consolidate: consolidate,
    safetyOk: safetyOk, autoMoveStep: autoMoveStep, applyAutoMoves: applyAutoMoves,
    isWin: isWin, remaining: remaining,
    generateMoves: generateMoves, solve: solve, createSolvableGame: createSolvableGame
  };
});
