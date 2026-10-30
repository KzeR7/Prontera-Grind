# Fast launch checklist

2026-10-29. This is a working checklist, **not** an assertion that launch is safe.
The owner chose unverified rankings and prizes for launch. Local v262 is not yet
deployed or hosted-tested; verify the actual deployed version before making claims.
The earlier paused-board staging results below are historical. Do not merge or deploy until the owner explicitly
approves the final candidate. No Cloudflare credentials, passwords, recovery codes,
backup contents or screenshots showing them should be shared in chat.

> **2026-10-30:** the remaining launch steps are now ordered in
> [Launch runbook](LAUNCH-RUNBOOK.md): fresh verified backup → additive 0008–0011 on live
> `pg` → staging deploy and hosted checks → launch decision. Read that first; this file
> keeps the background and the evidence behind each item.

## 1. Password hashing — hosted preview accepted; integration pending

PBKDF2-SHA256 at 600,000 was rejected by the owner's remote preview. The next
candidate is **scrypt N=16384, r=8, p=5** (an OWASP-listed profile), not a claim
that a lower PBKDF2 work factor meets the recommendation. The repository's actual
authentication still writes 20,000 PBKDF2 iterations; the draft now includes a
fixed-profile scrypt reader, but cannot create scrypt hashes.

The owner ran `tools/audits/hosted_scrypt_probe.mjs` twice using their existing Wrangler
login. Both runs accepted the vector and one, two and three synthetic candidate-profile
derivations. They are preview acceptance tests, not CPU or real authentication tests.
The probe uses a separately named remote
preview Worker with no bindings, a random in-memory access token and only synthetic
inputs. It tests the RFC 7914 known-answer vector, one candidate derivation and, only
if that succeeds, two and three sequential derivations. It runs at most four authorized
requests plus an unauthorized rejection check. The vector uses a deliberately small
profile for correctness, not security. No game or D1 is deployed; preview usage may
still count toward the account's quota. `--local` is only a harness test.

A pass checks this preview's acceptance, not CPU quota headroom, actual Pages
integration, full registration/recovery, concurrency, sustained load or pricing. A
rejection (including timeout or runtime error) does not identify a safe alternative by
itself. Do not change the password write algorithm until implementation and migration/rollback
are reviewed and synthetic hosted staging tests pass; see [Password KDF plan](PASSWORD-KDF-PLAN.md).

## Hosted staging result and next reader check

The owner reported enabling MFA for their own Cloudflare login and deploying draft
commit `7511a03` to the separate staging Pages project at
`https://56968bf2.prontera-grind-staging.pages.dev`. Their dashboard showed D1
binding `DB` to `pg-staging`. They report that synthetic registration, recovery and
login, the paused leaderboard, and existing staging GM tools all work. These ordinary
account flows still write PBKDF2 and did not test the scrypt reader.

`tools/staging/hosted_scrypt_reader_probe.mjs` is an owner-run, fixed-target synthetic
check for that reader. It creates a fresh random **non-GM** account in the fixed
`pg-staging` database, signs in and recovers it against the fixed staging deployment,
checks the pause and session revocation, confirms the reader-only reset writes PBKDF2,
then deletes only its uniquely identified synthetic row and related sessions/events.
It also confirms the remote D1 name and UUID before writing. It uses an isolated
Wrangler config and the D1 query API, not import, production DB or repository config.
It logs no passwords, recovery codes, hashes or cookies; it does print the temporary
synthetic username so an operator can locate it if interrupted. If cleanup is not
confirmed or the process is interrupted, do not guess at cleanup: inspect the exact
synthetic row on staging and investigate. The few test calls and D1 reads/writes may
count toward the owner's Cloudflare quota. This script does not deploy, change any
existing account, or prove sustained load, CPU or rollback safety.

The first probe version passed its staging identity check, but a later step failed and
cleanup could not be confirmed. The owner then ran a scoped query showing zero `users`
rows for that synthetic username; the original failure's cause remains unknown.

The owner subsequently ran the revised probe successfully on Windows against the
staging deployment. Synthetic scrypt login (200), session (200), paused Echo board (503),
scrypt recovery (200), old-session revocation (401) and new-password login (200) all
passed; cleanup was confirmed. It checked that the reader-only reset wrote PBKDF2.
This proves those individual synthetic hosted flows, not CPU, memory, sustained load,
actual scrypt writing, cost or a complete rollback. No production deployment occurred.

A staging-only writer candidate is prepared by `tools/staging/prepare_hosted_scrypt.mjs`;
see [Hosted scrypt writer experiment](HOSTED-SCRYPT-WRITER.md). Never deploy that temporary
candidate to production or point it at real accounts.

## 2. Backup and restore

- The owner reported exporting live `pg` before migration 0007. It is a historical
  snapshot, not proof that newer data is backed up. Protect the file: SQL exports
  contain private account and save data. Do not upload it to the agent, staging or Git.
- `node tools/audits/verify_backup_in_memory.mjs <trusted-export.sql>` reads a trusted
  export on the owner's computer, restores it into an in-memory SQLite database, and
  prints only schema/integrity outcomes. Use Node 22.5+. It does not establish recency,
  test every save, or restore a hosted D1. **Only use trusted Wrangler SQL exports:**
  this executes the SQL; it is not a sandbox for arbitrary/untrusted files. Any error is
  deliberately generic to avoid printing sensitive SQL. The backup made before 0007
  may legitimately show the email column absent.
- `node tools/audits/local_d1_restore.mjs` has already exported a fully migrated,
  synthetic local D1 and imported it into a separate local D1, verifying the owner,
  email, save and partial unique email index. It also exercised the in-memory checker.
  The owner located the historical 6,018,686-byte export after the first path was not
  found, ran the checker on their own computer and reported an in-memory restore with
  integrity and foreign-key checks OK and core tables present. The email column was
  absent, as expected for a snapshot created before 0007. This is not a current backup,
  a full per-save verification, or a hosted D1 restore test.
- Before a production change, create a fresh, securely stored backup and rehearse a
  suitable restore procedure using an isolated copy, with permission and access controls.
  D1 Time Travel restores **in place**, cancels in-flight queries and can overwrite newer
  data; do not use it as a test on production. Its retention depends on plan.
  [Cloudflare D1 Time Travel](https://developers.cloudflare.com/d1/reference/time-travel/)
  and [export/import](https://developers.cloudflare.com/d1/best-practices/import-export-data/).

## 3. Administrator MFA and edge rate limits

- The agent cannot inspect the Cloudflare account. The owner should check **My Profile →
  Authentication**, enable an authenticator app or security keys if needed, securely store
  recovery methods, and check every administrator has MFA and least-privilege access.
  Do not share codes. [Cloudflare MFA](https://developers.cloudflare.com/fundamentals/account/account-security/2fa/).
- The owner reports that the public game uses `pages.dev`. Zone-level WAF rules are
  normally configured on a domain/zone the owner controls; do not assume they cover the
  shared `pages.dev` host or its preview/deployment hostnames. Cloudflare community
  guidance reports that a custom domain rule does not protect the direct Pages address:
  [Pages/WAF discussion](https://community.cloudflare.com/t/waf-for-cloudflare-pages/516494).
  Confirm the account's available controls and each actual host; a custom domain without
  protecting or closing direct/preview access can be bypassed. Do not buy a domain, change
  access or block players without approval. The application rate limits still need hosted
  testing and do not replace edge controls.
- For an applicable zone, evaluate a narrowly scoped rule for `/api/sessions`,
  `/api/register` and `/api/recover`, grouped by IP, with **Block** and an HTTP 429
  response rather than an interactive challenge that an API fetch cannot solve. Select
  thresholds from observed legitimate traffic and staging tests, account for shared IPs,
  and monitor false positives. This is supplementary to the existing D1 per-IP and
  per-account limits, not a replacement. Free plans currently offer only one rule,
  IP characteristic and a 10-second period; available expression fields vary by plan.
  Do not configure a rule or buy an upgrade without verifying the actual plan/scope.
  [Cloudflare rate-limiting availability](https://developers.cloudflare.com/waf/rate-limiting-rules/).

## 4. Focused checks

- Local disposable Pages/D1 rehearsal passed registration, uniqueness, legacy GM login,
  cloud save, damage review, explicitly unverified Echo boards, recovery, session
  revocation and origin rejection. Scores can be forged; see Competition security.
- A loopback Node/SQLite smoke test sent 12 concurrent synthetic registrations from one
  IP bucket (10 accepted, 2 rate-limited) and 12 incorrect logins to one synthetic account
  (5 rejected, 7 rate-limited). It is deliberately small, not a capacity benchmark or
  evidence of hosted D1, Cloudflare IP headers, WAF, scrypt, paid/free quotas or sustained
  load. It is reproducible with `node tools/audits/local_abuse_rehearsal.mjs`.
- Still required: deploy the reviewed candidate only to the **isolated** staging project,
  confirm D1 binding before testing, then exercise synthetic registration, login, legacy
  GM, save, recovery, racing recovery, unverified ranking and atomic payout, rate enforcement and normal
  browser behavior. Test a bounded load with owner permission and budget, observe hosted
  errors/CPU/D1 and edge events, and include an independent security review. Do not use
  production as a load-test target or assume local wall time measures hosted CPU.
- The known intermittent camp-spacing smoke disagrees with the owner-approved current
  layout. The GM preset item-ID collision has a local fix and regression test, not yet
  deployed. Confirm the current complete test gate before merging.
- The latest v262 ranking and prize draft has not been deployed to staging. Production merge
  and deployment require a separate explicit decision, after the above and a compatible
  rollback plan. Never reapply migration 0007 to live `pg`; it was applied manually and
  does not automatically update Wrangler's migration ledger.

## Production backup and staged migration preparation (2026-10-30)

The owner reported a fresh `pg` backup saved privately in `Desktop/HH Save` and
verified in memory, with integrity/foreign-key/core-table checks passing. A
read-only production preflight found the email column and unique index present,
no Wrangler migration ledger and no new launch tables. A fixed-target import tool
is prepared for 0008–0011; it refuses to rerun 0007 or proceed on unexpected
schema, and fails closed on uncertain imports. Remote file imports can interrupt
production service. At this point the tool has only passed synthetic local tests;
production execution has not been reported. Do not run Wrangler's migration
runner against this manually migrated DB without separately reconciling its ledger.

**Later on 2026-10-30 the live picture changed.** A second fresh backup passed the
same integrity, foreign-key and core-table checks, but its schema report listed all
eight launch tables as already present (`damage_samples`, `damage_alerts`,
`competition_periods`, `competition_scores`, `competition_placements`,
`competition_prize_ledger`, `competition_baselines`, `unverified_echo_config`). The
read-only [launch schema check](../tools/staging/live_launch_schema_check.mjs) then
found every table column, all five triggers, all three indexes and the launch config
matching 0008–0011 — with `boardState: activated`, i.e. `starts_at` no longer 0.
`unverifiedConfig` only writes that value when the new board or save code serves a
request, so this is evidence that 0008–0011 are applied **and** that production is
already serving a build containing that code. `starts_at` holds the board's opening
boundary. Consequences: do not run the additive migration tool (it cannot re-apply and
cannot repair), and the assumption that production has never run the launch code is no
longer supportable. Still unverified from here: which build production serves, and
whether any prize period has settled — both need the owner's deployment list and GM
console, not a schema reading.

**The read-only check then passed, and `startsAt` resolves the prize question:**
`1793376000000` is `2026-10-31 00:00 Asia/Singapore`, the next midnight after the first
request reached the board code, and it was still in the future when read (about eleven
hours out). Only `unverified-echo.js` inserts `competition_periods`, and it skips any
window whose start is before `starts_at`; `competition-settlement.js` only advances rows
that already exist and are past `ends_at`. So no unverified-Echo period can have opened,
no settlement can have run and no prize can have been paid **before that boundary**. Two
consequences: the previous paragraph's "already serving" is confirmed without implying
payouts, and the ladder is armed to begin scoring at 00:00 SGT on 2026-10-31 whether or
not the remaining launch checks are finished. Anything that should happen before the
ladder starts — or a decision to move `starts_at` — is a production write that needs its
own reviewed, fixed-target tool; nothing in this repository can change it.

**What production actually serves (owner screenshot, 2026-10-30).** The live login card
reads `build 2026-10-29 haven-v262 unverified rankings`. So the deployed build is `main`
at v262: the unverified-rankings client and the 0008–0011 read paths are already in front
of real players, and the `haven-v263` write pause in PR #147 is **not** deployed. This is
consistent with the schema reading — the board code served requests, and the first one set
`starts_at`. The practical consequences:

- "Launch" as *shipping the code* has already happened. Records here that describe the
  launch as pending are describing the remaining **hardening**: MFA and least privilege, a
  bounded load test, an independent security review, and the write pause.
- Merging PR #147 is a deploy to a **live** game, not a dark one. It is also not urgent in
  the way the checklist implies: the pause only matters for recovery-speed restores.
- The unverified ladder begins counting at 2026-10-31 00:00 SGT under the accepted
  trade-off that client-reported scores can be falsified. Nothing in the schema check
  changes that decision; it only dates it.
