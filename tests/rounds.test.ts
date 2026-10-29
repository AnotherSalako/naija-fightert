import { describe, expect, it } from 'vitest';
import { ROUND_END_FRAMES, ROUND_SECONDS, FPS, SUB } from '../src/sim/constants';
import { CHARACTERS } from '../src/sim/data/characters';
import { BTN, type SimState } from '../src/sim/types';
import { fight, inp, runFor, tick } from './helpers';

/** Leave P2 on 1 health and jab them. */
function koP2(s: SimState): SimState {
  s.fighters[1].health = 1;
  s.fighters[0].x = s.fighters[1].x - 60 * SUB;
  let cur = tick(s, inp(5, BTN.L)).s;
  return runFor(cur, 8);
}

describe('rounds and the match', () => {
  it('a KO ends the round and scores it', () => {
    const s = koP2(fight());
    expect(s.phase).toBe('roundEnd');
    expect(s.wins).toEqual([1, 0]);
    expect(s.roundWinner).toBe(0);
  });

  it('the next round starts with full health and fighters back at their marks', () => {
    let s = koP2(fight());
    s = runFor(s, ROUND_END_FRAMES + 2);
    expect(s.round).toBe(2);
    expect(s.phase).toBe('intro');
    expect(s.fighters[1].health).toBe(CHARACTERS['egbon-razak'].health);
    expect(s.combo[0].hits).toBe(0);
  });

  it('two round wins take the match, best of three', () => {
    let s = koP2(fight());
    s = runFor(s, ROUND_END_FRAMES + 125);
    s = koP2(s);
    s = runFor(s, ROUND_END_FRAMES + 2);
    expect(s.phase).toBe('matchEnd');
    expect(s.matchWinner).toBe(0);
  });

  it('the 99-second clock counts down one per frame and time-up goes to the higher health share', () => {
    let s = fight(['iya-matthew', 'chief-priest']);
    const start = s.timer; // the clock starts on the frame "Fight!" appears
    expect(start).toBeGreaterThan(ROUND_SECONDS * FPS - 3);
    s = runFor(s, 10);
    expect(s.timer).toBe(start - 10);
    s.timer = 1;
    s.fighters[0].health = 600; // 52% of 1150
    s.fighters[1].health = 500; // 56% of 900
    s = tick(s).s;
    expect(s.phase).toBe('roundEnd');
    expect(s.roundWinner).toBe(1);
  });

  it('nothing moves during the round intro', () => {
    let s = fight();
    s = runFor(s, ROUND_END_FRAMES); // in the fight already, so start a fresh one
    const fresh = runFor(koP2(s), ROUND_END_FRAMES + 2);
    const x = fresh.fighters[0].x;
    const later = runFor(fresh, 30, inp(6, BTN.H));
    expect(later.fighters[0].x).toBe(x);
    expect(later.fighters[0].action).toBe('idle');
  });
});
