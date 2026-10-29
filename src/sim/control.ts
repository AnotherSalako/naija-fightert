// What a player's input starts this frame: specials, supers, throws, normals, cancels, rekka
// follow-ups, Wahala, taunts and movement. Specials take priority over normals when both match
// (spec 6.1); the order is fixed by sortMoves so the result never depends on luck.

import { DASH_TAP_WINDOW, LIGHT_CHAIN_MAX, METER_GAIN, METER_MAX, PUSHBACK_FRAMES, SUB, SUPER_FREEZE, TAUNT, THROW, WAHALA, px } from './constants';
import { character } from './data/characters';
import { tech } from './combat';
import { actionable, lastDir, moveData, prevDir, setAction } from './fighter';
import { buffered, bufferedButton, consumeButton, doubleTap, hasMotion, isBack, isDown, isUp, motionAge, throwPressed } from './input';
import { BUTTONS, type CharacterData, type FighterState, type MoveData, type Side, type SimEvent, type SimState } from './types';

/** frames within which a 623 must be typed to beat a 236 typed at the same time */
const DP_TIGHT = 10;
const MOTION_PRIORITY = ['236236', '214214', '63214', '623', '421', '236', '214', '22', '66', '4', ''];
const RANK: Record<string, number> = { light: 1, medium: 2, heavy: 3, special: 4, super: 5 };
const SPECIAL_TYPES = new Set(['special', 'rekka', 'projectile', 'command_grab', 'teleport', 'feint', 'parry', 'wahala']);

export const isSpecial = (m: MoveData): boolean => SPECIAL_TYPES.has(m.type);
const isThrow = (m: MoveData): boolean => m.type === 'throw';

const sorted = new Map<string, MoveData[]>();
/** Ground moves in the order they are tried: follow-ups, supers, Wahala moves, motions, throws, normals. */
function sortMoves(c: CharacterData): MoveData[] {
  const hit = sorted.get(c.id);
  if (hit) return hit;
  const key = (m: MoveData): number[] => {
    const motion = MOTION_PRIORITY.indexOf(m.motion);
    return [
      m.followsFrom.length ? 0 : 1,
      motion < 0 ? MOTION_PRIORITY.length : motion,
      m.type === 'wahala' ? 0 : 1,
      isThrow(m) ? 0 : 1,
      m.type === 'command_normal' ? 0 : 1,
    ];
  };
  const list = c.moves
    .map((m, i) => ({ m, i, k: key(m) }))
    .filter((e) => !e.m.air)
    .sort((a, b) => {
      for (let j = 0; j < a.k.length; j++) if (a.k[j] !== b.k[j]) return a.k[j] - b.k[j];
      return a.i - b.i;
    })
    .map((e) => e.m);
  sorted.set(c.id, list);
  return list;
}

/**
 * L+M a frame apart: the first button already started a light or medium normal (and was used up),
 * so the throw is recognised from that move plus the second press (spec 6.4).
 */
function throwUpgrade(f: FighterState): boolean {
  if (f.action !== 'attack' || f.frame > THROW.pressWindow + 1 || f.contact) return false;
  const cur = moveData(f);
  if (!cur || cur.type !== 'normal' || (cur.strength !== 'light' && cur.strength !== 'medium')) return false;
  const other = cur.button === 'L' ? 'M' : 'L';
  return f.pressAge[BUTTONS.indexOf(other)] <= THROW.pressWindow;
}

function buttonMatches(f: FighterState, m: MoveData): boolean {
  if (m.button === 'LM') return throwPressed(f) || throwUpgrade(f);
  if (m.button === 'A') return bufferedButton(f) !== null;
  if (m.button === 'S') return buffered(f, 'S');
  // plain normals take the strongest button pressed (H, then M, then L)
  if (m.motion === '' || m.motion === '66') return bufferedButton(f) === m.button;
  return buffered(f, m.button as 'L' | 'M' | 'H');
}

function directionMatches(f: FighterState, m: MoveData, d: number): boolean {
  switch (m.motion) {
    case '':
      if (isThrow(m)) return !isBack(d) && !isDown(d);
      if (m.input.startsWith('2')) return isDown(d);
      if (m.input.startsWith('6')) return d === 6;
      return !isDown(d);
    case '4':
      return d === 4;
    case '66':
      return f.action === 'dash';
    default:
      return hasMotion(f.history, m.motion);
  }
}

/** May this move start now, given what the fighter is doing (free, cancelling, in a rekka)? */
function allowed(s: SimState, side: Side, m: MoveData): boolean {
  const f = s.fighters[side];
  const free = actionable(f);
  if (m.meterCost > s.meter[side]) return false;
  if (m.type === 'wahala' && !(s.wahala[side].active > 0 && !s.wahala[side].moveUsed)) return false;
  if (m.followsFrom.length) {
    return f.rekkaFrom !== null && f.rekkaFrames > 0 && m.followsFrom.includes(f.rekkaFrom) &&
      (free || (f.action === 'attack' && f.moveId === f.rekkaFrom));
  }
  if (m.motion === '66') return f.action === 'dash';
  if (free) return true;
  const cur = f.action === 'attack' ? moveData(f) : null;
  if (!cur) return false;
  // L+M pressed a frame apart: the normal that came out first turns into the throw
  if (isThrow(m)) return throwUpgrade(f) || (throwPressed(f) && f.frame <= THROW.pressWindow + 1 && !f.contact);
  if (f.cancelFrames <= 0 || !f.contact) return false;
  if (m.type === 'super') {
    if (!cur.cancelInto.includes('super')) return false;
    // specials cancel into supers on hit only (spec 6.3)
    const o = s.fighters[side === 0 ? 1 : 0];
    return cur.type === 'normal' || cur.type === 'command_normal' || o.action === 'hitstun' || o.action === 'airhit';
  }
  if (isSpecial(m)) return cur.cancelInto.includes('special');
  if (m.type === 'normal' && cur.type === 'normal') {
    // chains go L -> M -> H; lights chain into themselves up to three in a row
    if (RANK[m.strength] > RANK[cur.strength]) return true;
    return m.strength === 'light' && cur.strength === 'light' && f.lightChain < LIGHT_CHAIN_MAX;
  }
  return false;
}

/** The ground move the input asks for right now, if it may start. */
export function chooseMove(s: SimState, side: Side): MoveData | null {
  const f = s.fighters[side];
  const d = lastDir(f);
  // a super motion (236236) also contains 6-2-3; without the meter it means Park Rush, not a DP
  // walking forward then typing 236 also contains 6-2-3: when 236 is there too, a DP has to have
  // been typed quickly (6236 still works); otherwise it is Park Rush
  const quarterCircles = hasMotion(f.history, '236236');
  const looseDp = hasMotion(f.history, '236') && motionAge(f.history, '623') > DP_TIGHT;
  for (const m of sortMoves(character(f.charId))) {
    if ((quarterCircles || looseDp) && m.motion === '623') continue;
    if (buttonMatches(f, m) && directionMatches(f, m, d) && allowed(s, side, m)) return m;
  }
  return null;
}

/** Start a move: pay its meter, consume the buttons, set up armour and the super freeze. */
export function startMove(s: SimState, side: Side, m: MoveData, events: SimEvent[]): void {
  const f = s.fighters[side];
  const cur = f.action === 'attack' ? moveData(f) : null;
  const light = m.type === 'normal' && m.strength === 'light';
  f.lightChain = light ? (cur && cur.type === 'normal' && cur.strength === 'light' ? f.lightChain + 1 : 1) : 0;

  if (m.button === 'LM') { consumeButton(f, 'L'); consumeButton(f, 'M'); }
  else if (m.button === 'A') consumeButton(f, bufferedButton(f) ?? 'L');
  else consumeButton(f, m.button as 'L' | 'M' | 'H' | 'S');

  s.meter[side] -= m.meterCost;
  if (isSpecial(m) || (m.meterCost > 0 && m.type !== 'super')) s.meter[side] = Math.min(METER_MAX, s.meter[side] + METER_GAIN.special);
  if (m.type === 'wahala') s.wahala[side].moveUsed = true;
  // a used motion is spent, so a rekka's next 214 must be input again
  if (m.motion.length > 1 && m.motion !== '66') f.history = f.history.slice(-1);

  setAction(f, 'attack');
  f.moveId = m.id;
  f.moveHit = false;
  f.hitsDone = 0;
  f.contact = false;
  f.cancelFrames = 0;
  f.armorLeft = m.armor;
  f.rekkaFrom = null;
  f.rekkaFrames = 0;
  f.crouching = m.input.startsWith('2');
  if (m.air) f.airAttacked = true;
  else f.vx = 0;
  if (m.type === 'super') {
    s.hitstop = SUPER_FREEZE;
    events.push({ type: 'super', side, x: f.x, y: f.y, moveId: m.id });
  }
  events.push({ type: 'whiff', side, x: f.x, y: f.y, moveId: m.id, strength: m.strength });
}

function activateWahala(s: SimState, side: Side, events: SimEvent[]): void {
  const f = s.fighters[side];
  const o = s.fighters[side === 0 ? 1 : 0];
  const w = s.wahala[side];
  w.available = false;
  w.usedThisRound = true;
  w.moveUsed = false;
  w.flash = WAHALA.flashFrames;
  w.active = WAHALA.flashFrames + WAHALA.durationFrames;
  consumeButton(f, 'S');
  setAction(f, 'wahala');
  f.moveId = null;
  f.vx = 0;
  f.stun = 0;
  f.crouching = false;
  // the activation shoves the opponent away so it can break pressure
  if (o.y === 0) {
    o.slide = f.facing * px(WAHALA.pushPx);
    o.slideFrames = PUSHBACK_FRAMES * 2;
  }
  events.push({ type: 'wahala', side, x: f.x, y: f.y });
}

/** What the player's input starts this frame. */
export function control(s: SimState, side: Side, events: SimEvent[]): void {
  const f = s.fighters[side];
  const c = character(f.charId);

  if (f.action === 'grabbed') {
    if (f.grabTimer > 0 && throwPressed(f)) tech(s, side, events);
    return;
  }
  if (f.action === 'jump') {
    const button = bufferedButton(f);
    if (button && !f.airAttacked) {
      const m = c.moves.find((mv) => mv.id === `j.${button}`);
      if (m) startMove(s, side, m, events);
    }
    return;
  }
  // in the air (an air attack, or knocked up): ground moves, throws and Wahala cannot start, or the
  // fighter would finish them hanging mid-air
  if (f.y > 0 || (f.action === 'attack' && moveData(f)?.air)) return;

  const m = chooseMove(s, side);
  // S: Wahala, when it is available, from neutral or while blocking (to escape pressure). It beats a
  // normal pressed with it (H+S in either order within WAHALA.inputWindow frames): a normal that has
  // only just started is cancelled into it. A move that itself uses S (an EX special) still comes out.
  if (buffered(f, 'S') && s.wahala[side].available && !(m && m.input.includes('S'))) {
    const justStarted = f.action === 'attack' && f.frame <= WAHALA.inputWindow && !f.contact && moveData(f)?.type === 'normal';
    if (actionable(f) || f.action === 'blockstun' || justStarted) {
      for (const b of ['L', 'M', 'H'] as const) consumeButton(f, b);
      activateWahala(s, side, events);
      return;
    }
  }
  if (m) { startMove(s, side, m, events); return; }
  if (!actionable(f)) return;

  const d = lastDir(f);
  if (buffered(f, 'T')) {
    consumeButton(f, 'T');
    setAction(f, 'taunt');
    f.vx = 0;
    if (!s.taunted[side]) {
      s.taunted[side] = true;
      s.meter[side] = Math.min(METER_MAX, s.meter[side] + TAUNT.meter);
    }
    events.push({ type: 'taunt', side, x: f.x, y: f.y });
    return;
  }
  if (d === 6 && prevDir(f) !== 6 && doubleTap(f.history, 6, DASH_TAP_WINDOW)) {
    setAction(f, 'dash');
    f.vx = f.facing * Math.round((c.dash.distance * SUB) / c.dash.frames);
    events.push({ type: 'dash', side, x: f.x, y: 0 });
    return;
  }
  if (d === 4 && prevDir(f) !== 4 && doubleTap(f.history, 4, DASH_TAP_WINDOW)) {
    setAction(f, 'backdash');
    f.vx = -f.facing * Math.round((c.backdash.distance * SUB) / c.backdash.frames);
    events.push({ type: 'dash', side, x: f.x, y: 0 });
    return;
  }
  if (isUp(d)) {
    setAction(f, 'prejump');
    f.stun = (d === 9 ? 1 : d === 7 ? -1 : 0) * f.facing;
    f.vx = 0;
    f.crouching = false;
    return;
  }
  f.crouching = isDown(d);
  const next = f.crouching ? 'crouch' : d === 6 || d === 4 ? 'walk' : 'idle';
  if (f.action !== next) setAction(f, next);
  if (f.crouching) f.vx = 0;
  else if (d === 6) f.vx = f.facing * px(c.walkForward);
  else if (d === 4) f.vx = -f.facing * px(c.walkBack);
  else f.vx = 0;
}
