// Authored clips follow the data table (src/render/animsets/*.json) and stay on the frame data
// (src/render/clips.ts): the time comes from the sim frame, an attack's contact lands on its first
// active frame, new clips are picked up as soon as the model has them, and the rest fall back to poses.

import { describe, expect, it } from 'vitest';
import { animSet } from '../src/render/animsets';
import { clipFor, type ClipInfo } from '../src/render/clips';
import type { FighterState, MoveData } from '../src/sim/types';

const set = animSet('egbon-razak');
const clips: Record<string, ClipInfo> = {
  'fighting-idle': { duration: 3.3, contact: 0, low: 1 },
  'walk-step-fwd': { duration: 1.0, contact: 0.5, low: 0.6 },
  'walk-step-back': { duration: 0.833, contact: 0.5, low: 0.5 },
  'air-hit': { duration: 2.433, contact: 0.7, low: 1.1 },
  'ko-punch': { duration: 2.133, contact: 0.8, low: 1.1 },
  'getup-floor': { duration: 2.7, contact: 1.0, low: 0.27 },
  'hk-jab': { duration: 0.167, contact: 0.05, low: 0.05 },
  'hk-rush': { duration: 0.5, contact: 0.217, low: 0.1 },
  'hk-uppercut': { duration: 0.55, contact: 0.183, low: 0.08 },
  'walk-forward': { duration: 1.367, contact: 0, low: 0.3 },
  'walk-back': { duration: 0.867, contact: 0, low: 0.4 },
  'hit-reaction': { duration: 0.433, contact: 0.2, low: 0.17 },
  knockdown: { duration: 4.933, contact: 4.8, low: 2.233 },
};
const fighter = (action: string, frame: number, crouching = false): FighterState =>
  ({ charId: 'egbon-razak', action, frame, crouching } as unknown as FighterState);
const move = (id: string, startup = 3): MoveData => ({ id, startup, active: 2, recovery: 6, animHoldFrames: 0 } as MoveData);
const jab = move('5L');

describe('clipFor', () => {
  it('plays a hand-keyed move frame for frame, from its first frame, and holds its last', () => {
    expect(clipFor(fighter('attack', 1), jab, 0, clips, set)).toMatchObject({ name: 'hk-jab', time: 0 });
    expect(clipFor(fighter('attack', 3), jab, 0, clips, set)!.time).toBeCloseTo(2 / 60);
    expect(clipFor(fighter('attack', 40), jab, 0, clips, set)!.time).toBe(clips['hk-jab'].duration);
  });

  it('squeezes a shared clip (Park Rush) so its contact lands on the first active frame of each strength', () => {
    for (const startup of [8, 10, 12, 15]) {
      const rush = move('236L', startup);
      expect(clipFor(fighter('attack', startup), rush, 0, clips, set)).toMatchObject({ name: 'hk-rush', time: 0.217 });
      expect(clipFor(fighter('attack', 1), rush, 0, clips, set)!.time).toBeLessThan(0.217);
      const after = clipFor(fighter('attack', startup + 4), rush, 0, clips, set)!;
      expect(after.time).toBeGreaterThan(0.217);
      expect(after.time).toBeLessThanOrEqual(clips['hk-rush'].duration);
    }
  });

  it('depends only on the frame, so hit-stop freezes it and replays match', () => {
    expect(clipFor(fighter('attack', 2), jab, 0, clips, set)).toEqual(clipFor(fighter('attack', 2), jab, 0, clips, set));
  });

  it('loops the idle and picks the walk by direction', () => {
    const late = clipFor(fighter('idle', 1 + 60 * 10), null, 0, clips, set)!;
    expect(late.name).toBe('fighting-idle');
    expect(late.time).toBeLessThan(3.3);
    expect(clipFor(fighter('walk', 5), null, 1, clips, set)!.name).toBe('walk-step-fwd');
    expect(clipFor(fighter('walk', 5), null, -1, clips, set)!.name).toBe('walk-step-back');
  });

  it('plays an air hit as the air-hit clip, never a standing clip', () => {
    expect(clipFor(fighter('airhit', 4), null, 0, clips, set)).toMatchObject({ name: 'air-hit' });
  });

  it('lies flat through a knockdown, then starts rising its last frames and carries the rise through the get-up', () => {
    const down = (frame: number, kind = 'soft'): FighterState => ({ ...fighter('knockdown', frame), knockdownKind: kind, quickRise: false } as FighterState);
    expect(clipFor(down(1), null, 0, clips, set)).toMatchObject({ name: 'ko-punch', time: clips['ko-punch'].duration });
    expect(clipFor(down(5), null, 0, clips, set)).toMatchObject({ name: 'ko-punch' });
    const rise = set!.rise!;
    const start = clipFor(down(30 - rise.lead), null, 0, clips, set)!;
    expect(start).toMatchObject({ name: 'getup-floor', time: rise.from });
    const lastDown = clipFor(down(30), null, 0, clips, set)!.time;
    const firstUp = clipFor(fighter('getup', 1), null, 0, clips, set)!.time;
    expect(firstUp).toBeGreaterThan(lastDown);
    expect(firstUp - lastDown).toBeCloseTo(rise.speed / 60, 5);
    expect(clipFor(down(45 - rise.lead, 'hard'), null, 0, clips, set)!.name).toBe('getup-floor');
    expect(clipFor(down(20, 'hard'), null, 0, clips, set)!.name).toBe('ko-punch');
  });

  it('falls back to the poses where no listed clip exists yet', () => {
    expect(clipFor(fighter('attack', 3), move('22L'), 0, clips, set)).toBeNull();
    expect(clipFor(fighter('blockstun', 3), null, 0, clips, set)).toBeNull();
    expect(clipFor(fighter('land', 2), null, 0, clips, set)).toBeNull();
    expect(clipFor(fighter('idle', 3), null, 0, clips, undefined)).toBeNull();
  });
});
