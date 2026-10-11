// Measure the approved 3–8% DPS bracket for a full starred card setup in representative completed builds.
const assert=require('node:assert/strict');
const {createGame}=require('./helpers/game');
const {outfitted}=require('../progression_balance');
const {stationary}=require('../skill_balance');
const g=createGame(),rows=[];
try{
 for(const cls of ['Lord Knight','High Wizard','Sniper','Assassin Cross','High Priest','Whitesmith']){
  const weapon=cls==='Assassin Cross'?'katar':'';
  for(const targets of [1,3]){
   outfitted(g,cls,2,weapon,true);const base=stationary(g,targets,120).dps;let previous=base;
   for(const stars of [1,2,3]){
    outfitted(g,cls,2,weapon,true);
    g.ev(`for(const it of items())for(const c of it.cards||[])c.stars=${stars};S.hp=maxHp()`);
    const dps=stationary(g,targets,120).dps,gain=100*(dps/base-1);
    assert.ok(Number.isFinite(gain)&&gain>=3&&gain<=8,`${cls}, ${targets} targets, ${stars} stars: ${gain}% outside 3–8%`);
    assert.ok(dps>previous,`${cls}: next star must increase damage`);previous=dps;
    rows.push({cls,targets,stars,gainPercent:gain});
   }
  }
 }
 console.log(JSON.stringify(rows,null,2));console.log('36 star DPS comparisons passed');
}finally{g.close()}
