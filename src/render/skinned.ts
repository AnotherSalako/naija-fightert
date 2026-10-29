// Fighter bodies for the renderer. Two kinds share one interface: the placeholder mannequin and a real
// skinned model (a GLB from tools/blender). The real model plays its authored clips (Mixamo moves,
// timed to the frame data by clips.ts) where it has them, and otherwise its bones are driven by the same
// frame-accurate poses as the mannequin (poses.ts); switching between the two cross-fades. Toon
// shading, an outline that follows the skin, the P2 colour swap as a shader parameter (spec 4.2) and
// spring bones for loose cloth (spec 4.1) live here.

import * as THREE from 'three';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import type { CharacterData } from '../sim/types';
import { animSet } from './animsets';
import type { ClipInfo, ClipPlay } from './clips';
import { applyPose, buildMannequin } from './mannequin';
import type { Pose } from './poses';
import { SF4, applySf4 } from './sf4';

export interface Outline {
  mat: THREE.MeshBasicMaterial;
  base: THREE.Color;
}

export interface Body {
  kind: 'mannequin' | 'model';
  root: THREE.Group;
  /** lit materials (emissive is the hit flash) */
  materials: (THREE.MeshToonMaterial | THREE.MeshStandardMaterial)[];
  outlines: Outline[];
  /** the authored clips this body can play (a real model with clips only) */
  clips?: Record<string, ClipInfo>;
  /** the middle of the torso in world space, as last posed (a real model only) */
  torso?(): THREE.Vector3;
  /** dev checks (a real model only): lowest vertex above the floor, and the closest a hand comes to the spine (m) */
  measure?(): { lowest: number; highest: number; handGap: number };
  /**
   * pose the body; `vx` is its forward speed in metres per second (for cloth); `striking` turns a
   * three-quarter body side-on so attacks travel toward the opponent; `clip`, when given and known,
   * plays instead of the pose
   */
  apply(pose: Pose, facing: 1 | -1, dt: number, vx: number, striking: boolean, clip?: ClipPlay | null, grounded?: boolean): void;
}

/** characters that have a real model in public/models (written by tools/blender) */
export const MODELS: Record<string, string> = {
  'egbon-razak': 'models/egbon-razak.glb',
};

/**
 * P2 colourways as colour rules on the same texture: by clothing region (the model's colour attribute,
 * painted by tools/blender/rig_generated.py: 0 = trousers in red, 1 = tank top in green) and HSV range
 */
interface SwapRule {
  region: 0 | 1; sMin: number; sMax: number; vMin: number; vMax: number;
  /** new hue (0-1), or -1 to keep; then saturation and value multipliers */
  hue: number; sMul: number; vMul: number;
}
const SWAPS: Record<string, SwapRule[]> = {
  // spec 7.2: P2 Egbon wears a black tank top and blue/white print trousers. The texture arrives in
  // linear light, where stains read more saturated than on screen.
  'egbon-razak': [
    { region: 1, sMin: 0, sMax: 0.6, vMin: 0.2, vMax: 1, hue: -1, sMul: 0.4, vMul: 0.15 },
    { region: 0, sMin: 0.42, sMax: 1, vMin: 0, vMax: 1, hue: 0.6, sMul: 0.95, vMul: 0.85 },
    { region: 0, sMin: 0, sMax: 0.42, vMin: 0.3, vMax: 1, hue: -1, sMul: 0.2, vMul: 1.05 },
  ],
};

/** the stance turns this far (radians) from side-on toward the camera; attacks turn back side-on */
const THREE_QUARTER = 0.95;
const STRIKE_TURN = 0.2;
/** an authored clip is already a side-on fighting stance: it faces the opponent, turned only this far */
const CLIP_TURN = 0.25;
const OUTLINE_WIDTH = 0.011;
/** seconds a change between clips, or between a clip and the poses, takes to blend */
const FADE = 0.1;
/** vertices lower than this at rest (m) are the soles the floor clamp follows, at most SOLE_SAMPLES of them */
const SOLE_HEIGHT = 0.05;
const SOLE_SAMPLES = 300;
const BODY_SAMPLES = 2500;
/** the floor clamp leaves this much (m) under the lowest sampled point, for the vertices between samples */
const FLOOR_CLEARANCE = 0.006;

/** The placeholder mannequin as a Body. */
export function mannequinBody(c: CharacterData, alt: boolean): Body {
  const rig = buildMannequin(c, alt);
  const outlines: Outline[] = [];
  rig.root.traverse((o) => {
    const mat = (o as THREE.Mesh).material as THREE.Material | undefined;
    if (mat instanceof THREE.MeshBasicMaterial && mat.side === THREE.BackSide) outlines.push({ mat, base: mat.color.clone() });
  });
  return {
    kind: 'mannequin',
    root: rig.root,
    materials: rig.materials,
    outlines,
    apply(pose, facing) {
      rig.root.rotation.y = facing === 1 ? 0 : Math.PI;
      applyPose(rig, pose);
    },
  };
}

const loader = new GLTFLoader();
// fighters ship Draco-compressed (tools/blender/prepare_character.py); the loader brings its own
// WebAssembly decoder, which the build emits as hashed assets
const draco = new DRACOLoader();
draco.setDecoderConfig({ type: 'wasm' });
loader.setDRACOLoader(draco);
const cache = new Map<string, Promise<THREE.Group>>();

let anisotropy = 8;
/** Fighter textures filter at this anisotropy (spec: 8-16); the world sets it from the GPU's limit. */
export function setFighterAnisotropy(n: number): void {
  anisotropy = Math.max(1, Math.min(16, n));
}

/** Load a character's model once; null if it has none. */
export function loadModel(id: string): Promise<THREE.Group> | null {
  const file = MODELS[id];
  if (!file) return null;
  let p = cache.get(id);
  if (!p) {
    const base = import.meta.env.BASE_URL;
    // the manifest beside the GLB holds each clip's length and moment of contact
    const manifest = fetch(`${base}${file.replace(/\.glb$/, '.json')}`)
      .then((r) => (r.ok ? r.json() : {}))
      .catch(() => ({})) as Promise<{ clips?: Record<string, ClipInfo> }>;
    p = Promise.all([loader.loadAsync(`${base}${file}`), manifest]).then(([g, m]) => {
      g.scene.animations = g.animations;
      g.scene.userData.clips = m.clips ?? {};
      return g.scene;
    });
    cache.set(id, p);
  }
  return p;
}

function swapShader(rules: SwapRule[]): (shader: THREE.WebGLProgramParametersWithUniforms) => void {
  const n = rules.length;
  const pack = (f: (r: SwapRule) => [number, number, number, number]): THREE.Vector4[] =>
    rules.map((r) => new THREE.Vector4(...f(r)));
  return (shader) => {
    shader.uniforms.uRange = { value: pack((r) => [r.region, 0, r.sMin, r.sMax]) };
    shader.uniforms.uRange2 = { value: pack((r) => [r.vMin, r.vMax, r.hue, 0]) };
    shader.uniforms.uMul = { value: pack((r) => [r.sMul, r.vMul, 0, 0]) };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
#if !defined(USE_COLOR) && !defined(USE_COLOR_ALPHA)
attribute vec3 color;
#endif
varying vec2 vRegion;`)
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvRegion = color.rg;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
varying vec2 vRegion;
uniform vec4 uRange[${n}];
uniform vec4 uRange2[${n}];
uniform vec4 uMul[${n}];
vec3 nfRgb2hsv(vec3 c) {
  vec4 K = vec4(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0);
  vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
  vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));
  float d = q.x - min(q.w, q.y);
  return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + 1e-10)), d / (q.x + 1e-10), q.x);
}
vec3 nfHsv2rgb(vec3 c) {
  vec3 p = abs(fract(c.xxx + vec3(1.0, 2.0 / 3.0, 1.0 / 3.0)) * 6.0 - 3.0);
  return c.z * mix(vec3(1.0), clamp(p - 1.0, 0.0, 1.0), c.y);
}`)
      .replace('#include <map_fragment>', `#include <map_fragment>
{
  vec3 hsv = nfRgb2hsv(diffuseColor.rgb);
  for (int i = 0; i < ${n}; i++) {
    float inRegion = uRange[i].x < 0.5 ? vRegion.x : vRegion.y;
    if (inRegion > 0.5 && hsv.y >= uRange[i].z && hsv.y < uRange[i].w
        && hsv.z >= uRange2[i].x && hsv.z <= uRange2[i].y) {
      if (uRange2[i].z >= 0.0) hsv.x = uRange2[i].z;
      hsv.y = clamp(hsv.y * uMul[i].x, 0.0, 1.0);
      hsv.z = clamp(hsv.z * uMul[i].y, 0.0, 1.0);
      break;
    }
  }
  diffuseColor.rgb = nfHsv2rgb(hsv);
}`);
  };
}

/**
 * Give a geometry an `outlineNormal` attribute (once; clones share the geometry): its normals welded
 * within small cells (split vertices at a UV seam, and the stacked layers of a generated mesh, cloth
 * over skin, get one normal, so the shell neither cracks nor pokes through a layer above it) and then
 * averaged with their neighbours a few times, so the shell follows the body's broad shape.
 */
function outlineNormals(geo: THREE.BufferGeometry, rounds = 4, cell = 0.012): void {
  if (geo.getAttribute('outlineNormal')) return;
  const pos = geo.getAttribute('position');
  const nor = geo.getAttribute('normal');
  const count = pos.count;
  // weld: one group per cell
  const groupOf = new Int32Array(count);
  const keys = new Map<string, number>();
  for (let i = 0; i < count; i++) {
    const k = `${Math.round(pos.getX(i) / cell)},${Math.round(pos.getY(i) / cell)},${Math.round(pos.getZ(i) / cell)}`;
    let g = keys.get(k);
    if (g === undefined) { g = keys.size; keys.set(k, g); }
    groupOf[i] = g;
  }
  const groups = keys.size;
  let n = new Float32Array(groups * 3);
  for (let i = 0; i < count; i++) {
    const g = groupOf[i] * 3;
    n[g] += nor.getX(i); n[g + 1] += nor.getY(i); n[g + 2] += nor.getZ(i);
  }
  // neighbours between groups, from the triangles
  const links: number[][] = Array.from({ length: groups }, () => []);
  const index = geo.getIndex();
  const tris = index ? index.count : count;
  for (let t = 0; t < tris; t += 3) {
    const v = [0, 1, 2].map((k) => groupOf[index ? index.getX(t + k) : t + k]);
    for (let a = 0; a < 3; a++) {
      const b = (a + 1) % 3;
      if (v[a] !== v[b]) { links[v[a]].push(v[b]); links[v[b]].push(v[a]); }
    }
  }
  for (let r = 0; r < rounds; r++) {
    const next = new Float32Array(n);
    for (let g = 0; g < groups; g++) {
      for (const h of links[g]) {
        next[g * 3] += n[h * 3]; next[g * 3 + 1] += n[h * 3 + 1]; next[g * 3 + 2] += n[h * 3 + 2];
      }
    }
    n = next;
    for (let g = 0; g < groups; g++) {
      const l = Math.hypot(n[g * 3], n[g * 3 + 1], n[g * 3 + 2]) || 1;
      n[g * 3] /= l; n[g * 3 + 1] /= l; n[g * 3 + 2] /= l;
    }
  }
  const out = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) out.set(n.subarray(groupOf[i] * 3, groupOf[i] * 3 + 3), i * 3);
  geo.setAttribute('outlineNormal', new THREE.BufferAttribute(out, 3));
}

/** joints the poses drive: bone name, the pose field, its sign, and its share of that field */
const DRIVE: [string, keyof Pose, number, number][] = [
  ['Spine', 'torso', -1, 0.4], ['Spine1', 'torso', -1, 0.3], ['Spine2', 'torso', -1, 0.3], ['Head', 'head', -1, 1],
  ['RightArm', 'frontArm', 1, 1], ['RightForeArm', 'frontElbow', 1, 1], ['LeftArm', 'backArm', 1, 1], ['LeftForeArm', 'backElbow', 1, 1],
  ['RightUpLeg', 'frontThigh', 1, 1], ['RightLeg', 'frontKnee', 1, 1], ['LeftUpLeg', 'backThigh', 1, 1], ['LeftLeg', 'backKnee', 1, 1],
];

interface Driven {
  bone: THREE.Bone;
  rest: THREE.Quaternion;
  /** the body's side-to-side axis, in the bone's parent space at rest */
  axis: THREE.Vector3;
}

interface Cloth extends Driven {
  angle: number;
  speed: number;
  prevLeg: number;
  leg: keyof Pose;
}

/** A real model as a Body. `template` comes from loadModel. */
export function skinnedBody(template: THREE.Group, id: string, alt: boolean): Body {
  const model = cloneSkinned(template) as THREE.Group;
  const root = new THREE.Group();
  const yaw = new THREE.Group();
  const pivot = new THREE.Group();
  root.add(yaw);
  yaw.add(pivot);
  pivot.add(model);
  const materials: THREE.MeshStandardMaterial[] = [];
  const outlines: Outline[] = [];
  const sides: { value: number }[] = [];
  const swap = alt ? SWAPS[id] : undefined;

  const meshes: THREE.Mesh[] = [];
  model.traverse((o) => { if ((o as THREE.Mesh).isMesh) meshes.push(o as THREE.Mesh); });
  for (const mesh of meshes) {
    const src = mesh.material as THREE.MeshStandardMaterial;
    // PBR base (normal map and roughness from the GLB) under the toon bands of sf4.ts; both faces, since
    // a generated mesh has open edges that look like missing parts from behind (the outline stays BackSide)
    const mat = new THREE.MeshStandardMaterial({
      color: src.color, map: src.map, normalMap: src.normalMap, normalScale: src.normalScale,
      roughness: src.roughness, roughnessMap: src.roughnessMap, metalness: src.metalness, metalnessMap: src.metalnessMap,
      side: THREE.DoubleSide,
    });
    if (swap && src.map) {
      mat.onBeforeCompile = swapShader(swap);
      mat.customProgramCacheKey = () => `nf-swap-${id}`;
    }
    sides.push(applySf4(mat));
    for (const tex of [src.map, src.normalMap]) {
      if (!tex) continue;
      tex.anisotropy = anisotropy;
      tex.generateMipmaps = true;
      tex.minFilter = THREE.LinearMipmapLinearFilter;
      tex.needsUpdate = true;
    }
    mesh.material = mat;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    materials.push(mat);
    // an outline shell that bends with the skin: the back faces, pushed out along the normals
    const base = src.map ? new THREE.Color('#1c120b') : src.color.clone().multiplyScalar(0.3);
    // pushed back in depth so it only shows past the silhouette, never through a surface in front
    const omat = new THREE.MeshBasicMaterial({
      color: base, side: THREE.BackSide, polygonOffset: true, polygonOffsetFactor: 4, polygonOffsetUnits: 16,
    });
    outlineNormals(mesh.geometry);
    omat.onBeforeCompile = (shader) => {
      // pushed out in bind space, before skinning, so the shell deforms exactly like the body; along
      // smoothed normals, or a generated mesh's noisy ones poke the shell through the front as streaks
      shader.uniforms.uOutline = SF4.uOutline;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nattribute vec3 outlineNormal;\nuniform float uOutline;')
        .replace('#include <begin_vertex>',
          `#include <begin_vertex>\ntransformed += normalize(outlineNormal) * ${OUTLINE_WIDTH.toFixed(4)} * uOutline;`);
    };
    omat.customProgramCacheKey = () => 'nf-outline';
    let shell: THREE.Mesh;
    if ((mesh as THREE.SkinnedMesh).isSkinnedMesh) {
      const sk = mesh as THREE.SkinnedMesh;
      const s = new THREE.SkinnedMesh(mesh.geometry, omat);
      s.bind(sk.skeleton, sk.bindMatrix);
      shell = s;
    } else {
      shell = new THREE.Mesh(mesh.geometry, omat);
    }
    shell.position.copy(mesh.position);
    shell.quaternion.copy(mesh.quaternion);
    shell.scale.copy(mesh.scale);
    mesh.parent?.add(shell);
    outlines.push({ mat: omat, base: base.clone() });
    mesh.frustumCulled = false;
    shell.frustumCulled = false;
  }

  // the model faces +Z; its side-to-side axis is X. Rotating about -X swings a hanging limb forward,
  // the same way the mannequin's joints turn (see poses.ts).
  model.updateMatrixWorld(true);
  const side = new THREE.Vector3(-1, 0, 0);
  const modelInv = new THREE.Matrix4().copy(model.matrixWorld).invert();
  const restIn = (node: THREE.Object3D): THREE.Quaternion => {
    const m = new THREE.Matrix4().multiplyMatrices(modelInv, node.matrixWorld);
    const q = new THREE.Quaternion();
    m.decompose(new THREE.Vector3(), q, new THREE.Vector3());
    return q;
  };
  const bones = new Map<string, THREE.Bone>();
  model.traverse((o) => { if ((o as THREE.Bone).isBone) bones.set(o.name, o as THREE.Bone); });
  // the poses expect arms that hang at rest; a Mixamo rig rests in a T-pose, so its arms are lowered
  // first (an authored clip sets every bone itself and is not affected)
  const at = (node: THREE.Object3D): THREE.Vector3 =>
    new THREE.Vector3().setFromMatrixPosition(new THREE.Matrix4().multiplyMatrices(modelInv, node.matrixWorld));
  for (const name of ['LeftArm', 'RightArm']) {
    const bone = bones.get(name);
    const child = bones.get(name.replace('Arm', 'ForeArm'));
    if (!bone || !child || !bone.parent) continue;
    const dir = at(child).sub(at(bone)).normalize();
    if (dir.y < -0.7) continue;
    const hang = new THREE.Vector3(Math.sign(dir.x) * 0.25, -1, 0.05).normalize();
    const parent = restIn(bone.parent);
    const turnTo = new THREE.Quaternion().setFromUnitVectors(dir, hang);
    bone.quaternion.premultiply(parent.clone().invert().multiply(turnTo).multiply(parent));
    model.updateMatrixWorld(true);
  }
  const restAll = [...bones.values()].map((b) => ({ b, q: b.quaternion.clone(), p: b.position.clone() }));
  const drive = (name: string): Driven | null => {
    const bone = bones.get(name);
    if (!bone || !bone.parent) return null;
    const axis = side.clone().applyQuaternion(restIn(bone.parent).invert()).normalize();
    return { bone, rest: bone.quaternion.clone(), axis };
  };
  const driven = DRIVE.flatMap(([name, field, sign, share]) => {
    const d = drive(name);
    return d ? [{ d, field, sign, share }] : [];
  });
  const hips = bones.get('Hips');
  const hipsRest = hips ? hips.position.clone() : new THREE.Vector3();
  const hipsHeight = hips ? new THREE.Vector3().setFromMatrixPosition(new THREE.Matrix4().multiplyMatrices(modelInv, hips.matrixWorld)).y : 1;
  const hipsUpLocal = new THREE.Vector3(0, 1, 0);
  if (hips?.parent) {
    const inv = new THREE.Matrix4().multiplyMatrices(modelInv, hips.parent.matrixWorld).invert();
    hipsUpLocal.applyMatrix3(new THREE.Matrix3().setFromMatrix4(inv));
  }
  const cloth: Cloth[] = [];
  for (const [name, leg] of [['cloth_trouser_R', 'frontThigh'], ['cloth_trouser_L', 'backThigh']] as const) {
    const d = drive(name);
    if (d) cloth.push({ ...d, angle: 0, speed: 0, prevLeg: 0, leg });
  }
  const q = new THREE.Quaternion();
  const fadeTo = new THREE.Quaternion();
  const pivotAxis = new THREE.Vector3(-1, 0, 0);
  let turn = THREE_QUARTER;

  // authored clips, sampled at the time clips.ts gives (never advanced by a clock)
  const clips = (template.userData.clips ?? {}) as Record<string, ClipInfo>;
  // each clip as tracks sampled straight onto the bones, every frame. (An AnimationMixer only writes a
  // bone when its value changed since it last wrote it, so a held moment, like a knockdown lying still or
  // any clip frozen in hit-stop, would leave the bones as the blend last left them: standing up.)
  interface Track { node: THREE.Object3D; prop: 'quaternion' | 'position' | 'scale'; at: THREE.Interpolant }
  const actions = new Map<string, { duration: number; tracks: Track[] }>();
  for (const clip of model.animations) {
    if (!clips[clip.name]) continue;
    const tracks: Track[] = [];
    for (const track of clip.tracks) {
      const { nodeName, propertyName } = THREE.PropertyBinding.parseTrackName(track.name);
      const node = model.getObjectByName(nodeName);
      if (!node || !(propertyName === 'quaternion' || propertyName === 'position' || propertyName === 'scale')) continue;
      // every keyframe track builds its own interpolant (slerp for quaternions); the typings omit it
      const interpolant = (track as unknown as { createInterpolant(): THREE.Interpolant }).createInterpolant();
      tracks.push({ node, prop: propertyName, at: interpolant });
    }
    actions.set(clip.name, { duration: clip.duration, tracks });
  }
  const sample = (a: { duration: number; tracks: Track[] }, time: number): void => {
    const t = Math.max(0, Math.min(time, a.duration));
    for (const tr of a.tracks) tr.node[tr.prop].fromArray(tr.at.evaluate(t) as unknown as number[]);
  };
  // a change of clip, or between a clip and the poses, fades over FADE seconds from the last frame drawn
  let source = '';
  let fade = 1;
  const from = restAll.map((r) => ({ q: r.q.clone(), p: r.p.clone() }));

  const chest = bones.get('Spine2') ?? bones.get('Spine1');
  const torsoAt = new THREE.Vector3();
  const hipsAt = new THREE.Vector3();
  // the points that rest on the floor, each with its height above the floor when touching it: the feet
  // and toes at their rest height (the model stands on the floor at rest), the body's other parts by
  // their thickness
  const contactAt = new THREE.Vector3();
  // the points the floor clamp follows, as skinned vertices (exact, wherever the pose puts them): the
  // soles (the foot bones sit at the ankles, centimetres above them) and a sample of the whole body
  const skinned = meshes.filter((m): m is THREE.SkinnedMesh => (m as THREE.SkinnedMesh).isSkinnedMesh);
  model.updateMatrixWorld(true);
  const soles: { mesh: THREE.SkinnedMesh; index: number }[] = [];
  for (const mesh of skinned) {
    const n = mesh.geometry.getAttribute('position').count;
    const low: number[] = [];
    for (let i = 0; i < n; i++) {
      mesh.getVertexPosition(i, contactAt).applyMatrix4(mesh.matrixWorld).applyMatrix4(modelInv);
      if (contactAt.y < SOLE_HEIGHT) low.push(i);
    }
    const stride = Math.max(1, Math.floor(low.length / SOLE_SAMPLES));
    for (let i = 0; i < low.length; i += stride) soles.push({ mesh, index: low[i] });
    // and an even sample of the whole body: knees, hands, the back and head when crouching or lying
    const every = Math.max(1, Math.floor(n / BODY_SAMPLES));
    for (let i = 0; i < n; i += every) soles.push({ mesh, index: i });
  }
  const lowestPoint = (): number => {
    let low = Infinity;
    for (const v of soles) low = Math.min(low, v.mesh.getVertexPosition(v.index, contactAt).applyMatrix4(v.mesh.matrixWorld).y);
    return low;
  };

  // arm clearance (per character, animsets/*.json): the upper arms turn out from the body, and further
  // where a hand would still come inside the torso; the elbows follow the upper arm out
  const clearance = animSet(id)?.armClearance ?? { degrees: 0, torsoRadius: 0 };
  const spineTop = bones.get('Neck') ?? chest;
  const arms = (['Left', 'Right'] as const).flatMap((sideName) => {
    const upper = bones.get(`${sideName}Arm`);
    const hand = bones.get(`${sideName}Hand`);
    return upper && hand && upper.parent ? [{ upper, hand, out: sideName === 'Left' ? 1 : -1 }] : [];
  });
  const modelNow = new THREE.Matrix4();
  const parentRot = new THREE.Quaternion();
  const turnQ = new THREE.Quaternion();
  const scratch = new THREE.Vector3();
  const axisUp = new THREE.Vector3(-1, 0, 0);
  const axisOut = new THREE.Vector3(0, 0, 1);
  /** turn a bone by `angle` about an axis given in model space (the model's current pose) */
  const turnInModel = (bone: THREE.Bone, axis: THREE.Vector3, angle: number): void => {
    if (!bone.parent || angle === 0) return;
    modelNow.copy(model.matrixWorld).invert().multiply(bone.parent.matrixWorld);
    modelNow.decompose(scratch, parentRot, contactAt);
    turnQ.setFromAxisAngle(axis, angle);
    bone.quaternion.premultiply(parentRot.clone().invert().multiply(turnQ).multiply(parentRot));
  };
  /** turn a bone by `angle` about an axis given in world space */
  const turnInWorld = (bone: THREE.Bone, axis: THREE.Vector3, angle: number): void => {
    if (!bone.parent || angle === 0) return;
    bone.parent.getWorldQuaternion(parentRot);
    turnQ.setFromAxisAngle(axis, angle);
    bone.quaternion.premultiply(parentRot.clone().invert().multiply(turnQ).multiply(parentRot));
  };
  const spineA = new THREE.Vector3();
  const spineB = new THREE.Vector3();
  /** the point of the spine (hips to neck) nearest to p */
  const spineClosest = (p: THREE.Vector3): THREE.Vector3 => {
    if (!hips || !spineTop) return p.clone();
    const a = hips.getWorldPosition(new THREE.Vector3());
    const ax = spineTop.getWorldPosition(new THREE.Vector3()).sub(a);
    const k = Math.max(0, Math.min(1, p.clone().sub(a).dot(ax) / Math.max(1e-6, ax.lengthSq())));
    return a.addScaledVector(ax, k);
  };
  /** how close a hand comes to the spine (the line from the hips to the neck), in metres */
  const handGap = (hand: THREE.Bone): number => {
    if (!hips || !spineTop) return Infinity;
    hips.getWorldPosition(spineA);
    spineTop.getWorldPosition(spineB);
    const p = hand.getWorldPosition(scratch);
    const ax = spineB.sub(spineA);
    const k = Math.max(0, Math.min(1, p.clone().sub(spineA).dot(ax) / Math.max(1e-6, ax.lengthSq())));
    return p.sub(spineA.addScaledVector(ax, k)).length();
  };
  const placeArms = (aim: number): void => {
    if (!arms.length) return;
    root.updateMatrixWorld(true);
    for (const a of arms) {
      turnInModel(a.upper, axisUp, THREE.MathUtils.degToRad(aim));
      turnInModel(a.upper, axisOut, a.out * THREE.MathUtils.degToRad(clearance.degrees));
    }
    // then, a few times over, any hand still inside the torso is swung straight out from the spine
    // (whichever way the arm points: down at the side, or across the chest in a hook or a spin)
    for (let pass = 0; pass < 5; pass++) {
      root.updateMatrixWorld(true);
      let moved = false;
      for (const a of arms) {
        const gap = handGap(a.hand);
        if (gap >= clearance.torsoRadius) continue;
        const shoulder = a.upper.getWorldPosition(new THREE.Vector3());
        const hand = a.hand.getWorldPosition(new THREE.Vector3());
        const away = hand.clone().sub(spineClosest(hand));
        if (away.lengthSq() < 1e-8) away.set(a.out, 0, 0).applyQuaternion(model.getWorldQuaternion(turnQ));
        const reach = hand.clone().sub(shoulder);
        const axis = reach.clone().cross(away).normalize();
        if (axis.lengthSq() < 0.5) continue;
        turnInWorld(a.upper, axis, Math.min(0.5, (clearance.torsoRadius - gap) / Math.max(0.2, reach.length())));
        moved = true;
      }
      if (!moved) break;
    }
  };

  return {
    kind: 'model', root, materials, outlines, clips,
    measure() {
      // dev checks: the lowest vertex of the whole body above the floor, and how close a hand comes to the spine
      root.updateMatrixWorld(true);
      let low = Infinity;
      let high = -Infinity;
      for (const mesh of skinned) {
        const n = mesh.geometry.getAttribute('position').count;
        for (let i = 0; i < n; i += 3) {
          const y = mesh.getVertexPosition(i, contactAt).applyMatrix4(mesh.matrixWorld).y;
          low = Math.min(low, y);
          high = Math.max(high, y);
        }
      }
      return { lowest: low - root.position.y, highest: high - root.position.y, handGap: Math.min(...arms.map((a) => handGap(a.hand))) };
    },
    torso() {
      if (!chest || !hips) return root.getWorldPosition(torsoAt);
      chest.getWorldPosition(torsoAt);
      hips.getWorldPosition(hipsAt);
      return torsoAt.add(hipsAt).multiplyScalar(0.5);
    },
    apply(pose, facing, dt, vx, striking, clip, grounded = false) {
      for (const s of sides) s.value = facing;
      const action = clip ? actions.get(clip.name) : undefined;
      const aim = action ? CLIP_TURN : striking ? STRIKE_TURN : THREE_QUARTER;
      turn += (aim - turn) * (1 - Math.pow(striking ? 0.35 : 0.8, dt * 60));
      yaw.rotation.y = facing * (Math.PI / 2 - turn);
      const key = action && clip ? clip.name : 'pose';
      if (key !== source) {
        if (source) restAll.forEach((r, i) => { from[i].q.copy(r.b.quaternion); from[i].p.copy(r.b.position); });
        // an entry may cut straight in (a body landing flat for a knockdown should not rise from the last pose)
        fade = source && !clip?.snap ? 0 : 1;
        source = key;
      }
      if (action && clip) {
        pivot.position.y = 0;
        // an entry may tip the whole body back (a hit reaction played as an air hit)
        pivot.quaternion.setFromAxisAngle(pivotAxis, THREE.MathUtils.degToRad(clip.lean ?? 0));
        // bones the clip does not key keep their rest pose
        for (const r of restAll) { r.b.quaternion.copy(r.q); r.b.position.copy(r.p); }
        sample(action, clip.time);
      } else {
        pivot.position.y = pose.lift;
        pivot.quaternion.setFromAxisAngle(pivotAxis, pose.body);
        for (const r of restAll) { r.b.quaternion.copy(r.q); r.b.position.copy(r.p); }
        for (const e of driven) {
          q.setFromAxisAngle(e.d.axis, (pose[e.field] as number) * e.sign * e.share);
          e.d.bone.quaternion.multiplyQuaternions(q, e.d.rest);
        }
        if (hips) hips.position.copy(hipsRest).addScaledVector(hipsUpLocal, -(1 - pose.hips) * hipsHeight);
      }
      if (fade < 1) {
        // at least one sim frame per draw: stepping the sim by hand (or a slow frame) still finishes the blend
        fade = Math.min(1, fade + Math.max(dt, 1 / 60) / FADE);
        const k = fade * fade * (3 - 2 * fade);
        restAll.forEach((r, i) => {
          // slerpQuaternions copies its first argument into the target before reading the second, so
          // blending into the bone's own quaternion read back the *old* pose: every cross-fade froze
          // the body on the last pose for the whole fade, then snapped to the new one (the stiff,
          // glitchy look). Blend from a copy of the new pose instead.
          fadeTo.copy(r.b.quaternion);
          r.b.quaternion.slerpQuaternions(from[i].q, fadeTo, k);
          r.b.position.lerpVectors(from[i].p, r.b.position, k);
        });
      }
      // arms clear of the torso (clips and poses alike), raised where a clip entry aims the strike upward
      placeArms(action && clip ? clip.aim ?? 0 : 0);
      // cloth: trouser legs lag behind the leg's swing and the body's run, then spring back
      const step = Math.min(dt, 1 / 30);
      for (const c of cloth) {
        const leg = pose[c.leg] as number;
        const swing = step > 0 ? (leg - c.prevLeg) / step : 0;
        c.prevLeg = leg;
        const target = Math.max(-0.5, Math.min(0.5, -0.04 * swing - 0.12 * vx));
        c.speed += ((target - c.angle) * 140 - c.speed * 12) * step;
        c.angle += c.speed * step;
        q.setFromAxisAngle(c.axis, c.angle);
        c.bone.quaternion.multiplyQuaternions(q, c.rest);
      }
      // grounded, in every action: the lowest point of the body (a sole, or a knee, hand, back or head
      // when crouching or lying down) is put exactly on the floor. Only a procedural hop (pose.lift) may leave it.
      // In the air nothing may dip under the floor either (a body tipped back pivots on its feet).
      root.updateMatrixWorld(true);
      const off = FLOOR_CLEARANCE - lowestPoint(); // the floor is world height 0
      if (grounded ? off > 0 || action || pose.lift <= 0 : off > 0) {
        pivot.position.y += off;
        root.updateMatrixWorld(true);
      }
    },
  };
}
