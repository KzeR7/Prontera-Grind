// Local parity only. This does not implement full skills, trusted inventory or a run.
const assert=require('node:assert/strict');
const {createGame}=require('./helpers/game');
(async()=>{
 const {syntheticEchoSkillHit}=await import('../prototypes/echo_skill_hit.mjs');
 const game=createGame();
 try{
  let tested=0;
  for(const [cls,lv,dex,luk] of [['Novice',1,1,1],['Swordman',50,30,50],['Assassin Cross',150,120,120],['Warlock',150,80,25]]){
   game.ev(`S=fresh();S.cls=${JSON.stringify(cls)};S.lv=${lv};S.st.dex=${dex};S.st.luk=${luk};
     mob={n:'Synthetic Echo dummy',x:0,z:-4,hp:Infinity,max:Infinity,pack:0,boss:false,fixed:true,critRes:0};mobs=[mob];resetSkillRuntime();`);
   for(const magic of [false,true]){
    const stats=JSON.parse(game.ev(`JSON.stringify({raw:1000,boost:1,dex:st('dex'),missChance:missCh(),
      critChance:crit(skillBonus('critical'))+ascSkillValue('bash','critical'),critDamage:critD(),
      fieldDamage:fieldDamage(mob),ascDamage:ascDamage(mob),rangedBonus:skillBonus('ascRanged'),magic:${magic}})`));
    let seed=0x12345678;
    for(let i=0;i<300;i++){
     const rolls=Array.from({length:3},()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296});
     const expected=syntheticEchoSkillHit(stats,rolls);
     const actual=game.ev(`(()=>{const old=Math.random,rolls=${JSON.stringify(rolls)};let i=0;Math.random=()=>rolls[i++];
       try{S.dmg=0;mob.hp=Infinity;return skillHit(mob,1000,{id:'bash',magic:${magic},col:'#fff'},true)}finally{Math.random=old}})()`);
     assert.equal(actual,expected.damage,`${cls}, magic=${magic}, sample ${i}`);tested++;
    }
   }
  }
  assert.throws(()=>syntheticEchoSkillHit({},[0,0,0]),/invalid synthetic/);
  console.log(`PASS: ${tested} synthetic direct skill hits match the current Echo dummy (not a full run or trusted scoring).`);
 }finally{game.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
