# All-class weapon and hair fitting

This second visual prototype tests the 19 classes currently declared in the game's `CD` table, for male and female sprites. It does not modify the live game, character saves or combat.

## Coverage

- **19 classes × 2 genders**, with every allowed weapon family: **50 class/gender/weapon combinations**.
- **Three native hairstyles:** 40, 1 and 23. Style 40 matches the earlier male Lord Knight reference; the female style is its own native artwork.
- **Three real attack directions:** S/front, SE/side, NE/rear. Mirror view is an explicit horizontal reflection, not an additional authored action.
- **450 cached animated looks**, with static first frames for reduced motion.
- Angel Halo (view 69), Glasses (view 3) and Archangel Wings (garment 1) are included during native composition on every look. Each class keeps its own native body/outfit. The separate Rune Knight alternate-body costume remains in the earlier fitting room and is not claimed to have been tested with every class weapon.

Weapon families: dagger, sword, staff, bow, mace, axe and katar. Novice includes dagger/sword; Merchant, Blacksmith and Whitesmith include axe/mace; Assassin and Assassin Cross include katar/dagger.

## What the checks prove

For each rendered look, the fetcher obtains an otherwise identical native action with weapon 0. It checks frame count and duration agreement, non-empty rendered frames, no source-canvas clipping and a visible pixel difference somewhere in the animation when the weapon is added. Frame-by-frame difference counts are retained in `audit.json`; zero weapon pixels on an individual frame can mean the weapon is hidden by the body in that pose.

`tools/tests/class_weapon_sim.js` independently checks the current game's complete class/weapon roster, all requested combinations, APNG metadata, source hashes, the paired male/female controller, hairstyle selection, reduced-motion behavior and stale-load/error handling. The fitting room is also checked in the shared browser. Representative final frames of all 50 class/gender/weapon routes are inspected visually.

These checks establish source coverage, actual weapon rendering and use of the authored attachment data. They do not constitute a geometric proof that every pixel of every grip is perfect, or validate the game's existing custom weapon icons. No per-frame manual offsets are introduced.

Native weapon-specific actions replace the bare-hand action used by the current game. In particular, female Wizard/High Wizard staff attacks use a different action from the male variants; Novice sword/dagger actions also differ by gender. Blacksmith/Whitesmith, Hunter/Sniper and katar attacks require their own action variants. The exact mapping is in `tools/class_weapon_catalog.json`.

## Hairstyles

The provider's human hair catalog lists 42 style IDs for each gender. This preview deliberately caches and validates three of them on every tested class and weapon. A new style can be added to the catalog and built through the same pipeline; it does not require manually positioning weapons again. Original sprite colors are used, with head palette 0. Hair dye selection is not part of this test.

## Sources and reproducibility

- Art: Ragnarok Online / Gravity, via the [ragassets renderer](https://github.com/adsonpleal/ragassets).
- [Weapon action mappings](https://github.com/MrAntares/roBrowserLegacy/blob/master/src/DB/Jobs/WeaponAction.js).
- [Weapon family IDs](https://github.com/MrAntares/roBrowserLegacy/blob/master/src/DB/Items/WeaponType.js).
- [Native hair catalog](https://assets.latam-tools.com.br/raw/hair.json).
- `audit.json` contains every actual source URL, baseline URL, response hash, frame duration and result.
- All preview images are local. The browser does not contact the external rendering service.

```sh
# Python with Pillow is required for these two commands.
python3 tools/fetch_class_weapons.py --fetch # only missing requests; at most two concurrent
python3 tools/fetch_class_weapons.py         # rebuild/revalidate using the existing response cache
node tools/tests/class_weapon_sim.js
python3 tools/preview_server.py 8000
```

Open `http://localhost:8000/Updates/class-weapon-preview/`.

The unarmed comparison responses are cached outside the repository at `$WORKSPACE_ROOT/workspace-context/class-weapon-cache`. On another machine, use `--fetch` to retrieve missing baseline responses. Existing downloaded responses are not silently refreshed; delete the relevant task-owned cache entries if a fresh source revision is intentionally required, then revalidate.

The standalone HTML export embeds all images and can be opened directly after downloading. The source ZIP includes this folder plus the earlier fitting room so its relative navigation works. Neither prototype is included by the production publishing script.
