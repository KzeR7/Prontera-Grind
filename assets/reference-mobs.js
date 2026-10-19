/* Original atlas pixels, frame offsets and action delays; provenance in tools/native-fields/. */
(function(root,factory){
 if(typeof module==='object'&&module.exports)module.exports=factory();else root.PGReferenceMobs=factory();
})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
function frameAt(record,stance,direction,elapsed,progress){
 const a=record.actions[(stance==='attack'?16:stance==='walk'?8:0)+(direction&7)]||record.actions[direction&7]||record.actions[0];
 if(!a?.frames.length)return null;
 const i=stance==='attack'&&Number.isFinite(progress)?Math.min(a.frames.length-1,Math.floor(Math.max(0,progress)*a.frames.length)):Math.floor(Math.max(0,elapsed)/a.delayMs)%a.frames.length;
 return a.frames[i];
}
function createStore(options={}){
 const fetcher=options.fetcher||((...args)=>fetch(...args)),loadImage=options.loadImage||(url=>new Promise((resolve,reject)=>{const im=new Image();im.onload=()=>resolve(im);im.onerror=()=>reject(Error('Native monster unavailable'));im.src=url}));
 const assets=new Map(),pending=new Map(),failed=new Map();let catalog=null,initializing=null;
 async function init(){
  if(catalog)return catalog;if(initializing)return initializing;
  initializing=(async()=>{const r=await fetcher('assets/native-fields/v1/mobs.json');if(!r.ok)throw Error('Native monster catalog unavailable');const c=await r.json();if(c.schema!==1||!(c.pixelsPerUnit>0))throw Error('Invalid native monster catalog');catalog=c;return c})().finally(()=>{initializing=null});return initializing;
 }
 function request(id){
  id=String(id);
  if(assets.has(id)){const a=assets.get(id);assets.delete(id);assets.set(id,a);return Promise.resolve(a)}
  if(pending.has(id))return pending.get(id);
  if(failed.has(id)&&Date.now()-failed.get(id)<5000)return Promise.resolve(null);
  const p=(async()=>{const c=await init(),record=c.monsters[id];if(!record)return null;const image=await loadImage(record.texture),asset={record,image};assets.set(id,asset);failed.delete(id);while(assets.size>8)assets.delete(assets.keys().next().value);return asset})().catch(()=>{failed.set(id,Date.now());return null}).finally(()=>pending.delete(id));pending.set(id,p);return p;
 }
 function height(id){const r=catalog?.monsters[id];return r?r.idleHeight/catalog.pixelsPerUnit:0}
 function draw(THREE,view,m,direction,now){
  const id=String(m.spriteId);if(!catalog?.monsters[id])return false;
  let asset=assets.get(id);if(!asset){void request(id);return !!view.referenceMob}
  assets.delete(id);assets.set(id,asset);
  const {record,image}=asset,stance=m.atkAnim>0?'attack':m.run?'walk':'idle';
  if(!view.referenceMob){
   const [left,top,right,bottom]=record.bounds,cv=document.createElement('canvas');cv.width=right-left+4;cv.height=bottom-top+4;
   const tex=new THREE.CanvasTexture(cv);tex.magFilter=tex.minFilter=THREE.NearestFilter;tex.generateMipmaps=false;
   if(view.official&&view.spr.material.map)view.spr.material.map.dispose();
   view.referenceMob={cv,ctx:cv.getContext('2d'),tex,last:null,route:'',started:now};
   view.spr.material.map=tex;view.spr.material.needsUpdate=true;view.spr.center.set((2-left)/cv.width,1-(2-top)/cv.height);
   view.official=true;view.nativeMob=false;if(view.image)view.image.style.display='none';
  }
  const n=view.referenceMob,route=stance+(direction&7);if(route!==n.route){n.route=route;n.started=now}
  const index=frameAt(record,stance,direction,now-n.started,stance==='attack'?1-m.atkAnim:undefined),f=record.frames[index];
  if(!f)return false;
  if(n.last!==index){n.ctx.clearRect(0,0,n.cv.width,n.cv.height);n.ctx.imageSmoothingEnabled=false;n.ctx.drawImage(image,f.x,f.y,f.width,f.height,f.left-record.bounds[0]+2,f.top-record.bounds[1]+2,f.width,f.height);n.tex.needsUpdate=true;n.last=index}
  const px=3.05/record.idleHeight;view.spr.scale.set(n.cv.width*px,n.cv.height*px,1);view.spr.position.set(0,0,0);view.spr.material.rotation=0;view.spr.visible=true;
  return true;
 }
 return{init,request,height,draw,has:id=>!!catalog?.monsters[id],diagnostics:()=>({loaded:[...assets.keys()],failed:[...failed.keys()],available:catalog?Object.keys(catalog.monsters).length:0})};
}
return{frameAt,createStore};
});
