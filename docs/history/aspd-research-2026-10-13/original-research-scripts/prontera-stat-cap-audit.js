const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const src=fs.readFileSync('index.html','utf8');
const line=prefix=>src.split('\n').find(l=>l.startsWith(prefix));
const box={agi:120,luk:120,pct:0,C:()=>({aspd:.5}),st:k=>k==='agi'?box.agi:box.luk,pv:()=>0,bon:k=>k==='aspd'?box.pct:0,cardMasteryStat:()=>0,tb:{},indexCrit:()=>0,petPassive:()=>0,equipmentMove:()=>0};
vm.createContext(box);vm.runInContext([line('const aspd='),line('const crit='),line('const heroMoveSpeedForAgi=')].join('\n')+'\nthis.calc={aspd,crit,heroMoveSpeedForAgi};',box);
assert.ok(Math.abs(box.calc.aspd()-.136)<1e-12);box.pct=5;assert.equal(box.calc.aspd(),.13);assert.equal(box.calc.crit(),32);
assert.ok(box.calc.heroMoveSpeedForAgi(200)>box.calc.heroMoveSpeedForAgi(120));
console.log(JSON.stringify({assassinCrossAgi120:{unbuffedInterval:.136,with5PercentAspd:box.calc.aspd()},luk120Crit:box.calc.crit(),agiAttackReductionCeiling:.68/.0058,movementAgi120:box.calc.heroMoveSpeedForAgi(120),movementAgi200:box.calc.heroMoveSpeedForAgi(200),sourceSha256:crypto.createHash('sha256').update(src).digest('hex'),auditSha256:crypto.createHash('sha256').update(fs.readFileSync(__filename)).digest('hex'),node:process.version},null,2));
