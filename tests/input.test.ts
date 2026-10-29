import { describe, expect, it } from 'vitest';
import { bufferedButton, hasMotion, recordInput, relativeDir } from '../src/sim/input';
import { createFighter } from '../src/sim/fighter';
import { BTN } from '../src/sim/types';

const hold = (dir: number, n: number): number[] => Array.from({ length: n }, () => dir);

describe('motions', () => {
  it('recognises 236 done quickly, and lenient versions of it', () => {
    expect(hasMotion([2, 3, 6], '236')).toBe(true);
    expect(hasMotion([...hold(2, 3), ...hold(3, 2), ...hold(6, 2)], '236')).toBe(true);
    expect(hasMotion([2, 3, 6, 5], '236')).toBe(true); // 2365 still counts
  });

  it('a motion spread over more than its window does not count', () => {
    expect(hasMotion([2, ...hold(5, 14), 3, 6], '236')).toBe(false);
    expect(hasMotion([2, ...hold(5, 10), 3, 6], '236')).toBe(true);
  });

  it('623 also accepts 6236, and 214 needs back', () => {
    expect(hasMotion([6, 2, 3], '623')).toBe(true);
    expect(hasMotion([6, 2, 3, 6], '623')).toBe(true);
    expect(hasMotion([2, 1, 4], '214')).toBe(true);
    expect(hasMotion([2, 3, 6], '214')).toBe(false);
  });

  it('a fighter facing left has its directions mirrored so 6 is always forward', () => {
    expect(relativeDir(4, -1)).toBe(6);
    expect(relativeDir(1, -1)).toBe(3);
    expect(relativeDir(8, -1)).toBe(8);
  });
});

describe('button buffer', () => {
  it('remembers a press for 4 frames and prefers the strongest button', () => {
    const f = createFighter('egbon-razak', 0, 1);
    recordInput(f, { dir: 5, buttons: BTN.L | BTN.H });
    expect(bufferedButton(f)).toBe('H');
    for (let i = 0; i < 3; i++) recordInput(f, { dir: 5, buttons: BTN.L | BTN.H });
    expect(bufferedButton(f)).toBe('H');
    recordInput(f, { dir: 5, buttons: BTN.L | BTN.H });
    expect(bufferedButton(f)).toBeNull(); // held, not pressed again: the press has expired
  });
});
