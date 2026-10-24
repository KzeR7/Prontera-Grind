# You’re right — it *is* a 1v1, not a field. Why AoE doesn’t start a fight.

**Prontera Grind · 2026-10-24 follow-up to `mob-spawn-redesign-2026-10-24.md`**
**Branch `arena/e6ab6025-prontera-grind` · No code shipped yet.**

You nailed it. The previous proposal focused on *where* mobs stand (camps, tick, wave, rupture). Your note is about *how they decide to fight* — and that’s actually the bigger bug:

> You hit 2–3 camps with an AoE, you see damage numbers on different camps, but only your current camp fights back. It looks like AoE is broken, but really the monsters never woke up.

This doc is code-grounded (live `index.html` ~10.8k lines) and fixes that.

---

## 1) What’s actually happening today — the three locks

### Lock 1 — “Only the active camp is awake”
```js
// index.html:7451 — the ONLY way a monster wakes
const wake = m.pack === activePack && (isBoss() || Math.hypot(pl.x-m.x, pl.z-pl.z) < AGGRO)
// AGGRO = 6.5 units, ms = 1.9 + 0.25*m.size
```
`activePack` is whichever camp is closest to you (`nearestPack()`). Every camp beyond that — even 7 units away — is sleeping. A sleeping mob just wanders `0.7u/s` around its own anchor and **never attacks**, even if you just burned it for half its HP.

Bosses ignore `AGGRO`, normal mobs don’t.

This is why the field *feels* full but fights like an arena: 24 mobs on screen, 2–3 awake.

### Lock 2 — AoE only hits your pack
```js
// index.html:5004 — skillTargets(), the core AoE filter
return mobs.filter(o=>{ if(o.hp<=0 || o.pack !== target.pack) return false; … })
// chainHit() and bounceStrike() share it: o.pack===src.pack
```
`Bowling Bash`, `Storm Gust`, `Meteor Storm`, `Heaven’s Drive` — all of them do:

> “Take the targeted mob’s pack. Only consider mobs in that pack. Check shapes (splash/line/cone/cross, `dist <= 3.5*area`).”

So an AoE can *never* cross a camp boundary, even if two camps overlap visually. You must manually walk to the next camp, which resets `activePack`.

### Lock 3 — Damage doesn’t wake anything
`skillHit()` / `hurt()` / `strike()` subtract HP and trigger `kill()`, but **never set a wake flag, never link neighbours, never change `activePack`**. The only thing that wakes is proximity.

Result: you see 2 damage numbers from one swing (both mobs in pack), kill 1, the survivor *does* fight back. But the 3 mobs 4u behind you that also took splash? They got `o.hp -= d` and stayed in `idle wander`.

This is the opposite of classic RO, where:
- Monsters have **Aggressive** (sight-aggro), **Assist** (run when same family is attacked), **Cast Sensor Idle/Chase**, **Change Target Chase/Melee**, **Angry/follow** flags [4](https://irowiki.org/wiki/Monster) [6](https://github.com/rathena/rathena/blob/master/doc/mob_db_mode_list.txt)
- Assist = *“When a nearby mob of the same class attacks, assist types will join them”* [2](https://irowiki.org/wiki/Monster) — rAthena lists it as `MD_ASSIST = 8` [6](https://github.com/rathena/rathena/blob/master/doc/mob_db_mode_list.txt)
- WoW-style **social aggro**: “the moment one enters combat, neighbors within radius run to help — humanoids in camps are especially dangerous, 1 pull becomes 3–4” [12](https://wowx5.ru/en/wiki/aggro-mechanics)

Your game today behaves like passive-only + no assist, so training (RO’s famous `/swt2` mob trains [10](https://www.reddit.com/r/RagnarokOnline/comments/8q4gbj/mobbing_tutorial_for_classic_servers_originsro/)) can’t happen — mobs leash to anchors instead.

---

## 2) Why you feel “1v1” — the loop in numbers

- `pAtkT` (your swing) ~0.13–0.14s at cap → you hit every 0.4–0.55s animation
- `m.at` (monster swing) `1.5s` normal / `1.2s` boss, only when in `ms+.4` range while awake
- Only `activePack` → max simultaneous attackers = `2–3` (your `campMobs` roll), often 1 because `engageTgt` latches to one until 1.2u beyond reach
- Boss stage: `boss + 3–5 escorts`, but escorts also gated by `activePack` (boss wave uses `pack=0` so it works — that’s why boss stages feel better)

So: you vs 1, occasionally vs 2–3, never vs a swarm — even with `Bowling Bash` claiming *“sweep nearby enemies”*.

---

## 3) What “fixing it” actually means — 4 paths

### Path A — Minimal fix (1 file, 20 lines, keeps your current feel)
**Idea:** Damage always wakes. Neighbours assist a little.

```
On any hurt/skillHit(o):
  o.provokeUntil = t + 6           // this mob is now awake even if o.pack != activePack
  for each other mob p within ASSIST_R = 3.2u:
    if p.pack === o.pack || isSocialFamily(p,o):
       p.provokeUntil = max(p.provokeUntil, t + 4)

wake = (m.pack===activePack || t < m.provokeUntil) && (isBoss() || dist < AGGRO || t < m.provokeUntil)
```

- AoE stays pack-locked for now, but a second swing that *does* land on another camp wakes it.
- Assist radius = your existing `NEIGHBOUR_GAP=2.7` + a little — so only *nearby* camps join, not the whole map.
- Leash: if a provoked mob is dragged >12u from `hx/hz`, clear `provokeUntil` and it walks home healing (prevents training abuse — the `/swt2` de-aggro problem [10](https://www.reddit.com/r/RagnarokOnline/comments/8q4gbj/mobbing_tutorial_for_classic_servers_originsro/)).

**Pros:** Fixes “hit but didn’t wake” with almost no rebalance. Still 2–4 attackers max.

**Cons:** Pack-locked AoE remains — you still can’t splash 2 camps in one swing.

**Balance:** Expect +25% incoming DPS in denser maps (Morroc/Comodo) because 1→2 attackers more often. Compensate: `m.at` 1.5→1.75s OR `m.atk` ×0.92 for non-boss when `wokeViaProvoke` (keeps time-to-kill same but less burst).

---

### Path B — True AoE across camps (shape-first, pack-second)
**Idea:** Unlock AoE from `pack` and make it **position-first**, with a cap so it’s not infinite.

```js
// replace skillTargets() pack filter
const candidates = mobs.filter(o=> o.hp>0 && Math.hypot(o.x-center.x, o.z-center.z) <= 3.5*area);
candidates.sort((a,b)=> dist(a,center)-dist(b,center));
return candidates.slice(0, aoeCap(sk)); // cap: e.g. splash=4, line=6, radial=6, cone=5
```

- `shape` already does real geometry (`along/side` for line/cone, `dist` for splash) — keep it, just drop the `pack===target.pack` gate.
- Add per-skill `aoeCap` (store in `SKILLS[i].cap` — default 1 for single, 3–6 for AoE) like the old `SKFADE` / `SKSLOTS` tuning.
- Chain/bounce also become `nearby any mobs`, not `same pack`.
- Wake via Path A still applies: every hit provokes.

Effect: `Bowling Bash` sweeping 2 overlapping camps now hits both. `Storm Gust` 3.5u splash can grab 2 nearby camps if they’re tight (which they often are at `CAMP_GAP=5.5`).

**Pros:** AoE finally *feels* like AoE. Still capped, so you don’t nuke the map.

**Cons:** More multi-aggro = more incoming hits. Also pets + AoE stack → faster clears → faster `S.kl` (15 kills to next stage) → stages fly by. Decide: should cross-camp bonus kills count toward `MPS`? Recommend **no** for Phase 1 (bonus EXP/Zeny only), then re-enable once tuned.

---

### Path C — RO-authentic: Aggressive / Assist / Cast Sensor per species
**Idea:** Restore RO’s mob personality flags [2](https://irowiki.org/wiki/Monster) [4](https://ragnaplace.com/en/wiki/irowiki/Monster).

Per species (add to `MAPS[m].mobs[j]` in `fieldOf()`):

```js
// rAthena modes: 1 canMove, 4 aggressive, 8 assist, 16 castSensorIdle, 512 castSensorChase, etc. [6]
{m.n:'Thief Bug', aggressive:true, assist:true, assistFamily:'Thief Bug', linkRadius:4.5, castSensor:false}
{m.n:'Willow',   aggressive:false, assist:false, linkRadius:0, sensitive:false} // passive until hit
{m.n:'Ghoul',    aggressive:true, assist:false, angry:true} // hyper-active before first hit [6]
```

Rules:
- **Aggressive**: wakes via proximity (current `AGGRO=6.5`) even without damage.
- **Assist**: when any mob of same `family` within `linkRadius` is hit, join with `provokeUntil`. This is literal RO (“assist other monsters of its kind” [2](https://irowiki.org/wiki/Monster)).
- **Cast Sensor**: if `castSensorIdle` and you use a skill inside `sightRange=12` while mob is idle, it aggros — like RO’s mage-luring mobs [5](https://forums.warpportal.com/index.php?%2Ftopic%2F89360-how-does-the-aggro-system-work-in-ro%2F).
- **Change Target**: `changetargetMelee=1000` means a mob can retarget if another player (or in your solo case, your pet) tags it — future-proof for social plaza parties.

**Pros:** Most RO-faithful, huge map texture (Payon Willows stay chill, Morroc Ghouls swarm). Designers can craft “trap camps” of passive mobs that all assist when one is tapped.

**Cons:** Needs data entry per species (10 maps × 6–10 species). Start with 2 values per species: `aggressive` bool + `assistRadius` 0–4.

---

### Path D — Full social/assist + threat (the MMO tank fix)
If you ever want “the mob picks who to hit” (today it’s always you, but pets can tank), RO/MMO theory says don’t use `closest`, use **threat = damage × threatMult + decay** [7](https://discussions.unity.com/t/ai-monsters-aggro/597553).

Sketch for later, not Phase 1:

```
onDamage(mob, dam, src):
  mob.threat[src] += dam * (src.isTank ? 1.8 : 1.0)
  mob.threat decays 8%/s

chooseTarget(mob):
  pick highest threat within 10u whose threat > current*1.1 (melee) / 1.3 (ranged)
```

Add `AGGRO_PROB` per class (tank = 100%, DPS = 40%) as in the classic “tank holds aggro” write-up [7](https://discussions.unity.com/t/ai-monsters-aggro/597553). Your current solo game doesn’t need this yet, but it’s the clean answer when pets/social matter.

---

## 4) Recommended rollout — fix the 1v1 this week

**This week — Path A + a tiny slice of B (no tuning needed):**

1. **Damage wakes + 3.2u assist.** Any `hurt()` / `skillHit()` provokes the victim 6s and neighbours 4s. Wake = `pack===activePack OR provoked`. Leash 12u → walk home + heal (copies “follow/angry → normal” after hit [6](https://github.com/rathena/rathena/blob/master/doc/mob_db_mode_list.txt)).
2. **AoE cap, still pack-limited for now.** Add `SKILLS[].aoeCap = {single:1, splash:3, cone:4, line:5, radial:6}[shape]` — but keep `pack===target.pack` until balance is proven. This alone makes “2-mob camp” feel like 2-mob camp.
3. **Soften the damage spike.** When `wokeViaProvoke && !isBoss()`, `m.at *= 1.18` or `m.atk *= 0.9`. Keeps TTK identical, removes “2 awake = 2× damage” surprise.

**Next — Path B (position-first AoE):**
- Drop the pack gate in `skillTargets()`/`chainHit()`/`bounceStrike()`/`tickSkillFields()`. Keep `aoeCap`. Make `fieldReady` fields scan by distance, not pack.
- Decide: cross-camp hits count toward `S.kl` (15 to clear) or are bonus? Start as bonus.

**Later — Path C (RO flags):**
- Add `aggressive/assist` per species to map recipes. Passive mobs (Poring, Lunatic) = no sight-aggro; Aggressive (Scorpion, Ghoul) = sight-aggro 6.5; Assist (Thief Bug family) = linkRadius 4. That alone recreates “pull 1 Thief Bug, get 3”.

All three phases keep `activePack`, `CAMP_GAP`, `MPS`, `EXP_RATE`, `prOf`/`HPE` stable — save migration is just `m.provokeUntil||0`, no wipe.

---

## 5) What to tell players vs what’s actually changing

Player language:
> “Monsters now fight back together. Hit one and its nearby friends notice. AoE can hit more than one camp at once.”

Implementation truth:
> `wake = (pack==activePack || t<provokeUntil) && (isBoss||dist<AGGRO||provoked)` + `assistRadius 3.2` + optional `pack gate removed` + `aoeCap`.

No `main` push until you confirm; this stays on `arena/e6ab6025-prontera-grind`.

---

## 6) Quick test checklist

- `tools/tests/field_loop_smoke.js` — still 9/9 (spawn/camp/loop untouched)
- New: `field_aoe_sim.js` — 1 AoE swing hits 2 camps → assert both provoked & >1 attacker in next 1.5s
- New: `combat_damage_sim.js` — 2-wake DPS ≤ 1.3× single-wake (due to `at` softening)
- Manual: Payon st1 (creek, 10 camps tight) — AoE should pull 2 camps, not 6

---

## 7) Your call

- Do you want **(A) minimal wake+assist this PR** or **(A+B) true cross-camp AoE**?
- Should **passive mobs** exist (some don’t aggro until hit) or should everything be aggressive?
- Should cross-camp bonus kills count toward `S.kl=15` stage clear?

Reply like: `wake+assist, keep passive, bonus≠kl` and I’ll ship the ~30-line patch + test.

---

## Sources

- Monster Assist / Aggressive definitions [2](https://irowiki.org/wiki/Monster) [4](https://ragnaplace.com/en/wiki/irowiki/Monster) [1](https://irowiki.org/wiki/Monster)
- rAthena mode flags: `MD_AGGRESSIVE=4, MD_ASSIST=8, MD_CHANGETARGETMELEE=1000`, etc. [6](https://github.com/rathena/rathena/blob/master/doc/mob_db_mode_list.txt)
- Assist as “join when same class attacks”, Change Target Chase/Melee [2](https://irowiki.org/wiki/Monster)
- WoW social aggro explainer “1 pull becomes 3–4 in camps” [12](https://wowx5.ru/en/wiki/aggro-mechanics)
- RO training / `/swt2` passive switch after chase [10](https://www.reddit.com/r/RagnarokOnline/comments/8q4gbj/mobbing_tutorial_for_classic_servers_originsro/)
- Aggro threat model (damage×prob + decay, 10%/30% swap) [7](https://discussions.unity.com/t/ai-monsters-aggro/597553)
- RO aggro via cast circle / threat protocols [5](https://forums.warpportal.com/index.php?%2Ftopic%2F89360-how-does-the-aggro-system-work-in-ro%2F)
