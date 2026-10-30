// Real browser-loop parity for one fixed fresh Novice loadout only. Not proof of
// authoritative gameplay, real leaderboard scoring, secure RNG or hosted D1.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {NOVICE_TEST_STATS,syntheticNoviceEcho} from '../prototypes/echo_novice_run.mjs';
const require=createRequire(import.meta.url),{createGame}=require('./helpers/game');
const game=createGame();
try {
  const stats=JSON.parse(game.ev(`(()=>{S=fresh();resetSkillRuntime();mob={n:'dummy',boss:false,critRes:0,hp:Infinity,max:Infinity,pack:0,fixed:true};mobs=[mob];
    return JSON.stringify({base:atk(),dex:st('dex'),missChance:missCh(),critChance:crit(),critDamage:critD(),
      fieldDamage:fieldDamage(mob),ascDamage:ascDamage(mob),bladeBonus:skillBonus('ascBlade'),rangedBonus:skillBonus('ascRanged')})})()`));
  assert.deepEqual(stats,NOVICE_TEST_STATS,'fixed synthetic stats must match current fresh Novice formulas');
  assert.equal(game.ev('aspd()'),.84507);
  assert.equal(game.ev('swingLength(aspd())*SWING_CONTACT'),.55*.45);
  for(const dt of [1/30,1/60,1/100])for(const seed of [0,12345,0xdeadbeef]){
    const expected=syntheticNoviceEcho(seed,dt);
    const actual=JSON.parse(game.ev(`(()=>{
      S=fresh();swing=null;atkAnim=0;t=0;S.pets=[];
      const previousStrike=strike,previousRandom=Math.random;let seed=${seed}>>>0,ticks=0,hits=[];
      strike=(...args)=>{const r=Math.random;Math.random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296};
        try{const before=S.dmg;previousStrike(...args);hits.push(S.dmg-before)}finally{Math.random=r}};
      try{trialEnter('training');while(TRIAL.on&&ticks<200000){update(${dt});ticks++}
        if(TRIAL.on)throw Error('Echo did not finish');return JSON.stringify({ticks,hits,damage:TRIAL.result.dmg,dps:TRIAL.result.dps});
      }finally{strike=previousStrike;Math.random=previousRandom}
    })()`));
    assert.deepEqual(actual,expected,`seed ${seed}, dt ${dt}`);
  }
  // A fair authoritative ruleset must own its cadence; the current loop is not
  // frame-rate independent even with the same loadout and RNG stream.
  assert.equal(syntheticNoviceEcho(12345,1/30).hits.length,208);
  assert.equal(syntheticNoviceEcho(12345,1/60).hits.length,212);
  assert.throws(()=>syntheticNoviceEcho(-1),/invalid/);
  assert.throws(()=>syntheticNoviceEcho(1,0),/invalid/);
  console.log('PASS: 9 synthetic 180-second fresh Novice, basic-only runs match real fixed-step Echo loop, including miss-dependent RNG consumption');
}finally{game.close()}
