/**
 * ══════════════════════════════════════════════════════════════════
 *  Minimal Supabase Realtime client — broadcast receive only.
 *
 *  WHY NOT @supabase/supabase-js: the official client is ~35 KB gzip
 *  and brings auth, postgrest and storage along for the ride. This
 *  page needs exactly one thing — "tell me when the waitlist count
 *  changes" — so this speaks the Phoenix channel protocol directly
 *  over a raw WebSocket. Zero dependencies.
 *
 *  Protocol, for whoever maintains this next:
 *    connect   wss://<ref>.supabase.co/realtime/v1/websocket
 *                ?apikey=<key>&vsn=1.0.0
 *    join      { topic: "realtime:<topic>", event: "phx_join", … }
 *    keepalive { topic: "phoenix", event: "heartbeat" } every 25s —
 *              the server drops a silent socket at 60s
 *    receive   { event: "broadcast",
 *                payload: { event, payload, type: "broadcast" } }
 *
 *  The channel is PUBLIC (`private: false`), so listening needs no
 *  auth handshake. Nothing sensitive is on it — the server sends one
 *  integer that the page already displays to everyone.
 * ══════════════════════════════════════════════════════════════════
 */

import { config } from './waitlist';

export const realtimeAvailable = () =>
  config.isConfigured && typeof WebSocket !== 'undefined';

type Payload = Record<string, unknown>;

export interface BroadcastOptions {
  /** Fires on every (re)connect. Use it to resync — messages sent
   *  while the socket was down were never queued for us. */
  onOpen?: () => void;
  /** Fires when the socket drops. Reconnection is automatic. */
  onClose?: () => void;
}

/**
 * Listen for one broadcast `event` on one `topic`.
 * Returns an unsubscribe function. Reconnects with exponential
 * backoff. Never throws — a dead socket degrades to a stale number,
 * which the caller's backstop poll then corrects.
 */
export function subscribeBroadcast(
  topic: string,
  event: string,
  onMessage: (payload: Payload) => void,
  opts: BroadcastOptions = {},
): () => void {
  if (!realtimeAvailable()) return () => {};

  let ws: WebSocket | null = null;
  let heartbeat = 0;
  let retries = 0;
  let stopped = false;
  let ref = 0;
  const nextRef = () => String(++ref);

  const reconnect = () => {
    if (stopped) return;
    // 1s, 2s, 4s … capped at 30s, plus jitter so a mass disconnect
    // doesn't come back as a thundering herd.
    const delay = Math.min(1000 * 2 ** retries++, 30_000) + Math.random() * 400;
    window.setTimeout(connect, delay);
  };

  const connect = () => {
    if (stopped) return;

    const base = config.url.replace(/^http/, 'ws');
    try {
      ws = new WebSocket(
        `${base}/realtime/v1/websocket?apikey=${encodeURIComponent(config.key)}&vsn=1.0.0`,
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
            /* `access_token` is the slot for a user JWT. A legacy anon
               key is one, so it goes here; a publishable key is not and
               would be rejected. The apikey query param has already
               authenticated the socket either way. */
            ...(config.keyIsJwt ? { access_token: config.key } : {}),
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
      try {
        onMessage((outer.payload ?? outer) as Payload);
      } catch {
        /* a throwing handler must not take the socket with it */
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

  /* Browsers freeze sockets in background tabs and some mobile
     browsers close them outright. Nudge a reconnect on return. */
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
