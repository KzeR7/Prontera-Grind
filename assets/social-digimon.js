/* Small on-demand Digimon follower atlas. Presentation only; never battle authority. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.PGSocialDigimon=api})(typeof globalThis==='object'?globalThis:this,function(){
'use strict';
const names=['agumon','gabumon','patamon','palmon','greymon','metalgreymon','wargreymon','garurumon','weregarurumon','metalgarurumon','angemon','magnaangemon','seraphimon','togemon','lillymon','rosemon'];
const clean=value=>names.includes(value)?value:null;
// Walk timing follows the same speed used to advance the player. Idle is a little faster than the
// reference's 62.5 ms. Clamps avoid invisible/unstable animation at extreme player speeds.
function delay(stance,speed){const n=Number(speed);return stance==='walking'?Math.max(10,Math.min(125,50*5/(Number.isFinite(n)&&n>0?n:5))):50}
function frameIndex(count,elapsed,stance,speed){return count?Math.floor(Math.max(0,elapsed)/delay(stance,speed))%count:0}
function draw(ctx,asset,stance,elapsed,speed,flip){
 const rec=asset.record,frames=rec.actions[stance],f=frames[frameIndex(frames.length,elapsed,stance,speed)],scale=96/rec.figureHeight;
 ctx.clearRect(0,0,256,256);ctx.imageSmoothingEnabled=false;ctx.save();if(flip){ctx.translate(256,0);ctx.scale(-1,1)}
 const [sx,sy,w,h]=f.rect,[ox,oy]=f.offset;ctx.drawImage(asset.image,sx,sy,w,h,128+(ox-rec.anchor[0])*scale,192+(oy-rec.anchor[1])*scale,w*scale,h*scale);ctx.restore();return f;
}
// Each viewer keeps a cosmetic breadcrumb trail. It is separate from the authoritative player
// path and save; only a wildly discontinuous server correction resets the follower.
const FOLLOW_GAP=2.7, MAX_STEP=20, MAX_TRAIL=256;
const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
function clearLine(a,b,walkable){const n=Math.ceil(distance(a,b)/.2);for(let i=0;i<=n;i++){const t=n?i/n:0;if(!walkable(a.x+(b.x-a.x)*t,a.z+(b.z-a.z)*t))return false}return true}
function createFollower(leader,dir,walkable){
 const angle=(Number(dir)||0)*Math.PI/4,back={x:Math.sin(angle),z:-Math.cos(angle)},side={x:-back.z,z:back.x};
 const candidates=[[back.x*2,back.z*2],[side.x*2,side.z*2],[-side.x*2,-side.z*2],[-back.x*2,-back.z*2],[0,0]];
 const start=candidates.map(([x,z])=>({x:leader.x+x,z:leader.z+z})).find(p=>clearLine(p,leader,walkable))||{x:leader.x,z:leader.z};
 return {x:start.x,z:start.z,trail:[{x:leader.x,z:leader.z}],lastLeader:{x:leader.x,z:leader.z},dx:0,dz:0,travel:0,walking:false};
}
function stepFollower(f,leader,dt,speed,walkable,path){
 const last=f.lastLeader,delta=distance(last,leader);
 if(delta>MAX_STEP){Object.assign(f,createFollower(leader,leader.dir,walkable));return f}
 if(delta>.001){
  // If a low frame rate crossed a sharp corner, insert the shared grid route rather than cut
  // through a building or water. Usually this is just the observed player's interpolated point.
  let points=[{x:leader.x,z:leader.z}];
  if(!clearLine(last,leader,walkable)){const route=path(last,leader);if(!route.length){Object.assign(f,createFollower(leader,leader.dir,walkable));return f}points=[...route,{x:leader.x,z:leader.z}]}
  for(const pt of points)if(distance(f.trail[f.trail.length-1],pt)>.001)f.trail.push({x:pt.x,z:pt.z});
  f.lastLeader={x:leader.x,z:leader.z};
  if(f.trail.length>MAX_TRAIL){Object.assign(f,createFollower(leader,leader.dir,walkable));return f}
 }
 let remaining=0,prev=f;for(const pt of f.trail){remaining+=distance(prev,pt);prev=pt}
 let budget=Math.min(Math.max(0,Number(dt)||0)*Math.max(0,Number(speed)||0),Math.max(0,remaining-FOLLOW_GAP)),moved=0;
 while(f.trail.length&&budget>1e-6){const next=f.trail[0],dx=next.x-f.x,dz=next.z-f.z,d=Math.hypot(dx,dz);if(d<1e-6){f.trail.shift();continue}const step=Math.min(d,budget);f.x+=dx/d*step;f.z+=dz/d*step;f.dx=dx/d;f.dz=dz/d;f.travel+=step;moved+=step;budget-=step;if(step>=d-1e-6)f.trail.shift()}
 // Retain the latest leader position when all nodes have been consumed.
 if(!f.trail.length)f.trail.push({x:leader.x,z:leader.z});
 f.walking=moved>1e-5;return f;
}
function createStore(){let catalog=null,pendingCatalog=null;const cache=new Map(),pending=new Map(),failed=new Map();
 async function init(){if(catalog)return catalog;if(!pendingCatalog)pendingCatalog=fetch('assets/digimon/v2/catalog.json').then(r=>{if(!r.ok)throw Error('Digimon catalog unavailable');return r.json()}).then(c=>{if(c.version!==2||!c.species)throw Error('Invalid Digimon catalog');return catalog=c}).finally(()=>pendingCatalog=null);return pendingCatalog}
 async function request(id){id=clean(id);if(!id)return null;if(cache.has(id))return cache.get(id);if(pending.has(id))return pending.get(id);if(Date.now()-(failed.get(id)||0)<5000)return null;
  const p=(async()=>{const c=await init(),record=c.species[id];if(!record||record.image!==id+'.png'||!record.figureHeight||!record.actions?.idle?.length||!record.actions?.walking?.length)throw Error('Invalid Digimon record');const image=new Image();await new Promise((resolve,reject)=>{image.onload=resolve;image.onerror=()=>reject(Error('Digimon image unavailable'));image.src='assets/digimon/v2/'+record.image});const value={record,image};cache.set(id,value);failed.delete(id);return value})().catch(()=>{failed.set(id,Date.now());return null}).finally(()=>pending.delete(id));pending.set(id,p);return p}
 return {request,ready:id=>cache.get(clean(id))||null};
}
let shared;function sharedStore(){return shared||(shared=createStore())}
return {names,clean,delay,frameIndex,draw,createStore,sharedStore,createFollower,stepFollower,FOLLOW_GAP};
});
