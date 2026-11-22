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

// 1. Map -> Dungeons Subtab (Raid Dungeons + Endless Echo) & Gate checks
check('Raid moved out of bottom dock into Map -> Dungeons subtab with 3 dungeons, Mobs & Drops, Solo direct entry & Party Ready Room', () => {
  assert.equal(g.ev(`DOCK_TABS.includes('raid')`), false, 'raid removed from main bottom dock UI');
  g.ev(`S=fresh();S.cls='Lord Knight';S.lv=120;S.gm=false;`);
  assert.equal(g.ev(`PGRaid.canEnter('solo').ok`), false, '3rd job blocked from Raid');
  fourthSetup(g, 'Rune Knight', 'sword', 101);
  progressSetup(g, 'mid');
  g.ev(`S.gm=false;S.raid={day:trialDay(),used:0};`);
  assert.equal(g.ev(`PGRaid.canEnter('solo').ok`), true, '4th job Lv150 allowed');
  assert.equal(g.ev(`PGRaid.raidLeftToday()`), 2, '2 entries/day');

  // Opening Dungeons via openTab('raid') or Map -> Dungeons renders 3 dungeons on left & Mobs/Drops on right
  g.ev(`openTab('raid')`);
  assert.equal(g.ev(`tabs.includes('map') && mapSeason === 'dungeons' && dungeonMode === 'raid'`), true, 'opens Map -> Dungeons -> Raid');
  assert.equal(g.ev(`document.querySelectorAll('.raid-dungeon-card').length`), 3, '3 dungeon cards rendered on left');
  assert.equal(g.ev(`document.querySelectorAll('.raid-dungeon-card img').length`), 3, 'all 3 dungeon cards render dungeon images');
  const mapHtml = g.ev(`document.querySelector('[data-win="map"]').innerHTML`);
  assert.match(mapHtml, /Astral Citadel/);
  assert.match(mapHtml, /Thor Volcano/);
  assert.match(mapHtml, /Niflheim Abyssal Sanctum/);
  assert.match(mapHtml, /Monsters &amp; Boss/);
  assert.match(mapHtml, /Drops &amp; Clear Rewards/);

  // Selecting Thor Volcano updates right-side Mobs & Drops; selecting Abyss shows Coming Soon
  g.ev(`ACT.raiddungeon('thor')`);
  assert.match(g.ev(`document.querySelector('.raid-dungeon-detail').textContent`), /Ifrit.*Primal Catalysts/);
  g.ev(`ACT.raiddungeon('abyss')`);
  assert.match(g.ev(`document.querySelector('.raid-dungeon-detail').textContent`), /Coming in Future Update/);
  g.ev(`ACT.raiddungeon('astral')`);

  // Switching to Endless Echo submode inside Dungeons shows Endless Echo
  g.ev(`ACT.dungeonmode('echo')`);
  assert.ok(g.ev(`!!document.querySelector('[data-win="map"] [data-trial="lobby"]')`), 'Endless Echo lives inside Map -> Dungeons');
  g.ev(`ACT.dungeonmode('raid')`);

  // Clicking Party Raid opens the Party Preview Ready Room (#raidLobby)
  g.ev(`ACT.raidparty('astral')`);
  assert.equal(g.ev(`document.getElementById('raidLobby').hidden`), false, 'Party Raid button opens #raidLobby Party Preview');
  g.ev(`PGRaid.hideLobby(); tabs.length = 0; renderWin();`);
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

// 4. Both Evasion Mechanics + Elevated Boss Threat: Red Telegraph hit (45% HP) + Periodic Boss Cleave vs Walk-Out vs DODGE button
check('Evasion & Elevated Boss Threat: standing in red telegraph deals 45% HP, periodic boss cleave deals 16% HP, and walking out OR pressing DODGE evades cleanly', () => {
  // Trigger a telegraph and stand inside it without dodging (pause periodic cleave so we measure telegraph impact cleanly)
  g.ev(`S.hp = maxHp(); pl.x = 0; pl.z = -4; PGRaid.raid.bossCleaveIn = 10; mobs.forEach(m => { m.at = 999; if(m.boss){m.x=0;m.z=-4;} });`);
  g.ev(`PGRaid.raid.telegraph = { name:'Soul Brand', kind:'brand', x:0, z:-4, r:3.8, age:2.35, life:2.4 }; PGRaid.raid.iframes = 0;`);
  const hpFull = g.ev(`S.hp`);
  g.ev(`PGRaid.tick(0.1)`);
  const hpAfterHit = g.ev(`S.hp`);
  assert.equal(hpFull - hpAfterHit, Math.floor(hpFull * 0.45), 'standing inside red telegraph deals elevated 45% maxHp');

  // Verify periodic Boss Cleave deals ~16% maxHp pressure on its own
  g.ev(`S.hp = maxHp(); PGRaid.raid.iframes = 0; PGRaid.raid.telegraph = null; PGRaid.raid.bossCleaveIn = 0.05; PGRaid.tick(0.1);`);
  assert.equal(hpFull - g.ev(`S.hp`), Math.max(1, Math.floor(hpFull * 0.16)), 'boss periodic cleave deals 16% maxHp');

  // Evasion A: Walk out via ground click / WASD overrideMove
  g.ev(`S.hp = maxHp(); pl.x = 0; pl.z = -4; PGRaid.raid.bossCleaveIn = 99; PGRaid.raid.telegraph = { name:'Soul Brand', kind:'brand', x:0, z:-4, r:3.8, age:0.2, life:2.4 };`);
  g.ev(`PGRaid.setGroundMove(8, 4);`);
  for (let i = 0; i < 60; i++) {
    g.ev(`mobs.forEach(m => m.at = 999); PGRaid.raid.bossCleaveIn = 99; update(1/30); t += 1/30;`);
  }
  assert.ok(g.ev(`Math.hypot(pl.x - 0, pl.z - (-4)) > 3.8`), 'hero walked out of red telegraph zone and held outside');
  g.ev(`if(PGRaid.raid.telegraph){ PGRaid.raid.telegraph.age = 2.38; PGRaid.tick(0.05); }`);
  assert.equal(g.ev(`S.hp`), hpFull, 'walking out of red telegraph takes 0 telegraph damage');

  // Evasion B: DODGE button (dash + i-frames + cooldown)
  g.ev(`S.hp = maxHp(); pl.x = 0; pl.z = -4; PGRaid.raid.bossCleaveIn = 99; PGRaid.raid.dodgeCd = 0; PGRaid.raid.telegraph = { name:'Crimson Judgment', kind:'slam', x:0, z:-4, r:5.2, age:2.3, life:2.4 };`);
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

// 6. Party Mode: Ready Check, Downed freeze, Teammate Revive (3s channel), and Party Wipe
check('Party mode: requires Ready check, downed state freezes hero, 3s REVIVE restores ally at 30% HP, all-dead triggers party wipe', () => {
  const sent = [];
  g.window.PGSocial = {
    app: { id: 10, room: 1, connected: true, party: { id: 'party:1', leader: 10, members: [{ id: 10, name: 'Alice' }, { id: 20, name: 'Bob' }] } },
    send: msg => { sent.push(msg); return true; },
    setRaidSuspend: () => {},
  };
  g.ev(`S.raid={day:trialDay(),used:0};`);
  // Before Bob presses Ready, leader cannot start!
  g.ev(`PGRaid.onLobby({partyId:'party:1',leader:10,members:[{id:10,name:'Alice',cls:'Rune Knight',lv:160,ready:true},{id:20,name:'Bob',cls:'Ranger',lv:155,ready:false}]})`);
  assert.equal(g.ev(`PGRaid.canEnter('party').ok`), false, 'leader blocked until Bob presses Ready');
  assert.equal(g.ev(`PGRaid.start('party')`), false, 'start("party") blocked before Ready');

  // Bob presses Ready -> leader can now launch!
  g.ev(`PGRaid.onLobby({partyId:'party:1',leader:10,members:[{id:10,name:'Alice',cls:'Rune Knight',lv:160,ready:true},{id:20,name:'Bob',cls:'Ranger',lv:155,ready:true}]})`);
  assert.equal(g.ev(`PGRaid.canEnter('party').ok`), true, 'leader unlocked once all members press Ready');
  assert.equal(g.ev(`PGRaid.start('party')`), 'waiting', 'leader sends raid_start and waits for broadcast');
  assert.equal(sent.at(-1).type, 'raid_start');

  g.ev(`PGRaid.onStarted({raidId:'raid:99',seed:777,leader:10,members:[{id:10,name:'Alice',cls:'Rune Knight'},{id:20,name:'Bob',cls:'Ranger'}]})`);
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

// 7. SocialRoom (workers/social/room.mjs) Party Ready, Raid Chat, Relay & DO Budget Verification
check('SocialRoom enforces raid_ready before raid_start, relays raid_chat & raid events ONLY to party, with zero setAlarm calls', () => {
  let now = 1_700_000_000_000;
  let alarms = 0;
  const room = new SocialRoom({
    now: () => now,
    random: () => 0.42,
    onSetAlarm: () => { alarms++; },
  });
  const makeClient = (id, name, cls = 'Rune Knight') => {
    const inbox = [];
    const c = room.connect({ id, username: name }, raw => inbox.push(JSON.parse(raw)), () => {});
    room.receive(c, JSON.stringify({ type: 'join', look: { cls, appearance: { version: 1, sex: 'm', headTop: 'crown' } } }));
    return { c, inbox };
  };
  const alice = makeClient(1, 'Alice', 'Rune Knight');
  const bob = makeClient(2, 'Bob', 'Arch Bishop');
  const bystander = makeClient(3, 'Bystander', 'Ranger'); // in same plaza room, NOT in party!

  room.receive(alice.c, JSON.stringify({ type: 'party_invite', targetId: 2 }));
  room.receive(bob.c, JSON.stringify({ type: 'party_accept' }));
  alice.inbox.length = 0;
  bob.inbox.length = 0;
  bystander.inbox.length = 0;

  // Non-leader cannot start raid
  room.receive(bob.c, JSON.stringify({ type: 'raid_start' }));
  assert.equal(bob.inbox.at(-1)?.type, 'raid_error', 'non-leader rejected');

  // Leader cannot start raid while Bob is NOT Ready!
  room.receive(alice.c, JSON.stringify({ type: 'raid_start' }));
  assert.equal(alice.inbox.at(-1)?.type, 'raid_error', 'leader rejected before Bob presses Ready');
  assert.match(alice.inbox.at(-1)?.message || '', /Bob.*Ready/i);

  // Bob presses Ready -> both Alice & Bob receive raid_lobby with character appearance & ready=true!
  now += 500;
  room.receive(bob.c, JSON.stringify({ type: 'raid_ready', ready: true, cls: 'Arch Bishop', lv: 175, sex: 'f' }));
  const lobbyMsg = alice.inbox.findLast(m => m.type === 'raid_lobby');
  assert.ok(lobbyMsg, 'leader received raid_lobby update');
  assert.equal(lobbyMsg.members.find(m => m.id === 2)?.ready, true, 'Bob marked ready');
  assert.equal(lobbyMsg.members.find(m => m.id === 2)?.cls, 'Arch Bishop', 'Bob class relayed');
  assert.equal(bystander.inbox.length, 0, 'raid_lobby not sent to plaza bystander');

  // Leader starts raid -> Alice & Bob get raid_started with character roster, Bystander gets NOTHING
  alice.inbox.length = 0;
  bob.inbox.length = 0;
  room.receive(alice.c, JSON.stringify({ type: 'raid_start' }));
  assert.equal(alice.inbox.some(m => m.type === 'raid_started'), true);
  assert.equal(bob.inbox.some(m => m.type === 'raid_started'), true);
  assert.equal(bystander.inbox.length, 0, 'zero broadcast to non-party players in plaza');

  // Raid Chat relays to both Alice & Bob, NOT Bystander
  now += 600;
  room.receive(bob.c, JSON.stringify({ type: 'raid_chat', text: 'Stack inside Eye of Abyss!' }));
  assert.equal(alice.inbox.some(m => m.type === 'raid_chat' && m.name === 'Bob' && m.text === 'Stack inside Eye of Abyss!'), true);
  assert.equal(bob.inbox.some(m => m.type === 'raid_chat' && m.text === 'Stack inside Eye of Abyss!'), true);
  assert.equal(bystander.inbox.length, 0, 'raid_chat never leaks to plaza bystander');

  // raid_sync carries dmgTaken, support & revives and is rate-limited inside 1500ms unless force:true
  bob.inbox.length = 0;
  room.receive(alice.c, JSON.stringify({ type: 'raid_sync', hp: 800, maxHp: 1000, dps: 4500000, dmgTaken: 120000, support: 15000, revives: 0, stage: 1, dead: false }));
  room.receive(alice.c, JSON.stringify({ type: 'raid_sync', hp: 750, maxHp: 1000, dps: 4600000, dmgTaken: 130000, support: 15000, revives: 0, stage: 1, dead: false }));
  const syncs1 = bob.inbox.filter(m => m.type === 'raid_sync');
  assert.equal(syncs1.length, 1, 'rapid unforced raid_sync throttled on DO');
  assert.equal(syncs1[0].dmgTaken, 120000, 'dmgTaken relayed on raid_sync');
  assert.equal(syncs1[0].support, 15000, 'support relayed on raid_sync');
  now += 2000;
  room.receive(alice.c, JSON.stringify({ type: 'raid_sync', hp: 700, maxHp: 1000, dps: 4700000, dmgTaken: 150000, support: 20000, revives: 1, stage: 1, dead: false }));
  assert.equal(bob.inbox.filter(m => m.type === 'raid_sync').length, 2, 'sync passes after rate window');

  // raid_revive & raid_end
  room.receive(bob.c, JSON.stringify({ type: 'raid_revive', target: 1 }));
  assert.equal(alice.inbox.some(m => m.type === 'raid_revive' && m.target === 1 && m.fromName === 'Bob'), true);
  room.receive(alice.c, JSON.stringify({ type: 'raid_end', cleared: true, reason: 'boss_down', secs: 420, dps: 5100000, dmgTaken: 185000, support: 25000, revives: 0 }));
  const endMsg = bob.inbox.find(m => m.type === 'raid_end');
  assert.ok(endMsg && endMsg.cleared === true && endMsg.dmgTaken === 185000, 'raid_end relays final stats');
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

// 9. Party Ready Room UI: Character Preview Canvases, Member Ready Toggle, and Leader Start Gate
check('Party Ready Room renders character preview canvases, member Ready button, and gates Leader Start', () => {
  const sent = [];
  // Test as non-leader member (Bob, id=20)
  g.window.PGSocial = {
    app: {
      id: 20,
      room: 1,
      connected: true,
      party: { id: 'party:77', leader: 10, members: [{ id: 10, name: 'Alice' }, { id: 20, name: 'Bob' }, { id: 30, name: 'Cara' }] }
    },
    send: msg => { sent.push(msg); return true; },
    setRaidSuspend: () => {},
  };
  g.ev(`S.raid={day:trialDay(),used:0}; PGRaid.showLobby('party');`);
  let htmlBody = g.ev(`document.getElementById('raidLobbyBody').innerHTML`);
  assert.equal(g.ev(`document.querySelectorAll('#raidLobbyBody canvas.raid-portrait-canvas').length`), 3, 'renders 3 character preview canvases for 3-player party');
  assert.match(htmlBody, /data-raid-act="toggle-ready"/, 'non-leader sees Press Ready button');
  assert.equal(g.ev(`PGRaid.toggleReady()`), true, 'Bob toggles Ready ON');
  assert.equal(sent.at(-1)?.type, 'raid_ready');
  assert.equal(sent.at(-1)?.ready, true);

  // Switch perspective to Party Leader (Alice, id=10)
  g.window.PGSocial.app.id = 10;
  g.ev(`PGRaid.onLobby({partyId:'party:77',leader:10,members:[
    {id:10,name:'Alice',cls:'Rune Knight',lv:180,ready:true},
    {id:20,name:'Bob',cls:'Arch Bishop',lv:175,ready:true},
    {id:30,name:'Cara',cls:'Warlock',lv:178,ready:false}
  ]})`);
  assert.equal(g.ev(`document.querySelector('#raidLobbyBody [data-raid-act="start"]').disabled`), true, 'Leader Start button disabled while Cara is Not Ready');

  // Cara presses Ready -> Leader Start button unlocks!
  g.ev(`PGRaid.onLobby({partyId:'party:77',leader:10,members:[
    {id:10,name:'Alice',cls:'Rune Knight',lv:180,ready:true},
    {id:20,name:'Bob',cls:'Arch Bishop',lv:175,ready:true},
    {id:30,name:'Cara',cls:'Warlock',lv:178,ready:true}
  ]})`);
  assert.equal(g.ev(`document.querySelector('#raidLobbyBody [data-raid-act="start"]').disabled`), false, 'Leader Start button enabled once all party members press Ready');
  g.ev(`PGRaid.hideLobby()`);
});

// 10. Raid Chat Box + End-of-Raid Commendation Badges & Loot Showcase Popup (Fail AND Complete)
check('Raid Chat Box works in raid & Commendation Popup renders character previews, High DPS / Taken Highest Damage / Best Support badges, Items Received & Leave Raid on both Fail and Complete', () => {
  const sent = [];
  g.window.PGSocial = {
    app: {
      id: 10,
      room: 1,
      connected: true,
      party: { id: 'party:88', leader: 10, members: [{ id: 10, name: 'Alice' }, { id: 20, name: 'Bob' }, { id: 30, name: 'Cara' }] }
    },
    send: msg => { sent.push(msg); return true; },
    setRaidSuspend: () => {},
  };
  g.ev(`S.raid={day:trialDay(),used:0};`);
  g.ev(`PGRaid.onStarted({raidId:'raid:88',seed:1234,leader:10,members:[
    {id:10,name:'Alice',cls:'Rune Knight',sex:'f'},
    {id:20,name:'Bob',cls:'Arch Bishop',sex:'m'},
    {id:30,name:'Cara',cls:'Warlock',sex:'f'}
  ]})`);

  // Raid Chat Box present in HUD, Enter focuses input, Escape blurs input without leaving raid
  assert.ok(g.ev(`!!document.getElementById('raidChatBox') && !!document.getElementById('raidChatInput')`), 'Raid Chat box rendered in #raidHud');
  g.ev(`PGRaid.onKey('Enter', true);`);
  assert.equal(g.ev(`document.activeElement.id`), 'raidChatInput', 'Enter focuses #raidChatInput');
  g.ev(`escapeUI();`);
  assert.notEqual(g.ev(`document.activeElement?.id`), 'raidChatInput', 'Escape blurs #raidChatInput cleanly');
  assert.equal(g.ev(`PGRaid.raid.on`), true, 'Escape while focused on chat does not exit raid');

  // Send & receive Raid Chat
  g.ev(`PGRaid.sendChat('Watch Eye of Abyss!');`);
  assert.equal(sent.at(-1)?.type, 'raid_chat');
  assert.equal(sent.at(-1)?.text, 'Watch Eye of Abyss!');
  g.ev(`PGRaid.onChat({id:501,fromId:20,name:'Bob',text:'Got Sanctuary ready!'});`);
  assert.match(g.ev(`document.getElementById('raidChatFeed').textContent`), /Bob:Got Sanctuary ready!/);

  // Simulate distinct roles across the 3 party members:
  // - Alice (self, Rune Knight): Tanked highest damage (420,000 dmgTaken)
  // - Bob (Arch Bishop): Best Support (1 revive + 310,000 support)
  // - Cara (Warlock): High DPS (9,800,000 DPS)
  g.ev(`S.dmg += 12000000; PGRaid.raid.elapsed = 10; PGRaid.raid.dmgTaken = 420000; PGRaid.raid.supportScore = 12000;`);
  g.ev(`PGRaid.onSync({fromId:20,name:'Bob',cls:'Arch Bishop',hp:400000,maxHp:420000,dps:850000,dmgTaken:65000,support:310000,revives:1,stage:3,dead:false});`);
  g.ev(`PGRaid.onSync({fromId:30,name:'Cara',cls:'Warlock',hp:310000,maxHp:350000,dps:9800000,dmgTaken:95000,support:5000,revives:0,stage:3,dead:false});`);

  // Case A: COMPLETE Raid -> Commendation Popup + Party Loot + Leave Raid
  g.ev(`PGRaid.finish(true, 'Memory of Thanatos defeated!', false);`);
  assert.equal(g.ev(`document.getElementById('raidResult').hidden`), false, '#raidResult opens on Complete');
  assert.equal(g.ev(`document.querySelectorAll('#raidResult canvas.raid-portrait-canvas').length`), 3, 'renders 3 character preview canvases on Complete');
  const winComms = g.ev(`({
    dps: PGRaid.raid.result.commendations.highDps.name,
    tank: PGRaid.raid.result.commendations.highestDamageTaken.name,
    sup: PGRaid.raid.result.commendations.bestSupport.name
  })`);
  assert.equal(winComms.dps, 'Cara', 'Cara awarded High DPS badge');
  assert.equal(winComms.tank, 'Alice', 'Alice awarded Taken Highest Damage badge');
  assert.equal(winComms.sup, 'Bob', 'Bob awarded Best Support badge');
  const winHtml = g.ev(`document.getElementById('raidResult').innerHTML`);
  assert.match(winHtml, /High DPS/);
  assert.match(winHtml, /Taken Highest Damage/);
  assert.match(winHtml, /Best Support/);
  assert.match(winHtml, /Items Received/);
  assert.match(winHtml, /\+30 Astral Shards/);
  assert.match(winHtml, /\+750,000 Zeny/);
  assert.match(winHtml, /\+150 Echo Shards/);
  assert.match(winHtml, />Leave Raid</);
  g.ev(`document.querySelector('#raidResult [data-raid-act="close-result"]').click();`);
  assert.equal(g.ev(`document.getElementById('raidResult').hidden`), true, 'Leave Raid button closes popup');

  // Case B: FAIL Raid -> Commendation Popup + Consolation Items Received + Leave Raid
  g.ev(`S.raid={day:trialDay(),used:0}; PGRaid.start('solo'); S.hp = Math.floor(maxHp() * 0.4); PGRaid.tick(0.2); S.hp = 0; PGRaid.tick(0.05);`);
  assert.equal(g.ev(`document.getElementById('raidResult').hidden`), false, '#raidResult opens on Fail');
  assert.equal(g.ev(`document.querySelectorAll('#raidResult canvas.raid-portrait-canvas').length`), 1, 'renders player character preview canvas on Solo Fail');
  const failHtml = g.ev(`document.getElementById('raidResult').innerHTML`);
  assert.match(failHtml, /Raid Failed/);
  assert.match(failHtml, /High DPS/);
  assert.match(failHtml, /Taken Highest Damage/);
  assert.match(failHtml, /Best Support/);
  assert.match(failHtml, /Items Received/);
  assert.match(failHtml, /\+5 Astral Shards/);
  assert.match(failHtml, />Leave Raid</);
  g.ev(`PGRaid.hideResult();`);
});

// 11. Boss HP Bar Stage-4-Only Visibility, Buff Icon Non-Overlap & Resizable Raid Chat Box
check('Boss HP bar stays hidden on Stages 1-3 and shows ONLY on Stage 4 Boss, #hudBuffs sits above Dodge/Leave, and Raid Chat is resizable', () => {
  assert.match(raidCss, /#raidHud\s+\[hidden\]/, 'raid.css enforces display:none!important on #raidHud [hidden] descendants');
  assert.match(raidCss, /body\.raid-open\s+#hudBuffs\s*\{[^}]*bottom:\s*calc\(max\(14px,\s*env\(safe-area-inset-bottom\)\)\s*\+\s*66px\)\s*!important/, 'raid.css lifts #hudBuffs cleanly above Dodge & Leave');

  g.ev(`S.raid={day:trialDay(),used:0}; openTab('raid'); ACT.raidsolo('astral');`);
  assert.equal(g.ev(`PGRaid.raid.on`), true, 'Solo Raid button in Dungeons enters raid directly without extra modal');
  assert.equal(g.ev(`document.getElementById('raidLobby').hidden`), true, 'no lobby modal shown on Solo Raid');

  // Stage 1: Boss HP bar MUST be hidden!
  g.ev(`PGRaid.renderHud();`);
  assert.equal(g.ev(`document.getElementById('raidBossWrap').hidden`), true, 'Boss HP bar hidden on Stage 1');
  assert.equal(g.ev(`document.getElementById('raidBossWrap').style.display`), 'none', 'Boss HP bar display:none on Stage 1');

  // Resizable Raid Chat Box: preset cycle + custom drag dimensions
  assert.ok(g.ev(`!!document.querySelector('[data-raid-chat-resize]')`), 'drag-resize grip rendered on Raid Chat');
  g.ev(`PGRaid.setChatSize(440, 320);`);
  assert.equal(g.ev(`document.getElementById('raidChatBox').style.width`), '440px', 'Raid Chat width adjusted to 440px');
  assert.equal(g.ev(`document.getElementById('raidChatBox').style.height`), '320px', 'Raid Chat height adjusted to 320px');
  const cycled = g.ev(`PGRaid.cycleChatPreset()`);
  assert.equal(g.ev(`document.getElementById('raidChatBox').style.width`), cycled.w + 'px', 'preset button cycles Raid Chat size');

  // Advance to Stage 4 Boss -> Boss HP bar MUST now appear!
  for (let s = 0; s < 3; s++) {
    g.ev(`while(mobs.length) kill(mobs[0]);`);
    for (let i = 0; i < 90 && g.ev(`PGRaid.raid.stage === ${s}`); i++) {
      g.ev(`if(!tickAstralJourney(1/30))update(1/30);t+=1/30;`);
    }
  }
  assert.equal(g.ev(`PGRaid.raid.stage`), 3, 'reached Stage 4 Boss');
  g.ev(`PGRaid.renderHud();`);
  assert.equal(g.ev(`document.getElementById('raidBossWrap').hidden`), false, 'Boss HP bar visible on Stage 4 Boss');
  assert.notEqual(g.ev(`document.getElementById('raidBossWrap').style.display`), 'none', 'Boss HP bar displayed on Stage 4 Boss');
  g.ev(`PGRaid.leave(); PGRaid.hideResult();`);
});

// 12. Thor Volcano Raid + Higher Boss Threat + Pillar Line-of-Sight Whole-Floor Wipe Skill
check('Thor Volcano Raid rewards Primal Catalysts & Pillar Line-of-Sight Whole-Floor Wipe requires hiding behind a pillar relative to Boss direction', () => {
  // Launch Thor Volcano Solo Raid directly
  const primalBefore = g.ev(`S.ascensionMat[1] || 0`);
  g.ev(`S.raid={day:trialDay(),used:0}; PGRaid.startDirectSolo('thor');`);
  assert.equal(g.ev(`PGRaid.raid.on && PGRaid.raid.dungeonId === 'thor' && S.mp === 11`), true, 'entered Thor Volcano Raid on Map 11');

  // Advance through Stages 1-3 into Stage 4 Sanctum of Ifrit
  for (let s = 0; s < 3; s++) {
    g.ev(`while(mobs.length) kill(mobs[0]);`);
    for (let i = 0; i < 30 && g.ev(`PGRaid.raid.stage === ${s}`); i++) {
      g.ev(`PGRaid.tick(0.1);`);
    }
  }
  assert.equal(g.ev(`PGRaid.raid.stage`), 3, 'reached Stage 4 Sanctum of Ifrit');
  assert.ok(g.ev(`mobs.some(m => m.boss && m.n === 'Ifrit')`), 'Ifrit boss spawned');

  // Test Pillar Line-of-Sight geometry & lethal damage:
  // Boss at (0, -4), Pillar at (0, 1) -> Ray from Boss through Pillar points +Z (0, 1).
  // Player at (0, 3.2) is BEHIND the pillar -> SAFE (0 damage)!
  // Player at (5, -2) is exposed on open floor -> HIT (~88% maxHP lethal blast)!
  g.ev(`
    var boss = mobs.find(m => m.boss);
    boss.x = 0; boss.z = -4;
    PGRaid.raid.telegraph = {
      name: 'Cataclysmic Eruption',
      hint: 'HIDE BEHIND A PILLAR!',
      shape: 'pillars',
      pillars: [{ x: 0, z: 1.0, r: 1.05 }, { x: -4.5, z: -3.5, r: 1.05 }, { x: 4.5, z: -3.5, r: 1.05 }],
      x: 0, z: -4,
      dmgPct: 0.88,
      bypassShield: true,
      mustHideBehindPillar: true,
      age: 4.15,
      life: 4.2
    };
    S.hp = maxHp(); pl.x = 0; pl.z = 3.2; // Behind first pillar relative to boss (0, -4)!
  `);
  assert.equal(g.ev(`PGRaid.hitByTelegraph(PGRaid.raid.telegraph, 0, 3.2)`), false, 'standing in pillar shadow away from boss is SAFE');
  assert.equal(g.ev(`PGRaid.hitByTelegraph(PGRaid.raid.telegraph, 0, -2.0)`), true, 'standing IN FRONT of pillar between boss and pillar is HIT');
  assert.equal(g.ev(`PGRaid.hitByTelegraph(PGRaid.raid.telegraph, 5.0, 2.0)`), true, 'standing on open floor outside pillar shadow is HIT');

  // Detonate while SAFE behind pillar -> 0 damage taken!
  const hpSafeBefore = g.ev(`S.hp`);
  g.ev(`PGRaid.raid.bossCleaveIn = 10; PGRaid.tick(0.1);`);
  assert.equal(g.ev(`S.hp`), hpSafeBefore, 'player behind pillar takes 0 damage from whole-floor wipe');

  // Detonate while EXPOSED on open floor -> takes ~88% maxHP must-avoid damage!
  g.ev(`
    PGRaid.raid.telegraph = {
      name: 'Cataclysmic Eruption',
      hint: 'HIDE BEHIND A PILLAR!',
      shape: 'pillars',
      pillars: [{ x: 0, z: 1.0, r: 1.05 }],
      x: 0, z: -4,
      dmgPct: 0.88,
      bypassShield: true,
      mustHideBehindPillar: true,
      age: 4.15,
      life: 4.2
    };
    S.hp = maxHp(); pl.x = 5.2; pl.z = 1.5; // Exposed!
    PGRaid.raid.iframes = 0.7; // Even i-frames cannot ignore open-floor pillar wipe!
    PGRaid.raid.bossCleaveIn = 10;
    PGRaid.tick(0.1);
  `);
  assert.ok(g.ev(`S.hp <= Math.ceil(maxHp() * 0.14)`), 'exposed player takes massive 88% maxHP damage');

  // Defeat Ifrit -> awards +20 Primal Catalysts!
  g.ev(`S.hp = maxHp(); while(mobs.length) kill(mobs[0]); PGRaid.tick(0.1);`);
  assert.equal(g.ev(`(S.ascensionMat[1] || 0) - ${primalBefore}`), 20, 'Thor Volcano clear awards +20 Primal Catalysts');
  assert.match(g.ev(`document.getElementById('raidResult').innerHTML`), /Primal Catalysts/);
  g.ev(`PGRaid.hideResult();`);
});

g.close();
console.log(`\nPASS: ${pass}/${pass} Astral Raid checks passed`);
