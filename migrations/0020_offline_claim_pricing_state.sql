-- haven-v424: distinguish legacy recovery from a newly issued ineligible claim.
--
-- 0019 freezes a valid pricing snapshot, but its all-NULL shape could mean either an old,
-- genuinely legacy row or a new row for which the stored save had no eligible sample. Those
-- meanings must never share the client fallback: an old row may recover from its matching local
-- sample; a newly ineligible entitlement must acknowledge at zero and can never be repriced later.
--
-- Existing rows are classified once, without changing their payout or acknowledgement rows:
--   legacy   : every 0019 snapshot field is NULL (including pre-0019 rows carried through 0019)
--   priced   : a complete, plausibly shaped frozen snapshot
--   corrupt  : a partial or malformed historical snapshot; the client rejects it safely
-- New code writes only priced or ineligible. The function verifies this column before issuing a
-- new claim, so a function-first rollout cannot manufacture another ambiguous pricing:null row.
--
-- Apply after 0019_offline_claim_pricing_snapshot.sql. This is intentionally additive: 0019 may
-- already be live. As with earlier ALTER migrations, run it exactly once through the migration
-- runner before deploying/activating the matching Pages Functions.

ALTER TABLE offline_reward_claims ADD COLUMN pricing_state TEXT;

UPDATE offline_reward_claims
SET pricing_state = CASE
  WHEN income_xp IS NULL AND income_zeny IS NULL AND income_job IS NULL AND income_kph IS NULL
   AND source_map IS NULL AND source_stage IS NULL AND income_version IS NULL AND reward_version IS NULL
   AND sampled_at IS NULL AND interval_start_at IS NULL AND interval_end_at IS NULL
    THEN 'legacy'
  WHEN income_xp IS NOT NULL AND income_zeny IS NOT NULL AND income_job IS NOT NULL AND income_kph IS NOT NULL
   AND source_map BETWEEN 0 AND 99 AND source_stage BETWEEN 1 AND 15
   AND income_version = 1 AND reward_version >= 0 AND sampled_at >= 0
   AND interval_start_at >= 0 AND interval_end_at >= interval_start_at
   AND income_xp >= 0 AND income_zeny >= 0 AND income_job >= 0 AND income_kph BETWEEN 0 AND 30000
    THEN 'priced'
  ELSE 'corrupt'
END
WHERE pricing_state IS NULL;
