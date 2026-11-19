/* Review-only requested revisions. */
(function(root){'use strict';
const replaces=new Set(['sc_fog','nj_spear','pa_chain']);
const accents=new Set(['sa_dispel','mo_triple','mo_chain','ch_glacier','ch_palm','ch_crush','ch_fury','ch_zen','su_rising','su_knuckle','sc_fatal','sc_feint','ko_kunai','ko_moon','ko_petal','ko_soul']);
const T=Math.PI*2,C=x=>Math.max(0,Math.min(1,x)),E=x=>1-(1-C(x))**3,R=i=>{let n=Math.sin(i*145.57+2.48)*57437.2;return n-Math.floor(n)};
function draw(g,id,t,P){if(!replaces.has(id)&&!accents.has(id))return false;if(t<0||t>2.6)return true;
 let a=P(-1.65,1.25,0),b=P(1.65,1.1,0),home=P(-1.65,0,0),floor=P(1.65,0,0),top=P(1.65,3.05,0),u=Math.abs(floor[1]-top[1])/3.05,fade=C((2.6-t)/.5),self=['ch_fury','ch_zen','su_rising'].includes(id),x=self?home[0]:b[0],y=self?home[1]-u*.8:b[1];
 const line=(points,col,w,alpha)=>{if(alpha<=0)return;g.save();g.globalAlpha*=alpha*fade;g.strokeStyle=col;g.lineWidth=Math.max(.7,w*u);g.lineCap='round';g.shadowColor=col;g.shadowBlur=u*.08;g.beginPath();points.forEach((p,i)=>i?g.lineTo(...p):g.moveTo(...p));g.stroke();g.restore()};
 const ring=(x,y,r,flat,col,alpha,w)=>{if(r<=0||alpha<=0)return;g.save();g.globalAlpha*=alpha*fade;g.strokeStyle=col;g.lineWidth=Math.max(.7,w*u);g.shadowColor=col;g.shadowBlur=u*.12;g.beginPath();g.ellipse(x,y,r*u,r*u*flat,0,0,T);g.stroke();g.restore()};
 const glow=(x,y,r,col,alpha)=>{if(alpha<=0)return;g.save();g.globalAlpha*=alpha*fade;let z=g.createRadialGradient(x,y,0,x,y,r*u);z.addColorStop(0,'#fff');z.addColorStop(.17,col);z.addColorStop(1,'transparent');g.fillStyle=z;g.beginPath();g.arc(x,y,r*u,0,T);g.fill();g.restore()};
 const burst=(x,y,age,col,power=1)=>{if(age<0||age>1.2)return;let q=C(age/1.2);glow(x,y,1.6*power,col,Math.exp(-age*6)*.85);ring(x,y,(.1+E(age*3)*1.2)*power,.65,col,1-C(age/.7),.035);for(let i=0;i<38;i++){let ang=R(i+14)*T,dist=u*(.1+E(q*2)*(0.4+R(i+20)*1.5))*power,px=x+Math.cos(ang)*dist,py=y+Math.sin(ang)*dist*.68;line([[px,py],[px-Math.cos(ang)*u*.2,py-Math.sin(ang)*u*.14]],i%4?col:'#fff',.012+R(i)*.025,(1-q)*.9)}};
 if(id==='sc_fog'){
  // Dense billowing cloud expanding at the target, then suspended icy mist.
  let age=t-.18;if(age>=0){let grow=E(age*2.2),end=C((2.6-t)/.5);for(let i=0;i<22;i++){let ang=R(i)*T,dist=u*grow*(.2+R(i+32)*1.5),px=b[0]+Math.cos(ang)*dist+Math.sin(t+i)*u*.06,py=floor[1]-u*.25+Math.sin(ang)*dist*.32-R(i+54)*u*.5,r=u*(.3+R(i+68)*.45);g.save();g.globalAlpha=end*(.26+R(i)*.13);let z=g.createRadialGradient(px,py,0,px,py,r);z.addColorStop(0,'#e8f5fb');z.addColorStop(.35,'#96bac8');z.addColorStop(1,'transparent');g.fillStyle=z;g.beginPath();g.arc(px,py,r,0,T);g.fill();g.restore()}burst(b[0],b[1],age,'#d4f5ff',1.5);ring(floor[0],floor[1],.2+grow*1.8,.27,'#c1e8f0',.65*end,.03)}
 }else if(id==='nj_spear'){
  // Five successive pale ice spears fly in on straight lines and shatter.
  for(let i=0;i<5;i++){let age=t-(.1+i*.11),q=C(age/.43),yy=(i-2)*u*.15;if(age>=0&&q<1){let px=a[0]+(b[0]-a[0])*q,py=a[1]+(b[1]-a[1])*q+yy*(1-q);line([[px-u*.75,py],[px+u*.45,py]],'#c8f8ff',.08,.9);line([[px-u*.55,py],[px+u*.45,py]],'#fff',.025,1);g.save();g.fillStyle='#a7eaff';g.beginPath();g.moveTo(px+u*.55,py);g.lineTo(px+u*.1,py-u*.10);g.lineTo(px+u*.1,py+u*.10);g.closePath();g.fill();g.restore()}burst(b[0],b[1],age-.43,'#bdefff',.55)}
 }else if(id==='pa_chain'){
  // Shield projectiles themselves are the original native signature layer.
  for(let i=0;i<5;i++)burst(b[0],b[1],t-.35-i*.07,'#ffe3a0',.75);
 }else if(id==='ko_petal'){
  // The signature layer retains the current original effect; add the visible orb.
  let px=home[0],py=home[1]-u*2.0;glow(px,py,.8,'#8fe6ff',C(t*4)*C((2.1-t)*2)*.65);ring(px,py,.35,1,'#e8ffff',.75,.035);for(let i=0;i<6;i++){let angle=t*6+i*T/6;line([[px+Math.cos(angle)*u*.38,py+Math.sin(angle)*u*.38],[px+Math.cos(angle)*u*.65,py+Math.sin(angle)*u*.65]],'#a4efff',.02,.75)}
 }else if(id==='ko_soul'){
  if(t>.25&&t<1.1){for(let i=0;i<5;i++){let pts=[[b[0]+(R(i)-.5)*u*.5,b[1]-u*1.6]],px=pts[0][0],py=pts[0][1];for(let j=0;j<5;j++){px+=(R(i*9+j+Math.floor(t*12)*23)-.5)*u*.4;py+=u*.35;pts.push([px,py])}line(pts,i%2?'#85d9ff':'#ffffff',.026,C((1.1-t)*3))}burst(b[0],b[1],t-.32,'#8fddff',1)}
 }else{
  let col=id==='ko_kunai'?'#ff4d43':id==='ch_glacier'?'#a7eeff':id==='su_rising'||id==='su_knuckle'?'#80dcff':id==='ko_moon'?'#d7f6f2':id==='sc_feint'||id==='sc_fatal'?'#ecb6ed':id==='sa_dispel'?'#b9f5ff':'#ffe1b0';
  let count={mo_triple:3,mo_chain:4,ch_crush:5,sc_fatal:3,sc_feint:2,ko_kunai:3,ko_moon:3}[id]||1;
  for(let i=0;i<count;i++){let age=t-(.28+i*.12);let xx=x+(R(i+42)-.5)*u*.5,yy=y+(R(i+24)-.5)*u*.45;burst(xx,yy,age,col,id==='ko_kunai'?2:id==='ko_moon'?1.2:1)}
  if(id==='mo_triple'){for(let j=0;j<3;j++){let q=C((t-.1-j*.13)/.3);if(q<=0||q>=1)continue;let px=a[0]+(b[0]-a[0])*q,py=a[1]+(b[1]-a[1])*q+(j-1)*u*.13;line([[px-u*.65,py],[px,py]],'#ffe0a2',.075,1-q);ring(px,py,.12,.75,'#fff0c9',1-q,.035)}}
  if(id==='sa_dispel'){ring(b[0],b[1],.2+E(t*2)*1.7,1,col,(1-C((t-.45)/.8))*.8,.04)}
 }
 return true}
root.PGReviewPolishFx={has:id=>replaces.has(id)||accents.has(id),replaces:id=>replaces.has(id),draw};
})(globalThis);
