/* Standalone concept batch: procedural accents on class-specific silhouettes.
   Review only; no game mechanics or native sprite art are altered. */
(function(root){
'use strict';
const defs={
 cr_guard:['shield','#ffe7a4','self',1],cr_shboom:['shieldThrow','#ffe198','target',1],cr_grand:['cross','#fff0ac','self',3],cr_holyx:['cross','#fff5c3','target',1],
 pa_chain:['shieldThrow','#ffdc89','target',3],pa_sac:['aura','#ff9b65','self',1],pa_press:['pillar','#ffeaba','target',1],pa_def:['shield','#a5d8ff','self',2],
 rg_vanish:['lance','#ffda85','target',1],rg_over:['cross','#ffc976','target',2],rg_cannon:['lance','#ffe1a3','target',3],rg_earth:['earth','#e9b877','self',1],rg_prestige:['shield','#ffd773','self',3],rg_genesis:['pillar','#fff5cf','target',3],
 al_flora:['flower','#a5eb83','target',1],bi_fcp:['shield','#b9f5af','self',1],bi_plant:['flower','#ffe788','target',2],ge_thorn:['thorn','#9ce27d','target',1],ge_spore:['spore','#d6a4f5','target',1],ge_hell:['flower','#ef799d','target',3],
 mo_sphere:['orbs','#a2dfff','self',3],mo_triple:['strike','#ffe2a6','target',3],ch_glacier:['strike','#a3eeff','target',1],ch_palm:['strike','#ffb88a','target',1],ch_crush:['strike','#ffbd79','target',5],ch_fury:['aura','#ff9e67','self',2],ch_zen:['orbs','#e4f2ff','self',5],su_tiger:['strike','#ff955d','target',2],su_rampage:['orbs','#ffbd67','self',5],su_sky:['strike','#b7e7ff','self',3],su_rising:['aura','#ffd17e','self',3],su_knuckle:['lance','#f8ce86','target',2],
 ro_strip:['shatter','#caafea','target',1],ro_back:['slash','#bfa6e5','target',1],ro_raid:['shadow','#b4a2d7','target',1],st_plag:['sigil','#d5bdff','self',1],st_full:['shatter','#e1b6ff','target',3],st_stalk:['shadow','#afa4d8','self',1],st_counter:['slash','#eed5ff','target',2],
 sc_tri:['arrows','#d2b6ff','target',3],sc_fatal:['slash','#f0adf5','target',3],sc_feint:['bomb','#eea4eb','target',1],sc_masq:['mask','#edbaf8','target',1],sc_auto:['sigil','#b3a8ff','self',2],sc_spell:['sigil','#d8a3f7','self',3]
};
const PI=Math.PI,TAU=PI*2,clamp=x=>Math.max(0,Math.min(1,x)),ease=x=>1-(1-clamp(x))**3,rand=n=>{let v=Math.sin(n*84.76+14.35)*37153.73;return v-Math.floor(v)};
// Extra impact pass: short white-hot keyframe, moving ribbons, fine flecks and
// class-specific secondary shapes. These accents are rendered above the core art.
function polish(g,kind,color,t,u,x,y,floor,n){
 const hit=.38,age=t-hit;if(age<0||age>1.8)return;const q=clamp(age/1.4),fade=(1-q)*clamp((2.35-t)/.4),hot=Math.exp(-age*10);
 function line(a,b,w,c,alpha){g.save();g.globalAlpha*=alpha;g.strokeStyle=c;g.lineWidth=Math.max(.5,u*w);g.lineCap='round';g.shadowColor=c;g.shadowBlur=u*.12;g.beginPath();g.moveTo(a[0],a[1]);g.lineTo(b[0],b[1]);g.stroke();g.restore()}
 function arc(r,start,end,alpha,flat=.55,width=.025){if(r<=0)return;g.save();g.globalAlpha*=alpha;g.lineWidth=Math.max(.6,u*width);g.strokeStyle=color;g.shadowColor=color;g.shadowBlur=u*.17;g.beginPath();g.ellipse(x,y,r,r*flat,0,start,end);g.stroke();g.restore()}
 g.save();g.globalCompositeOperation='lighter';
 // A compact additive bloom and directional impact rays, strongest on contact.
 if(hot>.005){const r=u*(1.65+Math.min(n,3)*.2),z=g.createRadialGradient(x,y,0,x,y,r);z.addColorStop(0,'rgba(255,255,255,.95)');z.addColorStop(.1,color);z.addColorStop(1,'transparent');g.globalAlpha=hot*.75;g.fillStyle=z;g.beginPath();g.arc(x,y,r,0,TAU);g.fill();g.globalAlpha=1;
  for(let i=0;i<12;i++){let a=i*TAU/12+rand(i+20)*.2,inner=u*.18,outer=u*(.8+rand(i+31)*1.1)*ease(age*14);line([x+Math.cos(a)*inner,y+Math.sin(a)*inner],[x+Math.cos(a)*outer,y+Math.sin(a)*outer],i%3?.018:.045,i%3?color:'#ffffff',hot*.85)}}
 // Thin spinning broken rings and shock ribbons expand over the first second.
 for(let j=0;j<3;j++){const r=u*(.42+j*.3+ease(age*2)*(.65+j*.2)),start=t*(j%2?-2.5:2)+j*1.7;arc(r,start,start+(j===1?2.1:1.35),fade*(.65-j*.13),.38+j*.12,j===0?.035:.014)}
 // Emission velocities, lifetimes and delayed starts differ per particle.
 for(let i=0;i<46;i++){let local=age-rand(i+400)*.32;if(local<=0||local>1.35)continue;let p=local/1.35,a=rand(i+201)*TAU,speed=u*(.5+rand(i+401)*2.2),dist=speed*ease(p*1.5),px=x+Math.cos(a)*dist,py=y+Math.sin(a)*dist*.65+u*.35*p*p,r=Math.max(.7,u*(.012+rand(i+88)*.035));g.globalAlpha=(1-p)*(.35+rand(i+9)*.65);g.fillStyle=i%4?'#fff':color;g.shadowColor=color;g.shadowBlur=u*.1;g.beginPath();g.arc(px,py,r,0,TAU);g.fill();if(i%3===0)line([px,py],[px-Math.cos(a)*u*.2,py-Math.sin(a)*u*.12],.012,color,1-p)}
 g.globalAlpha=1;g.shadowBlur=0;
 if(['strike','slash','lance','arrows'].includes(kind)){
  // Fast staggered blade-like crescents rather than stationary round bursts.
  for(let j=0;j<3;j++){let p=clamp((age-j*.09)/.55);if(p<=0||p>=1)continue;g.save();g.translate(x,y);g.rotate((j-1)*.55);g.globalAlpha=(1-p)*.9;g.fillStyle=j===1?'#ffffff':color;g.beginPath();g.moveTo(-u*1.55,-u*.10);g.quadraticCurveTo(u*.2,-u*(.5+p*.28),u*1.55,-u*.32);g.quadraticCurveTo(u*.1,-u*(.35+p*.28),-u*1.55,-u*.10);g.fill();g.restore()}
 }else if(['flower','thorn','earth','spore'].includes(kind)){
  // Wind-borne pollen, leaves or grit to accompany growth/explosion.
  for(let i=0;i<22;i++){let p=(age*.62+rand(i+60))%1,a=rand(i+18)*TAU,r=u*(.3+p*1.8),px=x+Math.cos(a)*r,py=floor-u*(p*1.6+rand(i)*.4);g.save();g.translate(px,py);g.rotate(a+t*2);g.globalAlpha=Math.sin(p*PI)*.7;g.fillStyle=i%4?'#e8ffd5':color;g.beginPath();g.ellipse(0,0,u*.055,u*.023,0,0,TAU);g.fill();g.restore()}
 }else if(['pillar','cross','shield','shieldThrow'].includes(kind)){
  // Holy glints and descending light fragments, not a solid opaque rectangle.
  for(let i=0;i<15;i++){let p=(age*.7+rand(i+4))%1,px=x+(rand(i+60)*2-1)*u*1.4,py=floor-u*(.1+p*2.3),r=u*(.05+rand(i+2)*.1);line([px-r,py],[px+r,py],.012,'#ffffff',Math.sin(p*PI)*.8);line([px,py-r*2],[px,py+r*2],.014,color,Math.sin(p*PI)*.8)}
 }else if(['orbs','aura','shadow','sigil','mask','shatter','bomb'].includes(kind)){
  for(let j=0;j<7;j++){let a=t*2+j*TAU/7,r=u*(.85+.16*Math.sin(t*3+j)),px=x+Math.cos(a)*r,py=y+Math.sin(a)*r*.65;line([px,py],[px-Math.sin(a)*u*.22,py+Math.cos(a)*u*.14],.025,j%2?color:'#ffffff',fade*.75)}
 }
 g.restore();
}
function draw(g,id,t,project){const spec=defs[id];if(!spec)return false;if(t>=2.35||t<0)return true;const [kind,color,anchor,n]=spec,home=project(-1.65,0,0),target=project(1.65,0,0),top=project(1.65,3.05,0),u=Math.max(1,(target[1]-top[1])/3.05),a=anchor==='self'?home:target,x=a[0],floor=a[1],y=floor-u*.8,fade=clamp(t/.1)*clamp((2.35-t)/.45),impact=.38,age=t-impact,q=clamp(age/.85);
 function line(x1,y1,x2,y2,w,c=color,alpha=1){g.save();g.globalAlpha*=alpha;g.strokeStyle=c;g.lineWidth=Math.max(.6,w);g.lineCap='round';g.shadowColor=c;g.shadowBlur=u*.11;g.beginPath();g.moveTo(x1,y1);g.lineTo(x2,y2);g.stroke();g.restore()}
 function circle(cx,cy,r,flat=1,alpha=1,c=color,w=.03,start=0,end=TAU){if(r<=0)return;g.save();g.globalAlpha*=alpha;g.strokeStyle=c;g.lineWidth=Math.max(.7,u*w);g.shadowColor=c;g.shadowBlur=u*.1;g.beginPath();g.ellipse(cx,cy,r,r*flat,0,start,end);g.stroke();g.restore()}
 function glow(cx,cy,r,alpha,c=color){if(r<=0||alpha<=0)return;g.save();g.globalAlpha*=alpha;let z=g.createRadialGradient(cx,cy,0,cx,cy,r);z.addColorStop(0,'#ffffff');z.addColorStop(.19,c);z.addColorStop(1,'transparent');g.fillStyle=z;g.beginPath();g.arc(cx,cy,r,0,TAU);g.fill();g.restore()}
 function path(points,fill,stroke=color){g.fillStyle=fill;g.strokeStyle=stroke;g.lineWidth=Math.max(1,u*.026);g.beginPath();points.forEach((p,i)=>i?g.lineTo(x+p[0]*u,y+p[1]*u):g.moveTo(x+p[0]*u,y+p[1]*u));g.closePath();g.fill();g.stroke()}
 g.save();g.globalAlpha=fade;
 // Anticipation, expanding pressure wave and deterministic micro-debris.
 circle(x,floor,u*(.35+ease(t*3)*1.25),.27,.6,color,.025,t*.8,t*.8+4.8);
 if(age>0){glow(x,y,u*1.55,Math.exp(-age*6)*.8);circle(x,floor,u*(.25+ease(q*2)*1.9),.28,1-q,color,.04);for(let i=0;i<28;i++){let z=age-rand(i+91)*.22;if(z<0||z>1.25)continue;let k=z/1.25,ang=rand(i+3)*TAU,d=u*(.4+rand(i+44)*1.7)*ease(k*2),px=x+Math.cos(ang)*d,py=y+Math.sin(ang)*d*.65+k*k*u*.25;line(px,py,px-Math.cos(ang)*u*.12,py-Math.sin(ang)*u*.08,u*(.018+rand(i+66)*.03),i%4?'#ffffff':color,1-k)}}
 // Skill-specific read, held long enough to see instead of a single generic flash.
 if(kind==='shield'||kind==='shieldThrow'){
  let travel=kind==='shieldThrow'?ease((t-.08)/.45):1,shift=kind==='shieldThrow'?(home[0]-target[0])*(1-travel):0;g.save();g.translate(shift,0);let z=clamp(t*4);g.globalAlpha*=z;path([[0,-1.25],[.7,-1.0],[.6,-.15],[0,.42],[-.6,-.15],[-.7,-1]],'rgba(92,98,120,.7)');path([[0,-1.05],[.48,-.88],[.4,-.25],[0,.18],[-.4,-.25],[-.48,-.88]],'rgba(240,220,160,.28)');line(x,y-u*.95,x,y+u*.12,u*.045,'#fff9e7');line(x-u*.34,y-u*.48,x+u*.34,y-u*.48,u*.045,'#fff9e7');circle(x,y-u*.46,u*.16,1,.9,'#ffffff',.03);g.restore();
 }else if(kind==='cross'||kind==='pillar'){
  let h=u*(1.8+Math.min(n,3)*.35)*ease(t*3);glow(x,y,u*1.3,.2);g.save();g.globalAlpha*=.45;let z=g.createLinearGradient(x-u*.25,0,x+u*.25,0);z.addColorStop(0,'transparent');z.addColorStop(.5,color);z.addColorStop(1,'transparent');g.fillStyle=z;g.fillRect(x-u*.38,floor-h,u*.76,h);g.restore();line(x,y-h*.32,x,y+u*.48,u*.09,'#ffffff');line(x-u*.48,y-h*.05,x+u*.48,y-h*.05,u*.08,color);for(let i=0;i<4;i++)circle(x,floor,u*(.7+i*.25),.28,.5,color,.016,t+i,t+i+2.5);
 }else if(kind==='lance'||kind==='arrows'){
  for(let i=0;i<n;i++){let k=clamp((t-.08-i*.09)/.45);if(k<=0||k>=1)continue;let px=home[0]+(target[0]-home[0])*k,py=home[1]-u*.85+(i-(n-1)/2)*u*.15;line(px-u*1.1,py,px+u*.4,py,u*.07,color,.75);line(px-u*.8,py,px+u*.45,py,u*.025,'#ffffff');g.fillStyle='#fff6d5';g.beginPath();g.moveTo(px+u*.6,py);g.lineTo(px+u*.2,py-u*.12);g.lineTo(px+u*.2,py+u*.12);g.closePath();g.fill()}
 }else if(kind==='earth'||kind==='thorn'||kind==='flower'){
  for(let i=0;i<(kind==='flower'?5:9);i++){let dx=(rand(i+3)*2-1)*u*1.25, grow=ease((t-i*.045)*2.7),h=u*(.35+rand(i+41)*.8)*grow;line(x+dx,floor,x+dx+dx*.15,floor-h,u*(kind==='thorn'?.07:.045),kind==='earth'?'#b3875b':'#79bb64');if(kind==='flower'){for(let k=0;k<5;k++){let a=k*TAU/5;glow(x+dx+Math.cos(a)*u*.13,floor-h+Math.sin(a)*u*.13,u*.15,.45,color)}glow(x+dx,floor-h,u*.13,.7,'#ffffff')}else{line(x+dx,floor-h*.45,x+dx+u*.13,floor-h*.55,u*.028,color)}}
 }else if(kind==='orbs'||kind==='aura'){
  for(let i=0;i<(kind==='orbs'?n:7);i++){let a=t*3+i*TAU/(kind==='orbs'?n:7),r=u*(.55+.14*Math.sin(t*2)),px=x+Math.cos(a)*r,py=y+Math.sin(a)*u*.32;glow(px,py,u*.28,.85);circle(px,py,u*.10,1,.85,'#ffffff',.025)}for(let j=0;j<3;j++)circle(x,floor,u*(.65+j*.28),.3,.65,color,.02,t*(j%2?1:-1)+j,t*(j%2?1:-1)+j+3.4);
 }else if(kind==='strike'||kind==='slash'){
  for(let i=0;i<n;i++){let z=clamp((t-.15-i*.1)/.26);if(z<=0||z>=1)continue;let a=(i-(n-1)/2)*.48,dx=Math.cos(a)*u*(1.05+z*.5),dy=Math.sin(a)*u*(1.05+z*.5);line(x-dx,y-dy,x+dx,y+dy,u*.16,color,(1-z)*.6);line(x-dx,y-dy,x+dx,y+dy,u*.045,'#ffffff',1-z)}
 }else if(kind==='spore'||kind==='bomb'){
  let pulse=1+Math.sin(t*18)*.12;glow(x,y,u*.7*pulse,.6);circle(x,y,u*.42*pulse,1,.85,color,.06);if(t>.4)for(let i=0;i<12;i++){let a=i*TAU/12,r=u*ease((t-.4)*1.5)*(1+rand(i));glow(x+Math.cos(a)*r,y+Math.sin(a)*r*.7,u*.13,clamp((1.8-t)*2),color)}
 }else if(kind==='mask'){
  path([[-.62,-.9],[0,-.65],[.62,-.9],[.48,-.12],[0,.12],[-.48,-.12]],'rgba(66,42,90,.85)');line(x-u*.43,y-u*.53,x-u*.1,y-u*.37,u*.05,'#fff');line(x+u*.1,y-u*.37,x+u*.43,y-u*.53,u*.05,'#fff');
 }else if(kind==='shatter'){
  for(let i=0;i<8;i++){let a=i*TAU/8,r=u*(.3+ease(t*2)*.9),px=x+Math.cos(a)*r,py=y+Math.sin(a)*r;line(px,py,px+Math.cos(a+.5)*u*.25,py+Math.sin(a+.5)*u*.25,u*.05,color)}
 }else if(kind==='shadow'||kind==='sigil'){
  for(let i=0;i<3;i++)circle(x,y,u*(.45+i*.22),1,.65,color,.02,t*(i%2?2:-2)+i,t*(i%2?2:-2)+i+4.2);for(let i=0;i<8;i++){let a=i*TAU/8+t;glow(x+Math.cos(a)*u*.9,y+Math.sin(a)*u*.9,u*.12,.65)}
 }
 polish(g,kind,color,t,u,x,y,floor,n);g.restore();return true;
}
root.PGExpandedBatchFx={has:id=>Object.hasOwn(defs,id),ids:()=>Object.keys(defs),draw};
})(globalThis);
