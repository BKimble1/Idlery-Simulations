import { expect, test, type Locator } from '@playwright/test';
import simulations from '../simulations.config.mjs';
import { overflow, watchErrors } from './helpers';

const state = (video: Locator) =>
  video.evaluate((v: HTMLVideoElement) => ({ t: v.currentTime, paused: v.paused, muted: v.muted, loop: v.loop, inline: v.playsInline, w: v.videoWidth, h: v.videoHeight, src: v.currentSrc }));

test('the homepage says what FAB / ONE is and has a card for every simulation', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('/');
  await expect(page).toHaveTitle('FAB / ONE — Interactive engineering simulations by Idlery');
  await expect(page.getByRole('link', { name: 'FAB / ONE, home' })).toBeVisible();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Step inside real engineering.');
  await expect(page.getByText('is Idlery’s home for interactive engineering simulations')).toBeVisible();
  const cards = page.locator('article.card');
  await expect(cards).toHaveCount(simulations.length);
  for (const [i, s] of simulations.entries()) {
    const card = cards.nth(i);
    await expect(card.getByRole('heading', { level: 3 })).toHaveText(s.title);
    await expect(card.getByText(s.tagline)).toBeVisible();
    await expect(card.getByText(s.summary)).toBeVisible();
    for (const f of s.facts) await expect(card.getByText(f, { exact: true })).toBeVisible();
    await expect(card.getByRole('link', { name: `${s.launch}: ${s.title}` })).toHaveAttribute('href', `/${s.slug}`);
  }
  expect(await overflow(page), 'no sideways scrolling').toBeLessThanOrEqual(0);
  expect(errors).toEqual([]);
});

test('the homepage downloads nothing of the simulations, and little else before its preview', async ({ page }) => {
  const paths: string[] = [];
  const sizes: Promise<{ path: string; bytes: number }>[] = [];
  page.on('requestfinished', (r) => {
    const path = new URL(r.url()).pathname;
    paths.push(path);
    if (!/\.(mp4|webm)$/.test(path)) sizes.push(r.sizes().then((s) => ({ path, bytes: s.responseBodySize })));
  });
  await page.goto('/');
  await page.waitForTimeout(4000);
  for (const s of simulations) expect(paths.filter((p) => p === `/${s.slug}` || p.startsWith(`/${s.slug}/`))).toEqual([]);
  const files = await Promise.all(sizes);
  const total = files.reduce((n, f) => n + f.bytes, 0);
  console.log(`homepage without the preview video: ${files.length} files, ${(total / 1024).toFixed(0)} KB`);
  expect(total).toBeLessThan(400 * 1024);
});

test('each preview shows a real poster, then plays muted in place; it can be paused and played', async ({ page, isMobile }) => {
  const errors = watchErrors(page);
  await page.goto('/');
  for (const [i] of simulations.entries()) {
    const card = page.locator('article.card').nth(i);
    const video = card.locator('video');
    await card.scrollIntoViewIfNeeded();
    // the poster is there before anything plays
    const poster = await video.getAttribute('poster');
    expect(poster).toMatch(/^\/assets\/poster-[\w-]+\.webp$/);
    const img = await page.request.get(poster!);
    expect(img.status()).toBe(200);
    expect(img.headers()['content-type']).toBe('image/webp');
    expect((await img.body()).length).toBeGreaterThan(30_000);
    expect(await video.getAttribute('preload')).toBe('none');
    // then the clip plays: muted, inline, looping, at full size
    await expect.poll(async () => (await state(video)).t, { timeout: 60_000 }).toBeGreaterThan(1);
    expect(await state(video)).toMatchObject({ paused: false, muted: true, loop: true, inline: true, w: 1280, h: 720 });
    // the visitor can pause it (the button does not open the simulation) and play it again
    if (!isMobile) await card.hover();
    await card.getByRole('button', { name: 'Pause the preview' }).click();
    await expect(card.getByRole('button', { name: 'Play the preview' })).toBeVisible();
    expect((await state(video)).paused).toBe(true);
    expect(new URL(page.url()).pathname).toBe('/');
    await card.getByRole('button', { name: 'Play the preview' }).click();
    await expect.poll(async () => (await state(video)).paused).toBe(false);
  }
  expect(errors).toEqual([]);
});

test('both preview files are served whole and in ranges, as video players ask for them', async ({ page, request }, info) => {
  test.skip(info.project.name !== 'desktop', 'files, once');
  await page.goto('/');
  const sources = await page.locator('article.card video source').evaluateAll((els) => els.map((e) => ({ src: e.getAttribute('src')!, type: e.getAttribute('type')! })));
  expect(sources.length).toBe(simulations.length * 2);
  for (const { src, type } of sources) {
    const whole = await request.get(src);
    expect(whole.status(), src).toBe(200);
    expect(whole.headers()['content-type']).toBe(type.split(';')[0]);
    const size = (await whole.body()).length;
    expect(size, `${src}: a preview that loads quickly`).toBeLessThan(4_000_000);
    const part = await request.get(src, { headers: { Range: 'bytes=0-1023' } });
    expect(part.status()).toBe(206);
    expect(part.headers()['content-range']).toBe(`bytes 0-1023/${size}`);
  }
});

test.describe('with reduced motion', () => {
  test('the preview waits for the visitor to press play', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    await page.waitForTimeout(2500);
    const card = page.locator('article.card').first();
    const video = card.locator('video');
    expect(await state(video)).toMatchObject({ paused: true, t: 0 });
    await card.getByRole('button', { name: 'Play the preview' }).click();
    await expect.poll(async () => (await state(video)).t, { timeout: 60_000 }).toBeGreaterThan(0.5);
  });
});

test('the card, and its launch button, open the simulation; the simulation leads back', async ({ page }) => {
  const errors = watchErrors(page);
  for (const s of simulations) {
    await page.goto('/');
    const card = page.locator('article.card', { has: page.getByRole('heading', { name: s.title }) });
    // anywhere on the card: here, near its top left corner, on its picture
    await card.click({ position: { x: 60, y: 60 } });
    await expect(page).toHaveURL(new RegExp(`/${s.slug}$`));
    await expect(page.getByRole('link', { name: 'Back to FAB / ONE' })).toBeVisible();
    await page.goBack();
    await expect(page).toHaveURL(/127\.0\.0\.1:8888\/$/);
    // the launch button, from the keyboard
    const launch = card.getByRole('link', { name: `${s.launch}: ${s.title}` });
    await launch.focus();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(new RegExp(`/${s.slug}$`));
    // and back to FAB / ONE
    await page.getByRole('link', { name: 'Back to FAB / ONE' }).click();
    await expect(page).toHaveURL(/127\.0\.0\.1:8888\/$/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Step inside real engineering.');
  }
  expect(errors.filter((e) => !/WebGL|GPU stall/.test(e))).toEqual([]);
});

test('an unknown address gets the not-found page, which leads home', async ({ page }) => {
  const res = await page.goto('/no-such-simulation');
  expect(res?.status()).toBe(404);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('This page isn’t part of FAB / ONE.');
  expect(await overflow(page)).toBeLessThanOrEqual(0);
  await page.getByRole('link', { name: 'Back to FAB / ONE' }).click();
  await expect(page).toHaveURL(/127\.0\.0\.1:8888\/$/);
});
