/**
 * ────────────────────────────────────────────────────────────────
 *  Waitlist submission.
 *
 *  Posts straight to Supabase from the browser using the anon key.
 *  This is safe *only* because the `waitlist` table has an
 *  insert-only RLS policy and no select policy — see
 *  supabase/waitlist.sql. Nobody can read the list back with this
 *  key, they can only add to it.
 *
 *  With no env vars set, runs in demo mode: fakes a success after a
 *  short delay and makes no network call.
 * ────────────────────────────────────────────────────────────────
 */

const RAW_URL = import.meta.env.PUBLIC_SUPABASE_URL;
const KEY = import.meta.env.PUBLIC_SUPABASE_ANON_KEY;

/**
 * Everything here builds its own path onto the project origin, so the
 * base must be just `https://<ref>.supabase.co`.
 *
 * The dashboard shows two URLs though, and the second one is a trap: a
 * bare Project URL, and a "RESTful endpoint" that already ends in
 * `/rest/v1`. Paste the endpoint and every request comes out doubled —
 * `/rest/v1/rest/v1/rpc/waitlist_count` — which 404s and reads exactly
 * like a missing database function. The websocket lands on
 * `/rest/v1/realtime/v1/websocket` and fails auth for the same reason.
 *
 * Rather than make that a documentation problem, accept either form.
 */
const URL_ = String(RAW_URL ?? '')
  .trim()
  .replace(/\/+$/, '')            // trailing slashes
  .replace(/\/rest\/v1$/, '')     // the RESTful-endpoint suffix
  .replace(/\/+$/, '');

/** The normalised project origin — the realtime client needs it too. */
export const supabaseUrl = () => URL_;

export const isConfigured = Boolean(URL_ && KEY);

/**
 * Supabase is mid-migration between two key formats:
 *
 *   legacy      anon / service_role — JWTs, start "eyJ", deprecated end of 2026
 *   current     sb_publishable_… / sb_secret_… — opaque strings
 *
 * The difference matters here: a publishable key must NOT be sent as
 * `Authorization: Bearer …`, because that header is where a *user's*
 * JWT goes and an opaque key isn't one. Sending it there gets the
 * request rejected. Both formats belong in the `apikey` header.
 *
 * So: detect the shape and send the right headers. This works today with
 * a legacy anon key and keeps working when you rotate to a publishable
 * one, without another code change.
 */
const isJwtKey = /^eyJ[\w-]+\./.test(String(KEY ?? ''));

const authHeaders = (extra: Record<string, string> = {}): Record<string, string> => {
  const h: Record<string, string> = { apikey: String(KEY), ...extra };
  if (isJwtKey) h.Authorization = `Bearer ${KEY}`;
  return h;
};

/** The realtime client needs the same distinction. */
export const supabaseKeyIsJwt = () => isJwtKey;

export interface WaitlistEntry {
  name: string;
  email: string;
  batch: string | null;
  source: string;
}

export type SubmitResult =
  | { ok: true; position: number | null }
  | { ok: false; reason: 'duplicate' | 'network' };

export async function submitWaitlist(entry: WaitlistEntry): Promise<SubmitResult> {
  if (!isConfigured) {
    await new Promise((r) => setTimeout(r, 700));
    console.info('[waitlist] demo mode — no endpoint configured:', entry);
    return { ok: true, position: null };
  }

  try {
    const res = await fetch(`${URL_}/rest/v1/waitlist`, {
      method: 'POST',
      headers: authHeaders({
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      }),
      body: JSON.stringify({
        name: entry.name,
        email: entry.email,
        batch: entry.batch,
        source: entry.source,
      }),
    });

    if (res.ok) return { ok: true, position: await fetchPosition(entry.email) };
    // 409 = unique violation on email — already signed up.
    if (res.status === 409) return { ok: false, reason: 'duplicate' };
    return { ok: false, reason: 'network' };
  } catch {
    return { ok: false, reason: 'network' };
  }
}

export const isValidEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim());

/**
 * Queue position, via a security-definer RPC that returns only a count.
 * The table itself stays unreadable with the anon key. Returns null on
 * any failure — position is a nice-to-have, never a blocker.
 */
async function fetchPosition(email: string): Promise<number | null> {
  try {
    const res = await fetch(`${URL_}/rest/v1/rpc/waitlist_position`, {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ p_email: email }),
    });
    if (!res.ok) return null;
    const n = await res.json();
    return typeof n === 'number' ? n : null;
  } catch {
    return null;
  }
}

/**
 * One warning per distinct problem. The counter polls forever, so an
 * unguarded console.warn would bury the page's own logs.
 */
const warned = new Set<string>();
const warnOnce = (key: string, msg: string) => {
  if (warned.has(key)) return;
  warned.add(key);
  console.warn(msg);
};

/**
 * Total signups, via a security-definer RPC returning a single int.
 * Same reasoning as fetchPosition: the table stays unreadable with the
 * anon key. Returns null when unconfigured or on any failure.
 *
 * A null used to be silent, which made "the counter shows 0" impossible
 * to tell apart from "nobody has signed up". Each failure path now says
 * what's wrong and what to do about it — open DevTools and the page
 * diagnoses itself.
 */
export async function fetchWaitlistCount(): Promise<number | null> {
  if (!isConfigured) {
    warnOnce(
      'env',
      '[waitlist] No PUBLIC_SUPABASE_URL / PUBLIC_SUPABASE_ANON_KEY in this build. ' +
        'The form is in DEMO MODE — signups are faked and nothing is saved. ' +
        'Set both env vars on your host (not just in local .env) and redeploy: ' +
        'they are compiled in at build time.',
    );
    return null;
  }
  try {
    const res = await fetch(`${URL_}/rest/v1/rpc/waitlist_count`, {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: '{}',
    });
    if (!res.ok) {
      warnOnce(
        `rpc-${res.status}`,
        `[waitlist] waitlist_count() returned HTTP ${res.status}. ` +
          (res.status === 404
            ? 'That function does not exist yet — run supabase/waitlist.sql in the Supabase SQL editor.'
            : res.status === 401 || res.status === 403
              ? 'The anon role cannot execute it — re-run supabase/waitlist.sql, which includes the grant.'
              : 'Check Supabase logs.'),
      );
      return null;
    }
    const n = await res.json();
    if (typeof n !== 'number') {
      warnOnce('rpc-shape', `[waitlist] waitlist_count() returned ${JSON.stringify(n)}, expected a number.`);
      return null;
    }
    return n;
  } catch (err) {
    warnOnce('rpc-net', `[waitlist] Could not reach Supabase for the counter: ${String(err)}`);
    return null;
  }
}
