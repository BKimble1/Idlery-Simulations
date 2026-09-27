/**
 * Camera moves between framings, shared by the director (Learn and Explore flights, computed
 * on the fly) and the film (the same moves, laid out on the media timeline).
 *
 * A transition is a list of legs, each a function of its own 0..1 progress:
 *   - a direct move, for short distances and high overview shots;
 *   - an aisle move between machines: step back into the central aisle (clear of equipment,
 *     through the doorway to the back-end room), travel along it looking ahead, turn in;
 *   - an establishing beat when arriving at a new machine;
 *   - the anchored world ↔ device cross-fade through your die;
 *   - with reduced motion, a short cross-fade between two still compositions instead.
 */
import * as THREE from 'three';
import type { MachineId } from '../../state/nav';
import { TOOL_POSES } from '../poses';
import { waferShown } from './anchors';
import { copyPose, deviceToWorld, fovOf, headingChange, lerpPose, machinePose, makePose, resolve, turnAround, turnPose, worldToDevice, type CamPose, type CamSample } from './tracks';

export interface Leg {
  dur: number;
  eval: (u: number, out: CamSample) => void;
  /** A move from one machine to another (the learner's wafer changes hands during it). */
  between?: boolean;
  /** A cross-fade from one machine's picture to the other's (reduced motion): each side shows
   * the learner's wafer where its own machine has it. Every other fade (into or out of the
   * layers) happens at one machine, and shows the wafer where the move has it at the time. */
  across?: boolean;
}



export const smooth = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));


/** Inside a tool row rather than in the central aisle (the aisle is |z| < 1.8 m). */
const deep = (p: THREE.Vector3) => Math.abs(p.z) > 1.6;
const aisleZ = (z: number) => Math.max(-0.5, Math.min(0.5, z)) * 0.5;

/**
 * A world move from `from` to a live target. Between machines the camera steps back into the
 * central aisle (clear of equipment, through the doorway to the back-end room), travels along
 * it looking ahead, and turns in to the next machine; short moves are direct.
 */
export function worldLeg(from: CamPose, target: () => CamPose): Leg {
  const f = copyPose(makePose(), from);
  const probe = copyPose(makePose(), target());
  const dx = Math.abs(probe.pos.x - f.pos.x);
  const dist = f.pos.distanceTo(probe.pos);
  // High overview shots fly directly; ground-level moves between machines use the aisle.
  const overview = f.pos.y > 6 || probe.pos.y > 6;
  const viaAisle = !overview && dx > 2.5 && (dist > 6 || deep(f.pos) || deep(probe.pos));
  if (!viaAisle) {
    // (round four) a move among the machines that turns the camera around — between machines that
    // face each other across the aisle — pans it about the vertical, over time enough for the
    // turn (turnPose); from and to the high overview shots the view looks down at the bay anyway
    const turn = overview ? 0 : turnAround(f, probe);
    const dur = Math.max(overview ? clamp(1.2 + dist / 30, 1.4, 2.6) : clamp(0.6 + dist * 0.35, 0.6, 1.3), turn ? 1 + 0.45 * headingChange(f, probe) : 0);
    return {
      dur,
      eval: (u, out) => {
        out.mix = 0;
        if (turn) turnPose(f, target(), smooth(u), turn, out.a);
        else lerpPose(f, target(), smooth(u), out.a);
      },
    };
  }
  const dirX = Math.sign(probe.pos.x - f.pos.x) || 1;
  const y = clamp((f.pos.y + probe.pos.y) / 2, 1.7, 2.15);
  const lead = Math.min(2.2, dx * 0.18);
  const p1 = new THREE.Vector3(f.pos.x + dirX * lead, y, aisleZ(f.pos.z));
  const p2 = new THREE.Vector3(probe.pos.x - dirX * Math.min(2.6, dx * 0.2), y, aisleZ(probe.pos.z));
  const path = new THREE.CatmullRomCurve3([f.pos.clone(), p1, p2, probe.pos.clone()], false, 'centripetal');
  // look ahead along the aisle while travelling, then onto the next machine; never further ahead
  // than the machine itself (in the short back-end room, looking 6 m ahead from the dicing saw
  // meant looking at the end wall from close by, a picture of nothing but wall)
  const t1 = p1.clone().add(new THREE.Vector3(dirX * Math.min(6, Math.abs(probe.target.x - p1.x)), -0.35, 0));
  const t2 = p2
    .clone()
    .add(new THREE.Vector3(dirX * Math.min(3, Math.abs(probe.target.x - p2.x)), -0.3, 0))
    .lerp(probe.target, 0.55);
  const look = new THREE.CatmullRomCurve3([f.target.clone(), t1, t2, probe.target.clone()], false, 'centripetal');
  const len = path.getLength();
  const dur = clamp(1.3 + len / 16, 1.6, 3.0);
  const drift = new THREE.Vector3();
  return {
    dur,
    between: true,
    eval: (u, out) => {
      // (the arc-length lookup is only defined on 0..1)
      const k = smooth(clamp(u, 0, 1));
      const t = path.getUtoTmapping(k, 0);
      out.mix = 0;
      out.a.space = 'world';
      out.a.scale = k < 0.5 ? f.scale : probe.scale;
      out.a.exterior = !!probe.exterior;
      path.getPoint(t, out.a.pos);
      look.getPoint(t, out.a.target);
      // follow a destination that moves while we travel (blended in towards the end)
      const to = target();
      const w = k * k;
      out.a.pos.addScaledVector(drift.subVectors(to.pos, probe.pos), w);
      out.a.target.addScaledVector(drift.subVectors(to.target, probe.target), w);
      out.a.fov = f.fov === undefined && to.fov === undefined ? undefined : fovOf(f) + (fovOf(to) - fovOf(f)) * k;
    },
  };
}

/**
 * A short direct move, for a camera already at the machine: the move in from the establishing
 * shot (round four: the aisle path's look along the aisle and turn back in swung the view
 * away from the machine it had just established, and ran the camera along its front).
 */
export function directLeg(from: CamPose, target: () => CamPose): Leg {
  const f = copyPose(makePose(), from);
  const probe = target();
  const dist = f.pos.distanceTo(probe.pos);
  // (a turn-around pans about the vertical, as in worldLeg)
  const turn = turnAround(f, probe);
  return {
    dur: Math.max(clamp(0.7 + dist * 0.22, 0.8, 1.8), turn ? 1 + 0.45 * headingChange(f, probe) : 0),
    eval: (u, out) => {
      out.mix = 0;
      if (turn) turnPose(f, target(), smooth(u), turn, out.a);
      else lerpPose(f, target(), smooth(u), out.a);
    },
  };
}

/** Height a camera leaving a close view of a wafer backs out to before it travels (m). */
const BACK_OUT_Y = 2.4;

/**
 * Out of a machine from a close framing of its wafer (round four): back out first along the
 * line of sight, the way the lesson's camera came in, to above the machine's opened housing,
 * and travel from there. Heading straight for the aisle from a wafer deep inside a cluster (in
 * the etch cluster's load lock, say) ran the camera through the front end's wall.
 */
export function backOutPose(from: CamPose): CamPose | null {
  if (from.space !== 'world' || from.scale !== 'wafer') return null;
  const dir = new THREE.Vector3().subVectors(from.pos, from.target);
  const len = dir.length();
  if (len < 1e-4) return null;
  dir.divideScalar(len);
  const rise = BACK_OUT_Y - from.pos.y;
  if (rise < 0.05 || dir.y < 0.2) return null;
  const out = copyPose(makePose(), from);
  out.pos.addScaledVector(dir, Math.min(2.5, rise / dir.y));
  out.scale = 'tool';
  return out;
}

/** Reduced motion: hold both compositions still and cross-fade between them. */
export function fadeLeg(from: CamPose, target: () => CamPose): Leg {
  const f = copyPose(makePose(), from);
  return {
    dur: 0.35,
    across: true,
    eval: (u, out) => {
      copyPose(out.a, f);
      copyPose(out.b, target());
      out.mix = u;
    },
  };
}

/** Hold a framing for a moment (the establishing beat on arriving at a new machine). */
export function holdLeg(pose: CamPose, dur: number): Leg & { pose: CamPose } {
  return {
    pose,
    dur,
    eval: (_, out) => {
      out.mix = 0;
      copyPose(out.a, pose);
    },
  };
}


export interface TransitionOpts {
  /** The machine the camera leaves (a retrace from the cross-section starts at its wafer). */
  from: MachineId | null;
  /** The machine of the destination framing. */
  to: MachineId | null;
  /** Show the whole new machine for a moment before moving in. */
  establish: boolean;
  reduced: boolean;
  /** Adjust an intermediate framing for the viewport (the director's aspect fit). */
  fit: (p: CamPose) => void;
}

/** The legs of a move from `start` to a (possibly moving) target framing. */
export function planTransition(start: CamPose, target: () => CamPose, o: TransitionOpts): Leg[] {
  const startPose = copyPose(makePose(), start);
  const probe = target();
  const legs: Leg[] = [];

  /**
   * World to world, via the new machine's establishing shot when changing machine. Returns the
   * pose the last leg starts from (the establishing shot, say).
   */
  const worldPath = (start: CamPose): CamPose => {
    let from = start;
    if (o.from && o.to && o.from !== o.to) {
      // leaving a close view of the wafer: back out along the line of sight first
      const back = backOutPose(from);
      if (back) {
        legs.push(directLeg(from, () => back));
        from = back;
      }
    }
    if (o.establish && o.to) {
      // the whole new machine, sealed: its housing opens only as the camera moves in from here
      const est = machinePose(o.to, makePose());
      est.exterior = true;
      o.fit(est);
      const travel = worldLeg(from, () => est);
      travel.between = true;
      legs.push(travel);
      legs.push(holdLeg(est, 0.35));
      legs.push(directLeg(est, target));
      return est;
    }
    legs.push(worldLeg(from, target));
    // a move without a change of machine hands nothing over
    if (!o.from || !o.to || o.from === o.to) legs[legs.length - 1].between = false;
    return from;
  };

  if (o.reduced) {
    legs.push(fadeLeg(startPose, target));
  } else if (startPose.space === 'world' && probe.space === 'world') {
    worldPath(startPose);
  } else if (startPose.space === 'device' && probe.space === 'device') {
    legs.push({ dur: 0.8, eval: (u, out) => ((out.mix = 0), lerpPose(startPose, target(), smooth(u), out.a)) });
  } else if (startPose.space === 'device') {
    // Retrace: out of the cross-section onto the wafer it came from (or the machine, if the wafer
    // is not in it at the moment), then on to the new framing.
    const origin = o.from ?? o.to;
    const onWafer = makePose();
    const onDie = !origin || waferShown(origin);
    if (onDie) resolve({ kind: 'wafer', framing: 'die' }, { station: origin }, onWafer);
    // (round four) back to a framing of the machine the layers belong to: fade straight into it
    // rather than out to the machine's establishing shot and in again
    else if (origin === o.to && probe.space === 'world') copyPose(onWafer, probe);
    else machinePose(origin, onWafer);
    o.fit(onWafer);
    legs.push({ dur: 1.1, eval: (u, out) => deviceToWorld(startPose, onWafer, u, origin, out) });
    if (onDie && origin && o.to && origin !== o.to && !TOOL_POSES[origin].leaveUp) {
      // (round four) leaving for another machine from your die, inside this one: out the way the
      // camera comes in to inspect the layers — to the machine's own framing, from which the die
      // framing is taken — and travel from there. Backing out along the line of sight from the
      // die went through the develop module's cover and the polisher's upper works, and stayed
      // inside the furnace's tower (the whole course, walked move by move). A machine whose die
      // has nothing above it but the opened housing leaves upward instead (`leaveUp`: the etch
      // cluster's load lock), as from any other close view of the wafer (worldPath).
      const home = resolve({ kind: 'shot', name: 'establish' }, { station: origin }, makePose());
      o.fit(home);
      legs.push(directLeg(onWafer, () => home));
      worldPath(home);
    } else worldPath(onWafer);
  } else {
    // Down to the wafer, pick out your die, then reveal the cross-section. If the wafer is not
    // in this machine at the moment (it is in another tool for this part of the step), the
    // cross-section is revealed from the machine itself rather than from an empty holder.
    const anchor = makePose();
    if (!o.to || waferShown(o.to)) resolve({ kind: 'wafer', framing: 'die' }, { station: o.to }, anchor);
    // (round four) already at the machine: reveal the layers from where the camera is, instead of
    // flying out to the machine's establishing shot (through the aisle, past a blank wall)
    else if (o.from === o.to) copyPose(anchor, startPose);
    else machinePose(o.to, anchor);
    o.fit(anchor);
    const from = worldPath(startPose);
    legs.pop();
    // (from the establishing shot, straight in, as to any other framing of the machine)
    if (from.pos.distanceTo(anchor.pos) > 0.05) legs.push(o.establish && o.to ? directLeg(from, () => anchor) : worldLeg(from, () => anchor));
    legs.push({ dur: 1.2, eval: (u, out) => worldToDevice(anchor, target(), u, o.to, out) });
  }
  return legs;
}

/**
 * When, in seconds from the start of a move, the learner's wafer changes hands: halfway along
 * the first leg that travels between machines (the camera is in the aisle, looking along it),
 * or halfway through the move if none does.
 */
export function handoverAt(legs: Leg[]): number {
  let t = 0;
  for (const l of legs) {
    if (l.between) return t + l.dur / 2;
    t += l.dur;
  }
  return t / 2;
}

/** The leg a move is in at time t (seconds from the start); null once past the end. */
export function legAt(legs: Leg[], t: number): Leg | null {
  for (const leg of legs) {
    if (t < leg.dur) return leg;
    t -= leg.dur;
  }
  return null;
}

/** Evaluate a list of legs at time t (seconds from the start); returns false once past the end. */
export function evalLegs(legs: Leg[], t: number, out: CamSample): boolean {
  t = Math.max(0, t);
  for (const leg of legs) {
    if (t < leg.dur) {
      leg.eval(leg.dur > 0 ? t / leg.dur : 1, out);
      return true;
    }
    t -= leg.dur;
  }
  if (legs.length) legs[legs.length - 1].eval(1, out);
  return false;
}
