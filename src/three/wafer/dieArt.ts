/**
 * The die's floor plan (round four), shared by the reticle that prints it (tools/reticleArt.ts,
 * at 4×) and by the wafer, which shows it in every die once the die has been patterned
 * (drawDieDetail, sampled by the wafer's shader): a seal ring and a ring of bond pads at the
 * edge, and a core divided into blocks — dense regular arrays (memory-like), irregular logic
 * and a few large analog devices — with wiring channels between them. Nothing is copied from a
 * real design; a fixed seed makes every die the same, as every die on a real wafer is.
 *
 * Units: millimetres on the wafer, origin at the die's lower-left corner (inside the scribe
 * street), y up.
 */
import { mulberry32 } from '../../sim/rng';
import { WAFER } from '../../sim/dies';

export interface DieBlock {
  kind: 'array' | 'logic' | 'analog';
  x: number;
  y: number;
  w: number;
  h: number;
  /** Seed for the block's own details (its logic cells, its analog devices). */
  seed: number;
}

export interface DieFloorplan {
  /** The die's active area (the die minus its share of the scribe streets), mm. */
  w: number;
  h: number;
  ring: number;
  pads: { x: number; y: number; s: number }[];
  blocks: DieBlock[];
  /** Wiring channels between block rows (y of each channel's centre line), and their width. */
  channels: number[];
  channelW: number;
}

let cached: DieFloorplan | null = null;

export function dieFloorplan(): DieFloorplan {
  if (cached) return cached;
  const street = 0.1; // half the reticle's scribe lane, at wafer scale
  const w = WAFER.dieW - 2 * street;
  const h = WAFER.dieH - 2 * street;
  const ring = 0.15;
  const pad = 0.4;
  const padGap = 0.3;
  const pads: DieFloorplan['pads'] = [];
  for (let x = 0.75; x < w - 0.75 - pad; x += pad + padGap) {
    pads.push({ x, y: 0.35, s: pad });
    pads.push({ x, y: h - 0.35 - pad, s: pad });
  }
  for (let y = 0.75; y < h - 0.75 - pad; y += pad + padGap) {
    pads.push({ x: 0.35, y, s: pad });
    pads.push({ x: w - 0.35 - pad, y, s: pad });
  }
  const rnd = mulberry32(1337);
  const cx0 = 1.25;
  const cy0 = 1.25;
  const cw = w - 2.5;
  const ch = h - 2.5;
  const cols = [0, 0.38, 0.62, 1];
  const rows = [0, 0.3, 0.55, 0.78, 1];
  const blocks: DieBlock[] = [];
  for (let a = 0; a < cols.length - 1; a++)
    for (let b = 0; b < rows.length - 1; b++) {
      const r = rnd();
      blocks.push({
        kind: r < 0.34 ? 'array' : r < 0.8 ? 'logic' : 'analog',
        x: cx0 + cols[a] * cw + 0.15,
        y: cy0 + rows[b] * ch + 0.15,
        w: (cols[a + 1] - cols[a]) * cw - 0.3,
        h: (rows[b + 1] - rows[b]) * ch - 0.3,
        seed: Math.floor(rnd() * 1e9),
      });
    }
  cached = { w, h, ring, pads, blocks, channels: rows.slice(1, -1).map((f) => cy0 + f * ch), channelW: 0.12 };
  return cached;
}

/** How far the die has been built, as the wafer shows it (from the simulated wafer). */
export interface DieStage {
  /** Patterning steps done (0: nothing printed yet). */
  pattern: number;
  metalLevels: number;
  passivated: boolean;
}

export const dieStageKey = (s: DieStage) => `${Math.min(8, s.pattern)}:${s.metalLevels}:${s.passivated ? 1 : 0}`;

/**
 * The die as the wafer shows it close up: a brightness modulation (grey 128 = unchanged, lighter
 * or darker = the structure) with alpha 0 in the scribe streets, drawn over the wafer's painted
 * surface in its shader. Early in the process only the islands of the first patterning show,
 * faintly; the gate lines, contacts and wiring add structure and contrast; bond pads appear with
 * the metal; after passivation only the pads are open. The texture's average stays near grey,
 * so from a distance the wafer looks exactly as its painted surface does.
 */
export function drawDieDetail(ctx: CanvasRenderingContext2D, W: number, H: number, st: DieStage): void {
  const fp = dieFloorplan();
  ctx.clearRect(0, 0, W, H);
  if (st.pattern <= 0) return;
  // die-local mm → canvas px (the die's active area fills the canvas but for its streets)
  const kx = W / WAFER.dieW;
  const ky = H / WAFER.dieH;
  const ox = (WAFER.dieW - fp.w) / 2;
  const oy = (WAFER.dieH - fp.h) / 2;
  const X = (x: number) => (ox + x) * kx;
  const Y = (y: number) => H - (oy + y) * ky;
  const grey = (v: number) => {
    const c = Math.max(0, Math.min(255, Math.round(128 + v)));
    return `rgb(${c},${c},${c})`;
  };
  const rect = (x: number, y: number, w: number, h: number, v: number) => {
    ctx.fillStyle = grey(v);
    ctx.fillRect(X(x), Y(y + h), w * kx, h * ky);
  };
  const metal = st.metalLevels > 0;
  const k = Math.min(1, 0.35 + 0.18 * st.pattern + 0.2 * st.metalLevels); // contrast grows with the layers
  // the active area (a touch light: the arrays below are darker, and the average stays grey)
  rect(0, 0, fp.w, fp.h, 8 * k);
  // seal ring
  const r = fp.ring;
  for (const [x, y, w, h] of [
    [0, 0, fp.w, r],
    [0, fp.h - r, fp.w, r],
    [0, 0, r, fp.h],
    [fp.w - r, 0, r, fp.h],
  ])
    rect(x, y, w, h, 36 * k);
  // the blocks
  for (const b of fp.blocks) {
    const rnd = mulberry32(b.seed);
    if (b.kind === 'array') {
      // a dense, regular array: a fine grating that reads as an even, slightly darker field,
      // with straps across it
      rect(b.x, b.y, b.w, b.h, -34 * k);
      const pitch = 0.06;
      for (let x = b.x; x < b.x + b.w; x += pitch) rect(x, b.y, pitch * 0.45, b.h, -44 * k);
      if (st.pattern > 1) for (let y = b.y + 0.4; y < b.y + b.h; y += 0.8) rect(b.x, y, b.w, 0.06, 26 * k);
    } else if (b.kind === 'logic') {
      // irregular logic: rows of standard cells of random widths
      rect(b.x, b.y, b.w, b.h, -4 * k);
      const rowH = 0.18;
      for (let y = b.y; y < b.y + b.h - rowH; y += rowH + 0.03) {
        let x = b.x;
        while (x < b.x + b.w - 0.05) {
          const cw = 0.05 + rnd() * 0.3;
          if (rnd() < 0.7) rect(x, y + 0.015, Math.min(cw, b.x + b.w - x), rowH - 0.03, (rnd() < 0.5 ? 16 : -18) * k);
          x += cw + 0.02;
        }
      }
    } else {
      // analog: a guard ring and a few large devices
      rect(b.x, b.y, b.w, b.h, 6 * k);
      for (const [x, y, w, h] of [
        [b.x, b.y, b.w, 0.05],
        [b.x, b.y + b.h - 0.05, b.w, 0.05],
        [b.x, b.y, 0.05, b.h],
        [b.x + b.w - 0.05, b.y, 0.05, b.h],
      ])
        rect(x, y, w, h, 24 * k);
      const n = 2 + Math.floor(rnd() * 3);
      for (let i = 0; i < n; i++) {
        const bw = b.w * (0.2 + rnd() * 0.25);
        const bh = b.h * (0.2 + rnd() * 0.3);
        const bx = b.x + 0.12 + rnd() * (b.w - bw - 0.24);
        const by = b.y + 0.12 + rnd() * (b.h - bh - 0.24);
        rect(bx, by, bw, bh, -26 * k);
        for (let x = bx + 0.06; x < bx + bw - 0.06; x += 0.11) rect(x, by + 0.06, 0.04, bh - 0.12, 16 * k);
      }
    }
  }
  // wiring channels between the block rows (metal: brighter)
  if (st.pattern > 1) for (const y of fp.channels) rect(1.25, y - fp.channelW / 2, fp.w - 2.5, fp.channelW, (metal ? 34 : 12) * k);
  // bond pads, with the metal; opened through the passivation at the end
  if (metal)
    for (const p of fp.pads) {
      rect(p.x, p.y, p.s, p.s, st.passivated ? 78 : 64);
      if (st.passivated) rect(p.x + 0.05, p.y + 0.05, p.s - 0.1, p.s - 0.1, 96);
    }
}
