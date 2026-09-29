#!/usr/bin/env node
// Records a simulation's preview for its homepage card from the built site, as a visitor sees
// it: the page itself, at its route, frame by frame.
//
//   npm run build -- --skip-previews            (the first time; any build of the site will do)
//   node scripts/capture-preview.mjs photolithography [--only=expose,develop] [--keep] [--encode-only]
//
// --only renders some segments again, --keep keeps the frames (in the system's temp folder)
// for that, and --encode-only makes the videos from the kept frames without rendering.
//
// The shot list is site/media/<slug>/preview.json. Each segment opens the simulation at a deep
// link, prepares it, then renders `frames` frames. With an "advance" hook (Photolithography's
// ?virt=1 clock) every frame is exactly 1/fps s of simulation time, so the clip runs at true
// speed however slowly this machine renders; without one, frames are taken in real time.
// Segments are joined with short cross-fades into preview.mp4 (H.264) and preview.webm (VP9,
// for browsers without H.264), both without sound. The poster (poster.webp) is the clip's first
// frame; `og` names the frame for site/public/og.jpg (the 1200 × 630 image link previews show).
//
// Needs ffmpeg with libx264 and libvpx-vp9: $FFMPEG, else `ffmpeg` on the PATH, else Python's
// imageio-ffmpeg (pip install imageio-ffmpeg).
import { chromium } from '@playwright/test';
import { execFileSync, spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const root = join(import.meta.dirname, '..');
const slug = process.argv[2];
const only = (process.argv.find((a) => a.startsWith('--only='))?.slice(7) ?? '').split(',').filter(Boolean);
const keep = process.argv.includes('--keep');
const encodeOnly = process.argv.includes('--encode-only');
if (!slug) {
  console.error('usage: node scripts/capture-preview.mjs <slug> [--only=a,b] [--keep] [--encode-only]');
  process.exit(2);
}
const media = join(root, 'site', 'media', slug);
const spec = JSON.parse(readFileSync(join(media, 'preview.json'), 'utf8'));
if (!existsSync(join(root, 'dist', slug, 'index.html'))) {
  console.error(`dist/${slug} is missing: build the site first (npm run build -- --skip-previews).`);
  process.exit(1);
}

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

async function step(page, s) {
  if (s.wait) await page.waitForTimeout(s.wait);
  if (s.advance) for (let i = 0; i < s.advance; i++) await advance(page);
  if (s.eval) await page.evaluate(s.eval);
  if (s.click) await page.locator(s.click).first().click();
  if (s.key) await page.keyboard.press(s.key);
}
async function advance(page) {
  if (spec.advance) await page.evaluate(spec.advance);
  else await page.waitForTimeout(1000 / fps);
}

async function renderSegment(browser, port, seg) {
  const dir = join(work, seg.name);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: spec.viewport.dpr ?? 1, reducedMotion: 'no-preference' });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const sep = seg.path.includes('?') ? '&' : '?';
  await page.goto(`http://127.0.0.1:${port}/${slug}${seg.path}${spec.query ? sep + spec.query : ''}`, { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  if (spec.ready) await page.waitForFunction(spec.ready, undefined, { timeout: 180_000 });
  for (const s of seg.setup ?? []) await step(page, s);
  const t0 = Date.now();
  for (let i = 0; i < seg.frames; i++) {
    for (const ev of seg.during ?? []) if (ev.frame === i) await step(page, ev);
    await advance(page);
    await page.screenshot({ path: join(dir, `${String(i).padStart(5, '0')}.png`), timeout: 300_000 });
    if (i % 30 === 0) console.log(`${seg.name}: frame ${i}/${seg.frames} (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
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
    for (const seg of spec.segments) if (!only.length || only.includes(seg.name)) await renderSegment(browser, port, seg);
  } finally {
    await browser.close();
    server.kill();
  }
}
if (!encodeOnly) await render();

// Join the segments: each one fades into the next over `crossfade` seconds.
const segs = spec.segments.filter((s) => existsSync(join(work, s.name, '00000.png')));
if (segs.length !== spec.segments.length) {
  console.log(`Rendered ${segs.length} of ${spec.segments.length} segments; run without --only to make the video.`);
  process.exit(0);
}
const fade = spec.crossfade ?? 0.4;
const inputs = segs.flatMap((s) => ['-framerate', String(fps), '-i', join(work, s.name, '%05d.png')]);
let chain = '';
let last = '[0:v]';
let length = segs[0].frames / fps;
for (let i = 1; i < segs.length; i++) {
  const out = i === segs.length - 1 ? '[v]' : `[x${i}]`;
  chain += `${last}[${i}:v]xfade=transition=fade:duration=${fade}:offset=${(length - fade).toFixed(3)}${out};`;
  length += segs[i].frames / fps - fade;
  last = out;
}
const filter = segs.length > 1 ? `${chain}[v]format=yuv420p[out]` : '[0:v]format=yuv420p[out]';
const video = join(media, 'preview.mp4');
const webm = join(media, 'preview.webm');
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
ffmpeg(['-i', join(work, segs[0].name, '00000.png'), '-c:v', 'libwebp', '-quality', '82', join(media, 'poster.webp')]);
if (spec.og) {
  const frame = join(work, spec.og.segment, `${String(spec.og.frame).padStart(5, '0')}.png`);
  ffmpeg(['-i', frame, '-vf', 'scale=1200:-2:flags=lanczos,crop=1200:630', '-q:v', '4', join(root, 'site', 'public', 'og.jpg')]);
}
const kb = (f) => `${Math.round(statSync(f).size / 1024)} KB`;
console.log(`\n${length.toFixed(1)} s: preview.mp4 ${kb(video)}, preview.webm ${kb(webm)}, poster.webp ${kb(join(media, 'poster.webp'))}`);
if (!keep) rmSync(work, { recursive: true, force: true });
