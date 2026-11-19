// Player-character Rift Raid UI/API seam. Run: node tools/tests/raid_ui_sim.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {JSDOM} from 'jsdom';

const html=fs.readFileSync('index.html','utf8'),source=fs.readFileSync('assets/raid-ui.js','utf8'),social=fs.readFileSync('assets/social.js','utf8');
assert.match(html,/\['raid','Rift Raid'\]/,'Map collection includes the Rift Raid challenge tab');
assert.match(html,/mapSeason==='raid'.*PGRaidUI\.render/s,'Map renders the standalone raid destination');
assert.match(source,/raidOpen\?\./,'Map can hand off party coordination to Social');
assert.match(social,/raidOpen,refreshDigimon/,'Social exposes a separate Rift Raid party panel');
const dom=new JSDOM('<!doctype html><body><div id="map"></div></body>',{url:'https://game.test/',runScripts:'outside-only'}),w=dom.window;
let activeRun=null,equippedTitle=null,equippedAura=null;const calls=[];
const account=()=>({userId:42,riftShards:700,bossCardCopies:0,cardRank:0,cardArmorPen:0,cardPity:0,cardPityLabel:'0/30',qualifyingClears:1,soloClears:1,trioClears:0,supportClears:0,equippedTitle,equippedAura,entriesUsed:0,entriesLeft:2,chestsToday:{total:0,pity:0,fractured:0},titles:['riftbreaker','lone-star'],auras:['fracture-spark'],weapons:[{id:'mythic-1',name:'Mythic Test Blade',type:'sword',refine:15,atk:10000,stars:4,failures:0,maxStars:20,atkBonus:.04,raidArmorPen:.02,nextCost:20,nextChance:.87}],activeRun});
const rules={dailyEntries:2,upgradeExpectedSpend:852.126,hpByParty:{1:150000000,2:360000000,3:540000000},clearSeconds:{solo:300,group:360},fullClear:{riftShards:10,bonusRiftShards:{chance:.5,amount:10},sigils:4,bonusSigils:{chance:.25,amount:4},regionalMaterials:2,bonusRegionalMaterials:{chance:.25,amount:2},zeny:1000000},pityChest:{riftShards:10,sigils:2,regionalMaterials:1,zeny:250000},fracturedChest:{riftShards:5,sigils:2,regionalMaterials:1,zeny:250000},cardChance:.05,cardPity:30,titles:[{id:'riftbreaker',name:'Riftbreaker',rule:'first-clear',color:'#ffd08a'},{id:'rift-veteran',name:'Rift Veteran',rule:'clears',value:25,color:'#a8d8ff'},{id:'rift-sovereign',name:'Rift Sovereign',rule:'clears',value:100,color:'#d4adff'},{id:'lone-star',name:'Lone Star',rule:'solo-clear',color:'#ffe58c'},{id:'triune-oath',name:'Triune Oath',rule:'trio-clear',color:'#91ead9'},{id:'rift-lifeline',name:'Rift Lifeline',rule:'support-clear',color:'#ff9db5'}],auras:[{id:'fracture-spark',name:'Fracture Spark',clears:15,color:'#ff986b',pattern:'compass'},{id:'broken-orbit',name:'Broken Orbit',clears:40,color:'#c687ff',pattern:'arcane'},{id:'astral-mantle',name:'Astral Mantle',clears:80,color:'#72e6ff',pattern:'sunburst'},{id:'event-horizon',name:'Event Horizon',clears:150,color:'#ffe28a',pattern:'sunburst'}]};
w.fetch=async(url,init={})=>{
 if(init.method==='GET'||!init.method)return new Response(JSON.stringify({ok:true,day:'2026-11-15',dayTimeZone:'Asia/Kuala_Lumpur',account:account(),rules}),{status:200,headers:{'Content-Type':'application/json'}});
 const body=JSON.parse(init.body||'{}');calls.push(body);
 if(body.action==='start'){const party=body.mode==='party';activeRun={id:'raid:test-run',state:'active',partySize:party?2:1,totalHp:party?360000000:150000000,hpRemaining:party?360000000:150000000,phaseIndex:0,phaseNames:['Scouts','Heralds','Sentries','Sovereign'],startedAt:Date.now(),deadlineAt:Date.now()+(party?360000:300000),serverNow:Date.now(),members:[{id:42,name:'Tester',hp:100000,maxHp:100000,damage:0,support:0,actions:0,dodges:0,downs:0,lane:'center'},...(party?[{id:43,name:'Partner',hp:100000,maxHp:100000,damage:0,support:0,actions:0,dodges:0,downs:0,lane:'left'}]:[])]};return new Response(JSON.stringify({ok:true,runId:activeRun.id}),{status:200,headers:{'Content-Type':'application/json'}})}
 if(body.action==='equip'){if(body.kind==='title')equippedTitle=body.id;else if(body.kind==='aura')equippedAura=body.id;return new Response(JSON.stringify({ok:true,equippedTitle,equippedAura}),{status:200,headers:{'Content-Type':'application/json'}})}
 if(body.action==='upgrade')return new Response(JSON.stringify({ok:true,success:true,starBefore:4,starAfter:5,cost:20}),{status:200,headers:{'Content-Type':'application/json'}});
 return new Response(JSON.stringify({ok:true,outcome:'clear',rewards:[]}),{status:200,headers:{'Content-Type':'application/json'}});
};
w.eval(source);
w.PGRaidUI.setAccount(42,'raid_test');
await w.PGRaidUI.refresh();
assert.equal(w.PGRaidUI.attackBonus('mythic-1'),.04,'D1-backed item bonus is available to the game combat formula');
const mount=w.document.getElementById('map');mount.innerHTML=w.PGRaidUI.render();
assert.match(mount.textContent,/Malaysia midnight/);
assert.match(mount.textContent,/Raid armor penetration \+0%/,'the card panel reports its current raid-only bonus');
assert.match(mount.textContent,/Two entries per player/);
assert.match(mount.textContent,/20★ Rift Tempering/);
assert.match(mount.textContent,/Titles & auras/);assert.match(mount.textContent,/Rift Veteran/,'locked raid titles remain visible with their clear requirement');
const wear=mount.querySelector('[data-raid-ui="equip"][data-kind="title"][data-id="riftbreaker"]');assert(wear&&!wear.disabled);wear.click();await new Promise(resolve=>setTimeout(resolve,0));
assert(calls.some(x=>x.action==='equip'&&x.kind==='title'&&x.id==='riftbreaker'),'wear action calls the authenticated cosmetic endpoint');
assert.equal(equippedTitle,'riftbreaker');assert.equal(w.PGRaidUI.raidCosmeticLook().title,'Riftbreaker','equipped server metadata is available to the character look');
mount.innerHTML=w.PGRaidUI.render();assert.equal(mount.querySelector('[data-raid-ui="equip"][data-kind="title"][data-id="none"]').textContent,'Unequip');assert.equal(mount.querySelector('[data-raid-ui="equip"][data-kind="title"][data-id="none"]').getAttribute('aria-pressed'),'true');
const wearAura=mount.querySelector('[data-raid-ui="equip"][data-kind="aura"][data-id="fracture-spark"]');assert(wearAura&&!wearAura.disabled);wearAura.click();await new Promise(resolve=>setTimeout(resolve,0));
assert.equal(w.PGRaidUI.raidCosmeticLook().auraId,'fracture-spark');assert.equal(w.PGRaidUI.raidCosmeticLook().auraPattern,'compass');
w.PGSocial={app:{raidParty:null},raidOpen(){}};
mount.innerHTML=w.PGRaidUI.render();let partyStart=mount.querySelector('[data-raid-ui="start"][data-mode="party"]');assert(partyStart.disabled,'party start stays disabled without a Social raid party');assert.match(partyStart.title,/Create or join/);
w.PGSocial.app.raidParty={leader:42,open:true,members:[{id:42,ready:true},{id:43,ready:false}]};
mount.innerHTML=w.PGRaidUI.render();partyStart=mount.querySelector('[data-raid-ui="start"][data-mode="party"]');assert(partyStart.disabled,'one ready member cannot start');assert.match(partyStart.textContent,/1\/2 ready/);assert.match(partyStart.title,/every member must ready up/);
w.PGSocial.app.raidParty={leader:41,open:true,members:[{id:42,ready:true},{id:43,ready:true}]};
mount.innerHTML=w.PGRaidUI.render();partyStart=mount.querySelector('[data-raid-ui="start"][data-mode="party"]');assert(partyStart.disabled,'a fully ready party still cannot be started by a non-leader');
w.PGSocial.app.raidParty={leader:42,open:true,members:[{id:42,ready:true},{id:43,ready:true}]};
mount.innerHTML=w.PGRaidUI.render();partyStart=mount.querySelector('[data-raid-ui="start"][data-mode="party"]');assert(!partyStart.disabled,'the leader can start only after every member is ready');assert.equal(w.PGRaidUI.partyStartStatus().canStart,true);
w.PGSocial.app.raidParty={leader:42,open:true,members:[{id:43,ready:true},{id:44,ready:true}]};assert.equal(w.PGRaidUI.partyStartStatus().canStart,false,'the named leader must be on the ready roster');
w.PGSocial.app.raidParty={leader:42,open:false,members:[{id:42,ready:true},{id:43,ready:true}]};assert.equal(w.PGRaidUI.partyStartStatus().canStart,false,'a running party cannot be started again');
w.PGSocial.app.raidParty={leader:42,open:true,members:[{id:42,ready:true},{id:43,ready:true},{id:44,ready:true},{id:45,ready:true}]};assert.match(w.PGRaidUI.partyStartStatus().note,/2–3/,'party start is limited to two or three members');
w.PGSocial.app.raidParty={leader:42,open:true,members:[{id:42,ready:true},{id:43,ready:true}]};
w.PGRaidUI._state.account.entriesLeft=0;assert.equal(w.PGRaidUI.partyStartStatus().canStart,false,'the leader needs a daily entry');assert.match(w.PGRaidUI.partyStartStatus().note,/no daily raid entries/);
w.PGRaidUI._state.account.entriesLeft=2;w.PGRaidUI._state.account.activeRun={id:'active-raid',state:'active'};assert.equal(w.PGRaidUI.partyStartStatus().canStart,false,'an existing raid blocks a second party start');assert.match(w.PGRaidUI.partyStartStatus().note,/finish or settle/i);w.PGRaidUI._state.account.activeRun=null;
 w.PGRaidUI._state.busy='start';assert.equal(w.PGRaidUI.partyStartStatus().canStart,false,'a party cannot start while another request is in flight');w.PGRaidUI._state.busy='';
partyStart.click();await new Promise(resolve=>setTimeout(resolve,0));await w.PGRaidUI._state.loading;await new Promise(resolve=>setTimeout(resolve,0));
assert(calls.some(x=>x.action==='start'&&x.mode==='party'),'the Map party button invokes the authenticated party-start route');
activeRun=null;w.PGRaidUI._state.liveRun=null;w.PGRaidUI._state.account.activeRun=null;
w.PGSocial.app.raidParty=null;
const start=mount.querySelector('[data-raid-ui="start"][data-mode="solo"]');assert(start&&!start.disabled);
start.click();
await new Promise(resolve=>setTimeout(resolve,0));
assert(calls.some(x=>x.action==='start'&&x.mode==='solo'),'Map starts a solo character raid through the API');
mount.innerHTML=w.PGRaidUI.render();assert.match(mount.textContent,/LIVE ENCOUNTER/);assert.match(mount.textContent,/Heavy Strike/);
const strike=mount.querySelector('[data-raid-ui="act"][data-action="strike"]');assert(strike&&!strike.disabled);

const deferred=()=>{let resolve;const promise=new Promise(r=>{resolve=r});return{promise,resolve}};
const accountResponse=(userId,riftShards,run=null)=>new Response(JSON.stringify({ok:true,day:'2026-11-15',account:{...account(),userId,riftShards,activeRun:run},rules}),{status:200,headers:{'Content-Type':'application/json'}});
const overlapping=[];w.fetch=()=>{const request=deferred();overlapping.push(request);return request.promise};
const staleRefresh=w.PGRaidUI.refresh(),latestRefresh=w.PGRaidUI.refresh();
assert.equal(overlapping.length,2,'a forced refresh supersedes rather than reuses an in-flight snapshot');
overlapping[1].resolve(accountResponse(42,222));await latestRefresh;
overlapping[0].resolve(accountResponse(42,111));await staleRefresh;
assert.equal(w.PGRaidUI.account.riftShards,222,'a late older same-account load cannot overwrite the latest snapshot');

const switched=[];w.fetch=()=>{const request=deferred();switched.push(request);return request.promise};
const previousAccountLoad=w.PGRaidUI.refresh();
w.PGRaidUI.setAccount(43,'raid_other');
assert.equal(switched.length,2,'account switching starts a fresh load while the prior account request is pending');
const currentAccountLoad=w.PGRaidUI._state.loading;
switched[1].resolve(accountResponse(43,888));await currentAccountLoad;
switched[0].resolve(accountResponse(42,111));await previousAccountLoad;
assert.equal(w.PGRaidUI.account.userId,43,'a previous account response cannot restore the previous user');
assert.equal(w.PGRaidUI.account.riftShards,888,'a previous account response cannot overwrite the new user state');

let pendingMutation;w.fetch=(url,init={})=>{
 if(init.method==='POST'){pendingMutation=deferred();return pendingMutation.promise}
 return Promise.resolve(accountResponse(44,999));
};
mount.innerHTML=w.PGRaidUI.render();mount.querySelector('[data-raid-ui="start"][data-mode="solo"]').click();
await Promise.resolve();assert.equal(w.PGRaidUI._state.busy,'start');
w.PGRaidUI.setAccount(44,'raid_third');await w.PGRaidUI._state.loading;
assert.equal(w.PGRaidUI._state.busy,'','account changes clear the previous account’s pending UI action');
pendingMutation.resolve(new Response(JSON.stringify({ok:true,runId:'old-account-run'}),{status:200,headers:{'Content-Type':'application/json'}}));
await new Promise(resolve=>setTimeout(resolve,0));
assert.equal(w.PGRaidUI.account.userId,44);
assert.equal(w.PGRaidUI._state.liveRun,null,'a late mutation response cannot leak a prior account’s raid into the new account');

const liveRun={...activeRun,state:'active',members:activeRun.members.map(m=>({...m}))};
const terminalRun={...liveRun,state:'cleared',hpRemaining:0,finishedAt:Date.now(),serverNow:Date.now()};let pendingSettlement;
w.fetch=(url,init={})=>{
 if(init.method==='GET')return Promise.resolve(accountResponse(42,700,liveRun));
 const body=JSON.parse(init.body||'{}');
 if(body.action==='act')return Promise.resolve(new Response(JSON.stringify({ok:true,run:terminalRun}),{status:200,headers:{'Content-Type':'application/json'}}));
 if(body.action==='settle'){pendingSettlement=deferred();return pendingSettlement.promise}
 return Promise.resolve(new Response(JSON.stringify({ok:true}),{status:200,headers:{'Content-Type':'application/json'}}));
};
w.PGRaidUI.setAccount(42,'raid_test');await w.PGRaidUI._state.loading;
mount.innerHTML=w.PGRaidUI.render();mount.querySelector('[data-raid-ui="act"][data-action="strike"]').click();
await new Promise(resolve=>setTimeout(resolve,0));
assert.equal(w.PGRaidUI._state.busy,'settle','the action completion does not clear a newer in-flight settlement lock');
pendingSettlement.resolve(new Response(JSON.stringify({ok:true,outcome:'clear',rewards:[]}),{status:200,headers:{'Content-Type':'application/json'}}));
await new Promise(resolve=>setTimeout(resolve,0));await w.PGRaidUI._state.loading;
assert.equal(w.PGRaidUI._state.busy,'','settlement releases its own busy lock after refresh');
let initialFetches=0;w.fetch=(url,init={})=>{if(init.method==='GET'){initialFetches++;return Promise.resolve(accountResponse(45,555))}return Promise.resolve(new Response('{}',{status:200,headers:{'Content-Type':'application/json'}}))};
const syncRerender=()=>w.PGRaidUI.render();w.addEventListener('pg-raid-ui-change',syncRerender);
w.PGRaidUI.setAccount(45,'raid_fourth');assert.equal(initialFetches,1,'account-change render does not duplicate the initial state fetch');
await w.PGRaidUI._state.loading;w.removeEventListener('pg-raid-ui-change',syncRerender);
let loggedOutFetches=0;w.fetch=()=>{loggedOutFetches++;return Promise.resolve(accountResponse(45,555))};
w.PGRaidUI.setPreviewToken('old-preview-session');w.addEventListener('pg-raid-ui-change',syncRerender);
w.PGRaidUI.clearAccount();w.removeEventListener('pg-raid-ui-change',syncRerender);
assert.equal(w.PGRaidUI._state.lastAccountId,0);assert.equal(w.PGRaidUI.account,null);
assert.equal(w.PGRaidUI._state.previewToken,'','logout clears the preview token before state listeners run');
assert.equal(loggedOutFetches,0,'a signed-out panel render does not fetch through the previous account session');
const logoutResponse=deferred();w.fetch=()=>logoutResponse.promise;
w.PGRaidUI.setPreviewToken('pending-account-token');w.PGRaidUI.setAccount(46,'raid_fifth');
const pendingLogoutLoad=w.PGRaidUI._state.loading;w.PGRaidUI.clearAccount();
logoutResponse.resolve(accountResponse(46,321));await pendingLogoutLoad;
assert.equal(w.PGRaidUI.account,null,'a response already in flight at logout cannot restore the signed-out account');
console.log('PASS Rift Raid UI: wardrobe, live actions, latest-load-wins account epochs, stale mutation isolation, settlement locking and safe account initialization/logout');
dom.window.close();
