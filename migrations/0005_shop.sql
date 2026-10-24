-- Cash Shop (haven-v215): Stripe Checkout orders, permanent cosmetic unlocks, webhook replay guard.
-- Apply with: npx wrangler d1 migrations apply pg --remote   (see docs/MONETIZATION-SETUP.md)

-- One row per Checkout attempt. `amount` is the total in the smallest currency unit (US cents).
-- status: pending -> fulfilled (paid and delivered) | expired | failed | refunded
CREATE TABLE IF NOT EXISTS shop_orders(
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  sku TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  amount INTEGER NOT NULL,
  currency TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  stripe_session TEXT,
  stripe_payment TEXT,
  created_at INTEGER NOT NULL,
  paid_at INTEGER,
  fulfilled_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_shop_orders_user ON shop_orders(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_shop_orders_session ON shop_orders(stripe_session);

-- What an account owns. Cosmetics only: supplies go through `grants` and are consumed on delivery.
-- source: stripe | gm | legacy
CREATE TABLE IF NOT EXISTS entitlements(
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  sku TEXT NOT NULL,
  source TEXT NOT NULL,
  order_id TEXT,
  granted_at INTEGER NOT NULL,
  PRIMARY KEY(user_id, sku)
);

-- Stripe retries webhooks; an event id is processed at most once.
CREATE TABLE IF NOT EXISTS shop_webhooks(
  event_id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  received_at INTEGER NOT NULL
);

-- GRANDFATHER CLAUSE: anything a cloud account was already wearing when the shop arrived stays
-- unlocked for that account (owner decision, docs/DECISIONS.md). One-off; re-running is harmless.
-- Mirrors PGWardrobe.normalize(): only a version-1 appearance counts, a slot id must be text, and a
-- pre-slot boolean (halo/glasses/wings) only counts when the slot field is absent.
INSERT OR IGNORE INTO entitlements(user_id, sku, source, order_id, granted_at)
  SELECT user_id, 'cos:headwear:' || json_extract(blob, '$.appearance.headwear'), 'legacy', NULL, CAST(strftime('%s','now') AS INTEGER) * 1000
  FROM saves WHERE json_valid(blob) AND json_extract(blob, '$.appearance.version') = 1 AND json_type(blob, '$.appearance.headwear') = 'text' AND json_extract(blob, '$.appearance.headwear') <> 'none';
INSERT OR IGNORE INTO entitlements(user_id, sku, source, order_id, granted_at)
  SELECT user_id, 'cos:facewear:' || json_extract(blob, '$.appearance.facewear'), 'legacy', NULL, CAST(strftime('%s','now') AS INTEGER) * 1000
  FROM saves WHERE json_valid(blob) AND json_extract(blob, '$.appearance.version') = 1 AND json_type(blob, '$.appearance.facewear') = 'text' AND json_extract(blob, '$.appearance.facewear') <> 'none';
INSERT OR IGNORE INTO entitlements(user_id, sku, source, order_id, granted_at)
  SELECT user_id, 'cos:mouthwear:' || json_extract(blob, '$.appearance.mouthwear'), 'legacy', NULL, CAST(strftime('%s','now') AS INTEGER) * 1000
  FROM saves WHERE json_valid(blob) AND json_extract(blob, '$.appearance.version') = 1 AND json_type(blob, '$.appearance.mouthwear') = 'text' AND json_extract(blob, '$.appearance.mouthwear') <> 'none';
INSERT OR IGNORE INTO entitlements(user_id, sku, source, order_id, granted_at)
  SELECT user_id, 'cos:backwear:' || json_extract(blob, '$.appearance.backwear'), 'legacy', NULL, CAST(strftime('%s','now') AS INTEGER) * 1000
  FROM saves WHERE json_valid(blob) AND json_extract(blob, '$.appearance.version') = 1 AND json_type(blob, '$.appearance.backwear') = 'text' AND json_extract(blob, '$.appearance.backwear') <> 'none';
-- Pre-wardrobe saves (before haven-v199) kept three booleans instead of slot ids.
INSERT OR IGNORE INTO entitlements(user_id, sku, source, order_id, granted_at)
  SELECT user_id, 'cos:headwear:halo', 'legacy', NULL, CAST(strftime('%s','now') AS INTEGER) * 1000
  FROM saves WHERE json_valid(blob) AND json_extract(blob, '$.appearance.version') = 1 AND json_type(blob, '$.appearance.headwear') IS NULL AND json_extract(blob, '$.appearance.halo') = 1;
INSERT OR IGNORE INTO entitlements(user_id, sku, source, order_id, granted_at)
  SELECT user_id, 'cos:facewear:glasses', 'legacy', NULL, CAST(strftime('%s','now') AS INTEGER) * 1000
  FROM saves WHERE json_valid(blob) AND json_extract(blob, '$.appearance.version') = 1 AND json_type(blob, '$.appearance.facewear') IS NULL AND json_extract(blob, '$.appearance.glasses') = 1;
INSERT OR IGNORE INTO entitlements(user_id, sku, source, order_id, granted_at)
  SELECT user_id, 'cos:backwear:wings', 'legacy', NULL, CAST(strftime('%s','now') AS INTEGER) * 1000
  FROM saves WHERE json_valid(blob) AND json_extract(blob, '$.appearance.version') = 1 AND json_type(blob, '$.appearance.backwear') IS NULL AND json_extract(blob, '$.appearance.wings') = 1;
