# Cloudflare password-hash preview probe

This opt-in test executes a **synthetic-only, short-lived remote Worker preview**
on the Cloudflare account already signed in to Wrangler. It does not deploy the
game, does not read the repository's `wrangler.toml`, binds no D1 or other remote
resources, and never asks for a real password or recovery code. It uses a unique
preview Worker name; Wrangler may create preview resources in the signed-in account.
A random, one-run bearer token is held in the local Node process; only its digest is
embedded in the temporary preview code. The local proxy listens on `127.0.0.1`,
unauthorized requests are rejected before the expensive operation, and the probe
accepts only four fixed iteration counts and three fixed operation shapes. Do not
share preview URLs, authentication links, tokens, credentials or verbose Wrangler
logs. The run makes at most seven requests and may count toward account usage.

The probe tests 20,000, 100,000, 100,001 and 600,000 PBKDF2-SHA256 iterations;
if 600,000 succeeds, it also tests the rough registration and recovery operation
shapes. It reports status, errors and end-to-end elapsed wall time, **not CPU time**.
Timeouts and HTTP/runtime failures are inconclusive; a few passing preview calls do
not prove that the actual Pages Functions, D1 binding, CPU quota, account migration,
rollbacks, concurrency or costs are safe. Cloudflare documents that `wrangler dev
--remote` executes a preview Worker on Cloudflare, unlike local workerd:
https://developers.cloudflare.com/workers/wrangler/commands/workers/.
Keep password cost unchanged until a separate controlled staging test of real
registration, login, recovery and session races with synthetic data has succeeded,
with hosted CPU/error telemetry and a safe rollback plan.

## Owner-reported result (2026-10-29)

The owner ran the remote preview and reported 20,000 and 100,000 accepted;
100,001 and 600,000 returned `NotSupportedError` with an explicit 100,000 cap.
No game or database was deployed or modified by the probe. The subsequent
`MODULE_NOT_FOUND` was a combined PowerShell command, not a new probe result.
See [Password KDF plan](PASSWORD-KDF-PLAN.md) for the distinction between this
preview and actual Pages CPU/quota testing. There is no need to repeat this probe
unless the runtime or the specific question changes.

## Run on Windows using the existing Git and Wrangler login

These commands fetch the script from the current PR branch without checking it out
or modifying the user's working files. Use the existing Git Bash / PowerShell setup;
Node 22+ and npm are required. Wrangler may open a browser if a login is needed;
complete that privately, never paste credentials or login links into chat. If the
probe reports that Wrangler is not logged in, use `npx.cmd wrangler login` privately
and rerun it. The probe itself runs with no interactive input.

```powershell
cd C:\Users\User\Desktop\Prontera-Grind-staging
git fetch origin arena/a3bbb1f5-prontera-grind
if ($LASTEXITCODE -ne 0) { throw 'Fetch failed; no probe was run.' }
$probe = Join-Path $env:TEMP 'pg-hosted-pbkdf2-probe.mjs'
git show FETCH_HEAD:tools/audits/hosted_pbkdf2_probe.mjs | Set-Content -Encoding utf8 $probe
if ($LASTEXITCODE -ne 0) { throw 'Probe was not found; no probe was run.' }
node $probe
```

Share only the final JSON results, after checking that they contain no private
information. Do not post a Wrangler authentication link, preview URL, credentials,
passwords, recovery codes, account IDs or full debug logs. If startup fails, report
only the general error (for example, not logged in or account selection required).
The script shuts down its preview session and removes its temporary files on normal
exit. You can remove the downloaded probe from `%TEMP%` after it finishes. An abrupt
termination may leave a `pg-hash-preview-*` temporary directory; inspect and remove
it only after the process has stopped. Do not delete other Workers or databases.

`node tools/audits/hosted_pbkdf2_probe.mjs --local` is a local harness check only and
must never be reported as a Cloudflare-hosted result.
