# Naija Fighters v2

A Nigerian street fighter in the browser: Three.js 2.5D renderer over a pure, deterministic
TypeScript fighting sim. Built fresh to `NAIJA-FIGHTERS-V2-SPEC.pdf` (v1.1, 27 Oct 2026), phase by
phase. v1 lives next door in `../naija-fighters` and is not imported.

## Status: Phase 3 (real art: Egbon and the Lagos Market) done, waiting for Dele before Phase 4

| Area | State |
|---|---|
| Sim core: 60 Hz step, input buffer, motions, movement, push boxes + corner rule, blocking, rounds | Done (Phase 1) |
| Combat (spec 6): chains, cancels, throws + tech, scaling, counter/punish, juggles, combo limits, knockdowns + quick-rise, chip, meter + EX, armour, invincibility, wall bounce, rekkas, Wahala, taunt | Done, tested |
| Egbon's full kit incl. both supers and No Change | Done |
| Hit-stop table, super freeze, KO freeze | Done (in the sim) |
| Feel: shake, sparks, impact flash, camera shake (`?shake=0`), KO zoom + slow-mo, super darkening, Wahala glow, squash/stretch, pose blending, per-move effects | Done (placeholder art) |
| Synth sound for every action (`M` mutes) | Placeholder (real audio: Phase 5) |
| HUD: health, 3-bar meter, timer, combo + damage, Wahala, call-outs, super name | Done |
| CPU (spec 8 table; Normal by default, `?cpu=easy/hard/boss`) | Done |
| Egbon's real model (Hunyuan3D, rigged in Blender), toon + outline, P2 colour swap, cloth springs | Done (Phase 3) |
| Lagos Market (Night) stage art and lighting, reacting crowd | Done (Phase 3) |
| Asset pipeline: `tools/crop_reference.py`, `tools/make_atlas.py`, `tools/blender/build_egbon.py`, `tools/blender/prepare_character.py`, `tools/blender/rig_generated.py` (rigs image-to-3D models) | Done |
| Iya and Chief Priest specials and models; menus, easy and touch controls | Phases 4 to 6 |

## Run

```
npm install
npm run dev        # http://localhost:5410
npm test           # 167 headless tests
npm run build && npm run budgets
```

Address options: `?p1=iya-matthew&p2=chief-priest` picks the fighters (`egbon-razak` by default),
`?cpu=hard` sets the CPU, `?p2mode=human` starts with two players, `?dev=1` shows the debug overlay
(F2 toggles the boxes), `?shake=0` reduces camera shake, `?mute=1` starts muted, `?model=0` shows the
placeholder mannequins.

Rebuild Egbon's model (Mixamo rig + clips): `blender -b --factory-startup --python
tools/blender/prepare_character.py -- --id egbon-razak --model assets-src/egbon-razak/mixamo/egbon-rigged-tpose.fbx
--anims assets-src/egbon-razak/mixamo/anims`. Which move plays which clip: `MOVE_CLIPS` in `src/render/clips.ts`.
An unrigged model instead goes through `tools/blender/rig_generated.py` (e.g. `--model
assets-src/egbon-razak/generated/egbon-source.blend --keep-uvs --tris 24000 --fresh`). For a raw image-to-3D download that
holds every sheet view, drop `--keep-uvs` (it bakes) and add `--keep-x` to pick one figure.
The older hand-built model: `tools/blender/build_egbon.py`.

## Controls

| | Player 1 | Player 2 |
|---|---|---|
| Move | W A S D | Arrow keys |
| L / M / H | J / K / L | Numpad 1 / 2 / 3 |
| S (EX with a motion; alone = Wahala) | ; | Numpad 0 |
| Throw (L+M) / taunt | I / O | Numpad 5 / 6 |
| Pad | Square L, Triangle M, Circle H, Cross S, R1 throw, L1 taunt, R2 H+S | second pad |

Hold back to block, back-down to block low. Double-tap to dash. F1 cycles player 2: CPU, human,
dummy (stand, block, crouch-block). Esc pauses, Enter rematches, M mutes.

Egbon (facing right): 6M overhead · 66H Conductor Hop · 236 L/M/H Park Rush (236S EX) ·
214 any, 214 any, 214 L/H Ticket Slap rekka · 623 L/M/H Danfo Door · 22 L/M/H Bus Stop ·
236236 + any Fare Collection (1 bar) · 214214 + any Last Stop (3 bars) · S under 35% health = Wahala.

## Layout

`src/sim` (pure, no three.js, no DOM, no Math.random, no Date) · `src/sim/data` (character JSON) ·
`src/render` (three.js) · `src/ui` (DOM HUD) · `src/input` · `src/ai` (CPU) · `src/audio` (synth) · `tests` · `reference` (canon character
sheets, never shipped) · `scripts/check-budgets.mjs`.
