// Compare a LOCAL-ONLY basic-hit prototype against real browser game strike().
// This does not implement a full Echo run or establish trusted player state.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { basicEchoStrike } from '../prototypes/echo_basic_attack.mjs';
const require=createRequire(import.meta.url),{createGame}=require('./helpers/game');
const game=createGame();
try {
  for(const [cls,level,dex,luk] of [['Novice',1,1,1],['Swordman',50,30,50],['Assassin Cross',150,120,120],['Warlock',150,80,25]]){
    game.ev(`S=fresh();S.cls=${JSON.stringify(cls)};S.lv=${level};S.st.dex=${dex};S.st.luk=${luk};
      mob={n:'Synthetic Echo dummy',x:0,z:-4,hp:Infinity,max:Infinity,pack:0,boss:false,fixed:true,critRes:0};mobs=[mob];
      resetSkillRuntime();`);
    const stats=JSON.parse(game.ev(`JSON.stringify({base:atk(),dex:st('dex'),missChance:missCh(),critChance:crit(),critDamage:critD(),
      fieldDamage:fieldDamage(mob),ascDamage:ascDamage(mob),bladeBonus:skillBonus('ascBlade'),rangedBonus:skillBonus('ascRanged')})`));
    let seed=0x12345678;
    for(let i=0;i<300;i++){
      const rolls=Array.from({length:3},()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296});
      const expected=basicEchoStrike(stats,rolls);
      const actual=game.ev(`(()=>{const old=Math.random,rolls=${JSON.stringify(rolls)};let i=0;Math.random=()=>rolls[i++];
        try{S.dmg=0;mob.hp=Infinity;strike(1,'#fff');return S.dmg||0}finally{Math.random=old}})()`);
      assert.equal(actual,expected.damage,`${cls} trial ${i}`);
    }
  }
  assert.throws(()=>basicEchoStrike({},[0,0,0]),/invalid strike stat/);
  assert.throws(()=>basicEchoStrike({base:1,dex:1,missChance:0,critChance:0,critDamage:1,fieldDamage:1,ascDamage:1,bladeBonus:0,rangedBonus:0},[0,1,0]),/invalid synthetic random rolls/);
  console.log('PASS: 1,200 synthetic physical Echo basic hits match the current game strike calculation');
}finally{game.close()}
