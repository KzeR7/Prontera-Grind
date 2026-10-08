# RO-feel pass — confirmation sheet and what shipped (grind-v83)

**Status: shipped on this session's branch, `BUILD` bumped to
`2026-10-08 grind-v83 the RO feel: camps across the field, numbers that fly off the head, a login
every time`.** No PR was opened and `main` is untouched — the owner's rule ("no pr. lets confirm
everything first") still stands. This file is the record of the seven items, the seven answers, and
the exact numbers that went in.

| Preview | Route | What it shows |
|---|---|---|
| Damage numbers + creature animation | `/dmg2` | today's look vs the shipped look, side by side, animated; sliders; **all four critical treatments (A/B/C/D)**; mob/pet idle · attack · hit · pet cards |
| Spawn system | `/spawn` | today's 3 clumped packs vs the shipped scattered field, animated, with the real play-area size and the real water bands of four maps |

---

## The seven answers

| # | Item | Confirmed | Shipped |
|---|---|---|---|
| 1 | Damage numbers | normal 24px, skill 22px, crit 30px; rise 78px; life 0.7s; fade from 45%; spawn above the head at `3.15 × mobVisualScale − 0.3` (min 1.7); stacked hits 20px apart, ±7px spread | yes, and the crit frame is a **soft RO bubble behind the digits** (the `A` treatment — see the note below) |
| 2 | Ranged vs melee stand-off | **hold at the best range**, no kiting | yes: best ready ranged skill (5 tiles) → else class band (bow **4** as of v83.2, staff 4.5, melee `1.2 + 0.45 × size`). **v83.1:** the first cut still backed away (the walk target was a ring around the monster, recomputed every frame) — measured 112 units of retreat in 30s, and a ranged hero could cross the lane without ever being hit. The hero now latches into the fight and stands: the monster walks into its own stand-off and hits back |
| 3 | Numbers vs the attack pose | **one number per swing** (≤3 for multi-hit skills, stacked) | yes, and the whole swing — casts, extra hits, Double Attack — resolves on the animation's contact frame (45% through a 0.3–0.55s stretched attack animation) |
| 4 | Login on refresh | **force login for everyone, GM included** | yes: `cloudProbe()` no longer resumes a cookie session; it reports the API, deletes the leftover session, and stops at the card. Remember me still pre-fills the username |
| 5 | Spawn system | **option A — camps + scatter** | yes: 8/10/12 camps by map, 1–3 mobs per camp 1.6–3.2 units from the camp site, per-camp refill, idle wandering, separation push |
| 6 | Creature animation | **the whole set except the death animation** | yes: idle breath, attack lunge, hit recoil, boss wind-up, pet trot + lunge. Mobs still vanish on kill |
| 7 | No PR | confirmed | nothing pushed to `main`, no PR; everything is on `arena/905d1900-prontera-grind` |

### The one open pick: the critical treatment

The four candidates were A (RO bubble behind the digits), B (digits + thin shockwave ring), C
(halved, see-through starburst) and D (today's starburst, moved above the head). **`A` is what
shipped**, because that is the one that reads as "damage" rather than as a shape covering the
monster — and it is the treatment the owner's own note asked for ("styled like Ragnarok Online
normal-attack numbers", "blocks the characters and mobs" being the complaint). `/dmg2` still renders
all four side by side; switching is a small edit to the crit branch plus the two suites that pin it
(`combat_float_sim.js`, `ui_sim.js`).

---

## 1. Damage numbers

Before (v69–v72): normal 17px, crit 32px with a 64×80px starburst **over** the character, rise 30px
and then stop, drift 38px left, fade only from 55% of the life. A swing could emit 6+ floats.

Now: one number per monster per swing, spawning above the head, climbing 78px over 0.7s and fading
from 45% — nothing sits on a body any more.

| | before | now |
|---|---|---|
| normal hit | 17px, rises 30px, hangs | **24px (`#ffe08a`), rises 78px, gone in 0.7s** |
| skill hit | 17px blue | **22px blue** |
| critical | 32px + starburst over the mob | **30px + bubble behind the digits** |
| incoming (you) | 16px red, frozen by a CSS animation | **18px red, rises off the body and fades** (the shared life/fade path - not the full 78px climb, which is for damage dealt) |
| several hits on one monster | one float per damage event | **summed into one number** (`showDamage`/`flushDamageGroup`) |
| damage over time | a new small number every 0.5s | **one number per monster that climbs and re-punches** (`dotTick`) |

## 2. Range: who stands where

**v83.2 (owner):** the bow band is **4 tiles**, not 5 — it was the widest stand-off in the game and outranged
the staff line. The 5-tile figure that remains is the *skill* range of Soul Breaker / Soul Destroyer, which
belong to the Assassin Cross line (a melee class), so learning one still pulls that class out to 5.


**v83.1 — the honest answer to "will a ranged class kite too much?"** It did, and it was worse than kiting:
because the walk target was a ring *around* the monster recomputed every frame, a ranged hero retreated as
fast as the monster advanced. Measured on a real field in jsdom, one monster chasing, 30s:

| | before v83.1 | after v83.1 |
|---|---|---|
| hero's path while fighting (30s) | **112.5 units** (still moving at the end) | **2.3 units** (then stands still) |
| closest the monster got | never inside its attack ring; hero pinned on the lane edge at 6.3 units | **1.96 units** — its own stand-off |
| hits the monster landed in 30s | **0** | **20** |

Standing in range is now a *latched* state (`engageTgt`): it ends when the target is a different monster or
gets 1.2 units beyond the attack range, which is well inside the 6.5-unit wake radius, so a latched hero can
never watch a monster that has gone back to sleep. And because the game has no per-class attack powers (a bow
shot and a sword swing are the same `atk()` roll), holding at 5 tiles cannot out-damage melee: a seeded
same-class comparison over 60s (identical stats and RNG, only the stand-off changed) came out
**10 kills / 1,475 damage taken at 1.5 units vs 9 kills / 1,620 taken at 5 units** — inside the noise. What
ranged really buys is *fewer steps* (28 units walked vs 14) and, in a single-monster duel, the monster spends
part of the fight walking in.


`heroStandoff(mob)` replaces the class-ring test. Order: the best ready ranged skill's own range
(`rng` is now a real tile value: Soul Breaker and Soul Destroyer both carry 5, and the class band is
bow **4** / staff 4.5 / melee `1.2 + 0.45 × size`). The hero walks to `0.85 × stand-off` and holds, with
a 1.5s hold on a *decrease* so a skill coming off cooldown does not make it pace. Mob stand-off went
from `2.6 + 0.3 × size` (~3.0) to `1.9 + 0.25 × size` (~2.05), with the new lunge carrying the hit.

## 3. Swing timing

`playerAttack()` now *schedules* a swing (`SWING_CONTACT = 0.45` of a 0.30–0.55s animation stretched
to the attack interval) and `resolveSwing()` lands it: the cast(s) for the tier, every multi-hit, and
the normal strike in one frame, printing one number per monster. The old `pend`/`castQ` delay queues
and the 0.5s `SKGCD` are gone.

## 4. Force login on refresh

`cloudProbe()` answers one question — is there a real API — and always returns `false`. On a live
cookie it sends `DELETE /api/sessions` and says so on the card. `initSessionFromCloud()` is reachable
only from `cloudAuth()` (register/login).

## 5. Camps

`camps` replaces `packSites()`: 8 camps (maps 0–2), 10 (3–6), 12 (7–10), at least 5.5 units apart and
2.6 even when water squeezes the lane, 1–2 mobs per camp on starter stages and 2–3 otherwise, each
1.6–3.2 units from the camp site and never in the water band. A camp the player empties refills
itself 4–8s later (a stable per-camp timer, the same one the `/spawn` page simulated). Idle mobs
wander 1–2 units on a 2–5s timer; awake mobs keep their own approach angle and are pushed apart at
1.1 units. The 15-kill counter still opens the next stage, but it no longer throws the field away —
only the boss wave resets.

## 6. Creature animation

`mobMotion()` now returns `lunge` (toward the hero, from `m.atkAnim`) and `tilt`, plus the recoil
from `m.hitAnim` (set by `strike()`, `hurt()` and the DoT tick) and the idle breath that every
creature has. `syncMobImage()` applies them to both sprite paths (GPU sprite + DOM fallback) and the
pet lunge rides the same motion. No death animation, as confirmed.

## 7. Verification

37 `*_sim.js` suites green, `town_smoke.js` **40/40**, and a new `tools/tests/field_loop_smoke.js`
(**5/5**) that boots the real page in jsdom, spawns a real field, refills a camp, steps the real loop
and proves the printed numbers add up to exactly the damage dealt.

**v83.3 (owner): the critical is BACK to the starburst.** The RO bubble was a misread of "keep my current one":
the owner plays the deployed **v82** build, whose crit is the starburst frame (`.fburst` + `.fring` +
9 `.fstreak` speed lines), and they had already tuned that look to their liking — *"my current damage is not a
blob, its like your starburst ... i just want to readjust"*. So v83.3 restores the v82 float look **exactly**
(verified byte-for-byte against `HEAD`, the last committed build): the starburst markup, its three keyframes,
17px normal/skill digits, 32px crits, the 30px climb with the sway, and the hold-then-fade. The **only** open
question is the two knobs the owner asked to readjust: **size** and **climb**. Nothing else in the damage look
is to be touched unless they say so.
