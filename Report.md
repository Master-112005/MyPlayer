# MyPlayer technical report

**Report date:** 6 November 2026  
**Application version:** 1.2.21  
**Review method:** static review of the tracked application source, package manifest, installer scripts, and the project knowledge graph. This report describes the implementation in this checkout; it is not a claim that every feature was exercised on a physical Windows machine during this review.

## 1. What the application is

MyPlayer is a Windows desktop media application implemented with Electron. One installer exposes two separately branded entry points:

- **MyMusic** — scans a selected music folder and plays local audio files in a compact liquid-glass player.
- **MyCinema** — scans one or more video folders, displays them as shelves of cards, and opens the selected item in a dedicated native-backed video window.

It has no application server, cloud account, database, web API, React/Vue/Angular framework, or TypeScript build. Its UI is written directly in HTML, CSS, and browser JavaScript. Media files are read from the user’s local disk.

## 2. Technology stack

| Area | Technology / method | Use in MyPlayer |
|---|---|---|
| Desktop runtime | Electron 45.1.0 | Creates native Windows, runs the renderer UI, provides IPC, file dialogs, file associations, shell integration, and crash reporting. |
| Runtime language | JavaScript, CommonJS in the main/preload processes and browser JavaScript in renderers | Entire application implementation. |
| UI | Semantic HTML, CSS, inline SVG, native `<dialog>`, Canvas 2D | Direct DOM-based interface; no virtual DOM framework. |
| Audio playback | HTML `<audio>` plus Web Audio API | Plays local audio; an `AudioContext`/`AnalyserNode` feeds the animated visualizer. |
| Audio metadata | `music-metadata` 11.16.1 | Reads title, artist, album, genre, composer, year, lyrics, duration, and embedded artwork. |
| Video playback | `electron-mpv-video` 0.1.1, native MPV addon, libmpv and FFmpeg | Broad local video/audio codec support, audio/subtitle tracks, native video rendering, seeking, and playback status. |
| Storage | Browser `localStorage` and small JSON files in Electron `userData` | Stores UI/library preferences and playback-resume state locally. No SQL/NoSQL database is used. |
| Windows packaging | `electron-builder` 26.18.0, NSIS | Produces a Windows NSIS installer named `MyPlayer-Setup-<version>.exe`. |
| Reliability | Electron Crash Reporter (local only), stability JSONL log, renderer crash listeners | Captures crash dumps locally and logs key process failures without uploading them. |

The installed top-level package versions at review time are Electron 45.1.0, Electron Builder 26.18.0, `electron-mpv-video` 0.1.1, and `music-metadata` 11.16.1.

## 3. High-level architecture

```text
Windows shortcut / file association
              |
              v
Electron main process (src/main.cjs)
  - creates and owns BrowserWindows
  - scans local folders and reads metadata
  - validates IPC requests
  - stores video resume/settings JSON
  - hosts libmpv for video
              |
   context-isolated preload bridge (src/preload.cjs)
              |
      +-------+---------------------+
      |                             |
      v                             v
MyMusic / MyCinema renderer     Video-window renderer
index.html + renderer.js        video-player.html + video-player.js
index.html + cinema.js          electron-mpv-video element/API
      |                             |
HTML audio + Web Audio API          libmpv / FFmpeg
```

The main process selects the initial mode from command-line arguments. `--player=music` is the default, `--player=cinema` opens MyCinema, an audio file argument launches MyMusic, and a supported video file argument opens the dedicated video window. MyCinema has a separate Electron session-data directory (`MyCinemaSession`) so its renderer storage is kept apart from MyMusic.

### Main process responsibilities

`src/main.cjs` is the system boundary and main coordinator. It:

- Defines supported audio and video extension sets.
- Creates transparent, frameless, rounded, no-native-shadow `BrowserWindow` instances for the main application and dedicated video player.
- Uses safe local `file:` URLs for the audio tracks returned to the music renderer.
- Recursively scans selected folders with asynchronous `node:fs/promises` directory reads, ignoring hidden directories, then sorts names in a numeric, case-insensitive way.
- Reads metadata via a dynamic `music-metadata` import.
- Finds embedded cover artwork and, if absent, checks for conventional sibling cover files such as `cover.jpg`, `folder.png`, or `front.webp`.
- Validates file paths, numerical ranges, calling web contents, and window ownership before accepting sensitive IPC requests.
- Manages video-window sizing, aspect ratio, full-screen state, and MPV window attachment/detachment.
- Registers local crash reporting and records startup, unhandled exceptions, child process loss, and renderer loss in `stability.log`.

## 4. Renderer UI and DOM method

The interface is not generated by a component framework. `index.html` supplies the stable screen structure; `renderer.js`, `cinema.js`, and `video-player.js` query and update that structure directly.

### DOM APIs and patterns in use

| Method / browser feature | How it is used |
|---|---|
| `document.getElementById()` and `document.querySelector(All)()` | Collect stable controls into a `ui` object and find dynamic controls. |
| `document.createElement()` | Builds queue rows, playlist choices, video cards, shelves, posters, floating decorative notes, settings rows, and audio/subtitle menus. |
| `replaceChildren()` and `append()` | Re-renders dynamic lists without string-concatenating user filenames into HTML. |
| `classList`, `hidden`, `dataset`, style custom properties | Controls screen state, visibility, selected controls, per-card colours, mini-mode state, and live visual effects. |
| Native events | Uses `click`, `input`, `change`, `keydown`, `pointerdown`, `dragstart`, `dragover`, `drop`, `scroll`, `focus`, `blur`, `pagehide`, and media events. |
| Accessibility semantics | Uses labels, live/status regions, `aria-*` attributes, focusable custom sliders, roles, titles, and native modal dialogs. |
| `IntersectionObserver` | Lazily obtains music artwork for visible queue rows and lazily creates video thumbnails near the viewport. |
| `ResizeObserver` and `MutationObserver` | The small `scroll-fade.js` module updates top/bottom scroll-edge fades when content or dimensions change. |
| `requestAnimationFrame()` | Drives the music visualizer, throttles UI work, and schedules shelf fade calculations. |
| Canvas 2D | Draws the audio visualizer, samples cover-art colours, and captures 480×270 JPEG video posters. |
| CSS | Uses custom properties, SVG, transitions/animations, blur and glass effects, media queries, and reduced-motion support. |

### Screen organisation

`index.html` contains both main views. `mode.js` reads `?app=music` or `?app=cinema` and assigns `data-app-mode` to the root element before the page renders. `cinema.js` then activates the cinema view or hides it; `renderer.js` handles the music view. This keeps the shell shared while allowing both products to have different panels and startup branding.

The main music shell has three principal states:

- **Home** (`.home-open`) for shortcuts, library browsing, playlists, search, and settings.
- **Full player** (`.player-open`) for artwork, transport, seek, volume, and playback options.
- **Mini player** (`.mini-mode`) for a compact always-on-top 440×140 player. The normal music window target is 350×600.

MyCinema is a video-library screen with a search field, settings panel, folder list, horizontally scrollable shelves, video cards, poster thumbnails, status text, and an in-app warning dialog before enabling volume above 100%.

## 5. MyMusic implementation

### Library and metadata flow

1. The renderer calls `window.player.chooseFolder()`.
2. The main process shows an Electron directory picker and recursively returns supported audio files with absolute paths, `file:` URLs, and filenames.
3. The renderer restores manual ordering and date-added data, then renders the queue and playlist/home screens.
4. Track details are requested lazily from `getTrackInfo()`. This parses tags and reads embedded artwork or a standard cover file.
5. Search metadata is indexed on demand, with at most three concurrent metadata reads. Queue artwork is also lazy-loaded when its row is near the viewport.

Supported music extensions include MP3, M4A, AAC, WAV, FLAC, OGG, Opus, WMA, AIFF, and AIF. Playback ultimately depends on Chromium/Windows decoding support; the UI reports an error if the browser audio element cannot play a format.

### Playback and visualisation

The audio player is a single HTML `<audio>` element. `playTrack()` changes its `src` to the local file URL, loads it, optionally calls `audio.play()`, then refreshes the metadata/UI as information arrives. The renderer listens to `play`, `pause`, `timeupdate`, `loadedmetadata`, `ended`, and `error`.

The visualizer creates one `AudioContext`, attaches an `AnalyserNode` to the audio element through `createMediaElementSource()`, and renders 34 frequency bars to a canvas. It calculates overall intensity and bass rise, then feeds CSS custom properties to make artwork and mini-player edges react to music. Work stops on pause/end, respects `prefers-reduced-motion`, and renders at the browser animation cadence.

### Queue, playlists, favourites, sorting, and search

- The active playback source can be all songs, favourites, or one named playlist.
- Shuffle uses an in-place Fisher–Yates shuffle of the active paths while keeping the current song first.
- Repeat states are mutually exclusive: off, repeat all, or repeat one.
- Favourites are stored as a set of local file paths.
- Playlist rows support reordering through drag/drop, with the saved order kept per selected music folder.
- Music can be sorted manually, by title, or by date added.
- Search accepts normal words, quoted phrases, exclusions (for example `-live`), and field prefixes such as `artist:`, `album:`, `genre:`, `year:`, `composer:`, and `lyrics:`.
- Search normalises Unicode accents and ranks exact, prefix, substring, and small typo matches using a bounded Damerau–Levenshtein distance calculation.

### Music keyboard controls

Outside text-entry controls, dialogs, modified-key combinations, and mini-mode restrictions where relevant:

| Key | Action |
|---|---|
| Space | Play/pause |
| Left / Right | Previous / next track |
| Up / Down | Volume ±2% |
| H | Home |
| S | Open music search |
| M | Mute/unmute |
| F | Switch Home/full-player entry |
| I | Toggle normal/mini player when the full player is open |

## 6. MyCinema implementation

### Library view and thumbnail method

The user can add multiple video folders. The renderer stores their paths locally, asks the main process to scan each one recursively, de-duplicates paths case-insensitively, and groups results by folder into shelves. Search currently matches a video title or folder path.

Cards initially show a generated placeholder. When a card approaches the visible grid, an `IntersectionObserver` queues poster generation. A hidden muted browser `<video>` seeks to approximately 12% of a film (capped at 30 seconds), draws a cropped 16:9 frame to a Canvas, and saves it as an in-memory JPEG data URL. Generation has a 10-second timeout, runs only two jobs at a time, and uses a 64-item LRU-like cache. These posters are not written to disk.

### Dedicated MPV playback window

Clicking a video card calls the main process to validate the file and create/reuse `video-player.html` in a separate window. It is attached to an `electron-mpv-video` MPV session. The renderer uses the package’s exposed custom video API to:

- Open the local path and receive `mpv-state` and `mpv-error` events.
- Play/pause, seek exactly or relatively, query current position/duration, and update a 0–1000 timeline.
- Set volume from 0–100%, or 0–200% after the explicitly confirmed preference is enabled.
- Detect the source aspect ratio and ask the main process to resize the window within safe bounds.
- Select or cycle embedded audio and subtitle tracks.
- Apply persisted subtitle position and text-size settings through MPV.
- Request native Windows full-screen/kiosk mode and receive full-screen state updates.

Video resume data is written only after 10 seconds of playback and is removed near the end of a title (last 10 seconds). On reopening a resumable file, the UI displays a **Continue** prompt. If it is not chosen, normal playback starts after five seconds; the saved point is otherwise restored by the prompt action.

### Cinema keyboard controls

| Key | Action |
|---|---|
| Space | Play/pause |
| Left / Right | Seek 10 seconds |
| Ctrl+Left / Ctrl+Right | Seek 30 seconds |
| Alt+Left / Alt+Right | Seek 60 seconds |
| 0–9 | Seek to 0–90% |
| Up / Down | Volume ±5% |
| M | Mute/unmute |
| V / B | Cycle subtitle / audio track |
| F | Toggle full screen |
| I or Escape | Exit full screen |

## 7. Process boundaries and IPC

Electron runs the UI in renderer processes and operating-system access in the main process. `contextIsolation` is enabled and Node integration is disabled. The preload script exposes only a small, named `window.player` capability surface instead of exposing raw Electron APIs to the page.

| Capability group | Preload-to-main calls |
|---|---|
| Music | choose/scan folder, read full track metadata, read search metadata, query/set mini mode |
| Cinema library | choose/scan video folders, convert a validated path to a file URL, open a video window |
| Cinema playback | get/save video resume, set aspect, set full screen, get/set volume boost, receive video/full-screen notifications |
| Windows integration | open Windows Default Apps settings, minimise, close, change app-mode window bounds |

The main process does not blindly trust an IPC request. Important handlers check the sender is the expected main/video window, confirm the value type, verify absolute paths and expected extensions, limit titles and numeric values, and verify the selected target is a real file before opening it. This is particularly relevant for video opening, resume persistence, aspect changes, full screen, and settings changes.

The renderer itself has a restrictive Content Security Policy: resources are local (`'self'`), scripts are local, images are local/data URLs, and media is local/data/blob URLs. It permits inline styles for the designed UI. The Electron window uses `sandbox: false`, so the isolation/preload boundary remains important and is worth retaining in future changes.

## 8. Local persistence

| Store | Data |
|---|---|
| MyMusic renderer `localStorage` | Music folder, last track and time, volume/mute, shuffle/repeat, favourites, playlists, manual ordering/date-added information, sorting choice, visual preferences. |
| MyCinema renderer `localStorage` | Video folder list and subtitle settings (position and size). |
| Electron `userData/mycinema-resume.json` | Per-video resume position and duration. |
| Electron `userData/mycinema-settings.json` | Whether volume boost above 100% is permitted. |
| Electron `userData/stability.log` | Local line-delimited JSON diagnostics; retained up to roughly 2 MiB before it is cleared. |
| Electron crash-dump directory | Local Electron crash reports; `uploadToServer` is explicitly false. |

The saved music position is written at most once every three seconds during playback, plus pause/page hide events. A saved music track is reopened with `autoplay = false`, then its position is applied after `loadedmetadata`; therefore reopening the music app restores the selected song and position without automatically beginning playback.

## 9. Windowing, platform integration, and packaging

- Main windows are transparent and frameless with app-owned title-bar controls. CSS drag regions provide the movable header behaviour.
- Both normal windows suppress the native Windows shadow (`hasShadow: false`); the visual shell is defined by CSS rather than the OS frame.
- MyMusic mini mode changes bounds, disables resize/maximise, sets always-on-top, centres it near the top of the active display, and validates the final size.
- MyCinema uses a main library window plus a reusable separate playback window. The playback window is attached/detached from MPV carefully before it closes.
- When packaged on Windows, MyMusic/MyCinema can direct the user to the Default Apps settings page for audio/video associations.
- The installer uses NSIS, allows choosing the install directory, is per-user rather than per-machine, and includes custom registration logic for the two app identities/file associations. It does not request default desktop or Start-menu shortcuts from the standard Electron Builder options; its NSIS include controls the registration behaviour.
- `npm run dist` builds the native MPV addon before creating the Windows installer. The addon release binary is unpacked from ASAR so it remains loadable at runtime. Bundled libmpv/FFmpeg licensing is documented in `THIRD_PARTY_NOTICES.md`.

## 10. Reliability, performance, and notable limits

### Implemented safeguards

- Directory scans use asynchronous filesystem APIs and tolerate unreadable directories.
- Lazy metadata/artwork/poster loading avoids eagerly decoding every media item.
- Poster generation is capped to two concurrent jobs; poster cache size is capped at 64.
- Search indexing uses at most three concurrent metadata requests.
- Window/full-screen/video-resume operations validate their inputs and caller.
- MPV cleanup blocks window close until the MPV window is detached.
- Video progress UI is throttled; MPV event updates are limited to a 250 ms UI cadence and a 500 ms fallback poll.
- Crashes are logged locally and the music renderer makes one guarded recovery reload after a non-clean renderer crash.

### Practical constraints

- The library is folder-based; it does not keep a database index, synchronize across devices, download media, or manage streaming subscriptions.
- Audio decoder support follows the Chromium/Electron browser stack, whereas video support depends on the bundled MPV/FFmpeg build and the actual codecs in a file. A familiar container extension alone cannot guarantee decoding.
- Video posters depend on the browser `<video>` element being able to decode a frame, independently of MPV. A video may play through MPV yet use the fallback card artwork if Chromium cannot make its thumbnail.
- LocalStorage/JSON storage is straightforward and portable but does not offer database transactions, migrations, or concurrent multi-process conflict resolution.
- The codebase is currently organised around a few large renderer files (`renderer.js`, `cinema.js`, `video-player.js`) rather than separate component modules. The project graph identifies `playTrack()`, DOM lookup helper `$()`, folder selection/scanning, error reporting, and queue rendering as the most connected implementation points.

## 11. Source map

| File | Purpose |
|---|---|
| `package.json` | Dependencies, development commands, Electron Builder/NSIS packaging configuration. |
| `src/main.cjs` | Electron lifecycle, windows, folder scanning, metadata, IPC validation, MPV attachment, logs, settings, resume files. |
| `src/preload.cjs` | Context-isolated `window.player` IPC bridge and MPV preload exposure. |
| `src/index.html` | Shared MyMusic/MyCinema DOM shell and embedded accessibility structure. |
| `src/renderer.js` | MyMusic state, playback, queue, search, playlists, visualizer, keyboard and DOM event logic. |
| `src/cinema.js` | MyCinema folder library, video shelves, poster generation, settings and cinema UI interactions. |
| `src/video-player.html` / `src/video-player.js` | Separate MPV video-player DOM, controls, tracks, subtitles, resume, full screen and keyboard logic. |
| `src/styles.css` / `src/video-player.css` | Liquid-glass layout, animation, state styling, responsive/reduced-motion rules. |
| `src/scroll-fade.js` | Observer-based scroll-edge visual affordance. |
| `scripts/ensure-mpv.cjs` / `scripts/patch-mpv-tracks.cjs` | Native MPV build preparation and package patching for the exposed player capabilities. |
| `scripts/register-default-apps.nsh` | NSIS registration/default-app integration. |

## 12. Conclusion

MyPlayer is a deliberately local, desktop-first dual media player. Electron provides the Windows application shell and safe main/renderer separation; MyMusic relies on the standard browser media stack enriched by metadata parsing and Web Audio visualisation; MyCinema delegates robust video decoding and track control to a bundled MPV/FFmpeg native layer. The UI is a direct, accessible DOM implementation with local persistence, deliberate lazy-loading techniques, and no backend dependency.
