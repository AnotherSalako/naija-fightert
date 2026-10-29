// Launchers and knockdowns (playtest, 29 Oct): a launch rises about 140 px over about 45 frames, allows
// one juggle follow-up and no more, bounces once off the floor and ends in a 45-frame hard knockdown.

import { describe, expect, it } from 'vitest';
import { FLOOR_BOUNCE, KNOCKDOWN_FRAMES, SUB, px } from '../src/sim/constants';
import { actionable } from '../src/sim/fighter';
import { character } from '../src/sim/data/characters';
import type { SimState } from '../src/sim/types';
import { fight, inp, moveInputs, tick } from './helpers';

const egbon = character('egbon-razak');
const move = (id: string) => egbon.moves.find((m) => m.id === id)!;

/** P1 uppercuts (2H) P2 from close range; returns the state on the frame of the launch. */
function launched(): SimState {
  const s = fight();
  s.fighters[0].x = -px(35);
  s.fighters[1].x = px(35);
  let r = tick(s, inp(2, 4));
  for (let i = 0; i < 30 && !r.events.some((e) => e.type === 'hit'); i++) r = tick(r.s, inp(2));
  return r.s;
}

/** Type a move for P1 as soon as it is free, then run until it hits, flips the opponent out, or gives up. */
function followUp(s: SimState, id: string, stepBack = 0): { s: SimState; result: 'hit' | 'flipout' | 'none' } {
  let cur = s;
  for (let i = 0; i < 60 && !actionable(cur.fighters[0]); i++) cur = tick(cur).s;
  for (let i = 0; i < stepBack; i++) cur = tick(cur, inp(4)).s;
  for (const f of moveInputs(move(id))) {
    const r = tick(cur, f);
    cur = r.s;
    if (r.events.some((e) => e.type === 'flipout')) return { s: cur, result: 'flipout' };
    if (r.events.some((e) => e.type === 'hit' && e.side === 1)) return { s: cur, result: 'hit' };
  }
  for (let i = 0; i < 40; i++) {
    const r = tick(cur);
    cur = r.s;
    if (r.events.some((e) => e.type === 'flipout')) return { s: cur, result: 'flipout' };
    if (r.events.some((e) => e.type === 'hit' && e.side === 1)) return { s: cur, result: 'hit' };
  }
  return { s: cur, result: 'none' };
}

describe('launchers', () => {
  it('2H launches about 140 px high for about 45 frames', () => {
    let s = launched();
    expect(s.fighters[1].action).toBe('airhit');
    while (s.hitstop > 0) s = tick(s).s;
    let top = 0;
    let air = 0;
    while (s.fighters[1].y > 0 && air < 120 && !s.fighters[1].bounced) {
      top = Math.max(top, s.fighters[1].y);
      s = tick(s).s;
      air++;
    }
    expect(Math.abs(top / SUB - 140)).toBeLessThanOrEqual(8);
    expect(Math.abs(air - 45)).toBeLessThanOrEqual(3);
  });

  // 236L travels 120 px, so from point blank it runs under the body: it is typed from a short step back
  for (const [id, back] of [['623L', 0], ['236L', 6]] as const) {
    it(`allows one juggle follow-up (${id}) and flips the opponent out of a second`, () => {
      const first = followUp(launched(), id, back);
      expect(first.result).toBe('hit');
      const second = followUp(first.s, '623L');
      expect(second.result).not.toBe('hit');
    });
  }

  it('bounces once off the floor, slides, then lies down for a 45-frame hard knockdown', () => {
    let s = launched();
    let bounces = 0;
    let down = 0;
    let slid = false;
    for (let i = 0; i < 240 && s.fighters[1].action !== 'getup'; i++) {
      const before = s.fighters[1].x;
      const r = tick(s);
      s = r.s;
      bounces += r.events.filter((e) => e.type === 'bounce').length;
      if (s.fighters[1].bounced && s.fighters[1].x !== before) slid = true;
      if (s.fighters[1].action === 'knockdown') down++;
    }
    expect(bounces).toBe(1);
    expect(slid).toBe(true);
    expect(FLOOR_BOUNCE.slide).toBeGreaterThan(0);
    expect(KNOCKDOWN_FRAMES.hard).toBe(45);
    expect(down).toBeGreaterThanOrEqual(KNOCKDOWN_FRAMES.hard);
    expect(down).toBeLessThanOrEqual(KNOCKDOWN_FRAMES.hard + 2);
  });
});
