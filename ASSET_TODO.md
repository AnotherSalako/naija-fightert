# Assets needed

Everything below is a placeholder today (spec 4.6) and can be swapped without code changes.

## Characters (Phase 3 for Egbon, Phase 4 for Iya and Chief Priest)

Egbon is Dele's Rodin build rigged in Mixamo with 13 Mixamo clips (`assets-src/egbon-razak/mixamo/`).
Still wanted: clips for the moves that still use procedural poses (uppercut, overhead, slap, sweep,
slide, throws, block, get-up, taunt, the supers), and facial blink / pain / shout.

For each: one GLB, at most 25k triangles, 2K textures (1K low setting), at most 3 MB with animations,
Mixamo-compatible bone names, plus cloth bones:

| Character | Cloth bones | Notes |
|---|---|---|
| Egbon Abdul Razak | trouser legs | high-top afro, white stained tank top, orange/cream print baggy trousers, gold chain, bead bracelets, black slippers. P2: black tank top, blue/white print trousers |
| Iya Matthew | gele tail, wrapper | blue gele with yellow band, blue polka-dot puff-sleeve blouse, yellow wrapper with blue diamond bands, gold earrings. P2: green gele and blouse, white wrapper with green bands |
| Chief Priest | cap tassel, robe hem, vest fringe, sash | red knitted cap with tassel, white face marks, white robe, navy/red/black striped vest with cowries and fringe, red sash, bead necklace and bracelets, barefoot. Staff as a separate prop (reference image still needed). P2: black robe, gold/black vest |

Animations per character (each timed to its move's frame data): idle (breathing), walk forward and back,
crouch, pre-jump, jump up/forward/back, land, dash, back-dash, block high and low, hit high/low/air,
knockdown, get-up, KO, victory, intro, taunt, every normal (5L 5M 5H 2L 2M 2H j.L j.M j.H and the command
normal), every special and super (Phases 2 and 4), throw and being thrown. Facial: blink, pain, shout.

## Stages

Lagos Market (night) is done in code (Phase 3). Still wanted for it: a crate of oranges for the hazard.
Then, as before for the others: foreground floor strip plus 2 to 3 parallax layers, stalls about 1.5x fighter
height, traders, lanterns, bunting, a crate of oranges for the hazard. At most 2.5 MB. Later: Third
Mainland Bridge (dusk), Lagos Roundabout (day), Abuja City Gate (sunset).

## UI

Portraits for the VS screen and select (the sheets' faces work), a studio logo for the splash, title art.
