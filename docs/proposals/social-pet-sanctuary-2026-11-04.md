# Proposal: Prontera Pet Sanctuary

**Research and design proposal, 4 November 2026. Not implemented; numbers below are starting points for playtesting, not established game balance.**

## 1. The idea

Give the Social Hub a **Pet Sanctuary**: pick one of the pets already obtained through monster drops, walk together, train it at the gym, challenge wild monsters, and eventually challenge other players. Keep the feeling of raising a partner from the original PlayStation *Digimon World*, but use this game's existing Ragnarok-inspired world, pets, animations and rules.

**My recommendation:** start with one visible partner, a small gym and a short PvE arena. Add friendly PvP only once both the combat loop and the authority model are sound. Let the main idle game continue, just as it does while visiting the plaza. Do not replace, consume or reset a player's existing pet.

### What makes Digimon World feel special?

Its Green Gym trains distinct parameters; care, fatigue, battles and other factors influence growth; and real-time fights have an autonomous partner responding to limited player commands rather than direct action-game control. Its lifecycle and evolution give raising a partner a story, including eventual rebirth with inherited stats. Sources: [Giant Bomb's Digimon World overview](https://giantbomb.com/digimon-world/3030-3899), [Digimon World care reference](https://digimonworld.fandom.com/wiki/Digimon_Care_(Digimon_World)). Fan guides disagree about exact care-mistake mechanics, so we should take the *feeling*, not reproduce opaque PS1 formulas.

Translate that feeling into our own design:

| Inspiration | Sanctuary version |
| --- | --- |
| Gym builds parameters | Short visual training sessions with clear stat gains and fatigue. |
| Needs and care | Feed, rest and bond; no offline starvation or permanent death. |
| Semi-autonomous fighting | Pet auto-attacks; player selects a few tactical commands on cooldown. |
| Different evolutions | Optional non-destructive specializations and cosmetic milestones, not replacement of a saved species. |
| Arena and exploration | PvE monster encounters, boss challenges and later friendly PvP. |
| Town rebuilding | Optional community progress to unlock decorations and facilities later. |

## 2. What exists in this repository today

- **20 existing pet species**, defined in `index.html` `PETS`. Existing `sp` values are saved array indexes, and the first eight and all subsequent indexes must stay stable. Pets drop from monsters, not eggs. Duplicates fold into species Bond; one owned pet per species is the current rule. Pets already have mutation, equipment, skills, passive bonuses and can be among the three field companions.
- `assets/pets/v1/catalog.json` contains all 20 species; `assets/pets.js` loads native local sprite atlases with **idle, walk and attack in eight directions**, checksums, bounded decoding and cache/disposal. `tools/native-pets/README.md` describes the source and generator. This is a real starting asset pipeline, not a promise that all possible new monsters are already ready for the Sanctuary.
- `assets/native-fields/v1/mobs.json` contains 70 monster records and `assets/reference-mobs.js` provides another atlas/frame player for field monsters. Some overlap with pet species. This catalog is a candidate source for PvE opponents, subject to confirming each selected monster's action coverage and permissions.
- The plaza is Three.js in `assets/social-scene.js`; `assets/social-rules.js` owns walkable layout and collision; `assets/social.js` connects its interface and the game; `workers/social/room.mjs` handles room state. The hub supports solo presentation, authenticated online rooms, and up to 20 players per plaza. Fishing is a useful integration example. It is a separate scene while field farming continues.
- `functions/api/social.js` resolves the account from the session cookie before forwarding the socket to the private Social Durable Object. The room already has validated messages, seats, reconnect behavior and server-managed poker. This is a useful pattern, **not** a finished pet battle authority system.
- The normal save is browser-authored. `docs/COMPETITION-SECURITY.md` explicitly warns that accepted saves and their pets, items and other progression are not proof they were earned. This matters enormously for ranked battles.
- Existing rules preserve current field pet balance, ownership and saves. Pet traits are 5–10% each; do not add a Sanctuary benefit that breaks the owner's existing 10% per-buff ceiling or the field balance tests without a separate decision.

## 3. Suggested player experience

### A. Sanctuary entrance and partner

Add a clearly labeled destination/entrance from the existing plaza, ideally as a **separate Sanctuary scene or bounded area**, after checking available collision space rather than crowding the existing fountain, poker tables and ponds. A player selects an owned pet from their current collection; no new hatchery and no mandatory starter pet. If they own none, show how to get one from monster drops. The selected partner follows the character while idle or walking, sits near training equipment and returns after a battle.

Other players in the same numbered plaza can see the selected pet, name and public activity. Avoid broadcasting private stats. Do not assume that the current `social-scene.js` already renders social pet followers: it does not expose such a feature in its player API today.

### B. Training gym

Start with four stations and simple, readable numbers:

| Station | Arena stat | Visual |
| --- | --- | --- |
| Poring punching bag | Power | Pet walks to bag and plays attack. |
| Mini obstacle course | Agility | Walk animation along a short route. |
| Shield dummy | Guard | Pet practices near a shield; use existing idle/attack poses. |
| Rune puzzle | Focus | Idle near runes and a simple effect. |

A session might take **10–20 seconds**, give one visible stat point, and increase fatigue. A player can cancel; grant progress only on completion. A modest daily training cap and capped stat allocation prevent an unattended gym from becoming an infinite advantage. Test these values rather than hard-code them now. Allow respeccing at a modest Sanctuary-only cost. Show the current and maximum values and exactly what each stat does.

Care should be gentle: training increases fatigue, resting restores it; feeding gives a small, temporary **Sanctuary-only** mood benefit. While offline, decay should be capped or needs paused; no pet dies, disappears or loses collected species. Do not punish someone for being away. Avoid mandatory toilet mechanics unless the owner specifically wants them.

### C. PvE monster arena

Use a small enclosed ring with an attendant, visible pet and enemy, a health bar and a log. Begin with a training dummy, then e.g. Fabre, Lunatic, Rocker and a Poring-family boss **after validating each actual catalog entry and animations**. Five short encounters can teach positioning and commands.

Draft battle loop: pets move into range, perform automatic attacks, then obey player commands such as **Attack**, **Guard**, and **Special** when eligible. An arena-specific energy bar and a handful of clear cooldowns keep combat watchable. The player chooses tactics, not every swing. Failed battles restore the pet after a short recovery; there is no permanent injury or loss.

Give PvE a separate, modest Sanctuary currency for cosmetics/decorations; no uncapped Zeny, field damage or drop-rate generation. Decide how much offline/solo trust is acceptable before enabling valuable rewards: local simulation can always be modified. Difficulty should account for rarity and arena build so a favorite Poring remains useful.

### D. PvP arena, after PvE

Start with **opt-in friendly 1v1**, challenge/accept in the same plaza, no betting, trading or rewards. Provide a visible rules screen, matchmaking/decline controls, no open unsolicited spam, battle timeout, reconnect grace period and clear forfeit behavior. Players and spectators see the same server-issued events. Add ranked, seasons, rewards and spectating only after testing the foundations.

Recommended first competitive format: fixed level and stat budget, published species rules and a small fixed set of arena skills. The server creates both loadouts from allowed definitions; do not accept raw client-submitted HP, damage, skill cooldowns or results. A server-defined rental roster is the honest way to have reliable competitive ownership at launch; a player's browser-saved owned pet can be a **clearly labeled cosmetic/unverified selection**, not proof of ownership. If ranked must use trained owned pets, first build a trusted server-owned pet collection/training ledger and an explicit migration/legacy policy. Normalizing stats alone does **not** prove an owned species, earned skills or legitimate training.

Later suggestions: weekly rotating PvE MVP, an asynchronous defense team *only with server-owned snapshots*, co-op boss raids, non-stat pet accessories, photo corner and community gym decorations. These should not delay the first playable loop.

## 4. Growth and compatibility choices

I recommend **a separate Sanctuary profile** keyed to the account and a stable species identity, not by mutating `PETS`, replacing `p.sp` or converting the existing species. Proposed fields: schema version; species key; nickname; training allocations; fatigue/mood and last update; unlocked arena moves; cosmetic selection; event revision. The existing pet instance `id` is randomly generated and saved; inspect duplicate folding, release/reacquisition, collision and migration behavior before treating it as a permanent unique identifier. Because the game currently folds duplicates into one species, species-keyed Sanctuary progress is a good candidate, but the owner must choose whether it survives release and reacquisition. Use an explicit stable string or sprite ID mapping and never reorder the existing saved numeric species IDs.

**Growth without replacing species:** give Poring training paths such as Guardian, Swift or Trickster (arena skill/loadout choices, not new monsters). If the owner wants Poring → Poporing → Angeling visual transformations, treat it as a separately approved feature: those are already distinct collectible species with different traits and rarity. Specify whether the other species must be owned, how its visuals and permissions work, and guarantee that neither collection nor field passives change silently.

For the first PvE build, local Sanctuary state may live in a versioned save field with defaults/sanitization and account-switch handling, clearly labeled casual/unverified. For real competitive progression or rewards, move the authoritative profile and ledger to server-owned D1 records; do not merely copy a mutable save into D1 and call it trusted. Separate field stats/mutation/equipment from arena values initially; this keeps the existing field economy and pet damage balance unchanged.

## 5. Animation and art research

### Best first option: reuse the current asset pipeline

Use `PGPetSprites.Store` and its catalog for owned pet art. Its canvas is 256×256 with a foot anchor at 128,192; animate from actual metadata and keep the nearest-neighbor pixel look. Add a Three.js canvas texture/billboard per visible pet, follow the owner's movement with smoothing and avoid overlaps. Switch idle/walk based on actual movement; use the server's battle attack event for attack playback, returning to idle when it finishes. Do not derive actual damage from a visible animation frame. Resolve camera-relative eight-way direction consistently with the scene and test all eight directions, movement transitions and mobile cameras.

The existing pack exports source action blocks 0–7 idle, 8–15 walk and 16–23 attack. That is a useful standard, **not a guarantee that every fan sprite or future monster has all actions**. Preserve recorded frame durations and offsets, and respect the existing pet playback tuning described in `tools/native-pets/README.md`. Missing actions need an explicit per-species fallback, never invented or repainted art. A pet can briefly keep its last good frame/thumbnail while its atlas loads; release textures, pin only active assets, cap simultaneous downloads, check integrity and test many visible players against the current 16 MiB store budget. A shared store needs careful reference/pinning management; do not dispose an image another player still uses.

Potential PvE monsters can use the current field catalog/`PGReferenceMobs`, after verifying source frames, pivots, timing, image memory and action availability. Avoid mixing the two metadata formats without an adapter. Confirm generator, catalog, sprite hashes and local publish/build rules before adding assets. No runtime dependency on a third-party public sprite host.

### GitHub and public asset candidates

| Candidate | What it actually provides | Recommendation and rights caveat |
| --- | --- | --- |
| [adsonpleal/ragassets](https://github.com/adsonpleal/ragassets) | MIT Go renderer for SPR/ACT/PAL and image/animation service; README says no game assets bundled. Current native-pet pipeline already pins a revision of its renderer. | **Best technical fit:** reuse the existing pinned generator instead of adding a live service. MIT covers the code, not Gravity's art. |
| [zhad3/zrenderer](https://github.com/zhad3/zrenderer) | MIT Ragnarok sprite renderer, supports monster actions, frames and rendered PNGs. Requires resources. | Useful alternative/reference; verify version and action metadata before adopting. Code license is not sprite permission. |
| [VatrushkaGPT/GRF-to-GIF](https://github.com/VatrushkaGPT/GRF-to-GIF) | MIT Windows desktop exporter using zrenderer; previews directions and original timing, exports frames/APNG/GIF; says it bundles no game assets. | Useful for artist inspection or one-off comparison; existing Go/Python pipeline is a better reproducible build fit. |
| [MrKitey/ragnarok-spritesheet-generator](https://github.com/MrKitey/ragnarok-spritesheet-generator) | MIT Rust desktop editor for ACT/SPR sheets; requires a local client data folder. | Possible inspection tool; verify monster support and metadata output before relying on it. |
| [MyGodIsHe/pyro-tools](https://github.com/MyGodIsHe/pyro-tools) | Python ACT/SPR extraction examples, including example data. | Research only: no clear repository license surfaced in the inspected listing; do not copy code or example art without checking rights and license. |
| [OpenGameArt CC0 pixel skeleton](https://opengameart.org/content/pixel-art-skeleton) | Author labels it CC0; has a single idle pose, walk and attack frames. | Possible disposable technical placeholder, **not Ragnarok art** and side-view rather than eight-direction RO. Verify provenance, author claims and suitability; do not add it to the game without approval. |
| [Skyflakes free monster sheets](https://skyflakes-lab.itch.io/free-monster-sprite-sheet) | Two side-view monsters with idle, walk, attack and hit/death; creator describes commercial/personal use with no asset-pack redistribution. Page says AI-assisted graphics. | Potential placeholder only after reviewing full terms and art policy; not RO-style eight-direction animation, and do not redistribute as an asset pack. |

**Important rights distinction:** Ragnarok Online's sprites and designs belong to their rightsholders. An MIT-licensed viewer/exporter does not grant a license to game data or a fan's derivative sprites. The repository already contains native RO art and source manifests; that is a technical fact, not proof of authorization. Before public deployment or distributing additional RO sprites, obtain appropriate permission/rights advice. For fan-made sheets, identify the actual artist and license for each file, check whether they are original or derivative, preserve required notices, and verify commercial and redistribution rights. If those rights cannot be cleared, commission or license original eight-direction art inspired by the *general* aesthetic rather than using protected designs. This is not legal advice.

## 6. Proposed technical design

### Client

1. Add a small `assets/social-pets.js` module for partner selection, scene lifecycle and Sanctuary UI. Add styles separately. Keep scene drawing in `social-scene.js` or an isolated scene module; define station areas, collisions and paths in `social-rules.js` rather than scattering coordinates.
2. Extend player snapshots with only validated public presentation data: an allowed species key and bounded nickname/activity; no client-provided asset paths, HTML or trusted stats. Escape displayed text. Rate-limit appearance/activity changes and cap the number of visible followers. On join, leave, room change, hidden tab and disconnect, handle loading and cleanup.
3. Training/PvE initially use a pure rules module with injected clock and RNG to enable deterministic tests. Local/casual means deliberately unverified, not cheat-proof. Separate simulation state from the sprite renderer.
4. Preserve the existing account save and field loop. Add versioned defaults and sanitizers; test old saves, malformed data, cloud conflicts, logout/login/account switch, release/reacquire and duplicate folding. Do not alter existing species indices, field pet stats, trait percentages or character progression.

### Authority for online battles

- The authenticated Pages endpoint must establish identity and route requests privately, as the social socket does. A battle coordinator (a dedicated Durable Object is a candidate) owns each match, validates consent, participants and command rates, uses a server clock and a versioned ruleset, simulates battle and broadcasts numbered events/snapshots. Clients send intents only. Fix seed/RNG policy server-side, record enough for review and reconnection, and apply no client-reported damage/win.
- Define `invited → accepted → starting → active → completed/cancelled` states, expiry, command windows, simultaneous action ordering, timeout/draw, reconnect, duplicate message and idempotency semantics. Reconnect requests a versioned snapshot plus later events, not replaying reward actions. Never expose secrets or allow a spectator to command a battle.
- DO storage can persist active match/replay state; D1 can own competitive account progress, result and rewards. They are **separate transactional systems**: do not claim a single cross-DO/D1 transaction. On completion persist a stable match ID and outcome in the DO, retry an authenticated internal settlement call; in D1 use a unique match ID and transaction to insert the result and all ledger entries exactly once. Acknowledge only after commit; retry on timeouts/restarts. Design recovery for crash before/after commit and duplicate/out-of-order deliveries. No valuable rewards until that path is exercised.
- A D1 entry proves only that the **server** produced it from trusted inputs. Existing browser-authored pets and skill values are unverified. Ranked progression based on personal trained pets requires server-observed acquisition and training, and a transparent policy for old saves, GM-granted pets and offline play. Decide that policy before promising ranked integrity.
- Estimate activity, player count, message frequency and per-match event/storage volume before choosing an update rate and Cloudflare capacity. Avoid writing D1 or broadcasting a sprite frame every animation tick. Use sparse battle events and client interpolation, with resource limits and retention/deletion policy for logs.

## 7. Delivery plan and acceptance gates

| Phase | Outcome | Acceptance gate |
| --- | --- | --- |
| 0. Rights & design | Decide native-art rights, game boundaries, ownership and competitive policy; mock up location and rules. | Owner approves decisions; verify asset provenance and individual action coverage. |
| 1. Visible partner | One selected existing pet follows in solo and online plaza. | Idle/walk, eight directions, correct feet/pixels/timing, join/leave/reconnect, bounded memory with multiple players; old saves and field farming unchanged. |
| 2. Gym & care | Four stations, simple progression and rest; initially casual. | Accurate completion/cancel, persistence and account isolation, offline policy, mobile usability, no field-stat change. |
| 3. PvE | Practice dummy and small monster ladder with auto-battle and commands. | Visible idle/walk/attack and event-synced hits, wins/losses/retry, no duplicated rewards, performance with 20-room-player target. |
| 4. Friendly online PvP | Server-owned match simulation with fixed/rental loadouts and no valuable rewards. | Two-player and spectator consistency; invalid intents, replay, duplicate, disconnect, server restart, forfeit and rate limits tested. |
| 5. Optional ranked | Trusted competitive roster/progression, D1 settlement and audited reward ledger. | Explicit legacy/GM policy; load/cost and anti-abuse review; transactional settlement/retry and hosted failure testing. |

Phase 1 can be the first vertical slice; phases 2–5 are not approved merely by approving it. Estimates would depend on art rights, final scope, multiplayer infrastructure and hosted testing; do not promise a date from this research alone.

### Tests to add when implemented

- Pure rules: stat caps, fatigue, clock changes, cancellations, battle cooldown/order, deterministic RNG, draws and malicious inputs.
- Save/migration: legacy and corrupted data, account switching, race/conflict handling, id collisions, release/reacquisition, duplicate fold and no changes to field pet balance. Existing checks include `pet_sim.js`, `pet_game_sim.js`, `pet_sprites_sim.js`, `save_load_sim.js` and `social_*_sim` in `tools/tests/`.
- Multiplayer: consent/ownership boundaries, room isolation, session expiry, command throttling, reconnect/forfeit, state/event ordering, DO restarts, settlement retries and exactly-once result and rewards. Real hosted staging and network interruption tests are needed beyond local mocks.
- Browser: inspect frames and pivots for each selected species in eight directions; attack playback vs hit event; screen readers/keyboard/touch; 360px mobile; 20-player stress and decoded texture budgets; no visual regression in fishing, poker or field grind.

## 8. Decisions for the owner

1. **Scope:** start with visible partner + gym + a short PvE ladder, with PvP later? Or prioritize a smaller gym/PvP-only prototype?
2. **Which pets?** Use existing collected pets, one selected at a time? Should a Sanctuary profile survive release and reacquisition of its species?
3. **Evolution:** non-destructive specializations (recommended), or visual/species transformations with separate ownership rules?
4. **Care:** gentle fatigue and feeding without death/offline punishment (recommended), or a more demanding PS1-style lifecycle?
5. **PvP fairness:** fixed rental roster and normalized builds first, or invest in server-authoritative owned-pet acquisition/training before ranked?
6. **Art rights:** are rights secured to deploy the current and any additional RO assets? If not, should public release use licensed original lookalikes instead?

## Sources and limitations

Research accessed 4 November 2026. Source links are embedded above. GitHub tool descriptions and stated licenses are from their project pages; no third-party code or art was imported, no external sprite was executed, and no permission to distribute any RO asset was established. Repository facts were checked against the current checkout; the design, reward values and architecture remain proposals pending implementation and testing.
