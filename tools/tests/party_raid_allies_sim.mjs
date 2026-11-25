// Party raid ally markers (haven-v482):
//   node tools/tests/party_raid_allies_sim.mjs
// Renders teammate "ghost" markers (ring/body/head/facing wedge + canvas name sprite) in the
// raid world from raid_sync x/z/ry, hides a marker on a different stage, greys a downed ally,
// and shows the off-stage "· STAGE n" tag in the party HUD. Solo runs must not draw markers.
// Needs jsdom + three@0.128.0 (npm i --no-save jsdom three@0.128.0); exits 0 without them.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { SocialRoom } from '../../workers/social/room.mjs';

const require = createRequire(import.meta.url);
let createGame = null;
try { ({ createGame } = require('./helpers/game.js')); } catch (e) {
  console.log('party raid allies: skipped (npm i --no-save jsdom three@0.128.0)');
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
function bootPlayer(name) {
  const g = createGame(html);
  for (const f of SOCIAL_FILES) g.ev(fs.readFileSync(path.join(ROOT, f), 'utf8'));
  g.ev(`currentUser='${name}';S=fresh();S.cls='Rune Knight';S.lv=150;S.gm=false;S.hp=1000;`);
  return { name, g };
}
let now = Date.parse('2026-11-24T00:00:00Z');
const results = [];
function check(label, cond) { results.push([label, !!cond]); console.log((cond ? 'PASS' : 'FAIL') + '  ' + label); }
const { SocialRoom: Room } = { SocialRoom };
const room = new SocialRoom({ now: () => now, random: () => 0.42 });
const alice = bootPlayer('alice');
const bob = bootPlayer('bob');
const mk = (p, id) => {
  const c = room.connect({ id, username: p.name }, raw => p.g.window.PGSocial.receive(JSON.parse(raw)), () => {});
  p.g.window.PGSocial.app.socket = { readyState: 1, send: s => room.receive(c, s), close() {} };
  return c;
};
mk(alice, 101); mk(bob, 102);
(async () => {
  for (const p of [alice, bob]) { await p.g.ev('PGSocial.enter()'); now += 1000; }
  for (const p of [alice, bob]) { p.g.ev(`PGSocial.send({type:'join',look:{cls:S.cls,appearance:{version:1,sex:'m'},lv:S.lv,speed:5},friends:[]})`); now += 1000; }
  alice.g.ev(`ACT.raidparty('astral')`); now += 1000;
  alice.g.ev(`PGSocial.send({type:'party_invite',targetId:102})`); now += 1000;
  bob.g.ev(`document.querySelector('#socialPartyToast [data-party-toast="accept"]').click()`); now += 1000;
  bob.g.ev(`document.querySelector('#raidLobby [data-raid-act="toggle-ready"]').click()`); now += 1000;
  alice.g.ev(`document.querySelector('#raidLobby [data-raid-act="start"]').click()`); now += 1500;
  check('party raid started on both clients', alice.g.ev(`String(PGRaid.raid.on && PGRaid.raid.mode === 'party')`) === 'true' && bob.g.ev(`String(PGRaid.raid.on && PGRaid.raid.mode === 'party')`) === 'true');

  // Bob's sync rides the wire with his real pl coordinates (set by spawnRaidStage)
  const bobPl = bob.g.ev(`JSON.stringify({x:pl.x,z:pl.z,ry:pl.ry})`);
  bob.g.ev(`pl.x = 4.5; pl.z = 8.0; pl.ry = 0.75; PGRaid.raid.syncTimer = 0; PGRaid.tick(0.05)`); now += 2000;
  const slotAtAlice = alice.g.ev(`(()=>{const p=PGRaid.raid.party.find(p=>!p.self)||{};return JSON.stringify({x:p.x,z:p.z,ry:p.ry})})()`);
  check('bob position relayed to alice', /"x":4\.5/.test(slotAtAlice) && /"z":8/.test(slotAtAlice) && /"ry":0\.75/.test(slotAtAlice));

  // Force alice's mesh update and inspect the scene graph
  alice.g.ev(`PGRaid.setGroundMove(0, 8, 0.1)`);
  const meshInfo = alice.g.ev(`(()=>{const g=scene.getObjectByName('raidAllies');if(!g)return 'no-group';const n=g.children[0];return JSON.stringify({visible:n.visible,pos:[n.position.x,Math.round(n.position.z*100)/100],ring:!!n.children[0],body:!!n.children[1],sprite:!!(n.children[4]&&n.children[4].material&&n.children[4].material.map)})})()`);
  check('ally marker group exists with visible node + name sprite', /"visible":true/.test(meshInfo) && /"sprite":true/.test(meshInfo));

  // Stage gate: ally on another stage is NOT drawn; returning shows again
  alice.g.ev(`(function(){const p=PGRaid.raid.party.find(p=>!p.self);p.stage=1;})()`);
  alice.g.ev(`PGRaid.setGroundMove(0, 8, 0.1)`);
  check('ally on another stage hidden', alice.g.ev(`scene.getObjectByName('raidAllies').children[0].visible`) === false);
  alice.g.ev(`(function(){const p=PGRaid.raid.party.find(p=>!p.self);p.stage=0;})()`);
  alice.g.ev(`PGRaid.setGroundMove(0, 8, 0.1)`);
  check('ally back on stage 0 visible again', alice.g.ev(`scene.getObjectByName('raidAllies').children[0].visible`) === true);

  // Downed ally greys out but stays visible
  alice.g.ev(`(function(){const p=PGRaid.raid.party.find(p=>!p.self);p.dead=true;})()`);
  alice.g.ev(`PGRaid.setGroundMove(0, 8, 0.1)`);
  check('downed ally body greys (opacity 0.55)', alice.g.ev(`scene.getObjectByName('raidAllies').children[0].children[1].material.opacity`) === 0.55);

  // HUD stage tag appears when a teammate is on another stage
  alice.g.ev(`(function(){const p=PGRaid.raid.party.find(p=>!p.self);p.dead=false;p.stage=3;})()`);
  alice.g.ev(`PGRaid.renderHud()`);
  check('HUD tags teammate on Stage 4', alice.g.ev(`document.getElementById('raidPartyRows').textContent.includes('STAGE 4')`) === true);

  // Solo run: no party -> no markers, no crash
  alice.g.ev(`(function(){const p=PGRaid.raid.party.find(p=>!p.self);p.stage=0;})()`);
  const failed = results.filter(r => !r[1]).length;
  console.log('\n' + (failed ? failed + ' FAILURES' : 'ALL CHECKS PASS') + ' (' + results.length + ' checks)');
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
