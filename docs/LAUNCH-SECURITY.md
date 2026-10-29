# Launch security and accounts

This is a staged hardening change, **not** a security certification. Do not deploy
until staging and the remaining security work have been completed. The owner reported
a production backup and manual application of migration 0007 on 2026-10-28, and
verified the column and index. This agent did not access or change production.

## Required deployment order

1. Back up D1 and rehearse restoration on an isolated copy. The owner reported that
   0007 was applied manually to production and verified; **do not run it again** there.
   Apply it once to each new staging database only after inspecting its schema. SQLite's
   `ALTER TABLE ADD COLUMN` is not rerunnable. Manual SQL does not update Wrangler's
   migration ledger, so do not blindly use `wrangler d1 migrations apply` against an
   installation with manually applied migrations. Old accounts retain `NULL` email and
   continue to sign in. Never edit existing save blobs for this.
2. Audit existing `users.gm` values, especially if a database was ever exposed
   before its first owner signed up. Registration now creates players only. Existing
   owners are not demoted. If an owner must be established, an authorized operator
   should register the intended account, independently verify its identity, and
   promote that exact account through D1's authenticated console (`gm=2`). Confirm
   exactly one intended row changed and review access logs; don't publish passwords.
   Protect the Cloudflare account with MFA and least-privilege access.
3. `--gm-all` is implemented only by the disposable Node preview router; the deployed
   registration handler ignores `DEV_GM_ALL`. It deliberately makes every local preview
   registration an owner, so never expose that preview to untrusted users or connect it
   to production data. The current `wrangler.toml` names the production D1 database;
   do not test branch previews until they have a separately configured staging database.
4. The disposable [local Pages/D1 rehearsal](ISOLATED-STAGING.md) exercises the real
   local Wrangler runtime and synthetic accounts, but is not hosted staging. Configure a
   separately isolated Cloudflare staging project/database and verify its binding before
   running platform-specific tests; do not use a branch preview wired to live `pg`.
5. Test registration, login, recovery, session revocation, chat, save, GM access and
   password reset on the actual Pages/D1 runtime. The local SQLite shim cannot prove
   Cloudflare CPU limits, D1 behavior, cookie policies or browser email delivery.

## Email and recovery

New cloud registrations require an email address. Addresses are trimmed and folded to
lowercase and protected by a database unique index, including concurrent registrations.
Existing accounts without an email still work; they require GM assistance for recovery.
Email is **not verified**, so someone can enter another person's address, and aliases
can bypass one-address-per-person. The system does not send email. Add a verified
email provider and a safe account-email change flow before treating email as identity,
or claiming one account per person. Protect email data in backups and access policies.

Password recovery requires account name, registered email **and** the recovery code
shown at registration. Successful use changes the password, revokes all sessions and
rotates the code; the replacement appears once on screen and must be saved. If a reset
response is lost or an older account has no email, contact an owner for manual help.
The email alone is not a password-reset credential. The recovery endpoint uses IP and
account rate limits, but add and monitor Cloudflare WAF/rate rules before launch.

## Competition and remaining launch work

Kills and Echo DPS currently originate in editable browser saves. Both leaderboards
and automatic Echo leaderboard prize settlement are paused server-side; normal cloud
saves and personal gameplay continue. Existing recorded scores and grants are not
removed. Do not re-enable rankings or payout from those records: build server-authoritative
scoring, a trustworthy period cut-off and atomic, retryable prize settlement first.
Client-side anti-cheat, a numerical cap or AI detection alone cannot make scores fair.
The old Echo scoring and settlement entry points now fail closed even if accidentally
called. See [Competition security](COMPETITION-SECURITY.md) for untrusted legacy
records, server-authority requirements and the disconnected settlement prototype.

PBKDF2 remains at 20,000 iterations for now, below OWASP guidance. The owner-reported
Cloudflare remote preview accepted 100,000 but explicitly rejected 100,001 and 600,000.
This is not an end-to-end Pages CPU/quota test. The local
[password-hashing audit](CAMP-AUTH-AUDIT.md) cannot establish hosted limits because
open-source workerd overrides them; see [Password KDF plan](PASSWORD-KDF-PLAN.md).
**Do not simply raise the constant:** evaluate a suitably provisioned
authentication service or plan, test the actual hosted runtime,
and safely migrate old hashes. Legacy recovery verification no longer computes a
password-style upgrade that would be discarded before recovery rotates the code;
legacy password login still upgrades. A disposable local 600,000-iteration candidate
passed account and recovery checks, but this is not hosted proof. Plan rollback for
already-upgraded hashes before any change. See
https://github.com/cloudflare/workerd/issues/1346 and
https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html.

Before public launch: enable MFA for administrators, test Cloudflare WAF, rate limits,
DDoS and resource-cost budgets, review session and recovery flows, backups/restore,
monitoring/alerting, CSP and headers, mobile devices, production dependencies and an
independent penetration/load test. The login and recovery limits and body cap are
application defenses, not a substitute for edge controls. CDN Three.js has a pinned
integrity digest but still requires CDN availability. No email verification, live WAF,
load test, real payment setup, or fully server-authoritative game simulation is included.
