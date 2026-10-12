/* Native RO pets: local atlases, exact source frames, selected species only. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.PGPetSprites=api})(typeof globalThis==='object'?globalThis:this,function(){
'use strict';
const sha=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),x=>x.toString(16).padStart(2,'0')).join('');
function validateMeta(meta,record){
 if(!meta||meta.version!==1||meta.width!==record.width||meta.height!==record.height||!Array.isArray(meta.poses)||meta.poses.length>4000||!meta.actions)throw Error('Invalid pet metadata');
 for(const pose of meta.poses){if(!Array.isArray(pose)||pose.length!==6||!pose.every(Number.isInteger))throw Error('Invalid pet pose');const [sx,sy,w,h,x,y]=pose;if(sx<0||sy<0||w<1||h<1||sx+w>meta.width||sy+h>meta.height||x<0||y<0||x+w>256||y+h>256)throw Error('Invalid pet bounds')}
 if(!['idle','walk','attack'].includes(meta.stance)||Object.keys(meta.actions).length!==(meta.direction==null?8:1))throw Error('Invalid pet actions');
 for(const d of meta.direction==null?[0,1,2,3,4,5,6,7]:[meta.direction]){if(!Number.isInteger(d)||d<0||d>7)throw Error('Invalid pet direction');const view=meta.actions[meta.stance+d];if(!view||!Number.isFinite(view.delay)||view.delay<1||view.delay>60000||!Array.isArray(view.frames)||!view.frames.length||view.frames.length>64||view.frames.some(i=>!Number.isInteger(i)||!meta.poses[i]))throw Error('Invalid pet action')}
 return meta;
}
class Store{
 constructor({base='assets/pets/v1/',fetcher=(...args)=>fetch(...args),decode=bytes=>createImageBitmap(new Blob([bytes],{type:'image/png'})),budget=16*1024*1024}={}){this.base=base;this.fetcher=fetcher;this.decode=decode;this.budget=budget;this.catalog=null;this.catalogError=null;this.initializing=null;this.cache=new Map();this.pending=new Map();this.failed=new Map();this.pinned=new Set();this.queue=Promise.resolve();this.disposed=false}
 async bytes(file,limit,hash){const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);try{const response=await this.fetcher(this.base+file,{signal:controller.signal});if(!response.ok)throw Error('Pet download failed');if(+(response.headers.get('content-length')||0)>limit)throw Error('Oversized pet asset');let data;
  if(response.body&&response.body.getReader){const reader=response.body.getReader(),parts=[];let total=0;try{for(;;){const {done,value}=await reader.read();if(done)break;total+=value.length;if(total>limit)throw Error('Oversized pet asset');parts.push(value)}}catch(error){await reader.cancel().catch(()=>{});throw error}data=new Uint8Array(total);let at=0;for(const part of parts){data.set(part,at);at+=part.length}}
  else{data=new Uint8Array(await response.arrayBuffer());if(data.length>limit)throw Error('Oversized pet asset')}
  if(hash&&(data.length!==limit||await sha(data)!==hash))throw Error('Pet checksum mismatch');return data;
 }finally{clearTimeout(timer)}}
 async init(){if(this.disposed)throw Error('Pet store disposed');if(this.catalogError)throw this.catalogError;if(this.catalog)return this.catalog;if(this.initializing)return this.initializing;this.initializing=(async()=>{const catalog=JSON.parse(new TextDecoder().decode(await this.bytes('catalog.json',128*1024)));if(catalog.version!==1||!catalog.assets||!catalog.species||JSON.stringify(catalog.canvas)!=='[256,256]'||JSON.stringify(catalog.anchor)!=='[128,192]')throw Error('Invalid pet catalog');
  for(const [id,r]of Object.entries(catalog.assets)){if(!/^\d+-(idle|walk|attack)(-[0-7])?$/.test(id)||!/^atlas-[a-f0-9]{20}\.png$/.test(r.image)||!/^poses-[a-f0-9]{20}\.json$/.test(r.meta)||!/^thumb-\d+\.png$/.test(r.thumbnail)||![r.imageSha256,r.metaSha256].every(s=>/^[a-f0-9]{64}$/.test(s))||![r.width,r.height,r.imageBytes,r.metaBytes,r.figureHeight].every(Number.isInteger)||r.width<1||r.height<1||r.width>4096||r.height>4096||r.width*r.height*4>4*1024*1024||r.imageBytes<1||r.imageBytes>1024*1024||r.metaBytes<1||r.metaBytes>256*1024||r.figureHeight<1||r.figureHeight>256)throw Error('Invalid pet record')}
  for(const [id,r]of Object.entries(catalog.species)){if(!/^\d+$/.test(id)||r.thumbnail!=='thumb-'+id+'.png'||!Array.isArray(r.attackDurations)||r.attackDurations.length!==8||r.attackDurations.some(x=>!Number.isFinite(x)||x<1||x>60000))throw Error('Invalid pet species');for(const stance of ['idle','walk','attack'])for(let d=0;d<8;d++){const asset=catalog.assets[id+'-'+stance]||catalog.assets[id+'-'+stance+'-'+d];if(!asset||asset.thumbnail!==r.thumbnail)throw Error('Missing pet action')}}
  if(this.disposed)throw Error('Pet store disposed');this.catalog=catalog;return catalog})().catch(error=>{this.catalogError=error;throw error}).finally(()=>{this.initializing=null});return this.initializing}
 get pixelBytes(){return [...this.cache.values()].reduce((sum,a)=>sum+a.bytes,0)}
 pin(ids){this.pinned=new Set(ids.map(String));this.trim()}
 trim(incoming=0){for(const [id,asset]of this.cache){if(this.pixelBytes+incoming<=this.budget&&this.cache.size<=9)break;if(!this.pinned.has(id)){asset.image.close();this.cache.delete(id)}}if(this.pixelBytes+incoming>this.budget)throw Error('Pet sprite memory limit reached')}
 ready(id){id=String(id);const asset=this.cache.get(id);if(asset){this.cache.delete(id);this.cache.set(id,asset)}return asset||null}
 request(id){id=String(id);if(this.disposed)return Promise.reject(Error('Pet store disposed'));if(this.cache.has(id))return Promise.resolve(this.cache.get(id));if(this.pending.has(id))return this.pending.get(id);if(this.failed.has(id))return Promise.reject(this.failed.get(id));
  const run=async()=>{const record=(await this.init()).assets[id];if(!record)throw Error('Unknown pet species');const metadata=validateMeta(JSON.parse(new TextDecoder().decode(await this.bytes(record.meta,record.metaBytes,record.metaSha256))),record);const bytes=await this.bytes(record.image,record.imageBytes,record.imageSha256);if(this.disposed)throw Error('Pet store disposed');this.trim(record.width*record.height*4);
   const image=await this.decode(bytes);if(this.disposed||image.width!==record.width||image.height!==record.height){image.close();throw Error('Invalid decoded pet image')}
   const asset={image,metadata,figureHeight:record.figureHeight,bytes:record.width*record.height*4};this.cache.set(id,asset);this.trim();return asset};
  const promise=this.queue.catch(()=>{}).then(run).catch(error=>{if(!this.disposed)this.failed.set(id,error);throw error}).finally(()=>this.pending.delete(id));this.pending.set(id,promise);this.queue=promise;return promise;
 }
 retry(id){if(this.catalogError){this.catalogError=null;this.failed.clear()}this.failed.delete(String(id));return this.request(id)}
 dispose(){this.disposed=true;for(const asset of this.cache.values())asset.image.close();this.cache.clear();this.pinned.clear();this.failed.clear()}
}
function frameIndex(view,ms,progress){return progress==null?Math.floor(Math.max(0,ms)/view.delay)%view.frames.length:Math.min(view.frames.length-1,Math.floor(Math.max(0,Math.min(1,progress))*view.frames.length))}
function draw(ctx,asset,stance,direction,ms=0,progress=null){const view=asset.metadata.actions[stance+direction];if(!view)return -1;const i=frameIndex(view,ms,progress),pose=asset.metadata.poses[view.frames[i]];ctx.clearRect(0,0,256,256);ctx.imageSmoothingEnabled=false;ctx.drawImage(asset.image,...pose.slice(0,4),...pose.slice(4),pose[2],pose[3]);return i}
return {Store,validateMeta,frameIndex,draw};
});
