/**
 * Resolving framings to camera poses and evaluating tracks at a progress value.
 *
 * World framings are in metres (fab, tools, wafer); device framings are in the schematic
 * device space. A segment between the two is an anchored, matched transition: the world
 * camera closes in on your die while the device camera starts far out along the same
 * direction relative to the wafer's axes, and the two views cross-fade — so the magnified
 * cell appears exactly where, and oriented as, the die was.
 */

import * as THREE from 'three';
import type { CamRef, Key } from '../../content/shots';
import type { MachineId } from '../../state/nav';
import { DEVICE_POSE, type Pose } from '../poses';
import { BACKEND, BACKEND_WALL_X, BAY, fabPoseFor, POSE as FAB_POSE } from '../tools/poses/fab';
import { facing } from '../tools/poses/fab';
import type { ScaleId } from '../../state/store';
import { anchorsOf, failedStations, stationBoxes, toolMatrix, waferFrame } from './anchors';

export type Space = 'world' | 'device';

export interface CamPose {
  space: Space;
  pos: THREE.Vector3;
  target: THREE.Vector3;
  /** What the framing shows (for the scale label); unset for free camera positions. */
  scale?: ScaleId;
  /** Vertical field of view (degrees) for framings composed for the viewport (the views of
   * the whole bay); unset for ordinary framings, which use BASE_FOV. Moves interpolate it. */
  fov?: number;
  /**
   * Round four: the framing looks at the sealed machine from outside (a flight's establishing
   * beat, the explorer's view of a machine), so its housing stays closed; a move toward such a
   * framing keeps it closed, and a move in from it opens it (Director, housingsWanted).
   */
  exterior?: boolean;
}

/** The field of view of ordinary framings (degrees). */
export const BASE_FOV = 32;

export const makePose = (space: Space = 'world'): CamPose => ({ space, pos: new THREE.Vector3(), target: new THREE.Vector3() });

export function copyPose(dst: CamPose, src: CamPose): CamPose {
  dst.space = src.space;
  dst.pos.copy(src.pos);
  dst.target.copy(src.target);
  dst.scale = src.scale;
  dst.fov = src.fov;
  dst.exterior = src.exterior;
  return dst;
}

export const fovOf = (p: CamPose) => p.fov ?? BASE_FOV;

/** One frame's camera: a single pose, or a cross-fade from `a` to `b` (b weighted by mix). */
export interface CamSample {
  a: CamPose;
  b: CamPose;
  mix: number;
}

export const makeSample = (): CamSample => ({ a: makePose(), b: makePose(), mix: 0 });

export interface ResolveCtx {
  station: MachineId | null;
  variant?: string;
}

const DEVICE_FRAMINGS: Record<'section' | 'top' | 'wide', Pose> = {
  section: DEVICE_POSE,
  top: { pos: [-1.2, 6.8, 3.4], target: [0, 0.4, -0.2] },
  wide: { pos: [-6.2, 4.6, 10.2], target: [0, 0.2, -0.3] },
};

const tmpM = new THREE.Matrix4();
const wf = { centre: new THREE.Vector3(), up: new THREE.Vector3(), die: new THREE.Vector3(), x: new THREE.Vector3(), span: 1 };
const v1 = new THREE.Vector3();
const v2 = new THREE.Vector3();

function setPose(out: CamPose, space: Space, pose: Pose, m?: THREE.Matrix4): CamPose {
  out.space = space;
  out.scale = space === 'device' ? 'device' : 'tool';
  out.fov = undefined;
  out.exterior = false;
  out.pos.set(pose.pos[0], pose.pos[1], pose.pos[2]);
  out.target.set(pose.target[0], pose.target[1], pose.target[2]);
  if (m) {
    out.pos.applyMatrix4(m);
    out.target.applyMatrix4(m);
  }
  return out;
}

/** The machine's own framing: variant or named shot, else establish. */
function toolShot(id: MachineId, name: string, out: CamPose): CamPose {
  const a = anchorsOf(id);
  const pose = a.shots[name] ?? a.shots.establish;
  return setPose(out, 'world', pose, toolMatrix(id, tmpM));
}

/**
 * Round four: the free space a camera among the machines keeps to — over the central aisle,
 * clear of the overhead rail above the load ports (at |z| ≈ 1.85 m), under the ceiling (4.6 m,
 * with its light fittings) and inside the walls. A framing that wants its camera further back
 * than that keeps it in the room and widens the lens instead (the establishing shot of a large
 * machine across the aisle, and the aspect fit of narrow screens, took the camera out through
 * the ceiling and over the other row of machines).
 */
export const ROOM = { aisle: 1.4, ceiling: BAY.ceiling - 0.55, wall: 0.3 } as const;

/** The vertical field of view (degrees) that frames from a distance d what `fov` frames from k·d. */
export const lensFor = (k: number, fov = BASE_FOV) => THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(fov / 2)) * k));

/** One side of the room: a limit on one coordinate (`sign` · coordinate ≤ `at`). */
const roomSides = (target: THREE.Vector3): [axis: 'x' | 'y' | 'z', sign: 1 | -1, at: number][] => {
  const backend = target.x < BACKEND_WALL_X;
  return [
    ['y', 1, ROOM.ceiling],
    // over the aisle, the camera does not back out over a row of machines
    ['z', 1, ROOM.aisle],
    ['z', -1, ROOM.aisle],
    ['z', 1, BAY.z1 - ROOM.wall],
    ['z', -1, -BAY.z0 - ROOM.wall],
    // the glass wall between the bay and the back-end room, and the end walls
    ['x', 1, backend ? BACKEND_WALL_X - ROOM.wall : BAY.x1 - ROOM.wall],
    ['x', -1, backend ? -BACKEND.x0 - ROOM.wall : -BACKEND_WALL_X - ROOM.wall],
  ];
};

/**
 * How far from `target`, along the unit direction `dir` (from the target toward the camera), a
 * camera standing `from` metres out may back off without leaving the room: it does not cross a
 * side of it that it has not already crossed (a camera inside a machine, below the ceiling,
 * stays below it; one over the aisle stays over it).
 */
export function roomAlong(target: THREE.Vector3, dir: THREE.Vector3, from: number): number {
  let s = Infinity;
  for (const [axis, sign, at] of roomSides(target)) {
    const d = sign * dir[axis];
    if (d <= 1e-6 || sign * (target[axis] + dir[axis] * from) > at + 1e-6) continue;
    s = Math.min(s, (at - sign * target[axis]) / d);
  }
  return Math.max(from, s);
}

const fitDir = new THREE.Vector3();

/**
 * Pull a framing back by `fit` for a narrow screen, as far as the room allows, and widen its
 * lens for the rest: the picture keeps its framing, and the camera stays in the room.
 */
export function fitInRoom(p: CamPose, fit: number): CamPose {
  fitDir.subVectors(p.pos, p.target);
  const len = fitDir.length();
  if (len < 1e-6) return p;
  fitDir.divideScalar(len);
  const want = len * fit;
  const s = Math.min(want, roomAlong(p.target, fitDir, len));
  p.pos.copy(p.target).addScaledVector(fitDir, s);
  if (want > s + 1e-9) p.fov = lensFor(want / s, fovOf(p));
  return p;
}

const MACHINE_ELEV = 0.42; // ~24° above horizontal
const MACHINE_YAW = 0.52; // ~30° off the machine's front axis, toward the east
const HALF_FOV = (BASE_FOV / 2) * (Math.PI / 180);
const mc = new THREE.Vector3();
const ms = new THREE.Vector3();
const md = new THREE.Vector3();

/**
 * The whole machine from the aisle side, at a three-quarter angle, sized to its footprint.
 * (Round four) from the far side of the aisle at most, under the ceiling: a large machine is
 * framed with a wider lens rather than from over the machines of the other row.
 */
export function machinePose(id: MachineId, out: CamPose): CamPose {
  const box = stationBoxes.get(id);
  if (!box) return toolShot(id, 'establish', out);
  box.getCenter(mc);
  box.getSize(ms);
  const r = 0.5 * Math.hypot(ms.x, ms.y * 0.8, ms.z);
  const dist = Math.max(3.6, Math.min(8.5, (r / Math.sin(HALF_FOV)) * 0.92));
  const f = facing(id);
  out.space = 'world';
  out.scale = 'tool';
  out.exterior = false;
  out.target.set(mc.x, Math.min(1.05, mc.y), mc.z);
  const ce = Math.cos(MACHINE_ELEV);
  md.set(Math.sin(MACHINE_YAW) * ce, Math.sin(MACHINE_ELEV), f * Math.cos(MACHINE_YAW) * ce);
  const d = Math.min(dist, roomAlong(out.target, md, 0));
  out.pos.copy(out.target).addScaledVector(md, d);
  out.fov = d < dist - 1e-6 ? lensFor(dist / d) : undefined;
  return out;
}

/**
 * Resolve a framing. Wafer framings look at the wafer where the tool holds it right now,
 * from the side the machine is normally seen from; if no wafer is present, they fall back to
 * the machine's establishing shot.
 */
export function resolve(ref: CamRef, ctx: ResolveCtx, out: CamPose): CamPose {
  switch (ref.kind) {
    case 'machine': {
      const st = ref.station ?? ctx.station;
      if (!st) return setPose(out, 'world', FAB_POSE);
      return machinePose(st, out);
    }
    case 'device':
      return setPose(out, 'device', DEVICE_FRAMINGS[ref.framing]);
    case 'fab': {
      const st = ref.station ?? ctx.station;
      setPose(out, 'world', !st || st === 'overview' ? FAB_POSE : fabPoseFor(st));
      out.scale = 'fab';
      return out;
    }
    case 'shot': {
      const st = ref.station ?? ctx.station;
      if (!st) return setPose(out, 'world', FAB_POSE);
      // a machine whose detailed model could not be loaded is shown from outside
      if (failedStations.has(st)) return machinePose(st, out);
      return toolShot(st, ref.name === 'establish' && ctx.variant ? ctx.variant : ref.name, out);
    }
    case 'wafer': {
      const st = ref.station ?? ctx.station;
      if (!st) return setPose(out, 'world', FAB_POSE);
      if (failedStations.has(st)) return machinePose(st, out);
      if (!waferFrame(st, wf)) return toolShot(st, ctx.variant ?? 'establish', out);
      // Horizontal direction toward the machine's usual viewpoint, then tilt up.
      toolShot(st, ctx.variant ?? 'establish', out);
      v1.copy(out.pos).sub(wf.centre);
      v1.addScaledVector(wf.up, -v1.dot(wf.up));
      if (v1.lengthSq() < 1e-6) v1.set(0, 0, 1);
      v1.normalize();
      const top = ref.framing === 'top';
      const elev = top ? 0.95 : 1.15; // radians above the wafer plane
      const dist = top ? 0.56 * (wf.span ?? 1) : 0.13; // 'die': your die and its neighbours fill the view
      const centre = top ? wf.centre : wf.die;
      v2.copy(v1).multiplyScalar(Math.cos(elev)).addScaledVector(wf.up, Math.sin(elev)).multiplyScalar(dist);
      out.space = 'world';
      out.scale = 'wafer';
      out.exterior = false;
      out.target.copy(centre);
      out.pos.copy(centre).add(v2);
      return out;
    }
  }
}

// ───────────────────────────── track evaluation ─────────────────────────────

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const seg = (p: number, a: number, b: number) => (b > a ? clamp01((p - a) / (b - a)) : p >= b ? 1 : 0);
export const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const easeIn = (t: number) => t * t;
const easeOut = (t: number) => 1 - (1 - t) * (1 - t);
const smoothstep = (t: number) => t * t * (3 - 2 * t);

const A = makePose();
const B = makePose();
const SWAP = makePose();
const dir = new THREE.Vector3();

/**
 * Direction (unit, in device-space axes) matching the world camera's view of your die. The
 * device block's axes follow the wafer's: grid x along the wafer's x, up along its normal.
 */
export function matchedDeviceDir(worldPose: CamPose, station: MachineId | null, out: THREE.Vector3): THREE.Vector3 {
  out.copy(worldPose.pos).sub(worldPose.target);
  if (station && waferFrame(station, wf)) {
    const z = v1.crossVectors(wf.x, wf.up).normalize();
    const lx = out.dot(wf.x);
    const ly = out.dot(wf.up);
    const lz = out.dot(z);
    out.set(lx, ly, lz);
  }
  if (out.lengthSq() < 1e-9) out.set(0, 1, 1);
  return out.normalize();
}

/** Cross-fade between a world pose and a device pose over t in [0, 1] (world → device). */
export function worldToDevice(worldFrom: CamPose, deviceTo: CamPose, t: number, station: MachineId | null, out: CamSample): CamSample {
  const w = 0.28;
  const mid = 0.5;
  // world side: close in on the target
  const tw = easeIn(seg(t, 0, mid + w));
  copyPose(out.a, worldFrom);
  out.a.pos.lerp(v2.copy(worldFrom.target).addScaledVector(dir.copy(worldFrom.pos).sub(worldFrom.target), 0.22), tw);
  // device side: come in from far out along the matched direction
  matchedDeviceDir(worldFrom, station, dir);
  const d = deviceTo.pos.distanceTo(deviceTo.target);
  const td = easeOut(seg(t, mid - w, 1));
  copyPose(out.b, deviceTo);
  v2.copy(deviceTo.target).addScaledVector(dir, d * 3.4);
  out.b.pos.copy(v2).lerp(deviceTo.pos, td);
  out.mix = smoothstep(seg(t, mid - w, mid + w));
  return out;
}

/** The reverse: pull out of the cross-section and back onto the wafer. */
export function deviceToWorld(deviceFrom: CamPose, worldTo: CamPose, t: number, station: MachineId | null, out: CamSample): CamSample {
  worldToDevice(worldTo, deviceFrom, 1 - t, station, out);
  // worldToDevice put the world pose in a and the device pose in b; flip for a device→world fade
  copyPose(SWAP, out.a);
  copyPose(out.a, out.b);
  copyPose(out.b, SWAP);
  out.mix = 1 - out.mix;
  return out;
}

/** Plain move within one space. */
export function lerpPose(a: CamPose, b: CamPose, t: number, out: CamPose): CamPose {
  out.space = b.space;
  out.scale = t < 0.5 ? a.scale : b.scale;
  // (a move toward a sealed machine keeps it sealed; a move in from one opens it at once)
  out.exterior = !!b.exterior;
  out.fov = a.fov === undefined && b.fov === undefined ? undefined : fovOf(a) + (fovOf(b) - fovOf(a)) * t;
  out.pos.lerpVectors(a.pos, b.pos, t);
  out.target.lerpVectors(a.target, b.target, t);
  return out;
}

const va = new THREE.Vector3();
const vb = new THREE.Vector3();

/**
 * Which way (±1, about the vertical) a move from `a` to `b` turns the camera around, or 0 if it
 * does not: its horizontal view turns by more than 90°. (A view within 30° of straight down has
 * no heading worth turning: 0.)
 */
export function turnAround(a: CamPose, b: CamPose): -1 | 0 | 1 {
  const ha = va.subVectors(a.target, a.pos).length();
  const hb = vb.subVectors(b.target, b.pos).length();
  va.setY(0);
  vb.setY(0);
  if (va.length() < 0.5 * ha || vb.length() < 0.5 * hb || va.dot(vb) >= 0) return 0;
  return va.x * vb.z - va.z * vb.x > 0 ? -1 : 1;
}

/** How far (radians, 0..π) the horizontal view turns from `a` to `b`. */
export function headingChange(a: CamPose, b: CamPose): number {
  va.subVectors(a.target, a.pos).setY(0);
  vb.subVectors(b.target, b.pos).setY(0);
  if (va.lengthSq() < 1e-8 || vb.lengthSq() < 1e-8) return 0;
  return va.angleTo(vb);
}

/**
 * `lerpPose` for a move that turns the camera around (round four), turning the view about the
 * vertical — its heading the way `turn` says (see turnAround), its pitch and the distance to what
 * it looks at in proportion — while the camera moves as in lerpPose. Framings of machines that
 * face each other across the aisle look in opposite directions from a few metres apart: moving
 * the point looked at in a straight line swept it under the camera, which looked straight down
 * at the floor half-way (the CD-SEM to the etch cluster). The camera now pans across the aisle.
 */
export function turnPose(a: CamPose, b: CamPose, t: number, turn: -1 | 1, out: CamPose): CamPose {
  lerpPose(a, b, t, out);
  va.subVectors(a.target, a.pos);
  vb.subVectors(b.target, b.pos);
  const la = va.length();
  const lb = vb.length();
  if (la < 1e-6 || lb < 1e-6) return out;
  const ya = Math.atan2(va.x, va.z);
  // the heading's change, taken the way `turn` goes (a quarter turn to a whole one)
  let dy = Math.atan2(vb.x, vb.z) - ya;
  while (turn * dy < 0) dy += turn * 2 * Math.PI;
  while (turn * dy > 2 * Math.PI) dy -= turn * 2 * Math.PI;
  const pa = Math.asin(THREE.MathUtils.clamp(va.y / la, -1, 1));
  const pb = Math.asin(THREE.MathUtils.clamp(vb.y / lb, -1, 1));
  const yaw = ya + dy * t;
  const pitch = pa + (pb - pa) * t;
  const len = la + (lb - la) * t;
  const c = Math.cos(pitch) * len;
  out.target.set(out.pos.x + Math.sin(yaw) * c, out.pos.y + Math.sin(pitch) * len, out.pos.z + Math.cos(yaw) * c);
  return out;
}

const PREV = makePose();
const NEXT = makePose();

const differs = (a: CamPose, b: CamPose) => a.space !== b.space || a.pos.distanceToSquared(b.pos) + a.target.distanceToSquared(b.target) > 1e-6;

/**
 * Tangent (per unit progress) at key `mid` for a move passing through it from `before` to
 * `after` (Catmull-Rom), limited so the path cannot overshoot either neighbouring move.
 */
function throughTangent(before: THREE.Vector3, mid: THREE.Vector3, after: THREE.Vector3, dpBefore: number, dpAfter: number, out: THREE.Vector3): THREE.Vector3 {
  out.subVectors(after, before).divideScalar(dpBefore + dpAfter);
  const vIn = mid.distanceTo(before) / dpBefore;
  const vOut = after.distanceTo(mid) / dpAfter;
  const cap = 1.5 * Math.min(vIn, vOut);
  const len = out.length();
  if (len > cap) out.multiplyScalar(cap / Math.max(1e-9, len));
  return out;
}

/** Cubic Hermite between a and b with end tangents ma, mb (already scaled to the segment). */
function hermite(a: THREE.Vector3, b: THREE.Vector3, ma: THREE.Vector3, mb: THREE.Vector3, t: number, out: THREE.Vector3): THREE.Vector3 {
  const t2 = t * t;
  const t3 = t2 * t;
  const h00 = 2 * t3 - 3 * t2 + 1;
  const h10 = t3 - 2 * t2 + t;
  const h01 = -2 * t3 + 3 * t2;
  const h11 = t3 - t2;
  return out.set(
    h00 * a.x + h10 * ma.x + h01 * b.x + h11 * mb.x,
    h00 * a.y + h10 * ma.y + h01 * b.y + h11 * mb.y,
    h00 * a.z + h10 * ma.z + h01 * b.z + h11 * mb.z,
  );
}

const MA = { pos: new THREE.Vector3(), target: new THREE.Vector3() };
const MB = { pos: new THREE.Vector3(), target: new THREE.Vector3() };

/**
 * Evaluate a track at progress p. A key says "by p, the camera arrives at this framing".
 * Consecutive keys with the same framing hold it (a deliberate pause). A run of moves passes
 * through its intermediate framings without stopping (the camera arrives at each on time,
 * still moving: velocity is continuous), starting from rest and coming to rest at the end of
 * the run; a single move eases in and out. A change of space is the anchored cross-fade.
 */
export function evalTrack(track: Key[], p: number, ctx: ResolveCtx, out: CamSample): CamSample {
  out.mix = 0;
  if (!track.length) {
    setPose(out.a, 'world', FAB_POSE);
    return out;
  }
  if (p <= track[0].p || track.length === 1) {
    resolve(track[0].cam, ctx, out.a);
    return out;
  }
  let i = track.length - 1;
  for (let k = 0; k < track.length - 1; k++) {
    if (p < track[k + 1].p) {
      i = k;
      break;
    }
  }
  if (i === track.length - 1) {
    resolve(track[i].cam, ctx, out.a);
    return out;
  }
  const ka = track[i];
  const kb = track[i + 1];
  resolve(ka.cam, ctx, A);
  resolve(kb.cam, ctx, B);
  const t = seg(p, ka.p, kb.p);
  if (A.space !== B.space) {
    if (A.space === 'world') return worldToDevice(A, B, t, ctx.station, out);
    return deviceToWorld(A, B, t, ctx.station, out);
  }
  if (!differs(A, B)) {
    copyPose(out.a, A);
    return out;
  }
  // moving on through the neighbouring keys (a run of moves in the same space)?
  const dp = kb.p - ka.p;
  const kp = track[i - 1];
  const kn = track[i + 2];
  const inRunBefore = !!kp && kp.p < ka.p && (resolve(kp.cam, ctx, PREV), PREV.space === A.space && differs(PREV, A));
  const inRunAfter = !!kn && kn.p > kb.p && (resolve(kn.cam, ctx, NEXT), NEXT.space === B.space && differs(B, NEXT));
  if (!inRunBefore && !inRunAfter) {
    lerpPose(A, B, easeInOut(t), out.a);
    return out;
  }
  MA.pos.set(0, 0, 0);
  MA.target.set(0, 0, 0);
  MB.pos.set(0, 0, 0);
  MB.target.set(0, 0, 0);
  if (inRunBefore) {
    throughTangent(PREV.pos, A.pos, B.pos, ka.p - kp.p, dp, MA.pos).multiplyScalar(dp);
    throughTangent(PREV.target, A.target, B.target, ka.p - kp.p, dp, MA.target).multiplyScalar(dp);
  }
  if (inRunAfter) {
    throughTangent(A.pos, B.pos, NEXT.pos, dp, kn.p - kb.p, MB.pos).multiplyScalar(dp);
    throughTangent(A.target, B.target, NEXT.target, dp, kn.p - kb.p, MB.target).multiplyScalar(dp);
  }
  lerpPose(A, B, t, out.a); // space, scale and field of view
  hermite(A.pos, B.pos, MA.pos, MB.pos, t, out.a.pos);
  hermite(A.target, B.target, MA.target, MB.target, t, out.a.target);
  return out;
}

/**
 * Reduced motion: hold each framing still and cross-fade to the next one just before its key,
 * instead of moving the camera. The fade is short in progress terms (under a second).
 */
export function evalTrackStill(track: Key[], p: number, ctx: ResolveCtx, out: CamSample): CamSample {
  out.mix = 0;
  if (!track.length) {
    setPose(out.a, 'world', FAB_POSE);
    return out;
  }
  let i = 0;
  for (let k = 0; k < track.length; k++) if (p >= track[k].p) i = k;
  resolve(track[i].cam, ctx, out.a);
  const next = track[i + 1];
  if (!next) return out;
  const fade = Math.min(0.05, (next.p - track[i].p) / 2);
  const t = (p - (next.p - fade)) / fade;
  if (t <= 0) return out;
  resolve(next.cam, ctx, out.b);
  out.mix = Math.min(1, t);
  return out;
}

/** Which space a track is in at p (the cut happens halfway through a space change). */
export function spaceAt(track: Key[], p: number, ctx: ResolveCtx): Space {
  const s = makeSample();
  evalTrack(track, p, ctx, s);
  return s.mix >= 0.5 ? s.b.space : s.a.space;
}
