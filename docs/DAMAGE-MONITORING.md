# Damage monitoring draft

This is a local development draft, not currently deployed or collecting live data.
It is review-only: it does not alter saves, equipment, gameplay, attempts, scores,
rewards or bans. Existing GM actions remain separate. The local launch draft enables unverified rankings and prizes; monitoring does
not make them trustworthy. The earlier hosted staging test used a paused build.

## What is recorded

After an accepted cloud save, the server reads the **client-reported** cumulative
`dmg`, current map/stage, and the largest of the Echo `trial.best`, `dayDps`, and
`weekDps` fields. Echo values are high-water marks, not a history of every run;
practice and ordinary individual hits are not collected. `dmg` is cumulative
(including Echo) and can reset; it is **not field DPS**. Local-only/offline play,
failed/rejected saves, omitted fields and periods without a cloud save are not
observed. A modified browser can omit, forge or manipulate all of these values.
Monitoring failures are caught after save acceptance and do not reject the save;
they can result in gaps.

Each account has at most 28 sample slots, at most one accepted save per six-hour
UTC bucket. A slot is overwritten when its bucket cycles; inactive accounts can
retain old samples longer than seven days. An account can also have at most one
alert for each of two kinds. Rows cascade when an account is deleted. Reported numeric
values are clipped at 1 trillion for storage/display (shown as ≥); map/stage
are bounded. No raw save or equipment is copied into these tables. Best-effort
monitoring adds up to four changed sample rows per active account per day, plus
at most one changed row per flag kind per six hours for a flagged account. Index
updates may add D1 row-write costs. Every accepted save still issues monitoring
SQL, even when the row is unchanged; measure actual
D1 operations, quota and cost before any hosted enablement. Alerts persist until
the account is deleted; no dismiss/retention UI exists yet. The global list shows
the latest 100 alerts, while per-player samples are accessible in the Damage tab.

## Review flags

A negative or non-finite numeric cumulative damage value raises an
`invalid-total-damage` flag. Missing/null values are not flagged. This is a
data-integrity clue, not proof of cheating; the sample does not store the
invalid value.

A reported Echo best **above 100,000,000 DPS** raises one `echo-over-100m`
review flag. This is the existing old Echo board sanity cap, reused as a
conservative starting point only; it has **not** been validated as a ceiling for
legitimate builds, and may flag legitimate or GM-test saves. Once raised it is
updated no more often than every six hours, so the displayed maximum can miss
later increases within that interval. Repeated high-water marks can generate
multiple observations without new runs. The threshold is not compared with field
DPS or a player average and cannot change gameplay. There is no automatic
punishment or exclusion. A flag is a hint for a human, not proof of cheating;
no flag does not establish that a player is clean. The rule does not identify
other abnormal field damage or believable-looking manipulated Echo values.

Only authenticated GMs may access `/api/gm/damage` or `/api/gm/damage?id=…`.
The console lists flags and exposes each player's snapshots on the Damage tab.

## Testing and rollout

Run `node tools/tests/damage_monitor_sim.js` and the existing save, GM and unverified
competition suites. `migrations/0008_damage_monitoring.sql` is additive and is
applied by the disposable local DB test harness only. Never use historical,
reverted versions of migration 0008. The monitoring schema was tested on isolated hosted staging; the current ranking
changes still require a separately approved hosted staging test; deploying
code without the table leaves monitoring unavailable but does not stop saves.
No production migration, push or deployment is authorized by this draft.
