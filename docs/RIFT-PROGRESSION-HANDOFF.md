# Rift progression handoff (haven-v447)

This is the owner-run step for the layer that was deferred from v446: **weapon stars, raid cards,
the Rift Aura and four earned titles**. It updates the local checkout to the latest GitHub `main`,
then deploys this feature branch to the isolated staging targets. It does **not** deploy production.

## What was added

### Weapon stars (Rift Forge)

- Maximum **20 stars** per equipped weapon; stars live on the weapon item (`stars`) in the normal
  cloud save, like refinement. No migration is required for stars.
- Each star: **+2% ATK in every zone** (field and raid) and **+1.5% defence penetration** against
  the Rift Sovereign, capped at the boss's **30% armour**. At 20 stars the weapon ignores the full
  30% armour step, so raid farming visibly makes the boss easier.
- Cost is paid in **Rift Shards**, the material the raid already drops. Base cost starts at 8 and
  rises by 2 every two stars (8 → 26 at star 19).
- Base success starts at 92% and falls with the star count (about 20% at star 19). **A failure
  never removes a star**; only the shards for that attempt are spent.
- Three optional extra-shard deposits are selectable before each attempt:

| Deposit | Extra shards | Success bonus |
| --- | ---: | ---: |
| Standard | 0 | +0 |
| Steady | 5 | +10 points |
| Charged | 12 | +24 points |
| Overload | 24 | +42 points |

The Forge is in the Rift Raid lobby, below the party panel. The field Character sheet also shows
the weapon's star line, and `iname` prefixes the weapon with `★n`.

### Raid cards (account-wide, one equipped)

| Card | Effect per rank |
| --- | --- |
| Sovereign Fang | +3% DPS, +1% defence penetration |
| Astral Bulwark | +5% max HP, +2% defence penetration |
| Herald Vow | +4% max HP, +2% DPS |

- Drops from each chest: a full clear rolls **clear + fractured** (two cards), a failure rolls
  **pity** (one card).
- Duplicates add copies. Ranks at **1 / 3 / 6 / 10 / 15 copies** (rank 1–5).
- Exactly one equipped card per account. Its effect is snapshotted when the next run starts, so a
  swap cannot change a run already in flight.
- D1-owned: `raid_card_drops` is the exactly-once source, `raid_cards` is the account collection.
  A replayed settlement cannot add a second card or copy.

### Earned cosmetics

- **Rift Aura** — unlocked on the first qualifying clear; a cyan ring around the HUD portrait.
- **Four titles** in the Mastery Index (filter **Rift Raid**):
  - Rift Clearer — 1 clear
  - Sovereign Breaker — 3 clears
  - Fracture Veteran — 6 clears
  - Eternal Warden — 10 clears
- The account's `qualifyingClears` is mirrored into the save (`S.raidClears`) when the lobby opens;
  `PGTitles.sync` awards the milestones. There is no Cash Shop item or purchase path.

## The one PowerShell handoff

Prerequisites on the Windows machine used for staging:

- Git for Windows (provides `bash.exe`).
- Node.js / npm and an already-authenticated Wrangler (`npx wrangler whoami` should work).
- An existing `Prontera-Grind` checkout. The script refuses to run over uncommitted changes.

Copy the launcher out of the branch first (it is not on `main`), then run it:

```powershell
# Works even when PowerShell opens in C:\WINDOWS\system32.
$repo = Join-Path $env:USERPROFILE 'Desktop\Prontera-Grind'
if (-not (Test-Path $repo)) { throw "Cannot find $repo. Change the path to your checkout." }
Set-Location $repo

git fetch origin arena/bfc7d4d1-prontera-grind
$stageScript = Join-Path $env:TEMP 'pg-update-and-stage.ps1'
git show FETCH_HEAD:tools/staging/update-and-stage.ps1 |
  Set-Content -Encoding ascii $stageScript
powershell -ExecutionPolicy Bypass -File $stageScript -Repo $repo
```

`C:\path\to\Prontera-Grind` in earlier examples was a placeholder; the actual folder on this PC is
`C:\Users\<you>\Desktop\Prontera-Grind`. There is also a `Prontera-Grind-staging` folder; use the
main checkout (`Prontera-Grind`), because the script creates its own temporary worktree and leaves
your checkout on `main`.

What the script does, in order:

1. `git fetch origin --prune`, switches the checkout to `main`, and fast-forwards it to
   `origin/main` (your local files are now latest `main`).
2. Fetches `arena/bfc7d4d1-prontera-grind`, creates a temporary detached git worktree, and merges
   the latest `origin/main` into it. If that merge conflicts, it stops and changes nothing remote.
3. Builds `dist` from that worktree with `tools/build_site.sh` and requires `version.txt` to equal
   the `index.html` BUILD label (`haven-v447`).
4. Generates throw-away Wrangler configs for **only**:
   - Pages `prontera-grind-staging`
   - Worker `prontera-social-staging`
   - D1 `pg-staging` (`3a38c6fc-96a8-491d-b97b-fd536e575ca4`)
   - `RAID_ENABLED = "true"` (staging config only; the repository and production stay `"false"`)
5. Verifies the remote database name/uuid, then applies **only the missing** raid migrations, in
   order:
   - `migrations/0022_player_character_raid.sql`
   - `migrations/0023_raid_cards.sql`
6. Deploys `prontera-social-staging` first, then `prontera-grind-staging`.
7. Prints the unique staging URL and verifies its `version.txt`.

The script refuses to continue if a production name or ID (`horizonhaven`, `pg`,
`prontera-social`, `prontera-gate`, the production D1 UUID) reaches a generated config. It leaves
the worktree in `%TEMP%` on failure for diagnosis.

### Existing v411 staging database

`pg-staging` was used by the older v411 raid experiment, whose migration 0018 created `raid_runs`
without the v447 `seed` / checkpoint columns and without the exactly-once `grants.ref` ledger. The
handoff detects that state (`raid_runs` exists, `grants.ref` or the checkpoint columns do not) and
upgrades it in place:

- adds `raid_runs.seed`, `checkpoint_json`, `checkpoint_at` and `grants.ref` only when missing;
- drops and recreates `raid_chest_to_ledger` and `raid_reward_apply` from
  `tools/staging/legacy_raid_upgrade.sql`;
- cancels old active runs that have no checkpoint, because they cannot be resumed by this build;
- then applies `0023_raid_cards.sql`.

It does not drop the old raid tables, does not delete completed history, and does not touch
production. A fresh database still receives `0022` followed by `0023`.

### If the script reports local changes

It will not discard or stash your files. Local Wrangler state and scratch archives (for example
`.wrangler/`, `prontera-ui-redesign-v2.zip`, `workshop-source.zip`) can be hidden from Git without
deleting or moving them:

```powershell
$repo = Join-Path $env:USERPROFILE 'Desktop\Prontera-Grind'
Set-Location $repo
@('.wrangler/', 'prontera-ui-redesign-v2.zip', 'workshop-source.zip') |
  Add-Content -Path (Join-Path $repo '.git\info\exclude') -Encoding ascii
git status --short
```

`.git/info/exclude` is local-only and is not committed. If `git status` still shows tracked edits,
commit or stash them deliberately; the handoff correctly refuses to run over them.

### If you prefer to do step 1 separately

```powershell
cd C:\path\to\Prontera-Grind
git fetch origin --prune
git switch main
git pull --ff-only origin main
git log --oneline -1
```

Then run the same launcher command. The launcher still fetches and merges the feature branch; it
does not push anything.

## Verification after deploy

Use synthetic accounts only.

- [ ] Lobby loads with **Rift Forge** and **Raid cards** panels.
- [ ] Forge failure: shards decrease, stars unchanged; success: exactly +1 star.
- [ ] At 20 stars the button says **Maxed**; the field sheet shows the star line and field ATK rises.
- [ ] Clear one raid: result shows two card drops; return to lobby and **Equip** one.
- [ ] Refresh/reconnect: the same card remains equipped and other members see the same account.
- [ ] Failed run: pity chest + one card; no duplicate card after retrying settlement.
- [ ] First clear: Rift Aura appears; Mastery Index → Rift Raid shows **Rift Clearer**.
- [ ] `GET /api/raid` account has `cards`, `equippedCard`, and `qualifyingClears`.
- [ ] Run the preflight against the printed URL with the staging host:

```powershell
$env:RIFT_STAGE_BASE = "https://<printed-deployment>.prontera-grind-staging.pages.dev"
$env:RIFT_STAGE_DB = "pg-staging"
$env:BASE_SCHEMA = "<recorded staging schema>"
node tools/staging/rift_raid_stage.mjs
```

## Rollback

- Repoint the Pages deployment to the previous staging deployment (Cloudflare → Pages →
  `prontera-grind-staging` → Deployments → Rollback).
- Re-deploy the previous `prontera-social-staging` Worker version (Wrangler versions / dashboard).
- Do **not** drop `raid_cards` or `raid_card_drops`. They are additive and harmless to an older
  client; dropping them would destroy earned cards. `0022`/`0023` are not reversed.
- Production is untouched by this handoff; `wrangler.toml` still has `RAID_ENABLED = "false"`.
