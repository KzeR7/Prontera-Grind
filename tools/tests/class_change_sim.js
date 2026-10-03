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

const harness = `
${code}
const jobOf = () => S.jobs[S.cls] || (S.jobs[S.cls] = {jl:1, jx:0});
const totalPts = () => { let p = 10; for (let l = 2; l <= S.lv; l++) p += 4 + Math.floor(l/5); return p };
const maxHp = () => Math.round((80 + S.lv*20 + S.st.vit*8) * CLASSES[S.cls].hp);
const canShield = () => /^(Novice|Swordman|Knight|Lord Knight|Acolyte|Priest|High Priest|Merchant|Blacksmith|Whitesmith)$/.test(S.cls);
const dualOn = () => S.cls === 'Assassin' || S.cls === 'Assassin Cross';
const dualOk = it => dualOn() && (it.wt === 'dagger' || it.wt === 'katar');
const C = () => CLASSES[S.cls] || CLASSES.Novice;
const SKILLS = [{id:'aid',cls:['Novice']},{id:'hide',cls:['Thief','Assassin','Assassin Cross']},{id:'enb',cls:['Swordman','Knight','Lord Knight']}];
const log = () => {}, ui = () => {}, save = () => {}, addFloat = () => {}, pl = {x:0, z:0};
this.__h = {changeClass, classBlock, classRec, snapClass, equipRec, noviceRun, clearClassSkills,
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

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
