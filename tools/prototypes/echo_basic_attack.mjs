// RESEARCH PROTOTYPE ONLY: one physical basic strike against the stationary,
// non-boss Echo dummy. Not an authoritative game, run, loadout, score or endpoint.
// Values AND random rolls would need to originate in a future trusted server engine;
// never accept them from a client. Skills, pets, tick timing and progression are absent.
export function basicEchoStrike(stats, rolls) {
  const {base,dex,missChance,critChance,critDamage,fieldDamage,ascDamage,bladeBonus,rangedBonus}=stats;
  for(const value of [base,dex,missChance,critChance,critDamage,fieldDamage,ascDamage,bladeBonus,rangedBonus])
    if(!Number.isFinite(value))throw new TypeError('invalid strike stat');
  if(!Array.isArray(rolls)||rolls.length!==3||rolls.some(x=>!Number.isFinite(x)||x<0||x>=1))
    throw new TypeError('invalid synthetic random rolls');
  if(rolls[0]*100<missChance)return {damage:0,critical:false};
  const critical=rolls[1]*100<Math.max(0,critChance);
  const lo=Math.min(.95,.7+dex*.004),variance=lo+rolls[2]*(1.15-lo);
  // Order deliberately matches index.html strike() for a physical, non-boss Echo dummy.
  const damage=Math.max(1,Math.round(base*variance*(critical?critDamage:1)*1*fieldDamage*ascDamage*
    (1+bladeBonus/100)*(1+rangedBonus/100)));
  return {damage,critical};
}
