// Real art budgets (spec 3.5, 4.1): every model the renderer lists exists, stays within 50k triangles
// and a sensible size, has the Mixamo-named bones the poses drive, and has its cloth bones.

import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync('src/render/skinned.ts', 'utf-8');
const listed = [...source.matchAll(/'([a-z-]+)': 'models\/([a-z-]+\.glb)'/g)].map((m) => ({ id: m[1], file: m[2] }));

/** joint names in a GLB's JSON chunk */
function nodeNames(path: string): string[] {
  const buf = readFileSync(path);
  const len = buf.readUInt32LE(12);
  const json = JSON.parse(buf.subarray(20, 20 + len).toString('utf-8')) as { nodes: { name?: string }[] };
  return json.nodes.map((n) => n.name ?? '');
}

describe('character models', () => {
  it('lists at least Egbon', () => {
    expect(listed.map((m) => m.id)).toContain('egbon-razak');
  });

  for (const { id, file } of listed) {
    it(`${id}: the GLB exists and is within budget`, () => {
      const glb = `public/models/${file}`;
      expect(existsSync(glb), glb).toBe(true);
      const manifest = JSON.parse(readFileSync(`public/models/${id}.json`, 'utf-8')) as { triangles: number; bytes: number; cloth: string[] };
      expect(manifest.triangles).toBeLessThanOrEqual(50000); // Dele, 29 Oct: full detail, no decimation below ~40k
      expect(readFileSync(glb).length).toBeLessThan(3 * 1024 * 1024);
      const names = nodeNames(glb);
      for (const bone of ['Hips', 'Spine', 'Spine1', 'Spine2', 'Head', 'RightArm', 'RightForeArm', 'LeftArm', 'LeftForeArm',
        'RightUpLeg', 'RightLeg', 'LeftUpLeg', 'LeftLeg']) {
        expect(names, bone).toContain(bone);
      }
      for (const c of manifest.cloth) expect(names, c).toContain(c);
    });
  }
});
