// haven-v485: leader migration — the raid world passes to the next member on host disconnect/silence.
//   node tools/tests/party_raid_migration_sim.mjs
// The party leader's client is the raid world. If the leader's socket drops (the room broadcasts
// raid_end reason=disconnect/left and the slot is flagged) the lowest-id living member promotes
// immediately; if the leader merely goes silent, members wait out the silence window (8 game-seconds)
// and then elect the freshest lowest-id living member. A promoted host yields to a fresh entry-leader
// claim (leader reclaims) and to a lower-id promoted teammate (race resolved by id). Dead members
// never promote. No new DO message types — the claim is a whitelisted `worldHost` boolean on raid_sync.
// Needs jsdom + three@0.128.0; exits 0 without them.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { SocialRoom } from '../../workers/social/room.mjs';

const require = createRequire(import.meta.url);
let createGame = null;
try { ({ createGame } = require('./helpers/game.js')); } catch (e) {
  console.log('party raid migration: skipped (npm i --no-save jsdom three@0.128.0 ws)');
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
function check(label, cond) { results.push([label, !!cond]); console.log((cond ? 'PASS' : 'FAIL') + '  ' + label); }

function bootTrio(prefix) {
  const room = new SocialRoom({ now: () => now, random: () => 0.42 });
  const boot = name => ({ name, g: (() => { const g = createGame(html); for (const f of SOCIAL_FILES) g.ev(fs.readFileSync(path.join(ROOT, f), 'utf8')); return g; })() });
  const players = {};
  players.a = boot(prefix + 'alice');
  players.b = boot(prefix + 'bob');
  players.c = boot(prefix + 'carol');
  const clients = {};
  const ids = { a: 1010, b: 1020, c: 1030 };
  for (const k of ['a', 'b', 'c']) {
    const p = players[k];
    const c = room.connect({ id: ids[k], username: p.name }, raw => p.g.window.PGSocial.receive(JSON.parse(raw)), () => {});
    p.g.window.PGSocial.app.socket = { readyState: 1, send: s => room.receive(c, s), close() {} };
    p.g.ev(`currentUser='${p.name}';S=fresh();S.cls='Rune Knight';S.lv=150;S.gm=false;S.hp=1000000000;`);
    clients[k] = c;
  }
  return { room, players, clients, ids };
}
async function formPartyRaid(H) {
  const { room, players } = H;
  for (const k of ['a', 'b', 'c']) { await players[k].g.ev('PGSocial.enter()'); now += 1000; }
  for (const k of ['a', 'b', 'c']) { players[k].g.ev(`PGSocial.send({type:'join',look:{cls:S.cls,appearance:{version:1,sex:'m'},lv:S.lv,speed:5},friends:[]})`); now += 1000; }
  players.a.g.ev(`ACT.raidparty('astral')`); now += 1000;
  players.a.g.ev(`PGSocial.send({type:'party_invite',targetId:${H.ids.b}})`); now += 1000;
  players.a.g.ev(`PGSocial.send({type:'party_invite',targetId:${H.ids.c}})`); now += 1000;
  players.b.g.ev(`document.querySelector('#socialPartyToast [data-party-toast="accept"]').click()`); now += 1000;
  players.c.g.ev(`document.querySelector('#socialPartyToast [data-party-toast="accept"]').click()`); now += 1000;
  players.b.g.ev(`document.querySelector('#raidLobby [data-raid-act="toggle-ready"]').click()`); now += 1000;
  players.c.g.ev(`document.querySelector('#raidLobby [data-raid-act="toggle-ready"]').click()`); now += 1000;
  players.a.g.ev(`document.querySelector('#raidLobby [data-raid-act="start"]').click()`); now += 1500;
}
const advance = (H, keys, seconds, step = 0.05) => { const n = Math.round(seconds / step); for (const k of keys) for (let i = 0; i < n; i++) H.players[k].g.ev(`PGRaid.tick(${step})`); };
const mobEids = g => g.ev(`JSON.stringify((mobs||[]).map(m=>m.raidEid))`);

(async () => {
  // ===== Suite B — leader disconnects: peer-exit fast path promotes the lowest living member =====
  {
    const H = bootTrio('B');
    await formPartyRaid(H);
    check('B: all three land in the raid', ['a','b','c'].every(k => H.players[k].g.ev(`PGRaid.raid.on && PGRaid.raid.mode === 'party'`) === true));
    check('B: identical stage layout on every client (seeded spawn)', mobEids(H.players.a.g) === mobEids(H.players.b.g) && mobEids(H.players.b.g) === mobEids(H.players.c.g));
    H.room.disconnect(H.clients.a); now += 300;
    check('B: both remaining clients flag the leader slot disconnected',
      H.players.b.g.ev(`(PGRaid.raid.party.find(p=>String(p.id)==='${H.ids.a}')||{}).disconnected`) === true &&
      H.players.c.g.ev(`(PGRaid.raid.party.find(p=>String(p.id)==='${H.ids.a}')||{}).disconnected`) === true);
    advance(H, ['b', 'c'], 1.0); now += 1600;
    check('B: the lowest living member (bob, 1020) promotes on the peer-exit', H.players.b.g.ev(`!!PGRaid.raid.promotedHost`) === true);
    check('B: carol (1030) does not promote', H.players.c.g.ev(`!PGRaid.raid.promotedHost`) === true);
    check('B: bob is the raid world authority', H.players.b.g.ev(`PGRaid.isRaidHost()`) === true && H.players.a.g.ev(`PGRaid.isRaidHost()`) === true /* entry leader still believes until a fresh lower claim; harmless */);
    // bob halves a mob's HP and broadcasts; carol's copy must pin down.
    const eid = H.players.b.g.ev(`mobs[0].raidEid`);
    const before = H.players.c.g.ev(`(mobs||[]).find(m=>m.raidEid===${eid}).hp`);
    H.players.b.g.ev(`mobs[0].hp = Math.max(1, Math.floor(mobs[0].hp * 0.5)); PGRaid.raid.syncTimer = 0; PGRaid.tick(0.05)`); now += 1600;
    const after = H.players.c.g.ev(`(mobs||[]).find(m=>m.raidEid===${eid}).hp`);
    check('B: carol ADOPTS the elected host\'s snapshot (world authority really moved)', after < before);
    H.players.a.g.window.close(); H.players.b.g.window.close(); H.players.c.g.window.close();
  }

  // ===== Suite A — leader silent (not disconnected): members wait the window, then elect; leader can reclaim =====
  {
    const H = bootTrio('A');
    await formPartyRaid(H);
    advance(H, ['b', 'c'], 2.0); now += 100;
    check('A: no promotion before the silence window elapses', H.players.b.g.ev(`!PGRaid.raid.promotedHost`) === true && H.players.c.g.ev(`!PGRaid.raid.promotedHost`) === true);
    advance(H, ['b', 'c'], 8.0); now += 200;
    check('A: after 8 silent game-seconds bob (1020) promotes', H.players.b.g.ev(`!!PGRaid.raid.promotedHost`) === true);
    check('A: carol never promotes while bob is fresh', H.players.c.g.ev(`!PGRaid.raid.promotedHost`) === true);
    // The leader comes back: one fresh claim from the entry leader and bob yields the world back.
    H.players.a.g.ev(`PGRaid.raid.syncTimer = 0; PGRaid.tick(0.05)`); now += 1600;
    advance(H, ['b'], 0.2);
    check('A: the entry leader reclaims the world (bob yields)', H.players.b.g.ev(`!PGRaid.raid.promotedHost`) === true && H.players.a.g.ev(`PGRaid.isRaidHost()`) === true);
    H.players.a.g.window.close(); H.players.b.g.window.close(); H.players.c.g.window.close();
  }

  // ===== Suite C — two promoted hosts claim at once: the lower id keeps the world =====
  {
    const H = bootTrio('C');
    await formPartyRaid(H);
    // Simulate the race directly: both members promote at once (naive simultaneous election),
    // then exchange claims — the lower id keeps the world, the other yields (rule C).
    H.players.b.g.ev(`PGRaid.raid.promotedHost = true`);
    H.players.c.g.ev(`PGRaid.raid.promotedHost = true`);
    advance(H, ['b', 'c'], 2.0); now += 200;
    const bHost = H.players.b.g.ev(`PGRaid.isRaidHost()`);
    const cHost = H.players.c.g.ev(`PGRaid.isRaidHost()`);
    check('C: race resolved deterministically — lowest id (bob) keeps the world', bHost === true && cHost === false);
    check('C: bob is promoted, carol yielded (or stayed member)', H.players.b.g.ev(`!!PGRaid.raid.promotedHost`) === true && H.players.c.g.ev(`!PGRaid.raid.promotedHost`) === true);
    H.players.a.g.window.close(); H.players.b.g.window.close(); H.players.c.g.window.close();
  }

  // ===== Suite D — a dead member never promotes; the next living member takes the world =====
  {
    const H = bootTrio('D');
    await formPartyRaid(H);
    H.room.disconnect(H.clients.a); now += 300;
    // Bob's hero is dead (but he is still connected): he must NOT promote; carol must.
    H.players.b.g.ev(`PGRaid.raid.dead = true`);
    advance(H, ['b', 'c'], 1.5); now += 1600;
    check('D: dead bob does not promote', H.players.b.g.ev(`!PGRaid.raid.promotedHost`) === true);
    check('D: carol promotes as the lowest LIVING member', H.players.c.g.ev(`!!PGRaid.raid.promotedHost`) === true);
    H.players.a.g.window.close(); H.players.b.g.window.close(); H.players.c.g.window.close();
  }

  const failed = results.filter(r => !r[1]);
  console.log(failed.length ? `\n${failed.length} FAILURES (${results.length} checks)` : `\nALL CHECKS PASS (${results.length} checks)`);
  process.exit(failed.length ? 1 : 0);
})().catch(e => { console.error('migration sim crashed:', e); process.exit(1); });
