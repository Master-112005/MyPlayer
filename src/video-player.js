import { defineMpvVideoElement } from '../node_modules/electron-mpv-video/dist/renderer/index.js';

defineMpvVideoElement();

const $ = id => document.getElementById(id);
const video = $('video');
const params = new URLSearchParams(location.search);
const controls = [...document.querySelectorAll('.auto-hide')];
let hideTimer;
let leaveTimer;
let keyboardIndicatorTimer;
let progressTimer;
let progressPending = false;
let volumeFrame = 0;
let closing = false;
let moving = false;
let scrubbing = false;
let playbackDuration = 0;
let lastAspect = 0;
let fullscreen = false;
let volumeLevel = Number($('volume').value) || 75;
let volumeLimit = 100;
let volumeSettingsReady;
let previousVolumeLevel = volumeLevel;
let muted = false;
let currentFilePath = null;
let pendingResume = null;
let resumeTimer;
let lastResumeSave = 0;

function timeText(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor(seconds / 60);
  if (hours) return `${hours}:${String(minutes % 60).padStart(2, '0')}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
  return `${minutes}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
}
function showControls() {
  clearTimeout(leaveTimer);
  clearTimeout(keyboardIndicatorTimer);
  controls.forEach(control => control.classList.remove('faded'));
  clearTimeout(hideTimer);
  hideTimer = setTimeout(hideControls, 5000);
}
function hideControls() {
  controls.forEach(control => control.classList.add('faded'));
  $('trackMenu').classList.add('hidden');
}
function showKeyboardIndicator(id) {
  clearTimeout(hideTimer);
  clearTimeout(keyboardIndicatorTimer);
  hideControls();
  $(id).classList.remove('faded');
  keyboardIndicatorTimer = setTimeout(() => $(id).classList.add('faded'), 1800);
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
async function updateProgress() {
  if (closing || !video.playerId) return;
  if (scrubbing && playbackDuration) {
    const current = Number($('timeline').value) / 1000 * playbackDuration;
    $('currentTime').textContent = timeText(current);
    $('remainingTime').textContent = `-${timeText(Math.max(0, playbackDuration - current))}`;
    return;
  }
  if (progressPending) return;
  progressPending = true;
  try {
  const info = await video.getPlaybackInfo();
  const duration = Number(info.duration) || 0;
  const current = Number(info.currentTime) || 0;
  playbackDuration = duration;
  setPlaying(!info.paused);
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
    progressPending = false;
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
    await video.open(filePath);
    const saved = await window.player.getVideoResume(filePath);
    const { duration } = await video.getPlaybackInfo();
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
function setPlaying(playing) {
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
  } catch (error) { reportError(`Playback control failed: ${error.message || error}`); }
}
function trackName(track, type) {
  const title = track.title?.trim();
  const language = track.language?.trim();
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
async function cycleTrack(type) {
  try {
    const tracks = await video.getTracks(type);
    if (!tracks.length) return showTrackMenu(type, type === 'audio' ? $('audioTrack') : $('subtitleTrack'));
    const options = [{ id: 'no', selected: tracks.every(track => !track.selected) }, ...tracks];
    const current = options.findIndex(track => track.selected);
    const next = options[(current + 1) % options.length];
    await video.selectTrack(type, String(next.id));
    $('trackMenu').classList.add('hidden');
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
  updateProgress();
});
video.addEventListener('mpv-error', event => reportError(`Video playback error: ${event.detail}`));
window.player.onVideoOpen(item => openVideo(item.filePath, item.title));
$('toggle').addEventListener('click', togglePlay);
$('back').addEventListener('click', () => seekBy(-10));
$('forward').addEventListener('click', () => seekBy(10));
$('audioTrack').addEventListener('click', event => showTrackMenu('audio', event.currentTarget));
$('subtitleTrack').addEventListener('click', event => showTrackMenu('sub', event.currentTarget));
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
});
document.addEventListener('keydown', event => {
  const target = event.target instanceof Element ? event.target : null;
  if ((target && target.closest('input,textarea,select,[contenteditable="true"]')) || event.metaKey || event.shiftKey || event.ctrlKey && event.altKey) return;
  const key = event.key.toLowerCase();
  let handled = true;
  let indicator = null;
  if (event.altKey && event.code === 'ArrowLeft') { seekBy(-60); indicator = 'bottomControls'; }
  else if (event.altKey && event.code === 'ArrowRight') { seekBy(60); indicator = 'bottomControls'; }
  else if (event.ctrlKey && event.code === 'ArrowLeft') { seekBy(-30); indicator = 'bottomControls'; }
  else if (event.ctrlKey && event.code === 'ArrowRight') { seekBy(30); indicator = 'bottomControls'; }
  else if (event.code === 'Space') togglePlay();
  else if (event.code === 'ArrowLeft') { seekBy(-10); indicator = 'bottomControls'; }
  else if (event.code === 'ArrowRight') { seekBy(10); indicator = 'bottomControls'; }
  else if (event.code === 'ArrowUp') { setVolume(volumeLevel + 5); indicator = 'volumePanel'; }
  else if (event.code === 'ArrowDown') { setVolume(volumeLevel - 5); indicator = 'volumePanel'; }
  else if (key === 'm') { setVolume(muted ? (previousVolumeLevel || 75) : 0); indicator = 'volumePanel'; }
  else if (key === 'v') void cycleTrack('sub');
  else if (key === 'b') void cycleTrack('audio');
  else if (key === 'f') void setFullscreen(!fullscreen);
  else if (key === 'i' || event.code === 'Escape') { if (fullscreen) void setFullscreen(false); }
  else handled = false;
  if (handled) {
    event.preventDefault();
    if (indicator) showKeyboardIndicator(indicator);
  }
});

const initialPath = params.get('filePath');
if (initialPath) openVideo(initialPath, params.get('title'));
updateProgress();
hideControls();
