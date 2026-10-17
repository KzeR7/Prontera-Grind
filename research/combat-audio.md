# Combat sound references (17 October 2026)

Online reference inspected: [roBrowser Legacy weapon hit sound table](https://github.com/MrAntares/roBrowserLegacy/blob/master/src/DB/Items/WeaponHitSoundTable.js).
The table maps RO weapon contacts to `_hit_sword.wav`, `_hit_arrow.wav`,
`_hit_mace.wav`, `_hit_rod.wav` and four fist variants. This establishes the
contact-triggered cue convention; it does not provide an audio license or certify
that our cues match the recordings.

`assets/combat-audio.js` provides original synthesized impact and brighter critical
cues, triggered by positive damage in `hurt`, including skills and pets. No Gravity
recordings are copied. Audio unlocks on interaction, has bounded overlapping
contacts and a separate saved Hit sounds control in Settings. BGM off affects music
only. Critical cues are intentionally distinct from ordinary contacts.
