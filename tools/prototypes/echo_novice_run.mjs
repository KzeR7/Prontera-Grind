// DISCONNECTED RESEARCH ONLY. This is a fixed-step reproduction for the fresh
// Novice's basic attacks against the neutral Echo dummy, not a competitive
// ruleset, endpoint or trusted score. It ignores skills, pets, gear selection,
// other classes, browser frame pacing and authoritative identity/time/storage.
// Its synthetic PRNG is deliberately NOT secure. Never connect it to rankings.
import { basicEchoStrike } from './echo_basic_attack.mjs';

// Values measured against fresh() and derived game functions by the parity test.
export const NOVICE_TEST_STATS = Object.freeze({
  base:13, dex:1, missChance:14.75, critChance:2.25, critDamage:1.9129999999999998,
  fieldDamage:1, ascDamage:1, bladeBonus:0, rangedBonus:0,
});
const DURATION=180, FIRST_ATTACK=.2, INTERVAL=.84507, SWING_CONTACT=.55*.45;

export function syntheticNoviceEcho(seed, dt=1/60) {
  if(!Number.isInteger(seed)||seed<0||seed>0xffffffff||!Number.isFinite(dt)||dt<=0||dt>1/10)
    throw new TypeError('invalid synthetic simulation input');
  let state=seed>>>0,left=DURATION,pAtk=FIRST_ATTACK,swing=null,ticks=0,damage=0;
  const hits=[];
  const random=()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state/4294967296;};
  // The game updates its run timer before resolving swings and starting attacks.
  while(true){
    if(++ticks>200000)throw new RangeError('synthetic step limit exceeded');
    left-=dt;
    if(left<=0)break;
    if(swing!==null){
      swing-=dt;
      if(swing<=0){
        swing=null;
        const first=random();
        // strike() stops after the miss roll; do not consume extra synthetic RNG.
        const rolls=first*100<NOVICE_TEST_STATS.missChance?[first,0,0]:[first,random(),random()];
        const hit=basicEchoStrike(NOVICE_TEST_STATS,rolls).damage;
        hits.push(hit);damage+=hit;
      }
    }
    pAtk-=dt;
    if(pAtk<=0){pAtk=INTERVAL;swing=SWING_CONTACT;}
  }
  return {ticks,hits,damage,dps:damage/DURATION};
}
