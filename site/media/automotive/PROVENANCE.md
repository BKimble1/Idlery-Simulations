# automotive: card preview

Recorded by `node scripts/capture-preview.mjs automotive --keep --only=drive,cutaway,torque,exploded` on 2026-10-01 23:47 UTC, from the built site (`dist/`, served by scripts/serve.mjs), from the shot list in [preview.json](preview.json).

- **Simulation source**: https://github.com/BKimble1/automotive-simulation, branch `claude/automotive-v2`, commit `4432bfed8f1ecf7934005f7a1a2f24d835ec2fc6` (2026-10-01T23:06:01+00:00), imported into simulations/automotive/ on 2026-10-01
- **Renderer**: Chromium (Playwright) with WebGL on ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver) (SwiftShader, a software renderer: no GPU)
- **Clock**: frame-stepped (`window.__fabAdvance(1)` before each frame): every frame is exactly 1/30 s of simulation time, whatever the render time
- **Picture**: 1280 x 720 at 30 fps, 11.50 s, 5 segments joined with 0.40 s cross-fades, the end fading into the beginning over 0.50 s (a seamless loop; the clip starts 0.50 s into the first segment), no sound
- **Files**: preview.mp4 (H.264 High 4.0) 875 KB, preview.webm (VP9) 846 KB, poster.webp (the first frame) 45 KB

| segment | address | ready, then setup | frames |
|---|---|---|---|
| intro | `/automotive?virt=1&capture=1&quality=high` | `{"eval":"window.__fabAdvance(60, false)"}` | 66 (2.20 s) |
| drive | `/automotive?mode=simulate&scenario=drive&virt=1&capture=1&quality=high` | `{"eval":"window.__fabAdvance(30, false)"}`, `{"click":".wb-start"}`, `{"eval":"window.__fabAdvance(75, false)"}`, `{"eval":"(() => { window.__fab.driver.pads.brake = 1; })()"}`, `{"eval":"window.__fabAdvance(6, false)"}`, `{"eval":"(() => { const d = window.__fab.driver; d.select('D'); d.pads.brake = null; d.pads.throttle = 0.6; })()"}`, `{"eval":"window.__fabAdvance(40, false)"}` | 90 (3.00 s) |
| cutaway | `/automotive?mode=explore&lesson=four-stroke&virt=1&capture=1&quality=high` | `{"eval":"window.__fabAdvance(20, false)"}`, `{"eval":"(() => { const p = window.__fab.player; const b = p.beats.find((x) => x.beat.id === 'compression'); window.__fab.seek(b.start + 3.2); })()"}`, `{"until":"!window.__fab.seekPending","advancing":true}`, `{"eval":"window.__fabAdvance(100, false)"}` | 78 (2.60 s) |
| torque | `/automotive?mode=explore&lesson=torque-path&virt=1&capture=1&quality=high` | `{"eval":"window.__fabAdvance(20, false)"}`, `{"eval":"window.__fab.seek(1.0)"}`, `{"until":"!window.__fab.seekPending","advancing":true}`, `{"eval":"window.__fabAdvance(110, false)"}` | 78 (2.60 s) |
| exploded | `/automotive?mode=explore&lesson=exploded&virt=1&capture=1&quality=high` | `{"eval":"window.__fabAdvance(20, false)"}`, `{"eval":"(() => { const p = window.__fab.player; const b = p.beats.find((x) => x.beat.id === 'explode'); window.__fab.seek(b.start + 0.05); })()"}`, `{"until":"!window.__fab.seekPending","advancing":true}`, `{"eval":"window.__fabAdvance(15, false)"}` | 96 (3.20 s) |

Ready: `{"hooks":"!!window.__fabAdvance && !!window.__fab && window.__fabStores.useApp.getState().ready","until":"window.__fabStores.useApp.getState().carReady","advancing":true,"interval":250,"timeout":180000}`
