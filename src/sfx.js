/* ============================================================================
 * SHENZHEN SOLITAIRE — 音效（播放 SHENZHEN I/O 原版音效文件）
 * ----------------------------------------------------------------------------
 * 音效文件放在程序目录的 sfx/ 下，用 <audio> 预加载 + 小型实例池播放，
 * 这样在 file:// 与 Electron 里都能用。文件不存在时 play() 返回 false，
 * 调用方（ui.js）会退回 WebAudio 合成音，所以缺文件也不会变成哑巴。
 * ==========================================================================*/
(function (root) {
  'use strict';

  var DIR = 'sfx/';
  var POOL = 3;            // 每种音效的并发实例数

  // 事件 -> 原版音效文件
  var FILES = {
    pick: 'card_pickup.wav',     // 拿起牌
    place: 'card_place.wav',     // 放牌 / 自动上牌
    deal: 'card_deal.wav',       // 发牌
    button: 'button.wav',        // 按钮
    dragon: 'card_sweep.wav',    // 龙牌合并
    error: 'os_beep_failure.wav',// 无效操作
    success: 'os_beep_success.wav',
    tick: 'sim_tick.wav',
    win: 'fanfare_solving1.wav'  // 通关
  };

  var pools = {};          // kind -> [audio, ...]
  var cursor = {};         // kind -> 下一个可用下标
  var failed = {};         // kind -> 加载失败
  var enabled = true;
  var volume = 0.65;
  var loadedCount = 0;

  function make(kind) {
    var arr = [];
    for (var i = 0; i < POOL; i++) {
      var a = new Audio();
      a.preload = 'auto';
      a.src = DIR + FILES[kind];
      a.volume = volume;
      a.addEventListener('error', function () { failed[kind] = true; });
      a.addEventListener('canplaythrough', function () { loadedCount++; }, { once: true });
      arr.push(a);
    }
    pools[kind] = arr;
    cursor[kind] = 0;
  }

  function init() {
    for (var kind in FILES) if (FILES.hasOwnProperty(kind)) make(kind);
  }

  // 返回 true 表示「已用采样播放」，false 表示没这个音效（调用方可退回合成音）
  function play(kind) {
    if (!enabled) return true;                  // 静音时也算处理过
    var arr = pools[kind];
    if (!arr || failed[kind]) return false;
    var a = arr[cursor[kind]];
    cursor[kind] = (cursor[kind] + 1) % arr.length;
    try {
      a.currentTime = 0;
      a.volume = volume;
      var p = a.play();
      if (p && p.catch) p.catch(function () { });
      return true;
    } catch (e) {
      return false;
    }
  }

  function setVolume(v) {
    volume = Math.max(0, Math.min(1, v));
    for (var kind in pools) if (pools.hasOwnProperty(kind)) {
      pools[kind].forEach(function (a) { a.volume = volume; });
    }
  }

  root.SZSFX = {
    init: init, play: play, setVolume: setVolume,
    setEnabled: function (v) { enabled = !!v; },
    isEnabled: function () { return enabled; },
    files: FILES,
    status: function () {
      var out = { dir: DIR, volume: volume, enabled: enabled, loaded: loadedCount, failed: [] };
      for (var kind in FILES) if (failed[kind]) out.failed.push(kind);
      return out;
    }
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
