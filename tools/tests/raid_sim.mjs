// Astral Raid end-to-end regression suite:
//   node tools/tests/raid_sim.mjs
// Covers: separate Raid portal/lobby, Astral Citadel field & bridge transitions,
// 3 mob stages + Memory of Thanatos boss stage, BOTH evasion modes (walk out + DODGE),
// party-only revive vs solo immediate death + party wipe, dedicated Raid HUD + DPS meter,
// and SocialRoom party relay with zero DO setAlarm and zero non-party broadcasts.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { SocialRoom } from '../../workers/social/room.mjs';

const require = createRequire(import.meta.url);
const { createGame } = require('./helpers/game.js');
const { fourthSetup, progressSetup } = require('./helpers/endgame.js');

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const raidJs = fs.readFileSync(path.join(ROOT, 'assets/raid.js'), 'utf8');
const raidCss = fs.readFileSync(path.join(ROOT, 'assets/raid.css'), 'utf8');

let pass = 0;
function check(name, fn) {
  fn();
  pass++;
  console.log('  ok   ' + name);
}

console.log('Astral Raid simulation & DO budget verification\n');

const g = createGame(html);
g.ev(raidJs);

// 1. Portal / Lobby & Gate checks
check('Raid dock entry opens standalone #raidLobby and enforces 4th-job + 2/day gates', () => {
  g.ev(`S=fresh();S.cls='Lord Knight';S.lv=120;S.gm=false;`);
  assert.equal(g.ev(`PGRaid.canEnter().ok`), false, '3rd job blocked from Astral Raid');
  fourthSetup(g, 'Rune Knight', 'sword', 101);
  progressSetup(g, 'mid');
  g.ev(`S.gm=false;S.raid={day:trialDay(),used:0};`);
  assert.equal(g.ev(`PGRaid.canEnter().ok`), true, '4th job Lv150 allowed');
  assert.equal(g.ev(`PGRaid.raidLeftToday()`), 2, '2 entries/day');
  g.ev(`openTab('raid')`);
  assert.equal(g.ev(`document.getElementById('raidLobby').hidden`), false, 'openTab("raid") opens #raidLobby');
  assert.equal(g.ev(`tabs.includes('raid')`), false, 'raid uses standalone portal, not #wins panel');
  const lobbyHtml = g.ev(`document.getElementById('raidLobbyBody').innerHTML`);
  assert.match(lobbyHtml, /Starlit Approach/);
  assert.match(lobbyHtml, /Fallen Arcade/);
  assert.match(lobbyHtml, /Runic Observatory/);
  assert.match(lobbyHtml, /Sanctuary of Thanatos/);
});

// 2. Solo start: zero WS traffic, Astral Citadel map 10, dedicated Raid HUD
let wsMessages = 0;
check('Solo raid enters Astral Citadel (S.mp=10) with zero WebSocket messages and stable Raid HUD', () => {
  wsMessages = 0;
  g.ev(`window.PGSocial={send:()=>{window.__wsCount=(window.__wsCount||0)+1;return true},app:{id:1,room:0,party:null}};window.__wsCount=0;`);
  g.ev(`S.mp=3;S.lvl=7;S.raid={day:trialDay(),used:0};`);
  const ok = g.ev(`PGRaid.start('solo')`);
  assert.equal(ok, true);
  assert.equal(g.ev(`PGRaid.raid.on`), true);
  assert.equal(g.ev(`S.mp`), 10, 'switched to Astral Citadel map 10');
  assert.equal(g.ev(`S.lvl`), 1, 'Stage 1 uses Astral stage 1');
  assert.equal(g.ev(`camps.length`), 0, 'raid stage camps do not infinitely refill');
  assert.ok(g.ev(`mobs.length >= 12`), 'stage 1 spawns Astral bridge mob packs');
  assert.ok(g.ev(`mobs.every(m => Number.isFinite(m.exp) && Number.isFinite(m.zeny) && m.hp > 0)`), 'all spawned mobs carry valid exp/zeny/hp');
  assert.equal(g.ev(`document.body.classList.contains('raid-open')`), true, 'body.raid-open hides normal UI');
  assert.equal(g.ev(`document.getElementById('raidHud').hidden`), false, '#raidHud visible');
  assert.equal(g.ev(`document.getElementById('raidReviveBtn').hidden`), true, 'Revive button hidden in Solo mode');
  const btnBefore = g.ev(`window.__dodgeRef = document.getElementById('raidDodgeBtn'); !!window.__dodgeRef`);
  assert.equal(btnBefore, true);
  g.ev(`PGRaid.tick(0.3);PGRaid.renderHud();`);
  assert.equal(g.ev(`document.getElementById('raidDodgeBtn') === window.__dodgeRef`), true, 'HUD updates preserve button DOM node (no dropped clicks)');
  assert.equal(g.ev(`window.__wsCount`), 0, 'Solo mode sends zero WebSocket messages');
});

// 3. Stage progression: 3 mob stages -> Astral walk -> Stage 4 Memory of Thanatos + DPS meter accuracy
check('Clearing Stages 1-3 walks down Astral bridge and spawns Memory of Thanatos on Stage 4', () => {
  // Stage 1 -> 2
  g.ev(`S.dmg += 25000000; while(mobs.length) kill(mobs[0]); PGRaid.tick(0.1);`);
  assert.ok(g.ev(`!!astralJourney || !!PGRaid.raid.transition`), 'Stage 1 clear triggers Astral bridge journey');
  for (let i = 0; i < 90 && g.ev(`PGRaid.raid.stage === 0`); i++) {
    g.ev(`if(!tickAstralJourney(1/30))update(1/30);t+=1/30;`);
  }
  assert.equal(g.ev(`PGRaid.raid.stage`), 1, 'advanced to Stage 2 (Fallen Arcade)');
  assert.equal(g.ev(`S.lvl`), 2);

  // Stage 2 -> 3
  g.ev(`while(mobs.length) kill(mobs[0]);`);
  for (let i = 0; i < 90 && g.ev(`PGRaid.raid.stage === 1`); i++) {
    g.ev(`if(!tickAstralJourney(1/30))update(1/30);t+=1/30;`);
  }
  assert.equal(g.ev(`PGRaid.raid.stage`), 2, 'advanced to Stage 3 (Runic Observatory)');
  assert.ok(g.ev(`mobs.some(m => m.n === 'Agony Demon')`), 'Stage 3 includes Agony Demon wardens');

  // Stage 3 -> 4 (Boss: Memory of Thanatos)
  g.ev(`while(mobs.length) kill(mobs[0]);`);
  for (let i = 0; i < 90 && g.ev(`PGRaid.raid.stage === 2`); i++) {
    g.ev(`if(!tickAstralJourney(1/30))update(1/30);t+=1/30;`);
  }
  assert.equal(g.ev(`PGRaid.raid.stage`), 3, 'advanced to Stage 4 (Sanctuary of Thanatos)');
  assert.equal(g.ev(`mobs.some(m => m.boss && m.n === 'Memory of Thanatos')`), true, 'Memory of Thanatos spawned');
  assert.equal(g.ev(`mobs.find(m => m.boss).hx`), null, 'Raid boss has no camp leash (cannot leash-heal)');
  assert.equal(g.ev(`document.getElementById('raidBossWrap').hidden`), false, 'Boss HP bar visible on Stage 4');
  assert.ok(g.ev(`PGRaid.raid.party[0].dps > 0`), 'DPS meter tracks run damage (not lifetime S.dmg)');
});

// 4. Both Evasion Mechanics: Red Telegraph hit vs Walk-Out vs DODGE button
check('Evasion: standing in red telegraph deals 32% HP; walking out OR pressing DODGE evades cleanly', () => {
  // Trigger a telegraph and stand inside it without dodging
  g.ev(`S.hp = maxHp(); pl.x = 0; pl.z = -4; mobs.forEach(m => { m.at = 999; if(m.boss){m.x=0;m.z=-4;} });`);
  g.ev(`PGRaid.raid.telegraph = { name:'Soul Brand', kind:'brand', x:0, z:-4, r:3.8, age:2.35, life:2.4 }; PGRaid.raid.iframes = 0;`);
  const hpFull = g.ev(`S.hp`);
  g.ev(`PGRaid.tick(0.1)`);
  const hpAfterHit = g.ev(`S.hp`);
  assert.equal(hpFull - hpAfterHit, Math.floor(hpFull * 0.32), 'standing inside red telegraph deals 32% maxHp');

  // Evasion A: Walk out via ground click / WASD overrideMove
  g.ev(`S.hp = maxHp(); pl.x = 0; pl.z = -4; PGRaid.raid.telegraph = { name:'Soul Brand', kind:'brand', x:0, z:-4, r:3.8, age:0.2, life:2.4 };`);
  g.ev(`PGRaid.setGroundMove(8, 4);`);
  for (let i = 0; i < 60; i++) {
    g.ev(`mobs.forEach(m => m.at = 999); update(1/30); t += 1/30;`);
  }
  assert.ok(g.ev(`Math.hypot(pl.x - 0, pl.z - (-4)) > 3.8`), 'hero walked out of red telegraph zone and held outside');
  g.ev(`if(PGRaid.raid.telegraph){ PGRaid.raid.telegraph.age = 2.38; PGRaid.tick(0.05); }`);
  assert.equal(g.ev(`S.hp`), hpFull, 'walking out of red telegraph takes 0 telegraph damage');

  // Evasion B: DODGE button (dash + i-frames + cooldown)
  g.ev(`S.hp = maxHp(); pl.x = 0; pl.z = -4; PGRaid.raid.dodgeCd = 0; PGRaid.raid.telegraph = { name:'Crimson Judgment', kind:'slam', x:0, z:-4, r:5.2, age:2.3, life:2.4 };`);
  assert.equal(g.ev(`PGRaid.dodge()`), true, 'DODGE succeeds when off cooldown');
  assert.equal(g.ev(`PGRaid.dodge()`), false, 'DODGE blocked while on cooldown');
  assert.ok(g.ev(`PGRaid.raid.dodgeCd > 3.0 && PGRaid.raid.iframes > 0.5`), 'DODGE sets cooldown and i-frames');
  g.ev(`PGRaid.tick(0.15)`);
  assert.equal(g.ev(`S.hp`), hpFull, 'DODGE evades telegraph impact cleanly');

  // Finish boss -> victory rewards & home map restore
  const shardsBefore = g.ev(`S.ascensionMat[0] || 0`);
  const echoBefore = g.ev(`S.shards || 0`);
  g.ev(`while(mobs.length) kill(mobs[0]); PGRaid.tick(0.1);`);
  assert.equal(g.ev(`PGRaid.raid.on`), false, 'raid ends on Thanatos kill');
  assert.equal(g.ev(`PGRaid.raid.result.cleared`), true, 'victory recorded');
  assert.equal(g.ev(`(S.ascensionMat[0] || 0) - ${shardsBefore}`), 20, '+20 Astral Shards for Solo clear');
  assert.equal(g.ev(`(S.shards || 0) - ${echoBefore}`), 100, '+100 Echo Shards for Solo clear');
  assert.equal(g.ev(`S.mp`), 3, 'restored home map (3) after raid');
  assert.equal(g.ev(`window.__wsCount`), 0, 'entire Solo clear sent zero WebSocket messages');
  g.ev(`PGRaid.hideResult()`);
});

// 5. Solo Death = Immediate End (No Revive)
check('Solo death ends the run immediately with 5 consolation Astral Shards', () => {
  const mat0 = g.ev(`S.ascensionMat[0] || 0`);
  g.ev(`PGRaid.start('solo'); S.hp = 0; PGRaid.tick(0.05);`);
  assert.equal(g.ev(`PGRaid.raid.on`), false, 'Solo death ends run immediately');
  assert.equal(g.ev(`PGRaid.raid.result.cleared`), false);
  assert.equal(g.ev(`(S.ascensionMat[0] || 0) - ${mat0}`), 5, '+5 consolation Astral Shards');
  g.ev(`PGRaid.hideResult()`);
});

// 6. Party Mode: Downed freeze, Teammate Revive (3s channel), and Party Wipe
check('Party mode: downed state freezes hero, 3s REVIVE restores ally at 30% HP, all-dead triggers party wipe', () => {
  const sent = [];
  g.window.PGSocial = {
    app: { id: 10, room: 1, party: { id: 'party:1', leader: 10, members: [{ id: 10, name: 'Alice' }, { id: 20, name: 'Bob' }] } },
    send: msg => { sent.push(msg); return true; },
    setRaidSuspend: () => {},
  };
  g.ev(`S.raid={day:trialDay(),used:0};`);
  assert.equal(g.ev(`PGRaid.start('party')`), 'waiting', 'leader sends raid_start and waits for broadcast');
  assert.equal(sent[0].type, 'raid_start');

  g.ev(`PGRaid.onStarted({raidId:'raid:99',seed:777,leader:10,members:[{id:10,name:'Alice'},{id:20,name:'Bob'}]})`);
  assert.equal(g.ev(`PGRaid.raid.on && PGRaid.raid.mode === 'party'`), true);
  assert.equal(g.ev(`document.getElementById('raidReviveBtn').hidden`), false, 'Revive button shown in Party mode');

  // Bob goes down -> Alice channels 3s revive on Bob
  g.ev(`PGRaid.onSync({fromId:20,name:'Bob',cls:'Ranger',hp:0,maxHp:500000,dps:0,stage:0,dead:true})`);
  assert.equal(g.ev(`PGRaid.revive()`), true, 'living teammate starts 3s revive channel');
  g.ev(`for(let i=0;i<32;i++) PGRaid.tick(0.1);`);
  const revMsg = sent.find(m => m.type === 'raid_revive');
  assert.ok(revMsg && revMsg.target === 20, 'sent raid_revive for Bob after 3s channel');

  // Now Alice goes down while Bob is alive -> Alice stays at 0 HP (no natural regen!) until Bob revives Alice
  g.ev(`S.hp = 0; PGRaid.tick(0.05);`);
  assert.equal(g.ev(`PGRaid.raid.dead`), true, 'Alice is downed, run continues while Bob lives');
  for (let i = 0; i < 30; i++) g.ev(`update(1/30); t += 1/30;`);
  assert.equal(g.ev(`S.hp`), 0, 'downed player stays at 0 HP (no passive regen while dead)');

  // Bob revives Alice!
  g.ev(`PGRaid.onRevive({fromId:20,fromName:'Bob',target:10})`);
  assert.equal(g.ev(`PGRaid.raid.dead`), false, 'Alice revived by Bob');
  assert.equal(g.ev(`S.hp`), g.ev(`Math.ceil(maxHp() * 0.3)`), 'Alice restored to 30% maxHp');

  // Both Alice and Bob fall -> Party Wipe!
  g.ev(`S.hp = 0; PGRaid.tick(0.05);`);
  assert.equal(g.ev(`PGRaid.raid.on`), true, 'still alive while Bob is up');
  g.ev(`PGRaid.onSync({fromId:20,name:'Bob',cls:'Ranger',hp:0,maxHp:500000,dps:0,stage:0,dead:true})`);
  assert.equal(g.ev(`PGRaid.raid.on`), false, 'party wipes when all members are dead');
  assert.match(g.ev(`PGRaid.raid.result.reason`), /wipe/i);
  g.ev(`PGRaid.hideResult()`);
});

// 7. SocialRoom (workers/social/room.mjs) Party Relay & DO Budget Verification
check('SocialRoom relays party raid events ONLY to party members with zero setAlarm calls', () => {
  let now = 1_700_000_000_000;
  let alarms = 0;
  const room = new SocialRoom({
    now: () => now,
    random: () => 0.42,
    onSetAlarm: () => { alarms++; },
  });
  const makeClient = (id, name) => {
    const inbox = [];
    const c = room.connect({ id, username: name }, raw => inbox.push(JSON.parse(raw)), () => {});
    room.receive(c, JSON.stringify({ type: 'join', look: { cls: 'Novice', appearance: { version: 1, sex: 'm' } } }));
    return { c, inbox };
  };
  const alice = makeClient(1, 'Alice');
  const bob = makeClient(2, 'Bob');
  const bystander = makeClient(3, 'Bystander'); // in same plaza room, NOT in party!

  room.receive(alice.c, JSON.stringify({ type: 'party_invite', targetId: 2 }));
  room.receive(bob.c, JSON.stringify({ type: 'party_accept' }));
  alice.inbox.length = 0;
  bob.inbox.length = 0;
  bystander.inbox.length = 0;

  // Non-leader cannot start raid
  room.receive(bob.c, JSON.stringify({ type: 'raid_start' }));
  assert.equal(bob.inbox.at(-1)?.type, 'raid_error', 'non-leader rejected');

  // Leader starts raid -> Alice & Bob get raid_started, Bystander gets NOTHING
  room.receive(alice.c, JSON.stringify({ type: 'raid_start' }));
  assert.equal(alice.inbox.some(m => m.type === 'raid_started'), true);
  assert.equal(bob.inbox.some(m => m.type === 'raid_started'), true);
  assert.equal(bystander.inbox.length, 0, 'zero broadcast to non-party players in plaza');

  // raid_sync rate-limited inside 1500ms unless force:true
  bob.inbox.length = 0;
  room.receive(alice.c, JSON.stringify({ type: 'raid_sync', hp: 800, maxHp: 1000, dps: 4500000, stage: 1, dead: false }));
  room.receive(alice.c, JSON.stringify({ type: 'raid_sync', hp: 750, maxHp: 1000, dps: 4600000, stage: 1, dead: false }));
  assert.equal(bob.inbox.filter(m => m.type === 'raid_sync').length, 1, 'rapid unforced raid_sync throttled on DO');
  now += 2000;
  room.receive(alice.c, JSON.stringify({ type: 'raid_sync', hp: 700, maxHp: 1000, dps: 4700000, stage: 1, dead: false }));
  assert.equal(bob.inbox.filter(m => m.type === 'raid_sync').length, 2, 'sync passes after rate window');

  // raid_revive & raid_end
  room.receive(bob.c, JSON.stringify({ type: 'raid_revive', target: 1 }));
  assert.equal(alice.inbox.some(m => m.type === 'raid_revive' && m.target === 1 && m.fromName === 'Bob'), true);
  room.receive(alice.c, JSON.stringify({ type: 'raid_end', cleared: true, reason: 'boss_down', secs: 420, dps: 5100000 }));
  assert.equal(bob.inbox.some(m => m.type === 'raid_end' && m.cleared === true), true);
  assert.equal(bystander.inbox.length, 0, 'still zero messages sent to plaza bystander');
  assert.equal(alarms, 0, 'zero DO alarms scheduled by party raid');
});

// 8. GM unlimited tries, Stage 1-3 bridge bombardments, 5-shape boss geometry, anti-ranged donut/pools, WASD facing, and UI/BGM rules
check('GM unlimited tries, bridge bombardments, 5-shape boss mechanics, anti-ranged donut/pools, WASD facing & CSS line-height', () => {
  // GM account gets unlimited tries even when S.gm 100x toggle is off
  g.ev(`S.gm = false; CLOUD.on = true; CLOUD.gm = true; S.raid = { day: trialDay(), used: 99 };`);
  assert.equal(g.ev(`PGRaid.raidLeftToday()`), Infinity, 'CLOUD.gm account has Infinity raid tries');
  assert.equal(g.ev(`PGRaid.canEnter('solo').ok`), true, 'CLOUD.gm account bypasses daily cap');
  g.ev(`PGRaid.showLobby('solo');`);
  assert.match(g.ev(`document.getElementById('raidLobbyBody').innerHTML`), /Unlimited \(GM\)/);

  // Start Solo Raid and verify Stage 1 spawns bridge bombardment hazards & WASD rotates pl.ry
  assert.equal(g.ev(`PGRaid.start('solo')`), true);
  g.ev(`for(let i=0;i<36;i++) PGRaid.tick(0.1);`);
  assert.ok(g.ev(`!!PGRaid.raid.telegraph`), 'Stage 1 spawns active bridge bombardment hazard');
  assert.match(g.ev(`PGRaid.raid.telegraph.name`), /Starfall|Lance|Comet/);

  // WASD walking away from mobs faces the walking direction (+Z), not backwards toward mob (-Z)
  g.ev(`pl.x = 0; pl.z = 0; az = 0; mobs[0].x = 0; mobs[0].z = -6; mob = mobs[0]; PGRaid.onKey('s', true);`);
  for (let i = 0; i < 6; i++) g.ev(`mobs.forEach(m => m.at = 999); update(1/30); t += 1/30;`);
  const ryWalkingSouth = g.ev(`pl.ry`);
  g.ev(`PGRaid.onKey('s', false);`);
  assert.ok(Math.abs(ryWalkingSouth - (-Math.PI / 2)) < 0.25, 'WASD walking rotates pl.ry to face walk direction (+Z)');

  // 5-shape hitByTelegraph geometry + Anti-Ranged Donut + Void Pool burn
  // Donut (Eye of Abyss): melee (<3.7) is SAFE, ranged (e.g. dist 7) is HIT!
  assert.equal(g.ev(`PGRaid.hitByTelegraph({shape:'donut',x:0,z:0,innerR:3.7,outerR:16}, 0, 2.0)`), false, 'melee inside donut blue ring is safe');
  assert.equal(g.ev(`PGRaid.hitByTelegraph({shape:'donut',x:0,z:0,innerR:3.7,outerR:16}, 0, 7.5)`), true, 'ranged player outside donut ring is hit');
  // Cross (+): axes are hit, diagonal quadrant is safe
  assert.equal(g.ev(`PGRaid.hitByTelegraph({shape:'cross',x:0,z:0,ang:0,width:2.8,len:26}, 0, 6)`), true, 'cross axis hit');
  assert.equal(g.ev(`PGRaid.hitByTelegraph({shape:'cross',x:0,z:0,ang:0,width:2.8,len:26}, 5, 5)`), false, 'cross diagonal quadrant safe');

  // Void Pool anti-ranged DoT ticks down player HP when standing inside
  g.ev(`S.hp = maxHp(); pl.x = 4; pl.z = 4; PGRaid.raid.iframes = 0; PGRaid.raid.voidPools = [{x:4,z:4,r:3.4,left:3.0,tick:0.1}];`);
  const hpPrePool = g.ev(`S.hp`);
  g.ev(`PGRaid.tick(0.2);`);
  assert.ok(g.ev(`S.hp`) < hpPrePool, 'standing in anti-ranged Void Pool deals burn damage');
  g.ev(`PGRaid.leave(); PGRaid.hideResult(); CLOUD.gm = false;`);

  // CSS rules: hides #bgmPlayer and resets #view's line-height: 0
  for (const sel of ['#dock', '#sideRail', '#xp-dock', '#hud', '#socialChat', '#bgmPlayer']) {
    assert.ok(raidCss.includes('body.raid-open ' + sel), 'raid.css hides ' + sel);
  }
  assert.match(raidCss, /#raidLobby,\s*#raidHud,\s*#raidResult\s*\{[^}]*line-height:\s*1\.45/, 'raid.css resets #view line-height: 0');
});

g.close();
console.log(`\nPASS: ${pass}/${pass} Astral Raid checks passed`);
