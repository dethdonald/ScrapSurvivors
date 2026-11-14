// Exposes a tiny, safe bridge so the game menu can quit or toggle fullscreen.
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('desktop', {
  quit: () => ipcRenderer.send('quit'),
  toggleFullscreen: () => ipcRenderer.send('toggle-fullscreen'),
  updateStatus: () => ipcRenderer.invoke('update-status'),
  restart: () => ipcRenderer.send('restart'),
  applyUpdate: () => ipcRenderer.invoke('update-apply'),
  onUpdateProgress: cb => ipcRenderer.on('update-progress', (e, d) => cb(d)),
});
