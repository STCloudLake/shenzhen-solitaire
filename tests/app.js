/* ============================================================================
 * 桌面版验证：直接启动打包好的 exe（带远程调试端口），检查
 *   1) 程序能起来、游戏能玩（拖拽/点选）
 *   2) 音乐与音效确实从程序目录读到并解码成功
 *   3) 没有 Node 权限泄漏（contextIsolation）
 *   4) 战绩能持久化（重启后仍在）
 * 用法: node tests/app.js
 * ==========================================================================*/
'use strict';
const { spawn, spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const ROOT = path.resolve(__dirname, '..');
const APPDIR = path.join(ROOT, 'dist', 'SHENZHEN SOLITAIRE');
const EXE = path.join(APPDIR, 'SHENZHEN SOLITAIRE.exe');
const RES = path.join(APPDIR, 'resources', 'app');
const PORT = 9418;

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  ✗ ' + m); } };
const section = t => console.log('\n== ' + t + ' ==');
const sleep = ms => new Promise(r => setTimeout(r, ms));

class CDP {
  constructor(url) {
    this.id = 0; this.pending = new Map(); this.errors = [];
    this.ws = new WebSocket(url);
    this.ws.addEventListener('message', ev => {
      const m = JSON.parse(ev.data);
      if (m.id && this.pending.has(m.id)) {
        const p = this.pending.get(m.id); this.pending.delete(m.id);
        m.error ? p.rej(new Error(JSON.stringify(m.error))) : p.res(m.result);
      } else if (m.method === 'Runtime.exceptionThrown') {
        const d = m.params.exceptionDetails;
        this.errors.push((d.exception && d.exception.description) || d.text);
      } else if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error') {
        this.errors.push(m.params.entry.text);
      }
    });
    this.ready = new Promise(r => this.ws.addEventListener('open', r));
  }
  send(method, params) {
    const id = ++this.id;
    return new Promise((res, rej) => { this.pending.set(id, { res, rej }); this.ws.send(JSON.stringify({ id, method, params: params || {} })); });
  }
  async eval(e) {
    const r = await this.send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error('页面报错: ' + JSON.stringify(r.exceptionDetails.exception || r.exceptionDetails.text));
    return r.result.value;
  }
  async mouse(type, x, y, buttons, clickCount) {
    await this.send('Input.dispatchMouseEvent', {
      type, x: Math.round(x), y: Math.round(y), button: 'left',
      buttons: buttons === undefined ? 1 : buttons, clickCount: clickCount || 1, pointerType: 'mouse'
    });
  }
  async drag(a, b) {
    await this.mouse('mousePressed', a.x, a.y, 1);
    await sleep(30);
    for (let k = 1; k <= 8; k++) { await this.mouse('mouseMoved', a.x + (b.x - a.x) * k / 8, a.y + (b.y - a.y) * k / 8, 1); await sleep(14); }
    await this.mouse('mouseReleased', b.x, b.y, 0);
    await sleep(300);
  }
}

async function launch() {
  const proc = spawn(EXE, ['--remote-debugging-port=' + PORT], { detached: false, stdio: 'ignore' });
  let target = null;
  for (let i = 0; i < 120 && !target; i++) {
    try {
      const list = await (await fetch('http://127.0.0.1:' + PORT + '/json/list')).json();
      target = list.find(t => t.type === 'page');
    } catch (e) { }
    if (!target) await sleep(400);
  }
  if (!target) { proc.kill(); return null; }
  const cdp = new CDP(target.webSocketDebuggerUrl);
  await cdp.ready;
  await cdp.send('Runtime.enable');
  await cdp.send('Log.enable');
  return { proc, cdp };
}

async function closeAll(app) {
  // 注意：程序退出时 Browser.close 的响应可能永远回不来，必须加超时，
  // 否则 await 会悬挂、Node 事件循环空转后静默退出。
  try {
    await Promise.race([
      app.cdp.send('Browser.close').catch(() => { }),
      sleep(1500)
    ]);
  } catch (e) { }
  await sleep(800);
  try { app.proc.kill(); } catch (e) { }
  for (let i = 0; i < 20; i++) {
    try { await fetch('http://127.0.0.1:' + PORT + '/json/list'); await sleep(300); } catch (e) { break; }
  }
}

(async () => {
  section('打包产物');
  ok(fs.existsSync(EXE), '找到可执行文件 SHENZHEN SOLITAIRE.exe');
  if (!fs.existsSync(EXE)) { console.log('\n先运行 .\\build-app.ps1'); process.exit(1); }

  const music = fs.readdirSync(path.join(RES, 'music')).filter(f => /\.(ogg|mp3|wav|flac|m4a)$/i.test(f));
  const sfx = fs.readdirSync(path.join(RES, 'sfx')).filter(f => /\.wav$/i.test(f));
  ok(music.length === 11, '程序目录里内置 ' + music.length + ' 首音乐');
  ok(music.indexOf('Solitaire.ogg') !== -1, '含本局曲目 Solitaire.ogg');
  ok(sfx.length >= 8, '程序目录里内置 ' + sfx.length + ' 个音效');
  ok(fs.existsSync(path.join(RES, 'index.html')), '游戏页面在 resources\\app\\index.html');

  section('启动程序');
  const app = await launch();
  ok(!!app, '程序启动并连上调试端口');
  if (!app) { console.log('\n通过 ' + pass + ' 项，失败 ' + (fail + 1) + ' 项'); process.exit(1); }

  try {
    const { cdp } = app;
    for (let i = 0; i < 60; i++) { if (await cdp.eval("typeof SZ !== 'undefined' && SZ.seed() > 0")) break; await sleep(300); }
    for (let i = 0; i < 60; i++) { if (!(await cdp.eval('SZ.busy()'))) break; await sleep(200); }

    ok(await cdp.eval("document.querySelectorAll('.card').length") === 40, '桌上渲染出 40 张牌');
    ok(await cdp.eval("[...document.querySelectorAll('.card')].filter(e=>e.style.display!=='none').length") === 40, '40 张牌都在场上');
    ok(await cdp.eval("document.title.includes('SHENZHEN')"), '窗口标题正确');
    ok(await cdp.eval("typeof require === 'undefined' && typeof process === 'undefined'"), '页面拿不到 Node 权限（隔离正常）');
    ok(await cdp.eval("!!document.getElementById('deck')"), '音乐台存在');

    section('音乐');
    let st = await cdp.eval('SZMusic.status()');
    ok(st.tracks.length === 11, '识别到 11 首曲目');
    for (let i = 0; i < 80; i++) { st = await cdp.eval('SZMusic.status()'); if (st.duration > 0) break; await sleep(250); }
    ok(st.duration > 400, '读到 Solitaire 时长 ' + Math.round(st.duration) + 's（原曲 8:12）');
    ok(!st.usingFallback, '从程序目录 music\\ 读取成功');
    await sleep(1000);
    st = await cdp.eval('SZMusic.status()');
    ok(st.playing === true, '桌面版无需点击即自动播放（autoplay 已放开）');
    ok(st.currentTime > 0.2, '播放进度在推进 (' + st.currentTime.toFixed(1) + 's)');

    section('音效');
    let sf = await cdp.eval('SZSFX.status()');
    ok(sf.failed.length === 0, '全部音效加载成功（共 ' + sf.loaded + ' 个实例就绪）');
    const kinds = await cdp.eval('Object.keys(SZSFX.files).length');
    ok(kinds >= 9, '共 ' + kinds + ' 种事件音效');
    const played = await cdp.eval("SZSFX.play('place')");
    ok(played === true, '放牌音效可播放');

    section('实际操作');
    if (process.argv.indexOf('--shot') !== -1) {
      const r = await app.cdp.send('Page.captureScreenshot', { format: 'png' });
      const out = path.join(ROOT, 'docs', 'app-desktop.png');
      fs.writeFileSync(out, Buffer.from(r.data, 'base64'));
      console.log('  截图 -> ' + out);
    }
    await cdp.eval('SZ.prefs.auto = false');
    const mv = await cdp.eval(`(()=>{
      const ms = SZ.moves().filter(m => !m.consolidate);
      if (!ms.length) return null;
      const m = ms.find(x => x.from.type==='pile' && x.to.type==='pile') || ms[0];
      return { from:m.from, to:m.to, group:m.group, pts:SZ.pointFor(m.from,m.to) };
    })()`);
    ok(!!mv, '存在可拖拽的移动');
    if (mv) {
      const before = await cdp.eval('JSON.stringify(SZ.state().piles)');
      await cdp.drag(mv.pts.start, mv.pts.end);
      const after = await cdp.eval('JSON.stringify(SZ.state().piles)');
      ok(after !== before, '拖拽在桌面版里正常工作');
    }
    const undo = await cdp.eval("(()=>{const b=document.getElementById('btn-undo');return b.disabled})()");
    ok(undo === false, '撤销按钮已激活');

    section('战绩持久化');
    await cdp.eval("localStorage.setItem('__sz_persist_test', 'ok')");
    const written = await cdp.eval("localStorage.getItem('__sz_persist_test')");
    ok(written === 'ok', 'localStorage 可写');

    section('运行时报错');
    const errs = app.cdp.errors.filter(e => !/favicon|ERR_FILE_NOT_FOUND/i.test(e));
    ok(errs.length === 0, '没有 JS 异常' + (errs.length ? '：' + errs.slice(0, 2).join(' | ') : ''));
  } catch (e) {
    fail++;
    console.log('  ✗ 异常: ' + e.message);
  }

  await closeAll(app);

  // 第二轮：重启后 localStorage 是否还在
  section('重启后仍在');
  const app2 = await launch();
  if (app2) {
    try {
      await sleep(1500);
      const kept = await app2.cdp.eval("localStorage.getItem('__sz_persist_test')");
      ok(kept === 'ok', '重启后战绩/设置仍然保留');
      await app2.cdp.eval("localStorage.removeItem('__sz_persist_test')");
    } catch (e) { ok(false, '第二轮异常: ' + e.message); }
    await closeAll(app2);
  } else {
    ok(false, '第二次启动失败');
  }

  console.log('\n通过 ' + pass + ' 项，失败 ' + fail + ' 项');
  process.exit(fail ? 1 : 0);
})();
