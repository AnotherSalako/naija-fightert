// The simulation entry point: step(state, inputP1, inputP2) -> { state, events }. Pure: the input
// state is never changed, there is no clock, no Math.random and no rendering. Same inputs + same
// seed = same result on every device.

import { INTRO_FRAMES, ROUND_END_FRAMES, ROUND_SECONDS, ROUNDS_TO_WIN, START_OFFSET, FPS } from './constants';
import { character } from './data/characters';
import { limitSeparation, resolveHits, resolvePush, updateFacing, updateGrabs } from './combat';
import { control } from './control';
import { actionable, advance, createFighter, physics, setAction } from './fighter';
import { recordInput } from './input';
import { NEUTRAL, type ComboState, type InputFrame, type Side, type SimEvent, type SimState, type StepResult } from './types';

export const emptyCombo = (startFrame = 0): ComboState =>
  ({ hits: 0, damage: 0, step: 0, used: [], lightHits: 0, juggle: 0, startFrame });

const freshWahala = (): SimState['wahala'][number] =>
  ({ available: false, flash: 0, active: 0, moveUsed: false, usedThisRound: false });

export function createSim(ids: [string, string], seed = 1): SimState {
  ids.forEach((id) => character(id)); // fail early on an unknown fighter
  const s: SimState = {
    frame: 0, phase: 'intro', phaseFrame: 0, round: 1, timer: ROUND_SECONDS * FPS, wins: [0, 0],
    roundWinner: null, matchWinner: null,
    fighters: [createFighter(ids[0], -START_OFFSET, 1), createFighter(ids[1], START_OFFSET, -1)],
    combo: [emptyCombo(), emptyCombo()],
    rng: seed | 0 || 1,
    meter: [0, 0], hitstop: 0, wahala: [freshWahala(), freshWahala()], taunted: [false, false],
  };
  return s;
}

function startRound(s: SimState, events: SimEvent[]): void {
  s.fighters = [
    createFighter(s.fighters[0].charId, -START_OFFSET, 1),
    createFighter(s.fighters[1].charId, START_OFFSET, -1),
  ];
  s.combo = [emptyCombo(), emptyCombo()];
  s.hitstop = 0;
  s.wahala = [freshWahala(), freshWahala()];
  s.taunted = [false, false];
  s.timer = ROUND_SECONDS * FPS;
  s.roundWinner = null;
  s.phase = 'intro';
  s.phaseFrame = 0;
  events.push({ type: 'round_start', side: 0, x: 0, y: 0 });
}

/** Snapshot and restore for rollback netcode and training mode: the state is plain data. */
export const saveState = (s: SimState): SimState => structuredClone(s);
export const loadState = (s: SimState): SimState => structuredClone(s);

function endRound(s: SimState, winner: Side | 'draw', events: SimEvent[]): void {
  s.phase = 'roundEnd';
  s.phaseFrame = 0;
  s.roundWinner = winner;
  if (winner !== 'draw') s.wins[winner]++;
  // nobody walks on once the round is over (input stops, so a walk would otherwise keep its speed)
  for (const f of s.fighters) {
    if (f.action === 'walk' || f.action === 'dash' || f.action === 'backdash') setAction(f, 'idle');
    if (f.action === 'idle' || f.action === 'crouch') f.vx = 0;
  }
  events.push({ type: 'round_end', side: winner === 'draw' ? 0 : winner, x: 0, y: 0 });
}

/** Health as a share of the fighter's maximum, in parts per 10000 (integer). */
const healthShare = (s: SimState, i: Side): number =>
  Math.trunc((s.fighters[i].health * 10000) / character(s.fighters[i].charId).health);

/** Advance the whole match by one frame. */
export function step(prev: SimState, in1: InputFrame, in2: InputFrame): StepResult {
  const s = structuredClone(prev);
  const events: SimEvent[] = [];
  s.frame++;
  s.phaseFrame++;
  const live = s.phase === 'fight';
  const inputs: [InputFrame, InputFrame] = live ? [in1, in2] : [NEUTRAL, NEUTRAL];

  if (s.phase === 'matchEnd') return { state: s, events };
  if (s.phase === 'intro' && s.phaseFrame >= INTRO_FRAMES) {
    s.phase = 'fight';
    s.phaseFrame = 0;
    events.push({ type: 'fight', side: 0, x: 0, y: 0 });
  }

  // hit-stop and super freeze: both fighters hold still, inputs are still read (spec 5.1)
  if (s.hitstop > 0) {
    s.hitstop--;
    s.fighters.forEach((f, i) => recordInput(f, inputs[i], true));
    return { state: s, events };
  }

  const before: [number, number] = [s.fighters[0].x, s.fighters[1].x];
  s.fighters.forEach((f, i) => recordInput(f, inputs[i]));
  s.fighters.forEach((f, i) => advance(f, events, i as Side));
  s.wahala.forEach((w) => {
    if (w.flash > 0) w.flash--;
    if (w.active > 0) w.active--;
  });
  // a fighter who is free again has escaped the combo that was hitting them
  s.fighters.forEach((f, i) => {
    if (actionable(f)) s.combo[i === 0 ? 1 : 0] = emptyCombo(s.frame);
  });
  if (s.phase === 'fight') ([0, 1] as const).forEach((i) => control(s, i, events));
  s.fighters.forEach((f, i) => physics(f, events, i as Side));
  limitSeparation(s, before);
  resolvePush(s);
  if (s.phase === 'fight') {
    resolveHits(s, events);
    updateGrabs(s, events);
  }
  updateFacing(s);

  if (s.phase === 'fight') {
    s.timer = Math.max(0, s.timer - 1);
    const dead = s.fighters.map((f) => f.health <= 0);
    if (dead[0] || dead[1]) {
      events.push({ type: 'ko', side: dead[0] ? 0 : 1, x: 0, y: 0 });
      endRound(s, dead[0] && dead[1] ? 'draw' : dead[0] ? 1 : 0, events);
    } else if (s.timer === 0) {
      const a = healthShare(s, 0);
      const b = healthShare(s, 1);
      events.push({ type: 'timeout', side: 0, x: 0, y: 0 });
      endRound(s, a === b ? 'draw' : a > b ? 0 : 1, events);
    }
  } else if (s.phase === 'roundEnd') {
    const w = s.roundWinner;
    if (s.phaseFrame === 50 && w !== null && w !== 'draw' && actionable(s.fighters[w])) setAction(s.fighters[w], 'victory');
    if (s.phaseFrame >= ROUND_END_FRAMES) {
      const champ = s.wins[0] >= ROUNDS_TO_WIN ? 0 : s.wins[1] >= ROUNDS_TO_WIN ? 1 : null;
      if (champ !== null) {
        s.phase = 'matchEnd';
        s.matchWinner = champ;
        events.push({ type: 'match_end', side: champ, x: 0, y: 0 });
      } else {
        s.round++;
        startRound(s, events);
      }
    }
  }
  return { state: s, events };
}

/** Run a list of inputs from a state; handy for tests and replays. */
export function run(s: SimState, frames: number, in1: InputFrame = NEUTRAL, in2: InputFrame = NEUTRAL): SimState {
  let cur = s;
  for (let i = 0; i < frames; i++) cur = step(cur, in1, in2).state;
  return cur;
}
