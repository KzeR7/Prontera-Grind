# New-map proposal review

> Current implementation (haven-v155): Maps → **Ascension Map** enters live
> Astral/Thor fields in the main battlefield. Each has five stages (1–2 / 3 / 4 / boss 5),
> native mobs, cards and materials for N+ weapon evolution and Ascension skill growth.
> No equipment drops. Astral has redesigned space/ruin/rune scenery with grounded pillars.
> Historical ten-stage studies, screenshots and earlier plans below retain their sources.
> See [Game design](/docs/GAME-DESIGN.md) for current gameplay.



## Current review package — non-mob preview completion pass

Read the [full detailed proposal](FULL-PROPOSAL.md). Astral is now **one continuous
floating bridge through space**, leading to the boss at its far end. Stage groups
are four zones on that route, not detached stone rooms. Thor's ordinary fields use
irregular volcanic terrain; the approved Thor boss scene is preserved.

Run the complete live review from the repository root:

```sh
PREVIEW_PAGE=tools/map_scene_review.html python3 tools/preview_server.py 8000
```

- **Root (documented command):** complete board with journey entry, whole-bridge hero and eight local rendered views.
- **`/tools/map_journey.html`:** new native-character walking prototype and small-detail overlay. The current Arena live preview opens this page directly.
- **`/tools/map_scene_preview.html`:** real-time detailed scenery studio.
- **`/tools/map_proposal.html`:** original concept-art viewer.
- **`/game`:** unchanged game.

The board opens the full written proposal and links directly to every stage group,
including the attached Astral terminus and approved Thor boss. Use **Whole bridge**
and **Follow bridge → boss** in the studio to inspect the journey (camera only). No per-step approval or console commands are needed.
See [scenery development notes](../../tools/maps/README.md) for source, controls,
resource contracts, generation commands and test results.

## New walking/detail prototype

Quick transitions are on by default (long trips target about 3.5 seconds); turn
them off for normal detail-inspection walking. Encounter layouts clear during
travel, including pauses; only the destination is prepared on arrival.

Click a stage or Next stage in the journey workshop: the native character travels
along the bridge and the camera follows. Arrival, not selection, updates the stage.
The same bridge stays loaded, including when returning or passing several stages.
Pause/resume, whole-route view, closer framing and detail/motion controls are available.
All stages are unlocked for inspection; this does not implement combat or progression.

566 additional Astral pieces add inlays, compass markings, chips, edge fixtures,
chain links, support brackets and torn pennants. Thor's approved scene receives no
new overlay. The existing audited native character pack is reused unchanged.

The twelve mob identities and stage positions are prepared, **not animated mobs**.
Original ACT/SPR files are still required. Optional spawn rings are explicitly
labelled layout markers, not creatures. Actual new captures and source hashes:
`journey-review/manifest.json`.

## Four progression zones per destination

| Stages | Astral Citadel | Thor Volcano |
|---|---|---|
| 1–3 | Arrival Span | Outer Fissure |
| 4–6 | Ruined Crossing | Magma Gallery |
| 7–9 | Celestial Approach | Core Approach |
| Boss / 10 | Bridge-End Sanctuary | Primal Core |

Actual browser captures and their source/material checksums are recorded in
`scenery-review/manifest.json`. These are not AI concept images presented as
in-game screenshots. The viewer remains a dev-only scenery proposal; no playable
map navigation, combat, save fields or live drop tables have been added.

The original illustrative concepts below remain for historical atmosphere reference:

- [Astral Citadel original concept](astral-citadel.png)
- [Thor Volcano original concept](thor-volcano.png)
- [Eight illustrative environment studies](environments/README.md)

These illustrations are not production atlases or replacements for native sprite art.

## Materials and native monsters

Revised material recommendations remain provisional: 0.035% crafting materials,
0.0025% ordinary-mob sigils, 0.1% MVP sigils. No live drop rate changed.
Native monster sprite files remain missing; see the [native mob art plan](MOB-ART-PLAN.md).
Original native artwork and saved pet ordering must be preserved.

## Checks

```sh
node tools/tests/endgame_scenery_sim.js
node tools/tests/map_scene_review_sim.js
node tools/tests/map_proposal_sim.js
node tools/tests/publish_sim.js
```

Simulation DOM checks require jsdom. Real browser commands and the software-WebGL
limitation are documented in the scenery development notes. Physical-device GPU
performance and final monster/skill readability remain unverified.

## Final preview controls and deferred mobs

Compact stage travel controls now remain on screen on phones. Whole-bridge
checkpoints are clickable; arrow keys, Space and Home/End also navigate the
preview without intercepting form controls. Direct URLs support `map`, `stage`
and `view=overview`; they are inspection state, not saved progression. Arrival
feedback, wider Astral boss framing, bounded loading fallbacks and lower-cost
rendering controls complete this preview pass.

Four current render captures, including the Astral boss terminus, are pinned in
`journey-review/manifest.json`. Native mob artwork is **deferred**, as the owner
allowed. The last source attempt is recorded in `mob-source-checks.json`; no
required sprites were recovered. This status does not mark live combat, gameplay
integration, final balance or device performance as finished.

## In-game access

Build with `bash tools/build_site.sh`, then run `node tools/dev_server.js` and
sign in/register in the local game. Open **Maps → Season 2 Maps**. The two
new entries open isolated scenery exploration with your saved native appearance;
Return to game/Escape releases the scene. Your original field keeps farming.
These are not yet new farming-map IDs, saved unlocks, mobs or reward tables.
See [actual game UI checks/captures](game-ui-review/manifest.json).

## Delivery footprint

The walking workshop uses destination-only lossless WebP environment delivery
(2.29 MB Astral / 2.82 MB Thor; exact source pixels). Concept/review/source files
remain dev-only. Only selected lossless runtime files now ship for the atlas explorer. See the
[cloud-data audit](../CLOUD-DATA.md) and [delivery pipeline notes](../../tools/maps/README.md#environment-delivery-size--cloud-audit).

The map window has two adjacent collection tabs: **World Atlas** on the left and
**Season 2 Maps** on the right. Astral Citadel and Thor Volcano live only in the
Season 2 tab; the normal atlas retains its original farming destinations/stages.
Switching tabs does not change the farming field or saved progression. Arrow keys,
Home and End navigate the tab bar; the collection selection is UI-only.
