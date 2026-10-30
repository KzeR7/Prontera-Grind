# Isolated hosted scrypt writer experiment

This is preparation for **staging only**, not a production migration. The owner
reported successful synthetic hosted scrypt-reader login/recovery, session revocation,
paused leaderboard and cleanup on the reader-only staging deployment at commit
`7511a03`. That deployment still writes PBKDF2; it is a potential rollback candidate,
but a hosted rollback has not been rehearsed. See [Password KDF plan](PASSWORD-KDF-PLAN.md).

## Preparing the candidate

`tools/staging/prepare_hosted_scrypt.mjs` archives the fixed reader commit `7511a03`
from a local repository into a **new OS temporary directory**. It then creates a
fresh Wrangler config naming only `prontera-grind-staging` and the isolated
`pg-staging` D1 UUID `3a38c6fc-96a8-491d-b97b-fd536e575ca4`. It patches only that
temporary copy with the previously tested research scrypt writer. It **does not**
deploy, run migrations, use Cloudflare credentials, modify a Git checkout, or access
any database. On failure it removes its temporary directory. Preparation has been
tested on Linux; Windows execution remains unverified. Do not alter this temporary
config to point at production, or use the copied code as a production release.

The candidate uses the same fixed scrypt N=16384, r=8, p=5 profile used by the hosted
reader. In the candidate, new registration, recovery and GM password resets write
scrypt; successful legacy PBKDF2 login verifies first, then attempts an atomic upgrade.
Only synthetic staging accounts may be used. A synthetic GM1 account and other staged
accounts may acquire scrypt hashes upon login, but real users must not be moved there.
The generated config includes only the D1 binding; it may omit other staging bindings
such as social services. Check the staging project's needs before any deployment.

## Tests and rollback limitations

- Local tests prepared the exact archived candidate and verified its configuration,
  new scrypt password/recovery creation, legacy verification and upgrade, and the
  reader-only revision accepting a writer-created scrypt hash. The equivalent
  temporary-copy local Pages/D1 experiment tested registration, legacy upgrade,
  recovery/races, GM reset, sessions and the competition pause. This does not prove
  hosted writer endpoints, CPU limits or resource safety.
- Before deploying the candidate **only to the isolated staging project**, confirm its
  generated project and DB bindings, and understand that staging accounts may be upgraded.
  No migrations are needed; never run 0007 again on production.
- Test synthetic new registration, a legacy PBKDF2 login upgrade, recovery-code rotation,
  GM access/reset, revocation, D1 stored-format checks without exposing hashes, paused
  rankings and reasonable bounded load. Observe hosted errors/CPU and the account's quota
  and costs; a small successful run is not capacity or denial-of-service proof.
- Rehearse rollback of staged scrypt accounts to the previously deployed reader-only
  revision `7511a03`, and verify both login and recovery. That reader writes weaker
  PBKDF2 on new registration or reset/recovery, so rollback temporarily weakens those
  write paths. Versions older than the reader cannot authenticate scrypt accounts.
  A real release needs a reviewed versioned format, compatible rollback, fresh backups,
  MFA/edge protection and explicit owner approval before any production write or deploy.
