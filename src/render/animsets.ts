// Each character's animation set: which authored clip plays for each fighter state and move, in
// order of preference, plus the body settings that go with them. Data only (src/render/animsets/*.json):
// a clip that arrives later (block, uppercut, air-hit ...) is used as soon as the model has it, with no
// code change, and until then the next entry, or the procedural pose, stands in.

import egbon from './animsets/egbon-razak.json';

/** One way to play a clip. Times are seconds; "low" is the clip's lowest-hips moment, "end" its last frame. */
export interface ClipEntry {
  clip: string;
  /** loop it (idles, walks) */
  loop?: boolean;
  /** hold this one moment */
  at?: 'low' | 'end' | number;
  /** start here and play at this speed */
  from?: number;
  speed?: number;
  /** start this long before the lowest moment (a fall that ends lying down) */
  lead?: number;
  /** stop here */
  until?: 'low' | 'end' | number;
  /** tip the whole body back this many degrees (a hit reaction made into an air hit) */
  lean?: number;
  /** raise the arms this many degrees (a hook made into an uppercut) */
  aim?: number;
  /** cut straight in, without blending from the previous pose (a body landing flat) */
  snap?: boolean;
}

export interface AnimSet {
  /** upper arms turn out at least `degrees`, more if a hand would come within `torsoRadius` (m) of the spine */
  armClearance: { degrees: number; torsoRadius: number };
  states: Record<string, ClipEntry[]>;
  moves: Record<string, ClipEntry[]>;
}

const SETS: Record<string, AnimSet> = {
  'egbon-razak': egbon as AnimSet,
};

export function animSet(charId: string): AnimSet | undefined {
  return SETS[charId];
}
