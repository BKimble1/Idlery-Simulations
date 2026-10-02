# Explore moves: the first-use stall, before and after

Measured with `scripts/stall.mjs`:

* Chromium 141 on SwiftShader, 1280 × 720, quality medium, real frames (no virtual clock).
* It wraps the WebGL calls that wait for the GPU process and times every
  `requestAnimationFrame` callback.
* Each step is `useApp.go(...)`, followed by 8–12 s of frames.

## Before: `1a3dc32` (the first V2 package)

| move | slowest frame's page work | waiting in | programs |
|---|---|---|---|
| system power | 7,785 ms | `getProgramInfoLog` 5,744 ms, `getShaderInfoLog` 2,020 ms | 37 → 37 |
| system brakes | 8,324 ms | `getProgramInfoLog` 6,903 ms, `getShaderInfoLog` 1,391 ms | 37 → 37 |
| driveline, part differential | 3,238 ms | `getProgramInfoLog` 3,186 ms | 37 → **38** |
| whole car | 17 ms | none | 38 → 38 |

The other frames of each move took 0–20 ms.

**Why.** The stalls are three.js's first use of programs compiled earlier, which reads the
link result while the link is still unresolved. This renderer has no
`KHR_parallel_shader_compile`, so `compileAsync` had returned at once.

**The 38th program** differs from an existing one only in three.js's `instancing` bit: the
prewarm had compiled an instanced mesh's material on a plain stand-in.

## After: `4432bfe` (the app in the final package `cc91d2f` is the same build)

| move | page work per frame | waiting in | programs |
|---|---|---|---|
| system power | 15–16 ms | none | 38 → 38 |
| system brakes | 19–22 ms | none | 38 → 38 |
| driveline, part differential | 18–27 ms | none | 38 → 38 |
| whole car | 17–19 ms | none | 38 → 38 |

**Where the cost went.** The links are now waited for during preparation, at still moments.
The time until the whole car is ready (`carReady`) was measured with `scripts/ready.mjs`:

* on the unpacked packages served by `scripts/serve.mjs`;
* at 1280 × 720 on this software renderer;
* in the same session.

| quality | first package (`1a3dc32`) | final package (`cc91d2f`) |
|---|---|---|
| low | 2.9 s | 11.0 s |
| medium | 2.5 s | 22.2 s |
| high | 2.5 s | 24.4 s |

The first picture comes at the same time in both (2.0–2.6 s).

**No overlap with motion.** `scripts/when.mjs` records when each long task starts and whether
anything authored is moving at the time. None of the long tasks overlapped authored motion:

* on the first screen;
* on a deep link to `?mode=explore&system=brakes&part=brake-caliper`;
* on a deep link to `?mode=watch&t=120`.

Moves that need the whole car wait for it.

**The browser test** "no program is compiled or first used during a move, on any view or part"
counts programs and first uses (reads of `ACTIVE_UNIFORMS`). It runs at medium quality across
every system, view and three deep parts. It fails on `1a3dc32` (37 → 38 programs) and passes
on `4432bfe`.
