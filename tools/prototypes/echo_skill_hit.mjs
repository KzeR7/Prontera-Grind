// Disconnected research prototype: ONE direct skill hit against a non-boss Echo
// dummy. Not an endpoint or complete score; all inputs and rolls are synthetic.
// A trustworthy run must derive stats, equipment, timers and randomness on the server.
export function syntheticEchoSkillHit(stats, rolls) {
  const {raw,boost,dex,missChance,critChance,critDamage,fieldDamage,ascDamage,rangedBonus,magic}=stats;
  for (const v of [raw,boost,dex,missChance,critChance,critDamage,fieldDamage,ascDamage,rangedBonus])
    if (!Number.isFinite(v)) throw new TypeError('invalid synthetic skill stat');
  if (typeof magic!=='boolean' || !Array.isArray(rolls) || rolls.length!==3 ||
      rolls.some(v=>!Number.isFinite(v)||v<0||v>=1)) throw new TypeError('invalid synthetic skill input');
  if (rolls[0]*100<missChance) return {damage:0,critical:false};
  const critical=rolls[1]*100<Math.max(0,critChance);
  const lo=Math.min(.95,.7+dex*.004), variance=lo+rolls[2]*(1.15-lo);
  return {damage:Math.max(1,Math.round(raw*boost*variance*(critical?critDamage:1)*fieldDamage*ascDamage*
    (1+(magic?0:rangedBonus)/100))),critical};
}
