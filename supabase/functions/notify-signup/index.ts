/**
 * ──────────────────────────────────────────────────────────────────
 *  notify-signup — emails hudjee26@gmail.com on every waitlist entry.
 *
 *  Triggered by a Supabase Database Webhook on INSERT into
 *  public.waitlist. Runs on Supabase Edge Functions (Deno).
 *
 *  WHY A FUNCTION AND NOT THE BROWSER: sending mail needs a provider
 *  API key. Anything the landing page can read, a visitor can read —
 *  so the key lives here as a secret and the page never sees it.
 *  This also means the email can't be forged by hitting an endpoint
 *  directly; it only fires on a real row insert.
 *
 *  Secrets required (supabase secrets set ...):
 *    RESEND_API_KEY   from resend.com
 *    NOTIFY_TO        hudjee26@gmail.com
 *    NOTIFY_FROM      e.g. "HudJee <onboarding@resend.dev>"
 *    WEBHOOK_SECRET   any long random string, also set on the webhook
 * ──────────────────────────────────────────────────────────────────
 */

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

const esc = (v: unknown) =>
  String(v ?? '—')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response('method not allowed', { status: 405 });
  }

  // Shared secret so only the database webhook can invoke this.
  const expected = Deno.env.get('WEBHOOK_SECRET');
  if (expected && req.headers.get('x-webhook-secret') !== expected) {
    return new Response('unauthorized', { status: 401 });
  }

  const apiKey = Deno.env.get('RESEND_API_KEY');
  const to = Deno.env.get('NOTIFY_TO') ?? 'hudjee26@gmail.com';
  const from = Deno.env.get('NOTIFY_FROM') ?? 'HudJee <onboarding@resend.dev>';
  if (!apiKey) {
    console.error('RESEND_API_KEY is not set');
    return new Response('not configured', { status: 500 });
  }

  let row: WaitlistRow;
  try {
    const payload = await req.json();
    row = payload.record ?? payload; // webhook sends { record: {...} }
  } catch {
    return new Response('bad payload', { status: 400 });
  }
  if (!row?.email) return new Response('no email in payload', { status: 400 });

  const batch = row.batch ? (BATCH_LABELS[row.batch] ?? row.batch) : 'Not specified';
  const when = new Date(row.created_at ?? Date.now()).toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    dateStyle: 'medium',
    timeStyle: 'short',
  });

  const html = `
  <div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;background:#0A0A0C;padding:28px;color:#fff">
    <div style="max-width:520px;margin:0 auto;background:#131217;border:1px solid #27262B;border-radius:22px;padding:26px">
      <div style="font-size:11px;letter-spacing:1.6px;text-transform:uppercase;font-weight:800;
                  background:linear-gradient(90deg,#7B68E8,#C9A17C);-webkit-background-clip:text;
                  background-clip:text;color:transparent">New waitlist signup</div>
      <h1 style="margin:10px 0 22px;font-size:24px;font-weight:900;color:#fff">${esc(row.name)}</h1>
      <table style="width:100%;border-collapse:collapse;font-size:14px">
        <tr><td style="padding:9px 0;color:#75787F;width:104px">Email</td>
            <td style="padding:9px 0;color:#fff;font-weight:700">${esc(row.email)}</td></tr>
        <tr><td style="padding:9px 0;color:#75787F">Batch</td>
            <td style="padding:9px 0;color:#fff;font-weight:700">${esc(batch)}</td></tr>
        <tr><td style="padding:9px 0;color:#75787F">Source</td>
            <td style="padding:9px 0;color:#fff;font-weight:700">${esc(row.source)}</td></tr>
        <tr><td style="padding:9px 0;color:#75787F">Joined</td>
            <td style="padding:9px 0;color:#fff;font-weight:700">${esc(when)} IST</td></tr>
      </table>
    </div>
  </div>`;

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from,
      to: [to],
      reply_to: row.email,
      subject: `New HudJee signup — ${row.name ?? row.email}`,
      html,
    }),
  });

  if (!res.ok) {
    const detail = await res.text();
    console.error('resend failed', res.status, detail);
    return new Response('send failed', { status: 502 });
  }
  return new Response(JSON.stringify({ ok: true }), {
    headers: { 'Content-Type': 'application/json' },
  });
});
