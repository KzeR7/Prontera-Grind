// Expanded roster, haven-v412: signature skills, suggested combos and autocast, in the live game.
//   - Auto-fill builds each class's own combo and ends on its signature skill (never Holy Light).
//   - Asura Strike needs Spirit Spheres and dwarfs every other Monk skill, more so on a boss.
//   - Auto Spell, Spell Fist, Double Casting, Plagiarism and Chain Action fire bonus casts.
const assert=require('node:assert/strict'),{createGame}=require('./helpers/game');
const g=createGame(),ev=g.ev;let passed=0;const ok=n=>{passed++;console.log('  ok   '+n)};
console.log('expanded roster: signature skills, combos and autocast');
ev(`{window.__setup=cls=>{S=fresh();S.cls=cls;S.lv=150;for(const n of lineOf(cls))S.jobs[n]={jl:CLASSES[n].mj,jx:0};for(const s of SKILLS.filter(s=>s.cls.includes(cls)))S.sk[s.id]=s.max;
   S.eq.weapon={id:1,slot:'weapon',wt:C().wt[0],val:300,r:0,sec:0,tier:2,name:'x',aff:[],cards:[],slots:0};resetSkillRuntime();S.hp=maxHp();
   mobs.length=0;const m={x:pl.x+1,z:pl.z,hp:1e15,max:1e15,atk:1,def:0,size:1,pack:activePack,dots:[]};mobs.push(m);mob=m;return m};
  window.__sk=id=>SKILLS.find(s=>s.id===id);window.__hit=(m,id)=>{const b=m.hp;castSkill(__sk(id),1);return b-m.hp};}`);
const J=code=>JSON.parse(ev(`JSON.stringify((()=>{${code}})())`));

const combos=J(`const o={};for(const c of Object.keys(COMBO_PLAN)){__setup(c);o[c]=suggestedCombo().map(id=>{const s=__sk(id);return [id,s.from,!!s.core,s.type]})}return o`);
assert.equal(Object.keys(combos).length,22);
for(const [cls,c] of Object.entries(combos)){assert.ok(c.length>=4&&c.length<=6,cls+' '+c.length);assert.ok(c.every(s=>s[3]==='act'),cls);
  assert.ok(c[c.length-1][2],cls+' should finish on its signature skill, got '+c[c.length-1][0]);assert.equal(new Set(c.map(s=>s[0])).size,c.length,cls)}
for(const cls of ['Champion','Sura']){const ids=combos[cls].map(s=>s[0]);assert.equal(ids[ids.length-1],'ch_asura',cls);
  for(const bad of ['holy','heal','signum','judex','adoramus'])assert.ok(!ids.includes(bad),cls+' must not auto-fill '+bad);
  assert.ok(combos[cls].every(s=>['Monk','Champion','Sura'].includes(s[1])),cls+' uses Monk-line skills only')}
for(const cls of ['Royal Guard','Sorcerer','Geneticist','Shadow Chaser','Maestro & Wanderer','Kagerou & Oboro','Rebellion','Biochemist','Scholar'])
  assert.ok(combos[cls].every(s=>s[1]!==undefined&&!['Swordman','Mage','Merchant','Thief','Archer','Acolyte'].includes(s[1])),cls+' combo is its own line');
ok('Auto-fill builds 22 class combos that end on the signature skill; Champion and Sura end on Asura Strike');

const asura=J(`Math.random=()=>.5;const m=__setup('Sura'),none=__hit(m,'ch_asura'),ready0=skillStackReady(__sk('ch_asura'));const triple=__hit(m,'mo_triple'),one=__hit(m,'ch_asura');
  for(let i=0;i<6;i++)__hit(m,'mo_triple');const full=__hit(m,'ch_asura'),left=skillState().stacks.sphere?skillState().stacks.sphere.n:0;
  m.boss=true;for(let i=0;i<6;i++)__hit(m,'mo_triple');const boss=__hit(m,'ch_asura');m.boss=false;
  const others=SKILLS.filter(s=>s.type==='act'&&['Monk','Champion','Sura'].includes(s.from)&&s.id!=='ch_asura').map(s=>{resetSkillRuntime();return [s.id,__hit(m,s.id)]});
  return {none,ready0,triple,one,full,left,boss,others}`);
assert.equal(asura.none,0,'Asura Strike needs a sphere');assert.equal(asura.ready0,false);
assert.ok(asura.full>asura.one*2.2,'five spheres must far exceed one');assert.equal(asura.left,0,'it spends every sphere');
const best=Math.max(...asura.others.map(o=>o[1]));assert.ok(asura.full>best*5,'Asura Strike must dwarf every other Monk-line skill: '+(asura.full/best).toFixed(1)+'x');
assert.ok(asura.boss/asura.full>1.25&&asura.boss/asura.full<1.8,'+50% against bosses');
ok('Asura Strike: no spheres no strike; at five spheres '+(asura.full/best).toFixed(1)+'x the next best skill, '+(asura.full/asura.triple).toFixed(0)+'x Triple Attack, +50% on bosses');

const fill=J(`__setup('Sura');tickCombatSkills(.016);const r=skillState();return {n:r.stacks.sphere?r.stacks.sphere.n:0,ready:skillStackReady(__sk('ch_asura'))}`);
assert.equal(fill.n,5,'Call Spirits / Rising Dragon fill the spheres');assert.equal(fill.ready,true);
const shock=J(`const m=__setup('Champion'),o={x:m.x+1,z:m.z,hp:1e15,max:1e15,atk:1,def:0,size:1,pack:activePack,dots:[]};mobs.push(o);for(let i=0;i<5;i++)__hit(m,'mo_triple');const a=m.hp,b=o.hp;castSkill(__sk('ch_asura'),1);return [a-m.hp,b-o.hp]`);
assert.ok(shock[1]>shock[0]*.2&&shock[1]<shock[0]*.6,'the shockwave deals a share to a neighbour');
ok('the sphere buffs fill all five spheres, and the shockwave reaches the enemy beside the target');

const auto=J(`const rnd=Math.random,out={};const run=(cls,buff,on,cast)=>{const m=__setup(cls);if(buff)skillState().buffs[buff]={key:'x',value:0,left:9};Math.random=()=>.2;const b=m.hp;autocastProc(on,cast&&__sk(cast));Math.random=()=>.999;const hit=b-m.hp;const b2=m.hp;autocastProc(on,cast&&__sk(cast));Math.random=rnd;return [hit>0,b2-m.hp]};
  out.sage=run('Sage','sa_hind','attack');out.sageCast=run('Sage','sa_hind','cast','sa_earth');out.sageOff=run('Sage',null,'attack');
  out.fist=run('Sorcerer','so_strike','attack');out.double=run('Scholar','sc_double','cast','sc_mind');out.doubleAttack=run('Scholar','sc_double','attack');
  out.plag=run('Stalker','st_plag','cast','ro_back');out.chain=run('Gunslinger',null,'attack');out.shadow=run('Kagerou & Oboro','ko_shadow','cast','ko_cross');
  out.auto=run('Shadow Chaser','sc_auto','attack');out.martyr=run('Paladin','pa_sac','attack');
  const m=__setup('Monk');const b=m.hp;Math.random=()=>.01;autocastProc('attack');Math.random=rnd;out.monk=b-m.hp;
  __setup('Sage');out.kids=__sk('sa_hind').autocast.casts.map(c=>c.n);
  const s=__setup('Sura');for(let i=0;i<5;i++)__hit(s,'mo_triple');skillState().buffs.st_plag={key:'x',value:0,left:9};out.rec=skillState().autocasting===undefined||skillState().autocasting===false;return out`);
for(const k of ['sage','sageCast','fist','double','plag','chain','shadow','auto','martyr'])assert.equal(auto[k][0],true,k+' should fire');
for(const k of Object.keys(auto))if(k!=='fist'&&Array.isArray(auto[k])&&auto[k].length===2&&typeof auto[k][1]==='number')assert.equal(auto[k][1],0,k+' must not fire on a failed roll');
assert.equal(auto.sageOff[0],false,'Auto Spell only while the buff is up');assert.equal(auto.doubleAttack[0],false,'Double Casting repeats casts, not attacks');assert.equal(auto.monk,0);
assert.deepEqual(auto.kids,['Fire Bolt','Lightning Bolt','Cold Bolt']);assert.equal(auto.rec,true);
ok("Auto Spell, Spell Fist, Double Casting, Plagiarism, Chain Action, Shadow Warrior and Martyr's Reckoning fire bonus casts");

const boss=J(`Math.random=()=>.5;const m=__setup('Biochemist');const a=__hit(m,'bi_demo');resetSkillRuntime();m.boss=true;const b=__hit(m,'bi_demo');return b/a`);
assert.ok(boss>1.15&&boss<1.7,'Acid Demonstration +40% on bosses');
ok('Acid Demonstration hits bosses 40% harder');
// haven-v413: a class with eight Ascension skills levels its skill track far enough to max them all.
const asc=J(`const o={};for(const c of ['Kagerou & Oboro','Rebellion','Sura','Rune Knight']){S=fresh();S.cls=c;S.lv=150;const n=ASC_SKILLS.filter(s=>s.from===c).length;
  const a=ascState();gainAscension(1e15,c);const lvl=a.skills[c].level;let bought=0;for(const s of ASC_SKILLS.filter(s=>s.from===c))for(let i=0;i<5;i++)if(allocateAscension(s.id,true))bought++;
  const kept=cleanAscension(JSON.parse(JSON.stringify(S.ascension))).skills[c];o[c]={n,cap:ascSkillCap(c),lvl,bought,left:ascPoints(true),keptLevel:kept.level,keptRanks:Object.values(kept.ranks).reduce((x,y)=>x+y,0)}}return o`);
for(const c of ['Kagerou & Oboro','Rebellion']){assert.equal(asc[c].n,8,c);assert.equal(asc[c].cap,40,c);assert.equal(asc[c].lvl,40,c);assert.equal(asc[c].bought,40,c+' can max all eight skills');assert.equal(asc[c].left,0);assert.equal(asc[c].keptLevel,40,c+' survives a save round trip');assert.equal(asc[c].keptRanks,40)}
for(const c of ['Sura','Rune Knight']){assert.equal(asc[c].cap,30,c);assert.equal(asc[c].lvl,30,c);assert.equal(asc[c].bought,30,c)}
ok('Kagerou & Oboro and Rebellion earn 40 Skill Ascension points and can max all eight skills; six-skill classes stay at 30');

// Elemental Bolt out-hits a plain Fire Bolt by about a fifth.
const bolt=J(`Math.random=()=>.5;const m=__setup('Sage');const a=__hit(m,'fire');resetSkillRuntime();const b=__hit(m,'sa_bolt');return b/a`);
assert.ok(bolt>1.12&&bolt<1.3,'Elemental Bolt should be about 20% above Fire Bolt, is '+bolt.toFixed(2));
ok('Elemental Bolt hits '+Math.round((bolt-1)*100)+'% harder than Fire Bolt');
g.close();console.log(passed+' passed, 0 failed');
