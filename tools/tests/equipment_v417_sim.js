// haven-v417 (owner: "add in the new equipments for me. all the new weapons spread out the maps
// based on the current map levels. but 1 thing different is all these new class nightmare +
// weapons drops at new ascension map. do a proper job. make sure the icons are Ragnarok sprites.")
// This suite locks that request down: real items for the seven expanded families, on the maps that
// train them, with the N/N+ band carrying them and both Ascension maps dropping equipment.
'use strict';
const assert=require('assert/strict'),fs=require('node:fs'),path=require('node:path');
const {createGame}=require('./helpers/game');
const game=createGame(),ev=game.ev;
let pass=0,fail=0;
const t=(n,f)=>{try{f();console.log('  ok   '+n);pass++}catch(e){console.log('  FAIL '+n+' -> '+e.message);fail++}};
const NEW=['spear','book','knuckle','instrument','whip','shuriken','gun'];
const SHIPPED=['sword','dagger','katar','staff','bow','axe','mace'];
const SLOTK=['armor','head','off','leg','acc'];

t('the seven expanded families exist as REAL items, not just a rename',()=>{
  for(const k of NEW){
    let found=0;
    for(let m=0;m<10;m++)for(const sec of [4,5])if(ev(`GEAR[${m}][${sec}].w['${k}']`))found++;
    assert.ok(found>0,'no map carries a real '+k);
  }
  // and the names are the family's own, not a shipped item renamed
  const nm=ev("GEAR[5][4].w.spear");
  assert.match(nm,/Gae Bolg$/,'a spear should be named like a spear, got '+nm);
  assert.doesNotMatch(nm,/Sword|Blade|Saber/,'a spear must not be a renamed sword: '+nm);
});

t('the N row of every map carries the expanded families that map trains',()=>{
  // the four starter maps carry only the line that levels there; the five late maps carry all seven
  for(let m=0;m<10;m++){
    const fams=ev(`Object.keys(GEAR[${m}][4].w).filter(k=>${JSON.stringify(NEW)}.includes(k))`);
    if(m>=5)assert.strictEqual(fams.length,7,'map '+m+' must carry all seven, got '+fams.length);
    else assert.ok(fams.length>=1,'map '+m+' needs at least one expanded family');
  }
});

t('the N+ row of NO map carries them - their N+ is Ascension-only (owner rule)',()=>{
  // Owner: "nightmare maps dont drop N+, All N+ are only drop at ascension map.
  //         this is only applying to the new classes weapons."
  for(let m=0;m<10;m++){
    // JSON round-trip: the array is from the game realm, so compare by value
    const fams5=JSON.parse(ev(`JSON.stringify(Object.keys(GEAR[${m}][5].w).filter(k=>${JSON.stringify(NEW)}.includes(k)))`));
    assert.equal(fams5.length,0,'map '+m+' N+ row must not carry an expanded family, found '+fams5.join(', '));
  }
  // and no Nightmare field can hand one out as section 5, whichever row its band uses
  const offenders=JSON.parse(ev(`JSON.stringify((()=>{const o=[];
    for(let m=0;m<10;m++)for(let l=11;l<=15;l++)for(const T of gearPool(m,l))
      if(${JSON.stringify(NEW)}.includes(T.k)&&T.sec===5)o.push(MAPS[m].n+' S'+l+':'+T.n);
    return o})())`));
  assert.equal(offenders.length,0,'Nightmare must never drop an N+ new-family weapon: '+offenders.slice(0,4).join(', '));
  // their N piece IS reachable on every map, including the late maps whose band runs section 5
  for(let m=0;m<10;m++){
    const n=ev(`gearPool(${m},13).filter(x=>${JSON.stringify(NEW)}.includes(x.k)).length`);
    assert.ok(n>0,'map '+m+' Nightmare band has no expanded-family weapon at all');
  }
  // the only N+ new-family items in the game live on Astral Citadel, and there they are section 5
  const astral=JSON.parse(ev(`JSON.stringify(gearPool(10,4).filter(x=>${JSON.stringify(NEW)}.includes(x.k)))`));
  assert.equal(astral.length,7,'Astral Stages 4-5 must carry all seven N+ pieces');
  astral.forEach(x=>assert.strictEqual(x.sec,5,'the Astral N+ piece must be section 5: '+x.n));
});

t('the normal route is untouched - it still carries the shipped seven only',()=>{
  for(let m=0;m<10;m++)for(const sec of [0,1,2,3]){
    const fams=ev(`Object.keys(GEAR[${m}][${sec}].w)`);
    fams.forEach(k=>assert.ok(SHIPPED.includes(k),'map '+m+' section '+sec+' gained '+k+', which would change every class drop'));
  }
});

t('both Ascension maps drop a real shelf for all fourteen families',()=>{
  // haven-v432 (PR #257 design): the shelf is weapons only - fourteen N+ families, no armour or accessories.
  for(const m of [10,11]){
    for(const l of [1,4]){
      const pool=ev(`gearPool(${m},${l})`);
      assert.strictEqual(pool.length,14,'map '+m+' stage '+l+' shelf size');
      assert.ok(pool.every(x=>!SLOTK.includes(x.k)),'map '+m+' stage '+l+' drops weapons only');
      const fams=new Set(pool.filter(x=>!SLOTK.includes(x.k)).map(x=>x.k));
      assert.strictEqual(fams.size,14,'map '+m+' stage '+l+' must carry all 14 families, got '+fams.size);
      [...SHIPPED,...NEW].forEach(k=>assert.ok(fams.has(k),'map '+m+' missing '+k));
    }
  }
});

t('both Ascension maps drop N+ on every stage; Mythic is Forge-only',()=>{
  // haven-v432 (PR #257 design): Astral and Thor both drop section-5 N+ weapons on all five stages.
  for(const m of [10,11])for(let l=1;l<=5;l++)assert.ok(ev(`gearPool(${m},${l}).every(x=>x.sec===5)`),'map '+m+' stage '+l+' is N+');
  assert.notStrictEqual(ev('gearPool(10,4)[0].n'),ev('gearPool(11,4)[0].n'),'Astral and Thor have their own N+ names');
  assert.strictEqual(ev('rarOf({sec:6,tier:4,mythic:true}).n'),'Mythic');
  assert.strictEqual(ev('SECN[6]'),'Mythic gear','the item card must have a name for section 6');
});

t('every class has a weapon of its own family on every Ascension field',()=>{
  for(const m of [10,11])for(const l of [1,4]){
    // (JSON round-trip: the array comes from another realm, so compare by value, not identity)
    const missing=JSON.parse(ev(`JSON.stringify((()=>{const p=gearPool(${m},${l}).filter(x=>!${JSON.stringify(SLOTK)}.includes(x.k));
      return Object.entries(CLASSES).filter(([n,c])=>c.wt&&!p.some(x=>c.wt.includes(x.k))).map(([n])=>n)})())`));
    assert.equal(missing.length,0,'map '+m+' stage '+l+' leaves these classes without a weapon: '+missing.join(', '));
  }
});

t('the whole weapon budget per kill is the Nightmare table, split across the families',()=>{
  for(const m of [10,11])for(const l of [1,4]){
    const total=ev(`fieldOf(${m},${l}).mobs[0].drops.filter(([T])=>!${JSON.stringify(SLOTK)}.includes(T.k)).reduce((a,[,c])=>a+c,0)`);
    const want=0.25;   // haven-v432 (PR #257 design): FIELD_GEAR_NM[0] halved (NMPLUS_DROP), since every stage is N+
    assert.ok(Math.abs(total-want)<1e-9,'map '+m+' stage '+l+' weapon budget '+total+' != '+want);
  }
  // and no family is unreachable: the split covers all fourteen
  const covered=ev(`(()=>{const f=fieldOf(10,1),s=new Set();
    f.mobs.forEach(mm=>mm.drops.forEach(([T])=>{if(!${JSON.stringify(SLOTK)}.includes(T.k))s.add(T.k)}));return s.size})()`);
  assert.strictEqual(covered,14,'every family must be reachable from a regular mob');
});

t('Ascension mobs and MVPs actually roll gear, and still pay materials',()=>{
  for(const m of [10,11])for(let l=1;l<=5;l++){
    assert.ok(ev(`fieldOf(${m},${l}).mobs.every(x=>x.drops.length>0)`),'map '+m+' stage '+l+' mobs carry gear');
    if(l===5){
      assert.strictEqual(ev(`fieldOf(${m},5).boss.drops.length`),14,'the MVP lists its whole shelf');
      assert.equal(ev(`!!fieldOf(${m},5).boss.mat`),true,'and still pays a Forge material');
    }
  }
});

t('every new item resolves to real Ragnarok item artwork on disk',()=>{
  const icons=JSON.parse(ev('JSON.stringify(RO_ITEM_ICON_CANDIDATES)'));
  for(const k of NEW){
    assert.ok(icons[k]&&icons[k].length,'no icon list for '+k);
    icons[k].forEach(id=>assert.ok(fs.existsSync(path.join(__dirname,'../../assets/equipment-icons',id+'.png')),
      'missing artwork assets/equipment-icons/'+id+'.png for '+k));
  }
  // and each one actually resolves through the game's own icon chooser
  const bad=[];
  for(const m of [10,11])for(const l of [1,4])ev(`gearPool(${m},${l})`).forEach(it=>{
    const id=ev(`gearItemIconId(${JSON.stringify(it)})`);
    if(!id||!fs.existsSync(path.join(__dirname,'../../assets/equipment-icons',id+'.png')))bad.push(it.n+' -> '+id);
  });
  assert.deepStrictEqual(bad,[],'unresolved icons: '+bad.slice(0,5).join(', '));
});

t('every new family has its own vector fallback and its own map glyph',()=>{
  NEW.forEach(k=>{
    assert.ok(ev(`!!ITEM_ICON_SVG['${k}']`),'no SVG fallback for '+k+', it would draw a sword');
    assert.ok(ev(`!!WICON['${k}']`),'no WICON glyph for '+k);
  });
});

t('a dropped Ascension spear is wearable, icons correctly and survives a save round-trip',()=>{
  ev("currentUser='v417';S=fresh();S.cls='Royal Guard';S.lv=150;S.mapClears[9]=true;S.mapClears[10]=true;S.auto=false;S.adv=false;S.mp=10;S.lvl=1;spawn();");
  ev('window.__saved=Math.random;Math.random=()=>0;');
  ev('kill(mobs.find(x=>!x.boss))');
  const picked=ev(`(()=>{const d=drops.find(x=>x.it&&x.it.wt==='spear');if(!d)return 'none';
    const it=d.it;drops.splice(drops.indexOf(d),1);S.inv.push(it);return it.name})()`);
  assert.notStrictEqual(picked,'none','a spear should have dropped on Astral Citadel');
  assert.equal(ev("canUse(S.inv.find(x=>x.wt==='spear'))"),true,'a Royal Guard must be able to wear it');
  assert.match(ev("itemIconUrl(gearItemIconId(S.inv.find(x=>x.wt==='spear')))"),/^assets\/equipment-icons\/\d+\.png$/);
  ev("(()=>{const w=S.inv.find(x=>x.wt==='spear');S.inv.splice(S.inv.indexOf(w),1);S.eq.weapon=w})()");
  ev("lsPut(saveKey(),JSON.stringify(S));S=load();");
  assert.equal(ev("S.eq.weapon&&S.eq.weapon.wt"),'spear','the spear must survive save and load');
  assert.equal(ev('canUse(S.eq.weapon)'),true,'and still be wearable after the round-trip');
  ev('Math.random=window.__saved;');
});

// haven-v417b (owner: "ok, option 2" - keep every expanded class armed without minting a Nightmare
// N+ of the new families). The kin rename used to turn a shipped section-5 Nightmare weapon into a
// new-family "N+" name. It now hands over the family's own N piece at section 4 on Nightmare maps,
// and keeps the N+ rename everywhere on Ascension, where those pieces really live.
t('the kin rename never mints a new-family N+ on a Nightmare map',()=>{
  const expanded=JSON.parse(ev('JSON.stringify([...EXPANDED_LINE])'));
  const offenders=[];
  let minted=0;
  for(const cls of expanded){
    const sex=/Dancer|Gypsy/.test(cls)?'f':'m';
    for(const m of [9,5,2,0]){
      const pool=JSON.parse(ev(`JSON.stringify(gearPool(${m},13).filter(x=>x.sec===5))`));
      for(const it of pool){
        const out=JSON.parse(ev(`JSON.stringify(kinDrop(${JSON.stringify(it)},${JSON.stringify(cls)},${JSON.stringify(sex)},${m}))`));
        if(!NEW.includes(out.k)||out.k===it.k)continue;
        minted++;
        if(out.sec!==4)offenders.push(`${cls}: ${it.n} -> ${out.n} (${out.k} sec ${out.sec})`);
      }
    }
  }
  assert.ok(minted>0,'the probe never exercised the kin rename, so it proves nothing');
  assert.deepStrictEqual(offenders,[],'Nightmare handed out a new-family N+: '+offenders.slice(0,4).join('; '));
});

t('on Ascension the kin rename still produces the real N+ pieces',()=>{
  const expanded=JSON.parse(ev('JSON.stringify([...EXPANDED_LINE])'));
  let nplus=0,demoted=[];
  for(const cls of expanded){
    const sex=/Dancer|Gypsy/.test(cls)?'f':'m';
    for(const m of [10,11])for(const it of JSON.parse(ev(`JSON.stringify(gearPool(${m},5).filter(x=>x.sec>=5))`))){
      const out=JSON.parse(ev(`JSON.stringify(kinDrop(${JSON.stringify(it)},${JSON.stringify(cls)},${JSON.stringify(sex)},${m}))`));
      if(!NEW.includes(out.k)||out.k===it.k)continue;
      nplus++;
      if(out.sec<5)demoted.push(cls+' -> '+out.n);
    }
  }
  assert.ok(nplus>0,'Ascension lost its N+ kin rename entirely');
  assert.deepStrictEqual(demoted,[],'Ascension N+ wrongly demoted to N: '+demoted.slice(0,4).join('; '));
});

t('every expanded class can still be armed from a Nightmare section-5 field',()=>{
  // option 2's whole point: blocking the N+ rename must not leave a class with no weapon at all.
  // Only maps 5-9 run a section-5 Nightmare band; the early maps' section-4 band never carried a
  // book, instrument or gun in the first place, so that is not something this rule can change.
  const expanded=JSON.parse(ev('JSON.stringify([...EXPANDED_LINE])'));
  const naked=[];
  for(const cls of expanded){
    const wt=JSON.parse(ev(`JSON.stringify(CLASSES[${JSON.stringify(cls)}].wt)`));
    for(const m of [5,6,7,8,9]){
      // what the class can actually end up holding: its own families plus whatever the kin rename
      // hands it, drawn from that field's real pool.
      const got=new Set();
      for(const it of JSON.parse(ev(`JSON.stringify(gearPool(${m},13))`))){
        if(wt.includes(it.k))got.add(it.k);
        const out=JSON.parse(ev(`JSON.stringify(kinDrop(${JSON.stringify(it)},${JSON.stringify(cls)},'m',${m}))`));
        if(out&&wt.includes(out.k))got.add(out.k);
      }
      if(!got.size)naked.push(cls+' @ map '+m);
    }
  }
  assert.deepStrictEqual(naked,[],'classes with no weapon they can use: '+naked.join('; '));
});

t('the N piece a Nightmare kin drop hands over belongs to the map being farmed',()=>{
  // Abyss should pay a Glast spear, not Prontera's Dread one - the naming has to match the field.
  const spear=JSON.parse(ev('JSON.stringify(nmNItem("spear",9))'));
  assert.match(spear,/^Glast /,'Abyss should name its own spear, got '+spear);
  assert.equal(JSON.parse(ev('JSON.stringify(nmNItem("spear",0))')),'Dread Gae Bolg','Prontera must keep its own row');
  // and the fallback still works for a map whose N row does not train that family
  assert.match(JSON.parse(ev('JSON.stringify(nmNItem("instrument",0))')),/Ballad$/,'the fallback must still find an instrument');
});

t('a real Abyss Nightmare kill cannot produce a new-family N+ for an expanded class',()=>{
  const bad=[];
  for(const cls of ['Royal Guard','Gunslinger','Sage','Monk','Ninja']){
    const r=JSON.parse(ev(`(()=>{const save=JSON.parse(JSON.stringify(S));S.cls=${JSON.stringify(cls)};S.sex='m';
      const f=fieldOf(9,13),out=[];
      for(const mm of f.mobs)for(let i=0;i<80;i++)for(const[T]of mm.drops){
        const d=kinDrop(T,S.cls,S.sex,mm.mapIndex==null?9:mm.mapIndex);out.push({k:d.k,n:d.n,sec:d.sec})}
      S.cls=save.cls;return JSON.stringify(out)})()`));
    const nf=r.filter(x=>NEW.includes(x.k));
    assert.ok(nf.length,'no new-family drop at all for '+cls+', the probe is not measuring anything');
    nf.filter(x=>x.sec!==4).forEach(x=>bad.push(cls+': '+x.n+' sec '+x.sec));
  }
  assert.deepStrictEqual(bad,[],'N+ escaped on Nightmare: '+bad.slice(0,4).join('; '));
});

console.log(require('node:path').basename(__filename)+': '+pass+' passed, '+fail+' failed');
game.close();
process.exit(fail?1:0);
