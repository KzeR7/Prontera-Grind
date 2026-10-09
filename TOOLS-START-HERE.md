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
| **`/`** or `/game` | **`index.html` — the game itself** | **you want to play it**: the preview link lands on the game (register/login). `/weapons` stays the proposal page |
| **`/weapons`** or `/proposal` | **`tools/weapon_proposal.html`** | **you want to see the shipped v78 weapon defaults on the class sprites or tune a follow-up** — opens frozen for placement, **male and female sprites** (each with its own numbers), **a placement per animation frame** (the weapon follows the body when you play), `🎯 Set hand` to lock the grip (the weapon snaps to the pixel you click), a checkbox per view (weapon or bare-handed), flip ⇄/⇅, drag/rotate/size, three designs per family, **Every class at a glance** (`▤ show the pictures`: 19 small live previews, one per class, each saying whose numbers that sprite is on), **Copy only what I changed** (the short hand-back; later edits remain proposals until integrated) / **Copy everything** || `/review` | `tools/weapon_review.html` | the older per-frame weapon review (one tile per class/view/frame) from the v35 pass |
| **`/damage`** | **`Updates/damage-floats-proposal/index.html`** | **the on-screen damage numbers** — four live strips (current game styling + options A/B/C) firing a combat volley; tune **fade style, pop-up type (scatter / front-of-body / sway / stack), font, sizes, rise, lifetime, fade start, impact punch, spread** with instant previews; presets; **Big crit · 1.2M** proves the explode frame fits 7-digit numbers; **📋 Copy my selection** copies the exact picks as text — the owner pastes that to the agent, who applies it (the folder's README carries the slider→code map and the apply checklist). This page produced the live v69/v70 look |
| **`/crit`** | **`Updates/crit-frame-compare/index.html`** | **the critical frame and digits, before vs after** — two live stages: v70/v71 as shipped (burst drawn half a burst up-left of the digits, flat gold fill under a hard outline, Verdana 900) and v72 (centred frame, the selection's Game font, strip B's gradient fill + `.6px` stroke + soft shadows + 1px dark rim, the life-long burst curve). Same markup builder and box maths as the game; sliders for crit size, streak count and the number. Fire it whenever the crit frame is in question |
| **`/skillfx`** | **`tools/skill_fx_preview.html`** | **the skill-effect sprites** — every active skill's RO-style animated effect on a small stage: click a skill to cast it, pick any hero class and target, slow the speed down, loop one skill, or **▶ Play every skill**. The page lifts the real effect code out of `index.html`, so what plays here is exactly what the field shows; the right panel carries the RO/ROM/RO3 research note behind each family |
| `/standalone` | `tools/weapon_review_standalone.html` | the same page as one self-contained file, for a plain `file://` open |
| `/picker` | `tools/sprite_picker.html` | the attack-pose + head-seat picker the owner uses for the class art itself |

**Open these through the server, not as raw files.** The class art is animated APNG, and the
pages decode the frames themselves — a `file://` open loses the animation (the game handles
that case honestly; the pages may not).

## The pages, by the question they answer

| question | page / tool |
| --- | --- |
| What does the hero look like, wearing *this* class, walking and attacking? | `/weapons` → proposal page (animated), or `/picker` for pose/head editing |
| What does a skill's battlefield effect look like, cast on demand? | `/skillfx` → the skill-effect sprite preview (all active skills, slow-mo, loop, play-all) |
| What do the damage numbers look like, and how do I change them? | `/damage` → the damage-floats tuner; hand back with **📋 Copy my selection** (see `Updates/damage-floats-proposal/README.md`) |
| What did the numbers look like *before* this tuning, side by side? | `/tmp/venv/bin/python tools/render_float_volley.py` → `Updates/damage-floats-proposal/volley-before-after-v74.png` (two tunings, from the game's own motion maths — no browser needed) |
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

**Two suites live outside that loop:** `node tools/tests/field_loop_smoke.js` boots the real
`index.html` in jsdom with the real Three.js r128 and drives the farming loop end to end (camps,
refills, the swing, the floats). `node tools/tests/save_owner_boot_smoke.js` boots the same page and
logs in through its own login form, to check the save-owner stamp on the real login card. Both need
`npm i --no-save jsdom three@0.128.0`; without them each prints a skip line and exits 0, which is why
neither is named `*_sim.js`.
