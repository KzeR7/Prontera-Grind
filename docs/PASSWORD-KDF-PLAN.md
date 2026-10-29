# Password hashing: hosted result and next options

2026-10-29. This is an investigation, not an authentication deployment. The draft
still uses PBKDF2-HMAC-SHA256 at **20,000** iterations. New registrations, existing
accounts and recovery hashes have not been changed by the experiments below.

## Owner-reported hosted preview result

The owner ran `tools/audits/hosted_pbkdf2_probe.mjs` using their existing Wrangler
login. The separately named Cloudflare remote Worker preview used synthetic data and
no D1 binding. The owner reported these results:

| PBKDF2-HMAC-SHA256 iterations | Response |
| ---: | --- |
| 20,000 | accepted, HTTP 200 |
| 100,000 | accepted, HTTP 200 |
| 100,001 | rejected, HTTP 422, `NotSupportedError`: above 100,000 unsupported |
| 600,000 | rejected, HTTP 422, `NotSupportedError`: above 100,000 unsupported |

Elapsed times in the report include the local proxy and network; they are not
Cloudflare CPU measurements. Because 600,000 was rejected, the probe did not run
its 600,000 registration/recovery shapes. The later `MODULE_NOT_FOUND` was caused by
accidentally concatenating two PowerShell commands and is not a PBKDF2 result.

This confirms the limit in **that remote preview**, not automatically every
Cloudflare account, future runtime, or the actual deployed Pages Functions. It
rules out assuming 600,000 PBKDF2 works there. 100,000 is not equivalent to
[OWASP's 600,000 PBKDF2-HMAC-SHA256 recommendation](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html)
and was not tested as a full registration, legacy upgrade or recovery under
production CPU limits. Do not raise the live constant on the strength of this probe.

## Owner-reported hosted scrypt preview (2026-10-29)

The owner ran `tools/audits/hosted_scrypt_probe.mjs` twice. Both synthetic remote
preview runs returned HTTP 200 for the RFC 7914 vector and for one, two and three
sequential candidate-profile scrypt derivations (N=16384, r=8, p=5). All requests
were accepted. Reported elapsed times included the network and proxy, so they do not
measure hosted CPU. No D1 or production accounts were involved. These are isolated
acceptance checks, **not** real Pages integration, sustained capacity, a concurrent
resource test or proof of sufficient quota and affordability.

A disconnected research adapter is in `tools/prototypes/scrypt_passwords.mjs` with
synthetic coverage in `tools/tests/scrypt_password_prototype_sim.js`. It exercises a
fixed bounded candidate profile, legacy PBKDF2 verification followed by upgrade only
on success, and a recovery-style verification without a discarded upgrade. It is not
imported by the repository's Functions. The draft now includes a separately implemented
bounded **reader only** for the same synthetic format; password and recovery writes still
use PBKDF2 at 20,000. A local Pages/D1 experiment also wires the prototype writer into a
temporary Functions copy only; see [isolated staging](ISOLATED-STAGING.md). Neither has
changed real stored hashes. The format and code are not yet approved for production;
hosted endpoint integration, migration, rollback, CPU, memory and load tests remain necessary.

If this reader-only revision is ever deployed before a later writer, it could be a
rollback candidate for already-upgraded accounts. That is **not yet a tested rollback**:
its resets, recoveries and new registrations still create PBKDF2 hashes at the weaker
20,000 setting, and rollback to earlier versions without the reader would lock out scrypt
accounts. Any rollback would therefore temporarily weaken hashes on those write paths;
monitor, communicate and re-upgrade after the issue is resolved. Reader compatibility,
release ordering and rollback must be verified on isolated hosted staging first.

## Options, not yet approved for deployment

1. **Argon2id on a suitable service/runtime.** OWASP prefers Argon2id (one minimum
   profile: 19 MiB, two passes, one lane). Cloudflare documents that its Node
   `argon2` API is not supported; an independently reviewed compatible implementation
   or a separate authentication service would be needed. Measure CPU, memory,
   concurrency, dependencies, pricing and migration/rollback on the intended platform.
2. **scrypt where supported and provisioned.** OWASP lists several memory/parallelism
   combinations, including N=2^14, r=8, p=5. Cloudflare documents support for Node
   crypto APIs, including scrypt. The owner's synthetic remote preview accepted this
   profile, but its CPU/memory limits, capacity and actual Pages integration have not
   been verified. The
   2026-10-01 compatibility date must retain the appropriate Node compatibility.
   `scrypt` has memory-amplification and CPU costs; test concurrency and denial of
   service as well as individual calls. Using a lower setting solely to fit an
   unverified quota is not automatically adequate.
3. **Managed authentication service.** A suitably provisioned provider can handle a
   modern password KDF, but email behavior, account recovery, existing accounts,
   GM roles, privacy, pricing and safe migration need review. Do not introduce email
   verification as a requirement for existing players without the owner's decision.

A local workerd investigation of option 2 is available with
`PG_MINIFLARE_MODULE=<local-miniflare-directory> node tools/audits/scrypt_workerd.mjs`.
On Node 22.22.3, Miniflare 5.20261023.1-beta/workerd 1.20261023.1 with compatibility
date 2026-10-01, the RFC 7914 synthetic known-answer vector passed and five
sequential synthetic samples using N=16384, r=8, p=5 had median local request
wall times of 181.91 ms (one derivation), 366.55 ms (two) and 546.82 ms (three).
The estimated scrypt working memory for that profile is approximately 16 MiB per
derivation, plus implementation/application overhead; it was not measured in the
probe. This is not hosted CPU, a memory/concurrency test, an end-to-end account
benchmark or a production-ready password implementation. Actual registration and
recovery have database and other costs. Cloudflare's documented Free Workers limit
is 10 ms CPU per HTTP request, though its accounting and flexibility must be
measured on the actual plan/runtime; local wall time cannot establish a violation
or safe headroom.

## Migration and release requirements

- First choose an affordable platform and a modern KDF/profile, verify the deployed
  runtime and quota on a separate staging project with synthetic accounts, and test
  legitimate concurrent load and resource-exhaustion defenses. No public unthrottled
  benchmark, production D1 or real credentials.
- Use a versioned, bounded hash format. Retain support for old PBKDF2 hashes and
  change a password hash only after successful verification, using the existing
  compare-and-swap/session race protections. Recovery still requires email **and**
  the existing one-time recovery code; a successful recovery rotates the code and
  revokes sessions. Keep email-less legacy login and current GM privileges.
- Plan a compatible rollback **before** writing stronger hashes: an older release
  that cannot verify the new scheme can lock out upgraded accounts. Back up and
  rehearse restoration separately, monitor failures and costs, and require explicit
  owner approval for deployment.
- The hosted probe did not change the live setting, execute migrations or access
  account data. Rankings and leaderboard payouts remain paused on the draft.

References: [OWASP password storage](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html),
[Cloudflare Node crypto support](https://developers.cloudflare.com/workers/runtime-apis/nodejs/crypto/),
[Cloudflare Workers limits](https://developers.cloudflare.com/workers/platform/limits/).
