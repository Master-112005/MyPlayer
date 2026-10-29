# MyMusicPlayer

A Windows music player with a black and white, Apple inspired Liquid Glass interface. The main window opens at 350 x 600; the circular artwork button switches to a 440 x 140 horizontal mini player. Features include local music folders, search, drag-to-reorder library, embedded cover art, shuffle, favorites, seek, and volume. Music stays in its existing folders.

## Run the app

1. Install Node.js 20 or newer.
2. Open PowerShell in the project folder (or run `Set-Location "$env:USERPROFILE\Desktop\MyMusicPlayer"`).
3. Run `npm install` once.
4. Run `npm start` to launch the app.

## Generate the Windows executable

From the project folder, run `npm run dist`. The x64 Windows installer will be created at `dist/MyMusicPlayer-Setup-1.0.0.exe`.

Supported file extensions are MP3, M4A, AAC, WAV, FLAC, OGG, Opus, WMA and AIFF. Playback depends on codecs included with Electron/Chromium; WMA may not decode on every system.
