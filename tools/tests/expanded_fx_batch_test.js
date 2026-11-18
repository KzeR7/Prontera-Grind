'use strict';
const assert=require('assert'),fs=require('fs'),vm=require('vm'),root={};root.globalThis=root;
vm.runInNewContext(fs.readFileSync('tools/expanded-fx-batch.js','utf8'),root);
const api=root.PGExpandedBatchFx;assert(api.ids().length>=40);
function context(){let stack=0,calls=0;const g={globalAlpha:1,createRadialGradient(){return{addColorStop(){}}},createLinearGradient(){return{addColorStop(){}}}};
 for(const m of ['save','restore','beginPath','moveTo','lineTo','stroke','ellipse','arc','fill','closePath','fillRect','translate','rotate','quadraticCurveTo'])g[m]=(...a)=>{calls++;for(const n of a)assert(Number.isFinite(n),m);if(m==='save')stack++;if(m==='restore')assert(--stack>=0)};return {g,balanced:()=>stack===0,calls:()=>calls}}
for(const id of api.ids())for(const t of [0,.12,.4,.8,1.3,2,2.4]){let c=context();assert(api.draw(c.g,id,t,(x,y,z)=>[300+x*35,300-y*35+z*5]));assert(c.balanced());if(t===.8)assert(c.calls()>20,id)}
assert(!api.has('nj_kunai'));console.log('batch FX:',api.ids().length,'skills across animation phases OK');
