/**
 * ──────────────────────────────────────────────────────────────────
 *  notify-signup — fires once per waitlist row and sends two emails:
 *
 *    1. A welcome to the student who just joined, with their queue
 *       position.
 *    2. A notification to hudjee26@gmail.com so you see signups
 *       without opening the dashboard.
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
 *  as-is. Free tier is 300 emails/day; each signup costs 2.
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
   Deliberately flat colours, no gradients. Gmail strips
   `-webkit-background-clip:text`, and gradient text without it
   renders as transparent — i.e. invisible. Solid or nothing. */
const C = {
  bg: '#0A0A0C',
  card: '#131217',
  border: '#27262B',
  text: '#FFFFFF',
  dim: '#A7A9B0',
  faint: '#75787F',
  purple: '#7B68E8',
  lilac: '#A99BF2',
  amber: '#C9A17C',
};

const esc = (v: unknown) =>
  String(v ?? '—')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

/** First name only — "Hey Priya" reads better than "Hey Priya Sharma". */
const firstName = (n: string | null) => {
  const first = String(n ?? '').trim().split(/\s+/)[0] ?? '';
  return first.length > 1 && first.length <= 24 ? first : '';
};

const FONT = `-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif`;

/* ────────────────────────────────────────────────────────────────
   The welcome email.
   Table-based layout, inline styles, no external images and no web
   fonts — that combination is what survives Gmail, Outlook and the
   iOS Mail dark-mode filter intact.
   ──────────────────────────────────────────────────────────────── */
function welcomeHtml(row: WaitlistRow, position: number | null, links: { site: string; telegram: string }) {
  const who = firstName(row.name);
  const hello = who ? `You're in, ${esc(who)}.` : `You're in.`;
  const batch = row.batch ? BATCH_LABELS[row.batch] ?? row.batch : null;

  const positionBlock = position
    ? `
      <tr><td style="padding:0 0 26px">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"
               style="background:#191822;border:1px solid ${C.border};border-radius:16px">
          <tr>
            <td style="padding:18px 20px">
              <div style="font-size:11px;letter-spacing:1.4px;text-transform:uppercase;
                          font-weight:700;color:${C.faint};padding-bottom:6px">Your place in the queue</div>
              <div style="font-size:30px;line-height:1;font-weight:800;color:${C.lilac}">
                #${position.toLocaleString('en-IN')}
              </div>
            </td>
          </tr>
        </table>
      </td></tr>`
    : '';

  const point = (n: string, title: string, body: string) => `
    <tr>
      <td width="30" valign="top" style="padding:0 0 16px">
        <div style="font-size:13px;font-weight:800;color:${C.amber}">${n}</div>
      </td>
      <td valign="top" style="padding:0 0 16px">
        <div style="font-size:15px;font-weight:700;color:${C.text};padding-bottom:3px">${title}</div>
        <div style="font-size:14px;line-height:21px;color:${C.dim}">${body}</div>
      </td>
    </tr>`;

  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="dark">
<meta name="supported-color-schemes" content="dark">
<title>You're on the HudJee waitlist</title>
</head>
<body style="margin:0;padding:0;background:${C.bg}">
<!-- Preview text: what shows next to the subject in the inbox list. -->
<div style="display:none;max-height:0;overflow:hidden;opacity:0">
  20 questions a day, ranked every morning at 5 AM. Here's what happens next.
</div>

<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"
       style="background:${C.bg};padding:32px 16px">
  <tr><td align="center">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"
           style="max-width:520px;width:100%">

      <!-- Wordmark -->
      <tr><td style="padding:0 4px 18px;font-family:${FONT}">
        <span style="font-size:17px;font-weight:800;color:${C.text};letter-spacing:-.3px">Hud</span><span
              style="font-size:17px;font-weight:800;color:${C.amber};letter-spacing:-.3px">Jee</span>
        <span style="font-size:11px;font-weight:700;color:${C.faint};letter-spacing:1.3px;
                     text-transform:uppercase;padding-left:8px">Practice Daily</span>
      </td></tr>

      <!-- Card -->
      <tr><td style="background:${C.card};border:1px solid ${C.border};border-radius:22px;
                     padding:30px 26px;font-family:${FONT}">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">

          <tr><td style="padding:0 0 8px">
            <div style="font-size:11px;letter-spacing:1.6px;text-transform:uppercase;
                        font-weight:800;color:${C.purple}">Waitlist confirmed</div>
          </td></tr>

          <tr><td style="padding:0 0 14px">
            <h1 style="margin:0;font-size:27px;line-height:33px;font-weight:800;
                       color:${C.text};letter-spacing:-.5px">${hello}</h1>
          </td></tr>

          <tr><td style="padding:0 0 24px">
            <p style="margin:0;font-size:15px;line-height:23px;color:${C.dim}">
              You'll be among the first to practise on HudJee — 20 adaptive questions a day
              from real past papers, with your Readiness Score and rank recomputed every
              morning at 5 AM.
            </p>
          </td></tr>

          ${positionBlock}

          <tr><td style="padding:0 0 14px;border-top:1px solid ${C.border};padding-top:24px">
            <div style="font-size:11px;letter-spacing:1.5px;text-transform:uppercase;
                        font-weight:800;color:${C.faint}">What happens next</div>
          </td></tr>

          <tr><td style="padding:0 0 10px">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
              ${point('01', 'One email, when it matters',
                `Your invite lands in this inbox with the Play Store link. No drip campaign, no weekly newsletter.`)}
              ${point('02', 'Invites go out in waves',
                batch
                  ? `Starting with the batches closest to the exam. You're down as <span style="color:${C.text};font-weight:700">${esc(batch)}</span> — we'll slot you into that wave.`
                  : `Starting with the batches closest to the exam. Reply with your batch and we'll slot you into the right wave.`)}
              ${point('03', 'Free through the beta',
                `Every feature, no card. Android first — iOS follows once the Android build is stable, and you'll hear either way.`)}
            </table>
          </td></tr>

          <!-- Telegram CTA -->
          <tr><td style="padding:14px 0 0;border-top:1px solid ${C.border}">
            <p style="margin:0 0 16px;font-size:14px;line-height:21px;color:${C.dim}">
              Don't want to wait quietly? Daily question drops and overnight rank movement
              happen in the Telegram — most of the waitlist is already in there.
            </p>
            <table role="presentation" cellpadding="0" cellspacing="0" border="0">
              <tr><td style="background:${C.purple};border-radius:12px">
                <a href="${esc(links.telegram)}"
                   style="display:inline-block;padding:13px 24px;font-family:${FONT};
                          font-size:15px;font-weight:800;color:#FFFFFF;text-decoration:none">
                  Join the Telegram
                </a>
              </td></tr>
            </table>
          </td></tr>

        </table>
      </td></tr>

      <!-- Footer -->
      <tr><td style="padding:20px 6px 0;font-family:${FONT}">
        <p style="margin:0 0 8px;font-size:12px;line-height:18px;color:${C.faint}">
          You're getting this because you joined the waitlist at
          <a href="${esc(links.site)}" style="color:${C.dim};text-decoration:underline">hudjee.com</a>.
          Your email is used for beta invites and product updates only — never sold, never
          shared with coaching institutes.
        </p>
        <p style="margin:0;font-size:12px;line-height:18px;color:${C.faint}">
          Reply "remove" to this email and you're off the list. No hard feelings.
        </p>
      </td></tr>

    </table>
  </td></tr>
</table>
</body></html>`;
}

/** Plain-text alternative. Not optional — a dark HTML-only email with
    no text part is a reliable way into the spam folder. */
function welcomeText(row: WaitlistRow, position: number | null, links: { site: string; telegram: string }) {
  const who = firstName(row.name);
  const batch = row.batch ? BATCH_LABELS[row.batch] ?? row.batch : null;
  return [
    who ? `You're in, ${who}.` : `You're in.`,
    ``,
    `You'll be among the first to practise on HudJee - 20 adaptive questions a day from real`,
    `past papers, with your Readiness Score and rank recomputed every morning at 5 AM.`,
    ``,
    position ? `Your place in the queue: #${position.toLocaleString('en-IN')}` : ``,
    ``,
    `WHAT HAPPENS NEXT`,
    `01. One email, when it matters. Your invite lands in this inbox with the Play Store`,
    `    link. No drip campaign, no weekly newsletter.`,
    `02. Invites go out in waves, starting with the batches closest to the exam.` +
      (batch ? ` You're down as ${batch}.` : ` Reply with your batch and we'll slot you in.`),
    `03. Free through the beta. Every feature, no card. Android first; iOS follows.`,
    ``,
    `Daily question drops and overnight rank movement happen in the Telegram:`,
    links.telegram,
    ``,
    `--`,
    `You're getting this because you joined the waitlist at ${links.site}`,
    `Your email is used for beta invites and product updates only.`,
    `Reply "remove" and you're off the list.`,
  ].filter((l) => l !== undefined).join('\n');
}

/** The internal notification. Plain and scannable — it's a log line. */
function notifyHtml(row: WaitlistRow, position: number | null, when: string) {
  const batch = row.batch ? BATCH_LABELS[row.batch] ?? row.batch : 'Not specified';
  const cell = (k: string, v: string) => `
    <tr><td style="padding:9px 0;color:${C.faint};width:104px;font-size:14px">${k}</td>
        <td style="padding:9px 0;color:${C.text};font-weight:700;font-size:14px">${v}</td></tr>`;
  return `
  <div style="font-family:${FONT};background:${C.bg};padding:28px;color:${C.text}">
    <div style="max-width:520px;margin:0 auto;background:${C.card};border:1px solid ${C.border};
                border-radius:22px;padding:26px">
      <div style="font-size:11px;letter-spacing:1.6px;text-transform:uppercase;
                  font-weight:800;color:${C.purple}">New waitlist signup</div>
      <h1 style="margin:10px 0 22px;font-size:24px;font-weight:800;color:${C.text}">${esc(row.name)}</h1>
      <table style="width:100%;border-collapse:collapse">
        ${cell('Email', esc(row.email))}
        ${cell('Batch', esc(batch))}
        ${cell('Source', esc(row.source))}
        ${cell('Joined', `${esc(when)} IST`)}
        ${position ? cell('Position', `#${position.toLocaleString('en-IN')}`) : ''}
      </table>
    </div>
  </div>`;
}

/* ── Queue position ────────────────────────────────────────────────
   Read with the service-role key, which Supabase injects into every
   Edge Function automatically. Never a blocker: if this fails the
   emails still go out, just without the number. */
async function fetchPosition(email: string): Promise<number | null> {
  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) return null;
  try {
    const res = await fetch(`${url}/rest/v1/rpc/waitlist_position`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: key,
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({ p_email: email }),
    });
    if (!res.ok) return null;
    const n = await res.json();
    return typeof n === 'number' && n > 0 ? n : null;
  } catch {
    return null;
  }
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
): Promise<{ ok: boolean; detail?: string }> {
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
    if (res.ok) return { ok: true };
    return { ok: false, detail: `${provider} ${res.status} ${await res.text()}` };
  } catch (err) {
    return { ok: false, detail: `${provider} threw: ${String(err)}` };
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
  const links = {
    site: Deno.env.get('SITE_URL') ?? 'https://www.hudjee.com',
    telegram: Deno.env.get('TELEGRAM_URL') ?? 'https://t.me/hudjee',
  };

  let row: WaitlistRow;
  try {
    const payload = await req.json();
    row = payload.record ?? payload; // webhook sends { record: {...} }
  } catch {
    return new Response('bad payload', { status: 400 });
  }
  if (!row?.email) return new Response('no email in payload', { status: 400 });

  const position = await fetchPosition(row.email);
  const when = new Date(row.created_at ?? Date.now()).toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    dateStyle: 'medium',
    timeStyle: 'short',
  });

  // Both go out together. The student's email is the one that matters,
  // so a failure on either is logged rather than allowed to cancel the
  // other — and the webhook is not retried on a partial success, which
  // would double-send whichever one worked.
  const [welcome, notify] = await Promise.all([
    send(provider, apiKey, {
      from: welcomeFrom,
      to: row.email,
      replyTo: replyTo,
      subject: position
        ? `You're on the HudJee waitlist — #${position.toLocaleString('en-IN')}`
        : `You're on the HudJee waitlist`,
      html: welcomeHtml(row, position, links),
      text: welcomeText(row, position, links),
    }),
    send(provider, apiKey, {
      from: notifyFrom,
      to: notifyTo,
      replyTo: row.email,
      subject: `New HudJee signup — ${row.name ?? row.email}`,
      html: notifyHtml(row, position, when),
    }),
  ]);

  if (!welcome.ok) console.error('welcome email failed:', welcome.detail);
  if (!notify.ok) console.error('notify email failed:', notify.detail);

  return new Response(
    JSON.stringify({ ok: true, provider, welcome: welcome.ok, notify: notify.ok, position }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );
});
