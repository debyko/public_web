// Writes sitemap.xml from the pages that exist, and refuses to leave it wrong.
//
// Why generated: lastmod was kept by hand and went stale within a day of every edit, and a page
// added without its <loc> was invisible until someone noticed. Here the file on disk is the source
// of truth for which URLs exist, and git is the source of truth for when each one last changed.
//
//   node tools/sitemap.mjs           rewrite sitemap.xml (what stamp-assets.mjs calls)
//   node tools/sitemap.mjs --check   exit 1 if the file on disk is not what this would write
//   node tools/sitemap.mjs --live    also fetch every URL and exit 1 unless it answers 200
//
// A page is any index.html the site serves. Working documents and the dated page backups are left
// out the same way _redirects leaves them out of the site, so a rule added there needs no change
// here. Pages that do not exist yet — /docs/dql/, /docs/api/, /data/ — are not listed: a sitemap
// that carries a 404 is worse than one that is short.

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const ORIGIN = 'https://debyko.com';
const SKIP_DIRS = ['.git', '.github', '.wrangler', 'node_modules', 'tools', 'plans', 'og', 'functions', 'assets', 'css', 'js'];

const walk = dir => readdirSync(dir).flatMap(name => {
  const full = join(dir, name);
  if (statSync(full).isDirectory()) return SKIP_DIRS.includes(name) ? [] : walk(full);
  return name === 'index.html' ? [full] : [];
});

/** The redirect rules that take a path off the site (everything sent to "/"), as patterns. */
function redirected() {
  const lines = readFileSync(join(root, '_redirects'), 'utf8').split('\n');
  return lines
    .map(l => l.trim())
    .filter(l => l && !l.startsWith('#'))
    .map(l => l.split(/\s+/)[0])
    .filter(p => p.startsWith('/'))
    .map(p => new RegExp('^' + p.split('*').map(s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*') + '$'));
}

const urlOf = file => {
  const path = '/' + relative(root, file).split(sep).join('/');
  return ORIGIN + path.replace(/index\.html$/, '');
};

/** Last commit that touched the page. A page edited but not yet committed is dated today: the
 *  commit that is about to carry it is today's, and a lastmod behind the content is a lie. */
const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
function lastmod(file) {
  const rel = relative(root, file);
  if (git('status', '--porcelain', '--', rel)) return new Date().toISOString().slice(0, 10);
  return git('log', '-1', '--format=%cs', '--', rel) || new Date().toISOString().slice(0, 10);
}

export function buildSitemap() {
  const skip = redirected();
  const pages = walk(root).filter(f => !skip.some(re => re.test('/' + relative(root, f).split(sep).join('/'))));
  const urls = pages
    .map(f => ({ loc: urlOf(f), lastmod: lastmod(f) }))
    .sort((a, b) => a.loc.localeCompare(b.loc));
  const body = urls.map(u => `  <url>\n    <loc>${u.loc}</loc>\n    <lastmod>${u.lastmod}</lastmod>\n  </url>`).join('\n');
  return { xml: `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`, urls };
}

export function writeSitemap() {
  const file = join(root, 'sitemap.xml');
  const { xml, urls } = buildSitemap();
  const before = readFileSync(file, 'utf8');
  if (before !== xml) { writeFileSync(file, xml); console.log('sitemap.xml rewritten,', urls.length, 'pages'); }
  return urls;
}

/** What --check reports: a URL in the file with no page behind it, a page with no URL, or a lastmod
 *  that no longer matches the page's last change. */
function drift() {
  const { xml } = buildSitemap();
  const onDisk = readFileSync(join(root, 'sitemap.xml'), 'utf8');
  if (onDisk === xml) return [];
  const locs = s => new Map([...s.matchAll(/<loc>([^<]+)<\/loc>\s*<lastmod>([^<]+)<\/lastmod>/g)].map(m => [m[1], m[2]]));
  const have = locs(onDisk), want = locs(xml);
  const out = [];
  for (const [loc] of have) if (!want.has(loc)) out.push(`listed but no page behind it: ${loc}`);
  for (const [loc, mod] of want) {
    if (!have.has(loc)) out.push(`page with no url in the sitemap: ${loc}`);
    else if (have.get(loc) !== mod) out.push(`lastmod ${have.get(loc)} should be ${mod}: ${loc}`);
  }
  return out.length ? out : ['sitemap.xml differs from what this script writes'];
}

async function live(urls) {
  const bad = [];
  for (const { loc } of urls) {
    const res = await fetch(loc, { redirect: 'manual' }).catch(err => ({ status: 'no answer: ' + err.message }));
    if (res.status !== 200) bad.push(`${loc} → ${res.status}`);
  }
  return bad;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const problems = [];
  if (args.includes('--check')) problems.push(...drift());
  else writeSitemap();
  if (args.includes('--live')) problems.push(...await live(buildSitemap().urls));
  if (problems.length) { console.error('sitemap:\n  ' + problems.join('\n  ')); process.exit(1); }
  console.log('sitemap: ' + (args.includes('--check') ? 'matches the pages on disk' : 'written') + (args.includes('--live') ? ', every url answers 200' : ''));
}
