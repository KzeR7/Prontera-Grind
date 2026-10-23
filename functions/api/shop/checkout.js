// POST /api/shop/checkout { sku, qty } -> { ok, order, url, fulfilled }
//
// Creates a pending shop_orders row and a Stripe Checkout Session for it; the client sends the
// player to `url`. Stripe tells us about the payment on /api/shop/webhook (and /api/shop/order
// double-checks on demand). With SHOP_FAKE_CHECKOUT=1 and no Stripe key the order is delivered
// immediately and `url` is the game's own success page, so the flow can be rehearsed end to end.

import { currentUser } from '../../_lib/auth.js';
import { json, guard, readJson, fail } from '../../_lib/http.js';
import * as db from '../../_lib/db.js';
import { findSku, newOrderId, orderShape, fulfillOrder, createCheckoutSession, returnUrls, paymentsLive, fakeCheckout, ownedSkus, CATALOG } from '../../_lib/shop.js';
import PGShop from '../../../assets/shop-catalog.js';

export const onRequestPost = guard(async ({ request, env }) => {
  const D = env.DB;
  const user = await currentUser(request, D);
  if (!user) return fail('Not logged in.', 401);
  if (user.banned) return fail('This account is suspended.', 403);
  const live = paymentsLive(env), fake = !live && fakeCheckout(env);
  if (!live && !fake) return fail('The Cash Shop is not taking payments yet.', 503, { shopOff: true });

  const body = await readJson(request, 2048);
  const sku = String(body.sku || '');
  const item = PGShop.SKU_RE.test(sku) ? findSku(sku) : null;
  if (!item) return fail('That item is not for sale.', 400);
  const qty = Number(body.qty ?? 1);
  if (!Number.isInteger(qty) || qty < 1 || qty > item.maxQty) return fail('Choose between 1 and ' + item.maxQty + ' of those.', 400);
  if (item.kind === 'cosmetic' && (await ownedSkus(D, user.id)).has(sku)) return fail('You already own ' + item.name + '.', 409, { owned: true });

  const rate = await db.hitRate(D, 'shop-checkout:' + user.id, 12, 10 * 60 * 1000);
  if (!rate.ok) return fail('Too many checkout attempts. Try again in a few minutes.', 429);

  const order = { id: newOrderId(), user_id: user.id, sku, quantity: qty, amount: item.price * qty, currency: CATALOG.currency, created_at: Date.now() };
  await D.prepare(`INSERT INTO shop_orders(id, user_id, sku, quantity, amount, currency, status, stripe_session, created_at)
                   VALUES(?, ?, ?, ?, ?, ?, 'pending', ?, ?)`)
    .bind(order.id, order.user_id, order.sku, order.quantity, order.amount, order.currency, fake ? 'fake_' + order.id : null, order.created_at).run();

  if (fake) {
    const done = await fulfillOrder(D, order.id, { payment: 'fake_payment' });
    return json({ ok: true, order: order.id, fulfilled: done.ok, url: returnUrls(request, order.id).success, mode: 'fake', detail: orderShape(done.order) });
  }

  let session;
  try {
    session = await createCheckoutSession(env, request, { order, item, user });
  } catch (e) {
    await D.prepare("UPDATE shop_orders SET status = 'failed' WHERE id = ? AND status = 'pending'").bind(order.id).run();
    throw e;
  }
  await D.prepare('UPDATE shop_orders SET stripe_session = ? WHERE id = ?').bind(session.id, order.id).run();
  await db.logEvent(D, user.username, user.id, 'shop-checkout', order.id + ' ' + sku + ' x' + qty);
  return json({ ok: true, order: order.id, url: session.url, mode: 'stripe' });
});
