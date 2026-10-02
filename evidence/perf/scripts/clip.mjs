// A scripted clip on the frame-stepped clock: every frame rendered and saved, actions at frames.
//   BASE=... node clip.mjs <name> <outdir>
// Writes <outdir>/<name>.mp4 (30 fps) and a contact strip of every 15th frame.
import { chromium } from '/home/user/automotive-simulation/node_modules/@playwright/test/index.mjs';
import { mkdirSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
const [name, outdir] = process.argv.slice(2);
const BASE = process.env.BASE ?? 'http://127.0.0.1:4178/';
const go = (o) => `window.__fabStores.useApp.getState().go(${JSON.stringify(o)})`;
// V2 owns the pause in the world and seeks through it; V1 had pause() and the player's seek
const P = (on) => `(window.__fab.setPaused ? window.__fab.setPaused(${on}) : window.__fab.pause(${on}))`;
const SEEK = `(window.__fab.seekPending !== undefined ? window.__fab.seek(window.__fab.player.t - 6) : window.__fab.player.seek(window.__fab.player.t - 6))`;
const CLIPS = {
  // Explore: brakes → engine, reversed 300 ms later, then on to the differential, then whole car
  interrupt: { q: 'mode=explore&system=brakes&quality=high', w: 960, h: 540, frames: 210, actions: { 10: go({ system: 'power', part: null }), 19: go({ system: 'brakes', part: null }), 28: go({ system: 'power', part: null }), 80: go({ system: 'driveline', part: 'differential' }), 140: go({ system: null, part: null }) } },
  // Film: play, pause 2 s during the gear change, seek back, play
  pause: { q: 'mode=watch&t=95&quality=high', w: 960, h: 540, frames: 180, actions: { 30: P(true), 90: SEEK, 120: P(false) } },
  // Simulate: the V2 workbench, driven with its own controls (start, brake + D, throttle, steer, brake, R, reverse)
  drive: { q: 'mode=simulate&scenario=drive&quality=high', w: 960, h: 540, frames: 420, actions: {
    5: "document.querySelector('.wb-start').click()",
    75: 'window.__fab.driver.pads.brake = 1',
    82: "(() => { const d = window.__fab.driver; d.select('D'); d.pads.brake = null; })()",
    100: 'window.__fab.driver.pads.throttle = 0.7',
    190: 'window.__fab.driver.pads.steer = 0.5',
    230: 'window.__fab.driver.pads.steer = null',
    250: "(() => { const d = window.__fab.driver; d.pads.throttle = null; d.pads.brake = 0.9; })()",
    330: "(() => { const d = window.__fab.driver; d.select('R'); })()",
    336: "(() => { const d = window.__fab.driver; d.pads.brake = null; d.pads.throttle = 0.4; })()",
    390: "(() => { const d = window.__fab.driver; d.pads.throttle = null; d.pads.brake = 1; })()",
  } },
};
const c = CLIPS[name];
const dir = `${outdir}/${name}-frames`;
rmSync(dir, { recursive: true, force: true });
mkdirSync(dir, { recursive: true });
const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'] });
const p = await b.newPage({ viewport: { width: c.w, height: c.h } });
const errs = [];
p.on('pageerror', (e) => errs.push(String(e).slice(0, 200)));
await p.goto(`${BASE}?virt=1&capture=1&${c.q}`);
await p.waitForFunction(() => window.__fabStores?.useApp?.getState().ready, null, { timeout: 180000 });
for (let i = 0; i < 80; i++) { await p.evaluate(() => window.__fabAdvance(1, false)); if (await p.evaluate(() => window.__fabStores.useApp.getState().carReady)) break; await p.waitForTimeout(200); }
await p.evaluate(() => window.__fabAdvance(45, false));
for (let f = 0; f < c.frames; f++) {
  if (c.actions[f]) await p.evaluate(c.actions[f]);
  await p.evaluate(() => window.__fabAdvance(1, true));
  // an off-page seek lands within a few frames; frames keep going meanwhile (the step holds)
  await p.screenshot({ path: `${dir}/f${String(f).padStart(4, '0')}.png`, timeout: 300000 });
}
await b.close();
execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-framerate', '30', '-i', `${dir}/f%04d.png`, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '26', '-movflags', '+faststart', `${outdir}/${name}.mp4`]);
console.log(name, 'frames', c.frames, 'errors', errs.slice(0, 4));
