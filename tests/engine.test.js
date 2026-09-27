/* SHENZHEN SOLITAIRE — 引擎单元测试 (node tests/engine.test.js) */
'use strict';
const E = require('../src/engine.js');

let pass = 0, fail = 0;
function ok(cond, msg) {
  if (cond) { pass++; }
  else { fail++; console.log('  ✗ ' + msg); }
}
function eq(a, b, msg) { ok(a === b, msg + '  (got ' + JSON.stringify(a) + ', want ' + JSON.stringify(b) + ')'); }
function section(t) { console.log('\n== ' + t + ' =='); }

/* 便捷构造：牌面记号 ------------------------------------------------------ */
const SU = { r: 0, g: 1, b: 2 };            // r=筒(红) g=索(绿) b=萬(黑)
function id(suit, rank) { return E.CARDS.find(c => c.suit === suit && c.rank === rank).id; }
function did(suit) { return E.CARDS.find(c => c.suit === suit && c.rank === 'D').id; }
const FID = 39;

/* ------------------------------------------------------------ 牌堆构成 */
section('牌堆构成');
eq(E.CARDS.length, 40, '共 40 张');
eq(new Set(E.CARDS.map(c => c.id)).size, 40, 'id 不重复');
eq(E.CARDS.filter(c => typeof c.rank === 'number').length, 27, '27 张数字牌');
eq(E.CARDS.filter(c => c.rank === 'D').length, 12, '12 张龙牌');
eq(E.CARDS.filter(c => c.rank === 'F').length, 1, '1 张花牌');
[0, 1, 2].forEach(s => {
  eq(E.CARDS.filter(c => c.suit === s && c.rank === 'D').length, 4, '花色 ' + s + ' 有 4 张龙');
  eq(E.CARDS.filter(c => c.suit === s && typeof c.rank === 'number').length, 9, '花色 ' + s + ' 有 9 张数字');
});

/* ------------------------------------------------------------ 发牌 */
section('发牌');
for (const seed of [1, 2, 12345, 999999, 4294967290]) {
  const raw = E.dealPiles(seed);
  const ids = [];
  raw.piles.forEach(p => p.forEach(c => ids.push(c)));
  eq(raw.piles.length, 8, 'seed ' + seed + ': 8 列');
  ok(raw.piles.every(p => p.length === 5), 'seed ' + seed + ': 每列 5 张');
  eq(new Set(ids).size, 40, 'seed ' + seed + ': 40 张牌都在桌面上');

  // 开局自动上牌后牌数依然守恒（基位 + 花位 + 桌面 + 空格 + 锁死格里的 4 张龙）
  const g = E.createGame(seed);
  const s2 = g.state;
  let total = 0;
  s2.piles.forEach(p => total += p.length);
  s2.cells.forEach(c => { if (c !== null) total++; });
  s2.foundTop.forEach(t => total += t);
  total += (s2.flower ? 1 : 0);
  for (let i = 0; i < 3; i++) if (s2.locked[i]) total += 3; // 空格里只记了 1 张代表牌
  eq(total, 40, 'seed ' + seed + ': 自动上牌后牌数守恒');
}
{
  const a = E.createGame(777), b = E.createGame(777);
  eq(E.serialize(a.state), E.serialize(b.state), '同种子发牌一致');
  const c = E.createGame(778);
  ok(E.serialize(a.state) !== E.serialize(c.state), '不同种子发牌不同');
}

/* ------------------------------------------------------------ 连叠判断 */
section('拿起一叠的合法性');
{
  const s = E.newState();
  s.piles[0] = [id(0, 3), id(1, 2), id(2, 1)];     // r3 g2 b1 —— 合法交替连叠
  ok(E.canLift(s, 0, 0), '整叠可拿');
  ok(E.canLift(s, 0, 1), '子叠可拿');
  ok(E.canLift(s, 0, 2), '顶牌可拿');
  eq(E.groupFromPile(s, 0, 1).length, 2, '自 index 1 起拿到 2 张');

  s.piles[1] = [id(0, 3), id(0, 2)];               // 同花色 -> 非法连叠
  ok(!E.canLift(s, 1, 0), '同花色不能整叠拿');
  ok(E.canLift(s, 1, 1), '顶牌仍可拿');

  s.piles[2] = [id(0, 5), id(1, 2)];               // 点数不连续
  ok(!E.canLift(s, 2, 0), '点数不连续不能整叠拿');

  s.piles[3] = [id(0, 3), did(1)];                 // 龙牌上面不能叠东西
  ok(!E.canLift(s, 3, 0), '龙牌上的数字牌不能带龙一起拿');
  ok(E.canLift(s, 3, 1), '龙牌本身可拿');

  s.piles[4] = [id(0, 3), FID];
  ok(!E.canLift(s, 4, 0), '花牌上的牌不能带花一起拿');
}

/* ------------------------------------------------------------ 落点合法性 */
section('落点合法性');
{
  const s = E.newState();
  s.piles[0] = [id(0, 5)];                     // 5 筒
  ok(E.legalTarget(s, [id(1, 4)], { type: 'pile', idx: 0 }), '4 索可压 5 筒（异色且小 1）');
  ok(E.legalTarget(s, [id(2, 4)], { type: 'pile', idx: 0 }), '4 萬也可压 5 筒（异色且小 1）');
  ok(!E.legalTarget(s, [id(0, 4)], { type: 'pile', idx: 0 }), '4 筒不可压 5 筒（同色）');
  ok(!E.legalTarget(s, [id(1, 3)], { type: 'pile', idx: 0 }), '3 索不可压 5 筒（点数不接）');
  ok(!E.legalTarget(s, [did(1)], { type: 'pile', idx: 0 }), '龙牌不能压数字牌');
  ok(!E.legalTarget(s, [FID], { type: 'pile', idx: 0 }), '花牌不能压数字牌');

  s.piles[1] = [did(0)];
  ok(!E.legalTarget(s, [id(1, 4)], { type: 'pile', idx: 1 }), '数字牌不能压龙牌');
  ok(E.legalTarget(s, [id(1, 4)], { type: 'pile', idx: 2 }), '空列可放任意单张');
  ok(E.legalTarget(s, [id(1, 4), id(2, 3)], { type: 'pile', idx: 2 }), '空列可放整叠');
  ok(E.legalTarget(s, [did(2)], { type: 'pile', idx: 2 }), '空列可放龙牌');
  ok(E.legalTarget(s, [FID], { type: 'pile', idx: 2 }), '空列可放花牌');

  ok(E.legalTarget(s, [id(0, 4)], { type: 'cell', idx: 0 }), '空格可放单张');
  ok(!E.legalTarget(s, [id(0, 4), id(1, 3)], { type: 'cell', idx: 0 }), '空格不可放整叠');
  s.cells[0] = id(0, 9);
  ok(!E.legalTarget(s, [id(0, 4)], { type: 'cell', idx: 0 }), '已占用的空格不可放');
  s.locked[1] = true;
  ok(!E.legalTarget(s, [id(0, 4)], { type: 'cell', idx: 1 }), '锁死的空格不可放');

  ok(E.legalTarget(s, [id(0, 1)], { type: 'found', suit: 0 }), '1 可以起基位');
  ok(!E.legalTarget(s, [id(0, 2)], { type: 'found', suit: 0 }), '2 不能先起基位');
  ok(!E.legalTarget(s, [id(1, 1)], { type: 'found', suit: 0 }), '別色 1 不能放到该花色基位');
  s.foundTop[0] = 1; s.foundSlot[0] = 0;
  ok(E.legalTarget(s, [id(0, 2)], { type: 'found', suit: 0 }), '1 上去后 2 可上');
  ok(!E.legalTarget(s, [id(0, 3)], { type: 'found', suit: 0 }), '跳号不可上');
  ok(!E.legalTarget(s, [did(0)], { type: 'found', suit: 0 }), '龙牌不能上基位');
}

/* ------------------------------------------------------------ 自动上牌 */
section('自动上牌（安全规则）');
{
  const s = E.newState();
  s.piles[0] = [id(0, 2)];                     // 2 筒，其他花色都还没开始
  s.foundTop = [1, 0, 0]; s.foundSlot = [0, null, null];
  eq(E.autoMoveStep(s), null, '其他花色没到 1 时 2 不会自动上');
  ok(s.piles[0].length === 1, '牌还在原地');

  s.foundTop = [1, 1, 1];
  const ev = E.autoMoveStep(s);
  ok(ev && ev.card === id(0, 2), '三色都到 1 之后 2 自动上');
  eq(s.foundTop[0], 2, '基位推进到 2');

  const s2 = E.newState();
  s2.piles[3] = [id(2, 1)];
  const ev2 = E.autoMoveStep(s2);
  ok(ev2 && ev2.card === id(2, 1), '1 无条件自动上');
  eq(s2.foundSlot[0], 2, '第一个空格记为该花色的基位');

  const s3 = E.newState();
  s3.piles[5] = [id(0, 5), FID];
  const ev3 = E.autoMoveStep(s3);
  ok(ev3 && ev3.card === FID && s3.flower, '花牌露出后自动归位');

  const s4 = E.newState();
  s4.cells[2] = id(1, 3);
  s4.foundTop = [2, 2, 2];
  const ev4 = E.autoMoveStep(s4);
  ok(ev4 && ev4.card === id(1, 3), '空格里的牌也会自动上（其他两色 >= 2）');
  ok(s4.cells[2] === null && s4.foundTop[1] === 3, '空格已空出、基位推进');
}

/* ------------------------------------------------------------ 龙牌合并 */
section('龙牌合并');
{
  const s = E.newState();
  // 三张绿龙在列顶，一张在空格
  s.piles[0] = [id(0, 9), did(1)];
  s.piles[1] = [did(1)];
  s.piles[2] = [did(1)];
  s.cells[0] = did(1);
  eq(E.visibleDragonCount(s, 1), 4, '四张绿龙都露出');
  ok(E.canConsolidate(s, 1), '可以合并');
  ok(!E.canConsolidate(s, 0), '红龙不足 4 张不能合并');

  const res = E.consolidate(s, 1);
  ok(res && res.cards.length === 4, '合并了 4 张');
  eq(s.cells[0], did(1), '代表牌放进空格 0');
  ok(s.locked[0] && s.lockSuit[0] === 1, '空格 0 被锁死');
  eq(E.visibleDragonCount(s, 1), 1, '桌面上只剩代表牌这一张');
  ok(!E.canConsolidate(s, 1), '已合并过不能再合并');

  // 已锁死时该花色不可再合并
  const s2 = E.newState();
  s2.locked[0] = true; s2.cells[0] = did(1); s2.lockSuit[0] = 1;
  s2.piles[1] = [did(1)]; s2.piles[2] = [did(1)]; s2.piles[3] = [did(1)];
  ok(!E.canConsolidate(s2, 1), '该色已锁死不重复合并');

  // 三张在列顶 + 一张在空格里 —— 可以用这个空格合并
  const s3 = E.newState();
  s3.piles[0] = [did(0)]; s3.piles[1] = [did(0)]; s3.piles[2] = [did(0)];
  s3.cells[0] = did(0); s3.cells[1] = id(1, 5); s3.cells[2] = id(2, 7);
  ok(E.canConsolidate(s3, 0), '某个空格里已有同色龙牌时可以合并');
  s3.cells[0] = id(0, 4);
  ok(!E.canConsolidate(s3, 0), '只剩三张露出时不能合并');
  s3.piles[3] = [did(0)];
  ok(!E.canConsolidate(s3, 0), '四张都露出但三个空格都被非龙牌占满时不能合并');
}

/* ------------------------------------------------------------ 胜负 */
section('胜负判定');
{
  const s = E.newState();
  s.foundTop = [9, 9, 9]; s.foundSlot = [0, 1, 2]; s.flower = true;
  s.locked = [true, true, true]; s.cells = [did(0), did(1), did(2)];
  s.lockSuit = [0, 1, 2];
  ok(E.isWin(s), '全部归位即获胜');
  s.piles[4] = [id(0, 3)];
  ok(!E.isWin(s), '桌面还有牌不算胜');
  s.piles[4] = [];
  s.flower = false;
  ok(!E.isWin(s), '花牌未归位不算胜');
  s.flower = true;
  s.locked[2] = false;
  ok(!E.isWin(s), '还有龙未合并不算胜');
}

/* ------------------------------------------------------------ 撤销快照 */
section('快照 / 序列化');
{
  const g = E.createGame(4242);
  const snap = E.cloneState(g.state);
  const before = E.serialize(g.state);
  const mv = E.moveGroup(g.state, { type: 'pile', idx: 0, index: 3 }, { type: 'pile', idx: 7 });
  ok(mv.length === 2, '移动了 2 张（若合法）');
  ok(E.serialize(g.state) !== before, '状态已改变');
  eq(E.serialize(snap), before, '快照复制不受影响');
}

/* ------------------------------------------------------------ 不变量扫描 */
section('局面不变量（发牌 + 开局自动上牌之后）');
{
  let bad = 0, firstBad = null, total = 0;
  for (let seed = 1; seed <= 5000; seed++) {
    total++;
    const s = E.createGame(seed).state;
    const counts = {};
    const add = id => { counts[id] = (counts[id] || 0) + 1; };
    s.piles.forEach(p => p.forEach(add));
    s.cells.forEach(c => { if (c !== null) add(c); });
    s.foundTop.forEach((top, suit) => { for (let j = 1; j <= top; j++) add(cardIdRaw(suit, j)); });
    if (s.flower) add(39);

    const probs = [];
    const dup = Object.keys(counts).filter(k => counts[k] > 1);
    if (dup.length) probs.push('重复牌 id ' + dup.join(','));
    for (let suit = 0; suit < 3; suit++) {
      if (s.foundTop[suit] > 0 && s.foundSlot.indexOf(suit) === -1) probs.push('花色 ' + suit + ' 上了基位却没有格子');
      if (s.foundTop[suit] > 9) probs.push('花色 ' + suit + ' 超过 9');
    }
    let n = 0;
    s.piles.forEach(p => n += p.length);
    s.cells.forEach(c => { if (c !== null) n++; });
    s.foundTop.forEach(t => n += t);
    if (s.flower) n++;
    for (let i = 0; i < 3; i++) if (s.locked[i]) n += 3;   // 锁死的格子里是 4 张龙
    if (n !== 40) probs.push('牌数合计 ' + n);

    if (probs.length) { bad++; if (!firstBad) firstBad = 'seed ' + seed + ' -> ' + probs.join('；'); }
  }
  console.log('  扫描 ' + total + ' 局');
  ok(bad === 0, '5000 局全部满足不变量' + (firstBad ? '（首个异常：' + firstBad + '）' : ''));
}
function cardIdRaw(suit, rank) { return suit * 13 + (rank - 1); }

/* ------------------------------------------------------------ 求解器 */
section('求解器（解可回放 + 可解率）');
{
  let solved = 0, tried = 0;
  for (let k = 0; k < 12; k++) {
    const g = E.createGame(1000 + k * 37);
    tried++;
    const sol = E.solve(g.state, { nodes: 400000, ms: 4000 });
    if (!sol) continue;
    // 回放验证：每一步都要通过合法性校验，并结算强制的自动上牌
    const s = E.cloneState(g.state);
    for (const m of sol) {
      if (m.consolidate !== undefined) {
        const r = E.consolidate(s, m.consolidate);
        ok(r !== null, 'seed ' + g.seed + ': 合并动作合法');
      } else {
        ok(E.legalTarget(s, m.group, m.to), 'seed ' + g.seed + ': 目标落点合法');
        const lifted = E.takeGroup(s, m.from);
        ok(lifted.join(',') === m.group.join(','), 'seed ' + g.seed + ': 拿起的是同一叠牌');
        E.putGroup(s, lifted, m.to);
      }
      E.applyAutoMoves(s);
    }
    if (E.isWin(s)) solved++;
    else ok(false, 'seed ' + g.seed + ': 解回放后应当获胜');
  }
  console.log('  解出 ' + solved + '/' + tried + ' 局');
  ok(solved >= 9, '至少解出 9/12 局');
}

section('保证可解发牌');
{
  const g = E.createSolvableGame(2024, { tries: 6, ms: 1500, nodes: 120000 });
  ok(g !== null, '返回牌局');
  if (g.solution) {
    const s = E.cloneState(g.state);
    for (const m of g.solution) {
      if (m.consolidate !== undefined) E.consolidate(s, m.consolidate);
      else {
        ok(E.legalTarget(s, m.group, m.to), '保证可解牌局里的落点合法');
        E.putGroup(s, E.takeGroup(s, m.from), m.to);
      }
      E.applyAutoMoves(s);
    }
    ok(E.isWin(s), '保证可解的牌局确实能赢');
  }
}

console.log('\n通过 ' + pass + ' 项，失败 ' + fail + ' 项');
process.exit(fail ? 1 : 0);
