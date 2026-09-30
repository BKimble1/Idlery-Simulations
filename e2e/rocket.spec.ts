import { expect, test, type Page } from '@playwright/test';
import simulations from '../simulations.config.mjs';
import { overflow, watchErrors } from './helpers';

/**
 * Rocket Flight & Mission Simulation (KIMBLE Rocket Engineering) at its route, /rocket, and its
 * card on the homepage: the page at every address it is reached by, on a visit and a refresh, the
 * way back to FAB / ONE, a clean start, a mission and the narrated film loading everything from
 * the route, and the files it loads (their types, their caching, and a 404 for a file that is
 * not there). Its 3D scenes take a long time to draw with software WebGL, so these wait for the
 * interface and a canvas on screen, not for the scene to be finished.
 */

const ORIGIN = 'http://127.0.0.1:8888';
const rocket = simulations.find((s) => s.slug === 'rocket')!;
const LOAD = { timeout: 180_000 };

/** The simulation's interface is up: its header and the 3D stage's canvas. */
async function shell(page: Page) {
  await expect(page.locator('.app header.header')).toBeVisible(LOAD);
  await expect(page.locator('.app .stage canvas')).toBeVisible(LOAD);
}

test.describe.configure({ timeout: 600_000 });

test('the homepage lists Photolithography, then Rocket Flight & Mission Simulation as 02, as matching rows', async ({ page }, info) => {
  const errors = watchErrors(page);
  await page.goto('/');
  const cards = page.locator('article.card');
  await expect(cards).toHaveCount(2);
  await expect(cards.nth(0).getByRole('heading', { level: 3 })).toHaveText('Photolithography');
  await expect(cards.nth(1).getByRole('heading', { level: 3 })).toHaveText('Rocket Flight & Mission Simulation');
  expect(simulations.map((s) => s.slug)).toEqual(['photolithography', 'rocket']);

  const card = cards.nth(1);
  // "02 · AEROSPACE ENGINEERING": the number is the card's place, the field is set in capitals
  await expect(card.locator('.card__num')).toHaveText('02');
  await expect(cards.nth(0).locator('.card__num')).toHaveText('01');
  const field = await card.locator('.card__field').evaluate((el) => ({ shown: (el as HTMLElement).innerText, upper: getComputedStyle(el).textTransform }));
  expect(field.upper).toBe('uppercase');
  expect(field.shown.replace(/\s+/g, ' ')).toMatch(/^02 ?AEROSPACE ENGINEERING$/);
  await expect(card.getByText('From the launch pad to orbit.', { exact: true })).toBeVisible();
  await expect(card.getByText(rocket.summary, { exact: true })).toBeVisible();
  const facts = await card.locator('.card__facts li').allTextContents();
  expect(facts).toEqual(['6 mission types', 'Interactive cutaways', 'Guided mission films']);
  const launch = card.getByRole('link', { name: 'Launch simulation: Rocket Flight & Mission Simulation' });
  await expect(launch).toHaveAttribute('href', '/rocket');
  await expect(launch).toHaveText('Launch simulation');
  expect(await card.innerText(), 'no em dashes in the card').not.toContain('—');

  // the two cards are alike: full width, one above the other; on wide screens the preview is on
  // the left of the text, on phones above it
  const boxes = await cards.evaluateAll((els) =>
    els.map((el) => {
      const r = (sel: string) => el.querySelector(sel)!.getBoundingClientRect();
      const c = el.getBoundingClientRect();
      const m = r('.card__media');
      const b = r('.card__body');
      return { top: c.top, bottom: c.bottom, left: c.left, width: c.width, media: { left: m.left, right: m.right, top: m.top, bottom: m.bottom }, body: { left: b.left, top: b.top } };
    }),
  );
  const wrap = await page.locator('.cards').evaluate((el) => el.getBoundingClientRect().width);
  for (const b of boxes) expect(Math.abs(b.width - wrap)).toBeLessThan(1);
  expect(boxes[1].top).toBeGreaterThan(boxes[0].bottom);
  expect(boxes[0].left).toBeCloseTo(boxes[1].left, 0);
  if (info.project.name === 'desktop') {
    for (const b of boxes) {
      expect(b.media.right).toBeLessThanOrEqual(b.body.left + 1);
      expect(b.body.top).toBeLessThan(b.media.bottom);
    }
  } else {
    for (const b of boxes) expect(b.media.bottom).toBeLessThanOrEqual(b.body.top + 1);
  }
  expect(await overflow(page)).toBeLessThanOrEqual(0);
  expect(errors).toEqual([]);
});

test('/rocket answers with its page at every address, without redirecting', async ({ request }, info) => {
  test.skip(info.project.name !== 'desktop', 'server behaviour, once');
  for (const path of ['/rocket', '/rocket/', '/rocket?v=mission&m=leo', '/rocket/?v=mission&m=leo', '/rocket/?v=explore&part=turbopump&view=cutaway', '/rocket/index.html']) {
    const r = await request.get(path, { maxRedirects: 0 });
    expect(r.status(), path).toBe(200);
    expect(r.headers()['content-type'], path).toBe('text/html; charset=UTF-8');
    const html = await r.text();
    expect(html, path).toContain('<title>KIMBLE · Rocket Engineering</title>');
    expect(html).toContain('src="/rocket/assets/');
    expect(html).toContain('href="/rocket/brand/kimble-mark.svg"');
    expect(html).not.toMatch(/(src|href)="(\.\/|\/(?!rocket\/))/);
  }
});

for (const path of ['/rocket', '/rocket/', '/rocket/?v=mission&m=leo']) {
  test(`a direct visit to ${path} opens the simulation, and a refresh keeps the address`, async ({ page }) => {
    const errors = watchErrors(page);
    const res = await page.goto(path);
    expect(res?.status()).toBe(200);
    expect(res?.request().redirectedFrom()).toBeNull();
    await shell(page);
    const url = new URL(page.url());
    expect(url.pathname).toBe(path.split('?')[0]);
    if (path.includes('?')) {
      expect(url.searchParams.get('v')).toBe('mission');
      expect(url.searchParams.get('m')).toBe('leo');
    }
    await page.reload();
    await shell(page);
    expect(new URL(page.url()).pathname).toBe(path.split('?')[0]);
    if (path.includes('?')) expect(new URL(page.url()).searchParams.get('m')).toBe('leo');
    expect(await overflow(page)).toBeLessThanOrEqual(0);
    expect(errors.filter((e) => !/WebGL|GPU stall/.test(e))).toEqual([]);
  });
}

test('the header shows "Back to FAB / ONE", on screen, and it leads home', async ({ page }, info) => {
  await page.goto('/rocket');
  await shell(page);
  // the header's link: labelled on wide screens, a back button first in the header below 960 px
  // (its accessible name is the full label), with the labelled link on the home card as well
  const back = page.getByRole('banner').getByRole('link', { name: 'Back to FAB / ONE' });
  await expect(back).toBeVisible();
  await expect(back).toHaveAttribute('href', '/');
  if (info.project.name === 'phone') {
    const labelled = page.getByRole('main').getByRole('link', { name: 'Back to FAB / ONE' });
    await expect(labelled).toBeVisible();
    await expect(labelled).toHaveText(/Back to FAB \/ ONE/);
    await expect(labelled).toHaveAttribute('href', '/');
  } else {
    await expect(back).toHaveText(/Back to FAB \/ ONE/);
  }
  // wholly on screen, clear of the header's controls, which are all on screen too
  const vw = page.viewportSize()!.width;
  const b = (await back.boundingBox())!;
  expect(b.x).toBeGreaterThanOrEqual(0);
  expect(b.x + b.width).toBeLessThanOrEqual(vw);
  const others = await page.locator('.app header.header > :not(.hub-link):not(.header__spacer)').evaluateAll((els) =>
    els.map((e) => e.getBoundingClientRect()).map((r) => ({ left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width })),
  );
  for (const o of others.filter((o) => o.width > 0)) {
    const apart = o.right <= b.x + 0.5 || o.left >= b.x + b.width - 0.5 || o.bottom <= b.y + 0.5 || o.top >= b.y + b.height - 0.5;
    expect(apart, `the back link overlaps a header control (${JSON.stringify(o)})`).toBe(true);
    expect(o.left, 'a header control is off screen').toBeGreaterThanOrEqual(-0.5);
    expect(o.right, 'a header control is off screen').toBeLessThanOrEqual(vw + 0.5);
  }
  await back.click();
  await expect(page).toHaveURL(`${ORIGIN}/`);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Step inside real engineering.');
  // and from a mission
  await page.goto('/rocket/?v=mission&m=leo');
  await shell(page);
  await page.getByRole('banner').getByRole('link', { name: 'Back to FAB / ONE' }).click();
  await expect(page).toHaveURL(`${ORIGIN}/`);
});

test('the home screen starts cleanly: nothing fails to load, nothing is logged as an error', async ({ page }) => {
  const errors = watchErrors(page);
  const failed: string[] = [];
  const outside: string[] = [];
  page.on('response', (r) => {
    if (r.status() >= 400) failed.push(`${r.status()} ${r.url()}`);
  });
  page.on('requestfailed', (r) => failed.push(`${r.failure()?.errorText} ${r.url()}`));
  page.on('request', (r) => {
    const u = new URL(r.url());
    if (u.origin === ORIGIN && u.pathname !== '/rocket' && !u.pathname.startsWith('/rocket/')) outside.push(u.pathname);
    if (u.origin !== ORIGIN && !/^(data|blob):/.test(r.url())) outside.push(r.url());
  });
  await page.goto('/rocket');
  await shell(page);
  await expect(page.locator('.overlay')).toBeVisible();
  await page.waitForTimeout(10_000); // textures and the rest of the hangar arrive
  expect(failed).toEqual([]);
  expect(outside, 'everything the simulation loads comes from its route').toEqual([]);
  expect(errors).toEqual([]);
});

/** Where the 3D scene is now (the simulation's test hooks, on with ?hooks=1). */
async function location(page: Page, loc: 'hangar' | 'flight') {
  await page.waitForFunction((l) => (window as unknown as { __rocketFrame?: { location: string; n: number } }).__rocketFrame?.location === l, loc, LOAD);
  await page.waitForFunction(() => ((window as unknown as { __rocketFrame?: { n: number } }).__rocketFrame?.n ?? 0) > 5, null, LOAD);
}

test('a mission and the narrated film load everything they need from the route', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'the phone loads the same files');
  const errors = watchErrors(page);
  const failed: string[] = [];
  const outside: string[] = [];
  const paths: string[] = [];
  page.on('response', (r) => {
    if (r.status() >= 400) failed.push(`${r.status()} ${r.url()}`);
  });
  page.on('requestfailed', (r) => failed.push(`${r.failure()?.errorText} ${r.url()}`));
  page.on('request', (r) => {
    const u = new URL(r.url());
    if (/^(data|blob):/.test(r.url())) return;
    if (u.origin !== ORIGIN) return outside.push(r.url());
    paths.push(u.pathname);
    if (u.pathname !== '/rocket' && !u.pathname.startsWith('/rocket/')) outside.push(u.pathname);
  });
  // a mission: the launch site, the Earth and the sky, drawn from files under /rocket/
  await page.goto('/rocket/?v=mission&m=leo&hooks=1');
  await location(page, 'flight');
  await expect(page.getByRole('button', { name: /Play mission|Pause mission/ })).toBeVisible();
  await expect.poll(() => paths.filter((p) => p.startsWith('/rocket/textures/')).length, LOAD).toBeGreaterThan(3);
  for (const folder of ['earth', 'sky', 'site']) expect(paths.some((p) => p.startsWith(`/rocket/textures/${folder}/`)), folder).toBe(true);
  // the narrated film: its manifest and its first spoken segment, from /rocket/narration/
  await page.goto('/rocket/?v=watch&hooks=1');
  await page.getByRole('button', { name: /Overview: Satellite to low Earth orbit/ }).click();
  await location(page, 'flight');
  await expect(page.locator('.caption')).toBeVisible(LOAD);
  await expect.poll(() => paths.some((p) => /^\/rocket\/narration\/film-1\/[\w-]+\.mp3$/.test(p)), LOAD).toBe(true);
  expect(paths).toContain('/rocket/narration/film-1/manifest.json');
  expect(failed).toEqual([]);
  expect(outside, 'everything the simulation loads comes from its route').toEqual([]);
  expect(errors.filter((e) => !/WebGL|GPU stall/.test(e))).toEqual([]);
});

test('its files come with the right types and caching; a missing one is a 404, never the page', async ({ request }, info) => {
  test.skip(info.project.name !== 'desktop', 'server behaviour, once');
  const html = await (await request.get('/rocket/')).text();
  const expectType = async (path: string, type: RegExp, cache?: RegExp) => {
    const r = await request.get(path, { maxRedirects: 0 });
    expect(r.status(), path).toBe(200);
    expect(r.headers()['content-type'], path).toMatch(type);
    expect((await r.body()).length, path).toBeGreaterThan(0);
    if (cache) expect(r.headers()['cache-control'], path).toMatch(cache);
    return r;
  };
  const immutable = /^public, max-age=31536000, immutable$/;
  const revalidated = /^public, max-age=3600, stale-while-revalidate=86400$/;

  const script = /<script type="module" crossorigin src="([^"]+)"/.exec(html)![1];
  await expectType(script, /^text\/javascript\b/, immutable);
  for (const [, href] of html.matchAll(/<link rel="modulepreload" crossorigin href="([^"]+)"/g)) await expectType(href, /^text\/javascript\b/, immutable);
  const css = /<link rel="stylesheet" crossorigin href="([^"]+)"/.exec(html)![1];
  const sheet = await expectType(css, /^text\/css\b/, immutable);
  const font = /url\((\/rocket\/assets\/[^)]+\.woff2)\)/.exec(await sheet.text())![1];
  await expectType(font, /^font\/woff2$/, immutable);
  await expectType('/rocket/brand/kimble-mark.svg', /^image\/svg\+xml$/);

  // textures and narration keep their names from build to build: cached, but never "immutable"
  for (const t of ['textures/earth/day_2048.jpg', 'textures/earth/night_2048.jpg', 'textures/moon/lroc_2048.jpg', 'textures/sky/tycho_2880.jpg', 'textures/site/cover.png', 'textures/earth/water_2048.png'])
    await expectType(`/rocket/${t}`, t.endsWith('.png') ? /^image\/png$/ : /^image\/jpeg$/, revalidated);
  const manifest = await expectType('/rocket/narration/film-1/manifest.json', /^application\/json\b/, revalidated);
  const segments = (await manifest.json()).segments as { file: string }[];
  expect(segments.length).toBeGreaterThan(50);
  await expectType(`/rocket/narration/film-1/${segments[0].file}`, /^audio\/mpeg$/, revalidated);
  const part = await request.get(`/rocket/narration/film-1/${segments[0].file}`, { headers: { Range: 'bytes=0-1023' } });
  expect(part.status()).toBe(206);

  // a file that is not there is a 404 (the site's not-found page), never the simulation's page
  for (const path of ['/rocket/assets/missing.js', '/rocket/assets/missing.css', '/rocket/textures/earth/missing.jpg', '/rocket/narration/film-1/missing.mp3', '/rocket/narration/film-1/missing.json', '/rocket/no/such/page']) {
    const r = await request.get(path, { maxRedirects: 0 });
    expect(r.status(), path).toBe(404);
    expect(r.headers()['content-type'], path).not.toMatch(/javascript|css|image|audio|json/);
    expect(await r.text(), path).not.toContain('Rocket Engineering');
  }
  // dev-only files were left out of the import
  for (const path of ['/rocket/og/preview.mp4', '/rocket/narration/film-1/qa.json']) expect((await request.get(path)).status(), path).toBe(404);
});
