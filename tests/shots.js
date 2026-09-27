/* 截取中局 / 残局画面，用于人眼检查视觉还原度
 * 用法: node tests/shots.js [seed]
 */
'use strict';
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs'); const os = require('os');
const EDGE = process.env.EDGE || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 9414;
const OUT = path.resolve(__dirname, '..');
const HTML = 'file:///' + path.resolve(OUT, 'shenzhen-solitaire.html').replace(/\\/g, '/').replace(/ /g, '%20');
const sleep = ms => new Promise(r => setTimeout(r, ms));

class CDP {
  constructor(url) {
    this.id = 0; this.pending = new Map();
    this.ws = new WebSocket(url);
    this.ws.addEventListener('message', ev => {
      const m = JSON.parse(ev.data);
      if (m.id && this.pending.has(m.id)) { const p = this.pending.get(m.id); this.pending.delete(m.id); m.error ? p.rej(new Error(JSON.stringify(m.error))) : p.res(m.result); }
    });
    this.ready = new Promise(r => this.ws.addEventListener('open', r));
  }
  send(method, params) { const id = ++this.id; return new Promise((res, rej) => { this.pending.set(id, { res, rej }); this.ws.send(JSON.stringify({ id, method, params: params || {} })); }); }
  async eval(e) { const r = await this.send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails)); return r.result.value; }
  async shot(file) {
    const r = await this.send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(file, Buffer.from(r.data, 'base64'));
    console.log('  -> ' + file);
  }
}

(async () => {
  const seed = Number(process.argv[2] || 24680);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sz-shot-'));
  const proc = spawn(EDGE, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=1',
    '--autoplay-policy=no-user-gesture-required',
    '--remote-debugging-port=' + PORT, '--user-data-dir=' + tmp, '--window-size=1400,900', HTML + '?seed=' + seed], { stdio: 'ignore' });
  let t = null;
  for (let i = 0; i < 100 && !t; i++) {
    try { const l = await (await fetch('http://127.0.0.1:' + PORT + '/json/list')).json(); t = l.find(x => x.type === 'page' && /shenzhen/.test(x.url)); } catch (e) { }
    if (!t) await sleep(300);
  }
  const cdp = new CDP(t.webSocketDebuggerUrl);
  await cdp.ready; await cdp.send('Runtime.enable'); await cdp.send('Page.enable');
  await sleep(2600);

  // 顺便放上小游戏本曲，截图里能带出音乐台
  await cdp.eval('SZMusic.play()');
  await sleep(2500);
  await cdp.shot(path.join(OUT, 'shot-start.png'));

  const sol = await cdp.eval('(()=>{const s=SZ.solve({nodes:400000,ms:8000});return s?JSON.stringify(s):null})()');
  const seed0 = await cdp.eval('SZ.seed()');   // 页面实际用的种子（开了保证可解时可能被顺延）
  console.log('实际牌局 SEED = ' + seed0);
  if (!sol) { console.log('该种子未解出'); }
  else {
    const moves = JSON.parse(sol);
    console.log('解法共 ' + moves.length + ' 步');
    await cdp.eval('SZ.prefs.solvable = false');   // 保证 newGame(seed) 一定还原同一副牌
    const play = async (n, file) => {
      await cdp.eval('SZ.newGame(' + seed0 + ')');
      await sleep(500);
      await cdp.eval('SZ.prefs.auto = false; SZ.play(' + JSON.stringify(moves.slice(0, n)) + ')');
      await sleep(450);
      await cdp.shot(path.join(OUT, file));
    };
    await play(Math.floor(moves.length * 0.55), 'shot-mid.png');
    await play(moves.length - 1, 'shot-late.png');
    await play(moves.length, 'shot-win.png');
    console.log('胜利 =', await cdp.eval('SZ.engine.isWin(SZ.state())'));
  }

  try { await cdp.send('Browser.close'); } catch (e) { }
  proc.kill(); await sleep(200);
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) { }
  process.exit(0);
})();
