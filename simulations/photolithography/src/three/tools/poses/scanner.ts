import type { ToolPose } from '../../poses';

/**
 * Camera pose(s) for the Scanner scene (metres). The wafer-stage line is z = 0: the projection
 * lens at x = 0.3 (its foot 1 mm over the wafer at y ≈ 0.74, its top at ≈ 2.02; the reticle
 * stage above it at y ≈ 2.24, the illuminator on top), the alignment sensor over the measure
 * stage at x = −0.4, the reticle library at x = 1.95 and the wafer handler at the left end.
 * Framings look in through the cut-away front and top.
 */
export const POSE: ToolPose = {
  pos: [2.3, 3.2, 3.9],
  target: [0.25, 1.5, -0.1],
  // The stage line stands 0.25 m in front of the housing's centre; the rear bulkhead at its cut.
  mount: { yaw: 0, offset: [0, 0.25] },
  // The housing opens in front of the rear bulkhead, above the reveal its lower panels stop at.
  cutaway: { z: -0.75, y: 1.03 },
  // your die lies under the projection lens: dissolve from it to this framing on the way to the
  // next machine (pulling the camera out swept the lens barrel across the picture)
  leaveFade: true,
  shots: {
    // the reticle library, where the handler takes the layer's reticle off its shelf
    reticleLib: { pos: [2.62, 2.86, 1.05], target: [1.72, 2.3, -0.12] },
  },
  variants: {
    // the reticle stage, where the handler lowers the reticle under the condenser
    reticle: { pos: [1.12, 2.7, 1.0], target: [0.5, 2.26, -0.06] },
    align: { pos: [0.35, 1.4, 1.4], target: [-0.4, 0.78, 0.0] },
    // the wafer stepping and scanning under the lens, the reticle stage above it in view
    expose: { pos: [1.85, 2.95, 2.75], target: [0.3, 1.28, -0.05] },
  },
};
