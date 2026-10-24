// POST /api/shop/webhook — Stripe -> us. No cookie, no login: the Stripe-Signature header is the
// credential (HMAC over the raw body with STRIPE_WEBHOOK_SECRET). Events are recorded by id so a
// retry is a no-op. Only Checkout Session events matter to delivery; refunds are logged for the GM.

import { json, guard, fail } from '../../_lib/http.js';
import { verifyStripeSignature, settleSession, markOrder, shopInstalled, NOT_INSTALLED } from '../../_lib/shop.js';

export const onRequestPost = guard(async ({ request, env }) => {
  const D = env.DB;
  const whsec = env.STRIPE_WEBHOOK_SECRET;
  if (!whsec) return fail('Webhook not configured.', 503);
  if (!(await shopInstalled(D))) return fail(NOT_INSTALLED, 503);   // Stripe retries later; nothing is lost
  const raw = await request.text();
  if (raw.length > 256_000) return fail('Too large.', 413);
  if (!(await verifyStripeSignature(raw, request.headers.get('Stripe-Signature'), whsec))) return fail('Bad signature.', 400);
  let event;
  try { event = JSON.parse(raw); } catch (e) { return fail('Malformed JSON.', 400); }
  if (!event || typeof event.id !== 'string' || typeof event.type !== 'string') return fail('Not a Stripe event.', 400);

  const seen = await D.prepare('INSERT OR IGNORE INTO shop_webhooks(event_id, type, received_at) VALUES(?, ?, ?)').bind(event.id, event.type, Date.now()).run();
  if (!seen.meta || !seen.meta.changes) return json({ received: true, duplicate: true });

  const obj = event.data && event.data.object || {};
  let result = { ignored: true };
  switch (event.type) {
    case 'checkout.session.completed':
    case 'checkout.session.async_payment_succeeded':
      result = await settleSession(D, obj);
      break;
    case 'checkout.session.expired':
      if (obj.client_reference_id) result = { ok: true, order: await markOrder(D, obj.client_reference_id, 'expired') };
      break;
    case 'checkout.session.async_payment_failed':
      if (obj.client_reference_id) result = { ok: true, order: await markOrder(D, obj.client_reference_id, 'failed') };
      break;
    case 'charge.refunded': {
      // Keep the unlock (the GM console can revoke it); just make the refund visible in the books.
      const pi = typeof obj.payment_intent === 'string' ? obj.payment_intent : null;
      if (pi) {
        await D.prepare("UPDATE shop_orders SET status = 'refunded' WHERE stripe_payment = ? AND status = 'fulfilled'").bind(pi).run();
        const o = await D.prepare('SELECT * FROM shop_orders WHERE stripe_payment = ?').bind(pi).first();
        await D.prepare("INSERT INTO events(at, actor, user_id, kind, detail) VALUES(?, 'Stripe', ?, 'shop-refund', ?)")
          .bind(Date.now(), o ? o.user_id : null, (o ? o.id + ' ' + o.sku : 'unknown order') + ' ' + pi).run();
        result = { ok: true, order: o };
      }
      break;
    }
    default:
      break;
  }
  return json({ received: true, status: result.order ? result.order.status : (result.reason || 'ignored') });
});

// Stripe only ever POSTs; anything else is a curious browser.
export const onRequestGet = () => json({ err: 'POST only.' }, 405);
