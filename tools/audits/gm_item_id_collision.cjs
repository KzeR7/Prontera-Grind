// Non-mutating diagnostic for an existing GM preset identity collision.
// Forces equal timestamps/random values only in a disposable synthetic game.
const assert=require('node:assert/strict');
const {createGame}=require('../tests/helpers/game');
const g=createGame();
try{
  const result=g.ev(`(()=>{const dateNow=Date.now,random=Math.random;
    try{Date.now=()=>1700000000000;Math.random=()=>.5;
      S=fresh();S.gm=true;S.cls='Guillotine Cross';ACT.gmmaxset(S.cls);
      return {items:S.inv.length,uniqueIds:new Set(S.inv.map(it=>it.id)).size};
    }finally{Date.now=dateNow;Math.random=random}})()`);
  assert.equal(result.items,8);assert.equal(result.uniqueIds,1);
  console.log('Reproduced: 8 synthetic GM preset items received one shared ID under same-clock/same-random draws.');
}finally{g.close()}
