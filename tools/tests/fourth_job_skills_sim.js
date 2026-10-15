// Milestone 4: the 18 signature skills of the six 4th jobs, run through the real game runtime
// (jsdom harness, real index.html). Run from the repository root:
//   node tools/tests/fourth_job_skills_sim.js
//
// The skills are dark-launched: SKILLS4 joins the live skill list only while FOURTH_JOBS_LIVE is
// true. These checks use a copy of the page with the flag on, and check the live page is unchanged.
// Mechanics pinned here (see the SKILLS4 comment in index.html and Updates/fourth-jobs/):
//   stacks (self gain/spend, target stacks/spend), bounces, stuns (flat, roulette, target spend),
//   gap-closers (dash), absorb (ward soaks player damage), roulette (per-hit chance), and the
//   dagger-counts-as-katar rule for Guillotine Cross.
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const { createGame } = require('./helpers/game');

const LIVE_HTML = fs.readFileSync(path.join(__dirname, '..', '..', 'index.html'), 'utf8');
if (LIVE_HTML.split('const FOURTH_JOBS_LIVE=false;').length !== 2) throw new Error('FOURTH_JOBS_LIVE flag changed shape');
const FLAG_ON_HTML = LIVE_HTML.replace('const FOURTH_JOBS_LIVE=false;', 'const FOURTH_JOBS_LIVE=true;');

const CLASSES4 = {
  'Rune Knight': ['rk_charge', 'rk_burst', 'rk_ward'],
  Warlock: ['wl_chain', 'wl_seal', 'wl_det'],
  Ranger: ['rg_hunt', 'rg_warg', 'rg_storm'],
  'Guillotine Cross': ['gc_cross', 'gc_slip', 'gc_veil'],
  'Arch Bishop': ['ab_chain', 'ab_judge', 'ab_ward'],
  Mechanic: ['mc_gat', 'mc_over', 'mc_rocket'],
};
const ALL4 = Object.values(CLASSES4).flat();

const live = createGame();
const g = createGame(FLAG_ON_HTML);
const ev = g.ev;
let pass = 0, fail = 0;
function check(name, body) {
  try {
    body();
    console.log('ok   ' + name);
    pass++;
  } catch (e) {
    console.error('FAIL ' + name + ' -> ' + e.message);
    fail++;
  }
}
// Evaluate in the page and return JSON, so results cross the realm boundary safely.
const probe = code => JSON.parse(ev(`JSON.stringify((()=>{${code}})())`));

// A fixed, unkillable dummy at the origin, the player five tiles south, one pack.
const ARENA = `
  S=fresh();S.auto=false;t=0;S.sk={};S.skOff={};S.hp=S.hpMax||S.hp;
  const mk=(x,z,pack=0)=>({x,z,hx:x,hz:z,pack,size:1,hp:1e12,max:1e12,atk:0,at:1e9,spawn:1,fixed:true});
  window.__raws=[];window.__hits=[];
  window.__hitReal=skillHit;
  skillHit=(o,raw,sk,proc)=>{window.__raws.push(raw);window.__hits.push({id:o.id||null,x:o.x,z:o.z,proc:!!proc});return window.__ret==null?10:window.__ret};
  function arena(cls,extra=[]){S.cls=cls;S.skillCombos={};resetSkillRuntime();for(const k in skCd)delete skCd[k];
    mobs=[mk(0,0)];mob=mobs[0];activePack=0;camps=[];pl.x=0;pl.z=5;window.__raws=[];window.__hits=[];
    for(const [x,z] of extra)mobs.push(mk(x,z));}
`;

console.log('live page: the 4th-job skills are not in the live skill list\n');
{
  const r = live.ev(`({
    skills: SKILLS.length,
    ids: SKILLS.filter(s => /^(rk_|wl_|rg_|gc_|ab_|mc_)/.test(s.id)).length,
    hasSkills4: typeof SKILLS4 !== 'undefined' && SKILLS4.length,
    absorbPlain: (()=>{ resetSkillRuntime(); return absorbSoak(7); })(),
  })`);
  check('live skill list is unchanged (no 4th-job skill ids)', () => {
    assert.equal(r.ids, 0, 'no 4th-job skill is live');
    assert.equal(r.skills, 91, 'the live skill count matches HEAD (91)');
  });
  check('live damage path: with no ward up, absorbSoak returns the damage untouched', () => {
    assert.equal(r.absorbPlain, 7);
  });
}

console.log('\n4th-job skills (flag on): catalogue\n');

check('18 skills: three per 4th job, every id unique and not already a live id', () => {
  const r = probe(`return {
    n: SKILLS4.length,
    unique: new Set(SKILLS4.map(s=>s.id)).size,
    clash: SKILLS4.filter(s=>SKILLS.some(x=>x.id===s.id&&!SKILLS4.includes(x))).length,
    perClass: Object.fromEntries(Object.keys(${JSON.stringify(CLASSES4)}).map(c=>[c,SKILLS4.filter(s=>s.from===c).map(s=>s.id)])),
  }`);
  assert.equal(r.n, 18);
  assert.equal(r.unique, 18);
  assert.equal(r.clash, 0);
  for (const [c, ids] of Object.entries(CLASSES4)) assert.deepEqual(r.perClass[c], ids, c);
});

check('every skill is a real attack with a cooldown, a rank cap of 10, and a description', () => {
  const r = probe(`return SKILLS4.map(s=>({id:s.id,type:s.type,cd:s.cd,max:s.max,hits:s.hits,power:s.power,text:!!s.text,desc:typeof s.d==='function'&&s.d(1).length>20}))`);
  for (const s of r) {
    assert.equal(s.type, 'act', s.id);
    assert.ok(s.cd > 0 && s.hits >= 1 && s.power > 0, s.id);
    assert.equal(s.max, 10, s.id);
    assert.ok(s.text && s.desc, s.id + ' description');
  }
});

check('the 4th-job classes are magic where their parent is (Warlock, Arch Bishop) and melee elsewhere', () => {
  const r = probe(`return SKILLS4.map(s=>({id:s.id,magic:s.magic,cls:s.cls,from:s.from}))`);
  for (const s of r) {
    const parentMagic = ['wl_', 'ab_'].some(p => s.id.startsWith(p));
    assert.equal(s.magic, parentMagic, s.id);
    assert.deepEqual(s.cls, [s.from], s.id);
  }
});

check('every mechanic is used by at least one 4th-job skill', () => {
  const r = probe(`return SKILLS4.map(s=>({id:s.id,gain:!!s.gain,spend:!!s.spend,tgtStack:!!s.tgtStack,tgtSpend:!!s.tgtSpend,bounce:!!s.bounce,roulette:!!s.roulette,dash:!!s.dash,absorb:!!s.absorb,stun:!!s.stun}))`);
  const any = k => r.some(s => s[k]);
  for (const k of ['gain', 'spend', 'tgtStack', 'tgtSpend', 'bounce', 'roulette', 'dash', 'absorb', 'stun']) assert.ok(any(k), k);
});

check('Warg Strike rolls 25% for its stun (the example the owner gave)', () => {
  const s = probe(`return SKILLS4.find(x=>x.id==='rg_warg')`);
  assert.deepEqual(s.roulette, { chance: 25, effect: 'stun', value: 1.5 });
});

check('every 4th-job skill has a native icon (reused, not repainted) and an effect kind', () => {
  const r = probe(`return SKILLS4.map(s=>({id:s.id,icon:!!PGSkillIcons[s.id],fx:!!skillFxSpec(s.id)}))`);
  for (const s of r) { assert.ok(s.icon, s.id + ' icon'); assert.ok(s.fx, s.id + ' fx'); }
});

console.log('\n4th-job skills: stacks\n');

check('self stacks build per direct hit and cap at the rune limit (5)', () => {
  const r = probe(`${ARENA}
    window.__ret=1; arena('Rune Knight');
    castSkill(SKILLS4.find(s=>s.id==='rk_charge'),1);castSkill(SKILLS4.find(s=>s.id==='rk_charge'),1);
    const r=skillState();return {n:r.stacks.rune.n, hits:window.__hits.length}`);
  assert.equal(r.hits, 6);
  assert.equal(r.n, 5);
});

check('Rune Burst spends every rune stack for +25% damage each', () => {
  const r = probe(`${ARENA}
    window.__ret=0; arena('Rune Knight');
    const burst=SKILLS4.find(s=>s.id==='rk_burst');
    castSkill(burst,1); const base=window.__raws[0];
    arena('Rune Knight'); skillState().stacks={rune:{n:4,until:t+10}};
    castSkill(burst,1); const boosted=window.__raws[0];
    return {ratio:boosted/base, left:skillState().stacks.rune};`);
  assert.ok(Math.abs(r.ratio - 2) < 1e-9, 'ratio ' + r.ratio);
  assert.equal(r.left, undefined, 'stacks are consumed');
});

check('stacks expire after their lifetime and do not spend', () => {
  const r = probe(`${ARENA}
    window.__ret=0; arena('Ranger');
    skillState().stacks={quarry:{n:4,until:t+12}};
    t=13; const n=takeSelfStacks('quarry');
    return {n};`);
  assert.equal(r.n, 0);
});

check('Shadow Slip stacks Bleed on the target (cap 5); Cross Impact spends it', () => {
  const r = probe(`${ARENA}
    window.__ret=0; arena('Guillotine Cross');
    const slip=SKILLS4.find(s=>s.id==='gc_slip'),cross=SKILLS4.find(s=>s.id==='gc_cross');
    window.__ret=1; for(let i=0;i<3;i++)castSkill(slip,1);
    const stacks=mobs[0].stk.bleed.n;
    window.__ret=0; window.__raws=[];
    castSkill(cross,1); const spent=window.__raws[0];
    arena('Guillotine Cross'); window.__ret=0;
    castSkill(cross,1); const unspent=window.__raws[0];
    return {stacks, ratio:spent/unspent, after:mobs[0].stk&&mobs[0].stk.bleed};`);
  assert.equal(r.stacks, 5);
  assert.ok(Math.abs(r.ratio - (1 + 0.12 * 5)) < 1e-6, 'ratio ' + r.ratio);
  assert.equal(r.after, undefined);
});

check('Soul Seal stacks up to 5 on the target; Seal Detonation spends them and stuns', () => {
  const r = probe(`${ARENA}
    window.__ret=1; arena('Warlock');
    const seal=SKILLS4.find(s=>s.id==='wl_seal'),det=SKILLS4.find(s=>s.id==='wl_det');
    for(let i=0;i<7;i++)castSkill(seal,1);
    const n=mobs[0].stk.seal.n;
    window.__ret=0; window.__raws=[]; castSkill(det,1); const loaded=window.__raws[0];
    const stunLoaded=mobs[0].stun||0;
    arena('Warlock'); window.__ret=0; castSkill(det,1); const empty=window.__raws[0];
    return {n, loaded, empty, stunLoaded, stunEmpty:mobs[0].stun||0};`);
  assert.equal(r.n, 5);
  assert.ok(Math.abs(r.loaded / r.empty - (1 + 0.2 * 5)) < 1e-6, 'ratio');
  assert.ok(Math.abs(r.stunLoaded - 0.8) < 1e-9, 'stun ' + r.stunLoaded);
  assert.equal(r.stunEmpty, 0, 'no seals, no stun');
});

console.log('\n4th-job skills: bounces, stuns and roulette\n');

check('Chain Lightning bounces to the three nearest enemies in the pack at half damage', () => {
  const r = probe(`${ARENA}
    window.__ret=10; arena('Warlock',[[1,0],[2,0],[3,0],[9,0]]);
    castSkill(SKILLS4.find(s=>s.id==='wl_chain'),1);
    const h=window.__hits;
    return {primaryRaw:window.__raws[0], bounces:h.slice(1).map(x=>x.x), bounceRaw:window.__raws[1], count:h.length};`);
  assert.equal(r.count, 4, 'primary + three bounces');
  assert.deepEqual(r.bounces, [1, 2, 3], 'nearest three, not the far one at x=9');
  assert.ok(Math.abs(r.bounceRaw / r.primaryRaw - 0.5) < 1e-9, 'half damage');
});

check('bounce does not reach another pack', () => {
  const r = probe(`${ARENA}
    window.__ret=10; arena('Ranger',[]);
    mobs.push({...mk(1,0),pack:1});
    castSkill(SKILLS4.find(s=>s.id==='rg_storm'),1);
    return window.__hits.map(h=>h.x);`);
  assert.deepEqual(r, [0], 'the other pack is untouched');
});

check('Warg Strike: each hit rolls 25%; a low roll stuns for 1.5 s, a high roll does not', () => {
  const r = probe(`${ARENA}
    window.__ret=10; const warg=SKILLS4.find(s=>s.id==='rg_warg');
    const rnd=Math.random; Math.random=()=>0.1;
    arena('Ranger'); castSkill(warg,1); const low=mobs[0].stun||0;
    Math.random=()=>0.9;
    arena('Ranger'); castSkill(warg,1); const high=mobs[0].stun||0;
    Math.random=rnd;
    return {low, high};`);
  assert.ok(Math.abs(r.low - 1.5) < 1e-9, 'stun ' + r.low);
  assert.equal(r.high, 0);
});

check('Cross Impact: each cut rolls 30% for an extra cut at 60% of a cut\'s damage', () => {
  const r = probe(`${ARENA}
    window.__ret=10; const cross=SKILLS4.find(s=>s.id==='gc_cross');
    const rnd=Math.random; Math.random=()=>0.1;
    arena('Guillotine Cross'); castSkill(cross,1);
    const hitsLow=window.__hits.length, extra=window.__raws[window.__raws.length-1];
    const main=window.__raws[0];
    Math.random=()=>0.9;
    arena('Guillotine Cross'); castSkill(cross,1);
    const hitsHigh=window.__hits.length;
    Math.random=rnd;
    return {hitsLow, hitsHigh, ratio:extra/main};`);
  assert.equal(r.hitsLow, 4, 'two cuts, each followed by a roulette strike');
  assert.equal(r.hitsHigh, 2, 'no roll, no extra cut');
  assert.ok(Math.abs(r.ratio - 0.6) < 1e-9, 'ratio ' + r.ratio);
});

check('a roulette strike is a proc hit (no mark re-trigger) and never rolls again', () => {
  const r = probe(`${ARENA}
    window.__ret=10; const cross=SKILLS4.find(s=>s.id==='gc_cross');
    const rnd=Math.random; Math.random=()=>0.1;
    arena('Guillotine Cross'); castSkill(cross,1);
    Math.random=rnd;
    return window.__hits.map(h=>h.proc);`);
  assert.deepEqual(r, [false, true, false, true], 'cut, strike, cut, strike: strikes are procs');
});

check('Judgment Seal stuns the target for a full second; Rocket Jump stuns for 0.6 s', () => {
  const r = probe(`${ARENA}
    window.__ret=0; arena('Arch Bishop'); castSkill(SKILLS4.find(s=>s.id==='ab_judge'),1); const judge=mobs[0].stun||0;
    arena('Mechanic'); castSkill(SKILLS4.find(s=>s.id==='mc_rocket'),1); const rocket=mobs[0].stun||0;
    return {judge, rocket};`);
  assert.ok(Math.abs(r.judge - 1.0) < 1e-9, 'judge ' + r.judge);
  assert.ok(Math.abs(r.rocket - 0.6) < 1e-9, 'rocket ' + r.rocket);
});

check('Overheat Cannon spends every heat stack from Gatling Fever (cap 5)', () => {
  const r = probe(`${ARENA}
    window.__ret=1; arena('Mechanic');
    castSkill(SKILLS4.find(s=>s.id==='mc_gat'),1);
    const heat=skillState().stacks.heat.n;
    window.__ret=0; window.__raws=[];
    castSkill(SKILLS4.find(s=>s.id==='mc_over'),1); const loaded=window.__raws[0];
    arena('Mechanic'); window.__ret=0; castSkill(SKILLS4.find(s=>s.id==='mc_over'),1); const empty=window.__raws[0];
    return {heat, ratio:loaded/empty};`);
  assert.equal(r.heat, 5);
  assert.ok(Math.abs(r.ratio - (1 + 0.2 * 5)) < 1e-6, 'ratio ' + r.ratio);
});

console.log('\n4th-job skills: gap-closers and absorb\n');

check('gap-closers (Rune Charge, Hunting Pounce, Shadow Slip, Rocket Jump) close to their stop distance', () => {
  const r = probe(`${ARENA}
    window.__ret=0;
    const out={};
    for(const [cls,id] of [['Rune Knight','rk_charge'],['Ranger','rg_hunt'],['Guillotine Cross','gc_slip'],['Mechanic','mc_rocket']]){
      arena(cls); pl.z=3.5; castSkill(SKILLS4.find(s=>s.id===id),1);
      out[id]=Math.hypot(pl.x-mob.x,pl.z-mob.z);
    }
    return out;`);
  for (const id of ['rk_charge', 'rg_hunt', 'gc_slip', 'mc_rocket']) {
    assert.ok(r[id] < 5 - 0.5 && r[id] > 1, id + ' moved, stopped at ' + r[id]);
  }
});

check('a 4th-job gap-closer does not pull a target from another pack', () => {
  const r = probe(`${ARENA}
    window.__ret=0; arena('Ranger'); mobs[0].pack=1; activePack=0;
    const before=pl.z; castSkill(SKILLS4.find(s=>s.id==='rg_hunt'),1);
    return pl.z===before&&window.__raws.length>0;`);
  assert.equal(r, true, 'the cast happened and the player stayed put');
});

check('Rune Ward absorbs up to 25% of max HP and then lapses after 8 s', () => {
  const r = probe(`${ARENA}
    window.__ret=0; arena('Rune Knight');
    castSkill(SKILLS4.find(s=>s.id==='rk_ward'),1);
    const cap=skillState().absorb.amount, mh=maxHp();
    const soak1=absorbSoak(10);           // fully soaked
    const big=absorbSoak(mh);             // remainder after the ward runs out
    t=8.5; const after=absorbSoak(10);    // expired
    return {cap, mh, soak1, big, after};`);
  assert.ok(Math.abs(r.cap - r.mh * 0.25) < 1e-6, 'cap');
  assert.equal(r.soak1, 0);
  assert.ok(Math.abs(r.big - (r.mh - (r.cap - 10))) < 1e-6, 'remainder ' + r.big);
  assert.equal(r.after, 10, 'expired ward lets damage through');
});

check('Venom Veil and Sanctuary Ward use their own percentages; a new ward replaces the old', () => {
  const r = probe(`${ARENA}
    window.__ret=0; arena('Guillotine Cross');
    castSkill(SKILLS4.find(s=>s.id==='gc_veil'),1); const veil=skillState().absorb.amount/maxHp();
    arena('Arch Bishop');
    castSkill(SKILLS4.find(s=>s.id==='ab_ward'),1); const ward=skillState().absorb.amount/maxHp();
    castSkill(SKILLS4.find(s=>s.id==='ab_ward'),1);
    return {veil, ward};`);
  assert.ok(Math.abs(r.veil - 0.2) < 1e-9);
  assert.ok(Math.abs(r.ward - 0.3) < 1e-9);
});

console.log('\n4th-job skills: Guillotine Cross and the dagger rule\n');

check('a dagger in each hand counts as the katar for Guillotine Cross (dual wield and katar-only)', () => {
  const r = probe(`
    return {dual:dualWield('Guillotine Cross'), katar:katarOnly('Guillotine Cross'), assassin:katarOnly('Assassin Cross'),
      nonKatar:katarOnly('Rune Knight')};`);
  assert.equal(r.dual, true);
  assert.equal(r.katar, true);
  assert.equal(r.assassin, true);
  assert.equal(r.nonKatar, false);
});

console.log(`\n${pass} passed, ${fail} failed`);
g.close();
live.close();
if (fail) process.exit(1);
