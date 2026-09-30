#!/usr/bin/env node
// Zips the built site for a manual Netlify upload: index.html, _redirects and _headers at the
// ZIP's top level, each simulation in its folder.
//
//   npm run build && node scripts/package.mjs [out.zip | --name <name>]      (npm run package)
//   npm run package -- --name FAB-ONE-with-Rocket-V2-Netlify     → release/FAB-ONE-with-Rocket-V2-Netlify.zip
//
// Default output: release/fab-one-site.zip. Check it with scripts/verify-package.mjs, then
// unzip it and drag the folder onto the site's Deploys page in Netlify (README.md,
// "Publishing"). Written with Node's own zlib, so it needs no zip program.
import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { crc32, deflateRawSync } from 'node:zlib';
import simulations from '../simulations.config.mjs';

const root = join(import.meta.dirname, '..');
const dist = join(root, 'dist');
const args = process.argv.slice(2);
const named = args.indexOf('--name');
if (named >= 0 && !/^[\w.-]+$/.test(args[named + 1] ?? '')) {
  console.error('usage: node scripts/package.mjs [out.zip | --name <name>]  (a name: letters, digits, dots, hyphens, underscores)');
  process.exit(2);
}
const out = named >= 0 ? join(root, 'release', `${args[named + 1].replace(/\.zip$/, '')}.zip`) : resolve(args[0] ?? join(root, 'release', 'fab-one-site.zip'));

const required = ['index.html', '404.html', '_redirects', '_headers', 'sitemap.xml', 'robots.txt', ...simulations.flatMap((s) => [`${s.slug}/index.html`, s.preview.mp4, s.preview.webm, s.preview.poster].map((f) => f.replace(/^media\/([^/]+)\/.*$/, 'media/$1')))];
for (const f of required) {
  try {
    statSync(join(dist, f));
  } catch {
    console.error(`dist/${f} is missing: run npm run build first.`);
    process.exit(1);
  }
}

const files = [];
(function walk(dir) {
  for (const name of readdirSync(dir).sort()) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full);
    else files.push(full);
  }
})(dist);

// Formats that are already compressed are stored as they are.
const STORED = /\.(mp4|webm|mp3|woff2?|jpe?g|png|webp|avif|gz|zip)$/i;

function dosTime(d) {
  const time = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
  const date = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  return { time, date };
}

const chunks = [];
const central = [];
let offset = 0;
for (const full of files) {
  const name = Buffer.from(relative(dist, full).split(sep).join('/'), 'utf8');
  const data = readFileSync(full);
  const store = STORED.test(full);
  const body = store ? data : deflateRawSync(data, { level: 9 });
  const crc = crc32(data);
  const { time, date } = dosTime(statSync(full).mtime);
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4); // version needed: 2.0
  local.writeUInt16LE(0x0800, 6); // names are UTF-8
  local.writeUInt16LE(store ? 0 : 8, 8);
  local.writeUInt16LE(time, 10);
  local.writeUInt16LE(date, 12);
  local.writeUInt32LE(crc, 14);
  local.writeUInt32LE(body.length, 18);
  local.writeUInt32LE(data.length, 22);
  local.writeUInt16LE(name.length, 26);
  local.writeUInt16LE(0, 28);
  chunks.push(local, name, body);
  const entry = Buffer.alloc(46);
  entry.writeUInt32LE(0x02014b50, 0);
  entry.writeUInt16LE(0x031e, 4); // made by: Unix, 3.0
  entry.writeUInt16LE(20, 6);
  entry.writeUInt16LE(0x0800, 8);
  entry.writeUInt16LE(store ? 0 : 8, 10);
  entry.writeUInt16LE(time, 12);
  entry.writeUInt16LE(date, 14);
  entry.writeUInt32LE(crc, 16);
  entry.writeUInt32LE(body.length, 20);
  entry.writeUInt32LE(data.length, 24);
  entry.writeUInt16LE(name.length, 28);
  entry.writeUInt32LE((0o100644 << 16) >>> 0, 38); // a regular file, rw-r--r--
  entry.writeUInt32LE(offset, 42);
  central.push(entry, name);
  offset += local.length + name.length + body.length;
}
const cd = Buffer.concat(central);
const end = Buffer.alloc(22);
end.writeUInt32LE(0x06054b50, 0);
end.writeUInt16LE(files.length, 8);
end.writeUInt16LE(files.length, 10);
end.writeUInt32LE(cd.length, 12);
end.writeUInt32LE(offset, 16);

mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, Buffer.concat([...chunks, cd, end]));
console.log(`${relative(root, out)}: ${files.length} files, ${(statSync(out).size / 1e6).toFixed(2)} MB (index.html at the top level)`);
console.log(`Check it: node scripts/verify-package.mjs ${relative(root, out)}`);
