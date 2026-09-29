import type { ToolPose } from '../../poses';

/**
 * Camera framings for the coater/developer track (tool frame, metres; see Track.tsx). The working
 * line runs west → east: prime −1.1, coat −0.4, soft-bake plate 0.3, develop 1.0, post-exposure
 * bake plate 1.7 (the interface block and the scanner beyond it to the east). Each module is
 * framed from in front of it and to its east, over the open front of its cell; the robot parks
 * to the module's west, out of the way.
 */
export const POSE: ToolPose = {
  // the working line under the stacked modules, from the aisle
  pos: [0.9, 1.72, 2.05],
  target: [0.25, 1.12, -0.25],
  // The module line stands in the front half of the track's housing (poses: Fab.tsx, track).
  mount: { yaw: 0, offset: [-0.35, 0.5] },
  cutaway: { z: 0.12, y: 0.86 },
  // your die in a cup, under the module's cover: dissolve from it to this framing on the way to
  // the next machine (the straight way out clips the front of the cell)
  leaveFade: true,
  variants: {
    prime: { pos: [-0.84, 1.38, 0.8], target: [-1.12, 0.94, -0.05] },
    coat: { pos: [-0.14, 1.38, 0.82], target: [-0.42, 0.92, -0.05] },
    bake: { pos: [0.56, 1.38, 0.8], target: [0.28, 0.94, -0.05] },
    develop: { pos: [1.26, 1.36, 0.8], target: [0.98, 0.93, -0.05] },
    peb: { pos: [1.96, 1.38, 0.8], target: [1.68, 0.94, -0.05] },
  },
};
