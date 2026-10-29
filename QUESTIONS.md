# Questions and the choices made meanwhile

Each item: what was unclear, what I picked, and why. Change any of them by telling me.

1. **Where does v2 live?** The spec says rebuild from scratch. Picked: a new folder `naija-fighters-v2/`
   beside v1, sharing nothing. v1 stays playable at its own URL.
2. **Emeka and Sister Bisi** (built in v1) are not in the v2 launch cast. Picked: left out of v2 for now.
   Do they come back after Phase 4?
3. **On-hit advantage** is not in the spec tables (only on block). Picked: hit stun = block stun + 4, so
   every normal is 4 frames better on hit than on block. Tested in the sim.
4. **Jump attacks** have no stun numbers in the spec. Picked: light 14/10, medium 18/13, heavy 22/16 (hit/block).
5. **Hitbox sizes and positions** are not in the spec. Picked from the move descriptions (jabs high, sweeps on
   the floor, staff moves long); overheads reach low enough to hit a crouching opponent. Tune in `?dev=1`.
6. **Pad face buttons** (spec: "face buttons L/M/H/S"). Picked: Square L, Triangle M, Circle H, Cross S.
7. **Dash input**: double tap forward (6 5 6) within 12 frames; back-dash 4 5 4.
8. **Time-up with equal health share**: no point to either fighter; another round is played.
9. **World scale**: 100 px = 1 metre; fighters about 1.8 m tall; walls at 7 m from the centre.
10. **Jump arc** comes from each fighter's total airtime (spec 6.2) and an apex height I chose: Iya 110 px,
    Egbon 125 px, Chief 120 px.
11. **Phase 1 Vercel deploy**: a new Vercel project is needed for v2 (v1's stays). Asked before creating it.

## Phase 2

12. **Park Rush active/recovery**: the spec gives startup, damage and on-block only. Picked: active 4,
    recovery 16/18/22 so on-block matches the spec.
13. **Which normals cancel into specials**: the spec marks only 2M, but the gameplan says "jab-chain into
    Park Rush". Picked: 5L, 2L, 5M, 2M cancel into specials; normals and specials cancel into supers.
14. **Ticket Slap ender with M**: the spec gives L (barge) and H (sweep). Picked: M = barge. Parts one and
    two take any attack button.
15. **Frame data the spec leaves out**: Danfo Door active 6, recovery 30 (so -26); Bus Stop feint has no
    hit and is free 19 frames after starting; Fare Collection is 8 hits 3 frames apart (35 each), the
    last launches; Last Stop starts in 7, reaches 40 px, cannot be teched.
16. **Lv1 super invincibility**: the spec only makes Lv2 invincible. Picked: Fare Collection has none.
17. **No Change**: the first Park Rush (any strength) in Wahala Mode becomes No Change: 1-hit armour,
    travels up to 560 px, 90 damage.
18. **Throw tech "both pushed apart 60 px"**: picked 30 px each (60 in total).
19. **"First hit counts as scaling 1 step later"** for throws and counter-hits: the next hit is 90%.
20. **Multi-hit moves**: all hits of one move scale as its first hit, so Fare Collection deals 280 when it
    opens a combo.
21. **Easy controls (6.13)** come with the touch controls in Phase 6.
22. **CPU blocking**: with a 16-frame reaction delay it can never react to a 10-frame attack, so the block
    chance is also used to guard ahead of time when the opponent is close. Measured on repeated
    haymakers: between 15% and 85% blocked (tested).
23. **Super cinematics** (portrait slide-in, Lv2 3-5 s sequence) and the announcer wait for Phase 5; the
    40-frame freeze, darkening, zoom and name banner are in now.
24. **Default player 2** is the Normal CPU; F1 switches to a human or a dummy.

## Phase 3

25. **Image-to-3D**: Blender's Hyper3D needed a paid key (the free trial was out of credit), Hunyuan3D was
    set to a local server that is not running, and Tripo's export is paid. Picked: model Egbon in Blender
    from the sheet now (free), and try the free TRELLIS space on Hugging Face as well; keep whichever is
    closer to the sheet. Either goes through the same pipeline.
    Outcome: Dele made one on the free Hunyuan3D site; it is much closer to the sheet, so it replaces the
    Blender-built model. It came unrigged, so `rig_generated.py` rigs it in Blender (no Mixamo needed).
26. **Animation**: no Mixamo clips yet, so the game's frame-accurate poses drive the real skeleton.
    Authored clips can replace them per move later without changing the sim.
27. **Stance angle**: fighters stand turned about 55 degrees toward the camera (so the sheet's front reads)
    and turn side-on into attacks so strikes travel toward the opponent.
28. **P2 colours**: a colour swap in the shader by body height and colour range (spec 4.2: never a second
    model).
29. **Stage art** is painted in code (canvas textures, no text on signs) rather than generated pictures, so
    it is sharp at any size, costs no download and has no licence questions.

## Detail pass (29 Oct)

30. **Triangle budget**: spec 4.1 says 25k per fighter; Dele asked for the full ~50k mesh (no decimation
    below ~40k). The asset test now allows 50k; the 3 MB file limit stays, met with Draco + WebP.
31. **Texture format**: WebP (Blender exports it, three.js reads it) instead of KTX2/Basis, which needs
    tools not installed here; Egbon is 1.75 MB, well under 3 MB, so KTX2 is not needed yet.
32. **Lighting**: three.js lights cannot be limited to the fighters, so the SF4 key and rim lights live in
    the fighters' shader; the stage keeps its own lights.
33. **Playtest numbers vs the sim**: the playtest measured hit-stop ~6/8/11 and ~30 frames of air; the sim
    measures 8/11/14 (the spec table) and 40 frames (`tests/feel.test.ts` locks both). The difference may
    be in how it was measured, so neither was changed.
34. **CPU Normal** departs from the spec's difficulty table (delay 22 not 16, block 38 not 45 ...) at Dele's
    request; Hard and Boss keep the spec values.
35. **Repeated playtest measurements**: this pass listed again hit-stop ~6/8/11, jump ~30 f, knockdown ~24 f,
    meter ~50 hits a bar, H+S giving 5H and 5H -1 on hit. The sim measures 8/11/14, 40 f (+ apex hang),
    45 f (hard), ~25 hits a bar, Wahala from same-frame H+S and +2: those were already fixed in rdr1fx9fo.
    A test harness stepping `__nf.advance` while the live loop is not paused (Esc) counts about 3/4 of the
    real frames, which matches every one of those readings.
36. **Jump**: kept at the data's 40 frames in the air (47 with the pre-jump and landing), with an apex hang,
    rather than shortened to "38 total", since the request reads as "longer, floatier" and 40 is above 38.

