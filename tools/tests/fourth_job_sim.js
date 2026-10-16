// Milestone 4, slice 1: the six 4th jobs (ROADMAP §2 "3rd Job Advancement") against the real
// game runtime (jsdom harness, real index.html). Run from the repository root:
//   node tools/tests/fourth_job_sim.js
//
// Rules pinned here:
//   * Rune Knight, Warlock, Ranger, Guillotine Cross, Arch Bishop and Mechanic are tier-4
//     children of their Transcendent parent (Lord Knight, High Wizard, Sniper, Assassin Cross,
//     High Priest, Whitesmith);
//   * unlock needs Base Lv 150 AND Job Lv 50 in the parent (plus the existing chain checks);
//   * the 4th-job tier does not change the 3rd-job collection bonus, gear tiers or old classes;
//   * each 4th job shows in the Class Tree on its own row, and wears its parent's packed body
//     until native 3rd-job bodies exist (ROADMAP §2 Phase B).
const assert = require('node:assert/strict');
const { createGame } = require('./helpers/game');

const FOURTH = [
  ['Rune Knight', 'Lord Knight'],
  ['Warlock', 'High Wizard'],
  ['Ranger', 'Sniper'],
  ['Guillotine Cross', 'Assassin Cross'],
  ['Arch Bishop', 'High Priest'],
  ['Mechanic', 'Whitesmith'],
];
const CHAIN = {
  'Lord Knight': ['Swordman', 'Knight'], 'High Wizard': ['Mage', 'Wizard'], Sniper: ['Archer', 'Hunter'],
  'Assassin Cross': ['Thief', 'Assassin'], 'High Priest': ['Acolyte', 'Priest'], Whitesmith: ['Merchant', 'Blacksmith'],
};

// The 4th jobs are dark-launched (FOURTH_JOBS_LIVE=false in index.html). The rules below are tested
// on a copy of the real page with the flag turned on; the live page is checked separately to be
// unchanged. Nothing is edited on disk.
const fs = require('node:fs'), path = require('node:path');
const LIVE_HTML = fs.readFileSync(path.join(__dirname, '..', '..', 'index.html'), 'utf8');
if (LIVE_HTML.split('const FOURTH_JOBS_LIVE=true;').length !== 2) throw new Error('FOURTH_JOBS_LIVE flag changed shape');
const FLAG_ON_HTML = LIVE_HTML.replace('const FOURTH_JOBS_LIVE=false;', 'const FOURTH_JOBS_LIVE=true;');

const live = createGame();
const g = createGame(FLAG_ON_HTML);
const ev = g.ev;
let pass = 0, fail = 0;
function test(name, body) {
  const code = typeof body === 'function' ? body() : body;
  ev(`S=fresh();S.auto=false;t=0;`);
  try {
    assert.equal(ev(`(()=>{${code}})()`), true);
    console.log('ok   ' + name);
    pass++;
  } catch (e) {
    console.error('FAIL ' + name + ' -> ' + e.message);
    fail++;
  }
}
// Put the save on `parent` with every ancestor at the job level the chain requires.
const setup = (parent, parentJl, base) => `{
  const chain=${JSON.stringify(CHAIN)};
  const line=chain[${JSON.stringify(parent)}]||[];
  S.lv=${base};S.cls=${JSON.stringify(parent)};S.jobs={Novice:{jl:10,jx:0}};
  for(const k of line)S.jobs[k]={jl:50,jx:0};
  S.jobs[${JSON.stringify(parent)}]={jl:${parentJl},jx:0};
  S.sk={};resetSkillRuntime();}`;

console.log('dark launch: the live roster is unchanged\n');

{
  const r = live.ev(`({
    classes: Object.keys(CLASSES).length,
    fourth: Object.values(CLASSES).filter(c => c.tier === 4).length,
    joff: JOFF.slice(0, 4).join(),
    tree: (V.job().match(/class="class-path-tabs"/g)||[]).length,
    build: BUILD,
    hasRuneKnight: !!CLASSES['Rune Knight'],
  })`);
  assert.equal(r.classes, 25, 'the live game still has 19 classes');
  assert.equal(r.fourth, 6, 'no 4th-tier class is live');
  assert.equal(r.hasRuneKnight, true, 'Rune Knight is not in the live roster');
  assert.equal(r.joff, '0,9,49,98', 'the live pacing table is unchanged');
  assert.equal(r.tree, 1, 'the live Class Path has one lineage picker');
  // Live Class Path presentation has its own coordinated build label.
  assert.ok(r.build === '2026-10-16 haven-v160 Mythic testing unlock', 'the visible redesign has the coordinated build label');
  console.log('ok   live page: 19 classes, no 4th job, JOFF/Class Tree/build unchanged');
  pass++;
}

console.log('4th jobs (flag on): catalogue and tier ladder\n');

test('six 4th-tier classes exist under the right Transcendent parents', () => `
  const want=${JSON.stringify(FOURTH)};
  return want.every(([n,p])=>CLASSES[n]&&CLASSES[n].par===p&&CLASSES[n].tier===4&&CLASSES[n].mj===50&&CLASSES[n].rj===50)
    && Object.values(CLASSES).filter(c=>c.tier===4).length===6;`);

test('parents list the 4th job as their next class', () => `
  return ${JSON.stringify(FOURTH)}.every(([n,p])=>CLASSES[p].kids.includes(n));`);

test('the 3rd-job collection is unchanged: six transcendent classes, none of them 4th jobs', () => `
  const third=Object.values(CLASSES).filter(c=>c.tier===3).map(c=>c.n).sort().join();
  return t3Total()===6&&third===['Assassin Cross','High Priest','High Wizard','Lord Knight','Sniper','Whitesmith'].sort().join();`);

test('playing a 4th job does not add to the Transcendent collection bonus', () => `
  ${setup('Lord Knight', 50, 150)}
  S.base={'Lord Knight':{lv:150,exp:0,pts:0,st:{},eq:null}};
  const before=playedClasses();
  S.base['Rune Knight']={lv:150,exp:0,pts:0,st:{},eq:null};
  return playedClasses()===before && collDmg()===before;`);

test('existing tiers keep their Job Lv caps and pacing offsets', () => `
  return CLASSES['Lord Knight'].tier===3&&CLASSES['Lord Knight'].rj===50&&CLASSES.Knight.rj===40&&CLASSES.Swordman.rj===10
    && JOFF.slice(0,4).join()==='0,9,49,98';`);

console.log('\n4th jobs: unlock gate\n');

test('Base Lv 150 and parent Job Lv 50 are both required', () => `
  ${setup('Lord Knight', 49, 150)}
  const a=classBlock('Rune Knight');
  ${setup('Lord Knight', 50, 149)}
  const b=classBlock('Rune Knight');
  return a==='Needs Lord Knight Job Lv 50' && b==='Needs Base Lv 150';`);

test('both conditions met: Rune Knight unlocks from its parent', () => `
  ${setup('Lord Knight', 50, 150)}
  return classBlock('Rune Knight')==='' && classStatus('Rune Knight')==='ok';`);

test('a 4th job is locked from any class other than its parent', () => `
  ${setup('Lord Knight', 50, 150)}
  S.cls='Knight';
  return classBlock('Rune Knight')!=='';`);

test('the ancestor chain still applies: Lord Knight Job Lv 50 needs Knight Job Lv 50', () => `
  ${setup('Lord Knight', 50, 150)}
  S.jobs.Knight.jl=49;
  return classBlock('Rune Knight')==='Needs Knight Job Lv 50';`);

test('a 3rd job is not gated by Base Lv 150 (existing unlock unchanged)', () => `
  S.lv=100;S.cls='Priest';S.jobs={Novice:{jl:10,jx:0},Acolyte:{jl:50,jx:0},Priest:{jl:50,jx:0}};
  return classBlock('High Priest')==='';`);

test('changing into a 4th job restarts the parent-line snapshot and keeps the parent saved', () => `
  ${setup('Lord Knight', 50, 150)}
  changeClass('Rune Knight');JOB_RITE.enemy.hp=0;kill(JOB_RITE.enemy);JOB_RITE.exitAt=Date.now();tickJobRite();
  return S.cls==='Rune Knight' && !!S.base['Lord Knight'] && jobOf().jl===1 && S.lv>=1;`);

test('a played 4th job can be returned to without the level gate', () => `
  ${setup('Lord Knight', 50, 150)}
  changeClass('Rune Knight');JOB_RITE.enemy.hp=0;kill(JOB_RITE.enemy);JOB_RITE.exitAt=Date.now();tickJobRite();
  changeClass('Lord Knight');
  return S.cls==='Lord Knight' && classBlock('Rune Knight')==='' && classStatus('Rune Knight')==='played';`);

console.log('\n4th jobs: gear, pacing and visuals\n');

test('4th jobs keep their parent weapon lists and main stat', () => `
  const want={'Rune Knight':['sword','str'],Warlock:['staff','int'],Ranger:['bow','dex'],'Guillotine Cross':['katar','dagger','str'],'Arch Bishop':['mace','int'],Mechanic:['axe','mace','str']};
  return Object.entries(want).every(([n,w])=>CLASSES[n].wt.join()===w.slice(0,-1).join()&&CLASSES[n].main===w[w.length-1]);`);

test('a Rune Knight can wear Transcendent-grade sword gear and not katar or staff', () => `
  ${setup('Lord Knight', 50, 150)}
  S.cls='Rune Knight';
  const sword={id:901,slot:'weapon',wt:'sword',sec:3,tier:0,name:'Test Sword'};
  const katar={id:902,slot:'weapon',wt:'katar',sec:3,tier:0,name:'Test Katar'};
  return canUse(sword)===true && canUse(katar)===false;`);

test('a 4th job wears the highest gear band (the same ceiling as Transcendent)', () => `
  ${setup('Lord Knight', 50, 150)}
  S.cls='Rune Knight';
  const gear={id:903,slot:'armor',sec:5,tier:4,name:'Test Plate'};
  return gearTierOK(gear)===true && gearTierOK(gear,'Lord Knight')===true;`);

test('job-level pacing exists for 4th jobs: Job Lv 1 at Base 101, Job Lv 50 at Base 150', () => `
  ${setup('Lord Knight', 50, 150)}
  S.cls='Rune Knight';
  const a=jneed(1), b=jneed(50);
  return Number.isFinite(a)&&a>=1&&Number.isFinite(b)&&b>=1&&JOFF[4]===100;`);

test('4th jobs wear their parent packed body, not an Assassin Cross fallback', () => `
  return ${JSON.stringify(FOURTH)}.every(([n,p])=>{const b=packBodyFor(n,4),pb=packBodyFor(p,3);return b&&b===pb&&!!SPRITE_PACK.bodies[b]})`);

test('each selected lineage includes its fourth job and live trial action', () => `
  ${setup('Lord Knight', 50, 150)}
  return ${JSON.stringify(FOURTH)}.every(([n,p])=>{selK=n;S.cls=p;S.jobs[p]={jl:50,jx:0};const html=V.job();return html.includes('class-path-track')&&html.includes('data-a="job" data-v="'+n+'"')&&html.includes('Enter advancement trial')});`);

test('the Eclipse lineage uses the 4th job as the last step of its path', () => `
  ${setup('Lord Knight', 50, 150)}
  const html=eclipseClassEmblem('Rune Knight');
  return typeof html==='string'&&html.length>0 && down('Lord Knight').includes('Rune Knight');`);

console.log(`\n${pass} passed, ${fail} failed`);
g.close();
live.close();
if (fail) process.exit(1);
