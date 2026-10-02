// Real-time (requestAnimationFrame) measurements on SwiftShader: frame intervals and long tasks.
//   BASE=... node rt.mjs <out.json>
import { chromium } from '/home/user/automotive-simulation/node_modules/@playwright/test/index.mjs';
import { writeFileSync } from 'node:fs';
const [out] = process.argv.slice(2);
const BASE = process.env.BASE ?? 'http://127.0.0.1:4178/';
const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'] });
const info = await (async () => { const p = await b.newPage(); await p.goto('about:blank'); const v = await p.evaluate(() => navigator.userAgent); await p.close(); return v; })();
const results = { ua: info, runs: [] };
const CASES = [
  { id: 'hero-high', q: 'quality=high', w: 1280, h: 720 },
  { id: 'hero-low', q: 'quality=low', w: 1280, h: 720 },
  { id: 'film-high', q: 'mode=watch&t=40&quality=high', w: 1280, h: 720 },
  { id: 'phone-medium', q: 'quality=medium', w: 390, h: 844, dpr: 2 },
];
for (const c of CASES) {
  const p = await b.newPage({ viewport: { width: c.w, height: c.h }, deviceScaleFactor: c.dpr ?? 1 });
  const errs = [];
  p.on('pageerror', (e) => errs.push(String(e).slice(0, 200)));
  const t0 = Date.now();
  await p.goto(`${BASE}?hooks=1&${c.q}`);
  await p.waitForFunction(() => window.__fabStores?.useApp?.getState().ready, null, { timeout: 180000 });
  const tReady = Date.now() - t0;
  await p.waitForFunction(() => window.__fabStores?.useApp?.getState().carReady, null, { timeout: 180000 });
  const tCar = Date.now() - t0;
  await p.waitForTimeout(1500);
  const m = await p.evaluate(async () => {
    const iv = [];
    const longs = [];
    const po = new PerformanceObserver((l) => { for (const e of l.getEntries()) longs.push(Math.round(e.duration)); });
    try { po.observe({ type: 'longtask', buffered: false }); } catch {}
    let last = performance.now();
    await new Promise((res) => {
      const end = last + 6000;
      const f = (t) => { iv.push(t - last); last = t; if (t < end) requestAnimationFrame(f); else res(); };
      requestAnimationFrame(f);
    });
    po.disconnect();
    iv.sort((a, b) => a - b);
    const q = (x) => iv[Math.min(iv.length - 1, Math.floor(x * iv.length))];
    const st = window.__fab.stage;
    return { frames: iv.length, median: +q(0.5).toFixed(1), p95: +q(0.95).toFixed(1), max: +iv[iv.length - 1].toFixed(1), stalls: iv.filter((x) => x > 100).length, longTasks: longs.length, longestTask: Math.max(0, ...longs), dpr: devicePixelRatio, canvas: [st.renderer.domElement.width, st.renderer.domElement.height], tier: window.__fab.stage.currentTier, calls: st.renderer.info.render.calls, tris: st.renderer.info.render.triangles, geometries: st.renderer.info.memory.geometries, textures: st.renderer.info.memory.textures, programs: st.renderer.info.programs?.length };
  });
  results.runs.push({ id: c.id, viewport: [c.w, c.h], readyMs: tReady, carReadyMs: tCar, ...m, errors: errs });
  console.log(c.id, JSON.stringify({ readyMs: tReady, carReadyMs: tCar, ...m }));
  await p.close();
}
writeFileSync(out, JSON.stringify(results, null, 1));
await b.close();
