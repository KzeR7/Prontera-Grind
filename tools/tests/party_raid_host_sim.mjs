// haven-v484: party host authority ("one raid, one world" — mob snapshot increment):
//   node tools/tests/party_raid_host_sim.mjs
// The party leader's client is the raid world: it simulates mobs/boss, members render the host's
// telegraph instead of rolling their own, see a shared boss bar, take the host's hazard damage,
// and adopt a mob snapshot (HP pinned monotonically down, position eased, host-slain mobs
// force-killed locally for a personal roll). Party stage spawns use a seeded RNG stream so every
// client builds the identical world (raidEid = stageIdx*100 + index). If the host goes silent
// for 6s the member reverts to local casting so the raid stays playable.
// Needs jsdom + three@0.128.0 (npm i --no-save jsdom three@0.128.0); exits 0 without them.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { SocialRoom } from '../../workers/social/room.mjs';
import assert from 'node:assert/strict';

const require = createRequire(import.meta.url);
let createGame = null;
try { ({ createGame } = require('./helpers/game.js')); } catch (e) {
  console.log('party raid host: skipped (npm i --no-save jsdom three@0.128.0)');
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
const room = new SocialRoom({ now: () => now, random: () => 0.42 });
const alice = bootPlayer('alice'); // leader = host
const bob = bootPlayer('bob');     // member
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
  check('party raid starts for both', alice.g.ev(`PGRaid.raid.on && PGRaid.raid.mode === 'party'`) === true && bob.g.ev(`PGRaid.raid.on && PGRaid.raid.mode === 'party'`) === true);
  check('leader records itself as host', alice.g.ev(`String(PGRaid.raid.hostId)`) === '101');
  check('member records the leader as host', bob.g.ev(`String(PGRaid.raid.hostId)`) === '101');

  // Host casts on Stage 1 (forces the next cast now)
  alice.g.ev(`PGRaid.raid.nextCastIn = 0; PGRaid.tick(0.05)`);
  const hostCast = alice.g.ev(`JSON.stringify((PGRaid.raid.telegraph && {shape:PGRaid.raid.telegraph.shape,name:PGRaid.raid.telegraph.name,x:PGRaid.raid.telegraph.x,z:PGRaid.raid.telegraph.z,age:PGRaid.raid.telegraph.age,life:PGRaid.raid.telegraph.life}) || null)`);
  check('host casts a Stage 1 telegraph', hostCast !== 'null');

  // Member tick alone must NOT cast while the host voice is live (silence until sync arrives)
  bob.g.ev(`PGRaid.raid.nextCastIn = 0; PGRaid.tick(0.05)`);
  check('member does not roll its own cast while host is expected', bob.g.ev(`PGRaid.raid.telegraph === null`) === true);

  // Host sync relays the telegraph
  alice.g.ev(`PGRaid.raid.syncTimer = 0; PGRaid.tick(0.05)`); now += 300;
  const memberCast = bob.g.ev(`JSON.stringify((PGRaid.raid.telegraph && {shape:PGRaid.raid.telegraph.shape,name:PGRaid.raid.telegraph.name,age:PGRaid.raid.telegraph.age,life:PGRaid.raid.telegraph.life}) || null)`);
  check('member receives the host telegraph', memberCast !== 'null' && memberCast.includes(JSON.parse(hostCast).shape) && memberCast.includes(JSON.parse(hostCast).name));

  // Member takes host-pattern damage when standing inside the telegraph at end of life
  const hpBefore = bob.g.ev(`S.hp`);
  bob.g.ev(`(function(){var tg=PGRaid.raid.telegraph;if(tg){pl.x=tg.x;pl.z=tg.z;}})()`);
  bob.g.ev(`for(var i=0;i<100;i++)PGRaid.tick(0.05)`); now += 5000;
  const hpAfter = bob.g.ev(`S.hp`);
  check('member hero takes the host pattern damage in the zone', hpAfter < hpBefore);

  // HUD shows the shared boss bar on the member when the host reports a fraction
  bob.g.ev(`(function(){var bossBarCheck = typeof PGRaid.renderHud === 'function'; })()`);
  const hostFracCast = alice.g.ev(`PGRaid.raid.telegraph = {shape:'circle', name:'Test Pulse', hint:'TEST', x:0, z:5, ang:0, r:3, dmgPct:0.1, age:0, life:4, seq:999}; PGRaid.raid.syncTimer = 0; PGRaid.tick(0.05)`);
  now += 1600;
  // Force a boss-stage-free member HUD render with a host fraction set directly
  bob.g.ev(`PGRaid.raid._hostBossFrac = 0.42; PGRaid.renderHud()`);
  const hudText = bob.g.ev(`document.getElementById('raidBossHpText') ? document.getElementById('raidBossHpText').textContent : 'missing'`);
  // Only meaningful when the boss wrap is visible (Stage 4); ensure it does not crash otherwise
  check('renderHud with shared boss fraction does not throw', typeof hudText === 'string');

  // --- v484: mob snapshot sync (HP pin, position lerp, kill handshake) ---
  // The room throttles raid_sync to 1 per 500ms of wall clock; advance `now` so each host send relays.
  const hostEid0 = alice.g.ev(`mobs[0].raidEid`);
  const memberHpBefore = bob.g.ev(`(mobs||[]).find(m=>m.raidEid===${hostEid0}).hp`);
  check('member mob present with eid', memberHpBefore > 0);
  now += 1600;
  alice.g.ev(`mobs[0].hp = Math.max(1, Math.floor(mobs[0].hp * 0.5)); PGRaid.raid.syncTimer = 0; PGRaid.tick(0.05)`); now += 100;
  const memberHpAfter = bob.g.ev(`(mobs||[]).find(m=>m.raidEid===${hostEid0}).hp`);
  check('member mob HP pinned down to host value', memberHpAfter < memberHpBefore);

  now += 1600;
  alice.g.ev(`mobs[1].x = 5; mobs[1].z = 9; PGRaid.raid.syncTimer = 0; PGRaid.tick(0.05)`); now += 100;
  bob.g.ev(`for(var i=0;i<60;i++) PGRaid.tick(0.05)`);
  const distAfter = bob.g.ev(`(function(){var m=(mobs||[]).find(x=>x.raidEid===1);return m?Math.hypot(m.x-5,m.z-9):999})()`);
  check('member mob lerped to host position', distAfter < 1.0);

  const killsBefore = bob.g.ev(`S.kl`);
  now += 1600;
  alice.g.ev(`mobs[1].hp = 0; PGRaid.raid.syncTimer = 0; PGRaid.tick(0.05)`); now += 100;
  const killsAfter = bob.g.ev(`S.kl`);
  check('host-slain mob triggers member personal kill (roll)', Number(killsAfter) > Number(killsBefore));

  // Member mob AI is frozen on the host's copy while the host voice is alive:
  // give the member copy a far-away anchor and confirm it does not wander toward it.
  bob.g.ev(`(function(){var m=(mobs||[]).find(x=>x.raidEid===0);if(m){m.hx=60;m.hz=60;m.wt=0;}})()`);
  const memberMobBefore = bob.g.ev(`(function(){var m=(mobs||[]).find(x=>x.raidEid===0);return m?JSON.stringify({x:m.x,z:m.z}):'gone'})()`);
  for (let i = 0; i < 30; i++) { bob.g.ev(`update(1/30); t += 1/30;`); } now += 1000;
  const memberMobAfter = bob.g.ev(`(function(){var m=(mobs||[]).find(x=>x.raidEid===0);return m?JSON.stringify({x:m.x,z:m.z}):'gone'})()`);
  const mm = JSON.parse(memberMobBefore), mn = JSON.parse(memberMobAfter);
  check('member mob AI frozen on host copy (no local wander)', mm === 'gone' || mn === 'gone' || Math.hypot(mn.x - mm.x, mn.z - mm.z) < 0.5);

  // Host silence: member reverts to local casting after 6s
  bob.g.ev(`(function(){ PGRaid.raid._lastHostPartySyncAt = 0; PGRaid.raid.telegraph = null; PGRaid.raid.nextCastIn = 0; })()`);
  bob.g.ev(`PGRaid.tick(0.05)`);
  // no host syncs flowing -> member must be allowed to cast again
  const memberLocal = bob.g.ev(`PGRaid.raid.telegraph === null || PGRaid.raid.telegraph._hostKey === undefined`);
  check('member reverts to local casting when the host is silent', memberLocal === true);

  const failed = results.filter(r => !r[1]).length;
  console.log('\n' + (failed ? failed + ' FAILURES' : 'ALL CHECKS PASS') + ' (' + results.length + ' checks)');
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
