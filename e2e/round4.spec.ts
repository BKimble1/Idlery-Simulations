import { expect, test, type Page } from '@playwright/test';
import { advance, freshStart, sampleFrame, settle, stageInfo, waitForStage, watchErrors, worstJump, type FrameSample } from './helpers';

/**
 * Round four: machines are seen closed first and opened deliberately (the housing as the camera
 * moves in, a vacuum chamber after it); the camera travels through free space; the scanner's
 * immersion film is shown in a magnified inset; the film's narration waits for a machine that
 * is still loading. All on the harness clock (?virt=1), frame by frame.
 */

type W = {
  __fabStores: {
    useApp: { getState: () => { next: () => void; toggle: (k: string) => void; setScaleOverride: (v: string | null) => void; step: number }; setState: (s: object) => void };
    useClock: { getState: () => { set: (p: number) => void; play: () => void; pause: () => void } };
  };
  __fab: {
    cutAmount: (id: string) => number;
    useStageInfo: { getState: () => { flying: boolean; loading: string | null; cutaway: boolean; space: string } };
  };
};

const onlyDesktop = (name: string) => test.skip(name !== 'desktop', 'frame-by-frame checks run once, at desktop size');

/** Render one frame and read the housing's opening, the camera and the stage's state. */
const opening = (page: Page, id: string) =>
  page.evaluate((id) => {
    const w = window as unknown as W & { __fabAdvance: (n: number) => void; __fab: { camera: { position: { x: number; y: number; z: number } } } };
    w.__fabAdvance(1);
    const p = w.__fab.camera.position;
    const s = w.__fab.useStageInfo.getState();
    return { cut: w.__fab.cutAmount(id), cam: [p.x, p.y, p.z] as [number, number, number], flying: s.flying, cutaway: s.cutaway };
  }, id);

test('a machine is shown closed from outside, opens as the camera moves in, and its chamber opens after it', async ({ page }, info) => {
  onlyDesktop(info.project.name);
  test.setTimeout(900_000);
  const errors = watchErrors(page);
  await freshStart(page, '/?step=adi&virt=1');
  await settle(page);
  await page.evaluate(() => (window as unknown as W).__fabStores.useApp.getState().next());
  const frames: Awaited<ReturnType<typeof opening>>[] = [];
  for (let i = 0; i < 360; i++) {
    const f = await opening(page, 'etch');
    frames.push(f);
    if (!f.flying && f.cut >= 1 && i > 20) break;
  }
  const first = frames.findIndex((f) => f.cut > 0);
  expect(first, 'the housing opens during the approach').toBeGreaterThan(0);
  // the establishing beat: the camera held still, looking at the closed machine, before it opened
  const still = frames.slice(0, first).filter((f, i, a) => i > 0 && Math.hypot(f.cam[0] - a[i - 1].cam[0], f.cam[1] - a[i - 1].cam[1], f.cam[2] - a[i - 1].cam[2]) < 1e-4);
  expect(still.length, 'held on the closed machine for the establishing beat').toBeGreaterThanOrEqual(8);
  // it never closes again around the camera on the way in, and ends fully open
  for (let i = first + 1; i < frames.length; i++) expect(frames[i].cut, `frame ${i}`).toBeGreaterThanOrEqual(frames[i - 1].cut);
  expect(frames.at(-1)!.cut).toBe(1);
  expect(frames.at(-1)!.cutaway, 'the scale label says it is a cutaway').toBe(true);
  // the chamber's wedge (innerCut) follows the housing: none of it before the housing is open
  const inner = (t: number) => Math.max(0, Math.min(1, (t - 0.62) / 0.38));
  const housingOpenAt = frames.findIndex((f) => f.cut >= 0.62);
  expect(housingOpenAt).toBeGreaterThan(first);
  for (const f of frames.slice(0, housingOpenAt)) expect(inner(f.cut)).toBe(0);
  expect(errors).toEqual([]);
});

/**
 * Whether the camera's path between two frames passes through anything drawn in the world
 * (clipped-away parts of an opened machine excepted): the segment is ray-cast against the scene.
 */
async function pathBlocked(page: Page, a: [number, number, number], b: [number, number, number]): Promise<string | null> {
  return page.evaluate(
    ({ a, b }) => {
      type Mat = { visible: boolean; clippingPlanes: { distanceToPoint(p: unknown): number }[] | null; clipIntersection: boolean; blending: number; isShaderMaterial?: boolean };
      type Obj = { visible: boolean; parent: Obj | null; name: string; material?: Mat | Mat[]; type: string };
      const w = window as unknown as {
        __fab: {
          scene: Obj;
          THREE: {
            Vector3: new (x?: number, y?: number, z?: number) => { sub(v: unknown): { length(): number; normalize(): unknown }; clone(): { sub(v: unknown): { length(): number; normalize(): unknown } } };
            Raycaster: new () => { set(o: unknown, d: unknown): void; near: number; far: number; intersectObject(o: unknown, r: boolean): { object: Obj; point: unknown; face?: { materialIndex: number } | null; distance: number }[] };
            AdditiveBlending: number;
          };
        };
      };
      const T = w.__fab.THREE;
      const from = new T.Vector3(...a);
      const to = new T.Vector3(...b);
      const d = to.clone().sub(from) as unknown as { length(): number; normalize(): unknown };
      const len = d.length();
      if (len < 1e-6) return null;
      d.normalize();
      const rc = new T.Raycaster();
      rc.set(from, d);
      rc.near = 0;
      rc.far = len;
      for (const h of rc.intersectObject(w.__fab.scene, true)) {
        let shown = true;
        for (let o: Obj | null = h.object; o; o = o.parent) if (!o.visible) shown = false;
        if (!shown || h.object.type === 'Sprite' || h.object.type === 'Line' || h.object.type === 'Points') continue;
        const mats = h.object.material;
        const m = Array.isArray(mats) ? mats[h.face?.materialIndex ?? 0] : mats;
        if (!m || !m.visible) continue;
        // light drawn as a glow (a plasma, a beam overlay) is not a surface
        if (m.blending === T.AdditiveBlending) continue;
        const planes = m.clippingPlanes;
        if (planes && planes.length) {
          const neg = planes.map((p) => p.distanceToPoint(h.point) < 0);
          if (m.clipIntersection ? neg.every(Boolean) : neg.some(Boolean)) continue;
        }
        // name the part: its chain of named ancestors, its material and where it was hit
        const names: string[] = [];
        for (let o: Obj | null = h.object; o && names.length < 4; o = o.parent) if (o.name) names.push(o.name);
        const mm = m as unknown as { type: string; color?: { getHexString(): string } };
        const pt = h.point as unknown as { x: number; y: number; z: number };
        return `${names.join(' < ') || h.object.type} (${mm.type} #${mm.color?.getHexString() ?? '?'}) ${h.distance.toFixed(2)} m along, at (${pt.x.toFixed(2)}, ${pt.y.toFixed(2)}, ${pt.z.toFixed(2)})`;
      }
      return null;
    },
    { a, b },
  );
}

/** Luminance spread over the picture's 16 × 16 grid: a blank frame (a wall filling the view) has almost none. */
const spread = (f: FrameSample) => {
  const m = f.grid.reduce((s, v) => s + v, 0) / f.grid.length;
  return Math.sqrt(f.grid.reduce((s, v) => s + (v - m) * (v - m), 0) / f.grid.length);
};

async function followMove(page: Page, frames = 150) {
  const out: FrameSample[] = [];
  for (let i = 0; i < frames; i++) {
    const f = await sampleFrame(page);
    out.push(f);
    if (i > 30 && !f.flying) break;
  }
  return out;
}

for (const [label, step, p] of [
  ['out of the etch cluster from a wafer in its load lock, to the polisher (STI etch → STI fill)', 'sti-etch', 0.97],
  ['from the dicing saw to the die bonder (dice → attach)', 'dice', 0.97],
] as const) {
  test(`the camera travels through free space and never shows a blank frame: ${label}`, async ({ page }, info) => {
    onlyDesktop(info.project.name);
    test.setTimeout(900_000);
    const errors = watchErrors(page);
    await freshStart(page, `/?step=${step}&virt=1`);
    await settle(page);
    await page.evaluate((p) => {
      const c = (window as unknown as W).__fabStores.useClock.getState();
      c.set(p);
      c.pause();
    }, p);
    await advance(page, 3);
    await page.evaluate(() => (window as unknown as W).__fabStores.useApp.getState().next());
    const frames = await followMove(page);
    const world = frames.filter((f) => f.space === 'world');
    expect(world.length).toBeGreaterThan(20);
    for (let i = 1; i < frames.length; i++) {
      if (frames[i].space !== 'world' || frames[i - 1].space !== 'world') continue;
      const hit = await pathBlocked(page, frames[i - 1].cam, frames[i].cam);
      expect(hit, `frame ${i} (from ${frames[i - 1].cam.map((v) => v.toFixed(2))} to ${frames[i].cam.map((v) => v.toFixed(2))}): the camera's path crosses ${hit}`).toBeNull();
    }
    for (const [i, f] of world.entries()) expect(spread(f), `frame ${i} is not blank`).toBeGreaterThan(6);
    expect(worstJump(frames, 1).ratio, 'no one-frame jump').toBeLessThan(4);
    expect(errors).toEqual([]);
  });
}

test('the magnified inset shows the immersion film while the scanner exposes, moving with the stage', async ({ page, isMobile }, info) => {
  test.skip(info.project.name === 'tablet', 'desktop and phone');
  test.setTimeout(600_000);
  const errors = watchErrors(page);
  await freshStart(page, '/?step=expose&virt=1');
  await settle(page);
  // (the housing finishes opening)
  await advance(page, 45);
  const inset = page.locator('.mag');
  await expect(inset).toBeVisible();
  await expect(inset).toContainText('Magnified');
  await expect(inset).toContainText('water');
  const marks = inset.locator('svg g[clip-path] > g');
  const at = async (p: number) => {
    await page.evaluate((p) => {
      const c = (window as unknown as W).__fabStores.useClock.getState();
      c.set(p);
      c.pause();
    }, p);
    await advance(page, 2);
    return marks.getAttribute('transform');
  };
  // the wafer's surface moves with the stage as it scans (the same progress, the same inset)
  const a = await at(0.3);
  const b = await at(0.32);
  expect(a).not.toBe(b);
  expect(await at(0.3)).toBe(a);
  // 193 nm light is drawn only with the light-path overlay
  const light = inset.locator('text', { hasText: '193 nm' });
  await expect(light).toHaveCount(0);
  await page.evaluate(() => (window as unknown as W).__fabStores.useApp.getState().toggle('lightPath'));
  await advance(page, 3);
  await expect(light).toHaveCount(1);
  // the inset stays clear of the page's other controls
  const box = (await inset.boundingBox())!;
  const vp = page.viewportSize()!;
  expect(box.x + box.width).toBeLessThanOrEqual(vp.width);
  if (isMobile) expect(box.width).toBeLessThan(200);
  // gone once the lesson moves on from the scanner (it holds its last frame: not exposing)
  await page.evaluate(() => (window as unknown as W).__fabStores.useApp.getState().next());
  await advance(page, 3);
  await expect(inset).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('the magnified inset is not drawn over the layers', async ({ page }, info) => {
  onlyDesktop(info.project.name);
  test.setTimeout(600_000);
  const errors = watchErrors(page);
  await freshStart(page, '/?step=expose&virt=1');
  await settle(page);
  await advance(page, 45);
  const inset = page.locator('.mag');
  await expect(inset).toBeVisible();
  await page.evaluate(() => (window as unknown as W).__fabStores.useApp.getState().setScaleOverride('device'));
  // into the cross-section: the inset goes as soon as the picture is the layers'
  for (let i = 0; i < 150; i++) {
    await advance(page, 2);
    if ((await stageInfo(page)).space === 'device') break;
  }
  expect((await stageInfo(page)).space).toBe('device');
  await expect(inset).toHaveCount(0);
  expect(errors).toEqual([]);
});

const TRACK_MODULE = /\/(assets\/Track-[^/]*\.js|src\/three\/tools\/Track\.tsx)(\?.*)?$/;

type FilmW = {
  __fabFilm: {
    filmPlayer: () => { now: () => number; tl: { segments: { start: number; dur: number; station: string | null }[] } } | null;
    filmControls: { seek: (t: number) => void; play: () => void };
    useFilm: { getState: () => { status: string } };
  };
  __fab: { useStageInfo: { getState: () => { loading: string | null } } };
  __fabAdvance: (n: number) => void;
};

test('Watch: the narration waits for a machine that is still loading, and carries on where it stopped', async ({ page }, info) => {
  onlyDesktop(info.project.name);
  test.setTimeout(600_000);
  const errors = watchErrors(page);
  await page.goto('/');
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
  let release = () => {};
  const released = new Promise<void>((r) => (release = r));
  await page.route(TRACK_MODULE, async (r) => {
    await released;
    await r.continue();
  });
  await page.goto('/?watch&virt=1');
  await waitForStage(page);
  await expect(page.getByRole('group', { name: 'Film controls' })).toBeVisible();
  // just before the film moves to the track
  const t0 = await page.evaluate(() => {
    const w = window as unknown as FilmW;
    const tl = w.__fabFilm.filmPlayer()!.tl;
    const i = tl.segments.findIndex((s) => s.station === 'track');
    const t = tl.segments[i - 1].start + tl.segments[i - 1].dur - 0.3;
    w.__fabFilm.filmControls.seek(t);
    w.__fabFilm.filmControls.play();
    return t;
  });
  const read = () =>
    page.evaluate(() => {
      const w = window as unknown as FilmW;
      w.__fabAdvance(3);
      return { t: w.__fabFilm.filmPlayer()!.now(), loading: w.__fab.useStageInfo.getState().loading };
    });
  // play into the move to the track: the picture holds for it, and so does the film's clock
  // (frames are rendered while the track's module is held at the network)
  const seen: Awaited<ReturnType<typeof read>>[] = [];
  const start = Date.now();
  while (Date.now() - start < 60000 && seen.filter((s) => s.loading === 'track').length < 25) {
    seen.push(await read());
    await page.waitForTimeout(40);
  }
  const waiting = seen.filter((s) => s.loading === 'track');
  expect(waiting.length, 'the stage waits for the track').toBeGreaterThan(10);
  const held = waiting.map((s) => s.t);
  expect(Math.max(...held) - Math.min(...held), 'the film time stands still while it waits').toBeLessThan(0.05);
  expect(held[0]).toBeGreaterThanOrEqual(t0 - 1e-6);
  await expect(page.locator('.vp-loading')).toContainText('Loading the coater/developer track');
  // the track arrives: the film carries on from the moment it stopped
  release();
  let after = await read();
  for (let i = 0; i < 400 && after.loading; i++) {
    await page.waitForTimeout(50);
    after = await read();
  }
  expect(after.loading).toBeNull();
  const resumedFrom = after.t;
  for (let i = 0; i < 20; i++) after = await read();
  expect(resumedFrom).toBeGreaterThanOrEqual(held[0] - 1e-6);
  expect(resumedFrom - held[0], 'no time skipped while it waited').toBeLessThan(0.5);
  expect(after.t, 'and it plays on').toBeGreaterThan(resumedFrom);
  expect(errors.filter((e) => !/Track-|dynamically imported module|net::ERR_FAILED/i.test(e))).toEqual([]);
});

test('reduced motion: a machine and its chamber open at once, without a moving cut', async ({ page }, info) => {
  onlyDesktop(info.project.name);
  test.setTimeout(600_000);
  const errors = watchErrors(page);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await freshStart(page, '/?step=adi&virt=1');
  await settle(page);
  await page.evaluate(() => (window as unknown as W).__fabStores.useApp.getState().next());
  const cuts: number[] = [];
  for (let i = 0; i < 120; i++) {
    const f = await opening(page, 'etch');
    cuts.push(f.cut);
    if (!f.flying && f.cut === 1 && i > 10) break;
  }
  expect(cuts.at(-1)).toBe(1);
  expect(cuts.filter((c) => c > 0 && c < 1), 'no frame half open').toEqual([]);
  expect(await stageInfo(page)).toMatchObject({ space: 'world' });
  expect(errors).toEqual([]);
});
