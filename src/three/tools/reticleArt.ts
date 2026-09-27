/**
 * A reticle's pattern side, drawn procedurally (round four): a 6-inch quartz plate whose chrome
 * carries one exposure field at 4× — 104 × 132 mm, the 26 × 33 mm field on the wafer — laid
 * out as the wafer map lays out dies (2 × 2 dies of 13 × 16.5 mm on the wafer, 52 × 66 mm here),
 * separated by scribe lanes with alignment and test marks, the whole field inside an opaque
 * chrome border that carries the reticle's barcode, its identification and its own alignment
 * marks.
 *
 * Each die has the structure real layouts have at this scale: a seal ring and a ring of bond
 * pads at its edge, dense regular arrays (memory-like blocks, fine gratings that read as grey),
 * irregular logic, wide wiring channels and a few large analog blocks. Nothing is copied from
 * a real design; a fixed seed makes every reticle of a kind the same.
 *
 * Tone follows the layer: the gate layer's positive-resist mask is clear-field (chrome lines
 * on clear quartz); the contact layer's is dark-field (chrome everywhere but the holes).
 */
import { mulberry32 } from '../../sim/rng';

export type ReticleKind = 'poly' | 'contact';

/** Plate and field sizes, mm. */
export const RETICLE_MM = 152.4;
const FIELD_W = 104;
const FIELD_H = 132;
const DIE_W = 52;
const DIE_H = 66;
/** Scribe lane between dies at reticle scale (0.1 mm on the wafer). */
const SCRIBE = 0.4;

export function drawReticle(ctx: CanvasRenderingContext2D, size: number, kind: ReticleKind): void {
  const k = size / RETICLE_MM; // px per mm
  const X = (mm: number) => size / 2 + mm * k;
  const Y = (mm: number) => size / 2 - mm * k;
  const CHROME = '#34383f';
  const CHROME_HI = '#454a52';
  const QUARTZ = '#d9e1e8';
  const dark = kind === 'contact';
  const bg = dark ? CHROME : QUARTZ; // the field's background
  const fg = dark ? QUARTZ : CHROME; // what the pattern draws
  const rnd = mulberry32(dark ? 7331 : 1337);
  // the arrays' repeating tile: a grating of lines (clear field) or a grid of holes (dark field)
  const t = document.createElement('canvas');
  t.width = t.height = dark ? 4 : 3;
  const tc = t.getContext('2d')!;
  tc.fillStyle = bg;
  tc.fillRect(0, 0, t.width, t.height);
  tc.fillStyle = fg;
  if (dark) tc.fillRect(1, 1, 2, 2);
  else tc.fillRect(0, 0, 1, 3);
  const tile = ctx.createPattern(t, 'repeat')!;
  const rect = (x0: number, y0: number, w: number, h: number, c: string) => {
    ctx.fillStyle = c;
    ctx.fillRect(X(x0), Y(y0 + h), w * k, h * k);
  };

  // the plate: chrome all over, with a narrow bare quartz margin at its edge
  ctx.fillStyle = '#c9d2da';
  ctx.fillRect(0, 0, size, size);
  rect(-RETICLE_MM / 2 + 1.5, -RETICLE_MM / 2 + 1.5, RETICLE_MM - 3, RETICLE_MM - 3, CHROME);
  // the field
  rect(-FIELD_W / 2, -FIELD_H / 2, FIELD_W, FIELD_H, bg);

  // dies, 2 × 2
  for (let i = 0; i < 2; i++)
    for (let j = 0; j < 2; j++) {
      const x0 = -FIELD_W / 2 + i * DIE_W + SCRIBE / 2;
      const y0 = -FIELD_H / 2 + j * DIE_H + SCRIBE / 2;
      die(x0, y0, DIE_W - SCRIBE, DIE_H - SCRIBE);
    }
  // scribe lanes: alignment marks and test structures between the dies
  for (let j = 0; j < 3; j++) {
    const y = -FIELD_H / 2 + j * DIE_H;
    for (let x = -FIELD_W / 2 + 4; x < FIELD_W / 2 - 4; x += 9 + rnd() * 6) rect(x, y - 0.35, 2 + rnd() * 2.5, 0.7, fg);
  }
  for (let i = 0; i < 3; i++) {
    const x = -FIELD_W / 2 + i * DIE_W;
    for (let y = -FIELD_H / 2 + 4; y < FIELD_H / 2 - 4; y += 10 + rnd() * 6) rect(x - 0.35, y, 0.7, 2 + rnd() * 2.5, fg);
  }

  // outside the field, in the chrome: reticle alignment marks, the barcode and the name
  for (const s of [-1, 1]) {
    cross(s * (FIELD_W / 2 + 8), 0, 5, QUARTZ);
    cross(0, s * (FIELD_H / 2 + 6), 4, QUARTZ);
  }
  let bx = -32;
  while (bx < 20) {
    const w = 0.35 + rnd() * 0.9;
    rect(bx, -FIELD_H / 2 - 12, w, 5, QUARTZ);
    bx += w + 0.35 + rnd() * 0.8;
  }
  ctx.fillStyle = QUARTZ;
  ctx.font = `${Math.round(3.2 * k)}px monospace`;
  ctx.textBaseline = 'middle';
  ctx.fillText(dark ? 'FAB/ONE  CT  L5  4X  DF' : 'FAB/ONE  PO  L3  4X  CF', X(24), Y(-FIELD_H / 2 - 9.5));
  // a faint sheen on the chrome, so it reads as metal rather than paint
  const g = ctx.createLinearGradient(0, 0, size, size);
  g.addColorStop(0, 'rgba(255,255,255,0.05)');
  g.addColorStop(0.5, 'rgba(255,255,255,0)');
  g.addColorStop(1, 'rgba(255,255,255,0.04)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  void CHROME_HI;

  function cross(x: number, y: number, s: number, c: string) {
    rect(x - s / 2, y - 0.35, s, 0.7, c);
    rect(x - 0.35, y - s / 2, 0.7, s, c);
  }

  /** One die: seal ring, pad ring, then blocks of arrays, logic, wiring and analog. */
  function die(x0: number, y0: number, w: number, h: number) {
    // seal ring
    const ring = 0.6;
    rect(x0, y0, w, ring, fg);
    rect(x0, y0 + h - ring, w, ring, fg);
    rect(x0, y0, ring, h, fg);
    rect(x0 + w - ring, y0, ring, h, fg);
    // bond pads along each edge
    const pad = 1.6;
    const padGap = 1.2;
    for (let x = x0 + 3; x < x0 + w - 3 - pad; x += pad + padGap) {
      rect(x, y0 + 1.4, pad, pad, fg);
      rect(x, y0 + h - 1.4 - pad, pad, pad, fg);
    }
    for (let y = y0 + 3; y < y0 + h - 3 - pad; y += pad + padGap) {
      rect(x0 + 1.4, y, pad, pad, fg);
      rect(x0 + w - 1.4 - pad, y, pad, pad, fg);
    }
    // the core, divided into blocks
    const cx0 = x0 + 5;
    const cy0 = y0 + 5;
    const cw = w - 10;
    const ch = h - 10;
    const cols = [0, 0.38, 0.62, 1];
    const rows = [0, 0.3, 0.55, 0.78, 1];
    for (let a = 0; a < cols.length - 1; a++)
      for (let b = 0; b < rows.length - 1; b++) {
        const bx0 = cx0 + cols[a] * cw + 0.6;
        const by0 = cy0 + rows[b] * ch + 0.6;
        const bw = (cols[a + 1] - cols[a]) * cw - 1.2;
        const bh = (rows[b + 1] - rows[b]) * ch - 1.2;
        const r = rnd();
        if (r < 0.34) array(bx0, by0, bw, bh);
        else if (r < 0.8) logic(bx0, by0, bw, bh);
        else analog(bx0, by0, bw, bh);
      }
    // wiring channels between the blocks
    for (const f of rows.slice(1, -1)) rect(cx0, cy0 + f * ch - 0.25, cw, 0.5, dark ? fg : CHROME);
  }

  /** A dense, regular array: a fine grating (or a grid of holes) that reads as an even grey
   * (filled with a repeating tile: one fill per block, however many lines it has). */
  function array(x0: number, y0: number, w: number, h: number) {
    ctx.fillStyle = tile;
    ctx.fillRect(X(x0), Y(y0 + h), w * k, h * k);
    // word-line straps across it
    if (!dark) for (let y = y0 + 3; y < y0 + h; y += 6) rect(x0, y, w, 0.3, fg);
  }

  /** Irregular logic: many small rectangles of a few standard heights, in rows. */
  function logic(x0: number, y0: number, w: number, h: number) {
    const rowH = 1.1;
    for (let y = y0; y < y0 + h - rowH; y += rowH + 0.25) {
      let x = x0;
      while (x < x0 + w - 0.4) {
        const cw = 0.25 + rnd() * 1.6;
        if (rnd() < (dark ? 0.35 : 0.72)) {
          if (dark) rect(x + cw / 2 - 0.12, y + rowH / 2 - 0.12, 0.24, 0.24, fg);
          else rect(x, y + 0.08, Math.min(cw, x0 + w - x), rowH - 0.16, fg);
        }
        x += cw + 0.12;
      }
    }
  }

  /** A few large devices (capacitors, transistors in wide arrays) with guard rings. */
  function analog(x0: number, y0: number, w: number, h: number) {
    rect(x0, y0, w, 0.4, fg);
    rect(x0, y0 + h - 0.4, w, 0.4, fg);
    rect(x0, y0, 0.4, h, fg);
    rect(x0 + w - 0.4, y0, 0.4, h, fg);
    const n = 2 + Math.floor(rnd() * 3);
    for (let i = 0; i < n; i++) {
      const bw = w * (0.2 + rnd() * 0.25);
      const bh = h * (0.2 + rnd() * 0.3);
      const bx = x0 + 1 + rnd() * (w - bw - 2);
      const by = y0 + 1 + rnd() * (h - bh - 2);
      if (dark) for (let y = by; y < by + bh; y += 0.8) for (let x = bx; x < bx + bw; x += 0.8) rect(x, y, 0.26, 0.26, fg);
      else {
        rect(bx, by, bw, bh, fg);
        rect(bx + 0.5, by + 0.5, bw - 1, bh - 1, bg);
        for (let x = bx + 1; x < bx + bw - 1; x += 0.9) rect(x, by + 0.5, 0.3, bh - 1, fg);
      }
    }
  }
}
