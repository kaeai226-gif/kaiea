'use strict';

const { app, BrowserWindow, Tray, Menu, screen, ipcMain, dialog, nativeImage } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { SIZE, normalizeNote, applyPatch, readStore, writeStore } = require('./store');

const windows = new Map();
const ownsSingleInstance = app.requestSingleInstanceLock();
const webContentsToId = new Map();
let state;
let storePath;
let tray;
let saveTimer = null;
let quitting = false;

if (!ownsSingleInstance) {
  app.quit();
} else {
  app.on('second-instance', () => showAllNotes());
}

function saveNow() {
  if (!state) return;
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = null;
  try {
    writeStore(storePath, state);
    const timestamp = new Date().toISOString();
    for (const win of windows.values()) {
      if (!win.isDestroyed()) win.webContents.send('note:saved', timestamp);
    }
  } catch (error) {
    console.error('保存便签失败：', error);
    for (const win of windows.values()) {
      if (!win.isDestroyed()) win.webContents.send('note:save-error');
    }
  }
}

function saveSoon() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(saveNow, 320);
}

function findNote(id) {
  return state.notes.find((note) => note.id === id);
}

function currentNote(event) {
  const id = webContentsToId.get(event.sender.id);
  return id ? findNote(id) : null;
}

function currentWindow(event) {
  return BrowserWindow.fromWebContents(event.sender);
}

function safeBounds(bounds) {
  const nearest = Number.isFinite(bounds.x) && Number.isFinite(bounds.y)
    ? screen.getDisplayMatching({ x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height })
    : screen.getPrimaryDisplay();
  const work = nearest.workArea;
  const width = Math.min(bounds.width, Math.max(SIZE.minWidth, work.width - 16));
  const height = Math.min(bounds.height, Math.max(SIZE.minHeight, work.height - 16));
  return {
    x: Number.isFinite(bounds.x) ? Math.max(work.x + 8, Math.min(bounds.x, work.x + work.width - width - 8)) : work.x + 56,
    y: Number.isFinite(bounds.y) ? Math.max(work.y + 8, Math.min(bounds.y, work.y + work.height - height - 8)) : work.y + 56,
    width, height
  };
}

function syncBounds(note, win) {
  if (win.isDestroyed() || !note || !state.notes.includes(note)) return;
  const b = win.getBounds();
  const old = note.bounds;
  if (old.x !== b.x || old.y !== b.y || old.width !== b.width || old.height !== b.height) {
    note.bounds = b;
    saveSoon();
  }
}

function makeWindow(note) {
  if (windows.has(note.id)) return windows.get(note.id);
  const bounds = safeBounds(note.bounds);
  note.bounds = bounds;
  const win = new BrowserWindow({
    ...bounds,
    minWidth: SIZE.minWidth,
    minHeight: SIZE.minHeight,
    frame: false,
    transparent: true,
    hasShadow: true,
    resizable: true,
    alwaysOnTop: note.pinned,
    skipTaskbar: false,
    autoHideMenuBar: true,
    show: false,
    icon: path.join(__dirname, '../assets/icon.png'),
    backgroundColor: '#00000000',
    title: '贴贴 · 桌面便签',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });
  const webContentsId = win.webContents.id;
  windows.set(note.id, win);
  webContentsToId.set(webContentsId, note.id);
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.loadFile(path.join(__dirname, 'index.html'));
  win.once('ready-to-show', () => {
    if (!note.hidden && !win.isDestroyed()) win.show();
  });
  win.on('move', () => syncBounds(note, win));
  win.on('resize', () => syncBounds(note, win));
  win.on('close', (event) => {
    if (quitting) return;
    event.preventDefault();
    note.hidden = true;
    saveNow();
    win.hide();
    refreshTrayMenu();
  });
  win.on('closed', () => {
    windows.delete(note.id);
    webContentsToId.delete(webContentsId);
  });
  return win;
}

function newNote() {
  const p = screen.getCursorScreenPoint();
  const wa = screen.getDisplayNearestPoint(p).workArea;
  const offset = (state.notes.length % 7) * 24;
  const note = normalizeNote({
    id: randomUUID(), pinned: true, hidden: false, color: ['butter', 'mint', 'lilac', 'peach', 'sky'][state.notes.length % 5],
    bounds: { x: Math.max(wa.x + 8, Math.min(p.x - 120 + offset, wa.x + wa.width - SIZE.width - 8)),
      y: Math.max(wa.y + 8, Math.min(p.y - 75 + offset, wa.y + wa.height - SIZE.height - 8)),
      width: SIZE.width, height: SIZE.height }
  }, randomUUID());
  state.notes.push(note);
  makeWindow(note);
  saveSoon();
  refreshTrayMenu();
  return note;
}

function showNote(note) {
  note.hidden = false;
  const win = makeWindow(note);
  if (!win.isDestroyed()) {
    if (win.isMinimized()) win.restore();
    win.show();
    win.focus();
  }
  saveSoon();
  refreshTrayMenu();
}

function showAllNotes() {
  if (!state) return;
  if (!state.notes.length) newNote();
  state.notes.forEach(showNote);
}

function hideNote(note) {
  const win = windows.get(note.id);
  note.hidden = true;
  if (win && !win.isDestroyed()) win.hide();
  saveNow();
  refreshTrayMenu();
}

function hideAllNotes() {
  state.notes.forEach((note) => {
    note.hidden = true;
    const win = windows.get(note.id);
    if (win && !win.isDestroyed()) win.hide();
  });
  saveNow();
  refreshTrayMenu();
}

function deleteNote(note) {
  const win = windows.get(note.id);
  state.notes = state.notes.filter((item) => item.id !== note.id);
  if (win && !win.isDestroyed()) {
    webContentsToId.delete(win.webContents.id);
    windows.delete(note.id);
    win.removeAllListeners('close');
    win.destroy();
  }
  saveNow();
  refreshTrayMenu();
}

function noteMenu(note) {
  const win = windows.get(note.id);
  if (!win || win.isDestroyed()) return;
  return Menu.buildFromTemplate([
    { label: '新建便签', accelerator: 'CmdOrCtrl+N', click: () => newNote() },
    { label: note.pinned ? '取消置顶' : '置顶便签', click: () => togglePin(note) },
    { label: '导出为 TXT…', click: () => exportNote(note) },
    { type: 'separator' },
    { label: '隐藏这张便签', click: () => hideNote(note) },
    { label: '删除这张便签…', click: () => confirmDelete(note, win) }
  ]);
}

async function confirmDelete(note, win) {
  const result = await dialog.showMessageBox(win, {
    type: 'warning', buttons: ['取消', '删除便签'], defaultId: 0, cancelId: 0, noLink: true,
    title: '删除便签', message: '确定删除这张便签吗？', detail: '删除后无法恢复。'
  });
  if (result.response === 1) deleteNote(note);
}

async function exportNote(note) {
  const win = windows.get(note.id);
  const name = (note.title || '我的便签').replace(/[\\/:*?"<>|]/g, '_').slice(0, 60);
  const result = await dialog.showSaveDialog(win, {
    title: '导出便签', defaultPath: `${name}.txt`, filters: [{ name: '文本文件', extensions: ['txt'] }]
  });
  if (!result.canceled && result.filePath) {
    try {
      fs.writeFileSync(result.filePath, [note.title, note.title ? '' : null, note.content].filter((v) => v !== null).join('\n'), 'utf8');
    } catch (error) {
      dialog.showErrorBox('导出失败', error.message);
    }
  }
}

function togglePin(note) {
  note.pinned = !note.pinned;
  const win = windows.get(note.id);
  if (win && !win.isDestroyed()) {
    win.setAlwaysOnTop(note.pinned);
    win.webContents.send('note:pinned', note.pinned);
  }
  saveSoon();
  return note.pinned;
}

function refreshTrayMenu() {
  if (!tray || !state) return;
  const entries = state.notes.slice(0, 12).map((note) => ({
    label: `${note.hidden ? '○' : '●'} ${(note.title || note.content.split('\n')[0] || '无标题便签').trim().slice(0, 24)}`,
    click: () => showNote(note)
  }));
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: '贴贴 · STICKY NOTES', enabled: false },
    { type: 'separator' },
    { label: '＋ 新建便签', click: newNote },
    { label: '显示全部便签', click: showAllNotes },
    { label: '隐藏全部便签', click: hideAllNotes },
    ...(entries.length ? [{ type: 'separator' }, ...entries] : []),
    { type: 'separator' },
    { label: '退出贴贴', click: () => app.quit() }
  ]));
  tray.setToolTip('贴贴 · 你的桌面小纸条');
}

function setupTray() {
  let icon = nativeImage.createFromPath(path.join(__dirname, '../assets/tray.png'));
  if (icon.isEmpty()) icon = nativeImage.createFromPath(path.join(__dirname, '../assets/icon.png'));
  tray = new Tray(icon);
  tray.on('double-click', showAllNotes);
  refreshTrayMenu();
}

function setupIPC() {
  ipcMain.handle('note:get', (event) => {
    const note = currentNote(event);
    return note ? { ...note, number: state.notes.findIndex((n) => n.id === note.id) + 1 } : null;
  });
  ipcMain.on('note:patch', (event, patch) => {
    const note = currentNote(event);
    if (note && applyPatch(note, patch)) {
      saveSoon();
      if (patch && typeof patch.title === 'string') refreshTrayMenu();
    }
  });
  ipcMain.handle('note:new', (event) => {
    if (!currentNote(event)) return false;
    newNote();
    return true;
  });
  ipcMain.handle('note:pin', (event) => {
    const note = currentNote(event);
    return note ? togglePin(note) : false;
  });
  ipcMain.handle('note:hide', (event) => {
    const note = currentNote(event);
    if (!note) return false;
    hideNote(note);
    return true;
  });
  ipcMain.on('note:menu', (event) => {
    const note = currentNote(event);
    const win = currentWindow(event);
    if (note && win) noteMenu(note).popup({ window: win });
  });
  ipcMain.handle('note:delete', async (event) => {
    const note = currentNote(event);
    const win = currentWindow(event);
    if (!note || !win) return false;
    await confirmDelete(note, win);
    return true;
  });
}

app.on('before-quit', () => {
  quitting = true;
  saveNow();
});
app.on('window-all-closed', () => {
  // The tray app keeps running so hidden notes can be reopened.
});
if (ownsSingleInstance) app.whenReady().then(() => {
  storePath = path.join(app.getPath('userData'), 'notes.json');
  state = readStore(storePath, randomUUID);
  setupIPC();
  setupTray();
  if (!state.notes.length) {
    newNote();
  } else {
    state.notes.filter((note) => !note.hidden).forEach(makeWindow);
  }
  app.on('activate', showAllNotes);
}).catch((error) => console.error('初始化失败：', error));
