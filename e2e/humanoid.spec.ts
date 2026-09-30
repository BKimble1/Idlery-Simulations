import { expect, test, type Page } from '@playwright/test';
import { fresh, overflow, watchErrors } from './helpers';

/**
 * Humanoid at its route, /humanoid, as visitors reach it: a direct visit and a refresh, links
 * into a mode or a lab, the address following the visitor, and the way back to FAB / ONE. The
 * simulation's own suite runs at this route too: npm run e2e:humanoid.
 */

const ORIGIN = 'http://127.0.0.1:8888';

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
