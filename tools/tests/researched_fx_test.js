'use strict';
const assert=require('assert'),fs=require('fs'),vm=require('vm'),root={};root.globalThis=root;
vm.runInNewContext(fs.readFileSync('tools/researched-fx.js','utf8'),root);
const api=root.PGResearchedFx;assert.strictEqual(api.ids().length,9);
function context(){let stack=0,calls=0;const g={globalAlpha:1,createRadialGradient(){return{addColorStop(){}}},createLinearGradient(){return{addColorStop(){}}}};
 for(const m of ['save','restore','fillRect','beginPath','moveTo','lineTo','stroke','ellipse','arc','fill','closePath','translate','rotate'])g[m]=(...args)=>{calls++;for(const n of args)assert(Number.isFinite(n),m);if(m==='save')stack++;if(m==='restore')assert(--stack>=0)};return {g,balanced:()=>stack===0,calls:()=>calls}}
for(const id of api.ids())for(const t of [0,.18,.4,.6,.8,1.3,2,2.6,3]){const c=context();assert(api.draw(c.g,id,t,(x,y,z)=>[300+x*35,300-y*35+z*5]));assert(c.balanced(),id);if(t===.8)assert(c.calls()>5,id)}
assert(!api.draw(context().g,'unknown',.8,()=>[0,0]));console.log('researched FX: nine staged skills OK');
