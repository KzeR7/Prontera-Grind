# Digimon Sanctuary: arena graphics direction

Status: research and next-stage proposal, not implemented arena artwork.

## Visual target

Replace the temporary labeled discs with a detailed outdoor Digimon Sanctuary
that belongs in the existing Prontera plaza: crafted stone paving, layered
circular arena edging, seating and shelter, lighting, plants, subtle digital
motifs and a distinct training courtyard. Preserve the east pond, bridge,
fishing chairs, player paths and the surrounding hub's character; do not make
the scene photorealistic at the cost of clashing with its Ragnarok scenery.
Keep battle silhouettes readable and designs attractive from the actual rotating,
zoomable camera as well as on a phone.

## Online material candidates (researched 2026-11-05)

- [ambientCG Paving Stones 048](https://ambientcg.com/view?id=PavingStones048):
  medieval wave-pattern paving for the arena approaches. The site states its
  materials are CC0; it offers multiple resolution tiers. Alternative:
  [Paving Stones 065](https://ambientcg.com/view?id=PavingStones065) for a more
  regular squared path.
- [Poly Haven Stone Floor](https://polyhaven.com/a/stone_floor): worn stone
  paving with color and PBR texture maps, listed as CC0, suitable for a contrasting
  border or courtyard. [Gravel Ground 01](https://polyhaven.com/a/gravel_ground_01)
  is another CC0 option for softer training-ground paths.
- [Kenney Nature Kit](https://kenney.nl/assets/nature-kit): CC0 low-poly foliage
  and rocks, potentially useful for low-cost background dressing; its low-poly
  look needs a style comparison with the existing native scenery before use.

These are candidates only: none were downloaded or added to the game. Check the
specific file's terms and visual fit at import time. Keep source, exact version,
license and generated/resized outputs recorded in a manifest; avoid shipping
large unused texture sets.

## Implementation sequence

1. Produce an in-game visual design for the arena and training courtyard around
   the pond, with a clear footprint and sightlines; review it before replacing
   the placeholders.
2. Build the geometry and materials as a bounded, versioned asset set, choosing
   texture resolution based on real desktop/mobile view and budgets. Existing
   plaza town materials are mostly unlit `MeshBasicMaterial`; realistic PBR
   maps do not become useful simply by downloading them. Evaluate lighting,
   color-space, tile scale, mipmaps, shadow cost and low-end fallbacks deliberately.
3. Update shared browser/worker navigation only where actual solid geometry
   requires it. Verify every pond chair, fishing click, route and multiplayer
   seat remains accessible, plus camera, GPU memory and load-time budgets.
4. Build training and arena interactions after the visual/layout foundation;
   care, evolution and PvE/PvP progression remain separate design/engineering
   milestones, with server-owned competitive state before any ranked rewards.

## First in-game pass (haven-v328)

The placeholder discs now have generated stone paving, decorative inlays,
gem pedestals, entrance arches, planters and stepping paths. Solid scenery is in
the shared navigation layout. This is an initial style/layout pass, not yet the
finished high-detail arena proposed above. The texture was generated locally and
optimized; the online material candidates above were not imported. The solo
practice battle is in the Sanctuary window, not an in-world battle animation.
