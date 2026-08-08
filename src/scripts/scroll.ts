/**
 * ────────────────────────────────────────────────────────────────
 *  Scroll engine — one requestAnimationFrame loop, no libraries.
 *
 *  Elements register a track with a progress function. Offsets are
 *  cached on resize; each frame only computes progress and writes
 *  transforms, so there is no layout thrash in the loop.
 *
 *  Progress modes:
 *    'through'   — sticky/pinned section. 0 at section top,
 *                  1 when its last screen is reached.
 *    'from-top'  — 0 at element top, 1 one viewport later.
 *    'enter'     — ramps as the element crosses into view.
 * ────────────────────────────────────────────────────────────────
 */

const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

type Mode = 'through' | 'from-top' | 'enter';
interface Track { el: HTMLElement; fn: (p: number) => void; mode: Mode; top: number; h: number; }

export function initScroll() {
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ── Always-on, motion-independent behaviour ─────────────────── */
  initReveals();
  initSplitText();
  initCounters();
  initFaq();

  if (reduce) return;

  /* ── Motion ──────────────────────────────────────────────────── */
  const tracks: Track[] = [];
  const track = (el: HTMLElement | null, fn: (p: number) => void, mode: Mode = 'through') => {
    if (el) tracks.push({ el, fn, mode, top: 0, h: 0 });
  };

  let vh = window.innerHeight;
  let vw = window.innerWidth;
  let sy = window.scrollY;
  let smooth = sy;
  let docH = 1;

  const $ = <T extends HTMLElement>(sel: string) => document.querySelector<T>(sel);
  const $$ = <T extends HTMLElement>(sel: string) => Array.from(document.querySelectorAll<T>(sel));

  const heroInner = $('#hero-inner');
  const hero = $('#hero');
  const device = $('#device');
  const stage = $('#stage');
  const clockSec = $('#clock');
  const clockTime = $('#clock-time');
  const streakSec = $('#streak');
  const streakGrid = $('#streak-grid');
  const featSec = $('#feat');
  const ftrack = $('#ftrack');
  const fbar = $('#fbar');
  const prog = $('#prog');
  const glow = $('#glow');
  const nav = $('header.nav');
  const factors = $('#factors');
  const ring = document.querySelector<SVGCircleElement>('#ring');
  const scoreNum = $('#score-num');

  const caps = $$('.cap');
  const views = $$('.scr-view');
  const huds = $$('.hud');
  const steps = $$('.step');

  /* — HERO: rise + fade, and the formulas write themselves in.
       Each formula is revealed by widening its clipPath rect, which
       reads as left-to-right handwriting. No blur — it was the most
       expensive paint on the page. — */
  if (hero && heroInner) {
    const formulas = $$<HTMLElement>('.formula').map((el) => ({
      el,
      at: parseFloat(el.dataset.at || '0'),
      rect: el.querySelector('clipPath rect') as SVGRectElement | null,
      // viewBox is 620 wide; overshoot so the last glyph fully clears.
      w: 640,
    }));

    track(hero, (p) => {
      const e = clamp(p, 0, 1);
      heroInner.style.transform = `translateY(${-e * 90}px)`;
      heroInner.style.opacity = String(clamp(1 - e * 1.6, 0, 1));

      for (const f of formulas) {
        // Each starts at its own scroll offset and takes 45% to write.
        const local = clamp((e - f.at) / 0.45, 0, 1);
        if (f.rect) f.rect.setAttribute('width', String(local * f.w));
        // Fade out again as the hero leaves, so they never collide
        // with the section below.
        f.el.style.opacity = String(clamp(1 - Math.max(0, e - 0.55) * 3, 0, 1) * 0.75);
      }
    }, 'from-top');
  }

  /* — STAGE: device zooms from far to full through four chapters — */
  if (stage && device) {
    track(stage, (p) => {
      const e = clamp(p, 0, 1);
      // Never let the device exceed ~66% of the viewport, so the
      // caption above it always stays clear on short screens.
      const full = clamp((vh * 0.66) / (device.offsetHeight || 600), 0.5, 1.06);
      const z = e < 0.45
        ? lerp(full * 0.32, full, ease(e / 0.45))
        : lerp(full, full * 1.06, (e - 0.45) / 0.55);
      const rotY = lerp(22, 0, clamp(e / 0.5, 0, 1));
      const rotX = lerp(10, 0, clamp(e / 0.5, 0, 1));
      const yOff = lerp(90, 52, e);
      device.style.transform =
        `perspective(1500px) translate3d(0,${yOff}px,0) rotateY(${rotY}deg) rotateX(${rotX}deg) scale(${z})`;

      const seg = clamp(Math.floor(e / 0.245), 0, 3);
      caps.forEach((c, i) => c.classList.toggle('on', i === seg));
      views.forEach((v, i) => v.classList.toggle('on', i === seg));

      // HUD chips fly in from alternating sides as the device lands.
      const hp = clamp((e - 0.3) / 0.28, 0, 1);
      huds.forEach((h, i) => {
        const dir = i % 2 === 0 ? -1 : 1;
        h.style.opacity = String(hp * (seg >= 1 ? 1 : hp));
        h.style.transform =
          `translate3d(${dir * (1 - hp) * 140}px,${(1 - hp) * 30}px,0) scale(${lerp(0.8, 1, hp)})`;
      });

      // Gauge + counter scrub with scroll — reverse and the score counts down.
      // Readiness Score ring: r=39 → circumference ≈ 245. Target 78/100.
      const gp = clamp((e - 0.76) / 0.2, 0, 1);
      if (ring) ring.style.strokeDashoffset = String(245 * (1 - 0.78 * gp));
      if (scoreNum) scoreNum.textContent = String(Math.round(78 * gp));
    });
  }

  /* — CLOCK: scroll scrubs 4:44 → 5:00.
       0.00–0.30  phase 0, the dial fills
       0.30–0.62  phase 1, the seven factors compute
       0.62–1.00  phase 2, the score snaps in — */
  if (clockSec && clockTime) {
    const phases = $$('.phase');
    const efs = $$('.ef');
    const efBars = efs.map((x) => x.querySelector('i') as HTMLElement);
    const engine = $('#engine');
    const result = $('#result');
    const dial = document.querySelector<SVGCircleElement>('#dial-arc');
    const clockScore = $('#clock-score');
    let lastStamp = '';

    // 4:44 → 5:00 is 16 minutes.
    const START = 4 * 60 + 44;
    const END = 5 * 60;

    track(clockSec, (p) => {
      const e = clamp(p, 0, 1);

      const mins = Math.round(lerp(START, END, ease(e)));
      const stamp = `${Math.floor(mins / 60)}:${String(mins % 60).padStart(2, '0')}`;
      if (stamp !== lastStamp) { clockTime.textContent = stamp; lastStamp = stamp; }
      if (dial) dial.style.strokeDashoffset = String(704 * (1 - e));

      const phase = e < 0.3 ? 0 : e < 0.62 ? 1 : 2;
      phases.forEach((el, i) => el.classList.toggle('on', i === phase));
      engine?.classList.toggle('on', phase === 1);
      result?.classList.toggle('on', phase === 2);

      // Factors fill in sequence across phase 1.
      const ep = clamp((e - 0.3) / 0.32, 0, 1);
      efBars.forEach((bar, i) => {
        if (!bar) return;
        const d = clamp((ep - i * 0.09) * 3.2, 0, 1);
        bar.style.width = `${parseFloat(efs[i].dataset.fill || '0') * d}%`;
      });

      // Score counts up through phase 2.
      const sp = clamp((e - 0.62) / 0.24, 0, 1);
      if (clockScore) clockScore.textContent = String(Math.round(78 * sp));
    });
  }

  /* — STREAK: scrolling advances a calendar. One missed day burns the
       run and resets the counter, which is the entire point. — */
  if (streakSec && streakGrid) {
    const squares = Array.from(streakGrid.querySelectorAll<HTMLElement>('.d'));
    const total = squares.length;
    const missIdx = squares.findIndex((d) => d.classList.contains('miss'));
    const countEl = $('#streak-count');
    const scoreEl = $('#streak-score');
    const noteEl = $('#streak-note');
    let lastFilled = -1;

    track(streakSec, (p) => {
      // Hold at the start and end so the copy is readable either side.
      const e = clamp((clamp(p, 0, 1) - 0.14) / 0.72, 0, 1);
      const filled = Math.round(e * total);
      if (filled === lastFilled) return;

      // Only touch the squares that actually changed.
      const lo = Math.min(filled, lastFilled < 0 ? 0 : lastFilled);
      const hi = Math.max(filled, lastFilled);
      for (let i = Math.max(0, lo - 1); i <= Math.min(total - 1, hi); i++) {
        const on = i < filled;
        const isMiss = i === missIdx;
        squares[i].classList.toggle('on', on && !isMiss);
        squares[i].classList.toggle('burn', on && isMiss);
      }
      lastFilled = filled;

      // Streak restarts after the missed day.
      const run = filled > missIdx ? filled - missIdx - 1 : filled;
      if (countEl) countEl.textContent = String(run);
      if (scoreEl) scoreEl.textContent = String(Math.round((run / (total - missIdx - 1)) * 78));
      noteEl?.classList.toggle('on', filled > missIdx && filled < missIdx + 6);
      if (noteEl && filled > missIdx && filled < missIdx + 6) {
        noteEl.textContent = noteEl.dataset.label || '';
      }
    });
  }

  /* — FEATURES: vertical scroll drives a horizontal track — */
  if (featSec && ftrack && fbar) {
    track(featSec, (p) => {
      const e = clamp(p, 0, 1);
      const maxX = Math.max(0, ftrack.scrollWidth - vw + 40);
      ftrack.style.transform = `translate3d(${-e * maxX}px,0,0)`;
      fbar.style.width = `${e * 100}%`;
    });
  }

  /* — SCORE: factor bars fill on scroll — */
  if (factors) {
    const bars = Array.from(factors.querySelectorAll<HTMLElement>('i[data-w]'));
    track(factors, (p) => {
      const e = clamp(p * 1.6, 0, 1);
      bars.forEach((bar, i) => {
        const d = clamp((e - i * 0.05) * 1.5, 0, 1);
        bar.style.width = `${parseFloat(bar.dataset.w || '0') * d}%`;
      });
    }, 'enter');
  }

  const progressFor = (t: Track) => {
    if (t.mode === 'from-top') return (smooth - t.top) / vh;
    if (t.mode === 'enter') return (smooth + vh - t.top) / (t.h + vh * 0.6);
    return (smooth - t.top) / Math.max(1, t.h - vh);
  };

  /* — Cursor glow — */
  let gx = vw / 2, gy = vh / 2, tx = gx, ty = gy;
  if (window.matchMedia('(pointer:fine)').matches) {
    window.addEventListener('mousemove', (e) => { tx = e.clientX; ty = e.clientY; }, { passive: true });
  } else if (glow) {
    glow.style.opacity = '.6';
  }

  const measure = () => {
    const s = window.scrollY;
    for (const t of tracks) {
      const r = t.el.getBoundingClientRect();
      t.top = r.top + s;
      t.h = r.height;
    }
  };
  const onResize = () => {
    vh = window.innerHeight;
    vw = window.innerWidth;
    measure();
    docH = Math.max(1, document.documentElement.scrollHeight - vh);
  };

  const frame = () => {
    sy = window.scrollY;
    smooth = lerp(smooth, sy, 0.16);
    if (Math.abs(smooth - sy) < 0.3) smooth = sy;

    if (prog) prog.style.transform = `scaleX(${clamp(sy / docH, 0, 1)})`;
    if (nav) nav.classList.toggle('stuck', sy > 60);

    gx = lerp(gx, tx, 0.09);
    gy = lerp(gy, ty, 0.09);
    if (glow) glow.style.transform = `translate3d(${gx}px,${gy}px,0)`;

    for (const t of tracks) {
      // Skip anything comfortably off-screen.
      if (smooth + vh * 1.4 < t.top || smooth - vh * 0.6 > t.top + t.h) continue;
      t.fn(progressFor(t));
    }

    steps.forEach((s, i) => {
      const r = s.getBoundingClientRect();
      if (r.top < vh && r.bottom > 0) {
        const q = (vh - r.top) / (vh + r.height);
        s.style.transform = `translateY(${(0.5 - q) * 26 * (1 + i * 0.25)}px)`;
      }
    });

    requestAnimationFrame(frame);
  };

  window.addEventListener('resize', onResize, { passive: true });
  window.addEventListener('load', onResize);
  onResize();
  requestAnimationFrame(frame);
}

/* ── Reveal on scroll ─────────────────────────────────────────── */
function initReveals() {
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (e.isIntersecting) {
        e.target.classList.add('in');
        io.unobserve(e.target);
      }
    }
  }, { threshold: 0.18, rootMargin: '0px 0px -8% 0px' });

  document.querySelectorAll('.rv, .split').forEach((el) => {
    if (el.closest('#hero')) return; // hero reveals fire after the preloader
    io.observe(el);
  });
}

/* ── Split headings into per-word animated spans ──────────────── */
function initSplitText() {
  document.querySelectorAll<HTMLElement>('[data-split]').forEach((el) => {
    el.classList.add('split');
    const walk = (node: Node) => {
      Array.from(node.childNodes).forEach((n) => {
        if (n.nodeType === Node.TEXT_NODE) {
          const frag = document.createDocumentFragment();
          (n.textContent || '').split(/(\s+)/).forEach((tok) => {
            if (!tok.trim()) { frag.appendChild(document.createTextNode(tok)); return; }
            const w = document.createElement('span');
            w.className = 'w';
            const i = document.createElement('i');
            i.textContent = tok;
            w.appendChild(i);
            frag.appendChild(w);
          });
          node.replaceChild(frag, n);
        } else if (n.nodeType === Node.ELEMENT_NODE && !(n as HTMLElement).classList.contains('w')) {
          walk(n);
        }
      });
    };
    walk(el);
    let d = 0;
    el.querySelectorAll<HTMLElement>('.w > i').forEach((i) => {
      i.style.transitionDelay = `${(d += 0.035).toFixed(3)}s`;
    });
  });
}

/* ── Number counters ──────────────────────────────────────────── */
function initCounters() {
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      const el = e.target as HTMLElement;
      const target = parseInt(el.dataset.count || '0', 10);
      const pre = el.dataset.prefix || '';
      const suf = el.dataset.suffix || '';
      let t0: number | null = null;
      const dur = 1200;
      const step = (ts: number) => {
        if (t0 === null) t0 = ts;
        const p = Math.min((ts - t0) / dur, 1);
        const v = Math.round(target * (1 - Math.pow(1 - p, 3)));
        el.textContent = pre + v.toLocaleString('en-IN') + suf;
        if (p < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
      io.unobserve(el);
    }
  }, { threshold: 0.5 });
  document.querySelectorAll('[data-count]').forEach((el) => io.observe(el));
}

/* ── FAQ accordion ────────────────────────────────────────────── */
function initFaq() {
  document.querySelectorAll<HTMLButtonElement>('.q button').forEach((b) => {
    b.addEventListener('click', () => {
      const q = b.parentElement as HTMLElement;
      const a = q.querySelector<HTMLElement>('.a')!;
      const was = q.classList.contains('open');
      document.querySelectorAll<HTMLElement>('.q.open').forEach((o) => {
        o.classList.remove('open');
        o.querySelector<HTMLElement>('.a')!.style.maxHeight = '';
        o.querySelector('button')!.setAttribute('aria-expanded', 'false');
      });
      if (!was) {
        q.classList.add('open');
        a.style.maxHeight = `${a.scrollHeight}px`;
        b.setAttribute('aria-expanded', 'true');
      }
    });
  });
}
