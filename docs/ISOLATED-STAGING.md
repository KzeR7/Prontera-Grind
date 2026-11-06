# Disposable local Pages/D1 staging

> **Current draft:** The previously generated damage-only staging package targeted a
> historical paused-board build. Its generator is intentionally retired because the
> new ranking code needs additional modules and migrations. Do not reuse it to test
> or deploy v262. The separately packaged launch-stage script below targets only
> the fixed isolated staging project and database.


This is a **local** rehearsal of the draft code with Wrangler's Pages runtime and a
fresh local D1 database. It is not a Cloudflare-hosted staging deployment and does not
prove live Cloudflare CPU limits, network/WAF configuration, deployed cookie behavior,
Durable Object/social functionality, or production readiness. Do not import real players,
backups, production credentials or secrets into it.

## Hosted launch rehearsal package

Generate with `node tools/staging/package_hosted_launch.mjs <output.mjs>`; generation
never deploys. The packaged script is intended for the owner's existing Windows setup
and verifies the fixed `pg-staging` database ID before writing any staging data. It
archives the previously used base into a fresh temporary folder, overlays only reviewed
runtime changes, applies additive 0009–0011 to **staging** using remote file import
(which can temporarily pause staging traffic), deploys only `prontera-grind-staging`,
and verifies the actual deployment's DB binding using a short-lived marker. It then
checks a synthetic save, flagged unverified score, and synthetic period payout and
repeat requests; the synthetic account and period must be confirmed deleted. The
old monitoring schema is checked and applied idempotently. No live D1 or Pages
project is targeted. Script preparation and local simulated tests do not establish
hosted success; inspect any cleanup failure before retrying.

**Owner-reported hosted result:** The v262 package deployed to
`https://9a39bb3a.prontera-grind-staging.pages.dev`. It verified the isolated DB
binding, synthetic save and unverified score, flags, prize creation and duplicate
retries, and confirmed synthetic account and period cleanup. This is staging
only; it does not validate live migration, anti-cheat integrity or load/cost.

## Sanctuary online battle staging (owner-run)

`tools/staging/sanctuary_hosted_stage.mjs` is the coordinated Pages + Social
Worker launcher for reviewed commit `7fa5107` (`haven-v349`). Unlike the older
Pages-only rehearsal, it deploys **`prontera-social-staging` first**, then
**`prontera-grind-staging`** with `SOCIAL` bound to that staging Worker and `DB`
bound only to the documented `pg-staging` UUID. Its Durable Object namespace is
therefore separate from the production `prontera-social` service. It applies no
migrations and creates no test account.

The launcher requires the owner's existing Windows setup, an already
authenticated Wrangler CLI, Node/npm, Git Bash and a checkout containing PR #180.
It archives the pinned commit into a fresh temporary directory, verifies the
remote staging database identity and account schema before either deployment,
builds `dist`, prints the unique staging URL, then verifies the deployed v349
`version.txt` and checks that `/api/social` reaches authentication (401 rather
than a missing-binding 503). Because the URL is printed first, a local network
or probe failure cannot hide a completed deployment; the launcher distinguishes
`verified and ready` from `deployment completed, but automatic verification did
not pass`. It cannot accept another project, commit or database through
arguments. No production project or database is targeted.

From the owner checkout, fetch the PR and materialize only this launcher, then
run it with the existing Wrangler login (do not paste credentials into chat):

```sh
git fetch origin arena/2a992c15-prontera-grind
git checkout FETCH_HEAD -- tools/staging/sanctuary_hosted_stage.mjs
node tools/staging/sanctuary_hosted_stage.mjs
```

Use the printed unique deployment URL or
**`https://main.prontera-grind-staging.pages.dev`**. The bare project root can
serve a different, older production-branch deployment; it is not the v349 branch
URL. Use synthetic accounts only, in two isolated browser profiles for PvP. The
launcher proves deployment identity and binding presence; it is not a two-client
combat rehearsal. If post-deploy verification fails, inspect the named staging
project before retrying rather than assuming that nothing changed.

## Safety boundaries

- `tools/staging/local.mjs` creates an OS temporary directory with a freshly generated
  local-only D1 name and ID. It copies Functions, migrations and the two asset modules
  those Functions import, then generates a separate Wrangler configuration there. It does
  not pass the production database ID/configuration to Wrangler. Local D1 is selected
  explicitly for all database commands, with a separate temporary persistence directory.
- It accepts only `test`, `test-strong`, `test-scrypt`, `test-reader` or `serve` and never runs deploy or a remote D1 command. It
  removes Cloudflare credential environment variables from Wrangler's environment; local
  execution does not require Cloudflare login. Wrangler/npm may still use the network to
  install or perform their own local-runtime setup.
- The database and its synthetic accounts are removed when the script stops normally.
  An abrupt termination may leave a temporary `prontera-isolated-*` directory in the OS
  temporary folder; inspect and remove it only after stopping the process. Never place
  real data there.
- This is **not** a safety guarantee for branch previews or arbitrary Wrangler commands.
  The repository's `wrangler.toml` retains the production bindings at top level, with a
  locally tested empty `[env.preview]` resource configuration. It is not hosted-verified;
  old deployments and actual Cloudflare bindings must be checked separately. Default branch
  previews have no D1 or social functionality by design once the override is applied. Use
  a separately verified staging project/config for functional cloud tests and synthetic data;
  never use the live backup or production credentials for routine staging.

## Run the automated rehearsal

Requirements: Node.js 22+ and npm, Bash for the build, and network access to npm for the
pinned Wrangler package. `npx` can use its package cache on subsequent runs. Run from the
repository root; no Cloudflare login or migration of the real database is needed.

```sh
bash tools/build_site.sh
node tools/staging/local.mjs test
```

On Windows, run the same commands in PowerShell; `bash` is available with Git Bash when
installed and on the PATH. If Bash isn't found, open Git Bash in the repository and run
both commands there. The script calls `npx.cmd` automatically on Windows; you don't need
to change PowerShell's execution policy. The Windows launch path has not yet been
validated on a Windows machine.

The test first applies migrations 0001–0006 locally, seeds a synthetic owner with no email,
then applies 0007 and confirms the migration ledger makes a second apply a no-op. Against
the local Pages runtime it tests owner login/GM authorization, normal registration,
case-insensitive and concurrent email uniqueness, save/reload, unverified Echo standings,
recovery/code rotation, session revocation and cross-origin rejection. A failed test exits
nonzero. Both the migrations and test data are strictly local to that temporary directory.

## Local stronger-hash experiment (no deployment)

```sh
bash tools/build_site.sh
node tools/staging/local.mjs test-strong
```

This opt-in experiment changes PBKDF2-SHA256 from 20,000 to 600,000 iterations
**only in the disposable temporary Functions copy**. The repository's actual
work factor stays at 20,000. It seeds a synthetic 20,000-iteration legacy owner,
then checks login upgrade, registration, 20,000-iteration legacy recovery-code
rotation, racing one-time recovery, session revocation and isolated D1 hash
prefixes without printing hashes.
It removes the local database at exit and does not connect to hosted staging.

Local workerd does **not** enforce the hosted PBKDF2 ceiling or hosted CPU quotas.
A pass does not show that 600,000 is deployable, affordable or accepted by the
owner's plan. Never run a hosted test on production accounts or expose a public
benchmark. A separate approved hosted staging experiment is still required.
Rollback also needs planning: a previous runtime that cannot verify 600,000 hashes
may lock out accounts already upgraded by a newer runtime. Do not change live hashes
or deploy the experiment until compatibility, migration and rollback are verified.
A separate, owner-run, synthetic [hosted preview probe](HOSTED-AUTH-PROBE.md) can
check iteration acceptance without touching the game or D1; it is not full staging.

## Local reader-only compatibility experiment (no deployment)

```sh
bash tools/build_site.sh
node tools/staging/local.mjs test-reader
```

This tests the draft's fixed-profile scrypt **reader** with two synthetic scrypt
accounts in a disposable local D1. It checks login and recovery, session revocation,
that an unchanged login preserves the scrypt hash, and that recovery and new account
writes still use PBKDF2 at 20,000. This is not hosted staging or a safe rollout/rollback
proof. Reader-only rollback can keep scrypt accounts readable but will temporarily write
weaker PBKDF2 on recovery, registration and GM password resets. A still older version
without this reader cannot authenticate upgraded accounts. See [Password KDF plan](PASSWORD-KDF-PLAN.md).

## Local scrypt integration experiment (no deployment)

```sh
bash tools/build_site.sh
node tools/staging/local.mjs test-scrypt
```

This opts into patching **only a temporary Functions copy** with the disconnected
scrypt adapter and uses a new, local-only D1 containing synthetic accounts. It exercises
registration, legacy 20k password upgrade, legacy recovery-code rotation, recovery
races, session revocation, a GM password reset and one simultaneous login/reset
schedule, email uniqueness, save and the paused board. It checks candidate hash prefixes without printing hashes. The repository's actual Functions still **write** 20k PBKDF2 and include only a
scrypt reader; no hosted or real account is changed.

The owner separately reported two successful remote-preview scrypt acceptance probes.
This local integrated experiment does **not** test hosted Pages/D1, CPU and memory
quotas, sustained/concurrent resource usage, costs, real account migration, or a safe
rollback. A production release that cannot verify new scrypt hashes can lock out
upgraded accounts; a staged compatible-reader-first release and rehearsed rollback
must precede any live writes. No deployment based on this experiment alone.

## Owner-run hosted scrypt reader probe

See [Fast launch checklist](FAST-LAUNCH-CHECKLIST.md#hosted-staging-result-and-next-reader-check)
for the fixed-target synthetic probe, its cleanup behavior and limits. It is a **remote**
check using the owner's Wrangler login and an existing isolated staging D1, unlike every
`local.mjs` mode; it never loads the production Wrangler config. Only use it after the
owner has verified the hosted `DB` binding for the target deployment.

## Try the game manually

```sh
bash tools/build_site.sh
node tools/staging/local.mjs serve
```

Open **http://127.0.0.1:8787/** on the same computer. The server listens on localhost by
default. Sign in with the **synthetic**, public testing-only account:

- Account: `StageOwner`
- Password: `StageOnly-password-123!`

This account is seeded locally as a legacy owner and can use in-game GM commands and the
GM console. Register other synthetic accounts to test the player experience. Do not enter
real passwords or emails. Stop with **Ctrl+C**; the database is discarded on normal exit.
To pick another local port, set `PG_STAGING_PORT` before running (PowerShell example:
`$env:PG_STAGING_PORT="8789"`). The opt-in `PG_STAGING_EXPOSE=1` binds to all interfaces
for sandbox previews; it exposes the shared test owner and must only be used with synthetic
data on a trusted network. The local Wrangler server does not implement the development
server's iframe cookie workaround, so cross-site iframe previews may not retain sessions;
use a direct browser tab or localhost for manual sign-in.

Wrangler can warn that it cannot fetch `Request.cf` in restricted networks; it uses a
local placeholder. No `SOCIAL` Durable Object is bound in this rehearsal, so multiplayer
social is unavailable. The separate `tools/dev_server.js` social tests use their own shim
and also do not replace hosted staging.

## Owner-run damage-review staging package

`tools/staging/hosted_damage_stage.mjs` is a template, not a ready-to-run
command. `node tools/staging/package_hosted_damage.mjs <output.mjs>` creates a
self-contained owner-downloadable Windows script containing the current seven
reviewed game/API/migration files. It requires the previously used local checkout
and commit `7511a03`, Git, Node/npm and `D:\Git\bin\bash.exe`. It creates a fresh
OS-temp source tree, preserves existing checkouts and staging folders, and fixes
Wrangler config to Pages `prontera-grind-staging` and D1 `pg-staging` UUID
`3a38c6fc-96a8-491d-b97b-fd536e575ca4`. It verifies that remote identity before
any hosted writes. It manually applies the equivalent idempotent 0008 DDL via
D1 query `--command` (not import and not migration tracking), checks the table
columns and keys, and deploys the staging project only. A guarded, synthetic,
read-only staging Function verifies the actual deployed Pages DB binding via a
random marker before registering any account. The marker is then removed; the
unguessable-token-guarded Function remains in that temporary staging deployment.
It creates one random test account, briefly promotes that synthetic account to
GM, tests both flags and access controls, checks that competition is paused, and
removes the account, saves, flags and associated events. A registration IP rate
counter may remain until its normal expiry. It stops on any failure and reports
whether account and marker cleanup were confirmed. Do not rerun blindly after
unconfirmed cleanup. This is not a production deployment, a production migration,
a hosted load test, or proof that any flagged player cheated. See
[Damage monitoring](DAMAGE-MONITORING.md) for limits and retention.
