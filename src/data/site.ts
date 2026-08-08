/**
 * ────────────────────────────────────────────────────────────────
 *  All page copy lives here. Edit this file to change the site —
 *  you should not need to touch any .astro markup for wording,
 *  ordering, or adding/removing FAQ entries, steps, features
 *  or stats.
 * ────────────────────────────────────────────────────────────────
 */

export const meta = {
  title: 'HudJee — Practice Daily | Join the waitlist',
  description:
    'HudJee turns exam prep into a daily habit. Adaptive practice, mastery tracking, streaks and friend challenges. Your Readiness Score, recomputed every morning at 5 AM.',
  ogTitle: 'HudJee — Practice Daily',
  ogDescription: 'Your Readiness Score, recomputed every morning at 5 AM.',
  themeColor: '#000000',
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

  /* Headline is split so the second half can carry the gradient.
     Alternates, if you want a different angle:
       'Consistency is the whole game.' / 'We just keep score.'
       'Show up daily.'                 / 'The scoreboard remembers.'
       'Stop studying blind.'           / 'Start keeping score.'          */
  headline: '20 questions a day.',
  headlineAccent: "Every day. That's it.",

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

/** The 5 AM clock sequence. Each phase is a slice of scroll. */
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
  headline: 'Straight answers.',
  items: [
    { q: 'When does the beta open?', a: 'Invites go out in waves, starting with final-year and repeat batches. Waitlist position and batch both matter — join early and pick your batch so we can slot you into the right wave.' },
    { q: 'Is it free?', a: "Fully free through the beta. After launch there's a free tier that keeps daily practice, streaks and your Readiness Score intact, plus premium for adaptive mode, the full question bank and deeper analytics." },
    { q: 'Android only?', a: 'Android first, on the Play Store. iOS follows once the Android build is stable — waitlist members hear either way.' },
    { q: 'How is the rank calculated?', a: "Your Readiness Score is normalised 0–100 against all active HudJee users on a rolling 30-day window, then ranked. It's a rank among students practising on the app — a training signal, not a prediction of your actual exam result." },
    { q: 'Can I use it alongside my coaching?', a: "That's the intent. Filter to exactly the chapter your class covered today and run a 20-minute session on it. HudJee is the daily-reps layer on top of whatever syllabus you already follow." },
    { q: 'What happens to my data?', a: 'Your email is used for beta invites and product updates only. Practice data drives your own score and rank — never sold, never shared with coaching institutes.' },
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
  errorInvalid: 'Enter a valid email address.',
  errorGeneric: 'Something went wrong. Try again in a moment.',
  errorDuplicate: "You're already on the list.",
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
   *  pollMs       how often to re-fetch. 0 disables polling.
   *  fallbackCount used only in demo mode, when no Supabase env is set.
   */
  socialProof: {
    suffix: 'students already waiting',
    suffixOne: 'student already waiting',   // used when the count is 1
    offset: 0,       // added to the real count — keep at 0 for the truth
    minToShow: 0,    // 0 = always show, starting from zero
    pollMs: 20000,   // 0 disables polling
    fallbackCount: 0,
  },
};

export const footer = {
  legal: 'HudJee · Practice Daily.',
  links: [
    { label: 'FAQ', href: '#faq' },
    { label: 'Privacy', href: '#' },
    { label: 'Contact', href: 'mailto:hello@hudjee.app' },
  ],
};
