'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('stickyAPI', {
  getNote: () => ipcRenderer.invoke('note:get'),
  patch: (patch) => ipcRenderer.send('note:patch', patch),
  createNote: () => ipcRenderer.invoke('note:new'),
  togglePin: () => ipcRenderer.invoke('note:pin'),
  hideNote: () => ipcRenderer.invoke('note:hide'),
  openMenu: () => ipcRenderer.send('note:menu'),
  deleteNote: () => ipcRenderer.invoke('note:delete'),
  onSaved: (callback) => {
    const listener = (_event, at) => callback(at);
    ipcRenderer.on('note:saved', listener);
    return () => ipcRenderer.removeListener('note:saved', listener);
  },
  onSaveError: (callback) => {
    const listener = () => callback();
    ipcRenderer.on('note:save-error', listener);
    return () => ipcRenderer.removeListener('note:save-error', listener);
  },
  onPinned: (callback) => {
    const listener = (_event, pinned) => callback(pinned);
    ipcRenderer.on('note:pinned', listener);
    return () => ipcRenderer.removeListener('note:pinned', listener);
  }
});
