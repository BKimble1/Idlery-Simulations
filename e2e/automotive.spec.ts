import { expect, test, type Page } from '@playwright/test';
import simulations from '../simulations.config.mjs';
import { fresh, overflow, watchErrors } from './helpers';

/**
 * AUTOMOTIVE / ONE at its route, /automotive, as visitors reach it: a direct visit and a
 * refresh, links into each mode (a part, a lesson, the film at a moment, a lab, a fault), the
 * address following the visitor, and the way back to FAB / ONE. The simulation's own suite (44
 * browser tests on four screen sizes) runs in its repository.
 */

const ORIGIN = 'http://127.0.0.1:8888';
const automotive = simulations.find((s) => s.slug === 'automotive')!;

/** Requests the page makes to this site outside /automotive (there should be none). */
function outside(page: Page): string[] {
  const out: string[] = [];
  page.on('request', (r) => {
    const u = new URL(r.url());
    if (u.origin === ORIGIN && u.pathname !== '/automotive' && !u.pathname.startsWith('/automotive/')) out.push(u.pathname);
  });
  return out;
}

type Win = { __fabStores?: { useApp: { getState: () => Record<string, unknown> } } };
const ready = (page: Page) => page.waitForFunction(() => (window as unknown as Win).__fabStores?.useApp.getState().ready === true, undefined, { timeout: 180_000 });
const state = (page: Page) => page.evaluate(() => (window as unknown as Win).__fabStores!.useApp.getState());

test('a direct visit to /automotive opens the simulation, and a refresh keeps it there', async ({ page }) => {
  const errors = watchErrors(page);
  const out = outside(page);
  await fresh(page, '/automotive?hooks=1');
  out.length = 0;
  await expect(page).toHaveTitle('AUTOMOTIVE / ONE — How a car becomes motion · FAB / ONE');
  await ready(page);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('AUTOMOTIVE / ONE');
  await expect(page.locator('canvas').first()).toBeVisible();
  await page.reload();
  await ready(page);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('AUTOMOTIVE / ONE');
  await page.waitForTimeout(2000);
  expect(out, 'everything the simulation loads comes from its route').toEqual([]);
  expect(await overflow(page)).toBeLessThanOrEqual(0);
  expect(errors).toEqual([]);
});

test('links into a part, a lesson, the film, a lab and a fault land there; the address follows', async ({ page }) => {
  const errors = watchErrors(page);
  await fresh(page, '/automotive?mode=explore&system=brakes&part=brake-caliper&hooks=1');
  await ready(page);
  await expect(page.locator('.ex h2')).toHaveText('Brake calipers', { timeout: 60_000 });
  await page.locator('.ex-back').click();
  await expect(page).toHaveURL(`${ORIGIN}/automotive?hooks=1&mode=explore&system=brakes&part=wheel-brakes`);
  await page.goto('/automotive/?mode=explore&lesson=braking&hooks=1');
  await ready(page);
  await expect(page.locator('.lesson__title')).toHaveText('Pressure, not effort', { timeout: 60_000 });
  await page.goto('/automotive/?mode=watch&t=150&hooks=1');
  await ready(page);
  await expect(page.locator('.lesson__chapter')).toHaveText('To the road', { timeout: 60_000 });
  await page.goto('/automotive/?mode=engineer&lab=gearing&hooks=1');
  await ready(page);
  await expect(page.locator('.eng h2')).toHaveText('Gearing');
  await page.goto('/automotive/?mode=simulate&scenario=charging&hooks=1');
  await ready(page);
  await expect(page.locator('.sim h2')).toHaveText('Battery light on');
  expect((await state(page)).scenario).toBe('charging');
  expect(errors).toEqual([]);
});

test('the back link returns to FAB / ONE, and browser Back and Forward move between the pages', async ({ page }) => {
  const errors = watchErrors(page);
  await fresh(page, '/');
  await page.getByRole('link', { name: 'Launch simulation: Automotive' }).click();
  await expect(page).toHaveURL(`${ORIGIN}/automotive`);
  const back = page.getByRole('link', { name: 'Back to FAB / ONE' });
  await expect(back).toBeVisible({ timeout: 120_000 });
  await expect(back).toHaveAttribute('href', '/');
  await back.click();
  await expect(page).toHaveURL(`${ORIGIN}/`);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Step inside real engineering.');
  await page.goBack();
  await expect(page).toHaveURL(`${ORIGIN}/automotive`);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('AUTOMOTIVE / ONE', { timeout: 120_000 });
  await page.goForward();
  await expect(page).toHaveURL(`${ORIGIN}/`);
  expect(errors).toEqual([]);
});

test('Automotive is the fourth card, 04, after Humanoid', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('/');
  const card = page.locator('article.card').nth(3);
  await expect(card.getByRole('heading', { level: 3 })).toHaveText('Automotive');
  await expect(card.locator('.card__num')).toHaveText('04');
  await expect(card.getByText(automotive.tagline, { exact: true })).toBeVisible();
  await expect(card.getByText(automotive.summary, { exact: true })).toBeVisible();
  expect(await card.locator('.card__facts li').allTextContents()).toEqual(automotive.facts);
  const launch = card.getByRole('link', { name: 'Launch simulation: Automotive' });
  await expect(launch).toHaveAttribute('href', '/automotive');
  const sources = await card.locator('video source').evaluateAll((els) => els.map((e) => e.getAttribute('src')));
  expect(sources).toEqual([expect.stringMatching(/^\/media\/automotive\/preview-[\w-]+\.mp4$/), expect.stringMatching(/^\/media\/automotive\/preview-[\w-]+\.webm$/)]);
  expect(await card.innerText(), 'no em dashes in the card').not.toContain('—');
  expect(errors).toEqual([]);
});

test('/automotive answers with its page at every address, without redirecting', async ({ request }, info) => {
  test.skip(info.project.name !== 'desktop', 'server behaviour, once');
  for (const path of ['/automotive', '/automotive/', '/automotive?mode=watch', '/automotive/?mode=explore&system=brakes', '/automotive/index.html']) {
    const r = await request.get(path, { maxRedirects: 0 });
    expect(r.status(), path).toBe(200);
    expect(r.headers()['content-type'], path).toBe('text/html; charset=UTF-8');
    const html = await r.text();
    expect(html, path).toContain('<title>AUTOMOTIVE / ONE — How a car becomes motion · FAB / ONE</title>');
    expect(html).toContain('src="/automotive/assets/');
    expect(html).not.toMatch(/(src|href)="(\.\/|\/(?!automotive\/))/);
  }
  expect((await request.get('/automotive/assets/missing.js')).status()).toBe(404);
  // the narration is served with its own type
  const m = await request.get('/automotive/narration/film-2/manifest.json');
  expect(m.status()).toBe(200);
});
