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
const CV = [1,2,3,5], GI = [0,1,2,4], SECN = ['a','b','c','d'];
// load() repairs card values through cardVal(), which is inside the grabbed range and needs
// the stat weight tables. Those live above 'const CD=[' so they must be supplied here -
// without them a save that actually contains cards would crash the repair untested.
const AFF = ['str','agi','dex','luk','int','hp','atk','crit','aspd','flee','cdm'];
const AB = {str:1,agi:1,dex:1,luk:1,int:1,hp:12,atk:.8,crit:.45,aspd:.6,flee:.8,cdm:1.5};
const K5 = ['str','agi','dex','luk','int'];
const lsGet = () => ${JSON.stringify(JSON.stringify(save))};
const saveKey = () => 'k';
const newQuest = () => ({type:'kill', goal:1, prog:0, z:0, xp:0});
this.__l = {loadRaw};
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
  assert.strictEqual(byId(1).v, 60, 'a Legendary HP card should repair to 5*12, not the stale 5');
  assert.strictEqual(byId(2).v, 3, 'a Rare STR card should repair to CV[2]');
  assert.strictEqual(byId(3).v, 2, 'an unknown stat should fall back to CV[grade], not crash');
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

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
