# Player-character Rift Raid

The Rift Raid is a timed co-op encounter for the player character. It is deliberately separate from
DigiPet battles, the `party_start` flow, ordinary field combat and Endless Echo.

## Player flow

1. Open **Map → Rift Raid** to review entries, rewards, Mythic weapon stars, and the server-backed title/aura wardrobe.
2. Start solo, or open **Social Hub → Rift Raid** and create/join a separate player-character party
   of up to three. The lobby shows every joined character's native wardrobe preview and each member's
   server-owned Ready / Not ready state. Everyone must ready again after any roster change. The leader
   can start a 2–3 player run only when all members are ready; the lobby's **Start Party Raid** and
   Map's **Start Social party** controls show the same leader/readiness gate. The authenticated Pages
   API and Social Durable Object recheck it when starting and installing the run. Use **Open Map →
   Rift Raid** for raid details and rewards.
3. Use Strike / Heavy Strike, lane Dodge, Mend, Aegis Ward and Revive. Actions go through
   `POST /api/raid`; the browser never supplies damage, boss HP, success, reward rolls or star results.
4. A timed kill settles a clear pool plus one Fractured Chest for every roster member. Any failed
   attempt settles a Pity Chest for every roster member; there is no contribution floor or chest cap.

The encounter is server-authoritative in the Social Durable Object, but it is action-driven. There are
no raid alarms or per-tick WebSocket messages. Each accepted action advances the encounter and emits
one party update. A local browser clock displays the deadline and makes one settlement request when it
expires. If every browser disconnects at the deadline, the timeout reward is settled on the next
raid-state/action request; the room does not wake itself on a timer.

## Limits, day reset and settlement

- **Two entries per player per Malaysia calendar day.** The reset is midnight in
  `Asia/Kuala_Lumpur` (UTC+08:00, no daylight saving). A party start inserts one D1 entry for each
  participant, in the same batch as the run and roster.
- D1 triggers enforce both the two-entry limit and one active run per player. A failed start rolls back
  the whole reservation; an ambiguous Social response keeps the reservation and can be safely
  recovered from the D1 run row.
- Social party and pending-invite state is stored in the existing Durable Object; valid lobbies and
  unexpired invites survive a restart. Invites retain their 30-second expiry. Once started, the D1
  roster and storage-backed encounter state also survive restart and can be resumed from Map → Rift Raid.
- D1 stores the entry roster, settlement key, reward ledger, chests, Rift Shard balance and item-bound
  weapon stars. Settlement is batched and idempotent by run/member/reward kind. Existing cloud grants
  deliver Zeny, Valkyrie’s Sigils and Astral Shards; raid grants remain pending until claimed (ordinary
  GM/mail grants keep their five-day expiry). Rift Shards are a separate raid currency and never reuse
  `S.shards` (Echo Shards).
- v1 regional materials are **Astral Shards only** (`ascensionMat[0]`), never Primal Catalysts.
- A Rift Sovereign Card drop increments the D1 raid-copy counter and creates a durable `gift` grant for
  the ordinary character save. The card copy is only marked claimed after its matching `gmReceipts`
  save receipt is uploaded; settlement retries cannot issue a second copy.

Apply `migrations/0018_player_character_raid.sql` to D1 before deploying this code. The Pages
Functions binding invokes the existing private `SOCIAL` DO binding. Internal HTTP routes accept only
its synthetic `social` host, so a public Worker preview URL cannot forge the Pages identity header to
reach raid or GM routes. Deploy Pages and `workers/social` from a compatible commit; the Social Worker
still adds no alarm or per-tick raid loop.

## Titles, auras and the Rift Sovereign Card

After a clear, open **Map → Rift Raid → Titles & auras**. The wardrobe shows unlock progress and
sends equip/unequip requests to the authenticated D1 API; the server rejects locked or unknown IDs.
Titles unlock from a first clear, 25/100 clears, or a solo/trio/support clear. The four raid auras
unlock at 15/40/80/150 qualifying clears. A worn title and aura are cosmetic only. They appear above
the character in the field and in Fountain Plaza. A worn Rift aura takes the place of the Base
Level 50/99/150 sigil; unequipping it restores the level aura.

A full clear has a **5% Rift Sovereign Card chance**, with a drop guaranteed on the 30th consecutive
clear without one. Each awarded copy is also delivered to **Bag → Cards** as a bound collection card:
it is not socketable, sellable, mergeable or eligible for Card Mastery. Its raid effect is account-wide
and applies automatically, with no socket: 1 copy grants 5% raid armor penetration, 2 copies 9%, 5
copies 12%, and 10 copies 15%. The server’s awarded-copy count affects the next run profile as soon as
the reward is settled; the ordinary collection copy waits in the durable cloud grant queue until the
save claims it.

## Encounter and actions

Initial tuning baselines are 150M total HP / 5 minutes solo, 360M / 6 minutes duo and 540M / 6
minutes trio. Each run has four HP phases (15%, 15%, 15%, 55%). At start, D1 stores a snapshot of
each saved character’s combat profile. Estimated attack is
`4 + BaseLv × 2 + weaponATK + STR × 1.5 + (DEX + LUK) × 0.25`; weapon ATK is
`weapon value × (1 + refine × 0.15) × (1 + 1% × Rift weapon stars)`. The server turns that into
`round(attack × (1 + equipped weapon ATK-affix total / 100) × 60)`, clamped to 25,000–650,000 DPS.
Max HP is `80 + BaseLv × 20 + head value × 4 + (acc1 + acc2 values) × 3 + VIT × 8 + 2 × total
equipped HP affixes`, multiplied by `(1 + saved HP% / 100)`, then clamped to 1,000–1e9. Raid
weapon stars also add 0.5% armor penetration each (10% max); card and weapon penetration add
together. With the current 15% card and 10% weapon caps, a fully progressed character reaches 25%.

The Social DO owns live HP, lanes, cooldowns and outcomes. Boss armor is 30%. **Strike** deals
`floor(snapshot DPS × 5 seconds × (1 − max(0, 0.30 − armor penetration)))`; **Heavy Strike** deals
1.6× that damage. Both share a 5-second recovery, and Heavy has a 15-second cooldown, so an ideal
cycle uses Heavy every third attack for about 1.2× sustained damage. A client action ID is retained
for the run so retrying a lost response cannot strike twice.

The first telegraph becomes eligible at 7.5 seconds and is created on the next action or snapshot at
or after that time; later hazards become eligible 9 seconds after the server resolves the previous
hazard. Resolution happens on the next action or snapshot at or after the 1.5-second tell, since the
room has no raid tick. The UI names **Fracture Slam** when one
lane is dangerous or **Rift Sweep** when two are dangerous, and lists those lanes. In a group, there
is a 50% chance for a hazard to mark a second lane. You have 1.5 seconds: choose a lane not listed in
the Lane menu and press **Dodge to lane** before the window closes. That becomes your current lane and stays until you dodge
again; an adventurer whose lane is outside the danger set when the hazard resolves takes no hit. A
successful dodge into safety also credits support equal to 10% max HP. Staying in a marked danger lane deals 30% max HP; an active Aegis Ward halves that hit.
Mend restores up to 25% of a target’s max HP (18-second cooldown), Ward lasts 30 seconds (24-second
cooldown), and Revive returns a downed teammate at 20% HP (30-second cooldown). At 0 HP you are down
and can only use Revive; if the whole party is down, the run fails. There is deliberately no background
combat tick: each action/snapshot advances server state, so a disconnected room does not silently keep
fighting.

These HP, timer and hazard numbers are still balance proposals. A full clear is specifically a boss
kill with a server `finishedAt` at or before the server deadline; a client-reported kill is never
accepted. Contributions are telemetry/achievement inputs only and do not gate clears or chests.

## Balance review (provisional)

The HP schedule keeps the ideal per-player damage target equal in solo, duo and trio: 500,000
post-armor damage per second over the timer. With Heavy used every third 5-second attack, the saved
DPS needed at perfect uptime is about 595k at 0% penetration, 556k at 5%, 527k at 9%, and 439k at
25%. The server DPS cap is 650k, so all are technically reachable, but solo at no penetration has
only about 9% headroom before missed strikes, late actions or support time. This is an endgame check,
not an early-progression fight. The dodge window makes lane damage avoidable, but four unmitigated
hits can down a character; coordinated dodging and revival matter more than stacking HP alone.

The Shard economy is coherent with the stated 20★ target: an average solo full clear yields 15 Shards
from the clear roll plus 5 from its Fractured Chest (20 total); a failure yields 10. Duo/trio stackable
rewards, including both chest types, receive the same stochastic party bonus, so the expected totals are
22/24 per clear and 11/12 per failure. Two successful entries per day average 40/44/48 Shards solo/duo/trio,
or about 21.3/19.4/17.8 days for the 852.126 expected spend. One clear plus one failure gives about
30/33/36 per day, or roughly 28.4/25.8/23.7 days. Two failures give 20/22/24 Shards/day, taking about
42.6/38.7/35.5 days. A 5% card chance plus the 30-clear pity averages about 15.7 clears per copy;
ten copies for the top penetration tier therefore take roughly 157 clears (78.5 days at two clears/day).

**Tuning decision:** these are math checks, not live results. I have not changed the provisional HP,
rewards or drop odds in this review. Before sign-off, measure actual solo/group clear rates, median
completion time, action uptime and chest/upgrade consumption; if typical maxed characters fail the
solo timer, reduce the solo HP/timer target or raise the attack cap rather than asking players to
ignore hazards.

## Reward and 20★ economy proposal

All amounts below are tunable starting values, not locked balance guarantees:

- **Timed full clear:** 10 Rift Shards, 50% chance at +10, 4 Valkyrie’s Sigils, 25% chance at +4,
  2 Astral Shards, 25% chance at +2, and 1,000,000 Zeny per player. Stackable Shards, Sigils and
  Astral Shards receive a stochastic +10% duo / +20% trio party bonus across clear and chest rewards;
  Zeny and the card roll are unchanged by party size.
- **Fractured Chest on every timed clear:** 5 Rift Shards, 2 Sigils, 1 Astral Shard and 250,000 Zeny.
  Its stackable contents receive the same party bonus.
- **Pity Chest on every failed attempt:** 10 Rift Shards, 2 Sigils, 1 Astral Shard and 250,000 Zeny.
  Its stackable contents receive the same party bonus. A solo player averaging one clear plus one
  failure per day earns about 30 Rift Shards and reaches 20★ in roughly 28.4 days. Two solo clears/day
  earn about 40/day and reach the expected cost in roughly 21.3 days. A two-failure day earns 20/day;
  party bonuses shorten these schedules.
- **Mythic-only, item-bound weapon add-on:** maximum 20★. Every star adds +1% weapon ATK in ordinary
  combat and +0.5% raid-armor penetration, capped at +10% raid penetration. The current proposal costs
  `12 + 2 × current star` Rift Shards per attempt; the success chance starts at 95% and drops 2 points
  per star (57% at ★19). The third consecutive attempt at one star is guaranteed. Expected spend from
  0★ to 20★ is about **852.126 Rift Shards**, including failed attempts.

The server rolls reward and upgrade outcomes. Failed weapon-upgrade attempts spend the quoted Shards
but never remove an existing star. D1 does not trust a client-submitted success value.

The 5% card roll, 30-clear pity and cosmetic/title milestones are also provisional. The raid card’s
copy count is advanced from the same idempotent D1 reward ledger as its durable ordinary-card grant;
rank bonuses are therefore available to the next run even if the client has not claimed the collection
copy yet.

## Code map

- `functions/api/raid.js` — authenticated Pages API; D1 reservation, Social requests, profile snapshot,
  reward rolls, idempotent settlement and Mythic upgrade endpoint.
- `functions/_lib/raid-rules.js` — shared pure tuning, Malaysia day-key, chest, phase and upgrade math.
- `functions/_lib/db.js` — D1 statements for entries, run roster, settlement, rewards and upgrades.
- `migrations/0018_player_character_raid.sql` — D1 schema, daily-entry triggers and reward/upgrade
  ledger triggers. There is no once-a-day Fractured Chest index.
- `workers/social/room.mjs`, `workers/social/index.mjs` — separate `raid_*` party/action protocol,
  Durable Object storage hydration and HTTP action/snapshot handlers; no new `setAlarm` calls.
- `assets/raid-ui.js`, `assets/social.js`, `assets/social-scene.js`, `assets/social.css`, `index.html`,
  `assets/ui/eclipse.css` — Map wardrobe/action UI, bound-card delivery, field/plaza title and aura
  presentation, and separate Social party coordination.

## Checks

```sh
node tools/tests/player_raid_sim.mjs
node tools/tests/raid_ui_sim.mjs
node tools/tests/equipment_cards_sim.js
node tools/tests/social_scene_sim.js
node tools/tests/social_ui_sim.js
node tools/tests/social_worker_sim.mjs
node tools/tests/social_api_sim.mjs
node tools/tests/panel_layout_smoke.js
```

The API simulation uses in-memory SQLite through a D1-shaped adapter and the Social class with
mocked storage. `social_worker_sim.mjs` separately exercises the private raid routes and storage
hydration in real local workerd. Neither applies a production migration, deploys a Worker, proves
hosted Cloudflare timing, or establishes live balance.
