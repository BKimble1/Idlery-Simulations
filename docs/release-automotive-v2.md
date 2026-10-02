# FAB / ONE: four simulations, with Automotive V2

The package `FAB_ONE_Four_Simulations_Automotive_V2_Netlify.zip` is the whole site, built and
ready for a manual Netlify upload. Its four simulations are Photolithography, the rocket
simulation, Humanoid V2 and Automotive V2.

**Making the ZIP is not a deployment.** Publishing is a manual upload, described under
"Publishing" in the README.

## Sources and commits

| what | repository, branch | commit |
|---|---|---|
| Automotive V1 (start) | `BKimble1/automotive-simulation`, `claude/automotive-one` | `d39e7eba173344e2a61bf818e18b24cec8f5ca8e` |
| **Automotive V2 (packaged)** | `BKimble1/automotive-simulation`, **`claude/automotive-v2`** | `cc91d2f05d42ea3063c6c2f89d9ac1c9c6de8d3a` (see `simulations/automotive/SOURCE.json`) |
| hub (start) | `BKimble1/Idlery-Simulations`, `claude/automotive-one` | `c81234fd889937d384c39d34f67cf0fcb3cdd540` |
| **hub (packaged)** | `BKimble1/Idlery-Simulations`, **`claude/automotive-v2`** | `fa1b811` (this record was added afterwards; it is not in the package) |
| Humanoid V2 (unchanged) | `BKimble1/humanoid-simulation`, `claude/humanoid-v2` | `400ddb744393b90eff9b0443a97315cfa8fea53f` |
| Rocket V2 (unchanged) | `BKimble1/rocket-simulation`, `claude/clever-pascal-y4v4d8` | `e76d962e1ecc9628cef69449db63e74d3a8c0f4d` |
| Photolithography (unchanged) | in this repository since `822bb0f` (Round 4, `claude/fab-one-round-four-realism-x1ze0a`), with its FAB / ONE route adaptations | |

**How the automotive commits relate:**

* `1a3dc32` went into the first package of this release.
* The checks below then found a shader stall at the start of every Explore move, fixed in
  `4432bfe` (see "Measured performance").
* `7192b20`, `624bf23` and `cc91d2f` change only the browser tests, so the app built from
  `cc91d2f` is byte for byte the app built from `4432bfe`.
* The card preview was recorded from that build.

### What else came into the hub

* **Ported from `claude/fab-one-rocket-integration`:**
  * `9080b0c` became `1ab6725`: the card is titled "Rocket Flight & Mission Simulation", and a
    route test covers a mission and the film.
  * `c12c837` became `b2db545`: a card lifts on hover only where the pointer can hover.

  Both are completed work that was newer than the starting hub. Conflicts were resolved so
  that all four cards and their tests stay.
* **Not ported:** `claude/fab-one-humanoid`. Its two commits are the older Humanoid V1 import,
  which Humanoid V2 replaced.
* **Checked on 2026-10-01** against the standalone repositories' branches: the packaged
  Humanoid, Rocket and Photolithography commits are each repository's newest completed work.

## What V2 changes

The automotive repository's README and `docs/ENGINEERING.md` (assumptions and independent
checks) describe it. In short:

* **Runs**
  * Each run is described completely.
  * Labs, scenarios, lessons and the workbench inherit nothing from what ran before.
  * Snapshots are complete.
  * Lab charts and long seeks are computed in a worker.
  * Nothing on the page outruns its subject: a beat holds until its view is ready.
  * Every shader program a view needs is compiled and first used before its move starts, so
    no move stalls on a shader. Before the fix found during this release's checks, that first
    use cost 3–8 s per move in software rendering.
* **One pause**
  * A single pause holds the model, motion, camera and narration.
  * Losing the graphics context suspends everything, and nothing catches up afterwards.
* **The geartrain**
  * A coherent eight-speed geartrain is solved from its tooth counts, and the cutaway turns at
    exactly those speeds.
  * Engine torque now matches its stated curve: 255 N·m at 4,400 rpm, 152 kW at 6,400 rpm.
* **The S-1's look**
  * Silver paint, tinted glass and a softer studio.
  * Mirrors, handles, projectors, two-tone rims and wheel spin blur.
  * A moulded dashboard and padded seats.
  * Door trims that swing with their doors.
* **Steering and suspension**
  * Front knuckles steer about their ball-joint axis.
  * The tie rods and rear links never stretch.
* **The driving workbench**
  * Start/stop, P R N D, throttle, brake and steering.
  * Dry, wet or snow, and a bump ahead.
  * Keys on a desktop; pedal and steering pads on touch screens.
* **The interface**
  * A larger car on the first screen.
  * Explore details on request, view choices and tap to select.
  * A resizable phone sheet, Recentre, 44 px targets and reduced motion throughout.
  * A contained panel failure.
* **The film**
  * Every numeric caption was checked against the model, and three were corrected. The two
    in the narrated film (the starter's current and the drive-away) were re-narrated with the
    offline pipeline as `film-3`. The third, the extra electrical load, is in the electrical
    lesson only.
  * The upshift now happens on screen.
  * The pace chip shows the true playback scale.

## Tests run for this release

Node v22.22.0; Chromium (Playwright 1.56) on SwiftShader.

Each result below is from a run made for this release. "Failed, then fixed" means the run
failed, the cause was fixed, and the check was run again. The rerun is listed with its result.

**In the automotive repository** (`claude/automotive-v2`):

| check | at | result |
|---|---|---|
| `npm run typecheck` | `cc91d2f` | passed |
| `npm test` (vitest) | `cc91d2f` (as imported here) | 9 files, 88 tests passed |
| `npm run e2e` (Playwright, four screen sizes) | each V2 commit while it was developed | the final run is at the route, below |
| the new test "no program is compiled or first used during a move…" (desktop) | `1a3dc32`, then `4432bfe` | fails on `1a3dc32` (37 → 38 programs); passes on `4432bfe` |

**In this repository** (`claude/automotive-v2` at `fa1b811`, the packaged tree):

| check | result |
|---|---|
| `npm run typecheck` | passed |
| `npm test` (every simulation's unit tests) | Photolithography 63, rocket 449, Humanoid 69 and Automotive 88 tests: all passed |
| `npm run build` | passed; each simulation's `index.html` loads only from its own route |
| `npm run e2e` (the site's browser tests, desktop and phone) | **66 passed, 0 failed**; 12 skipped by design (server checks run once, on desktop); 16.7 min |
| `npm run e2e:automotive` (the automotive suite at `/automotive`, four screen sizes) | at `cc91d2f`: **67 passed, 0 failed**; 37 skipped by design (tests that run on some screen sizes only); 33.9 min |
| `npm run e2e:humanoid` (the Humanoid suite at `/humanoid`, four screen sizes) | **78 passed, 0 failed**; 54 skipped by design; 22.5 min |
| `npm run package -- --name FAB_ONE_Four_Simulations_Automotive_V2_Netlify` | 323 files, 35.86 MB |
| `npm run verify-package -- release/FAB_ONE_Four_Simulations_Automotive_V2_Netlify.zip` | **564 checks passed, 0 failed** (it unzips into an empty temporary folder, serves it with Netlify's rules and requests every route and every file the pages load) |

**Failed, then fixed.** Each was fixed and then rerun, with the result above.

* **The site's browser tests, first run on the first package (`1a3dc32`).** 65 passed, 12
  skipped, 1 failed.
  * The failure was the new test "a lab computes off the page…".
  * It counted the requests made by the homepage, which its `fresh()` helper visits first.
  * That was a fault in the test, fixed in `3a9c26f`.
* **The automotive suite at the route, first full run at `4432bfe`.** 64 passed, 37 skipped,
  3 failed. This run used two workers on four cores while the card preview was recorded
  alongside.
  * *"Intermediate frames of transitions are drawn…"* timed out at 3 minutes. On a quiet
    machine it takes 1.9 minutes, and it now has 7.
  * *"On the browser's own frames the film keeps one clock…"* (phone) drew 3 frames in 3 s on
    the loaded machine.
    * It now measures for at least 3 s and 8 frames, and checks the film against the wall
      clock it measured.
    * Its pause and play checks count drawn frames, not seconds.
    * A probe confirmed that the film does resume. It moved 1/15 s per frame, at a frame
      every 1–2 s.
  * *"Ten minutes of mixed use…"* found geometries 452 → 459. This was diagnosed with the
    geometry trace in `evidence/perf/endurance-geometries.log`:
    * Nothing accumulates. Over six cycles the GPU holds 453 geometries, all reachable in the
      scene except the composer's own, and nothing is newly uploaded.
    * The test's random film seeks, and a race between a seek and the frames after it, drew
      parts for the first time in later cycles.
    * The film stops are now fixed moments, warmed up first, and each waits for its seek.

  All three changes are to the tests only (`7192b20`, `624bf23`, `cc91d2f`).

**The exact ZIP, unpacked into a new empty folder:**

* The unpacked tree is byte-for-byte identical to `dist/` (`diff -r`). The route suites
  above, which serve `dist/`, therefore ran on the same files.
* **Netlify's own parsers.** `@netlify/redirect-parser`, `@netlify/headers-parser` and
  `netlify-redirector` read the unpacked `_redirects` and `_headers`:
  * 4 redirect rules and 10 header rules, with no parse errors;
  * `/photolithography`, `/rocket`, `/humanoid` and `/automotive`, with and without a
    trailing slash and with each deep link below, match their own forced rule;
  * `/`, each route's `index.html`, missing `assets/*.js` and `.bin` files, and `/nope`
    match none, so a missing file is a 404, never an HTML page.
* **In Chromium**, served by `scripts/serve.mjs` (`evidence/perf/scripts/zipcheck.mjs`, real
  frames, no test clock): **55 of 55 checks passed** (`evidence/zipcheck.json`).

  An earlier run passed 54 of 55. Its narration check had not turned the sound on, so no
  narration could play, and the check was corrected.
  * **Every route, with and without a trailing slash, and after a refresh.** These are `/`,
    `/photolithography`, `/rocket`, `/humanoid` and `/automotive`. Each returns 200, draws
    its canvas, and shows no console error and no failed request.
  * **The homepage:**
    * the four cards in order, numbered 01–04;
    * their launch links;
    * each card's preview loads and plays when scrolled into view.

    The site's own test "the homepage downloads nothing of the simulations…" checks that the
    page loads no simulation.
  * **The deep links**, each in a fresh page:
    * `/automotive?mode=watch&t=120` lands on "Firing order";
    * `/automotive?mode=explore&system=brakes&part=brake-caliper` lands on "Brake calipers";
    * `/automotive?mode=engineer&lab=braking` lands on "Stopping distance". Its worker
      `/automotive/assets/simWorker-6cdnpngM.js` computes the "Baseline (design values)"
      result;
    * `/automotive?mode=simulate&scenario=overheat` and `…&scenario=drive` (the workbench)
      land;
    * `/humanoid?mode=simulate&lab=walk` lands;
    * `/rocket?v=mission&m=leo` lands, continuing to `…&ch=pad`;
    * `/photolithography?step=expose` and `/photolithography?explore=scanner` land.

    From each, "Back to FAB / ONE" reaches the four-card homepage.
  * **Types.** JavaScript is served as `text/javascript` and CSS as `text/css`. The narration
    manifest is `application/json`. The narration audio is `audio/mpeg` with
    `cache-control: public, max-age=3600, stale-while-revalidate=86400`.
  * **Missing files.** A missing `assets/*.js` under every route, a missing `.bin` and `/nope`
    all return 404, never an HTML page with 200.
  * **Narration.** With "Turn sound on" pressed in the film, the narration element loads
    `/automotive/narration/film-3/press.mp3` (206, `audio/mpeg`) and plays it, with no
    errors.
  * **The Photolithography service worker:**
    * it installs at the `/photolithography` scope and controls that route after a reload;
    * with it installed, `/`, `/rocket`, `/humanoid`, `/automotive` and `/automotive/` are not
      controlled by it;
    * a later visit to Photolithography starts cleanly.

## Package

| | |
|---|---|
| file | `FAB_ONE_Four_Simulations_Automotive_V2_Netlify.zip` |
| size | 35,858,693 bytes (34.2 MiB); 41,934,161 bytes unpacked |
| files | 323 |
| SHA-256 | `1a0832be5c73277d7d5a2fc118ee6064d8621954855555425db98bb7d612a9ca` |
| made from | this repository's `claude/automotive-v2` at `fa1b811` with `npm run build`, then `npm run package -- --name FAB_ONE_Four_Simulations_Automotive_V2_Netlify` (a rebuild at `fa1b811` gives the same `dist/`, file for file) |

It replaces an earlier package made during this release (from `1a3dc32`, SHA-256
`a8b8066c…89abe6`), which had the shader stall described below and was never published.

At the top level of the unpacked folder: `index.html`, `404.html`, `_redirects`, `_headers`,
`favicon.svg`, `og.jpg`, `robots.txt`, `sitemap.xml`, `assets/`, `media/`,
`photolithography/`, `rocket/`, `humanoid/` and `automotive/`.

* `automotive/` holds the V2 build: its lab and seek worker (`assets/simWorker-<hash>.js`), the
  body geometry (`.bin`) and the `film-3` narration.
* Development files are left out (tests, the narration pipeline, the automotive narration QA
  file, recordings).
* The only development files in the payload are Photolithography's
  `narration/*/qa.json`, which were already in its earlier packages.

**To publish it:**

1. Unzip it.
2. Upload the unzipped folder, the one with `index.html` at its top, to the existing Netlify
  site's **Deploys** page by dropping it on the upload area.
3. The deploy summary should report 4 redirect rules and 10 header rules.

Making this package is not a deployment. Nothing has been uploaded to Netlify.

## Before and after

The evidence sits beside the package on the release branch
(`release/fab-one-four-simulations-automotive-v2`, folder `evidence/`), outside the deployable
payload.

**How it was made.** Every picture comes from the built sites in Chromium on SwiftShader:

* V1 is `d39e7eb`, served by itself.
* V2 is `1a3dc32`, served at `/automotive` in the site. The shader fix after it changes no
  picture.
* Clips use the frame-stepped clock, so every frame is 1/30 s of simulation time, 960 × 540,
  quality high.

**`before-after-desktop.png`.** V1 on the left and V2 on the right, each pair at the same
address and moment:

* the first screen, where V2's car is larger and silver;
* the engine cutaway;
* the gearbox cutaway during the upshift: V2 colours the gearsets and lists every member's
  speed from the solved geartrain;
* the front suspension over a bump;
* the brakes during an ABS stop.

**`before-after-phone.png`.** Three pairs at 390 × 844:

* the first screen;
* Simulate: V1's scenario list against V2's driving workbench with its pedal and steering
  pads;
* a part in Explore: V2's is in the resizable sheet with its view choices.

**Clips.** Each comes as an MP4 and a contact strip of every 15th frame.

* `clips/v1-interrupt.mp4` and `clips/v2-interrupt.mp4` run the same scripted interruptions:
  * Explore goes from the brakes to the engine;
  * after 300 ms it reverses, and then reverses again;
  * then the differential, then the whole car.
* `clips/v1-pause.mp4` and `clips/v2-pause.mp4` run the same film sequence:
  * pause for 2 s during the gear change;
  * seek back 6 s while paused;
  * resume.

  The picture holds while paused in both: from frame 31 to frame 89, every frame is
  identical in each clip. What V2 changes is beneath the picture. The model, the narration
  and the camera share one pause, and resume from the same state. The browser test "a true
  pause…" checks this.
* `clips/v2-workbench-drive.mp4` is V2 only. It drives the workbench with its own controls:
  start, brake and D, throttle, steer, brake, R, reverse, brake.

**Other pictures.**

* `film/film-sheet-a…d.png`: every beat of V2's film, used to review its pictures and
  captions.
* `card-preview-sheet.png`: frames of the new card preview.
* `workbench-phones.png`: the workbench at 360 and 390 px wide.

**`perf/explore-first-use-stall.md`.** The shader stall found and fixed during this release,
before and after: 3–8 s on the opening frame of an Explore move on SwiftShader, now 15–27 ms of
page work per frame.

**`perf/`.** The measurements below, as JSON, and the scripts that made them (`perf/scripts/`;
their paths point at this machine's checkouts).

## Measured performance

**What these numbers can and cannot say.**

* **Where they come from.** Every number was measured in Chromium 141 (Playwright 1.56) on
  SwiftShader, a software WebGL renderer, in a four-core container with no GPU. V1 and V2 were
  measured in the same session on the same machine.
* **Frame intervals.** A software renderer takes about 0.5 to 5 s to draw a 1280 × 720 frame of
  this scene, so the frame intervals below say nothing about frame rates on a phone or on a
  desktop GPU.
* **What carries over to real devices:**
  * the scene's budgets (draw calls, triangles, shader programs, textures);
  * the page's own main-thread work per frame;
  * long tasks.
* **Main-thread work per frame.** This is the time spent in the page's
  `requestAnimationFrame` callbacks: the model, the scene update and WebGL command encoding.
  The rasterising happens in the GPU process, so this number stays small unless the page
  waits on the driver.
* **Scripts.** The JSON is in the release branch's `evidence/perf/`, and the scripts that
  produced it are described there.

### V1 and V2 on real frames

Measured with `perf2.mjs`:

* V1 is `d39e7eb` served by itself.
* V2 is the unpacked final package at `/automotive`.
* Each case is measured for 15 s after the car is ready and has settled for 8 s.

| case | build | first picture | whole car ready | frames in 15 s | frame interval (median) | page work per frame (median / p95) | longest main-thread task |
|---|---|---|---|---|---|---|---|
| hero 1280×720 high | V1 | 2.5 s | 9.9 s | 4 | 2.7 s | 16 ms / 20 ms | none over 50 ms |
| hero 1280×720 high | V2 | 2.2 s | 25.7 s | 3 | 4.1 s | 17 ms / 19 ms | none over 50 ms |
| hero 1280×720 low | V1 | 2.1 s | 2.9 s | 25 | 0.6 s | 14 ms / 20 ms | none over 50 ms |
| hero 1280×720 low | V2 | 2.1 s | 10.4 s | 13 | 1.0 s | 13 ms / 22 ms | none over 50 ms |
| film cutaway 1280×720 high | V1 | 2.1 s | 6.2 s | 1 | 4.4 s | 8 ms / 8 ms | none over 50 ms |
| film cutaway 1280×720 high | V2 | 2.3 s | 6.9 s | 3 | 4.5 s | 9 ms / 10 ms | none over 50 ms |
| Explore moves 1280×720 medium | V1 | 1.9 s | 6.2 s | 4 | 3.2 s | 17 ms / 7471 ms | 7472 ms |
| Explore moves 1280×720 medium | V2 | 2.2 s | 6.6 s | 3 | 2.9 s | 15 ms / 22 ms | none over 50 ms |
| phone 390×844 @2x medium | V1 | 2.2 s | 8.7 s | 4 | 2.4 s | 14 ms / 16 ms | none over 50 ms |
| phone 390×844 @2x medium | V2 | 2.2 s | 17.0 s | 4 | 4.4 s | 17 ms / 20 ms | none over 50 ms |
| workbench driving 1280×720 medium | V2 | 2.2 s | 9.4 s | 0 | no full interval | 24 ms / 24 ms | none over 50 ms |

* **Frame intervals here are few and slow.** They are what the software rasteriser can do: 0
  to 25 intervals in 15 s.
  * At the same tier, V2's frames take longer to rasterise than V1's: 1.5–1.9× on the first
    screen and the phone, about the same in the film cutaway.
  * V2 draws a little more (637 draw calls against 609 on the first screen) with fuller
    materials.
  * Taking one group of materials away at a time (`raster-by-material.json`) did not single
    out a cause. With six frames per case, the noise between frames was larger than the
    differences.
  * Whether any of this carries over to a GPU is unknown until it is measured on one.
* **Page work per frame** is about the same in V1 and V2: medians of 8–24 ms across every case.
* **Explore moves.** V1 stalled the page once for 7.5 s. V2 has no task over 50 ms. This is
  the shader fix below.
* **The whole car is ready later in V2:** 6.6–25.7 s here, against 2.9–9.9 s for V1. V2 now links
  every program it may need during preparation, at still moments, instead of at the first
  draw in a move. The first picture comes at the same time, about 2.2 s.
  * Moves to parts of the car that are not on screen wait until it is ready.
  * Where the browser links shaders in parallel, this costs nothing.
* **The driving workbench** drew a single frame in 15 s here, with 24 ms of page work for it.
  * Driving moves everything on screen, which is the heaviest picture for a software
    rasteriser.
  * It should be the first thing timed on a real phone.

### Budgets: what each picture draws

V2:

| case (V2) | draw calls | triangles | shader programs | geometries | textures | drawing buffer |
|---|---|---|---|---|---|---|
| hero 1280×720 high | 637 | 2.22 M | 36 | 412 | 37 | 1280 × 720 |
| hero 1280×720 low | 589 | 0.92 M | 26 | 411 | 6 | 1280 × 720 |
| film cutaway 1280×720 high | 221 | 1.40 M | 38 | 244 | 37 | 1280 × 720 |
| Explore moves 1280×720 medium | 643 | 1.72 M | 38 | 412 | 37 | 1280 × 720 |
| phone 390×844 @2x medium | 637 | 2.22 M | 36 | 412 | 37 | 585 × 1266 |
| workbench driving 1280×720 medium | 639 | 2.24 M | 36 | 413 | 37 | 1280 × 720 |

V1, for comparison:

| case (V1) | draw calls | triangles | shader programs | geometries | textures |
|---|---|---|---|---|---|
| hero 1280×720 high | 609 | 2.21 M | 49 | 397 | 37 |
| hero 1280×720 low | 560 | 0.91 M | 22 | 395 | 5 |
| film cutaway 1280×720 high | 221 | 1.41 M | 50 | 231 | 37 |
| Explore moves 1280×720 medium | 960 | 2.09 M | 51 | 397 | 37 |
| phone 390×844 @2x medium | 609 | 2.21 M | 49 | 397 | 37 |

* The low tier keeps the designed body and every mechanism with about 0.9 M triangles and
  6 textures.
* Medium and high draw the detailed body (about 2.2 M triangles) and the studio's 37 textures.

### Labs and long seeks: work on the page's main thread

* **V1** computed every lab chart and every film seek synchronously on the page's main
  thread. Timed in Node on V1's own code (`v1-lab-and-seek-main-thread.txt`):
  * the eight labs took 32–661 ms each (electrical 661 ms, gearing 370 ms);
  * film seeks took up to 655 ms (to 331.2 s);
  * the page could not draw or respond while each one ran.
* **V2** computes them in its worker. Measured in the browser on the unpacked final package
  (`v2-labs-and-seeks-main-thread.json`), at 640 × 360, quality low:
  * each of the eight labs' baseline results was on the page at the first look, 1.5 s after
    switching to it;
  * no main-thread task over 50 ms while any lab computed, or while seeking the film to
    331.2 s, 60 s and 250 s;
  * none during 5 s of the idle lab page either.

### The shader stall found and fixed during this release

* **Found** while measuring the first package (`1a3dc32`). The opening frame of an Explore move
  blocked the page for 3–8 s on this renderer.
  * Its programs had been compiled ahead of time but were first used, and so linked, at their
    first draw.
  * Instanced meshes had been prepared without instancing.
* **Fixed** in `4432bfe`: every Explore move now runs at 14–27 ms of page work per frame, with
  no program compiled or first used during a move.
* **Tested** in the browser at medium quality across every system, view and three deep parts.
  The test fails on `1a3dc32` and passes on `4432bfe`.
* The before-and-after traces and readiness timings are in `explore-first-use-stall.md`.

## Known limitations

* **No real device has run V2 yet.** Every measurement and test here is on Chromium with
  SwiftShader, a software renderer, in a four-core container with no GPU.
  * Not yet run: Safari, iOS, Firefox, a phone or a GPU.
  * The 60 FPS desktop and 30 FPS phone targets are therefore unverified.
  * Touch was tested with Playwright's emulated touch, not a touchscreen.
* **V2's frames take longer to rasterise in software than V1's:** 1.5–1.9× at the same tier.
  See "Measured performance". How much of this carries over to a GPU is not known until it is
  measured on one.
* **The driving workbench is the heaviest picture.** On this renderer it drew one frame in
  15 s, with 24 ms of page work for that frame. It should be the first thing timed on a real
  phone.
* **The whole car takes longer to be ready where shaders do not link in parallel.** Such a
  browser does not offer `KHR_parallel_shader_compile`. That includes this software renderer
  and Firefox; Safari has offered it since 14.1
  ([caniuse](https://caniuse.com/wf-khr-parallel-shader-compile)).
  * V2 links every program it may need during preparation, at still moments, so that no move
    stalls.
  * On this renderer that takes 10–26 s, during which moves into the car wait.
  * Where the browser links in parallel, the wait should be negligible. That was not
    measured here.
* **The S-1 is an original, simplified teaching car.** It is not a real manufacturer's vehicle
  or a validated full-fidelity digital twin. Its model is an educational simplification,
  checked against the independent hand calculations in the automotive repository's
  `docs/ENGINEERING.md`.
* **Suspension and steering.** The suspension's wheel centres move straight up and down in the
  model. The drawn linkage keeps every rigid link at its length, but a small difference
  remains:
  * about 1 cm at full lock with the wheel in bump, taken up along the tie rod inside the
    rack's boot;
  * about 3 mm at the rear joints at full travel.
* **Illustrative only:**
  * the climate system's refrigerant and cabin-air flows, which are labelled so;
  * the CAN message pulses;
  * the explode distances.
* **Camera.** The camera's way to the differential passes close to the driveshaft.
* **Narration.** Sound is off until the visitor turns it on (the speaker button), which also
  satisfies browsers that block sound until a gesture.
* **Photolithography's two `narration/*/qa.json` files** (about 200 KB together) are in the
  payload, as in its earlier packages. They are measurement files that the app does not
  load.
* **The rocket card** reads "Rocket Flight & Mission Simulation". This comes from the
  completed `claude/fab-one-rocket-integration` work ported here.
* **Not deployed.** The package has not been uploaded anywhere.
