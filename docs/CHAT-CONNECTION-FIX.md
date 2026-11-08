# Chat connection fix: Windows / PowerShell

This fix needs **both** `prontera-social` and the `horizonhaven` Pages site updated.
Deploy the **Social Worker first**, then Pages, from the same merged commit.
There are **no database migrations**, database resets, new bindings or secrets.
Do not change the write gate or attach production bindings to a PR preview.

## After the fix PR is merged

Use your existing local repository. These steps are for the owner; the fix was
prepared through the GitHub API without cloning or checking out the repository.
Run one section at a time and stop if it fails.

```powershell
Set-Location "C:\path\to\Prontera-Grind"

# Preserve any local work: do not reset/clean it to make deployment proceed.
if (git status --porcelain) { throw "Local changes exist. Save them before deploying." }
git switch main
if ($LASTEXITCODE -ne 0) { throw "Could not switch to main" }
git pull --ff-only origin main
if ($LASTEXITCODE -ne 0) { throw "Could not update main" }

# Confirm this contains the merged fix before deploying anything.
if (!(Select-String -Path index.html -SimpleMatch "haven-v369" -Quiet)) {
    throw "This checkout is not haven-v369. Confirm the fix PR has merged."
}

npx.cmd wrangler whoami
if ($LASTEXITCODE -ne 0) { throw "Authenticate with npx.cmd wrangler login, then retry." }
```

### 1. Update the server-side Social Worker

Run from the repository root. The explicit config prevents accidentally using
the Pages config instead of the Worker config.

```powershell
npx.cmd wrangler deploy --config workers/social/wrangler.toml
if ($LASTEXITCODE -ne 0) { throw "Social Worker deploy failed. Stop here." }
```

### 2. Build, check and publish Pages

Use **Git Bash**, not WSL's `bash.exe`. Change `$GitBash` if Git is installed
elsewhere, for example `C:\Program Files\Git\bin\bash.exe`.

```powershell
$GitBash = "D:\Git\bin\bash.exe"
if (!(Test-Path $GitBash)) { throw "Set GitBash to your Git installation's bin\bash.exe" }

& $GitBash tools/build_site.sh
if ($LASTEXITCODE -ne 0) { throw "Site build failed. Do not publish old dist files." }

node tools/preflight_deploy.mjs --expect haven-v369
if ($LASTEXITCODE -ne 0) { throw "Preflight failed. Do not deploy." }

npx.cmd wrangler pages deploy dist --project-name horizonhaven --branch main
if ($LASTEXITCODE -ne 0) { throw "Pages deployment failed" }
```

Use `npx.cmd`, not `npx`, to avoid the common PowerShell execution-policy error.
A successful Pages deployment alone does not prove the Social Worker was updated.
If Cloudflare Git integration already deployed both production services from the
merge, verify their commit IDs instead of assuming the PR preview updated production.

## Verify on the production game

1. Reload and confirm the login build label contains **haven-v369**.
2. Use one tab, sign in, send a World message, enter the Social Hub and move.
3. Sign out and back in. Check World chat and online plaza membership again.
4. Briefly disconnect/reconnect the network. Chat should reconnect automatically.
5. If opening a second tab for the same account, the first should say chat moved
   to another tab and **stay yielded**, not repeatedly knock the second tab offline.
   A real sign-out/sign-in or full reload lets that tab try again.

If it still fails, provide the build label and browser console lines beginning
`[plaza]`, including close code/reason, plus `/api/chatcheck`'s response. Never
paste cookies or tokens. The diagnostics endpoint probes prerequisites; it is
not an end-to-end guarantee that this browser's WebSocket works.

## Verification scope

The two new regressions fail against the pre-fix commit and pass with the fix.
Affected room, handshake, recovery, gym, battle, UI and actual local workerd
tests passed, including six close/reconnect cycles and durable poker replay.
The local workerd uses `2026-08-06`; production uses `2026-10-01`.
The full repository gate, assembled-site build and production login/network test
were not run in the no-checkout API workflow. Run the gate in [TESTING.md](TESTING.md#before-pushing)
before approving the PR; local tests do not establish hosted behavior.
