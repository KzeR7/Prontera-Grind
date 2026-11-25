// Party raid end-to-end regression: leader & member both spawn, position sync flows
// BOTH directions, stage advances track each other, and a peer on a later stage pulls the
// local client forward (raid_sync stage is a one-way ratchet, never backwards).
import fs from 'node:fs'; import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);
const ROOT = process.cwd();
const { createGame } = require(ROOT + '/tools/tests/helpers/game.js');
const SOCIAL_FILES = [
  'assets/digimon/roster.js', 'assets/digimon/base-stats.js', 'assets/social-rules.js',
  'assets/social-poker.js', 'assets/digimon-sanctuary.js', 'assets/digimon-battle.js',
  'assets/social-digimon.js', 'assets/social-gym-redesign.js', 'assets/social-pond-design.js',
  'assets/social-title-art.js', 'assets/social-scene.js', 'assets/social-fishing.js',
  'assets/plaza-bots.js', 'assets/adventure-guide.js', 'assets/social.js', 'assets/raid.js',
];
function bootPlayer(name) {
  const g = createGame(fs.readFileSync(ROOT + '/index.html', 'utf8'));
  for (const f of SOCIAL_FILES) g.ev(fs.readFileSync(ROOT + '/' + f, 'utf8'));
  g.ev(`currentUser='${name}';S=fresh();S.cls='Rune Knight';S.lv=150;S.gm=false;S.hp=1000;`);
  return { name, g };
}
let now = Date.parse('2026-11-24T00:00:00Z');
const results = [];
function check(label, cond) { results.push([label, !!cond]); console.log((cond ? 'PASS' : 'FAIL') + '  ' + label); }
(async () => {
  const { SocialRoom } = await import(ROOT + '/workers/social/room.mjs');
  const room = new SocialRoom({ now: () => now, random: () => 0.42 });
  const alice = bootPlayer('alice'); // leader
  const bob = bootPlayer('bob');     // member
  const mk = (p, id) => {
    const c = room.connect({ id, username: p.name }, raw => p.g.window.PGSocial.receive(JSON.parse(raw)), () => {});
    p.g.window.PGSocial.app.socket = { readyState: 1, send: s => room.receive(c, s), close() {} };
    return c;
  };
  mk(alice, 101); mk(bob, 102);
  for (const p of [alice, bob]) { await p.g.ev('PGSocial.enter()'); now += 1000; }
  for (const p of [alice, bob]) { p.g.ev(`PGSocial.send({type:'join',look:{cls:S.cls,appearance:{version:1,sex:'m'},lv:S.lv,speed:5},friends:[]})`); now += 1000; }
  alice.g.ev(`ACT.raidparty('astral')`); now += 1000;
  alice.g.ev(`PGSocial.send({type:'party_invite',targetId:102})`); now += 1000;
  bob.g.ev(`document.querySelector('#socialPartyToast [data-party-toast="accept"]').click()`); now += 1000;
  bob.g.ev(`document.querySelector('#raidLobby [data-raid-act="toggle-ready"]').click()`); now += 1000;
  alice.g.ev(`document.querySelector('#raidLobby [data-raid-act="start"]').click()`); now += 1500;
  check('party raid starts on leader and member', alice.g.ev(`PGRaid.raid.on && PGRaid.raid.mode === 'party'`) === true && bob.g.ev(`PGRaid.raid.on && PGRaid.raid.mode === 'party'`) === true);
  check('both spawn on Stage 1', alice.g.ev('String(PGRaid.raid.stage)') === '0' && bob.g.ev('String(PGRaid.raid.stage)') === '0');
  // Position sync flows BOTH ways.
  alice.g.ev(`pl.x = -3.25; pl.z = 6.75; pl.ry = 1.1; PGRaid.raid.syncTimer = 0; PGRaid.tick(0.05)`); now += 2000;
  const bobSees = bob.g.ev(`JSON.stringify((PGRaid.raid.party.find(p=>!p.self)||{}))`);
  check('leader position reaches member', /"x":-3.25/.test(bobSees) && /"z":6.75/.test(bobSees));
  bob.g.ev(`pl.x = 2.5; pl.z = 9.5; pl.ry = -0.5; PGRaid.raid.syncTimer = 0; PGRaid.tick(0.05)`); now += 2000;
  const aliceSees = alice.g.ev(`JSON.stringify((PGRaid.raid.party.find(p=>!p.self)||{}))`);
  check('member position reaches leader', /"x":2.5/.test(aliceSees) && /"z":9.5/.test(aliceSees));
  // Member on a later stage force-advances leader (ratchet), and leader's stage tag shows for the member.
  // Member is locally on Stage 4 (3); leader is on Stage 1 (0). The relay ratchets the leader forward.
  // Force a stage stamp on the wire: pretend bob's local stage is 3 by re-sending through the DO.
  bob.g.ev(`(function(){ var me = PGRaid.raid; me.stage = 3; PGRaid.raid.syncTimer = 0; })()`);
  bob.g.ev(`PGRaid.tick(0.05)`); now += 3000;
  check('member on a later stage pulls leader forward to Stage 4', alice.g.ev('String(PGRaid.raid.stage)') === '3');
  const failed = results.filter(r => !r[1]).length;
  console.log('\n' + (failed ? failed + ' FAILURES' : 'ALL CHECKS PASS') + ' (' + results.length + ' checks)');
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
