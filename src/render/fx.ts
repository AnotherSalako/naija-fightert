// Visual effects (spec 4.5, 5.3): hit sparks by strength, the blue-white block shield, red-orange
// counter-hit sparks, dust, and each special's own effect (after-images, tickets, coins, the door
// slam, the Last Stop bus). A fixed pool of sprites, reused, so effects never allocate mid-fight.
// Renderer only: randomness here is fine because nothing here feeds back into the sim.

import * as THREE from 'three';

type Tex = 'star' | 'soft' | 'ring' | 'shield' | 'rect' | 'streak';

function canvasTexture(draw: (g: CanvasRenderingContext2D, s: number) => void): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  draw(c.getContext('2d') as CanvasRenderingContext2D, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function textures(): Record<Tex, THREE.Texture> {
  return {
    star: canvasTexture((g, s) => {
      g.translate(s / 2, s / 2);
      g.fillStyle = '#fff';
      for (let i = 0; i < 8; i++) {
        g.rotate(Math.PI / 4);
        g.beginPath();
        g.moveTo(0, -3);
        g.lineTo(i % 2 ? 18 : 30, 0);
        g.lineTo(0, 3);
        g.fill();
      }
      const r = g.createRadialGradient(0, 0, 0, 0, 0, 12);
      r.addColorStop(0, '#fff');
      r.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = r;
      g.fillRect(-12, -12, 24, 24);
    }),
    soft: canvasTexture((g, s) => {
      const r = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
      r.addColorStop(0, 'rgba(255,255,255,1)');
      r.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = r;
      g.fillRect(0, 0, s, s);
    }),
    ring: canvasTexture((g, s) => {
      g.strokeStyle = '#fff';
      g.lineWidth = 5;
      g.beginPath();
      g.arc(s / 2, s / 2, s / 2 - 5, 0, Math.PI * 2);
      g.stroke();
    }),
    shield: canvasTexture((g, s) => {
      g.translate(s / 2, s / 2);
      g.strokeStyle = '#fff';
      g.fillStyle = 'rgba(255,255,255,0.25)';
      g.lineWidth = 4;
      g.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
        g.lineTo(Math.cos(a) * 27, Math.sin(a) * 27);
      }
      g.closePath();
      g.fill();
      g.stroke();
    }),
    rect: canvasTexture((g, s) => {
      g.fillStyle = '#fff';
      g.fillRect(s * 0.2, s * 0.32, s * 0.6, s * 0.36);
    }),
    streak: canvasTexture((g, s) => {
      const r = g.createLinearGradient(0, 0, s, 0);
      r.addColorStop(0, 'rgba(255,255,255,0)');
      r.addColorStop(1, 'rgba(255,255,255,1)');
      g.fillStyle = r;
      g.fillRect(0, s * 0.3, s, s * 0.4);
    }),
  };
}

interface Particle {
  sprite: THREE.Sprite;
  vx: number;
  vy: number;
  gravity: number;
  age: number;
  life: number;
  size0: number;
  size1: number;
  alpha0: number;
  spin: number;
}

interface EmitOptions {
  colour: string;
  size: number;
  size1?: number;
  life: number;
  vx?: number;
  vy?: number;
  gravity?: number;
  alpha?: number;
  spin?: number;
  additive?: boolean;
  rot?: number;
}

const STRENGTH_SIZE: Record<string, number> = { light: 0.38, medium: 0.52, heavy: 0.7, special: 0.75, super: 0.62 };

export class Fx {
  private readonly tex = textures();
  private readonly pool: Particle[] = [];
  private next = 0;
  private bus: THREE.Group | null = null;
  private busAge = -1;
  private busX = 0;

  constructor(private readonly scene: THREE.Scene, size = 160) {
    for (let i = 0; i < size; i++) {
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
      sprite.visible = false;
      sprite.renderOrder = 5;
      scene.add(sprite);
      this.pool.push({ sprite, vx: 0, vy: 0, gravity: 0, age: 0, life: 0, size0: 0, size1: 0, alpha0: 1, spin: 0 });
    }
  }

  private emit(tex: Tex, x: number, y: number, z: number, o: EmitOptions): void {
    const p = this.pool[this.next];
    this.next = (this.next + 1) % this.pool.length;
    const mat = p.sprite.material;
    mat.map = this.tex[tex];
    mat.color.set(o.colour);
    mat.blending = o.additive === false ? THREE.NormalBlending : THREE.AdditiveBlending;
    mat.rotation = o.rot ?? 0;
    mat.opacity = o.alpha ?? 1;
    mat.needsUpdate = true;
    p.sprite.position.set(x, y, z);
    p.sprite.scale.setScalar(o.size);
    p.sprite.visible = true;
    p.vx = o.vx ?? 0;
    p.vy = o.vy ?? 0;
    p.gravity = o.gravity ?? 0;
    p.age = 0;
    p.life = o.life;
    p.size0 = o.size;
    p.size1 = o.size1 ?? o.size;
    p.alpha0 = o.alpha ?? 1;
    p.spin = o.spin ?? 0;
  }

  /** A hit spark at the contact point. `dir` is the attacker's facing (1 or -1). */
  hit(x: number, y: number, strength: string, dir: number, counter: boolean): void {
    const base = (STRENGTH_SIZE[strength] ?? 0.5) * (counter ? 1.4 : 1);
    const colour = counter ? '#ff6a2a' : '#ffe9a8';
    this.emit('star', x, y, 0.4, { colour, size: base * 0.6, size1: base * 1.25, life: 0.16, rot: Math.random() * Math.PI });
    this.emit('soft', x, y, 0.38, { colour: counter ? '#ff3a1a' : '#fff6d8', size: base * 1.1, size1: base * 0.3, life: 0.12, alpha: 0.8 });
    if (counter) this.emit('ring', x, y, 0.39, { colour: '#ff5a1a', size: 0.2, size1: base * 2, life: 0.22 });
    const n = strength === 'light' ? 5 : 9;
    for (let i = 0; i < n; i++) {
      const a = (Math.random() - 0.5) * 1.6;
      const sp = 3 + Math.random() * 4;
      this.emit('soft', x, y, 0.4, { colour, size: 0.07, size1: 0.02, life: 0.2 + Math.random() * 0.1, vx: Math.cos(a) * sp * dir, vy: Math.sin(a) * sp + 1, gravity: -9 });
    }
  }

  block(x: number, y: number, dir: number): void {
    this.emit('shield', x - dir * 0.05, y, 0.4, { colour: '#bfe4ff', size: 0.35, size1: 0.6, life: 0.2 });
    this.emit('soft', x, y, 0.38, { colour: '#8fd0ff', size: 0.5, size1: 0.2, life: 0.12, alpha: 0.7 });
  }

  dust(x: number, count = 6, colour = '#b8a48a', spread = 1): void {
    for (let i = 0; i < count; i++) {
      this.emit('soft', x + (Math.random() - 0.5) * 0.3, 0.05, 0.2, {
        colour, size: 0.18, size1: 0.45, life: 0.45 + Math.random() * 0.2, vx: (Math.random() - 0.5) * 2 * spread, vy: 0.4 + Math.random() * 0.6,
        alpha: 0.55, additive: false,
      });
    }
  }

  ring(x: number, y: number, colour: string, size = 1.4, life = 0.3): void {
    this.emit('ring', x, y, 0.3, { colour, size: 0.2, size1: size, life });
    this.emit('soft', x, y, 0.28, { colour, size: size * 0.8, size1: size * 0.2, life: life * 0.8, alpha: 0.6 });
  }

  /** A faint copy trailing a fast move (Park Rush). */
  afterimage(x: number, y: number, colour: string, dir: number): void {
    this.emit('streak', x - dir * 0.3, y + 1.0, -0.1, { colour, size: 1.1, size1: 0.9, life: 0.18, alpha: 0.35, rot: dir > 0 ? 0 : Math.PI });
    this.emit('soft', x, y + 0.95, -0.12, { colour, size: 0.9, size1: 0.6, life: 0.14, alpha: 0.18 });
  }

  /** Bits of paper, coins or notes thrown into the air. */
  confetti(x: number, y: number, colours: string[], count: number, dir: number): void {
    for (let i = 0; i < count; i++) {
      this.emit('rect', x, y, 0.35, {
        colour: colours[i % colours.length], size: 0.12, life: 0.7 + Math.random() * 0.4, additive: false,
        vx: dir * (0.5 + Math.random() * 2.5), vy: 2 + Math.random() * 3, gravity: -7, spin: (Math.random() - 0.5) * 14, rot: Math.random() * 3,
      });
    }
  }

  flash(x: number, y: number, colour = '#ffffff', size = 2.2): void {
    this.emit('soft', x, y, 0.5, { colour, size, size1: size * 1.3, life: 0.14, alpha: 0.9 });
  }

  /** Last Stop: a danfo bus with its headlights on drives across the screen. */
  busCrash(x: number): void {
    if (!this.bus) {
      const g = new THREE.Group();
      const body = new THREE.Mesh(new THREE.BoxGeometry(4.2, 2.0, 1.6), new THREE.MeshBasicMaterial({ color: '#f2c12e' }));
      body.position.y = 1.3;
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(4.22, 0.18, 1.62), new THREE.MeshBasicMaterial({ color: '#161616' }));
      stripe.position.y = 1.1;
      const glass = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.6, 1.64), new THREE.MeshBasicMaterial({ color: '#2b3a44' }));
      glass.position.y = 1.85;
      g.add(body, stripe, glass);
      for (const z of [-0.55, 0.55]) {
        const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), new THREE.MeshBasicMaterial({ color: '#fffbe0' }));
        lamp.position.set(2.12, 0.75, z);
        g.add(lamp);
      }
      this.scene.add(g);
      this.bus = g;
    }
    this.busX = x;
    this.bus.position.set(x - 9, 0, 0.9);
    this.bus.visible = true;
    this.busAge = 0;
  }

  update(dt: number): void {
    for (const p of this.pool) {
      if (!p.sprite.visible) continue;
      p.age += dt;
      const k = p.age / p.life;
      if (k >= 1) { p.sprite.visible = false; continue; }
      p.vy += p.gravity * dt;
      p.sprite.position.x += p.vx * dt;
      p.sprite.position.y += p.vy * dt;
      p.sprite.scale.setScalar(p.size0 + (p.size1 - p.size0) * k);
      const m = p.sprite.material;
      m.opacity = p.alpha0 * (1 - k * k);
      m.rotation += p.spin * dt;
    }
    if (this.bus && this.busAge >= 0) {
      this.busAge += dt;
      this.bus.position.x = this.busX - 9 + this.busAge * 18;
      if (this.busAge > 1.1) { this.bus.visible = false; this.busAge = -1; }
    }
  }
}
