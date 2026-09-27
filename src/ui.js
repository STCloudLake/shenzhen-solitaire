/* ============================================================================
 * SHENZHEN SOLITAIRE — 界面与交互
 * ==========================================================================*/
(function () {
  'use strict';

  var E = window.SZEngine, A = window.SZArt;
  var WINS_KEY = 'shenzhen-solitaire-wins';

  /* ------------------------------------------------------------ 布局常量 */
  var CARD_W = 84, CARD_H = 168;
  var BOARD_W = 1080, BOARD_H = 644;
  var PITCH = 128, LEFT = 50, TOP = 30;
  var TABLEAU_TOP = TOP + CARD_H + 40;
  var OVERLAP_MAX = 46, OVERLAP_MIN = 11;
  var BTN_SIZE = 48, BTN_GAP = 12, BTN_LEFT = 22;
  var BTN_TOP = TOP + 12;
  var DRAG_THRESHOLD = 4;

  function colX(i) { return LEFT + i * PITCH; }
  function overlapFor(n) {
    if (n <= 1) return OVERLAP_MAX;
    var avail = BOARD_H - 18 - TABLEAU_TOP - CARD_H;
    return Math.max(OVERLAP_MIN, Math.min(OVERLAP_MAX, avail / (n - 1)));
  }
  function cardId(suit, rank) { return suit * 13 + (rank - 1); }

  // foundSlot 是「按格子存花色」：foundSlot[slot] = suit；foundTop 是「按花色存点数」
  function slotOfSuit(suit) { return state.foundSlot.indexOf(suit); }
  // 该花色该放到哪个格子（还没开始就用第一个空格）
  function slotForDrop(suit) {
    var s = state.foundSlot.indexOf(suit);
    return s !== -1 ? s : state.foundSlot.indexOf(null);
  }

  /* ------------------------------------------------------------ 运行状态 */
  var state = null, seed = 0, solvedDeal = false;
  var cardEls = {};          // id -> element
  var history = [];          // 撤销栈（状态快照）
  var selection = null;      // {from, group}
  var drag = null;
  var busy = false;
  var vanishing = {};        // 合并龙牌时正在消失的牌
  var wins = 0;
  var autoTimer = null;
  var muted = false;
  var prefs = { auto: true, solvable: true, sound: true };
  var PREFS_KEY = 'shenzhen-solitaire-prefs';

  /* ------------------------------------------------------------ DOM 引用 */
  var board, ghost, hintline, toastEl, overlay, winbanner;
  var btnUndo, btnRestart, btnNew, btnRules, statWins, statSeed;
  var toggleAuto, toggleSound, toggleSolvable;

  /* ============================================================ 初始化 */
  function init() {
    board = document.getElementById('board');
    ghost = document.getElementById('ghost');
    hintline = document.getElementById('hintline');
    toastEl = document.getElementById('toast');
    overlay = document.getElementById('overlay');
    winbanner = document.getElementById('winbanner');
    btnUndo = document.getElementById('btn-undo');
    btnRestart = document.getElementById('btn-restart');
    btnNew = document.getElementById('btn-new');
    btnRules = document.getElementById('btn-rules');
    statWins = document.getElementById('stat-wins');
    statSeed = document.getElementById('stat-seed');
    toggleAuto = document.getElementById('tg-auto');
    toggleSound = document.getElementById('tg-sound');
    toggleSolvable = document.getElementById('tg-solvable');

    buildSlots();
    buildButtons();
    buildCards();
    if (window.SZSFX) window.SZSFX.init();
    wins = loadWins();
    statWins.textContent = String(wins);
    loadPrefs();

    bindChrome();
    bindBoard();
    bindKeys();

    fit();
    // 先让机箱画出来，再去跑「保证可解」的求解（可能要几百毫秒）
    var qs = /[?&]seed=(\d+)/.exec(location.search);
    var first = qs ? parseInt(qs[1], 10) : (Math.floor(Math.random() * 999999) + 1);
    setTimeout(function () { newGame(first, true); }, 40);

    window.addEventListener('resize', fit);
  }

  /* ---------------------------------------------------------- 静态 DOM */
  function buildSlots() {
    var i, el;
    for (i = 0; i < 3; i++) {
      el = document.createElement('div');
      el.className = 'slot cell';
      el.dataset.area = 'cell';
      el.dataset.idx = String(i);
      el.style.transform = 'translate(' + colX(i) + 'px,' + TOP + 'px)';
      board.appendChild(el);
    }
    el = document.createElement('div');
    el.className = 'slot flower';
    el.dataset.area = 'flower';
    el.style.transform = 'translate(' + colX(4) + 'px,' + TOP + 'px)';
    board.appendChild(el);
    for (i = 0; i < 3; i++) {
      el = document.createElement('div');
      el.className = 'slot found';
      el.dataset.area = 'found';
      el.dataset.idx = String(i);
      el.style.transform = 'translate(' + colX(5 + i) + 'px,' + TOP + 'px)';
      board.appendChild(el);
    }
    for (i = 0; i < 8; i++) {
      el = document.createElement('div');
      el.className = 'col';
      el.dataset.area = 'pile';
      el.dataset.idx = String(i);
      el.style.transform = 'translate(' + colX(i) + 'px,' + TABLEAU_TOP + 'px)';
      board.appendChild(el);
    }
    var bar = document.createElement('div');
    bar.id = 'dragonbar';
    bar.style.transform = 'translate(' + colX(3) + 'px,' + TOP + 'px)';
    board.appendChild(bar);
    board.appendChild(ghost);
    var hl = hintline;
    board.appendChild(hl);
  }

  function buildButtons() {
    var bar = document.getElementById('dragonbar');
    for (var i = 0; i < 3; i++) {
      var b = document.createElement('button');
      b.className = 'dbtn';
      b.dataset.suit = String(i);
      b.style.top = (BTN_TOP - TOP + i * (BTN_SIZE + BTN_GAP)) + 'px';
      b.innerHTML = '<span class="ring"></span><span class="sym">' + A.DRAGON[i] + '</span>';
      b.addEventListener('click', function (ev) {
        ev.stopPropagation();
        doConsolidate(parseInt(this.dataset.suit, 10));
      });
      bar.appendChild(b);
    }
  }

  function buildCards() {
    for (var id = 0; id < 40; id++) {
      var c = E.card(id);
      var face = A.cardFace(c);
      var el = document.createElement('div');
      el.className = face.className;
      el.dataset.id = String(id);
      el.innerHTML = '<div class="face">' + face.html + '</div>';
      el.style.display = 'none';
      board.appendChild(el);
      cardEls[id] = el;
    }
  }

  /* ============================================================ 缩放适配 */
  function fit() {
    var stage = document.getElementById('stage');
    var frame = document.getElementById('frame');
    var fw = frame.offsetWidth, fh = frame.offsetHeight;
    var s = Math.min(1, (window.innerWidth - 16) / fw, (window.innerHeight - 16) / fh);
    stage.style.transform = 'scale(' + s + ')';
  }

  /* ============================================================ 新开一局 */
  function newGame(newSeed, first) {
    clearTimeout(autoTimer);
    var s = (newSeed >>> 0) || 1;
    solvedDeal = false;

    if (prefs.solvable) {
      var g = E.createSolvableGame(s, { tries: 6, ms: 110, nodes: 60000 });
      if (g && g.solution) { s = g.seed; solvedDeal = true; }
    }
    seed = s;
    state = E.dealPiles(seed);           // 先摆出原始牌局，开局的自动上牌留给动画
    statSeed.textContent = String(seed);
    document.title = 'SHENZHEN SOLITAIRE · 麻将接龙 · #' + seed;
    history = [];
    selection = null; drag = null; busy = false;
    vanishing = {};
    hideGhost();
    winbanner.classList.remove('on');
    document.getElementById('overlay').classList.remove('on');
    updateUndoBtn();

    layoutAll();
    dealAnimation();
    playSound('deal', true);
    busy = true;
    autoTimer = setTimeout(pumpAuto, first ? 420 : 260);
    if (solvedDeal) toast('已生成保证可解的牌局 · SEED ' + seed);
  }

  function restartDeal() {
    if (!seed) return;
    newGame(seed);
  }

  /* ============================================================ 渲染 */
  function place(id, x, y, z) {
    var el = cardEls[id];
    if (!el) return;
    el.style.display = '';
    el.style.transform = 'translate(' + x + 'px,' + y + 'px)';
    el.style.zIndex = String(z);
  }

  function layoutAll() {
    var i, j, id;
    for (id in cardEls) if (cardEls.hasOwnProperty(id)) cardEls[id].style.display = 'none';

    // 桌面
    for (i = 0; i < 8; i++) {
      var pile = state.piles[i];
      var ov = overlapFor(pile.length);
      for (j = 0; j < pile.length; j++) {
        place(pile[j], colX(i), TABLEAU_TOP + j * ov, 20 + j);
      }
    }
    // 空格
    for (i = 0; i < 3; i++) {
      if (state.cells[i] !== null) place(state.cells[i], colX(i), TOP, 12);
    }
    // 基位（同花色整叠叠放在同一格，只露最上面一张）
    for (i = 0; i < 3; i++) {
      var suit = state.foundSlot[i];
      if (suit === null) continue;
      for (j = 1; j <= state.foundTop[suit]; j++) {
        place(cardId(suit, j), colX(5 + i), TOP, 5 + j);
      }
    }
    // 花位
    if (state.flower) place(39, colX(4), TOP, 9);

    applyClasses();
    updateSlotStates();
  }

  function applyClasses() {
    var id, el;
    var selIds = {};
    if (selection) selection.group.forEach(function (c) { selIds[c] = true; });
    for (id in cardEls) {
      if (!cardEls.hasOwnProperty(id)) continue;
      el = cardEls[id];
      el.classList.toggle('selected', !!selIds[id]);
    }
  }

  function updateSlotStates() {
    // 龙牌按钮状态
    var btns = document.querySelectorAll('.dbtn');
    for (var i = 0; i < btns.length; i++) {
      var suit = parseInt(btns[i].dataset.suit, 10);
      var done = false;
      for (var k = 0; k < 3; k++) if (state.locked[k] && state.lockSuit[k] === suit) done = true;
      var can = E.canConsolidate(state, suit);
      btns[i].classList.toggle('active', can);
      btns[i].classList.toggle('done', done);
    }
    // 锁死的空格
    var cells = document.querySelectorAll('.slot.cell');
    for (var c = 0; c < cells.length; c++) {
      cells[c].classList.toggle('locked', state.locked[c]);
    }
    // 空的基位 / 花位
    var founds = document.querySelectorAll('.slot.found');
    for (var f = 0; f < founds.length; f++) {
      var used = state.foundSlot.indexOf(f) !== -1;
      founds[f].classList.toggle('dim', used);
    }
    // 提示行
    if (hintline) {
      hintline.textContent = remainingHint();
    }
  }

  function remainingHint() {
    var n = E.remaining(state);
    var locked = 0;
    for (var i = 0; i < 3; i++) if (state.locked[i]) locked++;
    return '牌桌剩余 ' + n + ' 张　龙牌已合并 ' + locked + '/3　基位进度 ' +
      state.foundTop[0] + '/' + state.foundTop[1] + '/' + state.foundTop[2];
  }

  function dealAnimation() {
    var i, j, k = 0;
    for (i = 0; i < 8; i++) {
      for (j = 0; j < state.piles[i].length; j++) {
        var el = cardEls[state.piles[i][j]];
        var fe = el.querySelector('.face');
        fe.style.animationDelay = (k * 14) + 'ms';
        el.classList.add('dealt');
        k++;
      }
    }
    setTimeout(function () {
      for (var id in cardEls) if (cardEls.hasOwnProperty(id)) {
        cardEls[id].classList.remove('dealt');
        var fe2 = cardEls[id].querySelector('.face');
        if (fe2) fe2.style.animationDelay = '';
      }
    }, 900);
  }

  /* ============================================================ 自动上牌 */
  function pumpAuto() {
    if (!state) return;
    if (!prefs.auto) { busy = false; afterTurn(); return; }
    var ev = E.autoMoveStep(state);
    if (!ev) { busy = false; afterTurn(); return; }
    busy = true;
    layoutAll();
    playSound('place', true);
    autoTimer = setTimeout(pumpAuto, 165);
  }

  function afterTurn() {
    layoutAll();
    updateUndoBtn();
    if (E.isWin(state)) { onWin(); return; }
    if (E.generateMoves(state).length === 0) {
      toast('已经没有可以移动的牌了，试试撤销或重开本局');
    }
  }

  function onWin() {
    wins += 1;
    statWins.textContent = String(wins);
    saveWins(wins);
    winbanner.classList.add('on');
    playSound('win');
    var wb = winbanner.querySelector('.wb .meta');
    if (wb) wb.textContent = 'SEED ' + seed + '　TOTAL WINS ' + wins;
  }

  /* ============================================================ 命中测试 */
  function toLocal(ev) {
    var r = board.getBoundingClientRect();
    var s = r.width / BOARD_W;
    return { x: (ev.clientX - r.left) / s, y: (ev.clientY - r.top) / s };
  }

  function hitTest(x, y) {
    var i;
    // 龙牌按钮
    for (i = 0; i < 3; i++) {
      var bx = colX(3) + BTN_LEFT, by = BTN_TOP + i * (BTN_SIZE + BTN_GAP);
      if (x >= bx && x <= bx + BTN_SIZE && y >= by && y <= by + BTN_SIZE) return { area: 'btn', idx: i };
    }
    if (y >= TOP && y <= TOP + CARD_H) {
      for (i = 0; i < 3; i++) {
        if (state.cells[i] !== null && x >= colX(i) && x < colX(i) + CARD_W) {
          return { area: 'cell', idx: i, index: 0 };
        }
      }
      if (state.flower && x >= colX(4) && x < colX(4) + CARD_W) return { area: 'flower' };
      for (i = 0; i < 3; i++) {
        var slot = state.foundSlot[i];
        if (slot === null) continue;
        if (x >= colX(5 + slot) && x < colX(5 + slot) + CARD_W) return { area: 'found', suit: i };
      }
    }
    if (y >= TABLEAU_TOP) {
      for (i = 0; i < 8; i++) {
        if (x < colX(i) || x >= colX(i) + CARD_W) continue;
        var pile = state.piles[i];
        if (!pile.length) {
          if (y <= TABLEAU_TOP + CARD_H) return { area: 'pile', idx: i, index: -1, empty: true };
          continue;
        }
        var ov = overlapFor(pile.length);
        var j = Math.floor((y - TABLEAU_TOP) / ov);
        if (j > pile.length - 1) j = pile.length - 1;
        if (j < 0) j = 0;
        return { area: 'pile', idx: i, index: j };
      }
    }
    return null;
  }

  function fromOf(hit) {
    if (hit.area === 'cell') return { type: 'cell', idx: hit.idx };
    if (hit.area === 'pile') return { type: 'pile', idx: hit.idx, index: hit.index };
    return null;
  }

  function groupOf(hit) {
    if (hit.area === 'cell') return state.cells[hit.idx] === null ? null : [state.cells[hit.idx]];
    if (hit.area === 'pile') {
      if (!E.canLift(state, hit.idx, hit.index)) return null;
      return E.groupFromPile(state, hit.idx, hit.index);
    }
    return null;
  }

  /* ============================================================ 输入 */
  function bindBoard() {
    board.addEventListener('pointerdown', onDown);
    board.addEventListener('pointermove', onMove);
    board.addEventListener('pointerup', onUp);
    board.addEventListener('pointercancel', onCancel);
    board.addEventListener('dblclick', onDblClick);
    board.addEventListener('contextmenu', function (e) { e.preventDefault(); });
  }

  function onDown(ev) {
    if (busy) return;
    var p = toLocal(ev), hit = hitTest(p.x, p.y);

    if (hit && hit.area === 'btn') { doConsolidate(hit.idx); return; }

    // 若已有选区，且点在合法落点上 -> 直接落牌
    if (selection) {
      var target = targetFromHit(hit, selection.group);
      if (target && E.legalTarget(state, selection.group, target)) {
        doMove(selection.from, selection.group, target);
        return;
      }
    }

    if (!hit || hit.area === 'found' || hit.area === 'flower') { clearSelection(); return; }

    var group = groupOf(hit);
    if (!group) {
      if (hit.area === 'pile' && hit.index >= 0 && !E.canLift(state, hit.idx, hit.index)) {
        toast('这一叠不是「点数递减、花色交替」的连牌，不能整叠拿起');
        playSound('error');
      }
      clearSelection();
      return;
    }

    selection = { from: fromOf(hit), group: group.slice() };
    applyClasses();
    highlightTargets(selection.group);

    drag = {
      startX: p.x, startY: p.y,
      pointerId: ev.pointerId,
      offsets: group.map(function (id) {
        var r = cardEls[id].getBoundingClientRect();
        var br = board.getBoundingClientRect();
        var s = br.width / BOARD_W;
        return { x: (r.left - br.left) / s - p.x, y: (r.top - br.top) / s - p.y };
      }),
      active: false
    };
    try { board.setPointerCapture(ev.pointerId); } catch (e) { }
  }

  // 单击落点：把点到的位置解释成一个目标
  function targetFromHit(hit, group) {
    if (!hit) return null;
    if (hit.area === 'cell') return { type: 'cell', idx: hit.idx };
    if (hit.area === 'pile') return { type: 'pile', idx: hit.idx };
    if (hit.area === 'found') return { type: 'found', suit: hit.suit };
    if (hit.area === 'flower') return { type: 'flower' };
    return null;
  }

  function onMove(ev) {
    if (!drag || busy) return;
    var p = toLocal(ev);
    if (!drag.active) {
      if (Math.abs(p.x - drag.startX) < DRAG_THRESHOLD && Math.abs(p.y - drag.startY) < DRAG_THRESHOLD) return;
      drag.active = true;
      selection.group.forEach(function (id, k) {
        cardEls[id].classList.add('dragging');
        cardEls[id].style.zIndex = String(900 + k);
      });
      hideGhost();
    }
    selection.group.forEach(function (id, k) {
      var off = drag.offsets[k];
      cardEls[id].style.transform = 'translate(' + (p.x + off.x) + 'px,' + (p.y + off.y) + 'px)';
    });
    var lead = drag.offsets[0];
    var t = targetAt(p.x + lead.x, p.y + lead.y, selection.group);
    if (t && E.legalTarget(state, selection.group, t)) {
      showGhost(t);
      setTargetHighlight(t);
    } else {
      hideGhost();
      setTargetHighlight(null);
    }
  }

  function onUp(ev) {
    if (!drag) return;
    var p = toLocal(ev);
    var d = drag;
    drag = null;

    if (!d.active) {          // 单击：保留选区，等待第二次点击
      return;
    }
    selection.group.forEach(function (id) { cardEls[id].classList.remove('dragging'); });

    var lead = d.offsets[0];
    var target = targetAt(p.x + lead.x, p.y + lead.y, selection.group);
    if (target && E.legalTarget(state, selection.group, target)) {
      doMove(selection.from, selection.group, target);
    } else {
      // 放回原处
      selection.group.forEach(function (id, k) { cardEls[id].style.zIndex = ''; });
      layoutAll();
      highlightTargets(selection.group);
      playSound('error', true);
    }
  }

  function onCancel() {
    if (drag && drag.active) {
      selection.group.forEach(function (id) { cardEls[id].classList.remove('dragging'); });
      layoutAll();
    }
    drag = null;
  }

  // 双击：把顶牌直接送上基位（安全自动上牌之外的「手动上牌」）
  function onDblClick(ev) {
    if (busy) return;
    var p = toLocal(ev), hit = hitTest(p.x, p.y);
    if (!hit) return;
    var group = groupOf(hit);
    if (!group || group.length !== 1 || !E.isNumber(group[0])) return;
    var target = { type: 'found', suit: E.suitOf(group[0]) };
    if (E.legalTarget(state, group, target)) {
      doMove(fromOf(hit), group, target);
    } else {
      playSound('error', true);
    }
  }

  /* ------------------------------------------------------ 落点 / 高亮 */
  function pileDropRect(i) {
    var pile = state.piles[i];
    if (!pile.length) return [colX(i), TABLEAU_TOP, CARD_W, CARD_H];
    var ov = overlapFor(pile.length);
    var topY = TABLEAU_TOP + (pile.length - 1) * ov;
    return [colX(i), topY, CARD_W, Math.min(CARD_H + ov, BOARD_H - 24 - topY)];
  }

  function targetAt(x, y, group) {
    var i, best = null, bestA = 0;
    // (x, y) 是拖动中「领牌」的左上角
    var lead = [x, y, CARD_W, CARD_H];
    function score(rect) {
      return overlap(lead, rect) / (rect[2] * rect[3]);
    }    var cand = [];
    for (i = 0; i < 3; i++) cand.push({ t: { type: 'cell', idx: i }, rect: [colX(i), TOP + CARD_H / 3, CARD_W, CARD_H * 2 / 3] });
    cand.push({ t: { type: 'flower' }, rect: [colX(4), TOP + CARD_H / 3, CARD_W, CARD_H * 2 / 3] });
    if (group.length === 1 && E.isNumber(group[0])) {
      var suit = E.suitOf(group[0]);
      var fslot = slotForDrop(suit);
      if (fslot >= 0) {
        cand.push({ t: { type: 'found', suit: suit }, rect: [colX(5 + fslot), TOP + CARD_H / 3, CARD_W, CARD_H * 2 / 3] });
      }
    }
    for (i = 0; i < 8; i++) cand.push({ t: { type: 'pile', idx: i }, rect: pileDropRect(i) });

    for (i = 0; i < cand.length; i++) {
      if (!E.legalTarget(state, group, cand[i].t)) continue;
      var s = score(cand[i].rect);
      if (s >= 0.3 && s > bestA) { bestA = s; best = cand[i].t; }
    }
    return best;
  }

  // 矩形均为 [x, y, w, h]
  function overlap(a, b) {
    var w = Math.max(0, Math.min(a[0] + a[2], b[0] + b[2]) - Math.max(a[0], b[0]));
    var h = Math.max(0, Math.min(a[1] + a[3], b[1] + b[3]) - Math.max(a[1], b[1]));
    return w * h;
  }

  function ghostRect(t) {
    if (t.type === 'cell') return [colX(t.idx), TOP];
    if (t.type === 'flower') return [colX(4), TOP];
    if (t.type === 'found') {
      var slot = slotForDrop(t.suit);
      if (slot < 0) return null;
      return [colX(5 + slot), TOP];
    }
    if (t.type === 'pile') {
      var n = state.piles[t.idx].length;
      var ov = overlapFor(n + 1);
      return [colX(t.idx), n === 0 ? TABLEAU_TOP : TABLEAU_TOP + n * ov];
    }
    return null;
  }

  function showGhost(t) {
    var r = ghostRect(t);
    if (!r) { hideGhost(); return; }
    ghost.style.transform = 'translate(' + r[0] + 'px,' + r[1] + 'px)';
    ghost.classList.add('on');
  }
  function hideGhost() { ghost.classList.remove('on'); }

  function setTargetHighlight(t) {
    var els = document.querySelectorAll('.slot.target,.col.target');
    for (var i = 0; i < els.length; i++) els[i].classList.remove('target');
    if (!t) return;
    var sel = null;
    if (t.type === 'cell') sel = '.slot.cell[data-idx="' + t.idx + '"]';
    else if (t.type === 'pile') sel = '.col[data-idx="' + t.idx + '"]';
    else if (t.type === 'flower') sel = '.slot.flower';
    else if (t.type === 'found') {
      var slot = slotForDrop(t.suit);
      if (slot >= 0) sel = '.slot.found[data-idx="' + slot + '"]';
    }
    if (sel) {
      var el = document.querySelector(sel);
      if (el) el.classList.add('target');
    }
  }

  function highlightTargets(group) {
    var targets = E.legalTargets(state, group, selection ? selection.from : null);
    var i, els;
    els = document.querySelectorAll('.slot.target,.col.target');
    for (i = 0; i < els.length; i++) els[i].classList.remove('target');
    for (i = 0; i < targets.length; i++) {
      var t = targets[i], sel = null;
      if (t.type === 'cell') sel = '.slot.cell[data-idx="' + t.idx + '"]';
      else if (t.type === 'pile') sel = '.col[data-idx="' + t.idx + '"]';
      else if (t.type === 'flower') sel = '.slot.flower';
      else if (t.type === 'found') {
        var slot = slotForDrop(t.suit);
        if (slot >= 0) sel = '.slot.found[data-idx="' + slot + '"]';
      }
      if (sel) { var el = document.querySelector(sel); if (el) el.classList.add('target'); }
    }
  }

  function clearSelection() {
    selection = null;
    applyClasses();
    setTargetHighlight(null);
    hideGhost();
  }

  /* ============================================================ 动作 */
  function doMove(from, group, target) {
    if (busy) return;
    history.push(JSON.stringify(state));
    if (history.length > 400) history.shift();
    E.moveGroup(state, from, target);
    clearSelection();
    busy = true;
    playSound('pick', true);
    layoutAll();
    autoTimer = setTimeout(pumpAuto, 150);
  }

  function doConsolidate(suit) {
    if (busy) return;
    if (!E.canConsolidate(state, suit)) { playSound('error'); toast('这一色龙牌还没有全部露出，或没有可用的空格'); return; }
    history.push(JSON.stringify(state));
    var spot = -1;
    for (var i = 0; i < 3; i++) {
      if (state.locked[i]) continue;
      if (state.cells[i] === null || (E.isDragon(state.cells[i]) && E.suitOf(state.cells[i]) === suit)) { spot = i; break; }
    }
    var info = E.consolidate(state, suit);
    if (!info) return;
    clearSelection();
    // 四张龙牌一起飞向目标格，随后三张隐去
    info.cards.forEach(function (id, k) {
      var el = cardEls[id];
      vanishing[id] = true;
      el.style.display = '';
      el.style.transform = 'translate(' + colX(info.spot) + 'px,' + TOP + 'px)';
      el.style.zIndex = String(13 + k);
      el.classList.add('dragging');
      setTimeout(function () { el.classList.remove('dragging'); }, 200);
    });
    playSound('dragon');
    setTimeout(function () {
      info.cards.forEach(function (id) { delete vanishing[id]; });
      layoutAll();
    }, 320);
    setTimeout(function () { layoutAll(); afterTurn(); }, 340);
  }

  function undo() {
    if (busy || !history.length) return;
    state = JSON.parse(history.pop());
    clearSelection();
    layoutAll();
    updateUndoBtn();
    winbanner.classList.remove('on');
    playSound('pick');
    afterTurn();
  }

  function updateUndoBtn() {
    if (btnUndo) btnUndo.disabled = history.length === 0;
  }

  /* ============================================================ 机箱面板 */
  function bindChrome() {
    btnNew.addEventListener('click', function () {
      playSound('button');
      newGame(Math.floor(Math.random() * 999999) + 1);
    });
    btnRestart.addEventListener('click', function () { playSound('button'); restartDeal(); });
    btnUndo.addEventListener('click', function () { playSound('button'); undo(); });
    btnRules.addEventListener('click', function () { playSound('button'); overlay.classList.add('on'); });
    document.getElementById('rules-close').addEventListener('click', function () {
      playSound('button'); overlay.classList.remove('on');
    });
    document.getElementById('win-new').addEventListener('click', function () {
      playSound('button');
      winbanner.classList.remove('on');
      newGame(Math.floor(Math.random() * 999999) + 1);
    });
    document.getElementById('win-close').addEventListener('click', function () {
      playSound('button'); winbanner.classList.remove('on');
    });
    statSeed.addEventListener('click', function () {
      var txt = location.origin + location.pathname + '?seed=' + seed;
      copy(txt);
      toast('已复制本局链接（SEED ' + seed + '）');
    });
    statSeed.classList.add('clickable');

    toggleAuto.addEventListener('click', function () {
      prefs.auto = !prefs.auto;
      this.classList.toggle('on', prefs.auto);
      playSound('button');
      savePrefs();
      toast(prefs.auto ? '自动上牌：开（与原版一致）' : '自动上牌：关（可以手动把牌送上基位）');
      if (prefs.auto) { busy = true; pumpAuto(); }
    });
    toggleSolvable.addEventListener('click', function () {
      prefs.solvable = !prefs.solvable;
      this.classList.toggle('on', prefs.solvable);
      playSound('button');
      savePrefs();
      toast(prefs.solvable ? '新开牌局会尽量保证可解' : '新开牌局为完全随机（与原版一致）');
    });
    toggleSound.addEventListener('click', function () {
      muted = !muted;
      this.classList.toggle('on', !muted);
      savePrefs();
      if (!muted) playSound('button');
    });
    toggleAuto.classList.toggle('on', prefs.auto);
    toggleSolvable.classList.toggle('on', prefs.solvable);
    toggleSound.classList.toggle('on', !muted);
  }

  function bindKeys() {
    window.addEventListener('keydown', function (e) {
      if (e.target && /INPUT|TEXTAREA/.test(e.target.tagName)) return;
      var k = e.key.toLowerCase();
      if (k === 'escape') {
        if (overlay.classList.contains('on')) overlay.classList.remove('on');
        else if (winbanner.classList.contains('on')) winbanner.classList.remove('on');
        else clearSelection();
      } else if (k === 'u' || (e.ctrlKey && k === 'z')) { e.preventDefault(); undo(); }
      else if (k === 'n') newGame(Math.floor(Math.random() * 999999) + 1);
      else if (k === 'r') restartDeal();
      else if (k === 'i') overlay.classList.toggle('on');
      else if (k === 'm') { muted = !muted; toggleSound.classList.toggle('on', !muted); savePrefs(); }
      else if (k === 'a') {
        prefs.auto = !prefs.auto; toggleAuto.classList.toggle('on', prefs.auto);
        savePrefs();
        toast(prefs.auto ? '自动上牌：开' : '自动上牌：关');
        if (prefs.auto) { busy = true; pumpAuto(); }
      }
    });
  }

  /* ============================================================ 音效 */
  var actx = null;
  function ac() {
    if (muted) return null;
    try {
      if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)();
      if (actx.state === 'suspended') actx.resume();
      return actx;
    } catch (e) { return null; }
  }
  function tone(freq, dur, type, gain, delay) {
    var c = ac(); if (!c) return;
    var t0 = c.currentTime + (delay || 0);
    var o = c.createOscillator(), g = c.createGain();
    o.type = type || 'triangle';
    o.frequency.setValueAtTime(freq, t0);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain || 0.06, t0 + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(c.destination);
    o.start(t0); o.stop(t0 + dur + 0.02);
  }
  function noise(dur, gain, hp) {
    var c = ac(); if (!c) return;
    var n = Math.floor(c.sampleRate * dur);
    var buf = c.createBuffer(1, n, c.sampleRate);
    var d = buf.getChannelData(0);
    for (var i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    var src = c.createBufferSource(); src.buffer = buf;
    var f = c.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = hp || 900;
    var g = c.createGain(); g.gain.value = gain || 0.05;
    src.connect(f); f.connect(g); g.connect(c.destination);
    src.start();
  }
  function playSound(kind, soft) {
    if (muted) return;
    // 优先用程序目录 sfx/ 里的原版音效，没有才退回 WebAudio 合成音
    if (window.SZSFX && window.SZSFX.play(kind)) return;
    switch (kind) {
      case 'pick': soft ? noise(0.045, 0.035, 1400) : (noise(0.05, 0.05, 1200), tone(320, 0.05, 'triangle', 0.03)); break;
      case 'place': noise(0.06, 0.05, 900); tone(190, 0.09, 'sine', 0.045); break;
      case 'button': noise(0.03, 0.04, 1800); tone(520, 0.05, 'square', 0.02); break;
      case 'dragon': tone(392, 0.16, 'triangle', 0.05); tone(523, 0.16, 'triangle', 0.045, 0.07); tone(659, 0.2, 'triangle', 0.045, 0.14); break;
      case 'error': tone(140, 0.14, 'sawtooth', 0.035); break;
      case 'win': [523, 659, 784, 1046, 1318].forEach(function (f, i) { tone(f, 0.26, 'triangle', 0.05, i * 0.11); }); break;
    }
  }

  /* ============================================================ 杂项 */
  var toastTimer = null;
  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add('on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.remove('on'); }, 2600);
  }
  function copy(txt) {
    try {
      if (navigator.clipboard) { navigator.clipboard.writeText(txt); return; }
    } catch (e) { }
    var ta = document.createElement('textarea');
    ta.value = txt; document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); } catch (e) { }
    document.body.removeChild(ta);
  }
  function loadWins() {
    try { return parseInt(localStorage.getItem(WINS_KEY) || '0', 10) || 0; } catch (e) { return 0; }
  }
  function saveWins(n) {
    try { localStorage.setItem(WINS_KEY, String(n)); } catch (e) { }
  }
  function loadPrefs() {
    try {
      var p = JSON.parse(localStorage.getItem(PREFS_KEY) || '{}');
      if (typeof p.auto === 'boolean') prefs.auto = p.auto;
      if (typeof p.solvable === 'boolean') prefs.solvable = p.solvable;
      if (typeof p.sound === 'boolean') prefs.sound = p.sound;
    } catch (e) { }
    muted = !prefs.sound;
  }
  function savePrefs() {
    prefs.sound = !muted;
    try { localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)); } catch (e) { }
  }

  /* 渲染时跳过正在消失的龙牌 */
  var _place = place;
  place = function (id, x, y, z) {
    if (vanishing[id]) return;
    _place(id, x, y, z);
  };

  /* ============================================================ 调试 / 控制台 API */
  function clientPoint(x, y) {
    var r = board.getBoundingClientRect();
    var s = r.width / BOARD_W;
    return { x: r.left + x * s, y: r.top + y * s };
  }

  window.SZ = {
    engine: E, art: A, prefs: prefs,
    state: function () { return state; },
    seed: function () { return seed; },
    busy: function () { return busy; },
    moves: function () { return E.generateMoves(state); },
    solve: function (opts) { return E.solve(state, opts || {}); },
    layout: function () { layoutAll(); },
    undo: function () { undo(); },
    newGame: function (s) { newGame(s || (Math.floor(Math.random() * 999999) + 1)); },
    setState: function (s) { state = s; history = []; layoutAll(); afterTurn(); },
    cardRect: function (id) { return cardEls[id].getBoundingClientRect(); },
    // 把一次动作换算成屏幕坐标（供自动化测试/回放使用）
    pointFor: function (from, to) {
      var sx, sy, leadX, leadY, tx, ty, slot;
      if (from.type === 'pile') {
        var ov = overlapFor(state.piles[from.idx].length);
        leadX = colX(from.idx); leadY = TABLEAU_TOP + from.index * ov;
        sy = leadY + Math.min(8, ov * 0.4);
      } else {
        leadX = colX(from.idx); leadY = TOP; sy = TOP + CARD_H / 2;
      }
      sx = leadX + CARD_W / 2;
      if (to.type === 'pile') {
        var n = state.piles[to.idx].length;
        tx = colX(to.idx);
        ty = n === 0 ? TABLEAU_TOP : TABLEAU_TOP + n * overlapFor(n + 1);
      } else if (to.type === 'cell') { tx = colX(to.idx); ty = TOP; }
      else if (to.type === 'flower') { tx = colX(4); ty = TOP; }
      else {
        slot = slotForDrop(to.suit);
        tx = colX(5 + (slot < 0 ? 0 : slot)); ty = TOP;
      }
      var offX = sx - leadX, offY = sy - leadY;
      return {
        start: clientPoint(sx, sy),
        end: clientPoint(tx + offX, ty + offY),
        endTap: clientPoint(tx + CARD_W / 2, ty + CARD_H / 2),
        startTap: clientPoint(sx, sy)
      };
    },
    // 直接在规则层执行一串动作（用于演示/测试），随后结算自动上牌
    play: function (moves) {
      for (var i = 0; i < moves.length; i++) {
        var m = moves[i];
        if (m.consolidate !== undefined) {
          if (!E.canConsolidate(state, m.consolidate)) break;
          E.consolidate(state, m.consolidate);
        } else {
          var lifted = E.takeGroup(state, m.from);
          if (!m.group || lifted.join(',') !== m.group.join(',')) { E.putGroup(state, lifted, m.from); break; }
          E.putGroup(state, lifted, m.to);
        }
        E.applyAutoMoves(state);
      }
      layoutAll(); afterTurn();
    }
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
