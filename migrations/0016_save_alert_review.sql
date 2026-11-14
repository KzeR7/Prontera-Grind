-- 0016_save_alert_review.sql — the GM's verdict on an automatic save-audit flag.
--
-- The owner (2026-11-14): "after review if i think its nothing wrong is there an option to
-- unflag?" Until now a flag was permanent: once functions/_lib/save-audit.js wrote a row, the
-- account carried the ⚠ marker, the Suspicious-saves card and the player-panel warning forever,
-- even when a human had looked and found a lawful explanation (a gift batch, a long offline
-- window, a testing account).
--
-- Clearing KEEPS the row — it is the audit trail, and deleting evidence is how a console stops
-- being trustworthy — and stamps who cleared it and when. A cleared flag:
--   * stops counting toward the ⚠ marker and the Suspicious-saves card,
--   * moves to a separate "cleared" list on the player so the verdict is still visible,
--   * REOPENS BY ITSELF if the same rule fires again, because the audit's upsert resets the
--     stamp. A verdict is about the evidence that was reviewed, not a permanent immunity.
-- Reopening by hand is the same action in reverse, for a cleared flag that turns out to matter.
--
-- Additive only: two nullable columns. Safe to reapply.
ALTER TABLE save_alerts ADD COLUMN cleared_at INTEGER;
ALTER TABLE save_alerts ADD COLUMN cleared_by TEXT;

-- Partial index for the "which accounts are still flagged" paths (list marker, audit card).
CREATE INDEX IF NOT EXISTS idx_save_alerts_active ON save_alerts(user_id) WHERE cleared_at IS NULL;
