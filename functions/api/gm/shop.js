// GET  /api/gm/shop?id=<userId>                         -> { entitlements:[...], orders:[...], catalog }
// POST /api/gm/shop { id, action:'grant'|'revoke', sku, note }
//
// Owner tooling for the Cash Shop: see what an account owns and has paid for, hand out a cosmetic
// (prize, apology, refund-and-keep) or take one back (refund, chargeback). Supplies are not here on
// purpose — the existing Send tab already gifts any resource through the same grants queue.

import { currentUser, isGm } from '../../_lib/auth.js';
import { json, guard, readJson, fail } from '../../_lib/http.js';
import * as db from '../../_lib/db.js';
import { CATALOG, findSku, orderShape, shopInstalled } from '../../_lib/shop.js';

const userIdFrom = v => { const id = Number(v); return Number.isInteger(id) && id > 0 ? id : null; };
const NOT_INSTALLED_GM = 'The Cash Shop tables are not installed on this database yet - apply migrations/0005_shop.sql (docs/MONETIZATION-SETUP.md §3).';

export const onRequestGet = guard(async ({ request, env }) => {
  const D = env.DB;
  const user = await currentUser(request, D);
  if (!isGm(user)) return fail('GM only.', 403);
  const id = userIdFrom(new URL(request.url).searchParams.get('id'));
  if (!id) return fail('Which player?', 400);
  if (!(await shopInstalled(D))) return fail(NOT_INSTALLED_GM, 503, { installed: false });
  const ent = await D.prepare('SELECT sku, source, order_id, granted_at FROM entitlements WHERE user_id = ? ORDER BY granted_at DESC').bind(id).all();
  const orders = await D.prepare('SELECT * FROM shop_orders WHERE user_id = ? ORDER BY created_at DESC LIMIT 100').bind(id).all();
  return json({
    entitlements: (ent.results || []).map(e => ({ sku: e.sku, name: (findSku(e.sku) || {}).name || e.sku, source: e.source, orderId: e.order_id, at: e.granted_at })),
    orders: (orders.results || []).map(orderShape),
    catalog: CATALOG.items.filter(i => i.kind === 'cosmetic').map(i => ({ sku: i.sku, name: i.name, slot: i.slotLabel, price: i.price })),
    currency: CATALOG.currency,
  });
});

export const onRequestPost = guard(async ({ request, env }) => {
  const D = env.DB;
  const user = await currentUser(request, D);
  if (!isGm(user)) return fail('GM only.', 403);
  const body = await readJson(request, 4096);
  if (!(await shopInstalled(D))) return fail(NOT_INSTALLED_GM, 503, { installed: false });
  const id = userIdFrom(body.id);
  const target = id ? await db.userById(D, id) : null;
  if (!target) return fail('No such player.', 404);
  const item = findSku(body.sku);
  if (!item || item.kind !== 'cosmetic') return fail('Pick a wardrobe item.', 400);
  const note = String(body.note || '').slice(0, 200);
  if (body.action === 'grant') {
    const r = await D.prepare("INSERT OR IGNORE INTO entitlements(user_id, sku, source, order_id, granted_at) VALUES(?, ?, 'gm', NULL, ?)").bind(id, item.sku, Date.now()).run();
    await db.logEvent(D, user.username, id, 'shop-grant', item.sku + (r.meta && r.meta.changes ? '' : ' (already owned)') + (note ? ' — ' + note : ''));
    return json({ ok: true, granted: !!(r.meta && r.meta.changes) });
  }
  if (body.action === 'revoke') {
    const r = await D.prepare('DELETE FROM entitlements WHERE user_id = ? AND sku = ?').bind(id, item.sku).run();
    await db.logEvent(D, user.username, id, 'shop-revoke', item.sku + (note ? ' — ' + note : ''));
    return json({ ok: true, revoked: !!(r.meta && r.meta.changes) });
  }
  return fail('Unknown action.', 400);
});
