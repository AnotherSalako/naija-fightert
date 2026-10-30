// Which authored clip (Mixamo moves, prepared by tools/blender/prepare_character.py) plays for a fighter
// state, and where in it. What plays is data (src/render/animsets/*.json): the first entry whose clip the
// model has. The time comes from the sim's frame counter, never a clock, so a clip stays on its frame
// data: an attack's moment of contact lands on the move's first active frame, and hit-stop freezes it.
// States and moves with no usable entry return null and the procedural poses (poses.ts) take over.

import type { FighterState, MoveData } from '../sim/types';
import type { AnimSet, ClipEntry } from './animsets';
import { KNOCKDOWN_FRAMES, QUICK_RISE_FRAMES } from '../sim/constants';

/** from the model's manifest: the clip's length, its moment of contact and its lowest moment, in seconds */
export interface ClipInfo {
  duration: number;
  contact: number;
  low?: number;
}

export interface ClipPlay {
  name: string;
  time: number;
  /** tip the body back (degrees) */
  lean?: number;
  /** raise the arms (degrees) */
  aim?: number;
  /** cut straight in, without blending from the previous pose */
  snap?: boolean;
  /** blend-in time in seconds when this clip starts; attacks use a short one so a 3-frame jab reaches its pose */
  fadeSeconds?: number;
  /** drop the clip's sideways hips drift */
  center?: boolean;
}

const FPS = 60;
/** an attack clip plays this long before its contact over the startup frames, and this long after over the rest */
const WINDUP = 0.35;
const FOLLOW = 0.6;
/** fastest the clip may run against real time: wind-up, then follow-through */
const MAX_WIND = 2.2;
const MAX_FOLLOW = 1.8;
/** attacks blend in over about two frames: the stance-to-strike blend used to eat the whole startup */
const ATTACK_FADE = 0.035;

/** the animation-set state a fighter is in (directions and stances split some sim actions) */
function stateKey(f: FighterState, vx: number): string {
  switch (f.action) {
    case 'walk': return vx >= 0 ? 'walkForward' : 'walkBack';
    case 'hitstun': return f.crouching ? 'crouchHitstun' : 'hitstun';
    case 'blockstun': return f.crouching ? 'crouchBlockstun' : 'blockstun';
    default: return f.action;
  }
}

/** The clip for this fighter now, or null. `vx` is the forward speed (positive toward the opponent). */
export function clipFor(f: FighterState, m: MoveData | null, vx: number, clips: Record<string, ClipInfo>, set: AnimSet | undefined): ClipPlay | null {
  if (!set) return null;
  const usable = (entries: ClipEntry[] | undefined): ClipEntry | undefined => entries?.find((e) => clips[e.clip]);
  const s = (f.frame - 1) / FPS;

  if (f.action === 'attack') {
    const e = m ? usable(set.moves[m.id]) : undefined;
    if (!m || !e) return null;
    const c = clips[e.clip];
    // the clip's lead-in and follow-through are squeezed into the move's startup and the rest of its
    // frames; capped, so a 3-frame jab no longer plays its whole mocap wind-up at 7x (a blur, then a
    // crawl) but starts closer to the hit and runs at most MAX_WIND / MAX_FOLLOW times real speed
    if (e.native) return { name: e.clip, time: Math.min(c.duration, (f.frame - 1) / FPS), lean: e.lean, aim: e.aim, fadeSeconds: ATTACK_FADE };
    const startupSec = Math.max(1, m.startup) / FPS;
    const followSec = Math.max(1, m.active + m.recovery + m.animHoldFrames) / FPS;
    const start = Math.max(0, c.contact - Math.min(WINDUP, startupSec * MAX_WIND));
    const end = Math.min(c.duration, c.contact + Math.min(FOLLOW, followSec * MAX_FOLLOW));
    let time: number;
    if (f.frame < m.startup) time = start + (c.contact - start) * (f.frame / Math.max(1, m.startup));
    else time = c.contact + (end - c.contact) * Math.min(1, (f.frame - m.startup) / Math.max(1, m.active + m.recovery + m.animHoldFrames));
    return { name: e.clip, time, lean: e.lean, aim: e.aim, fadeSeconds: ATTACK_FADE, center: e.center };
  }

  // getting up begins on the floor, `lead` frames before the knockdown ends, and runs on through the get-up
  const r = set.rise;
  if (r && clips[r.clip] && (f.action === 'knockdown' || f.action === 'getup')) {
    const down = f.quickRise ? QUICK_RISE_FRAMES : KNOCKDOWN_FRAMES[f.knockdownKind === 'hard' ? 'hard' : 'soft'];
    const into = f.action === 'knockdown' ? f.frame - (down - r.lead) : r.lead + f.frame;
    if (into >= 0) return { name: r.clip, time: Math.min(clips[r.clip].duration, r.from + (into / FPS) * r.speed), fadeSeconds: 0.2 };
  }

  // a state may be specialised by the move that led to it ("grabbing:63214H" for the headbutt's hold)
  const key = stateKey(f, vx);
  const e = (f.moveId ? usable(set.states[`${key}:${f.moveId}`]) : undefined) ?? usable(set.states[key]);
  if (!e) return null;
  const c = clips[e.clip];
  const at = (v: 'low' | 'end' | number): number => (v === 'low' ? c.low ?? 0 : v === 'end' ? c.duration : v);
  let time: number;
  if (e.at !== undefined) time = at(e.at);
  else if (e.loop) time = c.duration > 0 ? (s * (e.speed ?? 1)) % c.duration : 0;
  else {
    const from = e.lead !== undefined ? Math.max(0, (c.low ?? 0) - e.lead) : e.from ?? 0;
    time = Math.max(0, Math.min(at(e.until ?? 'end'), from + s * (e.speed ?? 1)));
  }
  return { name: e.clip, time, lean: e.lean, aim: e.aim, snap: e.snap, center: e.center };
}
