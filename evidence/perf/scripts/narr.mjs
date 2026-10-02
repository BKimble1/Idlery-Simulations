// Narration in the film, the way a visitor gets it: open the film, press "Turn sound on", and
// check that the narration element loads film-3 audio from the route and plays it.
//   node narr.mjs <origin> [out.json]
import { chromium } from '/home/user/Idlery-Simulations/node_modules/@playwright/test/index.mjs';
import { writeFileSync } from 'node:fs';
const [ORIGIN, OUT = 'narr.json'] = process.argv.slice(2);
const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'] });
const ctx = await b.newContext({ viewport: { width: 480, height: 300 } });
const page = await ctx.newPage();
const errors = [];
const audio = [];
page.on('pageerror', (e) => errors.push(String(e).slice(0, 200)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 200)); });
page.on('response', (r) => { if (/\/narration\//.test(r.url())) audio.push(`${r.status()} ${new URL(r.url()).pathname} ${r.headers()['content-type'] ?? ''}`); });
await page.goto(`${ORIGIN}/automotive?mode=watch&t=30&quality=low`, { timeout: 120000 });
await page.waitForFunction(() => window.__fabStores?.useApp?.getState().carReady ?? document.querySelector('.lesson__chapter'), null, { timeout: 180000 }).catch(() => {});
await page.waitForTimeout(5000);
await page.getByRole('button', { name: 'Turn sound on' }).click();
const samples = [];
for (let i = 0; i < 10; i++) {
  await page.waitForTimeout(1500);
  samples.push(await page.evaluate(() => { const a = window.__fabNarration; return a ? { src: a.currentSrc.replace(location.origin, ''), t: +a.currentTime.toFixed(2), paused: a.paused, ready: a.readyState } : null; }));
}
const heard = samples.filter((s) => s && !s.paused && s.t > 0);
const pass = heard.length > 0 && heard.every((s) => s.src.startsWith('/automotive/narration/film-3/')) && errors.length === 0 && audio.every((x) => x.startsWith('200') || x.startsWith('206'));
const res = { pass, samples, audioResponses: audio.slice(0, 8), errors };
console.log(JSON.stringify(res, null, 1));
writeFileSync(OUT, JSON.stringify(res, null, 1));
await b.close();
process.exit(pass ? 0 : 1);
