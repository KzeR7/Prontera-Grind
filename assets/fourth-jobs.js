/* Original native composites: heads, weapons, shadows and bodies share their authored placement. */
(function(root){
'use strict';
const CLASSES={'Rune Knight':4054,Warlock:4055,Ranger:4056,'Guillotine Cross':4059,'Arch Bishop':4057,Mechanic:4058};
class Store extends PGWardrobe.Store{
 constructor(options={}){super({base:'assets/fourth-jobs/v1/',...options})}
 async init(){
  if(this.catalog)return this.catalog;
  const c=JSON.parse(new TextDecoder().decode(await this.bytes('catalog.json',512*1024)));
  if(c.version!==1||c.canvas?.join()!=='320,280'||c.anchor?.join()!=='160,200')throw Error('Invalid native catalog');
  for(const job of Object.values(CLASSES))for(const sex of ['m','f']){
   const r=c.looks?.[job+'-'+sex];
   if(!r||r.image!==job+'-'+sex+'.png'||!Number.isInteger(r.width)||!Number.isInteger(r.height)||r.width<1||r.height<1||r.width*r.height*4>4*1024*1024||!Number.isInteger(r.bytes)||r.bytes<1||r.bytes>1024*1024||!/^[a-f0-9]{64}$/.test(r.sha256)||!Number.isInteger(r.figureHeight)||r.figureHeight<20||r.figureHeight>200)throw Error('Invalid native atlas');
   for(const stance of ['idle','walk','attack'])for(let d=0;d<8;d++){
    const a=r.actions?.[stance+d];if(!a||!Number.isFinite(a.delay)||a.delay<=0||!Array.isArray(a.frames)||!a.frames.length||a.frames.length>96)throw Error('Invalid native action');
    for(const f of a.frames)if(!Array.isArray(f)||f.length!==6||!f.every(Number.isInteger)||f[0]<0||f[1]<0||f[2]<1||f[3]<1||f[0]+f[2]>r.width||f[1]+f[3]>r.height||f[4]<0||f[5]<0||f[4]+f[2]>320||f[5]+f[3]>280)throw Error('Invalid native frame');
   }
  }
  return this.catalog=c;
 }
 select(client,value,cls){
  if(!Object.hasOwn(CLASSES,cls))return Promise.reject(Error('Class is unavailable'));
  const selection=PGWardrobe.normalize(value);if(!selection)return Promise.reject(Error('Invalid appearance'));
  const id=CLASSES[cls]+'-'+selection.sex,key=id+'|'+PGWardrobe.selectionKey(selection),old=this.clients.get(client);
  if(old?.key===key&&old.promise)return old.promise;
  if(old?.ready?.key===key)return Promise.resolve(old.ready);
  const request={key,ready:old?.ready};this.clients.set(client,request);
  const run=async()=>{try{
   if(this.clients.get(client)!==request)return null;
   const r=(await this.init()).looks[id];let base=this.cache.get(id);
   if(!base){
    this.trim([id],r.width*r.height*4);
    const bytes=await this.bytes(r.image,r.bytes,r.sha256),image=await this.decode(bytes);
    if(image.width!==r.width||image.height!==r.height){image.close();throw Error('Invalid native image')}
    const actions=Object.fromEntries(Object.entries(r.actions).filter(([name])=>/^(idle|walk|attack)[0-7]$/.test(name)).map(([name,a])=>[name,{...a,frames:a.frames.map(f=>[[...f,0,'body']])}]));
    base={image,figureHeight:r.figureHeight,bytes:r.width*r.height*4,metadata:{actions}};this.cache.set(id,base);
   }
   if(this.clients.get(client)!==request)return null;
   const hair={image:base.image,metadata:{actions:Object.fromEntries(Object.entries(base.metadata.actions).map(([name,a])=>[name,{...a,frames:a.frames.map(()=>[])}]))}};
   return request.ready={key,cls,selection,ids:[id],base,hair,pieces:[],fixedNative:true};
  }finally{if(this.clients.get(client)===request)request.promise=null;this.trim()}};
  request.promise=this.queue.catch(()=>{}).then(run);this.queue=request.promise;return request.promise;
 }
}
root.PGFourthJobs={CLASSES,Store};
})(globalThis);
