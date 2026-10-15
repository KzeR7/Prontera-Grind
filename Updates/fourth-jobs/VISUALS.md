# Fourth-job visual preparation — 15 October 2026

Owner direction: use five core RO skills per class; recover original native sprites;
keep the classes locked while preparing visuals.

## Available now

Open [the visual review](review.html) through the static preview server.

- All six original class bodies, both genders, eight directions and native
  idle/walk/attack/cast plus GX roll: 12 looks, 400 actions, 2,573 frames in a 1,805,941-byte pack.
- Dedicated effects for all 30 core skills, generated alongside the existing
  Afterglow effects. Earlier owner-selected effects are preserved.
- A flag-gated Ascension aura; support and radial effects render at the caster.
- Class/body/action/facing controls, skill cards, pause, time scrub, replay and aura
  toggle. The skill descriptions come directly from `SKILLS4`.

[Source recovery, rebuilding and audits](../../tools/native-fourth-jobs/README.md).

## Still required before release

The native pack is a fixed native composition with hair style 2. It is **not yet
connected to the game's wardrobe**: all hair colors/styles and accessory attachment
routes need native exports, audits and integration. The game retains parent-body
fallbacks. This review pack stays out of the production build.

Skill icons retain the existing approved, unmodified crops by alias. New icon art
would require approved source artwork. The Crucible rite panel, Ascension level /
stats / skill-boost tab, balance tuning and full flag-on gameplay acceptance remain
open. `FOURTH_JOBS_LIVE=false`, the 19 live classes, 91 live skills and the v157 build
label remain as before; these preparations do not unlock any progression.

## Video-reference FX revision

The shared MP4 is accessible and inspected. Thirty revised effects use layered
light, filled sweeps, textured elemental bursts and ground seals from its visual
language. See [research and action mapping](SKILL-RESEARCH.md). Owner visual
acceptance and physical-phone performance remain open.

The review now plays character and FX from one timeline. Selecting a skill resumes
playback; Rolling Cutter uses native actions 88–95 for five complete spins. Spell
casting uses native actions 96–103. Original pixels and source timing are preserved;
cast mode fits each action to its swing, while manual mode uses native timing.
