# Pet Sanctuary — complete design proposal

**Status: proposal, not implemented.** Prepared 5 November 2026 for owner review. The owner wants pets to evolve into other species where possible, with some paths that keep the original species and some imaginative mixed-species branches. All numbers and example paths below are design starting points, not current game rules or promises of balance.

**Visual references saved with this proposal:**

- `pet-sanctuary-sprite-reference.png` — static reference showing the 20 existing pets, examples of proposed evolution lines and four actual Digimon Up samples.
- `pet-evolution-sprite-showcase.html` — self-contained animated reference. Open the file in a browser; the idle, walking and attacking buttons show available direction-0 frames. It also contains a short overview of this proposal. Neither file changes the game.

These files are in the repository, so they do not depend on a temporary live-preview server. They are not a public website or deployment; a permanent public URL would require a separately authorized publishing decision and an art-rights review.

## 1. Vision

The Social Hub becomes a place where you can **raise, evolve, train and battle with your favorite Ragnarok-style monster**, inspired by the feeling of Digimon World on PlayStation:

1. Obtain a pet from the existing monster-drop system.
2. Bring it to the Sanctuary and let it follow you.
3. Train, feed and rest it.
4. Unlock evolution paths based on how it was raised, then **choose** an eligible form.
5. Challenge increasingly strong wild monsters, bosses and eventually other players' pets.
6. Show off the partner and its chosen form to other players.

The character's regular idle farming continues while the player visits, as it already does in the social hub. Sanctuary battles do not replace field battles.

### What we keep from Digimon World

A living companion, an actual training gym, care, evolution choices, indirect commands, a monster arena and a reason to return. We do **not** need to copy its exact franchise terminology, cryptic requirements, toilet mechanics or forced death/rebirth. See the [Digimon World gameplay overview](https://giantbomb.com/digimon-world/3030-3899) and [care reference](https://digimonworld.fandom.com/wiki/Digimon_Care_(Digimon_World)) for the inspiration.

## 2. Existing game and art: what is ready

The repository already has 20 owned pet species, indexed by the `PETS` array in `index.html`. Their sprite pack under `assets/pets/v1/` has idle, walking and attacking actions in eight directions, and `assets/pets.js` loads the frames and timing. Their thumbnails and actual animations appear in the saved visual references. Species saved indices are append-only and must never be reordered.

The field also has a separate native monster catalog in `assets/native-fields/v1/mobs.json`, with 70 records. It can be investigated for more arena opponents and evolution forms, but individual animation coverage, naming, timing, rights and conversion need checking. An entry in the field catalog is **not** automatically an owned pet or a tested Sanctuary evolution.

Players currently earn pets from monster drops; duplicates fold into species Bond, and current field pets have mutations, equipment, skills and passives. The proposed Sanctuary is an additional mode. It must not consume, duplicate or silently replace any of this progress. A player with no pet should be told how to obtain one from normal monster drops; there is no new egg/hatching requirement.

### Visual asset shortlist

| Category | Sprite IDs | Suggested use |
| --- | --- | --- |
| Jelly family | Poring 1002, Drops 1113, Poporing 1031, Angeling 1096, Ghostring 1120, Deviling 1582 | Strongest first branching-evolution family: similar silhouette, recognizable choices. |
| Forest creatures | Wolf 1013, Desert Wolf 1106, Nine Tail 1180, Smokie 1056, Yoyo 1057, Lunatic 1063 | Wolf to fox is a deliberate hybrid; keep rabbit, raccoon and monkey options if players prefer their original species. |
| Nature | Fabre 1007, Spore 1014 | Same-species mastery first; investigate suitable insect/plant transformations before promising a line. |
| Other companions | Peco Peco 1019, Dragon Whelp 1155, Baphomet Jr. 1101, Sohee 1170, Deviruchi 1109, Eddga 1115 | Same-species mastery first, or propose matching species after art and animation inspection. |

These are all present in the current pet catalog; presence does not establish legal permission to distribute their artwork.

## 3. Sanctuary layout

Enter from the existing Fountain Plaza. Final placement should be decided after checking its walkable geometry, collision, fishing and poker: a separate adjoining scene or instance is preferable to overcrowding the current plaza.

| Area | Player experience |
| --- | --- |
| **Companion corner** | Select an owned pet, name it, see its current arena form, stats, needs and evolution chart. It follows in the plaza. |
| **Training gym** | Four visible stations for Power, Guard, Agility and Focus. The partner walks to the station and plays an appropriate existing animation. |
| **Rest & feeding area** | A bench, bed or attendant for resting and feeding. Care is gentle and limited to Sanctuary progress. |
| **Wild monster ring** | Training dummy, PvE challenge ladder, retry and boss encounters. |
| **Player arena** | Invite, accept or decline a 1v1 duel. Battle space should show both combatants and their owners, with future spectator support. |
| **Notice board** | Shows current training, unlocked forms, PvE records and later tournament results. |

In the plaza, one selected partner follows each player. Other players see its public display name, species/form and animation, not private account data. One selected partner does not prevent the existing three pets from fighting in the field. Cap visible animations and texture memory for a full 20-player room; hide or simplify distant followers if performance requires it.

## 4. Raising and care

### Sanctuary-only stats

These are separate from field pet equipment, mutation, Bond, damage and passives.

| Stat | Purpose | Station idea |
| --- | --- | --- |
| Power | Physical attack strength. | Poring punching bag. |
| Guard | Health and defensive strength. | Shield dummy. |
| Agility | Attack interval and selected movement mechanics. | Obstacle course. |
| Focus | Energy recovery and access to tactical techniques. | Rune puzzle. |

**Illustrative initial test numbers:** cap each stat at 12 training points and total training at 24. One completed 15-second session gives one point and 10 fatigue. Do not allow an infinite unattended stat advantage. Show exact gains and caps before starting; allow cancellation without a gain. A reasonable respec method should let a favorite pet try another branch, without deleting progress.

These are examples for simulation, not tuned launch values. Do not introduce a field buff above the existing owner's 10% per-buff ceiling, or alter field balance under the guise of arena training.

### Fatigue, feeding and rest

- Fatigue is 0–100; at 80 or above, further training pauses until the pet rests. Rest is available for free or a modest Sanctuary-only cost; e.g. a 15-second rest removes 20 fatigue.
- Feeding gives a visible happy animation and perhaps a small convenience or cosmetic effect. Start with **no combat-stat bonus** until balance is tested.
- A player going offline never loses the pet, species, earned training or evolution. Offline hunger is paused. If passive fatigue recovery is allowed, it uses a capped, server-observed time for trusted modes; otherwise explicit rest is simpler.
- No permanent death, forced reincarnation, involuntary evolution, toilet requirement, or shrinking lifespan in the first version.

## 5. Evolution: the proposed core system

### Principles

1. **The player chooses.** Training, care and PvE wins unlock potential paths; an evolution screen shows the exact requirements, destination, visual, arena skill and any cost before confirmation.
2. **Some different species, some same species.** Jelly branches are the first real transformations. Some companions can remain their original species and unlock a mastery/rank and new arena move. The owner can approve additional mixed-species paths individually.
3. **A Sanctuary form is not a collectible.** Changing a Poring's Sanctuary form to Angeling must not create an Angeling pet drop, consume an independently owned Angeling, change the original `sp`, apply Angeling's field passive, or alter the field party. Any nickname and Sanctuary training stay with the original partner profile.
4. **No automatic surprise.** If several branches qualify, show all; let the player defer. A history shows unlocked forms. Switching among unlocked forms could be allowed outside battles after a modest cooldown, pending the owner's choice.
5. **Existing owners matter.** Whether the target species must already be collected is an open decision. My recommendation: earn access through Sanctuary milestones, but do not grant the target as a collectible. Requiring it would turn a rare drop into an evolution gate; automatically granting it would devalue existing collectors.
6. **Do not force a weak-looking partner to become useless.** Same-species mastery and mixed forms use the same overall arena stat/skill budget; transformations provide tactical identity, not an automatic win based purely on rarity.

### First evolution families — approval shortlist

These examples use already-present pet art. They are **our creative proposal**, not official Ragnarok evolution lore.

| Partner | Stage 1 | Stage 2 | Style | Example unlock direction |
| --- | --- | --- | --- | --- |
| Poring | Drops | Angeling | Holy jelly | Guard/focus training and several PvE wins; defensive special. |
| Poring | Poporing | Deviling | Shadow jelly | Power/focus training and a monster challenge; offensive special. |
| Poring | Poring | Ghostring | Spirit jelly | Focus and a spirit challenge; arena mobility/control. |
| Poring | Poring | Poring | Same-species mastery | Any balanced training; choose a new Poring special without changing sprite. |
| Wolf | Desert Wolf | Nine Tail | Wolf/fox hybrid | Agility and PvE wins; clearly label fox as an imaginative hybrid. |
| Wolf | Wolf | Wolf | Same-species mastery | Retain original Wolf sprite with alternative tactics. |
| Dragon Whelp | Dragon Whelp | Dragon Whelp | Same-species mastery | Keep the small dragon until suitable larger dragon art has been inspected and approved. |
| Peco Peco | Peco Peco | Peco Peco | Same-species mastery | Speed-focused moves; investigate bird forms separately. |

Directly owned Drops, Poporing, Angeling, Deviling, Ghostring, Desert Wolf and Nine Tail remain their own field pets. As Sanctuary partners, they can start with their original form and earn same-species mastery; specific alternative branches can be added after owner review. The same applies to Lunatic, Fabre, Spore, Smokie, Yoyo, Baphomet Jr., Sohee, Deviruchi and Eddga. We should **not invent missing intermediate art** or promise an unrelated transformation just to fill every row. The same-species path is a genuine gameplay choice, not a claim of new sprite artwork: rank and moves change while the sprite stays the same.

### Suggested milestone gates

A concrete playtest template:

- **Stage 0:** start as the owned pet with no Sanctuary stat points.
- **Stage 1:** complete 4 training sessions and 2 distinct PvE encounters; show compatible paths.
- **Stage 2:** have at least 12 total training points and defeat the Sanctuary trial; show compatible final paths.
- **Branch choices:** each form lists e.g. Power ≥ 4 or Focus ≥ 4, one challenge and its role. If a player qualifies for more than one, choose from the list. Retain the ability to unlock the others later.

All thresholds are provisional. Avoid secret care mistakes and irreversible traps. The design does not require an egg, pet sacrifice, real money or a new drop.

## 6. PvE arena

### Encounter loop

1. Select one partner and its unlocked Sanctuary form.
2. Choose an opponent and see recommended difficulty and possible rewards.
3. Enter a small bounded ring. The pet walks into range, attacks on its own, and visibly plays idle, walk and attack poses.
4. Issue three clear commands: **Attack** (normal aggressive behavior), **Guard** (brief defensive posture) and **Special** (one chosen move when energy and cooldown allow). Commands are intents; players do not manually click every attack.
5. Win or lose, return the partner safely. Show a battle recap and offer retry; no item or pet is lost on defeat.

### Starter ladder

| Match | Opponent | Purpose |
| --- | --- | --- |
| Practice | Training dummy | Teach attack, guard and energy; unlimited practice, no currency. |
| 1 | Fabre | First easy opponent. |
| 2 | Lunatic | Faster opponent. |
| 3 | Wolf | Introduce Guard. |
| 4 | Poporing | Introduce a simple status/energy decision. |
| Trial | Master Poring-themed opponent | Evolution milestone; use an available verified sprite or a configured opponent, not a fabricated new sprite. |

The exact enemy list and animations require approval and validation. Avoid relying on a particular monster merely because a catalog has an ID. Later, add a rotating weekly boss, cooperative boss encounters and cosmetic trophies.

### Example combat model — for playtesting only

Arena stat budget is separate from field multipliers. A starting test model could be:

- `maxHP = 140 + 8 × Guard`; `attack = 14 + 2 × Power`; `defense = 3 + Guard`.
- Attack every `max(1.0, 2.0 − 0.05 × Agility)` seconds. On contact, base damage `max(1, attack − floor(defense / 2))`.
- Energy cap 100, regeneration `2 + 0.1 × Focus` per second. A special costs 20 energy and has a 10-second cooldown. Test distinct moves, ranges and counterplay before finalizing any damage.
- Guard lasts 3 seconds, reduces incoming damage by 10%, and has an 8-second cooldown. No invisible RNG-based obedience in the first release.
- At 90 seconds without a knockout, declare a draw. The owner can instead choose a transparent tiebreak rule after testing.

Simulate all allowed builds and run real playtests; these simple formulas are not yet proven fair, fun, or consistent with animation timing.

### Rewards and economy

Keep the gym/arena on a separate Sanctuary currency and reward cosmetics, decorations or optional conveniences. Start with low, capped PvE rewards; no new uncapped Zeny, field power, drop chance or paid competitive advantage. Keep casual/client-run rewards explicitly unverified and nonvaluable, or disable them until the server owns the relevant accounting. A unique battle-result ledger is necessary before valuable online rewards.

## 7. Player vs player

### First release: friendly duels

- Both players opt in: select an opponent, send an invite, accept or decline. Add invite expiry, block/mute support and rate limiting.
- The server controls the match clock, legal actions, pet stats, energy, damage and outcome. Clients display/interpolate snapshots and send commands, not a claimed win or raw damage.
- Start with published normalized rules and a fixed server-defined rental roster, no stakes, rankings or valuable rewards. Let a player display a visually selected owned pet only with a clear label: current browser-authored ownership is not trustworthy proof.
- State what happens on connection loss: e.g. 20-second reconnect grace, then forfeit; simultaneous loss or server failure is a draw/cancel, not a duplicated win. A match is capped at 90 seconds. These timings are initial proposals.

### Later: trained pets and ranked

If you want a ranked arena using the player's personally raised creatures, the server must own or verifiably record pet acquisition, evolutions, training, arena loadouts and results. A normal accepted cloud save still contains browser-authored progression and is not proof a pet was earned. Existing pets need a transparent migration/grandfathering policy, including GM-granted and offline pets, before ranked is fair.

No ranked prizes or transferable assets until D1 settlement is idempotent and tested against duplicate messages, cross-system retries, disconnections and crashes. Ranked rules, skill balance, anti-boosting, season length, standings and dispute handling need a separate approval.

## 8. Animation and asset implementation

### Current Ragnarok art

- Use the existing local `PGPetSprites.Store` and `assets/pets/v1/catalog.json`. Read per-species frame order, pivot and delay. Preserve pixels and direction; do not assume all future assets share fixed frames or timing.
- Add a Three.js sprite/canvas texture to the social scene. Pick the correct camera-relative one of eight directions, use walk while following, idle when stopped and attack on a battle event. Keep animation distinct from actual battle damage and validate that no one can attack faster just by changing animation.
- Cache and pin active atlases only, reuse decoded assets where practical, release textures and images on leave/room change, and test the current 16 MiB decoded budget with many players. Gracefully keep the last frame or thumbnail while loading.
- New monsters require rights review and per-action inspection. The field-monster and pet catalogs have different metadata; write a tested adapter or regenerate through the existing asset pipeline rather than guessing anchors.

### GitHub tools and what they do

| Tool | Technical use | Limitation |
| --- | --- | --- |
| [ragassets](https://github.com/adsonpleal/ragassets) | SPR/ACT renderer; this game's native pet generator already pins a revision. Best fit for reproducible local exports. | MIT license applies to code, not Ragnarok images. No game assets included. |
| [GRF-to-GIF](https://github.com/VatrushkaGPT/GRF-to-GIF) | Windows viewer/exporter for inspecting animations, directions, frames and timing. | Needs an existing game installation; not run for this proposal. Its MIT code license is not a sprite license. |
| [zrenderer](https://github.com/zhad3/zrenderer) | Alternative MIT renderer for native Ragnarok sprite data. | Requires source resources and separate rights. |
| [Digimon Up sprites](https://github.com/dannyphang/digimon-up-sprites) | Four actual idle/walk/attack examples are embedded in the research showcase. Repository provides many more baked animation frames. | The project's README describes non-commercial fan use and identifies the art as Bandai Namco's. The examples are from Digimon Up, not PS1 Digimon World; eight-direction coverage is not established. |
| [DW1ModelConverter](https://github.com/Operation-Decoded/DW1ModelConverter) | Can convert original Digimon World PS1 monster **3D models**, textures and animations to glTF from game data. | Not run here; code license is not rights to the game models. |

**Rights gate:** Ragnarok and Digimon designs and artwork belong to their respective rightsholders. A GitHub project or permissive tool license does not authorize shipping ripped or derivative art. Do not distribute more sprites publicly without appropriate permission and review. If rights cannot be secured, commission original, properly licensed eight-direction creatures; do not copy a protected character's design. Existing art in the repository is a technical fact, not proof of permission. This is not legal advice.

## 9. Concrete implementation architecture

### Client and scene

- `assets/social-scene.js`: add the visible follower and station/arena presentation, or use a separate scene module to keep responsibilities contained.
- `assets/social-rules.js`: define walkable geometry, interaction points and collision; avoid breaking benches, poker and fishing.
- `assets/social.js` plus a new `assets/social-pets.js` and CSS: partner selection, gym, evolution chart, arena controls, error and reconnect UI. Validate public display names and never use untrusted HTML or asset paths.
- A pure arena rules module should take explicit state, commands, clock and RNG, so the same version is testable and usable by the server. Derive arena values from approved definitions; never use the current field damage formula as an unexamined PvP shortcut.

### Identity and persistence

Existing `S.pets` entries contain a saved species index and a randomly generated instance ID; duplicate folding, release/reacquisition, account switching and collisions must be audited before selecting any new identity key. Because there is one owned pet per species today, a stable species-keyed Sanctuary profile is plausible, but whether it survives release and reacquisition requires an owner decision. Preserve all legacy array indices.

For a solo/casual prototype, a versioned save field can hold Sanctuary-only state, sanitized on load and account-scoped; clearly label it unverified. For fair competitive progression, use server-owned records with a stable account ID, profile version/revision, permitted species, allocation, unlocked forms and event history. Migration must not overwrite a player's existing field save.

### Server authority and recovery

The existing `functions/api/social.js` authenticates social sockets via the account session, and `workers/social/room.mjs` owns room state. Reuse that trust boundary, not a client-supplied user ID. A dedicated match Durable Object is a candidate for invite lifecycle, authoritative simulation and ordered events, while D1 holds trusted profile, completed match and reward records.

Durable Object storage and D1 are not one transaction. Persist a match ID and final outcome in the match authority; retry an authenticated internal settlement. In D1, transactionally insert a unique match result and its ledger entries using that ID; only then acknowledge. Retry safely on lost responses or restarts. Put hard limits on commands, concurrent matches and event size; specify recovery, retention and privacy rules. No valuable reward until tested against failure before and after commit.

## 10. Rollout and acceptance criteria

| Phase | Deliverable | Done when |
| --- | --- | --- |
| 0. Decisions & rights | Approve evolution paths, artwork approach and area mockup. | Each selected sprite and rights status is documented; unresolved legal questions block public distribution. |
| 1. Companion | Select one existing pet; follower in solo and online plaza. | All 20 load correctly in eight directions; join/leave, room change, reload, mobile and memory are tested; field pets unaffected. |
| 2. Gym & care | Four training stations, fatigue/rest, visible progression. | Cancel/completion, stat caps, offline behavior, account switching and old saves are tested; no field benefit. |
| 3. Evolution + PvE | Jelly branch, one same-species path, a short PvE ladder. | Requirements are visible, selection explicit, existing collectibles unchanged, three animation states work, reward behavior is safe. |
| 4. Friendly PvP | Server-authoritative 1v1 with fixed builds, no valuable rewards. | Invite consent, rate limits, simultaneous commands, timeout, reconnect, server failure, room isolation and abuse cases tested with two clients. |
| 5. Optional ranked | Trusted profile and match settlement, balanced rules and seasons. | Legacy policy, security, cost/load, recovery, moderation and hosted failure tests approved. |

This is a phased design, not a promise of a shipping date. Exact time and cost depend on scope, asset rights, player capacity and the decision about trusted progression.

## 11. Test plan

- **Visual:** compare authentic frames, delay, anchors, eight directions, idle/walk/attack transitions and silhouettes. Validate both desktop and phone; ensure art is legible against the ring.
- **Data:** old/malformed saves, species ordering, duplicate folding, random-ID collisions, release and reacquisition, account changes and cloud conflicts; no mutation of owned pets or field passives.
- **Rules:** cap allocation/fatigue, pause/cancel, every unlock, invalid form, stat-budget balance, simultaneous actions, deterministic RNG, cooldown/energy, draw and no reward for aborted sessions.
- **Social:** 20-player target, bounded textures and server traffic, malformed names, rooms, spectators, reconnect and session expiry; no regression in fishing/poker.
- **Server & economy:** client forgery, duplicate requests and settlement, restart at each step, replay/out-of-order events, reward caps and account isolation; run hosted staging tests after local simulations.
- Existing relevant checks include `pet_sim.js`, `pet_game_sim.js`, `pet_sprites_sim.js`, `save_load_sim.js` and social simulation suites in `tools/tests/`.

## 12. Your decisions

1. Which visual route: **Ragnarok only**, a mix of Ragnarok and actual Digimon subject to licensing, or original licensed creatures inspired by both?
2. Approve which initial evolution paths? Do you like the Poring holy/shadow/spirit branches and the Wolf → Desert Wolf → Nine Tail hybrid?
3. Should all 20 pets start with same-species mastery while we research better matching alternate forms, or release fewer pets with more complete evolution trees?
4. Must the player already own the target species before evolving into it? My recommendation is **no**, but the evolved form is Sanctuary-only and does not create a collectible.
5. Should unlocked evolutions be freely switchable outside combat, or one choice per training cycle?
6. Gentle fatigue/rest with no death or offline punishment, or a stricter lifecycle?
7. Start with PvE first and normalized friendly PvP later, or prioritize PvP sooner with a smaller training system?

## Research and scope note

This is a complete design proposal, not a completed game feature or legal clearance. Sources were researched against the checked-out game and the linked project pages. The Digimon examples were actually retrieved for the non-game reference. The current repository file is persistent as project work, but no public deployment, migration, commitment, push or rights grant has occurred.
