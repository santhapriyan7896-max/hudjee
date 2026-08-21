/**
 * ══════════════════════════════════════════════════════════════════
 *  Waitlist — the only module that talks to Supabase.
 *
 *  The page posts straight to PostgREST from the browser using the
 *  public key. That's safe *because* of how the table is locked down,
 *  not in spite of it: `waitlist` has an insert-only RLS policy,
 *  column grants on exactly four columns, and no select policy at
 *  all. The key can add a row and nothing else — it cannot read the
 *  list back, edit it, or delete from it. See supabase/waitlist.sql.
 *
 *  Counts and queue positions come from two SECURITY DEFINER
 *  functions that each return a single integer, so the table stays
 *  unreadable while the page still gets its numbers.
 *
 *  ── The rule this module is built around ────────────────────────
 *  Never report a success we did not observe.
 *
 *  The version this replaces faked a success whenever Supabase was
 *  unconfigured — "handy for design review". That one decision hid a
 *  complete outage behind a green tick for days: real people filled
 *  in the form, saw "You're on the list", and were never on the list.
 *  Every failure below now returns a distinct, nameable status, and
 *  the caller is expected to show it.
 * ══════════════════════════════════════════════════════════════════
 */

/* ── Configuration ─────────────────────────────────────────────────
   Both values are compiled in at build time by Astro, which means a
   change to them requires a rebuild, not just a restart — and that
   they must be set on the *host*, not only in a local .env. */

const RAW_URL = String(import.meta.env.PUBLIC_SUPABASE_URL ?? '').trim();
const RAW_KEY = String(import.meta.env.PUBLIC_SUPABASE_ANON_KEY ?? '').trim();

/**
 * The dashboard shows two URLs and one of them is a trap: a bare
 * Project URL, and a "RESTful endpoint" already ending in `/rest/v1`.
 * Every call here appends its own path, so pasting the endpoint
 * produces `/rest/v1/rest/v1/rpc/...` — a 404 that reads exactly like
 * a missing database function, and a websocket that fails auth.
 *
 * Cheaper to accept both than to document the difference.
 */
const URL_ = RAW_URL.replace(/\/+$/, '').replace(/\/rest\/v1$/, '').replace(/\/+$/, '');

/**
 * Supabase is mid-migration between key formats:
 *   legacy   `anon` — a JWT, starts "eyJ", retired end of 2026
 *   current  `sb_publishable_…` — an opaque string
 *
 * They go in different places. A JWT may also ride in the
 * `Authorization: Bearer` header; an opaque key may not, because that
 * header is where a *user's* token goes. Both belong in `apikey`.
 */
const KEY_IS_JWT = /^eyJ[\w-]+\./.test(RAW_KEY);

export const config = {
  url: URL_,
  key: RAW_KEY,
  keyIsJwt: KEY_IS_JWT,
  isConfigured: Boolean(URL_ && RAW_KEY),
} as const;

const headers = (extra: Record<string, string> = {}): Record<string, string> => {
  const h: Record<string, string> = { apikey: RAW_KEY, ...extra };
  if (KEY_IS_JWT) h.Authorization = `Bearer ${RAW_KEY}`;
  return h;
};

/* ── Diagnostics ───────────────────────────────────────────────────
   Every failure path says what broke and what to do about it, once.
   A silent null is what made the last bug take days to find. */

const warned = new Set<string>();
export function explain(key: string, message: string) {
  if (warned.has(key)) return;
  warned.add(key);
  console.warn(`[waitlist] ${message}`);
}

const MISSING_ENV =
  'PUBLIC_SUPABASE_URL and PUBLIC_SUPABASE_ANON_KEY are not in this build. ' +
  'They are compiled in at build time, so setting them in a local .env is not enough — ' +
  'add both to your host (Vercel → Settings → Environment Variables, Production) and redeploy.';

/* ── Types ─────────────────────────────────────────────────────────
   A union, not a boolean. The caller has to handle each case, and
   the compiler makes sure it does. */

export interface WaitlistEntry {
  name: string;
  email: string;
  batch: string | null;
  source: string;
}

export type SubmitResult =
  /** The row is in the database. `position` is best-effort. */
  | { status: 'joined'; position: number | null }
  /** This address is already on the list. Not a failure. */
  | { status: 'duplicate' }
  /** Reached Supabase; it refused. Almost always a setup problem. */
  | { status: 'rejected'; http: number; detail: string }
  /** Never reached Supabase — offline, DNS, blocked. Retrying may work. */
  | { status: 'offline' }
  /** This build has no Supabase credentials. Nothing can work. */
  | { status: 'unconfigured' };

export type CountResult =
  | { ok: true; count: number }
  | { ok: false; why: 'unconfigured' | 'http' | 'offline' | 'shape' };

/* ── Validation ────────────────────────────────────────────────────
   Deliberately loose. An address that looks odd but is real must get
   through; the confirmation email is the real validator. The only
   job here is catching typos before a round trip. */

export const isValidEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim());

/* ── Join ──────────────────────────────────────────────────────────── */

export async function submitWaitlist(entry: WaitlistEntry): Promise<SubmitResult> {
  if (!config.isConfigured) {
    explain('env', MISSING_ENV);
    return { status: 'unconfigured' };
  }

  const email = entry.email.trim();
  const name = entry.name.trim();

  let res: Response;
  try {
    res = await fetch(`${URL_}/rest/v1/waitlist`, {
      method: 'POST',
      headers: headers({ 'Content-Type': 'application/json', Prefer: 'return=minimal' }),
      body: JSON.stringify({
        name: name || null,
        email,
        batch: entry.batch || null,
        source: entry.source,
      }),
    });
  } catch {
    // fetch() only rejects when the request never completed.
    return { status: 'offline' };
  }

  if (res.ok) {
    const position = await fetchPosition(email);
    /* The insert reported success but the row is invisible to a
       function that counts every row. That shouldn't be possible —
       worth a line in the console if it ever happens. */
    if (position === null) {
      explain(
        'no-position',
        'The signup was accepted but waitlist_position() could not find it. ' +
          'If this repeats, check that supabase/waitlist.sql ran completely.',
      );
    }
    return { status: 'joined', position };
  }

  // 409 = unique violation on email. They're already in — not an error.
  if (res.status === 409) return { status: 'duplicate' };

  const detail = await res.text().catch(() => '');
  explain(
    `insert-${res.status}`,
    `Signup rejected with HTTP ${res.status}. ` +
      (res.status === 404
        ? 'The `waitlist` table does not exist — run supabase/waitlist.sql.'
        : res.status === 401 || res.status === 403
          ? 'Row-level security refused the insert. Re-run supabase/waitlist.sql, which creates the policy and the column grants.'
          : `Supabase said: ${detail.slice(0, 300)}`),
  );
  return { status: 'rejected', http: res.status, detail };
}

/* ── Numbers ───────────────────────────────────────────────────────── */

/** Shared plumbing for the two integer-returning RPCs. */
async function callRpc(fn: string, body: unknown): Promise<CountResult> {
  if (!config.isConfigured) {
    explain('env', MISSING_ENV);
    return { ok: false, why: 'unconfigured' };
  }

  let res: Response;
  try {
    res = await fetch(`${URL_}/rest/v1/rpc/${fn}`, {
      method: 'POST',
      headers: headers({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(body),
    });
  } catch {
    return { ok: false, why: 'offline' };
  }

  if (!res.ok) {
    explain(
      `${fn}-${res.status}`,
      `${fn}() returned HTTP ${res.status}. ` +
        (res.status === 404
          ? 'That function does not exist yet — run supabase/waitlist.sql in the Supabase SQL editor.'
          : res.status === 401 || res.status === 403
            ? 'The public role cannot execute it — re-run supabase/waitlist.sql, which includes the grant.'
            : 'Check the Supabase logs.'),
    );
    return { ok: false, why: 'http' };
  }

  const value = await res.json().catch(() => null);
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    explain(`${fn}-shape`, `${fn}() returned ${JSON.stringify(value)}, expected a number.`);
    return { ok: false, why: 'shape' };
  }
  return { ok: true, count: value };
}

/** Total signups. Drives the live counter. */
export async function fetchWaitlistCount(): Promise<CountResult> {
  return callRpc('waitlist_count', {});
}

/**
 * Queue position for one address. Always best-effort — it decorates
 * the confirmation, it never gates it, so a failure returns null
 * rather than a status the caller has to handle.
 */
export async function fetchPosition(email: string): Promise<number | null> {
  const r = await callRpc('waitlist_position', { p_email: email.trim() });
  return r.ok && r.count > 0 ? r.count : null;
}
