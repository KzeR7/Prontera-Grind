// haven-v489: a party member's local damage must NOT drain its ghost copies of the host's world.
//   node tools/tests/party_raid_member_ghost_sim.mjs
// The host's world is the truth in a one-world raid. Numbers still print and party DPS accrues
// (S.dmg feeds the member's remote assist drain on the host), but the member's mob hp must stay
// pinned to the host's snapshot — no local drain, no local kill, so no boss vanishing off the
// member's screen before the host goes down.
// Needs jsdom + three@0.128.0 (npm i --no-save jsdom three@0.128.0).
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { SocialRoom } from '../../workers/social/room.mjs';

const require = createRequire(import.meta.url);
let createGame = null;
try { ({ createGame } = require('./helpers/game.js')); } catch (e) {
  console.log('party raid member ghost: skipped (npm i --no-save jsdom three@0.128.0)');
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
  check('ghost: raid starts for both', a.ev(`PGRaid.raid.on && PGRaid.raid.mode === 'party'`) === true && b.ev(`PGRaid.raid.on && PGRaid.raid.mode === 'party'`) === true);

  // haven-v489 ghost-gate certification, in two acts.
  //
  // Act A — LOCAL paths drain NOTHING. The world is frozen: mobs cannot hit, both heroes'
  // auto-attack are parked, pets are off, and the member's reported DPS is pinned at the
  // source (raid.dmg0 tracks S.dmg so currentDps() reports 0) so the host never applies an
  // assist drain. With the world static, any ghost hp movement on the member can only come
  // from the member's own local damage paths — which the v489 gate forbids.
  //
  // Act B — the shared world still wipes through the host authority. The pin is released;
  // the member's accrued DPS flows as an assist drain on the host, the host stage-0 wipe
  // propagates through raid_sync (snapshot force-kill / sweepStageGhosts + ratchet), and
  // the member re-seats to stage 1 with stage-1 raidEids and personal kill rolls.
  const memberSyncDpsPin = () => { b.ev(`PGRaid.raid.dmg0 = S.dmg`); a.ev(`PGRaid.raid.party.forEach(p => { if (!p.self) p.dps = 0; })`); };
  const freeze = g => g.ev(`pAtkT = 1e9; swing = null; S.pets.forEach(p => { p.on = false; });`);
  freeze(a); freeze(b);

  const before = JSON.parse(b.ev(`JSON.stringify(mobs.map(m => [m.raidEid, m.hp]))`));
  const dmgBefore = Number(b.ev(`S.dmg`));
  b.ev(`Math.random = () => 0.999; for (var i = 0; i < 120; i++) strike(2.5, undefined, false);`);
  b.ev(`mobs.forEach(m => hurt(m, 1e8, '#fff', false, true));`);
  b.ev(`mobs.forEach(m => { m.dots = [{ dps: 1e5, dur: 99, t: 1 }]; });`);
  for (let j = 0; j < 40; j++) {
    memberSyncDpsPin();
    a.ev(`for (var k = 0; k < 15; k++) update(1/30)`);
    b.ev(`for (var k = 0; k < 15; k++) update(1/30)`);
    now += 500;
  }
  const after = JSON.parse(b.ev(`JSON.stringify(mobs.map(m => [m.raidEid, m.hp]))`));
  const dmgAfter = Number(b.ev(`S.dmg`));
  const hpUnchanged = before.length === after.length && before.every((e, i) => e[0] === after[i][0] && e[1] === after[i][1]);
  if (!hpUnchanged) {
    for (let i = 0; i < Math.max(before.length, after.length); i++) {
      const p = before[i], q = after[i];
      if (JSON.stringify(p) !== JSON.stringify(q)) console.log('  GHOSTDIFF idx', i, 'before=' + JSON.stringify(p), 'after=' + JSON.stringify(q));
    }
  }
  check('ghost: member strike/hurt/DoT spam drains ZERO ghost hp (host is the truth)', hpUnchanged);
  check('ghost: no ghost vanished from the member (mob count intact)', after.length === before.length);
  check('ghost: member DPS actually accrued (assist feeds the host)', dmgAfter - dmgBefore > 1e9);
  check('ghost: member never killed a ghost locally (S.kl unchanged)', Number(b.ev(`S.kl`)) === 0);
  check('ghost: member mobs still present after 20 s of spam', after.length === before.length && after.length > 0);
  check('ghost: member stage stays 0 while the host chairs the world (no phantom advance)', b.ev(`PGRaid.raid.stage`) === 0 && a.ev(`PGRaid.raid.stage`) === 0);

  // ---- Act B: unpin — member DPS now drains the host's stage 0, the wipe propagates. ----
  // Reset dmg0 so the whole accrued S.dmg counts as dps again (pinned to S.dmg at the end of
  // Act A, the report would stay 0 forever). The member's reported dps is capped at 5e9 on the
  // wire, so the host's assist drain melts stage 0 in a second of game time.
  b.ev(`PGRaid.raid.dmg0 = 0`);
  let advanced = false;
  for (let j = 0; j < 90 && !advanced; j++) {
    a.ev(`for (var k = 0; k < 20; k++) update(1/30)`);
    b.ev(`for (var k = 0; k < 20; k++) update(1/30)`);
    now += 500;
    advanced = b.ev(`PGRaid.raid.stage >= 1`) === true;
  }
  const memberEids = JSON.parse(b.ev(`JSON.stringify(mobs.map(m => m.raidEid))`));
  check('ghost: member DPS flows — host world wipes and the member ratchets to stage 1', advanced && a.ev(`PGRaid.raid.stage`) >= 1);
  check('ghost: member world re-seated with stage-1 raidEids (no stage-0 ghosts lingering)', memberEids.length > 0 && memberEids.every(e => e >= 100));
  check('ghost: member rolled personal kills on the shared wipe', Number(b.ev(`S.kl`)) > 0);

  const ok = results.every(r => r[1]);
  console.log(ok ? `\nALL CHECKS PASS (${results.length} checks)` : `\n${results.filter(r => !r[1]).length} FAILURES (${results.length} checks)`);
  process.exit(ok ? 0 : 1);
})().catch(e => { console.error('ghost sim crashed:', e); process.exit(1); });
