import { describe, expect, it } from 'vitest';
import { STAGE_HALF_WIDTH, SUB } from '../src/sim/constants';
import { CHARACTERS } from '../src/sim/data/characters';
import { actionable } from '../src/sim/fighter';
import { BTN, type InputFrame, type MoveData, type SimState } from '../src/sim/types';
import { fight, holdAfter, inp, moveInputs, tick } from './helpers';

/** P1 at point-blank against P2 standing at the right wall, with full meter for EX moves and supers. */
function setup(id: string, other = 'egbon-razak'): SimState {
  const s = fight([id, other]);
  const d = s.fighters[1];
  d.x = STAGE_HALF_WIDTH - (CHARACTERS[other].pushWidth * SUB) / 2;
  s.fighters[0].x = d.x - ((CHARACTERS[id].pushWidth + CHARACTERS[other].pushWidth) * SUB) / 2;
  s.meter = [3000, 3000];
  return s;
}

/** Perform the move, then report the frames each side can act again and what happened. */
function measure(id: string, m: MoveData, defend: InputFrame): { adv: number; result: string; started: boolean } {
  let s = setup(id);
  let result = '';
  let started = false;
  let frame = 0;
  const typed = moveInputs(m);
  while (!result && frame < 120) {
    const input = frame < typed.length ? typed[frame] : inp(holdAfter(m));
    const r = tick(s, input, defend);
    s = r.s;
    frame++;
    if (s.fighters[0].moveId === m.id) started = true;
    const ev = r.events.find((e) => (e.type === 'hit' || e.type === 'block') && e.side === 1);
    if (ev) result = ev.type;
  }
  let attackerFree = -1;
  let defenderFree = -1;
  for (let f = frame + 1; f < frame + 200 && (attackerFree < 0 || defenderFree < 0); f++) {
    s = tick(s, inp(5), defend).s;
    if (attackerFree < 0 && actionable(s.fighters[0])) attackerFree = f;
    if (defenderFree < 0 && actionable(s.fighters[1])) defenderFree = f;
  }
  return { adv: defenderFree - attackerFree, result, started };
}

/** Ground strikes that start on their own (not rekka follow-ups, Wahala moves, grabs or feints). */
const groundStrikes = (id: string): MoveData[] => CHARACTERS[id].moves.filter((m) =>
  !m.air && !m.grab && m.type !== 'feint' && m.type !== 'wahala' && m.followsFrom.length === 0);

describe('frame data in the real sim matches the data files', () => {
  for (const id of Object.keys(CHARACTERS)) {
    for (const m of groundStrikes(id)) {
      it(`${id} ${m.id}: blocked, it is ${m.onBlock} as the data says`, () => {
        const crouchBlock = m.level === 'low';
        const r = measure(id, m, inp(crouchBlock ? 3 : 6));
        expect(r.started, 'the typed input performs the move').toBe(true);
        expect(r.result).toBe('block');
        expect(r.adv).toBe(m.onBlock);
      });
      if (!m.launch && !m.wallbounce && m.knockdown === 'none' && m.hits === 1) {
        // on hit: the move's own onHit where its data gives one, otherwise HIT_BONUS better than on block
        const onHit = m.hitstun - m.active - m.recovery;
        it(`${id} ${m.id}: on hit it is ${onHit}`, () => {
          const r = measure(id, m, inp(5));
          expect(r.result).toBe('hit');
          expect(r.adv).toBe(onHit);
        });
        if (id === 'egbon-razak' && m.id === '5H') it('egbon-razak 5H is +2 on hit (playtest, 29 Oct)', () => expect(onHit).toBe(2));
        if (id === 'egbon-razak' && m.id === '5L') it('egbon-razak 5L is +2 on block (spec)', () => expect(m.onBlock).toBe(2));
      }
    }
  }
});

describe('blocking rules', () => {
  const egbon = (id: string): MoveData => CHARACTERS['egbon-razak'].moves.find((m) => m.id === id) as MoveData;

  it('a low hits a standing block and is blocked crouching', () => {
    expect(measure('egbon-razak', egbon('2L'), inp(6)).result).toBe('hit');
    expect(measure('egbon-razak', egbon('2L'), inp(3)).result).toBe('block');
  });

  it('an overhead hits a crouching block and is blocked standing', () => {
    expect(measure('egbon-razak', egbon('6M'), inp(3)).result).toBe('hit');
    expect(measure('egbon-razak', egbon('6M'), inp(6)).result).toBe('block');
  });

  it('a mid is blocked either way', () => {
    expect(measure('egbon-razak', egbon('5H'), inp(6)).result).toBe('block');
    expect(measure('egbon-razak', egbon('5H'), inp(3)).result).toBe('block');
  });

  it('a high jab whiffs over a crouching opponent', () => {
    expect(measure('egbon-razak', egbon('5L'), inp(2)).result).toBe('');
  });

  it('every overhead can hit a crouching opponent', () => {
    for (const c of Object.values(CHARACTERS)) {
      for (const m of groundStrikes(c.id).filter((mv) => mv.level === 'overhead')) {
        expect(measure(c.id, m, inp(3)).result, `${c.id} ${m.id}`).toBe('hit');
      }
    }
  });

  it('a hit takes the damage in the data, a block takes none', () => {
    let s = setup('egbon-razak');
    s = tick(s, inp(5, BTN.M), inp(5)).s;
    for (let i = 0; i < 10; i++) s = tick(s).s;
    expect(CHARACTERS['egbon-razak'].health - s.fighters[1].health).toBe(egbon('5M').damage);
  });
});
