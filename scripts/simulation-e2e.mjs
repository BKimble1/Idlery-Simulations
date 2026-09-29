#!/usr/bin/env node
// Runs a simulation's own browser tests against the whole built site, with the simulation at
// its route (/<slug>) behind the Netlify-style server, the way visitors will reach it:
//
//   node scripts/simulation-e2e.mjs photolithography [--no-build] [playwright options…]
//   npm run e2e:photolithography -- --project=desktop e2e/modes.spec.ts
//
// The simulation's Playwright config reads SITE_URL (the server) and SIM_PATH (the route).
import { spawn, spawnSync } from 'node:child_process';
import { join } from 'node:path';

const root = join(import.meta.dirname, '..');
const [slug, ...rest] = process.argv.slice(2);
if (!slug) {
  console.error('usage: node scripts/simulation-e2e.mjs <slug> [--no-build] [playwright options…]');
  process.exit(2);
}
const build = !rest.includes('--no-build');
const args = rest.filter((a) => a !== '--no-build');
const win = process.platform === 'win32';

if (build) {
  const b = spawnSync('npm', ['run', 'build'], { cwd: root, stdio: 'inherit', shell: win });
  if (b.status !== 0) process.exit(b.status ?? 1);
}
const port = 8890;
const server = spawn(process.execPath, [join(root, 'scripts', 'serve.mjs'), join(root, 'dist'), String(port)], { stdio: 'inherit' });
await new Promise((r) => setTimeout(r, 800));
const r = spawnSync('npx', ['playwright', 'test', ...args], {
  cwd: join(root, 'simulations', slug),
  stdio: 'inherit',
  shell: win,
  env: { ...process.env, SITE_URL: `http://127.0.0.1:${port}`, SIM_PATH: `/${slug}` },
});
server.kill();
process.exit(r.status ?? 1);
