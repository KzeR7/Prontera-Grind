# Prontera Grind — read me first

A browser Ragnarok-Online-flavoured idle/grind game. **One file is the game**: `index.html`
(HTML, CSS and JavaScript inline, Three.js from a CDN, no build step). Cloudflare Pages serves
the repo, so pushing to `main` is the deploy.

* `index.html` — the whole game. `const BUILD='…'` near the top is the tag shown on the login card.
* `assets/sprite_pack_data.js` — the built class pack: 19 class bodies + 2 heads, base64 atlases (~5.8 MB).
* `assets/kit/` — **map kit v2**: `ro-spritesheet.png` + `.json` (25 terrain tiles, 34 billboards)
  and the two attached level designs (`ro-map-payon.json`, `ro-map-morocc.json`).
* `Sprite/*.png` — the uploaded class sheets, the source art for the pack.
* `tools/` — the art pipelines (`make_sprite_pack.py`, `montage.py`), the test suites (`tools/tests/`)
  and a dev-only plan previewer (`tools/preview/`).
* `AGENTS.md` — **the project's rules and its full update log**. Read it before changing anything:
  it carries the house rules (crop only, never draw art; all 8 directions and 3 animation rows
  survive; append to the log; bump `BUILD` for anything a player can see) and the history.

Login for testing: **`GM` / `gm1234`**. Normal accounts are made in-game and stored in the
browser (`pg_acc4`; saves under `pg_save3_<user>`).

## Run it

```sh
python3 -m http.server 8000 --bind 0.0.0.0     # then open the preview on port 8000
```

## Test it — before every push

```sh
python3 - <<'PY'
h=open('index.html').read()
open('/tmp/pack_block.js','w').write(h[h.index('const PACK_BODY='):h.index('function ensureHero(')])
PY
for t in pack class_change save_load economy stat card skill gear scene kit ui sprite starter; do
  node tools/tests/${t}_sim.js || echo "FAILED: $t"
done
```

Expected tails: pack prints the 19 bodies; every other suite prints `N passed, 0 failed`
(class_change 22, save_load 10, economy 21, stat 7, card 13, skill 49, gear 20, scene 8,
**kit 34**, ui 13, sprite 10, starter 7). All suites pull the real code out of `index.html` by
string boundary, so moving a declaration can break a test without breaking the game — if a suite
throws, read the boundary it grabs before assuming the game is at fault.

## Change the map art

```sh
python3 -m venv /tmp/venv && /tmp/venv/bin/pip install pillow numpy scipy    # once
/tmp/venv/bin/python tools/make_sprite_pack.py      # Sprite/ -> assets/sprite_pack_data.js
/tmp/venv/bin/python tools/montage.py               # the four montage sheets, only if re-cutting them
```

The map **layouts** (which tile goes where, how the scenery is clumped) are data in `index.html`:
`const KIT_MAP` holds one recipe per map and `fieldPlan()` builds it. `stageDress()` uses only
existing atlas crops to add variants for stages 4–6, 7–9 and the stage 10 boss altar; stages
1–3 use the original plan. The combat arena is 26×40 units, with three isolated packs at
`PACK_SPOTS`; `spawn()`, `kill()` and `update()` coordinate the 1 → 2 → 3 loop. To look at a layout without a
browser:

```sh
node tools/preview/dump_plans.js /tmp/plans.json 10    # third arg: stage, defaults to 1
/tmp/venv/bin/python tools/preview/render_plans.py /tmp/plans.json /tmp/out --px=1400 --box=-38,-38,38,20
```

## If the workspace resets

Nothing is lost and nothing has to be rebuilt: `index.html`, the sprite pack and the map kit are
all committed. Re-clone or `git pull` the working branch, read the newest entry in `AGENTS.md`
(it says what was finished last and what is still owed), and run the suites above to prove the
tree is sane.

**Do not resurrect `UPDATE-BOOTSTRAP.py`.** It was a one-shot that shipped a compressed
2026-10-02 (v7) build of `index.html` and `tools/`, and by v26 its patches no longer applied, so
running it would restore that old build over the current game. It was deleted in v27; it is in
git history if anyone ever wants to read it. The recovery path is git, not a script.
