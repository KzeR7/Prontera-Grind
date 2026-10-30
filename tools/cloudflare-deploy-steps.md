# Putting Prontera Grind on Cloudflare (initial setup + v67 server-timed offline claims)

**Historical setup guide:** the current account security changes remain a draft and are not
launch-ready. For the existing live `pg`, the owner reported applying and verifying 0007
manually on 2026-10-28; do not rerun it or blindly run Wrangler migrations. Use
[Launch security](../docs/LAUNCH-SECURITY.md) for the current checklist.

The click-by-click. **Nothing here costs money** and none of it needs a credit card: the whole point
of choosing Cloudflare was that the free plan never expires, unlike the Render free database.

Time: about 10 minutes, most of it waiting for the first build. You do **not** need to install
anything — everything below can be done in the browser, with a command-line alternative at the end.

## Updating the existing Pages installation (v67 server-timed offline claims)

The repo already has a Pages/D1 setup (`wrangler.toml`, database binding `DB`, database name `pg`).
For this update, **do not create a second database or change its ID**. Pages does not apply SQL
migrations automatically. On the existing database, make sure v64's leaderboard schema is present,
then apply v67's server-offline claim schema before deploying the new Functions code:

```sh
npx wrangler d1 execute pg --remote --file=migrations/0002_leaderboard.sql
npx wrangler d1 execute pg --remote --file=migrations/0003_server_timed_offline_claims.sql
npx wrangler d1 execute pg --remote --file=migrations/0004_gm_gift_batches.sql
npx wrangler d1 execute pg --remote --file=migrations/0005_shop.sql
npx wrangler d1 execute pg --remote --file=migrations/0006_echo_leaderboard.sql
# 0007 was reported applied to the existing production pg; do not run it again.
# For a different database, inspect its schema and follow docs/LAUNCH-SECURITY.md.
```

**haven-v215 (Cash Shop):** `0005_shop.sql` can run before **or** after the v215 build is deployed —
until it has run, v215 behaves exactly like the previous build (no lock, no prices, every save
accepted; the Cash Shop tab says it is not switched on yet). Running it is the moment the lock
starts **and** the one-off grandfather step that keeps every cloud account's currently worn
accessories unlocked, so do it when you are ready for that. Turning payments on is a separate,
later job: `docs/MONETIZATION-SETUP.md` (§0 has the checklist).

Both migrations are additive and safe to rerun. Migration 0002 backfills all-time totals without
pretending old kills happened today or this week; 0003 adds only the persistent, one-pending-claim
ledger used by server timing. It does not rewrite player saves. In the dashboard, paste both files
into the existing `pg` database's Console in that order. Keep the weekly calendar starting Monday
and dates in Asia/Singapore in mind when checking the boards.

After the SQL succeeds, merging the PR to the connected production branch, `main`, automatically
starts the Pages production build/deploy. Wait for the Cloudflare Pages check/deployment to finish.
If you need to deploy manually instead, build and upload the production branch explicitly:

```sh
bash tools/build_site.sh
npx wrangler pages deploy dist --project-name horizonhaven --branch main
```

The Render site is deliberately kept as your backup; this update does not change or remove it.

Two facts to hold on to while you do this:

* **Render remains a deliberate backup.** Nothing here touches `prontera-grind.onrender.com` or
  changes its deployment. Keep it available as your fallback; it is not a problem that it may serve
  an older build.
* **Public registration never creates an owner.** Provision a verified owner account through the
  Cloudflare D1 dashboard as described in [Launch security](../docs/LAUNCH-SECURITY.md). Existing
  owner accounts retain their permissions; review them before opening registration.

---

## 1. Create the database (D1)

1. Sign in at <https://dash.cloudflare.com> (free signup, no card).
2. **Workers & Pages** → **D1 SQL database** → **Create Database**.
3. Name it `pg` — the `wrangler.toml` in this repo already expects that name.
4. Location hint: pick the region nearest your players (from Singapore, **APAC**).
5. Create it, then open it and copy the **Database ID** (a UUID) from the overview — you need it in
   step 4.

## 2. Load the schema into it

For a **new database only**, run `migrations/0001_init.sql` first. It creates the eight core tables
(`users`, `sessions`, `saves`, `save_history`, `messages`, `message_reads`, `grants`, `events`). Then
run `migrations/0002_leaderboard.sql` and `migrations/0003_server_timed_offline_claims.sql` in order.
The latter two are additive and safe to rerun. For the existing live installation, do not reinitialize
with 0001; apply 0002 and 0003 as described above.

## 3. Create the Pages project, connected to the repo

1. **Workers & Pages** → **Create** → **Pages** → **Connect to Git**.
2. Pick the `KzeR7/Prontera-Grind` repository and the **`main`** branch (merge the pull request
   first — the code being deployed has to be on that branch).
3. Framework preset: **None**.
4. **Build command:** `bash tools/build_site.sh`
   **Build output directory:** `dist`
   (the repository ships only `index.html`, `assets/` and the class sprites to the host — the tools,
   art sources and audit pages are deliberately left behind, which is what `tools/build_site.sh` and
   `tools/tests/publish_sim.js` enforce)
5. **Save and Deploy.** The first build takes a couple of minutes. It will succeed, but the game will
   not have a database yet — that is the next step.

## 4. Give the project the database

The repo ships a `wrangler.toml`, and Cloudflare treats that file as the **source of truth**: it is
what tells the deployment which D1 database to use, and the matching dashboard fields become
read-only. So the database id belongs in the file, not in the dashboard:

1. For a **new D1 database**, replace `database_id` in `wrangler.toml` with its UUID and commit/push.
   For the existing `pg` deployment, the file is already wired to the right database: leave the ID
   unchanged. (The name stays `pg`; the binding name stays `DB` — every function asks for `env.DB`.)
2. With Pages connected to GitHub, a push/merge to its production branch automatically rebuilds. The
   D1 binding is available to Functions when the build finishes; SQL migrations remain a separate,
   manual step.

Dashboard alternative, if you would rather not commit the id: **the same table can be added in the
project's Settings → Bindings → D1 database bindings** — but because the file exists, the dashboard
may show those fields as read-only. If it does, use the file. If you ever want the dashboard to own
the configuration, the documented way out is to delete `wrangler.toml` and deploy once more.

## 5. Check it, before telling anyone

Open the `*.pages.dev` address Cloudflare gives the project, and walk this list:

| Check | Expected |
|---|---|
| The login card | says **“☁ Cloud accounts are on — register or sign in…”** |
| Build tag at the bottom of the card | `2026-10-30 haven-v263 write pause` |
| Register your own name and email | a dialog with a **recovery code** — copy it somewhere safe; email is not verified yet |
| Play for a minute | the header badge goes `☁ …` → `☁ ✓` |
| The same address in a second browser | sign in with the same name and password → **the same character loads** |
| `/gm.html` | after deliberate D1 owner provisioning, the GM console lists players and shows **👑 owner** |
| `https://<your-site>/api/me` while signed out | `{"err":"Not logged in."}` with HTTP 401 — JSON, not an HTML page |

That second-browser line is the entire point of the shift: it is progress following the player
instead of the browser.

## 6. Bring your existing players over

This is the part that is easy to get wrong, so it is worth reading even if it sounds obvious: **the
new address is a different website as far as the browser is concerned**, and a browser's saved games
belong to the address, not to the game. Nothing can migrate them automatically.

The optional save-file bridge was added in v63. Use it only if the old client actually shows the
backup control; older builds may not. The Render site is deliberately retained as an older backup,
and this leaderboard update does not change it.

1. On a source address that shows **⬇ Back up saves**, export the `.json` file. It holds every
   character saved in that browser.
2. On the new site, click **⬆ Restore a backup**, pick the file, and confirm. The characters come
   back — same level, same gear, same Zeny.
3. Register with the **same account name** you used before. The game notices this device already has
   progress under that name and asks the account to adopt it, so the character becomes the cloud save
   rather than being thrown away or shadowing it.
4. From then on, every device that signs in gets that character.

A backup file only ever contains game saves and the browser's old account list. It cannot change
anything else on the machine (the browser-local GM marker included) — there is a test for exactly
that, because "load this file a stranger sent you" is otherwise a way to hand out GM rights.

## 7. Keeping it safe afterwards

* **Export the database now and then**: `npx wrangler d1 export pg --remote --output=pg-backup.sql`.
  D1 also offers point-in-time restore in the dashboard, but a file you hold is a file you hold.
* The GM console's **Backups** tab can put a player's own save back if a mistake is made — every
  restore first stores the current save as a version, so it is reversible.
* Free-plan ceilings, so you know when you would notice: 100,000 Function requests/day, 5 M D1 row
  reads/day, 100,000 D1 row writes/day, and static file serving is not billed at all. After the v82
  usage diet, 20 players playing 4 hours a day is roughly **7% of the request allowance and 5% of
  the writes** — and the GM console shows today's real numbers against both bars (§8).

## 8. Keeping it free: the usage card

The free plan does not send a bill when it fills up — D1 simply stops answering for the rest of the
UTC day once the daily write allowance is crossed. So the GM console now opens with a **Cloudflare
usage today** card (it is also refreshed by the ↻ Refresh button):

| What it shows | Where the number comes from |
|---|---|
| Function requests, D1 rows written, D1 rows read — each against its free allowance, with a bar | Cloudflare's own Analytics API, when the two values below are set |
| accounts, cloud saves, save storage (and the biggest save), backup-history size, live sessions, today's logins and GM actions | our own D1 tables — always available, costs one request |

To turn on the metered numbers, add two values to the Pages project:
**Workers & Pages → your project → Settings → Variables and Secrets**:

1. `CF_ACCOUNT_ID` — the account id (it is in the dashboard URL). A plain variable.
2. `CF_ANALYTICS_TOKEN` — **secret**. Create it at *My Profile → API Tokens → Create Token → Custom
   token* with a single permission: **Account → Account Analytics → Read**. Nothing else.
3. Optional: `CF_D1_ID` — set it to the `pg` database id (the UUID in `wrangler.toml`) to scope the
   D1 numbers to that one database instead of every database on the account.

Without the token the card still works: the meters say *not measured here* and a line tells you what
to set. With a wrong or expired token the card says why and keeps showing the ledger — it never
invents a number, and it never breaks the console.

**What the numbers should look like at this scale.** 20 players playing 4 hours a day cost roughly
**~6,700 Function requests and ~5,300 D1 rows written per day** — about 7% and 5% of the allowances —
and the game's own design work that down (v82 halved the writes twice over; see
`tools/server-shift-plan.md` §3b.1). If rows written ever climbs past ~50% on an ordinary day, the
first thing to look at is how many tabs are left open: each one syncs while hidden, just slowly.

**What is *not* metered, so you never have to think about it:** the 30 MB of game art, the sprites,
the town atlas and index.html itself. Static file requests are free and unlimited on every plan, so
"the download is big" is a player's data plan, never a bill. The card is the only place worth looking.

## Pages preview safety (local draft)

The root Pages `wrangler.toml` retains the current production D1 and `SOCIAL` bindings,
while `[env.preview]` deliberately supplies **no** D1 or Durable Object bindings. A new
branch preview using this configuration is intended for static/local-game review only;
cloud accounts, cloud saves, leaderboards and social cannot function there. Use the
separate synthetic staging project for cloud testing, not production data.

`python3 tools/tests/pages_preview_config_sim.py` checks the TOML and rejects changes to
this fail-closed policy. `tools/audits/pages_preview_wrangler_config.cjs` additionally
checks Wrangler's resolved configurations using an installed Wrangler (set
`PG_WRANGLER_MODULE` to its package directory if not installed locally). Wrangler may warn
about intentionally omitted preview bindings; never add production resources to silence it.

These local checks do not establish hosted isolation. Deployments created before the change
may still use production resources, and Pages preview configuration can affect multiple
branches. Verify actual deployment bindings and handle old previews separately. No code
push, deployment, production change, or old-preview deletion is implied by this draft.

## 9. World chat: the Fountain Plaza worker

World chat is the one part of the game that is not a Pages Function. It is a separate Worker with a
Durable Object (`workers/social/`), and Pages reaches it privately through the `SOCIAL` binding in the
root `wrangler.toml`. **Deploy the worker first, then publish Pages** — a Pages site whose binding
points at a worker that does not exist fails to deploy, and a worker that exists without the binding
leaves chat saying *unavailable* while the rest of the game plays normally.

In the dashboard (**Workers & Pages → Create → Worker**):

1. Name it **`prontera-social`** — exactly that. The root `wrangler.toml` binds it by that name
   (`script_name`), and `tools/tests/social_config_sim.js` fails if the two files disagree.
2. Connect it to this GitHub repository, production branch **`main`**.
3. In **Settings → Build**, check Production and Previews Base separately. For the
   configuration observed on 2026-10-29 use:

   | Setting | Production | Previews Base |
   |---|---|---|
   | Root directory | `workers/social` | `workers/social` |
   | Build command | empty | empty |
   | Deploy / Preview command | `npx wrangler deploy` | `npx wrangler preview` |

   The observed preview root was `/`, so Cloudflare's default `npx wrangler preview`
   read the root Pages `wrangler.toml`, proposed a D1 binding and failed for missing
   preview configuration. It did **not** use the Worker config. The owner showed
   Previews Base root `workers/social`, but a subsequent retry (`3e9cb973`) still ran
   from `/` and failed on the Pages config. The owner refreshed Previews Base and it
   still showed `workers/social`. The existing preview for
   `arena/a3bbb1f5-prontera-grind` has its own Builds configuration and its Root
   directory was still `/`. Change that branch preview's root to `workers/social`,
   save it and retry its failed Worker build; keep the Preview command as
   `npx wrangler preview`. The owner made this change and retry `470dfaf4` succeeded;
   GitHub reported `Workers Builds: prontera-social` as successful for PR #146 head
   `6a03cae`. This did not require changing production or adding a production D1
   database to Worker previews.

   An alternative when the preview root must stay `/` is `npx wrangler preview --config
   workers/social/wrangler.toml`. Cloudflare's older `versions upload` creates a Worker
   version URL rather than an isolated Preview and can share real resource bindings;
   don't use it as a shortcut without assessing those bindings. See
   [Workers Builds configuration](https://developers.cloudflare.com/workers/ci-cd/builds/configuration/)
   and [Preview resource isolation](https://developers.cloudflare.com/workers/previews/resources/).

4. Cloudflare applies changed build settings to the next build and to retried builds.
   A Worker preview retry does not promote it to production. Do not merge the PR or
   deploy production without the owner's separate approval. A successful Pages branch
   preview is a different deployment and must not be assumed isolated from production
   D1 or the production Durable Object: inspect its actual bindings before using it.

The Worker has no public route on purpose (`workers_dev = false`); its default handler
returns 404 and Pages uses the Durable Object through its binding. Local `wrangler deploy
--dry-run --config workers/social/wrangler.toml` and `wrangler versions upload --dry-run
--config workers/social/wrangler.toml` passed, but cannot prove the hosted retry or actual
Preview runtime. The current Worker uses an empty `[previews]` block; its default handler
does not use an `env` Durable Object binding, and Cloudflare documents automatic namespace
isolation for a Worker-defined Durable Object class in a Preview.

A failed branch Worker build does not by itself show that the deployed production chat
is down; check logs and the running service rather than assuming. Cloudflare Pages is a
separate build for the game. The owner-observed metrics listed 27 client disconnects,
zero Worker exceptions and zero CPU/memory-limit errors in the visible status breakdown;
32 total errors were shown, so not all errors are explained by that breakdown.

**If chat says "unavailable":** `503 Social service is not configured` in the browser's Network panel
means the Pages project has no `SOCIAL` binding; `401` means the player is not signed in; `403` means
the `Origin` did not match the page's own host. A green production build with a red branch build is
the preview setting above, not a chat fault.



The cloud owner is an account deliberately promoted by a trusted D1 administrator (`users.gm = 2`).
Public registration never grants that role. See [Launch security](../docs/LAUNCH-SECURITY.md). The
legacy local GM option below is browser-local and does not grant cloud GM API permissions.

**1. Right now, in the game, without touching the server.** The game has a local GM login that has
nothing to do with cloud accounts: type the username **`GM`** (exactly that) and the GM password on
the login card — GM tools come back even with the API on, because the GM branch is checked before the
cloud branch. If the password is the part you lost, set a new one **in your own browser**, so it never
goes into the repo:

```js
// open the game, then the browser console (F12), and run:
localStorage.setItem('pg_gm_local', gmHash('pick-something-you-remember'))
// from then on: username GM + that password. Undo with localStorage.removeItem('pg_gm_local')
```

That only unlocks GM tools in that one browser — it does not make your cloud account an owner.

**2. Promote a cloud account (the real fix).** Run this against the production database, replacing the
username with yours (it is case-insensitive):

```sh
npx wrangler d1 execute pg --remote --command "UPDATE users SET gm=2 WHERE username='YourName'"
```

Not sure what the account is actually called? List the candidates first:

```sh
npx wrangler d1 execute pg --remote --command "SELECT id, username, gm, created_at FROM users ORDER BY id LIMIT 10"
```

In the dashboard instead of the CLI: **Workers & Pages → D1 → `pg` → Console**, paste the same SQL,
Run. `gm` values are `0` player, `1` GM, `2` owner; `2` also lets you promote others from the GM
console, so you only need to do this once per database. If the *old* account is on a different
database (a rebuilt one), copy nothing — just promote the account you are using now.

**3. On a preview server.** Every preview is a throwaway process with an in-memory database, so the
account you registered last time is gone and the new one may not be the first. Start the preview so
that cannot happen again:

```sh
HOST=127.0.0.1 node tools/dev_server.js --gm-all  # local-only; every registration is an owner
HOST=127.0.0.1 node tools/dev_server.js --gm-all --db tools/.devdb/preview.sqlite   # ...and the database survives restarts
```

`--gm-all` is a preview-only switch, implemented in the local Node router. It grants
owner privileges to every preview registration. Never expose that preview to untrusted
users or use real accounts/data; the deployed registration handler ignores `DEV_GM_ALL`.

## If something goes wrong

| Symptom | Cause and fix |
|---|---|
| Login card does **not** show the cloud line, and `/api/me` returns an HTML 404 page | The functions did not deploy. Check that `functions/` is in the repo branch you connected, and that `dist/_routes.json` shipped (the build script fails loudly if it is missing). |
| `/api/*` returns 500 | Check the D1 binding in `wrangler.toml` (`DB` must point at the intended `pg` database). |
| `/api/board` says `no such table: leaderboard_kills` | Apply `migrations/0002_leaderboard.sql` to that same database. Pages builds do not run D1 migrations. |
| `/api/save` says `no such table: offline_reward_claims` | Apply `migrations/0003_server_timed_offline_claims.sql` to that same database, then reload the game. |
| Another 500 mentioning `no such table` | The initial schema was not loaded into this database — for a new installation, apply `0001_init.sql` first. |
| Build fails with `MISSING: gm.html` | The build ran from the wrong directory. The project's root directory should be the repository root. |
| The dashboard will not let you edit the D1 binding | Expected: `wrangler.toml` is the source of truth. Edit the file (step 4). |
| A player's first login on the new site shows the two-saves chooser | They have progress on that device **and** a save in the account. That is the chooser working: **Keep this device** uploads what they were just playing, **Keep the cloud save** takes the account's copy, and either way the other copy is kept. |
| Cloud sign-in is unavailable | The game keeps progress in this browser while offline; use the deliberately retained Render backup if you need to switch hosts. Do not delete the Pages Functions or D1 binding just to recover locally. |

## Command-line alternative

For the **existing** installation, the manual v67 update is:

```sh
npx wrangler login
npx wrangler d1 execute pg --remote --file=migrations/0002_leaderboard.sql
npx wrangler d1 execute pg --remote --file=migrations/0003_server_timed_offline_claims.sql
bash tools/build_site.sh
npx wrangler pages deploy dist --project-name horizonhaven --branch main
```

For a **brand-new** Pages project, first create `pg`, apply `0001_init.sql`, configure its database ID
in `wrangler.toml`, and create the Pages project with production branch `main`; then apply `0002` and
`0003` and build/deploy as above. A Git-connected project will deploy automatically after merges to `main`, so
the manual Pages command is only a fallback.

Local development against a real Functions runtime (this is the official way; `tools/dev_server.js`
is the offline one that needs no account):

```sh
bash tools/build_site.sh
npx wrangler pages dev dist --d1 DB=<database_id>
```
