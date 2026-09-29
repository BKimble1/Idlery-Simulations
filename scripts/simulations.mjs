#!/usr/bin/env node
// Run a command in every simulation's folder, in the order of simulations.config.mjs.
//
//   node scripts/simulations.mjs npm ci      (npm run setup)
//   node scripts/simulations.mjs npm test    (npm test: each simulation's unit tests)
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import simulations from '../simulations.config.mjs';

const [cmd, ...args] = process.argv.slice(2);
if (!cmd) {
  console.error('usage: node scripts/simulations.mjs <command> [args…]');
  process.exit(2);
}
const root = join(import.meta.dirname, '..');
for (const s of simulations) {
  console.log(`\n── ${s.slug}: ${[cmd, ...args].join(' ')}`);
  const r = spawnSync(cmd, args, { cwd: join(root, 'simulations', s.slug), stdio: 'inherit', shell: process.platform === 'win32' });
  if (r.status !== 0) process.exit(r.status ?? 1);
}
