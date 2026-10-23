// GET /api/shop/catalog -> { currency, items:[...], slots, owned:[sku], mode }
//
// The price list is the same assets/shop-catalog.js the game ships, so this mostly tells the client
// two things it cannot know on its own: what THIS account owns, and whether payments are switched on
// (mode: 'stripe' live, 'fake' dev server --fake-payments, 'off' preview only).

import { currentUser } from '../../_lib/auth.js';
import { json, guard } from '../../_lib/http.js';
import { CATALOG, ownedSkus, shopMode } from '../../_lib/shop.js';

export const onRequestGet = guard(async ({ request, env }) => {
  const user = await currentUser(request, env.DB);
  // One read answers two questions: what this account owns, and whether the tables exist at all
  // (null = migrations/0005_shop.sql has not been applied; the client then changes nothing).
  const owned = await ownedSkus(env.DB, user ? user.id : 0);
  const installed = owned !== null;
  return json({ version: CATALOG.version, currency: CATALOG.currency, slots: CATALOG.slots, items: CATALOG.items,
    owned: installed && user ? [...owned] : [], mode: installed ? shopMode(env) : 'off', installed, user: user ? user.username : null });
});
