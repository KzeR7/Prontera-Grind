'use strict';
const assert=require('assert'),fs=require('fs'),vm=require('vm'),root={};root.globalThis=root;
vm.runInNewContext(fs.readFileSync('tools/review-polish-fx.js','utf8'),root);const api=root.PGReviewPolishFx;
function canvas(){let stack=0;const g={globalAlpha:1,createRadialGradient(){return{addColorStop(){}}}};for(const n of ['save','restore','beginPath','moveTo','lineTo','stroke','ellipse','arc','fill','closePath'])g[n]=(...a)=>{for(const x of a)assert(Number.isFinite(x),n);if(n==='save')stack++;if(n==='restore')assert(--stack>=0)};return{g,balanced:()=>stack===0}}
for(const id of ['sc_fog','nj_spear','pa_chain','sa_dispel','mo_triple','mo_chain','ch_glacier','ch_palm','ch_crush','ch_fury','ch_zen','su_rising','su_knuckle','sc_fatal','sc_feint','ko_kunai','ko_moon','ko_petal','ko_soul'])for(const t of [0,.2,.4,.7,1,1.5,2,2.7]){let c=canvas();assert(api.has(id));assert(api.draw(c.g,id,t,(x,y,z)=>[300+x*35,300-y*35+z*5]));assert(c.balanced(),id)}
assert(api.replaces('pa_chain'));assert(!api.replaces('ko_petal'));assert(!api.has('unknown'));console.log('review polish FX: all requested accents and replacement phases OK');
