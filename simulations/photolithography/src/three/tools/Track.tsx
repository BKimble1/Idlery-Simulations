/**
 * Coater/developer track (round four; reference-informed, no manufacturer's design). As in the
 * bay model (Fab.tsx, `track`), the track is a row of blocks: a carrier block at the west end
 * behind its load ports, the process block, and an interface block at the east end that hands
 * wafers to the scanner beside it and takes exposed ones back.
 *
 * The process block's working tier is one line of modules — vapour prime, resist coat, the
 * soft-bake plate, develop, and the post-exposure-bake plate beside the interface — served by
 * one transfer robot on a rail along the front, drawn with their fronts cut away. Above it and
 * behind it the block is full of the modules a production track stacks (more coat and develop
 * cups, towers of hot and chill plates), drawn closed. Real tracks reach stacked modules with
 * robots that also lift and turn; the single line is a labelled schematic.
 *
 * One wafer: the learner's wafer is a single object that the robot carries from module to
 * module. Each lesson starts where the previous one on this machine left it (prime → coat →
 * soft bake; post-exposure bake → develop), and arrives from the carrier block or from the
 * scanner interface when it comes from another machine. Spin chucks rise above their cup for
 * the exchange and hot plates lift the wafer on pins; spins stop on a whole turn, so the wafer
 * is picked up exactly as it lies (trackMotion.ts, unit-tested).
 *
 * What moves, and when, is a pure function of the step progress, so replay and scrubbing are
 * exact. The resist's thin-film colours are computed from its thickness, including the
 * spin-speed experiment. The liquids (resist, solvent, developer, rinse water) are drawn where
 * they are real and visible: a stream from the nozzle, a puddle that spreads and thins, the
 * developer laid across the wafer by a scanning nozzle. See ACCURACY.md.
 */
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import type { StepId } from '../../sim/flow';
import { spinModel } from '../../sim/flow';
import { RESIST_RECIPES } from '../../sim/ops';
import { useSimState, useStep } from '../../state/sim';
import { ease, lerp, seg, smooth, useProgressFrame } from '../anim';
import { MAT } from '../materials';
import { Chuck, Cyl, StandaloneOnly } from '../kit/parts';
import { Merged, type MergeBuilder } from '../kit/merged';
import { makeLiveCoat, Wafer, WaferFraming } from '../wafer/Wafer';
import type { ToolProps } from './index';
import { useRunChoices } from '../../state/presentation';

import { DECK_Y, makeFrame, MOD_X, REST, ROUTES, spinProfile, transfer, XCHG, type Mod, type Route } from './trackMotion';

type V2 = [number, number];

// ───────────────────────────── layout (tool frame, metres) ─────────────────────────────
//
// x along the track (carrier block west, interface block east), z toward the aisle, y up. The
// bay housing's inside spans x −2.62 … 3.32, z −1.57 … 0.57 and y 0.13 … 2.32 (Fab.tsx, `track`,
// hollow, mounted by poses/track.ts); its front and roof open above y 0.86 in front of z −0.38.

const X0 = -2.62;
const X1 = 3.32;
const ZF = 0.57;
const TOP = 2.32;
/** Block partitions: carrier | process | interface. */
const XP = -1.46;
const XI = 2.06;
/** A working-tier cell: 0.64 wide, 0.66 deep, 0.58 high above the deck. */
const CW = 0.64;
const CD = 0.66;
const CH = 0.58;
/** The robot's rail, along the front of the cells. */
const RAIL_Z = 0.43;
/** Upper tier of closed modules, above the working cells. */
const UP0 = DECK_Y + CH + 0.05;
const UP1 = UP0 + 0.42;

/** Heading (rotation.y) that points local +x from `a` to `b` (x, z). */
const heading = (a: V2, b: V2) => Math.atan2(-(b[1] - a[1]), b[0] - a[0]);
const dist2 = (a: V2, b: V2) => Math.hypot(b[0] - a[0], b[1] - a[1]);

// ───────────────────────────── local finishes ─────────────────────────────

/** Coater and developer cups: white fluoropolymer, satin. */
const PFA = new THREE.MeshStandardMaterial({ color: '#e9ebe7', metalness: 0, roughness: 0.34 });
const PFA_DARK = new THREE.MeshStandardMaterial({ color: '#b9bdb9', metalness: 0, roughness: 0.4 });
/** Hot plates: machined aluminium, a little warmer than the frame. */
const PLATE = new THREE.MeshStandardMaterial({ color: '#cfd0cc', metalness: 0.8, roughness: 0.34 });
/** Liquid resist (the app's resist colour, pale: real DUV resist is nearly colourless). */
const RESIST = new THREE.MeshPhysicalMaterial({ color: '#cbbdff', metalness: 0, roughness: 0.03, transparent: true, opacity: 0.78, clearcoat: 1, clearcoatRoughness: 0.03, depthWrite: false });
/** Solvent and rinse water: clear, a hint of blue. */
const CLEAR = new THREE.MeshPhysicalMaterial({ color: '#e6f3ff', metalness: 0, roughness: 0.02, transparent: true, opacity: 0.5, clearcoat: 1, clearcoatRoughness: 0.02, depthWrite: false });
/** Developer lying on the wafer: a clear liquid seen by its sheen and its slight blue tint. */
const DEVELOPER = new THREE.MeshPhysicalMaterial({ color: '#cfe3f7', metalness: 0, roughness: 0.02, transparent: true, opacity: 0.66, clearcoat: 1, clearcoatRoughness: 0.01, depthWrite: false });
/** The filter face under each cell's ceiling (downflow). */
function filterTexture() {
  const n = 128;
  const c = document.createElement('canvas');
  c.width = c.height = n;
  const g = c.getContext('2d')!;
  g.fillStyle = '#e7e9eb';
  g.fillRect(0, 0, n, n);
  g.fillStyle = '#b8bcc2';
  for (let y = 4; y < n; y += 8) for (let x = 4 + ((y / 8) % 2) * 4; x < n; x += 8) g.fillRect(x - 1, y - 1, 2, 2);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(4, 4);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

// ───────────────────────────── the fixed structure (merged) ─────────────────────────────

/** One working cell's walls, ceiling and back panel; its cut front edges drawn as sections. */
function cell(b: MergeBuilder, x: number) {
  const y0 = DECK_Y;
  const y1 = DECK_Y + CH;
  const zb = -CD / 2;
  const zf = CD / 2;
  // back panel with an exhaust grille and a label plate
  b.box('panelGray', [CW + 0.02, CH, 0.02], [x, (y0 + y1) / 2, zb - 0.01], 0.003);
  for (let i = 0; i < 6; i++) b.box('black', [CW * 0.62, 0.006, 0.008], [x, y1 - 0.07 - i * 0.017, zb + 0.004]);
  b.box('panelDark', [0.11, 0.03, 0.006], [x + CW * 0.3, y0 + 0.11, zb + 0.004], 0.002);
  // side walls, cut back on a diagonal from the ceiling's back edge to a low sill at the front
  // (the cutaway opens the cell toward the aisle and from above), and the ceiling (its filter
  // face inset beneath it: see CellFilters)
  for (const s of [-1, 1]) {
    b.add('panelGray', sideWall().translate(x + s * (CW / 2 + 0.01), 0, 0));
    b.add(MAT.section, sideCut().translate(x + s * (CW / 2 + 0.01), 0, 0));
  }
  b.box('panel', [CW + 0.04, 0.03, CD], [x, y1 + 0.015, 0], 0.004);
  // the cut: the ceiling's front edge, drawn as a section
  b.box(MAT.section, [CW + 0.04, 0.031, 0.003], [x, y1 + 0.015, zf + 0.0016]);
  // a shutter rail across the (removed) front, at the deck: where the robot's arm reaches in
  b.box('steelDark', [CW, 0.012, 0.02], [x, y0 + 0.006, zf - 0.01], 0.002);
}

/** A cell's side wall (0.02 thick), cut on a diagonal: full depth at the deck, a quarter of it at the ceiling. */
const WALL_SILL = 0.07;
const WALL_TOP = 0.16;
function sideWall(): THREE.BufferGeometry {
  const zb = -CD / 2;
  const zf = CD / 2;
  // the profile in (−z, y), extruded along +z, then turned a quarter about y: (−z, y, e) → (e, y, z)
  const sh = new THREE.Shape();
  sh.moveTo(-zb, DECK_Y);
  sh.lineTo(-zb, DECK_Y + CH);
  sh.lineTo(-(zb + WALL_TOP), DECK_Y + CH);
  sh.lineTo(-zf, DECK_Y + WALL_SILL);
  sh.lineTo(-zf, DECK_Y);
  sh.closePath();
  const g = new THREE.ExtrudeGeometry(sh, { depth: 0.02, bevelEnabled: false });
  g.rotateY(Math.PI / 2);
  g.translate(-0.01, 0, 0);
  return g;
}
/** The diagonal cut edge of a side wall, drawn as a section (a thin strip along it). */
function sideCut(): THREE.BufferGeometry {
  const a = new THREE.Vector3(0, DECK_Y + WALL_SILL, CD / 2);
  const b = new THREE.Vector3(0, DECK_Y + CH, -CD / 2 + WALL_TOP);
  const len = a.distanceTo(b);
  const g = new THREE.BoxGeometry(0.021, 0.004, len);
  g.rotateX(Math.atan2(b.y - a.y, -(b.z - a.z)));
  g.translate(0, (a.y + b.y) / 2 + 0.0015, (a.z + b.z) / 2 + 0.0015);
  return g;
}

/** A closed module above the working tier: a spin module (coat or develop cup) or a stack of plates. */
function upperModule(b: MergeBuilder, x: number, kind: 'spin' | 'plates') {
  const zf = CD / 2;
  b.box('panel', [CW + 0.04, UP1 - UP0, CD], [x, (UP0 + UP1) / 2, 0], 0.006);
  if (kind === 'spin') {
    // the loading shutter (closed), a service panel and a label
    b.box('panelGray', [CW * 0.8, 0.05, 0.006], [x, UP0 + 0.1, zf + 0.003], 0.003);
    b.box('black', [CW * 0.62, 0.012, 0.004], [x, UP0 + 0.1, zf + 0.007]);
    b.box('panelGray', [CW * 0.8, 0.2, 0.004], [x, UP0 + 0.27, zf + 0.002], 0.004);
    b.box('panelDark', [0.1, 0.026, 0.006], [x - CW * 0.28, UP1 - 0.05, zf + 0.004], 0.002);
  } else {
    // three plate units stacked, each with its loading slot
    for (let i = 0; i < 3; i++) {
      const y = UP0 + 0.07 + i * 0.13;
      b.box('panelGray', [CW * 0.84, 0.11, 0.006], [x, y, zf + 0.003], 0.003);
      b.box('black', [CW * 0.6, 0.01, 0.004], [x, y - 0.02, zf + 0.007]);
      b.box('panelDark', [0.06, 0.018, 0.006], [x + CW * 0.32, y + 0.03, zf + 0.006], 0.002);
    }
  }
}

function Structure() {
  return (
    <Merged
      build={(b) => {
        // deck over the chemical cabinets, from the carrier block to the interface block
        b.box('panelGray', [X1 - X0, DECK_Y - 0.03 - 0.13, ZF + 0.45], [(X0 + X1) / 2, (0.13 + DECK_Y - 0.03) / 2, (ZF - 0.45) / 2]);
        b.box('steelSatin', [X1 - X0, 0.03, ZF + 0.45], [(X0 + X1) / 2, DECK_Y - 0.015, (ZF - 0.45) / 2], 0.004);
        // the rail and its cover along the front
        b.box('steelDark', [4.6, 0.02, 0.06], [0.33, DECK_Y + 0.01, RAIL_Z], 0.004);
        b.box('black', [4.6, 0.012, 0.03], [0.33, DECK_Y + 0.026, RAIL_Z], 0.002);
        // working cells, and the closed modules stacked above them
        for (const m of Object.keys(MOD_X) as Mod[]) {
          cell(b, MOD_X[m]);
          upperModule(b, MOD_X[m], m === 'coat' || m === 'develop' ? 'spin' : 'plates');
        }
        // exhaust plenum over the process block; its grilles
        b.box('panelGray', [XI - XP, TOP - UP1 - 0.04, CD + 0.06], [(XP + XI) / 2, (UP1 + 0.02 + TOP - 0.02) / 2, 0], 0.006);
        for (let i = 0; i < 5; i++) b.box('black', [XI - XP - 0.3, 0.008, 0.006], [(XP + XI) / 2, UP1 + 0.08 + i * 0.035, CD / 2 + 0.035]);
        // behind the cells: towers of hot and chill plates, drawn closed
        for (let i = 0; i < 5; i++) {
          const x = XP + 0.36 + i * 0.7;
          b.box('panel', [0.66, TOP - 0.02 - DECK_Y, 0.95], [x, (DECK_Y + TOP - 0.02) / 2, -0.94], 0.008);
          for (let k = 0; k < 7; k++) b.box('black', [0.44, 0.008, 0.004], [x, DECK_Y + 0.12 + k * 0.19, -0.46]);
        }
        // partitions between the blocks, each with a passage for the robot at the deck
        for (const x of [XP, XI]) {
          b.box('panel', [0.03, TOP - DECK_Y - 0.26, ZF + 1.2], [x, (DECK_Y + 0.26 + TOP) / 2, (ZF - 1.2) / 2], 0.004);
          b.box('panel', [0.03, 0.26, ZF + 1.2 - 0.42], [x, DECK_Y + 0.13, (ZF - 1.2 - 0.42) / 2], 0.004);
          b.box(MAT.section, [0.031, TOP - DECK_Y, 0.003], [x, (DECK_Y + TOP) / 2, ZF + 0.0015]);
        }
        // ── carrier block: the pods' openers behind the load ports, the carrier robot, a buffer ──
        for (const [i, px] of [-2.27, -1.75].entries()) {
          // the opener's door, lowered for the port in use, closed for the other
          b.box('steelSatin', [0.4, 0.34, 0.02], [px, i === 1 ? DECK_Y - 0.08 : DECK_Y + 0.22, ZF - 0.03], 0.004);
          b.box('panelGray', [0.44, 0.03, 0.12], [px, DECK_Y + 0.015, ZF - 0.08], 0.003);
        }
        b.cyl('panel', 0.07, 0.16, [-2.25, DECK_Y + 0.08, -0.12], 32);
        b.box('panel', [0.24, 0.035, 0.07], [-2.14, DECK_Y + 0.18, -0.12], 0.012, [0, -0.5, 0]);
        b.box('panel', [0.2, 0.03, 0.06], [-1.97, DECK_Y + 0.21, -0.04], 0.01, [0, 0.9, 0]);
        b.box('panel', [0.5, 0.9, 0.5], [-2.25, DECK_Y + 0.45 + 0.4, -1.1], 0.01);
        // ── interface block: interface robot, the buffer, the edge-exposure unit, the port to the scanner ──
        b.cyl('panel', 0.07, 0.16, [2.78, DECK_Y + 0.08, -0.1], 32);
        b.box('panel', [0.24, 0.035, 0.07], [2.66, DECK_Y + 0.18, -0.1], 0.012, [0, 0.6, 0]);
        b.box('panel', [0.3, 0.8, 0.36], [2.72, DECK_Y + 0.4, -0.8], 0.008);
        for (let k = 0; k < 8; k++) b.box('steelDark', [0.26, 0.004, 0.3], [2.72, DECK_Y + 0.1 + k * 0.08, -0.62]);
        b.box('panelGray', [0.36, 0.26, 0.3], [2.62, DECK_Y + 0.13, -1.3], 0.008);
        b.box('black', [0.2, 0.02, 0.004], [2.62, DECK_Y + 0.16, -1.148]);
        b.box('black', [0.012, 0.09, 0.34], [X1 - 0.006, DECK_Y + 0.07, 0.12]);
        b.box('steelSatin', [0.03, 0.16, 0.44], [X1 - 0.015, DECK_Y + 0.07, 0.12], 0.004);
      }}
    />
  );
}

/** The filter face under each cell's ceiling: downflow from the fan-filter units above. */
function CellFilters() {
  const tex = useMemo(filterTexture, []);
  const mat = useMemo(() => new THREE.MeshStandardMaterial({ map: tex, roughness: 0.7, metalness: 0 }), [tex]);
  const geo = useMemo(() => new THREE.PlaneGeometry(CW - 0.02, CD - 0.06), []);
  useEffect(
    () => () => {
      tex.dispose();
      mat.dispose();
      geo.dispose();
    },
    [tex, mat, geo],
  );
  return (
    <group>
      {Object.values(MOD_X).map((x) => (
        <mesh key={x} geometry={geo} material={mat} position={[x, DECK_Y + CH - 0.001, -0.02]} rotation={[Math.PI / 2, 0, 0]} receiveShadow />
      ))}
    </group>
  );
}

// ───────────────────────────── the robot ─────────────────────────────

/** End effector: a flat ceramic fork, open toward the module (−z), top face at y = 0. */
function forkGeometry() {
  const s = new THREE.Shape();
  // (x, toward the module) in shape coordinates, the wafer's centre at the origin; the tines
  // straddle a spin chuck (r 0.06) and pass outside the lift pins (r 0.07)
  s.moveTo(-0.1, -0.165);
  s.lineTo(0.1, -0.165);
  s.lineTo(0.1, -0.12);
  s.lineTo(0.092, -0.11);
  s.lineTo(0.092, 0.12);
  s.quadraticCurveTo(0.092, 0.135, 0.078, 0.135);
  s.lineTo(0.068, 0.135);
  s.lineTo(0.068, -0.085);
  s.lineTo(-0.068, -0.085);
  s.lineTo(-0.068, 0.135);
  s.lineTo(-0.078, 0.135);
  s.quadraticCurveTo(-0.092, 0.135, -0.092, 0.12);
  s.lineTo(-0.092, -0.11);
  s.lineTo(-0.1, -0.12);
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: 0.004, bevelEnabled: false });
  // shape y → −z (toward the module), extrusion → +y (0 … 0.004)
  g.rotateX(-Math.PI / 2);
  return g;
}

/** The transfer robot: a carriage on the rail, a lifting column, an arm and the fork. */
function Robot({ route }: { route: Route }) {
  const carriage = useRef<THREE.Group>(null);
  const fork = useRef<THREE.Group>(null);
  const arm = useRef<THREE.Mesh>(null);
  const lift = useRef<THREE.Mesh>(null);
  const f = useMemo(makeFrame, []);
  const forkGeo = useMemo(forkGeometry, []);
  useEffect(() => () => forkGeo.dispose(), [forkGeo]);
  useProgressFrame((p) => {
    transfer(route, p, f);
    if (carriage.current) carriage.current.position.x = f.x;
    if (fork.current) fork.current.position.set(0, f.forkY, f.forkZ);
    if (lift.current) lift.current.position.y = f.forkY - 0.02;
    if (arm.current) {
      // the arm reaches from the column (z RAIL_Z) to the back of the fork
      const back = f.forkZ + 0.16;
      const len = Math.max(0.02, RAIL_Z - back);
      arm.current.scale.z = len;
      arm.current.position.set(0, f.forkY - 0.009, back + len / 2);
    }
  });
  return (
    <group ref={carriage}>
      <mesh position={[0, DECK_Y + 0.045, RAIL_Z]} material={MAT.panelGray} castShadow>
        <boxGeometry args={[0.18, 0.03, 0.1]} />
      </mesh>
      {/* the lifting column and its carriage */}
      <mesh position={[0, DECK_Y + 0.11, RAIL_Z + 0.02]} material={MAT.panel} castShadow>
        <boxGeometry args={[0.07, 0.14, 0.05]} />
      </mesh>
      <mesh ref={lift} position={[0, DECK_Y + 0.1, RAIL_Z]} material={MAT.steelSatin} castShadow>
        <boxGeometry args={[0.09, 0.03, 0.07]} />
      </mesh>
      <mesh ref={arm} material={MAT.steelSatin} castShadow>
        <boxGeometry args={[0.05, 0.01, 1]} />
      </mesh>
      <group ref={fork}>
        <mesh geometry={forkGeo} material={MAT.ceramic} position={[0, -0.004, 0]} castShadow />
        <mesh position={[0, -0.009, 0.15]} material={MAT.black} castShadow>
          <boxGeometry args={[0.1, 0.012, 0.03]} />
        </mesh>
      </group>
    </group>
  );
}

// ───────────────────────────── the learner's wafer ─────────────────────────────

/** Coat: dispense 0.23–0.32 (stationary), spread 0.32–0.40, thin 0.40–0.72 (the coat
 * operation), edge-bead removal 0.77–0.83. */
const COAT = { dispense: [0.23, 0.32] as V2, spread: [0.32, 0.4] as V2, thin: [0.4, 0.72] as V2, ebr: [0.77, 0.83] as V2 };

/** The learner's wafer, wherever the robot has it; spinning with the chuck in a cup. */
function TrackWafer({ route, stepId }: { route: Route; stepId: StepId }) {
  const state = useSimState();
  const spin = useRunChoices().spin;
  const sp = spinModel(spin);
  const finalNm = RESIST_RECIPES.fine.nm * sp.tRel;
  const coating = stepId === 'coat';
  const developing = stepId === 'develop';
  const live = useMemo(makeLiveCoat, []);
  const coatSpin = useMemo(() => spinProfile(0.31, 0.39, 0.84, 0.97, 5 + 7 * sp.speedRel, 12), [sp.speedRel]);
  const devSpin = useMemo(() => spinProfile(0.58, 0.64, 0.9, 0.98, 10, 10), []);
  const place = useRef<THREE.Group>(null);
  const turn = useRef<THREE.Group>(null);
  const f = useMemo(makeFrame, []);
  useProgressFrame((p) => {
    transfer(route, p, f);
    place.current?.position.set(f.wafer[0], f.wafer[1], f.wafer[2]);
    if (turn.current) turn.current.rotation.y = coating ? coatSpin(p) : developing ? devSpin(p) : 0;
    // the coat going on (presentation interpolation between the process model's states; it
    // ends on the simulated film at the coat operation, p = 0.72)
    live.on = coating;
    if (!coating) return;
    if (p < COAT.dispense[0]) Object.assign(live, { coverage: 0, nm: 0, edgeRise: 0, rim: 0, ebr: 0 });
    else if (p < COAT.dispense[1]) Object.assign(live, { coverage: 0.08 + 0.3 * seg(p, ...COAT.dispense), nm: 6000, edgeRise: 0, rim: 0, ebr: 0 });
    else if (p < COAT.spread[1]) {
      const t = seg(p, ...COAT.spread);
      Object.assign(live, { coverage: lerp(0.38, 1, ease(t)), nm: lerp(4000, 900, t), edgeRise: sp.edgeRise, rim: 1 - t * 0.4, ebr: 0 });
    } else {
      const t = seg(p, ...COAT.thin);
      Object.assign(live, { coverage: 1, nm: finalNm * (1 + 2.8 * (1 - t) ** 2), edgeRise: sp.edgeRise, rim: 0.6 * (1 - t), ebr: seg(p, ...COAT.ebr) });
    }
  });
  // while the coat is going on, the texture shows the surface beneath it (the shader adds the film)
  const summary = coating ? { ...state.wafer, resist: null } : state.wafer;
  return (
    <group ref={place}>
      {/* shots frame the wafer where it is, but do not turn with the spin */}
      <WaferFraming />
      <group ref={turn}>
        <Wafer anchor look={{ summary, showParticles: true, developedPattern: developing && state.wafer.resist?.phase === 'developed' }} live={coating ? live : undefined} size={768} />
      </group>
    </group>
  );
}

// ───────────────────────────── spin modules ─────────────────────────────

/** The cup, in section (r, height above the deck): outer wall, an inward lip over the wafer's
 * edge, the splash guard below it and the drain floor. */
const CUP: V2[] = [
  [0.045, 0],
  [0.2, 0],
  [0.214, 0.01],
  [0.214, 0.056],
  [0.206, 0.066],
  [0.188, 0.071],
  [0.168, 0.068],
  [0.166, 0.062],
  [0.19, 0.051],
  [0.197, 0.036],
  [0.197, 0.014],
  [0.07, 0.01],
  [0.045, 0.012],
];
/** Top of the cup's rim above the floor. */
const CUP_RIM = DECK_Y + 0.071;
const GUARD: V2[] = [
  [0.118, 0.012],
  [0.152, 0.012],
  [0.156, 0.03],
  [0.146, 0.04],
  [0.126, 0.026],
];

function Cup() {
  return (
    <Merged
      build={(b) => {
        b.lathe(PFA, CUP, [0, DECK_Y, 0], 72);
        b.lathe(PFA_DARK, GUARD, [0, DECK_Y, 0], 64);
        // drain and exhaust stubs into the deck at the back
        b.cyl('steelSatin', 0.016, 0.05, [-0.12, DECK_Y - 0.02, -0.19], 16);
        b.cyl('steelSatin', 0.022, 0.05, [0.12, DECK_Y - 0.02, -0.19], 16);
      }}
    />
  );
}

/** A spin chuck that rises above its cup for an exchange and turns with the wafer. */
function useChuck(mod: 'coat' | 'develop', route: Route, spinAt: ((p: number) => number) | null) {
  const g = useRef<THREE.Group>(null);
  const f = useMemo(makeFrame, []);
  useProgressFrame((p) => {
    transfer(route, p, f);
    if (!g.current) return;
    g.current.position.y = lerp(REST[mod], XCHG[mod], f.lift[mod]);
    g.current.rotation.y = spinAt ? spinAt(p) : 0;
  });
  return g;
}

/** A swing arm on a post: turns from `park` to `over` (points in the module's frame). */
function useSwing(pivot: V2, park: V2, over: V2) {
  return useMemo(() => ({ park: heading(pivot, park), over: heading(pivot, over), len: dist2(pivot, over) }), [pivot, park, over]);
}

// resist arm: its post at the back left, the nozzle holder resting in the solvent bath at the left
const R_PIVOT: V2 = [-0.235, -0.215];
const R_BATH: V2 = [-0.272, 0.1];
// edge-bead-removal arm: its post at the back right, the nozzle over the wafer's edge
const E_PIVOT: V2 = [0.245, -0.2];
const E_OVER: V2 = [0.146, 0.012];
const E_PARK: V2 = [0.29, 0.02];
/** Height of the dispense nozzles' tips above the deck: 2.5 cm over the wafer, clear of the
 * cup's rim (the edge-bead-removal jet's too). */
const TIP_Y = REST.coat + 0.0016 + 0.025 - DECK_Y;
const E_TIP_Y = CUP_RIM + 0.006 - DECK_Y;
/** The solvent jet from the edge-bead-removal nozzle down to the wafer. */
const E_JET = E_TIP_Y - (REST.coat + 0.0016 - DECK_Y);

function CoatModule({ route, active }: { route: Route; active: boolean }) {
  const { id } = useStep();
  const spin = useRunChoices().spin;
  const sp = spinModel(spin);
  const coating = active && id === 'coat';
  const coatSpin = useMemo(() => spinProfile(0.31, 0.39, 0.84, 0.97, 5 + 7 * sp.speedRel, 12), [sp.speedRel]);
  const chuck = useChuck('coat', route, coating ? coatSpin : null);
  const arm = useRef<THREE.Group>(null);
  const ebr = useRef<THREE.Group>(null);
  const stream = useRef<THREE.Mesh>(null);
  const ebrStream = useRef<THREE.Mesh>(null);
  const puddle = useRef<THREE.Mesh>(null);
  const R = useSwing(R_PIVOT, R_BATH, [0, 0]);
  const E = useSwing(E_PIVOT, E_PARK, E_OVER);
  const puddleGeo = useMemo(() => meniscus(), []);
  useEffect(() => () => puddleGeo.dispose(), [puddleGeo]);

  useProgressFrame((p) => {
    if (arm.current) {
      const out = coating ? smooth(p, 0.19, 0.24) * (1 - smooth(p, 0.32, 0.38)) : 0;
      arm.current.rotation.y = lerp(R.park, R.over, out);
    }
    if (ebr.current) {
      const out = coating ? smooth(p, 0.7, 0.76) * (1 - smooth(p, 0.84, 0.9)) : 0;
      ebr.current.rotation.y = lerp(E.park, E.over, out);
    }
    if (stream.current) stream.current.visible = coating && p > COAT.dispense[0] && p < COAT.dispense[1];
    if (ebrStream.current) ebrStream.current.visible = coating && p > COAT.ebr[0] - 0.005 && p < COAT.ebr[1] + 0.005;
    // the puddle: a lens of liquid that grows while the resist is dispensed, then spreads out
    // and thins into the film (which the wafer's shader draws from here on)
    if (puddle.current) {
      let r = 0;
      let h = 0;
      if (coating && p > COAT.dispense[0] && p < COAT.spread[1]) {
        if (p < COAT.dispense[1]) {
          r = 0.15 * (0.08 + 0.3 * seg(p, ...COAT.dispense));
          h = 0.0022;
        } else {
          const t = seg(p, ...COAT.spread);
          r = 0.15 * lerp(0.38, 1, ease(t));
          h = 0.0022 * (1 - t) ** 2;
        }
      }
      puddle.current.visible = r > 0 && h > 0.00005;
      puddle.current.scale.set(r, h, r);
    }
  });

  return (
    <group position={[MOD_X.coat, 0, 0]}>
      <Cup />
      <group ref={chuck} position={[0, REST.coat, 0]}>
        <Chuck radius={0.06} position={[0, -0.008, 0]} />
        {/* the puddle turns with the wafer (it sits on it) */}
        <mesh ref={puddle} geometry={puddleGeo} material={RESIST} position={[0, 0.0016, 0]} visible={false} renderOrder={2} />
      </group>
      {/* solvent bath where the resist nozzles wait (so resist cannot dry at their tips) */}
      <Merged
        build={(b) => {
          b.box('panelGray', [0.08, TIP_Y - 0.004, 0.08], [R_BATH[0], DECK_Y + (TIP_Y - 0.004) / 2, R_BATH[1] + 0.011], 0.006);
          b.box('black', [0.06, 0.004, 0.06], [R_BATH[0], DECK_Y + TIP_Y - 0.004, R_BATH[1] + 0.011]);
          // arm posts and their drives
          b.cyl('steelDark', 0.016, 0.1, [R_PIVOT[0], DECK_Y + 0.05, R_PIVOT[1]], 20);
          b.cyl('panelGray', 0.028, 0.03, [R_PIVOT[0], DECK_Y + 0.015, R_PIVOT[1]], 24);
          b.cyl('steelDark', 0.012, 0.09, [E_PIVOT[0], DECK_Y + 0.045, E_PIVOT[1]], 20);
          b.cyl('panelGray', 0.022, 0.03, [E_PIVOT[0], DECK_Y + 0.015, E_PIVOT[1]], 24);
        }}
      />
      {/* resist arm: a nozzle holder with four nozzles (one per resist line); the second dispenses */}
      <group position={[R_PIVOT[0], DECK_Y + TIP_Y + 0.051, R_PIVOT[1]]}>
        <group ref={arm} rotation={[0, R.park, 0]}>
          <mesh position={[R.len / 2 - 0.02, 0, 0]} material={MAT.steelSatin} castShadow>
            <boxGeometry args={[R.len + 0.02, 0.014, 0.02]} />
          </mesh>
          <mesh position={[R.len, -0.016, 0.011]} material={MAT.panel} castShadow>
            <boxGeometry args={[0.03, 0.028, 0.07]} />
          </mesh>
          {[-0.011, 0.011, 0.033, 0.055].map((dz) => (
            <mesh key={dz} position={[R.len, -0.04, dz - 0.011]} material={MAT.chrome}>
              <cylinderGeometry args={[0.0024, 0.0018, 0.022, 10]} />
            </mesh>
          ))}
          {/* the stream of resist from the nozzle tip to the wafer */}
          <mesh ref={stream} position={[R.len, -0.051 - 0.0125, 0]} material={RESIST} visible={false}>
            <cylinderGeometry args={[0.0017, 0.0021, 0.025, 12]} />
          </mesh>
        </group>
      </group>
      {/* edge-bead-removal arm: a solvent jet at the wafer's edge while it spins */}
      <group position={[E_PIVOT[0], DECK_Y + E_TIP_Y + 0.032, E_PIVOT[1]]}>
        <group ref={ebr} rotation={[0, E.park, 0]}>
          <mesh position={[E.len / 2 - 0.01, 0, 0]} material={MAT.steelSatin} castShadow>
            <boxGeometry args={[E.len + 0.01, 0.01, 0.014]} />
          </mesh>
          <mesh position={[E.len, -0.018, 0]} material={MAT.chrome}>
            <cylinderGeometry args={[0.002, 0.0016, 0.028, 10]} />
          </mesh>
          <mesh ref={ebrStream} position={[E.len, -0.032 - E_JET / 2, 0]} material={CLEAR} visible={false}>
            <cylinderGeometry args={[0.0006, 0.0008, E_JET, 8]} />
          </mesh>
        </group>
      </group>
    </group>
  );
}

/** A liquid lens of unit radius and height: flat under, a meniscus above (scaled per frame). */
function meniscus(): THREE.BufferGeometry {
  const pts: THREE.Vector2[] = [];
  const n = 14;
  for (let i = 0; i <= n; i++) {
    const r = i / n;
    // a flattened dome that meets the surface at its edge
    pts.push(new THREE.Vector2(r, Math.pow(Math.max(0, 1 - Math.pow(r, 6)), 0.5)));
  }
  pts.push(new THREE.Vector2(1, 0));
  return new THREE.LatheGeometry(pts, 64);
}

// develop: the scanning nozzle's rail at the right, the rinse arm's post at the back right
const DEV_RAIL_X = 0.285;
const D_PIVOT: V2 = [0.24, -0.225];
const D_PARK: V2 = [0.27, 0.06];
/** The developer nozzle scans across the wafer (−z → +z) while it lays the puddle. */
const SCAN = { from: -0.24, to: 0.24, a: 0.23, b: 0.43 };
/** From the developer slit (just clear of the cup's rim) to the wafer. */
const CURTAIN = DECK_Y + 0.085 - 0.012 - (REST.develop + 0.0016);

function DevelopModule({ route, active }: { route: Route; active: boolean }) {
  const { id } = useStep();
  const developing = active && id === 'develop';
  const devSpin = useMemo(() => spinProfile(0.58, 0.64, 0.9, 0.98, 10, 10), []);
  const chuck = useChuck('develop', route, developing ? devSpin : null);
  const bar = useRef<THREE.Group>(null);
  const curtain = useRef<THREE.Mesh>(null);
  const puddle = useRef<THREE.Mesh>(null);
  const rinseArm = useRef<THREE.Group>(null);
  const rinse = useRef<THREE.Mesh>(null);
  const D = useSwing(D_PIVOT, D_PARK, [0, 0]);
  // the puddle is laid behind the nozzle as it scans: a clipping plane at the nozzle keeps the
  // part it has passed over (the plane is in the world, so it is placed from the module's frame)
  const clip = useMemo(() => new THREE.Plane(), []);
  const puddleMat = useMemo(() => {
    const m = DEVELOPER.clone();
    m.clippingPlanes = [clip];
    return m;
  }, [clip]);
  useEffect(() => () => puddleMat.dispose(), [puddleMat]);
  const puddleGeo = useMemo(() => meniscus(), []);
  useEffect(() => () => puddleGeo.dispose(), [puddleGeo]);
  const frame = useRef<THREE.Group>(null);
  const tmp = useMemo(() => ({ n: new THREE.Vector3(), p: new THREE.Vector3(), m: new THREE.Matrix3() }), []);

  useProgressFrame((p) => {
    const scan = developing ? seg(p, SCAN.a, SCAN.b) : 0;
    const z = lerp(SCAN.from, SCAN.to, smooth(p, SCAN.a, SCAN.b));
    const scanning = developing && p > SCAN.a - 0.01 && p < SCAN.b + 0.03;
    if (bar.current) {
      bar.current.position.z = developing ? (p < SCAN.b + 0.03 ? z : lerp(SCAN.to, SCAN.from, smooth(p, 0.47, 0.56))) : SCAN.from;
      bar.current.visible = true;
    }
    if (curtain.current) {
      const chord = 2 * Math.sqrt(Math.max(0, 0.149 * 0.149 - z * z));
      curtain.current.visible = developing && scan > 0 && scan < 1 && chord > 0.01;
      curtain.current.scale.x = Math.max(0.001, chord);
    }
    if (puddle.current && frame.current) {
      // laid 0.23–0.43, held while it develops, flung off as the wafer spins up (0.58–0.66)
      const off = developing ? smooth(p, 0.58, 0.66) : 1;
      puddle.current.visible = developing && scan > 0 && off < 1;
      puddle.current.scale.set(0.149, 0.0024 * (1 - off), 0.149);
      // keep z < the nozzle's position (module frame) → world
      frame.current.updateWorldMatrix(true, false);
      tmp.m.getNormalMatrix(frame.current.matrixWorld);
      tmp.n.set(0, 0, -1).applyMatrix3(tmp.m).normalize();
      tmp.p.set(0, 0, scanning ? z + 0.004 : 1).applyMatrix4(frame.current.matrixWorld);
      clip.setFromNormalAndCoplanarPoint(tmp.n, tmp.p);
    }
    if (rinseArm.current) {
      const out = developing ? smooth(p, 0.56, 0.6) * (1 - smooth(p, 0.79, 0.84)) : 0;
      rinseArm.current.rotation.y = lerp(D.park, D.over, out);
    }
    if (rinse.current) rinse.current.visible = developing && p > 0.6 && p < 0.78;
  });

  return (
    <group position={[MOD_X.develop, 0, 0]} ref={frame}>
      <Cup />
      <group ref={chuck} position={[0, REST.develop, 0]}>
        <Chuck radius={0.06} position={[0, -0.008, 0]} />
        <mesh ref={puddle} geometry={puddleGeo} material={puddleMat} position={[0, 0.0016, 0]} visible={false} renderOrder={2} />
      </group>
      <Merged
        build={(b) => {
          // the scanning nozzle's rail on two posts, clear of the cup
          b.box('steelSatin', [0.03, 0.02, 0.56], [DEV_RAIL_X + 0.012, DECK_Y + 0.105, 0], 0.004);
          for (const z of [-0.27, 0.27]) b.cyl('steelDark', 0.01, 0.1, [DEV_RAIL_X + 0.012, DECK_Y + 0.05, z], 16);
          b.cyl('steelDark', 0.014, 0.12, [D_PIVOT[0], DECK_Y + 0.06, D_PIVOT[1]], 20);
          b.cyl('panelGray', 0.024, 0.03, [D_PIVOT[0], DECK_Y + 0.015, D_PIVOT[1]], 24);
        }}
      />
      {/* developer nozzle: a slit bar the width of the wafer, carried along the rail */}
      <group ref={bar} position={[0, DECK_Y + 0.085, SCAN.from]}>
        <mesh position={[0.01, 0, 0]} material={MAT.panel} castShadow>
          <boxGeometry args={[0.34, 0.018, 0.022]} />
        </mesh>
        <mesh position={[0.01, -0.0105, 0]} material={MAT.black}>
          <boxGeometry args={[0.3, 0.003, 0.004]} />
        </mesh>
        <mesh position={[(0.18 + DEV_RAIL_X) / 2, 0.006, 0]} material={MAT.steelSatin} castShadow>
          <boxGeometry args={[DEV_RAIL_X - 0.18, 0.012, 0.016]} />
        </mesh>
        <mesh position={[DEV_RAIL_X, 0.012, 0]} material={MAT.steelSatin} castShadow>
          <boxGeometry args={[0.04, 0.03, 0.04]} />
        </mesh>
        {/* the liquid curtain under the slit while it scans */}
        <mesh ref={curtain} position={[0, -0.012 - CURTAIN / 2, 0]} material={DEVELOPER} visible={false}>
          <boxGeometry args={[1, CURTAIN, 0.002]} />
        </mesh>
      </group>
      {/* rinse arm: deionised water onto the centre while the wafer spins */}
      <group position={[D_PIVOT[0], DECK_Y + 0.125, D_PIVOT[1]]}>
        <group ref={rinseArm} rotation={[0, D.park, 0]}>
          <mesh position={[D.len / 2 - 0.01, 0, 0]} material={MAT.steelSatin} castShadow>
            <boxGeometry args={[D.len + 0.01, 0.012, 0.016]} />
          </mesh>
          <mesh position={[D.len, -0.02, 0]} material={MAT.chrome}>
            <cylinderGeometry args={[0.003, 0.0024, 0.03, 10]} />
          </mesh>
          <mesh ref={rinse} position={[D.len, -0.035 - (0.125 - 0.035 - (REST.develop + 0.0016 - DECK_Y)) / 2, 0]} material={CLEAR} visible={false}>
            <cylinderGeometry args={[0.0014, 0.0018, 0.125 - 0.035 - (REST.develop + 0.0016 - DECK_Y), 10]} />
          </mesh>
        </group>
      </group>
    </group>
  );
}

// ───────────────────────────── hot plates ─────────────────────────────

/** Three ceramic lift pins that raise the wafer off a plate for the robot. */
function LiftPins({ mod, route }: { mod: 'bake' | 'peb' | 'prime'; route: Route }) {
  const g = useRef<THREE.Group>(null);
  const f = useMemo(makeFrame, []);
  useProgressFrame((p) => {
    transfer(route, p, f);
    if (g.current) g.current.position.y = lerp(REST[mod] - 0.014, XCHG[mod] - 0.014, f.lift[mod]);
  });
  return (
    <group ref={g} position={[0, REST[mod] - 0.014, 0]}>
      {[0.5, 2.6, 4.7].map((a) => (
        <Cyl key={a} r={0.0035} h={0.014} position={[Math.cos(a) * 0.07, 0.007, Math.sin(a) * 0.07]} m="ceramic" seg={12} />
      ))}
    </group>
  );
}

/** Lid height above the deck: raised for the robot, and closed on the plate. */
const LID_UP = 0.23;
const LID_DOWN = 0.031;

/**
 * A hot plate: an aluminium plate on an insulating base, the wafer held on proximity pins a
 * fraction of a millimetre above it, and a lid that lowers onto the plate's rim to close the
 * treatment space (its exhaust rises from the centre). `which` is the soft-bake plate or the
 * post-exposure-bake plate beside the interface.
 */
function BakeModule({ which, route, active }: { which: 'bake' | 'peb'; route: Route; active: boolean }) {
  const { id } = useStep();
  const lid = useRef<THREE.Group>(null);
  // soft bake closes as soon as the wafer is down; the post-exposure bake waits until the
  // camera has gone into the layers
  const [down0, down1] = id === 'peb' ? [0.3, 0.42] : [0.27, 0.39];
  useProgressFrame((p) => {
    if (!lid.current) return;
    const down = active ? smooth(p, down0, down1) * (1 - smooth(p, 0.8, 0.94)) : 0;
    lid.current.position.y = DECK_Y + lerp(LID_UP, LID_DOWN, down);
  });
  return (
    <group position={[MOD_X[which], 0, 0]}>
      <Merged
        build={(b) => {
          b.cyl('panelGray', 0.205, 0.03, [0, DECK_Y - 0.0, 0], 64);
          b.cyl(PLATE, 0.172, 0.03, [0, DECK_Y + 0.015, 0], 72);
          b.lathe('steelSatin', [[0.176, 0], [0.2, 0], [0.2, 0.028], [0.188, 0.031], [0.176, 0.031]], [0, DECK_Y, 0], 72);
          for (const a of [0, 2.1, 4.2]) b.cyl('ceramic', 0.004, 0.002, [Math.cos(a) * 0.11, DECK_Y + 0.0305, Math.sin(a) * 0.11], 10);
          // the lid's lift column at the back right
          b.box('panelGray', [0.05, LID_UP + 0.06, 0.05], [0.25, DECK_Y + (LID_UP + 0.06) / 2, -0.25], 0.006);
        }}
      />
      <LiftPins mod={which} route={route} />
      <group ref={lid} position={[0, DECK_Y + LID_UP, 0]}>
        <Merged
          build={(b) => {
            b.lathe('aluminum', [[0, 0.04], [0.196, 0.04], [0.203, 0.032], [0.203, 0], [0.19, 0], [0.19, 0.03], [0, 0.03]], [0, 0, 0], 72);
            b.cyl('steelDark', 0.03, 0.035, [0, 0.057, 0], 24);
            b.box('steelSatin', [0.03, 0.025, 0.36], [0.12, 0.052, -0.13], 0.004, [0, -0.76, 0]);
          }}
        />
      </group>
    </group>
  );
}

/** Vapour prime: a heated plate under a sealed chamber lid that admits HMDS vapour. */
function PrimeModule({ route, active }: { route: Route; active: boolean }) {
  const lid = useRef<THREE.Group>(null);
  useProgressFrame((p) => {
    if (!lid.current) return;
    const down = active ? smooth(p, 0.17, 0.29) * (1 - smooth(p, 0.82, 0.95)) : 0;
    lid.current.position.y = DECK_Y + lerp(0.24, LID_DOWN, down);
  });
  return (
    <group position={[MOD_X.prime, 0, 0]}>
      <Merged
        build={(b) => {
          b.cyl('panelGray', 0.215, 0.03, [0, DECK_Y, 0], 64);
          b.cyl(PLATE, 0.172, 0.03, [0, DECK_Y + 0.015, 0], 72);
          b.lathe('rubber', [[0.188, 0.028], [0.2, 0.028], [0.2, 0.033], [0.188, 0.033]], [0, DECK_Y, 0], 72);
          b.lathe('steelSatin', [[0.176, 0], [0.214, 0], [0.214, 0.028], [0.176, 0.028]], [0, DECK_Y, 0], 72);
          b.box('panelGray', [0.05, 0.3, 0.05], [-0.25, DECK_Y + 0.15, -0.25], 0.006);
          // the vapour line from the back panel
          b.box('steelSatin', [0.012, 0.012, 0.12], [-0.2, DECK_Y + 0.32, -0.27], 0.004);
        }}
      />
      <LiftPins mod="prime" route={route} />
      <group ref={lid} position={[0, DECK_Y + 0.24, 0]}>
        <Merged
          build={(b) => {
            b.lathe('aluminum', [[0, 0.052], [0.2, 0.052], [0.212, 0.042], [0.212, 0], [0.198, 0], [0.198, 0.036], [0, 0.036]], [0, 0, 0], 72);
            b.cyl('panel', 0.05, 0.012, [0, 0.058, 0], 32);
            b.cyl('steelSatin', 0.014, 0.04, [0, 0.078, 0], 20);
            b.box('steelSatin', [0.03, 0.022, 0.36], [-0.12, 0.064, -0.13], 0.004, [0, 0.76, 0]);
          }}
        />
      </group>
    </group>
  );
}

export default function Track({ variant }: ToolProps) {
  const { id } = useStep();
  const active = (variant ?? 'coat') as Mod;
  // a lesson at another machine (the track idle) keeps the robot where the coat lesson starts
  const route = ROUTES[id] ?? ROUTES.coat!;
  return (
    <group>
      <Structure />
      <CellFilters />
      <PrimeModule route={route} active={active === 'prime'} />
      <CoatModule route={route} active={active === 'coat'} />
      <BakeModule which="bake" route={route} active={active === 'bake'} />
      <DevelopModule route={route} active={active === 'develop'} />
      <BakeModule which="peb" route={route} active={active === 'peb'} />
      <Robot route={route} />
      {ROUTES[id] && <TrackWafer route={route} stepId={id} />}
      {/* floor */}
      <StandaloneOnly>
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
          <planeGeometry args={[14, 14]} />
          <meshStandardMaterial color="#e4e1d8" roughness={0.5} />
        </mesh>
      </StandaloneOnly>
    </group>
  );
}
