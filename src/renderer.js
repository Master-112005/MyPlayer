const audio = document.getElementById('audio');
const $ = id => document.getElementById(id);
const ui = {
  searchButton: $('searchButton'), searchInput: $('searchInput'), modeToggle: $('modeToggle'), minimizeButton: $('minimizeButton'), closeButton: $('closeButton'),
  playButton: $('playButton'), previousButton: $('previousButton'), nextButton: $('nextButton'),
  shuffleButton: $('shuffleButton'), queueButton: $('queueButton'), homeButton: $('homeButton'),
  favoriteButton: $('favoriteButton'), seekBar: $('seekBar'), volumeBar: $('volumeBar'), volumeMuteButton: $('volumeMuteButton'),
  volumeValue: $('volumeValue'), currentTime: $('currentTime'), duration: $('duration'),
  trackTitle: $('trackTitle'), trackArtist: $('trackArtist'), trackCount: $('trackCount'), libraryLabel: $('libraryLabel'),
  artwork: $('artwork'), artworkWrap: $('artworkWrap'), queuePanel: $('queuePanel'), queueList: $('queueList'),
  toast: $('toast'), homeTitle: $('homeTitle'), homeShortcuts: $('homeShortcuts'), homeLibrary: $('homeLibrary'), settingsView: $('settingsView'),
  playlistGrid: $('playlistGrid'), homeSongCount: $('homeSongCount'), favoriteSongCount: $('favoriteSongCount'), settingsPlaylistList: $('settingsPlaylistList'), homeNotes: $('homeNotes'), colorNotesToggle: $('colorNotesToggle'), homeSearch: document.querySelector('.home-search'), homeSearchButton: $('homeSearchButton'), homeCreatePlaylistButton: $('homeCreatePlaylistButton'), homeSettingsButton: $('homeSettingsButton'), homeHomeButton: $('homeHomeButton'), playlistBackButton: $('playlistBackButton'), homeCloseButton: $('homeCloseButton'), homeMinimizeButton: $('homeMinimizeButton'), settingsFolderButton: $('settingsFolderButton'), settingsRescanButton: $('settingsRescanButton'), defaultAudioButton: $('defaultAudioButton'),
  allSongsCard: $('allSongsCard'), favoritesCard: $('favoritesCard'), playlistDialog: $('playlistDialog'), playlistForm: $('playlistForm'), miniEdgeColorToggle: $('miniEdgeColorToggle'), settingsColorToggle: $('settingsColorToggle'), settingsColorOptions: $('settingsColorOptions'), settingsPlaylistToggle: $('settingsPlaylistToggle'),
  playlistName: $('playlistName'), cancelPlaylist: $('cancelPlaylist'), addPlaylistDialog: $('addPlaylistDialog'), addPlaylistForm: $('addPlaylistForm'), playlistChoices: $('playlistChoices'), cancelAddPlaylist: $('cancelAddPlaylist'), confirmationDialog: $('confirmationDialog'), confirmationTitle: $('confirmationTitle'), confirmationMessage: $('confirmationMessage'), nowPlayingPlay: $('nowPlayingPlay'),
  nowPlayingBar: $('nowPlayingBar'), nowPlayingTitle: $('nowPlayingTitle'), nowPlayingArtist: $('nowPlayingArtist'), nowPlayingArt: $('nowPlayingArt')
};
let tracks = [];
let folder = localStorage.getItem('musicFolder') || '';
let currentIndex = -1;
let shuffle = localStorage.getItem('shuffle') === 'true';
let favorites = new Set(JSON.parse(localStorage.getItem('favorites') || '[]'));
let colorfulNotes = localStorage.getItem('colorfulNotes') === 'true';
let coloredMiniEdges = localStorage.getItem('coloredMiniEdges') !== 'false';
let artworkEdgeRgb = '255,255,255';
let toastTimer;
let trackRequest = 0;
let miniMode = false;
let homeView = 'home';
let selectedPlaylistId = null;
let playbackPaths = null;
let playbackSource = null;
let queueReturnToPlayer = false;
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
let previousBass = 0;
let previousVisualizerTime = 0;
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
let artworkColorRequest = 0;
ui.shuffleButton.classList.toggle('active', shuffle);
ui.shuffleButton.setAttribute('aria-pressed', String(shuffle));
audio.volume = 0.75;

function formatTime(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  return `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
}
function showToast(message) {
  ui.toast.textContent = message;
  ui.toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => ui.toast.classList.remove('show'), 2600);
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
  localStorage.setItem('muted', String(muted));
}
function setMiniEdgeColor(rgb) {
  if (rgb) artworkEdgeRgb = rgb;
  document.querySelector('.window-shell').style.setProperty('--mini-edge-rgb', coloredMiniEdges ? artworkEdgeRgb : '255,255,255');
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
      const brighten = value => Math.round(value / count * 0.55 + 255 * 0.45);
      setMiniEdgeColor(count ? `${brighten(red)},${brighten(green)},${brighten(blue)}` : '225,225,225');
    } catch { setMiniEdgeColor(); }
  };
  image.onerror = () => { if (request === artworkColorRequest) setMiniEdgeColor(); };
  image.src = source;
}
function drawVisualizer() {
  const canvas = ui.artwork.querySelector('.visualizer');
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
      document.querySelector('.window-shell').style.setProperty('--mini-edge-energy', '0');
      document.querySelector('.window-shell').style.setProperty('--mini-edge-wobble', '0');
      return;
    }
    analyser.getByteFrequencyData(levels);
    if (miniMode) {
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
      const shell = document.querySelector('.window-shell');
      shell.style.setProperty('--mini-edge-energy', motionEnergy.toFixed(3));
      shell.style.setProperty('--mini-edge-wobble', reduceMotion ? '0' : edgeBeat.toFixed(3));
      const delta = previousVisualizerTime ? Math.min(0.05, (timestamp - previousVisualizerTime) / 1000) : 1 / 60;
      previousVisualizerTime = timestamp;
      if (!reduceMotion) {
        edgeFlowAngle = (edgeFlowAngle + delta * (22 + motionEnergy * 220)) % 360;
        shell.style.setProperty('--mini-flow-angle', `${edgeFlowAngle.toFixed(1)}deg`);
      }
    }
    const bars = 28, gap = 3, barWidth = (width - gap * (bars - 1)) / bars;
    context.fillStyle = 'rgba(255,255,255,.9)';
    for (let i = 0; i < bars; i++) {
      const value = levels[Math.floor(i * levels.length / bars)] / 255;
      const barHeight = Math.max(2, value * height);
      context.fillRect(i * (barWidth + gap), (height - barHeight) / 2, barWidth, barHeight);
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
  const canvas = ui.artwork.querySelector('.visualizer'), context = canvas.getContext('2d');
  context.setTransform(1, 0, 0, 1, 0, 0); context.clearRect(0, 0, canvas.width, canvas.height);
  edgeEnergy = 0;
  edgeBeat = 0; previousBass = 0; previousVisualizerTime = 0;
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
  ui.homeTitle.textContent = view === 'playlist' ? playlist?.name || 'Playlist' : view === 'favorites' ? 'Favorites' : view === 'settings' ? 'Settings' : view === 'search' ? 'Search' : view === 'all' ? 'All Songs' : 'Home';
  ui.queuePanel.classList.remove('search-open'); ui.homeSearch.classList.add('hidden');
  ui.searchInput.value = ''; renderPlaylists(); renderQueue();
}
function showPlayer() {
  const shell = document.querySelector('.window-shell');
  shell.classList.remove('home-open'); shell.classList.add('player-open');
  ui.queuePanel.classList.remove('open'); ui.queuePanel.setAttribute('aria-hidden', 'true');
}
function savePlaylists() { localStorage.setItem('playlists', JSON.stringify(playlists)); }
function openSearch() {
  if (homeView === 'search' && ui.queuePanel.classList.contains('search-open')) {
    ui.searchInput.focus(); return;
  }
  showHome('search');
  ui.homeSearch.classList.remove('hidden'); ui.queuePanel.classList.add('search-open'); requestAnimationFrame(() => ui.searchInput.focus());
}
function addTrackToPlaylist(path) {
  if (!playlists.length) { showToast('Create a playlist first'); return; }
  trackToAdd = path; selectedPlaylistIds.clear();
  ui.playlistChoices.replaceChildren(...playlists.map(playlist => {
    const option = document.createElement('button'); option.type = 'button'; option.className = 'playlist-choice'; option.setAttribute('aria-pressed', 'false');
    const name = document.createElement('span'); name.textContent = playlist.name; option.append(name);
    if (playlist.tracks.includes(path)) { option.disabled = true; const status = document.createElement('small'); status.textContent = 'Added'; option.append(status); }
    option.addEventListener('click', () => {
      const selected = selectedPlaylistIds.has(playlist.id);
      if (selected) selectedPlaylistIds.delete(playlist.id); else selectedPlaylistIds.add(playlist.id);
      option.classList.toggle('selected', !selected); option.setAttribute('aria-pressed', String(!selected));
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
function normalizeSearch(value) {
  return String(value || '').normalize('NFKD').replace(/\p{M}/gu, '').toLocaleLowerCase().match(/[\p{L}\p{N}]+/gu) || [];
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
  for (const [text, weight] of fields) {
    if (!text) continue;
    const words = normalizeSearch(text);
    const normalized = words.join(' ');
    if (words.includes(queryWord) || normalized === queryWord) best = Math.min(best, weight);
    else if (words.some(word => word.startsWith(queryWord))) best = Math.min(best, 20 + weight);
    else if (normalized.includes(queryWord)) best = Math.min(best, 25 + weight);
    const maxDistance = queryWord.length >= 9 ? 2 : queryWord.length >= 5 ? 1 : 0;
    for (const word of words) {
      if (!maxDistance || Math.abs(word.length - queryWord.length) > maxDistance) continue;
      const distance = damerauDistance(queryWord, word, maxDistance);
      if (distance <= maxDistance) best = Math.min(best, 40 + distance * 10 + weight);
    }
  }
  return best;
}
function scoreTrackSearch(track, queryWords) {
  const title = track.title || track.filename.replace(/\.[^.]+$/, '');
  const fields = [[title, 0], [track.filename, 1], [track.artist, 3], [track.album, 6]];
  let score = 0;
  for (const word of queryWords) {
    const termScore = searchTermScore(word, fields);
    if (!Number.isFinite(termScore)) return Infinity;
    score += termScore;
  }
  return score;
}
function renderQueue() {
  ui.queueList.replaceChildren();
  const playlist = homeView === 'playlist' ? playlists.find(item => item.id === selectedPlaylistId) : null;
  let visibleTracks = playlist ? playlist.tracks.map(path => tracks.find(track => track.path === path)).filter(Boolean) : homeView === 'favorites' ? tracks.filter(track => favorites.has(track.path)) : tracks;
  if (shuffle && playbackPaths?.length && ((homeView === 'playlist' && playbackSource?.type === 'playlist' && playbackSource.id === playlist?.id) || (homeView === 'favorites' && playbackSource?.type === 'favorites') || (homeView === 'all' && playbackSource?.type === 'all'))) {
    const order = new Map(playbackPaths.map((path, position) => [path, position]));
    visibleTracks = [...visibleTracks].sort((a, b) => (order.get(a.path) ?? Infinity) - (order.get(b.path) ?? Infinity));
  }
  const queryWords = normalizeSearch(ui.searchInput.value);
  const matches = homeView === 'search' && !queryWords.length ? [] : visibleTracks.map((track, position) => ({ track, index: tracks.indexOf(track), position, score: scoreTrackSearch(track, queryWords) })).filter(item => Number.isFinite(item.score));
  if (queryWords.length) matches.sort((a, b) => a.score - b.score || a.position - b.position);
  let shown = 0;
  matches.forEach(({ track, index }) => {
    shown++;
    const row = document.createElement('div');
    row.className = 'queue-item' + (index === currentIndex ? ' current' : '');
    row.draggable = homeView === 'all' && !shuffle; row.dataset.index = String(index); row.title = row.draggable ? 'Drag to reorder' : '';
    const indexCell = document.createElement('span'); indexCell.className = 'queue-index-cell';
    const number = document.createElement('span'); number.className = 'queue-number';
    if (index === currentIndex && !audio.paused) {
      number.innerHTML = '<svg class="now-playing-wave" viewBox="0 0 18 18" aria-hidden="true"><rect x="2" y="7" width="2" height="4" rx="1"/><rect x="6" y="4" width="2" height="10" rx="1"/><rect x="10" y="2" width="2" height="14" rx="1"/><rect x="14" y="6" width="2" height="6" rx="1"/></svg>';
      number.setAttribute('aria-label', 'Now playing');
    } else number.textContent = String(visibleTracks.indexOf(track) + 1).padStart(2, '0');
    const favorite = document.createElement('button'); favorite.type = 'button'; favorite.className = 'queue-favorite' + (favorites.has(track.path) ? ' active' : ''); favorite.title = favorites.has(track.path) ? 'Remove from favorites' : 'Add to favorites'; favorite.setAttribute('aria-label', favorite.title); favorite.setAttribute('aria-pressed', String(favorites.has(track.path)));
    favorite.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.8 8.8c0 4.2-8.8 10.2-8.8 10.2S3.2 13 3.2 8.8A4.4 4.4 0 0 1 12 7.4a4.4 4.4 0 0 1 8.8 1.4Z"/></svg>';
    indexCell.append(number, favorite);
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
    row.append(indexCell, play, action);
    if (removeFavorite) row.append(removeFavorite);
    row.append(playButton);
    const playFromList = () => {
      if (suppressRowClick) { suppressRowClick = false; return; }
      playbackSource = playlist ? { type: 'playlist', id: playlist.id } : homeView === 'favorites' ? { type: 'favorites' } : { type: 'all' };
      const paths = playlist ? playlist.tracks : homeView === 'favorites' ? visibleTracks.map(item => item.path) : tracks.map(item => item.path);
      setPlaybackPaths(paths, track.path); renderQueue(); playTrack(Number(row.dataset.index));
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
  if (!shown) { const empty = document.createElement('div'); empty.className = 'queue-empty'; empty.textContent = homeView === 'search' && !queryWords.length ? 'Search by song, artist, or album' : queryWords.length ? 'No matching songs' : homeView === 'favorites' ? 'Your favorite songs will appear here' : !tracks.length ? 'Choose a folder to add songs' : playlist ? 'This playlist is empty. Add songs from All Songs.' : 'Choose a folder to add songs'; ui.queueList.append(empty); }
}
function updateFavorite() {
  const path = tracks[currentIndex]?.path;
  const active = Boolean(path && favorites.has(path));
  ui.favoriteButton.classList.toggle('active', active);
  ui.favoriteButton.setAttribute('aria-pressed', String(active));
}
async function selectFolder() {
  try {
    const result = await window.player.chooseFolder();
    if (!result) return;
    folder = result.folder;
    localStorage.setItem('musicFolder', folder);
    tracks = result.tracks;
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
  currentIndex = (index + tracks.length) % tracks.length;
  const track = tracks[currentIndex];
  localStorage.setItem('lastPlayedTrack', track.path);
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
    const info = await window.player.getTrackInfo(track.path);
    track.title = info?.title || track.filename.replace(/\.[^.]+$/, '');
    track.artist = info?.artist || 'Unknown artist';
    track.album = info?.album || '';
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
async function rescan() {
  if (!folder) { await selectFolder(); return; }
  try {
    const oldTrack = tracks[currentIndex]?.path;
    tracks = await window.player.scanFolder(folder);
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
  const selected = playlists.filter(item => selectedPlaylistIds.has(item.id) && !item.tracks.includes(trackToAdd));
  if (!selected.length || !trackToAdd) { showToast('Select at least one playlist'); return; }
  selected.forEach(item => item.tracks.push(trackToAdd)); savePlaylists(); updatePlaybackHeader(); trackToAdd = null; selectedPlaylistIds.clear();
  renderPlaylists(); renderQueue(); ui.addPlaylistDialog.close(); showToast(selected.length === 1 ? `Added to ${selected[0].name}` : `Added to ${selected.length} playlists`);
});
ui.nowPlayingBar.addEventListener('click', showPlayer);
ui.nowPlayingPlay.addEventListener('click', event => { event.stopPropagation(); ui.playButton.click(); });
async function resizePlayer(mini) {
  try {
    miniMode = await window.player.setMiniMode(mini);
    document.querySelector('.window-shell').classList.toggle('mini-mode', miniMode);
    if (!audio.paused && analyser) drawVisualizer();
    ui.modeToggle.title = miniMode ? 'Expand player' : 'Switch to mini player';
    ui.modeToggle.setAttribute('aria-label', ui.modeToggle.title);
    showPlayer();
  } catch { showToast('Could not resize the player'); }
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
window.addEventListener('keydown', event => {
  if (document.documentElement.dataset.appMode !== 'music' || event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || document.querySelector('dialog[open]')) return;
  const target = event.target;
  if (target instanceof HTMLElement && (target.isContentEditable || target.closest('input:not([type="range"]), textarea, select, [contenteditable="true"]'))) return;
  if (event.code === 'Space') {
    if (target instanceof HTMLElement && target.closest('button')) return;
    event.preventDefault(); ui.playButton.click();
  } else if (event.code === 'ArrowUp' || event.code === 'ArrowDown') {
    event.preventDefault();
    ui.volumeBar.value = String(Math.max(0, Math.min(100, Number(ui.volumeBar.value) + (event.code === 'ArrowUp' ? 2 : -2))));
    ui.volumeBar.dispatchEvent(new Event('input', { bubbles: true }));
  } else if (event.code === 'ArrowLeft') {
    event.preventDefault(); ui.previousButton.click();
  } else if (event.code === 'ArrowRight') {
    event.preventDefault(); ui.nextButton.click();
  } else if (event.code === 'KeyM') {
    event.preventDefault(); setMuted(!audio.muted);
  }
});
ui.previousButton.addEventListener('click', () => {
  if (audio.currentTime > 3 && currentIndex >= 0) { audio.currentTime = 0; return; }
  moveTrack(-1);
});
ui.nextButton.addEventListener('click', () => moveTrack(1));
ui.shuffleButton.addEventListener('click', () => {
  shuffle = !shuffle; localStorage.setItem('shuffle', String(shuffle)); ui.shuffleButton.classList.toggle('active', shuffle);
  ui.shuffleButton.setAttribute('aria-pressed', String(shuffle));
  if (playbackSource) setPlaybackPaths(sourceTrackPaths());
  renderQueue();
  showToast(shuffle ? 'Shuffle is on' : 'Shuffle is off');
});
ui.searchButton.addEventListener('click', openSearch);
ui.searchInput.addEventListener('input', renderQueue);
ui.queueButton.addEventListener('click', () => {
  if (playbackSource?.type === 'playlist') showHome('playlist', playbackSource.id, true);
  else showHome(playbackSource?.type === 'favorites' ? 'favorites' : 'all', null, true);
});
ui.playlistBackButton.addEventListener('click', () => {
  if (queueReturnToPlayer) showPlayer();
  else showHome();
});
ui.favoriteButton.addEventListener('click', () => {
  const file = tracks[currentIndex]?.path;
  if (!file) return showToast('Play a song to save it as a favorite');
  if (favorites.has(file)) favorites.delete(file); else favorites.add(file);
  localStorage.setItem('favorites', JSON.stringify([...favorites])); updatePlaybackHeader(); updateFavorite(); renderPlaylists(); renderQueue();
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
setMuted(localStorage.getItem('muted') === 'true');
const savedVolume = Number(localStorage.getItem('volume'));
if (Number.isFinite(savedVolume) && localStorage.getItem('volume') !== null) {
  audio.volume = savedVolume / 100; ui.volumeBar.value = String(savedVolume); ui.volumeValue.textContent = String(savedVolume); paintRange(ui.volumeBar, savedVolume);
} else paintRange(ui.volumeBar, 75);
audio.addEventListener('play', () => { setPlaying(true); startVisualizer(); renderQueue(); });
audio.addEventListener('pause', () => { setPlaying(false); stopVisualizer(); renderQueue(); });
audio.addEventListener('timeupdate', () => {
  if (!Number.isFinite(audio.duration)) return;
  if (seekPointerActive) return;
  const percent = audio.currentTime / audio.duration * 100;
  setSeekValue(percent * 10);
  ui.seekBar.setAttribute('aria-valuetext', `${formatTime(audio.currentTime)} of ${formatTime(audio.duration)}`);
  ui.currentTime.textContent = formatTime(audio.currentTime); ui.duration.textContent = formatTime(audio.duration);
});
audio.addEventListener('loadedmetadata', () => { if (Number.isFinite(audio.duration)) ui.duration.textContent = formatTime(audio.duration); });
audio.addEventListener('ended', () => { if ((playbackPaths?.length || tracks.length) > 1) moveTrack(1); else { setPlaying(false); audio.currentTime = 0; } });
audio.addEventListener('error', () => { if (audio.src) { setPlaying(false); showToast('This audio format could not be played by Windows'); } });
const startupAudioPath = new URLSearchParams(location.search).get('filePath');
if (startupAudioPath) {
  const separator = Math.max(startupAudioPath.lastIndexOf('\\'), startupAudioPath.lastIndexOf('/'));
  const startupFolder = separator === 2 && startupAudioPath[1] === ':' ? startupAudioPath.slice(0, 3) : startupAudioPath.slice(0, separator);
  folder = startupFolder;
  localStorage.setItem('musicFolder', folder);
  window.player.scanFolder(startupFolder).then(found => {
    tracks = found; restoreTrackOrder(); setTrackCount(); renderQueue(); renderPlaylists();
    const index = tracks.findIndex(track => track.path.toLocaleLowerCase() === startupAudioPath.toLocaleLowerCase());
    if (index >= 0) { playbackSource = { type: 'all' }; playbackPaths = null; void playTrack(index); }
    else showToast('Could not find that audio file in its folder');
  }).catch(() => showToast('Could not open that audio file'));
} else if (folder) {
  window.player.scanFolder(folder).then(found => {
    tracks = found; restoreTrackOrder(); setTrackCount(); renderQueue(); renderPlaylists();
    if (!tracks.length) { ui.trackTitle.textContent = 'No music found'; ui.trackArtist.textContent = 'Choose a folder to get started'; }
    else {
      const lastPath = localStorage.getItem('lastPlayedTrack');
      const lastIndex = tracks.findIndex(track => track.path.toLocaleLowerCase() === lastPath?.toLocaleLowerCase());
      if (lastIndex >= 0) { playbackSource = { type: 'all' }; playbackPaths = null; void playTrack(lastIndex, false); }
    }
  }).catch(() => showToast('Your saved music folder is unavailable'));
}
populateMusicNotes(); renderPlaylists(); showHome(); updateNowPlaying();
