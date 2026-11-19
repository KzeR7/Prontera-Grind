'use strict';
const assert=require('assert'),fs=require('fs'),vm=require('vm'),root={};root.globalThis=root;
vm.runInNewContext(fs.readFileSync('tools/class-identity-fx.js','utf8'),root);
const api=root.PGClassIdentityFx;assert.strictEqual(api.ids().length,22);
function context(){let stack=0,calls=0;const g={globalAlpha:1,createRadialGradient(){return{addColorStop(){}}}};
 for(const m of ['save','restore','beginPath','moveTo','lineTo','stroke','ellipse','arc','fill','closePath','translate','rotate','scale','drawImage','rect','clip'])g[m]=(...args)=>{calls++;for(const n of args)if(typeof n==='number')assert(Number.isFinite(n),m);if(m==='save')stack++;if(m==='restore')assert(--stack>=0)};return {g,balanced:()=>stack===0,calls:()=>calls}}
for(const id of api.ids())for(const t of [0,.12,.3,.55,.8,1.3,2,2.6,3]){const c=context();assert(api.draw(c.g,id,t,(x,y,z)=>[300+x*35,300-y*35+z*5]));assert(c.balanced(),id);if(t===.8)assert(c.calls()>5,id)}
assert(!api.draw(context().g,'unknown',.8,()=>[0,0]));console.log('class identity FX:',api.ids().length,'skills across animation phases OK');
