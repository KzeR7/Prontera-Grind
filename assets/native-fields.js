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
 {name:'Prontera meadow',amp:2.17,seed:1291,rotate:0,pathInfluence:1,frame:2.2,trail:{bend:9.5,phase:0.4,width:3.4},tilt:[0.3,0.75],landAmp:1.5,landScale:40,ridgeAmp:1.5,ridgeScale:46,bench:{at:2.4,step:1.1,sharp:0.5,amount:0.55,warp:0.55},carve:{freq:0.05,depth:0.32},micro:0.1,water:null,signature:{kind:'terrace',level:2.4,x:24,z:-18,r:15,drop:1}},
 {name:'Izlude coastal grassland',amp:0.98,seed:2262,rotate:0.9,pathInfluence:0.9,frame:1.7,trail:{bend:8.5,phase:1.6,width:3},tilt:[-0.55,-0.35],landAmp:1.1,landScale:44,ridgeAmp:1,ridgeScale:52,bench:{at:1.8,step:0.9,sharp:0.45,amount:0.5,warp:0.5},carve:{freq:0.045,depth:0.26},micro:0.09,water:{x:-27,z:-14,rx:9,rz:15,level:0.3},signature:{kind:'bluff',x:-21,z:16,r:17,top:3.2,face:1}},
 {name:'Geffen wooded ridge',amp:0.56,seed:3370,rotate:1.9,pathInfluence:0.85,frame:2.4,trail:{bend:7.5,phase:2.4,width:2.8},tilt:[0.5,-0.2],landAmp:1.3,landScale:34,ridgeAmp:2.9,ridgeScale:30,ridgeBias:0.16,bench:{at:3,step:1.15,sharp:0.6,amount:0.6,warp:0.8},carve:{freq:0.06,depth:0.5},micro:0.12,water:null,signature:{kind:'spur',x:19,z:8,r:14,top:3.2,face:1}},
 {name:'Morocc dunes',amp:3.25,seed:4458,rotate:2.6,pathInfluence:0,frame:1.8,tilt:[0.7,0.45],landAmp:0.45,landScale:50,ridgeAmp:1.9,ridgeScale:26,ridgeBias:0.2,bench:null,dune:true,duneFreq:0.115,carve:{freq:0.035,depth:0.16},micro:0.07,water:null,signature:{kind:'dunefield',major:0.11,minor:0.035,amp:1.1}},
 {name:'Payon forest hills',amp:0.47,seed:7206,rotate:0.35,pathInfluence:0.95,frame:2.6,trail:{bend:9,phase:0.9,width:3},tilt:[-0.25,0.6],landAmp:1.4,landScale:32,ridgeAmp:3.1,ridgeScale:26,ridgeBias:0.2,bench:{at:3.2,step:1.25,sharp:0.65,amount:0.6,warp:0.85},carve:{freq:0.062,depth:0.6},micro:0.13,water:{x:28,z:6,rx:7,rz:11,level:0.45},signature:{kind:'gorge',x:-20,z:4,r:18,depth:1.5}},
 {name:'Comodo jungle hollow',amp:0.67,seed:10903,rotate:2.1,pathInfluence:0.7,frame:2.8,trail:{bend:7,phase:3.5,width:2.6},tilt:[0.1,0.15],landAmp:1.2,landScale:30,ridgeAmp:2,ridgeScale:28,bench:{at:2.6,step:1.3,sharp:0.8,amount:0.55,warp:0.9},carve:{freq:0.05,depth:0.4},micro:0.12,water:{x:25,z:0,rx:8,rz:12,level:0.25},signature:{kind:'basin',x:24,z:0,r:22,depth:1.9}},
 {name:'Louyang mountain field',amp:0.61,seed:8302,rotate:1.3,pathInfluence:0.6,frame:3,trail:{bend:8.5,phase:2,width:2.6},tilt:[-0.6,-0.5],landAmp:1.6,landScale:30,ridgeAmp:3.8,ridgeScale:24,ridgeBias:0.24,bench:{at:3.6,step:1.25,sharp:0.62,amount:0.66,warp:1.1},carve:{freq:0.065,depth:0.75},micro:0.15,water:null,signature:{kind:'terrace',level:3.6,x:-20,z:-20,r:16,drop:1.4}},
 {name:'Amatsu wild meadow',amp:1.34,seed:8868,rotate:3.6,pathInfluence:0.85,frame:1.9,trail:{bend:8,phase:4.2,width:3},tilt:[0.4,-0.6],landAmp:1.5,landScale:36,ridgeAmp:1.8,ridgeScale:42,bench:{at:2.6,step:1,sharp:0.45,amount:0.5,warp:0.6},carve:{freq:0.045,depth:0.3},micro:0.1,water:{x:26,z:-18,rx:8,rz:12,level:0.28},signature:{kind:'plateau',x:-7,z:-20,r:16,top:2.8,face:0.9}},
 {name:'Niflheim dead hollow',amp:1.63,seed:10637,rotate:4.4,pathInfluence:0.5,frame:2,trail:{bend:7,phase:2.8,width:2.8},tilt:[-0.15,-0.25],landAmp:1.3,landScale:34,ridgeAmp:1.6,ridgeScale:38,bench:{at:2.2,step:1.2,sharp:0.75,amount:0.6,warp:0.75},carve:{freq:0.055,depth:0.45},micro:0.1,water:null,signature:{kind:'basin',x:-8,z:-14,r:24,depth:1.6}},
 {name:'Abyss rocky basin',amp:0.78,seed:11867,rotate:5.1,pathInfluence:0.35,frame:2.8,trail:{bend:8,phase:1.2,width:3.2},tilt:[0.5,0.35],landAmp:1.5,landScale:28,ridgeAmp:3.2,ridgeScale:24,ridgeBias:0.18,bench:{at:3,step:1.35,sharp:0.7,amount:0.72,warp:1.2},carve:{freq:0.07,depth:0.65},micro:0.17,water:{x:-26,z:2,rx:9,rz:13,level:0.2},signature:{kind:'shelf',x:10,z:14,r:20,drop:1.7}}
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
 const d=(DESIGNS[map]||DESIGNS[0]),t=d.trail||{bend:0,phase:0};
 return t.bend*Math.sin(z*.052+t.phase)+.4*t.bend*Math.sin(z*.13+t.phase*.7);
}
function terrainHeight(map,x,z){
 const d=DESIGNS[map]||DESIGNS[0],s=d.seed,amp=d.amp||1;
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
const pathCenter=(map,z)=>(DESIGNS[map]&&DESIGNS[map].trail?trailCenter(map,z):0);
function activeHeight(map,x,z){return TERRAIN==='v1'?legacyHeight(map,x,z):terrainHeight(map,x,z)}
const GRID=72,STEP=90/GRID;
// Interpolate the exact rendered triangles so feet meet the sloping mesh, diagonals included.
function heightAt(map,x,z){
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
 const d=DESIGNS[map]||DESIGNS[0];slope=slope===undefined?slopeAt(map,x,z):slope;const rock=smooth(17,32,slope);
 const patch=smooth(.5,.9,fbm(x*.06,z*.06,d.seed+811,3)*.5+.5)*.7;
 const trail=d.pathInfluence>0&&d.trail?(1-smooth(d.trail.width*.55,d.trail.width+1.4,Math.abs(x-trailCenter(map,z))))*d.pathInfluence*.85:0;
 const beach=d.water?1-smooth(1,1.45,pondRadius(d.water,x,z)):0;
 const dirt=Math.min(1,patch+trail),grass=Math.max(0,1-rock-dirt-beach),total=grass+dirt+rock+beach||1;
 return{grass:grass/total,dirt:dirt/total,rock:rock/total,beach:beach/total};
}
function placements(map,stage,plan,record){
 const result=[],d=DESIGNS[map];
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
 // Sparse asymmetric groups, varied spacing and scale; never rows of town plots.
 for(let i=0;i<140;i++){
  const r=hash(i,13,map+71),side=i%2?-1:1,x=side*(17+hash(i,2,map+3)*22),z=-38+hash(i,5,map+7)*74;
  const role=roles[Math.floor(r*roles.length)],width=role==='tree'||role==='tree2'?4.3+hash(i,4,map)*3:role==='rock'?3+hash(i,6,map)*3.5:role==='stump'?1.6+hash(i,8,map):.65+hash(i,9,map)*1.3;
  add(role,x,z,width,hash(i,3,map)*Math.PI*2);
  if(result.length>=42)break;
 }
 // A few low native plants along the field edge give close-up detail without hiding mobs.
 for(let i=0;i<14;i++)add(i%3?'shrub':'detail',(i%2?-1:1)*(14.8+hash(i,1,map)), -25+hash(i,7,map)*37,.55+hash(i,9,map)*.65,hash(i,2,map)*6.28);
 return result;
}
function surface(plan,image,map,props){
 const S=2048,MS=192,cv=document.createElement('canvas');cv.width=cv.height=S;
 const ctx=cv.getContext('2d'),patterns={};
 // Four crops from the source atlas, mirrored per tile so their edges join.
 for(const [i,role] of ['base','patch','road','cliff'].entries()){
  const c=document.createElement('canvas');c.width=c.height=512;const tile=c.getContext('2d');
  const inset=role==='road'?64:0;for(let z=0;z<2;z++)for(let x=0;x<2;x++){tile.save();tile.translate(x?512:0,z?512:0);tile.scale(x?-1:1,z?-1:1);tile.drawImage(image,i*256+inset,inset,256-inset*2,256-inset*2,0,0,256,256);tile.restore()}
  patterns[role]=ctx.createPattern(c,'repeat');
 }
 ctx.fillStyle=patterns.base;ctx.fillRect(0,0,S,S);
 // Slope/slope-based material masks, computed at MS x MS and upscaled: the floor
 // changes material on a hill face instead of painting one tile across it.
 const orders=[['dirt',patterns.patch],['rock',patterns.cliff],['beach',patterns.patch]];
 const scratch=document.createElement('canvas');scratch.width=scratch.height=S;
 const sg=scratch.getContext('2d');
 const maskCv=document.createElement('canvas');maskCv.width=maskCv.height=MS;
 const mg=maskCv.getContext('2d'),px=mg.createImageData(MS,MS);
 // One coarse height grid drives every material mask: rock from the local gradient,
 // dirt/beach from the landform-independent noise and the pond.
 const hs=new Float64Array((MS+1)*(MS+1)),mstep=90/MS;
 for(let j=0;j<=MS;j++)for(let q=0;q<=MS;q++)hs[j*(MS+1)+q]=activeHeight(map,-45+q*mstep,-45+j*mstep);
 const weightsAt=(q,j)=>{
  const x=-45+(q+.5)*mstep,z=-45+(j+.5)*mstep;
  const a=hs[j*(MS+1)+q],b=hs[j*(MS+1)+q+1],c=hs[(j+1)*(MS+1)+q];
  return surfaceWeights(map,x,z,Math.atan(Math.hypot((b-a)/mstep,(c-a)/mstep))*180/Math.PI);
 };
 for(const [i,k] of orders.entries()){
  for(let j=0;j<MS;j++)for(let q=0;q<MS;q++){
   const idx=(j*MS+q)*4;
   px.data[idx]=px.data[idx+1]=px.data[idx+2]=255;
   px.data[idx+3]=Math.round(clamp(weightsAt(q,j)[k],0,1)*255);
  }
  mg.putImageData(px,0,0);
  // beach is a weaker wash of the same dirt tile
  sg.globalCompositeOperation='source-over';sg.clearRect(0,0,S,S);
  sg.fillStyle=patterns[k==='beach'?'patch':(k==='dirt'?'patch':'cliff')];sg.fillRect(0,0,S,S);
  sg.globalCompositeOperation='destination-in';sg.globalAlpha=k==='beach'?.55:1;
  sg.imageSmoothingEnabled=true;sg.drawImage(maskCv,0,0,S,S);
  sg.globalAlpha=1;sg.globalCompositeOperation='source-over';
  ctx.drawImage(scratch,0,0);
 }
 // A single winding trail that follows the landform, with a soft shoulder.
 if(plan.design&&DESIGNS[map].pathInfluence>0){
  const layer=document.createElement('canvas');layer.width=layer.height=S;const g=layer.getContext('2d');g.fillStyle=patterns.road;g.fillRect(0,0,S,S);
  const mask=document.createElement('canvas');mask.width=mask.height=512;const tg=mask.getContext('2d'),pixels=tg.createImageData(512,512);
  const width=(DESIGNS[map].trail?DESIGNS[map].trail.width:3)*(.85+.25*DESIGNS[map].pathInfluence);
  for(let j=0;j<512;j++){const z=j/512*90-45,c=trailCenter(map,z),ww=width*(1+.12*Math.sin(z*.11));for(let i=0;i<512;i++){const x=i/512*90-45,k=(j*512+i)*4,edge=Math.abs(x-c),alpha=(1-smooth(ww*.65,ww+1.6,edge))*.72*DESIGNS[map].pathInfluence;pixels.data[k]=pixels.data[k+1]=pixels.data[k+2]=255;pixels.data[k+3]=Math.round(alpha*255)}}
  tg.putImageData(pixels,0,0);g.globalCompositeOperation='destination-in';g.drawImage(mask,0,0,S,S);ctx.drawImage(layer,0,0);
 }
 for(const p of props){const x=(p.x+45)*S/90,z=(p.z+45)*S/90,r=S/90*Math.max(.4,Math.min(4,p.rx)),g=ctx.createRadialGradient(x,z,0,x,z,r);g.addColorStop(0,'rgba(16,23,14,.24)');g.addColorStop(1,'rgba(16,23,14,0)');ctx.fillStyle=g;ctx.fillRect(x-r,z-r,r*2,r*2)}
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
 const root=new THREE.Group(),geometries=new Set(),materials=new Set(),textures=new Set();root.userData.nativeField={map,stage,source:NAMES[map]};
 const ownGeo=g=>(geometries.add(g),g),ownMat=m=>(materials.add(m),m),ownTex=t=>(textures.add(t),t);
 const props=placements(map,stage,plan,asset.record),floor=ownGeo(terrainGeometry(THREE,map));
 const floorMap=ownTex(new THREE.CanvasTexture(surface(plan,asset.terrain,map,props)));floorMap.anisotropy=4;floorMap.magFilter=THREE.LinearFilter;floorMap.minFilter=THREE.LinearMipmapLinearFilter;
 const floorMesh=new THREE.Mesh(floor,ownMat(new THREE.MeshLambertMaterial({map:floorMap,color:0xb0b0b0,vertexColors:true})));floorMesh.receiveShadow=true;root.add(floorMesh);
 const water=DESIGNS[map].water;
 if(water){
  // Irregular natural pond. The sloping ground occludes the disk to form the shore;
  // terrainHeight digs a bowl under it with a wide beach instead of a vertical rim.
  const positions=[water.x,water.level,water.z],indices=[],segments=80;
  for(let i=0;i<=segments;i++){const a=i/segments*Math.PI*2,r=1.3*(1+.09*Math.sin(a*3)+.05*Math.cos(a*5));positions.push(water.x+Math.cos(a)*water.rx*r,water.level,water.z+Math.sin(a)*water.rz*r);if(i)indices.push(0,i+1,i)}
  const geometry=ownGeo(new THREE.BufferGeometry());geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setIndex(indices);geometry.computeVertexNormals();
  const mesh=new THREE.Mesh(geometry,ownMat(new THREE.MeshPhongMaterial({color:map===9?0x345d62:0x528a8c,shininess:70,transparent:true,opacity:.85})));mesh.userData.nativePond=true;root.add(mesh);
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
return{NAMES,DESIGNS,LEGACY,LANE,laneCfg,TERRAIN,GRID,STEP,heightAt,terrainHeight,activeHeight,legacyHeight,slopeAt,surfaceWeights,pathCenter,trailCenter,placements,terrainGeometry,createStore,build};
});
