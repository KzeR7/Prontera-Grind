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
becomes true real-time co-op, that is the trade; see §9 for what it actually costs.

### 1a. The dashboard reading, and why the verdict does not change

The owner's own Render usage page (2026-10-06) shows **52 MB of the 5 GB bandwidth** and
**0 of 750 instance hours** on one service. That removes bandwidth from the argument — at these
volumes Render's static hosting is fine, and even at 20 players the overage is cents (§3a). What is
left is simpler and stronger:

1. **Render has nowhere free to put the accounts.** The free Postgres **expires 30 days after
   creation** and is deleted 14 days later; the free Key Value is in-memory and loses everything on
   a restart. A server that forgets your progress every 30 days is worse than one that never had it.
   Cloudflare D1 does not expire.
2. **The free web service sleeps after 15 minutes and the 750-hour pool is exactly one 24/7
   service.** An idle game whose players leave tabs open and sync every minute is the workload that
   keeps a free service permanently awake — or wakes it, cold, for a minute at a time.
3. **Doing it in one step avoids a self-inflicted complication.** The game can legitimately stay on
   Render as a static site for now — and, as of the dashboard reading below, that is exactly what it
   is, so nothing is broken or at risk today. But the accounts/saves still need a durable free
   database, and if the client and the API end up on different domains you inherit CORS plus
   `SameSite=None` cookie rules that a same-origin setup never has to think about. Moving both to
   Cloudflare together avoids that for free.

**So the decision is not urgent, and it is not "Render is bad".** Stay on Render for the client as
long as you like. The migration only needs to happen when phase 1 starts, and it is a one-afternoon
job at that point (connect the repo to Cloudflare Pages, add `functions/api/*`, create D1).

So the verdict is unchanged, for a better reason than the one this plan originally led with:
**bandwidth is a cents problem; the missing free database is the real one.**

### Owner's decisions (locked 2026-10-06)

| Question | Answer |
|---|---|
| Scope of the first build | Phase 1 (accounts/cloud saves) is already live. The current explicit change is **the leaderboard only**: Daily, Weekly and All-time by kills, with Base Lv as the tie-breaker. Do not bundle the other Phase 2 features into this change. |
| Later Phase 2 preferences | If separately requested: away progress capped at **4 hours** and rewarded at **half rate**; show an **online count only** (no player list); put world chat in the existing Logs UI. A 15-second poll is near-live, not instant: messages may take up to about 15 seconds to appear. |
| Does the earlier 1 + 2 workload estimate fit the free tier? | §3d is an illustrative capacity estimate, not authorization to build that full scope. Real-time co-op is still **later**, not now. |
| Login style | **Username + password (server-hashed) with a one-time recovery code** shown at registration (§6.4). No email service needed. |
| Host | **Read from the dashboard (2026-10-06): 52 MB of 5 GB, 0 of 750 instance hours, 1 service.** Bandwidth is a cents risk, not the reason to move; the reason to move the server is that Render free has no durable database (§1a). The service *type* (static site vs web service) is still worth confirming (§3a) — it decides whether the client also moves in phase 1. |
| What to build now | The leaderboard is the only Phase 2 feature authorized in this change. Away progress, presence and world chat remain future work; their preferences are recorded above. |

---

### Existing cloud deployment and leaderboard status (checked 2026-10-06)

The production Pages site was serving build v63 with cloud accounts enabled; signed-out
`/api/me` returned the expected 401 JSON, and `/gm.html` loaded. The Render site was still serving
an older v59 build when checked; it is deliberately retained as the owner's backup and is not a
problem to fix. Phase 1 (accounts and cloud saves) is already in place. This branch adds the v64
leaderboard. **It is not deployed yet**: apply `migrations/0002_leaderboard.sql` to D1 database `pg`
separately, then merge to `main` for the Pages production deploy. Pages does not run migrations.
See `tools/cloudflare-deploy-steps.md` for the precise steps.

| Planned in §5a | Actually shipped | Note |
|---|---|---|
| `POST /api/register` | ✅ `functions/api/register.js` | first account registered becomes `gm=2` (owner), so no bootstrap secret lives in the repo |
| `POST/DELETE /api/sessions` | ✅ `functions/api/sessions.js` | 32-byte token, SHA-256 at rest, `HttpOnly; Secure; SameSite=Lax`, 30-day rolling; only an explicit logout revokes it early |
| `GET /api/me` | ✅ `functions/api/me.js` | also the client's *is there an API here?* probe (a static host answers HTML, which the client refuses to trust) |
| `GET/PUT /api/save` | ✅ `functions/api/save.js` | 512 KB cap, `409` echoes the server copy, `save_history` every 10th version (newest 5) |
| `GET /api/messages` + `POST` | ✅ `functions/api/messages.js` | announcements to all or one player, read state per recipient |
| (not planned) | ✅ `functions/api/grants.js` | GM gifts: queued server-side, applied by the player's own client (offline players are the normal case), claimed exactly once |
| `GET /api/board` (`daily`, `weekly` or `all`) | ✅ `functions/api/board.js` + the v64 UI | D1 counters/migration 0002, authenticated top 50; daily/weekly count only newly synced kills, and Base Lv breaks ties. Deploy only after applying the migration. |
| Turnstile on register | ❌ deliberately not | a CAPTCHA in front of a 20-player game the owner is testing would cost more than it saves; rate limits cover the bot case |

Also shipped, beyond §5a/§5b: the **GM console** (`gm.html` + `functions/api/gm/{players,player,log}.js`,
design in `tools/gm-panel-plan.md` §2–3: `@who`, `@accinfo`, `@item`, `@zeny`, `@baselevel`,
`@broadcast`, `@ban`, `@kick`, `@hide` vocabulary, audit row for every action) and `_routes.json`,
which keeps every non-`/api` request off the Functions invocation allowance.

Deliberate deviations from the draft, and why:

* **PBKDF2 at **20 000** iterations, not 210 000.** §3c's 10 ms CPU ceiling is the binding constraint,
  and 210 000 passes does not fit it by a factor of ten. The iteration count is stored *inside* the
  hash string (`pbkdf2$<iters>$<salt>$<hash>`), so raising it later upgrades accounts transparently on
  their next login.
* **`pub` is derived, not trusted.** The draft had the client sending a leaderboard whitelist; the
  server now re-derives `level/cls/kills/zeny/playtime` from the save blob on every write, so a
  tampered client cannot fake a ranking.
* **No Durable Object for hashing.** Measured at 20 000 iterations, PBKDF2-SHA256 costs ~7 ms, which
  fits the free plan's 10 ms, so phase 1 is D1 only and stays $0.
* **Heavy validation on the blob.** `checkSaveBlob`/`publicFields` clamp level ≤ 150, floor Zeny at 0,
  and reject non-objects: a hostile blob is stored, but it cannot poison the leaderboard.

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

### 3a. Bandwidth — measured, and *not* the reason to move

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

> **Answered 2026-10-06 — the owner's dashboard:** 52 MB of the 5 GB used this month
> (HTTP responses 52 MB, WebSocket 0 MB), **0 of 750 free instance hours**, **1 service**, 6 of 500
> pipeline minutes. Two things this tells us and one it does not:
>
> * **The bandwidth cap is not a today problem.** 52 MB is about five cold loads. Even at
>   20 players each doing one hard reload a day, the arithmetic above lands at ~5.8 GB/month, and
>   the overage is ~0.8 GB × $0.15 ≈ **13 cents a month**. Even at two cold loads a day it is about
>   a dollar. Render's bandwidth is therefore a *cents* risk, not the reason to move — see §1a.
> * **0 instance hours with 1 service is strong evidence the service is a Static Site.** Static
>   sites never consume instance hours; they also never sleep. If it were a *web service* that had
>   served 52 MB, it would have had to wake up to do it, and that time would show in this counter.
> * **What it does not tell us:** whether that one service is a static site or a web service
>   (0 hours could also mean a web service nobody has visited this month). To settle it: open the
>   service in the dashboard — the page header/badge says **Static Site** or **Web Service** — or
>   simply look at the URL you give players: `*.onrender.com` is Render, `*.pages.dev` is Cloudflare
>   Pages. **Answered by the URL (2026-10-06):** the game is at
>   `https://prontera-grind.onrender.com/`. With 0 instance hours and one service, that is a
>   **Render Static Site** — static sites never consume instance hours and never sleep, and Render's
>   static hosting is free and needs no card. **So the client can stay on Render indefinitely.** It is
>   only the *server* (accounts, saves) that Render cannot host for free (§1a).

> **What the 30-day expiry actually applies to.** The owner asked, reasonably, whether "Render is
> only free for a month" — the answer is **no for the site, yes for the database**. The game's static
> site does not expire, ever, at $0. The free **Postgres** expires 30 days after creation and is then
> deleted after a 14-day grace period, and the free Key Value store is in-memory (wiped on restart).
> Those two are the only pieces on a clock — and they are exactly the pieces accounts and saves need.
> Nothing about the current game is at risk on Render; the risk would start the day you build the
> backend there.

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

### 3d. Illustrative Phase 1 + 2 capacity estimate at 20 players

This is an earlier capacity estimate for a combined Phase 1 + 2 workload, not the current scope or
authorization to implement everything in the table. The explicitly authorized addition now is the
leaderboard. If later requested, Phase 2 preferences are: away progress capped at 4 hours and paid at
half rate, online count only (no player list), and world chat inside the existing Logs UI. A 15-second
poll is near-live, not instant; a message may take up to 15 seconds to appear. The estimate below
assumes each player is **online 4 hours a day** (the generous case for a browser idle game):

| Line item | Requests/day | D1 row writes/day |
|---|---|---|
| Save uploads (dirty flag, 60 s debounce) | 4,800 | 4,800 |
| Save-history snapshots (1 in 10 syncs) | — | 480 |
| Logins, session resume, save downloads, away-progress claim | ~300 | ~300 |
| Future online-count/chat/leaderboard poll (illustrative **one `/api/live` poll every 15 s**) | 19,200 | 0 (design estimate only; not implemented) |
| Chat messages kept in D1 history | — | ~500 |
| **Total** | **~24,300 = 24% of the 100,000/day allowance** | **~6,100 = 6% of the 100,000/day allowance** |

D1 row *reads* stay in the low hundreds of thousands against a 5M/day allowance, and storage is a
few tens of MB against 5 GB. In other words: **yes, phases 1 and 2 together are comfortably inside
the free tier at 20 players**, with roughly a 4x margin for bursts, retries and extra devices.

The three knobs that move that number, in order of size: the social poll interval (15 s → 30 s
halves the biggest line), the save-sync debounce (60 s → 120 s halves the second biggest), and how
many devices each player leaves logged in. Making chat and presence a **hibernating WebSocket**
instead of the poll is the phase-3 change and costs per message — which is exactly why the plan
puts a single `/api/live` endpoint in front of both, so the client's UI code does not change when
the transport does.

### 3e. If you stayed on Render anyway

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

### 5a. Core API surface (phase 1 + v64 leaderboard)

| Method + path | Body | Answer |
|---|---|---|
| `POST /api/register` | `{u, p}` | `201` + session cookie and a one-time recovery code |
| `POST /api/sessions` (login) | `{u, p}` | `200 {u, gm}` + session cookie, or `401 {err}` |
| `DELETE /api/sessions` (logout) | — | `204`, session row deleted |
| `GET /api/me` | — | `{u, gm}` (used to resume a session on reload) |
| `GET /api/save` | — | `200 {version, blob, savedAt, pending}`; `blob` is `null` if none |
| `PUT /api/save` | `{version, blob, savedAt}` | `200 {version}` / `409 {version, blob, savedAt}` = server copy is newer |
| `GET /api/board` (period: daily, weekly or all) | — | Authenticated top 50 by period kills, then current Base Lv; daily/weekly use newly synced kill gains |

Messages, grants and owner-only GM routes are listed in the status table above. **Leaderboard fields
are derived from the validated save on the server** (`level`, `cls`, `kills`, `zeny`, `playtime`); the
client cannot submit a separate `pub` object.
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

1. **✅ Done in v60 (2026-10-06).** The plaintext `GM_PASS` is gone from `index.html`: the file now
   carries only `GM_PASS_HASH`, a 20,001-pass salted hash, and the password itself was rotated (the
   old `gm1234` no longer works anywhere). `node tools/make_gm_hash.js` sets a new one and
   `tools/tests/gm_auth_sim.js` proves the tool and the game agree.
   This was worth doing immediately because the legacy page `_login.html` — which the Render site was
   still serving — contained the password **and auto-filled the login field**, i.e. the GM account was
   one guessed URL away. That page now carries no credentials, and the screenshot harness takes the
   password from the environment instead of the file.
   Still a client-side door: anyone with devtools can set `S.gm` by hand. **That limitation is exactly
   what server accounts fix** — with them, GM is `users.gm = 1` and the login response says `gm:true`.
   The client must never be the one deciding whether someone is a GM, and `S.gm` must not be a field a
   save can carry — a save can be edited, a session cannot.
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

### 7a. Decisions — the owner has made these (2026-10-06), so they are no longer open

| # | Decision | Answer |
|---|---|---|
| 1 | Client-authoritative (the browser simulates, the server stores) or server-authoritative (the server simulates)? | **Client-authoritative for now** — porting the 3,958-line sim to the Worker is a rewrite, not a shift. Revisit only if trading or PvP is ever added. |
| 2 | Can players keep playing with no internet / no account? | **Yes.** Local save + offline play stays as the fallback; the cloud is the vault. |
| 3 | What happens to progress when the tab is closed? | If separately requested later: server-measured away progress, capped at **4 hours** and rewarded at **half rate** (§8). It is not part of the current leaderboard change. |
| 4 | Should the game split into `client/` and `server/` folders? | **Not yet.** Keep `index.html` where every test suite expects it and add `functions/api/*` beside it. A file-layout refactor is a separate, riskier job. |
| 5 | Scope of the first build | Phase 1 (accounts + cloud saves) is live; the current explicit addition is only the leaderboard. Away progress, presence and world chat remain later work; real-time co-op remains later still. |
| 6 | Login style | **Username + password, server-hashed, plus a one-time recovery code** shown at registration (§6.4) — no email service needed, and a forgotten password is not a dead account. |
| 7 | What is built right now | Phase 1 is live on Pages; the v64 leaderboard code is built and tested on this branch, pending D1 migration 0002 and production deploy. |

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

* **Publish hygiene — solved by `tools/build_site.sh` (added 2026-10-06).** A static host publishes
  the **whole publish directory**, so pointing one at the repo root also publishes `_login.html`
  (which is exactly how the retired GM password was downloadable), `_shot.html`, `logic2.js`,
  `tools/` (11 MB), `Updates/`, `Sprite/` (1.9 MB) and the four 2 MB `_recon_v27*.png`. The script
  assembles **only what the game fetches at runtime** into `dist/`, and refuses to finish if a
  required file is missing or a dev file is present:

  ```sh
  bash tools/build_site.sh          # -> dist/ : index.html + assets/ + Updates/Sprite/ only
  ```

  Measured result: **16 MB, 175 files** (html 388 KB, assets 9.0 MB, class sprites 5.7 MB) versus
  ~37 MB for the whole repo, and every runtime URL verified served from `dist` while
  `/_login.html` returns 404. The three files the game reads at runtime are `index.html`, `assets/`
  and `Updates/Sprite/` (`assets/class_skins_data.js` points straight at the sprite PNGs) — nothing
  else on the site is fetched by a player.

  * **On Render (static site):** Settings → Build & Deploy → **Build Command** `bash tools/build_site.sh`,
    **Publish Directory** `dist`. Build Filters are *not* the answer — they decide whether a deploy
    runs at all, not what gets published.
  * **On Cloudflare Pages:** Build command `bash tools/build_site.sh`, Build output directory `dist`.
    Cloudflare applies an own convention too: a **`.assetsignore`** in the root of the output
    directory excludes files from being served. This repo carries one at its root (§7b.1) as a
    second line of defence, so even a project mis-pointed at the repo root cannot serve `tools/`,
    `Sprite/`, the legacy pages or the screenshots.
  * `dist/` is in `.gitignore` and is rebuilt by the host, so it is never committed.
  * **Enforced by a test:** `node tools/tests/publish_sim.js` runs the real build and fails if a
    required file is missing, if any `assets/` path `index.html` names is absent, if the class skins
    stopped shipping, if a dev file appears in the output, or if the tree grows past 30 MB. That is
    the answer to "how do I stop this happening again": the rule lives in a suite, not in a habit.

### 7b.1 Why the publish rules must be enforced by a test, not by memory

The failure this fixes was not a bug in the game — it was a *deployment* assumption nobody had
written down: "a static host publishes the whole publish directory". Three things now make it
impossible to forget, in increasing order of strength:

1. **One publish path.** `tools/build_site.sh` is the only thing that produces a site; the host's
   build command is that script, and the host's output directory is `dist/`. Publishing the repo root
   is no longer a configuration anyone can drift into by accident.
2. **A deny list in two places.** `.assetsignore` (Cloudflare's own convention) covers the case where
   the output directory *is* the repo root; `build_site.sh` refuses to finish if a dev file is in
   `dist/`. Neither path can serve `_login.html` any more.
3. **A test that runs the real build.** `tools/tests/publish_sim.js` (in the pre-push list, AGENTS.md)
   re-derives what the game needs *from the game itself* — the static `assets/` references in
   `index.html` and the `Updates/Sprite` path inside `assets/class_skins_data.js` — so a future change
   that adds a new asset directory fails a suite instead of 404-ing in a player's browser.

The general rule worth keeping: **anything that must be true about a deploy belongs in a test that
runs the deploy.** Documentation explains; a suite enforces.
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
awaySeconds = clamp(now - last_seen, 0, 4 hours)       // owner's chosen hard cap
awayKills   = rate_kph / 3600 * awaySeconds * 0.5       // owner's chosen half-rate reward
award       = exp and Zeny for awayKills kills, no gear  // do not award random drops offline
```

These are the recorded design choices, **not work included in the leaderboard change**. If away
progress is separately authorized, raise the current 10-minute client wake cap deliberately so the
server award and client catch-up tell the same story.

* **Do not build trading or PvP on top of a client-authoritative save.** That is the point where
  cheating stops being a leaderboard cosmetic and starts hurting other players. Those features
  require the sim to move server-side — a rewrite of the game, not a shift.
* **Keep the leaderboard labelled**: "self-reported" until the day the sim is authoritative. Your
  players will understand, and it keeps you honest.

---

## 9. Staged roadmap

| Phase | What | Effort | Status |
|---|---|---|---|
| **0 — hygiene** | Rotate/remove the GM password from `index.html`; add `.assetsignore`; confirm the current Render bandwidth number | ~30 min | **Do this first, before anything else** |
| **1 — accounts + cloud saves** | `functions/api/*`, D1 schema, session cookies, auth in a DO, debounced sync + 409 dialog, upload-this-device migration, export/import codes, recovery code, `api_sim.js`, GM role server-side | 1-2 focused days | **Chosen — first build** |
| **2 — social + idle progress** | Leaderboard (Daily/Weekly/All-time) from newly synced kills with Base Lv tie-break. Later, only if separately requested: away progress (4 h cap, half rate), online count only (no list), and world chat in the existing Logs UI (15 s polling; up to 15 s delay). | ~1 day | **Partial: leaderboard built for v64; remaining Phase 2 work is deferred and not included in this change.** |
| **3 — real-time (wanted, later)** | Shared field: 1 Hz tick broadcast via one Durable Object, authoritative or semi-authoritative; `/api/live` swaps from polling to a hibernating WebSocket without the client's UI code changing | Weeks, plus a client render/net rewrite | **Later, on purpose.** The endpoint shape in phase 2 exists so this does not mean a rewrite. |

**What phase 3 really costs** (so nobody is surprised): free-tier WebSocket/DO messages are counted
per message and per fan-out. A 1 Hz tick with 20 players is ~20 inbound + 20×20 outbound per second
while they are online — ~30 million messages/day if everyone played all day, versus a 100,000/day
free allowance. Even at 20 players, always-on real-time co-op means **Workers Paid ($5/month)**,
and a careful design (1 Hz aggregate ticks, hibernation, play-hours only) to keep it near that
floor. Everything else in this plan stays free at this scale.

---

## 10. Current next steps

1. **The Cloudflare deployment is already active** (checked 2026-10-06); Render remains deliberately
   available as a backup. Do not remove it or treat its older build as an incident.
2. For the v64 leaderboard, apply `migrations/0002_leaderboard.sql` to the existing D1 `pg` database,
   then merge the PR to `main`. The Git-connected Pages project deploys automatically; see
   `tools/cloudflare-deploy-steps.md` for the manual alternative and verification steps.
3. The only feature in this change is the leaderboard. Away progress, online count and world chat
   remain future work unless the owner asks to proceed; their selected rules are recorded above.
4. Real-time co-op/WebSockets remain a later, separate phase. A 15-second chat poll is near-live and
   may delay a new message by up to 15 seconds; do not describe it as instant chat.
