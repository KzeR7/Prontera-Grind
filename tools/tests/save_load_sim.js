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
// v88.6: load() refuses a save stamped for another account, so the stamp helpers come along with it.
const stamp = grab('// ---------- the save-owner stamp (v88.6) ----------', 'const num_= (v,d)');
const code = [arena, grab('const CD=[', 'const fresh=()=>'), grab('const fresh=()=>', 'const saveKey='), stamp, 'function loadRaw(){' + body + '}'].join('\n');

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
  prog:[1,1,1,1,1], auto:true, adv:true, q:null, ore:{ori:3,elu:0}, refineScrolls:7, gm:false, gmx:100,
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
currentUser = 'Owner';   // the account this browser is loading (v88.6: a save names its owner); the game's own let declares it
const newQuest = () => ({type:'kill', goal:1, prog:0, z:0, xp:0});
this.__l = {loadRaw, setRaw: v => { RAW = JSON.stringify(v) }, setState:v=>{S=v}, getState:()=>S, emptyCardIndex, recordMonsterKill, donateCardToMastery, cardMasteryTotal, cardMasteryEarned, cardMasteryAvailable, cardMasteryRolled, cardMasteryStat, cardMasteryGacha, cardMasteryReset, cardMasteryLegendaryCard, cardMasteryLegendaryCards, donateAllToMastery, cardMasteryLevel, CARD_REWARD_OPTIONS, indexXpForCount, INDEX_MOB_MILESTONES, INDEX_MILESTONE_XP, INDEX_TITLES, MONSTER_INDEX, CARD_NAMES, CARD_REWARD_CAPS, CARD_REWARD_IDS};
`;
const sb = { console };
vm.createContext(sb); vm.runInContext(harness, sb);
const f = sb.__l.loadRaw();
const load = () => sb.__l.loadRaw();
// act()/pas()/tos() build most skills, but First Aid is an inline object literal
const SRC_SKILL_IDS = new Set([
  ...[...src.matchAll(/"id":"([a-zA-Z]+)"/g)].map(m => m[1]),
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
t('v90: inert Refine Scroll reserves survive save/load and repair legacy or junk values', () => {
  assert.strictEqual(f.refineScrolls, 7, 'the saved placeholder count loads intact');
  assert.strictEqual(JSON.parse(JSON.stringify(f)).refineScrolls, 7, 'the count is plain JSON state for local/cloud saves');
  const legacy = { ...save }; delete legacy.refineScrolls;
  sb.__l.setRaw(legacy);
  assert.strictEqual(load().refineScrolls, 0, 'older saves default to an empty reserve');
  sb.__l.setRaw({ ...save, refineScrolls: 4.9 });
  assert.strictEqual(load().refineScrolls, 4, 'fractional counts are floored');
  sb.__l.setRaw({ ...save, refineScrolls: 'not a number' });
  assert.strictEqual(load().refineScrolls, 0, 'junk values are repaired to zero');
  sb.__l.setRaw(save);
});
t('legacy Assassin daggers and off-hand weapons are preserved in the bag, not worn',()=>{
  for(const cls of ['Assassin','Assassin Cross']){
    const old={...JSON.parse(JSON.stringify(save)),cls,
      eq:{weapon:{id:901,slot:'weapon',wt:'dagger',name:'Dagger',val:20,aff:[],cards:[]},
        armor:null,head:null,off:{id:902,slot:'weapon',wt:'katar',name:'Old off-hand Katar',val:25,aff:[],cards:[]},
        leg:null,acc1:null,acc2:null},inv:[]};
    const box={};vm.createContext(box);
    const custom=harness.replace(/const lsGet = \(\) => .*?;/,'const lsGet = () => '+JSON.stringify(JSON.stringify(old))+';');
    vm.runInContext(custom,box);const migrated=box.__l.loadRaw();
    assert.strictEqual(migrated.eq.weapon.id,901,cls+' v80: a main-hand dagger is legal now and stays worn');
    assert.strictEqual(migrated.eq.off,null,cls+' must not retain an off-hand katar');
    assert.deepStrictEqual(Array.from(migrated.inv,x=>x.id).sort(),[902],cls+' gear should be stowed without being lost');
    const valid={...old,eq:{weapon:{id:903,slot:'weapon',wt:'katar',name:'Valid Katar',val:30,aff:[],cards:[]},armor:null,head:null,off:null,leg:null,acc1:null,acc2:null},inv:[]};
    const validBox={};vm.createContext(validBox);
    vm.runInContext(harness.replace(/const lsGet = \(\) => .*?;/,'const lsGet = () => '+JSON.stringify(JSON.stringify(valid))+';'),validBox);
    assert.strictEqual(validBox.__l.loadRaw().eq.weapon.id,903,cls+' must keep a legal main-hand Katar on load');
  }
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

t('gear locks persist while missing or malformed lock flags repair to unlocked',()=>{
  const raw=JSON.parse(JSON.stringify(save));
  raw.inv=[
    {id:301,name:'Locked Blade',slot:'weapon',wt:'sword',tier:2,val:40,locked:true,cards:[]},
    {id:302,name:'Legacy Blade',slot:'weapon',wt:'sword',tier:1,val:20,cards:[]},
    {id:303,name:'Malformed Lock',slot:'weapon',wt:'sword',tier:1,val:20,locked:'true',cards:[]}
  ];
  raw.eq.weapon.locked=true;
  sb.__l.setRaw(raw);const repaired=load();
  assert.strictEqual(repaired.inv[0].locked,true,'a deliberate bag lock survives');
  assert.strictEqual(repaired.inv[1].locked,false,'legacy items default to unlocked');
  assert.strictEqual(repaired.inv[2].locked,false,'malformed truthy data cannot accidentally lock or sell gear');
  assert.strictEqual(repaired.eq.weapon.locked,true,'locks persist on equipped gear too');
  sb.__l.setRaw(save);
});

t('card values are repaired per stat, not flattened to CV[grade]', () => {
  const byId = id => f.cards.find(c => c.id === id);
  assert.strictEqual(byId(1).v, 192, 'a Legendary HP card should repair to 16*12, not the stale 5');
  assert.strictEqual(byId(2).v, 10, 'a Rare STR card should repair to round(CV[2]) = 10');
  assert.strictEqual(byId(3).v, 6, 'an unknown stat should fall back to round(CV[grade 1]) = 6, not crash');
});

t('v75: the bond ledger round-trips, and a save without one starts empty', () => {
  // S.bond is the per-species count of folded duplicates. It has to survive a cloud save and a
  // reload like any other field, and an older save must arrive with it empty rather than absent.
  assert.ok(Array.isArray(f.bond), 'a folded-duplicate ledger exists after load');
  // the fixture's three pets are three different species, so nothing was folded into them
  assert.strictEqual(f.bond.reduce((a, b) => a + (Number(b) || 0), 0), 0, 'a save with no duplicates starts at zero');
  const round = JSON.parse(JSON.stringify(f));
  assert.ok(Array.isArray(round.bond) && round.bond.length === f.bond.length, 'the ledger is plain JSON, so the round trip keeps it');
  // and the sweep that folds an old save's duplicates lives in the game, guarded for old pages
  assert.ok(/function foldDupPets\(\)\{/.test(src), 'foldDupPets() must exist');
  assert.strictEqual((src.match(/foldDupPets\(\);/g) || []).length, 2, 'and run on both login paths (local and cloud)');
});
t('legacy saves default the monster ledger, card album, and equipped title safely',()=>{
  assert.deepStrictEqual(Object.keys(f.mobKills),[]);
  assert.strictEqual(f.equippedTitle,null);
  assert.strictEqual(f.cardIndex.donated,0);
  assert.deepStrictEqual(Object.keys(f.cardIndex.byName),[]);
  assert.deepStrictEqual(Object.values(f.cardIndex.stats),[0,0,0,0,0,0]);
});

t('mastery records, title unlocks, and bounded permanent stats survive load repair',()=>{
  const mastered={...save,kills:500,indexXp:1000,equippedTitle:'field-scout',mobKills:{'0:Poring':4.9,'0:Mastering':1,'999:Missing':77},
    cardIndex:{donated:10,byName:{'Poring Card':3,'Unused Card':0},stats:{str:1,vit:3,luk:-4,other:9}}};
  const box={};vm.createContext(box);
  vm.runInContext(harness.replace(/const lsGet = \(\) => .*?;/,'const lsGet = () => '+JSON.stringify(JSON.stringify(mastered))+';'),box);
  const repaired=box.__l.loadRaw();
  assert.strictEqual(repaired.equippedTitle,'field-scout');
  assert.deepStrictEqual(JSON.parse(JSON.stringify(repaired.mobKills)),{'0:Poring':4,'0:Mastering':1});
  assert.strictEqual(repaired.cardIndex.donated,10);
  assert.deepStrictEqual(JSON.parse(JSON.stringify(repaired.cardIndex.byName)),{'Poring Card':3});
  assert.strictEqual(repaired.cardIndex.stats.str,0);
  assert.strictEqual(repaired.cardIndex.stats.vit,0,'legacy global stats are migrated into gacha rolls');
  assert.strictEqual(repaired.cardIndex.stats.luk,0);
  // v51: every legacy global point that fits the caps becomes a roll (str + vit x3), even if the
  // old per-card rank ledger happened to have no room for it at the time.
  assert.deepStrictEqual(JSON.parse(JSON.stringify(repaired.cardIndex.rolls)),['str','vit','vit','vit']);
  assert.strictEqual(repaired.cardIndex.stats.other,undefined);
  assert.strictEqual(Object.values(repaired.cardIndex.stats).reduce((a,n)=>a+n,0),0);assert.strictEqual(repaired.cardIndex.mastery['Poring Card'],3);
});

t('v57 card mastery: insert-all fills a stack, and the reset sacrifices the card you pick',()=>{
  const U=sb.__l;
  const cards=[];
  for(let i=0;i<7;i++)cards.push({id:100+i,n:'Poring Card',g:0,stat:'str',v:1});
  cards.push({id:200,n:'Fabre Card',g:3,stat:'agi',v:9});
  cards.push({id:201,n:'Drops Card',g:3,stat:'dex',v:9});
  U.setState({lv:99,zeny:0,hp:100,cards,cardIndex:U.emptyCardIndex()});
  // "insert all" on a stack of 7 dedicates 5 (the rank cap) and leaves 2 in the bag
  const all=U.donateAllToMastery('Poring Card');
  assert.strictEqual(all.donated,5,'seven Poring cards fill the five ranks');
  assert.strictEqual(all.level,5,'and the entry is maxed');
  assert.strictEqual(all.left,2,'the two spare copies stay loose');
  assert.strictEqual(U.getState().cards.filter(c=>c.n==='Poring Card').length,2);
  assert.strictEqual(U.cardMasteryLevel('Poring Card'),5);
  assert.strictEqual(U.cardMasteryAvailable(),5,'each rank still pays one token');
  // a second insert-all on a maxed entry does nothing
  assert.strictEqual(U.donateAllToMastery('Poring Card').donated,0,'a maxed card refuses more copies');
  // the reset spends the Legendary the player chose, not the first in the bag
  U.cardMasteryGacha();U.cardMasteryGacha();
  assert.strictEqual(U.cardMasteryRolled(),2);
  assert.strictEqual(U.cardMasteryLegendaryCards().length,2,'both Legendaries are offered');
  const refunded=U.cardMasteryReset(201);
  assert.strictEqual(refunded,2,'the picked card pays for the reset');
  const left=U.getState().cards.map(c=>c.id);
  assert.ok(left.includes(200)&&!left.includes(201),'Drops Card was sacrificed, Fabre Card stayed');
  assert.strictEqual(U.cardMasteryRolled(),0,'every rolled stat was cleared');
  assert.strictEqual(U.cardMasteryAvailable(),5,'and every rolled token came back');
});

t('the 50,000-kill species ladder and album title endpoint are data-driven',()=>{
  const U=sb.__l;
  assert.strictEqual(JSON.stringify(Array.from(U.INDEX_MOB_MILESTONES)),JSON.stringify([10,50,250,1000,5000,10000,25000,50000]));
  assert.strictEqual(U.indexXpForCount(9),9,'the first rung arrives with the first few kills');
  assert.strictEqual(U.indexXpForCount(10),12,'the 10-kill milestone adds a small bonus');
  assert.strictEqual(U.indexXpForCount(50),56,'the second rung is at 50 kills');
  assert.strictEqual(U.indexXpForCount(1000),1029,'the 1,000-kill rung lands mid-ladder');
  assert.strictEqual(U.indexXpForCount(50000),50279,'a fully hunted species is 50,000 kills plus 279 bonus XP');
  // The last title is about twenty maxed species; the 90-species album is a separate goal.
  assert.strictEqual(U.MONSTER_INDEX.length,90,'the album is 90 species');
  assert.strictEqual(U.INDEX_TITLES.at(-1).xp,1000000,'the final title is 1m Index XP');
  assert.ok(U.INDEX_TITLES.at(-1).xp<=20*50279+1000,'~twenty maxed species, not one');
  const album=U.MONSTER_INDEX.length*50279;
  assert.strictEqual(album,4525110,'a perfect album is 4,525,110 Index XP');
  assert.ok(album>U.INDEX_TITLES.at(-1).xp*4,'so the album is a much longer, separate goal');
});

t('v51 migration: old per-rank rewards and the global track become capped gacha rolls',()=>{
  const names=['Poring Card','Fabre Card','Lunatic Card','Drops Card','Chonchon Card','Willow Card'];
  const cardIndex={donated:30,byName:Object.fromEntries(names.map(n=>[n,5])),mastery:Object.fromEntries(names.map(n=>[n,5])),
    rewards:Object.fromEntries(names.map(n=>[n,Array(5).fill('str')])),stats:{str:5,agi:0,dex:0,int:0,vit:0,luk:0}};
  const raw={...save,indexXp:1000,cardIndex};const box={};vm.createContext(box);
  vm.runInContext(harness.replace(/const lsGet = \(\) => .*?;/,'const lsGet = () => '+JSON.stringify(JSON.stringify(raw))+';'),box);
  const U=box.__l,repaired=U.loadRaw(),rolls=repaired.cardIndex.rolls;
  assert.strictEqual(rolls.filter(x=>x==='str').length,25,'the +25 STR cap survives a six-card overflow');
  assert.strictEqual(rolls.length,25,'25 of the 30 old picks survive; the five over-cap picks are the cap doing its job');
  assert.deepStrictEqual(JSON.parse(JSON.stringify(repaired.cardIndex.rewards)),{},'the retired reward ledger is emptied after migration');
  U.setState(repaired);
  assert.strictEqual(U.cardMasteryEarned(),30,'six mastered cards are 30 tokens');
  assert.strictEqual(U.cardMasteryAvailable(),5,'the migrated rolls count as spent tokens, so the over-cap five stay unspent');
  assert.strictEqual(U.cardMasteryStat('str'),25,'the migrated bonus is live');
  repaired.cards=[{id:'leg',n:'Poring Card',g:3,stat:'str',v:3}];
  const refund=U.cardMasteryReset();
  assert.strictEqual(refund,25,'the reset refunds every spent token');
  assert.strictEqual(U.cardMasteryAvailable(),30,'and all 30 tokens are spendable again');
});

t('a full card album is 450 tokens; the caps fill first and the rest wait',()=>{
  const U=sb.__l,names=Array.from(U.CARD_NAMES),state={cardIndex:U.emptyCardIndex(),cards:[]};
  for(const name of names){state.cardIndex.byName[name]=5;state.cardIndex.mastery[name]=5}
  U.setState(state);
  assert.strictEqual(U.cardMasteryTotal(),450,'five ranks across all 90 cards');
  assert.strictEqual(U.cardMasteryEarned(),450,'every rank is one token');
  assert.strictEqual(U.cardMasteryAvailable(),450,'nothing spent yet');
  let n=0;while(U.cardMasteryGacha())n++;
  const capTotal=Object.values(U.CARD_REWARD_CAPS).reduce((a,b)=>a+b,0);
  assert.strictEqual(n,capTotal,'the gacha fills every cap and then stops handing out wasted rolls');
  assert.strictEqual(U.cardMasteryAvailable(),450-capTotal,'the tokens that could not be spent stay in the bank');
  assert.strictEqual(U.cardMasteryGacha(),null,'no roll is possible while every cap is full');
  state.cards=[{id:'leg',n:'Poring Card',g:3,stat:'str',v:3}];
  state.cardIndex.rolls=[];U.setState(state);
  assert.strictEqual(capTotal,243,'the current caps total 243 rollable points');
});

t('kills and card dedication earn permanent mastery points and persist through reload',()=>{
  const box={};vm.createContext(box);vm.runInContext(harness,box);
  const U=box.__l,state={lv:1,cls:'Novice',jobs:{Novice:{jl:1,jx:0}},sk:{aid:1},kills:0,mp:0,mobKills:{},equippedTitle:null,cardIndex:U.emptyCardIndex(),
    cards:Array.from({length:5},(_,i)=>({id:'card-'+i,n:i<2?'Poring Card':'Fabre Card',g:i%4,stat:'str',v:3}))};
  U.setState(state);U.recordMonsterKill({mapIndex:0,n:'Poring'});U.recordMonsterKill({mapIndex:0,n:'Poring'});U.recordMonsterKill({mapIndex:0,n:'Mastering'});
  for(let i=0;i<5;i++)assert.ok(U.donateCardToMastery('card-'+i),'the indexed loose card should be consumed');
  assert.strictEqual(state.mobKills['0:Poring'],2);assert.strictEqual(state.mobKills['0:Mastering'],1);
  assert.strictEqual(state.cards.length,0);assert.strictEqual(state.cardIndex.donated,5);
  assert.strictEqual(state.cardIndex.byName['Poring Card'],2);assert.strictEqual(state.cardIndex.byName['Fabre Card'],3);
  assert.strictEqual(U.cardMasteryEarned(),5);assert.strictEqual(U.cardMasteryAvailable(),5);assert.deepStrictEqual(JSON.parse(JSON.stringify(state.cardIndex.mastery)),{'Poring Card':2,'Fabre Card':3});
  const rolled=U.cardMasteryGacha();assert.ok(rolled,'one token rolls one random stat');assert.strictEqual(U.cardMasteryStat(rolled),1);assert.strictEqual(U.cardMasteryAvailable(),4);
  U.setRaw(state);const round=U.loadRaw();
  assert.strictEqual(round.cardIndex.donated,5);assert.deepStrictEqual(JSON.parse(JSON.stringify(round.cardIndex.rolls)),[rolled]);
  state.cards.push({id:'leg',n:'Poring Card',g:3,stat:'str',v:3});U.setRaw(state);U.loadRaw();
  assert.strictEqual(U.cardMasteryReset(),1,'a loose Legendary card resets one roll and refunds its token');
  assert.strictEqual(U.cardMasteryAvailable(),5,'the refunded token is ready again');
  assert.strictEqual(round.mobKills['0:Poring'],2);assert.strictEqual(round.mobKills['0:Mastering'],1);
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
  // v83: a field with camps refills itself instead of being rebuilt - only a camp-less field (a
  // fresh map, the boss arena, the walk back after a defeat) still spawns on the respawn timer.
  assert.ok(/if\(!mobs\.length\)\{\s*if\(!camps\.length\)\{respawn-=dt;if\(respawn<=0\)spawn\(\)\}/.test(src),
    'the empty-field branch changed shape');
  assert.ok(/for\(const c of camps\)if\(!mobs\.some\(m=>m\.pack===c\.i\)\)/.test(src),
    'the camps must be the thing that refills an emptied field');
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
  bad.skillVersion=2; bad.cls = 'Swordman'; bad.jobs = jobs; bad.sk = sk; bad.base = {};
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
  assert.ok(/function campSites\(n\)/.test(src) && /nearestPack\(\)/.test(src), 'the random closest-camp route is missing');
  assert.ok(/pl=\{x:0,z:Z1-1\.5/.test(src), 'the player no longer starts at the near (bottom) end');
  console.log('       field depth ' + (z1 - z0) + ' units; player at Z1-1.5, three randomized packs across the arena');
});

t('the v39 tool settings repair: old saves get the quiet defaults', () => {
  // a save written before v39 knows none of the four fields
  sb.__l.setRaw({ lv: 5, cls: 'Novice', sk: { aid: 1 }, jobs: { Novice: { jl: 1, jx: 0 } } });
  const g = load();
  assert.strictEqual(g.feed, true, 'the on-screen log starts unfolded');
  assert.strictEqual(g.clickSell, false, 'a bag click inspects - it never sells - by default');
  assert.deepStrictEqual(Array.from(g.autoSell), [false, false, false, false, false, false, false], 'nothing is auto-sold (seven bands since v79: N and N+)');
  assert.deepStrictEqual(Object.keys(g.logOff), [], 'every log filter starts ticked');
  // junk of every shape must be repaired, not carried
  sb.__l.setRaw({ lv: 5, cls: 'Novice', sk: { aid: 1 }, jobs: { Novice: { jl: 1, jx: 0 } },
    feed: 'no', clickSell: 'yes', autoSell: 'junk', logOff: [] });
  const r = load();
  assert.strictEqual(r.feed, true, 'a junk fold flag falls back to open');
  assert.strictEqual(r.clickSell, false, 'a junk click-sell flag falls back to off');
  assert.deepStrictEqual(Array.from(r.autoSell), [false, false, false, false, false, false, false], 'a junk auto-sell list falls back to nothing ticked');
  assert.deepStrictEqual(Object.keys(r.logOff), [], 'a junk filter list falls back to an empty object');
  // and deliberate choices survive the round trip, index by index
  sb.__l.setRaw({ lv: 5, cls: 'Novice', sk: { aid: 1 }, jobs: { Novice: { jl: 1, jx: 0 } },
    feed: false, clickSell: true, autoSell: [1, 0, 'x', null, 1], logOff: { gear: 1 } });
  const k = load();
  assert.strictEqual(k.feed, false, 'a deliberately folded log stays folded');
  assert.strictEqual(k.clickSell, true, 'a deliberately armed click-sell stays armed');
  assert.deepStrictEqual(Array.from(k.autoSell), [true, false, false, false, true, false, false], 'every tick is read as a boolean, position by position, and the new N and N+ bands start unticked');
  // v77: a save written before the N band existed keeps its five choices and gains an unticked sixth
  sb.__l.setRaw({ lv: 5, cls: 'Novice', sk: { aid: 1 }, jobs: { Novice: { jl: 1, jx: 0 } },
    autoSell: [false, false, true, false, true] });
  assert.deepStrictEqual(Array.from(load().autoSell), [false, false, true, false, true, false, false], 'an old five-band save keeps its ticks and gains unticked N and N+ bands');
  assert.deepStrictEqual(Object.keys(k.logOff), ['gear'], 'a switched-off filter survives');
});

// v88.6 (save-owner stamp): load() never hands over another account's save. The current account is
// 'Owner' (set in the harness above); a save stamped 'Owner' loads, one stamped anyone else does not.
t('v88.6: a save stamped for another account is refused: the game gets a fresh character, not theirs', () => {
  sb.__l.setRaw(Object.assign({}, save, { owner: 'Someone Else' }));
  const g = load();
  assert.strictEqual(g.lv, 1, 'the other account\'s level is not loaded');
  assert.strictEqual(g.cls, 'Novice', 'nor its class');
  assert.strictEqual(g.base.Swordman, undefined, 'nor its per-class records');
});
t('v88.6: a save stamped for this account loads as before, and the stamp is compared without regard to case', () => {
  sb.__l.setRaw(Object.assign({}, save, { owner: 'Owner' }));
  assert.strictEqual(load().lv, 60, 'its own save loads');
  sb.__l.setRaw(Object.assign({}, save, { owner: 'owner' }));
  assert.strictEqual(load().lv, 60, 'the same account in another case is still this account');
});
t('v88.6: a save written before the stamp existed loads as it always did', () => {
  sb.__l.setRaw(save);                       // no owner field at all
  assert.strictEqual(load().lv, 60);
  assert.strictEqual(load().cls, 'Swordman');
});
sb.__l.setRaw(save);                         // leave the harness on the ordinary save

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
