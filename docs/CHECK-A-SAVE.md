# Checking what a save is actually stamped with

When a player reports "I relogged and I am back at Lv 1", the first question is what the server holds
for that account. This is the query that answers it, and how to read the answer.

Run it in **Workers & Pages → D1 → `pg` → Console** (or `npx wrangler d1 execute pg --remote`),
replacing the name:

```sql
-- What the server holds for one account, who the save says it belongs to, and whether that is wrong.
SELECT u.id,
       u.username,
       json_extract(s.blob, '$.owner')     AS save_owner,      -- the name written into the save
       json_extract(s.blob, '$.accountId') AS save_account_id, -- v280+: the durable users.id
       json_extract(s.blob, '$.lv')        AS lv,
       s.version,
       datetime(s.updated_at / 1000, 'unixepoch') AS last_written,
       CASE
         WHEN s.user_id IS NULL                                   THEN 'no save on the server'
         WHEN json_extract(s.blob, '$.accountId') = u.id          THEN 'OK - the id matches'
         WHEN json_extract(s.blob, '$.accountId') IS NOT NULL     THEN 'WRONG ACCOUNT - a different id'
         WHEN lower(json_extract(s.blob, '$.owner')) = lower(u.username) THEN 'OK - the name matches'
         ELSE 'NAMES ANOTHER ACCOUNT - a rename, or somebody else''s save'
       END AS verdict
FROM users u
LEFT JOIN saves s ON s.user_id = u.id
WHERE u.username = 'cloud8909';
```

The `verdict` column is the point of the query: it compares the save's identity with the account that
holds it, so the answer does not depend on the reader spotting a mismatch.

## Reading it

| `verdict` | `lv` / `version` | What it means |
|---|---|---|
| `OK - the id matches` | their real level | **Nothing is wrong with the save.** Whatever they saw was the client losing or refusing its own copy, not a lost save. |
| `OK - the name matches` | their real level | Same: a healthy save from before v280. It gains the id on its next write. |
| `OK - ...` | **1 or 2, with a high `version`** | The Lv 1 save was **written** — it reached the server and won. The old level is in `save_history`; list it before restoring. |
| `NAMES ANOTHER ACCOUNT` | any | A real identity mismatch — either a rename (the case v280 addresses) or somebody else's save in that row. **This is the only verdict where v280 is the fix.** |
| `WRONG ACCOUNT` | any | The blob carries a *different* account's id. The server refuses it on read and write; do not overwrite, investigate first. |
| `no save on the server` | — | The account never synced. The progress never left that browser, so there is nothing to restore. |

`save_account_id` being `NULL` is normal for any save written before v280 — a name-only stamp is judged
by the name.

The `LEFT JOIN` matters: an account with no save still shows up, with `lv` and `save_owner` empty.

## If the level needs recovering

`save_history` keeps the last few blobs per account (`0001_init.sql`), and the GM console can restore
one. List them first — never restore blind:

```sql
SELECT version, json_extract(blob, '$.lv') AS lv,
       datetime(saved_at / 1000, 'unixepoch') AS saved
FROM save_history
WHERE user_id = (SELECT id FROM users WHERE username = 'cloud8909')
ORDER BY version DESC;
```

Any write is destructive, so `docs/LAUNCH-SECURITY.md` §2 applies: run the `SELECT` first, and guard
the `UPDATE` with both the id and the value you expect to replace.

## A note on the v280 fix

v280 makes the save's identity the account id instead of its name. It fixes an account whose **name
changed** while its save was stamped with the old one. If a player was never renamed and still came
back at Lv 1, v280 is correct but is *not* their cause — check this query before assuming it is.
