# Putting Prontera Grind on Cloudflare (phase 1: accounts + cloud saves)

The click-by-click. **Nothing here costs money** and none of it needs a credit card: the whole point
of choosing Cloudflare was that the free plan never expires, unlike the Render free database.

Time: about 10 minutes, most of it waiting for the first build. You do **not** need to install
anything — everything below can be done in the browser, with a command-line alternative at the end.

Two facts to hold on to while you do this:

* **The old site keeps working.** Nothing here touches `prontera-grind.onrender.com`; it keeps serving
  the v63 file from `dist/` exactly as it does now. Until you switch your players over, the new
  address is a private test.
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

In the D1 database page, open the **Console** tab, paste the contents of
`migrations/0001_init.sql`, and run it. It creates the eight tables the server uses (`users`,
`sessions`, `saves`, `save_history`, `messages`, `message_reads`, `grants`, `events`).

It is written with `CREATE TABLE IF NOT EXISTS` throughout, so running it twice is harmless — if you
are unsure whether it worked, run it again.

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

1. In `wrangler.toml`, replace `REPLACE_WITH_YOUR_D1_ID` with the UUID from step 1 and commit/push.
   (The name stays `pg`; the binding name stays `DB` — that one is load-bearing, every function asks
   for `env.DB`.)
2. Cloudflare rebuilds on the push. When it finishes, the deployment has the database.

Dashboard alternative, if you would rather not commit the id: **the same table can be added in the
project's Settings → Bindings → D1 database bindings** — but because the file exists, the dashboard
may show those fields as read-only. If it does, use the file. If you ever want the dashboard to own
the configuration, the documented way out is to delete `wrangler.toml` and deploy once more.

## 5. Check it, before telling anyone

Open the `*.pages.dev` address Cloudflare gives the project, and walk this list:

| Check | Expected |
|---|---|
| The login card | says **“☁ Cloud accounts are on — register or sign in…”** |
| Build tag at the bottom of the card | `2026-10-06 grind-v63 …` (if it says v61, you are looking at the old site) |
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

So the game now carries a save file instead (v63, on the login card):

1. On the **old** site (`prontera-grind.onrender.com`), click **⬇ Back up saves** and keep the
   `.json` file. It holds every character saved in that browser.
2. On the **new** site, click **⬆ Restore a backup**, pick the file, and confirm. The characters come
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

## If something goes wrong

| Symptom | Cause and fix |
|---|---|
| Login card does **not** show the cloud line, and `/api/me` returns an HTML 404 page | The functions did not deploy. Check that `functions/` is in the repo branch you connected, and that `dist/_routes.json` shipped (the build script fails loudly if it is missing). |
| `/api/*` returns 500 | Usually the database binding: the id in `wrangler.toml` is still the placeholder, or the binding name is not exactly `DB`. |
| A 500 mentioning `no such table` | The schema was not loaded into **this** database — redo step 2, and check you pasted into the right one. |
| Build fails with `MISSING: gm.html` | The build ran from the wrong directory. The project's root directory should be the repository root. |
| The dashboard will not let you edit the D1 binding | Expected: `wrangler.toml` is the source of truth. Edit the file (step 4). |
| A player's first login on the new site shows the two-saves chooser | They have progress on that device **and** a save in the account. That is the chooser working: **Keep this device** uploads what they were just playing, **Keep the cloud save** takes the account's copy, and either way the other copy is kept. |
| You want the old behaviour back | Delete `functions/` and `_routes.json` from the deploy, or just keep using the old address: the client detects the missing API and plays exactly as it did before. |

## Command-line alternative

If you prefer a terminal to the dashboard, the same five steps are:

```sh
npx wrangler login
npx wrangler d1 create pg                        # prints the database_id for wrangler.toml
npx wrangler d1 execute pg --remote --file=migrations/0001_init.sql
npx wrangler pages project create prontera-grind --production-branch main
npx wrangler pages deploy dist                   # a manual deploy; the Git connection is still better
```

Local development against a real Functions runtime (this is the official way; `tools/dev_server.js`
is the offline one that needs no account):

```sh
bash tools/build_site.sh
npx wrangler pages dev dist --d1 DB=<database_id>
```
