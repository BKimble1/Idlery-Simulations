#!/usr/bin/env node
// Serves a built site the way Netlify serves it, for the tests and for a local look:
//
//   node scripts/serve.mjs [dir=dist] [port=8888]      (npm run serve)
//
// What it reproduces (enough for this site; see README.md, "How the routes work"):
// * static files: /about/ → about/index.html, /about → about.html, and, as Netlify's default
//   Pretty URLs do, /about → 301 /about/ when there is only an about/index.html
// * _redirects: exact and splat (/*) paths, matched with or without a trailing slash; 200
//   rewrites and 301/302 redirects; a rule is skipped when a file exists at the path
//   ("shadowing") unless it is forced with "!"; the query string is kept
// * _headers: exact and splat paths
// * 404.html (status 404) for anything else; Range requests, as media seeking needs
import { createReadStream, readFileSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, resolve, sep } from 'node:path';

const dir = resolve(process.argv[2] ?? 'dist');
const port = Number(process.argv[3] ?? 8888);

const TYPES = {
  '.html': 'text/html; charset=UTF-8',
  '.js': 'application/javascript; charset=UTF-8',
  '.mjs': 'application/javascript; charset=UTF-8',
  '.css': 'text/css; charset=UTF-8',
  '.json': 'application/json; charset=UTF-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.mp3': 'audio/mpeg',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.txt': 'text/plain; charset=UTF-8',
  '.xml': 'application/xml',
};

const read = (name) => {
  try {
    return readFileSync(join(dir, name), 'utf8');
  } catch {
    return '';
  }
};
const lines = (text) =>
  text
    .split('\n')
    .map((l) => l.replace(/\s+$/, ''))
    .filter((l) => l.trim() && !l.trim().startsWith('#'));

const rules = lines(read('_redirects')).map((l) => {
  const [from, to, status = '301'] = l.trim().split(/\s+/);
  return { from, to, status: Number.parseInt(status, 10), force: status.endsWith('!') };
});

const headerRules = [];
for (const l of lines(read('_headers'))) {
  if (!/^\s/.test(l)) headerRules.push({ path: l.trim(), headers: {} });
  else if (headerRules.length) {
    const i = l.indexOf(':');
    headerRules.at(-1).headers[l.slice(0, i).trim()] = l.slice(i + 1).trim();
  }
}

const bare = (p) => (p.length > 1 ? p.replace(/\/+$/, '') : p);
/** The splat for a match ('' for an exact one), or null. */
function match(pattern, path) {
  if (pattern.endsWith('/*')) {
    const base = pattern.slice(0, -2);
    if (bare(path) === base) return '';
    return path.startsWith(base + '/') ? path.slice(base.length + 1) : null;
  }
  return bare(pattern) === bare(path) ? '' : null;
}

function file(p) {
  const f = join(dir, p);
  if (f !== dir && !f.startsWith(dir + sep)) return null;
  try {
    return statSync(f).isFile() ? f : null;
  } catch {
    return null;
  }
}

/** What the static files say about a path: a file to serve, a slash to add, or nothing. */
function lookup(path) {
  if (path.endsWith('/')) {
    const f = file(path + 'index.html');
    return f ? { file: f } : null;
  }
  const f = file(path) ?? file(path + '.html');
  if (f) return { file: f };
  if (file(path + '/index.html')) return { slash: path + '/' };
  return null;
}

function send(req, res, path, status, url) {
  const st = statSync(path);
  const head = { 'Content-Type': TYPES[extname(path).toLowerCase()] ?? 'application/octet-stream', 'Accept-Ranges': 'bytes', 'Cache-Control': 'no-cache' };
  for (const r of headerRules) if (match(r.path, url.pathname) !== null) Object.assign(head, r.headers);
  const range = status === 200 && /^bytes=(\d*)-(\d*)$/.exec(req.headers.range ?? '');
  let start = 0;
  let end = st.size - 1;
  if (range) {
    start = range[1] === '' ? Math.max(0, st.size - Number(range[2])) : Number(range[1]);
    end = range[1] !== '' && range[2] !== '' ? Math.min(Number(range[2]), st.size - 1) : st.size - 1;
    if (start > end) {
      res.writeHead(416, { 'Content-Range': `bytes */${st.size}` });
      return res.end();
    }
    status = 206;
    head['Content-Range'] = `bytes ${start}-${end}/${st.size}`;
  }
  head['Content-Length'] = String(end - start + 1);
  res.writeHead(status, head);
  if (req.method === 'HEAD') return res.end();
  createReadStream(path, { start, end }).pipe(res);
}

function redirect(res, status, to) {
  res.writeHead(status, { Location: to, 'Content-Type': 'text/plain' });
  res.end(`Redirecting to ${to}\n`);
}

const server = createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost');
  let path;
  try {
    path = decodeURIComponent(url.pathname);
  } catch {
    res.writeHead(400);
    return res.end();
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405);
    return res.end();
  }
  const found = lookup(path);
  for (const r of rules) {
    const splat = match(r.from, path);
    if (splat === null) continue;
    if (found && !r.force) break; // shadowed by a file at this path
    const to = r.to.replace(':splat', splat);
    if (r.status === 200) {
      const target = lookup(new URL(to, 'http://localhost').pathname);
      if (target?.file) return send(req, res, target.file, 200, url);
      continue;
    }
    return redirect(res, r.status, to + (to.includes('?') ? '' : url.search));
  }
  if (found?.file) return send(req, res, found.file, 200, url);
  if (found?.slash) return redirect(res, 301, found.slash + url.search);
  const missing = file('/404.html');
  if (missing) return send(req, res, missing, 404, url);
  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('Not found\n');
});

server.listen(port, '127.0.0.1', () => console.log(`Serving ${dir} at http://127.0.0.1:${port} (Netlify-style routing: ${rules.length} redirect rules, ${headerRules.length} header rules)`));
