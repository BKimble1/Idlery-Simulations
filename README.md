# FAB / ONE

**FAB / ONE is Idlery's site for interactive engineering simulations**, published at
[simulations.idlery.com](https://simulations.idlery.com). Each simulation is a working model
you run in the browser, at its own address, with a card on the homepage.

| address | what it is | source |
|---|---|---|
| `/` | the FAB / ONE homepage | [`site/`](site/) |
| [`/photolithography`](https://simulations.idlery.com/photolithography) | **Photolithography** — build a chip, layer by layer | [`simulations/photolithography/`](simulations/photolithography/) |

The homepage is plain HTML and CSS with a few lines of script for the preview videos: it
loads none of a simulation's code, which is downloaded only when a visitor opens it.

## Layout

```
simulations.config.mjs      the simulations: one route and one homepage card each
site/                       the homepage and its 404 page (Vite, no framework)
  media/<slug>/             each card's preview clip and poster, and the shot list they are made from
simulations/<slug>/         each simulation: its own project, dependencies, tests and documents
scripts/
  build.mjs                 builds everything into dist/ and writes Netlify's _redirects and _headers
  serve.mjs                 serves dist/ the way Netlify does (redirect rules, headers, 404 page)
  capture-preview.mjs       records a card's preview video from the built simulation
  package.mjs               zips dist/ for a manual Netlify upload
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
| `npm run build` | builds the homepage, then each simulation at its route (`--base /<slug>/`), then writes `dist/_redirects`, `dist/_headers`, `sitemap.xml` and `robots.txt` |
| `npm run serve` | serves `dist/` like Netlify: forced rewrites, trailing slashes, headers, `404.html`, ranges |
| `npm run dev` | the homepage alone with hot reload (the cards link to routes this server does not have) |
| `npm test` | every simulation's unit tests |
| `npm run e2e` | the site's browser tests (builds and serves first): homepage, previews, routing, and Photolithography at its route |
| `npm run e2e:photolithography` | Photolithography's own browser suite at `/photolithography` on the built site (long: see its README) |
| `npm run typecheck` | the homepage's and the scripts' types |
| `npm run capture-preview -- <slug>` | records `site/media/<slug>/preview.mp4`, `preview.webm` and `poster.jpg` from the built site |
| `npm run package` | `release/fab-one-site.zip`: the contents of `dist/`, with `index.html` at the top level |

Each simulation can still be developed on its own in its folder (`npm run dev` there): see
its README.

## How the routes work

Netlify serves `dist/` as it is. A simulation's page is `dist/<slug>/index.html`, and the
build writes one rule per simulation into `dist/_redirects`:

```
/photolithography  /photolithography/index.html  200!
```

A forced (`!`) rewrite (`200`) serves that page at `/photolithography` itself, and, because
Netlify matches rules with or without a trailing slash, at `/photolithography/` too, whatever
the query string (`/photolithography?step=expose`). The address never changes and nothing
redirects, so a visit, a refresh, a shared lesson link and Back/Forward all load the same page;
the simulation then reads its query string. Everything it loads is under
`/photolithography/` (it is built with `--base /photolithography/`), so the page works at
either address. Its files carry content hashes, and `_headers` lets browsers keep them for a
year.

Photolithography's *Save for offline* uses a service worker at `/photolithography/sw.js`.
`_headers` sends `Service-Worker-Allowed: /photolithography` with it, so it can control the
route's own address (without the slash); it caches and answers only that simulation, never
the homepage.

`scripts/serve.mjs` reproduces these rules for local use and the tests, including Netlify's
default of redirecting `/about` to `/about/` when only `about/index.html` exists (which the
forced rule avoids). The rules were also checked with Netlify's own parsers and matcher
(`@netlify/redirect-parser`, `@netlify/headers-parser`, `netlify-redirector`).

## Adding a simulation

1. **Put the project in `simulations/<slug>/`.** The slug is the route: lowercase letters,
   digits and hyphens. The project needs a `package.json` whose `npm run build` builds a
   static site with Vite and passes extra options on to `vite build` (the site's build runs
   `npm run build -- --base /<slug>/ --outDir dist/<slug> --emptyOutDir`). It must load
   everything through the base (`import.meta.env.BASE_URL`, or relative imports that Vite
   rewrites) and keep its own addresses under its route: query strings, as Photolithography
   does, or paths below `/<slug>/` (then add a splat rule for them in `redirects()` in
   `scripts/build.mjs`).
2. **Link back.** Show a "Back to FAB / ONE" link when `import.meta.env.VITE_FABONE_HOME` is
   set (the site's build sets it to `/`); Photolithography's is in
   `simulations/photolithography/src/ui/Chrome.tsx`.
3. **Keep to your route.** Browser storage is shared by the whole site: name local storage
   keys, caches and service workers after the simulation (see Photolithography's
   `src/watch/offline.ts`), and set `serviceWorker` in the config if it registers one.
4. **Add its entry to `simulations.config.mjs`**: title, tagline, field, summary, three facts
   and the preview's files. Cards appear in the config's order; the one marked `featured` is
   the wide one.
5. **Record its preview.** Write `site/media/<slug>/preview.json` (a shot list; see
   Photolithography's), build once with `node scripts/build.mjs --skip-previews`, then run
   `npm run capture-preview -- <slug>`. The clip is taken from the built site, so it shows
   what visitors will see. Frame-stepped rendering needs an `advance` hook like
   Photolithography's `?virt=1`; without one, frames are taken in real time.
6. `npm run build`, `npm run e2e` (the tests read the config, so the new card and route are
   covered), then publish.

## Publishing

The site is published by uploading `dist/` to Netlify by hand; DNS stays at IONOS.

1. `npm run build && npm run package` makes `release/fab-one-site.zip`. Unzip it: the folder
   you get has `index.html`, `404.html`, `_redirects`, `_headers`, `assets/` and
   `photolithography/` at its top level. Upload that folder, not a folder around it.
2. In Netlify: for a new project, **Add new project → Deploy manually** and drop the folder;
   to update an existing one, open its **Deploys** page and drop the folder onto the upload
   area at the bottom. The deploy summary should report 1 redirect rule and 3 header rules.
   Check `https://<project-name>.netlify.app/` and `/photolithography` (also refreshed).
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

Photolithography was imported from
[BKimble1/Photolithography-Simulation-Site](https://github.com/BKimble1/Photolithography-Simulation-Site),
branch `claude/fab-one-round-four-realism-x1ze0a`, at
`822bb0fdebc3eeb395512fc2ad9c1b2e9b66e9df`, with its history: the import commit moves every
file unchanged into `simulations/photolithography/` (`git log --follow` reaches the earlier
commits). What changed afterwards to run it at `/photolithography` is described in
[its README](simulations/photolithography/README.md#inside-fab--one).
