// Audit the documented v227 five-target cap using the real game, entirely in memory.
// This currently fails: field pulses bypass the cap. Do not change balance without
// an owner decision; keep this separate from the existing gate until resolved.
const assert=require('node:assert/strict');
const {createGame}=require('./tests/helpers/game');
const {configure}=require('./skill_balance');
const g=createGame(),ev=g.ev;
try {
  configure(g,'High Wizard',2,'',123);
  ev(`S.cls='High Wizard';S.lv=150;S.sk=Object.fromEntries(SKILLS.filter(s=>s.cls.includes(S.cls)&&!s.ascensionOnly).map(s=>[s.id,s.max]));
    S.auto=false;S.adv=false;S.pets=[];TRIAL.on=false;JOB_RITE.on=false;resetSkillRuntime();activePack=0;
    pl.x=0;pl.z=1.5;Math.random=()=>.5;t=10;
    mobs=Array.from({length:8},(_,i)=>({n:'Test',x:i*.2,z:0,hp:1e15,max:1e15,pack:i<4?0:1,atk:0,at:1e9,size:1,spawn:1,fixed:true,boss:true}));
    mob=mobs[0];camps=[];window.hitIndices=[];const original=skillHit;
    skillHit=(o,n,s,p)=>{hitIndices.push(mobs.indexOf(o));return original(o,n,s,p)};
    window.normalTargets=skillTargets(SKILLS.find(s=>s.id==='fireball'),mob).length;
    castSkill(SKILLS.find(s=>s.id==='amp'),1);skillHit=original;`);
  const r=JSON.parse(ev(`JSON.stringify({cap:AOE_CAP,normal:normalTargets,field:new Set(hitIndices).size,crossCamp:hitIndices.filter(i=>mobs[i].pack===1).length})`));
  console.log(`Direct AoE: ${r.normal}/${r.cap}; Meteor opening pulse: ${r.field}/${r.cap} targets (${r.crossCamp} in another camp).`);
  assert.equal(r.cap,5,'documented cap');
  assert.equal(r.normal,r.cap,'direct attacks respect cap');
  assert.ok(r.crossCamp>0,'attacks reach another camp');
  assert.equal(r.field,r.cap,'ground field pulses should respect the documented five-target cap');
} finally { g.close(); }
