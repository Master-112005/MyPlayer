const { app, BrowserWindow, dialog, ipcMain, screen, shell } = require('electron');
const { pathToFileURL } = require('node:url');
const path = require('node:path');
const fsSync = require('node:fs');
const fs = require('node:fs/promises');
const audioExtensions = new Set(['.mp3', '.m4a', '.aac', '.wav', '.flac', '.ogg', '.opus', '.wma', '.aiff', '.aif']);
const videoExtensions = new Set(['.3g2', '.3gp', '.3gpp', '.amv', '.asf', '.avi', '.bik', '.cam', '.cine', '.divx', '.drc', '.dsm', '.dv', '.dat', '.evo', '.f4v', '.fli', '.flc', '.flv', '.gvi', '.h264', '.h265', '.hevc', '.m1v', '.m2p', '.m2t', '.m2ts', '.m2v', '.m4v', '.mjpeg', '.mjpg', '.mkv', '.mks', '.mod', '.mov', '.mp2', '.mp4', '.mpe', '.mpeg', '.mpeg1', '.mpeg2', '.mpeg4', '.mpg', '.mpv', '.mpv2', '.mts', '.mxf', '.nsv', '.nut', '.nuv', '.ogm', '.ogv', '.ogx', '.pva', '.qt', '.rec', '.rm', '.rmvb', '.roq', '.rv', '.smk', '.str', '.tp', '.trp', '.ts', '.vob', '.webm', '.wmv', '.wtv', '.xvid', '.y4m', '.yuv']);
const startupFilePath = process.argv.slice(1).find(argument => {
  const extension = path.extname(argument).toLowerCase();
  if (!path.isAbsolute(argument) || (!audioExtensions.has(extension) && !videoExtensions.has(extension))) return false;
  try { return fsSync.statSync(argument).isFile(); } catch { return false; }
}) || null;
const startupFileType = startupFilePath && (videoExtensions.has(path.extname(startupFilePath).toLowerCase()) ? 'video' : 'audio');
const launchMode = startupFileType ? (startupFileType === 'video' ? 'cinema' : 'music') : process.argv.includes('--player=cinema') ? 'cinema' : 'music';

if (launchMode === 'cinema') {
  const sessionDataPath = path.join(app.getPath('userData'), 'MyCinemaSession');
  fsSync.mkdirSync(sessionDataPath, { recursive: true });
  app.setPath('sessionData', sessionDataPath);
}

let mainWindow;
let mpvMain;
let videoWindow;
let videoWindowRestoreBounds;
let videoWindowRestoreMaxSize;
let videoWindowFullscreen = false;
const readyVideoWindows = new WeakSet();
const pendingVideos = new WeakMap();

function attachMpvWindow(window) {
  if (!mpvMain) return;
  mpvMain.attachWindow(window);
  let closeAllowed = false;
  let detaching = false;
  window.on('close', event => {
    if (closeAllowed) return;
    event.preventDefault();
    if (detaching) return;
    detaching = true;
    void mpvMain.detachWindow(window).catch(error => console.error('MPV window cleanup failed:', error)).finally(() => {
      closeAllowed = true;
      if (!window.isDestroyed()) window.close();
    });
  });
}

function createWindow(mode) {
  const cinema = mode === 'cinema';
  const iconName = cinema ? 'mycinema.ico' : 'mymusicplayer.ico';
  mainWindow = new BrowserWindow({
    width: cinema ? 700 : 350, height: 600, minWidth: cinema ? 620 : 320, minHeight: cinema ? 500 : 550,
    maxWidth: cinema ? 1100 : 430, maxHeight: cinema ? 850 : 740, show: false, frame: false,
    transparent: true, backgroundColor: '#00000000', resizable: true,
    title: cinema ? 'MyCinema' : 'MyMusic',
    icon: app.isPackaged ? path.join(process.resourcesPath, iconName) : path.join(__dirname, '..', 'assets', iconName),
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: false }
  });
  attachMpvWindow(mainWindow);
  mainWindow.loadFile(path.join(__dirname, 'index.html'), { query: { app: mode, ...(startupFileType === 'audio' ? { filePath: startupFilePath } : {}) } });
  mainWindow.once('ready-to-show', () => mainWindow.show());
}

function createVideoWindow(filePath, title) {
  const video = { filePath, title };
  if (videoWindow && !videoWindow.isDestroyed()) {
    if (readyVideoWindows.has(videoWindow)) videoWindow.webContents.send('video-open', video);
    else pendingVideos.set(videoWindow, video);
    videoWindow.show();
    videoWindow.focus();
    return true;
  }

  const display = mainWindow && !mainWindow.isDestroyed()
    ? screen.getDisplayMatching(mainWindow.getBounds())
    : screen.getPrimaryDisplay();
  const area = display.workArea;
  const width = Math.min(1100, area.width - 32);
  const height = Math.round(width * 9 / 16);
  videoWindowFullscreen = false;
  videoWindowRestoreBounds = null;
  videoWindowRestoreMaxSize = null;
  videoWindow = new BrowserWindow({
    width, height, minWidth: 320, minHeight: 180,
    maxWidth: area.width, maxHeight: area.height,
    x: area.x + Math.round((area.width - width) / 2), y: area.y + Math.round((area.height - height) / 2),
    frame: false, show: false, transparent: true, backgroundColor: '#00000000', resizable: true,
    title, icon: app.isPackaged ? path.join(process.resourcesPath, 'mycinema.ico') : path.join(__dirname, '..', 'assets', 'mycinema.ico'),
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: false }
  });
  const window = videoWindow;
  window.setAspectRatio(16 / 9);
  attachMpvWindow(window);
  window.on('enter-full-screen', () => {
    if (!window.isDestroyed()) window.webContents.send('video-fullscreen-changed', videoWindowFullscreen);
  });
  window.on('leave-full-screen', () => {
    if (!window.isDestroyed()) window.webContents.send('video-fullscreen-changed', videoWindowFullscreen);
  });
  window.webContents.once('did-finish-load', () => {
    if (window.isDestroyed()) return;
    readyVideoWindows.add(window);
    const queuedVideo = pendingVideos.get(window);
    if (queuedVideo) {
      window.webContents.send('video-open', queuedVideo);
      pendingVideos.delete(window);
    }
  });
  window.once('ready-to-show', () => window.show());
  window.once('closed', () => {
    if (videoWindow === window) videoWindow = null;
    videoWindowRestoreBounds = null;
    videoWindowRestoreMaxSize = null;
    videoWindowFullscreen = false;
  });
  window.loadFile(path.join(__dirname, 'video-player.html'), { query: video });
  return true;
}

async function scanFolder(folder) {
  const tracks = [];
  const pending = [folder];
  while (pending.length) {
    const current = pending.pop();
    let entries;
    try { entries = await fs.readdir(current, { withFileTypes: true }); } catch { continue; }
    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory() && !entry.name.startsWith('.')) pending.push(fullPath);
      else if (entry.isFile() && audioExtensions.has(path.extname(entry.name).toLowerCase())) {
        tracks.push({ path: fullPath, url: pathToFileURL(fullPath).href, filename: entry.name });
      }
    }
  }
  return tracks.sort((a, b) => a.filename.localeCompare(b.filename, undefined, { numeric: true, sensitivity: 'base' }));
}

ipcMain.handle('choose-folder', async () => {
  const result = await dialog.showOpenDialog(mainWindow, { title: 'Choose your music folder', properties: ['openDirectory'] });
  if (result.canceled || !result.filePaths[0]) return null;
  const folder = result.filePaths[0];
  return { folder, tracks: await scanFolder(folder) };
});
ipcMain.handle('scan-folder', async (_event, folder) => {
  if (typeof folder !== 'string') return [];
  return scanFolder(folder);
});
async function scanVideoFolder(folder) {
  const videos = [];
  const pending = [folder];
  while (pending.length) {
    const current = pending.pop();
    let entries;
    try { entries = await fs.readdir(current, { withFileTypes: true }); } catch { continue; }
    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory() && !entry.name.startsWith('.')) pending.push(fullPath);
      else if (entry.isFile() && videoExtensions.has(path.extname(entry.name).toLowerCase())) videos.push({ path: fullPath, title: path.basename(entry.name, path.extname(entry.name)), filename: entry.name });
    }
  }
  return videos.sort((a, b) => a.title.localeCompare(b.title, undefined, { numeric: true, sensitivity: 'base' }));
}
ipcMain.handle('choose-video-folder', async () => {
  const result = await dialog.showOpenDialog(mainWindow, { title: 'Choose your video folder', properties: ['openDirectory'] });
  if (result.canceled || !result.filePaths[0]) return null;
  const folder = result.filePaths[0];
  return { folder, videos: await scanVideoFolder(folder) };
});
ipcMain.handle('scan-video-folder', async (_event, folder) => typeof folder === 'string' ? scanVideoFolder(folder) : []);
ipcMain.handle('open-default-apps', async (event, kind) => {
  if (!mainWindow || event.sender !== mainWindow.webContents || (kind !== 'audio' && kind !== 'video') || (kind === 'video') !== (launchMode === 'cinema')) return false;
  if (!app.isPackaged || process.platform !== 'win32') return false;
  const settingsUrl = kind === 'audio'
    ? `ms-settings:defaultapps?registeredAppUser=MyMusic`
    : 'ms-settings:defaultapps?registeredAppUser=MyCinema';
  try {
    await shell.openExternal(settingsUrl);
    return true;
  } catch { return false; }
});
ipcMain.handle('open-video-window', async (event, filePath, title) => {
  if (!mainWindow || event.sender !== mainWindow.webContents || typeof filePath !== 'string' || !path.isAbsolute(filePath) || !videoExtensions.has(path.extname(filePath).toLowerCase())) return false;
  try { if (!(await fs.stat(filePath)).isFile()) return false; } catch { return false; }
  return createVideoWindow(filePath, typeof title === 'string' ? title.slice(0, 180) : path.basename(filePath));
});
ipcMain.handle('set-video-aspect', (event, width, height) => {
  if (!videoWindow || videoWindow.isDestroyed() || event.sender !== videoWindow.webContents || !Number.isFinite(width) || !Number.isFinite(height) || width < 1 || height < 1 || width > 10000 || height > 10000) return false;
  const aspect = width / height;
  if (aspect < 0.5 || aspect > 3) return false;
  if (videoWindowFullscreen) return true;
  const area = screen.getDisplayMatching(videoWindow.getBounds()).workArea;
  const maxWidth = Math.max(320, Math.min(area.width - 32, 1440));
  const maxHeight = Math.max(180, Math.min(area.height - 64, 900));
  let newWidth = maxWidth;
  let newHeight = newWidth / aspect;
  if (newHeight > maxHeight) { newHeight = maxHeight; newWidth = newHeight * aspect; }
  videoWindow.setAspectRatio(aspect);
  videoWindow.setSize(Math.round(newWidth), Math.round(newHeight));
  videoWindow.setPosition(area.x + Math.round((area.width - newWidth) / 2), area.y + Math.round((area.height - newHeight) / 2));
  return true;
});
ipcMain.handle('set-video-fullscreen', (event, fullscreen) => {
  if (!videoWindow || videoWindow.isDestroyed() || event.sender !== videoWindow.webContents || typeof fullscreen !== 'boolean') return false;
  if (process.platform === 'win32') {
    if (fullscreen) {
      if (!videoWindowFullscreen) {
        videoWindowRestoreBounds = videoWindow.getBounds();
        videoWindowRestoreMaxSize = videoWindow.getMaximumSize();
      }
      const displayBounds = screen.getDisplayMatching(videoWindow.getBounds()).bounds;
      videoWindow.setMaximumSize(displayBounds.width, displayBounds.height);
      videoWindowFullscreen = true;
      videoWindow.setKiosk(true);
      videoWindow.setFullScreen(true);
      videoWindow.setAlwaysOnTop(true, 'screen-saver');
      videoWindow.moveTop();
    } else {
      videoWindowFullscreen = false;
      videoWindow.setFullScreen(false);
      videoWindow.setKiosk(false);
      videoWindow.setAlwaysOnTop(false);
      if (videoWindowRestoreMaxSize) videoWindow.setMaximumSize(...videoWindowRestoreMaxSize);
      if (videoWindowRestoreBounds) videoWindow.setBounds(videoWindowRestoreBounds);
      videoWindowRestoreBounds = null;
      videoWindowRestoreMaxSize = null;
    }
  } else {
    videoWindowFullscreen = fullscreen;
    videoWindow.setFullScreen(fullscreen);
    if (fullscreen) {
      videoWindow.setBounds(screen.getDisplayMatching(videoWindow.getBounds()).bounds);
      videoWindow.setAlwaysOnTop(true, 'screen-saver');
      videoWindow.moveTop();
    } else videoWindow.setAlwaysOnTop(false);
  }
  if (!videoWindow.isDestroyed()) videoWindow.webContents.send('video-fullscreen-changed', videoWindowFullscreen);
  return videoWindowFullscreen;
});
ipcMain.handle('set-app-mode', (_event, mode) => {
  const presets = {
    music: { width: 350, height: 600, minWidth: 320, minHeight: 550, maxWidth: 430, maxHeight: 740, title: 'MyMusic' },
    cinema: { width: 700, height: 600, minWidth: 620, minHeight: 500, maxWidth: 1100, maxHeight: 850, title: 'MyCinema' }
  };
  const preset = presets[mode];
  if (!mainWindow || !preset) return false;
  const area = screen.getDisplayMatching(mainWindow.getBounds()).workArea;
  const [x, y] = mainWindow.getPosition();
  mainWindow.setAlwaysOnTop(false);
  mainWindow.setMaximizable(true);
  mainWindow.setResizable(true);
  mainWindow.setMinimumSize(preset.minWidth, preset.minHeight);
  mainWindow.setMaximumSize(preset.maxWidth, preset.maxHeight);
  mainWindow.setSize(preset.width, preset.height);
  mainWindow.setPosition(Math.max(area.x, Math.min(x, area.x + area.width - preset.width)), Math.max(area.y, Math.min(y, area.y + area.height - preset.height)));
  mainWindow.setTitle(preset.title);
  return true;
});
ipcMain.handle('track-info', async (_event, filePath) => {
  if (typeof filePath !== 'string') return null;
  let metadata;
  try {
    const { parseFile } = await import('music-metadata');
    metadata = await parseFile(filePath, { skipCovers: false, duration: true });
  } catch {}
  const picture = metadata?.common.picture?.[0];
  let artwork = picture?.data?.length
    ? `data:${picture.format?.startsWith('image/') ? picture.format : 'image/jpeg'};base64,${Buffer.from(picture.data).toString('base64')}`
    : null;
  if (!artwork) {
    try {
      const directory = path.dirname(filePath);
      const imageTypes = new Map([['.jpg', 'image/jpeg'], ['.jpeg', 'image/jpeg'], ['.png', 'image/png'], ['.webp', 'image/webp'], ['.avif', 'image/avif']]);
      const entries = await fs.readdir(directory, { withFileTypes: true });
      const cover = entries.find(entry => entry.isFile() && /^(cover|folder|album|front)\.(jpg|jpeg|png|webp|avif)$/i.test(entry.name));
      if (cover) artwork = `data:${imageTypes.get(path.extname(cover.name).toLowerCase())};base64,${(await fs.readFile(path.join(directory, cover.name))).toString('base64')}`;
    } catch {}
  }
  return {
    title: metadata?.common.title || path.basename(filePath, path.extname(filePath)),
    artist: metadata?.common.artist || metadata?.common.albumartist || 'Unknown artist',
    album: metadata?.common.album || '', duration: metadata?.format.duration || 0,
    artwork
  };
});
ipcMain.handle('set-mini-mode', (_event, mini) => {
  if (!mainWindow || typeof mini !== 'boolean') return false;
  const width = mini ? 440 : 350;
  const height = mini ? 140 : 600;
  const area = screen.getDisplayMatching(mainWindow.getBounds()).workArea;
  const [x, y] = mainWindow.getPosition();
  mainWindow.setAlwaysOnTop(mini);
  mainWindow.setMaximizable(!mini);
  mainWindow.setResizable(!mini);
  mainWindow.setMinimumSize(mini ? 400 : 320, mini ? 128 : 550);
  mainWindow.setMaximumSize(mini ? 560 : 430, mini ? 180 : 740);
  mainWindow.setSize(width, height);
  mainWindow.setPosition(Math.max(area.x, Math.min(x, area.x + area.width - width)), Math.max(area.y, Math.min(y, area.y + area.height - height)));
  return mini;
});
ipcMain.on('window-close', event => {
  const window = BrowserWindow.fromWebContents(event.sender);
  if (window === videoWindow) videoWindow = null;
  window?.close();
});
ipcMain.on('window-minimize', event => BrowserWindow.fromWebContents(event.sender)?.minimize());
app.whenReady().then(async () => {
  try { const { createMpvMain } = await import('electron-mpv-video/main'); mpvMain = createMpvMain(); } catch (error) { console.error('MPV initialization failed:', error); }
  if (startupFileType === 'video') createVideoWindow(startupFilePath, path.basename(startupFilePath));
  else createWindow(launchMode);
});
app.on('before-quit', () => { void mpvMain?.dispose().catch(error => console.error('MPV shutdown failed:', error)); });
app.on('window-all-closed', () => app.quit());

