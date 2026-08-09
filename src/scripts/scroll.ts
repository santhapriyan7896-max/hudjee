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

import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { SplitText } from 'gsap/SplitText';

gsap.registerPlugin(ScrollTrigger, SplitText);

/* Cold grey → cream in 48 steps, shared by the ribbon and the explainer.
   Assembling an rgb() string per element per frame is the one thing in
   those loops that would actually cost us something. */
const INK_RAMP: string[] = [];
for (let k = 0; k <= 48; k++) {
  const e = k / 48;
  INK_RAMP.push(
    `rgb(${Math.round(74 + 170 * e)},${Math.round(73 + 166 * e)},${Math.round(82 + 144 * e)})`,
  );
}
const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const smooth = (p: number) => p * p * (3 - 2 * p);

export function initScroll() {
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ── Always-on, motion-independent behaviour ─────────────────── */
  initReveals();
  initCounters();
  initFaq();

  if (reduce) return;

  const $ = <T extends HTMLElement>(sel: string) => document.querySelector<T>(sel);
  const $$ = <T extends HTMLElement>(sel: string) => Array.from(document.querySelectorAll<T>(sel));

  const nav = $('header.nav');

  // --- HERO ---
  initHero();

  // --- NAV STUCK ---
  if (nav) {
    ScrollTrigger.create({
      start: "top -60",
      onEnter: () => nav.classList.add('stuck'),
      onLeaveBack: () => nav.classList.remove('stuck'),
    });
  }

  // --- EXPLAINER ---
  initExplainer();

  // --- RIBBON (sideways sentence) ---
  initRibbon();

  // --- CLOCK ---
  const clockSec = $('#clock');
  const clockTime = $('#clock-time');
  if (clockSec && clockTime) {
    const phases = $$('.phase');
    const efs = $$('.ef');
    const efBars = efs.map((x) => x.querySelector('i') as HTMLElement);
    const engine = $('#engine');
    const result = $('#result');
    const dial = document.querySelector<SVGCircleElement>('#dial-arc');
    const clockScore = $('#clock-score');
    let lastStamp = '';

    const START = 4 * 60 + 44;
    const END = 5 * 60;

    ScrollTrigger.create({
      trigger: clockSec,
      start: "top top",
      end: "+=150%", // Keep pinned for 150% VH
      pin: true,
      scrub: 1,
      onUpdate: (self) => {
        const e = self.progress;

        const t = e < 0.5 ? 4 * e * e * e : 1 - Math.pow(-2 * e + 2, 3) / 2;
        const mins = Math.round(START + (END - START) * t);
        const stamp = `${Math.floor(mins / 60)}:${String(mins % 60).padStart(2, '0')}`;
        if (stamp !== lastStamp) { clockTime.textContent = stamp; lastStamp = stamp; }
        if (dial) dial.style.strokeDashoffset = String(704 * (1 - e));

        const phase = e < 0.3 ? 0 : e < 0.62 ? 1 : 2;
        phases.forEach((el, i) => el.classList.toggle('on', i === phase));
        engine?.classList.toggle('on', phase === 1);
        result?.classList.toggle('on', phase === 2);

        const ep = Math.max(0, Math.min(1, (e - 0.3) / 0.32));
        efBars.forEach((bar, i) => {
          if (!bar) return;
          const d = Math.max(0, Math.min(1, (ep - i * 0.09) * 3.2));
          bar.style.width = `${parseFloat(efs[i].dataset.fill || '0') * d}%`;
        });

        const sp = Math.max(0, Math.min(1, (e - 0.62) / 0.24));
        if (clockScore) clockScore.textContent = String(Math.round(78 * sp));
      }
    });
  }

  // --- STREAK ---
  const streakSec = $('#streak');
  const streakGrid = $('#streak-grid');
  if (streakSec && streakGrid) {
    const squares = Array.from(streakGrid.querySelectorAll<HTMLElement>('.d'));
    const total = squares.length;
    const missIdx = squares.findIndex((d) => d.classList.contains('miss'));
    const countEl = $('#streak-count');
    const scoreEl = $('#streak-score');
    const noteEl = $('#streak-note');
    let lastFilled = -1;

    ScrollTrigger.create({
      trigger: streakSec,
      start: "top 70%",
      end: "bottom 40%",
      scrub: 1,
      onUpdate: (self) => {
        const p = self.progress;
        const e = Math.max(0, Math.min(1, (p - 0.14) / 0.72));
        const filled = Math.round(e * total);
        if (filled === lastFilled) return;

        const lo = Math.min(filled, lastFilled < 0 ? 0 : lastFilled);
        const hi = Math.max(filled, lastFilled);
        for (let i = Math.max(0, lo - 1); i <= Math.min(total - 1, hi); i++) {
          const on = i < filled;
          const isMiss = i === missIdx;
          squares[i].classList.toggle('on', on && !isMiss);
          squares[i].classList.toggle('burn', on && isMiss);
        }
        lastFilled = filled;

        const run = filled > missIdx ? filled - missIdx - 1 : filled;
        if (countEl) countEl.textContent = String(run);
        if (scoreEl) scoreEl.textContent = String(Math.round((run / (total - missIdx - 1)) * 78));
        noteEl?.classList.toggle('on', filled > missIdx && filled < missIdx + 6);
        if (noteEl && filled > missIdx && filled < missIdx + 6) {
          noteEl.textContent = noteEl.dataset.label || '';
        }
      }
    });
  }

  // --- FEATURES HORIZONTAL SCROLL ---
  const featSec = $('#feat');
  const ftrack = $('#ftrack');
  const fbar = $('#fbar');
  if (featSec && ftrack && fbar) {
    ScrollTrigger.create({
      trigger: featSec,
      start: "top top",
      end: () => `+=${ftrack.scrollWidth - window.innerWidth + 40}`,
      pin: true,
      scrub: 1,
      onUpdate: (self) => {
        const e = self.progress;
        const maxX = Math.max(0, ftrack.scrollWidth - window.innerWidth + 40);
        ftrack.style.transform = `translate3d(${-e * maxX}px, 0, 0)`;
        fbar.style.width = `${e * 100}%`;
      }
    });
  }

  // --- SCORE FACTORS ---
  const factors = $('#factors');
  if (factors) {
    const bars = Array.from(factors.querySelectorAll<HTMLElement>('i[data-w]'));
    ScrollTrigger.create({
      trigger: factors,
      start: "top 80%",
      end: "bottom center",
      scrub: 1,
      onUpdate: (self) => {
        const e = self.progress * 1.6;
        bars.forEach((bar, i) => {
          const d = Math.max(0, Math.min(1, (e - i * 0.05) * 1.5));
          bar.style.width = `${parseFloat(bar.dataset.w || '0') * d}%`;
        });
      }
    });
  }

  // --- STEPS PARALLAX ---
  const steps = $$('.step');
  steps.forEach((s, i) => {
    gsap.fromTo(s, {
      y: 13 * (1 + i * 0.25)
    }, {
      y: -13 * (1 + i * 0.25),
      ease: "none",
      scrollTrigger: {
        trigger: s,
        start: "top bottom",
        end: "bottom top",
        scrub: true
      }
    });
  });
}

/* ── Hero — the headline assembles itself ────────────────────────────────
 *
 *  Letters arrive out of order from scattered positions and overshoot into
 *  place. A few slots are held by a shape while that happens — the shape
 *  spins out at the end and hands the slot to the real glyph.
 *
 *  Characters are authored as spans in Hero.astro rather than split here,
 *  so the swap indices in data/site.ts line up with what you can read in
 *  the copy.
 * ─────────────────────────────────────────────────────────────────────── */
function initHero() {
  const hero = document.querySelector<HTMLElement>('#hero');
  if (!hero) return;

  const q = <T extends HTMLElement>(sel: string) => Array.from(hero.querySelectorAll<T>(sel));
  const chars = q('.ch');
  const stands = q('.stand');
  const held = q('.g.held');
  const rand = gsap.utils.random;

  /* CSS keeps these hidden so nothing flashes before the script runs.
     Clearing that here, before the timeline is built, lets every from()
     below capture the right end state and render its own start state
     immediately — no gap where a half-built headline is visible. */
  gsap.set(['.h-title', '.deco', '.hero-badge', '.h-foot'], { opacity: 1 });

  const tl = gsap.timeline({ defaults: { ease: 'power3.out' } });

  tl
    /* Letters fly in from anywhere, in no particular order. The wide y
       range is what produces those mid-flight frames where the headline
       looks scattered across the screen. */
    .from(chars, {
      opacity: 0,
      y: () => rand(-300, 300),
      x: () => rand(-90, 90),
      rotation: () => rand(-28, 28),
      scale: () => rand(0.55, 1.35),
      duration: 1.15,
      ease: 'back.out(1.35)',
      stagger: { each: 0.045, from: 'random' },
    }, 0.15)

    /* Stand-ins drop into their slots early and hold. */
    .from(stands, {
      opacity: 0,
      scale: 0,
      rotation: -200,
      duration: 0.85,
      ease: 'back.out(2)',
      stagger: 0.12,
    }, 0.25)

    .from('.deco-pinwheel', {
      opacity: 0, scale: 0, rotation: -230, duration: 1.3, ease: 'back.out(1.5)',
    }, 0.1)
    .from('.deco-squiggle', {
      opacity: 0, scale: 0, y: 90, rotation: 70, duration: 1.1, ease: 'back.out(1.6)',
    }, 0.55)

    /* The handover: shape spins out, real glyph pops in behind it. */
    .to(stands, {
      scale: 0, rotation: 150, opacity: 0,
      duration: 0.5, ease: 'back.in(1.9)', stagger: 0.1,
    }, 1.5)
    /* fromTo, not from — the stylesheet holds these glyphs at opacity 0
       while their stand-in has the slot, so there is no end state to
       read back off the element. */
    .fromTo(held,
      { opacity: 0, scale: 0.4 },
      { opacity: 1, scale: 1, duration: 0.6, ease: 'back.out(2.4)', stagger: 0.1 },
      1.62)

    .from(['.hero-badge', '.h-foot'], {
      opacity: 0, y: 26, duration: 0.8, stagger: 0.12,
    }, 1.55);

  /* Idle drift, started once the build has landed. */
  tl.call(() => {
    gsap.to('.deco-pinwheel', { rotation: 360, duration: 26, repeat: -1, ease: 'none' });
    gsap.to('.deco-squiggle', { y: -16, rotation: -7, duration: 5, repeat: -1, yoyo: true, ease: 'sine.inOut' });
  });
}

/* ── Explainer — the paragraph brightens word by word on the way past ──
 *
 *  A wave of colour runs through the sentence as the block crosses the
 *  viewport. Same grey-to-cream ramp as the ribbon, so the two blocks
 *  read as the same idea at two different scales.
 * ─────────────────────────────────────────────────────────────────────── */
function initExplainer() {
  const body = document.querySelector<HTMLElement>('#why-body');
  if (!body) return;

  const words = Array.from(body.querySelectorAll<HTMLElement>('.ww'));
  if (!words.length) return;

  const last = new Float32Array(words.length).fill(-1);
  /* Each word finishes a little after the one before it, and the tail is
     shorter than the run so the last word is lit before the block leaves. */
  const lead = 0.62 / words.length;

  ScrollTrigger.create({
    trigger: body,
    start: 'top 82%',
    end: 'bottom 52%',
    scrub: 0.4,
    onUpdate: (self) => {
      for (let i = 0; i < words.length; i++) {
        const p = clamp01((self.progress - i * lead) * 4.2);
        if (Math.abs(p - last[i]) < 0.004) continue;
        last[i] = p;
        words[i].style.color = INK_RAMP[(smooth(p) * 48) | 0];
      }
    },
  });
}

/* ── Ribbon — a sentence that runs sideways while the section is pinned ──
 *
 *  Three rates of movement stacked on one track, which is what sells the
 *  depth:
 *    · shapes  drift at their own `speed`, slower than the words
 *    · line    tracks scroll 1:1
 *    · chars   brighten and rise as they cross the middle of the screen
 *
 *  Every position is measured once per refresh and cached, so the frame
 *  loop only reads numbers and writes styles — it never reads layout.
 * ─────────────────────────────────────────────────────────────────────── */
function initRibbon() {
  const sec = document.querySelector<HTMLElement>('#ribbon');
  const track = document.querySelector<HTMLElement>('#rib-track');
  const line = document.querySelector<HTMLElement>('#rib-line');
  if (!sec || !track || !line) return;

  const chars = new SplitText(line.querySelectorAll('.w'), {
    type: 'chars',
    tag: 'span',
  }).chars as HTMLElement[];
  const chips = Array.from(line.querySelectorAll<HTMLElement>('.chip'));
  const decos = Array.from(track.querySelectorAll<HTMLElement>('.deco'));
  if (!chars.length) return;

  const setX = gsap.quickSetter(track, 'x', 'px') as (v: number) => void;

  let charX: number[] = [];
  let chipX: number[] = [];
  let maxX = 1;
  let head = 0; // viewport x at which a character is fully revealed
  let band = 1; // how far it travels while revealing
  const lastP = new Float32Array(chars.length).fill(-1);

  const centre = (el: HTMLElement, from: number) => {
    const r = el.getBoundingClientRect();
    return r.left - from + r.width / 2;
  };

  function measure() {
    setX(0);
    const vw = window.innerWidth;
    maxX = Math.max(1, track!.offsetWidth - vw);
    head = vw * 0.3;
    band = vw * 0.55;
    const left = track!.getBoundingClientRect().left;
    charX = chars.map((c) => centre(c, left));
    chipX = chips.map((c) => centre(c, left));
    lastP.fill(-1);
  }

  function paint(x: number) {
    for (let i = 0; i < chars.length; i++) {
      const p = clamp01((head + band - (x + charX[i])) / band);
      if (Math.abs(p - lastP[i]) < 0.004) continue; // skip the untouched
      lastP[i] = p;
      const e = smooth(p);
      const c = chars[i];
      c.style.transform = `translate3d(0,${(1 - e) * 0.26}em,0) scale(${0.74 + 0.26 * e})`;
      c.style.color = INK_RAMP[(e * 48) | 0];
    }

    for (let i = 0; i < chips.length; i++) {
      const chip = chips[i];
      const e = smooth(clamp01((head + band - (x + chipX[i])) / band));
      const row = parseFloat(chip.dataset.row || '0');
      const rot = parseFloat(chip.dataset.rot || '0');
      chip.style.opacity = String(0.12 + 0.88 * e);
      chip.style.transform =
        `translate3d(0,${row * e + (1 - e) * 0.55}em,0) rotate(${rot * e}deg) scale(${0.8 + 0.2 * e})`;
    }

    for (const d of decos) {
      const speed = parseFloat(d.dataset.speed || '1');
      const spin = parseFloat(d.dataset.spin || '0');
      /* The track has already carried this shape by x. Give back the
         difference so it nets out at speed × x — under 1 reads as
         "further away", which is the whole parallax. */
      d.style.transform = `translate3d(${(speed - 1) * x}px,0,0) rotate(${x * spin * -0.004}deg)`;
    }
  }

  /* Idle float lives on the inner span so it never fights the parallax
     transform being written to .deco every frame. */
  decos.forEach((d, i) => {
    const inner = d.firstElementChild as HTMLElement | null;
    if (!inner) return;
    gsap.to(inner, {
      y: i % 2 ? 15 : -17,
      duration: 4 + (i % 4) * 0.6,
      repeat: -1,
      yoyo: true,
      ease: 'sine.inOut',
    });
  });

  const apply = (self: { progress: number }) => {
    const x = -self.progress * maxX;
    setX(x);
    paint(x);
  };

  ScrollTrigger.create({
    trigger: sec,
    start: 'top top',
    end: () => `+=${Math.max(1, track.offsetWidth - window.innerWidth)}`,
    pin: true,
    scrub: 0.6,
    invalidateOnRefresh: true,
    onRefresh: (self) => { measure(); apply(self); },
    onUpdate: apply,
  });

  /* Web fonts land after first paint and change every width we cached. */
  document.fonts?.ready.then(() => ScrollTrigger.refresh());
}

/* ── Reveal on scroll (GSAP) ─────────────────────────────────────────── */
function initReveals() {
  document.querySelectorAll('.rv, [data-split], .split').forEach((el) => {
    if (el.closest('#hero')) return; // hero reveals fire after the preloader

    if (el.hasAttribute('data-split') || el.classList.contains('split')) {
      const split = new SplitText(el, { type: "words, chars" });
      gsap.fromTo(split.chars, {
        opacity: 0,
        y: 50,
        rotateX: -90,
      }, {
        opacity: 1,
        y: 0,
        rotateX: 0,
        duration: 0.8,
        stagger: 0.02,
        ease: "back.out(1.5)",
        scrollTrigger: {
          trigger: el,
          start: "top 85%",
        }
      });
    } else {
      gsap.fromTo(el, {
        opacity: 0,
        y: 30,
      }, {
        opacity: 1,
        y: 0,
        duration: 0.6,
        ease: "power3.out",
        scrollTrigger: {
          trigger: el,
          start: "top 85%",
        }
      });
    }
  });
}

/* ── Split headings into per-word animated spans ──────────────── */
// Replaced by native GSAP SplitText in initReveals()

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
