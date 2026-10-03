// Save/load: per-class build records (S.base) must survive a round trip, malformed
// ones must be dropped or repaired rather than crashing the game.
//   node tools/tests/save_load_sim.js
const fs = require('fs'), vm = require('vm'), assert = require('assert');
const src = fs.readFileSync(__dirname + '/../../index.html', 'utf8');
const grab = (a, b) => { const i = src.indexOf(a), j = src.indexOf(b, i); if (i < 0 || j < 0) throw new Error('missing ' + a); return src.slice(i, j); };
const body = src.slice(src.indexOf('function load(){try{') + 19, src.indexOf('}catch(e){}return fresh()') + 1);
const code = [grab('const CD=[', 'const fresh=()=>'), grab('const fresh=()=>', 'const saveKey='), 'function loadRaw(){' + body + '}'].join('\n');

const save = {pets:[], cls:'Swordman', sex:'m', hair:2, lv:60, exp:12345, hp:999, zeny:1e6, kills:9, pts:7, mp:2, lvl:4, kl:1,
  jobs:{Novice:{jl:10,jx:0},Swordman:{jl:40,jx:5}}, sk:{aid:1,swd:3,two:2},
  base:{
    Novice:{lv:12,exp:30,pts:22,hp:300,st:{str:9,agi:1,dex:1,luk:1,int:1,vit:5},eq:{weapon:1,armor:null,head:null,off:null,leg:null,acc1:null,acc2:null}},
    Swordman:{lv:60,exp:12345,pts:7,hp:999,st:{str:40,agi:20,dex:15,luk:1,int:1,vit:25},eq:{weapon:77,armor:78,head:null,off:79,leg:null,acc1:null,acc2:null}},
    BROKEN:'not an object',
    Mage:{lv:'abc',exp:null,pts:undefined,hp:null,st:{str:null},eq:'nope'}},
  prog:[1,1,1,1,1], auto:true, adv:true, q:null, cards:[], ore:{ori:3,elu:0}, gm:false, gmx:100,
  st:{str:40,agi:20,dex:15,luk:1,int:1,vit:25},
  eq:{weapon:{id:77,slot:'weapon',wt:'sword',name:'Cutlass',val:30,aff:[],slots:1,cards:[],sec:0,r:1},
      armor:null,head:null,off:null,leg:null,acc1:null,acc2:null},
  inv:[]};

const harness = `
${code}
const num_ = (v,d) => { v = +v; return Number.isFinite(v) ? v : d };
const CV = [1,2,3,5], GI = [0,1,2,4], SECN = ['a','b','c','d'];
const lsGet = () => ${JSON.stringify(JSON.stringify(save))};
const saveKey = () => 'k';
const newQuest = () => ({type:'kill', goal:1, prog:0, z:0, xp:0});
this.__l = {loadRaw};
`;
const sb = { console };
vm.createContext(sb); vm.runInContext(harness, sb);
const f = sb.__l.loadRaw();

let pass = 0, fail = 0;
const t = (n, fn) => { try { fn(); console.log('  ok   ' + n); pass++; } catch (e) { console.log('  FAIL ' + n + ' -> ' + e.message); fail++; } };
console.log('save/load round trip with per-class records\n');

t('valid records survive a save/load', () => {
  assert.strictEqual(f.base.Swordman.lv, 60);
  assert.strictEqual(f.base.Swordman.pts, 7);
  assert.strictEqual(f.base.Swordman.st.str, 40);
  assert.strictEqual(f.base.Swordman.eq.weapon, 77);
  assert.strictEqual(f.base.Novice.lv, 12);
});
t('a malformed record is dropped instead of crashing', () => { assert.strictEqual(f.base.BROKEN, undefined); });
t('a record with junk numbers is repaired', () => {
  const m = f.base.Mage; assert.ok(m, 'record dropped');
  assert.strictEqual(m.lv, 1); assert.strictEqual(m.exp, 0);
  assert.strictEqual(m.pts, 0); assert.strictEqual(m.st.str, 1);
});
t('the live game state is untouched by the repair', () => {
  assert.strictEqual(f.lv, 60); assert.strictEqual(f.cls, 'Swordman');
  assert.strictEqual(f.jobs.Swordman.jl, 40);
  assert.strictEqual(f.base.Swordman.hp, 999);
  assert.strictEqual(f.eq.weapon.r, 1);
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
