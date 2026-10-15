const fs=require('node:fs'),assert=require('node:assert/strict');const dir=process.env.PRONTERA_AUDIT_OUTPUT||__dirname;
const baseline=JSON.parse(fs.readFileSync(dir+'/current-combat.json'));
const variants=process.argv.slice(2);const output={};
for(const name of variants){
 const candidate=JSON.parse(fs.readFileSync(dir+'/'+name+'-combat.json'));assert.equal(candidate.rows.length,baseline.rows.length);const groups={},classes={},losses=[],farmRegressions=[],alreadyLost=[];
 for(let i=0;i<baseline.rows.length;i++){
  const b=baseline.rows[i],a=candidate.rows[i];assert.deepEqual(a.scenario,b.scenario);assert.equal(a.seed,b.seed);
  for(const key of ['allocatedStats','gear','skillRanks','hp','atk','matk','crit','bonusAgi','gearAspd'])assert.deepEqual(a.build[key],b.build[key],key+' fixture differs');
  const key=b.scenario.name.replace(' (daggers)','');
  for(const [map,k]of [[groups,key],[classes,b.scenario.cls]]){
   const g=map[k]||(map[k]={pairs:0,currentKills:0,candidateKills:0,currentDeaths:0,candidateDeaths:0,currentBossWins:0,candidateBossWins:0,bossAttempts:0,newBossLosses:0,bossRecoveries:0,currentExtendedBossWins:0,candidateExtendedBossWins:0});
   g.pairs++;g.currentKills+=b.farm.kills;g.candidateKills+=a.farm.kills;g.currentDeaths+=b.farm.deaths;g.candidateDeaths+=a.farm.deaths;
   if(b.boss){g.currentExtendedBossWins+=Number((b.extendedBoss||b.boss).bossWin);g.candidateExtendedBossWins+=Number((a.extendedBoss||a.boss).bossWin);g.bossAttempts++;g.currentBossWins+=Number(b.boss.bossWin);g.candidateBossWins+=Number(a.boss.bossWin);g.newBossLosses+=Number(b.boss.bossWin&&!a.boss.bossWin);g.bossRecoveries+=Number(!b.boss.bossWin&&a.boss.bossWin);}
  }
  if(b.boss&&b.boss.bossWin&&!a.boss.bossWin)losses.push({cls:b.scenario.cls,scenario:key,weapon:b.scenario.weapon||'',seed:b.seed,currentBossSeconds:b.boss.elapsed,candidateDeath:!!a.boss.deaths,candidateTimeout:a.boss.bossTimedOut,agi:b.build.allocatedStats.agi,bonusAgi:b.build.bonusAgi,gearAspd:b.build.gearAspd});
  if(b.boss&&!b.boss.bossWin)alreadyLost.push({cls:b.scenario.cls,scenario:key,seed:b.seed,candidateWon:a.boss.bossWin});
  if(a.farm.deaths>b.farm.deaths)farmRegressions.push({cls:b.scenario.cls,scenario:key,seed:b.seed,currentDeaths:b.farm.deaths,candidateDeaths:a.farm.deaths,currentKills:b.farm.kills,candidateKills:a.farm.kills});
 }
 for(const g of Object.values(groups))g.farmingChangePct=100*(g.candidateKills/g.currentKills-1);
 const finalLosses=baseline.rows.flatMap((b,i)=>{const a=candidate.rows[i],bb=b.extendedBoss||b.boss,aa=a.extendedBoss||a.boss;return bb&&bb.bossWin&&!aa.bossWin?[{cls:b.scenario.cls,scenario:b.scenario.name,seed:b.seed,currentSeconds:bb.elapsed,candidateDeath:!!aa.deaths,candidateTimeout:aa.bossTimedOut}]:[]});
 output[name]={finalLosses,builds:candidate.rows.length,groups,classes,losses,farmRegressions,alreadyLost};
}
fs.writeFileSync(dir+'/comparison.json',JSON.stringify(output,null,2)+'\n');
console.log(JSON.stringify(output,null,2));
