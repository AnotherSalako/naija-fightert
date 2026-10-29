# For Dele

## Now: look at Phase 3, the real Egbon and the Lagos Market (about 10 minutes)

Run `npm run dev` in `naija-fighters-v2` and open http://localhost:5410 (or ask me to start it).

1. **Egbon** (now your Hunyuan3D model): does he look like his sheet? Face, afro, tank top, chain, beads,
   the print trousers. The old Blender-built one is saved in `assets-src/egbon-razak/egbon-razak-blender.glb`.
   Player 2 should wear a black tank top and blue/white print trousers.
2. **Moves on the model**: walk, crouch, jump, the jab chain, the haymaker, Park Rush, the uppercut, being
   knocked down. He turns side-on into attacks; do the strikes look like they reach the opponent?
3. **The market**: traders cheer on supers and the KO and duck on big hits; the okada passes behind.
   Is the background too busy behind the fighters, or too dark?
4. To compare with the old mannequins: http://localhost:5410/?model=0

Tell me what to fix, then say "go" for Phase 4 (Iya Matthew and Chief Priest).

## Models for the next fighters (free)

Same as Egbon: on 3d.hunyuan.tencent.com upload the fighter's turnaround sheet, generate, download the
GLB into Downloads and tell me; I rig it (`tools/blender/rig_generated.py`). Do not pay for Tripo or
Meshy exports.
Then, for animations, Mixamo (free with an Adobe account): upload the model, place the markers, and
download these as FBX "without skin", "in place": fighting idle, walking forward, walking backward,
crouch, jump, hit reaction, knocked down, getting up, jab, cross, uppercut, low kick, victory.
Put them in `assets-src/egbon-razak/anims/` and tell me.

## Chief Priest's staff

Generate the staff reference with the prompt in spec section 15 and save it as
`reference/chief-priest-staff.png`.
