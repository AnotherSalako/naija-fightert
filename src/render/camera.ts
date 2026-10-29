// Camera framing (spec 4.4): side-on perspective, slightly low, fighters about 42% of the screen
// height at normal distance, tracking their midpoint and zooming out smoothly as they separate.
// Pure maths so it is tested without WebGL.

export const FOV = 30; // vertical, degrees
export const FIGHTER_SHARE = 0.42; // fighter height as a share of the screen at normal zoom
export const STAGE_ART_HALF_WIDTH = 11; // metres of drawn stage on each side of centre
const SIDE_MARGIN = 1.3; // metres kept beside each fighter

export interface Framing {
  x: number;
  lookY: number;
  camY: number;
  distance: number;
  visibleHeight: number;
}

/** Where the camera should be for fighters at xa and xb (metres), standing `height` metres tall. */
export function frame(xa: number, xb: number, height: number, aspect: number): Framing {
  const tanHalf = Math.tan((FOV * Math.PI) / 360);
  const base = height / FIGHTER_SHARE;
  const needed = (Math.abs(xa - xb) + 2 * SIDE_MARGIN) / aspect;
  const visibleHeight = Math.max(base, needed);
  const distance = visibleHeight / (2 * tanHalf);
  const halfWidth = (visibleHeight * aspect) / 2;
  const mid = (xa + xb) / 2;
  const limit = Math.max(0, STAGE_ART_HALF_WIDTH - halfWidth);
  const x = Math.max(-limit, Math.min(limit, mid));
  // feet sit near the bottom of the screen; the camera is a little lower than what it looks at
  const lookY = visibleHeight * 0.36;
  return { x, lookY, camY: lookY - 0.35, distance, visibleHeight };
}
