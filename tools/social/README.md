# Native social assets

Original Ragnarok Online artwork belongs to Gravity. Existing pinned sources and
renderer provenance remain in `tools/native-wardrobe/README.md`. No artwork was
painted, recoloured, or inferred. Assets are served locally at runtime.

## Sitting

Recover all original wardrobe/fourth-job/accessory sources and the explicitly
identified garment preview adapters following the existing native wardrobe README.
Use the same ragassets commit `4de4fa747431979d35c747d7edd549a872efd9e1`, Go 1.24.2,
Python/Pillow and numpy. `export-sitting.py <ragassets-checkout>` installs separate
`social-export`, `social-accessories`, and `social-proof` commands, selecting native
ACT actions 16–23. It also makes the export extension respect the renderer's
`shouldDrawShadowFor`: seated bodies have no standing shadow.

Build those commands in the pinned gateway. Supply the existing HAIRS lists as
`{"hairs": ...}` and export all 25 class IDs from the two live wardrobe catalogs:

```sh
social-export <native> <hairs.json> <exports>/<job> full <job>
social-accessories <native> tools/native-wardrobe/accessories.json <pieces>/<job> <job>
social-proof <native> tools/native-wardrobe/accessories.json <proof>/<job> <job>
```

Generate Black Thunder with `python tools/social/build-effect.py <native> <pieces>
<all-classes.json>`, where the catalog combines the 25 class IDs. This reuses
`build_black_thunder.py` with sitting routes. The same original effect frames/timing are
retained. Then pack into an empty destination:

```sh
python tools/social/build-sitting.py <exports> <pieces> <empty-output>
python tools/tests/social_assets.py <exports> <pieces> <proof> --pack <empty-output>
```

`build-sitting.py` reuses the existing wardrobe packer and standing figure heights,
so sitting never enlarges the shorter pose. Catalog hashes cover every image and
metadata file. The audit checks every crop's original RGBA hash, positions, layer
order and delay, plus independent native compositions for three directions per
class/gender/accessory. The live normal wardrobe packs are unchanged.

## Emotions

`emotions-lock.json` pins the original ACT/SPR URLs and hashes. Recover those bytes
as `/tmp/emotion.act` and `/tmp/emotion.spr`. Install `emotions.go` as
`gateway/cmd/social-emotions/main.go` in the pinned renderer and run it. It exports
all 93 original action timelines into `/tmp/social-emotions` using the renderer's
native layer transforms. `python tools/social/pack-emotions.py /tmp/social-emotions`
creates APNGs and verifies decoded frames/timing against those exports. Identical
consecutive PNG frames may coalesce with the summed delay. Existing PNG encoding
is retained when decoded pixels and timing already agree, preserving the original
12 files byte-for-byte. The 32 shipped IDs in `emotion-map.json` are mapped
by inspecting the original animations, not substituting Unicode glyphs.

### PR #269: the 14 added emotions

`emotion-map.json` lists 46 ids: the original 32, then 14 more (`omg, oh, x, hlp, go, bzz, awsm,
pat, slur, grat, fsh, spin, dice, oops`) appended so no saved id moves index. Each new id maps to the
action that really holds it in `emotion.act/spr`; `tools/tests/emotion_map_sim.js` pins every number
against the `ET_*` enum and fails if one drifts.

That PR first proposed 45 ids at actions 86-130. The sprite has 93 actions (0-92), so 38 of those
numbers were past the end of the file, and the 7 that landed inside it were the wrong animations
(`omg` at 86 is `YUT6`; the real `/omg` is `HUK` at action 23). The other 13 (`clap, bye, happy,
amazed, best, best2, chaos, absurd, joy, kiskis, funny, martialarts, salute`) are Ragnarok Online II
emotes, not RO 1 - they have no frames in `emotion.spr` and were dropped.

**All 46 have art.** The 32 original ids come from the sprite route above; the 14 added ones come
from the iRO Wiki GIFs via `import-emote-gifs.py`. Every entry in `emotions-lock.json` carries a real
sha256, and `social_sim.js` fails if any id is neither hashed nor declared pending.

### Reviewing the art

`python3 tools/social/build-emotion-ref.py` regenerates `emoji-ref-data.json`, the authentic RO
emotion table (action index from roBrowserLegacy's `Emotions.js`, commands and art from the iRO Wiki).

`emoji-review.html` renders that table as a review page. Serve it over http - `python3 -m http.server`
in `tools/social` - because it fetches the JSON at load time rather than carrying a copy that can go
stale. It shows every id at the game's real 40 px slot on the dark UI, which is the only honest way to
judge emote sizes and the dice's landing.

There are two ways to supply the art. The first is the sprite route above: recover the bytes as
`/tmp/emotion.act` and `/tmp/emotion.spr`, run `emotions.go`, then:

```sh
python3 tools/social/pack-emotions.py /tmp/social-emotions   # packs only the actions that exist
python3 tools/social/emote-layout.py                         # prints the new EMOTE_LAYOUT
```

The second needs no renderer and no Go, only Pillow. Save the emote GIFs from
<https://irowiki.org/wiki/Emotes> into a folder, using their own file names (`Omg.gif`, `Sob.gif`,
`Emote_bawi.png`, ...), and run:

```powershell
# Windows PowerShell: use the path itself. The angle brackets are not part of the command,
# and a path with spaces needs quotes - PowerShell treats < and > as redirection operators.
py tools/social/import-emote-gifs.py "C:\Users\You\Desktop\Horizon Haven\emotion"
py tools/social/emote-layout.py
```

```sh
# macOS / Linux
python3 tools/social/import-emote-gifs.py "/path/to/emotion"
python3 tools/social/emote-layout.py
```

If the folder holds `emotion.act` / `emotion.spr` instead of GIFs, the script says so: that is the
sprite route above and needs the Go renderer, not this importer.

`import-emote-gifs.py` converts whichever files it finds into the same APNG shape the game already
loads: frames cropped to the union of the painted pixels across the animation (exactly what
`pack-emotions.py` does, so the tray maths is identical), original frame order, per-frame timing,
loop forever, transparent. It writes `assets/social/emotions/<id>.png`, records the sha256 in
`emotions-lock.json` and leaves every id it did not find untouched - so the 32 cut from the sprite
sheet stay byte-for-byte as shipped. It never repaints, rescales or invents art.

Timing is preserved per frame, not flattened. An RO emotion is not a uniform loop: `Omg.gif` holds
its 13th frame for 1500 ms so the shout is readable, and `Pat.gif`/`Spin.gif` hold their last frame
for about a second. Those holds are kept, reduced to a base tick plus repeats the way
`pack-emotions.py` encodes them. The one deliberate edit: when a rip ends on a BLANK frame held a
full second (pat 990 ms, spin 1000 ms), that tail is trimmed to a single tick. Played as drawn, the
emote vanishes and leaves an empty speech bubble hanging over the character; the sprite-cut art this
game already ships ends on a blank too, but for one 50 ms tick. A blank in the middle of an
animation is a deliberate beat and is left alone.

Already-verified art is never overwritten. `FILENAMES` lists the 32 shipped ids too, and matching a
wiki GIF would silently replace a verified sprite render - `panic` is the trap, since its wiki
filename is `Come.gif`. A lock entry with a sha256 but no `source` came from the sprite route and is
always skipped, even under `--refresh`; `--refresh` only re-converts the ids this importer owns
(those that carry a `source`).

Two things are done to the pixels beyond timing, and both were owner-reported defects:

- **Drift is bounded.** Hlp is a pure translation - all 28 frames are the same 24x15 "Help" word,
  only at different places, flown corner to corner across a 69x49 canvas. Because both consumers
  draw the whole canvas (the tray scales it, the plaza bubble runs it through `object-fit:contain`),
  the word came out at 12 px beside a 34 px smile. `tighten_drift` squeezes the sweep into 1.15x the
  art so the word stays legible and still moves. The owner chose size over travel. 1.0 was tried and
  rejected: it removed the motion entirely and collapsed oh/x/hlp to a single frozen frame.
- **The roll ends on the number.** The source GIFs fade the die out to an empty bubble after landing
  and then loop, so `/dice` spent its final beat erasing the only thing it tells you. `settle_dice`
  drops three stretches of the tail: the settle wobble (f16-19, bubble outline broken up, reads as
  damage), the last motion-blurred tumble frame (f15), and the exit fade (f25-27). What is left is
  the tumble followed by the crisp landed face. Two further changes make that face the ending:
  `DICE_HOLD_MS` holds the last frame for 1400 ms, and the dice alone is written with `loop=1` so
  the animation **stops** on the landed face. Every other emote still loops forever, because an
  emote is a mood and a die is an outcome. Exactly one landed frame is kept: f20-24 are
  pixel-identical, and keeping the duplicates made the hold depend on how the encoder merged them
  (measured drift 1400 -> 1800 ms). One frame plus one explicit hold is deterministic.
- **The tile is made solid.** The wiki rips punch the die face out: between the pips and the rim
  most pixels are fully transparent, so the tile is a lattice. On the plaza bubble, which sits on a
  dark backdrop, every hole showed through as a black spot (the owner's report). `solid_die_face`
  fills the transparent pixels inside the tile box with the tile's own body colour, measured from
  the art, leaving the pips, the rim and the bubble surround byte-for-byte alone. The tile box comes
  from the rim ring that encloses the pips; the largest box across the six faces is used, because
  face 1's single off-centre pip leaves its own ring fragmented.

The dice is six files behind one id. `dice1.gif`..`dice6.gif` share one tumble and differ only in
the landed face, so all six are converted from a single shared crop box into `dice.png` (face 1) and
`dice2.png`..`dice6.png`, with `faces: 6` recorded in the lock. `/dice` is a roll: the room picks
1-6 with `this.random` and stamps `face` on the message, so the sender cannot reroll by editing the
message and every viewer sees the same number. `emote-layout.py` measures the six as one entry so
the tray scales and centres whichever face lands.

`pack-emotions.py` skips and reports ids whose action is not in the sprite instead of crashing, and it
merges into the lock file so the 32 verified entries keep their hashes. Paste the layout line into
`assets/social-rules.js`. An id with no file and no layout draws as a dashed box naming its command;
there are none today, because every one of the 46 ids has art (`x` was the last gap and `Ecks.gif`
closed it).

## Town

`town-lock.json` pins the public Prontera manifest/model/paving bytes from RagnaGO.
Download those four entries into a source cache, then run:

```sh
python tools/social/build-town.py <cache>
```

The generator retains original model geometry and native texture regions, changing
only the atlas layout/UV coordinates. Every copied texture region is compared
byte-for-byte. Scene placements are our own fountain plaza layout. The seating model is the
original green slatted park bench at source chunk 430. Chunk 1293 is a hanging
noticeboard and must not be used as a chair. Paving samples
native atlas tiles; surrounding trees/shrubs reuse the existing pinned Prontera
field asset pack. Native town and sitting art has a separate 10 MiB delivery budget.

Raw binaries, recovered sources, renderer checkout and independent proof images
stay outside the game checkout. Only runtime outputs and reproduction/audit code
are included in this change.
