# automotive: card preview

Recorded by `node scripts/capture-preview.mjs automotive --keep` on 2026-10-01 07:44 UTC, from the built site (`dist/`, served by scripts/serve.mjs), from the shot list in [preview.json](preview.json).

- **Simulation source**: https://github.com/BKimble1/automotive-simulation, branch `claude/automotive-one`, commit `f0adcac870949cb401611e222f884b23ca6e6bd3` (2026-10-01T07:42:00+00:00), imported into simulations/automotive/ on 2026-10-01
- **Renderer**: Chromium (Playwright) with WebGL on ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver) (SwiftShader, a software renderer: no GPU)
- **Clock**: frame-stepped (`window.__fabAdvance(1)` before each frame): every frame is exactly 1/30 s of simulation time, whatever the render time
- **Picture**: 1280 x 720 at 30 fps, 10.30 s, 4 segments joined with 0.40 s cross-fades, the end fading into the beginning over 0.50 s (a seamless loop; the clip starts 0.50 s into the first segment), no sound
- **Files**: preview.mp4 (H.264 High 4.0) 903 KB, preview.webm (VP9) 836 KB, poster.webp (the first frame) 38 KB

| segment | address | ready, then setup | frames |
|---|---|---|---|
| intro | `/automotive?virt=1&capture=1&quality=high` | `{"eval":"window.__fabAdvance(60, false)"}` | 75 (2.50 s) |
| cutaway | `/automotive?mode=explore&lesson=four-stroke&virt=1&capture=1&quality=high` | `{"eval":"window.__fabAdvance(20, false)"}`, `{"eval":"(() => { const p = window.__fab.player; const b = p.beats.find((x) => x.beat.id === 'compression'); p.seek(b.start + 3.2); })()"}`, `{"eval":"window.__fabAdvance(100, false)"}` | 90 (3.00 s) |
| torque | `/automotive?mode=explore&lesson=torque-path&virt=1&capture=1&quality=high` | `{"eval":"window.__fabAdvance(20, false)"}`, `{"eval":"(() => { const p = window.__fab.player; p.seek(1.0); })()"}`, `{"eval":"window.__fabAdvance(110, false)"}` | 90 (3.00 s) |
| exploded | `/automotive?mode=explore&lesson=exploded&virt=1&capture=1&quality=high` | `{"eval":"window.__fabAdvance(20, false)"}`, `{"eval":"(() => { const p = window.__fab.player; const b = p.beats.find((x) => x.beat.id === 'explode'); p.seek(b.start + 0.05); })()"}`, `{"eval":"window.__fabAdvance(15, false)"}` | 105 (3.50 s) |

Ready: `{"hooks":"!!window.__fabAdvance && !!window.__fab && window.__fabStores.useApp.getState().ready","until":"window.__fabStores.useApp.getState().carReady","advancing":true,"interval":250,"timeout":180000}`
