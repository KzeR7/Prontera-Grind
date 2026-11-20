// Rift Raid client smoke (haven-v449 Astral dungeon).
//
// What this covers: the lobby renders entries/eligibility before readiness, a start adopts the
// server's run snapshot and hands it to the dungeon renderer, movement/focus are *intents* that go
// to the server and never carry a result, a refused intent does not flood the room, and the run
// panel survives an incoming update without being rebuilt.
//
// What it deliberately does not cover: the 3D dungeon itself (assets/raid-dungeon.js +
// assets/astral-raid-scenes.js). That file needs WebGL and is covered by the browser pass, not by
// jsdom; here PGRaidDungeon is a recorder so the contract between the panel and the renderer is
// still asserted.
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

// ---- the run snapshot the engine publishes (functions/_lib/raid-engine.js snapshot()) -------------
const now = Date.now();
function runFixture(overrides = {}) {
  return {
    id: 'raid:ui-1', state: 'active', partySize: 2, seed: 1234,
    stageIndex: 0, stageKey: 'approach', stageName: 'Starlit Approach',
    stageStartedAt: now - 8000, stageEndsAt: now + 44000, stageCleared: false,
    startedAt: now - 8000, deadlineAt: now + 400000, finishedAt: 0, settledAckAt: 0,
    serverNow: now, partyDps: 240000, bossArmor: 0.16,
    summary: { requiredAlive: 6, requiredTotal: 7, stageAlive: 6, stageTotal: 7, bossHp: 0, bossMaxHp: 0 },
    members: [
      { id: 7, name: 'Alpha', cls: 'Lord Knight', sex: 'm', magic: false, dps: 120000, x: 0, z: 8, hp: 90000, maxHp: 115272, downed: false, reviveProgress: 0 },
      { id: 8, name: 'Beta', cls: 'Warlock', sex: 'f', magic: true, dps: 120000, x: -1.4, z: 7.2, hp: 0, maxHp: 67242, downed: true, reviveProgress: 0.4 },
    ],
    enemies: [
      { id: 'a1-g1', kind: 'mob', name: 'Retribution Angel', spriteId: 1702, x: -6.4, z: -2, hp: 80000, maxHp: 120000, dead: false, required: true },
      { id: 'a1-g2', kind: 'mob', name: 'Retribution Angel', spriteId: 1702, x: 6.4, z: -2, hp: 120000, maxHp: 120000, dead: true, required: true },
    ],
    mechanics: [{ id: 'm1', kind: 'sweep', startsAt: now - 400, endsAt: now + 1600, resolvedAt: 0, x: 0, halfWidth: 3, length: 28, angle: 0 }],
    ...overrides,
  };
}

// A recorder standing in for the WebGL renderer: it keeps every call the panel makes so the
// contract (begin on a new stage, reconcile on every snapshot, hudUpdate, end when the run ends)
// is asserted without a canvas.
function installDungeonRecorder(w) {
  const calls = [];
  const state = { active: false, stageKey: '' };
  w.PGRaidDungeon = {
    get active() { return state.active; },
    get stageKey() { return state.stageKey; },
    begin(frameHost, runId, stageKey, myId) {
      calls.push({ fn: 'begin', host: !!frameHost, runId, stageKey, myId });
      state.active = true; state.stageKey = stageKey;
    },
    end() { calls.push({ fn: 'end' }); state.active = false; state.stageKey = ''; },
    attach() { return state.active; },
    detach() { return true; },
    tick() {},
    reconcile(run) { calls.push({ fn: 'reconcile', id: run && run.id }); },
    noteSnapshot(run) { calls.push({ fn: 'noteSnapshot', at: run && run.serverNow }); },
    hudUpdate(run) { calls.push({ fn: 'hudUpdate', stage: run && run.stageKey }); },
    bindInput() {},
    requestMove() {},
    requestFocus() {},
    serverNow() { return Date.now(); },
    stageSpawn() { return { x: 0, z: 8 }; },
    origin: -320,
    heroPos() { return { x: 0, z: 8 }; },
  };
  return { calls, state };
}

function account(overrides = {}) {
  return { userId: 7, entriesLeft: 2, riftShards: 15, qualifyingClears: 0, chestsToday: { pity: 0, fractured: 1 }, cards: [], ...overrides };
}

(async () => {
  console.log('player raid UI (v449): lobby, server-owned run, renderer handoff\n');

  const game = createGame();
  const w = game.window;
  const dungeon = installDungeonRecorder(w);
  let live = runFixture();
  let running = false;                 // the lobby is read before any run exists
  let getCount = 0, postCount = 0, lastAct = null;

  w.fetch = async (url, options = {}) => {
    if (!String(url).includes('/api/raid')) return { ok: false, status: 404, json: async () => ({ err: 'offline' }) };
    if (!options.method) {
      getCount++;
      return { ok: true, status: 200, json: async () => ({
        ok: true, enabled: true, account: account(),
        eligibility: { eligible: true }, party: null,
        activeRun: running && live.state === 'active' ? live : null, lastRun: null,
      }) };
    }
    postCount++;
    const body = JSON.parse(options.body || '{}');
    if (body.action === 'act') lastAct = body;
    if (body.action === 'start') {
      running = true;
      return { ok: true, status: 200, json: async () => ({ ok: true, runId: live.id, run: live }) };
    }
    if (body.action === 'act') return { ok: true, status: 200, json: async () => ({ ok: true, run: live }) };
    if (body.action === 'sync') return { ok: true, status: 200, json: async () => ({ ok: true, run: live }) };
    return { ok: true, status: 200, json: async () => ({ ok: true }) };
  };
  w.eval(fs.readFileSync(path.join(ROOT, 'assets/rift-raid.js'), 'utf8'));
  assert.ok(w.PGRaid, 'PGRaid is exported');

  await t('the lobby shows entries, eligibility and the four stages before readiness', async () => {
    await w.PGRaid.open();
    const overlay = w.document.getElementById('raidOverlay');
    assert.ok(overlay && !overlay.hidden, 'the overlay opens');
    const text = overlay.textContent;
    assert.match(text, /2 \/ 2 entries/);
    assert.match(text, /Solo raid/);
    assert.match(text, /Form \/ join party/);
    for (const stage of ['Starlit Approach', 'Fallen Arcade', 'Runic Observatory', "Thanatos's Sanctuary"]) {
      assert.match(text, new RegExp(stage.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), 'the lobby lists ' + stage);
    }
    assert.match(text, /Two or three adventurers/);
    w.PGRaid.close();
    assert.equal(overlay.hidden, true, 'closing hides the overlay');
  });

  await t('a solo start adopts the server run and hands the stage to the dungeon', async () => {
    await w.PGRaid.open();
    await w.PGRaid.refresh();
    w.document.querySelector('[data-raid-action="solo"]').click();
    await new Promise(r => setTimeout(r, 0));
    assert.equal(w.PGRaid.state.view, 'arena', 'the panel switches to the run view');
    const begin = dungeon.calls.find(c => c.fn === 'begin');
    assert.ok(begin, 'the renderer was told to begin');
    assert.equal(begin.stageKey, 'approach');
    assert.equal(begin.runId, 'raid:ui-1');
    assert.ok(dungeon.calls.some(c => c.fn === 'reconcile'), 'the first snapshot was reconciled');
    assert.ok(dungeon.calls.some(c => c.fn === 'hudUpdate'), 'the HUD was painted');
  });

  await t('the fight is the screen: the overlay steps aside while the run is live', async () => {
    const overlay = w.document.getElementById('raidOverlay');
    assert.equal(overlay.hidden, true, 'the panel is out of the way during the fight');
    assert.ok(w.document.body.classList.contains('raid-fighting'), 'field-only chrome is marked for hiding');
    // ... and the run view still owns the stage facts, which the Resume path re-shows.
    assert.equal(w.PGRaid.state.run.stageName, 'Starlit Approach');
    assert.equal(w.PGRaid.state.inRun, true);
  });

  await t('a move is an intent: destination only, receipted id, never a result', async () => {
    w.PGRaid.move(3.5, -4.25);
    await new Promise(r => setTimeout(r, 0));
    assert.ok(lastAct, 'a combat request was sent');
    assert.equal(lastAct.action, 'act');
    assert.equal(lastAct.combatAction, 'move');
    assert.equal(lastAct.runId, 'raid:ui-1');
    assert.equal(lastAct.x, 3.5);
    assert.equal(lastAct.z, -4.25);
    assert.match(lastAct.actionId, /^raid:/);
    assert.equal('damage' in lastAct, false, 'the client never sends damage');
  });

  await t('a focus is an intent too, and it is throttled by the server not the client', async () => {
    lastAct = null;
    w.PGRaid.focus('a1-g1');
    await new Promise(r => setTimeout(r, 0));
    assert.equal(lastAct.combatAction, 'focus');
    assert.equal(lastAct.targetId, 'a1-g1');
  });

  await t('a refused intent stays quiet instead of flooding the room', async () => {
    const realFetch = w.fetch;
    let moves = 0;
    w.fetch = async (url, options = {}) => {
      const body = options.body ? JSON.parse(options.body) : {};
      if (body.action === 'act' && body.combatAction === 'move') {
        moves++;
        return { ok: false, status: 429, json: async () => ({ ok: false, retry: true, err: 'You are already moving.' }) };
      }
      return realFetch(url, options);
    };
    w.PGRaid.state.lastMoveSentAt = 0;
    w.PGRaid.move(0, 0);
    await new Promise(r => setTimeout(r, 0));
    assert.equal(moves, 1, 'one refused move');
    assert.equal(w.document.querySelector('.raid-error'), null, 'a refused move is not shown to the player');
    w.fetch = realFetch;
  });

  await t('a stage transition rebuilds the layout once and announces it', async () => {
    const before = dungeon.calls.filter(c => c.fn === 'begin').length;
    live = runFixture({
      stageIndex: 1, stageKey: 'arcade', stageName: 'Fallen Arcade',
      summary: { requiredAlive: 7, requiredTotal: 9, stageAlive: 7, stageTotal: 9, bossHp: 0, bossMaxHp: 0 },
    });
    w.PGRaid.receive(live);
    await new Promise(r => setTimeout(r, 0));
    const begins = dungeon.calls.filter(c => c.fn === 'begin');
    assert.equal(begins.length, before + 1, 'the new stage is begun exactly once');
    assert.equal(begins[begins.length - 1].stageKey, 'arcade');
    const toast = w.document.getElementById('raidStageToast');
    assert.ok(toast && /Fallen Arcade/.test(toast.textContent), 'the stage is announced');
    assert.ok(dungeon.calls.filter(c => c.fn === 'reconcile').length >= 2, 'the snapshot keeps flowing');
  });

  await t('the panel is not rebuilt on every snapshot (it is repainted, not re-created)', async () => {
    // Resume the panel, remember the node, then deliver an update with only numbers changed.
    w.eval('PGRaid.open()');
    await new Promise(r => setTimeout(r, 0));
    const overlay = w.document.getElementById('raidOverlay');
    const before = w.document.getElementById('raidRunClock');
    assert.ok(before, 'the run panel is back on screen');
    live = { ...live, stageEndsAt: live.stageEndsAt - 1000, members: [{ ...live.members[0], hp: 70000 }, live.members[1]] };
    w.PGRaid.receive(live);
    await new Promise(r => setTimeout(r, 0));
    assert.equal(w.document.getElementById('raidRunClock'), before, 'the clock node survived the update');
    assert.equal(w.document.querySelectorAll('.raid-pcard').length, 2, 'both party cards are still there');
    assert.ok(overlay, 'the overlay still exists');
  });

  await t('a downed teammate offers a revive; the request carries the target and an id', async () => {
    lastAct = null;
    w.PGRaid.revive();
    await new Promise(r => setTimeout(r, 0));
    assert.ok(lastAct, 'a revive was sent');
    assert.equal(lastAct.combatAction, 'revive');
    assert.equal(lastAct.targetId, 8, 'the downed member is the target');
    assert.match(lastAct.actionId, /^raid:/);
  });

  await t('the portal is one interaction, and it is only offered when the stage is cleared', async () => {
    live = { ...live, stageCleared: false };
    w.PGRaid.receive(live);
    await new Promise(r => setTimeout(r, 0));
    assert.equal(w.document.querySelector('[data-raid-action="portal"]'), null, 'no portal before the stage is clear');
    live = { ...live, stageCleared: true };
    w.PGRaid.receive(live);
    await new Promise(r => setTimeout(r, 0));
    assert.ok(w.document.querySelector('[data-raid-action="portal"]'), 'the portal appears once cleared');
    lastAct = null;
    w.PGRaid.portal();
    await new Promise(r => setTimeout(r, 0));
    assert.equal(lastAct.combatAction, 'interact');
    assert.equal(lastAct.targetId, 'portal');
  });

  await t('a run that ends closes the dungeon, returns the field and settles once', async () => {
    let settles = 0;
    const realFetch = w.fetch;
    w.fetch = async (url, options = {}) => {
      const body = options.body ? JSON.parse(options.body) : {};
      if (body.action === 'settle') {
        settles++;
        return { ok: true, status: 200, json: async () => ({ ok: true, outcome: 'failed', settledAt: Date.now(), acknowledged: true,
          rewards: [{ kind: 'pity', riftShards: 2, zeny: 250000 }] }) };
      }
      return realFetch(url, options);
    };
    live = { ...live, state: 'failed', finishedAt: Date.now(), summary: { ...live.summary, requiredAlive: 3 } };
    w.PGRaid.receive(live);
    await new Promise(r => setTimeout(r, 10));
    assert.ok(dungeon.calls.some(c => c.fn === 'end'), 'the renderer was told to end');
    assert.equal(w.PGRaid.state.inRun, false);
    assert.equal(w.document.body.classList.contains('raid-fighting'), false, 'field chrome is back');
    assert.equal(settles, 1, 'the result was settled exactly once');
    assert.match(w.document.getElementById('raidOverlay').textContent, /Rift shards/i);
    w.fetch = realFetch;
  });

  await t('three clients render the same run, each keeping its own "you"', async () => {
    const trio = runFixture({
      partySize: 3,
      summary: { requiredAlive: 7, requiredTotal: 9, stageAlive: 7, stageTotal: 9, bossHp: 0, bossMaxHp: 0 },
      members: [
        { id: 7, name: 'Alpha', cls: 'Lord Knight', sex: 'm', magic: false, dps: 120000, x: 0, z: 8, hp: 100000, maxHp: 115272, downed: false, reviveProgress: 0 },
        { id: 8, name: 'Beta', cls: 'Warlock', sex: 'f', magic: true, dps: 120000, x: -1.4, z: 7.2, hp: 50000, maxHp: 67242, downed: false, reviveProgress: 0 },
        { id: 9, name: 'Gamma', cls: 'Priest', sex: 'f', magic: true, dps: 120000, x: 1.4, z: 7.2, hp: 0, maxHp: 80000, downed: true, reviveProgress: 0.2 },
      ],
    });
    const clients = [7, 8, 9].map(id => {
      const g = createGame();
      const ww = g.window;
      const d = installDungeonRecorder(ww);
      ww.fetch = async (url, options = {}) => {
        if (!String(url).includes('/api/raid')) return { ok: false, status: 404, json: async () => ({ err: 'offline' }) };
        if (!options.method) return { ok: true, status: 200, json: async () => ({
          ok: true, enabled: true, account: account({ userId: id, entriesLeft: 1 }), eligibility: { eligible: true },
          party: null, activeRun: trio, activeRunError: '', lastRun: null,
        }) };
        return { ok: true, status: 200, json: async () => ({ ok: true, run: trio }) };
      };
      ww.eval(fs.readFileSync(path.join(ROOT, 'assets/rift-raid.js'), 'utf8'));
      return { id, w: ww, g, d };
    });
    for (const c of clients) await c.w.PGRaid.open();
    for (const c of clients) {
      const begin = c.d.calls.find(x => x.fn === 'begin');
      assert.ok(begin, 'client ' + c.id + ' began the dungeon');
      assert.equal(begin.myId, c.id, 'client ' + c.id + ' is the local player');
      const you = c.w.document.querySelector('.raid-pcard.you');
      assert.ok(you, 'client ' + c.id + ' has a "you" card');
      assert.equal(c.w.document.querySelectorAll('.raid-pcard').length, 3, 'all three members are listed');
    }
    // A downed client cannot rescue anyone (and cannot be rescued by itself); a living client sees
    // the revive action for the fallen teammate.
    const downed = clients.find(c => c.id === 9);
    const living = clients.find(c => c.id === 7);
    assert.equal(downed.w.document.querySelector('[data-raid-action="revive"]'), null, 'a downed member is not offered a revive');
    clients[2].w.PGRaid.close();
    await living.w.PGRaid.open();
    assert.ok(living.w.document.querySelector('[data-raid-action="revive"]'), 'a living member is offered the revive');
    for (const c of clients) c.g.close();
  });

  await t('the renderer owns the clock: the panel reads the same server time', async () => {
    const source = fs.readFileSync(path.join(ROOT, 'assets/rift-raid.js'), 'utf8');
    assert.match(source, /PGRaidDungeon\.serverNow|rd\.serverNow/, 'the panel borrows the renderer clock');
    assert.match(source, /noteSnapshot/, 'snapshots are handed to the clock');
    assert.ok(!/raidTotalHp|phaseHps|phaseNames|raidPhaseHp/.test(source), 'no v448 phase model left in the client');
    assert.ok(!/combatAction: 'strike'|combatAction: 'dodge'|combatAction: 'ward'/.test(source), 'no v448 lane combat left in the client');
  });

  await t('the 3D renderer is the game\'s scene: no second canvas, no second renderer', async () => {
    const panel = fs.readFileSync(path.join(ROOT, 'assets/rift-raid.js'), 'utf8');
    const dungeonSrc = fs.readFileSync(path.join(ROOT, 'assets/raid-dungeon.js'), 'utf8');
    const scenery = fs.readFileSync(path.join(ROOT, 'assets/astral-raid-scenes.js'), 'utf8');
    assert.ok(!/WebGLRenderer|createRenderer/.test(panel), 'the panel adds no renderer');
    assert.ok(!/new THREE\.WebGLRenderer/.test(dungeonSrc), 'the dungeon adds no renderer');
    assert.match(dungeonSrc, /hookScene\(\)/, 'the dungeon draws in the host scene');
    for (const key of ['approach', 'arcade', 'observatory', 'sanctuary']) {
      assert.ok(new RegExp(key).test(scenery), 'a layout exists for ' + key);
    }
    assert.match(scenery, /STAGE_BOUNDS|BOUNDS/, 'the layouts mirror the engine bounds');
    // The engine and the client agree on the playable rectangles.
    const rules = fs.readFileSync(path.join(ROOT, 'functions/_lib/raid-engine.js'), 'utf8');
    for (const [key, rect] of [['approach', '10.5'], ['arcade', '12'], ['sanctuary', '14']]) {
      assert.ok(scenery.includes(rect), 'client bounds carry ' + key);
      assert.ok(rules.includes(rect), 'engine bounds carry ' + key);
    }
  });

  await t('Rift Raid rewards apply directly and never appear as an expiring mailbox gift', async () => {
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
    installDungeonRecorder(ww);
    let settleCalls = 0;
    ww.fetch = async (url, options = {}) => {
      if (!String(url).includes('/api/raid')) return { ok: false, status: 404, json: async () => ({ err: 'offline' }) };
      if (!options.method) return { ok: true, status: 200, json: async () => ({
        ok: true, enabled: true, account: account(), eligibility: { eligible: true },
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
    installDungeonRecorder(ww);
    ww.fetch = async (url, options = {}) => {
      if (!String(url).includes('/api/raid')) return { ok: false, status: 404, json: async () => ({ err: 'offline' }) };
      if (!options.method) return { ok: true, status: 200, json: async () => ({
        ok: true, enabled: true,
        account: account({ entriesLeft: 1, riftShards: 40, cards: [] }),
        eligibility: { eligible: true }, party: null, activeRun: null, lastRun: null,
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
    installDungeonRecorder(ww);
    let equipped = '';
    const cardAccount = () => account({
      entriesLeft: 1, riftShards: 10, qualifyingClears: 3,
      cards: [
        { key: 'sovereign-fang', name: 'Sovereign Fang', desc: '+3% DPS per rank.', copies: 3, rank: 2, equipped: equipped === 'sovereign-fang' },
        { key: 'astral-bulwark', name: 'Astral Bulwark', desc: '+5% max HP per rank.', copies: 0, rank: 0, equipped: false },
        { key: 'herald-vow', name: 'Herald Vow', desc: '+4% max HP per rank.', copies: 1, rank: 1, equipped: false },
      ],
      equippedCard: equipped,
    });
    ww.fetch = async (url, options = {}) => {
      if (!String(url).includes('/api/raid')) return { ok: false, status: 404, json: async () => ({ err: 'offline' }) };
      if (!options.method) return { ok: true, status: 200, json: async () => ({ ok: true, enabled: true, account: cardAccount(), eligibility: { eligible: true }, party: null, activeRun: null, lastRun: null }) };
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

  await t('the map and Social Hub both open the same lobby, and the Map tab describes the dungeon', () => {
    const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
    assert.match(html, /\['raid','Rift Raid'\]/);
    assert.match(html, /PGRaid\.open\(\)/);
    assert.ok((html.match(/PGRaid\.open\(\)/g) || []).length >= 2);
    assert.match(html, /assets\/rift-raid\.js/);
    assert.match(html, /assets\/raid-dungeon\.js/, 'the dungeon renderer is shipped');
    assert.match(html, /assets\/astral-raid-scenes\.js/, 'the four layouts are shipped');
    const panel = w.eval("mapSeason='raid';V.map()");
    assert.match(panel, /raid-destination/);
    assert.match(panel, /PGRaid\.open\(\)/);
    assert.match(panel, /Two entries per Malaysia day/);
    assert.match(panel, /ASTRAL DUNGEON/, 'the Map tab names the four-stage dungeon, not the old lane arena');
    assert.match(panel, /Thanatos/);
    assert.ok(!/volcanic rift arena|step out of the marked lane/i.test(panel), 'no v448 lane-arena copy survives');
    w.eval("mapSeason='atlas'");
  });

  assert.ok(getCount >= 2 && postCount >= 1);
  game.close();
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})();
