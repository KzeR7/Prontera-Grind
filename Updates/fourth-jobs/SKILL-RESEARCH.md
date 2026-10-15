# Five core RO skills per class — 15 October 2026

The owner requested five recognizable Ragnarok Online skills per class, specifically
Cross Impact and low-delay Rolling Cutter, with tuning for the six-slot bar.
These six classes are called third jobs in RO PC Renewal and fourth-tier / Ascension
classes in this project. This change retains the selected roster.

## Online sources and limits

Research used rAthena's public Renewal implementation at commit
[`d4b8e7b8f16061cc2496d377ac8f777ce72a4f39`](https://github.com/rathena/rathena/commit/d4b8e7b8f16061cc2496d377ac8f777ce72a4f39):

- [Renewal skill database](https://github.com/rathena/rathena/blob/d4b8e7b8f16061cc2496d377ac8f777ce72a4f39/db/re/skill_db.yml): RK, WL, RA, GC, AB and NC skill identities, target types, hit counts and delays.
- [Rolling Cutter behavior](https://github.com/rathena/rathena/blob/d4b8e7b8f16061cc2496d377ac8f777ce72a4f39/src/map/skills/thief/rollingcutter.cpp): one counter per cast, ten-counter cap, refreshed lifetime.
- [Database field documentation](https://github.com/rathena/rathena/blob/d4b8e7b8f16061cc2496d377ac8f777ce72a4f39/doc/skill_db.txt): action delay and cooldown are separate fields.

The fetched database gives Rolling Cutter a **200 ms action delay**, no separate
cooldown entry, and a 10-second status lifetime. Cross Ripper Slasher requires
Rolling Cutter status. Cross Impact declares seven hits and a 350 ms cooldown,
with rank-dependent action delay (500 ms at its native maximum rank).
iRO Wiki HTML and API returned HTTP 403 in this sandbox, so no Wiki content is
claimed as verified. rAthena is a community implementation, not an official server
specification; regional patches/builds differ. No upstream source code was copied.
The selection below is a representative mix of class staples and complementary
skills, rather than a claim that every build uses all five.

## Selected skills

| Class | Five skills |
| --- | --- |
| Rune Knight | Sonic Wave, Ignition Break, Dragon Breath, Hundred Spears, Wind Cutter |
| Warlock | Chain Lightning, Soul Expansion, Crimson Rock, Jack Frost, Comet |
| Ranger | Aimed Bolt, Warg Strike, Arrow Storm, Warg Bite, Cluster Bomb |
| Guillotine Cross | Cross Impact, Dark Illusion, Hallucination Walk, Rolling Cutter, Cross Ripper Slasher |
| Arch Bishop | Judex, Adoramus, Praefatio, Duple Light, Highness Heal |
| Mechanic | Vulcan Arm, Arm Cannon, Axe Tornado, Axe Boomerang, Power Swing |

Cart Cannon belongs to Genetic; Mechanic uses Arm Cannon. The earlier Gatling
Fever/Soul Seal/Rune Charge names and invented stack rotations have been replaced.
Existing 18 IDs and their learned ranks are retained; twelve IDs are appended.
Converted support IDs are removed from offensive saved slots by existing load
sanitization. Rank caps stay at the game's ten-rank convention.

## Adaptation and combo tuning

- Ordinary attacks retain 0.5-second spacing and three-second recovery. Six unique
  offensive selections remain saved per class, including inherited attacks.
- **Rolling Cutter occupies one slot and casts five times**, with 0.2-second
  cooldown and contact spacing (frame quantization can add a small delay).
  Each spin has 0.65 base power at maximum rank; five total 3.25 before modifiers.
  It then advances to the following slot. No global cooldown reduction or unbounded
  recovery filler is introduced. Native animation pixels/timing in the review pack
  are preserved; the game retains its existing animation-fit rules.
- Each cast, including one hitting several enemies, adds exactly one Rolling stack.
  Cap ten; lifetime ten seconds from the latest cast. Cross Ripper Slasher skips
  without stacks and consumes all stacks for +20% power each. This bonus and its
  two-second cooldown are game tuning, not imported RO formulas.
- Cross Impact uses seven focused hits, 3.2 total base power and one-second cooldown.
  These are initial local balance choices. Cross Impact does not consume invented
  Bleed stacks or randomly create extra cuts.
- Hallucination Walk auto-refreshes evasion. Praefatio auto-refreshes a max-HP
  barrier, Duple Light empowers basic attacks, and Highness Heal auto-casts below
  half HP. Support skills do not consume attack slots. These solo-game effects
  simplify RO's party targeting, hit barriers and proc mechanics.
- Dragon Breath uses the existing physical skill formula; HP scaling, elemental
  weaknesses, Mado fuel, ammunition, rune catalysts and SP remain outside this game.
- Warg Bite uses the existing root/boss resistance rules; Cluster Bomb uses a delayed
  target-area explosion. These are simplified equivalents, not trap placement AI.

Tests exercise the real flag-on update loop at AGI 1/120 with katar/dagger,
assert five spins before the finisher, rapid cadence, bounded damage and recovery.
This is initial tuning, not endgame balance acceptance or phone performance proof.

## Video reference and character motion (updated 15 October 2026)

The owner supplied a working shared file, `skill-fx-demo.mp4` (130.43 seconds,
640×310). The video has bright white/gold impact cores, wide tapered sweeps,
concentric ground effects, vertical holy light and layered fire/lightning.
The fourth-job choreography was revised with filled tapered blades, layered light,
textured elemental bursts, ground seals and particles. Earlier approved effects
are preserved. This is an adaptation of the reference's visual treatment; matching
another game's exact art or claiming owner acceptance is not implied.

The native GX ACT was inspected across all 13 action groups. The eight-frame
katar sweep at actions 88–95 already contains the original blade/body motion.
It is explicitly exported as `roll0`–`roll7`, with a `gc_roll` skill-action route,
for both genders. Native delays remain 100 ms/frame. Cast playback fits the
complete eight-frame clip into each 0.2-second spin, matching the game's existing
swing-fitting rule; manual action inspection retains the original timing.
Caster actions 96–103 are now exported for all classes. No actor art is rotated,
repainted or fabricated. The pack now has 400 routes and 2,573 exact native frames.

Selecting a skill resumes playback and follows its native action. One timeline
controls body and FX, so scrubbing moves both. Manual action selection disables
skill following and uses native timing. The production classes remain locked;
full native wardrobe integration is still release work.
