// The playtest feel pass (29 Oct): Wahala beats a normal pressed with it, hit-stop follows the spec
// table, meter gains are doubled, nobody walks on after the round, and bodies never overlap.

import { describe, expect, it } from 'vitest';
import { Cpu } from '../src/ai/cpu';
import { FPS, HITSTOP, HITSTOP_COUNTER_BONUS, METER_GAIN, px } from '../src/sim/constants';
import { createSim, step } from '../src/sim/step';
import { character } from '../src/sim/data/characters';
import { BTN, type SimState } from '../src/sim/types';
import { fight, inp, NEUTRAL, runFor, tick } from './helpers';

const H = BTN.H;
const S = BTN.S;

function wahalaReady(): SimState {
  const s = fight();
  s.fighters[0].x = -px(40);
  s.fighters[1].x = px(40);
  s.wahala[0].available = true;
  return s;
}

describe('Wahala input (H+S)', () => {
  it('H and S on the same frame is Wahala, not 5H', () => {
    const s = tick(wahalaReady(), inp(5, H | S)).s;
    expect(s.fighters[0].action).toBe('wahala');
  });

  it('S then H within the window is Wahala', () => {
    let s = tick(wahalaReady(), inp(5, S)).s;
    s = tick(s, inp(5, S | H)).s;
    expect(s.fighters[0].action).toBe('wahala');
  });

  for (const late of [1, 2]) {
    it(`H then S ${late} frame(s) later cancels the 5H into Wahala`, () => {
      let s = tick(wahalaReady(), inp(5, H)).s;
      expect(s.fighters[0].moveId).toBe('5H');
      for (let i = 1; i < late; i++) s = tick(s, inp(5, H)).s;
      s = tick(s, inp(5, H | S)).s;
      expect(s.fighters[0].action).toBe('wahala');
    });
  }

  it('a normal that is well under way is not cancelled', () => {
    let s = tick(wahalaReady(), inp(5, H)).s;
    s = runFor(s, 6, inp(5, H));
    s = tick(s, inp(5, H | S)).s;
    expect(s.fighters[0].action).toBe('attack');
  });
});

describe('hit-stop and meter', () => {
  it('uses the spec table: 8/11/14 on hit, 5/8/11 on block, +4 on counter', () => {
    expect([HITSTOP.light[0], HITSTOP.medium[0], HITSTOP.heavy[0]]).toEqual([8, 11, 14]);
    expect([HITSTOP.light[1], HITSTOP.medium[1], HITSTOP.heavy[1]]).toEqual([5, 8, 11]);
    expect(HITSTOP_COUNTER_BONUS).toBe(4);
  });

  it('freezes the fighters for exactly the table value on a 5H hit', () => {
    let s = fight();
    s.fighters[0].x = -px(40);
    s.fighters[1].x = px(40);
    s = tick(s, inp(5, H)).s;
    let frozen = 0;
    for (let i = 0; i < 40; i++) {
      const was = s.hitstop;
      s = tick(s).s;
      if (was > 0) frozen++;
    }
    expect(frozen).toBe(HITSTOP.heavy[0]);
  });

  it('gains meter at the doubled rates', () => {
    expect(METER_GAIN).toEqual({ hit: 40, blockedAttacker: 20, takeHit: 15, block: 10, special: 10 });
    let s = fight();
    s.fighters[0].x = -px(40);
    s.fighters[1].x = px(40);
    s = runFor(tick(s, inp(5, BTN.L)).s, 20);
    expect(s.meter).toEqual([METER_GAIN.hit, METER_GAIN.takeHit]);
  });
});

describe('supers in CPU matches', () => {
  it('Normal CPUs use about one super per round (at least one per round over three matches)', () => {
    let rounds = 0;
    let supers = 0;
    for (const seed of [1, 2, 3]) {
      let s = createSim(['egbon-razak', 'egbon-razak'], seed);
      const a = new Cpu(0, 'normal', seed * 7);
      const b = new Cpu(1, 'normal', seed * 13 + 1);
      for (let i = 0; i < 4 * 99 * FPS && s.phase !== 'matchEnd'; i++) {
        const r = step(s, a.next(s), b.next(s));
        s = r.state;
        for (const e of r.events) {
          if (e.type === 'super') supers++;
          if (e.type === 'round_end') rounds++;
        }
      }
    }
    expect(rounds).toBeGreaterThanOrEqual(6);
    expect(supers).toBeGreaterThanOrEqual(rounds);
  }, 120000);
});

describe('bodies and the end of a round', () => {
  it('stops a walking fighter when the round ends on time', () => {
    let s = fight();
    s.timer = 2;
    s = runFor(s, 2, inp(6), NEUTRAL);
    expect(s.phase).toBe('roundEnd');
    const x = s.fighters[0].x;
    s = runFor(s, 40);
    expect(s.fighters[0].x).toBe(x);
    expect(s.fighters[0].vx).toBe(0);
  });

  it('keeps the push boxes apart through a throw', () => {
    let s = fight();
    s.fighters[0].x = -px(30);
    s.fighters[1].x = px(30);
    const need = px(character('egbon-razak').pushWidth);
    s = tick(s, inp(5, BTN.L | BTN.M)).s;
    for (let i = 0; i < 60; i++) {
      s = tick(s).s;
      const [a, b] = s.fighters;
      if (Math.abs(a.y - b.y) < px(70)) expect(Math.abs(a.x - b.x)).toBeGreaterThanOrEqual(need - 1);
    }
  });
});
