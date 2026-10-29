# Changelog

## Fix pass from the rdr1fx9fo playtest (29 Oct 2026)

- Floor: the grounded clamp follows skinned vertices (the soles plus a sample of the whole body), so in
  every action the lowest point sits on the floor (measured 2-5 mm above it in every clip and in idle,
  walk, crouch, 2L, 2M, 2H, 6M, 22H, knockdown and get-up).
- Arms: an additive arm-clearance pass on every clip and pose: upper arms turn out (per character,
  `armClearance` in `src/render/animsets/egbon-razak.json`; Egbon 10 degrees), and any hand still inside
  the torso is swung straight out from the spine.
- The dark patch between Egbon's legs was shadow baked into the colour map; `prepare_character.py` now
  refills the dark crotch / inner-thigh texels from the trouser print around them.
- Clips are a data table (`src/render/animsets/*.json`): each state and move lists clips in order of
  preference and the first the model has plays, so the coming Mixamo clips (block, uppercut, sweep, dash,
  throw, thrown, fall-flat, get-up, air-hit, shoulder charge ...) drop in with no code change. Air hits are
  the hit reaction tipped back 35 degrees, knockdowns hold the knockdown clip lying flat (its lowest
  moment, now in the manifest), 2H and 623 are the hook aimed upward until an uppercut clip arrives.
- Launchers (2H, 623): about 140 px and 45 frames in the air, nearly straight up; one juggle follow-up
  (623L, 236L, j.H), then the juggle limit flips the opponent out. Launches end in a hard knockdown of 45
  frames, after a floor bounce (about 15 px), a slide, dust and a camera shake by strength.
- Jumps hang a little at the apex (gravity halved while nearly still); total airtime still follows the data.
- The CPU ends a combo in a super more often (60%); a 3-match CPU test checks at least one super per round.

## Feel pass and model fidelity (29 Oct 2026)

- Wahala: H and S within 3 frames in either order is Wahala, never 5H; a normal started in those 3
  frames is cancelled into it (EX specials that use S still come out).
- Meter gains doubled (hit 40, blocked 20, taking a hit 15, blocking 10, special 10); Normal CPU mirror
  matches now average 1.1 supers per round (37 in 33 rounds), and the CPU can end a 3-hit combo in a super.
- Frame data: moves may state `onHit` like `onBlock`; Egbon's 5H is +2 on hit. Measured in the sim:
  hit-stop is already the spec table (8/11/14 hit, 5/8/11 block, +4 counter), 5L is +2 on block and
  the jump is 40 frames in the air.
- Push boxes are enforced every frame, throws included; a round's end stops all walking.
- CPU Normal: slower reactions (22f), Park Rush a third as often, pauses in pressure, pokes from too far,
  more blocking mistakes. Hard and Boss unchanged (their choices and rolls are identical).
- Fighters: hybrid shading (MeshStandardMaterial with the normal map, 50% toon bands, ink kept); F3 in dev
  cycles hybrid / toon / PBR. Both faces drawn (open mesh edges no longer look like holes). Skin weights
  limited to 4 per vertex and renormalised (some had 6). A grounded foot clamp keeps the lowest foot (or
  the body, lying down) on the floor every frame; the procedural poses only drive the skeleton when no
  clip plays. The Mixamo export carries no roughness map, so roughness is a flat 0.8.

## Playtest fixes and the SF4 detail pass (29 Oct 2026)

- Close contact: the sim keeps push boxes apart, but a model reaches past its box, so after posing the
  renderer eases the two models apart until their torsos are 38 cm apart (`separateTorsos`, render only:
  frame data and replays are untouched). 22H, throws and point-blank hooks no longer merge the bodies.
- Win screen: mirror matches say "P1 WINS" / "P2 WINS" / "CPU WINS"; the title and "Enter: rematch" now
  stack, so a title that wraps pushes the line down.
- Full-detail Egbon: 50,000 triangles (no decimation), 2048 colour and normal maps, WebP textures and
  Draco geometry (three.js's own WebAssembly decoder, emitted by the build): 1.75 MB.
- `src/render/sf4.ts`: the fighters light themselves (so they stay brighter than the stage): three hard
  bands from a cool-white key at the upper front on the side they face, a warm/cool rim from behind, inner
  ink lines from internal silhouettes and normal-map creases, grain in the shadows. All tweakable live
  (`window.__nf.sf4` in dev). ACES tone mapping, exposure 1.1; fighter textures at anisotropy 8-16 with mipmaps.
- Camera close-ups: the fighter fills ~70% of the screen on the round intro (P1, then P2) and on supers,
  then eases back.

## Egbon on Mixamo, with authored moves (29 Oct 2026)

- Egbon is now Dele's Rodin build rigged in Mixamo (41-bone Mixamo skeleton) with 13 Mixamo clips:
  fighting idle, walk forward / back, crouch idle, jump, hit reaction, knockdown, victory, jab, cross,
  hook, medium kick, roundhouse. Sources in `assets-src/egbon-razak/mixamo/`. 24,499 triangles, 2.7 MB.
- `tools/blender/prepare_character.py` reworked for Mixamo: clip names from the file names, in-place
  hips (the vertical axis found from the hips bone's rest), Blender 5 layered actions, the model's own
  colour and normal maps, the P2 clothing mask, cloth bones, and each clip's moment of contact (the hand
  or foot that reaches furthest beyond its start) written to the manifest.
- `src/render/clips.ts` picks the clip for each fighter state and its time from the sim frame, never a
  clock: an attack's contact lands on the move's first active frame (5L jab, 5M cross, 5H hook, Park Rush
  cross, 66H / 22M roundhouse), so frame data, hit-stop and replays stay exact. Moves without a clip
  (uppercut, overhead, slap, sweep, slide, throws, the supers ...) keep the procedural poses, with a
  Mixamo T-pose's arms lowered first; switching between clips and poses cross-fades over 0.1 s.
- Tests: clip timing (171 tests).

## Phase 3 follow-up: Egbon from Hunyuan3D (28 Oct 2026)

- Egbon is now Dele's Hunyuan3D model (made on the free Hunyuan3D site from his turnaround sheet). The
  site returned all four sheet views as separate figures; the front-facing one is used.
- `tools/blender/rig_generated.py` turns any image-to-3D model with no skeleton into the game GLB: keeps
  one figure (`--keep-x`), cuts 1.5M triangles to 19.4k, bakes the colour onto new UVs (2048 px), scales
  him to 1.82 m, fits the Mixamo skeleton and cloth bones to the mesh and skins it. The weight clean-up
  stops a hanging hand from dragging the trousers with it: weights that are near through the air but
  far over the skin are dropped, arm and body never share a vertex below the armpit, and faces bridging
  hand and hip are cut. Renders (front, side, a guard pose) in `assets-src/egbon-razak/generated/`.
  The Blender-built model is kept in `assets-src/egbon-razak/egbon-razak-blender.glb`.
- Detail pass after Dele's look: a normal map baked from the full 1.5M-triangle source brings back the
  muscle and cloth folds; real models use a soft 3-step ramp (spec 4.2, `RAMP_SOFTNESS`) instead of hard
  bands; the outline shell is pushed out along smoothed, seam-welded normals (the generated mesh's noisy
  normals poked it through the front as black streaks); P2's colour swap follows a painted clothing mask
  (trousers / tank top) instead of body height, so skin is never recoloured. Hit boxes start hidden (F2).
  2.7 MB GLB.
- Egbon rebuilt from Dele's cleaned-up model (`naija-fighters-characters.blend`: one figure, 40k triangles,
  its own 4K texture), kept in `assets-src/egbon-razak/generated/egbon-source.blend`. `rig_generated.py`
  now reads .blend files, keeps a model's own UVs and textures with `--keep-uvs` (no bake, so no bake
  specks), and when Blender's automatic weights fail on a mesh that is not one closed surface, weights a
  watertight voxel copy and copies the weights across. The outline shell now welds normals within 1.2 cm
  cells (stacked layers of cloth over skin share one) and is pushed back in depth, so it only shows at
  the silhouette. 23,347 triangles, 2.3 MB.

## Phase 3: Real art pipeline, Egbon (28 Oct 2026)

- Egbon's first real model, built in Blender from his sheet (`tools/blender/build_egbon.py`): one
  continuous body shaped from widths measured on the sheet's front and side views, painted by
  projecting the sheet's front, side and back views (`tools/make_atlas.py`), afro, gold chain, bead
  bracelets, a 24-bone Mixamo-named skeleton with automatic weights and trouser-leg cloth bones.
  7,760 triangles, 530 KB.
- In the game (`src/render/skinned.ts`): toon shading, an outline that follows the skin, the P2
  colourway as a shader colour swap (black tank top, blue/white print trousers), spring bones on the
  trouser legs, a three-quarter stance that turns side-on into every attack. The frame-accurate poses
  drive the bones, so every move stays on its frame data. `?model=0` shows the mannequins.
- The pipeline for image-to-3D models: `tools/crop_reference.py` (sheet to views and a padded front
  view), `tools/blender/prepare_character.py` (scale, floor, facing, triangle and texture budgets, cloth
  bones, Mixamo clips in place, GLB + manifest).
- Lagos Market (Night) as real stage art, all painted in code: stalls with corrugated roofs, ankara
  counters and hanging fabric, produce, bare bulbs, umbrellas, traders who cheer supers and KOs and duck
  big hits, bunting and festoon lights, night buildings with lit windows and water tanks, poles and
  wires, palms, a wordless billboard, the far skyline under a city-glow sky, a passing okada.
- Tests: model budgets and bones (167 tests).

## Phase 2: Vertical slice, Egbon vs Egbon (28 Oct 2026)

- The whole spec 6 combat system in the sim: chains (L > M > H, lights x3), special and super cancels,
  throws, back throws, tech and 3-frame throw protection, damage scaling (100, 100, 90 ... floor 30,
  supers 50), counter-hit and punish, juggle points and flip-out, once-per-combo rule, 8 s combo cap,
  soft and hard knockdowns with quick-rise, chip that can KO, the 3-bar meter and EX moves, armour,
  invincibility windows, wall bounce, rekkas, Wahala Mode, taunt.
- Hit-stop by strength (spec 5.1), +4 on counter, 40-frame super freeze, KO freeze; the input buffer
  stays open during hit-stop.
- Egbon's full kit from spec 7.2, including both supers and No Change. Throws for Iya and Chief Priest.
- Renderer feel: defender shake, hit/block/counter sparks, impact flash, camera shake, KO flash, zoom
  and slow motion, super darkening and zoom, Wahala glow, squash and stretch, pose blending, per-move
  effects. New poses for every new move and state.
- Placeholder synth sound for every action; HUD meter, Wahala indicator, combo damage, call-outs and
  super names.
- Normal CPU (spec 8): reaction delay, guard before attacks, hit-confirms, punishes, anti-airs, throws,
  rekkas and mix-ups, wake-up reversals, throw techs, supers only as combo enders and never in the
  first 2 seconds; seeded per match.
- Input fixes found while testing: L then M a frame apart is still a throw; 236236 without meter is
  Park Rush, not a DP; walking forward then 236 is Park Rush (a DP must be typed within 10 frames when
  236 is also there).
- 165 tests (89 before): every mechanic above, every special's on-block advantage in the real sim, no
  move loops into itself, combos never pass 8 s, CPU plays full matches deterministically, rollback
  through supers and throws.

## Phase 1: Foundations (27 Oct 2026)

- New project, written fresh to the v2 spec: Vite + strict TypeScript + Three.js, Vitest.
- Deterministic sim core with integer sub-pixel units: walk, dash, back-dash, jumps with pre-jump and
  landing recovery, input buffer (4 frames) and lenient motion recognition, push boxes with the corner
  rule, hit/hurt boxes, high/low/overhead blocking, pushback (moves the attacker in the corner),
  hit/block stun from the data's on-block numbers, air hits and knockdowns, rounds, best of 3, 99 s timer.
- Normals and movement data for Iya Matthew, Egbon Abdul Razak and Chief Priest (spec section 7).
- Placeholder mannequins (sheet colours, props), toon shading, outlines, contact shadows; grey-box Lagos
  Market at night with warm key and orange rim light; camera at 42% fighter height.
- DOM HUD, `?dev=1` box overlay, keyboard and gamepad input, P2 training dummy.
- PWA manifest and service worker, immutable cache headers, size budgets (JS 142 KB gzipped against
  350 KB), CI workflow.
- 89 headless tests: data schema, motions and buffer, movement, jumps, dashes, frame advantage of every
  normal in the real sim, blocking rules, corner rule for every pairing, rounds and timer, determinism,
  save/load rollback, camera framing, poses.
