// Placeholder fighters (spec 4.6): a jointed low-poly humanoid in the character's sheet colours, with
// their silhouette props as simple shapes. Toon shading and an inverted-hull outline. Swapped for the
// real GLB models later without touching the sim.

import * as THREE from 'three';
import type { CharacterData, Palette } from '../sim/types';
import type { Pose } from './poses';

const ramps = new Map<number, THREE.DataTexture>();
/**
 * The 3-step light ramp for the toon material (spec 4.2). `softness` 0 gives hard bands (the
 * mannequins); up to 1 blends each step into the next (the painted real models).
 */
export function toonRamp(softness = 0): THREE.DataTexture {
  const cached = ramps.get(softness);
  if (cached) return cached;
  const levels = [90, 175, 255];
  const width = softness > 0 ? 64 : 3;
  const data = new Uint8Array(width * 4);
  for (let i = 0; i < width; i++) {
    const t = ((i + 0.5) / width) * 3;
    const step = Math.min(2, Math.floor(t));
    // the last `softness` share of each band eases into the next one
    const e = softness > 0 && step < 2 ? Math.max(0, (t - step - (1 - softness)) / softness) : 0;
    const v = levels[step] + (step < 2 ? (levels[step + 1] - levels[step]) * e * e * (3 - 2 * e) : 0);
    data.set([v, v, v, 255], i * 4);
  }
  const ramp = new THREE.DataTexture(data, width, 1, THREE.RGBAFormat);
  ramp.minFilter = ramp.magFilter = softness > 0 ? THREE.LinearFilter : THREE.NearestFilter;
  ramp.needsUpdate = true;
  ramps.set(softness, ramp);
  return ramp;
}

export interface Rig {
  root: THREE.Group;
  body: THREE.Group;
  hips: THREE.Group;
  torso: THREE.Group;
  head: THREE.Group;
  frontArm: THREE.Group;
  frontElbow: THREE.Group;
  backArm: THREE.Group;
  backElbow: THREE.Group;
  frontThigh: THREE.Group;
  frontKnee: THREE.Group;
  backThigh: THREE.Group;
  backKnee: THREE.Group;
  hipsHeight: number;
  materials: THREE.MeshToonMaterial[];
}

/** A shape with its toon material and an outline shell in a darker shade of the same colour. */
function part(geo: THREE.BufferGeometry, colour: string, mats: THREE.MeshToonMaterial[]): THREE.Mesh {
  const mat = new THREE.MeshToonMaterial({ color: colour, gradientMap: toonRamp() });
  mats.push(mat);
  const mesh = new THREE.Mesh(geo, mat);
  const outline = new THREE.Mesh(
    geo,
    new THREE.MeshBasicMaterial({ color: new THREE.Color(colour).multiplyScalar(0.25), side: THREE.BackSide }),
  );
  outline.scale.setScalar(1.06);
  mesh.add(outline);
  mesh.castShadow = false;
  return mesh;
}

/** A limb segment hanging down from its joint. */
function limb(len: number, radius: number, colour: string, mats: THREE.MeshToonMaterial[]): THREE.Mesh {
  const m = part(new THREE.CapsuleGeometry(radius, Math.max(0.01, len - 2 * radius), 4, 10), colour, mats);
  m.position.y = -len / 2;
  return m;
}

function joint(parent: THREE.Object3D, x: number, y: number, z: number): THREE.Group {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  parent.add(g);
  return g;
}

/** Build the mannequin for a character; `alt` uses the second colourway (spec 4.2: a palette swap). */
export function buildMannequin(c: CharacterData, alt: boolean): Rig {
  const p: Palette = alt ? c.palette2 : c.palette;
  const h = c.height / 100; // metres
  const mats: THREE.MeshToonMaterial[] = [];
  const root = new THREE.Group();
  const body = joint(root, 0, 0, 0);
  const hipsHeight = 0.52 * h;
  const hips = joint(body, 0, hipsHeight, 0);
  const torso = joint(hips, 0, 0, 0);

  const isIya = c.id === 'iya-matthew';
  const isEgbon = c.id === 'egbon-razak';
  const isChief = c.id === 'chief-priest';
  const torsoLen = 0.3 * h;
  const torsoR = (isIya ? 0.13 : isEgbon ? 0.1 : 0.115) * h;

  // torso and pelvis
  const chest = part(new THREE.CapsuleGeometry(torsoR, torsoLen - torsoR, 4, 12), p.primary, mats);
  chest.position.y = torsoLen / 2 + 0.02 * h;
  chest.scale.set(1, 1, 0.75);
  torso.add(chest);
  const pelvisColour = isEgbon ? p.secondary : isIya ? p.secondary : p.primary;
  const pelvis = part(new THREE.SphereGeometry(torsoR * 0.95, 12, 8), pelvisColour, mats);
  pelvis.scale.set(1, 0.7, 0.8);
  hips.add(pelvis);

  // head
  const head = joint(torso, 0, torsoLen + 0.06 * h, 0);
  const skull = part(new THREE.SphereGeometry(0.065 * h, 14, 10), p.skin, mats);
  skull.position.y = 0.06 * h;
  head.add(skull);

  // arms: the front (striking) arm is on the camera side
  const armLen = 0.17 * h;
  const foreLen = 0.16 * h;
  const armR = (isIya ? 0.042 : 0.036) * h;
  const shoulderY = torsoLen - 0.01 * h;
  const frontArm = joint(torso, 0.01 * h, shoulderY, torsoR * 0.85);
  const backArm = joint(torso, -0.01 * h, shoulderY, -torsoR * 0.85);
  const sleeve = isChief ? p.primary : p.skin;
  frontArm.add(limb(armLen, armR, sleeve, mats));
  backArm.add(limb(armLen, armR, sleeve, mats));
  const frontElbow = joint(frontArm, 0, -armLen, 0);
  const backElbow = joint(backArm, 0, -armLen, 0);
  frontElbow.add(limb(foreLen, armR * 0.92, p.skin, mats));
  backElbow.add(limb(foreLen, armR * 0.92, p.skin, mats));
  for (const e of [frontElbow, backElbow]) {
    const hand = part(new THREE.SphereGeometry(armR * 1.25, 10, 8), p.skin, mats);
    hand.position.y = -foreLen;
    e.add(hand);
  }

  // legs
  const thighLen = 0.255 * h;
  const shinLen = 0.25 * h;
  const legR = (isEgbon ? 0.07 : isIya ? 0.06 : 0.05) * h;
  const legColour = isEgbon ? p.secondary : p.skin;
  const frontThigh = joint(hips, 0.01 * h, 0, 0.07 * h);
  const backThigh = joint(hips, -0.01 * h, 0, -0.07 * h);
  frontThigh.add(limb(thighLen, legR, legColour, mats));
  backThigh.add(limb(thighLen, legR, legColour, mats));
  const frontKnee = joint(frontThigh, 0, -thighLen, 0);
  const backKnee = joint(backThigh, 0, -thighLen, 0);
  frontKnee.add(limb(shinLen, legR * (isEgbon ? 1 : 0.85), isEgbon ? p.secondary : p.skin, mats));
  backKnee.add(limb(shinLen, legR * (isEgbon ? 1 : 0.85), isEgbon ? p.secondary : p.skin, mats));
  for (const k of [frontKnee, backKnee]) {
    const foot = part(new THREE.BoxGeometry(0.13 * h, 0.035 * h, 0.06 * h), p.extra, mats);
    foot.position.set(0.035 * h, -shinLen - 0.01 * h, 0);
    k.add(foot);
  }

  const rig: Rig = {
    root, body, hips, torso, head, frontArm, frontElbow, backArm, backElbow, frontThigh, frontKnee, backThigh, backKnee,
    hipsHeight, materials: mats,
  };
  addProps(c.id, rig, p, h, mats);
  return rig;
}

/** Each character's silhouette props, from the reference sheets. */
function addProps(id: string, r: Rig, p: Palette, h: number, mats: THREE.MeshToonMaterial[]): void {
  const headTop = 0.12 * h;
  if (id === 'egbon-razak') {
    // high-top afro with a fade, gold chain
    const hair = part(new THREE.CylinderGeometry(0.055 * h, 0.06 * h, 0.07 * h, 10), p.extra, mats);
    hair.position.y = headTop + 0.01 * h;
    r.head.add(hair);
    const chain = part(new THREE.TorusGeometry(0.06 * h, 0.006 * h, 6, 16), '#d9a92e', mats);
    chain.rotation.x = Math.PI / 2;
    chain.position.y = 0.28 * h;
    r.torso.add(chain);
  }
  if (id === 'iya-matthew') {
    // gele with a yellow band, gold earrings, puff sleeves and a long wrapper with blue bands
    const gele = part(new THREE.SphereGeometry(0.1 * h, 14, 10), p.primary, mats);
    gele.scale.set(1.15, 0.8, 1.05);
    gele.position.set(-0.01 * h, headTop + 0.02 * h, 0);
    r.head.add(gele);
    const band = part(new THREE.TorusGeometry(0.068 * h, 0.012 * h, 6, 18), p.secondary, mats);
    band.rotation.x = Math.PI / 2;
    band.position.y = headTop - 0.02 * h;
    r.head.add(band);
    for (const z of [-1, 1]) {
      const ear = part(new THREE.SphereGeometry(0.012 * h, 8, 6), '#e2b23a', mats);
      ear.position.set(0, 0.04 * h, z * 0.06 * h);
      r.head.add(ear);
    }
    for (const arm of [r.frontArm, r.backArm]) {
      const puff = part(new THREE.SphereGeometry(0.06 * h, 12, 8), p.primary, mats);
      puff.position.y = -0.03 * h;
      arm.add(puff);
    }
    const wrapper = part(new THREE.CylinderGeometry(0.15 * h, 0.23 * h, 0.5 * h, 16, 1, true), p.secondary, mats);
    wrapper.position.y = -0.24 * h;
    r.hips.add(wrapper);
    for (const y of [-0.38, -0.46]) {
      const stripe = part(new THREE.TorusGeometry(0.205 * h + (y + 0.38) * -0.2 * h, 0.01 * h, 6, 24), p.primary, mats);
      stripe.rotation.x = Math.PI / 2;
      stripe.position.y = y * h;
      r.hips.add(stripe);
    }
  }
  if (id === 'chief-priest') {
    // red knitted cap with tassel, long white robe, striped vest with a red sash, a carved staff
    const cap = part(new THREE.CylinderGeometry(0.062 * h, 0.068 * h, 0.06 * h, 12), p.accent, mats);
    cap.position.y = headTop;
    r.head.add(cap);
    const tassel = part(new THREE.ConeGeometry(0.02 * h, 0.07 * h, 6), p.accent, mats);
    tassel.position.set(-0.06 * h, headTop - 0.02 * h, 0);
    r.head.add(tassel);
    const robe = part(new THREE.CylinderGeometry(0.12 * h, 0.2 * h, 0.62 * h, 16, 1, true), p.primary, mats);
    robe.position.y = -0.22 * h;
    r.hips.add(robe);
    const vest = part(new THREE.BoxGeometry(0.2 * h, 0.27 * h, 0.17 * h), p.secondary, mats);
    vest.position.y = 0.17 * h;
    r.torso.add(vest);
    const sash = part(new THREE.BoxGeometry(0.03 * h, 0.32 * h, 0.18 * h), p.accent, mats);
    sash.position.set(0.1 * h, 0.13 * h, 0);
    r.torso.add(sash);
    const staff = part(new THREE.CylinderGeometry(0.012 * h, 0.014 * h, 1.0 * h, 8), '#5a3a22', mats);
    staff.position.set(0, -0.16 * h, 0);
    r.frontElbow.add(staff);
    const top = part(new THREE.SphereGeometry(0.035 * h, 8, 6), p.accent, mats);
    top.position.set(0, 0.34 * h, 0);
    staff.add(top);
  }
}

/** Apply a pose to the rig. Angles: see poses.ts. */
export function applyPose(r: Rig, pose: Pose): void {
  r.body.rotation.z = -pose.body;
  r.body.position.y = pose.lift;
  r.hips.position.y = r.hipsHeight * pose.hips;
  r.torso.rotation.z = -pose.torso;
  r.head.rotation.z = -pose.head;
  r.frontArm.rotation.z = pose.frontArm;
  r.frontElbow.rotation.z = pose.frontElbow;
  r.backArm.rotation.z = pose.backArm;
  r.backElbow.rotation.z = pose.backElbow;
  r.frontThigh.rotation.z = pose.frontThigh;
  r.frontKnee.rotation.z = pose.frontKnee;
  r.backThigh.rotation.z = pose.backThigh;
  r.backKnee.rotation.z = pose.backKnee;
}
