# Cash Shop — setting up payments on Cloudflare (haven-v215)

This is the click-by-click for turning the Cash Shop on. The code is already in the game and on
the server; what is missing is **your Stripe account** and **two secrets** on the Pages project.
Until those exist the shop is browsable but cannot take money, and nothing breaks.

Time: about 30 minutes the first time, most of it on Stripe's side. **Do this on the test keys
first** — Stripe gives every account a complete sandbox with fake cards, so you can watch a
purchase land on a real cloud account without a single real charge.

> The short version: `0005_shop.sql` on the database → `STRIPE_SECRET_KEY` secret → a webhook
> pointing at `https://<your site>/api/shop/webhook` → `STRIPE_WEBHOOK_SECRET` secret → redeploy →
> buy something with card `4242 4242 4242 4242` → switch both secrets to the live keys.

---

## 1. What you are turning on

| Piece | Where | What it does |
|---|---|---|
| Price list | `assets/shop-catalog.js` | **The one place prices live.** The game shows it, the server charges from it. |
| Shop panel | `assets/shop.js`, `assets/shop.css` — the 💎 **Cash Shop** destination (hotkey **T**) | Cosmetics by slot, supplies by group, Buy / Try on, order status. |
| Wardrobe lock | `assets/wardrobe-ui.js` | Paid accessories show their price, cannot be applied until owned; a **Buy** button appears for the locked item. Hair, hair colour and gender stay free. |
| Server | `functions/api/shop/*`, `functions/_lib/shop.js` | Creates Stripe Checkout Sessions, receives Stripe's webhook, delivers, and **refuses any save wearing an unowned cosmetic** (`functions/api/save.js`). |
| Database | `migrations/0005_shop.sql` | `shop_orders`, `entitlements` (what each account owns), `shop_webhooks` (replay guard) — and the one-off **grandfather clause**. |
| GM console | `gm.html` → player → **Cash Shop** tab | Owned cosmetics, orders, grant/revoke. |

What is for sale:

* **Cosmetics** — every item in the Wardrobe's four accessory slots (Head, Face, Mouth, Wings). A
  purchase is a permanent unlock **for that account**. 52 items.
* **Supplies** — Oridecon, Elunium, Astral Shards, Primal Catalysts, Valkyrie's Sigils, Refine
  Protection Scrolls, Mythic Protection Scrolls, in fixed bundles. Delivered through the same queue GM
  gifts use, so they land on the character on the next sync (seconds). 14 bundles.

How a purchase flows:

1. The player clicks **Buy**. The game opens a new tab immediately and asks `POST /api/shop/checkout`.
2. The server writes a `pending` order, asks Stripe for a Checkout Session **with the price from the
   server's copy of the list** (the browser never sends a price), and returns Stripe's URL. The new
   tab goes there.
3. The player pays on Stripe's page. Stripe calls `POST /api/shop/webhook` (signed). The server
   checks the signature, checks the amount matches the order, and delivers — once, inside one
   database transaction, even if Stripe retries the webhook.
4. Meanwhile the game tab polls `GET /api/shop/order?id=…` every 5 seconds. If the webhook has not
   arrived yet, that poll asks Stripe directly and delivers the same way. Either path is enough on its
   own, so a misconfigured webhook delays nothing — but set it up anyway (see §6), it is what makes
   delivery work when the player closes the game before paying.
5. Stripe sends the player back to `https://<your site>/?shop=success&order=…`, which shows a line on
   the login card. The original tab says the item is theirs.

Three modes, decided by what exists on the server:

| Mode | When | Behaviour |
|---|---|---|
| **off** | no `STRIPE_SECRET_KEY` | Panel is browsable; Buy answers "not taking payments yet". **This is production today.** |
| **fake** | `SHOP_FAKE_CHECKOUT=1` (only the dev server's `--fake-payments` sets it) | Orders are delivered instantly, no card. For rehearsing. |
| **stripe** | `STRIPE_SECRET_KEY` set | Real Checkout. Test or live depends on which key you pasted. |

---

## 2. Rehearse without Stripe (5 minutes, optional but recommended)

```sh
bash tools/build_site.sh
node tools/dev_server.js --gm-all --fake-payments
```

Open `http://localhost:8788/`, register any account, open the Wardrobe (W): paid items show
`· $4.99 🔒`, Apply is disabled for them and a **Buy** button appears. Open the Cash Shop (T), buy
something: the "payment" tab shows the success line at once, the game tab says the item is unlocked,
and the Wardrobe now lets you apply it. Buy a supply bundle: it arrives in the log as
`🛒 Cash Shop delivery`. Then open `http://localhost:8788/gm.html` → that player → **Cash Shop**:
the order and the unlock are listed, and **Revoke** takes a cosmetic back (the player's look drops it
on their next sync — a save wearing it is refused with HTTP 409 and the game takes it off itself).

Nothing in this mode talks to Stripe or costs anything. Production can never enter it: only
`tools/dev_server.js` sets `SHOP_FAKE_CHECKOUT`.

---

## 3. Apply the database migration (once)

Pages builds never run SQL. On the existing `pg` database:

```sh
npx wrangler d1 execute pg --remote --file=migrations/0005_shop.sql
```

(or paste the file into **Workers & Pages → D1 → pg → Console**). It is additive and safe to rerun.

**This is also the grandfather step.** Any cloud account that is *wearing* a paid accessory at the
moment you run it gets that item as a free `legacy` unlock — the decision you made so nobody loses
what they already had on. Run it **before** deploying the new build; a save pushed by the new build
is refused if it wears something the account does not own, and the migration is what makes those
accounts own it. It reads the current `saves` table, so run it after the last deploy of the old build
has had a few minutes for players to sync.

Two limits of the clause, so you are not surprised: it covers what is **equipped** in the cloud save
(not items a player tried on and took off), and it covers **cloud accounts only** — a player who only
ever played locally, never registered, has no row to read. If one of those players asks, grant the
item in the GM console (§7).

Check it worked:

```sh
npx wrangler d1 execute pg --remote --command "SELECT sku, COUNT(*) n FROM entitlements WHERE source='legacy' GROUP BY sku ORDER BY n DESC"
```

---

## 4. Create the Stripe account and find the keys

1. Sign up at <https://dashboard.stripe.com/register>. Stripe operates in Malaysia; you will be asked
   for business details and a bank account before **live** payouts work, but the **test** keys work
   the moment the account exists. Do the business verification in parallel — it can take days.
2. In the dashboard, make sure the **Test mode** toggle (top right) is **on** for everything in §4–§6.
3. **Developers → API keys.** You need the **Secret key** (`sk_test_…`). Click *Reveal*, copy it.
   You do not need the publishable key — the game never talks to Stripe from the browser; it only
   follows a Checkout URL.

Never paste a key into the repo, a commit message, a screenshot or this document. The test suite scans
`functions/api/**` for key-shaped strings and fails if it finds one.

---

## 5. Put the secret key on the Pages project

**Workers & Pages → prontera-grind → Settings → Variables and Secrets → Add**:

| Name | Type | Value |
|---|---|---|
| `STRIPE_SECRET_KEY` | **Secret** (encrypt) | `sk_test_…` for now, the `sk_live_…` key later |

Or from the terminal:

```sh
npx wrangler pages secret put STRIPE_SECRET_KEY --project-name prontera-grind
```

Add it to the **Production** environment (and Preview if you want preview deployments to sell — you
probably do not; leave Preview empty and preview builds stay in *off* mode).

**Secrets apply to the next deployment**, not the running one. Redeploy after setting them (push a
commit, or *Deployments → ⋯ → Retry deployment*).

---

## 6. Point a Stripe webhook at the site

1. **Developers → Webhooks → Add endpoint** (still in Test mode).
2. Endpoint URL: `https://<your Pages domain>/api/shop/webhook` — the real domain players use,
   e.g. `https://prontera-grind.pages.dev/api/shop/webhook` or your custom domain.
3. **Events to send** — pick exactly these:
   * `checkout.session.completed`
   * `checkout.session.async_payment_succeeded`
   * `checkout.session.async_payment_failed`
   * `checkout.session.expired`
   * `charge.refunded`
4. Create it, then click **Reveal** under *Signing secret* (`whsec_…`) and add it to the Pages project
   the same way as §5:

| Name | Type | Value |
|---|---|---|
| `STRIPE_WEBHOOK_SECRET` | **Secret** | `whsec_…` |

Redeploy again. Until this secret exists the endpoint answers 503 and Stripe will show the attempts
as failed — harmless, the poll delivers meanwhile — but do finish this step.

The handler verifies the `Stripe-Signature` header (HMAC-SHA256 over the raw body, 5-minute
tolerance) and ignores any event id it has already seen (`shop_webhooks`). A forged or replayed call
cannot deliver anything.

---

## 7. Test with a fake card

Still in Test mode, on the live site:

1. Sign in to a cloud account, open the **Cash Shop** (T). The panel should no longer say *Browsing
   only*. Buy a cosmetic.
2. On Stripe's page use card **4242 4242 4242 4242**, any future expiry, any CVC, any postcode.
3. Within a few seconds the game tab logs `🛒 <item> is yours!` and the Wardrobe applies it. The
   payment tab shows *Payment received*.
4. In Stripe: **Payments** shows the charge with `order_id`, `username` and `sku` in its metadata;
   **Developers → Webhooks → your endpoint** shows the events delivered with `200`.
5. In the GM console → player → **Cash Shop**: the order is `✅ paid & delivered`, the unlock lists as
   `paid` with its order id.
6. Try a supply bundle too, then click **Refund** on that payment in Stripe: the order flips to
   `↩ refunded` in the GM console, the unlock (if any) is **kept** until you decide — use **Revoke** if
   the refund was not a goodwill one. The game never auto-strips on a refund.

Other test cards: `4000 0000 0000 9995` (declined), `4000 0025 0000 3155` (3-D Secure challenge).
Cancelling on Stripe's page returns to `/?shop=cancel` and the order expires on its own.

---

## 8. Go live

1. Finish Stripe's business verification; add your bank account; make sure **Settings → Business →
   Customer-facing name / statement descriptor** says something players recognise (e.g. *PRONTERA
   GRIND*), because that is what appears on their card statement.
2. Switch the dashboard toggle to **Live mode** and repeat §4 (copy the **live** secret key) and §6
   (create a **live** webhook endpoint — test and live endpoints are separate, with separate signing
   secrets).
3. Replace both secrets on the Pages project with the live values, redeploy, and make one real small
   purchase yourself (Mouth items are the cheapest) to see a real charge, a real delivery and the real
   statement descriptor. Refund yourself from the dashboard afterwards.
4. Stripe publishes a **Payments → Refund policy / Terms** expectation: put a line in the game's
   Settings or a `/terms` page saying purchases are digital goods delivered immediately, refunds are
   handled by contacting you, and cosmetics are tied to the account. The panel's *Good to know* fold
   already says the last two.

Stripe's fee in Malaysia is roughly 3% + a fixed amount per successful charge; a $1.49 item nets you
less than it looks. That is why the catalog starts at $1.49, not $0.99, and why Stripe refuses anything
under $0.50.

---

## 9. Changing prices or adding items

Everything is in `assets/shop-catalog.js`:

* `SLOT_PRICES` — the price of every item in a slot (`headwear`, `facewear`, `mouthwear`, `backwear`).
* `PRICE_OVERRIDES` — per-item exceptions by SKU (the dragon helms and the large wings cost more).
* `SUPPLIES` — `[resource, amount, price]` rows; the resource ids are the ones GM gifts use.

Prices are **whole US cents**. After editing: bump `?v=` on the `assets/shop-catalog.js` script tag
in `index.html` (so browsers fetch the new list), bump `BUILD`, run `node tools/tests/shop_api_sim.js`
and `node tools/tests/shop_sim.js`, deploy. No Stripe dashboard work: sessions are created with inline
`price_data`, so Stripe learns the price per purchase.

New Wardrobe accessories are for sale automatically — any id added to `PGWardrobe.ACCESSORIES` becomes
`cos:<slot>:<id>` at its slot's price. Never rename an existing SKU: entitlements are stored by SKU.

Adding another currency means changing `CURRENCY` and every price; Stripe will present the charge in
that currency. The catalog is deliberately single-currency so the list stays honest.

---

## 10. Running it

* **Where the money is**: Stripe dashboard. The game's tables are for delivery and support; the
  payment record of truth is Stripe's, and every charge carries `order_id` / `username` / `sku`.
* **Support questions** ("I paid but got nothing"): ask for the order id (it is in their log line and
  on the success page), open the GM console → that player → Cash Shop. `pending` with a paid charge in
  Stripe means the webhook never arrived *and* the player closed the game before the poll ran — their
  next visit to the shop with that order still pending resumes the poll; or just **Grant** the item
  (cosmetic) / send it from **Send items & Zeny** (supply) and note the order id.
* **Chargebacks / refunds**: `charge.refunded` marks the order; you decide about the unlock
  (**Revoke** in the GM console). The next save the player pushes while wearing it is refused and the
  game takes it off.
* **Audit**: every delivery, grant and revoke is an `events` row (`shop-fulfilled`, `shop-grant`,
  `shop-revoke`, `shop-refund`, `shop-amount-mismatch`) visible under *This player's log*.
* **Turning it off in an emergency**: delete `STRIPE_SECRET_KEY` from the project and redeploy. The
  shop returns to *off* mode: nothing can be bought, everything already owned stays owned.
* **Rate limit**: 12 checkout attempts per account per 10 minutes (`shop-checkout:<id>` in
  `rate_limits`).
* **Backups**: `entitlements` is now part of what `npx wrangler d1 export pg --remote` must include.
  It is small (one row per owned item).

## 11. What is deliberately not here

* No premium currency, no gacha, no subscription, no stored card details — one item, one Checkout.
* No client-side trust: the browser cannot set a price, cannot mark an order paid, and cannot wear an
  item the server does not list as owned.
* No automatic revoke on refund, no automatic refund on revoke — both are human decisions in the
  two dashboards.
* Local (non-cloud) saves cannot hold paid items: there is no account to own them.
