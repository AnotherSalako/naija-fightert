// One fighter's own rules: what each action does frame by frame and how the body moves. What the
// player's input starts lives in control.ts, hits in combat.ts and rounds in step.ts.

import {
  GETUP_FRAMES, KNOCKDOWN_FRAMES, LANDING_FRAMES, PREJUMP_FRAMES, QUICK_RISE_FRAMES, STAGE_HALF_WIDTH, SUB, px,
  AIR_HIT_GRAVITY, FLOOR_BOUNCE, JUMP_HANG_SPEED, THROW, TAUNT, WAHALA,
} from './constants';
import { character, followers } from './data/characters';
import { isDown } from './input';
import type { CharacterData, FighterState, MoveData, SimEvent, Side } from './types';

export function createFighter(charId: string, x: number, facing: 1 | -1): FighterState {
  return {
    charId, x, y: 0, vx: 0, vy: 0, facing, health: character(charId).health,
    action: 'idle', frame: 1, moveId: null, moveHit: false, airAttacked: false, stun: 0,
    slide: 0, slideFrames: 0, knockdownKind: 'none', crouching: false,
    history: [], prevButtons: 0, pressAge: [99, 99, 99, 99, 99],
    hitsDone: 0, cancelFrames: 0, contact: false, lightChain: 0, rekkaFrom: null, rekkaFrames: 0,
    armorLeft: 0, throwProtect: 0, grabTimer: 0, wallBounce: false, flipOut: false, bounced: false, quickRise: false,
  };
}

/**
 * Jump physics from the data: total airtime in frames and apex height in px. Gravity is halved near the
 * apex (JUMP_HANG_SPEED), which adds about 2 * JUMP_HANG_SPEED / gravity frames of hang; the rest of the
 * arc is quickened to make room, so the total airtime still matches the data.
 */
export function jumpPhysics(c: CharacterData): { gravity: number; v0: number; vx: number } {
  const t = c.jump.frames;
  let gravity = Math.max(1, Math.round((8 * c.jump.height * SUB) / ((t - 1) * (t - 1))));
  for (let i = 0; i < 4; i++) {
    const arc = t - 1 - (2 * JUMP_HANG_SPEED) / gravity;
    gravity = Math.max(1, Math.round((8 * c.jump.height * SUB) / (arc * arc)));
  }
  const arc = t - 1 - (2 * JUMP_HANG_SPEED) / gravity;
  return { gravity, v0: Math.round((gravity * arc) / 2), vx: Math.round((c.jump.distance * SUB) / t) };
}

export const totalFrames = (m: MoveData): number => m.startup - 1 + m.active + m.recovery;
export const lastActiveFrame = (m: MoveData): number => m.startup + m.active - 1;

export function moveData(f: FighterState): MoveData | null {
  if (!f.moveId) return null;
  return character(f.charId).moves.find((m) => m.id === f.moveId) ?? null;
}

export const lastDir = (f: FighterState): number => f.history[f.history.length - 1] ?? 5;
export const prevDir = (f: FighterState): number => f.history[f.history.length - 2] ?? 5;

export function setAction(f: FighterState, action: FighterState['action']): void {
  f.action = action;
  f.frame = 1;
}

export function toNeutral(f: FighterState): void {
  setAction(f, 'idle');
  f.moveId = null;
  f.vx = 0;
  f.armorLeft = 0;
  f.contact = false;
  f.cancelFrames = 0;
  f.hitsDone = 0;
  f.lightChain = 0;
}

export const isAirborne = (f: FighterState): boolean => f.y > 0 || f.action === 'jump' || f.action === 'airhit';

/** Free to start something new this frame. */
export function actionable(f: FighterState): boolean {
  return f.action === 'idle' || f.action === 'walk' || f.action === 'crouch';
}

/** Count timers down and end actions whose time is up. Called once per frame before input. */
export function advance(f: FighterState, events: SimEvent[], side: Side): void {
  f.frame++;
  if (f.cancelFrames > 0) f.cancelFrames--;
  if (f.throwProtect > 0) f.throwProtect--;
  if (f.rekkaFrames > 0 && --f.rekkaFrames === 0) f.rekkaFrom = null;
  const c = character(f.charId);
  switch (f.action) {
    case 'attack': {
      const m = moveData(f);
      if (!m) { toNeutral(f); break; }
      // multi-hit moves re-arm for the next hit every hitInterval frames
      if (m.hits > 1 && f.hitsDone < m.hits && f.frame >= m.startup + f.hitsDone * m.hitInterval) f.moveHit = false;
      // a rekka part that whiffed can still be followed once its active frames are over
      if (f.frame === lastActiveFrame(m) + 1 && f.rekkaFrom !== m.id && followers(f.charId, m.id).length > 0) {
        f.rekkaFrom = m.id;
        f.rekkaFrames = totalFrames(m) - lastActiveFrame(m) + 8;
      }
      if (f.frame > totalFrames(m)) {
        if (m.air) { f.action = 'jump'; f.moveId = null; } else toNeutral(f);
      }
      break;
    }
    case 'hitstun':
    case 'blockstun':
      f.stun--;
      if (f.stun <= 0) toNeutral(f);
      break;
    case 'prejump':
      if (f.frame > PREJUMP_FRAMES) {
        const j = jumpPhysics(c);
        setAction(f, 'jump');
        f.vy = j.v0;
        f.vx = j.vx * f.stun; // during the pre-jump, stun holds the jump direction (-1, 0, 1)
        f.stun = 0;
        f.y = 1;
        events.push({ type: 'jump', side, x: f.x, y: 0 });
      }
      break;
    case 'land':
      if (f.frame > f.stun) { f.stun = 0; toNeutral(f); }
      break;
    case 'dash':
      if (f.frame > c.dash.frames) toNeutral(f);
      break;
    case 'backdash':
      if (f.frame > c.backdash.frames) toNeutral(f);
      break;
    case 'knockdown': {
      const down = f.quickRise ? QUICK_RISE_FRAMES : KNOCKDOWN_FRAMES[f.knockdownKind === 'hard' ? 'hard' : 'soft'];
      if (f.frame > down) { setAction(f, 'getup'); f.quickRise = false; }
      break;
    }
    case 'getup':
      if (f.frame > GETUP_FRAMES) {
        toNeutral(f);
        f.throwProtect = THROW.wakeupProtect;
        f.knockdownKind = 'none';
      }
      break;
    case 'grabbing':
      // the hold after a throw lands; while the defender can still tech, grabTimer is running
      if (f.grabTimer <= 0 && --f.stun <= 0) toNeutral(f);
      break;
    case 'taunt':
      if (f.frame > TAUNT.frames) toNeutral(f);
      break;
    case 'wahala':
      if (f.frame > WAHALA.flashFrames) toNeutral(f);
      break;
    default:
      break;
  }
}

const FALLS = new Set<FighterState['action']>(['idle', 'walk', 'crouch', 'dash', 'backdash', 'taunt', 'wahala']);

/** Move the body for one frame: walking, dashes, attack travel, pushback slides and gravity. */
export function physics(f: FighterState, events: SimEvent[], side: Side): void {
  const c = character(f.charId);
  const m = moveData(f);

  // attacks travel over their startup and active frames, and stop once they connect
  if (f.action === 'attack' && m && !m.air && m.travel > 0 && !f.contact) {
    const span = lastActiveFrame(m);
    if (f.frame <= span) {
      const total = m.travel * SUB;
      const step = Math.trunc((total * f.frame) / span) - Math.trunc((total * (f.frame - 1)) / span);
      f.x += f.facing * step;
    }
  }
  if (f.slideFrames > 0) {
    const step = Math.trunc(f.slide / f.slideFrames);
    f.x += step;
    f.slide -= step;
    f.slideFrames--;
  }

  // safety net: a grounded state left above the floor falls instead of hanging there
  if (f.y > 0 && FALLS.has(f.action)) {
    setAction(f, 'jump');
    f.moveId = null;
    f.airAttacked = true;
  }
  const inAir = f.action === 'jump' || f.action === 'airhit' || f.action === 'ko' || (f.action === 'attack' && m !== null && m.air);
  if (inAir && (f.y > 0 || f.vy > 0)) {
    f.x += f.vx;
    f.y += f.vy;
    const g = jumpPhysics(c).gravity;
    // a jump hangs a little at its apex: gravity is halved while the body is nearly still
    f.vy -= f.action === 'airhit' || f.action === 'ko' ? AIR_HIT_GRAVITY : Math.abs(f.vy) < JUMP_HANG_SPEED ? g >> 1 : g;
    if (f.action === 'airhit' && f.wallBounce && clampToStage(f) !== 0) {
      f.wallBounce = false;
      f.vx = -Math.trunc(f.vx / 2);
      f.vy = px(6);
      events.push({ type: 'wallbounce', side, x: f.x, y: f.y });
    }
    if (f.y <= 0) landBody(f, events, side);
  } else if (f.action === 'walk' || f.action === 'dash' || f.action === 'backdash') {
    f.x += f.vx;
  }
  clampToStage(f);
}

function landBody(f: FighterState, events: SimEvent[], side: Side): void {
  const vx = f.vx;
  f.y = 0;
  f.vy = 0;
  f.vx = 0;
  f.wallBounce = false;
  // a knockdown first bounces off the floor once (about 15 px) and slides, then lies still
  if (f.action === 'airhit' && !f.flipOut && f.knockdownKind !== 'none' && !f.bounced) {
    f.bounced = true;
    f.y = 1;
    f.vy = FLOOR_BOUNCE.speed;
    f.slide = (vx >= 0 ? 1 : -1) * FLOOR_BOUNCE.slide;
    f.slideFrames = FLOOR_BOUNCE.slideFrames;
    events.push({ type: 'bounce', side, x: f.x, y: 0, strength: f.knockdownKind === 'hard' ? 'heavy' : 'medium' });
    return;
  }
  if (f.action === 'airhit' && f.flipOut) {
    // flipped out of a juggle: lands on their feet
    f.flipOut = false;
    f.knockdownKind = 'none';
    setAction(f, 'land');
    f.stun = LANDING_FRAMES;
    events.push({ type: 'land', side, x: f.x, y: 0 });
  } else if (f.action === 'airhit' && f.knockdownKind === 'none') {
    // an air hit that does not knock down: recover on landing
    setAction(f, 'land');
    f.stun = LANDING_FRAMES;
    events.push({ type: 'land', side, x: f.x, y: 0 });
  } else if (f.action === 'airhit') {
    setAction(f, 'knockdown');
    // soft knockdowns can quick-rise by holding down on landing (spec 6.7)
    f.quickRise = f.knockdownKind === 'soft' && isDown(lastDir(f));
    events.push({ type: 'knockdown', side, x: f.x, y: 0, strength: f.knockdownKind === 'hard' ? 'heavy' : 'medium' });
  } else if (f.action === 'ko') {
    events.push({ type: 'knockdown', side, x: f.x, y: 0, strength: 'super' });
  } else {
    const lag = f.airAttacked ? 0 : LANDING_FRAMES;
    f.airAttacked = false;
    f.moveId = null;
    if (lag > 0) {
      setAction(f, 'land');
      f.stun = lag;
    } else {
      setAction(f, 'idle');
    }
    events.push({ type: 'land', side, x: f.x, y: 0 });
  }
}

/** Keep the body inside the walls; returns how far it had to be moved back (sub-units, signed). */
export function clampToStage(f: FighterState): number {
  const half = Math.round((character(f.charId).pushWidth * SUB) / 2);
  const lo = -STAGE_HALF_WIDTH + half;
  const hi = STAGE_HALF_WIDTH - half;
  const before = f.x;
  f.x = Math.min(hi, Math.max(lo, f.x));
  return f.x - before;
}

/** Is the fighter against the wall on this side (-1 left, 1 right)? */
export function atWall(f: FighterState, side: -1 | 1): boolean {
  const half = Math.round((character(f.charId).pushWidth * SUB) / 2);
  return side < 0 ? f.x <= -STAGE_HALF_WIDTH + half + SUB : f.x >= STAGE_HALF_WIDTH - half - SUB;
}
