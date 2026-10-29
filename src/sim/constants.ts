// Global tunables for the simulation. Everything here is a starting value to tune by feel.
// Units: positions and speeds are integers in SUB-units (1/100 px) so the sim never accumulates
// floating-point error; frames are 60 Hz sim frames.

export const FPS = 60;
/** sub-units per pixel */
export const SUB = 100;
export const px = (n: number): number => Math.round(n * SUB);

/** the stage walls, measured from the centre */
export const STAGE_HALF_WIDTH = px(700);
/** the camera can only show this much: walking away is stopped beyond it */
export const MAX_SEPARATION = px(560);
/** where each fighter starts a round, from the centre */
export const START_OFFSET = px(150);

export const PREJUMP_FRAMES = 4;
export const LANDING_FRAMES = 3;
/** a double tap (6 5 6) must finish within this many frames to dash */
export const DASH_TAP_WINDOW = 12;

export const ROUND_SECONDS = 99;
export const ROUNDS_TO_WIN = 2;
/** "Round 1" then "Fight!": no control until this has played */
export const INTRO_FRAMES = 120;
/** after a KO or time-up, before the next round */
export const ROUND_END_FRAMES = 150;

/** directions remembered for motion inputs */
export const INPUT_HISTORY = 60;
/** a button press is remembered for this many frames (pressed early, comes out when able) */
export const BUTTON_BUFFER = 4;
/** frames allowed to complete each motion (spec 6.1) */
export const MOTION_WINDOW: Record<string, number> = {
  '236': 15, '214': 20, '623': 20, '421': 20, '63214': 30, '236236': 30, '214214': 30, '22': 15,
};

/** pushback on hit or block by strength, in px, spread over PUSHBACK_FRAMES (spec 5.2) */
export const PUSHBACK = { light: 10, medium: 18, heavy: 30, special: 24, super: 20 } as const;
export const PUSHBACK_FRAMES = 8;

/** knockdowns (spec 6.7): frames on the floor, then a get-up during which the fighter cannot be hit */
export const KNOCKDOWN_FRAMES = { soft: 30, hard: 45 } as const;
export const GETUP_FRAMES = 12;
/** a fighter hit in the air pops up a little and falls */
export const AIR_HIT_POP = px(4);
export const AIR_HIT_GRAVITY = px(0.55);
/** launchers (2H, 623): about 140 px high and 45 frames in the air, ending in a hard knockdown */
export const LAUNCH_SPEED = px(12.4);
export const LAUNCH_DRIFT = px(0.5);
/** a knocked-down body bounces once off the floor (about 15 px) and slides before it lies still */
export const FLOOR_BOUNCE = { speed: px(4.1), slide: px(30), slideFrames: 12 } as const;
/** jumps hang near their apex: while the rise or fall is slower than this, gravity is halved */
export const JUMP_HANG_SPEED = px(1.6);

/** below this height two fighters still push each other apart; above it one can jump over */
export const PUSH_HEIGHT = px(70);

// ---- Phase 2: the combat system (spec section 6) and hit-stop (5.1) ----------------------------

/** frames both fighters freeze on contact, by strength: [on hit, on block] (spec 5.1) */
export const HITSTOP: Record<string, [number, number]> = {
  light: [8, 5], medium: [11, 8], heavy: [14, 11], special: [14, 11], super: [6, 4],
};
export const HITSTOP_COUNTER_BONUS = 4;
export const HITSTOP_SUPER_LAST = 24;
export const HITSTOP_KO = 20;

/** damage scaling by hit number in a combo (spec 6.5): 100, 100, 90, 80 ... floor 30, supers floor 50 */
export function scaling(step: number, isSuper: boolean): number {
  const pct = step < 2 ? 100 : Math.max(30, 100 - 10 * (step - 1));
  return isSuper ? Math.max(50, pct) : pct;
}

/** counter-hit / punish bonuses (spec 5.7) */
export const COUNTER_DAMAGE_PCT = 120;
export const COUNTER_EXTRA_HITSTUN = 4;

/** chip on block (spec 6.8): specials 1/6, supers 1/4, normals none */
export const CHIP_DIVISOR = { special: 6, super: 4 } as const;

/** meter (spec 6.9): 3 bars of 1000 */
export const METER_MAX = 3000;
export const METER_BAR = 1000;
// doubled after playtest (29 Oct): about one super per round instead of none in two
export const METER_GAIN = { hit: 40, blockedAttacker: 20, takeHit: 15, block: 10, special: 10 } as const;

/** cancels (6.3): specials may cancel a normal during hit-stop and this many frames after contact */
export const CANCEL_WINDOW = 4;
/** lights chain into themselves at most this many times in a row */
export const LIGHT_CHAIN_MAX = 3;
/** a rekka follow-up may be input up to this many frames after the previous part hits or is blocked */
export const REKKA_WINDOW = 20;

/** juggles (6.6): when the juggle count passes this, the opponent flips out */
export const JUGGLE_LIMIT = 6;
/** no combo may last longer than this (a test checks loops never exceed it) */
export const COMBO_MAX_FRAMES = 8 * FPS;

/** throws (6.4) */
export const THROW = { pressWindow: 2, techWindow: 8, techPush: 60, rangeExtra: 22, wakeupProtect: 3, holdFrames: 30 } as const;

/** knockdowns (6.7): a soft knockdown can quick-rise (hold down on landing) to this many frames */
export const QUICK_RISE_FRAMES = 18;

/** Wahala Mode (6.10) */
export const WAHALA = {
  healthPct: 35, flashFrames: 30, durationFrames: 8 * FPS, damagePct: 115, chipPct: 150, pushPx: 120,
  /** S within this many frames of a normal's button (either order) is Wahala, not the normal */
  inputWindow: 3,
} as const;

/** taunts (6.15) */
export const TAUNT = { frames: 50, meter: 50 } as const;

/** supers freeze the world on activation (spec 6.11) */
export const SUPER_FREEZE = 40;
