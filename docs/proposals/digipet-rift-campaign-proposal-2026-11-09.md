# DigiPet: Rift Expedition — gameplay redesign proposal

**Status: proposal only, not approved and not implemented.** This document responds to the request for a clearer, more exciting player goal. It does not change the current DigiPet rules, save data, battles, training, equipment, or Social Hub map.

## The problem to solve

The current Sanctuary has a large collection, a DigiDex, repeatable training, battles, evolution and partner equipment. Those systems provide activities, but the player-facing destination is mostly “collect more” and “make the numbers go up.” A full index is a completion checklist, not a story goal; training sessions and gear refinement are chores when they do not move the player toward something memorable.

## Player promise and main goal

**Build a three-partner team, rescue the five lost Data Anchors, then defeat the Null Sovereign before it consumes the Sanctuary.**

The Sanctuary home screen should keep one prominent, persistent objective visible:

> **Next objective: restore the Tide Archive Anchor**  
> *Complete one operation in the Tide Archive and bring its boss-core back to the hub.*

The campaign has five named Rift regions, each with a short operation and a distinctive Anchor Guardian. Recovering an Anchor visibly repairs that part of the Digital Sanctuary and unlocks the next region. Restoring all five opens the final Null Sovereign encounter. The campaign is complete when the player wins that final encounter; owning every species is not required.

## The new play loop

1. **Choose a squad.** Bring three owned partners, assign front/support/striker positions, and pick one of a few team tactics. Keep the existing four partner slots as the collection/roster; the mission squad is a separate three-person choice.
2. **Choose an operation.** Each region offers a short route with two or three branches: for example, rescue a trapped Digimon, disable a relay, take a risky shortcut, or collect a clue. A player can see the operation objective and its reward before committing.
3. **Make a few consequential calls.** The team moves and fights visibly in the Sanctuary field. Encounters use readable boss tells, hazards and an objective (protect a relay, break a shield, interrupt a charge), rather than a long chain of near-identical duels. During each encounter the player makes a small number of command choices—such as **Break**, **Guard**, or **Sync**—at telegraphed moments; the squad handles ordinary attacks automatically.
4. **Bring home a guaranteed story reward.** A cleared operation awards its Anchor progress and a named memory fragment. It does not depend on a lucky gear roll or completing a species index. A loss ends that attempt without deleting a partner or campaign progress already earned.
5. **See the hub change.** The Anchor becomes visibly restored, its residents return, and the objective tracker advances. Region clears unlock new operations, partner story moments and presentation rewards.

Target a 3–5 minute operation, with a clear result and a natural stop after each run. There should be no offline timer to wait out and no need to leave a session running to finish a training bar.

## Replace chores with meaningful partner growth

- **Remove timed stat training from the campaign path.** Partners grow by completing operations and making story choices, not waiting through repeated gym timers. Keep the on-map gym as an optional social/presentation activity only if it remains fun without being mandatory power progression.
- **Remove equipment and forge rolls from the campaign path.** Replace per-piece gear inventory with a small number of understandable, earned team tactics or partner memory choices. A memory choice should change how a partner helps the squad, not add another random percentage to optimize.
- **Make evolution a choice with a reason.** At selected story milestones, offer a small, clearly described branch based on a mission accomplishment or player decision. Show the result and trade-off before the player commits; do not make the main story depend on filling a branch index.
- **Keep collection optional.** The DigiDex becomes a field journal for discovered forms, character notes and optional side goals. It can reward portraits, dialogue, titles or cosmetics, but must not gate the five Anchors or final boss.
- **Acquire partners through play, not duplicate eggs.** Prefer a named rescue, recruit or region reward with a visible species choice. Keep random hatching only as an optional legacy/collection activity if players still enjoy it; duplicate protection and the existing bag should not be the campaign’s progression bottleneck.

## Combat direction

The current automatic wave grind and short local spar are not the campaign’s main event. The proposed operation encounters should make the opponent’s behavior legible and give the player a handful of useful decisions without turning every second into button mashing:

- Bosses telegraph a small set of attacks or mechanics with clear animation and text.
- The three squad positions matter: a front partner can absorb a lane attack, support can protect or cleanse, and a striker can break a shield or exploit an opening. These are tactical roles, not gear stats.
- Operations vary their objective and battlefield hazard so “win by reducing HP” is not the only encounter type.
- A successful command changes the next beat; a mistaken call costs time or health, but never permanently damages the saved partner.
- Keep player-versus-player out of the campaign and its unlock path. If the ring remains, it is an optional side activity with separate, non-ranked rewards until its authority and progression are designed independently.

## Rewards and relationship to Ragnarok

Anchor clears should unlock story, hub restoration, a few partner recruits/forms and cosmetic rewards. The DigiPet campaign must remain separate from Ragnarok pet bonuses, field damage, Zeny, Fishcoins and Cash Shop purchases. Do not create a required grind that competes with the existing idle field game.

A repeatable post-campaign **Rift Surge** can provide optional mastery: short operations with rotating hazards and cosmetic/collection rewards. It is for replay, not a second mandatory checklist, and should not require daily attendance.

## Preserve existing progress if this direction is approved

Any implementation plan needs a reviewed migration before replacing current mechanics:

- Preserve every existing `S.digimonBag.owned` line, all four partner-slot selections, each partner’s form/evolution and earned history, and unknown future bag versions without destructive rewriting.
- Do not silently erase Pet Coins, eggs or gear. Decide explicitly whether legacy gear is retained as optional equipment, converted once to a bounded cosmetic/memory resource, or left archived. Never repeatedly convert on load.
- Keep the current separation from Ragnarok pet inventory and combat.
- Treat client-authored old training/battle values as legacy casual progress, not proof for a new ranked system.

## Smallest useful prototype and acceptance criteria

Start with **one** region, a three-node operation, one rescue/route decision, one telegraphed Guardian encounter and one visible Anchor repair. Do not build five regions, a new roster index or online ranked PvP first.

A prototype is worth expanding only if playtesting shows that:

1. A first-time player can state the current goal and next objective without being told to “collect everything.”
2. A complete run takes roughly 3–5 minutes and ends in a satisfying, guaranteed piece of campaign progress.
3. Squad position and at least one command choice can change the encounter result; ordinary attacks do not require repetitive clicks.
4. No training timer, random equipment roll or full-index completion is required to reach the Guardian.
5. Failure is understandable and retryable, and existing Sanctuary progress remains untouched until an approved migration is built.
6. The campaign still feels like a distinct Social Hub activity and does not affect Ragnarok field balance.

## Decisions to make before implementation

- Approve the five-Anchor / Null Sovereign goal and the story tone, or choose another named destination.
- Decide whether old partner equipment is preserved, repurposed once, or retired after a conversion policy is agreed.
- Approve the first region, its rescue/route choice and its Guardian mechanic before producing new maps, art or battle code.
- Decide whether new recruits are fixed story rewards, a choice from a small region pool, or both.
- Review asset and trademark permissions for every proposed partner image/animation before shipping new material.

Until those choices are approved, the existing DigiPet system remains unchanged; this is a design proposal only.
