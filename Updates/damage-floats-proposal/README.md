# On-screen damage numbers — research, the missing crit explode frame, and 3 options

**Status: APPLIED (v69, geometry corrected in v71, font/fill in v72, retuned in v73 / grind-v83.4).** The owner
picked the Balanced tuning on the proposal page (arc fade · sway-up-fade-left · Chunky Verdana 900 ·
17px/32px, strip B · rise 30 · life 1.05s · fade at 55% · punch ×1.0 · spread 14) and that exact
configuration now lives in the game, with Option B's explode frame (chip-free) as the critical look.
The owner's **new strip-B selection** (arc fade · sway up, fade left · Game (Trebuchet) · **28px/39px** ·
**rise 70** · **life 1.75s** · **fade at 90%** · **punch ×1.9** · **spread 14**) is applied too — and this
time the spread is **wired in**, not just shown. A **📋 Copy my selection** button on the page copies
the current picks as text to paste into the chat, so a change of heart is one paste away (it also
names the focused strip A/B/C). This page stays as the live tuner for further tweaks, and its sliders
now **default to the live pick**, so the 📋 button prints exactly what is in the game.

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

---

## Handover — for the next agent (and the owner's future "change it again")

**This folder is the keeper.** It is committed to the repo (PR #29, `main` after merge), the
preview server serves it at **`/`** (`/damage` too), and `TOOLS-START-HERE.md` lists it in its
route table. When the owner asks to adjust the damage numbers again, the workflow is:

1. `python3 tools/preview_server.py 8000` → open **`/`**.
2. Let the owner retune (sliders, pop-up types, style strips A/B/C, presets).
3. They press **📋 Copy my selection** and paste the text into the chat.
4. Apply it with the slider→code map below, update `tools/tests/combat_float_sim.js` and
   `tools/tests/ui_sim.js` to the new values, bump `BUILD` plus the build-tag snapshots
   (`Updates/cards-gear-audit/affix-ranges.html`, `equipment-cards-tuning.html`,
   `tools/cloudflare-deploy-steps.md`), and append the `AGENTS.md` log entry.
5. Re-run this folder's smoke check: `npm i jsdom` then
   `node Updates/damage-floats-proposal/smoke_test.js` (the test stubs the Web Animations
   API itself, since jsdom lacks it).

**Live settings applied to the game (BUILD grind-v83.4) and where they live in `index.html`:**

| Setting (owner's final pick) | Where in `index.html` |
|---|---|
| Font **Game (Trebuchet)** — the selection's key is `game`; **Chunky (Verdana 900)** is `classic` and **does not ship** — **28px** normal/skill, **39px** critical/skill-critical (v73 retune) | floats CSS block: `.fl.damage,.fl.skill-damage{font:700 28px "Trebuchet MS"…}` and `.fl.critical,.fl.skill-critical{font:900 39px "Trebuchet MS"…}` |
| Crit **fill** = this page's strip B, not flat gold: `linear-gradient(#fff3b0 10%,#ffc93c 90%)` clipped to the glyphs, `.6px` maroon stroke, soft shadows, plus a **1px dark rim** (added in v72: the page warns a thin stroke fails on bright maps). It sits on the digits span, so the burst is not filtered with the digits | `.fl.critical .fnum{background-image:…;color:#ffd23f;-webkit-text-stroke:.6px #57330a;filter:drop-shadow(0 0 1px #2e0a02) …}`; skill crits the same in `#eafaff → #7cd4ff` |
| Burst runs this page's `T.life` curve: `scale .3 → 1.25 @30% → 1 with a random wobble @55% → 1.05`, not the old fixed 0.32s pop — stretched to the 1.75s life | `@keyframes fburst-pop{…}` + `--brot` on the `.fburst` markup; `.fburst{…animation:fburst-pop 1.75s…}` |
| Crit colour GIF-yellow + maroon outline; skill-crit silver-blue | `.fl.critical{color:#ffd23f…}` / `.fl.skill-critical{color:#eaf6ff…}` |
| **Fade style: arc** — punch on spawn (crits peak **×2.33**, normals **×1.475**, settling over the first 20%; the page maps the ×1.9 punch as `1+.7*punch` on crits, `1+.25*punch` on normals) | draw-loop float block: `sc=1+cs*Math.max(0,1-tt/.2)` with `cs` **1.33** for crits, **.475** otherwise |
| **Pop-up type: sway up, fade left** — up **70px** (the top end of the page's Rise slider), right 10px for the first 28%, then −28px left | draw-loop float block: `dy=-DMG_RISE*Math.min(1,tt*1.15)` with `DMG_RISE=70`, and `dxx=sway+(f.sw||0)*Math.min(1,tt/.22)+(f.sp||0)` |
| **Hold-then-fade from 90%** of the life | draw-loop float block: `opacity=Math.min(1,Math.max(0,r/.1))` |
| **Lifetime 1.75s** | `addFloat` gives the damage family `rate:.571` (life decays at `rate×dt`; 1/0.571 ≈ 1.75s) |
| **Spread 14px, wired in (v73)** — every damage number (hits, skill hits, crits, skill crits, DoT) rolls its own **±14px horizontal offset at spawn**, ridden on top of the sway so a multi-mob volley fans out. The page's `driftX` rule honours it in sway mode too | constants `DMG_SPREAD=14`; `addFloat`: `…rate:isDamageFloat(kind)?DMG_RATE:0,sp:isDamageFloat(kind)?rnd(-DMG_SPREAD,DMG_SPREAD):0}` (the merged DoT float rolls one too); draw loop: `dxx=sway+(f.sw||0)*Math.min(1,tt/.22)+(f.sp||0)` |
| The constants line carries the whole pick | `const DMG_LIFE=1/.571,DMG_RISE=70,DMG_FADE=.9,DMG_RATE=.571,DMG_SPREAD=14;` |
| **Spawn above the mob's head (v83.5)** — the number starts clear of the head: crits clear of the whole 97.5px burst box, ordinary hits of their 28px digits, measured in screen px through `scr` so it holds at any zoom. It follows the mob's drawn scale, so **bosses start higher**; incoming damage clears the hero's head too (`heroDamageY()`, was a fixed 2.4 on the chest). No random scatter for damage numbers | `mobDamageY(o,crit)`: head line `3.05*mobVisualScale(o)` (the height `syncMobImage` draws the sprite), clearance `(crit?97.5:28*1.2)/2+6` px above it, 1.7 floor kept for mobs still spawning in; `heroDamageY()`: head line `2.92` (the hero billboard's top); call sites `showDamage(o,o.x,mobDamageY(o,c),o.z,…)` in `hurt()`/`strike()` and `damageFloat(pl.x,heroDamageY(),pl.z,…)` for incoming — the old `rnd(-.4,.4)` jitter is gone |
| **Explode frame** on crits & skill crits (the page's own layered star — 12 jittered outer spikes + 8-spike inner star + pale core, **no CRIT chip**) with a random speed-line spray (9 crit / 8 skill crit) and an impact ring, sized from the number | float-creation block in the draw loop: `if(f.kind==='critical'||f.kind==='skill-critical'){…}` — `fs=39`, `starPts(12,48,30,rot)` + `starPts(8,34,20,rot*.6)`, width `max(fs*2,len*fs*.84)`, height `fs*2.5`, ring `fs*1.4` |
| Skill crits are their own class | `damageFloat`: `critical?(skill?'skill-critical':'critical'):…` |
| **Short form starts at 100K** (99,999 stays full digits) | `shortNum`: `if(a>=1e5)…` |
| Skill-name banner above the head | `skillNameFloat`: world height `3.65`, +.38 per extra cast slot |

**Read the copy button's keys literally (v72 lesson).** The button prints the raw slider values, and
the **font** row is a key, not a label: `font: game` = **Game (Trebuchet)**, `font: classic` =
**Chunky (Verdana 900)**, `font: heavy` = **Arial Black**. The v69 hand-back said "Chunky (Verdana
900)", so the game shipped `classic` while the v72 selection said `game` — the digits were a
different typeface from the strip that was tuned, which is the "design looks off" half of that
report. If a paste and the page's dropdown label ever disagree, trust the key.

**v71 geometry note (the "it doesnt look like what it was proposed" report).** The first game
port of Option B moved the pop animation onto the `<svg>` inside the centred `.fburst` box. Its
keyframes carry `translate(-50%,-50%)`, and on the svg that resolves against the svg's own size —
a second shift stacked on the box's own centring, so the starburst drew half a burst up-left of the
digits while the impact ring stayed on them. The same port had swapped B's 8-spike inner star for a
flat gold disc and evened the streak spray into a 7-bar pinwheel. v71 restores this page's own
geometry (inner star + core, random streaks, `max(fs*2,len*fs*.84)` box, ring `fs*1.4`) and puts the
animation on the `.fburst` box, so **strip B on this page and the live crit frame are the same
picture again** — if the two ever disagree, render the game's markup next to the page's before
judging the tuning.

**v73 handover note (grind-v83.4, the retune).** The owner pasted a new strip-B selection
(`font: game`, 28px/39px, rise 70, life 1.75s, fade at 90%, punch ×1.9, spread 14) plus two
asks beyond the sliders: *make the numbers float higher* (the Rise slider's top end, 70px) and
*make Spread actually do something* (it was inert in sway mode — the sway path owned the sideways
motion — and the game had no spread at all, so a multi-mob volley piled onto one pixel). What
changed on this page: the **sliders and the Balanced preset now default to that exact pick**, so
the 📋 button prints what is live; **`driftX` honours the spread in sway mode** (front-of-body
and stack still stay put); and **the stage grows with the flight** (`syncStage` — the strips get
taller and the spawn point stays glued to the mob's head in px) so a 70px rise plus the burst
stays on the strip instead of clipping mid-flight. What changed in the game: the constants line
(`DMG_LIFE=1/.571,DMG_RISE=70,DMG_FADE=.9,DMG_RATE=.571,DMG_SPREAD=14`), the 28px/39px digit
sizes, `fs=39` in the burst builder, the `fburst-pop` duration stretched to 1.75s, the punch
`cs` 1.33/.475, the fade `r/.1`, and the spread: `addFloat` (and the merged DoT float) roll
`sp:rnd(-DMG_SPREAD,DMG_SPREAD)` at spawn and the draw loop rides it on the sway
(`dxx=sway+(f.sw||0)*Math.min(1,tt/.22)+(f.sp||0)`). v71's centring and v72's gradient fill +
1px rim are untouched. `volley-before-after-v73.png` in this folder is the same volley rendered
at the old (v72) vs new (v73) settings — a rendering from the game's own motion math, not a
screenshot (no browser in the sandbox).

**v83.5 handover note (grind-v83.5, spawn above the head + the short-form check).** The owner
asked for two things after playing the retune: damage numbers should **start above the mob's
head** — bosses too — so they stop covering the monsters (and the hero), and a check that the
game's **short-form option** (100K / 1M) goes well with the float code. The game now spawns every
damage number clear of its mob's head: `mobDamageY(o,crit)` measures the clearance in screen px
through the same projection the floats use (`scr`), from the sprite's own head line
(`3.05*mobVisualScale(o)`, the height `syncMobImage` draws the sprite), so it holds at every zoom
and follows the mob's drawn scale (bosses start higher); a crit clears its whole 97.5px burst box,
an ordinary hit its 28px digits, and the old 1.7 floor stays for mobs still spawning in. Incoming
damage lifts above the hero's head too (`heroDamageY()`, from the 2.92-tall hero billboard; it
used to sit at a fixed 2.4, on the chest). **The short form checks out — no code change needed:**
every damage number is formatted by `numTxt` (short by default, full via the Settings switch),
the starburst sizes itself from the finished label (`1.3M` gets the same 131×98px box as `1896`,
`1M` the 78px minimum, full-mode `1250000` stretches to 229px), and the gradient digit fill
carries the K/M/B suffix as-is. Pinned by a new ui_sim check; `combat_float_sim` re-pins the spawn
helpers. This page needed no change — its strips already anchored the spawn in px above the
mob's head (`spawnBase`); the game now does the same.

**The style strips** (A = RO red spike bubble, B = the applied red-gold starburst,
C = modern sparks/shockwave) are all still on the page — switching the game to A or C later
is a small CSS/markup swap in the same blocks, not a rewrite. MISS/DODGE, incoming damage,
heal/level floats and the skill banner sit outside this system and were intentionally left
unchanged.
