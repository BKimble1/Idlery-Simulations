#!/usr/bin/env node
// Records a simulation's preview for its homepage card from the built site, as a visitor sees
// it: the page itself, at its route, frame by frame.
//
//   npm run build -- --skip-previews            (the first time; any build of the site will do)
//   node scripts/capture-preview.mjs <slug> [--only=a,b] [--keep] [--encode-only] [--frames=N] [--out=dir]
//
// --only renders some segments again, --keep keeps the frames (in the system's temp folder)
// for that, and --encode-only makes the videos from the kept frames without rendering.
// --frames=N renders at most N frames of each segment (a quick test of the shot list and the
// encoding), and --out writes the files somewhere other than site/media/<slug>/ (use both for
// a test: a short clip in site/media/<slug>/ would be published).
//
// The shot list is site/media/<slug>/preview.json. Each segment opens the simulation at a deep
// link (its `path`, plus `query`: the shot list's, or the segment's own), waits until the page
// is `ready`, prepares it (`setup`), then renders `frames` frames. With an "advance" hook (a
// frame-stepped clock, like Photolithography's or the rocket's ?virt=1) every frame is exactly
// 1/fps s of simulation time, so the clip runs at true speed however slowly this machine
// renders; without one, frames are taken in real time.
//
//   ready   an expression that is true once the page can be recorded, or
//           { "hooks": expr, "until": expr, "advancing": true, "interval": ms, "timeout": ms }:
//           wait for `hooks`, then for `until`, stepping the clock while waiting when `advancing`
//           (a simulation whose clock only moves when told to, loading between frames)
//   setup / during   steps: { "wait": ms }, { "advance": frames }, { "eval": expr },
//           { "until": expr, "advancing": true }, { "click": selector }, { "key": key }
//           (`during` steps also have the `frame` they happen before)
//
// Segments are joined with short cross-fades into preview.mp4 (H.264) and preview.webm (VP9,
// for browsers without H.264), both without sound. The poster (poster.webp) is the clip's first
// frame; `og` names a frame for a link-preview image: { "segment", "frame", "out" }, where out
// defaults to site/public/og.jpg, the homepage's (so only one simulation should leave it out).
// PROVENANCE.md next to the clip records what it was made from: the simulation's source
// commit, the addresses and steps, the renderer and the date.
//
// Needs ffmpeg with libx264, libvpx-vp9 and libwebp: $FFMPEG, else `ffmpeg` on the PATH, else
// Python's imageio-ffmpeg (pip install imageio-ffmpeg).
import { chromium } from '@playwright/test';
import { execFileSync, spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, resolve } from 'node:path';

const root = join(import.meta.dirname, '..');
const slug = process.argv[2];
const flag = (name) => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const only = (flag('only') ?? '').split(',').filter(Boolean);
const keep = process.argv.includes('--keep');
const encodeOnly = process.argv.includes('--encode-only');
const maxFrames = flag('frames') ? Number(flag('frames')) : Infinity;
if (!slug || slug.startsWith('--') || !(maxFrames > 0)) {
  console.error('usage: node scripts/capture-preview.mjs <slug> [--only=a,b] [--keep] [--encode-only] [--frames=N] [--out=dir]');
  process.exit(2);
}
const media = join(root, 'site', 'media', slug);
const out = flag('out') ? resolve(flag('out')) : media;
const spec = JSON.parse(readFileSync(join(media, 'preview.json'), 'utf8'));
if (!existsSync(join(root, 'dist', slug, 'index.html'))) {
  console.error(`dist/${slug} is missing: build the site first (npm run build -- --skip-previews).`);
  process.exit(1);
}
mkdirSync(out, { recursive: true });

function findFfmpeg() {
  if (process.env.FFMPEG) return process.env.FFMPEG;
  try {
    execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' });
    return 'ffmpeg';
  } catch {
    return execFileSync('python3', ['-c', 'import imageio_ffmpeg; print(imageio_ffmpeg.get_ffmpeg_exe())']).toString().trim();
  }
}
const FFMPEG = findFfmpeg();
const ffmpeg = (args) => execFileSync(FFMPEG, ['-hide_banner', '-loglevel', 'error', '-y', ...args], { stdio: 'inherit' });

const work = join(tmpdir(), 'fabone-capture', slug);
const fps = spec.fps ?? 30;
const { width, height } = spec.viewport;
const segments = spec.segments.map((s) => ({ ...s, frames: Math.min(s.frames, maxFrames) }));
const ready = typeof spec.ready === 'string' ? { until: spec.ready } : (spec.ready ?? {});

async function advance(page) {
  if (spec.advance) await page.evaluate(spec.advance);
  else await page.waitForTimeout(1000 / fps);
}
/** Wait for `expr`, stepping the clock meanwhile if asked to (the page loads between frames). */
async function until(page, expr, { advancing = false, interval = 250, timeout = 300_000 } = {}) {
  if (!advancing) return page.waitForFunction(expr, undefined, { timeout, polling: interval });
  const end = Date.now() + timeout;
  while (!(await page.evaluate(expr))) {
    if (Date.now() > end) throw new Error(`timed out after ${timeout / 1000} s waiting for: ${expr}`);
    await advance(page);
    await page.waitForTimeout(interval);
  }
}
async function step(page, s) {
  if (s.wait) await page.waitForTimeout(s.wait);
  if (s.until) await until(page, s.until, s);
  if (s.advance) for (let i = 0; i < s.advance; i++) await advance(page);
  if (s.eval) await page.evaluate(s.eval);
  if (s.click) await page.locator(s.click).first().click();
  if (s.key) await page.keyboard.press(s.key);
}

const address = (seg) => {
  const query = seg.query ?? spec.query;
  const sep = seg.path.includes('?') ? '&' : '?';
  return `/${slug}${seg.path}${query ? sep + query : ''}`;
};

let renderer = null;
async function renderSegment(browser, port, seg) {
  const dir = join(work, seg.name);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: spec.viewport.dpr ?? 1, reducedMotion: 'no-preference' });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const t0 = Date.now();
  await page.goto(`http://127.0.0.1:${port}${address(seg)}`, { waitUntil: 'load', timeout: 180_000 });
  await page.evaluate(() => document.fonts.ready);
  renderer ??= await page.evaluate(() => {
    const gl = document.createElement('canvas').getContext('webgl2') ?? document.createElement('canvas').getContext('webgl');
    if (!gl) return 'no WebGL';
    const info = gl.getExtension('WEBGL_debug_renderer_info');
    return String(gl.getParameter(info ? info.UNMASKED_RENDERER_WEBGL : gl.RENDERER));
  });
  if (ready.hooks) await page.waitForFunction(ready.hooks, undefined, { timeout: ready.timeout ?? 180_000 });
  if (ready.until) await until(page, ready.until, { timeout: 180_000, ...ready });
  console.log(`${seg.name}: ready after ${((Date.now() - t0) / 1000).toFixed(0)} s`);
  for (const s of seg.setup ?? []) await step(page, s);
  const t1 = Date.now();
  for (let i = 0; i < seg.frames; i++) {
    for (const ev of seg.during ?? []) if (ev.frame === i) await step(page, ev);
    await advance(page);
    await page.screenshot({ path: join(dir, `${String(i).padStart(5, '0')}.png`), timeout: 300_000 });
    if (i % 30 === 0 || i === seg.frames - 1) console.log(`${seg.name}: frame ${i + 1}/${seg.frames} (${((Date.now() - t1) / 1000).toFixed(0)} s)`);
  }
  if (errors.length) throw new Error(`${seg.name}: the page reported errors:\n${errors.join('\n')}`);
  await ctx.close();
}

async function render() {
  const port = 8899;
  const server = spawn(process.execPath, [join(root, 'scripts', 'serve.mjs'), join(root, 'dist'), String(port)], { stdio: 'ignore' });
  await new Promise((r) => setTimeout(r, 800));
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'] });
  try {
    for (const seg of segments) if (!only.length || only.includes(seg.name)) await renderSegment(browser, port, seg);
  } finally {
    await browser.close();
    server.kill();
  }
}
const started = new Date();
if (!encodeOnly) await render();

// Join the segments: each one fades into the next over `crossfade` seconds (less, when a
// segment is too short for it, as in a test render).
const segs = segments.filter((s) => existsSync(join(work, s.name, `${String(s.frames - 1).padStart(5, '0')}.png`)));
if (segs.length !== segments.length) {
  console.log(`Rendered ${segs.length} of ${segments.length} segments; run without --only to make the video.`);
  process.exit(0);
}
const fade = Math.min(spec.crossfade ?? 0.4, ...segs.map((s) => s.frames / fps / 2));
const inputs = segs.flatMap((s) => ['-framerate', String(fps), '-i', join(work, s.name, '%05d.png')]);
let chain = '';
let last = '[0:v]';
let length = segs[0].frames / fps;
for (let i = 1; i < segs.length; i++) {
  const next = i === segs.length - 1 ? '[v]' : `[x${i}]`;
  chain += `${last}[${i}:v]xfade=transition=fade:duration=${fade.toFixed(3)}:offset=${(length - fade).toFixed(3)}${next};`;
  length += segs[i].frames / fps - fade;
  last = next;
}
const filter = segs.length > 1 ? `${chain}[v]format=yuv420p[out]` : '[0:v]format=yuv420p[out]';
const video = join(out, 'preview.mp4');
const webm = join(out, 'preview.webm');
const poster = join(out, 'poster.webp');
// H.264 High at level 4.0 (the codecs string the card declares: avc1.640028), moov first so
// playback starts before the download ends
ffmpeg([
  ...inputs,
  '-filter_complex', filter,
  '-map', '[out]',
  '-c:v', 'libx264', '-preset', 'veryslow', '-crf', String(spec.crf ?? 26), '-profile:v', 'high', '-level:v', '4.0', '-tune', 'animation',
  '-r', String(fps), '-movflags', '+faststart', '-an',
  video,
]);
ffmpeg([
  ...inputs,
  '-filter_complex', filter,
  '-map', '[out]',
  '-c:v', 'libvpx-vp9', '-b:v', '0', '-crf', String(spec.crfVp9 ?? 36), '-deadline', 'good', '-cpu-used', '1', '-row-mt', '1',
  '-r', String(fps), '-an',
  webm,
]);
// The poster is the clip's first picture, so nothing jumps when the video starts (WebP: about
// half the size of a JPEG of the same quality). Link previews get a JPEG, which all of them read.
ffmpeg(['-i', join(work, segs[0].name, '00000.png'), '-c:v', 'libwebp', '-quality', '82', poster]);
let og = null;
if (spec.og) {
  const frame = join(work, spec.og.segment, `${String(Math.min(spec.og.frame, segs.find((s) => s.name === spec.og.segment).frames - 1)).padStart(5, '0')}.png`);
  og = flag('out') ? join(out, 'og.jpg') : join(root, spec.og.out ?? 'site/public/og.jpg');
  ffmpeg(['-i', frame, '-vf', 'scale=1200:-2:flags=lanczos,crop=1200:630:0:0', '-q:v', '4', og]);
}

// What the clip was made from.
function sourceOf() {
  const file = join(root, 'simulations', slug, 'SOURCE.json');
  if (existsSync(file)) {
    const s = JSON.parse(readFileSync(file, 'utf8'));
    return `${s.repository ?? 'its repository'}, branch \`${s.branch ?? '?'}\`, commit \`${s.commit}\` (${s.commitDate}), imported into simulations/${slug}/ on ${s.importedAt.slice(0, 10)}`;
  }
  try {
    const head = execFileSync('git', ['log', '-1', '--format=%H %cI', '--', `simulations/${slug}`], { cwd: root, encoding: 'utf8' }).trim();
    return `simulations/${slug}/ in this repository, last changed in \`${head.split(' ')[0]}\` (${head.split(' ')[1]})`;
  } catch {
    return `simulations/${slug}/`;
  }
}
const kb = (f) => `${Math.round(statSync(f).size / 1024)} KB`;
const steps = (list) => (list?.length ? list.map((s) => '`' + JSON.stringify(s) + '`').join(', ') : 'none');
const test = maxFrames !== Infinity;
writeFileSync(
  join(out, 'PROVENANCE.md'),
  [
    `# ${slug}: card preview`,
    '',
    test ? `**Test render** (\`--frames=${maxFrames}\`): not the finished clip.` : null,
    test ? '' : null,
    `Recorded by \`node scripts/capture-preview.mjs ${process.argv.slice(2).join(' ')}\` on ${started.toISOString().slice(0, 16).replace('T', ' ')} UTC, from the built site (\`dist/\`, served by scripts/serve.mjs), from the shot list in [preview.json](preview.json).`,
    '',
    `- **Simulation source**: ${sourceOf()}`,
    `- **Renderer**: Chromium (Playwright) with WebGL on ${renderer ?? 'the same renderer as the frames kept from an earlier run'}${renderer && /swiftshader/i.test(renderer) ? ' (SwiftShader, a software renderer: no GPU)' : ''}`,
    `- **Clock**: ${spec.advance ? `frame-stepped (\`${spec.advance}\` before each frame): every frame is exactly 1/${fps} s of simulation time, whatever the render time` : 'real time'}`,
    `- **Picture**: ${width} x ${height} at ${fps} fps, ${length.toFixed(2)} s, ${segs.length} segment${segs.length > 1 ? 's' : ''} joined with ${fade.toFixed(2)} s cross-fades, no sound`,
    `- **Files**: preview.mp4 (H.264 High 4.0) ${kb(video)}, preview.webm (VP9) ${kb(webm)}, poster.webp (the first frame) ${kb(poster)}${og ? `, ${relative(root, og)}` : ''}`,
    '',
    '| segment | address | ready, then setup | frames |',
    '|---|---|---|---|',
    ...segs.map((s) => `| ${s.name} | \`${address(s)}\` | ${steps(s.setup)}${s.during ? `; during: ${steps(s.during)}` : ''} | ${s.frames} (${(s.frames / fps).toFixed(2)} s) |`),
    '',
    `Ready: ${'`' + JSON.stringify(spec.ready ?? null) + '`'}`,
    '',
  ]
    .filter((l) => l !== null)
    .join('\n'),
);
console.log(`\n${length.toFixed(1)} s: preview.mp4 ${kb(video)}, preview.webm ${kb(webm)}, poster.webp ${kb(poster)} in ${relative(root, out) || out}`);
if (!keep) rmSync(work, { recursive: true, force: true });
