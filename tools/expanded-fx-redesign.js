/* Review-only concepts. Purely visual; no game runtime or combat state is touched.
   Design sources and limitations: tools/expanded-fx-research.md. */
(function(root){
'use strict';
const concepts={
 sa_dispel:['dispel','#b5dbff'],sc_fog:['fog','#b1c6d8'],so_diamond:['diamond','#94e8ff'],so_buster:['poison','#bf76f1'],so_grave:['earth','#e0aa68'],so_varetyr:['lightning','#a6dbff'],
 nj_kunai:['kunai','#c9e1f0'],nj_huuma:['huuma','#bec8e8'],ko_huuma:['huuma','#efb8eb'],ko_kunai:['kunaiBlast','#ff6044'],ko_petal:['petals','#ffb3d4'],ko_izayoi:['moon','#a8bfff'],ko_soul:['soul','#bd9aff'],ko_shadow:['shadow','#a191d3'],ko_moon:['moonfog','#aec9fa'],
 dn_rain:['rain','#addbff'],bd_bliss:['shelter','#ffd491'],bd_gloomy:['gloom','#ae9dd6']
};
const clamp=(x,a=0,b=1)=>Math.max(a,Math.min(b,x)),ease=x=>1-Math.pow(1-clamp(x),3),tau=Math.PI*2;
// A second, time-staggered detail pass. All particles are deterministic per cast so
// pausing, changing speed or replaying never changes the choreography.
function details(g,kind,col,t,U,a,b,ground,self){
 const atSelf=['moon','moonfog','shadow','shelter','gloom'].includes(kind);
 const center=atSelf?self:ground, x=center[0], y=center[1], midY=y-U*.65;
 const rand=n=>{let v=Math.sin(n*91.735+13.17)*43758.5453;return v-Math.floor(v)};
 const impact={kunai:.38,kunaiBlast:.4,huuma:.55,petals:.25,dispel:.16,fog:.14,diamond:.25,earth:.24,lightning:.16,poison:.3,rain:.34,soul:.25,moon:.3,moonfog:.3,shadow:.24,shelter:.28,gloom:.3}[kind];
 const soft=['fog','moonfog','gloom','shelter','moon'].includes(kind);
 const q=clamp((t-impact)/.9), hit=t>=impact?Math.exp(-(t-impact)*(soft?5:9)):0;
 const fade=clamp((2.3-t)/.55), intro=clamp(t/.12), life=fade*intro;
 const glow=(cx,cy,r,color,opacity)=>{if(r<=0||opacity<=0)return;g.save();g.globalAlpha*=opacity;const z=g.createRadialGradient(cx,cy,0,cx,cy,r);z.addColorStop(0,color);z.addColorStop(.18,col);z.addColorStop(1,'transparent');g.fillStyle=z;g.beginPath();g.arc(cx,cy,r,0,tau);g.fill();g.restore()};
 const arc=(cx,cy,r,flat,opacity,width,start=0,end=tau)=>{if(r<=0||opacity<=0)return;g.save();g.globalAlpha*=opacity;g.strokeStyle=col;g.shadowColor=col;g.shadowBlur=U*.14;g.lineWidth=Math.max(.6,width);g.beginPath();g.ellipse(cx,cy,r,r*flat,0,start,end);g.stroke();g.restore()};
 g.save();g.globalAlpha*=life;g.globalCompositeOperation='lighter';
 // Impact bloom + concentric pressure: support/atmospheric casts use a gentler pulse.
 glow(x,midY,U*(soft?1.15:1.5), '#ffffff',hit*(soft?.24:.7));
 if(t>=impact){for(let j=0;j<2;j++){let n=clamp((t-impact-j*.1)/.75);if(n>0&&n<1)arc(x,y,U*(.22+ease(n)*(soft?1.3:1.95)),.29,(1-n)*(soft?.48:.85),U*(j?.018:.045));}}
 // Segmented, rotating arcs and ground marks add detail without obscuring the sprite.
 if(!['kunai','huuma','rain'].includes(kind)){
  for(let j=0;j<3;j++){let r=U*(.65+j*.32),phase=t*(j%2?-.9:1.1)+j*1.4;for(let k=0;k<4;k++)arc(x,y,r,.3,(.26+hit*.25)*fade,U*.015,phase+k*tau/4,phase+k*tau/4+.58)}
  for(let k=0;k<12;k++){const angle=k*tau/12+t*.35, r=U*1.32,px=x+Math.cos(angle)*r,py=y+Math.sin(angle)*r*.3;g.strokeStyle=col;g.globalAlpha=life*.55;g.lineWidth=Math.max(.7,U*.018);g.beginPath();g.moveTo(px,py);g.lineTo(px+Math.cos(angle)*U*.11,py+Math.sin(angle)*U*.035);g.stroke()}
 }
 // Fine sparks, flecks and short light streaks shoot outward, then drift and fade.
 if(t>=impact){let elapsed=t-impact;for(let i=0;i<(soft?25:42);i++){
  let age=elapsed-rand(i+500)*.32;if(age<0||age>1.3)continue;let u=clamp(age/1.3),angle=rand(i+23)*tau, speed=U*(.35+rand(i+78)*1.7),dist=speed*ease(u*1.7),px=x+Math.cos(angle)*dist,py=midY+Math.sin(angle)*dist*.55+U*.24*u*u;
  let size=Math.max(.7,U*(.012+rand(i+99)*.035))*(1-u*.5);g.globalAlpha=life*(1-u)*(.35+rand(i+17)*.65);g.fillStyle=i%4?'#ffffff':col;g.shadowColor=col;g.shadowBlur=U*.1;g.beginPath();g.arc(px,py,size,0,tau);g.fill();if(i%4===0&&!soft){g.strokeStyle=col;g.lineWidth=Math.max(.5,size*.55);g.beginPath();g.moveTo(px,py);g.lineTo(px-Math.cos(angle)*U*.14,py-Math.sin(angle)*U*.08);g.stroke()}
 }}
 g.globalAlpha=life;
 // Atmospheric motion reads differently from weapon impact: floating mist beads,
 // refracted crystal glints, lightning forks, musical motes, or ember fragments.
 if(['fog','moonfog','poison','gloom'].includes(kind)){for(let i=0;i<16;i++){let phase=(t*.32+rand(i+55))%1,px=x+(rand(i+4)*2-1)*U*1.6+Math.sin(t*2+i)*U*.12,py=y-U*(.08+phase*1.4);glow(px,py,U*(.06+rand(i+91)*.08),'#ffffff',Math.sin(phase*Math.PI)*.35)}}
 if(kind==='diamond'){for(let i=0;i<12;i++){let phase=(t*.8+rand(i+7))%1,px=x+(rand(i+14)*2-1)*U*1.35,py=y-U*(.15+phase*1.6),r=U*(.025+rand(i+21)*.035);g.globalAlpha=life*Math.sin(phase*Math.PI);g.strokeStyle='#e9ffff';g.lineWidth=1;g.beginPath();g.moveTo(px-r*2,py);g.lineTo(px+r*2,py);g.moveTo(px,py-r*2);g.lineTo(px,py+r*2);g.stroke()}}
 if(kind==='earth'){for(let i=0;i<9;i++){let age=clamp((t-impact-i*.025)/1.3),dx=(rand(i+1)*2-1)*U*1.4,py=y-U*(Math.sin(age*Math.PI)*(.2+rand(i+4)*.5));g.globalAlpha=life*(1-age);g.fillStyle=i%2?'#d2a16b':'#7c6755';g.save();g.translate(x+dx*ease(age*2),py);g.rotate(age*5+i);g.fillRect(-U*.045,-U*.035,U*.09,U*.07);g.restore()}}
 if(kind==='rain'){for(let i=0;i<12;i++){let phase=(t*1.05+rand(i+80))%1;if(phase<.83)continue;let px=x+(rand(i+28)*2-1)*U*1.5,py=y+(rand(i+35)-.5)*U*.35;arc(px,py,U*.18*((phase-.83)/.17),.35,(1-phase)*3,U*.02)}}
 // Skill-specific secondary silhouettes: keep the small details connected to
 // the action rather than giving every cast the same generic particle cloud.
 if(kind==='kunai'||kind==='kunaiBlast'||kind==='huuma'){
  let duration=kind==='huuma'?.65:.4, travel=clamp(t/duration);if(travel<1){
   for(let j=0;j<5;j++){let v=clamp(travel-j*.065),px=a[0]+(b[0]-a[0])*v,py=a[1]+(b[1]-a[1])*v;g.globalAlpha=life*(1-j/5)*.35;g.strokeStyle=col;g.lineWidth=U*(.025+j*.012);g.beginPath();g.moveTo(px-U*.25,py);g.lineTo(px,py);g.stroke()}
  }
 }
 if(kind==='lightning'&&t<.95){for(let i=0;i<4;i++){let time=(t*14+i*.17)%1;if(time>.72)continue;let px=x+(rand(i+3)-.5)*U*.9,py=midY-U*1.6;g.globalAlpha=life*(1-time)*.75;g.strokeStyle=i%2?'#ffffff':col;g.lineWidth=Math.max(.8,U*.025);g.shadowColor=col;g.shadowBlur=U*.12;g.beginPath();g.moveTo(px,py);for(let j=0;j<5;j++){px+=(rand(i*9+j+Math.floor(t*14)*31)-.5)*U*.35;py+=U*.38;g.lineTo(px,py)}g.stroke()}}
 if(kind==='petals'){for(let i=0;i<12;i++){let ph=(t*.55+rand(i+25))%1,ang=ph*tau*2+rand(i+50)*tau,r=U*(.5+ph*1.5),px=x+Math.cos(ang)*r,py=midY+Math.sin(ang)*r*.32-ph*U*.35;g.globalAlpha=life*Math.sin(ph*Math.PI)*.65;g.strokeStyle=i%2?'#fff2f8':'#ffa8d1';g.lineWidth=Math.max(.8,U*.012);g.beginPath();g.arc(px,py,U*.14,ang,ang+1.5);g.stroke()}}
 if(kind==='kunaiBlast'){for(let i=0;i<14;i++){let age=(t-impact-i*.012)/1.1;if(age<0||age>1)continue;let angle=rand(i+87)*tau,dist=U*ease(age*2)*(1+rand(i+11));g.globalAlpha=life*(1-age);g.fillStyle=i%2?'#ffde9a':'#ff5138';g.save();g.translate(x+Math.cos(angle)*dist,midY+Math.sin(angle)*dist*.65);g.rotate(angle+age*5);g.fillRect(-U*.025,-U*.07,U*.05,U*.14);g.restore()}}
 if(kind==='shelter'||kind==='gloom'){for(let i=0;i<7;i++){let phase=(t*.35+rand(i+16))%1,px=x+(rand(i+7)*2-1)*U*1.2,py=y-U*phase*1.8;g.globalAlpha=life*Math.sin(phase*Math.PI)*.75;g.fillStyle=col;g.font=Math.max(10,U*.3)+'px serif';g.fillText(i%2?'♪':'♫',px,py)}}
 g.restore();
}
function draw(g,id,seconds,project){if(root.PGExpandedBatchFx&&root.PGExpandedBatchFx.has(id))return root.PGExpandedBatchFx.draw(g,id,seconds,project);if(root.PGNinjaThrowFx&&root.PGNinjaThrowFx.has(id))return root.PGNinjaThrowFx.draw(g,id,seconds,project);const spec=concepts[id];if(!spec)return false;const [kind,col]=spec, t=seconds, alpha=clamp((2.35-t)/.5)*clamp(t/.12);if(alpha<=0)return true;
 const a=project(-1.65,1.25,0),b=project(1.65,1.1,0),ground=project(1.65,0,0),self=project(-1.65,0,0),top=project(1.65,3.05,0),unit=Math.abs(ground[1]-top[1])/3.05;
 const U=unit, p=clamp(t/1.2), seed=n=>{const x=Math.sin(n*127.1+18.3)*43758.5453;return x-Math.floor(x)}, line=(x1,y1,x2,y2,w,color=col)=>{g.strokeStyle=color;g.lineWidth=w;g.lineCap='round';g.beginPath();g.moveTo(x1,y1);g.lineTo(x2,y2);g.stroke()},ring=(x,y,r,opacity=1,color=col,flatten=.35)=>{g.save();g.globalAlpha*=opacity;g.strokeStyle=color;g.lineWidth=Math.max(1,U*.035);g.beginPath();g.ellipse(x,y,Math.max(.1,r),Math.max(.1,r*flatten),0,0,tau);g.stroke();g.restore()},spark=(x,y,r,color=col)=>{g.save();g.fillStyle=color;g.shadowColor=color;g.shadowBlur=r*4;g.beginPath();g.arc(x,y,Math.max(.1,r),0,tau);g.fill();g.restore()},burst=(x,y,n,r,color=col)=>{for(let i=0;i<n;i++){let q=seed(i+41)*tau,d=r*(.25+seed(i+92)*.75)*ease(t*1.4);spark(x+Math.cos(q)*d,y+Math.sin(q)*d*.65,Math.max(1,U*(.015+seed(i)*.03))*(1-p*.65),color)}};
 const blade=(x,y,angle,len,shuriken=false)=>{g.save();g.translate(x,y);g.rotate(angle);g.shadowColor=col;g.shadowBlur=U*.12;g.fillStyle='#dbe6ef';g.strokeStyle='#26313f';g.lineWidth=1.2;if(shuriken){g.beginPath();for(let i=0;i<8;i++){let r=len*(i%2?.18:.55),q=i*tau/8;g.lineTo(Math.cos(q)*r,Math.sin(q)*r)}g.closePath();g.fill();g.stroke();g.fillStyle='#506077';g.beginPath();g.arc(0,0,len*.09,0,tau);g.fill()}else{g.beginPath();g.moveTo(len*.62,0);g.lineTo(-len*.15,-len*.16);g.lineTo(-len*.22,0);g.lineTo(-len*.15,len*.16);g.closePath();g.fill();g.stroke();line(-len*.2,0,-len*.48,0,len*.08,'#333748');ring(-len*.52,0,len*.07,1,'#bccada',1)}g.restore()};
 g.save();g.globalAlpha=alpha;
 if(kind==='kunai'||kind==='kunaiBlast'||kind==='huuma'||kind==='petals'){
  if(kind==='huuma'){let q=clamp(t/.65),x=a[0]+(b[0]-a[0])*ease(q),y=a[1]+(b[1]-a[1])*ease(q);blade(x,y,t*16,U*.95,true);if(t>.5)ring(ground[0],ground[1],U*1.2*ease((t-.5)*2),1-p)}
  else if(kind==='petals'){for(let i=0;i<4;i++){let ang=t*4+i*tau/4;blade(b[0]+Math.cos(ang)*U*.9,b[1]+Math.sin(ang)*U*.35,ang+t*5,U*.43)}for(let i=0;i<28;i++){let q=seed(i)*tau+t*(.9+seed(i+20)),r=U*(.4+seed(i+60)*1.8),x=b[0]+Math.cos(q)*r,y=b[1]+Math.sin(q)*r*.4+(t*U*(.2+seed(i+10)))% (U*1.6)-U*.5;g.save();g.translate(x,y);g.rotate(q+t);g.fillStyle=i%2?'#ffd4e2':'#ee8fba';g.beginPath();g.ellipse(0,0,U*.07,U*.035,0,0,tau);g.fill();g.restore()}ring(ground[0],ground[1],U*1.5,.5)}
  else{for(let i=0;i<(kind==='kunai'?3:5);i++){let q=clamp((t-i*.07)/.38),x=a[0]+(b[0]-a[0])*q,y=a[1]+(b[1]-a[1])*q+(i-2)*U*.13*(1-q);if(q<1&&t>=i*.07){line(x-U*.4,y,x,y,U*.025,'#e5efff');blade(x,y,0,U*.55)}}if(kind==='kunaiBlast'&&t>.35){ring(ground[0],ground[1],U*1.6*ease((t-.35)*2),1-p,'#ff694d');burst(b[0],b[1],25,U*1.5,'#ff694d')}}
 }else if(kind==='fog'||kind==='moonfog'){let ctr=kind==='fog'?ground:self;for(let i=0;i<16;i++){let x=ctr[0]+(seed(i)*2-1)*U*1.8+Math.sin(t+i)*U*.15,y=ctr[1]-seed(i+8)*U*.9;let r=U*(.35+seed(i+25)*.45);const gradient=g.createRadialGradient(x,y,0,x,y,r);gradient.addColorStop(0,kind==='fog'?'rgba(198,219,232,.35)':'rgba(142,174,235,.24)');gradient.addColorStop(1,'rgba(120,145,180,0)');g.fillStyle=gradient;g.beginPath();g.arc(x,y,r,0,tau);g.fill()}if(kind==='moonfog')ring(ctr[0],ctr[1],U*1.6,.5,'#bfcfff')}
 else if(kind==='diamond'||kind==='earth'){let n=kind==='diamond'?11:9;ring(ground[0],ground[1],U*1.45*ease(t*3),.8);for(let i=0;i<n;i++){let x=ground[0]+(seed(i)*2-1)*U*1.35,y=ground[1]+(seed(i+10)-.5)*U*.3,h=U*(.45+seed(i+30)*1.15)*ease((t-i*.035)*3),w=U*(.12+seed(i+20)*.13);g.fillStyle=kind==='diamond'?(i%2?'#b4f3ff':'#61bcd7'):(i%2?'#b08251':'#6b5748');g.strokeStyle=kind==='diamond'?'#e2ffff':'#f0bd80';g.lineWidth=1.3;g.beginPath();g.moveTo(x-w,y);g.lineTo(x-w*.45,y-h*.6);g.lineTo(x+w*.1,y-h);g.lineTo(x+w,y);g.closePath();g.fill();g.stroke()}burst(b[0],b[1],18,U*1.3)}
 else if(kind==='lightning'){const q=clamp(t/.28),x=b[0],y=b[1];g.save();g.shadowBlur=U*.25;g.shadowColor='#92caff';g.fillStyle='#c8ecff';g.beginPath();g.moveTo(x-U*.15,y-U*2.5);g.lineTo(x+U*.12,y-U*2.5);g.lineTo(x+U*.06,y-U*.2);g.lineTo(x,y+U*.38*q);g.lineTo(x-U*.06,y-U*.2);g.closePath();g.fill();for(let i=0;i<5;i++){let px=x,py=y-U*2;g.beginPath();g.moveTo(px,py);for(let j=0;j<5;j++){px=x+(seed(i*9+j)-.5)*U*.65;py+=U*.5;g.lineTo(px,py)}g.strokeStyle=i%2?'#96baff':'#ecfaff';g.lineWidth=1.4;g.stroke()}g.restore();ring(ground[0],ground[1],U*1.7*ease(t*3),1-p);burst(x,y,18,U*1.4)}
 else if(kind==='poison'){for(let i=0;i<20;i++){let q=seed(i)*tau,r=U*(.4+seed(i+20)*1.3)*ease(t*2),x=b[0]+Math.cos(q)*r,y=b[1]+Math.sin(q)*r*.55-t*U*.12;spark(x,y,U*(.04+seed(i+6)*.1),'#ba70df')}ring(ground[0],ground[1],U*1.4*ease(t*2),.7,'#c585e9')}
 else if(kind==='dispel'){let q=ease(t*2);for(let j=0;j<3;j++)ring(b[0],b[1],U*(.3+j*.22+q*.7),1-p,'#d0ecff',1);for(let i=0;i<14;i++){let z=i*tau/14+t,x=b[0]+Math.cos(z)*U*(.35+q),y=b[1]+Math.sin(z)*U*(.35+q);line(x,y,x+Math.cos(z)*U*.15,y+Math.sin(z)*U*.15,U*.035,'#eaf8ff')}}
 else if(kind==='rain'){for(let i=0;i<26;i++){let f=(t*.85+seed(i))%1,x=ground[0]+(seed(i+20)*2-1)*U*1.8,y=ground[1]-U*2.6+f*U*2.6;line(x-U*.18,y-U*.45,x,y,U*.035,'#ccefff');if(f>.86)spark(x,ground[1],U*.05)}ring(ground[0],ground[1],U*1.8,.6)}
 else if(kind==='soul'){for(let i=0;i<3;i++){let q=clamp((t-i*.1)*3);g.save();g.translate(b[0],b[1]);g.rotate(-.7+i*.7);g.strokeStyle=i===1?'#f6e8ff':'#ac7bea';g.lineWidth=U*.08*(1-q*.5);g.beginPath();g.arc(0,0,U*(.55+i*.18),Math.PI*.9,Math.PI*(.9+q));g.stroke();g.restore()}burst(b[0],b[1],16,U)}
 else {let ctr=kind==='moon'||kind==='shadow'||kind==='shelter'||kind==='gloom'?self:ground;for(let i=0;i<3;i++)ring(ctr[0],ctr[1],U*(.65+i*.35)*ease(t*2),.7,col);if(kind==='moon'||kind==='moonfog'){g.fillStyle='#e9efff';g.beginPath();g.arc(ctr[0],ctr[1]-U*1.7,U*.45,0,tau);g.fill();g.fillStyle='#172033';g.beginPath();g.arc(ctr[0]+U*.17,ctr[1]-U*1.78,U*.41,0,tau);g.fill()}if(kind==='shadow'){for(let i=0;i<4;i++){g.fillStyle='rgba(126,101,177,.22)';g.beginPath();g.ellipse(ctr[0]+(i-1.5)*U*.45,ctr[1]-U*.55,U*.25,U*.65,0,0,tau);g.fill()}}burst(ctr[0],ctr[1]-U*.7,14,U*1.3)}details(g,kind,col,t,U,a,b,ground,self);g.restore();return true}
root.PGExpandedFxConcepts={has:id=>!!concepts[id]||!!root.PGExpandedBatchFx?.has(id),ids:()=>[...new Set([...Object.keys(concepts),...(root.PGExpandedBatchFx?.ids()||[])])],draw};
})(globalThis);
