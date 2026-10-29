// Input helpers: turning screen directions into facing-relative ones, remembering presses, and
// recognising motions (236, 623, ...) inside their time windows. Pure functions.

import { BUTTON_BUFFER, INPUT_HISTORY, MOTION_WINDOW, THROW } from './constants';
import { BTN, BUTTONS, type Button, type FighterState, type InputFrame } from './types';

const MIRROR: Record<number, number> = { 1: 3, 3: 1, 4: 6, 6: 4, 7: 9, 9: 7 };

/** Mirror a screen direction for a fighter facing left, so 6 always means toward the opponent. */
export function relativeDir(dir: number, facing: 1 | -1): number {
  return facing === 1 ? dir : (MIRROR[dir] ?? dir);
}

export const isDown = (d: number): boolean => d === 1 || d === 2 || d === 3;
export const isUp = (d: number): boolean => d === 7 || d === 8 || d === 9;
export const isBack = (d: number): boolean => d === 1 || d === 4 || d === 7;
export const isForward = (d: number): boolean => d === 3 || d === 6 || d === 9;

/**
 * Record this frame of input on the fighter: the relative direction and any new presses. During
 * hit-stop (`frozen`) presses are still taken but do not age, so the buffer stays open (spec 5.1).
 */
export function recordInput(f: FighterState, input: InputFrame, frozen = false): void {
  f.history.push(relativeDir(input.dir, f.facing));
  if (f.history.length > INPUT_HISTORY) f.history.shift();
  const fresh = input.buttons & ~f.prevButtons;
  BUTTONS.forEach((b, i) => {
    f.pressAge[i] = fresh & BTN[b] ? 0 : frozen ? f.pressAge[i] : Math.min(f.pressAge[i] + 1, 99);
  });
  f.prevButtons = input.buttons;
}

/** The strongest attack button pressed within the buffer window (H, then M, then L), or null. */
export function bufferedButton(f: FighterState): Button | null {
  for (const b of ['H', 'M', 'L'] as const) {
    if (f.pressAge[BUTTONS.indexOf(b)] < BUTTON_BUFFER) return b;
  }
  return null;
}

export function consumeButton(f: FighterState, b: Button): void {
  f.pressAge[BUTTONS.indexOf(b)] = 99;
}

export const buffered = (f: FighterState, b: Button): boolean => f.pressAge[BUTTONS.indexOf(b)] < BUTTON_BUFFER;

/** L+M pressed within THROW.pressWindow frames of each other, both still in the buffer (spec 6.4). */
export function throwPressed(f: FighterState): boolean {
  const l = f.pressAge[BUTTONS.indexOf('L')];
  const m = f.pressAge[BUTTONS.indexOf('M')];
  return l < BUTTON_BUFFER && m < BUTTON_BUFFER && Math.abs(l - m) <= THROW.pressWindow;
}

/** Collapse repeated directions: 2 2 2 3 3 6 becomes 2 3 6. */
function collapse(dirs: number[]): number[] {
  const out: number[] = [];
  for (const d of dirs) if (out[out.length - 1] !== d) out.push(d);
  return out;
}

/**
 * Was this motion completed within its window? Matching is lenient on purpose (spec 6.1): the
 * directions must appear in order, others may sit between them (623 also accepts 6236, 236
 * accepts 2365), and the whole motion must fit in the window.
 */
export function hasMotion(history: number[], motion: string): boolean {
  const window = MOTION_WINDOW[motion] ?? 15;
  const recent = collapse(history.slice(-window));
  const want = motion.split('').map(Number);
  let i = 0;
  for (const d of recent) {
    if (d === want[i]) i++;
    if (i === want.length) return true;
  }
  return false;
}

/** 6 5 6 (or 4 5 4) as the latest taps, inside the window: a dash. */
export function doubleTap(history: number[], dir: 6 | 4, window: number): boolean {
  const recent = collapse(history.slice(-window));
  const n = recent.length;
  return n >= 3 && recent[n - 1] === dir && recent[n - 2] === 5 && recent[n - 3] === dir;
}

/**
 * How many frames ago the latest way of typing this motion began (-1 if it was not typed). Matched
 * backwards from the newest direction, so it finds the tightest, most recent version.
 */
export function motionAge(history: number[], motion: string): number {
  const want = motion.split('').map(Number);
  let k = want.length - 1;
  for (let i = history.length - 1; i >= 0 && k >= 0; i--) {
    if (history[i] === want[k]) {
      if (k === 0) return history.length - 1 - i;
      k--;
    }
  }
  return -1;
}
