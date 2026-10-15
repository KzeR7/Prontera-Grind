# Native fourth-job review pack

The owner approved original native sources, the latest `SKILLS4` design and keeping
`FOURTH_JOBS_LIVE=false`. This pack prepares progression bodies, not wardrobe costumes.

`Updates/fourth-jobs/review.html` shows Rune Knight (4054), Warlock (4055), Ranger
(4056), Guillotine Cross (4059), Arch Bishop (4057) and Mechanic (4058), male and
female, eight directions, idle/walk/attack/cast, plus explicit GX Rolling Cutter routes. The original renderer composes each
body with native hair style 2, its default palette, the matching sword/staff/bow/
katar/mace and native shadow. Rune Knight uses its default body, not the alternate
costume from the historical wardrobe proposal. Mechanic is on foot, without a
Madogear suit. There is no invented, repainted or substituted character art.

## Provenance and limits

`source-manifest.json` pins 75 original ACT/SPR/IMF/palette files recovered from
`grf.robrowser.com`, using existing wardrobe hashes where available. Seventeen
optional probes were absent: male Warlock IMF and weapon-slash sets that the
native renderer does not require for these staff/bow/mace weapons. The renderer's
existing fallback behavior is retained; missing binaries are not fabricated.
Ragnarok artwork remains Gravity's property. The renderer is MIT licensed;
its license does not relicense the artwork.

Exports use `adsonpleal/ragassets` commit
`4de4fa747431979d35c747d7edd549a872efd9e1`, built with Go 1.24.2. The committed
`export.go` calls the native engine's complete composition; it does not implement
new attachment or drawing rules. Frame delay is its native interval × 25 ms,
as in the existing wardrobe and pet exporters. The 320×280 canvas has a
(160,200) foot anchor. Lossless crops pack into 12 atlases, each below 4 MiB decoded;
all 400 actions / 2,573 frames retain their native positions and timing.

The pack is deliberately under `Updates/fourth-jobs/`, excluded from the static
production build. **It is a fixed-look review pack, not a wardrobe-ready body
replacement.** All hairstyle/color/accessory routes still need native exports and
composition audits before attaching these bodies to the game. Existing wardrobe
and parent-body fallbacks are preserved. Do not map their timing to parent frames.

## Rebuild

Use the repository's Python asset environment (Pillow 11.3.0) and pinned Go version.
Source recovery needs only Python's standard library. Keep inputs and full native
proof frames outside the checkout.

```sh
python3 tools/native-fourth-jobs/recover.py /tmp/fourth-native
```

Check out the pinned renderer in a separate workspace repository, copy `export.go`
to `gateway/cmd/fourth-export/main.go`, then from its `gateway/` directory:

```sh
go build -o /tmp/fourth-export ./cmd/fourth-export
/tmp/fourth-export /tmp/fourth-native /tmp/fourth-render render
```

From the game repository, with the Pillow environment selected:

```sh
python tools/native-fourth-jobs/build.py /tmp/fourth-render Updates/fourth-jobs/native
python tools/tests/fourth_job_assets.py --native /tmp/fourth-native --proof /tmp/fourth-render
python tools/build_fourth_job_review.py
python tools/build_fourth_job_review.py --check
```

The audit reconstructs every full frame from the packed atlas and compares it
byte for byte with the native engine output, its saved frame hash and action
metadata. With `--native`, it independently verifies every recovered source hash.
Without the external inputs, it still audits all packed pixels/positions/timing
against the recorded export hashes, but does not claim a fresh native render proof.

## Skill choreography and browser review

`tools/skill-fx-proposals/fourth-job-fx.js` authors the 30 dedicated effects and
Ascension aura. `python3 tools/build_afterglow.py` appends them to the existing
75-effect generated runtime, preserving every old selection and its source pins.
The current game still exposes 91 skills. New effects and the aura can be exercised
by flag-on simulations; wards and Rune Burst anchor at the caster. This visual correction changes no combat formulas. The five-skill combat adaptation is documented separately in `Updates/fourth-jobs/SKILL-RESEARCH.md`.

Run `python3 tools/preview_server.py 8000`, open
`http://localhost:8000/Updates/fourth-jobs/review.html`, and inspect both genders,
each action/facing and all skills. Pause/scrub/replay and the aura switch are
available; reduced motion starts paused. The page uses the generated runtime and
skill descriptions extracted from the actual `SKILLS4` table. It has no account,
save, class-change or unlock actions. All assets are local.

`tools/check_fourth_job_browser.js` exercises all controls and checks rendered
sprite pixels on 384 manual routes plus native Rolling Cutter playback and all 30 skill selections. Run in the shared browser:

```sh
coderabbit-agent-browser eval "$(cat tools/check_fourth_job_browser.js)"
```

Repeat at desktop and 390px widths. Simulations validate drawing operations and
lifecycles; browser screenshots validate Canvas appearance. Neither certifies
full-game WebGL rendering or physical phone performance. Full flag-on gameplay,
wardrobe, rite panel and balance acceptance remain release checklist work.

## Native skill-action playback

GX `roll0`–`roll7` reuse the exact native katar attack actions 88–95, eight frames
at 100 ms each; the pack records `skillActions.gc_roll = "roll"`. `cast0`–`cast7`
use native actions 96–103 for every class. Atlas deduplication avoids duplicating
identical attack/roll pixels. The asset audit verifies action IDs, delays and all
2,573 full frames against the renderer. `fourth_job_motion_sim.js` checks every
GX gender/direction, five complete clips per slot and native manual timing.

The review follows the selected skill by default. Cast mode fits clips to swings,
as the game does; manual mode keeps the native frame delays. Scrubbing controls
both body and effects. `tools/check_fourth_job_playback_browser.js` verifies actual
Canvas effects, changing pixels, native roll actions and automatic playback.
