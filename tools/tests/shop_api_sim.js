// Cash Shop server side: real handlers, real SQL, Stripe replaced by a recorded fetch().
//   node tools/tests/shop_api_sim.js
//
// Covers the three modes the shop runs in — off (no key), fake (SHOP_FAKE_CHECKOUT=1, the dev
// server's --fake-payments) and live (STRIPE_SECRET_KEY set, Stripe answered by a mock) — plus the
// things money makes non-negotiable: a webhook is verified and processed once, a mismatched amount is
// never delivered, a save cannot wear an unowned cosmetic, and the grandfather migration keeps what
// existing accounts already had on.

import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { signStripePayload } from '../../functions/_lib/shop.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..', '..');

// The same D1 shim shape tools/dev_server.js uses (kept local so this suite needs no npm packages):
// prepare/bind/first/all/run with meta.changes, and batch() as one transaction on one connection,
// which is what makes `WHERE changes() > 0` in a batch mean what it means in production.
function makeD1(sqlite) {
  const wrap = (stmt, args = []) => ({
    bind: (...more) => wrap(stmt, args.concat(more)),
    first: async () => stmt.get(...args) ?? null,
    all: async () => ({ results: stmt.all(...args) }),
    run: async () => ({ success: true, meta: stmt.run(...args) }),
  });
  return {
    prepare: sql => wrap(sqlite.prepare(sql)),
    batch: async statements => {
      sqlite.exec('BEGIN IMMEDIATE');
      try { const out = []; for (const q of statements) out.push(await q.run()); sqlite.exec('COMMIT'); return out; }
      catch (e) { sqlite.exec('ROLLBACK'); throw e; }
    },
  };
}
const migrationFiles = () => fs.readdirSync(path.join(root, 'migrations')).filter(n => /^\d+_.*\.sql$/.test(n)).sort();
function freshDb() {
  const sqlite = new DatabaseSync(':memory:');
  for (const name of migrationFiles()) sqlite.exec(fs.readFileSync(path.join(root, 'migrations', name), 'utf8'));
  return sqlite;
}
const freshEnv = (extra = {}) => { const sqlite = freshDb(); return { env: { DB: makeD1(sqlite), ...extra }, sqlite }; };

function req(method, url, { body, cookie, headers = {} } = {}) {
  const h = new Map(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]));
  if (cookie) h.set('cookie', cookie);
  const text = body === undefined ? '' : (typeof body === 'string' ? body : JSON.stringify(body));
  if (text) h.set('content-length', String(new TextEncoder().encode(text).length));
  return { method, url: url.startsWith('http') ? url : 'https://pg.test' + url, headers: { get: k => h.get(String(k).toLowerCase()) ?? null }, text: async () => text };
}
const cookieFrom = res => { const raw = res.headers.get('Set-Cookie'); return raw ? raw.split(';')[0] : null; };
const call = async (mod, fn, args) => {
  const m = await import(pathToFileURL(path.join(root, 'functions', fn)).href);
  const res = await m[mod]({ request: args.request, env: args.env, params: {} });
  const type = res.headers.get('Content-Type') || '';
  return { status: res.status, data: type.includes('json') ? await res.clone().json() : null, cookie: cookieFrom(res) };
};
const api = {
  register: (env, body) => call('onRequestPost', 'api/register.js', { request: req('POST', '/api/register', { body }), env }),
  me: (env, cookie) => call('onRequestGet', 'api/me.js', { request: req('GET', '/api/me', { cookie }), env }),
  catalog: (env, cookie) => call('onRequestGet', 'api/shop/catalog.js', { request: req('GET', '/api/shop/catalog', { cookie }), env }),
  checkout: (env, cookie, body, headers) => call('onRequestPost', 'api/shop/checkout.js', { request: req('POST', '/api/shop/checkout', { cookie, body, headers }), env }),
  order: (env, cookie, id) => call('onRequestGet', 'api/shop/order.js', { request: req('GET', '/api/shop/order?id=' + id, { cookie }), env }),
  webhook: (env, raw, sig) => call('onRequestPost', 'api/shop/webhook.js', { request: req('POST', '/api/shop/webhook', { body: raw, headers: sig ? { 'Stripe-Signature': sig } : {} }), env }),
  grants: (env, cookie) => call('onRequestGet', 'api/grants.js', { request: req('GET', '/api/grants', { cookie }), env }),
  gmShop: (env, cookie, id) => call('onRequestGet', 'api/gm/shop.js', { request: req('GET', '/api/gm/shop?id=' + id, { cookie }), env }),
  gmShopAct: (env, cookie, body) => call('onRequestPost', 'api/gm/shop.js', { request: req('POST', '/api/gm/shop', { cookie, body }), env }),
  putSave: async (env, cookie, save) => {
    const me = await api.me(env, cookie); const owner = me.data.u;
    return call('onRequestPut', 'api/save.js', { request: req('PUT', '/api/save', { cookie, body: { owner, version: 0, blob: JSON.stringify({ ...save, owner }) } }), env });
  },
};
const saveWith = (appearance) => ({
  pets: [], cls: 'Novice', sex: 'm', lv: 5, exp: 12, hp: 300, zeny: 100, kills: 7, pts: 4,
  jobs: { Novice: { jl: 1, jx: 0 } }, sk: { aid: 1 }, st: { str: 9, agi: 1, dex: 1, luk: 1, int: 1, vit: 5 },
  eq: {}, inv: [], base: {}, mp: 0, lvl: 1, prog: [1, 1, 1, 1, 1], q: null, cards: [], ore: { ori: 0, elu: 0 }, appearance,
});

// Stripe, recorded. Every call is pushed to `calls`; `answer` decides the response.
const stripeMock = () => {
  const state = { calls: [], answer: null };
  globalThis.fetch = async (url, init = {}) => {
    state.calls.push({ url: String(url), method: init.method || 'GET', headers: init.headers || {}, body: init.body || '' });
    const out = state.answer ? state.answer(String(url), init) : { status: 500, body: { error: { message: 'no answer' } } };
    return new Response(JSON.stringify(out.body), { status: out.status || 200, headers: { 'Content-Type': 'application/json' } });
  };
  return state;
};
const KEY = 'sk_test_' + 'x'.repeat(24), WHSEC = 'whsec_' + 'y'.repeat(24);

let pass = 0, fail = 0;
const T = async (n, fn) => { try { await fn(); console.log('  ok   ' + n); pass++; } catch (e) { console.log('  FAIL ' + n + ' -> ' + (e && e.stack || e)); fail++; } };

console.log('cash shop: catalog, checkout (off / fake / Stripe), webhook, poll, save gate, GM, migration\n');

// ------------------------------------------------------------------ catalog ----
await T('catalog is public, lists both kinds, says payments are off until a key exists', async () => {
  const { env } = freshEnv();
  const r = await api.catalog(env);
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.data.mode, 'off');
  assert.strictEqual(r.data.currency, 'usd');
  assert.deepStrictEqual(r.data.owned, []);
  assert.deepStrictEqual(r.data.slots, ['headwear', 'facewear', 'mouthwear', 'backwear']);
  const cos = r.data.items.filter(i => i.kind === 'cosmetic'), sup = r.data.items.filter(i => i.kind === 'supply');
  assert.ok(cos.length >= 50 && sup.length >= 10, 'cosmetics ' + cos.length + ' supplies ' + sup.length);
  assert.ok(r.data.items.every(i => Number.isInteger(i.price) && i.price >= 50), 'every price is whole cents >= Stripe minimum');
  assert.ok(cos.some(i => i.sku === 'cos:backwear:wings' && i.price === 499));
  assert.ok(cos.every(i => i.maxQty === 1), 'a cosmetic is bought once');
  assert.ok(sup.every(i => i.resource && i.amount >= 1), 'a supply names the gift it delivers');
});

// ---------------------------------------------------------- checkout: off ----
await T('checkout refuses politely while payments are off, and needs a login', async () => {
  const { env } = freshEnv();
  assert.strictEqual((await api.checkout(env, null, { sku: 'cos:backwear:wings' })).status, 401);
  const c = (await api.register(env, { u: 'Alice', p: 'alice-password-1' })).cookie;
  const r = await api.checkout(env, c, { sku: 'cos:backwear:wings' });
  assert.strictEqual(r.status, 503); assert.strictEqual(r.data.shopOff, true);
});

// --------------------------------------------------------- checkout: fake ----
await T('fake mode: a cosmetic is unlocked on the spot, once, and the catalog shows it owned', async () => {
  const { env, sqlite } = freshEnv({ SHOP_FAKE_CHECKOUT: '1' });
  const c = (await api.register(env, { u: 'Alice', p: 'alice-password-1' })).cookie;
  const r = await api.checkout(env, c, { sku: 'cos:headwear:halo' });
  assert.strictEqual(r.status, 200, JSON.stringify(r.data));
  assert.strictEqual(r.data.fulfilled, true); assert.strictEqual(r.data.mode, 'fake');
  assert.ok(/^https:\/\/pg\.test\/\?shop=success&order=ord_/.test(r.data.url), r.data.url);
  const cat = await api.catalog(env, c);
  assert.deepStrictEqual(cat.data.owned, ['cos:headwear:halo']); assert.strictEqual(cat.data.mode, 'fake');
  const again = await api.checkout(env, c, { sku: 'cos:headwear:halo' });
  assert.strictEqual(again.status, 409); assert.strictEqual(again.data.owned, true);
  const o = await api.order(env, c, r.data.order);
  assert.strictEqual(o.status, 200); assert.strictEqual(o.data.order.status, 'fulfilled'); assert.strictEqual(o.data.order.item, 'Angel halo');
  assert.strictEqual(sqlite.prepare("SELECT COUNT(*) n FROM events WHERE kind='shop-fulfilled'").get().n, 1);
  // another account cannot read this order
  const c2 = (await api.register(env, { u: 'Bob', p: 'bobby-password-1' })).cookie;
  assert.strictEqual((await api.order(env, c2, r.data.order)).status, 404);
});

await T('fake mode: a supply bundle becomes one gift grant the game applies like a GM gift', async () => {
  const { env, sqlite } = freshEnv({ SHOP_FAKE_CHECKOUT: '1' });
  const c = (await api.register(env, { u: 'Alice', p: 'alice-password-1' })).cookie;
  const r = await api.checkout(env, c, { sku: 'sup:ori:50', qty: 3 });
  assert.strictEqual(r.status, 200, JSON.stringify(r.data));
  assert.strictEqual(r.data.detail.amount, 199 * 3);
  const g = await api.grants(env, c);
  assert.strictEqual(g.data.grants.length, 1);
  assert.strictEqual(g.data.grants[0].kind, 'gift');
  assert.deepStrictEqual(g.data.grants[0].payload, { resource: 'ori', amount: 150 });
  assert.strictEqual(g.data.grants[0].from, 'Cash Shop');
  assert.ok(/Cash Shop: Oridecon/.test(g.data.grants[0].note));
  assert.strictEqual(sqlite.prepare('SELECT COUNT(*) n FROM entitlements').get().n, 0, 'supplies are not entitlements');
});

await T('checkout validates what it is asked for', async () => {
  const { env } = freshEnv({ SHOP_FAKE_CHECKOUT: '1' });
  const c = (await api.register(env, { u: 'Alice', p: 'alice-password-1' })).cookie;
  for (const body of [{ sku: 'cos:backwear:nothing' }, { sku: 'sup:zeny:1000000' }, { sku: '' }, { sku: 'cos:backwear:wings', qty: 2 }, { sku: 'sup:ori:50', qty: 11 }, { sku: 'sup:ori:50', qty: 0 }, { sku: 'sup:ori:50', qty: 1.5 }, { sku: "cos:backwear:wings' OR 1=1" }]) {
    const r = await api.checkout(env, c, body);
    assert.strictEqual(r.status, 400, JSON.stringify(body) + ' -> ' + r.status);
  }
  assert.strictEqual((await api.order(env, c, 'ord_nope')).status, 404);
  assert.strictEqual((await api.order(env, c, '1 OR 1=1')).status, 404);
});

await T('checkout is rate limited per account', async () => {
  const { env } = freshEnv({ SHOP_FAKE_CHECKOUT: '1' });
  const c = (await api.register(env, { u: 'Alice', p: 'alice-password-1' })).cookie;
  let last;
  for (let i = 0; i < 13; i++) last = await api.checkout(env, c, { sku: 'sup:elu:50' });
  assert.strictEqual(last.status, 429);
});

// ------------------------------------------------------- checkout: Stripe ----
await T('live mode: a Checkout Session is created from the server price list, never the client', async () => {
  const { env, sqlite } = freshEnv({ STRIPE_SECRET_KEY: KEY });
  const stripe = stripeMock();
  stripe.answer = () => ({ body: { id: 'cs_test_a1', url: 'https://checkout.stripe.com/c/pay/cs_test_a1', status: 'open', payment_status: 'unpaid' } });
  const c = (await api.register(env, { u: 'Alice', p: 'alice-password-1' })).cookie;
  const r = await api.checkout(env, c, { sku: 'cos:backwear:wings', price: 1, amount: 1 }, { 'X-Forwarded-Host': 'play.example.com', 'X-Forwarded-Proto': 'https' });
  assert.strictEqual(r.status, 200, JSON.stringify(r.data));
  assert.strictEqual(r.data.mode, 'stripe'); assert.strictEqual(r.data.url, 'https://checkout.stripe.com/c/pay/cs_test_a1'); assert.strictEqual(r.data.fulfilled, undefined);
  assert.strictEqual(stripe.calls.length, 1);
  const call0 = stripe.calls[0];
  assert.strictEqual(call0.url, 'https://api.stripe.com/v1/checkout/sessions'); assert.strictEqual(call0.method, 'POST');
  assert.strictEqual(call0.headers.Authorization, 'Bearer ' + KEY);
  assert.strictEqual(call0.headers['Idempotency-Key'], r.data.order);
  const q = new URLSearchParams(call0.body);
  assert.strictEqual(q.get('mode'), 'payment');
  assert.strictEqual(q.get('client_reference_id'), r.data.order);
  assert.strictEqual(q.get('line_items[0][price_data][unit_amount]'), '499');
  assert.strictEqual(q.get('line_items[0][price_data][currency]'), 'usd');
  assert.strictEqual(q.get('line_items[0][quantity]'), '1');
  assert.strictEqual(q.get('line_items[0][price_data][product_data][name]'), 'Prontera Grind: Archangel wings');
  assert.strictEqual(q.get('success_url'), 'https://play.example.com/?shop=success&order=' + r.data.order);
  assert.strictEqual(q.get('cancel_url'), 'https://play.example.com/?shop=cancel&order=' + r.data.order);
  assert.strictEqual(q.get('metadata[sku]'), 'cos:backwear:wings');
  const row = sqlite.prepare('SELECT * FROM shop_orders WHERE id=?').get(r.data.order);
  assert.strictEqual(row.status, 'pending'); assert.strictEqual(row.stripe_session, 'cs_test_a1'); assert.strictEqual(row.amount, 499);
  assert.strictEqual(sqlite.prepare('SELECT COUNT(*) n FROM entitlements').get().n, 0, 'nothing delivered before payment');
  assert.deepStrictEqual((await api.catalog(env, c)).data.owned, []);
});

await T('live mode: Stripe refusing the session marks the order failed and tells the player', async () => {
  const { env, sqlite } = freshEnv({ STRIPE_SECRET_KEY: KEY });
  const stripe = stripeMock();
  stripe.answer = () => ({ status: 400, body: { error: { message: 'Invalid API Key provided' } } });
  const c = (await api.register(env, { u: 'Alice', p: 'alice-password-1' })).cookie;
  const r = await api.checkout(env, c, { sku: 'cos:backwear:wings' });
  assert.strictEqual(r.status, 502);
  assert.ok(!/Invalid API Key/.test(r.data.err), 'Stripe wording is not forwarded to the player');
  assert.strictEqual(sqlite.prepare('SELECT status FROM shop_orders').get().status, 'failed');
});

// ------------------------------------------------------------------ webhook ----
const event = (type, object, id = 'evt_' + Math.random().toString(36).slice(2)) => JSON.stringify({ id, object: 'event', type, data: { object } });
const paidSession = (orderId, amount, extra = {}) => ({ id: 'cs_test_a1', object: 'checkout.session', client_reference_id: orderId, status: 'complete', payment_status: 'paid', amount_total: amount, currency: 'usd', payment_intent: 'pi_test_1', ...extra });

await T('webhook: needs its secret, rejects a missing, stale or forged signature', async () => {
  const off = freshEnv({ STRIPE_SECRET_KEY: KEY });
  assert.strictEqual((await api.webhook(off.env, '{}', 't=1,v1=00')).status, 503);
  const { env } = freshEnv({ STRIPE_SECRET_KEY: KEY, STRIPE_WEBHOOK_SECRET: WHSEC });
  const raw = event('checkout.session.completed', paidSession('ord_x', 499));
  assert.strictEqual((await api.webhook(env, raw, null)).status, 400);
  assert.strictEqual((await api.webhook(env, raw, 't=' + Math.floor(Date.now() / 1000) + ',v1=' + 'ab'.repeat(32))).status, 400);
  assert.strictEqual((await api.webhook(env, raw, await signStripePayload(raw, 'whsec_' + 'z'.repeat(24)))).status, 400, 'wrong secret');
  assert.strictEqual((await api.webhook(env, raw, await signStripePayload(raw, WHSEC, Date.now() - 3600_000))).status, 400, 'an hour old');
  const good = await signStripePayload(raw, WHSEC);
  assert.strictEqual((await api.webhook(env, raw.replace('499', '498'), good)).status, 400, 'body edited after signing');
  assert.strictEqual((await api.webhook(env, raw, good)).status, 200, 'the genuine article');
});

await T('webhook: a paid session delivers exactly once, replays and duplicates are no-ops', async () => {
  const { env, sqlite } = freshEnv({ STRIPE_SECRET_KEY: KEY, STRIPE_WEBHOOK_SECRET: WHSEC });
  const stripe = stripeMock();
  stripe.answer = () => ({ body: { id: 'cs_test_a1', url: 'https://checkout.stripe.com/c/pay/cs_test_a1' } });
  const c = (await api.register(env, { u: 'Alice', p: 'alice-password-1' })).cookie;
  const orderId = (await api.checkout(env, c, { sku: 'cos:backwear:wings' })).data.order;
  const raw = event('checkout.session.completed', paidSession(orderId, 499), 'evt_1');
  const sig = await signStripePayload(raw, WHSEC);
  const first = await api.webhook(env, raw, sig);
  assert.strictEqual(first.status, 200); assert.strictEqual(first.data.status, 'fulfilled');
  assert.deepStrictEqual((await api.catalog(env, c)).data.owned, ['cos:backwear:wings']);
  const ent = sqlite.prepare('SELECT * FROM entitlements').all();
  assert.strictEqual(ent.length, 1); assert.strictEqual(ent[0].source, 'stripe'); assert.strictEqual(ent[0].order_id, orderId);
  assert.strictEqual(sqlite.prepare('SELECT stripe_payment FROM shop_orders WHERE id=?').get(orderId).stripe_payment, 'pi_test_1');
  // Stripe retries the same event
  const replay = await api.webhook(env, raw, sig);
  assert.strictEqual(replay.status, 200); assert.strictEqual(replay.data.duplicate, true);
  // and sends a second event about the same session (async_payment_succeeded)
  const raw2 = event('checkout.session.async_payment_succeeded', paidSession(orderId, 499), 'evt_2');
  assert.strictEqual((await api.webhook(env, raw2, await signStripePayload(raw2, WHSEC))).status, 200);
  assert.strictEqual(sqlite.prepare('SELECT COUNT(*) n FROM entitlements').get().n, 1);
  assert.strictEqual(sqlite.prepare("SELECT COUNT(*) n FROM events WHERE kind='shop-fulfilled'").get().n, 1, 'one delivery event');
  assert.strictEqual(sqlite.prepare('SELECT COUNT(*) n FROM shop_webhooks').get().n, 2);
});

await T('webhook: a supply order delivers one grant even when the webhook and the poll race', async () => {
  const { env, sqlite } = freshEnv({ STRIPE_SECRET_KEY: KEY, STRIPE_WEBHOOK_SECRET: WHSEC });
  const stripe = stripeMock();
  stripe.answer = (url) => url.endsWith('/v1/checkout/sessions')
    ? { body: { id: 'cs_test_a1', url: 'https://checkout.stripe.com/c/pay/cs_test_a1' } }
    : { body: paidSession(orderId, 399 * 2) };
  const c = (await api.register(env, { u: 'Alice', p: 'alice-password-1' })).cookie;
  var orderId = (await api.checkout(env, c, { sku: 'sup:ascMat2:5', qty: 2 })).data.order;
  const raw = event('checkout.session.completed', paidSession(orderId, 798), 'evt_1');
  const [w, p] = await Promise.all([api.webhook(env, raw, await signStripePayload(raw, WHSEC)), api.order(env, c, orderId)]);
  assert.strictEqual(w.status, 200); assert.strictEqual(p.status, 200); assert.strictEqual(p.data.order.status, 'fulfilled');
  const grants = sqlite.prepare('SELECT * FROM grants').all();
  assert.strictEqual(grants.length, 1);
  assert.deepStrictEqual(JSON.parse(grants[0].payload), { resource: 'ascMat2', amount: 10 });
});

await T('webhook: an amount that does not match the order is NOT delivered, and is logged', async () => {
  const { env, sqlite } = freshEnv({ STRIPE_SECRET_KEY: KEY, STRIPE_WEBHOOK_SECRET: WHSEC });
  const stripe = stripeMock();
  stripe.answer = () => ({ body: { id: 'cs_test_a1', url: 'https://checkout.stripe.com/c/pay/cs_test_a1' } });
  const c = (await api.register(env, { u: 'Alice', p: 'alice-password-1' })).cookie;
  const orderId = (await api.checkout(env, c, { sku: 'cos:backwear:wings' })).data.order;
  for (const s of [paidSession(orderId, 1), paidSession(orderId, 499, { currency: 'eur' }), paidSession(orderId, 499, { id: 'cs_test_other' }), paidSession(orderId, 499, { payment_status: 'unpaid' })]) {
    const raw = event('checkout.session.completed', s);
    assert.strictEqual((await api.webhook(env, raw, await signStripePayload(raw, WHSEC))).status, 200);
    assert.strictEqual(sqlite.prepare('SELECT status FROM shop_orders WHERE id=?').get(orderId).status, 'pending');
  }
  assert.strictEqual(sqlite.prepare('SELECT COUNT(*) n FROM entitlements').get().n, 0);
  assert.strictEqual(sqlite.prepare("SELECT COUNT(*) n FROM events WHERE kind='shop-amount-mismatch'").get().n, 2);
  // an event for an order that does not exist is acknowledged (so Stripe stops retrying) and ignored
  const raw = event('checkout.session.completed', paidSession('ord_doesnotexist', 499));
  assert.strictEqual((await api.webhook(env, raw, await signStripePayload(raw, WHSEC))).data.status, 'missing');
});

await T('webhook: expiry, failure and refunds change the order, never the unlock', async () => {
  const { env, sqlite } = freshEnv({ STRIPE_SECRET_KEY: KEY, STRIPE_WEBHOOK_SECRET: WHSEC });
  const stripe = stripeMock();
  stripe.answer = () => ({ body: { id: 'cs_test_a1', url: 'https://checkout.stripe.com/c/pay/cs_test_a1' } });
  const c = (await api.register(env, { u: 'Alice', p: 'alice-password-1' })).cookie;
  const o1 = (await api.checkout(env, c, { sku: 'cos:backwear:wings' })).data.order;
  let raw = event('checkout.session.expired', { id: 'cs_test_a1', client_reference_id: o1, status: 'expired', payment_status: 'unpaid' });
  await api.webhook(env, raw, await signStripePayload(raw, WHSEC));
  assert.strictEqual(sqlite.prepare('SELECT status FROM shop_orders WHERE id=?').get(o1).status, 'expired');
  const o2 = (await api.checkout(env, c, { sku: 'cos:backwear:wings' })).data.order;
  raw = event('checkout.session.completed', paidSession(o2, 499));
  await api.webhook(env, raw, await signStripePayload(raw, WHSEC));
  raw = event('charge.refunded', { id: 'ch_1', object: 'charge', payment_intent: 'pi_test_1', refunded: true });
  const rf = await api.webhook(env, raw, await signStripePayload(raw, WHSEC));
  assert.strictEqual(rf.status, 200);
  assert.strictEqual(sqlite.prepare('SELECT status FROM shop_orders WHERE id=?').get(o2).status, 'refunded');
  assert.strictEqual(sqlite.prepare('SELECT COUNT(*) n FROM entitlements').get().n, 1, 'the GM decides about the unlock');
  assert.strictEqual(sqlite.prepare("SELECT COUNT(*) n FROM events WHERE kind='shop-refund'").get().n, 1);
  raw = event('payment_intent.created', { id: 'pi_x' });
  assert.strictEqual((await api.webhook(env, raw, await signStripePayload(raw, WHSEC))).data.status, 'ignored');
});

// --------------------------------------------------------------------- poll ----
await T('order poll: a pending order is checked with Stripe and delivered without a webhook', async () => {
  const { env, sqlite } = freshEnv({ STRIPE_SECRET_KEY: KEY });
  const stripe = stripeMock();
  let paid = false;
  stripe.answer = (url, init) => (init.method || 'GET') === 'POST'
    ? { body: { id: 'cs_test_a1', url: 'https://checkout.stripe.com/c/pay/cs_test_a1' } }
    : { body: paidSession(orderId, 249, { payment_status: paid ? 'paid' : 'unpaid', status: paid ? 'complete' : 'open' }) };
  const c = (await api.register(env, { u: 'Alice', p: 'alice-password-1' })).cookie;
  var orderId = (await api.checkout(env, c, { sku: 'cos:headwear:catEars' })).data.order;
  let r = await api.order(env, c, orderId);
  assert.strictEqual(r.data.order.status, 'pending');
  assert.strictEqual(stripe.calls[1].url, 'https://api.stripe.com/v1/checkout/sessions/cs_test_a1');
  paid = true;
  r = await api.order(env, c, orderId);
  assert.strictEqual(r.data.order.status, 'fulfilled');
  assert.deepStrictEqual((await api.catalog(env, c)).data.owned, ['cos:headwear:catEars']);
  r = await api.order(env, c, orderId);
  assert.strictEqual(r.data.order.status, 'fulfilled');
  assert.strictEqual(stripe.calls.length, 3, 'a settled order is not asked about again');
  assert.strictEqual(sqlite.prepare('SELECT COUNT(*) n FROM entitlements').get().n, 1);
});

await T('order poll: Stripe saying the session expired closes the order', async () => {
  const { env } = freshEnv({ STRIPE_SECRET_KEY: KEY });
  const stripe = stripeMock();
  stripe.answer = (url, init) => (init.method || 'GET') === 'POST'
    ? { body: { id: 'cs_test_a1', url: 'https://checkout.stripe.com/c/pay/cs_test_a1' } }
    : { body: { id: 'cs_test_a1', client_reference_id: orderId, status: 'expired', payment_status: 'unpaid' } };
  const c = (await api.register(env, { u: 'Alice', p: 'alice-password-1' })).cookie;
  var orderId = (await api.checkout(env, c, { sku: 'cos:headwear:catEars' })).data.order;
  assert.strictEqual((await api.order(env, c, orderId)).data.order.status, 'expired');
});

// ---------------------------------------------------------------- save gate ----
await T('PUT /api/save refuses a look wearing a paid item the account does not own (and legacy flags)', async () => {
  const { env, sqlite } = freshEnv({ SHOP_FAKE_CHECKOUT: '1' });
  const c = (await api.register(env, { u: 'Alice', p: 'alice-password-1' })).cookie;
  let r = await api.putSave(env, c, saveWith({ version: 1, sex: 'm', headwear: 'none', facewear: 'none', mouthwear: 'none', backwear: 'wings' }));
  assert.strictEqual(r.status, 409); assert.strictEqual(r.data.cosmeticLocked, true); assert.deepStrictEqual(r.data.locked, ['cos:backwear:wings']);
  r = await api.putSave(env, c, saveWith({ version: 1, halo: true, glasses: true }));
  assert.strictEqual(r.status, 409); assert.deepStrictEqual(r.data.locked, ['cos:headwear:halo', 'cos:facewear:glasses']);
  assert.strictEqual(sqlite.prepare('SELECT COUNT(*) n FROM saves').get().n, 0, 'nothing was written');
  r = await api.putSave(env, c, saveWith({ version: 1, sex: 'f', heads: { f: 5 }, colors: { f: 3 }, headwear: 'none', facewear: 'none', mouthwear: 'none', backwear: 'none' }));
  assert.strictEqual(r.status, 200, 'free slots (hair, colour, gender) are never gated');
  r = await api.putSave(env, c, saveWith(undefined));
  assert.strictEqual(r.status, 409, 'version conflict, not a cosmetic refusal (no appearance at all is fine)'); assert.strictEqual(r.data.cosmeticLocked, undefined);
  await api.checkout(env, c, { sku: 'cos:backwear:wings' });
  const me = await api.me(env, c);
  const v = (await call('onRequestGet', 'api/save.js', { request: req('GET', '/api/save', { cookie: c }), env })).data.version;
  r = await call('onRequestPut', 'api/save.js', { request: req('PUT', '/api/save', { cookie: c, body: { owner: me.data.u, version: v, blob: JSON.stringify({ ...saveWith({ version: 1, backwear: 'wings' }), owner: me.data.u }) } }), env });
  assert.strictEqual(r.status, 200, 'owned now: ' + JSON.stringify(r.data));
});

// ------------------------------------------------------------------------ GM ----
await T('GM console: list, grant and revoke cosmetics; a revoked item is refused on the next save', async () => {
  const { env, sqlite } = freshEnv({ SHOP_FAKE_CHECKOUT: '1' });
  const owner = (await api.register(env, { u: 'KzeR', p: 'owner-password-1' })).cookie;   // first account = owner
  const c = (await api.register(env, { u: 'Alice', p: 'alice-password-1' })).cookie;
  const aliceId = sqlite.prepare("SELECT id FROM users WHERE username='Alice'").get().id;
  assert.strictEqual((await api.gmShop(env, c, aliceId)).status, 403);
  assert.strictEqual((await api.gmShopAct(env, c, { id: aliceId, action: 'grant', sku: 'cos:backwear:wings' })).status, 403);
  await api.checkout(env, c, { sku: 'cos:mouthwear:flower' });
  let r = await api.gmShop(env, owner, aliceId);
  assert.strictEqual(r.status, 200);
  assert.deepStrictEqual(r.data.entitlements.map(e => [e.sku, e.source]), [['cos:mouthwear:flower', 'stripe']]);
  assert.strictEqual(r.data.orders.length, 1); assert.strictEqual(r.data.orders[0].status, 'fulfilled');
  assert.ok(r.data.catalog.length >= 50 && r.data.catalog.every(i => i.sku.startsWith('cos:')));
  r = await api.gmShopAct(env, owner, { id: aliceId, action: 'grant', sku: 'cos:backwear:wings', note: 'event prize' });
  assert.strictEqual(r.status, 200); assert.strictEqual(r.data.granted, true);
  assert.strictEqual((await api.gmShopAct(env, owner, { id: aliceId, action: 'grant', sku: 'cos:backwear:wings' })).data.granted, false);
  assert.strictEqual((await api.gmShopAct(env, owner, { id: aliceId, action: 'grant', sku: 'sup:ori:50' })).status, 400, 'supplies go through Send');
  assert.strictEqual((await api.gmShopAct(env, owner, { id: 999, action: 'grant', sku: 'cos:backwear:wings' })).status, 404);
  assert.ok((await api.catalog(env, c)).data.owned.includes('cos:backwear:wings'));
  assert.strictEqual((await api.putSave(env, c, saveWith({ version: 1, backwear: 'wings', mouthwear: 'flower' }))).status, 200);
  r = await api.gmShopAct(env, owner, { id: aliceId, action: 'revoke', sku: 'cos:backwear:wings', note: 'chargeback' });
  assert.strictEqual(r.data.revoked, true);
  const me = await api.me(env, c);
  r = await call('onRequestPut', 'api/save.js', { request: req('PUT', '/api/save', { cookie: c, body: { owner: me.data.u, version: 1, blob: JSON.stringify({ ...saveWith({ version: 1, backwear: 'wings', mouthwear: 'flower' }), owner: me.data.u }) } }), env });
  assert.strictEqual(r.status, 409); assert.deepStrictEqual(r.data.locked, ['cos:backwear:wings']);
  const kinds = sqlite.prepare("SELECT kind, detail FROM events WHERE kind LIKE 'shop-%' ORDER BY id").all().map(e => e.kind);
  assert.deepStrictEqual(kinds, ['shop-fulfilled', 'shop-grant', 'shop-grant', 'shop-revoke']);
});

// ------------------------------------------------------------- grandfather ----
await T('migration 0005 grandfathers what cloud saves were already wearing, and only that', async () => {
  const sqlite = new DatabaseSync(':memory:');
  const dir = path.join(root, 'migrations');
  const files = migrationFiles();
  for (const name of files.filter(n => !n.startsWith('0005'))) sqlite.exec(fs.readFileSync(path.join(dir, name), 'utf8'));
  const u = sqlite.prepare("INSERT INTO users(username, pass_hash, created_at) VALUES(?, 'x', 0)");
  for (const n of ['wings', 'legacy', 'plain', 'broken']) u.run(n);
  const s = sqlite.prepare('INSERT INTO saves(user_id, version, blob, saved_at, updated_at, last_seen) VALUES(?, 1, ?, 0, 0, 0)');
  s.run(1, JSON.stringify({ lv: 1, appearance: { version: 1, sex: 'f', heads: { f: 5 }, headwear: 'halo', facewear: 'none', mouthwear: 'flower', backwear: 'wings' } }));
  s.run(2, JSON.stringify({ lv: 1, appearance: { version: 1, halo: true, glasses: false, wings: true } }));
  s.run(3, JSON.stringify({ lv: 1, appearance: { version: 1, headwear: 'none', facewear: 'none', mouthwear: 'none', backwear: 'none' } }));
  s.run(4, 'not json at all');
  u.run('unversioned'); s.run(5, JSON.stringify({ lv: 1, appearance: { headwear: 'halo', wings: true } }));   // the game itself ignores this shape
  sqlite.exec(fs.readFileSync(path.join(dir, files.find(n => n.startsWith('0005'))), 'utf8'));
  const rows = sqlite.prepare('SELECT user_id, sku, source FROM entitlements ORDER BY user_id, sku').all().map(r => ({ ...r }));
  assert.deepStrictEqual(rows, [
    { user_id: 1, sku: 'cos:backwear:wings', source: 'legacy' }, { user_id: 1, sku: 'cos:headwear:halo', source: 'legacy' }, { user_id: 1, sku: 'cos:mouthwear:flower', source: 'legacy' },
    { user_id: 2, sku: 'cos:backwear:wings', source: 'legacy' }, { user_id: 2, sku: 'cos:headwear:halo', source: 'legacy' },
  ]);
  const { default: W } = await import(pathToFileURL(path.join(root, 'assets/wardrobe.js')).href);
  const { default: P } = await import(pathToFileURL(path.join(root, 'assets/shop-catalog.js')).href);
  for (const r of sqlite.prepare('SELECT user_id, blob FROM saves').all()) {   // the SQL agrees with the game's own reading of each save
    let a = null; try { a = JSON.parse(r.blob).appearance; } catch (e) { a = null; }
    assert.deepStrictEqual(rows.filter(x => x.user_id === r.user_id).map(x => x.sku).sort(), P.wornSkus(W, a).sort(), 'user ' + r.user_id);
  }
  // running it twice (wrangler re-apply, a restored backup) changes nothing
  sqlite.exec(fs.readFileSync(path.join(dir, files.find(n => n.startsWith('0005'))), 'utf8'));
  assert.strictEqual(sqlite.prepare('SELECT COUNT(*) n FROM entitlements').get().n, 5);
});

// ---------------------------------------------------------------- hygiene ----
await T('shop code carries no secret-looking literals and the GM endpoint checks isGm(user)', async () => {
  const files = ['functions/_lib/shop.js', 'functions/api/shop/catalog.js', 'functions/api/shop/checkout.js', 'functions/api/shop/order.js', 'functions/api/shop/webhook.js', 'functions/api/gm/shop.js'];
  for (const f of files) {
    const src = fs.readFileSync(path.join(root, f), 'utf8');
    assert.ok(!/(sk_live|sk_test|whsec)_[A-Za-z0-9]{8,}/.test(src), f + ' has a key-shaped literal');
    assert.ok(!/(api[_-]?key|secret|password)\s*[:=]\s*['"][^'"]{6,}['"]/i.test(src), f + ' has a secret-shaped literal');
  }
  assert.ok(/isGm\(user\)/.test(fs.readFileSync(path.join(root, 'functions/api/gm/shop.js'), 'utf8')));
  // every shop route the dev server advertises resolves to a real exported handler
  const routesSrc = fs.readFileSync(path.join(root, 'tools/dev_server.js'), 'utf8');
  const routes = [...routesSrc.matchAll(/'(GET|POST|PUT|DELETE) (\/api\/[a-z/]*shop[a-z/]*)': \['(\w+)', '([^']+)'\]/g)];
  assert.ok(routes.length >= 6, 'shop routes listed in tools/dev_server.js: ' + routes.length);
  for (const [, method, route, fn, file] of routes) {
    const m = await import(pathToFileURL(path.join(root, 'functions', file)).href);
    assert.strictEqual(typeof m[fn], 'function', method + ' ' + route + ' -> ' + file + '#' + fn);
  }
});

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
