// Keyboard and gamepad to one InputFrame per player per frame (spec 6.1 default layouts).
//   P1 keyboard: WASD move, J = L, K = M, L = H, ; = S, I = throw (L+M), O = taunt
//   P2 keyboard: arrows move, numpad 1 = L, 2 = M, 3 = H, 0 = S, 5 = throw, 6 = taunt
//   Pads (standard mapping): Square L, Triangle M, Circle H, Cross S, R1 throw, L1 taunt, R2 H+S.
// S alone is Wahala when it is available; R2 (H+S) does the same for pads.

import { BTN, type InputFrame } from '../sim/types';

interface KeyLayout {
  up: string;
  down: string;
  left: string;
  right: string;
  L: string;
  M: string;
  H: string;
  S: string;
  throw: string;
  taunt: string;
}

const P1: KeyLayout = { up: 'KeyW', down: 'KeyS', left: 'KeyA', right: 'KeyD', L: 'KeyJ', M: 'KeyK', H: 'KeyL', S: 'Semicolon', throw: 'KeyI', taunt: 'KeyO' };
const P2: KeyLayout = { up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight', L: 'Numpad1', M: 'Numpad2', H: 'Numpad3', S: 'Numpad0', throw: 'Numpad5', taunt: 'Numpad6' };

const held = new Set<string>();
let listening = false;

export function listenKeyboard(): void {
  if (listening) return;
  listening = true;
  window.addEventListener('keydown', (e) => {
    held.add(e.code);
    if (e.code.startsWith('Arrow') || e.code === 'Space') e.preventDefault();
  });
  window.addEventListener('keyup', (e) => held.delete(e.code));
  window.addEventListener('blur', () => held.clear());
}

/** Numpad direction from four held directions; left+right cancel, up beats down. */
export function toDir(up: boolean, down: boolean, left: boolean, right: boolean): number {
  const h = left === right ? 0 : left ? -1 : 1;
  const v = up ? 1 : down ? -1 : 0;
  return 5 + h + v * 3;
}

function fromKeys(k: KeyLayout): InputFrame {
  const has = (c: string): boolean => held.has(c);
  let buttons = 0;
  if (has(k.L)) buttons |= BTN.L;
  if (has(k.M)) buttons |= BTN.M;
  if (has(k.H)) buttons |= BTN.H;
  if (has(k.S)) buttons |= BTN.S;
  if (has(k.throw)) buttons |= BTN.L | BTN.M;
  if (has(k.taunt)) buttons |= BTN.T;
  return { dir: toDir(has(k.up), has(k.down), has(k.left), has(k.right)), buttons };
}

function fromPad(index: number): InputFrame | null {
  const pads = navigator.getGamepads ? Array.from(navigator.getGamepads()).filter((p): p is Gamepad => !!p && p.connected) : [];
  const p = pads[index];
  if (!p) return null;
  const b = (i: number): boolean => !!p.buttons[i]?.pressed;
  const ax = p.axes[0] ?? 0;
  const ay = p.axes[1] ?? 0;
  let buttons = 0;
  if (b(2)) buttons |= BTN.L;
  if (b(3)) buttons |= BTN.M;
  if (b(1)) buttons |= BTN.H;
  if (b(0)) buttons |= BTN.S;
  if (b(5)) buttons |= BTN.L | BTN.M;
  if (b(4)) buttons |= BTN.T;
  if (b(7)) buttons |= BTN.H | BTN.S;
  return { dir: toDir(b(12) || ay < -0.5, b(13) || ay > 0.5, b(14) || ax < -0.5, b(15) || ax > 0.5), buttons };
}

/** Merge two inputs: any held button counts, and a pad direction wins over a neutral keyboard. */
function merge(a: InputFrame, b: InputFrame | null): InputFrame {
  if (!b) return a;
  return { dir: b.dir !== 5 ? b.dir : a.dir, buttons: a.buttons | b.buttons };
}

export function readPlayer(side: 0 | 1): InputFrame {
  return merge(fromKeys(side === 0 ? P1 : P2), fromPad(side));
}

export const isHeld = (code: string): boolean => held.has(code);
