// Save/load: per-class build records (S.base) must survive a round trip, malformed
// ones must be dropped or repaired rather than crashing the game.
//   node tools/tests/save_load_sim.js
const fs = require('fs'), vm = require('vm'), assert = require('assert');
const src = fs.readFileSync(__dirname + '/../../index.html', 'utf8');
const grab = (a, b) => { const i = src.indexOf(a), j = src.indexOf(b, i); if (i < 0 || j < 0) throw new Error('missing ' + a); return src.slice(i, j); };
const body = src.slice(src.indexOf('function load(){try{') + 19, src.indexOf('}catch(e){}return fresh()') + 1);
// Arena geometry (BX_/Z0/Z1/MPS/AGGRO) is pulled straight from index.html instead of being
// stubbed: the 'const fresh=()=>' span happens to include pl's declaration, and pl's spawn
// point is written as Z1-1.5. Hardcoding the field size here would silently drift from the
// real one, and the vertical-arena check below reads the same constants.
const arena = grab('const SU=k=>', ',K5=[') + ';';
const code = [arena, grab('const CD=[', 'const fresh=()=>'), grab('const fresh=()=>', 'const saveKey='), 'function loadRaw(){' + body + '}'].join('\n');

const save = {pets:[
    {id:1,sp:0,on:true,eq:[1,2,3],skills:['warcry','spiritbolt']},
    {id:2,sp:1,on:undefined,eq:null,skills:['removed-skill','vital']},
    {id:3,sp:3,on:false,eq:[99,-1,'not-a-number'],skill:'arcane'}
  ], cls:'Swordman', sex:'m', hair:2, lv:60, exp:12345, hp:999, zeny:1e6, kills:9, pts:7, mp:2, lvl:4, kl:1,
  jobs:{Novice:{jl:10,jx:0},Swordman:{jl:40,jx:5}}, sk:{aid:1,swd:3,two:2},
  base:{
    Novice:{lv:12,exp:30,pts:22,hp:300,st:{str:9,agi:1,dex:1,luk:1,int:1,vit:5},eq:{weapon:1,armor:null,head:null,off:null,leg:null,acc1:null,acc2:null}},
    Swordman:{lv:60,exp:12345,pts:7,hp:999,st:{str:40,agi:20,dex:15,luk:1,int:1,vit:25},eq:{weapon:77,armor:78,head:null,off:79,leg:null,acc1:null,acc2:null}},
    BROKEN:'not an object',
    Mage:{lv:'abc',exp:null,pts:undefined,hp:null,st:{str:null},eq:'nope'}},
  prog:[1,1,1,1,1], auto:true, adv:true, q:null, ore:{ori:3,elu:0}, gm:false, gmx:100,
  cards:[{id:1,n:'Poring Card',g:3,stat:'hp',v:5},{id:2,n:'Fabre Card',g:2,stat:'str',v:999},{id:3,n:'Junk Card',g:1,stat:'nope',v:null}],
  st:{str:40,agi:20,dex:15,luk:1,int:1,vit:25},
  eq:{weapon:{id:77,slot:'weapon',wt:'sword',name:'Cutlass',val:30,aff:[],slots:1,cards:[],sec:0,r:1},
      armor:null,head:null,off:null,leg:null,acc1:null,acc2:null},
  inv:[]};

const harness = `
${code}
const num_ = (v,d) => { v = +v; return Number.isFinite(v) ? v : d };
const CV = [3.2,6.4,9.6,16], GI = [0,1,2,4], SECN = ['a','b','c','d'];
// load() repairs card values through cardVal(), which is inside the grabbed range and needs
// the stat weight tables. Those live above 'const CD=[' so they must be supplied here -
// without them a save that actually contains cards would crash the repair untested.
const AFF = ['str','agi','dex','luk','int','hp','atk','crit','aspd','flee','cdm'];
const AB = {str:1,agi:1,dex:1,luk:1,int:1,hp:12,atk:.8,crit:.45,aspd:.6,flee:.8,cdm:.7};
const K5 = ['str','agi','dex','luk','int'];
let RAW = ${JSON.stringify(JSON.stringify(save))};
const lsGet = () => RAW;
const saveKey = () => 'k';
const newQuest = () => ({type:'kill', goal:1, prog:0, z:0, xp:0});
this.__l = {loadRaw, setRaw: v => { RAW = JSON.stringify(v) }};
`;
const sb = { console };
vm.createContext(sb); vm.runInContext(harness, sb);
const f = sb.__l.loadRaw();
const load = () => sb.__l.loadRaw();
// act()/pas()/tos() build most skills, but First Aid is an inline object literal
const SRC_SKILL_IDS = new Set([
  ...[...src.matchAll(/(?:act|pas|tos)\('([a-zA-Z]+)'/g)].map(m => m[1]),
  ...[...src.matchAll(/\{id:'([a-zA-Z]+)',n:'/g)].map(m => m[1]),
]);
assert.ok(SRC_SKILL_IDS.has('aid'), 'the id extraction missed First Aid');

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
t('pet upgrade levels and valid gacha skills survive load, while junk is normalized', () => {
  const p=id=>f.pets.find(x=>x.id===id);
  assert.deepStrictEqual(Array.from(p(1).eq),[1,2,3],'valid Claw/Collar/Charm upgrade levels must persist');
  assert.deepStrictEqual(Array.from(p(1).skills),['warcry','spiritbolt'],'both skill slots must persist');
  assert.deepStrictEqual(Array.from(p(2).eq),[0,0,0],'a missing upgrade array should default to zero levels');
  assert.deepStrictEqual(Array.from(p(2).skills),['vital'],'a removed skill id must be dropped, the valid one kept');
  assert.deepStrictEqual(Array.from(p(3).eq),[5,0,0],'upgrade levels must clamp to 0..MAX and repair non-numbers');
  assert.deepStrictEqual(Array.from(p(3).skills),['arcane'],'an old single p.skill save must migrate into slot 1');
  assert.strictEqual(Object.keys(p(1)).includes('skill'),false,'the old single-slot field is retired after migration');
  assert.strictEqual(p(2).on,true,'legacy pets default to battle-ready for the first three slots');
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

t('card values are repaired per stat, not flattened to CV[grade]', () => {
  const byId = id => f.cards.find(c => c.id === id);
  assert.strictEqual(byId(1).v, 192, 'a Legendary HP card should repair to 16*12, not the stale 5');
  assert.strictEqual(byId(2).v, 10, 'a Rare STR card should repair to round(CV[2]) = 10');
  assert.strictEqual(byId(3).v, 6, 'an unknown stat should fall back to round(CV[grade 1]) = 6, not crash');
});

t('skills that no longer exist are dropped, refunding their points', () => {
  // the fixture carries sk:{aid:1,swd:3,two:2} and neither 'swd' nor 'two' is a real skill id.
  // Five skills were renamed or removed outright (Throw Stone, Rolling Cutter, Adoramus,
  // Charged Arrow, Head Crush); without this repair the points spent on them would vanish
  // into an entry no panel renders, so the player would be short with nothing to show for it.
  const f2 = load();
  assert.strictEqual(f2.sk.aid, 1, 'First Aid should survive');
  assert.ok(!('swd' in f2.sk), 'an orphaned skill id was kept');
  assert.ok(!('two' in f2.sk), 'an orphaned skill id was kept');
  const kept = Object.keys(f2.sk);
  assert.ok(kept.every(id => SRC_SKILL_IDS.has(id)), 'a non-skill id survived: ' + kept);
});

t('the field is roamed, not marched back to the spawn point', () => {
  // with no mobs the character wanders; only a defeat returns it to the entrance
  assert.ok(/pl=\{x:0,z:Z1-1\.5,ry:0,orb:0,run:0,wt:0,wx:0,wz:Z1-1\.5\}/.test(src),
    'pl lost its roam target fields');
  assert.ok(/if\(!mobs\.length\)\{respawn-=dt;if\(respawn<=0\)spawn\(\);/.test(src),
    'the empty-field branch changed shape');
  assert.ok(/tx=pl\.wx;tz=pl\.wz/.test(src), 'the roam target is not fed into movement');
  // the 'let tx=0,tz=Z1-1.5' default is fine: both branches overwrite it before it is used
  assert.ok(/tx=pl\.wx;tz=pl\.wz\}/.test(src), 'the roam target does not close the empty-field branch');
  // and defeat really does put you back at the entrance
  assert.ok(/pl\.x=0;pl\.z=Z1-1\.5;pl\.wt=0;/.test(src), 'defeat no longer resets the position');
  assert.ok(/S\.hp<=0[\s\S]{0,220}pl\.x=0;pl\.z=Z1-1\.5/.test(src),
    'the position reset is not inside the defeat handler');
});

t('a boss stage keeps the roam by the boss, the field keeps roaming wide', () => {
  // v36: stage 10 used the same field-wide roam as the farming maps, so when a wave spawned
  // the character was often at the far corner and the pack had to walk the whole arena to
  // reach them. The boss stage now roams a ring around the boss spawn.
  const roam = grab('    pl.wt-=dt;if(pl.wt<=0||Math.hypot(pl.x-pl.wx,pl.z-pl.wz)<1.2){pl.wt=rnd(2.2,4.5);',
                    '    tx=pl.wx;tz=pl.wz}') + '    tx=pl.wx;tz=pl.wz;';
  const arenaLine = src.match(/const SU=k=>k\.toUpperCase\(\),BX_=[^;]+;/)[0];
  const arenaBox = {};
  vm.createContext(arenaBox);
  vm.runInContext(arenaLine + ';this.__a={BX_,Z0,Z1,BOSSZ,BOSS_NEAR,BOSS_FAR};', arenaBox);
  const { BX_, Z0, Z1, BOSSZ, BOSS_NEAR, BOSS_FAR } = arenaBox.__a;
  const sample = boss => {
    const box = {};
    vm.createContext(box);
    vm.runInContext(`
      ${arenaLine}
      let pl={x:0,z:Z1-1.5,wt:0,wx:0,wz:Z1-1.5},mobs=[],respawn=1,dt=1/60,tx=0,tz=0;
      const isBoss=()=>${boss},rnd=(a,b)=>a+Math.random()*(b-a),cl=(v,a,b)=>Math.max(a,Math.min(b,v)),spawn=()=>{};
      this.__step=()=>{ ${roam} return [tx,tz] };
      this.__pl=pl;
    `, box);
    let minD = Infinity, maxD = 0, maxAbsX = 0;
    for (let i = 0; i < 400; i++) {
      box.__pl.wt = -1;                 // force a fresh spot every iteration, as the timer would
      const [x, z] = box.__step();
      minD = Math.min(minD, Math.hypot(x, z - BOSSZ));
      maxD = Math.max(maxD, Math.hypot(x, z - BOSSZ));
      maxAbsX = Math.max(maxAbsX, Math.abs(x));
      assert.ok(Math.abs(x) <= BX_ - 0.8 + 1e-9 && z >= Z0 + 3 - 1e-9 && z <= Z1 - 0.8 + 1e-9,
        'roam target left the arena: ' + x + ',' + z);
    }
    return { minD, maxD, maxAbsX };
  };
  const boss = sample('true');
  assert.ok(boss.minD >= BOSS_NEAR - 1e-9, 'boss roam must not stand inside the boss: ' + boss.minD);
  assert.ok(boss.maxD <= BOSS_FAR + 1e-9, 'boss roam must stay near the boss, not across the field: ' + boss.maxD);
  assert.ok(boss.maxD < 6.5, 'boss roam must stay inside the 6.5 aggro range');
  console.log('       boss roam ' + boss.minD.toFixed(1) + '-' + boss.maxD.toFixed(1) + ' units from the boss');
  const field = sample('false');
  assert.ok(field.maxAbsX > 9, 'farming maps must still roam the whole field: ' + field.maxAbsX);
});

t('a save carrying more skill levels than its line earned is repaired on load', () => {
  // The v35 shop minted points (it charged an escalating ladder but kept its ledger in levels),
  // so an old save can hold levels its line never paid for. load() has to trim them instead of
  // leaving the Skills panel clamped at "0 available" for ever. The ids come from the real
  // roster, so this cannot drift when a skill is renamed.
  const roster = {};
  vm.createContext(roster);
  vm.runInContext(grab('const CD=[', 'const pm=s=>') +
    'this.__r={SKILLS,lineOf:cls=>{const a=[];for(let n=cls;n;n=CLASSES[n].par)a.unshift(n);return a}};', roster);
  const R = roster.__r, line = R.lineOf('Swordman');
  const ids = R.SKILLS.filter(s => line.includes(s.from)).map(s => s.id);
  assert.ok(ids.length >= 4, 'the Swordman line should own several skills: ' + ids.join(','));
  const sk = { aid: 5 }; ids.forEach(id => { sk[id] = 5 });
  const owned = Object.values(sk).reduce((a, n) => a + n, 0);
  const jobs = { Novice: { jl: 10, jx: 0 }, Swordman: { jl: 1, jx: 0 } };   // 9 earned, 0 on the Swordman
  const bad = JSON.parse(JSON.stringify(save));
  bad.cls = 'Swordman'; bad.jobs = jobs; bad.sk = sk; bad.base = {};
  const box = {};
  vm.createContext(box);
  vm.runInContext(harness.replace(/const lsGet = \(\) => .*?;/, 'const lsGet = () => ' + JSON.stringify(JSON.stringify(bad)) + ';'), box);
  const g = box.__l.loadRaw();
  const left = R.SKILLS.filter(s => line.includes(s.from)).reduce((a, s) => a + Math.max(0, Math.floor(g.sk[s.id] || 0)), 0);
  const earned = 9 + 0;                                        // Novice 10 + Swordman 1
  assert.ok(left <= earned + 1, 'the line is still over-spent after load: ' + left + ' levels of ' + (earned + 1));
  assert.strictEqual(g.skRepair, owned - left, 'the repair must report exactly the levels it removed');
  assert.ok(g.skRepair > 0, 'this fixture really is over-spent (nothing was trimmed)');
  // and every surviving level is a legal one
  for (const s of R.SKILLS) { const L = g.sk[s.id]; if (L !== undefined) assert.ok(L >= 0 && L <= s.max, s.id + ' kept an illegal level ' + L); }
  // a clean save is left completely alone
  const box2 = {};
  vm.createContext(box2);
  vm.runInContext(harness, box2);
  assert.ok(!box2.__l.loadRaw().skRepair, 'a healthy save must not be touched by the repair');
});

t('mob HP scales gently enough that early maps fall to a first job', () => {
  // HP = HPK * mb * pw^HPE. At 1.85 a correctly-levelled character needed 26-102s per mob
  // from Geffen onward; 1.3 brings that to roughly 1-10s while leaving bosses a real fight.
  const k = Number(src.match(/HPK=(\d+(?:\.\d+)?)/)[1]);
  const e = Number(src.match(/HPE=(\d+(?:\.\d+)?)/)[1]);
  assert.ok(e <= 1.45, `HP exponent ${e} outruns player ATK again (ATK is ~linear in level)`);
  assert.ok(e >= 1.05, `HP exponent ${e} leaves no difficulty curve across maps`);
  const hp = (mp, l) => Math.floor(k * (1 + mp * .15 + Math.max(0, mp - 4) * .2) * Math.pow(l, e));
  // Prontera is the novice farm; Payon is the last first-job map. Both must be cheap.
  const prontera = hp(0, 0 + 1), payon = hp(4, 43 + 1);
  assert.ok(prontera < 200, 'Prontera field 1 mob has ' + prontera + ' HP');
  assert.ok(payon < 20000, 'Payon field 1 mob has ' + payon + ' HP - not a first-job farm');
  // the boss stays roughly 12x a mob so it still reads as a boss
  const boss = Math.floor(500 * (1 + 4 * .15) * Math.pow(43 + 10, e));
  assert.ok(boss / hp(4, 53) > 8 && boss / hp(4, 53) < 16, 'boss HP is no longer ~12x a mob');
  console.log('       HPK=' + k + ' HPE=' + e + ' | Prontera f1 ' + prontera +
              ' HP | Payon f1 ' + payon + ' HP | Payon boss ' + boss + ' HP');
});

t('the arena really is vertical: mobs hold the far end, the player the near end', () => {
  const z0 = Number(src.match(/Z0=(-?\d+(?:\.\d+)?)/)[1]), z1 = Number(src.match(/Z1=(-?\d+(?:\.\d+)?)/)[1]);
  assert.ok(z1 - z0 >= 14, `the field is only ${z1 - z0} deep - not the long vertical avenue`);
  assert.ok(z0 < 0 && z1 > 0, 'the field should straddle the origin');
  // the camera sits on +Z looking toward -Z, so low Z is the TOP of the screen
  assert.ok(/function packSites\(\)/.test(src) && /nearestPack\(\)/.test(src), 'the random closest-pack route is missing');
  assert.ok(/pl=\{x:0,z:Z1-1\.5/.test(src), 'the player no longer starts at the near (bottom) end');
  console.log('       field depth ' + (z1 - z0) + ' units; player at Z1-1.5, three randomized packs across the arena');
});

t('the v39 tool settings repair: old saves get the quiet defaults', () => {
  // a save written before v39 knows none of the four fields
  sb.__l.setRaw({ lv: 5, cls: 'Novice', sk: { aid: 1 }, jobs: { Novice: { jl: 1, jx: 0 } } });
  const g = load();
  assert.strictEqual(g.feed, true, 'the on-screen log starts unfolded');
  assert.strictEqual(g.clickSell, false, 'a bag click inspects - it never sells - by default');
  assert.deepStrictEqual(Array.from(g.autoSell), [false, false, false, false, false], 'nothing is auto-sold');
  assert.deepStrictEqual(Object.keys(g.logOff), [], 'every log filter starts ticked');
  // junk of every shape must be repaired, not carried
  sb.__l.setRaw({ lv: 5, cls: 'Novice', sk: { aid: 1 }, jobs: { Novice: { jl: 1, jx: 0 } },
    feed: 'no', clickSell: 'yes', autoSell: 'junk', logOff: [] });
  const r = load();
  assert.strictEqual(r.feed, true, 'a junk fold flag falls back to open');
  assert.strictEqual(r.clickSell, false, 'a junk click-sell flag falls back to off');
  assert.deepStrictEqual(Array.from(r.autoSell), [false, false, false, false, false], 'a junk auto-sell list falls back to nothing ticked');
  assert.deepStrictEqual(Object.keys(r.logOff), [], 'a junk filter list falls back to an empty object');
  // and deliberate choices survive the round trip, index by index
  sb.__l.setRaw({ lv: 5, cls: 'Novice', sk: { aid: 1 }, jobs: { Novice: { jl: 1, jx: 0 } },
    feed: false, clickSell: true, autoSell: [1, 0, 'x', null, 1], logOff: { gear: 1 } });
  const k = load();
  assert.strictEqual(k.feed, false, 'a deliberately folded log stays folded');
  assert.strictEqual(k.clickSell, true, 'a deliberately armed click-sell stays armed');
  assert.deepStrictEqual(Array.from(k.autoSell), [true, false, false, false, true], 'every tick is read as a boolean, position by position');
  assert.deepStrictEqual(Object.keys(k.logOff), ['gear'], 'a switched-off filter survives');
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
