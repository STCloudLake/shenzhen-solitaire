/* ============================================================================
 * SHENZHEN SOLITAIRE — 背景音乐（播放 SHENZHEN I/O 原声）
 * ----------------------------------------------------------------------------
 * 音乐文件不入库、不内嵌：由构建脚本扫描 music/ 目录后注入曲目清单与备用绝对路径，
 * 运行时用 <audio> 直接读取本机文件。找不到音乐时功能自动降级，不影响游戏。
 * ==========================================================================*/
(function (root) {
  'use strict';

  var META = root.SZ_MUSIC || null;                 // { tracks:[], base:"file:///..." }
  var PREF_KEY = 'shenzhen-solitaire-music';
  var AUDIO_RE = /\.(ogg|oga|mp3|m4a|aac|wav|flac|opus|webm)$/i;
  var SOLO_NAME = 'Solitaire.ogg';

  /* ---------------------------------------------------------------- 状态 */
  var audio = null;
  var els = {};
  var list = [];            // 当前播放列表（曲目名）
  var picked = null;        // 用户手动选择的文件： [{name, url}]
  var index = 0;
  var mode = 'solo';        // solo | all | shuffle
  var volume = 0.5;
  var wantPlay = true;      // 用户希望播放（用于自动播放被拦后补播）
  var unlocked = false;     // 是否已获得用户手势
  var playing = false;
  var usingFallback = false;// 相对路径失败后是否改用绝对路径
  var failedNames = {};     // 加载失败的曲目，避免死循环重试
  var lastError = '';
  var hint = false;         // true 表示只是「没找到音乐」的提示，不是错误
  var ready = false;
  // 在线试玩（http/https）时没有本地文件，不必去试构建时记录的绝对路径
  var isRemote = (typeof location !== 'undefined') && /^https?:$/.test(location.protocol);

  function prefs(read) {
    try {
      if (read) return JSON.parse(localStorage.getItem(PREF_KEY) || '{}');
      localStorage.setItem(PREF_KEY, JSON.stringify({ mode: mode, volume: volume, wantPlay: wantPlay }));
    } catch (e) { }
    return null;
  }

  /* ---------------------------------------------------------------- 工具 */
  function pretty(name) {
    return name.replace(AUDIO_RE, '').replace(/_/g, ' ')
      .replace(/([A-Za-z])(\d)/g, '$1 $2')
      .replace(/^./, function (m) { return m.toUpperCase(); });
  }
  function fmt(sec) {
    if (!isFinite(sec) || sec < 0) sec = 0;
    var m = Math.floor(sec / 60), s = Math.floor(sec % 60);
    return m + ':' + (s < 10 ? '0' : '') + s;
  }
  function tracks() {
    if (picked) return picked.map(function (p) { return p.name; });
    return (META && META.tracks) ? META.tracks.slice() : [];
  }
  function urlOf(i) {
    if (picked) return picked[i].url;
    var name = list[i];
    if (!name) return '';
    var base = usingFallback && META && META.base ? META.base : 'music/';
    return base + encodeURIComponent(name);
  }

  /* ---------------------------------------------------------------- 播放列表 */
  function buildList(keepIndex) {
    var all = tracks();
    var cur = list[index];
    if (mode === 'solo') {
      var i = all.indexOf(SOLO_NAME);
      list = all.length ? [all[i >= 0 ? i : 0]] : [];
    } else {
      list = all.slice();
      if (mode === 'shuffle') {
        for (var k = list.length - 1; k > 0; k--) {
          var j = Math.floor(Math.random() * (k + 1));
          var t = list[k]; list[k] = list[j]; list[j] = t;
        }
      }
    }
    if (keepIndex && cur) {
      var n = list.indexOf(cur);
      index = n >= 0 ? n : 0;
    } else {
      index = 0;
    }
  }

  function load(autoPlay) {
    if (!list.length) { render(); return; }
    var url = urlOf(index);
    if (!url) { render(); return; }
    audio.src = url;
    audio.load();
    render();
    if (autoPlay) play();
  }

  function play() {
    wantPlay = true;
    prefs(false);
    if (!audio.src && list.length) { load(true); return; }
    if (!audio.src) { render(); return; }
    var p = audio.play();
    if (p && p.catch) {
      p.then(function () { lastError = ''; }).catch(function (e) {
        if (e && e.name === 'NotAllowedError') { lastError = '点击画面任意处开始播放音乐'; }
        else { lastError = '无法播放：' + (e && e.name ? e.name : e); }
        playing = false;
        render();
      });
    }
  }
  function pause() {
    wantPlay = false;
    prefs(false);
    try { audio.pause(); } catch (e) { }
    playing = false;
    render();
  }
  function toggle() { playing ? pause() : play(); }
  function next(auto) {
    if (!list.length) return;
    if (list.length === 1) { audio.currentTime = 0; play(); return; }
    index = (index + 1) % list.length;
    if (auto && mode === 'shuffle' && index === 0) buildList(false);
    load(true);
  }
  function prev() {
    if (!list.length) return;
    if (audio.currentTime > 3) { audio.currentTime = 0; return; }
    index = (index - 1 + list.length) % list.length;
    load(true);
  }

  /* ---------------------------------------------------------------- 渲染 */
  function render() {
    if (!els.title) return;
    var name = list[index];
    var title;
    if (!tracks().length) { title = '未找到音乐文件（把 music/ 放在本文件旁边，或点右侧「选择音乐」）'; hint = true; }
    else if (lastError) title = hint ? (lastError + ' · 点右侧「选择音乐…」可以自己挑') : lastError;
    else if (!name) title = '—';
    else title = pretty(name) + (list.length > 1 ? '  (' + (index + 1) + '/' + list.length + ')' : '');
    els.title.textContent = title;
    els.title.classList.toggle('warn', !!lastError && !hint);
    els.title.classList.toggle('hint', hint);

    els.play.textContent = playing ? '❚❚' : '▶';
    els.play.title = playing ? '暂停' : '播放';
    els.deck.classList.toggle('playing', playing);

    var dur = audio.duration;
    els.time.textContent = fmt(audio.currentTime) + ' / ' + fmt(isFinite(dur) ? dur : 0);
    var pct = (isFinite(dur) && dur > 0) ? (audio.currentTime / dur) * 100 : 0;
    els.bar.style.width = pct.toFixed(2) + '%';
    els.vol.value = String(Math.round(volume * 100));
  }

  /* ---------------------------------------------------------------- 加载失败处理 */
  function onError() {
    var name = list[index];
    if (!name) return;
    // 相对路径读不到（比如单文件被挪到别处）时，尝试构建时记录的绝对路径
    if (!picked && !usingFallback && !isRemote && META && META.base) {
      usingFallback = true;
      lastError = '';
      load(playing || wantPlay);
      return;
    }
    failedNames[name] = true;
    hint = false;
    lastError = '「' + pretty(name) + '」无法加载';
    var left = list.filter(function (n) { return !failedNames[n]; });
    if (left.length && list.length > 1) { next(true); return; }
    // 全部失败：多半就是这一份没带音频文件
    playing = false;
    if (picked) {
      lastError = '这些音频文件无法播放';
    } else {
      lastError = '这里没有音乐文件';
      hint = true;
    }
    render();
  }

  /* ---------------------------------------------------------------- 交互 */
  function pickFiles() {
    var input = document.createElement('input');
    input.type = 'file';
    input.accept = 'audio/*,.ogg,.mp3,.m4a,.flac,.wav,.opus';
    input.multiple = true;
    if ('webkitdirectory' in input) input.webkitdirectory = true;
    input.style.display = 'none';
    document.body.appendChild(input);
    input.addEventListener('change', function () {
      var files = [].slice.call(input.files || []).filter(function (f) { return AUDIO_RE.test(f.name); });
      if (!files.length) { lastError = '选择的文件夹里没有音频文件'; render(); return; }
      files.sort(function (a, b) { return a.name.localeCompare(b.name); });
      if (!picked) picked = [];
      files.forEach(function (f) {
        if (!picked.some(function (p) { return p.name === f.name; })) {
          picked.push({ name: f.name, url: URL.createObjectURL(f) });
        }
      });
      lastError = '';
      buildList(false);
      load(true);
      document.body.removeChild(input);
    });
    input.click();
  }

  function unlock() {
    if (unlocked) return;
    unlocked = true;
    document.removeEventListener('pointerdown', unlock, true);
    document.removeEventListener('keydown', unlock, true);
    if (wantPlay && !playing && list.length) play();
  }

  /* ---------------------------------------------------------------- 初始化 */
  function init() {
    audio = new Audio();
    audio.preload = 'metadata';
    audio.volume = volume;

    els.deck = document.getElementById('deck');
    if (!els.deck) return;
    els.title = document.getElementById('mus-title');
    els.time = document.getElementById('mus-time');
    els.bar = document.getElementById('mus-bar');
    els.play = document.getElementById('mus-play');
    els.prev = document.getElementById('mus-prev');
    els.next = document.getElementById('mus-next');
    els.mode = document.getElementById('mus-mode');
    els.vol = document.getElementById('mus-vol');
    els.pick = document.getElementById('mus-pick');

    var p = prefs(true) || {};
    if (p.mode) mode = p.mode;
    if (typeof p.volume === 'number') volume = p.volume;
    if (typeof p.wantPlay === 'boolean') wantPlay = p.wantPlay;
    audio.volume = volume;
    if (els.mode) els.mode.value = mode;

    audio.addEventListener('playing', function () { playing = true; lastError = ''; render(); });
    audio.addEventListener('pause', function () { playing = false; render(); });
    audio.addEventListener('ended', function () { next(true); });
    audio.addEventListener('error', onError);
    audio.addEventListener('loadedmetadata', render);
    audio.addEventListener('timeupdate', render);

    els.play.addEventListener('click', function () { toggle(); });
    els.next.addEventListener('click', function () { next(false); });
    els.prev.addEventListener('click', function () { prev(); });
    els.mode.addEventListener('change', function () { mode = els.mode.value; prefs(false); buildList(false); load(playing || wantPlay); });
    els.vol.addEventListener('input', function () { volume = (+els.vol.value) / 100; audio.volume = volume; prefs(false); });
    if (els.pick) els.pick.addEventListener('click', pickFiles);
    els.bar.parentNode.addEventListener('click', function (ev) {
      var r = this.getBoundingClientRect();
      if (!isFinite(audio.duration) || audio.duration <= 0) return;
      audio.currentTime = Math.max(0, Math.min(1, (ev.clientX - r.left) / r.width)) * audio.duration;
      render();
    });

    document.addEventListener('pointerdown', unlock, true);
    document.addEventListener('keydown', unlock, true);

    buildList(false);
    load(false);
    render();
    // 直接尝试播放：桌面版（Electron）允许自动出声；网页版会被浏览器拦下，
    // 这时 play() 会把提示写进音乐台，并在第一次点击画面后自动补播（unlock）。
    if (wantPlay && list.length) play();
    ready = true;
  }

  root.SZMusic = {
    init: init,
    play: play, pause: pause, toggle: toggle, next: function () { next(false); }, prev: prev,
    setMode: function (m) { mode = m; if (els.mode) els.mode.value = m; buildList(false); load(playing || wantPlay); },
    setVolume: function (v) { volume = Math.max(0, Math.min(1, v)); audio.volume = volume; prefs(false); render(); },
    pickFiles: pickFiles,
    status: function () {
      return {
        ready: ready, mode: mode, volume: volume, playing: playing, wantPlay: wantPlay,
        unlocked: unlocked, usingFallback: usingFallback, tracks: tracks(),
        index: index, title: list[index] || null, lastError: lastError,
        duration: audio ? (isFinite(audio.duration) ? audio.duration : 0) : 0,
        currentTime: audio ? audio.currentTime : 0,
        muted: audio ? audio.muted : false
      };
    },
    pretty: pretty
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})(typeof globalThis !== 'undefined' ? globalThis : this);
