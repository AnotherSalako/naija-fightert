// The CPU (spec 8): plays whole matches, uses its kit, blocks some attacks but not all, never
// supers in the first 2 seconds of a round, and replays exactly with the same seed.

import { describe, expect, it } from 'vitest';
import { Cpu, DIFFICULTY } from '../src/ai/cpu';
import { FPS, SUB } from '../src/sim/constants';
import { hashState } from '../src/sim/hash';
import { createSim, step } from '../src/sim/step';
import { BTN, type SimEvent, type SimState } from '../src/sim/types';
import { inp } from './helpers';

function cpuMatch(seedA: number, seedB: number, maxFrames = 3 * 99 * FPS + 2000): { s: SimState; events: SimEvent[]; fightStarts: number[] } {
  let s = createSim(['egbon-razak', 'egbon-razak'], seedA);
  const a = new Cpu(0, 'normal', seedA);
  const b = new Cpu(1, 'normal', seedB);
  const events: SimEvent[] = [];
  const fightStarts: number[] = [];
  for (let i = 0; i < maxFrames && s.phase !== 'matchEnd'; i++) {
    const r = step(s, a.next(s), b.next(s));
    s = r.state;
    for (const e of r.events) {
      events.push({ ...e, x: s.frame });
      if (e.type === 'fight') fightStarts.push(s.frame);
    }
  }
  return { s, events, fightStarts };
}

describe('CPU opponent (spec 8)', () => {
  it('has the difficulty table from the spec', () => {
    // Normal was eased after playtest (29 Oct): slower, fewer Park Rushes, gaps and mistakes
    // and again (29 Oct, polish pass): slower still, 2-hit strings, a pause after each of its moves, fewer throws
    expect(DIFFICULTY.normal).toMatchObject({ delay: 28, block: 38, wrongHeight: 28, rush: 35, combo: 2, recover: 30, throws: 35 });
    expect(DIFFICULTY.normal.pause).toBeGreaterThan(0);
    expect(DIFFICULTY.normal.mistake).toBeGreaterThan(0);
    expect(DIFFICULTY.easy.delay).toBe(30);
    // Hard and Boss as the spec has them, with no pauses, mistakes or held-back throws
    const unchanged = { rush: 100, pause: 0, mistake: 0, recover: 0, throws: 100 };
    expect(DIFFICULTY.hard).toMatchObject({ delay: 10, block: 65, wrongHeight: 8, antiAir: 75, punish: 75, ...unchanged });
    expect(DIFFICULTY.boss).toMatchObject({ delay: 8, block: 70, wrongHeight: 5, antiAir: 80, punish: 85, ...unchanged });
  });

  it('two Normal CPUs play a whole match to the end', () => {
    const r = cpuMatch(3, 4);
    expect(r.s.phase).toBe('matchEnd');
    expect(r.events.filter((e) => e.type === 'hit' && e.side === 0).length).toBeGreaterThan(5);
    expect(r.events.filter((e) => e.type === 'hit' && e.side === 1).length).toBeGreaterThan(5);
  });

  it('uses its whole kit: blocks, specials, throws, rekkas and mix-ups', () => {
    const all: SimEvent[] = [];
    for (let m = 0; m < 4; m++) all.push(...cpuMatch(10 + m, 20 + m).events);
    const moves = new Set(all.filter((e) => e.type === 'whiff').map((e) => e.moveId));
    expect(all.some((e) => e.type === 'block')).toBe(true);
    expect(['236L', '236M', '236H'].some((id) => moves.has(id))).toBe(true);
    expect(moves.has('throw') || moves.has('back-throw')).toBe(true);
    expect(moves.has('214A')).toBe(true);
    expect(['22L', '22M', '22H'].some((id) => moves.has(id))).toBe(true);
  });

  it('never supers in the first 2 seconds of a round', () => {
    for (let m = 0; m < 4; m++) {
      const r = cpuMatch(30 + m, 40 + m);
      for (const e of r.events.filter((ev) => ev.type === 'super')) {
        const start = Math.max(...r.fightStarts.filter((f) => f <= e.x));
        expect(e.x - start).toBeGreaterThan(2 * FPS);
      }
    }
  });

  it('blocks some slow attacks, but not all of them', () => {
    // P1 walks in and throws out a haymaker over and over; count what the CPU blocks
    let s = createSim(['egbon-razak', 'egbon-razak'], 5);
    const cpu = new Cpu(1, 'normal', 77);
    let blocked = 0;
    let hit = 0;
    for (let i = 0; i < 6000; i++) {
      const me = s.fighters[0];
      const gap = Math.abs(s.fighters[1].x - me.x) / SUB;
      const p1 = me.action === 'idle' || me.action === 'walk' ? (gap > 110 ? inp(6) : inp(5, i % 2 ? BTN.H : 0)) : inp(5);
      const r = step(s, p1, cpu.next(s));
      s = r.state;
      s.fighters[0].health = 1000;
      s.fighters[1].health = 1000;
      for (const e of r.events) {
        if (e.side !== 1 || e.moveId !== '5H') continue;
        if (e.type === 'block') blocked++;
        if (e.type === 'hit') hit++;
      }
    }
    const rate = blocked / (blocked + hit);
    expect(blocked + hit).toBeGreaterThan(30);
    expect(rate).toBeGreaterThan(0.15);
    expect(rate).toBeLessThan(0.85);
  });

  it('replays exactly with the same seeds', () => {
    expect(hashState(cpuMatch(7, 8, 4000).s)).toBe(hashState(cpuMatch(7, 8, 4000).s));
  });
});
