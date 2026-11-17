// A reproducible, legitimate full-storage account. Use the production constructors, including
// addCatch(): short handwritten fish ids and missing r/locked fields hid the v3 size failure.
const fs = require('node:fs');
const path = require('node:path');
const { createGame } = require('./game');

function fullStorageSave(seed = 241) {
  const g = createGame();
  try {
    g.window.eval(fs.readFileSync(path.join(__dirname, '../../../assets/social-fishing.js'), 'utf8'));
    return JSON.parse(g.ev(`(() => {
      const random = Math.random, clock = Date.now;
      let seed = ${JSON.stringify(seed)}, now = 1794873600000;
      // Only the clock/RNG are controlled. Item/card/fish identities are still minted by the game.
      Math.random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
      Date.now = () => now++;
      try {
        S = load(); S.cls = 'Ranger'; S.lv = 150; S.inv = []; S.cards = []; S.eq = {};
        // Late-map Nightmare cards also exercise the three-digit permanent catalog ids, rather
        // than getting an artificial saving from four early, one/two-digit references.
        const defs = CARD_CATALOG.filter(c => c.map === 9 && c.nightmare && c.fit.includes('weapon') && !c.bossCard);
        if (new Set(defs.map(cardFamily)).size !== 4) throw Error('fixture needs four distinct families');
        for (let i = 0; i < BAGMAX; i++) {
          const it = genGear({ k: 'bow', n: ABYSS_ASCENDED.w.bow, quality: ABYSS_ASCENDED_QUALITY },
            145, 5, false, undefined, 9, 15);
          it.r = 10; it.locked = true;
          if (it.slots !== 4) throw Error('the game no longer generates four-socket bows');
          for (const d of defs) {
            const c = newCard(d); c.stars = 3;
            const why = socketWhy(c, it);
            if (why) throw Error('unreachable socket in fixture: ' + why);
            it.cards.push(c);
          }
          S.inv.push(it);
        }
        for (let i = 0; i < CARDMAX; i++) {
          const c = newCard(CARD_CATALOG[i % CARD_CATALOG.length]); c.stars = 3; S.cards.push(c);
        }
        const F = PGSocialFishing;
        S.fishing = F.normalize({ bagTier: F.BAG_TIERS.at(-1).tier });
        for (let i = 0; i < F.bagMax(S.fishing); i++) {
          const sp = F.SPECIES[i % F.SPECIES.length];
          const c = F.addCatch(S.fishing, { sp: sp.id, w: sp.min + (sp.max - sp.min) * Math.random(),
            mut: i % 2 ? 'prismatic' : null, perfect: i % 2 === 0 }, 1794873600000 + i * 60000);
          if (!c) throw Error('production addCatch() refused a fixture fish');
          if (i % 7 === 0) c.lock = true;
        }
        return JSON.stringify(S);
      } finally { Math.random = random; Date.now = clock; }
    })()`));
  } finally { g.close(); }
}

module.exports = { fullStorageSave };
