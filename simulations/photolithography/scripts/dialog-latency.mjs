#!/usr/bin/env node
/**
 * How long after a click on Chapters is the drawer on screen? (real time, round four)
 *
 *   node scripts/dialog-latency.mjs <base-url> [--runs 3] [--path /?step=coat] [--settle 20]
 *       [--size 1440x900] [--out results.json]
 *
 * Each run loads the lesson in a fresh browser, lets it play for --settle seconds, then records
 * a Chrome trace with screenshots around a click on the header's Chapters button. A trace's
 * screenshots carry the time each picture was due on screen (`expected_display_time`), so the
 * answer does not depend on how late a capture reaches the script (on a software renderer a
 * capture waits behind the renderer's work, like everything else). Each screenshot's drawer
 * region (the right-hand 420 CSS px, below the header) is compared with the last one, the
 * drawer open: "on screen" is the first picture after the click more than half-way from the
 * picture before it to that one, "complete" more than 95 % of the way. The same run records
 * the stage's frames drawn after the click, where the page exposes them (?hooks=1 builds).
 */
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const args = process.argv.slice(2);
const base = args[0];
if (!base) {
  console.error('usage: node scripts/dialog-latency.mjs <base-url> [--runs N] [--path /?step=coat] [--settle s] [--size WxH] [--out file]');
  process.exit(1);
}
const opt = (name, def) => {
  const i = args.indexOf('--' + name);
  return i >= 0 ? args[i + 1] : def;
};
const runs = Number(opt('runs', 3));
const lesson = opt('path', '/?step=coat');
const settle = Number(opt('settle', 20));
const [W, H] = opt('size', '1440x900').split('x').map(Number);
const out = opt('out', null);
const DRAWER_W = 420;

const launch = () => chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'] });

/** The share of the drawer on screen in each screenshot (decoded and compared in a page). */
async function shares(browser, shots) {
  const page = await browser.newPage();
  const r = await page.evaluate(
    async ({ shots, drawerShare }) => {
      const load = (b64) =>
        new Promise((ok, fail) => {
          const img = new Image();
          img.onload = () => ok(img);
          img.onerror = fail;
          img.src = 'data:image/jpeg;base64,' + b64;
        });
      const lum = [];
      let w = 0;
      let h = 0;
      for (const s of shots) {
        const img = await load(s);
        w = img.naturalWidth;
        h = img.naturalHeight;
        const c = document.createElement('canvas');
        c.width = w;
        c.height = h;
        const g = c.getContext('2d');
        g.drawImage(img, 0, 0);
        const x0 = Math.floor(w * (1 - drawerShare)) + 4;
        const y0 = Math.floor(h * 0.12);
        const y1 = Math.floor(h * 0.95);
        const d = g.getImageData(x0, y0, w - 4 - x0, y1 - y0).data;
        const l = new Float32Array(d.length / 4);
        for (let i = 0; i < l.length; i++) l[i] = 0.299 * d[4 * i] + 0.587 * d[4 * i + 1] + 0.114 * d[4 * i + 2];
        lum.push(l);
      }
      const diff = (a, b) => {
        let s = 0;
        for (let i = 0; i < a.length; i++) s += Math.abs(a[i] - b[i]);
        return s / a.length;
      };
      return { lum: lum.map((l) => diff(l, lum[lum.length - 1])), w, h };
    },
    { shots, drawerShare: DRAWER_W / W },
  );
  await page.close();
  return r.lum;
}

async function once(n) {
  const browser = await launch();
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  await page.goto(base + '/');
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
  await page.goto(base + lesson + (lesson.includes('?') ? '&' : '?') + 'hooks=1');
  await page.locator('h1.step-title').waitFor({ timeout: 60_000 });
  await page.waitForTimeout(settle * 1000);
  const trace = path.join(os.tmpdir(), `dialog-latency-${process.pid}-${n}.json`);
  await browser.startTracing(page, { path: trace, screenshots: true, categories: ['devtools.timeline', 'disabled-by-default-devtools.timeline', 'disabled-by-default-devtools.timeline.frame', 'toplevel', 'blink'] });
  await page.waitForTimeout(2000);
  const btn = page.getByRole('button', { name: 'Chapters' }).first();
  const box = await btn.boundingBox();
  const before = await page.evaluate(() => (window.__fab ? window.__fab.gl.info.render.frame : null));
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await page.waitForTimeout(22_000);
  const after = await page.evaluate(() => (window.__fab ? window.__fab.gl.info.render.frame : null));
  await browser.stopTracing();
  const tr = JSON.parse(fs.readFileSync(trace, 'utf8'));
  fs.unlinkSync(trace);
  const ev = Array.isArray(tr) ? tr : tr.traceEvents;
  const click = ev.find((e) => e.name === 'EventDispatch' && e.args?.data?.type === 'click');
  const shots = ev.filter((e) => e.name === 'Screenshot').sort((a, b) => a.args.expected_display_time - b.args.expected_display_time);
  const at = shots.map((e) => (e.args.expected_display_time - click.ts) / 1000);
  const d = await shares(browser, shots.map((e) => e.args.snapshot));
  await browser.close();
  // the picture before the click is the reference for "none of the drawer"
  const pre = at.findLastIndex((t) => t < 0);
  const base0 = d[pre >= 0 ? pre : 0] || 1;
  const shown = d.map((x) => 1 - x / base0);
  const first = (min) => {
    const i = at.findIndex((t, k) => t >= 0 && shown[k] > min);
    return i < 0 ? null : Math.round(at[i]);
  };
  return {
    onScreenMs: first(0.5),
    completeMs: first(0.95),
    stageFramesAfterClick: before === null || after === null ? null : after - before,
    pictures: at.map((t, k) => [Math.round(t), Math.round(shown[k] * 100) / 100]).filter(([t]) => t > -3000),
  };
}

const results = [];
for (let n = 0; n < runs; n++) {
  const r = await once(n);
  results.push(r);
  console.log(`run ${n + 1}: on screen ${r.onScreenMs} ms after the click, complete ${r.completeMs} ms; stage frames drawn after the click: ${r.stageFramesAfterClick}`);
}
const sorted = (k) => results.map((r) => r[k]).filter((v) => v !== null).sort((a, b) => a - b);
const median = (v) => (v.length ? v[Math.floor((v.length - 1) / 2)] : null);
const summary = { base, lesson, size: `${W}x${H}`, settle, runs, onScreenMs: sorted('onScreenMs'), completeMs: sorted('completeMs'), medianOnScreenMs: median(sorted('onScreenMs')), results };
console.log(`median: on screen ${summary.medianOnScreenMs} ms (runs: ${summary.onScreenMs.join(', ')})`);
if (out) fs.writeFileSync(out, JSON.stringify(summary, null, 2));
