// Renders the landing page's film, both cuts with sound, into public/film/.
//
//   npm run film            (or: node film/render.mjs [--out=<dir>])
//
// macOS only: frames come from Google Chrome, the sound from Python with numpy
// and scipy (`pip install numpy scipy`; set PYTHON to use a particular one), and
// the MP4s from AVFoundation through Swift. Scratch files go to the temp dir.

import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = (path) => fileURLToPath(new URL(path, import.meta.url));
const hit = process.argv.find((a) => a.startsWith('--out='));
const OUT = resolve(hit ? hit.slice(6) : here('../public/film/'));
const WORK = join(tmpdir(), 'hudjee-film');
const PYTHON = process.env.PYTHON || 'python3';
const CUTS = [
  { name: '16x9', w: 1920, h: 1080, bitrate: 2_200_000 },
  { name: '4x5', w: 1080, h: 1350, bitrate: 1_900_000 },
];

function run(cmd, args, options = {}) {
  console.log(`\n$ ${[cmd, ...args].join(' ')}`);
  const result = spawnSync(cmd, args, { stdio: 'inherit', ...options });
  if (result.status !== 0) {
    console.error(`\n${cmd} failed`);
    process.exit(result.status ?? 1);
  }
}

mkdirSync(WORK, { recursive: true });
mkdirSync(OUT, { recursive: true });
run(PYTHON, [here('./sfx.py')], { cwd: WORK });
run('swiftc', ['-O', here('./encode.swift'), '-o', join(WORK, 'encode')]);
for (const cut of CUTS) {
  const frames = join(WORK, `frames-${cut.w}x${cut.h}`);
  run(process.execPath, [here('./capture.mjs'), `--w=${cut.w}`, `--h=${cut.h}`, `--out=${frames}`]);
  run(join(WORK, 'encode'), [frames, join(OUT, `hudjee-film-${cut.name}.mp4`), '30', String(cut.bitrate), join(WORK, 'sfx.wav')]);
  copyFileSync(join(WORK, `poster-${cut.w}x${cut.h}.jpg`), join(OUT, `poster-${cut.name}.jpg`));
}
console.log(`\nFilm written to ${OUT}`);
