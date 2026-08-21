/**
 * ────────────────────────────────────────────────────────────────
 *  All page copy lives here. Edit this file to change the site —
 *  you should not need to touch any .astro markup for wording,
 *  ordering, or adding/removing FAQ entries, steps, features
 *  or stats.
 * ────────────────────────────────────────────────────────────────
 */

export const meta = {
  /* ── Search + social metadata ──────────────────────────────────────
     `siteUrl` must match the host the site is actually served from,
     including www. It is the single source of truth for canonical URLs,
     og:url and every absolute URL in the structured data below.
     Keep it in sync with `site` in astro.config.mjs.                  */
  siteUrl: 'https://www.hudjee.com',
  siteName: 'HudJee',
  locale: 'en_IN',
  lang: 'en-IN',

  /* Title stays under ~60 chars so Google shows it whole. Leads with the
     brand, then the query people actually type. */
  title: 'HudJee — Daily JEE Practice App | Join the Waitlist',
  description:
    'HudJee turns JEE prep into one honest session a day. Adaptive practice on real past papers, streaks, and a Readiness Score that ranks you against every active student at 5 AM. Android, free during beta.',

  ogTitle: 'HudJee — Practice Daily',
  ogDescription:
    'Adaptive JEE practice, 20 questions a day. Your Readiness Score and rank, recomputed every morning at 5 AM.',
  /* 1200×630. Absolute URL is built from siteUrl in Layout.astro. */
  ogImage: '/og-image.png',
  ogImageAlt: 'HudJee — Practice Daily. Adaptive JEE practice, ranked every morning at 5 AM.',

  twitterSite: '',   // e.g. '@hudjeeapp' — leave empty until the handle exists

  themeColor: '#000000',

  /* Powers the JSON-LD Organization + SoftwareApplication blocks. */
  org: {
    email: 'hello@hudjee.com',
    country: 'IN',
    sameAs: [
      'https://t.me/hudjee',
      'https://www.instagram.com/hudjee_/',
      'https://www.youtube.com/@hud_jee',
    ],
  },
  app: {
    name: 'HudJee — Practice Daily',
    category: 'EducationalApplication',
    os: 'Android',
    price: '0',
    currency: 'INR',
  },
};

export const nav = {
  links: [
    { label: 'How it works', href: '#how' },
    { label: 'Score', href: '#score' },
    { label: 'Features', href: '#feat' },
    { label: 'FAQ', href: '#faq' },
  ],
  cta: { label: 'Join waitlist', href: '#join' },
};

export const hero = {
  badge: 'Private beta · 2027 & 2028 batches',

  /* The headline assembles character by character on load, so both lines
     have to stay short — much past ten characters and the type has to
     shrink to fit. Line one sits flush left, line two flush right.
     Alternates, if you want a different angle:
       'Show up'  / 'daily.'
       'Practice' / 'like it counts.'
       'Master'   / 'the JEE.'                                            */
  lines: ['Master', 'the JEE.'],

  /** Shapes that hold a letter's place while the headline builds, then
   *  hand over to the real glyph. `line` and `index` are both 0-based;
   *  index counts every character in that line, spaces included. */
  swaps: [
    { line: 0, index: 1, shape: 'asterisk' }, // the a in Master
    { line: 1, index: 0, shape: 'bolt' },     // the t in the
    { line: 1, index: 7, shape: 'dot' },      // the full stop
  ],

  /** Sits inside the curly braces under the headline. Two lines is the
   *  shape it was designed for. */
  lede: 'HudJee — adaptive JEE practice. 20 questions a day, ranked every morning at 5 AM.',

  sub: 'Adaptive practice that learns what you actually know. Your Readiness Score and rank recompute at 5 AM — so you always know exactly where you stand.',

  primaryCta: { label: 'Get early access', href: '#join' },
  secondaryCta: { label: 'See how it works', href: '#how' },

  /** Formulas that write themselves in behind the headline as you
   *  scroll. `at` is the scroll progress (0–1) each one starts at. */
  formulas: [
    { text: '\u222B x\u00B2 dx = x\u00B3/3 + C', at: 0.00, left: '4%',  top: '20%', size: 30, rotate: -6 },
    { text: 'F = ma',                              at: 0.12, left: '78%', top: '16%', size: 38, rotate: 5  },
    { text: 'sin\u00B2\u03B8 + cos\u00B2\u03B8 = 1', at: 0.06, left: '8%',  top: '73%', size: 27, rotate: 4  },
    { text: 'PV = nRT',                            at: 0.20, left: '74%', top: '76%', size: 32, rotate: -5 },
    { text: 'E = hf',                              at: 0.16, left: '46%', top: '9%',  size: 26, rotate: 3  },
  ],
};

/** The one-paragraph "what this actually is" block under the hero.
 *
 *  It reads as an ordinary paragraph, but four phrases take turns
 *  performing when the block scrolls into view — each one goes green,
 *  does its trick, and settles back to cream. `demo` picks the trick:
 *
 *    draw      a drawn-on flourish with a shape riding the path
 *    pop       characters light up left to right
 *    scramble  characters cycle through junk before resolving
 *    scatter   characters fly in from off their line
 *
 *  Order in this array is the order they perform in. Keep `draw` on a
 *  phrase near the start of a line — the flourish is anchored to the
 *  phrase's first line box. */
export const explainer = {
  label: 'Why HudJee',
  parts: [
    { text: 'HudJee turns two years of prep into' },
    { text: 'one honest session a day.', demo: 'draw' },
    { text: 'Adaptive', demo: 'pop' },
    { text: 'questions pitched at the level you are actually at, and a' },
    { text: 'Readiness Score', demo: 'scramble' },
    { text: 'that recomputes every morning at' },
    { text: '5 AM.', demo: 'scatter' },
  ] as { text: string; demo?: string }[],
};

/**
 * The pinned sideways ribbon. One sentence runs left→right across the
 * screen while the section is pinned, revealing character by character.
 *
 *   line   in reading order. A plain `{ text }` renders as words; a
 *          `{ chip }` gets a filled colour box. `row` nudges the chip off
 *          the baseline (in em, negative = up) and `rot` tilts it.
 *   decor  shapes floating over the same track. `at` is how far along the
 *          ribbon they sit (0–1), `top` how high in the viewport. `speed`
 *          below 1 makes a shape drift slower than the text — that lag is
 *          the whole parallax effect, so keep them varied.
 */
export const ribbon: {
  line: { text?: string; chip?: string; color?: string; rot?: number; row?: number }[];
  decor: { shape: string; at: number; top: string; size: number; speed: number; rot: number; spin: number }[];
} = {
  line: [
    { text: 'One chapter.' },
    { chip: 'Adaptive',  color: 'green',  rot: -3, row: -0.58 },
    { text: 'picks the questions.' },
    { chip: '20 a day',  color: 'pink',   rot: 2,  row: 0.52 },
    { text: 'Every answer' },
    { chip: 'timed',     color: 'orange', rot: -2, row: -0.5 },
    { text: 'and every gap logged. At' },
    { chip: '5:00 AM',   color: 'cream',  rot: 3,  row: 0.55 },
    { text: 'the scoreboard says how far you moved' },
    { chip: 'overnight', color: 'cream', rot: -2, row: 0 },
  ],
  decor: [
    { shape: 'ease',     at: 0.05, top: '17%', size: 200, speed: 0.55, rot: -4,  spin: 10 },
    { shape: 'asterisk', at: 0.17, top: '68%', size: 96,  speed: 0.78, rot: 0,   spin: 34 },
    { shape: 'crescent', at: 0.28, top: '20%', size: 124, speed: 0.44, rot: 8,   spin: -22 },
    { shape: 'blob',     at: 0.40, top: '64%', size: 152, speed: 0.70, rot: -6,  spin: 12 },
    { shape: 'arc',      at: 0.52, top: '15%', size: 186, speed: 0.50, rot: 3,   spin: -8 },
    { shape: 'diamond',  at: 0.63, top: '71%', size: 78,  speed: 0.82, rot: 0,   spin: 40 },
    { shape: 'pin',      at: 0.74, top: '19%', size: 108, speed: 0.60, rot: -10, spin: 16 },
    { shape: 'asterisk', at: 0.86, top: '66%', size: 84,  speed: 0.74, rot: 0,   spin: -30 },
    { shape: 'crescent', at: 0.95, top: '22%', size: 104, speed: 0.48, rot: -14, spin: 20 },
  ],
};

/** The four chapters of the pinned device-zoom sequence. */
export const stageCaptions = [
  { title: 'One session a day.', body: 'Pick subject, chapter, difficulty and format. Set a target. Start.' },
  { title: 'Every answer, timed.', body: 'Adaptive questions, real past papers, and a mastery bar that moves while you answer.' },
  { title: '4:45 AM. The engine runs.', body: 'Seven weighted factors over a rolling 30-day window, normalised against every active student.' },
  { title: "5:00 AM. You're ranked.", body: 'Score, rank, overnight movement — and where you sit against your friends.' },
];

export const dawn = {
  time: '5:00 AM',
  sub: 'Every day, the scoreboard resets. Every day, you answer for it.',
};

/** The tools list — stacked rows with a big gradient shape on the left and
 *  a title, one line and a link on the right, hairline ruled between each.
 *
 *  `shape` picks the graphic (the set lives in Tools.astro) and `accent`
 *  picks the title colour, which is matched to that shape's gradient — if
 *  you change one, change the other. */
export const tools = {
  label: 'What you get',
  rows: [
    {
      shape: 'arch', accent: 'pink',
      title: 'Adaptive',
      body: 'Questions pitched at the edge of what you already know.',
      cta: 'Explore adaptive', href: '#feat',
    },
    {
      shape: 'notch', accent: 'orange',
      title: 'Readiness Score',
      body: 'One number, recomputed against every active student at 5 AM.',
      cta: 'Explore the score', href: '#score',
    },
    {
      shape: 'stack', accent: 'purple',
      title: 'Streaks',
      body: 'Miss a day and it burns — unless you banked a freeze.',
      cta: 'Explore streaks', href: '#feat',
    },
    {
      shape: 'grid', accent: 'cyan',
      title: 'Arena',
      body: 'Timed test mode, scored against the whole field.',
      cta: 'Explore arena', href: '#feat',
    },
  ],
};

/** The 5 AM clock sequence. Each phase is a slice of scroll.
 *  No longer rendered — the clock section was replaced by `tools` above.
 *  Kept because the copy is good; delete it if you are sure. */
export const fiveAm = {
  eyebrow: 'Every morning',
  phases: [
    { time: '4:44', label: "Everyone's asleep.",  body: 'Nothing to do. You already did the work yesterday.' },
    { time: '4:45', label: 'The engine runs.',    body: 'Seven weighted factors, 30 days of your answers, every active student.' },
    { time: '5:00', label: "You're ranked.",      body: 'Score, rank, and exactly how far you moved overnight.' },
  ],
  factors: [
    { name: 'Accuracy',    weight: 25, fill: 76 },
    { name: 'Speed',       weight: 15, fill: 64 },
    { name: 'Volume',      weight: 15, fill: 88 },
    { name: 'Difficulty',  weight: 15, fill: 71 },
    { name: 'Consistency', weight: 15, fill: 94 },
    { name: 'Focus',       weight: 10, fill: 58 },
    { name: 'Target hit',  weight: 5,  fill: 80 },
  ],
  finalScore: 78,
  rankDelta: '+87',
};

/** Streak calendar. Scrolling advances the days.
 *  `missedDay` is the index that breaks the streak — set to null for
 *  an unbroken run. */
export const streak = {
  eyebrow: 'The hard part',
  headline: 'Anyone can study for six hours once.',
  headlineAccent: 'Nobody can fake 41 days.',
  lede: 'Scroll and watch a term go by. Every square is a day you either showed up or you did not.',
  totalDays: 63,
  missedDay: 17,
  missedLabel: 'Streak broken. Back to zero.',
  runningLabel: 'Day',
  scoreLabel: 'Readiness',
  finalScore: 78,
};

export const marquee = [
  'Practice Daily', 'Adaptive Questions', 'Mastery Tracking', 'Streaks',
  'Readiness Score', 'Arena Mode', 'Past Papers', 'Friend Challenges',
  'Milestones', '5 AM Refresh',
];

export const how = {
  eyebrow: 'How it works',
  headline: 'Three steps.',
  headlineAccent: 'Every single day.',
  lede: 'No six-hour marathons. HudJee is built around one honest session a day — and a scoreboard that remembers whether you showed up.',
  steps: [
    {
      num: 'STEP 01',
      icon: 'bars',
      title: 'Set your session',
      body: 'Subject, chapter, difficulty, past papers or mixed — then a target in questions or minutes. Or turn on Adaptive and let the engine choose.',
    },
    {
      num: 'STEP 02',
      icon: 'check',
      title: 'Practice, honestly',
      body: 'Every answer is timed. The mastery bar moves as you go. Adaptive reads your ability live and picks the question sitting right at the edge of it.',
    },
    {
      num: 'STEP 03',
      icon: 'trophy',
      title: 'Wake up ranked',
      body: 'At 4:45 AM the engine recomputes every score. By 5 AM your Readiness Score, your rank and your overnight movement are on your home screen.',
    },
  ],
};

export const score = {
  eyebrow: 'The score',
  headline: 'One number that',
  headlineAccent: "can't be faked.",
  lede: "Your Readiness Score runs 0–100, normalised against every active student. Seven weighted factors over a rolling 30-day window — so one good day won't carry you, and one bad day won't sink you.",
  cta: { label: 'Claim your rank early', href: '#join' },
  /** `bar` is the visual fill %, `weight` the label. They differ on purpose:
      a 5% weight with a 5% bar would be invisible. */
  factors: [
    { name: 'Accuracy',    bar: 100, weight: '25%' },
    { name: 'Speed',       bar: 60,  weight: '15%' },
    { name: 'Volume',      bar: 60,  weight: '15%' },
    { name: 'Difficulty',  bar: 60,  weight: '15%' },
    { name: 'Consistency', bar: 60,  weight: '15%' },
    { name: 'Focus',       bar: 40,  weight: '10%' },
    { name: 'Target hit',  bar: 20,  weight: '5%'  },
  ],
};

export const features = {
  eyebrow: "What's inside",
  headline: 'Built for the grind,',
  headlineAccent: 'not the dashboard.',
  cards: [
    { icon: 'brain',    color: '#7B68E8', title: 'Adaptive engine',        body: 'Estimates your ability live and serves the question that actually tells us something new about you.', tag: 'Adaptive',     tagClass: 'grad-ring' },
    { icon: 'file',     color: '#A99BF2', title: 'Complete question bank', body: 'Past papers tagged by year, shift, chapter and topic — every format from integer type to matrix match.', tag: 'Past papers', tagClass: 'grad-ring' },
    { icon: 'flame',    color: '#C9A17C', title: 'Streaks & freezes',      body: "Miss a day and the streak burns — unless you've banked a freeze. Milestones every 30 days.", tag: 'Daily habit', tagClass: 'amber' },
    { icon: 'users',    color: '#7B68E8', title: 'Challenge a friend',     body: 'Hit a question that broke you? Send it to a friend and watch them try. React with 🔥 👏 🤝 💪 😤.', tag: 'Social',   tagClass: 'purple' },
    { icon: 'star',     color: '#C9A17C', title: 'Arena mode',             body: 'Timed test mode when you want the pressure. Full-length or sectional, scored against the field.', tag: 'Timed',       tagClass: 'purple' },
    { icon: 'bell',     color: '#7B68E8', title: 'Nudges that learn',      body: 'No 9 PM blanket blast. HudJee learns the hour you actually study and shows up then — with your rank movement in it.', tag: 'Smart timing', tagClass: 'grad-ring' },
  ],
};

export const stats = [
  { count: 48000, suffix: '+', label: 'Questions in the bank' },
  { count: 7,                  label: 'Question formats' },
  { count: 100, prefix: '0–', label: 'Score scale, daily' },
  { count: 3,                  label: 'Subjects, chapter-wise' },
];

export const faq = {
  eyebrow: 'Questions',
  headline: 'Straight',
  headlineAccent: 'answers.',
  items: [
    { q: 'When does the beta open?', a: 'Invites go out in waves, starting with final-year and repeat batches. Waitlist position and batch both matter — join early and pick your batch so we can slot you into the right wave.' },
    { q: 'Is it free?', a: "Fully free through the beta. After launch there's a free tier that keeps daily practice, streaks and your Readiness Score intact, plus premium for adaptive mode, the full question bank and deeper analytics." },
    { q: 'Android only?', a: 'Android first, on the Play Store. iOS follows once the Android build is stable — waitlist members hear either way.' },
    { q: 'How is the rank calculated?', a: "Your Readiness Score is normalised 0–100 against all active HudJee users on a rolling 30-day window, then ranked. It's a rank among students practising on the app — a training signal, not a prediction of your actual exam result." },
    { q: 'Can I use it alongside my coaching?', a: "That's the intent. Filter to exactly the chapter your class covered today and run a 20-minute session on it. HudJee is the daily-reps layer on top of whatever syllabus you already follow." },
    { q: 'What happens to my data?', a: 'Your email is used for beta invites and product updates only. Practice data drives your own score and rank — never sold, never shared with coaching institutes.' },
  ],
};

/** Channel URLs are also listed in meta.org.sameAs, which is what tells
    Google these accounts and this site are the same outfit. Add a channel
    in both places or neither. WhatsApp is deliberately absent — there was
    no group to point at, and a dead link costs more than a missing one. */
export const community = {
  panel: {
    eyebrow: 'Community',
    title: 'Practise with the batch.',
    body: 'Daily question drops, overnight rank movement and the batch chatter — most of the waitlist is already in there.',
    cta: { label: 'Join the Telegram', href: 'https://t.me/hudjee' },
  },
  cards: [
    { eyebrow: 'Follow along', title: 'Instagram', icon: 'instagram', href: 'https://www.instagram.com/hudjee_/' },
    { eyebrow: 'Watch',        title: 'YouTube',   icon: 'youtube',   href: 'https://www.youtube.com/@hud_jee' },
  ],
};

export const cta = {
  eyebrow: 'Limited beta',
  headline: 'Two years of prep.',
  headlineAccent: 'Won one day at a time.',
  lede: 'Get your invite before the rest of your batch does.',
};

export const waitlistForm = {
  namePlaceholder: 'Your name',
  emailPlaceholder: 'you@email.com',
  batchLabel: 'Batch',
  batches: [
    { value: 'class_11', label: 'Class 11' },
    { value: 'class_12', label: 'Class 12' },
    { value: 'dropper',  label: 'Repeater' },
  ],
  submit: 'Join the waitlist',
  submitting: 'Joining…',
  note: 'Free during beta. Android first. One email when your invite is ready.',
  successTitle: "You're on the list.",
  successBody: 'Watch your inbox — invites go out batch by batch.',

  /* Signing up twice is not a mistake to scold someone for. It gets the
     same confirmation card as a fresh signup, just worded honestly and
     without a queue position — their real one hasn't changed. */
  duplicateTitle: "You're already on the list.",
  duplicateBody: 'No need to sign up again — your place is saved. Invites go out batch by batch.',

  errorInvalid: 'Enter a valid email address.',
  errorGeneric: "Something went wrong on our end. Try again in a moment — it's not you.",
  errorOffline: 'Looks like you’re offline. Check your connection and press Join again.',
  errorEmpty: 'We need an email to send your invite.',
  errorNameEmpty: 'What should we call you?',
  positionPrefix: "You're #",
  positionSuffix: 'in the queue.',
  /**
   * Live signup counter shown next to the avatar stack.
   * Set to null to remove the row entirely.
   *
   *  offset       added to the real count. Keep at 0 to show the true
   *               number — anything else is padding, your call.
   *  minToShow    hides the row until the real count clears this.
   *               0 means always show, counting up from zero.
   *  realtime     open a websocket and update the instant anyone joins.
   *               Needs the broadcast trigger from supabase/waitlist.sql.
   *  pollMs       backstop re-fetch interval. With `realtime` on this is
   *               only a safety net, so keep it slow — 60s is plenty.
   *               Turn it up to ~15000 if you set realtime: false.
   *               0 disables polling entirely.
   *
   *  There is no fake fallback number any more. If the real count can't
   *  be read, the row hides — the page never shows a figure it hasn't
   *  been told by the database.
   */
  socialProof: {
    suffix: 'students already waiting',
    suffixOne: 'student already waiting',   // used when the count is 1
    offset: 0,       // added to the real count — keep at 0 for the truth
    /* 1, not 0: "0 students already waiting" under a signup form is an
       argument against joining. Below this the row hides entirely. */
    minToShow: 1,
    realtime: true,  // websocket push — the number moves live
    pollMs: 60000,   // backstop only; realtime does the real work
  },
};

export const footer = {
  legal: 'HudJee · Practice Daily.',
  columns: [
    {
      title: 'Product', color: '#3FD97B', // Green
      links: [
        { label: 'Features', href: '#feat' },
        { label: 'How it works', href: '#how' },
        { label: 'The score', href: '#score' },
      ]
    },
    {
      title: 'Resources', color: '#FFB1E6', // Pink
      links: [
        { label: 'FAQ', href: '#faq' },
        { label: 'Support', href: `mailto:${meta.org.email}` },
      ]
    },
    {
      title: 'Company', color: '#FF8F00', // Orange
      links: [
        { label: 'Contact', href: `mailto:${meta.org.email}` },
      ]
    },
    {
      title: 'Legal', color: '#A99BF2', // Purple
      links: [
        { label: 'Privacy Policy', href: '/privacy' },
      ]
    }
  ]
};
