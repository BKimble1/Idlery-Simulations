/**
 * Shared physically based materials for the equipment scenes. Created once and reused so
 * the renderer compiles few shader programs. Colours are deliberately restrained:
 * stainless steel, white powder-coated panels, dark glass, black anodised details and a
 * single violet accent for status lights.
 *
 * Round four: tuned for the cleanroom environment (Stage.tsx, WorldEnvironment) rather than a
 * dark studio. Each finish has its own place on a restrained roughness scale — polished
 * stainless (0.2) for wetted and sealing surfaces, brushed stainless (0.36) for frames and
 * covers, machined and anodised aluminium (0.42–0.5), powder-coated panels (0.55–0.62),
 * ceramics (0.34–0.4), rubber (0.95) — and whites stay below the display's white, so a lit
 * panel never burns out.
 */
import * as THREE from 'three';

function std(p: THREE.MeshStandardMaterialParameters) {
  return new THREE.MeshStandardMaterial(p);
}
function phys(p: THREE.MeshPhysicalMaterialParameters) {
  return new THREE.MeshPhysicalMaterial(p);
}

/**
 * Cut faces of cutaway drawings (round four): a flat, pale violet-grey, the same wherever a
 * machine is shown cut open — the housings' cut faces (Fab.tsx) and the cut edges of a
 * machine's own opened modules — so a cut always reads as the illustrator's cut and never as
 * a missing panel. Display-referred sRGB: drawn as is, without lighting or tone mapping.
 */
export const SECTION_SRGB: [string, string] = ['#cfccdb', '#b7b3c9'];

export const MAT = {
  steel: std({ color: '#c3c8ce', metalness: 1, roughness: 0.2 }),
  steelSatin: std({ color: '#b7bcc3', metalness: 1, roughness: 0.36 }),
  steelDark: std({ color: '#6c727a', metalness: 0.85, roughness: 0.42 }),
  chrome: std({ color: '#dfe2e6', metalness: 1, roughness: 0.1 }),
  aluminum: std({ color: '#c9cdd2', metalness: 0.85, roughness: 0.44 }),
  panel: std({ color: '#e3e6e9', metalness: 0, roughness: 0.56 }),
  panelWarm: std({ color: '#e7e5df', metalness: 0, roughness: 0.58 }),
  panelGray: std({ color: '#c6cad0', metalness: 0.04, roughness: 0.62 }),
  panelDark: std({ color: '#454a52', metalness: 0.15, roughness: 0.55 }),
  black: std({ color: '#26292e', metalness: 0.3, roughness: 0.46 }),
  rubber: std({ color: '#1a1b1d', metalness: 0, roughness: 0.95 }),
  ceramic: std({ color: '#efeee9', metalness: 0, roughness: 0.34 }),
  ceramicGray: std({ color: '#c2c5c9', metalness: 0, roughness: 0.4 }),
  glassDark: phys({ color: '#1d2329', metalness: 0.1, roughness: 0.04, transparent: true, opacity: 0.48, clearcoat: 1 }),
  glassClear: phys({ color: '#e9f1f6', metalness: 0, roughness: 0.02, transparent: true, opacity: 0.16, clearcoat: 1, depthWrite: false }),
  quartz: phys({ color: '#f3f7fa', metalness: 0, roughness: 0.06, transparent: true, opacity: 0.28, clearcoat: 1, depthWrite: false }),
  polycarbonate: phys({ color: '#dfe5ea', metalness: 0, roughness: 0.18, transparent: true, opacity: 0.5, clearcoat: 0.6 }),
  copper: std({ color: '#d08a5a', metalness: 1, roughness: 0.28 }),
  gold: std({ color: '#e0b25a', metalness: 1, roughness: 0.22 }),
  mold: std({ color: '#1b1c1f', metalness: 0, roughness: 0.66 }),
  pcb: std({ color: '#1e3b33', metalness: 0.1, roughness: 0.55 }),
  pad: std({ color: '#b8e0f0', metalness: 0.3, roughness: 0.5 }),
  granite: std({ color: '#2b2d31', metalness: 0.05, roughness: 0.55 }),
  floor: std({ color: '#f2f3f4', metalness: 0.05, roughness: 0.35 }),
  floorGrid: std({ color: '#dfe2e5', metalness: 0.1, roughness: 0.5 }),
  violetGlow: std({ color: '#7a6cff', emissive: '#6a5af9', emissiveIntensity: 2.2, roughness: 0.4 }),
  greenGlow: std({ color: '#6ef0b0', emissive: '#3ddc97', emissiveIntensity: 1.6 }),
  amberGlow: std({ color: '#ffb35c', emissive: '#ff8a1f', emissiveIntensity: 1.8 }),
  whiteGlow: std({ color: '#ffffff', emissive: '#ffffff', emissiveIntensity: 1.4 }),
  screen: std({ color: '#0e1320', emissive: '#1b2a4a', emissiveIntensity: 0.9, roughness: 0.25 }),
  label: std({ color: '#2a2d33', metalness: 0, roughness: 0.6 }),
  resistLiquid: phys({ color: '#b9a7ff', metalness: 0, roughness: 0.05, transparent: true, opacity: 0.85, clearcoat: 1 }),
  water: phys({ color: '#dff1ff', metalness: 0, roughness: 0.03, transparent: true, opacity: 0.45, clearcoat: 1, depthWrite: false }),
  plasma: new THREE.MeshBasicMaterial({ color: '#b9a8ff', transparent: true, opacity: 0.25, depthWrite: false, blending: THREE.AdditiveBlending }),
  beam: new THREE.MeshBasicMaterial({ color: '#7a6cff', transparent: true, opacity: 0.22, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }),
  section: new THREE.MeshBasicMaterial({ color: new THREE.Color().setStyle(SECTION_SRGB[0], THREE.LinearSRGBColorSpace), toneMapped: false }),
};

export type MatKey = keyof typeof MAT;
