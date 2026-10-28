# Camp layout and password-hashing investigation

Local investigation, 2026-10-29. Neither the camp layout nor the PBKDF2 work factor
has been changed. Competition remains paused. This is not a balance guarantee,
hosted performance test or approval to deploy.

## Camp radius: measurements and a proposed option

`fillCamp()` has a nominal 2.9-unit radius, but its two wider candidate tiers run
up to 4.205 and 5.075 units. The algorithm can select a wider candidate because
it is the best valid spacing candidate, not only when all closer candidates fail.
The existing `field_loop_smoke.js` asserts a 3.35-unit maximum; that assertion is
unchanged. At least one monster per camp and the 2.6-unit preferred monster gap
are also important. The first-monster emergency fallback can relax that gap; it
is not an absolute guarantee.

An **unapproved, in-memory-only prototype** changes both wider tiers to 3.35,
leaving other placement logic intact. `node tools/audits/camp_spacing.cjs`
executes real game code on seeded layouts: 500 fields per scenario per version,
6,000 fields total. It includes Payon's water stage and regular 8-, 10- and
12-camp fields. The source `index.html` SHA-256 was
`a8c4bdb5447d71d7c793deb4789661f3e23e08267219c1c257b66fb7b3d5d2bc`.
The same starting seeds are used, but variants consume different random draws as
branches diverge: averages are sample distributions, not controlled estimates of
individual layouts or proof of a causal population change.

| Regular map/stage | Fields with a monster >3.35 (current → prototype, out of 500) | Mean monsters (current → prototype) | Smallest monster pair (current → prototype) |
| --- | ---: | ---: | ---: |
| Prontera 0/3 | 465 → 0 | 11.69 → 11.80 | 2.611 → 2.779 |
| Payon 4/4 (water) | 485 → 0 | 14.71 → 14.78 | 2.612 → 2.622 |
| Amatsu 7/4 | 500 → 0 | 28.93 → 28.99 | 2.603 → 2.613 |
| Abyss 9/4 | 500 → 0 | 28.96 → 29.07 | 2.602 → 2.604 |
| Astral Citadel 10/3 | 500 → 0 | 28.89 → 28.98 | 2.605 → 2.613 |
| Thor Volcano 11/3 | 500 → 0 | 28.87 → 28.96 | 2.604 → 2.600 (rounded) |

Across these samples the current maximum radius was 5.075; the prototype maximum
was 3.35 (subject to floating-point rounding). Both stocked every camp, had no
monster pairs below 2.6, and had no monster outside the lane bounds or in the
water exclusion zone. The emergency fallback still placed some monsters exactly
on the lane boundary in both versions; the script reports those counts. These
results do not cover all maps, seeds, boss fields, respawns, moving monsters,
long-running play, visual appearance or balance effects. Tighter camps could
change target selection, movement, wake/assist behavior and ground-field damage,
even when counts and spacing remain acceptable.

As an additional experiment, five normal randomized runs of the **unchanged**
`field_loop_smoke.js` passed 9/9 with the prototype substituted in memory; the
unchanged `starter_sim.js` passed 11/11. To repeat without modifying the game:

```sh
node -r ./tools/audits/camp_prototype_preload.cjs tools/tests/field_loop_smoke.js
node -r ./tools/audits/camp_prototype_preload.cjs tools/tests/starter_sim.js
```

The preload is solely for local experiments; never use it for a build or deployment.
Without the preload, the current game and original camp smoke remain unchanged.
**Owner decision (2026-10-29):** Keep the current camp layout; do not implement
the tighter prototype. The original 3.35-unit assertion remains unchanged and
its conflict with the existing layout remains unresolved. Do not alter gameplay or
weaken the assertion without further owner approval.

## Password hashing: local results, not a hosted limit

`functions/_lib/auth.js` uses PBKDF2-HMAC-SHA256 at **20,000** iterations with
random 16-byte salts and stores the iteration count in each hash. A successful
login can upgrade a stale password hash transactionally. This is weaker than
[OWASP's password-storage guidance](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html):
Argon2id is preferred where available; for PBKDF2-HMAC-SHA256 OWASP recommends
600,000 iterations. A high work factor is no substitute for rate limits, monitoring,
and strong session/recovery handling.

A local investigation found successful verification of an older recovery hash
unnecessarily computed a password-style upgrade that was then discarded: recovery
rotates the code instead. The draft now avoids only that discarded computation;
legacy password login upgrades remain intact. `recovery_hash_sim.js` checks the
number of actual derivations, legacy login upgrade, one-time rotation and session
revocation. There is **no iteration or hash-format change**.

`tools/audits/pbkdf2_workerd.cjs` uses synthetic inputs and a local Miniflare
worker, no account database or real credentials. This run used Node v22.22.3,
Miniflare 5.20261023.1-beta, workerd 1.20261023.1, compatibility date 2026-10-01,
12 sequential samples per case after warmup. Values below are **local elapsed
wall-clock milliseconds**, including local request overhead, not CPU usage; there
is no D1, hosted request, concurrency or rate limiting in the measurement:

| Iterations for new hashes | One derivation median | Registration-shaped: two | Login-upgrade-shaped: old 20k + new | Recovery-shaped: three at new count |
| ---: | ---: | ---: | ---: | ---: |
| 20,000 | 5.32 ms | 8.61 ms | 8.36 ms* | 11.57 ms |
| 50,000 | 9.88 ms | 17.65 ms | 12.86 ms | 25.22 ms |
| 100,000 | 17.86 ms | 32.77 ms | 20.69 ms | 48.71 ms |
| 600,000 | 95.91 ms | 187.49 ms | 97.45 ms | 279.89 ms |

\* An equal-cost stored hash does not actually trigger an upgrade; this is a
hypothetical two-derivation measurement. For higher counts, recovery assumes an
already-upgraded code; an older code's verification cost depends on its stored count.
Registration runs its two hashes in sequence; recovery models a verification then
`Promise.all` for the two replacement hashes. Results do not measure full endpoints.

The local runtime accepted 20,000, 100,000, 100,001 and 600,000 iterations.
**This does not establish what hosted Cloudflare accepts.** Cloudflare's workerd
[limit proposal](https://github.com/cloudflare/workerd/pull/7550) explicitly says
open-source server/test fixtures override the PBKDF2 limit, so a local acceptance
probe cannot establish the hosted ceiling. Cloudflare documents a 10 ms CPU limit
for Workers Free and a higher, configurable paid limit, with some flexibility for
infrequent overages: [Workers limits](https://developers.cloudflare.com/workers/platform/limits/).
Pages Functions are billed as Workers; see [pricing](https://developers.cloudflare.com/workers/platform/pricing/).
The account's actual plan, hosted CPU usage, iteration limit, error behavior and
cost under load have **not** been verified. Do not assume local elapsed time is
hosted CPU time or that a short successful trial proves sustained quota safety.

To reproduce locally, install a compatible Miniflare separately or set
`PG_MINIFLARE_MODULE` to an existing local module directory, then run
`node tools/audits/pbkdf2_workerd.cjs`. The tool binds its internal runtime to
localhost, uses only synthetic input, returns no hashes, and disposes it afterward.
It does not invoke Wrangler, a remote account, D1 or deploy anything.

**Decision still required:** evaluate a properly provisioned authentication service
or a suitable Workers plan/runtime supporting a modern KDF. Separately arrange an
owner-approved, private, synthetic-only hosted staging experiment with verified
staging binding, CPU/error telemetry, controlled rate and cleanup. Test acceptance,
registration, ordinary and stale-hash login, recovery, session races, concurrent load
and cost. Never expose a public, unthrottled benchmark. Keep the current hash setting
until the hosted limits, migration behavior and resource budget have been checked;
20,000 remains a material launch security gap, not a recommended destination.
