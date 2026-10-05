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
 *    SUPPORT_EMAIL    where students write to; defaults to support@hudjee.com
 *    REPLY_TO         where replies go; defaults to SUPPORT_EMAIL
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
   hudjee.com's own tokens and pieces, so the email reads as the site:
   the footer card (one big rounded surface), the "Launching soon" pill,
   bold white headlines set tight, grey caps labels, the app's list
   panels, the ramp-outlined primary button, and the giant faded
   wordmark. As on the site, the ramp (indigo → slate → brass) only ever
   outlines the primary action and today's box; all type is white or
   grey. Gradients degrade to a flat slate hairline where unsupported. */
const C = {
  bg: '#0A0A0C',
  surface: '#131317',
  subtle: '#1B1B20',
  strong: '#232329',
  divider: '#26262C',
  ghost: '#2A2A30',
  text: '#FFFFFF',
  muted: '#9CA3AF',
  faint: '#838A96',
  rampA: '#6D5DF6',
  rampB: '#4A4A63',
  rampC: '#C99A6B',
  indigo: '#6D5DF6',
};
const RAMP = `linear-gradient(90deg,${C.rampA},${C.rampB} 50%,${C.rampC})`;
const RAMP_DIAG = `linear-gradient(135deg,${C.rampA},${C.rampB} 50%,${C.rampC})`;

const esc = (v: unknown) =>
  String(v ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

/** First name only. */
const firstName = (n: string | null) => {
  const first = String(n ?? '').trim().split(/\s+/)[0] ?? '';
  return first.length > 1 && first.length <= 24 ? first : '';
};

/* Montserrat where the mail app loads web fonts (Apple Mail, iOS),
   the system face everywhere else, as the site falls back. */
const FONT = `Montserrat,ui-sans-serif,system-ui,-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif`;

type Links = { site: string; telegram: string; privacy: string; support: string; asset: (p: string) => string };

/** What joining early gets you: the app's list-panel rows. */
const PERKS: [string, string][] = [
  ['Early access', 'Before everyone else'],
  ['Founding Batch badge', 'In the app'],
  ['Founding price', 'For life'],
];

/** The site's grey caps label ("GET LAUNCH-DAY ACCESS"). */
const label = (t: string, pad = '0 0 14px') =>
  `<div style="padding:${pad};font-family:${FONT};font-size:12px;line-height:16px;letter-spacing:1.8px;text-transform:uppercase;font-weight:600;color:${C.faint}">${t}</div>`;

/** Today's box: a 1.5px ramp outline round a page-coloured square. */
const todayBox = (size: number) => `
  <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
    <td bgcolor="${C.rampB}" style="background-color:${C.rampB};background-image:${RAMP_DIAG};border-radius:${Math.round(size * 0.3)}px;padding:1.5px">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
        <td width="${size - 3}" height="${size - 3}" bgcolor="${C.subtle}" style="width:${size - 3}px;height:${size - 3}px;background:${C.subtle};border-radius:${Math.round(size * 0.3) - 1}px;font-size:0;line-height:0">&nbsp;</td>
      </tr></table>
    </td>
  </tr></table>`;

/* ────────────────────────────────────────────────────────────────
   The welcome email: hudjee.com's footer card, written to a new
   member of the Founding Batch.
   Table layout and inline styles throughout, so Gmail, Outlook and
   iOS Mail's dark mode leave it alone. Images carry alt text.
   ──────────────────────────────────────────────────────────────── */
function welcomeHtml(row: WaitlistRow, links: Links) {
  const who = firstName(row.name);

  const perks = PERKS.map(([title, value], i) => `
              <tr>
                <td class="pk-t" style="padding:17px 12px 17px 0;${i ? `border-top:1px solid ${C.divider};` : ''}font-family:${FONT};font-size:15px;line-height:20px;font-weight:600;color:${C.text};white-space:nowrap">${title}</td>
                <td class="pk-v" align="right" style="padding:17px 0;${i ? `border-top:1px solid ${C.divider};` : ''}font-family:${FONT};font-size:14px;line-height:20px;color:${C.muted}">${value}</td>
              </tr>`).join('');

  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="dark">
<meta name="supported-color-schemes" content="dark">
<link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@300;400;500;600;700&display=swap" rel="stylesheet">
<title>Welcome to the Founding Batch</title>
<style>
  @media (max-width: 520px) {
    .page { padding: 28px 10px 36px !important; }
    .card { padding: 32px 22px 0 !important; border-radius: 26px !important; }
    .h1 { font-size: 36px !important; line-height: 38px !important; letter-spacing: -1.4px !important; }
    .mark { font-size: 74px !important; line-height: 60px !important; letter-spacing: -3px !important; }
    .panel { padding: 2px 16px !important; }
    /* each perk stacks: the title, then its value beneath */
    .pk-t { display: block !important; width: auto !important; padding: 15px 0 3px !important; font-size: 15px !important; white-space: normal !important; }
    .pk-v { display: block !important; width: auto !important; text-align: left !important; padding: 0 0 15px !important; border-top: 0 !important; font-size: 14px !important; }
  }
</style>
</head>
<body style="margin:0;padding:0;background:${C.bg};-webkit-text-size-adjust:100%">
<!-- Preview text: what shows next to the subject in the inbox list. -->
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:${C.bg}">
  You’re one of the first. You’ll get in before HudJee opens to everyone else.
</div>

<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" bgcolor="${C.bg}" style="background:${C.bg}">
  <tr><td align="center" class="page" style="padding:48px 16px 48px">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:560px;width:100%">

      <!-- The mark, as the site opens -->
      <tr><td align="center" style="padding:0 0 36px">
        <img src="${links.asset('/apple-touch-icon.png')}" width="52" height="52" alt="HudJee"
             style="display:block;width:52px;height:52px;border:0;border-radius:14px;font-family:${FONT};font-size:18px;font-weight:700;color:${C.text}">
      </td></tr>

      <!-- The card: hudjee.com's footer card -->
      <tr><td class="card" bgcolor="${C.surface}" style="background:${C.surface};border-radius:32px;padding:44px 40px 0;overflow:hidden">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">

          <!-- The pill -->
          <tr><td style="padding:0 0 26px">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
              <td bgcolor="${C.subtle}" style="background:${C.subtle};border-radius:999px;padding:8px 16px 8px 12px">
                <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
                  <td valign="middle" style="padding-right:10px">${todayBox(13)}</td>
                  <td valign="middle" style="font-family:${FONT};font-size:13px;line-height:18px;font-weight:600;color:${C.muted}">Founding Batch</td>
                </tr></table>
              </td>
            </tr></table>
          </td></tr>

          <!-- Headline -->
          <tr><td style="padding:0 0 18px;font-family:${FONT}">
            <h1 class="h1" style="margin:0;font-size:46px;line-height:48px;font-weight:700;letter-spacing:-1.9px;color:${C.text}">
              Welcome to the Founding&nbsp;Batch${who ? `, ${esc(who)}` : ''}.
            </h1>
          </td></tr>
          <tr><td style="padding:0 0 40px;font-family:${FONT};font-size:17px;line-height:27px;color:${C.muted}">
            You’re one of the first students on HudJee, and you’ll get in before it opens to everyone else.
          </td></tr>

          <!-- Perks: the app's list panel -->
          <tr><td>${label('What joining early gets you')}</td></tr>
          <tr><td style="padding:0 0 40px">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" bgcolor="${C.subtle}"
                   style="background:${C.subtle};border-radius:18px">
              <tr><td class="panel" style="padding:4px 22px">
                <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">${perks}
                </table>
              </td></tr>
            </table>
          </td></tr>

          <!-- The core message -->
          <tr><td style="padding:0 0 40px;font-family:${FONT};font-size:17px;line-height:27px;color:${C.muted}">
            <span style="color:${C.text};font-weight:600">Give it thirty minutes a day.</span>
            HudJee picks the chapter, pitches every question at your level, and brings back
            every mistake before the exam does.
          </td></tr>

          <!-- The one ask -->
          <tr><td>${label('Until we open')}</td></tr>
          <tr><td style="padding:0 0 22px;font-family:${FONT};font-size:17px;line-height:27px;color:${C.muted}">
            A previous-year question every day, with its worked solution, on our Telegram.
          </td></tr>
          <tr><td style="padding:0 0 40px">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
              <td bgcolor="${C.rampB}" style="background-color:${C.rampB};background-image:${RAMP};border-radius:14px;padding:1.5px">
                <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
                  <td bgcolor="${C.bg}" style="background:${C.bg};border-radius:13px">
                    <a href="${esc(links.telegram)}"
                       style="display:inline-block;padding:15px 24px;font-family:${FONT};font-size:16px;line-height:20px;font-weight:700;letter-spacing:-0.2px;color:${C.text};text-decoration:none">
                      Join the Telegram&nbsp;&nbsp;→
                    </a>
                  </td>
                </tr></table>
              </td>
            </tr></table>
          </td></tr>

          <!-- Write to us, and sign-off -->
          <tr><td style="padding:0 0 28px;font-family:${FONT};font-size:15px;line-height:24px;color:${C.muted}">
            Something to ask, or say? Write to us at
            <a href="mailto:${esc(links.support)}" style="color:${C.text};font-weight:600;text-decoration:underline">${esc(links.support)}</a>.
            We read every email.
          </td></tr>
          <tr><td style="padding:0 0 30px;font-family:${FONT};font-size:15px;line-height:24px;font-weight:700;color:${C.text}">
            Team HudJee
          </td></tr>

          <!-- The giant wordmark, as the site's footer ends -->
          <tr><td class="mark" style="padding:0;font-family:${FONT};font-size:136px;line-height:108px;font-weight:300;letter-spacing:-6px;color:${C.ghost};white-space:nowrap">HudJee</td></tr>

        </table>
      </td></tr>

      <!-- Below the card -->
      <tr><td align="center" style="padding:24px 16px 0;font-family:${FONT};font-size:12px;line-height:19px;color:${C.faint}">
        You joined the Founding Batch at
        <a href="${esc(links.site)}" style="color:${C.muted};text-decoration:none">hudjee.com</a>.
        We’ll only write about HudJee’s launch.<br>
        To leave the list, write to
        <a href="mailto:${esc(links.support)}" style="color:${C.muted};text-decoration:none">${esc(links.support)}</a>
        &nbsp;·&nbsp;
        <a href="${esc(links.privacy)}" style="color:${C.muted};text-decoration:none">Privacy</a>
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
    who ? `Welcome to the Founding Batch, ${who}.` : `Welcome to the Founding Batch.`,
    ``,
    `You're one of the first students on HudJee, and you'll get in before it opens to`,
    `everyone else.`,
    ``,
    `WHAT JOINING EARLY GETS YOU`,
    ...PERKS.map(([title, value]) => `${title}: ${value}`),
    ``,
    `Give it thirty minutes a day. HudJee picks the chapter, pitches every question at your`,
    `level, and brings back every mistake before the exam does.`,
    ``,
    `UNTIL WE OPEN`,
    `A previous-year question every day, with its worked solution, on our Telegram:`,
    links.telegram,
    ``,
    `Something to ask, or say? Write to us at ${links.support}. We read every email.`,
    ``,
    `Team HudJee`,
    ``,
    `--`,
    `You joined the Founding Batch at hudjee.com. We'll only write about HudJee's launch.`,
    `To leave the list, write to ${links.support}. Privacy: ${links.privacy}`,
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
    <div style="max-width:520px;margin:0 auto;background:${C.surface};border:1px solid ${C.divider};
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
  const support = Deno.env.get('SUPPORT_EMAIL') ?? 'support@hudjee.com';
  const replyTo = Deno.env.get('REPLY_TO') ?? support;
  const site = (Deno.env.get('SITE_URL') ?? 'https://www.hudjee.com').replace(/\/+$/, '');
  const links: Links = {
    site,
    telegram: Deno.env.get('TELEGRAM_URL') ?? 'https://t.me/hudjee',
    privacy: `${site}/privacy`,
    support,
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
      subject: `Welcome to the Founding Batch`,
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
