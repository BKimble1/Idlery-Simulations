#!/usr/bin/env node
// Builds the whole site into dist/, the folder that is uploaded to Netlify:
//
//   dist/index.html, 404.html, assets/   the FAB / ONE homepage (site/)
//   dist/media/<slug>/                   each card's preview clip and poster
//   dist/<slug>/                         each simulation in simulations.config.mjs
//   dist/_redirects, _headers            Netlify: serve each simulation at /<slug>
//   dist/sitemap.xml, robots.txt
//
//   node scripts/build.mjs                   (npm run build)
//   node scripts/build.mjs --skip-previews   before a simulation has its preview video
//                                            (scripts/capture-preview.mjs records it from this build)
//
// Each simulation is built with its own toolchain (`npm ci` in its folder first, if it has no
// node_modules yet), with Vite's --base /<slug>/ so that everything it loads comes from its
// route, and with VITE_FABONE_HOME=/ so that it shows the way back to the homepage (plus the
// `env` its entry in simulations.config.mjs adds, for a project that names that differently).
// Then the page it wrote is checked: every script, style sheet and icon must come from /<slug>/.
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
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

/**
 * How a simulation is built, unless its entry says otherwise: its own build script, with the
 * route's options appended by npm. They reach Vite only when the script ends with `vite build`
 * (check() makes sure of that); a project whose script does not must list its commands.
 */
const DEFAULT_BUILD = [['npm', 'run', 'build', '--', '--base', '{base}', '--outDir', '{outDir}', '--emptyOutDir']];
const endsWithViteBuild = (script) => /(?:^|&&|\|\||;)\s*(?:npx\s+)?vite\s+build(?:\s+[^&|;]*)?$/.test(script.trim());

function check() {
  const slugs = new Set();
  for (const s of simulations) {
    const where = `simulations.config.mjs, ${s.slug}`;
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(s.slug)) throw new Error(`simulations.config.mjs: "${s.slug}" is not a valid route name (lowercase letters, digits, hyphens)`);
    if (['assets', 'media'].includes(s.slug)) throw new Error(`simulations.config.mjs: "${s.slug}" is the homepage's own folder`);
    if (slugs.has(s.slug)) throw new Error(`simulations.config.mjs: "${s.slug}" is listed twice`);
    slugs.add(s.slug);
    const pkg = join(root, 'simulations', s.slug, 'package.json');
    if (!existsSync(pkg)) throw new Error(`simulations/${s.slug}/package.json is missing`);
    for (const f of [s.preview.mp4, s.preview.webm, s.preview.poster]) {
      if (!f.startsWith(`media/${s.slug}/`)) throw new Error(`${where}: the preview's files belong in site/media/${s.slug}/ (${f})`);
      if (!skipPreviews && !existsSync(join(root, 'site', f))) throw new Error(`site/${f} is missing (make it with: npm run capture-preview -- ${s.slug})`);
    }
    if (s.env !== undefined && (typeof s.env !== 'object' || Object.values(s.env).some((v) => typeof v !== 'string'))) throw new Error(`${where}: env must map names to strings`);
    if (s.build !== undefined) {
      if (!Array.isArray(s.build) || !s.build.length || !s.build.every((c) => Array.isArray(c) && c.length && c.every((a) => typeof a === 'string')))
        throw new Error(`${where}: build must be a list of commands, each a list of strings`);
      if (!s.build.flat().some((a) => a.includes('{base}')) || !s.build.flat().some((a) => a.includes('{outDir}')))
        throw new Error(`${where}: build must pass {base} and {outDir} on to Vite`);
    } else {
      const script = JSON.parse(readFileSync(pkg, 'utf8')).scripts?.build ?? '';
      if (!endsWithViteBuild(script))
        throw new Error(`simulations/${s.slug}: its build script ("${script}") does not end with "vite build", so --base and --outDir would not reach Vite: list its build commands in ${where} (see "build" there)`);
    }
    for (const path of Object.keys(s.headers ?? {}))
      if (path.startsWith('/') || path.includes('..')) throw new Error(`${where}: header paths are relative to the route (${path})`);
  }
}

/** The URLs a page loads (not the links it shows): scripts, style sheets, icons, images, media. */
function loaded(html) {
  const urls = [];
  for (const [tag, name] of html.matchAll(/<(script|link|img|source|video|audio|track|iframe|embed)\b[^>]*>/gi)) {
    if (name.toLowerCase() === 'link') {
      const rel = /\srel=(["'])([^"']*)\1/i.exec(tag)?.[2].toLowerCase().split(/\s+/) ?? [];
      if (!rel.some((r) => ['stylesheet', 'icon', 'apple-touch-icon', 'mask-icon', 'modulepreload', 'preload', 'prefetch', 'manifest'].includes(r))) continue;
    }
    for (const [, attr, , url] of tag.matchAll(/\s(src|href|poster)=(["'])([^"']*)\2/gi)) urls.push({ attr, url });
  }
  return urls;
}

/**
 * The simulation's page is served at /<slug> as well as /<slug>/, and at the first a relative
 * URL resolves against / (./icon.svg would be /icon.svg, the homepage's). So relative URLs are
 * made absolute under the route, with a warning (the project should write them from its base).
 * Then every file the page loads, and every url() in its style sheets, must be under /<slug>/
 * and exist in dist/<slug>/, or the build fails.
 */
function checkPage(s, out) {
  const route = `/${s.slug}/`;
  const page = join(out, 'index.html');
  let html = readFileSync(page, 'utf8');
  const fixed = [];
  html = html.replace(/<(?:script|link|img|source|video|audio|track|iframe|embed)\b[^>]*>/gi, (tag) =>
    tag.replace(/(\s(?:src|href|poster)=)(["'])([^"']*)\2/gi, (m, pre, q, url) => {
      if (!url || /^(?:[a-z][a-z0-9+.-]*:|\/|#)/i.test(url)) return m;
      const u = new URL(url, `http://site${route}`);
      const abs = u.pathname + u.search + u.hash;
      fixed.push(`${url} → ${abs}`);
      return `${pre}${q}${abs}${q}`;
    }),
  );
  if (fixed.length) {
    writeFileSync(page, html);
    console.warn(`\n⚠ ${s.slug}: index.html had relative URLs, which resolve outside the route at /${s.slug} (no slash); made absolute:\n  ${fixed.join('\n  ')}\n  Fix them in the simulation's index.html: a path from the site's root, like /icon.svg, which Vite writes under the base.`);
  }
  const problems = [];
  const inRoute = (url, from) => {
    if (/^(?:data|blob):/i.test(url)) return;
    if (/^(?:[a-z][a-z0-9+.-]*:)?\/\//i.test(url)) return problems.push(`${from}: ${url} is on another site`);
    if (!url.startsWith(route)) return problems.push(`${from}: ${url} is outside ${route}`);
    const path = decodeURIComponent(url.split(/[?#]/)[0].slice(route.length));
    if (!existsSync(join(out, path))) problems.push(`${from}: ${url} is not in dist/${s.slug}/`);
  };
  const urls = loaded(html);
  for (const { url } of urls) inRoute(url, 'index.html');
  const styles = [];
  (function walk(dir) {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) walk(full);
      else if (name.endsWith('.css')) styles.push(full);
    }
  })(out);
  for (const css of styles)
    for (const [, , url] of readFileSync(css, 'utf8').matchAll(/url\(\s*(["']?)(\/[^"')]*)\1\s*\)/g)) inRoute(url, css.slice(out.length + 1));
  if (problems.length) throw new Error(`${s.slug}: the page loads files from outside its route (${route}):\n  ${problems.join('\n  ')}`);
  if (!urls.some((u) => /\.m?js(?:$|[?#])/.test(u.url))) throw new Error(`${s.slug}: dist/${s.slug}/index.html loads no script`);
  console.log(`\n✓ ${s.slug}: index.html loads ${urls.length} files, all from ${route}`);
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
  const forever = '  Cache-Control: public, max-age=31536000, immutable';
  lines.push('# Built files, and the cards\' preview clips and posters, carry a content hash in their names: they never change.', '/assets/*', forever, '/media/*', forever);
  for (const s of simulations) lines.push(`/${s.slug}/assets/*`, forever);
  for (const s of simulations) {
    const rules = Object.entries(s.headers ?? {});
    if (!rules.length) continue;
    lines.push('', `# ${s.title}: from its entry in simulations.config.mjs.`);
    for (const [path, set] of rules) lines.push(`/${s.slug}/${path}`, ...Object.entries(set).map(([k, v]) => `  ${k}: ${v}`));
  }
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

// 2. Each simulation, at its route, into its own folder (and nowhere else).
for (const s of simulations) {
  const dir = join(root, 'simulations', s.slug);
  const out = join(dist, s.slug);
  if (existsSync(out)) throw new Error(`dist/${s.slug} already exists: the homepage has a file or folder with that name`);
  if (!existsSync(join(dir, 'node_modules'))) run('npm', ['ci', '--no-audit', '--no-fund'], dir);
  const vars = { base: `/${s.slug}/`, outDir: out };
  const env = { VITE_FABONE_HOME: '/', FABONE_BASE: vars.base, FABONE_OUT_DIR: out, ...s.env };
  console.log(`\n── ${s.slug}: environment ${Object.entries(env).map(([k, v]) => `${k}=${JSON.stringify(v)}`).join(' ')}`);
  const before = readdirSync(dist);
  for (const [cmd, ...args] of s.build ?? DEFAULT_BUILD) run(cmd, args.map((a) => a.replace(/\{(base|outDir)\}/g, (_, k) => vars[k])), dir, env);
  if (!existsSync(join(out, 'index.html'))) throw new Error(`${s.slug}: the build wrote no index.html`);
  const strays = readdirSync(dist).filter((n) => n !== s.slug && !before.includes(n));
  if (strays.length) throw new Error(`${s.slug}: the build wrote outside dist/${s.slug}/: ${strays.join(', ')}`);
  checkPage(s, out);
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
