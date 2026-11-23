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
const combatAudioJs = fs.readFileSync(path.join(ROOT, 'assets/combat-audio.js'), 'utf8');
const raidCss = fs.readFileSync(path.join(ROOT, 'assets/raid.css'), 'utf8');

let pass = 0;
function check(name, fn) {
  const res = fn();
  if (res && typeof res.then === 'function') {
    return res.then(() => {
      pass++;
      console.log('  ok   ' + name);
    });
  }
  pass++;
  console.log('  ok   ' + name);
}

console.log('Astral Raid simulation & DO budget verification\n');

const g = createGame(html);
g.ev(combatAudioJs);
g.ev(raidJs);

// 1. Map -> Dungeons Subtab (Raid Dungeons + Endless Echo) & Gate checks
check('Raid moved out of bottom dock into Map -> Dungeons subtab with 3 dungeons, Mobs & Drops, Solo direct entry & Party Ready Room', () => {
  assert.equal(g.ev(`DOCK_TABS.includes('raid')`), false, 'raid removed from main bottom dock UI');
  g.ev(`S=fresh();S.cls='Novice';S.lv=120;S.gm=false;`);
  assert.equal(g.ev(`PGRaid.canEnter('solo').ok`), false, 'Lv120 Novice blocked from Raid');
  g.ev(`S=fresh();S.cls='Knight';S.lv=120;S.gm=false;`);
  assert.equal(g.ev(`PGRaid.canEnter('solo').ok`), false, 'Lv120 2nd job blocked from Raid');
  g.ev(`S=fresh();S.cls='Lord Knight';S.lv=120;S.gm=false;S.raid={day:trialDay(),used:0};`);
  assert.equal(g.ev(`PGRaid.canEnter('solo').ok`), true, 'Lv120 3rd job allowed into Raid');
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

// 4. Both Evasion Mechanics + Balanced Boss Threat: Red Telegraph hit (32% HP) + Periodic Boss Cleave (9% HP) vs Walk-Out vs DODGE button
check('Evasion & Balanced Boss Threat: standing in red telegraph deals 32% HP, periodic boss cleave deals 9% HP, and walking out OR pressing DODGE evades cleanly', () => {
  // Trigger a telegraph and stand inside it without dodging (pause periodic cleave so we measure telegraph impact cleanly)
  g.ev(`S.hp = maxHp(); pl.x = 0; pl.z = -4; PGRaid.raid.bossCleaveIn = 10; mobs.forEach(m => { m.at = 999; if(m.boss){m.x=0;m.z=-4;} });`);
  g.ev(`PGRaid.raid.telegraph = { name:'Soul Brand', kind:'brand', x:0, z:-4, r:3.8, age:2.35, life:2.4 }; PGRaid.raid.iframes = 0;`);
  const hpFull = g.ev(`S.hp`);
  g.ev(`PGRaid.tick(0.1)`);
  const hpAfterHit = g.ev(`S.hp`);
  assert.equal(hpFull - hpAfterHit, Math.floor(hpFull * 0.32), 'standing inside red telegraph deals balanced 32% maxHp');

  // Verify periodic Boss Cleave deals ~9% maxHp pressure on its own
  g.ev(`S.hp = maxHp(); PGRaid.raid.iframes = 0; PGRaid.raid.telegraph = null; PGRaid.raid.bossCleaveIn = 0.05; PGRaid.tick(0.1);`);
  assert.equal(hpFull - g.ev(`S.hp`), Math.max(1, Math.floor(hpFull * 0.09)), 'boss periodic cleave deals 9% maxHp');

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
  g.ev(`PGRaid.onSync({raidId:'raid:99',fromId:20,name:'Bob',cls:'Ranger',hp:0,maxHp:500000,dps:0,stage:0,dead:true})`);
  assert.equal(g.ev(`PGRaid.revive()`), true, 'living teammate starts 3s revive channel');
  g.ev(`for(let i=0;i<32;i++) PGRaid.tick(0.1);`);
  const revMsg = sent.find(m => m.type === 'raid_revive');
  assert.ok(revMsg && revMsg.target === 20 && revMsg.raidId === 'raid:99', 'sent raid_revive for Bob after 3s channel');

  // Now Alice goes down while Bob is alive -> Alice stays at 0 HP (no natural regen!) until Bob revives Alice
  g.ev(`S.hp = 0; PGRaid.tick(0.05);`);
  assert.equal(g.ev(`PGRaid.raid.dead`), true, 'Alice is downed, run continues while Bob lives');
  for (let i = 0; i < 30; i++) g.ev(`update(1/30); t += 1/30;`);
  assert.equal(g.ev(`S.hp`), 0, 'downed player stays at 0 HP (no passive regen while dead)');

  // Bob revives Alice!
  g.ev(`PGRaid.onRevive({raidId:'raid:99',reviveId:'raid:99:20:1',fromId:20,fromName:'Bob',target:10})`);
  assert.equal(g.ev(`PGRaid.raid.dead`), false, 'Alice revived by Bob');
  assert.equal(g.ev(`S.hp`), g.ev(`Math.ceil(maxHp() * 0.3)`), 'Alice restored to 30% maxHp');

  // Both Alice and Bob fall -> Party Wipe!
  g.ev(`S.hp = 0; PGRaid.tick(0.05);`);
  assert.equal(g.ev(`PGRaid.raid.on`), true, 'still alive while Bob is up');
  g.ev(`PGRaid.onSync({raidId:'raid:99',fromId:20,name:'Bob',cls:'Ranger',hp:0,maxHp:500000,dps:0,stage:0,dead:true})`);
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
  const startedMsg = alice.inbox.find(m => m.type === 'raid_started');
  assert.ok(startedMsg && startedMsg.raidId, 'raid_started includes raidId');
  assert.equal(bob.inbox.some(m => m.type === 'raid_started'), true);
  assert.equal(bystander.inbox.length, 0, 'zero broadcast to non-party players in plaza');
  const activeRid = startedMsg.raidId;

  // Raid Chat relays to both Alice & Bob, NOT Bystander
  now += 600;
  room.receive(bob.c, JSON.stringify({ type: 'raid_chat', text: 'Stack inside Eye of Abyss!' }));
  assert.equal(alice.inbox.some(m => m.type === 'raid_chat' && m.name === 'Bob' && m.text === 'Stack inside Eye of Abyss!'), true);
  assert.equal(bob.inbox.some(m => m.type === 'raid_chat' && m.text === 'Stack inside Eye of Abyss!'), true);
  assert.equal(bystander.inbox.length, 0, 'raid_chat never leaks to plaza bystander');

  // raid_sync carries dmgTaken, support & revives and is rate-limited inside 1500ms unless force:true
  bob.inbox.length = 0;
  room.receive(alice.c, JSON.stringify({ type: 'raid_sync', raidId: activeRid, hp: 800, maxHp: 1000, dps: 4500000, dmgTaken: 120000, support: 15000, revives: 0, stage: 1, dead: false }));
  room.receive(alice.c, JSON.stringify({ type: 'raid_sync', raidId: activeRid, hp: 750, maxHp: 1000, dps: 4600000, dmgTaken: 130000, support: 15000, revives: 0, stage: 1, dead: false }));
  const syncs1 = bob.inbox.filter(m => m.type === 'raid_sync');
  assert.equal(syncs1.length, 1, 'rapid unforced raid_sync throttled on DO');
  assert.equal(syncs1[0].dmgTaken, 120000, 'dmgTaken relayed on raid_sync');
  assert.equal(syncs1[0].support, 15000, 'support relayed on raid_sync');
  now += 2000;
  room.receive(alice.c, JSON.stringify({ type: 'raid_sync', raidId: activeRid, hp: 700, maxHp: 1000, dps: 4700000, dmgTaken: 150000, support: 20000, revives: 1, stage: 1, dead: false }));
  assert.equal(bob.inbox.filter(m => m.type === 'raid_sync').length, 2, 'sync passes after rate window');

  // raid_revive & raid_end
  room.receive(bob.c, JSON.stringify({ type: 'raid_revive', raidId: activeRid, reviveId: activeRid + ':2:1', target: 1 }));
  assert.equal(alice.inbox.some(m => m.type === 'raid_revive' && m.target === 1 && m.fromName === 'Bob' && m.revivesLeft === 2), true);
  room.receive(alice.c, JSON.stringify({ type: 'raid_end', raidId: activeRid, cleared: true, reason: 'boss_down', secs: 420, dps: 5100000, dmgTaken: 185000, support: 25000, revives: 0 }));
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
  g.ev(`PGRaid.onSync({raidId:PGRaid.raid.raidId,fromId:20,name:'Bob',cls:'Arch Bishop',hp:400000,maxHp:420000,dps:850000,dmgTaken:65000,support:310000,revives:1,stage:3,dead:false});`);
  g.ev(`PGRaid.onSync({raidId:PGRaid.raid.raidId,fromId:30,name:'Cara',cls:'Warlock',hp:310000,maxHp:350000,dps:9800000,dmgTaken:95000,support:5000,revives:0,stage:3,dead:false});`);

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

  // Advance through Stages 1-3 into Stage 4 Sanctum of Ifrit (walking continuously along the volcanic causeway!)
  for (let s = 0; s < 3; s++) {
    g.ev(`while(mobs.length) kill(mobs[0]);`);
    for (let i = 0; i < 110 && g.ev(`PGRaid.raid.stage === ${s}`); i++) {
      g.ev(`if(!tickAstralJourney(1/30))update(1/30);t+=1/30;`);
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

// 13. Map -> Dungeons Full-Width Layout, Left Boss Preview & Party Banner Image Existence
check('Map -> Dungeons overrides 220px grid with flex layout, renders Left Boss Preview, and all Party/Dungeon banners exist locally', () => {
  assert.match(raidCss, /#wins\s+\.ui-panel\[data-layout="map"\]\s+\.dungeons-panel[\s\S]*?display:\s*flex\s*!important/, 'raid.css overrides Map .ui-content 220px grid on .dungeons-panel');

  // Verify every dungeon banner & thumb in PGRaid.DUNGEONS and RAID_DUNGEON_CARDS exists on disk
  const pathsToVerify = g.ev(`[
    ...Object.values(PGRaid.DUNGEONS).flatMap(d => [d.img, d.banner]),
    ...RAID_DUNGEON_CARDS.flatMap(d => [d.img, typeof d.bossSprite === 'string' ? d.bossSprite : null, d.bossFallback])
  ].filter(Boolean)`);
  for (const rel of pathsToVerify) {
    const cleanPath = String(rel).split('?')[0];
    assert.ok(fs.existsSync(path.join(ROOT, cleanPath)), `dungeon/boss asset exists on disk: ${cleanPath}`);
  }

  // Open Map -> Dungeons and check .raid-left-col (map options only) + right-pane .raid-mvp-header for all 3 dungeons
  g.ev(`if (!tabs.includes('map')) openTab('map'); ACT.mapseason('dungeons'); ACT.dungeonmode('raid');`);
  for (const id of ['astral', 'thor', 'abyss']) {
    g.ev(`ACT.raiddungeon('${id}');`);
    const previewInfo = g.ev(`({
      hasLeftCol: !!document.querySelector('.dungeons-panel .raid-left-col'),
      hasListInLeft: !!document.querySelector('.dungeons-panel .raid-left-col .raid-dungeon-list'),
      noLeftBossPreview: !document.querySelector('.dungeons-panel .raid-left-col .raid-boss-preview-card'),
      hasRightMvpHeader: !!document.querySelector('.dungeons-panel .raid-dungeon-detail .raid-mvp-header'),
      bossTitle: document.querySelector('.raid-mvp-header h3')?.textContent || '',
      imgSrc: document.querySelector('.raid-mvp-header .raid-boss-stage img')?.getAttribute('src') || ''
    })`);
    assert.equal(previewInfo.hasLeftCol, true, `${id}: .raid-left-col rendered`);
    assert.equal(previewInfo.hasListInLeft, true, `${id}: dungeon list inside .raid-left-col`);
    assert.equal(previewInfo.noLeftBossPreview, true, `${id}: left column holds Raid option maps only`);
    assert.equal(previewInfo.hasRightMvpHeader, true, `${id}: MVP Boss Preview & Info rendered on right top header`);
    assert.ok(previewInfo.bossTitle.length > 3 && previewInfo.imgSrc.length > 3, `${id}: MVP header displays boss title & sprite`);
  }

  // Verify Party Ready Room banner img src resolves to an existing local asset
  g.ev(`ACT.raidparty('astral');`);
  const lobbyBanner = g.ev(`document.querySelector('#raidLobby .raid-party-banner img, #raidLobby img')?.getAttribute('src') || ''`).split('?')[0];
  assert.ok(lobbyBanner && fs.existsSync(path.join(ROOT, lobbyBanner)), `Party Ready Room banner exists: ${lobbyBanner}`);
  g.ev(`PGRaid.hideLobby();`);
});

// 14. Stage 2 Stuck-Mobs & Pull-Back Fix + Instant Post-Dodge Auto-Attack + Movement-Direction Facing
check('Stage 2 Fallen Arcade keeps all mobs provoked without pull-back, Dodge attacks immediately, and hero faces movement direction', () => {
  g.ev(`S.gm = true; S.raid = { day: trialDay(), used: 0 }; PGRaid.startDirectSolo('astral');`);
  // Clear Stage 1 -> advance to Stage 2 (Fallen Arcade)
  g.ev(`while(mobs.length) kill(mobs[0]);`);
  for (let i = 0; i < 90 && g.ev(`PGRaid.raid.stage === 0`); i++) {
    g.ev(`if(!tickAstralJourney(1/30))update(1/30);t+=1/30;`);
  }
  assert.equal(g.ev(`PGRaid.raid.stage`), 1, 'entered Stage 2 (2/4 · Fallen Arcade)');
  assert.ok(g.ev(`mobs.length >= 6 && mobs.every(m => m.provokeUntil > t)`), 'all Stage 2 mobs spawn permanently provoked');

  // Kill the initial pack and move hero deep into the arcade (z = -4), then release WASD:
  // Remaining Stage 2 packs MUST stay provoked & engaged, and hero MUST NOT get pulled back to z = 10.5!
  g.ev(`
    const firstPack = activePack;
    for (const m of mobs.slice()) { if (m.pack === firstPack && mobs.length > 3) kill(m); }
    pl.x = 0; pl.z = -4.0;
    PGRaid.raid.keys.w = true; update(0.1); t += 0.1;
    PGRaid.raid.keys.w = false;
  `);
  for (let i = 0; i < 30; i++) {
    g.ev(`S.hp = maxHp(); update(0.1); t += 0.1;`);
  }
  const st2After = g.ev(`({
    alive: mobs.length,
    allProvoked: mobs.every(m => m.provokeUntil > t),
    hasTarget: !!mob,
    plZ: pl.z
  })`);
  assert.equal(st2After.allProvoked, true, 'remaining Stage 2 mobs stay provoked across ticks');
  assert.equal(st2After.hasTarget, true, 'hero automatically acquires next Stage 2 pack without stalling');
  assert.ok(st2After.plZ < 8.5, `hero was NOT pulled back to spawn (pl.z=${st2After.plZ.toFixed(2)})`);

  // Test instant post-dodge auto-attack when no telegraph is active:
  g.ev(`
    PGRaid.raid.telegraph = null;
    PGRaid.raid.dodgeCd = 0;
    const nearMob = mobs[0];
    nearMob.x = 0; nearMob.z = -2.0;
    pl.x = 0; pl.z = 3.6;
    PGRaid.raid.keys.w = true;
    PGRaid.dodge();
    PGRaid.raid.keys.w = false;
  `);
  assert.equal(g.ev(`PGRaid.raid.moveTarget`), null, 'Dodge outside telegraph does not lock moveTarget for 1.4s');
  assert.ok(g.ev(`!!mob && pAtkT <= 0.05`), 'Dodge immediately primes nearest mob & attack timer');

  // Test movement-direction sprite facing even while a mob is targeted behind the hero:
  g.ev(`
    mobs[0].x = 0; mobs[0].z = -6; mob = mobs[0]; // Mob is North (-Z)
    pl.x = 0; pl.z = 0;
    PGRaid.raid.keys.s = true; // Player runs South (+Z -> atan2(+1, 0) = +PI/2)
    update(0.1); t += 0.1;
  `);
  const runFace = g.ev(`({ run: pl.run, pFace: pl.run ? -pl.ry : Math.atan2(mob.z - pl.z, mob.x - pl.x) })`);
  assert.equal(runFace.run, true, 'hero is running South while repositioning');
  assert.ok(Math.abs(runFace.pFace - Math.PI / 2) < 0.25, `hero sprite faces South movement direction (+PI/2), got ${runFace.pFace.toFixed(2)}`);
  g.ev(`PGRaid.raid.keys.s = false; PGRaid.leave(); PGRaid.hideResult();`);
});

// 15. 40M DPS @ ★0 Raid Scaling, 50% Boss Armor, 2p/3p Party Buff & ★0-★20 Weapon Star System
check('40M DPS @ ★0 Boss HP + 50% Raid Armor, 2p/3p Party HP+ATK buffs, and ★0-★20 Weapon Star Workshop + Shard Boosts', () => {
  // Verify 1p vs 2p vs 3p HP & ATK scaling on Astral Raid
  const scaling = g.ev(`(() => {
    const measure = (members) => {
      if (members.length === 1) PGRaid.startDirectSolo('astral');
      else PGRaid.onStarted({ dungeonId: 'astral', raidId: 'scale_' + members.length, seed: 77, members });
      const st1Hp = mobs[0].max, st1Atk = mobs[0].atk;
      PGRaid.raid.stage = 2; while (mobs.length) kill(mobs[0]);
      for (let i = 0; i < 90 && PGRaid.raid.stage === 2; i++) { if (!tickAstralJourney(1/30)) update(1/30); t += 1/30; }
      const boss = mobs.find(m => m.boss), esc = mobs.find(m => !m.boss);
      const res = { st1Hp, st1Atk, bossHp: boss.max, bossAtk: boss.atk, bossArmor: boss.raidArmor, escHp: esc.max };
      PGRaid.leave(); PGRaid.hideResult();
      return res;
    };
    const p1 = measure([{ id: 'self1', name: 'A' }]);
    PGRaid.startDirectSolo('astral'); const selfId = PGRaid.raid.party[0].id; PGRaid.leave(); PGRaid.hideResult();
    const p2 = measure([{ id: selfId, name: 'A' }, { id: 'u2', name: 'B' }]);
    const p3 = measure([{ id: selfId, name: 'A' }, { id: 'u2', name: 'B' }, { id: 'u3', name: 'C' }]);
    return { p1, p2, p3 };
  })()`);
  assert.equal(scaling.p1.bossArmor, 0.50, 'Stage 4 Raid Boss carries 50% Raid Armor (0.50)');
  assert.ok(scaling.p1.bossHp > 8.5e8 && scaling.p1.bossHp < 1.0e9, `Solo Astral Boss raw HP after -30% rebalance (~907.8M, got ${scaling.p1.bossHp})`);
  assert.ok(scaling.p1.st1Hp > 3.1e7 && scaling.p1.st1Hp < 3.5e7, `Solo Astral Stage 1 mob HP at previous+120% (2.2x = ~33.0M, got ${scaling.p1.st1Hp})`);
  assert.ok(Math.abs(scaling.p2.bossHp / scaling.p1.bossHp - 2.25) < 0.02, '2p Party buffs Boss HP by 2.25x');
  assert.ok(Math.abs(scaling.p3.bossHp / scaling.p1.bossHp - 3.45) < 0.02, '3p Party buffs Boss HP by 3.45x');
  assert.ok(Math.abs(scaling.p2.st1Hp / scaling.p1.st1Hp - 2.25) < 0.02, '2p Party buffs Stage 1-3 mob HP by 2.25x');
  assert.ok(Math.abs(scaling.p2.bossAtk / scaling.p1.bossAtk - 1.32) < 0.02 && Math.abs(scaling.p3.bossAtk / scaling.p1.bossAtk - 1.58) < 0.02, '2p/3p Party buffs Boss & mob ATK (1.32x / 1.58x)');

  // Verify 20-row WEAPON_STAR_TABLE pacing with Round-6 base rates
  const expShards = g.ev(`WEAPON_STAR_TABLE.reduce((sum, r) => sum + r[2] / (r[1] / 100), 0)`);
  assert.equal(g.ev(`WEAPON_STAR_TABLE.length`), 20, '20 Weapon Star tiers defined');
  assert.ok(expShards >= 1150 && expShards <= 1250, `expected unboosted ★0->★20 shards=${Math.round(expShards)} (~24.5 days @ 48/day)`);

  // Verify applyStarAndBossArmor math at ★0, ★10, ★20 vs Normal Mob and 50%-Armor Raid Boss
  const dmgChecks = g.ev(`(() => {
    S.eq.weapon = { id: 99100, name: 'Starfall Katar', slot: 'weapon', wt: 'katar', sec: 6, ascSet: 'starfall', val: 420, r: 15, aff: [], cards: [], slots: 4 };
    if (S.eq.off) S.eq.off = null;
    const normalMob = { hp: 1e9, max: 1e9 };
    const raidBoss = { hp: 1e9, max: 1e9, raidArmor: 0.50 };
    const at0 = [applyStarAndBossArmor(normalMob, 1000), applyStarAndBossArmor(raidBoss, 1000)];
    S.eq.weapon.stars = 10;
    const at10 = [applyStarAndBossArmor(normalMob, 1000), applyStarAndBossArmor(raidBoss, 1000)];
    S.eq.weapon.stars = 20;
    const at20 = [applyStarAndBossArmor(normalMob, 1000), applyStarAndBossArmor(raidBoss, 1000)];
    delete S.eq.weapon.stars;
    return { at0, at10, at20 };
  })()`);
  assert.deepEqual([...dmgChecks.at0], [1000, 500], '★0: 1000 vs normal mob, 500 vs 50%-Armor Raid Boss');
  assert.deepEqual([...dmgChecks.at10], [1200, 840], '★10 (+20% DMG, +20% Pen -> 30% Armor): 1200 normal, 840 Raid Boss (1.68x vs ★0)');
  assert.deepEqual([...dmgChecks.at20], [1400, 1260], '★20 (+40% DMG, +40% Pen -> 10% Armor): 1400 normal, 1260 Raid Boss (2.52x vs ★0)');

  // Verify [ 1 | 2 ] Refine Workshop toggle, +10/+15/+20/+25% Astral Shard boosts, Never-Downgrades & N+ -> Mythic evolution preservation
  g.ev(`
    S.zeny = 500000000;
    S.ascensionMat = [200, 200, 50];
    selE = 'weapon';
    if (!tabs.includes('equip')) openTab('equip');
    sub.equip = 'refine';
    renderWin();
  `);
  assert.equal(g.ev(`document.querySelectorAll('.eclipse-refine-mode-switch [data-a="refinemode"]').length`), 2, '1 | 2 mode toggle buttons rendered above #eclipseRefineResult');
  g.ev(`ACT.refinemode('star');`);
  assert.ok(g.ev(`!!document.querySelector('.star-boost-card') && !!document.querySelector('[data-a="starup"]') && document.querySelectorAll('.star-rate-table tbody tr').length === 20`), 'Mode 2 renders Star Workshop, Shard Boost selector & 20-row table');

  // Test +15% Boost (tier 5) at ★0 -> ★1 (50% + 15% = 65%, spends 3 base + 5 boost = 8 Astral Shards & 2M Zeny)
  g.ev(`ACT.starboost('5');`);
  const shBefore = g.ev(`S.ascensionMat[0]`), zBefore = g.ev(`S.zeny`);
  g.ev(`{ const oldR = Math.random; Math.random = () => 0.10; ACT.starup('weapon'); Math.random = oldR; }`);
  assert.equal(g.ev(`S.eq.weapon.stars`), 1, 'weapon upgraded to ★1');
  assert.equal(g.ev(`${shBefore} - S.ascensionMat[0]`), 8, 'spent 3 base + 5 boost = 8 Astral Shards');
  assert.equal(g.ev(`${zBefore} - S.zeny`), 2000000, 'spent 2,000,000 Zeny');
  assert.match(g.ev(`iname(S.eq.weapon)`), /★1$/, 'iname appends ★1');
  assert.equal(g.ev(`autoSellReason({ ...S.eq.weapon, id: 999888 })`), 'Starred weapon', 'auto-sell protects starred weapons when unequipped');
  assert.match(g.ev(`V.stats()`), /Overall DMG <b>\+2%<\/b>[\s\S]*Armor Pen <b>\+2%<\/b>/, 'Stats sheet displays Overall DMG & Armor Pen');

  // Test Failure NEVER downgrades stars!
  g.ev(`S.eq.weapon.stars = 15; ACT.starboost('0'); const oldRnd = Math.random; Math.random = () => 0.9999; ACT.starup('weapon'); Math.random = oldRnd;`);
  assert.equal(g.ev(`S.eq.weapon.stars`), 15, 'failed ★15 -> ★16 attempt NEVER downgrades ★15');

  // Test N+ weapon evolving to Mythic preserves .stars AND cloud save pack/unpack preserves .stars!
  const preserved = g.ev(`(() => {
    S.zeny = 9e9; S.ascensionMat = [500, 500, 500]; S.ore.ori = 500; S.ore.elu = 500;
    const wt = (C().wt || [])[0] || 'katar';
    const nPlus = { id: 99101, name: 'Nightmare+ Weapon', slot: 'weapon', wt, sec: 5, mp: 10, tier: 4, val: 350, r: 10, stars: 12, aff: [{ k: 'str', v: 10 }, { k: 'crit', v: 8 }, { k: 'atk', v: 12 }], cards: [], slots: 3 };
    S.inv.push(nPlus);
    const res = transformToMythic(nPlus, Object.keys(ASC_SETS)[0]);
    const roundTrip = unpackSave(packSave(S));
    return { err: res?.error || '', evolvedStars: nPlus.stars, evolvedSec: nPlus.sec, savedWeaponStars: roundTrip.eq.weapon.stars };
  })()`);
  assert.equal(preserved.err, '', 'transformToMythic succeeded cleanly');
  assert.equal(preserved.evolvedSec, 6, 'N+ weapon evolved to sec=6 Mythic');
  assert.equal(preserved.evolvedStars, 12, 'evolving N+ weapon to Mythic preserves ★12');
  assert.equal(preserved.savedWeaponStars, 15, 'packSave/unpackSave preserves weapon stars');
  g.ev(`ACT.refinemode('refine'); ACT.starboost('0');`);
});

// 16. Round-6: Weapon Star Base Success Rates (50% ★1-3, 40% ★4-7, 35..7% ★8-20) & Nerfed Shard Boosts (5, 7, 10, 12, 15%)
check('Round-6: WEAPON_STAR_TABLE & WEAPON_STAR_BOOSTS match exact nerfed base rates and +5/+7/+10/+12/+15% shard boost tiers', () => {
  const rates = g.ev(`WEAPON_STAR_TABLE.map(r => r[1])`);
  const boosts = g.ev(`WEAPON_STAR_BOOSTS`);
  const boostCols = g.ev(`WEAPON_STAR_TABLE.every(r => Array.isArray(r[4]) && r[4].length === 5)`);
  assert.deepEqual(
    [...rates],
    [50, 50, 50, 40, 40, 40, 40, 35, 35, 30, 30, 25, 25, 25, 22, 20, 15, 12, 10, 7],
    'exact 20-tier base success rate curve matches owner specification'
  );
  assert.deepEqual([...boosts], [0, 5, 7, 10, 12, 15], 'Astral Shard boost tiers nerfed to +5%, +7%, +10%, +12%, +15%');
  assert.equal(boostCols, true, 'all 20 star rows define 5-tier extra Astral Shard costs');
});

// 17. Round-5: 1-Second RO Blacksmith Forge Delay, Hammer/Anvil FX, Success/Failure FX & CombatAudio SFX
check('Round-5: 1.0s RO Forge delay runs Hammer/Anvil strike, CombatAudio ting-ting + result fanfare/shatter, and Workshop + 3D FX for both Refine and Star Refine', () => {
  const res = g.ev(`(() => {
    const origSetTimeout = window.setTimeout;
    let queued = [];
    window.setTimeout = (fn, ms) => { const id = queued.length + 1; queued.push({ id, fn, ms }); return id; };
    window.__PG_FORGE_DELAY_MS = 1000;
    try {
      S.zeny = 9e9; S.ore.ori = 1000; S.ascensionMat = [500, 500, 100]; S.sfx = true;
      S.eq.weapon = { id: 99501, name: 'Starfall Katar', slot: 'weapon', wt: 'katar', sec: 6, ascSet: 'starfall', val: 420, r: 5, stars: 2, aff: [], cards: [], slots: 4 };
      selE = 'weapon';
      if (!tabs.includes('equip')) openTab('equip');
      sub.equip = 'refine';
      refineMode = 'refine';
      renderWin();

      const oldR = Math.random;
      Math.random = () => 0.01;
      ACT.refine('weapon');
      const midRefineRank = S.eq.weapon.r;
      const midRefineAudio = CombatAudio.lastForgeEvent?.kind;
      const refineDelayMs = queued.find(q => q.ms === 1000)?.ms;
      const midRefineHasForging = Boolean(document.querySelector('#eclipseRefineResult.refine-forging .ro-forge-fx.is-forging .ro-forge-hammer'));
      const midRefineBtnDisabled = Boolean(document.querySelector('[data-a="refine"]')?.disabled);
      // Duplicate clicks during the 1s strike must be ignored
      ACT.refine('weapon');
      const refineTimerFn = queued.find(q => q.ms === 1000).fn;
      queued = [];
      refineTimerFn();
      const afterRefineRank = S.eq.weapon.r;
      const afterRefineAudio = CombatAudio.lastForgeEvent?.kind;
      const afterRefineSuccessFx = Boolean(document.querySelector('#eclipseRefineResult.refine-success .ro-forge-fx.is-success .ro-success-starburst'));
      const fieldFxSuccess = Boolean(roForgeFieldFx && roForgeFieldFx.userData.succeeded === true);

      // Now test Star Refine 1.0s delay + Failure FX & Shatter Audio
      ACT.refinemode('star');
      Math.random = () => 0.999;
      queued = [];
      ACT.starup('weapon');
      const midStarCount = S.eq.weapon.stars;
      const midStarAudio = CombatAudio.lastForgeEvent?.kind;
      const midStarIsStar = CombatAudio.lastForgeEvent?.isStar;
      const starDelayMs = queued.find(q => q.ms === 1000)?.ms;
      const midStarHasForging = Boolean(document.querySelector('#eclipseRefineResult.refine-forging .ro-forge-fx.is-forging .ro-forge-hammer'));
      const midStarBtnDisabled = Boolean(document.querySelector('[data-a="starup"]')?.disabled);
      const starTimerFn = queued.find(q => q.ms === 1000).fn;
      queued = [];
      starTimerFn();
      const afterStarCount = S.eq.weapon.stars;
      const afterStarAudio = CombatAudio.lastForgeEvent?.kind;
      const afterStarFailFx = Boolean(document.querySelector('#eclipseRefineResult.refine-failure .ro-forge-fx.is-failure .ro-fail-cracks'));
      const fieldFxFail = Boolean(roForgeFieldFx && roForgeFieldFx.userData.succeeded === false);

      Math.random = oldR;
      return {
        midRefineRank, midRefineAudio, refineDelayMs, midRefineHasForging, midRefineBtnDisabled,
        afterRefineRank, afterRefineAudio, afterRefineSuccessFx, fieldFxSuccess,
        midStarCount, midStarAudio, midStarIsStar, starDelayMs, midStarHasForging, midStarBtnDisabled,
        afterStarCount, afterStarAudio, afterStarFailFx, fieldFxFail
      };
    } finally {
      delete window.__PG_FORGE_DELAY_MS;
      forgePending = null;
      window.setTimeout = origSetTimeout;
    }
  })()`);
  assert.equal(res.midRefineRank, 5, 'rank unchanged during 1.0s anvil strike');
  assert.equal(res.refineDelayMs, 1000, 'Refine schedules exact 1000ms delay');
  assert.equal(res.midRefineAudio, 'start', 'CombatAudio.forgeStart fires on Refine click');
  assert.equal(res.midRefineHasForging, true, 'RO Hammer & Anvil SVG overlay renders during 1s Refine delay');
  assert.equal(res.midRefineBtnDisabled, true, 'Refine button disabled during 1s strike');
  assert.equal(res.afterRefineRank, 6, 'rank advances +5 -> +6 at 1.0s reveal');
  assert.equal(res.afterRefineAudio, 'success', 'CombatAudio.forgeResult(true) plays RO success fanfare');
  assert.equal(res.afterRefineSuccessFx, true, 'RO Golden Starburst & Light Pillar render on Refine success');
  assert.equal(res.fieldFxSuccess, true, '3D hero golden refine pillar spawns on field');

  assert.equal(res.midStarCount, 2, 'star count unchanged during 1.0s anvil strike');
  assert.equal(res.starDelayMs, 1000, 'Star Refine schedules exact 1000ms delay');
  assert.equal(res.midStarAudio, 'start', 'CombatAudio.forgeStart fires on Star Refine click');
  assert.equal(res.midStarIsStar, true, 'Star Refine passes isStar=true to CombatAudio');
  assert.equal(res.midStarHasForging, true, 'RO Hammer & Anvil SVG overlay renders during 1s Star delay');
  assert.equal(res.midStarBtnDisabled, true, 'Star Upgrade button disabled during 1s strike');
  assert.equal(res.afterStarCount, 2, 'failed Star Refine keeps ★2 safely at 1.0s reveal');
  assert.equal(res.afterStarAudio, 'failure', 'CombatAudio.forgeResult(false) plays RO failure shatter');
  assert.equal(res.afterStarFailFx, true, 'RO Crimson Cracks & Smoke render on Star Refine failure');
  assert.equal(res.fieldFxFail, true, '3D hero crimson shatter burst spawns on field');
});

// 18. Round-5: 5 Exclusive Cosmetic Raid Titles (10/20/30 Clears + 2x 10% Raid Drops) & 5-Color 3D Static Electric FX
check('Round-5: 5 Exclusive Raid Titles unlock via 10/20/30 clears and 10% Raid Boss drops, stay purely cosmetic, and render 5 distinct 3D static electric colors', () => {
  const out = g.ev(`(() => {
    S.titleAwards = []; S.equippedTitle = null;
    S.raid = { day: trialDay(), used: 0, clears: 0, bestSolo: 0, bestParty: 0 };
    const raidTitles = PGTitles.RAID_TITLES;
    const colors = raidTitles.map(t => t.electricColor);
    const critBefore = indexCrit();

    // 10 clears -> Raid Vanguard only
    S.raid.clears = 10; PGTitles.sync(S, CLASSES);
    const at10 = S.titleAwards.filter(id => raidTitles.some(t => t.id === id));
    // 20 clears -> Raid Vanguard + Citadel Breaker
    S.raid.clears = 20; PGTitles.sync(S, CLASSES);
    const at20 = S.titleAwards.filter(id => raidTitles.some(t => t.id === id));
    // 30 clears -> all 3 milestone titles, still NOT the 2 drop-only titles!
    S.raid.clears = 30; PGTitles.sync(S, CLASSES);
    const at30 = S.titleAwards.filter(id => raidTitles.some(t => t.id === id));

    // Simulate 10% Raid Boss drops by forcing Math.random = 0.05 across two Raid clears
    const oldR = Math.random;
    Math.random = () => 0.05;
    PGRaid.start('solo', 'astral'); PGRaid.finish(true, 'Thanatos defeated!', false);
    PGRaid.start('solo', 'thor'); PGRaid.finish(true, 'Ifrit defeated!', false);
    Math.random = oldR;
    const afterDrops = S.titleAwards.filter(id => raidTitles.some(t => t.id === id));

    // Equip each of the 5 Raid Titles and verify 3D raidElectricAura builds with its distinct color & zero stat mutation
    if (!heroSpr) heroSpr = { visible: true, userData: {} };
    heroSpr.visible = true;
    const auraColors = [];
    for (const rt of raidTitles) {
      ACT.titleequip(rt.id);
      syncRaidElectricAura();
      auraColors.push({
        id: rt.id,
        visible: Boolean(raidElectricAura && raidElectricAura.visible),
        color: raidElectricAura?.userData?.color || null,
        hasBolts: Boolean(raidElectricAura?.userData?.outerBolts && raidElectricAura?.userData?.coreBolts),
        critUnchanged: indexCrit() === critBefore
      });
    }
    ACT.titleequip('none');
    syncRaidElectricAura();
    const hiddenWhenUnequipped = !raidElectricAura || raidElectricAura.visible === false;
    return { count: raidTitles.length, uniqueColors: new Set(colors).size, at10, at20, at30, afterDrops, auraColors, hiddenWhenUnequipped };
  })()`);
  assert.equal(out.count, 5, '5 Exclusive Raid Titles defined');
  assert.equal(out.uniqueColors, 5, '5 distinct static electric colors');
  assert.deepEqual([...out.at10], ['raid-vanguard'], '10 Raid clears unlocks Raid Vanguard');
  assert.deepEqual([...out.at20], ['raid-vanguard', 'citadel-breaker'], '20 Raid clears unlocks Citadel Breaker');
  assert.deepEqual([...out.at30], ['raid-vanguard', 'citadel-breaker', 'sovereign-conqueror'], '30 Raid clears unlocks Sovereign Conqueror without granting drop-only titles');
  assert.equal(out.afterDrops.length, 5, 'both 10% Raid Boss drop titles (Astral Stormbringer & Volcanic Overlord) drop on Raid clears');
  assert.ok(out.auraColors.every(a => a.visible && a.hasBolts && a.critUnchanged), 'all 5 Raid Titles activate 3D static lightning bolts and remain purely cosmetic');
  assert.equal(new Set(out.auraColors.map(a => a.color)).size, 5, 'each Raid Title switches raidElectricAura to its unique color');
  assert.equal(out.hiddenWhenUnequipped, true, 'removing Raid Title hides 3D static electric FX');
});

// 19. Round-5: 2 Mergeable Raid Boss Accessory Cards (ATK +15% & MATK +15%, 10% Drop, Cloud Save Safe)
check('Round-5: Primordial Ifrit Card (ATK +15%) & Sovereign Thanatos Card (MATK +15%) fit Accessories, merge up to ★★★, drop at 10%, and survive cloud saves', () => {
  const cardRes = g.ev(`(() => {
    S.cards = [];
    S.eq.acc1 = { id: 99601, name: 'Starfall Ring', slot: 'acc', sec: 6, ascSet: 'starfall', val: 180, r: 10, aff: [], cards: [], slots: 2 };
    S.eq.acc2 = { id: 99602, name: 'Zenith Ring', slot: 'acc', sec: 6, ascSet: 'zenith', val: 180, r: 10, aff: [], cards: [], slots: 2 };
    const baseAtk = atk(), baseMatk = matk();

    // Verify 10% Raid Boss drop adds a Raid Boss Accessory Card
    const oldR = Math.random;
    Math.random = () => 0.04; // < 0.10 triggers drop, 0.04 * 2 -> index 0 (Primordial Ifrit Card)
    PGRaid.start('solo', 'thor');
    PGRaid.finish(true, 'Ifrit defeated!', false);
    Math.random = oldR;
    const droppedName = PGRaid.raid.result.rewards.bossCardDrop;
    const droppedInBag = S.cards.some(c => c.cardKey === 'raid:atk');

    // Grant 9 more copies of raid:atk (total 10 = 1 base + 1 + 3 + 5 donors) and merge 0 -> ★ -> ★★ -> ★★★
    const atkDef = RAID_BOSS_CARDS.find(c => c.cardKey === 'raid:atk');
    const matkDef = RAID_BOSS_CARDS.find(c => c.cardKey === 'raid:matk');
    for (let i = 0; i < 9; i++) addCard(newCard(atkDef), { quiet: true });
    const mainAtk = S.cards.find(c => c.cardKey === 'raid:atk');
    for (let step = 0; step < 3; step++) {
      mergeCard(mainAtk.id);
      if (typeof modalYes === 'function') modalYes();
      else document.getElementById('my')?.click();
    }
    const mergedStars = mainAtk.stars;
    const mergedEffect = cardEffects(mainAtk)[0].v; // 15 * 1.15 = 17.25

    // Socket ★★★ Primordial Ifrit Card into acc1 and Sovereign Thanatos Card into acc2
    const mainMatk = newCard(matkDef);
    addCard(mainMatk, { quiet: true });
    const fitsWeapon = cardFits(mainAtk, S.eq.weapon);
    const fitsAcc = cardFits(mainAtk, S.eq.acc1) && cardFits(mainMatk, S.eq.acc2);
    ACT.sock(mainAtk.id + ':acc1');
    ACT.sock(mainMatk.id + ':acc2');
    const boostedAtk = atk(), boostedMatk = matk();

    // Verify loose Raid Boss Cards are protected from sellallcards & Card Mastery consumption, and survive packSave/unpackSave + repairProgression
    const extraLoose = newCard(matkDef);
    addCard(extraLoose, { quiet: true });
    const cannotDonate = donateCardToMastery(extraLoose.id) === null;
    const unpacked = repairProgression(unpackSave(packSave(S)), PROGRESSION_VERSION);
    const savedSocketAtk = unpacked.eq.acc1.cards[0];
    const savedLooseMatk = unpacked.cards.find(c => c.cardKey === 'raid:matk');

    return {
      droppedName, droppedInBag, mergedStars, mergedEffect,
      fitsWeapon, fitsAcc, atkGrew: boostedAtk > baseAtk, matkGrew: boostedMatk > baseMatk,
      cannotDonate,
      savedSocketStars: savedSocketAtk?.stars,
      savedSocketKey: savedSocketAtk?.cardKey,
      savedLooseNotLegacy: Boolean(savedLooseMatk && !savedLooseMatk.legacy && savedLooseMatk.fit.includes('acc'))
    };
  })()`);
  assert.equal(cardRes.droppedName, 'Primordial Ifrit Card', '10% Raid Boss drop awards Raid Boss Accessory Card');
  assert.equal(cardRes.droppedInBag, true, 'dropped Raid Boss Card stored in S.cards');
  assert.equal(cardRes.mergedStars, 3, 'Raid Boss Card merges cleanly through ★ -> ★★ -> ★★★ (consuming 1+3+5 = 9 copies)');
  assert.equal(cardRes.mergedEffect, 17.25, '★★★ Primordial Ifrit Card scales 15% * 1.15 = 17.25% ATK');
  assert.equal(cardRes.fitsWeapon, false, 'Raid Boss Accessory Card does not fit weapons');
  assert.equal(cardRes.fitsAcc, true, 'both Raid Boss Cards fit Accessories');
  assert.equal(cardRes.atkGrew, true, 'socketing Primordial Ifrit Card increases ATK');
  assert.equal(cardRes.matkGrew, true, 'socketing Sovereign Thanatos Card increases MATK');
  assert.equal(cardRes.cannotDonate, true, 'Raid Boss Cards cannot be accidentally consumed in Card Mastery');
  assert.equal(cardRes.savedSocketStars, 3, 'socketed ★★★ Raid Boss Card survives cloud save codec');
  assert.equal(cardRes.savedSocketKey, 'raid:atk', 'socketed Raid Boss Card retains cardKey across cloud save codec');
  assert.equal(cardRes.savedLooseNotLegacy, true, 'loose Raid Boss Card stays valid & non-legacy across repairProgression');
});

// 20. Round-5: GM Tools Raid Controls (Materials, Stars, Raid Boss Cards, Clears & 5-Color Electric Title Equip)
check('Round-5: GM Tools grant Raid materials, Weapon Stars, Raid Boss Accessory Cards, Raid clears, and one-click 5-color Raid Titles', () => {
  const gmOut = g.ev(`(() => {
    S.gm = true; S.cards = []; S.ascensionMat = [0, 0, 0]; S.titleAwards = []; S.equippedTitle = null;
    ACT.gmraidmat('0:1000'); ACT.gmraidmat('1:100'); ACT.gmraidmat('2:100');
    ACT.gmstars('7');
    ACT.gmraidcard('raid:atk:10');
    ACT.gmraidcard('raid:matk:max');
    ACT.gmraidtitle('volcanic-overlord');
    const equippedId = S.equippedTitle;
    const panelHtml = gmToolsPanel();
    return {
      mats: [...S.ascensionMat],
      stars: S.eq.weapon.stars,
      atkCards: S.cards.filter(c => c.cardKey === 'raid:atk').length,
      maxMatk: S.cards.some(c => c.cardKey === 'raid:matk' && c.stars === 3),
      equippedId,
      hasButtons: panelHtml.includes('gmraidtitle') && panelHtml.includes('gmraidcard') && panelHtml.includes('gmraidmat')
    };
  })()`);
  assert.deepEqual([...gmOut.mats], [1000, 100, 100], 'GM Raid material buttons grant Astral Shards, Primal Catalysts & Sigils');
  assert.equal(gmOut.stars, 7, 'GM Weapon ★7 button sets weapon stars');
  assert.equal(gmOut.atkCards, 10, 'GM +10 Primordial Ifrit Cards button grants full merge set');
  assert.equal(gmOut.maxMatk, true, 'GM +1 ★★★ Sovereign Thanatos Card button grants maxed card');
  assert.equal(gmOut.equippedId, 'volcanic-overlord', 'GM Raid Title button unlocks and equips Volcanic Overlord immediately');
  assert.equal(gmOut.hasButtons, true, 'gmToolsPanel renders all Raid testing controls');
});

// 21. Round-6: Official RO Refine Sprites (<aside>), Minimal 3D Ribbon Static FX, & No-Scroll Raid Dungeon Layout
check('Round-6: <aside class="ro-forge-fx"> uses official RO sprites, 3D electric aura uses contrast-backed 3-arc ribbons, and Raid UI places MVP preview on right header', () => {
  const r6 = g.ev(`(() => {
    const f1 = roForgeFxElement('forging'), f2 = roForgeFxElement('success'), f3 = roForgeFxElement('failure');
    const isAside = f1.tagName === 'ASIDE' && f2.tagName === 'ASIDE' && f3.tagName === 'ASIDE';
    const hasRoSprites = Boolean(
      f1.querySelector('img.ro-forge-anvil[src*="anvil.png"]') &&
      f1.querySelector('img.ro-forge-hammer[src*="hammer.png"]') &&
      f2.querySelector('img.ro-success-banner[src*="success.png"]') &&
      f3.querySelector('img.ro-broken-hilt[src*="broken_back.png"]') &&
      f3.querySelector('img.ro-fail-banner[src*="failed.png"]')
    );
    const aura = buildRaidElectricAura('#ff2442');
    animateRaidElectricAura(aura, 500, 0, 0, 0, 1);
    const isRibbonMesh = Boolean(aura.userData.shadowBolts?.isMesh && aura.userData.outerBolts?.isMesh && aura.userData.coreBolts?.isMesh && !aura.userData.groundRing);
    // Check Raid Dungeon tab DOM
    mapSeason = 'dungeons'; dungeonMode = 'raid'; raidDungeonPick = 'astral';
    const html = renderDungeonsPanel();
    const tmp = document.createElement('div'); tmp.innerHTML = html;
    const leftHasOnlyCards = Boolean(tmp.querySelector('.raid-left-col .raid-dungeon-list')) && !tmp.querySelector('.raid-left-col .raid-boss-preview-card');
    const rightHasMvpHeader = Boolean(tmp.querySelector('.raid-dungeon-detail .raid-mvp-header .raid-boss-stage img')) && !tmp.querySelector('.raid-detail-hero');
    return { isAside, hasRoSprites, isRibbonMesh, leftHasOnlyCards, rightHasMvpHeader };
  })()`);
  assert.equal(r6.isAside, true, 'roForgeFxElement uses <aside> so .eclipse-workshop-hero > div never shrinks it to 46x46');
  assert.equal(r6.hasRoSprites, true, 'forging/success/failure overlays render authentic RO anvil, hammer, broken sword, Success & Failed sprites');
  assert.equal(r6.isRibbonMesh, true, 'raidElectricAura renders minimal 3-arc 3D contrast-backed ribbon Meshes + colored ground rim');
  assert.equal(r6.leftHasOnlyCards, true, 'left Raid column holds only Raid option map cards');
  assert.equal(r6.rightHasMvpHeader, true, 'right Raid detail pane replaces duplicate map banner with MVP Boss Preview & Info header');
});

// 22. Round-7: Continuous Thor Volcano Causeway Walking Journey + 6 Distinct Ifrit Boss Skills
check('Round-7: Thor Volcano Raid walks continuously along connected 3D causeway into Sanctum of Ifrit, and Ifrit uses 6 distinct volcanic boss mechanics', () => {
  // Part A: Verify continuous 3D Volcano Causeway persistence & stage-to-stage walking rebase
  const walkRes = g.ev(`(() => {
    S.raid = { day: trialDay(), used: 0 };
    PGRaid.startDirectSolo('thor');
    buildDeco(11);
    const initialWorld = ascensionWorld;
    const initialRoot = ascensionRoot;
    const rootZByStage = [ascensionRoot ? ascensionRoot.position.z : null];
    const walkedFlags = [];
    for (let s = 0; s < 3; s++) {
      while (mobs.length) kill(mobs[0]);
      PGRaid.tick(0.05);
      walkedFlags.push(Boolean(astralJourney && pl.run));
      for (let step = 0; step < 110 && PGRaid.raid.stage === s; step++) {
        if (!tickAstralJourney(1 / 30)) update(1 / 30);
        t += 1 / 30;
      }
      buildDeco(11);
      rootZByStage.push(ascensionRoot ? ascensionRoot.position.z : null);
    }
    const preservedSameRoot = (ascensionWorld === initialWorld && ascensionRoot === initialRoot && initialWorld?.kind === 'thor-raid');
    if (ascensionWorld) ascensionWorld.update(2.5, true);
    return {
      preservedSameRoot,
      outlinePts: initialWorld?.route?.outline?.length || 0,
      walkedFlags,
      rootZByStage,
      finalStage: PGRaid.raid.stage,
      hasIfrit: mobs.some(m => m.boss && m.n === 'Ifrit')
    };
  })()`);
  assert.equal(walkRes.preservedSameRoot, true, 'Thor Volcano Raid preserves one continuous 3D thor-raid causeway across Stages 1 -> 4 without rebuilding');
  assert.ok(walkRes.outlinePts > 20, 'Volcano causeway defines continuous route outline for 3D deck & minimap');
  assert.deepEqual([...walkRes.walkedFlags], [true, true, true], 'All 3 stage transitions start continuous on-foot bridge walking');
  assert.deepEqual([...walkRes.rootZByStage], [0, 38, 78, 134], 'ascensionRoot Z shifts continuously (-8 -> -46 -> -86 -> -142) into Sanctum of Ifrit');
  assert.equal(walkRes.finalStage, 3, 'arrived on Stage 4 Sanctum of Ifrit');
  assert.equal(walkRes.hasIfrit, true, 'Ifrit boss awaits on the Sanctum terminus');

  // Part B: Verify 0% overlap between Thor Volcano Boss Skills and Astral Citadel Boss Skills + exact geometry of all 6 Ifrit skills!
  const skillRes = g.ev(`(() => {
    const boss = mobs.find(m => m.boss);
    boss.x = 0; boss.z = -4; boss.hp = boss.max * 0.72;
    PGRaid.raid.pillarCastDone = false;
    PGRaid.raid.castSeq = 0;
    PGRaid.raid.lastSkillKey = '';
    const thorNames = new Set();
    const thorShapes = new Set();
    for (let i = 0; i < 10; i++) {
      PGRaid.raid.telegraph = null;
      PGRaid.raid.nextCastIn = 0.01;
      pl.x = (i % 2 === 0) ? 0 : 6;
      pl.z = (i % 2 === 0) ? -2 : 4;
      PGRaid.tick(0.05);
      if (PGRaid.raid.telegraph) {
        thorNames.add(PGRaid.raid.telegraph.name);
        thorShapes.add(PGRaid.raid.telegraph.shape);
      }
    }

    // 1. Cone (Molten Breath): pointing +Z (ang = Math.PI/2) from (0, -4)
    const coneTg = { name: 'Molten Breath', shape: 'cone', x: 0, z: -4, ang: Math.PI / 2, halfArc: 0.96, r: 15.2, age: 1.0, life: 2.25 };
    const coneFrontHit = PGRaid.hitByTelegraph(coneTg, 0, 2.0);
    const coneBackSafe = !PGRaid.hitByTelegraph(coneTg, 0, -8.0);
    const coneFlankSafe = !PGRaid.hitByTelegraph(coneTg, 8.0, -4.5);

    // 2. Ringwaves (Tectonic Ring Surge): inner < 4.3 HIT, mid [4.3..8.3] SAFE, outer [8.3..18] HIT
    const ringTg = { name: 'Tectonic Ring Surge', shape: 'ringwaves', x: 0, z: -4, innerSafeR: 4.3, outerSafeR: 8.3, r: 18.0, age: 1.0, life: 2.45 };
    const ringCoreHit = PGRaid.hitByTelegraph(ringTg, 0, -2.0);     // dist 2.0 -> HIT
    const ringMidSafe = !PGRaid.hitByTelegraph(ringTg, 0, 2.2);     // dist 6.2 -> SAFE!
    const ringOuterHit = PGRaid.hitByTelegraph(ringTg, 0, 6.8);     // dist 10.8 -> HIT
    PGRaid.raid.telegraph = ringTg; PGRaid.raid.dodgeCd = 0; pl.x = 0; pl.z = -2.0;
    PGRaid.dodge();
    const ringDodgeSafe = !PGRaid.hitByTelegraph(ringTg, pl.x, pl.z);

    // 3. Triskelion (Hellfire Pinwheel): 3 spokes at 0, 120, 240 deg rotating over time
    const pinTg0 = { name: 'Hellfire Pinwheel', shape: 'triskelion', x: 0, z: -4, ang: 0, rotSpeed: 1.0, width: 2.55, len: 15.6, age: 0, life: 2.55 };
    const pinHitAt0 = PGRaid.hitByTelegraph(pinTg0, 6.0, -4.0);     // directly on spoke 0 (+X) at age=0 -> HIT
    const pinSafeSliceAt0 = !PGRaid.hitByTelegraph(pinTg0, 3.0, 1.2); // 60 deg slice -> SAFE at age=0
    pinTg0.age = 1.05; // ~60 deg rotation moves spoke onto 60 deg point & clears 0 deg!
    const pinMovedOff0 = !PGRaid.hitByTelegraph(pinTg0, 6.0, -4.0);

    // 4. Lava Wall (Pyroclastic Tsunami): wall at z=0, depth=7.4, safe breach at gapX=5.4 (+/-2.6)
    const wallTg = { name: 'Pyroclastic Tsunami', shape: 'lava_wall', x: 5.4, z: 0, gapX: 5.4, gapHalfW: 2.6, depth: 7.4, age: 1.0, life: 2.45 };
    const wallSlabHit = PGRaid.hitByTelegraph(wallTg, -2.0, 0.5);
    const wallBreachSafe = !PGRaid.hitByTelegraph(wallTg, 5.4, 0.5);
    PGRaid.raid.telegraph = wallTg; PGRaid.raid.dodgeCd = 0; pl.x = 1.2; pl.z = 0.5;
    PGRaid.dodge();
    const wallDodgeSafe = !PGRaid.hitByTelegraph(wallTg, pl.x, pl.z);

    // 5. Fissure Lanes (Caldera Fault Lines): 3 parallel Z-lanes at x = -5.6, 0, +5.6; ridges at x = +/-2.8 SAFE
    const faultTg = {
      name: 'Caldera Fault Lines', shape: 'fissure_lanes', volcanic: true, x: 0, z: 0,
      beams: [
        { x: -5.6, z: 0, ang: 0, width: 2.65, len: 26 },
        { x: 0, z: 0, ang: 0, width: 2.65, len: 26 },
        { x: 5.6, z: 0, ang: 0, width: 2.65, len: 26 }
      ],
      age: 1.0, life: 2.3
    };
    const faultHitCenter = PGRaid.hitByTelegraph(faultTg, 0, 2.0);
    const faultRidgeSafe = !PGRaid.hitByTelegraph(faultTg, 2.8, 2.0);

    // 6. Obsidian Spires (Supernova Cataclysm): 2 spires + inward Magma Vortex pull!
    const spireTg = {
      name: 'Supernova Cataclysm', shape: 'pillars', volcanicSpires: true, pullSpeed: 1.28,
      pillars: PGRaid.spawnSanctuaryPillars(0, -4, 2),
      x: 0, z: -4, dmgPct: 0.90, bypassShield: true, mustHideBehindPillar: true, age: 0.5, life: 4.4
    };
    PGRaid.raid.telegraph = spireTg; pl.x = 0; pl.z = 4.0;
    const zBeforePull = pl.z;
    PGRaid.tick(0.25);
    const pulledCloser = pl.z < zBeforePull;

    PGRaid.leave();
    buildDeco(S.mp);
    const cleanedUpWorld = (!ascensionWorld || ascensionWorld.kind !== 'thor-raid');

    return {
      thorNames: [...thorNames],
      thorShapes: [...thorShapes],
      coneFrontHit, coneBackSafe, coneFlankSafe,
      ringCoreHit, ringMidSafe, ringOuterHit, ringDodgeSafe,
      pinHitAt0, pinSafeSliceAt0, pinMovedOff0,
      wallSlabHit, wallBreachSafe, wallDodgeSafe,
      faultHitCenter, faultRidgeSafe,
      spireCount: spireTg.pillars.length,
      pulledCloser,
      cleanedUpWorld
    };
  })()`);

  const astralBossSkills = ['Crimson Judgment', 'Eye of Abyss', 'Horizon Volley', 'Abyssal Cross', 'Starfall Cataclysm', 'Oblivion Extinction'];
  for (const an of astralBossSkills) {
    assert.equal(skillRes.thorNames.includes(an), false, `Thor Volcano boss does not reuse Astral skill "${an}"`);
  }
  assert.ok(skillRes.thorNames.length >= 5, `Ifrit cycles rich distinct volcanic kit (${skillRes.thorNames.join(', ')})`);
  assert.equal(skillRes.coneFrontHit && skillRes.coneBackSafe && skillRes.coneFlankSafe, true, 'Molten Breath 110° cone hits front and spares flanks/rear');
  assert.equal(skillRes.ringCoreHit && skillRes.ringMidSafe && skillRes.ringOuterHit && skillRes.ringDodgeSafe, true, 'Tectonic Ring Surge hits core & outer rim, spares 4.3-8.3m ring, and DODGE lands in safe band');
  assert.equal(skillRes.pinHitAt0 && skillRes.pinSafeSliceAt0 && skillRes.pinMovedOff0, true, 'Hellfire Pinwheel rotates 3 lava spokes continuously over cast time');
  assert.equal(skillRes.wallSlabHit && skillRes.wallBreachSafe && skillRes.wallDodgeSafe, true, 'Pyroclastic Tsunami hits wall slabs, spares Safe Breach, and DODGE enters breach');
  assert.equal(skillRes.faultHitCenter && skillRes.faultRidgeSafe, true, 'Caldera Fault Lines hit parallel magma trenches and spare safe basalt ridges');
  assert.equal(skillRes.spireCount, 2, 'Supernova Cataclysm erupts 2 volcanic Obsidian Spires');
  assert.equal(skillRes.pulledCloser, true, 'Supernova Cataclysm magma vortex pulls exposed player toward Ifrit');
  assert.equal(skillRes.cleanedUpWorld, true, 'leaving Thor Volcano Raid disposes thor-raid scenery cleanly');
});

check('Round-8: GIF-extracted 5-color lightning title FX, textured Volcano Raid world, cropped Raid UI & fog-immune 3D volcanic skills', () => {
  const sheetPath = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../assets/refine-fx/title-lightning.webp');
  assert.equal(fs.existsSync(sheetPath), true, 'assets/refine-fx/title-lightning.webp spritesheet exists on disk');
  const raidCss = fs.readFileSync(path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../assets/raid.css'), 'utf8');
  assert.equal(raidCss.includes('overflow-x: hidden'), true, '.star-rate-table-wrap suppresses horizontal scrollbar');

  const r8 = g.ev(`(() => {
    // 1. Raid Dungeons cropped portraits + 4-stage route strip + status pills + compact Star Rate Table
    raidDungeonPick = 'thor';
    dungeonMode = 'raid';
    mapSeason = 'endgame';
    const dngHtml = renderDungeonsPanel();
    const tmp = document.createElement('div');
    tmp.innerHTML = dngHtml;
    const bossImg = tmp.querySelector('.raid-mvp-header[data-theme="thor"] .raid-boss-stage img');
    const bossCropStyle = bossImg ? (bossImg.getAttribute('style') || '') : '';
    const routeSteps = tmp.querySelectorAll('.raid-route-step').length;
    const mobPortraits = tmp.querySelectorAll('.raid-mob-chip .raid-mob-ico img').length;
    const statPills = tmp.querySelectorAll('.dungeons-stat-pill').length;

    // 2. 5-Color GIF-extracted lightning flipbook aura
    const colors = ['#00eaff', '#00ff7b', '#ffc800', '#c44dff', '#ff2442'];
    const auras = colors.map(c => buildRaidElectricAura(c));
    const distinctMaps = new Set(auras.map(a => a.userData.outerBolts.material.map)).size;
    animateRaidElectricAura(auras[0], 0, 0, 0, 0, 1);
    const uv0 = auras[0].userData.outerBolts.geometry.attributes.uv.getX(0);
    animateRaidElectricAura(auras[0], 220, 0, 0, 0, 1);
    const uv1 = auras[0].userData.outerBolts.geometry.attributes.uv.getX(0);
    // Disposing one instance must not corrupt another instance of the same color
    const dupCyan = buildRaidElectricAura('#00eaff');
    disposeThreeGroup(dupCyan);

    // 3. Textured & detailed Thor Volcano Raid world + unoccluded hazard elevation + fog-immune 3D skills
    const world = PGRaid.buildVolcanoRaidWorld(1);
    let meshCount = 0;
    let deckY = null;
    world.scenery.traverse(o => {
      if (o.isMesh) {
        meshCount++;
        if (o.geometry && o.geometry.type === 'ShapeGeometry' && deckY === null) deckY = o.position.y;
      }
    });
    world.dispose();

    // 4. Balanced initial cast (1.6s Stage 1, 3.8s Boss), fog-immune materials, 3D volcanic eruption meshes, and tickBossSkill guard
    S.gm = true;
    PGRaid.startDirectSolo('thor');
    const stage1InitialDelay = PGRaid.raid.nextCastIn;
    // Step 17 x 0.1s (1.7s > 1.6s) -> Stage 1 mob-originated volcanic skill is active and visible!
    for (let i = 0; i < 17; i++) PGRaid.tick(0.1);
    const stage1HazardActive = Boolean(PGRaid.raid.telegraph && PGRaid.raid.telegraph.volcanic);
    // Verify tickBossSkill never wipes bossCast while Raid is active
    bossCast = { id: 'ifr_eruption', start: t, age: 0, life: 3.2, x: 0, z: 0, seed: 7 };
    tickBossSkill();
    const bossCastPreservedDuringRaid = Boolean(bossCast && bossCast.id === 'ifr_eruption');
    bossCast = null;
    // Advance to Stage 4 Boss and trigger detonation to verify 3D impact geyser burst + volcanic PGBossFx ID
    for (let s = 0; s < 3; s++) {
      while (mobs.length) kill(mobs[0]);
      PGRaid.tick(0.05);
      for (let wStep = 0; wStep < 120 && PGRaid.raid.stage === s; wStep++) {
        if (!tickAstralJourney(1 / 30)) update(1 / 30);
        t += 1 / 30;
      }
    }
    const bossInitialDelay = PGRaid.raid.nextCastIn;
    for (let i = 0; i < 39; i++) PGRaid.tick(0.1);
    const bossTg = PGRaid.raid.telegraph;
    const bossFxId = bossTg ? bossTg.fx : '';
    let allFogFalse = true;
    let hazardGroupY = 0;
    scene.traverse(o => {
      if (o.parent === scene && o.type === 'Group' && Math.abs(o.position.y - 0.14) < 0.005) {
        hazardGroupY = o.position.y;
        o.traverse(m => {
          if (m.isMesh && m.material && m.material.fog !== false) allFogFalse = false;
        });
      }
    });
    // Finish cast to spawn 3D volcanic impact geyser burst!
    PGRaid.raid.iframes = 5;
    for (let i = 0; i < 50 && PGRaid.raid.telegraph; i++) PGRaid.tick(0.1);
    const impactSpawned = PGRaid.raid.impacts.length > 0;
    PGRaid.leave(true);

    return {
      bossCropStyle, routeSteps, mobPortraits, statPills,
      sheetUrl: auras[0].userData.sheetUrl,
      distinctMaps,
      uvChanged: Math.abs(uv1 - uv0) > 0.01,
      meshCount, deckY,
      stage1InitialDelay, stage1HazardActive,
      bossCastPreservedDuringRaid,
      bossInitialDelay, bossFxId,
      hazardGroupY, allFogFalse, impactSpawned
    };
  })()`);

  assert.equal(r8.bossCropStyle.includes('--bsz:') && r8.bossCropStyle.includes('--bx:'), true, 'Thor boss stage portrait applies exact crop CSS variables');
  assert.equal(r8.routeSteps, 4, 'Raid detail header renders 4-stage route strip');
  assert.equal(r8.mobPortraits, 6, 'Thor encounter roster renders cropped sprite portraits for all 5 monsters + Ifrit');
  assert.equal(r8.statPills, 2, 'Dungeons topbar renders Raid Clears & Weapon ★ Pen status pills');
  assert.equal(r8.sheetUrl, 'assets/refine-fx/title-lightning.webp', 'Electric aura binds GIF-extracted title-lightning.webp spritesheet');
  assert.equal(r8.distinctMaps, 5, 'All 5 electric title colors create independent CanvasTexture instances');
  assert.equal(r8.uvChanged, true, 'animateRaidElectricAura steps 4x4 UV flipbook frames over time');
  assert.ok(r8.meshCount >= 220, `Volcano Raid world populates rich Ascension basalt/rubble/pool/caldera detail (${r8.meshCount} meshes)`);
  assert.ok(Math.abs(r8.deckY - 0.02) < 0.01, `Volcano causeway deck sits at y=0.02 (${r8.deckY}) cleanly below hazard telegraphs`);
  assert.ok(Math.abs(r8.stage1InitialDelay - 1.6) < 0.05 && r8.stage1HazardActive, 'Thor Stage 1 volcanic mob skill casts cleanly after 1.6s entry window');
  assert.equal(r8.bossCastPreservedDuringRaid, true, 'tickBossSkill preserves Raid bossCast without wiping Stage 1-4 FX');
  assert.ok(Math.abs(r8.bossInitialDelay - 3.8) < 0.05 && /^(ifr_|dl_|ed_)/.test(r8.bossFxId), `Ifrit casts after 3.8s opening window using volcanic PGBossFx (${r8.bossFxId})`);
  assert.ok(Math.abs(r8.hazardGroupY - 0.14) < 0.01 && r8.allFogFalse, 'Raid hazardGroup sits at y=0.14 with fog:false on every hazard mesh');
  assert.equal(r8.impactSpawned, true, 'Detonating volcanic skill spawns 3D magma geyser impact burst');
});

// 24. Round-9 (haven-v461): Neck-Height Slower Title FX + Slower Boss Cadence (Both Boss Maps) + Volcano Stage 1-3 Monster-Originated Skills
check('Round-9: Title lightning aura stops at neck with calm ~4s cycle, both Raid Bosses use relaxed 4.8s-6.2s skill intervals, and Volcano Stage 1-3 skills originate from & interrupt with live mobs', () => {
  const r9 = g.ev(`(() => {
    // 1. Title FX neck-height cap (hero height = 2.16, chin/face = 1.38..2.16 -> all bolt planes must stay <= 1.26)
    const aura = buildRaidElectricAura('#00eaff');
    const outer = aura.userData.outerBolts;
    const core = aura.userData.coreBolts;
    const shadow = aura.userData.shadowBolts;
    const topOuter = outer.position.y + outer.geometry.parameters.height * 0.5;
    const topCore = core.position.y + core.geometry.parameters.height * 0.5;
    const topShadow = shadow.position.y + shadow.geometry.parameters.height * 0.5;
    // Calm ~4.0s cycle: active surge at t=300ms, calm rest phase at t=2600ms (slot ~27 in 42-slot cycle)
    animateRaidElectricAura(aura, 300, 0, 0, 0, 1);
    const activeOp = outer.material.opacity;
    // Verify 95ms frame pacing: t=10ms and t=75ms stay on frame 0 (would have jumped on old 44ms timer!)
    animateRaidElectricAura(aura, 10, 0, 0, 0, 1);
    const snapAt10 = aura.userData.cellSnaps[0];
    animateRaidElectricAura(aura, 75, 0, 0, 0, 1);
    const snapAt75 = aura.userData.cellSnaps[0];
    animateRaidElectricAura(aura, 2600, 0, 0, 0, 1);
    const restOuterOp = outer.material.opacity;
    const restCoreOp = core.material.opacity;
    disposeThreeGroup(aura);

    // 2. Volcano Stage 1-3 skills originate directly from a live Stage 1-3 mob & interrupt if that mob is slain!
    S.gm = true;
    PGRaid.startDirectSolo('thor');
    const seenMobSkills = new Set();
    let allAnchoredToMob = true;
    for (let c = 0; c < 3; c++) {
      PGRaid.raid.telegraph = null;
      PGRaid.raid.nextCastIn = 0.05;
      PGRaid.tick(0.1);
      const tg = PGRaid.raid.telegraph;
      if (!tg || !tg.casterRef || tg.casterRef.boss || mobs.indexOf(tg.casterRef) === -1) {
        allAnchoredToMob = false;
        break;
      }
      seenMobSkills.add(tg.name);
      const cx = tg.casterRef.x, cz = tg.casterRef.z;
      if (tg.name === 'Flame Breath') {
        if (Math.hypot(tg.x - cx, tg.z - cz) > 0.01) allAnchoredToMob = false;
      } else if (tg.name === 'Magma Fissure') {
        // Beam starts at (cx, cz) and extends len along (ang - PI/2) -> distance from center (tg.x, tg.z) to (cx, cz) === len * 0.5
        const distCenter = Math.hypot(tg.x - cx, tg.z - cz);
        if (Math.abs(distCenter - tg.len * 0.5) > 0.05 || !tg.growFromCaster) allAnchoredToMob = false;
      } else if (tg.name === 'Magma Bomb') {
        if (!tg.lobFrom || Math.hypot(tg.lobFrom.x - cx, tg.lobFrom.z - cz) > 0.01) allAnchoredToMob = false;
      } else {
        allAnchoredToMob = false;
      }
    }
    const thorStage1Gap = PGRaid.raid.nextCastIn;
    // Slaying the casting monster mid-cast must immediately cancel raid.telegraph!
    const liveCaster = PGRaid.raid.telegraph && PGRaid.raid.telegraph.casterRef;
    if (liveCaster) kill(liveCaster);
    PGRaid.tick(0.1);
    const interruptedOnCasterDeath = PGRaid.raid.telegraph === null;
    PGRaid.leave(true);

    // 3. Both Boss Maps (Astral Thanatos & Thor Ifrit) use relaxed 6.2s normal / 4.8s enraged intervals!
    function measureBossGaps(dungeonId) {
      PGRaid.startDirectSolo(dungeonId);
      for (let s = 0; s < 3; s++) {
        while (mobs.length) kill(mobs[0]);
        PGRaid.tick(0.05);
        for (let wStep = 0; wStep < 120 && PGRaid.raid.stage === s; wStep++) {
          if (!tickAstralJourney(1 / 30)) update(1 / 30);
          t += 1 / 30;
        }
      }
      const openDelay = PGRaid.raid.nextCastIn;
      const boss = mobs.find(m => m && m.boss);
      boss.hp = boss.max; // >= 50% HP
      PGRaid.raid.pillarCastDone = true;
      PGRaid.raid.castSeq = 0;
      PGRaid.raid.lastSkillKey = '';
      PGRaid.raid.telegraph = null;
      PGRaid.raid.nextCastIn = 0.05;
      PGRaid.tick(0.1);
      const normalGap = PGRaid.raid.nextCastIn;
      boss.hp = Math.floor(boss.max * 0.35); // < 50% HP enraged
      PGRaid.raid.castSeq = 0;
      PGRaid.raid.lastSkillKey = '';
      PGRaid.raid.telegraph = null;
      PGRaid.raid.nextCastIn = 0.05;
      PGRaid.tick(0.1);
      const enragedGap = PGRaid.raid.nextCastIn;
      PGRaid.leave(true);
      return { openDelay, normalGap, enragedGap };
    }
    const astralGaps = measureBossGaps('astral');
    const thorGaps = measureBossGaps('thor');

    return {
      topOuter, topCore, topShadow,
      activeOp, snapAt10, snapAt75, restOuterOp, restCoreOp,
      seenMobSkills: Array.from(seenMobSkills).sort(),
      allAnchoredToMob, thorStage1Gap, interruptedOnCasterDeath,
      astralGaps, thorGaps
    };
  })()`);

  assert.ok(r9.topOuter <= 1.26 && r9.topCore <= 1.22 && r9.topShadow <= 1.0,
    `Title lightning bolts stop cleanly at character neck (${r9.topOuter.toFixed(2)} <= 1.26, face 1.38..2.16 stays completely clear)`);
  assert.equal(r9.snapAt10, 0, 'Title FX starts on frame 0 at t=10ms');
  assert.equal(r9.snapAt75, 0, 'Title FX uses relaxed 95ms/frame step (still frame 0 at t=75ms)');
  assert.ok(r9.activeOp > 0.8 && r9.restOuterOp === 0 && r9.restCoreOp === 0,
    'Title FX includes a calm ~1.8s rest window between lightning discharges');
  assert.equal(r9.seenMobSkills.join(','), 'Flame Breath,Magma Bomb,Magma Fissure',
    'Volcano Stage 1-3 rotates all 3 monster-originated volcanic skills');
  assert.equal(r9.allAnchoredToMob, true, 'Every Volcano Stage 1-3 skill originates geometrically from its live casting mob');
  assert.ok(r9.thorStage1Gap >= 4.2, `Volcano Stage 1 mob cast cooldown is relaxed (${r9.thorStage1Gap}s)`);
  assert.equal(r9.interruptedOnCasterDeath, true, 'Killing the casting Volcano mob mid-cast immediately interrupts & cancels its telegraph');
  assert.ok(Math.abs(r9.astralGaps.openDelay - 3.8) < 0.05 && Math.abs(r9.astralGaps.normalGap - 6.2) < 0.05 && Math.abs(r9.astralGaps.enragedGap - 4.8) < 0.05,
    `Astral Boss (Memory of Thanatos) uses relaxed intervals: open=${r9.astralGaps.openDelay}s, normal=${r9.astralGaps.normalGap}s, enraged=${r9.astralGaps.enragedGap}s`);
  assert.ok(Math.abs(r9.thorGaps.openDelay - 3.8) < 0.05 && Math.abs(r9.thorGaps.normalGap - 6.2) < 0.05 && Math.abs(r9.thorGaps.enragedGap - 4.8) < 0.05,
    `Volcano Boss (Ifrit) uses relaxed intervals: open=${r9.thorGaps.openDelay}s, normal=${r9.thorGaps.normalGap}s, enraged=${r9.thorGaps.enragedGap}s`);
});

// 25. Round-10 (haven-v462): No Bottom Title Ring + 20m/25m Raid Timers + Reduced Boss Damage + Party Disconnect Continuation + Solo <=10s Leave Refund (Except Death)
check('Round-10: Title FX removes bottom ground ring, Raid timers are 20m/25m, Boss damage is softened, Party disconnect rescales & continues, and Solo <=10s leave keeps entry (except death)', () => {
  // Verify SocialRoom relays disconnect name cleanly on active party raid
  let now = 1_700_000_500_000;
  const room = new SocialRoom({ now: () => now, random: () => 0.5, onSetAlarm: () => {} });
  const mk = (id, name) => {
    const inbox = [];
    const c = room.connect({ id, username: name }, raw => inbox.push(JSON.parse(raw)), () => {});
    room.receive(c, JSON.stringify({ type: 'join', look: { cls: 'Rune Knight', appearance: { version: 1, sex: 'm', headTop: 'crown' } } }));
    return { c, inbox };
  };
  const pA = mk(101, 'Alice');
  const pB = mk(102, 'Bob');
  const pC = mk(103, 'Cara');
  room.receive(pA.c, JSON.stringify({ type: 'party_invite', targetId: 102 }));
  room.receive(pB.c, JSON.stringify({ type: 'party_accept' }));
  room.receive(pA.c, JSON.stringify({ type: 'party_invite', targetId: 103 }));
  room.receive(pC.c, JSON.stringify({ type: 'party_accept' }));
  now += 500;
  room.receive(pB.c, JSON.stringify({ type: 'raid_ready', ready: true }));
  room.receive(pC.c, JSON.stringify({ type: 'raid_ready', ready: true }));
  room.receive(pA.c, JSON.stringify({ type: 'raid_start', dungeonId: 'thor' }));
  pA.inbox.length = 0;
  // Cara disconnects mid-raid!
  room.disconnect(pC.c);
  const discRelay = pA.inbox.find(m => m.type === 'raid_end' && m.reason === 'disconnect');
  assert.ok(discRelay && discRelay.fromId === 103 && discRelay.name === 'Cara', 'SocialRoom relays disconnecting member id & name to surviving party');

  const r10 = g.ev(`(() => {
    // 1. Title FX has ZERO RingGeometry / ground ring meshes below character
    const aura = buildRaidElectricAura('#00eaff');
    let ringGeos = 0;
    aura.traverse(o => {
      if (o.isMesh && o.geometry && o.geometry.type === 'RingGeometry') ringGeos++;
    });
    const noGroundRingRefs = !aura.userData.groundRing && !aura.userData.groundBack;
    animateRaidElectricAura(aura, 500, 0, 0, 0, 1);
    disposeThreeGroup(aura);

    // 2. Time limits: Solo 20:00 (1200s), Party 25:00 (1500s)
    const soloLimit = PGRaid.SOLO_LIMIT_S;
    const partyLimit = PGRaid.PARTY_LIMIT_S;

    // 3. Softened Boss Damage check (normal skill <= 0.34, pillar/spire <= 0.68)
    S.gm = true;
    PGRaid.startDirectSolo('thor');
    for (let s = 0; s < 3; s++) {
      while (mobs.length) kill(mobs[0]);
      PGRaid.tick(0.05);
      for (let w = 0; w < 120 && PGRaid.raid.stage === s; w++) {
        if (!tickAstralJourney(1 / 30)) update(1 / 30);
        t += 1 / 30;
      }
    }
    // Force Spire cast first
    PGRaid.raid.pillarCastDone = false;
    PGRaid.raid.castSeq = 2;
    PGRaid.raid.telegraph = null;
    PGRaid.raid.nextCastIn = 0.05;
    PGRaid.tick(0.1);
    const spireDmgPct = PGRaid.raid.telegraph ? PGRaid.raid.telegraph.dmgPct : 1;
    // Force normal boss skill next
    PGRaid.raid.telegraph = null;
    PGRaid.raid.nextCastIn = 0.05;
    PGRaid.tick(0.1);
    const normalSkillDmgPct = PGRaid.raid.telegraph ? PGRaid.raid.telegraph.dmgPct : 1;
    PGRaid.leave(true);

    // 4. Party Disconnect: 3p -> 2p keeps raid running & rescales Boss/mob HP down!
    window.PGSocial = {
      app: { id: 101, room: 1, connected: true, party: { id: 'party:5', leader: 101, members: [{ id: 101, name: 'Alice' }, { id: 102, name: 'Bob' }, { id: 103, name: 'Cara' }] } },
      send: () => true,
      setRaidSuspend: () => {}
    };
    PGRaid.onStarted({
      raidId: 'raid:500',
      seed: 42,
      dungeonId: 'astral',
      leader: 101,
      members: [{ id: 101, name: 'Alice', cls: 'Rune Knight' }, { id: 102, name: 'Bob', cls: 'Arch Bishop' }, { id: 103, name: 'Cara', cls: 'Warlock' }]
    });
    const hpBefore3p = mobs[0].max;
    PGRaid.onEnded({ raidId: 'raid:500', fromId: 103, name: 'Cara', cleared: false, reason: 'disconnect' });
    const staysInRaidAfterPeerDisc = PGRaid.raid.on === true;
    const hpAfter2p = mobs[0].max;
    const caraSlot = PGRaid.raid.party.find(p => p.id === 103);
    const hudHtml = document.getElementById('raidPartyRows').innerHTML;
    PGRaid.leave(true);

    // 5. Solo <=10s Leave Refund (Except Death!) for real non-GM player
    S.gm = false;
    CLOUD.gm = false;
    S.lv = 175;
    S.raid = { day: trialDay(), used: 0, clears: 0, bestSolo: 0, bestParty: 0 };
    const shardsStart = S.ascensionMat[0] || 0;

    // Case A: Leave voluntarily at 4.0s (<= 10s) -> entry refunded (used === 0) & 0 free shards!
    PGRaid.startDirectSolo('astral');
    const usedRightAfterStart = S.raid.used;
    for (let i = 0; i < 40; i++) PGRaid.tick(0.1); // 4.0s
    PGRaid.leave();
    const refundedFlag = Boolean(PGRaid.raid.result && PGRaid.raid.result.refundedEntry);
    PGRaid.hideResult();
    const usedAfterEarlyLeave = S.raid.used;
    const shardsAfterEarlyLeave = S.ascensionMat[0] || 0;

    // Case B: Die at 3.0s (<= 10s, but DEATH!) -> entry NOT refunded (used === 1) & +5 consolation shards!
    PGRaid.startDirectSolo('astral');
    for (let i = 0; i < 30; i++) PGRaid.tick(0.1); // 3.0s
    S.hp = 0;
    PGRaid.tick(0.1);
    PGRaid.hideResult();
    const usedAfterEarlyDeath = S.raid.used;
    const shardsAfterEarlyDeath = S.ascensionMat[0] || 0;

    // Case C: Leave voluntarily at 12.0s (> 10s) -> entry NOT refunded (used === 2)!
    PGRaid.startDirectSolo('astral');
    for (let i = 0; i < 120; i++) { S.hp = maxHp(); PGRaid.tick(0.1); } // 12.0s
    PGRaid.leave();
    PGRaid.hideResult();
    const usedAfterLateLeave = S.raid.used;

    S.gm = true;
    return {
      ringGeos, noGroundRingRefs,
      soloLimit, partyLimit,
      spireDmgPct, normalSkillDmgPct,
      staysInRaidAfterPeerDisc,
      hpRatio3to2: hpAfter2p / hpBefore3p,
      caraDisc: Boolean(caraSlot && caraSlot.disconnected),
      hudHasOffline: hudHtml.includes('OFFLINE'),
      usedRightAfterStart, usedAfterEarlyLeave, refundedFlag,
      noFreeShardsOnGraceLeave: (shardsAfterEarlyLeave - shardsStart) === 0,
      usedAfterEarlyDeath,
      deathConsolationShards: shardsAfterEarlyDeath - shardsAfterEarlyLeave,
      usedAfterLateLeave
    };
  })()`);

  assert.equal(r10.ringGeos, 0, 'Title FX creates zero RingGeometry ground rings beneath character');
  assert.equal(r10.noGroundRingRefs, true, 'Title FX userData has no groundRing/groundBack meshes');
  assert.equal(r10.soloLimit, 1200, 'Solo Raid time limit increased to 20:00 (1200s)');
  assert.equal(r10.partyLimit, 1500, 'Party Raid time limit increased to 25:00 (1500s)');
  assert.ok(r10.spireDmgPct <= 0.68 && r10.normalSkillDmgPct <= 0.34,
    `Boss telegraph damage softened (Spire=${r10.spireDmgPct}, Normal=${r10.normalSkillDmgPct})`);
  assert.equal(r10.staysInRaidAfterPeerDisc, true, 'Remaining party members stay in Raid when a teammate disconnects');
  assert.ok(Math.abs(r10.hpRatio3to2 - (2.25 / 3.45)) < 0.02,
    `Disconnecting 3rd teammate dynamically rescales mob HP from 3p (3.45x) to 2p (2.25x): got ${r10.hpRatio3to2.toFixed(3)}`);
  assert.equal(r10.caraDisc && r10.hudHasOffline, true, 'Disconnected teammate shows OFFLINE status in Party HUD');
  assert.equal(r10.usedRightAfterStart, 1, 'Starting Solo consumes 1 entry initially');
  assert.equal(r10.usedAfterEarlyLeave, 0, 'Leaving Solo within 10s refunds daily entry back to 0 used');
  assert.equal(r10.refundedFlag && r10.noFreeShardsOnGraceLeave, true, 'Early <=10s Solo leave marks refundedEntry and grants 0 consolation shards');
  assert.equal(r10.usedAfterEarlyDeath, 1, 'Dying in Solo within 10s does NOT refund entry (1 used)');
  assert.equal(r10.deathConsolationShards, 5, 'Dying in Solo still awards +5 consolation shards');
  assert.equal(r10.usedAfterLateLeave, 2, 'Leaving Solo after 10s consumes entry normally (2 used)');
});

// 26. v464 DO hardening & mid-raid save / mode-isolation regressions
await check('v464 DO relay hardening, reauth party hold, final stats grace, and mid-raid save/mode isolation', async () => {
  let now = 2_000_000;
  let alarms = 0;
  const room = new SocialRoom({
    now: () => now,
    onOccupancyChange: () => { if (room.hasActiveBattles()) alarms++; }
  });
  const mk = (id, name) => {
    const inbox = [];
    const c = room.connect({ id, username: name, gm: false, friends: [] }, raw => { inbox.push(typeof raw === 'string' ? JSON.parse(raw) : raw); return true; }, () => {});
    room.receive(c, JSON.stringify({ type: 'join', room: 1, look: { cls: 'Rune Knight', lv: 150, appearance: { sex: 'm' } } }));
    inbox.length = 0;
    return { c, inbox };
  };
  const a = mk(201, 'Ares');
  const b = mk(202, 'Bryn');
  const d = mk(203, 'Cora');
  room.receive(a.c, JSON.stringify({ type: 'party_invite', targetId: 202 }));
  room.receive(b.c, JSON.stringify({ type: 'party_accept' }));
  room.receive(a.c, JSON.stringify({ type: 'party_invite', targetId: 203 }));
  room.receive(d.c, JSON.stringify({ type: 'party_accept' }));
  now += 500;
  room.receive(b.c, JSON.stringify({ type: 'raid_ready', ready: true }));
  room.receive(d.c, JSON.stringify({ type: 'raid_ready', ready: true }));
  room.receive(a.c, JSON.stringify({ type: 'raid_start', dungeonId: 'astral' }));
  const rid = room.partyOf(a.c)?.raid?.id;
  assert.ok(rid, 'Party raid started cleanly');

  // 1. Duplicate raid_start while raid active is rejected
  a.inbox.length = 0;
  room.receive(a.c, JSON.stringify({ type: 'raid_start', dungeonId: 'thor' }));
  assert.ok(a.inbox.some(m => m.type === 'raid_error'), 'Duplicate raid_start rejected while party.raid active');

  // 2. force:true raid_sync obeys 250ms floor
  b.inbox.length = 0;
  room.receive(a.c, JSON.stringify({ type: 'raid_sync', raidId: rid, force: true, hp: 500, maxHp: 1000, dps: 100000, stage: 0 }));
  now += 50;
  room.receive(a.c, JSON.stringify({ type: 'raid_sync', raidId: rid, force: true, hp: 400, maxHp: 1000, dps: 110000, stage: 0 }));
  assert.equal(b.inbox.filter(m => m.type === 'raid_sync').length, 1, 'Rapid force:true raid_sync throttled inside 250ms');
  now += 260;
  room.receive(a.c, JSON.stringify({ type: 'raid_sync', raidId: rid, force: true, hp: 300, maxHp: 1000, dps: 120000, stage: 0 }));
  assert.equal(b.inbox.filter(m => m.type === 'raid_sync').length, 2, 'force:true raid_sync passes after 250ms floor');

  // 3. Planned 30-min reauth refresh preserves party & raid across quick reconnect
  d.inbox.length = 0;
  b.c.reauthAt = now - 1;
  room.sweep(); // triggers refresh(b.c) -> c.refreshing = true -> partyHoldUntil
  assert.equal(d.inbox.some(m => m.type === 'raid_end' && m.reason === 'disconnect'), false, 'Planned reauth does not drop member from Party Raid');
  now += 150;
  const bRe = room.connect({ id: 202, username: 'Bryn', gm: false, friends: [] }, raw => { b.inbox.push(typeof raw === 'string' ? JSON.parse(raw) : raw); return true; }, () => {});
  assert.ok(bRe && room.partyOf(bRe)?.raid, 'Reconnecting within 15s reauth hold preserves Party Raid membership');

  // 4. Multi-member final raid_end stats relay after leader clears
  a.inbox.length = 0;
  b.inbox.length = 0;
  room.receive(a.c, JSON.stringify({ type: 'raid_end', raidId: rid, cleared: true, reason: 'boss_down', secs: 300, dps: 9000000, dmgTaken: 200000, support: 50000, revives: 1 }));
  assert.equal(room.partyOf(a.c).raid, null, 'party.raid closed on clear');
  now += 40;
  room.receive(d.c, JSON.stringify({ type: 'raid_end', raidId: rid, cleared: true, reason: 'boss_down', secs: 300, dps: 7500000, dmgTaken: 640000, support: 410000, revives: 2 }));
  const trailing = a.inbox.find(m => m.type === 'raid_end' && m.fromId === 203);
  assert.ok(trailing && trailing.dmgTaken === 640000 && trailing.support === 410000, 'Trailing teammate final Commendation stats relay cleanly via 10s grace window');
  assert.equal(alarms, 0, 'Still 0 DO alarms scheduled');

  // 5. Mid-raid saveableState, farmSamplingPaused, and mode-isolation guards
  const iso = g.ev(`(() => {
    S.gm = true;
    S.cls = 'Rune Knight';
    S.mp = 4;
    S.lvl = 3;
    S.hp = maxHp();
    PGRaid.startDirectSolo('thor');
    const raidMapDuringRun = S.mp;
    S.hp = 0; // simulate downed state before save
    const rawSaved = JSON.parse(JSON.stringify(saveableState(S)));
    const packed = packSave(S);
    const unpacked = unpackSave(packed);
    const farmPaused = farmSamplingPaused();
    const clsBlocked = classBlock('Novice');
    trialEnter('echo');
    const echoBlocked = !TRIAL.on;
    PGRaid.leave({ silent: true });
    PGRaid.hideResult();
    return {
      raidMapDuringRun,
      savedMp: rawSaved.mp,
      savedLvl: rawSaved.lvl,
      savedHpPositive: rawSaved.hp >= 1,
      unpackedMp: unpacked.mp,
      unpackedLvl: unpacked.lvl,
      farmPaused,
      clsBlocked,
      echoBlocked,
      restoredMp: S.mp,
      restoredLvl: S.lvl
    };
  })()`);
  assert.equal(iso.raidMapDuringRun, 11, 'Thor Raid runs on map 11 in memory');
  assert.equal(iso.savedMp, 4, 'Mid-raid localStorage save preserves real home map (4) instead of Raid map (11)');
  assert.equal(iso.savedLvl, 3, 'Mid-raid localStorage save preserves real home stage (3)');
  assert.equal(iso.savedHpPositive, true, 'Mid-raid save never persists 0 HP');
  assert.equal(iso.unpackedMp === 4 && iso.unpackedLvl === 3, true, 'Mid-raid cloud packSave preserves real home map & stage');
  assert.equal(iso.farmPaused, true, 'Offline farm income sampling is paused during Raid');
  assert.equal(iso.clsBlocked, 'Leave the Raid first', 'Class switching is blocked during Raid');
  assert.equal(iso.echoBlocked, true, 'Endless Echo entry is blocked during Raid');
  assert.equal(iso.restoredMp === 4 && iso.restoredLvl === 3, true, 'Leaving Raid restores home map & stage');
});

// 27. Bug 1 regression: Raid death before healing through real update() loop (HP Recovery + First Aid + natural regen)
await check('Bug 1: lethal monster & telegraph damage end Solo Raid and keep Party downed at 0 HP in update() with HP Recovery enabled', async () => {
  const res = g.ev(`(() => {
    const origRand = Math.random;
    try {
      S = fresh();
      S.cls = 'Rune Knight';
      S.lv = 150;
      S.gm = true;
      S.sk = Object.assign({}, S.sk, { hprec: 10, aid: 5 });
      resetSkillRuntime();
      const hpregVal = pv('hpreg');

      // Case 1A: Solo lethal monster damage inside real update(dt) with HP Recovery Lv10 + First Aid Lv5
      PGRaid.startDirectSolo('astral');
      PGRaid.raid.iframes = 0;
      S.hp = 10;
      const m1 = mobs[0];
      m1.x = pl.x + 0.5;
      m1.z = pl.z;
      m1.atk = maxHp() * 50;
      m1.at = 0.01;
      m1.stun = 0;
      m1.provokeUntil = t + 999;
      Math.random = () => 0.99; // prevent dodge roll
      update(0.05);
      const soloEndedOnMonsterHit = !PGRaid.raid.on && PGRaid.raid.result && PGRaid.raid.result.cleared === false;
      PGRaid.hideResult();

      // Case 1B: Solo lethal telegraph damage inside real update(dt) with HP Recovery Lv10 + First Aid Lv5
      Math.random = origRand;
      PGRaid.startDirectSolo('astral');
      PGRaid.raid.iframes = 0;
      S.hp = Math.max(1, Math.floor(maxHp() * 0.15));
      PGRaid.raid.telegraph = {
        name: 'Crimson Judgment',
        hint: 'Move out!',
        shape: 'circle',
        x: pl.x,
        z: pl.z,
        r: 8.0,
        dmgPct: 0.50,
        age: 2.30,
        life: 2.35
      };
      update(0.10);
      const soloEndedOnTelegraph = !PGRaid.raid.on && PGRaid.raid.result && PGRaid.raid.result.cleared === false;
      PGRaid.hideResult();

      // Case 1C: Solo 0 HP entering update(dt) cannot regenerate via HP Recovery before death check
      PGRaid.startDirectSolo('astral');
      S.hp = 0;
      update(0.10);
      const soloEndedFromZeroHp = !PGRaid.raid.on && PGRaid.raid.result && PGRaid.raid.result.cleared === false;
      PGRaid.hideResult();

      // Case 1D: Party lethal monster damage stays downed at 0 HP across 60 update() ticks, until valid revive
      window.PGSocial = {
        app: { id: 10, name: 'Alice', connected: false, party: { id: 'p1', leader: 10, members: [{ id: 10, name: 'Alice' }, { id: 20, name: 'Bob' }] } },
        send: () => {},
        setRaidSuspend: () => {}
      };
      PGRaid.onStarted({
        raidId: 'raid:lethal-party',
        dungeonId: 'astral',
        seed: 42,
        leader: 10,
        members: [{ id: 10, name: 'Alice', cls: 'Rune Knight', lv: 150 }, { id: 20, name: 'Bob', cls: 'Arch Bishop', lv: 150 }]
      });
      PGRaid.raid.iframes = 0;
      S.hp = 10;
      const pm = mobs[0];
      pm.x = pl.x + 0.5;
      pm.z = pl.z;
      pm.atk = maxHp() * 50;
      pm.at = 0.01;
      pm.stun = 0;
      pm.provokeUntil = t + 999;
      Math.random = () => 0.99;
      update(0.05);
      Math.random = origRand;
      const downedAfterMonster = PGRaid.raid.on && PGRaid.raid.dead && S.hp === 0;
      let maxHpWhileDowned = S.hp;
      for (let i = 0; i < 60; i++) {
        update(0.10);
        if (S.hp > maxHpWhileDowned) maxHpWhileDowned = S.hp;
      }
      const stayedDownedMonster = PGRaid.raid.on && PGRaid.raid.dead && maxHpWhileDowned === 0;

      // Valid teammate revive brings Alice back at 30% HP
      PGRaid.onRevive({ raidId: 'raid:lethal-party', reviveId: 'raid:lethal-party:20:1', revivesLeft: 2, fromId: 20, fromName: 'Bob', target: 10 });
      const revivedOk = !PGRaid.raid.dead && S.hp === Math.ceil(maxHp() * 0.3);

      // Case 1E: Party lethal telegraph damage also stays downed at 0 HP across update() ticks with HP Recovery enabled
      PGRaid.raid.iframes = 0;
      S.hp = Math.max(1, Math.floor(maxHp() * 0.15));
      PGRaid.raid.telegraph = {
        name: 'Crimson Judgment',
        hint: 'Move out!',
        shape: 'circle',
        x: pl.x,
        z: pl.z,
        r: 8.0,
        dmgPct: 0.50,
        age: 2.30,
        life: 2.35
      };
      update(0.10);
      let maxHpWhileTelegraphDown = S.hp;
      for (let i = 0; i < 30; i++) {
        update(0.10);
        if (S.hp > maxHpWhileTelegraphDown) maxHpWhileTelegraphDown = S.hp;
      }
      const stayedDownedTelegraph = PGRaid.raid.on && PGRaid.raid.dead && maxHpWhileTelegraphDown === 0;

      PGRaid.leave({ silent: true });
      PGRaid.hideResult();
      return {
        hpregVal,
        soloEndedOnMonsterHit,
        soloEndedOnTelegraph,
        soloEndedFromZeroHp,
        downedAfterMonster,
        stayedDownedMonster,
        revivedOk,
        stayedDownedTelegraph
      };
    } finally {
      Math.random = origRand;
    }
  })()`);

  assert.ok(res.hpregVal > 0, 'HP Recovery passive (pv("hpreg")) is active during test');
  assert.equal(res.soloEndedOnMonsterHit, true, 'Lethal monster hit in update() ends Solo Raid despite HP Recovery');
  assert.equal(res.soloEndedOnTelegraph, true, 'Lethal telegraph hit in update() ends Solo Raid despite HP Recovery & First Aid');
  assert.equal(res.soloEndedFromZeroHp, true, '0 HP entering update() ends Solo Raid before HP Recovery runs');
  assert.equal(res.downedAfterMonster && res.stayedDownedMonster, true, 'Party Raid player stays downed at 0 HP across 60 update() ticks with HP Recovery');
  assert.equal(res.revivedOk, true, 'Valid teammate revive restores downed Party Raid player to 30% HP');
  assert.equal(res.stayedDownedTelegraph, true, 'Party lethal telegraph damage also stays downed at 0 HP across update() ticks');
});

// 28. Bug 2 regression: SocialRoom validates raidId, sender/target active participation, consecutive runs, reauth & scoped 10s grace
await check('Bug 2: SocialRoom validates raidId & active participation on sync/revive/end, blocks exited members, and scopes consecutive runs & late stats', async () => {
  let now = 5_000_000;
  let alarms = 0;
  const room = new SocialRoom({
    now: () => now,
    onSetAlarm: () => { alarms++; }
  });
  const mk = (id, name) => {
    const inbox = [];
    const c = room.connect({ id, username: name, gm: false, friends: [] }, raw => { inbox.push(typeof raw === 'string' ? JSON.parse(raw) : raw); return true; }, () => {});
    room.receive(c, JSON.stringify({ type: 'join', room: 1, look: { cls: 'Rune Knight', lv: 150, appearance: { sex: 'm' } } }));
    inbox.length = 0;
    return { c, inbox };
  };
  const alice = mk(301, 'Alice');
  const bob = mk(302, 'Bob');
  const cara = mk(303, 'Cara');

  room.receive(alice.c, JSON.stringify({ type: 'party_invite', targetId: 302 }));
  room.receive(bob.c, JSON.stringify({ type: 'party_accept' }));
  room.receive(alice.c, JSON.stringify({ type: 'party_invite', targetId: 303 }));
  room.receive(cara.c, JSON.stringify({ type: 'party_accept' }));
  now += 500;
  room.receive(bob.c, JSON.stringify({ type: 'raid_ready', ready: true }));
  room.receive(cara.c, JSON.stringify({ type: 'raid_ready', ready: true }));
  room.receive(alice.c, JSON.stringify({ type: 'raid_start', dungeonId: 'astral' }));
  const rid1 = room.partyOf(alice.c)?.raid?.id;
  assert.ok(rid1, 'Run 1 started');
  alice.inbox.length = 0;
  bob.inbox.length = 0;
  cara.inbox.length = 0;

  // 1. Missing or stale raidId on raid_sync, raid_revive, raid_end is rejected
  now += 2000;
  room.receive(alice.c, JSON.stringify({ type: 'raid_sync', hp: 500, maxHp: 1000, dps: 100 }));
  room.receive(alice.c, JSON.stringify({ type: 'raid_sync', raidId: 'raid:wrong', hp: 500, maxHp: 1000, dps: 100 }));
  room.receive(bob.c, JSON.stringify({ type: 'raid_revive', target: 301 }));
  room.receive(bob.c, JSON.stringify({ type: 'raid_revive', raidId: 'raid:wrong', target: 301 }));
  room.receive(alice.c, JSON.stringify({ type: 'raid_end', cleared: true, reason: 'boss_down' }));
  room.receive(alice.c, JSON.stringify({ type: 'raid_end', raidId: 'raid:wrong', cleared: true, reason: 'boss_down' }));
  assert.equal(bob.inbox.length, 0, 'Missing/stale raidId rejected on sync and end');
  assert.equal(alice.inbox.length, 0, 'Missing/stale raidId rejected on revive');
  assert.equal(room.partyOf(alice.c)?.raid?.id, rid1, 'Run 1 unaffected by invalid raidId messages');

  // 2. Cara exits Run 1 (stays in party, leaves raid) -> Alice & Bob notified once
  room.receive(cara.c, JSON.stringify({ type: 'raid_end', raidId: rid1, cleared: false, reason: 'left' }));
  assert.equal(alice.inbox.filter(m => m.type === 'raid_end' && m.fromId === 303).length, 1, 'Alice notified of Cara exit');
  assert.equal(bob.inbox.filter(m => m.type === 'raid_end' && m.fromId === 303).length, 1, 'Bob notified of Cara exit');
  alice.inbox.length = 0;
  bob.inbox.length = 0;
  cara.inbox.length = 0;

  // 3. Exited Cara cannot send raid_sync, raid_revive, or raid_end to surviving Run 1, and cannot be revived
  now += 3000;
  room.receive(cara.c, JSON.stringify({ type: 'raid_sync', raidId: rid1, force: true, hp: 999, maxHp: 1000, dps: 999999 }));
  room.receive(cara.c, JSON.stringify({ type: 'raid_revive', raidId: rid1, target: 301 }));
  room.receive(cara.c, JSON.stringify({ type: 'raid_end', raidId: rid1, cleared: false, reason: 'All party members fell — party wipe!' }));
  room.receive(alice.c, JSON.stringify({ type: 'raid_revive', raidId: rid1, target: 303 })); // target exited Cara!
  assert.equal(alice.inbox.length, 0, 'Exited member sync/revive/end and revive-on-exited-target all rejected');
  assert.equal(bob.inbox.length, 0, 'Bob receives nothing from exited member');
  assert.equal(room.partyOf(alice.c)?.raid?.id, rid1, 'Surviving Run 1 still active');
  assert.equal(room.partyOf(alice.c)?.raid?.revivesLeft, 3, 'Rejected revive on exited target spent 0 charges');

  // Active Alice sync relays to active Bob, NOT to exited Cara
  room.receive(alice.c, JSON.stringify({ type: 'raid_sync', raidId: rid1, force: true, hp: 700, maxHp: 1000, dps: 500000 }));
  assert.equal(bob.inbox.filter(m => m.type === 'raid_sync').length, 1, 'Active Bob receives Alice sync');
  assert.equal(cara.inbox.filter(m => m.type === 'raid_sync').length, 0, 'Exited Cara does not receive active raid syncs');

  // 4. Planned reauth on Bob preserves active participation in Run 1
  bob.c.reauthAt = now - 1;
  room.sweep();
  now += 100;
  bob.c = room.connect({ id: 302, username: 'Bob', gm: false, friends: [] }, raw => { bob.inbox.push(typeof raw === 'string' ? JSON.parse(raw) : raw); return true; }, () => {});
  alice.inbox.length = 0;
  now += 300;
  room.receive(bob.c, JSON.stringify({ type: 'raid_sync', raidId: rid1, force: true, hp: 850, maxHp: 1000, dps: 420000 }));
  assert.equal(alice.inbox.filter(m => m.type === 'raid_sync' && m.fromId === 302).length, 1, 'Reauthed Bob remains active in Run 1');

  // 5. Alice clears Run 1 -> Consecutive Run 2 starts immediately; test old-run isolation + scoped 10s late stats
  alice.inbox.length = 0;
  bob.inbox.length = 0;
  cara.inbox.length = 0;
  room.receive(alice.c, JSON.stringify({ type: 'raid_end', raidId: rid1, cleared: true, reason: 'boss_down', secs: 240, dps: 6000000 }));
  assert.equal(room.partyOf(alice.c)?.raid, null, 'Run 1 closed');
  assert.equal(cara.inbox.filter(m => m.type === 'raid_end').length, 0, 'Exited Cara not sent Run 1 clear');

  // Exited Cara cannot inject late final stats into Run 1's 10s grace window
  alice.inbox.length = 0;
  room.receive(cara.c, JSON.stringify({ type: 'raid_end', raidId: rid1, cleared: true, secs: 240, dps: 99999999 }));
  assert.equal(alice.inbox.length, 0, 'Exited Cara blocked from Run 1 10s final-stats grace');

  // Start Run 2 with all 3 members
  now += 500;
  room.receive(bob.c, JSON.stringify({ type: 'raid_ready', ready: true }));
  room.receive(cara.c, JSON.stringify({ type: 'raid_ready', ready: true }));
  room.receive(alice.c, JSON.stringify({ type: 'raid_start', dungeonId: 'thor' }));
  const rid2 = room.partyOf(alice.c)?.raid?.id;
  assert.ok(rid2 && rid2 !== rid1, 'Consecutive Run 2 started with distinct raidId');
  alice.inbox.length = 0;
  bob.inbox.length = 0;
  cara.inbox.length = 0;

  // Stale rid1 sync/revive during Run 2 are dropped and NEVER relabeled as rid2
  now += 2000;
  room.receive(bob.c, JSON.stringify({ type: 'raid_sync', raidId: rid1, force: true, hp: 100, maxHp: 1000, dps: 12345 }));
  room.receive(bob.c, JSON.stringify({ type: 'raid_revive', raidId: rid1, target: 301 }));
  assert.equal(alice.inbox.length, 0, 'Old-run sync/revive never relabeled or relayed into Run 2');

  // Late final-stats packet from Bob for rid1 (within 10s) keeps rid1 + statsOnly:true, goes only to rid1 participant Alice, and leaves Run 2 untouched!
  room.receive(bob.c, JSON.stringify({ type: 'raid_end', raidId: rid1, cleared: true, reason: 'boss_down', secs: 240, dps: 4800000, support: 320000 }));
  assert.equal(room.partyOf(alice.c)?.raid?.id, rid2, 'Run 2 remains active when rid1 late stats arrive');
  assert.equal(cara.inbox.length, 0, 'Cara (exited rid1) does not receive rid1 late stats');
  const lateStat = alice.inbox.find(m => m.type === 'raid_end');
  assert.ok(lateStat && lateStat.raidId === rid1 && lateStat.statsOnly === true && lateStat.dps === 4800000, 'Late stats stay scoped to rid1 with statsOnly:true');

  // Duplicate late stats from Bob or after 10s expiry are rejected
  alice.inbox.length = 0;
  room.receive(bob.c, JSON.stringify({ type: 'raid_end', raidId: rid1, cleared: true, secs: 240, dps: 4900000 }));
  assert.equal(alice.inbox.length, 0, 'Duplicate late stats from same participant rejected');
  assert.equal(alarms, 0, 'Zero DO alarms scheduled');
});

// 29. Bug 3 regression: Complete sender -> Worker -> all 3 clients revive round trip spends exactly 1 charge
await check('Bug 3: complete sender -> SocialRoom -> 3 clients revive round trip leaves every participant at 2 of 3 charges', async () => {
  let now = 8_000_000;
  const room = new SocialRoom({ now: () => now });
  const clients = [];
  for (const [id, name, cls] of [[401, 'Alice', 'Rune Knight'], [402, 'Bob', 'Arch Bishop'], [403, 'Cara', 'Warlock']]) {
    const cg = createGame(html);
    cg.ev(combatAudioJs);
    cg.ev(raidJs);
    cg.ev(`S = fresh(); S.cls = ${JSON.stringify(cls)}; S.lv = 150; S.gm = false; S.raid = { day: trialDay(), used: 0 };`);
    let sock = null;
    const queue = [];
    sock = room.connect(
      { id, username: name, gm: false, friends: [] },
      raw => { queue.push(typeof raw === 'string' ? JSON.parse(raw) : raw); return true; },
      () => {}
    );
    room.receive(sock, JSON.stringify({ type: 'join', room: 1, look: { cls, lv: 150, appearance: { sex: 'm' } } }));
    queue.length = 0;
    cg.window.PGSocial = {
      app: { id, name, connected: true, party: null },
      setRaidSuspend: () => {},
      send: payload => { room.receive(sock, JSON.stringify(payload)); }
    };
    clients.push({ id, name, cg, sock, queue });
  }

  const flushAll = () => {
    let progressed = true;
    while (progressed) {
      progressed = false;
      for (const cl of clients) {
        while (cl.queue.length) {
          progressed = true;
          const m = cl.queue.shift();
          if (m.type === 'party') cl.cg.window.PGSocial.app.party = m.party;
          else if (m.type === 'raid_lobby') cl.cg.window.PGRaid.onLobby(m);
          else if (m.type === 'raid_started') cl.cg.window.PGRaid.onStarted(m);
          else if (m.type === 'raid_sync') cl.cg.window.PGRaid.onSync(m);
          else if (m.type === 'raid_revive') cl.cg.window.PGRaid.onRevive(m);
          else if (m.type === 'raid_end') cl.cg.window.PGRaid.onEnded(m);
        }
      }
    }
  };

  try {
    const [alice, bob, cara] = clients;
    room.receive(alice.sock, JSON.stringify({ type: 'party_invite', targetId: 402 }));
    room.receive(bob.sock, JSON.stringify({ type: 'party_accept' }));
    room.receive(alice.sock, JSON.stringify({ type: 'party_invite', targetId: 403 }));
    room.receive(cara.sock, JSON.stringify({ type: 'party_accept' }));
    flushAll();

    now += 500;
    bob.cg.ev(`PGRaid.toggleReady()`);
    cara.cg.ev(`PGRaid.toggleReady()`);
    flushAll();
    now += 500;
    alice.cg.ev(`PGRaid.start('party', 'astral')`);
    flushAll();

    for (const cl of clients) {
      assert.equal(cl.cg.ev(`PGRaid.raid.on && PGRaid.raid.revivesLeft`), 3, `${cl.name} starts at 3/3 revives`);
    }

    // Alice falls in combat -> syncs downed state through SocialRoom to Bob & Cara
    now += 2000;
    alice.cg.ev(`S.hp = 0; PGRaid.onLethalHp();`);
    flushAll();
    assert.equal(alice.cg.ev(`PGRaid.raid.dead`), true, 'Alice is downed');
    assert.equal(bob.cg.ev(`PGRaid.raid.party.find(p => p.id === 401).dead`), true, 'Bob sees Alice downed');

    // Bob channels full 3s revive -> sends raid_revive -> SocialRoom broadcasts back to Alice, Bob, and Cara!
    now += 3000;
    assert.equal(bob.cg.ev(`PGRaid.revive()`), true, 'Bob starts revive channel');
    bob.cg.ev(`for (let i = 0; i < 31; i++) PGRaid.tick(0.1);`);
    flushAll();

    assert.equal(alice.cg.ev(`PGRaid.raid.dead`), false, 'Alice revived via Worker round trip');
    assert.equal(alice.cg.ev(`PGRaid.raid.revivesLeft`), 2, 'Alice at 2/3 revives');
    assert.equal(bob.cg.ev(`PGRaid.raid.revivesLeft`), 2, 'Sender Bob at 2/3 revives (not double-decremented to 1)');
    assert.equal(bob.cg.ev(`PGRaid.raid.revivesDone`), 1, 'Sender Bob credited with 1 revive (not 2)');
    assert.equal(cara.cg.ev(`PGRaid.raid.revivesLeft`), 2, 'Observer Cara at 2/3 revives');
    assert.equal(cara.cg.ev(`PGRaid.raid.party.find(p => p.id === 402).revives`), 1, 'Cara sees Bob credited with 1 revive');
    assert.equal(room.partyOf(alice.sock)?.raid?.revivesLeft, 2, 'SocialRoom tracks 2/3 revives');
  } finally {
    for (const cl of clients) cl.cg.close();
  }
});

// 30. Bug 4 regression: Held WASD/Arrow keys survive repeated keydown while one-shot actions do not repeat
await check('Bug 4: repeated keydown preserves held WASD/arrow movement without re-triggering one-shot dodge, and keyup releases', async () => {
  const kRes = g.ev(`(() => {
    S.gm = true;
    PGRaid.startDirectSolo('astral');
    const fire = (type, key, repeat = false) => {
      const ev = new window.KeyboardEvent(type, { key, repeat, bubbles: true, cancelable: true });
      window.dispatchEvent(ev);
      return ev.defaultPrevented;
    };

    const downW = fire('keydown', 'w', false);
    const afterInitialW = PGRaid.raid.keys.w;
    const repeatW1 = fire('keydown', 'w', true);
    const repeatW2 = fire('keydown', 'w', true);
    const afterRepeatW = PGRaid.raid.keys.w && PGRaid.isManualMove();

    fire('keydown', 'ArrowLeft', false);
    fire('keydown', 'ArrowLeft', true);
    const afterRepeatLeft = PGRaid.raid.keys.a;

    fire('keyup', 'w', false);
    const afterUpW = PGRaid.raid.keys.w;
    const stillLeft = PGRaid.raid.keys.a;
    fire('keyup', 'ArrowLeft', false);
    const afterUpLeft = PGRaid.raid.keys.a;

    // One-shot Dodge on Space: initial keydown dodges once; repeated keydown after cooldown does NOT auto-dodge
    PGRaid.raid.dodgeCd = 0;
    const spaceInitialPrevented = fire('keydown', ' ', false);
    const dodgedOnInitial = PGRaid.raid.dodgeCd > 0;
    PGRaid.raid.dodgeCd = 0;
    PGRaid.raid.iframes = 0;
    const spaceRepeatPrevented = fire('keydown', ' ', true);
    const dodgedOnRepeat = PGRaid.raid.dodgeCd > 0;

    PGRaid.leave({ silent: true });
    PGRaid.hideResult();
    return {
      downW, afterInitialW, repeatW1, repeatW2, afterRepeatW,
      afterRepeatLeft, afterUpW, stillLeft, afterUpLeft,
      spaceInitialPrevented, dodgedOnInitial, spaceRepeatPrevented, dodgedOnRepeat
    };
  })()`);

  assert.equal(kRes.downW && kRes.afterInitialW, true, 'Initial W keydown engages forward movement');
  assert.equal(kRes.repeatW1 && kRes.repeatW2 && kRes.afterRepeatW, true, 'Repeated W keydown keeps W held and manual movement active');
  assert.equal(kRes.afterRepeatLeft, true, 'Repeated ArrowLeft keydown keeps left movement held');
  assert.equal(kRes.afterUpW === false && kRes.stillLeft === true, true, 'W keyup releases W while ArrowLeft remains held');
  assert.equal(kRes.afterUpLeft, false, 'ArrowLeft keyup releases left movement');
  assert.equal(kRes.spaceInitialPrevented && kRes.dodgedOnInitial, true, 'Initial Space keydown triggers dodge');
  assert.equal(kRes.spaceRepeatPrevented === true && kRes.dodgedOnRepeat === false, true, 'Repeated Space keydown prevents scroll without re-triggering dodge');
});

// 31. Bug 5 regression: Raid eligibility requires Base Lv 120+ and at least 3rd-Job class (with intentional GM bypass)
await check('Bug 5: Raid eligibility rejects Novice/1st/2nd jobs (even at Lv120-150) & <Lv120 3rd/4th jobs, accepts Lv120+ 3rd & 4th jobs, and retains GM bypass', async () => {
  const elig = g.ev(`(() => {
    const testCase = (cls, lv, gm = false, cloudGm = false) => {
      S = fresh();
      S.cls = cls;
      S.lv = lv;
      S.gm = gm;
      CLOUD.gm = cloudGm;
      S.raid = { day: trialDay(), used: 0 };
      const apiOk = PGRaid.canEnter('solo', 'astral').ok;
      openTab('raid');
      const btn = document.querySelector('[data-a="raidsolo"]');
      const uiOk = Boolean(btn && !btn.disabled);
      return { apiOk, uiOk };
    };

    const r = {
      novice120: testCase('Novice', 120),
      novice150: testCase('Novice', 150),
      first120: testCase('Swordman', 120),
      expandedFirst150: testCase('Ninja', 150),
      second120: testCase('Knight', 120),
      second150: testCase('Crusader', 150),
      third119: testCase('Lord Knight', 119),
      third120: testCase('Lord Knight', 120),
      thirdAlt120: testCase('Paladin', 120),
      third150: testCase('High Wizard', 150),
      fourth119: testCase('Rune Knight', 119),
      fourth120: testCase('Rune Knight', 120),
      fourth150: testCase('Warlock', 150),
      soloAdv120: testCase('Kagerou & Oboro', 120),
      gmBypass: testCase('Novice', 1, true, false),
      cloudGmBypass: testCase('Novice', 1, false, true)
    };
    CLOUD.gm = false;
    S.gm = true;
    return r;
  })()`);

  for (const k of ['novice120', 'novice150', 'first120', 'expandedFirst150', 'second120', 'second150', 'third119', 'fourth119']) {
    assert.equal(elig[k].apiOk === false && elig[k].uiOk === false, true, `${k} must be rejected in both PGRaid and Dungeons UI`);
  }
  for (const k of ['third120', 'thirdAlt120', 'third150', 'fourth120', 'fourth150', 'soloAdv120', 'gmBypass', 'cloudGmBypass']) {
    assert.equal(elig[k].apiOk === true && elig[k].uiOk === true, true, `${k} must be accepted in both PGRaid and Dungeons UI`);
  }
});

// 32. v466: Dungeons Mobs & Drops panel keeps every drop row inside the panel grid
check('v466: Dungeons drops are a bounded 2x2 grid, so the Raid Titles row never overlaps the entry buttons', () => {
  g.ev(`S=fresh(); S.cls='Lord Knight'; S.lv=150; S.gm=false; S.raid={day:trialDay(),used:0}; openTab('raid');`);
  const grid = g.ev(`(() => {
    dungeonMode='raid'; ACT.raiddungeon('astral');
    const boxes=[...document.querySelectorAll('.raid-detail-cols .raid-detail-box')];
    const dropBox=boxes[boxes.length-1];
    return {
      boxes: boxes.length,
      dropRowsInBox: dropBox.querySelectorAll('.raid-drop-rows .raid-drop-row').length,
      strayRows: dropBox.querySelectorAll(':scope > .raid-drop-row').length,
      labels: [...dropBox.querySelectorAll('.raid-drop-row span')].map(e=>e.textContent).join('|'),
      values: [...dropBox.querySelectorAll('.raid-drop-row b')].map(e=>e.textContent).join('|')
    };
  })()`);
  assert.equal(grid.dropRowsInBox, 4, 'all 4 drop rows (Solo, Party, Boss Card, Raid Titles) live inside the drops box');
  assert.equal(grid.strayRows, 0, 'no drop row escapes the drops box container');
  assert.match(grid.labels, /Raid Titles/, 'Raid Titles row is still listed');
  assert.match(grid.values, /5 Lightning Titles · 10% Drop · 10\/20\/30 Clears/, 'Raid Titles value stays short enough for the grid cell');

  assert.match(raidCss, /\.raid-detail-cols \{[^}]*grid-template-rows:\s*minmax\(0,\s*1fr\)/, '.raid-detail-cols bounds its row so the boxes cannot grow past the panel');
  assert.match(raidCss, /\.raid-detail-box \{[^}]*overflow-y:\s*auto/, '.raid-detail-box scrolls inside itself instead of spilling over the entry buttons');
  assert.match(raidCss, /\.raid-detail-box \{[^}]*overflow-x:\s*hidden/, '.raid-detail-box never scrolls sideways');
  assert.match(raidCss, /\.raid-drop-rows \{[^}]*display:\s*grid[^}]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)[^}]*grid-auto-rows:\s*minmax\(min-content,\s*1fr\)/, '.raid-drop-rows is a bounded 2x2 grid that keeps each cell readable');
  assert.match(raidCss, /\.raid-drop-row \{[^}]*overflow:\s*hidden/, 'a drop cell clips its own text instead of pushing the grid taller');
  assert.match(raidCss, /\.raid-mob-chips \{[^}]*grid-auto-rows:\s*minmax\(min-content,\s*1fr\)/, 'the monster roster grid is bounded the same way');
});

// 33. v466: Party Ready Room shows the party roster as character previews (no stage list) and invites directly
check('v466: Party Ready Room replaces the stage list with 3 character-preview slots and invites trainers from the room', () => {
  g.ev(`
    window.__raidSent=[]; window.__raidEntered=false;
    window.PGSocial={
      app:{id:20,room:1,connected:true,party:null,partyRoster:[],players:new Map([
        [31,{id:31,name:'Cara',room:1}],
        [32,{id:32,name:'Dana',room:1}],
        [40,{id:40,name:'Elsewhere',room:2}]
      ])},
      send:m=>{window.__raidSent.push(m);return true},
      setRaidSuspend:()=>{},
      enter:()=>{window.__raidEntered=true}
    };
    S=fresh(); S.cls='Rune Knight'; S.lv=150; S.gm=false;
    S.raid={day:trialDay(),used:0};
    PGRaid.showLobby('party','astral');
  `);
  const room = g.ev(`({
    slots: document.querySelectorAll('#raidLobbyBody .raid-ready-grid .raid-ready-card').length,
    portraits: document.querySelectorAll('#raidLobbyBody canvas.raid-portrait-canvas').length,
    emptySlots: document.querySelectorAll('#raidLobbyBody .raid-ready-card.is-empty').length,
    selfSlot: document.querySelectorAll('#raidLobbyBody .raid-ready-card.is-self').length,
    hasStages: Boolean(document.querySelector('#raidLobbyBody .raid-stages-grid')),
    mentionsStage: document.getElementById('raidLobbyBody').textContent.includes('Starlit Approach'),
    options: [...document.querySelectorAll('#raidPartyInvitee option')].map(o=>o.value).join(','),
    disabled: Boolean(document.querySelector('#raidPartyInvitee').disabled) || document.querySelector('[data-raid-act="invite"]').disabled,
    note: document.querySelector('#raidLobbyBody .raid-party-invite-note').textContent
  })`);
  assert.equal(room.slots, 3, 'Ready Room renders 3 party slots even before a party forms');
  assert.equal(room.selfSlot, 1, 'slot 1 is your own live character preview');
  assert.equal(room.selfSlot + room.emptySlots, 3, 'the other two slots are open party slots');
  assert.equal(room.portraits, 1, 'your character preview canvas is painted');
  assert.equal(room.hasStages, false, 'the old stage list is removed from the Ready Room');
  assert.equal(room.mentionsStage, false, 'no stage names leak into the Ready Room any more');
  assert.equal(room.options, '31,32', 'only free trainers in the same plaza are offered (self, taken and other rooms excluded)');
  assert.equal(room.disabled, false, 'invite controls are enabled in the plaza');
  assert.match(room.note, /party pop-up/, 'note explains the invite opens their party pop-up');

  // Sending the invite goes straight through the plaza party channel
  g.ev(`const sel=document.getElementById('raidPartyInvitee'); sel.value='31'; document.querySelector('[data-raid-act="invite"]').click();`);
  assert.equal(g.ev(`window.__raidSent.length`), 1, 'one party invite was sent');
  assert.equal(g.ev(`window.__raidSent[0].type`), 'party_invite', 'direct invite uses the existing party_invite message');
  assert.equal(g.ev(`window.__raidSent[0].targetId`), 31, 'invite targets the chosen trainer');
  assert.match(g.ev(`document.querySelector('#raidLobbyBody .raid-party-invite-note').textContent`), /Party invite sent to Cara/, 'the room confirms the invite it sent');

  // A 2-player party keeps the preview grid (no stage list) and its Ready/chat controls
  g.ev(`
    window.PGSocial.app.party={id:'party:77',leader:20,members:[{id:20,name:'Bob'},{id:31,name:'Cara'}]};
    PGRaid.onLobby({partyId:'party:77',leader:20,dungeonId:'astral',members:[
      {id:20,name:'Bob',cls:'Rune Knight',lv:150,ready:true,leader:true},
      {id:31,name:'Cara',cls:'Arch Bishop',lv:148,ready:false}
    ]});
  `);
  assert.equal(g.ev(`document.querySelectorAll('#raidLobbyBody canvas.raid-portrait-canvas').length`), 2, '- a real party paints both member previews');
  assert.equal(g.ev(`Boolean(document.querySelector('#raidLobbyBody .raid-stages-grid'))`), false, '- the stage list stays gone with a live party');
  assert.ok(g.ev(`Boolean(document.querySelector('#raidLobbyBody #raidLobbyChatForm'))`), '- party raid chat is still available');
  assert.equal(g.ev(`Boolean(document.querySelector('#raidPartyInvitee'))`), true, '- the leader can still invite the third slot');

  // A non-leader cannot invite (the Worker rejects it), so the room says who can
  g.ev(`window.PGSocial.app.id=31; PGRaid.renderLobby();`);
  assert.equal(g.ev(`Boolean(document.querySelector('#raidPartyInvitee'))`), false, '- party members see no invite picker');
  assert.match(g.ev(`document.querySelector('#raidLobbyBody .raid-party-invite-note').textContent`), /Only the Party Leader can invite/, '- members are told the leader invites');
  g.ev(`window.PGSocial.app.id=20; window.PGSocial.app.party={id:'party:78',leader:20,members:[{id:20,name:'Bob'}]}; PGRaid.onLobby({partyId:'party:78',leader:20,dungeonId:'astral',members:[{id:20,name:'Bob',cls:'Rune Knight',lv:150,ready:true,leader:true}]});`);
  assert.match(g.ev(`document.querySelector('#raidLobbyBody .raid-party-empty span').textContent`), /alone in this party/, '- a one-person party is described honestly');
  assert.equal(g.ev(`Boolean(document.querySelector('#raidPartyInvitee'))`), true, '- the lone leader still gets the invite picker');

  // Outside the plaza the same row becomes one click into the plaza, keeping this Ready Room open
  g.ev(`
    window.PGSocial.app.party=null; window.PGSocial.app.room=0; window.__raidEntered=false;
    PGRaid.showLobby('party','astral');
  `);
  assert.equal(g.ev(`Boolean(document.querySelector('#raidPartyInvitee').disabled)`), true, 'invite select is disabled when not in a plaza');
  assert.match(g.ev(`document.querySelector('#raidLobbyBody .raid-party-invite-note').textContent`), /Fountain Plaza/, 'the note explains invites need the Fountain Plaza');
  assert.equal(g.ev(`document.querySelector('[data-raid-act="invite"]') === null`), true, 'no dead Send Invite button is offered outside the plaza');
  assert.match(g.ev(`document.querySelector('[data-raid-act="plaza"]').textContent`), /Enter Plaza/, 'the off-plaza action is the one-click Enter Plaza & Invite');
  g.ev(`document.querySelector('[data-raid-act="plaza"]').click();`);
  assert.equal(g.ev(`window.__raidEntered`), true, 'Enter Plaza & Invite walks the player into the plaza');
  assert.equal(g.ev(`document.getElementById('raidLobby').hidden`), false, 'the Ready Room stays open so the invite list can fill in');
  g.ev(`PGRaid.hideLobby();`);
});

// 34. v466: each dungeon only drops its own Raid Boss Card
check('v466: Astral Citadel only drops the Sovereign Thanatos Card and Thor Volcano only the Primordial Ifrit Card', () => {
  const drops = g.ev(`(() => {
    const oldR=Math.random;
    const run=(dungeon,roll)=>{
      S.cards=[];
      S.raid={day:trialDay(),used:0,clears:0,bestSolo:0,bestParty:0};
      Math.random=()=>roll;
      PGRaid.start('solo',dungeon);
      PGRaid.finish(true,'clear',false);
      Math.random=oldR;
      return {name:PGRaid.raid.result.rewards.bossCardDrop, keys:S.cards.map(c=>c.cardKey).join(',')};
    };
    return {
      astral: run('astral',0.01),
      thor: run('thor',0.01),
      astralNoDrop: run('astral',0.95),
      thorNoDrop: run('thor',0.95)
    };
  })()`);
  assert.equal(drops.astral.name, 'Sovereign Thanatos Card', 'Astral Citadel clear drops the Sovereign Thanatos Card');
  assert.equal(drops.astral.keys, 'raid:matk', 'Astral Citadel never drops the Ifrit card');
  assert.equal(drops.thor.name, 'Primordial Ifrit Card', 'Thor Volcano clear drops the Primordial Ifrit Card');
  assert.equal(drops.thor.keys, 'raid:atk', 'Thor Volcano never drops the Thanatos card');
  assert.equal(drops.astralNoDrop.name, null, 'a failed Astral roll drops no card');
  assert.equal(drops.thorNoDrop.name, null, 'a failed Thor roll drops no card');
  assert.match(raidJs, /bossCardKey: 'raid:matk'/, 'Astral dungeon metadata pins the Thanatos card');
  assert.match(raidJs, /bossCardKey: 'raid:atk'/, 'Thor dungeon metadata pins the Ifrit card');
  g.ev(`
    if(!tabs.includes('map'))openTab('raid'); else { mapSeason='dungeons'; dungeonMode='raid'; renderWin(); }
    ACT.raiddungeon('astral');
  `);
  const astralText = g.ev(`document.querySelectorAll('.raid-detail-cols .raid-detail-box')[1].textContent`);
  assert.match(astralText, /Sovereign Thanatos · \+15% MATK/, 'Astral drops panel advertises only the Thanatos card');
  assert.equal(/Primordial Ifrit/.test(astralText), false, 'Astral drops panel does not advertise the Ifrit card');
  g.ev(`ACT.raiddungeon('thor');`);
  const thorText = g.ev(`document.querySelectorAll('.raid-detail-cols .raid-detail-box')[1].textContent`);
  assert.match(thorText, /Primordial Ifrit · \+15% ATK/, 'Thor drops panel advertises only the Ifrit card');
  assert.equal(/Sovereign Thanatos/.test(thorText), false, 'Thor drops panel does not advertise the Thanatos card');
  g.ev(`ACT.raiddungeon('astral');`);
});

// 35. v466: the Weapon Star rate table fits its sidebar grid without the boost column
check('v466: Weapon Star rate table drops the +Boost column and fits four columns inside the workshop sidebar', () => {
  g.ev(`
    S=fresh(); S.cls='Rune Knight'; S.lv=150; S.zeny=500000000; S.ascensionMat=[200,200,50];
    S.eq.weapon={id:99111,name:'Starfall Katar',slot:'weapon',wt:'katar',sec:6,ascSet:'starfall',val:420,r:15,aff:[],cards:[],slots:4,stars:4};
    if(S.eq.off)S.eq.off=null;
    selE='weapon';
    if(!tabs.includes('equip'))openTab('equip');
    sub.equip='refine'; renderWin(); ACT.refinemode('star');
  `);
  const table = g.ev(`({
    headers: document.querySelectorAll('.star-rate-table thead th').length,
    headText: document.querySelector('.star-rate-table thead').textContent,
    rows: document.querySelectorAll('.star-rate-table tbody tr').length,
    cells: document.querySelector('.star-rate-table tbody tr').children.length,
    boostCard: Boolean(document.querySelector('.star-boost-card')),
    currentRow: document.querySelector('.star-rate-table tbody tr.cur')?.textContent
  })`);
  assert.equal(table.headers, 4, 'rate table has exactly 4 columns (★, Base, Shards, Zeny)');
  assert.equal(/Boost/i.test(table.headText), false, 'the +Boost header is gone');
  assert.equal(table.rows, 20, 'all 20 star rows still listed');
  assert.equal(table.cells, 4, 'each row renders 4 cells, so nothing needs horizontal scrolling');
  assert.equal(table.currentRow, '★540%56M', 'the next-star row is still highlighted and shows ★, base rate, shards and Zeny');
  assert.equal(table.boostCard, true, 'the Astral Shard boost picker above the table still works');
  assert.match(raidCss, /\.star-rate-table \{[^}]*table-layout:\s*fixed/, 'rate table uses a fixed layout so its columns fit the sidebar');
  assert.match(raidCss, /\.star-rate-table th:last-child,\s*\n\.star-rate-table td:last-child \{[^}]*width:\s*26%/, 'the Zeny column is pinned to its share of the grid');
});

g.close();
console.log(`\nPASS: ${pass}/${pass} Astral Raid checks passed`);
