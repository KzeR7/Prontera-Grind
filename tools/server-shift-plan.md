# Prontera Grind — the client/server shift plan

*Written 2026-10-06 for BUILD `2026-10-06 grind-v59 deeper skill lines + a free pet skill`.*
*Nothing in this file changes the game — it is the plan the owner asked for: Render or
Cloudflare, how accounts and saves move to a server, and what to prepare.*

---

## 1. The verdict in one screen

**Move the game to Cloudflare (Pages for the client, Workers + D1 for the accounts and
saves). Do not build the server on Render's free tier.**

| | Render free (Hobby) | Cloudflare free |
|---|---|---|
| Static client (~10 MB a cold load) | 5 GB/month **workspace-wide**, then billed/suspended | **Unlimited** bandwidth and requests, no cold start |
| Always-on API | Sleeps after **15 min idle**, ~1 min to wake, 750 instance hours/month (= one 24/7 service, no margin) | Never sleeps, no cold start, 100,000 requests/day |
| Database that holds the accounts | Free Postgres **expires 30 days after creation** and is deleted 14 days later; free Key Value is in-memory and loses data | **D1: no expiry** — 5 GB, 5M row reads/day, 100,000 row writes/day |
| CPU per request (password hashing!) | Not the limit | **10 ms** on a plain Worker → hash inside a Durable Object (30 s) |
| Cost at 20 players | $0 only until the bandwidth or the hour pool runs out; realistically **$13/mo** ($7 web + $6 Postgres) | **$0**, with 3-4x headroom in every quota |
| First paid step | $7/mo web service + $6/mo database | **$5/mo** Workers Paid → 10M requests/mo, 30 s CPU, 500x the DB writes |

The one thing Render genuinely does better: a **long-running Node process with a real
WebSocket tick loop and in-memory world state**. Cloudflare makes you build that out of
Durable Objects and counts every message against the free request budget. If the game ever
becomes true real-time co-op, that is the trade; see §8 for what it actually costs.

---

## 2. What you have today (the facts this plan is built on)

From `index.html` and the docs, as of v59:

* **One file is the game.** `index.html`, 3,958 lines, ~396 KB, no build step, Three.js from a CDN.
* **The client already ships ~9.6 MB on a cold load**: `index.html` 0.4 MB +
  `assets/sprite_pack_data.js` 5.8 MB + the map kit 3.3 MB + the small data files. The player's own
  class animation (`Updates/Sprite/**.png`, ~200 KB) and the mob fallbacks load after that. Mob art
  otherwise comes from `static.divine-pride.net` — that is *their* bandwidth, not yours, but the
  9.6 MB is yours on every cache miss.
* **Accounts live in the browser only.** `pg_acc4` holds `{username: hashPw(password)}`;
  saves live in `pg_save3_<user>`. Anything cleared, a new device, a private window or a different
  browser = a new player.
* **`hashPw()` is not a password hash.** It is a 64-bit non-cryptographic mix (`Math.imul`), fast
  enough to brute-force trivially, and it sits in a file the whole world can read. Fine as a
  "don't peek at your friend's save" lock; **not** fine as the front door of a server account.
* **The GM password is in the client.** `GM_USER='GM', GM_PASS='gm1234'` (index.html:340) and a
  `S.gm` flag inside the save. The repo is public. Today that only spoils your own local game; with
  a server it becomes a real admin account. **This is the one thing worth fixing this week.**
* **Saving is chatty.** `save()` is called from 72 places plus `setInterval(save,5000)`. On a phone
  or a bad line that is invisible locally; over HTTP it is 12 writes a minute per player.
* **The game idles in the background already.** `simAdvance` replays real elapsed time in 0.1 s
  steps, capped at 10 minutes per wake, and the tab can be hidden forever — so "offline progress"
  is already a thing the game understands; it just has no server to agree with.
* **21 test suites** (`tools/tests/*_sim.js`) extract real code out of `index.html` **by string
  boundary**. Anything that moves a declaration can break a harness without breaking the game.

---

## 3. The free-tier maths, with your own numbers

### 3a. Bandwidth — the reason the client cannot stay on Render

Render's Hobby workspace includes **5 GB/month** of bandwidth for *all* services (static sites
included). Your cold load is ~9.6 MB:

```
5 GB / 9.6 MB ≈ 520 cold loads per month, for all 20 players combined
```

That is ~26 full reloads per player per month. Browser cache absorbs repeats, but phones evict
caches aggressively, a hard reload (`Ctrl+F5`) always bypasses it, and a cache-busting `?v=`
bump (which the repo uses: `assets/sprite_pack_data.js?v=1`) forces a fresh copy. Crossing the cap
means overage billing at ~$0.15/GB ($15 per 100 GB) or a suspended service. Cloudflare Pages
serves static files with **no bandwidth or request cap**, and its CDN caches them at the edge.

> **Check this before you decide anything else:** Render dashboard → your workspace → Usage/Billing →
> bandwidth for the last 30 days. If the needle is anywhere near 5 GB, the decision is already made.

### 3b. Requests and writes — what a 20-player server actually spends

Cloudflare's free allowance is **100,000 Worker requests/day** (resets 00:00 UTC) plus
**100,000 D1 row writes/day** and 5M row reads/day. D1 queries *hard-stop* for the rest of the
day once a cap is hit, so the sync policy has to be designed, not just hoped for.

| Workload | Naive (today's 5-second autosave) | Designed (dirty flag + 60 s debounce) |
|---|---|---|
| Save uploads, 20 players | 20 × 12/min × 1440 = **345,600/day** → 3.5x over the write cap | 20 × 1440 (24/7 worst case) = **28,800/day**; realistic 4 h/day each: **~4,800/day** |
| Logins, save downloads, leaderboard | ~200/day | ~200/day |
| Presence heartbeat (60 s while playing) | — | ~4,800/day |
| Chat, 500 messages/day fanned out to 20 | — | ~10,000/day |
| **Total requests** | over the cap on saves alone | **~20,000/day = 20% of the budget** |

Two conclusions:

1. **Debounce is mandatory.** The client keeps calling `save()` every 5 seconds (localStorage is
   free and instant); the *network* layer must only push when the save is dirty **and** at least
   30-60 s have passed, plus immediately when the tab is hidden. That one design choice is the
   difference between 20% and 350% of the free budget.
2. **A save row is one row written.** A blob per player (`saves.blob`) in D1 costs 1 write per
   sync, not one per column. Storage is trivial: 20 players × ~100 KB + 5 backups each ≈ 12 MB
   against a 5 GB allowance.

### 3c. CPU — the trap nobody mentions

A plain free Worker gets **10 ms of CPU per request**. Login has to hash a password. PBKDF2-SHA256
at a sane iteration count costs tens of milliseconds, so a naive `POST /api/login` handler will
start failing with "Worker exceeded CPU time limit" the moment you use a real hash.

Three honest ways out, all free:

* **Durable Object for auth** (recommended): DOs get **30 s CPU per request** on the free plan,
  with 100,000 requests/day and 13,000 GB-s/day of duration. Two requests per login is nothing.
  The same DO can hold the session and the presence flag, so it earns its keep twice.
* **Fewer iterations** (e.g. PBKDF2 25,000) + a 12-character minimum password. Cheaper to build,
  weaker; acceptable for a friends game, not something to hide from your players.
* **No password at all** — sign in with an OAuth provider (Cloudflare Access, GitHub, Discord).
  Zero hashing, zero reset flows, and it is the most secure option. It does mean a third-party
  login page, which is a different feel for a game like this.

Everything else the API does — parse a ~100 KB JSON blob, one D1 upsert — is 1-3 ms, comfortably
inside 10 ms.

### 3d. If you stayed on Render anyway

It can be made to work, and this is the shape:

* Static client on a Render static site (static sites never spin down — that part is good).
* A small Node/Express API on a free web service. It **sleeps after 15 minutes idle**, so the first
  login of the morning takes ~30-60 s, and any always-on ping loop eats the 750-hour pool
  (744 h = one service, 24/7, zero margin).
* **Accounts cannot live in Render's free Postgres** (30-day expiry → data deletion) and cannot
  live in the free Key Value (in-memory, wiped on restart). You would need an external free
  Postgres (Neon/Supabase) — a third platform to keep alive.
* Every one of those services shares the 5 GB/month bandwidth pool.

Verdict: strictly more moving parts, worse reliability, same $0 — until it isn't $0.

---

## 4. Why Cloudflare wins for *this* game

1. **The client is already a static site with no build step.** Pages serves the repo root as-is;
   `git push` stays the deploy. Nothing about the 21 test suites or the sprite pipeline changes.
2. **Bandwidth is free and unmetered**, and 9.6 MB per cold load is the single biggest cost on
   Render's free tier.
3. **No sleep.** An idle game whose players leave a tab open all day is exactly the workload that
   keeps a free Render service permanently awake (and out of instance hours).
4. **D1 does not expire.** Accounts, saves and backups live forever on the free plan.
5. **Same origin, no CORS.** `functions/api/*` on Pages is served from your game's own domain, so
   the session cookie is `httpOnly` + `SameSite=Lax` and there is no CORS preflight to get wrong.
6. **The escape hatch is $5, once.** Workers Paid (a single $5/month plan) multiplies every quota:
   10M requests, 30-second CPU, 500x the D1 writes. On Render the equivalent step is ~$13/month.

---

## 5. The architecture I recommend

```
                    ┌─────────────────────────────────────────────┐
   browser          │  Cloudflare Pages (your domain)             │
   index.html  ────►│  /                → index.html + assets     │
   (the game)       │  /api/*           → Pages Functions        │
                    └───────────┬─────────────────────────────────┘
                                │
                ┌───────────────┴───────────────┐
                ▼                               ▼
        ┌───────────────┐              ┌────────────────────┐
        │ D1 (SQLite)   │              │ AuthDO / PlayerDO  │   ← only where 10 ms is too
        │ users         │              │ PBKDF2 hashing     │     small, or where state must
        │ sessions      │              │ sessions, presence │     agree between requests
        │ saves + history│             │ offline progress   │
        │ leaderboard   │              └────────────────────┘
        └───────────────┘
```

**Phase 1 needs D1 only** (plus one small DO for hashing if you want strong password hashes on the
free plan). Durable Objects, chat and presence are Phase 2.

### 5a. The API surface (7 endpoints, all you need for phase 1)

| Method + path | Body | Answer |
|---|---|---|
| `POST /api/register` | `{u, p, recovery?}` | `201 {u, gm:false}` + session cookie |
| `POST /api/sessions` (login) | `{u, p}` | `200 {u, gm}` + session cookie, or `401 {err}` |
| `DELETE /api/sessions` (logout) | — | `204`, session row deleted |
| `GET /api/me` | — | `{u, gm}` (used to resume a session on reload) |
| `GET /api/save` | — | `200 {v, blob, savedAt}` or `204` if none |
| `PUT /api/save` | `{v, blob, savedAt, pub}` | `200 {v}` / `409 {v, blob, savedAt}` = server copy is newer |
| `GET /api/board` (phase 2) | — | top 50 by level/kills from the denormalised columns |

* **Session** = 32 random bytes, sent as a cookie (`pg_session`, httpOnly, Secure, SameSite=Lax,
  30-day rolling). Only its SHA-256 sits in D1, so a database leak is not a login leak.
* **`pub`** is a small whitelist the *server* stores for the leaderboard
  (`{lv, cls, kills, zeny, playtime}`) — never a free-form client object.
* **Rate limiting**: 5 failed logins per username and 20 per IP per 15 minutes (a counter row in
  D1 or the DO). Free Cloudflare DDoS protection sits in front of it, and **Turnstile** (free) on
  register stops bot signups.
* **Request body cap**: reject blobs over 512 KB (your real save is far smaller — measure it, §7).

### 5b. The database (draft `schema.sql`)

```sql
CREATE TABLE users(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL COLLATE NOCASE UNIQUE,     -- case-insensitive uniqueness, keeps display case
  pass_hash TEXT NOT NULL,                          -- pbkdf2-sha256$210000$<salt>$<hash>
  recovery_hash TEXT,                               -- optional one-time recovery code (§7e)
  gm INTEGER NOT NULL DEFAULT 0,                    -- the ONLY place GM is decided
  banned INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  last_login_at INTEGER
);
CREATE TABLE sessions(
  token_hash TEXT PRIMARY KEY,                      -- sha256 of the cookie value
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL,
  ua TEXT, ip_hash TEXT
);
CREATE TABLE saves(
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  version INTEGER NOT NULL DEFAULT 1,               -- optimistic concurrency
  blob TEXT NOT NULL,                               -- the whole S object, JSON
  saved_at INTEGER NOT NULL,                        -- the CLIENT's own timestamp (for LWW)
  updated_at INTEGER NOT NULL,                      -- the SERVER's timestamp (authoritative)
  last_seen INTEGER NOT NULL,                       -- server clock, for away progress
  kills_total INTEGER NOT NULL DEFAULT 0,           -- server-measured rate, see §8
  rate_kph REAL NOT NULL DEFAULT 0,
  level INTEGER, cls TEXT, zeny INTEGER,            -- denormalised, from pub
  playtime INTEGER, flagged INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE save_history(                          -- last 5 blobs: the "I lost my save" cure
  user_id INTEGER NOT NULL, version INTEGER NOT NULL, blob TEXT NOT NULL, saved_at INTEGER NOT NULL,
  PRIMARY KEY(user_id, version)
);
CREATE TABLE events(id INTEGER PRIMARY KEY AUTOINCREMENT, at INTEGER, user_id INTEGER, kind TEXT, detail TEXT);
```

Pick the D1 **primary region near your players** at creation (`wrangler d1 create pg --location=apac`
for South-East Asia) — it cannot be moved later. Reads are replicated globally; writes go to that
primary.

### 5c. The sync protocol on the client (the part that must not lose a save)

```
login ──► GET /api/save ─┬─ 204 + a local save exists ──► "Upload this device's progress?" ──► PUT
                         ├─ 200 ──► cloud wins; keep the local copy as a backup key for one session
                         └─ 200 + local is newer  ──► ask: Keep cloud / Keep this device

play  ──► save() writes localStorage instantly (never changes) and sets dirty = true
      ──► flusher, every 30 s: if dirty and >= 30 s since the last push ──► PUT /api/save
      ──► visibilitychange→hidden / pagehide ──► navigator.sendBeacon('/api/save', …)
      ──► server answers 409 (another device wrote later) ──► show the "two saves" dialog
```

Rules that keep players' progress safe:

* **localStorage stays the source of truth during a session.** The cloud is a vault, not the
  running state. If the API is down, the game keeps working exactly as it does today.
* **`version` is the concurrency check.** `PUT` carries the version the client last saw; the server
  only accepts it if it still matches, otherwise it returns `409` with its own copy and the client
  asks the player which to keep. Keep the loser in `save_history` so nothing is un-recoverable.
* **The `409` dialog is not optional.** Two tabs, a phone and a laptop, or a stale tab left open
  overnight are all normal for this game.
* **Never auto-resolve by "server always wins".** A stale server blob silently replacing an
  hour of grinding is the fastest way to lose a player.

---

## 6. Accounts, login and the GM hole

1. **Delete `GM_PASS` from `index.html` today.** It is in a public repo; rotate the password in the
   same commit. With server accounts, GM is `users.gm = 1` and the login response says `gm:true`.
   The client must never be the one deciding whether someone is a GM, and `S.gm` must not be a
   field a save can carry — a save can be edited, a session cannot.
2. **Server-side hashing**: PBKDF2-SHA256, 210,000 iterations, 16-byte random salt, constant-time
   compare (`crypto.subtle.timingSafeEqual`). Do it inside the auth Durable Object (§3c).
3. **Usernames become global and public** (leaderboard, chat). Keep the current rule
   (`/^[A-Za-z0-9_.-]{2,16}$/`), add a reserved list (`GM`, `admin`, `system`, …), and enforce it in
   D1 with a `COLLATE NOCASE UNIQUE` index rather than in the client.
4. **Password reset needs a decision, because you have no email addresses.** Options, best first:
   * **Recovery code at registration** — show a 12-character code once, store only its hash, let it
     reset the password. Free, no email service, works for a friends game. *Recommended.*
   * **GM reset** — you do it by hand from the GM panel. Simplest, and fine at 20 players, but it
     makes you the support desk.
   * Email later (Resend/Cloudflare Email Workers both have free tiers) — only when the player
     count makes manual resets annoying.
5. **Sessions must be revocable**: a "log out everywhere" button is one `DELETE FROM sessions
   WHERE user_id = ?`.

---

## 7. What to prepare — the checklist

### 7a. Decisions only you can make

| # | Decision | My recommendation |
|---|---|---|
| 1 | Client-authoritative (the browser simulates, the server stores) or server-authoritative (the server simulates)? | **Client-authoritative for phase 1.** Porting the 3,958-line sim to the Worker is a rewrite, not a shift. Revisit only if you add trading or PvP. |
| 2 | Can players keep playing with no internet / no account? | **Yes.** Local save + offline play stays as the fallback; the cloud is the vault. |
| 3 | What happens to progress when the tab is closed? | **Add server-measured away progress** (§8) — it is the single most "idle game" feature you are missing, and the server can bound it honestly. |
| 4 | Should the game split into `client/` and `server/` folders? | **Not yet.** Keep `index.html` where every test suite expects it and add `functions/api/*` beside it. A file-layout refactor is a separate, riskier job. |
| 5 | One account per person, or shared family devices? | Per person, with the "upload this device's progress" migration (§7c) so nobody loses what they already earned. |

### 7b. Repo prep (all small, none of it touches the game)

```
functions/
  api/register.js  api/sessions.js  api/me.js  api/save.js  api/board.js
  _lib/auth.js     _lib/db.js       _lib/validate.js
schema.sql            # §5b
migrations/0001_init.sql
wrangler.toml         # D1 binding, DO binding, routes
.assetsignore         # keep dev-only files out of the deploy (below)
tools/tests/api_sim.js  # house rule 6: a Worker handler with no test is not finished
```

* `.assetsignore` (or moving them) should keep `_login.html`, `_shot.html`, `logic2.js` and the four
  `_recon_v27*.png` (2 MB each) out of the deployed site — they are old snapshots and screenshots,
  not game files, and Pages has a 25 MB per-save limit to respect.
* Add `tools/tests/api_sim.js` to the "Verify before you push" block in `AGENTS.md`. It can drive the
  handlers against a fake D1 binding, the same way the existing suites drive real game functions.
* **Local development**: `npx wrangler dev` gives you Pages Functions + a local D1
  (`wrangler d1 execute pg --local --file=schema.sql`) on `127.0.0.1:8787`, and
  `python3 -m http.server 8000` must keep working with no API at all. Have the client detect the
  API (`fetch('/api/me')` → offline mode if it fails) rather than hard-code a URL.

### 7c. Migration for the ~20 existing players

* **On first register/login on a device that has a local save**, offer one button:
  "Upload this device's progress" → `PUT /api/save` with the local blob. This is the whole
  migration; nobody re-grinds.
* **Export/import codes**: a `base64(JSON.stringify(S))` string the player can copy out and paste
  back. Ten lines of client code, and it doubles as a support tool and a "save my game in a text
  file" feature players actually like.
* The server should run the *same* repair rules the client already has in `load()` (clamp levels,
  drop malformed records) before storing a blob, and refuse anything that fails hard. A migrated
  local save should be marked (`flagged = 1`) rather than rejected, so a cheated save cannot enter
  a leaderboard without deleting a legitimate one.

### 7d. Things to measure before writing code

```js
// in the game's devtools console, logged in, at a late-game state:
JSON.stringify(S).length          // real save size (my estimate: 30-150 KB with a full bag)
Object.keys(S.mobKills).length    // species tracked
performance.getEntriesByType('resource').reduce((a,e)=>a+(e.transferSize||0),0)  // real cold-load bytes
```

Plus, in dashboards: Render bandwidth for the last 30 days (§3a), and Cloudflare's
Workers/D1 usage graphs once the API is live. Put a self-imposed alert at **80%** of the daily
request and write allowances; D1 stops answering when it is crossed, and it will not tell you
politely.

### 7e. Ops and safety nets

* **Backups**: last 5 saves per player in `save_history`, plus a weekly GM-side export of `saves`
  (`wrangler d1 export`) stored outside Git. Free, and it is what saves you if a migration bug eats
  a blob.
* **A GM panel** (server-side GM only): who is online, last sync time, save sizes, flagged accounts,
  restore-a-save button.
* **Account deletion**: one endpoint that removes the user, their sessions, saves and history. It is
  a two-minute feature that answers the awkward question before it is asked.
* **Secrets**: `wrangler secret put` only. Never commit an API key, and remember the repo is
  public — that includes anything you paste into `index.html`.

---

## 8. The honest anti-cheat chapter

With the simulation in the browser, **any player can open devtools and set `S.zeny = 1e9`.** This
was already true locally; the difference is that now it happens next to other people's names on a
leaderboard.

What the server *can* do cheaply and should:

* **Validate the shape** (reuse the client's repair rules) and reject impossible values
  (`lv > 150`, `zeny < 0`, non-finite numbers).
* **Rate-of-change checks** against the *server's* clock: a save that gained 40 base levels or
  3 million Zeny in the 4 minutes since the last sync is not real → store it, flag the account,
  hide it from the board, tell the GM. Never delete a player's save on suspicion.
* **Measure the rate, do not ask for it.** The server already knows `kills_total` and `last_seen`.
  The earned-kills-per-hour it computes from *its own* two timestamps is the honest number, and the
  client cannot inflate it without actually playing. Use exactly that number for away progress:

```
awaySeconds = clamp(now - last_seen, 0, CAP)            // CAP: 4-8 h, your call
awayKills   = rate_kph / 3600 * awaySeconds * EFF       // EFF: 0.5-0.7 is a common idle-game feel
award       = exp and Zeny for awayKills kills, no gear  // decide the drop policy deliberately
```

The current client already caps one wake at 10 minutes of catch-up (`simAdvance`), so raise that
deliberately rather than by accident — the server's award and the client's cap should tell the same
story.

* **Do not build trading or PvP on top of a client-authoritative save.** That is the point where
  cheating stops being a leaderboard cosmetic and starts hurting other players. Those features
  require the sim to move server-side — a rewrite of the game, not a shift.
* **Keep the leaderboard labelled**: "self-reported" until the day the sim is authoritative. Your
  players will understand, and it keeps you honest.

---

## 9. Staged roadmap

| Phase | What | Effort | Unlocks |
|---|---|---|---|
| **0 — hygiene** | Rotate/remove the GM password from `index.html`; add `.assetsignore`; confirm the current Render bandwidth number | ~30 min | A public repo stops being an admin-password leak |
| **1 — accounts + cloud saves** | `functions/api/*`, D1 schema, session cookies, auth in a DO, debounced sync + 409 dialog, upload-this-device migration, export/import codes, `api_sim.js`, GM role server-side | 1-2 focused days | **The thing you asked for**: log in anywhere, progress follows |
| **2 — social + idle progress** | Presence (online list, 60 s heartbeat), world chat, leaderboard from the denormalised columns, server-measured away progress (§8) | ~1 day | An idle game that rewards leaving, and a reason to keep the tab alive with friends |
| **3 — real-time (only if you truly want it)** | Shared field: 1 Hz tick broadcast via one Durable Object, authoritative or semi-authoritative | Weeks, plus client render/net rewrite | Seeing each other move |

**What phase 3 really costs** (so nobody is surprised): free-tier WebSocket/DO messages are counted
per message and per fan-out. A 1 Hz tick with 20 players is ~20 inbound + 20×20 outbound per second
while they are online — ~30 million messages/day if everyone played all day, versus a 100,000/day
free allowance. Even at 20 players, always-on real-time co-op means **Workers Paid ($5/month)**,
and a careful design (1 Hz aggregate ticks, hibernation, play-hours only) to keep it near that
floor. Everything else in this plan stays free at this scale.

---

## 10. What I would do, in order

1. **This week**: read your Render bandwidth number; rotate the GM password out of the client;
   make sure `_login.html`, `_shot.html`, `logic2.js` and the `_recon_*.png` files are not deployed.
2. **Then**: stand up the Cloudflare side (Pages connected to the repo, D1 created in the region
   nearest your players) and build phase 1 behind a flag, so the game keeps working from
   localStorage until the API is proven by `api_sim.js`.
3. **Ship it as v60** with the login card showing a sync state (`Saved 2 m ago · Cloud` /
   `Offline`), the upload-this-device migration, and the two-saves dialog. Bump `BUILD`, append to
   `AGENTS.md`, run all 21 suites plus the new one.
4. **Watch the dashboards for a week** before phase 2. The daily numbers you see are the ones that
   decide whether the free tier holds at 20 players — and they will.
