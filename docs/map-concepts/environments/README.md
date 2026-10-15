# Eight environment graphics studies

**Historical illustrative studies:** the current detailed revision is in the
[full proposal](../FULL-PROPOSAL.md), with actual 3D captures in
`../scenery-review/` and a live all-eight comparison board. These images remain
atmosphere references, not the current real-time renderer output.

**Owner direction:** four environment designs per destination, shared by Stages
1–3, 4–6, 7–9 and the Stage 10 boss arena. Eight designs total. Stages within a group
reuse the same environment rather than receiving individual redesigns.

The live viewer at `tools/map_proposal.html` now switches actual artwork when a
stage group is selected. These are AI-generated environment art studies, not tile
atlases, geometry, game screenshots or playable maps. They are separate from
protected native sprite artwork. Original selected concepts remain in the parent
folder for reference.

## Graphics inventory

| Destination | Stage group | Environment | Artwork |
|---|---|---|---|
| Astral Citadel | 1–3 | Outer Terrace | [Open graphic](astral-outer-terrace.png) |
| Astral Citadel | 4–6 | Broken Nave | [Open graphic](astral-broken-nave.png) |
| Astral Citadel | 7–9 | Inner Sanctuary | [Open graphic](astral-inner-sanctuary.png) |
| Astral Citadel | Boss / 10 | Fallen Sanctuary | [Open graphic](astral-fallen-sanctuary.png) |
| Thor Volcano | 1–3 | Outer Fissure | [Open graphic](thor-outer-fissure.png) |
| Thor Volcano | 4–6 | Magma Gallery | [Open graphic](thor-magma-gallery.png) |
| Thor Volcano | 7–9 | Core Approach | [Open graphic](thor-core-approach.png) |
| Thor Volcano | Boss / 10 | Primal Core | [Open graphic](thor-primal-core.png) |

`manifest.json` records the stage-group contract and each original PNG's dimensions,
size and checksum. These files are dev/review material; the static game publishing
allowlist does not include `docs/` or `tools/`.

## Higher-quality direction

- **Astral:** sculpted gothic reliefs, layered masonry, chipped paving, carved
  balustrades, broken vaulting and celestial structures rather than a flat tinted
  field with scattered crystals.
- **Thor:** mineral-textured basalt, layered columns, cooled lava forms, reflected
  amber lighting, side cascades and a distinct wider boss platform.
- **Both:** coordinated palettes and atmospheric depth, with most detail at the
  perimeter and readable fighting space in the center.

The quality target is significantly above the current scenery. That target is not
yet proven in-game: artwork detail alone does not establish camera compatibility,
combat readability, sprite scale, animation quality or device performance.

## Production review notes

All eight images were reviewed as illustrations. Remaining integration concerns:

- The art still uses illustrative perspective. Match the actual gameplay camera
  before choosing final floor geometry, billboard anchors or background layers.
- Near-side balustrades and foreground steps in the Astral boss study must not
  become collision or camera occlusion in the actual arena.
- Thor's side channels and magma at the front of its boss platform are decorative;
  they must not enter the game's spawn/walk bounds.
- Reduce high-frequency peripheral carving where it competes with native sprites.
- Inspect dark monster silhouettes against Thor paving and keep lava highlights
  below the contrast needed for skill cues and damage numbers.
- Thor's three field studies retain a similar framing. Their different cascades,
  side formations and distant glow are a starting point; final production assets
  should reinforce group identity without needing a different battlefield layout.

No illustration should be pasted into the live game and presented as a finished
3D field. Next steps are production layer/asset separation, actual-camera blockout,
verified native mobs and real browser rendering checks.

See [native mob art plan](../MOB-ART-PLAN.md) for verified identity candidates and the
current source-file blocker.

## Material rates revised in the proposal

The owner requested much lower rates. Initial revised recommendations are 100×
below the first proposal:

| Material | Revised provisional rate | Expected kills per success |
|---|---|---|
| Map-specific crafting material | 0.035% | About 2,857 |
| Sigil from ordinary mobs/escorts | 0.0025% | 40,000 |
| Sigil from Stage 10 MVP | 0.1% | 1,000 |

These are recommendations, not implemented drop tables or guaranteed payouts.
Validate against measured kills/hour before locking them; high-speed idle farming
can make a tiny per-kill probability less rare than its percentage suggests.
Ascension Core rates remain unspecified. No existing-map drops were changed.
