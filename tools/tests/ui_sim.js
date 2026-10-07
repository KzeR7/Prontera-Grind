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
  pick(/const gearRefLevel=it=>[^;]+;/, 'gear reference level'),
  pick(/const sellVal=it=>[^;]+;/, 'sell value'),
  pick(/const cell=\(it,sel,extra=''\)=>[^\n]*/, 'cell'),
  pick(/const STATS=\[[\s\S]*?\];/, 'STATS'),
  pick(/const SKILL_ICON=\{[^}]*\};/, 'per-skill pictogram map'),
  pick(/const SKILL_TONE=\{[^;]+;/, 'skill icon color themes'),
  pick(/const SKILL_PICTO=\{[\s\S]*?\n\};/, 'local vector skill art'),
  grab('const skillIcon=id=>', '// The CDM affix stays'),
  pick(/const SKSLOTS=t=>[^;]+;/, 'SKSLOTS/SKFADE'),
  pick(/const SKGCD=[\d.]+;/, 'SKGCD'),
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
  pick(/const RO_ITEM_ICON_CANDIDATES=\{[^;]+;/, 'RO equipment image candidates'),
  grab('const gearIconHash=text=>', 'const gearItemIconId='),
  grab('const gearItemIconId=it=>', 'const itemIconUrl='),
  pick(/const itemIconUrl=id=>[^;]+;/, 'gear image URL'),
  grab('const itemIconMarkup=it=>', 'const icon=it=>'),
  pick(/const icon=it=>[^;]+;/, 'icon'),
  pick(/const items=\(\)=>[^\n]*/, 'items/ev/iname/eqv'),
  pick(/const refCost=it=>[^;]+;/, 'refCost/refCh'),
  pick(/const affTxt=a=>[^;]+;/, 'affTxt/cardTxt/dtier'),
  grab('const V={', 'const ACT={'),                            // the panels themselves
  // v39: the Log window's filter table and its two readers, the on-screen log's fold helper, the
  // master auto-cast switch, and the Bag's two sell-tool readers.
  pick(/const LOGCATS=\[[\s\S]*?\];/, 'log category table'),
  grab('const logCats=', 'const feedOn='),
  grab('const feedOn=', 'function log('),
  grab('const skTog=', 'const pv=k=>'),
  pick(/const autoSellOn=[^\n]*/, 'auto-sell / click-sell readers'),
].join('\n');

const harness = `
// stubs the pulled-in code needs at load time and when a panel renders
const SLOTS={weapon:{label:'Weapon',stat:'ATK',ic:'sw'},armor:{label:'Armor',stat:'DEF',ic:'ar'},head:{label:'Headgear',stat:'HP',ic:'hd'},off:{label:'Shield',stat:'DEF',ic:'sh'},leg:{label:'Legwear',stat:'DEF',ic:'lg'},acc:{label:'Accessory',stat:'HP',ic:'ac'}};
const RAR=[{n:'Common',m:1,w:60},{n:'Fine',m:1.35,w:25},{n:'Rare',m:1.9,w:10},{n:'Epic',m:2.8,w:4},{n:'Legendary',m:4.5,w:1}];
const PW=[[90,9,1,0],[80,17,3,0],[70,24,5.5,.5],[60,30,9,1],[50,35,13,2],[40,38,18,4],[30,40,24,6],[22,40,30,8],[12,38,38,12],[5,30,45,20]];
const MAXST=99,ELITELV=100,Z0=-14;
const statCap=()=>99,selK=null,gp=id=>S&&S.pets.find(x=>String(x.id)===String(id)),classRec=()=>null,tb={};
let skinBroken=false,skinNote='';   // the Appearance panel's class-skin state (loaded with the game in the real page)
const skCost=x=>x,skOff=id=>!!(S&&S.skOff&&S.skOff[id]);
let petBuff={atk:0,matk:0,hp:0,leech:0,atkT:0,matkT:0,hpT:0,leechT:0},petBuffSrc={},petSkillCd={},petNote={};
const rollingSet=new Set(),autoSet=new Set(),busy=()=>false;
let S=null,mapM=0,mapL=1,selB=null,selC=null;   // remaining panel state comes in with the V grab
const mobs=[],drops=[],logs=[];
let boardPeriod='daily',boardCache={},boardLoading=false,boardError='';
const CLOUD={api:false,on:false};
const $=id=>({style:{},set innerHTML(v){globalThis['h_'+id]=v},get innerHTML(){return globalThis['h_'+id]||''},textContent:'',onclick:null});
const dr=()=>1;
${code}
const skpAvail=()=>5,skTree=()=>4,skEarnedMax=()=>9,skLine=()=>['Novice'],skEarned=()=>9,skSpent=()=>0,pv=()=>0,bon=()=>0,qTxt=q=>'quest';
this.__u={ V, SKILLS, SKILL_ICON, SKILL_TONE, SKILL_PICTO, skillIcon, logs, indexSectionOpen, indexToggleSection, set S(v){S=v}, get S(){return S}, set boardPeriod(v){boardPeriod=v}, set boardCache(v){boardCache=v}, set boardStatus(v){CLOUD.api=!!v.api;CLOUD.on=!!v.on}, set eqPick(v){eqPick=v}, get eqPick(){return eqPick},
           set indexMode(v){indexMode=v}, get indexMode(){return indexMode}, set mapM(v){mapM=v}, set mapL(v){mapL=v}, set selE(v){selE=v}, get selE(){return selE}, set selB(v){selB=v}, get selB(){return selB}, set selS(v){selS=v}, set selP(v){selP=v} };
`;
const sb = { console };
vm.createContext(sb); vm.runInContext(harness, sb);
const U = sb.__u;

const sword = { id: 1, name: 'Claymore', tier: 2, slot: 'weapon', wt: 'sword', val: 90, r: 3, sec: 1, cards: [] };
const armor = { id: 2, name: 'Chain Mail', tier: 2, slot: 'armor', val: 50, r: 0, sec: 1, cards: [] };
const ring = { id: 3, name: 'Silver Ring', tier: 2, slot: 'acc', val: 20, r: 0, sec: 1, cards: [] };
const card = { id: 4, n: 'Poring Card', stat: 'str', g: 1, v: 3, card: true };
const mkS = (cls) => ({
  cls, sex: 'm', hair: 0, lv: 60, exp: 0, hp: 900, zeny: 5000, pts: 3, kills: 10, mobKills: {}, equippedTitle: null,
  cardIndex: { donated: 0, byName: {}, stats: { str: 0, agi: 0, dex: 0, int: 0, vit: 0, luk: 0 } }, mp: 0, lvl: 5, kl: 3, gmx: 100, gm: false,
  st: { str: 30, agi: 20, dex: 20, luk: 5, int: 5, vit: 20 }, sk: { aid: 1 }, skOff: {}, jobs: { [cls]: { jl: 30, jx: 0 }, Novice: { jl: 10, jx: 0 } }, base: {},
  eq: { head: null, weapon: sword, armor, off: null, acc1: ring, leg: null, acc2: null },
  inv: [armor, ring, { id: 9, name: 'Broad Sword', tier: 2, slot: 'weapon', wt: 'sword', val: 70, r: 0, sec: 1, cards: [] }], cards: [card], pets: [], ore: { ori: 2, elu: 1 }, prog: [1, 1, 1, 10, 10, 5, 3, 1, 1, 1],
  q: [], kills_: 0, buff: 0, auto: true, feed: true, clickSell: false, autoSell: [false, false, false, false, false], logOff: {},
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
  assert.ok(h.includes('dropline') && h.includes('1.5%') && h.includes('1.2%') && h.includes('0.9%'), 'mob gear odds (v57: 3.6% total) must each be visible');
  assert.ok(h.includes('0.15%'), 'the card chance stays visible on the monster');
  assert.ok(h.includes('mapcard'), 'the map selector must be the scalable grid');
  assert.strictEqual((h.match(/class="mapcard/g) || []).length, 10, 'one card per map');
  // Every map card shows its recommended level range under the name (the old build printed the
  // word "farming" there instead). The current map keeps its dot marker.
  const cards = h.slice(h.indexOf('class="mapgrid'), h.indexOf('class="mapband fields'));
  assert.ok(!/>\s*farming\s*</.test(cards), 'no map card says "farming" any more');
  assert.ok(cards.includes('● Lv 1-10') && cards.includes('Lv 10-50'), 'the updated level range is back under the name');
  for(const m of [1,2,3,4]){U.mapM=m;assert.ok(U.V.map().includes('stages 1-5 Lv 10-20; 6-10 Lv 20-50'),'class map '+m+' states both stage-level bands')}
  U.mapM=0;
  assert.ok(cards.includes('Lv 90-99'), 'and every map carries one');
  assert.strictEqual((h.match(/class="map-node/g) || []).length, 10, 'one node per field');
  // the boss field lists the whole pool with odds, and the new ore rates
  U.mapL = 10;
  const b = U.V.map();
  assert.ok(b.includes('<b>0.9%</b>') && b.includes('poolitem') && b.includes('Each item rolls independently'), 'the boss must list its whole pool at its 6%-total rate');
  assert.ok(b.includes('0.1%'), 'boss card odds must read 0.1% (v38)');
  assert.ok(b.includes('1% each') && b.includes('2.5% each'), 'v51 ore rates: 1% per monster, 2.5% per boss');
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

t('the leaderboard renders daily, weekly and all-time stamps with kills and Base Lv',()=>{
  U.boardPeriod='weekly';U.boardStatus={api:true,on:true};U.boardCache={weekly:{label:'This week · 2026-10-05 to 2026-10-06 SGT',entries:[{rank:1,name:'Knight_One',level:42,kills:12345}]}};
  const h=U.V.board();
  for(const p of ['Daily','Weekly','All-time'])assert.ok(h.includes(p),p+' leaderboard stamp is missing');
  assert.ok(h.includes('Knight_One')&&h.includes('Lv 42')&&h.includes('12,345 kills'),'the player row shows name, current level and period kills');
  assert.ok(h.includes('data-a="boardperiod"')&&h.includes('data-a="boardrefresh"'),'the period and refresh buttons are wired');
  assert.ok(h.includes('self-reported')&&!h.includes('undefined'),'the leaderboard is honest about browser-simulated scores');
  U.boardStatus={api:false,on:false};U.boardCache={};U.boardPeriod='daily';
  assert.ok(U.V.board().includes('Sign in to a cloud account'),'the offline static game explains why no board is available');
});

t('Leaderboard is on the dock, opens from V, and refreshes on open',()=>{
  assert.ok(src.includes("board:['🏆','Leaderboard','V']"),'the dock entry must advertise the V shortcut');
  assert.ok(src.includes("const f=Object.entries(TABS).find(([,v])=>v[2]===k);if(f)openTab(f[0])"),'the shared hotkey router must use the dock entry');
  assert.ok(src.includes("if(k==='board'&&tabs.includes('board'))boardRefresh(boardPeriod)"),'opening/reopening the board must refresh its active period');
  assert.ok(src.includes("boardperiod:v=>{if(!['daily','weekly','all'].includes(v))return;boardPeriod=v;boardError='';renderWin();boardRefresh(v)"),'changing periods must request that period');
});

t('the Mastery Index tracks monster titles and consumes loose cards for permanent stat points',()=>{
  U.S=mkS('Novice');U.S.indexXp=1000;U.S.kills=500;U.S.mobKills={'0:Poring':12,'0:Mastering':1};U.S.equippedTitle=null;
  U.indexMode='mobs';let h=U.V.index();
  assert.ok(h.includes('Midgard Mastery Index')&&h.includes('Monster Hunt Ledger'),'the new dock panel should render the index header and ledger');
  assert.ok(h.includes('12 kills recorded')&&h.includes('Mastering · BOSS'),'regular mobs and bosses both get species rows');
  assert.ok(h.includes('Field Scout')&&h.includes('data-a="titleequip"'),'Index XP ranks unlock an equippable title');
  assert.strictEqual((h.match(/class="mastery-title tone-/g)||[]).length,10,'the ladder has ten designed rank seals');
  U.indexMode='cards';U.S.cardIndex={donated:1,byName:{'Poring Card':1},mastery:{'Poring Card':1},rewards:{},stats:{str:0,agi:0,dex:0,int:0,vit:0,luk:0}};
  h=U.V.index();
  assert.ok(h.includes('1/90 cards discovered')&&h.includes('<b>1/450</b> card mastery ranks'),'the album and five-rank-per-card progress are visible');
  assert.ok(h.includes('data-a="indexcard"')&&h.includes('Dedicate one'),'a loose card can advance an individual card');
  assert.ok(h.includes('data-a="cardroll"')&&h.includes('Token gacha'),'mastery ranks spend tokens on the gacha');
  assert.ok(h.includes('data-a="cardreset"'),'the gacha reset is offered once a Legendary card is loose');
  assert.ok(h.includes('STR</b> 0/25')&&h.includes('HP Leech</b> 0/3')&&h.includes('ATK %</b> 0/5'),'current values and caps stay visible beside every reward');
  // v57: the picker lists every loose Legendary so the player chooses what to sacrifice, the
  // bag list gets rarity sub-tabs, and a stack can be dedicated in one tap.
  U.S.cards=[{id:11,n:'Poring Card',g:3,stat:'str',v:4},{id:12,n:'Fabre Card',g:3,stat:'agi',v:3},{id:13,n:'Poring Card',g:0,stat:'dex',v:1}];
  U.S.cardIndex.rolls=['str','str','agi'];
  h=U.V.index();
  assert.strictEqual((h.match(/data-a="cardreset"/g)||[]).length,1,'exactly one reset button now');
  assert.ok(h.includes('class="card-pick" data-a="cardpick"'),'the sacrifice is a dropdown, not a button per card');
  assert.ok(h.includes('<option value="11"')&&h.includes('<option value="12"'),'every loose Legendary is an option');
  assert.ok(!h.includes('<option value="13"'),'a Common card is not offered as a sacrifice');
  assert.ok((h.match(/<option /g)||[]).length===2,'one option per loose Legendary, no more');
  assert.ok(h.includes('data-a="cardtab"')&&h.includes('Legendary <small>2</small>'),'rarity sub-tabs count the loose cards');
  assert.ok(h.includes('data-a="indexall"')&&h.includes('Insert all'),'a stack can be dedicated in one tap');
  assert.ok(h.includes('Latest rolls'),'and the newest rolls are shown, not just the totals');
  assert.ok((h.match(/class="roll-chip(?!s)/g)||[]).length===3,'at most three rolls are listed');
  assert.ok(h.indexOf('AGI</b>')<h.indexOf('STR</b>'),'newest roll first');
  assert.ok(src.includes('.roll-chips{display:flex;flex-direction:row'),'the chips are a horizontal strip, not a column');
  assert.ok(h.includes('Card Index available')&&!h.includes('(global max)'),'the loose-card list is renamed and the global-max wording is gone');
  for(const reward of ['hpPct','fleePct','leech','def','mdef','atkPct','matkPct','aspdPct','critPct'])assert.ok(src.includes("id:'"+reward+"'"),reward+' should be an available card mastery reward');
  assert.ok(h.includes('Poring Card')&&h.includes('Mastery 1/5'),'the card album keeps per-card mastery history');
  assert.ok(src.includes("if(v==='index'){openTab('index');return}"),'the Quest Board Index button opens the panel');
  assert.ok(src.includes('data-q="index"')&&src.includes("index:['📚','Mastery Index','I']"),'both Quest Board and dock link to the index');
  assert.ok(src.includes('flex-wrap:wrap;justify-content:center')&&src.includes('max-width:calc(100vw - 12px)'),'the expanded dock wraps on narrow screens');
  assert.ok(src.includes('recordMonsterKill(mob)')&&src.includes('data-a="titleequip"'),'kills are recorded and titles can be equipped from the view');
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

t('Assassin equipment UI describes and renders one two-handed Katar only',()=>{
  U.S=mkS('Assassin');U.selE='weapon';
  U.S.eq.weapon={id:88,name:'Katar',tier:3,slot:'weapon',wt:'katar',val:80,slots:4,cards:[]};
  const h=U.V.equip();
  assert.ok(h.includes('Weapons: katar'), 'the allowed weapon list should only say katar');
  assert.ok(h.includes('Two-handed Katar; no off-hand weapon'), 'the one-weapon rule should be explicit');
  assert.ok(h.includes('2H Katar'), 'the main-hand slot should identify Katar as a two-handed weapon');
  assert.ok(!h.includes('L.Hand'), 'Assassin should not get a second-hand equipment slot');
  assert.strictEqual((h.match(/empty slot/g)||[]).length,4,'a Katar should expose four card sockets');
  U.S=mkS('Archer');U.S.eq.weapon={id:89,name:'Four Slot Bow',tier:3,slot:'weapon',wt:'bow',val:80,slots:4,cards:[]};U.selE='weapon';
  const bow=U.V.equip();assert.strictEqual((bow.match(/empty slot/g)||[]).length,4,'a bow should expose four card sockets');
  U.S=mkS('Assassin');U.S.eq.weapon={id:88,name:'Katar',tier:3,slot:'weapon',wt:'katar',val:80,slots:4,cards:[]};U.selE='weapon';
  U.eqPick='weapon';const bag=U.V.bag0();
  assert.ok(bag.includes('Choosing a two-handed katar')&&bag.includes('occupies both hands'), 'the chooser should explain the two-handed restriction');
  U.eqPick=null;
});

t('the equipment chooser temporarily promotes fitting gear and restores normal bag order when closed', () => {
  U.S=mkS('Swordman');U.selB=null;U.eqPick='weapon';
  const sorted=U.V.bag0();
  assert.ok(sorted.indexOf('data-a="eqpick" data-v="9:weapon"')<sorted.indexOf('data-a="selb" data-v="2"'),
    'the compatible weapon should lead the bag while the weapon slot is being filled');
  U.eqPick=null;
  const restored=U.V.bag0();
  assert.ok(restored.indexOf('data-a="selb" data-v="2"')<restored.indexOf('data-a="selb" data-v="9"'),
    'normal inventory order returns when the chooser closes');
  assert.ok(src.includes("document.addEventListener('pointerdown'")&&src.includes('if(chooserAtPointerDown&&!bagPointerInside)closeEquipmentChooser(true)'),
    'outside clicks use the chooser state captured at pointer-down even if another handler cleared it');
  assert.ok(src.includes('function closeEquipmentChooser(force=false){if(!eqPick&&!force)return;eqPick=null;selE=null;selB=null;'),
    'closing also clears the equipment selection and its detail card');
  assert.ok(src.includes("tabs.splice(i,1);const tipEl=$('tooltip')"), 'closing removes the Bag and hides its tooltip');
});

t('the Skills grid fits all five class skills and selected descriptions dismiss outside', () => {
  assert.ok(src.includes('.skg{display:grid;grid-template-columns:repeat(5,minmax(0,1fr))'), 'desktop uses five columns');
  assert.ok(src.includes('.sk-detail-card{grid-column:1/-1'), 'the description takes a full row below the skill tiles');
  assert.ok(src.includes("if(selS&&!skillInside){selS=null;if(tabs.includes('skills'))renderWin()}"), 'an outside click clears the selected detail');
  assert.ok(src.includes("skillCardPointerInside=!!(target&&target.closest('.sk-detail-card'))"), 'clicking inside the detail does not dismiss it');
});

t('skill art is local, movement slowdown is moderated, and the unchanged camera centres the hero', () => {
  assert.ok(src.includes("katar:[1250,1251,1252,1253,1254,1255]"), 'Katar gear has its own recognizable item sprites');
  assert.ok(!src.includes('https://static.divine-pride.net/images/skills/'), 'skill artwork no longer depends on hotlinked images');
  assert.ok(src.includes('class="skill-art motif-${motif}"')&&src.includes('data-motif="${motif}"'), 'each skill uses a locally drawn, themed vector gem');
  assert.ok(src.includes('.skill-art{display:block;width:46px;height:46px'), 'the vector artwork is high-resolution and not a tiny red sprite');
  const moveMatch=src.match(/const heroMoveSpeedForAgi=agi=>[^;]+;/);assert.ok(moveMatch,'AGI movement curve is missing');
  const move=new Function(moveMatch[0]+';return heroMoveSpeedForAgi')();
  const old99=6.5+99*.05,old120=6.5+120*.05;
  assert.ok(Math.abs((1-move(99)/old99)*100-29.1)<.2, 'AGI 99 keeps about half the previous slowdown: 8.12 vs 11.45');
  assert.ok(Math.abs((1-move(120)/old120)*100-30.5)<.2, 'AGI 120 keeps about half the previous slowdown: 8.68 vs 12.5');
  const focus=Number((src.match(/const CAMERA_FOCUS_Y=([\d.]+)/)||[])[1]);
  const lead=Number((src.match(/CAMERA_LEAD_Z=([\d.]+)/)||[])[1]);
  assert.strictEqual(focus,.28, 'vertical focus remains close to the hero ground line');
  assert.strictEqual(lead,.25, 'the old five-unit camera lead is reduced to a quarter unit');
  assert.ok(src.includes('ct.z+=(pl.z-CAMERA_LEAD_Z-ct.z)*.05'), 'the render loop actually follows the near-centred camera target');
  const bodyUp=(1.08-focus)*Math.cos(.95)-lead*Math.sin(.95),screenY=.5-bodyUp/(2*18*Math.tan(38*Math.PI/360));
  assert.ok(screenY>.45&&screenY<.50, 'a normal desktop view projects the avatar centre just above screen centre (at '+(screenY*100).toFixed(1)+'%)');
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
  assert.ok(src.includes('.xp-side{position:relative;flex:0 0 50%;min-width:0;cursor:default;'),
    'no help cursor on the EXP bars');
  assert.ok(!/class="xp-side"[^>]*title=/.test(src),'neither EXP bar may carry a title');
  assert.ok(src.includes('#jb{left:auto;right:0;'),'Job fill must originate at the right edge');
  assert.ok(src.includes('.xp-pct{left:50%;transform:translateX(-50%)}'),'each percentage is centred within its half');
  assert.ok(src.includes('#hpb.critical{background:linear-gradient('),'low HP must use a red treatment');
  const box={};vm.createContext(box);
  vm.runInContext(`
    const nodes={};const $=id=>nodes[id]||(nodes[id]={style:{},textContent:'',title:'',attrs:{},
      classList:{flags:{},toggle(k,v){this.flags[k]=v}},setAttribute(k,v){this.attrs[k]=v}});
    let S={lv:20,exp:90,hp:31,kills:0,zeny:0},hudRate=null,zenyEarned=0,currentUser='A';
    const HUNT_TITLES=[{id:'field-scout',name:'Field Scout',kills:500}],titleUnlocked=t=>S.kills>=t.kills;
    // the pet buff chips bars() now draws: no pet buff is running in this fixture
    let petBuff={atk:0,matk:0,hp:0,leech:0,atkT:0,matkT:0,hpT:0,leechT:0},petBuffSrc={};
    ${grab('const PET_SKILLS=[', 'const petDmg=')}
    const performance={now:()=>1000},job={jl:10,jx:45},jobOf=()=>job,C=()=>({mj:50}),maxHp=()=>100,
      jneed=()=>100,need=()=>200;
    ${grab('const HUD_RATE_WINDOW=60000,HUD_IDLE_RESET=30000,HUD_RATE_REFRESH=1000;','function ui(){')}
    bars();this.__h={nodes,S,job,bars};
  `,box);
  const h=box.__h,d=h.nodes;
  assert.strictEqual(d.hpb.classList.flags.critical,false,'31% HP must stay green');
  assert.strictEqual(d.jb.style.width,'45%');assert.strictEqual(d.xpb.style.width,'45%');
  assert.strictEqual(d.jobPct.textContent,'45.0%');assert.strictEqual(d.basePct.textContent,'45.0%');
  assert.strictEqual(d.jobTrack.title,'','v36 removed the hover tooltip from the Job bar');
  assert.strictEqual(d.baseTrack.title,'','v36 removed the hover tooltip from the Base bar');
  assert.ok(d.jobTrack.attrs['aria-valuetext'].includes('45.0% to next level'),
    'the sentence still reaches screen readers through aria-valuetext');
  assert.strictEqual(d.jobTrack.attrs['aria-valuenow'],'45.0');
  h.S.hp=30;h.bars();assert.strictEqual(d.hpb.classList.flags.critical,true,'30% HP must turn red');
  h.job.jl=50;h.S.lv=150;h.bars();assert.strictEqual(d.jb.style.width,'100%');assert.strictEqual(d.xpb.style.width,'100%');
  assert.ok(d.dps&&d.dps.title.includes('Damage per second'),'bars() writes the DPS readout every second');
  assert.strictEqual(d.dps.textContent,'0','no damage banked means no DPS');
  h.S.kills=500;h.S.equippedTitle='field-scout';h.bars();
  assert.strictEqual(d.titleLabel.textContent,'✦ Field Scout','the chosen title appears beside the class in the HUD');
  assert.strictEqual(d.titleLabel.style.display,'inline-block','an equipped title is visible');
});

t('damage floats stay screen-projected, restrained, and distinct by type', () => {
  assert.ok(src.includes('.fl.damage,.fl.skill-damage,.fl.critical,.fl.skill-critical,.fl.incoming{position:absolute'),
    'combat nodes must remain absolutely anchored to projected screen coordinates');
  assert.ok(src.includes('.fl.damage{color:#fff0a6!important;-webkit-text-stroke:'),
    'ordinary damage keeps the gold treatment (now in the selected game font)');
  assert.ok(src.includes('.fl.critical,.fl.skill-critical{font:900 32px "Trebuchet MS",Verdana,sans-serif')&&!src.includes('.fl.critical::before{')&&!src.includes('>CRIT<'),
    'critical damage carries the restored explode frame (child elements, no CRIT chip)');
  assert.ok(src.includes('.fl.miss,.fl.evade{position:absolute;')&&!src.includes('border:1px solid #d9e1ec'),
    'MISS and DODGE are plain text labels with no badge frame');
  assert.ok(src.includes('#xp-track{display:flex;width:100%;height:14px')&&src.includes('#xp-dock{flex:none;width:100%;padding:3px 10px 4px'),
    'the shared Base/Job bar must be slimmer than before');
  assert.ok(src.includes('skillNameFloat(sk.n,cast-1)')&&src.includes("skillNameFloat('First Aid')")&&src.includes('skillNameFloat(s.n)'),
    'active, healing and buff skills must show a name above the caster');
  const box={};vm.createContext(box);
  vm.runInContext(`
    let S={dmgShort:true,dmgShow:true},floats=[],pl={x:2,z:4};
    ${grab('const addFloat=(x,y,z,txt,col,big,kind=', 'function log(m,cls,cat){')}
    this.__f={floats,pl,damageFloat,skillNameFloat,shortNum,numTxt,get S(){return S},set full(v){S.dmgShort=!v},
      get dmgShow(){return S.dmgShow!==false},set dmgShow(v){S.dmgShow=v==='on'||v===true}};
  `,box);
  const F=box.__f;
  F.damageFloat(1,2,3,879,false);F.damageFloat(1,2,3,1896,true);
  F.damageFloat(1,2,3,55,false,true);F.skillNameFloat('Bash',1);
  assert.deepStrictEqual(Array.from(F.floats,f=>f.kind),['damage','critical','incoming','skill']);
  assert.strictEqual(F.floats[1].txt,'1896','a critical number uses one formatter; below 100K the owner rule keeps it in full digits');
  assert.strictEqual(F.floats[0].txt,'879','numbers under a thousand keep every digit');
  assert.strictEqual(F.floats[2].txt,'55','incoming damage follows the same setting');
  // the Show toggle really hides the numbers; the style toggle only changes the digits
  F.dmgShow=false;
  F.damageFloat(1,2,3,4321,false);F.damageFloat(1,2,3,9000,true,true);
  assert.strictEqual(F.floats.length,4,'with damage numbers switched off, no damage float is pushed at all');
  F.dmgShow=true;
  assert.strictEqual(F.numTxt(1250000),'1.3M','rewards and damage share one short formatter');
  assert.strictEqual(F.numTxt(20500),'20500'); // owner rule: below 100K stays full digits
  assert.strictEqual(F.numTxt(205000),'205K');
  F.full=true;
  assert.strictEqual(F.numTxt(1250000),'1250000','and the full style prints every digit');
  assert.deepStrictEqual([100000,1000000,12500,999,1000,2500000,999999,1234567,99999].map(F.shortNum),
    ['100K','1M','12500','999','1000','2.5M','1M','1.2M','99999'],'the short form ladder: short only from 100K (owner rule)');
  F.full=true;
  F.damageFloat(1,2,3,1000000,false);F.damageFloat(1,2,3,1896,true);
  assert.strictEqual(F.floats[4].txt,'1000000','the Settings switch shows every digit');
  assert.strictEqual(F.floats[5].txt,'1896','critical digits come back too');
  const strikeBox={};vm.createContext(strikeBox);
  vm.runInContext(`
    let mob={x:1,z:3,hp:10000,size:1},shake=0,hit=null,S={dmg:0};
    const missCh=()=>0,crit=()=>100,atk=()=>100,matk=()=>200,st=()=>0,critD=()=>2,
      rnd=(a,b)=>a,addFloat=()=>{},damageFloat=(...args)=>{hit=args};
    ${grab('function strike(mult,col,magic=false,skill=false){','// Higher job tiers get more casts per swing:')}
    strike(1,'#fff');this.__hit={mob,hit,shake};
  `,strikeBox);
  assert.ok(strikeBox.__hit.hit[4]&&strikeBox.__hit.hit[3]>100&&strikeBox.__hit.shake===6,
    'actual critical strike must send its numeric damage into the burst renderer');
  assert.strictEqual(vm.runInContext('S.dmg',strikeBox)>0,true,
    'every player hit must add to the lifetime damage counter the DPS meter reads');
  assert.strictEqual(F.floats[3].anchor,'hero');assert.strictEqual(F.floats[3].y,4.03); // 3.65 base + .38 per slot (v68: banner above the head)
  const draw=grab('  floats.forEach(f=>{if(!f.el)', '  const pt=bn?');
  const scene={floats:F.floats,pl:F.pl,create:()=>({style:{}}),draw};
  vm.createContext(scene);
  vm.runInContext(`const document={createElement:()=>({style:{}})},ov={appendChild:()=>{}},scr=(x,y,z)=>[x*10,z*10];${draw}`,scene);
  assert.strictEqual(F.floats[3].el.style.left,'20px');
  F.pl.x=8;vm.runInContext(draw,scene);
  assert.strictEqual(F.floats[3].el.style.left,'80px','skill names must track the moving hero');
  assert.strictEqual(F.floats[1].el.className,'fl critical');
  const critHtml=F.floats[1].el.innerHTML;
  assert.ok(critHtml.includes('class="fburst"')&&critHtml.includes('class="fring"'),'a critical float carries the explode frame');
  assert.strictEqual((critHtml.match(/class="fstreak"/g)||[]).length,9,'a critical sprays 9 speed-line streaks');
  assert.ok(critHtml.includes('class="fburst" style="width:108px'),'the burst box is sized from the finished number (1896 -> max(64, 4*32*.84) = 108)');
  assert.strictEqual(F.floats[0].el.innerHTML,undefined,'ordinary hits stay plain text, with no frame markup');
});

t('Zeny and kill rates refresh every second using a rolling minute and reset after stalls', () => {
  assert.ok(src.includes('class="hud-zeny" id="zenyHover" tabindex="0"'),'hover area must include amount and label');
  assert.ok(src.includes('.hud-zeny:hover .hud-flyout'),'Zeny tooltip must open on hover without browser title delays');
  assert.ok(src.includes("$('zenyRate').textContent=`Zeny earned:"),'tooltip must display a live rate');
  assert.ok(src.includes('Kills/min <b id="kills"'),'kills rate must replace lifetime count');
  assert.ok(src.includes('<div>DPS <b id="dps"'),'a DPS readout must sit beside the kill rate');
  assert.ok(src.includes("dpsEl.title=`Damage per second"),'the DPS readout needs a live tooltip');
  assert.ok(src.includes('S.dmg=(S.dmg||0)+d'),'strike() and hurt() must bank every point of damage');
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

t('the DPS meter shares the rolling minute and resets with the save', () => {
  const box={};vm.createContext(box);
  vm.runInContext(`
    let S={zeny:0},zenyEarned=0;
    ${grab('function earnZeny(amount){','function kill(o){')}
    ${grab('const HUD_RATE_WINDOW=60000,HUD_IDLE_RESET=30000,HUD_RATE_REFRESH=1000;','const levelPct=')}
    this.__r={stepHudRate,S};
  `,box);
  const R=box.__r;
  let state=null;
  const s=(user,k,z,dmg,time)=>{const m=R.stepHudRate(state,user,k,z,time,dmg);state=m.state;return m};
  s('p',0,0,0,0);
  let m=s('p',0,0,10000,1000);
  assert.strictEqual(m.dps,10000,'10,000 damage in the first second reads 10,000 dps');
  m=s('p',0,0,10000,1500);assert.strictEqual(m.dps,10000,'the reading holds between whole seconds');
  m=s('p',0,0,30000,2000);assert.strictEqual(m.dps,15000,'30,000 over two seconds reads 15,000 dps');
  // a browser stall longer than 30s throws the old window away instead of spiking the meter
  m=s('p',0,0,40000,78000);assert.strictEqual(m.dps,0,'a stall longer than 30s wipes the old rate');
  m=s('p',0,0,50000,79000);assert.strictEqual(m.dps,10000,'and damage after the resume starts a new window');
  m=s('p',0,0,0,80000);assert.strictEqual(m.dps,0,'a fresh save (damage counter reset) starts at zero');
});

t('every skill has distinct local vector art and upgraded card metadata', () => {
  const missing = [...U.SKILLS].filter(s => !U.SKILL_ICON[s.id] || !U.SKILL_TONE[U.SKILL_ICON[s.id]] || !U.SKILL_PICTO[U.SKILL_ICON[s.id]]).map(s => s.id);
  assert.deepStrictEqual(missing, [], 'skills without a complete local art mapping: ' + missing.join(', '));
  assert.strictEqual(Object.keys(U.SKILL_ICON).length, U.SKILLS.length, 'the icon map must cover the whole roster without unused entries');
  assert.ok(new Set(Object.values(U.SKILL_ICON)).size >= 40, 'skill art should use many clearly different pictograms, not one placeholder');
  const art=U.SKILLS.map(s=>U.skillIcon(s.id));
  assert.ok(art.every(svg=>svg.startsWith('<svg class="skill-art motif-')&&svg.includes('<defs>')&&svg.includes('linearGradient')), 'each skill renders self-contained, shaded vector art');
  assert.strictEqual(new Set(art.map(svg=>svg.match(/id="(skgem-[^"]+)/)?.[1])).size, U.SKILLS.length, 'SVG definition IDs cannot collide between skills');
  assert.ok(!src.includes('class="ro-skill-icon"'), 'there are no externally loaded red skill placeholders');
  U.S = mkS('Mage'); U.selS = null;
  const h = U.V.skills();
  assert.ok(h.includes('class="sk-head"') && h.includes('class="sk-kind"'), 'cards show the skill category');
  assert.ok(h.includes('class="si" aria-hidden="true"') && h.includes('class="skill-art motif-flame"'), 'cards show a colored fantasy icon and clear level');
  assert.ok(h.includes('class="sk-name"') && h.includes('aria-label="Increase Fire Bolt"'), 'skill labels and upgrade buttons are accessible');
  assert.ok(/\.skg\{[^}]*repeat\(5,minmax\(0,1fr\)\)/.test(src) && src.includes('.sk .si{width:48px;height:48px'), 'the five-skill grid uses large, polished vector tiles');
});

t('Settings shows a clean character card: preview, costume note, no wall of text', () => {
  U.S = mkS('Assassin Cross'); U.S.sex = 'f'; U.S.hair = 7;
  const h = U.V.set();
  assert.ok(h.includes('id="hairPreview"') && h.includes('id="hairPreviewLoading"'), 'a canvas preview has a loading fallback');
  assert.ok(h.includes('Live female Assassin Cross class skin preview'), 'the preview describes the current class and gender');
  assert.ok(h.includes('LIVE PREVIEW') && h.includes('Female &middot; animating'), 'labelled plainly as the live animation');
  assert.ok(h.includes('Costumes - outfits that restyle a class without touching its stats - are planned for a future patch.'),
    'the hairstyle slot is honestly described as a future costume feature');
  assert.ok(/data-a="costume" disabled/.test(h), 'and the costume button is visibly not live yet');
  assert.ok(!h.includes('data-a="hair"'), 'the retired hairstyle arrows are gone');
  for (const gone of ['no idle animation', 'only High Priest has its own straight-up N', 'the supplied SE swing, mirrored',
                      'the held-weapon art is switched off', 'style 8 of 19'])
    assert.ok(!h.includes(gone), 'the settings tab no longer explains engine internals: ' + gone);
  assert.ok(!/aria-label="Previous hairstyle"/.test(h), 'no dead hair controls either');
  assert.ok(src.includes("if(tabs.includes('set'))drawAppearancePreview();") &&
            src.includes("if(tabs.includes('job'))drawClassPreview();"),
    'the game loop redraws whichever preview is open, so it animates');
  assert.ok(src.includes('ctx.drawImage(f.img,f.sx+ax-bw/2,ay-bh+6,bw,bh,0,0,cv.width,cv.height);'),
    'the preview draws the whole current animation frame around the art anchor');
  assert.ok(src.includes("const p=skinPack(cls,sex),f=p?skinFrameOf(p,'S'):null;"),
    'reading the frame the file\'s own delays say is due');
  assert.ok(src.includes('captureSkinFrame(heroSpr,route)'), 'and the in-game hero paints the due frame each render');
  assert.ok(src.includes('skinDecodePng') && src.includes("new DecompressionStream('deflate')"),
    'because the game decodes the APNG frames itself rather than trusting a hidden <img> to advance');
});

t('the class-change panel previews the class it is describing', () => {
  U.S = mkS('Knight');
  const h = U.V.job();
  assert.ok(h.includes('id="classPreview"') && h.includes('id="classPreviewLoading"'), 'the class panel has its own canvas and loading note');
  assert.ok(h.includes('male Knight class skin preview'), 'the preview describes the current class and gender');
  assert.ok(h.includes('CLASS PREVIEW') && h.includes('You wear this now'), 'with a plain label for the class you already are');
  assert.ok(h.includes('&middot; animating'), 'and the class preview is labelled as the animation too');
  assert.ok(!h.includes('S (front) view'), 'without the retired view essay');
  assert.ok(h.includes('What this class looks like') || h.includes('You wear this now'), 'and a label for a class you are only looking at');
  const g = h.match(/.{0,40}undefined.{0,40}/);
  assert.ok(!g, 'the class panel renders without undefined values: ' + (g ? g[0] : ''));
});

t('the character + class panels show the class-collection bonus', () => {
  U.S = mkS('Knight');                          // tier 2 at lv 60: bonus dormant
  let h = U.V.stats();
  assert.ok(h.includes('Class collection'), 'collection progress must be visible on the character panel');
  assert.ok(h.includes('Class collection: 0/6 transcendent'), 'only transcendent classes count, and the total is data-driven');
  assert.ok(h.includes('at Base Lv 100+')&&h.includes('permanent'), 'the v51 rule is spelled out: earned per transcendent class at 100+, kept account-wide');
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
  assert.ok(h.includes('Player ATK +15% for 30s, 60s cooldown'),'a buff must state its 30s/60s timing');
  assert.ok(h.includes('Single target: 2.25× pet damage'),'an attack skill must state its multiplier');
  assert.ok(h.includes('Reroll both skills'),'the gacha rerolls the whole loadout');
  assert.ok(h.includes('Twelve skills: 4 player buffs, 2 AoE attacks, 2 single-target attacks and 4 low-impact utility rolls.')&&h.includes('Gacha weights: War Cry and Arcane Blessing 0.35× each'),'the gacha distribution and reduced buff weights must be clear');
  assert.ok(h.includes('never stack')&&h.includes('ATK and MATK buffs cannot run at the same time'),'the no-stacking rules must be on the panel');
  assert.ok(h.includes('data-a="pskill"'),'the pet skill gacha button must be present');
  // and the empty-slot state on a pet that has not rolled yet
  U.S.pets=[{id:42,sp:1,mut:0,eq:[0,0,0],skills:[],sk:[1,2,3],on:false}];U.selP=42;
  const h2=U.V.pet();
  assert.ok(h2.includes('Slot 1: <b class="r0">empty</b>')&&h2.includes('Slot 2: <b class="r0">empty</b>'),'both empty slots are offered');
  assert.ok(h2.includes('Gacha both skills'),'and the button says what it will do');
});

t('the Skills panel prints the whole tree against what a maxed line earns', () => {
  assert.ok(src.includes('<div id="hud">'), 'the on-screen status row must carry its flex-bar id');
  assert.ok(src.includes('id="heroTitle"')&&src.includes('heroTitle.style.display'), 'equipped titles must follow the player above the head');
  assert.ok(src.includes('data-a="skalloc"')&&src.includes('Auto-allocate all skills')&&src.includes('autoAllocateSkills'), 'the Skills panel must expose one-click lower-class-first allocation');
  for(const [action,helper] of [['gmindex','gmIndexTest'],['gmcard','gmCardTest'],['gmskill','gmSkillTest'],['gmpet','gmPetTest']])assert.ok(src.includes('data-a="'+action+'"')&&src.includes(helper),action+' GM controls must be available for testing the new systems');
  assert.ok(src.includes('data-v="all5000"')&&src.includes('data-v="all50000"')&&src.includes('data-v="xp1000000"'),'Index GM labels must expose the 5,000-rung, 50,000-rung and final-title scenarios');
  assert.ok(src.includes('data-v="rollAll"')&&src.includes('data-v="g6dps"')&&src.includes('data-v="g6utility"'),'GM cap and complete pet-chain fixtures must be visible');
  assert.ok(src.includes('const skTree=()=>'), 'skTree() must exist - the panel needs the tree price');
  assert.ok(src.includes('const skEarnedMax=()=>'), 'skEarnedMax() must exist');
  assert.ok(src.includes('const skCost=()=>1;'), 'a skill level costs one point (v37)');
  assert.ok(src.includes('this line\'s tree costs ${skTree()}, a maxed line earns ${skEarnedMax()}'),
    'the panel must show the tree price and the maxed-line income side by side');
  assert.ok(src.includes('Most skills cap at 10 and a few utility skills stop at 5 (RO-style)'),
    'the panel blurb must state the v59 cap rule');
  assert.ok(src.includes('job levels pay out all the way to 50'),
    'and that job levels keep paying out (the owner complaint this round fixes)');
  // and the arithmetic itself, on the real numbers
  const box = {};
  vm.createContext(box);
  vm.runInContext(`
    let S = {cls:'Lord Knight', jobs:{Novice:{jl:10,jx:0},Swordman:{jl:50,jx:0},Knight:{jl:40,jx:0},'Lord Knight':{jl:50,jx:0}}, sk:{aid:1}, skOff:{}};
    ${grab('const CD=[', 'const pm=s=>')}
    const skLine=()=>lineOf(S.cls);
    const skCost=()=>1, skCostOf=L=>L;
    const rawSkillEarned=(cls,jobs)=>skLine().reduce((a,n)=>a+Math.max(0,(((jobs[n]||{}).jl)||1)-1),0);
    const skEarned=()=>Math.min(rawSkillEarned(S.cls,S.jobs),skTree());
    const skSpent=()=>SKILLS.reduce((a,s)=>a+(skLine().includes(s.from)?skCostOf(S.sk[s.id]||0):0),0);
    const skpAvail=()=>Math.max(0,skEarned()-Math.max(0,skSpent()-(S.sk.aid?1:0)));
    const skTree=()=>Math.max(0,SKILLS.filter(s=>skLine().includes(s.from)).reduce((a,s)=>a+skCostOf(s.max),0)-(S.sk.aid?1:0));
    const skEarnedMax=()=>skTree();
    this.__s={skTree,skEarnedMax,skpAvail,SKILLS,lineOf};
  `, box);
  const K = box.__s, line = K.lineOf('Lord Knight');
  const tree = K.skTree(), max = K.skEarnedMax();
  assert.strictEqual(max, tree, 'a maxed line must expose exactly the tree budget: ' + tree + ' of ' + max);
  // this fixture has the Knight at Job 40, so it has earned 146 - still far above the v59 139-point tree
  assert.strictEqual(K.skpAvail(), 139, 'a maxed Lord Knight has exactly its 139-point tree budget');
  assert.ok(tree <= 146, 'the tree must fit inside a mid-promotion job history');
  console.log('       Lord Knight: tree ' + tree + ' pts of ' + max + ' earned at max job level');
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
    let S={inv:[],cards:[],ore:{ori:0,elu:0},auto:false,zeny:0,autoSell:[false,false,false,false,false],clickSell:false},pl={x:1,z:2},msg='';
    const GRADE=['Common','Uncommon','Rare','Legendary'],GI=[0,1,2,4],ORE={ori:'Oridecon',elu:'Elunium'},
      RAR=[{n:'Common'},{n:'Fine'},{n:'Rare'},{n:'Epic'},{n:'Legendary'}];
    const cardTxt=c=>c.n,addFloat=()=>{},ui=()=>{},log=m=>{msg=m},qProg=()=>{},canUse=()=>false,equip=()=>{};
    const earnZeny=a=>{S.zeny+=a},save=()=>{};
    ${pick(/const BAGMAX=\d+;/, 'BAGMAX')}
    ${pick(/const autoSellOn=[^\n]*/, 'auto-sell / click-sell readers')}
    ${pick(/const sellVal=it=>[^;]+;/, 'sellVal')}
    ${grab('function collect(it){', 'function equip(id,quiet){')}
    this.__c={collect,sellVal,S,BAGMAX,get msg(){return msg},clear(){msg=''}};
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
  // v39: a ticked rarity is sold the moment it drops - the full bag never sees it
  C.S.autoSell = [false, false, true, false, false]; C.S.zeny = 0; C.clear();
  C.collect({ id: 7, name: 'Blue Robe', tier: 2, slot: 'armor', val: 40, sec: 1, lvl: 10, cards: [] });
  assert.strictEqual(C.S.inv.length, C.BAGMAX, 'an auto-sold band never enters the bag, even at the cap');
  assert.strictEqual(C.S.zeny, C.sellVal({ tier: 2, sec: 1, lvl: 10 }), 'it pays exactly the sale value');
  assert.ok(C.msg.includes('Auto-sold') && C.msg.includes('Blue Robe'), 'and says so: ' + C.msg);
  C.S.inv.length = 0; C.clear();
  C.collect({ id: 8, name: 'Abyss Blade', tier: 4, slot: 'weapon', val: 90, sec: 3, lvl: 99, cards: [] });
  assert.ok(C.S.inv.some(i => i && i.id === 8), 'an unticked rarity still lands in the bag');
  assert.ok(!C.msg.includes('Auto-sold'), 'and is not reported as sold');
  C.S.inv.length=0;C.S.zeny=0;C.S.autoSell=[false,false,true,false,false];C.clear();
  C.collect({id:9,name:'Pinned Blade',tier:2,slot:'weapon',wt:'sword',val:80,sec:1,lvl:40,locked:true,cards:[]});
  assert.ok(C.S.inv.some(i=>i&&i.id===9&&i.locked),'a locked incoming item bypasses the auto-sell filter');
  assert.strictEqual(C.S.zeny,0,'keeping a locked item pays no sale value');
  assert.ok(!C.msg.includes('Auto-sold'),'the locked item is never reported as auto-sold');
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
  assert.ok(src.includes("damageFloat=(x,y,z,amount,critical=false,incoming=false,skill=false)=>{if(S&&S.dmgShow===false)return;"), 'hiding skips the float entirely');
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


t('pet buffs are icon tiles above the status bar, and the description waits for a hover', () => {
  // markup: the strip moved out of the status bar to the bottom right of the play area
  const play = src.slice(src.indexOf('<div id="view">'), src.indexOf('<div id="hud">'));
  const bar = src.slice(src.indexOf('<div id="hud">'), src.indexOf('<div id="xp-dock"'));
  assert.ok(play.includes('id="hudBuffs"'), 'the pet buff strip must live in the play area, above the status bar');
  assert.ok(!bar.includes('hudBuffs'), 'the status bar itself must not carry buff chips any more');
  assert.ok(src.includes('#hudBuffs{position:absolute;right:12px;bottom:12px'),
    'the strip is pinned to the far right, directly above the status bar');
  assert.ok(!/\.pbf\b/.test(src), 'the old text chips are gone');
  assert.ok(src.includes('.pbx-fly{') && src.includes('.pbx:hover .pbx-fly,.pbx:focus .pbx-fly{opacity:1;visibility:visible}'),
    'the tile is an icon, and the description is hidden until it is hovered or focused');
  // the real bars(), with two buffs running and two not
  const box = {}; vm.createContext(box);
  vm.runInContext(`
    const nodes={};const $=id=>nodes[id]||(nodes[id]={style:{},textContent:'',title:'',attrs:{},
      classList:{flags:{},toggle(k,v){this.flags[k]=v}},setAttribute(k,v){this.attrs[k]=v}});
    let S={lv:20,exp:90,hp:80,kills:0,zeny:0},hudRate=null,zenyEarned=0,currentUser='A';
    const HUNT_TITLES=[{id:'field-scout',name:'Field Scout',kills:500}],titleUnlocked=t=>S.kills>=t.kills;
    let petBuff={atk:20,matk:0,hp:20,leech:0,atkT:12.4,matkT:0,hpT:3.2,leechT:0},petBuffSrc={atk:'Poring',hp:'Drops'};
    const performance={now:()=>1000},job={jl:10,jx:45},jobOf=()=>job,C=()=>({mj:50}),maxHp=()=>100,
      jneed=()=>100,need=()=>200;
    ${grab('const PET_SKILLS=[', 'const petDmg=')}
    ${grab('const HUD_RATE_WINDOW=60000,HUD_IDLE_RESET=30000,HUD_RATE_REFRESH=1000;', 'function ui(){')}
    bars();this.__b={nodes};
  `, box);
  const html = box.__b.nodes.hudBuffs.innerHTML;
  assert.strictEqual((html.match(/class="pbx"/g) || []).length, 2, 'one tile per running buff, no text rows');
  assert.ok(html.includes('War Cry') && html.includes('Vital Aura'), 'the flyout names the skill: ' + html);
  assert.ok(html.includes('Player ATK +15% for 30s, 60s cooldown') && html.includes('Max HP +15%'),
    'and carries the skill description');
  assert.ok(html.includes('Poring') && html.includes('Drops'), 'the flyout names the pet that cast it');
  assert.ok(html.includes('>13<') && html.includes('>4<'), 'the tile counts the seconds down (rounded up)');
  assert.ok(html.includes('role="status"') && html.includes('aria-label="War Cry'), 'and is readable to a screen reader');
  assert.strictEqual(box.__b.nodes.hudBuffs.style.display, 'flex', 'the strip shows while a buff runs');
});

t('the ALL switch beside First Aid pauses or resumes the whole line at once', () => {
  assert.ok(src.includes('data-a="skall"') && src.includes('skMasterTile()'), 'the master tile must be home in the Skills panel');
  // a Knight with three learned auto-cast skills, one of them already paused
  U.S = mkS('Knight'); U.S.sk = { aid: 1, bash: 3, endure: 2 }; U.S.skOff = { bash: 1 }; U.selS = null;
  let h = U.V.skills();
  const noviceRow = h.slice(h.indexOf('<div class="sec">Novice</div>'), h.indexOf('data-a="ssel" data-v="bash"'));
  assert.ok(noviceRow.includes('sk-master'), 'the master tile sits in the Novice row, beside First Aid');
  assert.ok(noviceRow.includes('sk-master off'), 'one paused skill must untick the master box');
  assert.ok(!h.includes('checked aria-label="Auto-cast every learned skill"'),
    'and it renders unticked, without anyone clicking it');
  U.S.skOff = {}; h = U.V.skills();
  assert.ok(h.includes('class="sk-master"') && h.includes('checked aria-label="Auto-cast every learned skill"'),
    'with every skill on, the box is ticked');
  assert.ok(h.includes('2 skills on this line'), 'and tells you how many it covers (passives are not auto-cast)');
  // the real switch, on a real skill roster
  const box = {}; vm.createContext(box);
  vm.runInContext(`
    let S={cls:'Knight',sk:{aid:1,bash:2},skOff:{}};
    ${grab('const CD=[', 'const pm=s=>')}
    const lv=id=>S.sk[id]||0,skOff=id=>!!(S.skOff&&S.skOff[id]);
    ${grab('const skTog=', 'const pv=k=>')}
    this.__k={skTog,skAllOn,skSetAll,get S(){return S}};
  `, box);
  const K = box.__k;
  assert.strictEqual(K.skAllOn(), true, 'everything on reads as all-on');
  K.S.skOff.bash = 1;
  assert.strictEqual(K.skAllOn(), false, 'one skill off clears the master box by itself');
  K.skSetAll(false);
  assert.deepStrictEqual(Object.keys(K.S.skOff).sort(), ['aid', 'bash'], 'switching off pauses every learned skill');
  K.skSetAll(true);
  assert.deepStrictEqual(Object.keys(K.S.skOff), [], 'switching on resumes every learned skill');
  K.S.sk = {}; assert.strictEqual(K.skAllOn(), false, 'nothing learned = nothing to switch on');
  assert.ok(src.includes('skall:()=>{const on=!skAllOn(),n=skTog().length;skSetAll(on);'),
    'the action really flips every skill, not just the one you clicked');
});

t('the Bag sells by rarity, on the drop or on a click', () => {
  U.S = mkS('Knight'); U.selB = null;
  let h = U.V.bag0();
  assert.ok(h.includes('Selling tools'), 'the bag carries the selling tools');
  const RAR_NAMES = ['Common', 'Fine', 'Rare', 'Epic', 'Legendary'];
  RAR_NAMES.forEach((n, i) => assert.ok(h.includes(`data-a="autosell" data-v="${i}"`), 'a tick for ' + n));
  assert.ok(h.includes('data-a="clicksell"') && h.includes('Click-sell: OFF'), 'click-sell starts OFF');
  assert.ok(h.includes('data-a="sellnow" ') || h.includes('data-a="sellnow"'), 'and the matching purge is offered');
  const purgeOff = h.slice(h.indexOf('data-a="sellnow"'), h.indexOf('data-a="sellnow"') + 40);
  assert.ok(purgeOff.includes('disabled'), 'with nothing ticked, "Sell matching now" is disabled');
  U.S.autoSell[2] = true;                        // Rare items: the fixture has Rare gear in the bag
  h = U.V.bag0();
  assert.ok(h.includes('class="tick on" data-a="autosell" data-v="2"'), 'a ticked rarity is highlighted');
  assert.ok(!h.slice(h.indexOf('data-a="sellnow"'), h.indexOf('data-a="sellnow"') + 40).includes('disabled'),
    'and the purge button wakes up when a ticked item is in the bag');
  // click-sell turns every plain tile into an instant sale, and says so before you press it
  U.S.clickSell = true; h = U.V.bag0();
  assert.ok(h.includes('class="grid sellmode"'), 'the grid is flagged in sell mode');
  assert.ok(h.includes('Click-sell: ON') && h.includes('sold instantly'), 'and warns what a click will do');
  assert.ok(h.includes('data-a="quicksell" data-v="2"') && !h.includes('data-a="selb" data-v="2"'),
    'plain tiles sell instead of selecting');
  assert.ok(h.includes('data-tip="2"'), 'the hover tooltip still says what the item is');
  assert.ok(src.includes('quicksell:id=>{const it=S.inv.find(x=>String(x.id)===String(id));if(!it)return;const v=sellVal(it);if(!sell(id))return;'),
    'and the action only reports a sale when sell() actually completed');
  // an inspect click still works when the mode is off
  U.S.clickSell = false; h = U.V.bag0();
  assert.ok(h.includes('data-a="selb" data-v="2"') && !h.includes('data-a="quicksell"'), 'OFF restores inspecting');
  assert.ok(!src.includes('data-a="sellbelow"'), 'the old two purge buttons are gone');
});

t('the Bag keeps insertion order, pins locked gear, and labels rarity-based equipment levels',()=>{
  U.S=mkS('Knight');U.selB=null;U.eqPick=null;U.S.clickSell=false;U.S.autoSell=[false,false,false,false,false];
  const gear=(id,name,tier,lvl)=>({id,name,tier,slot:'weapon',wt:'sword',val:30,sec:1,lvl,cards:[],aff:[]});
  const a=gear(41,'Common Blade',0,40),b=gear(42,'Legendary Blade',4,40),c=gear(43,'Rare Blade',2,40),d=gear(44,'Fine Blade',1,41);
  U.S.inv=[a,b,c];
  const order=html=>[...html.matchAll(/data-a="selb" data-v="([^"]+)"/g)].map(m=>m[1]);
  let h=U.V.bag0();
  assert.deepStrictEqual(order(h),['41','42','43'],'the current insertion order is not sorted by rarity/value');
  U.S.inv.push(d);h=U.V.bag0();
  assert.deepStrictEqual(order(h),['41','42','43','44'],'a new drop appends without moving existing items');
  c.locked=true;h=U.V.bag0();
  assert.deepStrictEqual(order(h),['43','41','42','44'],'locked gear is pinned first while unlocked gear keeps its order');
  assert.ok(h.includes('class="lockstar"')&&h.includes('title="Locked gear"'),'a locked tile carries a visible star badge');
  U.S.autoSell[2]=true;U.selB=43;U.S.lv=1;h=U.V.bag0();
  const purge=h.slice(h.indexOf('data-a="sellnow"'),h.indexOf('data-a="sellnow"')+48);
  assert.ok(purge.includes('disabled'),'a locked matching rarity cannot be bulk-sold');
  assert.ok(h.includes('Gear Lv 60')&&h.includes('reference only (no Base Lv equip restriction)'),
    'same field-level gear shows a higher Rare-grade reference level without an equip gate');
  assert.ok(h.includes('data-a="lockgear" data-v="43"')&&h.includes('aria-pressed="true"'),
    'the selected item exposes an explicit Unlock control');
  const equipButton=h.match(/<button data-a="equip" data-v="43"([^>]*)>/);
  assert.ok(equipButton&&!equipButton[1].includes('disabled'),'a reference Gear Lv 60 never blocks Base Lv 1 from equipping');
  assert.ok(src.includes('lockgear:id=>toggleGearLock(id)'),'the lock button has a live action');
});

t('locked gear requires deliberate confirmation for manual sale and is skipped by automated sales',()=>{
  const sellFn=grab('function sell(id){','// Quest goal AND reward');
  const sellValFn=pick(/const sellVal=it=>[^;]+;/,'sellVal');
  const box={};vm.createContext(box);
  vm.runInContext(`let S={inv:[],cards:[]},selB=null,modal='',confirmSale=null,earned=0;
    const iname=it=>it.name,earnZeny=v=>{earned+=v},log=()=>{},ui=()=>{},save=()=>{},ask=(m,y)=>{modal=m;confirmSale=y};
    ${sellValFn}
    ${sellFn}
    this.__sale={S,get modal(){return modal},get confirmSale(){return confirmSale},get earned(){return earned},sell,sellVal};`,box);
  const C=box.__sale,item={id:91,name:'Blue Blade',tier:2,sec:1,lvl:40,locked:true,cards:[]};C.S.inv.push(item);
  assert.strictEqual(C.sell(91),false,'a locked manual sale waits for confirmation');
  assert.ok(C.modal.includes('locked')&&C.modal.includes('Unlock it before selling'),'the confirmation warns that the gear is locked');
  assert.strictEqual(C.S.inv.length,1,'Cancel leaves the item safely in the bag');
  C.confirmSale();
  assert.strictEqual(C.S.inv.length,1,'confirming only unlocks; it never silently sells the item');
  assert.strictEqual(item.locked,false,'the confirmation unlocks the item first');
  assert.strictEqual(C.earned,0,'unlock confirmation alone pays nothing');
  assert.strictEqual(C.sell(91),true,'a second deliberate Sell action can now complete');
  assert.strictEqual(C.S.inv.length,0,'the unlocked item is sold only after that second action');
  assert.strictEqual(C.earned,C.sellVal(item),'the confirmed manual sale pays the ordinary sell value');
  assert.ok(src.includes('S.inv.filter(i=>!i.locked&&autoSellOn(i.tier))'),'bulk sell omits locked gear');
  assert.ok(src.includes('S.inv.some(i=>!i.locked&&autoSellOn(i.tier))'),'the bulk-sell button is disabled when only locked matches remain');
  assert.ok(src.includes('if(!it.locked&&autoSellOn(it.tier))'),'drop auto-sell never consumes a locked item');
});

t('the lock toggle changes saved item state in either direction',()=>{
  const lockFn=grab('function toggleGearLock(id){','const cell=');
  const box={};vm.createContext(box);
  vm.runInContext(`let target={id:7,name:'Test Blade',locked:false},calls=0;const find=id=>String(id)==='7'?target:null,iname=it=>it.name,log=()=>{},ui=()=>{},save=()=>{calls++};
    ${lockFn}
    this.__lock={target,get calls(){return calls},toggleGearLock};`,box);
  const C=box.__lock;C.toggleGearLock(7);assert.strictEqual(C.target.locked,true);assert.strictEqual(C.calls,1);
  C.toggleGearLock('7');assert.strictEqual(C.target.locked,false);assert.strictEqual(C.calls,2);
});

t('the Log window filters by category, and the on-screen feed folds away', () => {
  U.S = mkS('Knight'); U.S.logOff = {};
  U.logs.length = 0;
  U.logs.push({ m: 'Poring defeated! +10 EXP, +50 Zeny', cls: '', cat: 'kills,zeny' },
    { m: 'Picked up [Rare] Blue Robe', cls: 'r2', cat: 'gear' },
    { m: 'Got card: [Rare] Poring Card', cls: 'r2', cat: 'card' },
    { m: 'Something else happened', cls: '' });
  let h = U.V.log();
  ['zeny', 'gear', 'kills', 'card', 'pet', 'lvl', 'skill', 'quest', 'misc'].forEach(c =>
    assert.ok(h.includes(`data-a="logf" data-v="${c}"`), 'a tick for the ' + c + ' category'));
  assert.ok(h.includes('data-a="logfall" data-v="on"') && h.includes('data-a="logfall" data-v="off"'), 'All and None');
  assert.ok(h.includes('4 of 4 events shown'), 'everything is shown by default');
  assert.ok(h.includes('the on-screen log follows the same ticks'), 'and the panel says the feed follows the ticks');
  assert.ok(h.includes('Got card') && h.includes('Something else happened'), 'and every line is printed');
  U.S.logOff = { gear: 1 };
  h = U.V.log();
  assert.ok(h.includes('3 of 4 events shown'), 'unticking one box hides exactly its lines');
  assert.ok(!h.includes('Picked up [Rare] Blue Robe') && h.includes('Got card'), 'the card line survives');
  U.S.logOff = { zeny: 1 };
  h = U.V.log();
  assert.ok(h.includes('defeated!'), 'a kill line is also a zeny line, so unticking Zeny alone keeps it (Kills is on)');
  U.S.logOff = { kills: 1, zeny: 1 };
  assert.ok(!U.V.log().includes('defeated!'), 'untick both of its categories and it goes');
  U.S.logOff = { kills: 1, zeny: 1, gear: 1, card: 1, misc: 1 };
  assert.ok(U.V.log().includes('0 of 4 events shown'), 'hiding everything says so');
  // the tags really are on the real call sites
  assert.ok(src.includes("log(`Picked up [${RAR[it.tier].n}] ${it.name}`,'r'+it.tier,'gear')"), 'pickups are tagged');
  assert.ok(src.includes(",'kills,zeny');"), 'a kill is tagged as kills AND zeny');
  assert.ok(src.includes("log(`Got card: [${GRADE[it.g]}] ${cardTxt(it)}`,'r'+GI[it.g],'card')"), 'cards are tagged');
  // the on-screen log's own tab
  assert.ok(src.includes('id="feedTab"') && src.includes('id="feedWrap"'), 'the on-screen log gets a tab');
  assert.ok(src.includes("$('feedTab').onclick=()=>ACT.feed();"), 'the tab is wired');
  assert.ok(src.includes('const feedOn=()=>!(S&&S.feed===false);'), 'the fold state lives in the save, open by default');
  assert.ok(src.includes('#feedWrap.hid #feed{display:none}'), 'folding hides the lines and keeps the tab');
  // v40: the tab is deliberately quiet - semi transparent until it is hovered or focused
  assert.ok(src.includes('#feedTab{position:relative;pointer-events:auto;') && src.includes('background:rgba(59,42,26,.42)'),
    'the log tab is semi transparent while nothing is happening');
  assert.ok(src.includes('#feedTab:hover,#feedTab:focus-visible{background:rgba(59,42,26,.9);color:#ffe9a8;border-color:var(--edge)}'),
    'and reads clearly on hover or focus');
  assert.ok(src.includes('#feedTab.filt::after{'), 'a quiet dot marks a filter that is hiding lines');
  assert.ok(src.includes("b.classList.toggle('filt',hid>0);"), 'and the dot is driven by the real filter state');
  assert.ok(src.includes("feedTab();$('stageTitle')"), 'every redraw keeps the tab label honest');
  assert.ok(src.includes("feed:()=>{S.feed=!feedOn();feedTab();ui();save()}"), 'toggling it saves');
  const box = {}; vm.createContext(box);
  vm.runInContext(`
    let S={feed:true,logOff:{}};
    const $=()=>({style:{},classList:{toggle(){}},setAttribute(){},textContent:'',title:''});
    ${grab('const LOGCATS=', 'const feedOn=')}
    ${grab('const feedOn=', 'function log(')}
    this.__f={feedOn,feedTab,get S(){return S},set feed(v){S.feed=v}};
  `, box);
  assert.strictEqual(box.__f.feedOn(), true, 'the log starts unfolded');
  box.__f.feed = false;
  assert.strictEqual(box.__f.feedOn(), false, 'and stays folded once folded');
  let thrown = null; try { box.__f.feedTab(); } catch (e) { thrown = e.message; }   // LOGCATS is in scope in the real file
  assert.strictEqual(thrown, null, 'feedTab must survive a DOM without the elements: ' + thrown);
  // and the real feedDraw hides and restores lines as the ticks change
  const fbox = {}; vm.createContext(fbox);
  vm.runInContext(`
    let S={logOff:{}};
    const mk=id=>({id,children:[],appendChild(n){this.children.push(n)},set innerHTML(v){this.children=[]},get innerHTML(){return this.children.map(c=>c.textContent).join('|')}});
    const nodes={feed:mk('feed'),feedTab:Object.assign(mk('tab'),{classList:{toggle(){},contains(){}},setAttribute(){}})};
    const $=id=>nodes[id];
    ${grab('const LOGCATS=', 'const feedOn=')}
    ${grab('const feedOn=', 'function log(')}
    this.__f={draw:feedDraw,hidden:feedHidden,pass:feedPass,feedHtml:()=>nodes.feed.innerHTML,
      push:(m,cat)=>{const e={m,cls:'',cat,d:{textContent:m,remove(){}}};feedLive.push(e);feedDraw()},
      set off(v){S.logOff=v},get off(){return S.logOff}};
  `, fbox);
  const F = fbox.__f;
  F.push('Picked up [Rare] Blue Robe', 'gear');
  F.push('Poring defeated! +50 Zeny', 'kills,zeny');
  F.push('Something else happened', 'misc');
  assert.strictEqual(F.feedHtml(), 'Picked up [Rare] Blue Robe|Poring defeated! +50 Zeny|Something else happened',
    'everything reaches the on-screen feed by default');
  assert.strictEqual(F.hidden(), 0, 'nothing is hidden by default');
  F.off = { gear: 1 }; F.draw();          // ACT.logf redraws right after the tick flips
  assert.strictEqual(F.feedHtml(), 'Poring defeated! +50 Zeny|Something else happened', 'a tick hides its lines from the feed too');
  assert.strictEqual(F.hidden(), 1, 'and the dot has something to report');
  F.off = { gear: 1, kills: 1 }; F.draw();
  assert.strictEqual(F.feedHtml(), 'Poring defeated! +50 Zeny|Something else happened',
    'a two-category line survives while either of its ticks is on');
  F.off = { gear: 1, kills: 1, zeny: 1 }; F.draw();
  assert.strictEqual(F.feedHtml(), 'Something else happened', 'and goes when every one of them is off');
  F.off = {}; F.draw();
  assert.strictEqual(F.feedHtml(), 'Picked up [Rare] Blue Robe|Poring defeated! +50 Zeny|Something else happened',
    'unticking brings the history straight back');
  assert.strictEqual(F.pass({ cat: undefined }), true, 'an untagged line counts as Other and shows unless Other is hidden');
});

t('the funnel on the Logs tab opens the same tick row and folds itself away', () => {
  // markup: the row lives inside the feed wrapper, ABOVE the tab - so opening it pushes nothing
  assert.ok(src.includes('id="feedFil"') && src.includes('id="feedFilter"'), 'the funnel and its row exist');
  assert.ok(src.indexOf('id="feedFilter"') < src.indexOf('id="feedTab"'),
    'the row sits before the tab in the markup, so it opens upward and the log lines stay put');
  assert.ok(src.includes('aria-controls="feedFilter"') && src.includes('aria-expanded="false"'),
    'the funnel is a real disclosure control');
  // it really is the same row: built from the same category table as the Log window's
  const panel = src.slice(src.indexOf('function renderFeedFilter(){'), src.indexOf('const feedFilShow='));
  assert.ok(panel.includes('p.innerHTML=LOGCATS.map('), 'the row must be built from the one category table');
  assert.ok(panel.includes('data-a="logf" data-v="${k}"') && panel.includes('data-a="logfall" data-v="on"')
    && panel.includes('data-a="logfall" data-v="off"'), 'with the same ticks and the same All/None shortcuts');
  U.S = mkS('Knight'); U.S.logOff = {};
  const win = U.V.log();
  const ACTIONS = ['zeny', 'gear', 'kills', 'card', 'pet', 'lvl', 'skill', 'quest', 'misc'].map(c => `data-a="logf" data-v="${c}"`);
  ACTIONS.forEach(a => assert.ok(win.includes(a), 'the Log window prints ' + a));
  // it folds away by itself, holds while you interact, and Escape closes it
  assert.ok(src.includes('const FEED_FIL_MS=7000;'), 'the row has a life span');
  assert.ok(src.includes('feedFilTimer=setTimeout(feedFilHide,FEED_FIL_MS)'), 'opening arms the fold');
  assert.ok(src.includes("$('feedFilter').addEventListener('mouseenter',()=>{if(feedFilTimer)clearTimeout(feedFilTimer)})"),
    'hovering the row holds it open');
  assert.ok(src.includes("$('feedFilter').addEventListener('mouseleave',()=>{if(feedFilShown)feedFilArm()})"),
    'and leaving restarts the countdown');
  assert.ok(src.includes("$('feedFilter').addEventListener('focusin'") && src.includes("$('feedFilter').addEventListener('focusout'"),
    'keyboard focus holds it open too');
  assert.ok(src.includes("if(k==='ESCAPE'){if(feedFilShown){feedFilHide();return}tabs.pop();renderWin();return}"),
    'Escape closes the row before it closes a window');
  assert.ok(src.includes("$('feedFilter').onclick=e=>{feedFilArm();const b=e.target.closest('[data-a]');if(b&&!b.disabled&&ACT[b.dataset.a])ACT[b.dataset.a](b.dataset.v)}"),
    'the row delegates to the same actions as the window');
  assert.ok(src.includes('if(feedFilShown)renderFeedFilter();feedDraw();ui();save()'),
    'flipping a tick from either row re-renders both');
  assert.ok(src.includes('if(!on&&feedFilShown)feedFilHide()}'), 'folding the log hides the row with it');
  // and the whole thing, run for real against a stub DOM
  const box = {}; vm.createContext(box);
  vm.runInContext(`
    let S={logOff:{gear:1}};
    const mk=()=>{const o={style:{},attrs:{},cls:{},innerHTML:''};
      o.classList={toggle(k,v){o.cls[k]=v},add(k){o.cls[k]=true},remove(k){o.cls[k]=false}};
      o.setAttribute=(k,v)=>{o.attrs[k]=v};o.addEventListener=()=>{};return o};
    const nodes={feedFilter:mk(),feedFil:mk()};
    const $=id=>nodes[id];
    let timers=[];const clearTimeout=()=>{timers=[]};const setTimeout=(f,ms)=>{timers.push({f,ms});return 1};
    ${grab('const LOGCATS=', 'function log(m,cls,cat){')}
    this.__p={toggle:feedFilToggle,show:feedFilShow,hide:feedFilHide,arm:feedFilArm,
      shown:()=>feedFilShown,fil:nodes.feedFil,panel:nodes.feedFilter,timers:()=>timers,
      set off(v){S.logOff=v}};
  `, box);
  const P = box.__p;
  assert.notStrictEqual(P.panel.style.display, 'flex', 'the row starts folded away (the CSS keeps it hidden until inline style overrides it)');
  assert.strictEqual(P.shown(), false, 'and says so');
  P.toggle();
  assert.strictEqual(P.panel.style.display, 'flex', 'the funnel opens the row');
  assert.strictEqual(P.shown(), true, 'and it stays open until the timer fires');
  assert.strictEqual(P.fil.attrs['aria-expanded'], 'true', 'the funnel reports it is open');
  assert.strictEqual(P.fil.cls.on, true, 'and lights up while it is');
  assert.strictEqual(P.timers().length, 1, 'exactly one fold is armed');
  assert.strictEqual(P.timers()[0].ms, 7000, 'after seven seconds');
  assert.ok(P.panel.innerHTML.includes('data-v="gear"'), 'the row carries the ticks: ' + P.panel.innerHTML.slice(0, 80));
  assert.ok(P.panel.innerHTML.includes('All') && P.panel.innerHTML.includes('None'), 'and the two shortcuts');
  ACTIONS.forEach(a => assert.ok(P.panel.innerHTML.includes(a), 'the funnel row prints the same tick: ' + a));
  assert.strictEqual((P.panel.innerHTML.match(/data-a="logf"/g) || []).length,
    (win.match(/data-a="logf"/g) || []).length, 'the row and the window offer exactly the same number of ticks');
  // the ticks mirror the saved filter: gear is hidden in this fixture, everything else shows
  const gear = P.panel.innerHTML.slice(P.panel.innerHTML.indexOf('data-v="gear"'), P.panel.innerHTML.indexOf('data-v="gear"') + 90);
  assert.ok(!gear.includes('checked'), 'a hidden category renders unticked');
  assert.ok(/data-v="card"[^>]*checked/.test(P.panel.innerHTML), 'and a shown one renders ticked');
  P.timers()[0].f();                       // the self-fold, fired by hand
  assert.strictEqual(P.panel.style.display, 'none', 'after the timeout the row folds itself away');
  assert.strictEqual(P.shown(), false, 'and stops reporting as open');
  assert.strictEqual(P.fil.attrs['aria-expanded'], 'false', 'the funnel goes quiet again');
  P.toggle(); P.hide();
  assert.strictEqual(P.panel.style.display, 'none', 'and the funnel itself closes it too');
});

t('the Index remembers every map ledger you opened, across re-renders', () => {
  U.S = mkS('Novice'); U.indexMode = 'mobs';
  let h = U.V.index();
  assert.ok(h.includes('data-a="idxmap" data-v="mobs:0"'), 'every map ledger is a persistent section, not a native details');
  assert.ok(/data-v="mobs:0"[^>]*open/.test(h), 'the map you are on starts open');
  assert.ok(!/data-v="mobs:1"[^>]*open/.test(h), 'other maps start collapsed');
  U.indexToggleSection('mobs', 1);
  h = U.V.index();
  assert.ok(/data-v="mobs:1"[^>]*open/.test(h), 'opening another map keeps it open');
  U.S.mp = 1; h = U.V.index();                       // a kill/level-up re-render in the background
  assert.ok(/data-v="mobs:1"[^>]*open/.test(h), 'the re-render no longer slams the map you are reading shut');
  U.indexToggleSection('mobs', 1); h = U.V.index();  // click it shut on purpose
  assert.ok(!/data-v="mobs:1"[^>]*open/.test(h), 'a section you closed stays closed, even when it is the current map');
  U.indexMode = 'cards'; h = U.V.index();
  assert.ok(h.includes('data-a="idxmap" data-v="cards:0"'), 'the card album gets the same memory');
  assert.ok(!/data-v="cards:0"[^>]*open/.test(h), 'and keeps its own open/closed state per tab');
  assert.ok(src.includes("if(b.dataset.a==='idxmap'&&e.target.closest('summary'))e.preventDefault();"), 'the native details toggle is suppressed so it cannot fight the re-render');
});

t('the equipped title is a small transparent gold seal under the feet, with its rank mark', () => {
  assert.ok(/id="heroTitleMark"/.test(src) && /heroTitleMark\.textContent=equipped\.mark/.test(src), 'the title glyph rides on the left as the logo');
  assert.ok(/scr\(pl\.x,0\.16,pl\.z\)/.test(src), 'the seal is projected at the feet, not above the head');
  assert.ok(/\.hero-title\{[^}]*background:transparent/.test(src), 'no fill behind the name');
  assert.ok(/\.hero-title\{[^}]*border:1px solid #e8c25a/.test(src), 'a thin gold frame instead');
  assert.ok(/\.hero-title\{[^}]*transform:translate\(-50%,3px\)/.test(src), 'and it hangs below the anchor point');
  assert.ok(!/\.hero-title\{[^}]*background:linear-gradient/.test(src), 'the old parchment fill is gone');
});

t('the detail card opens directly under the clicked slot or bag tile, not at the window bottom', () => {
  U.S = mkS('Knight'); U.selB = null; U.eqPick = null;
  U.selE = 'head'; let e = U.V.equip();
  assert.ok(e.includes('doll-detail'), 'the equipment detail card rides inside the doll');
  assert.ok(e.indexOf('doll-detail') < e.indexOf('data-v="weapon"'), 'a head click puts refine/cards under the head row, above the hands row');
  U.selE = 'acc2'; e = U.V.equip();
  assert.ok(e.indexOf('data-v="leg"') < e.indexOf('doll-detail'), 'a feet-row click puts the card after the legs row');
  assert.ok(e.indexOf('refineUI') === -1, 'the card is real markup, not a raw call');
  U.selB = 9; let b = U.V.bag0();
  assert.ok(b.includes('mob-card grid-detail'), 'the bag detail card sits inside the grid');
  assert.ok(b.indexOf('grid-detail') > b.indexOf('data-a="selb" data-v="9"'), 'right after the tile you clicked');
  assert.ok(!b.includes('Click an item to see its stats'), 'the old bottom hint card is not repeated under the grid');
  U.selB = null; b = U.V.bag0();
  assert.ok(!b.includes('grid-detail') && b.includes('Click an item to see its stats'), 'with nothing selected the quiet hint is all that shows');
});

t('refine controls sit with the piece: the ladder is the v51 30%-nerfed one', () => {
  U.S = mkS('Knight'); U.selE = 'weapon'; U.eqPick = null;
  U.S.eq.weapon = { id: 1, name: 'Claymore', tier: 2, slot: 'weapon', wt: 'sword', val: 90, r: 3, sec: 1, slots: 1, cards: [] };
  U.S.cards = [{ id: 4, n: 'Poring Card', stat: 'str', g: 1, v: 3, card: true }];
  const e = U.V.equip();
  assert.ok(e.indexOf('Refine') > -1 && e.indexOf('Insert card') > -1, 'the weapon shows both sections');
  assert.ok(e.indexOf('Refine') < e.indexOf('Insert card'), 'Refine comes before the long card-insert list, not after it');
  assert.ok(src.includes('refCh=it=>[70,70,70,70,49,42,35,28,21,14][it.r||0]'), 'the refine chance table is the nerfed one');
  assert.ok(src.includes('ore:true,oreCh:l===10?.01:.005') && src.includes('ore:true,oreCh:.025'), 'regular mobs drop both ores at 0.5% / 1%, Stage 10 boss at 2.5%');
});

t('worn equipment can never be auto-sold or bulk-sold', () => {
  const sellValFn = pick(/const sellVal=it=>[^;]+;/, 'sellVal');
  const sellnowFn = grab('sellnow:()=>{', 'clicksell:');
  const box = {}; vm.createContext(box);
  vm.runInContext(`let S=null,selB=null,z=0,sold=0;const earnZeny=v=>{z+=v},log=()=>{},ui=()=>{},save=()=>{sold++};
    const autoSellOn=t=>!!(S.autoSell&&S.autoSell[t]);
    ${sellValFn}
    const ACT={${sellnowFn}};
    this.__bulk={set S(v){S=v},get S(){return S},get z(){return z},get saved(){return sold},ACT};`, box);
  const C = box.__bulk;
  const worn = { id: 1, name: 'Worn Claymore', tier: 4, slot: 'weapon', val: 900, sec: 3, locked: false, cards: [] };
  const bag = { id: 2, name: 'Spare Claymore', tier: 4, slot: 'weapon', val: 800, sec: 3, locked: false, cards: [] };
  C.S = { inv: [bag], cards: [], eq: { weapon: worn, armor: null, head: null, off: null, acc1: null, acc2: null, leg: null },
          autoSell: [false, false, false, false, true], zeny: 0 };
  C.ACT.sellnow();
  assert.strictEqual(C.S.inv.length, 0, 'the matching bag copy is the one that sells');
  assert.strictEqual(C.S.eq.weapon, worn, 'the worn weapon is untouched: equipment is not in the bag list');
  assert.ok(C.z > 0, 'the sale still paid out');
  assert.ok(src.includes('S.inv.filter(i=>!i.locked&&autoSellOn(i.tier))'), 'bulk sell only ever reads S.inv');
  assert.ok(src.includes('if(!it.locked&&autoSellOn(it.tier)){const v=sellVal(it)'), 'drop auto-sell only ever reads S.inv');
  assert.ok(src.includes('const i=S.inv.findIndex(x=>String(x.id)===String(id))'), 'manual Sell searches the bag, never S.eq');
});

t('the reset buttons explain themselves, refuse on screen, and survive a rebuild', () => {
  const pts = pick(/const totalPts=\(\)=>[^\n]*/, 'totalPts/rcost');
  const deniedFn = grab('function denied(cost,what){', 'function log(');
  const rstat = src.match(/rstat:\(\)=>\{[\s\S]*?save\(\)\}/)[0];
  const box = {}; vm.createContext(box);
  vm.runInContext(`let S=null;const logs=[],floats=[];let saves=0,uis=0;
    const log=m=>logs.push(m),addFloat=(x,y,z,t)=>floats.push(t),ui=()=>uis++,save=()=>saves++;
    const maxHp=()=>900;const pl={x:0,z:0};
    ${pts}
    ${deniedFn}
    const ACT={${rstat}};
    this.__r={set S(v){S=v},get S(){return S},get logs(){return logs},get floats(){return floats},get saves(){return saves},ACT};`, box);
  const R = box.__r;
  // below Base 20 the reset is free: it must work with an empty wallet (v56)
  R.S = { lv: 12, zeny: 0, st: { str: 30, agi: 20, dex: 20, int: 5, vit: 20, luk: 5 }, pts: 0, hp: 100 };
  R.ACT.rstat();
  assert.strictEqual(R.S.zeny, 0, 'a free reset must not charge anything');
  assert.deepStrictEqual(R.S.st, { str: 1, agi: 1, dex: 1, int: 1, vit: 1, luk: 1 }, 'the free reset really resets');
  assert.strictEqual(R.saves, 1, 'the free reset saves');
  assert.ok(!/Not enough/.test(R.logs[0] || ''), 'the free reset is not refused');
  // Lv30 with 500z cannot afford 1,500z: the refusal has to be visible, not just logged
  R.S = { lv: 30, zeny: 500, st: { str: 30, agi: 20, dex: 20, int: 5, vit: 20, luk: 5 }, pts: 0, hp: 100 };
  const savesBefore = R.saves;
  R.ACT.rstat();
  assert.strictEqual(R.S.zeny, 500, 'nothing is charged when the reset is refused');
  assert.strictEqual(R.S.st.str, 30, 'a refused reset leaves the stats alone');
  assert.ok(/Not enough Zeny/.test(R.logs[R.logs.length - 1]), 'the refusal is logged');
  assert.strictEqual(R.floats.length, 1, 'the refusal also floats over the character');
  assert.strictEqual(R.saves, savesBefore, 'a refused reset does not save');
  // the button itself says why it is dead, and what a working reset costs
  U.S = mkS('Novice'); U.S.lv = 30; U.S.zeny = 500;
  const poor = U.V.stats();
  assert.ok(/data-a="rstat"[^>]*disabled title="You need 1,500 Zeny to reset stats"/.test(poor),
    'an unaffordable reset button is disabled and explains the price');
  assert.ok(/Reset stats \(1[,.]?500z\)/.test(poor), 'the price is on the button (got ' + (poor.match(/Reset stats \([^)]*\)/) || ['none'])[0] + ')');
  U.S.zeny = 5000;
  assert.ok(!/data-a="rstat"[^>]*disabled/.test(U.V.stats()), 'affordable resets are clickable');
  U.S.lv = 15;
  assert.ok(U.V.stats().includes('Reset stats (free below Base 20)'), 'the free band is on the label');
  // a click whose press and release span a kill's renderWin() must not be swallowed
  assert.ok(/if\(winPress\)\{winDirty=true;return\}/.test(src), 'renderWin must defer while a pointer is down');
  assert.ok(/addEventListener\('pointerup',winUp\)/.test(src), 'the deferred rebuild runs on pointerup');
  assert.ok(/\$\('wins'\)\.addEventListener\('pointerdown'/.test(src), 'the guard arms on a window press');
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
