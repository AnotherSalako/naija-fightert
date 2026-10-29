import { describe, expect, it } from 'vitest';
import { FIGHTER_SHARE, frame, STAGE_ART_HALF_WIDTH } from '../src/render/camera';
import { poseFor, type Pose } from '../src/render/poses';
import { CHARACTERS } from '../src/sim/data/characters';
import { createFighter, totalFrames } from '../src/sim/fighter';
import type { Action } from '../src/sim/types';

describe('camera framing (spec 4.4)', () => {
  it('fighters fill 40 to 45% of the screen height at normal distance, on any common aspect', () => {
    for (const aspect of [16 / 9, 19.5 / 9, 4 / 3]) {
      const f = frame(-1.5, 1.5, 1.82, aspect);
      const share = 1.82 / f.visibleHeight;
      expect(share, `aspect ${aspect}`).toBeGreaterThanOrEqual(0.4);
      expect(share).toBeLessThanOrEqual(0.45);
      expect(share).toBeCloseTo(FIGHTER_SHARE, 5);
    }
  });

  it('zooms out as the fighters separate, keeping both on screen with a margin', () => {
    const near = frame(-1, 1, 1.8, 16 / 9);
    const far = frame(-2.8, 2.8, 1.8, 16 / 9);
    expect(far.distance).toBeGreaterThan(near.distance);
    expect(far.visibleHeight * (16 / 9)).toBeGreaterThan(5.6 + 2);
  });

  it('tracks the midpoint but never shows past the drawn stage', () => {
    expect(frame(1, 3, 1.8, 16 / 9).x).toBeCloseTo(2, 5);
    const edge = frame(6.5, 7, 1.8, 16 / 9);
    expect(edge.x + (edge.visibleHeight * 16) / 9 / 2).toBeLessThanOrEqual(STAGE_ART_HALF_WIDTH + 1e-9);
  });

  it('looks slightly up at the fighters', () => {
    const f = frame(0, 0, 1.8, 16 / 9);
    expect(f.camY).toBeLessThan(f.lookY);
  });
});

describe('placeholder poses', () => {
  const finite = (p: Pose): boolean => Object.values(p).every((v) => Number.isFinite(v));
  const ACTIONS: Action[] = ['idle', 'walk', 'crouch', 'prejump', 'jump', 'land', 'dash', 'backdash', 'hitstun', 'blockstun', 'airhit', 'knockdown', 'getup', 'ko', 'victory'];

  it('every action gives a finite pose', () => {
    const f = createFighter('egbon-razak', 0, 1);
    for (const a of ACTIONS) {
      for (const frameNo of [1, 5, 20]) {
        f.action = a;
        f.frame = frameNo;
        expect(finite(poseFor(f, null, frameNo / 60)), `${a} ${frameNo}`).toBe(true);
      }
    }
  });

  it('every move of every character gives a finite pose on every frame, and strikes while active', () => {
    for (const c of Object.values(CHARACTERS)) {
      const f = createFighter(c.id, 0, 1);
      f.action = 'attack';
      for (const m of c.moves) {
        f.moveId = m.id;
        for (let fr = 1; fr <= totalFrames(m); fr++) {
          f.frame = fr;
          expect(finite(poseFor(f, m, 0)), `${c.id} ${m.id} f${fr}`).toBe(true);
        }
        f.frame = m.startup;
        const strike = poseFor(f, m, 0);
        f.frame = 1;
        const start = poseFor(f, m, 0);
        expect(JSON.stringify(strike), `${c.id} ${m.id} moves between start and strike`).not.toBe(JSON.stringify(start));
      }
    }
  });
});
