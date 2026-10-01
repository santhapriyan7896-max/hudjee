// Renders film.html frame by frame in headless Chrome over the DevTools
// protocol: seek to each frame's time, wait for paint, screenshot.
//
//   node capture.mjs --w=1920 --h=1080 --out=<dir>       every frame as JPEG, and a poster beside <dir>
//   node capture.mjs --w=1920 --h=1080 --times=2,13.6    a few PNG stills
//
// Montserrat comes from film/fonts (OFL, see OFL.txt) and is written into the
// page, so a render never waits on the network for it. Output defaults to a folder in the temp dir.

import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

const here = (path) => fileURLToPath(new URL(path, import.meta.url));
const arg = (name, fallback) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};
const W = Number(arg('w', 1920));
const H = Number(arg('h', 1080));
const FPS = Number(arg('fps', 30));
const TIMES = arg('times', '');
const POSTER_AT = 13.6; // the first answer marked right, with the session chart beside it
const OUT = resolve(arg('out', join(tmpdir(), 'hudjee-film', `${TIMES ? 'stills' : 'frames'}-${W}x${H}`)));

// the page, with its fonts filled in
const fonts = { M400: '400Regular', M500: '500Medium', M600: '600SemiBold', M700: '700Bold' };
let html = readFileSync(here('./film.html'), 'utf8');
for (const [key, weight] of Object.entries(fonts)) {
  const ttf = readFileSync(here(`./fonts/Montserrat_${weight}.ttf`));
  html = html.replace(`{{${key}}}`, `data:font/ttf;base64,${ttf.toString('base64')}`);
}
writeFileSync(here('./.render.html'), html);

const profile = here(`./.chrome-${process.pid}/`);
const port = 9400 + (process.pid % 400);
const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
  '--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`,
  '--hide-scrollbars', '--force-device-scale-factor=1', `--window-size=${W},${H}`,
  '--no-first-run', '--no-default-browser-check', '--mute-audio', 'about:blank',
], { stdio: 'ignore' });

let target;
for (let i = 0; i < 100 && !target; i++) {
  await sleep(150);
  try {
    const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
    target = list.find((t) => t.type === 'page');
  } catch { /* not up yet */ }
}
if (!target) throw new Error('Chrome did not start');

const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((ok, fail) => { ws.onopen = ok; ws.onerror = fail; });
let seq = 0;
const pending = new Map();
const listeners = new Set();
ws.onmessage = (event) => {
  const msg = JSON.parse(event.data);
  if (msg.id && pending.has(msg.id)) {
    const { ok, fail } = pending.get(msg.id);
    pending.delete(msg.id);
    msg.error ? fail(new Error(msg.error.message)) : ok(msg.result);
  } else if (msg.method) {
    listeners.forEach((fn) => fn(msg));
  }
};
const send = (method, params = {}) => new Promise((ok, fail) => {
  const id = ++seq;
  pending.set(id, { ok, fail });
  ws.send(JSON.stringify({ id, method, params }));
});
const once = (method) => new Promise((ok) => {
  const fn = (msg) => { if (msg.method === method) { listeners.delete(fn); ok(msg.params); } };
  listeners.add(fn);
});
listeners.add((msg) => {
  if (msg.method === 'Runtime.exceptionThrown') console.error('page error:', msg.params.exceptionDetails.exception?.description || msg.params.exceptionDetails.text);
});
const shoot = (format, quality) => send('Page.captureScreenshot', {
  format, ...(quality ? { quality, optimizeForSpeed: true } : {}), clip: { x: 0, y: 0, width: W, height: H, scale: 1 },
});
const seek = async (t) => {
  const r = await send('Runtime.evaluate', {
    expression: `FILM.seek(${t}); new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))`,
    awaitPromise: true,
  });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || `seek(${t}) failed`);
};

try {
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });
  const loaded = once('Page.loadEventFired');
  await send('Page.navigate', { url: new URL(`./.render.html?w=${W}&h=${H}`, import.meta.url).href });
  await loaded;
  const ready = await send('Runtime.evaluate', { expression: 'window.FILM.ready', awaitPromise: true, returnByValue: true });
  if (ready.exceptionDetails) throw new Error(ready.exceptionDetails.exception?.description || 'FILM.ready failed');
  const times = TIMES ? TIMES.split(',').map(Number) : Array.from({ length: Math.round(ready.result.value.duration * FPS) }, (_, i) => i / FPS);

  rmSync(OUT, { recursive: true, force: true });
  mkdirSync(OUT, { recursive: true });
  const started = Date.now();
  for (let i = 0; i < times.length; i++) {
    await seek(times[i]);
    const shot = TIMES ? await shoot('png') : await shoot('jpeg', 95);
    const name = TIMES ? `t${times[i].toFixed(2).padStart(5, '0')}.png` : `${String(i).padStart(5, '0')}.jpg`;
    writeFileSync(join(OUT, name), Buffer.from(shot.data, 'base64'));
    if (!TIMES && i % 150 === 0) console.log(`frame ${i}/${times.length} (${((Date.now() - started) / 1000).toFixed(0)}s)`);
  }
  if (!TIMES) {
    // beside the frames, not among them: the encoder takes every .jpg in the folder
    await seek(POSTER_AT);
    writeFileSync(join(dirname(OUT), `poster-${W}x${H}.jpg`), Buffer.from((await shoot('jpeg', 82)).data, 'base64'));
  }
  console.log(`${times.length} image(s) in ${OUT} after ${((Date.now() - started) / 1000).toFixed(0)}s`);
} finally {
  ws.close();
  chrome.kill();
  await sleep(300);
  rmSync(profile, { recursive: true, force: true });
  rmSync(here('./.render.html'), { force: true });
}
