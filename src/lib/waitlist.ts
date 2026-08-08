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

const URL_ = import.meta.env.PUBLIC_SUPABASE_URL;
const KEY = import.meta.env.PUBLIC_SUPABASE_ANON_KEY;

export const isConfigured = Boolean(URL_ && KEY);

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
      headers: {
        'Content-Type': 'application/json',
        apikey: KEY,
        Authorization: `Bearer ${KEY}`,
        Prefer: 'return=minimal',
      },
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
      headers: {
        'Content-Type': 'application/json',
        apikey: KEY,
        Authorization: `Bearer ${KEY}`,
      },
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
 * Total signups, via a security-definer RPC returning a single int.
 * Same reasoning as fetchPosition: the table stays unreadable with the
 * anon key. Returns null when unconfigured or on any failure.
 */
export async function fetchWaitlistCount(): Promise<number | null> {
  if (!isConfigured) return null;
  try {
    const res = await fetch(`${URL_}/rest/v1/rpc/waitlist_count`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: KEY,
        Authorization: `Bearer ${KEY}`,
      },
      body: '{}',
    });
    if (!res.ok) return null;
    const n = await res.json();
    return typeof n === 'number' ? n : null;
  } catch {
    return null;
  }
}
