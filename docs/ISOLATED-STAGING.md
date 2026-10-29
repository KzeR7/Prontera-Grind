# Disposable local Pages/D1 staging

This is a **local** rehearsal of the draft code with Wrangler's Pages runtime and a
fresh local D1 database. It is not a Cloudflare-hosted staging deployment and does not
prove live Cloudflare CPU limits, network/WAF configuration, deployed cookie behavior,
Durable Object/social functionality, or production readiness. Do not import real players,
backups, production credentials or secrets into it.

## Safety boundaries

- `tools/staging/local.mjs` creates an OS temporary directory with a freshly generated
  local-only D1 name and ID. It copies Functions, migrations and the two asset modules
  those Functions import, then generates a separate Wrangler configuration there. It does
  not pass the production database ID/configuration to Wrangler. Local D1 is selected
  explicitly for all database commands, with a separate temporary persistence directory.
- It accepts only `test` or `serve` and never runs deploy or a remote D1 command. It
  removes Cloudflare credential environment variables from Wrangler's environment; local
  execution does not require Cloudflare login. Wrangler/npm may still use the network to
  install or perform their own local-runtime setup.
- The database and its synthetic accounts are removed when the script stops normally.
  An abrupt termination may leave a temporary `prontera-isolated-*` directory in the OS
  temporary folder; inspect and remove it only after stopping the process. Never place
  real data there.
- This is **not** a safety guarantee for branch previews or arbitrary Wrangler commands.
  The repository's `wrangler.toml` contains the production D1 ID. A hosted branch preview
  must not be used for testing until an independent staging Pages project/configuration
  has been verified to bind a separate D1 database. Do not use the live backup for routine
  staging; use synthetic data.

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
case-insensitive and concurrent email uniqueness, save/reload, the leaderboard pause,
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
