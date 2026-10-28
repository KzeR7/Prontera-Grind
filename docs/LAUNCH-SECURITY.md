# Launch security and accounts

This is a staged hardening change, **not** a security certification. Do not deploy
until the migration and a staging rehearsal have been completed. No Cloudflare
settings or production data were changed by this work.

## Required deployment order

1. Back up D1 and rehearse restoration. Apply `migrations/0007_account_email.sql`
   **once** to a staging copy, then to production before deploying the new code.
   Unlike `CREATE IF NOT EXISTS`, SQLite's `ALTER TABLE ADD COLUMN` is not safe to
   rerun. Use your migration ledger/dashboard to check first. Old accounts retain
   `NULL` email and continue to sign in. Never edit existing save blobs for this.
2. Audit existing `users.gm` values, especially if a database was ever exposed
   before its first owner signed up. Registration now creates players only. Existing
   owners are not demoted. If an owner must be established, an authorized operator
   should register the intended account, independently verify its identity, and
   promote that exact account through D1's authenticated console (`gm=2`). Confirm
   exactly one intended row changed and review access logs; don't publish passwords.
   Protect the Cloudflare account with MFA and least-privilege access.
3. Never set `DEV_GM_ALL` on a real deployment. `--gm-all` exists only for a
   disposable local preview and deliberately makes every registered account an owner.
4. Test registration, login, recovery, session revocation, chat, save, GM access and
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

PBKDF2 remains at 20,000 iterations for now. OWASP recommends a stronger password KDF;
Cloudflare Workers has had a 100,000 iteration PBKDF2 ceiling, and the free CPU budget
may also constrain registration/login. **Do not simply raise the constant:** benchmark
and test the target runtime, choose a suitably provisioned authentication service or
plan, and migrate old hashes on successful login. See
https://github.com/cloudflare/workerd/issues/1346 and
https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html.

Before public launch: enable MFA for administrators, test Cloudflare WAF, rate limits,
DDoS and resource-cost budgets, review session and recovery flows, backups/restore,
monitoring/alerting, CSP and headers, mobile devices, production dependencies and an
independent penetration/load test. The login and recovery limits and body cap are
application defenses, not a substitute for edge controls. CDN Three.js has a pinned
integrity digest but still requires CDN availability. No email verification, live WAF,
load test, real payment setup, or fully server-authoritative game simulation is included.
