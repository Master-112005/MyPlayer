const $ = id => document.getElementById(id);
const shell = document.querySelector('.window-shell');
const cinemaView = $('cinemaView');
const videoGrid = $('videoGrid');
const cinemaNotes = $('cinemaNotes');
const cinemaSettingsPanel = $('cinemaSettingsPanel');
let videos = [];

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
function renderVideos() {
  const query = $('cinemaSearch').value.trim().toLocaleLowerCase();
  const visible = videos.filter(item => item.title.toLocaleLowerCase().includes(query));
  videoGrid.replaceChildren();
  for (const [index, item] of visible.entries()) {
    const card = document.createElement('button');
    card.className = 'video-card';
    card.dataset.tone = String(index % 8);
    const poster = document.createElement('span');
    poster.className = 'video-poster';
    poster.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l11-6.5-11-6.5Z"/></svg><span>MY CINEMA</span>';
    const details = document.createElement('span');
    details.className = 'video-card-details';
    const title = document.createElement('strong');
    title.textContent = item.title;
    const meta = document.createElement('small');
    meta.textContent = item.filename;
    details.append(title, meta);
    card.append(poster, details);
    card.addEventListener('click', () => window.player.openVideoWindow(item.path, item.title));
    videoGrid.append(card);
  }
  videoGrid.classList.toggle('hidden', visible.length === 0);
  $('cinemaEmpty').classList.toggle('hidden', videos.length > 0 && visible.length > 0);
  if (videos.length > 0 && visible.length === 0) {
    $('cinemaEmpty').querySelector('strong').textContent = 'No videos match your search';
    $('cinemaEmpty').querySelector('small').textContent = 'Try a different title.';
  } else {
    $('cinemaEmpty').querySelector('strong').textContent = videos.length ? 'No videos found' : 'Your movie library starts here';
    $('cinemaEmpty').querySelector('small').textContent = videos.length ? 'Choose another folder or check its video files.' : 'Choose a video folder in Settings to browse supported files.';
  }
}
async function chooseVideoFolder() {
  const result = await window.player.chooseVideoFolder();
  if (!result) return;
  localStorage.setItem('videoFolder', result.folder);
  videos = result.videos || [];
  renderVideos();
  cinemaSettingsPanel.classList.add('hidden');
  $('cinemaSettings').setAttribute('aria-expanded', 'false');
  setStatus(videos.length ? '' : 'No supported video files were found in that folder.');
}

async function refreshVideoLibrary() {
  const folder = localStorage.getItem('videoFolder');
  if (!folder) {
    setStatus('Choose a video folder in Settings first.');
    return;
  }
  try {
    videos = await window.player.scanVideoFolder(folder);
    renderVideos();
    setStatus(videos.length ? `Library refreshed · ${videos.length} videos` : 'No supported video files were found in that folder.');
  } catch (error) {
    setStatus(`Could not refresh the video library: ${error.message || error}`);
  }
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

const mode = new URLSearchParams(location.search).get('app') === 'cinema' ? 'cinema' : 'music';
document.title = mode === 'cinema' ? 'MyCinema' : 'MyMusic';
const splash = document.querySelector('.startup-splash');
splash.setAttribute('aria-label', mode === 'cinema' ? 'MyCinema' : 'MyMusic');
shell.classList.toggle('cinema-mode', mode === 'cinema');
shell.classList.remove('launcher-mode');
cinemaView.classList.toggle('hidden', mode !== 'cinema');
void window.player.setAppMode(mode);

if (mode === 'cinema') {
  const savedFolder = localStorage.getItem('videoFolder');
  if (savedFolder) {
    window.player.scanVideoFolder(savedFolder).then(items => {
      videos = items;
      renderVideos();
    }).catch(() => {});
  }
}
