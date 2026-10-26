# Combat sound references (17 October 2026)

## Verified native contacts (v189)

Inspected roBrowser Legacy revision
[`9f3281c02fee66f8be949b7e58429dc49775a7be`](https://github.com/MrAntares/roBrowserLegacy/tree/9f3281c02fee66f8be949b7e58429dc49775a7be):

- [WeaponHitSoundTable.js](https://github.com/MrAntares/roBrowserLegacy/blob/9f3281c02fee66f8be949b7e58429dc49775a7be/src/DB/Items/WeaponHitSoundTable.js)
  maps sword/dagger to `_hit_sword.wav`, spear to `_hit_spear.wav`, axe to
  `_hit_axe.wav`, mace/katar to `_hit_mace.wav`, staff to `_hit_rod.wav`, bow
  to `_hit_arrow.wav`, and unarmed to the `_hit_fist` variants.
- [MapEngine/Entity.js](https://github.com/MrAntares/roBrowserLegacy/blob/9f3281c02fee66f8be949b7e58429dc49775a7be/src/Engine/MapEngine/Entity.js)
  routes normal action 0 and critical action 10 through `Damage.add` with the
  same source weapon. [Effects/Damage.js](https://github.com/MrAntares/roBrowserLegacy/blob/9f3281c02fee66f8be949b7e58429dc49775a7be/src/Renderer/Effects/Damage.js)
  resolves both through `DB.getWeaponHitSound`. This reference has no separate
  universal critical beep or critical pitch change.
- The reference client's [configuration](https://github.com/MrAntares/roBrowserLegacy/blob/9f3281c02fee66f8be949b7e58429dc49775a7be/applications/pwa/Config.js)
  points to `https://grf.robrowser.com/`. Downloaded its original PCM recordings
  from `data/wav/` into `assets/audio/hits/`, with exact URLs, byte lengths and
  SHA-256 hashes in `manifest.json`. Ragnarok recordings remain Gravity assets;
  the reference client's source license does not grant an audio license.

`assets/combat-audio.js` now decodes these local recordings once and chooses the
contact from the equipped weapon for both normal and critical damage. Unarmed,
unknown weapons and pet contacts use the first native fist recording; no audio
randomness consumes combat RNG. Critical contacts retain throttle priority, not
an invented tone. Audio unlocks on interaction, drops contacts while downloading,
retries failed downloads, and bounds simultaneous voices. Settings → Hit sounds
remains saved independently of music. Browser checks can prove decoding/routing,
but do not prove a subjective listening preference or a full native skill soundtrack.

## Previous implementation (v188)

v188 used the online weapon table only as a timing reference, then synthesized
sine/triangle pitch sweeps for normal and critical damage. Those original tones
did not reproduce Ragnarok's contacts and were replaced after player feedback.

## Attack motion and normal-hit wiring (v190)

The v189 sound hook was only in `hurt()`. Normal attacks use `strike()` and update
HP directly, so their contacts were silent. `strike()` now plays the equipped
weapon's contact when a hit succeeds, at the existing animation contact time.

The pinned reference's
[WeaponSoundTable.js](https://github.com/MrAntares/roBrowserLegacy/blob/9f3281c02fee66f8be949b7e58429dc49775a7be/src/DB/Items/WeaponSoundTable.js)
also lists separate `attack_*.wav` motion recordings. These are now preserved in
`assets/audio/attacks/` with source URLs and hashes. Sword, dagger, spear, axe,
mace, katar, staff, bow and unarmed each use their corresponding recording.
For tables with alternatives we use the first recording, without combat RNG.
This is a game-specific integration: this reference revision looks up the motion
sounds but does not play them in its normal-damage handler. We trigger one motion
sound when `playerAttack()` starts the drawn animation, for normal/skill swings,
misses and cosmetic combo-gap swings. Too-short gaps and idle do not trigger it.
Native pixels, animation durations, contact timing and damage remain unchanged.

Attack motion, normal contact, skill contact and pet contact have independent
throttles/voice limits. Skill/pet contacts are quieter and cannot use a normal
attack's budget. Crits retain the same native weapon contact without pitch edits.
DoT ticks update HP directly and remain silent; they do not manufacture swings.
Skills retain generic weapon contacts rather than a complete native skill
soundtrack. Background music retains its separate saved controls.

`attack_audio_sim.js` exercises real animation/contact timing across all 25 classes,
misses, harmless gap swings, settings and skill/pet routing. `combat_audio_sim.js`
checks every motion/contact mapping, original file hashes, asynchronous loading,
voice limits, background-contact isolation and disabled/hidden/suspended states.
Browser decoding/routing cannot establish subjective sound quality or physical
speaker timing; listening in the preview is still the useful final comparison.
