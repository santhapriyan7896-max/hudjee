/**
 * ──────────────────────────────────────────────────────────────────
 *  notify-signup — fires once per waitlist row and sends a welcome to
 *  the student who just joined.
 *
 *  It can also tell you about each signup (to NOTIFY_TO), but that's
 *  off unless NOTIFY_SIGNUPS=on: new signups are in the dashboard.
 *
 *  Triggered by a Supabase Database Webhook on INSERT into
 *  public.waitlist. Runs on Supabase Edge Functions (Deno).
 *
 *  WHY A FUNCTION AND NOT THE BROWSER: sending mail needs a provider
 *  API key. Anything the landing page can read, a visitor can read —
 *  so the key lives here as a secret and the page never sees it.
 *  This also means neither email can be forged by hitting an endpoint
 *  directly; they only fire on a real row insert.
 *
 *  ── Which email provider ──────────────────────────────────────────
 *  This speaks to Brevo OR Resend, decided at runtime by which API
 *  key is present. Nothing else in the file changes between them.
 *
 *  We're on Brevo because hudjee.com's DNS is managed by Wix, and Wix
 *  cannot create MX records on a subdomain — which is exactly what
 *  Resend needs on send.hudjee.com to verify the domain. Brevo
 *  authenticates with TXT/CNAME records only, so it works on Wix DNS
 *  as-is. Free tier is 300 emails/day; each signup costs 1 (2 with
 *  NOTIFY_SIGNUPS=on).
 *
 *  When hudjee.com comes off its transfer lock and DNS moves to a
 *  provider that does subdomain MX, flip back with one command:
 *
 *      npx supabase secrets unset BREVO_API_KEY
 *
 *  Resend takes over automatically as long as RESEND_API_KEY is set.
 *  Or force either one with EMAIL_PROVIDER=brevo|resend.
 *
 *  ── Secrets ───────────────────────────────────────────────────────
 *    BREVO_API_KEY    from brevo.com   ← in use now
 *    RESEND_API_KEY   from resend.com  ← used if BREVO_API_KEY is absent
 *    WELCOME_FROM     e.g. "HudJee <hello@hudjee.com>"  ← to students
 *    NOTIFY_FROM      e.g. "HudJee <hello@hudjee.com>"  ← to you
 *    NOTIFY_TO        hudjee26@gmail.com
 *    WEBHOOK_SECRET   any long random string, also set on the webhook
 *
 *  Optional:
 *    NOTIFY_SIGNUPS   'on' to also email NOTIFY_TO about each signup
 *    EMAIL_PROVIDER   'brevo' | 'resend' — overrides auto-detection
 *    REPLY_TO         defaults to hello@hudjee.com
 *    SITE_URL         defaults to https://www.hudjee.com
 *    TELEGRAM_URL     defaults to https://t.me/hudjee
 * ──────────────────────────────────────────────────────────────────
 */

export {};   // makes this a module, so the shim below shadows locally

/* This file runs on Deno, not in the browser bundle, so the site's
   tsconfig has no Deno types — `npm run check` used to report a dozen
   "Cannot find name 'Deno'" errors from here. Declaring the two members
   we actually use fixes that without dragging Deno types into the web
   project. At runtime this erases to nothing and the real global wins. */
declare const Deno: {
  env: { get(key: string): string | undefined };
  serve(handler: (req: Request) => Response | Promise<Response>): void;
};
/* Supabase's runtime: keeps a promise running after the response. */
declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void } | undefined;

interface WaitlistRow {
  id: string;
  name: string | null;
  email: string;
  batch: string | null;
  source: string | null;
  created_at: string;
}

const BATCH_LABELS: Record<string, string> = {
  class_11: 'Class 11',
  class_12: 'Class 12',
  dropper: 'Repeater',
};

/* ── Brand ─────────────────────────────────────────────────────────
   The app's own palette (theme/ui.ts, as on hudjee.com): near-black,
   three surface steps, white and grey text. The ramp's two ends
   (indigo, brass) only ever mark today's day box. Flat colours only:
   Gmail strips background-clip:text, and gradients don't survive
   Outlook. */
const C = {
  bg: '#0A0A0C',
  card: '#131317',
  inset: '#1B1B20',
  day: '#232329',
  border: '#26262C',
  text: '#FFFFFF',
  muted: '#9CA3AF',
  faint: '#838A96',
  indigo: '#6D5DF6',
  brass: '#C99A6B',
  ink: '#0A0A0C',
};

const esc = (v: unknown) =>
  String(v ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

/** First name only — "You're in, Priya." reads better than the full name. */
const firstName = (n: string | null) => {
  const first = String(n ?? '').trim().split(/\s+/)[0] ?? '';
  return first.length > 1 && first.length <= 24 ? first : '';
};

/* Montserrat where the mail app loads web fonts (Apple Mail, iOS),
   the system face everywhere else. */
const FONT = `Montserrat,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif`;

/** What's waiting: each line is something hudjee.com already says. */
const WAITING: [string, string][] = [
  ['Practice that adapts', 'Every answer sets the next question, so each one is pitched at your level.'],
  ['Mock tests marked like JEE', 'Full JEE Main papers at +4 and −1, or one subject in an hour.'],
  ['Mistakes that come back', 'Questions you got wrong return for revision before the exam does.'],
  ['Know where you stand', 'A readiness score out of 100 every morning, and a daily goal you can keep.'],
];

type Links = { site: string; telegram: string; privacy: string; asset: (p: string) => string };

/* ────────────────────────────────────────────────────────────────
   The welcome email.
   Table layout and inline styles throughout: that's what Gmail,
   Outlook and iOS Mail's dark mode all leave alone. The two images
   (the mark and the wordmark) come from hudjee.com and carry alt
   text, so a client that blocks images still reads "HudJee".
   ──────────────────────────────────────────────────────────────── */
function welcomeHtml(row: WaitlistRow, links: Links) {
  const who = firstName(row.name);
  const hello = who ? `You’re in, ${esc(who)}.` : `You’re in.`;

  // the first week: today outlined, the rest days to come
  const days = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
  const week = days.map((d, i) => `
                  <td align="center" valign="top" style="padding:0 3px">
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
                      <td width="30" height="30" style="${
                        i === 0
                          // the border sits inside the 30px, as the other days' fill does
                          ? `width:26px;height:26px;border:2px solid ${C.brass};background:${C.bg}`
                          : `width:30px;height:30px;background:${C.day}`
                      };border-radius:8px;font-size:0;line-height:0">&nbsp;</td>
                    </tr></table>
                    <div style="padding-top:7px;font-family:${FONT};font-size:11px;font-weight:700;color:${
                      i === 0 ? C.text : C.faint
                    }">${d}</div>
                  </td>`).join('');

  const waiting = WAITING.map(([title, body]) => `
              <tr>
                <td width="22" valign="top" style="padding:5px 0 18px">
                  <div style="width:10px;height:10px;border-radius:3px;background:${C.text};font-size:0;line-height:0">&nbsp;</div>
                </td>
                <td valign="top" style="padding:0 0 18px;font-family:${FONT}">
                  <div style="font-size:15px;line-height:21px;font-weight:700;color:${C.text}">${title}</div>
                  <div style="padding-top:3px;font-size:14px;line-height:21px;color:${C.muted}">${body}</div>
                </td>
              </tr>`).join('');

  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="dark">
<meta name="supported-color-schemes" content="dark">
<link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;600;700;800&display=swap" rel="stylesheet">
<title>You’re on the HudJee list</title>
<style>
  @media (max-width: 480px) {
    .card { padding: 28px 22px !important; }
    .h1 { font-size: 27px !important; line-height: 33px !important; }
  }
</style>
</head>
<body style="margin:0;padding:0;background:${C.bg};-webkit-text-size-adjust:100%">
<!-- Preview text: what shows next to the subject in the inbox list. -->
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:${C.bg}">
  We’ll write the day HudJee opens on Android and iPhone. Here’s what’s waiting for you.
</div>

<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" bgcolor="${C.bg}"
       style="background:${C.bg}">
  <tr><td align="center" style="padding:36px 16px 40px">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:560px;width:100%">

      <!-- The mark and the wordmark -->
      <tr><td style="padding:0 4px 22px">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
          <td valign="middle" style="padding-right:12px">
            <img src="${links.asset('/apple-touch-icon.png')}" width="36" height="36" alt=""
                 style="display:block;width:36px;height:36px;border:0;border-radius:9px">
          </td>
          <td valign="middle">
            <img src="${links.asset('/wordmark.png')}" width="94" height="21" alt="HudJee"
                 style="display:block;width:94px;height:21px;border:0;font-family:${FONT};font-size:20px;font-weight:700;color:${C.text}">
          </td>
        </tr></table>
      </td></tr>

      <!-- Card -->
      <tr><td class="card" bgcolor="${C.card}"
              style="background:${C.card};border:1px solid ${C.border};border-radius:24px;padding:36px 32px">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">

          <tr><td style="padding:0 0 14px;font-family:${FONT}">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
              <td valign="middle" style="padding-right:9px">
                <div style="width:9px;height:9px;border-radius:3px;border:2px solid ${C.indigo};font-size:0;line-height:0">&nbsp;</div>
              </td>
              <td valign="middle" style="font-size:11px;letter-spacing:1.6px;text-transform:uppercase;font-weight:700;color:${C.muted}">
                You’re on the list
              </td>
            </tr></table>
          </td></tr>

          <tr><td style="padding:0 0 14px;font-family:${FONT}">
            <h1 class="h1" style="margin:0;font-size:32px;line-height:38px;font-weight:800;letter-spacing:-0.8px;color:${C.text}">${hello}</h1>
          </td></tr>

          <tr><td style="padding:0 0 28px;font-family:${FONT};font-size:16px;line-height:25px;color:${C.muted}">
            HudJee is JEE practice that adapts to every answer. We’ll email you the day it opens
            on Android and iPhone, so you can start on day one.
          </td></tr>

          <!-- Day one -->
          <tr><td style="padding:0 0 30px">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" bgcolor="${C.inset}"
                   style="background:${C.inset};border-radius:18px">
              <tr><td style="padding:20px 18px 18px;font-family:${FONT}">
                <div style="font-size:11px;letter-spacing:1.4px;text-transform:uppercase;font-weight:700;color:${C.faint};padding:0 3px 14px">
                  Your first week
                </div>
                <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>${week}
                </tr></table>
                <div style="padding:16px 3px 0;font-size:14px;line-height:21px;color:${C.muted}">
                  <span style="color:${C.text};font-weight:700">Day one starts when HudJee opens.</span>
                  Twenty questions and about thirty minutes a day is all it asks.
                </div>
              </td></tr>
            </table>
          </td></tr>

          <tr><td style="padding:0 0 16px;font-family:${FONT};font-size:11px;letter-spacing:1.4px;text-transform:uppercase;font-weight:700;color:${C.faint}">
            What’s waiting for you
          </td></tr>
          <tr><td>
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">${waiting}
            </table>
          </td></tr>

          <!-- Button -->
          <tr><td style="padding:10px 0 0">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
              <td bgcolor="${C.text}" style="background:${C.text};border-radius:14px">
                <a href="${esc(links.site)}"
                   style="display:inline-block;padding:15px 26px;font-family:${FONT};font-size:15px;font-weight:700;
                          letter-spacing:-0.2px;color:${C.ink};text-decoration:none;border-radius:14px">
                  See how HudJee works&nbsp;&nbsp;→
                </a>
              </td>
            </tr></table>
          </td></tr>

          <tr><td style="padding:22px 0 0;font-family:${FONT};font-size:14px;line-height:21px;color:${C.muted}">
            Want company while you wait?
            <a href="${esc(links.telegram)}" style="color:${C.text};font-weight:700;text-decoration:underline">Practise with the batch on Telegram</a>.
          </td></tr>

        </table>
      </td></tr>

      <!-- Footer -->
      <tr><td style="padding:24px 8px 0;font-family:${FONT};font-size:12px;line-height:19px;color:${C.faint}">
        You’re getting this because this address was pre-registered at
        <a href="${esc(links.site)}" style="color:${C.muted};text-decoration:underline">hudjee.com</a>.
        We’ll only write about HudJee’s launch, and we never share your email.
        Not you, or changed your mind? Reply “remove” and you’re off the list.
      </td></tr>
      <tr><td style="padding:12px 8px 0;font-family:${FONT};font-size:12px;line-height:19px;color:${C.faint}">
        <a href="${esc(links.privacy)}" style="color:${C.muted};text-decoration:underline">Privacy</a>
        &nbsp;·&nbsp; © ${new Date().getFullYear()} HudJee &nbsp;·&nbsp; Practice daily. Rank higher.
      </td></tr>

    </table>
  </td></tr>
</table>
</body></html>`;
}

/** Plain-text alternative. Not optional — a dark HTML-only email with
    no text part is a reliable way into the spam folder. */
function welcomeText(row: WaitlistRow, links: Links) {
  const who = firstName(row.name);
  return [
    who ? `You're in, ${who}.` : `You're in.`,
    ``,
    `HudJee is JEE practice that adapts to every answer. We'll email you the day it opens`,
    `on Android and iPhone, so you can start on day one.`,
    ``,
    `Day one starts when HudJee opens. Twenty questions and about thirty minutes a day`,
    `is all it asks.`,
    ``,
    `WHAT'S WAITING FOR YOU`,
    ...WAITING.map(([title, body]) => `- ${title}: ${body}`),
    ``,
    `See how HudJee works: ${links.site}`,
    `Practise with the batch on Telegram: ${links.telegram}`,
    ``,
    `--`,
    `You're getting this because this address was pre-registered at hudjee.com.`,
    `We'll only write about HudJee's launch, and we never share your email.`,
    `Not you, or changed your mind? Reply "remove" and you're off the list.`,
    `Privacy: ${links.privacy}`,
  ].join('\n');
}

/** The internal notification. Plain and scannable — it's a log line. */
function notifyHtml(row: WaitlistRow, when: string) {
  const batch = row.batch ? BATCH_LABELS[row.batch] ?? row.batch : 'Not specified';
  const cell = (k: string, v: string) => `
    <tr><td style="padding:9px 0;color:${C.faint};width:104px;font-size:14px">${k}</td>
        <td style="padding:9px 0;color:${C.text};font-weight:700;font-size:14px">${v}</td></tr>`;
  return `
  <div style="font-family:${FONT};background:${C.bg};padding:28px;color:${C.text}">
    <div style="max-width:520px;margin:0 auto;background:${C.card};border:1px solid ${C.border};
                border-radius:22px;padding:26px">
      <div style="font-size:11px;letter-spacing:1.6px;text-transform:uppercase;
                  font-weight:800;color:${C.indigo}">New waitlist signup</div>
      <h1 style="margin:10px 0 22px;font-size:24px;font-weight:800;color:${C.text}">${esc(row.name ?? row.email)}</h1>
      <table style="width:100%;border-collapse:collapse">
        ${cell('Email', esc(row.email))}
        ${cell('Batch', esc(batch))}
        ${cell('Source', esc(row.source))}
        ${cell('Joined', `${esc(when)} IST`)}
      </table>
    </div>
  </div>`;
}

/* ── Sending ───────────────────────────────────────────────────────
   One Mail shape, two providers. See the header comment for why. */

type Provider = 'brevo' | 'resend';

interface Mail {
  from: string;      // "HudJee <hello@hudjee.com>" or a bare address
  to: string;
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
}

/** "HudJee <hello@hudjee.com>" → { name: 'HudJee', email: 'hello@…' } */
function parseAddress(v: string): { name?: string; email: string } {
  const m = /^\s*(.*?)\s*<\s*([^>]+?)\s*>\s*$/.exec(v);
  if (!m) return { email: v.trim() };
  const name = m[1].replace(/^"|"$/g, '').trim();
  return { email: m[2], name: name || undefined };
}

/** Whichever key is set wins; BREVO_API_KEY takes precedence. */
function pickProvider(): { provider: Provider; apiKey: string } | null {
  const explicit = Deno.env.get('EMAIL_PROVIDER')?.trim().toLowerCase();
  const brevo = Deno.env.get('BREVO_API_KEY');
  const resend = Deno.env.get('RESEND_API_KEY');
  if (explicit === 'brevo' && brevo) return { provider: 'brevo', apiKey: brevo };
  if (explicit === 'resend' && resend) return { provider: 'resend', apiKey: resend };
  if (brevo) return { provider: 'brevo', apiKey: brevo };
  if (resend) return { provider: 'resend', apiKey: resend };
  return null;
}

async function send(
  provider: Provider,
  apiKey: string,
  mail: Mail,
): Promise<{ ok: boolean; detail?: string; messageId?: string }> {
  const url = provider === 'brevo'
    ? 'https://api.brevo.com/v3/smtp/email'
    : 'https://api.resend.com/emails';

  const headers: Record<string, string> = provider === 'brevo'
    ? { 'api-key': apiKey, 'Content-Type': 'application/json', accept: 'application/json' }
    : { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' };

  const body = provider === 'brevo'
    ? {
        sender: parseAddress(mail.from),
        to: [{ email: mail.to }],
        replyTo: mail.replyTo ? parseAddress(mail.replyTo) : undefined,
        subject: mail.subject,
        htmlContent: mail.html,
        textContent: mail.text,
      }
    : {
        from: mail.from,
        to: [mail.to],
        reply_to: mail.replyTo,
        subject: mail.subject,
        html: mail.html,
        text: mail.text,
      };

  try {
    const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
    if (res.ok) {
      // Brevo answers { messageId }, Resend { id }: kept so the delivery can be traced
      const sent = await res.json().catch(() => ({}));
      return { ok: true, messageId: sent.messageId ?? sent.id };
    }
    return { ok: false, detail: `${provider} ${res.status} ${await res.text()}` };
  } catch (err) {
    return { ok: false, detail: `${provider} threw: ${String(err)}` };
  }
}

/* ── Delivery trace ────────────────────────────────────────────────
   "Accepted" only means Brevo queued the email. Twenty seconds later,
   ask Brevo what became of it (delivered, deferred, bounced, blocked,
   spam…) and write that to the function's logs, reason included. */
const domainOf = (addr: string) => parseAddress(addr).email.split('@')[1] ?? '?';

async function traceBrevo(apiKey: string, messageId: string, label: string) {
  await new Promise((r) => setTimeout(r, 20000));
  try {
    const q = new URLSearchParams({ messageId, limit: '20', sort: 'desc' });
    const res = await fetch(`https://api.brevo.com/v3/smtp/statistics/events?${q}`, {
      headers: { 'api-key': apiKey, accept: 'application/json' },
    });
    const body = await res.json().catch(() => ({}));
    const events = (body.events ?? []).map((e: { event: string; reason?: string }) =>
      e.reason ? `${e.event} (${e.reason})` : e.event);
    console.log(`${label} delivery: ${res.status} ${events.length ? events.join(', ') : 'no events yet'}`);
  } catch (err) {
    console.log(`${label} delivery: trace failed: ${String(err)}`);
  }
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response('method not allowed', { status: 405 });
  }

  // Shared secret so only the database webhook can invoke this.
  const expected = Deno.env.get('WEBHOOK_SECRET');
  if (expected && req.headers.get('x-webhook-secret') !== expected) {
    return new Response('unauthorized', { status: 401 });
  }

  const chosen = pickProvider();
  if (!chosen) {
    console.error('No email provider key set — need BREVO_API_KEY or RESEND_API_KEY');
    return new Response('not configured', { status: 500 });
  }
  const { provider, apiKey } = chosen;

  const notifyTo = Deno.env.get('NOTIFY_TO') ?? 'hudjee26@gmail.com';
  const notifyFrom = Deno.env.get('NOTIFY_FROM') ?? 'HudJee <hello@hudjee.com>';
  const welcomeFrom = Deno.env.get('WELCOME_FROM') ?? notifyFrom;
  const replyTo = Deno.env.get('REPLY_TO') ?? 'hello@hudjee.com';
  const site = (Deno.env.get('SITE_URL') ?? 'https://www.hudjee.com').replace(/\/+$/, '');
  const links: Links = {
    site,
    telegram: Deno.env.get('TELEGRAM_URL') ?? 'https://t.me/hudjee',
    privacy: `${site}/privacy`,
    asset: (path) => `${site}${path}`,
  };

  let row: WaitlistRow;
  try {
    const payload = await req.json();
    row = payload.record ?? payload; // webhook sends { record: {...} }
  } catch {
    return new Response('bad payload', { status: 400 });
  }
  if (!row?.email) return new Response('no email in payload', { status: 400 });

  const when = new Date(row.created_at ?? Date.now()).toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    dateStyle: 'medium',
    timeStyle: 'short',
  });

  // The note to you is opt-in; the student's welcome always goes.
  const notifyOn = Deno.env.get('NOTIFY_SIGNUPS')?.trim().toLowerCase() === 'on';

  // Both go out together. The student's email is the one that matters,
  // so a failure on either is logged rather than allowed to cancel the
  // other — and the webhook is not retried on a partial success, which
  // would double-send whichever one worked.
  const [welcome, notify] = await Promise.all([
    send(provider, apiKey, {
      from: welcomeFrom,
      to: row.email,
      replyTo: replyTo,
      subject: `You’re on the HudJee list`,
      html: welcomeHtml(row, links),
      text: welcomeText(row, links),
    }),
    notifyOn
      ? send(provider, apiKey, {
          from: notifyFrom,
          to: notifyTo,
          replyTo: row.email,
          subject: `New HudJee signup — ${row.name ?? row.email}`,
          html: notifyHtml(row, when),
        })
      : null,
  ]);

  if (!welcome.ok) console.error('welcome email failed:', welcome.detail);
  if (notify && !notify.ok) console.error('notify email failed:', notify.detail);

  // which sender, to which mailbox provider; then what Brevo did with it
  console.log(`welcome accepted=${welcome.ok} from=@${domainOf(welcomeFrom)} to=@${domainOf(row.email)} id=${welcome.messageId ?? '-'}`);
  if (provider === 'brevo' && welcome.ok && welcome.messageId && typeof EdgeRuntime !== 'undefined') {
    EdgeRuntime.waitUntil(traceBrevo(apiKey, welcome.messageId, 'welcome'));
  }

  return new Response(
    JSON.stringify({ ok: true, provider, welcome: welcome.ok, notify: notify ? notify.ok : 'off' }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );
});
