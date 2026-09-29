import { defineConfig } from '@playwright/test';

/**
 * End-to-end checks against the production build (vite preview).
 * WebGL runs on SwiftShader so the suite also works on machines without a GPU.
 *
 * Inside FAB / ONE the same checks also run against the whole site, with the app at its route:
 * SITE_URL is the site's server and SIM_PATH the route (e2e/helpers.ts). The site's
 * `npm run e2e:photolithography` builds the site, serves it as Netlify does and sets both.
 */
const SITE_URL = process.env.SITE_URL;

export default defineConfig({
  testDir: 'e2e',
  // Screenshots are regenerated on demand (npm run screenshots), not on every e2e run.
  testIgnore: ['**/screenshots.spec.ts'],
  timeout: 240_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: SITE_URL ?? 'http://127.0.0.1:4173',
    trace: 'retain-on-failure',
    launchOptions: {
      args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'],
    },
  },
  webServer: SITE_URL
    ? undefined
    : {
        command: 'npm run build && npm run preview -- --port 4173 --strictPort',
        url: 'http://127.0.0.1:4173',
        reuseExistingServer: true,
        timeout: 240_000,
      },
  projects: [
    { name: 'desktop', use: { viewport: { width: 1440, height: 900 } } },
    { name: 'tablet', use: { viewport: { width: 1024, height: 768 }, hasTouch: true } },
    { name: 'mobile', use: { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 } },
  ],
});
