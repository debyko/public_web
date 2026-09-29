// Checks every link on every published page of this repository, offline.
//
//   node tools/check-links.mjs            relative and debyko.com links, #fragments, identical footers
//   node tools/check-links.mjs --online   … and fetches every link to another *.debyko.com host once
//
// For each .html file Cloudflare Pages serves (files caught by _redirects are skipped, as Pages
// redirects them away), every href, src and debyko.com URL in a meta content must:
//   - resolve to a file in the repo — "/x/" to x/index.html, "/x" to x.html or x/index.html, as Pages does;
//   - if it has a #fragment, find id="fragment" (or name=) in the target page;
//   - https://debyko.com/… is treated as a root-relative link, so it must exist here too.
// The <footer id="company"> of every page must be byte-identical to index.html's.
// Also checks the <loc> entries of sitemap.xml. Exit 1 on any failure. No dependencies.

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative, sep, posix } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const online = process.argv.includes('--online');
const SKIP_DIRS = new Set(['.git', 'node_modules', 'plans', 'tools', 'functions']);

// Paths Pages redirects away, from _redirects ("/a/*" → prefix, "/a_*.html" → pattern).
const redirected = readFileSync(join(root, '_redirects'), 'utf8').split('\n')
  .map(l => l.trim()).filter(l => l && !l.startsWith('#')).map(l => l.split(/\s+/)[0])
  .map(from => new RegExp('^' + from.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$'));
const isRedirected = p => redirected.some(re => re.test(p) || re.test(p.replace(/\.html$/, '')));

const walk = dir => readdirSync(dir).flatMap(name => {
  const full = join(dir, name);
  if (statSync(full).isDirectory()) return SKIP_DIRS.has(name) ? [] : walk(full);
  return full.endsWith('.html') ? [full] : [];
});
const webPath = file => '/' + relative(root, file).split(sep).join('/');
const pages = walk(root).filter(f => !isRedirected(webPath(f))).sort();

/** URL path → file in the repo, the way Cloudflare Pages resolves it; null if nothing is served there. */
function fileFor(urlPath) {
  let p = decodeURIComponent(urlPath);
  if (isRedirected(p)) return null;
  const cands = p.endsWith('/') ? [p + 'index.html'] : [p, p + '.html', p + '/index.html'];
  for (const c of cands) { const f = join(root, c); if (existsSync(f) && statSync(f).isFile()) return f; }
  return null;
}

const idsCache = new Map();
function idsOf(file) {
  if (!idsCache.has(file)) {
    const html = readFileSync(file, 'utf8');
    idsCache.set(file, new Set([...html.matchAll(/\s(?:id|name)="([^"]+)"/g)].map(m => m[1])));
  }
  return idsCache.get(file);
}

const errors = [];
const external = new Map(); // url → first page that links it
let checked = 0;

function checkLink(page, raw, where) {
  const url = raw.replace(/&amp;/g, '&').trim();
  if (!url || /^(mailto:|tel:|javascript:|data:)/i.test(url)) return;
  const pagePath = webPath(page).replace(/index\.html$/, '');
  let u;
  try { u = new URL(url, 'https://debyko.com' + pagePath); } catch { errors.push(`${where}: unparsable URL ${url}`); return; }
  if (!/^https?:$/.test(u.protocol)) return;
  if (u.hostname !== 'debyko.com' && u.hostname !== 'www.debyko.com') {
    if (!external.has(u.href)) external.set(u.href, where);
    return;
  }
  checked++;
  const target = fileFor(u.pathname);
  if (!target) { errors.push(`${where}: ${url} → nothing is published at ${u.pathname}`); return; }
  const frag = u.hash ? decodeURIComponent(u.hash.slice(1)) : '';
  if (frag && target.endsWith('.html') && !idsOf(target).has(frag))
    errors.push(`${where}: ${url} → #${frag} does not exist in ${webPath(target)}`);
}

const footerOf = html => (html.match(/<footer id="company" class="site-footer">[\s\S]*?<\/footer>/) || [null])[0];
const refFooter = footerOf(readFileSync(join(root, 'index.html'), 'utf8'));

for (const page of pages) {
  const html = readFileSync(page, 'utf8')
    .replace(/<!--[\s\S]*?-->/g, '')                                   // commented-out markup is not a link
    .replace(/<script type="importmap">[\s\S]*?<\/script>/g, '');       // module specifiers, not links
  const lineOf = i => html.slice(0, i).split('\n').length;
  for (const m of html.matchAll(/\s(href|src)="([^"]*)"/g)) checkLink(page, m[2], `${webPath(page)}:${lineOf(m.index)}`);
  for (const m of html.matchAll(/\scontent="(https?:\/\/(?:www\.)?debyko\.com[^"]*)"/g)) checkLink(page, m[1], `${webPath(page)}:${lineOf(m.index)}`);
  if (/<footer id="company"/.test(html)) {
    const f = footerOf(readFileSync(page, 'utf8'));
    if (f !== refFooter) errors.push(`${webPath(page)}: footer differs from index.html's`);
  }
}

const sitemap = join(root, 'sitemap.xml');
if (existsSync(sitemap))
  for (const m of readFileSync(sitemap, 'utf8').matchAll(/<loc>([^<]+)<\/loc>/g)) checkLink(join(root, 'sitemap.xml'), m[1], '/sitemap.xml');

if (online) {
  const ours = [...external.keys()].filter(u => /^https:\/\/([a-z0-9-]+\.)*debyko\.com(\/|$)/.test(u));
  for (const url of ours) {
    try {
      const res = await fetch(url, { redirect: 'follow' });
      if (!res.ok) errors.push(`${external.get(url)}: ${url} → HTTP ${res.status}`);
      else if (new URL(url).hash) {
        const id = decodeURIComponent(new URL(url).hash.slice(1));
        const body = await res.text();
        if (!new RegExp(`\\s(?:id|name)="${id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`).test(body)) errors.push(`${external.get(url)}: ${url} → #${id} not on the live page`);
      }
      console.log(`online  ${res.status}  ${url}`);
    } catch (e) { errors.push(`${external.get(url)}: ${url} → ${e.message}`); }
  }
}

console.log(`${pages.length} pages · ${checked} links to this site checked · ${external.size} links to other hosts not checked${online ? ' (other *.debyko.com fetched)' : ''}`);
console.log('pages: ' + pages.map(webPath).join(' '));
if (errors.length) { console.error(errors.map(e => '  ✗ ' + e).join('\n')); console.error(`${errors.length} problem(s)`); process.exit(1); }
console.log('no dead links, no missing anchors, footers identical');
