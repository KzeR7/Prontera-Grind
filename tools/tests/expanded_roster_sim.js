#!/usr/bin/env node
// Expanded roster (haven-v408): 20 classes on top of the shipped 25, opened by a fourth job at
// Base Lv 150. Runs the real page.   node tools/tests/expanded_roster_sim.js
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {createGame}=require('./helpers/game');
const root=path.resolve(__dirname,'../..'),g=createGame(),ev=g.ev;
const json=code=>JSON.parse(ev('JSON.stringify((()=>{'+code+'})())'));
let passed=0,failed=0;
const test=(name,fn)=>{try{fn();passed++;console.log('  ok   '+name)}catch(e){failed++;console.error('  FAIL '+name+' -> '+e.message)}};
// Class and skill ids are written into saves. They may be added to, never renamed or removed.
const CLASS_IDS=['Alchemist','Bard & Dancer','Biochemist','Champion','Crusader','Geneticist','Gunslinger','Maestro & Wanderer','Minstrel & Gypsy','Monk',
  'Ninja','Paladin','Rogue','Royal Guard','Sage','Scholar','Shadow Chaser','Sorcerer','Stalker','Sura'];
const LINES=[['Swordman','Crusader','Paladin','Royal Guard'],['Mage','Sage','Scholar','Sorcerer'],['Merchant','Alchemist','Biochemist','Geneticist'],
  ['Acolyte','Monk','Champion','Sura'],['Thief','Rogue','Stalker','Shadow Chaser'],['Archer','Bard & Dancer','Minstrel & Gypsy','Maestro & Wanderer']];
const FAMILIES=['dagger','sword','staff','bow','mace','axe','katar'];
console.log('expanded roster: classes, gate, skills, bodies');

test('twenty classes join the shipped twenty-five without disturbing them',()=>{
  assert.deepEqual(json('return [...EXPANDED_LINE].sort()'),CLASS_IDS);
  assert.equal(ev('Object.keys(CLASSES).length'),45);
  assert.equal(ev('CD.filter(c=>!EXPANDED_LINE.has(c[0])).length'),25);
  for(const line of LINES)for(let i=1;i<line.length;i++){
    assert.equal(ev(`CLASSES[${JSON.stringify(line[i])}].par`),line[i-1]);
    assert.equal(ev(`CLASSES[${JSON.stringify(line[i])}].tier`),i+1);
  }
  for(const solo of ['Ninja','Gunslinger']){assert.equal(ev(`CLASSES.${solo}.par`),'Novice');assert.equal(ev(`classTierOf(${JSON.stringify(solo)})`),3)}
});

test('every expanded class trains in a weapon family the game already drops',()=>{
  const wt=json('return [...EXPANDED_LINE].map(n=>[n,CLASSES[n].wt])');
  for(const [name,types] of wt){assert.ok(types.length>0,name);for(const t of types)assert.ok(FAMILIES.includes(t),name+' trains in unknown weapon family '+t)}
  assert.deepEqual(json('return Object.keys(CLASS_WEAPON).filter(n=>EXPANDED_LINE.has(n))'),[],'the native class/weapon preview catalogue is unchanged');
});

test('the roster is locked until any shipped fourth job reaches Base Lv 150',()=>{
  ev(`S=fresh();S.cls='Swordman';S.lv=99;S.jobs.Novice={jl:10,jx:0};S.jobs.Swordman={jl:50,jx:0}`);
  assert.equal(ev('hasLv150ThirdClass()'),false);
  for(const n of CLASS_IDS)assert.match(ev(`classBlock(${JSON.stringify(n)})`),/Needs any 4th job at Base Lv 150 first/,n);
  ev(`changeClass('Crusader')`);assert.equal(ev('S.cls'),'Swordman','a locked class cannot be entered');
  assert.equal(ev(`classBlock('Knight')`),'','the shipped tree is not gated by the new rule');
  ev(`S.base['Rune Knight']={lv:149}`);assert.equal(ev('hasLv150ThirdClass()'),false);
  ev(`S.base['Royal Guard']={lv:150}`);assert.equal(ev('hasLv150ThirdClass()'),false,'an expanded fourth job cannot open its own gate');
  ev(`S.base['Rune Knight']={lv:150}`);assert.equal(ev('hasLv150ThirdClass()'),true);
  assert.equal(ev(`classBlock('Crusader')`),'');
  assert.equal(ev(`classBlock('Ninja')`),'Reset to Novice first','Ninja and Gunslinger start from Novice like any first job');
  assert.notEqual(ev(`classBlock('Paladin')`),'','later jobs still need their own parent and job level');
  ev(`S=fresh();S.cls='Rune Knight';S.lv=150`);assert.equal(ev('hasLv150ThirdClass()'),true,'the active class counts too');
  ev(`S=fresh();S.jobs.Novice={jl:10,jx:0};S.base['Rune Knight']={lv:150}`);
  for(const solo of ['Ninja','Gunslinger'])assert.equal(ev(`classBlock(${JSON.stringify(solo)})`),'',solo);
});

test('entering an expanded class keeps every item exactly once',()=>{
  ev(`S=fresh();S.cls='Swordman';S.lv=120;S.jobs.Novice={jl:10,jx:0};S.jobs.Swordman={jl:50,jx:0};S.base['Rune Knight']={lv:150};
    const mk=(id,slot,wt)=>({id,slot,wt,tier:0,val:5,name:'Test '+slot+id,aff:[],slots:1,cards:[],sec:0});
    S.eq.weapon=mk(9001,'weapon','sword');S.inv.push(mk(9002,'weapon','bow'),mk(9003,'armor'));`);
  // S.base[class].eq only remembers which worn pieces to put back; the pieces live in inv/eq.
  const ids=()=>json('return [...S.inv,...Object.values(S.eq).filter(Boolean)].map(i=>i.id).sort()');
  const before=ids();assert.equal(new Set(before).size,before.length);
  ev(`changeClass('Crusader')`);assert.equal(ev('S.cls'),'Crusader');
  ev(`S.jobs.Crusader={jl:50,jx:0};changeClass('Paladin')`);assert.equal(ev('S.cls'),'Paladin');
  ev(`changeClass('Swordman')`);assert.equal(ev('S.cls'),'Swordman');
  const after=ids();assert.equal(new Set(after).size,after.length,'an item was duplicated');assert.deepEqual(after,before,'an item was lost or created');
});

test('the Transcendent collection is still the original six',()=>{
  ev(`S=fresh();S.cls='Novice';S.lv=150;S.base={};for(const n of EXPANDED_LINE)S.base[n]={lv:150}`);
  assert.equal(ev('t3Total()'),6);assert.equal(ev('playedClasses()'),0);assert.equal(ev('collDmg()'),0);
});

test('five ordinary skills per class, a sixth Ascension skill per fourth job, ids pinned',()=>{
  const rows=json('return SKILLSX.map(s=>({id:s.id,from:s.from,max:s.max,type:s.type,asc:!!s.ascensionOnly,icon:s.icon,fx:s.fx,tree:s.tree||null,key:s.key||null}))');
  assert.equal(rows.length,106);assert.equal(new Set(rows.map(r=>r.id)).size,106);
  assert.equal(ev('SKILLS.length'),233);
  assert.equal(ev('SKILLS.filter(s=>!SKILLSX.includes(s)).length'),127,'the shipped catalogue is unchanged');
  assert.equal(ev('new Set(SKILLS.map(s=>s.id)).size'),233,'a new skill id collides with a shipped one');
  for(const cls of CLASS_IDS){
    const own=rows.filter(r=>r.from===cls),fourth=ev(`CLASSES[${JSON.stringify(cls)}].tier`)===4;
    assert.equal(own.filter(r=>!r.asc).length,5,cls);assert.equal(own.filter(r=>r.asc).length,fourth?1:0,cls);
    assert.equal(own.filter(r=>!r.asc).reduce((a,r)=>a+r.max,0),fourth?50:45,cls+' tree cost');
  }
  // The first 43 ids shipped in the original proposal; keep them readable by any save that has them.
  for(const id of ['cr_guard','pa_sac','rg_vanish','sa_hind','so_psychic','al_pot','ge_cart','mo_sphere','ch_asura','su_tiger','ro_strip','st_plag','sc_tri','bd_bragi','dn_service','dn_swing','nj_cicada','gs_coin'])
    assert.ok(rows.some(r=>r.id===id),'skill id '+id+' disappeared');
  const keys=new Set(json('return SKILLS.filter(s=>!SKILLSX.includes(s)&&s.key).map(s=>s.key)'));
  for(const r of rows)if(r.key)assert.ok(keys.has(r.key),r.id+' uses a buff/passive key no formula reads: '+r.key);
  for(const r of rows)if(r.tree)assert.ok(['bard','dancer'].includes(r.tree)&&/Bard|Minstrel|Maestro/.test(r.from),r.id);
});

test('every skill borrows existing art: an icon that resolves and a shipped cast effect',()=>{
  assert.deepEqual(json('return SKILLSX.filter(s=>!skillIcon(s.id)).map(s=>s.id)'),[]);
  assert.deepEqual(json('return SKILLSX.filter(s=>!SKILLS.some(x=>x.id===s.icon&&!SKILLSX.includes(x))).map(s=>s.id)'),[],'icon must name a shipped skill');
  assert.deepEqual(json(`return SKILLSX.filter(s=>s.type!=='pas'&&!SKILLS.some(x=>x.id===s.fx&&!SKILLSX.includes(x)&&x.type!=='pas'&&!x.ascensionOnly)).map(s=>s.id)`),[],'fx must name a shipped castable skill');
  assert.deepEqual(json(`return SKILLSX.filter(s=>s.type!=='pas'&&!SKILL_VFX[s.id]).map(s=>s.id)`),[],'missing fallback effect');
  assert.equal(fs.existsSync(path.join(root,'assets/skill-icons/new')),false,'the mis-sliced icon folder must not return');
  // The Afterglow layer plays the borrowed effect: every fx is in the pinned catalogue, and the
  // game swaps the id itself because assets/skill-afterglow.js is hash-pinned by build_afterglow.py.
  const box={};vm.createContext(box);
  vm.runInContext(fs.readFileSync(path.join(root,'assets/afterglow-animations.js'),'utf8')+';this.ids=PGAfterglowAnimations.catalog.map(f=>f.id)',box);
  const glow=new Set(box.ids);
  for(const s of json(`return SKILLSX.filter(s=>s.type!=='pas').map(s=>({id:s.id,fx:s.fx}))`)){assert.ok(glow.has(s.fx),s.id+' borrows an effect Afterglow cannot draw: '+s.fx);assert.ok(!glow.has(s.id),s.id)}
  assert.ok(fs.readFileSync(path.join(root,'index.html'),'utf8').includes('PGSkillAfterglow.has(id)?id:skill&&skill.fx&&PGSkillAfterglow.has(skill.fx)?skill.fx:null'),'the cast hook no longer swaps in the borrowed effect');
});

test('Ascension covers the six new fourth jobs',()=>{
  assert.equal(ev('ASC_ROWS.length'),12);
  assert.deepEqual(json('return ASC_SKILLS.filter(s=>!ASC_UPGRADES[s.id]).map(s=>s.id)'),[]);
  ev(`S=fresh();S.cls='Sura';S.lv=150;for(const n of lineOf('Sura'))S.jobs[n]={jl:CLASSES[n].mj,jx:0}`);
  assert.equal(ev(`lv('su_knuckle')`),0,'the sixth skill starts locked');
  ev(`ascState().skills.Sura.level=30;ascState().skills.Sura.ranks.su_knuckle=1`);
  assert.equal(ev(`lv('su_knuckle')`),10,'one Ascension point unlocks it');
  assert.ok(ev(`V.skilllist().includes('data-a="ascopenskill"')`));
});

test('the Jobs and Skills windows render for every expanded class',()=>{
  for(const cls of CLASS_IDS){
    ev(`S=fresh();S.cls=${JSON.stringify(cls)};S.lv=150;S.base['Rune Knight']={lv:150};for(const n of lineOf(S.cls))S.jobs[n]={jl:CLASSES[n].mj,jx:0}`);
    ev('eclipseJobsBrowse=false');const path=ev('V.job()');ev('eclipseJobsBrowse=true');const job=ev('V.job()'),skills=ev('V.skilllist()');
    assert.ok(path.includes('aria-current="step"')&&path.includes('>'+cls.replace(/&/g,'&amp;')+'<')||path.includes('>'+cls+'<'),cls+' is missing from its own lineage');
    assert.ok(job.includes('data-expanded-roster="open"'),cls);
    for(const s of json(`return SKILLS.filter(s=>s.from===S.cls&&(!s.tree||s.tree===bdTreeView)).map(s=>s.n)`))assert.ok(skills.includes(s.replace(/&/g,'&amp;').replace(/'/g,'&#39;'))||skills.includes(s),cls+' is missing '+s);
    assert.ok(ev('maxHp()')>0&&Number.isFinite(ev('atk()'))&&Number.isFinite(ev('matk()')),cls+' stats');
  }
  ev(`S=fresh()`);assert.ok(ev('V.job()').includes('data-expanded-roster="locked"'));ev('eclipseJobsBrowse=false');
  ev(`S=fresh();S.cls='Bard & Dancer';bdTreeView='bard';tabs.length=0;tabs.push('skills');sub.skills='skilllist';renderWin()`);
  const doc=g.window.document,tab=doc.querySelector('.bd-tabs [data-a=bdtree][data-v=dancer]');
  assert.ok(tab,'the Dancer tab is missing');tab.click();assert.equal(ev('bdTreeView'),'dancer','the Dancer tab is not wired');
  assert.equal(ev(`'bdTree' in S`),false,'the view choice must not be written to the save');
  const dancer=ev('V.skilllist()');
  for(const [id,shown] of json(`return SKILLSX.filter(s=>s.from==='Bard & Dancer').map(s=>[s.n,s.tree!=='bard'])`))assert.equal(dancer.includes(id),shown,id);
});

test('each class has a male and a female body built from its own sheet',()=>{
  const box={window:{}};vm.runInNewContext(fs.readFileSync(path.join(root,'assets/sprite-pack-x/index.js'),'utf8'),box);
  const X=box.window.SPRITE_PACK_X,names=Object.keys(X.bodies);
  assert.equal(names.length,40);
  assert.deepEqual(fs.readdirSync(path.join(root,'assets/sprite-pack-x')).sort(),[...names.map(n=>X.bodies[n].file),'index.js'].sort(),'stray or missing body file');
  for(const n of names){
    const b=X.bodies[n],file=fs.readFileSync(path.join(root,X.dir,b.file));
    assert.equal(file.subarray(0,4).toString()+file.subarray(8,12).toString(),'RIFFWEBP',n);
    assert.equal(file.subarray(12,16).toString(),'VP8L',n+' must stay lossless');
    // idle / walk / attack, eight directions each, every frame anchored
    assert.equal(b.anchors.length,3,n);
    for(const anim of b.anchors){assert.equal(anim.length,8,n+' lost a direction');for(const dir of anim){assert.ok(dir.length>0,n);for(const a of dir)assert.ok(a.every(Number.isFinite),n)}}
  }
  for(const cls of CLASS_IDS)for(const sex of ['m','f']){
    const body=ev(`expandedBodyName(${JSON.stringify(cls)},${JSON.stringify(sex)})`);
    assert.ok(X.bodies[body],cls+' '+sex+' -> '+body);assert.equal(body.startsWith('f_'),sex==='f');
  }
  assert.equal(ev(`expandedBodyName('Knight','m')`),null);
  assert.equal(ev(`expandedBodyName('Bard & Dancer','m')`),'bard');assert.equal(ev(`expandedBodyName('Bard & Dancer','f')`),'f_dancer');
  // Until its own body arrives a class is drawn with its first-job family body, never a blank.
  for(const cls of CLASS_IDS){const body=ev(`packBodyFor(${JSON.stringify(cls)},CLASSES[${JSON.stringify(cls)}].tier,'m')`);assert.ok(body&&ev(`!!window.SPRITE_PACK.bodies[${JSON.stringify(body)}]`),cls+' has no stand-in body')}
  const src=fs.readFileSync(path.join(root,'index.html'),'utf8');
  assert.ok(!/<script[^>]+sprite-pack-x/.test(src),'the expanded bodies must stay lazy, not a startup script');
});

test('saves on an expanded class load back unchanged',()=>{
  ev(`S=fresh();S.cls='Geneticist';S.lv=150;S.base['Rune Knight']={lv:150};for(const n of lineOf(S.cls))S.jobs[n]={jl:CLASSES[n].mj,jx:0};S.sk.ge_cart=10;S.sk.al_pot=5`);
  const back=json(`const raw=JSON.parse(JSON.stringify(S));const n=typeof migrate==='function'?migrate(raw):raw;return {cls:n.cls,cart:n.sk.ge_cart,pot:n.sk.al_pot,jl:n.jobs.Geneticist.jl}`);
  assert.deepEqual(back,{cls:'Geneticist',cart:10,pot:5,jl:50});
});

g.close();
console.log(passed+' passed, '+failed+' failed');
if(failed)process.exit(1);
