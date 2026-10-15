// Owner feedback on explicitly selected V8 effects. Subsequent redos live in owner-fx-redo.js.
const ownerStorm=ANIM.storm;
ANIM.storm=t=>{
  const a=t-.06,amp=E(a,2.2);
  // A projected ground boundary, visible through the cast, rather than a targeting UI.
  if(amp>0){
    const radius=143,edge=[];
    for(let j=0;j<=64;j++){const an=j*TAU/64;edge.push([785+Math.cos(an)*radius,493+Math.sin(an)*radius*.34])}
    path(edge,[24,49,66],5,amp*.8);path(edge,C.ice,1.8,amp*.8);
    for(let j=0;j<12;j++){
      const an=j*TAU/12,c=Math.cos(an),s=Math.sin(an);
      path([[785+c*132,493+s*132*.34],[785+c*145,493+s*145*.34]],C.ice,2,amp*.8);
    }
    ellipse(785,493,135,46,C.blue,amp*.3,1);
  }
  ownerStorm(t);
};
// Improve local silhouettes while retaining each original trajectory and contact time.
const ownerSharp=ANIM.sharp;
ANIM.sharp=t=>{
  ownerSharp(t);
  const a=t-.2,amp=E(a,.95),r=55*(1-Q(a,.4))+18;
  for(let j=0;j<4;j++){
    const an=j*TAU/4,c=Math.cos(an),s=Math.sin(an),points=[[785+c*(r+15)-s*9,437+s*(r+15)+c*9],[785+c*r-s*9,437+s*r+c*9],[785+c*r+s*9,437+s*r-c*9]];
    path(points,[22,36,46],5,amp);path(points,C.ivory,2,amp);
  }
  contact(785,437,a-.52,C.blue,1.05);
};
function ownerLocalScale(id,x,y,factor){
  const original=ANIM[id];
  ANIM[id]=t=>{g.save();g.translate(x,y);g.scale(factor,factor);g.translate(-x,-y);original(t);g.restore()};
}
ownerLocalScale('dodge',785,448,1.65);
ownerLocalScale('judex',785,438,1.55);
ownerLocalScale('spearboom',785,445,1.6);
ownerLocalScale('landmine',785,493,1.45);

// Matte, weathered chitin replaces the glossy violet tooth surface. Native art is untouched.
grimTooth=seed=>{
  if(grimTeeth.has(seed))return grimTeeth.get(seed);
  const c=document.createElement('canvas');c.width=192;c.height=320;const ctx=c.getContext('2d');
  ctx.beginPath();ctx.moveTo(27,298);ctx.bezierCurveTo(34,162,68,62,166,15);ctx.bezierCurveTo(124,80,112,181,148,298);ctx.closePath();
  ctx.save();ctx.clip();
  const body=ctx.createLinearGradient(25,140,155,175);
  for(const [at,col] of [[0,'#28232a'],[.28,'#8e867c'],[.46,'#c0b5a0'],[.62,'#82796b'],[1,'#393139']])body.addColorStop(at,col);
  ctx.fillStyle=body;ctx.fillRect(0,0,192,320);
  for(let j=0;j<100;j++){
    const xx=20+hash(j+seed*103)*146,yy=45+hash(j+seed*31)*253;
    ctx.strokeStyle=j%4?'rgba(35,29,31,.24)':'rgba(215,204,179,.2)';ctx.lineWidth=.7+hash(j+17)*1.3;
    ctx.beginPath();ctx.moveTo(xx,yy);ctx.quadraticCurveTo(xx+4,yy-13,xx+13,yy-35);ctx.stroke();
  }
  ctx.beginPath();ctx.moveTo(78,298);ctx.bezierCurveTo(70,180,106,67,166,15);ctx.bezierCurveTo(124,80,112,181,148,298);ctx.closePath();
  ctx.fillStyle='rgba(35,28,32,.42)';ctx.fill();
  for(let j=0;j<5;j++){
    const yy=130+j*31,xx=95-j*4;ctx.strokeStyle='#403739';ctx.lineWidth=1.7;
    ctx.beginPath();ctx.moveTo(xx-6,yy+20);ctx.lineTo(xx+8,yy+8);ctx.lineTo(xx+3,yy);ctx.lineTo(xx+17,yy-12);ctx.stroke();
  }
  const root=ctx.createLinearGradient(0,175,0,305);root.addColorStop(0,'#30252b00');root.addColorStop(1,'#201923f5');ctx.fillStyle=root;ctx.fillRect(0,175,192,145);ctx.restore();
  ctx.strokeStyle='#b9ae98';ctx.lineWidth=1.1;ctx.beginPath();ctx.moveTo(35,249);ctx.bezierCurveTo(42,151,78,62,166,15);ctx.stroke();
  grimTeeth.set(seed,c);return c;
};
// Widen both rings around the monster. Keep 26 teeth at every detail level and an open center.
for(const tooth of grimMaw){tooth.r*=1.28;tooth.h*=Math.sin(tooth.an)<0?.8:1.12}
const ownerGrim=ANIM.grim;
ANIM.grim=t=>{
  const a=t-.16,amp=E(a,1.5);
  if(amp>0){
    ellipse(785,495,106,36,[30,24,32],amp*.85,8);
    ellipse(785,495,104,35,[125,107,94],amp*.65,1.5);
  }
  ownerGrim(t);
};
