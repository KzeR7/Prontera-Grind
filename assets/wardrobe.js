/* Native Wardrobe v2. Static, bounded atlas loading; no provider/API calls. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.PGWardrobe=api})(typeof globalThis==='object'?globalThis:this,function(){
'use strict';
const HAIRS={m:[2,5,7,8,10,12,17,19,20,22,24,26,27,28,30,32,35,39,40,42],f:[2,4,5,12,13,14,15,17,18,19,21,24,27,30,34,35,37,39,41,42]};
const CLASSES={Swordman:1,Knight:7,'Lord Knight':4008,Thief:6,Assassin:12,'Assassin Cross':4013,Archer:3,Hunter:11,Sniper:4012,Acolyte:4,Priest:8,'High Priest':4009,Merchant:5,Blacksmith:10,Whitesmith:4011};
const defaults=sex=>({version:1,sex:sex==='f'?'f':'m',heads:{m:2,f:2},colors:{m:0,f:0},halo:false,glasses:false,wings:false});
function normalize(v){if(!v||typeof v!=='object'||v.version!==1)return null;const a=defaults(v.sex);for(const s of ['m','f']){const h=v.heads&&v.heads[s],c=v.colors&&v.colors[s];a.heads[s]=HAIRS[s].includes(h)?h:2;a.colors[s]=Number.isInteger(c)&&c>=0&&c<=8?c:0}for(const k of ['halo','glasses','wings'])a[k]=v[k]===true;return a}
function key(v){const a=normalize(v);return a?a.sex+'-'+a.heads[a.sex]+'-'+a.colors[a.sex]:''}
function frameIndex(view,ms,progress){const n=view.frames.length;return progress==null?Math.floor(Math.max(0,ms)/view.delay)%n:Math.min(n-1,Math.floor(Math.max(0,Math.min(1,progress))*n))}
function validateMeta(m,rec){
 if(!m||m.version!==2||m.width!==rec.width||m.height!==rec.height||!m.actions)throw Error('Invalid atlas metadata');
 const slots=['body','hair','weapon','halo','glasses','wings','shadow'];
 if(!Array.isArray(m.poses)||m.poses.length>20000)throw Error('Invalid poses');
 const prefixes=new Set(Object.keys(m.actions).map(k=>k.includes(':')?k.split(':')[0]+':':''));
 if(!prefixes.size||prefixes.size>Object.keys(CLASSES).length||[...prefixes].some(p=>p&&!Object.values(CLASSES).includes(Number(p.slice(0,-1)))))throw Error('Invalid class routes');
 for(const prefix of prefixes)for(const stance of ['idle','walk','attack'])for(let d=0;d<8;d++){
  const v=m.actions[prefix+stance+d];if(!v||!Number.isFinite(v.delay)||v.delay<=0||v.delay>60000||!Array.isArray(v.frames)||v.frames.length<1||v.frames.length>32)throw Error('Invalid action');
  v.frames=v.frames.map(i=>{if(!Number.isInteger(i)||!m.poses[i])throw Error('Invalid pose reference');return m.poses[i]});
  for(const f of v.frames){if(!Array.isArray(f)||f.length>12)throw Error('Invalid layers');for(const p of f){
   if(!Array.isArray(p)||p.length!==8||!p.slice(0,7).every(Number.isInteger)||!slots.includes(p[7])||p[0]<0||p[1]<0||p[2]<=0||p[3]<=0||p[0]+p[2]>m.width||p[1]+p[3]>m.height||p[4]<0||p[5]<0||p[4]+p[2]>320||p[5]+p[3]>280)throw Error('Invalid layer bounds');
  }}
 }delete m.poses;return m;
}
const digest=async b=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',b)),x=>x.toString(16).padStart(2,'0')).join('');
class Store{
 constructor({base='assets/wardrobe/v2/',fetcher=(...a)=>fetch(...a),decode=b=>createImageBitmap(new Blob([b],{type:'image/png'})),budget=16*1024*1024}={}){this.base=base;this.fetcher=fetcher;this.decode=decode;this.budget=budget;this.cache=new Map();this.clients=new Map();this.queue=Promise.resolve();this.serial=0;this.catalog=null}
 async bytes(path,limit,sha){const abort=new AbortController(),timer=setTimeout(()=>abort.abort(),15000);try{
  const r=await this.fetcher(this.base+path,{signal:abort.signal});if(!r.ok)throw Error('Sprite download failed ('+r.status+')');if(+(r.headers.get('content-length')||0)>limit)throw Error('Oversized sprite');
  let b;if(r.body&&r.body.getReader){const reader=r.body.getReader(),parts=[];let n=0;try{for(;;){const {done,value}=await reader.read();if(done)break;n+=value.length;if(n>limit)throw Error('Oversized sprite');parts.push(value)}}catch(e){await reader.cancel().catch(()=>{});throw e}b=new Uint8Array(n);let at=0;for(const p of parts){b.set(p,at);at+=p.length}}else{b=new Uint8Array(await r.arrayBuffer());if(b.length>limit)throw Error('Oversized sprite')}
  if(sha&&(b.length!==limit||await digest(b)!==sha))throw Error('Sprite checksum mismatch');return b;
 }finally{clearTimeout(timer)}}
 async init(){if(this.catalog)return this.catalog;const c=JSON.parse(new TextDecoder().decode(await this.bytes('catalog.json',512*1024)));if(c.version!==2||!c.assets)throw Error('Invalid wardrobe catalog');
  for(const r of Object.values(c.assets)){if(!/^poses-[a-f0-9]{20}\.json$/.test(r.meta)||!/^atlas-[a-f0-9]{20}\.png$/.test(r.image)||![r.metaSha256,r.imageSha256].every(s=>/^[a-f0-9]{64}$/.test(s))||![r.width,r.height,r.metaBytes,r.imageBytes].every(Number.isInteger)||r.width<1||r.width>4096||r.height<1||r.height>4096||r.width*r.height*4>4*1024*1024||r.metaBytes<1||r.metaBytes>256*1024||r.imageBytes<1||r.imageBytes>1024*1024)throw Error('Invalid atlas catalog')}
  this.catalog=c;return c;
 }
 pinned(extra=[]){return new Set([...extra,...[...this.clients.values()].flatMap(c=>c.ready?c.ready.ids:[])])}
 trim(extra=[],incoming=0){const pin=this.pinned(extra);let total=[...this.cache.values()].reduce((s,r)=>s+r.bytes,0);for(const [k,v] of this.cache){if(total+incoming<=this.budget&&this.cache.size<6)break;if(!pin.has(k)){v.image.close();this.cache.delete(k);total-=v.bytes}}if(total+incoming>this.budget)throw Error('Wardrobe memory limit reached')}
 async asset(id,extra){if(this.cache.has(id)){const r=this.cache.get(id);this.cache.delete(id);this.cache.set(id,r);return r}
  const rec=(await this.init()).assets[id];if(!rec)throw Error('Appearance is unavailable');this.trim(extra,rec.width*rec.height*4);
  const metadata=JSON.parse(new TextDecoder().decode(await this.bytes(rec.meta,rec.metaBytes,rec.metaSha256)));validateMeta(metadata,rec);
  const bytes=await this.bytes(rec.image,rec.imageBytes,rec.imageSha256);const dv=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);if(bytes.length<24||dv.getUint32(0)!==0x89504e47||dv.getUint32(16)!==rec.width||dv.getUint32(20)!==rec.height)throw Error('Invalid atlas image');
  const image=await this.decode(bytes);if(image.width!==rec.width||image.height!==rec.height){image.close();throw Error('Invalid decoded dimensions')}
  if(id.startsWith('base-')&&(!Number.isInteger(rec.figureHeight)||rec.figureHeight<20||rec.figureHeight>200)){image.close();throw Error('Invalid figure height')}
  const r={image,metadata,figureHeight:rec.figureHeight,bytes:rec.width*rec.height*4};this.cache.set(id,r);return r;
 }
 select(client,value,cls='Lord Knight'){if(!Object.hasOwn(CLASSES,cls))return Promise.reject(Error('Class is unavailable'));const job=CLASSES[cls];const selection=normalize(value);if(!selection)return Promise.reject(Error('Invalid appearance'));const k=job+'|'+key(selection),old=this.clients.get(client);
  if(old&&old.key===k&&old.promise)return old.promise.then(r=>r&&({...r,selection}));
  if(old&&old.ready&&old.ready.key===k){const ready={...old.ready,selection};this.clients.set(client,{key:k,seq:++this.serial,ready});return Promise.resolve(ready)}
  const request={key:k,seq:++this.serial,ready:old&&old.ready};this.clients.set(client,request);
  const run=async()=>{if(this.clients.get(client)!==request)return null;const ids=['base-'+job+'-'+selection.sex,'hair-'+key(selection),'costume-'+selection.sex];try{
   const base=await this.asset(ids[0],ids);if(this.clients.get(client)!==request)return null;
   const route=r=>({...r,metadata:{actions:Object.fromEntries(Object.entries(r.metadata.actions).filter(([name])=>name.startsWith(job+':')).map(([name,v])=>[name.split(':')[1],v]))}});
   const hair=route(await this.asset(ids[1],ids));if(this.clients.get(client)!==request)return null;
   const costume=route(await this.asset(ids[2],ids));if(this.clients.get(client)!==request)return null;
   for(const name of Object.keys(base.metadata.actions)){const a=base.metadata.actions[name],b=hair.metadata.actions[name],c=costume.metadata.actions[name];if(!b||!c||a.frames.length!==b.frames.length||a.delay!==b.delay||a.frames.length!==c.frames.length||a.delay!==c.delay)throw Error('Mismatched animation layers')}
   request.ready={key:k,cls,selection,ids,base,hair,costume};return request.ready;
  }finally{if(this.clients.get(client)===request)request.promise=null;this.trim()}};
  request.promise=this.queue.catch(()=>{}).then(run);this.queue=request.promise;return request.promise;
 }
 release(client){this.clients.delete(client);this.trim()}
 dispose(){this.clients.clear();for(const r of this.cache.values())r.image.close();this.cache.clear()}
 get pixelBytes(){return [...this.cache.values()].reduce((n,r)=>n+r.bytes,0)}
}
function draw(ctx,look,stance,direction,ms=0,progress=null){const name=stance+direction,b=look.base.metadata.actions[name],h=look.hair.metadata.actions[name];if(!b||!h)return -1;const i=frameIndex(b,ms,progress),a=look.selection;
 ctx.clearRect(0,0,320,280);ctx.imageSmoothingEnabled=false;
 const layers=[...b.frames[i].map(p=>[p,look.base.image]),...h.frames[i].map(p=>[p,look.hair.image]),...look.costume.metadata.actions[name].frames[i].map(p=>[p,look.costume.image])].sort((a,b)=>a[0][6]-b[0][6]);
 for(const [p,img] of layers){if(['halo','glasses','wings'].includes(p[7])&&!a[p[7]])continue;ctx.drawImage(img,p[0],p[1],p[2],p[3],p[4],p[5],p[2],p[3])}return i;
}
return {CLASSES,HAIRS,defaults,normalize,key,frameIndex,validateMeta,Store,draw};
});
