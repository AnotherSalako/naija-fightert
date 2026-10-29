// Loads the per-character JSON and fills in every field the JSON leaves out, so the data files stay
// short and the sim always sees complete MoveData. Blockstun and hitstun come from the spec's
// "on block" numbers: when the first active frame connects, the attacker can act again
// (active + recovery) frames later, so blockstun = active + recovery + onBlock. A test measures the
// advantage in the real sim for every move.

import chief from './chief-priest.json';
import egbon from './egbon-razak.json';
import iya from './iya-matthew.json';
import type { Box, CharacterData, MoveData, MoveType } from '../types';

/** extra stun on hit compared with block, for normals */
export const HIT_BONUS = 4;

type RawBox = Box & { frameStart?: number; frameEnd?: number };
type RawMove = Omit<Partial<MoveData>, 'hitboxes'> & { hitboxes?: RawBox[]; onHit?: number } &
  Pick<MoveData, 'id' | 'name' | 'input' | 'startup' | 'active' | 'recovery' | 'damage'>;
type RawCharacter = Omit<CharacterData, 'moves'> & { moves: RawMove[] };

/**
 * Split an input into its motion and button(s): "5L" -> ("", "L"), "236S" -> ("236", "S"),
 * "236236A" -> ("236236", "A" = any attack), "dash.H" -> ("dash", "H"), "4LM" -> ("4", "LM"), "j.M" -> ("j", "M").
 */
export function parseInput(input: string): { motion: string; button: string } {
  if (input.startsWith('j.')) return { motion: 'j', button: input.slice(2) };
  if (input.startsWith('dash.')) return { motion: 'dash', button: input.slice(5) };
  const m = /^(\d*)([LMHSTA]+)$/.exec(input);
  if (!m) throw new Error(`cannot read move input "${input}"`);
  const digits = m[1];
  // a single direction digit on a normal (5L, 2M, 6M) is a stance, not a motion
  return { motion: digits.length > 1 ? digits : digits === '4' ? '4' : '', button: m[2] };
}

export function normaliseMove(m: RawMove): MoveData {
  const parsed = parseInput(m.input);
  const type = (m.type ?? 'normal') as MoveType;
  const chip = m.chip ?? (type === 'special' || type === 'rekka' ? Math.floor(m.damage / 6) : type === 'super' ? Math.floor(m.damage / 4) : 0);
  const onBlock = m.onBlock ?? 0;
  const blockstun = m.blockstun ?? Math.max(1, onBlock + m.active + m.recovery);
  const firstActive = m.startup;
  const lastActive = m.startup + m.active - 1;
  return {
    displayName: m.name,
    type,
    chip,
    // a move may state its advantage on hit like on block; otherwise hit is HIT_BONUS better than block
    hitstun: m.hitstun ?? (m.onHit !== undefined ? Math.max(1, m.onHit + m.active + m.recovery) : blockstun + HIT_BONUS),
    blockstun,
    onBlock,
    strength: 'light',
    level: 'mid',
    knockdown: 'none',
    launch: false,
    wallbounce: false,
    cancelInto: [],
    meterGain: 0,
    meterCost: 0,
    travel: 0,
    invuln: [],
    anim: 'punch_high',
    animHoldFrames: 0,
    vfx: '',
    sfx: '',
    voice: '',
    cameraShake: 0,
    air: false,
    hits: 1,
    hitInterval: 0,
    juggle: 1,
    armor: 0,
    superLevel: 0,
    grab: false,
    grabRange: 0,
    techable: false,
    backThrow: false,
    followsFrom: [],
    motion: parsed.motion,
    button: parsed.button,
    ...m,
    hitboxes: (m.hitboxes ?? []).map((b) => ({ ...b, frameStart: b.frameStart ?? firstActive, frameEnd: b.frameEnd ?? lastActive })),
  } as MoveData;
}

function load(raw: RawCharacter): CharacterData {
  return { ...raw, moves: raw.moves.map(normaliseMove) };
}

export const RAW_CHARACTERS: Record<string, unknown> = {
  'egbon-razak': egbon,
  'iya-matthew': iya,
  'chief-priest': chief,
};

export const CHARACTERS: Record<string, CharacterData> = {
  'egbon-razak': load(egbon as RawCharacter),
  'iya-matthew': load(iya as RawCharacter),
  'chief-priest': load(chief as RawCharacter),
};

export const CHARACTER_IDS = Object.keys(CHARACTERS);

export function character(id: string): CharacterData {
  const c = CHARACTERS[id];
  if (!c) throw new Error(`unknown character ${id}`);
  return c;
}

export function moveOf(charId: string, moveId: string): MoveData {
  const m = character(charId).moves.find((mv) => mv.id === moveId);
  if (!m) throw new Error(`unknown move ${charId} ${moveId}`);
  return m;
}

/** Moves that may follow this one (rekka parts). */
export function followers(charId: string, moveId: string): MoveData[] {
  return character(charId).moves.filter((m) => m.followsFrom.includes(moveId));
}
