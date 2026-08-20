/**
 * ────────────────────────────────────────────────────────────────
 *  Minimal Supabase Realtime client — broadcast receive only.
 *
 *  WHY NOT @supabase/supabase-js: the official client is ~35 KB gzip
 *  and brings auth, postgrest and storage along for the ride. This
 *  page needs exactly one thing — "tell me when the waitlist count
 *  changes" — so this speaks the Phoenix channel protocol directly
 *  over a raw WebSocket. ~70 lines, zero dependencies.
 *
 *  Protocol, for anyone maintaining this:
 *    connect  wss://<ref>.supabase.co/realtime/v1/websocket
 *               ?apikey=<anon>&vsn=1.0.0
 *    join     { topic: "realtime:<topic>", event: "phx_join", ... }
 *    keepalive{ topic: "phoenix", event: "heartbeat" } every 25s —
 *             the server drops the socket at 60s of silence
 *    receive  { event: "broadcast",
 *               payload: { event, payload, type: "broadcast" } }
 *
 *  The channel is PUBLIC (`private: false`), so no auth handshake is
 *  needed to listen. Nothing sensitive travels on it — the server
 *  broadcasts a single integer. See supabase/waitlist.sql.
 * ────────────────────────────────────────────────────────────────
 */

const URL_ = import.meta.env.PUBLIC_SUPABASE_URL;
const KEY = import.meta.env.PUBLIC_SUPABASE_ANON_KEY;

export const realtimeAvailable = Boolean(URL_ && KEY && typeof WebSocket !== 'undefined');

type Payload = Record<string, unknown>;

export interface BroadcastOptions {
  /** Fires whenever the socket (re)connects — use it to resync state. */
  onOpen?: () => void;
  /** Fires when the socket drops. The client reconnects on its own. */
  onClose?: () => void;
}

/**
 * Listen for one broadcast `event` on one `topic`.
 * Returns an unsubscribe function. Reconnects with exponential
 * backoff; never throws.
 */
export function subscribeBroadcast(
  topic: string,
  event: string,
  onMessage: (payload: Payload) => void,
  opts: BroadcastOptions = {},
): () => void {
  if (!realtimeAvailable) return () => {};

  let ws: WebSocket | null = null;
  let heartbeat = 0;
  let retries = 0;
  let stopped = false;
  let ref = 0;
  const nextRef = () => String(++ref);

  const reconnect = () => {
    if (stopped) return;
    // 1s, 2s, 4s … capped at 30s, with jitter so a mass disconnect
    // doesn't come back as a thundering herd.
    const delay = Math.min(1000 * 2 ** retries++, 30_000) + Math.random() * 400;
    window.setTimeout(connect, delay);
  };

  const connect = () => {
    if (stopped) return;

    const base = String(URL_).replace(/^http/, 'ws').replace(/\/+$/, '');
    try {
      ws = new WebSocket(
        `${base}/realtime/v1/websocket?apikey=${encodeURIComponent(String(KEY))}&vsn=1.0.0`,
      );
    } catch {
      reconnect();
      return;
    }

    ws.onopen = () => {
      retries = 0;
      const joinRef = nextRef();
      ws?.send(
        JSON.stringify({
          topic: `realtime:${topic}`,
          event: 'phx_join',
          ref: joinRef,
          join_ref: joinRef,
          payload: {
            config: {
              broadcast: { self: false, ack: false },
              presence: { key: '' },
              private: false,
            },
            access_token: KEY,
          },
        }),
      );

      window.clearInterval(heartbeat);
      heartbeat = window.setInterval(() => {
        if (ws?.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ topic: 'phoenix', event: 'heartbeat', payload: {}, ref: nextRef() }));
        }
      }, 25_000);

      opts.onOpen?.();
    };

    ws.onmessage = (e) => {
      let msg: any;
      try {
        msg = JSON.parse(String(e.data));
      } catch {
        return;
      }
      if (msg?.event !== 'broadcast') return;
      const outer = msg.payload ?? {};
      // realtime.send() nests the user payload one level down.
      if (outer.event && outer.event !== event) return;
      const body = (outer.payload ?? outer) as Payload;
      try {
        onMessage(body);
      } catch {
        /* a bad handler must not kill the socket */
      }
    };

    ws.onerror = () => ws?.close();

    ws.onclose = () => {
      window.clearInterval(heartbeat);
      opts.onClose?.();
      reconnect();
    };
  };

  connect();

  // Browsers freeze sockets in background tabs and some mobile
  // browsers kill them outright. Nudge a reconnect on return.
  const onVisible = () => {
    if (!document.hidden && ws && ws.readyState > WebSocket.OPEN) {
      retries = 0;
      connect();
    }
  };
  document.addEventListener('visibilitychange', onVisible);

  return () => {
    stopped = true;
    document.removeEventListener('visibilitychange', onVisible);
    window.clearInterval(heartbeat);
    ws?.close();
  };
}
