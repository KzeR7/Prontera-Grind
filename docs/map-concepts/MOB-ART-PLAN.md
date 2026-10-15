# New-map mob graphics — native source plan

## Quality contract

New maps must not fall back to generic coloured blobs, demons or repainted existing
sprites and call them finished monsters. Use original native sprite artwork,
including the actual idle/walk/attack actions, eight directions where supplied,
native placement and frame timing. Preserve source pixels rather than upscale them
with invented detail. Higher quality comes from authentic art, correct animation,
readable scale and integration, not redrawing protected sprites.

The graphics studies intentionally contain no generated monsters. AI-painted
characters in the backgrounds would be immovable scenery, not animated enemies.

## Identity research completed

Candidate identities were checked against `rathena/rathena` at commit
`d4b8e7b8f16061cc2496d377ac8f777ce72a4f39`, file `db/re/mob_db.yml`.
See `mob-source-identities.json` for the twelve recorded identities and metadata
source checksum. This verifies names/IDs only: **not sprite availability, filenames,
licensing, action data or renderer output**. No upstream combat balance was imported.

| Proposed game role/name | Candidate original native monster | Native ID | Fit/review needed |
|---|---|---|---|
| Retribution Angel | Baroness of Retribution / RETRIBUTION | 1702 | Strong identity match; inspect silhouette and action set |
| Despair Phantom | Despero of Thanatos / THA_DESPERO | 1705 | Inspect original spectral form |
| Tower Watcher | Dame of Sentinel / OBSERVATION | 1700 | Native celestial watcher, not the roadmap's imagined automaton |
| Death Whisperer | Maero of Thanatos / THA_MAERO | 1706 | Candidate only; verify whether silhouette supports the caster role |
| Agony Demon | Dolor of Thanatos / THA_DOLOR | 1707 | Candidate only; native art may not match a horned bruiser |
| Memory of Thanatos | Thanatos Phantom / THANATOS | 1708 | Boss identity candidate; inspect scale and real actions |
| Magma Slag | Magmaring / MAGMARING | 1836 | Native molten-creature candidate |
| Fire Imp | Imp / IMP | 1837 | Strong identity candidate |
| Kasa | Kasa / KASA | 1833 | Direct native identity |
| Salamander | Salamander / SALAMANDER | 1831 | Direct native identity |
| Obsidian Golem | Lava Golem / LAVA_GOLEM | 1366 | Candidate only; do not recolour native art into obsidian |
| Ifrit | Ifrit / IFRIT | 1832 | Direct native boss identity |

These are not approved replacements. Prefer adapting speculative display names
and descriptions to genuine native artwork over modifying that artwork to fit an
invented creature. Any roster/name change needs explicit review before gameplay
IDs are introduced. Keep the roadmap roster unchanged until that review.

## Current blocker

No matching native ACT/SPR inputs are present in the checked-out runtime assets.
The existing pet/wardrobe provenance points at `grf.robrowser.com`, which is outside
this workspace's permitted outbound hosts. GitHub code searches for `kasa.spr` and
`ifrit.spr` returned zero results; that is not proof the files do not exist elsewhere.

Production monster graphics cannot honestly be marked complete from identity
metadata alone. Required next input is an owner-supplied native resource pack or
an approved reachable source containing the original files. Do not use credentials
or unverified random downloads to work around the restriction.

## Recovery and integration checklist

1. Recover actual matching ACT/SPR pairs and establish authorised provenance.
2. Record exact paths, byte lengths and SHA-256 values before rendering.
3. Inspect actual action availability, layer order, anchors, delays and dimensions.
4. Extend the pinned native-renderer workflow rather than procedural `spr_mob.py`.
   Reuse the pet exporter as an architectural reference, not its fixed canvas/foot
   pivot or action-number assumptions without checking the source.
5. Export proof frames; pack native frames and timings without interpolation,
   painting, recolouring or AI enhancement.
6. Review idle/walk/attack and every supported direction at actual combat scale on
   both light Astral paving and dark Thor basalt. Large bosses need explicit extent
   checks; do not squash/stretch them into ordinary-mob dimensions.
7. Audit hashes, pixel preservation, placement and timing against source exports.
8. Add loading/failure/cache-budget tests and an animation preview. Keep fallback
   status visible in development; generic silhouettes are not final artwork.

The existing native pet pipeline README is
[`tools/native-pets/README.md`](../../tools/native-pets/README.md). It demonstrates
source preservation and resource budgeting, not a completed new-monster pipeline.

## Journey build 4 — placement prepared, artwork still blocked

`tools/maps/mob-catalog.json` lists the twelve existing native identity candidates,
all explicitly `missing-native-source` with no atlas. The journey prototype has
deterministic field/MVP/escort placement plans for every stage, with a source-pending
roster and optional labelled spawn rings. Those markers are not monsters, and the
prototype does not simulate damage, kills, drops or encounters.

The new native Lord Knight in `tools/map_journey.html` comes from the existing
hash-checked wardrobe pack. It demonstrates real idle/walk animation and continuous
travel; it is not a stand-in for any of the missing monsters.

Renewed repository/API source checks did not recover usable matching ACT/SPR pairs.
To finish the mobs, supply the original resource pairs for IDs 1700, 1702, 1705,
1706, 1707, 1708, 1366, 1831, 1832, 1833, 1836 and 1837, together with authorised
provenance. A native resource pack retaining its original paths is preferable.
The export/pixel/timing audit above is still required; placement metadata is not
source recovery, a completed animation loader or approval of live combat balance.

## Follow-up source check — alternate native exports

The correct public renderer repository is
[`adsonpleal/ragassets`](https://github.com/adsonpleal/ragassets), pinned at
`4de4fa747431979d35c747d7edd549a872efd9e1` (the existing rendering-workflow pin).
Its README documents the public host `assets.latam-tools.com.br`, `/image` with
`job`, `action` and `frame` parameters, animated PNG output and PNG-ZIP output.
The service describes itself as best-effort with no SLA. Its hosted domain is not
in this workspace's network allowlist; exact new-map monster availability,
action coverage, placement and output pixels were not verified or downloaded.
The repository's committed monster fixtures contain Poring, not the twelve new
map IDs. A renderer implementation is not itself a complete native resource pack.

Correction to the earlier raw-input wording: original ACT/SPR pairs are the
preferred reproducible source, **not the only possible input**. Authorised complete
native exports are acceptable if identity, every supplied action/direction,
unaltered pixels, exact delays and common-canvas placement/foot anchor can be
verified, with recorded provenance and hashes. APNG can retain timing, but one
unverified GIF is not enough to establish direction/action/placement correctness.
A GitHub-hosted authorised resource/export pack is reachable here and could be
imported. Keep final assets local; do not hotlink a best-effort service at runtime.

No source files or exports for these twelve monsters have yet been recovered;
the catalog intentionally remains source-pending.

## Owner decision after final retry

The owner requested another sprite attempt, then allowed leaving mobs aside if it
failed. The reachable-source attempt is recorded in
[mob-source-checks.json](mob-source-checks.json): five recursive, non-truncated
GitHub trees; no paths matching the required monster roster. No required art was
recovered. Native mob artwork/animation is now explicitly **deferred** while the
remaining non-mob preview work is completed. Do not repeatedly ask for assets or
use a substitute creature to erase this gap. The recovery/export requirements
above apply whenever genuine inputs become available.
