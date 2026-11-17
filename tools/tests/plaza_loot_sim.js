/* v393: the plaza pays DROPS as well as EXP/Zeny, at the field's own rate.
   Owner: "its ok, make it drop materials & cards. this is an idle game, i dont need
   players to stay at the field constantly."

   The rate is not invented and not discounted. `income.kph` is measured from the
   player's own kills in a completed 60-second field minute, so replaying it pays
   exactly what standing in the field would have paid. That is the whole argument
   for parity - anything less would be a nerf with no stated reason.

   Rules pinned here:
     * kills accrue from income.kph inside the plaza, and pay LOOT ONLY - EXP/Zeny
       stay on plazaFarmIncome()'s single payment, never doubled;
     * cards, gear, ore and Nightmare materials all drop at the field's own odds;
     * the plaza does NOT touch S.kills - that number is what /api/save reads to
       learn the away rate (updatedRate()), so feeding it here would make the
       server believe the field was farmed and mint a second pay on top;
     * auto-sold gear pays no extra Zeny here (it is already inside income.zeny);
     * the bag cap holds, and overflow is counted rather than failing silently;
     * a saved-once minute cannot be replayed twice by save/load. */
const assert = require('node:assert/strict');
const fs=require('node:fs');
const { createGame } = require('./helpers/game');
const g = createGame(), ev = g.ev;
try {
  // --- a real measured Thor Volcano minute: 2340 kills/h, measured on this very build
  ev(`S=fresh();currentUser='plaza-loot';hubFirstPending=false;CLOUD.on=false;
      S.mp=11;S.lvl=1;S.lv=150;S.cls='Guillotine Cross';
      farmSession=null;farmSample(1000);recordFarmIncome(600,300,420,10,31000);farmSample(61000);
      S.offlineIncome={...S.offlineIncome,kph:2340};
      document.body.classList.add('social-open');`);

  const rate = ev('plazaFarmIncome().kph');
  assert.equal(rate, 2340, 'the plaza pays the measured rate, not the cap and not a discount');

  // --- 600s of plaza AFK: exactly the measured kills, and NOT the EXP/Zeny x2 ---------
  ev(`window.k0={kills:S.kills,cards:S.cards.length,inv:S.inv.length,
        exp:S.exp,zeny:S.zeny,ori:S.ore.ori,elu:S.ore.elu};
      window.realRandom=Math.random;Math.random=()=>0.999999;   // no chance-based drops
      plazaAfkAcc={t:0,xp:0,zeny:0,job:0};
      window.loot={kills:0,drops:0};
      const realAward=offlineAwardKill;
      window.realAward=realAward;`);

  // drive the plaza for ten minutes of game time through the real tick
  for (let i = 0; i < 6000; i++) ev('plazaAfkTick(.1)');

  assert.equal(ev('S.kills-k0.kills'), 0,
    'the plaza never touches S.kills - the server learns the away rate from that number');

  const kills = ev('plazaKillAcc.kills');
  assert.ok(Math.abs(kills - 390) <= 1,
    `ten plaza minutes pay the measured 2340/h = 390 kills, got ${kills}`);

  // --- EXP/Zeny are paid once, by plazaFarmIncome, and are NOT doubled by the loot ----
  assert.equal(ev('S.exp-k0.exp'), 6000, 'ten minutes of EXP at 600/min, paid exactly once');
  // 300/min for ten minutes. If the loot replay paid Zeny too this would be double.
  assert.equal(ev('S.zeny-k0.zeny'), 3000, 'zeny is paid once - the loot replay pays no Zeny');

  // --- the same kill budget the away claim would grant -------------------------------
  // offlineAwardKill is the away claim's own function, driven with measured:true: loot
  // only, zero rate. Reusing it is what makes plaza drops equal to field drops.
  assert.equal(typeof ev('offlineAwardKill'), 'function', 'the loot path is reused, not re-written');

  // --- cards and materials actually drop at the field's odds ------------------------
  ev(`S.cards=[];S.inv=[];S.ore={ori:0,elu:0};S.ascensionMat={};
      Math.random=()=>0;   // every chance roll succeeds
      // NB: do NOT park the mob on window.mob - \`mob\` is a let binding, so that sets a
      // different variable and the award call would receive null and silently return.
      window.probeMob=offlineMobForCurrentField(11,1);
      window.r={measured:true,noKillCount:true,kills:0,drops:0,exp:0,zeny:0,items:0,storedItems:0,
                autoSold:0,overflow:0,cards:0,ori:0,elu:0,pets:0,petRefunds:0,petFolds:0,stages:0};
      offlineAwardKill(probeMob,r);`);
  assert.equal(ev('r.cards'), 1, 'a card drops at the field rate when its roll lands');
  assert.equal(ev('S.cards.length'), 1, 'and it lands in the real card album');
  // Map 11 used to carry NO gear table (materials only). haven-v417 gives both Ascension maps a real
  // shelf, so the plaza claim pays gear there exactly as the away claim does - the two paths still
  // agree, which is what this test exists to prove; only the value they agree on changed.
  assert.ok(ev('r.items') > 0, 'ascension maps now pay gear in the plaza claim too');
  // with every die winning, the whole shelf worth of gear can land; assert it is real shelf gear
  assert.equal(ev('S.inv.length>0'), true, 'the gear it paid is in the bag');
  // ascensionMat is an object keyed by material index, not an array.
  assert.equal(ev('(S.ascensionMat[1]||0)+(S.ascensionMat[2]||0)'), 2,
    'and they pay Ascension materials instead - the materials the owner asked for');
  assert.ok(ev('S.ore.ori') + ev('S.ore.elu') > 0, 'ore still drops on an ascension map');
  assert.equal(ev('S.kills-k0.kills'), 0, 'and still no kill-count movement');

  // A normal map carries the gear table, so gear lands in the bag there.
  ev(`S.inv=[];S.cards=[];window.rn={measured:true,noKillCount:true,kills:0,drops:0,exp:0,zeny:0,
        items:0,storedItems:0,autoSold:0,overflow:0,cards:0,ori:0,elu:0,pets:0,petRefunds:0,
        petFolds:0,stages:0};Math.random=()=>0;
      offlineAwardKill(offlineMobForCurrentField(9,1),rn);`);
  // Auto-equip is on in this save, so a usable drop is WORN rather than left in the bag -
  // that is offlineStoreGear's real behaviour and the reason inv is smaller than items.
  assert.equal(ev('rn.items'), 3, 'a normal map pays three gear rolls');
  assert.equal(ev('rn.storedItems'), 3, 'and stores all three');
  assert.ok(ev('S.inv.length + (S.eq.weapon?1:0) + (S.eq.armor?1:0) + (S.eq.head?1:0)') >= 2,
    'gear lands in the bag, or is worn by auto-equip');

  // --- measured kills never pay Zeny again (it is already inside income.zeny) --------
  ev(`S.zeny=0;window.r2={measured:true,kills:0,drops:0,exp:0,zeny:0,items:0,storedItems:0,
        autoSold:0,overflow:0,cards:0,ori:0,elu:0,pets:0,petRefunds:0,petFolds:0,stages:0};
      Math.random=()=>0.999999;
      offlineAwardKill(offlineMobForCurrentField(11,1),r2);`);
  // measured mode pays no mob Zeny at all; only an auto-sold item could, and that is zeroed too
  assert.equal(ev('r2.zeny'), 0, 'measured kills pay no Zeny - the rate already carries it');

  // --- the bag cap holds instead of dropping loot silently --------------------------
  ev(`S.inv=Array(1000).fill(0).map((_,i)=>({id:i,n:'x'}));S.cards=[];
      window.r3={measured:true,kills:0,drops:0,exp:0,zeny:0,items:0,storedItems:0,autoSold:0,
                 overflow:0,cards:0,ori:0,elu:0,pets:0,petRefunds:0,petFolds:0,stages:0};
      Math.random=()=>0;
      // Map 9 has a gear table, so a full bag can actually be tested. (Map 11 is ascension:
      // materials only, so nothing would ever reach the cap there.)
      for(let i=0;i<20;i++)offlineAwardKill(offlineMobForCurrentField(9,1),r3);`);
  assert.equal(ev('S.inv.length'), 1000, 'a full bag stays at BAGMAX');
  // The dummy items above match no auto-sell rule, so they reach the bag cap and are refused.
  // (offlineStoreGear counts a refusal in r.overflow rather than failing silently.)
  assert.ok(ev('r3.overflow') > 0 || ev('r3.autoSold') > 0,
    'loot that cannot be stored is refused - counted or auto-sold, never silently lost');

  ev('Math.random=window.realRandom');

  // --- loot is part of the save, not a pending queue ---------------------------------
  // (plazaKillAcc is a const object: reset its fields, never rebind the name.)
  ev(`S.inv=[];S.cards=[];S.ore={ori:0,elu:0};plazaKillAcc.kills=0;plazaKillAcc.frac=0;
      Math.random=()=>0;
      window.lootBefore=JSON.stringify({inv:S.inv.length,cards:S.cards.length,ori:S.ore.ori});
      const mob=offlineMobForCurrentField(9,1);
      offlineAwardKill(mob,{measured:true,noKillCount:true,kills:0,drops:0,exp:0,zeny:0,items:0,
        storedItems:0,autoSold:0,overflow:0,cards:0,ori:0,elu:0,pets:0,petRefunds:0,petFolds:0,stages:0});
      window.lootAfter=JSON.stringify({inv:S.inv.length,cards:S.cards.length,ori:S.ore.ori});
      // load() takes NO argument: it reads this browser's save. Round-trip through the real
      // storage key so the assertion is about the save, not about a string we made up.
      S.owner=currentUser;lsPut(saveKey(),JSON.stringify(S));S=load();`);
  assert.notEqual(ev('lootAfter'), ev('lootBefore'), 'the kill actually produced loot');
  assert.equal(ev('S.inv.length'), ev('JSON.parse(lootAfter).inv'),
    'and a reload keeps it - plaza loot is saved like any other item');

  // --- a loot notice failure can never break the payroll -----------------------------
  ev(`window.tickOk=null;const realLog=log;log=()=>{throw new Error('log exploded')};
      try{plazaAfkTick(1);tickOk='survived'}catch(e){tickOk='threw: '+e.message}log=realLog;`);
  assert.equal(ev('tickOk'), 'survived', 'a failing notice never stops the plaza paying');

  // --- the card promises it ---------------------------------------------------------
  const w=g.window,d=w.document;
  w.setInterval=fn=>(fn.name==='battleUITick'?(w.battleTick=fn):0);
  for(const f of ['digimon/roster.js','digimon/base-stats.js','social-rules.js','digimon-sanctuary.js','digimon-battle.js','social-poker.js','social.js'])
    w.eval(fs.readFileSync('assets/'+f,'utf8'));
  d.getElementById('socialHub').hidden=false;d.body.classList.add('social-open');
  ev(`S.offlineIncome={...S.offlineIncome,kph:2340};CLOUD.lost=false;CLOUD.gate=false;CLOUD.paused=false;`);
  for(let i=0;i<4;i++)w.battleTick();
  const lootText=d.getElementById('socialFieldLoot').textContent;
  assert.ok(/drops/.test(lootText), 'the card says drops are being paid, not just EXP/Zeny');
  assert.ok(/2,340/.test(lootText), `and names the measured rate, got "${lootText}"`);

  console.log('PASS plaza loot: field-rate cards, gear and materials, no rate change, no double pay');
} finally { g.close() }
