# Digimon Sanctuary: sprite comparison and implementation proposal

**Status: for selection, not implemented.** 5 November 2026. The owner chose a **separate Social Hub Digimon system**, leaving existing Ragnarok pets and their field progression intact. The owner asked to compare the Digimon Up frames with Digimon World 1 models before deciding, and asked whether assets can be found online.

## Start with the pictures

Open `digimon-sprite-comparison.png` in the repository viewer. It shows the **actual Digimon Up Agumon sprite** next to an **actual Digimon World 1 Agumon model** that I rendered locally from a third-party GitHub model. It also shows 16 Digimon Up sprites in four example evolution lines.

The existing `pet-evolution-sprite-showcase.html` includes working idle, walking and attack previews for Agumon, Greymon, MetalGreymon and WarGreymon, plus earlier Ragnarok ideas. It is a self-contained reference, not the new game feature. The comparison image is a still: it does not prove animation quality for all 280 entries.

## Executive recommendation

For the Sanctuary, **Digimon Up 2D frames are the better first prototype**, subject to an explicit asset-use decision and rights clearance. They look much closer to the existing Ragnarok pixel sprites, come with the four basic animation types and cover a large roster. Start with four playable evolution lines, not all 280 entries at once. Prototype in a separate, fixed-view or carefully designed arena so the lack of true eight-direction views is visible and acceptable rather than hidden.

The PS1 model path is technically real, and we found online samples, but it is more work to map unnamed clips, process game-specific animation data and render a 3D creature consistently beside the existing 2D character art. Retain it as an alternative, not a promise of asset availability or rights.

## 1. What I found online and actually checked

| Source | Data available | What I verified | Fit and limits |
| --- | --- | --- | --- |
| [dannyphang/digimon-up-sprites](https://github.com/dannyphang/digimon-up-sprites), commit `4eaee71cc949953e45ce5a77564469ba93e36907` | Baked 2D PNG sequences from Digimon Up, plus an incomplete profile/evolution JSON. Its README describes idle, walking, attack and faint at 62.5 ms per frame. | Inspected the Git tree: **280 named folders**, all 280 have all four action directories, totaling 17,666 PNG files (4,425 idle, 3,622 walking, 4,549 attack, 5,070 faint). This is folder/asset coverage, not proof that 280 unique species are perfect: some names are variants. Opened 16 selected species' frames and displayed samples. | Best fit for an initial 2D visual experiment. The repository describes its images as a non-commercial fan project and says the art belongs to Bandai Namco. One rendered viewpoint per sequence; no verified eight-direction set. |
| [DW1ModelConverter](https://github.com/Operation-Decoded/DW1ModelConverter) | MIT-licensed tool converts the user's extracted Digimon World 1 game data into textured, animated glTF. The README maps internal IDs to names. | Read the tool's usage and output caveats. It needs the contents of the game disc; I did not run it or supply a disc. Its animations are not named, and certain PS1 information lives in extras. | Original PS1 look and natural 3D rotations, but the converter alone is not a ready-to-use sprite pack. Requires clip classification, quality checks and actual game files or separately obtained model outputs. |
| [Skyweldor PS1 model harness / PR 12](https://github.com/Skyweldor/sky-portfolio/pull/12) | The author reports 125 Digimon, 146 variants, 4,094 numbered clips and approximately 45.4 MB of processed GLB models for the full collection. The project files include a public `AGUM.glb`. | Retrieved **one** Agumon GLB from its GitHub repository, SHA-256 `ed297c17c86c5787da6f0462703e83063f74f11737a05d8dd98cebdfb49493ab`, and loaded it with Three.js/GLTFLoader in headless Chromium. It contained 44 named-by-slot clips and rendered the comparison image. I did not independently audit the complete collection or classify the clips. | Demonstrates a real online model source, not proof of a license to redistribute. The PR's full-roster counts, optimization and testing are the author's claims, not measurements made here. |

Digimon Up's author documents that some profiles are missing and evolution records need community work. Their [PR describing the baked frames](https://github.com/dannyphang/digimon-up-sprites/pull/1) reports about 166 MB for the full frame collection. Avoid importing the entire dataset into this game just because it exists. GitHub availability, an MIT tool, a fan-use note or owning a game disc are **not** permission to publicly distribute artwork or use Digimon trademarks. Secure the relevant rights for the intended game before release; this is not legal advice.

## 2. Side-by-side decision

| Question | A: Digimon Up sprite frames | B: Digimon World 1 3D models |
| --- | --- | --- |
| **What does it look like?** | Detailed 2D pixel art from a different Digimon game. | Low-poly textured characters from the original PlayStation game. |
| **Fit with our current hero** | Closer to the existing 2D billboard art, but its proportions and detail still need visual tuning. | 3D models next to a 2D hero; closer to PS1 nostalgia, potentially less visually consistent. |
| **Basic animation** | Four supplied frame sequences per checked folder. Some may need visual fixes, cropping or action-event tuning. | Many clips per model, but converter output uses numbered/unnamed animations. Each species and clip must be identified and tested. |
| **Walking and facing** | These sequences have one baked view; no verified front/back/eight directions. Moving left/right can be mirrored only if approved, and still does not create real back views. | Can rotate freely in 3D; model orientation, root travel, camera, material and lighting require work. |
| **Cost to start** | Lower: adapt the game's canvas/billboard and atlas pattern. Need a packing and frame-integrity pipeline. | Higher: integrate compatible `GLTFLoader`, cloned skeletons, animation mixers, clip maps, caching and more GPU/performance testing. |
| **Coverage** | 280 folders in the inspected commit, including variants; profiles and quality need audit. | Online collection author reports 125 Digimon and 146 variants; not all variants have the same clips. Converter supports data from the original game. |
| **What is still missing** | True multi-direction art; good hit reactions, eating/sleeping/training where not supplied; per-species move design; clean provenance. | Usable labels for animation slots; certain PS1 texture/blend/loop behaviors; integration and rights. |
| **Rights** | README says non-commercial fan use; no public-game distribution permission verified. | No permission established for model data. MIT converter code does not license the models. |

**Recommendation:** A for a 2D feasibility slice. If authentic all-direction motion is essential, B or new licensed directional artwork is a better fit. Do not falsely label a single-view sprite as eight-directional, repaint missing directions or silently replace the existing Ragnarok rendering policy. Choosing a fixed-view Digimon-only arena would be an explicit exception for this separate visual system, not a change to the current pet pack.

## 3. Proposed playable experience

A **separate Digimon Sanctuary** is entered from the Social Hub. Current Ragnarok pets remain exactly as they are, including the collection, three active field pets, Bond, mutation, passives, equipment, saved numeric species indices and monster-drop rules. The field grind continues while visiting. Digimon do not replace or become Ragnarok pets.

### A. Getting a partner

Offer an introductory choice between **Agumon, Gabumon, Patamon and Palmon** after an introductory Sanctuary encounter. These are a proposed separate roster, not existing game collectibles. A player initially selects one, names it and brings it to the Sanctuary. More partners can be earned through a separate sanctuary challenge or collection system; the precise acquisition rules are an owner decision. This design does not alter existing pet drops or add hatching to the existing Ragnarok pet system.

### B. Training and care

Four visually distinct stations train Power, Guard, Agility and Focus. Training plays a relevant walk/attack/idle animation, awards one capped point at the end and increases fatigue. Feeding and resting manage care; there is no permanent death, loss of progress, or punishment for being offline. These mechanics are game logic we would build—**the sprite repository does not supply a complete playable Digimon raising system**.

As an initial test only: four stats capped at 12, total allocation capped at 24; a 15-second session gives one point and 10 fatigue; rest removes fatigue. Tune only after real simulations and user playtests. No Sanctuary trait affects field power, Zeny or existing buffs.

### C. Branching evolution

The reference image shows these **proposed, selectable** four-stage lines. I verified that each named folder exists at the pinned Digimon Up commit with the four animation directories; I did not independently validate every frame or every possible canonical evolution relation.

1. **Fire:** Agumon → Greymon → MetalGreymon → WarGreymon.
2. **Wolf:** Gabumon → Garurumon → WereGarurumon → MetalGarurumon.
3. **Holy:** Patamon → Angemon → MagnaAngemon → Seraphimon.
4. **Plant:** Palmon → Togemon → Lillymon → Rosemon.

The player's training and PvE progress unlock choices, and the player explicitly confirms evolution. Add divergent choices such as a defensive versus offensive form only after auditing the art, eligibility and balance. Do not copy unverified profile text or blindly trust every link from the source JSON. Same-species mastery stays available as an optional progression path if the owner still wants to keep a favorite form. Returning to an unlocked appearance outside battle can be a separate setting to approve.

**Illustrative gates**, not established game facts: four training sessions and two PvE victories for stage 2; a higher stat total and a trial for stage 3; a later boss challenge for stage 4. Show requirements before the player commits. Whether one partner can eventually unlock several branches and how often it can switch are owner decisions.

### D. PvE area

A small arena offers a training dummy, a short ladder of other Digimon, and a trial boss. Your companion auto-attacks while you can request Attack, Guard or a special technique. A 90-second match, visible HP/energy, cooldowns and a clear event log make fights understandable. Defeat ends the match without deleting the Digimon. Start with no valuable rewards; later use Sanctuary-only cosmetics or a carefully capped economy.

Visual adapter:
- `idle` loop while standing; `walking` loop while moving; `attack` once per action, then return to idle; `faint` once on defeat.
- The repository suggests attack looping as a generic preview; the actual game should play it as a one-shot **per attack event**, not loop forever. Battle damage is server/rules driven, not based on trusting image frames.
- Anchor using each sequence's shared origin; maintain consistent scale/foot placement. Different art can include effects and widely different transparent padding, so measure and test each species. Do not crop by eye into inconsistent jumping frames.

### E. Player arena, later

Friendly opt-in 1v1 first: request/accept, normalized server-defined rental builds, 90-second timeout, reconnect grace and no stakes. The server simulates actions and the result; clients send intents and render them. A competitor's normal cloud save is browser-authored, so it cannot establish legitimate earned Digimon or training. If ranked must use a player's raised companions, build server-owned acquisition and training, a migration policy, rate limiting and an idempotent result/reward ledger first.

### F. Additional ideas

A photo corner, NPC tournaments, weekly bosses, spectator seats, a Digimon field guide, a daily gentle-care objective and co-op bosses are candidates after the core works. Do not add all of them to the first release.

## 4. How it fits the repository

1. **Create a distinct namespace and identity.** Keep `S.pets`, `PETS`, existing field sprite packs and the current skill/bond formulas untouched. Casual Sanctuary progress could initially use a versioned `S.digimonSanctuary` with account-scoped defaults and sanitizers. Current account save data is unverified, so no competitive authority follows from saving it.
2. **Add a small source manifest and build tool.** Pin the actual source commit, source path, hash, frame order and 62.5 ms timing for each approved Digimon and action. Assemble small local atlases and metadata rather than 17,666 loose requests. Record what was imported and the rights status. The files in the research screenshot are not approval to ship them.
3. **Keep downloads bounded.** Load the active Digimon and opponent on demand; use shared atlases, an LRU/decoded-memory budget and explicit disposal. Store animation state and selected form, not individual downloaded frames, in the save. Do not check the complete 166 MB source dataset into Git by default. Measure actual bytes and memory for the selected roster before setting budgets.
4. **Adapt the existing visual scene.** `assets/social-scene.js` uses Three.js billboards and canvas textures; add a dedicated Digimon scene/adapter. Keep `assets/social-rules.js` authoritative for interactions and walkable areas. For the sprite-only prototype, agree on a single-view/fixed-camera presentation and whether mirroring is acceptable. Stop if the owner requires true eight-direction art: those frames were not found here.
5. **Separate logic from art.** Add a pure rules module for growth, fatigue, evolution, skills and battles, with an injected clock and RNG; the renderer observes its events. Add an independently versioned network protocol for public display and future arena actions.
6. **Make multiplayer authoritative before rewards.** Reuse account-authenticated social sessions. A server-owned match coordinator validates both players' consent, commands, cooldowns and loadouts; the client never sends a result or raw damage. Match storage and D1 are separate transactional boundaries: persist a stable match ID, then retry idempotent D1 settlement using a unique result/ledger constraint. Keep ranked disabled until tested.
7. **Extend production packaging only after approval.** The current `tools/build_site.sh` publishes `assets/`, not `docs/` research material. Legal review, notices, a pack manifest, asset budget and production/staging tests must precede shipping any art. No external-host hotlink dependency.

## 5. Practical rollout and acceptance gates

| Phase | Scope | Evidence required |
| --- | --- | --- |
| 0. Rights and visual decision | Confirm intended use, choose sprites/models and select starter roster. | Asset origin and intended distribution reviewed; owner accepts the direction limitation or chooses an alternative. |
| 1. Proof of concept | Separate single-view Sanctuary with Agumon + a dummy; idle, walk, attack, faint; no rewards. | Frame order, size, transitions, mobile and performance verified; no field/pet/save changes. |
| 2. Small evolution roster | Four named lines, actual unlock screen, training and care. | All 16 species/4 actions visually audited; unlocks, cancel, account switch, reload and no data loss tested. |
| 3. PvE | Small enemy ladder, skills, win/loss, restart and safe capped reward policy. | Battle correctness, economy limits, failure/retry and animation-to-event alignment tested. |
| 4. Friendly PvP | Opt-in server-authoritative normalized matches, no valuable rewards. | Two clients, disconnects, hostile/duplicate messages, restarts, load, privacy and room isolation tested. |
| 5. Expanded roster/ranked | Additional reviewed Digimon and optional trusted progression. | Actual measured bytes/memory, art clearance, competitive migration and idempotent rewards approved. |

No delivery date or full-roster quality claim can be made until the approved art is audited, gameplay is implemented and performance/security are measured. This proposal is not implementation approval for any phase.

## 6. Risks and questions for the owner

- **Art style:** choose Digimon Up 2D sprites, PS1 3D models, or commission licensed original creatures. Does the single-view limitation for Digimon Up feel acceptable?
- **Intended release:** private experiment or publicly available/monetized game? The current fan-use wording does not establish public or commercial rights; rights-holder authorization is a gate for release.
- **First roster:** are the four proposed starter lines the ones you want, or should we choose others from the 280-folder source?
- **Gameplay relationship:** separate Sanctuary is selected. How should new Digimon be acquired, and should players be able to switch between unlocked evolutions?
- **Scope:** approve a small no-reward Agumon prototype first, or revise the proposal before any code is added?

## Provenance and limits

The PNG comparison contains sample Digimon artwork for visual research. The 2D frames are from the pinned Digimon Up GitHub commit; the PS1 image is a screenshot of an online Agumon GLB rendered locally, not a successful local disc extraction. The original downloaded GLB is not added to the repository. No game assets or code were added to runtime, no rights were obtained, and no gameplay, deployment or migration was performed. This document, image and previous HTML reference persist as project files, not a public web deployment.
