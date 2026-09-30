# rocket: card preview

Recorded by `node scripts/capture-preview.mjs rocket` on 2026-09-30 06:26 UTC, from the built site (`dist/`, served by scripts/serve.mjs), from the shot list in [preview.json](preview.json).

- **Simulation source**: https://github.com/BKimble1/rocket-simulation, branch `claude/kimble-rocket-engineering`, commit `ec43e1f295e984e541b8eeaf46f3b3b9decfd258` (2026-09-30T04:51:05+00:00), imported into simulations/rocket/ on 2026-09-30
- **Renderer**: Chromium (Playwright) with WebGL on ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver) (SwiftShader, a software renderer: no GPU)
- **Clock**: frame-stepped (`window.__rocketAdvance(1)` before each frame): every frame is exactly 1/30 s of simulation time, whatever the render time
- **Picture**: 1280 x 720 at 30 fps, 9.60 s, 2 segments joined with 0.40 s cross-fades, no sound
- **Files**: preview.mp4 (H.264 High 4.0) 908 KB, preview.webm (VP9) 942 KB, poster.webp (the first frame) 81 KB

| segment | address | ready, then setup | frames |
|---|---|---|---|
| launch | `/rocket?v=mission&m=leo&virt=1&capture=1&ui=0&quality=high` | `{"eval":"window.__rocketSeekMission(-4)"}`, `{"advance":20}`, `{"eval":"window.__rocketSeekMission(-4); window.__rocketPlayback.player.setRate?.(1); window.__rocketPlayback.player.play()"}` | 180 (6.00 s) |
| staging | `/rocket?v=mission&m=leo&virt=1&capture=1&ui=0&quality=high` | `{"eval":"window.__rocketSeekMission(148.8)"}`, `{"advance":20}`, `{"eval":"window.__rocketSeekMission(148.8); window.__rocketPlayback.player.setRate?.(1); window.__rocketPlayback.player.play()"}` | 120 (4.00 s) |

Ready: `{"hooks":"typeof window.__rocketAdvance === 'function' && typeof window.__rocketSeekMission === 'function' && !!window.__rocketPlayback?.player","until":"window.__rocketFrame?.location === 'flight' && window.__rocketDirector.ready.flight && !window.__rocketDirector.waiting && !window.__rocketDirector.dissolve","advancing":true,"interval":250,"timeout":600000}`
