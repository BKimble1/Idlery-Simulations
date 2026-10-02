// Checks an extracted FAB / ONE package served by the hub's Netlify-style server.
//   node zipcheck.mjs <origin e.g. http://127.0.0.1:8890> <out.json>
// Real browser (Chromium + SwiftShader), real requestAnimationFrame (no test clocks).
import { chromium } from '/home/user/Idlery-Simulations/node_modules/@playwright/test/index.mjs';
import { writeFileSync } from 'node:fs';
const [ORIGIN, OUT = 'zipcheck.json'] = process.argv.slice(2);
const results = [];
const ok = (name, pass, detail = '') => {
  results.push({ name, pass: !!pass, detail });
  console.log(`${pass ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`);
};
const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl', '--autoplay-policy=no-user-gesture-required'] });

// ── 1. every route, with and without a trailing slash, and refreshed
const routes = [
  ['/', 'Step inside real engineering.'],
  ['/photolithography', null],
  ['/rocket', null],
  ['/humanoid', null],
  ['/automotive', null],
];
{
  const ctx = await b.newContext({ viewport: { width: 1280, height: 720 } });
  for (const [path, h1] of routes) {
    for (const p of path === '/' ? ['/'] : [path, `${path}/`]) {
      const page = await ctx.newPage();
      const errors = [];
      const bad = [];
      page.on('pageerror', (e) => errors.push(String(e).slice(0, 200)));
      page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 200)); });
      page.on('response', (r) => { if (r.status() >= 400 && r.url().startsWith(ORIGIN)) bad.push(`${r.status()} ${new URL(r.url()).pathname}`); });
      const resp = await page.goto(ORIGIN + p, { waitUntil: 'load', timeout: 120000 });
      await page.waitForTimeout(path === '/' ? 1500 : 12000);
      await page.reload({ waitUntil: 'load', timeout: 120000 });
      await page.waitForTimeout(path === '/' ? 1500 : 12000);
      const title = await page.title();
      const heading = await page.locator('h1').first().textContent().catch(() => null);
      const canvas = path === '/' ? true : (await page.locator('canvas').count()) > 0;
      ok(`${p}: 200, renders, refresh, no errors`, resp.status() === 200 && canvas && errors.length === 0 && bad.length === 0, `status ${resp.status()}, title "${title}", h1 "${(heading ?? '').trim().slice(0, 40)}", canvas ${canvas}, errors ${JSON.stringify(errors.slice(0, 3))}, failed ${JSON.stringify(bad.slice(0, 5))}`);
      if (h1) ok(`${p}: homepage heading`, (heading ?? '').includes(h1));
      await page.close();
    }
  }
  // the homepage: four cards in order, previews that play
  const page = await ctx.newPage();
  await page.goto(ORIGIN + '/');
  const cards = await page.locator('article.card h3').allTextContents();
  ok('homepage: four cards in order', cards.length === 4 && /Photolithography/.test(cards[0]) && /Rocket/.test(cards[1]) && /Humanoid/.test(cards[2]) && /Automotive/.test(cards[3]), JSON.stringify(cards));
  const nums = await page.locator('.card__num').allTextContents();
  ok('homepage: cards numbered 01–04', JSON.stringify(nums) === JSON.stringify(['01', '02', '03', '04']), JSON.stringify(nums));
  const links = await page.locator('article.card a.card__launch, article.card a[href^="/"]').evaluateAll((as) => as.map((a) => a.getAttribute('href')));
  ok('homepage: launch links to the four routes', ['/photolithography', '/rocket', '/humanoid', '/automotive'].every((r) => links.includes(r)), JSON.stringify([...new Set(links)]));
  const playing = [];
  for (let i = 0; i < 4; i++) {
    const card = page.locator('article.card').nth(i);
    await card.scrollIntoViewIfNeeded();
    await page.waitForTimeout(2500);
    const v = await card.locator('video').evaluate((el) => ({ t: el.currentTime, ready: el.readyState, src: el.currentSrc.split('/').slice(-2).join('/'), paused: el.paused, w: el.videoWidth }));
    playing.push(v);
  }
  ok('homepage: each preview loads and plays in view', playing.every((v) => v.ready >= 2 && v.w > 0 && v.t > 0.3), JSON.stringify(playing));
  await ctx.close();
}

// ── 2. deep links, each in a fresh page
const deep = [
  ['/automotive?mode=watch&t=120', async (p) => p.evaluate(() => document.querySelector('.lesson__chapter')?.textContent ?? '')],
  ['/automotive?mode=explore&system=brakes&part=brake-caliper', async (p) => p.evaluate(() => document.querySelector('.ex h2')?.textContent ?? '')],
  ['/automotive?mode=engineer&lab=braking', async (p) => p.evaluate(() => document.querySelector('.eng h2')?.textContent ?? '')],
  ['/automotive?mode=simulate&scenario=overheat', async (p) => p.evaluate(() => document.querySelector('.sim h2')?.textContent ?? '')],
  ['/automotive?mode=simulate&scenario=drive', async (p) => p.evaluate(() => document.querySelector('.wb-start') ? 'workbench' : '')],
  ['/humanoid?mode=simulate&lab=walk', async (p) => p.evaluate(() => document.title)],
  ['/rocket?v=mission&m=leo', async (p) => p.evaluate(() => document.title)],
  ['/photolithography?step=expose', async (p) => p.evaluate(() => document.title)],
  ['/photolithography?explore=scanner', async (p) => p.evaluate(() => document.title)],
];
for (const [path, probe] of deep) {
  const ctx = await b.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await ctx.newPage();
  const errors = [];
  const bad = [];
  const workers = [];
  page.on('pageerror', (e) => errors.push(String(e).slice(0, 200)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 200)); });
  page.on('response', (r) => { if (r.status() >= 400 && r.url().startsWith(ORIGIN)) bad.push(`${r.status()} ${new URL(r.url()).pathname}`); });
  page.on('worker', (w) => workers.push(new URL(w.url()).pathname));
  const resp = await page.goto(ORIGIN + path, { timeout: 120000 });
  await page.waitForTimeout(25000);
  const seen = await probe(page);
  const url = page.url().replace(ORIGIN, '');
  ok(`${path}: lands`, resp.status() === 200 && !!seen && errors.length === 0 && bad.length === 0, `"${String(seen).trim().slice(0, 50)}", now at ${url}, workers ${JSON.stringify(workers)}, errors ${JSON.stringify(errors.slice(0, 3))}, failed ${JSON.stringify(bad.slice(0, 5))}`);
  if (path.includes('lab=braking')) {
    const title = await page.locator('.eng-results__title').textContent().catch(() => null);
    ok('automotive lab: the worker loads from /automotive/assets and computes the result', workers.length > 0 && workers.every((w) => w.startsWith('/automotive/assets/')) && /Baseline/.test(title ?? ''), `workers ${JSON.stringify(workers)}, result "${title}"`);
  }
  // Back to FAB / ONE
  const back = page.getByRole('link', { name: /Back to FAB \/ ONE/ }).first();
  if (await back.count()) {
    await back.click();
    await page.waitForURL(ORIGIN + '/', { timeout: 30000 }).catch(() => {});
    const n = await page.locator('article.card').count();
    ok(`${path.split('?')[0]}: Back to FAB / ONE reaches the four-card homepage`, page.url() === ORIGIN + '/' && n === 4, `at ${page.url()}, ${n} cards`);
  } else ok(`${path.split('?')[0]}: Back to FAB / ONE link present`, false, 'no link found');
  await ctx.close();
}

// ── 2b. narration sounds in the film (a small, low-quality window so SwiftShader keeps up)
{
  const ctx = await b.newContext({ viewport: { width: 480, height: 300 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e).slice(0, 200)));
  await page.goto(ORIGIN + '/automotive?mode=watch&t=30&quality=low', { timeout: 120000 });
  await page.waitForTimeout(20000);
  // sound is off until the visitor turns it on (a gesture, as browsers require)
  await page.getByRole('button', { name: 'Turn sound on' }).click();
  const play = page.getByRole('button', { name: 'Play', exact: true });
  if (await play.count()) await play.click();
  const samples = [];
  for (let i = 0; i < 6; i++) {
    await page.waitForTimeout(2500);
    samples.push(await page.evaluate(() => { const a = window.__fabNarration; return a ? { src: a.currentSrc.replace(location.origin, ''), t: +a.currentTime.toFixed(2), paused: a.paused, ready: a.readyState } : null; }));
  }
  const heard = samples.filter((s) => s && !s.paused && s.t > 0);
  ok('automotive narration plays from /automotive/narration/film-3/ in the film', heard.length > 0 && heard.every((s) => s.src.startsWith('/automotive/narration/film-3/')) && errors.length === 0, JSON.stringify(samples.slice(-3)) + ` errors ${JSON.stringify(errors.slice(0, 2))}`);
  await ctx.close();
}

// ── 3. types and statuses of what the routes load at run time
{
  const req = await b.newContext();
  const get = async (p) => { const r = await req.request.get(ORIGIN + p, { maxRedirects: 0 }); return { s: r.status(), t: r.headers()['content-type'] ?? '', h: r.headers() }; };
  const html = await (await req.request.get(ORIGIN + '/automotive/')).text();
  const js = [...html.matchAll(/(?:src|href)="(\/automotive\/assets\/[^"]+)"/g)].map((m) => m[1]);
  for (const p of js.slice(0, 4)) { const r = await get(p); ok(`type ${p}`, r.s === 200 && /javascript|css/.test(r.t), `${r.s} ${r.t}`); }
  const NARR = process.env.NARR ?? 'film-3';
  const mr = await get(`/automotive/narration/${NARR}/manifest.json`);
  ok(`narration manifest /automotive/narration/${NARR}/manifest.json`, mr.s === 200 && /json/.test(mr.t), `${mr.s} ${mr.t}`);
  const m = JSON.parse(await (await req.request.get(ORIGIN + `/automotive/narration/${NARR}/manifest.json`)).text());
  const mp3 = `/automotive/narration/${m.version}/${m.segments[0].file}`;
  const r1 = await get(mp3);
  ok(`narration ${mp3}`, r1.s === 200 && /audio\/mpeg/.test(r1.t), `${r1.s} ${r1.t} cache-control: ${r1.h['cache-control']}`);
  for (const p of ['/automotive/assets/missing.js', '/rocket/assets/missing.js', '/humanoid/assets/missing.js', '/photolithography/assets/missing.js', '/automotive/assets/missing.bin', '/nope']) {
    const r = await get(p);
    ok(`missing ${p} → 404 (not an HTML page with 200)`, r.s === 404, `${r.s} ${r.t}`);
  }
  for (const p of ['/media/automotive/', '/sitemap.xml', '/robots.txt']) { const r = await get(p); results.push({ name: `probe ${p}`, pass: true, detail: `${r.s} ${r.t}` }); }
  await req.close();
}

// ── 4. the Photolithography service worker: installed, then everything else
{
  const ctx = await b.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await ctx.newPage();
  await page.goto(ORIGIN + '/photolithography?watch');
  // Watch offers saving for offline; trigger the registration the way the app does if it is not automatic
  await page.waitForTimeout(15000);
  let regs = await page.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).map((r) => ({ scope: r.scope, active: !!r.active })));
  if (!regs.length) {
    // the app registers its worker when offline saving is chosen; register it the same way
    await page.evaluate(async () => { await navigator.serviceWorker.register('/photolithography/sw.js', { scope: '/photolithography' }); await navigator.serviceWorker.ready; });
    regs = await page.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).map((r) => ({ scope: r.scope, active: !!r.active })));
  }
  ok('photolithography service worker installs at its own scope', regs.length > 0 && regs.every((r) => new URL(r.scope).pathname.startsWith('/photolithography')), JSON.stringify(regs));
  await page.reload();
  await page.waitForTimeout(5000);
  const ctl = await page.evaluate(() => navigator.serviceWorker.controller?.scriptURL ?? null);
  ok('photolithography: controlled by its worker after a reload', !!ctl, String(ctl));
  for (const p of ['/', '/rocket', '/humanoid', '/automotive', '/automotive/']) {
    const q = await ctx.newPage();
    await q.goto(ORIGIN + p);
    await q.waitForTimeout(p === '/' ? 1000 : 8000);
    const c = await q.evaluate(() => navigator.serviceWorker.controller?.scriptURL ?? null);
    ok(`with the worker installed, ${p} is not controlled by it`, c === null, String(c));
    await q.close();
  }
  // a later visit (the installed worker serving from its cache, then updating)
  const again = await ctx.newPage();
  const errs = [];
  again.on('pageerror', (e) => errs.push(String(e).slice(0, 200)));
  await again.goto(ORIGIN + '/photolithography?step=expose');
  await again.waitForTimeout(12000);
  ok('photolithography: a later visit with the worker installed starts cleanly', errs.length === 0 && (await again.locator('canvas').count()) > 0, JSON.stringify(errs.slice(0, 3)));
  await ctx.close();
}

writeFileSync(OUT, JSON.stringify(results, null, 1));
const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length} of ${results.length} checks passed`);
await b.close();
process.exit(failed.length ? 1 : 0);
