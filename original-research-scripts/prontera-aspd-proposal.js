const assert=require('node:assert/strict');
const {createGame}=require('/home/vercel-sandbox/workspace/repos/github.com/kingz0007/prontera-grind/tools/tests/helpers/game');
const g=createGame();
const results=g.ev(`(()=>{
 const model=(agi,gearAgi,gearAspd,skillAspd=0,masteryAspd=5)=>Math.max(.13,.85*C().aspd*(1-Math.min(.68,(agi+Math.min(25,gearAgi*.1))*.0058))/(1+(gearAspd*.25+skillAspd+masteryAspd)/100));
 const prepare=cls=>{S=fresh();S.cls=cls;S.lv=150;for(const s of SKILLS.filter(s=>s.cls.includes(cls)))S.sk[s.id]=s.max;resetSkillRuntime();for(const s of SKILLS.filter(s=>s.cls.includes(cls)&&s.type==='buff'&&s.key==='speed'))skillState().buffs[s.id]={key:s.key,value:s.f(s.max)};};
 const threshold=(ga,gs,ss)=>{for(let a=1;a<=120;a++)if(model(a,ga,gs,ss)===.13)return a;return null};
 prepare('Assassin Cross');
 const profiles=[{name:'Moderate equipment',bonusAgi:105,gearAspd:30},{name:'Strong equipment',bonusAgi:175,gearAspd:60},{name:'Maximum katar gear',bonusAgi:388.4,gearAspd:105},{name:'Maximum dual daggers',bonusAgi:422.9,gearAspd:125.5}];
 const assassin=profiles.map(p=>({...p,minimumAllocatedAgi:threshold(p.bonusAgi,p.gearAspd,pv('aspd')),attacksPerSecondAtAgi:[20,60,80,100,120].map(a=>({agi:a,aps:1/model(a,p.bonusAgi,p.gearAspd,pv('aspd'))}))}));
 const classes=['Lord Knight','High Wizard','Sniper','Assassin Cross','High Priest','Whitesmith'].map(cls=>{prepare(cls);const magic=cls==='High Wizard',daggers=cls==='Assassin Cross',ga=magic?240:daggers?422.9:388.4,gs=magic?64:daggers?125.5:105;return{cls,skillAspd:pv('aspd'),intervalAt120:model(120,ga,gs,pv('aspd')),minimumAllocatedAgi:threshold(ga,gs,pv('aspd'))};});
 return{assassin,classes};
})()`);
for(const p of results.assassin){assert.ok(p.minimumAllocatedAgi>=70&&p.minimumAllocatedAgi<=110);for(let i=1;i<p.attacksPerSecondAtAgi.length;i++)assert.ok(p.attacksPerSecondAtAgi[i].aps>=p.attacksPerSecondAtAgi[i-1].aps);assert.equal(p.attacksPerSecondAtAgi.at(-1).aps,1/.13);}
console.log(JSON.stringify(results,null,2));g.close();
