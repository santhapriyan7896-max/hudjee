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
   The app's palette (theme/ui.ts, as on hudjee.com). Restraint is the
   point: black, one card, white type, grey for the rest, and brass only
   where the app uses it, on today's box. Flat colours only: Gmail
   strips background-clip:text, and gradients don't survive Outlook. */
const C = {
  bg: '#0A0A0C',
  card: '#131317',
  day: '#232329',
  border: '#26262C',
  text: '#FFFFFF',
  muted: '#9CA3AF',
  faint: '#6B7280',
  brass: '#C99A6B',
  indigo: '#6D5DF6',
};

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
   the system face everywhere else. */
const FONT = `Montserrat,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif`;

type Links = { site: string; telegram: string; privacy: string; support: string; asset: (p: string) => string };

/** "5 Oct 2026", in India time. */
const joinedOn = (iso: string) =>
  new Date(iso || Date.now()).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', year: 'numeric' });

/* ────────────────────────────────────────────────────────────────
   The welcome email: a membership card and a few lines.
   Table layout and inline styles throughout, so Gmail, Outlook and
   iOS Mail's dark mode leave it alone. The two images carry alt text,
   so a client that blocks images still reads "HudJee".
   ──────────────────────────────────────────────────────────────── */
function welcomeHtml(row: WaitlistRow, links: Links) {
  const who = firstName(row.name);

  // the card's week: today outlined in brass, the days to come
  const week = Array.from({ length: 7 }, (_, i) => `
                    <td style="padding-right:${i === 6 ? 0 : 5}px">
                      <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
                        <td width="12" height="12" style="${
                          i === 0
                            ? `width:9px;height:9px;border:1.5px solid ${C.brass}`
                            : `width:12px;height:12px;background:${C.day}`
                        };border-radius:3px;font-size:0;line-height:0">&nbsp;</td>
                      </tr></table>
                    </td>`).join('');

  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="dark">
<meta name="supported-color-schemes" content="dark">
<link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700&display=swap" rel="stylesheet">
<title>Welcome to the Founding Batch</title>
<style>
  @media (max-width: 480px) {
    .wrap { padding: 48px 24px 56px !important; }
    .h1 { font-size: 32px !important; line-height: 38px !important; }
    .card-in { padding: 22px 22px 20px !important; }
  }
</style>
</head>
<body style="margin:0;padding:0;background:${C.bg};-webkit-text-size-adjust:100%">
<!-- Preview text: what shows next to the subject in the inbox list. -->
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:${C.bg}">
  You’re one of the first. You’ll get in before HudJee opens to everyone else.
</div>

<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" bgcolor="${C.bg}" style="background:${C.bg}">
  <tr><td align="center" class="wrap" style="padding:64px 24px 72px">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:480px;width:100%">

      <!-- The mark -->
      <tr><td style="padding:0 0 48px">
        <img src="${links.asset('/apple-touch-icon.png')}" width="40" height="40" alt="HudJee"
             style="display:block;width:40px;height:40px;border:0;border-radius:10px;font-family:${FONT};font-size:16px;font-weight:700;color:${C.text}">
      </td></tr>

      <!-- Headline -->
      <tr><td style="padding:0 0 20px;font-family:${FONT}">
        <h1 class="h1" style="margin:0;font-size:40px;line-height:46px;font-weight:700;letter-spacing:-1.4px;color:${C.text}">
          Welcome to the Founding&nbsp;Batch${who ? `, ${esc(who)}` : ''}.
        </h1>
      </td></tr>
      <tr><td style="padding:0 0 40px;font-family:${FONT};font-size:17px;line-height:27px;color:${C.muted}">
        You’re one of the first students on HudJee, and you’ll get in before it opens to everyone else.
      </td></tr>

      <!-- The membership card -->
      <tr><td style="padding:0 0 44px">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" bgcolor="${C.card}"
               style="background:${C.card};border:1px solid ${C.border};border-radius:20px">
          <tr><td class="card-in" style="padding:26px 28px 24px">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
              <tr>
                <td valign="top">
                  <img src="${links.asset('/wordmark.png')}" width="76" height="17" alt="HudJee"
                       style="display:block;width:76px;height:17px;border:0;font-family:${FONT};font-size:15px;font-weight:600;color:${C.text}">
                </td>
                <td valign="top" align="right" style="font-family:${FONT};font-size:12px;line-height:17px;font-weight:500;color:${C.faint}">
                  ${esc(joinedOn(row.created_at))}
                </td>
              </tr>
              <tr><td colspan="2" style="padding:64px 0 6px;font-family:${FONT};font-size:11px;letter-spacing:2.4px;text-transform:uppercase;font-weight:600;color:${C.brass}">
                Founding Batch
              </td></tr>
              <tr>
                <td valign="bottom" style="font-family:${FONT};font-size:20px;line-height:26px;font-weight:600;letter-spacing:-0.4px;color:${C.text}">
                  ${who ? esc(who) : 'Founding member'}
                </td>
                <td valign="bottom" align="right">
                  <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>${week}
                  </tr></table>
                </td>
              </tr>
            </table>
          </td></tr>
        </table>
      </td></tr>

      <!-- What it means -->
      <tr><td style="padding:0 0 20px;font-family:${FONT};font-size:16px;line-height:26px;color:${C.muted}">
        You’ll also carry the Founding Batch badge in the app, and keep the founding
        price for as long as you use HudJee.
      </td></tr>
      <tr><td style="padding:0 0 44px;font-family:${FONT};font-size:16px;line-height:26px;color:${C.text}">
        Give it thirty minutes a day. HudJee picks the chapter, pitches every question
        at your level, and brings back every mistake before the exam does.
      </td></tr>

      <!-- The one ask -->
      <tr><td style="padding:0 0 36px;font-family:${FONT};font-size:16px;line-height:26px;color:${C.muted}">
        Until we open, there’s a previous-year question every day on our Telegram.<br>
        <a href="${esc(links.telegram)}" style="color:${C.text};font-weight:600;text-decoration:none;border-bottom:1px solid ${C.faint}">Join the channel&nbsp;→</a>
      </td></tr>

      <!-- Write to us -->
      <tr><td style="padding:0 0 48px;font-family:${FONT};font-size:16px;line-height:26px;color:${C.muted}">
        Something to ask, or say? Write to us at
        <a href="mailto:${esc(links.support)}" style="color:${C.text};font-weight:600;text-decoration:none;border-bottom:1px solid ${C.faint}">${esc(links.support)}</a>.
        We read every email.
      </td></tr>

      <!-- Sign-off -->
      <tr><td style="padding:0 0 56px;font-family:${FONT};font-size:16px;line-height:26px;color:${C.text};font-weight:600">
        Team HudJee
      </td></tr>

      <!-- Footer -->
      <tr><td style="padding:24px 0 0;border-top:1px solid ${C.border};font-family:${FONT};font-size:12px;line-height:19px;color:${C.faint}">
        You joined the Founding Batch at
        <a href="${esc(links.site)}" style="color:${C.muted};text-decoration:none">hudjee.com</a>.
        We’ll only write about HudJee’s launch. To leave the list, write to
        <a href="mailto:${esc(links.support)}" style="color:${C.muted};text-decoration:none">${esc(links.support)}</a>.
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
    `You'll also carry the Founding Batch badge in the app, and keep the founding price for`,
    `as long as you use HudJee.`,
    ``,
    `Give it thirty minutes a day. HudJee picks the chapter, pitches every question at your`,
    `level, and brings back every mistake before the exam does.`,
    ``,
    `Until we open, there's a previous-year question every day on our Telegram:`,
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
