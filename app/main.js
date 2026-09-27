/* ============================================================================
 * SHENZHEN SOLITAIRE — Electron 外壳
 * 只是一个窗口：游戏本身还是 app/index.html（与网页版同一份代码），
 * 音乐与音效就在程序目录里，直接读本地文件。
 * ==========================================================================*/
'use strict';
const { app, BrowserWindow, Menu, shell, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

// 桌面程序：允许开局直接出声（网页版受浏览器自动播放策略限制）
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
// Windows 任务栏分组与名称
app.setAppUserModelId('com.recreation.shenzhen-solitaire');
app.setName('SHENZHEN SOLITAIRE');

let win = null;

function createWindow() {
  win = new BrowserWindow({
    width: 1280, height: 940,
    minWidth: 900, minHeight: 620,
    backgroundColor: '#15181c',
    title: 'SHENZHEN SOLITAIRE',
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
      spellcheck: false
    }
  });

  Menu.setApplicationMenu(null);

  win.once('ready-to-show', () => {
    win.show();
    win.focus();
  });

  // 不许被拖进来的文件导航走、不许开新窗口
  win.webContents.on('will-navigate', (e) => e.preventDefault());
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });

  // 快捷键：F11 全屏、Ctrl+Shift+I 开发者工具、Ctrl+Shift+Q 退出
  win.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return;
    const key = (input.key || '').toLowerCase();
    if (key === 'f11') {
      win.setFullScreen(!win.isFullScreen());
      event.preventDefault();
    } else if (input.control && input.shift && key === 'i') {
      win.webContents.toggleDevTools();
      event.preventDefault();
    } else if (input.control && input.shift && key === 'q') {
      app.quit();
      event.preventDefault();
    }
  });

  const index = path.join(__dirname, 'index.html');
  if (!fs.existsSync(index)) {
    dialog.showErrorBox('缺少文件', '找不到 index.html：\n' + index);
    app.quit();
    return;
  }
  win.loadFile(index);

  win.webContents.on('did-fail-load', (e, code, desc) => {
    dialog.showErrorBox('加载失败', desc + ' (' + code + ')');
  });

  win.on('closed', () => { win = null; });
}

// 只允许开一个实例
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });
  app.whenReady().then(createWindow);
  app.on('window-all-closed', () => app.quit());
}
