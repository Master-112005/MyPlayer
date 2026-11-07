# MyPlayer

MyPlayer installs two separate apps: **MyMusic** and **MyCinema**. The installer creates separate Start menu and desktop shortcuts, and each shortcut opens directly into its app. MyCinema scans a chosen folder and shows videos as widescreen cards. The music library and playback features remain in MyMusic.

MyCinemaPlayer uses libmpv with FFmpeg for broad video and audio codec support, including common MP4/MOV, MKV/WebM, AVI, MPEG, FLV and Ogg containers. Container support is not a promise that every codec or every damaged, encrypted, or proprietary file will decode. There is no player that can guarantee support for every file called one of “2,000 formats.”

## Run from source

1. Install Node.js 22 or newer and Visual Studio Build Tools with the C++ workload.
2. Install dependencies with `npm install`.
3. Install the Windows x64 libmpv development files from the [MPV Windows builds](https://mpv.io/installation/) page under `%USERPROFILE%\libmpv`, with headers in `include\mpv`, the DLL in `bin`, and an MSVC import library at `lib\mpv.lib`.
4. From an x64 Visual Studio developer command prompt, create the import library with `powershell -ExecutionPolicy Bypass -File .\node_modules\electron-mpv-video\scripts\create-libmpv-import-lib.ps1`, then run `npm run build:mpv`. If the addon is missing, `npm run start:cinema` builds it automatically before launching.
5. Run `npm start` for MyMusic or `npm run start:cinema` for MyCinema.

## Build the Windows installer

Run `npm run dist`. The command builds the native MPV addon first, then writes the single installer under `dist/` for both apps.

The bundled MPV/FFmpeg build has separate third-party licensing terms; see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

## Source layout

- `src/MyMusic/` contains `music.html` and `music.js` for the MyMusic home page and library/player logic.
- `src/MyCinema/` contains `cinema.html` and the MyCinema library; `src/MyCinema/CinemaPlayer/` contains the separate `CinemaPlayer.html`, `.js`, and `.css` window and controls.
- `src/utilities/` contains the shared Electron main process and preload, shared home styling, startup mode selection, and scroll-fade behavior.
