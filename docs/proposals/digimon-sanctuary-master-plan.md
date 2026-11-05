# Digimon Sanctuary master plan — concept for review

**Status:** owner approved the overall layout on 2026-11-05 and requested a waterfall on the south shore. The board itself remains a concept; implementation is in progress and does not yet match its complete gameplay or art.
The owner asked for a live-world gym, NPCs, grassy auto-PvE farm, boxing-ring
PvP, and a large west pond with a genuinely walkable long bridge. See the
[redesign roadmap](digimon-sanctuary-world-redesign-roadmap.md) for the full
requirements and sequence.

## Visuals

- `sanctuary-master-plan.png`: annotated north-up plan. The underlay is an
  actual haven-v328 Social Hub scene rendered with a temporary debug overhead
  camera. Colored shapes, labels, bridge and dots are **proposals overlaid on
  that existing map**, not features already in the game. The current old east
  pond and east courts are visible underneath and are proposed for removal.
- `sanctuary-world-art-concept.png`: AI-generated illustrative view of the
  desired atmosphere, **not** a screenshot, existing asset pack, exact geometry
  or proof of gameplay. It is included on the plan as an art-direction reference.
- `sanctuary-current-overhead.png`: the unannotated game-scene underlay, used to
  make the plan. `tools/digimon/make_sanctuary_masterplan.py` composes the board.

## Latest owner correction: longer lake and connected bridge

The owner asked for a longer lake, shifted slightly west to allow more sakura,
a taller bridge, a stone connection to the central avenue and a finished path
on the far west side. The local v332 lake is centred at (−38, 73), nominally
38 × 60, growing south while keeping the northern shore roughly in place. It
has 25 sakura, the south waterfall and all eight fishing seats. The southwest
garden and its original tree remain; the west house at (−46, 16) is still
removed. The illustration remains visual direction, not a pixel-exact
recreation. The estimates below are the historical initial sketch, not the
current lake geometry.

## Current visual building pass (haven-v333)

The bridge is now at the lake centre and the waterfall rocks are at the actual
south shoreline. On the east side, an open-front, cutaway timber gym, four
training station props, a boardwalk, gated grassy field, food and field-guide
kiosk structures, trainer sign, outer trees, ring steps and spectator seating
start to follow the approved concept. This is an approximation made from game
geometry and textures, not the finished concept art. The kiosks and sign do
not yet provide NPC interactions, and the live training, automatic PvE, mobs,
bosses and authoritative PvP are not implemented.

## Approved layout direction (original sketch; coordinates approximate)

Coordinates below describe a feasibility sketch on the current shared plaza
space (then limit ±74); they are **not** final collision or building dimensions.

1. **West pond and bridge:** enlarge the west water to approximately x −60 to
   −14, z 29.5 to 57. A roughly east–west deck extends from x −62 to −12 near
   z 43, reaching dry land at both ends. Keep the north–south central avenue at
   approximately x −9 to +9 clear, with an approach to the bridge from the
   plaza. Design fishing banks, casts and seating around the new water.
2. **Open-air training gym:** roughly x 37 to 70, z −35 to −12, with four
   individual example modules for Power, Guard, Agility and Focus. The current
   stats are a starting proposal, not a locked decision. The illustration groups
   modules in an open-sided gym; they can be separate structures if desired.
3. **NPCs:** the gold dots propose a trainer by the gym approach (around 33,
   −11), food seller near the main east path (31, 11), and PvE guide at the farm
   entrance (32, 17). These are illustrative positions, not final models or
   dialogue. World interactions must leave training and PvE animations on-map.
4. **Grassy auto-PvE farm:** roughly x 34 to 70, z 12 to 42. Reserve room for
   live companion movement, ordinary mobs and boss encounters; determine spawn
   ownership and multiplayer capacity during implementation.
5. **Boxing-ring PvP:** roughly x 40 to 69, z 49 to 72. The diagram's roped
   square sits within this footprint with approach and spectator space. Actual
   match authority, camera, spectator placement and boundaries are not yet
   engineered.

The main east–west avenue (approximately z −9 to +9) stays open between the
gym and farm. The fountain, castle and both poker tables remain in place in
this proposal. The old east pond, current eastern courts and the east houses at
(46, −25) and (46, 16) would be replaced. The proposed lake overlaps the west
house at (−46, 56) and slightly clips the house at (−27, 65); both need to be
moved/redesigned or the shoreline adjusted. The lake starts close to the west
garden and plaza paving: check their visual/physical clearance. The existing
fishing chairs and bridge need relocation, not removal of fishing gameplay.

A simple rectangle-versus-current-layout check found the above building
intersections and no direct garden footprint intersection. It is **not** a
navigation simulation, asset-fit test or guarantee of capacity; boundaries,
shore buffers, sightlines, props, adjacent houses and player paths require a
real implementation and desktop/mobile testing. In particular, the current
`walkable()` blocks pond water entirely; the long bridge needs explicit shared
bridge-deck walkability and click handling on both the client and Social Worker.

## After review

Once the placement and atmosphere are approved, implement the shared map,
west pond and crossable bridge first. Then build the gym and NPCs, live gym
training, auto-PvE field and server-authoritative PvP in the agreed order.
Preserve fishing, player saves, current Sanctuary progress, Ragnarok pets, field
combat and existing hub navigation. The v328 window-based activities remain the
current code until replaced; they do not satisfy the requested final design.

## Owner-corrected position (haven-v334)

The owner rejected the earlier diagram's north-of-avenue gym: the entire east
Sanctuary belongs within the area beginning beside the southeast garden. The
local implementation therefore places the cutaway gym at x 43–95 / z 12–39,
the gated meadow immediately south, and the spectator ring farther south;
three future service structures sit between the north–south avenue and the
winding walkway. The approved illustration remains the visual target rather
than a promise of pixel-identical artwork. This supersedes the coordinates in
the initial diagram above. The lake remains as accepted. NPCs, on-map training,
live PvE and authoritative PvP are not yet implemented.

## Additional owner art feedback (haven-v335)

The owner requested two joined gym buildings, trees behind them, detailed
shops and the full cast. The visual pass adds joined rear wings, detailed gym
apparatus, service stalls, named talkable staff and decorative Digimon in the
field. Their actual gameplay services remain a future phase; this is not a
pixel-identical version of the illustrated proposal.

## Owner structural and training notes (haven-v336)

The gym needs exposed heavy timber framing and diagonal braces against pale
plaster, pitched rear and side roofs, and a spacious open-air front and court.
The spectator stands should look like real tiered timber construction around
two sides of the ring. The local visual pass adds this detail but remains an
approximation. Future on-map Digimon training should show Power attacking a
dummy, Guard receiving attacks, Agility running or jumping, and a distinct Focus
animation. These training actions and functional spectator seats are not yet
implemented; see the world redesign roadmap.

## Owner clarification (haven-v337)

The approved illustration is the required building design, not merely a
suggestion for materials. In the local rebuild the two framed wings, pitched
perimeter and open training court are constructed in the world; native game
trees replace the rejected flat backdrop trees. The in-game result remains an
approximation to review against the illustration. It does not yet implement
live Digimon training, food services, auto-PvE or authoritative PvP.

### Gym and seating correction (haven-v338)

The gym footprint now angles both framed wings toward a short middle entrance,
with broad roof slopes and the existing native trees behind the walls. The
boxing-ring spectator stands use level plank tiers and mitred corners. The
result is a visual interpretation for owner review; training and seating are
not yet interactive.

### Live gym begins (haven-v339)

The owner accepted the v338 building for now. Four local-view, on-map gym
activities now award casual Sanctuary training points on completion; they are
not yet visible to other plaza players. Food sales, live farming and
server-authoritative matches are still future work.
