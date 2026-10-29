// Plain, serialisable data only: the whole SimState can be cloned, hashed, saved and restored.

export type Side = 0 | 1;

/** One player's input for one frame. `dir` is a numpad direction as seen on screen (6 = right). */
export interface InputFrame {
  dir: number;
  buttons: number;
}

export const BTN = { L: 1, M: 2, H: 4, S: 8, T: 16 } as const;
export type Button = keyof typeof BTN;
export const BUTTONS: readonly Button[] = ['L', 'M', 'H', 'S', 'T'];
export const NEUTRAL: InputFrame = { dir: 5, buttons: 0 };

export type Action =
  | 'idle' | 'walk' | 'crouch' | 'prejump' | 'jump' | 'land' | 'dash' | 'backdash'
  | 'attack' | 'hitstun' | 'blockstun' | 'airhit' | 'knockdown' | 'getup' | 'ko' | 'victory'
  | 'grabbing' | 'grabbed' | 'taunt' | 'wahala';

export type Level = 'high' | 'mid' | 'low' | 'overhead' | 'unblockable';
export type Strength = 'light' | 'medium' | 'heavy' | 'special' | 'super';
export type KnockdownKind = 'none' | 'soft' | 'hard';
export type MoveType =
  | 'normal' | 'command_normal' | 'special' | 'rekka' | 'projectile' | 'command_grab' | 'throw'
  | 'parry' | 'teleport' | 'feint' | 'super' | 'wahala';

/** a rectangle in px, from the fighter's feet: x forward (the way they face), y up */
export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Hitbox extends Box {
  /** move frames (1-based) this box is live */
  frameStart: number;
  frameEnd: number;
}

export interface Invuln {
  from: number;
  to: number;
  type: 'strike' | 'throw' | 'projectile' | 'air';
}

export interface MoveData {
  id: string;
  name: string;
  displayName: string;
  type: MoveType;
  /** numpad notation, e.g. "5L", "2M", "6M", "j.H" */
  input: string;
  /** number of the first active frame (startup includes it, as in Street Fighter notation) */
  startup: number;
  active: number;
  recovery: number;
  damage: number;
  chip: number;
  hitstun: number;
  blockstun: number;
  /** frame advantage on block when the first active frame connects; checked by a test */
  onBlock: number;
  strength: Strength;
  level: Level;
  knockdown: KnockdownKind;
  launch: boolean;
  wallbounce: boolean;
  cancelInto: string[];
  meterGain: number;
  meterCost: number;
  /** forward movement in px spread over startup and active frames */
  travel: number;
  invuln: Invuln[];
  hitboxes: Hitbox[];
  anim: string;
  animHoldFrames: number;
  vfx: string;
  sfx: string;
  voice: string;
  cameraShake: number;
  /** jump attacks: usable in the air only */
  air: boolean;
  /** hits in a multi-hit move, spaced hitInterval frames apart during the active frames */
  hits: number;
  hitInterval: number;
  /** juggle points used when it hits an airborne opponent (spec 6.6) */
  juggle: number;
  /** hits absorbed during startup and active frames (armour) */
  armor: number;
  /** 1 or 2 for supers, 0 otherwise */
  superLevel: number;
  /** grabs (throws, command grabs, grab supers): reach in px beyond the push boxes */
  grab: boolean;
  grabRange: number;
  /** a normal throw can be teched; command grabs and supers cannot */
  techable: boolean;
  /** throw to the back: the fighters swap sides */
  backThrow: boolean;
  /** rekka parts and other follow-ups: the move ids this one may follow */
  followsFrom: string[];
  /** the motion and button parsed from `input`, e.g. "236" and "L"; "A" = any attack, "S" = EX */
  motion: string;
  button: string;
}

export interface Palette {
  skin: string;
  primary: string;
  secondary: string;
  accent: string;
  extra: string;
}

export interface CharacterData {
  id: string;
  name: string;
  archetype: string;
  health: number;
  /** px per frame */
  walkForward: number;
  walkBack: number;
  dash: { frames: number; distance: number };
  backdash: { frames: number; distance: number; invulnFrom: number; invulnTo: number };
  jump: { frames: number; height: number; distance: number };
  pushWidth: number;
  height: number;
  hurtboxes: { stand: Box; crouch: Box; air: Box };
  palette: Palette;
  palette2: Palette;
  moves: MoveData[];
}

export interface FighterState {
  charId: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  facing: 1 | -1;
  health: number;
  action: Action;
  /** frames spent in the current action, starting at 1 */
  frame: number;
  moveId: string | null;
  /** the current move has already landed (normals hit once) */
  moveHit: boolean;
  /** a jump attack was used in this jump */
  airAttacked: boolean;
  /** remaining hit or block stun */
  stun: number;
  /** remaining pushback (sub-units, signed) and the frames left to spread it over */
  slide: number;
  slideFrames: number;
  knockdownKind: KnockdownKind;
  crouching: boolean;
  /** direction relative to facing (6 = forward), newest last */
  history: number[];
  prevButtons: number;
  /** frames since each button (L M H S T) was pressed; BUTTON_BUFFER or more means none waiting */
  pressAge: number[];
  /** hits landed by the current multi-hit move */
  hitsDone: number;
  /** frames left in which the current move may be cancelled (opened by contact) */
  cancelFrames: number;
  /** the current move made contact (hit or block) */
  contact: boolean;
  /** lights chained in a row */
  lightChain: number;
  /** rekka: the part that may be followed, and frames left to follow it */
  rekkaFrom: string | null;
  rekkaFrames: number;
  /** armour hits left on the current move */
  armorLeft: number;
  /** frames after waking up during which throws cannot grab this fighter */
  throwProtect: number;
  /** grabs: frames until the grab resolves (the defender may tech a normal throw meanwhile) */
  grabTimer: number;
  /** a wall bounce is pending for the current air hit */
  wallBounce: boolean;
  /** flipped out of a juggle: cannot be hit until landing */
  flipOut: boolean;
  /** this knockdown has already bounced off the floor once */
  bounced: boolean;
  /** quick-rise was asked for during this knockdown */
  quickRise: boolean;
}

export type Phase = 'intro' | 'fight' | 'roundEnd' | 'matchEnd';

export interface ComboState {
  hits: number;
  damage: number;
  /** damage-scaling step for the next hit (spec 6.5) */
  step: number;
  /** move ids already used in this combo (each hits once unless multi-hit or a light) */
  used: string[];
  /** light hits in this combo (lights may repeat up to 3) */
  lightHits: number;
  juggle: number;
  startFrame: number;
}

export interface WahalaState {
  /** health dropped below the threshold this round and it has not been used */
  available: boolean;
  /** frames left of the activation flash, then of the mode */
  flash: number;
  active: number;
  /** the Wahala move was used during this activation */
  moveUsed: boolean;
  usedThisRound: boolean;
}

export interface SimState {
  frame: number;
  phase: Phase;
  phaseFrame: number;
  round: number;
  /** frames left on the round clock */
  timer: number;
  wins: [number, number];
  roundWinner: Side | 'draw' | null;
  matchWinner: Side | null;
  fighters: [FighterState, FighterState];
  /** the combo each side is landing on the other */
  combo: [ComboState, ComboState];
  rng: number;
  /** super meter per side (0 to 3000), carried across rounds */
  meter: [number, number];
  /** frames left of hit-stop: both fighters are frozen, inputs are still read */
  hitstop: number;
  wahala: [WahalaState, WahalaState];
  /** a taunt has already earned its meter this round */
  taunted: [boolean, boolean];
}

export type SimEventType =
  | 'round_start' | 'fight' | 'whiff' | 'hit' | 'block' | 'ko' | 'timeout' | 'round_end' | 'match_end'
  | 'jump' | 'land' | 'dash' | 'throw' | 'tech' | 'armor' | 'flipout' | 'wallbounce' | 'super'
  | 'wahala_ready' | 'wahala' | 'taunt' | 'knockdown' | 'bounce';

export interface SimEvent {
  type: SimEventType;
  side: Side;
  x: number;
  y: number;
  moveId?: string;
  damage?: number;
  strength?: Strength;
  counter?: boolean;
  punish?: boolean;
  /** the hit-stop this contact caused, for the renderer's shake and sparks */
  hitstop?: number;
  /** the last hit of a super */
  last?: boolean;
}

export interface StepResult {
  state: SimState;
  events: SimEvent[];
}
