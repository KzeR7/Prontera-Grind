// Starter farming: real roster, map/drop data, spawn code, and player formulas.
// No gear, pets, skills, crits, dodges, regeneration or level-up healing in the
// conservative damage-budget model. This is NOT a real-time movement playtest.
const fs=require('fs'),vm=require('vm'),assert=require('assert');
const src=fs.readFileSync(__dirname+'/../../index.html','utf8');
const grab=(a,b)=>{const i=src.indexOf(a),j=src.indexOf(b,i);assert.ok(i>=0&&j>i,a);return src.slice(i,j)};
let seed=22;const seededMath=Object.create(Math);seededMath.random=()=>((seed=(1664525*seed+1013904223)>>>0)/4294967296);
const ctx={console,Math:seededMath};vm.createContext(ctx);
vm.runInContext(`
${grab('const SU=k=>', ',K5=[')},K5=['str','agi','dex','luk','int'];
${grab('const CD=[','const saveKey=')}
${src.match(/const AFF=\[[^\]]*\],AB=\{[^}]*\};/)[0]}
const C=()=>CLASSES[S.cls],st=k=>S.st[k],eqv=()=>0,bon=()=>0,pv=()=>0,collDmg=()=>0;
${grab('const maxHp=()=>','const totalPts=')}
${grab('const KIT_MAP={','const KIT_TILE=')}
${grab('const STAGE_SCENES=[','function kitRect(d,gx0,gx1,gy){')}
${grab('let mobs=[],mob=null','function genGear(')}
const gx=()=>1,addJob=()=>{},checkLevel=()=>{},qProg=()=>{},addFloat=()=>{},log=()=>{},save=()=>{},ui=()=>{},numTxt=n=>String(Math.round(n));
const mkDrop=()=>null,genGear=()=>null;
${grab('function earnZeny(amount){','function collect(it){')}
this.H={fresh,CLASSES,spawn,kill,atk,aspd,maxHp,def,mdef,starterStage,fieldPower,HPK,HPE,MAPS,AGGRO,PACK_GAP,PACK_MAX,PACK_JITTER,packSites,stageSpec,nearestPack,pl,
set S(v){S=v},get S(){return S},get mobs(){return mobs},get mob(){return mob},get activePack(){return activePack}};
`,ctx);
const H=ctx.H;
let pass=0,fail=0;const t=(n,f)=>{try{f();console.log('  ok   '+n);pass++}catch(e){console.error('  FAIL '+n+' -> '+e.message);fail++}};
const spawn=(m,l,cls='Mage',lv=10)=>{H.S=H.fresh();Object.assign(H.S,{mp:m,lvl:l,cls,lv});H.spawn();return H.mobs};
t('all 25 starter stages have gentler HP/ATK and only one or two per encounter',()=>{
 for(let m=0;m<5;m++)for(let l=1;l<=5;l++)for(let trial=0;trial<12;trial++){
  const pack=spawn(m,l),p=H.fieldPower(m,l),mb=1+m*.15;
  assert.strictEqual(new Set(pack.map(x=>x.pack)).size,3);
  assert.ok(pack.every(x=>pack.filter(y=>y.pack===x.pack).length<=2));for(const mob of pack){
   assert.ok(mob.hp<=Math.floor(H.HPK*mb*Math.pow(p,H.HPE)));
   assert.ok(mob.atk<Math.floor((5+p*4.6)*mb));
   assert.strictEqual(mob.lvl,p,'gear power must remain map-specific');
   assert.strictEqual(mob.drops.length,3);assert.strictEqual(mob.cardCh,.45);
  }
 }
});
t('Prontera and the four class maps follow the requested Base Lv stage bands',()=>{
 assert.deepStrictEqual(Array.from({length:10},(_,i)=>H.fieldPower(0,i+1)),[1,2,3,4,5,6,7,8,9,10]);
 const band=[10,12,15,17,20,20,28,35,43,50];
 for(let m=1;m<=4;m++){
  assert.deepStrictEqual(Array.from({length:10},(_,i)=>H.fieldPower(m,i+1)),band,H.MAPS[m].n+' stage power');
  for(let l=1;l<=5;l++)assert.ok(H.fieldPower(m,l)>=10&&H.fieldPower(m,l)<=20);
  for(let l=6;l<=10;l++)assert.ok(H.fieldPower(m,l)>=20&&H.fieldPower(m,l)<=50);
  assert.strictEqual(H.MAPS[m].rec,'Lv 10-50');
 }
 assert.strictEqual(H.MAPS[0].rec,'Lv 1-10');
 assert.ok(H.MAPS[0].t.includes('easy Lv 1-10'));
 for(let m=1;m<=4;m++)assert.ok(H.MAPS[m].t.includes('stages 1-5 Lv 10-20; 6-10 Lv 20-50'));
 for(let m=5;m<10;m++)for(let l=1;l<=10;l++)assert.strictEqual(H.fieldPower(m,l),H.MAPS[m].b+l,'later-map curve changed');
});
t('class-map starter packs are survivable at target level with focused stats and no gear',()=>{
 let worst=0;
 for(const [cls,c] of Object.entries(H.CLASSES).filter(([,c])=>c.tier===1)){
  for(let m=1;m<5;m++)for(let stage=1;stage<=5;stage++)for(let trial=0;trial<12;trial++){
   const playerLv=H.fieldPower(m,stage),all=spawn(m,stage,cls,playerLv),main=H.CLASSES[cls].main,support=Math.max(1,Math.floor(playerLv/2));
   for(const k of new Set([main,'vit','agi','dex']))H.S.st[k]=k===main?playerLv:support;
   const pack=all.filter(x=>x.pack===0),hp=H.maxHp();
   // Worst incoming roll, no evasion; outgoing low roll with a 20% miss allowance.
   // Assume all enemies attack from the start, eliminating movement's respite.
   let incoming=0;
   for(let i=0;i<pack.length;i++){
    const seconds=Math.ceil(pack[i].hp/(H.atk()*.7*.8))*H.aspd();
    for(const mob of pack.slice(i))incoming+=(Math.ceil(seconds/1.5)+1)*Math.max(1,Math.round(mob.atk*1.2-(mob.mag?H.mdef():H.def())*.6));
   }
   worst=Math.max(worst,incoming/hp);
   assert.ok(incoming<hp,`${cls}, map ${m}, stage ${stage}: ${incoming}/${hp}`);
  }
 }
 console.log('       worst conservative pack budget: '+(worst*100).toFixed(1)+'% HP');
});
t('Novice encounters stay one low-HP monster at a time, in three separate packs',()=>{
 const pack=spawn(0,1,'Novice',1);assert.strictEqual(pack.length,3);
 for(const m of pack)assert.strictEqual(m.hp,42);
});
t('non-boss stages retain their combat formulas and boss escorts use normal mob stats',()=>{
 for(let m=0;m<10;m++)for(let l=1;l<10;l++)if(!H.starterStage(m,l)){
  const pack=spawn(m,l),p=H.fieldPower(m,l),mb=1+m*.15+Math.max(0,m-4)*.2;
  for(const mob of pack){assert.strictEqual(mob.hp,Math.floor(H.HPK*mb*Math.pow(p,H.HPE)));assert.strictEqual(mob.atk,Math.floor((5+p*4.6)*mb))}
  assert.ok(pack.length>=3&&pack.length<=9);
 }
 for(let m=0;m<10;m++){
  const wave=spawn(m,10);assert.strictEqual(wave.length,1+(m<5?3:5));
  assert.strictEqual(wave.filter(x=>x.boss).length,1,'one boss from the first spawn');
  assert.ok(wave.every(x=>x.pack===0),'boss and escorts should fight together');
  assert.ok(wave.slice(1).every(x=>!x.boss),'escorts must have normal drops');
  H.S.kl=15;H.spawn();assert.strictEqual(H.mobs.length,wave.length,'no separate 15-kill boss gate');
  const p=H.fieldPower(m,10),mb=1+m*.15+Math.max(0,m-4)*.2;
  assert.strictEqual(H.mobs[0].hp,Math.floor(500*mb*Math.pow(p,H.HPE)));
  for(const escort of wave.slice(1)){assert.strictEqual(escort.hp,Math.floor(H.HPK*mb*Math.pow(p,H.HPE)));
   assert.strictEqual(escort.atk,Math.floor((5+p*4.6)*mb))}
 }
});
t('medium-distance packs reroll on each spawn but stay separate and on dry ground',()=>{
 assert.strictEqual(H.PACK_GAP,13);assert.strictEqual(H.PACK_MAX,18.5);
 const positions=new Set();
 for(let m=0;m<10;m++)for(let l=1;l<10;l++)for(let i=0;i<8;i++){
  const pack=spawn(m,l),groups=[0,1,2].map(k=>pack.filter(x=>x.pack===k));
  assert.ok(groups.every(g=>g.length), 'all three packs must spawn');
  for(let a=0;a<3;a++)for(let b=a+1;b<3;b++)for(const u of groups[a])for(const v of groups[b])
   assert.ok(Math.hypot(u.x-v.x,u.z-v.z)>H.AGGRO+.5, 'packs too close to stay apart');
  for(let a=0;a<3;a++)for(let b=a+1;b<3;b++)
    assert.ok(Math.hypot(groups[a][0].x-groups[b][0].x,groups[a][0].z-groups[b][0].z)<H.PACK_MAX+2, 'packs too far apart');
  if(m===4&&l===4)positions.add(groups.map(g=>g[0].x.toFixed(1)+','+g[0].z.toFixed(1)).join('|'));
  assert.ok(pack.every(x=>Math.abs(x.x)<10.5&&x.z>-18&&x.z<10), 'pack outside the play area');
  const water=H.stageSpec(m,l).f&&H.stageSpec(m,l).f.water;
  if(water)assert.ok(pack.every(x=>x.z<water[0]-1||x.z>water[1]+1), 'map '+m+' stage '+l+' water '+water+' packs '+pack.map(x=>x.z.toFixed(1)).join(','));
 }
 assert.ok(positions.size>5,'respawns keep reusing the same pack positions');
 const firstPacks=new Set();
 for(let k=0;k<60;k++){H.pl.x=0;H.pl.z=0;spawn(1,6);firstPacks.add(H.activePack);
  assert.strictEqual(H.activePack,H.nearestPack(),'initial pack is not the closest one')}
 assert.ok(firstPacks.size>1,'player always starts on numbered pack 1');
 assert.ok(!/PACK_SPOTS/.test(src),'fixed pack points came back');
 assert.ok(/m.pack===activePack&&\(isBoss\(\)\|\|Math.hypot/.test(src), 'only the active pack should wake');
 assert.ok(/if\(wake&&Math.hypot/.test(src), 'sleeping packs must not attack');
 assert.ok(/if\(m.pack!==activePack\)continue/.test(src), 'pets should follow the active pack');
 assert.ok(/o.pack===src.pack/.test(src) && /o.pack===target.pack/.test(src), 'area and chain hits cannot wake remote packs');
});
t('clearing a pack selects the nearest surviving pack, regardless of its number',()=>{
 const group=spawn(0,4),all=group.length;assert.ok(all>=6);
 const seen=[];
 while(H.mobs.length){
  const current=H.activePack;
  if(!seen.includes(current))seen.push(current);
  assert.strictEqual(current,H.nearestPack(),'target is not nearest from player position');
  // Move player beside a waiting pack before the current pack dies: routing must
  // choose that pack instead of the next numbered one.
  const waiting=H.mobs.find(x=>x.pack!==current);
  if(waiting){H.pl.x=waiting.x;H.pl.z=waiting.z}
  while(H.mobs.some(x=>x.pack===current)){
   const victim=H.mob;assert.strictEqual(victim.pack,current);
   victim.drops=[];victim.cardCh=0;victim.ore=false;H.kill(victim);
  }
  if(H.mobs.length){assert.strictEqual(H.activePack,H.nearestPack());
    assert.strictEqual(H.mob.pack,H.activePack)}
 }
 assert.strictEqual(new Set(seen).size,3);assert.strictEqual(H.S.kl,all);
 H.spawn();assert.strictEqual(H.activePack,H.nearestPack());assert.strictEqual(H.mob.pack,H.activePack);
});
t('stage 10 starts with boss plus 3 or 5 escorts and boss defeat resets the whole fight',()=>{
 for(const m of [0,4,5,9]){
  spawn(m,10);assert.strictEqual(H.mobs.length,m<5?4:6);
  const boss=H.mobs.find(x=>x.boss);assert.ok(Math.hypot(boss.x,boss.z+4)<1.5);
  assert.ok(H.mobs.every(x=>Math.hypot(x.x-boss.x,x.z-boss.z)<5));
  boss.drops=[];boss.cardCh=0;boss.ore=false;H.kill(boss);
  assert.strictEqual(H.mobs.length,0,'escorts should clear when boss falls');
  assert.strictEqual(H.S.kl,0,'boss kill resets wave progress');
  H.spawn();assert.strictEqual(H.mobs.length,m<5?4:6,'boss should respawn immediately without fifteen more kills');
 }
 assert.ok(/m.pack===activePack&&\(isBoss\(\)\|\|/.test(src),'all boss escorts should engage with the boss');
});
console.log(`\n${pass} passed, ${fail} failed`);process.exitCode=fail?1:0;
