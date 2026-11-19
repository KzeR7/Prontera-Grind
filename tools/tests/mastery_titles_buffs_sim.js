#!/usr/bin/env node
// Regression coverage for the real title, save, social and buff presentation paths.
// node tools/tests/mastery_titles_buffs_sim.js
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {createGame}=require('./helpers/game');
const root=path.resolve(__dirname,'../..'),src=fs.readFileSync(path.join(root,'index.html'),'utf8');
const html=src.replace('</body>','<script>window.realBars=bars;window.realSave=save;window.realUI=ui;window.realLog=log;</script></body>');
const g=createGame(html),ev=g.ev,doc=g.window.document;
let passed=0,failed=0;
function test(name,fn){try{fn();passed++;console.log('  ok   '+name)}catch(e){failed++;console.error('  FAIL '+name+' -> '+e.stack)}}
function reset(){ev(`S=fresh();currentUser='mastery-test';S.auto=false;tabs.length=0;indexMode='mobs';titleFilter='all';
  bars=window.realBars;save=window.realSave;ui=window.realUI;log=window.realLog;
  petBuff={atk:0,matk:0,hp:0,leech:0,def:0,atkT:0,matkT:0,hpT:0,leechT:0,defT:0};petBuffSrc={};
  mobs=[];mob=null;resetSkillRuntime();for(const k in skCd)delete skCd[k];renderWin();`)}
const json=code=>JSON.parse(ev('JSON.stringify('+code+')'));

(async()=>{
try{
console.log('mastery titles, supplied artwork, and player-buff HUD');
test('forty distinct cosmetic challenges and ten original ranks use all fifty supplied symbols',()=>{
  const defs=json('PGTitles.CHALLENGES'),ranks=json('INDEX_TITLES'),symbols=[...defs.map(t=>t.symbol),...Object.values(json('PGTitles.RANK_SYMBOLS'))];
  assert.equal(defs.length,40);assert.equal(new Set(defs.map(t=>t.id)).size,40);assert.equal(ranks.length,10);
  assert.equal(new Set([...defs.map(t=>t.id),...ranks.map(t=>t.id)]).size,50);
  assert.deepEqual([...symbols].sort((a,b)=>a-b),Array.from({length:50},(_,i)=>i+1));
  for(const n of symbols){const p=path.join(root,'assets/title-symbols',String(n).padStart(2,'0')+'.webp');const data=fs.readFileSync(p);assert.equal(data.subarray(0,4).toString()+data.subarray(8,16).toString(),'RIFFWEBPVP8L',p)}
  assert.equal(ev(`PGTitles.find('__proto__',INDEX_TITLES)`),null,'prototype keys are not valid title IDs');
  assert.equal(new Set([...defs,...ranks].map(t=>t.name)).size,50,'the existing plaza look names uniquely identify all logos');
  assert.ok(ev(`[...PGTitles.CHALLENGES,...INDEX_TITLES].every(t=>PGTitles.findByName(t.name,INDEX_TITLES)?.id===t.id)`));
  assert.equal(ev(`PGTitles.findByName('<img src=x>',INDEX_TITLES)`),null,'unknown remote text never selects markup');
  for(const file of ['skill-icons-expanded.js','mastery-titles.js','player-buffs.js']){
    const at=src.indexOf('assets/'+file);assert.ok(at>0&&at<src.indexOf('const SKILLSX='),file+' must actually load in the page before the main game');
  }
});

test('+15 weapon achievement records the real refine transaction and survives losing the item and save codec',()=>{
  reset();ev(`S.eq.weapon={...S.eq.weapon,r:14,sec:6};S.zeny=1e12;S.ore.ori=1e6;`);
  assert.equal(ev(`PGTitles.unlocked(PGTitles.find('mythic-edge',INDEX_TITLES),S,CLASSES)`),false,'+14 is not +15');
  ev(`window.originalRandom=Math.random;Math.random=()=>0;refine('weapon');Math.random=window.originalRandom`);
  assert.equal(ev('S.eq.weapon.r'),15);assert.ok(ev(`S.titleAwards.includes('mythic-edge')`),'awarded at success before the next autosave');
  assert.equal(ev('S.titleBest.weapon'),15);
  ev(`S.eq.weapon=null;S.equippedTitle='mythic-edge';save();S=load()`);
  assert.equal(ev('S.titleBest.weapon'),15);assert.equal(ev('equippedMasteryTitle().name'),'Mythic Edge');
  assert.ok(ev(`unpackSave(packSave(S)).titleAwards.includes('mythic-edge')`),'compact cloud save retains the award');
  assert.equal(ev(`unpackSave(packSave(S)).titleBest.weapon`),15);
  ev(`S=fresh();S.eq.armor={slot:'armor',r:15};S.eq.weapon.r=14;PGTitles.sync(S,CLASSES)`);
  assert.ok(ev(`S.titleAwards.includes('unbroken')`));assert.ok(!ev(`S.titleAwards.includes('mythic-edge')`),'armor never counts as a weapon');
});

test('old saves recover surviving achievements, sanitize bad awards and reject a locked equipped title',()=>{
  reset();
  ev(`S.mobKills['10:Memory of Thanatos']=10000;S.eq.weapon={...S.eq.weapon,r:15,sec:6};
    delete S.titleAwards;delete S.titleBest;S.equippedTitle='thanatos-end';localStorage.setItem(saveKey(),JSON.stringify(S));S=load()`);
  assert.ok(ev(`S.titleAwards.includes('thanatos-end')&&S.titleAwards.includes('mythic-edge')`));
  assert.equal(ev('equippedMasteryTitle().name'),"Thanatos' End");
  ev(`S=fresh();S.titleAwards=['invented','__proto__','tempered-edge','tempered-edge',7];S.titleBest={weapon:999,armor:-4};S.equippedTitle='thanatos-end';localStorage.setItem(saveKey(),JSON.stringify(S));S=load()`);
  assert.equal(ev('S.equippedTitle'),null,'a locked title cannot survive repair');
  assert.equal(ev('S.titleBest.weapon'),15);assert.equal(ev('S.titleBest.armor'),0);
  assert.ok(!ev(`S.titleAwards.includes('invented')||S.titleAwards.includes('__proto__')`));
  assert.equal(ev(`S.titleAwards.filter(x=>x==='tempered-edge').length`),1,'award list is bounded and deduplicated');
});

test('a temporary title-script failure does not erase an equipped achievement',()=>{
  reset();const titles=g.window.PGTitles;
  try{
    delete g.window.PGTitles;
    ev(`S.titleAwards=['mythic-edge'];S.equippedTitle='mythic-edge';repairMastery(S)`);
    assert.equal(ev('S.equippedTitle'),'mythic-edge');
    ev(`S.equippedTitle='field-scout';S.indexXp=0;repairMastery(S)`);
    assert.equal(ev('S.equippedTitle'),null,'known legacy ranks are still validated');
    ev(`S.equippedTitle='mythic-edge'`);
  }finally{g.window.PGTitles=titles}
  ev('repairMastery(S)');assert.equal(ev('equippedMasteryTitle().name'),'Mythic Edge');
});

test('10,000 actual Thanatos ledger kills unlock at the boundary without changing Index Crit',()=>{
  reset();ev(`S.mobKills['10:Memory of Thanatos']=9999;S.indexXp=200;S.kills=9999`);
  assert.equal(ev(`PGTitles.progress(PGTitles.find('thanatos-end',INDEX_TITLES),S,CLASSES)`),9999);
  assert.equal(ev(`titleUnlocked(PGTitles.find('thanatos-end',INDEX_TITLES))`),false);
  assert.equal(ev(`recordMonsterKill({mapIndex:10,n:'Memory of Thanatos'}).count`),10000);
  const before=ev('indexCrit()');ev(`ACT.titleequip('thanatos-end')`);
  assert.equal(ev('S.equippedTitle'),'thanatos-end');assert.equal(ev('indexCrit()'),before,'cosmetic equipment cannot add or remove a rank bonus');
  assert.ok(ev(`S.titleAwards.includes('thanatos-end')`));
  assert.deepEqual(json(`['10:Memory of Thanatos','11:Ifrit','9:Dark Lord','6:Dragon Lord'].map(k=>MONSTER_INDEX_KEYS.has(k))`),[true,true,true,true]);
  ev(`S.mobKills={};S.indexXp=0;save();S=load()`);assert.equal(ev('equippedMasteryTitle().id'),'thanatos-end','an earned challenge is permanent after ledger changes');
});

test('five different non-Novice jobs must reach their own caps; switching classes preserves the award',()=>{
  reset();ev(`S.cls='Knight';for(const n of ['Swordman','Knight','Lord Knight','Rune Knight'])S.jobs[n]={jl:CLASSES[n].mj,jx:0};
    S.jobs.Novice={jl:CLASSES.Novice.mj,jx:0};S.jobs.Mage={jl:CLASSES.Mage.mj-1,jx:0};PGTitles.sync(S,CLASSES)`);
  assert.equal(ev('PGTitles.metrics(S,CLASSES).classes'),4);assert.ok(!ev(`S.titleAwards.includes('master-of-five')`));
  ev(`S.jobs.Mage.jl=CLASSES.Mage.mj;PGTitles.sync(S,CLASSES)`);
  assert.equal(ev('PGTitles.metrics(S,CLASSES).classes'),5);assert.ok(ev(`S.titleAwards.includes('master-of-five')`));
  ev(`S.equippedTitle='master-of-five';draw();changeClass('Novice');save();S=load();draw()`);
  assert.equal(ev('S.cls'),'Novice');assert.equal(ev('equippedMasteryTitle().name'),'Master of Five');
  assert.equal(doc.getElementById('heroTitleText').textContent,'Master of Five');assert.equal(doc.querySelector('#heroTitleMark img').getAttribute('src'),'assets/title-symbols/04.webp');
  assert.ok(ev(`S.titleAwards.includes('master-of-five')`));
});

test('Echo challenges count spent ranked attempts, including exits after the grace period',()=>{
  reset();
  for(const id of ['echo-beginner','echo-veteran'])assert.match(ev(`PGTitles.find('${id}',INDEX_TITLES).description`),/finishing or leaving after the grace period/);
  ev(`S.trial.runs=99;trialEnter('ranked');TRIAL.left=TRIAL_SECS-TRIAL_GRACE-1;trialExit()`);
  assert.equal(ev('S.trial.runs'),100);assert.ok(ev(`S.titleAwards.includes('echo-veteran')`));
});

test('Index rank thresholds and cumulative Crit are unchanged by challenge or rank cosmetics',()=>{
  reset();const xp=json('INDEX_TITLES.map(t=>t.xp)'),increments=json('INDEX_CRIT');
  assert.deepEqual(xp,[200,1000,3000,10000,30000,100000,250000,500000,750000,1000000]);
  assert.deepEqual(increments,[1,1,2,2,3,4,5,6,7,9]);
  for(let i=0;i<xp.length;i++){
    ev(`S.indexXp=${xp[i]-1}`);assert.equal(ev('indexRankForXp(indexExperience())'),i);
    ev(`S.indexXp=${xp[i]};S.equippedTitle='field-initiate'`);assert.equal(ev('indexCrit()'),increments.slice(0,i+1).reduce((a,b)=>a+b,0));
    ev(`S.titleAwards=['mythic-edge'];S.equippedTitle='mythic-edge'`);assert.equal(ev('indexCrit()'),increments.slice(0,i+1).reduce((a,b)=>a+b,0));
  }
});

test('the actual Index keeps rank progress-only and routes filters and equip actions to Titles',()=>{
  reset();ev(`S.indexXp=1000;S.eq.weapon.r=15;PGTitles.sync(S,CLASSES);tabs.push('index');renderWin()`);
  const win=()=>doc.querySelector('[data-win="index"]');assert.ok(win());
  assert.equal(win().querySelectorAll('.mastery-title').length,10);assert.equal(win().querySelectorAll('[data-a="titleequip"]').length,0);
  assert.match(win().textContent,/equip titles in the Titles tab/);
  win().querySelector('[data-a="indexview"][data-v="titles"]').click();
  assert.equal(ev('indexMode'),'titles');assert.equal(win().querySelectorAll('.tc-card').length,50);
  const locked=()=>win().querySelector('[data-title-id="thanatos-end"] .tc-equip');assert.ok(locked().disabled);
  ev(`ACT.titleequip('thanatos-end')`);assert.notEqual(ev('S.equippedTitle'),'thanatos-end','direct actions cannot bypass requirements');
  win().querySelector('[data-title-id="mythic-edge"] .tc-equip').click();
  assert.equal(ev('S.equippedTitle'),'mythic-edge');assert.equal(doc.getElementById('titleLabel').textContent,'✦ Mythic Edge');
  assert.equal(win().querySelector('[data-title-id="mythic-edge"] .tc-equip').getAttribute('aria-pressed'),'true');
  win().querySelector('[data-a="titlefilter"][data-v="earned"]').click();
  assert.ok(win().querySelector('[data-title-id="mythic-edge"]'));assert.equal(win().querySelector('[data-title-id="thanatos-end"]'),null);
  win().querySelector('[data-title-id="mythic-edge"] .tc-equip').click();assert.equal(ev('S.equippedTitle'),null);
});

test('the equipped symbol and requirement render in the real world and update when the title changes',()=>{
  reset();ev(`S.titleAwards=['mythic-edge'];S.equippedTitle='mythic-edge';draw()`);
  const title=doc.getElementById('heroTitle'),mark=doc.getElementById('heroTitleMark');
  assert.equal(title.style.display,'block');assert.equal(doc.getElementById('heroTitleText').textContent,'Mythic Edge');
  assert.match(title.title,/\+15/);assert.equal(mark.querySelector('img').getAttribute('src'),'assets/title-symbols/49.webp');assert.equal(mark.querySelector('img').getAttribute('loading'),'eager');
  ev(`S.indexXp=200;ACT.titleequip('field-initiate');draw()`);
  assert.equal(doc.getElementById('heroTitleText').textContent,'Field Initiate');assert.equal(mark.querySelector('img').getAttribute('src'),'assets/title-symbols/47.webp');
  ev(`ACT.titleequip('none');draw()`);assert.equal(title.style.display,'none');
  ev(`ACT.titleequip('field-initiate');save();S=load();draw()`);assert.equal(title.style.display,'block');assert.equal(doc.getElementById('heroTitleText').textContent,'Field Initiate');assert.equal(mark.querySelector('img').getAttribute('src'),'assets/title-symbols/47.webp');
});

test('real combat buffs appear with pet buffs, accurate live time/effect and stable focus',()=>{
  reset();ev(`S.cls='Crusader';S.sk.cr_guard=5;resetSkillRuntime();mobs=[{hp:10}];
    petBuff.atk=15;petBuff.atkT=4.2;petBuffSrc.atk='Poring';tickCombatSkills(.1);bars()`);
  const tile=doc.getElementById('player-buff-cr_guard'),pet=doc.getElementById('pet-buff-warcry');assert.ok(tile&&pet);
  assert.equal(tile.querySelector('img').getAttribute('src'),'assets/expanded-skill-icons/cr_guard.webp');
  assert.equal(tile.querySelector('img').getAttribute('loading'),'eager','field HUD icons must load even inside an initially hidden field');
  assert.equal(tile.querySelector('.s').textContent,'12');assert.match(tile.textContent,/Block chance: \+5%/);assert.match(tile.textContent,/12s left/);
  assert.equal(tile.tabIndex,0);assert.equal(tile.getAttribute('aria-describedby'),'player-buff-cr_guard-details');
  tile.focus();ev(`mobs=[];tickCombatSkills(1.1);petBuff.atk=0;bars()`);
  assert.equal(doc.getElementById('player-buff-cr_guard'),tile);assert.equal(doc.activeElement,tile);
  assert.equal(tile.querySelector('.s').textContent,'11');assert.equal(doc.getElementById('pet-buff-warcry'),null);
  ev(`S.skOff.cr_guard=true;bars()`);assert.equal(doc.getElementById('player-buff-cr_guard'),null,'paused skills stop contributing immediately');
  ev(`S.skOff.cr_guard=false;skillRuntime.buffs.cr_guard.left=.01;bars()`);assert.equal(doc.querySelector('#player-buff-cr_guard .s').textContent,'1');
  ev(`tickCombatSkills(.02);bars()`);assert.equal(doc.getElementById('player-buff-cr_guard'),null,'expired buffs disappear');
  assert.equal(doc.getElementById('hudBuffs').style.display,'none');
});

test('the shared buff strip clears a resizable chat on narrow screens and returns when chat is hidden',()=>{
  reset();const view=doc.getElementById('view'),field=doc.getElementById('ov'),host=doc.getElementById('hudBuffs');
  const chat=doc.createElement('section');chat.id='socialChat';chat.style.display='block';view.append(chat);
  field.getBoundingClientRect=()=>({left:0,right:390,top:0,bottom:800,width:390,height:800});
  host.getBoundingClientRect=()=>({left:330,right:368,top:700,bottom:738,width:38,height:38});
  let top=570,right=360;chat.getBoundingClientRect=()=>({left:8,right,top,bottom:770,width:right-8,height:770-top});
  try{
    ev(`S.cls='Crusader';S.sk.cr_guard=5;resetSkillRuntime();mobs=[{hp:10}];tickCombatSkills(.1);bars()`);
    const tile=doc.getElementById('player-buff-cr_guard');tile.focus();assert.equal(host.style.bottom,'238px');
    top=450;ev('bars()');assert.equal(host.style.bottom,'358px','resizing the chat adjusts the clearance');assert.equal(doc.activeElement,tile);
    chat.style.display='none';ev('bars()');assert.equal(host.style.bottom,'','hidden chat restores the normal dock position');
    chat.style.display='block';right=100;ev('bars()');assert.equal(host.style.bottom,'','a chat that does not overlap horizontally needs no lift');
    const tip=tile.querySelector('.pbx-fly');let tileRight=120;
    tile.getBoundingClientRect=()=>({right:tileRight});tip.getBoundingClientRect=()=>({width:212});
    ev('placeHudBuffs(document.getElementById("hudBuffs"))');assert.equal(tip.style.transform,'translateX(100px)','flyouts near the left edge stay inside the field');
    tileRight=350;ev('placeHudBuffs(document.getElementById("hudBuffs"))');assert.equal(tip.style.transform,'','unneeded flyout offsets are removed');
  }finally{chat.remove();delete field.getBoundingClientRect;delete host.getBoundingClientRect;}
});

test('Ascension buffs use their actual cast strength; shields end when depleted or expired',()=>{
  reset();ev(`S.cls='Arch Bishop';S.lv=150;S.sk.ab_ward=10;S.sk.ab_duple=10;
    ascState().skills['Arch Bishop'].level=30;ascState().skills['Arch Bishop'].ranks.ab_ward=5;ascState().skills['Arch Bishop'].ranks.ab_duple=5;
    resetSkillRuntime();mobs=[{hp:10}];tickCombatSkills(.1);bars()`);
  const duple=doc.getElementById('player-buff-ab_duple'),ward=doc.getElementById('player-buff-ab_ward');assert.ok(duple&&ward);
  assert.equal(duple.querySelector('.s').textContent,'14');assert.match(duple.textContent,/Sacred damage: \+30%/);
  assert.doesNotMatch(duple.textContent,/for 12 seconds/,'base-duration prose does not misrepresent an upgraded timer');
  assert.equal(ev('skillRuntime.buffs.ab_ward.left'),10);assert.equal(ward.querySelector('.s').textContent,'8','the shield itself lasts eight seconds, not the upgraded bookkeeping timer');
  assert.match(ward.textContent,/HP shield remaining/);
  ev(`mobs=[];t+=3;tickCombatSkills(3);bars()`);assert.equal(ward.querySelector('.s').textContent,'5');
  ev(`S.skOff.ab_ward=true;t+=.1;tickCombatSkills(.1);bars()`);
  assert.equal(ev('!!skillRuntime.buffs.ab_ward'),false,'pausing removes the ordinary buff record');
  assert.equal(doc.getElementById('player-buff-ab_ward'),ward,'the already-cast shield remains visible while it still absorbs');
  assert.equal(ev('absorbSoak(1)'),0,'the shield continues to work after auto-cast is paused');
  ev(`absorbSoak(1e9);bars()`);assert.equal(doc.getElementById('player-buff-ab_ward'),null,'an exhausted shield is no longer shown as active');
});

test('stale player buffs never leak across class changes or different save objects',()=>{
  reset();ev(`S.cls='Crusader';S.sk.cr_guard=1;resetSkillRuntime();mobs=[{hp:10}];tickCombatSkills(.1);bars()`);
  assert.ok(doc.getElementById('player-buff-cr_guard'));
  ev(`S.cls='Knight';bars()`);assert.equal(doc.getElementById('player-buff-cr_guard'),null);
  ev(`S.cls='Crusader';bars()`);assert.equal(doc.getElementById('player-buff-cr_guard'),null,'a class change resets transient combat state');
  ev(`resetSkillRuntime();for(const k in skCd)delete skCd[k];mobs=[{hp:10}];tickCombatSkills(.1);bars()`);assert.ok(doc.getElementById('player-buff-cr_guard'));
  ev(`S=fresh();S.cls='Crusader';S.sk.cr_guard=1;bars()`);assert.equal(doc.getElementById('player-buff-cr_guard'),null,'same class on another save cannot inherit transient buffs');
});

test('the real plaza look reads earned challenge titles and keeps legacy rank titles',()=>{
  reset();for(const f of ['assets/digimon/roster.js','assets/digimon/base-stats.js','assets/social-rules.js','assets/digimon-sanctuary.js','assets/digimon-battle.js'])g.window.eval(fs.readFileSync(path.join(root,f),'utf8'));
  const social=fs.readFileSync(path.join(root,'assets/social.js'),'utf8').replace('window.PGSocial={','window.__testSocialLook=currentLook;window.PGSocial={');g.window.eval(social);
  ev(`S.titleAwards=['mythic-edge'];S.equippedTitle='mythic-edge'`);assert.equal(g.window.__testSocialLook().title,'Mythic Edge');
  ev(`S.titleAwards=[]`);assert.equal(g.window.__testSocialLook().title,'','locked titles are not advertised');
  ev(`S.indexXp=1000;S.equippedTitle='field-scout'`);assert.equal(g.window.__testSocialLook().title,'Field Scout');
});

const {SocialRoom}=await import('../../workers/social/room.mjs');
test('existing room look transport relays and bounds achievement title text',()=>{
  reset();ev(`S.titleAwards=['mythic-edge'];S.equippedTitle='mythic-edge'`);
  const room=new SocialRoom({now:()=>1000}),events=[];
  const a=room.connect({id:1,username:'A'},()=>{},()=>{}),b=room.connect({id:2,username:'B'},s=>events.push(JSON.parse(s)),()=>{});
  room.receive(b,JSON.stringify({type:'join',look:{cls:'Novice',appearance:{version:1,sex:'m'}}}));
  room.receive(a,JSON.stringify({type:'join',look:g.window.__testSocialLook()}));
  assert.equal(a.look.title,'Mythic Edge');assert.ok(events.some(e=>e.player?.look?.title==='Mythic Edge'));
  const bounded=room.cleanLook({...g.window.__testSocialLook(),title:'x'.repeat(80)+'\u0000'});assert.equal(bounded.title.length,64);
});
}finally{g.close()}
console.log(`${passed} passed, ${failed} failed`);if(failed)process.exitCode=1;
})().catch(e=>{console.error(e);process.exitCode=1;g.close()});
