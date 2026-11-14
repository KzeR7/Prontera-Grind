# Horizon Haven — the GM panel plan

*Original plan written 2026-10-06 for BUILD `2026-10-06 grind-v61 local GM password + publish-only build`.*
*Companion to `tools/server-shift-plan.md`. The plan below is historical where it differs from the shipped implementation; see **Shipped in v101** and **Shipped in v373** at the end for the current behavior.*

---

## 1. What the owner asked for

> "a gm account & simple password I can log in when needed to test the game. also I would like to
> create a gm setting generator. in this generator I can choose to edit account password, their
> current stats — basically editing players' accounts. also option to mail them items or send
> announce and all. basically a build I can control the game."

Four capabilities, in plain terms:

1. **A GM login** I can use whenever I need to test.
2. **Edit a player's account** — password, stats, level, Zeny, class, their inventory.
3. **Mail players things** — items, Zeny, levels, compensation.
4. **Announce** — messages to everyone, and a way to reach one player.

**Original plan context (pre-cloud):** saves lived only in each player's localStorage, so the
server could not edit another player's account. The cloud migration has since shipped: current
account saves are synced to D1 and the cloud GM console exists. It is still unsafe for server code to
invent or hand-edit a client save; state changes use the receipt-protected client grant flow described
in §4 and **Shipped in v373** below. This plan's old phase-1 sequencing is history, not current setup guidance.

---

## 2. What already exists in the game

The `🛠️ GM Tools` tab (visible only when `S.gm` is true) remains the **single-player dev/testing
panel that only affects your own save in your own browser**. It is separate from the cloud GM console
in `gm.html`, which is authorized by the D1 GM role and session:

| Already there | What it does |
|---|---|
| GM multiplier | x1 / x10 / x100 / x1000 on EXP, Job EXP, Zeny, quests |
| Grants | +1,000,000 Zeny, +20 Oridecon & Elunium, +10 Base Levels, Max Job Lv, unlock all map levels |
| Mob Index controls | +1 kill all species, 1k/5k/50k per species, set title XP — for the mastery ladder |
| Card mastery controls | grant cards, max cards, roll every token, reset |
| Skill controls | max current line jobs, auto-allocate everything, reset line |
| Pet controls | grant every pet, set all pets G4/G6, build a maxed DPS/buff/utility pet |

That is already a good *single-player* GM toolset. What it cannot do is touch anyone else, and it
cannot do the three things the owner listed (edit accounts, mail, announce).

### Legacy offline GM credentials (not cloud authorization)

These notes are for the old local/dev path only. The cloud console trusts the authenticated D1
session's `users.gm` role; a browser `S.gm` flag does not authorize any cloud endpoint.

* `GM` + the hashed long password (the owner holds it), **or**
* `GM` + a **local password** stored in the GM's own browser:
  `localStorage.setItem('pg_gm_local', gmHash('test1234'))` — short and simple on purpose, never in
  the repo, invisible to other players. `localStorage.removeItem('pg_gm_local')` removes it.
* Still a client-side door: devtools can set `S.gm`. That is exactly what the server GM account fixes.

---

## 3. The vocabulary: Ragnarok's GM commands

Every private RO server ships an atcommand set (`@item`, `@zeny`, `@jobchange`, … — see the rAthena /
Hercules docs). Those names are the natural design vocabulary for this game, and players who know RO
will read them instantly. Mapping onto Horizon Haven's actual save fields:

| RO command | Horizon Haven equivalent | Touches (in the save) |
|---|---|---|
| `@who` / `@users` | online list, last sync, map+stage | server presence + `S.mp`,`S.lvl` |
| `@accinfo <name>` | account card: created, last login, save size, sync count, flags | `users`, `saves` |
| `@item <id> <n>` | mail an item into the bag | `S.inv[]` |
| `#item <name> <n>` (charcommand) | *same, but to another player* — the thing the owner wants | `S.inv[]` of the target |
| `@zeny <n>` | Zeny grant | `S.zeny` |
| `@baselevel` / `@joblvl` | set/grant Base Lv and Job Lv | `S.lv`,`S.exp`,`S.jobs{}` |
| `@statall` / `@str …` | set stats (respecting `MAXST` and `statCap()`) | `S.st{}`,`S.pts` |
| `@jobchange <job>` | class change (respecting the line rules) | `S.cls`,`S.base{}` |
| `@skpoint` / `@stpoint` | grant job/stat points | `S.pts`,`S.sk{}`,`S.jobs{}` |
| `@heal` / `@nuke` | set HP / knock a player out | `S.hp`,`S.kl` |
| `@broadcast` / `@kami` | server-wide announcement (yellow, no GM name) | a message channel, not the save |
| `@kick` / `@ban` / `@unban` | session + account moderation | `users.banned`, `sessions` |
| `@jail` | (this game has no jail — skip it; there is no PvP to spoil) |
| `@hide` | hide the GM from the online list / chat | presence only |
| `@speed` | the existing x1–x1000 multiplier, per account | `S.gmx` |
| `@save` | force a server-side save of a player | `saves` |
| `@recall` / `@warp` | (no shared world yet — meaningless until phase 3) | — |

Deliberately **not** in scope: anything that needs a shared world (`@recall`, `@warp`, PvP commands),
and anything that hands out *new* content — the house rules (AGENTS.md) say art and balance come from
the owner, so the panel ships values the game already understands, never invented items.

---

## 4. Two kinds of GM action, and why the split matters

This distinction decides the whole architecture:

* **A. Read / moderate** — ban, unban, force logout, see who is online, restore a save, change a
  password. These are **server-only**: they never touch the game simulation. Cheap, safe, buildable
  as soon as phase 1 exists.
* **B. Change a player's game state** — items, Zeny, levels, stats, class. These have to land
  *inside a save blob the client owns*, so they need a delivery mechanism (§5) and they must survive
  the client's own repair rules on load (`load()` in `index.html` clamps levels, drops malformed gear,
  trims overspent skill points — an injected value that violates those rules is silently repaired or
  discarded, which is a real trap).

### The delivery mechanisms, best first

1. **Pending grants applied by the client on login/sync (shipped).** The GM writes a row to the
   `grants` table (`user_id, kind, payload, note, created_by, created_at, claimed_at`). The server
   validates and queues the payload but never edits a save blob. For stateful deliveries, the client
   applies the grant, saves its matching `gmReceipts` ID, and the claim endpoint marks it delivered
   only after the saved receipt exists. A full bag or unsupported future save version remains
   pending instead of being silently overwritten. This works for offline players and keeps every
   grant subject to the game's own save-format rules.
2. **In-game mail with a claim button.** Nicer feel (a mailbox tab, "GM gift", expiry), but it needs
   a new UI tab, a claim endpoint, and a rule for what happens when the bag is full. Worth doing
   later, on top of (1) — the `grants` row is exactly what a mailbox item would be.
3. **Live push while online.** Requires the phase-2 poll/WebSocket; use it only for *messages*
   ("a GM is looking for you"), never for state changes, so nothing breaks when the player is offline.

**Announcements** are their own thing: a `messages` table with a target (`all` / one user), read at
login (banner) and delivered live through the phase-2 poll when online. "Announce" therefore works
from day one of phase 2, and is visible in the login banner even before that.

---

## 5. What I can build, in order

Each step is shippable on its own and leaves the game working. Effort assumes the phase-1 server
from the migration plan already exists.

| # | Step | What the owner gets | Effort | Needs |
|---|---|---|---|---|
| 1 | **GM role server-side** | `users.gm = 1`; the login response says `gm:true`; `S.gm` can no longer be forged in a save; the GM tab unlocks from the session, not a flag | 2–3 h | phase 1 |
| 2 | **`/gm` console (read + moderate)** | Who is online, last sync, save size, level/class, flags; ban/unban; force logout; reset a password; restore one of the 5 save backups | 4–6 h | 1 |
| 3 | **Account editor** | A form per player: Zeny, Base Lv, Job Lv, stats, Zeny, class change, HP, GM multiplier. Every field validated against the game's own caps (`MAXST`, `statCap()`, `BASECAP`) | 4–6 h | 2 |
| 4 | **Grants + mail** | "Send items/Zeny/levels to <player>"; client-applied `grants` with saved receipts; a GM-only history of what was sent and claimed | shipped | 2 |
| 5 | **Announcements** | Server-wide banner + per-player message; needs the phase-2 channel for live delivery | 2–3 h | phase 2 |
| 6 | **Audit log screen** | Every GM action with who/when/what/target, from the `events` table; "no GM action without an audit row" | 2 h | 2 |
| 7 | **Item picker** | Search the real drop tables for an item id instead of typing ids; copy an item's exact schema (`slot`,`wt`,`tier`,`aff`) from the game's own database | 3 h | 4 |

**Interim freebies I can add to the in-game GM tab without any server** (if the owner wants them
sooner): a "set my own stats/level/class" form, "+N of any item to my bag", and a "grant every card /
title" button. These are single-player-only by nature — useful for testing balance, not for
moderation.

### What I cannot do

* **Edit a player who has never logged in since phase 1.** Their save only exists in their browser;
  the server cannot reach it. The migration (§7 of the server plan) covers the ones who come back.
* **Make cheating impossible in a client-authoritative game.** A player can still edit their own
  save; the panel can *see* it (rate-of-change flags, §8 of the server plan) and revert it, but not
  prevent it. Anti-cheat needs server-side simulation — a rewrite, deliberately out of scope.
* **Hand out invented content.** New items, classes or maps come from the owner's design and art
  pipeline (AGENTS.md house rules). The panel grants what the game already knows.

---

## 6. The security model (non-negotiable)

1. **GM lives in the database only.** `users.gm = 1`, decided server-side, never a field in a save or
   a value the client can set. The existing `S.gm` flag becomes a *display* flag, refreshed from the
   session on every login.
2. **The panel is on the same origin, behind the session.** `/gm` (a page, or a tab added to the game
   only for `gm:true` sessions) calls `functions/api/gm/*`; every handler starts with the same
   `requireGm(session)` check. No separate admin app, no API keys in the client, no shared secret in
   a query string.
3. **Two roles.** `owner` (everything, including managing other GMs) and `gm` (moderation + grants,
   no password resets, no ban of other GMs). At 20 players one role would do, but the split costs
   nothing to define now and saves a rewrite later.
4. **Every action writes an audit row** (`events`: who, when, target, action, arguments). The panel
   shows the log. This protects the owner from their own mistakes as much as from abuse — "who set
   this player to Lv150?" should always have an answer.
5. **Destructive things are reversible or confirmed.** Password reset → the player can still get in
   with their recovery code. Save edits → the previous blob is already in `save_history`. Bans →
   `unban` exists and is one click. Nothing the panel does is silent.
6. **The GM password is set in the panel, hashed server-side** (PBKDF2, the §3c/§6 rules of the server
   plan) — and it can be *simple*, because it is no longer sitting in a public file for anyone to
   attack offline. That is the answer to the owner's "simple password" request: it becomes safe the
   moment it moves to the server.
7. **Rate-limit the panel** like the login (a handful of failed attempts, then lockout), and log
   failed GM attempts too — they are the interesting ones.

---

## 7. The build order that actually works

```
phase 1  accounts + cloud saves  ──►  the data exists
   │
   ├─ 1. GM role in D1 + gm:true in the session          (the account)
   ├─ 2. /gm console: read + moderate                    (the control panel)
   ├─ 3. account editor (validated against game caps)    (editing players)
   ├─ 4. grants table + "send to player"                 (mailing)
phase 2  presence / chat / poll   ──►
   └─ 5. announcements (banner + live)                   (announcing)
```

**Recommendation:** build phase 1 with steps 1–2 of this plan in the same pass (the GM role is a
column and a check; the console is one page), then steps 3–4 straight after. Steps 5–7 land with
phase 2. The owner gets a working "control the game" panel in the same week the accounts go live.

---

## 8. What the owner should decide

| Question | Consequence |
|---|---|
| Mail with a claim button, or grants applied silently at next login? | Claim feels like a gift and is copyable ("GM sent me this"); silent is less code and cannot be lost. **Recommendation: grants first, mailbox later on the same table.** |
| Should players be able to see the audit log? | No for the owner's private notes; maybe yes for a public "GM actions" feed if the community ever wants transparency. |
| One GM or two roles? | Two roles is free to define now (see §6.3). |
| Does a GM see players' passwords? | **No — never.** The panel can *reset* a password (and the player uses their recovery code), but the server stores only hashes. Worth stating out loud because every RO private server gets it wrong. |
| Should GM accounts appear on the leaderboard? | Recommendation: no — GM multiplier makes their numbers meaningless. Hide `gm:true` from the board. |

## Shipped in v101 — selection controls and whole-server gifts

* Full stats shows the latest cloud save, base stats, total stats and combat values reported by the game (including buffs at that time). Older saves need one save with v101 before combat values appear. Equipment includes refinement, affixes, sockets and card effects.
* Equipment & affixes selects existing equipped/bag items. Equip a compatible bag weapon or change up to three allowed affixes and refinement (0–10). Changes queue, recheck current ownership/class/bag space, preserve socketed cards, and wait while a paid reforge is unresolved. Failed changes stay pending in Backups.
* Send items & Zeny offers 562 catalog selections from actual game tables, name/category filtering, and quantities. Equipment/cards allow 1–100; materials 1–1,000,000. Equipment uses a fixed midpoint roll. Gift an item first, let it arrive, refresh the player, then equip it from their bag.
* Whole-server gifts include all non-suspended accounts present when submitted, including GMs and offline accounts. New accounts created afterward are excluded. Submission uses an idempotency key and a transaction; repeat requests return the existing recipient count. A confirmation shows the selected gift and quantity.
* New gifts and equipment changes are acknowledged only once their receipt is in a cloud save. Full bags retain waiting equipment gifts. The game remains client authoritative; snapshots are inspection data, not anti-cheat evidence.
* Before deploying Functions, apply `migrations/0004_gm_gift_batches.sql` through the normal D1 migration process. Locally `tools/dev_server.js` applies migrations once and keeps a ledger when `--db` is used.
* Regenerate the catalog after drop-table changes: `node tools/build_gm_catalog.cjs`; verify with `--check` (requires the documented jsdom and Three.js test dependencies).

## Shipped in haven-v373 — Fishing/DigiPet resources and manual MVP spawn

* **System resource grants:** `POST /api/gm/player` with `action: "systems"` validates a bounded
  catalog payload and queues a `systems` row plus audit event. Fishing supports Fishcoins (up to
  1,000,000,000), owned rod unlocks, and bait quantities (up to 999 per grant). DigiPet supports Pet
  Coins (up to 999,999) and Digi-Eggs (up to the 48-form starter pool); the client also checks the
  player's current unowned-species/egg capacity before applying. The route never calls `updateSave`
  or edits a `saves.blob`.
* **Delivery receipts:** `index.html` applies supported system payloads to the player's current save,
  appends the grant ID to `S.gmReceipts`, saves and pushes. `POST /api/grants` only claims a system
  grant if that ID appears in the stored receipt. Full pouches, full egg capacity, unavailable
  DigiPet code and future-version Pet Bags remain pending. First-time bag creation merges existing
  partner lines and progressed legacy partner records before it saves, so granting resources cannot
  erase legacy ownership/progress.
* **Safe console summary:** `functions/_lib/gm-tools.js` returns bounded Fishcoin/Pet Coin/egg counts,
  known owned rods, catalog bait counts, and DigiPet ownership/gear counts; it does not return private
  tokens, raw roster contents or unvalidated resource values. The player detail's **Fishing & DigiPet**
  tab uses that summary and queues grants with a per-action audit note.
* **Manual Fishing MVP:** the authenticated Pages route `GET/POST /api/gm/fishing` returns the catalog
  or sends a selected/random MVP and room (1–50) through the private `SOCIAL` binding to
  `/gm/fishing-mvp`. The Durable Object requires the internal GM identity, validates its own room and
  species lists, rejects a second active MVP in one room, broadcasts a ten-minute spawn and schedules
  expiry without replacing an active battle alarm. D1 records request and outcome events
  (`gm-fishing-mvp-request`, `gm-fishing-mvp`, or `gm-fishing-mvp-failed`). Pages and the Social Worker
  must be deployed from matching source for this control to function.
* **Affix offer clarity:** every changed reforge replacement displays the new roll's possible range,
  including different-stat replacements. Unchanged rows remain labeled unchanged.
* **Planning boundary:** the DigiPet Rift campaign is only in
  `docs/proposals/digipet-rift-campaign-proposal-2026-11-09.md`. No redesign gameplay, save migration,
  combat or map work is part of this release.

## Shipped 2026-11-14 — network (IP) bans, for the player who came back

The owner's brief: *"someone try hacking in my game, i banned him twice … i need an ip ban in my gm
console to remove these kind of players."* The account ban stops a NAME; this stops the ADDRESS.

* **`@ban` for a network:** `POST /api/gm/player` with `action: "ban-ip"` suspends every network
  fingerprint the account has signed in from and ends every live session on them, in one batch.
  `GET/POST /api/gm/ipbans` is the list behind the console's **Network bans** card: add (raw IP or
  fingerprint — the server hashes it; raw addresses are never stored) and remove.
* **Same-network detection:** the player's Account tab shows each fingerprint (source and ban
  state) and **"Also seen on these networks"** — the second account a cheater is signed in on, one
  click away. The player list marks current sessions on a suspended network with 🚫.
* **Enforcement:** every `/api` request from a suspended network is refused at the front door
  (`functions/api/_middleware.js`), plus explicit checks in login, register and recovery. The
  owner (`gm ≥ 2`) is exempt everywhere, so a mistaken ban is always undoable from this page.
  Migration `0014_ip_bans.sql` is required; every check fails open (feature off, site up) until
  it is applied. Full rationale and test coverage: docs/UPDATE-LOG.md, 2026-11-14 entry.

### Shipped 2026-11-14 — automatic save audit (0015)

The owner's follow-up: *"how i identify is the stats is over the limit, level to fast & alot of
materials which the account only made in 5mins. i cant be monitoring the game myself 24 hours."*

* **The server audits every accepted save** (`functions/_lib/save-audit.js`, hooked after the
  commit in `functions/api/save.js`, best-effort like the damage monitor): static impossibilities
  (stat/level/Zeny caps, the `pts + spent === points` invariant, refine ceilings, affix sanity)
  plus wall-clock rate limits since the previous sync (kills/levels/Zeny/materials per hour),
  with offline-claim kills and claimed GM grants credited back so gifts and away progress never
  flag their receiver. `gm ≥ 2` accounts are never audited (GM tools make impossible figures).
* **Flags are REVIEW-ONLY** — the save is always stored, nothing auto-bans. Rows live in
  `save_alerts` (migration 0015); the console gets the **Suspicious saves** card, a ⚠ player-list
  marker, and a **Save audit flags** block on the player's Damage tab. The first time a rule
  fires for an account the server logs a `save-alert` event and mails every owner account
  in-game, so a busy owner gets poked instead of watching 24/7.
