const fs=require('node:fs'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const path=require('node:path'),root=process.env.PRONTERA_REPO_ROOT||process.cwd(),auditDir=process.env.PRONTERA_AUDIT_OUTPUT||__dirname;
const {createGame}=require(path.join(root,'tools/tests/helpers/game'));
const source=fs.readFileSync(path.join(root,'index.html'),'utf8'),script=fs.readFileSync(path.join(__dirname,'progression-audit.js'),'utf8');
const start=script.indexOf('g.ev(`'),setup=script.slice(start+6,script.indexOf('`);\nconst lines=',start));
const formulas=JSON.parse(fs.readFileSync(path.join(__dirname,'aspd-formulas.json'),'utf8'));
const original=source.split('\n').find(l=>l.startsWith('const aspd='));
for(const variant of process.argv.slice(2)){
 const file=path.join(auditDir,variant+'-combat.json'),data=JSON.parse(fs.readFileSync(file));
 const limit=Number(process.env.BOSS_LIMIT_SECONDS)||300;const selected=data.rows.filter(r=>r.extendedBoss?r.extendedBoss.bossTimedOut:r.boss&&r.boss.bossTimedOut);const g=createGame(source.replace(original,formulas[variant]));g.ev(setup);
 for(const row of selected){
  const clean=JSON.parse(JSON.stringify(g.ev(`window.__configureAudit(${JSON.stringify(row.scenario)},${row.seed})`)));
  for(const key of ['allocatedStats','gear','skillRanks'])assert.deepEqual(clean[key],row.build[key]);
  const replay=JSON.parse(JSON.stringify(g.ev('window.__runAudit(120,true)')));assert.deepEqual(replay,row.boss,'120s replay differs '+variant+' '+row.scenario.cls+' '+row.seed);
  row.extendedBoss=JSON.parse(JSON.stringify(g.ev('window.__runAudit('+limit+',true)')));
  console.log(variant,row.scenario.cls,row.scenario.name,row.seed,row.extendedBoss.bossWin?'win':row.extendedBoss.deaths?'death':'timeout',row.extendedBoss.elapsed.toFixed(1)+'s');
 }
 data.aspdFormula=formulas[variant];data.extendedBossChecks={limitSeconds:limit,command:'BOSS_LIMIT_SECONDS='+limit+' node extend-bosses.js '+variant,scriptHash:crypto.createHash('sha256').update(fs.readFileSync(__filename)).digest('hex'),reproduced120SecondResults:true};
 fs.writeFileSync(file,JSON.stringify(data,null,2)+'\n');g.close();console.log('PASS '+variant+' '+selected.length+' extended/reproduced encounters');
}
