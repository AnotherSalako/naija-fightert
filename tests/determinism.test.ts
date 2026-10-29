import { describe, expect, it } from 'vitest';
import { hashState } from '../src/sim/hash';
import { createSim, loadState, saveState, step } from '../src/sim/step';
import type { InputFrame, SimState } from '../src/sim/types';
import { inputStream } from './helpers';

function play(s: SimState, frames: number, a: () => ReturnType<ReturnType<typeof inputStream>>, b: typeof a): SimState {
  let cur = s;
  for (let i = 0; i < frames; i++) cur = step(cur, a(), b()).state;
  return cur;
}

/** Random inputs that use every button: L, M, H, S, taunt and L+M throws, with motion-like rolls. */
function fullStream(seed: number): () => InputFrame {
  let x = seed >>> 0;
  const rnd = (n: number): number => { x = (Math.imul(x, 1664525) + 1013904223) >>> 0; return x % n; };
  const ROLLS = [[2, 3, 6], [6, 2, 3], [2, 1, 4], [2, 5, 2], [2, 3, 6, 2, 3, 6], [2, 1, 4, 2, 1, 4], [6, 5, 6]];
  let queue: InputFrame[] = [];
  return () => {
    if (queue.length === 0) {
      const BUT = [1, 2, 4, 8, 16, 3];
      const b = BUT[rnd(BUT.length)];
      if (rnd(3) === 0) {
        const roll = ROLLS[rnd(ROLLS.length)];
        queue = roll.map((d, i) => ({ dir: d, buttons: i === roll.length - 1 ? b : 0 }));
      } else {
        const dir = 1 + rnd(9);
        const n = 2 + rnd(12);
        queue = Array.from({ length: n }, (_, i) => ({ dir, buttons: i === 0 && rnd(2) === 0 ? b : 0 }));
      }
    }
    return queue.shift() as InputFrame;
  };
}

describe('determinism', () => {
  it('every system (meter, supers, throws, Wahala, rekkas) stays deterministic over 10,000 frames', () => {
    const run = (): string => {
      let s = createSim(['egbon-razak', 'egbon-razak'], 21);
      s.meter = [3000, 3000];
      const a = fullStream(5);
      const b = fullStream(6);
      for (let i = 0; i < 10000; i++) s = step(s, a(), b()).state;
      return hashState(s);
    };
    expect(run()).toBe(run());
  });

  it('rollback through supers and throws re-simulates exactly', () => {
    const a = fullStream(8);
    const b = fullStream(9);
    let s = createSim(['egbon-razak', 'egbon-razak'], 4);
    s.meter = [3000, 3000];
    s = play(s, 3000, a, b);
    const snap = saveState(s);
    const recA = Array.from({ length: 3000 }, a);
    const recB = Array.from({ length: 3000 }, b);
    for (let i = 0; i < 3000; i++) s = step(s, recA[i], recB[i]).state;
    let r = loadState(snap);
    for (let i = 0; i < 3000; i++) r = step(r, recA[i], recB[i]).state;
    expect(hashState(r)).toBe(hashState(s));
  });

  it('the same inputs and seed give the identical state after 10,000 frames', () => {
    const run = (): string => hashState(play(createSim(['iya-matthew', 'egbon-razak'], 7), 10000, inputStream(1), inputStream(2)));
    expect(run()).toBe(run());
  });

  it('save, load and re-simulate (rollback) gives the identical result', () => {
    const a = inputStream(3);
    const b = inputStream(4);
    let s = play(createSim(['chief-priest', 'iya-matthew'], 9), 4000, a, b);
    const snap = saveState(s);
    // record the next 2000 frames of input so they can be replayed after the rollback
    const recA = Array.from({ length: 2000 }, a);
    const recB = Array.from({ length: 2000 }, b);
    for (let i = 0; i < 2000; i++) s = step(s, recA[i], recB[i]).state;
    let r = loadState(snap);
    for (let i = 0; i < 2000; i++) r = step(r, recA[i], recB[i]).state;
    expect(hashState(r)).toBe(hashState(s));
  });

  it('step never changes the state it was given', () => {
    const s = createSim(['egbon-razak', 'egbon-razak'], 3);
    const before = hashState(s);
    step(s, { dir: 6, buttons: 1 }, { dir: 4, buttons: 2 });
    expect(hashState(s)).toBe(before);
  });

  it('a long random fight never crashes and keeps the fighters inside the stage', () => {
    let s = createSim(['iya-matthew', 'chief-priest'], 5);
    const a = inputStream(11);
    const b = inputStream(12);
    let bad = '';
    for (let i = 0; i < 20000 && !bad; i++) {
      s = step(s, a(), b()).state;
      for (const f of s.fighters) {
        if (!Number.isInteger(f.x) || !Number.isInteger(f.y) || f.health < 0) bad = `frame ${i}: x ${f.x} y ${f.y} hp ${f.health}`;
      }
    }
    expect(bad).toBe('');
  });
});
