const audio = document.getElementById('audio');
const $ = id => document.getElementById(id);
const ui = {
  searchButton: $('searchButton'), searchInput: $('searchInput'), modeToggle: $('modeToggle'), minimizeButton: $('minimizeButton'), closeButton: $('closeButton'), miniMuteButton: $('miniMuteButton'), playerBackButton: $('playerBackButton'),
  playButton: $('playButton'), previousButton: $('previousButton'), nextButton: $('nextButton'),
  playbackOptions: document.querySelector('.playback-options'), playbackOptionsButton: $('playbackOptionsButton'), miniPlaybackOptionsButton: $('miniPlaybackOptionsButton'), playbackOptionsMenu: $('playbackOptionsMenu'), shuffleOption: $('shuffleOption'), repeatOptions: [...document.querySelectorAll('[data-repeat-mode]')], queueButton: $('queueButton'), homeButton: $('homeButton'),
  favoriteButton: $('favoriteButton'), miniFavoriteButton: $('miniFavoriteButton'), playerAddPlaylistButton: $('playerAddPlaylistButton'), seekBar: $('seekBar'), volumeBar: $('volumeBar'), volumeMuteButton: $('volumeMuteButton'),
  volumeValue: $('volumeValue'), currentTime: $('currentTime'), duration: $('duration'),
  trackTitle: $('trackTitle'), trackArtist: $('trackArtist'), trackCount: $('trackCount'), libraryLabel: $('libraryLabel'),
  artwork: $('artwork'), artworkWrap: $('artworkWrap'), visualizer: $('visualizer'), queuePanel: $('queuePanel'), queueList: $('queueList'),
  toast: $('toast'), homeTitle: $('homeTitle'), homeShortcuts: $('homeShortcuts'), homeLibrary: $('homeLibrary'), sortToolbar: $('sortToolbar'), sortBy: $('sortBy'), sortPickerButton: $('sortPickerButton'), sortPickerValue: $('sortPickerValue'), sortPickerOptions: $('sortPickerOptions'), settingsView: $('settingsView'),
  playlistGrid: $('playlistGrid'), homeSongCount: $('homeSongCount'), favoriteSongCount: $('favoriteSongCount'), settingsPlaylistList: $('settingsPlaylistList'), homeNotes: $('homeNotes'), colorNotesToggle: $('colorNotesToggle'), homeSearch: document.querySelector('.home-search'), homeSearchButton: $('homeSearchButton'), homeCreatePlaylistButton: $('homeCreatePlaylistButton'), homeSettingsButton: $('homeSettingsButton'), homeHomeButton: $('homeHomeButton'), playlistBackButton: $('playlistBackButton'), homeCloseButton: $('homeCloseButton'), homeMinimizeButton: $('homeMinimizeButton'), settingsFolderButton: $('settingsFolderButton'), settingsRescanButton: $('settingsRescanButton'), defaultAudioButton: $('defaultAudioButton'),
  allSongsCard: $('allSongsCard'), favoritesCard: $('favoritesCard'), playlistDialog: $('playlistDialog'), playlistForm: $('playlistForm'), miniEdgeColorToggle: $('miniEdgeColorToggle'), settingsColorToggle: $('settingsColorToggle'), settingsColorOptions: $('settingsColorOptions'), settingsPlaylistToggle: $('settingsPlaylistToggle'),
  playlistName: $('playlistName'), cancelPlaylist: $('cancelPlaylist'), addPlaylistDialog: $('addPlaylistDialog'), addPlaylistForm: $('addPlaylistForm'), playlistChoices: $('playlistChoices'), cancelAddPlaylist: $('cancelAddPlaylist'), confirmationDialog: $('confirmationDialog'), confirmationTitle: $('confirmationTitle'), confirmationMessage: $('confirmationMessage'), nowPlayingPlay: $('nowPlayingPlay'),
  nowPlayingBar: $('nowPlayingBar'), nowPlayingTitle: $('nowPlayingTitle'), nowPlayingArtist: $('nowPlayingArtist'), nowPlayingArt: $('nowPlayingArt')
};
let tracks = [];
let folder = localStorage.getItem('musicFolder') || '';
let currentIndex = -1;
let pendingResume = null;
let lastPositionSavedAt = 0;
let sortMode = ['title', 'date-added'].includes(localStorage.getItem('musicSortMode')) ? localStorage.getItem('musicSortMode') : 'manual';
let shuffle = localStorage.getItem('shuffle') === 'true';
let repeatMode = ['all', 'one'].includes(localStorage.getItem('repeatMode')) ? localStorage.getItem('repeatMode') : 'off';
// Older saved state could enable Shuffle and Repeat at the same time. Keep
// Shuffle when restoring that state, and make the three modes exclusive.
if (shuffle && repeatMode !== 'off') {
  repeatMode = 'off';
  localStorage.setItem('repeatMode', repeatMode);
}
let favorites = new Set(JSON.parse(localStorage.getItem('favorites') || '[]'));
let colorfulNotes = localStorage.getItem('colorfulNotes') === 'true';
let coloredMiniEdges = localStorage.getItem('coloredMiniEdges') !== 'false';
let artworkEdgeRgb = '255,255,255';
let toastTimer;
let trackRequest = 0;
let miniMode = false;
let miniResizePending = false;
let miniModeSyncPending = true;
let homeView = 'home';
let selectedPlaylistId = null;
let playerReturnView = 'home';
let playerReturnPlaylistId = null;
let playerReturnToPlayer = false;
let playerReturnSearch = '';
let playbackPaths = null;
let playbackSource = null;
let queueReturnToPlayer = false;
let searchMetadataSource = null;
let searchMetadataTask = null;
let searchIndexing = false;
let searchRenderTimer;
const searchFieldCache = new WeakMap();
const queueArtworkObserver = new IntersectionObserver(entries => {
  for (const entry of entries) {
    if (!entry.isIntersecting) continue;
    queueArtworkObserver.unobserve(entry.target);
    const track = entry.target.__musicTrack;
    if (!track || track.artworkLoaded) { if (track) paintQueueArtwork(entry.target, track); continue; }
    void fetchTrackInfo(track).then(() => paintQueueArtwork(entry.target, track)).catch(() => paintQueueArtwork(entry.target, track));
  }
}, { root: document.getElementById('queueList'), rootMargin: '72px' });
let trackToAdd = null;
let selectedPlaylistIds = new Set();
let playlists = [];
try { const saved = JSON.parse(localStorage.getItem('playlists') || '[]'); if (Array.isArray(saved)) playlists = saved.filter(item => item && typeof item.id === 'string' && typeof item.name === 'string' && Array.isArray(item.tracks)).map(item => ({ ...item, tracks: item.tracks.filter(path => typeof path === 'string') })); } catch {}
let draggedIndex = -1;
let suppressRowClick = false;
let visualizerContext, analyser, visualizerFrame;
let edgeEnergy = 0;
let edgeBeat = 0;
let edgeFlowAngle = 0;
let lastEdgeStyleTime = 0;
let previousBass = 0;
let previousVisualizerTime = 0;
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
let artworkColorRequest = 0;
updatePlaybackOptions();
ui.sortBy.value = sortMode;
syncSortPicker();
audio.volume = 0.75;

function syncSortPicker() {
  if (!ui.sortPickerValue) return;
  ui.sortPickerValue.textContent = ui.sortBy.selectedOptions[0]?.text || 'Manual';
  ui.sortPickerOptions.querySelectorAll('[data-sort-value]').forEach(option => {
    option.setAttribute('aria-selected', String(option.dataset.sortValue === ui.sortBy.value));
  });
}
function closeSortPicker(returnFocus = false) {
  ui.sortPickerOptions.hidden = true;
  ui.sortPickerButton.setAttribute('aria-expanded', 'false');
  if (returnFocus) ui.sortPickerButton.focus();
}

function updatePlaybackOptions() {
  const open = !ui.playbackOptionsMenu.hidden;
  ui.playbackOptionsButton.setAttribute('aria-expanded', String(open));
  ui.miniPlaybackOptionsButton.setAttribute('aria-expanded', String(open));
  ui.playbackOptionsButton.classList.toggle('active', shuffle || repeatMode !== 'off');
  ui.miniPlaybackOptionsButton.classList.toggle('is-shuffle', shuffle);
  ui.miniPlaybackOptionsButton.classList.toggle('is-repeat-all', repeatMode === 'all');
  ui.miniPlaybackOptionsButton.classList.toggle('is-repeat-one', repeatMode === 'one');
  const activeMode = shuffle ? 'Shuffle' : repeatMode === 'all' ? 'Repeat All' : repeatMode === 'one' ? 'Repeat One' : '';
  ui.miniPlaybackOptionsButton.classList.toggle('active', Boolean(activeMode));
  ui.miniPlaybackOptionsButton.setAttribute('aria-pressed', String(Boolean(activeMode)));
  ui.miniPlaybackOptionsButton.title = activeMode || 'Playback options';
  ui.miniPlaybackOptionsButton.setAttribute('aria-label', activeMode ? `${activeMode} active. Open playback options` : 'Playback options');
  ui.playbackOptionsButton.classList.toggle('is-shuffle', shuffle);
  ui.playbackOptionsButton.classList.toggle('is-repeat-all', repeatMode === 'all');
  ui.playbackOptionsButton.classList.toggle('is-repeat-one', repeatMode === 'one');
  ui.playbackOptionsButton.title = activeMode || 'Playback options';
  ui.playbackOptionsButton.setAttribute('aria-label', activeMode ? `${activeMode} active. Open playback options` : 'Playback options');
  ui.shuffleOption.classList.toggle('selected', shuffle);
  ui.shuffleOption.setAttribute('aria-pressed', String(shuffle));
  ui.shuffleOption.title = shuffle ? 'Shuffle on' : 'Shuffle off';
  ui.shuffleOption.setAttribute('aria-label', ui.shuffleOption.title);
  ui.repeatOptions.forEach(option => {
    const selected = option.dataset.repeatMode === repeatMode;
    option.classList.toggle('selected', selected);
    option.setAttribute('aria-pressed', String(selected));
    option.title = option.dataset.repeatMode === 'all' ? 'Repeat all' : 'Repeat one';
    option.setAttribute('aria-label', option.title);
  });
}

function closePlaybackOptions() {
  ui.playbackOptionsMenu.hidden = true;
  updatePlaybackOptions();
}

function formatTime(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  return `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
}
function showToast(message, duration = 2600, audioStatus = false) {
  ui.toast.textContent = message;
  ui.toast.classList.toggle('audio-status', audioStatus);
  ui.toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => ui.toast.classList.remove('show'), duration);
}
function confirmInApp(message) {
  ui.confirmationTitle.textContent = 'Remove playlist?';
  ui.confirmationMessage.textContent = message;
  return new Promise(resolve => {
    ui.confirmationDialog.addEventListener('close', () => resolve(ui.confirmationDialog.returnValue === 'confirm'), { once: true });
    ui.confirmationDialog.showModal();
  });
}
function setPlaying(playing) {
  ui.playButton.setAttribute('aria-label', playing ? 'Pause' : 'Play');
  ui.playButton.querySelector('.play-icon').classList.toggle('hidden', playing);
  ui.playButton.querySelector('.pause-icon').classList.toggle('hidden', !playing);
  ui.nowPlayingPlay.querySelector('.mini-play-icon').classList.toggle('hidden', playing);
  ui.nowPlayingPlay.querySelector('.mini-pause-icon').classList.toggle('hidden', !playing);
  ui.nowPlayingPlay.setAttribute('aria-label', playing ? 'Pause' : 'Play');
}
function paintRange(input, percent) { input.style.setProperty('--progress', `${Math.max(0, Math.min(100, percent))}%`); }
function setSeekValue(value) {
  const clamped = Math.max(0, Math.min(1000, Math.round(value)));
  ui.seekBar.value = String(clamped);
  ui.seekBar.setAttribute('aria-valuenow', String(clamped));
  paintRange(ui.seekBar, clamped / 10);
}
function sourceTrackPaths() {
  if (playbackSource?.type === 'playlist') return playlists.find(item => item.id === playbackSource.id)?.tracks || [];
  if (playbackSource?.type === 'favorites') return tracks.filter(track => favorites.has(track.path)).map(track => track.path);
  return tracks.map(track => track.path);
}
function setPlaybackPaths(paths, firstPath = tracks[currentIndex]?.path) {
  const available = [...new Set(paths)].filter(path => tracks.some(track => track.path === path));
  if (shuffle && available.length > 1) {
    for (let i = available.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [available[i], available[j]] = [available[j], available[i]];
    }
    const first = available.indexOf(firstPath);
    if (first > 0) available.unshift(...available.splice(first, 1));
  }
  playbackPaths = available;
}
function setMuted(muted) {
  audio.muted = muted;
  ui.volumeMuteButton.classList.toggle('muted', muted);
  ui.volumeMuteButton.setAttribute('aria-label', muted ? 'Unmute' : 'Mute');
  ui.volumeMuteButton.title = muted ? 'Unmute' : 'Mute';
  ui.miniMuteButton.classList.toggle('muted', muted);
  ui.miniMuteButton.setAttribute('aria-label', muted ? 'Unmute' : 'Mute');
  ui.miniMuteButton.title = muted ? 'Unmute' : 'Mute';
  localStorage.setItem('muted', String(muted));
}
function setMiniEdgeColor(rgb) {
  if (rgb) artworkEdgeRgb = rgb;
  document.querySelector('.window-shell').style.setProperty('--mini-edge-rgb', coloredMiniEdges ? artworkEdgeRgb : '255,255,255');
  ui.artworkWrap.style.setProperty('--artwork-rgb', artworkEdgeRgb);
}
function readArtworkEdgeColor(source) {
  const request = ++artworkColorRequest;
  if (!source) { setMiniEdgeColor(); return; }
  const image = new Image();
  image.onload = () => {
    if (request !== artworkColorRequest) return;
    try {
      const canvas = document.createElement('canvas'); canvas.width = 12; canvas.height = 12;
      const context = canvas.getContext('2d', { willReadFrequently: true });
      context.drawImage(image, 0, 0, 12, 12);
      const pixels = context.getImageData(2, 2, 8, 8).data;
      let red = 0, green = 0, blue = 0, count = 0;
      for (let i = 0; i < pixels.length; i += 4) {
        const lightness = (pixels[i] + pixels[i + 1] + pixels[i + 2]) / 3;
        if (pixels[i + 3] < 100 || lightness < 24 || lightness > 242) continue;
        red += pixels[i]; green += pixels[i + 1]; blue += pixels[i + 2]; count++;
      }
      const brighten = value => Math.round(value / count * 0.75 + 255 * 0.25);
      setMiniEdgeColor(count ? `${brighten(red)},${brighten(green)},${brighten(blue)}` : '225,225,225');
    } catch { setMiniEdgeColor(); }
  };
  image.onerror = () => { if (request === artworkColorRequest) setMiniEdgeColor(); };
  image.src = source;
}
function drawVisualizer() {
  const canvas = ui.visualizer;
  const shell = document.querySelector('.window-shell');
  const bounds = canvas.getBoundingClientRect();
  const ratio = window.devicePixelRatio || 1;
  if (canvas.width !== Math.round(bounds.width * ratio) || canvas.height !== Math.round(bounds.height * ratio)) {
    canvas.width = Math.round(bounds.width * ratio); canvas.height = Math.round(bounds.height * ratio);
  }
  const context = canvas.getContext('2d');
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  const width = bounds.width, height = bounds.height, levels = new Uint8Array(analyser.frequencyBinCount);
  cancelAnimationFrame(visualizerFrame);
  const draw = timestamp => {
    visualizerFrame = requestAnimationFrame(draw);
    context.clearRect(0, 0, width, height);
    if (audio.paused || audio.ended) {
      cancelAnimationFrame(visualizerFrame); visualizerFrame = 0;
      edgeEnergy = 0; edgeBeat = 0; previousBass = 0; previousVisualizerTime = 0;
      shell.style.setProperty('--mini-edge-energy', '0');
      shell.style.setProperty('--mini-edge-wobble', '0');
      return;
    }
    analyser.getByteFrequencyData(levels);
    let total = 0;
    for (const level of levels) total += level * level;
    const target = Math.min(1, Math.sqrt(total / levels.length) / 90);
    edgeEnergy += (target - edgeEnergy) * (target > edgeEnergy ? 0.32 : 0.12);
    let bassTotal = 0;
    const bassBins = Math.min(6, levels.length);
    for (let i = 0; i < bassBins; i++) bassTotal += levels[i] * levels[i];
    const bass = Math.sqrt(bassTotal / bassBins) / 255;
    const bassRise = bass - previousBass;
    if (bass > 0.09 && bassRise > 0.018) edgeBeat = Math.min(1, edgeBeat + Math.min(0.5, bassRise * 4 + 0.12));
    else edgeBeat *= 0.9;
    previousBass = bass;
    const motionEnergy = Math.min(1, edgeEnergy * 0.7 + edgeBeat * 0.75);
    const delta = previousVisualizerTime ? Math.min(0.05, (timestamp - previousVisualizerTime) / 1000) : 1 / 60;
    previousVisualizerTime = timestamp;
    if (timestamp - lastEdgeStyleTime >= 1000 / 30) {
      lastEdgeStyleTime = timestamp;
      ui.artworkWrap.style.setProperty('--artwork-edge-energy', motionEnergy.toFixed(3));
      ui.artworkWrap.style.setProperty('--artwork-edge-wobble', reduceMotion ? '0' : edgeBeat.toFixed(3));
      if (!reduceMotion) {
        edgeFlowAngle = (edgeFlowAngle + delta * (14 + (1 - motionEnergy) * 150)) % 360;
        ui.artworkWrap.style.setProperty('--artwork-flow-angle', `${edgeFlowAngle.toFixed(1)}deg`);
      }
      if (miniMode) {
        shell.style.setProperty('--mini-edge-energy', motionEnergy.toFixed(3));
        shell.style.setProperty('--mini-edge-wobble', reduceMotion ? '0' : edgeBeat.toFixed(3));
        if (!reduceMotion) shell.style.setProperty('--mini-flow-angle', `${edgeFlowAngle.toFixed(1)}deg`);
      }
    }
    const bars = 34, gap = 2, barWidth = (width - gap * (bars - 1)) / bars;
    const waveform = context.createLinearGradient(0, height * .2, 0, height * .8);
    waveform.addColorStop(0, `rgba(${artworkEdgeRgb},.55)`);
    waveform.addColorStop(.5, `rgba(${artworkEdgeRgb},.98)`);
    waveform.addColorStop(1, `rgba(${artworkEdgeRgb},.55)`);
    context.fillStyle = waveform;
    for (let i = 0; i < bars; i++) {
      const value = levels[Math.floor(i * levels.length / bars)] / 255;
      const barHeight = Math.max(3, value * height * .88);
      const x = i * (barWidth + gap), y = (height - barHeight) / 2;
      context.beginPath();
      context.roundRect(x, y, barWidth, barHeight, barWidth / 2);
      context.fill();
    }
  };
  draw(performance.now());
}
function startVisualizer() {
  try {
    if (!analyser) {
      visualizerContext = new AudioContext();
      analyser = visualizerContext.createAnalyser(); analyser.fftSize = 128;
      visualizerContext.createMediaElementSource(audio).connect(analyser);
      analyser.connect(visualizerContext.destination);
    }
    visualizerContext.resume().then(drawVisualizer).catch(() => {});
  } catch {}
}
function stopVisualizer() {
  cancelAnimationFrame(visualizerFrame); visualizerFrame = 0;
  const canvas = ui.visualizer, context = canvas.getContext('2d');
  context.setTransform(1, 0, 0, 1, 0, 0); context.clearRect(0, 0, canvas.width, canvas.height);
  edgeEnergy = 0;
  edgeBeat = 0; previousBass = 0; previousVisualizerTime = 0;
  lastEdgeStyleTime = 0;
  ui.artworkWrap.style.setProperty('--artwork-edge-energy', '0');
  ui.artworkWrap.style.setProperty('--artwork-edge-wobble', '0');
  ui.artworkWrap.style.setProperty('--artwork-flow-angle', `${edgeFlowAngle.toFixed(1)}deg`);
  document.querySelector('.window-shell').style.setProperty('--mini-edge-energy', '0');
  document.querySelector('.window-shell').style.setProperty('--mini-edge-wobble', '0');
}
function setTrackCount() {
  const playlist = playbackSource?.type === 'playlist' ? playlists.find(item => item.id === playbackSource.id) : null;
  const count = playbackSource?.type === 'favorites' ? tracks.filter(track => favorites.has(track.path)).length : playbackSource?.type === 'playlist' ? playlist?.tracks.length || 0 : tracks.length;
  ui.trackCount.textContent = `${count} TRACK${count === 1 ? '' : 'S'}`;
}
function updatePlaybackHeader() {
  const playlist = playbackSource?.type === 'playlist' ? playlists.find(item => item.id === playbackSource.id) : null;
  const name = playbackSource?.type === 'favorites' ? 'Favorites' : playlist?.name;
  if (playbackSource) ui.libraryLabel.textContent = `NOW PLAYING${name ? ` ${name}` : ''}`;
  setTrackCount();
}
function updateNowPlaying() {
  const track = tracks[currentIndex];
  const hasArtwork = ui.artwork.classList.contains('has-art');
  ui.nowPlayingTitle.textContent = track?.title || track?.filename?.replace(/\.[^.]+$/, '') || 'Not Playing';
  ui.nowPlayingArtist.textContent = track?.artist || (track ? 'Unknown artist' : 'Choose a song');
  ui.nowPlayingArt.style.backgroundImage = hasArtwork ? ui.artwork.style.backgroundImage : '';
  ui.nowPlayingArt.classList.toggle('has-art', hasArtwork);
}
function renderPlaylists() {
  ui.homeSongCount.textContent = `${tracks.length} ${tracks.length === 1 ? 'song' : 'songs'}`;
  const favoriteCount = tracks.filter(track => favorites.has(track.path)).length;
  ui.favoriteSongCount.textContent = `${favoriteCount} ${favoriteCount === 1 ? 'song' : 'songs'}`;
  ui.playlistGrid.replaceChildren();
  ui.settingsPlaylistList.replaceChildren();
  for (const playlist of playlists) {
    const card = document.createElement('button');
    card.className = 'home-card playlist-card'; card.type = 'button';
    const art = document.createElement('span'); art.className = 'home-card-icon'; art.textContent = String.fromCharCode(9835);
    const name = document.createElement('strong'); name.textContent = playlist.name;
    const count = document.createElement('small'); count.textContent = `${playlist.tracks.length} ${playlist.tracks.length === 1 ? 'song' : 'songs'}`;
    card.append(art, name, count); card.addEventListener('click', () => showHome('playlist', playlist.id)); ui.playlistGrid.append(card);
    const row = document.createElement('div'); row.className = 'settings-playlist-row';
    const playlistName = document.createElement('span'); playlistName.textContent = playlist.name;
    const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'settings-action remove-playlist'; remove.textContent = 'Remove';
    remove.addEventListener('click', async () => {
      if (!await confirmInApp(`Remove “${playlist.name}”? The song files will stay in your library.`)) return;
      if (playbackSource?.type === 'playlist' && playbackSource.id === playlist.id) { playbackSource = { type: 'all' }; playbackPaths = null; }
      playlists = playlists.filter(item => item.id !== playlist.id); savePlaylists();
      updatePlaybackHeader();
      if (homeView === 'playlist' && selectedPlaylistId === playlist.id) showHome(); else { renderPlaylists(); renderQueue(); }
      showToast(`Removed ${playlist.name}`);
    });
    row.append(playlistName, remove); ui.settingsPlaylistList.append(row);
  }
}
function showHome(view = 'home', playlistId = null, returnToPlayer = false) {
  homeView = view; selectedPlaylistId = playlistId; queueReturnToPlayer = returnToPlayer;
  const playlist = playlists.find(item => item.id === playlistId);
  const shell = document.querySelector('.window-shell');
  shell.classList.add('home-open'); shell.classList.remove('player-open');
  ui.queuePanel.classList.add('open'); ui.queuePanel.setAttribute('aria-hidden', 'false');
  ui.homeShortcuts.classList.toggle('hidden', view !== 'home');
  ui.homeCreatePlaylistButton.classList.toggle('hidden', view !== 'home');
  ui.homeLibrary.classList.toggle('hidden', !['all', 'playlist', 'favorites', 'search'].includes(view));
  ui.settingsView.classList.toggle('hidden', view !== 'settings');
  ui.homeHomeButton.classList.toggle('hidden', view === 'home');
  const canGoBack = ['playlist', 'favorites', 'all'].includes(view);
  ui.playlistBackButton.classList.toggle('hidden', !canGoBack);
  ui.playlistBackButton.title = queueReturnToPlayer ? 'Back to player' : 'Back to home';
  ui.playlistBackButton.setAttribute('aria-label', queueReturnToPlayer ? 'Back to player' : 'Back to home');
  ui.homeSettingsButton.classList.toggle('hidden', view === 'settings');
  ui.homeLibrary.classList.toggle('all-songs-view', view === 'all');
  ui.sortToolbar.classList.toggle('hidden', queueReturnToPlayer || !['all', 'playlist', 'favorites'].includes(view));
  ui.homeTitle.textContent = view === 'playlist' ? playlist?.name || 'Playlist' : view === 'favorites' ? 'Favorites' : view === 'settings' ? 'Settings' : view === 'search' ? 'Search' : view === 'all' ? 'All Songs' : 'Home';
  ui.queuePanel.classList.remove('search-open'); ui.homeSearch.classList.add('hidden');
  ui.searchInput.value = ''; renderPlaylists(); renderQueue();
  if (sortMode === 'title' && ['all', 'playlist', 'favorites'].includes(view)) void indexSearchMetadata();
}
function showPlayer() {
  const shell = document.querySelector('.window-shell');
  if (!shell.classList.contains('player-open')) {
    playerReturnView = homeView;
    playerReturnPlaylistId = selectedPlaylistId;
    playerReturnToPlayer = queueReturnToPlayer;
    playerReturnSearch = ui.searchInput.value;
  }
  shell.classList.remove('home-open'); shell.classList.add('player-open');
  ui.queuePanel.classList.remove('open'); ui.queuePanel.setAttribute('aria-hidden', 'true');
}
function returnToPlayerEntry() {
  if (playerReturnView === 'playlist' && !playlists.some(item => item.id === playerReturnPlaylistId)) return showHome();
  showHome(playerReturnView, playerReturnPlaylistId, playerReturnToPlayer);
  if (playerReturnView === 'search') {
    ui.homeSearch.classList.remove('hidden'); ui.queuePanel.classList.add('search-open');
    ui.searchInput.value = playerReturnSearch;
    ui.searchInput.dispatchEvent(new Event('input', { bubbles: true }));
  }
}
function savePlaylists() { localStorage.setItem('playlists', JSON.stringify(playlists)); }
function openSearch() {
  if (homeView === 'search' && ui.queuePanel.classList.contains('search-open')) {
    void indexSearchMetadata(); ui.searchInput.focus(); return;
  }
  showHome('search');
  ui.homeSearch.classList.remove('hidden'); ui.queuePanel.classList.add('search-open');
  void indexSearchMetadata(); requestAnimationFrame(() => ui.searchInput.focus());
}
function addTrackToPlaylist(path) {
  if (!playlists.length) { showToast('Create a playlist first'); return; }
  trackToAdd = path;
  selectedPlaylistIds = new Set(playlists.filter(playlist => playlist.tracks.includes(path)).map(playlist => playlist.id));
  ui.playlistChoices.replaceChildren(...playlists.map(playlist => {
    const alreadyAdded = playlist.tracks.includes(path);
    const option = document.createElement('button'); option.type = 'button'; option.className = 'playlist-choice';
    option.classList.toggle('selected', alreadyAdded); option.setAttribute('aria-pressed', String(alreadyAdded));
    const name = document.createElement('span'); name.textContent = playlist.name; option.append(name);
    const status = document.createElement('small');
    status.textContent = alreadyAdded ? 'Added' : '';
    option.append(status);
    option.addEventListener('click', () => {
      const selected = selectedPlaylistIds.has(playlist.id);
      if (selected) selectedPlaylistIds.delete(playlist.id); else selectedPlaylistIds.add(playlist.id);
      option.classList.toggle('selected', !selected); option.setAttribute('aria-pressed', String(!selected));
      status.textContent = selected ? (alreadyAdded ? 'Remove' : '') : (alreadyAdded ? 'Added' : 'Add');
    });
    return option;
  }));
  ui.addPlaylistDialog.showModal();
}
function removeTrackFromPlaylist(path) {
  const playlist = playlists.find(item => item.id === selectedPlaylistId);
  if (!playlist) return;
  playlist.tracks = playlist.tracks.filter(item => item !== path);
  if (playbackSource?.type === 'playlist' && playbackSource.id === playlist.id) setPlaybackPaths(playlist.tracks);
  savePlaylists(); updatePlaybackHeader(); renderPlaylists(); renderQueue(); showToast(`Removed from ${playlist.name}`);
}
function populateMusicNotes() {
  const glyphs = ['♫', '♪', '♬', '♩'];
  for (let i = 0; i < 72; i++) {
    const note = document.createElement('span');
    note.textContent = glyphs[i % glyphs.length];
    note.style.left = `${(i * 37 + 3) % 98}%`;
    note.style.top = `${(i * 61 + 5) % 96}%`;
    note.style.fontSize = `${20 + (i * 17) % 32}px`;
    note.style.setProperty('--note-color', `hsl(${Math.floor(Math.random() * 360)} 95% 68%)`);
    note.style.animationDelay = `-${(i * 7) % 80 / 10}s`;
    ui.homeNotes.append(note);
  }
}
function orderKey() { return 'music-order:' + folder; }
function restoreTrackOrder() {
  try {
    const saved = JSON.parse(localStorage.getItem(orderKey()) || '[]');
    const order = new Map((Array.isArray(saved) ? saved : []).map((file, index) => [file, index]));
    tracks.sort((a, b) => (order.get(a.path) ?? Infinity) - (order.get(b.path) ?? Infinity) || a.filename.localeCompare(b.filename, undefined, { numeric: true, sensitivity: 'base' }));
  } catch {}
}
function saveTrackOrder() { if (folder) localStorage.setItem(orderKey(), JSON.stringify(tracks.map(track => track.path))); }
function restoreTrackAddedDates(list = tracks) {
  if (!folder) return;
  const key = `music-added:${folder}`;
  let added = {};
  try { added = JSON.parse(localStorage.getItem(key) || '{}'); if (!added || typeof added !== 'object' || Array.isArray(added)) added = {}; } catch {}
  const now = Date.now(); let changed = false;
  for (const track of list) {
    if (Number.isFinite(added[track.path])) track.addedAt = added[track.path];
    else { track.addedAt = now; added[track.path] = now; changed = true; }
  }
  if (changed) localStorage.setItem(key, JSON.stringify(added));
}
function normalizeSearch(value) {
  return String(value || '').normalize('NFKD').replace(/\p{M}/gu, '').toLocaleLowerCase().match(/[\p{L}\p{N}]+/gu) || [];
}
function parseMusicSearch(value) {
  const fieldAliases = { track: 'track', title: 'track', song: 'track', artist: 'artist', album: 'album', genre: 'genre', year: 'year', composer: 'composer', lyrics: 'lyrics' };
  const clauses = [];
  const tokens = String(value || '').match(/-?(?:(?:track|title|song|artist|album|genre|year|composer|lyrics):)?-?(?:"[^"]*"|'[^']*'|[^\s]+)/giu) || [];
  for (let raw of tokens) {
    let exclude = raw.startsWith('-');
    if (exclude) raw = raw.slice(1);
    let field = null;
    const prefix = raw.match(/^(track|title|song|artist|album|genre|year|composer|lyrics):/i);
    if (prefix) { field = fieldAliases[prefix[1].toLocaleLowerCase()]; raw = raw.slice(prefix[0].length); }
    if (raw.startsWith('-')) { exclude = true; raw = raw.slice(1); }
    const phrase = (raw.startsWith('"') && raw.endsWith('"')) || (raw.startsWith("'") && raw.endsWith("'"));
    const text = phrase ? raw.slice(1, -1) : raw;
    const words = normalizeSearch(text);
    if (words.length) clauses.push({ field, words, phrase, exclude });
  }
  return clauses;
}
function damerauDistance(left, right, limit) {
  const a = Array.from(left), b = Array.from(right);
  if (Math.abs(a.length - b.length) > limit) return Infinity;
  const rows = Array.from({ length: a.length + 1 }, () => new Uint16Array(b.length + 1));
  for (let i = 0; i <= a.length; i++) rows[i][0] = i;
  for (let j = 0; j <= b.length; j++) rows[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      rows[i][j] = Math.min(rows[i - 1][j] + 1, rows[i][j - 1] + 1, rows[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) rows[i][j] = Math.min(rows[i][j], rows[i - 2][j - 2] + 1);
    }
  }
  return rows[a.length][b.length];
}
function searchTermScore(queryWord, fields) {
  let best = Infinity;
  for (const { words, weight } of fields) {
    if (!words.length) continue;
    if (words.includes(queryWord)) best = Math.min(best, weight);
    else if (words.some(word => word.startsWith(queryWord))) best = Math.min(best, 3 + weight);
    else if (queryWord.length >= 3 && words.some(word => word.includes(queryWord))) best = Math.min(best, 9 + weight);
    const maxDistance = queryWord.length >= 8 ? 2 : queryWord.length >= 4 ? 1 : 0;
    for (const word of words) {
      if (!maxDistance || Math.abs(word.length - queryWord.length) > maxDistance) continue;
      const distance = damerauDistance(queryWord, word, maxDistance);
      if (distance <= maxDistance) best = Math.min(best, 28 + distance * 12 + weight);
    }
  }
  return best;
}
function trackSearchFields(track, field = null) {
  let fields = searchFieldCache.get(track);
  if (!fields) {
    const title = track.title || track.filename.replace(/\.[^.]+$/, '');
    fields = [
      { text: title, weight: 0, kind: 'track' }, { text: track.filename, weight: 2, kind: 'track' },
      { text: track.artist, weight: 4, kind: 'artist' }, { text: track.album, weight: 6, kind: 'album' },
      { text: track.composer, weight: 9, kind: 'composer' }, { text: track.genre, weight: 11, kind: 'genre' },
      { text: track.year, weight: 7, kind: 'year' }, { text: track.lyrics, weight: 20, kind: 'lyrics' }
    ].map(item => { const words = normalizeSearch(item.text); return { ...item, words, normalized: words.join(' ') }; });
    searchFieldCache.set(track, fields);
  }
  return fields.filter(item => !field || item.kind === field);
}
function fetchTrackInfo(track) {
  if (!track.infoPromise) {
    track.infoPromise = window.player.getTrackInfo(track.path)
      .then(info => { track.artwork = info?.artwork || ''; return info; })
      .catch(error => { track.artwork = ''; throw error; })
      .finally(() => { track.artworkLoaded = true; });
  }
  return track.infoPromise;
}
function paintQueueArtwork(element, track) {
  if (track.artwork) {
    element.classList.add('has-cover');
    element.style.backgroundImage = `url("${track.artwork}")`;
  }
}
function scoreSearchClause(track, clause) {
  const fields = trackSearchFields(track, clause.field);
  if (!fields.length) return Infinity;
  if (clause.phrase) {
    const phrase = clause.words.join(' ');
    for (const field of fields) {
      if (field.normalized.includes(phrase)) return field.weight - 8;
    }
  }
  return clause.words.reduce((sum, word) => {
    const term = searchTermScore(word, fields);
    return Number.isFinite(sum) && Number.isFinite(term) ? sum + term : Infinity;
  }, 0);
}
function scoreTrackSearch(track, clauses) {
  let score = 0;
  for (const clause of clauses) {
    const clauseScore = scoreSearchClause(track, clause);
    if (clause.exclude) { if (Number.isFinite(clauseScore)) return Infinity; continue; }
    if (!Number.isFinite(clauseScore)) return Infinity;
    score += clauseScore;
  }
  return score;
}
function indexSearchMetadata() {
  const source = tracks;
  if (!source.length) return Promise.resolve();
  if (searchMetadataSource === source && searchMetadataTask) return searchMetadataTask;
  searchMetadataSource = source;
  searchIndexing = true;
  let cursor = 0, indexed = 0;
  searchMetadataTask = Promise.all(Array.from({ length: Math.min(3, source.length) }, async () => {
    while (cursor < source.length) {
      const track = source[cursor++];
      if (track.searchIndexed) continue;
      try { Object.assign(track, await window.player.getTrackSearchInfo(track.path) || {}); } catch {}
      searchFieldCache.delete(track);
      track.searchIndexed = true;
      if (++indexed % 24 === 0 && tracks === source) renderQueue();
    }
  })).then(() => {
    if (tracks === source) { searchIndexing = false; renderQueue(); }
  });
  return searchMetadataTask;
}
function renderQueue() {
  ui.queueList.replaceChildren();
  const playlist = homeView === 'playlist' ? playlists.find(item => item.id === selectedPlaylistId) : null;
  let visibleTracks = playlist ? playlist.tracks.map(path => tracks.find(track => track.path === path)).filter(Boolean) : homeView === 'favorites' ? tracks.filter(track => favorites.has(track.path)) : tracks;
  const activePlaybackQueue = queueReturnToPlayer && playbackPaths?.length && ((homeView === 'playlist' && playbackSource?.type === 'playlist' && playbackSource.id === playlist?.id) || (homeView === 'favorites' && playbackSource?.type === 'favorites') || (homeView === 'all' && playbackSource?.type === 'all'));
  if (activePlaybackQueue) {
    const currentPath = tracks[currentIndex]?.path;
    const currentPosition = playbackPaths.indexOf(currentPath);
    const orderedPaths = currentPosition < 0 ? playbackPaths : [...playbackPaths.slice(currentPosition), ...playbackPaths.slice(0, currentPosition)];
    const order = new Map(orderedPaths.map((path, position) => [path, position]));
    visibleTracks = [...visibleTracks].sort((a, b) => (order.get(a.path) ?? Infinity) - (order.get(b.path) ?? Infinity));
  } else if (homeView !== 'search' && sortMode === 'title') {
    visibleTracks = [...visibleTracks].sort((a, b) => (a.title || a.filename.replace(/\.[^.]+$/, '')).localeCompare(b.title || b.filename.replace(/\.[^.]+$/, ''), undefined, { numeric: true, sensitivity: 'base' }));
  } else if (homeView !== 'search' && sortMode === 'date-added') {
    visibleTracks = [...visibleTracks].sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0) || a.filename.localeCompare(b.filename, undefined, { numeric: true, sensitivity: 'base' }));
  }
  const queryClauses = parseMusicSearch(ui.searchInput.value);
  const matches = homeView === 'search' && !queryClauses.length ? [] : visibleTracks.map((track, position) => ({ track, index: tracks.indexOf(track), position, score: scoreTrackSearch(track, queryClauses) })).filter(item => Number.isFinite(item.score));
  if (queryClauses.length) matches.sort((a, b) => a.score - b.score || a.position - b.position);
  let shown = 0;
  matches.forEach(({ track, index }) => {
    shown++;
    const row = document.createElement('div');
    row.className = 'queue-item' + (index === currentIndex ? ' current' : '');
    row.draggable = homeView === 'all' && !shuffle && sortMode === 'manual'; row.dataset.index = String(index); row.title = row.draggable ? 'Drag to reorder' : '';
    const indexCell = document.createElement('span'); indexCell.className = 'queue-index-cell';
    const artwork = document.createElement('span'); artwork.className = 'queue-artwork'; artwork.setAttribute('aria-hidden', 'true');
    const fallback = document.createElement('span'); fallback.className = 'queue-artwork-fallback'; fallback.textContent = String.fromCharCode(9835); artwork.append(fallback);
    if (track.artwork) paintQueueArtwork(artwork, track);
    else if (!track.artworkLoaded) { artwork.__musicTrack = track; queueArtworkObserver.observe(artwork); }
    if (index === currentIndex && !audio.paused) {
      const playing = document.createElement('span'); playing.className = 'queue-artwork-playing'; playing.setAttribute('aria-label', 'Now playing');
      playing.innerHTML = '<svg viewBox="0 0 18 18" aria-hidden="true"><rect x="2" y="7" width="2" height="4" rx="1"/><rect x="6" y="4" width="2" height="10" rx="1"/><rect x="10" y="2" width="2" height="14" rx="1"/><rect x="14" y="6" width="2" height="6" rx="1"/></svg>';
      artwork.append(playing);
    }
    const favorite = document.createElement('button'); favorite.type = 'button'; favorite.className = 'queue-favorite' + (favorites.has(track.path) ? ' active' : ''); favorite.title = favorites.has(track.path) ? 'Remove from favorites' : 'Add to favorites'; favorite.setAttribute('aria-label', favorite.title); favorite.setAttribute('aria-pressed', String(favorites.has(track.path)));
    favorite.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.8 8.8c0 4.2-8.8 10.2-8.8 10.2S3.2 13 3.2 8.8A4.4 4.4 0 0 1 12 7.4a4.4 4.4 0 0 1 8.8 1.4Z"/></svg>';
    indexCell.append(artwork);
    favorite.addEventListener('click', () => { favorites.has(track.path) ? favorites.delete(track.path) : favorites.add(track.path); localStorage.setItem('favorites', JSON.stringify([...favorites])); updatePlaybackHeader(); renderPlaylists(); renderQueue(); updateFavorite(); });
    const play = document.createElement('button'); play.type = 'button'; play.className = 'queue-select'; play.setAttribute('aria-label', `Play ${track.title || track.filename}`);
    const copy = document.createElement('span'); copy.className = 'queue-track';
    const title = document.createElement('strong'); title.textContent = track.title || track.filename.replace(/\.[^.]+$/, '');
    const artist = document.createElement('span'); artist.textContent = track.artist || 'Tap to play';
    copy.append(title, artist);
    play.append(copy);
    const action = document.createElement('button'); action.type = 'button'; action.className = 'queue-add';
    action.textContent = '+';
    action.title = 'Add to playlist';
    action.setAttribute('aria-label', `${action.title}: ${track.title || track.filename}`);
    action.addEventListener('click', () => addTrackToPlaylist(track.path));
    let removeFavorite;
    if (homeView === 'favorites' || homeView === 'playlist') {
      removeFavorite = document.createElement('button'); removeFavorite.type = 'button'; removeFavorite.className = 'queue-remove'; removeFavorite.textContent = '−';
      removeFavorite.title = homeView === 'favorites' ? 'Remove from favorites' : 'Remove from playlist';
      removeFavorite.setAttribute('aria-label', `${removeFavorite.title}: ${track.title || track.filename}`);
      removeFavorite.addEventListener('click', () => {
        if (homeView === 'favorites') { favorites.delete(track.path); localStorage.setItem('favorites', JSON.stringify([...favorites])); updatePlaybackHeader(); renderPlaylists(); renderQueue(); updateFavorite(); }
        else removeTrackFromPlaylist(track.path);
      });
    }
    const playButton = document.createElement('button'); playButton.type = 'button'; playButton.className = 'queue-play'; playButton.title = 'Play'; playButton.setAttribute('aria-label', `Play ${track.title || track.filename}`);
    playButton.innerHTML = index === currentIndex && !audio.paused ? '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 6h3v12H8zM14 6h3v12h-3z"/></svg>' : '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 6 10 6-10 6V6Z"/></svg>';
    indexCell.append(playButton);
    row.append(indexCell, play, action);
    if (removeFavorite) row.append(removeFavorite);
    row.append(favorite);
    const playFromList = () => {
      if (suppressRowClick) { suppressRowClick = false; return; }
      const samePlaybackQueue = queueReturnToPlayer && ((playlist && playbackSource?.type === 'playlist' && playbackSource.id === playlist.id) || (!playlist && homeView === 'favorites' && playbackSource?.type === 'favorites') || (!playlist && homeView === 'all' && playbackSource?.type === 'all'));
      playbackSource = playlist ? { type: 'playlist', id: playlist.id } : homeView === 'favorites' ? { type: 'favorites' } : { type: 'all' };
      const paths = playlist ? playlist.tracks : homeView === 'favorites' ? visibleTracks.map(item => item.path) : tracks.map(item => item.path);
      if (!samePlaybackQueue) setPlaybackPaths(paths, track.path);
      renderQueue(); playTrack(Number(row.dataset.index));
    };
    play.addEventListener('click', () => { showPlayer(); playFromList(); });
    playButton.addEventListener('click', playFromList);
    row.addEventListener('dragstart', event => { draggedIndex = index; event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', String(index)); row.classList.add('dragging'); });
    row.addEventListener('dragend', () => { draggedIndex = -1; row.classList.remove('dragging'); });
    row.addEventListener('dragover', event => { event.preventDefault(); event.dataTransfer.dropEffect = 'move'; row.classList.add('drag-over'); });
    row.addEventListener('dragleave', () => row.classList.remove('drag-over'));
    row.addEventListener('drop', event => {
      event.preventDefault(); row.classList.remove('drag-over');
      const from = draggedIndex, to = Number(row.dataset.index);
      if (from < 0 || from === to) return;
      const [moved] = tracks.splice(from, 1); tracks.splice(to, 0, moved);
      if (currentIndex === from) currentIndex = to;
      else if (from < currentIndex && to >= currentIndex) currentIndex--;
      else if (from > currentIndex && to <= currentIndex) currentIndex++;
      saveTrackOrder(); renderQueue(); updateFavorite();
      suppressRowClick = true; setTimeout(() => { suppressRowClick = false; }, 500);
    });
    ui.queueList.append(row);
  });
  if (!shown) { const empty = document.createElement('div'); empty.className = 'queue-empty'; empty.textContent = homeView === 'search' && !queryClauses.length ? 'Search by song, artist, album, genre, or lyrics' : homeView === 'search' && searchIndexing ? 'Checking song details…' : queryClauses.length ? 'No matching songs' : homeView === 'favorites' ? 'Your favorite songs will appear here' : !tracks.length ? 'Choose a folder to add songs' : playlist ? 'This playlist is empty. Add songs from All Songs.' : 'Choose a folder to add songs'; ui.queueList.append(empty); }
}
function updateFavorite() {
  const path = tracks[currentIndex]?.path;
  const active = Boolean(path && favorites.has(path));
  for (const button of [ui.favoriteButton, ui.miniFavoriteButton]) {
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
    button.setAttribute('aria-label', active ? 'Remove from favorites' : 'Add to favorites');
    button.title = active ? 'Remove from favorites' : 'Add to favorites';
  }
}
function toggleFavorite() {
  const file = tracks[currentIndex]?.path;
  if (!file) return showToast('Play a song to save it as a favorite');
  if (favorites.has(file)) favorites.delete(file); else favorites.add(file);
  localStorage.setItem('favorites', JSON.stringify([...favorites])); updatePlaybackHeader(); updateFavorite(); renderPlaylists(); renderQueue();
}
async function selectFolder() {
  try {
    const result = await window.player.chooseFolder();
    if (!result) return;
    folder = result.folder;
    localStorage.setItem('musicFolder', folder);
    tracks = result.tracks;
    restoreTrackAddedDates();
    restoreTrackOrder();
    ui.searchInput.value = '';
    currentIndex = -1;
    playbackPaths = null;
    playbackSource = null;
    audio.pause(); audio.removeAttribute('src'); audio.load(); setPlaying(false);
    ui.trackTitle.textContent = tracks.length ? 'Choose a song' : 'No music found';
    ui.trackArtist.textContent = tracks.length ? 'Your collection is ready to play' : 'Try a folder with MP3, FLAC, WAV or AAC files';
    ui.libraryLabel.textContent = 'YOUR LIBRARY';
    resetArtwork(); setTrackCount(); renderQueue(); renderPlaylists(); updateFavorite(); updateNowPlaying();
    showToast(tracks.length ? `${tracks.length} songs added to your library` : 'No supported audio files in that folder');
  } catch { showToast('Could not open that folder'); }
}
function resetArtwork() {
  artworkColorRequest++;
  edgeEnergy = 0;
  edgeBeat = 0; previousBass = 0; previousVisualizerTime = 0;
  document.querySelector('.window-shell').style.setProperty('--mini-edge-energy', '0');
  document.querySelector('.window-shell').style.setProperty('--mini-edge-wobble', '0');
  setMiniEdgeColor('255,255,255');
  ui.artwork.classList.remove('has-art');
  ui.artwork.style.backgroundImage = '';
  ui.artworkWrap.style.setProperty('--cover-glow', '');
  ui.artwork.querySelector('.cover-glyph').textContent = '?';
  updateNowPlaying();
}
async function playTrack(index, autoplay = true) {
  if (!tracks.length) { showToast('Choose a music folder first'); return; }
  if (!playbackSource) playbackSource = { type: 'all' };
  if (!playbackPaths && shuffle) setPlaybackPaths(sourceTrackPaths(), tracks[(index + tracks.length) % tracks.length]?.path);
  savePlaybackPosition(true);
  currentIndex = (index + tracks.length) % tracks.length;
  const track = tracks[currentIndex];
  localStorage.setItem('lastPlayedTrack', track.path);
  if (pendingResume?.path.toLocaleLowerCase() !== track.path.toLocaleLowerCase()) {
    pendingResume = null;
    localStorage.setItem('lastPlayedPosition', JSON.stringify({ path: track.path, time: 0 }));
  }
  const request = ++trackRequest;
  audio.src = track.url;
  audio.load();
  ui.trackTitle.textContent = track.filename.replace(/\.[^.]+$/, '');
  ui.trackArtist.textContent = 'Loading track information…';
  updatePlaybackHeader();
  resetArtwork(); updateFavorite(); updateNowPlaying(); renderQueue();
  const playback = autoplay ? audio.play().then(() => true).catch(() => false) : Promise.resolve(true);
  if (!autoplay) setPlaying(false);
  try {
    const info = await fetchTrackInfo(track);
    track.title = info?.title || track.filename.replace(/\.[^.]+$/, '');
    track.artist = info?.artist || 'Unknown artist';
    track.album = info?.album || '';
    searchFieldCache.delete(track);
    if (request === trackRequest) {
      ui.trackTitle.textContent = track.title;
      ui.trackArtist.textContent = info?.album ? `${track.artist}  ·  ${info.album}` : track.artist;
      if (info?.artwork) {
        ui.artwork.style.backgroundImage = `url("${info.artwork}")`;
        ui.artwork.classList.add('has-art');
        readArtworkEdgeColor(info.artwork);
      }
      updateNowPlaying();
      if (info?.duration && !Number.isFinite(audio.duration)) ui.duration.textContent = formatTime(info.duration);
      renderQueue();
    }
  } catch {
    track.title = track.filename.replace(/\.[^.]+$/, ''); track.artist = 'Unknown artist';
  }
  if (!(await playback) && request === trackRequest) { setPlaying(false); showToast('This audio format could not be played by Windows'); }
}
function savePlaybackPosition(force = false) {
  const track = tracks[currentIndex];
  if (!track || !Number.isFinite(audio.currentTime)) return;
  const now = Date.now();
  if (!force && now - lastPositionSavedAt < 3000) return;
  lastPositionSavedAt = now;
  localStorage.setItem('lastPlayedPosition', JSON.stringify({ path: track.path, time: audio.currentTime }));
}
async function rescan() {
  if (!folder) { await selectFolder(); return; }
  try {
    const oldTrack = tracks[currentIndex]?.path;
    tracks = await window.player.scanFolder(folder);
    restoreTrackAddedDates();
    restoreTrackOrder();
    currentIndex = tracks.findIndex(track => track.path === oldTrack);
    setTrackCount(); renderQueue(); renderPlaylists();
    if (currentIndex < 0 && tracks.length) await playTrack(0);
    else if (!tracks.length) { audio.pause(); currentIndex = -1; ui.trackTitle.textContent = 'No music found'; ui.trackArtist.textContent = 'Your folder may have moved'; setPlaying(false); }
    showToast(`${tracks.length} songs in your library`);
  } catch { showToast('Could not rescan that folder'); }
}
function moveTrack(direction) {
  if (!tracks.length) { showToast('Choose a music folder first'); return; }
  if (currentIndex < 0) return playTrack(0);
  if (!playbackPaths) setPlaybackPaths(sourceTrackPaths());
  const sequence = playbackPaths?.filter(path => tracks.some(track => track.path === path)) || tracks.map(track => track.path);
  const current = sequence.indexOf(tracks[currentIndex].path);
  if (current < 0) return playTrack(0);
  return playTrack(tracks.findIndex(track => track.path === sequence[(current + direction + sequence.length) % sequence.length]));
}

function restartCurrentTrack() {
  if (currentIndex >= 0) return playTrack(currentIndex);
  return playTrack(0);
}

function handleTrackEnded() {
  const sequence = (playbackPaths || sourceTrackPaths()).filter(filePath => tracks.some(track => track.path === filePath));
  const current = sequence.indexOf(tracks[currentIndex]?.path);
  if (repeatMode === 'one') {
    if (currentIndex >= 0) void playTrack(currentIndex);
    return;
  }
  if (current >= 0 && current < sequence.length - 1) { moveTrack(1); return; }
  if (repeatMode === 'all' && sequence.length) { moveTrack(1); return; }
  setPlaying(false);
  audio.currentTime = 0;
}
ui.settingsFolderButton.addEventListener('click', selectFolder);
ui.settingsRescanButton.addEventListener('click', rescan);
ui.defaultAudioButton.addEventListener('click', async () => {
  if (!await window.player.openDefaultApps('audio')) showToast('Install MyPlayer to register MyMusic with Windows.');
});
ui.colorNotesToggle.checked = colorfulNotes;
ui.miniEdgeColorToggle.checked = coloredMiniEdges;
ui.homeNotes.classList.toggle('color-notes-on', colorfulNotes);
ui.colorNotesToggle.addEventListener('change', () => {
  colorfulNotes = ui.colorNotesToggle.checked;
  localStorage.setItem('colorfulNotes', String(colorfulNotes));
  ui.homeNotes.classList.toggle('color-notes-on', colorfulNotes);
});
ui.miniEdgeColorToggle.addEventListener('change', () => {
  coloredMiniEdges = ui.miniEdgeColorToggle.checked;
  localStorage.setItem('coloredMiniEdges', String(coloredMiniEdges));
  setMiniEdgeColor();
});
ui.settingsColorToggle.addEventListener('click', () => {
  const expanded = ui.settingsColorToggle.getAttribute('aria-expanded') !== 'true';
  ui.settingsColorToggle.setAttribute('aria-expanded', String(expanded));
  ui.settingsColorOptions.hidden = !expanded;
});
ui.settingsPlaylistToggle.addEventListener('click', () => {
  const expanded = ui.settingsPlaylistToggle.getAttribute('aria-expanded') !== 'true';
  ui.settingsPlaylistToggle.setAttribute('aria-expanded', String(expanded));
  ui.settingsPlaylistList.hidden = !expanded;
});
ui.homeCloseButton.addEventListener('click', () => window.player.close());
ui.homeMinimizeButton.addEventListener('click', () => window.player.minimize());
ui.homeButton.addEventListener('click', () => showHome());
ui.playerBackButton.addEventListener('click', returnToPlayerEntry);
ui.homeHomeButton.addEventListener('click', () => showHome());
ui.homeSettingsButton.addEventListener('click', () => showHome('settings'));
ui.homeSearchButton.addEventListener('click', openSearch);
ui.allSongsCard.addEventListener('click', () => showHome('all'));
ui.favoritesCard.addEventListener('click', () => showHome('favorites'));
ui.homeCreatePlaylistButton.addEventListener('click', () => { ui.playlistName.value = ''; ui.playlistDialog.showModal(); ui.playlistName.focus(); });
ui.cancelPlaylist.addEventListener('click', () => ui.playlistDialog.close());
ui.cancelAddPlaylist.addEventListener('click', () => ui.addPlaylistDialog.close());
ui.addPlaylistDialog.addEventListener('close', () => { trackToAdd = null; selectedPlaylistIds.clear(); });
ui.playlistForm.addEventListener('submit', event => {
  event.preventDefault(); const name = ui.playlistName.value.trim(); if (!name) return;
  const playlist = { id: crypto.randomUUID(), name, tracks: [] }; playlists.push(playlist); savePlaylists(); ui.playlistDialog.close(); renderPlaylists(); showHome('playlist', playlist.id);
});
ui.addPlaylistForm.addEventListener('submit', event => {
  event.preventDefault();
  if (!trackToAdd) { ui.addPlaylistDialog.close(); return; }
  const added = [];
  const removed = [];
  for (const playlist of playlists) {
    const containsTrack = playlist.tracks.includes(trackToAdd);
    const shouldContainTrack = selectedPlaylistIds.has(playlist.id);
    if (shouldContainTrack && !containsTrack) {
      playlist.tracks.push(trackToAdd);
      added.push(playlist.name);
    } else if (!shouldContainTrack && containsTrack) {
      playlist.tracks = playlist.tracks.filter(path => path !== trackToAdd);
      removed.push(playlist.name);
      if (playbackSource?.type === 'playlist' && playbackSource.id === playlist.id) {
        setPlaybackPaths(playlist.tracks, tracks[currentIndex]?.path);
      }
    }
  }
  if (added.length || removed.length) {
    savePlaylists(); updatePlaybackHeader(); renderPlaylists(); renderQueue();
  }
  ui.addPlaylistDialog.close();
  if (added.length && removed.length) showToast(`Updated playlists: added ${added.length}, removed ${removed.length}`);
  else if (added.length) showToast(added.length === 1 ? `Added to ${added[0]}` : `Added to ${added.length} playlists`);
  else if (removed.length) showToast(removed.length === 1 ? `Removed from ${removed[0]}` : `Removed from ${removed.length} playlists`);
});
ui.nowPlayingBar.addEventListener('click', showPlayer);
ui.nowPlayingPlay.addEventListener('click', event => { event.stopPropagation(); ui.playButton.click(); });
function settleModeAnimation(animation, duration) {
  return new Promise(resolve => {
    let settled = false;
    let timer;
    const finish = force => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      if (force) { try { animation.finish(); } catch {} }
      resolve();
    };
    const onVisibilityChange = () => { if (document.hidden) finish(true); };
    animation.finished.then(() => finish(false), () => finish(false));
    document.addEventListener('visibilitychange', onVisibilityChange);
    if (document.hidden || duration === 0) finish(true);
    else timer = setTimeout(() => finish(true), duration + 120);
  });
}
async function resizePlayer(mini, destination = 'player') {
  if (miniResizePending || miniModeSyncPending) return;
  miniResizePending = true;
  const shell = document.querySelector('.window-shell');
  const requestedMode = Boolean(mini);
  const previousMode = miniMode;
  let fadeOut;
  let fadeIn;
  let nativeModeApplied = false;
  const duration = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 260;
  const easing = 'cubic-bezier(0.42, 0, 0.58, 1)';
  try {
    if (mini) closePlaybackOptions();
    shell.classList.add('mode-switching');
    fadeOut = shell.animate([{ opacity: 1 }, { opacity: 0 }], { duration, easing, fill: 'forwards' });
    await settleModeAnimation(fadeOut, duration);
    shell.style.opacity = '0';
    fadeOut.cancel();
    shell.classList.toggle('mini-mode', requestedMode);
    const appliedMode = await window.player.setMiniMode(requestedMode);
    if (appliedMode !== requestedMode) throw new Error('The native window did not apply the requested player mode');
    nativeModeApplied = true;
    miniMode = appliedMode;
    shell.classList.toggle('mini-mode', miniMode);
    if (!audio.paused && analyser) drawVisualizer();
    ui.modeToggle.title = miniMode ? 'Expand player' : 'Switch to mini player';
    ui.modeToggle.setAttribute('aria-label', ui.modeToggle.title);
    if (destination === 'home') showHome();
    else showPlayer();
    fadeIn = shell.animate([{ opacity: 0 }, { opacity: 1 }], { duration, easing, fill: 'forwards' });
    await settleModeAnimation(fadeIn, duration);
  } catch (error) {
    console.error('Music player resize failed:', error);
    miniMode = nativeModeApplied ? requestedMode : previousMode;
    shell.classList.toggle('mini-mode', miniMode);
    if (nativeModeApplied) showPlayer();
    else showToast('Could not resize the player');
  } finally {
    shell.style.opacity = '';
    fadeOut?.cancel();
    fadeIn?.cancel();
    shell.classList.remove('mode-switching');
    miniResizePending = false;
  }
}
ui.modeToggle.addEventListener('click', () => resizePlayer(!miniMode));
ui.artworkWrap.addEventListener('click', () => { if (miniMode) resizePlayer(false); });
ui.closeButton.addEventListener('click', () => window.player.close());
ui.minimizeButton.addEventListener('click', () => window.player.minimize());
ui.playButton.addEventListener('click', async () => {
  if (!tracks.length) return selectFolder();
  if (currentIndex < 0) return playTrack(0);
  if (audio.paused) { try { await audio.play(); } catch { showToast('This audio format could not be played by Windows'); } }
  else audio.pause();
});
function togglePlayerWithF() {
  if (miniMode || miniResizePending) return;
  const shell = document.querySelector('.window-shell');
  if (shell.classList.contains('player-open')) returnToPlayerEntry();
  else showPlayer();
}
async function returnHomeFromMini() {
  if (miniResizePending || miniModeSyncPending) return;
  await resizePlayer(false, 'home');
}
function seekSongToPercentage(percent) {
  if (currentIndex < 0 || !Number.isFinite(audio.duration) || audio.duration <= 0) return false;
  const position = audio.duration * Math.max(0, Math.min(100, percent)) / 100;
  audio.currentTime = position;
  setSeekValue(percent * 10);
  ui.currentTime.textContent = formatTime(position);
  ui.seekBar.setAttribute('aria-valuetext', `${formatTime(position)} of ${formatTime(audio.duration)}`);
  return true;
}
// Mouse clicks should not leave controls as the keyboard's active target.
// This keeps global shortcuts (especially Space) from activating the last
// clicked button when the user switches from pointer to keyboard.
document.addEventListener('click', event => {
  if (event.detail <= 0) return;
  const clickedButton = event.target instanceof Element ? event.target.closest('button') : null;
  clickedButton?.blur();
}, true);
window.addEventListener('keydown', event => {
  if (document.documentElement.dataset.appMode !== 'music' || event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || document.querySelector('dialog[open]')) return;
  const target = event.target;
  if (target instanceof HTMLElement && (target.isContentEditable || target.closest('input:not([type="range"]), textarea, select, [contenteditable="true"]'))) return;
  if (event.code === 'Space') {
    event.preventDefault(); ui.playButton.click();
  } else if (event.code === 'ArrowUp' || event.code === 'ArrowDown') {
    event.preventDefault();
    ui.volumeBar.value = String(Math.max(0, Math.min(100, Number(ui.volumeBar.value) + (event.code === 'ArrowUp' ? 2 : -2))));
    ui.volumeBar.dispatchEvent(new Event('input', { bubbles: true }));
    showToast(`Volume ${ui.volumeBar.value}%`, 1400, true);
  } else if (event.code === 'ArrowLeft') {
    event.preventDefault(); ui.previousButton.click();
  } else if (event.code === 'ArrowRight') {
    event.preventDefault(); ui.nextButton.click();
  } else if (event.code === 'KeyH') {
    event.preventDefault();
    if (miniMode) void returnHomeFromMini();
    else showHome();
  } else if (event.code === 'KeyS' && !miniMode) {
    event.preventDefault(); openSearch();
  } else if (event.code === 'KeyM') {
    event.preventDefault();
    setMuted(!audio.muted);
    showToast(audio.muted ? 'Muted' : 'Unmuted', 1400, true);
  } else if (event.code === 'KeyF') {
    event.preventDefault();
    void togglePlayerWithF();
  } else if (event.code === 'KeyI') {
    event.preventDefault();
    if (miniResizePending || miniModeSyncPending) return;
    if (document.querySelector('.window-shell')?.classList.contains('player-open')) void resizePlayer(!miniMode);
    else void resizePlayer(true);
  } else if (/^(Digit|Numpad)[0-9]$/.test(event.code)) {
    const number = Number(event.code.at(-1));
    if (!seekSongToPercentage(number * 10)) return;
    event.preventDefault();
  }
});
ui.previousButton.addEventListener('click', event => {
  if (event.detail > 0) event.currentTarget.blur();
  if (repeatMode === 'one') { void restartCurrentTrack(); return; }
  if (audio.currentTime > 3 && currentIndex >= 0) { audio.currentTime = 0; return; }
  moveTrack(-1);
});
ui.nextButton.addEventListener('click', event => {
  if (event.detail > 0) event.currentTarget.blur();
  if (repeatMode === 'one') { void restartCurrentTrack(); return; }
  moveTrack(1);
});
ui.playbackOptionsButton.addEventListener('click', () => {
  ui.playbackOptionsMenu.hidden = !ui.playbackOptionsMenu.hidden;
  updatePlaybackOptions();
});
ui.miniPlaybackOptionsButton.addEventListener('click', () => ui.playbackOptionsButton.click());
ui.shuffleOption.addEventListener('click', () => {
  shuffle = !shuffle;
  if (shuffle) repeatMode = 'off';
  localStorage.setItem('shuffle', String(shuffle));
  localStorage.setItem('repeatMode', repeatMode);
  if (playbackSource) setPlaybackPaths(sourceTrackPaths(), tracks[currentIndex]?.path);
  renderQueue();
  showToast(shuffle ? 'Shuffle is on' : 'Shuffle is off');
  updatePlaybackOptions();
});
ui.repeatOptions.forEach(option => option.addEventListener('click', () => {
  const nextRepeatMode = option.dataset.repeatMode;
  const restartEndedTrack = nextRepeatMode === 'one' && repeatMode !== 'one' && audio.ended;
  const wasShuffle = shuffle;
  repeatMode = repeatMode === nextRepeatMode ? 'off' : nextRepeatMode;
  shuffle = false;
  localStorage.setItem('shuffle', 'false');
  localStorage.setItem('repeatMode', repeatMode);
  if (wasShuffle && playbackSource) setPlaybackPaths(sourceTrackPaths(), tracks[currentIndex]?.path);
  if (wasShuffle) renderQueue();
  updatePlaybackOptions();
  if (restartEndedTrack && currentIndex >= 0) void playTrack(currentIndex);
  showToast(repeatMode === 'all' ? 'Repeat all is on' : repeatMode === 'one' ? 'Repeat one is on' : 'Repeat is off');
}));
document.addEventListener('pointerdown', event => {
  if (!ui.playbackOptions.contains(event.target) && !ui.miniPlaybackOptionsButton.contains(event.target)) closePlaybackOptions();
});
ui.playbackOptions.addEventListener('keydown', event => {
  if (event.key !== 'Escape' || ui.playbackOptionsMenu.hidden) return;
  event.preventDefault();
  closePlaybackOptions();
  (miniMode ? ui.miniPlaybackOptionsButton : ui.playbackOptionsButton).focus();
});
ui.searchButton.addEventListener('click', openSearch);
ui.searchInput.addEventListener('input', () => {
  clearTimeout(searchRenderTimer);
  searchRenderTimer = setTimeout(renderQueue, 90);
  void indexSearchMetadata();
});
ui.sortPickerButton.addEventListener('click', () => {
  const open = ui.sortPickerOptions.hidden;
  ui.sortPickerOptions.hidden = !open;
  ui.sortPickerButton.setAttribute('aria-expanded', String(open));
  if (open) ui.sortPickerOptions.querySelector('[aria-selected="true"]')?.focus();
});
ui.sortPickerOptions.addEventListener('click', event => {
  const option = event.target.closest('[data-sort-value]');
  if (!option) return;
  ui.sortBy.value = option.dataset.sortValue;
  ui.sortBy.dispatchEvent(new Event('change', { bubbles: true }));
  closeSortPicker(true);
});
ui.sortPickerOptions.addEventListener('keydown', event => {
  if (event.key === 'Escape') { event.preventDefault(); closeSortPicker(true); return; }
  if (!['ArrowDown', 'ArrowUp'].includes(event.key)) return;
  event.preventDefault();
  const options = [...ui.sortPickerOptions.querySelectorAll('[data-sort-value]')];
  const current = options.indexOf(document.activeElement);
  options[(current + (event.key === 'ArrowDown' ? 1 : options.length - 1)) % options.length]?.focus();
});
document.addEventListener('pointerdown', event => {
  if (!ui.sortToolbar.contains(event.target)) closeSortPicker();
});
ui.sortBy.addEventListener('change', () => {
  sortMode = ui.sortBy.value;
  syncSortPicker();
  localStorage.setItem('musicSortMode', sortMode);
  renderQueue();
  if (sortMode === 'title') void indexSearchMetadata();
});
ui.queueButton.addEventListener('click', () => {
  if (playbackSource?.type === 'playlist') showHome('playlist', playbackSource.id, true);
  else showHome(playbackSource?.type === 'favorites' ? 'favorites' : 'all', null, true);
});
ui.playlistBackButton.addEventListener('click', () => {
  if (queueReturnToPlayer) showPlayer();
  else showHome();
});
ui.favoriteButton.addEventListener('click', toggleFavorite);
ui.miniFavoriteButton.addEventListener('click', toggleFavorite);
ui.playerAddPlaylistButton.addEventListener('click', () => {
  const path = tracks[currentIndex]?.path;
  if (!path) return showToast('Play a song before adding it to a playlist');
  addTrackToPlaylist(path);
});
let seekPointerActive = false;
function seekFromPointer(event) {
  const bounds = ui.seekBar.getBoundingClientRect();
  if (!Number.isFinite(audio.duration) || bounds.width <= 0) return;
  const ratio = Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width));
  setSeekValue(ratio * 1000);
  audio.currentTime = audio.duration * ratio;
  ui.currentTime.textContent = formatTime(audio.currentTime);
  ui.seekBar.setAttribute('aria-valuetext', `${formatTime(audio.currentTime)} of ${formatTime(audio.duration)}`);
}
ui.seekBar.addEventListener('pointerdown', event => {
  if (event.button !== 0) return;
  seekPointerActive = true;
  ui.seekBar.setPointerCapture(event.pointerId);
  seekFromPointer(event);
});
ui.seekBar.addEventListener('pointermove', event => { if (seekPointerActive) seekFromPointer(event); });
ui.seekBar.addEventListener('pointerup', event => {
  if (!seekPointerActive) return;
  seekFromPointer(event);
  seekPointerActive = false;
  if (ui.seekBar.hasPointerCapture(event.pointerId)) ui.seekBar.releasePointerCapture(event.pointerId);
});
ui.seekBar.addEventListener('pointercancel', () => { seekPointerActive = false; });
ui.seekBar.addEventListener('lostpointercapture', () => { seekPointerActive = false; });
ui.seekBar.addEventListener('keydown', event => {
  if (!Number.isFinite(audio.duration) || !['Home', 'End'].includes(event.key)) return;
  event.preventDefault();
  audio.currentTime = event.key === 'Home' ? 0 : audio.duration;
});
ui.volumeBar.addEventListener('input', () => {
  audio.volume = Number(ui.volumeBar.value) / 100; ui.volumeValue.textContent = ui.volumeBar.value; paintRange(ui.volumeBar, Number(ui.volumeBar.value));
  if (audio.muted) setMuted(false);
  localStorage.setItem('volume', ui.volumeBar.value);
});
ui.volumeMuteButton.addEventListener('click', () => setMuted(!audio.muted));
ui.miniMuteButton.addEventListener('click', () => {
  setMuted(!audio.muted);
  showToast(audio.muted ? 'Muted' : 'Unmuted', 1400, true);
});
setMuted(localStorage.getItem('muted') === 'true');
const savedVolume = Number(localStorage.getItem('volume'));
if (Number.isFinite(savedVolume) && localStorage.getItem('volume') !== null) {
  audio.volume = savedVolume / 100; ui.volumeBar.value = String(savedVolume); ui.volumeValue.textContent = String(savedVolume); paintRange(ui.volumeBar, savedVolume);
} else paintRange(ui.volumeBar, 75);
audio.addEventListener('play', () => { setPlaying(true); startVisualizer(); renderQueue(); });
audio.addEventListener('pause', () => { savePlaybackPosition(true); setPlaying(false); stopVisualizer(); renderQueue(); });
audio.addEventListener('timeupdate', () => {
  if (seekPointerActive) return;
  savePlaybackPosition();
  if (!Number.isFinite(audio.duration)) return;
  const percent = audio.currentTime / audio.duration * 100;
  setSeekValue(percent * 10);
  ui.seekBar.setAttribute('aria-valuetext', `${formatTime(audio.currentTime)} of ${formatTime(audio.duration)}`);
  ui.currentTime.textContent = formatTime(audio.currentTime); ui.duration.textContent = formatTime(audio.duration);
});
audio.addEventListener('loadedmetadata', () => {
  if (Number.isFinite(audio.duration)) ui.duration.textContent = formatTime(audio.duration);
  if (!pendingResume) return;
  if (tracks[currentIndex]?.path.toLocaleLowerCase() !== pendingResume.path.toLocaleLowerCase()) { pendingResume = null; return; }
  const resumeAt = Number.isFinite(audio.duration) ? Math.min(pendingResume.time, Math.max(0, audio.duration - 0.25)) : pendingResume.time;
  pendingResume = null;
  if (resumeAt > 0) audio.currentTime = resumeAt;
  if (Number.isFinite(audio.duration) && audio.duration > 0) {
    setSeekValue(audio.currentTime / audio.duration * 1000);
    ui.currentTime.textContent = formatTime(audio.currentTime);
    ui.seekBar.setAttribute('aria-valuetext', `${formatTime(audio.currentTime)} of ${formatTime(audio.duration)}`);
  }
  savePlaybackPosition(true);
});
audio.addEventListener('ended', handleTrackEnded);
audio.addEventListener('error', () => { if (audio.src) { setPlaying(false); showToast('This audio format could not be played by Windows'); } });
window.addEventListener('pagehide', () => savePlaybackPosition(true));
const startupAudioPath = new URLSearchParams(location.search).get('filePath');
if (startupAudioPath) {
  const separator = Math.max(startupAudioPath.lastIndexOf('\\'), startupAudioPath.lastIndexOf('/'));
  const startupFolder = separator === 2 && startupAudioPath[1] === ':' ? startupAudioPath.slice(0, 3) : startupAudioPath.slice(0, separator);
  folder = startupFolder;
  localStorage.setItem('musicFolder', folder);
  window.player.scanFolder(startupFolder).then(found => {
    tracks = found; restoreTrackAddedDates(); restoreTrackOrder(); setTrackCount(); renderQueue(); renderPlaylists();
    const index = tracks.findIndex(track => track.path.toLocaleLowerCase() === startupAudioPath.toLocaleLowerCase());
    if (index >= 0) { playbackSource = { type: 'all' }; playbackPaths = null; void playTrack(index); }
    else showToast('Could not find that audio file in its folder');
  }).catch(() => showToast('Could not open that audio file'));
} else if (folder) {
  window.player.scanFolder(folder).then(found => {
    tracks = found; restoreTrackAddedDates(); restoreTrackOrder(); setTrackCount(); renderQueue(); renderPlaylists();
    if (!tracks.length) { ui.trackTitle.textContent = 'No music found'; ui.trackArtist.textContent = 'Choose a folder to get started'; }
    else {
      const lastPath = localStorage.getItem('lastPlayedTrack');
      const lastIndex = tracks.findIndex(track => track.path.toLocaleLowerCase() === lastPath?.toLocaleLowerCase());
      if (lastIndex >= 0) {
        try {
          const saved = JSON.parse(localStorage.getItem('lastPlayedPosition') || 'null');
          if (typeof saved?.path === 'string' && saved.path.toLocaleLowerCase() === tracks[lastIndex].path.toLocaleLowerCase() && Number.isFinite(saved.time) && saved.time >= 0) {
            pendingResume = { path: tracks[lastIndex].path, time: saved.time };
          }
        } catch {}
        playbackSource = { type: 'all' }; playbackPaths = null; void playTrack(lastIndex, false);
      }
    }
  }).catch(() => showToast('Your saved music folder is unavailable'));
}
populateMusicNotes(); renderPlaylists(); showHome(); updateNowPlaying();
void window.player.getMiniMode().then(isMini => {
  miniMode = Boolean(isMini);
  const shell = document.querySelector('.window-shell');
  shell.classList.toggle('mini-mode', miniMode);
  ui.modeToggle.title = miniMode ? 'Expand player' : 'Switch to mini player';
  ui.modeToggle.setAttribute('aria-label', ui.modeToggle.title);
  if (miniMode) showPlayer();
}).catch(error => {
  console.error('Could not restore native player mode:', error);
}).finally(() => {
  miniModeSyncPending = false;
});
