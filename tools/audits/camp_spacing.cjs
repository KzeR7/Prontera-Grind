// Compare current spawning to a 3.35-unit-radius prototype, entirely in memory.
// Never edits index.html or deploys. The prototype is not an approved gameplay change.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const crypto=require('node:crypto');
const {createGame}=require('../tests/helpers/game');
const source=fs.readFileSync('index.html','utf8');
const oldA='CAMP_RING_MAX*1.45',oldB='CAMP_RING_MAX*1.75';
assert.equal(source.split(oldA).length,2,'expected one middle-ring candidate expression');
assert.equal(source.split(oldB).length,2,'expected one outer-ring candidate expression');
const prototype=source.replace(oldA,'3.35').replace(oldB,'3.35');
const scenarios=[[0,3],[4,4],[7,4],[9,4],[10,3],[11,3]];
const samples=500;
function measure(html){
  const g=createGame(html),ev=g.ev;
  try{
    return JSON.parse(ev(`JSON.stringify((()=>{
      const scenarios=${JSON.stringify(scenarios)},samples=${samples},out=[];
      for(const [map,stage] of scenarios){
        const fields=[];
        for(let n=0;n<samples;n++){
          let seed=(0x41c64e6d+map*100003+stage*1009+n)>>>0;
          Math.random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296};
          S=fresh();S.mp=map;S.lvl=stage;S.adv=false;S.auto=false;pl.x=0;pl.z=1.5;spawn();
          const spec=stageSpec(map,stage),water=spec.f&&spec.f.water;
          if(!camps.length)throw Error('scenario is not a regular camp field');
          let wide=0,maxRadius=0,closest=Infinity,pairsUnder2=0,pairsUnder26=0,dryViolations=0,edgeViolations=0,onBoundary=0,missing=0;
          for(const c of camps){
            const group=mobs.filter(m=>m.pack===c.i);
            if(!group.length)missing++;
            for(const m of group){const d=Math.hypot(m.x-c.x,m.z-c.z);maxRadius=Math.max(maxRadius,d);if(d>3.35+1e-9)wide++;}
          }
          for(let i=0;i<mobs.length;i++){
            const m=mobs[i];if(water&&m.z>=water[0]-1.2&&m.z<=water[1]+1.2)dryViolations++;
            if(m.x< -BX_+.6-1e-9||m.x>BX_-.6+1e-9||m.z<Z0+.6-1e-9||m.z>Z1-.6+1e-9)edgeViolations++;
            if(Math.abs(m.x-(-BX_+.6))<1e-9||Math.abs(m.x-(BX_-.6))<1e-9||Math.abs(m.z-(Z0+.6))<1e-9||Math.abs(m.z-(Z1-.6))<1e-9)onBoundary++;
            for(let j=i+1;j<mobs.length;j++){const d=Math.hypot(m.x-mobs[j].x,m.z-mobs[j].z);closest=Math.min(closest,d);if(d<2)pairsUnder2++;if(d<2.6)pairsUnder26++;}
          }
          fields.push({n,mobs:mobs.length,camps:camps.length,missing,wide,maxRadius,closest,pairsUnder2,pairsUnder26,dryViolations,edgeViolations,onBoundary});
        }
        out.push({map,stage,fields});
      }return out;
    })())`));
  }finally{g.close()}
}
const current=measure(source),candidate=measure(prototype);
function summarize(a,b){
 const total=(f,k)=>f.reduce((n,x)=>n+x[k],0);
 const result=[];
 for(let i=0;i<a.length;i++){
  const x=a[i],y=b[i];assert.equal(x.map,y.map);assert.equal(x.stage,y.stage);
  const v=(r)=>({fields:r.fields.length,avgMonsters:+(total(r.fields,'mobs')/samples).toFixed(2),
    minCampCount:Math.min(...r.fields.map(f=>f.camps)),emptyCamps:total(r.fields,'missing'),
    fieldsOutside335:r.fields.filter(f=>f.wide>0).length,monstersOutside335:total(r.fields,'wide'),
    maxRadius:+Math.max(...r.fields.map(f=>f.maxRadius)).toFixed(3),
    fieldsWithPairUnder2:r.fields.filter(f=>f.pairsUnder2>0).length,
    fieldsWithPairUnder26:r.fields.filter(f=>f.pairsUnder26>0).length,
    minPair:+Math.min(...r.fields.map(f=>f.closest)).toFixed(3),waterViolations:total(r.fields,'dryViolations'),edgeViolations:total(r.fields,'edgeViolations'),onBoundary:total(r.fields,'onBoundary')});
  result.push({map:x.map,stage:x.stage,current:v(x),prototype:v(y)});
 }
 return result;
}
const report={sourceSha256:crypto.createHash('sha256').update(source).digest('hex'),seed:'0x41c64e6d + map*100003 + stage*1009 + trial, LCG 1664525/1013904223',
  perScenario:samples,layoutOnly:true,note:'Seeded distributions are comparable but not paired causal estimates: the variants consume different numbers of random draws.',prototype:'limit both widened candidate tiers to 3.35; game source unchanged',results:summarize(current,candidate)};
console.log(JSON.stringify(report,null,2));
