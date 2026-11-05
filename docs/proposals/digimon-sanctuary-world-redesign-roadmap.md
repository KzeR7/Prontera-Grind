# Digimon Sanctuary: live-world redesign roadmap

**Status: owner direction and implementation roadmap, 2026-11-05.** The owner
rejected the v328 Sanctuary layout and tab-based training/battle presentation.
This document supersedes those presentation and layout choices in the earlier
Sanctuary proposals. It records the desired direction; it does not mean the new
map, live training, live PvE or PvP are already built.

## Owner's requirements

- Use the **whole east side** of the Social Hub for the separate Digimon
  Sanctuary and its additional activities, instead of the two small circular
  pads. The precise boundaries and placement need a visual layout.
- Training and PvE fighting happen **live and visibly on the map**, with the
  Digimon and activities animated in the world, **not inside a tab**. The
  current v328 tab-based spar/training presentation is not the desired final
  experience.
- Make the training area look like a **gym**, with a distinct training module
  or apparatus for each trainable stat. The current Power, Guard, Agility and
  Focus stats are a starting point for planning; the final stat/module design
  should be reviewed, not assumed from the existing prototype.
- Provide a **food-selling NPC**, a **trainer NPC**, and a **PvE NPC**. Their
  roles and exact location should be visible in the map design. NPC dialogue or
  shop controls must not replace the requested on-map training and fighting.
- PvE is an **auto-training/farming area**: a grassy field where a Digimon
  automatically fights mobs and bosses with live animation. It is a separate
  Sanctuary activity, not a replacement for existing Ragnarok field combat.
- The PvP area should look like a **boxing ring**. PvP mechanics and any
  competitive rewards must be engineered and tested separately; the shape of a
  ring alone is not a working PvP system.
- Remove or relocate the **east pond** and combine its water feature into one
  **larger west-side pond**, with a **long bridge that actually works** for
  walking across it. Preserve functional fishing, pond interactions and access.
  Exact dimensions, bridge position and the treatment of surrounding scenery
  remain layout decisions.
- The arena, gym, farm, NPCs and landscaping need **high-quality graphics**,
  appropriate to the existing town and readable from desktop and mobile.
- Keep the Sanctuary separate from existing Ragnarok pets, pet acquisition and
  field combat. Preserve saved player progress and existing Social Hub functions.
  Keep the already-approved Digimon Up look, Patamon-referenced sizing,
  horizontal mirroring and speed-aware animation unless the owner changes them.

## What exists today, not the target

As of haven-v328, two 18 × 13 ponds are centered at approximately (-23, 42)
(west) and (23, 42) (east); the limited east-lawn courts are near (46, 56) and
(27, 65). These are current coordinates, **not** a new design. Current
training is timed from a window, and current PvE is a turn-based window spar;
neither satisfies the new live-world requirement. The existing courtyard art is
an interim implementation the owner does not want as the final design. Existing
care, mastery and evolution data must not be silently wiped while replacing its
presentation and mechanics.

The existing water is non-walkable in `assets/social-rules.js`; bridge height
and visuals are separately handled in `assets/social-scene.js`. A genuine long
bridge across the water therefore needs shared navigation and deck elevation,
not just a longer decorative mesh. Fishing also currently has pond-indexed UI,
chairs and approach targets in `assets/social-fishing.js` and the shared rules.
The west side also contains existing town, paths and poker features; the map
study must identify actual overlaps rather than assume that the whole west lawn
is empty.

## Recommended order

### 1. Master layout and visual approval — **start here**

Make an overhead plan and an in-context Social Hub view showing the enlarged
west pond and traversable bridge, and the full east-side gym, NPC cluster, grassy
PvE farm and boxing ring. Show main roads, fountain, entrances, camera sightlines,
and which existing buildings/props move or stay. Keep the spaces visually
connected while leaving enough room for followers, mobs, bosses and spectators.
The gym, farm and ring need to look like distinct purpose-built places, not
just labelled circles. Review the plan with the owner before rebuilding the map.
Exact dimensions, station arrangement and NPC visual design are not decided.

### 2. Shared map, west pond and bridge foundation

Implement the approved terrain, collisions and navigation in the shared rules
used by both the browser and the Social Worker. Merge the ponds into one larger
west feature and make the full bridge traversable from both banks: walking,
follower movement and elevation must agree, with clear click handling for the
bridge versus water. Move or redesign fishing spots, chairs and visual props as
needed; preserve fishing saves, catches, currencies, titles and existing social
navigation. Handle old pond references and in-flight/resumed positions safely.
Test routes, occupied seats, fish casting and multiplayer after the relocation.

### 3. Build the world locations and NPCs

Replace the rejected temporary courts with the approved detailed gym, grassy
farm, boxing ring, paths, vegetation, lighting and furnishings. Add the food
seller, trainer and PvE NPC as identifiable, interactive world characters.
Keep art and texture provenance, mobile performance, camera occlusion and shared
collision in scope. Do not claim that a decorated area is an implemented system.

### 4. Live gym and care

Connect the trainer and each stat apparatus to real on-map training. A companion
moves to and visibly performs the activity; the player can see progress and the
result in the world. Reuse validated Digimon animations and animate appropriate
props where the supplied sprite set lacks a specific action. Respect the
approved movement speed and facing. Integrate food purchases and care without
silently losing the existing versioned Sanctuary progress; avoid changing the RO
pet system. UI can support interaction and status, but the activity itself must
not become a tab animation again.

### 5. Live auto-PvE farm

Add the grassy mob/boss area and PvE NPC. Digimon visibly move, attack, react and
fight automatically in the world; handle target choice, spawning, health,
defeat, stopping/restarting, camera and multiple players without interrupting
normal field farming. Decide and test per-player versus shared spawns, encounter
limits and fair progression before finalizing. Migrate or safely retire the old
window spar without silently dropping existing Sanctuary data.

### 6. Boxing-ring PvP

Build opt-in multiplayer battles in the boxing ring with real on-map animation.
Use server-owned match state, validate participants, consent and commands, and
cover disconnects, timeouts, spectators and abuse. Browser-authored training
saves are not proof of legitimate competitive stats. Start without valuable
rewards; ranked progression or payouts need a separate authoritative ledger,
idempotent settlement and additional testing before enabling.

### 7. Integration and polish

Validate old saves and account switching, Social Worker/browser layout parity,
pond fishing, bridge walking, NPC interactions, live animation, follower paths,
mob/boss behavior, multiplayer visibility and desktop/mobile performance.
Roll out compatible client and Worker changes together when the owner chooses to
release. Do not deploy or alter production data as part of this planning note.

## Decisions for the visual plan

The owner approved the overall master plan and added a waterfall on the south bank.
Final apparatus designs and PvE spawn ownership still require implementation decisions.
Keep the underlying town and existing hub activities navigable.

## First master-plan proposal

A proposed layout and illustrative art direction are now recorded in
`digimon-sanctuary-master-plan.md` and `sanctuary-master-plan.png`. They are
approved as the overall direction, with the addition of a south-bank waterfall.
The board is a concept, not a claim that all facilities are implemented. It flags
houses affected by the larger pond and east-side facilities.


## Current implementation — haven-v329 (partial)

The west lake, long shared-navigation bridge and south-bank cascade are in the
local build. Fishing targets, eight existing seat IDs, bridge clicking and
resumed positions were adapted. The east side has an initial open gym shell,
field and ring scenery in the approved areas, not the finished art or interactive
features. The NPCs, live-world training, automatic mob/boss fights and
server-authoritative PvP remain **unimplemented**. The old window activities
are labeled temporary and still preserve their saves. More graphics and real
multiplayer/desktop/mobile testing are required before calling the redesign done.


## Owner correction — lake shape (haven-v330)

The owner clarified that the lake should extend north–south from the original
west pond, be wider, and have an oval curved outline and many sakura trees like
the approved concept. This supersedes the v329 rectangle and its earlier
illustrative x/z footprint. The local build now uses a 34 × 46 curved water
outline near (−34, 45), 18 sakura, the east–west crossable bridge and a southern
waterfall. To make room, the west house at (−46, 16) and southwest garden were
removed. The art illustration remains a style target, not exact game footage;
the east-side NPCs and live-world systems remain unfinished.


## Owner correction — south shift and restored tree (haven-v331)

The v330 oval was too high and displaced the tree in the southwest plaza
garden. The local revision restores that garden and tree, moves the lake and
its bridge/seats/sakura/waterfall south, broadens and irregularly curves the
shore, and extends the scene and shared navigation south to z 112. Public rigs
use the expanded shared bounds and old invalid resumed positions are rescued.
The reference is art direction, not a pixel-exact implementation. The east-side
NPCs, live training, auto-PvE and authoritative PvP are still unfinished.


## Owner correction — longer lake and bridge paths (haven-v332)

The owner asked for more length to the south, a small westward shift and more
sakura, a taller bridge, and stone paths connecting both ends. The local lake
is now 38 × 60 around (−38, 73), with 25 sakura, clear approaches and a visible
south waterfall. Ground, north–south road and shared navigation were extended
south to z 126; old seat IDs, fishing and resume safety are preserved. The
east-side NPCs and live-world training, auto-PvE and authoritative PvP remain
unimplemented.


## Building pass and lake correction (haven-v333, incomplete)

The bridge has moved to the lake centre and the south cascade sits on the
actual bank, with its splash in water. The east-side visual building pass adds
an open cutaway timber gym and four stat areas, wooden boardwalk, a grassy
field with gated fences, food and guide kiosk structures, trainer sign, native
outer trees and steps/benches around the ring. Walls, signs, kiosks, trees and
fences have shared collision; gates and both lake approaches remain reachable.
The concept is an art target, not pixel-identical geometry. The kiosks are
scenery only: identifiable interactive NPCs, live-world gym activity, auto
mob/boss combat and authoritative PvP remain **unimplemented**. Do not replace
these with tab-only animations or trust browser-authored stats for competitive
PvP.

## Owner-corrected eastern layout (haven-v334, incomplete)

After rejecting v333's placement and placeholder architecture, the owner
identified the southeast green as the beginning of the whole pet district.
The local rebuild moves the gym there, with the gated field and ring southward,
and replaces the visual kit with timber/plaster gabled wings, gym apparatus,
three varied future service structures, a winding plank route, a bevelled
meadow and tiered ring seating. The expanded eastern bounds, shared diagonal
fence collision, gates and old-position recovery work in both client and
Worker. The pond is unchanged. These visuals are an approximation of the
illustration; actual NPCs and on-map training/PvE/PvP are still separate work.

## Detailed gym and staff pass (haven-v335, incomplete)

The owner confirmed the direction but requested the reference's two joined gym
buildings, backdrop trees, richer small details, better shops and visible NPCs.
The local scene now contains connected rear roofed wings and a central gable,
more gym fixtures, shop merchandise/awnings, foliage, CC0 roof/timber materials,
a CC0 tree sprite, and five named native-sprite staff with status dialogue. Four
idle Digimon decorate the meadow. They are explicitly scenery, not simulated
combat or player ownership. The services, live training/auto-PvE and
server-authoritative PvP are still missing. The visual is an approximation, not
a recreation of every hand-painted detail in the concept.

## Owner animation notes and architecture refinement (haven-v336)

The gym should remain an open-air pavilion: heavy exposed posts, rails and
angled braces on both faces of the whitewashed plaster perimeter, pitched roofs
along the rear and sides, and a broad open front and training court. The ring
should have proper tiered timber spectator stands wrapping two sides. The local
visual pass reinforces these details; it is not the complete hand-painted
reference, and its spectator benches are decorative, not usable seats.

When live **on-map** training is implemented, the owner wants each companion to
visibly perform the stat-specific activity: **Power** attacking a dummy;
**Guard** being attacked and reacting; **Agility** running or jumping; and a
distinct **Focus** animation (its exact action remains to be designed). These
are requirements for the future gameplay phase, not features of this visual
pass. Existing source sprite animations do not necessarily contain dedicated
block, jump, or focus frames: design and validate the necessary animation or
prop work rather than claiming those frames already exist. Keep movement,
interaction, progress and completion in the shared world, not just a tab.

## Owner rejection and 3D asset sourcing (2026-11-05)

The owner rejected the v336 rear-tree planes (they become flat edge-on) and
said the gym still does not match the approved reference. They asked for
existing online/GitHub building assets rather than another small primitive
revision. The free Standard version of Quaternius's CC0 Medieval Village
MegaKit contains genuine modular plaster/timber walls, doors, windows, gables
and roof meshes; its Stylized Nature MegaKit Standard includes actual 3D tree
meshes. A local, rotatable **asset-only study** with selected real modules and
one tree is in `docs/proposals/gym-asset-study/`. It is not the gym design or an
in-game replacement; the source pack's promotional village uses more than the
free subset. Inspect the actual pieces and assemble the open-front courtyard
and wings intentionally against the owner's image; don't substitute a closed
house or assume the promotional scene is included. The existing game still has
the rejected flat trees and v336 gym until a separately verified rebuild. Check
asset rendering, size, performance, tree/roof intersection, navigation and
shared Worker collision before replacing either.

## Owner clarification and in-game gym rebuild (haven-v337)

The owner clarified that the approved illustrated gym itself is the target:
not a new building, a texture swap, or an asset-study house. The local gym has
therefore been rebuilt as two taller framed wings with gabled end bays, a
connecting back entrance, and an open exercise courtyard with front fencing.
The inward roof slopes are cut away to keep the walls and training area visible;
the outer slopes remain pitched. Existing native field trees replace the
rejected full-tree planes. This remains an in-engine approximation and awaits
owner review, not a claim of a pixel-identical painting. The on-map Digimon
training actions and services described above still need implementation.

## Angled-wing correction (haven-v338)

Following the owner's v337 review, the gym now has two genuinely angled rear
wings joined by a short middle bay, with broad pitched outer roofs and native
field trees behind them. The ring stands have been rebuilt with level planks,
regular tiers and mitred returns. These are in-game scenery changes awaiting
visual review, not completion of the pet system or on-map training animations.

## First live-gym slice (haven-v339)

The owner accepted the v338 gym for now and asked to proceed with the pet
system. A local-view world gym now lets the selected Digimon approach a station
and perform one of four visible 15-second activities, with progress, cancellation
and the existing casual stat/care limits. Movement, hidden tabs and other
interruptions do not earn a point. Legacy prototype data and timers remain
supported. This is a first slice: other players do not yet see the activity;
food purchases, live auto-PvE and server-authoritative PvP remain unimplemented.

## Automatic shared gym revision (haven-v340)

The owner requested unattended online training while moving or in the field,
two independent leveled partner slots including duplicate species, one in the
gym at a time, left-of-equipment stance and more equipment for shared rooms.
The first casual implementation reserves three positions per activity in each
connected plaza and broadcasts on-map activity. The other partner can be selected
and use the existing temporary spar, but live auto-PvE and PvP remain separate
future work. Gym XP/levels are prototype, client-saved and have no combat effect.
Training stops on disconnect, logout, reload or care/stat caps; no offline gym
progress is intended. See `docs/SOCIAL-HUB.md` for the current behavior.
