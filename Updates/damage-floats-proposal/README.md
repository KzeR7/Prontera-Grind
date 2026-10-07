# On-screen damage numbers — research, the missing crit explode frame, and 3 options

**Status: APPLIED (v69).** The owner picked the Balanced tuning on the proposal page
(arc fade · sway-up-fade-left · Chunky Verdana 900 · 17px/32px, strip B · rise 30 · life 1.05s ·
fade at 55% · punch ×1.0 · spread 14) and that exact configuration now lives in the game,
with Option B's explode frame (chip-free) as the critical look. A **📋 Copy my selection**
button on the page copies the current picks as text to paste into the chat, so a change of
heart is one paste away (it also names the focused strip A/B/C). This page stays as the live
tuner for further tweaks.

**How to view it:** run `python3 tools/preview_server.py 8000` and open **`/`** (or `/damage`,
or `/Updates/damage-floats-proposal/`). You get four live strips — the current game styling plus
the three options — all firing the same combat volley (hits, crits, skill hits, **skill
crits**, miss, incoming, heal, and a merged DoT). Sliders let you tune font, size, rise,
lifetime, fade start and impact punch live; presets: *Game today / RO classic / Balanced ★ /
Maximum juice*. Press **Space** to fire. The weapon page moved to **`/weapons`**.

---

## 1. Why your critical explode frame is missing (diagnosis)

It was **removed on purpose in the last update** — not lost by accident:

* **v66** (`2026-10-07 grind-v66`) introduced it: *"Criticals are 32px with an expanded
  red-gold starburst frame and a small CRIT label, while retaining the damage number."* That
  starburst + CRIT tag was the "explode frame" you saw.
* **v67** (`2026-10-07 grind-v67`, the update you got yesterday) fixed the real bug — floats
  were `position:relative`, so damage piled up on the left of the screen — and **trimmed the
  styling in the same pass**: *"modest 21px crits without burst/tag ornaments"*.
* The new test `tools/tests/combat_float_sim.js` now **asserts the frame must stay absent**
  (`.fl.critical::before/::after` forbidden, "critical numbers are only modestly larger").
  So restoring it is a small, well-understood change: new CSS + flip those assertions.

In short: the v67 fix was right, but it threw the explode frame away with the oversized
layout. The frame deserves to come back — rebuilt so it can't cause the old piling problem
(it now lives *inside* the absolutely-positioned float, so registration is safe).

## 2. Research — what good damage numbers do

* **Classic RO** draws damage with the client's own digit sprites (`NewNumber.spr` /
  `showdamage` textures) that pop above the target and fade; a critical "usually has a
  **red spike bubble** around the damage". That is the authentic look Option A goes for.
  (RO trivia: player skills normally *can't* crit-display in RO — so a dedicated skill-crit
  animation is a house invention, and there's no RO reference to be "wrong" against.)
* **WoW's crit pop** is a 3-stage scale — small → big → medium — i.e. an overshoot-then-settle
  punch. Every option here uses that curve instead of today's single 0.18s pop.
* **Gamedev consensus** (r/gamedev's "making good floating damage text" thread, Godot's FCT
  recipe, Unity FCT write-ups):
  * always move numbers **vertically** so new hits aren't hidden behind old ones;
  * add a small **random spread** so successive hits don't stack identically;
  * **scale-punch on spawn**, fade near the end of life (not linearly from the start);
  * crits get **bigger font + more punch**, colour-code damage types sparingly;
  * fast **DoT ticks should merge** into one refreshing number instead of a cascade.
* **Readability:** a hard dark outline (layered text-shadow / text-stroke) is what keeps
  digits legible on bright maps — soft shadows alone wash out.

## 3. Your crit GIF — the reference for criticals

`ragnarokclassic-sinx-crit.gif` came through and is now the reference. Its anatomy, which
Options A and B reproduce:

* **big chunky yellow digits** (~2.5–3× a normal hit) with a thick dark-maroon outline;
* an **irregular red starburst** ("spike bubble") directly behind the digits — jagged,
  asymmetric spikes, not a clean polygon;
* **long thin white-lavender speed-line streaks** radiating outward well past the burst,
  at random angles and lengths — the "explode" read;
* the number pops in big, settles, and **fades in place** with only a slight drift.

The page's **RO classic** preset is dialled to these measurements (crit 34px on 17px
normals, hop-and-settle, hold-then-fade), and both A and B fire the speed-line streaks
on every crit.

**Per your request, the "CRIT" chip is gone** — the explode frame is now the bare starburst +
streaks behind the number, for normal crits *and* skill crits. No text label above the frame.

## 4. The three options

| | A · Classic RO (your GIF) | B · Burst restored ★ | C · Modern action |
|---|---|---|---|
| **Normal hit** | chunky near-white digits, hard 2px outline, hop-and-settle | today's gold digits + hold-then-fade curve | white heavy digits, arc toss + punch scale |
| **Critical** | yellow digits inside the **irregular red starburst** + GIF speed-lines | **v66 explode frame rebuilt**: red-gold starburst, flash ring, gold-gradient digits, GIF speed-lines — **no CRIT chip** | white→gold gradient, spark ring, flash plate, biggest punch |
| **Skill hit** | pale-blue tinted digits | today's blue, improved fade | element-blue digits with glow |
| **Skill CRIT** | blue starburst + streaks | **silver-blue starburst + shards + flash ring, no chip** | shockwave ring + shatter sparks + white flash |
| **Feel** | authentic, calm | punchy but tidy — closest to what you had | flashiest, ARPG-style |
| **index.html change** | small (CSS + burst markup) | small (CSS + burst markup + class split) | medium (per-float choreography JS) |

All three keep the existing colour language (gold = normal, blue = skill, red = incoming) so
nothing you've learned about reading the screen changes.

## 5. NEW — Pop-up types (where numbers spawn and how they travel)

A second control next to Fade style. Four modes, all live on the page:

| Type | Behaviour | Reference |
|---|---|---|
| **Random scatter** *(today)* | numbers pop at a random spot around the mob and drift | the game as of v67 |
| **Front of body** | numbers always spawn dead-centre on the mob's body, pop, and fade in place | your sinx GIF |
| **Sway up, fade left** | spawn front of body, sway as they rise, then fade drifting to the left | your written example |
| **Stack upward** | every hit spawns front of body; older numbers are pushed up a step, forming a tidy rising column | WoW-classic style cascade |

Implementation note for the game: this is a per-float "holder" — the mode's motion lives on a
wrapper around the styled number, so it composes with any of the three style options (A/B/C).
In-game it would be one more Settings row saved as `S.dmgSpawn`.

## 6. Will the frame work for 100K–1M numbers? Yes — with auto-fit

You're right to ask: a starburst sized for a 4-digit number swallows a 7-digit one. So the
burst is now **sized from the finished number, not a fixed box**:

* after the number renders, its real pixel width is measured and the starburst stretches to
  ~1.3× that width (min = 1.9× the crit font size), so **"48,350" and "1,240,000" both fit**
  — the SVG stretches into a wide ellipse exactly like RO's own wide crit bubbles;
* digits keep their thick outline at any size, and the *Short form* setting ("1.2M") still
  works normally — recommend keeping it on for AoE spam;
* try the **Big crit · 1.2M** button on the page to see a 7-digit crit in all four strips.

All volley numbers on the page were raised to late-game values (hits ~10K, crits ~50–90K,
skill crits ~120–480K, DoT ticks ~2.5K/step) so you're judging at real magnitudes.

## 7. Font & size, adjustable in-game

New **Settings → Damage numbers** controls, saved in your save file like the existing
toggles:

* **Style:** Current / A / B / C (per the option you pick here).
* **Pop-up type:** Scatter / Front of body / Sway / Stack (§5).
* **Font:** Game (Trebuchet) / Chunky (Verdana 900) / Heavy (Arial Black).
* **Size scale:** 80–160% slider — implemented as one CSS variable on the overlay
  (`--dmg-scale`), so all kinds scale together and crits keep their relative boost.
* Existing *Show on/off* and *Short/Full* toggles stay as they are.

Plumbing: `S.dmgFont` / `S.dmgScale` / `S.dmgSpawn` in `fresh()` + `fixSave`, rows in the
settings panel + `act()` handlers, and the `.fl.*` block switches to `var()`-driven sizes.
No new data files, no server change.

## 8. The new skill-critical animation

Today `damageFloat(...)` picks **one** class and `critical` wins over `skill` — so a skill
crit looks exactly like a normal crit (blue skill hits never get a crit of their own). The
proposal adds a `skill-critical` class chosen when *both* flags are true, and each option
gives it a distinct look (see table). This is a ~5-line change in `damageFloat` plus CSS.

## 9. Recommendation

Take **Option B** as the default with **Pop-up type: Front of body or Sway** — B restores the
explode frame you lost (now chip-free, per your request), adds the skill-crit animation, and
keeps the tidy v67 layout. Borrow Option C's **hold-then-fade curve** and **DoT merge** (both
layer onto B later). Keep **A** as the "classic" skin for the font picker since its burst
machinery comes free once B is in.

## 10. If you pick one — the apply checklist

1. `index.html`: the `.fl.*` CSS block → chosen option's styles (+ `skill-critical` class in
   `damageFloat`), pop-up-type holder logic, settings rows + `act()` handlers,
   `fresh()`/`fixSave` defaults, CSS-var size hook, auto-fitted burst markup.
2. `tools/tests/combat_float_sim.js`: flip the "no ornaments" assertions to assert the new
   frame; add skill-critical class-split, pop-up-type and font/size setting checks.
3. `BUILD` bump + `READ-ME-FIRST.md` + the log in `AGENTS.md`; run all `tools/tests/*_sim.js`.
4. Sanity-run behind the preview server first; Cloudflare deploy unchanged (no API/migration
   work).

*Research page smoke-checked headlessly (13/13) and the inline JS passes `node --check`;
the page is dev-only and does not ship to players.*
