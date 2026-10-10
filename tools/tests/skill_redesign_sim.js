// Behavioral coverage for v97. Executes the real game, not duplicated combat formulas.
const assert=require('node:assert/strict');
const {createGame}=require('./helpers/game');
const {configure}=require('../skill_balance');
const g=createGame(),ev=g.ev;let passed=0,failed=0;
function setup(cls='Assassin Cross',weapon='katar'){
 configure(g,cls,2,weapon);
 ev(`TRIAL.on=false;S.adv=false;S.auto=false;S.dmg=0;S.pets=[];
   mobs=[{x:0,z:0,hx:0,hz:0,wx:0,wz:0,a:0,pack:0,hp:1e9,max:1e9,atk:5,size:1,at:.1,boss:true,spawn:1,wt:5}];
   mob=mobs[0];activePack=0;camps=[];pl.x=0;pl.z=1.5;pAtkT=0;S.hp=maxHp();
 `);
}
function test(name,fn){try{fn();passed++;console.log('  ok '+name);}catch(e){failed++;console.error('  FAIL '+name+' — '+e.stack);}}
test('exact five skills per class, one Novice skill, sword-only progression',()=>{
 assert.equal(ev('SKILLS.length'),91);
 assert.ok(ev(`Object.keys(CLASSES).every(c=>SKILLS.filter(s=>s.from===c).length===(c==='Novice'?1:5))`));
 assert.ok(ev(`['Swordman','Knight','Lord Knight'].every(c=>CLASSES[c].wt.join()==='sword')`));
});
test('all inherited Assassin attacks execute with both weapon paths and single-dagger fallback',()=>{
 for(const weapon of ['katar','dagger']){setup('Assassin Cross',weapon);
  for(const off of [true,false]){if(!off)ev('S.eq.off=null');
   assert.ok(ev(`SKILLS.filter(s=>s.cls.includes(S.cls)&&s.type==='act').every(s=>{const before=S.dmg;castSkill(s,1);return S.dmg>before})`));
  }
 }
});
test('multi-hit total scales every hit and honors reduced later-cast power',()=>{
 setup();const values=JSON.parse(ev(`JSON.stringify((()=>{S.sk={sonic:5};Math.random=()=>.5;
 const original=SKILLS.find(s=>s.id==='sonic');const result=[];
 for(const [hits,k] of [[1,1],[8,1],[8,.3]]){S.dmg=0;castSkill({...original,hits},k);result.push(S.dmg);}return result;})())`));
 assert.ok(Math.abs(values[0]-values[1])<=8);
 assert.ok(Math.abs(values[2]-values[1]*.3)<=8);
});
test('area damage stays in the engaged pack and respects shape/range',()=>{
 setup();assert.ok(ev(`(()=>{const target=mob;const near={...target,x:1,hp:1e6},sleep={...target,x:1,pack:1,hp:1e6},far={...target,x:20,hp:1e6};mobs.push(near,sleep,far);
 castSkill(SKILLS.find(s=>s.id==='mAss'),1);return near.hp<1e6&&sleep.hp===1e6&&far.hp===1e6;})()`));
});
test('dash closes distance and leaves the player in melee',()=>{
 setup();ev(`pl.z=4;skillDash(SKILLS.find(s=>s.id==='vsplash'),mob)`);
 assert.ok(ev('Math.hypot(pl.x-mob.x,pl.z-mob.z)<2.2'));
});
test('approach dash starts through the real update loop',()=>{
 setup();ev(`S.sk={vsplash:5};pl.z=4;mob.at=1e9;for(let i=0;i<20;i++)update(1/30)`);
 assert.ok(ev('S.dmg>0&&skillState().casts.vsplash>=0'));
});
test('dash hits in place in melee and the stationary trial',()=>{
 setup();ev(`var __beforeDash=[pl.x,pl.z];castSkill(SKILLS.find(s=>s.id==='vsplash'),1)`);
 assert.ok(ev('pl.x===__beforeDash[0]&&pl.z===__beforeDash[1]&&S.dmg>0'));
 setup();ev(`pl.z=4;TRIAL.on=true;castSkill(SKILLS.find(s=>s.id==='akatar'),1)`);
 assert.equal(ev('pl.z'),4);assert.ok(ev('S.dmg>0'));ev('TRIAL.on=false');
});
test('dash refuses sleeping packs and never grants invulnerability',()=>{
 setup();ev(`pl.z=4;mob.pack=1;skillDash(SKILLS.find(s=>s.id==='vsplash'),mob)`);
 assert.equal(ev('pl.z'),4);assert.equal(ev('skillBonus("guard")'),0);
});
test('boss root stops movement but leaves its attack timer running',()=>{
 setup('Sniper','bow');ev(`S.sk={pharrow:5};Math.random=()=>.99;skillRoot(mob,2);var __rootHp=S.hp,__rootX=mob.x,__rootZ=mob.z;update(.2)`);
 assert.ok(ev('mob.root>0&&mob.x===__rootX&&mob.z===__rootZ&&S.hp<__rootHp'));
});
test('boss root cannot refresh or chain during recovery',()=>{
 setup('Sniper','bow');assert.equal(ev('skillRoot(mob,2)'),true);
 assert.equal(ev('skillRoot(mob,2)'),false);ev('tickCombatSkills(1.3)');
 assert.ok(ev('mob.root===0&&mob.rootResist===3'));assert.equal(ev('skillRoot(mob,2)'),false);
 ev('tickCombatSkills(3.1)');assert.equal(ev('skillRoot(mob,2)'),true);
});
test('a resisted snare still deals direct damage',()=>{
 setup('Sniper','bow');ev(`mob.rootResist=3;castSkill(SKILLS.find(s=>s.id==='pharrow'),1)`);
 assert.ok(ev('S.dmg>0&&!mob.root'));
});
test('buffs coexist, upgrade in place and do not drain HP',()=>{
 setup('Whitesmith','axe');const hp=ev('S.hp');ev('tickCombatSkills(.01)');
 assert.ok(ev('!!skillState().buffs.adren&&!!skillState().buffs.thrust&&!skillState().buffs.ovthrust'));
 assert.equal(ev('S.hp'),hp);
 ev('S.skOff.thrust=1;tickCombatSkills(.01)');assert.ok(ev('!skillState().buffs.thrust&&!!skillState().buffs.ovthrust'));
});
test('turning a buff off removes its bonus without disabling other buffs',()=>{
 setup('High Priest','mace');ev('tickCombatSkills(.01);S.skOff.bless=1;tickCombatSkills(.01)');
 assert.ok(ev('!skillState().buffs.bless&&!!skillState().buffs.gloria'));
});
test('all holy tiers have frequent solo damage at full HP against ordinary enemies',()=>{
 for(const cls of ['Acolyte','Priest','High Priest']){setup(cls,'mace');ev('mob.boss=false');
  assert.ok(ev(`SKILLS.filter(s=>s.from===S.cls&&s.type==='act').length>=3`));
  assert.ok(ev(`SKILLS.filter(s=>s.from===S.cls&&s.type==='act').every(s=>{const before=S.dmg;castSkill(s,1);return S.dmg>before})`));
 }
});
test('Searing Light heals only missing health while always attacking',()=>{
 setup('Acolyte','mace');ev(`S.hp=maxHp()/3;var __healBefore=S.hp;castSkill(SKILLS.find(s=>s.id==='heal'),1)`);
 assert.ok(ev('S.hp>__healBefore&&S.dmg>0&&S.hp<=maxHp()'));
});
test('deathmark expires once and does not recursively trigger itself',()=>{
 setup();ev(`castSkill(SKILLS.find(s=>s.id==='sdestroy'),1);var __markedDamage=S.dmg;tickCombatSkills(1.6)`);
 assert.ok(ev('S.dmg>__markedDamage&&!mob.deathmark'));const damage=ev('S.dmg');ev('tickCombatSkills(2)');assert.equal(ev('S.dmg'),damage);
});
test('queued damage cannot spill into another pack or survive a class change',()=>{
 setup('High Priest','mace');ev(`castSkill(SKILLS.find(s=>s.id==='basilica'),1);var __queuedDamage=S.dmg;activePack=1;tickCombatSkills(1)`);
 assert.equal(ev('S.dmg'),ev('__queuedDamage'));
 setup('High Priest','mace');ev(`castSkill(SKILLS.find(s=>s.id==='basilica'),1);var __swapDamage=S.dmg;S.cls='Novice';tickCombatSkills(1)`);
 assert.equal(ev('S.dmg'),ev('__swapDamage'));
});
test('Holy Echo cannot consume Penance or trigger itself',()=>{
 setup('High Priest','mace');ev(`S.sk={holy:10,meditatio:10};var __holy=SKILLS.find(s=>s.id==='holy');mob.skillMark={owner:S.cls,power:.2,hits:3,left:3,holy:true};
 skillHit(mob,100,__holy,true)`);
 assert.equal(ev('mob.skillMark.hits'),3);assert.equal(ev('skillState().echo'),0);
});
test('auto-allocation learns attacks and spreads first ranks before maxing',()=>{
 setup('Swordman','sword');ev(`S.sk={aid:1};S.jobs={Novice:{jl:1},Swordman:{jl:6}};autoAllocateSkills()`);
 assert.ok(ev(`SKILLS.filter(s=>s.from==='Swordman').every(s=>S.sk[s.id]===1)`));
});
test('migration preserves equipment/jobs/stats and refunds once across every played class',()=>{
 setup();assert.ok(ev(`(()=>{const f=JSON.parse(JSON.stringify(S));delete f.skillVersion;f.base.Knight={lv:50,st:{str:40}};
 const before=JSON.stringify([f.eq,f.jobs,f.st]);migrateSkillBuild(f,undefined);
 const once=JSON.stringify(f);migrateSkillBuild(f,f.skillVersion);
 return before===JSON.stringify([f.eq,f.jobs,f.st])&&once===JSON.stringify(f)&&f.skillRespec.Knight&&f.skillRespec['Assassin Cross']&&f.skillRefund>0&&Object.keys(f.sk).join()==='aid';})()`));
});
test('real save/load persists migration without minting points on a second load',()=>{
 setup();ev(`var __legacy=JSON.parse(JSON.stringify(S));delete __legacy.skillVersion;localStorage.setItem(saveKey(),JSON.stringify(__legacy));S=load();var __once=JSON.stringify(S);localStorage.setItem(saveKey(),__once);S=load()`);
 assert.ok(ev('S.skillVersion===SKILL_VERSION&&Object.keys(S.sk).join()==="aid"'));
 assert.equal(ev('JSON.stringify(S)'),ev('__once'));
});
test('a migrated class gets exactly one free stat reset',()=>{
 setup();ev(`S.skillRespec={'Assassin Cross':true,Knight:true};S.zeny=0;ACT.rstat()`);
 assert.ok(ev('!S.skillRespec["Assassin Cross"]&&S.skillRespec.Knight&&S.zeny===0'));
 assert.ok(ev('statResetCost()>0'));
});
test('every attack rank increases total primary and secondary damage independently',()=>{
 for(const cls of JSON.parse(ev('JSON.stringify(Object.keys(CLASSES))'))){setup(cls);
  assert.ok(ev(`SKILLS.filter(s=>s.type==='act'&&s.cls.includes(S.cls)).every(s=>{
    for(const area of [false,true]){let last=0;for(let rank=1;rank<=s.max;rank++){
      const power=s.mul(rank)*skillTuning(area,s,rank);if(!(power>last))return false;last=power;
    }}return true;
  })`),cls);
 }
});
test('unrelated upgrades cannot reduce learned attack coefficients or companion power',()=>{
 for(const cls of ['High Priest','High Wizard','Whitesmith','Assassin Cross']){setup(cls);
  assert.ok(ev(`(()=>{const attacks=SKILLS.filter(s=>s.type==='act'&&s.cls.includes(S.cls));
    S.sk=Object.fromEntries(SKILLS.filter(s=>s.cls.includes(S.cls)).map(s=>[s.id,1]));
    const before=attacks.map(s=>skillTuning(false,s,1)),companion=skillTuning('companion');
    for(const s of SKILLS.filter(s=>s.cls.includes(S.cls)))S.sk[s.id]=s.max;
    return attacks.every((s,i)=>skillTuning(false,s,1)===before[i])&&skillTuning('companion')===companion;
  })()`),cls);
 }
});
test('walking does not shorten the Novice attack timer',()=>{
 setup('Novice','dagger');ev('pl.z=12;pAtkT=.7;mob.at=1e9;update(.1)');
 assert.equal(ev('pAtkT'),.7);
});
g.close();console.log(`\nskill redesign: ${passed} passed, ${failed} failed`);process.exitCode=failed?1:0;
