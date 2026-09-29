/**
 * Static machine detail, merged (round four). The fixed parts of a machine — stacked modules
 * behind the one in use, frames, trims, seams, grilles — are many small boxes and cylinders;
 * drawn one by one they cost a draw call each. A scene describes them once with a builder, and
 * they are merged into one mesh per finish (a few draw calls for hundreds of parts). Moving
 * parts stay ordinary meshes.
 *
 *   <Merged build={(b) => { b.box('panel', [0.6, 0.02, 0.6], [0, 1, 0]); b.cyl('steel', 0.01, 0.2, [0, 1.1, 0]); }} />
 */
import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { MAT, type MatKey } from '../materials';

type V3 = [number, number, number];

export class MergeBuilder {
  readonly parts = new Map<MatKey | THREE.Material, THREE.BufferGeometry[]>();
  private m = new THREE.Matrix4();
  private stack: THREE.Matrix4[] = [];

  /** Parts added in `fn` are placed by an extra transform (translation, then rotation about y). */
  at(pos: V3, rotY: number, fn: () => void) {
    this.stack.push(this.m.clone());
    this.m.multiply(new THREE.Matrix4().makeRotationY(rotY).setPosition(pos[0], pos[1], pos[2]));
    fn();
    this.m.copy(this.stack.pop()!);
  }
  add(k: MatKey | THREE.Material, g: THREE.BufferGeometry) {
    const geo = g.index ? g : mergeVertices(g, 1e-5);
    if (geo !== g) g.dispose();
    geo.applyMatrix4(this.m);
    // positions and normals only, so every part merges (the finishes are untextured)
    for (const name of Object.keys(geo.attributes)) if (name !== 'position' && name !== 'normal') geo.deleteAttribute(name);
    let a = this.parts.get(k);
    if (!a) this.parts.set(k, (a = []));
    a.push(geo);
  }
  /** A box; `r` rounds its edges (so they catch the light). */
  box(k: MatKey | THREE.Material, size: V3, pos: V3, r = 0, rot?: V3) {
    const rr = Math.min(r, Math.min(...size) / 2 - 1e-5);
    const g = rr > 0.0005 ? new RoundedBoxGeometry(size[0], size[1], size[2], 1, rr) : new THREE.BoxGeometry(size[0], size[1], size[2]);
    if (rot) g.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rot[0], rot[1], rot[2])));
    g.translate(pos[0], pos[1], pos[2]);
    this.add(k, g);
  }
  /** A cylinder about y (or x, z). */
  cyl(k: MatKey | THREE.Material, r: number, h: number, pos: V3, seg = 24, axis: 'x' | 'y' | 'z' = 'y', rTop?: number) {
    const g = new THREE.CylinderGeometry(rTop ?? r, r, h, seg);
    if (axis === 'x') g.rotateZ(Math.PI / 2);
    if (axis === 'z') g.rotateX(Math.PI / 2);
    g.translate(pos[0], pos[1], pos[2]);
    this.add(k, g);
  }
  /** A turned part from a closed (r, y) profile. */
  lathe(k: MatKey | THREE.Material, profile: [number, number][], pos: V3, seg = 48) {
    const pts: THREE.Vector2[] = [];
    const loop = [...profile, profile[0]];
    loop.forEach(([r, y], i) => {
      pts.push(new THREE.Vector2(r, y));
      if (i > 0 && i < loop.length - 1) pts.push(new THREE.Vector2(r, y));
    });
    const g = new THREE.LatheGeometry(pts, seg);
    g.translate(pos[0], pos[1], pos[2]);
    this.add(k, g);
  }
  build(): { mat: THREE.Material; geo: THREE.BufferGeometry }[] {
    const out: { mat: THREE.Material; geo: THREE.BufferGeometry }[] = [];
    for (const [k, list] of this.parts) {
      const geo = mergeGeometries(list, false);
      list.forEach((g) => g.dispose());
      if (geo) out.push({ mat: typeof k === 'string' ? MAT[k] : k, geo });
    }
    return out;
  }
}

/** Static parts described by `build`, merged into one mesh per finish (built once). */
export function Merged({ build, deps = [], castShadow = true, receiveShadow = true }: { build: (b: MergeBuilder) => void; deps?: unknown[]; castShadow?: boolean; receiveShadow?: boolean }) {
  const meshes = useMemo(() => {
    const b = new MergeBuilder();
    build(b);
    return b.build();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  useEffect(() => () => meshes.forEach((m) => m.geo.dispose()), [meshes]);
  return (
    <group>
      {meshes.map((m, i) => (
        <mesh key={i} geometry={m.geo} material={m.mat} castShadow={castShadow} receiveShadow={receiveShadow} />
      ))}
    </group>
  );
}
