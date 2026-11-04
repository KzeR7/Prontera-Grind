# Proposal — Auto announcer for World chat (2026-11-04)

> **Status: shipped in `haven-v324`** (same day) with the owner's picks: world tips,
> live community counts, individual spotlights with per-player cooldowns, level 99/150
> + refine +10/+15 + Echo-record + heavy-catch + big-pot milestones, and personal hints
> (bag %, grind time). Lore/rumour lines and the MOTD-on-connect were not chosen and are
> not built. The live copy lives in `assets/social-announcements.js` — edit that file,
> not this proposal. Architecture notes below remain accurate.

A random, timed announcer that drops lines into the **World chat tab**: some lines are
for everybody (tips, lore, community), some are about individual players (spotlights,
milestones), and some are personal lines only one player sees. The owner picks and edits
the line pools from this document; the build comes after.

---

## 1. How it can work (three options)

### Option A — Server-side scheduler in the Social Durable Object (recommended for World lines)

The Social DO already arms a **60-second alarm** whenever anyone is connected
(`workers/social/index.mjs`, `alarm()` → `room.sweep()`). Add a `maybeAnnounce(now)`
step to that sweep:

- Keep `nextAnnounceAt` on the room. When the clock passes it and `clients.size > 0`,
  pick a random line from the pool, broadcast it, and roll the next time with jitter
  (e.g. every **8–18 minutes**, configurable).
- Reset `nextAnnounceAt` when the room goes empty, so returning players don't get a
  burst of catch-up lines.
- The DO knows who is online (name, class, base level, hunt/fishing title, plaza,
  fishing/poker state from `cleanLook`), so **spotlight lines about real players need no
  new plumbing**.

Pros: one authoritative clock, everyone sees the same line at the same moment,
clients cannot spoof it (inbound message types are whitelisted, so an outbound-only
`announce` event is unspoofable by design). Cons: worker redeploy needed.

### Option B — Client-side timer (simplest, good for personal lines)

A timer inside the chat client (`assets/social.js`) that inserts a styled system line
into the World tab locally, exactly like the pond announcements already do with
`sys:true` local lines.

Pros: no worker change, can read the local save (`S`) so personal hints can quote real
numbers (your stat points, your bag fill, your Zeny). Cons: every browser rolls its own
schedule — players never see the same line together, so it feels less like a "live world".

### Option C — Hybrid (recommended overall)

- **Server (Option A)** owns: tips, lore, community stats, spotlights, welcome lines,
  milestone relays — anything the whole world should see.
- **Client (Option B)** owns: personal "only you" hints, because those want your real
  save data and can never leak another player's info.

---

## 2. The announcer persona

Lines need a speaker name so they don't look like a player typed them. Candidates:

- **Horizon Herald** — clean, matches the game name
- **Poring Post** — a newspaper run by Porings; cute and RO-flavoured
- **Town Crier** — classic Prontera flavour

The speaker would render with the existing system-line style
(`.social-line-sys`: teal left border, italic) plus optionally a new gold variant for
World announcements. Announcements get their own event so they are **not** written into
the 100-line world history (`cleanWorldHistory` stays strict) — they are ephemeral,
like real announcements should be.

Suggested event shape (outbound only, never accepted from clients):

```js
{type:'announce', id, at, kind:'tip'|'lore'|'community'|'spotlight'|'milestone'|'motd', body}
```

Client: `receive()` renders it in the World tab, lights the unread dot, and skips the
speech bubble (World never bubbles — already the rule). Optional per-account toggle in
Settings ▸ to silence them.

---

## 3. Line pools — the editable content

Placeholders in `{curly}` are filled by the server from data it already has:
`{name}` `{cls}` (class) `{lv}` (base level) `{title}` (hunt title) `{ftitle}`
(fishing title) `{plaza}` (plaza number) `{online}` (players online) `{players}`
(players in a plaza). A tiny formatter replaces them; unknown placeholders render
as-is so a typo can never crash chat.

### 3a. World tips (evergreen gameplay hints)

1. TIP: Your character keeps farming while you hang out in the Fountain Plaza. The grind never stops.
2. TIP: Bag full? Set up Auto-sell in EQUIPMENT ▸ Auto-sell and let the Zeny flow.
3. TIP: Loose cards can be socketed into gear at the Card workspace. Check the fit before buying sockets.
4. TIP: Mark your favourite equipment for refinement protection — peace of mind is cheap.
5. TIP: Unspent stat points do nothing. Spend them under CHARACTER.
6. TIP: Pets only come from monster drops. Farm the field that drops the pet you want.
7. TIP: Three pets can fight beside you. Swap them to match the field.
8. TIP: Endless Echo is a three-minute damage challenge. Your only rival is your own record.
9. TIP: Fourth jobs wait beyond the Ascension fields. The Astral Citadel is calling.
10. TIP: The Black Market takes Zeny you already have. Window-shop before you sell your drops.
11. TIP: Click a name in World chat to whisper, mute or add a friend.
12. TIP: Fishing in the Plaza earns Fishcoins — even while you AFK on a bench.
13. TIP: The Hold'em tables seat six per table. The buy-in is yours to defend.
14. TIP: Benches in the Plaza seat two side-by-side. /sit and make a friend.
15. TIP: Your Hunt title shows under your name in the Plaza. Wear it proudly.
16. TIP: Nightmare fields pay better — if your build can take the hits.
17. TIP: The Ascension Forge turns N+ equipment into Mythic set pieces.
18. TIP: Activity log filters keep your session history tidy. Find it in More.

### 3b. Lore / rumour flavour

1. Rumour: A golden Poring was spotted near the fields. Its drops are said to be legendary.
2. Rumour: The Black Market vendor always smiles when you overpay.
3. Did you know? Over a hundred fish species swim the Plaza ponds — a rare few come out prismatic.
4. Lore: The Astral Citadel floats because nobody ever told it about gravity.
5. Lore: Lunatics claim they invented the grind. Scholars strongly disagree.
6. Rumour: The fountain grants wishes, but only to adventurers who share their snacks.
7. Did you know? Every bench in the Plaza faces the fountain. The views were planned.

*(Rumour lines can later be wired to real events — e.g. an actual golden-mob spawn window
broadcasts its rumour for real.)*

### 3c. Community lines (live numbers)

1. {online} adventurers are online right now. Say hi in World!
2. Plaza {plaza} is buzzing — {players} adventurers around the fountain.
3. The ponds are lively tonight. Grab a rod and join the anglers.
4. Quiet fields, full plazas. Maps ▸ Social Hub is where everyone meets.

### 3d. Spotlights — individual players, everyone sees

1. 👏 Say hello to {name}, a {cls} who just arrived in Horizon Haven!
2. 🔍 Spotlight: {name} — Base {lv} {cls}, grinding hard right now!
3. 🎣 {name} is fishing in Plaza {plaza} under the "{ftitle}" title. Respect the rod.
4. 🏆 {name} is holding a seat at the Hold'em table in Plaza {plaza}. Nerves of steel.
5. ⭐ Keep an eye on {name} the {cls} — "{title}" suits them.
6. 👋 {name} just stepped into the Plaza. Wave hello!

Spotlight rules worth adopting:
- Only pick players who are **currently connected**; never the same player twice within
  one cooldown (e.g. 1–2 hours).
- Only ever use facts the server can see — never invent achievements a player doesn't have.

### 3e. Milestones — real events broadcast as they happen (phase 2)

These are *triggered*, not scheduled — the exciting kind of individual announcement.
Two possible paths:

- **Easy path (relay):** the client already detects these moments; it sends a
  `{type:'brag', kind, ...}` that the server rate-limits and relays. Same trust model as
  the existing `fishbrag` — it's flavour, not economy, so light validation is fine.
- **Accurate path (save-driven):** the Pages layer inspects each incoming save (it is
  already the authority), notices a level-up / rare card / record, and pokes the DO over
  the existing service binding to broadcast. Accurate but more work; good later.

Candidate milestone lines:

1. 🎉 {name} reached Base Level {lv}!
2. ⚔️ {name} has awakened as a {job}!
3. 🃏 {name} just pulled a {card} card!
4. 💀 {name} conquered the {field} Nightmare stage!
5. 📯 {name} scored {dmg} damage in Endless Echo — new personal best!
6. 🔨 {name} forged {piece} at the Ascension Forge!
7. 🐾 {name} befriended a {pet}!
8. 💰 {name} crossed {zeny} Zeny!
9. 🎣 {name} landed a {mut} {species} ({weight})! *(World-wide upgrade of the existing Local `fishbrag` for mega/secret catches)*
10. ♠️ {name} won {chips} chips at the Hold'em table!

### 3f. Personal hints — only that player sees them (client-side, phase 2)

Rendered as an italic system line, prefixed so it's clearly addressed to you:

1. You have {pts} unspent stat points. They're not going to spend themselves.
2. Your bag is {pct}% full. Auto-sell would like a word.
3. You haven't visited the Plaza today. Your bench misses you.
4. You've been grinding for {hours}h. Stretch, hydrate — the mobs will wait.
5. Your Zeny: {zeny}. The Black Market is open, as always.
6. A pet in your party has been resting a while. Rotate your lineup?

### 3g. MOTD on connect (phase 1.5)

The `hello` event could carry one `motd` line — an event banner or build highlight shown
once per session, e.g. "Welcome to Horizon Haven! Double EXP weekend is live until Sunday."
Pairs naturally with the existing GM Mail announcer (`gm.html` ▸ Announce), which stays
the tool for persistent, gift-bearing notices.

---

## 4. Cadence and anti-spam knobs

- **Base cadence:** one World announcement every 8–18 minutes (randomised), plus
  event-triggered milestones which don't count against the schedule.
- **Category weights:** tips ~40%, community ~20%, spotlight ~20%, lore ~15%, motd/event ~5%.
- **Minimum audience:** spotlight and community lines only fire when `clients.size >= 2`
  (no performing for an empty room); tips can fire solo.
- **Per-player fairness:** spotlight cooldown per account; milestone cooldown per
  account+kind (e.g. one level-up line per hour even if you level twice).
- **Player control:** a Settings ▸ toggle ("World announcements") and unread-dot respect;
  announcements never trigger sound.
- **History:** announcements are delivery-only — never stored in the DO's 100-line world
  history, never in the browser's 200-line cache, so they can't push player messages out.

---

## 5. Implementation map (when you're ready)

| Piece | Where |
| --- | --- |
| Line pools + placeholder formatter (owner-editable, single file) | new `assets/social-announcements.js`, imported by the worker like `social-rules.js` |
| Scheduler + spotlight picker + `announce` broadcast | `workers/social/room.mjs` (`maybeAnnounce` in `sweep()`, next-announce bookkeeping in constructor/connect/disconnect) |
| Client render (World tab, unread dot, system style, toggle) | `assets/social.js` (`receive()` + `messageNode()`), small CSS addition in `assets/social.css` for a gold variant |
| Personal hints (phase 2) | timer inside `assets/social.js` reading local save `S` |
| Milestone relays (phase 2) | client brag send + `room.mjs` inbound handler with rate limits |
| Tests | `social_worker_sim.mjs` / `social_sim.js` style: schedule firing, no-duplicate spotlight, announcement not persisted, client render |

**Suggested build order:** (1) scheduler + tips + community + spotlights (all server-side,
one worker deploy), (2) welcome + MOTD, (3) personal hints, (4) milestone relays.

---

## 6. Owner checklist — pick what you want

Mark any of these and the build follows your choices:

- [ ] Persona name: Horizon Herald / Poring Post / Town Crier / ____________
- [ ] Cadence: every ____–____ minutes
- [ ] Which pools to enable first: tips / lore / community / spotlights / personal / milestones / motd
- [ ] Which milestone events (if any) to include in the first build
- [ ] Edit any line above (cross out, rewrite, add — the pools are meant to be butchered)
- [ ] Player toggle in Settings: yes / no
- [ ] Gold announcement style vs. reuse the teal system style
