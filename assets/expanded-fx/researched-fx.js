/* Review-only skill-specific sequences. See expanded-fx-research.md for sources.
   These are interpretations, not extracted official keyframes. */
(function(root){'use strict';
const ids=new Set(['so_grave','so_varetyr','su_tiger','su_knuckle','dn_rain','ge_spore','so_buster','su_rampage','rg_prestige']);
const pi=Math.PI, tau=pi*2, clamp=x=>Math.max(0,Math.min(1,x)), ease=x=>1-Math.pow(1-clamp(x),3);
const rnd=i=>{let x=Math.sin(i*91.713+6.9)*43758.54;return x-Math.floor(x)};
function draw(g,id,t,project){if(!ids.has(id))return false;if(t<0||t>2.7)return true;
 const a=project(-1.65,1.15,0),b=project(1.65,1.1,0),floor=project(1.65,0,0),top=project(1.65,3.05,0),u=Math.abs(floor[1]-top[1])/3.05, fade=clamp((2.7-t)/.55);
 const line=(points,col,w,alpha=1,blur=0)=>{g.save();g.globalAlpha*=alpha*fade;g.strokeStyle=col;g.lineWidth=Math.max(.8,w);g.lineCap='round';g.lineJoin='round';g.shadowColor=col;g.shadowBlur=blur;g.beginPath();points.forEach((p,i)=>i?g.lineTo(p[0],p[1]):g.moveTo(p[0],p[1]));g.stroke();g.restore()};
 const ring=(x,y,r,flat,col,alpha,w)=>{if(r<=0||alpha<=0)return;g.save();g.globalAlpha=alpha*fade;g.strokeStyle=col;g.lineWidth=Math.max(.8,w);g.shadowColor=col;g.shadowBlur=u*.12;g.beginPath();g.ellipse(x,y,r,r*flat,0,0,tau);g.stroke();g.restore()};
 const glow=(x,y,r,col,alpha)=>{if(r<=0||alpha<=0)return;g.save();g.globalAlpha=alpha*fade;let q=g.createRadialGradient(x,y,0,x,y,r);q.addColorStop(0,'#fff');q.addColorStop(.14,col);q.addColorStop(1,'transparent');g.fillStyle=q;g.beginPath();g.arc(x,y,r,0,tau);g.fill();g.restore()};
 const spark=(x,y,r,col,alpha)=>{g.save();g.globalAlpha=alpha*fade;g.fillStyle=col;g.shadowColor=col;g.shadowBlur=u*.08;g.beginPath();g.arc(x,y,Math.max(.5,r),0,tau);g.fill();g.restore()};
 g.save();g.globalCompositeOperation='lighter';
 if(id==='so_grave'){
  // Earth Grave: root-spears erupt in a staggered field, not ice crystals.
  let cast=clamp(t/.3);ring(floor[0],floor[1],u*1.75*ease(cast),.28,'#d89a55',.7*(1-clamp((t-1.5)/.7)),u*.025);
  for(let i=0;i<18;i++){let delay=.22+rnd(i+5)*.38,age=t-delay;if(age<0)continue;let rise=ease(age/.28),fall=clamp((age-1.05)/.5),x=floor[0]+(rnd(i+31)*2-1)*u*1.55,y=floor[1]+(rnd(i+72)-.5)*u*.65,h=u*(.38+rnd(i+80)*1.25)*rise*(1-fall),w=u*(.06+rnd(i+23)*.09);if(h<=0)continue;
   g.save();g.globalAlpha=fade*(1-fall);g.globalCompositeOperation='source-over';g.fillStyle=i%2?'#a27a55':'#704c37';g.strokeStyle='#f0c08b';g.lineWidth=Math.max(1,u*.014);g.beginPath();g.moveTo(x-w,y);g.lineTo(x-w*.7,y-h*.32);g.lineTo(x-w*.35,y-h*.7);g.lineTo(x+w*.65,y-h);g.lineTo(x+w*.42,y-h*.5);g.lineTo(x+w,y);g.closePath();g.fill();g.stroke();g.restore();
   line([[x,y],[x+w*.06,y-h*.53],[x+w*.65,y-h]],'#ffe1b0',u*.012,.75*(1-fall));
   if(age<.55)for(let j=0;j<3;j++){let ang=rnd(i*3+j)*tau,d=u*ease(age*2)*(.18+rnd(j+i)*.6);spark(x+Math.cos(ang)*d,y-Math.abs(Math.sin(ang))*d,u*.025,'#ffcf8b',1-clamp(age/.55))}
  }glow(b[0],b[1],u*1.2,'#e9a667',Math.exp(-Math.max(0,t-.45)*8)*(t>.45?.6:0));
 }else if(id==='so_varetyr'){
  // Falling spear from above, electric branches and target strike.
  let p=ease((t-.18)/.32),x=b[0],y=b[1],sx=x+u*.5*(1-p),sy=y-u*3.1*(1-p);if(t>.18&&t<.7){line([[sx+u*.25,sy-u*.95],[sx,sy]],'#a2caff',u*.18,.5,u*.18);line([[sx+u*.25,sy-u*.95],[sx,sy]],'#fff',u*.035,1,u*.08);g.save();g.translate(sx,sy);g.rotate(-.17);g.fillStyle='#e9f8ff';g.strokeStyle='#599bea';g.lineWidth=u*.025;g.beginPath();g.moveTo(0,u*.28);g.lineTo(-u*.12,-u*.17);g.lineTo(-u*.04,-u*1.05);g.lineTo(u*.04,-u*1.05);g.lineTo(u*.12,-u*.17);g.closePath();g.fill();g.stroke();g.restore()}
  let age=t-.5;if(age>0){let hit=Math.exp(-age*5);glow(x,y,u*2.5,'#7ac7ff',hit);ring(floor[0],floor[1],u*(.1+ease(age*3)*1.8),.3,'#bdedff',1-clamp(age),u*.04);for(let k=0;k<7;k++){let pts=[[x,y]],xx=x,yy=y;for(let j=0;j<4;j++){xx+=(rnd(k*13+j+Math.floor(age*18)*47)-.5)*u*.5;yy-=u*(.23+rnd(k+j)*.18);pts.push([xx,yy])}line(pts,k%2?'#83bbff':'#fff',u*.025,hit,u*.08)}}
 }else if(id==='su_tiger'){
  // On damage: 80 blue radial streaks, inspired by EF_TEIHIT1T.
  let age=t-.27;if(age>0){let q=clamp(age/1.05);glow(b[0],b[1],u*1.8,'#41b8f0',Math.exp(-age*7));for(let i=0;i<80;i++){let angle=i*tau/80+rnd(i)*.06,r=u*(.1+q*(.8+rnd(i+4)*1.5)),len=u*(.3+rnd(i+8)*.5)*(1-q*.5),cx=b[0]+Math.cos(angle)*r,cy=b[1]+Math.sin(angle)*r*.72;line([[cx,cy],[cx+Math.cos(angle)*len,cy+Math.sin(angle)*len*.72]],i%5?'#41b8f0':'#f0ffff',u*(i%5?.016:.03),(1-q)*.8,u*.04)}ring(floor[0],floor[1],u*ease(q*2)*1.65,.28,'#72dcff',1-q,u*.035)}
 }else if(id==='su_knuckle'){
  // Directional fist-speed lines: source to target, then a concentrated impact.
  let dx=b[0]-a[0],dy=b[1]-a[1];for(let i=0;i<32;i++){let start=.12+rnd(i)*.27,age=t-start;if(age<0||age>.6)continue;let q=clamp(age/.6),offset=(rnd(i+33)-.5)*u*1.15,x=a[0]+dx*q,y=a[1]+dy*q+offset*(1-q*.65),length=u*(.35+rnd(i+60)*.7);line([[x-length,y-dy/Math.max(1,dx)*length],[x,y]],i%3?'#697dff':'#e3edff',u*(.018+rnd(i+15)*.025),(1-q)*.9,u*.06)}let age=t-.55;if(age>0){glow(b[0],b[1],u*1.5,'#819bff',Math.exp(-age*7));for(let j=0;j<12;j++){let angle=j*tau/12,r=u*ease(age*5)*1.3;line([[b[0],b[1]],[b[0]+Math.cos(angle)*r,b[1]+Math.sin(angle)*r]],'#d8e8ff',u*.027,Math.exp(-age*5))}}
 }else if(id==='ge_spore'||id==='so_buster'){
  // Eight outward-moving sprite blasts. Spore Explosion uses fiery bursts;
  // Poison Buster uses the blue-tinted counterpart in the documented client.
  let age=t-.3;if(age>=0){let q=clamp(age/1.5),isFire=id==='ge_spore',color=isFire?'#ff6938':'#626cff';
   for(let i=0;i<8;i++){let angle=i*tau/8,dist=u*(.27+q*1.45),x=b[0]+Math.cos(angle)*dist,y=b[1]+Math.sin(angle)*dist*.38,burst=clamp(age/.12)*(1-q),r=u*(.2+ease(q*3)*.35);
    glow(x,y,r*(isFire?1.5:1.3),color,burst*.8);
    for(let j=0;j<5;j++){let p=(age*.8+rnd(i*9+j))%1,off=u*p*.32;spark(x+Math.cos(j*tau/5)*off,y+Math.sin(j*tau/5)*off,u*(.02+.025*(1-p)),isFire?'#ffb37a':'#bdc8ff',burst*(1-p))}
   }
   ring(floor[0],floor[1],u*ease(age*2)*1.6,.28,color,(1-q)*.55,u*.03);
  }
 }else if(id==='su_rampage'){
  // Rampage Blaster: cyan column and two expanding ground rings on caster.
  let home=project(-1.65,0,0),cy=home[1]-u*.8,age=t-.24;if(age>0){let q=clamp(age/1.05),height=u*2.7*ease(age*6),w=u*(.4+ease(age*4)*.48);
   glow(home[0],cy,u*1.5,'#50d9ff',Math.exp(-age*5)*.8);
   g.save();g.globalAlpha=fade*(1-q)*.6;let grad=g.createLinearGradient(home[0]-w,0,home[0]+w,0);grad.addColorStop(0,'transparent');grad.addColorStop(.25,'#3b9cff');grad.addColorStop(.5,'#efffff');grad.addColorStop(.75,'#3b9cff');grad.addColorStop(1,'transparent');g.fillStyle=grad;g.fillRect(home[0]-w,home[1]-height,w*2,height);g.restore();
   for(let j=0;j<2;j++){let z=clamp((age-j*.12)/.7);ring(home[0],home[1],u*(.2+ease(z)*1.8),.3,j?'#d9ffff':'#42caff',(1-z)*.85,u*.04)}
   for(let i=0;i<32;i++){let x=home[0]+(rnd(i)-.5)*u*1.4,y=home[1]-u*((age*(1+rnd(i+2))*2+rnd(i+6))%2.5);line([[x,y+u*.24],[x,y-u*.18]],'#9ceaff',u*.015,(1-q)*.8)}
  }
 }else if(id==='rg_prestige'){
  // Prestige's converging golden needles focus on the caster, not a shield.
  let home=project(-1.65,0,0),x=home[0],y=home[1]-u*.8,q=clamp(t/.85);for(let i=0;i<80;i++){let angle=i*tau/80,r=u*(2.2-(1-q)*.1-ease(q)*1.65)+rnd(i)*u*.25,len=u*(.15+rnd(i+13)*.4);line([[x+Math.cos(angle)*(r+len),y+Math.sin(angle)*(r+len)*.7],[x+Math.cos(angle)*r,y+Math.sin(angle)*r*.7]],i%4?'#ffd96f':'#fff',u*.015,(1-q)*.7)}if(t>.6)glow(x,y,u*1.5,'#ffd96f',Math.exp(-(t-.6)*6)*.75);ring(x,home[1],u*(.5+ease(t*3)*.7),.3,'#ffe9a2',clamp((1.5-t)*2)*.65,u*.025);
 }else if(id==='dn_rain'){
  // Cast, then a sustained localized volley with repeated landing ripples.
  const source=project(-1.65,0,0);ring(source[0],source[1],u*.85*ease(t*4),.3,'#d9baff',.7*(1-clamp((t-.4)/.5)),u*.025);
  if(t>.32){let field=clamp((t-.32)/.25)*(1-clamp((t-2.1)/.5));ring(floor[0],floor[1],u*1.7,.28,'#8bbfff',field*.5,u*.025);for(let i=0;i<42;i++){let v=(t*.95+rnd(i+3))%1,x=floor[0]+(rnd(i+33)*2-1)*u*1.65,y=floor[1]-u*2.5+v*u*2.4;line([[x+u*.24,y-u*.48],[x,y]],i%4?'#a8d9ff':'#fff',u*(.012+rnd(i+5)*.02),field*(v<.85?.9:.35));if(v>.86){let r=u*.22*(v-.86)/.14;ring(x,floor[1]+(rnd(i+80)-.5)*u*.35,r,.35,'#d1f4ff',field*(1-v)*5,u*.015)}}}
 }
 g.restore();return true}
root.PGResearchedFx={has:id=>ids.has(id),ids:()=>[...ids],draw};
})(globalThis);
