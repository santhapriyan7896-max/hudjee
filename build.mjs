// Builds the landing page into dist/.
//
// The site is static: src/index.html plus the files in public/. The one build
// step is writing the Supabase project into the page so the form can call
// register_interest(), and a production build refuses to run without it,
// because a page deployed without it looks fine and saves nothing.
//
//   node build.mjs          production build; fails without the Supabase values
//   node build.mjs --dev    local build; without them the form runs as a preview
//
// Values come from the environment (the host's build settings), falling back to
// .env. Both end up in the page, so only ever the publishable key.

import { existsSync, readFileSync } from 'node:fs';
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const here = (path) => fileURLToPath(new URL(path, import.meta.url));
const dev = process.argv.includes('--dev');

function readEnvFile(path) {
  if (!existsSync(path)) return {};
  const values = {};
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m) values[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
  }
  return values;
}

// The host's settings win over the local file.
const env = { ...readEnvFile(here('./.env')), ...process.env };
const supabaseUrl = (env.SUPABASE_URL || '').trim().replace(/\/+$/, '');
const supabaseKey = (env.SUPABASE_PUBLISHABLE_KEY || '').trim();
const siteUrl = (env.SITE_URL || 'https://hudjee.com').trim().replace(/\/+$/, '');

function fail(message) {
  console.error(`\n  ${message}\n`);
  process.exit(1);
}

// Anything that can write past RLS must never reach a public page.
function looksSecret(key) {
  if (key.startsWith('sb_secret_')) return true;
  const [, payload] = key.split('.');
  if (!payload) return false;
  try {
    return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')).role === 'service_role';
  } catch {
    return false;
  }
}

if (supabaseKey && looksSecret(supabaseKey)) {
  fail('SUPABASE_PUBLISHABLE_KEY is a secret (service role) key. The page is public: use the publishable key.');
}

let config = null;
if (supabaseUrl && supabaseKey) {
  try {
    new URL(supabaseUrl);
  } catch {
    fail(`SUPABASE_URL is not a URL: "${supabaseUrl}"`);
  }
  config = { supabaseUrl, supabaseKey };
} else if (!dev) {
  fail(
    'SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY are required. Set them in the host\'s build settings,\n' +
      '  or in .env (see .env.example). Use `--dev` to build a preview that saves nothing.',
  );
} else {
  console.warn('No Supabase values: building a preview. The form will run but save nothing.');
}

let html = await readFile(here('./src/index.html'), 'utf8');
// Inside a <script>: keep "</" from closing it early.
html = html
  .replace('/*__CONFIG__*/null', JSON.stringify(config).replace(/</g, '\\u003c'))
  .replaceAll('%SITE_URL%', siteUrl);
if (html.includes('/*__CONFIG__*/') || html.includes('%SITE_URL%')) fail('src/index.html still has a placeholder after the build.');

await rm(here('./dist'), { recursive: true, force: true });
await mkdir(here('./dist'), { recursive: true });
await cp(here('./public'), here('./dist'), { recursive: true });
await writeFile(here('./dist/index.html'), html);

// The legal pages: one shell (src/legal/_shell.html) around each page's body,
// written to dist/<slug>/index.html so they're served at /privacy, /cookies, /terms.
const LEGAL = [
  {
    slug: 'privacy',
    title: 'Privacy Policy',
    description: 'What HudJee collects when you pre-register, why, who handles it, and how to see or delete it.',
  },
  {
    slug: 'cookies',
    title: 'Cookie Policy',
    description: 'HudJee’s website sets no cookies. Here is the one thing it saves in your browser, and why.',
  },
  {
    slug: 'terms',
    title: 'Terms of Use',
    description: 'The terms for using hudjee.com and pre-registering for the HudJee app.',
  },
];
const UPDATED = '1 October 2026';
const shell = await readFile(here('./src/legal/_shell.html'), 'utf8');
for (const page of LEGAL) {
  const body = await readFile(here(`./src/legal/${page.slug}.html`), 'utf8');
  // Functions, not strings, as replacements: page text may contain "$".
  const out = shell
    .replace('%CONTENT%', () => body)
    .replaceAll('%TITLE%', () => page.title)
    .replaceAll('%DESCRIPTION%', () => page.description)
    .replaceAll('%UPDATED%', () => UPDATED)
    .replaceAll('%SLUG%', () => page.slug)
    .replaceAll('%SITE_URL%', () => siteUrl)
    .replaceAll(`data-page="${page.slug}"`, `data-page="${page.slug}" aria-current="page"`);
  const left = out.match(/%[A-Z_]+%/);
  if (left) fail(`src/legal/${page.slug}.html still has ${left[0]} after the build.`);
  await mkdir(here(`./dist/${page.slug}`), { recursive: true });
  await writeFile(here(`./dist/${page.slug}/index.html`), out);
}

console.log(`Built dist for ${siteUrl}: ${config ? `saving to ${new URL(supabaseUrl).host}` : 'preview, saves nothing'}.`);
