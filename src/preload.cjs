const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('player', {
  chooseFolder: () => ipcRenderer.invoke('choose-folder'),
  scanFolder: folder => ipcRenderer.invoke('scan-folder', folder),
  getTrackInfo: filePath => ipcRenderer.invoke('track-info', filePath),
  setMiniMode: mini => ipcRenderer.invoke('set-mini-mode', mini),
  close: () => ipcRenderer.send('window-close'),
  minimize: () => ipcRenderer.send('window-minimize')
});
