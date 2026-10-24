/* Shared plaza layout/navigation: server and browser use the same walkable space. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;root.PGSocialRules=api})(globalThis,()=>{
'use strict';
// v225 (owner): plaza walking uses the character's own field run speed instead of a flat 5 u/s.
// The field game reports moveSpd(true) in its look, the room validates it into this band, and both
// server and client read it here, so nobody rubber-bands. SPEED stays the fallback for older
// clients, and for a Pages Worker that still strips the field. A new client + new Worker always
// agree; an old Worker echoes no speed, so the client falls back to the same 5 u/s it advances at.
const LIMIT=74,SPEED=5,MIN_SPEED=2,MAX_SPEED=13,CAPACITY=20,CHAT_DELAY=3000;
const EMOTIONS=['surprise','question','music','heart','love','sweat','idea','anger','cloud','money','dots','rock','scissors','paper','kiss','ok','dead','sorry','laugh','smile','cry','shy','kissheart','think','hmm','blush','drool','meh','panic','sleep','mail','gg'];
const BUILDINGS=[{name:'stall',x:-32,z:-15,size:4.5,rotation:Math.PI/2,w:4.5,d:4.5},{name:'cart',x:32,z:-15,size:4.5,rotation:-Math.PI/2,w:4.5,d:4.5},{name:'hall',x:0,z:-57,size:62,rotation:Math.PI,w:62,d:39},...[-1,1].map(side=>({name:'tower',x:side*33,z:-59,size:22,w:22,d:22})),...[-1,1].flatMap(side=>[-25,16,56].map(z=>({name:'house',x:side*46,z,size:21,rotation:side*Math.PI/2,w:21,d:21}))),...[-1,1].map(side=>({name:'house',x:side*27,z:65,size:17,rotation:Math.PI,w:17,d:17}))];
// Four planted corners leave both crossing avenues and the fountain promenade open.
const GARDENS=[...[-1,1].flatMap(x=>[-1,1].map(z=>({x:x*23,z:z*23,w:12,d:12})))];
const TREES=GARDENS.map(g=>({x:g.x,z:g.z,size:8}));
// The source "lamp" is a stone column; it is not used as street furniture.
const SEATS=[...[-1,1].flatMap(side=>[-1,1].flatMap(bank=>[11,15,19].map(x=>({x:bank*x,z:side*13,dir:side===1?4:0,rotation:side===1?Math.PI:0,height:.95,size:3.4}))))].map((s,id)=>({...s,id}));
function walkable(x,z){return Number.isFinite(x)&&Number.isFinite(z)&&Math.abs(x)<=LIMIT&&Math.abs(z)<=LIMIT&&Math.hypot(x,z)>5.6&&BUILDINGS.every(b=>Math.abs(x-b.x)>b.w/2+.7||Math.abs(z-b.z)>b.d/2+.7)&&GARDENS.every(g=>Math.abs(x-g.x)>g.w/2+.5||Math.abs(z-g.z)>g.d/2+.5);}
function path(from,to){
 if(!walkable(to.x,to.z))return [];
 const start=[Math.round(from.x),Math.round(from.z)],end=[Math.round(to.x),Math.round(to.z)],key=(x,z)=>x+','+z;
 const queue=[start],prev=new Map([[key(...start),null]]);let found=null;
 for(let i=0;i<queue.length;i++){const [x,z]=queue[i];if(x===end[0]&&z===end[1]){found=[x,z];break}
 for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]]){const nx=x+dx,nz=z+dz,k=key(nx,nz);if(prev.has(k)||!walkable(nx,nz)||!walkable(x+dx,z)||!walkable(x,z+dz))continue;prev.set(k,[x,z]);queue.push([nx,nz]);}}
 if(!found)return [];const route=[];for(let p=found;prev.get(key(...p));p=prev.get(key(...p)))route.unshift({x:p[0],z:p[1]});return route;
}
function walkSpeed(p){const value=Number(p&&p.look&&p.look.speed);return Number.isFinite(value)&&value>0?Math.max(MIN_SPEED,Math.min(MAX_SPEED,value)):SPEED}
function advance(p,now){let distance=Math.max(0,(now-p.at)/1000)*walkSpeed(p);p.at=now;while(p.path.length&&distance>0){const t=p.path[0],dx=t.x-p.x,dz=t.z-p.z,d=Math.hypot(dx,dz);p.dir=(Math.round(Math.atan2(-dx,dz)/(Math.PI/4))+8)%8;if(d<=distance){p.x=t.x;p.z=t.z;p.path.shift();distance-=d}else{p.x+=dx/d*distance;p.z+=dz/d*distance;break}}if(!p.path.length&&Number.isInteger(p.seat)&&SEATS[p.seat]){p.sit=true;p.dir=SEATS[p.seat].dir}return p;}
return {LIMIT,SPEED,MIN_SPEED,MAX_SPEED,walkSpeed,CAPACITY,CHAT_DELAY,EMOTIONS,BUILDINGS,GARDENS,TREES,SEATS,walkable,path,advance};
});
