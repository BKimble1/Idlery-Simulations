/**
 * Section drawing (round four): a machine opened the way a technical illustration opens one —
 * clipped by planes, with the solid material the cut passes through drawn as a flat, finely
 * hatched section, never as a hollow shell with a wall missing. The bay's housings open this
 * way (Fab.tsx); inside them, a vacuum chamber whose wall must be cut to show the wafer is
 * opened the same way, after its housing has opened and before it closes (SectionCut, with
 * the planes the scene moves; see innerCut in Fab.tsx).
 */
import { createElement, useLayoutEffect, useRef, type ReactNode } from 'react';
import * as THREE from 'three';
import { SECTION_SRGB } from '../materials';

/** Colour of a cut face and of its hatching (display-referred sRGB, as the frame is drawn). */
const SECTION_GLSL = SECTION_SRGB.map((h) => {
  const c = new THREE.Color().setStyle(h, THREE.LinearSRGBColorSpace);
  return `vec3(${c.r.toFixed(4)}, ${c.g.toFixed(4)}, ${c.b.toFixed(4)})`;
}) as [string, string];

/**
 * A material as drawn opened: clipped (what lies on the negative side of every plane is
 * removed), and two-sided so the inside shows through the cut. Back faces are drawn a hair
 * deeper than front faces (one pixel's depth slope, as a polygon offset would): where one part
 * rests on another (a roof unit on the housing top, the housing on its plinth) the underside
 * and the surface below lie in one plane, and without the offset the two would z-fight
 * wherever the cut lets the camera see them.
 */
export function sectionMaterial(base: THREE.Material, planes: THREE.Plane[]): THREE.Material {
  const cm = base.clone();
  cm.side = THREE.DoubleSide;
  cm.clippingPlanes = planes;
  cm.clipIntersection = true;
  cm.onBeforeCompile = (sh, r) => {
    base.onBeforeCompile(sh, r);
    sh.vertexShader = 'varying vec3 vCutW;\n' + sh.vertexShader.replace('#include <project_vertex>', '#include <project_vertex>\n\tvCutW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader =
      'varying vec3 vCutW;\n' +
      sh.fragmentShader
        .replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\n\tgl_FragDepth = gl_FrontFacing ? gl_FragCoord.z : gl_FragCoord.z + fwidth(gl_FragCoord.z) + 2.5e-7;')
        // Where the cut passes through a wall, the eye sees the wall's inside (a back face):
        // draw it as a section, flat and finely hatched, like the cut face of a technical
        // cutaway drawing, so an opened machine reads as an illustration's cut and not as a
        // machine missing its panels.
        // (the hatching is anti-aliased, and fades out where its stripes would be finer than a
        // few pixels: a distant cut is a flat section, never a moire)
        .replace(
          '#include <dithering_fragment>',
          `#include <dithering_fragment>
	if (!gl_FrontFacing) {
		float u = (vCutW.x + vCutW.y + vCutW.z) * 18.0;
		float fw = max(fwidth(u), 1e-4);
		float line = 1.0 - smoothstep(0.12 - fw, 0.12 + fw, abs(fract(u) - 0.5));
		line *= 1.0 - smoothstep(0.2, 0.45, fw);
		gl_FragColor = vec4(mix(${SECTION_GLSL[0]}, ${SECTION_GLSL[1]}, line), 1.0);
	}`,
        );
  };
  cm.customProgramCacheKey = () => base.customProgramCacheKey() + ':cut';
  return cm;
}

/** A clipped copy of a see-through material: cut, but not drawn as a section (glass, liquids). */
function clippedMaterial(base: THREE.Material, planes: THREE.Plane[]): THREE.Material {
  const cm = base.clone();
  cm.clippingPlanes = planes;
  cm.clipIntersection = true;
  cm.customProgramCacheKey = () => base.customProgramCacheKey() + ':clip';
  return cm;
}

/**
 * Part of a machine that is drawn cut open: every mesh under it is drawn with section
 * materials clipped by `planes` (which the scene moves every frame: placed where they cut
 * nothing, the part is drawn whole), except under a group whose userData has `whole` (a leg
 * or a pipe the cut would only mutilate, or a part whose material the scene animates) and
 * shader-drawn volumes (a plasma's glow). The materials are swapped once, when it mounts (so
 * the prepared shaders are the ones drawn), and restored when it unmounts: give it a `key`
 * that changes with what it holds.
 */
export function SectionCut({ planes, children }: { planes: THREE.Plane[]; children: ReactNode }) {
  const ref = useRef<THREE.Group>(null);
  useLayoutEffect(() => {
    const root = ref.current;
    if (!root) return;
    const byBase = new Map<THREE.Material, THREE.Material>();
    const swapped: [THREE.Mesh, THREE.Material | THREE.Material[]][] = [];
    const cut = (m: THREE.Material) => {
      let c = byBase.get(m);
      if (!c) {
        // (a see-through or two-sided surface has no inside to draw as a section)
        c = m.transparent || m.side === THREE.DoubleSide ? clippedMaterial(m, planes) : sectionMaterial(m, planes);
        byBase.set(m, c);
      }
      return c;
    };
    const visit = (o: THREE.Object3D) => {
      if (o.userData.whole) return;
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh) {
        const m = mesh.material;
        const shader = Array.isArray(m) ? m.some((x) => (x as THREE.ShaderMaterial).isShaderMaterial) : (m as THREE.ShaderMaterial).isShaderMaterial;
        if (!shader) {
          swapped.push([mesh, m]);
          mesh.material = Array.isArray(m) ? m.map(cut) : cut(m);
        }
      }
      o.children.forEach(visit);
    };
    visit(root);
    return () => {
      for (const [mesh, m] of swapped) mesh.material = m;
      byBase.forEach((c) => c.dispose());
    };
  }, [planes]);
  return createElement('group', { ref }, children);
}

/**
 * Share of a housing's opening the housing itself takes (the first 0.8 s of CUT_TIME in
 * Fab.tsx); the parts inside it that are cut open after it (a vacuum chamber's wall, a transfer
 * chamber's lid) open in the rest, and close first.
 */
export const HOUSING_SHARE = 0.62;

/** How far the parts inside a housing are open (0..1) when the housing's opening is at t. */
export function innerOpening(t: number): number {
  return Math.max(0, Math.min(1, (t - HOUSING_SHARE) / (1 - HOUSING_SHARE)));
}

/**
 * Planes that remove a wedge of a turned part: the sector of azimuths (measured from +z toward
 * +x, in the part's own frame) [centre − width/2, centre + width/2], width under π. `open`
 * (0..1) pushes the wedge in from beyond `reach` (the part's radius: nothing is cut) to the
 * axis. The planes are written in world space through `matrix`, the part's world matrix.
 */
export function wedgePlanes(out: THREE.Plane[], sector: readonly [number, number], open: number, reach: number, matrix: THREE.Matrix4): void {
  const [c, w] = sector;
  const a1 = c - w / 2;
  const a2 = c + w / 2;
  const e = open <= 0 ? 0 : open >= 1 ? 1 : open * open * (3 - 2 * open);
  const s = (1 - e) * reach * Math.sin(w / 2);
  // removed where both distances are negative: sin(a − a1) > s and sin(a2 − a) > s (times r)
  out[0].normal.set(-Math.cos(a1), 0, Math.sin(a1));
  out[0].constant = s;
  out[1].normal.set(Math.cos(a2), 0, -Math.sin(a2));
  out[1].constant = s;
  out[0].applyMatrix4(matrix);
  out[1].applyMatrix4(matrix);
}

/**
 * A plane that removes what lies beyond `at` along `dir` (the part's frame), written in world
 * space; with a second plane that cuts everything (`everything`), a single clip.
 */
export function slicePlane(out: THREE.Plane, dir: THREE.Vector3, at: number, matrix: THREE.Matrix4): void {
  out.normal.copy(dir).negate();
  out.constant = at;
  out.applyMatrix4(matrix);
}

/** A plane whose negative side holds everything (for a single clip in intersection mode). */
export function everything(out: THREE.Plane): THREE.Plane {
  return out.set(new THREE.Vector3(0, 1, 0), -1e6);
}
