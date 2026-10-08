# Putting Prontera Grind on Cloudflare (initial setup + v67 server-timed offline claims)

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
```

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
npx wrangler pages deploy dist --project-name prontera-grind --branch main
```

The Render site is deliberately kept as your backup; this update does not change or remove it.

Two facts to hold on to while you do this:

* **Render remains a deliberate backup.** Nothing here touches `prontera-grind.onrender.com` or
  changes its deployment. Keep it available as your fallback; it is not a problem that it may serve
  an older build.
* **You register the first account.** The first account created on the new site becomes the **owner**
  (GM level 2, the one who can reset passwords and hand out GM rights). Do that before you tell
  anyone the address, or one of your friends will become the owner.

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
| Build tag at the bottom of the card | `2026-10-08 grind-v79.6 claw slashes + v78.2 equipment progression` |
| Register your own name | a dialog with a **recovery code** — copy it somewhere safe, it is shown once |
| Play for a minute | the header badge goes `☁ …` → `☁ ✓` |
| The same address in a second browser | sign in with the same name and password → **the same character loads** |
| `/gm.html` | the GM console, listing players; your account shows as **👑 owner** |
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
  reads/day, 100,000 D1 row writes/day, and static file serving is not billed at all. At 20 players
  playing 4 hours a day the plan estimated roughly a quarter of the request allowance and under a
  tenth of the writes.

## If you lose the owner (GM) account

The owner is **the first account registered against that database** (`users.gm = 2`); every later
account is a normal player. There are three separate ways back in, in order of how fast they are:

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
node tools/dev_server.js --gm-all               # every account registered here is an owner
node tools/dev_server.js --gm-all --db tools/.devdb/preview.sqlite   # ...and the database survives restarts
```

`--gm-all` is a preview-only switch: **never** set `DEV_GM_ALL` on the Cloudflare project, because on
the real server the first-account rule is exactly what protects your owner account.

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
npx wrangler pages deploy dist --project-name prontera-grind --branch main
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
