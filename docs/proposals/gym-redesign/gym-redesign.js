/* Prontera Gymnasium - standalone visual proposal for the Digimon Sanctuary gym.
 *
 * This is NOT the game. It is a design study that reuses the repo's own three.js
 * r128 (docs/proposals/gym-asset-study/three.js) and the six Sanctuary textures, so
 * materials, camera framing and colour pipeline match assets/social-scene.js.
 *
 * Serve the repo root and open docs/proposals/gym-redesign/index.html
 *   ?view=over|entry|top|power|guard|agility|focus  (?labels=0 hides the bay chips)
 *
 * Everything is baked: vertex-colour key light + painted court + contact-shadow decals.
 * No lights, no shadow maps, no new textures on disk - the same flat-shaded Ragnarok
 * pipeline the plaza already uses, with the form put back into the paint.
 */
(async function(){
'use strict';
const T=window.THREE;
const Q=new URLSearchParams(location.search);
const START=Q.get('view')||'over';
const SHOWLABELS=Q.get('labels')!=='0';

/* ---- 0. world contract, mirrored from assets/social-rules.js ------------------------------- */
const COURT={x1:43,x2:95,z1:12.5,z2:39};
const BAYS={
  power:{x1:45.5,x2:62.5,z1:26.5,z2:38,colour:0xb0684f,css:'#b0684f',label:'POWER',sigil:'bolt'},
  guard:{x1:55,x2:67,z1:14.5,z2:25.5,colour:0x5f7d95,css:'#5f7d95',label:'GUARD',sigil:'shield'},
  agility:{x1:68.5,x2:81.5,z1:21,z2:30.5,colour:0xc99a4e,css:'#c99a4e',label:'AGILITY',sigil:'wing'},
  focus:{x1:82,x2:94.5,z1:21,z2:34,colour:0x7d9a6a,css:'#7d9a6a',label:'FOCUS',sigil:'eye'}
};
/* Station rows are a shared client/Worker contract - the redesign is built around them. */
const STATIONS={power:[[52.5,30.5],[56.5,30.5],[60.5,30.5]],guard:[[60,21],[63,21],[66,21]],agility:[[72,26],[75,26],[78,26]],focus:[[83,27],[86,27],[89,27]]};
const GATE={x1:62,x2:76,z:38.5};
const MEDALLION={x:69,z:34.4};

/* ---- 1. renderer / scene / camera, matching social-scene.js -------------------------------- */
const host=document.getElementById('stage');
const scene=new T.Scene();
scene.background=new T.Color(0xb9cbbb);
scene.fog=new T.Fog(0xb9cbbb,150,280);
const renderer=new T.WebGLRenderer({antialias:true,alpha:false});
renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));
host.append(renderer.domElement);

const camera=new T.PerspectiveCamera(38,1,.1,350);
let yaw=Number(Q.get('yaw')||0),pitch=Number(Q.get('pitch')||45),dist=Number(Q.get('dist')||46);
let target=new T.Vector3(69,1.2,26);

/* ---- 2. textures + materials -------------------------------------------------------------- */
const loader=new T.TextureLoader();
const load=name=>new Promise(res=>loader.load(name,t=>{t.wrapS=t.wrapT=T.RepeatWrapping;t.anisotropy=4;res(t)},undefined,()=>{console.warn('missing texture',name);res(null)}));
const [texWood,texPlaster,texRoof,texBoard]=await Promise.all([
  load('../../../assets/digimon/sanctuary/cc0/medieval_wood.webp'),
  load('../../../assets/digimon/sanctuary/gym-plaster.webp'),
  load('../../../assets/digimon/sanctuary/cc0/roof_09.webp'),
  load('../../../assets/digimon/sanctuary/walkway-wood.webp')
]);

const materials={};
for(const [k,map] of [['wood',texWood],['plaster',texPlaster],['roof',texRoof],['board',texBoard]]){
  materials[k]=new T.MeshBasicMaterial({map:map||null,vertexColors:true,side:T.DoubleSide});
}
materials.flat=new T.MeshBasicMaterial({vertexColors:true,side:T.DoubleSide});

/* ---- 3. geometry helpers ------------------------------------------------------------------ */
const batches=new Map();
const KEYDIR=new T.Vector3(.42,.86,.30).normalize();
const tempC=new T.Color();

function worldUV(g,w,h,d,tile){
  const uv=g.attributes.uv,n=g.attributes.normal;
  for(let i=0;i<uv.count;i++){
    const ax=Math.abs(n.getX(i)),ay=Math.abs(n.getY(i)),az=Math.abs(n.getZ(i));
    let su=w,sv=h;
    if(ax>=ay&&ax>=az){su=d;sv=h}else if(ay>=ax&&ay>=az){su=w;sv=d}
    uv.setXY(i,uv.getX(i)*su/tile,uv.getY(i)*sv/tile);
  }
}
/* Bake the key light and a floor-contact gradient into vertex colour. One baked term is
   cheaper than a DirectionalLight and cannot change the rest of the plaza. */
function tint(g,colour,opts){
  const o=opts||{},lo=o.lo??.66,hi=o.hi??1,ao=o.ao??.20;
  g.computeVertexNormals();
  const pos=g.attributes.position,nor=g.attributes.normal;
  const col=new Float32Array(pos.count*3);
  tempC.set(colour);
  for(let i=0;i<pos.count;i++){
    const d=nor.getX(i)*KEYDIR.x+nor.getY(i)*KEYDIR.y+nor.getZ(i)*KEYDIR.z;
    let k=lo+(hi-lo)*Math.max(0,d);
    if(ao){const y=pos.getY(i);k*=(1-ao*(1-Math.min(1,Math.max(0,y/2.6))))}
    col[i*3]=Math.min(1,tempC.r*k);col[i*3+1]=Math.min(1,tempC.g*k);col[i*3+2]=Math.min(1,tempC.b*k);
  }
  g.setAttribute('color',new T.BufferAttribute(col,3));
  return g;
}
function boxGeo(w,h,d,tile){
  const g=new T.BoxGeometry(w,h,d).toNonIndexed();
  if(tile)worldUV(g,w,h,d,tile);
  return g;
}
const _m4=new T.Matrix4(),_q=new T.Quaternion(),_e=new T.Euler(),_v=new T.Vector3(),_s=new T.Vector3();
/* ?audit=1 records every part's world bounding box so the geometry can be
   checked for floating props, coplanar sheets and out-of-court volume. */
const AUDIT=new URLSearchParams(location.search).get('audit')==='1';
const PARTS=[];
function put(geo,matName,colour,x,y,z,rot,scale){
  const g=tint(geo,colour);
  if(rot)_e.set(rot[0]||0,rot[1]||0,rot[2]||0,rot[3]||'XYZ');else _e.set(0,0,0);
  _q.setFromEuler(_e);
  if(typeof scale==='number')_s.set(scale,scale,scale);else if(scale)_s.set(scale[0],scale[1],scale[2]);else _s.set(1,1,1);
  _m4.compose(_v.set(x,y,z),_q,_s);
  g.applyMatrix4(_m4);
  if(AUDIT){
    g.computeBoundingBox();
    const b=g.boundingBox;
    const st=(new Error()).stack.split('\n').slice(2,4).map(s=>s.trim().replace(/^at /,'')).join(' <- ');
    PARTS.push({m:matName,c:colour,min:[b.min.x,b.min.y,b.min.z],max:[b.max.x,b.max.y,b.max.z],at:st});
  }
  let b=batches.get(matName);
  if(!b){b=[];batches.set(matName,b)}
  b.push(g);
  return g;
}
function mergeInto(geos){
  // Batches are triangle lists. Indexed primitives must be expanded first;
  // otherwise adjacent objects are stitched into long, unrelated triangles.
  geos=geos.map(g=>g.index?g.toNonIndexed():g);
  for(const g of geos)if(g.attributes.position.count%3!==0)throw Error('Gym batch contains an incomplete triangle');
  let n=0;for(const g of geos)n+=g.attributes.position.count;
  const pos=new Float32Array(n*3),nor=new Float32Array(n*3),uv=new Float32Array(n*2),col=new Float32Array(n*3);
  let o=0;
  for(const g of geos){
    const c=g.attributes.position.count,p=g.attributes.position.array,nn=g.attributes.normal.array,
          u=g.attributes.uv?g.attributes.uv.array:null,cc=g.attributes.color.array;
    pos.set(p,o*3);nor.set(nn,o*3);col.set(cc,o*3);
    if(u)uv.set(u,o*2);
    o+=c;
  }
  const out=new T.BufferGeometry();
  out.setAttribute('position',new T.BufferAttribute(pos,3));
  out.setAttribute('normal',new T.BufferAttribute(nor,3));
  out.setAttribute('uv',new T.BufferAttribute(uv,2));
  out.setAttribute('color',new T.BufferAttribute(col,3));
  out.computeBoundingSphere();
  return out;
}
function box(w,h,d,matName,colour,x,y,z,rot,tile){return put(boxGeo(w,h,d,tile===false?0:(tile||2)),matName,colour,x,y,z,rot)}

function cyl(rt,rb,h,seg,matName,colour,x,y,z,rot,scale){
  return put(new T.CylinderGeometry(rt,rb,h,seg).toNonIndexed(),matName,colour,x,y,z,rot,scale);
}
function lathe(profile,seg,matName,colour,x,y,z,rot,scale){
  const pts=profile.map(p=>new T.Vector2(p[0],p[1]));
  return put(new T.LatheGeometry(pts,seg),matName,colour,x,y,z,rot,scale);
}
/* A turned veranda post: square foot, tapered shaft, two rings, a capital. */
const POST_PROFILE=[[0,0],[.26,0],[.26,.14],[.19,.22],[.17,2.35],[.20,2.48],[.20,2.62],[.155,2.70],[.155,2.86],[.24,2.94],[.24,3.06],[0,3.06]];
function post(x,y,z,h,matName,colour){
  return lathe(POST_PROFILE,9,matName,colour,x,y,z,null,[1,h/3.06,1]);
}
function beamBetween(a,b,thick,matName,colour){
  const dx=b[0]-a[0],dy=b[1]-a[1],dz=b[2]-a[2],len=Math.hypot(dx,dy,dz);
  const g=new T.CylinderGeometry(thick,thick,len,4).toNonIndexed();
  const m=new T.Matrix4().makeTranslation((a[0]+b[0])/2,(a[1]+b[1])/2,(a[2]+b[2])/2);
  const q=new T.Quaternion().setFromUnitVectors(new T.Vector3(0,1,0),new T.Vector3(dx/len,dy/len,dz/len));
  m.multiply(new T.Matrix4().makeRotationFromQuaternion(q));
  const tg=tint(g,colour);
  tg.applyMatrix4(m);
  let bb=batches.get(matName);if(!bb){bb=[];batches.set(matName,bb)}bb.push(tg);
}

/* Contact shadows: painted into the court texture, so they cost nothing at runtime. */
const SHADOWS=[];
function shadow(x,z,rx,rz,a){SHADOWS.push({x,z,rx,rz,a:a??.30})}

/* ---- 4. painted court --------------------------------------------------------------------- */
function canvasTex(w,h,draw){
  const c=document.createElement('canvas');c.width=w;c.height=h;
  const g=c.getContext('2d');draw(g,w,h);
  const t=new T.CanvasTexture(c);t.anisotropy=4;t.needsUpdate=true;return t;
}
let seed=20261107;
const rnd=()=>{seed=(seed*1664525+1013904223)&0x7fffffff;return seed/0x7fffffff};

/* The four floor decals: sigil + stencil name, drawn once each and laid on the slab. */
function bayDecal(bay,name){
  return canvasTex(512,512,(g,w,h)=>{
    g.clearRect(0,0,w,h);
    g.translate(w/2,h/2);
    // sigil
    g.globalAlpha=.5;g.fillStyle='#f3e7c9';g.strokeStyle='#f3e7c9';g.lineWidth=16;g.lineJoin='round';
    const s=150;
    if(name==='bolt'){g.beginPath();g.moveTo(18,-s);g.lineTo(-70,-18);g.lineTo(-6,-18);g.lineTo(-22,s);g.lineTo(72,4);g.lineTo(2,4);g.closePath();g.fill()}
    if(name==='shield'){g.beginPath();g.moveTo(0,-s);g.lineTo(96,-s*.62);g.lineTo(84,s*.2);g.lineTo(0,s);g.lineTo(-84,s*.2);g.lineTo(-96,-s*.62);g.closePath();g.stroke();g.beginPath();g.moveTo(0,-s*.55);g.lineTo(0,s*.45);g.moveTo(-56,-s*.2);g.lineTo(56,-s*.2);g.stroke()}
    if(name==='wing'){for(let i=-1;i<2;i++){g.beginPath();g.moveTo(-s,60+i*54);g.lineTo(-10,10+i*54);g.lineTo(s,34+i*54);g.lineTo(-10,-14+i*54);g.closePath();g.fill()}}
    if(name==='eye'){g.beginPath();g.ellipse(0,0,s,s*.66,0,0,Math.PI*2);g.stroke();g.beginPath();g.arc(0,0,52,0,Math.PI*2);g.fill()}
    g.globalAlpha=1;
    // stencil bay name
    g.font='bold 78px Georgia,serif';g.textAlign='center';g.textBaseline='middle';
    g.globalAlpha=.62;g.fillStyle='#f7edd4';
    g.fillText(name.toUpperCase(),0,208);
    g.globalAlpha=1;
    // worn stencil edges
    g.globalCompositeOperation='destination-out';
    for(let i=0;i<160;i++){g.globalAlpha=.05+rnd()*.16;g.beginPath();g.arc((rnd()-.5)*470,(rnd()-.5)*470,2+rnd()*11,0,Math.PI*2);g.fill()}
    g.globalCompositeOperation='source-over';g.globalAlpha=1;
  });
}
/* Court paint: sand, paved apron, wear trails, painted lane lines, grease, chalk. */
function paintCourt(){
  const px=2048,py=Math.round(px*(COURT.z2-COURT.z1)/(COURT.x2-COURT.x1));
  const sx=px/(COURT.x2-COURT.x1),sz=py/(COURT.z2-COURT.z1);
  const X=x=>(x-COURT.x1)*sx, Z=z=>(z-COURT.z1)*sz;
  const tex=canvasTex(px,py,(g,w,h)=>{
    // base sand
    const grd=g.createLinearGradient(0,0,w*.35,h);
    grd.addColorStop(0,'#eddcba');grd.addColorStop(.5,'#e5d3af');grd.addColorStop(1,'#dcc8a2');
    g.fillStyle=grd;g.fillRect(0,0,w,h);
    // large mottling
    for(let i=0;i<90;i++){const r=40+rnd()*220,x=rnd()*w,y=rnd()*h;
      const rg=g.createRadialGradient(x,y,0,x,y,r);
      rg.addColorStop(0,'rgba(182,150,105,'+(.05+rnd()*.07)+')');rg.addColorStop(1,'rgba(182,150,105,0)');
      g.fillStyle=rg;g.beginPath();g.arc(x,y,r,0,Math.PI*2);g.fill()}
    // fine grain
    for(let i=0;i<26000;i++){g.fillStyle=rnd()>.5?'rgba(120,94,62,.05)':'rgba(255,246,224,.06)';g.fillRect(rnd()*w,rnd()*h,1+rnd()*2,1+rnd()*2)}
    // broom sweep
    g.globalAlpha=.05;g.strokeStyle='#8c6a44';g.lineWidth=2;
    for(let i=0;i<70;i++){const y=rnd()*h;g.beginPath();g.moveTo(0,y);g.quadraticCurveTo(w*.5,y+(rnd()-.5)*30,w,y+(rnd()-.5)*20);g.stroke()}
    g.globalAlpha=1;
    // paved apron: stone pavers around the open three sides
    const apron=1.35*sx;
    g.save();
    g.fillStyle='#cfc7ad';g.fillRect(0,0,w,apron);g.fillRect(0,h-apron,w,apron);g.fillRect(0,0,apron,h);g.fillRect(w-apron,0,apron,h);
    g.fillStyle='#c3b99d';
    const pw=1.05*sx,pd=.52*sz;
    for(let row=0;row<3;row++){
      for(let x=-pw;x<w+pw;x+=pw){const off=(row%2)*pw/2;
        g.fillRect(x+off+2,row*pd+2,pw-4,pd-4);
        g.fillRect(x+off+2,h-apron+row*pd+2,pw-4,pd-4);
        g.fillRect(row*pd+2,x+off+2,pd-4,pw-4);
        g.fillRect(w-apron+row*pd+2,x+off+2,pd-4,pw-4);
      }
    }
    g.restore();
    // stone pad under each bay
    for(const b of Object.values(BAYS)){
      const x1=X(b.x1),x2=X(b.x2),z1=Z(b.z1),z2=Z(b.z2);
      g.fillStyle='#d6cdb3';g.fillRect(x1,z1,x2-x1,z2-z1);
      g.strokeStyle='rgba(120,100,72,.35)';g.lineWidth=3;
      for(let x=x1;x<x2;x+=1.6*sx){g.beginPath();g.moveTo(x,z1);g.lineTo(x,z2);g.stroke()}
      for(let z=z1;z<z2;z+=1.6*sz){g.beginPath();g.moveTo(x1,z);g.lineTo(x2,z);g.stroke()}
      // pigment inset band
      g.globalAlpha=.5;g.fillStyle=b.css;
      g.fillRect(x1+8,z1+8,x2-x1-16,.30*sz);g.fillRect(x1+8,z2-8-.30*sz,x2-x1-16,.30*sz);
      g.fillRect(x1+8,z1+8,.30*sx,z2-z1-16);g.fillRect(x2-8-.30*sx,z1+8,.30*sx,z2-z1-16);
      g.globalAlpha=1;
    }
    // circulation wear: brighter sand trails from the gate to each bay
    const trails=[[69,38,69,33],[62,33,53,31],[67,33,64,23],[72,32,75,27],[76,32,86,28]];
    for(const [ax,az,bx,bz] of trails){
      const gr=g.createLinearGradient(X(ax),Z(az),X(bx),Z(bz));
      gr.addColorStop(0,'rgba(255,247,226,0)');gr.addColorStop(.5,'rgba(255,247,226,.35)');gr.addColorStop(1,'rgba(255,247,226,0)');
      g.strokeStyle=gr;g.lineWidth=1.5*sx;g.lineCap='round';
      g.beginPath();g.moveTo(X(ax),Z(az));g.lineTo(X(bx),Z(bz));g.stroke();
    }
    // entry medallion: brass compass rose over stone
    const mx=X(MEDALLION.x),mz=Z(MEDALLION.z),mr=2.15*sx;
    g.save();g.translate(mx,mz);
    g.fillStyle='#d9cfb2';g.beginPath();g.arc(0,0,mr,0,Math.PI*2);g.fill();
    g.strokeStyle='#a98a4e';g.lineWidth=mr*.06;g.beginPath();g.arc(0,0,mr*.92,0,Math.PI*2);g.stroke();
    g.strokeStyle='#8a6a3a';g.lineWidth=mr*.03;g.beginPath();g.arc(0,0,mr*.62,0,Math.PI*2);g.stroke();
    const rose=['#b0684f','#5f7d95','#c99a4e','#7d9a6a'];
    for(let i=0;i<8;i++){
      const a=i*Math.PI/4,len=i%2?mr*.55:mr*.86;
      g.save();g.rotate(a);g.fillStyle=rose[i%4];g.globalAlpha=.85;
      g.beginPath();g.moveTo(0,-mr*.10);g.lineTo(len,0);g.lineTo(0,mr*.10);g.closePath();g.fill();g.restore();
    }
    g.globalAlpha=1;g.fillStyle='#f6ecd2';g.beginPath();g.arc(0,0,mr*.17,0,Math.PI*2);g.fill();
    g.strokeStyle='#8a6a3a';g.lineWidth=mr*.02;g.beginPath();g.arc(0,0,mr*.17,0,Math.PI*2);g.stroke();
    g.restore();
    // agility lane footprints
    for(let i=0;i<14;i++){
      const t=i/13,x=X(70.4+t*10.4),z=Z(29.4-Math.sin(t*3.1)*1.9)+(i%2?-.42:.42)*sz;
      g.save();g.translate(x,z);g.rotate(-.25+(i%2?.3:-.3));g.globalAlpha=.24;g.fillStyle='#f7edda';
      g.beginPath();g.ellipse(0,0,9,17,0,0,Math.PI*2);g.fill();g.restore();
    }
    g.globalAlpha=1;
    // chalk dust + handprints at the power platform
    for(let i=0;i<7;i++){
      g.globalAlpha=.16;g.fillStyle='#fffdf6';
      g.beginPath();g.ellipse(X(50.5+rnd()*4),Z(33+rnd()*3),14+rnd()*26,10+rnd()*18,rnd()*3,0,Math.PI*2);g.fill();
    }
    g.globalAlpha=1;
    // water ring by the focus basin, oil by the rack
    const ring=g.createRadialGradient(X(90.4),Z(30.2),4,X(90.4),Z(30.2),1.6*sx);
    ring.addColorStop(0,'rgba(90,80,60,.20)');ring.addColorStop(.7,'rgba(90,80,60,.10)');ring.addColorStop(1,'rgba(90,80,60,0)');
    g.fillStyle=ring;g.beginPath();g.arc(X(90.4),Z(30.2),1.6*sx,0,Math.PI*2);g.fill();
    for(let i=0;i<5;i++){g.globalAlpha=.10+rnd()*.07;g.fillStyle='#5a4330';
      g.beginPath();g.ellipse(X(53+rnd()*8),Z(28+rnd()*2),10+rnd()*24,6+rnd()*12,rnd()*3,0,Math.PI*2);g.fill()}
    g.globalAlpha=1;
    // painted contact shadows
    for(const s of SHADOWS){
      const r=s.rx*sx,rz=s.rz*sz,cx=X(s.x),cz=Z(s.z);
      g.save();g.translate(cx,cz);g.scale(1,rz/r);
      const rg=g.createRadialGradient(0,0,0,0,0,r);
      rg.addColorStop(0,'rgba(58,42,26,'+s.a+')');rg.addColorStop(.55,'rgba(58,42,26,'+(s.a*.55)+')');rg.addColorStop(1,'rgba(58,42,26,0)');
      g.fillStyle=rg;g.beginPath();g.arc(0,0,r,0,Math.PI*2);g.fill();g.restore();
    }
    /* Building shade: soft bands cast into the court by the wall line and the
       side returns. Painted because the scene uses no shadow maps at all. */
    const shadeBand=(x1,z1,x2,z2,depth,alpha)=>{
      const dx=x2-x1,dz=z2-z1,L=Math.hypot(dx,dz)||1;
      let nx=-dz/L,nz=dx/L;
      const mx=(x1+x2)/2,mz=(z1+z2)/2;
      if((mx+nx*depth-69)**2+(mz+nz*depth-26)**2 < (mx-69)**2+(mz-26)**2){nx=-nx;nz=-nz}
      const gr=g.createLinearGradient(X(mx),Z(mz),X(mx+nx*depth),Z(mz+nz*depth));
      gr.addColorStop(0,'rgba(56,42,28,'+alpha+')');
      gr.addColorStop(.55,'rgba(56,42,28,'+(alpha*.45)+')');
      gr.addColorStop(1,'rgba(56,42,28,0)');
      g.beginPath();
      g.moveTo(X(x1),Z(z1));g.lineTo(X(x2),Z(z2));
      g.lineTo(X(x2+nx*depth),Z(z2+nz*depth));g.lineTo(X(x1+nx*depth),Z(z1+nz*depth));
      g.closePath();g.fillStyle=gr;g.fill();
    };
    /* Wall-base ambient occlusion. The key light itself is baked into vertex
       colour from the south-east, so nothing casts a long shadow into the
       court; what sells the join is a narrow AO band where wall meets floor. */
    shadeBand(43,18.5,65,12.5,1.5,.16);
    shadeBand(73,12.5,95,18.5,1.5,.16);
    shadeBand(43,18.5,43,29,1.3,.14);
    shadeBand(95,18.5,95,29,1.3,.14);
    // edge vignette
    const vg=g.createLinearGradient(0,0,0,h);
    vg.addColorStop(0,'rgba(70,52,32,.16)');vg.addColorStop(.18,'rgba(70,52,32,0)');
    vg.addColorStop(.82,'rgba(70,52,32,0)');vg.addColorStop(1,'rgba(70,52,32,.16)');
    g.fillStyle=vg;g.fillRect(0,0,w,h);
  });
  tex.wrapS=tex.wrapT=T.ClampToEdgeWrapping;
  return tex;
}

/* ---- 5. architecture ---------------------------------------------------------------------- */
const WALLS=[[43,18.5,65,12.5],[65,12.5,73,12.5],[73,12.5,95,18.5],[43,18.5,43,29],[95,18.5,95,29]];
const OAK=0xb08a5e,ASH=0xc9a978,WALNUT=0x7b5637,PLASTER=0xf1e7d0,GLAZE=0x6c8a80;
function wingFrame(seg){
  const dx=seg[2]-seg[0],dz=seg[3]-seg[1],len=Math.hypot(dx,dz),theta=Math.atan2(-dz,dx),
        c=Math.cos(theta),sn=Math.sin(theta),cx=(seg[0]+seg[2])/2,cz=(seg[1]+seg[3])/2;
  return {len,theta,c,sn,cx,cz,point:(u,y,v)=>[cx+c*u+sn*v,y,cz-sn*u+c*v]};
}
function buildShell(){
  // plinth under the two wings and the connector
  for(const seg of [WALLS[0],WALLS[2]]){
    const f=wingFrame(seg);
    for(let i=0;i<Math.round(f.len/.9);i++){
      const u=-f.len/2+(i+.5)*f.len/Math.round(f.len/.9);
      const [x,,z]=f.point(u,0,0);
      box(.86,.30,.9,'flat',0xa8a48c,x,.15,z,[0,f.theta,0]);
    }
    box(f.len,1.0,.62,'flat',0x9e9a83,...f.point(0,.5,0),[0,f.theta,0]);
    // Continuous plaster backing up to the roof eave: no open horizontal slit.
    box(f.len,10.25,.5,'plaster',PLASTER,...f.point(0,6.125,0),[0,f.theta,0]);
    // exposed frame: posts, rails, knee braces on both faces
    for(const face of [-1,1]){
      const v=face*.30;
      for(let i=0;i<=4;i++){
        const u=-f.len/2+i*f.len/4;
        box(.40,9.6,.22,'wood',WALNUT,...f.point(u,4.9,v),[0,f.theta,0]);
        box(.30,2.0,.22,'wood',WALNUT,...f.point(u,10.2,v),[0,f.theta,0]);
      }
      for(const y of [1.0,4.3,8.7,9.9,11.5])box(f.len,.26,.22,'wood',WALNUT,...f.point(0,y,v),[0,f.theta,0]);
      for(let i=0;i<4;i++){
        const u=-f.len/2+(i+.5)*f.len/4,du=f.len/8-.24;
        beamBetween(f.point(u-du,1.1,v),f.point(u+du,4.2,v),.15,'wood',WALNUT);
        beamBetween(f.point(u+du,1.1,v),f.point(u-du,4.2,v),.15,'wood',WALNUT);
      }
      // three framed windows per face instead of two, smaller and deeper
      for(const u of [-f.len*.28,0,f.len*.28]){
        box(1.85,2.15,.14,'wood',WALNUT,...f.point(u,6.6,v+face*.13),[0,f.theta,0]);
        box(1.62,1.92,.08,'flat',GLAZE,...f.point(u,6.6,v+face*.19),[0,f.theta,0]);
        box(.09,1.92,.09,'wood',ASH,...f.point(u,6.6,v+face*.23),[0,f.theta,0]);
        box(1.62,.09,.09,'wood',ASH,...f.point(u,6.6,v+face*.23),[0,f.theta,0]);
        box(.42,.42,.04,'flat',0xd4d2a6,...f.point(u-.40,7.05,v+face*.24),[0,f.theta,0]);
      }
    }
    // masonry band along the base
    for(let i=0;i<Math.round(f.len/.8);i++){
      const u=-f.len/2+(i+.5)*f.len/Math.round(f.len/.8);
      box(f.len/Math.round(f.len/.8)-.06,.72,.10,'flat',i%3?0x9e9a83:0xe8d9ba,...f.point(u,.62,.40),[0,f.theta,0]);
    }
  }
  // connector bay between the wings
  box(8,1.0,.72,'flat',0x9e9a83,69,.5,12.5);
  box(8,10.25,.5,'plaster',PLASTER,69,6.125,12.5);
  for(const x of [65,69,73]){
    box(.42,9.6,.24,'wood',WALNUT,x,4.9,12.85);box(.42,9.6,.24,'wood',WALNUT,x,4.9,12.15);
  }
  for(const y of [1.0,4.3,8.7,9.9,11.5]){box(8,.26,.22,'wood',WALNUT,69,y,12.86);box(8,.26,.22,'wood',WALNUT,69,y,12.14)}
  // Side return walls close the U at x=43 and x=95 (the two short contract
  // walls SANCTUARY_GYM_WALLS[3..4]). They carry the timber frame, two tall
  // windows, a stone coping and buttresses so the courtyard reads enclosed
  // from the gate without walling off the south approach.
  for(const [wx,face] of [[43,-1],[95,1]]){
    const zc=23.75,len=10.5;
    box(len,1.0,.66,'flat',0x9e9a83,wx,.5,zc,[0,Math.PI/2,0]);
    box(len,10.25,.52,'plaster',PLASTER,wx,6.125,zc,[0,Math.PI/2,0]);
    for(const z of [18.5,21.1,23.7,26.3,29]){
      box(.32,9.5,.22,'wood',WALNUT,wx+face*.30,4.9,z,[0,Math.PI/2,0]);
      box(.26,1.9,.20,'wood',WALNUT,wx+face*.30,10.2,z,[0,Math.PI/2,0]);
    }
    for(const y of [1.0,4.3,8.7,9.9])box(len,.24,.20,'wood',WALNUT,wx+face*.30,y,zc,[0,Math.PI/2,0]);
    for(const z of [22.4,25.0]){
      box(1.7,2.05,.14,'wood',WALNUT,wx+face*.34,6.6,z,[0,Math.PI/2,0]);
      box(1.46,1.82,.08,'flat',GLAZE,wx+face*.40,6.6,z,[0,Math.PI/2,0]);
      box(.09,1.82,.09,'wood',ASH,wx+face*.44,6.6,z,[0,Math.PI/2,0]);
      box(1.46,.09,.09,'wood',ASH,wx+face*.44,6.6,z,[0,Math.PI/2,0]);
    }
    box(len+.5,.26,.88,'flat',0xd8cfb6,wx,10.96,zc,[0,Math.PI/2,0]);
    box(len+.5,.14,.70,'flat',0xe8dcc0,wx,11.17,zc,[0,Math.PI/2,0]);
    for(const z of [19.1,28.4]){
      box(1.0,.90,1.10,'flat',0xb9b49a,wx+face*.30,.45,z);
      box(1.16,.14,1.26,'flat',0xd8cfb6,wx+face*.30,.97,z);
    }
    // The court-facing return is finished too: continuous studs, sills,
    // recessed glazing and diagonal bracing under the new side roofs.
    const inside=wx-face*.31;
    for(const z of [18.5,21.1,23.7,26.3,29])box(.22,10.5,.30,'wood',WALNUT,inside,5.4,z);
    for(const y of [1,4.3,8.7,10.55])box(.22,.24,len,'wood',WALNUT,inside,y,zc);
    for(const z of [22.4,25]){
      box(.14,2.15,1.85,'wood',WALNUT,inside-face*.12,6.6,z);
      box(.08,1.92,1.62,'flat',GLAZE,inside-face*.20,6.6,z);
      box(.08,1.92,.09,'wood',ASH,inside-face*.25,6.6,z);
      box(.08,.09,1.62,'wood',ASH,inside-face*.25,6.6,z);
      box(.40,.15,2.06,'flat',0xd8cfb6,inside-face*.12,5.48,z);
    }
    for(const z of [19.8,22.4,25,27.6])beamBetween([inside,1.2,z-1],[inside,4.1,z+1],.12,'wood',WALNUT);
  }
  // A continuous U-shaped pitched roof, including both side returns and the
  // central connector. Mitered contours share vertices at every hip/valley.
  const spine=[[43,29],[43,18.5],[65,12.5],[73,12.5],[95,18.5],[95,29]];
  const normals=spine.slice(1).map((p,i)=>{const a=spine[i],l=Math.hypot(p[0]-a[0],p[1]-a[1]);return [(p[1]-a[1])/l,-(p[0]-a[0])/l]});
  function contour(d,y){return spine.map((p,i)=>{const a=normals[Math.max(0,i-1)],b=normals[Math.min(i,normals.length-1)],den=1+a[0]*b[0]+a[1]*b[1];return [p[0]+d*(a[0]+b[0])/den,y,p[1]+d*(a[1]+b[1])/den]})}
  function panel(a,b,c,d,mat,col){
    const g=new T.BufferGeometry();
    const up=new T.Vector3().subVectors(new T.Vector3(...b),new T.Vector3(...a)).cross(new T.Vector3().subVectors(new T.Vector3(...c),new T.Vector3(...a))).y;
    const pts=up<0?[a,c,b,a,d,c]:[a,b,c,a,c,d];
    g.setAttribute('position',new T.Float32BufferAttribute(pts.flat(),3));
    g.setAttribute('uv',new T.Float32BufferAttribute(pts.flatMap(p=>[p[0]/2,p[2]/2]),2));
    put(g,mat,col,0,0,0);
  }
  const inner=contour(-1,10.65),ridge=contour(2.5,13.5),outer=contour(6,10.65),back=contour(5,0);
  for(let i=0;i<5;i++){
    for(const [edge,sign] of [[inner,-1],[outer,1]]){
      // Closed roof skin plus individually lapped tile courses: texture and
      // geometry agree on the slope; no open slots between decorative strips.
      panel(edge[i],edge[i+1],ridge[i+1],ridge[i],'roof',0xd5c2a7);
      for(let k=0;k<10;k++){
        const point=(j,t,dy)=>edge[j].map((v,n)=>v+(ridge[j][n]-v)*t+(n===1?dy:0));
        const t=k/10,t1=Math.min(1,(k+1.08)/10);
        panel(point(i,t,.035),point(i+1,t,.035),point(i+1,t1,.055),point(i,t1,.055),'roof',k%3?0xd8c2a0:0xc3aa8d);
        beamBetween(point(i,t,.035),point(i+1,t,.035),.035,'flat',0x786449);
      }
      beamBetween(edge[i],edge[i+1],.16,'wood',WALNUT);
      const count=Math.ceil(new T.Vector3(...edge[i]).distanceTo(new T.Vector3(...edge[i+1]))/1.5);
      for(let j=0;j<=count;j++){
        const lerp=(arr)=>arr[i].map((v,n)=>v+(arr[i+1][n]-v)*j/count);
        const a=lerp(edge),r=lerp(ridge);a[1]-=.20;r[1]-=.20;
        beamBetween(a,r,.075,'wood',WALNUT);
      }
    }
    beamBetween(ridge[i],ridge[i+1],.20,'roof',0xe0c7a3);
    // An actual rear wall and stone footing support the far eave.
    const a=back[i],b=back[i+1],f=wingFrame([a[0],a[2],b[0],b[2]]);
    box(f.len,11.25,.48,'plaster',PLASTER,...f.point(0,5.625,0),[0,f.theta,0]);
    box(f.len,.8,.8,'flat',0xa8a48c,...f.point(0,.4,0),[0,f.theta,0]);
    for(let j=0;j<=Math.ceil(f.len/3);j++)box(.28,10.9,.60,'wood',WALNUT,...f.point(-f.len/2+j*f.len/Math.ceil(f.len/3),5.45,0),[0,f.theta,0]);
    for(const y of [1,4.3,8.7,10.7])box(f.len,.22,.59,'wood',WALNUT,...f.point(0,y,0),[0,f.theta,0]);
  }
  for(const i of [0,5]){
    // End gables close the visible ends rather than leaving paper-thin roofs.
    const a=inner[i],r=ridge[i],b=outer[i];
    panel([a[0],.5,a[2]],a,b,[b[0],.5,b[2]],'plaster',PLASTER);
    panel(a,r,b,b,'plaster',PLASTER);
    for(const [u,v] of [[a,r],[r,b],[a,b]])beamBetween(u,v,.16,'wood',WALNUT);
    beamBetween([r[0],.5,r[2]],r,.18,'wood',WALNUT);
    for(const edge of [a,b])beamBetween([edge[0],.5,edge[2]],edge,.18,'wood',WALNUT);
  }

  /* Veranda: a lower shed roof on the court side, turned posts, rails and balusters.
     This is the single biggest silhouette win - it turns a wall into a building. */
  for(const seg of [WALLS[0],WALLS[1],WALLS[2]]){
    const f=wingFrame(seg),depth=2.7,drop=.95;
    const n=Math.max(2,Math.round(f.len/3.2));
    for(let i=0;i<=n;i++){
      const u=-f.len/2+i*f.len/n,p=f.point(u,0,depth);
      post(p[0],0,p[2],3.06,'wood',ASH);
      box(.30,.30,.30,'flat',0x8d8974,p[0],.15,p[2]);              // stone pad
      shadow(p[0],p[2],.42,.42,.22);
      // knee braces from the post head out to the veranda beam
      const [bx,,bz]=f.point(u,0,depth-.62);
      beamBetween([p[0],2.32,p[2]],[bx,2.80,bz],.075,'wood',WALNUT);
      beamBetween([bx,2.80,bz],[p[0],2.80,p[2]],.06,'wood',WALNUT);
    }
    // veranda beam + rail
    box(f.len+.2,.26,.24,'wood',WALNUT,...f.point(0,2.86,depth),[0,f.theta,0]);
    box(f.len+.2,.14,.16,'wood',OAK,...f.point(0,1.05,depth),[0,f.theta,0]);
    for(let i=0;i<Math.round(f.len/1.05);i++){
      const u=-f.len/2+(i+.5)*f.len/Math.round(f.len/1.05);
      lathe([[0,0],[.055,0],[.075,.30],[.055,.62],[.09,.66],[.09,.74],[0,.74]],7,'wood',ASH,...f.point(u,.30,depth),[0,f.theta,0]);
    }
    // One continuous canopy, seated on the 3.06 m posts rather than floating
    // at the upper wall. Roof texture supplies the detail without open strips.
    const top=3.80,bot=3.06,ang=Math.atan2(top-bot,depth);
    box(f.len+.4,.14,Math.hypot(depth,top-bot)+.28,'roof',0xcbb08a,...f.point(0,(top+bot)/2,depth/2),[ang,f.theta,0,'YXZ']);
    box(f.len+.4,.22,.20,'wood',WALNUT,...f.point(0,bot-.11,depth),[0,f.theta,0]);
    box(f.len+.4,.18,.20,'wood',WALNUT,...f.point(0,top-.14,0),[0,f.theta,0]);
  }
}
function buildGate(){
  // two heavy gate posts and a hanging board over the south opening
  for(const x of [GATE.x1,GATE.x2]){
    box(.62,.5,.62,'flat',0x8d8974,x,.25,GATE.z);
    post(x,0,GATE.z,6.85,'wood',WALNUT);
    box(.5,.5,.5,'flat',0x8d8974,x,.25,GATE.z);
    shadow(x,GATE.z,.62,.62,.30);
    // brass finial
    lathe([[0,0],[.16,0],[.16,.10],[.05,.30],[.16,.34],[.16,.44],[0,.50]],8,'flat',0xc9a227,x,6.80,GATE.z);
  }
  box(GATE.x2-GATE.x1+1.1,.32,.44,'wood',WALNUT,(GATE.x1+GATE.x2)/2,6.80,GATE.z);
  for(const [x,s] of [[GATE.x1,1],[GATE.x2,-1]])beamBetween([x,5.55,GATE.z],[x+s*1.1,6.64,GATE.z],.12,'wood',OAK);
  /* Balustraded fence wings fill the two contract fence runs either side of the
     opening (SANCTUARY_GYM_FENCES), so the gate is part of a facade, not two
     lone posts in a field. */
  for(const [x1,x2] of [[45,62],[76,93]]){
    box(x2-x1,.34,.44,'flat',0x9e9a83,(x1+x2)/2,.17,GATE.z);
    box(x2-x1,.12,.34,'flat',0xd8cfb6,(x1+x2)/2,.72,GATE.z);
    box(x2-x1,.10,.26,'wood',OAK,(x1+x2)/2,1.06,GATE.z);
    for(let x=x1+.55;x<x2;x+=.92){
      lathe([[0,0],[.07,0],[.10,.28],[.07,.58],[.12,.62],[.12,.74],[0,.74]],7,'wood',ASH,x,.30,GATE.z);
      shadow(x,GATE.z,.16,.16,.20);
    }
    for(const x of [x1,x2]){
      box(.42,1.22,.42,'wood',WALNUT,x,.61,GATE.z);
      box(.54,.10,.54,'flat',0xd8cfb6,x,1.28,GATE.z);
      shadow(x,GATE.z,.30,.30,.24);
    }
  }
  // worn threshold slabs under the opening
  box(GATE.x2-GATE.x1,.14,1.10,'flat',0xd8cfb6,(GATE.x1+GATE.x2)/2,.07,GATE.z+.34);
  box(GATE.x2-GATE.x1,.10,.36,'flat',0xc6bd9f,(GATE.x1+GATE.x2)/2,.05,GATE.z+.98);
  // sign board, iron brackets, chain
  const sign=canvasTex(1024,256,(g,w,h)=>{
    g.fillStyle='#e7d6ab';g.fillRect(0,0,w,h);
    g.strokeStyle='#64432a';g.lineWidth=16;g.strokeRect(10,10,w-20,h-20);
    g.strokeStyle='#c9a227';g.lineWidth=4;g.strokeRect(30,30,w-60,h-60);
    g.fillStyle='#4a2d1d';g.font='bold 108px Georgia,serif';g.textAlign='center';g.textBaseline='middle';
    g.fillText('DIGIPET GYM',w/2,h/2-6,900);
    g.fillStyle='#8a6a3a';g.font='italic 34px Georgia,serif';g.fillText('SANCTUARY TRAINING HALL',w/2,h/2+62,900);
  });
  const board=new T.Mesh(new T.PlaneGeometry(6.4,.62*6.4/2.4),new T.MeshBasicMaterial({map:sign,side:T.DoubleSide}));
  board.position.set((GATE.x1+GATE.x2)/2,5.65,GATE.z+.05);scene.add(board);
  box(6.7,.14,.18,'wood',WALNUT,(GATE.x1+GATE.x2)/2,6.48,GATE.z);
  box(6.7,.12,.18,'wood',WALNUT,(GATE.x1+GATE.x2)/2,4.82,GATE.z);
  for(const x of [65.95,72.05])beamBetween([x,6.66,GATE.z],[x,6.48,GATE.z],.04,'flat',0x3a3f3b);
}

/* ---- 6. props ----------------------------------------------------------------------------- */
const IRON=0x3d4540,BRASS=0xc9a227,ROPE=0xb8a27a,CANVAS=0xe6dcc6,LEATHER=0x8a6547,STRAW=0xc9b071;

function sleeperPlatform(x,z,w=2.9,d=2.6){
  // stone plinth, then three board sleepers with reveals, all resting on it
  box(w,.12,d,'flat',0x8d8974,x,.06,z);
  for(let i=0;i<3;i++)box(w,.10,.72,'board',0x9c7448,x,.17,z-d/2+.46+i*.84);
  box(w-.1,.06,.10,'flat',IRON,x,.13,z-d/2+.05);
  shadow(x,z,w*.62,d*.62,.34);
  // a stone weight on the platform edge, resting on the boards
  lathe([[0,0],[.30,0],[.34,.16],[.26,.34],[.26,.46],[.12,.5],[0,.5]],10,'flat',0x7d7a6c,x+w*.34,.22,z+d*.22);
  lathe([[0,0],[.20,0],[.22,.10],[.16,.20],[.16,.26],[0,.28]],8,'flat',0x6b6759,x+w*.34,.72,z+d*.22);
}
function weightRack(x1,x2,z){
  for(const x of [x1,x2]){
    box(.30,3.0,.30,'wood',WALNUT,x,1.5,z);
    box(.30,.16,1.3,'wood',WALNUT,x,.08,z+.45);       // floor foot
    beamBetween([x,1.35,z],[x,.20,z+1.0],.06,'wood',WALNUT); // diagonal brace
  }
  for(const y of [.85,1.55,2.25]){
    box(x2-x1,.14,.16,'wood',OAK,(x1+x2)/2,y,z+.02);
    const n=9;
    for(let i=0;i<n;i++){
      if(y===1.55&&i===4)continue;                     // one slot emptied
      const x=x1+.55+i*(x2-x1-.9)/(n-1),r=.22+(i%3)*.06;
      lathe([[0,0],[r,0],[r,.10],[r*.92,.16],[0,.16]],12,'flat',0x4a514b,x,y+.07,z+.02,[Math.PI/2,0,0]);
      lathe([[0,0],[r*.28,0],[r*.28,.18],[0,.18]],10,'flat',IRON,x,y+.16,z+.02);
    }
  }
  shadow((x1+x2)/2,z,1.2,.5,.34);
  // chalk bowl on a stool
  for(const [dx,dz] of [[-.5,-.45],[.5,-.45],[-.5,.45],[.5,.45]])beamBetween([x1-.7+dx,0,z+1.1+dz],[x1-.7+dx*.6,1.05,z+1.1+dz*.6],.05,'wood',WALNUT);
  lathe([[0,0],[.34,0],[.46,.22],[.46,.30],[0,.30]],10,'flat',0xd8c9a8,x1-.7,1.05,z+1.1);
  lathe([[0,0],[.30,0],[.30,.04],[0,.04]],10,'flat',0xf2ece0,x1-.7,1.32,z+1.1);
}
function strikeDummy(x,z){
  box(.9,.12,.9,'board',0x9c7448,x,.06,z);
  cyl(.40,.50,.10,10,'flat',0x5b605a,x,.16,z);
  // spring
  for(let i=0;i<4;i++)put(new T.TorusGeometry(.16,.035,4,10),'flat',IRON,x,.22+i*.10,z,[Math.PI/2,0,0]);
  cyl(.30,.34,.55,10,'wood',ASH,x,.70,z);
  lathe([[0,0],[.44,0],[.52,.18],[.52,1.05],[.44,1.30],[.26,1.42],[0,1.42]],12,'flat',LEATHER,x,.97,z);
  for(const y of [1.45,1.75,2.05])put(new T.TorusGeometry(.44,.045,4,12),'flat',ROPE,x,y,z,[Math.PI/2,0,0]);
  box(.62,.34,.50,'flat',0x6f4f37,x,2.02,z);
  shadow(x,z,.8,.8,.36);
}
function kettlebell(x,z,tilt){
  put(new T.SphereGeometry(.34,12,8),'flat',0x6d7268,x,.34,z);
  put(new T.TorusGeometry(.20,.05,5,10),'flat',IRON,x,.66,z,[tilt||0,0,.2]);
  shadow(x,z,.5,.5,.28);
}
function sandbagGantry(x1,x2,z){
  for(const x of [x1,x2]){
    box(.34,4.35,.34,'wood',WALNUT,x,2.17,z);
    box(.34,.16,1.5,'wood',WALNUT,x,.08,z);           // ground skid
    // knee brace in the x-y plane, from the post up into the beam
    const inward=x===x1?.62:-.62;
    beamBetween([x+inward,3.28,z],[x,4.12,z],.09,'wood',WALNUT);
  }
  box(x2-x1+.6,.30,.34,'wood',WALNUT,(x1+x2)/2,4.30,z);
  shadow((x1+x2)/2,z,1.6,.55,.32);
  const bags=[[x1+.9,1.55],[(x1+x2)/2,1.95],[x2-.9,1.35]];
  for(const [x,base] of bags){
    const beamY=4.20,h=1.55,r=.40,top=base+h;
    // continuous chain from the beam down to the swivel, with links threaded on it
    beamBetween([x,beamY,z],[x,top,z],.018,'flat',IRON);
    for(let y=beamY-.08;y>top+.10;y-=.13)put(new T.TorusGeometry(.055,.016,3,6),'flat',IRON,x,y,z,[0,0,Math.PI/2]);
    box(.14,.14,.14,'flat',IRON,x,top+.07,z);
    lathe([[0,0],[r,0],[r*.94,h*.16],[r*1.02,h*.5],[r*.9,h*.86],[r*.55,h],[0,h]],12,'flat',0x9b7a58,x,base,z);
    for(const yy of [base+.55,base+.95,base+1.35])put(new T.TorusGeometry(r*.99,.028,4,12),'flat',0xe0d3bd,x,yy,z,[Math.PI/2,0,0]);
    // patches
    box(.22,.26,.02,'flat',0xa98763,x+.16,base+.75,z+r*.98,[0,0,.2]);
    if(base<1.5)box(.30,.30,.06,'flat',0xc9b071,x-.10,base+.12,z+.34,[0,0,.1]);
  }
  // sand spill + bucket under the patched bag
  for(let i=0;i<9;i++){const a=i/9*Math.PI*2;put(new T.SphereGeometry(.10,5,4),'flat',0xcdb98c,x2-1.4+Math.cos(a)*.6,.10,z-.55+Math.sin(a)*.5)}
  cyl(.26,.22,.42,10,'wood',OAK,x2-1.4,.21,z-.9);
  shadow(x2-1.4,z-.7,.7,.6,.24);
}
function guardPost(x,z){
  box(.8,.16,.8,'flat',0x8d8974,x,.08,z);
  box(.62,3.3,.62,'board',0x9c7448,x,1.73,z);
  for(let i=0;i<9;i++)box(.70,.10,.70,'flat',ROPE,x,.35+i*.34,z,[0,i*.05,0]);
  box(.70,.22,.70,'flat',0xa98763,x,1.35,z);
  shadow(x,z,.62,.62,.30);
}
function bucklerRack(x,z,ry){
  /* A floor-standing rack: two legs, a rail, and three bucklers hooked over it. */
  for(const dx of [-1.5,1.5]){
    box(.18,3.0,.18,'wood',WALNUT,x+Math.cos(ry)*dx,1.68,z-Math.sin(ry)*dx,[0,ry,0]);
    box(.46,.10,.46,'flat',0x8d8974,x+Math.cos(ry)*dx,.05,z-Math.sin(ry)*dx,[0,ry,0]);
  }
  box(3.2,.2,.18,'wood',WALNUT,x,3.15,z,[0,ry,0]);
  box(3.2,.10,.10,'flat',IRON,x,2.95,z,[0,ry,0]);
  for(const [dx,h,rot] of [[-1.05,2.4,.1],[0,2.95,-.14],[1.05,2.55,.18]]){
    const px=x+Math.cos(ry)*dx,pz=z-Math.sin(ry)*dx;
    put(new T.TorusGeometry(.42,.05,5,14),'flat',BRASS,px,h,pz,[Math.PI/2,ry,0]);
    put(new T.SphereGeometry(.44,14,10),'flat',0x94603f,px,h,pz,[0,ry,rot]);
    put(new T.SphereGeometry(.12,8,6),'flat',BRASS,px,h,pz+.02,[0,ry,0]);
    box(.10,.36,.10,'flat',IRON,px,h+.55,pz,[0,ry,0]);
  }
}
function hurdle(x,z,w,h){
  for(const dx of [-w/2,w/2]){
    box(.15,h,.15,'wood',OAK,x+dx,h/2,z);
    box(.15,.15,1.0,'wood',OAK,x+dx,.06,z);
  }
  box(w,.16,.16,'wood',ASH,x,h,z);
  for(let i=0;i<4;i++)box(w/5,.18,.20,'flat',i%2?0xe8dcc0:0xb0684f,x-w/2+w/10+i*w/5,h,z);
  shadow(x,z,w*.55,.45,.22);
}
function vaultBox(x,z){
  box(2.4,.9,1.5,'board',0x9c7448,x,.45,z);
  box(2.4,.12,1.5,'flat',LEATHER,x,.95,z);
  for(const dx of [-.85,.85])box(.14,.9,.14,'wood',WALNUT,x+dx,.45,z+.78);
  shadow(x,z,1.2,.8,.32);
}
function balanceBeam(x1,x2,z){
  for(const x of [x1,x1+(x2-x1)/2,x2])box(.22,.5,.22,'wood',WALNUT,x,.25,z);
  box(x2-x1,.16,.34,'board',0x9c7448,(x1+x2)/2,.58,z);
  box(x2-x1,.05,.36,'flat',0xb59b74,(x1+x2)/2,.67,z);
  shadow((x1+x2)/2,z,(x2-x1)*.45,.35,.20);
}
function bellPost(x,z){
  box(.7,.14,.7,'flat',0x8d8974,x,.07,z);
  post(x,0,z,2.9,'wood',WALNUT);
  box(1.5,.18,.18,'wood',WALNUT,x+.75,2.78,z);
  beamBetween([x+.05,2.74,z],[x+1.45,2.74,z],.03,'flat',IRON);
  lathe([[0,.62],[.30,.66],[.34,.30],[.26,0],[.16,.05],[.16,.14],[0,.14]],12,'flat',BRASS,x+.72,1.92,z);
  box(.09,.42,.09,'flat',IRON,x+.72,1.55,z);
  shadow(x,z,.5,.5,.24);
}
function archeryButt(x,z){
  box(1.9,.28,1.0,'wood',WALNUT,x,.14,z);
  for(const dx of [-.65,.65])beamBetween([x+dx,.28,z+.3],[x+dx,1.5,z-.25],.07,'wood',WALNUT);
  put(new T.CylinderGeometry(.95,.95,.5,18),'flat',STRAW,x,1.55,z,[Math.PI/2,0,0]);
  put(new T.CylinderGeometry(.92,.92,.06,18),'flat',0xd6c288,x,1.55,z+.27,[Math.PI/2,0,0]);
  for(const [r,c] of [[.62,0xb0684f],[.34,0x5f7d95],[.12,0xe8dcc0]])put(new T.CylinderGeometry(r,r,.04,18),'flat',c,x,1.55,z+.30,[Math.PI/2,0,0]);
  // spent arrows
  for(const [dx,dy,rot] of [[-.30,.22,.10],[.16,-.14,-.22],[.05,.34,.04]])
    beamBetween([x+dx,1.55+dy,z+.30],[x+dx*.9,1.55+dy+.34,z+1.5],.022,'wood',0xd8c9a8);
  shadow(x,z,1.1,.7,.34);
}
function medDeck(x,z,w,d){
  box(w,.18,d,'board',0x9c7448,x,.09,z);
  box(w-.2,.06,d-.2,'flat',0xcfc09a,x,.22,z);
  // tatami edge bands
  box(w,.05,.14,'flat',0x6f5a3d,x,.26,z-d/2+.1);
  box(w,.05,.14,'flat',0x6f5a3d,x,.26,z+d/2-.1);
  for(const dx of [-w/4,w/4])box(.05,.05,.14,'flat',0x8a7350,x+dx,.26,z+d/2-.1);
  shadow(x,z,w*.58,d*.58,.26);
  // low table + cushion + water bowl
  box(1.1,.10,.8,'wood',WALNUT,x-.9,.62,z);
  for(const [dx,dz] of [[-.45,-.30],[.45,-.30],[-.45,.30],[.45,.30]])box(.08,.38,.08,'wood',WALNUT,x-.9+dx,.40,z+dz);
  box(.62,.10,.62,'flat',0x8e5f4a,x+1.0,.28,z);
  lathe([[0,0],[.30,0],[.36,.16],[.36,.24],[.30,.30],[0,.30]],12,'flat',0x8d9a92,x+.2,.26,z+.9);
  lathe([[0,0],[.26,0],[.26,.03],[0,.03]],12,'flat',0x7fb0ad,x+.2,.52,z+.9);
}
/* Festoon lights: a catenary cable pinned to real eave brackets, with paper
   lanterns and brass caps. a/b are [x,z] anchors. */
function lanternString(a,b,y,sagDepth){
  const n=Math.max(2,Math.round(Math.hypot(b[0]-a[0],b[1]-a[1])/3.4)),dip=sagDepth??.46;
  const P=t=>[a[0]+(b[0]-a[0])*t,y-Math.sin(Math.PI*t)*dip,a[1]+(b[1]-a[1])*t];
  for(let i=0;i<n;i++)beamBetween(P(i/n),P((i+1)/n),.014,'flat',0x6b5a44);
  for(const e of [a,b])for(const dz of [0])box(.10,.10,.10,'flat',IRON,e[0],y,e[1]);
  for(let i=1;i<n;i++){
    const p=P(i/n),drop=.30;
    beamBetween([p[0],p[1],p[2]],[p[0],p[1]-drop,p[2]],.008,'flat',0x6b5a44);
    const top=p[1]-drop;
    lathe([[0,0],[.14,0],[.24,.12],[.27,.32],[.24,.52],[.14,.64],[0,.64]],12,'flat',0xf2dca2,p[0],top-.64,p[2]);
    put(new T.SphereGeometry(.09,8,6),'flat',0xe8c37a,p[0],top-.30,p[2]);
    box(.20,.05,.20,'flat',BRASS,p[0],top-.66,p[2]);
    box(.20,.05,.20,'flat',BRASS,p[0],top,p[2]);
  }
}
function banner(x,z,text,css){
  const tex=canvasTex(256,384,(g,w,h)=>{
    g.fillStyle=css;g.fillRect(0,0,w,h);
    const grd=g.createLinearGradient(0,0,w,0);
    grd.addColorStop(0,'rgba(0,0,0,.18)');grd.addColorStop(.4,'rgba(255,255,255,0)');grd.addColorStop(1,'rgba(0,0,0,.22)');
    g.fillStyle=grd;g.fillRect(0,0,w,h);
    g.strokeStyle='rgba(246,236,210,.85)';g.lineWidth=7;g.strokeRect(16,16,w-32,h-32);
    g.save();g.translate(w/2,h*.38);g.fillStyle='rgba(246,236,210,.9)';
    g.beginPath();g.arc(0,0,52,0,Math.PI*2);g.fill();g.restore();
    g.fillStyle='rgba(240,228,198,.96)';g.font='bold 40px Georgia,serif';g.textAlign='center';g.textBaseline='middle';
    g.fillText(text,w/2,h*.72,w-40);
    g.fillStyle='rgba(0,0,0,.18)';g.fillRect(0,h-26,w,26);
  });
  /* Self-supporting banner mast: stone base, turned mast, iron crossarm and
     brass finials. The cloth hangs from real hardware instead of mid-air. */
  box(.50,.34,.50,'flat',0x8d8974,x,.17,z);
  post(x,.30,z,5.65,'wood',WALNUT);
  lathe([[0,0],[.10,0],[.10,.12],[.04,.22],[.12,.30],[.12,.40],[0,.46]],8,'flat',BRASS,x,5.90,z);
  box(1.94,.11,.11,'wood',ASH,x,5.76,z);
  for(const dx of [-.86,.86]){
    box(.06,.30,.06,'flat',IRON,x+dx,5.59,z);
    put(new T.SphereGeometry(.055,6,5),'flat',BRASS,x+dx,5.43,z);
  }
  const m=new T.Mesh(new T.PlaneGeometry(1.55,2.20),new T.MeshBasicMaterial({map:tex,side:T.DoubleSide}));
  m.position.set(x,4.6,z+.005);scene.add(m);
  box(1.66,.06,.06,'wood',ASH,x,5.70,z);
  box(1.70,.06,.08,'wood',ASH,x,3.50,z);
  shadow(x,z,.44,.44,.26);
  return m;
}
function noticeBoard(x,z,ry){
  for(const dx of [-1.05,1.05])box(.14,2.4,.14,'wood',WALNUT,x+Math.cos(ry)*dx,1.2,z-Math.sin(ry)*dx);
  box(2.5,1.7,.14,'wood',WALNUT,x,1.65,z,[0,ry,0]);
  box(2.24,1.46,.05,'flat',0x6d5a42,x,1.65,z+.09,[0,ry,0]);
  for(let i=0;i<7;i++){
    const dx=-.92+ (i%3)*.72, dy=.62-Math.floor(i/3)*.52;
    box(.56,.42,.02,'flat',0xf2e7cc,x+Math.cos(ry)*dx,1.65+dy,z+.12-Math.sin(ry)*dx,[0,ry,0]);
    box(.10,.10,.02,'flat',i%2?0xb0684f:0xc9a227,x+Math.cos(ry)*dx,1.65+dy+.17,z+.135-Math.sin(ry)*dx,[0,ry,0]);
  }
  // a torn sheet hanging loose
  box(.5,.30,.02,'flat',0xf2e7cc,x+.75,1.18,z+.13,[0,ry,.22]);
  shadow(x,z,1.35,.5,.24);
}
function lectern(x,z,ry){
  box(.9,.12,.7,'wood',WALNUT,x,.06,z,[0,ry,0]);
  box(.22,1.15,.22,'wood',WALNUT,x,.62,z,[0,ry,0]);
  box(1.15,.10,.78,'wood',OAK,x,1.22,z,[0,ry,-.22]);
  box(1.0,.05,.64,'flat',0xe9dcbc,x,1.30,z,[0,ry,-.22]);
  // ledger, bell, coin dish, mug
  box(.44,.05,.32,'flat',0xf6efd8,x-.24,1.34,z,[0,ry,-.22]);
  box(.44,.02,.32,'flat',0xc9bda0,x-.24,1.31,z,[0,ry,-.22]);
  lathe([[0,0],[.12,0],[.16,.10],[.16,.16],[0,.16]],10,'flat',BRASS,x+.30,1.30,z,[0,0,0]);
  lathe([[0,0],[.19,0],[.21,.05],[.19,.08],[0,.08]],12,'flat',BRASS,x+.62,1.30,z);
  cyl(.09,.08,.14,10,'flat',0xe8dcc0,x+.62,1.36,z);
  cyl(.07,.06,.12,10,'flat',0xd8c8a8,x+.80,1.34,z);
  shadow(x,z,.7,.5,.28);
}
function trophyCase(x,z){
  box(2.2,.9,.55,'wood',WALNUT,x,.45,z);
  box(2.2,.10,.6,'wood',OAK,x,.92,z);
  box(2.1,1.3,.06,'flat',0x9fb4a8,x,1.6,z-.24);
  box(.09,1.3,.55,'wood',WALNUT,x-1.05,1.6,z-.02);
  box(.09,1.3,.55,'wood',WALNUT,x+1.05,1.6,z-.02);
  box(2.2,.10,.6,'wood',WALNUT,x,2.28,z);
  // cups
  for(const [dx,h] of [[-.62,.46],[.02,.34]]){
    lathe([[0,0],[.15,0],[.11,.06],[.06,.10],[.19,.16],[.23,.34],[.19,.40],[0,.40]],12,'flat',BRASS,x+dx,1.00,z);
    box(.06,h*.2,.06,'flat',BRASS,x+dx,1.00+h*.42,z);
  }
  box(.34,.26,.03,'flat',0xe8dcc0,x+.58,1.18,z-.20);
  box(.30,.22,.03,'flat',0x8a7a66,x+.58,1.18,z-.18);
  shadow(x,z,1.2,.45,.28);
}
function barrel(x,z){
  lathe([[0,0],[.42,0],[.48,.22],[.50,.52],[.48,.82],[.42,1.02],[0,1.02]],12,'board',0x9c7448,x,.0,z);
  for(const y of [.18,.84])put(new T.TorusGeometry(.49,.045,4,14),'flat',IRON,x,y,z,[Math.PI/2,0,0]);
  lathe([[0,0],[.36,0],[.36,.03],[0,.03]],12,'flat',0x7fb0ad,x,.98,z);
  shadow(x,z,.55,.55,.28);
  // ladle hooked on the rim
  beamBetween([x+.44,1.02,z],[x+.58,1.28,z+.06],.018,'flat',0x6b5a44);
  put(new T.SphereGeometry(.09,8,6),'flat',0x8d9a92,x+.58,1.28,z+.06,[0,0,0]);
}
function bench(x,z,w){
  // seat on four legs, with a slatted back against the fence
  box(w,.10,.42,'board',0x9c7448,x,.46,z);
  box(w,.06,.44,'flat',0xb59b74,x,.54,z);
  for(const dx of [-w/2+.22,w/2-.22]){
    box(.14,.46,.36,'wood',WALNUT,x+dx,.23,z);
    box(.12,.62,.12,'wood',WALNUT,x+dx,.71,z-.18);
  }
  box(w-.1,.16,.06,'board',0x9c7448,x,.86,z-.18);
  box(w-.1,.12,.06,'board',0x9c7448,x,.66,z-.18);
  shadow(x,z,w*.5,.35,.22);
}
function broom(x,z,tilt){
  beamBetween([x,.02,z],[x+.42,1.5,z+.18],.028,'wood',OAK);
  box(.10,.24,.34,'flat',STRAW,x+.44,1.42,z+.18,[0,0,.12]);
}
function queuePost(x,z){
  box(.34,.10,.34,'flat',0x8d8974,x,.05,z);
  post(x,0,z,1.45,'wood',WALNUT);
  lathe([[0,0],[.12,0],[.12,.16],[.06,.22],[.16,.28],[.16,.36],[0,.42]],8,'flat',BRASS,x,1.45,z);
  shadow(x,z,.30,.30,.26);
}
function ropeSag(a,b,dip){
  const pts=[];for(let i=0;i<=8;i++){const t=i/8;pts.push([a[0]+(b[0]-a[0])*t,a[1]-Math.sin(Math.PI*t)*dip,a[2]+(b[2]-a[2])*t])}
  for(let i=0;i<8;i++)beamBetween(pts[i],pts[i+1],.035,'flat',0x8e2f28);
}

/* ---- 7. assemble the four bays -------------------------------------------------------------- */
function buildBays(){
  /* POWER - The Iron Yard: platforms, rack, dummy, chalk, towels. */
  for(const [x,z] of STATIONS.power)sleeperPlatform(x,z);
  weightRack(48.4,61.2,27.9);
  strikeDummy(47.6,34.4);
  kettlebell(58.4,33.6,.35);kettlebell(59.2,36.2,-.2);
  // towel stand: two turned uprights, a rail, and two towels over it
  for(const x of [44.3,46.2]){
    box(.34,.14,.34,'flat',0x8d8974,x,.07,30.6);
    box(.14,3.24,.14,'wood',WALNUT,x,1.62,30.6);
  }
  box(2.3,.12,.12,'wood',WALNUT,45.25,3.18,30.6);
  for(const dx of [0,.55])box(.42,.9,.05,'flat',0xd8cdb4,45.55+dx,2.67,30.62);
  shadow(45.25,30.6,.7,.4,.22);

  /* GUARD - The Wall: sandbags, guard post, bucklers, wall tool rack. */
  sandbagGantry(57.0,67.0,19.4);
  guardPost(56.2,22.6);
  bucklerRack(61.5,15.4,0);
  // tool rack pegged to the connector wall: mallets, straps, a spare shield
  box(1.7,.10,.30,'wood',WALNUT,67.8,1.02,12.86);
  box(1.7,.06,.10,'flat',IRON,67.8,1.10,12.80);
  for(const [dx,h] of [[-.62,1.35],[-.24,1.22],[.14,1.44],[.52,1.30]]){
    box(.05,.34,.05,'flat',BRASS,67.8+dx,h-.12,12.84);
    box(.14,.22,.12,'flat',0x8a6547,67.8+dx,h-.38,12.86);
  }
  put(new T.CylinderGeometry(.34,.34,.07,16),'flat',0x94603f,67.8,1.78,12.86,[Math.PI/2,0,0]);
  put(new T.TorusGeometry(.34,.035,4,14),'flat',BRASS,67.8,1.78,12.83,[Math.PI/2,0,0]);
  shadow(67.8,13.6,.7,.3,.20);

  /* AGILITY - The Run: staggered hurdles, vault, beam, bell. */
  hurdle(72.0,23.3,2.5,.90);
  hurdle(75.0,24.4,2.5,1.20);
  hurdle(78.0,23.9,2.5,1.45);
  vaultBox(80.2,28.4);
  balanceBeam(69.6,74.4,29.7);
  bellPost(81.2,21.6);
  for(const x of [72,75,78])shadow(x,26.2,.5,1.4,.14);

  /* FOCUS - The Still Pool: butts, deck, bronze bell, gravel, incense. */
  archeryButt(83.2,23.0);
  archeryButt(86.4,22.6);
  archeryButt(89.6,23.2);
  medDeck(89.4,31.0,5.2,3.6);
  // standing bronze bell
  for(const dx of [-.7,.7])box(.16,2.4,.16,'wood',WALNUT,92.2+dx,1.2,24.4);
  box(1.9,.18,.30,'wood',WALNUT,92.2,2.42,24.4);
  // the bell hangs from a crown rod; a log striker is slung in front of it
  box(.10,.92,.10,'flat',IRON,92.2,1.97,24.4);
  lathe([[0,.95],[.46,.98],[.52,.55],[.40,0],[.28,.02],[.28,.10],[0,.10]],14,'flat',BRASS,92.2,.55,24.4);
  for(const x of [91.35,93.05])beamBetween([x,2.40,24.62],[x,1.36,25.06],.025,'flat',IRON);
  cyl(.10,.10,1.9,8,'wood',0x6f5236,92.2,1.32,25.06,[0,0,Math.PI/2]);
  shadow(92.2,24.4,.8,.5,.3);
  // raked gravel bed
  box(3.4,.12,2.4,'flat',0xd6cdb3,83.0,.06,32.6);
  for(let i=0;i<7;i++)put(new T.TorusGeometry(.55+i*.20,.035,3,18),'flat',0xe4dcc2,83.0,.135,32.6,[Math.PI/2,0,0]);
  broom(84.7,33.6,-.1);
  // incense
  for(const dx of [-.5,.5])box(.10,1.25,.10,'flat',BRASS,85.6+dx,.63,30.2);
  box(1.2,.10,.36,'flat',BRASS,85.6,1.28,30.2);
  for(const dx of [-.30,0,.30])cyl(.012,.012,.34,5,'flat',0x6b5a44,85.6+dx,1.50,30.2);

  /* Entry: a check-in desk with its queue guide on the right of the opening,
     a notice board on the left fence wing and a trophy case inside the right
     one, so the gate throat itself stays clear. */
  lectern(73.2,35.0,0);
  for(const x of [70.6,72.9])queuePost(x,36.5);
  ropeSag([70.6,1.16,36.5],[72.9,1.16,36.5],.24);
  noticeBoard(52.6,37.35,0);
  trophyCase(79.4,36.8);
  barrel(64.0,32.9);
  bench(65.2,31.6,2.2);bench(72.4,31.6,2.2);
}

/* ---- 8. build everything ------------------------------------------------------------------- */
buildShell();
buildGate();
buildBays();

/* Banner masts stand clear of the training lanes, one per bay. */
banner(45.9,36.2,BAYS.power.label,BAYS.power.css);
banner(66.5,24.7,BAYS.guard.label,BAYS.guard.css);
banner(79.7,33.4,BAYS.agility.label,BAYS.agility.css);
banner(93.1,27.2,BAYS.focus.label,BAYS.focus.css);

/* Festoon lights hang from the two veranda eaves, sagging between posts. */
lanternString([44.2,20.9],[65.2,15.2],3.0,.15);
lanternString([72.8,20.9],[93.8,15.2],3.0,.15);



/* merge every batch into one mesh per material */
let triangles=0;
for(const [name,geos] of batches){
  const geo=mergeInto(geos);
  const mesh=new T.Mesh(geo,materials[name]);
  mesh.matrixAutoUpdate=false;mesh.updateMatrix();
  scene.add(mesh);
  triangles+=geo.attributes.position.count/3;
}

/* floor slab + painted court + bay decals */
const courtGeo=new T.PlaneGeometry(COURT.x2-COURT.x1,COURT.z2-COURT.z1);
const court=new T.Mesh(courtGeo,new T.MeshBasicMaterial({map:paintCourt()}));
court.rotation.x=-Math.PI/2;court.position.set((COURT.x1+COURT.x2)/2,.02,(COURT.z1+COURT.z2)/2);
scene.add(court);
for(const [key,b] of Object.entries(BAYS)){
  const mesh=new T.Mesh(new T.PlaneGeometry(b.x2-b.x1-1.1,b.z2-b.z1-1.1),
    new T.MeshBasicMaterial({map:bayDecal(b,key),transparent:true,depthWrite:false}));
  mesh.rotation.x=-Math.PI/2;
  mesh.position.set((b.x1+b.x2)/2,.035,(b.z1+b.z2)/2);
  scene.add(mesh);
}
/* ground apron: procedural meadow so the court sits in the world instead of
   on a repeated sand tile. Painted, not loaded - no new asset on disk. */
const meadow=(function(){
  const c=document.createElement('canvas');c.width=c.height=512;
  const g=c.getContext('2d');
  g.fillStyle='#9fae8b';g.fillRect(0,0,512,512);
  for(let i=0;i<240;i++){
    const r=18+Math.random()*90,x=Math.random()*512,y=Math.random()*512;
    const rg=g.createRadialGradient(x,y,0,x,y,r);
    const t=Math.random();
    rg.addColorStop(0,t>.5?'rgba(146,163,124,.22)':'rgba(178,190,150,.20)');
    rg.addColorStop(1,'rgba(0,0,0,0)');
    g.fillStyle=rg;g.beginPath();g.arc(x,y,r,0,Math.PI*2);g.fill();
  }
  for(let i=0;i<9000;i++){
    g.fillStyle=Math.random()>.5?'rgba(96,112,80,.10)':'rgba(220,226,190,.10)';
    g.fillRect(Math.random()*512,Math.random()*512,1+Math.random()*2,1+Math.random()*3);
  }
  const t=new T.CanvasTexture(c);
  t.wrapS=t.wrapT=T.RepeatWrapping;t.repeat.set(10,11);t.anisotropy=4;
  return t;
})();
const apron=new T.Mesh(new T.PlaneGeometry(180,200),new T.MeshBasicMaterial({map:meadow}));
apron.rotation.x=-Math.PI/2;apron.position.set(69,-.02,26);scene.add(apron);
/* worn dirt approach from the gate out to the field */
const approach=new T.Mesh(new T.PlaneGeometry(GATE.x2-GATE.x1+3,26),
  new T.MeshBasicMaterial({map:(function(){
    const c=document.createElement('canvas');c.width=256;c.height=512;const g=c.getContext('2d');
    g.clearRect(0,0,256,512);
    const grd=g.createLinearGradient(0,0,0,512);
    grd.addColorStop(0,'rgba(206,190,158,.92)');grd.addColorStop(.75,'rgba(206,190,158,.45)');grd.addColorStop(1,'rgba(206,190,158,0)');
    g.fillStyle=grd;g.fillRect(0,0,256,512);
    for(let i=0;i<2600;i++){g.fillStyle='rgba(150,134,104,'+(.05+Math.random()*.10)+')';g.fillRect(Math.random()*256,Math.random()*512,1+Math.random()*3,1+Math.random()*3)}
    const t=new T.CanvasTexture(c);return t;
  })(),transparent:true,depthWrite:false}));
approach.rotation.x=-Math.PI/2;approach.position.set(69,.01,39.5+13);scene.add(approach);

/* ---- 9. atmosphere: dust motes ----------------------------------------------------------------- */
const dust=(function(){
  const n=180,pos=new Float32Array(n*3),spd=new Float32Array(n);
  for(let i=0;i<n;i++){pos[i*3]=44+Math.random()*50;pos[i*3+1]=.4+Math.random()*8;pos[i*3+2]=14+Math.random()*24;spd[i]=.15+Math.random()*.4}
  const g=new T.BufferGeometry();g.setAttribute('position',new T.BufferAttribute(pos,3));
  const c=document.createElement('canvas');c.width=c.height=32;const x=c.getContext('2d');
  const rg=x.createRadialGradient(16,16,0,16,16,16);rg.addColorStop(0,'rgba(255,248,224,.95)');rg.addColorStop(1,'rgba(255,248,224,0)');
  x.fillStyle=rg;x.fillRect(0,0,32,32);
  const m=new T.PointsMaterial({size:.16,map:new T.CanvasTexture(c),transparent:true,depthWrite:false,blending:T.AdditiveBlending,opacity:.55});
  const p=new T.Points(g,m);p.userData.spd=spd;scene.add(p);return p;
})();

/* ---- 10. (removed) scale silhouettes: doors, benches and hurdles already give
   the eye its scale, and billboard blobs read as artefacts in a still. ------- */

/* ---- 11. labels, camera, input ---------------------------------------------------------------- */
const labelHost=document.getElementById('labels');
const chips=[];
if(SHOWLABELS){for(const [key,b] of Object.entries(BAYS)){
  const el=document.createElement('div');el.className='bay '+key;el.textContent=b.label;
  labelHost.append(el);chips.push({el,x:(b.x1+b.x2)/2,z:(b.z1+b.z2)/2});
}}
const VIEWS={
  over:{yaw:0,pitch:44,dist:72,target:[69,3.2,25]},
  entry:{yaw:0,pitch:12,dist:22,target:[69,2.6,33]},
  top:{yaw:0,pitch:84,dist:84,target:[69,0,26]},
  power:{yaw:-.50,pitch:32,dist:27,target:[54.5,1.6,31]},
  guard:{yaw:.32,pitch:30,dist:25,target:[61.5,1.8,20.5]},
  agility:{yaw:.55,pitch:32,dist:27,target:[75,1.5,26.5]},
  focus:{yaw:-.30,pitch:32,dist:26,target:[87,1.5,27.5]}
};
function setView(name){
  const v=VIEWS[name]||VIEWS.over;
  yaw=v.yaw;pitch=v.pitch;dist=v.dist;target.set(v.target[0],v.target[1],v.target[2]);
  document.getElementById('v-view').textContent=name;
  if(window.__syncViewButtons)window.__syncViewButtons(name);
}
setView(START);
addEventListener('keydown',e=>{
  const map={'0':'over','1':'power','2':'guard','3':'agility','4':'focus'};
  if(map[e.key])setView(map[e.key]);
});
let drag=false,lx=0,ly=0;
renderer.domElement.addEventListener('pointerdown',e=>{drag=true;lx=e.clientX;ly=e.clientY;renderer.domElement.setPointerCapture(e.pointerId)});
renderer.domElement.addEventListener('pointerup',e=>{drag=false});
renderer.domElement.addEventListener('pointermove',e=>{
  if(!drag)return;
  yaw-=(e.clientX-lx)*.006;pitch=Math.max(6,Math.min(88,pitch+(e.clientY-ly)*.22));
  lx=e.clientX;ly=e.clientY;
});
addEventListener('wheel',e=>{dist=Math.max(9,Math.min(90,dist+e.deltaY*.03))},{passive:true});
function resize(){
  const w=host.clientWidth||innerWidth,h=host.clientHeight||innerHeight;
  renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();
}
addEventListener('resize',resize);resize();

const pip=new T.Vector3();
function applyCamera(){
  const r=pitch*Math.PI/180;
  camera.position.set(target.x+Math.sin(yaw)*Math.cos(r)*dist,target.y+Math.sin(r)*dist,target.z+Math.cos(yaw)*Math.cos(r)*dist);
  camera.lookAt(target);
}
/* Headless probe: set a view and render one deterministic frame. */
function snap(name,w,h){
  setView(name);
  if(w&&h){renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix()}
  applyCamera();
  renderer.render(scene,camera);
  return renderer.domElement.toDataURL('image/png');
}
function frame(now){
  const t=now/1000;
  // dust drift
  const pa=dust.geometry.attributes.position,sp=dust.userData.spd;
  for(let i=0;i<pa.count;i++){
    let y=pa.getY(i)+sp[i]*.006;
    if(y>8.6)y=.4;
    pa.setY(i,y);
    pa.setX(i,pa.getX(i)+Math.sin(t*.4+i)*.0016);
  }
  pa.needsUpdate=true;
  applyCamera();
  // chips
  const w=innerWidth,h=innerHeight;
  for(const c of chips){
    pip.set(c.x,1.0,c.z).project(camera);
    c.el.style.opacity=pip.z<1?1:0;
    c.el.style.left=((pip.x+1)*w*.5).toFixed(0)+'px';
    c.el.style.top=((1-pip.y)*h*.5).toFixed(0)+'px';
  }
  renderer.render(scene,camera);
  if(!frame.done){
    frame.done=true;
    document.getElementById('v-tri').textContent=Math.round(triangles).toLocaleString();
    document.getElementById('v-calls').textContent=renderer.info.render.calls;
    document.getElementById('v-tex').textContent=renderer.info.memory.textures;
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
window.__gym={scene,camera,renderer,setView,snap,applyCamera,parts:PARTS,get stats(){return {triangles,calls:renderer.info.render.calls,textures:renderer.info.memory.textures,geometries:renderer.info.memory.geometries}}};
})();
