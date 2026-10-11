import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import {freshDb,makeEnv} from '../dev_server.js';
import {onRequestPost as register} from '../../functions/api/register.js';
import {onRequestPost as gifts} from '../../functions/api/gm/gifts.js';
import {onRequestPost as player,onRequestGet as inspect} from '../../functions/api/gm/player.js';
import {onRequestPost as claim} from '../../functions/api/grants.js';
import {onRequestGet as catalog} from '../../functions/api/gm/catalog.js';
import {GM_CATALOG} from '../../functions/_lib/gm-catalog.js';
const require=createRequire(import.meta.url),{createGame}=require('./helpers/game');
const sqlite=freshDb(),env=makeEnv(sqlite);let count=0;
const call=async(fn,cookie,body,url='/api/test')=>{const res=await fn({env,request:new Request('https://pg.local'+url,{method:body?'POST':'GET',headers:{'Content-Type':'application/json',Cookie:cookie||''},...(body?{body:JSON.stringify(body)}:{})})});return {res,data:await res.json()}};
const test=async(name,fn)=>{await fn();count++;console.log('ok '+name)};
const account=async u=>{const r=await call(register,'',{u,p:'test-password-only'});assert.equal(r.res.status,201,'registration');return r.res.headers.get('set-cookie').split(';')[0]};
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
 const game=createGame();
 try{
  const blob=game.ev(`S.owner='PlayerTest';JSON.stringify(S)`);
  sqlite.prepare('INSERT INTO saves(user_id,version,blob,saved_at,updated_at,last_seen) VALUES(2,1,?,?,?,?)').run(blob,Date.now(),Date.now(),Date.now());
  await test('inspection returns equipped stats and excludes credentials',async()=>{
   const r=await call(inspect,owner,null,'/api/gm/player?id=2');assert.equal(r.res.status,200);assert.equal(r.data.save.character.equipment.weapon.name,'Novice Knife');assert.ok(!JSON.stringify(r.data).includes('password_hash'));
   assert.equal((await call(inspect,normal,null,'/api/gm/player?id=2')).res.status,403);
  });
  await test('valid affix edit queues and invalid values/types are rejected',async()=>{
   const edit={id:2,action:'equipment',mode:'affixes',itemId:1,refine:7,aff:[{k:'str',v:20},{k:'crit',v:8}]};
   assert.equal((await call(player,owner,edit)).res.status,200);
   for(const b of [{...edit,refine:11},{...edit,aff:[{k:'move',v:3}]},{...edit,aff:[{k:'str',v:NaN}]},{...edit,itemId:999}])assert.equal((await call(player,owner,b)).res.status,400);
  });
  await test('gift claim requires durable saved receipt',async()=>{
   const id=sqlite.prepare("SELECT id FROM grants WHERE user_id=2 AND kind='gift'").get().id;
   assert.equal((await call(claim,normal,{ids:[id]})).data.claimed,0);
   const s=JSON.parse(blob);s.gmReceipts=[id];sqlite.prepare('UPDATE saves SET blob=? WHERE user_id=2').run(JSON.stringify(s));
   assert.equal((await call(claim,normal,{ids:[id]})).data.claimed,1);
  });
  await test('actual game applies quantities once across duplicate delivery',async()=>{
   game.ev(`cloudPush=async()=> 'offline';cloudApplyGrants([{id:100,kind:'gift',payload:{resource:'ori',amount:9}}]);cloudApplyGrants([{id:100,kind:'gift',payload:{resource:'ori',amount:9}}])`);
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
  await test('milestone boundaries and aura geometry update without accumulation',async()=>{
   for(const [lv,at] of [[49,null],[50,50],[98,50],[99,99],[149,99],[150,150]])assert.equal(game.ev(`milestone(LEVEL_AURAS,${lv})?.at??null`),at);
   for(const [r,at] of [[3,null],[4,4],[6,4],[7,7],[9,7],[10,10]])assert.equal(game.ev(`milestone(REFINE_GLOWS,${r})?.at??null`),at);
   game.ev(`S.lv=150;syncLevelAura();syncLevelAura()`);assert.equal(game.ev('levelAura.children.length'),2);game.ev('S.lv=1;syncLevelAura()');assert.equal(game.ev('levelAura.visible'),false);
  });
 }finally{game.close()}
 console.log(`${count} passed`);
}finally{sqlite.close()}
