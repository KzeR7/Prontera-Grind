import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import {freshDb,makeEnv} from '../dev_server.js';
import {onRequestPost as register} from '../../functions/api/register.js';
import {onRequestPost as gifts} from '../../functions/api/gm/gifts.js';
import {onRequestPost as player,onRequestGet as inspect} from '../../functions/api/gm/player.js';
import {onRequestGet as claimGet,onRequestPost as claim} from '../../functions/api/grants.js';
import {onRequestGet as catalog} from '../../functions/api/gm/catalog.js';
import {onRequestGet as fishingCatalog,onRequestPost as fishingSpawn} from '../../functions/api/gm/fishing.js';
import {GM_CATALOG} from '../../functions/_lib/gm-catalog.js';
import {systemsPayload,inspectSave} from '../../functions/_lib/gm-tools.js';
const require=createRequire(import.meta.url),{createGame}=require('./helpers/game');
const sqlite=freshDb(),env=makeEnv(sqlite);let count=0;
const call=async(fn,cookie,body,url='/api/test',extraHeaders={})=>{const res=await fn({env,request:new Request('https://pg.local'+url,{method:body?'POST':'GET',headers:{'Content-Type':'application/json',Cookie:cookie||'',...extraHeaders},...(body?{body:JSON.stringify(body)}:{})})});return {res,data:await res.json()}};
const test=async(name,fn)=>{await fn();count++;console.log('ok '+name)};
let systemsGrantIds=[];
const account=async u=>{const r=await call(register,'',{u,p:'test-password-only',email:u+'@example.test'});assert.equal(r.res.status,201,'registration');return r.res.headers.get('set-cookie').split(';')[0]};
try{
 const owner=await account('OwnerTest'),normal=await account('PlayerTest'),banned=await account('SuspendedTest');
 sqlite.prepare('UPDATE users SET gm=2 WHERE id=1').run();sqlite.prepare('UPDATE users SET banned=1 WHERE id=3').run();
 const entry=GM_CATALOG.entries.find(x=>x.resource==='ori');
 await test('catalog and mass gifts require GM session',async()=>{
  assert.equal((await call(catalog,'')).res.status,401);assert.equal((await call(catalog,normal)).res.status,403);
  assert.equal((await call(gifts,normal,{catalogId:entry.id,amount:5,requestId:crypto.randomUUID()})).res.status,403);
  assert.equal((await call(catalog,owner)).data.entries.length,GM_CATALOG.entries.length);
  assert.ok(GM_CATALOG.entries.every(x=>typeof x.label==='string'&&x.label.length>0),'Every searchable entry needs a display name');
 });
 const body={kind:'gift',catalogId:entry.id,amount:7,requestId:crypto.randomUUID(),note:'test event'};
 await test('mass gift includes offline accounts, excludes suspended, and audits once',async()=>{
  const r=await call(gifts,owner,body);assert.equal(r.res.status,200,JSON.stringify(r.data));assert.equal(r.data.recipients,2);
  assert.equal(sqlite.prepare('SELECT count(*) n FROM grants').get().n,2);
  assert.equal(sqlite.prepare("SELECT count(*) n FROM events WHERE kind='gm-mass-gift'").get().n,1);
 });
 await test('retry does not duplicate gifts or add later accounts',async()=>{
  await account('LaterTest');await call(gifts,owner,body);
  assert.equal(sqlite.prepare('SELECT count(*) n FROM grants').get().n,2);
  assert.equal((await call(gifts,owner,{...body,amount:8})).res.status,409);
 });
 await test('invalid catalog, quantities and server deductions are rejected',async()=>{
  for(const b of [{...body,catalogId:'fake'},{...body,amount:1.5},{...body,amount:0},{...body,amount:1000001},{...body,kind:'zeny',amount:-5}])assert.equal((await call(gifts,owner,{...b,requestId:crypto.randomUUID()})).res.status,400);
 });
 await test('failed mass delivery rolls back the batch and audit together',async()=>{
  const before=sqlite.prepare('SELECT count(*) n FROM gm_gift_batches').get().n;
  const events=sqlite.prepare("SELECT count(*) n FROM events WHERE kind='gm-mass-gift'").get().n;
  sqlite.exec("CREATE TRIGGER fail_gift BEFORE INSERT ON grants BEGIN SELECT RAISE(ABORT,'test failure'); END");
  const r=await call(gifts,owner,{...body,requestId:crypto.randomUUID()});assert.equal(r.res.status,500);
  sqlite.exec('DROP TRIGGER fail_gift');
  assert.equal(sqlite.prepare('SELECT count(*) n FROM gm_gift_batches').get().n,before);
  assert.equal(sqlite.prepare("SELECT count(*) n FROM events WHERE kind='gm-mass-gift'").get().n,events);
 });
 await test('Fishing operations catalog and MVP endpoint are GM-only and use the private Social binding',async()=>{
  assert.equal((await call(fishingCatalog,'',null,'/api/gm/fishing')).res.status,401);
  assert.equal((await call(fishingCatalog,normal,null,'/api/gm/fishing')).res.status,403);
  const listed=await call(fishingCatalog,owner,null,'/api/gm/fishing');
  assert.equal(listed.res.status,200);assert.equal(listed.data.roomCap,50);assert.equal(listed.data.mvp.length,10);
  assert.equal((await call(fishingSpawn,normal,{room:4,species:'mvp_stormcoil'},'/api/gm/fishing')).res.status,403);
  const calls=[];let socialStatus=200,socialError={};
  env.SOCIAL={idFromName:name=>{assert.equal(name,'world');return name},get:id=>({fetch:async request=>{
    assert.equal(id,'world');const body=await request.json(),admin=JSON.parse(request.headers.get('X-Social-Admin'));
    calls.push({body,admin,path:new URL(request.url).pathname});
    return new Response(JSON.stringify(socialStatus===200?{ok:true,room:body.room,sp:body.species||'mvp_tidewarden',id:'mvp:test',spawnedAt:100,endsAt:600100}:socialError),{status:socialStatus,headers:{'Content-Type':'application/json'}});
  }})};
  assert.equal((await call(fishingSpawn,owner,{room:0,species:'mvp_stormcoil'},'/api/gm/fishing')).res.status,400);
  assert.equal((await call(fishingSpawn,owner,{room:4,species:'made_up'},'/api/gm/fishing')).res.status,400);
  assert.equal((await call(fishingSpawn,owner,{room:4,species:'mvp_stormcoil'},'/api/gm/fishing', {Origin:'https://evil.example'})).res.status,403);
  assert.equal(calls.length,0,'invalid and cross-origin requests never reach Social');
  const spawned=await call(fishingSpawn,owner,{room:4,species:'mvp_stormcoil',gm:0},'/api/gm/fishing');
  assert.equal(spawned.res.status,200,JSON.stringify(spawned.data));assert.equal(spawned.data.label,'Stormcoil Leviathan');
  assert.equal(calls[0].path,'/gm/fishing-mvp');assert.deepEqual(calls[0].body,{room:4,species:'mvp_stormcoil'});
  assert.deepEqual(calls[0].admin,{id:1,username:'OwnerTest',gm:2},'the Pages handler derives admin authority from the signed-in GM, not the body');
  const audit=sqlite.prepare("SELECT kind,detail FROM events WHERE kind='gm-fishing-mvp' ORDER BY id DESC LIMIT 1").get();
  assert.equal(audit.kind,'gm-fishing-mvp');assert.match(audit.detail,/room 4: Stormcoil Leviathan/);
  socialStatus=409;socialError={err:'An MVP is already active in that plaza room.'};
  assert.equal((await call(fishingSpawn,owner,{room:4,species:null},'/api/gm/fishing')).res.status,409);
  assert.equal(sqlite.prepare("SELECT count(*) n FROM events WHERE kind='gm-fishing-mvp-request'").get().n,2,'both attempts are recorded before touching Social');
  assert.equal(sqlite.prepare("SELECT count(*) n FROM events WHERE kind='gm-fishing-mvp-failed'").get().n,1);
 });
 await test('Fishing and DigiPet grants are validated, queued and audited without editing a save',async()=>{
  const requests=[
   {system:'fishing',resource:'fishcoins',amount:25},
   {system:'fishing',resource:'rod',resourceId:'mythril'},
   {system:'fishing',resource:'bait',resourceId:'jelly',amount:3},
   {system:'digimon',resource:'petcoins',amount:12},
   {system:'digimon',resource:'eggs',amount:2},
  ];
  assert.deepEqual(systemsPayload(requests[0]),{system:'fishing',resource:'fishcoins',amount:25});
  assert.deepEqual(systemsPayload(requests[1]),{system:'fishing',resource:'rod',id:'mythril'});
  assert.deepEqual(systemsPayload(requests[4]),{system:'digimon',resource:'eggs',amount:2});
  for(const bad of [{system:'fishing',resource:'fishcoins',amount:0},{system:'fishing',resource:'fishcoins',amount:1_000_000_001},{system:'fishing',resource:'rod',resourceId:'fake'},{system:'fishing',resource:'bait',resourceId:'worm',amount:1000},{system:'digimon',resource:'petcoins',amount:1_000_000},{system:'digimon',resource:'eggs',amount:49}])assert.throws(()=>systemsPayload(bad));
  for(const payload of requests){
   const r=await call(player,owner,{id:2,action:'systems',...payload,note:'audited test grant'});
   assert.equal(r.res.status,200,JSON.stringify(r.data));
  }
  systemsGrantIds=sqlite.prepare("SELECT id FROM grants WHERE user_id=2 AND kind='systems' ORDER BY id").all().map(x=>x.id);
  assert.equal(systemsGrantIds.length,requests.length);
  const row=sqlite.prepare("SELECT payload,note FROM grants WHERE id=?").get(systemsGrantIds[0]);
  assert.deepEqual(JSON.parse(row.payload),requests[0]);assert.equal(row.note,'audited test grant');
  assert.equal(sqlite.prepare("SELECT count(*) n FROM events WHERE kind='gm-systems'").get().n,requests.length);
  assert.equal((await call(player,normal,{id:2,action:'systems',...requests[0]},'/api/gm/player')).res.status,403);
  assert.equal((await call(player,owner,{id:2,action:'systems',system:'digimon',resource:'eggs',amount:49},'/api/gm/player')).res.status,400);
  assert.equal(sqlite.prepare('SELECT count(*) n FROM saves WHERE user_id=2').get().n,0,'queueing is separate from save blobs');
 });
 await test('a failed system grant batch rolls back its grant and audit event together',async()=>{
  const grants=sqlite.prepare("SELECT count(*) n FROM grants WHERE kind='systems'").get().n,events=sqlite.prepare("SELECT count(*) n FROM events WHERE kind='gm-systems'").get().n;
  sqlite.exec("CREATE TRIGGER fail_system_grant BEFORE INSERT ON grants WHEN NEW.kind='systems' BEGIN SELECT RAISE(ABORT,'test failure'); END");
  const failed=await call(player,owner,{id:2,action:'systems',system:'fishing',resource:'fishcoins',amount:1},'/api/gm/player');
  sqlite.exec('DROP TRIGGER fail_system_grant');
  assert.equal(failed.res.status,500);assert.equal(sqlite.prepare("SELECT count(*) n FROM grants WHERE kind='systems'").get().n,grants);assert.equal(sqlite.prepare("SELECT count(*) n FROM events WHERE kind='gm-systems'").get().n,events);
 });
 const game=createGame();
 try{
  const Pet=require('../../assets/digimon-sanctuary.js');game.window.PGDigimonSanctuary=Pet;
  const blob=game.ev(`S.owner='PlayerTest';S.fishing={v:1,coins:37,rod:'silver',rods:['twig','silver'],bait:{worm:4,notARealBait:99999},bag:[],dex:{},stats:{},settings:{}};S.digimonBag={v:1,coins:33,eggs:2,owned:['agumon'],gear:{items:{}}};S.digimonPartner='gabumon';S.digimonSanctuary={partners:{gabumon:{stage:0,form:'gabumon',stats:{power:0,guard:0,agility:0,focus:0},energy:60}}};JSON.stringify(S)`);
  sqlite.prepare('INSERT INTO saves(user_id,version,blob,saved_at,updated_at,last_seen) VALUES(2,1,?,?,?,?)').run(blob,Date.now(),Date.now(),Date.now());
  await test('inspection returns a safe Fishing and DigiPet summary and excludes credentials',async()=>{
   const r=await call(inspect,owner,null,'/api/gm/player?id=2');assert.equal(r.res.status,200);assert.equal(r.data.save.character.equipment.weapon.name,'Novice Knife');assert.ok(!JSON.stringify(r.data).includes('password_hash'));
   assert.deepEqual(r.data.save.character.fishing,{coins:37,rod:'silver',rods:['twig','silver'],bait:{worm:4,shrimp:0,grub:0,jelly:0,chum:0}});
   assert.equal(r.data.save.character.digimonBag.coins,33);assert.equal(r.data.save.character.digimonBag.eggs,2);assert.equal(r.data.save.character.digimonBag.ownedCount,1);
   assert.ok(!JSON.stringify(r.data.save.character.fishing).includes('notARealBait'),'the inspection whitelist excludes arbitrary save keys');
   assert.equal((await call(inspect,normal,null,'/api/gm/player?id=2')).res.status,403);
  });
  await test('systems grants stay queued and never mutate the inspected player save blob',async()=>{
   const before=sqlite.prepare('SELECT blob FROM saves WHERE user_id=2').get().blob;
   const r=await call(player,owner,{id:2,action:'systems',system:'fishing',resource:'fishcoins',amount:5,note:'post-save proof'},'/api/gm/player');
   assert.equal(r.res.status,200);const grant=sqlite.prepare("SELECT id FROM grants WHERE user_id=2 AND kind='systems' AND note='post-save proof'").get();assert.ok(grant);systemsGrantIds.push(grant.id);
   assert.equal(sqlite.prepare('SELECT blob FROM saves WHERE user_id=2').get().blob,before,'only the queued grant row changes');
  });
  await test('valid affix edit queues and invalid values/types are rejected',async()=>{
   const edit={id:2,action:'equipment',mode:'affixes',itemId:1,refine:7,aff:[{k:'str',v:20},{k:'crit',v:8}]};
   assert.equal((await call(player,owner,edit)).res.status,200);
   for(const b of [{...edit,refine:11},{...edit,aff:[{k:'move',v:3}]},{...edit,aff:[{k:'str',v:NaN}]},{...edit,itemId:999}])assert.equal((await call(player,owner,b)).res.status,400);
  });
  await test('actual game applies queued Fishing and DigiPet resources once and preserves legacy partners',async()=>{
   const systemGrants=sqlite.prepare("SELECT id,payload FROM grants WHERE user_id=2 AND kind='systems' ORDER BY id").all().map(g=>({id:g.id,kind:'systems',payload:JSON.parse(g.payload),from:'OwnerTest'}));
   game.ev(`S=${JSON.stringify(JSON.parse(blob))}`);
   const deliveries=JSON.stringify(systemGrants);
   game.ev(`cloudPush=async()=> 'offline';window.__systems=${JSON.stringify(deliveries)};cloudApplyGrants(JSON.parse(window.__systems));cloudApplyGrants(JSON.parse(window.__systems))`);
   assert.equal(game.ev('S.fishing.coins'),67);assert.ok(game.ev("S.fishing.rods.includes('mythril')"));assert.equal(game.ev('S.fishing.bait.jelly'),3);
   assert.equal(game.ev('S.digimonBag.coins'),45);assert.equal(game.ev('S.digimonBag.eggs'),4);
   assert.ok(game.ev("S.digimonBag.owned.includes('agumon')"));assert.ok(game.ev("S.digimonBag.owned.includes('gabumon')"),'legacy partner data remains owned');
   assert.equal(game.ev('S.gmReceipts.length'),systemGrants.length,'each distinct queue item receives one durable receipt');
   assert.equal(game.ev('S.gmReceipts.includes('+systemsGrantIds[0]+')'),true);
  });
  await test('full or future-version resource bags remain untouched and unreceipted',async()=>{
   game.ev(`S=fresh();S.fishing={coins:1000000000,rods:['twig'],rod:'twig',bait:{worm:999}};S.digimonBag={v:1,coins:999999,eggs:0,owned:Array.from(PGDigimonSanctuary.STARTER_POOL),gear:{}};cloudPush=async()=> 'offline';cloudApplyGrants([{id:601,kind:'systems',payload:{system:'fishing',resource:'fishcoins',amount:1}},{id:602,kind:'systems',payload:{system:'fishing',resource:'bait',id:'worm',amount:1}},{id:603,kind:'systems',payload:{system:'digimon',resource:'petcoins',amount:1}},{id:604,kind:'systems',payload:{system:'digimon',resource:'eggs',amount:1}}])`);
   assert.equal(game.ev('S.fishing.coins'),1_000_000_000);assert.equal(game.ev('S.fishing.bait.worm'),999);assert.equal(game.ev('S.digimonBag.coins'),999999);assert.equal(game.ev('S.digimonBag.eggs'),0);
   for(const id of [601,602,603,604])assert.equal(game.ev('S.gmReceipts.includes('+id+')'),false,'full bag keeps grant '+id+' pending');
   game.ev(`S.digimonBag={v:999,coins:12,eggs:1,owned:[],gear:{}};cloudApplyGrants([{id:605,kind:'systems',payload:{system:'digimon',resource:'petcoins',amount:1}}])`);
   assert.equal(game.ev('S.digimonBag.v'),999,'a future bag version is not rewritten');assert.equal(game.ev('S.digimonBag.coins'),12);assert.equal(game.ev('S.gmReceipts.includes(605)'),false);
  });
  await test('systems claims require a matching saved receipt and duplicate claims are harmless',async()=>{
   const giftId=sqlite.prepare("SELECT id FROM grants WHERE user_id=2 AND kind='gift'").get().id,systemId=systemsGrantIds[0];
   assert.equal((await call(claim,normal,{ids:[giftId,systemId]})).data.claimed,0,'gift and systems grants both require client receipts');
   const s=JSON.parse(blob);s.gmReceipts=[giftId,systemId];sqlite.prepare('UPDATE saves SET blob=? WHERE user_id=2').run(JSON.stringify(s));
   assert.equal((await call(claim,normal,{ids:[giftId,systemId]})).data.claimed,2);
   assert.equal((await call(claim,normal,{ids:[giftId,systemId]})).data.claimed,0,'a claimed grant cannot be claimed twice');
  });
  await test('actual game applies other grant quantities once across duplicate delivery',async()=>{
   game.ev(`S=fresh();cloudPush=async()=> 'offline';cloudApplyGrants([{id:100,kind:'gift',payload:{resource:'ori',amount:9}}]);cloudApplyGrants([{id:100,kind:'gift',payload:{resource:'ori',amount:9}}])`);
   assert.equal(game.ev('S.ore.ori'),9);assert.equal(game.ev('S.gmReceipts.length'),1);
  });
  await test('full bags keep gifts pending and cards go into card inventory',async()=>{
   game.ev(`S.inv=Array.from({length:BAGMAX},(_,i)=>({id:i}));cloudApplyGrants([{id:101,kind:'gift',payload:{item:{slot:'weapon',name:'Knife'},amount:1}}])`);
   assert.equal(game.ev('S.gmReceipts.includes(101)'),false);
   const card=GM_CATALOG.entries.find(x=>x.type==='card').item;
   game.ev(`gmApplyGift(${JSON.stringify({item:card,amount:2})})`);assert.equal(game.ev('S.cards.length'),2);assert.notEqual(game.ev('S.cards[0].id'),game.ev('S.cards[1].id'));
  });
  await test('affix editing preserves sockets and paid offers block mutation',async()=>{
   game.ev(`S.inv=[];S.eq.weapon.cards=[{name:'kept'}];gmApplyGear({mode:'affixes',itemId:1,refine:7,aff:[{k:'str',v:20}]})`);
   assert.equal(game.ev('S.eq.weapon.r'),7);assert.equal(game.ev('S.eq.weapon.cards[0].name'),'kept');
   game.ev(`S.reforgePending={id:1}`);assert.throws(()=>game.ev(`gmApplyGear({mode:'affixes',itemId:1,refine:10,aff:[]})`));assert.equal(game.ev('S.eq.weapon.r'),7);
  });
  await test('equipment selection honors class restrictions and returns the old weapon',async()=>{
   const s=JSON.parse(blob);s.inv=[{...s.eq.weapon,id:123,name:'Bag Knife'},{...s.eq.weapon,id:124,wt:'bow',name:'Wrong Bow'}];
   sqlite.prepare('UPDATE saves SET blob=? WHERE user_id=2').run(JSON.stringify(s));
   assert.equal((await call(player,owner,{id:2,action:'equipment',mode:'equip',itemId:124,slot:'weapon'})).res.status,400);
   assert.equal((await call(player,owner,{id:2,action:'equipment',mode:'equip',itemId:123,slot:'weapon'})).res.status,200);
   game.ev(`S=${JSON.stringify(s)};gmApplyGear({mode:'equip',itemId:123,slot:'weapon'})`);
   assert.equal(game.ev('S.eq.weapon.id'),123);assert.equal(game.ev('S.inv.some(x=>x.id===1)'),true);
  });
  await test('GM catalogue and API support Mythic gear and fourth-job shields',async()=>{
   const {GM_CATALOG}=await import('../../functions/_lib/gm-catalog.js');
   const {equipmentPayload,giftPayload}=await import('../../functions/_lib/gm-tools.js');
   assert.equal(Object.values(GM_CATALOG.classes).filter(c=>c.tier===4).length,14);
   assert.equal(GM_CATALOG.entries.filter(e=>e.id.startsWith('mythic:')).length,114); // 6 sets x (7 shipped + 7 expanded-roster weapon families + 5 armour slots)
   assert.equal(giftPayload({catalogId:'ascMat2',amount:5}).resource,'ascMat2');
   assert.equal(giftPayload({catalogId:'mythicScrolls',amount:5}).resource,'mythicScrolls');
   const entry=GM_CATALOG.entries.find(e=>e.id==='mythic:celestial:off');
   const item={...entry.item,id:444};
   for(const cls of ['Rune Knight','Arch Bishop','Mechanic'])assert.equal(equipmentPayload({mode:'equip',itemId:444,slot:'off'},JSON.stringify({cls,eq:{},inv:[item]})).slot,'off');
   const aff=entry.affixes.slice(0,4).map(k=>({k,v:20})),body={mode:'affixes',itemId:444,refine:15,aff};
   const blob=JSON.stringify({cls:'Rune Knight',eq:{off:item},inv:[]});
   assert.equal(equipmentPayload(body,blob).aff.length,4);
   assert.throws(()=>equipmentPayload({...body,refine:16},blob));
   assert.throws(()=>equipmentPayload(body,JSON.stringify({eq:{off:{...item,sec:5}}})));
  });
  await test('milestone boundaries and aura geometry update without accumulation',async()=>{
   for(const [lv,at] of [[49,null],[50,50],[98,50],[99,99],[149,99],[150,150]])assert.equal(game.ev(`milestone(LEVEL_AURAS,${lv})?.at??null`),at);
   for(const [r,at] of [[4,null],[6,null],[7,7],[8,7],[9,9],[10,10]])assert.equal(game.ev(`milestone(REFINE_GLOWS,${r})?.at??null`),at);
   game.ev(`S.lv=150;syncLevelAura();syncLevelAura()`);assert.equal(game.ev('levelAura.children.length'),2);game.ev('S.lv=1;syncLevelAura()');assert.equal(game.ev('levelAura.visible'),false);
  });
 }finally{game.close()}
 console.log(`${count} passed`);
}finally{sqlite.close()}
