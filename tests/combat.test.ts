// Spec section 6 and the section 14 checklist: hit-stop, scaling, counter/punish, chip, meter,
// throws and techs, reversals, juggles, combo limits, cancels, rekkas, supers, Wahala, taunts,
// knockdowns and wall bounces, all measured in the real sim with Egbon.

import { describe, expect, it } from 'vitest';
import {
  COMBO_MAX_FRAMES, HITSTOP, JUGGLE_LIMIT, KNOCKDOWN_FRAMES, METER_GAIN, QUICK_RISE_FRAMES, STAGE_HALF_WIDTH, SUB,
  SUPER_FREEZE, TAUNT, THROW, WAHALA, px, scaling,
} from '../src/sim/constants';
import { CHARACTERS } from '../src/sim/data/characters';
import { invulnerable } from '../src/sim/combat';
import { BTN, type InputFrame, type MoveData, type SimEvent, type SimState } from '../src/sim/types';
import { fight, inp, inputStream, mirrored, moveInputs, tick } from './helpers';

const E = 'egbon-razak';
const W = CHARACTERS[E].pushWidth * SUB;
const move = (id: string): MoveData => CHARACTERS[E].moves.find((m) => m.id === id) as MoveData;
const LM = BTN.L | BTN.M;
const BLOCK = inp(6); // P2 faces left, so holding screen-right is holding back

/** P1 point-blank with P2, mid-stage or with P2 against the right wall. */
function close(wall = false, gapPx = 0): SimState {
  const s = fight();
  if (wall) {
    s.fighters[1].x = STAGE_HALF_WIDTH - W / 2;
    s.fighters[0].x = s.fighters[1].x - W - px(gapPx);
  } else {
    s.fighters[0].x = -W / 2 - px(gapPx) / 2;
    s.fighters[1].x = W / 2 + px(gapPx) / 2;
  }
  return s;
}

type Ev = SimEvent & { at: number };
type Brain = (i: number, s: SimState, last: Ev[]) => InputFrame;
const hold = (f: InputFrame): Brain => () => f;

function play(s: SimState, frames: number, p1: Brain, p2: Brain = hold(inp(5))): { s: SimState; events: Ev[] } {
  const events: Ev[] = [];
  let last: Ev[] = [];
  for (let i = 0; i < frames; i++) {
    const r = tick(s, p1(i, s, last), p2(i, s, last));
    s = r.s;
    last = r.events.map((e) => ({ ...e, at: i }));
    events.push(...last);
  }
  return { s, events };
}

/** Types each step; every step after the first waits for P1's previous attack to touch P2. */
function onContact(steps: InputFrame[][], after = inp(5)): Brain {
  let step = 0;
  let pos = 0;
  let armed = true;
  return (_i, _s, last) => {
    if (!armed && last.some((e) => (e.type === 'hit' || e.type === 'block') && e.side === 1)) { armed = true; pos = 0; }
    if (armed && step < steps.length) {
      const f = steps[step][pos++];
      if (pos >= steps[step].length) { step++; armed = false; }
      return f;
    }
    return after;
  };
}

/** Types a sequence once (from frame `start`), then holds. */
function typed(frames: InputFrame[], after = inp(5), start = 0): Brain {
  return (i) => (i < start ? inp(5) : i - start < frames.length ? frames[i - start] : after);
}

const hits = (ev: Ev[], side = 1): Ev[] => ev.filter((e) => e.type === 'hit' && e.side === side);

describe('hit-stop (spec 5.1)', () => {
  it.each([['hit', inp(5), HITSTOP.light[0]], ['block', BLOCK, HITSTOP.light[1]]] as const)(
    'a light %s freezes both fighters for the table value', (type, def, want) => {
      let s = close();
      s = tick(s, inp(5, BTN.L), def).s;
      let found: SimEvent | undefined;
      for (let i = 0; i < 10 && !found; i++) {
        const r = tick(s, inp(5), def);
        s = r.s;
        found = r.events.find((e) => e.type === type);
      }
      expect(found?.hitstop).toBe(want);
      const snap = JSON.stringify(s.fighters.map((f) => [f.x, f.frame, f.stun, f.action]));
      for (let i = 0; i < want; i++) s = tick(s, inp(5), def).s;
      expect(JSON.stringify(s.fighters.map((f) => [f.x, f.frame, f.stun, f.action]))).toBe(snap);
      s = tick(s, inp(5), def).s;
      expect(JSON.stringify(s.fighters.map((f) => [f.x, f.frame, f.stun, f.action]))).not.toBe(snap);
    });

  it('a button pressed during hit-stop is still waiting when it ends', () => {
    const r = play(close(), 40, onContact([[inp(5, BTN.L)], [inp(5, BTN.M)]]));
    expect(hits(r.events).map((e) => e.moveId)).toEqual(['5L', '5M']);
  });
});

describe('damage scaling (spec 6.5)', () => {
  it('runs 100, 100, 90, 80 ... with a floor of 30, and 50 for supers', () => {
    expect([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => scaling(n, false))).toEqual([100, 100, 90, 80, 70, 60, 50, 40, 30, 30, 30]);
    expect(scaling(9, true)).toBe(50);
  });

  it('a 5L, 5M, 5H chain deals 25 + 45 + 90% of 80', () => {
    const r = play(close(), 60, onContact([[inp(5, BTN.L)], [inp(5, BTN.M)], [inp(5, BTN.H)]]));
    expect(hits(r.events).map((e) => e.damage)).toEqual([25, 45, 72]);
    expect(r.s.combo[0].hits).toBe(3);
  });
});

describe('counter-hit and punish (spec 5.7)', () => {
  it('hitting a move in its startup is a COUNTER: +20% damage, +4 hit-stop, extra hitstun', () => {
    const r = play(close(), 6, typed([inp(5, BTN.L)]), typed([inp(5, BTN.H)]));
    const h = hits(r.events)[0];
    expect(h.counter).toBe(true);
    expect(h.damage).toBe(30);
    expect(h.hitstop).toBe(HITSTOP.light[0] + 4);
    expect(r.s.fighters[1].stun).toBe(move('5L').hitstun + 4);
  });

  it('hitting a move in its recovery is a PUNISH', () => {
    // P2 whiffs a haymaker from 150 px; P1 answers with Park Rush (M) into its recovery
    const p1 = typed(moveInputs(move('236M')), inp(6), 10);
    const r = play(close(false, 150 - 52), 40, p1, typed([inp(5, BTN.H)]));
    const h = hits(r.events)[0];
    expect(h?.moveId).toBe('236M');
    expect(h.punish).toBe(true);
    expect(h.damage).toBe(96);
  });
});

describe('chip and guard (spec 6.8)', () => {
  it('specials chip 1/6 of their damage, normals chip nothing', () => {
    let r = play(close(), 40, typed(moveInputs(move('236L'))), hold(BLOCK));
    expect(r.events.some((e) => e.type === 'block')).toBe(true);
    expect(CHARACTERS[E].health - r.s.fighters[1].health).toBe(10);
    r = play(close(), 30, typed([inp(5, BTN.H)]), hold(BLOCK));
    expect(r.s.fighters[1].health).toBe(CHARACTERS[E].health);
  });

  it('chip can KO', () => {
    const s = close();
    s.fighters[1].health = 5;
    const r = play(s, 40, typed(moveInputs(move('236L'))), hold(BLOCK));
    expect(r.events.some((e) => e.type === 'ko')).toBe(true);
    expect(r.s.roundWinner).toBe(0);
  });
});

describe('meter (spec 6.9)', () => {
  it('pays out for hits, blocks and specials', () => {
    let r = play(close(), 20, typed([inp(5, BTN.L)]));
    expect(r.s.meter).toEqual([METER_GAIN.hit, METER_GAIN.takeHit]);
    r = play(close(), 20, typed([inp(5, BTN.L)]), hold(BLOCK));
    expect(r.s.meter).toEqual([METER_GAIN.blockedAttacker, METER_GAIN.block]);
    r = play(close(false, 400), 5, typed(moveInputs(move('236L'))));
    expect(r.s.meter[0]).toBe(METER_GAIN.special);
  });

  it('an EX special costs a bar and does not come out without one', () => {
    let s = close(false, 400);
    let r = play(s, 6, typed(moveInputs(move('236S'))));
    expect(r.s.fighters[0].moveId).toBeNull();
    s = close(false, 400);
    s.meter[0] = 1500;
    r = play(s, 6, typed(moveInputs(move('236S'))));
    expect(r.s.fighters[0].moveId).toBe('236S');
    expect(r.s.meter[0]).toBe(500 + METER_GAIN.special);
  });

  it('meter carries into the next round', () => {
    const s = close();
    s.meter = [1234, 50];
    s.fighters[1].health = 1;
    const r = play(s, 400, typed([inp(5, BTN.L)]));
    expect(r.s.round).toBe(2);
    expect(r.s.meter[0]).toBeGreaterThanOrEqual(1234);
  });
});

describe('throws (spec 6.4)', () => {
  it('beat a block: 120 damage and a hard knockdown after the tech window', () => {
    const r = play(close(), 40, typed([inp(5, LM)]), hold(BLOCK));
    const t = r.events.find((e) => e.type === 'throw');
    const h = hits(r.events)[0];
    expect(t).toBeDefined();
    expect(h.at - (t as Ev).at).toBe(THROW.techWindow);
    expect(h.damage).toBe(120);
    expect(r.s.fighters[1].knockdownKind).toBe('hard');
  });

  it('the L and M may come a frame apart: the jab that came out turns into the throw', () => {
    const r = play(close(true), 30, typed([inp(5, BTN.L), inp(5, LM)]), hold(BLOCK));
    expect(r.events.some((e) => e.type === 'throw')).toBe(true);
  });

  it('lose to an active strike', () => {
    const r = play(close(), 30, typed([inp(5, LM)]), typed([inp(5), inp(5, BTN.L)]));
    expect(r.events.some((e) => e.type === 'throw')).toBe(false);
    expect(hits(r.events, 0).length).toBe(1);
  });

  it('can be teched with L+M inside the window, for no damage', () => {
    const r = play(close(), 40, typed([inp(5, LM)]), (_i, s) => {
      const d = s.fighters[1];
      return d.action === 'grabbed' && d.grabTimer <= THROW.techWindow - 3 ? inp(5, LM) : inp(5);
    });
    expect(r.events.some((e) => e.type === 'tech')).toBe(true);
    expect(r.s.fighters[1].health).toBe(CHARACTERS[E].health);
  });

  it('cannot grab an airborne opponent, one in hitstun or one just woken up', () => {
    let r = play(close(), 14, typed([inp(5, LM)], inp(5), 6), typed([inp(8)]));
    expect(r.events.some((e) => e.type === 'throw')).toBe(false);
    let s = close();
    s.fighters[1].action = 'hitstun';
    s.fighters[1].stun = 40;
    r = play(s, 12, typed([inp(5, LM)]));
    expect(r.events.some((e) => e.type === 'throw')).toBe(false);
    s = close();
    s.fighters[1].throwProtect = 10;
    r = play(s, 8, typed([inp(5, LM)]));
    expect(r.events.some((e) => e.type === 'throw')).toBe(false);
  });

  it('give 3 frames of throw protection after waking up', () => {
    let cur = play(close(), 40, typed([inp(5, LM)])).s;
    for (let i = 0; i < 200 && cur.fighters[1].action !== 'idle'; i++) cur = tick(cur).s;
    expect(cur.fighters[1].action).toBe('idle');
    expect(cur.fighters[1].throwProtect).toBe(THROW.wakeupProtect);
  });

  it('back throw swaps sides', () => {
    const r = play(close(), 40, typed([inp(4, LM)]));
    expect(hits(r.events)[0]?.moveId).toBe('back-throw');
    expect(r.s.fighters[1].x).toBeLessThan(r.s.fighters[0].x);
  });
});

describe('reversals (spec 6.7, 14)', () => {
  it('Danfo Door (M) beats a meaty 5H', () => {
    let won = 0;
    for (let offset = 0; offset < 12; offset++) {
      const p2 = typed(mirrored(moveInputs(move('623M'))), inp(5), offset);
      const r = play(close(), 50, typed([inp(5, BTN.H)]), p2);
      if (hits(r.events, 0).length > 0 && hits(r.events, 1).length === 0) won++;
    }
    expect(won).toBeGreaterThan(0);
  });

  it('Danfo Door is punishable on block', () => {
    let blocked = false;
    const r = play(close(), 80, (_i, s, last) => {
      if (last.some((e) => e.type === 'block' && e.side === 0)) blocked = true;
      return blocked && s.fighters[0].action !== 'blockstun' ? inp(5, BTN.H) : inp(4);
    }, typed(mirrored(moveInputs(move('623H')))));
    const h = hits(r.events)[0];
    expect(h?.moveId).toBe('5H');
    expect(h.punish).toBe(true);
  });

  it('Danfo Door (L) has no invincibility; M and H are strike- and throw-invincible early', () => {
    const f = close().fighters[0];
    f.action = 'attack';
    f.moveId = '623L';
    f.frame = 2;
    expect(invulnerable(f, 'strike')).toBe(false);
    f.moveId = '623M';
    expect(invulnerable(f, 'strike')).toBe(true);
    expect(invulnerable(f, 'throw')).toBe(true);
    f.frame = 7;
    expect(invulnerable(f, 'strike')).toBe(false);
  });
});

describe('juggles and combo limits (spec 6.6)', () => {
  it('past the juggle limit the opponent flips out and lands on their feet', () => {
    const s = close();
    const d = s.fighters[1];
    d.action = 'airhit';
    d.y = px(60);
    d.vy = 0;
    d.knockdownKind = 'soft';
    s.combo[0] = { hits: 3, damage: 100, step: 3, used: [], lightHits: 0, juggle: JUGGLE_LIMIT, startFrame: s.frame };
    const r = play(s, 60, typed([inp(5, BTN.H)]));
    expect(r.events.some((e) => e.type === 'flipout')).toBe(true);
    expect(hits(r.events).length).toBe(0);
    expect(r.events.some((e) => e.type === 'knockdown' && e.side === 1)).toBe(false);
  });

  it('no move combos into itself, and no combo lasts past 8 seconds', () => {
    for (const m of CHARACTERS[E].moves.filter((mv) => !mv.air && !mv.grab && mv.type !== 'feint')) {
      let s = close(true);
      const seq = moveInputs(m);
      let pos = 0;
      const counts = new Map<string, number>();
      let longest = 0;
      for (let i = 0; i < 900; i++) {
        const r = tick(s, seq[pos++ % seq.length], inp(5));
        s = r.s;
        s.meter[0] = 3000;
        s.wahala[0].active = m.type === 'wahala' ? 500 : 0;
        s.wahala[0].moveUsed = false;
        s.fighters[1].health = 1000;
        const combo = s.combo[0];
        if (combo.hits === 0) counts.clear();
        for (const e of r.events) {
          if (e.type !== 'hit' || e.side !== 1 || !e.moveId) continue;
          if (combo.hits === 1) counts.clear();
          counts.set(e.moveId, (counts.get(e.moveId) ?? 0) + 1);
          const mv = move(e.moveId);
          const limit = mv.hits > 1 ? mv.hits : mv.strength === 'light' ? 3 : 1;
          expect(counts.get(e.moveId), `${m.id} -> ${e.moveId} at frame ${i}`).toBeLessThanOrEqual(limit);
        }
        if (combo.hits > 0) longest = Math.max(longest, s.frame - combo.startFrame);
      }
      expect(longest, m.id).toBeLessThanOrEqual(COMBO_MAX_FRAMES);
    }
  });

  it('random mashing never builds a combo longer than 8 seconds', () => {
    const next = inputStream(99);
    let s = close(true);
    let longest = 0;
    for (let i = 0; i < 12000; i++) {
      s = tick(s, next(), inp(5)).s;
      s.fighters[1].health = 1000;
      s.fighters[0].health = 1000;
      if (s.combo[0].hits > 0) longest = Math.max(longest, s.frame - s.combo[0].startFrame);
    }
    expect(longest).toBeLessThanOrEqual(COMBO_MAX_FRAMES);
  });
});

describe('cancels (spec 6.3)', () => {
  it('2M cancels into Park Rush on contact', () => {
    const r = play(close(), 50, onContact([[inp(2, BTN.M)], moveInputs(move('236L'))]));
    expect(hits(r.events).map((e) => e.moveId)).toEqual(['2M', '236L']);
  });

  it('a special cancels into a super on hit', () => {
    const s = close();
    s.meter[0] = 1000;
    const r = play(s, 160, onContact([moveInputs(move('236L')), moveInputs(move('fare-collection'))]));
    expect(r.events.some((e) => e.type === 'super')).toBe(true);
    expect(hits(r.events).length).toBe(1 + move('fare-collection').hits);
  });

  it('chains only go up: 5H does not chain into 5L', () => {
    const r = play(close(), 30, onContact([[inp(5, BTN.H)], [inp(5, BTN.L), inp(5, BTN.L), inp(5, BTN.L)]]));
    expect(r.s.fighters[0].moveId).toBe('5H');
  });

  it('lights chain into themselves at most three in a row', () => {
    const r = play(close(), 60, onContact([[inp(5, BTN.L)], [inp(5, BTN.L)], [inp(5, BTN.L)], [inp(5, BTN.L)]]));
    expect(hits(r.events).length).toBe(3);
  });
});

describe('Egbon specials (spec 7.2)', () => {
  it('Ticket Slap is a three-part rekka: 214 L, 214 L, 214 H ends in the sweep', () => {
    const r = play(close(), 120, onContact([moveInputs(move('214A')), moveInputs(move('214A-2')), moveInputs(move('214H-3'))]));
    expect(hits(r.events).map((e) => e.moveId)).toEqual(['214A', '214A-2', '214H-3']);
  });

  it('the rekka can stop after any part, and part two never starts on its own', () => {
    const first = moveInputs(move('214A'));
    const r = play(close(false, 300), 120, (i) => (i < first.length ? first[i] : i >= 80 && i < 80 + first.length ? first[i - 80] : inp(5)));
    const starts = r.events.filter((e) => e.type === 'whiff' && e.side === 0).map((e) => e.moveId);
    expect(starts).toEqual(['214A', '214A']);
  });

  it('Conductor Hop comes out of a forward dash', () => {
    const r = play(close(false, 300), 12, typed(moveInputs(move('66H'))));
    expect(r.events.find((e) => e.type === 'whiff' && e.side === 0)?.moveId).toBe('66H');
  });

  it('Bus Stop (L) is a feint: no hit, and Egbon is free soon after', () => {
    const r = play(close(), 40, typed(moveInputs(move('22L'))));
    expect(r.events.some((e) => e.type === 'whiff' && e.moveId === '22L')).toBe(true);
    expect(hits(r.events).length).toBe(0);
    expect(r.s.fighters[0].action).not.toBe('attack');
  });

  it('EX Park Rush wall-bounces', () => {
    const s = close(true, 60);
    s.meter[0] = 1000;
    const r = play(s, 60, typed(moveInputs(move('236S'))));
    expect(hits(r.events)[0]?.moveId).toBe('236S');
    expect(r.events.some((e) => e.type === 'wallbounce')).toBe(true);
  });
});

describe('supers (spec 6.11)', () => {
  it('Fare Collection: one bar, 8 hits for 280, the last launches', () => {
    const s = close();
    s.meter[0] = 1000;
    const r = play(s, 260, typed(moveInputs(move('fare-collection'))));
    expect(r.events.some((e) => e.type === 'super')).toBe(true);
    const h = hits(r.events);
    expect(h.length).toBe(8);
    expect(h.reduce((a, e) => a + (e.damage ?? 0), 0)).toBe(280);
    expect(h[7].last).toBe(true);
    expect(h[7].hitstop).toBe(24);
    expect(r.s.meter[0]).toBe(0);
    expect(r.events.some((e) => e.type === 'knockdown' && e.side === 1)).toBe(true);
  });

  it('the super freeze lasts 40 frames', () => {
    const s = close();
    s.meter[0] = 1000;
    const seq = moveInputs(move('fare-collection'));
    let cur = play(s, seq.length, typed(seq)).s;
    expect(cur.hitstop).toBe(SUPER_FREEZE);
    cur = play(cur, SUPER_FREEZE, hold(inp(5))).s;
    expect(cur.hitstop).toBe(0);
    expect(cur.fighters[0].frame).toBe(1);
  });

  it('walking forward, 2M, then 236 is Park Rush, not Danfo Door; a quick 6236 is still the DP', () => {
    const walkIn = [...Array(10).fill(inp(6)), inp(2, BTN.M), ...Array(22).fill(inp(2)), inp(3), inp(6, BTN.L)];
    let r = play(close(false, 300), walkIn.length + 2, typed(walkIn));
    expect(r.events.filter((e) => e.type === 'whiff' && e.side === 0).map((e) => e.moveId)).toEqual(['2M', '236L']);
    r = play(close(false, 300), 8, typed([inp(6), inp(2), inp(3), inp(6, BTN.L)]));
    expect(r.events.find((e) => e.type === 'whiff' && e.side === 0)?.moveId).toBe('623L');
  });

  it('without the meter, the motion gives Park Rush instead', () => {
    const r = play(close(), 10, typed(moveInputs(move('fare-collection'))));
    expect(r.events.find((e) => e.type === 'whiff' && e.side === 0)?.moveId).toBe('236L');
  });

  it('Last Stop: three bars, a grab that cannot be blocked or teched, 400 damage', () => {
    const s = close(true);
    s.meter[0] = 3000;
    // P2 holds block, then mashes the throw tech once grabbed
    const r = play(s, 120, typed(moveInputs(move('last-stop'))), (i, cur) =>
      (cur.fighters[1].action === 'grabbed' && i % 2 === 0 ? inp(6, LM) : inp(6)));
    expect(r.events.some((e) => e.type === 'tech')).toBe(false);
    expect(hits(r.events)[0]?.damage).toBe(400);
    expect(r.s.fighters[1].knockdownKind).toBe('hard');
  });

  it('Level 2 is invincible through its first active frame', () => {
    const f = close().fighters[0];
    f.action = 'attack';
    f.moveId = 'last-stop';
    for (let fr = 1; fr <= move('last-stop').startup; fr++) {
      f.frame = fr;
      expect(invulnerable(f, 'strike')).toBe(true);
    }
  });
});

describe('Wahala Mode (spec 6.10)', () => {
  it('unlocks below 35% health and activates with S', () => {
    const s = close();
    s.fighters[1].health = 400;
    const r = play(s, 80, typed([inp(5, BTN.H)]), (_i, cur) =>
      (cur.wahala[1].available && cur.fighters[1].action === 'idle' ? inp(5, BTN.S) : inp(5)));
    expect(r.events.some((e) => e.type === 'wahala_ready' && e.side === 1)).toBe(true);
    expect(r.events.some((e) => e.type === 'wahala' && e.side === 1)).toBe(true);
    expect(r.s.wahala[1].usedThisRound).toBe(true);
    expect(r.s.wahala[1].active).toBeGreaterThan(WAHALA.durationFrames - 60);
  });

  it('is invincible during the flash and pushes the opponent away', () => {
    const s = close();
    s.wahala[1].available = true;
    const x0 = s.fighters[0].x;
    const r = play(s, 20, typed([inp(5, BTN.L)], inp(5), 4), typed([inp(5, BTN.S)]));
    expect(hits(r.events).length).toBe(0);
    expect(r.s.fighters[0].x).toBeLessThan(x0);
  });

  it('adds 15% damage', () => {
    const s = close();
    s.wahala[0] = { available: false, flash: 0, active: WAHALA.durationFrames, moveUsed: false, usedThisRound: true };
    const r = play(s, 20, typed([inp(5, BTN.L)]));
    expect(hits(r.events)[0].damage).toBe(Math.floor((25 * 115) / 100));
  });

  it('lasts 8 seconds after the flash', () => {
    const s = close();
    s.wahala[1].available = true;
    let r = play(s, 2, hold(inp(5)), typed([inp(5, BTN.S)]));
    expect(r.s.wahala[1].active).toBeGreaterThan(0);
    r = play(r.s, WAHALA.flashFrames + WAHALA.durationFrames, hold(inp(5)));
    expect(r.s.wahala[1].active).toBe(0);
  });

  it('grants No Change (armoured, long Park Rush) once', () => {
    let s = close(false, 400);
    s.wahala[0] = { available: false, flash: 0, active: WAHALA.durationFrames, moveUsed: false, usedThisRound: true };
    const rush = moveInputs(move('236L'));
    let r = play(s, rush.length, typed(rush));
    expect(r.s.fighters[0].moveId).toBe('no-change');
    expect(r.s.fighters[0].armorLeft).toBe(1);
    s = play(r.s, 80, hold(inp(5))).s;
    r = play(s, rush.length, typed(rush));
    expect(r.s.fighters[0].moveId).toBe('236L');
  });

  it('No Change armour absorbs one hit', () => {
    // P2's haymaker lands during the rush's startup; the rush keeps going and hits
    const s = close(false, 120);
    s.wahala[0] = { available: false, flash: 0, active: WAHALA.durationFrames, moveUsed: false, usedThisRound: true };
    const r = play(s, 60, typed(moveInputs(move('236L'))), typed([inp(5, BTN.H)]));
    expect(r.events.some((e) => e.type === 'armor' && e.side === 0)).toBe(true);
    expect(hits(r.events, 1)[0]?.moveId).toBe('no-change');
  });

  it('is lost at the end of the round if unused', () => {
    const s = close();
    s.wahala[1].available = true;
    s.fighters[0].health = 1;
    const r = play(s, 400, hold(inp(5)), typed([inp(5, BTN.L)]));
    expect(r.s.round).toBe(2);
    expect(r.s.wahala[1].available).toBe(false);
  });
});

describe('knockdowns and taunts (spec 6.7)', () => {
  /** Frames the defender stays down after the move's knockdown. */
  function downFor(moveId: string, p2: InputFrame): number {
    let s = close();
    const seq = moveInputs(move(moveId));
    for (let i = 0; i < 200 && s.fighters[1].action !== 'knockdown'; i++) s = tick(s, i < seq.length ? seq[i] : inp(5), p2).s;
    let n = 1;
    while (s.fighters[1].action === 'knockdown' && n < 200) { s = tick(s, inp(5), p2).s; n++; }
    return n - 1;
  }

  it('hard knockdowns keep them down 52 frames, soft 30, quick-rise 18', () => {
    expect(downFor('throw', inp(5))).toBe(KNOCKDOWN_FRAMES.hard);
    expect(downFor('236H', inp(5))).toBe(KNOCKDOWN_FRAMES.soft);
    expect(downFor('236H', inp(2))).toBe(QUICK_RISE_FRAMES);
  });

  it('a taunt earns meter once a round', () => {
    let r = play(close(false, 300), 5, typed([inp(5, BTN.T)]));
    expect(r.s.fighters[0].action).toBe('taunt');
    expect(r.s.meter[0]).toBe(TAUNT.meter);
    r = play(r.s, TAUNT.frames + 5, hold(inp(5)));
    r = play(r.s, 5, typed([inp(5, BTN.T)]));
    expect(r.s.fighters[0].action).toBe('taunt');
    expect(r.s.meter[0]).toBe(TAUNT.meter);
  });
});
