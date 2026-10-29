// The fighters' look (spec 4.2, pushed toward Ultra Street Fighter IV at Dele's request): a hybrid of
// the material's own PBR shading (normal map, roughness, the stage's lights) and toon bands that the
// fighters light themselves, so they read brighter than the night stage however the stage is lit.
//   - three hard bands (light / mid / shadow) from a strong cool-white key light at the upper front, on
//     the side the fighter faces;
//   - a bright rim light from behind, warm on one side and cool on the other;
//   - ink: the outer outline is the shell in skinned.ts; inner lines come from internal silhouettes
//     (where the surface turns edge-on: an arm's edge over the chest) and from creases in the normal map
//     (muscle edges, fingers, cloth folds), measured per metre so they hold at any zoom;
//   - a faint painterly grain in the shadow band.
// Every number is a shared uniform: change SF4 (window.__nf.sf4 in dev) and every fighter follows.

import * as THREE from 'three';

export const SF4 = {
  /** N·L where shadow turns to mid, and mid to light */
  uBands: { value: new THREE.Vector2(0.02, 0.45) },
  /** brightness of the shadow, mid and light bands */
  uLevels: { value: new THREE.Vector3(0.38, 0.7, 1.0) },
  uKeyColor: { value: new THREE.Color(1.0, 1.02, 1.1) },
  uKeyStrength: { value: 1.45 },
  uAmbient: { value: 0.16 },
  uRim: { value: 1.2 },
  uRimPower: { value: 3.0 },
  uRimWarm: { value: new THREE.Color('#ffb36b') },
  uRimCool: { value: new THREE.Color('#86c4ff') },
  /** inner silhouette lines: N·V below this is inked (thicker as it rises) */
  uLine: { value: 0.16 },
  /** crease lines: normal-map curvature (per metre) above this is inked */
  uCrease: { value: 55.0 },
  uInk: { value: 0.85 },
  uInkColor: { value: new THREE.Color('#1a0f0a') },
  /** grain in the shadow band */
  uNoise: { value: 0.1 },
  /** share of the toon bands over the PBR shading: 1 toon, 0.5 hybrid, 0 PBR (Dele, 29 Oct: hybrid) */
  uToonMix: { value: 0.5 },
};

/** the looks to compare in dev (F3 cycles them): toon bands, the hybrid, plain PBR */
export const LOOKS = { hybrid: 0.5, toon: 1, pbr: 0 } as const;
export type Look = keyof typeof LOOKS;
export function setLook(look: Look): void {
  SF4.uToonMix.value = LOOKS[look];
}

const PARS = /* glsl */ `
uniform vec2 uBands;
uniform vec3 uLevels;
uniform vec3 uKeyColor;
uniform float uKeyStrength;
uniform float uAmbient;
uniform float uRim;
uniform float uRimPower;
uniform vec3 uRimWarm;
uniform vec3 uRimCool;
uniform float uLine;
uniform float uCrease;
uniform float uInk;
uniform vec3 uInkColor;
uniform float uNoise;
uniform float uToonMix;
uniform float uSide;
float sf4Hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
`;

const SHADE = /* glsl */ `
{
  vec3 N = normalize(normal);
  vec3 V = normalize(vViewPosition);
  vec3 L = normalize(vec3(uSide * 0.6, 0.65, 0.5));
  float ndl = dot(N, L);
  float band = ndl < uBands.x ? uLevels.x : (ndl < uBands.y ? uLevels.y : uLevels.z);
  #ifdef USE_MAP
    vec2 grainAt = floor(vMapUv * 1024.0);
  #else
    vec2 grainAt = floor(gl_FragCoord.xy * 0.5);
  #endif
  if (ndl < uBands.x) band *= 1.0 + (sf4Hash(grainAt) - 0.5) * uNoise;
  vec3 col = diffuseColor.rgb * (uAmbient + band * uKeyStrength * uKeyColor);
  float ndv = clamp(dot(N, V), 0.0, 1.0);
  vec3 rimColor = N.x * uSide < 0.0 ? uRimWarm : uRimCool;
  col += rimColor * pow(1.0 - ndv, uRimPower) * uRim * (0.4 + 0.6 * diffuseColor.rgb);
  float edgeOn = dot(normalize(vNormal), V);
  float contour = 1.0 - smoothstep(uLine, uLine + 0.08, edgeOn);
  float curve = length(fwidth(N)) / max(length(fwidth(vViewPosition)), 1e-4);
  float crease = smoothstep(uCrease, uCrease * 1.8, curve);
  // the toon bands over the material's own (PBR) shading, then the inner ink (none in plain PBR)
  vec3 lit = mix(outgoingLight - totalEmissiveRadiance, col, uToonMix);
  lit = mix(lit, uInkColor, max(contour, crease) * uInk * step(0.01, uToonMix));
  outgoingLight = lit + totalEmissiveRadiance;
}
#include <opaque_fragment>`;

/**
 * Give a lit material (MeshStandardMaterial for the hybrid) the SF4 look, on top of whatever
 * onBeforeCompile it already has (the P2 colour swap). Returns the per-fighter uniform `uSide`: +1 when
 * the fighter faces right, -1 left.
 */
export function applySf4(mat: THREE.MeshStandardMaterial | THREE.MeshToonMaterial): { value: number } {
  const side = { value: 1 };
  const before = mat.onBeforeCompile.bind(mat);
  const key = mat.customProgramCacheKey.bind(mat);
  mat.onBeforeCompile = (shader, renderer) => {
    before(shader, renderer);
    Object.assign(shader.uniforms, SF4, { uSide: side });
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${PARS}`)
      .replace('#include <opaque_fragment>', SHADE);
  };
  mat.customProgramCacheKey = () => `sf4-${key()}`;
  return side;
}
