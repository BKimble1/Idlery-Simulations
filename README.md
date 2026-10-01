# FAB / ONE

**FAB / ONE is Idlery's site for interactive engineering simulations**, published at
[simulations.idlery.com](https://simulations.idlery.com). Each simulation is a working model
you run in the browser, at its own address, with a card on the homepage.

| address | what it is | source |
|---|---|---|
| `/` | the FAB / ONE homepage | [`site/`](site/) |
| [`/photolithography`](https://simulations.idlery.com/photolithography) | **01 Photolithography**: build a chip, layer by layer | [`simulations/photolithography/`](simulations/photolithography/), kept in this repository |
| [`/rocket`](https://simulations.idlery.com/rocket) | **02 Rocket Engineering** (KIMBLE): from the launch pad to orbit | [`simulations/rocket/`](simulations/rocket/), imported from [BKimble1/rocket-simulation](https://github.com/BKimble1/rocket-simulation) (see [its SOURCE.json](simulations/rocket/SOURCE.json)) |
| [`/humanoid`](https://simulations.idlery.com/humanoid) | **03 Humanoid**: inside a machine built to move like us | [`simulations/humanoid/`](simulations/humanoid/), imported from [BKimble1/humanoid-simulation](https://github.com/BKimble1/humanoid-simulation) (see [its SOURCE.json](simulations/humanoid/SOURCE.json)) |
| [`/automotive`](https://simulations.idlery.com/automotive) | **04 Automotive** (AUTOMOTIVE / ONE): how a car becomes motion | [`simulations/automotive/`](simulations/automotive/), imported from [BKimble1/automotive-simulation](https://github.com/BKimble1/automotive-simulation) (see [its SOURCE.json](simulations/automotive/SOURCE.json)) |

The homepage is plain HTML and CSS with a few lines of script for the preview videos: it
loads none of a simulation's code, which is downloaded only when a visitor opens it. Each
simulation has the same card: a row with its preview clip on the left and what it is on the
right (on phones, the clip above the text), numbered in the order of `simulations.config.mjs`.

## Layout

```
simulations.config.mjs      the simulations: one route and one homepage card each
site/                       the homepage and its 404 page (Vite, no framework)
  media/<slug>/             each card's preview clip and poster, the shot list they are made
                            from (preview.json) and how they were made (PROVENANCE.md)
simulations/<slug>/         each simulation: its own project, dependencies, tests and documents
  SOURCE.json               for an imported simulation: its repository, branch and commit
scripts/
  build.mjs                 builds everything into dist/, checks each simulation's page, and writes
                            Netlify's _redirects and _headers
  serve.mjs                 serves dist/ the way Netlify does (redirect rules, headers, 404 page)
  capture-preview.mjs       records a card's preview video from the built simulation
  import-simulation.mjs     imports or updates a simulation from its own git repository
  package.mjs               zips dist/ for a manual Netlify upload
  verify-package.mjs        unzips a package, serves it like Netlify and checks it
  simulation-e2e.mjs        runs a simulation's own browser tests at its route
e2e/                        the site's browser tests
```

## Working on it

You need Node.js 20.19+ (tested with 22.22).

```bash
npm run setup          # npm ci here and in every simulation
npm run build          # everything into dist/ (the folder Netlify serves)
npm run serve          # dist/ at http://127.0.0.1:8888, routed as Netlify routes it
```

| command | what it does |
|---|---|
| `npm run build` | builds the homepage, then each simulation at its route (`--base /<slug>/`) and checks the page it wrote, then writes `dist/_redirects`, `dist/_headers`, `sitemap.xml` and `robots.txt` |
| `npm run serve` | serves `dist/` like Netlify: forced rewrites, trailing slashes, headers, `404.html`, ranges |
| `npm run dev` | the homepage alone with hot reload (the cards link to routes this server does not have) |
| `npm test` | every simulation's unit tests |
| `npm run e2e` | the site's browser tests (builds and serves first): homepage, previews, routing, and Photolithography, Rocket Engineering and Humanoid at their routes |
| `npm run e2e:photolithography` | Photolithography's own browser suite at `/photolithography` on the built site (long: see its README) |
| `npm run e2e:humanoid` | Humanoid's own browser suite at `/humanoid` on the built site (desktop, laptop, tablet and phone) |
| `npm run typecheck` | types of the homepage, its build config and the site's tests |
| `npm run capture-preview -- <slug>` | records `site/media/<slug>/preview.mp4`, `preview.webm`, `poster.webp` and `PROVENANCE.md` from the built site (Photolithography's also makes `site/public/og.jpg`, the homepage's link-preview image) |
| `npm run import-simulation -- <slug> --repo <path or URL> --ref <ref>` | replaces `simulations/<slug>/` with that commit of its repository (see "Rocket Engineering" below) |
| `npm run package` | `release/fab-one-site.zip`: the contents of `dist/`, with `index.html` at the top level (`-- --name <name>` for `release/<name>.zip`) |
| `npm run verify-package -- <zip>` | unzips a package into a temporary folder, serves it like Netlify and checks its layout, routes, files, types, previews and headers |

The browser tests use Playwright's Chromium with software WebGL, so they run without a GPU;
if it is not installed yet, run `npx playwright install chromium` once. Each simulation can
still be developed on its own in its folder (`npm run dev` there): see its README.

## How the routes work

Netlify serves `dist/` as it is. A simulation's page is `dist/<slug>/index.html`, and the
build writes one rule per simulation into `dist/_redirects`:

```
/photolithography  /photolithography/index.html  200!
/rocket  /rocket/index.html  200!
/humanoid  /humanoid/index.html  200!
```

A forced (`!`) rewrite (`200`) serves that page at `/photolithography` itself, and, because
Netlify matches rules with or without a trailing slash, at `/photolithography/` too, whatever
the query string (`/photolithography?step=expose`). The address never changes and nothing
redirects, so a visit, a refresh, a shared lesson link and Back/Forward all load the same page;
the simulation then reads its query string (`/rocket?v=mission&m=leo` opens a mission).
Everything it loads is under `/photolithography/` (it is built with
`--base /photolithography/`), so the page works at either address. The rule matches only the
route itself: a file under it that does not exist, like `/rocket/assets/missing.js`, is a 404,
never the page. Built files carry content hashes, and `_headers` lets browsers keep them for a
year (`/assets/*`, `/media/*` and each `/<slug>/assets/*`). Files that keep their name when
they change, like the rocket's textures and narration, get a shorter rule from the
simulation's `headers` in the config (an hour, then checked again in the background).

The build checks each simulation's page after building it: every script, style sheet, icon and
font it loads must be under `/<slug>/` and in `dist/<slug>/`, and the build must not have
written anywhere else, or the build fails. A relative URL (`./icon.svg`) would resolve against
`/` at `/<slug>` (without the slash), so the build makes it absolute under the route and says
so; the simulation should write it from the site's root (`/icon.svg`), which Vite puts under
the base. The homepage's own files are in `dist/assets/` and its preview clips in
`dist/media/<slug>/`, each simulation's in `dist/<slug>/`, so their names cannot collide.

Photolithography's *Save for offline* uses a service worker at `/photolithography/sw.js`.
`_headers` sends `Service-Worker-Allowed: /photolithography` with it, so it can control the
route's own address (without the slash); it caches and answers only that simulation, never
the homepage or the other simulations (`e2e/humanoid.spec.ts` installs it and checks that `/`,
`/rocket` and `/humanoid` stay outside it).

`scripts/serve.mjs` reproduces these rules for local use and the tests, including Netlify's
default of redirecting `/about` to `/about/` when only `about/index.html` exists (which the
forced rule avoids). The rules were also checked with Netlify's own parsers and matcher
(`@netlify/redirect-parser`, `@netlify/headers-parser`, `netlify-redirector`): with the three
simulations, 3 redirect rules and 8 header rules parse without errors; `/rocket`, `/rocket/`,
`/rocket?v=mission&m=leo`, `/humanoid`, `/humanoid/` and `/humanoid?mode=simulate&lab=walk`
match their forced rule, and `/rocket/assets/missing.js`, `/humanoid/assets/missing.js`,
`/rocket/index.html` and `/humanoid/index.html` match none (they are files, or 404s). With
Automotive added: 4 redirect rules and 10 header rules parse without errors, `/automotive`,
`/automotive/` and `/automotive?mode=explore&system=brakes&part=brake-caliper` match its forced
rule, and `/automotive/assets/missing.js` and `/automotive/index.html` match none.

## Adding a simulation

1. **Put the project in `simulations/<slug>/`**: from its own repository with
   `scripts/import-simulation.mjs` (below), or kept here. The slug is the route: lowercase
   letters, digits and hyphens. The project needs a `package.json` and a Vite build of a static
   site. By default the site's build runs
   `npm run build -- --base /<slug>/ --outDir dist/<slug> --emptyOutDir`; npm appends those
   options to the end of the build script, so that only works when the script ends with
   `vite build` (the build checks). Otherwise, list the commands in the entry's `build`, as
   the rocket's does (`{base}` and `{outDir}` are filled in; the build also sets `FABONE_BASE`
   and `FABONE_OUT_DIR` for a Vite config that wants them). The project must load everything
   through the base (`import.meta.env.BASE_URL`, or paths from the root that Vite rewrites)
   and keep its own addresses under its route: query strings, as both simulations do, or paths
   below `/<slug>/` (then add a splat rule for them in `redirects()` in `scripts/build.mjs`).
2. **Link back.** Show a "Back to FAB / ONE" link that goes to `/` when
   `import.meta.env.VITE_FABONE_HOME` is set (the site's build sets it to `/`);
   Photolithography's is in `simulations/photolithography/src/ui/Chrome.tsx`. A project that
   calls it something else gets its own names through the entry's `env` (below).
3. **Keep to your route.** Browser storage is shared by the whole site: name local storage
   keys, caches and service workers after the simulation (see Photolithography's
   `src/watch/offline.ts`), and set `serviceWorker` in the config if it registers one.
4. **Add its entry to `simulations.config.mjs`**: title, tagline, field, summary, three facts
   and the preview's files (in `media/<slug>/`); `env`, `build` and `headers` when it needs
   them. Cards appear in the config's order, all alike, numbered 01, 02, …
5. **Record its preview.** Write `site/media/<slug>/preview.json` (a shot list; see the
   comment at the top of `scripts/capture-preview.mjs`, and Photolithography's and the
   rocket's), build once with `node scripts/build.mjs --skip-previews`, then run
   `npm run capture-preview -- <slug>`. The clip is taken from the built site, so it shows
   what visitors will see. Frame-stepped rendering needs an `advance` hook like
   Photolithography's or the rocket's `?virt=1`; without one, frames are taken in real time.
   With `"loop": true` in the shot list the clip's end also fades into its beginning, so the
   card's looping preview has no cut (Humanoid's does). Try the shot list first with a short test render somewhere else:
   `npm run capture-preview -- <slug> --frames=6 --out=/tmp/preview-test`.
6. `npm run build`, `npm run e2e` (the tests read the config, so the new card and route are
   covered), then publish.

## Rocket Engineering

KIMBLE Rocket Engineering is developed in its own repository and imported here as one commit
(no history), with `scripts/import-simulation.mjs`. Nothing in `simulations/rocket/` is edited
here: changes go to its repository, then it is imported again.

**Updating it** (or importing another simulation the same way):

```bash
# the V2 branch as it is now
npm run import-simulation -- rocket --repo https://github.com/BKimble1/rocket-simulation --ref claude/clever-pascal-y4v4d8
# an exact commit (SOURCE.json's "command" is this, for the current import)
npm run import-simulation -- rocket --repo https://github.com/BKimble1/rocket-simulation --ref <commit> --branch claude/clever-pascal-y4v4d8
# or from a local clone, at a branch, tag or commit
npm run import-simulation -- rocket --repo ../rocket-simulation --ref origin/claude/clever-pascal-y4v4d8
git diff --stat simulations/rocket     # review
npm run build && npm run e2e           # then re-record the preview if the launch or staging changed
```

The script exports the commit with `git archive` (no `.git`, nothing uncommitted), replaces
`simulations/rocket/` with it, prints the commit and writes `simulations/rocket/SOURCE.json`:
repository, branch, full commit hash and date, import date and what was left out. It leaves
out what the site neither builds nor serves: `docs/recordings/`, `docs/screenshots/`, `tools/`
(the offline Python narration, texture and brand pipelines), `release/`, `dist*/`,
`node_modules/`, `test-results/`, `playwright-report/`, `public/og/` (the rocket's own
stand-alone card preview, which nothing in its `src/` or `index.html` loads) and
`public/narration/*/qa.json` (measurements from the narration pipeline; the app reads only
`manifest.json` and the audio). It keeps `src/`, `public/` (textures, narration audio, brand),
`index.html`, `package.json` and `package-lock.json`, the TypeScript and Vite configs, `e2e/`,
`scripts/` and the documents. The current import is V2,
`e76d962e1ecc9628cef69449db63e74d3a8c0f4d` (2026-09-30, branch `claude/clever-pascal-y4v4d8`, which builds on
V1's `claude/kimble-rocket-engineering` at `ec43e1f`).

**How it is built.** The rocket's own build script is `tsc -b && vite build`, so its entry in
`simulations.config.mjs` runs those two commands itself and hands `--base /rocket/`,
`--outDir dist/rocket` and `--emptyOutDir` straight to `vite build` (rather than relying on
npm appending them to the end of the script). It names its way back `VITE_HUB_URL` and
`VITE_HUB_LABEL` (`src/config.ts`), where the site passes `VITE_FABONE_HOME`; its `env` in the
config bridges the two: `VITE_HUB_URL=/` and `VITE_HUB_LABEL=Back to FAB / ONE`, set for its
build next to `VITE_FABONE_HOME=/`. It registers no service worker and keeps its settings and
progress in local storage keys of its own (`kimble.*`).

**Its way back on phones.** Below 960 px the rocket's header has no room for the words, so
its link back is a round back button placed first in the header (its accessible name is the
full "Back to FAB / ONE"), and the labelled link sits on its home card; Settings and the page
shown without WebGL carry it too. Its `index.html` links its icon from the base
(`/brand/kimble-mark.svg`), which `vite build --base /rocket/` resolves.

**Its preview** is recorded from the built site on its frame-stepped clock
(`?virt=1&capture=1&ui=0&quality=high`: each frame is exactly 1/30 s, whatever the render
time), from the shot list in [`site/media/rocket/preview.json`](site/media/rocket/preview.json):
the launch from T-4 s to T+2 s (engine start at T-3 s, liftoff), then a cross-fade to T+155 s
to T+159.5 s (the stages drifting apart after their separation at T+151.2 s, and the upper-stage
engine starting at T+158.2 s), 10.1 s in all. With software WebGL a frame takes
5 to 10 seconds, so the clip (315 frames) takes the better part of an hour; see
[`site/media/rocket/PROVENANCE.md`](site/media/rocket/PROVENANCE.md) for the current one:

```bash
npm run build -- --skip-previews        # if dist/ is not built yet
npm run capture-preview -- rocket       # site/media/rocket/preview.mp4, preview.webm, poster.webp, PROVENANCE.md
npm run build                           # the homepage with the new clip
```

## Humanoid

Humanoid (FO-H1, an original electric humanoid designed for the simulation; not a real
robot) is developed in [BKimble1/humanoid-simulation](https://github.com/BKimble1/humanoid-simulation)
and imported the same way as the rocket, with `scripts/import-simulation.mjs` (one commit, no
history, `docs/recordings/` left out). Nothing in `simulations/humanoid/` is edited here. The
current import is V2, `400ddb744393b90eff9b0443a97315cfa8fea53f` (2026-10-01, branch `claude/humanoid-v2`, which builds on V1's
`claude/fab-one-humanoid` at `f5fa839`); see [its SOURCE.json](simulations/humanoid/SOURCE.json).

```bash
npm run import-simulation -- humanoid --repo https://github.com/BKimble1/humanoid-simulation --ref <commit> --branch claude/humanoid-v2
npm run build && npm run e2e && npm run e2e:humanoid
```

**How it is built.** Its build script is `tsc -b && vite build`, so the default build command
works (npm appends `--base /humanoid/ --outDir … --emptyOutDir` to `vite build`), and it reads
`VITE_FABONE_HOME` for its "Back to FAB / ONE" link. It registers no service worker and keeps
no browser storage; everything it loads is under `/humanoid/` (checked by the build and by
`e2e/humanoid.spec.ts`, which also installs Photolithography's worker and checks that `/`,
`/rocket` and `/humanoid` stay outside it).

**Its own tests** run at the route with `npm run e2e:humanoid` (the simulation's Playwright
suites, including its continuity, Watch and camera tests, against the built site).

**Its preview** is recorded from the built site on its frame-stepped clock
(`?virt=1&capture=1&quality=high`), from [`site/media/humanoid/preview.json`](site/media/humanoid/preview.json),
and loops without a cut (`"loop": true`); see
[`site/media/humanoid/PROVENANCE.md`](site/media/humanoid/PROVENANCE.md).

## Automotive

AUTOMOTIVE / ONE (the S-1, an original front-engined, rear-wheel-drive sedan designed for the
simulation; not a real car and carrying no maker's marks) is developed in
[BKimble1/automotive-simulation](https://github.com/BKimble1/automotive-simulation) and imported
the same way, with `scripts/import-simulation.mjs` (one commit, no history; its offline
narration pipeline `tools/` and the narration QA file are left out). Nothing in
`simulations/automotive/` is edited here; see [its SOURCE.json](simulations/automotive/SOURCE.json)
for the commit.

```bash
npm run import-simulation -- automotive --repo https://github.com/BKimble1/automotive-simulation --ref <commit> --branch claude/automotive-one
npm run build && npm run e2e && npm run e2e:automotive
```

**How it is built.** Its build script is `tsc -b && vite build`, so the default build command
works, and it reads `VITE_FABONE_HOME` for its "Back to FAB / ONE" link. It registers no
service worker and keeps no browser storage; everything it loads is under `/automotive/`,
including the film's bundled narration (`/automotive/narration/<version>/`, revalidated hourly
like the rocket's). Checked by the build and by `e2e/automotive.spec.ts`.

**Its own tests** run at the route with `npm run e2e:automotive` (its Playwright suite: deep
links and Back, search, the film, labs, a diagnosis, camera continuity, context loss, reduced
motion and layout, on desktop, laptop, tablet and phone sizes).

**Its preview** is recorded from the built site on its frame-stepped clock
(`?virt=1&capture=1&quality=high`), from [`site/media/automotive/preview.json`](site/media/automotive/preview.json),
and loops without a cut; see [`site/media/automotive/PROVENANCE.md`](site/media/automotive/PROVENANCE.md).

## Publishing

The site is published by uploading `dist/` to Netlify by hand; DNS stays at IONOS.

1. Make the package and check it:

   ```bash
   npm run build
   npm run package -- --name FAB_ONE_Automotive_Netlify    # release/FAB_ONE_Automotive_Netlify.zip
   npm run verify-package -- release/FAB_ONE_Automotive_Netlify.zip
   ```

   (`npm run package` alone makes `release/fab-one-site.zip`.) The check unzips the package
   into an empty temporary folder, serves it with Netlify's rules, and asks for every route
   and every file the pages load. Unzip the package: the folder you get has `index.html`,
   `404.html`, `_redirects`, `_headers`, `sitemap.xml`, `robots.txt`, `assets/`, `media/`,
   `photolithography/`, `rocket/`, `humanoid/` and `automotive/` at its top level. Upload that folder, not a folder
   around it.
2. In Netlify: for a new project, **Add new project → Deploy manually** and drop the folder;
   to update an existing one, open its **Deploys** page and drop the folder onto the upload
   area at the bottom. The deploy summary should report 4 redirect rules and 10 header rules.
   Check `https://<project-name>.netlify.app/`, `/photolithography`, `/rocket`, `/humanoid` and
   `/automotive` (also refreshed, and deep links such as `/rocket?v=mission&m=leo`,
   `/humanoid?mode=simulate&lab=walk` and `/automotive?mode=explore&system=brakes&part=brake-caliper`).
3. **Domain management → Add a domain → Add a domain you already own**, enter
   `simulations.idlery.com`, **Verify**, then add it. Netlify shows it as waiting for DNS.
4. At IONOS: **Domains & SSL**, the gear icon next to `idlery.com` → **DNS** →
   **Add record → CNAME**. Host name `simulations`, points to `<project-name>.netlify.app`
   (no `https://`), TTL 1 hour, **Save**. If `simulations` already has A, AAAA or CNAME
   records (IONOS adds some when a subdomain is created under *Manage subdomains*), delete them
   first: a CNAME cannot share its name with other records.
5. Back in Netlify, once the record is seen (minutes, up to an hour or more), the Let's Encrypt
   certificate is issued automatically (**Domain management → HTTPS**; **Verify DNS
   configuration** there checks again). *Save for offline* needs HTTPS. If `idlery.com` has CAA
   records, one of them must allow `letsencrypt.org`.

## Provenance

Humanoid is imported from
[BKimble1/humanoid-simulation](https://github.com/BKimble1/humanoid-simulation): the commit, its
branch and date, and what was left out are in
[`simulations/humanoid/SOURCE.json`](simulations/humanoid/SOURCE.json); its card preview's
origin is in [`site/media/humanoid/PROVENANCE.md`](site/media/humanoid/PROVENANCE.md).

Rocket Engineering is imported from
[BKimble1/rocket-simulation](https://github.com/BKimble1/rocket-simulation): the commit, its
branch and date, and what was left out are in
[`simulations/rocket/SOURCE.json`](simulations/rocket/SOURCE.json); its card preview's
origin is in [`site/media/rocket/PROVENANCE.md`](site/media/rocket/PROVENANCE.md).

Photolithography was imported from
[BKimble1/Photolithography-Simulation-Site](https://github.com/BKimble1/Photolithography-Simulation-Site),
branch `claude/fab-one-round-four-realism-x1ze0a`, at
`822bb0fdebc3eeb395512fc2ad9c1b2e9b66e9df`, with its history: the import commit moves every
file unchanged into `simulations/photolithography/` (`git log --follow` reaches the earlier
commits). What changed afterwards to run it at `/photolithography` is described in
[its README](simulations/photolithography/README.md#inside-fab--one).
