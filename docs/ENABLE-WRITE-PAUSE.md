# Enabling the write pause — exact steps

> For the owner on the Windows machine. Prepared 2026-10-30 against `main` at `f025b0e`
> (`haven-v263`). Read the whole page once before starting: **step 4 is time-sensitive**,
> and the API is down between step 3 and step 5.

## What you are buying

Today, a restore silently discards whatever players did during it. With the pause on,
the server says "paused for maintenance, nothing was saved" and refuses writes, so
nothing is lost invisibly. It does nothing until the day you need a restore.

## Before you start (5 minutes, no deploys)

Do these **first**. Steps 3–5 should run back to back without hunting for anything.

0. **Work in the repository, not in `C:\WINDOWS\system32`.** Wrangler resolves
   `--config` and `main` relative to the current directory, so a deploy started from
   anywhere else fails with `ENOENT ... open 'C:\WINDOWS\system32\workers\gate\wrangler.toml'`.
   ```powershell
   cd $HOME\Desktop\Prontera-Grind
   git status --short          # must be clean before you start changing anything
   npx.cmd wrangler whoami     # must name the account that owns prontera-grind
   ```
   If `whoami` says you are not authenticated, run `npx.cmd wrangler login` once. Do this
   before step 1, not between step 3 and step 5.

1. Install the test dependencies and confirm the switch is green:
   ```powershell
   npm install --no-save --package-lock=false jsdom three@0.128.0 ws miniflare
   node tools/tests/write_gate_sim.mjs
   node tools/tests/write_gate_middleware_sim.js
   node tools/tests/write_gate_api_sim.js
   node tools/tests/write_gate_cli_sim.mjs
   ```
   Each prints one `PASS` line. Verified green on 2026-10-30.

2. **Use `npx.cmd`, not `npx`, in every command below.** PowerShell's execution policy
   blocks `npx.ps1` on a default Windows install and the command fails with
   `running scripts is disabled on this system`. The `.cmd` shim is not affected. Every
   tool in this repository already calls `npx.cmd` on Windows for the same reason. If
   `npx.cmd` is also blocked, run the command from `cmd.exe` instead, or prefix it with
   `powershell -ExecutionPolicy Bypass -Command "..."` for that one command only — do not
   widen the machine-wide policy to get a deploy out.

3. Generate the token and **keep it in a password manager now**. You cannot read it back
   after step 2, and step 5 needs it. Windows usually has no `openssl`; Node is already
   installed for this repository, so use it:
   ```powershell
   node -e "console.log(require('crypto').randomBytes(48).toString('base64'))"
   ```
   That prints 64 characters. `TOKEN_MIN` in `workers/gate/policy.mjs` is 32, and a value
   shorter than that makes the object answer `not-configured` — set it anyway and the gate
   stays closed. Base64 is safe here: `+`, `/` and `=` are all legal in an HTTP header, and
   the worker compares the header with the stored secret in constant time.

   A pure PowerShell alternative if you prefer no Node:
   ```powershell
   $b = New-Object byte[] 48
   [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b)
   [Convert]::ToBase64String($b)
   ```
   Do **not** use `Get-Random` for this; it is not a cryptographic source.

   **Never paste the token into chat, an issue, a commit or a screenshot.** If it is exposed
   before step 2, generate a new one and use that; if it is exposed after the secret is set,
   run step 2 again with a fresh value. The gate keeps working either way, and rotating it
   costs one command.

4. Know your rollback: Cloudflare dashboard → Workers & Pages → `prontera-grind` →
   Deployments → the deployment before this change → **Rollback**. No data is lost.

## Step 1 — deploy the switch itself (no downtime)

```powershell
npx.cmd wrangler deploy --config workers/gate/wrangler.toml
```

**Done 2026-10-30.** Observed output, and how to read it:

```
Total Upload: 10.44 KiB / gzip: 3.31 KiB
env.GATE (WriteGate)      Durable Object
Uploaded prontera-gate (1.91 sec)
No targets deployed for prontera-gate (0.84 sec)
Current Version ID: 81e80ce4-6b99-4dcf-ac71-b6a95f931b40
```

`No targets deployed` is **not** a failure. Wrangler prints it when a Worker has no routes,
no cron triggers and no `workers.dev` address — which is this Worker's design
(`workers_dev = false`, no route). The version was still uploaded and promoted; wrangler
promotes it before that line and before printing the version ID. To confirm the deployment
itself:

**Nothing changes for players.** This Worker has no route and `workers_dev = false`; the
only way in is the Pages binding you add in step 3. Confirms nothing yet — it is dark.

```powershell
npx.cmd wrangler deployments status --config workers/gate/wrangler.toml
```

It must name version `81e80ce4-…` (or whatever your run printed). A brand-new Durable
Object starts in state `closed` with the reason `never-opened`, which is the safe default —
you cannot open it until step 4/5, and nothing calls it until step 3.

## Step 2 — set its secret

```powershell
npx.cmd wrangler secret put GATE_TOKEN --config workers/gate/wrangler.toml
```

Paste the value from "Before you start" step 2. Still no player impact — nothing calls it
yet.

## Step 3 — wire the binding (THIS is where the API goes down)

The edit is **already written and tested on branch `arena/4d4177fb-prontera-grind`**
(PR #148), so there is nothing to type. It uncomments exactly this in the root
`wrangler.toml`, keeping the `SOCIAL` binding and `[env.preview]` untouched:

```toml
[vars]
WRITE_GATE = "required"

[[durable_objects.bindings]]
name = "GATE"
class_name = "WriteGate"
script_name = "prontera-gate"
```

**Do this only after step 2.** Merging deploys the pause; without the secret the object
answers `not-configured` and nothing can open it.

```powershell
git fetch origin
gh pr view 148 --json mergeable,mergeStateStatus    # expect MERGEABLE / CLEAN
gh pr merge 148 --merge
```

Merging to `main` triggers the Pages build. The `wrangler.toml` in the repository is
authoritative — the dashboard shows those fields as read-only, so the file is the only
place the binding can come from.

**From the moment that build finishes until step 5, every `/api/*` request answers 503.**
The public site and the client still load; players see the maintenance message and "your
character is paused". Expected, accepted, usually one to three minutes. Do not merge if you
cannot reach step 5 within ~15 minutes.

If you would rather make the edit by hand instead, replace the commented block in the root
`wrangler.toml` with the four lines above and commit; the result must be identical. The
config test `python3 tools/tests/pages_preview_config_sim.py` checks it parses and that the
pause is never half-configured.

**Why it fails closed:** a half-configured deploy (variable without the binding, or binding
without the variable) answers 503 to everything rather than running unprotected. That is
deliberate for a safety switch, and it is the main thing to be careful about.

## Step 4 — wait for the build, then confirm it is closed

Watch the Pages deployment finish (dashboard, or the build check on the commit).

```powershell
$env:PG_GATE_TOKEN = "<the token from step 2>"
node tools/recovery/write_gate.mjs status
```

Expect a state of `closed` (the object ships closed). If this prints a 404, the token is
wrong or the binding is missing — a wrong token and a missing binding are deliberately
indistinguishable. Fix that before step 5.

## Step 5 — open writes

```powershell
node tools/recovery/write_gate.mjs open "OPEN WRITES"
node tools/recovery/write_gate.mjs status
```

The first command needs the confirmation phrase in quotes; it is a guard against typos
during an incident. Expect the state to change to `open`.

## Verify (2 minutes)

1. Reload the game, sign in, play a little, reload — progress kept, no maintenance text.
2. `node tools/recovery/write_gate.mjs status` still reports `open`.
3. Close and reopen once, to prove you can, while it is safe to be wrong:
   ```powershell
   node tools/recovery/write_gate.mjs close "CLOSE WRITES" --reason "drill" --wait
   node tools/recovery/write_gate.mjs open  "OPEN WRITES"
   ```
   The close should refuse new API calls; the open should restore play. Reload the game
   between the two to see the maintenance message once.

If anything is wrong, roll back the Pages deployment (see "Before you start" step 3) and
the game returns to unpaused immediately — the binding disappears with the old build.

## Afterwards: using it when you actually need a restore

```powershell
node tools/recovery/write_gate.mjs close "CLOSE WRITES" --reason "restore to <time>" --wait
node tools/recovery/write_gate.mjs seal  "SEAL WRITES"    # refuses until drained
node tools/recovery/write_gate.mjs audit                  # what happened, and when
#   fresh verified backup, bookmark, post-restore checks, your approval
node tools/recovery/write_gate.mjs open  "OPEN WRITES"
```

`--wait` waits for the 90-second quiet window. That window proves nothing was *recently
admitted*; it is not a formal proof that no request is still running, which is why
sealing is an operator decision recorded in the audit trail.

## What can still go wrong

- **You lose the token.** There is no way to read it back. `npx.cmd wrangler secret put
  GATE_TOKEN --config workers/gate/wrangler.toml` again with a fresh value; step 5 uses
  the new one. Players are unaffected because the gate only changes state when asked.
- **You enable it and cannot open it.** Roll back the Pages deployment — that removes the
  binding and the pause with it.
- **A Durable Object that loses its storage loads as `closed`.** So a catastrophic object
  failure means an API outage, not a silently unprotected API. Same remedy: roll back.
