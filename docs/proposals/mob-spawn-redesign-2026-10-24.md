# Mob Spawn & Behavior Redesign — Options & Recommendation
**Prontera Grind · 2026-10-24 · Branch `arena/e6ab6025-prontera-grind`**
**Status:** Research proposal only — no code changed, no balance shipped.
**Author:** Arena Agent — based on live `index.html` (BUILD `haven-v226`, ~10,791 lines) + online research.

---

## 0) TL;DR

Your current spawn is **solid and already shipped as the “RO feel” pass** — 8/10/12 camps scattered over the whole 26×40 lane, 1–3 mobs per camp 1.6–3.2u apart, each camp refilling on its own deterministic 4–8s timer, idle wander + aggro 6.5 + push-apart + lunge animation. It solved the old “3 clumped packs in the middle of the grass surrounded by empty field, whole wave thrown away 0.7s after last kill.” [ro-feel-plan.md](../../Updates/ro-feel-plan.md)

If you want to redesign **spawn** and **how mobs work**, don't throw that away — layer on top. The six options below are built from what modern idle/horde games actually do, and how the original RO, MapleStory, Vampire Survivors, and Diablo handle spawns today.

> **Recommendation (phased):** Keep camps as the stable base (Option A). Add a **Wave Director** that swaps which families are in the field over time (Option C), plus periodic **Rupture/Burst events** for density spikes and elite hunts (Option D). Optionally let players nudge spawn speed with a **Frenzy / Lure** toggle (Option F). This gives you RO-faithful + modern horde feel without rewriting combat.

---

## 1) How your current system actually works (code audit)

Source: `index.html` grep + `Updates/spawn-field/index.html` + `Updates/ro-feel-plan.md`.

```js
// Constants (index.html L1200+ / L4169+)
BX_=13, Z0=-28, Z1=12           // lane 26×40
MPS=15, AGGRO=6.5               // 15 kills to clear → next stage; 6.5u wake radius
CAMP_GAP=5.5, NEIGHBOUR_GAP=2.7
CAMP_REFILL_MIN=4, CAMP_REFILL_MAX=7  // per-camp refill, deterministic via sin(pos)
campCount(m)= m<3?8 : m<7?10 : 12
campMobs(m,l)= starterStage? 1-2 : 2-3
spawn() → campSites() → fillCamp(i,c) → mob.hx/hz anchors, spawn flash, mobVisualScale
bossWave → boss at (0,BOSSZ) + 3 or 5 escorts in 2.3-3u ring, 2.2-6u boss-roam
loop() → camps refill even when mobs=[] (v86 bugfix), idle drift 1.6u/2-5s, wake→chase 1.6u/s, stun/slow/pierce, damage = atk*(1-cut)*(1-dr)*(1-guard)
```

**Flow:**
1. **Normal field (Stages 1-9/1-14):** `spawn()` builds `camps = campSites(8/10/12)` avoiding water bands (`stageSpec.f.water` ±1.2–4.4u margin), each camp 5.5u apart (relaxes to 2.6 if lane is squeezed). `fillCamp` picks best of 24 ring spots 1.6–3.2u from camp center using `NEIGHBOUR_GAP` to avoid stacking. Mobs remember `hx/hz` anchor.
2. **Per-camp refill:** `campWait(c)=4+|sin(x*12.9898+z*78.233)|*3` → 4–8s deterministic. `loop()` ticks `c.t+=dt` only if camp is empty; when `t>=wait` → `fillCamp`. Whole-field wipe case fixed: also ticks when `mobs=[]` and camps still exist.
3. **Wander vs Aggro:** If `pack!==activePack` or `dist>=AGGRO` + not stunned → wander (`wt` 2–5s, drift 0.7u/s). Else → advance to `pl+cos(a)*ms` (`ms=1.9+0.25*size`), lunge carries hit. `mobMotion()` adds spawn arc + sway + hit recoil.
4. **Boss wave (Stage 10 or 15 + Nightmare/Ascension stage 5):** `baseHp=500*mb*pow(l,HPE)` (or ascension anchor `HPK*weight*pow(power,HPE)*NMHP*nm15Of(15)*hpRamp`), boss + escorts, fixed positions, `activePack=0`.
5. **Player routing:** `nearestPack()` → `packMob()` → `heroStandoff(mob)` (best ready ranged skill range → else bow 4 / staff 4.5 / melee 1.2+0.45*size, with 0.85× latch). `engageTgt` latched until 1.2u beyond range. Kite mode 3s/2s bounded.
6. **Kill progression:** `kill()` → `S.kl++` drops → if `kl>=MPS` (15) advance stage/unlock. Camps keep restocking; no wave reset.
7. **Stats/HP:** `HPK=42, HPE=1.3, pw=fieldPower(m,l)`, `hp=HPK*mb*pow(l,HPE)*nm`, `atk=(5+l*4.6)*mb*na*eaOf(l)`, with Nightmare `NMHP/NMATK` multipliers. Boss critRes `BOSS_CRIT_RES` 0→30% + `NM_CRIT_RES` 35→45% + `ASC_CRIT_RES` 45→55%.

**What it does well:** No empty map, always something to hit; deterministic refill rhythm; water-aware; lane stays clear.

**What it doesn't do (intentionally):** No rare wanderer, no champion affix, no density slider, no wave escalation, no assist/flee/pack tactics, no player control over pace, no day/night or time-based pool, no global tick/cooldown model. Proposals in `Updates/spawn-field/index.html` already explored “individual spawn points” (B) vs “camps+scatter” (A) and picked A.

---

## 2) What the research says

### 2.1 Ragnarok Online (official) — fixed points + timers
RO's permanent monster spawn is defined per map file: `map,0,0,0,0 monster Poring 1002,70,0,0` = 70 Porings random on `prt_fild08`, respawn instantly on death (minimum 5s enforced) [5](https://github.com/rathena/rathena/wiki/Permanent_Monster_Spawn). MVP/Mini spawns use `Delay1,Delay2` in ms — base + random variance, e.g. Baphomet 2h+10m, Moonlight Flower 1h+10m [5](https://github.com/rathena/rathena/wiki/Permanent_Monster_Spawn) [10](https://rathena.org/board/topic/82391-mob-spawn-rate/). MVP tombs mark kill time/owner, respawn windows are tracked by hunters [21](https://www.ragnarok-the-new-world.wiki/mvp-hunting/mvp-hunting-guide/).

Private servers tune via `mob_count_rate` (200 = double) and `mob_spawn_delay` / `mob_spawn_delay: 50 = twice as fast` [12](https://ratemyserver.net/mapinfo_mobdb.php), but density without design becomes “10–20 mobs on you per screen = unplayable” [1](https://www.reddit.com/r/RagnarokOnline/comments/10nwr47/mobby_maps/).

> **Takeaway:** RO authenticity = many named spawn points per map with counts & timers, plus rare MVP windows. Your current “random inside lane” is more procedural than RO; a mix of **authored hotspot + random scatter** would feel more RO.

### 2.2 MapleStory Classic — global tick + cap + point cooldown
Classic MapleStory is famous for one rule: **one global server tick every 7.56s** that walks every loaded map and refills empty spawn points (up to 1 per point, not exceeding map capacity ≈75% of points solo → 100% with 6 players) [1](https://meowdb.com/msclassic/guides/spawn-engine-respawn-and-map-capacity). Each point has a 5s cooldown (shorter than tick, so refill is ~7.56s) or its own timer for field bosses (60s–10,800s) [1](https://meowdb.com/msclassic/guides/spawn-engine-respawn-and-map-capacity) [2](https://github.com/Francesco149/mapleguide). Clearing evenly matters — leaving a platform uncleared piles mobs there and starves other points [2](https://github.com/Francesco149/mapleguide). Frenzy/Kishin/Ferocity double wave count to ~1600/hour vs 800 base [4](https://www.reddit.com/r/Maplestory/comments/nidwp6/does_anyone_know_whats_the_interval_between_each/).

> **Takeaway:** Tick+cap model makes spawn **predictable and fair** — you can full-clear just before the wave and not wait. It also explains why “density per valid cell” matters more than raw count [12](https://www.reddit.com/r/RagnarokOnline/comments/1tqk1xm/whats_the_fastest_way_to_drop_oab_higher_kills/).

### 2.3 Vampire Survivors — wave director + min/max + curse scaling
VS runs **one wave per minute**, each wave has its own enemy pools, spawn interval, min/max, and timed boss/event entries [1](https://www.reddit.com/r/VampireSurvivors/comments/1bdhrxr/how_does_the_spawn_system_works_in_this_game/) [2](https://vampire-survivors.fandom.com/wiki/Enemies). If below minimum → spawn faster until quota; if above 300 alive → no more periodic spawns, only bosses/events [2](https://vampire-survivors.fandom.com/wiki/Enemies). Curse increases frequency+quantity+speed+HP; Charm (and player power) gates scaling; enemies spawn in a rectangle from screen edge to ~50% further out, not on top of existing enemies [1](https://www.reddit.com/r/VampireSurvivors/comments/1bdhrxr/how_does_the_spawn_system_works_in_this_game/) [17](https://vampire.survivors.wiki/w/Curse). Endless/Hurry modes simply loop waves with +100% HP/+50% spawn/+25% dmg per cycle [2](https://vampire-survivors.fandom.com/wiki/Enemies).

> **Takeaway:** VS makes idle killing **escalate predictably** — each minute feels different, you chase faster clears to see more spawns (faster kills → more spawns) [4](https://www.reddit.com/r/VampireSurvivors/comments/smv71e/how_does_enemy_spawn_work/), but a cap prevents performance melt.

### 2.4 Diablo 4 — density + events as endgame
D4 shipped with lower open-world density (mount traversal) [5](https://diablo.fandom.com/wiki/Diablo_IV) then **explicitly increased Nightmare/Helltide density post-launch** — “currently working on increasing monster and elite density of endgame content” [2](https://www.pcgamesn.com/diablo-4/monster-density). Helltides overlay zones with higher density+elite+drop rates via rifts/shrines/corruption [9](https://www.itemd2r.com/blog/diablo-4/helltide-farming-strategy-for-legendary-drops--guide). Season 14 Pandemonium Ruptures add 3 sizes (Standard/Surging/Colossal) that pour density, require ritual-ring holds, and reduce movement/time to fill progress bars — but are throttled in The Pit to protect competitive runs [11](https://www.notebookcheck.net/Diablo-IV-overhauls-seasonal-Rupture-activities.1331997.0.html) [16](https://timesaver.gg/blog/diablo-4-pandemonium-ruptures-guide).

> **Takeaway:** Density is an **endgame reward**, not a default — you gate it behind torments, Helltides, and opt-in bursts. Too much everywhere breaks pathing and meta (AoE vs single-target balance) [13](https://us.forums.blizzard.com/en/d4/t/please-give-us-more-mob-density/47950).

### 2.5 Idle game loop theory
Idle games live on **“generate → invest → speed up generation → re-engage”** [5](https://ericguan.substack.com/p/idle-game-design-principles). Pecorella's GDC idle worksheets emphasize **math models for rebirth/prestige pacing** — a reset only works if it clearly pays `(level-30)^1.35` etc. [8](https://onirealms.com/guides/how-to-design-an-idle-game/) [4](https://archive.org/details/idlegameworksheets). Aggro theory reminds: in single-player, “closest” aggro makes tanks always eat hits; add **aggro points = damage × threat multiplier** + decay to shape who gets attention [2](https://mhlab.tech/code/monster-aggro-system/) [7](https://discussions.unity.com/t/ai-monsters-aggro/597553). Modern Mabi-style states (No Aggro → Detect `!` → Aggro `!!` → Retreat) with return-home healing are proven for solo play [10](https://wiki.mabinogiworld.com/view/Aggro).

> **Takeaway:** Your idle loop (auto-kill 15 → stage unlock → stat/gear → harder field) already fits. Spawn redesign should **modulate income per minute** (IPM), not just visuals — measure EXP/min, Zeny/min, cards/hour, not just “feels empty.”

---

## 3) Design goals for a redesign

Pick 3–4; don't try to max all:

- **G1 — RO-faithful:** Hotspots per map, rare MVP windows, authored feel over pure noise.
- **G2 — Always busy:** Zero downtime; you never stare at empty grass (current already does this).
- **G3 — Variable texture:** Early sweeps vs late swarms vs elite spikes — each minute feels different.
- **G4 — Player agency:** Light control over pace (frenzy/lure) without pay-to-win.
- **G5 — Performance-safe:** Hard cap on alive mobs; pooling, not infinite spawns.
- **G6 — Work that reads:** Mob AI you can see (charge, assist, flee, kite) without needing a party tank.

---

## 4) Six concrete options (swap one, layer many)

### Option 1 — “Tavern Board” (RO-authentic hotspots)
**Mechanic:** Replace pure-random `campSites()` with **authored spawn nodes** per map. Each stage recipe gains `nodes: [{x,z,radius, weight, families:[Poring,Fabre], boss: false}]` (8–14 nodes). Keep your current `CAMP_GAP`/`NEIGHBOUR_GAP` inside nodes; add 20–30% random scatter outside for texture. Nodes persist across stage advances; only counts/timers scale with `fieldPower`.

**Mob work:** Add **pack role** per node: sentry (holds ground, Detect→Aggro at 6.5), roamer (wander 1.6u), lurker (passive, only Aggros on hit or nearby ally death — mimics RO passive → assist). Assist radius 3.5u: on death, nearby same-pack passive mobs auto-aggro.

**Pros:** Most RO-feel; mappers can craft memorable payon creek bridge hotspot, geffen tree clusters, etc. Easy to tune per map.

**Cons:** Authoring cost; needs tooling to paint nodes per map (reuse `tools/map_journey` or `native-fields` editor).

**Balance:** Neutral — same total mobs, just placed better. Keep `MPS=15` untouched.

**Code touch:** Small — add `stageSpec.nodes` to recipe, branch in `campSites()` to jitter inside nodes 70% vs scatter 30%.

---

### Option 2 — “Clockwork Field” (Maple tick + cap)
**Mechanic:** Replace per-camp `t→wait` continuous timers with a **global tick** like MapleStory's 7.56s [1](https://meowdb.com/msclassic/guides/spawn-engine-respawn-and-map-capacity). On tick: walk all camps, refill at most 1 mob per empty camp, up to cap = `min(campCount*perCampAvg * capPct, maxAlive)` (capPct 0.75 solo → 1.0 in party/social). Per-point cooldown 5s (shorter than tick, so refill is tick-rate-limited). Rare points have own timer (e.g., Ghostring node 300s) [3](https://ms-classic.com/guides/spawn-rate-and-map-capacity).

**Mob work:** Add **“unclaimed node piles up”** visual — if hero ignores a camp for 2 ticks, mobs there jitter more visibly and emit dust, telegraphing “clear me for faster cycle” (Maple's even-clear lesson [2](https://github.com/Francesco149/mapleguide)).

**Pros:** Predictable rhythm; players learn to route; offline simulation becomes trivial (ticks/hour math).

**Cons:** Feels mechanical if tick is visible (stutter spawns). Needs “bus sync” smoothing — queue mobs between ticks and spawn together like Maple [1](https://meowdb.com/msclassic/guides/spawn-engine-respawn-and-map-capacity).

**Balance:** Slight nerf to burst-clear builds (can't insta-refill by re-killing same camp) — compensate with +10% EXP per kill or keep existing 4–8s variant inside tick.

**Code touch:** Medium — new `fieldTick()` called from `loop()` or offline calc; replace `campWait()` with `nextTick`.

---

### Option 3 — “Wave Director” (Vampire Survivors)
**Mechanic:** Keep camps, but add a **wave table** per map/field power band — every 60s (or 45s at high Torment) swap which families are in the field and the min/max alive + interval. Example for Comodo `pw40`:

```
t0-60s  Swarm: Merman 60% + Sea Witch 40%, min8 max24 interval1.5s
t60-120 Chase: Coral Crab (swift) 50% + Giant Eel (tank) 50%, min10 max28 interval1.2s
t120-180 Event: Siren 1 + 6 adds, spawns once, chest on kill
```

This is VS's “one wave per minute” rule [2](https://vampire-survivors.fandom.com/wiki/Enemies) with your camps as spawn slots.

**Mob work:** Per family, add **trait tags**: `swift` (+25% move), `armored` (cut `prOf` piercing), `vampiric` (heal on hit), `knockback`, `suicide` — tiny stat tweaks, no new animations. VS-style scaling: `effectiveInterval = base / (1+curse)` [17](https://vampire.survivors.wiki/w/Curse). Your “curse” = `fieldPower` band or player-chosen Torment.

**Pros:** Huge variety per map without new art; each minute pushes you to move; pairs perfectly with timed buffs (your Daily Roulette 30-min EXP/Zeny) [v226 notes].

**Cons:** Needs data table per map (10 maps × 5 waves = 50 rows). Must cap 300 alive → no more periodic spawns, only bosses [2](https://vampire-survivors.fandom.com/wiki/Enemies) to avoid perf burn.

**Balance:** Can be EXP-neutral — same kills/hour, different mix. Measure with `tools/compare_field_combat.cjs`.

**Code touch:** Medium — new `WAVE_DIRECTOR[map][band]` table; `loop()` swaps `F.mobs` pool reference; add `aliveCap` guard.

---

### Option 4 — “Helltide / Rupture Bursts” (Diablo)
**Mechanic:** Over your normal camps, trigger **timed bursts** that temporarily pour density:

- **Helltide-style zone buff:** Every 90m real time, pick 1 map → +80% density, +1 elite per 6 mobs, +25% drop, for 20m (D4's “increase Nightmare/Helltide density” playbook [2](https://www.pcgamesn.com/diablo-4/monster-density) [9](https://www.itemd2r.com/blog/diablo-4/helltide-farming-strategy-for-legendary-drops--guide)).
- **Rupture-style tear:** Mid-fight, a 15s tear opens at hero's far edge, pouring 12–18 mobs in 3 waves + 1 elite. Ritual-ring hold: staying inside ring extends tear +2s (S14's “stay inside ritual ring extends rupture” [18](https://www.ssegold.com/diablo-4-season-14-mechanics-guide-death-awakening)). Cap throttled in Boss stages / Endless Echo to protect balance [11](https://www.notebookcheck.net/Diablo-IV-overhauls-seasonal-Rupture-activities.1331997.0.html).

**Mob work:** Elites roll 1–2 affixes: **Swift/Armored/Vampiric/Shielded/Mortar** (D4's elite pack design). Boss escorts become true adds that the boss can re-summon at 70%/40% HP.

**Pros:** Best “endgame chase” feel; fits your Ascension material economy (Shards/Sigils on elite kills). Easy to gate by `S.lvl>80` or fourth-job.

**Cons:** Needs cooldown/visual juice; don't spam on starter maps.

**Balance:** Burst gives +35% kills/min → must *not* count toward `S.kl` stage clear (or it trivializes `MPS=15`) — treat burst kills as bonus EXP/Zeny only, or require `MPS` kills from non-burst mobs.

**Code touch:** Medium — new `helltideActive` state, `ruptureT` timer, extra `fillCamp`-like helper that bypasses normal cap for 15s.

---

### Option 5 — “Living Ecology” (mob work overhaul, spawn lite)
**Mechanic:** Keep spawn as-is; redesign **what mobs do** with you.

States: `IDLE (wander) → DETECT (!, 1s windup) → AGGRO (!!, chase) → ATTACK → LEASH (return home + heal) → RETREAT` — the Mabinogi ladder [10](https://wiki.mabinogiworld.com/view/Aggro) with your existing `AGGRO=6.5` and `BOSS_NEAR/FAR` rings.

Add per-species AI (pick 2–3 per map):

| Role | Behavior | Example |
|---|---|---|
| **Grunt** | Chase, hit, push apart (current) | Poring, Fabre |
| **Swarmer** | Spawns in 4s, dies in 2 hits, assist on ally death | Thief Bug brood |
| **Sniper** | Holds 5–7u, telegraphed 0.8s cast, projectile | Orc Archer |
| **Caster** | AoE slow/DoT puddle at hero, 6s cd, 3s duration | Whisper, Marina |
| **Brute** | 2× HP, 0.7× speed, enrage at 30% HP (+30% atk speed) | Minorous |
| **Coward** | Flee at 25% HP, heal if reaches anchor, call 1 add | Lunatic |

Pack tactics: **assist radius 4u** (passive → active when ally hit, like RO's “changed to assist nearby monsters” tweak [8](https://www.reddit.com/r/incremental_games/comments/iwtzxz/offline_ragnarok_online/)), **formation** (ranged stays behind melee, 1u spacing), **leash** (if dragged >12u from anchor, drop aggro, walk home, full heal).

**Pros:** Huge readability upgrade without touching spawn counts; good for 6.5 AGGRO + 1.9+0.25*size standoff feel already tuned [ro-feel-plan.md](../../Updates/ro-feel-plan.md).

**Cons:** Needs tuning so casters don't perma-slow; test with `ascension_attack_sim`.

**Balance:** Same kills/hour; may *feel* harder → lower raw mob ATK 5–8% to compensate or raise `flee` window slightly.

**Code touch:** Medium — extend `minionDef` with `ai:{role, castCd, fleeHp}`, branch in `loop()` mob update; reuse your `mobMotion` lunge + add `castAnim` timer.

---

### Option 6 — “Player Dial” (spawn agency + prestige)
**Mechanic:** Give players a **Frenzy slider** + **Lure consumable** (idle-game trope: pay to speed up generation) [5](https://ericguan.substack.com/p/idle-game-design-principles).

- **Frenzy toggle:** Off (1.0×), On (1.6× spawns, 1.2× mob ATK/HP, +18% EXP/Zeny, -8% drop quality). Implemented as `effectiveInterval = base / frenzy` and `campWait * 0.65` (VS curse/charms parallel [17](https://vampire.survivors.wiki/w/Curse)).
- **Lure:** Single-use (craft from 10 Jellopies), spawns 1 elite pack now, 5m cooldown. Consumes burst budget, not camp budget.
- **Auto-prestige link:** At `Base 150` (fourth-job gate), lures can target a specific MVP family for card hunt — your “Boss Map targeted summon” idea from `docs/map-concepts/FULL-PROPOSAL.md`.

**Mob work:** Minimal — elite uses existing model with 1.5× HP/1.3× ATK, drops extra card roll.

**Pros:** Lowest code; gives streamers/content a knob; economy-tunable via `mob_spawn_delay` / `mob_count_rate` style scalars [3](https://rathena.org/board/topic/82391-mob-spawn-rate/).

**Cons:** If uncapped, players camp frenzy forever → make it cost Zeny or time-gated (like your offline cap 4h/10m sim cover).

**Balance:** Must stay EXP-neutral over long AFK — tie to active play only (like Idleon crystals only in active play [11](https://steamcommunity.com/app/1476970/discussions/0/5590708606422857158/?l=english)).

**Code touch:** Small — `S.frenzyOn` bool, multiply in `campWait`/`fillCamp`; new `ACT.lure` button.

---

## 5) Comparison matrix

| Option | RO feel | Variety | Agency | Perf risk | Code effort | Offline friendly |
|---|---|---|---|---|---|---|
| **1 Hotspots** | ★★★★★ | ★★ | ★ | Low | S | ★★★ |
| **2 Tick+Cap** | ★★★★ (RO rate cfg) | ★★ | ★★ (cap) | Low | M | ★★★★★ |
| **3 Wave Director** | ★★★ | ★★★★★ | ★ | Med (cap) | M | ★★★★ |
| **4 Helltide/Rupture** | ★★★ | ★★★★★ | ★★★ (event) | Med | M | ★★★ (active only) |
| **5 Living Ecology** | ★★★ | ★★★★ | ★★ (tactics) | Low | M | ★★★ |
| **6 Player Dial** | ★★ | ★★ | ★★★★★ | Low | S | ★★ (gate by active) |

---

## 6) Recommended path (what I'd build first)

**Phase 1 — Foundations (1–2 days, no art)**
- Ship **Option 1 nodes** for 3 maps (Prontera/Izlude/Payon) as data-only: add `nodes` to 2 recipes, keep 30% scatter fallback.
- Add **assist** + **coward** from Option 5 (2 tags, 10 lines each). Verify with `field_loop_smoke`.
- Keep `BUILD` bump, pin counts so `MAPS.length*stages*kills` EXP stays within 4–6 kills avg (your HPE=1.3 promise).

**Phase 2 — Rhythm (next)**
- Add **Wave Director table** for Comodo/Geffen onward (3 entries per map: swarm/chase/event). Start with interval only, no new art. Cap alive at 32 regular + boss wave.
- Add **Rupture burst** gated to `S.lvl>80` or Ascension: 15s tear, 12 mobs + 1 elite, 3m cooldown, visuals from existing skill-fx (reuse `afterglow`).

**Phase 3 — Agency (when economy wants it)**
- Add **Frenzy toggle** that scales `campWait`/`interval` + mob ATK. Cost it with Zeny sink or daily limit to avoid Idleon-style “only active play matters” split [11](https://steamcommunity.com/app/1476970/discussions/0/5590708606422857158/?l=english).
- Evaluate tick+cap if you want Maple-accurate offline math — only if offline income variance bothers you.

**Why this order:** You preserve the shipped RO feel, add visible work (players see cowards flee, assists swarm, waves rotate), and keep `MPS=15` stage gating intact. D4's lesson: density is a reward, not a default [13](https://us.forums.blizzard.com/en/d4/t/please-give-us-more-mob-density/47950).

---

## 7) How to measure (before you ship)

Use your existing harnesses:

- `tools/compare_field_combat.cjs` + `tools/summarize_field_combat.cjs` → kills/min, deaths, income with new density.
- `tools/tests/field_loop_smoke.js`, `ascension_attack_sim.js`, `economy_sim.js` → regression.
- New quick check: spawn coverage map — “mobs within 10u” and “walk per 10 kills” like `Updates/spawn-field/index.html` already graphs. Keep walk ≤ 30u/10 kills.

Targets for `HPE=1.3` era: early maps 2 swings/kill, late 5, boss 12× — don't let density stealth-nerf single-target DPS.

---

## 8) Open questions for you

1. Do you want **more RO** (authored hotspots, MVP clocks) or **more horde** (waves, ruptures)?
2. Should bursts count toward `MPS=15` stage clear or be bonus only?
3. Is offline allowed to “Frenzy”? Idleon says no [11](https://steamcommunity.com/app/1476970/discussions/0/5590708606422857158/?l=english) — but your `OFFLINE_CAP_MS=4h` already budgets it.
4. For mob work, which 2 roles excite you: **swarmer/sniper/brute/caster/coward/assist**?

Reply with picks (e.g., “Phase 1 nodes + wave director, bursts = bonus, roles = assist+brute”) and I’ll draft the recipe schema + code diff.

---

## 9) Appendix — save & migration safety

All options keep `S.mp/S.lvl/S.kl`, `mobs[]/camps[]/activePack`, `fieldPower()`/`fieldOf()` IDs stable. New fields (`nodes`, `waveId`, `frenzyOn`) are additive, default to current behavior, and `repairProgression()` can backfill. No item duplication, no pet ID reorder, no BUILD bump needed for doc-only state.

---

## 10) Sources

- RO permanent spawn syntax + 5s minimum + Delay1/Delay2 MVP windows [5](https://github.com/rathena/rathena/wiki/Permanent_Monster_Spawn) [6](https://docs.herc.ws/scripting/permanent-monster-spawn/) [10](https://rathena.org/board/topic/82391-mob-spawn-rate/)
- RO private server rates `mob_count_rate`/`mob_spawn_delay` [3](https://rathena.org/board/topic/82391-mob-spawn-rate/)
- MVP tomb + hourly windows [4](https://irowiki.org/wiki/MVP) [21](https://www.ragnarok-the-new-world.wiki/mvp-hunting/mvp-hunting-guide/)
- MapleStory global 7.56s tick + 5s point cd + 75%→100% cap [1](https://meowdb.com/msclassic/guides/spawn-engine-respawn-and-map-capacity) [2](https://github.com/Francesco149/mapleguide)
- Maple spawn enhancers 800→1600 waves/hr with Frenzy [4](https://www.reddit.com/r/Maplestory/comments/nidwp6/does_anyone_know_whats_the_interval_between_each/)
- Vampire Survivors waves 1/min, min/max, 300 cap, curse scaling, spawn rect [1](https://www.reddit.com/r/VampireSurvivors/comments/1bdhrxr/how_does_the_spawn_system_works_in_this_game/) [2](https://vampire-survivors.fandom.com/wiki/Enemies) [17](https://vampire.survivors.wiki/w/Curse)
- D4 density increased in endgame + Helltide + Ruptures 3 sizes + ritual ring [2](https://www.pcgamesn.com/diablo-4/monster-density) [9](https://www.itemd2r.com/blog/diablo-4/helltide-farming-strategy-for-legendary-drops--guide) [11](https://www.notebookcheck.net/Diablo-IV-overhauls-seasonal-Rupture-activities.1331997.0.html) [16](https://timesaver.gg/blog/diablo-4-pandemonium-ruptures-guide)
- Idle loop “generate→invest→speed up” [5](https://ericguan.substack.com/p/idle-game-design-principles), GDC idle math [4](https://archive.org/details/idlegameworksheets) [8](https://onirealms.com/guides/how-to-design-an-idle-game/), aggro points vs closest [7](https://discussions.unity.com/t/ai-monsters-aggro/597553) [10](https://wiki.mabinogiworld.com/view/Aggro)

---

## 11) Interactive reference

Open `Updates/spawn-field/index.html` in a browser (via `python3 -m http.server 8000` or your PR preview) to replay the shipped A vs B spawn math, or see `tools/mob-spawn-lab.html` (this patch) for the new wave/rupture knobs once added.

