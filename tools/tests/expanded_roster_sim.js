#!/usr/bin/env node
// Expanded roster (haven-v408, weapons and native sprites haven-v409): 20 classes on top of the shipped 25, opened by a fourth job at
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
  'Kagerou & Oboro','Ninja','Paladin','Rebellion','Rogue','Royal Guard','Sage','Scholar','Shadow Chaser','Sorcerer','Stalker','Sura'].sort();
const LINES=[['Swordman','Crusader','Paladin','Royal Guard'],['Mage','Sage','Scholar','Sorcerer'],['Merchant','Alchemist','Biochemist','Geneticist'],
  ['Acolyte','Monk','Champion','Sura'],['Thief','Rogue','Stalker','Shadow Chaser'],['Archer','Bard & Dancer','Minstrel & Gypsy','Maestro & Wanderer']];
const FAMILIES=['dagger','sword','staff','bow','mace','axe','katar'];
console.log('expanded roster: classes, gate, skills, bodies');

test('twenty-two classes join the shipped twenty-five without disturbing them',()=>{
  assert.deepEqual(json('return [...EXPANDED_LINE].sort()'),CLASS_IDS);
  assert.equal(ev('Object.keys(CLASSES).length'),47);
  assert.equal(ev('CD.filter(c=>!EXPANDED_LINE.has(c[0])).length'),25);
  for(const line of LINES)for(let i=1;i<line.length;i++){
    assert.equal(ev(`CLASSES[${JSON.stringify(line[i])}].par`),line[i-1]);
    assert.equal(ev(`CLASSES[${JSON.stringify(line[i])}].tier`),i+1);
  }
  for(const solo of ['Ninja','Gunslinger']){assert.equal(ev(`CLASSES.${solo}.par`),'Novice');assert.equal(ev(`classTierOf(${JSON.stringify(solo)})`),3)}
  // haven-v410: each Novice-born class has one advanced job, a full Ascension (tier 4) class.
  for(const [adv,par] of [['Kagerou & Oboro','Ninja'],['Rebellion','Gunslinger']]){
    assert.equal(ev(`CLASSES[${JSON.stringify(adv)}].par`),par);assert.equal(ev(`CLASSES[${JSON.stringify(adv)}].tier`),4);assert.equal(ev(`CLASSES[${JSON.stringify(adv)}].rj`),50);
    assert.deepEqual(json(`return lineOf(${JSON.stringify(adv)})`),['Novice',par,adv]);
    assert.ok(ev(`!!JOB_RITE_OPPONENTS[${JSON.stringify(par)}]`),par+' has no advancement opponent');
    ev(`S=fresh();S.cls=${JSON.stringify(adv)};S.lv=150`);assert.equal(ev('fourthJob()'),true);
    const wt=json(`return CLASSES[${JSON.stringify(adv)}].wt`)[0];
    ev(`{const src=genGear({...gearPool(9,15).find(x=>x.k===WEAPON_KIN[${JSON.stringify(wt)}]),k:${JSON.stringify(wt)}},fieldPower(9,15),5,false,4,9,15);S.inv=[src];S.zeny=1e12;S.ascensionMat=[1000,1000,1000];window.forged=transformToMythic(src,GM_ASC_PRESETS[S.cls].set)}`);
    assert.equal(ev('window.forged.success'),true,adv+' cannot forge its Mythic '+wt);
  }
});

test('every expanded class trains in a shipped weapon family or the kin of one',()=>{
  const wt=json('return [...EXPANDED_LINE].map(n=>[n,CLASSES[n].wt])');
  for(const [name,types] of wt){assert.ok(types.length>0,name);for(const t of types)assert.ok(FAMILIES.includes(t)||FAMILIES.includes(ev(`WEAPON_KIN[${JSON.stringify(t)}]`)),name+' trains in unknown weapon family '+t)}
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

test('the six expanded Transcendent classes join the collection: cap +12%',()=>{
  ev(`S=fresh();S.cls='Novice';S.lv=150;S.base={};for(const n of EXPANDED_LINE)S.base[n]={lv:150}`);
  assert.equal(ev('t3Total()'),12);assert.equal(ev('playedClasses()'),6,'only the tier-3 expanded classes count');assert.equal(ev('collDmg()'),6);
  ev(`for(const n of ['Lord Knight','High Wizard','Sniper','Assassin Cross','High Priest','Whitesmith'])S.base[n]={lv:100}`);assert.equal(ev('collDmg()'),12);
  ev(`S.base.Paladin={lv:99}`);assert.equal(ev('collDmg()'),11,'Base Lv 100 is still required');
});

test('five ordinary skills per class, a sixth Ascension skill per fourth job, ids pinned',()=>{
  const rows=json('return SKILLSX.map(s=>({id:s.id,from:s.from,max:s.max,type:s.type,asc:!!s.ascensionOnly,icon:s.icon,fx:s.fx,tree:s.tree||null,key:s.key||null}))');
  assert.equal(rows.length,118);assert.equal(new Set(rows.map(r=>r.id)).size,118);
  assert.equal(ev('SKILLS.length'),245);
  assert.equal(ev('SKILLS.filter(s=>!SKILLSX.includes(s)).length'),127,'the shipped catalogue is unchanged');
  assert.equal(ev('new Set(SKILLS.map(s=>s.id)).size'),245,'a new skill id collides with a shipped one');
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
  assert.equal(ev('ASC_ROWS.length'),14);
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
  assert.equal(names.length,44);
  assert.deepEqual(fs.readdirSync(path.join(root,'assets/sprite-pack-x')).sort(),[...names.map(n=>X.bodies[n].file),'index.js'].sort(),'stray or missing body file');
  for(const n of names){
    const b=X.bodies[n],file=fs.readFileSync(path.join(root,X.dir,b.file));
    assert.equal(file.subarray(0,4).toString()+file.subarray(8,12).toString(),'RIFFWEBP',n);
    assert.equal(file.subarray(12,16).toString(),'VP8L',n+' must stay lossless');
    // idle / walk / attack, eight directions each, every frame anchored
    assert.equal(b.anchors.length,3,n);
    for(const [i,anim] of b.anchors.entries()){assert.equal(anim.length,8,n+' lost a direction');for(const dir of anim){assert.equal(dir.length,[1,8,6][i],n+' frame count');
      // [x, y] or [x, y, headColumn]; the head must land inside the padded cell
      for(const a of dir){assert.ok(a.length===2||a.length===3,n);assert.ok(a.every(Number.isInteger),n);assert.ok(a[0]>=20&&a[0]<=X.cell[0]-20&&a[1]>=28&&a[1]<=X.cell[1],n+' head anchor '+a);if(a.length===3)assert.ok(a[2]>=0&&a[2]<8,n)}}}
  }
  // haven-v409: native RO renders that fill the shipped pack's padded cell, on their own ground line.
  assert.deepEqual([...X.cell],[126,134]);assert.equal(ev('window.SPRITE_PACK.cellW+","+window.SPRITE_PACK.cellH'),'126,134');
  assert.ok(X.pivotY>X.origin[1]&&X.pivotY<X.cell[1]);
  const manifest=JSON.parse(fs.readFileSync(path.join(root,'tools/native-expanded/source-manifest.json'),'utf8'));
  assert.equal(manifest.files.length,96);for(const f of manifest.files){assert.match(f.sha256,/^[0-9a-f]{64}$/);assert.match(f.blob,/^[0-9a-f]{40}$/);assert.ok(f.repo&&f.commit&&f.path&&f.bytes>0,f.name)}
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

test('the seven new weapon families are real gear',()=>{
  const KIN=json('return WEAPON_KIN');
  assert.deepEqual(Object.keys(KIN).sort(),['book','gun','instrument','knuckle','shuriken','spear','whip']);
  const own=json(`return Object.fromEntries([...EXPANDED_LINE].map(n=>[n,CLASSES[n].wt]))`);
  for(const [cls,fam] of [['Crusader','spear'],['Paladin','spear'],['Royal Guard','spear'],['Sage','book'],['Scholar','book'],['Sorcerer','book'],['Monk','knuckle'],['Champion','knuckle'],['Sura','knuckle'],
    ['Bard & Dancer','instrument'],['Minstrel & Gypsy','whip'],['Maestro & Wanderer','instrument'],['Ninja','shuriken'],['Gunslinger','gun']])assert.ok(own[cls].includes(fam),cls+' cannot wear a '+fam);
  assert.deepEqual(own.Gunslinger,['gun']);
  // every new family is reachable: its kin is in a drop pool, and the kin drop converts for the class
  for(const [cls,wt] of Object.entries(own))for(const w of wt){const kin=KIN[w]||w;
    assert.ok(ev(`[0,1,2,3,4,5,6,7,8,9].some(m=>[1,6,8,10,12,15].some(l=>gearPool(m,l).some(x=>x.k===${JSON.stringify(kin)})))`),cls+' has no drop source for '+w)}
  // shipped classes never see a kin weapon; a class that can only wear the new family always gets it
  ev(`S=fresh();S.cls='Knight'`);assert.equal(ev(`[...Array(200)].every(()=>kinDrop({k:'sword',n:'Dragon Slayer',sec:3}).k==='sword')`),true);
  ev(`S=fresh();S.cls='Gunslinger'`);assert.equal(ev(`[...Array(200)].every(()=>kinDrop({k:'bow',n:'Dragon Bow',sec:3}).k==='gun')`),true);
  assert.equal(ev(`kinDrop({k:'bow',n:'Dragon Bow',sec:3}).n`),'Dragon Revolver');assert.equal(ev(`kinDrop({k:'sword',n:'x',sec:3}).k`),'sword');
  ev(`S=fresh();S.cls='Crusader'`);const mix=json(`const r={};for(let i=0;i<2000;i++){const k=kinDrop({k:'sword',n:'Claymore',sec:2}).k;r[k]=(r[k]||0)+1}return r`);
  assert.ok(mix.spear>1000&&mix.spear<1400&&mix.sword>600,'a Crusader should get both spears and swords: '+JSON.stringify(mix));
  assert.equal(ev(`kinWeaponName('spear','Claymore',2)`),'Lance');
  ev(`S=fresh();S.cls='Bard & Dancer';S.sex='f'`);const bd=json(`const r={};for(let i=0;i<2000;i++){const k=kinDrop({k:'bow',n:'Long Bow',sec:2}).k;r[k]=(r[k]||0)+1}return r`);
  assert.ok(bd.whip>bd.instrument&&bd.instrument>0&&bd.bow>0,JSON.stringify(bd));
  // generated items: named, socketed, affixed and drawn with their own local icon in every band
  for(const w of Object.keys(KIN)){
    for(const sec of [0,1,2,3,4,5]){const it=json(`return genGear({k:${JSON.stringify(w)},n:'Test',sec:${sec},tier:2,quality:1},100,${sec},false,2,5,5)`);
      assert.equal(it.slot,'weapon');assert.equal(it.wt,w);assert.equal(it.slots===4,KIN[w]==='bow',w+' sockets');
      const id=ev(`gearItemIconId(${JSON.stringify(it)})`);assert.ok(id>0&&fs.existsSync(path.join(root,'assets/equipment-icons',id+'.png')),w+' band '+sec+' has no icon');
      assert.equal(it.aff.every(a=>(w==='book'?['int','dex','matk','crit','cdm','hp']:['str','agi','dex','luk','atk','crit','aspd','cdm']).includes(a.k)),true,w+' affix pool')}
    for(const set of json('return Object.keys(ASC_SETS)')){
      assert.ok(ev(`ASC_SETS[${JSON.stringify(set)}].pieces.weapon[${JSON.stringify(w)}]`),set+' has no Mythic '+w);
      const id=ev(`RO_ITEM_ICON_CANDIDATES.mythic[${JSON.stringify(set)}][${JSON.stringify(w)}]`);assert.ok(id>0&&fs.existsSync(path.join(root,'assets/equipment-icons',id+'.png')),set+' Mythic '+w+' icon')}
  }
  const icons=JSON.parse(fs.readFileSync(path.join(root,'assets/equipment-icons/manifest.json'),'utf8')),mythic=JSON.parse(fs.readFileSync(path.join(root,'assets/equipment-icons/mythic-manifest.json'),'utf8'));
  for(const w of Object.keys(KIN)){assert.deepEqual(icons.families[w],json(`return RO_ITEM_ICON_CANDIDATES[${JSON.stringify(w)}]`));for(const set in mythic.sets)assert.equal(mythic.sets[set][w],ev(`RO_ITEM_ICON_CANDIDATES.mythic[${JSON.stringify(set)}][${JSON.stringify(w)}]`))}
  for(const a of [...icons.assets,...mythic.assets])assert.equal(require('node:crypto').createHash('sha256').update(fs.readFileSync(path.join(root,'assets/equipment-icons',a.file))).digest('hex'),a.sha256,a.file);
  // the Sage line fights with magic, book or staff
  for(const cls of ['Sage','Scholar','Sorcerer'])assert.ok(ev(`INT_CLASSES.includes(${JSON.stringify(cls)})`),cls);
  // GM presets cover the six new fourth jobs, each naming a real set
  for(const cls of ['Royal Guard','Sorcerer','Geneticist','Sura','Shadow Chaser','Maestro & Wanderer'])assert.ok(ev(`!!ASC_SETS[GM_ASC_PRESETS[${JSON.stringify(cls)}].set]`),cls);
});

test('every expanded class has a fitted damage budget',()=>{
  const budget=JSON.parse(fs.readFileSync(path.join(root,'tools/tests/fixtures/expanded_skill_budget.json'),'utf8')).classes;
  assert.deepEqual(Object.keys(budget).sort(),[...CLASS_IDS].sort());
  for(const [cls,b] of Object.entries(budget)){
    const t=json(`return SKILL_TUNING[${JSON.stringify(cls)}]`);assert.ok(t,cls+' has no budget');
    assert.equal(t.single.length,3);assert.equal(t.area.length,3);assert.ok(Math.abs(t.single[2]-b.K)<.001&&Math.abs(t.area[2]-b.A)<.001,cls+' drifted from its recorded fit');
    assert.equal(ev(`CLASSES[${JSON.stringify(cls)}].atk`),b.atk,cls+' attack multiplier');assert.ok(ev(`!!CLASSES[${JSON.stringify(b.sibling)}]`),cls);
  }
});

test('saves on an expanded class load back unchanged',()=>{
  ev(`S=fresh();S.cls='Geneticist';S.lv=150;S.base['Rune Knight']={lv:150};for(const n of lineOf(S.cls))S.jobs[n]={jl:CLASSES[n].mj,jx:0};S.sk.ge_cart=10;S.sk.al_pot=5`);
  const back=json(`const raw=JSON.parse(JSON.stringify(S));const n=typeof migrate==='function'?migrate(raw):raw;return {cls:n.cls,cart:n.sk.ge_cart,pot:n.sk.al_pot,jl:n.jobs.Geneticist.jl}`);
  assert.deepEqual(back,{cls:'Geneticist',cart:10,pot:5,jl:50});
});

g.close();
console.log(passed+' passed, '+failed+' failed');
if(failed)process.exit(1);
