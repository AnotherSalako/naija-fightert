// Hits, blocks, throws, pushback and body pushing between the two fighters. Everything from spec
// section 6 that happens on contact lives here: hit-stop, scaling, counter/punish, chip, meter,
// juggles, armour, invulnerability, wall bounces, throws and techs.

import {
  AIR_HIT_POP, CANCEL_WINDOW, COMBO_MAX_FRAMES, COUNTER_DAMAGE_PCT, COUNTER_EXTRA_HITSTUN, HITSTOP, HITSTOP_COUNTER_BONUS,
  HITSTOP_KO, HITSTOP_SUPER_LAST, JUGGLE_LIMIT, LAUNCH_DRIFT, LAUNCH_SPEED, LIGHT_CHAIN_MAX, MAX_SEPARATION, METER_GAIN, METER_MAX, PUSH_HEIGHT, PUSHBACK,
  PUSHBACK_FRAMES, REKKA_WINDOW, SUB, THROW, WAHALA, px, scaling,
} from './constants';
import { character, followers } from './data/characters';
import { atWall, clampToStage, isAirborne, lastActiveFrame, lastDir, moveData, setAction, toNeutral } from './fighter';
import { isBack } from './input';
import type { Box, FighterState, Invuln, MoveData, Side, SimEvent, SimState } from './types';

export interface Rect {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

const other = (side: Side): Side => (side === 0 ? 1 : 0);

/** A px box relative to the fighter (x forward) as a world rectangle in sub-units. */
export function worldRect(f: FighterState, b: Box): Rect {
  const x1 = f.facing === 1 ? f.x + b.x * SUB : f.x - (b.x + b.w) * SUB;
  return { x1, x2: x1 + b.w * SUB, y1: f.y + b.y * SUB, y2: f.y + (b.y + b.h) * SUB };
}

export const overlaps = (a: Rect, b: Rect): boolean => a.x1 < b.x2 && b.x1 < a.x2 && a.y1 < b.y2 && b.y1 < a.y2;

export function hurtRect(f: FighterState): Rect {
  const c = character(f.charId);
  if (f.action === 'knockdown' || f.action === 'getup' || f.action === 'ko') {
    return worldRect(f, { x: -60, y: 0, w: 120, h: 30 });
  }
  const box = isAirborne(f) ? c.hurtboxes.air : f.crouching ? c.hurtboxes.crouch : c.hurtboxes.stand;
  return worldRect(f, box);
}

/** The attack boxes live on this frame of the fighter's move. */
export function liveHitboxes(f: FighterState): Rect[] {
  const m = moveData(f);
  if (f.action !== 'attack' || !m || f.moveHit || m.grab) return [];
  return m.hitboxes.filter((b) => f.frame >= b.frameStart && f.frame <= b.frameEnd).map((b) => worldRect(f, b));
}

/** Can this fighter be touched by a strike (or a throw) right now? */
export function invulnerable(f: FighterState, kind: Invuln['type']): boolean {
  switch (f.action) {
    case 'knockdown': case 'getup': case 'ko': case 'grabbing': case 'grabbed': case 'wahala':
      return true;
    case 'airhit':
      return f.flipOut;
    case 'backdash': {
      const b = character(f.charId).backdash;
      return f.frame >= b.invulnFrom && f.frame <= b.invulnTo;
    }
    case 'attack': {
      const m = moveData(f);
      return !!m && m.invuln.some((v) => v.type === kind && f.frame >= v.from && f.frame <= v.to);
    }
    default:
      return false;
  }
}

/** Does the defender block this move right now? Hold back; crouch for lows, stand for overheads. */
export function blocks(d: FighterState, m: MoveData): boolean {
  const canGuard = d.action === 'idle' || d.action === 'walk' || d.action === 'crouch' || d.action === 'blockstun';
  if (!canGuard || d.y > 0 || m.level === 'unblockable') return false;
  const dir = lastDir(d);
  if (!isBack(dir)) return false;
  const crouching = dir === 1;
  if (m.level === 'low') return crouching;
  if (m.level === 'overhead') return !crouching;
  return true;
}

/** Push the defender away from the attacker; in the corner the attacker is pushed instead. */
function pushback(s: SimState, att: Side, m: MoveData, scale = 1): void {
  const a = s.fighters[att];
  const d = s.fighters[other(att)];
  const amount = Math.round(px(PUSHBACK[m.strength]) * scale);
  if (atWall(d, a.facing)) {
    a.slide = -a.facing * amount;
    a.slideFrames = PUSHBACK_FRAMES;
  } else {
    d.slide = a.facing * amount;
    d.slideFrames = PUSHBACK_FRAMES;
  }
}

const gain = (s: SimState, side: Side, n: number): void => {
  s.meter[side] = Math.min(METER_MAX, Math.max(0, s.meter[side] + n));
};

/** Damage of hit number `index` (0-based) of a move: multi-hit moves split it, the last hit takes the rest. */
export function hitDamage(m: MoveData, index: number): number {
  if (m.hits <= 1) return m.damage;
  const each = Math.floor(m.damage / m.hits);
  return index === m.hits - 1 ? m.damage - each * (m.hits - 1) : each;
}

function knockOut(d: FighterState, a: FighterState): void {
  setAction(d, 'ko');
  d.vy = AIR_HIT_POP;
  d.y = Math.max(d.y, 1);
  d.vx = a.facing * px(2);
  d.moveId = null;
}

/** Health fell under the Wahala threshold: unlock it once per round (spec 6.10). */
function checkWahala(s: SimState, side: Side, events: SimEvent[]): void {
  const f = s.fighters[side];
  const w = s.wahala[side];
  if (w.available || w.usedThisRound || f.health <= 0) return;
  if (f.health * 100 < character(f.charId).health * WAHALA.healthPct) {
    w.available = true;
    events.push({ type: 'wahala_ready', side, x: f.x, y: f.y });
  }
}

/** The attacker's damage multiplier from Wahala Mode, in percent. */
const wahalaPct = (s: SimState, side: Side, pct: number): number => (s.wahala[side].active > 0 ? pct : 100);

/** Start a combo on the defender, or continue it; returns the combo record. */
function comboFor(s: SimState, att: Side) {
  const combo = s.combo[att];
  if (combo.hits === 0) {
    combo.startFrame = s.frame;
    combo.step = 0;
    combo.used = [];
    combo.lightHits = 0;
    combo.juggle = 0;
  }
  return combo;
}

function strike(s: SimState, att: Side, m: MoveData, events: SimEvent[]): void {
  const a = s.fighters[att];
  const def = other(att);
  const d = s.fighters[def];
  const index = a.hitsDone;
  a.moveHit = true;
  a.contact = true;
  a.hitsDone++;
  a.cancelFrames = CANCEL_WINDOW;
  if (followers(a.charId, m.id).length > 0) {
    a.rekkaFrom = m.id;
    a.rekkaFrames = REKKA_WINDOW;
  }
  const last = a.hitsDone >= m.hits;
  const isSuper = m.superLevel > 0;
  const hx = (a.x + d.x) >> 1;
  const hy = d.y + px(110);
  const strength = m.strength;

  // armour: the hit is absorbed, the damage still taken (spec 7, Wahala move)
  const dm = moveData(d);
  if (d.action === 'attack' && dm && d.armorLeft > 0 && d.frame <= lastActiveFrame(dm)) {
    d.armorLeft--;
    d.health = Math.max(0, d.health - hitDamage(m, index));
    s.hitstop = HITSTOP[strength][1];
    events.push({ type: 'armor', side: def, x: hx, y: hy, moveId: m.id, strength, hitstop: s.hitstop });
    if (d.health <= 0) { knockOut(d, a); s.hitstop = HITSTOP_KO; events.push({ type: 'hit', side: def, x: hx, y: hy, moveId: m.id, damage: 0, strength, hitstop: s.hitstop }); }
    return;
  }

  if (blocks(d, m)) {
    setAction(d, 'blockstun');
    d.stun = m.blockstun;
    d.crouching = lastDir(d) === 1;
    d.vx = 0;
    if (m.chip > 0) {
      // a multi-hit move spreads its chip over its hits like its damage
      const share = m.damage > 0 ? Math.floor((m.chip * hitDamage(m, index)) / m.damage) : m.chip;
      const chip = Math.floor((share * wahalaPct(s, att, WAHALA.chipPct)) / 100);
      d.health = Math.max(0, d.health - chip);
    }
    if (!isSuper) gain(s, att, METER_GAIN.blockedAttacker);
    gain(s, def, METER_GAIN.block);
    s.hitstop = HITSTOP[strength][1];
    if (last || m.hits <= 1) pushback(s, att, m);
    events.push({ type: 'block', side: def, x: hx, y: hy, moveId: m.id, strength, hitstop: s.hitstop });
    if (d.health <= 0) {
      // chip can KO (spec 6.8)
      knockOut(d, a);
      s.hitstop = HITSTOP_KO;
      events.push({ type: 'hit', side: def, x: hx, y: hy, moveId: m.id, damage: 0, strength, hitstop: s.hitstop });
    } else checkWahala(s, def, events);
    return;
  }

  // COUNTER: hit during their startup; PUNISH: hit during their recovery (spec 5.7)
  const inMove = d.action === 'attack' && dm !== null;
  const counter = inMove && d.frame < (dm as MoveData).startup;
  const punish = inMove && d.frame > lastActiveFrame(dm as MoveData);
  const combo = comboFor(s, att);
  // every hit of one multi-hit move scales as that move's first hit did
  const stepNow = index === 0 ? combo.step : Math.max(0, combo.step - 1);
  let dmg = Math.floor((hitDamage(m, index) * scaling(stepNow, isSuper)) / 100);
  if (counter || punish) dmg = Math.floor((dmg * COUNTER_DAMAGE_PCT) / 100);
  dmg = Math.floor((dmg * wahalaPct(s, att, WAHALA.damagePct)) / 100);
  d.health = Math.max(0, d.health - dmg);

  const airborne = isAirborne(d);
  combo.hits++;
  combo.damage += dmg;
  if (index === 0) combo.step += combo.hits === 1 && counter ? 2 : 1;
  if (m.strength === 'light') combo.lightHits++;
  if (!combo.used.includes(m.id)) combo.used.push(m.id);
  if (airborne) combo.juggle += m.juggle;

  if (!isSuper) gain(s, att, METER_GAIN.hit);
  gain(s, def, METER_GAIN.takeHit);

  s.hitstop = isSuper ? (last ? HITSTOP_SUPER_LAST : HITSTOP.super[0]) : HITSTOP[strength][0] + (counter || punish ? HITSTOP_COUNTER_BONUS : 0);
  const launch = m.launch && last;
  if (d.health <= 0) {
    knockOut(d, a);
    s.hitstop = HITSTOP_KO;
  } else if (airborne || launch || m.wallbounce || (m.knockdown !== 'none' && last)) {
    const wasDown = d.action === 'airhit' ? d.knockdownKind : 'none';
    setAction(d, 'airhit');
    d.vy = launch ? LAUNCH_SPEED : AIR_HIT_POP;
    d.y = Math.max(d.y, 1);
    // a launched body rises nearly straight up, so a follow-up (623L, 236L, j.H) can still reach it
    d.vx = a.facing * (launch ? LAUNCH_DRIFT : px(2));
    d.bounced = false;
    // a launch leaves room for one juggle follow-up: the next hit fills the juggle count
    if (launch) combo.juggle = Math.max(combo.juggle, JUGGLE_LIMIT - 1);
    const kinds = ['none', 'soft', 'hard'] as const;
    const fromMove = m.knockdown !== 'none' ? m.knockdown : launch ? 'hard' : m.wallbounce ? 'soft' : 'none';
    d.knockdownKind = kinds[Math.max(kinds.indexOf(wasDown), kinds.indexOf(fromMove))];
    if (m.wallbounce) {
      d.wallBounce = true;
      d.vx = a.facing * px(10);
      d.vy = px(5);
    }
    d.crouching = false;
  } else {
    setAction(d, 'hitstun');
    d.stun = m.hitstun + (counter ? COUNTER_EXTRA_HITSTUN : 0);
    d.vx = 0;
    if (last || m.hits <= 1) pushback(s, att, m);
    else pushback(s, att, m, 0.25);
  }
  d.moveId = null;
  d.armorLeft = 0;
  d.contact = false;
  d.cancelFrames = 0;
  d.rekkaFrom = null;
  d.rekkaFrames = 0;
  d.grabTimer = 0;
  events.push({ type: 'hit', side: def, x: hx, y: hy, moveId: m.id, damage: dmg, strength, counter, punish, hitstop: s.hitstop, last: isSuper && last });
  checkWahala(s, def, events);
}

/** Can the defender be thrown right now? Grounded, not in stun, not just woken up (spec 6.4). */
function throwable(d: FighterState): boolean {
  if (d.y > 0 || isAirborne(d) || d.throwProtect > 0 || invulnerable(d, 'throw')) return false;
  return !['hitstun', 'blockstun', 'airhit', 'knockdown', 'getup', 'ko', 'grabbed', 'grabbing'].includes(d.action);
}

function inThrowRange(a: FighterState, d: FighterState, m: MoveData): boolean {
  const reach = ((character(a.charId).pushWidth + character(d.charId).pushWidth) * SUB) / 2 + m.grabRange * SUB;
  return Math.abs(a.x - d.x) <= reach && Math.sign(d.x - a.x || a.facing) === a.facing;
}

function grab(s: SimState, att: Side, m: MoveData, events: SimEvent[]): void {
  const a = s.fighters[att];
  const d = s.fighters[other(att)];
  a.moveHit = true;
  a.contact = true;
  setAction(a, 'grabbing');
  setAction(d, 'grabbed');
  a.vx = 0;
  d.vx = 0;
  d.moveId = null;
  d.crouching = false;
  d.grabTimer = m.techable ? THROW.techWindow : 0;
  a.grabTimer = d.grabTimer;
  events.push({ type: 'throw', side: att, x: (a.x + d.x) >> 1, y: px(110), moveId: m.id });
  if (!m.techable) landThrow(s, att, events);
}

/** The throw lands: damage, hard knockdown, back throws swap sides. */
function landThrow(s: SimState, att: Side, events: SimEvent[]): void {
  const a = s.fighters[att];
  const def = other(att);
  const d = s.fighters[def];
  const m = moveData(a);
  if (!m) return;
  const combo = comboFor(s, att);
  let dmg = Math.floor((m.damage * scaling(combo.step, m.superLevel > 0)) / 100);
  dmg = Math.floor((dmg * wahalaPct(s, att, WAHALA.damagePct)) / 100);
  d.health = Math.max(0, d.health - dmg);
  combo.hits++;
  combo.damage += dmg;
  combo.step += 2; // a combo started by a throw scales one step later (spec 6.5)
  if (m.superLevel === 0) gain(s, att, METER_GAIN.hit);
  gain(s, def, METER_GAIN.takeHit);
  if (m.backThrow) {
    const gap = ((character(a.charId).pushWidth + character(d.charId).pushWidth) * SUB) / 2;
    d.x = a.x - a.facing * gap;
    clampToStage(d);
    a.facing = a.facing === 1 ? -1 : 1;
  }
  a.grabTimer = 0;
  d.grabTimer = 0;
  a.stun = THROW.holdFrames;
  setAction(a, 'grabbing');
  if (d.health <= 0) knockOut(d, a);
  else {
    setAction(d, 'airhit');
    d.y = 1;
    d.vy = px(5);
    d.vx = a.facing * px(3);
    d.knockdownKind = 'hard';
  }
  s.hitstop = d.health <= 0 ? HITSTOP_KO : m.superLevel > 0 ? HITSTOP_SUPER_LAST : HITSTOP.heavy[0];
  const hx = (a.x + d.x) >> 1;
  events.push({ type: 'hit', side: def, x: hx, y: px(110), moveId: m.id, damage: dmg, strength: m.strength, hitstop: s.hitstop, last: m.superLevel > 0 });
  checkWahala(s, def, events);
}

/** The grabbed fighter pressed L+M in time: "TECH!", both pushed apart, no damage (spec 6.4). */
export function tech(s: SimState, def: Side, events: SimEvent[]): void {
  const d = s.fighters[def];
  const a = s.fighters[other(def)];
  toNeutral(a);
  toNeutral(d);
  a.grabTimer = 0;
  d.grabTimer = 0;
  const half = px(THROW.techPush / 2);
  a.slide = -a.facing * half;
  a.slideFrames = PUSHBACK_FRAMES;
  d.slide = a.facing * half;
  d.slideFrames = PUSHBACK_FRAMES;
  events.push({ type: 'tech', side: def, x: (a.x + d.x) >> 1, y: px(110) });
}

/** Grabs waiting for a tech: count down and land the throw when the window closes. */
export function updateGrabs(s: SimState, events: SimEvent[]): void {
  for (const att of [0, 1] as const) {
    const a = s.fighters[att];
    const d = s.fighters[other(att)];
    // the frame of the grab itself does not count: the defender gets the full tech window
    if (a.action === 'grabbing' && a.grabTimer > 0 && d.action === 'grabbed' && a.frame > 1) {
      a.grabTimer--;
      d.grabTimer--;
      if (a.grabTimer <= 0) landThrow(s, att, events);
    }
  }
}

/** Should this strike pass through, because the combo rules forbid it (spec 6.6)? */
function comboForbids(s: SimState, att: Side, m: MoveData): boolean {
  const d = s.fighters[other(att)];
  const combo = s.combo[att];
  const comboOn = combo.hits > 0 && (d.action === 'hitstun' || d.action === 'airhit');
  if (!comboOn) return false;
  if (s.frame - combo.startFrame > COMBO_MAX_FRAMES) return true;
  // a multi-hit move hits all its hits, but cannot be used a second time in the same combo
  if (m.hits > 1) return s.fighters[att].hitsDone === 0 && combo.used.includes(m.id);
  if (m.strength === 'light') return combo.lightHits >= LIGHT_CHAIN_MAX;
  return combo.used.includes(m.id);
}

/** Find every attack connecting this frame, then apply them together so trades are fair. */
export function resolveHits(s: SimState, events: SimEvent[]): void {
  const strikes: { att: Side; m: MoveData }[] = [];
  const grabs: { att: Side; m: MoveData }[] = [];
  for (const att of [0, 1] as const) {
    const a = s.fighters[att];
    const d = s.fighters[other(att)];
    const m = moveData(a);
    if (!m || a.action !== 'attack' || a.moveHit) continue;
    if (m.grab) {
      const live = a.frame >= m.startup && a.frame <= lastActiveFrame(m);
      if (live && throwable(d) && inThrowRange(a, d, m)) grabs.push({ att, m });
      continue;
    }
    if (invulnerable(d, 'strike')) continue;
    const hurt = hurtRect(d);
    if (!liveHitboxes(a).some((r) => overlaps(r, hurt))) continue;
    if (comboForbids(s, att, m)) { a.moveHit = true; continue; }
    // juggle limit: once the count has reached it, the opponent flips out instead of being hit
    if (isAirborne(d) && d.action === 'airhit' && s.combo[att].juggle >= JUGGLE_LIMIT) {
      a.moveHit = true;
      d.flipOut = true;
      d.knockdownKind = 'none';
      events.push({ type: 'flipout', side: other(att), x: d.x, y: d.y });
      continue;
    }
    strikes.push({ att, m });
  }
  for (const p of strikes) strike(s, p.att, p.m, events);
  // strikes beat throws; two throws on the same frame cancel out as a tech
  const struck = new Set(strikes.map((p) => other(p.att)));
  const live = grabs.filter((g) => !struck.has(g.att));
  if (live.length === 2) tech(s, 1, events);
  else if (live.length === 1) grab(s, live[0].att, live[0].m, events);
}

/**
 * Keep the two bodies from overlapping, every frame, throws included (a held fighter is placed one
 * push-width away, so this never fights the throw). Against a wall, the other fighter takes the push.
 */
export function resolvePush(s: SimState): void {
  const [a, b] = s.fighters;
  if (Math.abs(a.y - b.y) >= PUSH_HEIGHT && Math.max(a.y, b.y) >= PUSH_HEIGHT) return; // one is jumping over
  const need = Math.round(((character(a.charId).pushWidth + character(b.charId).pushWidth) * SUB) / 2);
  const dx = b.x - a.x;
  const overlap = need - Math.abs(dx);
  if (overlap <= 0) return;
  const dir = dx !== 0 ? Math.sign(dx) : a.facing;
  const half = overlap >> 1;
  a.x -= dir * half;
  b.x += dir * (overlap - half);
  const ca = clampToStage(a);
  const cb = clampToStage(b);
  // whatever the wall gave back to one fighter is passed on to the other
  if (ca !== 0) b.x += ca;
  if (cb !== 0) a.x += cb;
  clampToStage(a);
  clampToStage(b);
}

/** Walking away cannot stretch the gap past what the camera shows. */
export function limitSeparation(s: SimState, before: [number, number]): void {
  s.fighters.forEach((f, i) => {
    const o = s.fighters[i === 0 ? 1 : 0];
    const now = Math.abs(f.x - o.x);
    if (now > MAX_SEPARATION && now > Math.abs(before[i] - o.x)) f.x = before[i];
  });
}

/** Grounded fighters who are free (or just landing) turn to face each other. */
export function updateFacing(s: SimState): void {
  s.fighters.forEach((f, i) => {
    const o = s.fighters[i === 0 ? 1 : 0];
    const free = f.action === 'idle' || f.action === 'walk' || f.action === 'crouch' || f.action === 'land';
    if (free && f.y === 0 && o.x !== f.x) f.facing = o.x > f.x ? 1 : -1;
  });
}
