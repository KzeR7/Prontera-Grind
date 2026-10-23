// GET /api/shop/order?id=ord_... -> { order:{id, sku, status, ...} }
//
// The client polls this while a Checkout tab is open. A pending order is re-checked with Stripe
// directly (GET /v1/checkout/sessions/:id), so delivery does not depend on the webhook having
// arrived — or on the webhook being configured at all.

import { currentUser } from '../../_lib/auth.js';
import { json, guard, fail } from '../../_lib/http.js';
import { orderById, orderShape, settleSession, stripeRequest, paymentsLive, markOrder } from '../../_lib/shop.js';

export const onRequestGet = guard(async ({ request, env }) => {
  const D = env.DB;
  const user = await currentUser(request, D);
  if (!user) return fail('Not logged in.', 401);
  const id = String(new URL(request.url).searchParams.get('id') || '');
  if (!/^ord_[a-z0-9]{16,32}$/.test(id)) return fail('Unknown order.', 404);
  let order = await orderById(D, id);
  if (!order || order.user_id !== user.id) return fail('Unknown order.', 404);
  if (order.status === 'pending') {
    if (order.stripe_session && paymentsLive(env)) {
      const session = await stripeRequest(env, 'GET', '/v1/checkout/sessions/' + encodeURIComponent(order.stripe_session));
      order = (await settleSession(D, session)).order || await orderById(D, id);
    } else if (!paymentsLive(env) && Date.now() - order.created_at > 40 * 60 * 1000) {
      order = await markOrder(D, id, 'expired');
    }
  }
  return json({ order: orderShape(order) });
});
