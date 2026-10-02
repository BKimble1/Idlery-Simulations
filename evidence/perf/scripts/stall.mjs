// Which frames of an Explore route stall the main thread, and which synchronous WebGL calls they
// made. Wraps the WebGL2 context's round-trip calls and the page's rAF callbacks.
//   BASE=... Q=medium node stall.mjs
import { chromium } from '/home/user/automotive-simulation/node_modules/@playwright/test/index.mjs';
const BASE = process.env.BASE ?? 'http://127.0.0.1:8888/automotive';
const Q = process.env.Q ?? 'medium';
const W = +(process.env.W ?? 1280), H = +(process.env.H ?? 720);
const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'] });
const ctx = await b.newContext({ viewport: { width: W, height: H } });
await ctx.addInitScript(() => {
  const w = window;
  w.__sync = {};
  w.__frames = [];
  const SYNC = ['getProgramParameter', 'getShaderParameter', 'getProgramInfoLog', 'getShaderInfoLog', 'readPixels', 'getError', 'getParameter', 'finish', 'clientWaitSync', 'getBufferSubData', 'getQueryParameter', 'checkFramebufferStatus', 'getUniformLocation', 'getAttribLocation', 'getActiveUniform', 'getActiveAttrib', 'getExtension', 'getSupportedExtensions', 'getContextAttributes', 'isContextLost'];
  for (const C of [w.WebGL2RenderingContext, w.WebGLRenderingContext]) {
    if (!C) continue;
    for (const k of SYNC) {
      const f = C.prototype[k];
      if (!f) continue;
      C.prototype[k] = function (...a) {
        const s = performance.now();
        const r = f.apply(this, a);
        const d = performance.now() - s;
        const e = (w.__sync[k] ??= { n: 0, ms: 0, max: 0 });
        e.n++; e.ms += d; if (d > e.max) e.max = d;
        if (w.__cur) { w.__cur.sync[k] = (w.__cur.sync[k] ?? 0) + d; }
        return r;
      };
    }
  }
  const raf = w.requestAnimationFrame.bind(w);
  w.requestAnimationFrame = (fn) => raf((t) => {
    const cur = { t, sync: {} };
    w.__cur = cur;
    const s = performance.now();
    fn(t);
    cur.ms = performance.now() - s;
    w.__cur = null;
    if (w.__rec) w.__frames.push(cur);
  });
  // timers (three's compileAsync polls on setTimeout) — count sync time outside rAF too
});
const p = await ctx.newPage();
p.on('pageerror', (e) => console.log('pageerror', String(e).slice(0, 200)));
await p.goto(`${BASE}?hooks=1&quality=${Q}&` + (process.env.DRIVE ? 'mode=simulate&scenario=drive' : 'mode=explore'));
await p.waitForFunction(() => window.__fabStores?.useApp?.getState().carReady, null, { timeout: 240000 });
await p.waitForTimeout(8000);
const route = process.env.DRIVE
  ? [
      "document.querySelector('.wb-start').click()",
      "(() => { const d = window.__fab.driver; d.pads.brake = 1; d.select('D'); })()",
      "(() => { const d = window.__fab.driver; d.pads.brake = null; d.pads.throttle = 0.5; })()",
      "(() => { const d = window.__fab.driver; d.pads.steer = 0.5; })()",
    ]
  : [{ system: 'power' }, { system: 'brakes' }, { system: 'driveline', part: 'differential' }, { system: null, part: null }];
for (const r of route) {
  const before = await p.evaluate(() => { window.__sync = {}; window.__frames = []; window.__rec = true; window.__keys0 = new Map(window.__fab.stage.renderer.info.programs.map((x) => [x.cacheKey, x.name])); return window.__fab.stage.renderer.info.programs.length; });
  if (typeof r === 'string') await p.evaluate(r); else await p.evaluate((q) => window.__fabStores.useApp.getState().go(q), r);
  await p.waitForTimeout(+(process.env.STEP ?? 12000));
  const res = await p.evaluate(() => {
    window.__rec = false;
    const fr = window.__frames.map((f) => ({ ms: Math.round(f.ms), sync: Object.fromEntries(Object.entries(f.sync).filter(([, v]) => v > 5).map(([k, v]) => [k, Math.round(v)])) }));
    const sync = Object.fromEntries(Object.entries(window.__sync).map(([k, v]) => [k, { n: v.n, ms: Math.round(v.ms), max: Math.round(v.max) }]));
    const now = new Map(window.__fab.stage.renderer.info.programs.map((x) => [x.cacheKey, x.name]));
    const added = [...now.keys()].filter((k) => !window.__keys0.has(k));
    const removed = [...window.__keys0.keys()].filter((k) => !now.has(k));
    const short = (k) => { const parts = k.split(','); return parts.slice(0, 3).join(',') + ' …(' + parts.length + ' fields)'; };
    const diffKey = (a, b) => { const A = a.split(','), B = b.split(','); const d = []; for (let i = 0; i < Math.max(A.length, B.length); i++) if (A[i] !== B[i]) d.push(i + ':' + A[i] + '→' + B[i]); return d.slice(0, 12).join(' '); };
    const nd = (a, b) => { const A = a.split(','), B = b.split(','); let d = 0; for (let i = 0; i < Math.max(A.length, B.length); i++) if (A[i] !== B[i]) d++; return d; };
    const pairs = added.map((k) => { let best = null, bd = 1e9; for (const x of window.__keys0.keys()) { const d = nd(x, k); if (d < bd) { bd = d; best = x; } } return { key: short(k), nearest: best ? diffKey(best, k) : '' }; });
    return { programs: now.size, frames: fr, sync, added: pairs, removed: removed.map((k) => window.__keys0.get(k) + ' ' + short(k)) };
  });
  console.log(JSON.stringify(r), 'programs', before, '->', res.programs);
  console.log('  frames', JSON.stringify(res.frames));
  console.log('  sync', JSON.stringify(res.sync));
  console.log('  added', JSON.stringify(res.added));
  console.log('  removed', JSON.stringify(res.removed));
}
await b.close();
