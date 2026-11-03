# World chat and Fountain Plaza

The bottom-left chat replaces the short field feed. World, Whisper and Log
are available from the field; entering Maps → Social Hub adds Local. On desktop (1120px and wider), its bottom aligns with the centered navigation bar.
Its width is capped to the space on the left, so resizing never shifts or covers
the navigation. Narrower screens stack chat above the bar. Market, Log, Wardrobe, Friends and Settings are in More (one Market entry).
The minimize line and resize grips are drawn inside the chat border, with no detached button or protruding handle. Click the header line to collapse/expand; its Enter/Space keys work too. Drag the top-right corner grip, the full right inner edge, or the top inner edge (or use arrow keys on `#socialResize`); preferred dimensions persist across device resizing and reloads down to a compact `220×120` floor, with the message scrollbar and Send button spaced clear of the right-edge resize strip. Chat grows to the centered navigation on desktop and to the available screen edge on narrower views. Channel tabs are reused in place (selection, unread dots and minimize state update without replacing the button under the pointer), and Display sync only runs when a visibility class changes, so HUD ticks cannot make tabs flicker or swallow clicks. Tab buttons sit above the resize grips in the stacking order.
Enter focuses/sends, Escape leaves typing. Names offer Whisper/Mute. Log retains
the existing category filters and history. Muted IDs are stored per account.

The plaza holds 20 authenticated players per room; additional arrivals automatically open
`Plaza 2`, `Plaza 3`, and so on, and online visitors can also hop between open numbered plazas
via the `#socialRoomSelect` switcher in the plaza header. World spans all plazas and fields.
Local messages, bench seats, and each room's two West Avenue Hold'em tables belong to
that numbered plaza; no Local replay is sent to newcomers. Local lines clear on
leaving/rejoining. Whispers are delivered only to sender and online recipient.

**Emotions ride the channel they were sent on (v274).** The tray used to be a plaza
feature: `room.mjs` rewrote every `emotion` to `channel:'local'` and refused it
outside a plaza, so an emote from a field silently vanished for anyone not standing
in the same numbered plaza. The tray now sends on the selected tab:
`{type:'emotion', emotion, channel:'world'|'whisper'|'local'}` (a whisper also
carries `to`). World emotions join the same 100-line backlog as text, whisper
emotions go to that one player, and Local still broadcasts to the room. A bare
`{type:'emotion'}` with no `channel` - an older cached client - still means Local,
so nothing that worked before stops working.
World keeps the latest 100 public messages in the Social Durable Object's SQLite
storage, so an eviction/restart no longer sends an empty backlog. Each signed-in
browser also keeps up to 200 World lines under an account-scoped local key and
merges/deduplicates them with the server backlog on hello/reconnect. An empty hello
cannot erase that cache. Whispers and Local are never written to this storage; they
remain delivery-only/private, and the combined in-memory chat cap is still 400.
This is recent public history, not offline mail or an unlimited archive.

Click/tap to walk at your character's own field run speed (AGI, movement affixes, pets and movement buffs, including the 1.4 running factor); the room clamps the reported value to 2–13 u/s and both client and server advance with it, so the plaza no longer feels slower than farming. Like the main field camera (`PerspectiveCamera(38)`), the camera stays smoothly locked to your character without map-wide free-panning: drag (mouse or 1 finger) to rotate and tilt (`26°–77°`, default `45°`), and scroll or pinch to zoom (`22–72` distance, default `44`). Camera exposes Rotate, Tilt, and Zoom sliders, and Reset view restores defaults. Your character is framed slightly higher than the middle of the screen (`~44–46%` from the top) so overhead bubbles, the top toolbar, and the bottom dock/chat all stay clear. Names appear below the feet, with an equipped Hunt title underneath. Appearance, title and refinement updates preserve your position. Insert or `/sit` toggles sitting; walking stands up. Twelve native slatted metal park benches form four groups along the fountain promenade, and each bench seats **2 adventurers side-by-side** (`24` bench seats total; clicking a half-occupied bench automatically claims the open partner spot beside them). Reservations are per plaza and clear on standing, walking, switching rooms or disconnecting. A larger castle,
flanking houses, two market stalls, two West Avenue Hold'em tables and four bounded corner gardens surround the expanded avenues; trees stay inside
the gardens, clear of paths. The shared layout defines building/garden/table collision.
One compact toolbar holds the plaza population and room switcher, Hold'em, Sit, Camera, Reset view, help and Return to field.
Walking/camera hints are in its help control; Emoji remains beside Send in chat. The Emoji button beside Send opens 32 original RO animations with slash commands
shown on each button on World, Whisper and Local; only Local (which needs a plaza to be local to) and the activity log have no channel to send on. A smaller animation appears with the sender in Local and in World, and a
six-second animation appears overhead with its original transparent pixels and no outer box. Spoken text keeps its speech box. World and private messages never bubble.

## Farming and state

Social is a separate renderer and transient network state. It never replaces `S`,
`pl`, `mob`, `mobs`, the selected field, combat clocks or save ownership. The real
farming simulation, loot, EXP, deaths and auto-advance keep running, while hidden
3D field WebGL/canvas rendering pauses behind `#socialHub` and resumes immediately
on return (open window previews still update live). Returning to
the field reveals its current state, including any automatic stage progression.
Movement, sitting and social presence are not saved into farming coordinates.

## Plaza Hold'em table safety and layout (haven-v283)

A reserved poker player cannot be stood up by an unconfirmed floor/bench/sit or
room-switch command. The client asks **Stay at table** (default/focused) or **Fold &
leave** before walking away, changing seats/tables, using Insert/`/sit`, switching
plazas or returning to the field. The room enforces the same `confirmLeave` guard,
so queued clicks and older clients cannot silently fold a hand. Closing/minimizing
the poker window is safe and never stands the player up. Confirmed leaving uses the
existing fold/stand accounting: committed chips stay in the pot; the unbet stack
remains in the chip wallet.

A disconnected socket gets a 15-second, server-owned reconnect reservation. The
next authenticated socket for that account inherits the exact plaza coordinates,
facing, remaining path and still-reserved poker seat; it does not spawn at the
entrance or buy in again. The poker turn clock continues during the grace, and an
AFK kick/expiry releases the seat. Explicitly leaving clears the reservation. A
same-seat `poker_sit` is idempotent for older reconnect clients.

Poker chip movements use a separate durable per-account outbox in the Social Durable
Object's SQLite storage (`poker-ledger-v1:<accountId>`), not the public World backlog
and not the short-lived seat reservation. Every blind/call/raise/win carries a stable
unique id and is written before delivery. Unacknowledged events replay on authenticated
reconnect even if the 15-second reservation expired or the Durable Object restarted.
The client saves the applied id in the same poker wallet blob as the chip balance
(`poker.ledgerApplied`), then acknowledges the id; the server removes only that account's acknowledged
events. Replaying an already-applied id cannot credit chips twice. Replay batches are
bounded, and a failed ledger load refuses sockets rather than pretending the outbox is
empty.

The poker window has a fixed viewport-derived lane: desktop chat stays bottom-left
and cannot move/resize the table; below 1280px chat docks in a compact lane beneath
the table while it is open, then restores its preferred size when minimized/closed.
While the player is actually seated at a table on a wide screen, chat narrows to a
280px column (`poker-chat-fit`) and the table takes the freed lane (left 304px);
standing/leaving restores the normal chat width and 414px lane. Hand results show a
one-shot overlay keyed by plaza room+table+hand number: win chip burst, lose/fold
shake, split pot neutral, with a matching mini-pill flash. Changing or leaving a room
clears stale result UI; reduced motion disables the burst.
Local chat spoken by a player seated at the viewed table (or a dealer callout) also
pops a small, transient speech bubble on that seat/dealer plaque for six seconds.
The bubble is visual-only (`aria-hidden`, `pointer-events:none`), renders text rather
than HTML, replaces the previous bubble for that seat, survives table redraws without
replaying its pop, and is cleared by mute, expiry, minimize, room change or exit.
World/Whisper and Local messages from players outside the viewed table never pop the
table; the existing 3D plaza bubble and chat log are unchanged.
Cards deal/reveal once per new card, the pot pulses on change, turns/winners glow,
and reduced-motion preferences disable those animations. The table keeps larger
cards, readable seats and a dedicated action dock without scrolling the table body.
Map BGM uses Theme of Prontera while visiting and restores the current farming
map on exit; manual track choice and volume preferences remain available. Weapon
refinement glows reuse the native weapon/arm effect hooks in standing, walking and
sitting poses. Base 50/99/150 level auras reuse the field's `buildLevelAura`/
`LEVEL_AURAS` sigil on the plaza floor; they follow the Display aura switch, and an
aura is created and disposed with its player. Character downloads retry automatically, retaining the standing
sprite while sitting assets load; reentry uses fresh player labels and sprites.
Arrivals spread across free entry positions so players do not spawn on top of one another.
When visiting from a local/offline character or before the multiplayer room handshake finishes,
the plaza renders your character locally with full click-to-walk, bench sitting, Sit/Insert toggle
and live wardrobe/refinement updates, then seamlessly hands presence over once a room snapshot arrives.
On throwaway `tools/dev_server.js --gm-all` preview hosts (including cross-site iframe previews that
drop third-party cookies or omit `x-forwarded-proto` on WebSocket upgrades), same-host `Origin`
checks accept `http`/`https` host matches, `Set-Cookie` uses `SameSite=None; Partitioned` over HTTPS,
and `X-Preview-Session` / `preview_session` preserves authenticated cloud + plaza sessions without
affecting production Pages cookie-only ingress.

The server validates each character's reported walk speed (2–13 u/s) and level (0–999), then computes walking paths, walking speed and room capacity. Sender IDs/names come
from the existing session, never a client payload. Input is bounded and displayed
as text. Messages and emotions share a three-second cooldown across channels (an emotion is
charged the same budget whichever channel carries it), enforced by
the client and server; movement, chair selection and sitting are bounded to ten
commands per second. Another tab replaces the account's old socket;
the replaced tab stays disconnected until reload. Disconnects remove presence.

**Two clocks, since v236.** A connection used to be closed five minutes after it
opened no matter how busy it was, so every player was bounced once per five
minutes. The age of a connection is now only a security bound: it has to go back
through Pages (which re-checks the session and the ban flag) every **30 minutes**.
That refresh is announced to the client first, so the socket is replaced and the
player rejoins their plaza and bench without a failure message or a cleared room.
Separately, a connection that says nothing for **five minutes** is swept, which is
what clears half-open sockets; every frame the player sends slides that window
forward, so an active player is never swept.

The client also watches its own socket. If the server has been silent for 20
seconds it asks for one ping/pong round trip and gives the answer six seconds to
arrive; when it does not, the socket is treated as dead and replaced at the next
beat, keeping the plaza and the seat. Without this a socket that died silently
still reported itself as open, and chat stayed quiet until the page was reloaded.

## Plaza fishing (haven-v287)

Two fishing ponds sit on the open **south lawns** (`PGSocialRules.PONDS`, centered at
(±23, 42)) — below the planted corner gardens so the water never touches the tree
canopies, and clear of the promenade, benches and houses. The water is part of the
shared layout: `walkable` blocks it on both the client and the Worker, so nobody paths
through a pond, and the grass ring around the rim stays walkable for casting.

The loop follows the classic hold-and-release fishing games: click a pond (or the
`🎣 Fishing` toolbar button — if far away the character first walks to the nearest rim),
then **hold** to charge the cast meter and release in the green zone (`PERFECT` is a small
overlay inside it; charge only buys distance, but a PERFECT cast rolls rarity twice and
keeps the better roll). While waiting, **SHAKE!** bubbles pop over the scene; each click
cuts ~0.7 s off the bite. On the bite (bobber dips, `!` mark, two-tone chime) the player
has 1.5 s to click, then the reel minigame runs: holding pushes the white control bar
right, releasing lets it fall left; progress fills while the fish silhouette stays
inside the bar and drains while it is loose, after an opening lock of ~1.1 s. Rarer fish
get a narrower bar, faster wander/dashes and slower fill (`DIFF`). A fish that never left
the bar is a **Perfect catch**. All of this is client-side and cosmetic — no farming
stats, Zeny or combat are touched.

Everything fishing lives in **one** UI system: the bottom-center fishing dock hosts the
cast meter, bite prompt, reel bar and the result card (with `Cast again` / `Show off`),
and the single **Fishing Bag** window (`🧺 Bag`) holds the inventory grid, bestiary
records (catches, species discovered, perfects, best catch), sort options, the
*Pond fish* toggle for the ambient swimmers and the *Sounds* toggle. Selecting a bagged
fish offers **Show off** and **Release** (two-step confirm). *Show off* works only for a
fish that is actually in the bag (`showOffText` returns `null` otherwise) and announces
it on **Local chat** through the normal send path — same 3-second cooldown, text-only
body, nothing new for the Worker to validate; in solo/offline plaza it falls back to a
local notice and own-bubble. 14 species across six rarities (Common → Secret, weights
sum to 1) roll a 2-decimal weight inside the species range plus rare Shiny/Sparkling
mutations. The bag persists in the save blob as `S.fishing` (bag capped at 120 entries,
sanitized on load in `index.html` and re-normalized on read by the module, like the
poker wallet). The 3D water, stone rims, lily pads, reeds, swimming silhouettes, rod,
line, bobber, ripples, splashes and the catch-flight are drawn by the scene renderer
and driven through `scene.fishing`; they are created once and animated in the existing
frame loop.

## Fishing economy, index, auto fishing and pond chairs (haven-v288)

**Pond chairs.** Eight single-seat wooden angler chairs ring the two ponds
(`PGSocialRules.CHAIRS`, 4 per pond at `x = pond.x ± 4`, 1.8 m off the north/south rims,
facing the water). They extend the shared `SEATS` table to 32 entries (ids 24–31, after
the 24 bench seats) with unique `bench` ids (`100 + id`), so the Worker's bench
reservation and the client's partner-seat swap both work untouched. The scene builds the
chairs from primitives and registers them as seat click targets.

**70-fish index.** The catalog grows to **70 species** across the six rarities
(20/16/13/10/7/4 common→secret); the 14 v287 ids keep their exact id, name and rarity so
existing bags stay valid. The Fishing window now has three tabs — **🧺 Bag · 📖 Index ·
🛒 Shop**. The Index lists every species with its weight range and base **catch rate**
(`rate(sp)` = rarity weight / pool size; the 70 rates sum to 100%), shown as `%` and
"1 in N". Undiscovered fish render as `???` silhouettes; discovered rows show count, best
weight and mutation badges from the bestiary.

**Fishcoins, rods and bait.** Coins come **only** from selling fish: per-fish `💰 Sell`
in the detail footer and result card, `Sell dupes` in the Bag (keeps the heaviest of each
species plus every mutated fish; `sellBulk`). A fish's value scales with rarity base
(3/8/20/60/200/600), heft within its species range and mutation multiplier. The Shop
sells six **rods** (permanent, auto-equip on purchase: Training→Oak→Brass→Silver→Golden→
Mythril) with four stats — 🍀 luck (bends the rarity roll: `r^(1/(1+luck))`), 🎯 control
(widens the reel bar, capped at 0.5), 🏋️ strength (bends weight: `rng^(2/(1+w))`) and
⏱ lure (divides the bite wait) — and four **baits** consumed one per cast (Worm, Shrimp
Tail, Glow Grub ×2 mutation odds, Royal Jelly +weight). The dock shows a clickable gear
line (coins · rod · bait) that opens the Shop. **Mutations** grow from 2 to 7 kinds:
Shiny ×2, Sparkling ×4, Frozen ×5, Electric ×5, Ghostly ×6, Golden ×9, Prismatic ×14 —
each with its own glyph filter/animation; bait multiplies the roll odds (per-kind cap
50%). `S.fishing` gains `coins`, `rods[]`, `rod`, `bait{}`, `baitSel`, sanitized in
`index.html` and re-normalized by the module.

**Auto fishing.** The dock's `▶ Auto` toggle runs the whole loop hands-free: it charges
to a random 55–95% power, hooks 0.25–0.85 s after the bite, drives the reel with a
bang-bang controller that re-aims at the predicted fish position every ~130 ms, and
recasts ~1.3 s after each result. It never spawns SHAKE! bubbles, and it stops on toggle,
on `✕`, when the player walks away, or when the bag fills.

**Visible show-offs.** The show-off chat line is now machine-readable: `parseShowOff`
recognizes `shows off a <Mutation?> <Species> — <w> kg (<Rarity>…` from any player's
Local message (exact species-name match, mutation prefix optional, weight sanity-checked;
forged lines are ignored). Both the room message path and the solo fallback feed
`PGSocialFishing.onLocalMessage`, which calls `scene.fishing.showFish(playerId, …)`: the
actual species glyph (hue + mutation glow) pops over the angler's head for ~5 s, **scaled
by weight** (`showOffScale`, ~0.55× for a hand-sized minnow up to ~2.3× for a 60 kg
Cobble Whale). Up to 6 overhead sprites are pooled; they follow the player and fade out.

**Movable UI.** Both the fishing dock and the Fishing window drag by their headers
(pointer events, clamped to the hub) and remember their positions in
`localStorage['pg_fishing_ui_v1']`.

## Fishing menu, giant show-offs and a steady poker table (haven-v290)

**Fishing menu.** The `🎣 Fishing` toolbar button no longer starts fishing (and never
walks the character on its own). It opens a small menu — **▶ Start fishing · 🧺 Fishing
Bag · 📖 Fish Index · 🛒 Tackle Shop**. Only the explicit *Start fishing* item (or a
direct pond click) walks to a pond; Bag, Index and Shop open the draggable Fishing window
on the right tab from anywhere in the plaza, so a catch can be shown off, sold or shopped
for without moving. The menu closes on selection or any outside click.

**Show-offs are unobstructed and BIG.** The show-off chat line no longer paints a bubble
over the angler's head — `onLocalMessage` returns `true` when it displayed the fish and
the client then skips `scene.bubble` (the text still lands in the chat panel; normal chat
lines are untouched). `showOffScale` was rescaled: a max-weight 60 kg Cobble Whale now
renders at **5.0 world units** — taller than the 3.2-unit character holding it — down to
~0.8 for a hand-sized minnow (scene sprite clamp 5.2).

**Steady poker table.** Sitting at a Hold'em table used to narrow chat to 280px and
slide the whole table 110px left into the freed lane; the owner reported the jump as a
bug. `poker-chat-fit` is retired: the modal's geometry and the chat column are now
identical whether the player is seated or standing.

## Ponds, public rigs, titles and the AFK spawn fix (haven-v295)

**Pond fish are permanent.** The *Pond fish* checkbox is gone and `settings.fish` is
always `true`; `normalize` (and the `index.html` save sanitiser) force it, so a save that
had it off comes back with swimming fish. The ambient swimmers are part of the pond now.

**The line in the water is public.** A caster sends `{type:'rig',on,pond,x,z,mode}`; the
worker keeps it on the client (`c.fish`), puts it on the ordinary snapshot, and re-emits
`type:'player'` so every client redraws. `fishing.setRig(id,state)` draws one lightweight
bobber + rod per remote angler and `removePlayer` drops it, so nobody leaves a floating
bobber behind. Your own rig is still drawn frame by frame from the fishing module and is
deliberately skipped by `putPlayer`. Presentation only — the message carries no score,
item or money, and out-of-bounds coordinates or an unknown `mode` are ignored.

**Show-offs are data, not chat.** Show off no longer writes a Local-chat line. The
angler paints the fish locally and sends `{type:'showoff',sp,w,mut,perfect}`; the worker
validates the fields (species by shape, weight 0.01–999, known mutation, 1.5 s per-client
cooldown) and broadcasts it to the room. `scene.showFish` gained a `label`, drawn as its
own small plate above the fish, so the weight is where the fish is. `showOffText` /
`parseShowOff` / `onLocalMessage` stay for old clients and chat history.

**Ten fishing titles, worn above the head.** `FISHING_TITLES` is a ladder from *Dockhand*
(10 catches) to *Apex Angler* (all 70 species), each earned from counters the saved fishing
blob already keeps — catches, casts, perfects, discovered species, best weight, mutation
kinds — so no new counter or migration can lose one. They are equipped from the new
**🏅 Titles** tab and saved as `S.fishing.title`. `plazaTitle()` wears an equipped fishing
title in the plaza ahead of the Hunt title (that is where fishing happens) and falls back
to the Hunt title when none is equipped, through the existing `look.title` nameplate line.

**Bag upgrades 120 → 200 → 300 → 400 → 500.** `BAG_TIERS` is permanent and strictly
sequential (2,500 / 8,000 / 25,000 / 75,000 Fishcoins); `bagMax(state)` is the live cap,
`BAG_MAX` stays the base 120 for older callers, and the `index.html` sanitiser clamps
`bagTier` and slices the bag to the tier the player actually owns. A full bag still
refuses a catch, and the shop row shows what is owned, stored and next.

**Painted rods with a tier glow.** `rodSprite`/`rodSpriteURL` paint a side-view rod per
tier and `ROD_TIER_COLORS` is the single colour table shared by the dock, the shop and
the glow, so a tier reads at a glance instead of as an OS emoji. Like `fishSprite` it
returns `null` without canvas 2D and the emoji glyph is the fallback.

**AFK fishing no longer teleports to spawn.** The bug was the resume window, not the
idle window: `disconnect` reserved the spot for 15 s while the client allowed 20 s of
silence + 6 s before probing, so a silent drop — and every throttled background tab —
reconnected *after* expiry, fell through to a fresh `join`, and spawned at the entrance
(~30 units from the pond, far outside the 6.5-unit fishing range), which cancelled the
cast with "You stepped away from the pond." Two clocks now:

- `RESUME_MS = IDLE_MS` (5 minutes) for the **plaza spot**, so a dropped or throttled
  client resumes where it stood. The reservation is still single-use, still authenticated
  by Pages before the socket exists, and still bounded.
- `POKER_RESUME_MS = 15000` for the **poker seat**, unchanged: an abandoned table must
  free up or it stalls the hand. `releaseSeat` drops the seat without costing the player
  their position.

The client side matches: the watchdog is 10 s + 5 s, `visibilitychange` probes the moment
a background tab wakes, every close path (not just the planned `4000` refresh) keeps
`seatState()`, and a 45 s ping runs while a line is in the water so an AFK session does
not look dead to proxies.

**Sitting is allowed while fishing.** v294's movement lock blocked seats and Insert
together; walk-away is still blocked (press ✕ Stop fishing), but `seatAction` and
`toggleSit` no longer are — the pond-side angler chairs are now usable mid-cast.

## Owner fixes after v295 (haven-v296)

**The rod sits at the same height in both stances.** `placeRod` (and the remote rig) used fixed
world heights (1.1 / 2.15), so the rod read as hip-level on the ground and drifted up the body
the moment the angler sat on a pond chair. Both now measure from the character's own feet and
height (`base + height*0.5` for the grip, `*0.78` for the tip), so one rod has one height.

**Two title lines, not one slot.** v295 wore an equipped fishing title *instead of* the Hunt
title. `look` now carries `title` and `fishTitle` separately (the worker sanitises both), and
the nameplate paints the Hunt title on its own line with the fishing title under it — so
wearing one never hides the other.

**The Titles tab scrolls.** `#fishingTitlesView` had been left out of the panel's flex and
`overflow:auto` selectors, so the list was clipped to the window. It shares the Index/Shop
rules now.

**Cheaper bag ladder.** The owner found 2,500 / 8,000 / 25,000 / 75,000 unreachable. v296 is
**300 / 700 / 1,500 / 3,000** — rising gently, with the first upgrade affordable in a session.

**AFK fishing recovers instead of surrendering.** v295 widened the resume window, which was not
enough on its own:

- The reservation is now **durable** (`onResume` → Durable Object storage under `resume-v1:`,
  reloaded in the constructor and dropped once used or expired), so an eviction between the drop
  and the reconnect no longer respawns the angler.
- With **Auto** on, being moved no longer ends the session: `walkBackToPond` sends the character
  back to the rim and fishing continues (a 9 s guard stops the loop if no route exists). A manual
  session still stops with *"You stepped away from the pond."*, exactly as v294 promised.

## A hundred species, pond giants and quiet exits (haven-v297)

Six owner requests landed together: leaving the pond asks before it reels in, the index grew to 100
species that no longer look like recolours, weights run up to a pond-sized 1.8 t, mega and secret
catches are announced in Local chat, auto-sell actually persists, and the window got quieter.

**Click away = a question, not a nag.** `stopFishing` was never the problem - the problem was
`fishingBlocked()` in `assets/social.js`, which aborted the click and wrote *"🎣 You are fishing —
press ✕ Stop fishing before moving."* into chat every time. It now opens `#socialFishLeaveWarning`
(the poker `poker-leave-card` layout, `.fish-leave-card` accent): **Keep fishing** or
**Reel in & stop**. Escape, backdrop click and **Keep fishing** all leave the line in the water;
confirming calls the new `PGSocialFishing.stop(message)`, reels in, then replays the action that was
blocked - `moveAction`, `seatAction`, `toggleSit`, `pokerSeatAction` and **Return to field** all pass
themselves as the retry, so the click the player made still happens. Focus moves into the dialog and
Tab cycles the two buttons, same as poker.

**100 species, 25 body plans.** The catalog used to be one painted fish recoloured 70 times. Every
species tuple may now carry a seventh field, its `shape`:

| Shape | What it is | Species |
| --- | --- | --- |
| `fish` / `tropical` | the original torpedo and reef bodies | 46 |
| `deep` | v297 disc body - short and tall with veil fins | koi, betta, tetra, platies, mollies, guppies, angel, crappie, pumpkinseed, killi, seraph koi |
| `gar` | needle jaw, fins set back at the tail | gar, pike, snakehead, bowfin, walleye |
| `eel` | one long tapering ribbon with a dorsal fringe | reed eel, canal moray |
| `hammer` | wide cephalofoil across the skull | hammerhead pup, great hammerhead |
| `thresher` | whip tail as long as the body | whiptail thresher, pond leviathan |
| `goblin` | long flat snout over protruding jaws | goblin shark, baphomet bass |
| `saw` | flat disc with a toothed rostrum | sawfin ray, ghost paddlefish |
| `ray` | broad wings, whip tail, cephalic horns | plaza manta, giant stingray, moonlight ray |
| `sunfish` | disc with tall fused dorsal/anal fins | ocean sunperch, sunfish, discus |
| `sturgeon` | heterocercal tail, scutes, barbels, long snout | ribbon sturgeon, beluga sturgeon |
| `angler` | huge jaw, teeth, glowing illicium | abyss angler, abyssal angler |
| `whale` | massive body, throat ridges, whale-shark spots | cobble whale, whale shark |
| glyph shapes | `puffer`, `shark`, `crab`, `lobster`, `squid`, `octopus`, `tadpole`, ... | the rest |

Body plans are drawn by `fishSprite` in `assets/social-fishing.js`; `sp.shape` wins over the glyph
(`SHAPE_BY_GLYPH` is only the fallback). Weights follow the real fish the names come from: beluga
sturgeon ~1.4 t, white-sturgeon-scale ribbon sturgeon, Mekong giant catfish 200 kg, giant freshwater
stingray 400 kg, arapaima 120 kg, and the whale shark at the top of the catalog.

**Weight bands up to the pond.** `MAX_W` is now 1,800 kg, and `showOffScale` is a saturating curve
(`0.7 + 4.3·w/(w+6)`): a 60 kg fish still reads larger than the character (4.6), and the giants sit
at 5.0 - the largest sprite the pond ever shows. `mega: true` marks the ten pond-monsters; ten
species between 80 kg and 1,800 kg carry it.

**Local-chat announcements.** A landed catch of a `mega` species, or of anything in the `secret`
pool, fires `opts.announce` from `finishReel` (not from the 📣 Show off button, so Auto fishing
announces too). The plaza sends `{type:'fishbrag'}`; `workers/social/room.mjs` validates the species
slug and weight (3 s cooldown, clamp raised from 999 to `MAX_FISH_W` = 5,000 so a 1.8 t show-off is
not truncated) and relays `{type:'fishnote'}` to everyone in the room. The plaza resolves the display
name from its own catalog and merges a `sys` Local line - rendered by `messageNode` as
`.social-line-sys`, a centred italic band rather than "Name: text". Solo play writes the same line
directly. `cleanChatMessage` only honours `sys` on the local channel.

**Auto-sell dupes actually persists.** The bug was never the rule engine. `index.html` rebuilt
`f.fishing.settings` as `{fish:true,sound:…}` on every save, silently dropping `autoSell` - the
toggle looked on for the session, then Sell dupes ran on a save that had it off. It is now
`autoSell:f.fishing.settings?.autoSell===true`.

**Interface pass.** The dock and window share one accent instead of two competing ones, the tools row
wraps into pills (`label:has(input:checked)` for the toggles), the tab bar and the index header are
sticky, the dock's status line ellipsises instead of growing, and the panel/dock pick up a blurred
backdrop so the plaza reads behind them.

**Checks.** `tools/tests/social_fishing_sim.js` covers the 100-entry catalog, the 25 body plans
(every `shape` must be one the renderer paints, at least twelve plans, at least two members per new
plan, fewer than half the catalog on the plain fish body), `MAX_W` = 1800, the mega count, the
show-off curve into the giants, the apex title tracking the catalog size, and Part D2: the leave-confirm
ids, Escape behaviour, the retried actions, the `stop` export, the announce hook, the `fishbrag`/
`fishnote` relay, the raised clamp and the system-line styling. `social_sim.js`, `update_watch_sim.js`
and the build/publish/page checks stay green.

## Friends (haven-v273)

Friendship is a relationship between two **accounts**, stored in its own D1 table
(`migrations/0012_friends.sql`, one row per pair, `state` is `pending` or `accepted`).
It is deliberately not part of the save blob: it has to survive a browser save being
replaced, restored or reset, and the row must exist even while neither player is online.

- `functions/_lib/friends.js` holds the rules (limits, the mutual-pair insert, the
  `requested / accepted / already-friends / already-asked / not-friends / unfriended /
  declined / cancelled` codes). `functions/api/friends.js` is `GET /api/friends`
  (friends, incoming, outgoing, `?who=<name>` for one lookup) and `POST /api/friends`
  (`request | accept | decline | cancel | remove`). Names are matched
  case-insensitively; a name is never interpolated into SQL.
- **Limits:** 100 friends and 50 outgoing requests per account. Asking someone who has
  already asked you accepts them instead of creating a mirrored request, and accepting
  is only possible for the addressee.
- **Missing table:** without migration 0012 the API answers `503 {installed:false}` and
  chat, saves and every other panel behave exactly as before.
- **In the game:** More destinations ▸ **Friends** (`assets/friends.js`,
  `assets/friends.css`) lists friends, requests received and requests sent, with an add
  box, Accept/Decline/Cancel/Unfriend, and a live "in the plaza now" dot. Any name in
  World or Whisper can be added from its name menu, which then reads
  `Friend ✓` (or `Accept friend request` when the request is theirs). Friends carry a
  `★` in chat lines. The dock shows a dot while a request is waiting, through the same
  `dot('friends')` the quest and skill badges use.
- **In the plaza:** `workers/social/room.mjs` keeps a bounded (200 id) set per
  connection and marks a player `friend:true` **per viewer** in the personal `player`
  event, so the same character is not described identically to everybody. The list is
  sent at connect (`friends:[…]`) and refreshed with `{type:'friends',ids:[…]}`;
  joining only ever adds a mark, and a live list may also drop one. The D1 row is the
  authority — the room copy is display only.
- **Tests:** `node tools/tests/friends_sim.js
node tools/tests/friends_ui_sim.js` (migration, auth, one-way request,
  addressee-only accept, limits, privacy, audit rows, save blob untouched, per-viewer
  plaza flags) and `node tools/tests/friends_ui_sim.js` (the panel in the real page:
  add box, accept, unfriend, the dock badge, adding from a chat name, and the
  sign-out wipe), plus the `social_*` suites for the chat marks and the name menu.

## Runtime and production configuration

- `functions/api/social.js`: same-origin authenticated WebSocket ingress.
- `workers/social/`: private Cloudflare Durable Object and transport-independent room.
- `assets/social-rules.js`: shared collision, pathfinding and speed.
- `assets/social{,-scene}.js` and `assets/social.css`: chat and native plaza view.
- `assets/social/`: local sitting components, emotions and town models.

**Production prerequisite:** deploy the new Worker before publishing Pages with
its `SOCIAL` binding. The Worker has no public workers.dev endpoint. Only Pages
passes authenticated identity to its Durable Object. No additional D1 migration
or secrets are needed. From an authorized Cloudflare deployment environment:

```sh
npx wrangler deploy --config workers/social/wrangler.toml
# Then publish the usual assembled Pages site with the root wrangler.toml binding.
```

No production deployment is performed by the feature tests. A missing binding
leaves the game playable and shows chat as unavailable. The latest 100 World
messages and unacknowledged per-account poker ledger events survive a Durable Object
restart in its existing SQLite storage; no new D1 migration is required. Deploy the Social Worker before the matching Pages
client so the leave guard, reconnect reservation and durable backlog are active.
This first service
uses one coordinating Durable Object for the world and numbered plazas, intended
for the current small community rather than an unbounded global population.

**Branch builds (v235).** Two settings decide whether a feature branch gets a
green *Workers Builds: prontera-social* check; production (`main`) is green either
way, so read both before debugging chat.

1. The service's build must run against **this** file. A bare
   `npx wrangler versions upload` in the repo root finds the Pages config there and
   fails instantly with *Missing entry-point to Worker script or to assets
   directory* — that is the red check on every PR. Set the Worker's root directory
   to `workers/social`, or give the non-production deploy command
   `npx wrangler versions upload --config workers/social/wrangler.toml`.
2. `preview_urls = true` and an empty `[previews]` block are set here because
   Cloudflare defaults preview URLs to *match* `workers_dev`, which is `false` for
   this Worker (it has no public ingress). Without them a branch build has no
   preview URL to publish. Previews expose nothing new: the script's default
   handler is a 404 and the Durable Object is reachable only through the Pages
   binding.

`tools/tests/social_config_sim.js` pins both files' agreement on the script name,
class, migration and those preview settings.

## Local preview and checks

Use Node 24 and the existing test dependencies; add `ws` for the local WebSocket
adapter and Wrangler for Cloudflare runtime checks. This repository has no package
manifest, so retain existing packages when installing optional dependencies:

```sh
npm install --no-save --package-lock=false jsdom three@0.128.0 ws wrangler playwright-core
bash tools/build_site.sh
node tools/dev_server.js --gm-all
```

Open http://localhost:8788/ and register disposable preview accounts. The server
uses the actual API handlers plus the same room core as production, with local
SQLite. Sign in explicitly after each reload, as required by the existing game.

```sh
node tools/tests/social_sim.js
node tools/tests/social_ui_sim.js
node tools/tests/social_scene_sim.js
node tools/tests/social_poker_sim.js
node tools/tests/social_table_chat_sim.js
node tools/tests/friends_sim.js
node tools/tests/social_api_sim.mjs
node tools/tests/social_config_sim.js
npx wrangler deploy --dry-run --config workers/social/wrangler.toml --outdir /tmp/social-worker-build
npx wrangler versions upload --config workers/social/wrangler.toml --dry-run
node tools/tests/social_worker_sim.mjs
node tools/check_social_browser.cjs
```

The browser check uses standalone software WebGL through the optional
`@sparticuz/chromium` package and two disposable accounts. It checks real native
standing/sitting pixels, all 32 emotion choices, transparent overhead animations,
close zoom/tilt/rotation/reset, names/titles below the feet, bench clicks/arrival,
chat pointer/keyboard resizing and integrated minimizing, centered desktop dock
alignment, phone bounds, refinement glows, music, channel delivery and reentry.
Shared Preview can verify DOM/Canvas controls with the documented renderer stub
when its Chromium cannot create WebGL; that does not certify rendered pixels.
It uses synthetic weak enemies for a bounded farming assertion; it is not a
balance or physical-phone performance test. `social_sim.js` checks 21 simultaneous
room clients and isolation/overflow; it is not a 20-browser FPS benchmark.

See [native source reproduction](../tools/social/README.md). Existing wardrobe,
UI/map, ownership, combat, API and publishing suites remain applicable.
