/* Native scenery recovered from the public RagnaGO map packages. See tools/native-fields/README.md. */
(function(root,factory){
 if(typeof module==='object'&&module.exports)module.exports=factory();else root.PGNativeFields=factory();
})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
// The v195 landform is kept for side-by-side review: ?nativeFields=1&terrain=v1
const TERRAIN=(()=>{try{const q=typeof location!=='undefined'&&location.search?new URLSearchParams(location.search).get('terrain'):null;return q==='v1'?'v1':'v2'}catch(e){return 'v2'}})();
const NAMES=['prontera','izlude','geffen','morocc','payon','comodo','louyang','amatsu','gl_chyard','hu_fild05'];
const BASE='assets/native-fields/v1/';
const smooth=(a,b,x)=>{const t=Math.max(0,Math.min(1,(x-a)/(b-a)));return t*t*(3-2*t)};
const hash=(x,z,s)=>{let h=Math.imul(x|0,374761393)^Math.imul(z|0,668265263)^Math.imul(s|0,1442695041);h=Math.imul(h^(h>>>13),1274126177);return((h^(h>>>16))>>>0)/4294967295};
// Deterministic value noise. Every layer of the landform is a pure function of
// (map, x, z): no Math.random, no state, so a field is identical on every travel.
const noise2=(x,z,s)=>{const X=Math.floor(x),Z=Math.floor(z),fx=x-X,fz=z-Z,
 tx=fx*fx*(3-2*fx),tz=fz*fz*(3-2*fz),
 a=hash(X,Z,s)*2-1,b=hash(X+1,Z,s)*2-1,c=hash(X,Z+1,s)*2-1,d=hash(X+1,Z+1,s)*2-1;
 return a+(b-a)*tx+(c-a)*tz+(a-b-c+d)*tx*tz};
const clamp=(v,a,b)=>(v<a?a:v>b?b:v);
const mix=(a,b,t)=>a+(b-a)*t;
function fbm(x,z,s,oct=3,lac=2.03,gain=.5){let v=0,amp=1,f=1,n=0;for(let i=0;i<oct;i++){v+=amp*noise2(x*f,z*f,s+i*1013);n+=amp;amp*=gain;f*=lac}return v/n}
// Ridged multifractal: sharp crests with converging gullies. This is the difference
// between a hill and a dome - the smooth Gaussian mounds of v1 could not make one.
function ridged(x,z,s,oct=3,lac=2.07,gain=.5){let v=0,amp=1,f=1,n=0,w=1;
 for(let i=0;i<oct;i++){let k=1-Math.abs(noise2(x*f,z*f,s+i*733));k*=k;k*=w;w=Math.max(0,Math.min(1,k*1.7));v+=amp*k;n+=amp;amp*=gain;f*=lac}return v/n}
// Outdoor hunting fields. Each destination is a different KIND of place: its own
// landform amplitude, skyline, shelves, landmark and grain direction - not the same
// hill recipe with new numbers. `amp` is the relief dial, `frame` the perimeter rise
// (so the horizon is land, not the edge of the plane), `rotate` the noise rotation.
const DESIGNS=[
 {name:'Prontera meadow',amp:2.17,palette:{tint:'#f2e2b0',tintA:.16,sat:1.06,lum:1.04,detail:'grass'},seed:1291,rotate:0,pathInfluence:1,frame:2.2,trail:{bend:9.5,phase:0.4,width:3.4},tilt:[0.3,0.75],landAmp:1.5,landScale:40,ridgeAmp:1.5,ridgeScale:46,bench:{at:2.4,step:1.1,sharp:0.5,amount:0.55,warp:0.55},carve:{freq:0.05,depth:0.32},micro:0.1,water:null,signature:{kind:'terrace',level:2.4,x:24,z:-18,r:15,drop:1}},
 {name:'Izlude coastal grassland',amp:0.98,palette:{tint:'#9fd7c8',tintA:.26,sat:.88,lum:1.10,detail:'grass'},seed:2262,rotate:0.9,pathInfluence:0.9,frame:1.7,trail:{bend:8.5,phase:1.6,width:3},tilt:[-0.55,-0.35],landAmp:1.1,landScale:44,ridgeAmp:1,ridgeScale:52,bench:{at:1.8,step:0.9,sharp:0.45,amount:0.5,warp:0.5},carve:{freq:0.045,depth:0.26},micro:0.09,water:{x:-27,z:-14,rx:9,rz:15,level:0.3},signature:{kind:'bluff',x:-21,z:16,r:17,top:3.2,face:1}},
 {name:'Geffen wooded ridge',amp:0.56,palette:{tint:'#2f7f86',tintA:.32,sat:1.14,lum:1.12,detail:'leaves'},seed:3370,rotate:1.9,pathInfluence:0.85,frame:2.4,trail:{bend:7.5,phase:2.4,width:2.8},tilt:[0.5,-0.2],landAmp:1.3,landScale:34,ridgeAmp:2.9,ridgeScale:30,ridgeBias:0.16,bench:{at:3,step:1.15,sharp:0.6,amount:0.6,warp:0.8},carve:{freq:0.06,depth:0.5},micro:0.12,water:null,signature:{kind:'spur',x:19,z:8,r:14,top:3.2,face:1}},
 {name:'Morocc dunes',amp:3.25,palette:{tint:'#f6dca4',tintA:.30,sat:.74,lum:1.14,detail:'sand'},seed:4458,rotate:2.6,pathInfluence:0,frame:1.8,tilt:[0.7,0.45],landAmp:0.45,landScale:50,ridgeAmp:1.9,ridgeScale:26,ridgeBias:0.2,bench:null,dune:true,duneFreq:0.115,carve:{freq:0.035,depth:0.16},micro:0.07,water:null,signature:{kind:'dunefield',major:0.11,minor:0.035,amp:1.1}},
 {name:'Payon forest hills',amp:0.47,palette:{tint:'#2f5c46',tintA:.26,sat:1.10,lum:.86,detail:'leaves'},seed:7206,rotate:0.35,pathInfluence:0.95,frame:2.6,trail:{bend:9,phase:0.9,width:3},tilt:[-0.25,0.6],landAmp:1.4,landScale:32,ridgeAmp:3.1,ridgeScale:26,ridgeBias:0.2,bench:{at:3.2,step:1.25,sharp:0.65,amount:0.6,warp:0.85},carve:{freq:0.062,depth:0.6},micro:0.13,water:{x:28,z:6,rx:7,rz:11,level:0.45},signature:{kind:'gorge',x:-20,z:4,r:18,depth:1.5}},
 {name:'Comodo jungle hollow',amp:0.67,palette:{tint:'#8a9a30',tintA:.26,sat:1.22,lum:1.04,detail:'leaves'},seed:10903,rotate:2.1,pathInfluence:0.7,frame:2.8,trail:{bend:7,phase:3.5,width:2.6},tilt:[0.1,0.15],landAmp:1.2,landScale:30,ridgeAmp:2,ridgeScale:28,bench:{at:2.6,step:1.3,sharp:0.8,amount:0.55,warp:0.9},carve:{freq:0.05,depth:0.4},micro:0.12,water:{x:25,z:0,rx:8,rz:12,level:0.25},signature:{kind:'basin',x:24,z:0,r:22,depth:1.9}},
 {name:'Louyang mountain field',amp:0.61,palette:{tint:'#b9812f',tintA:.32,sat:1.06,lum:.96,detail:'rock'},seed:8302,rotate:1.3,pathInfluence:0.6,frame:3,trail:{bend:8.5,phase:2,width:2.6},tilt:[-0.6,-0.5],landAmp:1.6,landScale:30,ridgeAmp:3.8,ridgeScale:24,ridgeBias:0.24,bench:{at:3.6,step:1.25,sharp:0.62,amount:0.66,warp:1.1},carve:{freq:0.065,depth:0.75},micro:0.15,water:null,signature:{kind:'terrace',level:3.6,x:-20,z:-20,r:16,drop:1.4}},
 {name:'Amatsu wild meadow',amp:1.34,palette:{tint:'#c2d894',tintA:.30,sat:.82,lum:1.02,detail:'grass'},seed:8868,rotate:3.6,pathInfluence:0.85,frame:1.9,trail:{bend:8,phase:4.2,width:3},tilt:[0.4,-0.6],landAmp:1.5,landScale:36,ridgeAmp:1.8,ridgeScale:42,bench:{at:2.6,step:1,sharp:0.45,amount:0.5,warp:0.6},carve:{freq:0.045,depth:0.3},micro:0.1,water:{x:26,z:-18,rx:8,rz:12,level:0.28},signature:{kind:'plateau',x:-7,z:-20,r:16,top:2.8,face:0.9}},
 {name:'Niflheim dead hollow',amp:1.63,palette:{tint:'#6e6472',tintA:.34,sat:.42,lum:.74,detail:'ash'},seed:10637,rotate:4.4,pathInfluence:0.5,frame:2,trail:{bend:7,phase:2.8,width:2.8},tilt:[-0.15,-0.25],landAmp:1.3,landScale:34,ridgeAmp:1.6,ridgeScale:38,bench:{at:2.2,step:1.2,sharp:0.75,amount:0.6,warp:0.75},carve:{freq:0.055,depth:0.45},micro:0.1,water:null,signature:{kind:'basin',x:-8,z:-14,r:24,depth:1.6}},
 {name:'Abyss rocky basin',amp:0.78,palette:{tint:'#37538a',tintA:.36,sat:.62,lum:.80,detail:'rock'},seed:11867,rotate:5.1,pathInfluence:0.35,frame:2.8,trail:{bend:8,phase:1.2,width:3.2},tilt:[0.5,0.35],landAmp:1.5,landScale:28,ridgeAmp:3.2,ridgeScale:24,ridgeBias:0.18,bench:{at:3,step:1.35,sharp:0.7,amount:0.72,warp:1.2},carve:{freq:0.07,depth:0.65},micro:0.17,water:{x:-26,z:2,rx:9,rz:13,level:0.2},signature:{kind:'shelf',x:10,z:14,r:20,drop:1.7}}
];
// The v195 landform, kept so `?nativeFields=v1` can show it side by side (see
// docs/proposals/map-terrain-upgrade-2026-10-25.md). Not selected by default.
const LEGACY=[
 {path:3.8,bend:5,phase:.3,hills:[[-9,-16,5.4,15,17],[12,10,3.8,13,15],[23,-20,4.6,12,18]],valley:[2,-2,-1.5,10,20]},
 {path:3.2,bend:8,phase:1.6,hills:[[11,-18,4.8,16,14],[-9,11,2.8,12,18],[27,5,3.8,10,23]],water:{x:-24,z:-12,rx:9,rz:17,level:.35}},
 {path:3,bend:7,phase:2.4,hills:[[-11,-7,6.5,12,24],[15,-24,4.6,13,16],[17,15,3,17,10]],valley:[5,-4,-1.4,9,25]},
 {path:0,bend:0,phase:0,hills:[[-9,-17,6.2,19,10],[13,4,4.4,16,11],[-20,24,5.6,21,10]],valley:[0,-4,-1.3,28,7]},
 {path:2.8,bend:9,phase:.9,hills:[[-12,-20,6.8,13,16],[13,3,5.4,12,19],[-14,23,4.8,16,13]],valley:[-1,-6,-1.6,9,25]},
 {path:2.8,bend:7,phase:3.5,hills:[[-10,1,5.2,13,21],[14,-21,6,15,14],[21,18,4.4,15,16]],water:{x:25,z:2,rx:10,rz:16,level:.25}},
 {path:2.6,bend:9,phase:2,hills:[[-11,-24,8,15,15],[14,1,6.4,12,20],[-17,20,5,14,17]],valley:[0,-4,-1.7,8,26]},
 {path:3,bend:6,phase:4.2,hills:[[9,-15,5.2,16,19],[-14,13,3.8,14,18],[-25,-24,4.6,16,15]],water:{x:25,z:-16,rx:8,rz:14,level:.3}},
 {path:3.2,bend:5,phase:2.8,hills:[[-14,-14,5.8,13,19],[13,9,5.4,12,18],[21,-28,6,16,12]],valley:[0,-9,-1.8,9,24]},
 {path:3.5,bend:8,phase:1.2,hills:[[-11,-23,7,16,13],[13,8,5.8,13,17],[26,-17,6.4,13,20]],water:{x:-25,z:1,rx:10,rz:15,level:.2}}
];
// The fighting lane (hero + mobs + loot) is part of the landform: the landform is
// faded back toward a readable clearing whose outline is pushed around by noise, so
// it never reads as a flat box dropped into the hills.
const LANE={x0:-14,x1:14,z0:-29,z1:14};
const laneCfg={mix:.55};
function laneWeight(x,z){
 // A long, ragged, asymmetric clearing: the boundary wanders several units on both
 // axes and the easing runs for twelve units, because a short fade next to a straight
 // edge is exactly what read as "flat box dropped into the hills".
 const jx=6.5*fbm(z*.043,11.3,707,3)+2.6*fbm(z*.17,3.1,911,2),jz=6.0*fbm(x*.043,5.7,613,3)+2.2*fbm(x*.21,7.3,317,2);
 const dx=Math.max(LANE.x0+jx-x,0,x-(LANE.x1-jx)),dz=Math.max(LANE.z0+jz-z,0,z-(LANE.z1+jz));
 return 1-smooth(.5,12.5,Math.hypot(dx,dz*.72));
}
function pondRadius(w,x,z){const angle=Math.atan2((z-w.z)/w.rz,(x-w.x)/w.rx);return Math.hypot((x-w.x)/w.rx,(z-w.z)/w.rz)/(1+.09*Math.sin(angle*3)+.05*Math.cos(angle*5))}
// Large-scale mask: some parts of a field are calm and others carry the relief.
// Deliberately unclamped - a clamp leaves a C0 crease where it engages, which renders
// as a straight line of slope change across the whole field.
const reliefMask=(x,z,s)=>.30+.88*(.5+.5*fbm(x*.017,z*.017,s+211,2));
const cliffZone=(x,z,s)=>smooth(-.10,.35,fbm(x*.026,z*.026,s+307,2));
const mound=(x,z,h)=>h[2]*Math.exp(-(((x-h[0])/h[3])**2+((z-h[1])/h[4])**2));
function legacyHeight(map,x,z){
 const d=LEGACY[map];let y=1.1;
 for(const h of d.hills)y+=mound(x,z,h);
 if(d.valley)y+=mound(x,z,d.valley);
 y+=.16*Math.sin(x*.17+map)*Math.cos(z*.13-map*.4);
 if(d.water){const r=pondRadius(d.water,x,z),k=1-smooth(.55,1.3,r);y=y*(1-k)+(d.water.level-1.05)*k}
 return y;
}
// Bench = shelf / escarpment / shelf instead of one smooth dome. Applied only where
// cliffZone says the ground is rocky. The warp moves the THRESHOLD, never the value:
// shifting inside the step function would leave a height discontinuity.
function bench(h,b,warp,amount){
 if(!b||amount<=0)return h;
 const q=b.step,at=b.at+warp*q;
 if(h<=at)return h;
 const over=h-at,t=over/q,f=t-Math.floor(t),sh=b.sharp;
 const stepped=(Math.floor(t)+smooth(.5-sh*.5,.5+sh*.5,f))*q;
 return at+mix(over,stepped,amount);
}
// One landmark per destination: the thing the field is remembered for.
function signature(s,x,z){
 if(!s)return 0;
 switch(s.kind){
  case 'terrace':{const d=Math.hypot(x-s.x,z-s.z)/s.r;return -s.drop*(1-smooth(.55,1,d))-s.drop*.35*smooth(.85,1,d)}
  case 'bluff':{const d=Math.hypot((x-s.x)*1.15,(z-s.z)*.8)/s.r;return s.top*(1-smooth(.3,1.15,d))-s.face*smooth(.85,1.25,d)}
  case 'spur':{const d=Math.hypot(x-s.x,(z-s.z)*.55)/s.r;return s.top*(1-smooth(.25,1.25,d))-s.face*.45*smooth(.8,1.2,d)}
  case 'dunefield':{const m=Math.sin(x*s.major+z*s.minor*3.1)*.6+Math.sin(z*s.minor*6.2-x*.03)*.4;return s.amp*(.5+.5*m)}
  case 'gorge':{const c=Math.sin(z*.11)*6+Math.sin(z*.03)*9;return -s.depth*(1-smooth(s.r*.18,s.r*.62,Math.abs(x-c)))}
  case 'basin':{const d=Math.hypot((x-s.x)/s.r,(z-s.z)/(s.r*1.2));return -s.depth*(1-smooth(.45,1.15,d))}
  case 'plateau':{const d=Math.hypot(x-s.x,z-s.z)/s.r;return s.top*(1-smooth(.25,.95,d))-s.face*smooth(.9,1.35,d)}
  case 'shelf':{const d=Math.hypot((x-s.x)*.9,z-s.z)/s.r,t=smooth(.45,.75,d)+smooth(.85,1.05,d);return -s.drop*.5*t}
  default:return 0;
 }
}
// A single winding trail, not a painted road down the middle of the lane. Width and
// wander come from the recipe.
function trailCenter(map,z){
 const d=designOf(map),t=d.trail||{bend:0,phase:0};
 return t.bend*Math.sin(z*.052+t.phase)+.4*t.bend*Math.sin(z*.13+t.phase*.7);
}
function terrainHeight(map,x,z){
 const d=designOf(map),s=d.seed,amp=d.amp||1;
 // One noise rotation per destination: two fields can share an amplitude and still
 // never share a silhouette or a crest direction.
 const ca=Math.cos(d.rotate||0),sa=Math.sin(d.rotate||0),rx=x*ca-z*sa,rz=x*sa+z*ca;
 // 1. domain warp - nothing in nature sits on a rectangular lattice
 const wx=rx+13*fbm(rx*.019,rz*.019,s+17,3),wz=rz+13*fbm(rx*.019+5.2,rz*.019-3.7,s+29,3);
 // 2. broad landform + one clear uphill direction
 let base=1.05+d.landAmp*amp*fbm(wx/d.landScale,wz/d.landScale,s+3,3)+d.tilt[0]*(rx/45)+d.tilt[1]*(rz/45);
 // 3. skyline: ridged crests, biased to one side so no field is mirror-symmetric.
 //    Three octaves only - a finer crest network reads as crumpled paper from this
 //    camera height, not as terrain.
 const mask=reliefMask(rx,rz,s),bias=Math.max(.2,1+(d.ridgeBias||0)*(rx/45));
 let relief=d.ridgeAmp*ridged(wx/d.ridgeScale,wz/d.ridgeScale,s+61,3)*bias*mask*amp;
 if(d.dune){
  // Long transverse crests: the phase wanders slowly, the crest direction does not,
  // which is what gives a dune sea its grain.
  const phase=rz*d.duneFreq+1.9*fbm(rx*.028,rz*.012,s+5,2),dune=.5+.5*Math.sin(phase);
  relief=mix(relief,d.ridgeAmp*(.35+.65*dune*dune)*mask,.92);
 }
 // 4. drainage: broad shallow swales where the crests fall away, never gullies everywhere
 const channel=1-Math.abs(fbm(wx*d.carve.freq,wz*d.carve.freq,s+97,2)),c2=channel*channel;
 relief-=d.carve.depth*c2*c2;
 let full=base+relief;
 // 5. shelves, but only in rocky country
 if(d.bench)full=bench(full,d.bench,d.bench.warp*fbm(wx*.05,wz*.05,s+401,2),d.bench.amount*cliffZone(rx,rz,s));
 // 6. the field's own landmark
 full+=signature(d.signature,x,z);
 // 6b. perimeter frame: the field sits in a vale, so the horizon is land. Side and far
 //     edges only - the near edge stays open or it blocks the camera.
 const edge=Math.min(45-Math.abs(x),z+45);
 full+=d.frame*(1-smooth(1,13,edge))*(.65+.7*fbm(rx*.05,rz*.05,s+503,3));
 // 7. flatten toward a readable lane (ragged outline), then add close-up relief back
 const lane=laneWeight(x,z),flat=base*.55+.55;
 let h=mix(full,flat,lane*laneCfg.mix);
 h+=d.micro*fbm(x*.5,z*.5,s+131,2)*(.45+.55*lane);
 // 8. pond: dig only as deep as the basin floor needs, fading over a wide beach.
 //    Mixing toward a constant level over a short radius is what makes a wall.
 const w=d.water;
 if(w){
  const r=pondRadius(w,x,z),floor=w.level-1.35;
  h-=Math.max(0,h-floor)*(1-smooth(.5,1.8,r));
  h=mix(h,w.level-1.5,(1-smooth(0,.55,r))*.5);
 }
 return h;
}
// Kept for callers that used the legacy helper.
const pathCenter=(map,z)=>(designOf(map).trail?trailCenter(map,z):0);
// ---------------------------------------------------------------------------
// Stage groups (v231, owner): "one stage 1-3 a map, 4-6 another type, 7-9 another
// map & boss map. i want each 3 stage to have different type of map & a boss map."
//
// The ten destinations used to have exactly one look each, so every stage inside a
// destination was the same field. Each destination now carries three tier recipes on top
// of its stages 1-3 base:
//
//   1-3   base        the destination as originally drawn
//   4-6   outskirts   calmer and more open, wider trail: the approach to the settlement
//   7-9   approach   deeper, more relief, bigger water, tighter trail
//   10-15 sanctum    a flat fighting floor with a heavy perimeter, for the MVP wave
//
// A tier changes the seed (so the landform is genuinely a different field, not a recolour),
// the relief, the trail, the water and the colour grade. Region identity is preserved: the
// destination's own crops and its hue family stay.
// A reseed alone was not enough: Prontera's outskirts and sanctum came out only 0.22 units
// apart on average, which is a different hill, not a different field. Each group therefore
// also changes the *kind* of ground - how broad the landform is, how sharp the skyline is,
// how wide the way through is, and how hard the perimeter closes in.
const TIER_GROUPS=[
 {key:'base',      label:'',          seed:0,    ampX:1,    trailX:1,    frameX:1,   waterX:1,
  landX:1,    ridgeX:1,    detail:null},
 {key:'outskirts', label:'outskirts', seed:911,  ampX:.70,  trailX:1.20, frameX:.85, waterX:1,
  landX:1.45, ridgeX:.55,  detail:null},     // broad, open, low skyline: the way in
 {key:'approach',  label:'approach',  seed:1777, ampX:1.05, trailX:.85,  frameX:1.20,waterX:1.25,
  landX:.72,  ridgeX:1.55, detail:'leaves'}, // tighter, higher, wooded: deep country
 {key:'sanctum',   label:'sanctum',   seed:2611, ampX:.50,  trailX:.70,  frameX:1.60,waterX:0,
  landX:1.70, ridgeX:.40,  detail:'rock'},   // wide flat floor ringed by walls: the boss arena
];
function stageGroup(stage){const s=stage|0;return s<=3?0:s<=6?1:s<=9?2:3}
let ACTIVE_STAGE=1;
const DESIGN_CACHE=new Map();
function tierDesign(map,g){
 const base=DESIGNS[map]||DESIGNS[0],T=TIER_GROUPS[g];
 const key=map+':'+g;
 let d=DESIGN_CACHE.get(key);
 if(d)return d;
 d=Object.assign({},base);
 d.seed=base.seed+T.seed;
 d.amp=(base.amp||1)*T.ampX;
 d.frame=(base.frame||2)*T.frameX;
 if(base.landScale)d.landScale=base.landScale*T.landX;
 if(base.ridgeScale)d.ridgeScale=base.ridgeScale*T.ridgeX;
 if(base.ridgeAmp)d.ridgeAmp=base.ridgeAmp*T.ridgeX;
 d.tierKey=T.key;d.tierLabel=T.label;
 d.palette=Object.assign({},base.palette);
 if(base.trail)d.trail=Object.assign({},base.trail,{width:(base.trail.width||3)*T.trailX,bend:(base.trail.bend||8)*T.trailX});
 if(base.pathInfluence!==undefined)d.pathInfluence=T.key==='sanctum'?base.pathInfluence*.6:base.pathInfluence;
 // The sanctum is a fighting floor: no pond to fall into, and a much stronger perimeter so
 // the arena reads as enclosed.
 if(T.key==='sanctum')d.water=null;
 else if(base.water&&T.waterX!==1)d.water=Object.assign({},base.water,{rx:base.water.rx*T.waterX,rz:base.water.rz*T.waterX});
 if(base.signature&&T.key==='sanctum')d.signature=Object.assign({},base.signature);
 // Ground detail follows the group's character, but only between the two "walkable ground"
 // kinds - a desert must not sprout leaves because it is stage 7.
 if(T.detail&&base.palette&&['grass','leaves'].includes(base.palette.detail))d.palette=Object.assign({},base.palette,{detail:T.detail});
 // Each tier leans the destination's own hue slightly, so the four fields of one region are
 // recognisably relatives rather than four unrelated maps.
 d.palette=Object.assign({},d.palette,tierGrade(base.palette,T.key));
 DESIGN_CACHE.set(key,d);return d;
}
// A destination's four fields must be obviously different at a glance, and inside the flat
// hunting lane colour is the main thing that can carry that. So each group moves the grade
// hard in one direction rather than nudging it: airy midday, deep dusk, and a grim arena.
function tierTint(hex,target,amount){
 const a=parseInt(String(hex).replace('#',''),16),b=parseInt(String(target).replace('#',''),16);
 if(!Number.isFinite(a)||!Number.isFinite(b))return hex;
 const ch=(v,sh)=>Math.max(0,Math.min(255,Math.round(((v>>sh)&255)*(1-amount)+(((b>>sh)&255))*amount)));
 return '#'+((ch(a,16)<<16)|(ch(a,8)<<8)|ch(a,0)).toString(16).padStart(6,'0');
}
function tierGrade(p,key){
 if(!p)return {};
 if(key==='outskirts')return {tint:tierTint(p.tint||'#ffffff','#fff4d8',.28),
   tintA:Math.min(.5,(p.tintA||.2)*.72),sat:(p.sat||1)*.92,lum:(p.lum||1)*1.15};
 if(key==='approach')return {tint:tierTint(p.tint||'#ffffff','#16301e',.22),
   tintA:Math.min(.5,(p.tintA||.2)*1.10),sat:(p.sat||1)*1.18,lum:(p.lum||1)*.82};
 if(key==='sanctum')return {tint:tierTint(p.tint||'#ffffff','#2a3444',.34),
   tintA:Math.min(.55,(p.tintA||.2)*1.30),sat:(p.sat||1)*.72,lum:(p.lum||1)*.84};
 return {};
}
// Every reader of a design goes through here, so a stage change really does change the field.
function designOf(map){const g=stageGroup(ACTIVE_STAGE);return g===0?((DESIGNS[map]||DESIGNS[0])):tierDesign(map,g)}
function setStage(stage){const s=stage|0||1;if(stageGroup(s)!==stageGroup(ACTIVE_STAGE))ACTIVE_STAGE=s;else ACTIVE_STAGE=s}
function designLabel(map,stage){const g=stageGroup(stage),base=(DESIGNS[map]||DESIGNS[0]);return g===0?(base.label||base.name):((base.label||base.name)+' · '+TIER_GROUPS[g].label)}

function activeHeight(map,x,z){return TERRAIN==='v1'?legacyHeight(map,x,z):terrainHeight(map,x,z)}
const GRID=72,STEP=90/GRID;
// Interpolate the exact rendered triangles so feet meet the sloping mesh, diagonals included.
function heightAt(map,x,z,stage){
 // Optional stage so callers outside the module (the actor floor height in index.html) ask about
 // the field that is actually built, not whichever stage was queried last.
 if(stage!==undefined&&stageGroup(stage)!==stageGroup(ACTIVE_STAGE)){
  const prev=ACTIVE_STAGE;ACTIVE_STAGE=stage|0||1;
  try{return heightAt(map,x,z)}finally{ACTIVE_STAGE=prev}
 }

 const gx=Math.max(0,Math.min(GRID-1e-8,(x+45)/STEP)),gz=Math.max(0,Math.min(GRID-1e-8,(z+45)/STEP)),ix=Math.floor(gx),iz=Math.floor(gz),u=gx-ix,v=gz-iz,xx=ix*STEP-45,zz=iz*STEP-45;
 const a=activeHeight(map,xx,zz),b=activeHeight(map,xx+STEP,zz),c=activeHeight(map,xx,zz+STEP),e=activeHeight(map,xx+STEP,zz+STEP);
 return u+v<=1?a+(b-a)*u+(c-a)*v:e+(c-e)*(1-u)+(b-e)*(1-v);
}
// Slope in degrees from the rendered surface: drives the floor materials and the
// prop rules below.
function slopeAt(map,x,z,e=.6){
 const dx=(heightAt(map,x+e,z)-heightAt(map,x-e,z))/(2*e),dz=(heightAt(map,x,z+e)-heightAt(map,x,z-e))/(2*e);
 return Math.atan(Math.hypot(dx,dz))*180/Math.PI;
}
// Floor materials per vertex: rock on steep faces, dirt in hollows/along the trail,
// sand at the pond shore, grass everywhere else. Sums to 1.
function surfaceWeights(map,x,z,slope){
 const d=designOf(map);slope=slope===undefined?slopeAt(map,x,z):slope;const rock=smooth(17,32,slope);
 const patch=smooth(.5,.9,fbm(x*.06,z*.06,d.seed+811,3)*.5+.5)*.7;
 const trail=d.pathInfluence>0&&d.trail?(1-smooth(d.trail.width*.55,d.trail.width+1.4,Math.abs(x-trailCenter(map,z))))*d.pathInfluence*.85:0;
 const beach=d.water?1-smooth(1,1.45,pondRadius(d.water,x,z)):0;
 const dirt=Math.min(1,patch+trail),grass=Math.max(0,1-rock-dirt-beach),total=grass+dirt+rock+beach||1;
 return{grass:grass/total,dirt:dirt/total,rock:rock/total,beach:beach/total};
}
function placements(map,stage,plan,record){
 setStage(stage);   // placements is asked for a stage, so it must not trust the last build's
 const result=[],d=designOf(map);
 function add(role,x,z,width,angle){
  const model=record.models[role];if(!model)return;
  const maxHeight=role==='tree'||role==='tree2'?8:role==='rock'?4:role==='stump'?2.5:1.8,scale=Math.min(width/Math.max(model.size[0],model.size[2]),maxHeight/Math.max(.01,model.size[1])),co=Math.abs(Math.cos(angle)),si=Math.abs(Math.sin(angle)),rx=(model.size[0]*co+model.size[2]*si)*scale/2,rz=(model.size[0]*si+model.size[2]*co)*scale/2;
  // Large silhouettes frame the hunting field; small plants can reach its margins.
  const margin=['tree','tree2','rock','stump'].includes(role)?14.8:13.4;
  if(Math.abs(x)-rx<margin&&z+rz>-29&&z-rz<14)return;
  if(Math.abs(x)+rx>43||Math.abs(z)+rz>43)return;
  if(d.water&&pondRadius(d.water,x,z)<1.35+Math.max(rx/d.water.rx,rz/d.water.rz))return;
  // Props respect the landform: nothing grows on a cliff face, rock may sit on one.
  if(slopeAt(map,x,z)>(['rock','stump','detail'].includes(role)?42:32))return;
  if(result.some(p=>Math.abs(p.x-x)<p.rx+rx+.4&&Math.abs(p.z-z)<p.rz+rz+.4))return;
  // Embed the foot slightly into the lowest corner of a slope; no hovering roots.
  const y=Math.min(heightAt(map,x,z),heightAt(map,x-rx*.45,z-rz*.45),heightAt(map,x+rx*.45,z+rz*.45))-.08;
  result.push({role,x,z,rx,rz,scale,angle,y});
 }
 const roles=Object.keys(record.models).filter(r=>['tree','tree2','rock','shrub','stump','detail'].includes(r));
 // v231: each stage group dresses the ring differently, so "4-6 / 7-9 / 10-15" are different
 // kinds of place and not the same field with the hills moved. The outskirts are an open,
 // thinly wooded way in; the approach is deep country, thick with trees; the sanctum is a
 // cleared floor braced with rock.
 const g=stageGroup(stage),PROP_RECIPE=[
  {count:42,tree:1.00,rock:1.00,small:1.00},   // 1-3  base
  {count:30,tree:0.55,rock:1.30,small:1.60},   // 4-6  outskirts: open, low, bushy
  {count:54,tree:1.65,rock:1.15,small:0.70},   // 7-9  approach: wooded, enclosed
  {count:26,tree:0.25,rock:2.20,small:0.45},   // 10-15 sanctum: bare floor, stone ring
 ][g];
 const weightOf=r=>r==='tree'||r==='tree2'?PROP_RECIPE.tree:r==='rock'||r==='stump'?PROP_RECIPE.rock:PROP_RECIPE.small;
 const pickRole=k=>{let tot=0;for(const r of roles)tot+=weightOf(r);let t=hash(k,13,map+71)*tot;
  for(const r of roles){t-=weightOf(r);if(t<=0)return r}return roles[roles.length-1]};
 for(let i=0;i<140;i++){
  const side=i%2?-1:1,x=side*(17+hash(i,2,map+3)*22),z=-38+hash(i,5,map+7)*74;
  const role=pickRole(i),width=role==='tree'||role==='tree2'?4.3+hash(i,4,map)*3:role==='rock'?3+hash(i,6,map)*3.5:role==='stump'?1.6+hash(i,8,map):.65+hash(i,9,map)*1.3;
  add(role,x,z,width,hash(i,3,map)*Math.PI*2);
  if(result.length>=PROP_RECIPE.count)break;
 }
 // A few low native plants along the field edge give close-up detail without hiding mobs.
 for(let i=0;i<14;i++)add(i%3?'shrub':'detail',(i%2?-1:1)*(14.8+hash(i,1,map)), -25+hash(i,7,map)*37,.55+hash(i,9,map)*.65,hash(i,2,map)*6.28);
 return result;
}
// The source crops are NOT seamless: opposite edges differ by 4-5% brightness and the
// tile carries a slow tonal gradient, so plain tiling draws a visible grid and the old
// mirror trick drew butterfly symmetry instead. Two cheap fixes, in order:
//   1. high-pass: subtract a heavily blurred copy, then re-centre on the tile's mean.
//      This flattens the low-frequency tone that could never line up across tiles while
//      keeping every bit of the painted texture.
//   2. feather: cross-fade a narrow band at each edge with the opposite edge, so the two
//      edges meet at the same average.
// Result: the tile repeats without a seam and without mirroring, and the broad tone the
// floor needs comes back from the macro-variation layer drawn over it.
// Some environments (the headless test harness, older canvas shims) can draw but cannot
// read pixels back. Every layer that samples the canvas is skipped there: the floor still
// composes from the tiles and the grade, so build() keeps working everywhere.
function canSample(ctx){
 try{return !!ctx&&typeof ctx.getImageData==='function'&&typeof ctx.putImageData==='function'
   &&typeof ctx.createImageData==='function'&&!!ctx.getImageData(0,0,1,1).data;}
 catch(e){return false;}
}

function flattenTile(ctx,w,h){
 if(!canSample(ctx))return;

 const img=ctx.getImageData(0,0,w,h),src=new Uint8ClampedArray(img.data);
 const small=document.createElement('canvas');small.width=small.height=Math.max(4,Math.round(w/14));
 const sg=small.getContext('2d');sg.imageSmoothingEnabled=true;const bw=small.width;sg.drawImage(ctx.canvas,0,0,w,h,0,0,bw,bw);
 const blurCv=document.createElement('canvas');blurCv.width=w;blurCv.height=h;
 const bg=blurCv.getContext('2d');bg.imageSmoothingEnabled=true;bg.drawImage(small,0,0,bw,bw,0,0,w,h);
 const blur=bg.getImageData(0,0,w,h).data;
 const mean=[0,0,0],n=w*h;
 for(let i=0;i<n;i++)for(let c=0;c<3;c++)mean[c]+=src[i*4+c]/n;
 for(let i=0;i<n;i++)for(let c=0;c<3;c++)
  img.data[i*4+c]=clamp(mean[c]+(src[i*4+c]-blur[i*4+c])*1.5,0,255);
 ctx.putImageData(img,0,0);
 ctx.canvas.__mean=mean;
}

// Stochastic tiling beats both previous attempts. The source crops are not seamless (their
// opposite edges disagree by 4-5%), so this places many randomly rotated, randomly offset
// copies of the tile with feathered edges. The feather means a copy's border is never a
// hard line - it fades into its neighbours - so the texture has no seam, and because every
// copy is at a different angle and offset there is no repeat rhythm for the eye to catch.
// Mirroring was tried first: it is seamless by construction, but on a low-contrast tile the
// four-fold symmetry reads as a kaleidoscope at gameplay zoom.
function stochasticFill(target,tile,seed,spacing){
 const S=target.width,g=target.getContext('2d'),w=tile.width;
 // feather mask: alpha 1 in the middle, easing to 0 over the outer 22%
 const mask=document.createElement('canvas');mask.width=mask.height=w;
 const mcg=mask.getContext('2d'),mp=mcg.createImageData(w,w);
 for(let y=0;y<w;y++)for(let x=0;x<w;x++){
  const dx=Math.min(x,w-1-x)/(w*.22),dy=Math.min(y,w-1-y)/(w*.22);
  const e=Math.min(1,Math.min(dx,dy));
  mp.data[(y*w+x)*4+3]=Math.round(smooth(0,1,e)*255);
 }
 mcg.putImageData(mp,0,0);
 const soft=document.createElement('canvas');soft.width=soft.height=w;
 const sg=soft.getContext('2d');
 sg.drawImage(tile,0,0);sg.globalCompositeOperation='destination-in';sg.drawImage(mask,0,0);
 // jittered grid of placements, each at one of eight angles
 const n=Math.ceil(S/spacing)+2;
 for(let j=0;j<n;j++)for(let i=0;i<n;i++){
  const h=(Math.imul(i+3,73856093)^Math.imul(j+5,19349663)^Math.imul(seed+17,2654435761))>>>0;
  const x=i*spacing+(h%spacing)-w*.2,y=j*spacing+((h>>>8)%spacing)-w*.2;
  g.save();g.translate(x+w/2,y+w/2);g.rotate((h>>>16&7)*Math.PI/4);
  g.drawImage(soft,-w/2,-w/2);g.restore();
 }
 return target;
}

// Ground detail: small deterministic marks drawn into the floor, clipped to the material
// that owns them. Native tiles carry no close-up story, so without this the field is one
// continuous fabric wherever you stand. Sizes are in WORLD UNITS and converted once with
// ppu (pixels per unit) - the first version mixed the two and painted huge pale blobs.
function groundDetail(ctx,map,S){
 const d=designOf(map),kind=(d.palette&&d.palette.detail)||'grass',seed=d.seed;
 const rnd=(i,k)=>{const h=Math.imul(i+1,374761393)^Math.imul(k+7,668265263)^Math.imul(seed,1442695041);return ((Math.imul(h^(h>>>13),1274126177)^(h>>>16))>>>0)/4294967295};
 const ppu=S/90;
 // One mark per jittered grid cell. A linear index with two correlated hashes laid the
 // marks out as a visible lattice; a grid guarantees even coverage, the jitter hides it.
 const N=74,cell=90/N;
 for(let gy=0;gy<N;gy++)for(let gx=0;gx<N;gx++){
  const i=gy*N+gx;
  const x=-45+(gx+.5+rnd(i,1)-.5)*cell,z=-45+(gy+.5+rnd(i,2)-.5)*cell,px=(x+45)*ppu,pz=(z+45)*ppu;
  const w=surfaceWeights(map,x,z);
  const inRock=w.rock>.35,inDirt=w.dirt>.45;
  // keep the detail on the material it belongs to
  if(kind==='grass'&&inRock)continue;
  if(kind==='sand'&&inRock)continue;
  ctx.save();
  if(kind==='sand'){
   const rad=(5+rnd(i,4)*16)*ppu*.06;
   ctx.strokeStyle='rgba(120,92,52,.13)';ctx.lineWidth=Math.max(1,ppu*.05);
   ctx.beginPath();ctx.arc(px,pz,rad,-Math.PI*.15,Math.PI*1.15);ctx.stroke();
   ctx.strokeStyle='rgba(255,246,212,.15)';
   ctx.beginPath();ctx.arc(px,pz-1.5,rad,-Math.PI*.15,Math.PI*1.15);ctx.stroke();
  }else if(kind==='rock'){
   if(inRock&&rnd(i,5)>.5){
    const rr=(.35+rnd(i,6)*.8)*ppu,n=3+Math.floor(rnd(i,7)*3);
    ctx.fillStyle='rgba(38,40,44,.20)';ctx.beginPath();
    for(let k=0;k<n;k++){const a=k/n*6.283+rnd(i,k+8);ctx.lineTo(px+Math.cos(a)*rr,pz+Math.sin(a)*rr)}
    ctx.closePath();ctx.fill();
    ctx.strokeStyle='rgba(226,228,232,.13)';ctx.lineWidth=1;ctx.stroke();
   }else{
    ctx.fillStyle='rgba(30,32,36,'+(inDirt?.13:.09)+')';
    ctx.beginPath();ctx.arc(px,pz,(.12+rnd(i,9)*.35)*ppu,0,6.283);ctx.fill();
   }
  }else if(kind==='leaves'){
   ctx.translate(px,pz);ctx.rotate(rnd(i,4)*6.283);
   ctx.fillStyle=['rgba(58,74,32,.26)','rgba(112,86,40,.22)','rgba(34,50,28,.28)'][Math.floor(rnd(i,5)*3)];
   ctx.beginPath();ctx.ellipse(0,0,(.22+rnd(i,6)*.4)*ppu,(.1+rnd(i,7)*.16)*ppu,0,0,6.283);ctx.fill();
  }else if(kind==='ash'){
   if(rnd(i,5)>.62){
    ctx.strokeStyle='rgba(26,24,28,.22)';ctx.lineWidth=Math.max(1,ppu*.035);
    ctx.beginPath();let cx=px,cz=pz;ctx.moveTo(cx,cz);
    for(let k=0;k<4;k++){cx+=(rnd(i,k+10)-.5)*ppu*.9;cz+=(rnd(i,k+20)-.5)*ppu*.9;ctx.lineTo(cx,cz)}ctx.stroke();
   }else{
    ctx.fillStyle='rgba(206,200,210,.10)';
    ctx.beginPath();ctx.arc(px,pz,(.3+rnd(i,6)*.7)*ppu,0,6.283);ctx.fill();
   }
  }else{
   // grass tufts: three short blades, pale on top so they catch the eye at game zoom
   ctx.strokeStyle=['rgba(74,100,42,.30)','rgba(132,152,78,.24)'][Math.floor(rnd(i,5)*2)];
   ctx.lineWidth=Math.max(1,ppu*.05);
   const bl=(.35+rnd(i,6)*.55)*ppu;
   for(let k=-1;k<=1;k++){ctx.beginPath();ctx.moveTo(px+k*ppu*.09,pz);ctx.quadraticCurveTo(px+k*ppu*.15,pz-bl*.6,px+k*ppu*.2,pz-bl);ctx.stroke()}
  }
  ctx.restore();
 }
}

// Per-field colour grade. Ten fields were drawn from crops that cluster into three
// colour families (two of them identical), so the floor is graded per destination:
// the field's own art, corrected - never repainted. `color` sets the hue family,
// `overlay` the warmth, and sat/lum balance them against each other.
function gradeFloor(ctx,S,d){
 const p=d.palette;if(!p)return;
 ctx.save();
 if(p.tint){
  ctx.globalCompositeOperation='color';ctx.globalAlpha=clamp(p.tintA||.2,0,.5);
  ctx.fillStyle=p.tint;ctx.fillRect(0,0,S,S);        // hue family
 }
 ctx.globalCompositeOperation='overlay';ctx.globalAlpha=.16;
 ctx.fillStyle=p.tint||'#808080';ctx.fillRect(0,0,S,S); // keep shadows in that family
 ctx.restore();
}

function surface(plan,image,map,props){
 const S=2048,MS=384,cv=document.createElement('canvas');cv.width=cv.height=S;
 const ctx=cv.getContext('2d'),d=designOf(map),pal=d.palette||{};
 const PIX=canSample(ctx);
 // The field's own four crops, graded at tile level so the materials stay consistent.
 const filter='saturate('+(pal.sat||1)+') brightness('+(pal.lum||1)+')';
 const tiles={};
 for(const [i,role] of ['base','patch','road','cliff'].entries()){
  const src=document.createElement('canvas');src.width=src.height=256;
  const sg0=src.getContext('2d');
  if('filter' in sg0)sg0.filter=filter;
  const inset=role==='road'?48:0;
  sg0.drawImage(image,i*256+inset,inset,256-inset*2,256-inset*2,0,0,256,256);
  flattenTile(sg0,256,256);
  tiles[role]=src;
 }
 // One stochastic fill per material. Spacing is 0.62 of the tile so the feathered copies
 // overlap enough to leave no gaps.
 const tex={};
 for(const role of ['base','patch','road','cliff']){
  const c=document.createElement('canvas');c.width=c.height=S;
  const g0=c.getContext('2d'),t=tiles[role];
  // under-fill with the tile mean so feathered gaps never show through as transparency
  const m=t.__mean||[128,128,128];
  g0.fillStyle='rgb('+Math.round(m[0])+','+Math.round(m[1])+','+Math.round(m[2])+')';
  g0.fillRect(0,0,S,S);
  tex[role]=stochasticFill(c,t,d.seed+(role==='base'?31:role==='patch'?37:role==='road'?41:43),Math.round(256*.62));
 }
 ctx.drawImage(tex.base,0,0);

 // Material masks: computed at MS and upscaled, so the floor changes material on a hill
 // face instead of painting one tile across it.
 const scratch=document.createElement('canvas');scratch.width=scratch.height=S;
 const sg=scratch.getContext('2d');
 const maskCv=document.createElement('canvas');maskCv.width=maskCv.height=MS;
 const mg=maskCv.getContext('2d'),px=PIX?mg.createImageData(MS,MS):null;
 // Heights on a coarser grid than the masks: the slope only needs to be right to a few
 // degrees, and `activeHeight` is the single most expensive call in this function.
 const HG=192,hstep=90/HG,hs=new Float64Array((HG+1)*(HG+1)),mstep=90/MS;
 for(let j=0;j<=HG;j++)for(let q=0;q<=HG;q++)hs[j*(HG+1)+q]=activeHeight(map,-45+q*hstep,-45+j*hstep);
 const heightAt=(x,z)=>{
  const fx=(x+45)/hstep,fz=(z+45)/hstep,q=Math.min(HG-1,Math.max(0,Math.floor(fx))),j=Math.min(HG-1,Math.max(0,Math.floor(fz)));
  const tx=clamp(fx-q,0,1),tz=clamp(fz-j,0,1),i=j*(HG+1)+q;
  return hs[i]*(1-tx)*(1-tz)+hs[i+1]*tx*(1-tz)+hs[i+HG+1]*(1-tx)*tz+hs[i+HG+2]*tx*tz;
 };
 // One pass over the grid, not one per material: `surfaceWeights` is the expensive part
 // (fbm per sample) and all three masks read the same numbers.
 const W=new Float32Array(MS*MS*4);
 for(let j=0;j<MS;j++)for(let q=0;q<MS;q++){
  const x=-45+(q+.5)*mstep,z=-45+(j+.5)*mstep;
  const a=heightAt(x,z),b=heightAt(x+mstep*.5,z),c=heightAt(x,z+mstep*.5);
  const w=surfaceWeights(map,x,z,Math.atan(Math.hypot((b-a)/(mstep*.5),(c-a)/(mstep*.5)))*180/Math.PI);
  const idx=(j*MS+q)*4;
  W[idx]=w.dirt;W[idx+1]=w.rock;W[idx+2]=w.beach;W[idx+3]=0;
 }
 const orders=[['dirt','patch',0,1],['rock','cliff',1,1],['beach','patch',2,.55]];
 for(const [k,role,slot,gain] of (PIX?orders:[])){
  for(let j=0;j<MS;j++)for(let q=0;q<MS;q++){
   const idx=(j*MS+q)*4;
   px.data[idx]=px.data[idx+1]=px.data[idx+2]=255;
   px.data[idx+3]=Math.round(clamp(W[idx+slot],0,1)*255*gain);
  }
  mg.putImageData(px,0,0);
  sg.globalCompositeOperation='source-over';sg.clearRect(0,0,S,S);
  sg.drawImage(tex[role],0,0);
  sg.globalCompositeOperation='destination-in';sg.imageSmoothingEnabled=true;
  sg.drawImage(maskCv,0,0,S,S);
  sg.globalCompositeOperation='source-over';
  ctx.drawImage(scratch,0,0);
 }
 // A single winding trail that follows the landform, with a soft shoulder.
 if(d.pathInfluence>0){
  const layer=document.createElement('canvas');layer.width=layer.height=S;
  const g=layer.getContext('2d');g.drawImage(tex.road,0,0);
  const mask=document.createElement('canvas');mask.width=mask.height=512;
  const tg=mask.getContext('2d'),pixels=tg.createImageData(512,512);
  const width=(d.trail?d.trail.width:3)*(.85+.25*d.pathInfluence);
  for(let j=0;j<512;j++){const z=j/512*90-45,c=trailCenter(map,z),ww=width*(1+.12*Math.sin(z*.11));
   for(let i=0;i<512;i++){const x=i/512*90-45,k=(j*512+i)*4,edge=Math.abs(x-c);
    const alpha=(1-smooth(ww*.65,ww+1.6,edge))*.72*d.pathInfluence;
    pixels.data[k]=pixels.data[k+1]=pixels.data[k+2]=255;pixels.data[k+3]=Math.round(alpha*255)}}
  tg.putImageData(pixels,0,0);
  g.globalCompositeOperation='destination-in';g.imageSmoothingEnabled=true;
  g.drawImage(mask,0,0,S,S);
  ctx.drawImage(layer,0,0);
 }
 // Macro variation: broad, slope-independent drifts at 18-45 world units. The native
 // tiles are uniform on their own, and this is what stops a field reading as one swatch
 // of fabric.
 if(PIX){
  const macro=document.createElement('canvas');macro.width=macro.height=256;
  const mgc=macro.getContext('2d'),mpx=mgc.createImageData(256,256);
  for(let j=0;j<256;j++)for(let q=0;q<256;q++){
   const x=-45+(q+.5)/256*90,z=-45+(j+.5)/256*90;
   // two octaves: 18-unit patches and 45-unit drifts, so the eye never settles on one scale
   const v=fbm(x*.055,z*.055,d.seed+1201,4)*.5+.5,v2=fbm(x*.022+31,z*.022-17,d.seed+1211,3)*.5+.5;
   const wet=fbm(x*.13+9,z*.13-5,d.seed+1301,3)*.5+.5;
   const m=v*.62+v2*.38,idx=(j*256+q)*4;
   // dark, slightly green damp patches; light dry patches
   mpx.data[idx]=wet>.55?22:104;mpx.data[idx+1]=wet>.55?32:96;mpx.data[idx+2]=wet>.55?16:60;
   mpx.data[idx+3]=Math.round(clamp((m-.40)*1.9,0,.66)*255);
  }
  mgc.putImageData(mpx,0,0);
  ctx.save();ctx.globalCompositeOperation='soft-light';ctx.globalAlpha=.85;
  ctx.imageSmoothingEnabled=true;ctx.drawImage(macro,0,0,S,S);ctx.restore();

  // Structure break-up, synthesised at field resolution so nothing in it lines up with
  // the tile grid: it reorganises the light and shade without touching the painted crop.
  // `overlay` keeps the native colours, it only moves their level.
  const grain=document.createElement('canvas');grain.width=grain.height=512;
  const gg=grain.getContext('2d'),gpx=gg.createImageData(512,512);
  for(let j=0;j<512;j++)for(let q=0;q<512;q++){
   const x=-45+q/512*90,z=-45+j/512*90;
   const n=fbm(x*.42+3,z*.42-8,d.seed+1409,3)-.5;      // 2-3 unit clumps
   const n2=fbm(x*.13-21,z*.13+14,d.seed+1423,2)-.5;   // 8 unit bands
   const idx=(j*512+q)*4;
   gpx.data[idx]=gpx.data[idx+1]=gpx.data[idx+2]=Math.round(clamp(.5+n*1.5+n2*.9,0,1)*255);
   gpx.data[idx+3]=255;
  }
  gg.putImageData(gpx,0,0);
  ctx.save();ctx.globalCompositeOperation='overlay';ctx.globalAlpha=.20;
  ctx.imageSmoothingEnabled=true;ctx.drawImage(grain,0,0,S,S);
  // a second copy at a different scale and quarter turn so its own repeat never lines up
  ctx.translate(S*.5,S*.5);ctx.rotate(Math.PI/2);ctx.globalAlpha=.14;
  ctx.drawImage(grain,-S*.6,-S*.6,S*1.2,S*1.2);
  ctx.restore();
 }
 groundDetail(ctx,map,S);
 // Contact shadows under props: tight and light. Large soft gradients read as brown clouds
 // across the floor rather than shade.
 for(const p of props){const x=(p.x+45)*S/90,z=(p.z+45)*S/90,r=S/90*Math.max(.5,Math.min(1.6,p.rx)),g=ctx.createRadialGradient(x,z,0,x,z,r);g.addColorStop(0,'rgba(16,23,14,.20)');g.addColorStop(1,'rgba(16,23,14,0)');ctx.fillStyle=g;ctx.fillRect(x-r,z-r,r*2,r*2)}
 gradeFloor(ctx,S,d);
 return cv;
}

function terrainGeometry(THREE,map){
 const positions=[],uv=[],colors=[],indices=[],N=GRID+1,hs=new Float64Array(N*N);
 // Sample the heightfield once; slope for the floor materials comes from the same
 // grid, so painting the floor costs no extra terrain evaluation.
 for(let z=0;z<N;z++)for(let x=0;x<N;x++)hs[z*N+x]=activeHeight(map,x*STEP-45,z*STEP-45);
 for(let z=0;z<N;z++)for(let x=0;x<N;x++){
  const xx=x*STEP-45,zz=z*STEP-45,y=hs[z*N+x];
  const hx=(hs[z*N+Math.min(N-1,x+1)]-hs[z*N+Math.max(0,x-1)])/((x>0&&x<N-1?2:1)*STEP);
  const hz=(hs[Math.min(N-1,z+1)*N+x]-hs[Math.max(0,z-1)*N+x])/((z>0&&z<N-1?2:1)*STEP);
  const w=surfaceWeights(map,xx,zz,Math.atan(Math.hypot(hx,hz))*180/Math.PI),shade=.86+.14*smooth(-1.5,3.5,y);
  positions.push(xx,y,zz);uv.push(x/GRID,1-z/GRID);
  colors.push(shade*(.94+.06*w.grass),shade*(1-.05*w.rock),shade*(.92+.08*w.beach));
 }
 for(let z=0;z<GRID;z++)for(let x=0;x<GRID;x++){const a=z*(GRID+1)+x,b=a+1,c=a+GRID+1,e=c+1;indices.push(a,c,b,b,c,e)}
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));g.setIndex(indices);g.computeVertexNormals();return g;
}
function createStore(options={}){
 const fetcher=options.fetcher||((...args)=>fetch(...args)),loadImage=options.loadImage||(url=>new Promise((resolve,reject)=>{const im=new Image();im.onload=()=>resolve(im);im.onerror=()=>reject(Error('Native image unavailable: '+url));im.src=url}));
 const entries=new Map();let catalog=null;
 const getJSON=async url=>{const r=await fetcher(url);if(!r.ok)throw Error('Native scenery unavailable: '+url);return r.json()};
 async function ensure(map){
  if(!NAMES[map])return null;
  if(entries.has(map)){const value=entries.get(map);entries.delete(map);entries.set(map,value);return value.promise}
  const entry={ready:null,promise:null};entries.set(map,entry);
  entry.promise=(async()=>{
   if(!catalog)catalog=getJSON(BASE+'catalog.json').catch(e=>{catalog=null;throw e});
   const cat=await catalog,record=cat.maps.find(r=>r.name===NAMES[map]);if(!record||cat.schema!==1||record.stride!==10)throw Error('Unsupported native scenery');
   const dir=BASE+record.name+'/',[terrain,atlas,response]=await Promise.all([loadImage(dir+'terrain.png'),loadImage(dir+'models.webp'),fetcher(dir+'models.bin')]);
   if(!response.ok)throw Error('Native geometry unavailable');const vertices=new Float32Array(await response.arrayBuffer());
   if(vertices.length%record.stride||!vertices.every(Number.isFinite))throw Error('Invalid native geometry');
   for(const model of Object.values(record.models))if(model.first<0||model.count<3||(model.first+model.count)*record.stride>vertices.length)throw Error('Invalid native model range');
   entry.ready={record,terrain,atlas,vertices};
   // Keep at most two decoded field sets; live worlds own and dispose their GPU resources.
   for(const [key,value] of entries){if(entries.size<=2)break;if(key!==map&&value.ready)entries.delete(key)}
   return entry.ready;
  })().catch(e=>{entries.delete(map);throw e});return entry.promise;
 }
 return{ensure,ready:map=>entries.get(map)?.ready||null,diagnostics:()=>({cached:[...entries].filter(([,v])=>v.ready).map(([k])=>k)})};
}
function build(THREE,asset,map,stage,plan){
 setStage(stage);   // every design read below depends on the stage group
 const root=new THREE.Group(),geometries=new Set(),materials=new Set(),textures=new Set();root.userData.nativeField={map,stage,source:NAMES[map]};
 const ownGeo=g=>(geometries.add(g),g),ownMat=m=>(materials.add(m),m),ownTex=t=>(textures.add(t),t);
 const props=placements(map,stage,plan,asset.record),floor=ownGeo(terrainGeometry(THREE,map));
 const floorMap=ownTex(new THREE.CanvasTexture(surface(plan,asset.terrain,map,props)));floorMap.anisotropy=4;floorMap.magFilter=THREE.LinearFilter;floorMap.minFilter=THREE.LinearMipmapLinearFilter;
 const floorMesh=new THREE.Mesh(floor,ownMat(new THREE.MeshLambertMaterial({map:floorMap,color:0xb0b0b0,vertexColors:true})));floorMesh.receiveShadow=true;root.add(floorMesh);
 const water=designOf(map).water;
 if(water){
  // Irregular natural pond. The sloping ground occludes the disk to form the shore;
  // terrainHeight digs a bowl under it with a wide beach instead of a vertical rim.
  const positions=[water.x,water.level,water.z],indices=[],segments=80;
  for(let i=0;i<=segments;i++){const a=i/segments*Math.PI*2,r=1.3*(1+.09*Math.sin(a*3)+.05*Math.cos(a*5));positions.push(water.x+Math.cos(a)*water.rx*r,water.level,water.z+Math.sin(a)*water.rz*r);if(i)indices.push(0,i+1,i)}
  const geometry=ownGeo(new THREE.BufferGeometry());geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setIndex(indices);geometry.computeVertexNormals();
  const mesh=new THREE.Mesh(geometry,ownMat(new THREE.MeshPhongMaterial({color:water.color||(map===9?0x345d62:0x528a8c),shininess:70,transparent:true,opacity:.85})));mesh.userData.nativePond=true;root.add(mesh);
 }
 const atlas=ownTex(new THREE.Texture(asset.atlas));atlas.flipY=false;atlas.magFilter=THREE.LinearFilter;atlas.minFilter=THREE.LinearMipmapLinearFilter;atlas.anisotropy=4;atlas.needsUpdate=true;
 const mat=ownMat(new THREE.MeshBasicMaterial({map:atlas,vertexColors:true,side:THREE.DoubleSide,alphaTest:.35}));
 // Source UVs may intentionally extend outside their atlas region. Clamp per fragment,
 // as the reference renderer does, to prevent neighbouring textures leaking onto walls.
 mat.onBeforeCompile=shader=>{
  shader.vertexShader='attribute vec4 sourceBounds; varying vec4 nativeBounds;\n'+shader.vertexShader;
  shader.vertexShader=shader.vertexShader.replace('#include <uv_vertex>','#include <uv_vertex>\nnativeBounds=sourceBounds;');
  shader.fragmentShader='varying vec4 nativeBounds;\n'+shader.fragmentShader;
  const mapFragment=THREE.ShaderChunk.map_fragment.replace('texture2D( map, vUv )','texture2D( map, clamp(vUv,nativeBounds.xy,nativeBounds.zw) )');
  shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',mapFragment);
 };
 const modelGeos={};
 for(const p of props){
  if(!modelGeos[p.role]){
   const model=asset.record.models[p.role],g=ownGeo(new THREE.BufferGeometry()),position=[],uv=[],colors=[],bounds=[];
   for(let i=model.first*10;i<(model.first+model.count)*10;i+=10){const v=asset.vertices;position.push(v[i],v[i+1],v[i+2]);uv.push(v[i+3],v[i+4]);const shade=.58+.42*v[i+5];colors.push(shade,shade,shade);bounds.push(v[i+6],v[i+7],v[i+8],v[i+9]);}
   g.setAttribute('position',new THREE.Float32BufferAttribute(position,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));g.setAttribute('sourceBounds',new THREE.Float32BufferAttribute(bounds,4));modelGeos[p.role]=g;
  }
  const mesh=new THREE.Mesh(modelGeos[p.role],mat);mesh.scale.setScalar(p.scale);mesh.rotation.y=p.angle;mesh.position.set(p.x,p.y,p.z);mesh.userData.nativeProp=p;root.add(mesh);
 }
 // This world owns the smooth field terrain, natural props and ponds.
 return{root,props,floorMap,trackTextures:maps=>maps.forEach(t=>textures.add(t)),diagnostics:{map,stage,models:props.length,triangles:[...geometries].reduce((sum,g)=>sum+(g.index?g.index.count:g.attributes.position.count)/3,0)},dispose(){
  root.traverse(o=>{if(o.geometry)geometries.add(o.geometry);if(o.material)for(const material of (Array.isArray(o.material)?o.material:[o.material])){materials.add(material);if(material.map)textures.add(material.map)}});
  for(const g of geometries)g.dispose();for(const m of materials)m.dispose();for(const t of textures)t.dispose();if(root.parent)root.parent.remove(root);
 }};
}
return{NAMES,DESIGNS,LEGACY,LANE,laneCfg,TERRAIN,GRID,STEP,heightAt,setStage,stageGroup,designOf,designLabel,TIER_GROUPS,terrainHeight,activeHeight,legacyHeight,slopeAt,surfaceWeights,pathCenter,trailCenter,placements,terrainGeometry,createStore,build};
});
