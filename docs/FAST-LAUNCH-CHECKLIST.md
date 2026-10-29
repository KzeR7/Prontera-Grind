# Fast noncompetitive launch checklist

2026-10-29. This is a working checklist, **not** an assertion that launch is safe.
Rankings and payouts remain paused in the draft; verify the actually deployed version
before making claims about production. Do not merge or deploy until the owner explicitly
approves the final candidate. No Cloudflare credentials, passwords, recovery codes,
backup contents or screenshots showing them should be shared in chat.

## 1. Password hashing — decision pending hosted test

PBKDF2-SHA256 at 600,000 was rejected by the owner's remote preview. The next
candidate is **scrypt N=16384, r=8, p=5** (an OWASP-listed profile), not a claim
that a lower PBKDF2 work factor meets the recommendation. The repository's actual
authentication still uses 20,000 PBKDF2 iterations and is unchanged.

The owner can run `tools/audits/hosted_scrypt_probe.mjs` with their existing Wrangler
login in the same way as the earlier PBKDF2 preview. It uses a separately named remote
preview Worker with no bindings, a random in-memory access token and only synthetic
inputs. It tests the RFC 7914 known-answer vector, one candidate derivation and, only
if that succeeds, two and three sequential derivations. It runs at most four authorized
requests plus an unauthorized rejection check. The vector uses a deliberately small
profile for correctness, not security. No game or D1 is deployed; preview usage may
still count toward the account's quota. `--local` is only a harness test.

A pass checks this preview's acceptance, not CPU quota headroom, actual Pages
integration, full registration/recovery, concurrency, sustained load or pricing. A
rejection (including timeout or runtime error) does not identify a safe alternative by
itself. No password algorithm change until implementation and migration/rollback are
reviewed and synthetic hosted staging tests pass; see [Password KDF plan](PASSWORD-KDF-PLAN.md).

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
  Neither tool has tested the real backup unless the owner explicitly runs it locally.
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
- Confirm the actual public hostname(s), Cloudflare zone, available plan, and whether the
  owner can attach rules to each hostname. Zone-level rules for a custom domain must not
  be assumed to cover a direct `pages.dev` hostname or other bypass routes. Do not assume
  the staging project and production have identical rules or bindings.
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
- The latest full JS gate was 147 pass / 4 known failures: three tests still expect
  competition to be live, and one retains the old camp-spacing assertion. A separately
  observed intermittent GM preset item-ID collision remains unresolved; assess its item
  identity impact before opening real accounts.
- The latest draft changes after v258 have not been deployed to staging. Production merge
  and deployment require a separate explicit decision, after the above and a compatible
  rollback plan. Never reapply migration 0007 to live `pg`; it was applied manually and
  does not automatically update Wrangler's migration ledger.
