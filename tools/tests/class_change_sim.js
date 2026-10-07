// Class-change behaviour, against the real code pulled out of index.html.
//   node tools/tests/class_change_sim.js
//
// The rules being tested:
//   * loading a class restarts it: Base Lv as you are now, job levels cleared,
//     stats refunded, Novice back to Base Lv 25;
//   * stepping away from a class stores its Base Lv, EXP, stats, stat points and
//     worn gear (S.base[class]), so going back to it carries on where you stopped;
//   * the game's own gates still apply (Novice Job Lv 10 to pick a job, etc).
const fs = require('fs'), vm = require('vm'), assert = require('assert');
const src = fs.readFileSync(__dirname + '/../../index.html', 'utf8');
const grab = (a, b) => { const i = src.indexOf(a), j = src.indexOf(b, i); if (i < 0 || j < 0) throw new Error('missing ' + a); return src.slice(i, j); };
const code = [grab('const CD=[', 'const lineOf='), grab('function classRec(', '// ---------- UI ----------')].join('\n');

// totalPts() lives outside the grabbed range, so the harness re-declares it. Pin the real
// formula here: if the grant curve in index.html changes, this fails instead of silently
// testing a stale copy (it drifted once, on 2026-10-03, when the curve went 3->4 per level).
if (!/const totalPts=\(\)=>\{let p=10;for\(let l=2;l<=S\.lv;l\+\+\)p\+=4\+Math\.floor\(l\/5\);return p\}/.test(src))
  throw new Error('totalPts() grant curve changed in index.html - update the harness copy below it');

// v74: the live canUse() carries the class-tier gate (index.html, the st()/canUse() line). The
// harness copy below mirrors it, so pin the real shape here: if the gate moves or is reworded,
// this fails instead of letting the sweep tests below pass against a stale rule.
if (!/gearTierOK=\(it,cls=S\.cls\)=>gearTierOf\(it\)<=Math\.max\(1,classTierOf\(cls\)\)/.test(src) ||
    !/canUse=it=>gearTierOK\(it\)&&\(it\.slot==='off'\?canShield\(\)/.test(src))
  throw new Error('canUse()/gearTierOK() changed shape in index.html - update this harness copy');
if (!/function stowUnfit\(from\)\{/.test(src)) throw new Error('stowUnfit() disappeared from index.html');

const harness = `
${code}
const jobOf = () => S.jobs[S.cls] || (S.jobs[S.cls] = {jl:1, jx:0});
const totalPts = () => { let p = 10; for (let l = 2; l <= S.lv; l++) p += 4 + Math.floor(l/5); return p };
// v51 collection code reads safeCount() (defined earlier in index.html, outside the grab).
const safeCount = v => { const n = Number(v); return Number.isFinite(n) ? Math.max(0, Math.min(Number.MAX_SAFE_INTEGER, Math.floor(n))) : 0 };
const maxHp = () => Math.round((80 + S.lv*20 + S.st.vit*8) * CLASSES[S.cls].hp);
const canShield = () => /^(Novice|Swordman|Knight|Lord Knight|Acolyte|Priest|High Priest|Merchant|Blacksmith|Whitesmith)$/.test(S.cls);
const C = () => CLASSES[S.cls] || CLASSES.Novice;
const SKILLS = [{id:'aid',cls:['Novice']},{id:'hide',cls:['Thief','Assassin','Assassin Cross']},{id:'enb',cls:['Swordman','Knight','Lord Knight']}];
const log = () => {}, ui = () => {}, save = () => {}, addFloat = () => {}, pl = {x:0, z:0};
// v74: the live canUse() carries the class-tier gate (index.html, the st()/canUse() line). The
// harness must mirror it exactly or the sweep tests below would pass against a weaker rule, so
// the harness copy is only a copy: the real line is pinned by the check above the harness.
const gearTierOf = it => Math.max(0, Math.min(3, ((it && it.sec) | 0) || 0));
const classTierOf = (cls = S.cls) => Math.max(0, Math.min(3, (CLASSES[cls] && CLASSES[cls].tier) || 0));
// v74.1: the lowest band (sections 0 and 1) is shared by Novice and first jobs, hence max(1, ...)
const gearTierOK = (it, cls = S.cls) => gearTierOf(it) <= Math.max(1, classTierOf(cls));
const iname = it => (it.r ? '+' + it.r + ' ' : '') + it.name;
const canUse = it => gearTierOK(it) && (it.slot === 'off' ? canShield() : (it.slot !== 'weapon' || !it.wt || C().wt.includes(it.wt)));
this.__h = {changeClass, classBlock, playedClass, playedClasses, t3Total, collDmg, classRec, snapClass, equipRec, noviceRun, clearClassSkills, stowUnfit, canUse, gearTierOK, CLASSES,
            set S(v){S=v}, get S(){return S}};
`;
const sb = { console };
vm.createContext(sb); vm.runInContext(harness, sb);
const H = sb.__h;

const st = (o = {}) => Object.assign({str:1,agi:1,dex:1,luk:1,int:1,vit:1}, o);
const mk = (o = {}) => Object.assign({cls:'Novice', lv:1, exp:0, hp:100, pts:10, st:st(), jobs:{Novice:{jl:1,jx:0}},
  sk:{aid:1}, base:{}, inv:[], eq:{weapon:{id:1,slot:'weapon',wt:'dagger',name:'Novice Knife'},
  armor:null, head:null, off:null, leg:null, acc1:null, acc2:null}}, o);

let pass = 0, fail = 0;
const t = (n, f) => { try { f(); console.log('  ok   ' + n); pass++; } catch (e) { console.log('  FAIL ' + n + ' -> ' + e.message); fail++; } };
console.log('class change: restart on load, keep what you stepped away from\n');

t('Assassin jobs keep one Katar and stow a legacy off-hand weapon on promotion', () => {
  assert.deepStrictEqual(Array.from(H.CLASSES.Assassin.wt), ['katar']);
  assert.deepStrictEqual(Array.from(H.CLASSES['Assassin Cross'].wt), ['katar']);
  const katar={id:701,slot:'weapon',wt:'katar',name:'Katar'},oldDagger={id:702,slot:'weapon',wt:'dagger',name:'Old off-hand Dagger'};
  H.S=mk({cls:'Assassin',lv:100,jobs:{Novice:{jl:10,jx:0},Thief:{jl:40,jx:0},Assassin:{jl:50,jx:0}},
    eq:{weapon:katar,armor:null,head:null,off:oldDagger,leg:null,acc1:null,acc2:null}});
  H.changeClass('Assassin Cross');
  assert.strictEqual(H.S.eq.weapon.id,katar.id,'the Katar should remain equipped');
  assert.strictEqual(H.S.eq.off,null,'an off-hand weapon must be removed');
  assert.ok(H.S.inv.some(i=>i.id===oldDagger.id),'the old off-hand must be preserved in the bag');
});

t('new second and transcendent jobs preserve every stat and unspent point', () => {
  for(const [name,c] of Object.entries(H.CLASSES).filter(([,c])=>c.tier>=2)){
    const jobs={}; for(let n=c.par;n;n=H.CLASSES[n].par)jobs[n]={jl:50,jx:0};
    const stats=st({str:20,agi:17,dex:14,int:11,vit:8,luk:5});
    H.S=mk({cls:c.par,lv:60,exp:123,pts:7,st:stats,jobs});
    H.changeClass(name);
    assert.strictEqual(H.S.cls,name);
    assert.deepStrictEqual({...H.S.st},stats,name+' allocation changed');
    assert.strictEqual(H.S.pts,7);assert.strictEqual(H.S.lv,60);assert.strictEqual(H.S.exp,123);
    assert.strictEqual(H.S.jobs[name].jl,1);
  }
});
t('leaving Novice for a new first job still refunds the build', () => {
  H.S=mk({cls:'Novice',lv:10,st:st({str:10}),pts:2,jobs:{Novice:{jl:10,jx:0}}});
  H.changeClass('Mage');
  assert.deepStrictEqual(Object.values(H.S.st),[1,1,1,1,1,1]);assert.ok(H.S.pts>2);
});

t('the example: Assassin Cross 120/40 -> Novice -> Hunter 90 -> back to Cross = 120/40', () => {
  H.S = mk({cls:'Assassin Cross', lv:120, exp:5000, pts:3, st:st({str:60,agi:50,dex:30,vit:20,int:1,luk:30}), hp:4200,
    jobs:{Novice:{jl:10},Thief:{jl:40},Assassin:{jl:50},'Assassin Cross':{jl:40},Archer:{jl:50}}, sk:{aid:1,hide:7},
    eq:{weapon:{id:77,slot:'weapon',wt:'katar',name:'Katar'},armor:null,head:null,off:null,leg:null,acc1:null,acc2:null}});
  H.changeClass('Novice');
  assert.strictEqual(H.S.lv, 25, 'Novice should restart at Base Lv 25');
  assert.strictEqual(H.S.jobs.Novice.jl, 1, 'Novice job levels should be cleared');
  H.S.lv = 90; H.S.jobs.Novice.jl = 50; H.S.jobs.Novice.jx = 0;      // level the Novice up
  H.changeClass('Hunter');
  assert.strictEqual(H.S.lv, 90, 'Hunter should come in at Base Lv 90');
  assert.strictEqual(H.S.jobs.Hunter.jl, 1, 'Hunter must start with no job levels');
  assert.deepStrictEqual(Object.values(H.S.st), [1,1,1,1,1,1], 'Hunter stats should be fresh');
  H.changeClass('Novice');
  assert.strictEqual(H.S.lv, 25, 'second restart back to 25');
  H.S.jobs.Novice.jl = 10;                                            // re-earn the Novice gate
  H.changeClass('Assassin Cross');
  assert.strictEqual(H.S.lv, 120, 'Cross Base Lv not restored');
  assert.strictEqual(H.S.exp, 5000, 'Cross EXP not restored');
  assert.strictEqual(H.S.jobs['Assassin Cross'].jl, 40, 'Cross Job Lv not restored');
  assert.strictEqual(H.S.st.str, 60, 'Cross stats not restored');
  assert.strictEqual(H.S.pts, 3, 'Cross stat points not restored');
  assert.strictEqual(H.S.sk.hide, 7, 'Cross skills not restored');
  assert.strictEqual(H.S.eq.weapon.id, 77, 'Cross weapon not worn again');
});

t('you can also go back to the Hunter you left (90 base, 50 job)', () => {
  H.S = mk({cls:'Hunter', lv:90, jobs:{Novice:{jl:10},Archer:{jl:50},Hunter:{jl:50}}, st:st({dex:70,agi:40}), pts:12});
  H.changeClass('Novice');
  assert.strictEqual(H.S.lv, 25);
  H.S.jobs.Novice.jl = 10;
  H.changeClass('Hunter');
  assert.strictEqual(H.S.lv, 90, 'Hunter level lost');
  assert.strictEqual(H.S.jobs.Hunter.jl, 50, 'Hunter job level lost');
  assert.strictEqual(H.S.st.dex, 70, 'Hunter stats lost');
  assert.strictEqual(H.S.pts, 12, 'Hunter stat points lost');
});

t('restarting as Novice forgets the previous Novice run', () => {
  H.S = mk({cls:'Swordman', lv:60, jobs:{Novice:{jl:10},Swordman:{jl:40}}});
  H.changeClass('Novice'); H.S.lv = 88; H.S.jobs.Novice.jl = 44;
  H.changeClass('Swordman');
  H.S.jobs.Novice.jl = 10;
  H.changeClass('Novice');
  assert.strictEqual(H.S.lv, 25, 'Novice should always restart at 25');
  assert.strictEqual(H.S.jobs.Novice.jl, 1);
});

t('a Novice restart clears Novice job levels and skills but not other classes', () => {
  H.S = mk({cls:'Knight', lv:80, jobs:{Novice:{jl:10},Swordman:{jl:50},Knight:{jl:20}}, sk:{aid:1,enb:5}});
  H.changeClass('Novice');
  assert.strictEqual(H.S.jobs.Swordman.jl, 50, 'Swordman job level was wiped');
  assert.strictEqual(H.S.jobs.Knight.jl, 20, 'Knight job level was wiped');
  assert.strictEqual(H.S.sk.enb, 5, 'Swordman-line skill was wiped by a Novice restart');
  assert.strictEqual(H.S.jobs.Novice.jl, 1, 'Novice job level should be cleared');
});

t('loading a class you never played resets stats and refunds the points', () => {
  H.S = mk({cls:'Novice', lv:40, st:st({str:20,dex:12}), pts:0, jobs:{Novice:{jl:20}}});
  H.changeClass('Swordman');
  assert.deepStrictEqual(Object.values(H.S.st), [1,1,1,1,1,1]);
  let earned = 10; for (let l = 2; l <= 40; l++) earned += 4 + Math.floor(l/5);
  assert.strictEqual(H.S.pts, earned, 'points should be fully refunded');
  assert.strictEqual(H.S.lv, 40, 'no levels lost on switching');
});

t('the current class never resets itself', () => {
  H.S = mk({cls:'Novice', lv:40, jobs:{Novice:{jl:20}}});
  H.changeClass('Swordman');
  H.S.jobs.Swordman.jl = 30; H.S.st.str = 35; H.S.pts = 5;
  H.changeClass('Swordman');
  assert.strictEqual(H.S.jobs.Swordman.jl, 30, 'current class must not reset itself');
});

t('stepping away and loading again keeps that class as you left it', () => {
  H.S = mk({cls:'Novice', lv:40, jobs:{Novice:{jl:20}}});
  H.changeClass('Swordman'); H.S.jobs.Swordman.jl = 30; H.S.st.str = 35;
  H.changeClass('Novice'); H.S.jobs.Novice.jl = 10;
  H.changeClass('Swordman');
  assert.strictEqual(H.S.lv, 40, 'level kept');
  assert.strictEqual(H.S.jobs.Swordman.jl, 30, 'job level should be remembered');
  assert.strictEqual(H.S.st.str, 35, 'stats should be remembered');
});

t('gear your new class cannot use is stowed, and returns with the class', () => {
  H.S = mk({cls:'Mage', lv:50, jobs:{Novice:{jl:10},Mage:{jl:30}},
    eq:{weapon:{id:5,slot:'weapon',wt:'staff',name:'Staff'},armor:null,head:null,off:null,leg:null,acc1:null,acc2:null}});
  H.changeClass('Novice');
  assert.strictEqual(H.S.eq.weapon, null);
  assert.ok(H.S.inv.some(i => i.id === 5), 'staff should be in the bag');
  H.S.jobs.Novice.jl = 10;
  H.changeClass('Mage');
  assert.strictEqual(H.S.eq.weapon.id, 5, 'staff should come back with the class');
});

t('gear sold while away is not conjured back', () => {
  H.S = mk({cls:'Archer', lv:50, jobs:{Novice:{jl:10},Archer:{jl:30}},
    eq:{weapon:{id:9,slot:'weapon',wt:'bow',name:'Bow'},armor:null,head:null,off:null,leg:null,acc1:null,acc2:null}});
  H.changeClass('Novice');
  H.S.inv = H.S.inv.filter(i => String(i.id) !== '9');
  H.S.jobs.Novice.jl = 10;
  H.changeClass('Archer');
  assert.strictEqual(H.S.eq.weapon, null, 'sold bow was recreated');
});

t('no item duplication over repeated switches', () => {
  H.S = mk({cls:'Archer', lv:30, jobs:{Novice:{jl:10},Archer:{jl:20}},
    eq:{weapon:{id:9,slot:'weapon',wt:'bow',name:'Bow'},armor:null,head:null,off:null,leg:null,acc1:null,acc2:null}});
  for (let i = 0; i < 3; i++) { H.changeClass('Novice'); H.S.jobs.Novice.jl = 10; H.changeClass('Archer'); }
  const copies = [...H.S.inv, ...Object.values(H.S.eq).filter(Boolean)].filter(i => String(i.id) === '9');
  assert.strictEqual(copies.length, 1, 'duplicated (' + copies.length + ')');
});

t('a save with no records at all still works', () => {
  H.S = mk({cls:'Acolyte', lv:44, base:undefined, jobs:{Novice:{jl:10},Acolyte:{jl:20}}});
  H.changeClass('Novice');
  assert.strictEqual(H.S.lv, 25);
  H.S.jobs.Novice.jl = 10;
  H.changeClass('Acolyte');
  assert.strictEqual(H.S.lv, 44, 'level lost on a record-less save');
});


// ---- a played class must stay "played" even when its per-class record is gone ----
t('a career alone marks a class as played (saves from before S.base, and repaired saves)', () => {
  H.S = { cls: 'Thief', lv: 40, exp: 0, pts: 0, hp: 100, zeny: 0, inv: [], cards: [], pets: [], q: [],
          st: { str: 20, agi: 20, dex: 20, luk: 1, int: 1, vit: 1 }, eq: {},
          jobs: { Novice: { jl: 10, jx: 0 }, Thief: { jl: 30, jx: 0 }, Acolyte: { jl: 42, jx: 88 } }, base: {} };
  assert.ok(H.playedClass('Acolyte'), 'Job Lv 42 is proof the Acolyte was played');
  assert.ok(!H.playedClass('Knight'), 'a class with no job levels and no record is still unplayed');
  // switching back must not be forced through the Novice (which would drop Base Lv to 25)
  H.S.base.Acolyte = { lv: 40, exp: 0, pts: 0, hp: 100, st: { str: 20, agi: 20, dex: 20, luk: 1, int: 1, vit: 1 }, eq: null };
  H.changeClass('Acolyte');
  assert.strictEqual(H.S.cls, 'Acolyte');
  assert.strictEqual(H.S.lv, 40, 'Base Lv kept');
  assert.strictEqual(H.S.jobs.Acolyte.jl, 42, 'Job Lv kept');
  assert.strictEqual(H.S.st.str, 20, 'stats kept');
});

t('a record with no stored loadout keeps what you are wearing', () => {
  const sword = { id: 12, name: 'Saber', slot: 'weapon', wt: 'sword', tier: 2, val: 50 };
  H.S = { cls: 'Thief', lv: 30, exp: 0, pts: 0, hp: 100, zeny: 0, inv: [], cards: [], pets: [], q: [],
          st: { str: 20, agi: 1, dex: 1, luk: 1, int: 1, vit: 1 },
          eq: { weapon: sword, armor: null, head: null, off: null, leg: null, acc1: null, acc2: null },
          jobs: { Novice: { jl: 10, jx: 0 }, Thief: { jl: 20, jx: 0 }, Knight: { jl: 15, jx: 0 } },
          base: { Knight: { lv: 44, exp: 0, pts: 0, hp: 100, st: { str: 25, agi: 1, dex: 1, luk: 1, int: 1, vit: 1 }, eq: null } } };
  H.changeClass('Knight');
  assert.strictEqual(H.S.eq.weapon && H.S.eq.weapon.id, 12, 'an unknown loadout must not strip the character');
  assert.ok(!H.S.inv.some(i => i.id === 12), 'and must not bag the weapon either');
});

// ---- returning to a class you have already played (one click, no Novice reset) ----
t('a class you have played before is offered directly, from anywhere in the tree', () => {
  H.S = { cls: 'Thief', lv: 40, exp: 0, pts: 0, hp: 100, st: {}, eq: {}, jobs: { Novice: { jl: 10, jx: 0 }, Thief: { jl: 30, jx: 0 }, Knight: { jl: 22, jx: 0 } }, base: { Knight: { lv: 55, exp: 123, pts: 7, hp: 900, st: { str: 30, agi: 10, dex: 10, luk: 1, int: 1, vit: 20 }, eq: {} } } };
  assert.ok(H.playedClass('Knight'), 'Knight is in S.base, so it has been played');
  assert.strictEqual(H.classBlock('Knight'), '', 'a played class must not be blocked by the Novice gate');
});

t('a class you have never played is still gated', () => {
  H.S = { cls: 'Thief', lv: 40, exp: 0, pts: 0, hp: 100, st: {}, eq: {}, jobs: { Novice: { jl: 10, jx: 0 }, Thief: { jl: 30, jx: 0 } }, base: {} };
  assert.ok(!H.playedClass('Knight'));
  assert.ok(H.classBlock('Knight'), 'an unplayed class must stay gated');
  // with the parent gate satisfied but the wrong line current, the Novice reset is the gate
  H.S.cls = 'Thief'; H.S.jobs.Swordman = { jl: 50, jx: 0 };
  assert.strictEqual(H.classBlock('Knight'), 'Reset to Novice first', 'unplayed + wrong line = Novice first');
  // standing in the parent line, the promotion is free
  H.S.cls = 'Swordman';
  assert.strictEqual(H.classBlock('Knight'), '', 'the parent line may promote');
  // and a Novice may take any first job once its own job level allows it
  H.S.cls = 'Novice'; H.S.jobs.Novice.jl = 10;
  assert.strictEqual(H.classBlock('Thief'), '', 'the Novice may take a first job');
});

t('stepping back into a played class restores its stats, points and gear in one call', () => {
  const sword = { id: 7, name: 'Claymore', slot: 'weapon', wt: 'sword', tier: 2, val: 90 };
  H.S = { cls: 'Thief', lv: 40, exp: 5, pts: 3, hp: 100, zeny: 0, inv: [sword], cards: [], pets: [], q: [],
          st: { str: 20, agi: 20, dex: 20, luk: 1, int: 1, vit: 1 }, eq: { weapon: null },
          jobs: { Novice: { jl: 10, jx: 0 }, Thief: { jl: 30, jx: 0 }, Knight: { jl: 22, jx: 0 } },
          base: { Knight: { lv: 55, exp: 123, pts: 7, hp: 900, st: { str: 30, agi: 12, dex: 14, luk: 1, int: 1, vit: 20 }, eq: { weapon: 7 } } } };
  H.changeClass('Knight');
  assert.strictEqual(H.S.cls, 'Knight', 'one call switches class');
  assert.strictEqual(H.S.lv, 55, 'Base Lv comes back');
  assert.strictEqual(H.S.exp, 123, 'EXP comes back');
  assert.strictEqual(H.S.pts, 7, 'unspent stat points come back');
  assert.strictEqual(H.S.st.str, 30, 'stats come back');
  assert.strictEqual(H.S.jobs.Knight.jl, 22, 'job level is NOT reset - you are not re-levelling the job');
  assert.strictEqual(H.S.eq.weapon && H.S.eq.weapon.id, 7, 'the weapon it was wearing comes back out of the bag');
  H.changeClass('Thief');
  assert.strictEqual(H.S.lv, 40, 'and the class you walked away from kept its own Base Lv');
  assert.strictEqual(H.S.jobs.Thief.jl, 30, 'and its job level');
});

t('an unplayed class still starts a fresh build at your own Base Lv', () => {
  H.S = { cls: 'Novice', lv: 30, exp: 0, pts: 0, hp: 100, zeny: 0, inv: [], cards: [], pets: [], q: [],
          st: { str: 5, agi: 5, dex: 5, luk: 1, int: 1, vit: 1 }, eq: {},
          jobs: { Novice: { jl: 10, jx: 0 } }, base: {} };
  H.changeClass('Thief');
  assert.strictEqual(H.S.cls, 'Thief');
  assert.strictEqual(H.S.lv, 30, 'a new class carries on at your Base Lv');
  assert.strictEqual(H.S.jobs.Thief.jl, 1, 'and starts its job at level 1');
  assert.ok(H.S.pts > 0, 'stats are refunded for a new build');
});

// ---- the class-collection bonus (v51: +1% per transcendent class taken to Base 100+,
//      account-wide - the bonus belongs to the class, not to whatever is being played) ----
t('the collection counts transcendent classes that reached Base Lv 100+, account-wide', () => {
  H.S = mk();                                    // a fresh Novice at lv 1
  assert.strictEqual(H.playedClasses(), 0, 'Novice is not a transcendent class');
  H.S.base.Hunter = {lv:110};                    // tier-2 records never count
  H.S.base.Priest = {lv:120};
  assert.strictEqual(H.playedClasses(), 0, 'lower tiers never join the collection');
  H.S.cls = 'Lord Knight'; H.S.lv = 101;         // being on a 100+ transcendent class counts it
  assert.strictEqual(H.playedClasses(), 1);
  H.S.base['High Wizard'] = {lv:105};            // a 100+ transcendent record counts too
  assert.strictEqual(H.playedClasses(), 2, 'Lord Knight (current) + High Wizard (record)');
  H.S.cls = 'Novice'; H.S.lv = 1;                // v51: the bonus is account-wide and permanent
  assert.strictEqual(H.playedClasses(), 1, 'stepping down to a low-level class no longer clears it');
  assert.strictEqual(H.collDmg(), 1, 'the recorded High Wizard keeps paying its 1% from the bench');
});

t('a transcendent class below Base Lv 100 earns nothing', () => {
  H.S = mk({cls:'Lord Knight', lv:99, base:{}});
  assert.strictEqual(H.playedClasses(), 0, 'lv 99 is not rebirth yet');
  H.S.lv = 100;
  assert.strictEqual(H.playedClasses(), 1, 'lv 100 turns its own point on');
  H.S.base['Assassin Cross'] = {lv:98};
  assert.strictEqual(H.playedClasses(), 1, 'a record that never reached 100 stays out');
  H.S.base['Assassin Cross'] = {lv:100};
  assert.strictEqual(H.playedClasses(), 2);
});

t('the cap follows the class data, so classes added later join automatically', () => {
  H.S = mk();
  const t3 = Object.keys(H.CLASSES).filter(n => H.CLASSES[n].tier === 3);
  assert.strictEqual(t3.length, 6, 'there are 6 transcendent classes today');
  assert.strictEqual(H.t3Total(), 6, 'the denominator is derived, not hardcoded');
  H.S.cls = 'Novice'; H.S.lv = 150;
  H.S.base = {}; t3.forEach(n => H.S.base[n] = {lv:110});
  assert.strictEqual(H.playedClasses(), 6);
  assert.strictEqual(H.collDmg(), 6, 'the cap is 1% per transcendent class');
  H.S.base.Swordman = {lv:150};
  assert.strictEqual(H.playedClasses(), 6, 'lower tiers never inflate the count');
});

t('records made while playing grow the transcendent collection', () => {
  H.S = mk({cls:'Swordman', lv:101, jobs:{Novice:{jl:10,jx:0},Swordman:{jl:40,jx:0}}, base:{}});
  assert.strictEqual(H.playedClasses(), 0, 'no transcendent class in play yet');
  H.changeClass('Knight');
  assert.ok(H.S.base.Swordman, 'stepping away records the old class');
  assert.strictEqual(H.S.lv, 101, 'the new class carries on at your Base Lv');
  H.S.cls = 'Lord Knight';                        // ...then the transcendent run itself
  H.S.jobs['Lord Knight'] = {jl:50, jx:0};
  H.changeClass('Swordman');                      // played classes are always reachable
  assert.ok(H.S.base['Lord Knight'], 'the Lord Knight run was recorded on the way out');
  assert.strictEqual(H.playedClasses(), 1, 'the recorded Lord Knight counts; the Swordman back does not');
  assert.strictEqual(H.collDmg(), 1, 'the record carries lv 101, so the point is permanent');
});

t('v74: too-high class gear comes off on a class change, is locked, and is labelled with its wearer', () => {
  // The owner's report: "when you reach lv 100 players change classes, they still wear high level
  // equipment". A Lord Knight at Base Lv 120 stepping into a Novice must not keep wearing them.
  const sword = t => ({ id: 10 + t, slot: 'weapon', wt: 'sword', name: 'Tier ' + t, val: 10, sec: t });
  const armor = t => ({ id: 20 + t, slot: 'armor', name: 'Armor ' + t, val: 10, sec: t });
  const leg = t => ({ id: 30 + t, slot: 'leg', name: 'Leg ' + t, val: 10, sec: t });
  const eq = { weapon: sword(3), armor: armor(3), head: null, off: null, leg: leg(2), acc1: null, acc2: null };
  H.S = mk({ cls: 'Lord Knight', lv: 120, jobs: { 'Novice': { jl: 10, jx: 0 }, 'Lord Knight': { jl: 50, jx: 0 } },
    eq: Object.assign({}, eq), base: {} });
  const ids = { weapon: eq.weapon.id, armor: eq.armor.id, leg: eq.leg.id };
  H.changeClass('Novice');
  assert.strictEqual(H.S.eq.weapon, null, 'the tier-3 weapon comes off for a Novice');
  assert.strictEqual(H.S.eq.armor, null, 'and the tier-3 armor');
  assert.strictEqual(H.S.eq.leg, null, 'and the tier-2 legwear');
  for (const it of [eq.weapon, eq.armor, eq.leg]) {
    assert.ok(H.S.inv.some(x => x.id === it.id), it.name + ' must be in the Bag');
    assert.strictEqual(it.locked, true, it.name + ' must be auto-locked');
    assert.strictEqual(it.wearer, 'Lord Knight', it.name + ' must remember who was wearing it');
  }
  // no item is duplicated, and the departing class record still points at the same ids
  assert.deepStrictEqual(H.S.inv.map(x => x.id), Object.values(ids), 'each piece appears once');
  const left = H.S.base['Lord Knight'].eq;
  assert.deepStrictEqual({ weapon: left.weapon, armor: left.armor, leg: left.leg }, ids,
    'the loadout is stored on the class it left');
  assert.deepStrictEqual([left.head, left.off, left.acc1, left.acc2], [null, null, null, null], 'and the empty slots stay empty');
  // the tier ladder itself
  assert.ok(H.gearTierOK(sword(0), 'Novice'), 'starter gear fits anyone');
  assert.ok(H.gearTierOK(sword(1), 'Novice') && H.gearTierOK(sword(1), 'Swordman'), 'v74.1: Novice and 1st jobs share the low band');
  assert.ok(!H.gearTierOK(sword(2), 'Novice') && !H.gearTierOK(sword(2), 'Swordman'), '2nd-job gear needs a promotion');
  assert.ok(!H.gearTierOK(armor(2), 'Swordman') && H.gearTierOK(armor(2), 'Knight'), '2nd-job gear needs a promotion');
  assert.ok(!H.gearTierOK(armor(3), 'Knight') && H.gearTierOK(armor(3), 'Lord Knight'), 'high-tier gear needs a transcendent class');
  assert.strictEqual(H.gearTierOK(armor(3), 'Novice'), false);
  // switching back wears it all again - still locked, so auto-sell can never eat a stored loadout
  H.changeClass('Swordman');                       // a first job: sec 0 and 1 fit, sec 2/3 do not
  assert.strictEqual(H.S.eq.weapon, null, 'the Swordman still cannot wear tier-3 gear');
  assert.strictEqual(H.S.eq.leg, null, 'nor the tier-2 legwear');
  H.changeClass('Lord Knight');
  assert.strictEqual(H.S.eq.weapon.id, ids.weapon, 'the weapon is worn again on the way back');
  assert.strictEqual(H.S.eq.armor.id, ids.armor);
  assert.strictEqual(H.S.eq.leg.id, ids.leg);
  assert.strictEqual(H.S.inv.length, 0, 'the Bag is empty again: they were re-worn, not copied');
  assert.strictEqual(eq.weapon.locked, true, 'the lock stays, which is what keeps them safe');
  assert.strictEqual(eq.weapon.wearer, 'Lord Knight', 'the wearer label stays too');
});

t('v74: a piece the departing class could not legally wear gets no wearer label', () => {
  // Legacy saves can hold gear that was never legal (for example a Grand Cross-wearing Novice
  // from before the tier gate). The sweep still takes it off and locks it, but it must NOT
  // claim the Novice was its wearer, or the tooltip would lie.
  const high = { id: 41, slot: 'weapon', wt: 'sword', name: 'Unlawful Sword', val: 10, sec: 3 };
  H.S = mk({ cls: 'Novice', lv: 100, jobs: { Novice: { jl: 10, jx: 0 } },
    eq: { weapon: high, armor: null, head: null, off: null, leg: null, acc1: null, acc2: null } });
  H.changeClass('Swordman');
  assert.ok(H.S.inv.some(x => x.id === high.id) || H.S.eq.weapon === null, 'the piece is off the body');
  assert.notStrictEqual(high.wearer, 'Novice', 'the label must not blame a class that could never wear it');
  assert.strictEqual(high.locked, true, 'it is still locked');
});

t('the collection bonus is wired into atk(), and reads each class own Base Lv', () => {
  assert.ok(/const atk=\(\)=>[^\n]*\*\(1\+collDmg\(\)\/100\)\);/.test(src), 'atk() must carry the collection multiplier');
  assert.ok(/const collDmg=\(\)=>playedClasses\(\);/.test(src), 'v51: the bonus is account-wide, not gated on the active class');
  assert.ok(/const t3At100=n=>/.test(src), 'each transcendent class carries its own Base Lv 100 gate');
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
