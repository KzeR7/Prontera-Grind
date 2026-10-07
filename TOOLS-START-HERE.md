# Tools — start here

There are a lot of dev pages in `tools/`, several with similar names. This is the map:
**what to open, what it answers, and which ones are history.** Nothing here ships to a player.

## The one command that serves them all

```sh
python3 tools/preview_server.py 8000     # from the repo root, binds 0.0.0.0
```

Every route answers **200 directly — no redirects** (a proxy in front of this can drop a 302,
which once left the owner staring at a blank page). It also serves the whole repo, so
`/assets/...`, `/tools/...` and `/Updates/...` all work.

| route | page | use it when |
| --- | --- | --- |
| **`/`** or `/game` | **`index.html` — the game itself** | **you want to play it**: the preview link lands on the game (register/login, then **T** for Prontera Town). `/weapons` stays the proposal page |
| **`/weapons`** or `/proposal` | **`tools/weapon_proposal.html`** | **you want to see weapons on the classes today** — opens frozen for placement, **male and female sprites** (each with its own numbers), **a placement per animation frame** (the weapon follows the body when you play), `🎯 Set hand` to lock the grip (the weapon snaps to the pixel you click), a checkbox per view (weapon or bare-handed), flip ⇄/⇅, drag/rotate/size, three designs per family, **Every class at a glance** (`▤ show the pictures`: 19 small live previews, one per class, each saying whose numbers that sprite is on), **Copy only what I changed** (the short paste-back) / **Copy everything** || `/review` | `tools/weapon_review.html` | the older per-frame weapon review (one tile per class/view/frame) from the v35 pass |
| **`/damage`** | **`Updates/damage-floats-proposal/index.html`** | **the on-screen damage numbers** — four live strips (current game styling + options A/B/C) firing a combat volley; tune **fade style, pop-up type (scatter / front-of-body / sway / stack), font, sizes, rise, lifetime, fade start, impact punch, spread** with instant previews; presets; **Big crit · 1.2M** proves the explode frame fits 7-digit numbers; **📋 Copy my selection** copies the exact picks as text — the owner pastes that to the agent, who applies it (the folder's README carries the slider→code map and the apply checklist). This page produced the live v69/v70 look |
| **`/crit`** | **`Updates/crit-frame-compare/index.html`** | **the critical frame and digits, before vs after** — two live stages: v70/v71 as shipped (burst drawn half a burst up-left of the digits, flat gold fill under a hard outline, Verdana 900) and v72 (centred frame, the selection's Game font, strip B's gradient fill + `.6px` stroke + soft shadows + 1px dark rim, the life-long burst curve). Same markup builder and box maths as the game; sliders for crit size, streak count and the number. Fire it whenever the crit frame is in question |
| `/standalone` | `tools/weapon_review_standalone.html` | the same page as one self-contained file, for a plain `file://` open |
| `/picker` | `tools/sprite_picker.html` | the attack-pose + head-seat picker the owner uses for the class art itself |

**Open these through the server, not as raw files.** The class art is animated APNG, and the
pages decode the frames themselves — a `file://` open loses the animation (the game handles
that case honestly; the pages may not).

## The pages, by the question they answer

| question | page / tool |
| --- | --- |
| What does the hero look like, wearing *this* class, walking and attacking? | `/weapons` → proposal page (animated), or `/picker` for pose/head editing |
| What do the damage numbers look like, and how do I change them? | `/damage` → the damage-floats tuner; hand back with **📋 Copy my selection** (see `Updates/damage-floats-proposal/README.md`) |
| The critical frame looks wrong / not like the proposal | `/crit` → the two frames side by side, live (see the v71 section of `READ-ME-FIRST.md` for the cause) |
| Where does a weapon sit in the hand for each attack frame? | `/review` (older, per-frame tiles) |
| Which map layout does stage N build? | `node tools/preview/dump_plans.js /tmp/plans.json 10` then `/tmp/venv/bin/python tools/preview/render_plans.py /tmp/plans.json /tmp/out` |
| What do the class skins look like, frame by frame, per class? | `python3 tools/preview_class_skins.py` (writes QC sheets) |
| What does the game's own combat output look like, offline? | `python3 tools/preview_ingame.py` |
| How does the pacing curve behave at a given kills/hour? | `node tools/tune_pacing.js` |
| What are the weapon/gear affix ranges the game rolls? | `Updates/cards-gear-audit/affix-ranges.html` |
| What is in the gear/card catalogue, and can I edit it? | `Updates/cards-gear-audit/equipment-cards-tuning.html` |

## The generators (these write files the game reads)

| tool | writes | check before pushing |
| --- | --- | --- |
| `python3 tools/make_sprite_pack.py` | `assets/sprite_pack_data.js` | `node tools/tests/pack_sim.js` |
| `python3 tools/make_class_skins.py` | `assets/class_skins_data.js` | `python3 tools/make_class_skins.py --check` |
| `python3 tools/make_weapon_pack.py --source <client>` | `assets/weapons/`, `assets/weapons_data.js`, `assets/weapons_manifest.json` | `python3 tools/make_weapon_pack.py --check` |
| `python3 tools/make_sprite_viewer.py` | `Updates/Sprite/index.html` | `python3 tools/make_sprite_viewer.py --check` |
| `python3 tools/backup_apng_code.py` | `Updates/ApngAnimation/class_skin_animation.js` | `--check`, run by `class_skin_sim.js` |
| `python3 tools/make_town_pack.py` | `assets/town/town-atlas.*` (the town's painted buildings, fountain and props) | `python3 tools/make_town_pack.py --check` |
| `python3 tools/montage.py` | the four montage sheets | only when re-cutting them |

## History — do not open these expecting current art

* `tools/weapon_review*.html` — the v35 review pass. Still valid, but the proposal page is the
  current one.
* `tools/preview_weapon.png` — a contact sheet from that same pass.
* `tools/weapon-plan.md`, `tools/HANDOVER-weapon-review.md` — the notes that led here; read them
  for the *why*, not for the current state.
* `tools/preview_layered.py`, `tools/shot_harness.js`, `_shot.html`, `_login.html` — one-off
  harnesses from earlier rounds.
* **`UPDATE-BOOTSTRAP.py` does not exist and must not come back** (see `READ-ME-FIRST.md`).

## The suites

`node tools/tests/*_sim.js` — all of them, before every push. Two need a file prepared first:

```sh
python3 - <<'PY'
h=open('index.html').read()
open('/tmp/pack_block.js','w').write(h[h.index('const PACK_BODY='):h.index('function ensureHero(')])
PY
```

**One suite lives outside that loop:** `node tools/tests/town_smoke.js` drives the whole town
(entry, the map card, the plaza and fountain, the painted art pack replacing every stand-in, the five
NPCs and every page they open, click-to-walk and click-to-talk, and that the ten fields have no
click-to-walk). It boots the real `index.html` in jsdom with the real Three.js, so it needs
`npm i --no-save jsdom three@0.128.0`; without them it prints a skip line and exits 0, which is why it
is not named `*_sim.js`. Run it after **any** change to the town, the pointer handlers or the map panel.

**How to look at the town without a browser** (this workspace cannot download Chrome):

```sh
node tools/_town_dump.js            # needs jsdom + three: writes /tmp/town_placements.json
python3 tools/preview_town_board.py # writes both boards below
```

The dump enters the real town with the real `assets/town/town-atlas.json` and takes the cameras the
game itself would have — the hero's landing spot and the bank outside the gate — and it writes what
those cameras actually see: every sprite's placement, the ground tiles with their real rects and radii,
the river, the bridge's segment tops and **every solid box** (the curtain wall, the deck, the banks, the
gate towers). The tool draws three boards from that one dump:

* `board-1-town-layout.png` — the plan, 2:1, real crops at real world sizes, back to front. Use it for
  "does the ring overlap", "is the fountain too big".
* `board-2-town-camera-view.png` — the same sprites projected through the game's own view-projection
  matrix from its own camera, which is the closest thing to a screenshot available here. Use it for
  framing: what is in shot when you walk in, whether the ring walls both sides, what a player sees
  first. Ground, water, the bridge and the wall are drawn from the dump, and each sprite carries the
  game's own two-layer contact shadow, so "is this building grounded" is answered here.
* `board-3-town-entrance-view.png` — the same camera stood on the bank outside the gate, looking in:
  gate, wall, forecourt, bridge, river and the street beyond, which is the shot the owner's round-5
  screenshots were taken from. **A bug that both boards together caught:** the ring's west arc was a mirrored angle list,
  which is the same list — all fourteen houses stood on the east side, exactly overlapping, invisible
  on the plan and obvious on the camera view.

Lighting, colour and the real floor textures still need the game itself.

`pack_sim.js` reads that slice; `sprite_viewer_sim.js` checks the canonical viewer against the
PNG files. The rest pull live code out of `index.html` by string boundary, so moving a
declaration can break a harness without breaking the game — if one throws, read the boundary it
grabs before suspecting the game.
