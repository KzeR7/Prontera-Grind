// Owner decision 2026-10-28: field pulses remain uncapped; direct AoE stays capped.
// Exercise actual combat on synthetic data, including multiple camps and live movement.
const assert=require('node:assert/strict');
const {createGame}=require('./helpers/game');
const {configure}=require('../skill_balance');
const g=createGame(),ev=g.ev;
try {
  configure(g,'High Wizard',2,'',123);
  ev(`S.cls='High Wizard';S.lv=150;S.sk={amp:10};S.skOff={};
    S.auto=false;S.adv=false;S.pets=[];TRIAL.on=false;JOB_RITE.on=false;resetSkillRuntime();activePack=0;
    pl.x=0;pl.z=1.5;Math.random=()=>.5;t=10;
    mobs=Array.from({length:9},(_,i)=>({n:'Test',x:i===8?20:i*.2,z:0,hp:1e15,max:1e15,pack:i<4?0:1,atk:0,at:1e9,size:1,spawn:1,fixed:true,boss:true}));
    mob=mobs[0];camps=[];window.hitIndices=[];window.originalFieldHit=skillHit;
    skillHit=(o,n,s,p)=>{hitIndices.push(mobs.indexOf(o));return originalFieldHit(o,n,s,p)};
    window.normalTargets=skillTargets(SKILLS.find(s=>s.id==='fireball'),mob).length;
    castSkill(SKILLS.find(s=>s.id==='amp'),1);`);
  const initial=JSON.parse(ev(`JSON.stringify({cap:AOE_CAP,normal:normalTargets,hits:hitIndices,
    damage:mobs.map(o=>o.hp<1e15),fields:skillState().fields.length})`));
  assert.equal(initial.cap,5,'direct attack cap remains five');
  assert.equal(initial.normal,initial.cap,'direct attacks respect the cap');
  assert.deepEqual(initial.hits,[0,1,2,3,4,5,6,7], 'ground opening hits every living target in range across camps');
  assert.deepEqual(initial.damage,[true,true,true,true,true,true,true,true,false], 'actual damage lands only inside the radius');
  assert.equal(initial.fields,1);
  // Movement/death is rechecked each pulse, and switching camps must not cancel a field.
  ev(`mobs[7].x=20;mobs[6].hp=0;activePack=1;hitIndices=[];tickCombatSkills(1);`);
  const next=JSON.parse(ev(`JSON.stringify({hits:hitIndices,fields:skillState().fields.length})`));
  assert.deepEqual(next.hits,[0,1,2,3,4,5],'later pulse ignores dead or departed targets but still hits more than five');
  assert.equal(next.fields,1,'switching active camps does not cancel the field');
  ev(`mobs[0].hp=0;mob=mobs[1];mobs[7].x=1.4;hitIndices=[];tickCombatSkills(1);skillHit=originalFieldHit;`);
  const third=JSON.parse(ev(`JSON.stringify({hits:hitIndices,fields:skillState().fields.length})`));
  assert.deepEqual(third.hits,[1,2,3,4,5,7],'a field survives its original target and hits enemies that re-enter');
  assert.equal(third.fields,1);
  console.log('PASS: direct AoE cap, uncapped cross-camp ground pulses, radius, movement, death and active-camp changes');
} finally { g.close(); }
