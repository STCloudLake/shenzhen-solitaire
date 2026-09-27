/* ============================================================================
 * 端到端测试：用 Edge 无头模式 + CDP 真正操作页面（拖拽 / 点选 / 按钮）
 * 运行： node tests/e2e.js
 * ==========================================================================*/
'use strict';
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

const EDGE = process.env.EDGE || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 9412;
const HTML = 'file:///' + path.resolve(__dirname, '..', 'shenzhen-solitaire.html').replace(/\\/g, '/').replace(/ /g, '%20');

let pass = 0, fail = 0;
function ok(c, m) { if (c) { pass++; } else { fail++; console.log('  ✗ ' + m); } }
function section(t) { console.log('\n== ' + t + ' =='); }
const sleep = ms => new Promise(r => setTimeout(r, ms));

class CDP {
  constructor(url) {
    this.id = 0; this.pending = new Map(); this.errors = [];
    this.ws = new WebSocket(url);
    this.ws.addEventListener('message', ev => {
      const msg = JSON.parse(ev.data);
      if (msg.id && this.pending.has(msg.id)) {
        const p = this.pending.get(msg.id); this.pending.delete(msg.id);
        msg.error ? p.rej(new Error(JSON.stringify(msg.error))) : p.res(msg.result);
      } else if (msg.method === 'Runtime.exceptionThrown') {
        const d = msg.params.exceptionDetails;
        this.errors.push((d.exception && d.exception.description) || d.text);
      } else if (msg.method === 'Log.entryAdded' && msg.params.entry.level === 'error') {
        this.errors.push(msg.params.entry.text);
      } else if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
        this.errors.push(msg.params.args.map(a => a.value || a.description).join(' '));
      }
    });
    this.ready = new Promise((res, rej) => {
      this.ws.addEventListener('open', res);
      this.ws.addEventListener('error', rej);
    });
  }
  send(method, params) {
    const id = ++this.id;
    return new Promise((res, rej) => {
      this.pending.set(id, { res, rej });
      this.ws.send(JSON.stringify({ id, method, params: params || {} }));
    });
  }
  async eval(expr) {
    const r = await this.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error('页面内报错: ' + JSON.stringify(r.exceptionDetails.exception || r.exceptionDetails.text));
    return r.result.value;
  }
  async mouse(type, x, y, buttons, clickCount) {
    await this.send('Input.dispatchMouseEvent', {
      type, x: Math.round(x), y: Math.round(y), button: 'left',
      buttons: buttons === undefined ? 1 : buttons,
      clickCount: clickCount || 1, pointerType: 'mouse'
    });
  }
  async dblclick(x, y) {
    await this.mouse('mousePressed', x, y, 1, 1); await sleep(25);
    await this.mouse('mouseReleased', x, y, 0, 1); await sleep(60);
    await this.mouse('mousePressed', x, y, 1, 2); await sleep(25);
    await this.mouse('mouseReleased', x, y, 0, 2); await sleep(250);
  }
  async drag(a, b) {
    await this.mouse('mousePressed', a.x, a.y, 1);
    await sleep(30);
    for (let k = 1; k <= 8; k++) {
      await this.mouse('mouseMoved', a.x + (b.x - a.x) * k / 8, a.y + (b.y - a.y) * k / 8, 1);
      await sleep(14);
    }
    await this.mouse('mouseReleased', b.x, b.y, 0);
    await sleep(260);
  }
  async click(x, y) {
    await this.mouse('mousePressed', x, y, 1);
    await sleep(30);
    await this.mouse('mouseReleased', x, y, 0);
    await sleep(220);
  }
  async waitIdle(timeout) {
    const t0 = Date.now();
    while (Date.now() - t0 < (timeout || 4000)) {
      if (!(await this.eval('SZ.busy()'))) return true;
      await sleep(80);
    }
    return false;
  }
  async waitFor(expr, timeout) {
    const t0 = Date.now();
    for (;;) {
      try { if (await this.eval(expr)) return true; } catch (e) { }
      if (Date.now() - t0 > (timeout || 8000)) return false;
      await sleep(120);
    }
  }
}

(async function main() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sz-e2e-'));
  const proc = spawn(EDGE, [
    '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    '--remote-debugging-port=' + PORT, '--user-data-dir=' + tmp, '--window-size=1400,900', HTML
  ], { stdio: 'ignore' });

  let target = null;
  for (let i = 0; i < 100 && !target; i++) {
    try {
      const list = await (await fetch('http://127.0.0.1:' + PORT + '/json/list')).json();
      target = list.find(t => t.type === 'page' && /shenzhen-solitaire/.test(t.url));
    } catch (e) { }
    if (!target) await sleep(300);
  }
  if (!target) { console.log('无法启动无头浏览器'); proc.kill(); process.exit(1); }

  const cdp = new CDP(target.webSocketDebuggerUrl);
  await cdp.ready;
  await cdp.send('Runtime.enable');
  await cdp.send('Log.enable');
  await sleep(400);
  // 等页面把牌发完（开局还会跑一遍「保证可解」的求解）
  await cdp.waitFor("typeof SZ !== 'undefined' && SZ.seed() > 0", 15000);
  await cdp.waitFor("[...document.querySelectorAll('.card')].filter(e=>e.style.display!=='none').length === 40", 15000);
  await cdp.waitIdle(15000);

  try {
    /* ---------------------------------------------------------- 初始状态 */
    section('页面加载 / 发牌');
    ok(await cdp.eval("document.querySelectorAll('.card').length") === 40, '渲染出 40 张牌');
    const shown = await cdp.eval("[...document.querySelectorAll('.card')].filter(e=>e.style.display!=='none').length");
    ok(shown === 40, '40 张牌都在场上（实际 ' + shown + '）');
    const seed0 = await cdp.eval('SZ.seed()');
    ok(seed0 > 0, '开局有 SEED：' + seed0);
    ok(await cdp.waitIdle(), '开局自动上牌已结算完毕');
    ok(await cdp.eval("document.getElementById('hintline').textContent.length > 0"), '底部状态行有内容');
    ok(await cdp.eval("document.querySelectorAll('.dbtn').length") === 3, '三个龙牌按钮');

    // 关掉自动上牌，便于精确断言
    await cdp.eval('SZ.prefs.auto = false');

    /* ---------------------------------------------------------- 拖拽移动 */
    section('拖拽移动');
    const mv = await cdp.eval(`(()=>{
      const ms = SZ.moves().filter(m => !m.consolidate);
      if (!ms.length) return null;
      const m = ms.find(x => x.from.type==='pile' && x.to.type==='pile') || ms[0];
      return { from:m.from, to:m.to, group:m.group, pts:SZ.pointFor(m.from,m.to) };
    })()`);
    ok(!!mv, '存在可拖拽的移动');
    if (mv) {
      const before = JSON.parse(await cdp.eval('JSON.stringify(SZ.state().piles)'));
      await cdp.drag(mv.pts.start, mv.pts.end);
      const after = JSON.parse(await cdp.eval('JSON.stringify(SZ.state().piles)'));
      ok(JSON.stringify(after) !== JSON.stringify(before), '拖拽后牌局发生变化');
      if (mv.to.type === 'pile') {
        const top = after[mv.to.idx][after[mv.to.idx].length - 1];
        ok(mv.group.indexOf(top) !== -1, '被搬动的牌出现在目标列顶部');
      } else {
        ok(await cdp.eval('SZ.state().foundTop.reduce((a,b)=>a+b,0) + SZ.state().cells.filter(c=>c!==null).length > 0'), '牌被送到了指定位置');
      }
      if (mv.from.type === 'pile') {
        ok(after[mv.from.idx].length === before[mv.from.idx].length - mv.group.length,
          '来源列的牌数减少了 ' + mv.group.length);
      }
    }

    /* ---------------------------------------------------------- 点选移动 */
    section('点选移动');
    const mv2 = await cdp.eval(`(()=>{
      const E = SZ.engine, s = E.newState();
      const id = (su, r) => E.CARDS.find(c => c.suit===su && c.rank===r).id;
      s.piles[0] = [id(0,5)];
      s.piles[1] = [id(2,4)];
      SZ.setState(s);
      return { from:{type:'pile',idx:1,index:0}, to:{type:'pile',idx:0}, group:[id(2,4)], pts:SZ.pointFor({type:'pile',idx:1,index:0},{type:'pile',idx:0}) };
    })()`);
    ok(!!mv2, '构造出可点选的单张移动');
    if (mv2) {
      const before = await cdp.eval('JSON.stringify(SZ.state().piles)');
      await cdp.click(mv2.pts.startTap.x, mv2.pts.startTap.y);
      ok(await cdp.eval('!!document.querySelector(".card.selected")'), '点击后出现选中高亮');
      ok(await cdp.eval('document.querySelectorAll(".col.target,.slot.target").length > 0'), '高亮可落点');
      await cdp.click(mv2.pts.endTap.x, mv2.pts.endTap.y);
      const after = await cdp.eval('JSON.stringify(SZ.state().piles)');
      ok(after !== before, '点选落牌后牌局发生变化');
      ok(!(await cdp.eval('!!document.querySelector(".card.selected")')), '落牌后取消选中');
      ok(await cdp.eval('SZ.state().piles[0].length === 2'), '4 索 压到了 5 筒 上');
    }

    /* ---------------------------------------------------------- 撤销 */
    section('撤销');
    const beforeUndo = await cdp.eval('JSON.stringify(SZ.state().piles)');
    await cdp.click(
      (await cdp.eval("(()=>{const r=document.getElementById('btn-undo').getBoundingClientRect();return r.left+r.width/2})()")),
      (await cdp.eval("(()=>{const r=document.getElementById('btn-undo').getBoundingClientRect();return r.top+r.height/2})()"))
    );
    const afterUndo = await cdp.eval('JSON.stringify(SZ.state().piles)');
    ok(afterUndo !== beforeUndo, '撤销后牌局回到上一步');

    /* ---------------------------------------------------------- 龙牌合并 */
    section('龙牌合并');
    const setup = await cdp.eval(`(()=>{
      const E = SZ.engine;
      const s = E.newState();
      const d = suit => E.CARDS.find(c => c.suit===suit && c.rank==='D').id;
      s.piles[0] = [d(0)]; s.piles[1] = [d(0)]; s.piles[2] = [d(0)]; s.piles[3] = [d(0)];
      s.piles[4] = [E.CARDS.find(c=>c.suit===1&&c.rank===5).id];
      SZ.setState(s);
      return { can: E.canConsolidate(s, 0) };
    })()`);
    ok(setup.can === true, '四张红龙露出时按钮可用');
    const btn = await cdp.eval(`(()=>{const r=document.querySelector('.dbtn[data-suit="0"]').getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2}})()`);
    await cdp.click(btn.x, btn.y);
    await sleep(500);
    ok(await cdp.eval('SZ.state().locked[0] === true'), '按下按钮后空格被锁死');
    ok(await cdp.eval('SZ.state().lockSuit[0] === 0'), '锁死的空格记录为红龙');
    const btnCls = await cdp.eval("[...document.querySelectorAll('.dbtn')[0].classList].join(' ')");
    ok(/done/.test(btnCls), '该颜色按钮变为已用状态');

    /* ---------------------------------------------------------- 双击上基位 */
    section('双击手动上基位');
    const mv3 = await cdp.eval(`(()=>{
      const E = SZ.engine, s = E.newState();
      s.foundSlot = [0,1,2]; s.foundTop = [1,1,1];
      s.cells = [E.CARDS.find(c=>c.suit===0&&c.rank==='D').id, E.CARDS.find(c=>c.suit===1&&c.rank==='D').id, E.CARDS.find(c=>c.suit===2&&c.rank==='D').id];
      s.locked = [true,true,true]; s.lockSuit=[0,1,2]; s.flower = true;
      s.piles[0] = [E.CARDS.find(c=>c.suit===2&&c.rank===2).id];
      SZ.setState(s);
      return SZ.pointFor({type:'pile',idx:0,index:0}, {type:'found',suit:2}).startTap;
    })()`);
    await cdp.dblclick(mv3.x, mv3.y);
    await sleep(200);
    ok(await cdp.eval('SZ.state().foundTop[2] === 2'), '双击把 2 萬 送上基位');

    /* ---------------------------------------------------------- 胜利流程 */
    section('胜利流程');
    await cdp.eval(`(()=>{
      const E = SZ.engine, s = E.newState();
      const d = suit => E.CARDS.find(c => c.suit===suit && c.rank==='D').id;
      s.foundSlot=[0,1,2]; s.foundTop=[8,9,9]; s.flower=true;
      s.locked=[true,true,true]; s.lockSuit=[0,1,2];
      s.cells=[d(0),d(1),d(2)];
      s.piles[0]=[E.CARDS.find(c=>c.suit===0&&c.rank===9).id];
      SZ.setState(s);
    })()`);
    ok(await cdp.eval('SZ.engine.isWin(SZ.state()) === false'), '差一张时还没赢');
    const win = await cdp.eval("(()=>SZ.pointFor({type:'pile',idx:0,index:0},{type:'found',suit:0}))()");
    await cdp.drag(win.start, win.end);
    await sleep(400);
    ok(await cdp.eval('SZ.engine.isWin(SZ.state()) === true'), '最后一拖让牌局达成胜利条件');
    ok(await cdp.eval("document.getElementById('winbanner').classList.contains('on')"), '弹出胜利横幅');
    const wins = await cdp.eval("parseInt(document.getElementById('stat-wins').textContent,10)");
    ok(wins >= 1, 'WIN COUNT 增加（' + wins + '）');

    /* ---------------------------------------------------------- 新游戏 */
    section('新游戏 / 种子');
    await cdp.eval("document.getElementById('win-close').click()");
    const s1 = await cdp.eval('SZ.seed()');
    await cdp.eval("document.getElementById('btn-new').click()");
    await sleep(600);
    const s2 = await cdp.eval('SZ.seed()');
    ok(s1 !== s2, '新游戏的 SEED 不同');
    ok(await cdp.eval("[...document.querySelectorAll('.card')].filter(e=>e.style.display!=='none').length") === 40, '新局仍然 40 张牌');

    /* ---------------------------------------------------------- 说明面板 */
    section('说明面板');
    await cdp.eval("document.getElementById('btn-rules').click()");
    ok(await cdp.eval("document.getElementById('overlay').classList.contains('on')"), 'INSTRUCTIONS 面板打开');
    await cdp.eval("document.getElementById('rules-close').click()");
    ok(!(await cdp.eval("document.getElementById('overlay').classList.contains('on')")), '面板可以关闭');

    /* ---------------------------------------------------------- 控制台错误 */
    section('运行时错误');
    const errs = cdp.errors.filter(e => !/favicon|net::ERR_FILE_NOT_FOUND/i.test(e));
    ok(errs.length === 0, '页面没有 JS 报错' + (errs.length ? '：' + errs.slice(0, 3).join(' | ') : ''));
  } catch (e) {
    fail++;
    console.log('  ✗ 测试异常: ' + e.message);
  }

  try { await cdp.send('Browser.close'); } catch (e) { }
  proc.kill();
  await sleep(300);
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) { }

  console.log('\n通过 ' + pass + ' 项，失败 ' + fail + ' 项');
  process.exit(fail ? 1 : 0);
})();
