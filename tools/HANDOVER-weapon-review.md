# Handover — the weapon review view (paste this into a new chat)

*Written 2026-10-04 by the previous session, for whoever picks this up next.*

## The one sentence version

Everything for the weapon pass is committed and pushed; all that is missing is a **working live
preview** of the review page, because the previous session's preview link would not open for the
owner ("not working", "i cant access any of the links").

## Read this first

`AGENTS.md` at the repo root is the project's log and house rules — read it before changing
anything. The entries `tool-v34` and `tool-v35` describe exactly where the weapon work stands.

## Get the repo to the right commit

The clone in a new sandbox can come up on an old base; the pushed work is the truth. Recover with
a **mixed** reset (never `--hard` — it destroys uncommitted work):

```bash
git fetch origin
git reset --mixed origin/arena/01a1054b-prontera-grind     # HEAD must become 99ce94d or later
git log --oneline -1
```

The backup tag for this handover is **`weapon-review-v35`** (it points at the same commit); if the
branch ever looks wrong, `git checkout weapon-review-v35` gets the exact reviewed state.

**Backup in the owner's GitHub:** branch `arena/01a1054b-prontera-grind`, pull request
**#11** — https://github.com/KzeR7/Prontera-Grind/pull/11

## Then give the owner the view (this is the actual request)

Start the preview server as a **background process** (not with bash, not with a plain shell
command — it has to keep running, and Arena only turns a process it started itself into a live
preview):

```
python3 tools/preview_server.py 8000        # run from the repo root, binds 0.0.0.0:8000
```

Then hand over the live preview link of that process. The pages:

| route | what it is |
| --- | --- |
| `/` (or `/review`) | **the weapon review page** — what the owner wants to see |
| `/picker` | the attack pose + head picker (the owner's usual page) |
| `/standalone` | the weapon review page as one self-contained file |

Every route answers **200 directly (no redirects)** on purpose: the previous session served `/`
with a 302 and the proxy dropped it, which is a likely reason nothing opened. Do not reintroduce a
redirect.

## If the live preview still will not open for the owner

Give them these two, in this order, and say which is which:

1. **Click the live preview in the Arena UI** — the officially proxied path, not a hand-typed URL.
2. **The offline single file** — one self-contained page (no server, no external requests at all;
   verified). Right-click → Save link as → open the saved file:
   `https://raw.githubusercontent.com/KzeR7/Prontera-Grind/arena/01a1054b-prontera-grind/tools/weapon_review_standalone.html`
3. The contact sheet `tools/preview_weapon.png` is in the repo if they only want a look.

Ask what they actually see if it fails again (blank / cannot be reached / 404 / spinner) — each
points at a different cause.

## What the owner is looking at, and what they will do

* `tools/weapon-plan.md` is the whole story (what was measured, why v28 failed, what is left).
* Every class, 8 views (5 armed, 3 bare by their own v27 rule), 6 frames per view, weapon already
  placed from the drawn arm — **570/570 armed cells**, 315 measured from bare skin, 255 inferred.
* The owner drags any tile whose weapon looks wrong (one drag can carry the whole view), then
  presses **Copy my adjustments** and pastes that JSON back. It goes straight into
  `python3 tools/weapon_bake.py --adjust <that file> ...`. Nobody re-measures anything.
* **Do not ask the owner to pin-point hands, and do not re-derive their head numbers.** They tune
  visually; their numbers are final.
* Still open for the owner's decision (all four are listed at the end of `tools/weapon-plan.md`):
  which weapon art to bake, whether away-facing views stay bare, idle/walk staying weaponless, and
  the final "bake it".

## Housekeeping

* `node tools/tests/*.js` — **19 suites**. All green except `kit_sim` (33/1, "the retired
  generator is not loaded by the page any more"): `index.html` still carries the
  `assets/kit/morocc-atlas.js` script tag while the file lives in `Updates/retired-v1-kit/`.
  That is kit work, not weapon work - it was already red before this handover.
* Heads in the review page come from `tools/head_seats.json` (all 8 views): `node tools/head_seats.js`
  refreshes it from the picker, `tools/tests/head_seat_sim.js` (7) pins every cell, and
  `tools/patch_review_heads.js` re-seats the shipped artifacts without Pillow if the bake ran stale.
  `pack_sim.js` extracts its own slice of `index.html` (`const PACK_BODY=` → `function ensureHero(`)
  by itself now, so a sandbox reset no longer needs the old `/tmp/pack_block.js` dance.
* `/tmp/venv` (pillow + numpy + scipy) is wiped by resets; rebuild before any PIL work.
* The game has moved on since: `tool-v42/v43` wired `index.html` to the owner's SIMPLE set
  (`attack 2 frames / walk 3 frames, front + back`, artifact `assets/anim_pack_data.js`). Read the
  newest AGENTS.md entry before touching hero art.
* Append to `AGENTS.md` and bump `BUILD` only if a player-visible change is actually made.
