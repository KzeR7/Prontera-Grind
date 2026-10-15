// Redo requested after the original choice report. Preserve its undecided votes as history.
ANIM.jup=t=>{
  const a=t-.2,p=a/.42,gold=[255,205,91],hot=[255,247,205];
  if(p>=0&&p<1){
    const x=mix(268,785,p),y=435,pts=[];
    for(let j=0;j<=14;j++){const u=j/14;pts.push([mix(Math.max(268,x-210),x,u),y+Math.sin(u*Math.PI)*(hash(j+Math.floor(t*24)*17)-.5)*38])}
    path(pts,[55,34,17],9);luminous(pts,gold,3.8);
    for(let j=0;j<3;j++){const an=t*9+j*TAU/3;luminous([[x,y],[x+Math.cos(an)*18,y+Math.sin(an)*18],[x+Math.cos(an+.4)*34,y+Math.sin(an+.4)*34]],hot,1.3)}
  }
  const b=a-.42,amp=E(b,.65);
  if(amp>0)for(let j=0;j<6;j++){
    const an=j*TAU/6,r=38+Q(b,.2)*74,pts=[[785,438],[785+Math.cos(an+.22)*r*.45,438+Math.sin(an+.22)*r*.45],[785+Math.cos(an)*r,438+Math.sin(an)*r]];
    path(pts,[62,40,19],5,amp);luminous(pts,gold,2,amp);
  }
  contact(785,438,b,gold,1.25);
};

// Bake three irregular rock surfaces once; full silhouettes survive reduced detail.
const ownerStones=new Map();
function ownerStone(seed){
  if(ownerStones.has(seed))return ownerStones.get(seed);
  const c=document.createElement('canvas');c.width=192;c.height=256;const ctx=c.getContext('2d');
  const pts=[[12,253],[18,161],[29,119],[21,77],[56+hash(seed+1)*22,30],[98,17+hash(seed+4)*22],[135,35],[158,78],[147,130],[177,177],[177,253]];
  ctx.beginPath();pts.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.closePath();ctx.save();ctx.clip();
  const grad=ctx.createLinearGradient(20,20,175,210);grad.addColorStop(0,'#ae9b7d');grad.addColorStop(.4,'#746d60');grad.addColorStop(1,'#393a36');ctx.fillStyle=grad;ctx.fillRect(0,0,192,256);
  for(let j=0;j<12;j++){
    const x=20+hash(j+seed*13)*150,y=35+hash(j+seed*41)*215;
    ctx.fillStyle=j%2?'#524f45':'#8b806c';ctx.globalAlpha=.55;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+27,y-37);ctx.lineTo(x+49,y+9);ctx.lineTo(x+9,y+26);ctx.closePath();ctx.fill();
  }
  ctx.globalAlpha=1;
  for(let j=0;j<200;j++){ctx.fillStyle=j%3?'#24282355':'#d4c6a144';ctx.fillRect(16+hash(j+seed*7)*163,20+hash(j+seed*37)*235,1+hash(j+17)*4,.7+hash(j)*2)}
  for(let j=0;j<5;j++){const y=43+hash(j+seed*5)*142,x=37+hash(j+seed*7)*98;ctx.strokeStyle='#34352e99';ctx.lineWidth=1.1;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x-8,y+17);ctx.lineTo(x-3,y+30);ctx.lineTo(x-12,y+58);ctx.moveTo(x-3,y+30);ctx.lineTo(x+11,y+39);ctx.stroke()}
  const root=ctx.createLinearGradient(0,170,0,256);root.addColorStop(0,'#24262000');root.addColorStop(1,'#242620ed');ctx.fillStyle=root;ctx.fillRect(0,170,192,86);ctx.restore();
  ownerStones.set(seed,c);return c;
}
ANIM.tstorm=t=>{
  for(let j=0;j<4;j++){
    const a=t-.24-j*.16;if(a<0||a>1.9)continue;
    const x=700+j*52,y=488+(j%2)*13,amp=1-Q(a-1.25,.6),h=(100+hash(j)*38)*Q(a,.28);
    path([[x-45,y+7],[x-23,y-3],[x,y+3],[x+29,y-7],[x+48,y+2]],[38,36,29],5,amp);
    g.save();g.globalAlpha*=amp;g.drawImage(ownerStone(j%3),x-39,y-h,78,h);g.restore();
    debris(x,y,a-.12,[110,100,79],15,.8);smoke(x,y,a-.15,[99,92,80],10,.8);
  }
};
ANIM.meteor=t=>{
  const a=t-.2,p=a/.44;
  if(p>=0&&p<1){
    const x=mix(280,785,p),y=438,pts=bez([Math.max(280,x-145),y],[x-70,y-17],[x-32,y+14],[x,y]);
    path(pts,[35,25,49],12);ribbon(pts,10,C.violet,1);
    poly([[x+46,y],[x+4,y-23],[x-30,y],[x+4,y+23]],[37,29,49]);poly([[x+46,y],[x+4,y-19],[x-16,y]],C.ivory);poly([[x+46,y],[x-16,y],[x+4,y+19]],C.violet);
  }
  const b=a-.44;
  contact(785,438,b,C.violet,1.4);
  if(b>=0&&b<.7)for(let j=0;j<8;j++){
    const an=j*TAU/8,r=25+Q(b,.3)*88,x=785+Math.cos(an)*r,y=438+Math.sin(an)*r*.7;
    g.save();g.translate(x,y);g.rotate(an);poly([[-13,0],[0,-5],[20,0],[0,5]],C.violet,E(b,.7));path([[-8,0],[17,0]],C.ivory,1,E(b,.7));g.restore();
  }
};
ANIM.pharrow=t=>{
  const a=t-.18;if(a<0||a>2.2)return;const amp=1-Q(a-1.5,.7),p=Q(a,.35);
  g.save();g.globalAlpha*=amp;
  ellipse(785,494,84,31,[27,30,31],1,9);ellipse(785,494,84,31,C.steel,1,3);
  for(let j=0;j<12;j++){
    const an=j*TAU/12,r=82-34*p,pts=[[785+Math.cos(an-.12)*86,494+Math.sin(an-.12)*32],[785+Math.cos(an)*r,494+Math.sin(an)*r*.37-12*p],[785+Math.cos(an+.12)*86,494+Math.sin(an+.12)*32]];
    poly(pts,[47,52,53]);path([pts[0],pts[1]],C.ivory,2);
  }
  for(const side of [-1,1]){poly([[785+side*75,498],[785+side*105,498],[785+side*105,508],[785+side*75,508]],C.steel);path([[785+side*80,502],[785+side*100,502]],[35,38,39],2)}
  g.restore();contact(785,491,a-.32,C.steel,1.1);
};
ANIM.env=t=>{
  const a=t-.15,p=Q(a,.13),amp=E(a,.72);if(!amp)return;
  const pts=bez([704,475],[748,451],[788,424],[847,409]).slice(0,Math.max(2,Math.floor(p*45)));
  path(pts,[22,29,34],14,amp);ribbon(pts,10,C.steel,amp);path(pts,C.ivory,1.8,amp);
  contact(785,443,a-.12,C.ivory,1.05);
};
ANIM.sdestroy=t=>{
  const a=t-.16,amp=E(a,1.6),p=Q(a,.45);if(!amp)return;
  g.save();g.globalAlpha*=amp;g.translate(785,430);
  poly([[-29,-30],[-15,-43],[16,-43],[30,-28],[28,9],[17,16],[17,34],[-17,34],[-17,16],[-28,9]],[31,23,39]);
  path([[-29,-30],[-15,-43],[16,-43],[30,-28],[28,9],[17,16],[17,34],[-17,34],[-17,16],[-28,9],[-29,-30]],C.violet,3);
  for(const side of [-1,1]){poly([[side*7,-12],[side*23,-19],[side*20,-3],[side*7,0]],C.ivory);path([[side*6,20],[side*6,32]],C.ivory,2)}
  poly([[0,1],[-5,13],[5,13]],C.violet);g.restore();
  for(let j=0;j<4;j++){const an=j*TAU/4+Math.PI/4,r=95-38*p;path([[785+Math.cos(an)*r,430+Math.sin(an)*r],[785+Math.cos(an)*(r-18),430+Math.sin(an)*(r-18)]],C.ivory,3,amp)}
  contact(785,430,a-.65,C.violet,1.25);
};
// Opaque shadow bodies, a defined hood and bright forward blades keep the attack pose legible.
function ownerShade(x,y,an,amp,size=1,facing=1){
  g.save();g.translate(x,y);g.rotate(an);g.scale(size*facing,size);g.globalAlpha*=cl(amp);
  poly([[-9,-28],[-5,-46],[9,-53],[25,-35],[19,-24],[30,-6],[23,18],[4,24],[-26,36],[-18,15],[-45,19],[-29,-8]],[50,39,67]);
  path([[-9,-28],[-5,-46],[9,-53],[25,-35],[19,-24]],C.violet,2.5);
  path([[9,-34],[21,-32]],C.ivory,2);
  poly([[12,-7],[27,-13],[73,-3],[27,-5]],C.steel);path([[27,-13],[73,-3]],C.ivory,1.6);
  path([[-23,27],[1,17],[20,16]],C.violet,2);g.restore();
  v5Phantom(x,y,an,amp*.65,size,facing);
}
ANIM.vsplash=t=>{
  const a=t-.16,p=(a-.12)/.24;
  if(a>=0&&a<.25)smoke(252,464,a,[59,45,75],10,.7);
  if(p>=0&&p<1.35){
    const q=cl(p),x=mix(282,815,q),y=441-Math.sin(q*Math.PI)*7,amp=1-Q(p-1,.35);
    ownerShade(x-43,y,-.045,amp*.25,1.2);ownerShade(x,y,-.045,amp,1.2);
    ribbon(bez([Math.max(282,x-160),460],[x-100,448],[x-45,452],[x-17,442]),4,C.violet,amp*.8);
  }
  const b=a-.34;const pts=[[746,447],[785,436],[853,437],[901,426]];
  path(pts,[25,23,35],6,E(b,.5));luminous(pts,C.ivory,2,E(b,.5));contact(785,437,b,C.violet,1.05);
};
ANIM.akatar=t=>{
  const origins=[[597,351],[957,371],[859,541]];
  for(let j=0;j<3;j++){
    const a=t-.16-j*.115,p=a/.23;if(p<0||p>1.4)continue;
    const [sx,sy]=origins[j],an=Math.atan2(438-sy,785-sx),dx=Math.cos(an),dy=Math.sin(an),q=cl(p),x=mix(sx,785-dx*78,q),y=mix(sy,438-dy*78,q),amp=Q(a,.035)*(1-Q(p-1,.4)),facing=dx<0?-1:1;
    ownerShade(x,y,facing*Math.atan2(dy,Math.abs(dx)),amp,1.1,facing);
    const pts=[[x-dx*70,y-dy*70],[x-dx*15,y-dy*15],[x+dx*70,y+dy*70]];
    path(pts,[31,24,42],6,amp*.7);luminous(pts,C.violet,2,amp*.8);contact(785,438,a-.22,C.violet,.9);
  }
};
