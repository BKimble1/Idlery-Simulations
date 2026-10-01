#!/usr/bin/env node
// Checks a packaged site (scripts/package.mjs) the way Netlify will receive it: unzips it into
// a clean temporary folder, checks what is at its top level, serves it with scripts/serve.mjs
// (Netlify's routing, from the package's own _redirects and _headers) and asks for it:
//
//   node scripts/verify-package.mjs release/FAB-ONE-with-Rocket-V2-Netlify.zip [--keep]
//
// * the top level: index.html, 404.html, _redirects, _headers, sitemap.xml, robots.txt,
//   assets/, media/ and a folder per simulation, and nothing wrapped in another folder
// * the routes: /, each /<slug> and /<slug>/, with a query and deep links: 200, HTML, no redirect;
//   an unknown address and a missing file under a route: 404
// * every file each page (the homepage, its 404 page, each simulation) loads, and every url()
//   in their style sheets: 200, not empty, with the type its extension calls for; and the files
//   a simulation's scripts name in its own folders (textures/…): there, with their types
// * the preview clips and posters: their types, ranges (206), and that they are video files
//   (checked with ffmpeg when it is available: codec, size, length, no sound)
// * every file in the package is served with a known type; the headers Netlify will send
//
// Prints a summary and exits with 1 if anything is wrong.
import { execFileSync, spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { crc32, inflateRawSync } from 'node:zlib';
import simulations from '../simulations.config.mjs';

const root = join(import.meta.dirname, '..');
const zipPath = resolve(process.argv.slice(2).find((a) => !a.startsWith('--')) ?? join(root, 'release', 'fab-one-site.zip'));
const keep = process.argv.includes('--keep');

let failures = 0;
let passes = 0;
function ok(cond, what) {
  if (cond) passes++;
  else {
    failures++;
    console.log(`  ✗ ${what}`);
  }
  return cond;
}
const section = (title) => console.log(`\n${title}`);

// ── 1. unzip (Node's zlib; the central directory is the index, each entry's CRC is checked)
section(`Unzipping ${relative(process.cwd(), zipPath) || zipPath}`);
const zip = readFileSync(zipPath);
const eocd = zip.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
if (eocd < 0) throw new Error('not a ZIP file (no end of central directory)');
const count = zip.readUInt16LE(eocd + 10);
let at = zip.readUInt32LE(eocd + 16);
const dir = mkdtempSync(join(tmpdir(), 'fabone-package-'));
const names = [];
for (let i = 0; i < count; i++) {
  if (zip.readUInt32LE(at) !== 0x02014b50) throw new Error(`bad central directory entry ${i}`);
  const method = zip.readUInt16LE(at + 10);
  const crc = zip.readUInt32LE(at + 16);
  const csize = zip.readUInt32LE(at + 20);
  const nameLen = zip.readUInt16LE(at + 28);
  const extraLen = zip.readUInt16LE(at + 30);
  const commentLen = zip.readUInt16LE(at + 32);
  const local = zip.readUInt32LE(at + 42);
  const name = zip.subarray(at + 46, at + 46 + nameLen).toString('utf8');
  at += 46 + nameLen + extraLen + commentLen;
  if (name.startsWith('/') || name.split('/').includes('..') || name.includes('\\')) throw new Error(`unsafe path in the ZIP: ${name}`);
  names.push(name);
  if (name.endsWith('/')) continue;
  const start = local + 30 + zip.readUInt16LE(local + 26) + zip.readUInt16LE(local + 28);
  const body = zip.subarray(start, start + csize);
  const data = method === 0 ? body : method === 8 ? inflateRawSync(body) : null;
  if (!data) throw new Error(`${name}: unsupported compression method ${method}`);
  ok(crc32(data) === crc, `${name}: CRC matches`);
  const file = join(dir, ...name.split('/'));
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, data);
}
const files = names.filter((n) => !n.endsWith('/'));
console.log(`  ${files.length} files, ${(zip.length / 1e6).toFixed(2)} MB, into ${dir}`);

// ── 2. the top level
section('Top level');
const top = readdirSync(dir).sort();
console.log(`  ${top.join('  ')}`);
const expected = ['index.html', '404.html', '_redirects', '_headers', 'sitemap.xml', 'robots.txt', 'assets', 'media', ...simulations.map((s) => s.slug)];
for (const e of expected) ok(top.includes(e), `${e} is at the top level`);
const isDir = (p) => statSync(join(dir, p)).isDirectory();
for (const d of ['assets', 'media', ...simulations.map((s) => s.slug)]) if (top.includes(d)) ok(isDir(d), `${d}/ is a folder`);
for (const s of simulations) ok(files.includes(`${s.slug}/index.html`), `${s.slug}/index.html is in the package`);
for (const s of simulations) ok(files.some((f) => f.startsWith(`media/${s.slug}/`)), `media/${s.slug}/ holds ${s.title}'s preview`);
const extra = top.filter((t) => !expected.includes(t) && !['favicon.svg', 'og.jpg'].includes(t));
ok(!extra.length, `nothing unexpected at the top level${extra.length ? ` (${extra.join(', ')})` : ''}`);
const redirects = readFileSync(join(dir, '_redirects'), 'utf8');
const headersFile = readFileSync(join(dir, '_headers'), 'utf8');
const rules = redirects.split('\n').filter((l) => l.trim() && !l.trim().startsWith('#'));
const headerRules = headersFile.split('\n').filter((l) => l.trim() && !l.startsWith('#') && !/^\s/.test(l));
for (const s of simulations) ok(rules.includes(`/${s.slug}  /${s.slug}/index.html  200!`), `_redirects serves /${s.slug}`);
console.log(`  _redirects: ${rules.length} rules; _headers: ${headerRules.length} rules (${headerRules.join(', ')})`);

// ── 3. serve it as Netlify would
const port = await new Promise((res) => {
  const srv = createServer().listen(0, '127.0.0.1', () => {
    const p = srv.address().port;
    srv.close(() => res(p));
  });
});
const server = spawn(process.execPath, [join(root, 'scripts', 'serve.mjs'), dir, String(port)], { stdio: ['ignore', 'pipe', 'inherit'] });
await new Promise((res, rej) => {
  server.stdout.once('data', (d) => (console.log(`\n${String(d).trim()}`), res()));
  server.once('exit', (c) => rej(new Error(`serve.mjs exited (${c})`)));
});
const base = `http://127.0.0.1:${port}`;
const get = (path, init = {}) => fetch(base + path, { redirect: 'manual', ...init });

const TYPE = {
  '.html': /^text\/html/,
  '.js': /^text\/javascript/,
  '.mjs': /^text\/javascript/,
  '.css': /^text\/css/,
  '.json': /^application\/json/,
  '.svg': /^image\/svg\+xml/,
  '.png': /^image\/png/,
  '.jpg': /^image\/jpeg/,
  '.jpeg': /^image\/jpeg/,
  '.webp': /^image\/webp/,
  '.woff2': /^font\/woff2/,
  '.woff': /^font\/woff/,
  '.mp3': /^audio\/mpeg/,
  '.mp4': /^video\/mp4/,
  '.webm': /^video\/webm/,
  '.bin': /^application\/octet-stream$/,
  '.xml': /^application\/xml/,
  '.txt': /^text\/plain/,
};
const ext = (p) => /\.[a-z0-9]+$/i.exec(p.split(/[?#]/)[0])?.[0].toLowerCase() ?? '';

try {
  section('Routes');
  const routes = ['/', ...simulations.flatMap((s) => [`/${s.slug}`, `/${s.slug}/`, `/${s.slug}/index.html`])];
  const deep = { photolithography: ['/photolithography?step=coat', '/photolithography/?watch'], rocket: ['/rocket?v=mission&m=leo', '/rocket/?v=mission&m=leo', '/rocket/?v=explore&part=turbopump&view=cutaway'] };
  for (const s of simulations) routes.push(...(deep[s.slug] ?? [`/${s.slug}?x=1`]));
  for (const path of routes) {
    const r = await get(path);
    const html = await r.text();
    const sim = simulations.find((s) => path === `/${s.slug}` || path.startsWith(`/${s.slug}/`) || path.startsWith(`/${s.slug}?`));
    const right = sim ? html.includes(`src="/${sim.slug}/assets/`) : html.includes('<article class="card');
    const good = ok(r.status === 200 && /^text\/html/.test(r.headers.get('content-type') ?? '') && right, `${path}: ${r.status} ${r.headers.get('content-type')}${r.headers.get('location') ? ` → ${r.headers.get('location')}` : ''}`);
    if (good) console.log(`  ✓ ${path.padEnd(52)} 200 ${sim ? sim.title : 'homepage'}`);
  }
  for (const path of ['/no-such-page', ...simulations.flatMap((s) => [`/${s.slug}/assets/missing.js`, `/${s.slug}/missing.png`])]) {
    const r = await get(path);
    await r.arrayBuffer();
    if (ok(r.status === 404 && /^text\/html/.test(r.headers.get('content-type') ?? ''), `${path}: 404 (got ${r.status} ${r.headers.get('content-type')})`)) console.log(`  ✓ ${path.padEnd(52)} 404`);
  }

  section('Files each page loads');
  /** Scripts, style sheets, icons and media a page loads (links to other pages are not loads). */
  const loaded = (html) => {
    const urls = [];
    for (const [tag, name] of html.matchAll(/<(script|link|img|source|video|audio)\b[^>]*>/gi)) {
      if (name.toLowerCase() === 'link') {
        const rel = /\srel=(["'])([^"']*)\1/i.exec(tag)?.[2].toLowerCase().split(/\s+/) ?? [];
        if (!rel.some((x) => ['stylesheet', 'icon', 'modulepreload', 'preload', 'manifest', 'apple-touch-icon'].includes(x))) continue;
      }
      for (const [, , , url] of tag.matchAll(/\s(src|href|poster)=(["'])([^"']*)\2/gi)) if (!/^(data|blob|https?):/.test(url)) urls.push(url);
    }
    return urls;
  };
  const checked = new Set();
  const media = [];
  async function load(url, from) {
    if (checked.has(url)) return;
    checked.add(url);
    const r = await get(url);
    const body = Buffer.from(await r.arrayBuffer());
    const type = r.headers.get('content-type') ?? '';
    const want = TYPE[ext(url)];
    ok(r.status === 200 && body.length > 0 && (!want || want.test(type)), `${from}: ${url} → ${r.status} ${type} ${body.length} bytes`);
    if (ext(url) === '.css') for (const [, , u] of body.toString('utf8').matchAll(/url\(\s*(["']?)([^"')]+)\1\s*\)/g)) if (!/^(data|#)/.test(u)) await load(new URL(u, base + url).pathname, url);
    if (/\.(mp4|webm)$/.test(url) || (/\.webp$/.test(url) && url.startsWith('/media/'))) media.push({ url, type, body });
  }
  // each page from its file (whatever the rules say), its URLs resolved as at the route's own
  // address, without the slash, where a relative URL would leave the route
  const pages = [['/', 'index.html'], ['/404.html', '404.html'], ...simulations.map((s) => [`/${s.slug}`, `${s.slug}/index.html`])];
  for (const [page, file] of pages) {
    const html = readFileSync(join(dir, file), 'utf8');
    const urls = loaded(html);
    const sim = page !== '/' && page !== '/404.html';
    const before = failures;
    for (const u of urls) {
      const abs = new URL(u, base + page).pathname;
      if (sim) ok(abs.startsWith(`${page}/`), `${page}: ${u} is under ${page}/`);
      await load(abs, page);
    }
    if (failures === before) console.log(`  ✓ ${page.padEnd(20)} loads ${String(urls.length).padStart(2)} files${sim ? ' (all under its route)' : ''}`);
  }
  console.log(`  ${checked.size} files checked (with the fonts the style sheets load): 200, not empty, of the right type${failures ? ', except as above' : ''}`);

  section('Files the simulations\' code asks for by name');
  // paths like "textures/earth/day_2048.jpg" in a simulation's scripts, in one of its own folders
  for (const s of simulations) {
    const scripts = files.filter((f) => f.startsWith(`${s.slug}/assets/`) && f.endsWith('.js'));
    const folders = new Set(files.filter((f) => f.startsWith(`${s.slug}/`)).map((f) => f.split('/')[1]));
    const named = new Set();
    for (const f of scripts)
      for (const [, path] of readFileSync(join(dir, f), 'utf8').matchAll(/["'`]([\w-]+\/[\w./-]+\.(?:jpe?g|png|webp|avif|svg|mp3|m4a|ogg|json|ktx2|glb|gltf|hdr|bin|wasm|mp4|webm|woff2))["'`]/g))
        if (folders.has(path.split('/')[0]) && !path.includes('..')) named.add(path);
    const before = failures;
    for (const path of named) await load(`/${s.slug}/${path}`, `${s.slug}'s code`);
    if (failures === before) console.log(`  ✓ /${s.slug.padEnd(19)} ${named.size} files named in its code, all there${named.size ? ` (${[...named].slice(0, 3).join(', ')}${named.size > 3 ? ', …' : ''})` : ''}`);
  }

  section('Preview clips and posters');
  let ffmpegBin = null;
  try {
    ffmpegBin = process.env.FFMPEG ?? execFileSync('python3', ['-c', 'import imageio_ffmpeg; print(imageio_ffmpeg.get_ffmpeg_exe())'], { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch {
    try {
      execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' });
      ffmpegBin = 'ffmpeg';
    } catch {}
  }
  for (const s of simulations) {
    const mine = media.filter((m) => m.url.startsWith(`/media/${s.slug}/`));
    ok(mine.length === 3, `${s.title}: a poster, an MP4 and a WebM on its card (${mine.length})`);
    for (const m of mine) {
      const magic = m.url.endsWith('.mp4') ? m.body.subarray(4, 8).toString('latin1') === 'ftyp' : m.url.endsWith('.webm') ? m.body.readUInt32BE(0) === 0x1a45dfa3 : m.body.subarray(8, 12).toString('latin1') === 'WEBP';
      ok(magic, `${m.url}: is a ${ext(m.url).slice(1)} file`);
      let about = `${m.type}, ${Math.round(m.body.length / 1024)} KB`;
      if (/\.(mp4|webm)$/.test(m.url)) {
        const r = await get(m.url, { headers: { Range: 'bytes=0-1023' } });
        await r.arrayBuffer();
        ok(r.status === 206 && r.headers.get('content-range') === `bytes 0-1023/${m.body.length}`, `${m.url}: served in ranges (${r.status})`);
        if (ffmpegBin) {
          const tmp = join(dir, `.probe${ext(m.url)}`);
          writeFileSync(tmp, m.body);
          let info = '';
          try {
            execFileSync(ffmpegBin, ['-hide_banner', '-i', tmp], { stdio: ['ignore', 'pipe', 'pipe'] });
          } catch (e) {
            info = String(e.stderr);
          }
          rmSync(tmp);
          const video = /Stream #\S+: Video: (\w+)[^\n]*?, (\d+)x(\d+)/.exec(info);
          const duration = /Duration: (\d+):(\d+):([\d.]+)/.exec(info);
          const secs = duration ? Number(duration[1]) * 3600 + Number(duration[2]) * 60 + Number(duration[3]) : 0;
          ok(!!video && secs > 0, `${m.url}: ffmpeg reads a video stream (${video?.[1]} ${video?.[2]}x${video?.[3]}, ${secs} s)`);
          ok(!/Stream #\S+: Audio/.test(info), `${m.url}: no sound`);
          ok(m.url.endsWith('.mp4') ? video?.[1] === 'h264' : video?.[1] === 'vp9', `${m.url}: ${m.url.endsWith('.mp4') ? 'H.264' : 'VP9'}`);
          if (video) about += `, ${video[1]} ${video[2]}x${video[3]}, ${secs.toFixed(2)} s, no sound`;
        }
      }
      console.log(`  ✓ ${m.url.padEnd(52)} ${about}`);
    }
  }

  section('Every file in the package');
  let typed = 0;
  const unknown = [];
  for (const f of files) {
    if (['_redirects', '_headers'].includes(f)) continue;
    const r = await get('/' + f.split('/').map(encodeURIComponent).join('/'), { method: 'HEAD' });
    const type = r.headers.get('content-type') ?? '';
    if (r.status !== 200) ok(false, `/${f}: ${r.status}`);
    // (octet-stream is what an unknown extension gets, so it is a type only for raw binary data)
    else if ((type === 'application/octet-stream' && ext(f) !== '.bin') || (TYPE[ext(f)] && !TYPE[ext(f)].test(type))) unknown.push(`/${f} (${type})`);
    else typed++;
  }
  ok(!unknown.length, `every file has its type${unknown.length ? `: not ${unknown.slice(0, 10).join(', ')}` : ''}`);
  console.log(`  ✓ ${typed} of ${files.length - 2} files served with a known type`);

  section('Headers');
  const header = async (path, name) => {
    const r = await get(path, { method: 'HEAD' });
    return r.headers.get(name);
  };
  for (const s of simulations) {
    if (s.serviceWorker) {
      const v = await header(`/${s.slug}/${s.serviceWorker}`, 'service-worker-allowed');
      if (ok(v === `/${s.slug}`, `/${s.slug}/${s.serviceWorker}: Service-Worker-Allowed ${v}`)) console.log(`  ✓ /${s.slug}/${s.serviceWorker}: Service-Worker-Allowed: ${v}`);
    }
    const asset = files.find((f) => f.startsWith(`${s.slug}/assets/`));
    const cc = await header(`/${asset}`, 'cache-control');
    if (ok(/immutable/.test(cc ?? ''), `/${asset}: ${cc}`)) console.log(`  ✓ /${s.slug}/assets/*: ${cc}`);
    for (const path of Object.keys(s.headers ?? {})) {
      const f = files.find((x) => x.startsWith(`${s.slug}/${path.replace(/\*$/, '')}`));
      if (!f) continue;
      const v = await header(`/${f}`, 'cache-control');
      if (ok(v === s.headers[path]['Cache-Control'] && !/immutable/.test(v ?? ''), `/${f}: ${v}`)) console.log(`  ✓ /${s.slug}/${path}: ${v}`);
    }
  }
  for (const f of [files.find((x) => x.startsWith('assets/')), files.find((x) => x.startsWith('media/'))]) {
    const v = await header(`/${f}`, 'cache-control');
    if (ok(/immutable/.test(v ?? ''), `/${f}: ${v}`)) console.log(`  ✓ /${f.split('/')[0]}/*: ${v}`);
  }
  const sitemap = await (await get('/sitemap.xml')).text();
  for (const s of simulations) ok(sitemap.includes(`/${s.slug}</loc>`), `sitemap.xml lists /${s.slug}`);
  ok((await (await get('/robots.txt')).text()).includes('Sitemap:'), 'robots.txt names the sitemap');
} finally {
  server.kill();
  if (!keep) rmSync(dir, { recursive: true, force: true });
}

console.log(`\n${failures ? '✗' : '✓'} ${relative(root, zipPath).startsWith('..') ? zipPath : relative(root, zipPath)}: ${passes} checks passed, ${failures} failed` + (keep ? ` (unzipped in ${dir})` : ''));
process.exit(failures ? 1 : 0);
