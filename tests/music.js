/* 音乐模块验证：能否真的读到并播放本机 SHENZHEN I/O 原声
 * 用法: node tests/music.js
 */
'use strict';
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs'); const os = require('os');
const EDGE = process.env.EDGE || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 9417;
const HTML = 'file:///' + path.resolve(__dirname, '..', 'shenzhen-solitaire.html').replace(/\\/g, '/').replace(/ /g, '%20');
const sleep = ms => new Promise(r => setTimeout(r, ms));

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  ✗ ' + m); } };

class CDP {
  constructor(url) {
    this.id = 0; this.pending = new Map(); this.errors = [];
    this.ws = new WebSocket(url);
    this.ws.addEventListener('message', ev => {
      const m = JSON.parse(ev.data);
      if (m.id && this.pending.has(m.id)) { const p = this.pending.get(m.id); this.pending.delete(m.id); m.error ? p.rej(new Error(JSON.stringify(m.error))) : p.res(m.result); }
      else if (m.method === 'Runtime.exceptionThrown') this.errors.push((m.params.exceptionDetails.exception || {}).description || m.params.exceptionDetails.text);
    });
    this.ready = new Promise(r => this.ws.addEventListener('open', r));
  }
  send(method, params) { const id = ++this.id; return new Promise((res, rej) => { this.pending.set(id, { res, rej }); this.ws.send(JSON.stringify({ id, method, params: params || {} })); }); }
  async eval(e) { const r = await this.send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails.exception || r.exceptionDetails.text)); return r.result.value; }
  async click(x, y) {
    await this.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: Math.round(x), y: Math.round(y), button: 'left', buttons: 1, clickCount: 1 });
    await sleep(30);
    await this.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: Math.round(x), y: Math.round(y), button: 'left', buttons: 0, clickCount: 1 });
    await sleep(150);
  }
}

(async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sz-music-'));
  const proc = spawn(EDGE, ['--headless=new', '--disable-gpu', '--no-first-run',
    '--autoplay-policy=no-user-gesture-required',
    '--remote-debugging-port=' + PORT, '--user-data-dir=' + tmp, '--window-size=1400,900', HTML], { stdio: 'ignore' });
  let t = null;
  for (let i = 0; i < 100 && !t; i++) {
    try { const l = await (await fetch('http://127.0.0.1:' + PORT + '/json/list')).json(); t = l.find(x => x.type === 'page' && /shenzhen/.test(x.url)); } catch (e) { }
    if (!t) await sleep(300);
  }
  const cdp = new CDP(t.webSocketDebuggerUrl);
  await cdp.ready; await cdp.send('Runtime.enable');
  await sleep(2000);

  console.log('\n== 曲目清单 ==');
  const st0 = await cdp.eval('SZMusic.status()');
  ok(st0.ready, '音乐模块已初始化');
  ok(st0.tracks.length === 11, '发现 11 首曲目（实际 ' + st0.tracks.length + '）');
  ok(st0.tracks.indexOf('Solitaire.ogg') !== -1, '包含本局曲目 Solitaire.ogg');
  ok(st0.mode === 'solo' && st0.title === 'Solitaire.ogg', '默认播放列表为本局曲目（' + st0.title + '）');

  console.log('\n== 加载与播放 ==');
  // 初始化时就会尝试自动播放（桌面版会成功，浏览器可能被拦），这里保证处于播放态
  await cdp.eval("if(!SZMusic.status().playing) document.getElementById('mus-play').click()");
  let st = st0;
  for (let i = 0; i < 60; i++) { st = await cdp.eval('SZMusic.status()'); if (st.duration > 0) break; await sleep(250); }
  console.log('  曲目时长 ' + Math.round(st.duration) + ' 秒，当前 ' + st.currentTime.toFixed(1) + 's');
  ok(st.duration > 400, '读出 Solitaire.ogg 时长（' + Math.round(st.duration) + 's，原曲 8:12）');
  await sleep(1200);
  st = await cdp.eval('SZMusic.status()');
  ok(st.playing === true, '正在播放');
  ok(st.currentTime > 0.2, '播放进度在推进（' + st.currentTime.toFixed(2) + 's）');
  ok(!st.usingFallback, '使用相对路径 music/ 读取成功');

  console.log('\n== 播放控制 ==');
  await cdp.eval("SZMusic.setMode('all')");
  await sleep(300);
  let s2 = await cdp.eval('SZMusic.status()');
  ok(s2.tracks.length === 11 && s2.playing, '切换到「全部顺序」后仍在播放');
  const first = s2.title;
  await cdp.eval('SZMusic.next()');
  await sleep(600);
  s2 = await cdp.eval('SZMusic.status()');
  ok(s2.title !== first, '下一首切换成功（' + first + ' -> ' + s2.title + '）');
  await cdp.eval('SZMusic.prev()');
  await sleep(400);
  ok((await cdp.eval('SZMusic.status()')).title === first, '上一首切回原曲');
  await cdp.eval('SZMusic.pause()');
  await sleep(200);
  ok((await cdp.eval('SZMusic.status()')).playing === false, '暂停生效');
  await cdp.eval('SZMusic.setVolume(0.2)');
  ok(Math.abs((await cdp.eval('SZMusic.status()')).volume - 0.2) < 1e-6, '音量设置生效');
  await cdp.eval('SZMusic.play()');
  await sleep(300);
  ok((await cdp.eval('SZMusic.status()')).playing === true, '恢复播放');

  console.log('\n== 面板元素 ==');
  ok(await cdp.eval("!!document.getElementById('deck')"), '音乐台元素存在');
  ok(await cdp.eval("document.getElementById('mus-mode').options.length === 3"), '三种播放范围可选');
  const barW = await cdp.eval("document.getElementById('mus-bar').style.width");
  ok(/%$/.test(barW), '进度条在更新（' + barW + '）');
  const titleTxt = await cdp.eval("document.getElementById('mus-title').textContent");
  ok(/Solitaire|Solving|Intro|Outro|OS/.test(titleTxt) || titleTxt.length > 0, '显示曲名：' + titleTxt);

  console.log('\n== 运行时报错 ==');
  ok(cdp.errors.length === 0, '没有 JS 异常' + (cdp.errors.length ? '：' + cdp.errors[0] : ''));

  try { await cdp.send('Browser.close'); } catch (e) { }
  proc.kill(); await sleep(200);
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) { }
  console.log('\n通过 ' + pass + ' 项，失败 ' + fail + ' 项');
  process.exit(fail ? 1 : 0);
})();
