// A full balance must not silently consume a prize or a durable gift receipt.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require=createRequire(import.meta.url),{createGame}=require('./helpers/game');
const game=createGame();
try{
 game.ev(`S=fresh();cloudPush=async()=> 'offline'; S.dailyWheel.bonusRolls=9999;`);
 const rolls={id:901,kind:'gift',payload:{resource:'dailyRolls',amount:2}};
 game.ev(`cloudApplyGrants([${JSON.stringify(rolls)}])`);
 assert.equal(game.ev('S.dailyWheel.bonusRolls'),9999);
 assert.equal(game.ev('S.gmReceipts.includes(901)'),false,'a partial roll gift stays unclaimed');
 game.ev(`S.dailyWheel.bonusRolls=9998;cloudApplyGrants([${JSON.stringify(rolls)}])`);
 assert.equal(game.ev('S.dailyWheel.bonusRolls'),10000);assert.equal(game.ev('S.gmReceipts.includes(901)'),true);
 game.ev(`cloudApplyGrants([${JSON.stringify(rolls)}])`);
 assert.equal(game.ev('S.dailyWheel.bonusRolls'),10000,'a duplicate receipt cannot grant again');
 for(const [i,resource] of ['shards','refineScrolls','mythicScrolls'].entries()){
   const gift={id:910+i,kind:'gift',payload:{resource,amount:2}};
   game.ev(`S[${JSON.stringify(resource)}]=Number.MAX_SAFE_INTEGER-1;cloudApplyGrants([${JSON.stringify(gift)}])`);
   assert.equal(game.ev(`S[${JSON.stringify(resource)}]`),Number.MAX_SAFE_INTEGER-1);
   assert.equal(game.ev(`S.gmReceipts.includes(${gift.id})`),false,resource+' must not be partially credited');
   game.ev(`S[${JSON.stringify(resource)}]=Number.MAX_SAFE_INTEGER-2;cloudApplyGrants([${JSON.stringify(gift)}])`);
   assert.equal(game.ev(`S[${JSON.stringify(resource)}]`),Number.MAX_SAFE_INTEGER);
   assert.equal(game.ev(`S.gmReceipts.includes(${gift.id})`),true);
 }
 game.ev(`S.dailyWheel.bonusRolls=10000;S.testMail={gift:{grantId:950,kind:'gift',payload:{resource:'dailyRolls',amount:1},claimed:false}};`);
 assert.throws(()=>game.ev('claimSingleMailEntry(S.testMail)'),/remain pending/);
 assert.equal(game.ev('S.testMail.gift.claimed'),false);assert.equal(game.ev('S.gmReceipts.includes(950)'),false);
 game.ev('S.dailyWheel.bonusRolls=9999;claimSingleMailEntry(S.testMail)');
 assert.equal(game.ev('S.testMail.gift.claimed'),true);assert.equal(game.ev('S.dailyWheel.bonusRolls'),10000);
 console.log('PASS: full balances keep prize gifts pending; exact-fit and duplicate delivery work');
}finally{game.close()}
