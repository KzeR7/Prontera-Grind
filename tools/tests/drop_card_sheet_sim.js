// Equipment + card worksheet: its offline snapshot must describe the real game tables.
//   node tools/tests/drop_card_sheet_sim.js
//   node tools/tests/drop_card_sheet_sim.js --refresh-snapshot  # after an intentional game-data change
//
// This pins the standalone review sheet to index.html so a future tuning sheet cannot quietly
// show yesterday's gear pools, stage-power routing, card grades, or card values as if they were live.
const fs=require('fs'),vm=require('vm'),assert=require('assert'),os=require('os'),path=require('path'),cp=require('child_process');
const root=path.resolve(__dirname,'../..'),src=fs.readFileSync(path.join(root,'index.html'),'utf8');
const htmlPath=path.join(root,'Updates/cards-gear-audit/equipment-cards-tuning.html'),html=fs.readFileSync(htmlPath,'utf8');
const grab=(a,b)=>{const i=src.indexOf(a),j=src.indexOf(b,i);if(i<0||j<0)throw Error('cannot find source boundary '+a);return src.slice(i,j)};
const pick=(re,name)=>{const m=src.match(re);if(!m)throw Error('cannot find '+name);return m[0]};
const pickValue=(re,name)=>{const m=src.match(re);if(!m)throw Error('cannot find '+name);return m[1]};

function liveData(){
  const mapDecl=grab('const MAPS=[','MAPS.forEach(mp=>{mp.mobs=mp.mobs.map(pm);mp.boss=pm(mp.boss)});');
  const code=[
    grab('const G=(w,a,h,o,l,ac,ac2)=>','const MAPS=['),
    mapDecl,
    `MAPS.forEach(mp=>{mp.mobs=mp.mobs.map(x=>({n:x.split(':')[0]}));mp.boss={n:mp.boss.split(':')[0]};});`,
    pick(/const REC=\[[^\]]*\];/,'map recommendations'),
    `MAPS.forEach((m,i)=>{m.b=[0,9,19,31,43,59,66,73,79,89][i];m.rec=REC[i]});`,
    // v76: the Nightmare band's constants and the two extra catalogue rows per map, so the sheet
    // shows exactly what the game ships
    grab('const NMLV=[', 'GEAR.forEach((row,m)=>{row.push(nmRow(m,0),nmRow(m,1))});') + 'GEAR.forEach((row,m)=>{row.push(nmRow(m,0),nmRow(m,1))});',
    pick(/const EARLY_FIELD_PWR=\[[^;]+;/,'early-map power schedules'),
    pick(/const fieldPower=\(m,l\)=>[^;]+;/, 'fieldPower'),   // v76: one ternary expression, no inner statement
    pick(/const secOf=[^;]+;/,'secOf'),
    pick(/const secField=\(m,l\)=>[^;]+;/,'secField'),
    pick(/const RAR=\[[^\]]*\];/,'equipment rarity table'),
    pick(/const AM=\[[^\]]*\],GRADE=\[[^\]]*\],GI=\[[^\]]*\],CV=\[[^\]]*\];/,'card grade/CV table'),
    pick(/const AFF=\[[^\]]*\],AB=\{[^}]*\};/,'card stat/weight table'),
    `const K5=${pickValue(/K5=(\[[^\]]*\]);/,'base card stats')};`,
    pick(/const cardVal=\(g,st\)=>[^;]+;/,'cardVal'),
    pick(/const cardStat=\(g,seed\)=>\{[^}]*\};/,'cardStat'),
    `const SECN=${pickValue(/SECN=(\[[^\]]*\])/,'equipment section names')};`,
    pick(/const CFIT=\{[^}]*\},CFL=\{[^}]*\};/,'card slot fit table'),
    pick(/const MAPTIER=\[[^\]]*\];/,'map rarity bands'),
    pick(/const MAPGRADE=\[[^\]]*\];/,'map grade caps'),
    pick(/const MAPVAL=\[[^\]]*\];/,'map value bands'),
    pick(/const dropTier=\(m,l\)=>[^;]+;/,'dropTier'),
    pick(/const FIELD_GEAR=\[[^\]]*\],FIELD_GEAR_MID=\[[^\]]*\],BOSS_POOL_TOTAL=\[[^\]]*\];/,'field drop tables'),
    pick(/const BOSS_CRIT_RES=\[[^\]]*\],NM_CRIT_RES=\[[^\]]*\],bossCritRes=\(m,l\)=>[^;]+;/,'boss crit resistance'),
    grab('function gearPool(m,l){','// ---------- stat progression'),
    `const WICON=${pickValue(/const WICON=(\{[^}]*\})/,'weapon type table')};`,
    `this.__live={MAPS,RAR,GRADE,AFF,AB,K5,cardVal,cardStat,CFIT,SECN,WICON,fieldPower,fieldOf};`
  ].join('\n');
  const context={};vm.createContext(context);vm.runInContext(code,context);
  const X=context.__live,build=pickValue(/const BUILD='([^']+)'/,'BUILD');
  const rawField=X.fieldOf(0,1),rawBoss=X.fieldOf(0,10);
  const out={
    build,
    sectionNames:Array.from(X.SECN),
    gearRarities:Array.from(X.RAR,x=>x.n),
    cardGrades:Array.from(X.GRADE),
    cardStats:Array.from(X.AFF),
    baseStats:Array.from(X.K5),
    cardFits:Object.fromEntries(Array.from(X.AFF,k=>[k,X.CFIT[k]])),
    weaponTypes:Array.from(Object.keys(X.WICON)),
    nonWeaponOrder:['armor','head','off','leg','acc'],
    rates:{fieldGear:Array.from(rawField.mobs[0].drops,x=>x[1]),fieldCard:rawField.mobs[0].cardCh,bossGear:rawBoss.boss.drops[0][1],bossCard:rawBoss.boss.cardCh},
    cardPools:Array.from(X.GRADE,(_,g)=>Array.from(g>=2?X.AFF:X.K5)),
    cardValues:Array.from(X.GRADE,(_,g)=>Object.fromEntries(Array.from(X.AFF,k=>[k,X.cardVal(g,k)]))),
    maps:[]
  };
  for(let mi=0;mi<X.MAPS.length;mi++){
    const mp=X.MAPS[mi];
    const sectionItems=(g,mi,si)=>{
      const raw=[...Object.entries(g.w).map(([weaponType,name])=>({slot:'weapon',weaponType,name})),
        {slot:'armor',name:g.a},{slot:'head',name:g.h},...(g.o?[{slot:'off',name:g.o}]:[]),
        {slot:'leg',name:g.l},{slot:'acc',name:g.ac},{slot:'acc',name:g.ac2}];
      return raw.map((item,i)=>({id:`m${mi}-s${si}-i${i}`,...item}));
    };
    const sections=Array.from(mp.gear,(g,si)=>{
      const items=sectionItems(g,mi,si);
      if(mi===9&&si===3){
        const added=sectionItems(mp.gearUpgrade,mi,si).map((item,i)=>({...item,id:`m${mi}-s${si}-u-i${i}`,gearSet:'abyss-ascended'}));
        items.push(...added);
      }
      return {index:si,items};
    });
    const stages=[];
    for(let level=1;level<=10;level++){
      const F=X.fieldOf(mi,level),sec=F.sec,section=sections[sec];
      const itemId=d=>{
        const found=section.items.find(x=>x.slot==='weapon'?x.weaponType===d.k&&x.name===d.n:x.slot===d.k&&x.name===d.n);
        if(!found)throw Error(`cannot map ${mp.n} stage ${level} drop ${d.k}:${d.n}`);
        return found.id;
      };
      const card=c=>({name:c.n,grade:c.g,stat:c.stat,value:X.cardVal(c.g,c.stat)});
      stages.push({
        stage:level,power:X.fieldPower(mi,level),section:sec,gearSet:F.gearSet,tier:F.tier,rarity:X.RAR[F.tier].n,
        mobs:Array.from(F.mobs,m=>({name:m.n,drops:Array.from(m.drops,([item,rate])=>({itemId:itemId(item),rate})),card:card(m.card),cardRate:m.cardCh,ore:!!m.ore,oreRate:m.oreCh||0})),
        boss:F.boss?{name:F.boss.n,drops:Array.from(F.boss.drops,([item,rate])=>({itemId:itemId(item),rate})),card:card(F.boss.card),cardRate:F.boss.cardCh,ore:!!F.boss.ore,oreRate:F.boss.oreCh||0}:null
      });
    }
    out.maps.push({name:mp.n,t:mp.t,rec:mp.rec,boss:mp.boss.n,mobs:Array.from(mp.mobs,x=>x.n),sections,stages});
  }
  return out;
}

let pass=0,fail=0;
const t=(name,fn)=>{try{fn();console.log('  ok   '+name);pass++}catch(e){console.log('  FAIL '+name+' -> '+e.message);fail++}};
const dataMatch=html.match(/<script id="baseline-data" type="application\/json">\s*([\s\S]*?)\s*<\/script>/);
assert.ok(dataMatch,'the worksheet has no embedded baseline data');
const sheet=JSON.parse(dataMatch[1]),live=liveData();
if(process.argv.includes('--refresh-snapshot')){
  const start=html.indexOf('<script id="baseline-data" type="application/json">'),end=html.indexOf('</script>',start);
  if(start<0||end<0)throw Error('cannot find the worksheet snapshot block');
  const open='<script id="baseline-data" type="application/json">';
  fs.writeFileSync(htmlPath,html.slice(0,start)+open+'\n'+JSON.stringify(live)+'\n'+html.slice(end));
  console.log('Refreshed worksheet baseline from index.html.');
  process.exit(0);
}
console.log('equipment & card sheet: offline, live-source baseline\n');

t('the embedded snapshot exactly matches the current game tables',()=>assert.deepStrictEqual(sheet,live));
t('the worksheet covers all maps, gear sections, and field stages',()=>{
  assert.strictEqual(sheet.maps.length,10);
  // Each map has four normal job sections plus the two separate Nightmare rows; the Abyss's
  // enhanced third-job set is listed as a variant inside section 3, not a new equip-gate section.
  for(const m of sheet.maps){assert.strictEqual(m.sections.length,6,m.name);assert.strictEqual(m.stages.length,10,m.name);assert.ok(m.stages.every(s=>s.mobs.length===2),m.name+' field mob count')}
  assert.ok(sheet.maps.every(m=>m.sections[4].name===undefined||m.sections[4].items.length>0),'the Nightmare rows carry items');
  assert.strictEqual(sheet.sectionNames[4],'Nightmare gear');assert.strictEqual(sheet.sectionNames[5],'Abyssal Nightmare gear');
  // v80: Geffen and Payon each gained a second weapon family, and the Nightmare rows are generated
  // from each map's own section 3, so all six of their rows grew by one: 601 -> 613. The Thief-line
  // katar swap then took four back: Morroc's 2nd-job and high-tier shelves (and the two Nightmare
  // rows built from the high-tier one) now carry a single katar where they carried a dagger too.
  assert.strictEqual(sheet.maps.reduce((n,m)=>n+m.sections.reduce((a,s)=>a+s.items.length,0),0),609);
});
t('the worksheet snapshot carries the map-specific equipment progression',()=>{
  assert.strictEqual(sheet.sectionNames[0],'Starter gear');
  assert.ok(!sheet.maps[0].sections[0].items.some(x=>x.slot==='off'),'Novice starter drops must exclude shields');
  assert.deepStrictEqual(sheet.maps[0].stages.map(s=>s.power),[1,2,3,4,5,6,7,8,9,10]);
  assert.deepStrictEqual(sheet.maps[0].stages.map(s=>s.section),Array(10).fill(0));
  const band=[10,12,15,17,20,20,28,35,43,50],sections=[0,0,0,0,0,1,1,2,2,3];
  const roles=['Swordman & Merchant','Mage','Thief','Archer'];
  for(let mi=1;mi<=4;mi++){
    assert.deepStrictEqual(sheet.maps[mi].stages.map(s=>s.power),band,sheet.maps[mi].name+' power schedule');
    assert.deepStrictEqual(sheet.maps[mi].stages.map(s=>s.section),sections,sheet.maps[mi].name+' gear tiers');
    assert.ok(sheet.maps[mi].t.includes(roles[mi-1]));
    assert.ok(sheet.maps[mi].t.includes('stages 1-5 Lv 10-20; 6-10 Lv 20-50'));
  }
  assert.ok(sheet.maps[0].t.includes('Lv 1-10'));
  for(let mi=5;mi<=7;mi++)assert.deepStrictEqual(sheet.maps[mi].stages.map(s=>s.section),Array(10).fill(2),sheet.maps[mi].name+' keeps second-job gear all stages');
  assert.deepStrictEqual(sheet.maps[8].stages.map(s=>s.section),[2,2,2,2,2,3,3,3,3,3],'Niflheim: better second-job gear, then third-job gear');
  assert.deepStrictEqual(sheet.maps[9].stages.map(s=>s.section),Array(10).fill(3),'Abyss stays third-job eligible throughout');
  assert.deepStrictEqual(sheet.maps[9].stages.slice(0,5).map(s=>s.gearSet),Array(5).fill('base'));
  assert.deepStrictEqual(sheet.maps[9].stages.slice(5).map(s=>s.gearSet),Array(5).fill('abyss-ascended'));
  assert.ok(sheet.maps[9].sections[3].items.some(x=>x.gearSet==='abyss-ascended'),'enhanced gear is catalogued under the same section-3 gate');
});
t('every stage item assignment follows the allocated weapon-first rotation',()=>{
  // v79: the sliding window is gone. Roll 1 is ALWAYS a weapon, rolls 2-3 are armour or an
  // accessory, each stage walks two weapons and four defensive pieces along the map's shelf, and
  // no item is ever listed twice on one field (the old window listed one item on both mobs at two
  // different rates, and left 20 of 100 normal fields with no weapon at all).
  for(let mi=0;mi<sheet.maps.length;mi++)for(const stage of sheet.maps[mi].stages){
    const pool=sheet.maps[mi].sections[stage.section].items.filter(x=>(x.gearSet||'base')===stage.gearSet);
    const weapons=pool.filter(x=>x.slot==='weapon'),defensive=pool.filter(x=>x.slot!=='weapon');
    const where=`${sheet.maps[mi].name} stage ${stage.stage}`,seen=new Set();
    for(let mob=0;mob<stage.mobs.length;mob++)for(let d=0;d<3;d++){
      const item=pool.find(x=>x.id===stage.mobs[mob].drops[d].itemId);
      assert.ok(item,`${where} mob ${mob+1} roll ${d+1} is not in the field pool`);
      if(d===0)assert.ok(weapons.includes(item),`${where} mob ${mob+1} roll 1 must be a weapon`);
      else{
        assert.ok(defensive.includes(item),`${where} mob ${mob+1} roll ${d+1} must be armour or an accessory`);
        // a defensive piece is never listed twice on one field - the old window did exactly that
        assert.ok(!seen.has(item.id),`${where} lists ${item.name} twice`);
        seen.add(item.id);
      }
    }
    if(weapons.length>1)assert.notStrictEqual(stage.mobs[0].drops[0].itemId,stage.mobs[1].drops[0].itemId,
      `${where} both mobs carry the same weapon`);
    assert.strictEqual(stage.mobs[0].drops[0].itemId,weapons[(2*(stage.stage-1))%weapons.length].id,`${where} weapon rotation`);
    assert.strictEqual(stage.mobs[1].drops[0].itemId,weapons[(2*(stage.stage-1)+1)%weapons.length].id,`${where} second mob weapon`);
  }
  // a map's whole weapon list is farmable across its own stages, band by band
  for(const [mi,levels] of [[0,[1,2]],[1,[1,2]],[5,Array.from({length:10},(_,i)=>i+1)],[8,[1,2,3,4,5]],[9,[1,2,3,4,5]]]){
    const got=new Set();
    for(const level of levels){
      const stage=sheet.maps[mi].stages[level-1];
      stage.mobs.forEach(m=>m.drops.forEach(d=>{
        const pool=sheet.maps[mi].sections[stage.section].items.filter(x=>(x.gearSet||'base')===stage.gearSet);
        const item=pool.find(x=>x.id===d.itemId);if(item&&item.slot==='weapon')got.add(item.weaponType);
      }));
    }
    const all=new Set(sheet.maps[mi].sections[sheet.maps[mi].stages[levels[0]-1].section].items.filter(x=>x.slot==='weapon').map(x=>x.weaponType));
    assert.deepStrictEqual([...got].sort(),[...all].sort(),`${sheet.maps[mi].name} stages ${levels[0]}-${levels.at(-1)} must reach every weapon family`);
  }
});
t('every requested stage band drops weapon families for all eligible class lines',()=>{
  const weaponTypes=[...sheet.weaponTypes].sort(),groups=[
    [5,Array.from({length:10},(_,i)=>i+1)],[6,Array.from({length:10},(_,i)=>i+1)],[7,Array.from({length:10},(_,i)=>i+1)],
    [8,[1,2,3,4,5]],[8,[6,7,8,9,10]],[9,[1,2,3,4,5]],[9,[6,7,8,9,10]]
  ];
  for(const [mi,levels] of groups){
    const types=new Set(),dropped=new Set(),droppedSlots=new Set();
    for(const level of levels){
      const stage=sheet.maps[mi].stages[level-1],pool=sheet.maps[mi].sections[stage.section].items.filter(x=>(x.gearSet||'base')===stage.gearSet);
      pool.filter(x=>x.slot==='weapon').forEach(x=>types.add(x.weaponType));
      stage.mobs.flatMap(m=>m.drops).forEach(d=>{
        const item=pool.find(x=>x.id===d.itemId);if(item){droppedSlots.add(item.slot);if(item.slot==='weapon')dropped.add(item.weaponType)}
      });
    }
    assert.deepStrictEqual([...types].sort(),weaponTypes,`${sheet.maps[mi].name} stages ${levels[0]}-${levels.at(-1)} catalogue coverage`);
    assert.deepStrictEqual([...dropped].sort(),weaponTypes,`${sheet.maps[mi].name} stages ${levels[0]}-${levels.at(-1)} actual drops cover every class weapon family`);
    assert.deepStrictEqual([...droppedSlots].sort(),['acc','armor','head','leg','off','weapon'],`${sheet.maps[mi].name} stages ${levels[0]}-${levels.at(-1)} actual drops cover each equipment slot`);
  }
});
t('rarity, card grades, and Stage-10 boss pools are complete',()=>{
  for(let mi=0;mi<sheet.maps.length;mi++){
    const m=sheet.maps[mi];
    for(const s of m.stages){
      const cardGrade=s.stage<=3?0:s.stage<=7?1:2;
      for(const mob of s.mobs){assert.strictEqual(mob.drops.length,3);assert.strictEqual(mob.card.grade,cardGrade);assert.strictEqual(mob.card.name,mob.name+' Card')}
      if(s.stage===10){assert.ok(s.boss);const stagePool=m.sections[s.section].items.filter(x=>(x.gearSet||'base')===s.gearSet);assert.strictEqual(s.boss.drops.length,stagePool.length);
        // v57: the pool still lists every item, but the whole pool now totals ~6% per boss kill
        // v73: maps 6-10 (index 5+) pay 30% less, so their boss pool totals ~4.2% per kill
        const total=s.boss.drops.reduce((a,d)=>a+d.rate,0),want=mi>=5?4.2:6;
        assert.ok(Math.abs(total-want)<1.2,'boss pool totals about '+want+'%, got '+total.toFixed(2)+'%');
        assert.strictEqual(s.boss.card.grade,3);assert.strictEqual(s.boss.card.name,m.boss+' Card')}
      else assert.strictEqual(s.boss,null);
    }
  }
});
t('card effect matrix uses the game’s actual rounded values and roll pools',()=>{
  assert.deepStrictEqual(sheet.cardPools[0],sheet.baseStats);assert.deepStrictEqual(sheet.cardPools[1],sheet.baseStats);
  assert.deepStrictEqual(sheet.cardPools[2],sheet.cardStats);assert.deepStrictEqual(sheet.cardPools[3],sheet.cardStats);
  assert.deepStrictEqual(sheet.cardValues.map(g=>g.str),[3,6,10,16]);
  assert.deepStrictEqual(sheet.cardValues.map(g=>g.hp),[38,77,115,192]);
  assert.deepStrictEqual(sheet.cardValues.map(g=>g.atk),[3,5,8,13]);
  // v73: cdm cards use their own 3/7/10/13 ladder, and the criticards follow AB.crit .32
  assert.deepStrictEqual(sheet.cardValues.map(g=>g.cdm),[3,7,10,13]);
  assert.deepStrictEqual(sheet.cardValues.map(g=>g.crit),[1,2,3,5]);
});
t('worksheet migrates v45 edits through the merged class-skin + balance build',()=>{
  const script=html.match(/<script>\s*([\s\S]*?)\s*<\/script>/)[1];
  assert.ok(script.includes("'2026-10-08 grind-v78.1 Nightmare N rarity and class gates'"),'v78.1 worksheet edits survive the stage-progression update');
  assert.ok(script.includes("'2026-10-08 grind-v78 saved class weapon sprites'"),'v78 worksheet edits survive the N-tier correction');
  assert.ok(script.includes("'2026-10-08 grind-v77.3 map clears advance, Stage 10 normal-mode cue, town and Echo row'"),'v77.3 worksheet edits survive the rarity-display correction');
  assert.ok(script.includes("'2026-10-05 skin-v53 class animations decoded in-game'"),'skin-v53 becomes a safe previous build once the merged snapshot is written');
  assert.ok(script.includes("'2026-10-05 skin-v52 animated class skins (APNG)'"),'skin-v52 must remain a safe previous build');
  assert.ok(script.includes("'2026-10-05 skin-v51 live class skins in the game'"),'skin-v51 must remain a safe previous build');
  assert.ok(script.includes("'2026-10-05 balance-v50 slower index capped cards safer pets'"),'v50 must be a safe previous build before the merged snapshot');
  assert.ok(script.includes("'2026-10-05 balance-v49 mastery GM test controls'"),'v49 must remain a safe previous build before the merged snapshot');
  assert.ok(script.includes("'2026-10-05 balance-v48 individual mastery + skill allocator'"),'v48 must remain a safe previous build before the merged snapshot');
  assert.ok(script.includes("'2026-10-05 balance-v47 bag locks + gear level reference'"),'v47 must remain a safe previous build before the merged snapshot');
  assert.ok(script.includes("'2026-10-05 balance-v46 cdm tune + mastery index'"),'v46 must remain a safe previous build before the merged snapshot');
  assert.ok(script.includes("'2026-10-05 balance-v45 all-class late-map gear'"),'the older v45 worksheet migration must remain supported');
  class Element{constructor(){this.innerHTML='';this.textContent='';this.value='';this.hidden=false;this.dataset={};this.classList={toggle(){},remove(){},add(){}}}addEventListener(){}setAttribute(){}focus(){}select(){}}
  const els=new Map(),get=id=>{if(!els.has(id))els.set(id,new Element());return els.get(id)};get('baseline-data').textContent=dataMatch[1];
  const catalog=sheet.maps.map(m=>m.sections.map(s=>s.items.map(i=>({...i,field:true,boss:true}))));
  const armor=catalog[9][3].find(i=>i.slot==='armor');armor.name='My v45 Dark Lord Mail';armor.boss=false;
  const saved={schema:1,sourceBuild:'2026-10-05 balance-v45 all-class late-map gear',catalog,globalNotes:'keep my Abyss notes'};
  const document={getElementById:get,querySelectorAll:()=>[],addEventListener(){}};
  const context={document,localStorage:{getItem:()=>JSON.stringify(saved),setItem(){},removeItem(){}},navigator:{},console,Blob:function(){},URL:{},confirm:()=>true};
  vm.createContext(context);vm.runInContext(script,context);
  const migrated=vm.runInContext('state',context),newArmor=migrated.catalog[9][3].find(i=>i.slot==='armor');
  assert.strictEqual(migrated.sourceBuild,sheet.build,'v45 should migrate to the current v51 baseline');
  assert.strictEqual(newArmor.name,'My v45 Dark Lord Mail','the v45 item rename should survive');
  assert.strictEqual(newArmor.boss,false,'the v45 drop toggle should survive');
  assert.strictEqual(migrated.globalNotes,saved.globalNotes,'v45 notes should survive');
});

t('worksheet safely migrates v42/v43 edits across the Assassin weapon catalog change',()=>{
  const script=html.match(/<script>\s*([\s\S]*?)\s*<\/script>/)[1];
  class Element{constructor(){this.innerHTML='';this.textContent='';this.value='';this.hidden=false;this.dataset={};this.classList={toggle(){},remove(){},add(){}}}addEventListener(){}setAttribute(){}focus(){}select(){}}
  for(const previous of ['2026-10-05 balance-v42 early-map class pathways','2026-10-05 balance-v43 progression pacing']){
    const els=new Map(),get=id=>{if(!els.has(id))els.set(id,new Element());return els.get(id)};get('baseline-data').textContent=dataMatch[1];
    const oldCatalog=sheet.maps.map(m=>m.sections.map(s=>s.items.map(i=>({...i,field:true,boss:true}))));
    oldCatalog[0][0][0]={...oldCatalog[0][0][0],name:'My Short Sword',field:false};
    oldCatalog[5][0][0]={...oldCatalog[5][0][0],weaponType:'dagger',name:'Old Coral Knife',field:false,boss:false};
    oldCatalog[5][0].push({id:'saved-added-item',slot:'weapon',weaponType:'dagger',name:'Custom legacy add',field:true,boss:false,isNew:true});
    const oldEdits={schema:1,sourceBuild:previous,catalog:oldCatalog,
      dropOverrides:{'0:1:0:0':'m0-s0-i0','5:1:0:0':'m5-s0-i0'},globalNotes:'keep these card notes'};
    const document={getElementById:get,querySelectorAll:()=>[],addEventListener(){}};
    const context={document,localStorage:{getItem:()=>JSON.stringify(oldEdits),setItem(){},removeItem(){}},navigator:{},console,Blob:function(){},URL:{},confirm:()=>true};
    vm.createContext(context);vm.runInContext(script,context);
    const migrated=vm.runInContext('state',context);
    assert.strictEqual(migrated.globalNotes,oldEdits.globalNotes,previous);
    assert.strictEqual(migrated.sourceBuild,sheet.build,previous);
    assert.strictEqual(migrated.catalog[0][0][0].name,'My Short Sword',previous+' should preserve a compatible rename');
    assert.strictEqual(migrated.catalog[0][0][0].field,false,previous+' should preserve a compatible drop toggle');
    assert.strictEqual(migrated.catalog[5][0][0].weaponType,'katar',previous+' must reset the old dagger identity');
    assert.strictEqual(migrated.catalog[5][0][0].name,sheet.maps[5].sections[0].items[0].name,previous+' must use the new gear name');
    assert.strictEqual(migrated.catalog[5][0][0].field,true,previous+' must reset changed-item drop toggles');
    assert.ok(migrated.catalog[5][0].some(i=>i.id==='saved-added-item'),previous+' should preserve custom additions');
    assert.strictEqual(migrated.dropOverrides['0:1:0:0'],'m0-s0-i0',previous+' should preserve compatible drop overrides');
    assert.strictEqual(migrated.dropOverrides['5:1:0:0'],undefined,previous+' must discard an override for the replaced item');
  }
});
t('worksheet rebases v44 saved catalog IDs when late-map weapons are added',()=>{
  const script=html.match(/<script>\s*([\s\S]*?)\s*<\/script>/)[1];
  class Element{constructor(){this.innerHTML='';this.textContent='';this.value='';this.hidden=false;this.dataset={};this.classList={toggle(){},remove(){},add(){}}}addEventListener(){}setAttribute(){}focus(){}select(){}}
  const els=new Map(),get=id=>{if(!els.has(id))els.set(id,new Element());return els.get(id)};get('baseline-data').textContent=dataMatch[1];
  const previousTypes={
    5:{2:['sword','katar','staff'],3:['bow','axe','sword']},
    6:{2:['bow','katar','axe'],3:['bow','sword','staff']},
    7:{2:['sword','katar','axe'],3:['bow','sword','staff']},
    8:{2:['sword','mace','katar'],3:['sword','katar','staff']},
    9:{2:['sword','katar','mace'],3:['sword','katar','staff']}
  };
  const oldCatalog=sheet.maps.map((m,mi)=>m.sections.map((section,si)=>{
    const oldItems=section.items.filter(i=>mi<5||![2,3].includes(si)||i.slot!=='weapon'||previousTypes[mi][si].includes(i.weaponType));
    return oldItems.map((i,index)=>({...i,id:`m${mi}-s${si}-i${index}`,field:true,boss:true}));
  }));
  const oldArmor=oldCatalog[9][3].find(i=>i.slot==='armor');oldArmor.name='My Tuned Abyss Mail';oldArmor.boss=false;
  const oldId=oldArmor.id,oldEdits={schema:1,sourceBuild:'2026-10-05 balance-v44 two-handed katar',catalog:oldCatalog,
    dropOverrides:{'9:3:0:0':oldId},globalNotes:'keep the endgame note'};
  const document={getElementById:get,querySelectorAll:()=>[],addEventListener(){}};
  const context={document,localStorage:{getItem:()=>JSON.stringify(oldEdits),setItem(){},removeItem(){}},navigator:{},console,Blob:function(){},URL:{},confirm:()=>true};
  vm.createContext(context);vm.runInContext(script,context);
  const migrated=vm.runInContext('state',context),newArmor=migrated.catalog[9][3].find(i=>i.slot==='armor');
  assert.strictEqual(migrated.globalNotes,oldEdits.globalNotes);
  assert.strictEqual(newArmor.name,'My Tuned Abyss Mail','the armor rename should follow the same item identity');
  assert.strictEqual(newArmor.boss,false,'the boss-drop toggle should follow the same item identity');
  assert.notStrictEqual(newArmor.id,oldId,'late-map item IDs should shift after new weapons are inserted');
  assert.strictEqual(migrated.dropOverrides['9:3:0:0'],newArmor.id,'a selected gear override should be rebased to the new ID');
  assert.strictEqual(migrated.sourceBuild,sheet.build);
});

t('the page is standalone, editable, and provides copy/download/reset actions',()=>{
  assert.ok(!html.includes('__BASELINE_DATA__'));
  assert.ok(!/https?:\/\//i.test(html),'external URL found');
  assert.ok(!/<script[^>]+src=/i.test(html),'external script found');
  assert.ok(!/<link[^>]+href=/i.test(html),'external stylesheet found');
  for(const x of ['localStorage','copySpec','downloadSpec','resetSheet','field-drop','card-value','card-pool','card-override','add-gear','does not raise equipment, card, ore or pet drop odds','escort-mob drops'])assert.ok(html.includes(x),'missing '+x);
});
t('the inline worksheet JavaScript passes node syntax checking',()=>{
  const match=html.match(/<script>\s*([\s\S]*?)\s*<\/script>/);assert.ok(match,'inline application script missing');
  const tmp=path.join(os.tmpdir(),`pg-drop-card-sheet-${process.pid}.js`);
  try{fs.writeFileSync(tmp,match[1]);cp.execFileSync(process.execPath,['--check',tmp],{stdio:'pipe'})}finally{try{fs.unlinkSync(tmp)}catch(_){}}
});
t('the page renders its map, exact gear drops, card matrix, and all-map card list',()=>{
  const script=html.match(/<script>\s*([\s\S]*?)\s*<\/script>/)[1],els=new Map(),handlers={};
  class Element{constructor(){this.innerHTML='';this.textContent='';this.value='';this.hidden=false;this.dataset={};this.classList={toggle(){},remove(){},add(){}}}addEventListener(){}setAttribute(){}focus(){}select(){}}
  const get=id=>{if(!els.has(id))els.set(id,new Element());return els.get(id)};get('baseline-data').textContent=dataMatch[1];
  const document={getElementById:get,querySelectorAll:()=>[],addEventListener:(name,fn)=>{handlers[name]=fn}};
  const context={document,localStorage:{getItem:()=>null,setItem(){},removeItem(){}},navigator:{},console,Blob:function(){},URL:{},confirm:()=>true};
  vm.createContext(context);vm.runInContext(script,context);
  for(const id of ['summary','rateControls','stageDetail','stageSchedule','gearCatalog','cardMatrix','cardDropLists'])assert.ok(get(id).innerHTML.length>0,id+' did not render');
  assert.ok(get('stageDetail').innerHTML.includes('Poring Card'));
  assert.ok(get('stageDetail').innerHTML.includes('Base Lv 1'));
  assert.ok(get('stageSchedule').innerHTML.includes('Base Lv 10'));
  assert.ok(get('stageSchedule').innerHTML.includes('Starter gear'));
  assert.ok(get('stageDetail').innerHTML.includes('Short Sword'));
  assert.ok(get('gearCatalog').innerHTML.includes('Excalibur'));
  assert.ok(get('cardMatrix').innerHTML.includes('192 max HP'));
  assert.ok(get('cardDropLists').innerHTML.includes('Dark Lord Card'));
  for(const id of ['summary','rateControls','stageDetail','stageSchedule','gearCatalog','cardMatrix','cardDropLists'])assert.ok(!get(id).innerHTML.includes('undefined'),id+' rendered undefined');
  const target={closest:s=>s==='#copySpec'?{}:null};handlers.click({target});
  const initial=JSON.parse(get('exportText').value);assert.strictEqual(initial.sourceBuild,sheet.build);assert.strictEqual(initial.changes.message,'No edits made yet.');
  const cardValue={dataset:{setting:'card-value',grade:'3',stat:'atk'},value:'20'};handlers.input({target:cardValue});handlers.change({target:cardValue});
  const bossOverride={dataset:{setting:'card-override',map:'0',stage:'10',mob:'boss'},value:'atk'};handlers.input({target:bossOverride});handlers.change({target:bossOverride});
  handlers.click({target});const edited=JSON.parse(get('exportText').value);
  assert.ok(edited.changes.cardValues.some(x=>x.grade==='Legendary'&&x.stat==='ATK %'&&x.to===20));
  assert.ok(edited.changes.individualCardEffects.some(x=>x.map==='Prontera'&&x.monster==='Mastering'&&x.to==='ATK %'));
});
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
