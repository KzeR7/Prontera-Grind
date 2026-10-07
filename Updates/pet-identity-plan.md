# Pet identity — making players hunt a *species*

> **DECIDED — and now built, see `grind-v75`.** The owner picked **Lever 1 + Lever 4 combined**:
> species signature passives plus duplicate Bond. Lever 1 was tuned down to his rule — *"i dont want
> any buff go above 10%"* — so every passive is worth **5% at Bond 0 and 10% at Bond 5** (the table
> in Lever 1 below still shows the original, stronger draft; the shipped numbers live in
> `index.html`'s `PET_TRAIT` and in the v75 section of READ-ME-FIRST.md). **Lever 2 (per-map species
> tables) and Lever 3 (pity / habitat)** were not chosen and are not in the build; the notes are kept
> here in case the owner revisits hunting later. Lever 5's extra ideas (leaning gacha, field
> synergy, rarity flattening) are likewise unbuilt.

*Design note. Every number below was read out of `index.html` on `grind-v74.1`.*

## What the system actually does today

| Thing | Today |
|---|---|
| Roster | 8 species, 2 per rarity — **Common** Poring, Lunatic · **Rare** Wolf, Desert Wolf · **Epic** Peco Peco, Dragon Whelp · **Legendary** Baphomet Jr., Angeling |
| How a pet arrives | Monster drop: **0.03% per kill, 0.5% from a boss**. `pickW(PW[map])` rolls the **rarity**, then a **uniform pick inside that rarity**. `PW` = map 1 `90/9/1/0` → map 10 `5/30/45/20` |
| What rarity changes | the pet's own damage scalar `[.2,.32,.55,1]`, its attack interval `1.7−.15r`, and the Zeny price of Rolls and skill gacha |
| What the *species* changes | the sprite and the tint. That is the whole list |
| Power axes | G0–G6 mutation (`MUT=[1,2,4,6,8,18,38]`, odds 50/30/16.5/2.5/0.8/0.2%) · 3 equipment slots (Claw +10%/tier dmg, Collar +7%/tier speed, Charm +5%/tier pet crit, `peqCost=1200(t+1)²`) · a **12-skill gacha** with 2 slots, one global weight table (`PET_SKILL_WEIGHTS`, only War Cry/Arcane at 0.35×) |
| Slots | 3 pets fight at once; collection cap 40; a full collection pays Zeny instead |
| Balance guard | `pet_sim` pins one maxed pet at **0.6–0.7× one maxed character**; `PETBAL=1.91`, `PETGAP=7` |

**So the owner's read is half right, and worth stating exactly.** Rarity is *not* cosmetic —
it is a 5× damage gap and a price tag. But it is a **scalar**: two pets of the same rarity are
the same pet with a different drawing, and the species you get is a lottery you cannot aim at.
Everything a player actually *does* to a pet (mutation, gear, skills) is species-blind. Nothing
anywhere says "I want *that* one", and a duplicate is dead weight in a 40-slot bag.

## The goal

1. A species has a **job**, and it is the species that has it — not the rarity, not the gacha.
2. A player can **aim** at a species: go to a map because that pet lives there.
3. A duplicate is **worth something**.
4. Pets stay a companion (0.6–0.7× a maxed character) and never a second character.

---

## Lever 1 — a signature passive per species ("what this pet is *for*")

Always on while the pet is one of the fighting three, printed on its card and summed in the
HUD. Deliberately non-DPS first: those rows cannot disturb the `pet_sim` band at all.

| Species | Rarity | Passive | Effect while it fights |
|---|---|---|---|
| Poring | Common | **Greedy Gel** | +8% Zeny from kills |
| Lunatic | Common | **Moonlit Study** | +6% EXP and Job EXP from kills |
| Wolf | Rare | **Pack Leader** | +10% pet damage for every fighting pet |
| Desert Wolf | Rare | **Sand Tracker** | +20% Oridecon / Elunium drop chance |
| Peco Peco | Epic | **Swift Mount** | +12% movement, and a lower sprint threshold |
| Dragon Whelp | Epic | **Hoarded Flame** | +25% gear drop chance from kills |
| Baphomet Jr. | Legendary | **Executioner** | +15% damage to bosses, you and your pets |
| Angeling | Legendary | **Divine Grace** | +15% Max HP and 2% Max HP back every 5s |

Rules this table has to respect:

* **Player crit chance stays Index-only.** No pet may hand out crit chance; that path is the
  Index Crit ladder and nothing else.
* **Stats never bend the drop table, a companion may.** The code says today "nothing on the
  character scales drops, so LUK cannot bend the tables". Sand Tracker and Hoarded Flame are a
  deliberate, *contained* exception — one companion slot, a printed number, ore and gear only.
* **Swift Mount edits one sentence.** The v74 sheet line says AGI is the only thing that moves
  the character; it becomes "AGI is the only stat that moves you — Peco Peco's mount adds 12%".
* The two DPS rows (Pack Leader, Executioner) are the only ones that need a `PETBAL` pass and a
  `pet_sim` re-measure, so they are the last thing to turn on, not the first.

## Lever 2 — targetable drops: which pets live where

Replace *"roll rarity → uniform species"* with a **per-map species table**, and print it on the
World Map in the species' own names instead of rarity labels. Hunting becomes a destination.

| Map | Species odds (%) |
|---|---|
| 1 Prontera | Poring 55 · Lunatic 30 · Wolf 12 · Peco Peco 3 |
| 2 Izlude | Poring 40 · Lunatic 40 · Wolf 15 · Desert Wolf 5 |
| 3 Geffen | Lunatic 35 · Wolf 35 · Desert Wolf 20 · Peco Peco 10 |
| 4 Morroc | Wolf 40 · Desert Wolf 35 · Peco Peco 20 · Dragon Whelp 5 |
| 5 Payon | Desert Wolf 40 · Peco Peco 30 · Dragon Whelp 20 · Baphomet Jr. 10 |
| 6 Comodo | Peco Peco 40 · Dragon Whelp 35 · Angeling 15 · Baphomet Jr. 10 |
| 7 Louyang | Dragon Whelp 45 · Peco Peco 25 · Baphomet Jr. 20 · Angeling 10 |
| 8 Amatsu | Dragon Whelp 40 · Baphomet Jr. 30 · Angeling 20 · Peco Peco 10 |
| 9 Niflheim | Baphomet Jr. 45 · Angeling 35 · Dragon Whelp 20 |
| 10 Abyss | Angeling 50 · Baphomet Jr. 50 |

Read as intent: *"my Poring is on Prontera, my Angeling is on Niflheim"*. The rare half of the
list is the map's reason to exist after the gear stops mattering.

## Lever 3 — pity, and saying where a species lives

* **Pet pity counter.** 12,000 kills with no pet drop (a boss counts as 20) and the next kill
  always drops one from that map's table. Bad luck becomes a countdown instead of a wall; it is
  the single change that makes 0.03% feel like a farm rather than a lottery.
* **First of a species** gets its own log line, and the World Map row for it turns gold.
* **The pet card names its habitat** — "Found on: Niflheim · Abyss" — so a plan is always one
  click away.

## Lever 4 — duplicates feed a **species Bond**

A duplicate of a species you already own adds +1 Bond (5 ranks: 1 / 3 / 10 / 25 / 50 — or the
Index's own ladder if you prefer 10/50/250/1000/5000). Every rank raises that species' passive:
Poring's +8% Zeny becomes +16% at Bond 5, Angeling's sustain grows the same way. The species you
farm is then the species that gets better, which is exactly the "hunt a certain pet" loop, and a
40-slot collection stops being a junk drawer.

## Also on the table (later, or skip)

* **Species-leaning gacha** — a native 3-skill pool carries ~70% of each species' roll weight
  (wolves roll attacks, Angeling rolls buffs and heals, Poring rolls Zeny and heal). ~15 lines,
  and suddenly the pet's kit reads like the pet.
* **Field synergy** — Wolf + Desert Wolf both fighting = a pack bonus. Adds a hidden
  multiplier, so it lands after the `pet_sim` band is re-measured.
* **Flatten the rarity damage scalar** — `[.45,.6,.8,1]` instead of `[.2,.32,.55,1]` puts
  rarity where the identity now is (the *size* of the passive) and lets a maxed Common be a real
  pet instead of a weak Legendary. Needs `pet_sim` re-pinned and an early-game look, because a
  cheap Common gets noticeably stronger on maps 1–3.

## Phasing — four shippable builds, in this order

1. **Identity** — Lever 1, non-DPS rows only (Zeny, EXP, ore, gear, move, Angeling's HP). No
   balance work, and the whole point of the pet is on its card.
2. **Hunt** — Lever 2 + Lever 3: per-map species tables, the World Map hunt list, the pity
   counter, "found on" on the card.
3. **Long hunt** — Lever 4, the Bond ladder fed by duplicates.
4. **Combat** — the two DPS passives, the leaning gacha, and (if you want it) the flattening.
   This is the only phase that touches `pet_sim`'s 0.6–0.7× band.

## Open decisions

1. Passives: the eight rows above, or do you want them re-themed/renamed first?
2. Hunt: per-map species tables (Lever 2) yes? And is 12,000 kills the right pity, or should it
   be smaller (a few hours) at each map's rarest species?
3. Duplicates: Bond ladder yes/no, and 5 ranks or the Index-style long ladder?
4. Rarity: keep the 5× Common-to-Legendary damage gap, or flatten it so rarity means "how big
   the passive is"?
