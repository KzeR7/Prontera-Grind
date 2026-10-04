// UI smoke: the panels actually render, with a real state, without throwing.
//   node tools/tests/ui_sim.js
//
// The rules being tested:
//   * every tab panel (map / status / job / skills / equip / cards / refine / pet / quest ...)
//     builds its HTML from a real save shape without throwing and without printing "undefined";
//   * the map panel lists every map and every field, so adding a map cannot silently vanish;
//   * clicking a slot produces a chooser whose list is exactly the equippable items;
//   * learned skills render a checked Auto cast checkbox by default, and the HUD's Kills/min
//     and rolling Zeny/min indicators are calculated from the current session;
//   * every data-a="..." action a panel can emit is a key in ACT - a typo there is a dead button
//     (a previous build shipped one: the GM panel's action was never wired).
//
// This runs the REAL V.* renderers pulled out of index.html, not a copy of them.
const fs = require('fs'), vm = require('vm'), assert = require('assert');
const src = fs.readFileSync(__dirname + '/../../index.html', 'utf8');
const grab = (a, b) => { const i = src.indexOf(a), j = src.indexOf(b, i); if (i < 0 || j < 0) throw new Error('missing ' + a); return src.slice(i, j); };
const pick = (re, name) => { const m = src.match(re); if (!m) throw new Error('cannot find ' + name); return m[0]; };
const petData = grab('const PETS=[', 'const rollingSet=new Set');

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
  pick(/const matk=\(\)=>[^\n]*/, 'matk'),
  pick(/const aspd=\(\)=>[^\n]*/, 'aspd'),
  grab('const pm=s=>', 'const pw=()=>'),          // maps + their REC bands
  petData,                                             // pet roster, Divine Pride icons and gacha skills
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
  pick(/const SKILL_ICON=\{[^}]*\};/, 'per-skill icon map'),
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
const PW=[[90,9,1,0],[80,17,3,0],[70,24,5.5,.5],[60,30,9,1],[50,35,13,2],[40,38,18,4],[30,40,24,6],[22,40,30,8],[12,38,38,12],[5,30,45,20]];
const MAXST=99,ELITELV=100,Z0=-14;
const statCap=()=>99,selK=null,gp=id=>S&&S.pets.find(x=>String(x.id)===String(id)),classRec=()=>null,tb={};
const skCost=x=>x,skOff=id=>!!(S&&S.skOff&&S.skOff[id]);
let petBuff={atk:0,matk:0,atkT:0,matkT:0},petSkillCd={};
const rollingSet=new Set(),autoSet=new Set(),busy=()=>false;
let S=null,mapM=0,mapL=1,selB=null,selC=null;   // remaining panel state comes in with the V grab
const mobs=[],drops=[],logs=[];
const $=id=>({style:{},set innerHTML(v){globalThis['h_'+id]=v},get innerHTML(){return globalThis['h_'+id]||''},textContent:'',onclick:null});
const dr=()=>1;
${code}
const skpAvail=()=>5,skLine=()=>['Novice'],skEarned=()=>9,skSpent=()=>0,pv=()=>0,bon=()=>0,qTxt=q=>'quest';
this.__u={ V, SKILLS, SKILL_ICON, set S(v){S=v}, get S(){return S}, set eqPick(v){eqPick=v}, get eqPick(){return eqPick},
           set mapM(v){mapM=v}, set mapL(v){mapL=v}, set selE(v){selE=v}, set selS(v){selS=v}, set selP(v){selP=v} };
`;
const sb = { console };
vm.createContext(sb); vm.runInContext(harness, sb);
const U = sb.__u;

const sword = { id: 1, name: 'Claymore', tier: 2, slot: 'weapon', wt: 'sword', val: 90, r: 3, sec: 1, cards: [] };
const armor = { id: 2, name: 'Chain Mail', tier: 2, slot: 'armor', val: 50, r: 0, sec: 1, cards: [] };
const ring = { id: 3, name: 'Silver Ring', tier: 2, slot: 'acc', val: 20, r: 0, sec: 1, cards: [] };
const card = { id: 4, n: 'Poring Card', stat: 'str', g: 1, v: 3, card: true };
const mkS = (cls) => ({
  cls, sex: 'm', hair: 0, lv: 60, exp: 0, hp: 900, zeny: 5000, pts: 3, kills: 10, mp: 0, lvl: 5, kl: 3, gmx: 100, gm: false,
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
  assert.ok(!h.includes('Gear that drops here'), 'the bulky gear-by-slot card was removed in v16');
  // every drop now sits on the monster that drops it, one % line each
  assert.ok(h.includes('dropline') && h.includes('4.8%') && h.includes('4%') && h.includes('3.2%'), 'mob gear odds must each be doubled and visible');
  assert.ok(h.includes('0.45%'), 'the card chance stays visible on the monster');
  assert.ok(h.includes('mapcard'), 'the map selector must be the scalable grid');
  assert.strictEqual((h.match(/class="mapcard/g) || []).length, 10, 'one card per map');
  assert.strictEqual((h.match(/class="map-node/g) || []).length, 10, 'one node per field');
  // the boss field lists the whole pool with odds, and the new ore rates
  U.mapL = 10;
  const b = U.V.map();
  assert.ok(b.includes('2.4%') && b.includes('poolitem') && b.includes('Each item rolls independently'), 'the boss must list the doubled independent equipment rolls');
  assert.ok(b.includes('0.08%'), 'boss card odds must remain unchanged');
  assert.ok(b.includes('2% each') && b.includes('5% each'), 'ore rates: 2% per monster, 5% per boss');
});

t('the map tab is a compact two-band panel: maps on top, that map\'s fields under them', () => {
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
  assert.ok(fieldBand.includes('Stage 10'), 'the boss field is labelled');
  assert.ok(src.includes('.wp.wide{flex:0 1 450px;width:450px;min-width:0}'), 'map width is halved and does not grow');
  assert.ok(!/>Lv \d/.test(fieldBand), 'stages are not character levels');
  assert.strictEqual((fieldBand.match(/<button class="map-node/g)||[]).length, 10, 'stages are keyboard-accessible buttons');
  // Compact wrapping rows rather than ten cramped columns.
  assert.ok(/\.lvgrid\{[^}]*repeat\(auto-fit,minmax\(min\(100%,\d+px\),1fr\)\)/.test(src), 'the field strip must shrink its tracks before overflowing');
  const min = +src.match(/\.lvgrid\{[^}]*minmax\(min\(100%,(\d+)px\)/)[1];
  assert.ok(min * 5 <= 400, 'five stages must fit one row in a compact window (min ' + min + 'px each)');
  assert.ok(/\.mapcols\{[^}]*repeat\(auto-fit,minmax\(min\(100%,\d+px\),1fr\)\)/.test(src), 'tables must use min-width-safe column tracks');
  assert.ok(/\.mapband\.fields\{position:sticky/.test(src), 'the field band must stay pinned while the tables scroll');
  // v16: two cards (monsters / boss+pets) instead of three - the gear card was removed,
  // and two fixed-shape cards are what keeps the panel the same size when switching maps
  assert.strictEqual((h.match(/class="mob-card"/g) || []).length, 2, 'monsters / boss+pets');
  assert.ok(/\.wbody\{[^}]*scrollbar-gutter:stable/.test(src), 'the scrollbar gutter is reserved so the panel width does not jump');
});

t('map and boss-field panels stay inside narrow viewports', () => {
  const wins = src.match(/#wins\{[^}]+\}/)[0], panel = src.match(/\.wp\{[^}]+\}/)[0];
  assert.ok(wins.includes('left:12px') && wins.includes('right:12px') && wins.includes('min-width:0'), 'the map window must be bounded on both sides');
  assert.ok(panel.includes('min-width:0') && panel.includes('max-width:100%'), 'panels must be allowed to shrink');
  assert.ok(src.includes('grid-template-columns:repeat(auto-fill,minmax(min(100%,76px),1fr))'), 'map cards must shrink to their panel width');
  assert.ok(src.includes('grid-template-columns:repeat(auto-fit,minmax(min(100%,280px),1fr))'), 'drop cards must not force a 280px overflow');
  assert.ok(src.includes('@media(max-width:900px){#wins{flex-direction:column;align-items:stretch}'), 'narrow screens stack map panels');
  assert.ok(src.includes('.mapband,.mapband.fields{position:static}'), 'the sticky field band must not clip in the stacked layout');
  U.S = mkS('Knight'); U.mapM = 9; U.mapL = 10;
  const boss = U.V.map();
  assert.ok(boss.includes('Dark Lord') && boss.includes('BOSS'), 'the last map and boss field still render after selection');
  assert.ok(boss.includes('poolitem'), 'the selected boss field keeps its drop pool');
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

t('learned active skills use a checked Auto cast box by default', () => {
  U.S = mkS('Mage'); U.S.sk.fire = 1; U.S.skOff = {}; U.selS = 'fire';
  let h = U.V.skills();
  assert.ok(h.includes('<label class="sk-autocast"><input type="checkbox" data-a="sktog" data-v="fire" checked aria-label="Auto cast Fire Bolt"> Auto cast</label>'),
    'a newly learned active skill should auto-cast by default');
  assert.ok(!h.includes('Turn auto-cast ON') && !h.includes('Turn auto-cast OFF'), 'the old detail-panel toggle should be gone');
  assert.ok(src.includes("b&&b.dataset.a==='ssel'&&e.target.closest('.sk-autocast')"), 'clicking the checkbox label should not select/re-render its parent card');
  U.S.skOff.fire = 1; h = U.V.skills();
  assert.ok(/<label class="sk-autocast"><input type="checkbox" data-a="sktog" data-v="fire"\s+aria-label="Auto cast Fire Bolt"> Auto cast<\/label>/.test(h),
    'unchecking Auto cast should render the skill as paused');
});

t('the HUD shows Kills /Min and a rolling Zeny-per-minute hover rate', () => {
  assert.ok(src.includes('<b id="zeny" title="Hover for earned Zeny per minute" tabindex="0" style="cursor:help">0</b>'), 'Zeny amount needs a hover hint');
  assert.ok(src.includes('<div>Kills /Min <b id="kills" title="Kills per minute (rolling 60s)">0.0</b></div>'), 'HUD should display the rate instead of lifetime kills');
  assert.ok(src.includes("$('zeny').title=`Zeny earned per minute (rolling 60s):"), 'hover title should show Zeny/min');
  const box = {}; vm.createContext(box);
  vm.runInContext(grab('const HUD_RATE_WINDOW=60000,HUD_RATE_SAMPLE=1000;', 'function bars(){') + ';this.stepHudRate=stepHudRate;', box);
  let state = null, m = box.stepHudRate(state, 'player', 100, 4000, 0); state = m.state;
  assert.strictEqual(m.kills, 0); assert.strictEqual(m.zeny, 0);
  m = box.stepHudRate(state, 'player', 105, 4600, 30000); state = m.state;
  assert.ok(Math.abs(m.kills - 10) < .001, '5 kills over 30 seconds should show 10/min');
  assert.ok(Math.abs(m.zeny - 1200) < .001, '600 earned Zeny over 30 seconds should show 1,200/min');
  m = box.stepHudRate(state, 'player', 105, 4100, 45000); state = m.state;
  assert.ok(Math.abs(m.zeny - 800) < .001, 'spending Zeny must not count as negative earnings');
  m = box.stepHudRate(state, 'player', 105, 4100, 90000); state = m.state;
  assert.strictEqual(m.kills, 0, 'activity should age out of the rolling minute');
  assert.strictEqual(m.zeny, 0, 'Zeny earnings should age out of the rolling minute');
  m = box.stepHudRate(state, 'another-player', 20, 9000, 90000); state = m.state;
  assert.strictEqual(m.kills, 0, 'a new login should start a fresh rate window');
  assert.strictEqual(m.zeny, 0, 'a loaded balance should not count as new income');
  m = box.stepHudRate(state, 'another-player', 30, 10000, 160001);
  assert.strictEqual(m.kills, 0, 'a long idle gap should start a fresh rolling window');
  assert.strictEqual(m.zeny, 0, 'earnings from before a long idle gap should not linger');
});

t('every skill has a distinct icon and upgraded card metadata', () => {
  const missing = [...U.SKILLS].filter(s => !U.SKILL_ICON[s.id]).map(s => s.id);
  assert.deepStrictEqual(missing, [], 'skills without a mapped glyph: ' + missing.join(', '));
  assert.strictEqual(Object.keys(U.SKILL_ICON).length, U.SKILLS.length, 'the icon map must cover the whole roster without unused entries');
  assert.strictEqual(new Set(U.SKILLS.map(s => U.SKILL_ICON[s.id])).size, U.SKILLS.length, 'each skill must have a visually distinct glyph');
  U.S = mkS('Mage'); U.selS = null;
  const h = U.V.skills();
  assert.ok(h.includes('class="sk-head"') && h.includes('class="sk-kind"'), 'cards show the skill category');
  assert.ok(h.includes('class="si" aria-hidden="true"') && h.includes('class="sk-level"'), 'cards show a pictogram and clear level');
  assert.ok(h.includes('class="sk-name"') && h.includes('aria-label="Increase Fire Bolt"'), 'skill labels and upgrade buttons are accessible');
  assert.ok(/\.skg\{[^}]*repeat\(4,minmax\(0,1fr\)\)/.test(src) && src.includes('.sk .si{width:40px;height:40px'), 'the icon tiles use a polished responsive card style');
});

t('Settings shows a live class, gender and hairstyle preview', () => {
  U.S = mkS('Assassin Cross'); U.S.sex = 'f'; U.S.hair = 7;
  const h = U.V.set();
  assert.ok(h.includes('id="hairPreview"') && h.includes('id="hairPreviewLoading"'), 'a canvas preview has a loading fallback');
  assert.ok(h.includes('Live female Assassin Cross hair preview'), 'the preview describes the current class and gender');
  assert.ok(h.includes('Female &middot; front idle pose') && h.includes('Style 8 of 19'), 'gender and selected hair are reflected');
  assert.ok(h.includes('aria-label="Previous hairstyle"') && h.includes('aria-label="Next hairstyle"'), 'hair controls have accessible names');
  assert.ok(src.includes("if(tabs.includes('set'))drawHairPreview()"), 'opening or changing Settings redraws the canvas');
  assert.ok(src.includes('function drawHairPreview()') && src.includes('ctx.drawImage(atlas,0,0,PK.cellW,PK.cellH,0,0,cv.width,cv.height)'), 'the preview crops the actual packed class-and-hair art');
});

t('the character + class panels show the class-collection bonus', () => {
  U.S = mkS('Knight');                          // tier 2 at lv 60: bonus dormant
  let h = U.V.stats();
  assert.ok(h.includes('Class collection'), 'collection progress must be visible on the character panel');
  assert.ok(h.includes('Class collection: 0/6 transcendent'), 'only transcendent classes count, and the total is data-driven');
  assert.ok(h.includes('activates at Base Lv 100'), 'the gate is spelled out before the rebirth levels');
  U.S.lv = 100; U.S.base['Lord Knight'] = {lv:110};
  h = U.V.stats();
  assert.ok(h.includes('Class collection: 1/6 transcendent'), 'a played transcendent class joins the count');
  assert.ok(h.includes('+1% damage'), 'and pays +1% once at Base Lv 100+');
  assert.ok(!h.includes('activates at'), 'the note disappears once the bonus is live');
  h = U.V.job();
  assert.ok(h.includes('Class collection'), 'the class tree panel repeats the mission');
  assert.ok(h.includes('+1% damage'));
});

t('pet details show Ragnarok sprites, named upgrade levels, and gacha skill odds', () => {
  U.S=mkS('Novice');U.S.pets=[{id:41,sp:0,mut:0,eq:[1,2,0],skill:'warcry',sk:[1,2,3],on:false}];U.selP=41;
  const h=U.V.pet();
  assert.ok(h.includes('src="https://static.divine-pride.net/images/mobs/png/1002.png"'),'the pet portrait must use its Divine Pride monster sprite');
  assert.ok(h.includes('Claw &middot; Level 1/5')&&h.includes('Collar &middot; Level 2/5')&&h.includes('Charm &middot; Level 0/5'),'each upgrade must name the slot and current level');
  assert.ok(h.includes('25% upgrade success')&&h.includes('15% upgrade success')&&h.includes('40% upgrade success'),'each upgrade must show its success chance');
  assert.ok(h.includes('5% double upgrade chance on success'),'the great-success chance must be explicit');
  assert.ok(h.includes('Gacha pet skill')&&h.includes('War Cry')&&h.includes('Player ATK +20% for 8s'),'the rolled skill and its effect must be visible');
  assert.ok(h.includes('Six equally weighted skills: 2 player buffs, 2 AoE attacks, 2 single-target attacks (1/6 each).'),'the requested gacha distribution must be clear');
  assert.ok(h.includes('data-a="pskill"'),'the pet skill gacha button must be present');
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
