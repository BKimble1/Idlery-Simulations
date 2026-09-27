import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { STATIONS } from '../tools/poses/fab';
import { CARRIER_X, IFACE_X, MOD_X, MODS, ROUTES } from '../tools/trackMotion';
import { BEAM_Y, GRANITE_TOP, HOOD_Y0, LENS_H, LENS_TOP, LENS_Y0, RETICLE_Y, WAFER_TOP } from '../tools/scannerMotion';
import { everything, HOUSING_SHARE, innerOpening, slicePlane, wedgePlanes } from '../kit/section';
import { BAY } from '../tools/poses/fab';
import { stationBoxes } from './anchors';
import { backOutPose, directLeg, evalLegs, planTransition } from './flights';
import { BASE_FOV, fitInRoom, fovOf, lensFor, machinePose, makePose, makeSample, ROOM, type CamPose } from './tracks';

/** Removed by a cut in intersection mode: on the negative side of every plane. */
const clipped = (planes: THREE.Plane[], p: THREE.Vector3) => planes.every((pl) => pl.distanceToPoint(p) < 0);
/** Angular distance of azimuth a (from +z toward +x) from a sector's centre. */
const offCentre = (a: number, c: number) => Math.abs(((a - c + 3 * Math.PI) % (2 * Math.PI)) - Math.PI);

describe('section cuts: a chamber is opened after its housing (round four)', () => {
  it('the parts inside a housing open only once it is open, and close before it closes', () => {
    expect(innerOpening(0)).toBe(0);
    expect(innerOpening(HOUSING_SHARE)).toBe(0);
    expect(innerOpening(1)).toBe(1);
    let prev = 0;
    for (let t = 0; t <= 1; t += 0.01) {
      const v = innerOpening(t);
      expect(v).toBeGreaterThanOrEqual(prev);
      prev = v;
    }
  });

  it('closed, the wedge cuts nothing of the chamber; open, it removes its sector to the axis and nothing else', () => {
    const planes = [new THREE.Plane(), new THREE.Plane()];
    const sector: [number, number] = [0.48, 1.95];
    const reach = 0.36;
    // placed as the etch cluster places its chambers: as is, turned a quarter, and mirrored
    const placements = [
      new THREE.Matrix4(),
      new THREE.Matrix4().makeRotationY(Math.PI / 2).setPosition(-0.9, 0, -0.9),
      new THREE.Matrix4().makeScale(-1, 1, 1).setPosition(-1.8, 0, 0),
    ];
    for (const m of placements) {
      wedgePlanes(planes, sector, 0, reach, m);
      for (let a = 0; a < 2 * Math.PI; a += 0.05)
        for (const r of [0.02, 0.2, reach - 0.02])
          for (const y of [0.4, 1.0, 1.5]) {
            const p = new THREE.Vector3(Math.sin(a) * r, y, Math.cos(a) * r).applyMatrix4(m);
            expect(clipped(planes, p), `closed: nothing cut at azimuth ${a.toFixed(2)}, r ${r}`).toBe(false);
          }
      wedgePlanes(planes, sector, 1, reach, m);
      for (let a = -Math.PI; a < Math.PI; a += 0.05)
        for (const r of [0.03, 0.3]) {
          const p = new THREE.Vector3(Math.sin(a) * r, 1.0, Math.cos(a) * r).applyMatrix4(m);
          const off = offCentre(a, sector[0]);
          if (off < sector[1] / 2 - 0.03) expect(clipped(planes, p), `open: cut inside the sector (${a.toFixed(2)})`).toBe(true);
          if (off > sector[1] / 2 + 0.03) expect(clipped(planes, p), `open: whole outside it (${a.toFixed(2)})`).toBe(false);
        }
    }
  });

  it('half open, the wedge has pushed in part of the way: the rim is cut before the axis', () => {
    const planes = [new THREE.Plane(), new THREE.Plane()];
    wedgePlanes(planes, [0, 1.6], 0.5, 0.4, new THREE.Matrix4());
    expect(clipped(planes, new THREE.Vector3(0, 1, 0.38))).toBe(true);
    expect(clipped(planes, new THREE.Vector3(0, 1, 0.02))).toBe(false);
  });

  it('a lid wipes away from the front: nothing cut at the start, all of it at the end', () => {
    const planes = [new THREE.Plane(), everything(new THREE.Plane())];
    const m = new THREE.Matrix4().setPosition(-0.9, 0, 0);
    const fwd = new THREE.Vector3(0, 0, 1);
    const lid = [-0.54, 0, 0.54].flatMap((x) => [-0.54, 0, 0.54].map((z) => new THREE.Vector3(x, 1.14, z).applyMatrix4(m)));
    slicePlane(planes[0], fwd, 0.6, m);
    for (const p of lid) expect(clipped(planes, p)).toBe(false);
    slicePlane(planes[0], fwd, -0.6, m);
    for (const p of lid) expect(clipped(planes, p)).toBe(true);
    // part-way: the front row is gone, the back row is not
    slicePlane(planes[0], fwd, 0, m);
    expect(clipped(planes, lid[2])).toBe(true);
    expect(clipped(planes, lid[0])).toBe(false);
  });
});

const copyOf = (p: CamPose): CamPose => {
  const c = makePose(p.space);
  c.pos.copy(p.pos);
  c.target.copy(p.target);
  c.scale = p.scale;
  c.fov = p.fov;
  return c;
};

const pose = (pos: [number, number, number], target: [number, number, number], scale: CamPose['scale'] = 'tool'): CamPose => {
  const p = makePose();
  p.space = 'world';
  p.scale = scale;
  p.pos.set(...pos);
  p.target.set(...target);
  return p;
};

describe('camera routes: through free space (round four)', () => {
  it('leaving a close view of a wafer, the camera first backs out along its line of sight, to above the machine', () => {
    // your die in the etch cluster's load lock, seen from 0.13 m
    const from = pose([-1.55, 1.12, -2.95], [-1.6, 1.0, -3.0], 'wafer');
    const back = backOutPose(from)!;
    expect(back).not.toBeNull();
    expect(back.pos.y).toBeCloseTo(2.4, 6);
    expect(back.target.distanceTo(from.target)).toBeLessThan(1e-9);
    const d0 = from.pos.clone().sub(from.target).normalize();
    const d1 = back.pos.clone().sub(from.target).normalize();
    expect(d0.dot(d1), 'on the same line of sight').toBeGreaterThan(1 - 1e-9);
    // the machine's own framings are already outside it
    expect(backOutPose(pose([-1.55, 2.75, -1.0], [-2.0, 1.0, -3.0]))).toBeNull();
  });

  it('the move in from the establishing shot is direct: the machine stays ahead of the camera all the way', () => {
    const centre = new THREE.Vector3(-4.9, 1.0, 3.45);
    const est = pose([-1.9, 3.2, -1.6], [centre.x, 1.0, centre.z]);
    const to = pose([-6.1, 2.75, 0.65], [-4.95, 0.95, 2.85]);
    const leg = directLeg(est, () => to);
    const s = makeSample();
    for (let u = 0; u <= 1.0001; u += 0.02) {
      leg.eval(u, s);
      const look = s.a.target.clone().sub(s.a.pos).normalize();
      const toMachine = centre.clone().sub(s.a.pos).normalize();
      expect(look.angleTo(toMachine), `u = ${u.toFixed(2)}`).toBeLessThan(0.7);
    }
  });

  it('a move from a wafer close-up to another machine: back out, travel, establish, move in', () => {
    const from = pose([-1.55, 1.12, -2.95], [-1.6, 1.0, -3.0], 'wafer');
    const to = pose([-6.1, 2.75, 0.65], [-4.95, 0.95, 2.85]);
    const legs = planTransition(from, () => to, { from: 'etch', to: 'cmp', establish: true, reduced: false, fit: () => {} });
    expect(legs.length).toBe(4);
    const s = makeSample();
    // first leg: a pure dolly back along the line of sight (the target does not move)
    for (const u of [0, 0.5, 1]) {
      legs[0].eval(u, s);
      expect(s.a.target.distanceTo(from.target)).toBeLessThan(1e-9);
    }
    expect(legs[0].between).toBeFalsy();
    expect(legs[1].between, 'the wafer changes hands on the travel').toBe(true);
    // consecutive legs join without a jump
    for (let i = 1; i < legs.length; i++) {
      const a = makeSample();
      const b = makeSample();
      legs[i - 1].eval(1, a);
      legs[i].eval(0, b);
      expect(a.a.pos.distanceTo(b.a.pos), `legs ${i - 1} → ${i}`).toBeLessThan(1e-6);
    }
    legs[3].eval(1, s);
    expect(s.a.pos.distanceTo(to.pos)).toBeLessThan(1e-6);
  });

  it('between machines that face each other across the aisle the camera pans round, never down at the floor (CD-SEM → etch)', () => {
    // the machines' footprints as the bay builds them (min, max; metres)
    stationBoxes.set('metrology', new THREE.Box3(new THREE.Vector3(-2.55, 0, 1.6), new THREE.Vector3(0.35, 2.3, 4.05)));
    stationBoxes.set('etch', new THREE.Box3(new THREE.Vector3(-2.2, 0, -5.86), new THREE.Vector3(0.81, 2.65, -1.6)));
    try {
      // the CD-SEM lesson's last framing, from the far side of the aisle, and the etch cluster's
      // establishing shot, from the other side: they look in opposite directions from 2 m apart
      // (moving the point looked at in a straight line swept it under the camera, which looked
      // 66° down at the floor half-way)
      const from = pose([-2.26, 2.4, -0.44], [-1.62, 1.25, 2.7]);
      const to = machinePose('etch', makePose());
      const legs = planTransition(from, () => to, { from: 'metrology', to: 'etch', establish: true, reduced: false, fit: () => {} });
      const pitch = (p: CamPose) => Math.asin((p.target.y - p.pos.y) / p.pos.distanceTo(p.target));
      const heading = (p: CamPose) => Math.atan2(p.target.x - p.pos.x, p.target.z - p.pos.z);
      const steepest = Math.min(pitch(from), pitch(to));
      const total = legs.reduce((t, l) => t + l.dur, 0);
      const s = makeSample();
      let prev: number | null = null;
      let turn = 0;
      let turned = 0;
      for (let t = 0; t <= total + 1e-9; t += 1 / 60) {
        evalLegs(legs, t, s);
        const at = `t = ${t.toFixed(2)} s`;
        expect(pitch(s.a), at).toBeGreaterThanOrEqual(steepest - 1e-6);
        expect(s.a.pos.y, at).toBeLessThanOrEqual(ROOM.ceiling + 1e-6);
        const h = heading(s.a);
        if (prev !== null) {
          const d = ((h - prev + 3 * Math.PI) % (2 * Math.PI)) - Math.PI;
          if (Math.abs(d) > 1e-9) {
            if (!turn) turn = Math.sign(d);
            expect(Math.sign(d), `${at}: the view turns one way only`).toBe(turn);
            turned += d;
          }
        }
        prev = h;
      }
      expect(Math.abs(turned), 'a pan of more than a quarter turn').toBeGreaterThan(Math.PI / 2);
    } finally {
      stationBoxes.clear();
    }
  });
});

describe('the room: cameras among the machines stay over the aisle and under the ceiling (round four)', () => {
  // footprints of the machines as the bay builds them (centre, size; metres)
  const FOOTPRINTS = {
    cmp: [[-4.9, 1.35, 3.55], [3.4, 2.7, 3.9]],
    track: [[5.07, 1.35, -2.92], [6.33, 2.7, 2.65]],
    scanner: [[10.9, 1.78, -4.3], [5.4, 3.56, 5.1]],
    implant: [[-16.42, 1.42, 4.15], [3.66, 2.84, 5.1]],
    foup: [[-19.3, 1.26, -2.62], [1.35, 2.53, 1.94]],
    dicing: [[-24.96, 1.05, -3.07], [1.4, 2.1, 1.44]],
  } as const;
  const halfTan = (p: CamPose) => Math.tan(THREE.MathUtils.degToRad(fovOf(p) / 2));
  const withBoxes = (fn: () => void) => {
    for (const [id, [c, sz]] of Object.entries(FOOTPRINTS))
      stationBoxes.set(id as keyof typeof FOOTPRINTS, new THREE.Box3().setFromCenterAndSize(new THREE.Vector3(...c), new THREE.Vector3(...sz)));
    try {
      fn();
    } finally {
      stationBoxes.clear();
    }
  };

  it("a machine's establishing shot stands at most at the far side of the aisle, under the ceiling, with a lens that keeps its framing", () =>
    withBoxes(() => {
      for (const id of Object.keys(FOOTPRINTS) as (keyof typeof FOOTPRINTS)[]) {
        const p = machinePose(id, makePose());
        expect(p.pos.y, id).toBeLessThanOrEqual(ROOM.ceiling + 1e-9);
        if (id !== 'dicing') expect(Math.abs(p.pos.z), id).toBeLessThanOrEqual(ROOM.aisle + 1e-9);
        // on the aisle side of its own row, looking across at it
        expect(Math.sign(p.pos.z - p.target.z), id).toBe(-Math.sign(p.target.z));
        // what it frames at the machine is what the framing asked for (no nearer than 3.6 m)
        const d = p.pos.distanceTo(p.target);
        expect(d * halfTan(p), id).toBeGreaterThanOrEqual(3.6 * Math.tan(THREE.MathUtils.degToRad(BASE_FOV / 2)) - 1e-9);
        if (p.fov !== undefined) expect(p.fov, id).toBeGreaterThan(BASE_FOV);
      }
      // the polisher across the aisle from the etch cluster: from its far side, not from over the
      // etch cluster's roof at the ceiling (round three: y 4.52 m, z −3.19 m)
      const cmp = machinePose('cmp', makePose());
      expect(cmp.pos.z).toBeCloseTo(-ROOM.aisle, 6);
      expect(cmp.fov).toBeGreaterThan(BASE_FOV);
      // a small machine in the back-end room needs no wider lens
      expect(machinePose('dicing', makePose()).fov).toBeUndefined();
    }));

  it('a narrow screen pulls a framing back only as far as the room allows, then widens the lens: the framing is kept', () => {
    // the polisher's own framing, and a framing already at the far side of the aisle
    const framings = [pose([-6.1, 2.75, 0.65], [-4.95, 0.95, 2.85]), pose([-2.06, 3.6, -1.4], [-4.9, 1.05, 3.55]), pose([-1.55, 1.12, -2.95], [-1.6, 1.0, -3.0], 'wafer')];
    for (const fit of [1.1, 1.55, 2.45])
      for (const f of framings) {
        const p = fitInRoom(copyOf(f), fit);
        const len = f.pos.distanceTo(f.target);
        const d = p.pos.distanceTo(p.target);
        // same line of sight, no nearer, and the same picture at the target
        expect(p.pos.clone().sub(p.target).normalize().dot(f.pos.clone().sub(f.target).normalize())).toBeGreaterThan(1 - 1e-9);
        expect(d).toBeGreaterThanOrEqual(len - 1e-9);
        expect(d * halfTan(p)).toBeCloseTo(len * fit * Math.tan(THREE.MathUtils.degToRad(BASE_FOV / 2)), 6);
        // in the room: under the ceiling; over the aisle if it started there
        expect(p.pos.y).toBeLessThanOrEqual(Math.max(ROOM.ceiling, f.pos.y) + 1e-9);
        if (Math.abs(f.pos.z) <= ROOM.aisle) expect(Math.abs(p.pos.z)).toBeLessThanOrEqual(ROOM.aisle + 1e-9);
        expect(Math.abs(p.pos.z)).toBeLessThan(BAY.z1);
      }
    // with room to spare, a fit is the plain pull-back it always was
    const p = fitInRoom(copyOf(framings[0]), 1.1);
    expect(p.fov).toBeUndefined();
  });

  it('the lens that frames from d what the base lens frames from k·d', () => {
    expect(lensFor(1)).toBeCloseTo(BASE_FOV, 9);
    const k = 1.7;
    expect(Math.tan(THREE.MathUtils.degToRad(lensFor(k) / 2))).toBeCloseTo(k * Math.tan(THREE.MathUtils.degToRad(BASE_FOV / 2)), 9);
  });

  it('out of the etch cluster from your wafer to the polisher: the whole move stays under the ceiling', () =>
    withBoxes(() => {
      const from = pose([-0.66, 1.12, -3.18], [-0.68, 1.0, -3.24], 'wafer');
      const to = pose([-6.1, 2.75, 0.65], [-4.95, 0.95, 2.85]);
      // a narrow stage (the lesson panel beside it): framings pulled back by 10 %
      const fit = (p: CamPose) => fitInRoom(p, 1.1);
      const legs = planTransition(from, () => fit(copyOf(to)), { from: 'etch', to: 'cmp', establish: true, reduced: false, fit });
      const total = legs.reduce((t, l) => t + l.dur, 0);
      const s = makeSample();
      for (let t = 0; t <= total; t += 1 / 60) {
        evalLegs(legs, t, s);
        expect(s.a.pos.y, `t = ${t.toFixed(2)} s`).toBeLessThanOrEqual(ROOM.ceiling + 1e-6);
      }
    }));
});

describe('into the layers and back, at a machine whose wafer is not in view (round four)', () => {
  const tool = pose([1.9, 1.7, 5.4], [2.6, 1.0, 3.2]);
  const section = makePose();
  section.space = 'device';
  section.scale = 'device';
  section.pos.set(-3.9, 3.4, 7.1);
  section.target.set(0, 0.35, -0.3);

  it('Inspect layers reveals them from where the camera is: no flight out to the machine', () => {
    const legs = planTransition(tool, () => section, { from: 'prober', to: 'prober', establish: false, reduced: false, fit: () => {} });
    expect(legs.length, 'only the cross-fade').toBe(1);
    const s = makeSample();
    legs[0].eval(0, s);
    expect(s.a.pos.distanceTo(tool.pos)).toBeLessThan(1e-6);
  });

  it('Back to equipment fades straight into the machine\'s framing', () => {
    const legs = planTransition(section, () => tool, { from: 'prober', to: 'prober', establish: false, reduced: false, fit: () => {} });
    const s = makeSample();
    legs[legs.length - 1].eval(1, s);
    expect(s.a.pos.distanceTo(tool.pos)).toBeLessThan(1e-6);
    // and never away from it on the way: the world camera only dollies along the framing's line
    // of sight (in toward what it looks at, while the layers fade out)
    const sight = tool.pos.clone().sub(tool.target);
    for (const leg of legs)
      for (let u = 0; u <= 1; u += 0.1) {
        leg.eval(u, s);
        for (const p of [s.a, s.b]) {
          if (p.space !== 'world') continue;
          const off = p.pos.clone().sub(tool.target);
          expect(off.angleTo(sight), `u = ${u.toFixed(1)}: on the line of sight`).toBeLessThan(0.05);
          expect(off.length()).toBeLessThanOrEqual(sight.length() + 1e-6);
        }
      }
  });
});

describe('the lithography cell, as a fab lays it out (round four)', () => {
  it('the track runs from its carrier block to the scanner in process order, and hands over to the scanner at its east end', () => {
    const order = ['prime', 'coat', 'bake', 'develop', 'peb'] as const;
    for (let i = 1; i < order.length; i++) expect(MOD_X[order[i]]).toBeGreaterThan(MOD_X[order[i - 1]]);
    expect(CARRIER_X).toBeLessThan(Math.min(...MODS.map((m) => MOD_X[m])));
    expect(IFACE_X).toBeGreaterThan(Math.max(...MODS.map((m) => MOD_X[m])));
    // the scanner stands east of the track in the bay, on the interface's side
    expect(STATIONS.scanner![0]).toBeGreaterThan(STATIONS.track![0]);
  });

  it('every transfer on the track is a short carry (no cross-track trips)', () => {
    for (const [id, r] of Object.entries(ROUTES)) {
      expect(Math.abs(MOD_X[r!.to] - r!.from), id).toBeLessThanOrEqual(0.71);
      expect(Math.abs(r!.park - MOD_X[r!.to]), id).toBeLessThan(0.5);
    }
  });

  it("the scanner's immersion gap is a production one: the lens 1 mm over the wafer, the hood 0.5 mm", () => {
    expect(LENS_Y0 - WAFER_TOP).toBeCloseTo(0.001, 9);
    expect(HOOD_Y0 - WAFER_TOP).toBeCloseTo(0.0005, 9);
    expect(LENS_H).toBeGreaterThan(1.2);
    expect(WAFER_TOP).toBeGreaterThan(GRANITE_TOP);
    expect(RETICLE_Y).toBeGreaterThan(LENS_TOP);
    // the beam enters the illuminator above the reticle, under the enclosure's raised roof (3.3 m)
    expect(BEAM_Y).toBeGreaterThan(RETICLE_Y);
    expect(BEAM_Y + 0.16).toBeLessThan(3.3);
  });
});
