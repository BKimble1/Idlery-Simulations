# rocket: card preview

Recorded by `node scripts/capture-preview.mjs rocket --keep` on 2026-09-30 10:22 UTC, from the built site (`dist/`, served by scripts/serve.mjs), from the shot list in [preview.json](preview.json).

- **Simulation source**: https://github.com/BKimble1/rocket-simulation, branch `claude/clever-pascal-y4v4d8`, commit `93d1f89e454e4e2dd8fd25b04d98f3fe8dfb7c7b` (2026-09-30T09:26:04+00:00), imported into simulations/rocket/ on 2026-09-30
- **Renderer**: Chromium (Playwright) with WebGL on ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver) (SwiftShader, a software renderer: no GPU)
- **Clock**: frame-stepped (`window.__rocketAdvance(1)` before each frame): every frame is exactly 1/30 s of simulation time, whatever the render time
- **Picture**: 1280 x 720 at 30 fps, 10.10 s, 2 segments joined with 0.40 s cross-fades, no sound
- **Files**: preview.mp4 (H.264 High 4.0) 725 KB, preview.webm (VP9) 781 KB, poster.webp (the first frame) 62 KB

| segment | address | ready, then setup | frames |
|---|---|---|---|
| launch | `/rocket?v=mission&m=leo&virt=1&capture=1&ui=0&quality=high` | `{"eval":"window.__rocketSeekMission(-4)"}`, `{"advance":20}`, `{"eval":"window.__rocketSeekMission(-4); window.__rocketPlayback.player.setRate?.(1); window.__rocketPlayback.player.play()"}` | 180 (6.00 s) |
| staging | `/rocket?v=mission&m=leo&virt=1&capture=1&ui=0&quality=high` | `{"eval":"window.__rocketSeekMission(155.0)"}`, `{"advance":20}`, `{"eval":"window.__rocketSeekMission(155.0); window.__rocketPlayback.player.setRate?.(1); window.__rocketPlayback.player.play()"}` | 135 (4.50 s) |

Ready: `{"hooks":"typeof window.__rocketAdvance === 'function' && typeof window.__rocketSeekMission === 'function' && !!window.__rocketPlayback?.player","until":"window.__rocketFrame?.location === 'flight' && window.__rocketDirector.ready.flight && !window.__rocketDirector.waiting && !window.__rocketDirector.dissolve","advancing":true,"interval":250,"timeout":600000}`

Note: the clip was recorded from the import of `93d1f89`; the current import, `fc1d942` (see
[SOURCE.json](../../../simulations/rocket/SOURCE.json)), differs from it only in the LEO
mission's playback rate after T+477 s, one desktop layout rule of the "Mission paused" chip, a test and
documents, none of which appear in the two recorded moments (T-4 s to T+2 s, T+155 s to
T+159.5 s).
