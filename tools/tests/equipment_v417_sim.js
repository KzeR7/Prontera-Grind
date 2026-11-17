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

t('every map spreads its expanded families across its own Nightmare rows',()=>{
  // the four starter maps carry only the line that levels there; the five late maps carry all seven
  for(let m=0;m<10;m++){
    const fams=ev(`Object.keys(GEAR[${m}][4].w).filter(k=>${JSON.stringify(NEW)}.includes(k))`);
    const late=m>=5;
    assert.strictEqual(fams.length,late?7:fams.length,'map '+m+(late?' must carry all seven':' carries a themed subset'));
    if(!late)assert.ok(fams.length>=1,'map '+m+' needs at least one expanded family');
    // N and N+ rows must carry the same families, differing only in the prefix
    const fams5=ev(`Object.keys(GEAR[${m}][5].w).filter(k=>${JSON.stringify(NEW)}.includes(k))`);
    assert.deepStrictEqual(fams,fams5,'map '+m+' N and N+ rows must match');
  }
});

t('the normal route is untouched - it still carries the shipped seven only',()=>{
  for(let m=0;m<10;m++)for(const sec of [0,1,2,3]){
    const fams=ev(`Object.keys(GEAR[${m}][${sec}].w)`);
    fams.forEach(k=>assert.ok(SHIPPED.includes(k),'map '+m+' section '+sec+' gained '+k+', which would change every class drop'));
  }
});

t('both Ascension maps drop a real shelf for all fourteen families',()=>{
  for(const m of [10,11]){
    for(const l of [1,4]){
      const pool=ev(`gearPool(${m},${l})`);
      assert.strictEqual(pool.length,20,'map '+m+' stage '+l+' shelf size');
      const fams=new Set(pool.filter(x=>!SLOTK.includes(x.k)).map(x=>x.k));
      assert.strictEqual(fams.size,14,'map '+m+' stage '+l+' must carry all 14 families, got '+fams.size);
      [...SHIPPED,...NEW].forEach(k=>assert.ok(fams.has(k),'map '+m+' missing '+k));
    }
  }
});

t('Astral is the Nightmare tier and Thor the Mythic tier',()=>{
  assert.strictEqual(ev('gearPool(10,1)[0].sec'),4,'Astral stages 1-3 are N');
  assert.strictEqual(ev('gearPool(10,4)[0].sec'),5,'Astral stages 4-5 are N+');
  assert.strictEqual(ev('gearPool(11,1)[0].sec'),6,'Thor is the Mythic tier');
  assert.strictEqual(ev('rarOf({sec:6,tier:4,mythic:true}).n'),'Mythic');
  assert.strictEqual(ev('SECN[6]'),'Mythic gear','the item card must have a name for section 6');
  // N and N+ are different items, never the same name twice
  assert.notStrictEqual(ev('gearPool(10,1)[0].n'),ev('gearPool(10,4)[0].n'),'N and N+ must be distinct');
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
    const want=l<=3?0.5:0.25;   // FIELD_GEAR_NM[0], halved on the N+ stages
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
      assert.strictEqual(ev(`fieldOf(${m},5).boss.drops.length`),20,'the MVP lists its whole shelf');
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

console.log(require('node:path').basename(__filename)+': '+pass+' passed, '+fail+' failed');
game.close();
process.exit(fail?1:0);
