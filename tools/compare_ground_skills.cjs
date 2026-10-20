// Paired real-loop comparison against the pre-retune game. No historical fixtures are rewritten.
// node tools/compare_ground_skills.cjs /absolute/output.json [--full]
const fs=require('node:fs'),cp=require('node:child_process'),crypto=require('node:crypto');
const {createGame}=require('./tests/helpers/game'),{configure,stationary}=require('./skill_balance');
const baselineRevision='a26d15d2b488bb76076419d67c9c24c4cf7aeb24';
const before=cp.execFileSync('git',['show',baselineRevision+':index.html'],{encoding:'utf8',maxBuffer:20e6});
const after=fs.readFileSync('index.html','utf8'),hash=s=>crypto.createHash('sha256').update(s).digest('hex');
const full=process.argv.includes('--full'),rows=[];
const option=(key,fallback)=>process.argv.find(a=>a.startsWith('--'+key+'='))?.split('=')[1]||fallback;
const seeds=option('seeds',full?'123,789,987':'123').split(',').map(Number),seconds=Number(option('seconds',full?'120':'60'));
const selected=option('classes','').split(',').filter(Boolean);
function setup(g,cls,profile,seed){
 const parent={Warlock:'High Wizard','Arch Bishop':'High Priest',Ranger:'Sniper'}[cls]||cls;
 configure(g,parent,profile,'',seed);
 if(parent!==cls)g.ev(`S.cls=${JSON.stringify(cls)};S.lv=150;S.sk=Object.fromEntries(SKILLS.filter(s=>s.cls.includes(S.cls)&&!s.ascensionOnly).map(s=>[s.id,Math.min(s.max,${[1,5,10][profile]})]));S.jobs[S.cls]={jl:60,jx:0};resetSkillRuntime();S.hp=maxHp();`);
 g.ev('S.kite=false');
}
for(const cls of ['Mage','Wizard','High Wizard','Archer','Hunter','Sniper','Acolyte','Priest','High Priest','Warlock','Arch Bishop','Ranger'].filter(c=>!selected.length||selected.includes(c))){
 const games=[createGame(before),createGame(after)];
 try{for(const profile of [0,1,2])for(const count of [1,3])for(const seed of seeds){
  const results=games.map(g=>{setup(g,cls,profile,seed);return stationary(g,count,seconds)});
  rows.push({cls,profile,count,seed,before:results[0].dps,after:results[1].dps,delta:results[1].dps/results[0].dps-1});
 }}finally{games.forEach(g=>g.close())}
 const selected=rows.filter(r=>r.cls===cls);console.log(cls,Math.min(...selected.map(r=>r.delta*100)).toFixed(2)+'% to '+Math.max(...selected.map(r=>r.delta*100)).toFixed(2)+'%');
}
const output=process.argv[2];if(!output||output.startsWith('--'))throw Error('Supply output JSON path');
fs.writeFileSync(output,JSON.stringify({baselineRevision,baselineHash:hash(before),sourceHash:hash(after),toolHash:hash(fs.readFileSync(__filename)),seconds,seeds,rows},null,2)+'\n');
console.log('Wrote',output);
