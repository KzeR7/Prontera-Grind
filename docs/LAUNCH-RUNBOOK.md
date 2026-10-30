# Launch runbook — the four remaining steps

> Written 2026-10-30 for the `haven-v263` candidate on branch
> `arena/4fe1beea-prontera-grind` (PR #147). Every step below is **owner-run on the
> Windows machine**: this repository has no credentials, and an agent must not touch
> production. Run them in this order. Do not skip step 1, and do not merge the PR
> before step 2 has passed — merging to `main` deploys production automatically.

Expected repo location: `%USERPROFILE%\Desktop\Prontera-Grind` (the migration tool
requires exactly that path). Backups go to `%USERPROFILE%\Desktop\HH Save`.

## Preconditions

```powershell
node --version      # 22.5+ (node:sqlite is used by the backup and migration tools)
npx wrangler whoami # the account that owns the prontera-grind Pages project
cd $HOME\Desktop\Prontera-Grind

# The tools were added to main on 2026-10-30 (3d3147f, 4083e9b). An older clone
# simply does not have them, and node reports MODULE_NOT_FOUND. Fetch first:
git fetch origin
git pull --ff-only
Test-Path tools\staging\live_backup_preflight.mjs   # must print True
Test-Path tools\staging\live_additive_migrations.mjs # must print True

# The migration tool reads the four files out of the pinned commit, not off disk,
# and compares two commits (not the worktree), so a dirty tree does not stop it.
# These refs must resolve locally after the fetch:
git cat-file -e 9335e56665a2e076b9316205eff332d2483e05f2^{commit}
git rev-parse --verify origin/arena/a3bbb1f5-prontera-grind
```

If `git pull --ff-only` refuses, your clone has uncommitted work. On 2026-10-30 the
owner's Desktop clone was at `haven-v143`, roughly 119 builds behind `main`, with local
edits to `index.html`; the pull is then ~2,490 files and Aborting on that file. Keep the
edits, do not throw them away:

```powershell
git status --short
git diff --stat -- index.html     # how much you would be setting aside
git stash push -m "local index.html before launch pull" -- index.html
git pull --ff-only                # now fast-forwards to main
Test-Path tools\staging\live_backup_preflight.mjs
git stash list                    # the old edits stay recoverable here
```

`git stash` keeps those edits; `git checkout -- index.html` and `git reset --hard` do
not. Do not force-reset the repository to get past this. Replaying a very old stash onto
the new `index.html` will conflict heavily — save it for reference, not for reuse.

Local preflights that were already run for this candidate and pass: `bash tools/build_site.sh`
builds (134 MB, 3,069 files — inside the Pages limits), `node tools/staging/package_hosted_launch.mjs <out>`
generates the staging package, the four migration files hash exactly to what the
migration tool expects, and `live_additive_migrations_sim.js` / `live_backup_preflight_sim.js`
pass on synthetic data.

The branch you are checked out on does not matter for steps 1–2: the migration bytes
come from the pinned commit `9335e566`, and the safety diff compares that commit to
`origin/arena/a3bbb1f5-prontera-grind`, both of which the fetch brings down. Step 3 is
different — generate the staging package from the candidate branch, the one carrying
`haven-v263`:

```powershell
git switch -c candidate origin/arena/4fe1beea-prontera-grind
Select-String -Path index.html -Pattern 'haven-v[0-9]+' | Select-Object -First 1
# must print haven-v263; main alone prints haven-v262 and is NOT the candidate
```

Come back to `main` (`git switch main`) for anything that only needs the migrations.

## Step 1 — fresh, verified production backup

```powershell
node tools/staging/live_backup_preflight.mjs
```

It verifies the `pg` name **and** UUID, exports a private `.sql` into
`Desktop\HH Save`, restores that export into memory, and runs integrity and
foreign-key checks. Expected: a `PASS:` line and a filename like
`pg-before-launch-20261030143000-1a2b3c4d.sql`.

- The export can briefly affect availability. Pick a quiet moment.
- **Stop** on anything that is not `PASS`. Do not continue to step 2.
- The file contains real accounts and saves. Keep it private; never upload it to chat,
  Git or staging. If you need me to see something, send the check text, not the file.
- The migration tool rejects a backup older than **two hours**, so step 2 follows immediately.

## Step 2 — apply additive migrations 0008–0011 to live `pg`

This uses a fixed-target tool. It refuses to rerun 0007 (`ALTER TABLE ADD COLUMN` is not
rerunnable), refuses unexpected schema, checks the exact staged migration hashes, and
fails closed on an uncertain import. **Never** run `wrangler d1 migrations apply`
against this database: 0007 was applied by hand, so Wrangler's ledger is out of sync.

```powershell
git fetch origin arena/a3bbb1f5-prontera-grind
node tools/staging/live_additive_migrations.mjs pg-before-launch-20261030143000-1a2b3c4d.sql
```

Use the exact filename step 1 printed. Expected: a `PASS`-style completion showing the
new tables, triggers and indexes.

- The four files are applied by **remote file import**, which can briefly interrupt
  production service. Do not retry a timed-out or uncertain import — inspect the
  schema first (see below) and decide.
- If it stops with "Staged migration mismatch", the tree is not the reviewed candidate.
  Stop and tell me; do not edit a migration file.
- **Stop** on any error. A partly applied import is a recovery decision, not a retry:
  see [RECOVERY.md](RECOVERY.md).

Read-only schema check at any point (no writes, no player data printed):

```powershell
node tools/staging/live_backup_preflight.mjs   # prints schema; it exports again, so only if you need it
```

## Step 3 — deploy the candidate to isolated staging, then run the hosted checklist

```powershell
node tools/staging/package_hosted_launch.mjs $HOME\Desktop\launch-staging.mjs
node $HOME\Desktop\launch-staging.mjs
```

The package targets only `pg-staging` and `prontera-grind-staging`, verifies the D1
identity before writing, applies its additive schema, deploys only the staging project
and checks the deployed DB binding with a short-lived marker. It then exercises a
synthetic save, an unverified score, prize creation and duplicate retries, and confirms
its synthetic account and period were deleted. **If cleanup is not confirmed, inspect the
exact synthetic rows before retrying.**

Then click through the deployed staging URL as a player and confirm:

1. register → recovery code shown once → sign in
2. cloud save round-trip (play, reload, progress kept)
3. recovery: use the code, old sessions revoked
4. leaderboard shows the unverified board and says it is unverified
5. GM console sign-in and one harmless GM action
6. one real browser refresh mid-play (the v263 "server maintenance" text must **not**
   appear — the write pause is not deployed, so `WRITE_GATE` is unset and the API is open)

Record what you saw. Staging is not production: CPU limits, real D1 behaviour and load
are still unmeasured.

## Step 4 — launch decision

Only after steps 1–3 pass. Then, in this order:

1. Ask me to merge PR #147 — that is a **production deploy**, and the v263 client
   text changes with it. Migrations must already be applied (step 2) or the newer code
   will look for tables that do not exist.
2. Immediately after the deploy, load the site and sign in once, so a broken deploy is
   found in the first minute rather than by a player.
3. Watch the first hour: `wrangler tail` or the Pages logs for 5xx, and the GM console's
   usage card for rows written.

## If something goes wrong

**A code bug** (wrong numbers, broken skill, UI error): roll the deployment back —
Cloudflare dashboard → Pages project → Deployments → pick the last good one → Rollback.
Players are prompted to refresh within 60 seconds. No data is lost. Do **not** restore
the database for a code bug.

**Wrong or corrupted data**: follow [RECOVERY.md](RECOVERY.md). Restoring rewinds
**every** account to the chosen minute and discards everything after it. The write pause
that makes that safe at speed is prepared in PR #147 but has not been deployed, so during
a restore writes keep landing and are discarded.

## What is still not proven

Stated plainly, because the checklist in the repo says the same:

- No hosted load test and no independent security review.
- Rankings and Echo prizes are **unverified**: scores come from editable browser saves.
  That is the owner's accepted launch decision, and the boards say so.
- Password hashing remains PBKDF2 at 20,000 iterations, below OWASP guidance.
- Email is collected but never verified, and no email is ever sent.
- The write pause has never been deployed or exercised against the live project.
- `social_worker_sim.mjs` cannot run in this sandbox: the installed miniflare does not
  export `convertV4MiniflareOptions`.
