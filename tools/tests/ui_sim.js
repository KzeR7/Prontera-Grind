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
let petBuff={atk:0,matk:0,hp:0,leech:0,atkT:0,matkT:0,hpT:0,leechT:0},petBuffSrc={},petSkillCd={},petNote={};
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
  // Every map card shows its recommended level range under the name (the old build printed the
  // word "farming" there instead). The current map keeps its dot marker.
  const cards = h.slice(h.indexOf('class="mapgrid'), h.indexOf('class="mapband fields'));
  assert.ok(!/>\s*farming\s*</.test(cards), 'no map card says "farming" any more');
  assert.ok(cards.includes('● Lv 1-12') && cards.includes('Lv 10-24'), 'the level range is back under the name');
  assert.ok(cards.includes('Lv 90-99'), 'and every map carries one');
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
  assert.ok(!/>1st job</.test(fieldBand) && !/>2nd job</.test(fieldBand) && !/>novice</.test(fieldBand),
    'stage buttons carry no job-tier description');
  assert.ok(!/1st-job gear/.test(h), 'the stage header no longer names the gear section');
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

t('clicking a slot highlights the fit in the REAL bag tab - no extra pop-out', () => {
  U.S = mkS('Swordman');
  U.selE = 'weapon'; U.eqPick = null; U.sub = 'bag';
  let h = U.V.equip();
  assert.ok(!/undefined/.test(h), 'equip panel printed undefined');
  assert.ok(!h.includes('chooser'), 'the equipment panel itself never hosts the chooser any more');
  // with a slot being chosen, the Bag window rings what fits and wires the click to equip
  U.eqPick = 'weapon';
  const bag = U.V.bag0();
  assert.ok(bag.includes('class="mob-card chooser"'), 'the Bag window carries the choosing banner');
  assert.ok(bag.includes('Choosing a r.hand') || bag.includes('Choosing a'), 'which names the slot');
  assert.ok(bag.includes('aria-label="Broad Sword - fits this slot, click to equip"'), 'names the item it will wear');
  assert.ok(bag.includes('cell b2 fit') && bag.includes('data-a="eqpick" data-v="9:weapon"'), 'the sword that fits is ringed and clickable');
  assert.ok(!bag.includes('data-v="9:weapon" data-tip'), 'and is not also a plain select tile');
  // the worn sword and the ring stay ordinary bag tiles (viewable, sellable)
  assert.ok(bag.includes('data-a="selb" data-v="2"') && bag.includes('data-a="selb" data-v="3"'), 'everything else stays a normal bag item');
  assert.ok(!/nofit/.test(bag), 'nothing in the bag is greyed out or disabled');
  U.eqPick = 'off';
  assert.ok(/shield/i.test(U.V.bag0()), 'the off-hand banner must explain what fits there');
  // and the actual slot click opens that window
  assert.ok(src.includes("seleq:v=>{selE=v;eqPick=v;sub.bag='bag';if(!tabs.includes('bag'))"), 'clicking a doll slot opens the Bag tab');
  assert.ok(src.includes("if(k==='status')sub.status='stats';if(k==='bag')sub.bag='bag';"), 'reopening a window resets its sub-tab');
});

t('the skills panel renders for every class tier', () => {
  ['Novice', 'Swordman', 'Knight', 'Lord Knight', 'Assassin Cross', 'High Wizard'].forEach(cls => {
    U.S = mkS(cls); U.selS = null;
    const h = U.V.skills();
    assert.ok(!/undefined/.test(h), cls + ' skills panel printed undefined');
    assert.ok(h.includes('Skill points'), cls + ' must show the pool');
  });
});

t('Auto cast lives in the skill description card below the grid', () => {
  U.S = mkS('Mage'); U.S.sk.fire = 1; U.S.skOff = {}; U.selS = null;
  let h = U.V.skills();
  const tile = h.slice(h.indexOf('data-a="ssel" data-v="fire"'), h.indexOf('data-a="skill" data-v="fire"'));
  assert.ok(tile.length > 0 && !tile.includes('sktog'), 'the skill tile must no longer carry the checkbox');
  U.selS = 'fire';
  h = U.V.skills();
  assert.ok(h.includes('class="sk-detail-autocast"'), 'the description card holds the auto-cast control');
  assert.ok(h.includes('<label class="sk-autocast"><input type="checkbox" data-a="sktog" data-v="fire" checked aria-label="Auto cast Fire Bolt"> Auto cast this skill</label>'),
    'a newly learned active skill should auto-cast by default, from the description');
  assert.ok(h.includes('Cast automatically every time you attack.'), 'and say what the checkbox means');
  U.S.skOff.fire = 1; h = U.V.skills();
  assert.ok(h.includes('Paused - it will not be used until you check this again.'), 'unchecking renders it as paused');
  assert.ok(!h.includes('checked aria-label="Auto cast Fire Bolt"'), 'and the box renders unchecked');
  // a passive or an unlearned skill has no auto-cast row to offer
  U.selS = 'aid'; U.S.sk.aid = 0; h = U.V.skills();
  assert.ok(h.includes('nothing to auto-cast'), 'an unlearned skill explains there is nothing to toggle');
});

t('HP flips at 30%; one split bar fills Base from left and Job from right with centred percentages', () => {
  const markup=src.slice(src.indexOf('<div id="xp-dock"'),src.indexOf('<div id="modal"'));
  assert.strictEqual((markup.match(/id="xp-track"/g)||[]).length,1,'the dock has exactly one XP track');
  assert.ok(markup.indexOf('id="baseTrack"')<markup.indexOf('id="jobTrack"'),'Base must be left of Job');
  assert.ok(markup.includes('Base Lv 1')&&markup.includes('Job Lv 1'),'both sides need labels');
  assert.ok(src.includes('#xp-track{display:flex;width:100%;height:14px'),'track spans the screen');
  assert.ok(src.includes('.xp-side{position:relative;flex:0 0 50%'),'the two parts share the single track equally');
  assert.ok(src.includes('#jb{left:auto;right:0;'),'Job fill must originate at the right edge');
  assert.ok(src.includes('.xp-pct{left:50%;transform:translateX(-50%)}'),'each percentage is centred within its half');
  assert.ok(src.includes('#hpb.critical{background:linear-gradient('),'low HP must use a red treatment');
  const box={};vm.createContext(box);
  vm.runInContext(`
    const nodes={};const $=id=>nodes[id]||(nodes[id]={style:{},textContent:'',title:'',attrs:{},
      classList:{flags:{},toggle(k,v){this.flags[k]=v}},setAttribute(k,v){this.attrs[k]=v}});
    let S={lv:20,exp:90,hp:31,kills:0,zeny:0},hudRate=null,zenyEarned=0,currentUser='A';
    // the pet buff chips bars() now draws: no pet buff is running in this fixture
    let petBuff={atk:0,matk:0,hp:0,leech:0,atkT:0,matkT:0,hpT:0,leechT:0},petBuffSrc={};
    const performance={now:()=>1000},job={jl:10,jx:45},jobOf=()=>job,C=()=>({mj:50}),maxHp=()=>100,
      jneed=()=>100,need=()=>200;
    ${grab('const HUD_RATE_WINDOW=60000,HUD_IDLE_RESET=30000,HUD_RATE_REFRESH=1000;','function ui(){')}
    bars();this.__h={nodes,S,job,bars};
  `,box);
  const h=box.__h,d=h.nodes;
  assert.strictEqual(d.hpb.classList.flags.critical,false,'31% HP must stay green');
  assert.strictEqual(d.jb.style.width,'45%');assert.strictEqual(d.xpb.style.width,'45%');
  assert.strictEqual(d.jobPct.textContent,'45.0%');assert.strictEqual(d.basePct.textContent,'45.0%');
  assert.ok(d.jobTrack.title.includes('45.0% to next level'));
  assert.ok(d.baseTrack.title.includes('45.0% to next level'));
  assert.strictEqual(d.jobTrack.attrs['aria-valuenow'],'45.0');
  h.S.hp=30;h.bars();assert.strictEqual(d.hpb.classList.flags.critical,true,'30% HP must turn red');
  h.job.jl=50;h.S.lv=150;h.bars();assert.strictEqual(d.jb.style.width,'100%');assert.strictEqual(d.xpb.style.width,'100%');
});

t('damage digits, critical burst and skill names use separate anchored combat overlays', () => {
  assert.ok(src.includes('.fl.critical::before{')&&src.includes('clip-path:polygon('),
    'critical damage needs a spiked red burst behind its number');
  assert.ok(src.includes('color:#ffe643!important')&&src.includes('-webkit-text-stroke:'),
    'ordinary damage needs RO-like gold outlined digits');
  assert.ok(src.includes('#xp-track{display:flex;width:100%;height:14px')&&src.includes('#xp-dock{flex:none;width:100%;padding:3px 10px 4px'),
    'the shared Base/Job bar must be slimmer than before');
  assert.ok(src.includes('skillNameFloat(sk.n,cast-1)')&&src.includes("skillNameFloat('First Aid')")&&src.includes('skillNameFloat(s.n)'),
    'active, healing and buff skills must show a name above the caster');
  const box={};vm.createContext(box);
  vm.runInContext(`
    let S={dmgShort:true,dmgShow:true},floats=[],pl={x:2,z:4};
    ${grab('const addFloat=(x,y,z,txt,col,big,kind=', 'function log(m,cls){')}
    this.__f={floats,pl,damageFloat,skillNameFloat,shortNum,numTxt,get S(){return S},set full(v){S.dmgShort=!v},
      get dmgShow(){return S.dmgShow!==false},set dmgShow(v){S.dmgShow=v==='on'||v===true}};
  `,box);
  const F=box.__f;
  F.damageFloat(1,2,3,879,false);F.damageFloat(1,2,3,1896,true);
  F.damageFloat(1,2,3,55,false,true);F.skillNameFloat('Bash',1);
  assert.deepStrictEqual(Array.from(F.floats,f=>f.kind),['damage','critical','incoming','skill']);
  assert.strictEqual(F.floats[1].txt,'1.9K','a critical number is shortened like any other, never replaced by a label');
  assert.strictEqual(F.floats[0].txt,'879','numbers under a thousand keep every digit');
  assert.strictEqual(F.floats[2].txt,'55','incoming damage follows the same setting');
  // the Show toggle really hides the numbers; the style toggle only changes the digits
  F.dmgShow=false;
  F.damageFloat(1,2,3,4321,false);F.damageFloat(1,2,3,9000,true,true);
  assert.strictEqual(F.floats.length,4,'with damage numbers switched off, no damage float is pushed at all');
  F.dmgShow=true;
  assert.strictEqual(F.numTxt(1250000),'1.3M','rewards and damage share one short formatter');
  assert.strictEqual(F.numTxt(20500),'20.5K');
  F.full=true;
  assert.strictEqual(F.numTxt(1250000),'1250000','and the full style prints every digit');
  assert.deepStrictEqual([100000,1000000,12500,999,1000,2500000,999999,1234567].map(F.shortNum),
    ['100K','1M','12.5K','999','1K','2.5M','1M','1.2M'],'the short form ladder');
  F.full=true;
  F.damageFloat(1,2,3,1000000,false);F.damageFloat(1,2,3,1896,true);
  assert.strictEqual(F.floats[4].txt,'1000000','the Settings switch shows every digit');
  assert.strictEqual(F.floats[5].txt,'1896','critical digits come back too');
  const strikeBox={};vm.createContext(strikeBox);
  vm.runInContext(`
    let mob={x:1,z:3,hp:10000,size:1},shake=0,hit=null;
    const missCh=()=>0,crit=()=>100,atk=()=>100,matk=()=>200,st=()=>0,critD=()=>2,
      rnd=(a,b)=>a,addFloat=()=>{},damageFloat=(...args)=>{hit=args};
    ${grab('function strike(mult,col,magic=false){','// Higher job tiers get more casts per swing:')}
    strike(1,'#fff');this.__hit={mob,hit,shake};
  `,strikeBox);
  assert.ok(strikeBox.__hit.hit[4]&&strikeBox.__hit.hit[3]>100&&strikeBox.__hit.shake===6,
    'actual critical strike must send its numeric damage into the burst renderer');
  assert.strictEqual(F.floats[3].anchor,'hero');assert.strictEqual(F.floats[3].y,3.53);
  const draw=grab('  floats.forEach(f=>{if(!f.el)', '  const pt=bn?');
  const scene={floats:F.floats,pl:F.pl,create:()=>({style:{}}),draw};
  vm.createContext(scene);
  vm.runInContext(`const document={createElement:()=>({style:{}})},ov={appendChild:()=>{}},scr=(x,y,z)=>[x*10,z*10];${draw}`,scene);
  assert.strictEqual(F.floats[3].el.style.left,'20px');
  F.pl.x=8;vm.runInContext(draw,scene);
  assert.strictEqual(F.floats[3].el.style.left,'80px','skill names must track the moving hero');
  assert.strictEqual(F.floats[1].el.className,'fl critical');
});

t('Zeny and kill rates refresh every second using a rolling minute and reset after stalls', () => {
  assert.ok(src.includes('class="hud-zeny" id="zenyHover" tabindex="0"'),'hover area must include amount and label');
  assert.ok(src.includes('.hud-zeny:hover .hud-flyout'),'Zeny tooltip must open on hover without browser title delays');
  assert.ok(src.includes("$('zenyRate').textContent=`Zeny earned:"),'tooltip must display a live rate');
  assert.ok(src.includes('Kills/min <b id="kills"'),'kills rate must replace lifetime count');
  const box={};vm.createContext(box);
  vm.runInContext(`
    let S={zeny:200},zenyEarned=0;
    ${grab('function earnZeny(amount){','function kill(o){')}
    ${grab('const HUD_RATE_WINDOW=60000,HUD_IDLE_RESET=30000,HUD_RATE_REFRESH=1000;','const levelPct=')}
    this.__r={stepHudRate,earnZeny,S,get earned(){return zenyEarned}};
  `,box);
  const R=box.__r;
  R.earnZeny(600);R.S.zeny-=450;R.earnZeny(25);
  assert.strictEqual(R.S.zeny,375);assert.strictEqual(R.earned,625,'spending must not erase income');
  let state=null;
  const sample=(user,k,z,time)=>{const m=R.stepHudRate(state,user,k,z,time);state=m.state;return m};
  let m=sample('player',100,0,0);
  m=sample('player',103,600,500);assert.strictEqual(m.kills,0);assert.strictEqual(m.zeny,0,'hold until first full second');
  m=sample('player',103,600,1000);
  assert.strictEqual(m.kills,180,'3 kills in the first second -> 180/min (early estimate)');
  assert.strictEqual(m.zeny,36000,'600 Zeny in first second -> 36000/min');
  assert.strictEqual(m.seconds,3);
  m=sample('player',103,600,1500);assert.strictEqual(m.kills,180,'samples hold between whole seconds');
  m=sample('player',103,600,2000);assert.strictEqual(m.kills,90,'rate decays every second, not every 30');
  m=sample('player',104,650,30000);assert.strictEqual(m.kills,8,'four kills in 30 seconds -> 8/min');
  assert.strictEqual(m.zeny,1300,'650 earned in 30s -> 1,300/min');
  m=sample('player',104,650,60500);assert.strictEqual(m.kills,0);assert.strictEqual(m.zeny,0,
    'after a browser stall longer than 30 seconds, old rates vanish instead of spiking');
  m=sample('player',106,750,61500);assert.strictEqual(m.kills,120);assert.strictEqual(m.zeny,6000,
    'new kills and credits after resume count against the new window');
  m=sample('player',106,750,121501);assert.strictEqual(m.kills,0);assert.strictEqual(m.zeny,0,
    'a 60-second inactive period resets rates to zero');
  m=sample('player',10,100,122501);assert.strictEqual(m.kills,0);assert.strictEqual(m.zeny,0,
    'counter changes that indicate a fresh save must reset');
  m=sample('another-player',20,9000,123501);assert.strictEqual(m.kills,0);assert.strictEqual(m.zeny,0,
    'a new login must start a clean window');
  // A long uninterrupted session ages out past-minute events without requiring a pause.
  let clock=123501;for(let i=0;i<61;i++){clock+=1000;m=sample('another-player',i<60?21:21,9000,clock)}
  assert.strictEqual(m.kills,0,'old kills age out of the uninterrupted rolling minute');
  m=sample('another-player',900,999999,clock+600000);
  assert.strictEqual(m.kills,0);assert.strictEqual(m.zeny,0,
    'ten minutes with no frames must not compress 879 accumulated kills into one second');
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
  U.S=mkS('Novice');U.S.pets=[{id:41,sp:0,mut:0,eq:[1,2,0],skills:['warcry','spiritbolt'],sk:[1,2,3],on:false}];U.selP=41;
  const h=U.V.pet();
  assert.ok(h.includes('src="https://static.divine-pride.net/images/mobs/png/1002.png"'),'the pet portrait must use its Divine Pride monster sprite');
  assert.ok(h.includes('Claw &middot; Level 1/5')&&h.includes('Collar &middot; Level 2/5')&&h.includes('Charm &middot; Level 0/5'),'each upgrade must name the slot and current level');
  assert.ok(h.includes('25% upgrade success')&&h.includes('15% upgrade success')&&h.includes('40% upgrade success'),'each upgrade must show its success chance');
  assert.ok(h.includes('5% double upgrade chance on success'),'the great-success chance must be explicit');
  // v35: TWO skill slots, both filled by one gacha
  assert.ok(h.includes('Pet skills &middot; 2 slots'),'the panel must show two skill slots');
  assert.ok(h.includes('War Cry')&&h.includes('Spirit Bolt'),'both rolled skills must be listed');
  assert.ok(h.includes('Player ATK +20% for 30s, 60s cooldown'),'a buff must state its 30s/60s timing');
  assert.ok(h.includes('Single target: 2.5× pet damage'),'an attack skill must state its multiplier');
  assert.ok(h.includes('Reroll both skills'),'the gacha rerolls the whole loadout');
  assert.ok(h.includes('Eight equally weighted skills: 4 player buffs, 2 AoE attacks, 2 single-target attacks.'),'the gacha distribution must be clear');
  assert.ok(h.includes('never stack')&&h.includes('ATK and MATK buffs cannot run at the same time'),'the no-stacking rules must be on the panel');
  assert.ok(h.includes('data-a="pskill"'),'the pet skill gacha button must be present');
  // and the empty-slot state on a pet that has not rolled yet
  U.S.pets=[{id:42,sp:1,mut:0,eq:[0,0,0],skills:[],sk:[1,2,3],on:false}];U.selP=42;
  const h2=U.V.pet();
  assert.ok(h2.includes('Slot 1: <b class="r0">empty</b>')&&h2.includes('Slot 2: <b class="r0">empty</b>'),'both empty slots are offered');
  assert.ok(h2.includes('Gacha both skills'),'and the button says what it will do');
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

t('the bag shows its 1000-item limit and refuses loot once it is full', () => {
  U.S = mkS('Knight'); U.selB = null; U.S.inv = [];
  let h = U.V.bag0();
  assert.ok(h.includes('0/1000 items'), 'the bag states its capacity');
  U.S.inv = new Array(1000).fill(0).map((_, i) => ({ id: 500 + i, name: 'Thing ' + i, tier: 1, slot: 'armor', val: 5, cards: [] }));
  h = U.V.bag0();
  assert.ok(h.includes('1000/1000 items') && h.includes('BAG FULL'), 'a full bag says so');
  // execute the real pickup path
  const box = {}; vm.createContext(box);
  vm.runInContext(`
    let S={inv:[],cards:[],ore:{ori:0,elu:0},auto:false},pl={x:1,z:2},msg='';
    const GRADE=['Common','Uncommon','Rare','Legendary'],GI=[0,1,2,4],ORE={ori:'Oridecon',elu:'Elunium'},
      RAR=[{n:'Common'},{n:'Fine'},{n:'Rare'},{n:'Epic'},{n:'Legendary'}];
    const cardTxt=c=>c.n,addFloat=()=>{},ui=()=>{},log=m=>{msg=m},qProg=()=>{},canUse=()=>false,equip=()=>{};
    ${pick(/const BAGMAX=\d+;/, 'BAGMAX')}
    ${grab('function collect(it){', 'function equip(id,quiet){')}
    this.__c={collect,S,BAGMAX,get msg(){return msg},clear(){msg=''}};
  `, box);
  const C = box.__c;
  C.collect({ id: 1, name: 'Blade', tier: 4 });
  assert.strictEqual(C.S.inv.length, 1, 'an item is picked up while there is room');
  C.S.inv.length = C.BAGMAX; C.clear();
  C.collect({ id: 2, name: 'Blade', tier: 4 });
  assert.strictEqual(C.S.inv.length, C.BAGMAX, 'the bag never grows past its cap');
  assert.ok(C.msg.includes('Bag full'), 'and the refusal is reported: ' + C.msg);
  C.clear();
  C.collect({ card: 1, id: 3, n: 'Poring Card', g: 1, stat: 'str', v: 3 });
  assert.strictEqual(C.S.cards.length, 1, 'cards live in their own bag and are not capped by the item limit');
});

t('Settings carries BOTH damage-number toggles (show/hide and short/full) and remembers them', () => {
  U.S = mkS('Knight'); U.S.dmgShort = true; U.S.dmgShow = true;
  let h = U.V.set();
  assert.ok(h.includes('data-a="dmgshow" data-v="on" class="on"') && h.includes('data-a="dmgshow" data-v="off"'),
    'the on/off switch for the damage display is offered');
  assert.ok(h.includes('data-a="dmgfmt" data-v="short" class="on"') && h.includes('data-a="dmgfmt" data-v="full"'),
    'and the short/full style next to it');
  assert.ok(h.includes('Short &middot; 100K / 1M') && h.includes('Full &middot; 100,000'), 'and labelled with an example');
  U.S.dmgShort = false; U.S.dmgShow = false;
  h = U.V.set();
  assert.ok(h.includes('data-a="dmgfmt" data-v="full" class="on"'), 'the current style is highlighted');
  assert.ok(h.includes('data-a="dmgshow" data-v="off" class="on"'), 'and so is the current visibility');
  assert.ok(!h.includes('data-a="dmgfmt" data-v="short" class="on"') && !h.includes('data-a="dmgshow" data-v="on" class="on"'));
  assert.ok(src.includes('if(f.dmgShort!==true&&f.dmgShort!==false)f.dmgShort=true;'), 'the save repair defaults old saves to short');
  assert.ok(src.includes('if(f.dmgShow!==true&&f.dmgShow!==false)f.dmgShow=true;'), 'and old saves to showing them');
  assert.ok(src.includes('dmgShort:true,dmgShow:true,base:{}'), 'a fresh save starts short and visible');
  // the two switches really do reach the float code
  assert.ok(src.includes("const numTxt=n=>fullNum()?String(Math.round(n)):shortNum(n);"), 'one formatter serves every number');
  assert.ok(src.includes("damageFloat=(x,y,z,amount,critical=false,incoming=false)=>{if(S&&S.dmgShow===false)return;"), 'hiding skips the float entirely');
});

t('the map panel states the fixed rarity of the field it is showing', () => {
  U.S = mkS('Novice'); U.mapM = 0; U.mapL = 1;
  let h = U.V.map();
  assert.ok(h.includes('every drop here is <b class="r0">Common</b>'), 'Prontera stage 1 is a Common field');
  assert.ok(h.includes('<small class="r0">Common</small>'), 'and each drop line repeats the band');
  U.mapM = 9; U.mapL = 10;
  h = U.V.map();
  assert.ok(h.includes('every drop here is <b class="r4">Legendary</b>'), 'the Abyss boss field is Legendary');
  assert.ok(h.includes('Every boss drop is <b class="r4">Legendary</b>'), 'the boss card says so');
  U.mapM = 5; U.mapL = 4;
  h = U.V.map();
  assert.ok(h.includes('every drop here is <b class="r2">Rare</b>'), 'Comodo stage 4 is a Rare field');
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
