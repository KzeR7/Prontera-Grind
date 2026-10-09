// Endless Echo, the damage trial (v77): the rules the owner set, executed rather than described.
//   node tools/tests/trial_sim.js
//
// The rules being tested:
//   * a run is one 3:00 sitting against a target that never dies and never hits back;
//   * practice is unlimited and pays nothing, ranked is 2 a day and pays Trial Shards;
//   * the board metric is the BEST SINGLE RUN - runs are never added together (the owner:
//     "does not combine the scold accumulated" ... "showing the best dps within 1 session");
//   * the Shard Store spends Shards and hands over exactly what it says, and refuses when broke;
//   * the run ends itself on the clock, the character and the dummy both stay put, and leaving
//     the arena puts you back in a real field.
//
// It slices the real trial module out of index.html - nothing here is a copy of the game's numbers.
const fs = require('fs'), vm = require('vm'), assert = require('assert');
const src = fs.readFileSync(__dirname + '/../../index.html', 'utf8');
const grab = (a, b) => { const i = src.indexOf(a), j = src.indexOf(b, i); if (i < 0 || j < 0) throw new Error('missing ' + a); return src.slice(i, j); };

let pass = 0, fail = 0;
const t = (n, f) => { try { f(); console.log('  ok   ' + n); pass++; } catch (e) { console.log('  FAIL ' + n + ' -> ' + e.message); fail++; } };
console.log('endless echo: the three-minute damage trial\n');

const DAY = new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10);
// v90.10: the tier helpers the Nightmare gear token reads (secField picks the section by tier)
const tierHelpers = [/const nmTierOf=[^\n]*/, /const secField=\(m,l\)=>[^;]+;/].map(re => src.match(re)[0]).join('\n');
const trialBlock = tierHelpers + '\n' + grab('// ========================= Endless Echo', 'const NMNAME=');
const nmNames = grab("const NMNAME=['Dread'", 'const NMNAME2=');

// ---- one arena, with the DOM and the world stubbed the way a run needs them ----------------
function arena(opts = {}) {
  const box = { console };
  if (opts.random !== undefined) { box.Math = Object.create(Math); box.Math.random = () => opts.random; }
  vm.createContext(box);
  vm.runInContext(`
    // ---- the world the trial reaches into ----
    let S=${JSON.stringify({
      lv: opts.lv || 1, shards: opts.shards || 0, refineScrolls: opts.refineScrolls || 0, dmg: opts.dmg || 0, kills: opts.kills || 0,
      ore: { ori: 0, elu: 0 }, cards: [], inv: [], eq: {}, zeny: 0,
      trial: opts.trial || { day: '${DAY}', used: 0, best: 0, runs: 0 },
      cardIndex: { donated: 0, byName: {}, mastery: {}, rewards: {}, rolls: [], bonus: 0, stats: {} },
    })};
    let mobs=[],mob=null,activePack=0,respawn=0,pend=[],castQ=[],tb={},pAtkT=0,mAtkT=0;
    const pl={x:0,z:0,run:false,orb:0},pl2=pl;
    const spawnCalls=[];
    const logLines=[];const log=(m,cls,cat)=>logLines.push(m);
    let uiCalls=0;const ui=()=>uiCalls++;
    let saves=0;const save=()=>saves++;
    let zenyAdded=0;const earnZeny=z=>{zenyAdded+=z};
    const ORE={ori:'Oridecon',elu:'Elunium'},SECN=['Normal','Nightmare','Nightmare','Nightmare','Nightmare','Abyssal'];
    const SU=k=>({str:'STR',agi:'AGI',dex:'DEX',luk:'LUK',int:'INT',vit:'VIT'}[k]||k);
    const AFF=['str','agi','dex','luk','int','hp','atk','crit','aspd','flee','cdm'];
    const cardStat=(g,seed)=>AFF[((seed%AFF.length)+AFF.length)%AFF.length];
    const cardVal=(g,stat)=>({str:2,agi:2,dex:2,luk:2,int:2,hp:24,atk:2,crit:1,aspd:2,flee:2,cdm:1}[stat]||2)*g;
    const uid=(()=>{let n=500;return()=>++n})();
    const safeCount=v=>{const n=Number(v);return Number.isFinite(n)?Math.max(0,Math.floor(n)):0};
    const MAPS=[{n:'Prontera',mobs:[{n:'Poring'},{n:'Fabre'}]},{n:'Izlude',mobs:[{n:'Drops'}]},{n:'Geffen',mobs:[{n:'Willow'}]},
      {n:'Morroc',mobs:[{n:'Roda'}]},{n:'Payon',mobs:[{n:'Muka'}]},{n:'Comodo',mobs:[{n:'Shell'}]},
      {n:'Louyang',mobs:[{n:'Jiangshi'}]},{n:'Amatsu',mobs:[{n:'Tengu'}]},{n:'Niflheim',mobs:[{n:'Ghoul'}]},{n:'Abyss',mobs:[{n:'Dread'}]}];
    const MONSTER_INDEX=MAPS.flatMap((mp,map)=>[...mp.mobs.map(m=>({id:map+':'+m.n,map,name:m.n,boss:false})),{id:map+':'+mp.n+' MVP',map,name:mp.n+' MVP',boss:true}]);
    const MAPTIER=[0,0,1,1,2,2,3,3,3,3],MAPGRADE=[1,2,2,3,3,3,3,3,3,4];
    const dropTier=(m,l)=>Math.min(MAPGRADE[Math.max(0,Math.min(9,m|0))],l>=10?4:MAPTIER[Math.max(0,Math.min(9,m|0))]);
    let nmOpenVal=${opts.nmOpen === undefined ? 3 : opts.nmOpen};
    const nmOpen=()=>nmOpenVal;
    const C=()=>({ ...${JSON.stringify(opts.cls || { wt: ['sword'] })} });
    const gearPool=(m,l)=>{const pool=[];for(let i=0;i<4;i++)pool.push({k:'sword',n:'Row '+m+'/'+l+' #'+i,sec:0});
      for(let i=0;i<3;i++)pool.push({k:'armor',n:'Row '+m+'/'+l+' coat '+i,sec:0});return pool};
    const spawn=()=>spawnCalls.push(1);
    const made=[];
    const genGear=(k,lv,sec,rare,tier)=>{const it={id:uid(),name:'Nightmare '+k.n,slot:k.k,sec,tier,val:10,cards:[]};made.push({it,sec,lv,tier});return it};
    // ---- a document just real enough for the lobby ----
    const nodes={};
    const document={getElementById:id=>nodes[id]||(nodes[id]={classList:{add(){this.on=true},toggle(v){this.on=!!v},contains(){return !!this.on}},innerHTML:'',style:{},dataset:{}})};
    ${nmNames}
    ${trialBlock}
    this.__a={
      get S(){return S},set S(v){S=v},get mobs(){return mobs},get mob(){return mob},get pl(){return pl},get MONSTER_INDEX(){return MONSTER_INDEX},get AFF(){return AFF},
      TRIAL,TRIAL_PAY,TRIAL_STORE,TRIAL_CHESTS,TRIAL_GRACE,trialChestNext,trialChestText,trialDay,trialLeftToday,trialClock,trialShardsFor,trialState,
      trialLobby,trialShopHtml,trialResultHtml,trialEnter,trialFinish,trialExit,trialBuy,trialGrantNm,
      get logs(){return logLines},get saves(){return saves},get uiCalls(){return uiCalls},
      get spawnCalls(){return spawnCalls},get zenyAdded(){return zenyAdded},get made(){return made},
      spawn,get hudTrial(){return typeof hudTrial!=='undefined'?hudTrial:null},
      get trialBody(){return nodes.trialBody?nodes.trialBody.innerHTML:''},
      get trialOpen(){return !!(nodes.trial&&nodes.trial.classList.on)},
      set nmOpen(v){nmOpenVal=v},
    };
  `, box);
  return box.__a;
}

t('a run is three minutes, and the clock reads like one', () => {
  const A = arena();
  assert.strictEqual(src.includes('const TRIAL_SECS=180'), true, 'TRIAL_SECS is 180 - three minutes exactly');
  assert.strictEqual(A.TRIAL_SECS, undefined, 'the block itself keeps the constants private (sliced source pin above)');
  const a2 = {}; vm.createContext(a2);
  vm.runInContext(`${trialBlock};this.__c={trialClock,TRIAL_SECS,TRIAL_RANKED_PER_DAY,TRIAL_GRACE,TRIAL_CHESTS,TRIAL_PAY,TRIAL}`, a2);
  const C2 = a2.__c;
  assert.strictEqual(C2.TRIAL_SECS, 180, '180 seconds');
  assert.strictEqual(C2.TRIAL_RANKED_PER_DAY, 2, 'two ranked runs a day');
  assert.strictEqual(typeof C2.TRIAL_BEST_BONUS, 'undefined', 'v77.2: there is no new-best bonus to pay');
  assert.ok(!/TRIAL_BEST_BONUS/.test(src), 'and the build carries no trace of one');
  assert.strictEqual(C2.TRIAL_GRACE, 10, 'ten seconds to walk out of a ranked run for free');
  assert.strictEqual(C2.TRIAL_CHESTS.length, 7, 'seven one-off chests');
  assert.strictEqual(C2.TRIAL_CHESTS.map(r => r[0]).join(','), '250000,500000,1000000,1500000,2250000,3000000,4500000',
    'the chest rungs are the owner\u2019s own marks (1.5M alone, 4.5M with three pets) plus the road between');
  C2.TRIAL.left = 180; assert.strictEqual(C2.trialClock(), '3:00', 'it opens at 3:00');
  C2.TRIAL.left = 61.2; assert.strictEqual(C2.trialClock(), '1:02', 'and rounds up to the last whole second');
  C2.TRIAL.left = 0; assert.strictEqual(C2.trialClock(), '0:00', 'and stops at 0:00');
});

t('ranked is two a day, practice is unlimited, and only ranked pays', () => {
  const A = arena({ shards: 0 });
  assert.strictEqual(A.trialLeftToday(), 2, 'a fresh day has both ranked runs');
  A.TRIAL.left = 10; A.TRIAL.dmg0 = 0;
  A.trialEnter('training');
  assert.strictEqual(A.TRIAL.on, true, 'training starts');
  assert.strictEqual(A.TRIAL.mode, 'training', 'as a training run');
  A.S.dmg = 60000;
  A.TRIAL.left = 0; A.trialFinish();
  assert.strictEqual(A.S.shards, 0, 'practice pays no shards');
  assert.strictEqual(A.trialLeftToday(), 2, 'and spends no ranked tries');
  assert.strictEqual(A.trialState().best, 0, 'and never touches the personal best');
  // two ranked runs, then the door closes for the day. Each run pays its own total DPS bracket -
  // a new best does not add a bonus. At 100,000 DPS each completed run pays 3 Echo Shards.
  A.trialEnter('ranked'); A.S.dmg = A.S.dmg + 18000000; A.TRIAL.left = 0; A.trialFinish();
  assert.strictEqual(A.S.shards, 3, 'a ranked run pays its ladder bracket (100,000 DPS -> 3)');
  assert.strictEqual(A.trialLeftToday(), 1, 'one try is spent');
  A.trialEnter('ranked'); A.S.dmg = A.S.dmg + 18000000; A.TRIAL.left = 0; A.trialFinish();
  assert.strictEqual(A.S.shards, 6, 'and the second run pays its own 3 - flat, never stacked');
  assert.strictEqual(A.trialLeftToday(), 0, 'both tries spent');
  const before = A.TRIAL.on;
  A.trialEnter('ranked');
  assert.strictEqual(A.TRIAL.on, false, 'a third ranked run refuses to start');
  assert.strictEqual(before, false, 'and the refusal left the arena shut');
  assert.ok(A.logs.some(l => /No ranked runs left/.test(l)), 'and says why');
  A.trialEnter('training');
  assert.strictEqual(A.TRIAL.on, true, 'while practice still opens');
  A.trialExit();
});

t('the lobby can always be closed and the character spawns in reach', () => {
  assert.ok(src.includes('if(!TRIAL.on){trialShow(trialEl(),false);ui();save();return}'),
    'trialExit hides the overlay even when no run is on (Close used to do nothing)');
  assert.ok(src.includes('pl.x=0;pl.z=-2.6;'), 'the character spawns 1.4 units from the target: inside melee reach');
  assert.ok(!src.includes('pl.x=0;pl.z=-1.1;'), 'and no longer 2.9 units away, where a melee swing could not land');
  assert.ok(src.includes('hp:Infinity,max:Infinity'), 'the dummy carries a max HP for the panels that divide by it');
});

t('the board metric is the best single run, never a sum', () => {
  const A = arena();
  A.S.dmg = 0;
  A.trialEnter('ranked'); A.S.dmg = 36000000; A.TRIAL.left = 0; A.trialFinish();   // 200,000 DPS
  assert.strictEqual(Math.round(A.trialState().best), 200000, 'the first run sets the best');
  const shards1 = A.S.shards;
  assert.strictEqual(shards1, 3, '3 for the 100k rung - a new best pays no more than any other run');
  A.S.dmg = 0;
  A.trialEnter('ranked'); A.S.dmg = 27000000; A.TRIAL.left = 0; A.trialFinish();   // 150,000 DPS
  assert.strictEqual(Math.round(A.trialState().best), 200000, 'a worse second run does not lower the best');
  assert.strictEqual(A.S.shards - shards1, 3, 'and pays the completion bracket only - nothing is summed');
  assert.strictEqual(A.trialState().runs, 2, 'both runs are counted as runs, not as one total');
  assert.ok(!/st\.best\s*\+=/.test(trialBlock), 'the code never adds a run onto the best');
});

t('the ladder pays 1-50 Shards per completed ranked run, by DPS', () => {
  const A = arena();
  A.TRIAL.result = null;
  assert.strictEqual(A.trialShardsFor(0), 1, 'a completed ranked run always pays at least 1');
  assert.strictEqual(A.trialShardsFor(99999), 1, 'under 100k keeps the minimum completion payout');
  assert.strictEqual(A.trialShardsFor(100000), 3, '100k DPS pays 3');
  assert.strictEqual(A.trialShardsFor(249999), 3, 'gaps hold the lower total bracket');
  assert.strictEqual(A.trialShardsFor(250000), 5, '250k pays 5');
  assert.strictEqual(A.trialShardsFor(500000), 8, '500k pays 8');
  assert.strictEqual(A.trialShardsFor(750000), 12, '750k pays 12');
  assert.strictEqual(A.trialShardsFor(1000000), 16, '1M pays 16');
  assert.strictEqual(A.trialShardsFor(1500000), 22, '1.5M - the no-pet decked build - pays 22');
  assert.strictEqual(A.trialShardsFor(4500000), 50, '4.5M - three pets out - pays 50');
  assert.strictEqual(A.trialShardsFor(9000000), 50, 'and nothing above the top bracket pays more');
  assert.strictEqual(Array.from(A.TRIAL_PAY, r => r[1]).join(','), '1,3,5,8,12,16,22,30,40,50',
    'all payout brackets stay within the requested 1-50 range');
  assert.strictEqual(Array.from(A.TRIAL_PAY, r => r[0]).join(','), '0,100000,250000,500000,750000,1000000,1500000,2250000,3000000,4500000',
    'the DPS rungs are preserved');
});

t('the revised exchange prices match the new 1-50 Shard payout scale', () => {
  const A = arena();
  const price = id => A.TRIAL_STORE.find(r => r.id === id).c;
  // Two ranked attempts at the top rung make 100 Echo Shards on a best-possible day.
  const top = A.trialShardsFor(4500000), day = top * 2;
  assert.strictEqual(top, 50, 'a three-pet top-rank run pays 50 Echo Shards');
  assert.strictEqual(day, 100, 'two top-rank attempts make 100 per day');
  assert.strictEqual(Math.floor(day / price('ori')) * 5, 10, 'one top-rank day buys ten Oridecon');
  assert.strictEqual(Math.floor(day / price('elu')) * 5, 10, 'and ten Elunium');
  assert.strictEqual(price('ori'), 45, 'Oridecon x5 is 45');
  assert.strictEqual(price('elu'), 45, 'Elunium x5 is 45');
  assert.strictEqual(price('zeny'), 35, '500,000 Zeny is 35');
  assert.strictEqual(price('token'), 180, 'Card Mastery Token is 180');
  assert.strictEqual(price('lcard'), 200, 'the random Legendary card voucher is 200');
  assert.strictEqual(price('nmgear'), 400, 'the Lv 120+ Nightmare Gear Token is 400');
  assert.strictEqual(price('rscroll'), 400, 'the placeholder Refine Scroll is 400');
  assert.ok(price('token') < price('lcard') && price('lcard') < price('nmgear'),
    'the token < card voucher < Nightmare gear price order is preserved');
});

t('a new day clears the two tries, and only the tries', () => {
  const A = arena({ trial: { day: '2020-01-01', used: 2, best: 12345, runs: 9 } });
  assert.strictEqual(A.trialLeftToday(), 2, 'yesterday\u2019s spent tries are gone');
  const st = A.trialState();
  assert.strictEqual(st.day, DAY, 'the day rolls forward');
  assert.strictEqual(st.used, 0, 'the counter resets');
  assert.strictEqual(st.best, 12345, 'the personal best survives the night');
  assert.strictEqual(st.runs, 9, 'and so does the run count');
});

t('trialState repairs the inert Refine Scroll reserve to a bounded integer', () => {
  const A = arena({ refineScrolls: '4.8' });
  A.trialState();
  assert.strictEqual(A.S.refineScrolls, 4, 'a stored count is floored to a whole scroll');
  A.S.refineScrolls = -2; A.trialState();
  assert.strictEqual(A.S.refineScrolls, 0, 'negative reserves repair to zero');
  A.S.refineScrolls = Infinity; A.trialState();
  assert.strictEqual(A.S.refineScrolls, 0, 'non-finite reserves repair to zero');
});

t('the dummy never dies, never swings, and never moves', () => {
  const A = arena();
  A.trialEnter('ranked');
  const d = A.mob;
  assert.ok(d, 'the arena spawns the target');
  assert.strictEqual(d.hp, Infinity, 'infinite HP');
  assert.strictEqual(d.at, Infinity, 'and no attack timer at all');
  assert.strictEqual(d.fixed, true, 'it is flagged fixed so the AI never walks it');
  assert.strictEqual(d.boss, false, 'its boss-style art does not enable MVP damage bonuses');
  assert.strictEqual(d.n, 'Lord of Death Illusion', 'the Endless Echo nameplate reads Lord of Death Illusion');
  assert.ok(src.includes("n:'Lord of Death Illusion'"), 'the trial target is named in the arena spawn');
  assert.ok(!src.includes("n:'Trial Dummy'"), 'the old Trial Dummy name is gone');
  assert.strictEqual(d.spriteId, 1373, 'the dummy uses the existing Lord of Death sprite');
  assert.strictEqual(d.spawn, 1, 'the boss silhouette is fully visible on the first frame');
  assert.ok(src.includes("'Lord of Death':1373"), '1373 is already in the official mob-sprite map');
  assert.strictEqual(d.drops.length, 0, 'and it drops nothing - the rewards are the Shards');
  assert.strictEqual(A.mobs.length, 1, 'it is the only thing in the arena');
  assert.ok(src.includes('if(ed>.1&&!stn&&!m.fixed)'), 'the AI skips a fixed mob');
  assert.ok(src.includes('pl.run=pd>.15&&!TRIAL.on;') && src.includes('if(pd>.05&&!TRIAL.on)'),
    'and the character holds position for the whole run (owner: the dummy and the character stay in place)');
});

t('the run ends itself on the clock and leaves the arena', () => {
  assert.ok(src.includes('if(TRIAL.left<=0)return trialFinish()'), 'update() ends the run at zero');
  assert.ok(src.includes("$('stageTitle').textContent=hudTrial?`Endless Echo \u00b7 ${trialClock()}`"),
    'the HUD title carries the clock while a run is on');
  assert.ok(src.includes("const pt=hudTrial?`\ud83c\udfdb ${trialClock()} left"), 'and the progress line counts the damage down with it');
  const A = arena();
  A.trialEnter('training');
  assert.strictEqual(A.spawnCalls.length, 0, 'entering does not respawn a field');
  A.trialExit();
  assert.strictEqual(A.spawnCalls.length, 1, 'leaving puts you back in a real field');
  assert.strictEqual(A.TRIAL.on, false, 'with the run closed');
  assert.strictEqual(A.hudTrial, false, 'and the HUD back to the field');
});

t('the lobby offers exactly the three doors, ranked first and honest about the tries', () => {
  const A = arena();
  A.trialLobby();
  const body = A.trialBody;
  assert.ok(body.includes('Ranked attempt') && body.includes('2/2 ranked attempts remain today'), 'ranked is labelled with the tries left');
  assert.ok(body.includes('Training · unlimited'), 'training is unlimited');
  assert.ok(body.includes('Shard Store'), 'and the store is its own door');
  assert.ok(body.includes('Personal best'), 'the lobby carries the personal best');
  assert.ok(body.includes('3:00'), 'and states the run length');
  assert.ok(A.trialOpen, 'the overlay is up');
  A.trialLobby('store');
  const shop = A.trialBody;
  assert.ok(shop.includes('Shard Store') && shop.includes('Back'), 'the store swaps in with a way back');
  for (const row of A.TRIAL_STORE) assert.ok(shop.includes(row.n), 'the store lists ' + row.n);
  assert.ok(shop.includes('disabled'), 'affordable at 0 shards: nothing is buyable yet');
});

t('the Shard Store spends shards and grants the random voucher and scroll exactly once', () => {
  assert.strictEqual(A0().TRIAL_STORE.map(r => r.c).join(','), '45,45,35,180,200,400,400', 'the requested Echo Shard prices including the placeholder scroll');
  const A = arena({ shards: 2500, lv: 150, random: .999999 });
  A.trialBuy('ori');
  assert.strictEqual(A.S.shards, 2500 - 45, 'Oridecon x5 costs 45');
  assert.strictEqual(A.S.ore.ori, 5, 'and pays five Oridecon');
  A.trialBuy('elu');
  assert.strictEqual(A.S.shards, 2500 - 90, 'Elunium x5 also costs 45');
  A.trialBuy('zeny');
  assert.strictEqual(A.zenyAdded, 500000, 'the Zeny cache is 500,000z');
  A.trialBuy('token');
  assert.strictEqual(A.S.cardIndex.bonus, 1, 'the 180-Shard mastery token lands in the Index pool');
  A.trialBuy('lcard');
  assert.strictEqual(A.S.cards.length, 1, 'the 200-Shard voucher adds one Legendary card to the collection');
  const card = A.S.cards[0];
  assert.ok(A.MONSTER_INDEX.some(m => m.name + ' Card' === card.n), 'the voucher selects from the monster and boss card roster');
  assert.strictEqual(card.g, 3, 'the reward is Legendary grade');
  assert.ok(A.AFF.includes(card.stat), 'its Legendary stat is also rolled from the available stat pool');
  assert.ok(A.logs.some(l => /random Legendary .* added to your card collection/.test(l)), 'the purchase log says it is random and names the collection');
  const scrolls = arena({ shards: 800, refineScrolls: 2 });
  scrolls.trialBuy('rscroll');
  assert.strictEqual(scrolls.S.refineScrolls, 3, 'one 400-Shard purchase adds one saved placeholder count');
  assert.strictEqual(scrolls.S.shards, 400, 'the placeholder purchase charges exactly 400 shards');
  assert.strictEqual(scrolls.saves, 1, 'the new reserve count is saved immediately');
  assert.ok(scrolls.logs.some(l => /Refine Scroll.*placeholder has no effect yet/.test(l)), 'the purchase log makes its inert status explicit');
  assert.ok(scrolls.trialShopHtml().includes('no effect or use yet'), 'the store description also states that no use exists yet');
  scrolls.trialBuy('rscroll');
  assert.strictEqual(scrolls.S.refineScrolls, 4, 'repeat purchases add only one scroll each');
  assert.strictEqual(scrolls.S.shards, 0, 'and the second purchase spends its own 400');
  const first = arena({ shards: 200, random: 0 }); first.trialBuy('lcard');
  assert.notStrictEqual(first.S.cards[0].n, card.n, 'different random rolls can award different monster cards');
  assert.notStrictEqual(first.S.cards[0].stat, card.stat, 'and can roll a different Legendary stat');
  assert.strictEqual(A.S.shards, 2500 - 45 - 45 - 35 - 180 - 200, 'each purchase is charged once');
  const broke = arena({ shards: 5, lv: 150 });
  broke.trialBuy('nmgear');
  assert.strictEqual(broke.S.shards, 5, 'and a broke player is not charged');
  assert.ok(broke.logs.some(l => /Not enough shards/.test(l)), 'the refusal is explained');
  broke.trialBuy('rscroll');
  assert.strictEqual(broke.S.refineScrolls, 0, 'an unaffordable placeholder purchase does not grant a scroll');
  // The Nightmare Gear Token remains Base Lv 120+ only.
  const low = arena({ shards: 400, lv: 119 });
  low.trialBuy('nmgear');
  assert.strictEqual(low.S.shards, 400, 'a Base Lv 119 player buys no Nightmare token, even with enough Shards');
  assert.ok(low.logs.some(l => /needs Base Lv 120/.test(l)), 'and is told why');
  assert.ok(!low.trialBody.includes('data-nmmap='), 'the map picker never opens for them');
  const high = arena({ shards: 400, lv: 120 });
  high.trialBuy('nmgear');
  assert.ok(high.trialBody.includes('data-nmmap='), 'Base Lv 120 opens the map picker');
  assert.ok(high.trialShopHtml().includes('Base Lv 120+'), 'and the store row says the requirement');
});

t('the Refine Scroll stays inert and the refine action never consumes it', () => {
  const fn = grab('function refine(sl){', '// ---------- class change ----------');
  assert.ok(!/refineScrolls|rscroll|Refine Scroll/.test(fn), 'refine() has no scroll mechanic');
  assert.ok(src.includes('stored scrolls are not consumed by refining.'), 'the Refine panel tells the player it is not consumed');
});

t('the Nightmare Gear Token hands over a real piece from the map you picked', () => {
  const A = arena({ shards: 400, lv: 150, nmOpen: 3, kills: 2 });
  A.trialBuy('nmgear');
  assert.strictEqual(A.made.length, 0, 'picking the token only opens the map picker');
  assert.ok(A.trialBody.includes('Nightmare Gear Token'), 'which asks for a map');
  assert.ok(A.trialBody.includes('class-compatible weapons') && A.trialBody.includes('deterministic from your total kill count'), 'the picker explains the class filter, quality source and deterministic selection');
  assert.ok(A.trialBody.includes('Nightmare Prontera to Payon') && A.trialBody.includes('Nightmare Comodo to Abyss'), 'the picker follows the v90.10 tier rows, not the old whole-band unlock');
  assert.ok(A.trialBody.includes('data-nmmap="9"'), 'every map is offered, including Abyss');
  A.trialGrantNm(9);
  assert.strictEqual(A.made.length, 1, 'picking a map makes exactly one piece');
  assert.strictEqual(A.made[0].sec, 5, 'v90.10: Abyss is tier 2, so its token gives the N+ row (section 5)');
  assert.strictEqual(A.made[0].tier, 4, 'flat Nightmare gear: the top tier on every map (v90.8)');
  assert.strictEqual(A.S.inv.length, 1, 'and it is in the bag, not on the ground');
  assert.ok(/Nightmare .* is in your bag/.test(A.logs[A.logs.length - 1]), 'the log says so');
  const early = arena({ shards: 400, lv: 150 });
  early.trialGrantNm(0);
  assert.strictEqual(early.made[0].sec, 4, 'v90.10: Prontera is tier 1, so its token gives the N row (section 4)');
  assert.strictEqual(early.made[0].tier, 1, 'the token passes map 0\'s own tier; genGear flattens N gear to the top tier (v90.8)');
  assert.ok(src.includes('genGear(chosen,150,sec,false,dropTier(mapIndex,12))'),
    'the token preserves the selected map’s field quality');
  const B = arena({ shards: 400, lv: 150, nmOpen: 5 });
  B.trialGrantNm(9);
  assert.strictEqual(B.made[0].sec, 5, 'section 5 once Nightmare 5 is unlocked');
  assert.strictEqual(B.made[0].lv, 150, 'and it rolls at the band\u2019s level, not the player\u2019s');
});

t('the store and the lobby are wired to the real click path', () => {
  const dispatch = grab("const tb=target&&target.closest&&target.closest('[data-trial],[data-buy],[data-nmmap]');", "else if(tb.dataset.buy)");
  assert.ok(dispatch.includes("v==='ranked'||v==='training'"), 'the lobby buttons start a run');
  assert.ok(dispatch.includes('trialEnter(v)'), 'through trialEnter');
  assert.ok(dispatch.includes("v==='store'"), 'the store button opens the shop');
  assert.ok(dispatch.includes('trialExit()'), 'and close leaves');
  const pick = grab('else if(tb.dataset.nmmap!==undefined)', "trialLobby('store')");
  assert.ok(pick.includes('trialGrantNm(mi)') && pick.includes("x.id==='nmgear').c"), 'the map pick charges the token price');
  assert.ok(pick.includes('if((S.shards|0)<'), 'and a double click cannot spend shards the player does not have');
  assert.ok(pick.includes('save()'), 'and saves the result');
  assert.ok(src.includes('data-trial="lobby"'), 'the map-selection button opens the lobby');
});

t('the Echo Court reuses the game\'s Niflheim HD map kit instead of mismatched block scenery', () => {
  const arenaFn = grab('function trialArena(){', 'function trialEnter(mode){');
  assert.ok(arenaFn.includes('while(deco.children.length)deco.remove'), 'it clears the field decor rather than stacking on it');
  assert.ok(arenaFn.includes('townObjs.forEach(o=>o.visible=false)'), 'and hides the town props');
  assert.ok(arenaFn.includes('kitPlan(8,1)') && arenaFn.includes('buildKit(8,plan)'), 'it builds the Niflheim kit plan with the existing HD terrain and sprites');
  assert.ok(arenaFn.includes("tile:r>.82?'rock_abyss':'ruin_cobble'"), 'its broad arena floor is cropped from the map kit tiles');
  assert.ok(arenaFn.includes("type:'ruin_pillar'") && arenaFn.includes("type:'standing_stone'"), 'the court framing also uses map-native art');
  assert.ok(arenaFn.includes('if(!built)buildDeco(8)'), 'the ordinary Niflheim fallback appears while the HD kit loads');
  assert.ok(!/RingGeometry|CylinderGeometry|BoxGeometry/.test(arenaFn), 'no procedural rune rings or plain block pillars');
  assert.ok(arenaFn.includes('PointLight(0x9a5cf0'), 'a restrained purple key light');
  assert.ok(src.includes("key=(TRIAL.on?'trial:':'field:')+S.mp+':'+S.lvl+':'+bn"), 'the scene key switches on the run');
  assert.ok(src.includes('new THREE.Color(0x171020)') && src.includes('new THREE.Fog(col,22,64)'), 'the arena uses a deep violet sky and closer, darker fog');
  assert.ok(src.includes('hemi.intensity=.52;sun.intensity=.48') && src.includes('hemi.intensity=.8;sun.intensity=.9'), 'arena lighting dims and the field lighting restores on exit');
  assert.ok(src.includes('if(TRIAL.on)trialArena();else buildDeco(S.mp)'), 'late HD asset loads rebuild the Echo Court, not the player\'s current field');
});

t('a ranked try is only spent after the ten-second grace', () => {
  const A = arena();
  A.trialEnter('ranked');
  A.S.dmg = 1000000; A.TRIAL.left = 177;                 // three seconds in
  A.trialExit();
  assert.strictEqual(A.trialLeftToday(), 2, 'leaving inside ten seconds does not spend the try');
  assert.strictEqual(A.trialState().runs, 0, 'and the run is not counted');
  assert.strictEqual(A.S.shards, 0, 'nothing is paid');
  assert.ok(A.logs.some(l => /not spent/.test(l)), 'the log says the try is safe');
  assert.strictEqual(A.TRIAL.on, false, 'and the arena is closed');
  assert.strictEqual(A.hudTrial, false, 'the HUD is back to the field');
  assert.strictEqual(A.spawnCalls.length, 1, 'and the character is back in a real field');

  const B = arena();
  B.trialEnter('ranked');
  B.S.dmg = 6000000; B.TRIAL.left = 120;                 // a minute in
  B.trialExit();
  assert.strictEqual(B.trialLeftToday(), 1, 'leaving after the grace spends exactly one try');
  assert.strictEqual(B.trialState().runs, 1, 'and counts as a run');
  assert.strictEqual(B.TRIAL.result.quit, true, 'the result screen reports an abandoned run');
  assert.strictEqual(Math.round(B.TRIAL.result.ran), 60, 'with how long it lasted');
  assert.strictEqual(B.S.shards, 0, 'an abandoned run pays nothing');
  assert.strictEqual(B.trialState().best, 0, 'and never sets the board');
  assert.ok(B.trialBody.includes('left after'), 'the screen says so, not only the log');
  assert.ok(B.logs.some(l => /abandoned after 60s/.test(l)), 'and the log names the cost');

  const C = arena();
  C.trialEnter('training');
  C.TRIAL.left = 120;
  C.trialExit();
  assert.strictEqual(C.trialState().runs, 0, 'practice is free whenever you leave it');
  assert.ok(!C.TRIAL.result, 'and leaves no result to report');

  // the grace is a window, not a pause: exactly ten seconds in is still free, ten-point-one is not
  const D = arena();
  D.trialEnter('ranked'); D.TRIAL.left = 170; D.trialExit();
  assert.strictEqual(D.trialLeftToday(), 2, 'ten seconds in is still inside the grace');
  const E = arena();
  E.trialEnter('ranked'); E.TRIAL.left = 169.9; E.trialExit();
  assert.strictEqual(E.trialLeftToday(), 1, 'a hair past ten seconds spends the try');
});

t('the milestone chests are one-off, in order, and paid by DPS', () => {
  const A = arena();
  A.trialEnter('ranked');
  A.S.dmg = 270000000; A.TRIAL.left = 0;                 // 1.5M DPS: the no-pet decked mark
  A.trialFinish();
  assert.strictEqual(Math.round(A.trialState().best), 1500000, 'the run sets the best');
  assert.strictEqual(A.trialState().chest, 4, 'the four rungs at or below 1.5M open at once');
  assert.strictEqual(A.S.ore.ori, 5 + 10 + 20, 'their Oridecon lands in the bag');
  assert.strictEqual(A.S.ore.elu, 5 + 10 + 20, 'and so does the Elunium');
  assert.strictEqual(A.zenyAdded, 50000 + 100000 + 250000, 'and their Zeny');
  assert.strictEqual(A.S.shards, 22 + 100 + 150, 'the run pays its 22 bracket and the first-clear caches add 250');
  assert.strictEqual(A.TRIAL.result.chests.length, 4, 'the result screen lists them');
  assert.ok(A.trialBody.includes('First-clear caches opened'), 'and shows them');
  assert.strictEqual(A.trialChestNext()[0], 2250000, 'the next cache is the 2.25M one');
  A.trialLobby();
  assert.ok(A.trialBody.includes('Next one-time cache') && A.trialBody.includes('2.25M DPS'), 'the lobby names the next cache');

  const before = A.S.shards, ori = A.S.ore.ori, chest = A.trialState().chest;
  A.trialEnter('ranked'); A.S.dmg = A.S.dmg + 270000000; A.TRIAL.left = 0; A.trialFinish();
  assert.strictEqual(A.S.shards - before, 22, 'a matching second run pays the repeatable bracket only');
  assert.strictEqual(A.S.ore.ori, ori, 'and opens no chest again');
  assert.strictEqual(A.trialState().chest, chest, 'the chest counter stays put');
  assert.strictEqual(A.TRIAL.result.chests.length, 0, 'the result screen lists none');

  // practice never opens a chest, however big the number
  const P = arena();
  P.trialEnter('training'); P.S.dmg = 2500000000; P.TRIAL.left = 0; P.trialFinish();
  assert.strictEqual(P.trialState().chest, 0, 'a practice run opens nothing');
  assert.strictEqual(P.S.shards, 0, 'and pays nothing');
});

function A0() { return arena(); }

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
