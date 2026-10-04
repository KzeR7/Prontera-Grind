# The owner's attack-pose + head selection — how it is backed up, and how to change it

**Audience: the next agent (or the owner).** Everything here is about the picker's data,
not about the game. Read `AGENTS.md` first — it is the project log.

## What this is

The owner went through `tools/sprite_picker.html` and picked the six attack frames for
every class in every camera view, and dragged the head onto the shoulders frame by frame.
They sent the result back as one JSON blob (the picker's "Copy my selection" output).

That blob is now **backed up in the repo** and is also the picker's **starting state**, so
the next person opens the page on the owner's own numbers instead of on guesses.

## The files

| File | What it is | Hand-edit? |
|---|---|---|
| `tools/attack_selection.json` | **The backup.** The v5 payload exactly as the owner delivered it, 2026-10-04. 18 classes × 5 drawn views × 6 frames = 540 pose cells, plus 862 head entries. | Yes — this is the source of truth for the selection. |
| `tools/sprite_picker_defaults.js` | **Generated** from that JSON by `tools/make_sprite_picker.py`. The picker loads it and starts from it. | **No** — rebuild it (below). |
| `tools/sprite_picker.html` | The picker. `applyDefaults()` / `resetAll()` load the standard; "↺ Back to the standard" puts the page back to it. | Yes, it is the app. |
| `tools/sprite_picker_standalone.html` | The same app with the sheets, the pose index and the standard inlined. | No — rebuild it. |
| `tools/tests/picker_sim.js` | Proves the standard comes back number for number, and that the export round-trips it. | Yes. |

Rebuild everything that is generated:

```sh
/tmp/venv/bin/python tools/make_sprite_picker.py     # pose index + defaults + standalone
node tools/tests/picker_sim.js                       # 19 checks, one of them the round trip
```

## What the numbers mean

The payload is `version 5`. One pose cell is:

```
[x, y, w, h, headX, headY, headSource]
```

* `x/y/w/h` — the pose's box **in the class sheet**, in sheet pixels. (The picker works in
  pose *ids*; `make_sprite_picker.py` turns ids back into boxes when it writes the backup.)
* `headX/headY` — the head's pivot, **in the game's 96×96 body cell** (not in the sheet).
  The game draws the head at `headX-32, headY-48` in that cell, exactly like `packTex` does.
* `headSource` — `manual` when the owner dragged that head, `stub` when it is the measured
  seat, `torso`/`none` when the sheet gave nothing to measure.
* `null` in the frames array = "keep the previous frame"; a leading `null` = the first pose
  the owner picked. (The delivered selection has no nulls, but a future one may.)
* `headAdjust` — the raw drags, `"Class|view|frame": [dx, dy]`, views 5–7 included.
* Views 0–4 are drawn on their own art. **Views 5/6/7 (NE/E/SE) are the mirrored views**:
  they reuse NW/W/SW's poses (mirrored) and have no pose rows of their own in the payload,
  but they *do* carry their own head entries. The game must mirror the pose and its box.

## How the picker applies it

`tools/sprite_picker_defaults.js` carries two things:

* `attack` — the six pose **ids** per view 0–4 (ids, because the picker works in ids);
* `head` — the head pivot as an **absolute** point in the game cell, per `Class|view|frame`;
* `headDragMirror` — views 5–7's heads, kept as the drags the payload saved (there is no
  absolute number for them in the payload).

At load, `applyDefaults()` turns each absolute head into a drag against whatever seat this
build measures — the pack's own anchor when the pose is labelled for that view, the measured
seat otherwise. That is why the owner's head positions survive even if the seat rule is
changed later: the absolute number is what is stored, the drag is derived.

## Adding a class later (the owner's "as I might add more classes")

1. Drop the new sheet into `Sprite/` with the class name (`Sniper.png`, …). `ACOLYTE`,
   `Assassin` and `Assassin Cross` have file-name aliases in `make_sprite_picker.py`
   (`EXTRA_SHEETS`); anything else is found by name.
2. Rebuild: `/tmp/venv/bin/python tools/make_sprite_pack.py` then
   `/tmp/venv/bin/python tools/make_sprite_picker.py`.
3. The new class shows up in the picker with the **sheet's own suggestion** for its attack
   frames (that is what `resetAll()` does for every class the standard does not cover) and
   with no head drags — heads default to the measured seat.
4. The owner tunes it and sends a new payload back. Paste it into
   `tools/attack_selection.json` (replacing the old object) and rebuild: the whole repo —
   backup, picker default and standalone — moves to the new selection in one step.

**Known gap:** the delivered selection covers 18 classes. **Sniper has no selection yet**
(the class exists in the picker and in the pack); it runs on the sheet's own picks until the
owner tunes it.

## What is *not* here

The weapon. It is parked by the owner's own instruction until the poses are confirmed; the
picker has no weapon control on purpose, and `assets/weapon_joints_data.js` is not loaded by
it. The next step after this selection is the weapon, then baking the poses into the pack.

## Gotchas worth remembering

* A box in the payload can name **more than one** pose: the same crop is sometimes measured
  in several directions and each of those has its own measured seat. The picker resolves the
  first matching pose, so the *box* is ambiguous — but `headX/headY` are absolute, so what
  the owner sees and what the game bakes do not depend on which of the look-alikes is chosen.
* Do not "fix" head numbers by re-measuring: they are the owner's own judgement. The
  round-trip test in `picker_sim.js` fails loudly if any number drifts.
* `setHead(dir, frame, value, cls)` takes the class as an optional **fourth** argument —
  without it, a drag is written under whichever class is on screen, which is how the first
  version of the loader scattered one class's heads over another's.
