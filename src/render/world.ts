// Draws the sim: the stage, both fighters (interpolated between sim frames), shadows, camera, the
// optional hitbox overlay, and all the game feel of spec section 5 that lives in the renderer:
// defender shake during hit-stop, sparks, impact flashes, camera shake, the KO zoom and slow motion,
// the super darkening, the Wahala glow, squash and stretch, and smooth blends between poses.
// Reads sim state and events only; never changes them.

import * as THREE from 'three';
import { INTRO_FRAMES, SUB, SUPER_FREEZE } from '../sim/constants';
import { character } from '../sim/data/characters';
import { hurtRect, liveHitboxes, worldRect, type Rect } from '../sim/combat';
import { lastActiveFrame, moveData } from '../sim/fighter';
import type { SimEvent, SimState } from '../sim/types';
import { frame, FOV } from './camera';
import { Fx } from './fx';
import { animSet } from './animsets';
import { clipFor, type ClipPlay } from './clips';
import { blend, poseFor, type Pose } from './poses';
import { loadModel, mannequinBody, setFighterAnisotropy, skinnedBody, type Body, type Outline } from './skinned';
import { buildStage, type StageView } from './stage';

const M = (subUnits: number): number => subUnits / SUB / 100;

/** camera shake by what caused it: [screen px, milliseconds] (spec 5.4) */
const SHAKE: Record<string, [number, number]> = {
  medium: [1, 80], heavy: [4, 120], special: [4, 120], super: [8, 250], ko: [8, 250], wall: [6, 150],
};
/** actions that ease into each other; everything else (attacks, hits) snaps at once (spec 5.5) */
const SMOOTH = new Set(['idle', 'walk', 'crouch', 'prejump', 'land', 'jump', 'dash', 'backdash', 'getup', 'victory', 'taunt']);
const KO_SLOW = { delay: 0.33, length: 1.5, scale: 0.3 };
/** metres between two models' torso centres at the closest: chest to chest, side-on */
const TORSO_GAP = 0.38;
/** close-up framing: the fighter's share of the screen height, and the intro frames left for easing back */
const CLOSE_SHARE = 0.7;
const CLOSE_EASE_OUT = 25;
/** ACES exposure, tuned so the self-lit fighters stand out against the night stage */
const EXPOSURE = 1.1;

function shadowTexture(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d') as CanvasRenderingContext2D;
  const grad = ctx.createRadialGradient(32, 32, 2, 32, 32, 30);
  grad.addColorStop(0, 'rgba(0,0,0,0.55)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

function reduceShakeSetting(): boolean {
  try {
    return new URLSearchParams(window.location.search).get('shake') === '0' || window.localStorage.getItem('nf.reduceShake') === '1';
  } catch {
    return false;
  }
}

export class World {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(FOV, 16 / 9, 0.1, 80);
  private readonly stage: StageView;
  private readonly bodies: Body[];
  private readonly shadows: THREE.Mesh[] = [];
  private readonly boxes: THREE.LineSegments;
  private readonly fx: Fx;
  private readonly flashEl: HTMLElement;
  private readonly lights: { light: THREE.Light; base: number }[] = [];
  private readonly accents: THREE.Color[];
  private readonly reduceShake = reduceShakeSetting();
  private camX = 0;
  private camDist = 0;
  private camLook = 0;
  private lastT = 0;
  private dim = 1;
  private poses: (Pose | null)[] = [null, null];
  private squash = [1, 1];
  private impactUntil = [-1, -1];
  private flashing = [false, false];
  private glowing = [false, false];
  private shake = { amp: 0, from: 0, until: 0 };
  private shaken = -1;
  private ko: { loser: number; from: number } | null = null;
  private superCam: { side: number; until: number } | null = null;
  private trail: (string | null)[] = [null, null];
  /** dev only: hold the camera on a point for close inspection (null = normal framing) */
  inspect: { x: number; y: number; distance: number } | null = null;
  /** dev only: the clip each body was last given (null: the procedural pose) */
  readonly lastClips: (ClipPlay | null)[] = [null, null];

  constructor(container: HTMLElement, ids: [string, string]) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    // filmic tone mapping; exposure set for the fighters, who carry their own light (sf4.ts)
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = EXPOSURE;
    setFighterAnisotropy(this.renderer.capabilities.getMaxAnisotropy());
    container.appendChild(this.renderer.domElement);
    this.stage = buildStage(this.scene);
    const mirror = ids[0] === ids[1];
    this.bodies = ids.map((id, i) => mannequinBody(character(id), mirror && i === 1));
    this.accents = ids.map((id, i) => new THREE.Color(mirror && i === 1 ? character(id).palette2.accent : character(id).palette.secondary));
    const tex = shadowTexture();
    for (const b of this.bodies) {
      this.scene.add(b.root);
      const s = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.5), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }));
      s.rotation.x = -Math.PI / 2;
      s.position.y = 0.01;
      this.scene.add(s);
      this.shadows.push(s);
    }
    this.scene.traverse((o) => {
      if (o instanceof THREE.Light) this.lights.push({ light: o, base: o.intensity });
    });
    this.fx = new Fx(this.scene);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(16 * 8 * 3), 3));
    geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(16 * 8 * 3), 3));
    this.boxes = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ vertexColors: true, depthTest: false }));
    this.boxes.renderOrder = 10;
    this.scene.add(this.boxes);
    this.flashEl = document.createElement('div');
    this.flashEl.style.cssText = 'position:absolute;inset:0;background:#fff;opacity:0;pointer-events:none;transition:opacity 0.35s ease-out';
    container.appendChild(this.flashEl);
    this.resize();
    // real models replace the mannequins as soon as they have loaded (?model=0 keeps the mannequins)
    if (new URLSearchParams(window.location.search).get('model') !== '0') {
      ids.forEach((id, i) => {
        loadModel(id)?.then((t) => this.swapBody(i, skinnedBody(t, id, mirror && i === 1)))
          .catch((e: unknown) => console.warn(`model for ${id} did not load; keeping the placeholder`, e));
      });
    }
  }

  private swapBody(i: number, body: Body): void {
    const old = this.bodies[i];
    body.root.position.copy(old.root.position);
    this.scene.remove(old.root);
    this.scene.add(body.root);
    this.bodies[i] = body;
    this.flashing[i] = false;
    this.glowing[i] = false;
    this.poses[i] = null;
  }

  /** what is standing in for each fighter right now (for tests and the dev overlay) */
  bodyKinds(): string[] {
    return this.bodies.map((b) => b.kind);
  }

  resize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  /** How fast the sim should run right now: 0.3 during the KO slow motion (spec 5.6). */
  timeScale(t: number): number {
    if (!this.ko) return 1;
    const k = t - this.ko.from;
    return k > KO_SLOW.delay && k < KO_SLOW.delay + KO_SLOW.length ? KO_SLOW.scale : 1;
  }

  private shakeFor(kind: string, t: number): void {
    const s = SHAKE[kind];
    if (!s || this.reduceShake) return;
    if (t < this.shake.until && s[0] < this.shake.amp) return;
    this.shake = { amp: s[0], from: t, until: t + s[1] / 1000 };
  }

  private whiteFlash(): void {
    this.flashEl.style.transition = 'none';
    this.flashEl.style.opacity = '0.85';
    requestAnimationFrame(() => {
      this.flashEl.style.transition = 'opacity 0.35s ease-out';
      this.flashEl.style.opacity = '0';
    });
  }

  /** React to what happened in the sim this frame. `t` is the render clock in seconds. */
  onEvents(events: SimEvent[], s: SimState, t: number): void {
    for (const e of events) {
      const x = M(e.x);
      const y = M(e.y);
      const attacker = s.fighters[e.side === 0 ? 1 : 0];
      const m = e.moveId ? character(attacker.charId).moves.find((mv) => mv.id === e.moveId) : undefined;
      switch (e.type) {
        case 'hit': {
          this.fx.hit(x, y, e.strength ?? 'light', attacker.facing, !!(e.counter || e.punish));
          this.shaken = e.side;
          const heavy = e.strength === 'heavy' || e.strength === 'special' || e.strength === 'super';
          if (heavy) this.impactUntil[e.side] = s.frame + 1;
          if (heavy && e.strength !== 'super') this.stage.react('duck', t);
          if (e.strength === 'heavy') this.squash[e.side] = 0.95;
          this.shakeFor(e.strength === 'super' ? (e.last ? 'super' : 'medium') : (e.strength ?? ''), t);
          if (m?.vfx === 'tickets') this.fx.confetti(x, y, ['#f3ead2', '#f2a7b8', '#9cc7f0'], 7, attacker.facing);
          if (m?.vfx === 'coins') this.fx.confetti(x, y + 0.2, ['#f2c12e', '#e8b020', '#4f9a52'], e.last ? 26 : 6, attacker.facing);
          if (m?.vfx === 'door_slam') { this.fx.flash(x, y, '#ffffff', 1.4); this.fx.dust(M(attacker.x), 8, '#b8a48a', 0.6); }
          if (m?.vfx === 'gold_flash') this.fx.ring(x, y, '#ffd34a', 1.8);
          if (m?.vfx === 'bus') { this.fx.busCrash(x); this.shakeFor('super', t); }
          break;
        }
        case 'block':
          this.fx.block(x, y, attacker.facing);
          this.shaken = e.side;
          if (e.strength !== 'light') this.shakeFor('medium', t);
          break;
        case 'armor':
          this.fx.ring(x, y, '#ff9a3a', 0.9, 0.2);
          this.impactUntil[e.side] = s.frame + 1;
          break;
        case 'ko':
          this.ko = { loser: e.side, from: t };
          this.stage.react('cheer', t + 0.4);
          this.whiteFlash();
          break;
        case 'knockdown':
          this.fx.dust(x, e.strength === 'super' ? 16 : 9, '#b8a48a', 1.4);
          this.shakeFor(e.strength === 'super' ? 'ko' : 'medium', t);
          break;
        case 'bounce':
          // the body hits the floor and bounces: dust and a shake by how hard it was knocked down
          this.fx.dust(x, e.strength === 'heavy' ? 12 : 7, '#b8a48a', 1.2);
          this.shakeFor(e.strength === 'heavy' ? 'heavy' : 'medium', t);
          break;
        case 'wallbounce':
          this.fx.dust(x, 10, '#c8b498', 1.2);
          this.fx.ring(x, y, '#ffffff', 1.2, 0.25);
          this.shakeFor('wall', t);
          this.stage.react('duck', t);
          break;
        case 'jump':
          this.squash[e.side] = 1.08;
          break;
        case 'land':
          this.squash[e.side] = 0.92;
          this.fx.dust(x, 3, '#b8a48a', 0.6);
          break;
        case 'dash':
          this.fx.dust(x, 4, '#b8a48a', 0.8);
          break;
        case 'whiff': {
          const own = s.fighters[e.side];
          const mv = e.moveId ? character(own.charId).moves.find((mm) => mm.id === e.moveId) : undefined;
          this.trail[e.side] = mv?.vfx === 'afterimage' || mv?.vfx === 'gold_flash' ? mv.id : null;
          if (mv?.vfx === 'skid') this.fx.dust(x, 6, '#9e8c74', 1.6);
          if (mv?.vfx === 'gold_flash') this.fx.ring(x, 1.0, '#ffd34a', 2.2, 0.35);
          if (mv?.vfx === 'door_slam') this.fx.dust(x, 6, '#b8a48a', 0.5);
          break;
        }
        case 'super':
          this.superCam = { side: e.side, until: s.frame + SUPER_FREEZE };
          this.stage.react('cheer', t);
          this.fx.ring(x, 1.0, `#${this.accents[e.side].getHexString()}`, 2.6, 0.5);
          break;
        case 'wahala':
          this.fx.ring(x, 1.0, `#${this.accents[e.side].getHexString()}`, 3.2, 0.5);
          this.fx.flash(x, 1.0, `#${this.accents[e.side].getHexString()}`, 3);
          this.shakeFor('heavy', t);
          break;
        case 'flipout':
          this.fx.flash(x, y + 0.9, '#ffffff', 1.2);
          break;
        case 'tech':
          this.fx.ring(x, y, '#ffffff', 1.4, 0.25);
          this.fx.flash(x, y, '#dff1ff', 1.2);
          break;
        case 'throw':
          this.fx.flash(x, y, '#fff4dc', 0.9);
          break;
        case 'round_start':
          this.ko = null;
          this.superCam = null;
          this.trail = [null, null];
          break;
        default:
          break;
      }
    }
  }

  /** Draw one frame: `alpha` blends the previous and current sim frames (fixed step, smooth render). */
  /**
   * The sim keeps the push boxes apart, but a real model's stance and lunges reach well past its push
   * box, so close up the bodies would pass into each other. After posing, the models (not the sim) are
   * eased apart until their torsos are at least TORSO_GAP apart: they touch, never merge. Skipped while
   * one is jumping over the other.
   */
  private separateTorsos(): void {
    const [a, b] = this.bodies;
    if (!a?.torso || !b?.torso) return;
    a.root.updateMatrixWorld(true);
    b.root.updateMatrixWorld(true);
    const ta = a.torso().clone();
    const tb = b.torso();
    if (Math.abs(ta.y - tb.y) > 0.6) return;
    const dir = Math.sign(b.root.position.x - a.root.position.x) || 1;
    const gap = (tb.x - ta.x) * dir;
    if (gap >= TORSO_GAP) return;
    const push = (TORSO_GAP - gap) / 2;
    a.root.position.x -= dir * push;
    b.root.position.x += dir * push;
  }

  render(prev: SimState, cur: SimState, alpha: number, t: number, showBoxes: boolean): void {
    const dt = this.lastT === 0 ? 1 / 60 : Math.min(0.1, Math.max(0, t - this.lastT));
    this.lastT = t;
    const pos: number[] = [];
    cur.fighters.forEach((f, i) => {
      const p = prev.fighters[i];
      const sameRound = prev.round === cur.round;
      let x = sameRound ? p.x + (f.x - p.x) * alpha : f.x;
      const y = sameRound ? p.y + (f.y - p.y) * alpha : f.y;
      // the defender shakes during hit-stop, alternating every frame (spec 5.1)
      if (cur.hitstop > 0 && this.shaken === i) x += (cur.hitstop % 2 === 0 ? 1 : -1) * 3 * SUB;
      const body = this.bodies[i];
      body.root.position.set(M(x), M(y), i === 0 ? 0.05 : -0.05);

      const m = moveData(f);
      const target = poseFor(f, m, t);
      const last = this.poses[i];
      const pose = last && SMOOTH.has(f.action) ? blend(last, target, 1 - Math.pow(0.6, dt * 60)) : target;
      this.poses[i] = pose;
      const vx = sameRound && dt > 0 ? (M(f.x - p.x) * 60) * f.facing : 0;
      const clip = body.clips ? clipFor(f, m, vx, body.clips, animSet(f.charId)) : null;
      this.lastClips[i] = clip;
      body.apply(pose, f.facing, dt, vx, f.action === 'attack' || f.action === 'grabbing', clip, f.y === 0);

      this.squash[i] += (1 - this.squash[i]) * Math.min(1, dt * 14);
      const sq = this.squash[i];
      body.root.scale.set(1 / Math.sqrt(sq), sq, 1);

      const flash = cur.frame <= this.impactUntil[i];
      if (flash !== this.flashing[i]) {
        this.flashing[i] = flash;
        for (const mat of body.materials) mat.emissive.set(flash ? 0xffffff : 0x000000);
      }
      const glow = cur.wahala[i].active > 0;
      if (glow || this.glowing[i]) {
        const pulse = 0.55 + 0.45 * Math.sin(t * 9);
        for (const o of body.outlines as Outline[]) {
          if (glow) o.mat.color.copy(o.base).lerp(this.accents[i], pulse);
          else o.mat.color.copy(o.base);
        }
        this.glowing[i] = glow;
      }

      const trail = this.trail[i];
      if (trail && f.action === 'attack' && f.moveId === trail && m && f.frame <= lastActiveFrame(m) && cur.hitstop === 0) {
        this.fx.afterimage(M(x), M(y), `#${this.accents[i].getHexString()}`, f.facing);
      }

      const shadow = this.shadows[i];
      const up = Math.min(1, M(y) / 1.4);
      shadow.position.x = M(x);
      shadow.scale.setScalar(1 - up * 0.55);
      (shadow.material as THREE.MeshBasicMaterial).opacity = 1 - up * 0.6;
      pos.push(M(x));
    });
    this.separateTorsos();

    const height = Math.max(...cur.fighters.map((f) => character(f.charId).height)) / 100;
    const target = frame(pos[0], pos[1], height, this.camera.aspect);
    let tx = target.x;
    let td = target.distance;
    let follow = 0.12;
    // the KO zoom toward the loser, and the super zoom toward the user (spec 5.6, 6.11)
    if (this.ko && t - this.ko.from < KO_SLOW.delay + KO_SLOW.length + 0.6) {
      tx = pos[this.ko.loser];
      td = target.distance * 0.72;
      follow = 0.06;
    }
    // close-ups (Dele, 29 Oct): the fighter fills about 70% of the screen height, face readable, on the
    // round intro (P1 first, then P2) and on supers, then the camera eases back to the normal framing
    let tl = target.lookY;
    let close: number | null = null;
    if (cur.phase === 'intro' && cur.phaseFrame < INTRO_FRAMES - CLOSE_EASE_OUT) close = cur.phaseFrame < INTRO_FRAMES / 2 ? 0 : 1;
    const superOn = this.superCam !== null && cur.frame < this.superCam.until;
    if (superOn && this.superCam) close = this.superCam.side;
    if (close !== null) {
      const h = character(cur.fighters[close].charId).height / 100;
      tx = pos[close];
      td = h / CLOSE_SHARE / (2 * Math.tan((FOV * Math.PI) / 360));
      tl = h * 0.56;
      follow = 0.15;
    }
    if (this.camDist === 0) {
      this.camX = tx;
      this.camDist = td;
      this.camLook = tl;
    }
    this.camX += (tx - this.camX) * follow;
    this.camDist += (td - this.camDist) * 0.08;
    this.camLook += (tl - this.camLook) * 0.08;
    let sx = 0;
    let sy = 0;
    if (t < this.shake.until) {
      const k = 1 - (t - this.shake.from) / (this.shake.until - this.shake.from);
      const perPx = (2 * this.camDist * Math.tan((FOV * Math.PI) / 360)) / Math.max(1, this.renderer.domElement.clientHeight);
      sx = (Math.random() * 2 - 1) * this.shake.amp * perPx * k;
      sy = (Math.random() * 2 - 1) * this.shake.amp * perPx * k;
    }
    // the camera sits a little lower than what it looks at, less so close up
    const below = 0.35 * Math.min(1, this.camDist / Math.max(0.01, target.distance));
    this.camera.position.set(this.camX + sx, this.camLook - below + sy, this.camDist);
    this.camera.lookAt(this.camX + sx, this.camLook + sy, 0);
    if (this.inspect) {
      this.camera.position.set(this.inspect.x, this.inspect.y, this.inspect.distance);
      this.camera.lookAt(this.inspect.x, this.inspect.y, 0);
    }

    // supers darken the stage while the world is frozen
    this.dim += ((superOn ? 0.3 : 1) - this.dim) * Math.min(1, dt * 12);
    for (const l of this.lights) l.light.intensity = l.base * this.dim;

    this.fx.update(dt);
    this.drawBoxes(cur, showBoxes);
    this.stage.update(t);
    this.renderer.render(this.scene, this.camera);
  }

  private drawBoxes(s: SimState, show: boolean): void {
    this.boxes.visible = show;
    if (!show) return;
    const posAttr = this.boxes.geometry.getAttribute('position') as THREE.BufferAttribute;
    const colAttr = this.boxes.geometry.getAttribute('color') as THREE.BufferAttribute;
    let n = 0;
    const add = (r: Rect, colour: [number, number, number]): void => {
      if (n >= 16) return;
      const [x1, x2, y1, y2] = [M(r.x1), M(r.x2), M(r.y1), M(r.y2)];
      const pts = [x1, y1, x2, y1, x2, y1, x2, y2, x2, y2, x1, y2, x1, y2, x1, y1];
      for (let k = 0; k < 8; k++) {
        posAttr.setXYZ(n * 8 + k, pts[k * 2], pts[k * 2 + 1], 0);
        colAttr.setXYZ(n * 8 + k, ...colour);
      }
      n++;
    };
    for (const f of s.fighters) {
      const half = character(f.charId).pushWidth / 2;
      add(worldRect(f, { x: -half, y: 0, w: half * 2, h: 30 }), [1, 0.85, 0.2]);
      add(hurtRect(f), [0.3, 0.6, 1]);
      for (const r of liveHitboxes(f)) add(r, [1, 0.2, 0.2]);
    }
    for (let k = n * 8; k < 16 * 8; k++) posAttr.setXYZ(k, 0, 0, 0);
    posAttr.needsUpdate = true;
    colAttr.needsUpdate = true;
  }

  dispose(): void {
    this.renderer.dispose();
    this.renderer.domElement.remove();
    this.flashEl.remove();
  }
}
