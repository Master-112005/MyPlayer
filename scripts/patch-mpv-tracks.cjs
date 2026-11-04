const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..', 'node_modules', 'electron-mpv-video');
function replace(relativePath, before, after, marker) {
  const file = path.join(root, relativePath);
  const text = fs.readFileSync(file, 'utf8');
  if (text.includes(marker)) return;
  if (!text.includes(before)) throw new Error(`Cannot patch electron-mpv-video: ${relativePath} changed upstream`);
  fs.writeFileSync(file, text.replace(before, after));
}

{
  const file = path.join(root, 'native/mpv-addon/src/mpv_addon.cc');
  let text = fs.readFileSync(file, 'utf8').replace(/^[ \t]*set_option\("panscan", "1"\);\r?\n/gm, '');
  if (!text.includes('set_option("panscan", "0");')) {
    text = text.replace('    set_option("audio-display", "no");\n', '    set_option("audio-display", "no");\n    set_option("panscan", "0");\n');
  }
  fs.writeFileSync(file, text);
}

replace('native/mpv-addon/src/mpv_addon.cc',
  '      InstanceMethod("setVolume", &MpvPlayer::SetVolume),\n',
  '      InstanceMethod("setVolume", &MpvPlayer::SetVolume),\n      InstanceMethod("setPanScan", &MpvPlayer::SetPanScan),\n',
  'InstanceMethod("setPanScan"');
replace('native/mpv-addon/src/mpv_addon.cc',
  '      InstanceMethod("setPanScan", &MpvPlayer::SetPanScan),\n',
  '      InstanceMethod("setPanScan", &MpvPlayer::SetPanScan),\n      InstanceMethod("setSubtitlePosition", &MpvPlayer::SetSubtitlePosition),\n      InstanceMethod("setSubtitleScale", &MpvPlayer::SetSubtitleScale),\n',
  'InstanceMethod("setSubtitlePosition"');
replace('native/mpv-addon/src/mpv_addon.cc',
  '  Napi::Value SeekRelative(const Napi::CallbackInfo& info) {',
  '  Napi::Value SetSubtitlePosition(const Napi::CallbackInfo& info) {\n    Napi::Env env = info.Env();\n    if (info.Length() < 1 || !info[0].IsNumber()) {\n      Napi::TypeError::New(env, "setSubtitlePosition(value) requires a number").ThrowAsJavaScriptException();\n      return env.Undefined();\n    }\n    int64_t position = std::clamp<int64_t>(info[0].As<Napi::Number>().Int64Value(), 0, 100);\n    const char* verticalAlign = position == 0 ? "top" : "bottom";\n    // Honor app placement for text tracks by removing ASS script-position overrides.\n    // shortcut: bitmap subtitles keep authored placement; moving them needs a custom renderer.\n    int ret = mpv_set_property_string(handle_, "sub-ass-override", "strip");\n    if (ret < 0) throw_mpv_error(env, "setSubtitlePosition(ASS override)", ret);\n    ret = mpv_set_property_string(handle_, "sub-align-y", verticalAlign);\n    if (ret < 0) throw_mpv_error(env, "setSubtitlePosition(alignment)", ret);\n    ret = mpv_set_property(handle_, "sub-pos", MPV_FORMAT_INT64, &position);\n    if (ret < 0) throw_mpv_error(env, "setSubtitlePosition", ret);\n    return env.Undefined();\n  }\n\n  Napi::Value SetSubtitleScale(const Napi::CallbackInfo& info) {\n    Napi::Env env = info.Env();\n    if (info.Length() < 1 || !info[0].IsNumber()) {\n      Napi::TypeError::New(env, "setSubtitleScale(value) requires a number").ThrowAsJavaScriptException();\n      return env.Undefined();\n    }\n    double scale = std::clamp(info[0].As<Napi::Number>().DoubleValue(), 0.5, 3.0);\n    int ret = mpv_set_property(handle_, "sub-scale", MPV_FORMAT_DOUBLE, &scale);\n    if (ret < 0) throw_mpv_error(env, "setSubtitleScale", ret);\n    return env.Undefined();\n  }\n\n  Napi::Value SeekRelative(const Napi::CallbackInfo& info) {',
  'Napi::Value SetSubtitlePosition');
replace('native/mpv-addon/src/mpv_addon.cc',
  '  Napi::Value SetSubtitlePosition(const Napi::CallbackInfo& info) {\n    Napi::Env env = info.Env();\n    if (info.Length() < 1 || !info[0].IsNumber()) {\n      Napi::TypeError::New(env, "setSubtitlePosition(value) requires a number").ThrowAsJavaScriptException();\n      return env.Undefined();\n    }\n    int64_t position = std::clamp<int64_t>(info[0].As<Napi::Number>().Int64Value(), 0, 100);\n    int ret = mpv_set_property(handle_, "sub-pos", MPV_FORMAT_INT64, &position);\n    if (ret < 0) throw_mpv_error(env, "setSubtitlePosition", ret);\n    return env.Undefined();\n  }',
  '  Napi::Value SetSubtitlePosition(const Napi::CallbackInfo& info) {\n    Napi::Env env = info.Env();\n    if (info.Length() < 1 || !info[0].IsNumber()) {\n      Napi::TypeError::New(env, "setSubtitlePosition(value) requires a number").ThrowAsJavaScriptException();\n      return env.Undefined();\n    }\n    int64_t position = std::clamp<int64_t>(info[0].As<Napi::Number>().Int64Value(), 0, 100);\n    const char* verticalAlign = position == 0 ? "top" : "bottom";\n    // Honor app placement for text tracks by removing ASS script-position overrides.\n    // shortcut: bitmap subtitles keep authored placement; moving them needs a custom renderer.\n    int ret = mpv_set_property_string(handle_, "sub-ass-override", "strip");\n    if (ret < 0) throw_mpv_error(env, "setSubtitlePosition(ASS override)", ret);\n    ret = mpv_set_property_string(handle_, "sub-align-y", verticalAlign);\n    if (ret < 0) throw_mpv_error(env, "setSubtitlePosition(alignment)", ret);\n    ret = mpv_set_property(handle_, "sub-pos", MPV_FORMAT_INT64, &position);\n    if (ret < 0) throw_mpv_error(env, "setSubtitlePosition", ret);\n    return env.Undefined();\n  }',
  'setSubtitlePosition(ASS override)');
replace('dist/main/mpv-service.js',
  "    'player:set-panscan',\n",
  "    'player:set-panscan',\n    'player:set-subtitle-position',\n    'player:set-subtitle-scale',\n",
  "'player:set-subtitle-position'");
replace('dist/main/mpv-service.js',
  '    setVolume(value) {\n        this.assertAlive();',
  '    setSubtitlePosition(value) {\n        this.assertAlive();\n        this.player.setSubtitlePosition(Math.max(0, Math.min(100, Math.round(finiteNumber(value, \'subtitle position\')))));\n    }\n    setSubtitleScale(value) {\n        this.assertAlive();\n        this.player.setSubtitleScale(Math.max(0.5, Math.min(3, finiteNumber(value, \'subtitle scale\'))));\n    }\n    setVolume(value) {\n        this.assertAlive();',
  '    setSubtitlePosition(value)');
replace('dist/main/mpv-service.js',
  "        electron.ipcMain.handle(channel('player:set-panscan'), async (event, id, value) => this.getOwnedSession(event, id).setPanScan(finiteNumber(value, 'panscan')));\n",
  "        electron.ipcMain.handle(channel('player:set-panscan'), async (event, id, value) => this.getOwnedSession(event, id).setPanScan(finiteNumber(value, 'panscan')));\n        electron.ipcMain.handle(channel('player:set-subtitle-position'), async (event, id, value) => this.getOwnedSession(event, id).setSubtitlePosition(finiteNumber(value, 'subtitle position')));\n        electron.ipcMain.handle(channel('player:set-subtitle-scale'), async (event, id, value) => this.getOwnedSession(event, id).setSubtitleScale(finiteNumber(value, 'subtitle scale')));\n",
  "handle(channel('player:set-subtitle-position')");
replace('dist/preload/index.cjs',
  "        setPanScan: (value) => electron.ipcRenderer.invoke(channel('player:set-panscan'), id, value),\n",
  "        setPanScan: (value) => electron.ipcRenderer.invoke(channel('player:set-panscan'), id, value),\n        setSubtitlePosition: (value) => electron.ipcRenderer.invoke(channel('player:set-subtitle-position'), id, value),\n        setSubtitleScale: (value) => electron.ipcRenderer.invoke(channel('player:set-subtitle-scale'), id, value),\n",
  'setSubtitlePosition: (value)');
replace('dist/renderer/mpv-video.js',
  '    async setPanScan(value) {\n',
  '    async setSubtitlePosition(value) {\n        await this.ensureReady();\n        await this.player?.setSubtitlePosition(value);\n    }\n    async setSubtitleScale(value) {\n        await this.ensureReady();\n        await this.player?.setSubtitleScale(value);\n    }\n    async setPanScan(value) {\n',
  '    async setSubtitlePosition(value)');
replace('dist/renderer/mpv-video.d.ts',
  '    setPanScan(value: number): Promise<void>;\n',
  '    setPanScan(value: number): Promise<void>;\n    setSubtitlePosition(value: number): Promise<void>;\n    setSubtitleScale(value: number): Promise<void>;\n',
  '    setSubtitlePosition(value: number): Promise<void>;');
replace('native/mpv-addon/src/mpv_addon.cc',
  '  Napi::Value SetVolume(const Napi::CallbackInfo& info) {',
  '  Napi::Value SetPanScan(const Napi::CallbackInfo& info) {\n    Napi::Env env = info.Env();\n    if (info.Length() < 1 || !info[0].IsNumber()) {\n      Napi::TypeError::New(env, "setPanScan(value) requires a number").ThrowAsJavaScriptException();\n      return env.Undefined();\n    }\n    double value = std::clamp(info[0].As<Napi::Number>().DoubleValue(), 0.0, 1.0);\n    int ret = mpv_set_property(handle_, "panscan", MPV_FORMAT_DOUBLE, &value);\n    if (ret < 0) throw_mpv_error(env, "setPanScan", ret);\n    return env.Undefined();\n  }\n\n  Napi::Value SetVolume(const Napi::CallbackInfo& info) {',
  'Napi::Value SetPanScan');
{
  const file = path.join(root, 'native/mpv-addon/src/mpv_addon.cc');
  let text = fs.readFileSync(file, 'utf8');
  if (text.includes('observe("dwidth", MPV_FORMAT_INT64);') && !text.includes('observe("width", MPV_FORMAT_INT64);')) {
    text = text.replace('    observe("dwidth", MPV_FORMAT_INT64);\n', '    observe("width", MPV_FORMAT_INT64);\n    observe("height", MPV_FORMAT_INT64);\n    observe("dwidth", MPV_FORMAT_INT64);\n');
  }
  fs.writeFileSync(file, text);
}
replace('native/mpv-addon/src/mpv_addon.cc',
  '    observe("width", MPV_FORMAT_INT64);\n    observe("height", MPV_FORMAT_INT64);\n',
  '    observe("width", MPV_FORMAT_INT64);\n    observe("height", MPV_FORMAT_INT64);\n    observe("dwidth", MPV_FORMAT_INT64);\n    observe("dheight", MPV_FORMAT_INT64);\n',
  'observe("dwidth"');
{
  const file = path.join(root, 'dist/renderer/mpv-video.js');
  let text = fs.readFileSync(file, 'utf8');
  const videoDimensionCases = /            case '(?:width|dwidth)':\n[\s\S]*?            case 'video-codec':/;
  if (!text.includes('displayWidth: 0,')) {
    if (!videoDimensionCases.test(text)) throw new Error('Cannot patch electron-mpv-video: video dimension events changed upstream');
    text = text.replace(videoDimensionCases,
      "            case 'width':\n                this.state.width = typeof event.data === 'number' && event.data > 0 ? event.data : this.state.width;\n                break;\n            case 'height':\n                this.state.height = typeof event.data === 'number' && event.data > 0 ? event.data : this.state.height;\n                break;\n            case 'dwidth':\n                this.state.displayWidth = typeof event.data === 'number' && event.data > 0 ? event.data : this.state.displayWidth;\n                break;\n            case 'dheight':\n                this.state.displayHeight = typeof event.data === 'number' && event.data > 0 ? event.data : this.state.displayHeight;\n                break;\n            case 'video-codec':");
  }
  fs.writeFileSync(file, text);
}
replace('dist/renderer/mpv-video.js',
  '        height: 0,\n        codec: \'-\',',
  '        height: 0,\n        displayWidth: 0,\n        displayHeight: 0,\n        codec: \'-\',',
  'displayWidth: 0,');
{
  const file = path.join(root, 'dist/renderer/mpv-video.js');
  let text = fs.readFileSync(file, 'utf8');
  if (!text.includes('resetVideoDimensions()')) {
    const oldGetters = '    get videoWidth() {\n        return this.state.width;\n    }\n    get videoHeight() {\n        return this.state.height;\n    }';
    const displayGetters = '    get videoWidth() {\n        return this.state.displayWidth || this.state.width;\n    }';
    const getters = text.includes(oldGetters) ? oldGetters : text.includes(displayGetters) ? displayGetters : null;
    if (!getters) throw new Error('Cannot patch electron-mpv-video: video dimension getters changed upstream');
    text = text.replace(getters, `    resetVideoDimensions() {\n        this.state.width = this.state.height = this.state.displayWidth = this.state.displayHeight = 0;\n    }\n${getters}`);
  }
  fs.writeFileSync(file, text);
}
replace('native/mpv-addon/src/mpv_addon.cc',
  '      InstanceMethod("setVolume", &MpvPlayer::SetVolume),\n',
  '      InstanceMethod("setVolume", &MpvPlayer::SetVolume),\n      InstanceMethod("cycleAudioTrack", &MpvPlayer::CycleAudioTrack),\n      InstanceMethod("cycleSubtitleTrack", &MpvPlayer::CycleSubtitleTrack),\n',
  'InstanceMethod("cycleAudioTrack"');
replace('native/mpv-addon/src/mpv_addon.cc',
  '    return env.Undefined();\n  }\n\n  Napi::Value SetUpdateCallback',
  '    return env.Undefined();\n  }\n\n  Napi::Value CycleAudioTrack(const Napi::CallbackInfo& info) {\n    Napi::Env env = info.Env();\n    int ret = command({"cycle", "audio"});\n    if (ret < 0) throw_mpv_error(env, "cycleAudioTrack", ret);\n    return env.Undefined();\n  }\n\n  Napi::Value CycleSubtitleTrack(const Napi::CallbackInfo& info) {\n    Napi::Env env = info.Env();\n    int ret = command({"cycle", "sub"});\n    if (ret < 0) throw_mpv_error(env, "cycleSubtitleTrack", ret);\n    return env.Undefined();\n  }\n\n  Napi::Value SetUpdateCallback',
  'Napi::Value CycleAudioTrack');
replace('dist/main/mpv-service.js',
  "    'player:set-volume',\n",
  "    'player:set-volume',\n    'player:cycle-audio-track',\n    'player:cycle-subtitle-track',\n",
  "'player:cycle-audio-track'");
replace('dist/main/mpv-service.js',
  '        this.volume = nextVolume;\n    }\n    setRenderSize(size) {',
  '        this.volume = nextVolume;\n    }\n    cycleAudioTrack() {\n        this.assertAlive();\n        this.player.cycleAudioTrack();\n    }\n    cycleSubtitleTrack() {\n        this.assertAlive();\n        this.player.cycleSubtitleTrack();\n    }\n    setRenderSize(size) {',
  '    cycleAudioTrack()');
replace('dist/main/mpv-service.js',
  "        electron.ipcMain.handle(channel('player:set-volume'), async (event, id, value) => this.getOwnedSession(event, id).setVolume(finiteNumber(value, 'volume')));\n",
  "        electron.ipcMain.handle(channel('player:set-volume'), async (event, id, value) => this.getOwnedSession(event, id).setVolume(finiteNumber(value, 'volume')));\n        electron.ipcMain.handle(channel('player:cycle-audio-track'), async (event, id) => this.getOwnedSession(event, id).cycleAudioTrack());\n        electron.ipcMain.handle(channel('player:cycle-subtitle-track'), async (event, id) => this.getOwnedSession(event, id).cycleSubtitleTrack());\n",
  "handle(channel('player:cycle-audio-track')");
replace('dist/main/mpv-service.js',
  "    'player:set-volume',\n",
  "    'player:set-volume',\n    'player:set-panscan',\n",
  "'player:set-panscan'");
replace('dist/main/mpv-service.js',
  '    setVolume(value) {\n        this.assertAlive();',
  '    setPanScan(value) {\n        this.assertAlive();\n        const nextValue = Math.max(0, Math.min(1, finiteNumber(value, \'panscan\')));\n        this.player.setPanScan(nextValue);\n    }\n    setVolume(value) {\n        this.assertAlive();',
  '    setPanScan(value)');
replace('dist/main/mpv-service.js',
  "        electron.ipcMain.handle(channel('player:set-volume'), async (event, id, value) => this.getOwnedSession(event, id).setVolume(finiteNumber(value, 'volume')));\n",
  "        electron.ipcMain.handle(channel('player:set-volume'), async (event, id, value) => this.getOwnedSession(event, id).setVolume(finiteNumber(value, 'volume')));\n        electron.ipcMain.handle(channel('player:set-panscan'), async (event, id, value) => this.getOwnedSession(event, id).setPanScan(finiteNumber(value, 'panscan')));\n",
  "handle(channel('player:set-panscan')");
replace('dist/preload/index.cjs',
  '        setVolume: (value) => electron.ipcRenderer.invoke(channel(\'player:set-volume\'), id, value),\n',
  '        setVolume: (value) => electron.ipcRenderer.invoke(channel(\'player:set-volume\'), id, value),\n        setPanScan: (value) => electron.ipcRenderer.invoke(channel(\'player:set-panscan\'), id, value),\n',
  'setPanScan: (value)');
replace('dist/renderer/mpv-video.js',
  '    async setVolume(value) {\n',
  '    async setPanScan(value) {\n        await this.ensureReady();\n        await this.player?.setPanScan(value);\n    }\n    async setVolume(value) {\n',
  '    async setPanScan(value)');
replace('dist/renderer/mpv-video.d.ts',
  '    setVolume(value: number): Promise<void>;\n',
  '    setVolume(value: number): Promise<void>;\n    setPanScan(value: number): Promise<void>;\n',
  'setPanScan(value: number)');
replace('dist/preload/index.cjs',
  "        setVolume: (value) => electron.ipcRenderer.invoke(channel('player:set-volume'), id, value),\n",
  "        setVolume: (value) => electron.ipcRenderer.invoke(channel('player:set-volume'), id, value),\n        cycleAudioTrack: () => electron.ipcRenderer.invoke(channel('player:cycle-audio-track'), id),\n        cycleSubtitleTrack: () => electron.ipcRenderer.invoke(channel('player:cycle-subtitle-track'), id),\n",
  'cycleAudioTrack: () => electron.ipcRenderer');
replace('dist/renderer/mpv-video.js',
  '        await this.player?.setVolume(volume);\n    }\n    async setRenderMode(mode) {',
  '        await this.player?.setVolume(volume);\n    }\n    async cycleAudioTrack() {\n        await this.ensureReady();\n        await this.player?.cycleAudioTrack();\n    }\n    async cycleSubtitleTrack() {\n        await this.ensureReady();\n        await this.player?.cycleSubtitleTrack();\n    }\n    async setRenderMode(mode) {',
  '    async cycleAudioTrack()');
replace('dist/renderer/mpv-video.d.ts',
  '    setVolume(value: number): Promise<void>;\n',
  '    setVolume(value: number): Promise<void>;\n    cycleAudioTrack(): Promise<void>;\n    cycleSubtitleTrack(): Promise<void>;\n',
  '    cycleAudioTrack(): Promise<void>;');

replace('native/mpv-addon/src/mpv_addon.cc',
  '      InstanceMethod("seek", &MpvPlayer::Seek),\n',
  '      InstanceMethod("seek", &MpvPlayer::Seek),\n      InstanceMethod("seekRelative", &MpvPlayer::SeekRelative),\n',
  'InstanceMethod("seekRelative"');
replace('native/mpv-addon/src/mpv_addon.cc',
  '      InstanceMethod("cycleSubtitleTrack", &MpvPlayer::CycleSubtitleTrack),\n',
  '      InstanceMethod("cycleSubtitleTrack", &MpvPlayer::CycleSubtitleTrack),\n      InstanceMethod("getTracks", &MpvPlayer::GetTracks),\n      InstanceMethod("selectTrack", &MpvPlayer::SelectTrack),\n      InstanceMethod("getPlaybackInfo", &MpvPlayer::GetPlaybackInfo),\n',
  'InstanceMethod("getTracks"');
replace('native/mpv-addon/src/mpv_addon.cc',
  '      InstanceMethod("selectTrack", &MpvPlayer::SelectTrack),\n',
  '      InstanceMethod("selectTrack", &MpvPlayer::SelectTrack),\n      InstanceMethod("getPlaybackInfo", &MpvPlayer::GetPlaybackInfo),\n',
  'InstanceMethod("getPlaybackInfo"');
replace('native/mpv-addon/src/mpv_addon.cc',
  '#include <cstdlib>\n', '#include <cctype>\n#include <cmath>\n#include <cstdlib>\n', '#include <cmath>');
replace('native/mpv-addon/src/mpv_addon.cc',
  '    return env.Undefined();\n  }\n\n  Napi::Value SetVolume',
  '    return env.Undefined();\n  }\n\n  Napi::Value SeekRelative(const Napi::CallbackInfo& info) {\n    Napi::Env env = info.Env();\n    if (info.Length() < 1 || !info[0].IsNumber()) {\n      Napi::TypeError::New(env, "seekRelative(seconds) requires a number").ThrowAsJavaScriptException();\n      return env.Undefined();\n    }\n    double seconds = info[0].As<Napi::Number>().DoubleValue();\n    int ret = command({"seek", std::to_string(seconds), "relative+exact"});\n    if (ret < 0) throw_mpv_error(env, "seekRelative", ret);\n    return env.Undefined();\n  }\n\n  Napi::Value SetVolume',
  'Napi::Value SeekRelative');
replace('native/mpv-addon/src/mpv_addon.cc',
  'int ret = command({"seek", std::to_string(seconds), "relative+exact"});',
  'int ret = command({"seek", std::to_string(seconds), "relative+keyframes"});',
  'std::to_string(seconds), "relative+keyframes"');
replace('native/mpv-addon/src/mpv_addon.cc',
  'set_option("hwdec", hwdec && hwdec[0] ? hwdec : "no");',
  'set_option("hwdec", hwdec && hwdec[0] ? hwdec : "auto-safe");',
  'hwdec && hwdec[0] ? hwdec : "auto-safe"');
replace('native/mpv-addon/src/mpv_addon.cc',
  '#include <cstdlib>\n', '#include <cctype>\n#include <cstdlib>\n', '#include <cctype>');
replace('native/mpv-addon/src/mpv_addon.cc',
  '  Napi::Value SetUpdateCallback(const Napi::CallbackInfo& info) {',
  '  Napi::Value GetTracks(const Napi::CallbackInfo& info) {\n    Napi::Env env = info.Env();\n    if (info.Length() < 1 || !info[0].IsString()) {\n      Napi::TypeError::New(env, "getTracks(type) requires audio or sub").ThrowAsJavaScriptException();\n      return env.Undefined();\n    }\n    const std::string type = info[0].As<Napi::String>().Utf8Value();\n    if (type != "audio" && type != "sub") {\n      Napi::TypeError::New(env, "track type must be audio or sub").ThrowAsJavaScriptException();\n      return env.Undefined();\n    }\n    int64_t count = 0;\n    if (mpv_get_property(handle_, "track-list/count", MPV_FORMAT_INT64, &count) < 0) return Napi::Array::New(env);\n    auto read = [this](const std::string& name) {\n      char* result = mpv_get_property_string(handle_, name.c_str());\n      std::string value = result ? result : "";\n      if (result) mpv_free(result);\n      return value;\n    };\n    Napi::Array tracks = Napi::Array::New(env);\n    uint32_t index = 0;\n    for (int64_t i = 0; i < std::min<int64_t>(count, 256); ++i) {\n      const std::string prefix = "track-list/" + std::to_string(i) + "/";\n      if (read(prefix + "type") != type) continue;\n      const std::string id = read(prefix + "id");\n      const std::string title = read(prefix + "title");\n      const std::string language = read(prefix + "lang");\n      Napi::Object track = Napi::Object::New(env);\n      track.Set("id", id);\n      track.Set("title", !title.empty() ? title : (!language.empty() ? language : (type == "audio" ? "Audio track " : "Subtitle track ") + id));\n      track.Set("language", language);\n      track.Set("selected", read(prefix + "selected") == "yes");\n      tracks.Set(index++, track);\n    }\n    return tracks;\n  }\n\n  Napi::Value SelectTrack(const Napi::CallbackInfo& info) {\n    Napi::Env env = info.Env();\n    if (info.Length() < 2 || !info[0].IsString() || !info[1].IsString()) {\n      Napi::TypeError::New(env, "selectTrack(type, id) requires string values").ThrowAsJavaScriptException();\n      return env.Undefined();\n    }\n    const std::string type = info[0].As<Napi::String>().Utf8Value();\n    const std::string id = info[1].As<Napi::String>().Utf8Value();\n    const bool validId = id == "no" || (!id.empty() && std::all_of(id.begin(), id.end(), [](unsigned char c) { return std::isdigit(c); }));\n    if ((type != "audio" && type != "sub") || !validId) {\n      Napi::TypeError::New(env, "invalid track selection").ThrowAsJavaScriptException();\n      return env.Undefined();\n    }\n    const char* property = type == "audio" ? "aid" : "sid";\n    int ret = command({"set", property, id});\n    if (ret < 0) throw_mpv_error(env, "selectTrack", ret);\n    return env.Undefined();\n  }\n\n  Napi::Value GetPlaybackInfo(const Napi::CallbackInfo& info) {\n    Napi::Env env = info.Env();\n    double currentTime = 0;\n    double duration = 0;\n    int paused = 1;\n    mpv_get_property(handle_, "time-pos", MPV_FORMAT_DOUBLE, &currentTime);\n    mpv_get_property(handle_, "duration", MPV_FORMAT_DOUBLE, &duration);\n    mpv_get_property(handle_, "pause", MPV_FORMAT_FLAG, &paused);\n    Napi::Object result = Napi::Object::New(env);\n    result.Set("currentTime", std::isfinite(currentTime) ? currentTime : 0);\n    result.Set("duration", std::isfinite(duration) ? duration : 0);\n    result.Set("paused", paused != 0);\n    return result;\n  }\n\n  Napi::Value SetUpdateCallback(const Napi::CallbackInfo& info) {',
  'Napi::Value GetTracks');

replace('dist/main/mpv-service.js', "    'player:seek',\n", "    'player:seek',\n    'player:seek-relative',\n    'player:get-tracks',\n    'player:select-track',\n", "'player:seek-relative'");
replace('dist/main/mpv-service.js',
  '    setPanScan(value) {',
  '    seekRelative(seconds) {\n        this.assertAlive();\n        this.player.seekRelative(finiteNumber(seconds, \'seconds\'));\n    }\n    setPanScan(value) {',
  '    seekRelative(seconds)');
replace('dist/main/mpv-service.js',
  '    cycleSubtitleTrack() {\n        this.assertAlive();\n        this.player.cycleSubtitleTrack();\n    }\n    setRenderSize(size) {',
  '    cycleSubtitleTrack() {\n        this.assertAlive();\n        this.player.cycleSubtitleTrack();\n    }\n    getTracks(type) {\n        this.assertAlive();\n        if (type !== \'audio\' && type !== \'sub\') throw new TypeError(\'track type must be audio or sub\');\n        return this.player.getTracks(type);\n    }\n    selectTrack(type, id) {\n        this.assertAlive();\n        if (type !== \'audio\' && type !== \'sub\') throw new TypeError(\'track type must be audio or sub\');\n        if (typeof id !== \'string\' || (id !== \'no\' && !/^\\d+$/.test(id))) throw new TypeError(\'invalid track id\');\n        this.player.selectTrack(type, id);\n    }\n    setRenderSize(size) {',
  '    getTracks(type)');
replace('dist/main/mpv-service.js',
  "        electron.ipcMain.handle(channel('player:seek'), async (event, id, seconds) => this.getOwnedSession(event, id).seek(finiteNumber(seconds, 'seconds')));\n",
  "        electron.ipcMain.handle(channel('player:seek'), async (event, id, seconds) => this.getOwnedSession(event, id).seek(finiteNumber(seconds, 'seconds')));\n        electron.ipcMain.handle(channel('player:seek-relative'), async (event, id, seconds) => this.getOwnedSession(event, id).seekRelative(finiteNumber(seconds, 'seconds')));\n        electron.ipcMain.handle(channel('player:get-tracks'), async (event, id, type) => this.getOwnedSession(event, id).getTracks(type));\n        electron.ipcMain.handle(channel('player:select-track'), async (event, id, type, trackId) => this.getOwnedSession(event, id).selectTrack(type, trackId));\n",
  "handle(channel('player:seek-relative')");
replace('dist/preload/index.cjs',
  "        seek: (seconds) => electron.ipcRenderer.invoke(channel('player:seek'), id, seconds),\n",
  "        seek: (seconds) => electron.ipcRenderer.invoke(channel('player:seek'), id, seconds),\n        seekRelative: (seconds) => electron.ipcRenderer.invoke(channel('player:seek-relative'), id, seconds),\n        getTracks: (type) => electron.ipcRenderer.invoke(channel('player:get-tracks'), id, type),\n        selectTrack: (type, trackId) => electron.ipcRenderer.invoke(channel('player:select-track'), id, type, trackId),\n",
  'seekRelative: (seconds) => electron.ipcRenderer');
replace('dist/renderer/mpv-video.js',
  '    async seek(seconds) {\n        await this.ensureReady();\n        await this.player?.seek(seconds);\n    }\n',
  '    async seek(seconds) {\n        await this.ensureReady();\n        await this.player?.seek(seconds);\n    }\n    async seekRelative(seconds) {\n        await this.ensureReady();\n        await this.player?.seekRelative(seconds);\n    }\n',
  '    async seekRelative(seconds)');
replace('dist/renderer/mpv-video.js',
  '    async cycleSubtitleTrack() {\n        await this.ensureReady();\n        await this.player?.cycleSubtitleTrack();\n    }\n',
  '    async cycleSubtitleTrack() {\n        await this.ensureReady();\n        await this.player?.cycleSubtitleTrack();\n    }\n    async getTracks(type) {\n        await this.ensureReady();\n        return (await this.player?.getTracks(type)) ?? [];\n    }\n    async selectTrack(type, id) {\n        await this.ensureReady();\n        await this.player?.selectTrack(type, id);\n    }\n',
  '    async getTracks(type)');
replace('dist/renderer/mpv-video.d.ts',
  '    seek(seconds: number): Promise<void>;\n',
  '    seek(seconds: number): Promise<void>;\n    seekRelative(seconds: number): Promise<void>;\n',
  '    seekRelative(seconds: number)');
replace('dist/renderer/mpv-video.d.ts',
  '    cycleSubtitleTrack(): Promise<void>;\n',
  '    cycleSubtitleTrack(): Promise<void>;\n    getTracks(type: \'audio\' | \'sub\'): Promise<Array<{ id: string; title: string; language: string; selected: boolean }>>;\n    selectTrack(type: \'audio\' | \'sub\', id: string): Promise<void>;\n',
  '    getTracks(type:');

replace('dist/main/mpv-service.js',
  "    'player:select-track',\n",
  "    'player:select-track',\n    'player:get-playback-info',\n",
  "'player:get-playback-info'");
replace('dist/main/mpv-service.js',
  '        this.player.selectTrack(type, id);\n    }\n',
  '        this.player.selectTrack(type, id);\n    }\n    getPlaybackInfo() {\n        this.assertAlive();\n        return this.player.getPlaybackInfo();\n    }\n',
  '    getPlaybackInfo()');
replace('dist/main/mpv-service.js',
  "        electron.ipcMain.handle(channel('player:select-track'), async (event, id, type, trackId) => this.getOwnedSession(event, id).selectTrack(type, trackId));\n",
  "        electron.ipcMain.handle(channel('player:select-track'), async (event, id, type, trackId) => this.getOwnedSession(event, id).selectTrack(type, trackId));\n        electron.ipcMain.handle(channel('player:get-playback-info'), async (event, id) => {\n            if (!this.windows.has(event.sender.id)) return { currentTime: 0, duration: 0, paused: true };\n            return this.getOwnedSession(event, id).getPlaybackInfo();\n        });\n",
  "if (!this.windows.has(event.sender.id)) return { currentTime: 0");
replace('dist/preload/index.cjs',
  "        selectTrack: (type, trackId) => electron.ipcRenderer.invoke(channel('player:select-track'), id, type, trackId),\n",
  "        selectTrack: (type, trackId) => electron.ipcRenderer.invoke(channel('player:select-track'), id, type, trackId),\n        getPlaybackInfo: () => electron.ipcRenderer.invoke(channel('player:get-playback-info'), id),\n",
  'getPlaybackInfo: () => electron.ipcRenderer');
replace('dist/renderer/mpv-video.js',
  '    async selectTrack(type, id) {\n        await this.ensureReady();\n        await this.player?.selectTrack(type, id);\n    }\n',
  '    async selectTrack(type, id) {\n        await this.ensureReady();\n        await this.player?.selectTrack(type, id);\n    }\n    async getPlaybackInfo() {\n        await this.ensureReady();\n        return (await this.player?.getPlaybackInfo()) ?? { currentTime: 0, duration: 0, paused: true };\n    }\n',
  '    async getPlaybackInfo()');
replace('dist/renderer/mpv-video.d.ts',
  '    selectTrack(type: \'audio\' | \'sub\', id: string): Promise<void>;\n',
  '    selectTrack(type: \'audio\' | \'sub\', id: string): Promise<void>;\n    getPlaybackInfo(): Promise<{ currentTime: number; duration: number; paused: boolean }>;\n',
  '    getPlaybackInfo(): Promise<');

replace('native/mpv-addon/src/mpv_addon.cc',
  '    set_option("msg-level", "all=warn");\n',
  '    set_option("msg-level", "all=warn");\n    set_option("volume-max", "200");\n',
  'set_option("volume-max", "200")');
replace('native/mpv-addon/src/mpv_addon.cc',
  '    set_option("volume-max", "200");\n',
  '    set_option("volume-max", "200");\n    set_option("sub-font", "Segoe UI");\n    set_option("sub-color", "#FFFFFF");\n    set_option("sub-border-color", "#161616");\n    set_option("sub-border-size", "2");\n    set_option("sub-shadow-offset", "1.5");\n',
  'set_option("sub-font", "Segoe UI")');
replace('native/mpv-addon/src/mpv_addon.cc',
  'double volume = std::clamp(info[0].As<Napi::Number>().DoubleValue(), 0.0, 100.0);',
  'double volume = std::clamp(info[0].As<Napi::Number>().DoubleValue(), 0.0, 200.0);',
  'std::clamp(info[0].As<Napi::Number>().DoubleValue(), 0.0, 200.0)');
replace('dist/main/mpv-service.js',
  'const nextVolume = Math.max(0, Math.min(100, finiteNumber(value, \'volume\')));',
  'const nextVolume = Math.max(0, Math.min(200, finiteNumber(value, \'volume\')));',
  'Math.min(200, finiteNumber(value, \'volume\'))');
replace('dist/renderer/mpv-video.js',
  '    get volume() {\n        const value = Number(this.getAttribute(\'volume\') ?? 80);\n        return Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : 80;\n    }',
  '    get volume() {\n        const value = Number(this.getAttribute(\'volume\') ?? 80);\n        return Number.isFinite(value) ? Math.max(0, Math.min(200, value)) : 80;\n    }',
  'return Number.isFinite(value) ? Math.max(0, Math.min(200, value)) : 80;');
replace('dist/renderer/mpv-video.js',
  '        const volume = Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : 80;',
  '        const volume = Number.isFinite(value) ? Math.max(0, Math.min(200, value)) : 80;',
  'const volume = Number.isFinite(value) ? Math.max(0, Math.min(200, value)) : 80;');
