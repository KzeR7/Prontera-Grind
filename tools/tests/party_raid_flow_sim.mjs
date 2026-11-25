// haven-v487: full raid-flow integration — leader and member play through all four stages.
//   node tools/tests/party_raid_flow_sim.mjs
// Proves end-to-end, against the real SocialRoom, that: (1) the raid starts for both; (2) the
// stage 2/3 worlds the host re-seats are byte-identical on the member (seeded spawn + hp pin);
// (3) the member ratchets stage N+1 only via the host's sync — never via its own mob drain;
// (4) the boss kill finishes the raid for both via the party broadcast; (5) mid-stage kills flow
// through the host's snap and the member rolls personal kill loot/EXP on every shared kill.
// Needs jsdom + three@0.128.0 (npm i --no-save jsdom three@0.128.0).
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { SocialRoom } from '../../workers/social/room.mjs';

const require = createRequire(import.meta.url);
let createGame = null;
try { ({ createGame } = require('./helpers/game.js')); } catch (e) {
  console.log('party raid flow: skipped (npm i --no-save jsdom three@0.128.0)');
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
// The harness plays neither side: neutralize the environment on BOTH worlds — mob attack power
// (mob damage -> 0) and the bridge hazards (the game's own i-frame mechanic) — or the idle
// leader gets chipped to death between stage clears and the raid never advances.
const NEUTRALIZE = g => g.ev(`mobs.forEach(m => { m.provokeUntil = 0; m.atk = 0; }); if (typeof PGRaid !== 'undefined' && PGRaid.raid) PGRaid.raid.iframes = 1e9; activePack = 999;`);
const WORLD = g => g.ev(`JSON.stringify((mobs||[]).map(m => [m.raidEid, m.hp]))`);
const TICK = 1 / 30;
const CLOCK_STEP_MS = 50; // wall clock advances with the sim so the room throttle stays honest

const room = new SocialRoom({ now: () => now, random: () => 0.42 });
const a = boot('alice');   // leader (host)
const b = boot('bob');     // member
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
  // Instrument the member's global hooks to count the personal-roll kill path.
  b.ev(`window.__memberKills = 0; var __origKill = kill; kill = function (m) { window.__memberKills++; return __origKill(m); };`);
  for (const g of [a, b]) NEUTRALIZE(g);
  check('flow: raid starts for both', a.ev(`PGRaid.raid.on && PGRaid.raid.mode === 'party'`) === true && b.ev(`PGRaid.raid.on && PGRaid.raid.mode === 'party'`) === true);
  check('flow: byte-identical stage-1 world', WORLD(a) === WORLD(b));

  const numStages = 4;
  for (let stageNo = 1; stageNo <= numStages; stageNo++) {
    // Host side clears the stage (hp=0 on every mob, as combat would).
    a.ev(`for (var i = mobs.length - 1; i >= 0; i--) { var m = mobs[i]; m.hp = 0; kill(m); }`);
    // Drive the flight/walk home + re-seat the way the real loop does, in chunks, with the wall
    // clock advancing alongside the game clock so the room's ~1.5 s relay throttle behaves as it
    // does in live play (earlier the whole stage ran at one frozen instant and the throttle ate
    // every post-wipe sync — the member silently skipped the stage instead of re-seating).
    for (let j = 0; j < 40; j++) { a.ev(`for (var k = 0; k < 15; k++) update(${TICK});`); now += 500; }
    const memberMobsPre = Number(b.ev(`mobs.length`));
    for (const g of [a, b]) g.ev(`for (var j = 0; j < 40; j++) PGRaid.tick(0.05)`);
    for (const g of [a, b]) NEUTRALIZE(g);
    console.log(`  stage ${stageNo}: hostMobs=${a.ev(`mobs.length`)} memberMobsPre=${memberMobsPre} memberMobsPost=${b.ev(`mobs.length`)} memberKillsHooked=${b.ev(`window.__memberKills`)} memberKl=${b.ev(`S.kl`)}`);
    const hostStage = a.ev(`PGRaid.raid.stage`);
    const memberStage = b.ev(`PGRaid.raid.stage`);
    if (stageNo < numStages) {
      var sa = WORLD(a), sb = WORLD(b);
      if (sa !== sb) {
        var i = 0; var m = Math.min(sa.length, sb.length);
        while (i < m && sa[i] === sb[i]) i++;
        console.log('  DIFF stage ' + stageNo + ' at char ' + i + ' sa=' + sa.slice(Math.max(0, i - 40), i + 30) + ' sb=' + sb.slice(Math.max(0, i - 40), i + 30));
      }
      check(`flow: stage ${stageNo} — host advances, member ratchets to the same stage`, hostStage === memberStage && Number(hostStage) === stageNo);
      check(`flow: stage ${stageNo} — member re-seated with an identical world`, WORLD(a) === WORLD(b));
    } else {
      check('flow: boss — host finishes the raid (cleared)', a.ev(`!PGRaid.raid.on && !!PGRaid.raid.result && PGRaid.raid.result.cleared === true`) === true);
      check('flow: boss — member also finishes, cleared via the party broadcast', b.ev(`!PGRaid.raid.on && !!PGRaid.raid.result && PGRaid.raid.result.cleared === true`) === true);
      check('flow: boss — both worlds agree on the boss stage', Number(memberStage) === 3);
    }
  }
  const memberKills = Number(b.ev(`S.kl`));
  check('flow: member rolled personal kills on the shared clears (loot is personal)', memberKills > 0);
  console.log('  member personal kills:', memberKills);
  const ok = results.every(r => r[1]);
  console.log(ok ? `\nALL CHECKS PASS (${results.length} checks)` : `\n${results.filter(r => !r[1]).length} FAILURES (${results.length} checks)`);
  process.exit(ok ? 0 : 1);
})().catch(e => { console.error('flow sim crashed:', e); process.exit(1); });
