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
import { ScrambleTextPlugin } from 'gsap/ScrambleTextPlugin';
import { DrawSVGPlugin } from 'gsap/DrawSVGPlugin';
import { MotionPathPlugin } from 'gsap/MotionPathPlugin';

gsap.registerPlugin(ScrollTrigger, SplitText, ScrambleTextPlugin, DrawSVGPlugin, MotionPathPlugin);

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

  // --- SMART NAV ---
  if (nav) {
    ScrollTrigger.create({
      start: "top top",
      end: 99999, // active throughout the whole page
      onUpdate: (self) => {
        // Add 'stuck' class (dark bg and border) when scrolled slightly
        if (self.scroll() > 10) {
          nav.classList.add('stuck');
        } else {
          nav.classList.remove('stuck');
        }
        
        // Hide nav when scrolling down past 60px, show when scrolling up
        if (self.direction === 1 && self.scroll() > 60) {
          nav.classList.add('hide');
        } else {
          nav.classList.remove('hide');
        }
      }
    });
  }

  // --- EXPLAINER ---
  initExplainer();

  // --- RIBBON (sideways sentence) ---
  initRibbon();

  // --- TOOLS ---
  initTools();

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

/* ── Tools — each row arrives as it reaches the viewport ────────────────
 *
 *  The shape swings in from its own side and settles, the copy follows a
 *  beat behind, and the shape keeps drifting after so the list never sits
 *  completely dead.
 * ─────────────────────────────────────────────────────────────────────── */
function initTools() {
  const rows = Array.from(document.querySelectorAll<HTMLElement>('#tools .t-row'));
  if (!rows.length) return;

  rows.forEach((row, i) => {
    const art = row.querySelector<HTMLElement>('.t-art');
    const copy = row.querySelector<HTMLElement>('.t-copy');

    gsap.timeline({ scrollTrigger: { trigger: row, start: 'top 82%', once: true } })
      .from(art, {
        opacity: 0, scale: 0.7, rotation: i % 2 ? 10 : -10, y: 40,
        duration: 0.9, ease: 'back.out(1.4)',
      })
      .from(copy!.children, {
        opacity: 0, y: 26, duration: 0.6, stagger: 0.09, ease: 'power3.out',
      }, 0.16);

    /* Each shape drifts on its own clock so they never bob in lockstep. */
    gsap.to(art, {
      y: i % 2 ? 12 : -12,
      duration: 4.5 + i * 0.7,
      repeat: -1, yoyo: true, ease: 'sine.inOut', delay: 1 + i * 0.3,
    });
  });
}

/* ── Explainer — four phrases take turns performing ──────────────────────
 *
 *  When the section reaches the top of the screen the page is held still
 *  for WHY_LOCK_S seconds while each marked phrase goes green, does one
 *  trick, and settles back to cream. Then scrolling is handed back.
 *
 *  The reel is time-scaled to fit the lock exactly, so the hold and the
 *  animation can never drift apart — WHY_LOCK_S is the one number that
 *  controls the pace of the whole thing. Raise it and every phrase slows
 *  proportionally; lower it and they all sharpen up.
 *
 *  Which phrase does what is set in data/site.ts; this plays them in
 *  document order, one after another.
 * ─────────────────────────────────────────────────────────────────────── */
const WHY_GREEN = '#0AE448';
const WHY_INK = '#F4EFE2';
const WHY_LOCK_S = 4.5;

function initExplainer() {
  const sec = document.querySelector<HTMLElement>('#why');
  const body = document.querySelector<HTMLElement>('#why-body');
  if (!sec || !body) return;

  const segs = Array.from(body.querySelectorAll<HTMLElement>('.seg[data-demo]'));
  if (!segs.length) return;

  const flourish = document.querySelector<HTMLElement>('#why-flourish');
  const rand = gsap.utils.random;

  /* ScrambleText rewrites the element's contents, so that phrase must be
     left whole — everything else gets split for per-character work. */
  const charsFor = new Map<HTMLElement, HTMLElement[]>();
  for (const seg of segs) {
    if (seg.dataset.demo === 'scramble') continue;
    charsFor.set(
      seg,
      SplitText.create(seg, { type: 'chars', tag: 'span', smartWrap: true })
        .chars as HTMLElement[],
    );
  }

  const drawSeg = segs.find((s) => s.dataset.demo === 'draw');

  /* sine.inOut throughout — the colour changes should glide rather than
     snap. Where a phrase needs a bit of overshoot it says so locally. */
  const tl = gsap.timeline({ paused: true, defaults: { ease: 'sine.inOut' } });

  /* A beat of stillness at each end, so the paragraph is settled and
     readable before the first phrase moves and after the last one lands. */
  tl.to({}, { duration: 0.15 });

  for (const seg of segs) {
    const chars = charsFor.get(seg) ?? [];
    const gap = '+=0.18'; // a breath between one phrase and the next

    switch (seg.dataset.demo) {
      /* A flourish is drawn on over the phrase, with the burst riding
         the stroke as it goes. */
      case 'draw': {
        tl.to(chars, { color: WHY_GREEN, duration: 0.18, stagger: 0.012 }, gap);

        if (flourish) {
          const at = '<'; // start alongside the colour sweep
          tl.set(flourish, { opacity: 1 }, at)
            .fromTo('#why-curl', { drawSVG: '0% 0%' }, { drawSVG: '0% 100%', duration: 0.5, ease: 'power1.inOut' }, at)
            .fromTo('#why-spark',
              { scale: 0, opacity: 0, transformOrigin: '50% 50%' },
              {
                scale: 1, opacity: 1, duration: 0.5, ease: 'power1.inOut',
                motionPath: { path: '#why-curl', align: '#why-curl', alignOrigin: [0.5, 0.5] },
              }, at)
            .from('.mote', { scale: 0, opacity: 0, duration: 0.24, stagger: 0.04, ease: 'back.out(1.8)' }, '>-0.16')
            /* Erase from the tail so it reads as being pulled away. */
            .to('#why-curl', { drawSVG: '100% 100%', duration: 0.3, ease: 'power1.in' }, '+=0.1')
            .to(['#why-spark', '.mote'], { scale: 0, opacity: 0, duration: 0.2, stagger: 0.03 }, '<')
            .set(flourish, { opacity: 0 });
        }

        tl.to(chars, { color: WHY_INK, duration: 0.22, stagger: 0.01 }, '>-0.14');
        break;
      }

      /* Characters light up left to right and nudge up as they go. */
      case 'pop':
        tl.to(chars, { color: WHY_GREEN, y: -8, duration: 0.18, stagger: 0.028, ease: 'back.out(1.5)' }, gap)
          .to(chars, { color: WHY_INK, y: 0, duration: 0.22, stagger: 0.018 }, '>-0.1');
        break;

      /* Junk glyphs cycle through and resolve into the real text. */
      case 'scramble': {
        const text = seg.textContent || '';
        tl.to(seg, { color: WHY_GREEN, duration: 0.14 }, gap)
          .to(seg, {
            duration: 0.6,
            scrambleText: { text, chars: 'upperAndLowerCase', speed: 0.8, revealDelay: 0.16 },
          }, '<')
          .to(seg, { color: WHY_INK, duration: 0.25 }, '>-0.1');
        break;
      }

      /* Characters burst outward with scale and random rotation, then slam back. */
      case 'scatter':
        tl.to(chars, { color: WHY_GREEN, duration: 0.14 }, gap)
          .to(chars, {
            scale: 2.5,
            rotationZ: () => rand(-15, 15),
            y: -15,
            duration: 0.25,
            stagger: { each: 0.04, from: 'center' },
            ease: 'back.out(2)'
          }, '<')
          .to(chars, {
            scale: 1,
            rotationZ: 0,
            y: 0,
            color: WHY_INK,
            duration: 0.35,
            stagger: { each: 0.04, from: 'center' },
            ease: 'bounce.out'
          }, '>-0.1');
        break;
    }
  }

  tl.to({}, { duration: 0.15 });

  /* Squeeze (or stretch) the whole reel into the lock window, so the hold
     and the animation finish together no matter how the choreography above
     is edited. */
  tl.timeScale(tl.duration() / WHY_LOCK_S);

  ScrollTrigger.create({
    trigger: sec,
    start: 'top top',
    once: true,
    onRefresh: () => flourish && placeFlourish(body, flourish, drawSeg),
    onEnter: () => {
      /* Snap to the section's top first — someone arriving on a fast flick
         would otherwise be held at whatever half-framed spot they landed. */
      const y = sec.getBoundingClientRect().top + window.scrollY;
      window.scrollTo(0, y);
      if (flourish) placeFlourish(body, flourish, drawSeg);
      holdScroll(y, WHY_LOCK_S * 1000);
      tl.play(0);
    },
  });
}

/** Hold the page at `y` for `ms`, then give scrolling back.
 *
 *  Wheel, touch and the scrolling keys are swallowed; anything that slips
 *  through (scrollbar drags, momentum already in flight) is snapped back by
 *  the scroll listener. Escape is an escape hatch — a lock with no way out
 *  is the kind of thing that traps someone on a flaky frame. */
function holdScroll(y: number, ms: number) {
  const eat = (e: Event) => e.preventDefault();
  const KEYS = new Set([' ', 'PageDown', 'PageUp', 'Home', 'End', 'ArrowDown', 'ArrowUp']);
  const eatKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') return release();
    if (KEYS.has(e.key)) e.preventDefault();
  };
  const snap = () => window.scrollTo(0, y);
  const opts = { passive: false } as AddEventListenerOptions;

  let done = false;
  function release() {
    if (done) return;
    done = true;
    window.removeEventListener('wheel', eat, opts);
    window.removeEventListener('touchmove', eat, opts);
    window.removeEventListener('keydown', eatKey, opts);
    window.removeEventListener('scroll', snap);
  }

  window.addEventListener('wheel', eat, opts);
  window.addEventListener('touchmove', eat, opts);
  window.addEventListener('keydown', eatKey, opts);
  window.addEventListener('scroll', snap);
  setTimeout(release, ms);
}

/** Park the flourish over the demo phrase's first line box, so it lands in
 *  the right place whatever width the paragraph wrapped at. */
function placeFlourish(body: HTMLElement, flourish: HTMLElement, seg?: HTMLElement) {
  if (!seg) return;
  const line = seg.getClientRects()[0];
  if (!line) return;
  const box = body.getBoundingClientRect();
  gsap.set(flourish, {
    left: line.right - box.left - flourish.offsetWidth * 0.55,
    top: line.top - box.top - flourish.offsetHeight * 0.62,
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
