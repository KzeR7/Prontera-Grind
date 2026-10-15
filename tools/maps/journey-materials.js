/* Destination-only lossless environment delivery; no native art or game state. */
(function(root,factory){
 if(typeof module==='object'&&module.exports)module.exports=factory();
 else root.PGJourneyMaterials=factory();
})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
const PLAN=Object.freeze({astral:Object.freeze(['stone','space']),thor:Object.freeze(['stone','lava'])});
const STEM=Object.freeze({stone:'weathered-stone',space:'astral-void',lava:'molten-basalt'});
function validate(manifest){
 if(!manifest||manifest.schemaVersion!==1||manifest.encoding!=='lossless-webp'||!manifest.textures)throw Error('Environment delivery manifest unavailable');
 for(const key of Object.keys(STEM)){
  const r=manifest.textures[key];
  if(!r||!new RegExp('^'+STEM[key]+'-[a-f0-9]{12}\\.webp$').test(r.file)||!Number.isInteger(r.bytes)||r.bytes<=0||r.bytes>1500000||!Number.isInteger(r.width)||!Number.isInteger(r.height)||r.width<1||r.height<1||r.width>2048||r.height>2048)throw Error('Invalid environment delivery record: '+key);
 }
 for(const key of Object.keys(PLAN))if(JSON.stringify(manifest.destinations?.[key])!==JSON.stringify(PLAN[key]))throw Error('Invalid environment destination plan');
 return manifest;
}
function create(manifest,loadImage){
 // A missing/bad manifest degrades to the existing procedural scenery, not raw heavy PNG downloads.
 let valid=false;try{validate(manifest);valid=true;}catch(_){}
 const pending=new Map(),images={},requested=[];
 async function ensure(destination){
  const keys=PLAN[destination];if(!keys)throw new RangeError('Unknown material destination');
  await Promise.all(keys.map(key=>{
   if(!valid)return null;
   if(!pending.has(key)){
    const file=manifest.textures[key].file;requested.push(file);
    pending.set(key,Promise.resolve().then(()=>loadImage('/tools/maps/textures/'+file)).then(image=>{if(image)images[key]=image;return image;}).catch(()=>null));
   }
   return pending.get(key);
  }));
  return{images,missing:keys.filter(key=>!images[key]),bytes:valid?keys.reduce((n,key)=>n+manifest.textures[key].bytes,0):0};
 }
 return Object.freeze({ensure,diagnostics:()=>({manifestValid:valid,loaded:Object.keys(images).sort(),requested:requested.slice()})});
}
return Object.freeze({PLAN,validate,create});
});
