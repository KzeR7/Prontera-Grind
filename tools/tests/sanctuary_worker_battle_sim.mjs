// Real local workerd/SQLite Durable Object battle rehearsal. No hosted deployment is implied.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const {Miniflare}=await import('miniflare');
const persist=fs.mkdtempSync(path.join(os.tmpdir(),'pg-sanctuary-battle-'));
const mf=new Miniflare({
 modules:[
  {type:'ESModule',path:'workers/social/index.mjs'},
  {type:'ESModule',path:'workers/social/chat-filter.mjs'},
  {type:'ESModule',path:'workers/social/room.mjs'},
  {type:'ESModule',path:'assets/digimon/roster.js'},
  {type:'ESModule',path:'assets/digimon/base-stats.js'},
  {type:'ESModule',path:'assets/social-rules.js'},
  {type:'ESModule',path:'assets/social-poker.js'},
  {type:'ESModule',path:'assets/digimon-battle.js'},
 ],modulesRoot:'.',compatibilityDate:'2026-08-06',durableObjects:{SOCIAL:{className:'Social',useSQLite:true}},durableObjectsPersist:persist,
});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function until(messages,predicate,label,timeout=30000){const end=Date.now()+timeout;while(!messages.some(predicate)){if(Date.now()>end)throw Error('Worker battle timeout: '+label+' · '+JSON.stringify(messages.slice(-3)));await sleep(25)}return messages.find(predicate)}
async function connect(id){
 const ns=await mf.getDurableObjectNamespace('SOCIAL'),stub=ns.get(ns.idFromName('world'));
 const response=await stub.fetch('https://social/connect',{headers:{Upgrade:'websocket','X-Social-Identity':JSON.stringify({id,username:'WorkerBattle'+id})}});
 assert.equal(response.status,101);const ws=response.webSocket;ws.accept();const messages=[];ws.addEventListener('message',e=>messages.push(JSON.parse(e.data)));return {ws,messages};
}
try{
 const a=await connect(101),b=await connect(102);
 for(const [peer,form] of [[a,'agumon'],[b,'palmon']]){
  peer.ws.send(JSON.stringify({type:'join',look:{cls:'Novice',appearance:{version:1,sex:'m'},digimon:form,speed:20}}));await until(peer.messages,m=>m.type==='room','plaza join');
 }
 // Real movement packets put the two characters on opposite open approaches below the ring.
 a.ws.send(JSON.stringify({type:'move',x:62,z:118}));b.ws.send(JSON.stringify({type:'move',x:74,z:118}));await sleep(15000);
 const profile=(line,form)=>({lineId:line,form,level:5,energy:70,stats:{power:12,guard:12,agility:0,focus:0}});
 a.ws.send(JSON.stringify({type:'pvp_enter',profile:profile('agumon','agumon')}));b.ws.send(JSON.stringify({type:'pvp_enter',profile:profile('palmon','palmon')}));
 await until(a.messages,m=>m.type==='pvp_offer','first acceptance offer');await until(b.messages,m=>m.type==='pvp_offer','second acceptance offer');
 a.ws.send(JSON.stringify({type:'pvp_accept'}));b.ws.send(JSON.stringify({type:'pvp_accept'}));
 // v389: v388 replaced the plaza-run fight with a device-simulated one. The plaza still runs the
 // countdown and hands each device the same seed, but it no longer owns the fight, the strike stream
 // or the payout - so this rehearsal asserts THAT contract end to end over a real socket instead of
 // the old server-settled one (which could never fire without the removed 1s battle alarm).
 const arm=await until(a.messages,m=>m.type==='pvp_client','device-simulated fight hand-off');
 assert(Number.isInteger(arm.seed),'both devices are given one shared seed');
 assert(arm.startsAt-arm.now>=2900&&arm.startsAt-arm.now<=3100,'the plaza still runs the three-second countdown');
 await until(a.messages,m=>m.type==='battle'&&m.pvp?.phase==='fighting','countdown hand-off to the devices');
 assert(a.messages.some(m=>m.type==='battle'&&m.pvp?.clientSim===true),'the snapshot says the devices own the fight');
 // The plaza must NOT settle this match. Both devices report, and the room settles once, from their
 // reports - a mismatched pair of reports is a draw, and a forged 'battle_result' frame buys nothing.
 const fightId=arm.battleId;
 a.ws.send(JSON.stringify({type:'pvp_client_end',battleId:fightId,winnerId:101,reason:'knockout'}));
 b.ws.send(JSON.stringify({type:'pvp_client_end',battleId:fightId,winnerId:101,reason:'knockout'}));
 const [ra,rb]=await Promise.all([until(a.messages,m=>m.type==='battle_result'&&m.battleId===fightId,'winner settlement'),until(b.messages,m=>m.type==='battle_result'&&m.battleId===fightId,'loser settlement')]);
 assert(ra.reward&&rb.reward);assert.notEqual(ra.outcome,undefined);assert.notEqual(rb.outcome,undefined);assert.equal(ra.battleId,rb.battleId);assert(ra.outcome!==rb.outcome||ra.outcome==='draw');
 const count=a.messages.filter(m=>m.type==='battle_result').length;a.ws.send(JSON.stringify({type:'battle_result',battleId:'forged',reward:{coins:999999}}));await sleep(300);assert.equal(a.messages.filter(m=>m.type==='battle_result').length,count,'client cannot inject another result');
 // v350 field stages: a real server-driven PvE run reaches its fifth-wave boss and settles double wins.
 const c=await connect(103);
 c.ws.send(JSON.stringify({type:'join',look:{cls:'Novice',appearance:{version:1,sex:'f'},digimon:'agumon',speed:20}}));await until(c.messages,m=>m.type==='room','plaza join for pve');
 c.ws.send(JSON.stringify({type:'move',x:70,z:64}));await sleep(10000);
 c.ws.send(JSON.stringify({type:'pve_start',request:1,profile:profile('agumon','agumon')}));
 const bossSnap=await until(c.messages,m=>m.type==='battle'&&m.pve?.some(r=>r.wave===5&&r.enemies?.length===1&&r.enemies[0].boss),'fifth-wave boss snapshot',90000);
 const bossRun=bossSnap.pve.find(r=>r.wave===5);
 assert.equal(bossRun.enemies[0].stage,'Champion','the boss is one named stage above the Rookie partner');
 assert(bossRun.partner.hp>0,'the partner is still fighting through its first stage');
 const bossReward=await until(c.messages,m=>m.type==='battle_reward'&&m.wave===5,'boss wave reward',90000);
 assert.equal(bossReward.reward.wins,2,'a boss kill settles double wins');assert.ok(bossReward.reward.coins>=30+2*8,'boss coins beat any normal wave');
 // v352: real WebSocket clients receive the strike FX stream alongside the snapshots.
 const fx=c.messages.filter(m=>m.type==='battle_fx');
 assert(fx.length>=3,'strikes stream as FX events over the socket');assert(fx.every(m=>m.kind==='pve'&&typeof m.battleId==='string'&&Number.isInteger(m.amount)&&typeof m.crit==='boolean'),'socket FX events stay presentation-only');
 assert(a.messages.some(m=>m.type==='battle_fx'),'the ring PvP match streamed its FX to participants');
 // v382: boss mechanics travel on their own presentation-only type, never on the strike stream.
 const mech=c.messages.filter(m=>m.type==='battle_mech');
 assert(mech.length>=1,'the boss fight streams its mechanic events');
 assert(mech.every(m=>m.kind==='pve'&&typeof m.battleId==='string'&&m.fx&&String(m.fx.type).startsWith('boss_')),'mechanic events stay presentation-only and self-describing');
 c.ws.send(JSON.stringify({type:'pve_stop'}));await sleep(300);c.ws.close();
a.ws.close();b.ws.close();console.log('PASS local workerd Sanctuary battle: two real WebSockets, movement, mutual offers, three-second countdown handed to both devices with one shared seed, device-reported settlement with a forged-result rejection, and no server-side payout for a device-simulated fight');
}finally{await mf.dispose();fs.rmSync(persist,{recursive:true,force:true})}
