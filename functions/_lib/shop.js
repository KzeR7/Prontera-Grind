// _lib/shop.js — Cash Shop: catalog lookup, Stripe REST calls, webhook signatures, fulfilment.
//
// Money never touches the save blob. A purchase becomes either
//   * an `entitlements` row (cosmetics: permanent, per account, checked on every PUT /api/save), or
//   * a `grants` row (supplies: the same queue GM gifts use, applied exactly once by the client).
// Stripe is talked to over fetch() with form encoding — no SDK, nothing to bundle. Two secrets, both
// set with `wrangler pages secret put` (docs/MONETIZATION-SETUP.md): STRIPE_SECRET_KEY and
// STRIPE_WEBHOOK_SECRET. With neither set the shop is a read-only preview; with SHOP_FAKE_CHECKOUT=1
// (the dev server's --fake-payments) an order is fulfilled on the spot so the whole flow can be tried
// without a Stripe account.

import W from '../../assets/wardrobe.js';
import PGShop from '../../assets/shop-catalog.js';
import { HttpError } from './http.js';

export const CATALOG = PGShop.catalog(W);
const BY_SKU = new Map(CATALOG.items.map(i => [i.sku, i]));
export const findSku = sku => BY_SKU.get(String(sku || '')) || null;
export const wornSkus = appearance => PGShop.wornSkus(W, appearance);
export const money = PGShop.money;

export const paymentsLive = env => !!(env && env.STRIPE_SECRET_KEY);
export const fakeCheckout = env => !!env && String(env.SHOP_FAKE_CHECKOUT || '') === '1';
export const shopMode = env => paymentsLive(env) ? 'stripe' : fakeCheckout(env) ? 'fake' : 'off';

// ------------------------------------------------------------ ownership ----
export async function ownedSkus(D, userId) {
  const rows = await D.prepare('SELECT sku FROM entitlements WHERE user_id = ?').bind(userId).all();
  return new Set((rows.results || []).map(r => r.sku));
}

// Paid items a look is wearing that this account does not own. Empty = the save may be stored.
export async function lockedCosmetics(D, userId, save) {
  const worn = wornSkus(save && save.appearance);
  if (!worn.length) return [];
  const owned = await ownedSkus(D, userId);
  return worn.filter(sku => !owned.has(sku));
}

// ---------------------------------------------------------------- orders ----
const ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';
export function newOrderId() {
  const b = new Uint8Array(16); crypto.getRandomValues(b);
  let s = ''; for (const x of b) s += ALPHABET[x % ALPHABET.length];
  return 'ord_' + s;
}

export const orderShape = o => o && ({
  id: o.id, sku: o.sku, quantity: o.quantity, amount: o.amount, currency: o.currency, status: o.status,
  createdAt: o.created_at, paidAt: o.paid_at, fulfilledAt: o.fulfilled_at,
  payment: o.stripe_payment || null, item: (findSku(o.sku) || {}).name || o.sku,
});

export const orderById = (D, id) => D.prepare('SELECT * FROM shop_orders WHERE id = ?').bind(id).first();

// Idempotent: the status flip pending->fulfilled gates the delivery, and the whole thing is one D1
// batch (a transaction), so a webhook retry, a double poll or a crash halfway can never deliver twice
// or charge without delivering. `changes()` is SQLite's "rows changed by the previous statement" —
// the same guard gm/gifts.js relies on.
export async function fulfillOrder(D, orderId, { payment = null, at = Date.now() } = {}) {
  const order = await orderById(D, orderId);
  if (!order) return { ok: false, reason: 'missing' };
  if (order.status !== 'pending') return { ok: true, order, already: true };
  const item = findSku(order.sku);
  if (!item) {
    await D.prepare("UPDATE shop_orders SET status = 'failed' WHERE id = ? AND status = 'pending'").bind(orderId).run();
    return { ok: false, reason: 'unknown-sku', order: await orderById(D, orderId) };
  }
  const qty = Math.max(1, Number(order.quantity) || 1);
  const label = item.name + (qty > 1 ? ' x' + qty : '');
  const stmts = [
    D.prepare(`UPDATE shop_orders SET status = 'fulfilled', paid_at = ?, fulfilled_at = ?, stripe_payment = COALESCE(?, stripe_payment)
               WHERE id = ? AND status = 'pending'`).bind(at, at, payment, orderId),
    D.prepare(`INSERT INTO events(at, actor, user_id, kind, detail) SELECT ?, 'Cash Shop', ?, 'shop-fulfilled', ? WHERE changes() > 0`)
      .bind(at, order.user_id, orderId + ' ' + order.sku + ' ' + money(order.amount, order.currency)),
  ];
  if (item.kind === 'cosmetic') {
    stmts.push(D.prepare(`INSERT OR IGNORE INTO entitlements(user_id, sku, source, order_id, granted_at) SELECT ?, ?, 'stripe', ?, ? WHERE changes() > 0`)
      .bind(order.user_id, order.sku, orderId, at));
  } else {
    stmts.push(D.prepare(`INSERT INTO grants(user_id, kind, payload, note, created_by, created_at) SELECT ?, 'gift', ?, ?, 'Cash Shop', ? WHERE changes() > 0`)
      .bind(order.user_id, JSON.stringify({ resource: item.resource, amount: item.amount * qty }), 'Cash Shop: ' + label, at));
  }
  await D.batch(stmts);
  return { ok: true, order: await orderById(D, orderId) };
}

export async function markOrder(D, orderId, status, payment = null) {
  await D.prepare("UPDATE shop_orders SET status = ?, stripe_payment = COALESCE(?, stripe_payment) WHERE id = ? AND status = 'pending'")
    .bind(status, payment, orderId).run();
  return orderById(D, orderId);
}

// ---------------------------------------------------------------- Stripe ----
// Stripe's API takes application/x-www-form-urlencoded with bracket notation for nesting.
export function formEncode(value, prefix = '', out = []) {
  if (value === null || value === undefined) return out;
  if (Array.isArray(value)) value.forEach((v, i) => formEncode(v, prefix + '[' + i + ']', out));
  else if (typeof value === 'object') for (const [k, v] of Object.entries(value)) formEncode(v, prefix ? prefix + '[' + k + ']' : k, out);
  else out.push(encodeURIComponent(prefix) + '=' + encodeURIComponent(String(value)));
  return out;
}

export async function stripeRequest(env, method, path, params = null, idempotencyKey = null) {
  if (!paymentsLive(env)) throw new HttpError(503, 'Payments are not switched on yet.');
  const headers = { Authorization: 'Bearer ' + env.STRIPE_SECRET_KEY, 'Stripe-Version': '2024-06-20' };
  let body;
  if (method === 'POST') { headers['Content-Type'] = 'application/x-www-form-urlencoded'; body = formEncode(params).join('&'); }
  if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;
  const res = await fetch('https://api.stripe.com' + path, { method, headers, body });
  let data = null;
  try { data = await res.json(); } catch (e) { data = null; }
  if (!res.ok) {
    console.error('stripe', method, path, res.status, data && data.error && data.error.message);
    throw new HttpError(502, 'The payment provider did not accept that request. Please try again in a moment.');
  }
  return data;
}

// Where Stripe sends the player afterwards. The game page reads ?shop=... and shows the result.
export function returnUrls(request, orderId) {
  const u = new URL(request.url);
  const proto = (request.headers.get('X-Forwarded-Proto') || '').split(',')[0].trim() || u.protocol.replace(':', '');
  const host = (request.headers.get('X-Forwarded-Host') || '').split(',')[0].trim() || u.host;
  const origin = proto + '://' + host;
  return {
    success: origin + '/?shop=success&order=' + encodeURIComponent(orderId),
    cancel: origin + '/?shop=cancel&order=' + encodeURIComponent(orderId),
  };
}

export async function createCheckoutSession(env, request, { order, item, user }) {
  const urls = returnUrls(request, order.id);
  const params = {
    mode: 'payment',
    client_reference_id: order.id,
    success_url: urls.success,
    cancel_url: urls.cancel,
    expires_at: Math.floor(Date.now() / 1000) + 30 * 60,
    line_items: [{
      quantity: order.quantity,
      price_data: {
        currency: order.currency,
        unit_amount: item.price,
        product_data: {
          name: 'Prontera Grind: ' + item.name,
          description: item.kind === 'cosmetic' ? item.slotLabel + ' cosmetic, unlocked forever for ' + user.username : 'Delivered to ' + user.username + ' on the next sync',
          metadata: { sku: item.sku },
        },
      },
    }],
    metadata: { order_id: order.id, user_id: String(user.id), username: user.username, sku: item.sku },
    payment_intent_data: { metadata: { order_id: order.id, username: user.username, sku: item.sku } },
  };
  return stripeRequest(env, 'POST', '/v1/checkout/sessions', params, order.id);
}

const enc = new TextEncoder();
const hex = buf => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
export async function hmacHex(secret, text) {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return hex(await crypto.subtle.sign('HMAC', key, enc.encode(text)));
}
const sameHex = (a, b) => {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
};

// Stripe-Signature: t=<unix seconds>,v1=<hmac hex>[,v1=...]. The signed text is `${t}.${raw body}`.
export async function verifyStripeSignature(rawBody, header, secret, { toleranceSec = 300, nowMs = Date.now() } = {}) {
  if (!header || !secret) return false;
  const parts = Object.create(null); const sigs = [];
  for (const kv of String(header).split(',')) {
    const i = kv.indexOf('='); if (i < 0) continue;
    const k = kv.slice(0, i).trim(), v = kv.slice(i + 1).trim();
    if (k === 'v1') sigs.push(v); else parts[k] = v;
  }
  const t = Number(parts.t);
  if (!Number.isFinite(t) || !sigs.length) return false;
  if (Math.abs(nowMs / 1000 - t) > toleranceSec) return false;
  const expected = await hmacHex(secret, parts.t + '.' + rawBody);
  return sigs.some(s => sameHex(s, expected));
}

// Test helper and dev tool: build a header Stripe would have sent for this body.
export async function signStripePayload(rawBody, secret, nowMs = Date.now()) {
  const t = Math.floor(nowMs / 1000);
  return 't=' + t + ',v1=' + await hmacHex(secret, t + '.' + rawBody);
}

// A paid Checkout Session for one of our orders -> deliver. Shared by the webhook and the poll.
export async function settleSession(D, session) {
  const orderId = session && (session.client_reference_id || (session.metadata && session.metadata.order_id));
  if (!orderId) return { ok: false, reason: 'no-order' };
  const order = await orderById(D, orderId);
  if (!order) return { ok: false, reason: 'missing' };
  if (order.stripe_session && session.id && order.stripe_session !== session.id) return { ok: false, reason: 'session-mismatch', order };
  if (session.status === 'expired') return { ok: true, order: await markOrder(D, orderId, 'expired') };
  if (session.payment_status !== 'paid') return { ok: true, order, pending: true };
  if (Number(session.amount_total) !== Number(order.amount) || String(session.currency || '').toLowerCase() !== order.currency) {
    await D.prepare("INSERT INTO events(at, actor, user_id, kind, detail) VALUES(?, 'Cash Shop', ?, 'shop-amount-mismatch', ?)")
      .bind(Date.now(), order.user_id, orderId + ' expected ' + order.amount + ' ' + order.currency + ' got ' + session.amount_total + ' ' + session.currency).run();
    return { ok: false, reason: 'amount-mismatch', order };
  }
  const payment = typeof session.payment_intent === 'string' ? session.payment_intent : (session.payment_intent && session.payment_intent.id) || null;
  return fulfillOrder(D, orderId, { payment });
}
