import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { CHARACTERS, RAW_CHARACTERS } from '../src/sim/data/characters';

const box = z.object({ x: z.number(), y: z.number(), w: z.number().positive(), h: z.number().positive() });
const move = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  input: z.string().min(2),
  startup: z.number().int().min(1),
  active: z.number().int().min(1),
  recovery: z.number().int().min(0),
  damage: z.number().int().min(0),
  onBlock: z.number().int().optional(),
  hitstun: z.number().int().positive().optional(),
  blockstun: z.number().int().positive().optional(),
  strength: z.enum(['light', 'medium', 'heavy', 'special', 'super']),
  level: z.enum(['high', 'mid', 'low', 'overhead', 'unblockable']),
  type: z.string().optional(),
  travel: z.number().min(0).optional(),
  air: z.boolean().optional(),
  launch: z.boolean().optional(),
  anim: z.string().min(1),
  hitboxes: z.array(box.extend({ frameStart: z.number().int().optional(), frameEnd: z.number().int().optional() })).optional(),
  grab: z.boolean().optional(),
  meterCost: z.number().int().min(0).optional(),
  superLevel: z.number().int().min(0).max(2).optional(),
  hits: z.number().int().min(1).optional(),
  followsFrom: z.array(z.string()).optional(),
  cancelInto: z.array(z.enum(['special', 'super'])).optional(),
});
const colour = z.string().regex(/^#[0-9a-f]{6}$/i);
const palette = z.object({ skin: colour, primary: colour, secondary: colour, accent: colour, extra: colour });
const characterSchema = z.object({
  id: z.string(), name: z.string(), archetype: z.string(),
  health: z.number().int().positive(),
  walkForward: z.number().positive(), walkBack: z.number().positive(),
  dash: z.object({ frames: z.number().int().positive(), distance: z.number().positive() }),
  backdash: z.object({ frames: z.number().int().positive(), distance: z.number().positive(), invulnFrom: z.number().int(), invulnTo: z.number().int() }),
  jump: z.object({ frames: z.number().int().positive(), height: z.number().positive(), distance: z.number().min(0) }),
  pushWidth: z.number().positive(), height: z.number().positive(),
  hurtboxes: z.object({ stand: box, crouch: box, air: box }),
  palette, palette2: palette,
  moves: z.array(move).min(1),
});

describe('character data', () => {
  it.each(Object.keys(RAW_CHARACTERS))('%s matches the schema', (id) => {
    const r = characterSchema.safeParse(RAW_CHARACTERS[id]);
    expect(r.success, r.success ? '' : JSON.stringify(r.error.issues.slice(0, 3))).toBe(true);
  });

  it('every character has the full set of normals and unique move ids', () => {
    for (const c of Object.values(CHARACTERS)) {
      const ids = c.moves.map((m) => m.id);
      expect(new Set(ids).size, c.id).toBe(ids.length);
      for (const id of ['5L', '5M', '5H', '2L', '2M', '2H', 'j.L', 'j.M', 'j.H']) expect(ids, `${c.id} ${id}`).toContain(id);
    }
  });

  it('every strike has a hitbox; grabs and feints have none and grabs have a reach', () => {
    for (const c of Object.values(CHARACTERS)) {
      for (const m of c.moves) {
        if (m.grab) { expect(m.hitboxes, `${c.id} ${m.id}`).toHaveLength(0); expect(m.grabRange).toBeGreaterThan(0); }
        else if (m.type === 'feint') expect(m.hitboxes).toHaveLength(0);
        else expect(m.hitboxes.length, `${c.id} ${m.id}`).toBeGreaterThan(0);
      }
    }
  });

  it('rekka follow-ups point at real moves, and supers cost the bars in spec 6.9', () => {
    for (const c of Object.values(CHARACTERS)) {
      const ids = c.moves.map((m) => m.id);
      for (const m of c.moves) {
        for (const f of m.followsFrom) expect(ids, `${c.id} ${m.id}`).toContain(f);
        if (m.superLevel === 1) expect(m.meterCost).toBe(1000);
        if (m.superLevel === 2) expect(m.meterCost).toBe(3000);
        if (m.input.endsWith('S') && m.type === 'special') expect(m.meterCost, `${c.id} ${m.id} is an EX`).toBe(1000);
      }
    }
  });

  it('air moves are marked as air moves, and ground hitboxes are live on the active frames', () => {
    for (const c of Object.values(CHARACTERS)) {
      for (const m of c.moves) {
        expect(m.air, `${c.id} ${m.id}`).toBe(m.id.startsWith('j.'));
        for (const b of m.hitboxes) {
          expect(b.frameStart).toBeGreaterThanOrEqual(m.startup);
          expect(b.frameEnd).toBeLessThanOrEqual(m.startup + m.active - 1);
        }
      }
    }
  });

  it('health and walk speeds match the spec table (6.2)', () => {
    expect(CHARACTERS['iya-matthew'].health).toBe(1150);
    expect(CHARACTERS['egbon-razak'].health).toBe(1000);
    expect(CHARACTERS['chief-priest'].health).toBe(900);
    // 30 Oct: Egbon walks at 1.8 m/s (was 3), the speed his boxing step animation actually covers
    expect(CHARACTERS['egbon-razak'].walkForward).toBe(3);
    expect(CHARACTERS['egbon-razak'].walkBack).toBe(2.3);
    expect(CHARACTERS['chief-priest'].dash).toEqual({ frames: 18, distance: 100 });
  });
});
