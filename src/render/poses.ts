// The placeholder mannequin's pose for a fighter state: joint angles from (action, frame), so the
// animation can never drift from the frame data (spec 3.3). Pure; no three.js. Angles are radians
// in the side-on plane: a limb hanging down rotated by +pi/2 points forward (toward the opponent).

import type { FighterState, MoveData } from '../sim/types';

export interface Pose {
  /** hips height as a share of standing hips height (1 = standing) */
  hips: number;
  /** extra lift of the whole body in metres (hops) */
  lift: number;
  /** whole-body rotation (positive tips backward), for falls */
  body: number;
  torso: number;
  head: number;
  frontArm: number;
  frontElbow: number;
  backArm: number;
  backElbow: number;
  frontThigh: number;
  frontKnee: number;
  backThigh: number;
  backKnee: number;
}

export const GUARD: Pose = {
  hips: 0.96, lift: 0, body: 0, torso: 0.12, head: -0.08,
  frontArm: 0.9, frontElbow: 1.2, backArm: 0.5, backElbow: 1.7,
  frontThigh: 0.32, frontKnee: -0.3, backThigh: -0.28, backKnee: -0.2,
};

const CROUCH: Pose = {
  ...GUARD, hips: 0.6, torso: 0.3, frontThigh: 1.15, frontKnee: -1.9, backThigh: 0.6, backKnee: -1.9,
};

/** the strike pose of each placeholder animation family, applied over the guard (or crouch) pose */
const STRIKES: Record<string, Partial<Pose>> = {
  punch_high: { frontArm: 1.6, frontElbow: 0, torso: 0.25 },
  punch_low: { ...CROUCH, frontArm: 1.25, frontElbow: 0, torso: 0.45 },
  kick_low: { ...CROUCH, frontThigh: 1.45, frontKnee: 0, torso: -0.1 },
  haymaker: { frontArm: 1.75, frontElbow: 0.1, torso: 0.45, backArm: -0.4 },
  uppercut: { hips: 1, frontArm: 2.9, frontElbow: 0.25, torso: -0.1, lift: 0.08 },
  overhead: { frontArm: 1.2, frontElbow: 0.2, torso: 0.5, lift: 0.1 },
  shoulder: { torso: 0.55, frontArm: 0.3, frontElbow: 2.0, frontThigh: 0.6 },
  headbutt: { torso: 0.75, head: 0.4, frontArm: 0.2, backArm: -0.3 },
  staff_poke: { frontArm: 1.55, frontElbow: 0, backArm: 1.3, backElbow: 0.4, torso: 0.2 },
  staff_low: { ...CROUCH, frontArm: 1.2, frontElbow: 0, backArm: 1.0, backElbow: 0.3 },
  staff_swing: { frontArm: 1.9, frontElbow: 0.1, backArm: 1.6, torso: 0.35 },
  slam: { frontArm: 1.1, frontElbow: 0, backArm: 1.0, torso: 0.7, hips: 0.85 },
  air_knee: { frontThigh: 1.5, frontKnee: -1.8, backThigh: 0.3, backKnee: -1.0 },
  air_kick: { frontThigh: 1.55, frontKnee: -0.05, backThigh: -0.2, backKnee: -1.2, torso: -0.2 },
  air_punch: { frontArm: 1.0, frontElbow: 0, torso: 0.55, frontThigh: 0.7, frontKnee: -1.3 },
  air_splash: { body: -0.2, torso: 1.2, frontArm: 1.4, backArm: 1.4, frontThigh: 0.2, backThigh: 0.2 },
  dash_punch: { frontArm: 1.65, frontElbow: 0, torso: 0.6, backArm: -0.7, frontThigh: 0.9, frontKnee: -0.6, backThigh: -0.9, hips: 0.88 },
  slap: { frontArm: 1.45, frontElbow: 0.15, torso: 0.3, backArm: 0.2, head: 0.1 },
  sweep: { ...CROUCH, hips: 0.42, frontThigh: 1.55, frontKnee: 0, torso: -0.25, backArm: -0.6 },
  barge: { torso: 0.7, frontArm: 0.2, frontElbow: 2.2, backArm: 0.4, frontThigh: 0.7, backThigh: -0.6, lift: 0.04 },
  rising: { hips: 1, lift: 0.35, torso: -0.05, frontArm: 2.6, frontElbow: 0.5, backArm: 0.4, frontThigh: 0.9, frontKnee: -1.2 },
  hop_kick: { lift: 0.3, torso: -0.15, frontThigh: 1.5, frontKnee: -0.1, backThigh: 0.2, backKnee: -1.4, frontArm: 0.4 },
  slide: { body: -0.9, hips: 0.35, frontThigh: 1.5, frontKnee: 0, backThigh: 0.9, backKnee: -1.2, frontArm: -0.4, backArm: -0.8 },
  feint: { torso: 0.5, frontThigh: 0.9, backThigh: -0.8, frontArm: 0.3, backArm: -0.5 },
  flurry: { frontArm: 1.6, frontElbow: 0, backArm: 1.0, backElbow: 1.0, torso: 0.35 },
  grab: { frontArm: 1.5, frontElbow: 0.4, backArm: 1.4, backElbow: 0.5, torso: 0.4 },
  throw: { frontArm: 1.5, frontElbow: 0.4, backArm: 1.4, backElbow: 0.5, torso: 0.35 },
};

/** the wind-up just before the strike: the arm or leg draws back */
const WINDUPS: Record<string, Partial<Pose>> = {
  punch_high: { frontArm: 0.6, frontElbow: 1.8, torso: 0.05 },
  haymaker: { frontArm: -0.5, frontElbow: 1.4, torso: -0.15 },
  overhead: { frontArm: 2.9, frontElbow: 0.4, torso: -0.2 },
  uppercut: { ...CROUCH, frontArm: 0.4, frontElbow: 1.6 },
  slam: { frontArm: 2.8, backArm: 2.6, torso: -0.3 },
  staff_swing: { frontArm: -0.6, backArm: -0.4, torso: -0.2 },
  dash_punch: { frontArm: 0.3, frontElbow: 1.9, torso: 0.4, hips: 0.85, frontThigh: 0.7, backThigh: -0.7 },
  slap: { frontArm: 2.4, frontElbow: 0.6, torso: -0.1 },
  rising: { ...CROUCH, frontArm: 0.5, frontElbow: 1.5, torso: 0.4 },
  hop_kick: { ...CROUCH, torso: 0.2 },
  barge: { torso: 0.2, frontArm: 0.3, frontElbow: 2.0 },
};

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
const ease = (t: number): number => t * t * (3 - 2 * t);

export function blend(a: Pose, b: Partial<Pose>, t: number): Pose {
  const out = { ...a };
  for (const k of Object.keys(b) as (keyof Pose)[]) out[k] = lerp(a[k], b[k] as number, t);
  return out;
}

/** The pose of an attack at this frame: guard, wind-up during startup, strike while active, recover. */
function attackPose(m: MoveData, frame: number, base: Pose): Pose {
  const strike = blend(base, STRIKES[m.anim] ?? STRIKES.punch_high, 1);
  const windup = blend(base, WINDUPS[m.anim] ?? {}, 1);
  const firstActive = m.startup;
  const lastActive = m.startup + m.active - 1 + m.animHoldFrames;
  if (frame < firstActive) {
    const t = frame / firstActive;
    return t < 0.6 ? blend(base, windup, ease(t / 0.6)) : blend(windup, strike, ease((t - 0.6) / 0.4));
  }
  if (frame <= lastActive) {
    // a flurry alternates fists on every hit
    if (m.anim === 'flurry' && m.hitInterval > 0 && Math.floor((frame - firstActive) / m.hitInterval) % 2 === 1) {
      return blend(base, { frontArm: 1.0, frontElbow: 1.0, backArm: 1.65, backElbow: 0, torso: 0.4 }, 1);
    }
    return strike;
  }
  const t = Math.min(1, (frame - lastActive) / Math.max(1, m.recovery));
  return blend(strike, base, ease(t));
}

/** Pose for a fighter state. `t` is render time in seconds, used only for idle breathing. */
export function poseFor(f: FighterState, m: MoveData | null, t: number): Pose {
  const breathe = Math.sin(t * 2.2) * 0.03;
  const idle = { ...GUARD, torso: GUARD.torso + breathe, frontArm: GUARD.frontArm + breathe };
  switch (f.action) {
    case 'idle':
      return idle;
    case 'walk': {
      const s = Math.sin(f.frame * 0.28);
      return { ...idle, frontThigh: 0.3 + s * 0.45, backThigh: -0.3 - s * 0.45, frontKnee: -0.3 - Math.max(0, -s) * 0.7, backKnee: -0.3 - Math.max(0, s) * 0.7 };
    }
    case 'crouch':
      return { ...CROUCH, torso: CROUCH.torso + breathe };
    case 'prejump':
    case 'land':
      return blend(GUARD, CROUCH, 0.5);
    case 'jump':
      return { ...GUARD, hips: 1, frontThigh: 0.9, frontKnee: -1.5, backThigh: 0.4, backKnee: -1.3, frontArm: 1.2 };
    case 'dash':
      return { ...GUARD, torso: 0.45, frontThigh: 0.8, backThigh: -0.7, frontArm: 0.4, backArm: -0.4 };
    case 'backdash':
      return { ...GUARD, torso: -0.3, frontThigh: 0.5, backThigh: -0.2, lift: 0.06 };
    case 'attack':
      return m ? attackPose(m, f.frame, f.crouching || m.input.startsWith('2') ? CROUCH : GUARD) : idle;
    case 'hitstun':
      return blend(f.crouching ? CROUCH : GUARD, { torso: -0.45, head: -0.5, frontArm: 0.3, backArm: -0.2 }, Math.min(1, f.frame / 3));
    case 'blockstun':
      return blend(f.crouching ? CROUCH : GUARD, { frontArm: 2.1, frontElbow: 1.9, backArm: 1.9, backElbow: 2.1, torso: -0.05 }, 1);
    case 'airhit':
    case 'ko':
      return { ...GUARD, body: -Math.min(1.45, 0.2 + f.frame * 0.06), frontArm: 2.2, backArm: 2.6, frontThigh: 0.5 };
    case 'knockdown':
      return { ...GUARD, body: -1.5, hips: 0.2, frontArm: 2.6, backArm: 2.4, frontThigh: 0.2, backThigh: -0.1 };
    case 'getup':
      return blend({ ...GUARD, body: -1.5, hips: 0.2 }, CROUCH, Math.min(1, f.frame / 12));
    case 'grabbing':
      return blend(GUARD, STRIKES.throw, 1);
    case 'grabbed':
      return blend(GUARD, { torso: -0.35, head: -0.3, frontArm: 1.2, backArm: 0.9, frontElbow: 1.4 }, 1);
    case 'taunt': {
      // a beckoning wave of the front hand
      const w = Math.sin(f.frame * 0.35) * 0.5;
      return { ...GUARD, torso: -0.05, head: -0.15, frontArm: 1.9 + w, frontElbow: 1.1 - w, backArm: -0.2 };
    }
    case 'wahala':
      return blend(CROUCH, { hips: 0.85, torso: -0.3, head: -0.4, frontArm: 2.4, backArm: 2.3, frontElbow: 0.4, backElbow: 0.4 }, Math.min(1, f.frame / 8));
    case 'victory':
      return { ...GUARD, frontArm: 3.0, frontElbow: 0.3, torso: -0.1, head: -0.2 };
    default:
      return idle;
  }
}
