# Ascension RO-look sets (proposal, not in the game)

Six extra Mythic sets for the Ascension Forge. Each one is a Ragnarok Online "look" of an existing
set: same map, material, set bonuses and cost, with new names and native RO inventory icons. They
would sit **on top of** the current six sets; the original sets, their icons and existing saves are
unchanged.

| Existing set | RO look | Theme (RO item the icons come from) |
|---|---|---|
| Celestial (Astral Citadel) | **Valkyrie** | Balmung, Valkyrie Helm, Brynhild, Hervor Alvitr |
| Voidwalker (Astral Citadel) | **Thanatos** | the Thanos weapon line, Despero Mask, Tenebris Latitantes |
| Ethereal (Astral Citadel) | **Archangel** | Longinus's Spear, Helm of Angel, Angelic Protection |
| Primal (Thor Volcano) | **Ifrit** | Ignus Steel, Mask of Ifrit, Crimson Robe |
| Molten (Thor Volcano) | **Thor** | Jormungand, Power of Thor, Egir Armor |
| Infernal (Thor Volcano) | **Diabolus** | Diabolus weapons, armour and boots |

**Status:** saved for a later decision (owner, 2026-11-19). Nothing here ships: `tools/build_site.sh`
only publishes `Updates/Sprite/`, and this folder is also listed in `.assetsignore`.

## Files

* `index.html`: weapons-only comparison, current vs proposed, for all 14 families. Open it from the
  repository (it loads current icons from `../../assets/equipment-icons/`).
* `sets.json`: the six sets (names for all 19 pieces, icon ID per piece, parent `look` set) and
  every icon's RO name, file, source blob and SHA-256.
* `icons/`: 108 new PNGs. Six more pieces reuse icons that already ship (1572, 1822, 1926, 13313,
  and the shurikens 13300 for Valkyrie and 13303 for Ifrit; RO has only four unused Huuma icons).
* `asc-sets-snippet.js`: the exact `ASC_SETS` entries, the bonus/cost sharing loop and the icon
  table entries from the working prototype.

`tools/tests/ascension_ro_looks_proposal_sim.js` checks that every piece has a name and an existing
icon, and that each PNG still matches its recorded SHA-256.

## How the prototype implemented it (commit `407e27b4`)

The full implementation, with all tests green, is commit `407e27b4` on branch
`arena/efe2b4f0-prontera-grind`; `git show 407e27b4` has every line. In short:

1. Copy `icons/*.png` into `assets/equipment-icons/` and add their `sets.json` asset rows to
   `assets/equipment-icons/mythic-manifest.json` (`sets` + `assets`).
2. Paste part 1 of `asc-sets-snippet.js` into `ASC_SETS`, part 2 after it, and part 3 into
   `RO_ITEM_ICON_CANDIDATES.mythic`. Every Forge, GM and set-bonus path reads `ASC_SETS` generically.
   Pieces count toward their own set only (two Valkyrie plus two Celestial pieces are two 2-piece
   bonuses).
3. In `guideMythicTargets`, rank only sets without `look` and print "or <twin> look" on the card,
   so the guide doesn't list twins twice.
4. Run `node tools/build_gm_catalog.cjs` (228 Mythic entries).
5. Update the set counts the tests pin: `gm_tools_sim` and `mythic_gift_base_sim` (114 → 228),
   `eclipse_ui_sim` and `mythic_testing_sim` (6 → 12 picker buttons), the picker and
   distinct-icon checks in `ascension_evolution_sim` and `expanded_roster_sim`. Also raise the
   `publish_sim` classic budget, which measured 60.3014 → 60.4131 MiB in the prototype.

Open choices: names, whether a look should be its own set (prototype) or a cosmetic skin of the
parent set, and the two shared shuriken icons.
