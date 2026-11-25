// haven-v487: the member's local mob drain must NOT advance the stage (v486 authority gate).
//   node tools/tests/party_raid_local_gate_sim.mjs
// Scenario: a party raid starts; on the MEMBER — and only on the member — the world is
// emptied by hand (all local copies destroyed, e.g. DoT spreads) while the host keeps fighting.
// The member then ticks WITHOUT any host message: the v486 gate must keep the member on the
// same stage with an empty world and a live raid — no re-seat, no finish, no broadcast. The
// member's world must come back ONLY through the host's next stage sync.
// Needs jsdom + three@0.128.0 (npm i --no-save jsdom three@0.128.0 ws).
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { SocialRoom } from '../../workers/social/room.mjs';

const require = createRequire(import.meta.url);
let createGame = null;
try { ({ createGame } = require('./helpers/game.js')); } catch (e) {
  console.log('party raid local gate: skipped (npm i --no-save jsdom three@0.128.0)');
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
const TICK = 1 / 30;

const room = new SocialRoom({ now: () => now, random: () => 0.42 });
const a = boot('alice');
const b = boot('bob');
const IDS = { a: 1010, b: 1020 };
const clients = {};
for (const [k, name] of [['a', 'alice'], ['b', 'bob']]) {
  const g = k === 'a' ? a : b;
  const c = room.connect({ id: IDS[k], username: name }, raw => g.window.PGSocial.receive(JSON.parse(raw)), () => {});
  g.window.PGSocial.app.socket = { readyState: 1, send: s => room.receive(c, s), close() {} };
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
  check('gate: raid starts for both', a.ev(`PGRaid.raid.on && PGRaid.raid.mode === 'party'`) === true && b.ev(`PGRaid.raid.on && PGRaid.raid.mode === 'party'`) === true);
  check('gate: byte-identical stage-1 world', a.ev(`JSON.stringify(mobs.map(m=>[m.raidEid,m.hp]))`) === b.ev(`JSON.stringify(mobs.map(m=>[m.raidEid,m.hp]))`));

  // The member's world dies alone (e.g. DoTs converted every local copy). No host message is involved.
  b.ev(`mobs.forEach(m => { m.hp = 0; }); mobs = []; mob = null; if (typeof save === 'function') save();`);
  check('gate: member world emptied by hand', b.ev(`mobs.length`) === 0);
  for (let j = 0; j < 120; j++) { b.ev(`PGRaid.tick(0.05)`); now += 50; }
  check('gate: member raid still on after 6 s of an empty world', b.ev(`PGRaid.raid.on === true`) === true);
  check('gate: member did NOT advance locally (stage still 0)', b.ev(`PGRaid.raid.stage`) === 0);
  check('gate: member world stayed empty (no self re-seat)', b.ev(`mobs.length`) === 0);
  check('gate: member did NOT finish the raid (no broadcast to host)', a.ev(`PGRaid.raid.on === true && !PGRaid.raid.result`) === true);

  // The host clears its stage; only then does the member's world come back.
  a.ev(`for (var i = mobs.length - 1; i >= 0; i--) { var m = mobs[i]; m.hp = 0; kill(m); }`);
  for (let j = 0; j < 40; j++) { a.ev(`for (var k = 0; k < 15; k++) update(${TICK})`); now += 500; }
  for (const g of [a, b]) { g.ev(`for (var k = 0; k < 40; k++) PGRaid.tick(0.05)`); NEUTRALIZE(g); }
  check('gate: host advanced to stage 1', a.ev(`PGRaid.raid.stage`) === 1);
  check('gate: member ratcheted to stage 1 via the host sync (not locally)', b.ev(`PGRaid.raid.stage`) === 1);
  check('gate: member re-seated an identical world from the host', a.ev(`JSON.stringify(mobs.map(m=>[m.raidEid,m.hp]))`) === b.ev(`JSON.stringify(mobs.map(m=>[m.raidEid,m.hp]))`));

  const ok = results.every(r => r[1]);
  console.log(ok ? `\nALL CHECKS PASS (${results.length} checks)` : `\n${results.filter(r => !r[1]).length} FAILURES (${results.length} checks)`);
  process.exit(ok ? 0 : 1);
})().catch(e => { console.error('gate sim crashed:', e); process.exit(1); });
