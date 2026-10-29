import { expect, it } from 'vitest';
import { createSim, step } from '../src/sim/step';
import { Cpu, type Difficulty } from '../src/ai/cpu';
import { character } from '../src/sim/data/characters';
import { STAGE_HALF_WIDTH, MAX_SEPARATION, SUB } from '../src/sim/constants';
import type { InputFrame, SimState } from '../src/sim/types';

const MOTIONS = [[2,3,6],[2,1,4],[6,2,3],[4,2,1],[6,3,2,1,4],[2,5,2],[6,5,6],[4,5,4],[2,3,6,2,3,6],[2,1,4,2,1,4]];
class Masher {
  rng: number; plan: InputFrame[] = [];
  constructor(seed: number) { this.rng = seed * 2654435761 >>> 0; }
  r(n: number) { this.rng = (this.rng * 1664525 + 1013904223) >>> 0; return this.rng % n; }
  next(s: SimState, side: 0|1): InputFrame {
    if (!this.plan.length) {
      const f = s.fighters[side]; const rel = (d: number) => f.facing === 1 ? d : ({1:3,3:1,4:6,6:4,7:9,9:7} as any)[d] ?? d;
      const c = this.r(10);
      if (c < 4) { const m = MOTIONS[this.r(MOTIONS.length)]; const b = [1,2,4,8,3,7][this.r(6)]; for (const d of m) this.plan.push({ dir: rel(d), buttons: 0 }); this.plan.push({ dir: rel(m[m.length-1]), buttons: b }); }
      else if (c < 7) { const d = [1,2,3,4,5,6,7,8,9][this.r(9)]; const b = [0,1,2,4,3][this.r(5)]; for (let i=0;i<1+this.r(20);i++) this.plan.push({ dir: rel(d), buttons: i===0?b:0 }); }
      else { const d=[4,6,5,2][this.r(4)]; for (let i=0;i<10+this.r(40);i++) this.plan.push({ dir: rel(d), buttons: 0 }); }
    }
    return this.plan.shift()!;
  }
}
const ok = new Set(['idle','walk','crouch','victory','ko']);
const airOK = new Set(['jump','airhit','ko','attack','prejump','grabbed','grabbing','hitstun','land']);
it('random and CPU matches keep the physics sane: nobody floats, sinks, leaves the stage, overlaps or locks up', () => {
  const bad = new Map<string, { n: number; ex: string }>();
  const note = (k: string, ex: string) => { const b = bad.get(k); if (b) b.n++; else bad.set(k, { n: 1, ex }); };
  let maxY = 0, maxYEx = ''; let maxCombo = 0, maxDmg = 0, frames = 0, comboEx = '';
  const levels: (Difficulty|'mash')[] = ['normal','hard','mash'];
  let seed = 0;
  for (const la of levels) for (const lb of levels) for (let k = 0; k < 1; k++) {
    seed++;
    let s = createSim(['egbon-razak','egbon-razak'], seed);
    const A: any = la === 'mash' ? new Masher(seed) : new Cpu(0, la, seed*7);
    const B: any = lb === 'mash' ? new Masher(seed+999) : new Cpu(1, lb, seed*13+1);
    const since = [0,0]; const lastAct = ['', ''];
    const hp = [0,0];
    for (let i = 0; i < 3 * 99 * 60 && s.phase !== 'matchEnd'; i++) {
      const ia = la === 'mash' ? A.next(s, 0) : A.next(s); const ib = lb === 'mash' ? B.next(s, 1) : B.next(s);
      const prevRound = s.round; const prevActs = s.fighters.map(f=>f.action+':'+f.frame+':'+f.moveId+':vy'+f.vy);
      const r = step(s, ia, ib); s = r.state; frames++;
      const tag = () => `seed ${seed} ${la}v${lb} f${s.frame} ${s.fighters.map(f=>`${f.action}:${f.frame}:${f.moveId}:x${f.x}:y${f.y}`).join(' | ')}`;
      s.fighters.forEach((f, j) => {
        const c = character(f.charId);
        if ([f.x,f.y,f.vx,f.vy,f.health].some(v => !Number.isFinite(v))) note('NaN', tag());
        if (Math.abs(f.x) > STAGE_HALF_WIDTH) note('out of stage', tag());
        if (f.y < 0) note('below floor', tag());
        if (f.action === 'airhit' && f.y > maxY) { maxY = f.y; maxYEx = tag(); }
        if (f.y > 0 && !airOK.has(f.action)) note(`floating in ${f.action} after ${prevActs[j]}`, tag());
        if (f.action === 'attack' && !f.moveId) note('attack without move', tag());
        if (f.health < 0 || f.health > c.health) note('health out of range', tag());
        if (s.round === prevRound && s.phase === 'fight' && f.health > hp[j] && hp[j] > 0) note('health went up', tag());
        hp[j] = f.health;
        if (f.action === lastAct[j]) since[j]++; else { since[j] = 0; lastAct[j] = f.action; }
        if (!ok.has(f.action) && f.action !== 'airhit' && since[j] > 240) { note(`stuck in ${f.action}`, tag()); since[j] = -100000; }
        const o = s.fighters[1-j];
        if (s.phase === 'fight' && f.y === 0 && o.y === 0 && ['idle','walk','crouch'].includes(f.action) && Math.sign(o.x - f.x) !== f.facing && o.x !== f.x) note('facing away while neutral', tag());
      });
      const [a, b] = s.fighters;
      const need = ((character(a.charId).pushWidth + character(b.charId).pushWidth) * SUB) / 2;
      if (s.phase === 'fight' && a.y === 0 && b.y === 0 && Math.abs(a.x-b.x) < need - 2*SUB && !['grabbed','grabbing'].includes(a.action) && !['grabbed','grabbing'].includes(b.action)) note('bodies overlap on ground', tag());
      if (Math.abs(a.x-b.x) > MAX_SEPARATION + 4*SUB) note('beyond max separation', tag());
      s.combo.forEach((c) => { if (c.hits > maxCombo) { maxCombo = c.hits; comboEx = tag(); } maxDmg = Math.max(maxDmg, c.damage); });
    }
    if (s.phase !== 'matchEnd') note('match did not end', `seed ${seed} ${la}v${lb} phase ${s.phase} round ${s.round}`);
  }
  const problems = [...bad].map(([k, v]) => `${k}: ${v.n}  e.g. ${v.ex}`);
  expect(problems, problems.join('\n')).toEqual([]);
  // a launch peaks around 1.4 m, however high it starts; a multi-hit move does not carry a body up
  expect(maxY / 100, maxYEx).toBeLessThan(170);
  expect(maxCombo, comboEx).toBeLessThan(20);
}, 300000);
