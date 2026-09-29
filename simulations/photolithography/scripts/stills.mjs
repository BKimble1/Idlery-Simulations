// Matched stills for before/after comparisons (docs/ROUND4.md): the same lessons, at the same
// progress, viewport, pixel ratio and quality tier, on any build that exposes the test hooks.
//
//   node scripts/stills.mjs <baseUrl> <spec.json> <outDir> [--only a,b]
//
// spec: { "viewport": [1280, 800], "dpr": 1, "query": "quality=low", "touch": false,
//         "groups": [ { "name": "coat", "path": "/?step=coat", "points": [0.1, 0.3] },
//                     { "name": "explore-track", "path": "/?explore=track" },
//                     { "name": "light", "path": "/?step=expose", "eval": "…", "points": [0.4] },
//                     { "name": "inset", "path": "/?step=expose", "points": [0.4], "page": true } ] }
// A group with points scrubs the lesson to each progress value (paused) and saves
// <outDir>/<name>@<p>.png; a group without points saves <outDir>/<name>.png once the camera
// has settled. With "page", each grab also saves <name>.page.png, a screenshot of the page. Frames are rendered on the harness clock (?virt=1) and read back from the
// drawing buffer in the same task: continuity evidence, never frame-rate evidence.
import { chromium } from '@playwright/test';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const [, , base, specPath, outDir, ...rest] = process.argv;
const only = rest.includes('--only') ? rest[rest.indexOf('--only') + 1].split(',') : null;
const spec = JSON.parse(readFileSync(specPath, 'utf8'));
mkdirSync(outDir, { recursive: true });
const [W, H] = spec.viewport ?? [1280, 800];
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const log = [];

for (const g of spec.groups) {
  if (only && !only.includes(g.name)) continue;
  const t0 = Date.now();
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: spec.dpr ?? 1, hasTouch: !!spec.touch, isMobile: !!spec.touch });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  const q = [g.path.includes('?') ? '&' : '?', 'virt=1', spec.query ? '&' + spec.query : '', g.query ? '&' + g.query : ''].join('');
  await page.goto(base + '/');
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
  await page.goto(base + g.path + q);
  try {
    await page.waitForFunction(() => !!window.__fab && window.__fab.stationBoxes.size > 0 && !!window.__fabAdvance, undefined, { timeout: 180000 });
  } catch (e) {
    log.push({ group: g.name, error: 'hooks never appeared: ' + e.message });
    await ctx.close();
    continue;
  }
  const grab = (name) =>
    page
      .evaluate(() => {
        window.__fabAdvance(1);
        const gl = window.__fab.gl.getContext();
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        const w = gl.drawingBufferWidth;
        const h = gl.drawingBufferHeight;
        const px = new Uint8Array(w * h * 4);
        gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
        const c = document.createElement('canvas');
        c.width = w;
        c.height = h;
        const cx = c.getContext('2d');
        const img = cx.createImageData(w, h);
        for (let y = 0; y < h; y++) img.data.set(px.subarray((h - 1 - y) * w * 4, (h - y) * w * 4), y * w * 4);
        cx.putImageData(img, 0, 0);
        return c.toDataURL('image/png');
      })
      .then(async (d) => {
        writeFileSync(`${outDir}/${name}.png`, Buffer.from(d.split(',')[1], 'base64'));
        // with "page": the whole page too (the canvas with the interface over it: insets, labels)
        if (g.page) await page.screenshot({ path: `${outDir}/${name}.page.png` });
      });
  const settle = async (max = 400) => {
    for (let n = 0; n < max; n += 5) {
      await page.evaluate(() => window.__fabAdvance(5));
      const ok = await page.evaluate(() => {
        const i = window.__fab.useStageInfo.getState();
        return !i.flying && i.shown && !i.loading;
      });
      if (ok) return n;
    }
    return -1;
  };
  const settled = await settle();
  // an optional change of view before the grabs (an overlay toggled, say): code run in the page
  if (g.eval) await page.evaluate(g.eval);
  // housings finish opening (0.8 s) and labels settle
  await page.evaluate(() => window.__fabAdvance(30));
  if (g.points?.length) {
    for (const p of g.points) {
      await page.evaluate((pp) => {
        const c = window.__fabStores.useClock.getState();
        c.set(pp);
        c.pause();
      }, p);
      await page.evaluate((n) => window.__fabAdvance(n), g.hold ?? 3);
      await grab(`${g.name}@${p}`);
    }
  } else {
    await grab(g.name);
  }
  const info = await page.evaluate(() => ({ ...window.__fab.useStageInfo.getState(), q: window.__fabQuality?.() }));
  log.push({ group: g.name, settledAfter: settled, ms: Date.now() - t0, tier: info.q?.tier, renderer: info.q?.renderer, errors: errors.slice(0, 5) });
  console.log(`${g.name}: ${((Date.now() - t0) / 1000).toFixed(0)} s${errors.length ? ' errors: ' + errors.slice(0, 2).join(' | ') : ''}`);
  await ctx.close();
}
writeFileSync(`${outDir}/stills-log.json`, JSON.stringify(log, null, 1));
await browser.close();
