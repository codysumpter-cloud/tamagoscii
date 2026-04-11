# Music folder

Drop your audio files (`.mp3`, `.ogg`, `.wav`, `.m4a`, `.flac`) in this folder.

## How to register tracks

Edit [`tracks.json`](./tracks.json) and add one entry per file:

```json
[
  { "title": "Neon Dreams",    "file": "neon-dreams.mp3" },
  { "title": "Pixel Sunset",   "file": "pixel-sunset.mp3" },
  { "title": "Chiptune Walk",  "file": "chiptune-walk.ogg" }
]
```

The app will automatically fetch `tracks.json` on startup and list the tracks
in the bottom-bar music player (⏮ ▶ ⏭ controls). Users can also upload their
own local files at runtime via the `♪+` button.

## Tips

- Keep filenames URL-safe (no spaces — prefer `-` or `_`).
- Prefer `.ogg` or `.mp3` for the best cross-browser compatibility.
- Files are streamed directly; no transcoding is done.
- If `tracks.json` is empty or missing, only the upload button will be available.

## Rights

Only add music you have the rights to use. Tamagoscii does not bundle any
copyrighted tracks.
