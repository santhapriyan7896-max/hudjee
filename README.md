# HudJee — Waitlist landing page

Astro 5, static output, no UI framework. The only JavaScript that ships is the
scroll engine (~6 KB) plus the form handler (~2 KB) — there is no framework
runtime, because nothing on this page needs to re-render.

### Theme

`src/styles/tokens/colors|typography|spacing.css` are copied verbatim from the
design-system export. **`src/styles/tokens/theme-app.css` is imported after them
and overrides the parts the shipped app has moved past** — it was sampled
directly from the live dashboard:

| | Design-system export | Shipped app (current) |
|---|---|---|
| Page | `#000000` | `#0A0A0C` |
| Card | `#141414` / `#1B1B20` | `#131217` + 1px `#27262B` |
| Signature | mint→cyan `#69EAC0 → #40C9FF`, used as a **fill** | purple→amber `#7B68E8 → #C9A17C`, used as a **stroke** |
| Depth | 5–6px pressed border-bottom | flat, hairline border |
| Radii | 16–24px | 14 / 18 / 22px |

Edit `theme-app.css`, not the DS files. When the design system is re-exported
with the new theme, fold `theme-app.css` back into `colors.css` and delete it.

---

## Quick start

```bash
npm install
npm run dev      # http://localhost:4321
npm run build    # → dist/
npm run preview  # serve dist/ locally
```

`dist/` is plain static HTML — it can be hosted anywhere.

---

## Where to change things

| I want to… | Edit |
|---|---|
| Change any wording, add/remove an FAQ, a step, a feature, a stat | `src/data/site.ts` — **all copy lives here** |
| Change colours, radii, the gradient | `src/styles/tokens/theme-app.css` |
| Change the type scale or spacing steps | `src/styles/tokens/typography.css`, `spacing.css` |
| Change shared buttons, cards, tags, progress bars | `src/styles/global.css` |
| Change a section's layout | that section's `.astro` file in `src/components/` |
| Tune the scroll animations | `src/scripts/scroll.ts` |
| Change what the phone shows | `src/components/PhoneScreens.astro` — screen 3 is a rebuild of the live Home dashboard |
| Change the domain, OG tags, sitemap | `astro.config.mjs` (`site`) + `src/data/site.ts` (`meta`) |

You should not need to touch markup to change words. That's the point of
`site.ts`.

---

## Connecting the waitlist

Without env vars the form runs in **demo mode**: it fakes a success after
~400 ms and makes no network call. Useful for design review.

To go live:

1. Run `supabase/waitlist.sql` in the Supabase SQL editor. It creates the table,
   an insert-only RLS policy, the two RPCs the page reads, and the broadcast
   trigger behind the live counter. **It is idempotent** — safe to paste and run
   again on a project that already has some of this.

   The last statement in that file prints a checklist. Every row should say
   `OK`; anything else names what's missing:

   ```
   thing                        status
   ───────────────────────────  ─────────────────────────────
   waitlist table               OK
   row-level security           OK — enabled
   waitlist_count() rpc         OK — counter will work
   waitlist_position() rpc      OK
   anon can read rows?          OK — insert only
   realtime broadcast trigger   OK — counter updates live
   realtime.send available      OK
   signups so far               0
   ```

2. Copy `.env.example` to `.env` and fill in:

   ```
   PUBLIC_SUPABASE_URL=https://xxxxxxxx.supabase.co
   PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOi...
   ```

3. Rebuild. Set the same two variables in your host's dashboard.

**On the anon key being public:** it is public by design. The `waitlist` table
has an insert policy and no select policy, so this key can add a row and
nothing else — it cannot read the list back, edit it, or delete from it. Read
signups from the Supabase dashboard or with the service-role key, which never
touches this repo.

There is also a honeypot field (`company`) — bots fill it, humans never see it,
and a filled honeypot silently no-ops.

### Signup emails

Every signup sends **two** emails from one Edge Function:

| To | What |
|---|---|
| The student | A welcome from `hello@hudjee.com` with their queue position, what happens next, and the Telegram link |
| hudjee26@gmail.com | A notification so you see signups without opening the dashboard |

Sent through **Brevo** — see [why](#why-brevo-and-not-resend) below; the
function also speaks Resend and switches on one env var.

This has to run server-side — sending mail needs a provider API key, and
anything the landing page can read, a visitor can read. So it lives in a
Supabase Edge Function that fires on insert, and the page never touches the key.

#### Why Brevo and not Resend

Resend verifies a domain with an **MX record on a subdomain** (`send.hudjee.com`)
— that's its bounce return-path, and it's what makes SPF align. **Wix's DNS
manager cannot create MX records on subdomains**, and hudjee.com is registered
at Wix, which also refuses to let you change nameservers. So Resend is
unreachable until the domain comes off its transfer lock and DNS moves
elsewhere.

Brevo authenticates with **TXT and CNAME records only** — no MX — so it works on
Wix DNS as it stands. Free tier is 300 emails/day; each signup costs 2, so
that's ~150 signups/day.

`notify-signup` speaks to both. It picks whichever API key is set, so the
switch back later is one command and no code change:

```bash
npx supabase secrets unset BREVO_API_KEY   # Resend takes over
```

Force either one explicitly with `EMAIL_PROVIDER=brevo|resend`.

#### Setup

1. **Get a Brevo key.** Sign up at [brevo.com](https://www.brevo.com), then
   *SMTP & API → API Keys → Generate*. It starts with `xkeysib-`.

2. **Authenticate hudjee.com** — *Senders, Domains & Dedicated IPs → Domains →
   Add a domain*. Brevo gives you three records to add in the Wix DNS manager
   (*Domains → hudjee.com → DNS Records*):

   | Type | Host | Why |
   |---|---|---|
   | TXT | `@` | `brevo-code…` — proves you own the domain |
   | TXT or CNAME | `mail._domainkey` | DKIM — signs the mail so it isn't spoofable |
   | TXT | `_dmarc` | DMARC policy |

   **Leave your existing root MX records alone** — those are ImprovMX, and
   they're what makes `hello@hudjee.com` receive. Brevo doesn't need MX and
   doesn't touch them. Same for your existing SPF: Brevo uses its own
   return-path domain, so DMARC passes on DKIM alignment and your ImprovMX SPF
   record stays as it is.

3. **Set the secrets:**

   ```bash
   npx supabase login
   npx supabase link --project-ref <your-project-ref>
   npx supabase secrets set \
     BREVO_API_KEY=xkeysib-xxxxxxxx \
     WELCOME_FROM="HudJee <hello@hudjee.com>" \
     NOTIFY_FROM="HudJee <hello@hudjee.com>" \
     NOTIFY_TO=hudjee26@gmail.com \
     REPLY_TO=hello@hudjee.com \
     WEBHOOK_SECRET=<any long random string>
   ```

   Optional: `SITE_URL` and `TELEGRAM_URL` override the links in the welcome
   email; they default to `https://www.hudjee.com` and `https://t.me/hudjee`.

4. **Deploy the function:**

   ```bash
   npx supabase functions deploy notify-signup
   ```

5. **Point a webhook at it.** In the Supabase dashboard:
   *Database → Webhooks → Create a new hook* — table `waitlist`, event
   `Insert`, type *Supabase Edge Function*, function `notify-signup`, and add
   the HTTP header `x-webhook-secret` with the same value you set above. (A
   SQL version of this trigger is commented at the bottom of
   `supabase/waitlist.sql` if you prefer.)

Test it by submitting the form with your own address — you should get the
welcome, and hudjee26@gmail.com should get the notification. If either is
missing, *Edge Functions → notify-signup → Logs* says which one failed and why.
The function returns `{"provider":"brevo","welcome":true,"notify":true}` on a
clean run — `provider` tells you which service actually sent. A partial
failure is logged but still returns 200, deliberately, so the webhook doesn't
retry and double-send whichever email did work.

**Prefer no backend at all?** A form-to-email service like Formspree or
Web3Forms can be POSTed straight from `src/lib/waitlist.ts` — but then you
lose the signup count, the queue position, the welcome email, and the stored
list.

### The live counter

The number next to the avatars is real, and it moves **live** — an insert
trigger broadcasts the new total on a public Realtime channel, so every open
tab updates the moment anybody joins, anywhere. It starts at zero and counts up
as real people join.

The websocket client is hand-rolled in `src/lib/realtime.ts` (~70 lines,
Phoenix channel protocol) rather than `@supabase/supabase-js`, which would be
~35 KB of client to watch one integer. The whole form + counter bundle is
**2.4 KB gzipped**.

Three things back it up when push can't get through — a proxy that blocks
websockets, a mobile browser that killed the socket in the background, or a row
you inserted straight from the dashboard:

- the socket reconnects with exponential backoff and re-fetches on reconnect
- a slow poll (`pollMs`, default 60s) runs regardless, paused while the tab is hidden
- your own signup bumps the number optimistically, then self-corrects from the broadcast

Configured in `src/data/site.ts` under `socialProof`:

| | |
|---|---|
| `offset` | added to the real count. `0` shows the truth |
| `minToShow` | hides the row below this count. `0` = always show |
| `realtime` | `true` = websocket push. Needs the broadcast trigger from `waitlist.sql` |
| `pollMs` | backstop interval. Keep slow (60s) with realtime on; drop to ~15s if you turn it off |

If the number sits at 0 with real signups in the table, it's almost always one
of: the SQL was never run (no `waitlist_count()` to call), or the two
`PUBLIC_SUPABASE_*` env vars aren't set **on the host** as well as locally —
they're baked in at build time, so the site needs a rebuild after adding them.

---

## Deploying

Both hosts auto-detect Astro; build command `npm run build`, output `dist`.

- **Vercel** — import the repo, add the two env vars, deploy.
- **Cloudflare Pages** — same, framework preset "Astro".

Free tier on either is comfortably enough for a waitlist page.

Before launch, set `site` in `astro.config.mjs` to the real domain — it drives
canonical URLs, OG tags and `sitemap-index.xml`.

---

## Motion

Five scroll-driven sequences, all in `src/scripts/scroll.ts`, all running off a
single `requestAnimationFrame` loop:

1. **Hero** — the camera pushes through the headline; it scales, blurs and fades
   while the maths glyphs parallax at different rates.
2. **Device stage** (`#stage`, 420vh) — the phone zooms from 0.32× to full in 3D
   while cycling four screens; HUD chips fly in; the score gauge and counter are
   wired to scroll position, so scrubbing backwards counts the score down.
3. **5:00 AM** (`#dawn`, 260vh) — the time scales 0.55× → 2.3× straight past the
   viewport behind three counter-rotating rings.
4. **Features** (`#feat`, 460vh) — vertical scroll drives a horizontal card track.
5. **Score factors** — bars fill as the block enters view.

Section heights (`420vh`, `260vh`, `460vh`) set how long each pinned sequence
lasts. Increase for a slower, longer scrub.

`prefers-reduced-motion` is fully handled: every pin unwraps into a normal
stacked section and all motion is disabled.

---

## Structure

```
src/
├─ data/site.ts            ← all copy, one file
├─ layouts/Layout.astro    ← <head>, fonts, meta
├─ pages/index.astro       ← section order
├─ components/             ← one file per section
├─ scripts/scroll.ts       ← the scroll engine
├─ lib/waitlist.ts         ← form submission
├─ lib/realtime.ts         ← 70-line websocket client for the live counter
└─ styles/
   ├─ global.css           ← primitives built on the tokens
   └─ tokens/
      ├─ colors|typography|spacing.css  ← verbatim from the DS export
      └─ theme-app.css                  ← live-app overrides (edit this)
supabase/
├─ waitlist.sql            ← table, RLS, RPCs, broadcast trigger, checklist
└─ functions/notify-signup ← welcome email + your notification
```
