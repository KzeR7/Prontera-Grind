// haven-v488: forced-relay-floor backstop — the pre-wipe sweep sync is NOT guaranteed to land.
//   node tools/tests/party_raid_sweep_floor_sim.mjs
// The room drops a forced raid_sync within 250 ms of a previous forced sync from the same client.
// Bodies a member still holds after the host clears a stage are wiped on the host's world either
// way; this sim drops EVERY forced sync from the host (the floor made maximally hostile) and
// proves the member still rolls personal kills via the onSync ratchet backstop (stages 1-3) and
// the onEnded backstop (boss), and the worlds still re-seat byte-identically.
// Needs jsdom + three@0.128.0 (npm i --no-save jsdom three@0.128.0).
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { SocialRoom } from '../../workers/social/room.mjs';

const require = createRequire(import.meta.url);
let createGame = null;
try { ({ createGame } = require('./helpers/game.js')); } catch (e) {
  console.log('party raid sweep floor: skipped (npm i --no-save jsdom three@0.128.0)');
  process.exit(0);
}
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const SOCIAL_FILES = [
  'assets/digimon/roster.js', 'assets/digimon/base-stats.js', 'assets/social-rules.js',
  'assets/social-poker.js', 'assets/digimon-sanctuary.js', 'assets/digimon-battle.js',
  'assets/social-digimon.js', 'assets/social-gym-redesign.js', 'assets/social-pond-design.js',
  'assets/social-title-art.js', 'assets/social-scene.js', 'assets/social-fishing.js',
  'assets/plaza-bots.js', 'assets/adventure-guide.js', 'assets/social.js', 'assets/raid.js',
];
let now = Date.parse('2026-11-24T00:00:00Z');
const results = [];
const check = (label, cond) => { results.push([label, !!cond]); console.log((cond ? 'PASS' : 'FAIL') + '  ' + label); };
const boot = name => {
  const g = createGame(html);
  for (const f of SOCIAL_FILES) g.ev(fs.readFileSync(path.join(ROOT, f), 'utf8'));
  g.ev(`currentUser='${name}';S=fresh();S.cls='Rune Knight';S.lv=150;S.gm=false;S.hp=1e9;`);
  return g;
};
const NEUTRALIZE = g => g.ev(`mobs.forEach(m => { m.provokeUntil = 0; m.atk = 0; }); if (typeof PGRaid !== 'undefined' && PGRaid.raid) PGRaid.raid.iframes = 1e9; activePack = 999;`);
const WORLD = g => g.ev(`JSON.stringify((mobs||[]).map(m => [m.raidEid, m.hp]))`);
const TICK = 1 / 30;

const room = new SocialRoom({ now: () => now, random: () => 0.42 });
const a = boot('alice');
const b = boot('bob');
const IDS = { a: 1010, b: 1020 };
const clients = {};
for (const [k, name] of [['a', 'alice'], ['b', 'bob']]) {
  const g = k === 'a' ? a : b;
  const c = room.connect({ id: IDS[k], username: name }, raw => g.window.PGSocial.receive(JSON.parse(raw)), () => {});
  g.window.PGSocial.app.socket = {
    readyState: 1,
    send: s => { const m = JSON.parse(s); if (k === 'a' && m.type === 'raid_sync' && m.force === true) return; /* room relay floor made total: host's forced syncs never leave */ room.receive(c, s); },
    close() {},
  };
  clients[k] = c;
}

(async () => {
  for (const g of [a, b]) { await g.ev('PGSocial.enter()'); now += 1000; }
  for (const g of [a, b]) { g.ev(`PGSocial.send({type:'join',look:{cls:S.cls,appearance:{version:1,sex:'m'},lv:S.lv,speed:5},friends:[]})`); now += 1000; }
  a.ev(`ACT.raidparty('astral')`); now += 1000;
  a.ev(`PGSocial.send({type:'party_invite',targetId:${IDS.b}})`); now += 1000;
  b.ev(`document.querySelector('#socialPartyToast [data-party-toast="accept"]').click()`); now += 1000;
  b.ev(`document.querySelector('#raidLobby [data-raid-act="toggle-ready"]').click()`); now += 1000;
  a.ev(`document.querySelector('#raidLobby [data-raid-act="start"]').click()`); now += 1600;
  for (const g of [a, b]) NEUTRALIZE(g);
  check('floor: raid starts for both', a.ev(`PGRaid.raid.on && PGRaid.raid.mode === 'party'`) === true && b.ev(`PGRaid.raid.on && PGRaid.raid.mode === 'party'`) === true);

  const numStages = 4;
  for (let stageNo = 1; stageNo <= numStages; stageNo++) {
    const killsBefore = Number(b.ev(`S.kl`));
    a.ev(`for (var i = mobs.length - 1; i >= 0; i--) { var m = mobs[i]; m.hp = 0; kill(m); }`);
    for (let j = 0; j < 40; j++) { a.ev(`for (var k = 0; k < 15; k++) update(${TICK})`); now += 500; }
    for (const g of [a, b]) { g.ev(`for (var k = 0; k < 40; k++) PGRaid.tick(0.05)`); NEUTRALIZE(g); }
    const hostStage = Number(a.ev(`PGRaid.raid.stage`));
    const memberStage = Number(b.ev(`PGRaid.raid.stage`));
    const killsDelta = Number(b.ev(`S.kl`)) - killsBefore;
    if (stageNo < numStages) {
      check(`floor: stage ${stageNo} — member ratchets to stage ${stageNo} via host sync (forced syncs were dropped)`, hostStage === stageNo && memberStage === stageNo);
      check(`floor: stage ${stageNo} — member still rolls personal kills via the backstop (+${killsDelta})`, killsDelta > 0);
      check(`floor: stage ${stageNo} — member re-seated with an identical world`, WORLD(a) === WORLD(b));
    } else {
      check(`floor: boss — host finishes cleared`, a.ev(`!PGRaid.raid.on && !!PGRaid.raid.result && PGRaid.raid.result.cleared === true`) === true);
      check(`floor: boss — member finishes cleared via the party broadcast`, b.ev(`!PGRaid.raid.on && !!PGRaid.raid.result && PGRaid.raid.result.cleared === true`) === true);
      check(`floor: boss — member rolled the boss-stage kills via the onEnded backstop (+${killsDelta})`, killsDelta > 0);
    }
  }
  console.log(`  member personal kills total: ${b.ev(`S.kl`)}`);
  const ok = results.every(r => r[1]);
  console.log(ok ? `\nALL CHECKS PASS (${results.length} checks)` : `\n${results.filter(r => !r[1]).length} FAILURES (${results.length} checks)`);
  process.exit(ok ? 0 : 1);
})().catch(e => { console.error('sweep floor sim crashed:', e); process.exit(1); });
