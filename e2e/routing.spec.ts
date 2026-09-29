import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import simulations from '../simulations.config.mjs';

/**
 * What Netlify is told (dist/_redirects, dist/_headers), and what the Netlify-style server
 * (scripts/serve.mjs) answers with it: each simulation at its route, with or without a trailing
 * slash or a query, as a 200 with the address unchanged.
 */
test.beforeEach(({}, info) => test.skip(info.project.name !== 'desktop', 'server behaviour, once'));

test('the build tells Netlify to serve each simulation at its route', () => {
  const redirects = readFileSync('dist/_redirects', 'utf8');
  const headers = readFileSync('dist/_headers', 'utf8');
  for (const s of simulations) {
    expect(redirects).toContain(`/${s.slug}  /${s.slug}/index.html  200!`);
    if (s.serviceWorker) expect(headers).toContain(`/${s.slug}/${s.serviceWorker}\n  Service-Worker-Allowed: /${s.slug}\n`);
  }
});

test('a simulation answers at its route, with or without the slash, with a query, and never redirects', async ({ request }) => {
  for (const s of simulations) {
    for (const path of [`/${s.slug}`, `/${s.slug}/`, `/${s.slug}?step=coat`, `/${s.slug}/?watch&t=30`, `/${s.slug}/index.html`]) {
      const r = await request.get(path, { maxRedirects: 0 });
      expect(r.status(), path).toBe(200);
      expect(r.headers()['content-type'], path).toContain('text/html');
      const html = await r.text();
      expect(html, `${path}: everything the page loads is under its route`).toContain(`src="/${s.slug}/assets/`);
      expect(html).not.toMatch(/(src|href)="\/assets\//);
    }
    if (s.serviceWorker) {
      const sw = await request.get(`/${s.slug}/${s.serviceWorker}`);
      expect(sw.status()).toBe(200);
      expect(sw.headers()['content-type']).toContain('javascript');
      expect(sw.headers()['service-worker-allowed']).toBe(`/${s.slug}`);
    }
  }
});

test('the homepage, its 404 and the files search engines read', async ({ request }) => {
  const home = await request.get('/', { maxRedirects: 0 });
  expect(home.status()).toBe(200);
  expect(await home.text()).toContain('<article class="card');
  const missing = await request.get('/nothing-here', { maxRedirects: 0 });
  expect(missing.status()).toBe(404);
  const sitemap = await (await request.get('/sitemap.xml')).text();
  for (const s of simulations) expect(sitemap).toContain(`<loc>https://simulations.idlery.com/${s.slug}</loc>`);
  expect(await (await request.get('/robots.txt')).text()).toContain('Sitemap: https://simulations.idlery.com/sitemap.xml');
});
