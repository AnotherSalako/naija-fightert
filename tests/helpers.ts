import { INTRO_FRAMES } from '../src/sim/constants';
import { createSim, step } from '../src/sim/step';
import { NEUTRAL, type InputFrame, type MoveData, type SimEvent, type SimState } from '../src/sim/types';

export const inp = (dir = 5, buttons = 0): InputFrame => ({ dir, buttons });
export { NEUTRAL };

/** A match past its intro, ready to fight. */
export function fight(ids: [string, string] = ['egbon-razak', 'egbon-razak'], seed = 1): SimState {
  let s = createSim(ids, seed);
  for (let i = 0; i < INTRO_FRAMES; i++) s = step(s, NEUTRAL, NEUTRAL).state;
  return s;
}

/** Step once and also return the events. */
export function tick(s: SimState, a: InputFrame = NEUTRAL, b: InputFrame = NEUTRAL): { s: SimState; events: SimEvent[] } {
  const r = step(s, a, b);
  return { s: r.state, events: r.events };
}

export function runFor(s: SimState, n: number, a: InputFrame = NEUTRAL, b: InputFrame = NEUTRAL): SimState {
  let cur = s;
  for (let i = 0; i < n; i++) cur = step(cur, a, b).state;
  return cur;
}

/** A small LCG for test inputs (tests may not use Math.random either, so runs repeat exactly). */
export function inputStream(seed: number): () => InputFrame {
  let x = seed >>> 0;
  let held = NEUTRAL;
  let left = 0;
  return () => {
    if (left <= 0) {
      x = (Math.imul(x, 1664525) + 1013904223) >>> 0;
      const dir = 1 + (x % 9);
      x = (Math.imul(x, 1664525) + 1013904223) >>> 0;
      const buttons = x % 5 === 0 ? 1 << (x % 3) : 0;
      held = { dir, buttons };
      left = 3 + (x % 17);
    }
    left--;
    return held;
  };
}

const BUTTON_BITS: Record<string, number> = { L: 1, M: 2, H: 4, S: 8, T: 16, A: 1, LM: 3 };

/**
 * The frames a player facing right types to perform a move, ending on the button press.
 * Motions are typed cleanly, one direction per frame.
 */
export function moveInputs(m: MoveData): InputFrame[] {
  const btn = BUTTON_BITS[m.button] ?? 1;
  const seq = (dirs: number[]): InputFrame[] => dirs.map((d, i) => inp(d, i === dirs.length - 1 ? btn : 0));
  switch (m.motion) {
    case '': return seq([m.input.startsWith('2') ? 2 : m.input.startsWith('6') ? 6 : 5]);
    case '4': return seq([4]);
    case '66': return [inp(6), inp(5), inp(6), inp(6), inp(6, btn)];
    case 'j': return seq([8]);
    default: {
      // a repeated direction (22) needs a neutral frame between the taps
      const dirs: number[] = [];
      for (const d of m.motion.split('').map(Number)) {
        if (dirs[dirs.length - 1] === d) dirs.push(5);
        dirs.push(d);
      }
      return seq(dirs);
    }
  }
}

/** The direction to keep holding after the move is typed. */
export const holdAfter = (m: MoveData): number => (m.input.startsWith('2') ? 2 : 5);

const MIRROR_DIR: Record<number, number> = { 1: 3, 3: 1, 4: 6, 6: 4, 7: 9, 9: 7 };
/** The same inputs typed by a player facing left (P2 at the start of a round). */
export const mirrored = (frames: InputFrame[]): InputFrame[] =>
  frames.map((f) => ({ dir: MIRROR_DIR[f.dir] ?? f.dir, buttons: f.buttons }));
