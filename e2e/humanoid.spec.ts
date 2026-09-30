import { expect, test, type Page } from '@playwright/test';
import simulations from '../simulations.config.mjs';
import { fresh, overflow, watchErrors } from './helpers';

/**
 * Humanoid at its route, /humanoid, as visitors reach it: a direct visit and a refresh, links
 * into a mode or a lab, the address following the visitor, and the way back to FAB / ONE. The
 * simulation's own suite runs at this route too: npm run e2e:humanoid.
 */

const ORIGIN = 'http://127.0.0.1:8888';
const humanoid = simulations.find((s) => s.slug === 'humanoid')!;

/** Requests the page makes to this site outside /humanoid (there should be none). */
function outside(page: Page): string[] {
  const out: string[] = [];
  page.on('request', (r) => {
    const u = new URL(r.url());
    if (u.origin === ORIGIN && u.pathname !== '/humanoid' && !u.pathname.startsWith('/humanoid/')) out.push(u.pathname);
  });
  return out;
}

const ready = (page: Page) => page.waitForFunction(() => (window as unknown as { __fabStores?: { useApp: { getState: () => { ready: boolean } } } }).__fabStores?.useApp.getState().ready === true, undefined, { timeout: 180_000 });

test('a direct visit to /humanoid opens the simulation, and a refresh keeps it there', async ({ page }) => {
  const errors = watchErrors(page);
  const out = outside(page);
  await fresh(page, '/humanoid?hooks=1');
  out.length = 0;
  await expect(page).toHaveTitle('Humanoid — Inside a machine built to move like us · FAB / ONE');
  await ready(page);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('HUMANOID');
  await expect(page.locator('canvas').first()).toBeVisible();
  await page.reload();
  await ready(page);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('HUMANOID');
  await page.waitForTimeout(2000);
  expect(out, 'everything the simulation loads comes from its route').toEqual([]);
  expect(await overflow(page)).toBeLessThanOrEqual(0);
  expect(errors).toEqual([]);
});

test('links into a mode or a lab land there; the address follows the visitor', async ({ page }) => {
  const errors = watchErrors(page);
  await fresh(page, '/humanoid?mode=simulate&lab=walk&hooks=1');
  await ready(page);
  await expect(page.locator('#lab-title')).toHaveText('Walking');
  await page.goto('/humanoid/?system=power&hooks=1');
  await ready(page);
  await expect(page.locator('#sys-title')).toHaveText('Battery and power');
  await expect(page).toHaveURL(`${ORIGIN}/humanoid/?hooks=1&mode=explore&system=power`);
  await page.getByRole('button', { name: /Compute/ }).first().click();
  await expect(page).toHaveURL(`${ORIGIN}/humanoid/?hooks=1&mode=explore&system=compute`);
  await page.reload();
  await ready(page);
  await expect(page.locator('#sys-title')).toHaveText('Compute and networks');
  expect(errors).toEqual([]);
});

test('the back link returns to FAB / ONE, and browser Back and Forward move between the pages', async ({ page }) => {
  const errors = watchErrors(page);
  await fresh(page, '/');
  await page.getByRole('link', { name: 'Launch simulation: Humanoid' }).click();
  await expect(page).toHaveURL(`${ORIGIN}/humanoid`);
  const back = page.getByRole('link', { name: 'Back to FAB / ONE' });
  await expect(back).toBeVisible({ timeout: 120_000 });
  await expect(back).toHaveAttribute('href', '/');
  // clear of the header's other controls
  const b = (await back.boundingBox())!;
  const watch = (await page.getByRole('button', { name: 'Watch the guided tour', exact: true }).boundingBox())!;
  expect(b.x + b.width).toBeLessThan(watch.x);
  await back.click();
  await expect(page).toHaveURL(`${ORIGIN}/`);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Step inside real engineering.');
  await page.goBack();
  await expect(page).toHaveURL(`${ORIGIN}/humanoid`);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('HUMANOID', { timeout: 120_000 });
  await page.goForward();
  await expect(page).toHaveURL(`${ORIGIN}/`);
  expect(errors).toEqual([]);
});

test('Humanoid is the third card, 03, after Photolithography and Rocket Engineering', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('/');
  const card = page.locator('article.card').nth(2);
  await expect(card.getByRole('heading', { level: 3 })).toHaveText('Humanoid');
  await expect(card.locator('.card__num')).toHaveText('03');
  await expect(card.getByText(humanoid.tagline, { exact: true })).toBeVisible();
  await expect(card.getByText(humanoid.summary, { exact: true })).toBeVisible();
  expect(await card.locator('.card__facts li').allTextContents()).toEqual(humanoid.facts);
  const launch = card.getByRole('link', { name: 'Launch simulation: Humanoid' });
  await expect(launch).toHaveAttribute('href', '/humanoid');
  const sources = await card.locator('video source').evaluateAll((els) => els.map((e) => e.getAttribute('src')));
  // its own clip (the build gives the files content-hashed names under /media/humanoid/)
  expect(sources).toEqual([expect.stringMatching(/^\/media\/humanoid\/preview-[\w-]+\.mp4$/), expect.stringMatching(/^\/media\/humanoid\/preview-[\w-]+\.webm$/)]);
  expect(await card.innerText(), 'no em dashes in the card').not.toContain('—');
  expect(errors).toEqual([]);
});

test('/humanoid answers with its page at every address, without redirecting', async ({ request }, info) => {
  test.skip(info.project.name !== 'desktop', 'server behaviour, once');
  for (const path of ['/humanoid', '/humanoid/', '/humanoid?mode=watch', '/humanoid/?mode=simulate&lab=walk', '/humanoid/index.html']) {
    const r = await request.get(path, { maxRedirects: 0 });
    expect(r.status(), path).toBe(200);
    expect(r.headers()['content-type'], path).toBe('text/html; charset=UTF-8');
    const html = await r.text();
    expect(html, path).toContain('<title>Humanoid — Inside a machine built to move like us · FAB / ONE</title>');
    expect(html).toContain('src="/humanoid/assets/');
    expect(html).not.toMatch(/(src|href)="(\.\/|\/(?!humanoid\/))/);
  }
  // a file that is not there is a 404, not the page
  expect((await request.get('/humanoid/assets/missing.js')).status()).toBe(404);
});

test("Photolithography's service worker, once installed, controls its own route and nothing else", async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'once');
  await fresh(page, '/photolithography');
  const scope = await page.evaluate(async () => {
    const reg = await navigator.serviceWorker.register('/photolithography/sw.js', { scope: '/photolithography' });
    await navigator.serviceWorker.ready;
    return new URL(reg.scope).pathname;
  });
  expect(scope).toBe('/photolithography');
  // the worker takes the route on the next visit; the homepage and the other simulations stay outside it
  await page.goto('/photolithography');
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
  for (const path of ['/', '/humanoid', '/humanoid/', '/rocket', '/rocket/']) {
    await page.goto(path);
    expect(await page.evaluate(() => !!navigator.serviceWorker.controller), path).toBe(false);
  }
  await page.evaluate(async () => {
    for (const r of await navigator.serviceWorker.getRegistrations()) await r.unregister();
  });
});
