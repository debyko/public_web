// Stamps every stylesheet and script a page loads with a hash of its contents (?v=…), and writes an
// import map so ES modules imported by other modules are stamped too.
//
// Why: Cloudflare's zone-level Browser Cache TTL serves css/ and js/ with max-age=14400, over the
// max-age=0 in _headers. Without a changing URL a browser keeps last deploy's scripts for four hours
// beside this deploy's markup. A content hash changes the URL exactly when the file changes.
//
// Run before every commit that touches css/ or js/:
//   node tools/stamp-assets.mjs
// It is idempotent: run twice, the second run changes nothing.

import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { writeSitemap } from './sitemap.mjs';

const root = new URL('..', import.meta.url).pathname;

const walk = (dir, keep) => readdirSync(dir).flatMap(name => {
  const full = join(dir, name);
  if (statSync(full).isDirectory()) return ['.git', 'plans', 'node_modules', 'tools', 'og'].includes(name) ? [] : walk(full, keep);
  return keep(full) ? [full] : [];
});

const hashOf = file => createHash('sha1').update(readFileSync(file)).digest('hex').slice(0, 10);
const webPath = file => '/' + relative(root, file).split(sep).join('/');

const assets = new Map(
  walk(root, f => /\/(css|js)\//.test(f) && /\.(css|js)$/.test(f)).map(f => [webPath(f), hashOf(f)]));
const modules = [...assets.keys()].filter(p => p.endsWith('.js')).sort();

const pages = walk(root, f => f.endsWith('.html'));
const START = '<!-- importmap:begin -->', END = '<!-- importmap:end -->';

for (const page of pages) {
  const dir = webPath(page).replace(/[^/]*$/, '');
  let html = readFileSync(page, 'utf8');
  const before = html;

  // href="../css/site.css" / src="js/home.js", with or without an old ?v=
  html = html.replace(/((?:href|src)=")([^"?#]+\.(?:css|js))(?:\?v=[0-9a-f]+)?(")/g, (m, a, url, z) => {
    if (/^(https?:)?\/\//.test(url)) return m;
    const abs = new URL(url, 'https://x' + dir).pathname;
    const h = assets.get(abs);
    return h ? `${a}${url}?v=${h}${z}` : m;
  });

  const map = { imports: Object.fromEntries(modules.map(p => [p, `${p}?v=${assets.get(p)}`])) };
  const block = `${START}\n  <script type="importmap">${JSON.stringify(map)}</script>\n  ${END}`;
  if (html.includes(START)) {
    html = html.replace(new RegExp(`${START}[\\s\\S]*?${END}`), block);
  } else if (/<script[^>]*type="module"/.test(html)) {
    // The import map must come before the first module script.
    html = html.replace(/(\n\s*)(<script[^>]*>)/, `$1${block}$1$2`);
  }

  if (html !== before) {
    writeFileSync(page, html);
    console.log('stamped', relative(root, page));
  }
}

// The sitemap is part of the same "do not leave it stale" job as the ?v= hashes.
writeSitemap();
