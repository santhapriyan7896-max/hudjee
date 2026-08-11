/**
 * ────────────────────────────────────────────────────────────────
 *  Particle field data — shared by any section that wants the drift
 *  + motion-streak treatment. initParticleField() in scripts/scroll.ts
 *  animates whatever this produces.
 * ────────────────────────────────────────────────────────────────
 */

import { INK_PAIRS } from './ink';

export type Particle = {
  left: number;
  top: number;
  size: number;
  speed: number;
  head: string;
  tail: string;
};

/**
 * Seeded rather than Math.random: this runs once at build time, so an
 * unseeded field would reshuffle on every rebuild and no two deploys
 * would look alike. Pass a different seed per section to keep their
 * fields from being identical.
 */
export function makeParticles(count: number, seed: number): Particle[] {
  let s = seed;
  const rnd = () => ((s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296);

  return Array.from({ length: count }, () => {
    const [head, tail] = INK_PAIRS[Math.floor(rnd() * INK_PAIRS.length)];
    return {
      left: +(rnd() * 100).toFixed(2),
      top: +(rnd() * 100).toFixed(2),
      size: +(3 + rnd() * 6).toFixed(1),
      /* The spread is the whole effect — a field at one speed just slides. */
      speed: +(0.5 + rnd() * 1.7).toFixed(2),
      head,
      tail,
    };
  });
}
