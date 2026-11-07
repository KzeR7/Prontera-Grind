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
that numbered plaza; no Local replay is sent to newcomers. The server keeps no Local
backlog: it clears on leaving/rejoining, and only your own tab remembers what it saw
(v326 below). Whispers are delivered only to sender and online recipient.

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

**Local chat survives a reconnect and a reload (v326).** The owner reported "random
disconnects, I lose local chat but world chat is fine". The most common trigger is the game
itself: the update watcher resets the page on a new build (v299 — inside 12 s of load, or
whenever the tab is hidden), which drops the plaza socket with a `1006` and reloads the page. The disconnects were the
symptom; the loss was the design. World has a per-account cache, but Local lived only
in a variable in the page, so anything that reloads or replaces the page - including the
game's own reload-on-new-build (v276), which is also what drops the socket - wiped it.
Local is now mirrored into **this tab's `sessionStorage`**, under
`pg_social_local_v1_<account>_<plaza>`, at most 60 lines per plaza, read back through the
same `mergeChatMessages` dedupe. That storage is per tab and per account: it dies with
the tab, is never shared with another tab or account, is never written to
`localStorage`, and is never sent to the server. Walking to another plaza, or leaving and
coming back to the same one in that tab, shows that plaza's own lines again; the server
still sends no Local replay, so newcomers see nothing they did not witness.

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

**Ten fishing titles, worn above the head (twenty since haven-v299).** `FISHING_TITLES` is a ladder from *Dockhand*
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

## Right-drag camera, left click walks (haven-v298)

The plaza camera took any pointer drag as an orbit, so a click that slipped a few pixels rotated the
view instead of walking - and a left drag did both nothing and everything at once. With a mouse the
left button is now walk-only:

* **left click** - walks (or sits / opens the pond / shows off, exactly as before). A left *drag* is a
  dead zone: it cancels the click so you do not walk by accident, but it never moves the camera.
* **right drag** - orbits and tilts, as before. The context menu stays suppressed.
* **ctrl + left drag** - orbits too, for trackpads and one-button mice (macOS sends ctrl+click there).
* **touch / pen** - single-finger drag still orbits, because there is no right button on a phone;
  pinch still zooms.
* The wheel still zooms and the Camera panel sliders are unchanged.

`startDrag()` in `assets/social-scene.js` records whether a gesture may orbit
(`orbit = touch || button===2 || (button===0 && ctrlKey)`), and `pointermove` only applies the
angle/pitch maths for those gestures. The in-plaza help line now reads
*"Right-drag (or ctrl-drag) to rotate / tilt · left-click to walk · Scroll / pinch to zoom"*.

`tools/tests/social_scene_sim.js` pins all four cases: a left drag leaves angle and pitch untouched,
a left click on open ground still walks, ctrl-drag orbits without walking, and a touch drag still
orbits.

## Twenty titles, rod auras, no doubled show-offs (haven-v299)

**Sitting no longer interrupts fishing.** v297 routed `toggleSit` through the new leave-confirm, which
contradicted v295's rule that sit/stand are allowed with a line in the water - pressing Sit (or Insert)
asked "Stop fishing and move?". Only actions that actually *walk the player away* ask now:
`moveAction`, `seatAction` (a bench), `pokerSeatAction` and Return to field. Sit and stand go straight
through, and the fishing session keeps running.

**Ten more fishing titles (20 total).** The first ten were reachable in an evening, so ten long-haul
titles now sit on top of them. They are derived from the same saved blob as the originals - no new
counter, so an older save can earn them the moment its numbers are high enough:

| Title | Ask | Tone |
| --- | --- | --- |
| Tide Regular | 1,000 casts | tide |
| Line Veteran | catch 250 fish | silver |
| Perfect Master | 100 perfect catches | sapphire |
| Species Archivist | discover 80 species | jade |
| Mutant Brood | keep 25 mutated fish | crimson |
| Leviathan Hook | record a 100 kg fish | amethyst |
| Colossus Hook | record a 300 kg fish | abyss |
| Pond Devotee | catch 150 of one species | ember |
| Secret Circle | a fish from all eight secret species | frost |
| Mega Hunter | catch 5 pond monsters | dawn |

Five tones were added to `TITLE_TONE` for them, and `fishTitleIds` in the page sanitizer lists all
twenty (a title worn on a save that predates this build survives the load).

**The rods have a visible aura.** The old sprite baked a single radial fill at .18-.4 alpha *behind* a
rod that covers most of it, so nothing read on screen. Each tier now has an `ROD_AURA` strength, a
two-stop bloom plus a shadow-blurred ring around the blank, and the markup carries
`data-rod-tier` so the CSS can add a tinted `drop-shadow` and a slow pulse on Golden and Mythril
(reduced-motion respected). The dock's 26px icon reads by tier too, not just the 64px shop art.

**A show-off draws once.** The local draw ran on the cast, and the worker's echo of the same catch ran
`showOffEvent` again, so the fish and its weight plate appeared twice, stacked. Two fixes: the plaza
ignores its own `showoff` echo (`m.from !== app.id`), and `showFish()` disposes any active show for
that angler before adding the new one - one fish and one plate per player, always.

## The rod you hold glows in its own colour (haven-v300)

v299 made the rod *icons* show their tier. The rod the character actually holds in the plaza was still a
plain brown `MeshBasicMaterial(0x7a5230)` - one geometry, one colour, for everybody.

**The tier travels with the rig.** The fishing module adds `rod` to the rig payload, the relay
(`workers/social/room.mjs`) validates it against a `FISH_RODS` allow-list (unknown or missing ids become
`twig`) and stores it on `c.fish`, so it rides both the broadcast and the ordinary snapshot. The page
therefore knows every angler's tier, not just their own.

**Three meshes per pole.** `makePole()` builds a tier-tinted core, an additive `depthWrite:false` sleeve
4.2x wider than the shaft, and an 8x haze at a fifth of the opacity so the light falls off instead of
ending on a hard edge. All three are scaled along the rod, so the glow follows the same pose as the
blank. The sleeve's opacity comes from the same ladder the icons use (`.22 + aura*.5`, so a twig sits at
.37 and mythril at .68), the colour is `ROD_TIER_COLORS` lifted 35% toward white, and Golden and Mythril
breathe at `sin(now/420)` - steady when `prefers-reduced-motion: reduce`. On a 1000x700 plaza view the
sleeve measures ~44 px across at the test camera, which is the difference between a stick and a glow.

**Three ways in.** `scene.fishing.rod(id)` repaints the local pole (called from `setPhase`, so starting a
session and equipping a rod both show up immediately), `setRig(pid,{rod})` paints another angler's pole
and repaints it in place when that angler swaps rods mid-session, and `dropRig` disposes all three meshes.
`hide()`/`off()` hide the whole group, so the glow never lingers after the line is reeled in.

## Every usable crop, and a bigger sea to put them in (haven-v302)

v301 cut 41 creatures out of five reference sheets. The owner then sent ten more sheets - a chibi-shark
grid, a turtle set, two reef-fish charts, a seahorse strip, a star-mantled octopus set, a shrimp strip,
two crystal-snail sheets and a whale sheet - and said the same thing the first time: these are usable,
add all of them, and if there is extra, grow the index rather than throwing it away.

**The cut, again.** `tools/fish_sprite_crops.js` now reads fourteen sheets and produces **304 creatures**
(the same border flood-fill, connected components, one-pixel feather and silhouette trim as v301). Two
things changed inside the tool: crops are hashed and de-duplicated, because two of the new uploads were
the same reef chart re-encoded and would otherwise have doubled their fish; and the per-sheet index
sheets are written for everything past the original ninety-seven, so each sheet can be checked against
the species it was mapped to.

**139 of 148 species now ship a real drawing.** Every species that had a silhouette worth matching was
re-pointed: the reef charts took the generic pond fish, the shark grid took every shark/ray/thresher/
goblin/sawfish slot, the turtle and seahorse sets became new species (below), the second snail sheet
turned out not to be reef fish at all, and the octopus set gave the kraken line a star-mantled cousin.

**Nine still paint themselves**: the crab, the gar/pike/snakehead/bowfin/walleye group (their long jaws
read better as a painter than as any crop) and the two anglers. The painter itself is unchanged from
v301, so those nine look like the rest of the pond.

**The index grew from 100 to 148 species.** The surplus creatures became six families in
`EXTRA_SPECIES` (same tuple shape as `SPECIES_DATA`, rarity in the last slot):

| family | members | rarity spread |
| --- | --- | --- |
| sea turtles (Green Shell, Glassback, Ember, Moonshell, Heartshell, Starhull) | 6 | uncommon → legendary |
| seahorses and seadragons (Tidepool, Thornback, Leafy, Sunspine, Ribbon, Ghost, Crowned, Tide Dragon) | 8 | common → legendary |
| crystal snails (Tide, Gem, Amber, Glass, Opal, Lava, Nebula, Prism) | 8 | common → mythical |
| shrimp and amphipods (Glass Krill, Candy, Lantern, Pepper, Royal Mantis, Void) | 6 | common → legendary |
| star octopuses (Star, Candy, Moon, Galaxy) | 4 | uncommon → mythical |
| sharks (Catshark … Greatmaw, Abyssal Sawshark, Voidfin) | 16 | common → mythical |

No new `secret` species were added on purpose, so the Secret Circle title still wants its eight. Apex
Angler already counts `SPECIES.length`, so it silently became a 148-species goal.

**Left on the floor, deliberately.** The whale sheet carries visible `mahoukaP` watermarks across its art,
and two of its nine crops are not creatures at all (a star blob and the artist's signature line). None of
it is shipped; the same applies to the Marine-Pokémon chart, which was never in the pipeline.

**Loading and mutations** are unchanged: `preloadFishArt()` still lands one `Image` per drawing and clears
the sprite cache as each arrives, `fishSprite()` still returns a canvas synchronously, and the baked halo
plus tint wash go under/over a crop exactly as in v301. `FISH_ART_VERSION` is `'302'`.

**Tests.** `social_fishing_sim.js` now asserts 148 species, eight secrets, 139 drawings against nine
painted, and it scales its "half the catalog is the plain fish body" bar to `SPECIES.length` instead of a
fixed 50 so the next art drop does not have to rewrite it. `publish_sim.js` moved the social-asset
ceiling from 10 to 12 MiB, with the measured numbers and the reason in the comment: the 139 sprites are
1.41 MiB and every one of them carries a soft sampled halo, which is why they will not palette-compress.

## Whales, honest prices, harder titles and an AFK walk that works (haven-v303)

Six things came out of one owner pass over the fishing window.

**The whale sheet is in.** Seven creatures (a pink dolphin, an orange orca, a violet beluga, two
whales and two sharks, all whale-sized in the index) became a seventh family, taking the catalog to
155 species and 146 cropped drawings. The sheet carries a faint `mahoukarP` logo stamped over every
creature. It is translucent art drawn *on* the body, so there is nothing to crop around: both
automatic removals that were tried damaged the drawing (a stroke scrub left the stamp half-there and
ringed the white spots; a full inpaint flattened the belly and ate the spot pattern), so the seven are
shipped as drawn. At the 32-64px the game renders, the mark is invisible. The sheet's two
non-creatures - a star blob and the artist's signature line - are rejected by the size filter.

**The art is 128px now, not 96.** "A bit blurry" was arithmetic: the detail panel draws 128 and the
index 64, and every source was 96, so both were an upscale. Crops now ship at 128 (1:1 in the panel,
an exact halving in the index) and every `drawImage` asks for high-quality resampling.

**The index is grouped by rarity.** It used to render `SPECIES` in construction order, which meant
everything added after the first art drop sat in one mixed-rarity block at the bottom - rare above
common above legendary. It now sorts by rarity (stable inside a rarity), so the list reads common →
secret.

**Prices read rarity, weight and mutation.** The old formula was
`rarity × (0.7 + 0.6 × heft) × mut`, so the *rarity base* dominated and a 40 kg common shark sold for
about 4 coins. Now:

```
price = ( RARITY_VALUE[rarity] × (0.6 + 0.8 × heft)  +  2.2 × weight^0.82 ) × mutationMult
```

That second term is absolute weight, and it is what makes a big fish worth carrying home whatever its
rarity: a 40 kg nurse shark is ~50 coins (was ~4), a 200 kg tiger shark ~250, a 900 kg stardust whale
~900, a prismatic one ~15,000. Small catches are unchanged in practice (a 0.7 kg minnow is 6).

**Twenty titles, harder, and four of them are not counters.** Every counter moved up 2.5-5x (Dockhand
10 → 25, Line Veteran 250 → 1,000, Tide Regular 1,000 → 5,000 casts, Colossus Hook 300 → 800 kg,
Mega Hunter 5 → one of every pond monster). Four titles now ask for a *shape* of save rather than a
number: **Full Creel** (500 fish in the bag at once, i.e. the top bag tier and a full one), **Armoury**
(all six rods), **Coin Hoard** (50,000 coins on hand) and **Dark Star** (a mythical or secret fish with
a Golden or Prismatic mutation). `fishTitleIds` in the page sanitizer was updated with the new ids.

**AFK fishing walks back for real.** The v296 walk-back went out through the plaza's normal move
action, which raises the "Stop fishing and move?" dialog for anyone with a line in the water - so a
respawned angler was asked a question instead of being walked, and (often still seated at the spawn
point) never moved. `bindFishing` now also exposes `walkTo`, the same path without the prompt, and the
fishing module uses it, re-issuing the walk every 2.5s while it is under way and only giving up after
30s instead of 9s. Sitting is not an obstacle: the move clears the seat on both sides.

## A two-week index, soft rod gates and a pond that looks like a pond (haven-v304/v305)

Six owner notes, one economy pass, then a correction pass on the luck.

**The index is a two-week climb, and money cannot shorten it.** The old weights gave a Secret every
~600 casts on the best rod, so 155/155 took an evening. The rarity table is now
`.60 / .245 / .1454 / .0083 / .00087 / .00035` - a Secret tier bite is about 1 in 2,900 casts on a
bare rod and ~1 in 800 on the best gear. Every species is a **plain uniform draw**: no pity, no
repeat protection, no "you have not caught this yet" nudge. The wall is the catch rate and luck.

**A rod is a ceiling, not a wall.** `rodCeiling()` says how far up the table a rod reaches - Training
Rod uncommon, Oak/Brass rare, Silver legendary, Golden mythical, Mythril secret - and a roll above it
is held back most of the time. But not always: `GATE_ESCAPE` is 8% for one tier above the ceiling and
0.35x of that for each tier beyond (2.8% / 1% / 0.34%), so a cheap rod *can* be surprised:

| rod | rare | legendary | mythical | secret |
| --- | --- | --- | --- | --- |
| Training | 1.2% | 1 in 4,300 | 1 in 100,000 | 1 in 830,000 |
| Oak | 15.4% | 1 in 1,500 | 1 in 50,000 | 1 in 290,000 |
| Golden | 14.5% | 0.83% | 0.12% | 1 in 36,000 |
| Mythril | 14.5% | 0.83% | 0.087% | 0.035% |

(At luck 0, per cast. The Index prints these numbers for whatever rod and bait you are holding.)

**Measured to 155/155** by simulating `rollCatch` (250 casts/h, 40% PERFECT, 31 runs, Mythril + Royal
Jelly): median **21,300 casts (~85 h)**, p90 **38,000 (~152 h)**, mean ~93 h - a real tail, because it
is a real coupon collector. Glow Grub - the money bait - is a median 27,300 (~109 h). Royal Jelly is
the rare-hunter bait: ~1.8x the boss bites for a couple of coins an hour less.

**The gear is cheap on purpose.** "I just want fishes hard to catch, not too much to farm on rods."
Rods are 300 / 1,000 / 3,000 / 8,000 / 20,000 and bags 600 / 1,400 / 3,000 / 6,500 - 43,800 for the
whole rack, about **2.3 hours** of steady fishing in the 250-casts/h model (it was 122,100 and 6.4 h in
the first v304 pass). Baits: Worm 4, Shrimp Tail 12, Glow Grub 30, Royal Jelly 55 (luck 1.5), all
net-positive from Oak up.

**The index prints the odds you actually roll.** Base weights are a bare-rod number, and at this
secret rate that reads "1 in 34,000" even while holding the rod that unlocks them. `rateWith()` and
`tierShares()` mirror `rollCatch` (luck exponent, the ceiling and its escape chance), and the Index
shows the odds for the rod and bait you are holding. Rows above your rod's ceiling still say which rod
lifts them, with the escape chance in the tooltip.

**The pond is the centrepiece.** Both ponds are 18x13 (was 14x10), with a procedural garden in the
same flat colours as the town - no new art, no new licence: a stone coping walked along the pond's own
rounded outline, an extruded arch bridge over the outflow, a low cascade of loose boulders with an
animated water sheet, stone lanterns, flowering trees and shore boulders. `R.POND_PROPS` holds every
position so the layout can be tested rather than eyeballed: `social_sim` proves no prop sits in the
water, on a chair or in a house, and that the rim is walkable all the way round.

**Titles are tidy, and the biggest fish fill the pond.** `renderTitles` sorts worn → earned →
locked-closest-first, every row has a progress bar (a `✓ req` on earned ones), and the name line and
button are fixed width so the column cannot jump. `showOffScale` is now
`min(11, 0.45 + 0.235 * sqrt(w))`: a 48 kg catch is 2.1 units, a 1.8 t whale shark is 10.4 - most of
the 18-unit pond.

**The shark line is the boss line.** The shark family was regraded a tier or two: goblin, tiger,
sun, great white, thresher, saw, mint and star whales are Mythical; porbeagle, bluefin, silvershark,
mako and grey whale are Legendary; Greatmaw and Voidfin are Secret. The 155-species split is now
36 / 34 / 30 / 25 / 20 / 10.

## The pond, painted (haven-v306)

The owner's verdict on the v304 pond was blunt: "water & pond have no texture... basically just slap
in a bridge and u call it done." He was right - it was a flat `0x2e7ea6` shape with two translucent
glint planes and a box curb. v306 rebuilds it out of art the game already shipped.

**Where the art came from.** No new download was needed: `assets/kit/ro-tiles-hd.png` (25 named 256px
terrain tiles) and `assets/kit/ro-spritesheet.png` (34 painted props with anchors) were already in the
repo for the world map. The social pond now crops them at runtime - `water_frame_0/1` (bright
caustics), `water_dark_0/1` (deep caustics), `limestone_pale` (coping and banks), `bridge_planks`,
`bridge_red`, plus the `tree_cherry`, `lantern_stone`, `rock_boulder_mossy`, `rock_cliff_crag`,
`tree_bush_bright` and `bamboo_grove` sprites. `paintPondArt()` repaints a pond in place once the
sheets arrive (about 8 MB, already cached by the map); until then the v304 primitives stand, so a
failed fetch degrades instead of breaking. Existing kit files only - the publish budget (59.0 of
59.5 MiB) does not move.

**The water is a shader, not a colour.** Following the usual stylised-water breakdown (layer the same
tile at odd scales scrolling in different directions so the repeat never lines up; pick the colour
from a depth mask; then draw foam from a shoreline mask), `WATER_FRAG` samples the two painted caustic
frames at 2.1x and 1.7x in opposite directions, uses their brightness as caustic density on an
art-directed teal gradient, adds a second faster sample for sun sparkle and a grazing-angle sheen, then
draws a wet lip and a breathing foam band. Because the pond is a `ShapeGeometry` of a rounded rectangle,
`position.xy` is already the shape, so the shore band uses an exact rounded-rect signed distance rather
than a fake rectangle gradient.

**The bank has height.** The flat sand ring is now an extruded stone coping (0.16 high, with a hole for
the water), so the pond sits *below* its rim and the coping casts a lip shadow over the water. The
cascade runs into a stone channel that passes under the bridge and spills over the coping into the
pond - the bridge finally spans water. The fall itself is a tinted double-sided sheet plus an additive
painted-water spray scrolling at a different rate, with painted crag and boulder sprites standing in
front of it instead of loose dodecahedrons.

**Details.** Painted blossom trees, stone lanterns, bamboo, shore boulders and a bush around each pond,
mirrored low-opacity sprites as reflections where a prop actually mirrors into the water, lily-pad
clusters in two greens with a few flowers, and the ambient fish still swimming over the top.

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
restart in its existing SQLite storage; no new D1 migration is required.

**A failed storage read no longer bricks the room (v326).** Before admitting a socket
the object loads the World backlog, the plaza resume records and every account's
unacknowledged poker outbox. If that last read failed, a flag answered **503 to every
connection for the rest of the object's life** - the client shows *"Chat unavailable,
retrying..."*, a reload does not help, and only a Durable Object eviction minutes later
clears it. Storage that was healthy a moment later could not get in. The ledger load is
now a retried method: a failure refuses only that one attempt, and the next connection
recovers. `tools/tests/social_room_recovery_sim.mjs` pins it (unit-level, fake storage);
`social_worker_sim.mjs` still rehearses the real runtime with miniflare. Deploy the Social Worker before the matching Pages
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

## Digimon Sanctuary foundation (haven-v326)

The east-pond lawn has two walk-through pads reserved for future training and an
arena. The east houses at (46, 56) and (27, 65) were removed in the **shared**
plaza rules; both ponds, bridge and fishing chairs remain. The toolbar's Digimon
selector is a free, changeable *presentation preview* of four companions, not
acquisition or ownership. The choice is saved separately as `digimonPartner`;
old saves need no migration, and the existing Ragnarok pets and field combat
are unchanged. Idle and walking use the Digimon Up frames, mirrored horizontally
for left/right. Walking frame rate follows the shared player speed; idle uses
50 ms per frame. There are no implemented care, training, evolution, battles,
rewards or Digimon attack actions yet.

The Social Room relays a whitelisted presentation ID in `look`; it is not a
server-verified entitlement. The browser can show the choice in solo mode, and
other room members can see it when both the client and updated Social Worker
are installed. The Worker and Pages client must be rolled out together because
they also share the changed collision layout; an old Worker drops the new look
field and still blocks the old houses. No release was performed by this change.
The versioned compact sprite pack is built by `tools/digimon/build_pack.py`; see
its README for provenance and regeneration. Run `node tools/tests/social_digimon_sim.js`
plus the social, fishing, scene and worker simulations when changing it.

## Sanctuary companion follow and window (haven-v327)

The Sanctuary toolbar button opens a dedicated companion window with animated
previews, a current-selection indicator and a dismiss control. The choices are
still free visual previews rather than owned Digimon; no care, battle or growth
rules have been added. The previous `digimonPartner` save field and Social Room
look relay are unchanged, as are Ragnarok pets.

Each viewer simulates a cosmetic follower along the interpolated player's recent
path. It waits behind, moves separately, follows turns and can continue catching
up when the player stops; its walking frame phase is based on distance traveled.
The shared walkability rules avoid ponds and buildings, with a safe reset on a
large position correction. This visual trail is not a server-owned battle actor;
viewers can see slightly different follower positions after reconnecting.

## Sanctuary care, evolution and solo practice (haven-v328)

The east lawn now has textured courts, gem pedestals, archways, planters and
stepping stones. Pedestal, arch and planter footprints are shared browser/room
navigation; ponds and fishing seats are unchanged. This is an initial art pass,
not the final high-detail arena. The Sanctuary window supports four separate
starter lines. Feeding and rest replenish fullness/reduce fatigue; a 15-second
training session awards one stat point (individual cap 12, total cap 24).
Sessions are saved and completed once when the Sanctuary window next updates;
there is no offline care decay or permanent loss. Four training points allow a
same-form mastery improvement; additional mastery requires four points each.

A player can explicitly confirm evolution after meeting the displayed training
and solo-spar-win requirements, or remain and build mastery. Evolution is not
reversible yet. Four lines through three further forms are included. The arena
window offers turn-based, no-stakes solo practice against local Digimon opponents
with Attack, Guard and Special; it is not an in-world real-time fight, ranked
PvP or a multiplayer duel. Results award only Sanctuary wins for evolution gates.
The actions, training deadlines and wins are **client-authored casual state**,
not competitive proof. `S.digimonSanctuary` is separate from `S.pets`, and old
preview selections migrate by simply starting with default Sanctuary progress.
Unknown future schema versions are not overwritten. Multiplayer viewers see the
chosen form through the whitelisted look hint; the Social Worker and client must
be deployed together because the obstacle layout and look whitelist changed.
See `assets/digimon-sanctuary.js`, `tools/digimon/README.md` and
`tools/tests/digimon_sanctuary_sim.js`. There is no online duel or ranked reward
settlement in this version.

## Owner-directed Sanctuary redesign (planning, 2026-11-05)

The owner rejected the v328 layout and window-based training/PvE presentation.
The desired replacement uses the whole east side for an on-map animated gym,
food/trainer/PvE NPCs, grassy auto-PvE mob/boss farm and boxing-ring PvP, while
the east pond becomes part of a larger west pond with a walkable long bridge.
This is a **roadmap, not yet implemented**. Begin with an owner-reviewed master
layout and preserve fishing, existing Social Hub functions, RO pets and field
combat. See [live-world redesign roadmap](proposals/digimon-sanctuary-world-redesign-roadmap.md).

A first **unapproved** layout board and its fit notes are available in
[Sanctuary master plan](proposals/digimon-sanctuary-master-plan.md); the
underlay is the existing v328 scene and its overlaid locations are proposals.


### Sanctuary layout foundation (haven-v329, incomplete)

The owner approved the master layout and added a south-shore waterfall. The
local build now has one larger west lake, an east–west bridge with shared
client/Worker deck navigation and elevation, relocated fishing chairs, a
south-bank cascade and initial east gym, grass field and boxing-ring scenery.
The structures are explicitly works in progress: they are not functional gym,
auto-PvE or PvP, the NPCs are not yet present, and the old window activity is
only a labeled temporary prototype. Saved fishing and Sanctuary data are kept.
`social_sim`, `social_digimon_sim`, `social_scene_sim` and `social_fishing_sim`
cover the changed layout, resume recovery and bridge.


### Lake correction (haven-v330)

The owner rejected v329's wide horizontal rectangle. The west lake is now a
north–south 34 × 46 gently irregular oval, wider and much longer than the
original pond. Eighteen sakura trees ring its banks, a brown arched bridge spans
the lake east–west, and the waterfall remains at the south. Shape-aware shared
walking, land/water clicking, fishing distance and cast points now follow the
curved shoreline. The nearby west house and southwest garden were removed for
space; the main roads, eight fishing seat IDs, poker and other gardens remain.
The image proposal is art direction, not a pixel-exact game screenshot; further
Sanctuary gameplay remains unfinished.


### Lake moved south and garden restored (haven-v331)

After the owner identified the displaced southwest tree and the overly oval
shore, the lake was moved farther south and widened to 38 × 46, with an
asymmetrical, softly scalloped outline. The original southwest garden and tree
are back, with clearance from the sakura. The long walkable bridge, 18 sakura,
eight fishing seats and southern waterfall moved with the lake. The ground,
north–south road and shared walkable bounds extend south; the east–west road
and old northern and x limits are unchanged. Fishing rigs beyond the old
southern boundary are relayed, and old invalid resume positions are rescued.
The illustration remains an art target rather than a pixel-exact recreation.
The east Sanctuary NPCs, live training, auto-PvE and authoritative PvP remain
unimplemented.


### Longer lake and connected bridge (haven-v332)

The west lake is longer to the south and shifted slightly west. Twenty-five
sakura line its banks; clearings keep the southern waterfall and bridge
approaches visible. The bridge has a higher arch. A paved stone approach joins
the central avenue to its east end, and a second paved path finishes at the west
end. Shared navigation and the ground extend farther south; fishing seats, the
restored southwest garden and tree, and other plaza facilities remain. The
east-side Sanctuary is still a work in progress.


### Sanctuary architecture and lake adjustment (haven-v333, incomplete)

The bridge now crosses the lake's center and the south waterfall sits at the
shore rather than in the pond. The east side has a cutaway timber gym with four
marked station areas, boardwalks, a gated grassy field, food and guide kiosk
structures, a trainer sign and an improved boxing ring precinct. Shared
navigation respects the new solid walls and field fences and their entrances.
These are preliminary world buildings and scenery; the NPCs, on-map training,
automated mobs and bosses and server-authoritative PvP are not implemented.

### Owner-corrected Sanctuary footprint (haven-v334, visual phase)

The v333 gym north of the east–west avenue was rejected. The rebuilt district
starts beside the southeast plaza garden: gym x 43–95 / z 12–39, then the
bevelled, gated meadow, then the ring farther south. Food, trainer and guide
structures occupy the strip between the north–south avenue and the winding
plank path. The gym has plaster-and-timber walls, gabled side wings, a cutaway
centre and four apparatus areas; the ring has a raised canvas and tiered seats.
Native trees/shrubs frame the east edge. The accepted lake is unchanged.

Shared client/Worker walk bounds now run x −74 to 102 and z −74 to 126; the
scene ground and east–west avenue extend east to suit. Gym walls, doors,
stands, kiosks, trees and each straight or diagonal meadow rail use shared
collision; the north, west and south gates stay open. Old blocked resumes are
recovered. The visible shops and exercise areas are scenery, not interactive
NPCs, live-world training, automated PvE or server-authoritative PvP.

### Detailed Sanctuary and visible staff (haven-v335)

The gym's two roofed back wings now join at a central gable/entrance, with
window frames, timber braces, doors, extra equipment and wooded foliage behind.
The service strip has more detailed stalls, awnings, shelves and lanterns.
Five named native-sprite NPCs can be clicked for short status dialogue, and
four animated Digimon sprites decorate the meadow. These residents are not
player-owned creatures or simulated encounters. NPC dialogue does not sell
items or start training; on-map training, automatic encounters and
server-authoritative PvP remain unimplemented. The accepted lake is unchanged.
Third-party CC0 material/tree credits and rebuild commands are documented in
`tools/digimon/cc0-materials/README.md`.

### Exposed framing and ring seating (haven-v336)

The gym perimeter has visible timber posts, rails, diagonal braces, framed
windows and shutters on both sides of the plaster, with roofed wings around an
open training court. The rear foliage uses upright planes to avoid crossing the
roof. The ring's two spectator stands use tiered planks, legs, bracing, guard
rails and a corner return; the canvas and rope corners also have extra detail.
These benches are scenery rather than usable seats. Power dummy attacks, Guard
receiving attacks, Agility running/jumping and a Focus animation are recorded as
future **on-map** training requirements, not implemented training.

### Reference-led gym rebuild (haven-v337)

The owner clarified that the approved illustration is the design target rather
than just a source of textures. The local gym now has two taller timber-framed
wings with gabled end bays, a central back entrance, pitched outer roof slopes
and an open-front exercise courtyard. Inward roof slopes are cut away for the
camera. The six flat backdrop trees have been replaced with native game trees;
their depth is reduced to keep foliage out of the gym and roof. The front
fence has a wide central opening and shared collision. This is an in-engine
interpretation awaiting visual review, not live training or a pixel-perfect
copy of the illustration.

### Angled gym wings and ring seating (haven-v338)

The previously collinear rear gym walls now angle inwards to a short entrance
bay. Their timber, plaster and broad outer roof sections rotate with the shared
wall segments; the full-depth native trees sit outside those walls. The central
courtyard remains open. The ring's decorative spectator stands are level plank
tiers with a mitred corner; they are not interactive seats. Both structures
remain visual approximations awaiting review, and on-map training is future work.

### Live gym first slice (haven-v339)

Select a Digimon in Sanctuary, walk near a gym station and use the nearby Train
button (the station labels are also clickable). The companion approaches and
performs a 15-second Power, Guard, Agility or Focus exercise on the map. Each
completed session adds one Sanctuary point, 10 fatigue and consumes 5 fullness;
the existing 12-per-stat/24-total and care gates apply. Moving, leaving, changing
partner/account, hiding the tab or cancelling interrupts without a gain. Previous
prototype timers still resolve under their original rules. Training animation is
currently local-view only, and the saved progress is casual and client-authored.
The food shop, live auto-PvE and authoritative PvP are not implemented; free
panel care and the old solo practice spar are still temporary prototype features.

### Automatic gym and partner slots (haven-v340; supersedes v339 above)

A signed-in player in a connected plaza can select either of two independent
Sanctuary partner slots, including the same species twice. The original slot and
its completed progress are retained. Each completed 20-minute gym cycle earns one
stat point and one XP; four XP earn a cosmetic prototype level. Fatigue, fullness,
per-stat and total caps still apply. Old uncompleted window timers are cancelled
on plaza entry; no new gym timer is persisted across reload or logout.

Start an activity near its station. Exactly one partner per player can occupy
the gym; the other remains independently selectable. The player can walk away,
return to the field or switch the active partner while training repeats. Stop
from the gym HUD or Sanctuary panel. A lost connection, changed account or
plaza switch stops the session; solo/offline plaza cannot start one. Three
positions per activity are reserved in the shared room and broadcast to observers;
when full, a station asks the next player to wait. Reservation acknowledgements
are request-scoped so an old reply cannot start a newer session. Stats and levels
are client-saved and not authoritative for competitive play. Live auto-PvE and
server-authoritative PvP remain unimplemented; the current food shop and Pet
Coin bag are described below. The old panel spar is a temporary solo feature
with an explicitly labeled local reward.

### Steady gym controls (v341)

When standing still in the gym, the follow camera stops drifting. Projected
station controls hold their screen position while hovered or pressed, and the
nearby and training-status controls have stable widths. Training rules and
reservation authority are unchanged. Physical touch-device review remains
recommended before integration.

### Owned collection, Pet Bag and Pet Coins (current Sanctuary foundation)

The Sanctuary no longer offers the full roster as an unrestricted preview. A
new or companion-less save receives one saved Mystery Digi-Egg and 50 Pet Coins
when the Sanctuary is entered. Hatching randomly selects one of the **48 bundled
Baby I/Baby II forms** (22 Baby I and 26 Baby II), saves the resulting owned
line and selects it in the active partner slot. Eggs are duplicate-protected;
additional Mystery Digi-Eggs cost 500 Pet Coins and cannot exceed the remaining
unowned starter pool. The owned collection is stored separately as
`S.digimonBag = {v:1, coins, food, eggs, owned}`. Existing current/progressed
lines from both partner slots are unioned into `owned` during migration, and
`S.digimonPartner`, `S.digimonPartner2`, `S.digimonSanctuary` and
`S.digimonSanctuary2` retain their progress. Unknown future bag versions are
refused without being overwritten.

The Partners view only lists owned lines. The Pet Bag shows eggs and Pet Meals;
Cook Lina's food cart now opens a working shop. A Pet Meal costs 25 Pet Coins
and a successful feed consumes one meal for +25 fullness. Rest remains the
existing casual recovery action. The first wallet grant and these prices are
Sanctuary-only implementation values, not Zeny or Ragnarok pet drops. Nothing
in this system reads from or writes to `S.pets`, field combat, Ragnarok pet
acquisition, Zeny, Fishcoins, Chips or Cash Shop purchases.

Gym sessions are now **20 minutes** per completed cycle. Each cycle still gives
one stat point and one XP, with four XP per cosmetic prototype level and the
existing 12-per-stat/24-total caps. The online reservation, cancellation and
one-active-partner rules are unchanged; gym progress is still client-saved and
not competitive proof.

The temporary solo practice spar is explicitly client-authored and grants 20
Pet Coins on a win, once when the win is recorded. It is not server-authoritative
PvP and closing a result cannot pay twice. It remains separate from the live
field and ring below.

### Live field grinding and two-player ring PvP (haven-v344)

The middle Sanctuary field is now an online, room-driven grinding activity.
Walk into the field with an owned partner selected and use **Start auto-grinding**
(or the Partners view button). The four decorative residents roam while the
field is idle, disappear while a run is active, and return when the last run
ends. The selected Digimon receives its own world sprite and fights a group of
three random bots. Every bot is drawn from the roster's exact same stage as the
partner (Baby I, Baby II, Rookie, Champion, Ultimate, Mega, Mega+ or Armor;
unlisted stages use their matching unlisted pool). When the whole group faints,
the next group spawns after a short telegraph. A run stops on request, defeat,
or the existing hunger/fatigue limits. Wave rewards are server-issued events:
Pet Coins, XP and one win, with small fullness/fatigue costs. They are applied
once to the original owned line and do not touch Zeny, Ragnarok pets, Fishcoins,
Chips or Cash Shop inventory.

**Solo plaza local practice (v345):** a local character without a cloud room can
use the same middle-field control and shared combat simulation. The HUD says
`SOLO · AUTO-GRINDING`; wave rewards use distinct `solo-pve:` IDs and are saved
locally rather than described as server-issued. Leaving, changing account/state,
or connecting online stops the local run. Gym stations likewise work in Solo
plaza with a `local solo` countdown and the usual care limits; no equipment
reservation is needed for the single local character. These paths exist so the
activities are testable without an account connection. Two-player PvP still
requires an online room, and the nearby ring control says `Online PvP only`.

The boxing ring supports two distinct online players. Stand on opposite left/
right sides at the ring edges or the open approach below the southern stands,
then enter. Same-side players wait rather than being paired. Each player gets
an acceptance dialog; one acceptance is not enough. After both accept, the
room places the two Digimon on the raised canvas and broadcasts a three-second
countdown, then runs automatic combat with no attack command packets. The
result is settled by the Social Worker, not by a client-reported winner. Both
participants receive an animated WIN, LOSE or DRAW result and server-selected
Pet Coin/XP/win rewards (winner, loser and draw amounts differ). Decline,
cancellation, disconnect and forfeit clean up the match; a disconnect during
active combat forfeits to the remaining participant.

`assets/digimon-battle.js` is the shared deterministic simulation used by the
browser-facing protocol tests and `workers/social/room.mjs`. The room owns
random rolls, timers, wave/match ids and settlement. Client loadouts are
normalized and clamped before combat; the existing Sanctuary save remains a
casual, client-saved collection rather than ranked/competitive proof. The
server never accepts a client `battle_result`, damage total or reward amount.
The local solo spar is still explicitly not authoritative PvP.

**Matching Worker recovery (v346):** online start requests now count as pending
activities, preventing duplicate clicks while the client waits. If neither a
snapshot nor an error arrives within ten seconds, the client clears the pending
intent, restores the controls and explains that the preview may need its
matching Social Worker. Leaving or dropping the socket also clears the intent.
This is important during preview/staging review: an older Worker can accept the
socket but ignore unknown `pve_start` / `pvp_enter` packets. The client must not
invent a local online battle or remain stuck on `Entering the middle field…`;
deploy the coordinated client and Worker for online combat.

Run `node tools/tests/digimon_battle_sim.js` and
`node tools/tests/sanctuary_battle_sim.js` for combat/protocol coverage, plus
`node tools/tests/digimon_sanctuary_sim.js`,
`node tools/tests/digimon_sanctuary_ui_sim.js`, `social_ui_sim.js` and
`social_scene_sim.js` for the existing collection and integration contracts.
`tools/tests/social_worker_sim.mjs` also loads the battle module in the real
local Durable Object runtime. The browser rehearsal uses two isolated clients
and checks movement, waves, acceptance, countdown, results and reward dedupe.
