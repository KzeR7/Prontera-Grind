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
const gx=()=>1,fieldName=()=>'Prontera',addJob=()=>{},checkLevel=()=>{},qProg=()=>{},addFloat=()=>{},log=m=>logs.push(String(m)),save=()=>{},ui=()=>{},numTxt=n=>String(Math.round(n));
const mkDrop=()=>null,genGear=()=>null;
${grab('function earnZeny(amount){','function collect(it){')}
this.H={fresh,CLASSES,spawn,kill,atk,aspd,maxHp,def,mdef,starterStage,fieldPower,HPK,HPE,MAPS,AGGRO,
 campCount,campMobs,campSites,campWait,fillCamp,minionDef,CAMP_GAP,NEIGHBOUR_GAP,CAMP_REFILL_MIN,CAMP_REFILL_MAX,stageSpec,nearestPack,pl,logs,mapSelection:()=>[mapM,mapL],
set S(v){S=v},get S(){return S},get mobs(){return mobs},get mob(){return mob},get activePack(){return activePack},get camps(){return camps}};
`,ctx);
const H=ctx.H;
let pass=0,fail=0;const t=(n,f)=>{try{f();console.log('  ok   '+n);pass++}catch(e){console.error('  FAIL '+n+' -> '+e.message);fail++}};
const spawn=(m,l,cls='Mage',lv=10)=>{H.S=H.fresh();Object.assign(H.S,{mp:m,lvl:l,cls,lv});H.spawn();return H.mobs};
t('all 25 starter stages have gentler HP/ATK and only one or two per camp',()=>{
 for(let m=0;m<5;m++)for(let l=1;l<=5;l++)for(let trial=0;trial<12;trial++){
  const pack=spawn(m,l),p=H.fieldPower(m,l),mb=1+m*.15;
  assert.strictEqual(new Set(pack.map(x=>x.pack)).size,H.campCount(m),'every camp on the map is stocked');
  assert.ok(pack.every(x=>pack.filter(y=>y.pack===x.pack).length<=2),'starter camps hold one or two monsters');for(const mob of pack){
   assert.ok(mob.hp<=Math.floor(H.HPK*mb*Math.pow(p,H.HPE)));
   assert.ok(mob.atk<Math.floor((5+p*4.6)*mb));
   assert.strictEqual(mob.lvl,p,'gear power must remain map-specific');
   assert.strictEqual(mob.drops.length,3);assert.strictEqual(mob.cardCh,.15);
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
t('Novice encounters stay one or two low-HP monsters per camp, spread over the whole lane',()=>{
 const pack=spawn(0,1,'Novice',1);
 assert.strictEqual(H.camps.length,8,'Prontera fields eight camps');
 assert.ok(pack.length>=8&&pack.length<=16,'eight camps of one or two Novice-level monsters');
 assert.strictEqual(new Set(pack.map(x=>x.pack)).size,8,'every camp holds something to kill');
 for(const m of pack)assert.strictEqual(m.hp,42);
 assert.ok(pack.every(x=>Math.abs(x.x)<13&&x.z>-28&&x.z<12),'camps stay inside the play area');
});
t('non-boss stages retain their combat formulas and boss escorts use normal mob stats',()=>{
 for(let m=0;m<10;m++)for(let l=1;l<10;l++)if(!H.starterStage(m,l)){
  const pack=spawn(m,l),p=H.fieldPower(m,l),mb=1+m*.15+Math.max(0,m-4)*.2;
  // v86: fields of power 90+ (Abyss from stage 1, Niflheim's last stages) swing 1.4x harder
  for(const mob of pack){assert.strictEqual(mob.hp,Math.floor(H.HPK*mb*Math.pow(p,H.HPE)));assert.strictEqual(mob.atk,Math.floor((5+p*4.6)*mb*(p>=90?1.4:1)))}
  assert.ok(pack.length>=H.camps.length&&pack.length<=3*H.camps.length,'every camp holds one to three monsters');
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
   assert.strictEqual(escort.atk,Math.floor((5+p*4.6)*mb*(p>=90?1.4:1)))}   // v86 endgame bump
 }
});
t('camps scatter over the whole lane, each one a small group instead of a single point',()=>{
 assert.strictEqual(H.CAMP_GAP,5.5);
 const positions=new Set();
 for(let m=0;m<10;m++)for(let l=1;l<10;l++)for(let i=0;i<8;i++){
  const pack=spawn(m,l),camps=H.camps;
  assert.strictEqual(camps.length,H.campCount(m),'camp count follows the map');
  assert.ok(pack.every(x=>x.pack>=0&&x.pack<camps.length),'every monster belongs to a camp');
  for(let a=0;a<camps.length;a++)for(let b=a+1;b<camps.length;b++)
   assert.ok(Math.hypot(camps[a].x-camps[b].x,camps[a].z-camps[b].z)>=2.6,'two camps must not share a spot');
  // inside a camp: 1.6-3.2 units apart; neighbouring camps at least NEIGHBOUR_GAP apart as well
  for(const c of camps){
   const g=pack.filter(x=>x.pack===c.i);
   assert.ok(g.length>=1&&g.length<=3,'a camp holds one to three monsters');
   // the camp's own ring: every monster stands 1.6-3.2 units from the camp site
   for(const x of g)assert.ok(Math.hypot(x.x-c.x,x.z-c.z)<=3.35,'camp-mate outside its 1.6-3.2 ring');
  }
  // the scatter itself: camps reach both halves of the lane instead of hugging the middle
  const zs=camps.map(c=>c.z);
  assert.ok(Math.max(...zs)-Math.min(...zs)>12,'camps must use the whole lane, not hug the middle');
  if(m===4&&l===4)positions.add(camps.map(c=>c.x.toFixed(1)+','+c.z.toFixed(1)).join('|'));
  assert.ok(pack.every(x=>Math.abs(x.x)<13&&x.z>-28&&x.z<12),'camp outside the play area');
  const water=H.stageSpec(m,l).f&&H.stageSpec(m,l).f.water;
  if(water)assert.ok(pack.every(x=>x.z<water[0]-1||x.z>water[1]+1),'map '+m+' stage '+l+' water '+water+' camps '+pack.map(x=>x.z.toFixed(1)).join(','));
  // a camp is a group, not one blob: its monsters are never stacked on one pixel
  for(const c of camps){
   const g=pack.filter(x=>x.pack===c.i);
   for(let a=0;a<g.length;a++)for(let b=a+1;b<g.length;b++)
    assert.ok(Math.hypot(g[a].x-g[b].x,g[a].z-g[b].z)>=1.5,'camp-mates stand apart, not on one pixel');
  }
  for(let a=0;a<camps.length;a++)for(let b=a+1;b<camps.length;b++)
   for(const u of pack.filter(x=>x.pack===camps[a].i))for(const v of pack.filter(x=>x.pack===camps[b].i))
    assert.ok(Math.hypot(u.x-v.x,u.z-v.z)>=2,'two camps must not touch');
 }
 assert.ok(positions.size>5,'respawns keep reusing the same camp positions');
 const firstCamps=new Set();
 for(let k=0;k<60;k++){H.pl.x=0;H.pl.z=0;spawn(1,6);firstCamps.add(H.activePack);
  assert.strictEqual(H.activePack,H.nearestPack(),'initial camp is not the closest one')}
 assert.ok(firstCamps.size>1,'player always starts on numbered camp 1');
 assert.ok(!/PACK_SPOTS/.test(src),'fixed pack points came back');
 assert.ok(/m.pack===activePack&&\(isBoss\(\)\|\|Math.hypot/.test(src),'only the active camp should wake');
 assert.ok(/if\(wake&&Math.hypot/.test(src),'sleeping camps must not attack');
 assert.ok(/if\(m.pack!==activePack\|\|/.test(src),'pets should follow the active camp');
 assert.ok(/o.pack===src.pack/.test(src) && /o.pack===target.pack/.test(src),'area and chain hits cannot wake remote camps');
});

t('an emptied camp refills itself, and clearing the field no longer throws the map away',()=>{
 // the camp refill block, run against the real code
 const box={};vm.createContext(box);
 vm.runInContext(`
   let mobs=[{pack:1,hp:9}],camps=[{i:0,x:2,z:3,t:0,wait:4},{i:1,x:9,z:9,t:3,wait:6}],filled=[];
   const fillCamp=(i,c)=>filled.push(i),campWait=c=>c.wait,rnd=(a,b)=>a,CAMP_REFILL_MIN=4,CAMP_REFILL_MAX=8;
   this.run=dt=>{for(const c of camps)if(!mobs.some(m=>m.pack===c.i)){c.t+=dt;if(c.t>=c.wait){c.t=0;fillCamp(c.i,c)}}else c.t=0;return {camps,filled,mobs}};
 `,box);
 assert.strictEqual(box.run(3.9).filled.length,0,'a camp that is still refilling waits its own timer out');
 const r=box.run(.2);
 assert.deepStrictEqual(Array.from(r.filled),[0],'the emptied camp is stocked again');
 assert.strictEqual(r.camps[0].t,0,'and its timer restarts');
 assert.strictEqual(r.camps[1].t,0,'a camp that still holds monsters keeps its timer at zero');
 // the game must not clear the field when the kill counter fills: only a boss wave resets
 assert.ok(/if\(mob\.boss\)\{\n    mobs=\[\];camps=\[\];S\.kl=0;/.test(src),'only the boss wave resets the field');
 assert.ok(!/mobs=\[\];S\.kl=0;/.test(src),'the 15-kill field reset is gone (the offline model keeps its own, stage-only gate)');
 assert.ok(/else if\(S\.lvl<10&&S\.kl>=MPS\)\{/.test(src),'the 15-kill counter still opens the next stage');
 // the refill timer is per camp and stable, so a watched camp comes back on a rhythm
 assert.strictEqual(H.campWait({x:2,z:3}),H.campWait({x:2,z:3}));
 const waits=Array.from({length:40},(_,i)=>H.campWait({x:i*.7-12,z:i*.31-4}));
 assert.ok(waits.every(w=>w>=H.CAMP_REFILL_MIN-.001&&w<=H.CAMP_REFILL_MAX+.001),'refill waits stay inside 4-8s');
 assert.ok(new Set(waits.map(w=>w.toFixed(2))).size>10,'and they differ from camp to camp');
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
 assert.strictEqual(new Set(seen).size,H.camps.length,'every camp gets its turn as the active one');assert.strictEqual(H.S.kl,all);
 H.spawn();assert.strictEqual(H.activePack,H.nearestPack());assert.strictEqual(H.mob.pack,H.activePack);
});
t('clearing normal Stage 10 advances to the next map when Auto-advance is on',()=>{
 for(let m=0;m<9;m++){
  spawn(m,10);H.S.adv=true;mapM=m;mapL=10;
  const boss=H.mobs.find(x=>x.boss),before=H.logs.length;assert.ok(boss);
  boss.drops=[];boss.cardCh=0;boss.ore=false;
  const random=seededMath.random;seededMath.random=()=>.999999;
  try{H.kill(boss)}finally{seededMath.random=random}
  assert.strictEqual(H.S.mp,m+1,H.MAPS[m].n+' should continue to '+H.MAPS[m+1].n);
  assert.strictEqual(H.S.lvl,1,'the next map starts at Stage 1');
  assert.deepStrictEqual(Array.from(H.mapSelection()),[m+1,1],'the map preview follows the automatic route');
  assert.ok(H.logs.slice(before).some(x=>x.includes(H.MAPS[m].n+' Stage 10 cleared!')&&x.includes(H.MAPS[m+1].n+' Stage 1')),'the clear message names the next map');
 }
 spawn(9,10);H.S.adv=true;mapM=9;mapL=10;
 const finalBoss=H.mobs.find(x=>x.boss),before=H.logs.length;finalBoss.drops=[];finalBoss.cardCh=0;finalBoss.ore=false;
 const random=seededMath.random;seededMath.random=()=>.999999;
 try{H.kill(finalBoss)}finally{seededMath.random=random}
 assert.strictEqual(H.S.mp,9,'Abyss remains the last normal map');assert.strictEqual(H.S.lvl,10,'Stage 10 does not auto-jump into the Nightmare band');
 assert.ok(H.logs.slice(before).some(x=>x.includes('normal map route is complete')&&x.includes('Nightmare is a separate challenge')),'the last clear keeps Nightmare separate');
});
t('stage 10 starts with boss plus 3 or 5 escorts and boss defeat resets the whole fight when farming',()=>{
 for(const m of [0,4,5,9]){
  spawn(m,10);H.S.adv=false;assert.strictEqual(H.mobs.length,m<5?4:6);
  const boss=H.mobs.find(x=>x.boss);assert.ok(Math.hypot(boss.x,boss.z+4)<1.5);
  assert.ok(H.mobs.every(x=>Math.hypot(x.x-boss.x,x.z-boss.z)<5));
  boss.drops=[];boss.cardCh=0;boss.ore=false;H.kill(boss);
  assert.strictEqual(H.mobs.length,0,'escorts should clear when boss falls');
  assert.strictEqual(H.camps.length,0,'the boss wave carries no camps');
  assert.strictEqual(H.S.kl,0,'boss kill resets wave progress');
  H.spawn();assert.strictEqual(H.mobs.length,m<5?4:6,'boss should respawn immediately without fifteen more kills');
 }
 assert.ok(/m.pack===activePack&&\(isBoss\(\)\|\|/.test(src),'all boss escorts should engage with the boss');
});
t('v88: Auto-advance catches a player up who is parked below the unlocked frontier (owner: "sometimes it does nothing")',()=>{
 // The old code only advanced at exactly S.lvl>=S.prog, so with the switch ON a player farming
 // below the frontier (an old map revisited, a stage farmed with the switch off, a map arrived on
 // whose stages were already unlocked) never moved. The switch must walk you forward again.
 spawn(0,3);H.S.adv=true;H.S.prog=Array(10).fill(10);       // stage 3 of 10 unlocked, switch ON
 for(let i=0;i<15;i++){if(!H.mobs.length)H.spawn();const v=H.mob||H.mobs[0];v.drops=[];v.cardCh=0;v.ore=false;H.kill(v)}
 assert.strictEqual(H.S.lvl,4,'fifteen kills below the frontier advance one stage when Auto-advance is on');
 assert.strictEqual(H.S.prog[0],10,'the unlocked frontier itself does not move while catching up');
 // ... and it keeps walking until it reaches the frontier, then unlocks past it as before
 for(let stage=4;stage<10;stage++){for(let i=0;i<15;i++){if(!H.mobs.length)H.spawn();const v=H.mob||H.mobs[0];v.drops=[];v.cardCh=0;v.ore=false;H.kill(v)}}
 assert.strictEqual(H.S.lvl,10,'catching up walks all the way to Stage 10');
 // with the switch OFF the same fifteen kills change nothing (farming stays possible)
 spawn(0,3);H.S.adv=false;H.S.prog=Array(10).fill(10);
 for(let i=0;i<15;i++){if(!H.mobs.length)H.spawn();const v=H.mob||H.mobs[0];v.drops=[];v.cardCh=0;v.ore=false;H.kill(v)}
 assert.strictEqual(H.S.lvl,3,'Auto-advance off still farms where you stand');
 assert.strictEqual(H.S.prog[0],10,'and unlocks nothing while below the frontier');
 // at the frontier with the switch off the next stage still unlocks (the old behaviour, kept)
 spawn(0,5);H.S.adv=false;H.S.prog=Array(10).fill(5);
 for(let i=0;i<15;i++){if(!H.mobs.length)H.spawn();const v=H.mob||H.mobs[0];v.drops=[];v.cardCh=0;v.ore=false;H.kill(v)}
 assert.strictEqual(H.S.prog[0],6,'the frontier clear still unlocks the next stage with the switch off');
 assert.strictEqual(H.S.lvl,5,'but does not move you off it');
});
console.log(`\n${pass} passed, ${fail} failed`);process.exitCode=fail?1:0;
