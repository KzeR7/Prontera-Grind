-- haven-v423: an offline claim is a priced entitlement, not a pointer back to a mutable save.
--
-- 0018 froze the owner (class + progression run). These nullable columns freeze the eligible
-- measured minute and the exact server interval at issuance as well. NULL is intentionally the
-- compatibility shape for claims issued before this migration, or for an old save whose sample
-- cannot prove its owner: those claims use the documented legacy recovery path rather than being
-- rewritten or silently discarded.
--
-- Apply after 0018_offline_claim_owner_context.sql. This is additive and deliberately a new
-- migration: installations that have already recorded 0018 must receive these columns separately.

ALTER TABLE offline_reward_claims ADD COLUMN income_xp REAL;
ALTER TABLE offline_reward_claims ADD COLUMN income_zeny REAL;
ALTER TABLE offline_reward_claims ADD COLUMN income_job REAL;
ALTER TABLE offline_reward_claims ADD COLUMN income_kph REAL;
ALTER TABLE offline_reward_claims ADD COLUMN source_map INTEGER;
ALTER TABLE offline_reward_claims ADD COLUMN source_stage INTEGER;
ALTER TABLE offline_reward_claims ADD COLUMN income_version INTEGER;
ALTER TABLE offline_reward_claims ADD COLUMN reward_version INTEGER;
ALTER TABLE offline_reward_claims ADD COLUMN sampled_at INTEGER;
ALTER TABLE offline_reward_claims ADD COLUMN interval_start_at INTEGER;
ALTER TABLE offline_reward_claims ADD COLUMN interval_end_at INTEGER;
