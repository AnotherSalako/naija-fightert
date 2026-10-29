import { describe, expect, it } from 'vitest';
import { MAX_SEPARATION, PREJUMP_FRAMES, SUB } from '../src/sim/constants';
import { CHARACTERS } from '../src/sim/data/characters';
import { fight, inp, runFor, tick } from './helpers';

describe('movement', () => {
  it.each(Object.keys(CHARACTERS))('%s walks forward and back at the speeds in the data', (id) => {
    const c = CHARACTERS[id];
    let s = fight([id, id]);
    const x0 = s.fighters[0].x;
    s = runFor(s, 20, inp(6));
    expect(s.fighters[0].x - x0).toBe(Math.round(c.walkForward * SUB) * 20);
    const x1 = s.fighters[0].x;
    s = runFor(s, 10, inp(4));
    expect(x1 - s.fighters[0].x).toBe(Math.round(c.walkBack * SUB) * 10);
  });

  it.each(Object.keys(CHARACTERS))('%s jumps after a 4-frame pre-jump and lands after its airtime', (id) => {
    const c = CHARACTERS[id];
    let s = fight([id, id]);
    s = tick(s, inp(8)).s;
    let grounded = 1;
    while (s.fighters[0].y === 0 && grounded < 20) { s = tick(s).s; grounded++; }
    expect(grounded).toBe(PREJUMP_FRAMES + 1);
    let air = 0;
    let top = 0;
    while (s.fighters[0].y > 0 && air < 200) { top = Math.max(top, s.fighters[0].y); s = tick(s).s; air++; }
    expect(Math.abs(air - c.jump.frames)).toBeLessThanOrEqual(2);
    expect(Math.abs(top / SUB - c.jump.height)).toBeLessThanOrEqual(c.jump.height * 0.08);
    expect(s.fighters[0].action).toBe('land');
  });

  it('a double tap forward dashes about the distance in the data', () => {
    const c = CHARACTERS['egbon-razak'];
    let s = fight();
    s.fighters[1].x = s.fighters[0].x + 500 * SUB; // room to dash
    const x0 = s.fighters[0].x;
    s = tick(s, inp(6)).s;
    s = tick(s, inp(5)).s;
    s = tick(s, inp(6)).s;
    expect(s.fighters[0].action).toBe('dash');
    s = runFor(s, c.dash.frames + 2);
    const moved = (s.fighters[0].x - x0) / SUB;
    expect(Math.abs(moved - c.dash.distance - Math.round(c.walkForward * 2))).toBeLessThanOrEqual(12);
  });

  it('walking away stops at the camera limit', () => {
    let s = fight();
    s = runFor(s, 200, inp(4), inp(6));
    expect(Math.abs(s.fighters[1].x - s.fighters[0].x)).toBeLessThanOrEqual(MAX_SEPARATION);
  });

  it('fighters turn to face each other after crossing over', () => {
    let s = fight();
    s.fighters[0].x = s.fighters[1].x + 200 * SUB;
    s = runFor(s, 2);
    expect(s.fighters[0].facing).toBe(-1);
    expect(s.fighters[1].facing).toBe(1);
  });
});
