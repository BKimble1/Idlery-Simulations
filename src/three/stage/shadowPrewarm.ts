/**
 * Shadow programs, prepared with the model (round four). The shadow map draws each
 * shadow-casting mesh with a depth material of its own — three.js picks its sidedness, map and
 * alpha test from the mesh's material — and compiles that program the first time the mesh is
 * drawn into a shadow map. For a machine that is when the key light turns to it, in the middle
 * of the move in: an opened chamber's two-sided section materials compiled a depth program
 * there (seconds on the software renderer). Compiling a model's colour programs in advance
 * (Stage.tsx `prewarm`) does not reach these.
 *
 * So a prepared model is also drawn once into a small shadow map of a light of its own, right
 * after a frame of the world has been drawn: the frame's render state (its lights and shadows)
 * is still current then, so three.js builds exactly the programs its own shadow pass will ask
 * for, while the camera is still. The light is never added to the scene; nothing is shown.
 */
import * as THREE from 'three';

const queue: THREE.Object3D[] = [];

/** Prepare the shadow programs of a model after the next frame of the world. */
export function queueShadowPrewarm(o: THREE.Object3D) {
  if (!queue.includes(o)) queue.push(o);
}

const light = new THREE.DirectionalLight(0xffffff, 0);
light.castShadow = true;
light.shadow.mapSize.set(16, 16);
const box = new THREE.Box3();
const sphere = new THREE.Sphere();

const clipped = new Map<THREE.Material, THREE.Plane[]>();
function unclip(o: THREE.Object3D) {
  o.traverse((c) => {
    const mat = (c as THREE.Mesh).material;
    if (!mat) return;
    for (const m of Array.isArray(mat) ? mat : [mat])
      if (m.clippingPlanes && !m.clipShadows && !clipped.has(m)) {
        clipped.set(m, m.clippingPlanes);
        m.clippingPlanes = null;
      }
  });
}
function reclip() {
  clipped.forEach((planes, m) => (m.clippingPlanes = planes));
  clipped.clear();
}

/** Draw the queued models into the prewarm light's shadow map (from the world scene's onAfterRender). */
const clearColor = new THREE.Color();

export function runShadowPrewarm(gl: THREE.WebGLRenderer, camera: THREE.Camera) {
  if (!queue.length || !gl.shadowMap.enabled) return;
  const needsUpdate = gl.shadowMap.needsUpdate;
  // (the shadow pass sets its own clear colour and scissor state and leaves them: inside a
  // render the main pass sets them again, but this runs after it, and a later pass of the same
  // frame — a cross-fade's other picture, a copy — would clear to white)
  gl.getClearColor(clearColor);
  const clearAlpha = gl.getClearAlpha();
  const scissor = gl.getScissorTest();
  for (const o of queue.splice(0)) {
    o.updateMatrixWorld(true);
    box.setFromObject(o);
    if (box.isEmpty()) continue;
    box.getBoundingSphere(sphere);
    const r = Math.max(sphere.radius, 0.01);
    const cam = light.shadow.camera;
    cam.left = cam.bottom = -r;
    cam.right = cam.top = r;
    cam.near = 0.01;
    cam.far = 4 * r;
    cam.updateProjectionMatrix();
    light.position.copy(sphere.center).y += 2 * r;
    light.target.position.copy(sphere.center);
    light.updateMatrixWorld();
    light.target.updateMatrixWorld();
    // (a model not on show yet is drawn as it will be; its hidden parts stay hidden, as they
    // are in the real pass)
    const shown = o.visible;
    o.visible = true;
    // the renderer's own shadow pass draws without the materials' clipping planes (three.js
    // clips shadows only with clipShadows, which nothing here sets); called directly, the shadow
    // map would keep them and build clipped programs the real pass never asks for
    unclip(o);
    gl.shadowMap.needsUpdate = true;
    gl.shadowMap.render([light], o as THREE.Scene, camera);
    reclip();
    o.visible = shown;
  }
  gl.shadowMap.needsUpdate = needsUpdate;
  gl.setClearColor(clearColor, clearAlpha);
  gl.setScissorTest(scissor);
}
