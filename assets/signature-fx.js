/* Signature skill effects for the expanded roster (haven-v411, original art added in v412).
   Drawn on top of the shared skill effect, never instead of it.
   Two sources of art:
     * assets/ro-fx/ - original Ragnarok Online effects baked to flipbooks by tools/make_ro_fx.py
       (the Asura Strike characters, Flash Combo, Desperado, Final Strike, Hammer of God...).
       Used wherever the client has an effect for the skill. `book(key)` / FX.book / FX.stamp.
     * PAINT - small canvases painted here, for skills the client has no stand-alone effect file
       for (Crazy Weed, the plants, bottles, Spirit Spheres) and as the fallback while a flipbook
       is still downloading.
   index.html calls PGSignatureFx.play(id, ctx) from playSkillFx and PGSignatureFx.tick(dt) from
   tickSkillFx. ctx = {THREE, scene, from:{x,z}, to:{x,z}, floor, unit, life}. */
(function(root){
'use strict';
const TAU=Math.PI*2,rnd=(a,b)=>a+Math.random()*(b-a),ease=t=>1-Math.pow(1-Math.min(1,Math.max(0,t)),3);
const live=[],textures=new Map(),books=new Map();let T=null,scene=null;
const MAX=90;

// ---- painters: each returns a canvas ---------------------------------------------------------
function canvas(w,h,draw){const c=document.createElement('canvas');c.width=w;c.height=h;draw(c.getContext('2d'),w,h);return c}
const PAINT={
 glyph:(ch,arg)=>{const ink=String(arg==null?'':arg),bold=ink.startsWith('bold|'),S=bold?192:128,size=bold?166:104;ch=bold?ink.slice(5):ink;
  return canvas(S,S,(g,w,h)=>{g.textAlign='center';g.textBaseline='middle';
   g.font='900 '+size+'px "Yu Mincho","Hiragino Mincho ProN","Songti SC","SimSun","Noto Serif CJK JP","Noto Serif CJK SC","MS Mincho",serif';
   g.lineJoin='round';
   // v469 (owner: "bold & big, being overshadowed by other skills"): the Asura characters get a
   // heavier stack - a soft outer glow, a fat dark outline, a thick gold rim and a white-hot core -
   // so the word reads as the biggest thing on the field instead of a thin caption.
   if(bold){
     g.shadowColor='rgba(255,150,40,.95)';g.shadowBlur=26;
     g.lineWidth=34;g.strokeStyle='#2a0600';g.strokeText(ch,w/2,h/2+6);
     g.shadowBlur=14;g.lineWidth=22;g.strokeStyle='#ff9a1e';g.strokeText(ch,w/2,h/2+6);
     g.shadowBlur=0;g.lineWidth=10;g.strokeStyle='#fff6cf';g.strokeText(ch,w/2,h/2+6);
   }else{
     g.lineWidth=14;g.strokeStyle='#1a0500';g.strokeText(ch,w/2,h/2+4);
     g.lineWidth=6;g.strokeStyle='#ffe9a8';g.strokeText(ch,w/2,h/2+4);
   }
   const fill=g.createLinearGradient(0,S*.08,0,h-S*.08);fill.addColorStop(0,'#ffffff');fill.addColorStop(.32,'#fff3c4');fill.addColorStop(.62,'#ffb02e');fill.addColorStop(1,'#d8200c');
   g.fillStyle=fill;g.fillText(ch,w/2,h/2+(bold?6:4));
   if(bold){g.fillStyle='rgba(255,255,255,.55)';g.font='900 '+Math.round(size*.98)+'px "Yu Mincho","Hiragino Mincho ProN","Songti SC","SimSun",serif';
     g.globalCompositeOperation='lighter';g.fillText(ch,w/2-2,h/2+4);g.globalCompositeOperation='source-over'}});
 }, 
 flash:col=>canvas(96,96,(g,w)=>{const r=g.createRadialGradient(w/2,w/2,2,w/2,w/2,w/2);r.addColorStop(0,'#ffffff');r.addColorStop(.25,col);r.addColorStop(1,'rgba(0,0,0,0)');g.fillStyle=r;g.fillRect(0,0,w,w)}),
 ring:col=>canvas(128,128,(g,w)=>{g.strokeStyle=col;g.lineWidth=9;g.beginPath();g.arc(w/2,w/2,w/2-8,0,TAU);g.stroke();g.strokeStyle='rgba(255,255,255,.85)';g.lineWidth=3;g.beginPath();g.arc(w/2,w/2,w/2-8,0,TAU);g.stroke()}),
 orb:col=>canvas(48,48,(g,w)=>{const r=g.createRadialGradient(w*.42,w*.4,1,w/2,w/2,w/2);r.addColorStop(0,'#ffffff');r.addColorStop(.35,col);r.addColorStop(.8,'rgba(60,120,255,.35)');r.addColorStop(1,'rgba(0,0,0,0)');g.fillStyle=r;g.fillRect(0,0,w,w)}),
 // A thorned vine growing from the bottom edge. `seed` picks one of a few shapes.
 vine:seed=>canvas(64,160,(g,w,h)=>{const bend=[10,-12,7,-8][seed%4],pts=[];for(let i=0;i<=24;i++){const t=i/24;pts.push([w/2+Math.sin(t*3.2+seed)*bend*(.4+t),h-4-t*(h-22)])}
   const stroke=(col,wide)=>{g.strokeStyle=col;g.lineCap='round';g.lineJoin='round';g.lineWidth=wide;g.beginPath();pts.forEach((p,i)=>i?g.lineTo(p[0],p[1]):g.moveTo(p[0],p[1]));g.stroke()};
   stroke('#12300f',12);stroke('#2f8a2a',8);stroke('#7fd957',3);
   for(let i=3;i<22;i+=3){const p=pts[i],side=i%2?1:-1;g.fillStyle='#1c4d18';g.beginPath();g.moveTo(p[0],p[1]);g.lineTo(p[0]+side*13,p[1]-5);g.lineTo(p[0]+side*3,p[1]-9);g.fill();
     g.fillStyle='#58c043';g.beginPath();g.ellipse(p[0]-side*9,p[1]-2,8,4,side*.6,0,TAU);g.fill();g.strokeStyle='#12300f';g.lineWidth=1.5;g.stroke()}
   const tip=pts[24];g.fillStyle='#b8f070';g.beginPath();g.arc(tip[0],tip[1],5,0,TAU);g.fill();g.strokeStyle='#12300f';g.lineWidth=2;g.stroke()}),
 // A carnivorous plant: stalk, leaves and a toothed bulb. kind 0 = Flora (red), 1 = Geographer (yellow).
 plant:kind=>canvas(112,144,(g,w,h)=>{const head=kind?'#f2c230':'#d8283a',lip=kind?'#fff0a0':'#ff9aa8';
   g.strokeStyle='#12300f';g.lineWidth=13;g.lineCap='round';g.beginPath();g.moveTo(w/2,h-4);g.quadraticCurveTo(w/2-16,h-60,w/2,h-92);g.stroke();
   g.strokeStyle='#3a9a30';g.lineWidth=8;g.stroke();
   for(const s of [-1,1]){g.fillStyle='#3fa835';g.strokeStyle='#12300f';g.lineWidth=2.5;g.beginPath();g.ellipse(w/2+s*22,h-22,24,9,s*-.5,0,TAU);g.fill();g.stroke()}
   g.fillStyle=head;g.strokeStyle='#2a0508';g.lineWidth=4;g.beginPath();g.arc(w/2,48,36,0,TAU);g.fill();g.stroke();
   g.fillStyle='#3a0610';g.beginPath();g.ellipse(w/2,54,25,15,0,0,TAU);g.fill();
   g.fillStyle='#fffbe8';for(let i=0;i<6;i++){const x=w/2-22+i*8.8;g.beginPath();g.moveTo(x,41);g.lineTo(x+4.4,52);g.lineTo(x+8.8,41);g.fill();g.beginPath();g.moveTo(x,67);g.lineTo(x+4.4,57);g.lineTo(x+8.8,67);g.fill()}
   g.fillStyle=lip;for(let i=0;i<5;i++){g.beginPath();g.arc(w/2+Math.cos(-2.6+i*.52)*27,48+Math.sin(-2.6+i*.52)*27,4,0,TAU);g.fill()}}),
 bottle:col=>canvas(40,56,(g,w,h)=>{g.strokeStyle='#1d1410';g.lineWidth=3;g.fillStyle='rgba(235,245,255,.9)';
   g.beginPath();g.moveTo(15,4);g.lineTo(25,4);g.lineTo(25,18);g.quadraticCurveTo(37,26,36,40);g.quadraticCurveTo(35,53,20,53);g.quadraticCurveTo(5,53,4,40);g.quadraticCurveTo(3,26,15,18);g.closePath();g.fill();g.stroke();
   g.fillStyle=col;g.beginPath();g.moveTo(6,34);g.lineTo(34,34);g.quadraticCurveTo(35,51,20,51);g.quadraticCurveTo(5,51,6,34);g.fill();
   g.fillStyle='#7a4a22';g.fillRect(14,1,12,6);g.strokeRect(14,1,12,6);g.fillStyle='rgba(255,255,255,.8)';g.fillRect(10,24,3,12)}),
 splash:col=>canvas(128,64,(g,w,h)=>{const r=g.createRadialGradient(w/2,h/2,2,w/2,h/2,w/2);r.addColorStop(0,'rgba(255,255,255,.9)');r.addColorStop(.3,col);r.addColorStop(1,'rgba(0,0,0,0)');
   g.save();g.scale(1,.5);g.fillStyle=r;g.beginPath();g.arc(w/2,h,w/2,0,TAU);g.fill();g.restore()}),
 drop:col=>canvas(20,28,(g)=>{g.fillStyle=col;g.strokeStyle='rgba(0,0,0,.45)';g.lineWidth=2;g.beginPath();g.moveTo(10,2);g.quadraticCurveTo(19,16,10,26);g.quadraticCurveTo(1,16,10,2);g.fill();g.stroke()}),
 flame:seed=>canvas(48,80,(g,w,h)=>{for(const [col,k] of [['#b3200a',1],['#ff7a12',.72],['#ffd24a',.46],['#fff6c8',.24]]){g.fillStyle=col;g.beginPath();g.moveTo(w/2,h-2);
   g.bezierCurveTo(w/2-22*k,h-12,w/2-16*k+(seed%3-1)*4,h-44*k-12,w/2+(seed%2?5:-5)*k,h-2-76*k);g.bezierCurveTo(w/2+18*k,h-40*k-10,w/2+22*k,h-12,w/2,h-2);g.fill()}}),
 shuriken:()=>canvas(96,96,(g,w)=>{g.translate(w/2,w/2);for(let i=0;i<4;i++){g.rotate(TAU/4);g.fillStyle='#cfd6e6';g.strokeStyle='#161a26';g.lineWidth=3;g.beginPath();g.moveTo(0,-8);g.quadraticCurveTo(18,-30,2,-46);g.quadraticCurveTo(-6,-26,-9,-6);g.closePath();g.fill();g.stroke();
   g.fillStyle='#8892a8';g.beginPath();g.moveTo(0,-8);g.quadraticCurveTo(8,-26,2,-44);g.lineTo(-4,-10);g.fill()}
   g.fillStyle='#3a4258';g.beginPath();g.arc(0,0,10,0,TAU);g.fill();g.stroke();g.fillStyle='#161a26';g.beginPath();g.arc(0,0,4,0,TAU);g.fill()}),
 kunai:()=>canvas(64,20,(g)=>{g.fillStyle='#d8deea';g.strokeStyle='#161a26';g.lineWidth=2;g.beginPath();g.moveTo(62,10);g.lineTo(34,3);g.lineTo(30,10);g.lineTo(34,17);g.closePath();g.fill();g.stroke();
   g.fillStyle='#5a3a22';g.fillRect(14,7,18,6);g.strokeRect(14,7,18,6);g.beginPath();g.arc(8,10,5,0,TAU);g.stroke()}),
 tracer:()=>canvas(96,12,(g,w,h)=>{const r=g.createLinearGradient(0,0,w,0);r.addColorStop(0,'rgba(255,220,120,0)');r.addColorStop(.7,'#ffd870');r.addColorStop(1,'#ffffff');g.fillStyle=r;g.fillRect(0,h/2-2,w,4)}),
 muzzle:()=>canvas(64,64,(g,w)=>{g.translate(w/2,w/2);g.fillStyle='#ffd24a';for(let i=0;i<8;i++){g.rotate(TAU/8);g.beginPath();g.moveTo(0,-4);g.lineTo(i%2?18:30,0);g.lineTo(0,4);g.fill()}g.fillStyle='#fff';g.beginPath();g.arc(0,0,9,0,TAU);g.fill()}),
 coin:()=>canvas(40,40,(g,w)=>{g.fillStyle='#f2c230';g.strokeStyle='#6a4208';g.lineWidth=3;g.beginPath();g.arc(w/2,w/2,16,0,TAU);g.fill();g.stroke();g.strokeStyle='#fff3b0';g.lineWidth=2;g.beginPath();g.arc(w/2,w/2,10,0,TAU);g.stroke();
   g.fillStyle='#6a4208';g.font='900 16px serif';g.textAlign='center';g.textBaseline='middle';g.fillText('Z',w/2,w/2+1)}),
 bubble:()=>canvas(96,96,(g,w)=>{const r=g.createRadialGradient(w*.38,w*.36,2,w/2,w/2,w/2-2);r.addColorStop(0,'#ffffff');r.addColorStop(.3,'#8fd8ff');r.addColorStop(.85,'#1f6fd0');r.addColorStop(1,'rgba(10,40,120,0)');g.fillStyle=r;g.beginPath();g.arc(w/2,w/2,w/2-2,0,TAU);g.fill();
   g.strokeStyle='#0c2a66';g.lineWidth=3;g.stroke()}),
 note:ch=>canvas(64,64,(g,w)=>{g.font='900 54px serif';g.textAlign='center';g.textBaseline='middle';g.lineWidth=7;g.strokeStyle='#2a1038';g.strokeText(ch,w/2,w/2);g.fillStyle='#ffd0f0';g.fillText(ch,w/2,w/2)})
};
// ---- original flipbooks ------------------------------------------------------------------------
// A book is one atlas of n equal cells. Every sprite playing it needs its own texture offset, so
// each takes a clone of the atlas texture from a small pool and hands it back when it ends.
function book(key){const pack=root.RO_FX;if(!pack||!pack.books||!pack.books[key]||!T||!T.TextureLoader)return null;
 let b=books.get(key);
 if(!b){b={meta:pack.books[key],base:null,ready:false,pool:[]};books.set(key,b);
  try{b.base=new T.TextureLoader().load(pack.dir+b.meta.file+'?v='+(pack.v||412),()=>{b.ready=true})}catch(e){}}
 return b.ready?b:null}
// Only the flipbooks a class can actually cast are downloaded: warm(ids) when the class is known,
// and again per skill on its first cast.
function warm(ids){const pack=root.RO_FX;if(!pack||!pack.books||!T)return;for(const id of ids||[])for(const step of MAP[id]||[]){const o=step[1]||{};if(o.book&&pack.books[o.book])book(o.book);if(step[0]==='coin'&&pack.books.coin)book('coin')}}
function lease(b){let t=b.pool.pop();if(!t){t=b.base.clone();t.needsUpdate=true;t.magFilter=T.LinearFilter;t.minFilter=T.LinearFilter;t.generateMipmaps=false;t.repeat.set(1/b.meta.cols,1/b.meta.rows)}return t}
function frame(t,m,i){i=Math.max(0,Math.min(m.n-1,i|0));t.offset.set((i%m.cols)/m.cols,1-(Math.floor(i/m.cols)+1)/m.rows)}
// One sprite playing a book. opt: frame (hold one cell), loop, speed, glow, delay, order, life, centre.
// update(p,k,h) places it; h is the book's natural height in world units (already scaled).
function addBook(key,opt,update){const b=book(key);if(!b)return null;const m=b.meta;
 if(live.length>=MAX)drop(live.shift());
 const tex=lease(b),mat=new T.SpriteMaterial({map:tex,transparent:true,depthWrite:false,depthTest:opt.depth===true,blending:opt.glow?T.AdditiveBlending:T.NormalBlending});
 // v469: an optional tint. A white client cell multiplied by a dark hex becomes the outline pass of
 // a heavy word; multiplied by a warm hex it becomes the burning fill.
 if(opt.color!=null&&mat.color&&mat.color.setHex)mat.color.setHex(opt.color);
 const s=new T.Sprite(mat);if(opt.centre)s.center.set(.5,.5);else s.center.set(m.ox,1-m.oy);s.renderOrder=opt.order||48;s.visible=false;scene.add(s);
 const natural=m.fps?m.n/m.fps:.8,life=opt.life||natural/(opt.speed||1),h=(opt.unit||2.16)*m.u*(opt.scale||1);
 frame(tex,m,opt.frame||0);
 const p={s,age:-(opt.delay||0),life,aspect:m.w/m.h,done:()=>b.pool.length<6?b.pool.push(tex):tex.dispose(),
  update:(p,k)=>{if(opt.frame==null&&m.n>1){const i=Math.floor(p.age*m.fps*(opt.speed||1));frame(tex,m,opt.loop?i%m.n:i)}
   s.scale.set(h*p.aspect,h,1);update(p,k,h)}};
 live.push(p);return p}
function drop(p){scene&&scene.remove(p.s);p.s.material.dispose();if(p.done)p.done()}

function texture(kind,arg){const key=kind+':'+arg;let t=textures.get(key);if(!t){t=new T.CanvasTexture(PAINT[kind](arg));t.magFilter=T.LinearFilter;t.minFilter=T.LinearFilter;t.generateMipmaps=false;textures.set(key,t)}return t}

// ---- particles -------------------------------------------------------------------------------
// One sprite with a lifetime and an update(p, k) where k runs 0..1. `foot` anchors it on its base.
function add(kind,arg,life,update,opt={}){
 if(live.length>=MAX)drop(live.shift());
 const tex=texture(kind,arg),m=new T.SpriteMaterial({map:tex,transparent:true,depthWrite:false,depthTest:opt.depth!==false,blending:opt.glow?T.AdditiveBlending:T.NormalBlending});
 const s=new T.Sprite(m);if(opt.foot)s.center.set(.5,0);s.renderOrder=opt.order||30;s.visible=false;scene.add(s);
 const p={s,age:-(opt.delay||0),life,update,aspect:tex.image.width/tex.image.height};live.push(p);return p}
const size=(p,h)=>p.s.scale.set(h*p.aspect,h,1);
function tick(dt){for(let i=live.length-1;i>=0;i--){const p=live[i];p.age+=dt;
  if(p.age<0)continue;
  if(p.age>=p.life){drop(p);live.splice(i,1);continue}
  p.s.visible=true;p.update(p,p.age/p.life)}}
function clear(){for(const p of live)drop(p);live.length=0}

// ---- effects ---------------------------------------------------------------------------------
const FX={
 // Kanji fly out of the target one after another, then a shockwave.
 // v469: `scale` grows the whole word (spacing, height and hold), `life` lets a big word stay up
 // longer, and `bold` swaps in the heavy painter above. Defaults keep every other skill identical.
 glyphs(c,o){const chars=[...o.text],U=c.unit,gap=o.gap||.11,sc=o.scale||1,hold=o.life||(o.book?1.05:.95),bold=!!o.bold;
  const spread=U*.62*(1+(sc-1)*.55),lift=U*(1.25+(sc-1)*.42);
  chars.forEach((ch,i)=>{const side=(i-(chars.length-1)/2)*spread,rise=lift*(1+(i%2)*.22);
   // The client's own characters when the book is in; the painted ones until then.
   if(o.book){
    const big=1.25*Math.min(sc,1.6)*(bold?1.15:1),place=(p,k,h,pop)=>{p.s.scale.set(h*p.aspect*pop,h*pop,1);
      p.s.position.set(c.to.x+side,c.floor+rise+k*U*.5*(1+(sc-1)*.3),c.to.z+.05*i)};
    if(bold)addBook(o.book,{frame:i,life:hold,delay:i*gap,order:59,centre:true,unit:U,scale:big*1.13,color:0x160300},(p,k,h)=>{
      const pop=k<.2?.3+ease(k/.2)*1.2:1.5-ease((k-.2)/.3)*.5;place(p,k,h,pop);p.s.material.opacity=k<.86?1:1-(k-.86)/.14});
    if(addBook(o.book,{frame:i,life:hold,delay:i*gap,order:60,centre:true,unit:U,scale:big,color:bold?0xffe7bd:null},(p,k,h)=>{const pop=k<.2?.3+ease(k/.2)*1.2:1.5-ease((k-.2)/.3)*.5;
      place(p,k,h,pop);p.s.material.opacity=k<(bold?.8:.72)?1:1-(k-(bold?.8:.72))/(bold?.2:.28)}))return}
   add('glyph',bold?'bold|'+ch:ch,hold,(p,k)=>{const pop=k<.22?.3+ease(k/.22)*1.15:1.45-ease((k-.22)/.3)*.45;size(p,U*.78*pop*sc);
    p.s.position.set(c.to.x+side,c.floor+rise+k*U*.5*(1+(sc-1)*.3),c.to.z+.05*i);p.s.material.opacity=k<.7?1:1-(k-.7)/.3},{delay:i*gap,order:60,depth:false})});
  const end=chars.length*gap;
  add('flash',o.color||'#ffb02e',.5,(p,k)=>{size(p,U*(1+k*5)*sc);p.s.position.set(c.to.x,c.floor+U*.5,c.to.z);p.s.material.opacity=1-k},{delay:end,glow:true,order:55});
  add('ring',o.color||'#ffb02e',.6,(p,k)=>{size(p,U*(.6+ease(k)*4.5)*sc);p.s.position.set(c.to.x,c.floor+U*.45,c.to.z);p.s.material.opacity=1-k},{delay:end,order:54})},
 // A heavy impact at the target: white-hot core, two ground rings and a rising column of light.
 // Four sprites only, so a raid field full of skills still stays under the particle cap.
 burst(c,o){const U=c.unit,col=o.color||'#ffcf5a';
  add('flash',col,.45,(p,k)=>{size(p,U*(1.1+k*6.5)*.9);p.s.position.set(c.to.x,c.floor+U*.55,c.to.z);p.s.material.opacity=(1-k)*(1-k)},{glow:true,order:56});
  add('ring',col,.75,(p,k)=>{size(p,U*(1+ease(k)*9));p.s.position.set(c.to.x,c.floor+U*.04,c.to.z);p.s.material.opacity=1-k},{foot:true,order:53});
  add('ring','#fff3c4',1,(p,k)=>{size(p,U*(.5+ease(k)*6));p.s.position.set(c.to.x,c.floor+U*.04,c.to.z);p.s.material.opacity=(1-k)*.85},{foot:true,delay:.09,order:53});
  add('flash',col,1.05,(p,k)=>{const w=U*(1.15-k*.55);p.s.scale.set(w,w*(1+k*3.4),1);p.s.position.set(c.to.x,c.floor+U*(.15+k*1.1),c.to.z);p.s.material.opacity=(1-k)*.8},{glow:true,order:52})},
 // Vines burst from the ground around a point, sway, and sink back.
 vines(c,o){const U=c.unit,n=o.count||9,rad=(o.radius||2.2)*U*.6,at=o.self?c.from:c.to;
  for(let i=0;i<n;i++){const a=i/n*TAU+rnd(-.3,.3),r=i?rad*Math.sqrt(rnd(.15,1)):0,x=at.x+Math.cos(a)*r,z=at.z+Math.sin(a)*r*.6,tall=U*rnd(1.1,1.9)*(o.scale||1),phase=rnd(0,TAU);
   add('vine',i,o.life||1.5,(p,k)=>{const grow=k<.25?ease(k/.25):k>.8?1-ease((k-.8)/.2):1,sway=1+Math.sin(phase+k*14)*.08;
    p.s.scale.set(tall*p.aspect*sway,tall*grow,1);p.s.position.set(x+Math.sin(phase+k*10)*U*.05,c.floor,z)},{foot:true,delay:i*.035,order:35})}},
 // A plant grows at the target and snaps for as long as its field lasts.
 plant(c,o){const U=c.unit,life=Math.max(1.2,c.life||o.life||1.2),tall=U*1.25;
  add('plant',o.kind|0,life,(p,k)=>{const age=k*life,grow=age<.35?ease(age/.35):age>life-.3?Math.max(0,(life-age)/.3):1,bite=1+Math.max(0,Math.sin(age*TAU*1.6))*.14;
   p.s.scale.set(tall*p.aspect*bite,tall*grow*(2-bite),1);p.s.position.set(c.to.x+Math.sin(age*5)*U*.04,c.floor,c.to.z-.02)},{foot:true,order:36})},
 // Bottles arc from the caster to the target and break into a splash.
 bottle(c,o){const U=c.unit,cols=o.colors,fly=.42;
  cols.forEach((col,i)=>{const d=i*.09,off=(i-(cols.length-1)/2)*U*.3;
   add('bottle',col,fly,(p,k)=>{size(p,U*.42);p.s.material.rotation=k*TAU*1.5*(i%2?-1:1);
    p.s.position.set(c.from.x+(c.to.x+off-c.from.x)*k,c.floor+U*(.8+Math.sin(k*Math.PI)*1.5-k*.45),c.from.z+(c.to.z-c.from.z)*k)},{delay:d,order:50});
   add('splash',col,.55,(p,k)=>{size(p,U*(.5+ease(k)*1.6)/p.aspect*1.2);p.s.position.set(c.to.x+off,c.floor+U*.12,c.to.z);p.s.material.opacity=1-k*k},{delay:d+fly,order:34});
   for(let j=0;j<7;j++){const a=j/7*TAU+rnd(0,.5),v=rnd(.6,1.4);
    add('drop',col,.55,(p,k)=>{size(p,U*.2*(1-k*.5));p.s.position.set(c.to.x+off+Math.cos(a)*U*v*k,c.floor+U*(.2+Math.sin(k*Math.PI)*.9*v),c.to.z+Math.sin(a)*U*.3*k);p.s.material.opacity=1-k},{delay:d+fly,order:51})}});
  if(o.fire)FX.flames(c,{count:5,life:.9,delay:fly})},
 // Fire standing on the ground for the life of a field.
 flames(c,o){const U=c.unit,life=Math.max(.8,o.life||c.life||1),n=o.count||7;
  for(let i=0;i<n;i++){const a=i/n*TAU,r=i?U*rnd(.3,1.1):0,x=c.to.x+Math.cos(a)*r,z=c.to.z+Math.sin(a)*r*.5,tall=U*rnd(.7,1.2),ph=rnd(0,TAU);
   add('flame',i,life,(p,k)=>{const age=k*life,grow=age<.2?age/.2:age>life-.25?Math.max(0,(life-age)/.25):1,lick=1+Math.sin(ph+age*22)*.14;
    p.s.scale.set(tall*p.aspect*(2-lick),tall*grow*lick,1);p.s.position.set(x,c.floor,z)},{foot:true,delay:(o.delay||0)+i*.03,order:37})}},
 // Spirit Spheres circle the caster.
 orbs(c,o){const U=c.unit,n=o.count||5,life=o.life||1.3;
  for(let i=0;i<n;i++)add('orb',o.color||'#7fc4ff',life,(p,k)=>{const a=i/n*TAU+k*TAU*1.4,r=U*(o.inward?.55*(1-k)+.05:.55);size(p,U*.34);
   p.s.position.set(c.from.x+Math.cos(a)*r,c.floor+U*(.55+Math.sin(a*2)*.12),c.from.z+Math.sin(a)*r*.45+.05);p.s.material.opacity=k<.85?1:(1-k)/.15},{glow:true,order:45})},
 // A giant shuriken spins out through the target and back.
 shuriken(c){const U=c.unit,life=.9;
  add('shuriken',0,life,(p,k)=>{const out=k<.5?ease(k/.5)*1.25:1.25-ease((k-.5)/.5)*1.25;size(p,U*1.1);p.s.material.rotation=-k*TAU*5;
   p.s.position.set(c.from.x+(c.to.x-c.from.x)*out,c.floor+U*.55,c.from.z+(c.to.z-c.from.z)*out)},{order:50})},
 // Thrown blades (kunai) or bullets fly straight at the target.
 volley(c,o){const U=c.unit,n=o.count||3,dx=c.to.x-c.from.x,dz=c.to.z-c.from.z,ang=Math.atan2(-dz*.5,dx)||0;
  for(let i=0;i<n;i++){const off=(i-(n-1)/2)*U*.16;
   add(o.kind||'kunai',0,.22,(p,k)=>{size(p,U*(o.kind==='tracer'?.1:.2));p.s.material.rotation=ang;
    p.s.position.set(c.from.x+dx*k,c.floor+U*.6+off*(1-k),c.from.z+dz*k)},{delay:i*(o.gap||.07),order:50,glow:o.kind==='tracer'});
   if(o.muzzle)add('muzzle',0,.09,(p)=>{size(p,U*.45);p.s.position.set(c.from.x+Math.sign(dx||1)*U*.35,c.floor+U*.62,c.from.z+.05)},{delay:i*(o.gap||.07),glow:true,order:52})}},
 // Shots in every direction around the caster.
 spray(c,o){const U=c.unit,n=o.count||12;
  for(let i=0;i<n;i++){const a=i/n*TAU,r=U*2.4;
   add('tracer',0,.2,(p,k)=>{size(p,U*.1);p.s.material.rotation=-Math.atan2(Math.sin(a)*.5,Math.cos(a));
    p.s.position.set(c.from.x+Math.cos(a)*r*k,c.floor+U*.6,c.from.z+Math.sin(a)*r*.5*k)},{delay:(i%4)*.06,glow:true,order:50});
   if(i%3===0)add('muzzle',0,.09,(p)=>{size(p,U*.4);p.s.position.set(c.from.x+Math.cos(a)*U*.35,c.floor+U*.62,c.from.z+.05)},{delay:(i%4)*.06,glow:true,order:52})}},
 // A coin flips up from the caster's hand.
 coin(c){const U=c.unit;
  if(addBook('coin',{unit:U,scale:1.6,life:.7,loop:true,speed:12,centre:true,order:55},(p,k)=>{p.s.position.set(c.from.x+U*.3,c.floor+U*(1+Math.sin(k*Math.PI)*.9),c.from.z+.05);p.s.material.opacity=k<.8?1:(1-k)/.2}))return;
  add('coin',0,.7,(p,k)=>{const flip=Math.abs(Math.cos(k*TAU*3));p.s.scale.set(U*.26*Math.max(.15,flip),U*.26,1);
   p.s.position.set(c.from.x+U*.3,c.floor+U*(1+Math.sin(k*Math.PI)*.9),c.from.z+.05);p.s.material.opacity=k<.8?1:(1-k)/.2},{order:55,depth:false})},
 // A Marine Sphere swells at the target, then bursts.
 bubble(c,o){const U=c.unit,wait=o.wait||1.1;
  add('bubble',0,wait,(p,k)=>{size(p,U*(.35+k*.75)*(1+Math.sin(k*40)*.04*k));p.s.position.set(c.to.x,c.floor+U*(.35+k*.25),c.to.z)},{order:40});
  add('flash','#8fd8ff',.45,(p,k)=>{size(p,U*(1+k*4));p.s.position.set(c.to.x,c.floor+U*.5,c.to.z);p.s.material.opacity=1-k},{delay:wait,glow:true,order:55});
  for(let j=0;j<9;j++){const a=j/9*TAU;add('drop','#8fd8ff',.5,(p,k)=>{size(p,U*.22);p.s.position.set(c.to.x+Math.cos(a)*U*1.6*k,c.floor+U*(.5+Math.sin(k*Math.PI)*.6),c.to.z+Math.sin(a)*U*.5*k);p.s.material.opacity=1-k},{delay:wait,order:51})}},
 // An original flipbook played once (or looped for a field's life) at the caster or the target.
 // o: book, at ('to'|'from'), y (hero heights above the floor), scale, glow, delay, loop, speed, else.
 book(c,o){const U=c.unit,at=o.at==='from'?c.from:c.to,life=o.loop?Math.max(.8,c.life||o.life||1):o.life;
  const p=addBook(o.book,{unit:U,scale:o.scale,glow:o.glow,delay:o.delay,loop:o.loop,speed:o.speed,life,order:o.order},(p,k)=>{
   p.s.position.set(at.x+(o.x||0)*U,c.floor+U*(o.y==null?.45:o.y),at.z+.04);if(o.loop)p.s.material.opacity=k>.9?(1-k)/.1:1});
  if(!p&&o.else)FX[o.else[0]](c,o.else[1]||{})},
 // One cell of a book shown as a still: it pops in, holds and fades (tarot card, spider web).
 stamp(c,o){const U=c.unit,at=o.at==='from'?c.from:c.to,pack=root.RO_FX,m=pack&&pack.books&&pack.books[o.book],pick=o.frame==null&&m?Math.floor(Math.random()*m.n):o.frame|0;
  addBook(o.book,{unit:U,scale:o.scale,frame:pick,life:o.life||.9,delay:o.delay,centre:true,order:58},(p,k,h)=>{const pop=k<.18?.4+ease(k/.18)*.75:1.15-ease((k-.18)/.25)*.15;
   p.s.scale.set(h*p.aspect*pop,h*pop,1);p.s.position.set(at.x,c.floor+U*(o.y==null?1.2:o.y)+(o.rise||0)*U*k,at.z+.05);p.s.material.opacity=k<.7?1:1-(k-.7)/.3})},
 // A still thrown from the caster through the target and back, spinning (Shield Boomerang).
 hurl(c,o){const U=c.unit,n=o.count||1;
  for(let i=0;i<n;i++)addBook(o.book,{unit:U,scale:o.scale,frame:0,life:o.back?.7:.32,delay:i*.12,centre:true,order:52},(p,k)=>{const out=o.back?(k<.5?ease(k/.5):1-ease((k-.5)/.5)):k;
   p.s.material.rotation=-k*TAU*3;p.s.position.set(c.from.x+(c.to.x-c.from.x)*out,c.floor+U*.6,c.from.z+(c.to.z-c.from.z)*out)})},
 // Music notes drift up from the performer.
 notes(c,o){const U=c.unit,at=o.target?c.to:c.from;
  for(let i=0;i<6;i++){const x=rnd(-.7,.7)*U,ph=rnd(0,TAU);add('note',i%2?'♪':'♫',1,(p,k)=>{size(p,U*.4);p.s.position.set(at.x+x+Math.sin(ph+k*7)*U*.12,c.floor+U*(.7+k*1.2),at.z+.05);p.s.material.opacity=1-k*k},{delay:i*.08,order:50,depth:false})}}
};

// ---- which skill plays what ------------------------------------------------------------------
const SPHERE=[['orbs',{count:1,life:.8}]];
const B=(book,o={})=>['book',{book,...o}];
const MAP={
 // Monk line
 // v469 (owner: "increase the size of the Sura Asura Strike animation fx ... bold & big, the
 // wording & animation"). The word is drawn at 2.1x with the heavy painter and holds for 1.5s, and
 // the impact is a new four-sprite burst, so the finisher is the loudest thing on the field again.
 ch_asura:[['orbs',{count:5,life:.55,inward:true,color:'#ffd870'}],['burst',{color:'#ffcf5a'}],
   ['glyphs',{text:'阿修羅覇凰拳',book:'asura',scale:2.1,life:1.5,gap:.13,bold:true}]],
 su_gate:[B('flash',{y:1.1,scale:1.5,glow:true,else:['glyphs',{text:'閃光連撃',color:'#c05cff'}]})],
 su_tiger:[['glyphs',{text:'號砲',color:'#ff7a2a'}],['orbs',{count:1,life:.8}]],
 mo_sphere:[['orbs',{count:5,life:1.6}]],ch_fury:[['orbs',{count:5,life:1.6,color:'#ffd870'}]],ch_zen:[['orbs',{count:5,life:1.2,inward:true}]],
 su_rising:[['orbs',{count:5,life:1.4,color:'#ffb060'}]],
 mo_triple:SPHERE,ch_crush:SPHERE,ch_glacier:SPHERE,
 mo_chain:[...SPHERE,B('investigate',{y:.55,scale:1.2})],ch_palm:[...SPHERE,B('investigate',{y:.55,scale:1.5})],
 // Crusader line
 cr_holyx:[B('holycross',{y:.6,scale:1.3,glow:true})],
 cr_grand:[B('grandcross',{at:'from',y:.5,scale:2,glow:true})],
 cr_shboom:[['hurl',{book:'shield',back:true,scale:.9}]],pa_chain:[['hurl',{book:'shield',count:5,scale:.8}]],
 pa_press:[B('grandcross',{y:.5,scale:1.5,glow:true})],
 rg_genesis:[B('holycross',{y:.6,scale:2.4,glow:true}),B('grandcross',{y:.5,scale:2.2,glow:true,delay:.15})],
 rg_vanish:[B('shieldcharge',{y:.5,scale:1.3,glow:true})],
 // Sage line
 sc_mind:[B('mindbreak',{y:1.0,scale:1.6,glow:true})],
 sc_web:[['stamp',{book:'web',y:.25,scale:1.6,life:2}]],
 // Alchemist line
 al_acid:[['bottle',{colors:['#7be04a']}]],
 al_bomb:[['bottle',{colors:['#ff6a2a'],fire:true}],B('demo',{loop:true,y:0,scale:1.6,delay:.4,else:['flames',{}]}),B('demo',{loop:true,y:0,x:.7,scale:1.2,delay:.5}),B('demo',{loop:true,y:0,x:-.7,scale:1.2,delay:.55})],
 bi_demo:[['bottle',{colors:['#ff5a2a','#8cf04a'],fire:true}],B('demo',{loop:true,life:1.1,y:0,scale:1.8,delay:.45})],
 al_pot:[['bottle',{colors:['#ff6a8a']}]],
 al_flora:[['plant',{kind:0}]],bi_plant:[['plant',{kind:1}]],
 bi_bio:[['bubble',{}]],
 ge_weed:[['vines',{count:11,radius:2.6}]],
 ge_thorn:[['vines',{count:5,radius:.9,scale:.8,life:2}]],
 ge_hell:[['vines',{count:7,radius:1.6,scale:1.25}],['plant',{kind:0,life:1.4}]],
 ge_spore:[['bubble',{wait:.9}]],
 ge_fire:[['bottle',{colors:['#ff3a1a']}],B('demo',{loop:true,y:0,scale:2,delay:.4,else:['flames',{count:9}]}),B('demo',{loop:true,y:0,x:.9,scale:1.5,delay:.5}),B('demo',{loop:true,y:0,x:-.9,scale:1.5,delay:.55})],
 // Rogue line
 ro_strip:[B('strip',{y:.9,scale:1.6})],st_full:[B('strip',{y:.9,scale:1.6}),B('strip',{y:.7,x:.3,scale:1.3,delay:.12}),B('strip',{y:.7,x:-.3,scale:1.3,delay:.24})],
 sc_masq:[B('masq',{y:1.3,scale:1.5})],
 // Ninja line
 nj_huuma:[['shuriken',{}]],ko_huuma:[['shuriken',{}]],
 nj_kunai:[['volley',{count:3}]],
 nj_blaze:[B('blaze',{loop:true,life:.9,y:0,scale:1.6,else:['flames',{count:6,life:.9}]}),B('blaze',{loop:true,life:.9,y:0,x:.6,scale:1.2,delay:.06}),B('blaze',{loop:true,life:.9,y:0,x:-.6,scale:1.2,delay:.12})],
 nj_slash:[B('shadowslash',{y:.55,scale:1.5})],
 nj_final:[B('issen',{y:.9,scale:1.6,speed:1.4})],
 nj_spear:[B('ice',{y:.05,scale:1.2,life:.7})],
 nj_cicada:[B('mist',{at:'from',y:.4,scale:1.2})],
 ko_cross:[B('crossslash',{y:.55,scale:2,glow:true})],
 ko_soul:[B('soulcut',{y:.6,scale:1.6,glow:true})],
 ko_kunai:[['volley',{count:5}],B('bakuretsu',{y:.5,scale:1.4,delay:.2})],
 ko_petal:[B('kamaitachi',{at:'from',y:.5,scale:1.6})],
 ko_shadow:[B('mist',{at:'from',y:.4,scale:1.3})],
 // Gunslinger line
 gs_rapid:[['volley',{kind:'tracer',count:5,gap:.05,muzzle:true}],B('rapid',{y:.55,scale:1.2}),['coin',{}]],
 gs_triple:[['volley',{kind:'tracer',count:3,gap:.06,muzzle:true}],B('triple',{y:.55,scale:1.1}),['coin',{}]],
 gs_bull:[['volley',{kind:'tracer',count:1,muzzle:true}],B('bullet',{y:.55,scale:1.2})],
 gs_track:[['volley',{kind:'tracer',count:1,muzzle:true}],B('tracking',{y:.55,scale:1.8})],
 gs_fling:[['coin',{}]],gs_coin:[['coin',{}]],
 gs_desp:[B('desperado',{at:'from',y:.5,scale:1.7,else:['spray',{count:16}]})],
 rb_fire:[B('firedance',{at:'from',y:.5,scale:1.8,glow:true}),['spray',{count:12}],['coin',{}]],
 rb_round:[['volley',{kind:'tracer',count:6,gap:.04,muzzle:true}],B('firerain',{y:.3,scale:1.5,glow:true})],
 rb_dragon:[B('dtail',{y:.35,scale:1.8,glow:true})],
 rb_slug:[['volley',{kind:'tracer',count:1,muzzle:true}],B('slug',{y:.5,scale:1.8,glow:true})],
 rb_crimson:[['volley',{kind:'tracer',count:1,muzzle:true}],B('bullet',{y:.55,scale:1.4})],
 rb_platinum:[B('platinum',{at:'from',y:.5,scale:1.6,glow:true})],
 rb_heat:[B('heat',{at:'from',y:.5,scale:1.5,glow:true})],
 rb_god:[B('hammer',{y:.2,scale:2,glow:true})],
 // Performers
 bd_bragi:[['notes',{}],B('note',{at:'from',y:.9,scale:1.5,glow:true})],bd_music:[['notes',{target:true}]],bd_metal:[['notes',{target:true}],B('note',{y:.8,scale:1.5,glow:true})],
 bd_reverb:[['notes',{target:true}]],mw_echo:[['notes',{}],B('note',{at:'from',y:.9,scale:2,glow:true})],dn_service:[['notes',{}],B('note',{at:'from',y:.9,scale:1.5,glow:true})],dn_swing:[['notes',{}]],
 dn_tarot:[['stamp',{book:'tarot',y:1.5,scale:1.1,life:1.1,rise:.3}]]
};
function play(id,ctx){const steps=MAP[id];if(!steps||!ctx||!ctx.THREE||!ctx.scene||typeof document==='undefined')return false;
 T=ctx.THREE;scene=ctx.scene;warm([id]);const c={from:ctx.from,to:ctx.to||ctx.from,floor:ctx.floor||0,unit:ctx.unit||2.16,life:ctx.life||0};
 try{for(const [name,opt] of steps)FX[name](c,opt)}catch(e){return false}
 return true}
root.PGSignatureFx={orbCanvas:()=>PAINT.orb('#7fc4ff'),play,tick,clear,warm:ctx=>{if(ctx&&ctx.THREE){T=ctx.THREE;warm(ctx.ids)}},books:()=>[...new Set(Object.values(MAP).flat().map(s=>s[1]&&s[1].book).filter(Boolean).concat('coin'))],has:id=>Object.hasOwn(MAP,id),ids:()=>Object.keys(MAP),get count(){return live.length}};
})(globalThis);
