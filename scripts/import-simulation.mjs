#!/usr/bin/env node
// Imports (or updates) a simulation from its own git repository into simulations/<slug>/, as
// the tree of one exact commit, without its history and without what the site does not need:
//
//   node scripts/import-simulation.mjs <slug> --repo <path-or-git-url> --ref <branch|tag|commit>
//        [--branch <name>] [--url <https://github.com/owner/repo>] [--force]
//
//   node scripts/import-simulation.mjs rocket --repo ../rocket-simulation --ref origin/claude/kimble-rocket-engineering
//   node scripts/import-simulation.mjs rocket --repo https://github.com/BKimble1/rocket-simulation --ref claude/kimble-rocket-engineering
//
// The tree comes from `git archive` (so no .git folder and nothing uncommitted), minus the
// paths in EXCLUDE below. simulations/<slug>/ is replaced as a whole; its node_modules is kept
// when package-lock.json has not changed. simulations/<slug>/SOURCE.json records where it came
// from: the repository, the branch, the full commit hash and date, the date of the import and
// what was left out. Review the change with `git diff --stat`, build, test, then commit.
import { execFileSync, spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdtempSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, resolve, sep } from 'node:path';

const root = join(import.meta.dirname, '..');

/**
 * What a simulation's repository has that the site does not ship or build with: development
 * recordings and screenshots, offline asset pipelines, build output and test reports. Patterns
 * are relative to the repository's root; a trailing slash means a folder, `*` any characters
 * within one path segment.
 */
const EXCLUDE = [
  { pattern: 'docs/recordings/', why: 'verification videos made during development; not part of the app' },
  { pattern: 'docs/screenshots/', why: 'screenshots made during development; not part of the app' },
  { pattern: 'tools/', why: 'offline Python pipelines (narration, textures, brand, site bake); their outputs are committed in public/ and src/' },
  { pattern: 'release/', why: 'packaged builds' },
  { pattern: 'dist*/', why: 'build output' },
  { pattern: 'node_modules/', why: 'dependencies (installed with npm ci)' },
  { pattern: 'test-results/', why: 'test output' },
  { pattern: 'playwright-report/', why: 'test output' },
  {
    pattern: 'public/og/',
    why: 'the stand-alone hub card (poster and preview clip); nothing in src/ or index.html loads it, and FAB / ONE records its own card preview in site/media/<slug>/',
  },
  {
    pattern: 'public/narration/*/qa.json',
    why: 'measurements from the offline narration pipeline (tools/narration); the app reads only manifest.json and the audio',
  },
];

function usage(msg) {
  if (msg) console.error(msg);
  console.error('usage: node scripts/import-simulation.mjs <slug> --repo <path-or-git-url> --ref <branch|tag|commit> [--branch <name>] [--url <repository URL>] [--force]');
  process.exit(2);
}

const argv = process.argv.slice(2);
const opt = (name) => {
  const i = argv.indexOf(`--${name}`);
  if (i < 0) return undefined;
  const v = argv[i + 1];
  if (!v || v.startsWith('--')) usage(`--${name} needs a value`);
  argv.splice(i, 2);
  return v;
};
const repoArg = opt('repo');
const refArg = opt('ref');
const branchArg = opt('branch');
const urlArg = opt('url');
const force = argv.includes('--force');
const slug = argv.filter((a) => a !== '--force')[0];
if (!slug || !repoArg || !refArg) usage();
if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) usage(`"${slug}" is not a valid route name (lowercase letters, digits, hyphens)`);

const git = (args, opts = {}) => execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...opts }).trim();
const gitOk = (args, cwd) => spawnSync('git', args, { cwd, stdio: 'ignore' }).status === 0;

const dest = join(root, 'simulations', slug);
const rel = relative(root, dest).split(sep).join('/');

// A folder with changes not yet committed would lose them.
if (existsSync(dest) && !force) {
  const dirty = git(['status', '--porcelain', '--', rel], { cwd: root });
  if (dirty) {
    console.error(`${rel} has uncommitted changes (commit or discard them, or pass --force):\n${dirty}`);
    process.exit(1);
  }
}

// The repository: a local clone as it is, or a URL fetched into a temporary one.
const isUrl = /^(https?|ssh|git|file):\/\/|^[\w.-]+@[\w.-]+:/.test(repoArg);
let repo;
let cleanupRepo = null;
if (isUrl) {
  repo = mkdtempSync(join(tmpdir(), `import-${slug}-repo-`));
  cleanupRepo = repo;
  git(['init', '--quiet'], { cwd: repo });
  console.log(`Fetching ${refArg} from ${repoArg}…`);
  const r = spawnSync('git', ['fetch', '--quiet', '--depth', '1', repoArg, refArg], { cwd: repo, stdio: 'inherit' });
  if (r.status !== 0) {
    rmSync(repo, { recursive: true, force: true });
    console.error(`Could not fetch ${refArg} from ${repoArg}.`);
    process.exit(1);
  }
} else {
  repo = resolve(repoArg);
  if (!gitOk(['rev-parse', '--git-dir'], repo)) usage(`${repo} is not a git repository`);
}

let commit;
try {
  commit = git(['rev-parse', '--verify', `${isUrl ? 'FETCH_HEAD' : refArg}^{commit}`], { cwd: repo });
} catch {
  console.error(`${refArg} is not a commit in ${repoArg}`);
  process.exit(1);
}
const commitDate = git(['show', '-s', '--format=%cI', commit], { cwd: repo });
const subject = git(['show', '-s', '--format=%s', commit], { cwd: repo });

/** The branch the commit was taken from, as its repository names it (no remote prefix). */
function branchName() {
  if (branchArg) return branchArg;
  if (/^[0-9a-f]{7,40}$/i.test(refArg)) return null;
  if (isUrl) return refArg.replace(/^refs\/heads\//, '');
  if (gitOk(['show-ref', '--verify', '--quiet', `refs/heads/${refArg}`], repo)) return refArg;
  for (const remote of git(['remote'], { cwd: repo }).split('\n').filter(Boolean))
    if (refArg.startsWith(`${remote}/`) && gitOk(['show-ref', '--verify', '--quiet', `refs/remotes/${refArg}`], repo)) return refArg.slice(remote.length + 1);
  return null;
}
const branch = branchName();

/** A public address for the repository: --url, the URL given, or the local clone's origin. */
function repositoryUrl() {
  let u = urlArg ?? (isUrl ? repoArg : null);
  if (!u) {
    try {
      u = git(['remote', 'get-url', 'origin'], { cwd: repo });
    } catch {
      return null;
    }
  }
  return u
    .replace(/^git@([^:]+):/, 'https://$1/')
    .replace(/^ssh:\/\/git@/, 'https://')
    .replace(/\.git$/, '');
}
const repository = repositoryUrl();

// The tree at the commit, into a temporary folder next to the destination (same file system).
const stage = mkdtempSync(join(root, 'simulations', `.import-${slug}-`));
chmodSync(stage, 0o755);
try {
  const tar = spawnSync('git', ['archive', '--format=tar', commit], { cwd: repo, maxBuffer: 1 << 30 });
  if (tar.status !== 0) throw new Error(`git archive failed: ${tar.stderr}`);
  const x = spawnSync('tar', ['-x', '-f', '-', '-C', stage], { input: tar.stdout, stdio: ['pipe', 'inherit', 'inherit'] });
  if (x.status !== 0) throw new Error('tar -x failed');

  // Leave out what the site does not need.
  const toRegExp = (p) =>
    new RegExp(
      '^' +
        p
          .replace(/\/$/, '')
          .split('/')
          .map((seg) => seg.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]*'))
          .join('/') +
        (p.endsWith('/') ? '(/|$)' : '$'),
    );
  const all = [];
  (function walk(dir) {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) walk(full);
      else all.push(relative(stage, full).split(sep).join('/'));
    }
  })(stage);
  const excluded = EXCLUDE.map((e) => ({ ...e, re: toRegExp(e.pattern), files: 0, bytes: 0 }));
  for (const f of all) {
    const e = excluded.find((x) => x.re.test(f));
    if (!e) continue;
    e.files++;
    e.bytes += statSync(join(stage, f)).size;
    rmSync(join(stage, f));
  }
  // folders left empty
  (function prune(dir) {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) {
        prune(full);
        if (!readdirSync(full).length) rmSync(full, { recursive: true });
      }
    }
  })(stage);
  if (!existsSync(join(stage, 'package.json'))) throw new Error(`${commit} has no package.json at its root: not a simulation project`);
  const lock = join(stage, 'package-lock.json');
  if (!existsSync(lock)) throw new Error(`${commit} has no package-lock.json: the site installs simulations with npm ci`);

  const source = {
    about: `Where simulations/${slug}/ comes from. Written by scripts/import-simulation.mjs; update it with the same script, never by hand.`,
    repository,
    branch,
    commit,
    commitDate,
    commitSubject: subject,
    importedAt: new Date().toISOString(),
    command: `node scripts/import-simulation.mjs ${slug} --repo ${repository ?? repoArg} --ref ${branch ?? commit}`,
    excluded: excluded.map(({ pattern, why, files, bytes }) => ({ pattern, why, files, bytes })),
  };
  writeFileSync(join(stage, 'SOURCE.json'), JSON.stringify(source, null, 2) + '\n');

  // Swap it in, keeping installed dependencies when the lock file is the same.
  const oldModules = join(dest, 'node_modules');
  const keepModules = existsSync(oldModules) && existsSync(join(dest, 'package-lock.json')) && readFileSync(join(dest, 'package-lock.json'), 'utf8') === readFileSync(lock, 'utf8');
  if (keepModules) renameSync(oldModules, join(stage, 'node_modules'));
  rmSync(dest, { recursive: true, force: true });
  renameSync(stage, dest);

  const kept = all.length - excluded.reduce((n, e) => n + e.files, 0);
  const mb = (n) => `${(n / 1e6).toFixed(2)} MB`;
  console.log(`\nImported ${rel}/ from ${repository ?? repoArg}`);
  console.log(`  branch  ${branch ?? '(none recorded)'}`);
  console.log(`  commit  ${commit}  ${commitDate}  ${subject}`);
  console.log(`  files   ${kept} kept, ${all.length - kept} left out:`);
  for (const e of excluded) if (e.files) console.log(`    ${e.pattern.padEnd(28)} ${String(e.files).padStart(4)} files  ${mb(e.bytes)}`);
  console.log(`  node_modules ${keepModules ? 'kept (same package-lock.json)' : 'removed: the build runs npm ci'}`);
  console.log(`\nRecorded in ${rel}/SOURCE.json. Next: git diff --stat, npm run build, npm run e2e.`);
} catch (e) {
  rmSync(stage, { recursive: true, force: true });
  console.error(String(e instanceof Error ? e.message : e));
  process.exitCode = 1;
} finally {
  if (cleanupRepo) rmSync(cleanupRepo, { recursive: true, force: true });
}
