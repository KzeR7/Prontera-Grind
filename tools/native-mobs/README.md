# Ascension native monster exports

Twelve original RO monsters are delivered locally as 288 unmodified APNG exports
(12 monsters × idle/walk/attack × eight directions). They come from the public
ragassets native renderer at `https://assets.latam-tools.com.br/image`, documented
by `adsonpleal/ragassets` at `4de4fa747431979d35c747d7edd549a872efd9e1`.
The hosted renderer's deployed revision is not independently attested; the
manifest pins the exact downloaded bytes and decoded frames instead.
Original Ragnarok artwork remains the property of Gravity; renderer licensing
does not transfer ownership of that artwork. This follows the game's existing
native artwork provenance model.

`source-manifest.json` records each export URL, SHA-256, byte length, every decoded
frame's pixel hash, bounds and delay. The explicit renderer canvas is 512×512 with
foot anchor (256,400). Every exported frame has transparent margins; no exported
pixel touches a canvas edge. Files are copied without recolouring, interpolation,
rescaling or invented animation. APNG compositing and frame delays are played by
the browser. A shared figure extent prevents different actions resizing a monster;
Large and boss scale remain separate game presentation rules.

Game names map to source identities using `MOB_SPRITES` in index.html:
Retribution Angel→1702, Despair Phantom→1705, Tower Watcher→1700,
Death Whisperer→1706, Agony Demon→1707, Memory of Thanatos→1708,
Magma Slag→1836, Fire Imp→1837, Kasa→1833, Salamander→1831,
Obsidian Golem→1366 and Ifrit→1832. These are display aliases; source pixels retain
their genuine native appearance.

With Python 3 and Pillow 11.3.0:

```sh
python tools/native-mobs/recover.py
python tools/tests/native_mob_assets.py
```

Recovery reuses existing files. Remove a task-owned export before deliberately
re-fetching it; inspect resulting manifest differences before accepting upstream
changes. `recover.py` also generates exact cropped frame-zero posters and
`assets/native-mob-heights.js`. The audit checks those derivatives too.

Only the current action/direction is requested by a visible monster. No runtime
provider requests or native pet-species changes are introduced. Tests verify the
recorded exports, not the unavailable original ACT/SPR binaries; raw-source
renderer equivalence is not claimed.
