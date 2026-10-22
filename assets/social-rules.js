/* Shared plaza navigation: server and browser use the same walkable space. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;root.PGSocialRules=api})(globalThis,()=>{
'use strict';
const LIMIT=24,SPEED=5,CAPACITY=20;
const EMOTIONS=['surprise','question','music','heart','love','sweat','idea','anger','cloud','money','dots','rock'];
function walkable(x,z){return Number.isFinite(x)&&Number.isFinite(z)&&Math.abs(x)<=LIMIT&&Math.abs(z)<=LIMIT&&Math.hypot(x,z)>5.6&&[[-18,-18],[18,-18],[-18,18],[18,18]].every(([a,b])=>Math.hypot(x-a,z-b)>.85);}
function path(from,to){
 if(!walkable(to.x,to.z))return [];
 const start=[Math.round(from.x),Math.round(from.z)],end=[Math.round(to.x),Math.round(to.z)],key=(x,z)=>x+','+z;
 const queue=[start],prev=new Map([[key(...start),null]]);let found=null;
 for(let i=0;i<queue.length;i++){const [x,z]=queue[i];if(x===end[0]&&z===end[1]){found=[x,z];break}
 for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]]){const nx=x+dx,nz=z+dz,k=key(nx,nz);if(prev.has(k)||!walkable(nx,nz)||!walkable(x+dx,z)||!walkable(x,z+dz))continue;prev.set(k,[x,z]);queue.push([nx,nz]);}}
 if(!found)return [];const route=[];for(let p=found;prev.get(key(...p));p=prev.get(key(...p)))route.unshift({x:p[0],z:p[1]});return route;
}
function advance(p,now){let distance=Math.max(0,(now-p.at)/1000)*SPEED;p.at=now;while(p.path.length&&distance>0){const t=p.path[0],dx=t.x-p.x,dz=t.z-p.z,d=Math.hypot(dx,dz);p.dir=(Math.round(Math.atan2(-dx,dz)/(Math.PI/4))+8)%8;if(d<=distance){p.x=t.x;p.z=t.z;p.path.shift();distance-=d}else{p.x+=dx/d*distance;p.z+=dz/d*distance;break}}return p;}
return {LIMIT,SPEED,CAPACITY,EMOTIONS,walkable,path,advance};
});
