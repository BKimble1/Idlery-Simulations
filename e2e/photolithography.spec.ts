import { expect, test, type Page } from '@playwright/test';
import { fresh, overflow, watchErrors } from './helpers';

/**
 * Photolithography at its route, /photolithography, as visitors reach it: a direct visit and a
 * refresh, lesson links, the way back to FAB / ONE and browser history, and the simulation's
 * Learn, Explore fab, Watch (with its narration) and Save for offline. The simulation's own,
 * much longer suite runs at this route too: npm run e2e:photolithography.
 */

const ORIGIN = 'http://127.0.0.1:8888';
const title = (page: Page) => page.locator('h1.step-title');

/** Requests the page makes to this site outside /photolithography (there should be none). */
function outside(page: Page): string[] {
  const out: string[] = [];
  page.on('request', (r) => {
    const u = new URL(r.url());
    if (u.origin === ORIGIN && u.pathname !== '/photolithography' && !u.pathname.startsWith('/photolithography/')) out.push(u.pathname);
  });
  return out;
}

test('a direct visit to /photolithography opens the simulation, and a refresh keeps it there', async ({ page }) => {
  const errors = watchErrors(page);
  const out = outside(page);
  await fresh(page, '/photolithography');
  out.length = 0; // (fresh() opened the homepage first)
  await expect(page).toHaveTitle('Photolithography — Build a chip, layer by layer · FAB / ONE');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Build a chip');
  await expect(page.locator('canvas').first()).toBeVisible({ timeout: 120_000 });
  await page.reload();
  await expect(page).toHaveURL(`${ORIGIN}/photolithography`);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Build a chip');
  await expect(page.locator('canvas').first()).toBeVisible({ timeout: 120_000 });
  await page.waitForTimeout(3000);
  expect(out, 'everything the simulation loads comes from its route').toEqual([]);
  expect(await overflow(page)).toBeLessThanOrEqual(0);
  expect(errors).toEqual([]);
});

test('the back link sits clear of the header; it and browser Back and Forward move between the two pages', async ({ page }) => {
  const errors = watchErrors(page);
  await fresh(page, '/');
  await page.getByRole('link', { name: 'Launch simulation: Photolithography' }).click();
  await expect(page).toHaveURL(`${ORIGIN}/photolithography`);
  const back = page.getByRole('link', { name: 'Back to FAB / ONE' });
  await expect(back).toBeVisible();
  await expect(back).toHaveAttribute('href', '/');
  // it does not collide with the header's other controls
  const b = (await back.boundingBox())!;
  const watch = (await page.getByRole('button', { name: 'Watch the film' }).boundingBox())!;
  expect(b.x + b.width).toBeLessThan(watch.x);
  expect(b.y).toBeGreaterThanOrEqual(0);

  await page.getByRole('button', { name: /Start learning/ }).click();
  await expect(page).toHaveURL(`${ORIGIN}/photolithography?step=arrive`);
  await back.click();
  await expect(page).toHaveURL(`${ORIGIN}/`);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Step inside real engineering.');
  await page.goBack();
  await expect(page).toHaveURL(`${ORIGIN}/photolithography?step=arrive`);
  await expect(title(page)).toBeVisible({ timeout: 60_000 });
  await page.goBack();
  await expect(page).toHaveURL(`${ORIGIN}/photolithography`);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Build a chip');
  await page.goBack();
  await expect(page).toHaveURL(`${ORIGIN}/`);
  await page.goForward();
  await expect(page).toHaveURL(`${ORIGIN}/photolithography`);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Build a chip');
  expect(errors).toEqual([]);
});

test('on narrow phones the header keeps the back link, the lesson’s place and the buttons apart', async ({ browser }, info) => {
  test.skip(info.project.name !== 'phone', 'phone widths');
  for (const width of [430, 414, 412, 393, 390, 375, 360, 320]) {
    const ctx = await browser.newContext({ baseURL: ORIGIN, viewport: { width, height: 740 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    const page = await ctx.newPage();
    for (const path of ['/photolithography', '/photolithography?step=coat', '/photolithography?explore=scanner', '/photolithography?watch']) {
      await page.goto(path);
      await page.locator('.topbar .wordmark').waitFor();
      await page.evaluate(() => document.fonts.ready);
      const r = await page.evaluate(() => {
        const shown = (sel: string) =>
          [...document.querySelectorAll(sel)].map((e) => e.getBoundingClientRect()).filter((b) => b.width > 0);
        const back = shown('.topbar .wordmark')[0];
        const place = shown('.topbar__centre .place > *');
        const actions = shown('.topbar__actions > *');
        return {
          back: [back.left, back.right],
          place: place.length ? [Math.min(...place.map((b) => b.left)), Math.max(...place.map((b) => b.right))] : null,
          actions: [Math.min(...actions.map((b) => b.left)), Math.max(...actions.map((b) => b.right))],
          overflow: document.documentElement.scrollWidth - window.innerWidth,
        };
      });
      const where = `${width} px, ${path}`;
      expect(r.back[0], where).toBeGreaterThanOrEqual(0);
      if (r.place) {
        expect(r.back[1], `${where}: back link and place`).toBeLessThanOrEqual(r.place[0]);
        expect(r.place[1], `${where}: place and buttons`).toBeLessThanOrEqual(r.actions[0]);
      } else expect(r.back[1], `${where}: back link and buttons`).toBeLessThanOrEqual(r.actions[0]);
      expect(r.actions[1], where).toBeLessThanOrEqual(width);
      expect(r.overflow, where).toBeLessThanOrEqual(0);
    }
    await ctx.close();
  }
});

test('Learn: start, continue; the address follows the lesson, and a lesson link or a refresh lands on it', async ({ page }) => {
  const errors = watchErrors(page);
  await fresh(page, '/photolithography');
  await page.getByRole('button', { name: /Start learning/ }).click();
  await expect(page).toHaveURL(`${ORIGIN}/photolithography?step=arrive`);
  await expect(title(page)).toHaveText('Meet the wafer');
  await expect(page.locator('canvas').first()).toBeVisible({ timeout: 120_000 });
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(page).toHaveURL(`${ORIGIN}/photolithography?step=transfer`);
  const second = await title(page).textContent();
  await page.reload();
  await expect(page).toHaveURL(`${ORIGIN}/photolithography?step=transfer`);
  await expect(title(page)).toHaveText(second!);
  await page.goBack();
  await expect(page).toHaveURL(`${ORIGIN}/photolithography?step=arrive`);
  await expect(title(page)).toHaveText('Meet the wafer');
  // a link straight to a lesson, and a refresh of it
  await page.goto('/photolithography?step=coat');
  await expect(title(page)).toHaveText('Coat the wafer');
  await page.reload();
  await expect(title(page)).toHaveText('Coat the wafer');
  await expect(page).toHaveURL(`${ORIGIN}/photolithography?step=coat`);
  // the same address with a trailing slash is the same page
  await page.goto('/photolithography/?step=expose');
  await expect(title(page)).toHaveText('Expose');
  expect(errors).toEqual([]);
});

test('Explore fab: the bay, a machine, its demonstration, and home again, all at the route', async ({ page }) => {
  const errors = watchErrors(page);
  await fresh(page, '/photolithography');
  await page.getByRole('button', { name: 'Explore fab' }).click();
  await expect(page).toHaveURL(`${ORIGIN}/photolithography?explore`);
  await page.getByRole('button', { name: 'Equipment', exact: true }).click();
  await page.getByRole('button', { name: /^DUV scanner/ }).first().click();
  await expect(page).toHaveURL(`${ORIGIN}/photolithography?explore=scanner`);
  await expect(page.getByRole('heading', { name: 'DUV scanner (193 nm)' })).toBeVisible();
  await page.getByRole('button', { name: 'See it work' }).click();
  await expect(page).toHaveURL(`${ORIGIN}/photolithography?explore=scanner&demo=1`);
  await expect(page.getByText('Demonstration', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByText('Demonstration', { exact: true })).toBeVisible({ timeout: 60_000 });
  await page.getByRole('button', { name: 'Home' }).click();
  await expect(page).toHaveURL(`${ORIGIN}/photolithography`);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Build a chip');
  expect(errors).toEqual([]);
});

type FilmWin = { __fabFilm: { useFilm: { getState: () => { status: string; audioOk: boolean; audioError: string | null; cue: string | null } } } };
const film = (page: Page) => page.evaluate(() => (window as unknown as FilmWin).__fabFilm.useFilm.getState());

test('Watch: the film plays with its narration, loaded from the route', async ({ page }) => {
  const errors = watchErrors(page);
  const narration: { path: string; status: number }[] = [];
  page.on('response', (r) => {
    const path = new URL(r.url()).pathname;
    if (path.includes('/narration/')) narration.push({ path, status: r.status() });
  });
  await fresh(page, '/photolithography?hooks=1');
  await page.getByRole('button', { name: 'Watch the film' }).click();
  await expect(page).toHaveURL(/\/photolithography\?watch$/);
  await expect(page.getByRole('group', { name: 'Film controls' })).toBeVisible({ timeout: 60_000 });
  await expect.poll(async () => (await film(page)).status, { timeout: 120_000 }).toBe('playing');
  await expect.poll(async () => (await film(page)).cue, { timeout: 60_000 }).not.toBeNull();
  const f = await film(page);
  expect(f.audioOk, f.audioError ?? '').toBe(true);
  expect(narration.some((n) => n.path === '/photolithography/narration/film-1/manifest.json' && n.status === 200)).toBe(true);
  expect(narration.some((n) => /^\/photolithography\/narration\/film-1\/\w[\w-]*\.mp3$/.test(n.path) && (n.status === 200 || n.status === 206))).toBe(true);
  expect(narration.filter((n) => n.status >= 400)).toEqual([]);
  // the film has an address of its own: a refresh opens it again, paused where it was
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await page.reload();
  await expect(page.getByRole('group', { name: 'Film controls' })).toBeVisible({ timeout: 60_000 });
  await page.getByRole('button', { name: 'Exit film' }).click();
  await expect(page).toHaveURL(`${ORIGIN}/photolithography`);
  expect(errors).toEqual([]);
});

test('Save for offline: saved and checked at the route, it plays without a connection; the homepage is left alone', async ({ page, context }, info) => {
  test.skip(info.project.name !== 'desktop', 'the service worker flow, once');
  const errors = watchErrors(page);
  await fresh(page, '/photolithography?watch&hooks=1');
  await page.getByRole('button', { name: /Save for offline/ }).click();
  const pop = page.getByRole('dialog', { name: 'Save for offline' });
  await expect(pop.getByText(/Download the film and this site/)).toBeVisible();
  await pop.getByRole('button', { name: 'Download' }).click();
  await expect(pop.getByText(/Saved on this device/)).toBeVisible({ timeout: 180_000 });
  const saved = await page.evaluate(async () => {
    const keys = await caches.keys();
    const urls: string[] = [];
    for (const k of keys) for (const r of await (await caches.open(k)).keys()) urls.push(new URL(r.url).pathname);
    await navigator.serviceWorker.ready;
    const regs = await navigator.serviceWorker.getRegistrations();
    return { keys, urls, scopes: regs.map((r) => new URL(r.scope).pathname) };
  });
  expect(saved.keys).toEqual([expect.stringMatching(/^fabone-offline-photolithography-/)]);
  expect(saved.urls).toContain('/photolithography/index.html');
  expect(saved.urls).toContain('/photolithography/__complete__');
  expect(saved.urls).toContain('/photolithography/narration/film-1/intro.mp3');
  expect(saved.urls.filter((u) => !u.startsWith('/photolithography/')), 'only the simulation is saved').toEqual([]);
  expect(saved.scopes, 'the worker controls the route itself, without the trailing slash').toEqual(['/photolithography']);

  // the homepage is not the worker's
  await page.goto('/');
  expect(await page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(false);

  // without a connection: the simulation's own address, a film address and a lesson
  await context.setOffline(true);
  await page.goto('/photolithography?watch&hooks=1');
  await expect(page.getByRole('group', { name: 'Film controls' })).toBeVisible({ timeout: 60_000 });
  await page.getByRole('button', { name: 'Play the film' }).click();
  await expect.poll(async () => film(page), { timeout: 120_000 }).toMatchObject({ status: 'playing', audioOk: true });
  await page.goto('/photolithography');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Build a chip');
  await page.goto('/photolithography?step=develop');
  await expect(title(page)).toHaveText('Develop');
  await context.setOffline(false);

  // and it can be removed again, leaving nothing behind
  await page.goto('/photolithography?watch&hooks=1');
  await page.getByRole('button', { name: /Saved for offline/ }).click();
  await page.getByRole('dialog', { name: 'Save for offline' }).getByRole('button', { name: 'Remove' }).click();
  await expect
    .poll(async () => page.evaluate(async () => ({ caches: (await caches.keys()).length, workers: (await navigator.serviceWorker.getRegistrations()).length })))
    .toEqual({ caches: 0, workers: 0 });
  expect(errors.filter((e) => !/Failed to load resource|ERR_INTERNET_DISCONNECTED/.test(e))).toEqual([]);
});
