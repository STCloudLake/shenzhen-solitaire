/* 诊断：拖拽事件到底走到哪一步 */
'use strict';
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs'); const os = require('os');
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 9413;
const HTML = 'file:///' + path.resolve(__dirname, '..', 'shenzhen-solitaire.html').replace(/\\/g, '/').replace(/ /g, '%20');
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
  async eval(e) { const r = await this.send('Runtime.evaluate', { expression: e, returnByValue: true }); if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails)); return r.result.value; }
  async mouse(type, x, y, buttons) { await this.send('Input.dispatchMouseEvent', { type, x: Math.round(x), y: Math.round(y), button: 'left', buttons: buttons === undefined ? 1 : buttons, clickCount: 1, pointerType: 'mouse' }); }
}

(async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sz-diag-'));
  const proc = spawn(EDGE, ['--headless=new', '--disable-gpu', '--remote-debugging-port=' + PORT, '--user-data-dir=' + tmp, '--window-size=1400,900', HTML], { stdio: 'ignore' });
  let t = null;
  for (let i = 0; i < 100 && !t; i++) {
    try { const l = await (await fetch('http://127.0.0.1:' + PORT + '/json/list')).json(); t = l.find(x => x.type === 'page' && /shenzhen/.test(x.url)); } catch (e) { }
    if (!t) await sleep(300);
  }
  const cdp = new CDP(t.webSocketDebuggerUrl);
  await cdp.ready; await cdp.send('Runtime.enable'); await sleep(2500);

  await cdp.eval(`window.__p={down:0,move:0,up:0,lost:0,capture:0};
    const b=document.getElementById('board');
    b.addEventListener('pointerdown',e=>{__p.down++;},true);
    b.addEventListener('pointermove',e=>{__p.move++;},true);
    b.addEventListener('pointerup',e=>{__p.up++;},true);
    b.addEventListener('pointercancel',e=>{__p.lost++;},true);
    window.addEventListener('pointermove',e=>{__p.winmove=(__p.winmove||0)+1},true);
    'ok'`);
  await cdp.eval('SZ.prefs.auto=false');

  const mv = await cdp.eval(`(()=>{const ms=SZ.moves().filter(m=>!m.consolidate&&m.from.type==='pile'&&m.to.type==='pile');if(!ms.length)return null;const m=ms[0];return {from:m.from,to:m.to,group:m.group,pts:SZ.pointFor(m.from,m.to)};})()`);
  console.log('move:', JSON.stringify(mv));
  const before = await cdp.eval('JSON.stringify(SZ.state().piles)');

  await cdp.mouse('mousePressed', mv.pts.start.x, mv.pts.start.y, 1);
  await sleep(40);
  console.log('after down:', await cdp.eval('JSON.stringify(__p)'), 'sel=', await cdp.eval('!!document.querySelector(".card.selected")'));
  for (let k = 1; k <= 8; k++) {
    await cdp.mouse('mouseMoved', mv.pts.start.x + (mv.pts.end.x - mv.pts.start.x) * k / 8, mv.pts.start.y + (mv.pts.end.y - mv.pts.start.y) * k / 8, 1);
    await sleep(20);
    if (k === 4) console.log('mid drag:', await cdp.eval('JSON.stringify(__p)'), 'dragging=', await cdp.eval('document.querySelectorAll(".card.dragging").length'), 'ghost=', await cdp.eval('document.getElementById("ghost").classList.contains("on")'));
  }
  await cdp.mouse('mouseReleased', mv.pts.end.x, mv.pts.end.y, 0);
  await sleep(300);
  console.log('after up:', await cdp.eval('JSON.stringify(__p)'));
  const after = await cdp.eval('JSON.stringify(SZ.state().piles)');
  console.log('state changed:', before !== after);
  console.log('before:', before.slice(0, 120));
  console.log('after :', after.slice(0, 120));
  console.log('board rect:', await cdp.eval('JSON.stringify(document.getElementById("board").getBoundingClientRect())'));

  try { await cdp.send('Browser.close'); } catch (e) { }
  proc.kill(); await sleep(200);
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) { }
  process.exit(0);
})();
