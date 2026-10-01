# humanoid: card preview

Recorded by `node scripts/capture-preview.mjs humanoid` on 2026-09-30 20:41 UTC, from the built site (`dist/`, served by scripts/serve.mjs), from the shot list in [preview.json](preview.json).

- **Simulation source**: https://github.com/BKimble1/humanoid-simulation, branch `claude/humanoid-v2`, commit `f861fffb4ee6aad407422cd78db620a41b28c2c0` (2026-09-30T20:39:51+00:00), imported into simulations/humanoid/ on 2026-09-30
- **Renderer**: Chromium (Playwright) with WebGL on ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver) (SwiftShader, a software renderer: no GPU)
- **Clock**: frame-stepped (`window.__fabAdvance(1)` before each frame): every frame is exactly 1/30 s of simulation time, whatever the render time
- **Picture**: 1280 x 720 at 30 fps, 9.80 s, 4 segments joined with 0.40 s cross-fades, the end fading into the beginning over 0.50 s (a seamless loop; the clip starts 0.50 s into the first segment), no sound
- **Files**: preview.mp4 (H.264 High 4.0) 1295 KB, preview.webm (VP9) 1263 KB, poster.webp (the first frame) 38 KB

| segment | address | ready, then setup | frames |
|---|---|---|---|
| intro | `/humanoid?virt=1&capture=1&quality=high` | `{"eval":"window.__fabAdvance(60, false)"}` | 60 (2.00 s) |
| actuator | `/humanoid?mode=explore&system=actuators&virt=1&capture=1&quality=high` | `{"eval":"window.__fabAdvance(110, false)"}`, `{"eval":"window.__fabStores.useApp.getState().go({ exploded: true })"}`, `{"eval":"window.__fabAdvance(4, false)"}` | 120 (4.00 s) |
| walk | `/humanoid?mode=simulate&lab=walk&virt=1&capture=1&quality=high` | `{"eval":"window.__fabAdvance(60, false)"}`, `{"eval":"window.__fabStores.useLab.getState().set({ walking: true, gait: 'normal' })"}`, `{"eval":"window.__fabAdvance(150, false)"}` | 90 (3.00 s) |
| push | `/humanoid?mode=simulate&lab=balance&virt=1&capture=1&quality=high` | `{"eval":"window.__fabAdvance(90, false)"}`, `{"eval":"window.__fabStores.useLab.getState().set({ pushForce: 300, pushDir: 'front' }); window.__fab.balance.queuePush(300, 'front')"}`, `{"eval":"window.__fabAdvance(2, false)"}` | 75 (2.50 s) |

Ready: `"!!window.__fabAdvance && !!window.__fab && window.__fabStores.useApp.getState().ready"`

**Later import.** `simulations/humanoid/` is now `400ddb7` (see its SOURCE.json). Its code is
`2ab9418`, one commit after `f861fff`, which moves the first framing of the page's layout to
before the page is seen; `400ddb7` adds documents only. Each segment above runs 60 or more
frames of setup before its first recorded frame, so none of the clip's frames change; it was
not recorded again.
