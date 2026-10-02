// What a lab and a long film seek cost the page's main thread, V1 against V2, on real frames.
//   node perf-labs.mjs <out.json>
// For each lab: switch to it once the car is ready, then record main-thread long tasks (> 50 ms)
// until its baseline result is on the page. The same for a seek to 331 s in the film (V1's
// worst seek). An idle window of the same kind gives the frames' own long tasks for comparison.
import { chromium } from '/home/user/automotive-simulation/node_modules/@playwright/test/index.mjs';
import { writeFileSync } from 'node:fs';
const [out = 'perf-labs.json'] = process.argv.slice(2);
const BUILDS = [
  { v: 'V1', base: process.env.V1 ?? 'http://127.0.0.1:4178/' },
  { v: 'V2', base: process.env.V2 ?? 'http://127.0.0.1:8888/automotive' },
];
const LABS = ['gearing', 'engine', 'braking', 'suspension', 'weight', 'cornering', 'converter', 'electrical'];
const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'] });
const rows = [];
const watch = (p) => p.evaluate(() => {
  const w = window;
  w.__lt = [];
  w.__po?.disconnect();
  w.__po = new PerformanceObserver((l) => { for (const e of l.getEntries()) w.__lt.push(Math.round(e.duration)); });
  w.__po.observe({ type: 'longtask' });
  w.__t0 = performance.now();
});
const read = (p) => p.evaluate(() => ({ ms: Math.round(performance.now() - window.__t0), longest: Math.max(0, ...window.__lt), count: window.__lt.length, total: window.__lt.reduce((a, b) => a + b, 0) }));
for (const { v, base } of BUILDS) {
  const ctx = await b.newContext({ viewport: { width: 640, height: 360 } });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', (e) => errs.push(String(e).slice(0, 160)));
  await p.goto(`${base}?hooks=1&quality=low&mode=engineer&lab=gearing`);
  await p.waitForFunction(() => window.__fabStores?.useApp?.getState().carReady, null, { timeout: 240000 });
  await p.waitForFunction(() => /Baseline/.test(document.querySelector('.eng-results__title')?.textContent ?? ''), null, { timeout: 240000 });
  await p.waitForTimeout(4000);
  // idle: the same page, nothing asked of it
  await watch(p);
  await p.waitForTimeout(5000);
  rows.push({ build: v, what: 'idle lab page, 5 s', ...(await read(p)) });
  for (const lab of [...LABS.slice(1), 'gearing']) {
    await p.evaluate(() => document.querySelector('.eng-results__title')?.setAttribute('data-old', '1'));
    await watch(p);
    await p.evaluate((id) => window.__fabStores.useApp.getState().go({ lab: id }), lab);
    await p.waitForFunction(() => {
      const t = document.querySelector('.eng-results__title');
      return t && !t.hasAttribute('data-old') && /Baseline/.test(t.textContent ?? '');
    }, null, { timeout: 240000 });
    const r = await read(p);
    rows.push({ build: v, what: `lab ${lab}: switch to result`, ...r });
    console.log(v, lab, JSON.stringify(r));
    await p.waitForTimeout(1500);
  }
  // the film: a long seek
  await p.evaluate(() => window.__fabStores.useApp.getState().go({ mode: 'watch', lesson: null }));
  await p.waitForTimeout(8000);
  for (const t of [331.2, 60, 250]) {
    await watch(p);
    await p.evaluate((t) => (window.__fab.seekPending !== undefined ? window.__fab.seek(t) : window.__fab.player.seek(t)), t);
    await p.waitForFunction(() => !window.__fab.seekPending, null, { timeout: 120000 });
    await p.waitForTimeout(3000);
    const r = await read(p);
    rows.push({ build: v, what: `film seek to ${t} s (+3 s)`, ...r });
    console.log(v, 'seek', t, JSON.stringify(r));
  }
  rows.push({ build: v, what: 'page errors', errors: errs });
  await ctx.close();
}
writeFileSync(out, JSON.stringify(rows, null, 1));
await b.close();
