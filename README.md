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
   an insert-only RLS policy, and a `waitlist_summary` view.
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

### Getting signups emailed to you

Every signup emails **hudjee26@gmail.com**. This has to run server-side —
sending mail needs a provider API key, and anything the landing page can read,
a visitor can read. So it lives in a Supabase Edge Function that fires on
insert, and the page never touches the key.

1. **Get a Resend key.** Sign up at [resend.com](https://resend.com) (free tier
   is 3,000 emails/month). Copy the API key. You can send from
   `onboarding@resend.dev` immediately; to send from `@hudjee.app` you'll need
   to verify the domain there first.

2. **Set the secrets:**

   ```bash
   npx supabase login
   npx supabase link --project-ref <your-project-ref>
   npx supabase secrets set \
     RESEND_API_KEY=re_xxxxxxxx \
     NOTIFY_TO=hudjee26@gmail.com \
     NOTIFY_FROM="HudJee <onboarding@resend.dev>" \
     WEBHOOK_SECRET=<any long random string>
   ```

3. **Deploy the function:**

   ```bash
   npx supabase functions deploy notify-signup
   ```

4. **Point a webhook at it.** In the Supabase dashboard:
   *Database → Webhooks → Create a new hook* — table `waitlist`, event
   `Insert`, type *Supabase Edge Function*, function `notify-signup`, and add
   the HTTP header `x-webhook-secret` with the same value you set above. (A
   SQL version of this trigger is commented at the bottom of
   `supabase/waitlist.sql` if you prefer.)

Test it by submitting the form. If nothing arrives, check
*Edge Functions → notify-signup → Logs* in the dashboard.

**Prefer no backend at all?** A form-to-email service like Formspree or
Web3Forms can be POSTed straight from `src/lib/waitlist.ts` — but then you
lose the signup count, the queue position, and the stored list.

### The live counter

The number next to the avatars is real: it polls a `waitlist_count()` RPC
every 20s, pauses while the tab is hidden, and bumps immediately when someone
signs up. It starts at zero and counts up as real people join.

Configured in `src/data/site.ts` under `socialProof`:

| | |
|---|---|
| `offset` | added to the real count. `0` shows the truth |
| `minToShow` | hides the row below this count. `0` = always show |
| `pollMs` | refresh interval, `0` disables polling |

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
└─ styles/
   ├─ global.css           ← primitives built on the tokens
   └─ tokens/
      ├─ colors|typography|spacing.css  ← verbatim from the DS export
      └─ theme-app.css                  ← live-app overrides (edit this)
supabase/waitlist.sql      ← table + RLS policy
```
