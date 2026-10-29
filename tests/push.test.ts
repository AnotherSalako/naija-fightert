import { describe, expect, it } from 'vitest';
import { STAGE_HALF_WIDTH, SUB } from '../src/sim/constants';
import { CHARACTERS } from '../src/sim/data/characters';
import { BTN } from '../src/sim/types';
import { fight, inp, tick } from './helpers';

const ids = Object.keys(CHARACTERS);
const pairs = ids.flatMap((a) => ids.map((b) => [a, b] as [string, string]));

describe('push boxes and the corner rule', () => {
  it.each(pairs)('%s pressing %s into the corner never overlaps them', (a, b) => {
    let s = fight([a, b]);
    const need = ((CHARACTERS[a].pushWidth + CHARACTERS[b].pushWidth) * SUB) / 2;
    s.fighters[1].x = STAGE_HALF_WIDTH - (CHARACTERS[b].pushWidth * SUB) / 2;
    s.fighters[0].x = s.fighters[1].x - need - 40 * SUB;
    const presses = [BTN.L, BTN.M, BTN.H, 0, 0, 0];
    for (let i = 0; i < 400; i++) {
      // walk in and throw every normal, forward ones included, at a blocking opponent in the corner
      const button = i % 9 === 0 ? presses[(i / 9) % presses.length] : 0;
      const dir = i % 27 < 9 ? 6 : 5;
      s = tick(s, inp(dir, button), inp(6)).s;
      const gap = s.fighters[1].x - s.fighters[0].x;
      expect(gap, `frame ${i}`).toBeGreaterThanOrEqual(need - 1);
    }
  });

  it('in the corner the attacker is pushed back instead of the defender', () => {
    let s = fight();
    const need = ((CHARACTERS['egbon-razak'].pushWidth * 2) * SUB) / 2;
    s.fighters[1].x = STAGE_HALF_WIDTH - (CHARACTERS['egbon-razak'].pushWidth * SUB) / 2;
    s.fighters[0].x = s.fighters[1].x - need;
    const ax = s.fighters[0].x;
    s = tick(s, inp(5, BTN.H), inp(6)).s;
    for (let i = 0; i < 30; i++) s = tick(s, inp(5), inp(6)).s;
    expect(s.fighters[0].x).toBeLessThan(ax);
    expect(s.fighters[1].x).toBe(STAGE_HALF_WIDTH - (CHARACTERS['egbon-razak'].pushWidth * SUB) / 2);
  });

  it('a jump can carry a fighter over the other, then they swap sides', () => {
    let s = fight();
    s.fighters[0].x = -60 * SUB;
    s.fighters[1].x = 60 * SUB;
    s = tick(s, inp(9)).s;
    for (let i = 0; i < 60; i++) s = tick(s).s;
    expect(s.fighters[0].x).toBeGreaterThan(s.fighters[1].x);
    expect(s.fighters[0].facing).toBe(-1);
  });
});
