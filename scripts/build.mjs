#!/usr/bin/env node
// Builds the whole site into dist/, the folder that is uploaded to Netlify:
//
//   dist/index.html, 404.html, assets/   the FAB / ONE homepage (site/)
//   dist/<slug>/                         each simulation in simulations.config.mjs
//   dist/_redirects, _headers            Netlify: serve each simulation at /<slug>
//   dist/sitemap.xml, robots.txt
//
//   node scripts/build.mjs                   (npm run build)
//   node scripts/build.mjs --skip-previews   before a simulation has its preview video
//                                            (scripts/capture-preview.mjs records it from this build)
//
// Each simulation is built with its own toolchain (`npm ci` in its folder first, if it has no
// node_modules yet), with --base /<slug>/ so that everything it loads comes from its route, and
// with VITE_FABONE_HOME=/ so that it shows the way back to the homepage.
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import simulations, { site } from '../simulations.config.mjs';

const root = join(import.meta.dirname, '..');
const dist = join(root, 'dist');
const win = process.platform === 'win32';
const skipPreviews = process.argv.includes('--skip-previews');

function run(cmd, args, cwd, env = {}) {
  console.log(`\n── ${cwd === root ? '.' : cwd.slice(root.length + 1)}: ${[cmd, ...args].join(' ')}`);
  const r = spawnSync(cmd, args, { cwd, stdio: 'inherit', shell: win, env: { ...process.env, ...env } });
  if (r.status !== 0) throw new Error(`${cmd} ${args.join(' ')} failed (${r.status ?? r.signal})`);
}

function check() {
  const slugs = new Set();
  for (const s of simulations) {
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(s.slug)) throw new Error(`simulations.config.mjs: "${s.slug}" is not a valid route name (lowercase letters, digits, hyphens)`);
    if (slugs.has(s.slug)) throw new Error(`simulations.config.mjs: "${s.slug}" is listed twice`);
    slugs.add(s.slug);
    if (!existsSync(join(root, 'simulations', s.slug, 'package.json'))) throw new Error(`simulations/${s.slug}/package.json is missing`);
    for (const f of [s.preview.mp4, s.preview.webm, s.preview.poster])
      if (!skipPreviews && !existsSync(join(root, 'site', f))) throw new Error(`site/${f} is missing (make it with: npm run capture-preview -- ${s.slug})`);
  }
}

function size(path) {
  const st = statSync(path);
  return st.isDirectory() ? readdirSync(path).reduce((n, f) => n + size(join(path, f)), 0) : st.size;
}
const mb = (n) => `${(n / 1e6).toFixed(2)} MB`;

/**
 * Netlify: each simulation's page at its route. The page is dist/<slug>/index.html; the forced
 * rewrite serves it at /<slug> itself (and, since Netlify matches rules with or without the
 * trailing slash, at /<slug>/), with a 200 and the address unchanged: no redirect, so a visit,
 * a refresh or a deep link like /<slug>?step=expose all load the same page.
 */
function redirects() {
  const lines = ['# Written by scripts/build.mjs from simulations.config.mjs.', '# Each simulation is served at its route, with or without a trailing slash.'];
  for (const s of simulations) lines.push(`/${s.slug}  /${s.slug}/index.html  200!`);
  return lines.join('\n') + '\n';
}

function headers() {
  const lines = ['# Written by scripts/build.mjs from simulations.config.mjs.', ''];
  for (const s of simulations) {
    if (!s.serviceWorker) continue;
    lines.push(
      `# ${s.title}'s offline worker may control the route's own address (/${s.slug}, no trailing slash).`,
      `/${s.slug}/${s.serviceWorker}`,
      `  Service-Worker-Allowed: /${s.slug}`,
      '  Cache-Control: no-cache',
      '',
    );
  }
  lines.push('# Built files carry a content hash in their names: they never change.', '/assets/*', '  Cache-Control: public, max-age=31536000, immutable');
  for (const s of simulations) lines.push(`/${s.slug}/assets/*`, '  Cache-Control: public, max-age=31536000, immutable');
  return lines.join('\n') + '\n';
}

function sitemap() {
  const urls = [`${site.url}/`, ...simulations.map((s) => `${site.url}/${s.slug}`)];
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...urls.map((u) => `  <url><loc>${u}</loc></url>`),
    '</urlset>',
    '',
  ].join('\n');
}

check();
rmSync(dist, { recursive: true, force: true });

// 1. The homepage (empties dist/ first).
if (!existsSync(join(root, 'node_modules'))) run('npm', ['ci', '--no-audit', '--no-fund'], root);
run('npx', ['vite', 'build', '--config', 'site/vite.config.ts'], root);

// 2. Each simulation, at its route.
for (const s of simulations) {
  const dir = join(root, 'simulations', s.slug);
  const out = join(dist, s.slug);
  if (existsSync(out)) throw new Error(`dist/${s.slug} already exists: the homepage has a file or folder with that name`);
  if (!existsSync(join(dir, 'node_modules'))) run('npm', ['ci', '--no-audit', '--no-fund'], dir);
  run('npm', ['run', 'build', '--', '--base', `/${s.slug}/`, '--outDir', out, '--emptyOutDir'], dir, { VITE_FABONE_HOME: '/' });
  if (!existsSync(join(out, 'index.html'))) throw new Error(`${s.slug}: the build wrote no index.html`);
}

// 3. Routing and discovery.
writeFileSync(join(dist, '_redirects'), redirects());
writeFileSync(join(dist, '_headers'), headers());
writeFileSync(join(dist, 'sitemap.xml'), sitemap());
writeFileSync(join(dist, 'robots.txt'), `User-agent: *\nAllow: /\n\nSitemap: ${site.url}/sitemap.xml\n`);

const sims = simulations.map((s) => size(join(dist, s.slug)));
console.log(`\nBuilt dist/ (${mb(size(dist))})`);
console.log(`  homepage          ${mb(size(dist) - sims.reduce((a, b) => a + b, 0))}`);
simulations.forEach((s, i) => console.log(`  /${s.slug.padEnd(16)} ${mb(sims[i])}`));
