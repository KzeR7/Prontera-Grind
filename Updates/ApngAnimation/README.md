# How the class skins animate (APNG) — read this before touching the art or the hero

**Audience: an AI agent (or a person) updating the class sprites later.** It records the exact
method that ships and works today, the simplest form of APNG the art uses, every trap that cost
time while building it, and the step-by-step to follow when new PNGs arrive. Follow it and the
animation keeps working; skip it and the hero will very likely stand still again.

Status: **working and owner-confirmed** in build `2026-10-05 skin-v53 class animations decoded
in-game`. PR #20 on branch `arena/01a10b27-prontera-grind`.

---

## 1. What the uploaded art actually is

Every file in `Updates/Sprite/<Tree>/` is a **multi-frame, endlessly looping animated PNG
(APNG)** — not a still, even though a naive reader sees only the first frame.

* 154 files, 7 tree folders, 19 jobs, both genders.
* 200×200 RGBA, 8-bit, non-interlaced.
* Frame counts: **8 frames** in 127 files, **5** in 13, **6** in 4, **9** in 10. Total 1195 frames.
* Every frame covers the whole canvas (offset 0,0), blend `SOURCE` (0), dispose `NONE` (0).
* Per-frame delays: **75 ms** for walking files, **100 ms** for attack files. The denominator in
  the file is 1000.
* `num_plays = 0` in every file — the animation loops forever.
* The five supplied views: `walking S`, `walking SE`, `walking NE`, `attack SE`
  (a few files spell it `attacking SE`), plus `walking N` for **High Priest only**.

Known duplicates (byte-identical files — report, never "fix" by inventing art):
`aco female walking S` = `aco male walking S`; `aco female attack SE` = `aco female walking SE`;
`blacksmith female walking NE` = `whitesmith female walking NE`.

**Verify before believing anything about a file** (the frame-0 mistake is the classic one):

```sh
python3 - <<'PY'
import struct
d=open('Updates/Sprite/Swordman/knight male walking S.png','rb').read()
p=8
while p<len(d):
    n=struct.unpack('>I',d[p:p+4])[0]; k=d[p+4:p+8].decode()
    if k in ('IHDR','acTL','fcTL'):
        print(k, d[p+8:p+8+n].hex())
    p+=12+n
    if k=='IEND': break
PY
# acTL shows num_frames and num_plays; every fcTL shows that frame's delay + dispose/blend
python3 tools/make_simple_apng.py --verify "Updates/Sprite/Swordman/knight male walking S.png" --json
```

## 2. The simplest APNG, byte by byte

An APNG is an ordinary PNG plus four chunk types. The simplest useful form is what all 154 files
are, and what `tools/make_simple_apng.py` writes:

```
89 50 4E 47 0D 0A 1A 0A          PNG signature
IHDR                             width, height, depth 8, colour type 6 (RGBA), interlace 0
acTL   num_frames, num_plays     num_plays = 0  -> loop forever
fcTL   seq 0                     frame 1: seq, w, h, x=0, y=0, delay_num, delay_den, dispose=0, blend=0
IDAT                             frame 1's pixels  <- the FIRST frame is always IDAT, never fdAT
fcTL   seq 1                     frame 2 ...
fdAT   seq 2                     frame 2's pixels: 4-byte sequence number, then exactly IDAT payload
fcTL   seq 3 / fdAT seq 4        ... one fcTL + one fdAT per following frame
IEND
```

Chunk binary layouts (all big-endian):

| chunk  | payload |
|---|---|
| `acTL` | `num_frames` u32, `num_plays` u32 |
| `fcTL` | `sequence_number` u32, `width` u32, `height` u32, `x_offset` u32, `y_offset` u32, `delay_num` u16, `delay_den` u16, `dispose_op` u8, `blend_op` u8 — **26 bytes** |
| `fdAT` | `sequence_number` u32, then the same compressed bytes an `IDAT` would hold |

Delay maths: seconds = `delay_num / delay_den`; **a denominator of 0 means 100** (spec rule — the
game implements it). `dispose_op`: 0 NONE, 1 BACKGROUND, 2 PREVIOUS. `blend_op`: 0 SOURCE,
1 OVER.

Pixels inside `IDAT`/`fdAT` are ordinary PNG scanlines: `height` rows of
`[filter byte][width × 4 bytes RGBA]`, zlib-compressed as **one** stream. The uploaded art uses
filter 0 on every row, but a correct decoder must handle filters 1–4 (Sub, Up, Average, Paeth) —
new art may use them.

**Two traps that cost real time and must not be repeated:**

1. `Image.open(path).convert('RGBA')` (Pillow) and `new Image(); img.src = …` in a browser both
   give you **frame 0 only**. A "still image" conclusion from either is wrong.
2. `fcTL`'s delay fields are at **payload offset 20** (`delay_num`) and **22** (`delay_den`) —
   i.e. `p+28` and `p+30` from the chunk length field. An earlier build read `p+36/p+38` (the
   `fdAT` layout) and lost every delay.

## 3. How the game animates them (the method that ships)

The game is one file, `index.html`. It does **not** slice the art into the old 8×24 atlas, and it
does **not** trust the browser to play a hidden image (see §5). It decodes the frames itself and
plays them on the file's own clock. The whole mechanism is ~130 lines, backed up verbatim in
`class_skin_animation.js` next to this note.

1. **`skinDecodePng(bytes, source)`** — walks the chunks, requires exactly `acTL.num_frames` fcTL
   chunks (8-bit RGBA, non-interlaced; anything else is refused rather than guessed), inflates the
   zlib stream with `DecompressionStream('deflate')`, reconstructs the scanlines
   (`skinUnfilter`, filters 0–4 incl. `skinPaeth`), applies blend/dispose into a running RGBA
   buffer, and finally writes **every decoded frame into one horizontal strip canvas**
   (`width × frames`, `putImageData` per frame). One strip = one draw source per view; no per-frame
   canvas objects, no re-encoding, no re-timing.
2. **`skinPack(cls, sex)`** — one pack per class and gender, built from
   `assets/class_skins_data.js` (files, frame counts, delays, anchor, drawn height). Delay
   denominators are converted to seconds here (`0 → 100`). Each supplied view is decoded once, in
   the background: `skinViewEnsure` → `skinDecodeView` → `skinDecodePng`.
3. **`skinFrameIndex(p, view, ms)`** — which frame is due right now: walk the file's own delay
   table, wrap at its total, forever. There is **no** frame counter and **no** `setInterval`; the
   game's single render loop calls the next function once per rendered frame.
4. **`captureSkinFrame(spr, route, now)`** — the bridge. Clears the hero's 200×200 canvas, applies
   the mirror as a real canvas flip (`translate(w,0); scale(-1,1)` — never a re-encoded file or a
   negative sprite scale), then `drawImage(strip, frame*200, 0, 200, 200, 0, 0, 200, 200)` — the
   whole frame, never a crop — and sets `texture.needsUpdate = true`. Switching view or action
   (walk → attack) **restarts at that animation's frame 0** (`sk.route` / `sk.t0`).
5. **Menu previews** (`drawSkinPreview`) draw the same due frame (`skinFrameOf`) of the `S` view
   through the same clock, so the Appearance and class-change panels animate identically.
6. **Scale and anchor**: one constant scale per class and gender,
   `SKIN_H = 72 × PACK_K` world units ÷ the art's own drawn height, and the sprite anchor is the
   art's own ground line, so the feet stay put while frames advance. 1:1 aspect, nearest filtering.
7. **Routes and mirrors** (`SKIN_VIEW`, `SKIN_ATTACK_MIRROR`): facing 0–7 →
   `S, SE↔, SE, NE↔, NE (or the class's own N), NE, SE, SE↔`; attacks use the supplied SE swing,
   mirrored for facings 0–3. The art has **no** idle, E or W drawing; standing still keeps the S
   walk playing (walk-in-place), straight up uses NE (High Priest: its own N), straight left/right
   uses SE / mirrored SE. The Appearance panel says all of this in words.
8. **Fallbacks, so nothing is ever blank or wrong:**
   * a class is worn only after **every** supplied view has decoded — until then its animated pack
     body (`assets/sprite_pack_data.js`) is drawn;
   * a file that will not open is logged with the reason and that class keeps its pack body;
   * decoded strips are cached with a bounded LRU (`SKIN_STRIP_KEEP = 18` views ≈ 23 MB) that always
     pins the class being worn and the class being previewed; a dropped view keeps the frame already
     on screen and re-decodes in the background, and a facing whose art is missing hides rather than
     showing another facing's pose;
   * a browser without `DecompressionStream`, or a page opened as `file://`, keeps the art through
     the hidden `<img>` decoders, logs why the frames are missing and how to fix it, and the panel
     carries the note — never silent;
   * once a class's frames are ready the game log prints one line:
     `Class skin animation ready: Knight male - 8 S, 8 SE, 8 NE, 9 attack frames, played with the
     file's own delays.` — the quickest way to see the animation is running.

## 4. The files that make this work

| Path | Role |
|---|---|
| `index.html` | the whole game; the animation block is the `// ----- Class skins` section |
| `Updates/ApngAnimation/class_skin_animation.js` | **verbatim backup** of that block (`tools/backup_apng_code.py`, `--check` fails when stale) |
| `assets/class_skins_data.js` | generated manifest: per class/gender/view file, frame count, per-frame delays, opaque bounds, drawn height, ground line |
| `tools/make_class_skins.py` | builds that manifest; `--check` fails when stale and **refuses a file that is not a multi-frame endless loop** |
| `tools/make_simple_apng.py` | writes/verifies the simplest APNG (§2); `--demo`, `--frames`, `--verify`, `--json` |
| `tools/preview_class_skins.py` | offline QC sheets from the real frames (directions + frame-by-frame walk cycle per class) |
| `tools/make_apng_fixtures.py` | writes `tools/tests/fixtures/apng_frame_sha.json`: Pillow's SHA-256 of all 1195 frames |
| `tools/tests/class_skin_sim.js` | the proof: the game's decoder is run over all 154 files and every frame compared with that fixture, plus the hero's own pixels, routes, loaders, cache, fallbacks and previews |
| `tools/make_sprite_viewer.py` | keeps the canonical browser viewer `Updates/Sprite/index.html` current (`--check`) |

## 5. The mistake that shipped once — do not repeat it

The first animated build let the **browser** play each file in a hidden `<img>` (1×1, `opacity:0`)
and copied "whatever frame the browser is showing" onto the hero's canvas once per render. It
looked right in code and was frozen in practice: **browsers pause an APNG that is not painted on
screen**, so that copy was frame 0 forever. The owner's browser test caught it; no amount of local
reasoning would have.

Rules that follow:

* Never reintroduce the hidden-`<img>`-and-copy path as the animation. It may stay as the visible
  **fallback** when the frames cannot be fetched at all, and it must be labelled as such.
* The animation must be verifiable **without a browser**: decode the file in JS and compare frames
  with an independent decoder (§6). "I read the code and it animates" is not evidence.
* Never route the new art through the old pack atlas (`packTex`, `setPackCell`, `repeat.set(1/8,1/24)`)
  or the old crop path (`p.poses`). Those belong to `assets/sprite_pack_data.js` only.

## 6. Tests — run these, and know what they prove

```sh
for t in tools/tests/*_sim.js; do node "$t" || exit 1; done      # every suite, incl. class_skin_sim
node tools/tests/class_skin_sim.js                               # 39 checks, the animation proof
python3 tools/make_simple_apng.py --verify Updates/ApngAnimation/simple_apng_demo.png --json
python3 tools/make_class_skins.py --check
python3 tools/backup_apng_code.py --check
python3 tools/make_sprite_viewer.py --check
git diff --check
```

`class_skin_sim.js` is the one that matters for animation. It runs the game's **own** decoder
(extracted from `index.html` into a Node vm) over all 154 files and compares every decoded frame,
byte for byte (SHA-256), against Pillow's independent rendering in
`tools/tests/fixtures/apng_frame_sha.json` — 1195/1195 frames must match. With a software canvas
standing in for the browser's it then checks the hero's own pixels: the frame due at a given
millisecond equals Pillow's frame, the mirror is exactly a horizontal flip, one walk cycle paints
several distinct pictures, an attack restarts at its own frame 0, a dropped view never blanks the
hero, a new facing never shows the old pose, and every fallback path behaves.

If you change the animation code, the fixture must still match — that is the safety net. If you
replace art, regenerate both the manifest and the fixture (§7).

## 7. Updating the art — the whole procedure

1. **Drop the new files** into `Updates/Sprite/<Tree>/<job> <gender> <walking|attack> <DIR>.png`,
   keeping the existing naming (`walking S/SE/NE/N`, `attack SE` or `attacking SE`). New files must
   be the simplest APNG form (§2): full-canvas frames, 8-bit RGBA, non-interlaced, `num_plays = 0`,
   per-frame delays in ms. To build one from existing PNGs:

   ```sh
   python3 tools/make_simple_apng.py --frames f1.png f2.png f3.png --out "Updates/Sprite/…/knight male walking S.png" --delay 75
   ```

2. **Rebuild the manifest**: `python3 tools/make_class_skins.py` (then `--check`). It parses every
   file chunk by chunk, records frame counts, delays, per-frame opaque bounds, drawn height and
   ground line, and refuses a file that is not a multi-frame endless loop.
3. **Refresh the frame fixture**: `/tmp/venv/bin/python3 tools/make_apng_fixtures.py`
   (recreate the venv if needed: `python3 -m venv /tmp/venv && /tmp/venv/bin/pip install pillow`).
   The suite itself needs Node alone.
4. **Refresh the canonical viewer**: `python3 tools/make_sprite_viewer.py`, then `--check`.
5. **Refresh the code backup if you touched the animation block**: `python3 tools/backup_apng_code.py`.
6. **Look at the art before trusting it**:
   `python3 tools/preview_class_skins.py --out /tmp/qc` renders a directions sheet and a
   frame-by-frame walk-cycle sheet per class — that is how the "5-frame aco female SE" and the
   duplicated files were found.
7. **Run everything** (§6). Then bump `BUILD` in `index.html` (and the two mirror sites:
   `Updates/cards-gear-audit/affix-ranges.html` and the worksheet's `baseline-data` — refresh it
   with `node tools/tests/drop_card_sheet_sim.js --refresh-snapshot`, keeping the previous build in
   `SAFE_PREVIOUS_BUILDS`).
8. **Append a dated entry to `AGENTS.md`** (what changed for players, files touched, tests, and
   anything not verified).
9. Serve the game over **http** (`python3 -m http.server 8000`) and check the live preview: the
   hero must walk, the log must print the "Class skin animation ready" line once per class.

## 8. The simplest-APNG example shipped with this note

`simple_apng_demo.png` in this folder is a 64×64, 6-frame APNG in exactly the form above (plain
coloured squares — a format example, **not** game art; never mix it into the sprites). Open it in
any browser to see the format animate, inspect it with
`python3 tools/make_simple_apng.py --verify Updates/ApngAnimation/simple_apng_demo.png --json`,
or decode it with the game's decoder — `class_skin_sim.js` does exactly that and compares the
frames byte for byte, which is the round-trip proof that the writer, the decoder and the game all
agree on the same simplest form.
