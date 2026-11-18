-- haven-v422: an offline claim freezes WHO it was priced for, not just how much.
-- The kill budget was always frozen at issuance; the class and progression-run the budget was
-- measured from were not. A class change or Novice reset between issuance and claim used to let
-- the new class collect at the old class's speed.
--
-- Both columns are nullable: NULL means "issued before ownership existed" (a legacy pending
-- claim), and those claims keep working exactly as before - they are consumed by the next
-- versioned save as they always were, and the client pays them under its own sample-ownership
-- rules. No existing row is rewritten and no account can be trapped: consumption rules are
-- unchanged, the columns only let the paying client recognise a claim that is not its own.
-- Apply after 0017_announcement_gifts.sql. Statements are not re-runnable on a database that
-- already has the columns, like every ALTER TABLE migration before this one (0007, 0016).

ALTER TABLE offline_reward_claims ADD COLUMN cls TEXT;
ALTER TABLE offline_reward_claims ADD COLUMN run_gen INTEGER;
