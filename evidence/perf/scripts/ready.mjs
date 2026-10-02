// Time to the first picture (ready) and to the whole car prepared (carReady), and the longest
// main-thread task on the way, per build and tier.
import { chromium } from '/home/user/automotive-simulation/node_modules/@playwright/test/index.mjs';
const BUILDS = (process.env.BUILDS ?? 'before=http://127.0.0.1:8888/automotive,after=http://127.0.0.1:4176/').split(',').map((x) => x.split('='));
const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'] });
for (const q of (process.env.TIERS ?? 'low,medium,high').split(','))
  for (const [name, base] of BUILDS) {
    const ctx = await b.newContext({ viewport: { width: 1280, height: 720 } });
    await ctx.addInitScript(() => { window.__lt = []; new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__lt.push(Math.round(e.duration)); }).observe({ type: 'longtask', buffered: true }); });
    const p = await ctx.newPage();
    const t0 = Date.now();
    await p.goto(`${base}?hooks=1&quality=${q}`);
    await p.waitForFunction(() => window.__fabStores?.useApp?.getState().ready, null, { timeout: 240000 });
    const ready = Date.now() - t0;
    await p.waitForFunction(() => window.__fabStores?.useApp?.getState().carReady, null, { timeout: 240000 });
    const car = Date.now() - t0;
    const lt = await p.evaluate(() => window.__lt.slice().sort((a, b) => b - a).slice(0, 4));
    console.log(JSON.stringify({ tier: q, build: name, readyMs: ready, carReadyMs: car, longestTasks: lt, programs: await p.evaluate(() => window.__fab.stage.renderer.info.programs.length) }));
    await ctx.close();
  }
await b.close();
