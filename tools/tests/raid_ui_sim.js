// Rift Raid client smoke: the lobby renders eligibility before readiness, the walkable arena keeps
// its party/target across updates, and movement stays a server lane action with no WebGL renderer.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createGame } = require('./helpers/game');

const ROOT = path.resolve(__dirname, '..', '..');
let pass = 0, fail = 0;
const t = async (name, fn) => {
  try { await fn(); console.log('  ok   ' + name); pass++; }
  catch (e) { console.log('  FAIL ' + name + ' -> ' + (e && e.stack || e)); fail++; }
};

function runFixture(overrides = {}) {
  const now = Date.now();
  return {
    id: 'raid:ui-1', state: 'active', partySize: 2, totalHp: 360000000, hpRemaining: 300000000,
    phaseIndex: 1, phaseHp: 50000000, phaseHps: [54000000, 54000000, 54000000, 198000000],
    phaseNames: ['Fracture scouts', 'Rift heralds', 'Astral sentries', 'The Rift Sovereign'],
    startedAt: now - 20000, deadlineAt: now + 340000, finishedAt: 0, settledAckAt: 0, serverNow: now,
    bossArmor: 0.3,
    hazard: { id: 'h1', kind: 'rift-sweep', dangerZones: ['left', 'right'], startsAt: now - 300, endsAt: now + 1200 },
    schedule: { autoAttackMs: 3000, strikeCooldownMs: 5000, tellMs: 1500, intervalMs: 9000, nextHazardAt: now + 9000 },
    members: [
      { id: 7, name: 'Alpha', cls: 'Lord Knight', magic: false, sex: 'm', dps: 800000, hp: 90000, maxHp: 115272, lane: 'center', damage: 5000000, support: 0, actions: 3, dodges: 1, downs: 0, downed: false, downUntil: 0, wardUntil: 0, strikeReadyAt: now + 3000, healReadyAt: 0, wardReadyAt: 0, reviveReadyAt: 0 },
      { id: 8, name: 'Beta', cls: 'Warlock', magic: true, sex: 'f', dps: 800000, hp: 0, maxHp: 67242, lane: 'left', damage: 2000000, support: 0, actions: 2, dodges: 0, downs: 1, downed: true, downUntil: 0, wardUntil: 0, strikeReadyAt: 0, healReadyAt: 0, wardReadyAt: 0, reviveReadyAt: 0 },
    ],
    ...overrides,
  };
}

(async () => {
  console.log('player raid UI: lobby, walkable arena, no second renderer\n');
  const game = createGame();
  const w = game.window;
  let currentRun = runFixture();
  let getCount = 0, postCount = 0, lastCombat = null;

  w.fetch = async (url, options = {}) => {
    if (String(url).includes('/api/raid')) {
      if (!options.method) {
        getCount++;
        return { ok: true, status: 200, json: async () => ({
          ok: true, enabled: true, account: { userId: 7, entriesLeft: 1, riftShards: 15, chestsToday: { pity: 0, fractured: 1 } },
          party: { id: 'rp_abcd1234', leader: 7, open: true, isLeader: true, allReady: false, allEligible: true, canStart: false, members: [
            { id: 7, name: 'Alpha', cls: 'Lord Knight', magic: false, ready: false, readyStored: false, eligible: true, entriesLeft: 1, maxHp: 115272, dps: 800000 },
            { id: 8, name: 'Beta', cls: 'Warlock', magic: true, ready: false, readyStored: false, eligible: true, entriesLeft: 2, maxHp: 67242, dps: 800000 },
          ] },
          activeRun: null, partyError: '',
        }) };
      }
      postCount++;
      const body = JSON.parse(options.body || '{}');
      if (body.action === 'act') lastCombat = body;
      if (body.action === 'start') return { ok: true, status: 200, json: async () => ({ ok: true, runId: currentRun.id, run: currentRun }) };
      if (body.action === 'act') return { ok: true, status: 200, json: async () => ({ ok: true, run: currentRun }) };
      return { ok: true, status: 200, json: async () => ({ ok: true, party: null }) };
    }
    return { ok: false, status: 404, json: async () => ({ err: 'offline' }) };
  };
  w.eval(fs.readFileSync(path.join(ROOT, 'assets/rift-raid.js'), 'utf8'));
  assert.ok(w.PGRaid, 'PGRaid is exported');

  await t('the lobby shows remaining entries and eligibility before readiness', async () => {
    await w.PGRaid.open();
    const overlay = w.document.getElementById('raidOverlay');
    assert.ok(overlay && !overlay.hidden, 'overlay opens');
    const text = overlay.textContent;
    assert.match(text, /1 \/ 2 entries/);
    assert.match(text, /Form \/ join party/);
    assert.match(text, /Solo raid/);
    assert.match(text, /ready/i);
    w.PGRaid.close();
  });

  await t('a start renders the walkable arena, boss/party sprites and a danger lane', async () => {
    await w.PGRaid.open();
    await w.PGRaid.refresh();
    w.document.querySelector('[data-raid-action="solo"]').click();
    await new Promise(r => setTimeout(r, 0));
    const text = w.document.getElementById('raidOverlay').textContent;
    assert.match(text, /Rift Sovereign/);
    assert.match(text, /Center/);
    assert.match(text, /Rescue/);
    assert.match(text, /DANGER/);
    assert.ok(w.document.querySelectorAll('.raid-zone').length === 3, 'three physical arena lanes');
    assert.ok(w.document.querySelector('#raidArena'), 'the map arena is mounted');
    assert.ok(w.document.querySelectorAll('.raid-unit').length === 2, 'every party member has a map sprite');
    assert.ok(w.document.querySelector('.raid-zone[data-raid-zone="left"]').classList.contains('danger'), 'left lane telegraphs danger');
    assert.ok(w.document.querySelectorAll('.raid-pcard').length === 2);
    assert.match(w.document.getElementById('raidOverlay').innerHTML, /width:/, 'HP bars use finite percentages');
  });

  await t('walking to another lane sends the move action to the server', async () => {
    w.PGRaid._moveTo(18, 74);
    await new Promise(r => setTimeout(r, 0));
    assert.ok(lastCombat, 'a combat request was sent');
    assert.equal(lastCombat.combatAction, 'move');
    assert.equal(lastCombat.zone, 'left');
    assert.match(lastCombat.actionId, /^raid:/);
  });

  await t('holding a movement key walks the sprite and republishes the crossed lane', async () => {
    const arena = w.PGRaid.state.arena;
    assert.ok(arena, 'the arena has a walk state');
    const startX = arena.x;
    w.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'a', bubbles: true }));
    for (let frame = 1; frame <= 40 && w.__raf; frame++) {
      const step = w.__raf;
      w.__raf = null;
      step(frame * 48);
    }
    w.dispatchEvent(new w.KeyboardEvent('keyup', { key: 'a', bubbles: true }));
    assert.ok(arena.x < startX, 'the sprite walked left');
    assert.equal(arena.x, 8, 'the sprite stops at the arena edge');
    const sprite = w.document.querySelector('.raid-unit.you');
    assert.ok(sprite, 'the sprite is still mounted');
    assert.equal(sprite.style.left, '8%', 'the walk loop owns the sprite position');
    assert.equal(arena.lane, 'left');
    assert.equal(lastCombat.combatAction, 'move');
    assert.equal(lastCombat.zone, 'left', 'crossing into the left lane is sent to the server');
  });

  await t('the target and arena DOM survive an incoming party update', async () => {
    const target = w.document.querySelector('[data-raid-target="8"]');
    target.click();
    const next = runFixture({ hpRemaining: 280000000, hazard: { id: 'h2', kind: 'fracture-slam', dangerZones: ['center'], startsAt: Date.now(), endsAt: Date.now() + 1500 } });
    w.PGRaid.receive(next);
    await new Promise(r => setTimeout(r, 0));
    assert.equal(w.PGRaid.state.targetId, 8, 'the rescue target is kept');
    assert.equal(w.PGRaid.state.lane, 'center', 'the server lane is mirrored');
    assert.ok(w.document.querySelector('.raid-zone[data-raid-zone="center"]').classList.contains('danger'));
    assert.equal(w.document.querySelectorAll('#raidArena').length, 1, 'the arena is not rebuilt on every update');
    assert.ok(w.document.querySelectorAll('.raid-unit').length === 2);
  });

  await t('the client reuses the existing socket, moves through the server and adds no renderer', () => {
    const source = fs.readFileSync(path.join(ROOT, 'assets/rift-raid.js'), 'utf8');
    const social = fs.readFileSync(path.join(ROOT, 'assets/social.js'), 'utf8');
    assert.ok(!/WebGLRenderer|new\s+THREE\.|createRenderer/.test(source), 'no new WebGL renderer');
    assert.match(source, /requestAnimationFrame\(arenaFrame\)/, 'the arena has one local movement loop');
    assert.match(source, /combatAction: 'move'/, 'walking is sent to the server as a lane action');
    assert.ok(!/setInterval\s*\([^)]*(?:fetch|api\()/.test(source), 'the only interval is the local countdown');
    assert.match(social, /raid_state/);
    assert.match(source, /min-height:44px|min-height:48px/);
    assert.match(source, /serverNow/);
  });

  await t('Rift Raid rewards apply directly and never appear as an expiring mailbox gift', () => {
    const goesToMail = w.eval('grantGoesToMail');
    assert.equal(goesToMail({ kind: 'gift', from: 'Rift Raid', payload: { resource: 'ascMat2', amount: 4 } }), false);
    assert.equal(goesToMail({ kind: 'gift', from: 'Echo competition', payload: {} }), true);
    w.eval('S.ascensionMat=[0,0,0];S.riftShards=0;');
    w.eval("gmApplyGift({resource:'riftShards',amount:10});gmApplyGift({resource:'ascMat2',amount:4});gmApplyGift({resource:'ascMat0',amount:2});");
    assert.equal(w.eval('S.riftShards'), 10);
    assert.equal(w.eval('S.ascensionMat[2]'), 4);
    assert.equal(w.eval('S.ascensionMat[0]'), 2);
    assert.match(fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8'), /Rift Raid reward applied/);
  });

  await t('a member who was offline when the run ended sees the settled result once', async () => {
    const g = createGame();
    const ww = g.window;
    let settleCalls = 0;
    ww.fetch = async (url, options = {}) => {
      if (!String(url).includes('/api/raid')) return { ok: false, status: 404, json: async () => ({ err: 'offline' }) };
      if (!options.method) return { ok: true, status: 200, json: async () => ({
        ok: true, enabled: true, account: { userId: 7, entriesLeft: 2, chestsToday: {} },
        party: null, activeRun: null, lastRun: { id: 'raid:done-1', state: 'cleared', settledAt: Date.now() },
      }) };
      settleCalls++;
      return { ok: true, status: 200, json: async () => ({
        ok: true, outcome: 'clear', settledAt: Date.now(), acknowledged: true,
        rewards: [{ kind: 'clear', riftShards: 10, sigils: 4, regionalMaterials: 2, zeny: 1000000 }, { kind: 'fractured', riftShards: 5, zeny: 250000 }],
      }) };
    };
    ww.eval(fs.readFileSync(path.join(ROOT, 'assets/rift-raid.js'), 'utf8'));
    await ww.PGRaid.open();
    assert.equal(ww.PGRaid.state.view, 'results');
    assert.equal(settleCalls, 1);
    assert.match(ww.document.getElementById('raidOverlay').textContent, /Rift shards/i);
    await ww.PGRaid.refresh();
    assert.equal(settleCalls, 1, 'refresh does not settle the same result twice');
    g.close();
  });

  await t('the Rift Forge spends shards, never drops a star on failure, and uses a booster', async () => {
    const g = createGame();
    const ww = g.window;
    ww.fetch = async (url, options = {}) => {
      if (!String(url).includes('/api/raid')) return { ok: false, status: 404, json: async () => ({ err: 'offline' }) };
      if (!options.method) return { ok: true, status: 200, json: async () => ({
        ok: true, enabled: true,
        account: { userId: 7, entriesLeft: 1, riftShards: 40, qualifyingClears: 0, chestsToday: {}, cards: [] },
        party: null, activeRun: null,
      }) };
      return { ok: true, status: 200, json: async () => ({ ok: true }) };
    };
    ww.eval(fs.readFileSync(path.join(ROOT, 'assets/rift-raid.js'), 'utf8'));
    ww.eval("S.eq=S.eq||{};S.eq.weapon={id:'forge-test',slot:'weapon',name:'Test Blade',val:100,stars:0};S.riftShards=100;");
    ww.Math.random = () => 0.999;
    await ww.PGRaid.open();
    assert.match(ww.document.getElementById('raidBody').textContent, /Rift Forge/);
    assert.equal(ww.document.querySelectorAll('[data-raid-action="forge-extra"]').length, 4, 'standard plus three extra-shard options');
    ww.document.querySelector('[data-raid-action="forge-extra"][data-raid-value="2"]').click();
    assert.equal(ww.PGRaid.state.forgeExtra, 2);
    const before = ww.eval('S.riftShards');
    ww.document.querySelector('[data-raid-action="forge"]').click();
    await new Promise(r => setTimeout(r, 0));
    assert.equal(ww.eval('S.eq.weapon.stars'), 0, 'a failed forge never removes (or adds) a star');
    assert.equal(ww.eval('S.riftShards'), before - 20, 'base 8 + charged 12 shards are consumed');
    ww.Math.random = () => 0;
    ww.document.querySelector('[data-raid-action="forge"]').click();
    await new Promise(r => setTimeout(r, 0));
    assert.equal(ww.eval('S.eq.weapon.stars'), 1, 'the next success adds one star');
    assert.match(ww.document.getElementById('raidBody').textContent, /Forged/);
    g.close();
  });

  await t('account clears unlock the aura and four Rift titles; a card can be equipped', async () => {
    const g = createGame();
    const ww = g.window;
    let equipped = '';
    const cardAccount = () => ({
      userId: 7, entriesLeft: 1, riftShards: 10, qualifyingClears: 3, chestsToday: {},
      cards: [
        { key: 'sovereign-fang', name: 'Sovereign Fang', desc: '+3% DPS per rank.', copies: 3, rank: 2, equipped: equipped === 'sovereign-fang' },
        { key: 'astral-bulwark', name: 'Astral Bulwark', desc: '+5% max HP per rank.', copies: 0, rank: 0, equipped: false },
        { key: 'herald-vow', name: 'Herald Vow', desc: '+4% max HP per rank.', copies: 1, rank: 1, equipped: false },
      ],
      equippedCard: equipped,
    });
    ww.fetch = async (url, options = {}) => {
      if (!String(url).includes('/api/raid')) return { ok: false, status: 404, json: async () => ({ err: 'offline' }) };
      if (!options.method) return { ok: true, status: 200, json: async () => ({ ok: true, enabled: true, account: cardAccount(), party: null, activeRun: null }) };
      const body = JSON.parse(options.body || '{}');
      if (body.action === 'card') equipped = body.cardKey || '';
      return { ok: true, status: 200, json: async () => ({ ok: true, account: cardAccount() }) };
    };
    ww.eval(fs.readFileSync(path.join(ROOT, 'assets/rift-raid.js'), 'utf8'));
    await ww.PGRaid.open();
    assert.equal(ww.eval('S.raidClears'), 3);
    assert.equal(ww.eval('S.riftAura'), true);
    assert.ok(ww.document.body.classList.contains('has-rift-aura'), 'the earned aura is applied');
    const titles = ww.PGTitles.CHALLENGES.filter(t => t.category === 'raid');
    assert.equal(titles.length, 4, 'four earned Rift titles exist');
    const state = ww.eval('S'), classes = ww.eval('CLASSES');
    assert.ok(titles.filter(t => t.goal <= 3).every(t => ww.PGTitles.unlocked(t, state, classes)), 'three clears unlock the one- and three-clear titles');
    assert.equal(ww.PGTitles.unlocked(titles.find(t => t.goal === 6), state, classes), false, 'six clears are still required for the third title');
    assert.equal(ww.PGTitles.unlocked(titles.find(t => t.goal === 10), state, classes), false, 'ten clears are still required for the last title');
    assert.match(ww.document.getElementById('raidBody').textContent, /Sovereign Fang/);
    ww.document.querySelector('[data-raid-action="card"][data-raid-value="sovereign-fang"]').click();
    await new Promise(r => setTimeout(r, 0));
    assert.equal(equipped, 'sovereign-fang');
    assert.equal(ww.PGRaid.state.account.equippedCard, 'sovereign-fang');
    g.close();
  });

  await t('weapon stars raise field ATK in every zone, not only the raid', () => {
    const g = createGame();
    const ww = g.window;
    ww.eval(fs.readFileSync(path.join(ROOT, 'assets/rift-progression.js'), 'utf8'));
    ww.eval("S.eq=S.eq||{};S.eq.weapon={id:'star-atk',slot:'weapon',wt:'sword',name:'Star Sword',val:1000,stars:0,r:0,aff:[]};S.st.str=99;S.lv=100;");
    const base = ww.eval('atk()');
    ww.eval('S.eq.weapon.stars=20');
    const maxed = ww.eval('atk()');
    assert.ok(maxed > base, '20 stars raise the field attack');
    assert.ok(Math.abs(maxed / base - 1.4) < 0.02, '20 stars are +40% ATK: ' + base + ' -> ' + maxed);
    const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
    assert.match(html, /assets\/rift-progression\.js/);
    g.close();
  });

  await t('the map and Social Hub both open the same lobby', () => {
    const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
    assert.match(html, /\['raid','Rift Raid'\]/);
    assert.match(html, /PGRaid\.open\(\)/);
    assert.ok((html.match(/PGRaid\.open\(\)/g) || []).length >= 2);
    assert.match(html, /assets\/rift-raid\.js/);
    const panel = w.eval("mapSeason='raid';V.map()");
    assert.match(panel, /raid-destination/);
    assert.match(panel, /PGRaid\.open\(\)/);
    assert.match(panel, /Two entries per Malaysia day/);
    assert.match(panel, /Walk the volcanic rift arena/, 'the Map tab describes the walkable arena');
    assert.match(panel, /raid-destination-arena/, 'the Map tab previews the arena map art');
    w.eval("mapSeason='atlas'");
  });

  await t('three client instances render the same run and keep their own card after a reconnect', async () => {
    const now = Date.now();
    const trio = runFixture({
      partySize: 3, totalHp: 540000000, hpRemaining: 410000000,
      phaseHps: [81000000, 81000000, 81000000, 297000000],
      members: [
        { id: 7, name: 'Alpha', cls: 'Lord Knight', magic: false, sex: 'm', dps: 800000, hp: 100000, maxHp: 115272, lane: 'center', damage: 5e6, support: 0, actions: 3, dodges: 1, downs: 0, downed: false, downUntil: 0, wardUntil: 0, strikeReadyAt: now + 2000, healReadyAt: 0, wardReadyAt: 0, reviveReadyAt: 0 },
        { id: 8, name: 'Beta', cls: 'Warlock', magic: true, sex: 'f', dps: 700000, hp: 50000, maxHp: 67242, lane: 'left', damage: 3e6, support: 100, actions: 4, dodges: 0, downs: 0, downed: false, downUntil: 0, wardUntil: 0, strikeReadyAt: now + 4000, healReadyAt: 0, wardReadyAt: 0, reviveReadyAt: 0 },
        { id: 9, name: 'Gamma', cls: 'Priest', magic: true, sex: 'f', dps: 650000, hp: 0, maxHp: 80000, lane: 'right', damage: 1e6, support: 900, actions: 5, dodges: 0, downs: 1, downed: true, downUntil: 0, wardUntil: 0, strikeReadyAt: 0, healReadyAt: 0, wardReadyAt: 0, reviveReadyAt: 0 },
      ],
    });
    let live = trio;
    const clients = [7, 8, 9].map(id => {
      const g = createGame();
      const ww = g.window;
      ww.fetch = async (url, options = {}) => {
        if (!String(url).includes('/api/raid')) return { ok: false, status: 404, json: async () => ({ err: 'offline' }) };
        if (!options.method) return { ok: true, status: 200, json: async () => ({
          ok: true, enabled: true, account: { userId: id, entriesLeft: 1, riftShards: 0, chestsToday: {} },
          party: null, activeRun: live, activeRunError: '',
        }) };
        return { ok: true, status: 200, json: async () => ({ ok: true, run: live }) };
      };
      ww.eval(fs.readFileSync(path.join(ROOT, 'assets/rift-raid.js'), 'utf8'));
      return { id, w: ww, g };
    });
    // Every client reconnects directly into the active arena.
    for (const c of clients) await c.w.PGRaid.open();
    for (const c of clients) {
      assert.equal(c.w.document.querySelectorAll('.raid-zone').length, 3);
      assert.equal(c.w.document.querySelectorAll('.raid-pcard').length, 3);
      const you = c.w.document.querySelector('.raid-pcard.you');
      assert.ok(you && you.dataset.raidTarget === String(c.id), 'client ' + c.id + ' sees its own card as you');
      assert.match(c.w.document.getElementById('raidOverlay').textContent, /Rift Sovereign/);
    }
    const downed = clients.find(c => c.id === 9);
    assert.equal(downed.w.document.querySelector('[data-raid-action="strike"]').disabled, true, 'a downed player cannot act');
    assert.ok(downed.w.document.querySelector('.raid-unit.down'), 'a downed client shows its fallen sprite');
    // Leader drops, the others receive a lower-HP state, then the leader resumes the same run.
    clients[0].w.PGRaid.close();
    live = runFixture({ ...trio, hpRemaining: 390000000, hazard: { id: 'h9', kind: 'rift-sweep', dangerZones: ['left', 'center'], startsAt: Date.now(), endsAt: Date.now() + 1200 } });
    clients[1].w.PGRaid.receive(live);
    clients[2].w.PGRaid.receive(live);
    await new Promise(r => setTimeout(r, 0));
    for (const c of [clients[1], clients[2]]) assert.match(c.w.document.getElementById('raidOverlay').textContent, /390,000,000/);
    await clients[0].w.PGRaid.open();
    assert.match(clients[0].w.document.getElementById('raidOverlay').textContent, /390,000,000/);
    assert.equal(clients[0].w.document.querySelector('.raid-pcard.you').dataset.raidTarget, '7');
    for (const c of clients) c.g.close();
  });

  assert.ok(getCount >= 2 && postCount >= 1);
  game.close();
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})();
