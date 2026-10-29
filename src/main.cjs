const { app, BrowserWindow, dialog, ipcMain, screen } = require('electron');
const { pathToFileURL } = require('node:url');
const path = require('node:path');
const fs = require('node:fs/promises');

const audioExtensions = new Set(['.mp3', '.m4a', '.aac', '.wav', '.flac', '.ogg', '.opus', '.wma', '.aiff', '.aif']);
let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 350, height: 600, minWidth: 320, minHeight: 550,
    maxWidth: 430, maxHeight: 740, show: false, frame: false,
    transparent: true, backgroundColor: '#00000000', resizable: true,
    title: 'MyMusicPlayer',
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true }
  });
  mainWindow.loadFile(path.join(__dirname, 'index.html'));
  mainWindow.once('ready-to-show', () => mainWindow.show());
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
ipcMain.handle('track-info', async (_event, filePath) => {
  if (typeof filePath !== 'string') return null;
  try {
    const { parseFile } = await import('music-metadata');
    const metadata = await parseFile(filePath, { skipCovers: false, duration: true });
    const picture = metadata.common.picture?.[0];
    return {
      title: metadata.common.title || path.basename(filePath, path.extname(filePath)),
      artist: metadata.common.artist || metadata.common.albumartist || 'Unknown artist',
      album: metadata.common.album || '', duration: metadata.format.duration || 0,
      artwork: picture ? `data:${picture.format};base64,${picture.data.toString('base64')}` : null
    };
  } catch {
    return { title: path.basename(filePath, path.extname(filePath)), artist: 'Unknown artist', album: '', duration: 0, artwork: null };
  }
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
ipcMain.on('window-close', () => mainWindow?.close());
ipcMain.on('window-minimize', () => mainWindow?.minimize());
app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());

