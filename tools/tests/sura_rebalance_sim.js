// Sura's approved MVP rotation, Sura-only cooldown, sphere interactions and saved combos.
const assert=require('node:assert/strict'),{createGame}=require('./helpers/game'),{fourthSetup}=require('./helpers/endgame'),{stationary}=require('../skill_balance');
const g=createGame(),ev=g.ev,J=s=>JSON.parse(ev(`JSON.stringify((()=>{${s}})())`));
try{
 fourthSetup(g,'Sura','knuckle');
 let r=J(`const sk=id=>SKILLS.find(s=>s.id===id),a=ascState();a.skills.Sura.level=1;a.skills.Sura.ranks.su_knuckle=1;return {combo:suggestedCombo(),knuckle:ascCooldown(sk('su_knuckle')),asura:ascCooldown(sk('ch_asura')),area:SKILL_TUNING.Sura.area,upgrade:ascSkillValue('su_knuckle','boss')}`);
 assert.deepEqual(r.combo,['su_sky','su_tiger','su_rampage','su_gate','su_knuckle','ch_asura']);assert.equal(r.knuckle,5);assert.equal(r.asura,5);assert.deepEqual(r.area,[.5,.5,.5]);assert.ok(Math.abs(r.upgrade-.8)<1e-9);
 ev(`S.skillCombos.Sura={enabled:true,slots:['mo_triple','ch_asura',null,null,null,null]};ascState().skills.Sura.ranks.su_knuckle=5`);
 assert.deepEqual(J(`return comboConfig().slots`),['mo_triple','ch_asura',null,null,null,null]);assert.equal(ev(`ascSkillValue('su_knuckle','boss')`),20);
 for(const cls of ['Monk','Champion']){ev(`S.cls=${JSON.stringify(cls)}`);assert.equal(ev(`ascCooldown(SKILLS.find(s=>s.id==='ch_asura'))`),6,cls+' unchanged');}
 fourthSetup(g,'Sura','knuckle');
 r=J(`Math.random=()=>.5;t=0;const sk=id=>SKILLS.find(s=>s.id===id),m={x:pl.x+1,z:pl.z,hp:1e15,max:1e15,atk:0,size:1,pack:0,dots:[]};mobs=[m];mob=m;activePack=0;resetSkillRuntime();
 const hit=id=>{let h=m.hp;castSkill(sk(id),1);return h-m.hp};const base=hit('su_rampage');for(let i=0;i<5;i++)hit('su_sky');const n=skillState().stacks.sphere.n,boost=hit('su_rampage'),after=skillState().stacks.sphere.n;t=21;const expired=hit('su_rampage');hit('su_sky');const asura=hit('ch_asura');return {base,boost,n,after,expired,asura,left:skillState().stacks.sphere?.n||0}`);
 assert.equal(r.n,5);assert.equal(r.after,5,'rampage must not consume spheres');assert.ok(Math.abs(r.boost/r.base-1.25)<.01);assert.equal(r.expired,r.base);assert.ok(r.asura>0);assert.equal(r.left,0);
 r=J(`Math.random=()=>.5;const sk=id=>SKILLS.find(s=>s.id===id),m={x:pl.x+1,z:pl.z,hp:1e15,max:1e15,atk:0,size:1,pack:0,dots:[]};mobs=[m];mob=m;activePack=0;resetSkillRuntime();
 const hit=(id,hp,boss=false)=>{m.boss=boss;m.hp=hp;const before=m.hp;castSkill(sk(id),1);return before-m.hp};const full=hit('su_gate',1e15),wounded=hit('su_gate',2e14);const q=ascState().skills.Sura;q.level=30;q.ranks.su_knuckle=5;const boss=hit('su_knuckle',1e15,true);ASC_UPGRADES.su_knuckle.boss=0;const regular=hit('su_knuckle',1e15,true);ASC_UPGRADES.su_knuckle.boss=20;return {full,wounded,regular,boss}`);
 assert.ok(Math.abs(r.wounded/r.full-1.3)<.01,'Gates execute hits wounded targets 30% harder');assert.ok(Math.abs(r.boss/r.regular-1.2)<.01,'max Knuckle rank improves actual boss damage');
 assert.match(ev(`SKILLS.find(s=>s.id==='ch_asura').d(10)`),/5s cooldown/,'Sura cooldown displayed in skill details');
 // The slot's visible label and hover tooltip must both reflect the actual class-specific cooldown.
 ev(`S.skillCombos.Sura={enabled:true,slots:['ch_asura',null,null,null,null,null]}`);
 let slot=ev(`(()=>{const el=document.createElement('div');el.innerHTML=rotationBar();const slot=el.querySelector('[data-combo-index="0"]');return JSON.stringify({text:slot.querySelector('small').textContent,title:slot.title})})()`);slot=JSON.parse(slot);
 assert.match(slot.text,/5s cooldown/);assert.match(slot.title,/5s cooldown/);
 ev(`S.cls='Champion';S.skillCombos.Champion={enabled:true,slots:['ch_asura',null,null,null,null,null]}`);
 slot=JSON.parse(ev(`(()=>{const el=document.createElement('div');el.innerHTML=rotationBar();const slot=el.querySelector('[data-combo-index="0"]');return JSON.stringify({text:slot.querySelector('small').textContent,title:slot.title})})()`));
 assert.match(slot.text,/6s cooldown/);assert.match(slot.title,/6s cooldown/);

 // Test rotation through the real update loop, including its normal cooldown skips.
 fourthSetup(g,'Sura','knuckle');ev(`{let seed=123;Math.random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296};const q=ascState().skills.Sura;q.level=30;q.ranks=Object.fromEntries(ASC_SKILLS.filter(s=>s.from==='Sura').map(s=>[s.id,5]));S.skillCombos.Sura={enabled:true,slots:suggestedCombo()};window.__casts={};const prev=castSkill;castSkill=(sk,k)=>{window.__casts[sk.id]=(window.__casts[sk.id]||0)+1;prev(sk,k)}}`);
 stationary(g,1,120);r=J('return window.__casts');for(const id of ['su_sky','su_tiger','su_rampage','su_gate','su_knuckle','ch_asura'])assert.ok(r[id]>=20,id+' cast each rotation: '+JSON.stringify(r));assert.ok(Math.abs(r.su_knuckle-r.ch_asura)<=1,JSON.stringify(r));
 console.log('Sura rebalance: stack gain/consumption, rank scaling, saved combos, class isolation and real-loop rotation passed');
}finally{g.close()}
