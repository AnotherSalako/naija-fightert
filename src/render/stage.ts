// Lagos Market (Night), spec 4.3: a foreground strip of packed earth, a row of stalls (corrugated
// roofs at about 1.5x fighter height, ankara cloth, produce, bare bulbs), bunting and festoon lights
// over the fight, traders who cheer supers and duck big hits, two-storey buildings with lit windows
// and water tanks, electricity poles and a far skyline under a city-glow sky. Every surface is painted
// in code (canvas textures), with no text on any sign. The stage lights also light the fighters.

import * as THREE from 'three';
import { STAGE_HALF_WIDTH, SUB } from '../sim/constants';

export interface StageView {
  group: THREE.Group;
  lanterns: THREE.Mesh[];
  update(t: number): void;
  /** the crowd reacts: cheer (supers, KOs) or duck (heavy hits, wall bounces) */
  react(kind: 'cheer' | 'duck', t: number): void;
}

const M = (subUnits: number): number => subUnits / SUB / 100; // sim sub-units to metres

/** a small seeded random, so the market looks the same every time it loads */
function rng(seed: number): () => number {
  let x = seed >>> 0 || 1;
  return () => {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    return (x >>> 0) / 4294967296;
  };
}

function paint(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void, repeat = false): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d') as CanvasRenderingContext2D);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

function groundTexture(): THREE.CanvasTexture {
  const r = rng(11);
  return paint(512, 512, (g) => {
    g.fillStyle = '#5a3a26';
    g.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 2600; i++) {
      const v = r();
      g.fillStyle = v < 0.5 ? `rgba(40,24,14,${0.15 + r() * 0.25})` : `rgba(150,100,64,${0.08 + r() * 0.18})`;
      g.fillRect(r() * 512, r() * 512, 1 + r() * 4, 1 + r() * 3);
    }
    for (let i = 0; i < 7; i++) {
      // puddles that catch the light
      const x = r() * 512;
      const y = r() * 512;
      const grad = g.createRadialGradient(x, y, 2, x, y, 20 + r() * 30);
      grad.addColorStop(0, 'rgba(70,60,80,0.75)');
      grad.addColorStop(1, 'rgba(70,60,80,0)');
      g.fillStyle = grad;
      g.beginPath();
      g.ellipse(x, y, 30 + r() * 40, 10 + r() * 14, 0, 0, Math.PI * 2);
      g.fill();
    }
    for (let i = 0; i < 40; i++) {
      // bits of litter: bottle tops, nylon, leaves
      g.fillStyle = ['#d9d2c0', '#2f6b3b', '#c9482b', '#e8c23a', '#1d1d1d'][i % 5];
      g.fillRect(r() * 512, r() * 512, 2 + r() * 5, 1 + r() * 3);
    }
  }, true);
}

function corrugatedTexture(): THREE.CanvasTexture {
  const r = rng(23);
  return paint(256, 128, (g) => {
    for (let x = 0; x < 256; x++) {
      const k = 0.65 + 0.35 * Math.sin((x / 256) * Math.PI * 24);
      g.fillStyle = `rgb(${Math.round(150 * k)},${Math.round(150 * k)},${Math.round(150 * k)})`;
      g.fillRect(x, 0, 1, 128);
    }
    for (let i = 0; i < 26; i++) {
      // rust runs down the ridges
      const x = r() * 256;
      const grad = g.createLinearGradient(0, 0, 0, 128);
      grad.addColorStop(0, 'rgba(140,60,20,0.65)');
      grad.addColorStop(1, 'rgba(140,60,20,0)');
      g.fillStyle = grad;
      g.fillRect(x, r() * 30, 3 + r() * 10, 50 + r() * 70);
    }
  }, true);
}

/** a wax-print (ankara) pattern: circles, diamonds or stripes in a three-colour palette */
function ankara(seed: number, palette: string[]): THREE.CanvasTexture {
  const r = rng(seed);
  const kind = seed % 3;
  return paint(128, 128, (g) => {
    g.fillStyle = palette[0];
    g.fillRect(0, 0, 128, 128);
    for (let y = 0; y < 4; y++) {
      for (let x = 0; x < 4; x++) {
        const cx = x * 32 + 16 + (y % 2) * 16;
        const cy = y * 32 + 16;
        g.fillStyle = palette[1 + ((x + y) % 2)];
        g.beginPath();
        if (kind === 0) {
          g.arc(cx, cy, 11, 0, Math.PI * 2);
          g.fill();
          g.fillStyle = palette[0];
          g.beginPath();
          g.arc(cx, cy, 5, 0, Math.PI * 2);
        } else if (kind === 1) {
          g.moveTo(cx, cy - 14);
          g.lineTo(cx + 12, cy);
          g.lineTo(cx, cy + 14);
          g.lineTo(cx - 12, cy);
        } else {
          g.rect(x * 32, cy - 4 + r() * 3, 32, 7);
        }
        g.fill();
      }
    }
  }, true);
}

function wallTexture(seed: number, lit: number): THREE.CanvasTexture {
  const r = rng(seed);
  return paint(256, 256, (g) => {
    g.fillStyle = ['#4a4238', '#3e4450', '#55433a', '#463c48'][seed % 4];
    g.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 30; i++) {
      // damp stains running down the plaster
      g.fillStyle = `rgba(20,16,14,${0.1 + r() * 0.2})`;
      g.fillRect(r() * 256, r() * 256, 4 + r() * 20, 20 + r() * 80);
    }
    for (let row = 0; row < 3; row++) {
      for (let col = 0; col < 4; col++) {
        const x = 22 + col * 60;
        const y = 24 + row * 80;
        const on = r() < lit;
        const grad = g.createLinearGradient(x, y, x, y + 46);
        grad.addColorStop(0, on ? '#ffd890' : '#141820');
        grad.addColorStop(1, on ? '#f0a040' : '#0c0e14');
        g.fillStyle = grad;
        g.fillRect(x, y, 34, 46);
        g.fillStyle = '#1a1612';
        g.fillRect(x + 16, y, 2, 46); // window bars
        g.fillRect(x, y + 22, 34, 2);
        g.fillRect(x - 4, y + 46, 42, 4); // sill
      }
    }
  });
}

function skyTexture(): THREE.CanvasTexture {
  return paint(16, 256, (g) => {
    const grad = g.createLinearGradient(0, 0, 0, 256);
    grad.addColorStop(0, '#07081a');
    grad.addColorStop(0.55, '#1a1440');
    grad.addColorStop(0.8, '#4a2350');
    grad.addColorStop(1, '#b0503a'); // the glow of the city low in the sky
    g.fillStyle = grad;
    g.fillRect(0, 0, 16, 256);
  });
}

function glowTexture(): THREE.CanvasTexture {
  return paint(64, 64, (g) => {
    const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, 'rgba(255,220,150,1)');
    grad.addColorStop(0.25, 'rgba(255,170,80,0.5)');
    grad.addColorStop(1, 'rgba(255,140,60,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
  });
}

/** a billboard with no words: a painted advert of shapes and colour only */
function billboardTexture(): THREE.CanvasTexture {
  return paint(256, 128, (g) => {
    const grad = g.createLinearGradient(0, 0, 256, 0);
    grad.addColorStop(0, '#1f7a4a');
    grad.addColorStop(1, '#e8c23a');
    g.fillStyle = grad;
    g.fillRect(0, 0, 256, 128);
    g.fillStyle = '#f5f1e6';
    g.beginPath();
    g.arc(70, 64, 42, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#c9482b';
    g.fillRect(140, 30, 22, 74);
    g.fillRect(170, 50, 22, 54);
    g.fillRect(200, 40, 22, 64);
    g.fillStyle = '#1d1d1d';
    g.beginPath();
    g.arc(70, 64, 18, 0, Math.PI * 2);
    g.fill();
  });
}

const lambert = (o: THREE.MeshLambertMaterialParameters): THREE.MeshLambertMaterial => new THREE.MeshLambertMaterial(o);

function mesh(geo: THREE.BufferGeometry, mat: THREE.Material | THREE.Material[], x: number, y: number, z: number): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  return m;
}

interface Trader {
  root: THREE.Group;
  armL: THREE.Group;
  armR: THREE.Group;
  base: number;
  phase: number;
}

function buildTrader(r: () => number, wrap: THREE.Material, skin: THREE.Material, head: THREE.Material | null): Trader {
  const root = new THREE.Group();
  const body = mesh(new THREE.CapsuleGeometry(0.2, 0.75, 4, 8), wrap, 0, 0.78, 0);
  body.scale.set(1, 1, 0.75);
  root.add(body);
  root.add(mesh(new THREE.SphereGeometry(0.12, 10, 8), skin, 0, 1.47, 0));
  if (head) {
    // a gele or a cap
    const tie = mesh(new THREE.SphereGeometry(0.15, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), head, 0, 1.53, 0);
    tie.scale.set(1.25, 0.9, 1.1);
    root.add(tie);
  }
  const arm = (side: number): THREE.Group => {
    const g = new THREE.Group();
    g.position.set(0.24 * side, 1.2, 0);
    const a = mesh(new THREE.CapsuleGeometry(0.055, 0.45, 3, 6), skin, 0, -0.26, 0);
    g.add(a);
    g.rotation.z = side * 0.15;
    root.add(g);
    return g;
  };
  return { root, armL: arm(1), armR: arm(-1), base: 0, phase: r() * 10 };
}

export function buildStage(scene: THREE.Scene): StageView {
  const g = new THREE.Group();
  scene.add(g);
  const r = rng(7);
  scene.background = new THREE.Color(0x120e26);
  scene.fog = new THREE.Fog(0x2a1c34, 9, 38); // a warm night haze that softens the far stalls

  // lights: dim cool fill, warm key from the front, accent rim from behind (they light the fighters)
  scene.add(new THREE.HemisphereLight(0x4a5a9a, 0x3a2216, 0.6));
  const key = new THREE.DirectionalLight(0xffd8a8, 1.7);
  key.name = 'key';
  key.position.set(2, 6, 7);
  // real shadows from the key: the fighters on the ground and on themselves (world.ts moves this with the camera)
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  Object.assign(key.shadow.camera, { left: -4, right: 4, top: 4, bottom: -2, near: 1, far: 22 });
  key.shadow.bias = -0.0006;
  key.shadow.normalBias = 0.025;
  key.shadow.radius = 4;
  scene.add(key);
  scene.add(key.target);
  const rim = new THREE.DirectionalLight(0xff8a3a, 1.5);
  rim.position.set(-3, 4, -6);
  scene.add(rim);

  // sky and the far city
  const sky = mesh(new THREE.PlaneGeometry(140, 40), new THREE.MeshBasicMaterial({ map: skyTexture(), fog: false }), 0, 14, -42);
  g.add(sky);
  const farMat = new THREE.MeshBasicMaterial({ color: 0x0d0b1c, fog: false });
  const dotMat = new THREE.MeshBasicMaterial({ color: 0xffc070, fog: false });
  for (let i = 0; i < 34; i++) {
    const w = 2 + r() * 3;
    const h = 4 + r() * 12;
    const x = -60 + i * 3.6 + r() * 2;
    g.add(mesh(new THREE.BoxGeometry(w, h, 1), farMat, x, h / 2 - 1, -38));
    for (let k = 0; k < 6; k++) if (r() < 0.5) g.add(mesh(new THREE.PlaneGeometry(0.25, 0.3), dotMat, x - w / 2 + 0.4 + r() * (w - 0.8), 1 + r() * (h - 2), -37.4));
  }

  // ground: packed earth, wet in places
  const groundTex = groundTexture();
  groundTex.repeat.set(10, 5);
  // wet packed earth: a glossy standard material, so the soft environment light and the lanterns shine on it
  const ground = mesh(new THREE.PlaneGeometry(80, 40), new THREE.MeshStandardMaterial({ map: groundTex, roughness: 0.42, metalness: 0.15 }), 0, 0, -10);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  g.add(ground);
  const kerb = mesh(new THREE.BoxGeometry(40, 0.18, 0.4), lambert({ color: 0x6a6258 }), 0, 0.09, -2.0);
  g.add(kerb);

  // buildings behind the market road
  const roof = corrugatedTexture();
  for (let i = 0; i < 9; i++) {
    const w = 5 + r() * 2;
    const h = 6 + r() * 3;
    const x = -24 + i * 6.2;
    const z = -11 - r() * 2;
    const wall = wallTexture(31 + i, 0.3);
    // night: the walls only catch spill light; their lit windows glow on their own
    const b = mesh(new THREE.BoxGeometry(w, h, 4), lambert({ map: wall, color: 0x3a3a48, emissive: 0xffffff, emissiveMap: wall, emissiveIntensity: 0.22 }), x, h / 2, z);
    g.add(b);
    g.add(mesh(new THREE.BoxGeometry(w + 0.4, 0.2, 1.2), lambert({ color: 0x2a221c }), x, h * 0.45, z + 2.4)); // balcony
    if (r() < 0.7) {
      // water tank on the roof
      g.add(mesh(new THREE.CylinderGeometry(0.6, 0.6, 1.2, 12), lambert({ color: r() < 0.5 ? 0x1f2f6a : 0x2b2b2b }), x + (r() - 0.5) * 2, h + 0.6, z));
    }
  }
  const board = mesh(new THREE.PlaneGeometry(6, 3), new THREE.MeshBasicMaterial({ map: billboardTexture() }), 7, 9.5, -12.5);
  g.add(board);
  g.add(mesh(new THREE.BoxGeometry(0.2, 8, 0.2), lambert({ color: 0x222222 }), 7, 4, -12.6));

  // electricity poles with sagging wires (a Lagos street at night)
  const poleMat = lambert({ color: 0x2a1f16 });
  const wireMat = new THREE.LineBasicMaterial({ color: 0x0a0a0a });
  const poles = [-16, -6, 4, 14];
  for (const x of poles) g.add(mesh(new THREE.CylinderGeometry(0.1, 0.13, 8, 6), poleMat, x, 4, -7.5));
  for (let i = 0; i < poles.length - 1; i++) {
    for (const dy of [0, 0.35, 0.7]) {
      const pts: THREE.Vector3[] = [];
      for (let k = 0; k <= 16; k++) {
        const t = k / 16;
        pts.push(new THREE.Vector3(poles[i] + (poles[i + 1] - poles[i]) * t, 7.6 - dy - Math.sin(t * Math.PI) * 0.9, -7.5));
      }
      g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), wireMat));
    }
  }
  // palms
  for (const x of [-19, 11.5, 20]) {
    g.add(mesh(new THREE.CylinderGeometry(0.15, 0.22, 7, 6), poleMat, x, 3.5, -9));
    for (let k = 0; k < 7; k++) {
      const leaf = mesh(new THREE.ConeGeometry(0.35, 2.6, 4), lambert({ color: 0x1d3a22 }), x, 7, -9);
      leaf.rotation.set(0.2, (k / 7) * Math.PI * 2, 1.9);
      leaf.translateY(1.1);
      g.add(leaf);
    }
  }

  // the stalls: corrugated roofs at 2.7 m (1.5x a fighter), ankara on the counters, produce, bulbs
  const palettes = [['#1f3a8a', '#e8c23a', '#c9482b'], ['#2f6b3b', '#f2e6c8', '#d96b2b'], ['#7a2f4a', '#e8a02a', '#2b9a9a'],
    ['#c9482b', '#1d1d1d', '#e8c23a'], ['#2b3a8a', '#d9d2c0', '#d9482b']];
  const roofTints = [0xb8b0a4, 0x8a7a6a, 0xa86a4a, 0x9aa0a8];
  const glow = glowTexture();
  const lanterns: THREE.Mesh[] = [];
  const bulbs: THREE.Sprite[] = [];
  const wood = lambert({ color: 0x4a3220 });
  const produceMats = [lambert({ color: 0xd9381e }), lambert({ color: 0xe88a1e }), lambert({ color: 0x3f7a2a }), lambert({ color: 0xd9b23a }), lambert({ color: 0x7a2a5a })];
  const basketMat = lambert({ color: 0xa8824a });
  const yamMat = lambert({ color: 0x6a4a30 });
  const stallXs: number[] = [];
  for (let i = 0; i < 9; i++) {
    const x = -11 + i * 2.75;
    stallXs.push(x);
    const z = -3.6 - (i % 2) * 0.45;
    const s = new THREE.Group();
    s.position.set(x, 0, z);
    for (const px of [-1.1, 1.1]) for (const pz of [-0.5, 0.55]) s.add(mesh(new THREE.BoxGeometry(0.09, 2.75, 0.09), wood, px, 1.375, pz));
    const cloth = ankara(40 + i, palettes[i % palettes.length]);
    cloth.repeat.set(3, 1);
    // the cloth is muted a little so the fighters stay the brightest thing on screen
    const counter = mesh(new THREE.BoxGeometry(2.3, 0.95, 1.0), [wood, wood, wood, wood, lambert({ map: cloth, color: 0x9a9088 }), wood], 0, 0.475, 0);
    s.add(counter);
    const rf = mesh(new THREE.BoxGeometry(2.7, 0.05, 1.7), lambert({ map: roof, color: roofTints[i % roofTints.length] }), 0, 2.78, 0.1);
    rf.rotation.x = -0.16;
    s.add(rf);
    // produce: tomato and pepper pyramids, baskets, yams
    for (let k = 0; k < 4; k++) {
      const kind = (i + k) % 4;
      const px = -0.82 + k * 0.55;
      if (kind === 3) {
        for (let n = 0; n < 4; n++) {
          const yam = mesh(new THREE.CapsuleGeometry(0.06, 0.3, 3, 6), yamMat, px + (n % 2) * 0.12 - 0.06, 1.0 + Math.floor(n / 2) * 0.1, 0.1 + (n % 2) * 0.05);
          yam.rotation.z = Math.PI / 2;
          s.add(yam);
        }
      } else {
        const bowl = mesh(new THREE.CylinderGeometry(0.2, 0.15, 0.12, 10), kind === 2 ? basketMat : lambert({ color: 0x8a8a8a }), px, 1.01, 0.12);
        s.add(bowl);
        const mat = produceMats[(i + k) % produceMats.length];
        for (let n = 0; n < 6; n++) {
          const a = (n / 5) * Math.PI * 2;
          const rr = n === 5 ? 0 : 0.09;
          s.add(mesh(new THREE.SphereGeometry(0.055, 7, 5), mat, px + Math.cos(a) * rr, 1.1 + (n === 5 ? 0.07 : 0), 0.12 + Math.sin(a) * rr));
        }
      }
    }
    // hanging fabric on some stalls
    if (i % 3 === 1) {
      const f = ankara(70 + i, palettes[(i + 2) % palettes.length]);
      const fab = mesh(new THREE.PlaneGeometry(0.7, 1.3), lambert({ map: f, color: 0x9a9088, side: THREE.DoubleSide }), -0.7, 1.95, -0.45);
      s.add(fab);
      s.add(mesh(new THREE.PlaneGeometry(0.7, 1.1), lambert({ map: ankara(90 + i, palettes[i % palettes.length]), color: 0x9a9088, side: THREE.DoubleSide }), 0.1, 2.05, -0.46));
    }
    // a bare bulb under the roof
    const bulb = mesh(new THREE.SphereGeometry(0.06, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffe0a0 }), 0, 2.45, 0.35);
    s.add(bulb);
    lanterns.push(bulb);
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    sp.scale.setScalar(1.1);
    sp.position.set(0, 2.45, 0.36);
    s.add(sp);
    bulbs.push(sp);
    // plastic stools out front
    if (i % 2 === 0) s.add(mesh(new THREE.CylinderGeometry(0.17, 0.2, 0.42, 10), lambert({ color: [0x2a6ad9, 0xd92a2a, 0xe8e2d6][i % 3] }), 1.0, 0.21, 0.8));
    g.add(s);
  }

  // big market umbrellas at the ends of the row
  for (const [x, z, a, b] of [[-12.6, -2.6, 0xc9482b, 0xf2e6c8], [12.4, -2.8, 0x2b3a8a, 0xe8c23a], [-7.2, -5.5, 0x2f6b3b, 0xf2e6c8]] as const) {
    const stripes = paint(256, 32, (c) => {
      for (let k = 0; k < 8; k++) {
        c.fillStyle = `#${(k % 2 ? b : a).toString(16).padStart(6, '0')}`;
        c.fillRect(k * 32, 0, 32, 32);
      }
    });
    g.add(mesh(new THREE.CylinderGeometry(0.03, 0.03, 2.7, 6), lambert({ color: 0xcccccc }), x, 1.35, z));
    g.add(mesh(new THREE.ConeGeometry(1.5, 0.6, 16, 1, true), lambert({ map: stripes, side: THREE.DoubleSide }), x, 2.75, z));
  }

  // traders behind the counters and a few shoppers at the sides
  const skins = [0x5a3420, 0x6b3f25, 0x4a2a18, 0x7a4a2c].map((c) => lambert({ color: c }));
  const traders: Trader[] = [];
  for (let i = 0; i < 9; i++) {
    for (const off of i % 2 ? [0.3] : [-0.45, 0.5]) {
      const pal = palettes[(i + traders.length) % palettes.length];
      const wrap = lambert({ map: ankara(120 + traders.length, pal) });
      const head = r() < 0.6 ? lambert({ color: pal[2] }) : null;
      const t = buildTrader(r, wrap, skins[traders.length % skins.length], head);
      t.root.position.set(stallXs[i] + off, 0, -4.35 - (i % 2) * 0.45);
      t.root.rotation.y = (r() - 0.5) * 0.6;
      t.root.scale.setScalar(0.92 + r() * 0.12);
      g.add(t.root);
      traders.push(t);
    }
  }
  for (const x of [-10.4, -9.6, 9.8, 10.7]) {
    const pal = palettes[Math.floor(r() * palettes.length)];
    const t = buildTrader(r, lambert({ map: ankara(200 + Math.round(x), pal) }), skins[Math.floor(r() * 4)], r() < 0.5 ? lambert({ color: pal[1] }) : null);
    t.root.position.set(x, 0, -1.6 - r() * 0.3);
    t.root.rotation.y = x < 0 ? 0.7 : -0.7;
    g.add(t.root);
    traders.push(t);
  }

  // bunting and festoon lights across the fight, above head height
  const flagColours = [0x2f8a3b, 0xf2efe6, 0xc9482b, 0xe8c23a, 0x2b3a8a];
  const flags: THREE.Mesh[] = [];
  const festoon: THREE.Sprite[] = [];
  const flagGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-0.13, 0, 0), new THREE.Vector3(0.13, 0, 0), new THREE.Vector3(0, -0.3, 0)]);
  flagGeo.computeVertexNormals();
  for (const [z, y0] of [[-1.3, 3.9], [-2.4, 3.6]] as const) {
    const pts: THREE.Vector3[] = [];
    for (let k = 0; k <= 60; k++) {
      const t = k / 60;
      const x = -13 + 26 * t;
      const y = y0 - Math.sin((t * 4 % 1) * Math.PI) * 0.35;
      pts.push(new THREE.Vector3(x, y, z));
      if (k % 2 === 0 && k < 60) {
        const f = mesh(flagGeo, lambert({ color: flagColours[(k / 2) % flagColours.length], side: THREE.DoubleSide }), x, y, z);
        g.add(f);
        flags.push(f);
      }
      if (k % 5 === 2 && z < -2) {
        const b = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
        b.position.set(x, y - 0.05, z);
        b.scale.setScalar(0.55);
        g.add(b);
        festoon.push(b);
      }
    }
    g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), wireMat));
  }

  // boundary posts at the walls, with sacks
  for (const sx of [-1, 1]) {
    const x = sx * (M(STAGE_HALF_WIDTH) + 0.4);
    g.add(mesh(new THREE.BoxGeometry(0.16, 2.2, 0.16), poleMat, x, 1.1, -0.4));
    for (let k = 0; k < 3; k++) {
      const sack = mesh(new THREE.SphereGeometry(0.32, 8, 6), lambert({ color: 0xc8b48a }), x + sx * 0.5, 0.26 + (k === 2 ? 0.42 : 0), -0.6 + (k % 2) * 0.55);
      sack.scale.set(1, 0.8, 0.9);
      g.add(sack);
    }
  }

  // an okada passing on the road behind the stalls, headlight first
  const okada = new THREE.Group();
  okada.add(mesh(new THREE.BoxGeometry(1.4, 0.5, 0.3), lambert({ color: 0x1a1a1a }), 0, 0.55, 0));
  okada.add(mesh(new THREE.SphereGeometry(0.22, 8, 6), lambert({ color: 0x3a2a20 }), -0.1, 1.25, 0));
  okada.add(mesh(new THREE.CapsuleGeometry(0.18, 0.5, 3, 6), lambert({ color: 0xc9482b }), -0.1, 0.95, 0));
  const lamp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, color: 0xfff4d8 }));
  lamp.scale.setScalar(1.6);
  lamp.position.set(0.75, 0.75, 0.1);
  okada.add(lamp);
  okada.position.set(-30, 0, -6.4);
  g.add(okada);

  // two real warm lights for pools on the fighters' strip
  for (const x of [-3.5, 3.5]) {
    const light = new THREE.PointLight(0xffa24a, 2.4, 10, 1.6);
    light.position.set(x, 3.1, -1.6);
    g.add(light);
  }

  let cheerUntil = 0;
  let duckUntil = 0;
  return {
    group: g,
    lanterns,
    react(kind, t) {
      if (kind === 'cheer') cheerUntil = t + 1.6;
      else duckUntil = t + 0.5;
    },
    update(t) {
      bulbs.forEach((b, i) => {
        // bulbs swing a little on their wires and flicker now and then (generator power)
        b.position.x = Math.sin(t * 1.4 + i) * 0.04;
        b.material.opacity = 0.85 + 0.15 * Math.sin(t * 13 + i * 2.1) * (Math.sin(t * 0.7 + i) > 0.95 ? 1 : 0.2);
        lanterns[i].position.x = b.position.x;
      });
      festoon.forEach((b, i) => { b.material.opacity = 0.8 + 0.2 * Math.sin(t * 2 + i); });
      flags.forEach((f, i) => { f.rotation.x = Math.sin(t * 2.2 + i * 0.7) * 0.35; });
      const cheering = t < cheerUntil;
      const ducking = t < duckUntil;
      for (const tr of traders) {
        const sway = Math.sin(t * 1.2 + tr.phase);
        tr.root.position.y = cheering ? Math.abs(Math.sin(t * 9 + tr.phase)) * 0.12 : 0;
        tr.root.scale.y = ducking ? 0.82 : tr.root.scale.x;
        tr.root.rotation.z = sway * 0.03;
        tr.armL.rotation.z = cheering ? 2.6 + Math.sin(t * 10 + tr.phase) * 0.3 : 0.15 + sway * 0.05;
        tr.armR.rotation.z = cheering ? -2.6 - Math.sin(t * 10 + tr.phase) * 0.3 : -0.15 - sway * 0.05;
      }
      const lap = (t % 11) / 11;
      okada.position.x = -30 + lap * 60;
    },
  };
}
