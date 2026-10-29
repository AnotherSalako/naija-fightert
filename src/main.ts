// Boot and the game loop: the sim steps at a fixed 60 Hz; the renderer draws as often as the screen
// allows, blending the last two sim frames. Phase 2: Egbon vs Egbon on the grey-box Lagos Market
// against the Normal CPU, with the full combat system, game feel and placeholder sound.
//   address options: ?p1=egbon-razak&p2=iya-matthew (fighters), ?cpu=easy|normal|hard|boss,
//   ?p2=human... see P2_MODES, ?dev=1 (debug overlay), ?shake=0 (reduce camera shake), ?mute=1
//   F1 cycles player 2: CPU, human, training dummy (stand, block, crouch-block); M mutes

import { Cpu, DIFFICULTY, type Difficulty } from './ai/cpu';
import { Sfx } from './audio/sfx';
import { CHARACTER_IDS, character } from './sim/data/characters';
import { createSim, step } from './sim/step';
import type { InputFrame, SimState } from './sim/types';
import { listenKeyboard, readPlayer } from './input/devices';
import { LOOKS, SF4, setLook, type Look } from './render/sf4';
import { World } from './render/world';
import { Hud } from './ui/hud';

const params = new URLSearchParams(window.location.search);
const DEV = params.get('dev') === '1' || import.meta.env.DEV;
const pick = (key: string, fallback: string): string => {
  const v = params.get(key);
  return v && CHARACTER_IDS.includes(v) ? v : fallback;
};
const ids: [string, string] = [pick('p1', 'egbon-razak'), pick('p2', 'egbon-razak')];

const level = (params.get('cpu') ?? 'normal') as Difficulty;
const cpuLevel: Difficulty = level in DIFFICULTY ? level : 'normal';
const P2_MODES = [`cpu: ${cpuLevel}`, 'human', 'dummy: stand', 'dummy: block', 'dummy: crouch-block'] as const;
let p2Mode = params.get('p2mode') === 'human' ? 1 : 0;
/** a new seed every match (spec 8), so the CPU does not repeat itself */
const newSeed = (): number => (Math.floor(Math.random() * 0x7fffffff) | 1);
let cpu = new Cpu(1, cpuLevel, newSeed());
const sfx = new Sfx();
sfx.muted = params.get('mute') === '1';
const sfxOf = (side: number, moveId: string): string =>
  character(sim.fighters[side].charId).moves.find((m) => m.id === moveId)?.sfx ?? '';

const STEP_MS = 1000 / 60;
const app = document.getElementById('app') as HTMLElement;
const world = new World(app, ids);
const hud = new Hud(app, ids);
const debug = document.getElementById('debug') as HTMLElement;
const hint = document.getElementById('hint') as HTMLElement;

let sim: SimState = createSim(ids, 1);
let prev = sim;
let acc = 0;
let last = performance.now();
let paused = false;
let showBoxes = false; // F2 in dev; off by default so the fighters read clearly

function p2Input(s: SimState): InputFrame {
  const mode = P2_MODES[p2Mode];
  if (mode.startsWith('cpu')) return cpu.next(s);
  if (mode === 'human') return readPlayer(1);
  const away = s.fighters[1].x > s.fighters[0].x ? 6 : 4;
  if (mode === 'dummy: block') return { dir: away, buttons: 0 };
  if (mode === 'dummy: crouch-block') return { dir: away === 6 ? 3 : 1, buttons: 0 };
  return { dir: 5, buttons: 0 };
}

function updateHint(): void {
  hud.setP2Label(P2_MODES[p2Mode].startsWith('cpu') ? 'CPU' : 'P2');
  hint.textContent = `P1: WASD + J K L ; · I throw · O taunt · P2 (${P2_MODES[p2Mode]}): arrows + numpad 1 2 3 0 · F1 player 2 · M sound · Esc pause${DEV ? ` · F2 boxes · F3 look: ${look}` : ''}`;
}
let look: Look = 'real';
setLook(look);

// browsers only start audio after the player does something
for (const ev of ['keydown', 'pointerdown', 'touchstart', 'gamepadconnected']) window.addEventListener(ev, () => sfx.unlock(), { passive: true });

window.addEventListener('keydown', (e) => {
  if (e.code === 'KeyM') sfx.muted = !sfx.muted;
  if (e.code === 'F1') {
    e.preventDefault();
    p2Mode = (p2Mode + 1) % P2_MODES.length;
    updateHint();
  }
  if (e.code === 'F2' && DEV) {
    e.preventDefault();
    showBoxes = !showBoxes;
  }
  if (e.code === 'F3' && DEV) {
    // compare the fighters' shading: hybrid (the default), toon bands, plain PBR
    e.preventDefault();
    const order = Object.keys(LOOKS) as Look[];
    look = order[(order.indexOf(look) + 1) % order.length];
    setLook(look);
    updateHint();
  }
  if (e.code === 'Escape') paused = !paused;
  if (e.code === 'Enter' && sim.phase === 'matchEnd') {
    sim = createSim(ids, newSeed());
    prev = sim;
    cpu = new Cpu(1, cpuLevel, newSeed());
    hud.resetBanner();
  }
});
window.addEventListener('resize', () => world.resize());

function advanceOne(p1: InputFrame, p2: InputFrame): void {
  prev = sim;
  const r = step(sim, p1, p2);
  sim = r.state;
  hud.onEvents(r.events, sim);
  world.onEvents(r.events, sim, performance.now() / 1000);
  sfx.onEvents(r.events, sfxOf);
}

function loop(now: number): void {
  // the KO slow motion runs the sim at 0.3x for a moment (spec 5.6)
  acc += Math.min(now - last, 100) * world.timeScale(now / 1000);
  last = now;
  while (!paused && acc >= STEP_MS) {
    acc -= STEP_MS;
    advanceOne(readPlayer(0), p2Input(sim));
  }
  if (paused) acc = 0;
  world.render(prev, sim, paused ? 1 : acc / STEP_MS, now / 1000, showBoxes);
  hud.update(sim);
  if (DEV) {
    const f = sim.fighters;
    debug.textContent = `frame ${sim.frame} · ${sim.phase}${sim.hitstop ? ` · stop ${sim.hitstop}` : ''} · meter ${sim.meter[0]}/${sim.meter[1]} · P1 ${f[0].action}${f[0].moveId ? ' ' + f[0].moveId : ''} f${f[0].frame} · P2 ${f[1].action}${f[1].moveId ? ' ' + f[1].moveId : ''} f${f[1].frame}${paused ? ' · PAUSED' : ''}`;
  }
  requestAnimationFrame(loop);
}

listenKeyboard();
updateHint();
debug.style.display = DEV ? 'block' : 'none';
if (DEV) {
  // test hook: step the sim by hand (the browser pauses animation frames in background tabs)
  (window as unknown as Record<string, unknown>).__nf = {
    get sim() { return sim; },
    world,
    /** the fighters' look, live: e.g. __nf.sf4.uRim.value = 1.6 (src/render/sf4.ts) */
    sf4: SF4,
    advance(n: number, p1: InputFrame = { dir: 5, buttons: 0 }, p2: InputFrame = { dir: 5, buttons: 0 }): SimState {
      for (let i = 0; i < n; i++) advanceOne(p1, p2);
      world.render(prev, sim, 1, performance.now() / 1000, showBoxes);
      hud.update(sim);
      return sim;
    },
  };
}
requestAnimationFrame(loop);

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').catch(() => undefined);
}
