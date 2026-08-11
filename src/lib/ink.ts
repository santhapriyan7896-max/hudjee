/**
 * ────────────────────────────────────────────────────────────────
 *  The four inks the landing page decorates with — particle dots,
 *  stat numbers, FAQ flags. Light head → saturated tail, so anything
 *  that ramps between them reads as a gradient rather than a block.
 *
 *  These sit alongside the --hl-* slab colours in global.css: same
 *  family, but these are for marks rather than type on a slab.
 * ────────────────────────────────────────────────────────────────
 */
export const INK_PAIRS: ReadonlyArray<readonly [string, string]> = [
  ['#E7DDFF', '#7B5CF0'], // violet
  ['#FFE2C4', '#F2963C'], // amber
  ['#FFD6F0', '#E86FB8'], // pink
  ['#F4EEFF', '#A99BF2'], // lilac
];
