'use strict';
// Deterministic, dependency-free smoke coverage for the review-only canvas effects.
const assert=require('assert'),fs=require('fs'),vm=require('vm');
const root={Image:class {constructor(){this.complete=true;this.naturalWidth=103}}};root.globalThis=root;
vm.runInNewContext(fs.readFileSync('tools/ninja-throw-fx.js','utf8'),root);
const api=root.PGNinjaThrowFx;
assert.deepStrictEqual(Array.from(api.ids()),['nj_kunai','nj_huuma','ko_huuma']);
function canvas(){let stack=0,counts={};const g={globalAlpha:1,createLinearGradient(){return {addColorStop(){}}},createRadialGradient(x,y,r,X,Y,R){assert(r>=0&&R>0);return {addColorStop(){}}}};
 for(const method of ['save','restore','translate','rotate','beginPath','moveTo','lineTo','stroke','ellipse','arc','fill','closePath','fillRect','quadraticCurveTo'])g[method]=(...args)=>{counts[method]=(counts[method]||0)+1;for(const n of args)assert(Number.isFinite(n),method+' received '+n);if(method==='save')stack++;if(method==='restore')assert(--stack>=0)};
 g.drawImage=(image,...coords)=>{counts.drawImage=(counts.drawImage||0)+1;assert(image&&image.naturalWidth);for(const n of coords)assert(Number.isFinite(n))};return {g,counts,balanced:()=>stack===0};}
const project=(x,y,z)=>[300+x*35,300-y*35+z*5];
for(const id of api.ids())for(const t of [0,.1,.25,.45,.65,.8,1,1.25,1.6,2,2.35,2.5]){const {g,balanced}=canvas();assert(api.draw(g,id,t,project));assert(balanced(),id+' unbalanced at '+t)}
for(const id of api.ids()){const {g,counts}=canvas();api.draw(g,id,.48,project);assert(counts.drawImage>0,id+' must draw the supplied weapon sprite');assert(counts.stroke>3,id+' must draw trails and weapon details')}
for(const p of [0,.1,.35,.5,.75,1]){const a=[10,70],b=[190,20],v=api.straightPosition(a,b,p);assert(Math.abs((v.x-a[0])*(b[1]-a[1])-(v.y-a[1])*(b[0]-a[0]))<1e-8,'kunai must stay on a straight line');}
assert.strictEqual(api.draw(canvas().g,'unknown',.5,project),false);
console.log('ninja throw preview: three skills, animation phases, balanced canvas state OK');
