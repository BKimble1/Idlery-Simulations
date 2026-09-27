/**
 * Illustrative 193 nm step-and-scan immersion scanner (round four; reference-informed, no
 * manufacturer's design), drawn as the inside of its bay model (Fab.tsx, scanner), which opens
 * in front of the rear bulkhead:
 *  - at the west end, against the track, a wafer handler takes wafers from the track's
 *    interface, pre-aligns them and sets them on the measuring chuck;
 *  - two wafer stages on a heavy stage base (a planar motor under its tiled top): one measured
 *    under the alignment and level sensors while the other is exposed under the projection
 *    lens; encoder heads at each stage's corners, fiducial plates on the chuck;
 *  - the projection lens, over 1.2 m tall, hanging in the metrology frame (rear columns, a
 *    beam and the mount ring the lens's flange rests on); at its foot the immersion hood, a
 *    ring around the last element that holds a film of water about a millimetre thick
 *    between the lens and the wafer — too thin to see at this scale, so the page shows it in a
 *    magnified inset (ui/Magnifier.tsx) instead of drawing the gap larger than it is;
 *  - the reticle stage above the lens, the reticle masking unit and the illuminator on top,
 *    fed through the rear bulkhead by the beam-delivery duct from the ArF excimer laser behind
 *    the machine;
 *  - at the east end a reticle library and a handler that carries a reticle to the stage.
 * During a scan the reticle and wafer move in opposite directions, the reticle 4× faster (the
 * lens reduces 4×), while a slit of light sweeps the field; then the wafer steps to the next
 * field. 193 nm light is invisible: the slit and the light path are drawn only as the optional
 * overlay. Every motion is a pure function of step progress (scannerMotion.ts, unit-tested).
 */
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { FIELDS, WAFER } from '../../sim/dies';
import { useSimState, useStep } from '../../state/sim';
import { lerp, smooth, useProgressFrame } from '../anim';
import { MAT, type MatKey } from '../materials';
import { Box, Lathe, LightTower, ScaraRobot, StandaloneOnly } from '../kit/parts';
import { Merged } from '../kit/merged';
import { Wafer, WaferFraming } from '../wafer/Wafer';
import type { ToolProps } from './index';
import { useOverlay, usePresentation } from '../../state/presentation';
import { magnifierFrame, useMagnifier } from '../../state/magnifier';
import { APPROACH_FROM, EXPOSE_TO, exposurePose, LENS_X, makeExposurePose, markPose, MEAS_X, stageBases } from './scannerMotion';
import { drawReticle, type ReticleKind } from './reticleArt';

// ───────────────────────────── layout (metres) ─────────────────────────────
//
// Tool frame: x across the machine (wafer handler at −x, against the track; reticle library at
// +x), z toward the aisle, the wafer-stage line at z = 0. In the bay the frame sits 0.25 m in
// front of the housing's centre (poses/scanner.ts), so the rear bulkhead is at the housing's cut
// plane.

const GRANITE_TOP = 0.66;
/** Wafer underside on the chuck, and its top (the wafer is drawn 1.6 mm thick). */
const WAFER_Y = GRANITE_TOP + 0.075;
const WAFER_TOP = WAFER_Y + 0.0016;
/** Underside of the last lens element: a 2 mm film of water over the wafer (the real film is
 * about 0.1–1 mm; see the magnified inset). */
const LENS_Y0 = WAFER_TOP + 0.002;
/** The immersion hood's underside, about a millimetre over the wafer. */
const HOOD_Y0 = WAFER_TOP + 0.001;
const LENS_H = 1.28;
const LENS_TOP = LENS_Y0 + LENS_H;
const RETICLE_Y = LENS_TOP + 0.22;
/** Illuminator module above the reticle stage (x0..x1, y0..y1, z0..z1). */
const ILLUM = { x0: LENS_X - 0.48, x1: LENS_X + 0.48, y0: RETICLE_Y + 0.36, y1: RETICLE_Y + 1.02, z0: -0.92, z1: 0.36 } as const;
const BEAM_Y = RETICLE_Y + 0.82; // beam delivery into the illuminator
const BULKHEAD_Z = -1.0; // internal rear bulkhead (the housing's cut plane)
const LIB_X = 1.95; // reticle library
const HANDLER_X = -1.75; // wafer handler robot
/** Reticle library shelves, around the reticle stage's height. */
const LIB_DY = RETICLE_Y - 2.02;

// ───────────────────────────── finishes ─────────────────────────────

// (plain transparency: with transmission, three.js draws every opaque object in view a second
// time, into a target the glass samples, in every frame the lens element is on screen, and
// compiles a second program for each of them the first time; for a 12 cm element under the
// immersion hood that doubled the scanner's draw calls, 109 → 207, and changed no pixel by more
// than 2 levels)
const glassMat = new THREE.MeshPhysicalMaterial({ color: '#e8f2fa', roughness: 0.02, transparent: true, opacity: 0.7, clearcoat: 1 });
// the next wafer, measured on the other stage while yours is exposed (bare silicon look)
const nextWaferMat = new THREE.MeshStandardMaterial({ color: '#6f747c', metalness: 0.6, roughness: 0.22 });
/** The stage base's top: the planar motor's tiled surface under the stages. */
function tilesTexture() {
  const n = 256;
  const c = document.createElement('canvas');
  c.width = c.height = n;
  const g = c.getContext('2d')!;
  g.fillStyle = '#1d2024';
  g.fillRect(0, 0, n, n);
  const t = n / 8;
  for (let i = 0; i < 8; i++)
    for (let j = 0; j < 8; j++) {
      const v = 38 + ((i * 7 + j * 3) % 5) * 2;
      g.fillStyle = `rgb(${v}, ${v + 2}, ${v + 5})`;
      g.fillRect(i * t + 1, j * t + 1, t - 2, t - 2);
    }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(3, 2);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function reticleTexture(kind: ReticleKind): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 1024;
  drawReticle(c.getContext('2d')!, 1024, kind);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

// ───────────────────────────── parts ─────────────────────────────

/** A 6-inch reticle, pattern side down, with its pellicle stretched on a frame below it. */
function Reticle({ kind }: { kind: ReticleKind }) {
  const tex = useMemo(() => reticleTexture(kind), [kind]);
  const mat = useMemo(() => new THREE.MeshPhysicalMaterial({ map: tex, roughness: 0.08, metalness: 0.25, clearcoat: 1, clearcoatRoughness: 0.04 }), [tex]);
  useEffect(
    () => () => {
      tex.dispose();
      mat.dispose();
    },
    [tex, mat],
  );
  return (
    <group>
      <mesh castShadow material={mat}>
        <boxGeometry args={[0.1524, 0.0064, 0.1524]} />
      </mesh>
      {/* pellicle frame (a few millimetres under the pattern) and its membrane */}
      <Box size={[0.114, 0.005, 0.144]} position={[0, -0.0058, 0]} m="black" radius={0.001} />
      <mesh position={[0, -0.0086, 0]} rotation={[-Math.PI / 2, 0, 0]} material={MAT.glassClear}>
        <planeGeometry args={[0.11, 0.14]} />
      </mesh>
    </group>
  );
}

/**
 * Refractive projection lens (catadioptric in the highest-NA models): a turned barrel with
 * flange rings, its mounting flange resting on the metrology frame's ring; the last element
 * and the immersion hood at its foot.
 */
function LensColumn() {
  // (radius, fraction of the barrel's height) from the last element up
  const profile = useMemo<[number, number][]>(
    () =>
      (
        [
          [0.0, 0],
          [0.056, 0],
          [0.066, 0.012],
          [0.1, 0.07],
          [0.135, 0.18],
          [0.152, 0.29],
          [0.235, 0.296],
          [0.235, 0.33],
          [0.18, 0.336],
          [0.2, 0.5],
          [0.225, 0.505],
          [0.225, 0.53],
          [0.205, 0.535],
          [0.215, 0.78],
          [0.265, 0.79],
          [0.265, 0.83],
          [0.205, 0.84],
          [0.165, 0.98],
          [0.175, 1.0],
          [0.0, 1.0],
        ] as [number, number][]
      ).map(([r, f]) => [r, f * LENS_H]),
    [],
  );
  return (
    <group position={[LENS_X, LENS_Y0, 0]}>
      <Lathe profile={profile} m="steelSatin" seg={80} />
      <Merged
        castShadow={false}
        build={(b) => {
          // bright flange rings and the lens's name band
          for (const [f, r] of [
            [0.318, 0.24],
            [0.518, 0.232],
            [0.81, 0.272],
          ])
            b.cyl('chrome', r, 0.012, [0, f * LENS_H, 0], 80);
          b.cyl('black', 0.206, 0.05, [0, 0.66 * LENS_H, 0], 80);
          // purge-gas and cooling lines running up the barrel
          for (const a of [2.2, 2.6]) b.cyl('steelSatin', 0.006, 0.55 * LENS_H, [Math.cos(a) * 0.212, 0.52 * LENS_H, -Math.sin(a) * 0.212], 8);
        }}
      />
      {/* last lens element, at the bottom, inside the hood */}
      <mesh position={[0, 0.0005, 0]} rotation={[Math.PI, 0, 0]} material={glassMat}>
        <sphereGeometry args={[0.05, 32, 12, 0, Math.PI * 2, 0, 0.42]} />
      </mesh>
    </group>
  );
}

/**
 * Immersion hood: a ring around the last element whose underside rides about a millimetre over
 * the wafer; water is fed and drawn off through it, so the film stays under the lens (never
 * across the wafer) as the stage steps and scans beneath.
 */
function ImmersionHood() {
  const hood: [number, number][] = [
    [0.059, HOOD_Y0 - WAFER_Y],
    [0.118, HOOD_Y0 - WAFER_Y],
    [0.124, HOOD_Y0 - WAFER_Y + 0.006],
    [0.124, HOOD_Y0 - WAFER_Y + 0.03],
    [0.1, HOOD_Y0 - WAFER_Y + 0.036],
    [0.068, HOOD_Y0 - WAFER_Y + 0.036],
    [0.059, HOOD_Y0 - WAFER_Y + 0.03],
  ];
  return (
    <group position={[LENS_X, WAFER_Y, 0]}>
      <Lathe profile={[...hood, hood[0]]} m="steelDark" seg={64} />
      {/* the water film between the last element and the wafer */}
      <mesh position={[0, (WAFER_TOP - WAFER_Y + LENS_Y0 - WAFER_Y) / 2, 0]} material={MAT.water} renderOrder={2}>
        <cylinderGeometry args={[0.052, 0.052, LENS_Y0 - WAFER_TOP, 48]} />
      </mesh>
      {/* water supply and extraction lines */}
      <Merged
        castShadow={false}
        build={(b) => {
          for (const s of [-1, 1]) {
            b.box('steelSatin', [0.012, 0.012, 0.3], [s * 0.05, HOOD_Y0 - WAFER_Y + 0.045, -0.2], 0.004);
            b.cyl('steelSatin', 0.006, 0.34, [s * 0.05, HOOD_Y0 - WAFER_Y + 0.21, -0.35], 8);
          }
        }}
      />
    </group>
  );
}

/** A wafer stage: the stage body with its encoder heads, the wafer table and the chuck. */
function Stage({ children, position }: { children?: React.ReactNode; position?: [number, number, number] }) {
  return (
    <group position={position}>
      <Merged
        build={(b) => {
          b.box('black', [0.44, 0.05, 0.44], [0, GRANITE_TOP + 0.03, 0], 0.012);
          b.box('ceramicGray', [0.38, 0.014, 0.38], [0, GRANITE_TOP + 0.062, 0], 0.004);
          b.cyl('ceramic', 0.155, 0.01, [0, GRANITE_TOP + 0.07, 0], 72);
          // encoder heads at the corners; fiducial plates (sensors) at two corners of the table
          for (const sx of [-1, 1])
            for (const sz of [-1, 1]) b.box('steelDark', [0.05, 0.03, 0.05], [sx * 0.2, GRANITE_TOP + 0.07, sz * 0.2], 0.006);
          for (const [sx, sz] of [
            [1, -1],
            [-1, 1],
          ]) {
            b.box('panelDark', [0.036, 0.004, 0.036], [sx * 0.16, GRANITE_TOP + 0.071, sz * 0.16], 0.001);
            b.box('panel', [0.02, 0.0012, 0.003], [sx * 0.16, GRANITE_TOP + 0.0736, sz * 0.16]);
            b.box('panel', [0.003, 0.0012, 0.02], [sx * 0.16, GRANITE_TOP + 0.0736, sz * 0.16]);
          }
        }}
      />
      {children}
    </group>
  );
}

/** A flat rectangular frame (w × d, h thick) around a square opening, centred at height y. */
function Frame({ w, d, hole, h, y, m }: { w: number; d: number; hole: number; h: number; y: number; m: MatKey }) {
  const side = (w - hole) / 2;
  const end = (d - hole) / 2;
  return (
    <group>
      {[-1, 1].map((k) => (
        <Box key={`x${k}`} size={[side, h, d]} position={[(k * (hole + side)) / 2, y, 0]} m={m} radius={0.006} />
      ))}
      {[-1, 1].map((k) => (
        <Box key={`z${k}`} size={[hole, h, end]} position={[0, y, (k * (hole + end)) / 2]} m={m} radius={0.004} />
      ))}
    </group>
  );
}

/** A rectangular frustum between two horizontal slits (for the light-path overlay). */
function SlitFrustum({ x, y0, y1, w0, w1, d }: { x: number; y0: number; y1: number; w0: number; w1: number; d: number }) {
  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    const a = w0 / 2;
    const b = w1 / 2;
    const h = d / 2;
    // top rectangle at y0 (half-width a), bottom at y1 (half-width b)
    const v = [
      [-a, y0, -h], [a, y0, -h], [a, y0, h], [-a, y0, h],
      [-b, y1, -h], [b, y1, -h], [b, y1, h], [-b, y1, h],
    ].flat();
    g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
    g.setIndex([0, 1, 5, 0, 5, 4, 1, 2, 6, 1, 6, 5, 2, 3, 7, 2, 7, 6, 3, 0, 4, 3, 4, 7]);
    g.computeVertexNormals();
    return g;
  }, [y0, y1, w0, w1, d]);
  return <mesh geometry={geo} position={[x, 0, 0]} material={MAT.beam} />;
}

/** The stage base on its vibration isolators, the metrology frame and the reticle stage's bridge. */
function Frames() {
  const tiles = useMemo(tilesTexture, []);
  const tileMat = useMemo(() => new THREE.MeshStandardMaterial({ map: tiles, metalness: 0.3, roughness: 0.42 }), [tiles]);
  useEffect(
    () => () => {
      tiles.dispose();
      tileMat.dispose();
    },
    [tiles, tileMat],
  );
  const mountY = LENS_Y0 + 0.296 * LENS_H;
  return (
    <group>
      <Merged
        build={(b) => {
          // base frame on air mounts, and the stage base (the planar motor's stator) on it
          for (const x of [-1.0, 0.9]) for (const z of [-0.55, 0.55]) b.cyl('panelDark', 0.075, 0.24, [x, 0.12, z], 24);
          b.box('granite', [2.4, 0.4, 1.46], [-0.05, GRANITE_TOP - 0.2, 0], 0.02);
          b.box('steelDark', [2.44, 0.03, 1.5], [-0.05, GRANITE_TOP - 0.41, 0], 0.006);
          // metrology frame: rear columns on their own isolators, a beam, and the arms and ring
          // the lens hangs from; the alignment sensor's bracket
          for (const x of [-0.85, 0.95]) b.box('steelSatin', [0.13, LENS_TOP + 0.1 - GRANITE_TOP, 0.13], [x, (LENS_TOP + 0.1 + GRANITE_TOP) / 2, -0.55], 0.015);
          b.box('aluminum', [1.95, 0.09, 0.3], [0.05, mountY + 0.04, -0.5], 0.015);
          for (const dx of [-0.26, 0.26]) b.box('aluminum', [0.09, 0.08, 0.5], [LENS_X + dx, mountY + 0.04, -0.2], 0.012);
          b.lathe('aluminum', [[0.2, 0], [0.33, 0], [0.33, 0.07], [0.2, 0.07]], [LENS_X, mountY - 0.03, 0], 72);
          b.box('aluminum', [0.09, 0.08, 0.6], [MEAS_X, mountY + 0.04, -0.25], 0.012);
          // the upper frame: the bridge carrying the reticle stage, on posts from the lens top
          b.box('aluminum', [1.08, 0.05, 0.6], [LENS_X, RETICLE_Y - 0.1, -0.08], 0.012);
          for (const dx of [-0.48, 0.48]) b.box('steelSatin', [0.08, RETICLE_Y - 0.1 - LENS_TOP - 0.02, 0.08], [LENS_X + dx, (RETICLE_Y - 0.1 + LENS_TOP + 0.02) / 2, -0.3], 0.01);
          b.cyl('aluminum', 0.3, 0.05, [LENS_X, LENS_TOP + 0.025, 0], 64);
        }}
      />
      {/* the planar motor's tiled top, under the stages */}
      <mesh position={[-0.05, GRANITE_TOP + 0.0012, 0]} rotation={[-Math.PI / 2, 0, 0]} material={tileMat} receiveShadow>
        <planeGeometry args={[2.3, 1.36]} />
      </mesh>
    </group>
  );
}

/** Illuminator: beam-shaping module on top, the masking unit and condenser above the reticle, duct through the bulkhead. */
function Illuminator() {
  const { x0, x1, y0, y1, z0, z1 } = ILLUM;
  return (
    <Merged
      build={(b) => {
        b.box('panel', [x1 - x0, y1 - y0, z1 - z0], [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2], 0.03);
        b.box('steelSatin', [x1 - x0 + 0.01, 0.05, z1 - z0 + 0.01], [(x0 + x1) / 2, y0 + 0.14, (z0 + z1) / 2], 0.01);
        // a service panel and its latches on the illuminator's front
        b.box('panelGray', [0.46, 0.26, 0.012], [(x0 + x1) / 2, y0 + 0.42, z1 + 0.004], 0.004);
        for (const s of [-1, 1]) b.box('steelSatin', [0.03, 0.05, 0.016], [(x0 + x1) / 2 + s * 0.2, y0 + 0.42, z1 + 0.01], 0.004);
        // the reticle-masking (blades) unit and the condenser column down to the reticle
        b.box('steelSatin', [0.38, y0 - RETICLE_Y - 0.11, 0.38], [LENS_X, (y0 + RETICLE_Y + 0.11) / 2, 0], 0.02);
        b.box('black', [0.22, 0.02, 0.22], [LENS_X, RETICLE_Y + 0.1, 0], 0.004);
        b.box('steelSatin', [0.22, 0.22, z0 - BULKHEAD_Z], [LENS_X, BEAM_Y, (z0 + BULKHEAD_Z) / 2], 0.02);
      }}
    />
  );
}

/** Wafer handler at the west end: robot and pre-aligner between the track interface and the stages. */
function WaferHandler() {
  return (
    <group>
      <ScaraRobot position={[HANDLER_X, 0.44, 0.05]} base={0.4} elbow={-1.9} wrist={1.35} />
      <Merged
        build={(b) => {
          b.box('panelGray', [0.34, 0.44, 0.34], [HANDLER_X, 0.22, 0.05], 0.012);
          // pre-aligner: spin chuck and notch sensor, on a conditioning plate
          b.box('panelGray', [0.24, 0.66, 0.24], [-1.25, 0.33, 0.42], 0.01);
          b.cyl('steelSatin', 0.025, 0.05, [-1.25, 0.685, 0.42], 20);
          b.cyl('ceramicGray', 0.06, 0.01, [-1.25, 0.715, 0.42], 40);
          b.box('black', [0.06, 0.07, 0.09], [-1.15, 0.72, 0.42], 0.006);
          // the port from the track's interface, in the end wall
          b.box('panelGray', [0.08, 0.3, 0.5], [-2.62, 0.78, 0.05], 0.01);
          b.box('black', [0.02, 0.08, 0.36], [-2.575, 0.78, 0.05], 0.004);
          // electronics cabinet against the bulkhead
          b.box('panelWarm', [0.7, 1.9, 0.4], [-2.2, 1.07, BULKHEAD_Z + 0.22], 0.02);
          b.box('glassDark', [0.5, 0.4, 0.012], [-2.2, 1.55, BULKHEAD_Z + 0.426], 0.004);
          for (let i = 0; i < 6; i++) b.box('black', [0.5, 0.008, 0.01], [-2.2, 0.35 + i * 0.03, BULKHEAD_Z + 0.425]);
        }}
      />
    </group>
  );
}

/** Reticle library (pods on shelves) at the east end, with the handler's rail to the stage. */
function ReticleLibrary() {
  // the handler lifts reticles in and out at the travel height (reticle seat + 0.1)
  const slots = [1.8, 1.98, 2.16, 2.34].map((y) => y + LIB_DY);
  return (
    <Merged
      build={(b) => {
        // cabinet below the library, its door and window
        b.box('panelWarm', [0.62, 1.52 + LIB_DY, 0.62], [LIB_X, 0.1 + (1.52 + LIB_DY) / 2, -0.12], 0.02);
        b.box('glassDark', [0.4, 0.3, 0.012], [LIB_X, 1.2, 0.195], 0.004);
        // shelf frame
        for (const dx of [-0.28, 0.28]) b.box('steelSatin', [0.03, 0.78, 0.5], [LIB_X + dx, 2.02 + LIB_DY, -0.1], 0.006);
        b.box('panelGray', [0.6, 0.03, 0.52], [LIB_X, 2.42 + LIB_DY, -0.1], 0.006);
        slots.forEach((y, i) => {
          b.box('panelGray', [0.53, 0.012, 0.46], [LIB_X, y - 0.05, -0.1], 0.003);
          // reticle pods; the third slot's reticle is the one in use
          if (i !== 2) b.box('polycarbonate', [0.26, 0.07, 0.26], [LIB_X, y - 0.008, -0.1], 0.012);
        });
        // handler rail from the library to the reticle stage, behind the reticle's path
        b.box('steelSatin', [LIB_X - LENS_X + 0.25, 0.05, 0.06], [(LENS_X + LIB_X + 0.35) / 2, RETICLE_Y + 0.27, -0.26], 0.01);
      }}
    />
  );
}

/** Alignment sensor and level sensor over the measuring side. */
function MeasureSensors({ spot }: { spot: React.RefObject<THREE.Mesh | null> }) {
  const mountY = LENS_Y0 + 0.296 * LENS_H;
  return (
    <group position={[MEAS_X, 0, 0]}>
      <Merged
        build={(b) => {
          // alignment sensor: a column from the frame's bracket to just over the wafer
          b.cyl('steelSatin', 0.05, mountY - WAFER_TOP - 0.06, [0, (mountY + WAFER_TOP + 0.06) / 2, 0], 32);
          b.cyl('black', 0.022, 0.03, [0, WAFER_TOP + 0.045, 0], 24);
          b.box('steelSatin', [0.05, 0.05, 0.3], [0, mountY + 0.02, -0.16], 0.008);
          // level sensor: a projector and a detector either side, looking down at a glancing angle
          for (const s of [-1, 1]) {
            b.box('panelGray', [0.1, 0.05, 0.07], [s * 0.19, WAFER_TOP + 0.11, 0], 0.008, [0, 0, s * 0.95]);
            b.box('black', [0.024, 0.02, 0.05], [s * 0.155, WAFER_TOP + 0.075, 0], 0.004, [0, 0, s * 0.95]);
            b.box('steelSatin', [0.03, mountY - WAFER_TOP - 0.13, 0.03], [s * 0.22, (mountY + WAFER_TOP + 0.13) / 2, -0.02], 0.004);
          }
        }}
      />
      <mesh ref={spot} position={[0, WAFER_TOP + 0.02, 0]} visible={false}>
        <cylinderGeometry args={[0.004, 0.012, 0.04, 12, 1, true]} />
        <meshBasicMaterial color="#ffd27a" transparent opacity={0.5} depthWrite={false} />
      </mesh>
    </group>
  );
}

export default function Scanner({ variant }: ToolProps) {
  const state = useSimState();
  const { id } = useStep();
  const pres = usePresentation();
  const lightPath = useOverlay('lightPath');
  const v = variant ?? 'expose';
  const exposing = v === 'expose';
  const aligning = v === 'align';
  const kind: ReticleKind = id.startsWith('contact') ? 'contact' : 'poly';
  // the magnified inset belongs to the machine the story is at, while it exposes
  const live = !!pres && !pres.parked && !pres.frozen && exposing;

  const exposeStage = useRef<THREE.Group>(null);
  const measStage = useRef<THREE.Group>(null);
  const ourBase = useRef<THREE.Group>(null);
  const otherBase = useRef<THREE.Group>(null);
  const bases = useMemo(() => ({ ours: new THREE.Vector3(), other: new THREE.Vector3() }), []);
  const reticleStage = useRef<THREE.Group>(null);
  const reticleHand = useRef<THREE.Group>(null);
  const fork = useRef<THREE.Group>(null);
  const slit = useRef<THREE.Mesh>(null);
  const beam = useRef<THREE.Group>(null);
  const alignSpot = useRef<THREE.Mesh>(null);

  // Exposure schedule (scannerMotion.ts): the wafer shows each field as the slit sweeps it (live,
  // in its shader: no repaint per field)
  const liveFields = useMemo(() => ({ on: false, done: 0 }), []);
  const pose = useMemo(makeExposurePose, []);
  const libDx = LIB_X - LENS_X;

  useEffect(() => {
    if (!live) return;
    useMagnifier.setState({ kind: 'immersion', lightPath });
    return () => useMagnifier.setState({ kind: null });
  }, [live, lightPath]);

  useProgressFrame((p) => {
    stageBases(v, p, bases.ours, bases.other);
    ourBase.current?.position.copy(bases.ours);
    otherBase.current?.position.copy(bases.other);
    liveFields.on = exposing;
    // ── exposure: step and scan ──
    if (exposeStage.current) {
      let x = 0,
        z = 0,
        scanning = false;
      if (exposing) {
        // the stage moves so that the point under the lens is (field centre + scan offset); the
        // reticle scans the other way, 4× faster (drawn at 1/4 scale travel)
        exposurePose(p, pose);
        x = pose.x;
        z = pose.z;
        scanning = pose.scanning;
        liveFields.done = pose.done;
        if (reticleStage.current) reticleStage.current.position.z = -pose.scan * 4 * 0.25;
      } else if (aligning) {
        // measure marks at a few positions under the alignment sensor
        const m = markPose(p, 0.1, 0.8);
        x = m.x;
        z = m.z;
        if (alignSpot.current) alignSpot.current.visible = m.dwell && lightPath;
      }
      exposeStage.current.position.set(x, 0, z);
      // the slit (invisible 193 nm light) only with the light-path overlay
      if (slit.current) slit.current.visible = scanning && lightPath;
      if (beam.current) beam.current.visible = lightPath && (exposing ? scanning || p < APPROACH_FROM || p > EXPOSE_TO : true);
      if (live) {
        magnifierFrame.waferZ = z;
        magnifierFrame.exposing = scanning;
        magnifierFrame.draw?.();
      }
    }
    // the other stage measures the next wafer while yours is exposed
    if (measStage.current) {
      const m = exposing ? markPose(p, 0.12, 0.84) : { x: 0, z: 0 };
      measStage.current.position.set(m.x, 0, m.z);
    }
    // ── reticle load: the handler carries it from the library, lowers it and withdraws ──
    const loading = v === 'reticle';
    const inT = loading ? smooth(p, 0.15, 0.62) : 1;
    const down = loading ? smooth(p, 0.62, 0.72) : 1;
    const back = loading ? smooth(p, 0.76, 0.95) : 1;
    if (reticleHand.current) {
      reticleHand.current.position.x = lerp(libDx, 0, inT);
      reticleHand.current.position.y = lerp(0.1, 0, down);
    }
    if (fork.current) {
      fork.current.position.x = back > 0 ? lerp(0, libDx, back) : lerp(libDx, 0, inT);
      fork.current.position.y = back > 0 ? lerp(-0.012, 0.1, back) : lerp(0.1, -0.012, down);
    }
  });

  return (
    <group>
      {/* floor */}
      <StandaloneOnly>
        <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
          <planeGeometry args={[16, 16]} />
          <meshStandardMaterial color="#e2dfd6" roughness={0.55} />
        </mesh>
      </StandaloneOnly>
      {/* rear bulkhead: the enclosure behind the cut, with service ribs, a cable tray, and the
          closing panel of the roof housing behind it */}
      <Merged
        build={(b) => {
          b.box('panelGray', [5.34, 2.74, 0.04], [0, 0.14 + 1.37, BULKHEAD_Z], 0.01);
          b.box('steelSatin', [2.36, ILLUM.y1 - 2.88 + 0.05, 0.04], [0.37, (2.88 + ILLUM.y1 + 0.05) / 2, BULKHEAD_Z], 0.01);
          for (const x of [-1.9, -0.9, 1.35, 2.3]) b.box('panelGray', [0.05, 2.6, 0.03], [x, 1.5, BULKHEAD_Z + 0.035], 0.006);
          b.box('steelSatin', [5.2, 0.06, 0.16], [0, 1.34, BULKHEAD_Z + 0.1], 0.01);
        }}
      />
      <Frames />
      <LensColumn />
      <ImmersionHood />
      <MeasureSensors spot={alignSpot} />
      {/* wafer stages (see stageBases) */}
      <group ref={ourBase} position={[MEAS_X, 0, 0]}>
        {/* shots frame the wafer on its chuck's home position, not following each step and scan */}
        <WaferFraming position={[0, WAFER_Y, 0]} />
        <group ref={exposeStage}>
          <Stage>
            <Wafer anchor look={{ summary: state.wafer, showParticles: true }} liveFields={liveFields} fieldRects={FIELDS} position={[0, WAFER_Y, 0]} size={768} />
          </Stage>
        </group>
      </group>
      <group ref={otherBase} position={[LENS_X, 0, 0]}>
        <group ref={measStage}>
          <Stage>
            {exposing && (
              <mesh position={[0, WAFER_Y + 0.0008, 0]} material={nextWaferMat} castShadow>
                <cylinderGeometry args={[0.15, 0.15, 0.0016, 96]} />
              </mesh>
            )}
          </Stage>
        </group>
      </group>
      {/* the slit of light on the wafer during a scan: part of the light-path overlay */}
      <mesh ref={slit} position={[LENS_X, WAFER_TOP + 0.0006, 0]} rotation={[-Math.PI / 2, 0, 0]} visible={false} renderOrder={3}>
        <planeGeometry args={[(WAFER.dieW * 2) / 1000, 0.006]} />
        <meshBasicMaterial color="#cfc8ff" transparent opacity={0.85} depthWrite={false} />
      </mesh>
      {/* reticle stage: a frame with an opening under the reticle for the light */}
      <group position={[LENS_X, RETICLE_Y, 0]}>
        <Frame w={0.7} d={0.46} hole={0.15} h={0.06} y={-0.035} m="black" />
        <group ref={reticleStage}>
          <Frame w={0.24} d={0.24} hole={0.13} h={0.03} y={0.005} m="ceramicGray" />
          <group ref={reticleHand} position={[0, 0, 0]}>
            <group position={[0, 0.026, 0]}>
              <Reticle kind={kind} />
            </group>
          </group>
        </group>
        {/* handler fork, hanging from its carriage on the rail behind the reticle's path */}
        <group ref={fork}>
          <Box size={[0.08, 0.05, 0.08]} position={[0.1, 0.22, -0.26]} m="panelGray" radius={0.01} />
          <Box size={[0.03, 0.2, 0.03]} position={[0.1, 0.11, -0.26]} m="steelSatin" radius={0.006} />
          <Box size={[0.03, 0.008, 0.18]} position={[0.1, 0.017, -0.17]} m="ceramicGray" radius={0.002} />
          <Box size={[0.13, 0.008, 0.02]} position={[0.035, 0.017, -0.09]} m="ceramicGray" radius={0.002} />
          {[-0.05, 0.05].map((dx) => (
            <Box key={dx} size={[0.012, 0.008, 0.16]} position={[dx, 0.017, -0.01]} m="ceramicGray" radius={0.002} />
          ))}
        </group>
      </group>
      <ReticleLibrary />
      <Illuminator />
      <WaferHandler />
      {/* excimer laser and beam delivery behind the machine (the bay model has its own) */}
      <StandaloneOnly>
        <group position={[0.6, 0, -2.9]}>
          <Box size={[3.0, 1.9, 1.1]} position={[0, 0.95, 0]} m="panelWarm" radius={0.03} />
          <Box size={[1.4, 0.26, 0.012]} position={[-0.4, 1.45, 0.556]} m="glassDark" radius={0.004} />
          <LightTower position={[1.3, 1.9, -0.35]} on="violet" />
        </group>
        <Box size={[0.3, 1.2, 0.3]} position={[LENS_X, BEAM_Y - 0.5, -2.8]} m="steelSatin" radius={0.03} />
        <Box size={[0.3, 0.3, 1.9]} position={[LENS_X, BEAM_Y, -1.95]} m="steelSatin" radius={0.03} />
      </StandaloneOnly>
      {/* educational light path overlay (193 nm UV is invisible in reality) */}
      <group ref={beam} visible={false}>
        <mesh position={[LENS_X, BEAM_Y, (BULKHEAD_Z + ILLUM.z0) / 2]} rotation={[Math.PI / 2, 0, 0]} material={MAT.beam}>
          <boxGeometry args={[0.024, ILLUM.z0 - BULKHEAD_Z, 0.024]} />
        </mesh>
        {/* shaped slit of light onto the reticle (drawn 4× the printed slit) */}
        <mesh position={[LENS_X, RETICLE_Y + 0.06, 0]} material={MAT.beam}>
          <boxGeometry args={[0.104, 0.08, 0.012]} />
        </mesh>
        {/* from the reticle into the lens, and out of the lens onto the wafer: 4× smaller */}
        <SlitFrustum x={LENS_X} y0={RETICLE_Y - 0.01} y1={LENS_TOP} w0={0.104} w1={0.07} d={0.012} />
        <SlitFrustum x={LENS_X} y0={LENS_Y0 + 0.02} y1={WAFER_TOP} w0={0.034} w1={0.026} d={0.006} />
      </group>
    </group>
  );
}
