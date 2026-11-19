// End-to-end player-character Rift Raid checks: real Pages handler SQL + real Social Durable Object
// routing, without Cloudflare network services. Run: node tools/tests/player_raid_sim.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {tokenHash} from '../../functions/_lib/auth.js';
import {Social} from '../../workers/social/index.mjs';
import * as grantsApi from '../../functions/api/grants.js';
import {RAID_RULES,raidDayKey,raidPhaseHp,expectedRaidStarSpend,rollRaidClear,rollPityChest,rollFracturedChest,rollRaidStarUpgrade,raidCardRank,raidCardArmorPen,raidWeaponArmorPen} from '../../functions/_lib/raid-rules.js';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
assert.deepEqual([0,1,2,4,5,9,10].map(raidCardRank),[0,1,2,2,3,3,4]);
assert.deepEqual([0,1,2,4,5,9,10].map(raidCardArmorPen),[0,.05,.09,.09,.12,.12,.15], 'no card grants no raid penetration; account copies cross the documented ranks');
assert.equal(raidWeaponArmorPen(20),.10,'weapon penetration caps at ten percent');
const realNow=Date.now;let clock=realNow();Date.now=()=>clock;
const sqlite=new DatabaseSync(':memory:');
for(const name of fs.readdirSync(path.join(root,'migrations')).filter(n=>/^\d+_.*\.sql$/.test(n)).sort())sqlite.exec(fs.readFileSync(path.join(root,'migrations',name),'utf8'));
function d1(){
 const wrap=(stmt,args=[],sql='')=>({
  _stmt:stmt,_args:args,_sql:sql,
  bind:(...more)=>wrap(stmt,args.concat(more),sql),
  first:async()=>stmt.get(...args)??null,
  all:async()=>({results:stmt.all(...args)}),
  run:async()=>({success:true,meta:stmt.run(...args)}),
 });
 return {
  prepare:sql=>wrap(sqlite.prepare(sql),[],sql),
  batch:async statements=>{
   sqlite.exec('BEGIN IMMEDIATE');
   try{const out=statements.map(s=>({success:true,meta:s._stmt.run(...s._args)}));sqlite.exec('COMMIT');return out}
   catch(error){sqlite.exec('ROLLBACK');throw error}
  },
 };
}
const DB=d1();
const storageMap=new Map();let alarmWrites=0;
const storage={
 get:async key=>storageMap.get(key),put:async(key,value)=>storageMap.set(key,structuredClone(value)),
 list:async({prefix='' }={})=>new Map([...storageMap].filter(([k])=>String(k).startsWith(prefix))),
 delete:async key=>storageMap.delete(key),getAlarm:async()=>null,setAlarm:async()=>{alarmWrites++},
};
const social=new Social({storage});
await social.ready;
social.room.now=()=>clock;
const plazaRaidLook=social.room.cleanLook({cls:'Novice',appearance:{version:1,sex:'m'},raidTitleId:'riftbreaker',raidTitle:'spoofed title',raidTitleColor:'#000000',raidAuraId:'fracture-spark',raidAuraColor:'#000000',raidAuraPattern:'malicious'});
assert.equal(plazaRaidLook.raidTitle,'Riftbreaker');assert.equal(plazaRaidLook.raidTitleColor,'#ffd08a','plaza derives title palette from the raid allow-list');
assert.equal(plazaRaidLook.raidAuraColor,'#ff986b');assert.equal(plazaRaidLook.raidAuraPattern,'compass','plaza does not trust client title text or aura styling');
const unknownRaidLook=social.room.cleanLook({cls:'Novice',appearance:{version:1,sex:'m'},raidTitleId:'fake-title',raidAuraId:'fake-aura'});
assert.equal(unknownRaidLook.raidTitle,'');assert.equal(unknownRaidLook.raidAuraId,'','unknown raid cosmetics are discarded by Social look relay');
// A plaza may hold many unrelated active encounters. Both persistence and hydration retain all
// active runs while limiting only the settled-run cache to its latest 100 records.
const retentionMap=new Map(),retentionStorage={
 get:async key=>retentionMap.get(key),put:async(key,value)=>retentionMap.set(key,structuredClone(value)),
 list:async({prefix='' }={})=>new Map([...retentionMap].filter(([k])=>String(k).startsWith(prefix))),
 delete:async key=>retentionMap.delete(key),getAlarm:async()=>null,setAlarm:async()=>{},
};
const retentionWriter=new Social({storage:retentionStorage});await retentionWriter.ready;
const terminalRuns=Array.from({length:105},(_,i)=>({id:'terminal:'+i,state:'failed',members:[{id:i+1}],phaseHps:[15,15,15,55]}));
const liveRuns=Array.from({length:101},(_,i)=>({id:'live:'+i,state:'active',members:[{id:1000+i}],phaseHps:[15,15,15,55]}));
retentionWriter.saveRaidRuns([...terminalRuns,...liveRuns]);assert.equal(await retentionWriter.flushRaidState(),true);
const retentionReader=new Social({storage:retentionStorage});await retentionReader.ready;
assert.equal([...retentionReader.room.raidRuns.values()].filter(r=>r.state==='active').length,101,'all active runs survive storage hydration');
assert.equal([...retentionReader.room.raidRuns.values()].filter(r=>r.state!=='active').length,100,'only the settled-run cache is capped');
// Pre-start Social parties and invites also survive a DO restart; invite expiry remains bounded.
const partyStorageMap=new Map(),partyStorage={
 get:async key=>partyStorageMap.get(key),put:async(key,value)=>partyStorageMap.set(key,structuredClone(value)),
 list:async({prefix='' }={})=>new Map([...partyStorageMap].filter(([k])=>String(k).startsWith(prefix))),
 delete:async key=>partyStorageMap.delete(key),getAlarm:async()=>null,setAlarm:async()=>{},
};
const partyWriter=new Social({storage:partyStorage});await partyWriter.ready;
const lobbyLeader={id:700,name:'LobbyLeader',room:2,look:{cls:'Novice',appearance:{version:1,sex:'m'}},send(){},close(){}},lobbyMate={id:701,name:'LobbyMate',room:2,look:{cls:'Knight',appearance:{version:1,sex:'f'}},send(){},close(){}},lobbyInvitee={id:702,name:'LobbyInvitee',room:2,look:{cls:'Archer',appearance:{version:1,sex:'m'}},send(){},close(){}};
for(const c of [lobbyLeader,lobbyMate,lobbyInvitee])partyWriter.room.clients.set(c.id,c);
partyWriter.room.raidPartyCreate(lobbyLeader,{open:true});const lobby=partyWriter.room.raidPartyOf(lobbyLeader);
partyWriter.room.raidPartyJoin(lobbyMate,{partyId:lobby.id});partyWriter.room.raidPartyReady(lobbyLeader,{ready:true});partyWriter.room.raidPartyReady(lobbyMate,{ready:true});partyWriter.room.raidPartyInvite(lobbyLeader,{targetId:lobbyInvitee.id},Date.now());
assert.equal(await partyWriter.flushRaidState(),true);
const partyReader=new Social({storage:partyStorage});await partyReader.ready;
assert.equal(partyReader.room.raidPartyOf({id:700})?.members.length,2,'party roster survives storage hydration');
assert.deepEqual(partyReader.room.raidPartyOf({id:700})?.members.map(m=>m.ready),[true,true],'readiness survives storage hydration');
assert.equal(partyReader.room.raidPartyOf({id:700})?.members[0].look.cls,'Novice','character appearance preview survives storage hydration');
assert.equal(partyReader.room.raidInvites.has(702),true,'pending invite survives storage hydration');
partyReader.room.clients.set(702,{...lobbyInvitee,send(){},close(){}});partyReader.room.raidPartyAccept(partyReader.room.clients.get(702));
assert.equal(partyReader.room.raidPartyOf({id:700})?.members.length,3,'persisted invite can be accepted after restart');
assert.deepEqual(partyReader.room.raidPartyOf({id:700})?.members.map(m=>m.ready),[false,false,false],'adding an invitee resets readiness for the new roster');
assert.equal(await partyReader.flushRaidState(),true);
const partyFinal=new Social({storage:partyStorage});await partyFinal.ready;
assert.deepEqual(partyFinal.room.raidPartyOf({id:700})?.members.map(m=>m.id),[700,701,702]);
partyStorageMap.set('player-character-raid-parties-v1',{parties:[{id:'raid-party:expiry',room:2,leader:800,open:true,createdAt:Date.now(),members:[{id:800,name:'ExpiryLeader'}]}],invites:[{targetId:801,partyId:'raid-party:expiry',fromId:800,fromName:'ExpiryLeader',room:2,expiresAt:Date.now()-1}]});
const expiredInviteReader=new Social({storage:partyStorage});await expiredInviteReader.ready;
assert.equal(expiredInviteReader.room.raidInvites.has(801),false,'expired persisted invite is discarded during hydration');
const namespace={idFromName:name=>name,get:()=>({fetch:request=>social.fetch(request)})};
const env={DB,SOCIAL:namespace};
const module=await import(pathToFileURL(path.join(root,'functions/api/raid.js')).href);
const cookieByUser=new Map();
async function makeAccount(username,weaponId){
 const at=Date.now(),email=username+'@example.test',passHash='test-only';
 const inserted=sqlite.prepare('INSERT INTO users(username,email,pass_hash,gm,banned,created_at,fail_count,fail_at) VALUES(?,?,?,0,0,?,0,0)').run(username,email,passHash,at);
 const id=Number(inserted.lastInsertRowid),token=('raid-session-'+username+'-').padEnd(64,'x'),hash=await tokenHash(token);
 sqlite.prepare('INSERT INTO sessions(token_hash,user_id,created_at,expires_at) VALUES(?,?,?,?)').run(hash,id,at,at+90*86400000);
 cookieByUser.set(username,'pg_session='+token);
 const blob=JSON.stringify({owner:username,accountId:id,lv:150,cls:'Guillotine Cross',st:{str:120,agi:120,dex:120,luk:120,int:1,vit:120},
  eq:{weapon:{id:weaponId,slot:'weapon',sec:6,wt:'katar',name:'Mythic Rift Claw',val:100000,r:15,aff:[{k:'atk',v:300}]},head:{val:1000,aff:[]},acc1:{val:1000,aff:[]},acc2:{val:1000,aff:[]}},inv:[],pv:{hpp:0},zeny:0,ascensionMat:[0,0,0]});
 sqlite.prepare(`INSERT INTO saves(user_id,version,blob,saved_at,updated_at,last_seen,rate_kph,kills_total,level,cls,zeny,playtime)
  VALUES(?,1,?,?,?, ?,0,0,150,'Guillotine Cross',0,0)`).run(id,blob,at,at,at);
 return{id,username,weaponId};
}
const lead=await makeAccount('raid_leader','rift-katar-1');
const mate=await makeAccount('raid_mate','rift-katar-2');
const normalId='normal-weapon';
{
 const blob=JSON.parse(sqlite.prepare('SELECT blob FROM saves WHERE user_id=?').get(lead.id).blob);
 blob.inv.push({id:normalId,slot:'weapon',sec:5,wt:'sword',name:'Fine Sword',val:9000,r:0,aff:[]});
 sqlite.prepare('UPDATE saves SET blob=? WHERE user_id=?').run(JSON.stringify(blob),lead.id);
}
const request=(username,body)=>new Request('https://pg.test/api/raid',{method:'POST',headers:{Cookie:cookieByUser.get(username),'Content-Type':'application/json'},body:JSON.stringify(body)});
async function post(username,body){const response=await module.onRequestPost({request:request(username,body),env});return{status:response.status,data:await response.json()}}
async function get(username){const response=await module.onRequestGet({request:new Request('https://pg.test/api/raid',{headers:{Cookie:cookieByUser.get(username)}}),env});return{status:response.status,data:await response.json()}}
function check(condition,message){assert.ok(condition,message)}

// Malaysia's calendar key crosses at 16:00 UTC, independent of the sandbox's timezone.
assert.equal(raidDayKey(Date.UTC(2026,0,1,15,59,59)),'2026-01-01');
assert.equal(raidDayKey(Date.UTC(2026,0,1,16,0,0)),'2026-01-02');
assert.equal(RAID_RULES.dayTimeZone,'Asia/Kuala_Lumpur');
assert.deepEqual(raidPhaseHp(100),[15,15,15,55]);
assert.ok(Math.abs(expectedRaidStarSpend()-852.126)<0.01);
assert.equal(rollPityChest().riftShards,10);
assert.equal(rollPityChest({partySize:2,rng:()=>0}).riftShards,11,'duo Pity Chests receive the stackable-reward bonus');
assert.equal(rollPityChest({partySize:3,rng:()=>0}).riftShards,12,'trio Pity Chests receive the stackable-reward bonus');
assert.equal(rollFracturedChest({partySize:2,rng:()=>0}).riftShards,6,'duo Fractured Chest fractions round stochastically');
assert.equal(rollFracturedChest({partySize:2,rng:()=>.99}).riftShards,5,'fractional duo chest bonus can round down');
assert.equal(rollFracturedChest({partySize:3,rng:()=>0}).riftShards,6,'trio Fractured Chests receive the 20% stackable bonus');
assert.equal(rollFracturedChest().regionalMaterialIndex,0,'raid chests only grant Astral Shards');
assert.equal(rollRaidClear({partySize:2,rng:()=>0}).rewards.riftShards,22,'duo clear-pool Shards apply the stackable party bonus');
assert.equal(rollRaidClear({partySize:3,rng:()=>0}).rewards.riftShards,24,'trio clear-pool Shards apply the stackable party bonus');
assert.equal(rollRaidClear({partySize:3,rng:()=>0}).rewards.regionalMaterialIndex,0,'full clears only grant Astral Shards');
assert.equal(rollRaidStarUpgrade({star:0,failures:2,rng:()=>.999}).success,true,'third try is guaranteed');

// The Pages API can only talk to the DO through its authenticated Social binding.
const unauth=await social.fetch(new Request('https://social/raid/party'));
assert.equal(unauth.status,403);

// D1 atomically reserves one entry and binds the player save's weapon profile before Social install.
clock=Date.now();
const solo=await post(lead.username,{action:'start',mode:'solo'});
assert.equal(solo.status,200,JSON.stringify(solo.data));
let runId=solo.data.runId,run=social.room.raidRuns.get(runId);
assert.equal(run.partySize,1);assert.equal(run.totalHp,150_000_000);
assert.equal((await DB.prepare('SELECT COUNT(*) AS n FROM raid_entries WHERE user_id=?').bind(lead.id).first()).n,1);

// Action validation is server-side. A rejected cooldown/unknown action does not increment actions;
// repeating an accepted id returns the same result without dealing damage again.
const actionId='raid-act-first-0001';
const first=await post(lead.username,{action:'act',runId,combatAction:'strike',actionId,zone:'center'});
assert.equal(first.status,200,JSON.stringify(first.data));
const damageAfter=run.members[0].damage,actionsAfter=run.members[0].actions,hpAfter=run.hpRemaining;
const replay=await post(lead.username,{action:'act',runId,combatAction:'heavy',actionId,zone:'left'});
assert.equal(replay.status,200);assert.equal(run.members[0].damage,damageAfter);assert.equal(run.members[0].actions,actionsAfter);assert.equal(run.hpRemaining,hpAfter);
const restartedSocial=new Social({storage});await restartedSocial.ready;
assert.equal(restartedSocial.room.raidRuns.get(runId).members[0].damage,damageAfter,'DO state hydrates after a storage-backed restart');
const invalid=await post(lead.username,{action:'act',runId,combatAction:'delete-boss',actionId:'raid-act-invalid-01'});
assert.equal(invalid.status,400);assert.equal(run.members[0].actions,actionsAfter);
const outsider=await post(mate.username,{action:'act',runId,combatAction:'strike',actionId:'raid-act-outsider-01'});
assert.equal(outsider.status,403);
// Accepted action IDs remain idempotent throughout the run, not merely within a short receipt tail.
const firstReceipt=run.members[0].actionReceipts.find(x=>x.id===actionId);
run.members[0].actionReceipts=[firstReceipt,...Array.from({length:63},(_,i)=>({id:'earlier:'+i,action:'strike',at:clock}))];
clock+=run.strikeMs;
const afterReceiptWindow=await post(lead.username,{action:'act',runId,combatAction:'heavy',actionId:'raid-act-after-64-0001'});
assert.equal(afterReceiptWindow.status,200);assert.equal(run.members[0].actionReceipts.length,65,'action replay receipts are not truncated during a run');
const damageAfterLongWindow=run.members[0].damage;
clock+=run.strikeMs;
const oldReplay=await post(lead.username,{action:'act',runId,combatAction:'strike',actionId});
assert.equal(oldReplay.status,200);assert.equal(oldReplay.data.duplicate,true,'an older action retry stays idempotent after many later actions');
assert.equal(run.members[0].damage,damageAfterLongWindow,'replaying an older action never deals extra damage');

// A clear gives every reserved participant both the clear pool and a Fractured Chest, even with
// no damage/action contribution. Settlement and its grant queue are idempotent on retry.
run.members[0].damage=0;run.members[0].actions=0;run.members[0].support=0;
run.state='cleared';run.hpRemaining=0;run.phaseHp=0;run.finishedAt=run.deadlineAt-1;
clock=run.deadlineAt+100;
const originalRandom=Math.random;let settled;
try{Math.random=()=>0;settled=await post(lead.username,{action:'settle',runId})}finally{Math.random=originalRandom}
assert.equal(settled.status,200,JSON.stringify(settled.data));assert.equal(settled.data.outcome,'clear');
assert.deepEqual(new Set(settled.data.rewards.map(x=>x.kind)),new Set(['clear','fractured']));
assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM raid_chests WHERE run_id=? AND user_id=? AND kind='fractured'").get(runId,lead.id).n,1);
assert.equal(sqlite.prepare('SELECT damage+actions+support AS n FROM raid_run_members WHERE run_id=? AND user_id=?').get(runId,lead.id).n,0,'zero-contribution full clear is still recorded and rewarded');
assert.ok(sqlite.prepare("SELECT COUNT(*) AS n FROM grants WHERE user_id=? AND created_by='Rift Raid'").get(lead.id).n>=3);
const raidCardGrant=sqlite.prepare("SELECT id,payload FROM grants WHERE user_id=? AND created_by='Rift Raid' AND kind='gift' AND note LIKE '%Rift Sovereign Card%' ORDER BY id LIMIT 1").get(lead.id);
assert.ok(raidCardGrant,'a rolled Rift Sovereign Card enters the durable save-grant queue');
const raidCardGift=JSON.parse(raidCardGrant.payload);
assert.equal(raidCardGift.item.raidCard,'rift-sovereign');assert.equal(raidCardGift.item.cardKey,'raid:rift-sovereign');
assert.equal(raidCardGift.item.cardVersion,1);assert.deepEqual(raidCardGift.item.fit,[]);assert.equal(raidCardGift.amount,1);
assert.equal(sqlite.prepare('SELECT boss_card_copies FROM raid_accounts WHERE user_id=?').get(lead.id).boss_card_copies,1,'raid progression count remains D1 authoritative');
const riftAfterClear=sqlite.prepare('SELECT rift_shards FROM raid_accounts WHERE user_id=?').get(lead.id).rift_shards;
assert.equal(riftAfterClear,25,'solo clear pool and Fractured Chest both credit their rolled Rift Shards');
const grantCount=sqlite.prepare("SELECT COUNT(*) AS n FROM grants WHERE user_id=? AND created_by='Rift Raid'").get(lead.id).n;
const retry=await post(lead.username,{action:'settle',runId});
assert.equal(retry.status,200);assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM grants WHERE user_id=? AND created_by='Rift Raid'").get(lead.id).n,grantCount);
const wardrobe=await get(lead.username);assert.equal(wardrobe.status,200);
assert(wardrobe.data.account.titles.includes('riftbreaker')&&wardrobe.data.account.titles.includes('lone-star'),'clear unlocks the first-clear and solo titles');
assert(wardrobe.data.rules.titles.some(x=>x.id==='riftbreaker'&&x.color),'API supplies player-facing cosmetic metadata');
const titleEquip=await post(lead.username,{action:'equip',kind:'title',id:'riftbreaker'});assert.equal(titleEquip.status,200);assert.equal(titleEquip.data.equippedTitle,'riftbreaker');
const lockedAura=await post(lead.username,{action:'equip',kind:'aura',id:'fracture-spark'});assert.equal(lockedAura.status,403,'a cosmetic cannot be equipped before D1 unlock');
const badKind=await post(lead.username,{action:'equip',kind:'other',id:'riftbreaker'});assert.equal(badKind.status,400,'equip endpoint requires an explicit cosmetic type');
await DB.prepare('INSERT INTO raid_cosmetics(user_id,aura_id,unlocked_at) VALUES(?,?,?)').bind(lead.id,'fracture-spark',clock).run();
const auraEquip=await post(lead.username,{action:'equip',kind:'aura',id:'fracture-spark'});assert.equal(auraEquip.status,200);assert.equal(auraEquip.data.equippedAura,'fracture-spark');
const unequip=await post(lead.username,{action:'equip',kind:'title',id:'none'});assert.equal(unequip.status,200);assert.equal(unequip.data.equippedTitle,null);
assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM raid_entries WHERE user_id=?').get(lead.id).n,1,'settlement does not refund entries');

// Item binding and D1 action idempotence: a Mythic upgrade is server-rolled, costs once, and cannot
// be applied to a non-Mythic item copied into the same save.
sqlite.prepare('UPDATE raid_accounts SET rift_shards=rift_shards+1000 WHERE user_id=?').run(lead.id);
const beforeUpgrade=sqlite.prepare('SELECT rift_shards FROM raid_accounts WHERE user_id=?').get(lead.id).rift_shards;
const upgradeAction='raid-upgrade-once-0001';
const upgrade=await post(lead.username,{action:'upgrade',weaponId:lead.weaponId,actionId:upgradeAction});
assert.equal(upgrade.status,200,JSON.stringify(upgrade.data));assert.equal(upgrade.data.cost,12);
const afterUpgrade=sqlite.prepare('SELECT rift_shards FROM raid_accounts WHERE user_id=?').get(lead.id).rift_shards;
assert.equal(afterUpgrade,beforeUpgrade-12);
const upgradeReplay=await post(lead.username,{action:'upgrade',weaponId:lead.weaponId,actionId:upgradeAction});
assert.equal(upgradeReplay.status,200);assert.equal(upgradeReplay.data.starAfter,upgrade.data.starAfter);
assert.equal(sqlite.prepare('SELECT rift_shards FROM raid_accounts WHERE user_id=?').get(lead.id).rift_shards,afterUpgrade);
const notMythic=await post(lead.username,{action:'upgrade',weaponId:normalId,actionId:'raid-upgrade-normal-01'});
assert.equal(notMythic.status,404);
const saved=JSON.parse(sqlite.prepare('SELECT blob FROM saves WHERE user_id=?').get(lead.id).blob);
const upgradeRow=await DB.prepare('SELECT * FROM raid_weapon_upgrades WHERE user_id=? AND weapon_id=?').bind(lead.id,lead.weaponId).first();
const rulesModule=module._raidTest.savedProfile(saved,saved.eq.weapon,upgradeRow,0);
assert.ok(rulesModule.dps>0);
for(const copies of [0,1,2,4,5,9,10]){
 const profile=module._raidTest.savedProfile(saved,saved.eq.weapon,upgradeRow,copies);
 assert.ok(Math.abs(profile.armorPen-rulesModule.armorPen-raidCardArmorPen(copies))<1e-9,`server run profile applies ${copies} Rift card copies after weapon penetration`);
}
assert.equal(module._raidTest.savedProfile(saved,saved.eq.weapon,{stars:20},10).armorPen,.25,'fully tempered weapon and top card rank cap the intended combined bonus at 25%');

// An owned Mythic left in the bag may be upgraded but contributes no raid combat stats until equipped.
const mateSave=JSON.parse(sqlite.prepare('SELECT blob FROM saves WHERE user_id=?').get(mate.id).blob),bagOnly=structuredClone(mateSave);
const stowedWeapon=bagOnly.eq.weapon;delete bagOnly.eq.weapon;bagOnly.inv.push(stowedWeapon);
sqlite.prepare('UPDATE saves SET blob=? WHERE user_id=?').run(JSON.stringify(bagOnly),mate.id);
const bagRunStart=await post(mate.username,{action:'start',mode:'solo'});assert.equal(bagRunStart.status,200,JSON.stringify(bagRunStart.data));
const bagRun=social.room.raidRuns.get(bagRunStart.data.runId);
assert.equal(bagRun.members[0].profile.weaponId,'','bagged Mythic weapon is excluded from the combat snapshot');
assert.equal(bagRun.members[0].profile.weaponStars,0);
bagRun.state='failed';bagRun.finishedAt=bagRun.deadlineAt;bagRun.hpRemaining=bagRun.totalHp;clock=bagRun.deadlineAt+50;
const bagRunSettlement=await post(mate.username,{action:'settle',runId:bagRun.id});assert.equal(bagRunSettlement.status,200);
sqlite.prepare('UPDATE saves SET blob=? WHERE user_id=?').run(JSON.stringify(mateSave),mate.id);

// Social party membership is separate from the DigiPet party map and D1 charges every member.
const leaderClient={id:lead.id,name:lead.username,room:1,look:plazaRaidLook,send(){},close(){}};
const mateClient={id:mate.id,name:mate.username,room:1,look:plazaRaidLook,send(){},close(){}};
social.room.clients.set(lead.id,leaderClient);social.room.clients.set(mate.id,mateClient);
social.room.raidPartyCreate(leaderClient,{open:true});
const party=social.room.raidPartyOf(leaderClient);assert.ok(party);social.room.raidPartyJoin(mateClient,{partyId:party.id});
assert.deepEqual(social.room.raidRosterFor(lead.id).members.map(m=>m.ready),[false,false],'new members need an explicit ready-up');
assert.equal(social.room.raidRosterFor(lead.id).members[0].look.cls,'Novice','lobby API includes the saved character preview');
clock=Date.now();
const partyNotReady=await post(lead.username,{action:'start',mode:'party'});
assert.equal(partyNotReady.status,409);assert.match(partyNotReady.data.err,/ready up/i,'the API refuses a party before every member is ready');
social.room.raidPartyReady(leaderClient,{ready:true});
const partyHalfReady=await post(lead.username,{action:'start',mode:'party'});
assert.equal(partyHalfReady.status,409);assert.match(partyHalfReady.data.err,/every.*ready/i,'one ready member is not enough to start');
social.room.raidPartyReady(mateClient,{ready:true});
const nonLeaderStart=await post(mate.username,{action:'start',mode:'party'});
assert.equal(nonLeaderStart.status,409);assert.match(nonLeaderStart.data.err,/only its leader/i,'a ready non-leader cannot start or reserve the group run');
const partyStart=await post(lead.username,{action:'start',mode:'party'});
assert.equal(partyStart.status,200,JSON.stringify(partyStart.data));
const partyId=partyStart.data.runId,partyRun=social.room.raidRuns.get(partyId);
assert.equal(partyRun.partySize,2);assert.equal(partyRun.totalHp,360_000_000);assert.equal(partyRun.partyId,party.id);assert.equal(party.open,false,'party lobbies close while a run is active');
assert.equal((await DB.prepare('SELECT COUNT(*) AS n FROM raid_entries WHERE user_id=?').bind(lead.id).first()).n,2,'party entry consumes leader entry');
assert.equal((await DB.prepare('SELECT COUNT(*) AS n FROM raid_entries WHERE user_id=?').bind(mate.id).first()).n,2,'the inventory-only test and party run consume each member entry');
const busyMate=await post(mate.username,{action:'start',mode:'solo'});assert.equal(busyMate.status,409,'an active party raid blocks a second run for that member');
clock=partyRun.deadlineAt+50;
const failed=await post(lead.username,{action:'settle',runId:partyId});
assert.equal(failed.status,200);assert.equal(failed.data.outcome,'failed');assert.equal(partyRun.state,'failed','server deadline resolves the inactive encounter');assert.equal(party.open,true,'settlement reopens the separate Social party lobby');
for(const memberId of [lead.id,mate.id]){
 const pity=sqlite.prepare("SELECT payload FROM raid_chests WHERE run_id=? AND user_id=? AND kind='pity'").get(partyId,memberId);
 assert.ok(pity,'every failed participant receives Pity Chest');assert.equal(JSON.parse(pity.payload).riftShards,11,'duo Pity Chest receives the party bonus for every member');
}
assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM raid_run_members WHERE run_id=? AND actions=0 AND damage=0').get(partyId).n,2,'zero-contribution failure remains in the payout roster');
const third=await post(lead.username,{action:'start',mode:'solo'});
assert.equal(third.status,429,'D1 enforces two entries/day after earlier runs settle');

// There is deliberately no once-per-day Fractured Chest uniqueness constraint.
const c=await makeAccount('raid_clearer','rift-katar-3');
await DB.prepare('INSERT INTO raid_accounts(user_id,updated_at) VALUES(?,?)').bind(c.id,Date.now()).run();
const chestDay=raidDayKey(Date.now());
for(let i=0;i<2;i++){
 const id='cap-check-'+i,at=Date.now();
 await DB.prepare("INSERT INTO raid_runs(id,leader_id,party_size,total_hp,started_at,deadline_at,state) VALUES(?,?,1,100,?,?,'cleared')").bind(id,c.id,at,at+1000).run();
 await DB.prepare('INSERT INTO raid_run_members(run_id,user_id,display_name,profile_json) VALUES(?,?,?,?)').bind(id,c.id,c.username,'{}').run();
 await DB.prepare("INSERT INTO raid_chests(run_id,user_id,day_key,kind,payload,created_at) VALUES(?,?,?,'fractured',?,?)").bind(id,c.id,chestDay,JSON.stringify(rollFracturedChest()),at).run();
}
assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM raid_chests WHERE user_id=? AND day_key=? AND kind='fractured'").get(c.id,chestDay).n,2);

// Raid ledger grants survive beyond the ordinary five-day GM/mail expiry and remain claimable;
// unrelated expired grants still disappear from the pending view.
const raidZeny=sqlite.prepare("SELECT id,created_at,created_by FROM grants WHERE user_id=? AND created_by='Rift Raid' AND kind='zeny' ORDER BY id LIMIT 1").get(lead.id);
assert.ok(raidZeny);
clock=Number(raidZeny.created_at)+6*86400000+1;
const expiredAt=clock-6*86400000;
sqlite.prepare("INSERT INTO grants(user_id,kind,payload,note,created_by,created_at) VALUES(?,'zeny','{\"amount\":1}','expired fixture','GM',?)").run(lead.id,expiredAt);
const grantsResponse=await grantsApi.onRequestGet({request:new Request('https://pg.test/api/grants',{headers:{Cookie:cookieByUser.get(lead.username)}}),env});
const grantsData=await grantsResponse.json();assert.equal(grantsResponse.status,200);
assert.ok(grantsData.grants.some(g=>g.id===raidZeny.id&&g.expiresAt===null),'raid grant has no mail expiry');
const pendingCard=grantsData.grants.find(g=>g.id===raidCardGrant.id);assert(pendingCard&&pendingCard.payload.item?.raidCard==='rift-sovereign'&&pendingCard.expiresAt===null,'ordinary-card grant remains durable until the client saves it');
assert.ok(!grantsData.grants.some(g=>g.from==='GM'&&g.payload?.amount===1),'ordinary expired mail stays excluded');
const blockedCardClaim=await grantsApi.onRequestPost({request:new Request('https://pg.test/api/grants',{method:'POST',headers:{Cookie:cookieByUser.get(lead.username),'Content-Type':'application/json'},body:JSON.stringify({ids:[raidCardGrant.id]})}),env});
assert.equal((await blockedCardClaim.json()).claimed,0,'a save-backed card gift cannot be claimed before its matching receipt is saved');
const savedBeforeCard=JSON.parse(sqlite.prepare('SELECT blob FROM saves WHERE user_id=?').get(lead.id).blob);savedBeforeCard.gmReceipts=[raidCardGrant.id];
sqlite.prepare('UPDATE saves SET blob=? WHERE user_id=?').run(JSON.stringify(savedBeforeCard),lead.id);
const cardClaim=await grantsApi.onRequestPost({request:new Request('https://pg.test/api/grants',{method:'POST',headers:{Cookie:cookieByUser.get(lead.username),'Content-Type':'application/json'},body:JSON.stringify({ids:[raidCardGrant.id]})}),env});
assert.equal((await cardClaim.json()).claimed,1);assert.equal(sqlite.prepare('SELECT claimed_at FROM grants WHERE id=?').get(raidCardGrant.id).claimed_at,clock,'card grant is acknowledged only after it lands in the cloud save');
const cardClaimRetry=await grantsApi.onRequestPost({request:new Request('https://pg.test/api/grants',{method:'POST',headers:{Cookie:cookieByUser.get(lead.username),'Content-Type':'application/json'},body:JSON.stringify({ids:[raidCardGrant.id]})}),env});
assert.equal((await cardClaimRetry.json()).claimed,0,'retrying a successful card claim is harmless when the response was lost');assert.equal(sqlite.prepare('SELECT claimed_at FROM grants WHERE id=?').get(raidCardGrant.id).claimed_at,clock);
const claimResponse=await grantsApi.onRequestPost({request:new Request('https://pg.test/api/grants',{method:'POST',headers:{Cookie:cookieByUser.get(lead.username),'Content-Type':'application/json'},body:JSON.stringify({ids:[raidZeny.id]})}),env});
assert.equal(claimResponse.status,200);assert.equal(sqlite.prepare('SELECT claimed_at FROM grants WHERE id=?').get(raidZeny.id).claimed_at,clock,'persistent raid grant remains claimable after six days');

// A client cannot settle a kill timestamped after the server deadline as a clear.
clock=Date.now();const lateStart=await post(c.username,{action:'start',mode:'solo'});assert.equal(lateStart.status,200,JSON.stringify(lateStart.data));
const lateRun=social.room.raidRuns.get(lateStart.data.runId);lateRun.state='cleared';lateRun.hpRemaining=0;lateRun.finishedAt=lateRun.deadlineAt+1;clock=lateRun.deadlineAt+2;
const lateSettlement=await post(c.username,{action:'settle',runId:lateRun.id});assert.equal(lateSettlement.status,409);assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM raid_settlements WHERE run_id=?').get(lateRun.id).n,0,'late kill has no D1 settlement or rewards');

assert.equal(alarmWrites,0,'raid installs/actions do not set a DO alarm');
console.log('PASS player Rift Raid: Malaysia reset, D1 two-entry reservation, per-member party charging, leader/all-ready start gate, authoritative/idempotent actions and upgrades, no contribution floor, repeatable chests, idempotent D1 rewards and no alarms');
await social.room.ledgerWrites;
sqlite.close();Date.now=realNow;
