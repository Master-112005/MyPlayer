const $ = id => document.getElementById(id);
const shell = document.querySelector('.window-shell');
const cinemaView = $('cinemaView');
const videoGrid = $('videoGrid');
const cinemaNotes = $('cinemaNotes');
const cinemaSettingsPanel = $('cinemaSettingsPanel');
let videos = [];
let videoFolders = [];
const folderKey = folder => folder.replace(/[\\/]+$/, '').toLocaleLowerCase();
function loadVideoFolders() {
  try {
    const saved = JSON.parse(localStorage.getItem('videoFolders') || '[]');
    videoFolders = Array.isArray(saved) ? [...new Set(saved.filter(folder => typeof folder === 'string' && folder))] : [];
  } catch { videoFolders = []; }
  if (!videoFolders.length) {
    const legacyFolder = localStorage.getItem('videoFolder');
    if (legacyFolder) videoFolders = [legacyFolder];
  }
}
function saveVideoFolders() {
  localStorage.setItem('videoFolders', JSON.stringify(videoFolders));
  localStorage.removeItem('videoFolder');
}
const posterCache = new Map();
const posterTargets = new WeakMap();
const posterJobs = [];
let activePosterJobs = 0;
const posterConcurrency = 2;

function generatePoster(path) {
  return new Promise(resolve => {
    const video = document.createElement('video');
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    let settled = false;
    let seeking = false;
    const timeout = setTimeout(() => finish(null), 10000);
    const finish = dataUrl => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      video.removeAttribute('src');
      video.load();
      video.remove();
      resolve(dataUrl);
    };
    const capture = () => {
      if (!video.videoWidth || !video.videoHeight || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return;
      try {
        const width = canvas.width = 480;
        const height = canvas.height = 270;
        const scale = Math.max(width / video.videoWidth, height / video.videoHeight);
        const sourceWidth = width / scale;
        const sourceHeight = height / scale;
        context.drawImage(video, (video.videoWidth - sourceWidth) / 2, (video.videoHeight - sourceHeight) / 2, sourceWidth, sourceHeight, 0, 0, width, height);
        finish(canvas.toDataURL('image/jpeg', 0.78));
      } catch { finish(null); }
    };
    video.muted = true;
    video.volume = 0;
    video.preload = 'metadata';
    video.playsInline = true;
    video.setAttribute('aria-hidden', 'true');
    video.style.cssText = 'position:fixed;width:1px;height:1px;left:-10px;top:-10px;opacity:0;pointer-events:none';
    video.addEventListener('error', () => finish(null), { once: true });
    video.addEventListener('loadeddata', () => { if (!seeking) capture(); }, { once: true });
    video.addEventListener('seeked', () => { seeking = false; capture(); }, { once: true });
    video.addEventListener('loadedmetadata', () => {
      if (Number.isFinite(video.duration) && video.duration > 0) {
        seeking = true;
        try { video.currentTime = Math.min(30, Math.max(0.1, video.duration * 0.12)); }
        catch { seeking = false; capture(); }
      }
    }, { once: true });
    document.body.append(video);
    video.src = window.player.videoFileUrl(path);
    video.load();
  });
}

function startPosterJobs() {
  while (activePosterJobs < posterConcurrency && posterJobs.length) {
    const { item, image, poster } = posterJobs.shift();
    if (!poster.isConnected) continue;
    activePosterJobs++;
    generatePoster(item.path).then(dataUrl => {
      if (!dataUrl) return;
      posterCache.delete(item.path);
      posterCache.set(item.path, dataUrl);
      while (posterCache.size > 64) posterCache.delete(posterCache.keys().next().value);
      if (poster.isConnected) {
        image.src = dataUrl;
        poster.classList.add('has-thumbnail');
      }
    }).finally(() => {
      activePosterJobs--;
      startPosterJobs();
    });
  }
}

const posterObserver = new IntersectionObserver(entries => {
  for (const entry of entries) {
    if (!entry.isIntersecting) continue;
    posterObserver.unobserve(entry.target);
    const target = posterTargets.get(entry.target);
    if (target && !posterCache.has(target.item.path)) posterJobs.push(target);
  }
  startPosterJobs();
}, { root: videoGrid, rootMargin: '160px 0px' });

function populateCinemaNotes() {
  const icons = [
    '<svg viewBox="0 0 48 48"><path d="M11 22h26l-3 20H14l-3-20Z"/><path d="M12 22c0-4 4-5 6-2 0-5 7-6 9-1 2-4 8-3 9 3"/><path d="M17 27v9m7-9v9m7-9v9"/></svg>',
    '<svg viewBox="0 0 48 48"><path d="M7 14h34v23H7z"/><path d="m7 20 8-6 8 6 8-6 10 6"/><path d="M15 29h8m5 0h5"/></svg>',
    '<svg viewBox="0 0 48 48"><circle cx="24" cy="24" r="17"/><path d="m20 16 13 8-13 8V16Z"/></svg>',
    '<svg viewBox="0 0 48 48"><path d="m8 18 30-8 3 10-30 8zM10 27h29v15H10z"/><path d="m17 16 6 8m5-11 6 8"/></svg>',
    '<svg viewBox="0 0 48 48"><rect x="8" y="10" width="32" height="28" rx="4"/><path d="M8 18h32M16 10v8m8-8v8m8-8v8M16 28h3m5 0h3m5 0h2"/></svg>',
    '<svg viewBox="0 0 48 48"><path d="m24 7 5.1 10.3 11.4 1.7-8.3 8.1 2 11.4L24 33.1l-10.2 5.4 2-11.4-8.3-8.1 11.4-1.7L24 7Z"/></svg>'
  ];
  for (let index = 0; index < 72; index++) {
    const node = document.createElement('span');
    node.className = 'cinema-note';
    node.innerHTML = icons[Math.floor(Math.random() * icons.length)];
    node.style.left = `${Math.random() * 96}%`;
    node.style.top = `${Math.random() * 94}%`;
    node.style.setProperty('--node-size', `${22 + Math.random() * 28}px`);
    node.style.setProperty('--node-duration', `${8 + Math.random() * 6}s`);
    node.style.animationDelay = `${-Math.random() * 12}s`;
    cinemaNotes.append(node);
  }
}

function setStatus(message) { $('cinemaStatus').textContent = message; }
function updateShelfFades(rail, row) {
  rail.classList.toggle('fade-left', row.scrollLeft > 2);
  rail.classList.toggle('fade-right', row.scrollLeft + row.clientWidth < row.scrollWidth - 2);
}

function createVideoCard(item, index) {
  const card = document.createElement('button');
  card.className = 'video-card';
  card.dataset.tone = String(index % 8);
  card.setAttribute('aria-label', `Play ${item.title}`);
  const poster = document.createElement('span');
  poster.className = 'video-poster';
  const thumbnail = document.createElement('img');
  thumbnail.className = 'video-poster-image';
  thumbnail.alt = `Video preview: ${item.title}`;
  const cachedPoster = posterCache.get(item.path);
  if (cachedPoster) {
    thumbnail.src = cachedPoster;
    poster.classList.add('has-thumbnail');
  } else {
    posterTargets.set(poster, { item, image: thumbnail, poster });
    posterObserver.observe(poster);
  }
  poster.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l11-6.5-11-6.5Z"/></svg>';
  poster.prepend(thumbnail);
  const details = document.createElement('span');
  details.className = 'video-card-details';
  const title = document.createElement('strong');
  title.textContent = item.title;
  const meta = document.createElement('small');
  meta.textContent = item.filename;
  details.append(title, meta);
  card.append(poster, details);
  card.addEventListener('click', () => window.player.openVideoWindow(item.path, item.title));
  return card;
}

function renderVideos() {
  const query = $('cinemaSearch').value.trim().toLocaleLowerCase();
  const visible = videos.filter(item => item.title.toLocaleLowerCase().includes(query) || (item.folder || '').toLocaleLowerCase().includes(query));
  videoGrid.replaceChildren();
  const groups = new Map();
  for (const item of visible) {
    const folder = item.folder || item.path.slice(0, Math.max(item.path.lastIndexOf('\\'), item.path.lastIndexOf('/')));
    if (!groups.has(folder)) groups.set(folder, []);
    groups.get(folder).push(item);
  }
  const sortedGroups = [...groups].sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));
  for (const [folder, items] of sortedGroups) {
    const shelf = document.createElement('section');
    shelf.className = 'video-shelf';
    const heading = document.createElement('div');
    heading.className = 'video-shelf-heading';
    const copy = document.createElement('div');
    copy.className = 'video-shelf-copy';
    const folderName = document.createElement('h2');
    folderName.textContent = folder.split(/[\\/]/).filter(Boolean).at(-1) || folder;
    const location = document.createElement('p');
    location.textContent = folder;
    location.title = folder;
    copy.append(folderName, location);
    const count = document.createElement('span');
    count.className = 'video-shelf-count';
    count.textContent = `${items.length} ${items.length === 1 ? 'VIDEO' : 'VIDEOS'}`;
    heading.append(copy, count);
    const rail = document.createElement('div');
    rail.className = 'video-shelf-rail';
    const row = document.createElement('div');
    row.className = 'video-shelf-row';
    row.setAttribute('aria-label', `Videos in ${folder}`);
    row.tabIndex = 0;
    row.addEventListener('scroll', () => updateShelfFades(rail, row), { passive: true });
    items.forEach((item, index) => row.append(createVideoCard(item, index)));
    rail.append(row);
    shelf.append(heading, rail);
    videoGrid.append(shelf);
    requestAnimationFrame(() => updateShelfFades(rail, row));
  }
  videoGrid.classList.toggle('hidden', visible.length === 0);
  $('cinemaEmpty').classList.toggle('hidden', videos.length > 0 && visible.length > 0);
  if (videos.length > 0 && visible.length === 0) {
    $('cinemaEmpty').querySelector('strong').textContent = 'No videos match your search';
    $('cinemaEmpty').querySelector('small').textContent = 'Try a different title.';
  } else {
    $('cinemaEmpty').querySelector('strong').textContent = videos.length ? 'No videos found' : 'Your movie library starts here';
    $('cinemaEmpty').querySelector('small').textContent = videos.length ? 'Choose another folder or check its video files.' : 'Add video folders in Settings to build your library.';
  }
}

async function scanConfiguredFolders() {
  if (!videoFolders.length) {
    videos = [];
    renderVideos();
    setStatus('Add a video folder in Settings to start your library.');
    return;
  }
  setStatus(`Scanning ${videoFolders.length} selected folder${videoFolders.length === 1 ? '' : 's'}…`);
  try {
    const results = await Promise.all(videoFolders.map(folder => window.player.scanVideoFolder(folder).catch(() => [])));
    videos = [...new Map(results.flat().map(item => [folderKey(item.path), item])).values()];
    renderVideos();
    setStatus(`${videos.length} videos in ${new Set(videos.map(item => item.folder)).size} folders`);
  } catch (error) {
    setStatus(`Could not scan selected folders: ${error.message || error}`);
  }
}

function renderVideoFolderSettings() {
  const list = $('videoFolderList');
  list.replaceChildren();
  list.hidden = videoFolders.length === 0;
  for (const folder of videoFolders) {
    const row = document.createElement('div');
    row.className = 'video-folder-row';
    const label = document.createElement('span');
    label.className = 'video-folder-path';
    label.textContent = folder;
    label.title = folder;
    const remove = document.createElement('button');
    remove.className = 'video-folder-remove';
    remove.type = 'button';
    remove.textContent = 'Remove';
    remove.setAttribute('aria-label', `Remove ${folder} from MyCinema`);
    remove.addEventListener('click', async () => {
      videoFolders = videoFolders.filter(item => folderKey(item) !== folderKey(folder));
      saveVideoFolders();
      renderVideoFolderSettings();
      await scanConfiguredFolders();
    });
    row.append(label, remove);
    list.append(row);
  }
}

async function chooseVideoFolder() {
  const result = await window.player.chooseVideoFolder();
  if (!result) return;
  if (videoFolders.some(folder => folderKey(folder) === folderKey(result.folder))) {
    setStatus('That folder is already in your library.');
    return;
  }
  videoFolders.push(result.folder);
  saveVideoFolders();
  renderVideoFolderSettings();
  cinemaSettingsPanel.classList.add('hidden');
  $('cinemaSettings').setAttribute('aria-expanded', 'false');
  await scanConfiguredFolders();
}

async function refreshVideoLibrary() {
  await scanConfiguredFolders();
}

$('videoFolderButton').addEventListener('click', chooseVideoFolder);
$('refreshVideoLibrary').addEventListener('click', refreshVideoLibrary);
$('defaultVideoButton').addEventListener('click', async () => {
  if (await window.player.openDefaultApps('video')) setStatus('In Windows Settings, choose another app for .mp4 and any other video formats assigned to MyCinema.');
  else setStatus('Windows Default Apps settings could not be opened.');
});
$('cinemaSearch').addEventListener('input', renderVideos);
$('cinemaMinimize').addEventListener('click', () => window.player.minimize());
$('cinemaClose').addEventListener('click', () => window.player.close());
$('cinemaSettings').addEventListener('click', () => {
  const open = cinemaSettingsPanel.classList.toggle('hidden');
  $('cinemaSettings').setAttribute('aria-expanded', String(!open));
});
const cinemaVolumeBoostToggle = $('cinemaVolumeBoostToggle');
const cinemaVolumeWarning = $('cinemaVolumeWarning');
async function saveCinemaVolumeBoost(enabled) {
  try {
    if (!await window.player.setCinemaVolumeBoost(enabled)) throw new Error('save failed');
    cinemaVolumeBoostToggle.checked = enabled;
  } catch {
    cinemaVolumeBoostToggle.checked = !enabled;
    setStatus('Could not save the volume setting. Try again.');
  }
}
cinemaVolumeBoostToggle.addEventListener('change', () => {
  if (cinemaVolumeBoostToggle.checked) {
    cinemaVolumeBoostToggle.checked = false;
    if (!cinemaVolumeWarning.open) cinemaVolumeWarning.showModal();
  } else void saveCinemaVolumeBoost(false);
});
cinemaVolumeWarning.addEventListener('close', () => {
  if (cinemaVolumeWarning.returnValue === 'enable') void saveCinemaVolumeBoost(true);
});
document.addEventListener('click', event => {
  if (!event.target.closest('#cinemaSettingsPanel, #cinemaSettings')) {
    cinemaSettingsPanel.classList.add('hidden');
    $('cinemaSettings').setAttribute('aria-expanded', 'false');
  }
});
document.addEventListener('keydown', event => {
  if (event.key === 'Escape') {
    cinemaSettingsPanel.classList.add('hidden');
    $('cinemaSettings').setAttribute('aria-expanded', 'false');
  }
});
populateCinemaNotes();
window.addEventListener('blur', () => cinemaView.classList.add('cinema-idle'));
window.addEventListener('focus', () => cinemaView.classList.remove('cinema-idle'));

const mode = new URLSearchParams(location.search).get('app') === 'cinema' ? 'cinema' : 'music';
document.title = mode === 'cinema' ? 'MyCinema' : 'MyMusic';
const splash = document.querySelector('.startup-splash');
splash.setAttribute('aria-label', mode === 'cinema' ? 'MyCinema' : 'MyMusic');
shell.classList.toggle('cinema-mode', mode === 'cinema');
shell.classList.remove('launcher-mode');
cinemaView.classList.toggle('hidden', mode !== 'cinema');
if (mode === 'cinema') {
  window.player.getCinemaVolumeBoost().then(enabled => { cinemaVolumeBoostToggle.checked = Boolean(enabled); }).catch(() => {
    setStatus('Could not load the volume setting. Standard 100% limit is active.');
  });
}

if (mode === 'cinema') {
  loadVideoFolders();
  renderVideoFolderSettings();
  void scanConfiguredFolders();
}
