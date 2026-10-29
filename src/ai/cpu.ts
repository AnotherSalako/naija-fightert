// The CPU opponent (spec 8). It plays like a person at a pad: each frame it looks at the match and
// returns one InputFrame. It sees its opponent through a reaction delay (match states N frames
// old), so it cannot react faster than its difficulty allows, and it rolls its own seeded dice, so
// a match with a fixed seed replays exactly. It never changes the sim's state.

import { FPS, GETUP_FRAMES, METER_BAR, ROUND_SECONDS, SUB } from '../sim/constants';
import { character } from '../sim/data/characters';
import { actionable, lastActiveFrame, moveData, totalFrames } from '../sim/fighter';
import { relativeDir } from '../sim/input';
import type { InputFrame, MoveData, Side, SimState } from '../sim/types';

export type Difficulty = 'easy' | 'normal' | 'hard' | 'boss';

/** The spec 8 table (chances in percent). `combo` is the longest string it will try; `tech` its throw-tech chance. */
/**
 * delay: reaction frames; block / wrongHeight / antiAir / punish / tech: chances in %; combo: longest
 * string; rush: how often it picks Park Rush (% of the base weight); pause: weight of standing off in
 * the middle of pressure (gaps the player can act in); mistake: weight of a poke thrown from too far;
 * recover: frames it stands off after one of its moves is blocked or whiffs; throws: how often it
 * throws up close (% of the base weight).
 * Normal was eased after playtest (29 Oct); Hard and Boss are unchanged (rush 100, no pauses or mistakes).
 */
export const DIFFICULTY: Record<Difficulty, {
  delay: number; block: number; wrongHeight: number; antiAir: number; punish: number; combo: number; tech: number;
  rush: number; pause: number; mistake: number; recover: number; throws: number;
}> = {
  easy: { delay: 30, block: 25, wrongHeight: 40, antiAir: 20, punish: 15, combo: 2, tech: 10, rush: 30, pause: 22, mistake: 18, recover: 40, throws: 30 },
  normal: { delay: 28, block: 38, wrongHeight: 28, antiAir: 40, punish: 35, combo: 2, tech: 25, rush: 35, pause: 18, mistake: 14, recover: 30, throws: 35 },
  hard: { delay: 10, block: 65, wrongHeight: 8, antiAir: 75, punish: 75, combo: 99, tech: 55, rush: 100, pause: 0, mistake: 0, recover: 0, throws: 100 },
  boss: { delay: 8, block: 70, wrongHeight: 5, antiAir: 80, punish: 85, combo: 99, tech: 65, rush: 100, pause: 0, mistake: 0, recover: 0, throws: 100 },
};

/** Never a super this early in a round (spec 8). */
const NO_SUPER_FRAMES = 2 * FPS;
const BITS: Record<string, number> = { L: 1, M: 2, H: 4, S: 8, T: 16, A: 1, LM: 3 };

/** One frame of a plan. Directions are relative (6 = toward the opponent). */
interface Step {
  dir: number;
  buttons: number;
  /** wait until the attack in progress has hit before typing this (a hit-confirm) */
  confirm?: boolean;
}

/** The frames that perform a move, as relative directions. */
export function typeMove(m: MoveData, confirm = false): Step[] {
  const btn = BITS[m.button] ?? 1;
  let dirs: number[];
  switch (m.motion) {
    case '': dirs = [m.input.startsWith('2') ? 2 : m.input.startsWith('6') ? 6 : 5]; break;
    case '4': dirs = [4]; break;
    case '66': dirs = [6, 5, 6, 6, 6]; break;
    default:
      dirs = [];
      for (const d of m.motion.split('').map(Number)) {
        if (dirs[dirs.length - 1] === d) dirs.push(5);
        dirs.push(d);
      }
  }
  return dirs.map((d, i) => ({ dir: d, buttons: i === dirs.length - 1 ? btn : 0, confirm: confirm && i === 0 }));
}

export class Cpu {
  private readonly cfg: (typeof DIFFICULTY)[Difficulty];
  private past: SimState[] = [];
  private plan: Step[] = [];
  private waited = 0;
  private rng: number;
  private judged = '';
  private jumpJudged = '';
  private wakeJudged = -1;
  private techJudged = -1;
  private teching = false;
  private guard: { dir: number; until: number } | null = null;
  /** it stands off until this frame after one of its moves was blocked or whiffed */
  private restUntil = 0;
  private wasAttacking = false;

  constructor(readonly side: Side, readonly level: Difficulty = 'normal', seed = 1) {
    this.cfg = DIFFICULTY[level];
    this.rng = seed | 0 || 1;
  }

  private roll(pct: number): boolean {
    let x = this.rng;
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    this.rng = x | 0;
    return (x >>> 0) % 100 < pct;
  }

  private pick<T>(options: [T, number][]): T {
    const total = options.reduce((a, o) => a + o[1], 0);
    this.roll(0);
    let r = (this.rng >>> 0) % total;
    for (const [v, w] of options) {
      if (r < w) return v;
      r -= w;
    }
    return options[0][0];
  }

  private move(s: SimState, id: string): MoveData | undefined {
    return character(s.fighters[this.side].charId).moves.find((m) => m.id === id);
  }

  private queue(s: SimState, ids: string[], confirmAfterFirst = true): boolean {
    const moves = ids.map((id) => this.move(s, id)).filter((m): m is MoveData => !!m);
    if (moves.length === 0) return false;
    this.plan = moves.flatMap((m, i) => typeMove(m, confirmAfterFirst && i > 0));
    return true;
  }

  /** A choice's weight scaled by a difficulty percentage (100 leaves it as it was). */
  private scaled(weight: number, pct: number): number {
    return Math.round((weight * pct) / 100);
  }

  private hold(dir: number, frames: number): void {
    this.plan = Array.from({ length: frames }, () => ({ dir, buttons: 0 }));
  }

  /** A combo of at most `combo` hits, ending in a special, and in a super when it is allowed. */
  private combo(s: SimState, opener: 'stand' | 'low' | 'punish'): void {
    const max = this.cfg.combo;
    let ids = opener === 'punish' ? ['2M', '236M'] : opener === 'low' ? ['2L', '2M', '236L'] : ['5L', '5L', '5M', '236M'];
    if (max <= 2) ids = opener === 'low' ? ['2L', '2M'] : ['5L', '5M'];
    ids = ids.filter((id) => this.move(s, id));
    if (ids.length === 0) ids = ['5L', '5M', '5H'];
    ids = ids.slice(0, Math.max(1, max));
    const fightFrames = ROUND_SECONDS * FPS - s.timer;
    const superMove = character(s.fighters[this.side].charId).moves.find((m) => m.superLevel === 1);
    if (superMove && max >= 2 && s.meter[this.side] >= METER_BAR && fightFrames > NO_SUPER_FRAMES && this.roll(60)) ids.push(superMove.id);
    this.queue(s, ids);
  }

  /** This frame's input. */
  next(s: SimState): InputFrame {
    this.past.push(s);
    if (this.past.length > this.cfg.delay + 1) this.past.shift();
    const me = s.fighters[this.side];
    const o: Side = this.side === 0 ? 1 : 0;
    const seen = this.past[0].fighters[o]; // what it has noticed of the opponent so far
    const now = s.fighters[o];
    const out = (rel: number, buttons = 0): InputFrame => ({ dir: relativeDir(rel, me.facing), buttons });
    if (s.phase !== 'fight') {
      this.plan = [];
      this.guard = null;
      return out(5);
    }
    const dist = Math.abs(me.x - seen.x) / SUB;
    if (me.action === 'hitstun' || me.action === 'airhit' || me.action === 'knockdown') this.plan = [];

    // grabbed: maybe tech, a few frames in
    if (me.action === 'grabbed') {
      const start = s.frame - me.frame;
      if (this.techJudged !== start) { this.techJudged = start; this.teching = this.roll(this.cfg.tech); }
      return this.teching && me.frame >= 3 ? out(5, BITS.LM) : out(5);
    }

    // a plan in progress (hit-confirms stop the string when it is blocked or whiffs)
    if (this.plan.length > 0) {
      const st = this.plan[0];
      if (st.confirm) {
        const hit = now.action === 'hitstun' || now.action === 'airhit';
        if (me.contact && hit) {
          this.waited = 0;
        } else if ((me.contact && now.action === 'blockstun') || ++this.waited > 40) {
          this.plan = [];
          this.waited = 0;
          return out(5);
        } else {
          return out(5);
        }
      }
      this.plan.shift();
      return out(st.dir, st.buttons);
    }

    // wakeup: sometimes a reversal timed for the first free frame, otherwise block
    if (me.action === 'knockdown' || me.action === 'getup') {
      const dp = this.move(s, '623M');
      if (me.action === 'getup' && me.frame === GETUP_FRAMES - 3 && this.wakeJudged !== s.frame && dp && dist < 140) {
        this.wakeJudged = s.frame;
        if (this.roll(Math.floor(this.cfg.punish / 2))) { this.plan = typeMove(dp); return out(5); }
      }
      return out(4);
    }
    if (me.action === 'blockstun') return out(this.guard?.dir ?? 4);
    // a move of its own just ended: if it was blocked or whiffed, stand off for a moment; after a string
    // that hit, for half as long (so its attacks come in bursts with gaps, not one long stream)
    const attacking = me.action === 'attack';
    if (this.wasAttacking && !attacking && this.cfg.recover > 0) {
      const landed = now.action === 'hitstun' || now.action === 'airhit' || now.action === 'knockdown';
      if (!landed) this.plan = [];
      if (!landed || this.plan.length === 0) this.restUntil = s.frame + (landed ? this.cfg.recover >> 1 : this.cfg.recover);
    }
    this.wasAttacking = attacking;
    if (!actionable(me)) return out(5);
    if (this.guard && s.frame < this.guard.until) return out(this.guard.dir);
    // standing off after a blocked or whiffed move: it holds back (which also blocks)
    if (s.frame < this.restUntil) return out(4);
    this.guard = null;

    // comeback: Wahala when it is up
    if (s.wahala[this.side].available && this.roll(4)) return out(5, BITS.S);

    // the opponent's attack, once it has been noticed: block it, punish it, or neither
    const sm = seen.action === 'attack' ? moveData(seen) : null;
    if (sm) {
      const key = `${sm.id}@${this.past[0].frame - seen.frame}`;
      if (key !== this.judged) {
        this.judged = key;
        const reach = Math.max(0, ...sm.hitboxes.map((b) => b.x + b.w)) + sm.travel + 40;
        const recovering = seen.frame > lastActiveFrame(sm);
        if (recovering && dist < 150 && this.roll(this.cfg.punish)) { this.combo(s, 'punish'); return out(5); }
        if (!recovering && dist < reach && this.roll(this.cfg.block)) {
          const right = sm.level === 'low' ? 1 : sm.level === 'overhead' ? 4 : this.roll(50) ? 1 : 4;
          const wrong = (sm.level === 'low' || sm.level === 'overhead') && this.roll(this.cfg.wrongHeight);
          this.guard = { dir: wrong ? (right === 1 ? 4 : 1) : right, until: s.frame + totalFrames(sm) - seen.frame + 6 };
          return out(this.guard.dir);
        }
      }
    }

    // a jump coming in: anti-air (or not)
    if (seen.action === 'jump' && seen.vy < 0 && dist < 170) {
      const key = `jump@${this.past[0].frame - seen.frame}`;
      if (key !== this.jumpJudged) {
        this.jumpJudged = key;
        if (this.roll(this.cfg.antiAir) && this.queue(s, [this.move(s, '623H') ? '623H' : '2H'], false)) return out(5);
      }
    }

    // neutral: choose what to do next by distance
    const dash: Step[] = [{ dir: 6, buttons: 0 }, { dir: 5, buttons: 0 }, { dir: 6, buttons: 0 }, { dir: 6, buttons: 0 }];
    if (dist > 260) {
      const c = this.pick<string>([['walk', 55], ['dash', 18], ['rush', this.scaled(8, this.cfg.rush)], ['jump', 5], ['wait', 14 + this.cfg.pause]]);
      if (c === 'walk') this.hold(6, 12);
      else if (c === 'dash') this.plan = dash;
      else if (c === 'rush') { if (!this.queue(s, ['236H'], false)) this.hold(6, 8); }
      else if (c === 'jump') this.hold(9, 3);
      else this.hold(5, 10);
    } else if (dist > 140) {
      const c = this.pick<string>([['walk', 34], ['poke', 10], ['rush', this.scaled(12, this.cfg.rush)], ['back', 10],
        ['wait', 14 + this.cfg.pause], ['jump', 6], ['dash', 14], ['whiff', this.cfg.mistake]]);
      if (c === 'walk') this.hold(6, 10);
      else if (c === 'poke') this.queue(s, ['2M'], false);
      else if (c === 'whiff') this.queue(s, [this.roll(50) ? '5H' : '5M'], false); // thrown from too far
      else if (c === 'rush') { if (!this.queue(s, ['236M'], false)) this.hold(6, 8); }
      else if (c === 'back') this.hold(4, 10);
      else if (c === 'jump') this.hold(9, 3);
      else if (c === 'dash') this.plan = dash;
      else this.hold(5, 8);
    } else if (this.roll(this.cfg.block)) {
      // up close, blocking is mostly done before the attack comes (most attacks are faster than
      // the reaction delay): guard for a moment, usually low since that also stops mids
      this.guard = { dir: this.roll(70) ? 1 : 4, until: s.frame + 16 + ((this.rng >>> 0) % 10) };
    } else {
      const c = this.pick<string>([['combo', 28], ['low', 12], ['throw', this.scaled(16, this.cfg.throws)], ['overhead', 9], ['mixup', 10], ['rekka', 9], ['backdash', 6], ['walk', 6], ['block', 4],
        ['pause', this.cfg.pause]]);
      if (c === 'pause') this.hold(5, 14 + ((this.rng >>> 0) % 12)); // a gap in the pressure
      if (c === 'combo') this.combo(s, 'stand');
      else if (c === 'low') this.combo(s, 'low');
      else if (c === 'throw') this.queue(s, [this.roll(25) ? 'back-throw' : 'throw'], false);
      else if (c === 'overhead') this.queue(s, ['6M'], false);
      else if (c === 'mixup') { if (!this.queue(s, [this.pick([['22M', 4], ['22H', 4], ['22L', 2]])], false)) this.queue(s, ['2M'], false); }
      else if (c === 'rekka') { if (!this.queue(s, ['214A', '214A-2', this.roll(50) ? '214H-3' : '214A-3'])) this.combo(s, 'stand'); }
      else if (c === 'block') this.guard = { dir: this.roll(50) ? 4 : 1, until: s.frame + 20 };
      else if (c === 'backdash') this.plan = [{ dir: 4, buttons: 0 }, { dir: 5, buttons: 0 }, { dir: 4, buttons: 0 }];
      else this.hold(6, 6);
    }
    if (this.guard) return out(this.guard.dir);
    const st = this.plan.shift();
    return st ? out(st.dir, st.buttons) : out(5);
  }
}
