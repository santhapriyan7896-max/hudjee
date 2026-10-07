# HudJee landing page

The pre-registration site for HudJee: one page, three legal pages and a 42-second
product film. Live at [hudjee-ten.vercel.app](https://hudjee-ten.vercel.app).

There is no server and no framework. `build.mjs` writes the Supabase project into
`src/index.html`, builds the legal pages from `src/legal/`, and copies `public/`
into `dist/`. The form calls Supabase directly, with the publishable key.

## Run it

    cp .env.example .env      # fill in SUPABASE_PUBLISHABLE_KEY
    npm run dev               # http://localhost:4321

The build reads `.env`, so a local registration is a real one. Without the file,
`npm run dev` builds a preview whose form saves nothing.

## Deploy

Any static host works; it runs on Vercel now.

| Setting | Value |
| --- | --- |
| Build command | `npm run build` |
| Output directory | `dist` |
| `SUPABASE_URL` | `https://cvqzcpehxiapkkamhsbm.supabase.co` |
| `SUPABASE_PUBLISHABLE_KEY` | Supabase → Settings → API Keys → publishable key (`sb_publishable_…`) |
| `SITE_URL` | where it is served from, e.g. `https://hudjee.com` |

The build fails without the two Supabase values rather than shipping a page that
looks fine and saves nothing, and it refuses a secret or service-role key, because
everything written into the page is public. It has no dependencies, so the host's
install step can be skipped.

`SITE_URL` goes into the canonical link, the link-preview tags (`public/og.png`) and
the share button.

## Where sign-ups go

The form asks for an email address and nothing else (never a phone number), then
three optional questions: JEE year, Android or iPhone, and a name. It calls

    register_interest(p_email, p_name, p_exam_year, p_platform, p_source, p_utm, p_trap)

which writes to `pre_registrations` in the HudJee app's Supabase project. The
table is closed to the publishable key: only the function can write to it, and
nothing on the page can read it back. One email is one row; registering again
fills in answers left blank and changes nothing else.

`supabase/pre_registrations.sql` is that whole backend, already applied. Its source
of truth is the app repo's migrations, `20261001000000_pre_registrations.sql` and
`20261001010000_pre_registrations_email_only.sql`; change it there.

Read sign-ups in Supabase → Table Editor → `pre_registrations`, or:

```sql
SELECT email, name, exam_year, platform, source, utm, created_at
FROM pre_registrations
ORDER BY created_at DESC;
```

Add campaign tags to the links you share, such as
`https://hudjee.com/?utm_source=instagram&utm_campaign=launch`. They are stored in
`utm`, with the referring site; `source` says which of the page's two forms was used.

The form has a hidden honeypot field, and the function validates every address. If
bots get through anyway, put Cloudflare Turnstile in front of the form; that needs a
small server-side check, because the function cannot verify a token itself.

### The older waitlist

`supabase/waitlist.sql` and `supabase/functions/notify-signup` belong to the
waitlist form this page replaced. They use a separate `waitlist` table, so sign-ups
from this page are not in it, and the welcome email does not go out for them.

## Legal pages

`src/legal/privacy.html`, `cookies.html` and `terms.html` are built inside
`src/legal/_shell.html` into `/privacy`, `/cookies` and `/terms`. The app links to
`hudjee.com/privacy` and `hudjee.com/terms`, so keep those paths.

## The film

`public/film/` holds the film in two cuts, 16:9 and 4:5 for phones, each about 8 MB
of H.264 with an AAC track of sound effects, and a poster for each. The page plays
the 4:5 cut below 640 px wide. It starts muted when it scrolls into view, pauses
when it leaves, and never autoplays when reduced motion is on; the speaker button
turns the sound on.

The film is a web page rendered frame by frame. Its source and render scripts are
in `film/`; see [film/README.md](film/README.md).
