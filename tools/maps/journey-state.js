/* Dev-only continuous travel/encounter layout. No saves, rewards or combat simulation. */
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.PGMapJourney=factory();})(typeof globalThis==='object'?globalThis:this,function(){
'use strict';
const ASTRAL_Z=Object.freeze([-8,-30,-52,-74,-96,-118,-140,-162,-184,-208]);
const ROSTERS=Object.freeze({astral:Object.freeze([1702,1705,1700,1706,1707,1708]),thor:Object.freeze([1836,1837,1833,1831,1366,1832])});
function validStage(n){if(!Number.isInteger(n)||n<1||n>10)throw new RangeError('Stage must be 1–10');return n;}
function stageZ(n){return ASTRAL_Z[validStage(n)-1];}
class Travel{
 constructor(stage=1,{quick=true}={}){this.stage=validStage(stage);this.z=stageZ(stage);this.target=stage;this.speed=6.5;this.quick=!!quick;this.duration=0;this.arrivals=[];this.direction=4;this.paused=false;}
 plan(){const distance=Math.abs(this.z-stageZ(this.target));this.duration=distance?(this.quick?Math.min(3.5,Math.max(.8,distance/22)):distance/6.5):0;this.speed=distance?distance/this.duration:6.5;}
 setQuick(value){if(typeof value!=='boolean')throw new TypeError('Quick travel must be boolean');this.quick=value;this.plan();return this.snapshot();}
 request(stage){this.target=validStage(stage);this.paused=false;this.plan();return this.snapshot();}
 get encounterStage(){return this.moving?null:this.stage;}
 get moving(){return Math.abs(this.z-stageZ(this.target))>1e-7;}
 update(dt){if(!Number.isFinite(dt)||dt<0)throw new RangeError('Invalid travel delta');if(this.paused||!this.moving)return this.snapshot();
  // Quick transitions use visible wall-clock deltas, not a slow combat clock.
  // Bound a visible stall; the page resets its clock after hidden-tab pauses.
  let distance=this.speed*Math.min(dt,this.quick?.5:.1);
  while(distance>0&&this.moving){
   const dir=Math.sign(stageZ(this.target)-this.z);this.direction=dir<0?4:0;
   const candidates=ASTRAL_Z.map((p,i)=>({p,n:i+1})).filter(v=>(v.p-this.z)*dir>1e-7).sort((a,b)=>Math.abs(a.p-this.z)-Math.abs(b.p-this.z));
   const next=candidates[0].n;
   const waypoint=stageZ(next),remaining=Math.abs(waypoint-this.z),step=Math.min(distance,remaining);
   this.z+=dir*step;distance-=step;
   if(remaining<=step+1e-7){this.z=waypoint;this.stage=next;this.arrivals.push(next);if(this.arrivals.length>20)this.arrivals.shift();}
   if(step===0&&next===this.target)break;
  }return this.snapshot();
 }
 snapshot(){return{stage:this.stage,target:this.target,z:this.z,moving:this.moving,paused:this.paused,direction:this.direction,quick:this.quick,speed:this.speed,remainingSeconds:Math.abs(this.z-stageZ(this.target))/this.speed,encounterStage:this.encounterStage};}
}
function encounter(kind,stage){validStage(stage);if(!ROSTERS[kind])throw new RangeError('Unknown destination');
 const z=kind==='astral'?stageZ(stage):-8,group=stage===10?3:Math.floor((stage-1)/3),r=ROSTERS[kind];
 const ids=kind==='astral'?[[r[0],r[2]],[r[1],r[3],r[0]],[r[4],r[1],r[3]]]:[[r[0],r[1]],[r[2],r[1],r[4]],[r[3],r[2],r[4]]];
 const points=stage===10?[[0,-8],[-8,-3],[8,-3],[-7,-13],[7,-13]]:[[-7,-4],[6,-6],[-4,-12],[8,-15],[-9,2],[4,4]];
 return points.map(([x,dz],i)=>({key:kind+'-'+stage+'-'+i,nativeId:stage===10?(i===0?r[5]:r[i%2]):ids[group][i%ids[group].length],role:stage===10&&i===0?'MVP':'field',x,z:z+dz}));
}
return Object.freeze({ASTRAL_Z,ROSTERS,Travel,stageZ,encounter});
});
