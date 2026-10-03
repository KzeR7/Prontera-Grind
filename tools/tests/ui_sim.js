// UI smoke: the panels actually render, with a real state, without throwing.
//   node tools/tests/ui_sim.js
//
// The rules being tested:
//   * every tab panel (map / status / job / skills / equip / cards / refine / pet / quest ...)
//     builds its HTML from a real save shape without throwing and without printing "undefined";
//   * the map panel lists every map and every field, so adding a map cannot silently vanish;
//   * clicking a slot produces a chooser whose list is exactly the equippable items;
//   * every data-a="..." action a panel can emit is a key in ACT - a typo there is a dead button
//     (a previous build shipped one: the GM panel's action was never wired).
//
// This runs the REAL V.* renderers pulled out of index.html, not a copy of them.
const fs = require('fs'), vm = require('vm'), assert = require('assert');
const src = fs.readFileSync(__dirname + '/../../index.html', 'utf8');
const grab = (a, b) => { const i = src.indexOf(a), j = src.indexOf(b, i); if (i < 0 || j < 0) throw new Error('missing ' + a); return src.slice(i, j); };
const pick = (re, name) => { const m = src.match(re); if (!m) throw new Error('cannot find ' + name); return m[0]; };

// ---- static: every action a panel emits must exist in ACT --------------------
const actions = new Set([...src.matchAll(/data-a="([a-z_]+)"/g)].map(m => m[1]));
const actBlock = grab('const ACT={', "const tip=$('tooltip');");
const wired = new Set([...actBlock.matchAll(/(?:^|[\s,{])([a-z_]+):/gm)].map(m => m[1]));
const missing = [...actions].filter(a => !wired.has(a));

let pass = 0, fail = 0;
const t = (n, f) => { try { f(); console.log('  ok   ' + n); pass++; } catch (e) { console.log('  FAIL ' + n + ' -> ' + e.message); fail++; } };
console.log('ui: panels render, buttons are wired\n');

t('no panel emits an action that ACT does not define', () => {
  assert.deepStrictEqual(missing, [], 'unwired actions: ' + missing.join(', '));
  console.log('       ' + actions.size + ' actions, all wired');
});

// ---- the renderers ----------------------------------------------------------
const code = [
  grab('const CD=[', 'const pm=s=>'),                       // classes + skills
  pick(/const C=\(\)=>[^;]+;/, 'C()'),
  pick(/const st=k=>[^\n]*canUse=it=>[^;]+;/, 'canUse'),
  pick(/const maxHp=\(\)=>[^\n]*/, 'maxHp'),
  pick(/const atk=\(\)=>[^\n]*/, 'atk'),
  pick(/const aspd=\(\)=>[^\n]*/, 'aspd'),
  grab('const pm=s=>', 'const pw=()=>'),          // maps + their REC bands
  pick(/const secOf=[^;]+;/, 'secOf'),
  pick(/const AM=\[[^\]]*\],GRADE=\[[^\]]*\],GI=\[[^\]]*\],CV=\[[^\]]*\];/, 'rarity tables'),
  pick(/const AFF=\[[^\]]*\],AB=\{[^}]*\};/, 'AFF/AB'),
  pick(/K5=\[[^\]]*\];/, 'K5'),
  pick(/const cardVal=\(g,st\)=>[^;]+;/, 'cardVal'),
  pick(/const cardStat=\(g,seed\)=>\{[^}]*\};/, 'cardStat'),
  pick(/const SU=k=>[^,]+/, 'SU'),
  grab('const ARM=[', 'const dropTxt='),
  pick(/const WICON=\{[^}]*\},ORE=\{[^}]*\},SECN=\[[^\]]*\];/, 'WICON/ORE/SECN'),
  pick(/const cell=\(it,sel,extra=''\)=>[^\n]*/, 'cell'),
  pick(/const STATS=\[[\s\S]*?\];/, 'STATS'),
  pick(/const SKSLOTS=t=>[^;]+;/, 'SKSLOTS/SKFADE'),
  pick(/const tnode=n=>[^\n]*/, 'tnode'),
  pick(/const crit=\(\)=>[^\n]*/, 'crit/flee/missCh'),
  pick(/const def=\(\)=>[^\n]*/, 'def/mdef/critD/needAt/need/cost'),
  pick(/const totalPts=\(\)=>[^\n]*/, 'totalPts/rcost'),
  grab('function playedClass(n){', 'function changeClass(n){'),
  pick(/const dropTxt=[^;]+;/, 'dropTxt'),
  grab('function canShield(){', 'function ekey(it)'),
  grab('function slotAccepts(k,it){', 'function equipChooser(k){'),
  grab('function equipChooser(k){', 'function equipIn(k,id){'),
  grab('function itemMain(it){', 'const cardSlots='),

  pick(/const cardSlots=[^\n]*/, 'cardSlots'),
  grab('function insertUI(sel){', 'function renderWin(){'),
  pick(/function refineUI\(it,k\)\{const[^\n]*/, 'refineUI'),
  pick(/const icon=it=>[^;]+;/, 'icon'),
  pick(/const items=\(\)=>[^\n]*/, 'items/ev/iname/eqv'),
  pick(/const refCost=it=>[^;]+;/, 'refCost/refCh'),
  pick(/const affTxt=a=>[^;]+;/, 'affTxt/cardTxt/dtier'),
  grab('const V={', 'const ACT={'),                            // the panels themselves
].join('\n');

const harness = `
// stubs the pulled-in code needs at load time and when a panel renders
const SLOTS={weapon:{label:'Weapon',stat:'ATK',ic:'sw'},armor:{label:'Armor',stat:'DEF',ic:'ar'},head:{label:'Headgear',stat:'HP',ic:'hd'},off:{label:'Shield',stat:'DEF',ic:'sh'},leg:{label:'Legwear',stat:'DEF',ic:'lg'},acc:{label:'Accessory',stat:'HP',ic:'ac'}};
const RAR=[{n:'Common',m:1,w:60},{n:'Fine',m:1.35,w:25},{n:'Rare',m:1.9,w:10},{n:'Epic',m:2.8,w:4},{n:'Legendary',m:4.5,w:1}];
const PW=[[90,9,1,0],[80,17,3,0],[70,24,5.5,.5],[60,30,9,1],[50,35,13,2],[40,38,18,4],[30,40,24,6],[22,40,30,8],[12,38,38,12],[5,30,45,20]],RN=['Cute','Cool','Rare','Epic','Legend'];
const MAXST=99,ELITELV=100,Z0=-14;
const statCap=()=>99,selK=null,gp=()=>null,classRec=()=>null,tb={};
const skCost=x=>x,skOff=()=>true;
let S=null,mapM=0,mapL=1,selB=null,selC=null;   // selE/selS/selP/qOpen/eqPick come in with the V grab
const mobs=[],drops=[],logs=[];
const $=id=>({style:{},set innerHTML(v){globalThis['h_'+id]=v},get innerHTML(){return globalThis['h_'+id]||''},textContent:'',onclick:null});
const dr=()=>1;
${code}
const skpAvail=()=>5,skLine=()=>['Novice'],skEarned=()=>9,skSpent=()=>0,pv=()=>0,bon=()=>0,qTxt=q=>'quest';
this.__u={ V, set S(v){S=v}, get S(){return S}, set eqPick(v){eqPick=v}, get eqPick(){return eqPick},
           set mapM(v){mapM=v}, set mapL(v){mapL=v}, set selE(v){selE=v}, set selS(v){selS=v} };
`;
const sb = { console };
vm.createContext(sb); vm.runInContext(harness, sb);
const U = sb.__u;

const sword = { id: 1, name: 'Claymore', tier: 2, slot: 'weapon', wt: 'sword', val: 90, r: 3, sec: 1, cards: [] };
const armor = { id: 2, name: 'Chain Mail', tier: 2, slot: 'armor', val: 50, r: 0, sec: 1, cards: [] };
const ring = { id: 3, name: 'Silver Ring', tier: 2, slot: 'acc', val: 20, r: 0, sec: 1, cards: [] };
const card = { id: 4, n: 'Poring Card', stat: 'str', g: 1, v: 3, card: true };
const mkS = (cls) => ({
  cls, lv: 60, exp: 0, hp: 900, zeny: 5000, pts: 3, kills: 10, mp: 0, lvl: 5, kl: 3, gmx: 100, gm: false,
  st: { str: 30, agi: 20, dex: 20, luk: 5, int: 5, vit: 20 }, sk: { aid: 1 }, skOff: {}, jobs: { [cls]: { jl: 30, jx: 0 }, Novice: { jl: 10, jx: 0 } }, base: {},
  eq: { head: null, weapon: sword, armor, off: null, acc1: ring, leg: null, acc2: null },
  inv: [armor, ring, { id: 9, name: 'Broad Sword', tier: 2, slot: 'weapon', wt: 'sword', val: 70, r: 0, sec: 1, cards: [] }], cards: [card], pets: [], ore: { ori: 2, elu: 1 }, prog: [1, 1, 1, 10, 10, 5, 3, 1, 1, 1],
  q: [], kills_: 0, buff: 0, auto: true,
});

t('the map panel renders every map and field', () => {
  U.S = mkS('Novice');
  for (const m of [0, 4, 9]) { U.mapM = m; U.mapL = 10;
    const h = U.V.map();
    const u = h.match(/.{0,50}undefined.{0,50}/);
    assert.ok(!u, 'map panel printed "undefined" on map ' + m + (u ? ': ' + u[0] : ''));
    [1, 5, 10].forEach(l => { U.mapL = l; const x = U.V.map(); assert.ok(!/undefined/.test(x), 'map ' + m + ' Lv' + l + ' printed undefined'); });
  }
  U.mapM = 0; U.mapL = 1;
  const h = U.V.map();
  assert.ok(h.includes('Prontera') && h.includes('Abyss'), 'every map must be listed');
  assert.ok(h.includes('Gear that drops here') && h.includes('Short Sword'), 'the field must name its gear');
  assert.ok(h.includes('mapcard'), 'the map selector must be the scalable grid');
  assert.strictEqual((h.match(/class="mapcard/g) || []).length, 10, 'one card per map');
  assert.strictEqual((h.match(/class="map-node/g) || []).length, 10, 'one node per field');
});

t('the map tab is a wide two-band panel: maps on top, that map\'s fields under them', () => {
  U.S = mkS('Knight'); U.mapM = 7; U.mapL = 4;   // Amatsu, a level 60+ map
  const h = U.V.map();
  // the map window is the wide one, so the panel gets the room to be horizontal
  assert.ok(/class="win wp\$\{k==='map'\?' wide':''\}"/.test(src), 'the map window must carry the wide class');
  // ordering: map cards, then the field band, then the drop tables - so clicking a map shows its
  // fields immediately below it instead of making the player scroll past the tables to find them
  const iCards = h.indexOf('class="mapgrid'), iFields = h.indexOf('class="mapband fields'),
        iCols = h.indexOf('class="mapcols');
  assert.ok(iCards >= 0 && iFields > iCards, 'the field band must come after the map cards');
  assert.ok(iCols > iFields, 'the drop tables must come after the field band');
  // the field strip holds all ten levels of the picked map and the travel button lives in it
  const fieldBand = h.slice(iFields, iCols);
  assert.strictEqual((fieldBand.match(/class="map-node/g) || []).length, 10, 'ten fields in the band');
  assert.ok(fieldBand.includes('data-a="go"'), 'travel sits with the fields, not in its own sticky bar');
  assert.ok(fieldBand.includes('Lv 10'), 'the boss field is labelled');
  // one row of ten when the window is wide, wrapping only when it is not
  assert.ok(/\.lvgrid\{display:grid;grid-template-columns:repeat\(auto-fit,minmax\(\d+px,1fr\)\)/.test(src), 'the field strip must be an auto-fit row');
  const min = +src.match(/\.lvgrid\{[^}]*minmax\((\d+)px/)[1];
  assert.ok(min * 10 <= 700, 'ten fields must fit one row in a ~900px window (min ' + min + 'px each)');
  assert.ok(/\.mapcols\{[^}]*repeat\(auto-fit,minmax\(\d+px,1fr\)\)/.test(src), 'tables must be a column grid');
  assert.ok(/\.mapband\.fields\{position:sticky/.test(src), 'the field band must stay pinned while the tables scroll');
  assert.strictEqual((h.match(/class="mob-card"/g) || []).length, 3, 'gear / monsters / boss+pets');
});

t('the equipment panel renders with a chooser open and closed', () => {
  U.S = mkS('Swordman');
  U.selE = 'weapon'; U.eqPick = null;
  let h = U.V.equip();
  assert.ok(!/undefined/.test(h), 'equip panel printed undefined');
  U.eqPick = 'weapon';
  h = U.V.equip();
  assert.ok(h.includes('Broad Sword') && h.includes('chooser'), 'the chooser must list the spare sword');
  assert.ok(h.includes('Equip'), 'and offer to wear it');
  U.eqPick = 'off';
  h = U.V.equip();
  assert.ok(h.includes('Shields') || h.includes('shield'), 'the off-hand chooser must explain what fits there');
});

t('the skills panel renders for every class tier', () => {
  ['Novice', 'Swordman', 'Knight', 'Lord Knight', 'Assassin Cross', 'High Wizard'].forEach(cls => {
    U.S = mkS(cls); U.selS = null;
    const h = U.V.skills();
    assert.ok(!/undefined/.test(h), cls + ' skills panel printed undefined');
    assert.ok(h.includes('Skill points'), cls + ' must show the pool');
  });
});

t('every panel a tab can open builds HTML without throwing', () => {
  U.S = mkS('Knight');
  const names = Object.keys(U.V);
  const broken = [];
  names.forEach(k => { if (typeof U.V[k] !== 'function') return;
    try { U.V[k](); } catch (e) { broken.push(k + ' (' + e.message + ')'); } });
  assert.deepStrictEqual(broken, [], 'panels that threw: ' + broken.join(', '));
  console.log('       ' + names.length + ' panels rendered');
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
