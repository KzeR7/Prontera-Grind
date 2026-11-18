/* Preview-only action designs. No combat or sprite modifications.
 * References and departures are documented in expanded-fx-research.md. */
(function(root){'use strict';
const ids=new Set(['sa_dispel','bi_plant','al_flora','ko_kunai','ko_cross','ko_moon','ko_shadow','ko_soul','ko_izayoi','ko_petal',
 'mo_sphere','mo_triple','mo_chain','ch_asura','ch_glacier','ch_palm','ch_crush','ch_fury','ch_zen','su_sky','su_rising','su_gate']);
const T=Math.PI*2,C=x=>Math.max(0,Math.min(1,x)),E=x=>1-(1-C(x))**3,R=i=>{const n=Math.sin(i*135.67+5.43)*43758.5;return n-Math.floor(n)};
const kunaiImage=typeof Image==='function'?new Image():null;if(kunaiImage)kunaiImage.src='/tools/review-assets/user-kunai-horizontal.png';
const plantImages={};if(typeof Image==='function')for(const n of ['flora','geographer']){plantImages[n]=new Image();plantImages[n].src='/tools/review-assets/'+n+'-idle.png'}
const fire=typeof Image==='function'?new Image():null;if(fire)fire.src='/assets/ro-fx/bakuretsu.webp';
function draw(g,id,t,project){if(!ids.has(id))return false;if(t<0||t>2.7)return true;
 const home=project(-1.65,0,0),target=project(1.65,0,0),top=project(1.65,3.05,0),u=Math.max(1,Math.abs(target[1]-top[1])/3.05),a=project(-1.65,1.25,0),b=project(1.65,1.1,0),fade=C((2.7-t)/.45);
 const line=(pts,col,w,alpha=1,blur=0)=>{if(alpha<=0)return;g.save();g.globalAlpha*=alpha*fade;g.strokeStyle=col;g.lineWidth=Math.max(.65,w*u);g.lineCap='round';g.lineJoin='round';g.shadowColor=col;g.shadowBlur=blur*u;g.beginPath();pts.forEach((p,i)=>i?g.lineTo(p[0],p[1]):g.moveTo(p[0],p[1]));g.stroke();g.restore()};
 const ring=(x,y,r,flat,col,alpha=1,w=.025,start=0,end=T)=>{if(r<=0||alpha<=0)return;g.save();g.globalAlpha*=alpha*fade;g.strokeStyle=col;g.shadowColor=col;g.shadowBlur=u*.08;g.lineWidth=Math.max(.7,w*u);g.beginPath();g.ellipse(x,y,r*u,r*u*flat,0,start,end);g.stroke();g.restore()};
 const glow=(x,y,r,col,alpha)=>{if(alpha<=0)return;g.save();g.globalAlpha*=alpha*fade;let z=g.createRadialGradient(x,y,0,x,y,r*u);z.addColorStop(0,'#fff');z.addColorStop(.14,col);z.addColorStop(1,'transparent');g.fillStyle=z;g.beginPath();g.arc(x,y,r*u,0,T);g.fill();g.restore()};
 const motes=(x,y,age,col,num=22)=>{if(age<0||age>1.4)return;let k=C(age/1.4);for(let i=0;i<num;i++){let an=R(i+19)*T,d=u*(.2+R(i+80)*1.5)*E(k*2),px=x+Math.cos(an)*d,py=y+Math.sin(an)*d*.65+u*k*k*.2;line([[px,py],[px-Math.cos(an)*u*.12,py-Math.sin(an)*u*.08]],i%4?col:'#fff',.018+R(i)*.02,1-k,.04)}};
 const pulse=(x,y,age,col)=>{if(age<0||age>1.2)return;glow(x,y,1.2,col,Math.exp(-age*9));ring(x,y,.15+E(age*3)*1.15,.72,col,1-C(age/.6),.035);motes(x,y,age,col)};
 const spheres=(x,y,age,phase=0)=>{for(let i=0;i<5;i++){let ang=i*T/5+phase+age*1.7,r=.55+E(age*2)*.28,px=x+Math.cos(ang)*u*r,py=y-u*.85+Math.sin(ang)*u*.33;glow(px,py,.23,'#71dcff',.65);ring(px,py,.07,1,'#f1ffff',.85,.02)}};
 g.save();g.globalAlpha=fade;
 if(id==='sa_dispel'){
  // Spell structure forms around the target and breaks apart; no ninja motifs.
  const x=b[0],y=b[1],open=C((t-.55)/.9);for(let k=0;k<3;k++){let radius=.65+k*.2;for(let j=0;j<6;j++){let ang=j*T/6+t*(k%2?-.35:.35),gap=open*(.18+k*.1);ring(x+Math.cos(ang)*open*u*.36,y+Math.sin(ang)*open*u*.36,radius,1,'#b7efff',(1-open)*.7,.016,ang+gap,ang+.7-gap)}}
  if(t>.5){glow(x,y,1.1,'#d9ffff',Math.exp(-(t-.5)*7)*.6);for(let i=0;i<20;i++){let age=t-.5,ang=R(i)*T,r=u*(.5+E(age)*1.2),px=x+Math.cos(ang)*r,py=y+Math.sin(ang)*r;line([[px,py],[px+Math.cos(ang)*u*.13,py+Math.sin(ang)*u*.13]],'#d9ffff',.02,1-C(age/1.1))}}
 }else if(id==='al_flora'||id==='bi_plant'){
  // A planted, rooted flower growing up from the ground; never a flying projectile.
  const x=target[0]-u*1.15,y=target[1]+u*.22,grow=E((t-.15)/.55),isGeo=id==='bi_plant';
  ring(x,y,.25+grow*.75,.27,'#b6d982',.55*(1-C((t-1.7)/.7)),.02);
  const img=plantImages[isGeo?'geographer':'flora'];if(img&&img.complete&&img.naturalWidth){
   let frames=isGeo?12:6,frame=Math.floor(t*(isGeo?6.4:8))%frames,scale=u*(isGeo?2.35:1.55)/100;
   // Client ACT frame, cropped from the original 240px pose canvas; clip rises out of ground.
   g.save();g.beginPath();g.rect(x-u*1.3,y-u*2.2*grow,u*2.6,u*2.35*grow);g.clip();g.imageSmoothingEnabled=false;g.drawImage(img,frame*240,0,240,240,x-120*scale,y-180*scale,240*scale,240*scale);g.restore();
  }
  for(let i=0;i<14;i++){let p=(t*.5+R(i))%1,px=x+(R(i+90)-.5)*u*1.4,py=y-p*u*1.4;glow(px,py,.045,'#e6f6b6',Math.sin(p*Math.PI)*.35)}
 }else if(id==='ko_kunai'){
  // One straight steel kunai, followed by the RO fire sprite at the target.
  let p=C((t-.1)/.43),x=a[0]+(b[0]-a[0])*p,y=a[1]+(b[1]-a[1])*p,angle=Math.atan2(b[1]-a[1],b[0]-a[0]);
  if(t>=.1&&p<1){line([[x-u*.8,y],[x,y]],'#ff6d55',.09,.5,.1);line([[x-u*.8,y],[x,y]],'#fff',.025,.8);g.save();g.translate(x,y);g.rotate(angle);if(kunaiImage&&kunaiImage.complete&&kunaiImage.naturalWidth)g.drawImage(kunaiImage,-u*.78,-u*.24,u*1.56,u*.48);g.restore()}
  let age=t-.53;if(age>=0){g.save();g.translate(b[0],b[1]);g.scale(2,2);g.translate(-b[0],-b[1]);if(fire&&fire.complete&&fire.naturalWidth){let frame=Math.min(26,Math.floor(age*10)),col=frame%5,row=Math.floor(frame/5);g.save();g.imageSmoothingEnabled=false;g.globalAlpha*=C((2.5-t)/.6);g.drawImage(fire,col*131,row*103,131,103,b[0]-u*1.2,b[1]-u*1.15,u*2.4,u*1.89);g.restore()}glow(b[0],b[1],1.6,'#ff3b30',Math.exp(-age*5)*.7);ring(target[0],target[1],.15+E(age*3)*1.35,.27,'#ff4a3d',1-C(age/.8),.045);motes(b[0],b[1],age,'#ff6858',30);g.restore()}
 }else if(id==='ko_moon'){
  // Moonlit fog on the target + three short pale impacts, matching this game's attack.
  let x=b[0],y=b[1];for(let i=0;i<10;i++){let p=(t*.18+R(i))%1,ang=i*T/10+t*.18,px=x+Math.cos(ang)*u*.65,py=y+Math.sin(ang)*u*.28;glow(px,py,.32,'#b5c7cb',Math.sin(p*Math.PI)*.12)}
  g.save();g.globalAlpha*=C(t*3)*C((2.3-t)*2);g.fillStyle='#e8f1e9';g.beginPath();g.arc(x,y-u*1.25,u*.65,0,T);g.fill();g.globalCompositeOperation='destination-out';g.beginPath();g.arc(x+u*.27,y-u*1.34,u*.60,0,T);g.fill();g.restore();
  for(let j=0;j<3;j++){let age=t-.48-j*.2;if(age>=0&&age<.4){let p=C(age/.4),ang=(j-1)*.55,dx=Math.cos(ang)*u,dy=Math.sin(ang)*u;line([[x-dx,y-dy],[x+dx,y+dy]],'#dceff1',.06,1-p,.08);pulse(x,y,age,'#a6d0d1')}}
 }else if(id==='ko_izayoi'){
  let x=home[0],y=home[1],phase=C(t/.5);ring(x,y,1.05*E(phase),.28,'#d5e7ed',.65,.025);g.save();g.globalAlpha*=phase*C((2.5-t));g.fillStyle='#e9f1e9';g.beginPath();g.arc(x,y-u*2,u*.65,0,T);g.fill();g.globalCompositeOperation='destination-out';g.beginPath();g.arc(x+u*.25,y-u*2.12,u*.60,0,T);g.fill();g.restore();for(let i=0;i<12;i++){let p=(t*.3+R(i))%1;glow(x+Math.cos(i*T/12+t)*u*.8,y-u*(.3+p*1.7),.07,'#c5e7e5',Math.sin(p*Math.PI)*.55)}
 }else if(id==='ko_shadow'){
  // High-contrast shadow doubles spread out from the caster, edged in moonlit teal.
  const x=home[0],y=home[1],appear=C(t/.3),out=E(t*2),vanish=C((2.5-t)/.6);
  ring(x,y,1.2*E(t*4),.28,'#9fe2df',.75*vanish,.035);
  for(let i=0;i<2;i++){let side=i?1:-1,px=x+side*u*(.22+out*.9),py=y;g.save();g.globalAlpha=appear*vanish*.8;g.fillStyle='#29404c';g.strokeStyle='#c5efed';g.shadowColor='#8bd4d3';g.shadowBlur=u*.18;g.lineWidth=Math.max(1,u*.025);
   g.beginPath();g.arc(px,py-u*1.46,u*.18,0,T);g.fill();g.stroke();
   g.beginPath();g.moveTo(px-u*.22,py-u*1.25);g.lineTo(px+u*.22,py-u*1.25);g.lineTo(px+u*.35,py-u*.48);g.lineTo(px+u*.18,py-u*.4);g.lineTo(px+u*.23,py-u*.05);g.lineTo(px-u*.23,py-u*.05);g.lineTo(px-u*.18,py-u*.4);g.lineTo(px-u*.35,py-u*.48);g.closePath();g.fill();g.stroke();g.restore();
   for(let j=0;j<5;j++){let p=(t*.7+R(i*10+j))%1;glow(px+Math.sin(j*3+t)*u*.22,py-u*(.2+p*1.7),.075,'#a9dfdf',Math.sin(p*Math.PI)*.55)}
  }
 }else if(id==='ko_cross'){
  for(let i=0;i<2;i++){let age=t-.22-i*.15;if(age<0||age>.6)continue;let p=C(age/.6),x=b[0],y=b[1],sign=i?1:-1;line([[x-u,y+sign*u*.58],[x+u,y-sign*u*.58]],'#e6f1ef',.08,1-p,.08);pulse(x,y,age,'#a5d2d1')}
 }else if(id==='ko_soul'){
  let age=t-.28;if(age>=0){let q=C(age/.5),x=b[0],y=b[1],dx=u*1.1;line([[x-dx,y+dx*.55],[x+dx,y-dx*.55]],'#ecfbf8',.055,1-q,.05);line([[x-dx,y+dx*.55],[x+dx,y-dx*.55]],'#91ccc7',.13,(1-q)*.3,.1);pulse(x,y,age,'#a5d9d2')}
 }else if(id==='ko_petal'){
  // The client combines kunai orbit, blue ribbons and 50 white petals at the target.
  let x=b[0],y=b[1];for(let j=0;j<4;j++){let ang=t*5+j*T/4,rx=u*(.6+j*.07);ring(x,y,rx/u,.38,'#a5d9e3',.48*C((1.7-t)*2),.035,ang,ang+2.0);let px=x+Math.cos(ang)*rx,py=y+Math.sin(ang)*rx*.38;line([[px-u*.12,py+u*.05],[px+u*.12,py-u*.05]],'#e1e5e5',.055,.9)}for(let i=0;i<50;i++){let p=(t*.44+R(i+10))%1,px=x+(R(i+20)-.5)*u*4.2+Math.sin(t*2+i)*u*.15,py=y-u*2.5+p*u*3.1;g.save();g.globalAlpha*=Math.sin(p*Math.PI)*.8;g.translate(px,py);g.rotate(t*3+i);g.fillStyle=i%4?'#f5f2ed':'#f3c9cf';g.beginPath();g.ellipse(0,0,u*.10,u*.055,0,0,T);g.fill();g.restore()}
 }else if(['mo_sphere','ch_zen','ch_fury','su_rising'].includes(id)){
  let x=home[0],y=home[1];spheres(x,y,t,id==='ch_zen'?1:0);if(id==='ch_fury'){for(let i=0;i<22;i++){let ang=i*T/22,r=u*(.4+E(t*2)*1.25);line([[x+Math.cos(ang)*r,y-u*.8+Math.sin(ang)*r*.6],[x+Math.cos(ang)*(r+u*.3),y-u*.8+Math.sin(ang)*(r+u*.3)*.6]],'#ffac73',.03,C((1.8-t)*2))}}else if(id==='su_rising'){for(let j=0;j<3;j++)ring(x,y-u*(.3+j*.4),.65+j*.15,.28,'#7ad9ff',.6,.035,t*3+j,t*3+j+4);for(let i=0;i<18;i++){let p=(t*.7+R(i))%1;glow(x+Math.sin(p*8+i)*u*.45,y-p*u*2,.09,'#c8f6ff',Math.sin(p*Math.PI)*.6)}}else {ring(x,y,1.1*E(t*3),.3,'#9deaff',.5,.025);if(id==='ch_zen')for(let i=0;i<5;i++){let an=i*T/5;line([[x+Math.cos(an)*u*1.6,y-u*.85+Math.sin(an)*u*.7],[x+Math.cos(an)*u*.7,y-u*.85+Math.sin(an)*u*.3]],'#d7faff',.025,C((.8-t)*2))}}
 }else if(id==='su_sky'){
  const x=home[0],y=home[1]-u*.5;for(let j=0;j<3;j++){let q=C((t-.12-j*.09)/.7);if(q>0&&q<1)ring(x,y, .5+q*1.35,.36,'#b1eaff',1-q,.09-j*.02,t*7+j*2,t*7+j*2+2.7)}if(t>.3)pulse(x,y,t-.3,'#88d9ff');
 }else {
  // Monk / Champion combos: blunt contact flashes, no weapon or sword silhouette.
  const count={mo_triple:3,mo_chain:4,ch_glacier:1,ch_palm:1,ch_crush:5,ch_asura:1,su_gate:5}[id]||1;
  const col=id==='ch_glacier'?'#8de9ff':id==='ch_asura'?'#a5dfff':'#ffd3a0';
  for(let i=0;i<count;i++){let delay=.22+i*.13,age=t-delay;if(age<0||age>.7)continue;let x=b[0]+(R(i+10)-.5)*u*.35,y=b[1]+(R(i+40)-.5)*u*.45;pulse(x,y,age,col);for(let j=0;j<8;j++){let an=j*T/8+i*.19,r=u*E(age*5)*(.5+R(j)*.45);line([[x+Math.cos(an)*r*.3,y+Math.sin(an)*r*.3],[x+Math.cos(an)*r,y+Math.sin(an)*r]],col,.025,Math.exp(-age*6))}}
  if(id==='ch_palm'&&t>.2&&t<.7){let p=C((t-.2)/.5);ring(b[0]+u*p*.5,b[1],.3+p*.8,.55,'#ffdfba',1-p,.06)}
  if(id==='ch_glacier'&&t>.25&&t<1.5){let q=E((t-.25)*3);for(let i=0;i<7;i++){let ang=i*T/7,x=b[0]+Math.cos(ang)*u*.45,y=b[1]+Math.sin(ang)*u*.45;line([[x,y],[x+Math.cos(ang)*u*.35*q,y+Math.sin(ang)*u*.35*q]],'#d7ffff',.04,C((1.5-t)*3))}}
  if(id==='ch_asura'&&t>.22){let age=t-.22;ring(target[0],target[1],.2+E(age*3)*2,.28,'#8bdeff',1-C(age/.8),.06);glow(b[0],b[1],2,'#a8eaff',Math.exp(-age*5)*.7)}
 }
 g.restore();return true}
root.PGClassIdentityFx={has:id=>ids.has(id),ids:()=>[...ids],draw};
})(globalThis);
