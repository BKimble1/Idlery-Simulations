// Where the software rasteriser spends a hero frame, V1 against V2: the frame interval with
// everything drawn, then with one group of materials switched off at a time.
//   node perf-split.mjs <out.json>
import { chromium } from '/home/user/automotive-simulation/node_modules/@playwright/test/index.mjs';
import { writeFileSync } from 'node:fs';
const [out = 'perf-split.json'] = process.argv.slice(2);
const BUILDS = [
  { v: 'V1', base: 'http://127.0.0.1:4178/' },
  { v: 'V2', base: 'http://127.0.0.1:8888/automotive' },
];
const N = +(process.env.N ?? 6);
const GROUPS = {
  all: null,
  'no body paint': '-paint$',
  'no glass': '-glass$',
  'no studio floor': '^studio-floor$',
  'no wheels': 'tyre|rim|wheel|spin',
};
const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'] });
const rows = [];
for (const { v, base } of BUILDS) {
  const p = await b.newPage({ viewport: { width: 640, height: 360 } });
  await p.goto(`${base}?hooks=1&quality=${process.env.Q ?? 'high'}`);
  await p.waitForFunction(() => window.__fabStores?.useApp?.getState().carReady, null, { timeout: 240000 });
  await p.waitForTimeout(8000);
  for (const [name, re] of Object.entries(GROUPS)) {
    const r = await p.evaluate(async ({ re, N }) => {
      const scene = window.__fab.stage.scene;
      const off = [];
      if (re) {
        const rx = new RegExp(re, 'i');
        scene.traverse((o) => {
          if (!o.isMesh || !rx.test(o.name)) return;
          for (const m of Array.isArray(o.material) ? o.material : [o.material]) if (m.visible) { m.visible = false; off.push(m); }
        });
      }
      const iv = [];
      await new Promise((res) => {
        let last = 0, n = -2;
        const f = (t) => { if (n >= 0) iv.push(t - last); last = t; n++; if (n < N) requestAnimationFrame(f); else res(); };
        requestAnimationFrame(f);
      });
      for (const m of off) m.visible = true;
      iv.sort((a, b) => a - b);
      return { materialsOff: off.length, medianMs: Math.round(iv[Math.floor(iv.length / 2)]), minMs: Math.round(iv[0]), calls: window.__fab.stage.renderer.info.render.calls };
    }, { re, N });
    rows.push({ build: v, quality: process.env.Q ?? 'high', group: name, ...r });
    console.log(v, name, JSON.stringify(r));
  }
  await p.close();
}
writeFileSync(out, JSON.stringify(rows, null, 1));
await b.close();
