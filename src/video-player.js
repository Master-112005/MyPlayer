import { defineMpvVideoElement } from '../node_modules/electron-mpv-video/dist/renderer/index.js';

defineMpvVideoElement();

const $ = id => document.getElementById(id);
const video = $('video');
const params = new URLSearchParams(location.search);
const controls = [...document.querySelectorAll('.auto-hide')];
let hideTimer;
let leaveTimer;
let keyboardStatusTimer;
let progressTimer;
let progressPending = false;
let lastProgressUiUpdate = 0;
let volumeFrame = 0;
let closing = false;
let moving = false;
let scrubbing = false;
let playbackDuration = 0;
let lastAspect = 0;
let fullscreen = false;
let playingState = null;
let volumeLevel = Number($('volume').value) || 75;
let volumeLimit = 100;
let volumeSettingsReady;
let previousVolumeLevel = volumeLevel;
let muted = false;
let currentFilePath = null;
let pendingResume = null;
let resumeTimer;
let lastResumeSave = 0;
const subtitleSettingsKey = 'mycinema-subtitle-settings';
let subtitleSettings = (() => {
  try {
    const saved = JSON.parse(localStorage.getItem(subtitleSettingsKey) || '{}');
    return {
      position: saved.position === 'top' ? 'top' : 'bottom',
      size: ['0.75', '1', '1.25', '1.5'].includes(String(saved.size)) ? String(saved.size) : '1'
    };
  } catch { return { position: 'bottom', size: '1' }; }
})();

async function applySubtitleSettings() {
  updateSubtitleSettingOptions();
  try {
    await Promise.all([
      video.setSubtitlePosition(subtitleSettings.position === 'top' ? 0 : 100),
      video.setSubtitleScale(Number(subtitleSettings.size))
    ]);
  } catch (error) { reportError(`Could not apply subtitle settings: ${error.message || error}`); }
}

function updateSubtitleSettingOptions() {
  const selections = [
    { button: 'subtitlePositionButton', menu: 'subtitlePositionOptions', value: subtitleSettings.position },
    { button: 'subtitleSizeButton', menu: 'subtitleSizeOptions', value: subtitleSettings.size }
  ];
  for (const { button, menu, value } of selections) {
    const control = $(button);
    const options = $(menu);
    const selected = [...options.querySelectorAll('[role="option"]')].find(option => option.dataset.value === value);
    control.querySelector('span').textContent = selected?.textContent || '';
    for (const option of options.querySelectorAll('[role="option"]')) {
      const active = option === selected;
      option.classList.toggle('selected', active);
      option.setAttribute('aria-selected', String(active));
    }
  }
}

function closeSubtitleSettingMenus(except = '') {
  for (const id of ['subtitlePositionOptions', 'subtitleSizeOptions']) {
    if (id === except) continue;
    $(id).classList.add('hidden');
    $(`${id === 'subtitlePositionOptions' ? 'subtitlePosition' : 'subtitleSize'}Button`).setAttribute('aria-expanded', 'false');
  }
}

function timeText(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor(seconds / 60);
  if (hours) return `${hours}:${String(minutes % 60).padStart(2, '0')}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
  return `${minutes}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
}
function showControls() {
  clearTimeout(leaveTimer);
  clearTimeout(keyboardStatusTimer);
  $('keyboardStatus').classList.remove('visible');
  controls.forEach(control => control.classList.remove('faded'));
  clearTimeout(hideTimer);
  hideTimer = setTimeout(hideControls, 5000);
}
function hideControls() {
  controls.forEach(control => control.classList.add('faded'));
  $('trackMenu').classList.add('hidden');
  $('playerSettings').classList.add('hidden');
}
function showKeyboardStatus(message) {
  const status = $('keyboardStatus');
  status.textContent = message;
  status.classList.add('visible');
  clearTimeout(keyboardStatusTimer);
  keyboardStatusTimer = setTimeout(() => status.classList.remove('visible'), 1200);
}
function reportError(message) {
  $('error').textContent = message;
  $('error').classList.remove('hidden');
}
function applyVolume() {
  if (volumeFrame) return;
  volumeFrame = requestAnimationFrame(() => {
    volumeFrame = 0;
    video.setVolume(volumeLevel).catch(error => reportError(`Volume change failed: ${error.message || error}`));
  });
}
async function updateProgress(info = null) {
  if (closing || !video.playerId) return;
  if (scrubbing && playbackDuration) {
    const current = Number($('timeline').value) / 1000 * playbackDuration;
    $('currentTime').textContent = timeText(current);
    $('remainingTime').textContent = `-${timeText(Math.max(0, playbackDuration - current))}`;
    return;
  }
  if (!info && progressPending) return;
  if (!info) progressPending = true;
  try {
  const playback = info || await video.getPlaybackInfo();
  const duration = Number(playback.duration) || 0;
  const current = Number(playback.currentTime) || 0;
  playbackDuration = duration;
  setPlaying(!playback.paused);
  $('currentTime').textContent = timeText(scrubbing ? Number($('timeline').value) / 1000 * duration : current);
  $('remainingTime').textContent = `-${timeText(Math.max(0, duration - (scrubbing ? Number($('timeline').value) / 1000 * duration : current)))}`;
  if (!scrubbing) $('timeline').value = duration ? String(Math.round(current / duration * 1000)) : '0';
  $('timeline').disabled = !duration;
  if (currentFilePath && !pendingResume && current >= 10 && Date.now() - lastResumeSave >= 3500) {
    lastResumeSave = Date.now();
    void window.player.saveVideoResume(currentFilePath, current, duration).catch(() => {});
  }
  } catch (error) {
    if (!closing) reportError(`Could not read playback progress: ${error.message || error}`);
  } finally {
    if (!info) progressPending = false;
  }
}
async function openVideo(filePath, title) {
  await volumeSettingsReady;
  if (currentFilePath) await saveCurrentPosition();
  clearTimeout(resumeTimer);
  pendingResume = null;
  $('resumePrompt').classList.add('hidden');
  currentFilePath = filePath;
  lastResumeSave = 0;
  $('error').classList.add('hidden');
  document.title = title || 'MyCinema';
  $('timeline').value = '0';
  $('currentTime').textContent = '0:00';
  $('remainingTime').textContent = '-0:00';
  playbackDuration = 0;
  lastAspect = 0;
  video.resetVideoDimensions();
  if (progressTimer) clearInterval(progressTimer);
  try {
    await applySubtitleSettings();
    await video.open(filePath);
    const [saved, playback] = await Promise.all([
      window.player.getVideoResume(filePath),
      video.getPlaybackInfo()
    ]);
    const { duration } = playback;
    playbackDuration = Number(duration) || 0;
    progressTimer = setInterval(updateProgress, 500);
    void updateProgress();
    if (saved?.position >= 10 && saved.position < (duration || saved.duration) - 10) {
      pendingResume = { filePath, position: saved.position };
      const prompt = $('resumePrompt');
      prompt.textContent = `Continue · ${timeText(saved.position)}`;
      prompt.classList.remove('hidden');
      resumeTimer = setTimeout(async () => {
        if (pendingResume?.filePath !== filePath) return;
        pendingResume = null;
        prompt.classList.add('hidden');
        try { await video.play(); } catch (error) { reportError(`Could not start this video: ${error.message || error}`); }
      }, 5000);
    } else await video.play();
  } catch (error) {
    clearInterval(progressTimer);
    progressTimer = null;
    reportError(`Could not play this video: ${error.message || error}`);
  }
}
async function saveCurrentPosition() {
  if (!currentFilePath || pendingResume) return;
  try {
    const info = await video.getPlaybackInfo();
    if (info.duration > 0) await window.player.saveVideoResume(currentFilePath, info.currentTime, info.duration);
  } catch {}
}
async function continueFromSavedPosition() {
  if (!pendingResume) return;
  const { position } = pendingResume;
  clearTimeout(resumeTimer);
  pendingResume = null;
  $('resumePrompt').classList.add('hidden');
  try {
    const info = await video.getPlaybackInfo();
    await video.seek(Math.min(position, Math.max(0, info.duration - 1)));
    await video.play();
  } catch (error) { reportError(`Could not resume this video: ${error.message || error}`); }
}
function seekBy(seconds) {
  video.seekRelative(seconds).catch(error => reportError(`Seek failed: ${error.message || error}`));
}
async function seekToPercentage(percent) {
  try {
    const { currentTime, duration } = await video.getPlaybackInfo();
    if (duration > 0) {
      const position = duration * percent / 100;
      await video.seekRelative(position - currentTime);
      showKeyboardStatus(timeText(position));
    }
  } catch (error) { reportError(`Seek failed: ${error.message || error}`); }
}
async function seekForKeyboard(seconds) {
  try {
    const { currentTime, duration } = await video.getPlaybackInfo();
    if (duration <= 0) return;
    const position = Math.max(0, Math.min(duration, currentTime + seconds));
    await video.seekRelative(seconds);
    showKeyboardStatus(timeText(position));
  } catch (error) { reportError(`Seek failed: ${error.message || error}`); }
}
function setPlaying(playing) {
  if (playingState === playing) return;
  playingState = playing;
  $('player').classList.toggle('playing', playing);
  $('toggle').setAttribute('aria-label', playing ? 'Pause' : 'Play');
  $('toggle').title = playing ? 'Pause' : 'Play';
}
async function togglePlay() {
  try {
    const { paused } = await video.getPlaybackInfo();
    if (paused) await video.play();
    else await video.pause();
    updateProgress();
    return paused;
  } catch (error) { reportError(`Playback control failed: ${error.message || error}`); }
}
function displayTrackLanguage(language) {
  const code = language?.trim().toLowerCase();
  const names = { eng: 'English', en: 'English', tel: 'Telugu', te: 'Telugu', hin: 'Hindi', hi: 'Hindi', tam: 'Tamil', ta: 'Tamil', kan: 'Kannada', kn: 'Kannada', mal: 'Malayalam', ml: 'Malayalam', ben: 'Bengali', bn: 'Bengali', urd: 'Urdu', ur: 'Urdu', ara: 'Arabic', ar: 'Arabic', fra: 'French', fre: 'French', fr: 'French', deu: 'German', ger: 'German', de: 'German', spa: 'Spanish', es: 'Spanish', ita: 'Italian', it: 'Italian', jpn: 'Japanese', ja: 'Japanese', kor: 'Korean', ko: 'Korean', zho: 'Chinese', chi: 'Chinese', zh: 'Chinese', por: 'Portuguese', pt: 'Portuguese', rus: 'Russian', ru: 'Russian' };
  return names[code] || language?.trim();
}
function trackName(track, type) {
  const title = displayTrackLanguage(track.title?.trim());
  const language = displayTrackLanguage(track.language);
  return title && language && title.toLowerCase() !== language.toLowerCase() ? `${title} · ${language}` : title || language || `${type === 'audio' ? 'Audio' : 'Subtitle'} track ${track.id}`;
}
async function showTrackMenu(type, anchor) {
  const menu = $('trackMenu');
  showControls();
  menu.replaceChildren();
  menu.classList.remove('hidden');
  try {
    const tracks = await video.getTracks(type);
    const heading = document.createElement('div');
    heading.className = 'menu-title';
    heading.textContent = type === 'audio' ? 'Audio' : 'Subtitles';
    menu.append(heading);
    const options = [{ id: 'no', title: type === 'sub' ? 'Subtitles Off' : 'Audio Off', selected: tracks.every(track => !track.selected) }, ...tracks];
    if (tracks.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'empty';
      empty.textContent = `No ${type === 'audio' ? 'audio' : 'subtitle'} tracks in this video`;
      menu.append(empty);
    }
    for (const track of options) {
      const item = document.createElement('button');
      item.type = 'button';
      item.role = 'menuitem';
      item.classList.toggle('selected', Boolean(track.selected));
      item.textContent = track.id === 'no' ? track.title : trackName(track, type);
      item.addEventListener('click', async () => {
        try {
          await video.selectTrack(type, String(track.id));
          menu.classList.add('hidden');
          showControls();
        } catch (error) { reportError(`Could not change ${type === 'audio' ? 'audio' : 'subtitle'} track: ${error.message || error}`); }
      });
      menu.append(item);
    }
    const bounds = anchor.getBoundingClientRect();
    menu.style.left = `${Math.min(bounds.left, innerWidth - menu.offsetWidth - 16)}px`;
  } catch (error) {
    reportError(`Could not read ${type === 'audio' ? 'audio' : 'subtitle'} tracks: ${error.message || error}`);
    menu.classList.add('hidden');
  }
}
async function cycleTrack(type, keyboard = false) {
  try {
    const tracks = await video.getTracks(type);
    if (!tracks.length) {
      if (keyboard) return showKeyboardStatus(type === 'audio' ? 'No audio tracks' : 'No subtitles');
      return showTrackMenu(type, type === 'audio' ? $('audioTrack') : $('subtitleTrack'));
    }
    const options = [{ id: 'no', selected: tracks.every(track => !track.selected) }, ...tracks];
    const current = options.findIndex(track => track.selected);
    const next = options[(current + 1) % options.length];
    await video.selectTrack(type, String(next.id));
    $('trackMenu').classList.add('hidden');
    if (keyboard) showKeyboardStatus(next.id === 'no' ? (type === 'audio' ? 'Audio off' : 'Subtitles off') : (type === 'audio' ? 'Audio: ' : 'Subtitles: ') + trackName(next, type));
  } catch (error) {
    reportError(`Could not change ${type === 'audio' ? 'audio' : 'subtitle'} track: ${error.message || error}`);
  }
}
function setVolume(level) {
  volumeLevel = Math.max(0, Math.min(volumeLimit, level));
  $('volume').value = String(volumeLevel);
  $('volumeValue').textContent = `${volumeLevel}%`;
  if (volumeLevel > 0) { previousVolumeLevel = volumeLevel; muted = false; }
  else muted = true;
  const muteButton = $('muteVolume');
  muteButton.setAttribute('aria-label', muted ? 'Unmute' : 'Mute');
  muteButton.title = muted ? 'Unmute' : 'Mute';
  muteButton.innerHTML = muted
    ? '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9H4Z"/><path d="m16 9 5 6m0-6-5 6"/></svg>'
    : '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9H4Zm12 0a5 5 0 0 1 0 6"/></svg>';
  applyVolume();
}
async function setFullscreen(requested) {
  try {
    const active = await window.player.setVideoFullscreen(requested);
    updateFullscreenUi(Boolean(active));
    if (Boolean(active) !== requested) reportError('Windows did not enter fullscreen mode. Try the fullscreen button again.');
  } catch (error) { reportError(`Fullscreen failed: ${error.message || error}`); }
}
function updateFullscreenUi(active) {
  fullscreen = active;
  document.documentElement.classList.toggle('fullscreen-mode', active);
  $('fullscreen').setAttribute('aria-label', active ? 'Exit fullscreen' : 'Enter fullscreen');
  $('fullscreen').title = active ? 'Exit fullscreen' : 'Fullscreen';
  $('fullscreen').innerHTML = active
    ? '<svg viewBox="0 0 24 24"><path d="M9 4H4v5m16-5h-5M4 15v5h5m11-5v5h-5"/></svg>'
    : '<svg viewBox="0 0 24 24"><path d="M8 4H4v4m12-4h4v4M4 16v4h4m12-4v4h-4"/></svg>';
}
window.player.onVideoFullscreenChanged(active => {
  updateFullscreenUi(active);
});
function setVolumeLimit(boostEnabled) {
  volumeLimit = boostEnabled ? 200 : 100;
  $('volume').max = String(volumeLimit);
  if (volumeLevel > volumeLimit) setVolume(volumeLimit);
}
volumeSettingsReady = window.player.getCinemaVolumeBoost()
  .then(setVolumeLimit)
  .catch(() => setVolumeLimit(false));
window.player.onCinemaVolumeBoostChanged(setVolumeLimit);

video.addEventListener('mpv-state', event => {
  setPlaying(event.detail.status === 'Playing');
  if (video.videoWidth && video.videoHeight) {
    const aspect = video.videoWidth / video.videoHeight;
    if (Math.abs(aspect - lastAspect) > 0.005) {
      lastAspect = aspect;
      window.player.setVideoAspect(video.videoWidth, video.videoHeight);
    }
  }
  const now = performance.now();
  if (now - lastProgressUiUpdate >= 250) {
    lastProgressUiUpdate = now;
    void updateProgress({ currentTime: event.detail.time, duration: event.detail.duration, paused: event.detail.status !== 'Playing' });
  }
});
video.addEventListener('mpv-error', event => reportError(`Video playback error: ${event.detail}`));
window.player.onVideoOpen(item => openVideo(item.filePath, item.title));
$('toggle').addEventListener('click', togglePlay);
$('back').addEventListener('click', () => seekBy(-10));
$('forward').addEventListener('click', () => seekBy(10));
$('audioTrack').addEventListener('click', event => showTrackMenu('audio', event.currentTarget));
$('subtitleTrack').addEventListener('click', event => showTrackMenu('sub', event.currentTarget));
$('videoSettingsButton').addEventListener('click', () => {
  const panel = $('playerSettings');
  showControls();
  panel.classList.toggle('hidden');
  updateSubtitleSettingOptions();
});
function toggleSubtitleSettingMenu(buttonId, menuId) {
  const menu = $(menuId);
  const opening = menu.classList.contains('hidden');
  closeSubtitleSettingMenus(menuId);
  menu.classList.toggle('hidden', !opening);
  $(buttonId).setAttribute('aria-expanded', String(opening));
}
function chooseSubtitleSetting(kind, value) {
  subtitleSettings = { ...subtitleSettings, [kind]: value };
  localStorage.setItem(subtitleSettingsKey, JSON.stringify(subtitleSettings));
  closeSubtitleSettingMenus();
  applySubtitleSettings();
}
$('subtitlePositionButton').addEventListener('click', () => toggleSubtitleSettingMenu('subtitlePositionButton', 'subtitlePositionOptions'));
$('subtitleSizeButton').addEventListener('click', () => toggleSubtitleSettingMenu('subtitleSizeButton', 'subtitleSizeOptions'));
$('subtitlePositionOptions').addEventListener('click', event => {
  const option = event.target.closest('[role="option"]');
  if (option) chooseSubtitleSetting('position', option.dataset.value);
});
$('subtitleSizeOptions').addEventListener('click', event => {
  const option = event.target.closest('[role="option"]');
  if (option) chooseSubtitleSetting('size', option.dataset.value);
});
$('timeline').addEventListener('pointerdown', () => { scrubbing = true; });
$('timeline').addEventListener('input', () => { scrubbing = true; updateProgress(); });
$('timeline').addEventListener('change', async () => {
  try {
    const { duration } = await video.getPlaybackInfo();
    if (duration) await video.seek(Number($('timeline').value) / 1000 * duration);
  } catch (error) { reportError(`Seek failed: ${error.message || error}`); }
  scrubbing = false;
  updateProgress();
  showControls();
});
$('timeline').addEventListener('pointercancel', () => { scrubbing = false; updateProgress(); });
$('volume').addEventListener('input', () => {
  setVolume(Number($('volume').value));
});
$('muteVolume').addEventListener('click', () => setVolume(muted ? (previousVolumeLevel || 75) : 0));
$('resumePrompt').addEventListener('click', continueFromSavedPosition);
$('fullscreen').addEventListener('click', () => setFullscreen(!fullscreen));
$('player').addEventListener('dblclick', event => {
  if (event.target.closest('button,input,label,.track-menu')) return;
  setFullscreen(!fullscreen);
});
$('close').addEventListener('click', async () => { await saveCurrentPosition(); window.player.close(); });
window.addEventListener('beforeunload', () => {
  void saveCurrentPosition();
  closing = true;
  clearInterval(progressTimer);
  clearTimeout(hideTimer);
  clearTimeout(leaveTimer);
});
document.addEventListener('mousemove', () => {
  if (moving) return;
  moving = true;
  requestAnimationFrame(() => { moving = false; });
  showControls();
});
document.addEventListener('mouseleave', () => {
  clearTimeout(hideTimer);
  leaveTimer = setTimeout(hideControls, 250);
});
document.addEventListener('click', event => {
  if (!event.target.closest('#trackMenu, #audioTrack, #subtitleTrack')) $('trackMenu').classList.add('hidden');
  if (!event.target.closest('#playerSettings, #videoSettingsButton')) $('playerSettings').classList.add('hidden');
  if (!event.target.closest('#playerSettings')) closeSubtitleSettingMenus();
});
document.addEventListener('keydown', event => {
  const target = event.target instanceof Element ? event.target : null;
  if ((target && target.closest('input,textarea,select,[contenteditable="true"],.setting-select,.setting-options')) || event.metaKey || event.shiftKey || event.ctrlKey && event.altKey) return;
  const key = event.key.toLowerCase();
  let handled = true;
  if (event.altKey && event.code === 'ArrowLeft') void seekForKeyboard(-60);
  else if (event.altKey && event.code === 'ArrowRight') void seekForKeyboard(60);
  else if (event.ctrlKey && event.code === 'ArrowLeft') void seekForKeyboard(-30);
  else if (event.ctrlKey && event.code === 'ArrowRight') void seekForKeyboard(30);
  else if (event.code === 'Space') void togglePlay().then(playing => { if (playing != null) showKeyboardStatus(playing ? 'Playing' : 'Paused'); });
  else if (event.code === 'ArrowLeft') void seekForKeyboard(-10);
  else if (event.code === 'ArrowRight') void seekForKeyboard(10);
  else if (event.code === 'ArrowUp') { setVolume(volumeLevel + 5); showKeyboardStatus(`Volume ${volumeLevel}%`); }
  else if (event.code === 'ArrowDown') { setVolume(volumeLevel - 5); showKeyboardStatus(`Volume ${volumeLevel}%`); }
  else if (!event.altKey && !event.ctrlKey && !event.metaKey && /^Digit[0-9]$|^Numpad[0-9]$/.test(event.code)) {
    const number = Number(event.code.at(-1));
    void seekToPercentage(number * 10);
  }
  else if (key === 'm') { const wasMuted = muted; setVolume(wasMuted ? (previousVolumeLevel || 75) : 0); showKeyboardStatus(wasMuted ? 'Unmuted' : 'Muted'); }
  else if (key === 'v') void cycleTrack('sub', true);
  else if (key === 'b') void cycleTrack('audio', true);
  else if (key === 'f') void setFullscreen(!fullscreen);
  else if (key === 'i' || event.code === 'Escape') { if (fullscreen) void setFullscreen(false); }
  else handled = false;
  if (handled) {
    event.preventDefault();
    hideControls();
  }
});

const initialPath = params.get('filePath');
if (initialPath) openVideo(initialPath, params.get('title'));
updateProgress();
hideControls();
