# The landing page's film

`film.html` is the film: a 42-second animation written as a web page. Nothing in
it moves on its own. `FILM.seek(t)` draws the frame for time `t`, so every frame
renders exactly, whatever the machine.

## Render it

    npm run film

This writes both cuts (16:9 and 4:5) with sound, and a poster for each, into
`public/film/`. It takes about five minutes and needs, all on macOS:

- **Google Chrome** draws the frames (`capture.mjs`, over the DevTools protocol).
- **Python with numpy and scipy** synthesises the sound effects (`sfx.py`).
  `pip install numpy scipy`, or set `PYTHON` to an interpreter that has them.
- **Swift** (the Xcode command line tools) encodes H.264 and AAC through
  AVFoundation (`encode.swift`), with the index at the front of the file so the
  page can start playing before the download finishes.

To check a change without a full render, take a few stills:

    node film/capture.mjs --w=1920 --h=1080 --times=2.4,13.6,27,35.5

They land in a `hudjee-film` folder in the temp directory. Use `--w=1080 --h=1350` for the phone cut.

## Changing it

The timeline is the set of times in `film.html`'s script: the `STATUS` lines
that drive the HudJee pill, the `TAPS` list, and each scene's `draw…` function.
`sfx.py` places every sound on those same times, so move a moment in one and move
it in the other.
