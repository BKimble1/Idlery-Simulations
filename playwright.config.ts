import { defineConfig } from '@playwright/test';

/**
 * The site's checks, against the built site served the way Netlify serves it (scripts/serve.mjs
 * reads dist/_redirects and dist/_headers): the homepage and its previews, the way into each
 * simulation and back, direct visits and refreshes at a route, and Photolithography's modes and
 * offline copy at its route. Each simulation's own suite runs with npm run e2e:<slug>.
 * WebGL runs on SwiftShader, so this works on machines without a GPU.
 */
export default defineConfig({
  testDir: 'e2e',
  timeout: 300_000,
  expect: { timeout: 30_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:8888',
    trace: 'retain-on-failure',
    launchOptions: {
      args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'],
    },
  },
  webServer: {
    command: 'npm run build && node scripts/serve.mjs dist 8888',
    url: 'http://127.0.0.1:8888',
    reuseExistingServer: true,
    timeout: 300_000,
  },
  projects: [
    { name: 'desktop', use: { viewport: { width: 1440, height: 900 } } },
    { name: 'phone', use: { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 } },
  ],
});
