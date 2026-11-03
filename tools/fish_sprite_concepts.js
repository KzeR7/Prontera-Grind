// Design review sheet: three candidate art directions for the fishing sprites, drawn by code so
// what you see is what the game can actually ship. Nothing here is wired into the game yet.
//   node tools/fish_sprite_concepts.js
// Writes docs/fish-sprite-concepts-haven-v301.png and docs/fish-sprite-concepts-zoom-haven-v301.png
const fs=require('node:fs'),path=require('node:path');
const {createCanvas}=require('@napi-rs/canvas');

// The game's own catalog + its current painter, so the comparison row is the real v297 art.
const F=require(path.join(__dirname,'..','assets','social-fishing.js'));
let curCanvas=null;
global.document={createElement:tag=>{if(tag!=='canvas')return{};const c=createCanvas(96,96);return c}};
function currentSprite(id){
 return F.fishSprite(id,null,96);
}

const COLS=[
 ['minnow','fish'],['koi','deep'],['greatwhite','shark'],['whaleshark','whale'],['morayeel','eel'],
 ['manta','ray'],['goby','puffer'],['angler','angler'],['gar','gar'],['sunperch','sunfish'],
 ['hammerpup','hammer'],['squid','squid'],['crab','crab'],
];

// ---------- palettes ------------------------------------------------------------------------
const h=(x)=>((x%360)+360)%360;
function rampFor(hue,style){
 const s=style==='kawaii'?58:style==='pixel'?72:74;
 if(style==='pixel')return {0:`hsl(${h(hue)},${s}%,74%)`,1:`hsl(${h(hue)},${s}%,54%)`,2:`hsl(${h(hue)},${s}%,38%)`,3:`hsl(${h(hue)},${s-20}%,20%)`,out:`hsl(${h(hue)},38%,10%)`,fin:`hsl(${h(hue)},${s}%,46%)`,finD:`hsl(${h(hue)},${s}%,32%)`};
 if(style==='kawaii')return {0:`hsl(${h(hue)},${s}%,86%)`,1:`hsl(${h(hue)},${s}%,74%)`,2:`hsl(${h(hue)},${s}%,64%)`,3:`hsl(${h(hue)},${s}%,56%)`,out:`hsl(${h(hue)},32%,30%)`,fin:`hsl(${h(hue)},${s}%,70%)`,finD:`hsl(${h(hue)},${s}%,58%)`};
 return {0:`hsl(${h(hue)},${s}%,70%)`,1:`hsl(${h(hue)},${s}%,56%)`,2:`hsl(${h(hue)},${s}%,42%)`,3:`hsl(${h(hue)},${s}%,30%)`,out:`hsl(${h(hue)},62%,14%)`,fin:`hsl(${h(hue)},${s}%,50%)`,finD:`hsl(${h(hue)},${s}%,34%)`};
}

// ---------- shared geometry (100x100 units) --------------------------------------------------
const P=(g,pts)=>{g.beginPath();g.moveTo(pts[0][0],pts[0][1]);for(let i=1;i+1<pts.length;i+=2)g.quadraticCurveTo(pts[i][0],pts[i][1],pts[i+1][0],pts[i+1][1]);g.closePath()};
const poly=(g,pts)=>{g.beginPath();g.moveTo(pts[0][0],pts[0][1]);for(const p of pts.slice(1))g.lineTo(p[0],p[1]);g.closePath()};

// Each family returns {body, fins:[], extras:fn} in unit space so every style shares a silhouette.
function geometry(family){
 const B={},fins=[];
 let extras=null;
 if(family==='fish'){
  B.body=[[22,52],[34,38],[58,36],[82,46],[88,52],[80,60],[56,68],[34,66],[22,52]];
  fins.push([[30,52],[12,40],[4,38],[14,52],[4,66],[12,64],[30,52]]);
  // fins must break the silhouette, or the body fill hides them completely
  fins.push([[42,42],[50,16],[64,24],[70,40],[54,42],[42,42]]);
  fins.push([[50,64],[56,88],[66,70],[56,68],[50,64]]);
  extras=g=>{g.beginPath();g.moveTo(56,50);g.quadraticCurveTo(50,54,56,58);};
 }else if(family==='deep'){
  B.body=[[26,52],[36,24],[58,20],[80,38],[84,52],[80,66],[58,84],[36,80],[26,52]];
  fins.push([[32,52],[10,32],[2,28],[12,52],[2,76],[10,72],[32,52]]);
  fins.push([[42,24],[52,6],[74,14],[78,34],[54,26],[42,24]]);
  fins.push([[44,80],[54,96],[74,88],[76,70],[54,78],[44,80]]);
  extras=g=>{g.beginPath();g.moveTo(58,50);g.quadraticCurveTo(52,54,58,58);};
 }else if(family==='shark'){
  B.body=[[16,54],[36,40],[66,38],[94,46],[100,52],[88,58],[58,66],[32,64],[16,54]];
  fins.push([[36,54],[12,34],[0,38],[12,54],[2,72],[12,70],[36,54]]);
  fins.push([[50,40],[60,22],[76,38],[60,42],[50,40]]);
  fins.push([[52,64],[62,78],[74,64],[62,66],[52,64]]);
  extras=g=>{g.lineWidth=1.6;for(let i=0;i<3;i++){g.beginPath();g.moveTo(70+i*5,44);g.quadraticCurveTo(68+i*5,52,70+i*5,60);g.stroke()}};
 }else if(family==='whale'){
  B.body=[[14,54],[30,36],[58,30],[86,38],[98,50],[92,62],[64,72],[30,70],[14,54]];
  fins.push([[30,54],[6,36],[0,42],[10,56],[0,72],[10,74],[30,54]]);
  fins.push([[52,32],[60,20],[70,32],[60,34],[52,32]]);
  extras=g=>{g.lineWidth=1.8;for(let i=0;i<3;i++){g.beginPath();g.moveTo(42,60+i*4);g.quadraticCurveTo(64,62+i*4,86,58+i*4);g.stroke()}};
 }else if(family==='eel'){
  B.body=[[14,60],[18,40],[34,34],[52,46],[70,58],[86,50],[94,38],[96,52],[86,66],[68,72],[50,60],[34,50],[20,68],[14,60]];
  fins.push([[20,46],[8,38],[2,40],[12,50],[4,58],[12,58],[20,46]]);
  extras=g=>{g.lineWidth=1.6;for(let i=0;i<4;i++){g.beginPath();g.moveTo(34+i*13,46);g.quadraticCurveTo(38+i*13,56,34+i*13,66);g.stroke()}};
 }else if(family==='ray'){
  // Seen from above: a kite with wavy wing tips and two little cephalic horns.
  B.body=[[50,30],[70,34],[86,46],[96,56],[82,60],[62,66],[50,76],[38,66],[18,60],[4,56],[14,46],[30,34],[50,30]];
  fins.push([[44,32],[40,14],[48,20],[50,30],[44,32]]);
  fins.push([[56,32],[60,14],[52,20],[50,30],[56,32]]);
  fins.push([[50,74],[49,90],[50,99],[51,90],[50,74]]);
  extras=g=>{for(let i=0;i<3;i++){g.beginPath();g.moveTo(40+i*10,40);g.quadraticCurveTo(42+i*10,48,40+i*10,56);g.stroke()}};
 }else if(family==='puffer'){
  const r=26;const pts=[];for(let i=0;i<16;i++){const a=i/16*Math.PI*2;const rr=i%2?r+9:r;pts.push([50+Math.cos(a)*rr,52+Math.sin(a)*rr])}
  B.body=pts.length?(()=>{const o=[];for(let i=0;i<pts.length;i+=2)o.push(pts[i]);return o})():[];
  fins.push([[24,52],[8,44],[2,48],[10,56],[2,62],[10,62],[24,52]]);
  extras=g=>{g.lineWidth=1.4;for(let i=0;i<5;i++){g.beginPath();g.arc(30+i*9,56,1.6,0,7);g.stroke()}};
 }else if(family==='angler'){
  B.body=[[20,56],[32,38],[60,34],[80,44],[84,60],[66,72],[38,72],[22,66],[20,56]];
  fins.push([[24,54],[8,42],[2,46],[10,58],[2,68],[10,68],[24,54]]);
  fins.push([[48,36],[56,22],[68,36],[56,38],[48,36]]);
  extras=g=>{g.beginPath();g.arc(84,24,5,0,7);g.fillStyle='#ffe9a8';g.fill();g.strokeStyle='hsl(48,80%,60%)';g.lineWidth=1.6;g.stroke();
   g.beginPath();g.moveTo(84,29);g.quadraticCurveTo(76,34,70,36);g.strokeStyle='hsl(48,60%,45%)';g.lineWidth=1.4;g.stroke();
   g.beginPath();g.moveTo(44,66);g.quadraticCurveTo(60,70,76,64);g.fillStyle='#f6efe0';g.fill();g.strokeStyle='hsl(30,20%,20%)';g.lineWidth=1.4;g.stroke();
   for(let i=0;i<4;i++){poly(g,[[50+i*6,67],[53+i*6,71],[56+i*6,67]]);g.fillStyle='#fff';g.fill()}};
 }else if(family==='gar'){
  B.body=[[18,50],[30,42],[74,40],[92,44],[104,46],[92,50],[74,54],[30,56],[18,50]];
  fins.push([[24,50],[8,40],[2,42],[10,52],[2,60],[10,60],[24,50]]);
  fins.push([[40,42],[48,34],[58,42],[48,44],[40,42]]);
  extras=g=>{g.lineWidth=1.4;for(let i=0;i<5;i++){g.beginPath();g.arc(40+i*8,46,1.3,0,7);g.stroke()}};
 }else if(family==='sunfish'){
  B.body=[[26,52],[34,26],[52,20],[70,26],[78,52],[70,78],[52,84],[34,78],[26,52]];
  fins.push([[30,52],[14,40],[8,44],[16,54],[8,64],[16,64],[30,52]]);
  fins.push([[52,22],[56,4],[70,10],[74,30],[56,24],[52,22]]);
  fins.push([[52,82],[56,98],[70,92],[74,72],[56,80],[52,82]]);
  extras=g=>{g.lineWidth=1.5;for(let i=0;i<4;i++){g.beginPath();g.arc(40+i*9,56,1.7,0,7);g.stroke()}};
 }else if(family==='hammer'){
  B.body=[[18,54],[38,44],[70,42],[92,44],[96,52],[86,58],[58,62],[30,62],[18,54]];
  fins.push([[32,54],[8,38],[0,42],[10,54],[2,68],[10,66],[32,54]]);
  fins.push([[48,44],[58,28],[72,44],[58,46],[48,44]]);
  fins.push([[56,42],[60,26],[88,30],[94,42],[70,44],[56,42]]);
  extras=g=>{g.lineWidth=1.5;for(let i=0;i<3;i++){g.beginPath();g.moveTo(66+i*5,50);g.quadraticCurveTo(64+i*5,56,66+i*5,60);g.stroke()}};
 }else if(family==='squid'){
  B.body=[[50,8],[64,20],[72,38],[68,58],[50,68],[32,58],[28,38],[36,20],[50,8]];
  fins.push([[50,10],[26,4],[24,18],[42,24],[50,10]]);
  fins.push([[50,10],[74,4],[76,18],[58,24],[50,10]]);
  extras=g=>{ // six arms, the outer pair longer, all curling outwards
   const arms=[[-1,.9],[-1,.55],[-1,.2],[1,.9],[1,.55],[1,.2]];
   arms.forEach(([s,k],i)=>{g.beginPath();g.moveTo(50+s*10,64+i%2*3);
    g.quadraticCurveTo(50+s*34*k,74+i*3,50+s*(16+26*k),92-i*2);g.stroke()})};
 }else if(family==='crab'){
  B.body=[[24,54],[28,40],[38,34],[50,32],[62,34],[72,40],[76,54],[70,66],[50,70],[30,66],[24,54]];
  // claws: a fat pincer each side
  fins.push([[26,44],[10,34],[2,34],[6,44],[0,50],[8,54],[14,50],[26,56],[26,44]]);
  fins.push([[74,44],[90,34],[98,34],[94,44],[100,50],[92,54],[86,50],[74,56],[74,44]]);
  extras=g=>{
   for(const s of [-1,1])for(let i=0;i<3;i++){g.beginPath();g.moveTo(50+s*22,56+i*4);
    g.quadraticCurveTo(50+s*36,64+i*8,50+s*32,84+i*2);g.stroke()};
   // eye stalks
   for(const s of [-1,1]){g.beginPath();g.moveTo(50+s*9,34);g.lineTo(50+s*11,24);g.stroke()}};
 }
 return {B,fins,extras};
}

// ---------- style renderers ------------------------------------------------------------------
function drawSprite(g,hue,family,style,px){
 const R=rampFor(hue,style);
 const {B,fins,extras}=geometry(family);
 // Draw in a 100x100 unit space and let the transform do the scaling - otherwise the 48px pixel
 // pass would render at 100 units and get clipped by its own canvas.
 const k=px/100;
 g.save();g.scale(k,k);
 const u=v=>v;
 const isPixel=style==='pixel',isKawaii=style==='kawaii';
 const lw=isPixel?3.8:isKawaii?3.6:3.2;
 const shade=(path)=>{ // soft bottom shading + top highlight, both clipped to the body
  g.save();P(g,path);g.clip();
  if(isPixel){g.fillStyle=R[2];g.beginPath();g.ellipse(u(50),u(88),u(58),u(26),0,0,7);g.fill();
   g.fillStyle=R[0];g.beginPath();g.ellipse(u(46),u(26),u(34),u(12),0,0,7);g.fill()}
  else if(isKawaii){g.fillStyle=R[2];g.globalAlpha=.75;g.beginPath();g.ellipse(u(50),u(92),u(48),u(24),0,0,7);g.fill();g.globalAlpha=1;
   g.fillStyle=R[0];g.beginPath();g.ellipse(u(42),u(36),u(22),u(13),-.35,0,7);g.fill()}
  else{g.fillStyle=R[2];g.globalAlpha=.85;g.beginPath();g.ellipse(u(50),u(92),u(52),u(30),0,0,7);g.fill();g.globalAlpha=1;
   g.fillStyle=R[0];g.beginPath();g.ellipse(u(44),u(34),u(24),u(12),-.3,0,7);g.fill();
   g.fillStyle='rgba(255,255,255,.55)';g.beginPath();g.ellipse(u(40),u(30),u(13),u(5),-.3,0,7);g.fill()}
  // Canvas keeps the current path across save/restore, so hand the body path back before the
  // caller strokes its outline - otherwise it inks the shading ellipse and you get a dark halo.
  P(g,path);
  g.restore()};
 const outline=w=>{g.lineJoin='round';g.lineCap='round';g.strokeStyle=isPixel?R.out:R.out;g.lineWidth=u(w);g.stroke()};
 const bodyPath=path=>{P(g,path)};

 // palette index by style => fill colour for a "part"
 const cBase=isPixel?R[1]:isKawaii?R[1]:R[1];
 const cFin=isPixel?R.fin:isKawaii?R.fin:R.fin;

 // fins behind the body
 g.lineJoin='round';g.lineCap='round';
 if(isKawaii){g.save();g.translate(50,54);g.scale(.96,1.16);g.translate(-50,-54)}
 for(const f of fins){
  P(g,f);
  if(style==='sticker'){g.strokeStyle='#fff';g.lineWidth=u(lw+4.5);g.stroke()}
  g.fillStyle=cFin;g.fill();outline(lw);
 }
 // angler lure + teeth read better in front; crab legs / squid tentacles draw behind
 const legsFirst=family==='crab'||family==='squid';

 // body
 bodyPath(B.body);
 if(style==='sticker'){g.strokeStyle='#fff';g.lineWidth=u(lw+5);g.stroke()}
 if(family==='puffer'&&Array.isArray(B.body)&&B.body.length<4){
  g.beginPath();g.arc(u(50),u(52),u(30),0,7);
 }
 g.fillStyle=cBase;g.fill();
 shade(B.body);
 outline(lw);

 // species patterns
 g.save();P(g,B.body);g.clip();
 if(family==='whale'){ // whale shark spots
  g.fillStyle='rgba(240,248,255,.85)';
  for(let i=0;i<16;i++){g.beginPath();g.arc(u(24+(i%6)*11),u(42+Math.floor(i/6)*10),u(isPixel?1.9:1.7),0,7);g.fill()}
 }else if(family==='deep'){ // koi patches
  g.fillStyle=isKawaii?'rgba(255,255,255,.55)':'rgba(255,240,235,.85)';
  g.beginPath();g.ellipse(u(44),u(38),u(13),u(9),-.3,0,7);g.fill();
  g.beginPath();g.ellipse(u(66),u(60),u(10),u(7),.4,0,7);g.fill();
 }else if(isKawaii){
  g.fillStyle='rgba(255,255,255,.5)';g.beginPath();g.ellipse(u(44),u(40),u(10),u(6),-.3,0,7);g.fill();
 }else if(isPixel){
  g.fillStyle=R[2];for(let i=0;i<2;i++)g.fillRect(u(38+i*16),u(36),u(7),u(34));
 }else{
  g.globalAlpha=.32;g.fillStyle=R[3];for(let i=0;i<2;i++){poly(g,[[u(40+i*16),u(34)],[u(46+i*16),u(52)],[u(40+i*16),u(70)],[u(44+i*16),u(70)],[u(50+i*16),u(52)],[u(44+i*16),u(34)]]);g.fill()}
  g.globalAlpha=1;
 }
 g.restore();

 // extras drawn after the body (gills, teeth, stripes, lure)
 if(extras){g.save();g.strokeStyle=R.out;g.lineJoin='round';g.lineCap='round';
  const wrap={get strokeStyle(){return g.strokeStyle},set strokeStyle(v){g.strokeStyle=v},get lineWidth(){return g.lineWidth},set lineWidth(v){g.lineWidth=v},
   beginPath:()=>g.beginPath(),moveTo:(a,b)=>g.moveTo(u(a),u(b)),lineTo:(a,b)=>g.lineTo(u(a),u(b)),
   quadraticCurveTo:(a,b,c,d)=>g.quadraticCurveTo(u(a),u(b),u(c),u(d)),arc:(a,b,r,s,e)=>g.arc(u(a),u(b),u(r),s,e),
   stroke:()=>g.stroke(),fill:()=>g.fill(),closePath:()=>g.closePath(),
   get fillStyle(){return g.fillStyle},set fillStyle(v){g.fillStyle=v}};
  // scale-free path helpers inside extras use raw units, so run them through the wrapper
  const local={
   beginPath:()=>g.beginPath(),moveTo:(a,b)=>g.moveTo(u(a),u(b)),lineTo:(a,b)=>g.lineTo(u(a),u(b)),
   quadraticCurveTo:(a,b,c,d)=>g.quadraticCurveTo(u(a),u(b),u(c),u(d)),arc:(a,b,r,s,e)=>g.arc(u(a),u(b),u(r),s,e),
   ellipse:(a,b,rx,ry,rot,s,e)=>g.ellipse(u(a),u(b),u(rx),u(ry),rot,s,e),
   stroke:()=>{g.lineWidth=u(isPixel?1.6:1.7);g.stroke()},fill:()=>g.fill(),closePath:()=>g.closePath(),
   get strokeStyle(){return g.strokeStyle},set strokeStyle(v){g.strokeStyle=v},
   get fillStyle(){return g.fillStyle},set fillStyle(v){g.fillStyle=v},
   get lineWidth(){return 1},set lineWidth(v){}};
  try{extras(local)}catch(e){}
  g.restore();
 }

 if(isKawaii)g.restore();
 // eye
 const eyeAt=family==='crab'?[[39,24],[61,24]]:family==='squid'?[[40,42],[60,42]]:family==='ray'?[[41,36],[59,36]]:[[70,48]];
 const er=family==='shark'||family==='whale'?(isKawaii?5:4):family==='eel'?3.6:(isKawaii?7:5);
 for(const [ex,ey] of eyeAt){
  if(family==='hammer'&&eyeAt.length===1){}
  if(isPixel){
   g.fillStyle='#fdfaf0';g.fillRect(u(ex-er*1.2),u(ey-er),u(er*2.4),u(er*2));
   g.fillStyle='#161412';g.fillRect(u(ex-er*.5),u(ey-er*.6),u(er*1.3),u(er*1.3));
   g.fillStyle='#fff';g.fillRect(u(ex-er*.4),u(ey-er*.5),u(er*.5),u(er*.5));
  }else if(isKawaii){
   // one big glossy eye, no ring around it - a ring is what makes it look googly
   g.beginPath();g.arc(u(ex),u(ey),u(er*1.12),0,7);g.fillStyle='#fffdf7';g.fill();
   g.strokeStyle=R.out;g.lineWidth=u(1.2);g.stroke();
   g.beginPath();g.arc(u(ex),u(ey-er*.12),u(er*.66),0,7);g.fillStyle='#241f1c';g.fill();
   g.fillStyle='#fff';g.beginPath();g.ellipse(u(ex-er*.28),u(ey-er*.4),u(er*.34),u(er*.27),-.5,0,7);g.fill();
   g.globalAlpha=.8;g.beginPath();g.arc(u(ex+er*.34),u(ey+er*.42),u(er*.15),0,7);g.fill();g.globalAlpha=1;
  }else{
   g.beginPath();g.arc(u(ex),u(ey),u(er),0,7);g.fillStyle=family==='angler'?'#ffe9a8':'#fbf6ea';g.fill();
   g.strokeStyle=R.out;g.lineWidth=u(1.4);g.stroke();
   g.beginPath();g.arc(u(ex+er*.15),u(ey),u(er*.55),0,7);g.fillStyle='#1b1815';g.fill();
   g.fillStyle='#fff';g.beginPath();g.arc(u(ex-er*.18),u(ey-er*.3),u(er*.28),0,7);g.fill();
   g.beginPath();g.arc(u(ex+er*.3),u(ey+er*.3),u(er*.16),0,7);g.fill();
  }
 }
 // kawaii blush + mouth
 if(isKawaii){
  g.globalAlpha=.45;g.fillStyle=`hsl(${h(hue+335)},90%,76%)`;
  const bx=family==='crab'?[[36,52],[64,52]]:[[77,60]];
  for(const [x,y] of bx){g.beginPath();g.ellipse(u(x),u(y),u(6),u(3.6),0,0,7);g.fill()}
  g.globalAlpha=1;
  // a small upward smile, just under the eye
  const mx=family==='crab'?50:64,my=family==='crab'?62:64;
  g.strokeStyle=R.out;g.lineWidth=u(2);g.beginPath();g.moveTo(u(mx-5),u(my-1));
  g.quadraticCurveTo(u(mx),u(my+4),u(mx+5),u(my-1));g.stroke();
 }
 g.restore();
 return px;
}

// ---------- sheet ---------------------------------------------------------------------------
const CELL=132,PAD=26,LABEL=22;
const ROWS=[
 ['v297 — current (for comparison)',null],
 ['A · Pixel 16-bit — hard 1px outline, 4-tone ramp, chunky read at 32px',"pixel"],
 ['B · Sticker cartoon — flat fills, thick ink outline, white rim, big eye',"sticker"],
 ['C · Kawaii chub — round body, oversized eye, blush, pastel ramp',"kawaii"],
];
const W=PAD*2+COLS.length*CELL, headerH=112;
const rowH=CELL+LABEL+18;
const H=headerH+ROWS.length*rowH+PAD;

const sheet=createCanvas(W,H),g=sheet.getContext('2d');
g.fillStyle='#12161d';g.fillRect(0,0,W,H);
g.fillStyle='#eef3fb';g.font='bold 25px sans-serif';g.textBaseline='top';
g.fillText('Horizon Haven — fish sprite directions (haven-v301 review)',PAD,PAD-6);
g.fillStyle='#8fa0b8';g.font='15px sans-serif';
g.fillText('Drawn by code from the game catalog, 96px cells. Nothing is wired into the game yet — pick a letter, or tell me what the Pinterest pins look like.',PAD,PAD+30);

let y=headerH;
for(const [label,style] of ROWS){
 g.fillStyle=style?'#eef3fb':'#7c8ba0';g.font='bold 15px sans-serif';
 g.fillText(label,PAD,y);
 const cy=y+24;
 COLS.forEach(([id,family],i)=>{
  const sp=F.speciesById(id),cx=PAD+i*CELL;
  g.fillStyle='#1b2230';g.beginPath();g.roundRect?g.roundRect(cx,cy,CELL-8,CELL-8,14):g.rect(cx,cy,CELL-8,CELL-8);g.fill();
  if(!style){
   const art=currentSprite(id);
   if(art)g.drawImage(art,cx+12,cy+12,CELL-32,CELL-32);
  }else{
   const size=style==='pixel'?48:100;
   const off=createCanvas(size,size),og=off.getContext('2d');
   drawSprite(og,sp.hue,family,style,size);
   let src=off;
   if(style==='pixel'){ // hard edges: snap alpha, then blow up with nearest neighbour
    const im=og.getImageData(0,0,size,size);
    for(let p=0;p<im.data.length;p+=4){if(im.data[p+3]<128){im.data[p+3]=0}else im.data[p+3]=255}
    og.putImageData(im,0,0);
   }
   g.imageSmoothingEnabled=style!=='pixel';
   g.drawImage(src,cx+13,cy+13,CELL-34,CELL-34);
   g.imageSmoothingEnabled=true;
  }
  g.fillStyle='#93a2b8';g.font='12px sans-serif';g.textAlign='center';
  g.fillText(sp.name,cx+(CELL-8)/2,cy+CELL-12);
  g.textAlign='left';
 });
 y+=rowH;
}
fs.writeFileSync(path.join(__dirname,'..','docs','fish-sprite-concepts-haven-v301.png'),sheet.toBuffer('image/png'));

// ---------- zoom sheet ----------------------------------------------------------------------
const ZOOM=[['minnow','fish'],['koi','deep'],['manta','ray'],['angler','angler'],['crab','crab']];
const ZC=260,ZW=PAD*2+ZOOM.length*ZC,ZH=headerH+3*ZC+40;
const zoom=createCanvas(ZW,ZH),zg=zoom.getContext('2d');
zg.fillStyle='#12161d';zg.fillRect(0,0,ZW,ZH);
zg.fillStyle='#eef3fb';zg.font='bold 24px sans-serif';
zg.fillText('Close-up — same species, three directions',PAD,PAD-6);
zg.fillStyle='#8fa0b8';zg.font='15px sans-serif';
zg.fillText('96px is what the bag, the index and the pond actually draw. Judge the shapes at this size, not the big one.',PAD,PAD+30);
let zy=headerH;
for(const [label,style] of [['B · Sticker cartoon','sticker'],['C · Kawaii chub','kawaii'],['A · Pixel 16-bit','pixel']]){
 zg.fillStyle='#eef3fb';zg.font='bold 15px sans-serif';zg.fillText(label,PAD,zy);
 ZOOM.forEach(([id,family],i)=>{
  const sp=F.speciesById(id),cx=PAD+i*ZC,cy=zy+22;
  zg.fillStyle='#1b2230';zg.beginPath();zg.roundRect?zg.roundRect(cx,cy,ZC-10,ZC-24,16):zg.rect(cx,cy,ZC-10,ZC-24);zg.fill();
  const size=style==='pixel'?48:180;
  const off=createCanvas(size,size),og=off.getContext('2d');
  drawSprite(og,sp.hue,family,style,size);
  if(style==='pixel'){const im=og.getImageData(0,0,size,size);for(let p=0;p<im.data.length;p+=4){im.data[p+3]=im.data[p+3]<128?0:255}og.putImageData(im,0,0)}
  zg.imageSmoothingEnabled=style!=='pixel';
  zg.drawImage(off,cx+14,cy+12,ZC-38,ZC-62);
  zg.imageSmoothingEnabled=true;
  zg.fillStyle='#93a2b8';zg.font='13px sans-serif';zg.textAlign='center';
  zg.fillText(sp.name,cx+(ZC-10)/2,cy+ZC-32);
  zg.textAlign='left';
 });
 zy+=ZC;
}
fs.writeFileSync(path.join(__dirname,'..','docs','fish-sprite-concepts-zoom-haven-v301.png'),zoom.toBuffer('image/png'));
console.log('wrote docs/fish-sprite-concepts-haven-v301.png and docs/fish-sprite-concepts-zoom-haven-v301.png');

if(process.env.ONE){
 const c=createCanvas(400,400),cg=c.getContext('2d');
 cg.fillStyle='#1b2230';cg.fillRect(0,0,400,400);
 drawSprite(cg,0,'fish',process.env.ONE,400);
 fs.writeFileSync('/tmp/one.png',c.toBuffer('image/png'));
}
