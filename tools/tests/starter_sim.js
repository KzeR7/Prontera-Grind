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
${grab('let mobs=[],mob=null','function genGear(')}
this.H={fresh,CLASSES,spawn,atk,aspd,maxHp,def,mdef,starterStage,HPK,HPE,MAPS,
set S(v){S=v},get S(){return S},get mobs(){return mobs}};
`,ctx);
const H=ctx.H;
let pass=0,fail=0;const t=(n,f)=>{try{f();console.log('  ok   '+n);pass++}catch(e){console.error('  FAIL '+n+' -> '+e.message);fail++}};
const spawn=(m,l,cls='Mage',lv=10)=>{H.S=H.fresh();Object.assign(H.S,{mp:m,lvl:l,cls,lv});H.spawn();return H.mobs};
t('all 25 starter stages have gentler HP/ATK and at most three enemies',()=>{
 for(let m=0;m<5;m++)for(let l=1;l<=5;l++)for(let trial=0;trial<12;trial++){
  const pack=spawn(m,l),p=H.MAPS[m].b+l,mb=1+m*.15;
  assert.ok(pack.length<=3);for(const mob of pack){
   assert.ok(mob.hp<=Math.floor(H.HPK*mb*Math.pow(p,H.HPE)));
   assert.ok(mob.atk<Math.floor((5+p*4.6)*mb));
   assert.strictEqual(mob.lvl,p,'gear power must remain map-specific');
   assert.strictEqual(mob.drops.length,3);assert.strictEqual(mob.cardCh,.45);
  }
 }
});
t('each first job survives starter packs bare-handed at Base 10/20/30/40/50',()=>{
 let worst=0;
 for(const [cls,c] of Object.entries(H.CLASSES).filter(([,c])=>c.tier===1)){
  for(let m=0;m<5;m++)for(let stage=1;stage<=5;stage++)for(let trial=0;trial<12;trial++){
   const pack=spawn(m,stage,cls,stage*10),hp=H.maxHp();
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
t('Novice spawn stays one low-HP monster, not a first-job pack',()=>{
 const pack=spawn(0,1,'Novice',1);assert.strictEqual(pack.length,1);assert.strictEqual(pack[0].hp,42);
});
t('stages 6–10 and later maps retain their previous combat formulas',()=>{
 for(let m=0;m<10;m++)for(let l=1;l<=10;l++)if(!H.starterStage(m,l)){
  const pack=spawn(m,l),p=H.MAPS[m].b+l,mb=1+m*.15+Math.max(0,m-4)*.2;
  for(const mob of pack){assert.strictEqual(mob.hp,Math.floor(H.HPK*mb*Math.pow(p,H.HPE)));assert.strictEqual(mob.atk,Math.floor((5+p*4.6)*mb))}
  assert.ok(pack.length>=3&&pack.length<=8);
 }
 for(let m=0;m<10;m++){
  spawn(m,10);H.S.kl=15;H.spawn();assert.strictEqual(H.mobs.length,1);assert.ok(H.mobs[0].boss);
  const p=H.MAPS[m].b+10,mb=1+m*.15+Math.max(0,m-4)*.2;
  assert.strictEqual(H.mobs[0].hp,Math.floor(500*mb*Math.pow(p,H.HPE)));
 }
});
console.log(`\n${pass} passed, ${fail} failed`);process.exitCode=fail?1:0;
