# Fast noncompetitive launch checklist

2026-10-29. This is a working checklist, **not** an assertion that launch is safe.
Rankings and payouts remain paused in the draft; verify the actually deployed version
before making claims about production. Do not merge or deploy until the owner explicitly
approves the final candidate. No Cloudflare credentials, passwords, recovery codes,
backup contents or screenshots showing them should be shared in chat.

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

The loopback protocol test passes with real Functions and in-memory SQLite, including
cleanup on an injected failure. The Windows/Wrangler path and actual hosted run remain
unverified until the owner runs them. Never run against a production host or database.

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
  cloud save, paused Echo board, recovery, session revocation and origin rejection.
  Additional local security tests covered race conditions and forged score rejection.
- A loopback Node/SQLite smoke test sent 12 concurrent synthetic registrations from one
  IP bucket (10 accepted, 2 rate-limited) and 12 incorrect logins to one synthetic account
  (5 rejected, 7 rate-limited). It is deliberately small, not a capacity benchmark or
  evidence of hosted D1, Cloudflare IP headers, WAF, scrypt, paid/free quotas or sustained
  load. It is reproducible with `node tools/audits/local_abuse_rehearsal.mjs`.
- Still required: deploy the reviewed candidate only to the **isolated** staging project,
  confirm D1 binding before testing, then exercise synthetic registration, login, legacy
  GM, save, recovery, racing recovery, paused ranking/payout, rate enforcement and normal
  browser behavior. Test a bounded load with owner permission and budget, observe hosted
  errors/CPU/D1 and edge events, and include an independent security review. Do not use
  production as a load-test target or assume local wall time measures hosted CPU.
- The latest full JS gate was 151 pass / 3 failures: three tests still expect competition
  to be live. The camp-spacing smoke passed this run, but it failed previous runs and its
  historical disagreement with the chosen layout is not resolved. A previous run exposed
  the intermittent GM preset item-ID collision, which remains unresolved; assess its item
  identity impact before opening real accounts.
- The latest draft changes after v258 have not been deployed to staging. Production merge
  and deployment require a separate explicit decision, after the above and a compatible
  rollback plan. Never reapply migration 0007 to live `pg`; it was applied manually and
  does not automatically update Wrangler's migration ledger.
