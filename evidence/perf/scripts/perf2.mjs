// V1 and V2 side by side, on real frames (no virtual clock), Chromium + SwiftShader.
//   node perf2.mjs <out.json>
// Two kinds of number per case:
//  * main-thread work per frame: the duration of every requestAnimationFrame callback (the
//    model, the scene update and the WebGL command encoding). The software rasteriser runs in
//    the GPU process, so this is the page's own cost, largely independent of SwiftShader.
//  * frame interval: wall time between frames, dominated here by software rasterisation.
// Plus draw calls, triangles, shader programs, geometries and textures, and readiness times.
import { chromium } from '/home/user/automotive-simulation/node_modules/@playwright/test/index.mjs';
import { writeFileSync } from 'node:fs';
const [out = 'perf2.json'] = process.argv.slice(2);
const SECS = +(process.env.SECS ?? 12);
const BUILDS = [
  { v: 'V1', base: process.env.V1 ?? 'http://127.0.0.1:4178/' },
  { v: 'V2', base: process.env.V2 ?? 'http://127.0.0.1:8888/automotive' },
];
const CASES = [
  { id: 'hero 1280×720 high', q: 'quality=high', w: 1280, h: 720 },
  { id: 'hero 1280×720 low', q: 'quality=low', w: 1280, h: 720 },
  { id: 'film cutaway 1280×720 high', q: 'mode=watch&t=97&quality=high', w: 1280, h: 720 },
  { id: 'Explore moves 1280×720 medium', q: 'mode=explore&quality=medium', w: 1280, h: 720, route: true },
  { id: 'phone 390×844 @2x medium', q: 'quality=medium', w: 390, h: 844, dpr: 2, mobile: true },
  { id: 'workbench driving 1280×720 medium', q: 'mode=simulate&scenario=drive&quality=medium', w: 1280, h: 720, drive: true, only: 'V2' },
];
const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'] });
const rows = [];
const pct = (a, f) => (a.length ? +a[Math.min(a.length - 1, Math.floor(f * a.length))].toFixed(1) : null);
for (const c of CASES)
  for (const { v, base } of BUILDS) {
    if (c.only && c.only !== v) continue;
    const ctx = await b.newContext({ viewport: { width: c.w, height: c.h }, deviceScaleFactor: c.dpr ?? 1, isMobile: !!c.mobile, hasTouch: !!c.mobile });
    await ctx.addInitScript(() => {
      const raf = window.requestAnimationFrame.bind(window);
      const w = window;
      w.__cb = { on: false, ms: new Map() };
      w.__raf = raf; // the measuring loop uses the original, so only the page's callbacks count
      window.requestAnimationFrame = (fn) =>
        raf((t) => {
          const s = performance.now();
          fn(t);
          if (w.__cb.on) w.__cb.ms.set(t, (w.__cb.ms.get(t) ?? 0) + performance.now() - s);
        });
    });
    const p = await ctx.newPage();
    const errs = [];
    p.on('pageerror', (e) => errs.push(String(e).slice(0, 160)));
    const t0 = Date.now();
    await p.goto(`${base}?hooks=1&${c.q}`);
    await p.waitForFunction(() => window.__fabStores?.useApp?.getState().ready, null, { timeout: 240000 });
    const readyMs = Date.now() - t0;
    await p.waitForFunction(() => window.__fabStores?.useApp?.getState().carReady, null, { timeout: 240000 });
    const carReadyMs = Date.now() - t0;
    await p.waitForTimeout(8000); // the arrival move and any warm-up
    if (c.drive) {
      await p.locator('.wb-start').click();
      await p.waitForTimeout(3000);
      await p.evaluate(() => { const d = window.__fab.driver; d.pads.brake = 1; d.select('D'); });
      await p.waitForTimeout(500);
      await p.evaluate(() => { const d = window.__fab.driver; d.pads.brake = null; d.pads.throttle = 0.5; });
      await p.waitForTimeout(1500);
    }
    await p.evaluate(() => {
      const w = window;
      w.__iv = [];
      w.__long = [];
      w.__cb.ms.clear();
      w.__cb.on = true;
      let last = performance.now();
      const loop = (t) => { w.__iv.push(t - last); last = t; if (!w.__ivStop) w.__raf(loop); };
      w.__raf((t) => { last = t; w.__raf(loop); });
      try { new PerformanceObserver((l) => { for (const e of l.getEntries()) w.__long.push(e.duration); }).observe({ type: 'longtask' }); } catch {}
    });
    if (c.route) {
      const route = [{ system: 'power' }, { system: 'brakes' }, { system: 'driveline', part: 'differential' }, { system: null, part: null }];
      for (const r of route) {
        await p.evaluate((q) => window.__fabStores.useApp.getState().go(q), r);
        await p.waitForTimeout((SECS * 1000) / route.length);
      }
    } else await p.waitForTimeout(SECS * 1000);
    const r = await p.evaluate(() => {
      const w = window;
      w.__ivStop = true;
      w.__cb.on = false;
      const iv = w.__iv.slice(1).sort((a, b) => a - b);
      // the page's callbacks, summed per frame
      const cb = [...w.__cb.ms.values()].sort((a, b) => a - b);
      const st = w.__fab.stage;
      const info = st.renderer.info;
      return {
        frames: iv.length,
        iv, cb, cbFrames: cb.length,
        long: w.__long.length,
        longest: Math.round(Math.max(0, ...w.__long)),
        calls: info.render.calls,
        tris: info.render.triangles,
        programs: info.programs?.length,
        geometries: info.memory.geometries,
        textures: info.memory.textures,
        canvas: [st.renderer.domElement.width, st.renderer.domElement.height],
        speed: w.__fab.model?.state?.speed ?? w.__fab.model?.speed ?? null,
      };
    });
    const big = r.cb;
    const row = {
      case: c.id, build: v, readyMs, carReadyMs,
      frames: r.frames, appFrames: big.length, intervalMedianMs: pct(r.iv, 0.5), intervalP95Ms: pct(r.iv, 0.95),
      mainThreadMedianMs: pct(big, 0.5), mainThreadP95Ms: pct(big, 0.95), mainThreadMaxMs: big.length ? +big[big.length - 1].toFixed(1) : null,
      longTasks: r.long, longestTaskMs: r.longest,
      calls: r.calls, tris: r.tris, programs: r.programs, geometries: r.geometries, textures: r.textures, canvas: r.canvas,
      errors: errs,
    };
    console.log(JSON.stringify(row));
    rows.push(row);
    await ctx.close();
  }
writeFileSync(out, JSON.stringify({ ua: (await b.version()), secs: SECS, rows }, null, 1));
await b.close();
