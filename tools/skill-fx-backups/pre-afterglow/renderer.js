const SKILL_FX_GEOMETRY={
  ring:new THREE.RingGeometry(.34,.46,28),torus:new THREE.TorusGeometry(.3,.055,6,20),
  orb:new THREE.IcosahedronGeometry(.18,1),shard:new THREE.ConeGeometry(.13,.48,5),
  bar:new THREE.BoxGeometry(.1,.1,.7),shaft:new THREE.BoxGeometry(.07,.58,.07),
  crossV:new THREE.BoxGeometry(.12,.78,.12),crossH:new THREE.BoxGeometry(.12,.12,.62),
  disk:new THREE.CircleGeometry(.3,24)
};
function skillFxPart(fx,shape,color,x,y,z,sx,sy,sz,opts={}){
  const material=new THREE.MeshBasicMaterial({color,transparent:true,opacity:opts.alpha||.9,depthWrite:false,
    side:THREE.DoubleSide,blending:THREE.AdditiveBlending});
  const mesh=new THREE.Mesh(SKILL_FX_GEOMETRY[shape],material);mesh.position.set(x,y,z);mesh.scale.set(sx,sy,sz);
  if(opts.ground)mesh.rotation.x=-Math.PI/2;
  if(opts.facing)mesh.quaternion.copy(cam.quaternion);
  fx.group.add(mesh);fx.parts.push({mesh,base:[sx,sy,sz],x,y,z,rise:opts.rise||0,
    grow:opts.grow||[1,1],spin:opts.spin||0,alpha:opts.alpha||.9,ground:!!opts.ground,facing:!!opts.facing});
  return mesh;
}
function skillFxLine(fx,points,color,alpha=.9){
  const geometry=new THREE.BufferGeometry().setFromPoints(points.map(p=>new THREE.Vector3(p[0],p[1],p[2])));
  const material=new THREE.LineBasicMaterial({color,transparent:true,opacity:alpha,depthWrite:false,blending:THREE.AdditiveBlending});
  const line=new THREE.Line(geometry,material);line.userData.skillFxOwnGeometry=1;fx.group.add(line);
  fx.parts.push({mesh:line,base:[1,1,1],x:0,y:0,z:0,rise:0,grow:[1,1],spin:0,alpha,ground:false,facing:false});
}
// ---------- skill-effect sprite sheets (v79, researched on RO / ROM / RO3) ----------
// The classic client draws every skill as a .str effect: several texture layers, each on its
// own keyframe timeline (frame, position, rotation, scale, alpha), blended additively over the
// battlefield. The texture vocabulary is small and recognizable: pok impact bursts, expanding
// rings, lens glows, slash streaks (Meteor Assault literally ships as purpleslash.tga), ice
// shards, lightning bolts, fireballs, falling meteors, holy pillars, poison bubbles, zeny
// coins, the falcon, smoke and sparkles. This block rebuilds that vocabulary as procedurally
// rendered 96px sprite frames (the repo carries no downloaded client art) and plays them the
// same way: SKILL_FX_SPR maps each skill family to layers, and each layer is one animated
// sprite with its own life window, spin, scale and tint. Where a sheet cannot be built (no
// canvas), the geometry recipes below remain the fallback, exactly as before.
const FX_FR=144;
const fxLcg=s=>()=>((s=(s*1664525+1013904223)>>>0)%4294967296)/4294967296;
const fxGlow=(g,x,y,r,c0,c1)=>{const gr=g.createRadialGradient(x,y,0,x,y,r);gr.addColorStop(0,c0);gr.addColorStop(1,c1);g.fillStyle=gr;g.beginPath();g.arc(x,y,r,0,6.2832);g.fill()};
const fxClaw=(g,cx,cy,r,a0,a1,w,al)=>{ // crescent blade: outer arc out, tapered inner arc back, sharp tips
  g.globalAlpha=al;g.fillStyle='#fff';g.beginPath();
  const st=16;
  for(let i=0;i<=st;i++){const a=a0+(a1-a0)*i/st;const x=cx+Math.cos(a)*r,y=cy+Math.sin(a)*r;i?g.lineTo(x,y):g.moveTo(x,y)}
  for(let i=st;i>=0;i--){const a=a0+(a1-a0)*i/st;const rr=r-w*Math.sin(Math.PI*i/st);
    g.lineTo(cx+Math.cos(a)*rr,cy+Math.sin(a)*rr)}
  g.closePath();g.fill();g.globalAlpha=1};
const fxStar=(g,x,y,r)=>{g.beginPath();g.moveTo(x,y-r);g.quadraticCurveTo(x,y,x+r,y);g.quadraticCurveTo(x,y,x,y+r);g.quadraticCurveTo(x,y,x-r,y);g.quadraticCurveTo(x,y,x,y-r);g.closePath();g.fill()};
// v79.2: sheets are rendered at 144px so doubled-size effects stay sharp, and every painter
// keeps its art inside a ~66px radius, so the additive quad edges never clip a visible glow -
// that clip was the "square outline" the owner saw.
const SKILL_FX_SHEETS={
  // RO pok*.tga impact: white-hot core, eight crisp spikes, a late flash ring
  pok:{n:6,paint(g,f,R){const C=72,t=f/5;
    for(let i=0;i<8;i++){const a=i*Math.PI/4+(f%2)*.16,len=14+48*t;
      g.fillStyle='#fff';g.globalAlpha=.9*(1-t*.55);
      g.beginPath();g.moveTo(C+Math.cos(a)*8,C+Math.sin(a)*8);
      g.lineTo(C+Math.cos(a+.09)*len*.5,C+Math.sin(a+.09)*len*.5);
      g.lineTo(C+Math.cos(a)*len,C+Math.sin(a)*len);
      g.lineTo(C+Math.cos(a-.09)*len*.5,C+Math.sin(a-.09)*len*.5);g.closePath();g.fill()}
    g.globalAlpha=1;fxGlow(g,C,C,24*(1.05-t*.5),'rgba(255,255,255,.95)','rgba(255,255,255,0)');
    if(f>2){g.globalAlpha=(t-.4);g.strokeStyle='#fff';g.lineWidth=2.5;
      g.beginPath();g.arc(C,C,44*t,0,6.2832);g.stroke();g.globalAlpha=1}}},
  // ring_*.tga: expanding double-rimmed ring
  ring:{n:6,paint(g,f,R){const C=72,t=f/5,r=12+40*t,lw=12*(1-t*.75)+2.5;
    g.strokeStyle='#fff';
    g.globalAlpha=.28*(1-t*.5);g.lineWidth=lw+6;g.beginPath();g.arc(C,C,r,0,6.2832);g.stroke();
    g.globalAlpha=.95*(1-t*.45);g.lineWidth=lw;g.beginPath();g.arc(C,C,r,0,6.2832);g.stroke();
    g.globalAlpha=1}},
  // lens*.tga: glow ball with flare streaks, clamped inside the frame
  lens:{n:5,paint(g,f,R){const C=72,t=f/4,s=.75+.5*Math.sin(t*Math.PI);
    fxGlow(g,C,C,42*s,'rgba(255,255,255,.9)','rgba(255,255,255,0)');
    g.globalAlpha=.6*s;g.fillStyle='#fff';
    g.beginPath();g.ellipse(C,C,46*s,6*s,0,0,6.2832);g.fill();
    g.beginPath();g.ellipse(C,C,6*s,34*s,0,0,6.2832);g.fill();g.globalAlpha=1}},
  // slash (purpleslash): sharp claw crescents - tapered blades with pointed tips
  slash:{n:6,paint(g,f,R){const C=72,t=f/5,a0=-2.7,sw=.6+2.2*t;
    fxClaw(g,C,C,46,a0,a0+sw,15*(.6+.4*Math.sin(t*Math.PI)),.95);
    fxClaw(g,C,C,33,a0+.5,a0+sw+.35,8,.6);
    g.globalAlpha=.7;fxGlow(g,C+Math.cos(a0+sw)*46,C+Math.sin(a0+sw)*46,9,'rgba(255,255,255,.8)','rgba(255,255,255,0)');
    g.globalAlpha=1-t*.3;g.fillStyle='#fff';
    fxStar(g,C+Math.cos(a0+sw)*46,C+Math.sin(a0+sw)*46,6*(1-t*.4));g.globalAlpha=1}},
  // flame: organic swaying tongues, gradient bodies with hot cores, drifting embers
  flame:{n:8,paint(g,f,R){const C=72,t=f/7,sway=Math.sin(t*Math.PI*2)*4;
    const tongues=[[0,46,16],[-19,36,11],[19,38,12],[-33,27,8],[33,28,8]];
    for(let i2=0;i2<5;i2++){const dx=tongues[i2][0],w=tongues[i2][2];
      const bh=tongues[i2][1]*(.8+.35*Math.sin((t*2+i2*.53)*Math.PI));
      const bx=C+dx+sway*(i2%2?-.6:.8),by=116;
      const gr=g.createLinearGradient(0,by-bh,0,by);
      gr.addColorStop(0,'rgba(255,255,255,0)');gr.addColorStop(.35,'rgba(255,255,255,.55)');
      gr.addColorStop(1,'rgba(255,255,255,.95)');
      g.fillStyle=gr;g.globalAlpha=.9;
      g.beginPath();g.moveTo(bx-w,by);
      g.bezierCurveTo(bx-w*1.05,by-bh*.42,bx-w*.28+sway*.4,by-bh*.62,bx+sway*.7,by-bh);
      g.bezierCurveTo(bx+w*.3+sway*.4,by-bh*.6,bx+w*1.02,by-bh*.4,bx+w,by);
      g.closePath();g.fill();
      g.globalAlpha=.8;fxGlow(g,bx,by-7,w*.9,'rgba(255,255,255,.9)','rgba(255,255,255,0)')}
    g.globalAlpha=.85;fxGlow(g,C,108,30,'rgba(255,255,255,.75)','rgba(255,255,255,0)');
    for(let i2=0;i2<6;i2++){const a=R()*6.28,d=10+R()*26;
      const ex=C+Math.cos(a)*d*.5,ey=104-t*58-((i2*17)%40),er=2.5+R()*2;
      g.globalAlpha=.7*(1-t*.55);fxGlow(g,ex,ey,er,'rgba(255,255,255,.95)','rgba(255,255,255,0)')}
    g.globalAlpha=1}},
  // ice.tga: faceted crystal cluster bursting off the ground
  ice:{n:6,paint(g,f,R){const C=72,t=f/5;
    const shards=[[0,-1,52],[-.85,-.5,38],[.85,-.55,42],[-.4,-.9,28],[.42,-.95,32]];
    shards.forEach(sh=>{const dx=sh[0],dy=sh[1],len=sh[2]*(.55+.45*Math.min(1,t*1.4)),w=len*.26;
      const x0=C+dx*20,y0=118,x1=C+dx*20+dx*len*.25,y1=y0+dy*len;
      g.globalAlpha=.88;g.fillStyle='#fff';
      g.beginPath();g.moveTo(x0-w,y0);g.lineTo(x1,y1);g.lineTo(x0+w,y0);g.closePath();g.fill();
      g.globalAlpha=.45;g.beginPath();g.moveTo(x0+w*.4,y0);g.lineTo(x1,y1);g.lineWidth=2.5;g.strokeStyle='#fff';g.stroke()});
    g.globalAlpha=.8;fxGlow(g,C,114,14,'rgba(255,255,255,.8)','rgba(255,255,255,0)');g.globalAlpha=1}},
  // a single diving ice dagger (Frost Diver / Storm Gust falling shards), tip down
  shard:{n:5,paint(g,f,R){const C=72,t=f/4;
    g.globalAlpha=.92;g.fillStyle='#fff';
    g.beginPath();g.moveTo(C-13,18);g.lineTo(C+13,18);g.lineTo(C+4,64+t*10);g.lineTo(C,118);g.lineTo(C-4,64+t*10);g.closePath();g.fill();
    g.globalAlpha=.4;g.strokeStyle='#fff';g.lineWidth=2.5;g.beginPath();g.moveTo(C,20);g.lineTo(C,112);g.stroke();
    g.globalAlpha=.7;fxGlow(g,C,30,16,'rgba(255,255,255,.8)','rgba(255,255,255,0)');
    g.globalAlpha=.8*(1-t*.4);fxStar(g,C-18,40+t*30,4);fxStar(g,C+16,60+t*26,3.4);g.globalAlpha=1}},
  // lightning: thick jittered bolt, bright core, fork, ground flash
  bolt:{n:6,paint(g,f,R){const C=72,pts=[[C,6]];let x=C;
    for(let y=30;y<=126;y+=24){x=C+(R()-.5)*44;pts.push([x,y])}
    const fl=f%2?1:.8;
    const draw=(lw,al)=>{g.lineWidth=lw;g.globalAlpha=al;g.strokeStyle='#fff';g.lineJoin='round';g.lineCap='round';
      g.beginPath();pts.forEach((p,i)=>i?g.lineTo(p[0],p[1]):g.moveTo(p[0],p[1]));g.stroke()};
    draw(13,.22*fl);draw(6.5,.55*fl);draw(2.6,.95*fl);
    const bx=pts[2];g.globalAlpha=.7*fl;g.lineWidth=3.5;g.beginPath();g.moveTo(bx[0],bx[1]);
    g.lineTo(bx[0]+(R()>.5?20:-20),bx[1]+16);g.lineTo(bx[0]+(R()-.5)*28,bx[1]+34);g.stroke();
    g.globalAlpha=fl;fxGlow(g,pts[pts.length-1][0],132,13,'rgba(255,255,255,.9)','rgba(255,255,255,0)');g.globalAlpha=1}},
  // holy pillar with a cross glint
  pillar:{n:6,paint(g,f,R){const C=72,t=f/5,w=(16-6*Math.abs(t-.5))*1.5;
    g.globalAlpha=.5;g.fillStyle='#fff';g.fillRect(C-w,10,w*2,120);
    g.globalAlpha=.9;g.fillRect(C-w*.35,8,w*.7,128);
    g.globalAlpha=.9*(.6+.4*Math.sin(t*Math.PI));
    g.fillRect(C-34,58,68,7);g.fillRect(C-3.5,36,7,50);
    for(let i=0;i<3;i++){const y=104-t*70-i*12;g.globalAlpha=.7*(1-t*.4);fxStar(g,C-22+i*22+(f%2)*6,y,6.5)}
    g.globalAlpha=1}},
  // a real meteor: dark rock with craters, molten rim, converging trail - baked colour,
  // played on a normal-blend layer with a white tint so the stone stays stone
  meteor:{n:6,paint(g,f,R){const C=72,t=f/5,ry=40+t*52;
    for(let i=0;i<7;i++){const off=(i-3)*8;
      g.globalAlpha=(.5-Math.abs(i-3)*.13)*(1-t*.4);
      g.strokeStyle='#fff';g.lineWidth=5-Math.abs(i-3);g.lineCap='round';
      g.beginPath();g.moveTo(C+off*2.4,2);g.quadraticCurveTo(C+off*1.2,ry*.5,C+off*.4,ry-16);g.stroke()}
    g.globalAlpha=.8;fxGlow(g,C,ry,30,'rgba(255,255,255,.8)','rgba(255,255,255,0)');
    g.globalAlpha=1;g.fillStyle='#5a4a42';g.beginPath();
    for(let i=0;i<10;i++){const a=i*6.2832/10+f*.3,r=15+((i*53+f*17)%7);
      g[i?'lineTo':'moveTo'](C+Math.cos(a)*r,ry+Math.sin(a)*r)}
    g.closePath();g.fill();
    g.fillStyle='#3d332e';
    g.beginPath();g.arc(C-5,ry-3,4,0,6.2832);g.fill();
    g.beginPath();g.arc(C+6,ry+4,3,0,6.2832);g.fill();
    g.globalAlpha=.95;g.strokeStyle='#ffd9a0';g.lineWidth=3.5;
    g.beginPath();g.arc(C,ry,16,.5,2.6);g.stroke();
    g.globalAlpha=.9;fxGlow(g,C,ry+14,12,'rgba(255,255,255,.9)','rgba(255,255,255,0)');
    for(let i=0;i<4;i++){const a=R()*6.28,d=20+R()*18;
      g.globalAlpha=.7*(1-t*.5);fxGlow(g,C+Math.cos(a)*d,ry+Math.sin(a)*d*.6,3,'rgba(255,255,255,.9)','rgba(255,255,255,0)')}
    g.globalAlpha=1}},
  // poison bubbles: crisp rims with highlight dots and pop fragments
  bubble:{n:8,paint(g,f,R){const C=72,t=f/7;
    for(let i=0;i<6;i++){const bx=C-30+(i*37)%60+(R()-.5)*8,by=112-t*58-((i*29)%26),r=6+((i*17)%8);
      if(i%3===2&&t>.6){g.globalAlpha=(t-.6)*2.2;g.strokeStyle='#fff';g.lineWidth=2.2;
        g.beginPath();g.arc(bx,by,r+4,.2,1.6);g.stroke();g.beginPath();g.arc(bx,by,r+4,2.8,4.6);g.stroke();continue}
      g.globalAlpha=.8-t*.3;g.strokeStyle='#fff';g.lineWidth=2.6;g.beginPath();g.arc(bx,by,r,0,6.2832);g.stroke();
      g.globalAlpha=.95-t*.3;g.fillStyle='#fff';g.beginPath();g.arc(bx-r*.35,by-r*.35,r*.28,0,6.2832);g.fill()}
    g.globalAlpha=.22*(1-t);fxGlow(g,C,112,30,'rgba(255,255,255,.6)','rgba(255,255,255,0)');g.globalAlpha=1}},
  // arrow: one organic comet streak - tapered body, soft glow, tiny fletching ticks
  arrow:{n:5,paint(g,f,R){const t=f/4,x0=22+t*10,x1=92+t*22;
    const gr=g.createLinearGradient(x0,0,x1+18,0);
    gr.addColorStop(0,'rgba(255,255,255,0)');gr.addColorStop(.45,'rgba(255,255,255,.85)');
    gr.addColorStop(.8,'rgba(255,255,255,.95)');gr.addColorStop(1,'rgba(255,255,255,.4)');
    g.fillStyle=gr;
    g.beginPath();g.moveTo(x0,72);
    g.quadraticCurveTo((x0+x1)/2,63,x1,68);
    g.quadraticCurveTo(x1+11,72,x1,76);
    g.quadraticCurveTo((x0+x1)/2,81,x0,72);
    g.closePath();g.fill();
    g.globalAlpha=.9;fxGlow(g,x1+6,72,13,'rgba(255,255,255,.9)','rgba(255,255,255,0)');
    g.globalAlpha=.5;fxGlow(g,(x0+x1)/2,72,10,'rgba(255,255,255,.5)','rgba(255,255,255,0)');
    g.globalAlpha=.55;g.strokeStyle='#fff';g.lineWidth=3;g.lineCap='round';
    g.beginPath();g.moveTo(x0+6,66);g.lineTo(x0-4,60);g.moveTo(x0+6,78);g.lineTo(x0-4,84);g.stroke();
    g.globalAlpha=1}},
  // zeny coins (Mammonite): baked gold, spinning as they scatter
  coin:{n:6,paint(g,f,R){const t=f/5;
    const coins=[[51,60,-1],[87,51,1],[69,87,-.6],[39,90,.8],[96,84,-.9]];
    coins.forEach((cn,i)=>{const x=cn[0],y=cn[1],ph=cn[2],k=Math.cos(t*6+ph*3),rx=12*Math.abs(k)+2,dy=-t*(15+(i%3)*9);
      g.globalAlpha=.95;g.fillStyle='#ffe98a';g.beginPath();g.ellipse(x,y+dy,rx,12,0,0,6.2832);g.fill();
      g.globalAlpha=.8;g.strokeStyle='#8a6a1c';g.lineWidth=2;g.beginPath();g.ellipse(x,y+dy,rx,12,0,0,6.2832);g.stroke();
      if(rx>6){g.beginPath();g.ellipse(x,y+dy,rx*.45,5,0,0,6.2832);g.stroke()}});
    g.globalAlpha=1}},
  // the hunter's falcon stooping with a flap cycle
  falcon:{n:6,paint(g,f,R){const C=72,t=f/5,w=Math.sin(t*Math.PI*2)*12;
    g.save();g.translate(C,C);g.rotate(.32);
    g.globalAlpha=.3;g.strokeStyle='#fff';g.lineWidth=4;
    g.beginPath();g.moveTo(-58,-8);g.lineTo(-22,-3);g.stroke();
    g.beginPath();g.moveTo(-55,9);g.lineTo(-20,6);g.stroke();
    g.globalAlpha=.95;g.fillStyle='#fff';
    g.beginPath();g.moveTo(26,3);
    g.quadraticCurveTo(6,-9,-9,-4-w);
    g.quadraticCurveTo(-24,3-w*.6,-44,-2-w*1.3);
    g.quadraticCurveTo(-20,6,-35,10);
    g.quadraticCurveTo(-12,9,-6,13+w*.9);
    g.quadraticCurveTo(9,15,26,3);g.closePath();g.fill();
    g.restore();fxGlow(g,90,75,13,'rgba(255,255,255,.55)','rgba(255,255,255,0)');g.globalAlpha=1}},
  // soft smoke puffs for impacts and dust
  smoke:{n:6,paint(g,f,R){const C=72,t=f/5;
    for(let i=0;i<4;i++){const a=i*1.7+(f%3),d=9+t*18;
      g.globalAlpha=(.42-t*.34)*(i%2?1:.75);
      fxGlow(g,C+Math.cos(a)*d,68+Math.sin(a)*d*.6-t*11,16+t*10,'rgba(255,255,255,.8)','rgba(255,255,255,0)')}
    g.globalAlpha=1}},
  // rising four-point sparkles with thin cross flares
  spark:{n:8,paint(g,f,R){const t=f/7;
    for(let i=0;i<5;i++){const x=24+((i*31)%96),y=118-t*76-((i*19)%26),s=5+((i*7)%6),tw=Math.sin((t+i*.22)*Math.PI);
      g.globalAlpha=Math.max(0,tw)*.9;g.fillStyle='#fff';fxStar(g,x,y,s);
      g.globalAlpha=Math.max(0,tw)*.5;g.fillRect(x-s*1.8,y-.8,s*3.6,1.6);g.fillRect(x-.8,y-s*1.8,1.6,s*3.6)}
    g.globalAlpha=1}},
  // ROM-style ground AoE marker: soft disc, double rim, eight slow ticks
  decal:{n:6,paint(g,f,R){const C=72,t=f/5,r=(26+8*Math.sin(t*Math.PI))*1.5;
    g.globalAlpha=.5;g.strokeStyle='#fff';g.lineWidth=6;g.beginPath();g.arc(C,C,r,0,6.2832);g.stroke();
    g.globalAlpha=.9;g.lineWidth=2.6;g.beginPath();g.arc(C,C,r+6,0,6.2832);g.stroke();
    g.beginPath();g.arc(C,C,r-10,0,6.2832);g.stroke();
    for(let i=0;i<8;i++){const a=i*Math.PI/4+t*.7;g.globalAlpha=.8;g.lineWidth=3.4;
      g.beginPath();g.moveTo(C+Math.cos(a)*(r-9),C+Math.sin(a)*(r-9));
      g.lineTo(C+Math.cos(a)*(r+10),C+Math.sin(a)*(r+10));g.stroke()}
    g.globalAlpha=.22+.1*Math.sin(t*6.3);fxGlow(g,C,C,r-5,'rgba(255,255,255,.7)','rgba(255,255,255,0)');g.globalAlpha=1}},
  // wide shockwave crescent, tapered to sharp horns
  wave:{n:6,paint(g,f,R){const C=72,t=f/5,r=16+t*44;
    const draw=(rw,al)=>{g.globalAlpha=al;g.fillStyle='#fff';g.beginPath();
      const st=18;
      for(let i2=0;i2<=st;i2++){const a=Math.PI+Math.PI*i2/st;
        const x=C+Math.cos(a)*r,y=104+Math.sin(a)*r*.45;i2?g.lineTo(x,y):g.moveTo(x,y)}
      for(let i2=st;i2>=0;i2--){const a=Math.PI+Math.PI*i2/st;
        const rr=r-rw*Math.sin(Math.PI*i2/st);g.lineTo(C+Math.cos(a)*rr,104+Math.sin(a)*rr*.45)}
      g.closePath();g.fill();g.globalAlpha=1};
    draw(9*(1-t*.5),.9);draw(15*(1-t*.5),.25);
    g.globalAlpha=.5*(1-t);fxGlow(g,C,104,r*.4,'rgba(255,255,255,.5)','rgba(255,255,255,0)');g.globalAlpha=1}},
  // swirling vortex: three tapered claw arcs winding in
  vortex:{n:6,paint(g,f,R){const C=72,t=f/5,base=t*2.6;
    for(let k=0;k<3;k++)fxClaw(g,C,C,(11+k*9+t*7)*1.5,base+k*2.1,base+k*2.1+1.9,(7-k*2)*1.4,.85-k*.22);
    g.globalAlpha=.5;fxGlow(g,C,C,17,'rgba(255,255,255,.85)','rgba(255,255,255,0)');
    g.globalAlpha=.75*(1-t*.4);g.fillStyle='#fff';
    for(let i=0;i<5;i++){const a=base*1.7+i*1.26,r=(30+i*3)*1.5;fxStar(g,C+Math.cos(a)*r,C+Math.sin(a)*r,3.6)}
    g.globalAlpha=1}},
  // shining holy cross
  cross:{n:5,paint(g,f,R){const C=72,t=f/4,k=.78+.22*Math.sin(t*Math.PI);
    fxGlow(g,C,66,44*k,'rgba(255,255,255,.55)','rgba(255,255,255,0)');
    g.globalAlpha=.3;g.fillStyle='#fff';
    g.fillRect(C-12*k,66-56*k,24*k,112*k);g.fillRect(C-44*k,66-12*k,88*k,24*k);
    g.globalAlpha=.95;
    g.fillRect(C-5*k,66-50*k,10*k,100*k);g.fillRect(C-38*k,66-5*k,76*k,10*k);
    g.globalAlpha=.8*(1-t*.3);
    fxStar(g,C,66-50*k,5.5);fxStar(g,C,66+50*k,5.5);fxStar(g,C-38*k,66,5.5);fxStar(g,C+38*k,66,5.5);
    g.globalAlpha=1}},
  // a translucent war hammer drawn in light (Hammer Fall): soft glow body, bright core
  hammer:{n:6,paint(g,f,R){const C=72,fl=.75+.25*Math.sin(f/5*Math.PI);
    const draw=(lw,al)=>{g.lineCap='round';g.lineJoin='round';g.strokeStyle='#fff';
      g.globalAlpha=al;g.lineWidth=lw;
      g.beginPath();g.moveTo(C,C+34);g.lineTo(C,C-8);g.stroke();
      g.beginPath();g.moveTo(C-24,C-16);g.lineTo(C+24,C-16);g.lineTo(C+24,C-34);
      g.lineTo(C-24,C-34);g.closePath();g.stroke()};
    draw(10,.25*fl);draw(5,.6*fl);draw(2.2,.95*fl);
    g.globalAlpha=.8*fl;fxGlow(g,C,C-36,14,'rgba(255,255,255,.8)','rgba(255,255,255,0)');
    g.globalAlpha=.7*fl;fxGlow(g,C,C+34,7,'rgba(255,255,255,.7)','rgba(255,255,255,0)');
    g.globalAlpha=1}},
  // big four-ray starburst flash
  star:{n:5,paint(g,f,R){const C=72,t=f/4,k=.55+.45*Math.sin(Math.min(1,t*1.2)*Math.PI);
    g.globalAlpha=.95;g.fillStyle='#fff';fxStar(g,C,C,56*k);
    g.save();g.translate(C,C);g.rotate(Math.PI/4);g.globalAlpha=.7;fxStar(g,0,0,36*k);g.restore();
    g.globalAlpha=.5;g.strokeStyle='#fff';g.lineWidth=3;
    g.beginPath();g.arc(C,C,44*k+10,0,6.2832);g.stroke();g.globalAlpha=1}}
};
const fxSheetCache={};
function fxSheet(name){
  const def=SKILL_FX_SHEETS[name];
  if(!def||typeof document==='undefined')return null;
  if(Object.prototype.hasOwnProperty.call(fxSheetCache,name))return fxSheetCache[name];
  let ctx=null;const cv=document.createElement('canvas');
  try{cv.width=FX_FR*def.n;cv.height=FX_FR;ctx=cv.getContext?cv.getContext('2d'):null}catch(e){ctx=null}
  if(!ctx){fxSheetCache[name]=null;return null}
  const R=fxLcg(9000+name.length*131+name.charCodeAt(0)*7);
  for(let f=0;f<def.n;f++){ctx.save();ctx.translate(f*FX_FR,0);def.paint(ctx,f,R);ctx.restore()}
  const tex=new THREE.CanvasTexture(cv);tex.generateMipmaps=false;
  tex.minFilter=THREE.LinearFilter!==undefined?THREE.LinearFilter:1006;
  tex.magFilter=THREE.LinearFilter!==undefined?THREE.LinearFilter:1006;
  return fxSheetCache[name]={tex,n:def.n};
}
// One animated sprite layer per entry: sh = sheet, x/y/z world offset (y up), sc/sc1 world
// size start/end, d0/d1 the life window the layer plays inside, spin = UV rotation rad/s,
// ang = base rotation, tint = colour override (null = the skill's own colour, 'w' = white),
// op = peak opacity, rise = vertical drift over the effect's life, face 'cam' or 'ground'.
// v79.1: every size roughly doubled (the field camera sits far away), the mage line strikes
// FROM THE SKY, and any skill may override its family by id, so shared families no longer
// read as copies of each other. Lookup is SKILL_FX_SPR[skill id] first, then [family].
const SKILL_FX_SPR={
 heal:[{sh:'ring',face:'ground',sc:1.7,sc1:2.8,op:.85},{sh:'lens',y:2.1,sc:2.4,sc1:.9,d1:.5,tint:'w',op:.9},
   {sh:'spark',y:.8,sc:2.6,rise:1.7,d0:.1},{sh:'spark',y:.4,sc:1.9,rise:2.2,d0:.3,op:.85},
   {sh:'cross',y:1.9,sc:1.2,sc1:.6,d0:.15,d1:.75,op:.75}],
 impact:[{sh:'slash',y:1.9,sc:3.2,sc1:4,op:.95},{sh:'slash',y:1.9,sc:2.8,ang:2.2,d0:.08,op:.8},
   {sh:'pok',y:1.9,sc:2.3,sc1:3.1,d0:.1,tint:'w'},{sh:'lens',y:1.9,sc:2.8,sc1:.8,d0:.05,d1:.55,op:.85},
   {sh:'star',y:1.9,sc:1.5,sc1:.7,d0:.08,d1:.6,op:.7}],
 // Sonic Blow's hardcoded client effect: a rapid flurry of criss-cross slashes
 multiSlash:[{sh:'slash',y:1.9,sc:2.8,op:.9},{sh:'slash',y:2,sc:2.6,ang:1.6,d0:.1,op:.85},
   {sh:'slash',y:1.8,sc:2.7,ang:3.1,d0:.2,op:.8},{sh:'slash',y:2,sc:2.5,ang:4.7,d0:.3,op:.75},
   {sh:'pok',y:1.9,sc:1.9,sc1:2.6,d0:.35,tint:'w'},{sh:'lens',y:1.9,sc:2.4,sc1:.9,d1:.5,op:.7},
   {sh:'star',y:1.9,sc:1.3,sc1:.5,d0:.35,d1:.8,op:.65}],
 shockwave:[{sh:'decal',face:'ground',sc:2.8,sc1:4.8},{sh:'pok',y:1.7,sc:3.1,sc1:4.2,d0:.05,tint:'w'},
   {sh:'wave',y:.5,sc:3.4,sc1:4.6,d0:.06,op:.95},{sh:'slash',y:2,sc:3.6,ang:-.6,d0:.04},
   {sh:'spark',y:.6,sc:2.9,rise:1.5,d0:.2,op:.85},{sh:'smoke',y:.4,sc:2.6,rise:.7,d0:.3,op:.55}],
 thrust:[{sh:'arrow',y:1.8,sc:2.8,sc1:3.5,op:.95},{sh:'pok',y:1.8,sc:1.7,sc1:2.4,d0:.2,tint:'w'},
   {sh:'lens',y:1.8,sc:2,sc1:.7,d1:.5,op:.8},{sh:'wave',y:.4,sc:2,sc1:3,d0:.25,op:.6}],
 spearThrow:[{sh:'arrow',y:1.8,sc:3.1,sc1:3.9,spin:9,op:.95},{sh:'lens',y:1.8,sc:2.4,sc1:.9,d1:.5,tint:'w'},
   {sh:'pok',y:1.8,sc:2.2,sc1:3.1,d0:.25},{sh:'star',y:1.8,sc:1.4,sc1:.7,d0:.3,d1:.8,op:.7}],
 spiral:[{sh:'vortex',y:1.9,sc:3.4,sc1:4.2,spin:3,op:.9},{sh:'slash',y:2.1,sc:3.4,sc1:4.2,spin:6,op:.95},
   {sh:'slash',y:1.6,sc:2.8,spin:-6,ang:2,d0:.08},{sh:'lens',y:1.9,sc:2.8,sc1:.9,d1:.6,tint:'w'},
   {sh:'ring',face:'ground',sc:1.9,sc1:3.2,op:.75},{sh:'star',y:1.9,sc:1.7,sc1:.8,d0:.3,d1:.85,op:.75}],
 // Fire Bolt / Napalm Vulcan: the fireball now drops out of the sky onto the target
 fireBolt:[{sh:'flame',y:8.4,sc:3.4,rise:-7.6,d0:0,d1:.48,op:.95},
   {sh:'lens',y:8.8,sc:2.2,rise:-8,d0:0,d1:.48,op:.7,tint:'w'},
   {sh:'smoke',y:6.4,sc:2.4,rise:-4.6,d0:.06,d1:.6,op:.5},
   {sh:'decal',face:'ground',sc:3.4,sc1:4.6,d0:.44,op:.8},
   {sh:'pok',y:.9,sc:3.6,sc1:4.8,d0:.46,tint:'w'},
   {sh:'flame',y:.7,sc:3.2,d0:.5,op:.9},{sh:'flame',x:1.2,y:.5,sc:2.4,d0:.58,op:.8},
   {sh:'flame',x:-1.2,y:.5,sc:2.4,d0:.64,op:.8},{sh:'flame',x:.4,z:.9,y:.5,sc:2,d0:.7,op:.75},
   {sh:'smoke',y:1.1,sc:3.2,rise:1.4,d0:.6,op:.55}],
 // Napalm Beat: a ghost comet falls, then blooms
 psychic:[{sh:'lens',y:8.2,sc:2.8,rise:-7,d0:0,d1:.48,op:.95},
   {sh:'spark',y:6.6,sc:2.6,rise:-5,d0:.05,d1:.55,op:.8},
   {sh:'decal',face:'ground',sc:3,sc1:4.2,d0:.44,op:.75},
   {sh:'lens',y:1.9,sc:4.4,sc1:1.6,d0:.46,op:.95},
   {sh:'ring',face:'ground',sc:2.4,sc1:4,d0:.5},{sh:'pok',y:1.9,sc:3.4,sc1:4.6,d0:.5,tint:'w'},
   {sh:'spark',y:.9,sc:3.2,rise:1.8,d0:.55,op:.85}],
 // Storm Gust: falling shards join the field, over a much bigger frost decal
 iceStorm:[{sh:'vortex',face:'ground',sc:4.4,sc1:5.8,spin:3,op:.9},
   {sh:'vortex',y:.8,sc:3.4,sc1:4.4,spin:-2.2,d0:.1,op:.7},
   {sh:'ring',face:'ground',sc:3.2,sc1:5.2,d0:.05,op:.8},
   {sh:'shard',x:-1.5,z:.7,y:.8,sc:2,spin:1.6,d0:.12,op:.9},{sh:'shard',x:1.3,z:-.8,y:.7,sc:2.2,spin:-1.8,d0:.26,op:.9},
   {sh:'shard',x:.4,z:1.4,y:.9,sc:1.9,spin:1.7,d0:.4,op:.85},{sh:'shard',x:-.6,z:-1.3,y:.8,sc:2.1,spin:-1.6,d0:.54,op:.85},
   {sh:'wave',y:.7,sc:3.6,sc1:5,d0:.2,op:.7},{sh:'wave',y:1,sc:3,sc1:4.2,ang:.9,d0:.42,op:.6},
   {sh:'spark',y:.9,sc:3.8,rise:1.5,d0:.25,op:.9},{sh:'smoke',y:1,sc:4.2,rise:.9,d0:.35,op:.5}],
 iceNova:[{sh:'ring',face:'ground',sc:2.1,sc1:4.2},{sh:'decal',face:'ground',sc:3,sc1:4,d0:.05,op:.6},
   {sh:'ice',x:-1,sc:2.4,d0:.06},{sh:'ice',x:1,sc:2.4,d0:.12},{sh:'ice',sc:2.8,d0:.18},
   {sh:'ice',x:-.5,z:.9,sc:2.1,d0:.24},{sh:'ice',x:.5,z:-.9,sc:2.1,d0:.3},
   {sh:'lens',y:1.3,sc:3,sc1:.9,d1:.5,tint:'w',op:.85}],
 // Frost Diver: the shard dives from the sky, then freezes the target solid
 iceHit:[{sh:'shard',y:8.5,rise:-7.6,sc:2.8,d0:0,d1:.42,op:.95},
   {sh:'lens',y:7.6,sc:1.9,rise:-6.6,d0:0,d1:.42,op:.6,tint:'w'},
   {sh:'decal',face:'ground',sc:2.4,sc1:3.4,d0:.4,op:.75},
   {sh:'ice',y:.3,sc:2.6,d0:.42},{sh:'ice',x:1.1,y:.2,sc:2,d0:.5},{sh:'ice',x:-1.1,y:.2,sc:2,d0:.56},
   {sh:'pok',y:1.6,sc:2.6,sc1:3.4,d0:.44,tint:'w'},
   {sh:'spark',y:.8,sc:2.6,rise:1.2,d0:.5,op:.85}],
 lightning:[{sh:'bolt',y:.2,sc:4.4,sc1:5,op:.95},{sh:'lens',y:.8,sc:2.8,sc1:1,d0:.1,d1:.7},
   {sh:'ring',face:'ground',sc:1.5,sc1:3,d0:.15,op:.8},{sh:'star',y:.6,sc:1.6,sc1:.7,d0:.12,d1:.65,op:.75}],
 lightningStorm:[{sh:'decal',face:'ground',sc:3.6,sc1:5,op:.85},
   {sh:'bolt',x:-1,z:.4,sc:4,d0:.05},{sh:'bolt',x:.9,z:-.5,sc:4.4,d0:.2},{sh:'bolt',x:.1,z:.9,sc:3.8,d0:.38},
   {sh:'bolt',x:-.6,z:-.8,sc:3.6,d0:.52},
   {sh:'lens',y:1,sc:3.4,sc1:1.1,d0:.1,d1:.75,tint:'w',op:.8},
   {sh:'star',y:.8,sc:1.8,sc1:.8,d0:.2,d1:.7,op:.7}],
 meteor:[{sh:'decal',face:'ground',sc:3.6,sc1:4.8,op:.9},
   {sh:'meteor',x:-1.1,z:.3,y:5.5,rise:-5,tint:'w',blend:'normal',sc:3,d0:.02,d1:.47},
   {sh:'meteor',x:1,z:-.6,y:6,rise:-5.5,tint:'w',blend:'normal',sc:3.3,d0:.2,d1:.65},
   {sh:'meteor',x:.2,z:1,y:5.8,rise:-5.2,tint:'w',blend:'normal',sc:2.9,d0:.38,d1:.81},
   {sh:'wave',x:-1.1,z:.3,y:.3,sc:2.4,sc1:3.4,d0:.45,op:.8},
   {sh:'wave',x:1,z:-.6,y:.3,sc:2.6,sc1:3.6,d0:.63,op:.8},
   {sh:'wave',x:.2,z:1,y:.3,sc:2.3,sc1:3.2,d0:.79,op:.8},
   {sh:'pok',x:-1.1,z:.3,y:.5,sc:2.9,sc1:3.9,d0:.45,tint:'w'},
   {sh:'pok',x:1,z:-.6,y:.5,sc:3.1,sc1:4.1,d0:.63,tint:'w'},
   {sh:'pok',x:.2,z:1,y:.5,sc:2.7,sc1:3.6,d0:.79,tint:'w'},
   {sh:'flame',x:-1.1,z:.3,y:.6,sc:2.1,d0:.47,op:.85},{sh:'flame',x:1,z:-.6,y:.6,sc:2.3,d0:.65,op:.85},
   {sh:'smoke',y:1,sc:3.6,rise:1.2,d0:.5,op:.6},{sh:'spark',y:.6,sc:2.8,rise:1.2,d0:.5,op:.8}],
 gravity:[{sh:'vortex',face:'ground',sc:3.4,sc1:4.2,spin:2.6,op:.95},
   {sh:'decal',face:'ground',sc:3,sc1:3.9,op:.8},{sh:'lens',y:1.4,sc:3.4,sc1:1.3,d0:.1},
   {sh:'spark',y:2.6,sc:2.8,rise:-1.6,d0:.15,op:.85},{sh:'smoke',y:.6,sc:2.6,rise:.6,d0:.4,op:.5}],
 arrowBurst:[{sh:'arrow',y:1.9,sc:2.5,sc1:3.1,op:.95},{sh:'arrow',y:2.3,z:.3,sc:2.2,d0:.12,op:.85},
   {sh:'pok',y:1.9,sc:1.8,sc1:2.5,d0:.2,tint:'w'},{sh:'spark',y:1.5,sc:2.2,rise:.9,d0:.25,op:.8}],
 arrowLine:[{sh:'arrow',y:1.8,sc:3.7,sc1:4.8,op:.95},{sh:'arrow',y:1.8,sc:2.8,d0:.1,d1:.7,op:.7},
   {sh:'pok',y:1.8,sc:2.4,sc1:3.3,d0:.25,tint:'w'},{sh:'lens',y:1.8,sc:2.6,sc1:.9,d1:.5,op:.8},
   {sh:'wave',y:.4,sc:2.4,sc1:3.6,d0:.3,op:.6}],
 arrowRain:[{sh:'decal',face:'ground',sc:3.2,sc1:4.4,op:.85},
   {sh:'arrow',x:-.9,z:.4,y:2.2,ang:2.35,sc:2,d0:.04},{sh:'arrow',x:.8,z:-.4,y:2.4,ang:2.5,sc:1.9,d0:.22},
   {sh:'arrow',x:0,z:.8,y:2.1,ang:2.4,sc:2,d0:.4},
   {sh:'pok',y:.6,sc:2.4,sc1:3.3,d0:.5,tint:'w'},{sh:'spark',y:.4,sc:2.6,rise:.8,d0:.4,op:.8}],
 falcon:[{sh:'falcon',y:2.5,sc:3.5,sc1:4.3,op:.95},{sh:'lens',y:2.1,sc:2.6,sc1:.9,d0:.1,d1:.65,tint:'w'},
   {sh:'pok',y:1.8,sc:2.2,sc1:3,d0:.3},{sh:'spark',y:1.3,sc:2.4,rise:.9,d0:.35,op:.8}],
 poison:[{sh:'bubble',y:.3,sc:2.8,sc1:3.4,op:.9},{sh:'ring',face:'ground',sc:2.1,sc1:3.6,d0:.1,op:.7},
   {sh:'smoke',y:.8,sc:2.8,rise:.9,d0:.2,op:.55},{sh:'bubble',y:.2,x:.6,z:-.4,sc:1.9,d0:.25,op:.7},
   {sh:'spark',y:.5,sc:2,rise:1,d0:.3,op:.6}],
 poisonBomb:[{sh:'bubble',y:.8,sc:1.6,sc1:2,d1:.4,op:.85},{sh:'lens',y:1,sc:1.6,sc1:.8,d0:.05,d1:.4,op:.7},
   {sh:'bubble',y:.9,sc:1.2,rise:.3,d0:.15,d1:.42,op:.6},
   {sh:'decal',face:'ground',sc:2.4,sc1:3.8,d0:.42,op:.85},
   {sh:'pok',y:1,sc:3,sc1:4.2,d0:.45,tint:'w'},{sh:'bubble',y:.7,sc:2.8,sc1:3.8,d0:.48,op:.9},
   {sh:'bubble',x:1,z:.4,y:.6,sc:1.8,rise:.8,d0:.55,op:.75},{sh:'bubble',x:-.9,z:-.4,y:.6,sc:1.7,rise:.9,d0:.6,op:.7},
   {sh:'ring',face:'ground',sc:2.2,sc1:4,d0:.5,op:.8},{sh:'smoke',y:.9,sc:2.8,rise:1.1,d0:.55,op:.55}],
 shadow:[{sh:'slash',y:1.5,sc:3.1,sc1:4,ang:1.1,op:.9},{sh:'slash',y:1.9,sc:2.8,ang:-1.3,d0:.12,op:.8},
   {sh:'vortex',face:'ground',sc:2.6,sc1:3.4,spin:-2,op:.6},{sh:'decal',face:'ground',sc:2.3,sc1:3.6,op:.7},
   {sh:'smoke',y:.8,sc:2.8,rise:.9,d0:.25,op:.6}],
 // Meteor Assault: the client's own purpleslash, radiating in four sweeps
 radial:[{sh:'slash',x:-1.6,y:1.5,sc:3,sc1:3.8,ang:1.2,spin:3,op:.95},
   {sh:'slash',x:1.6,y:1.5,sc:3,sc1:3.8,ang:-1.9,spin:3,d0:.08,op:.9},
   {sh:'slash',x:-.4,z:1.2,y:1.4,sc:2.8,sc1:3.5,ang:2.6,spin:3,d0:.16,op:.85},
   {sh:'slash',x:.4,z:-1.2,y:1.4,sc:2.8,sc1:3.5,ang:-.6,spin:3,d0:.24,op:.8},
   {sh:'ring',face:'ground',sc:2.2,sc1:4.2,d0:.05,op:.8},
   {sh:'pok',y:1.4,sc:2.6,sc1:3.4,d0:.12,tint:'w'},{sh:'lens',y:1.5,sc:3,sc1:1.2,d1:.6,op:.8}],
 soulBolt:[{sh:'slash',y:1.5,sc:3.4,sc1:4.4,op:.95},
   {sh:'lens',y:1.5,sc:2.4,sc1:1,d1:.6,op:.8},{sh:'spark',y:1.2,sc:1.8,rise:.3,d0:.05,d1:.55,op:.7},
   {sh:'pok',y:1.5,sc:2.6,sc1:3.4,d0:.55,tint:'w'}],
 holyBolt:[{sh:'pillar',y:.2,sc:3.1,sc1:3.9,op:.95},{sh:'cross',y:1.9,sc:1.9,sc1:.9,d0:.08,d1:.7,op:.85},
   {sh:'lens',y:1.8,sc:2.9,sc1:1.1,d0:.05,d1:.7,tint:'w'},{sh:'spark',y:.6,sc:2.6,rise:1.5,d0:.15,op:.9},
   {sh:'ring',face:'ground',sc:1.5,sc1:2.8,d0:.1,op:.7}],
 holyField:[{sh:'decal',face:'ground',sc:3.8,sc1:5.1,op:.95},
   {sh:'pillar',x:-.9,z:.4,y:.2,sc:2.2,d0:.1},{sh:'pillar',x:1,z:-.5,y:.2,sc:2.5,d0:.25},
   {sh:'pillar',x:.1,z:1,y:.2,sc:2.1,d0:.42},{sh:'pillar',x:-.4,z:-.9,y:.2,sc:2,d0:.56},
   {sh:'spark',y:.6,sc:3.3,rise:1.3,d0:.2,op:.9}],
 holyNova:[{sh:'ring',face:'ground',sc:2.3,sc1:4.8,op:.9},{sh:'pillar',y:.1,sc:3.5,sc1:4.4,d0:.08},
   {sh:'cross',y:2.1,sc:2.3,sc1:1.1,d0:.1,d1:.75,op:.9},{sh:'lens',y:1.7,sc:3.6,sc1:1.3,d0:.05,d1:.7,tint:'w',op:.85},
   {sh:'spark',y:.8,sc:3.5,rise:1.7,d0:.18,op:.9}],
 goldStrike:[{sh:'coin',y:1.7,sc:3,sc1:3.6,tint:'w',op:.95},{sh:'pok',y:1.8,sc:2,sc1:2.7,d0:.12,tint:'w'},
   {sh:'lens',y:1.8,sc:2.6,sc1:.9,d1:.6,op:.85},{sh:'star',y:1.8,sc:1.5,sc1:.7,d0:.1,d1:.65,op:.75},
   {sh:'spark',y:1.3,sc:2.2,rise:.9,d0:.2,op:.8}],
 hammerFall:[{sh:'hammer',y:2.6,rise:-.9,sc:3.8,sc1:4.2,ang:-1,spin:-4.8,d0:0,d1:.42,op:.9},
   {sh:'star',y:1.1,sc:3,sc1:1.4,d0:.4,d1:.95,op:.95},{sh:'pok',y:.9,sc:3.2,sc1:4.4,d0:.4,tint:'w'},
   {sh:'wave',y:.4,sc:3.4,sc1:5.2,d0:.44,op:.9},{sh:'decal',face:'ground',sc:3,sc1:4.2,d0:.4,op:.8},
   {sh:'smoke',y:.5,sc:3,rise:.9,d0:.5,op:.6},{sh:'spark',y:.8,sc:2.8,rise:1.2,d0:.55,op:.85}],
 cartCrash:[{sh:'ring',face:'ground',sc:2.3,sc1:4.2,op:.9},{sh:'pok',y:1.7,sc:3.5,sc1:4.6,d0:.06,tint:'w'},
   {sh:'wave',y:.5,sc:3.2,sc1:4.4,d0:.04,op:.9},{sh:'slash',y:1.8,sc:3.4,ang:-.9,d0:.04},
   {sh:'smoke',y:.6,sc:3.1,rise:.9,d0:.25,op:.6},{sh:'star',y:1.6,sc:1.6,sc1:.7,d0:.1,d1:.6,op:.7}],
 fireNova:[{sh:'ring',face:'ground',sc:2.5,sc1:4.4,op:.9},{sh:'decal',face:'ground',sc:3,sc1:3.9,d0:.04,op:.6},
   {sh:'flame',x:-1,z:.5,y:.2,sc:2.3,d0:.05},{sh:'flame',x:1,z:-.5,y:.2,sc:2.5,d0:.15},
   {sh:'flame',x:.2,z:1.1,y:.2,sc:2.2,d0:.25},{sh:'flame',x:-.4,z:-1,y:.2,sc:2.1,d0:.35},
   {sh:'smoke',y:1.1,sc:2.9,rise:1.1,d0:.4,op:.55},{sh:'spark',y:.6,sc:2.6,rise:1,d0:.3,op:.8}],
 sand:[{sh:'smoke',y:.5,sc:3.1,sc1:3.9,op:.7},{sh:'ring',face:'ground',sc:1.9,sc1:3.4,d0:.08,op:.75},
   {sh:'smoke',y:.8,sc:2.2,rise:.9,d0:.2,op:.55},{sh:'spark',y:.6,sc:2.2,rise:.8,d0:.25,op:.7},
   {sh:'wave',y:.3,sc:2,sc1:3,d0:.15,op:.5}],
 earthTrap:[{sh:'decal',face:'ground',sc:2.3,sc1:3.4,op:.85},{sh:'ice',y:.2,sc:2.6,d0:.1,tint:'#d8b070'},
   {sh:'ice',x:.7,z:.4,y:.1,sc:2,d0:.2,tint:'#c8a060'},{sh:'ice',x:-.7,z:-.3,y:.1,sc:2,d0:.28,tint:'#c8a060'},
   {sh:'pok',y:.9,sc:2.6,sc1:3.5,d0:.3},{sh:'smoke',y:.6,sc:2.8,rise:.8,d0:.35,op:.6}],
 bleed:[{sh:'pok',y:1.9,sc:2.6,sc1:3.5,op:.95},{sh:'slash',y:1.9,sc:3,ang:.7,d0:.06},
   {sh:'spark',y:1.1,sc:2.2,rise:1.1,d0:.2,op:.85},{sh:'lens',y:1.8,sc:2.2,sc1:.8,d1:.5,op:.7}],
 windAura:[{sh:'decal',face:'ground',sc:2.3,sc1:3.2,op:.8},{sh:'spark',y:.4,sc:2.8,rise:2.1,op:.9},
   {sh:'spark',y:.2,sc:2.2,rise:2.6,d0:.15,op:.8},{sh:'ring',y:1.7,sc:2.1,sc1:2.8,d0:.1,op:.65},
   {sh:'lens',y:1.1,sc:2.6,sc1:1.1,d1:.6,tint:'w',op:.6}],
 shieldAura:[{sh:'ring',y:1.7,sc:2.6,sc1:3.4,op:.85},{sh:'lens',y:1.8,sc:3.1,sc1:1.5,d1:.65,tint:'w',op:.8},
   {sh:'spark',y:.6,sc:2.4,rise:1.5,d0:.15,op:.85},{sh:'decal',face:'ground',sc:1.9,sc1:2.7,op:.6},
   {sh:'cross',y:2,sc:1.3,sc1:.7,d0:.2,d1:.8,op:.6}],
 frenzyAura:[{sh:'flame',y:.3,sc:2.6,sc1:3.2,op:.85},{sh:'ring',face:'ground',sc:2.1,sc1:3.2,d0:.08,op:.8},
   {sh:'spark',y:.6,sc:2.6,rise:1.7,d0:.15,op:.9},{sh:'lens',y:1.3,sc:2.8,sc1:1.1,d1:.6,op:.7}],
 venomAura:[{sh:'bubble',y:.3,sc:2.6,sc1:3.2,op:.9},{sh:'ring',face:'ground',sc:2.1,sc1:3,d0:.1,op:.7},
   {sh:'smoke',y:.8,sc:2.6,rise:.9,d0:.2,op:.55},{sh:'spark',y:.6,sc:2,rise:1.3,d0:.25,op:.7}],
 holyAura:[{sh:'pillar',y:.1,sc:2.8,sc1:3.4,op:.8},{sh:'decal',face:'ground',sc:2.5,sc1:3.4,d0:.05,op:.8},
   {sh:'spark',y:.6,sc:3,rise:1.9,d0:.12,op:.9},{sh:'lens',y:1.8,sc:2.9,sc1:1.3,d1:.65,tint:'w',op:.75},
   {sh:'cross',y:2.2,sc:1.4,sc1:.8,d0:.2,d1:.85,op:.65}],
 // ---------- per-skill overrides: shared families, distinct looks ----------
 // v79.3: Fire Bolt = a few single bolts out of the sky; Napalm Vulcan = a ghost-orb
 // volley fired from the caster; Holy Light = a pillar that comes DOWN on the target, no
 // projectile; Magnus = holy pillars raining out of the sky onto the field.
 fire:[{sh:'bolt',y:6,rise:-5.4,sc:3.4,d0:0,d1:.4,op:.95},
   {sh:'bolt',x:.8,z:.4,y:6.4,rise:-5.8,sc:3,d0:.12,d1:.52,op:.9},
   {sh:'bolt',x:-.7,z:-.4,y:6.2,rise:-5.6,sc:2.8,d0:.26,d1:.66,op:.85},
   {sh:'pok',y:.9,sc:2.8,sc1:3.6,d0:.38,tint:'w'},{sh:'pok',x:.8,z:.4,y:.9,sc:2.4,sc1:3.2,d0:.5,tint:'w'},
   {sh:'pok',x:-.7,z:-.4,y:.9,sc:2.3,sc1:3,d0:.64,tint:'w'},
   {sh:'decal',face:'ground',sc:2.6,sc1:3.8,d0:.36,op:.75},
   {sh:'smoke',y:1,sc:2.6,rise:1.2,d0:.5,op:.5},{sh:'spark',y:.6,sc:2.4,rise:1.4,d0:.45,op:.8}],
 napalm:[{sh:'lens',y:.9,sc:2,sc1:2.6,d1:.62,op:.95},
   {sh:'bubble',y:.9,sc:1.4,sc1:1.9,d1:.55,op:.7},{sh:'spark',y:1.1,sc:1.6,rise:.4,d0:.05,d1:.5,op:.7},
   {sh:'pok',y:.9,sc:3,sc1:4.2,d0:.6,tint:'w'},{sh:'lens',y:1,sc:3.4,sc1:1.3,d0:.62,op:.9},
   {sh:'ring',face:'ground',sc:2,sc1:3.6,d0:.64,op:.75},{sh:'bubble',y:.7,sc:2.4,sc1:3.2,d0:.68,op:.85},
   {sh:'smoke',y:1,sc:2.4,rise:1,d0:.72,op:.5}],
 holy:[{sh:'pillar',y:4.8,rise:-4.2,sc:3,sc1:3.6,d0:0,d1:.5,op:.95},
   {sh:'cross',y:1.9,sc:2,sc1:1,d0:.32,d1:.9,op:.9},{sh:'lens',y:1.7,sc:3,sc1:1.2,d0:.3,d1:.9,tint:'w',op:.9},
   {sh:'ring',face:'ground',sc:1.6,sc1:3.2,d0:.32,op:.8},{sh:'spark',y:.6,sc:2.6,rise:1.6,d0:.45,op:.9}],
 magnus:[{sh:'decal',face:'ground',sc:3.8,sc1:5.2,op:.95},
   {sh:'pillar',x:-.9,z:.4,y:5.2,rise:-4.8,sc:2.4,d0:.04,d1:.5,op:.9},
   {sh:'pillar',x:1,z:-.5,y:5.6,rise:-5.2,sc:2.7,d0:.2,d1:.66,op:.9},
   {sh:'pillar',x:.1,z:1,y:5.4,rise:-5,sc:2.3,d0:.36,d1:.82,op:.85},
   {sh:'pillar',x:-.4,z:-.9,y:5.2,rise:-4.8,sc:2.2,d0:.5,d1:.96,op:.85},
   {sh:'cross',y:2.2,sc:2.2,sc1:1.1,d0:.5,d1:.96,op:.85},
   {sh:'lens',y:1.4,sc:3.6,sc1:1.5,d0:.55,d1:.96,tint:'w',op:.8},
   {sh:'spark',y:.6,sc:3.4,rise:1.4,d0:.5,op:.9}],
 // Thunder Storm keeps pale bolts; Lord of Vermilion burns red with a cross flash
 vermilion:[{sh:'decal',face:'ground',sc:4,sc1:5.4,op:.9},{sh:'cross',y:2.6,sc:2.2,sc1:1.2,d0:.05,d1:.6,op:.85},
   {sh:'bolt',x:-1.1,z:.4,sc:4.2,d0:.05},{sh:'bolt',x:1,z:-.5,sc:4.6,d0:.16},
   {sh:'bolt',x:.1,z:1,sc:4,d0:.3},{sh:'bolt',x:-.5,z:-.9,sc:3.8,d0:.44},{sh:'bolt',x:.7,z:.6,sc:3.6,d0:.58},
   {sh:'lens',y:1,sc:3.8,sc1:1.2,d0:.1,d1:.8,op:.85},{sh:'star',y:.9,sc:1.9,sc1:.8,d0:.3,d1:.75,op:.7}],
 // Fire Ball: the ball arcs out and detonates; Magnum Break keeps its ground ring
 fireball:[{sh:'lens',y:.9,sc:2.4,sc1:2.8,d1:.7,tint:'w',op:.95},
   {sh:'flame',y:.8,sc:2.2,sc1:2.6,d1:.7,op:.9},{sh:'spark',y:1,sc:1.6,rise:.5,d0:.05,d1:.6,op:.75},
   {sh:'smoke',y:.9,sc:1.8,rise:.4,d0:.1,d1:.65,op:.4},
   {sh:'pok',y:.9,sc:3.2,sc1:4.4,d0:.68,tint:'w'},{sh:'flame',y:.5,sc:2.6,d0:.72,op:.9},
   {sh:'flame',x:1,y:.4,sc:2,d0:.78,op:.8},{sh:'flame',x:-1,y:.4,sc:2,d0:.84,op:.8},
   {sh:'wave',y:.4,sc:2.8,sc1:4,d0:.7,op:.8},{sh:'smoke',y:1,sc:2.8,rise:1.2,d0:.76,op:.55}],
 // Meltdown: the weapon itself burns, then the heat lashes out
 meltdown:[{sh:'flame',y:1.6,x:-.5,sc:2,sc1:2.6,rise:.6,d0:0,op:.9},
   {sh:'flame',y:2,x:-.2,sc:1.7,sc1:2.2,rise:.7,d0:.1,op:.85},
   {sh:'lens',y:1.7,x:-.4,sc:2,sc1:1,d1:.5,tint:'w',op:.7},
   {sh:'ring',face:'ground',sc:2.4,sc1:4.4,d0:.3,op:.9},{sh:'wave',y:.5,sc:3.2,sc1:4.6,d0:.35,op:.85},
   {sh:'flame',x:1.1,z:.4,y:.4,sc:2.4,d0:.4,op:.9},{sh:'flame',x:-1,z:-.7,y:.4,sc:2.2,d0:.5,op:.85},
   {sh:'flame',x:.3,z:-.4,y:.5,sc:2,d0:.58,op:.8},
   {sh:'smoke',y:1,sc:3,rise:1.1,d0:.5,op:.55},{sh:'spark',y:.7,sc:2.6,rise:1.2,d0:.45,op:.85}],
 // Magnum Break: the classic ring_yellow sweep with a wave
 mbrk:[{sh:'ring',face:'ground',sc:2.2,sc1:4.6,op:.95},{sh:'wave',y:.5,sc:3.6,sc1:5,d0:.06,op:.9},
   {sh:'flame',y:.8,sc:2.6,rise:.8,d0:.1,op:.85},{sh:'flame',x:.9,y:.5,sc:2,d0:.2,op:.75},
   {sh:'flame',x:-.9,y:.5,sc:2,d0:.28,op:.75},{sh:'smoke',y:.8,sc:2.8,rise:1,d0:.35,op:.5},
   {sh:'star',y:1,sc:1.7,sc1:.8,d0:.1,d1:.6,op:.7}],
 // Cart Termination: one enormous slam; Cart Revolution below keeps the spin
 cart:[{sh:'decal',face:'ground',sc:3,sc1:4.6,op:.9},{sh:'star',y:1.2,sc:2.6,sc1:1,d0:.05,d1:.55,op:.9},
   {sh:'pok',y:1.2,sc:4,sc1:5.4,d0:.08,tint:'w'},{sh:'wave',y:.5,sc:3.8,sc1:5.2,d0:.1,op:.9},
   {sh:'smoke',y:.6,sc:3.6,rise:1,d0:.25,op:.65},{sh:'spark',y:.8,sc:3,rise:1.2,d0:.3,op:.85}],
 cartrev:[{sh:'vortex',face:'ground',sc:3.2,sc1:4.2,spin:4,op:.85},{sh:'ring',face:'ground',sc:2.2,sc1:4,op:.85},
   {sh:'wave',y:.5,sc:3.2,sc1:4.6,d0:.08,op:.85},{sh:'pok',y:1.4,sc:2.8,sc1:3.8,d0:.1,tint:'w'},
   {sh:'smoke',y:.5,sc:2.8,rise:.8,d0:.3,op:.55},{sh:'coin',y:1.4,sc:1.6,sc1:2,d0:.2,d1:.8,tint:'w',op:.6}],
 // Two-Hand Quicken: blade-wind rings; Improve Concentration: an aiming eye lens
 quick:[{sh:'slash',y:1.8,sc:2.8,sc1:3.6,spin:4,op:.8},{sh:'slash',y:1.8,sc:2.4,spin:-4,ang:2,op:.6},
   {sh:'ring',face:'ground',sc:2,sc1:3,d0:.1,op:.75},{sh:'spark',y:.4,sc:2.4,rise:2,d0:.15,op:.85},
   {sh:'lens',y:1.4,sc:2.2,sc1:1,d1:.6,tint:'w',op:.6}],
 iconc:[{sh:'lens',y:1.9,sc:2.6,sc1:1.4,op:.8},{sh:'ring',y:1.9,sc:1.9,sc1:2.7,d0:.1,op:.75},
   {sh:'arrow',y:1.9,sc:2.2,sc1:2.8,d0:.2,d1:.8,op:.7},{sh:'spark',y:.4,sc:2.4,rise:2.1,d0:.15,op:.85},
   {sh:'decal',face:'ground',sc:1.8,sc1:2.6,op:.55}],
 // Increase AGI: pale wind column; Wind Walk: feather-light sparkles drifting through
 iagi:[{sh:'spark',y:.3,sc:2.8,rise:2.4,op:.9},{sh:'spark',y:.2,sc:2.2,rise:2.8,d0:.2,op:.8},
   {sh:'ring',y:1.6,sc:2,sc1:2.7,d0:.1,op:.6},{sh:'smoke',y:.7,sc:2,rise:1.4,d0:.15,op:.35,tint:'w'},
   {sh:'decal',face:'ground',sc:1.9,sc1:2.7,op:.6}],
 wwalk:[{sh:'falcon',y:2.8,sc:2,sc1:2.4,d0:.1,d1:.7,op:.6},{sh:'spark',y:.3,sc:2.6,rise:2.3,op:.9},
   {sh:'smoke',y:.5,sc:2.4,rise:1.2,d0:.1,op:.4,tint:'w'},{sh:'ring',face:'ground',sc:2.1,sc1:3.1,d0:.1,op:.7},
   {sh:'spark',y:.5,sc:1.8,rise:2.6,d0:.3,op:.7}],
 // Cart Boost: wheel-rings and sparks off the ground
 cboost:[{sh:'ring',y:.9,sc:2,sc1:2.8,spin:3,op:.7},{sh:'ring',y:.9,sc:1.5,sc1:2.2,ang:1.6,spin:-3,d0:.1,op:.55},
   {sh:'spark',y:.3,sc:2.4,rise:1.9,d0:.1,op:.85},{sh:'smoke',y:.35,sc:2.2,rise:.9,d0:.2,op:.45},
   {sh:'decal',face:'ground',sc:2,sc1:2.9,op:.6}],
 // Frenzy burns; Overthrust sparks off the weapon; Provoke is a roar wave
 ovthrust:[{sh:'star',y:1.9,sc:1.9,sc1:.8,d0:0,d1:.5,op:.85},{sh:'spark',y:1.4,sc:2.6,rise:1.4,d0:.1,op:.9},
   {sh:'slash',y:1.9,sc:2.4,ang:.8,d0:.15,op:.7},{sh:'ring',face:'ground',sc:1.9,sc1:2.9,d0:.1,op:.7},
   {sh:'lens',y:1.6,sc:2.4,sc1:1,d1:.6,op:.6}],
 provoke:[{sh:'wave',y:.8,sc:3,sc1:4.4,op:.85},{sh:'wave',y:1.3,sc:2.6,sc1:3.8,d0:.15,op:.7},
   {sh:'lens',y:1.8,sc:2.6,sc1:1.2,d0:.05,d1:.6,op:.75},{sh:'ring',face:'ground',sc:2,sc1:3,d0:.1,op:.7},
   {sh:'smoke',y:.6,sc:2.2,rise:.8,d0:.25,op:.45}],
 // Magnus keeps the pillar field; Signum Crucis sweeps a cross wave
 signum:[{sh:'cross',y:2.1,sc:2.6,sc1:1.2,d0:0,d1:.55,op:.95},{sh:'wave',y:.6,sc:3.2,sc1:4.6,d0:.15,op:.85},
   {sh:'decal',face:'ground',sc:3.2,sc1:4.4,d0:.1,op:.85},{sh:'pillar',x:.2,z:.2,y:.2,sc:2,d0:.3},
   {sh:'spark',y:.6,sc:2.8,rise:1.4,d0:.25,op:.9}],
 // Judex: a starburst judgement under the pillar
 judex:[{sh:'cross',y:5.2,rise:-4.6,sc:2.6,d0:0,d1:.42,op:.95},
   {sh:'star',y:1.6,sc:3.2,sc1:1.2,d0:.4,d1:.95,op:.95},{sh:'pillar',y:.2,sc:3.2,sc1:4,d0:.38,op:.9},
   {sh:'lens',y:1.8,sc:3.4,sc1:1.3,d0:.4,d1:.95,tint:'w',op:.9},
   {sh:'ring',face:'ground',sc:2,sc1:4.2,d0:.44,op:.85},{sh:'spark',y:.7,sc:3,rise:1.8,d0:.5,op:.9}],
 // Double Strafe: two quick streaks; Focused Arrow: one heavy shot; Phantasmic: a ghost pin
 focus:[{sh:'arrow',y:1.9,sc:3.4,sc1:4.4,op:.95},{sh:'lens',y:1.9,sc:2.4,sc1:.9,d1:.5,tint:'w',op:.8},
   {sh:'pok',y:1.9,sc:2.2,sc1:3,d0:.2,tint:'w'},{sh:'star',y:1.9,sc:1.4,sc1:.6,d0:.25,d1:.75,op:.7},
   {sh:'spark',y:1.3,sc:2,rise:.9,d0:.3,op:.8}],
 pharrow:[{sh:'arrow',y:1.9,sc:3,sc1:3.8,op:.75},{sh:'arrow',y:1.9,sc:2.4,d0:.12,d1:.7,op:.5},
   {sh:'ring',y:1.9,sc:1.6,sc1:2.4,d0:.25,op:.7},{sh:'ring',y:1.9,sc:1.2,sc1:1.9,ang:1.2,d0:.35,op:.55},
   {sh:'smoke',y:1.4,sc:2,rise:.6,d0:.3,op:.4},{sh:'spark',y:1.2,sc:1.9,rise:.8,d0:.35,op:.7}],
 // Joint Beat: two surgical cracks instead of one big smash
 jointbeat:[{sh:'slash',y:1.9,sc:2.4,ang:.9,op:.9},{sh:'slash',y:1.6,sc:2.1,ang:-1.4,d0:.15,op:.8},
   {sh:'pok',y:1.8,sc:1.7,sc1:2.3,d0:.1,tint:'w'},{sh:'pok',y:1.5,sc:1.4,sc1:1.9,d0:.3,tint:'w'},
   {sh:'star',y:1.8,sc:1.2,sc1:.5,d0:.2,d1:.7,op:.7}],
 // Blitz Beat: a quick swoop with feathers; Falcon Assault below: one heavy stoop with a star hit
 blitz:[{sh:'falcon',y:2.6,sc:3.1,sc1:3.9,op:.95},{sh:'lens',y:2.2,sc:2.4,sc1:.9,d0:.1,d1:.65,tint:'w',op:.8},
   {sh:'pok',y:1.8,sc:2,sc1:2.8,d0:.3,tint:'w'},{sh:'spark',y:1.4,sc:2.3,rise:.9,d0:.35,op:.8},
   {sh:'spark',y:1.7,sc:1.6,rise:1.2,d0:.18,op:.6}],
 falcon:[{sh:'falcon',y:3.4,sc:3,rise:-1.4,d0:0,d1:.55,op:.95},{sh:'star',y:1.8,sc:2.2,sc1:.9,d0:.4,d1:.9,op:.85},
   {sh:'lens',y:2,sc:2.6,sc1:1,d0:.35,d1:.85,tint:'w',op:.8},{sh:'pok',y:1.7,sc:2.4,sc1:3.2,d0:.42,tint:'w'},
   {sh:'spark',y:1.2,sc:2.6,rise:1,d0:.5,op:.85},{sh:'smoke',y:.8,sc:2.2,rise:.7,d0:.55,op:.4}],
 // The thief-line poisons are three different reads: Envenom is a focused splash burst on
 // the target, Venom Dust a lingering low cloud, Venom Splasher a sticky bomb that erupts.
 env:[{sh:'bubble',y:.9,sc:2.2,sc1:3.2,op:.9},{sh:'pok',y:1.5,sc:2,sc1:2.8,d0:.1,tint:'w'},
   {sh:'bubble',x:.7,y:1.2,sc:1.5,rise:.7,d0:.15,op:.8},{sh:'bubble',x:-.7,y:1.1,sc:1.5,rise:.6,d0:.22,op:.8},
   {sh:'spark',y:.8,sc:2,rise:1,d0:.25,op:.75},{sh:'ring',face:'ground',sc:1.6,sc1:2.6,d0:.12,op:.6}],
 vdust:[{sh:'decal',face:'ground',sc:3.4,sc1:4.4,op:.8},{sh:'smoke',y:.4,sc:3.4,rise:.5,op:.6},
   {sh:'smoke',y:.6,sc:2.6,rise:.7,d0:.2,op:.5},{sh:'bubble',y:.2,sc:2.4,sc1:2.8,d0:.1,op:.8},
   {sh:'bubble',x:.8,z:-.5,y:.15,sc:1.8,d0:.3,op:.6},{sh:'ring',face:'ground',sc:2.4,sc1:3.6,d0:.08,op:.6}],
 // Soul Destroyer: the soul wave rolls out as a vortex
 sdestroy:[{sh:'vortex',y:1.6,sc:2.4,sc1:3.2,spin:3,op:.75},
   {sh:'slash',y:1.6,sc:3.6,sc1:4.6,op:.95},
   {sh:'pok',y:1.6,sc:2.9,sc1:3.9,d0:.55,tint:'w'},{sh:'bubble',y:1,sc:2,sc1:2.8,d0:.45,op:.7}],
 // Kyrie Eleison: the shield bubble with its cross; Energy Coat keeps the plain shell
 kyrie:[{sh:'ring',y:1.8,sc:2.9,sc1:3.7,op:.9},{sh:'ring',y:1.8,sc:2.3,sc1:3,ang:1.1,d0:.1,op:.6},
   {sh:'cross',y:2.1,sc:1.8,sc1:.9,d0:.15,d1:.8,op:.85},{sh:'lens',y:1.9,sc:3.1,sc1:1.5,d1:.6,tint:'w',op:.7},
   {sh:'spark',y:.7,sc:2.2,rise:1.6,d0:.2,op:.8},{sh:'decal',face:'ground',sc:2,sc1:2.8,op:.55}],
 // Basilica: pillars of light raise the dome
 basilica:[{sh:'decal',face:'ground',sc:3.2,sc1:4.2,op:.85},{sh:'pillar',x:-.8,z:.3,y:.1,sc:2,d0:.05},
   {sh:'pillar',x:.8,z:-.3,y:.1,sc:2.2,d0:.18},{sh:'pillar',y:.1,sc:2.6,d0:.32},
   {sh:'cross',y:2.6,sc:1.7,sc1:.9,d0:.3,d1:.9,op:.8},{sh:'spark',y:.7,sc:3,rise:2,d0:.2,op:.9}]
};
function skillFxCanSprite(){return typeof document!=='undefined'&&!!THREE.CanvasTexture&&!!THREE.PlaneGeometry}
function skillFxSpritePart(fx,L){
  const sh=fxSheet(L.sh);if(!sh)return false;
  const tint=L.tint==null?(fx.color||'#fff'):(L.tint==='w'?'#ffffff':L.tint);
  const geometry=new THREE.PlaneGeometry(1,1);
  // v79.3: ground layers sit proud of the terrain (y>=.08) with a polygon offset, so the
  // additive quad can never z-fight the floor into the flickering square the owner saw.
  const gy=L.face==='ground'?Math.max(L.y||0,.08):(L.y||0);
  const material=new THREE.MeshBasicMaterial({map:sh.tex,color:tint,transparent:true,opacity:0,depthWrite:false,
    side:THREE.DoubleSide,blending:L.blend==='normal'?THREE.NormalBlending:THREE.AdditiveBlending,
    polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2});
  const mesh=new THREE.Mesh(geometry,material);mesh.userData.skillFxOwnGeometry=1;
  mesh.position.set(L.x||0,gy,L.z||0);mesh.scale.set(L.sc||1,L.sc||1,1);
  if(L.face==='ground')mesh.rotation.x=-Math.PI/2;
  fx.group.add(mesh);
  fx.parts.push({spr:1,mesh,n:sh.n,d0:L.d0||0,d1:L.d1==null?1:L.d1,sc0:L.sc||1,sc1:L.sc1==null?(L.sc||1):L.sc1,
    spin:L.spin||0,ang:L.ang||0,op:L.op==null?.92:L.op,x:L.x||0,y:gy,z:L.z||0,rise:L.rise||0,
    ground:L.face==='ground',facing:L.face!=='ground',base:[1,1,1],grow:[1,1],alpha:1,frame:0});
  return true;
}
// PlaneGeometry UV order in three r128: (0,1) (1,1) (0,0) (1,0). Frames are picked out of the
// sheet with repeat/offset math done by hand so each sprite part can hold its own frame, and
// the rotation spins inside the frame cell, so billboards and decals share one code path.
const FX_UV=[[0,1],[1,1],[0,0],[1,0]];
function skillFxSpriteUv(p,frame,ang){
  const attr=p.mesh.geometry.attributes&&p.mesh.geometry.attributes.uv;
  if(!attr||!attr.setXY)return;
  const pu=.02/p.n,pv=.02,u0=frame/p.n+pu,u1=(frame+1)/p.n-pu,v0=pv,v1=1-pv;
  const ca=Math.cos(ang),sa=Math.sin(ang);
  // v79.5: rotate in CELL-NORMALISED space (both axes 0..1 over the frame cell) and map back.
  // The old math rotated raw u (a 1/n sliver of the sheet) against raw v (the full height), so
  // any spun/angled layer smeared its v-span across the whole sheet - the stretched "box"
  // bands the owner kept seeing. Normalising first makes the spin a true in-place rotation.
  for(let i=0;i<4;i++){const dx=FX_UV[i][0]-.5,dy=FX_UV[i][1]-.5;
    const rx=.5+dx*ca-dy*sa,ry=.5+dx*sa+dy*ca;
    attr.setXY(i,u0+rx*(u1-u0),v0+ry*(v1-v0))}
  attr.needsUpdate=true;
}

function makeSkillFxNode(fx){
  fx.group=new THREE.Group();fx.parts=[];
  const recipe=(!(SKILL_VFX[fx.id]&&SKILL_VFX[fx.id].redesigned)&&SKILL_FX_SPR[fx.id])||SKILL_FX_SPR[fx.kind];
  if(recipe&&skillFxCanSprite()){let made=0;for(const L of recipe)if(skillFxSpritePart(fx,L))made++;
    if(made){scene.add(fx.group);return}}
  const c=fx.color||'#fff',soft='#ffffff',gold='#ffe18b',cool='#b8f3ff';
  const p=(shape,col,x,y,z,sx=1,sy=1,sz=1,opts={})=>skillFxPart(fx,shape,col,x,y,z,sx,sy,sz,opts);
  const groundRing=(col,x=0,z=0,scale=1,opts={})=>p('ring',col,x,.035,z,scale,scale,1,{ground:true,grow:opts.grow||[.65,1.7],spin:opts.spin||0,alpha:opts.alpha||.86});
  switch(fx.kind){
    case 'heal':
      groundRing(c,0,0,1,{grow:[.45,1.7],spin:.3});p('orb',c,0,.45,0,.65,.65,.65,{rise:1.25,grow:[.7,.25]});
      p('orb',soft,-.28,.2,.06,.22,.22,.22,{rise:.95});p('orb',soft,.3,.18,-.06,.18,.18,.18,{rise:.8});break;
    case 'impact':
      p('torus',c,0,1.05,0,.85,.85,.85,{facing:true,grow:[.65,1.5],spin:1.4});
      p('orb',gold,0,1.05,0,.62,.62,.62,{grow:[.4,.08]});p('shard',c,-.28,.85,0,.55,.8,.55,{rise:.18,spin:2});break;
    case 'shockwave':case 'hammerFall':case 'cartCrash':
      groundRing(c,0,0,1,{grow:[.4,2.1],spin:.65});p('torus',gold,0,.72,0,1,.72,1,{facing:true,grow:[.6,1.45],spin:-1.1});
      if(fx.kind==='hammerFall')for(let i=0;i<4;i++)p('shard',c,Math.cos(i*Math.PI/2)*.42,.38,Math.sin(i*Math.PI/2)*.42,.6,.8,.6,{rise:.2,grow:[.6,.35]});
      else p('orb',soft,0,.7,0,.55,.55,.55,{grow:[.5,.1]});break;
    case 'thrust':case 'spearThrow':
      p('bar',c,0,.95,0,.72,.72,1.55,{spin:.18});p('orb',soft,0,.95,.42,.32,.32,.32,{grow:[.75,.12]});
      p('torus',gold,0,.95,-.25,.62,.62,.62,{facing:true,grow:[.5,1.25],spin:1});break;
    case 'spiral':case 'multiSlash':
      for(let i=0;i<3;i++)p('torus',i===1?soft:c,0,.72+i*.34,0,.74-i*.08,.72-i*.08,.74-i*.08,
        {facing:true,grow:[.6,1.35],spin:(i%2?1:-1)*2.2});break;
    case 'fireBolt':case 'soulBolt':case 'holyBolt':
      p('orb',fx.kind==='fireBolt'?gold:c,0,.05,0,.78,.78,.78,{grow:[.7,.38],spin:1.2});
      p('shard',c,0,.02,-.28,.66,1.05,.66,{spin:1.4});
      if(fx.kind!=='fireBolt')p('torus',soft,0,.04,0,.82,.82,.82,{facing:true,grow:[.65,1.3],spin:1.5});
      if(fx.kind==='holyBolt'){p('crossV',gold,0,.04,0,.72,.72,.72,{facing:true,grow:[.5,.9]});p('crossH',gold,0,.04,0,.72,.72,.72,{facing:true,grow:[.5,.9]})}break;
    case 'psychic':case 'poison':case 'poisonBomb':
      groundRing(c,0,0,1,{grow:[.5,1.5],spin:1});p('torus',c,0,.68,0,.82,.82,.82,{facing:true,grow:[.7,1.2],spin:-1.8});
      for(let i=0;i<4;i++)p('orb',i%2?soft:c,Math.cos(i*Math.PI/2)*.36,.68,Math.sin(i*Math.PI/2)*.36,.38,.38,.38,
        {rise:(i%2?.28:.08),grow:[.75,.35],spin:1.5});break;
    case 'iceStorm':case 'iceNova':case 'iceHit':
      if(fx.kind!=='iceHit')groundRing(c,0,0,1,{grow:[.55,1.8],spin:-.6});
      for(let i=0;i<(fx.kind==='iceHit'?3:7);i++){
        const a=i*Math.PI*2/(fx.kind==='iceHit'?3:7),r=fx.kind==='iceHit'?.2:.52;
        p('shard',i%2?cool:c,Math.cos(a)*r,.32+(i%3)*.22,Math.sin(a)*r,.72,.92,.72,{rise:.18,grow:[.7,.45],spin:.7});}
      p('orb',soft,0,.72,0,.55,.55,.55,{grow:[.45,.08]});break;
    case 'lightning':case 'lightningStorm':
      for(let i=0;i<(fx.kind==='lightning'?1:3);i++){
        const x=(i-1)*.38,z=(i%2-.5)*.24;
        skillFxLine(fx,[[x,3.15,z],[x-.16,2.62,z+.06],[x+.12,2.12,z-.04],[x-.1,1.55,z+.04],[x+.04,.84,z],[x,.16,z]],c,.95);
        if(i===0)skillFxLine(fx,[[x-.1,1.55,z+.04],[x-.42,1.2,z+.1],[x-.48,.88,z]],soft,.68);
      }p('orb',cool,0,.18,0,.42,.42,.42,{grow:[.55,.08]});break;
    case 'meteor':
      groundRing(c,0,0,1,{grow:[.4,1.45],spin:.25});
      for(let i=0;i<3;i++){
        const x=(i-1)*.42,z=(i%2?-.22:.2),top=3.35+(i%2)*.45;
        p('orb',i===1?gold:c,x,top,z,.82,.82,.82,{rise:-top+.35,grow:[1.15,.55],spin:1.7});
        p('shard',c,x,top-.38,z,.72,1.5,.72,{rise:-top+.35,grow:[1,.55],spin:-1.3});}
      break;
    case 'gravity':
      groundRing('#b080ff',0,0,1,{grow:[.45,1.8],spin:1.3});p('disk','#30104f',0,.045,0,1.2,1.2,1,{ground:true,grow:[.4,1.1],alpha:.48});
      p('orb',c,0,.8,0,1.05,1.05,1.05,{grow:[1.4,.25],spin:2});p('torus',soft,0,.78,0,.8,.8,.8,{facing:true,grow:[.55,1.25],spin:-1.5});break;
    case 'arrowBurst':case 'arrowLine':
      for(let i=0;i<(fx.kind==='arrowBurst'?3:1);i++){
        const x=(i-1)*.22,z=(i-1)*-.18;p('bar',i===1?soft:c,x,.85+i*.18,z,.42,.42,1.4,{spin:(i-1)*.16,grow:[.65,.9]});}
      p('torus',soft,0,.9,0,.56,.56,.56,{facing:true,grow:[.5,1.1],spin:.4});break;
    case 'falcon':
      p('torus',gold,0,1,0,1.15,.42,.55,{facing:true,grow:[.35,1.1],spin:1.8});
      p('shard',soft,-.36,1.18,0,.72,.55,.72,{facing:true,rise:.16,spin:-.8});
      p('shard',gold,.36,1.18,0,.72,.55,.72,{facing:true,rise:.16,spin:.8});p('orb',soft,0,1.08,0,.34,.34,.34,{grow:[.8,.2]});break;
    case 'shadow':
      groundRing('#673b91',0,0,1,{grow:[.4,1.4],spin:-1});
      for(let i=0;i<5;i++)p('shard',i%2?'#b080ff':'#4a235f',Math.cos(i*Math.PI*2/5)*.38,.42,Math.sin(i*Math.PI*2/5)*.38,.72,1.25,.72,{rise:.35,spin:1.5});break;
    case 'radial':
      groundRing(c,0,0,1,{grow:[.45,2],spin:1});p('torus',gold,0,1.08,0,1.3,.82,1.3,{facing:true,grow:[.45,1.5],spin:-1.3});
      for(let i=0;i<6;i++)p('orb',i%2?soft:c,Math.cos(i*Math.PI/3)*.62,1,Math.sin(i*Math.PI/3)*.62,.24,.24,.24,{rise:.2,grow:[.7,.2]});break;
    case 'holyField':case 'holyNova':
      groundRing(c,0,0,1,{grow:[.45,1.9],spin:.6});p('torus',gold,0,.82,0,1,.72,1,{facing:true,grow:[.45,1.25],spin:-.8});
      p('crossV',soft,0,.9,0,.78,.78,.78,{facing:true,grow:[.45,1]});p('crossH',gold,0,.9,0,.78,.78,.78,{facing:true,grow:[.45,1]});break;
    case 'goldStrike':
      p('torus',gold,0,1,0,1,.72,1,{facing:true,grow:[.5,1.4],spin:1.4});
      p('orb',soft,-.22,.92,.1,.44,.44,.44,{grow:[.8,.08]});p('orb',gold,.3,1.18,-.08,.34,.34,.34,{rise:.25,grow:[.7,.2]});break;
    case 'fireNova':
      groundRing(c,0,0,1,{grow:[.45,1.9],spin:1.1});
      for(let i=0;i<8;i++){const a=i*Math.PI/4;p('orb',i%2?gold:c,Math.cos(a)*.46,.25+(i%3)*.12,Math.sin(a)*.46,.5,.58,.5,{rise:.38,grow:[.5,.18],spin:1});}
      p('torus',gold,0,.56,0,.86,.86,.86,{facing:true,grow:[.55,1.2],spin:-1});break;
    case 'arrowRain':
      groundRing(c,0,0,1,{grow:[.5,1.5],spin:.3});
      for(let i=0;i<5;i++)p('shaft',i%2?soft:c,(i-2)*.26,2.8+(i%2)*.35,(i%3-1)*.23,1,1,1,{rise:-2.5-(i%2)*.3,spin:(i-2)*.1});break;
    case 'sand':
      groundRing(c,0,0,1,{grow:[.5,1.45],spin:1.8});p('torus','#f6dc9b',0,.52,0,.9,.42,.9,{facing:true,grow:[.6,1.25],spin:2});
      for(let i=0;i<4;i++)p('orb','#f6dc9b',Math.cos(i*Math.PI/2)*.4,.35,Math.sin(i*Math.PI/2)*.4,.3,.3,.3,{rise:.34});break;
    case 'earthTrap':
      groundRing(c,0,0,1,{grow:[.42,1.3],spin:.4});
      for(let i=0;i<5;i++)p('shard',i%2?'#f4d8a2':c,Math.cos(i*Math.PI*2/5)*.35,.25,Math.sin(i*Math.PI*2/5)*.35,.8,1.3,.8,{rise:.3,grow:[.45,1]});break;
    case 'bleed':
      p('torus',c,0,1,0,.78,.78,.78,{facing:true,grow:[.55,1.2],spin:1.6});
      for(let i=0;i<4;i++)p('orb',i%2?'#ffaaaa':c,Math.cos(i*Math.PI/2)*.28,.72,Math.sin(i*Math.PI/2)*.2,.35,.42,.35,{rise:.4,grow:[.7,.2]});break;
    case 'windAura':case 'frenzyAura':case 'venomAura':case 'shieldAura':case 'holyAura':
      groundRing(c,0,0,1,{grow:[.5,1.25],spin:.9});p('torus',fx.kind==='holyAura'?gold:c,0,.82,0,1,.86,1,{facing:true,grow:[.68,1.2],spin:1.4});
      if(fx.kind==='shieldAura'||fx.kind==='holyAura')p('crossV',soft,0,.96,0,.72,.72,.72,{facing:true,grow:[.6,1]});
      for(let i=0;i<3;i++)p('orb',i%2?soft:c,Math.cos(i*Math.PI*2/3)*.34,.55,Math.sin(i*Math.PI*2/3)*.34,.28,.28,.28,{rise:.45,grow:[.7,.25],spin:1});break;
  }
  scene.add(fx.group);
}
function playSkillFx(id,target,color){
  if(simVisualsOff())return;
  const r=skillFxSpec(id,color);if(!r)return;
  const fx={...r,x0:pl.x,z0:pl.z,x1:target&&Number.isFinite(target.x)?target.x:pl.x,
    z1:target&&Number.isFinite(target.z)?target.z:pl.z,age:0,group:null,parts:[]};
  if(skillFx.length>=28){const old=skillFx.shift();disposeSkillFx(old)}skillFx.push(fx);
}
function disposeSkillFx(fx){if(!fx||!fx.group)return;scene.remove(fx.group);fx.group.traverse(o=>{
  if(o.material)o.material.dispose();if(o.userData&&o.userData.skillFxOwnGeometry&&o.geometry)o.geometry.dispose()});fx.group=null}
function tickSkillFx(dt){for(let i=skillFx.length-1;i>=0;i--){const fx=skillFx[i];fx.age+=dt;if(fx.age>=fx.life){disposeSkillFx(fx);skillFx.splice(i,1)}}}
function syncSkillFx(){
  for(const fx of skillFx){if(!fx.group)makeSkillFxNode(fx);const q=cl(fx.age/fx.life,0,1),ease=1-Math.pow(1-q,2);
    if(fx.at==='path')fx.group.position.set(fx.x0+(fx.x1-fx.x0)*ease,.95+Math.sin(q*Math.PI)*.34,fx.z0+(fx.z1-fx.z0)*ease);
    else{const x=fx.at==='caster'?fx.x0:fx.x1,z=fx.at==='caster'?fx.z0:fx.z1;fx.group.position.set(x,0,z)}
    for(const p of fx.parts){const m=p.mesh;
      if(p.spr){const lp=cl((q-p.d0)/Math.max(.001,p.d1-p.d0),0,1),le=1-Math.pow(1-lp,2);
        const s=p.sc0+(p.sc1-p.sc0)*le;m.scale.set(s,s,1);
        m.position.set(p.x,p.y+p.rise*q,p.z);
        if(p.ground)m.rotation.set(-Math.PI/2,0,0);else m.quaternion.copy(cam.quaternion);
        const vis=q>=p.d0&&q<p.d1&&lp>0;p.frame=vis?Math.min(p.n-1,Math.floor(lp*p.n)):0;
        m.material.opacity=vis?p.op*Math.min(1,.22+q*8)*Math.pow(1-q,.58):0;
        skillFxSpriteUv(p,p.frame,p.ang+p.spin*fx.age);continue}
      const s=p.grow[0]+(p.grow[1]-p.grow[0])*ease;
      m.position.set(p.x,p.y+p.rise*q,p.z);m.scale.set(p.base[0]*s,p.base[1]*s,p.base[2]*s);
      if(p.ground)m.rotation.set(-Math.PI/2,0,p.spin*fx.age);else if(p.facing)m.quaternion.copy(cam.quaternion);else m.rotation.y=p.spin*fx.age;
      m.material.opacity=p.alpha*Math.min(1,.22+q*8)*Math.pow(1-q,.58)}
  }
}

