# The 99 → 150 gap, and the damage-trial dungeon (design plan)

> **STATUS — 2026-10-07.** Section 2 (Field Tiers) is **DECIDED by the owner and BUILT as v76
> "Nightmare"** (`grind-v76 nightmare band and exclusive nightmare gear`): five stages per map on Base
> Lv 100/110/125/140/150, mob HP x12 / damage x1.5, two gear sections exclusive to stages 11-15
> (Nightmare 11-13, Abyssal Nightmare 14-15). What shipped, and the three still-open trial decisions,
> are in **`Updates/v76-nightmare-report.md`**.
>
> **UPDATE — 2026-10-08.** The trial dungeon **is built, as v77 "Endless Echo"**
> (`2026-10-08 grind-v77 Endless Echo, doubled Nightmare band, N auto-sell`). It took the shape this
> plan recommended: `TRIAL_SECS=300`, unlimited practice, a dummy that never dies and never hits back,
> **2 ranked runs a day** on the Asia/Singapore clock, a board metric of the **best single run**
> (`S.trial.best`, never summed), and Shards from ranked runs only. What shipped instead of a draft:
> the payout ladder and the `TRIAL_STORE` prices - **both replaced in v77.1** after the owner's second
> pass: `TRIAL_PAY=[[100000,5],[250000,12],[500000,20],[750000,28],[1000000,36],[1500000,50],
> [2250000,68],[3000000,85],[4500000,115]]` (+15 for a new best, anchored on his own marks of ~1.5M DPS
> alone and ~4.5M with three pets), the store at Oridecon/Elunium x5 = 38, 500k Zeny = 25, Card Mastery
> Token = 250, Legendary Card Voucher = 450, Nightmare Gear Token = **900 and Base Lv 120+**, seven
> one-off chests from 250k to 4.5M DPS, and a ten-second grace on a ranked try. The name "Endless Echo" is
> still a placeholder (the chests are built now: seven rungs, 250k to 4.5M DPS) — both wait on the
> owner. See the v77 entry in `AGENTS.md` and the `## BUILD v77` section in `READ-ME-FIRST.md`.
>
> The draft below predates it: the trial dungeon was **not built** at the time of writing. The owner has since set the rules that supersede the
> draft in section 3: **5-minute runs** (not 60s), unlimited practice, the dummy does not hit back,
> and **2 ranked attempts a day**. Endorsed rewards: titles, Trial Shards, a weekly season, a
> personal-best bonus. **The board keeps the best DPS of a single 5-minute session — runs are never
> summed across sessions** — so the score, the board rows and the milestone chests are all expressed
> in DPS. Open: the dungeon name, the Shard exchange list, and the exact chest rungs (provisional
> until the owner's first real run) — drafts for all three are in the report above.

*Two owner reports, one note. Every number was read out of `index.html` on `grind-v75` (the Field
Tiers figures are now v76).*

---

## 1. Why the endgame goes flat, in numbers

| Thing | Where it stands today |
|---|---|
| Field power (mob level) | `fieldPower(m,l)` — map 0 reads `EARLY_FIELD_PWR[0]`, maps 1-4 read `EARLY_FIELD_PWR[1]`, maps 5-9 read `MAPS[m].b + stage + 1` |
| The advertised bands | `REC = ['Lv 1-10','Lv 10-50','Lv 10-50','Lv 10-50','Lv 10-50','Lv 60-67','Lv 67-74','Lv 74-80','Lv 80-90','Lv 90-99']` |
| So the last authored content | **Lv 90-99** — Abyss stage 10 |
| Gear ceiling | sections 0-3 only (`secField`); Abyss drops `MAPGRADE[9] = 4` = Legendary |
| Levels 100-150 | `ELITELV=100` raises the per-stat cap from `BASECAP` to `MAXST` (99). That is the **entire** reward curve for fifty levels |
| Max level | 150 |

So the owner is right, and precisely right: there is nothing to *do* at 100-150 that was not
already there at 99. Gear stops improving, mob levels stop climbing, no new map, no new band. The
only thing that moves is a stat cap and a bigger number on the sheet. Fifty levels of that is the
buzz kill.

---

## 2. Option A — **Field Tiers** (my recommendation: build this first)

Keep the ten maps and all their art. Give every field **five more stages** and let the power curve
continue past 99:

* Stages **11-15** per map, unlocked at **Base 100 / 110 / 125 / 140 / 150** (a per-map unlock, like
  `S.prog` does today, so unlocking is a visible goal).
* `fieldPower` gets a post-99 table so stage 11 of Prontera is not the same as stage 1. Mobs get the
  scaling they already have (`HPK * mb * pw^HPE`, `EXPK * pw^1.5`) with a tier multiplier on top.
* **New gear: sections 4 and 5** ("Abyssal" / "Transcendent"), dropping from stages 11-15 and from
  the 60+ maps' stage-15 bosses. The catalogue format already supports it — `GEAR[map][section]`
  with `SECN` names — it is a data-entry job, not an engine job.
* **The boss ladder continues**: stage 15 bosses carry a `BOSS_CRIT_RES` value above the current
  Abyss 30% (say 35/40/45%), so the v73/v74 crit-vs-boss maths stays relevant at the top.
* Mob HP, EXP and Zeny keep the existing formulas, so no new balance model is invented — only the
  tier constants.

**Cost:** one `fieldPower` extension, five unlock flags, two gear sections of names, boss resist
values, and the panels that show unlocks. No new art, no new systems. Everything the player already
knows (stages, travel, drops, refine) just keeps going.

**Reward for the player:** a reason to move maps again, gear that is still improving at 130, and a
boss that resists crit enough to matter.

## 3. Option B — new endgame maps (art-heavy)

Three or four genuinely new maps for 100-150 with their own kit art, mobs and bosses. This is the
"proper" answer and the place a real dungeon *room* would live, but it is sprite/kit work first and
code second — the map kit and the class-sprite pipelines exist, so it is a matter of time, not
capability. Do it after A, if the art budget is there.

## 4. Option C — Rebirth / ascension (RO-classic)

At Base 150 (or 100), reset to 1 with a permanent small bonus and a second job tier to climb. It
fixes the flat endgame by making the ladder *repeat*, and it is very Ragnarok — but it fights the
current save model (per-class Base Lv records, the 150 cap, the class collection echo) and rewrites
the pacing of everything below it. Interesting, expensive, not now.

---

## 5. The Trial — a damage-test dungeon

The owner's idea, fleshed out so it can be specced.

**The room.** An instanced fight off the Abyss (or a new tab). One target, **infinite HP**, no
respawns, no packs.

**Two modes:**

| Mode | Target | Board? |
|---|---|---|
| **Practice** | a training dummy: infinite HP, deals no damage | no |
| **Ranked** | the same dummy, but one run per cooldown, and the result is submitted | daily / weekly / all-time |

Later, if it wants a second axis: a **Trial Boss** that hits back and can end a run early, with its
own board — that rewards DEF/HP/leech instead of pure glass-cannon, and it is a separate build.

**The window.** 60 seconds, which is exactly the HUD's rolling DPS window (`stepHudRate`). Score =
damage dealt in the window, taken as a delta of `S.dmg`, so no new damage accounting is needed.
DPS = score / 60. A big timer and a live total on screen; the HUD already prints DPS.

**Nothing to farm inside:** no drops, no EXP, no Zeny, no quest progress. The trial is a contest,
not another field — that is the single most important rule, or it becomes the best farm in the game.

**The board.** Mirror the kills board exactly: a `leaderboard_trial(user_id, period_key, best)`
table with the same `PRIMARY KEY(user_id, period_key)` shape, the same Asia/Singapore period keys,
and `best` kept as a **MAX** (a record, not a delta — so no trigger maths, and re-running can only
improve your entry). `/api/board?board=trial&period=…` becomes one more branch. The existing board
label ("Scores are self-reported") applies honestly; the honest *upgrade* after that is a
server-side ceiling — the save already carries `atk`-relevant fields, so the server can compute a
theoretical maximum from the player's own sheet and clamp/flags anything above it.

---

## 6. Rewards — the owner's actual question

The rule that keeps this healthy: **the trial may pay in trophies, cosmetics and shortcuts, never in
raw power that the map grind can also give.** Otherwise the dungeon becomes the only content worth
playing.

### Recommended package

1. **Titles, from your all-time best.** Damage thresholds with names, permanent, shown on the board
   row and next to your name in game: e.g. 1M *Trial Novice* · 10M *Breaker* · 100M *Colossus* ·
   1B *Endless*. Zero balance impact, the classic competitive reward — and the game already has a
   title system to hang them on.
2. **Trial Shards → a small vendor of shortcuts.** Shards are earned per ranked run, scaled to the
   score band, **capped per day**. The vendor sells guarantees for things that are already RNG, so
   nothing new is created and nothing is invalidated:
   * **Pet skill token** — one guaranteed roll of the 12-skill pool into a chosen slot (pairs with
     v75; the gacha stays the fast route).
   * **Mutation attempt** — one G1-G6 roll for free instead of `rollCost`.
   * **Pet gear level** — Claw/Collar/Charm +1 tier with no 40/25/15% failure gamble.
   * **Ore bundle / refine insurance** — "no downgrade on the next refine attempt".
   * **Species voucher** — your choice of one pet *from a map you have already farmed*, priced by
     rarity (a cheap Poring to a very expensive Angeling). This is the reward that makes a *pet*
     hunter care about the trial.
3. **Weekly season.** The weekly board pays: top 3 get a dated seasonal title (*Colossus — week of
   Oct 12*), everyone who completes one ranked run gets a small shard participation payout. Cheap,
   and it gives the board a reason to be re-run every week.
4. **Personal-best bonus.** Beat your own previous best and that run pays +50% shards. This is what
   keeps a mid-tier player engaged when the top of the board is out of reach.
5. **First-time milestone chests.** One-off, at 1M / 10M / 100M / 1B in a single run: a bundle of
   shards plus a cosmetic. One-time by definition, so it cannot inflate anything.

### Also worth considering

6. **Cosmetics only:** a trial aura/nameplate, a **damage-number skin** (the game already has
   short/full formatting — styles are a natural cosmetic), a dock-icon theme.
7. **Entry fee / attempt cap:** a Zeny fee (a real endgame Zeny sink) or N ranked attempts per day
   (a cap that keeps the board meaningful and shards finite). Either is enough — I would cap
   attempts and keep Practice free.

### Do not

* **No Index Crit.** That is the only route past the 60% crit cap and it is the Hunt Title grind.
  The trial must not hand it out.
* **No flat permanent stats**, no "+1% ATK per 100M damage" — that is power creep that turns the
  trial into a mandatory chore.
* **No gear drops** in the trial that beat what the fields drop, or the fields die.

---

## 7. Suggested build order

1. **Field Tiers** (Option A) — the 99-150 ladder, cheapest big win.
2. **The Trial** — Practice + Ranked dummy, 60s window, titles + shards + the vendor, and the
   `leaderboard_trial` table + board tab.
3. **Weekly season + milestone chests** on top of the trial.
4. Optionally: the Trial Boss (fights back, separate board), then Option B (new maps).

## 8. Open questions

1. Field Tiers: stages 11-15 with two new gear sections — yes? And should stage 15 of each map be
   the *only* place the best gear drops (a real destination), or a chance everywhere?
2. The trial target: a dummy that never hits back (pure DPS benchmark), or a boss that can kill you
   (survival matters)? I would ship the dummy first.
3. Shard rewards: the pet-focused vendor above, or do you want the trial to pay Zeny/ore only?
4. Attempts: free practice + N ranked attempts a day, or a Zeny entry fee?
