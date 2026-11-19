/* Review-only derived legacy afterglow. The weapon-shaped tip is omitted. */
(function(root){
const ownerLegacy={create(g){const TAU=Math.PI*2;let quality=1;
const cl=(v,a=0,b=1)=>Math.max(a,Math.min(b,v)),mix=(a,b,t)=>a+(b-a)*t,smooth=t=>{t=cl(t);return t*t*(3-2*t)},hash=n=>{let x=Math.sin(n*127.1+311.7)*43758.5453;return x-Math.floor(x)},fade=(a,life)=>Math.sin(Math.PI*cl(a/life)),palette={fire:[191,111,65],hot:[244,206,145],steel:[122,153,176],violet:[150,130,169],sage:[148,164,131],ivory:[216,207,177]};
const textures=new Map();
function texture(col){const key=col.join(',');if(textures.has(key))return textures.get(key);const c=document.createElement('canvas');c.width=c.height=128;const x=c.getContext('2d'),r=x.createRadialGradient(64,64,0,64,64,64);r.addColorStop(0,`rgba(${key},.7)`);r.addColorStop(.18,`rgba(${key},.52)`);r.addColorStop(.45,`rgba(${key},.22)`);r.addColorStop(.75,`rgba(${key},.045)`);r.addColorStop(1,`rgba(${key},0)`);x.fillStyle=r;x.fillRect(0,0,128,128);textures.set(key,c);return c}
function mist(x,y,r,col,a=1,sy=1,angle=0,add=true){if(a<=0||r<=0)return;g.save();g.globalCompositeOperation=add?'screen':'source-over';g.globalAlpha*=cl(a*.48);g.translate(x,y);g.rotate(angle);g.scale(1,sy);g.drawImage(texture(col),-r,-r,r*2,r*2);g.restore()}
function stroke(points,col,width,alpha=1){g.save();g.lineCap='butt';g.lineJoin='miter';g.globalAlpha*=cl(alpha);g.strokeStyle=`rgb(${col})`;g.lineWidth=width;g.beginPath();points.forEach((p,i)=>i?g.lineTo(...p):g.moveTo(...p));g.stroke();g.restore()}
function sparks(x,y,t,seed,col,count=44,power=1){for(let i=0;i<Math.ceil(count*.5*quality);i++){const born=hash(i+seed)*.085,a=t-born,life=.18+hash(i+seed+90)*.3;if(a<0||a>life)continue;const ang=hash(i+seed+3)*TAU,v=(70+hash(i+seed+17)*280)*power,vx=Math.cos(ang)*v,vy=Math.sin(ang)*v*.65-75;const px=x+vx*a,py=y+vy*a+100*a*a,f=Math.pow(1-a/life,1.5);mist(px,py,2+f*2,col,f*.25);stroke([[px-vx*.017,py-(vy+200*a)*.017],[px,py]],col,.7+f,f*.75)}}
function ribbon(points,width,col,alpha){
if(points.length<2||alpha<=0)return;
const core=col.map(v=>Math.round(v+(255-v)*.82));
for(const [size,opacity,tint,blend] of [[1.18,.28,[26,30,42],'source-over'],[1,.9,col,'source-over'],[.22,.9,core,'screen'],[1.5,.045,col,'screen']]){
g.save();g.globalCompositeOperation=blend;g.globalAlpha*=cl(alpha*opacity);const first=points[0],last=points[points.length-1];
if(Math.hypot(last[0]-first[0],last[1]-first[1])>1){
const fill=g.createLinearGradient(...first,...last);
fill.addColorStop(0,rgb(tint.map(v=>Math.round(v*.65))));
fill.addColorStop(.48,rgb(tint));fill.addColorStop(.72,rgb(tint.map(v=>Math.round(v+(255-v)*.3))));
fill.addColorStop(1,rgb(tint));g.fillStyle=fill;
}else g.fillStyle=rgb(tint);
const side=(i,sign)=>{const p=points[i],next=points[Math.min(i+1,points.length-1)],prev=points[Math.max(0,i-1)],dx=next[0]-prev[0],dy=next[1]-prev[1],len=Math.hypot(dx,dy)||1,q=i/(points.length-1),w=width*Math.pow(Math.sin(q*Math.PI),.85)*size;return[p[0]-dy/len*w*sign,p[1]+dx/len*w*sign]};
g.beginPath();points.forEach((_,i)=>{const p=side(i,1);i?g.lineTo(...p):g.moveTo(...p)});
for(let i=points.length-1;i>=0;i--)g.lineTo(...side(i,-1));g.closePath();g.fill();g.restore();
}
}
const C={orange:[224,102,38],amber:[255,211,132],blue:[78,154,238],ice:[188,235,255],violet:[149,102,215],purple:[124,66,184],ivory:[255,237,186],steel:[193,214,232],sage:[121,207,159],red:[188,68,91],earth:[157,126,88]};
const E=(a,l=1)=>a<0||a>l?0:Q(a,Math.min(.075,l*.12))*(1-Q(a-l*.42,l*.58)),Q=(a,l)=>smooth(a/l),rgb=c=>`rgb(${c})`;
function poly(pts,col,alpha=1){g.save();g.globalAlpha*=cl(alpha);g.fillStyle=Array.isArray(col)?rgb(col):col;g.beginPath();pts.forEach((p,i)=>i?g.lineTo(...p):g.moveTo(...p));g.closePath();g.fill();g.restore()}
function path(points,col,w=2,a=1){stroke(points,col,w,a)}
function ellipse(x,y,rx,ry,col,a=1,w=1.5,rot=0,start=0,end=TAU){g.save();g.globalAlpha*=cl(a);g.strokeStyle=rgb(col);g.lineWidth=w;g.beginPath();g.ellipse(x,y,Math.max(.01,rx),Math.max(.01,ry),rot,start,end);g.stroke();g.restore()}
function luminous(points,col,w,a=1){
const core=col.map(v=>Math.round(v+(255-v)*.75));
path(points,[23,29,42],w*2.3,a*.28);path(points,col,w*1.7,a*.82);
path(points,core,Math.max(.8,w*.48),a);path(points,col,w*4,a*.035);
}
function bez(a,b,c,d,n=45){const pts=[];for(let i=0;i<n;i++){const u=i/(n-1),v=1-u;pts.push([v*v*v*a[0]+3*v*v*u*b[0]+3*v*u*u*c[0]+u*u*u*d[0],v*v*v*a[1]+3*v*v*u*b[1]+3*v*u*u*c[1]+u*u*u*d[1]])}return pts}
function arc(x,y,rx,ry,start,end,col,width,alpha=1,tilt=0){const pts=[];for(let j=0;j<60;j++){const a=mix(start,end,j/59),xx=Math.cos(a)*rx,yy=Math.sin(a)*ry;pts.push([x+xx*Math.cos(tilt)-yy*Math.sin(tilt),y+xx*Math.sin(tilt)+yy*Math.cos(tilt)])}ribbon(pts,width,col,alpha)}
function flash(x,y,a,col=C.ivory,size=35){
if(a<0||a>.24)return;
const amp=Math.pow(1-a/.24,2),r=size*(.32+Q(a,.12)*.65);
mist(x,y,size,col,amp*.55);
poly([[x-r,y],[x-4,y-3],[x,y-r*.7],[x+4,y-3],[x+r,y],[x+4,y+3],[x,y+r*.7],[x-4,y+3]],col,amp*.9);
poly([[x-3,y],[x,y-8],[x+3,y],[x,y+8]],[255,252,238],amp);
}
function debris(x,y,a,col=C.earth,n=24,force=1){if(a<0||a>1.7)return;for(let j=0;j<n*quality;j++){const life=.5+hash(j+42)*.9;if(a>life)continue;const ang=hash(j+17)*TAU,v=(55+hash(j+11)*145)*force,xx=x+Math.cos(ang)*v*a,yy=y-Math.abs(Math.sin(ang))*v*a+145*a*a;g.save();g.translate(xx,yy);g.rotate(a*(hash(j)-.5)*15);poly([[-3,-2],[2,-4],[5,1],[0,4]],col,(1-a/life)*.8);g.restore()}}
function contact(x,y,a,col=C.steel,size=1){
if(a<0||a>.48)return;
flash(x,y,a,col,30*size);sparks(x,y,a,137,col,12,.5*size);
const amp=Math.pow(1-a/.48,2),r=8+Q(a,.35)*42*size;
arc(x,y,r,r*.65,-.9,.9,col,2.7*size,amp*.8,-.3);
}
function crescent(x,y,rx,ry,col,alpha=1,rotation=0){g.save();g.translate(x,y);g.rotate(rotation);const grad=g.createLinearGradient(-rx,0,rx,0);grad.addColorStop(0,'rgba('+col+',0)');grad.addColorStop(.5,'rgba('+col+','+cl(alpha*.8)+')');grad.addColorStop(1,'rgba('+col+','+cl(alpha*.1)+')');g.fillStyle=grad;g.beginPath();g.moveTo(0,-ry);g.bezierCurveTo(rx*1.6,-ry*.5,rx*1.6,ry*.5,0,ry);g.bezierCurveTo(rx*.65,ry*.2,rx*.65,-ry*.2,0,-ry);g.fill();g.restore();arc(x,y,rx*1.17,ry,-Math.PI/2,Math.PI/2,col,1.4,alpha,rotation)}
const V5GOLD=[210,169,89],V5EDGE=[244,222,166],V5SOUL=[158,136,206],V5SOULEDGE=[208,218,230];
function v6SoulCrescent(x,y,alpha=1,scale=1){
g.save();g.translate(x,y);g.scale(scale,scale);g.globalAlpha*=cl(alpha);
const outer=bez([-88,-25],[130,-31],[130,31],[-88,25],65),inner=bez([-88,25],[66,18],[66,-18],[-88,-25],65);
const grad=g.createLinearGradient(-88,0,82,0);grad.addColorStop(0,'rgba(122,99,170,0)');grad.addColorStop(.38,'rgba(139,115,195,.13)');grad.addColorStop(.76,'rgba(166,146,214,.5)');grad.addColorStop(.94,'rgba(203,216,233,.72)');grad.addColorStop(1,'rgba(135,109,187,.16)');
poly([...outer,...inner],grad);
luminous(outer,V5SOUL,1.9,.83);path(outer,V5SOULEDGE,.72,.9);
path(bez([-76,-23],[112,-25],[112,25],[-76,23]),V5SOUL,.65,.5);
path(inner,V5SOUL,.55,.28);
for(const side of [-1,1])path([[-88,side*25],[-69,side*24]],V5SOULEDGE,.7,.58);
mist(63,0,16,V5SOUL,.09,.75);g.restore();
}
const ANIM={};
ANIM.bash=t=>{
const a=t-.08,p=Q(a,.18),amp=1-Q(a-.19,.34);if(a<0||a>.53)return;
ribbon(bez([688,354],[716,377],[779,425],[835,483]).slice(0,Math.max(2,Math.floor(p*45))),17,C.orange,amp);
contact(785,442,a-.14,C.amber,1.15);
};
ANIM.bowl=t=>{const a=t-.2,p=cl(a/.65),x=mix(290,805,p),y=464-Math.sin(p*Math.PI*2)*13;arc(x,y,52,43,a*9,a*9+4.6,C.orange,10,E(a,1.2),.2);for(let j=0;j<5;j++){const b=a-j*.09;ellipse(mix(300,805,cl(b/.65)),492,24,8,C.orange,E(b,.55)*.45)}debris(785,491,a-.62,[154,98,56],28,1.4);contact(785,472,a-.65,C.orange,1.3)};
ANIM.pierce=t=>{const a=t-.2,p=Q(a,.19),amp=E(a,.7);ribbon(bez([365,448],[512,424],[661,433],[826,440]).slice(0,Math.max(2,Math.floor(p*45))),4,C.orange,amp);/* Removed weapon-shaped tip for the monk review. */for(let j=0;j<3;j++)ellipse(670+j*38,440,7,18,C.orange,E(a-j*.05,.35),1.5);contact(785,440,a-.19,C.orange,.75)};
ANIM.spiral=t=>{const a=t-.22,p=Q(a,.74),amp=E(a,1.2);const pts=[];for(let j=0;j<110;j++){const u=j/109,an=u*TAU*2.25+p*4,r=118*(1-u)+14;pts.push([785+Math.cos(an)*r,435+Math.sin(an)*r*.52-u*25])}ribbon(pts.slice(0,Math.max(2,Math.floor(110*p))),5,C.orange,amp);crescent(785+Math.cos(p*TAU*2.25)*40,435+Math.sin(p*TAU*2.25)*20,19,43,C.amber,amp,p*8);contact(785,437,a-.78,C.orange,.8)};
ANIM.jointbeat=t=>{const a=t-.15,amp=E(a,1.5);luminous([[225,461],[250,408],[281,361]],C.orange,3,amp);luminous([[225,372],[250,410],[279,452]],C.amber,2.5,amp);sparks(253,409,a-.38,9,C.orange,25,.6);arc(252,411,57,69,-1.6,-.1,C.orange,2,amp*.4)};
ANIM.frenzy=t=>{const a=t-.1,amp=E(a,2);for(let j=0;j<6;j++){const x=225+j*11,pts=bez([x,490],[x-20,455],[x+20,405],[x+Math.sin(a*8+j)*9,352]);ribbon(pts,3+j%2,C.orange,amp*.55)}poly([[241,400],[252,372],[269,402],[258,390],[253,413],[244,390]],C.amber,amp*.7);mist(252,470,70,C.orange,amp*.18,.4)};
ANIM.sonic=t=>{
for(let j=0;j<8;j++){
const a=t-(.25+j*.09);if(a<0||a>.7)continue;
const p=cl(a/.2),tail=cl((a-.16)/.44),pts=[];
for(let k=0;k<55;k++){const u=mix(tail,p,k/54),ang=-2.8+u*4.2,r=125-j*3;pts.push([785+Math.cos(ang)*r,430+Math.sin(ang)*r*.4+Math.cos(ang)*(j%2?48:-48)])}
const col=j%2?palette.steel:palette.violet,amp=1-smooth((a-.24)/.46);
ribbon(pts,9,col,amp);path(pts,V5SOULEDGE,1.1,amp*.8);
const edge=pts.map(([x,y],k)=>[x,y+Math.sin(k/54*Math.PI)*1.9]);path(edge,col,.8,amp*.48);
sparks(785,442,a-.13,17+j*39,col,12,.45);
const b=a-.13;if(b>=0&&b<.24){const x=775+(hash(j)*24),y=423+hash(j+17)*33;flash(x,y,b,V5SOULEDGE,17);for(let k=0;k<3;k++){const an=j*.9+k*2.1;path([[x+Math.cos(an)*5,y+Math.sin(an)*5],[x+Math.cos(an)*(11+b*80),y+Math.sin(an)*(11+b*80)]],col,.65,(1-b/.24)*.62)}}
}
mist(785,443,38,V5SOUL,E(t-.37,.82)*.08);
};
ANIM.mAss=t=>{const a=t-.24;if(a<0)return;for(let j=0;j<7;j++){const an=j*TAU/7,r=Q(a,.47)*128,x=785+Math.cos(an)*r,y=461+Math.sin(an)*r*.55;g.save();g.translate(x,y);g.rotate(an);poly([[23,0],[-12,-8],[-4,0],[-12,8]],C.purple,E(a,.85));g.restore();ribbon(bez([785,461],[785+Math.cos(an)*35,461+Math.sin(an)*16],[x-Math.cos(an)*20,y-Math.sin(an)*12],[x,y]),4,C.purple,E(a,.85)*.55)}mist(785,461,50,C.purple,E(a,.7)*.35);sparks(785,461,a,97,C.purple,30,.8)};
ANIM.soulb=t=>{
const a=t-.12,p=a/.29;
if(p>=0&&p<1.22){const x=mix(275,1070,cl(p)),y=437,amp=Q(a,.025)*(1-Q(p-1,.22));
for(let j=2;j>0;j--)v6SoulCrescent(x-j*23,y,amp*(.07-j*.012),1+j*.02);
v6SoulCrescent(x,y,amp);
for(let j=0;j<4;j++)luminous(bez([x-160,y-13+j*8],[x-125,y-18+j*10],[x-94,y-17+j*11],[x-66,y-12+j*8]),V5SOUL,.65,amp*(.23-j*.035));
for(let j=0;j<15*quality;j++){const xx=x-76-hash(j)*95,yy=y+(hash(j+5)-.5)*26;path([[xx,yy],[xx-6-hash(j+9)*9,yy]],V5SOULEDGE,.5,amp*(.1+hash(j+2)*.23))}
}
const b=a-(785-275-75.5)/(1070-275)*.29;
flash(785,437,b,V5SOULEDGE,27);sparks(789,437,b,222,V5SOUL,18,.42);
if(b>=0&&b<.37){const r=Q(b,.2)*45;path([[785-r,437],[785+r*1.45,437]],V5SOULEDGE,.8,E(b,.37)*.7)}
};
const ownerMeteorAssault=ANIM.mAss;
ANIM.mAss=t=>{
const a=t-.24;
if(a>=0&&a<.9){
const r=Q(a,.47)*128,amp=E(a,.85);
ellipse(785,493,r,r*.34,[29,20,40],amp*.85,7);
ellipse(785,493,r,r*.34,C.violet,amp*.8,2.2);
for(let j=0;j<7;j++){
const an=j*TAU/7,x=785+Math.cos(an)*r,y=461+Math.sin(an)*r*.55;
g.save();g.translate(x,y);g.rotate(an);
poly([[28,0],[-15,-11],[-5,0],[-15,11]],[28,20,39],amp*.9);g.restore();
}
debris(785,491,a-.04,[99,87,113],18,.8);
}
ownerMeteorAssault(t);
};
return(id,t,detail)=>{quality=detail;ANIM[id]?.(t)};}};
root.PGTripleNoSwordAnimations=ownerLegacy;
})(globalThis);
