// Endless Echo, the damage trial (v77): the rules the owner set, executed rather than described.
//   node tools/tests/trial_sim.js
//
// The rules being tested:
//   * a run is one 5:00 sitting against a target that never dies and never hits back;
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
console.log('endless echo: the five-minute damage trial\n');

const DAY = new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10);
const trialBlock = grab('// ========================= Endless Echo', 'const NMNAME=');
const nmNames = grab("const NMNAME=['Dread'", 'const NMNAME2=');

// ---- one arena, with the DOM and the world stubbed the way a run needs them ----------------
function arena(opts = {}) {
  const box = { console };
  vm.createContext(box);
  vm.runInContext(`
    // ---- the world the trial reaches into ----
    let S=${JSON.stringify({
      shards: opts.shards || 0, dmg: opts.dmg || 0, kills: opts.kills || 0,
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
    const cardStat=(g,seed)=>['str','agi','dex','luk','int','vit'][seed%6];
    const cardVal=(g,stat)=>({str:2,agi:2,dex:2,luk:2,int:2,vit:2}[stat]||2)*g;
    const uid=(()=>{let n=500;return()=>++n})();
    const safeCount=v=>{const n=Number(v);return Number.isFinite(n)?Math.max(0,Math.floor(n)):0};
    const MAPS=[{n:'Prontera',mobs:[{n:'Poring'},{n:'Fabre'}]},{n:'Izlude',mobs:[{n:'Drops'}]},{n:'Geffen',mobs:[{n:'Willow'}]},
      {n:'Morroc',mobs:[{n:'Roda'}]},{n:'Payon',mobs:[{n:'Muka'}]},{n:'Comodo',mobs:[{n:'Shell'}]},
      {n:'Louyang',mobs:[{n:'Jiangshi'}]},{n:'Amatsu',mobs:[{n:'Tengu'}]},{n:'Niflheim',mobs:[{n:'Ghoul'}]},{n:'Abyss',mobs:[{n:'Dread'}]}];
    let nmOpenVal=${opts.nmOpen === undefined ? 3 : opts.nmOpen};
    const nmOpen=()=>nmOpenVal;
    const C=()=>({ ...${JSON.stringify(opts.cls || { wt: ['sword'] })} });
    const gearPool=(m,l)=>{const pool=[];for(let i=0;i<4;i++)pool.push({k:'sword',n:'Row '+m+'/'+l+' #'+i,sec:0});
      for(let i=0;i<3;i++)pool.push({k:'armor',n:'Row '+m+'/'+l+' coat '+i,sec:0});return pool};
    const spawn=()=>spawnCalls.push(1);
    const made=[];
    const genGear=(k,lv,sec,rare,tier)=>{const it={id:uid(),name:'Nightmare '+k.n,slot:k.k,sec,tier:4,val:10,cards:[]};made.push({it,sec,lv});return it};
    // ---- a document just real enough for the lobby ----
    const nodes={};
    const document={getElementById:id=>nodes[id]||(nodes[id]={classList:{add(){this.on=true},toggle(v){this.on=!!v},contains(){return !!this.on}},innerHTML:'',style:{},dataset:{}})};
    ${nmNames}
    ${trialBlock}
    this.__a={
      get S(){return S},set S(v){S=v},get mobs(){return mobs},get mob(){return mob},get pl(){return pl},
      TRIAL,TRIAL_PAY,TRIAL_STORE,trialDay,trialLeftToday,trialClock,trialShardsFor,trialState,
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

t('a run is five minutes, and the clock reads like one', () => {
  const A = arena();
  assert.strictEqual(src.includes('const TRIAL_SECS=300'), true, 'TRIAL_SECS is 300 - five minutes exactly');
  assert.strictEqual(A.TRIAL_SECS, undefined, 'the block itself keeps the constants private (sliced source pin above)');
  const a2 = {}; vm.createContext(a2);
  vm.runInContext(`${trialBlock};this.__c={trialClock,TRIAL_SECS,TRIAL_RANKED_PER_DAY,TRIAL_BEST_BONUS,TRIAL}`, a2);
  const C2 = a2.__c;
  assert.strictEqual(C2.TRIAL_SECS, 300, '300 seconds');
  assert.strictEqual(C2.TRIAL_RANKED_PER_DAY, 2, 'two ranked runs a day');
  assert.strictEqual(C2.TRIAL_BEST_BONUS, 10, '+10 shards for a new personal best');
  C2.TRIAL.left = 300; assert.strictEqual(C2.trialClock(), '5:00', 'it opens at 5:00');
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
  // two ranked runs, then the door closes for the day
  A.trialEnter('ranked'); A.S.dmg = 3000000; A.TRIAL.left = 0; A.trialFinish();
  assert.strictEqual(A.S.shards > 0, true, 'a ranked run pays shards');
  assert.strictEqual(A.trialLeftToday(), 1, 'one try is spent');
  A.trialEnter('ranked'); A.S.dmg = 3000000; A.TRIAL.left = 0; A.trialFinish();
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
  assert.ok(/function trialExit\(\)\{[\s\S]{0,220}?trialShow\(trialEl\(\),false\);ui\(\);save\(\)\}/.test(src),
    'trialExit hides the overlay even when no run is on (Close used to do nothing)');
  assert.ok(src.includes('pl.x=0;pl.z=-2.6;'), 'the character spawns 1.4 units from the target: inside melee reach');
  assert.ok(!src.includes('pl.x=0;pl.z=-1.1;'), 'and no longer 2.9 units away, where a melee swing could not land');
  assert.ok(src.includes('hp:Infinity,max:Infinity'), 'the dummy carries a max HP for the panels that divide by it');
});

t('the board metric is the best single run, never a sum', () => {
  const A = arena();
  A.S.dmg = 0;
  A.trialEnter('ranked'); A.S.dmg = 1800000; A.TRIAL.left = 0; A.trialFinish();   // 6,000 DPS
  assert.strictEqual(Math.round(A.trialState().best), 6000, 'the first run sets the best');
  const shards1 = A.S.shards;
  assert.strictEqual(shards1, 20 + 10, '20 for the 5k rung plus the +10 new-best bonus');
  A.S.dmg = 0;
  A.trialEnter('ranked'); A.S.dmg = 1500000; A.TRIAL.left = 0; A.trialFinish();   // 5,000 DPS
  assert.strictEqual(Math.round(A.trialState().best), 6000, 'a worse second run does not lower the best');
  assert.strictEqual(A.S.shards - shards1, 20, 'and pays the 2,000 ladder rung only - nothing is summed');
  assert.strictEqual(A.trialState().runs, 2, 'both runs are counted as runs, not as one total');
  assert.ok(!/st\.best\s*\+=/.test(trialBlock), 'the code never adds a run onto the best');
});

t('the ladder pays by DPS in one run, and the top rung is the wish, not the payout', () => {
  const A = arena();
  A.TRIAL.result = null;
  assert.strictEqual(A.trialShardsFor(100), 0, 'under the first rung pays nothing');
  assert.strictEqual(A.trialShardsFor(5000), 20, '5k DPS pays 20');
  assert.strictEqual(A.trialShardsFor(14999), 20, 'gaps hold the lower rung');
  assert.strictEqual(A.trialShardsFor(15000), 35, '15k pays 35');
  assert.strictEqual(A.trialShardsFor(40000), 50, '40k pays 50');
  assert.strictEqual(A.trialShardsFor(80000), 75, '80k pays 75');
  assert.strictEqual(A.trialShardsFor(120000), 100, '120k pays 100');
  assert.strictEqual(A.trialShardsFor(900000), 100, 'and nothing above the ladder pays more');
  assert.strictEqual(Array.from(A.TRIAL_PAY, r => r[0]).join(','), '5000,15000,40000,80000,120000', 'the rungs are the ones the owner was given');
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

t('the dummy never dies, never swings, and never moves', () => {
  const A = arena();
  A.trialEnter('ranked');
  const d = A.mob;
  assert.ok(d, 'the arena spawns the target');
  assert.strictEqual(d.hp, Infinity, 'infinite HP');
  assert.strictEqual(d.at, Infinity, 'and no attack timer at all');
  assert.strictEqual(d.fixed, true, 'it is flagged fixed so the AI never walks it');
  assert.strictEqual(d.boss, false, 'it is not an MVP');
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
  assert.ok(body.includes('Ranked run (2 left today)'), 'ranked is labelled with the tries left');
  assert.ok(body.includes('Training (unlimited)'), 'training is unlimited');
  assert.ok(body.includes('Shard Store'), 'and the store is its own door');
  assert.ok(body.includes('Personal best'), 'the lobby carries the personal best');
  assert.ok(body.includes('5:00'), 'and states the run length');
  assert.ok(A.trialOpen, 'the overlay is up');
  A.trialLobby('store');
  const shop = A.trialBody;
  assert.ok(shop.includes('Shard Store') && shop.includes('Back'), 'the store swaps in with a way back');
  for (const row of A.TRIAL_STORE) assert.ok(shop.includes(row.n), 'the store lists ' + row.n);
  assert.ok(shop.includes('disabled'), 'affordable at 0 shards: nothing is buyable yet');
});

t('the Shard Store spends shards and hands over what it says', () => {
  assert.strictEqual(A0().TRIAL_STORE.map(r => r.c).join(','), '10,10,25,40,60,120', 'the prices are the published ones');
  const A = arena({ shards: 200 });
  A.trialBuy('ori');
  assert.strictEqual(A.S.shards, 190, 'ore costs 10');
  assert.strictEqual(A.S.ore.ori, 5, 'and pays five Oridecon');
  A.trialBuy('elu');
  assert.strictEqual(A.S.shards, 180, 'elunium is 10 too');
  A.trialBuy('zeny');
  assert.strictEqual(A.zenyAdded, 250000, 'the Zeny cache is 250,000z');
  A.trialBuy('token');
  assert.strictEqual(A.S.cardIndex.bonus, 1, 'the mastery token lands in the Index pool');
  A.trialBuy('lcard');
  assert.strictEqual(A.S.cards.length, 1, 'the voucher puts a Legendary card in the card bag');
  assert.strictEqual(A.S.shards, 200 - 10 - 10 - 25 - 40 - 60, 'each purchase is charged once');
  const broke = arena({ shards: 5 });
  broke.trialBuy('nmgear');
  assert.strictEqual(broke.S.shards, 5, 'and a broke player is not charged');
  assert.ok(broke.logs.some(l => /Not enough shards/.test(l)), 'the refusal is explained');
});

t('the Nightmare Gear Token hands over a real piece from the map you picked', () => {
  const A = arena({ shards: 120, nmOpen: 3, kills: 2 });
  A.trialBuy('nmgear');
  assert.strictEqual(A.made.length, 0, 'picking the token only opens the map picker');
  assert.ok(A.trialBody.includes('Nightmare Gear Token'), 'which asks for a map');
  assert.ok(A.trialBody.includes('data-nmmap="9"'), 'every map is offered, including Abyss');
  A.trialGrantNm(9);
  assert.strictEqual(A.made.length, 1, 'picking a map makes exactly one piece');
  assert.strictEqual(A.made[0].sec, 4, 'section 4 until the whole band is open');
  assert.strictEqual(A.S.inv.length, 1, 'and it is in the bag, not on the ground');
  assert.ok(/Nightmare .* is in your bag/.test(A.logs[A.logs.length - 1]), 'the log says so');
  const B = arena({ shards: 120, nmOpen: 5 });
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

t('the arena is its own scene, built for the trial and painted for an undead theme', () => {
  const arenaFn = grab('function trialArena(){', 'function trialEnter(mode){');
  assert.ok(arenaFn.includes('while(deco.children.length)deco.remove'), 'it clears the field decor rather than stacking on it');
  assert.ok(arenaFn.includes('townObjs.forEach(o=>o.visible=false)'), 'and hides the town props');
  assert.ok(arenaFn.includes('PointLight(0x9a5cf0'), 'a purple key light');
  assert.ok(!/0xffcc66|0x8fd0ff/.test(arenaFn), 'no daylight palette left in it');
  assert.ok(src.includes("key=(TRIAL.on?'trial:':'field:')+S.mp+':'+S.lvl+':'+bn"), 'the scene key switches on the run');
  assert.ok(src.includes("if(TRIAL.on){const col=new THREE.Color(0x2a1040)"), 'and the run paints its own sky and fog');
});

function A0() { return arena(); }

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
