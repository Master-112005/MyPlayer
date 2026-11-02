const { contextBridge, ipcRenderer } = require('electron');
const { pathToFileURL } = require('node:url');
require('electron-mpv-video/preload').exposeMpvApi();

contextBridge.exposeInMainWorld('player', {
  chooseFolder: () => ipcRenderer.invoke('choose-folder'),
  scanFolder: folder => ipcRenderer.invoke('scan-folder', folder),
  getTrackInfo: filePath => ipcRenderer.invoke('track-info', filePath),
  getTrackSearchInfo: filePath => ipcRenderer.invoke('track-search-info', filePath),
  chooseVideoFolder: () => ipcRenderer.invoke('choose-video-folder'),
  scanVideoFolder: folder => ipcRenderer.invoke('scan-video-folder', folder),
  videoFileUrl: filePath => typeof filePath === 'string' ? pathToFileURL(filePath).href : '',
  openVideoWindow: (filePath, title) => ipcRenderer.invoke('open-video-window', filePath, title),
  getVideoResume: filePath => ipcRenderer.invoke('video-resume-get', filePath),
  saveVideoResume: (filePath, position, duration) => ipcRenderer.invoke('video-resume-save', filePath, position, duration),
  setVideoAspect: (width, height) => ipcRenderer.invoke('set-video-aspect', width, height),
  setVideoFullscreen: fullscreen => ipcRenderer.invoke('set-video-fullscreen', fullscreen),
  getCinemaVolumeBoost: () => ipcRenderer.invoke('cinema-volume-boost-get'),
  setCinemaVolumeBoost: enabled => ipcRenderer.invoke('cinema-volume-boost-set', enabled),
  onCinemaVolumeBoostChanged: callback => {
    const listener = (_event, enabled) => callback(enabled);
    ipcRenderer.on('cinema-volume-boost-changed', listener);
    return () => ipcRenderer.removeListener('cinema-volume-boost-changed', listener);
  },
  openDefaultApps: kind => ipcRenderer.invoke('open-default-apps', kind),
  onVideoFullscreenChanged: callback => {
    const listener = (_event, fullscreen) => callback(fullscreen);
    ipcRenderer.on('video-fullscreen-changed', listener);
    return () => ipcRenderer.removeListener('video-fullscreen-changed', listener);
  },
  onVideoOpen: callback => {
    const listener = (_event, video) => callback(video);
    ipcRenderer.on('video-open', listener);
    return () => ipcRenderer.removeListener('video-open', listener);
  },
  setAppMode: mode => ipcRenderer.invoke('set-app-mode', mode),
  setMiniMode: mini => ipcRenderer.invoke('set-mini-mode', mini),
  close: () => ipcRenderer.send('window-close'),
  minimize: () => ipcRenderer.send('window-minimize')
});
