// When do main-thread long tasks happen relative to authored motion during start-up?
import { chromium } from '/home/user/automotive-simulation/node_modules/@playwright/test/index.mjs';
const [base, q = 'high', query = ''] = process.argv.slice(2);
const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'] });
const ctx = await b.newContext({ viewport: { width: 1280, height: 720 } });
await ctx.addInitScript(() => {
  window.__lt = []; window.__mv = [];
  new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__lt.push([Math.round(e.startTime), Math.round(e.duration)]); }).observe({ type: 'longtask', buffered: true });
  const tick = () => { const f = window.__fab; if (f?.director) { const m = !f.director.settled; const last = window.__mv[window.__mv.length - 1]; if (!last || last[1] !== m) window.__mv.push([Math.round(performance.now()), m]); } setTimeout(tick, 20); };
  tick();
});
const p = await ctx.newPage();
await p.goto(`${base}?hooks=1&quality=${q}${query ? '&' + query : ''}`);
await p.waitForFunction(() => window.__fabStores?.useApp?.getState().carReady, null, { timeout: 240000 });
await p.waitForTimeout(1000);
const r = await p.evaluate(() => ({ lt: window.__lt.filter(([, d]) => d > 200), mv: window.__mv, carReadyAt: Math.round(performance.now()) }));
// classify each long task: did it start while something authored was moving?
const moving = (t) => { let m = false; for (const [at, v] of r.mv) { if (at > t) break; m = v; } return m; };
console.log('motion changes', JSON.stringify(r.mv));
console.log('long tasks >200ms [start, dur, during motion]', JSON.stringify(r.lt.map(([s, d]) => [s, d, moving(s)])));
await b.close();
