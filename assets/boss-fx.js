'use strict';
// Boss skill FX — presentation only.
//
// Every MVP gets two signature moves. This module paints them; it never rolls damage, cooldowns,
// aggro or rewards. The combat loop owns the clock and passes the boss's projected feet + a
// per-cast random seed, exactly like the class skill renderer next door.
//
// Design space: the boss's feet are (0, 0), +x is right, +y is DOWN, and 1 unit is one CSS pixel
// at the reference camera (the caller maps 3.05 world units of projected height to 120 units,
// then multiplies by the boss tier's composition size). Effects are therefore resolution
// independent and sit on the ground no matter which map or zoom is active.
//
// Tiering: map 0-4 tier 1 (small, one clean idea), map 5-8 tier 2 (map-wide sweeps, layered
// motifs), map 9-11 tier 3 (full-width slashes, fracture/glitch/particle storms, camera shake).
const PGBossFx=(()=>{
  const TAU=Math.PI*2;
  const cl=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
  const lerp=(a,b,t)=>a+(b-a)*t;
  const smooth=t=>{t=cl(t);return t*t*(3-2*t)};
  const out=t=>1-Math.pow(1-cl(t),3);
  const inQ=t=>cl(t)*cl(t)*cl(t);
  const hash=n=>{const x=Math.sin(n*127.1+311.7)*43758.5453123;return x-Math.floor(x)};
  // Accepts '#abc', '#aabbcc' AND the 'rgb(...)'/'rgba(...)' strings this module itself produces.
  // (darken()/lighten() return rgb() strings; feeding one back into rgba() used to parse as black,
  // which is what turned several bright bands into heavy black stripes.)
  const rgb=value=>{
    if(Array.isArray(value))return value.map(v=>cl(Math.round(+v)||0,0,255));
    const str=String(value==null?'#ffffff':value).trim();
    if(/^rgba?\(/i.test(str)){
      const n=(str.match(/[\d.]+/g)||[]).map(Number);
      return [n[0]||0,n[1]||0,n[2]||0].map(v=>cl(Math.round(v),0,255));
    }
    const h=str.replace('#',''),v=h.length===3?[...h].map(x=>x+x).join(''):h;
    return [parseInt(v.slice(0,2),16)||0,parseInt(v.slice(2,4),16)||0,parseInt(v.slice(4,6),16)||0];
  };
  const rgba=(hex,a=1)=>{const c=rgb(hex);return `rgba(${c[0]},${c[1]},${c[2]},${cl(a)})`};
  const lighten=(hex,k=.5)=>{const c=rgb(hex);return `rgb(${c.map(v=>Math.round(v+(255-v)*k)).join(',')})`};
  const darken=(hex,k=.45)=>{const c=rgb(hex);return `rgb(${c.map(v=>Math.round(v*(1-k))).join(',')})`};

  // One row per map, in MAPS order. Two moves each; `colors` is [primary, secondary, core, accent].
  // `life` is the on-screen cast length the game clock sees. Wide moves also carry `choreo`, the
  // length their hand-written animation was designed for; paint() fast-forwards the choreography
  // into the shorter `life` so the whole move still plays but the field clears quickly. See the
  // screen-time note above TIER.
  const BOSSES=[
    {map:0,name:'Mastering',shape:'blob',tier:1,colors:['#7de06a','#ffd45c','#f2ffe8','#ff9ad5'],skills:[
      {id:'bj_jelly',name:'Jelly Barrage',pattern:'jellyBarrage',life:2.15,signature:'Nine jelly blobs bounce in on separate arcs and pop in a ring of green sparks.'},
      {id:'bj_crown',name:"King's Bounce",pattern:'kingsBounce',life:2.25,signature:'A golden crown drops onto the field and bounces three jelly shockwaves outward.'}
    ]},
    {map:1,name:'Drake',shape:'demon',tier:1,colors:['#4fa8ff','#bfe6ff','#ffffff','#2a5a8f'],skills:[
      {id:'dk_anchor',name:'Anchor Typhoon',pattern:'anchorTyphoon',life:2.5,signature:'A spectral anchor spins through three water orbits before slamming a foam ring flat.'},
      {id:'dk_cross',name:'Cutlass Cross',pattern:'cutlassCross',life:2.25,signature:'Two saltwater cutlass cleaves cross the field and burst into spray at the seam.'}
    ]},
    {map:2,name:'Baphomet',shape:'demon',tier:1,colors:['#b06bff','#ff8a3d','#fff0d0','#5a2a8f'],skills:[
      {id:'bp_sigil',name:'Goat Sigil',pattern:'goatSigil',life:2.55,signature:'A pentagram seal ignites and five fire columns answer its points under a horned crest.'},
      {id:'bp_ram',name:'Hell Ram',pattern:'hellRam',life:2.2,signature:'Twin crescent horns sweep in opposite directions, dragging an ember wake.'}
    ]},
    {map:3,name:'Phreeoni',shape:'bug',tier:1,colors:['#ffcf5c','#c98a2e','#fff6d8','#8a5a20'],skills:[
      {id:'ph_maw',name:'Sand Maw',pattern:'sandMaw',life:2.65,signature:'A quicksand vortex opens, pulls the field inward and snaps shut in a gold dust burst.'},
      {id:'ph_fang',name:'Desert Fang',pattern:'desertFang',life:2.25,signature:'Three tapered fangs rake across the sand in sequence with rising dust devils.'}
    ]},
    {map:4,name:'Eddga',shape:'cat',tier:1,colors:['#ff8a3d','#ff3d2e','#ffe6c8','#8f2a1a'],skills:[
      {id:'ed_rampage',name:'Tiger Rampage',pattern:'tigerRampage',life:2.4,signature:'Three four-claw rakes tear across the field inside expanding roar rings.'},
      {id:'ed_quake',name:'Rampart Quake',pattern:'rampartQuake',life:2.3,signature:'A paw slams the ground: radiating cracks, rock spikes and a dust ring.'}
    ]},
    {map:5,name:'Kraken',shape:'blob',tier:2,colors:['#3fd8d0','#2a6ad8','#eaffff','#0d3f5a'],skills:[
      {id:'kk_tide',name:'Tidal Maw',pattern:'tidalMaw',life:2.2,choreo:2.8,signature:'Three cresting waves sweep the map while a whirlpool drags foam into the boss.'},
      {id:'kk_tentacle',name:'Abyss Tentacles',pattern:'abyssTentacles',life:2.2,choreo:2.7,signature:'Six sucker-lined tentacles erupt from the ground and hammer the centre.'}
    ]},
    {map:6,name:'Dragon Lord',shape:'demon',tier:2,colors:['#ff5a2a','#ffd166','#fff6df','#8a1a10'],skills:[
      {id:'dl_ascend',name:'Dragon Ascension',pattern:'dragonAscension',life:2.2,choreo:3.0,signature:'A flame dragon spirals up around the boss, then dives across the field burning a trench.'},
      {id:'dl_skyfall',name:'Skyfall Pillar',pattern:'skyfallPillar',life:2.2,choreo:2.7,signature:'Five fire pillars rise in sequence beneath a crown of falling meteors.'}
    ]},
    {map:7,name:'Shiranui',shape:'demon',tier:2,colors:['#ff7ad0','#7ae6ff','#fff2ff','#7a2a6a'],skills:[
      {id:'sn_foxfire',name:'Foxfire Bloom',pattern:'foxfireBloom',life:2.2,choreo:2.75,signature:'Nine kitsune tails and pale spirit flames bloom in a ring of drifting petals.'},
      {id:'sn_sakura',name:'Sakura Storm',pattern:'sakuraStorm',life:2.2,choreo:2.8,signature:'A petal cyclone crosses the map and is cut open by a pink crescent.'}
    ]},
    {map:8,name:'Lord of Death',shape:'demon',tier:2,colors:['#8dffb0','#7a5aff','#eafff0','#1f3a2a'],skills:[
      {id:'lod_harvest',name:'Soul Harvest',pattern:'soulHarvest',life:2.2,choreo:2.85,signature:'Three spectral scythes reap across the field while harvested souls rise.'},
      {id:'lod_verdict',name:'Death Verdict',pattern:'deathVerdict',life:2.2,choreo:2.8,signature:'A skull seal stamps the ground under a descending spectral judgment beam.'}
    ]},
    {map:9,name:'Dark Lord',shape:'demon',tier:3,colors:['#ff2e55','#a94dff','#ffe6ee','#3a0a1a'],skills:[
      {id:'abyss_cross',name:'Abyssal Cross',pattern:'abyssalCross',life:1.7,choreo:3.05,signature:'An enormous crimson X opens the field, splitting air and ground with glitch shards.'},
      {id:'abyss_requiem',name:'Chaos Requiem',pattern:'chaosRequiem',life:1.7,choreo:3.1,signature:'A void sphere collapses into three shockwaves and a ring of blood-red spikes.'}
    ]},
    {map:10,name:'Memory of Thanatos',shape:'demon',tier:3,colors:['#ffffff','#8fe6ff','#fff6d8','#c9a24a'],skills:[
      {id:'tnt_fracture',name:'Memory Fracture',pattern:'memoryFracture',life:1.7,choreo:3.05,signature:'One white slash shatters the air into falling glass panes and digital echoes.'},
      {id:'tnt_judge',name:'Thanatos Judgment',pattern:'thanatosJudgment',life:1.7,choreo:3.15,signature:'A celestial gate opens and drives a pillar of white light through a clock seal.'}
    ]},
    {map:11,name:'Ifrit',shape:'demon',tier:3,colors:['#ff7a1a','#ffd34d','#fffbe8','#5a1408'],skills:[
      {id:'ifr_eruption',name:'Primal Eruption',pattern:'primalEruption',life:1.7,choreo:3.1,signature:'A ring of lava geysers erupts beneath black smoke and glowing fissures.'},
      {id:'ifr_blaze',name:'Ifrit Blaze',pattern:'ifritBlaze',life:1.7,choreo:3.2,signature:'One colossal horizontal fire slash spans the entire map and leaves a burning trench.'}
    ]}
  ];
  // Reference camera: 3.05 world units project to 120 screen px, so one design unit is 1px there.
  // The tier size is what turns "a tidy local burst" into "a slash across the whole map":
  // tier 1 covers roughly the boss's own ground, tier 3 spans the field.
  //
  // Screen time: a tier-3 slash/glitch band is wider than the viewport and used to stay at full
  // brightness for over three seconds, hiding the hero and the drops. `fadeAt` is the fraction of
  // the cast that stays at full brightness; after it the whole layer dims to nothing, instead of
  // only fading in its last 10-15%. Tier 1 stays as authored (fadeAt 1 = no early fade).
  const TIER={
    1:{size:.92,detail:1,shake:.3,name:'simple',fadeAt:1},
    2:{size:1.42,detail:1,shake:.75,name:'layered',fadeAt:.5},
    3:{size:2.02,detail:1,shake:1.2,name:'cataclysm',fadeAt:.34}
  };
  const SKILLS=new Map();
  for(const b of BOSSES)for(const s of b.skills)SKILLS.set(s.id,{...s,choreo:s.choreo||s.life,
    map:b.map,boss:b.name,tier:b.tier,colors:b.colors,fadeAt:TIER[b.tier].fadeAt,
    tierScale:TIER[b.tier].size,tierShake:TIER[b.tier].shake});

  // Glow sprites are cached per colour: one drawImage instead of a fresh radial gradient each frame.
  const glowCache=new Map();
  function glowSprite(hex,core){
    const key=hex+'|'+core;
    if(glowCache.has(key))return glowCache.get(key);
    let cv=null;
    if(typeof document!=='undefined'&&document.createElement){
      // 192px with a tight falloff: a light source with a readable centre, not a milky haze.
      cv=document.createElement('canvas');cv.width=cv.height=192;
      const x=cv.getContext('2d');
      if(x){
        const r=x.createRadialGradient(96,96,0,96,96,96);
        r.addColorStop(0,rgba(core,1));r.addColorStop(.07,rgba(hex,.96));
        r.addColorStop(.18,rgba(hex,.52));r.addColorStop(.42,rgba(hex,.14));
        r.addColorStop(.72,rgba(hex,.03));r.addColorStop(1,rgba(hex,0));
        x.fillStyle=r;x.fillRect(0,0,192,192);
      }
    }
    glowCache.set(key,cv);return cv;
  }
  const lifeOf=id=>SKILLS.get(id)?.life||0;
  return {
    BOSSES,SKILLS,TIER,
    has:id=>SKILLS.has(id),
    spec:id=>SKILLS.get(id)||null,
    bossOfMap:map=>BOSSES[map]||null,
    skillsOfMap:map=>(BOSSES[map]?.skills||[]).map(s=>s.id),
    life:id=>lifeOf(id),
    shake:id=>SKILLS.get(id)?.tierShake||0,
    // 3.2-4.6s between casts: a boss skill you notice but never stand under every swing.
    gap:()=>3.2+Math.random()*1.4,
    create(canvas){
      const g=canvas&&canvas.getContext?canvas.getContext('2d'):null;
      if(!g)return null;
      let quality=1,detail=1;
      // Device pixels per design unit, set by draw(). Stroke widths are clamped to at least one
      // device pixel so a thin outline stays a crisp line instead of a translucent smear when the
      // camera is far out or the screen is dense.
      let pxPerUnit=1;
      const minW=w=>Math.max(w,1.15/Math.max(.06,pxPerUnit));

      // ---- primitives -------------------------------------------------------------------
      function glow(x,y,r,hex,a=1,ry=1,core='#ffffff'){
        if(a<=.004||r<=0)return;
        if(quality<.5&&r<8)return;
        const tex=glowSprite(hex,core);
        g.save();g.globalCompositeOperation='lighter';g.globalAlpha*=cl(a);
        g.translate(x,y);g.scale(1,Math.max(.05,ry));
        if(tex)g.drawImage(tex,-r,-r,r*2,r*2);
        else{const q=g.createRadialGradient(0,0,0,0,0,r);q.addColorStop(0,rgba(hex,1));q.addColorStop(1,rgba(hex,0));g.fillStyle=q;g.fillRect(-r,-r,r*2,r*2)}
        g.restore();
      }
      function poly(pts,fill,a=1,stroke=null,w=1.5){
        if(a<=0||pts.length<3)return;
        g.save();g.globalAlpha*=cl(a);
        g.fillStyle=fill;
        g.beginPath();pts.forEach((p,i)=>i?g.lineTo(p[0],p[1]):g.moveTo(p[0],p[1]));g.closePath();g.fill();
        if(stroke){g.strokeStyle=stroke;g.lineWidth=w;g.lineJoin='round';g.stroke()}
        g.restore();
      }
      function stroke(pts,color,w,a=1,blend='lighter',cap='round'){
        if(a<=0||pts.length<2)return;
        g.save();g.globalCompositeOperation=blend;g.globalAlpha*=cl(a);
        g.strokeStyle=color;g.lineWidth=minW(w);g.lineCap=cap;g.lineJoin='round';
        g.beginPath();pts.forEach((p,i)=>i?g.lineTo(p[0],p[1]):g.moveTo(p[0],p[1]));g.stroke();g.restore();
      }
      function line(a,b,color,w,alpha=1){stroke([a,b],color,w,alpha)}
      // A grounded contact patch: a radial gradient that fades to nothing before its rim, so it can
      // never draw the hard elliptical edge a flat fill leaves on the ground. Every pattern used to
      // open with a flat `disc`, which read as a grey plate with a visible bottom line.
      function pool(rx,hex,a=.3,ry=.26,cy=0,cx=0){
        if(a<=.004||rx<=0)return;
        const safe=cl(a,0,1)*.82;
        g.save();
        const grad=g.createRadialGradient(cx,cy,Math.max(1,rx*.05),cx,cy,Math.max(2,rx));
        grad.addColorStop(0,rgba(hex,safe));
        grad.addColorStop(.3,rgba(hex,safe*.62));
        grad.addColorStop(.55,rgba(hex,safe*.3));
        grad.addColorStop(.74,rgba(hex,safe*.11));
        grad.addColorStop(.88,rgba(hex,safe*.03));
        grad.addColorStop(1,rgba(hex,0));
        g.fillStyle=grad;g.beginPath();g.ellipse(cx,cy,Math.max(.1,rx),Math.max(.1,rx*ry),0,0,TAU);g.fill();
        g.restore();
      }
      // A dark contour plus a one-pixel hot edge: what makes a shape read as a shape at game scale.
      function contour(pts,hex,w=2,a=.6){
        if(a<=0||pts.length<2)return;
        stroke(pts,rgba(darken(hex,.86),a),Math.max(.9,w),a,'source-over','butt');
      }
      function hotEdge(pts,w=1,a=.9,hex='#ffffff'){
        if(a<=0||pts.length<2)return;
        stroke(pts,rgba(hex,a),Math.max(.55,w),a,'lighter','butt');
      }
      // A tapered flat ribbon: the workhorse for slashes, waves, tails and dragon bodies.
      function ribbon(pts,w,fill,a=1){
        if(a<=0||pts.length<2)return;
        const width=typeof w==='function'?w:()=>w;
        g.save();g.globalAlpha*=cl(a);g.fillStyle=fill;
        const left=[],right=[];
        for(let i=0;i<pts.length;i++){
          const p=pts[i],prev=pts[Math.max(0,i-1)],next=pts[Math.min(pts.length-1,i+1)];
          const dx=next[0]-prev[0],dy=next[1]-prev[1],len=Math.hypot(dx,dy)||1,q=i/(pts.length-1),ww=width(q);
          left.push([p[0]-dy/len*ww,p[1]+dx/len*ww]);right.push([p[0]+dy/len*ww,p[1]-dx/len*ww]);
        }
        g.beginPath();left.forEach((p,i)=>i?g.lineTo(p[0],p[1]):g.moveTo(p[0],p[1]));
        for(let i=right.length-1;i>=0;i--)g.lineTo(right[i][0],right[i][1]);
        g.closePath();g.fill();g.restore();
      }
      // Broad coloured body + narrow white-hot core, both tapered.
      // `w` is either a half-width in design units or a callback of the path parameter, so a
      // slash can taper along its own curve. Both forms are normalised here.
      // A slash is built to stay legible: a dark contour, one saturated body, a narrow core and a
      // crisp hot line down the middle. The old version stacked two wide translucent ribbons, which
      // read as a pink smear on bright grass.
      function blade(pts,w,hex,a=1,core='#ffffff'){
        if(a<=0||pts.length<2)return;
        const half=typeof w==='function'?q=>cl(w(q),0,1e4):()=>w;
        const taper=(q,p)=>half(q)*Math.pow(Math.sin(Math.PI*cl(q)),p);
        // Thin contour for separation, then one saturated body, a bright inner band and a hot core
        // line. Saturation and contrast - not a wide black outline - are what make it read as a cut.
        contour(pts,hex,Math.max(1.2,taper(.45,.6)*.42),a*.5);
        ribbon(pts,q=>taper(q,.55)*1.9,rgba(hex,a*.11));
        ribbon(pts,q=>taper(q,.55),rgba(hex,a*.97));
        // The light bands are capped in absolute width: on a 2x tier-3 greatcut an uncapped core
        // became a 26px white stripe, which is what made those slashes look like flat strips.
        ribbon(pts,q=>Math.min(taper(q,.66)*.5,6.5),rgba(lighten(hex,.42),a*.92));
        ribbon(pts,q=>Math.min(taper(q,.7)*.2,2.6),rgba(core,a));
        hotEdge(pts,Math.max(.8,Math.min(taper(.5,.62)*.26,2)),a*.95,core);
      }
      // A volumetric ribbon: contour, saturated body, offset specular and a fine core. Used where a
      // wave or a tentacle has to read as an object rather than a flat colour band.
      function body(pts,w,hex,a=1,core='#ffffff'){
        if(a<=0||pts.length<2)return;
        const width=typeof w==='function'?w:(()=>w);
        contour(pts,hex,Math.max(1.2,width(.5)*.22),a*.55);
        ribbon(pts,width,rgba(hex,a*.95));
        ribbon(pts,q=>width(q)*.5,rgba(lighten(hex,.28),a*.55));
        ribbon(pts,q=>width(q)*.16,rgba(lighten(hex,.62),a*.45));
        hotEdge(pts,Math.max(.7,width(.5)*.12),a*.6,core);
      }
      function ring(x,y,r,color,a=1,w=2,rot=0,start=0,end=TAU,ry=.27){
        if(a<=0||r<=0)return;
        // An argument shifted by one used to leave strokeStyle as a number, which the canvas
        // silently ignores - the ring then inherits whatever colour was set last (usually black).
        const col=typeof color==='string'?color:rgba('#ffffff',a*.5);
        g.save();g.globalAlpha*=cl(a);g.strokeStyle=col;g.lineWidth=minW(w);
        g.beginPath();g.ellipse(x,y,Math.max(.1,r),Math.max(.1,r*ry),rot,start,end);g.stroke();g.restore();
      }
      function disc(x,y,rx,ry,color,a=1){
        if(a<=0)return;
        g.save();g.globalAlpha*=cl(a);g.fillStyle=color;g.beginPath();g.ellipse(x,y,Math.max(.1,rx),Math.max(.1,ry),0,0,TAU);g.fill();g.restore();
      }
      function shock(x,y,p,hex,a=1,size=220){
        if(p<=0||p>=1)return;
        const r=lerp(14,size,out(p)),f=(1-p)*a;
        ring(x,y,r,rgba(hex,f),f*.85,3.4*(1-p)+.7);
        ring(x,y,r*.8,rgba(hex,f*.5),f*.4,1);
        if(quality>=.6)ring(x,y,r*1.12,rgba(hex,f*.22),f*.24,9);
      }
      function sparks(x,y,t,seed,hex,a=1,count=18,power=1,gravity=1){
        if(a<=0)return;
        const n=Math.ceil(count*(quality<.6?.45:1));
        for(let i=0;i<n;i++){
          const born=hash(seed+i)*.12,age=t-born;if(age<0)continue;
          const lif=.24+hash(seed+i*3)*.42;if(age>lif)continue;
          const ang=hash(seed+i*7)*TAU,v=(60+hash(seed+i*11)*260)*power;
          const px=x+Math.cos(ang)*v*age,py=y+Math.sin(ang)*v*.62*age+120*gravity*age*age;
          const f=Math.pow(1-age/lif,1.4)*a;
          line([px-Math.cos(ang)*v*.02,py-Math.sin(ang)*v*.02],[px,py],rgba(hex,f*.9),.8+f*1.4,f*.8);
          if(f>.3)glow(px,py,2.6+f*2.4,hex,f*.5,1);
        }
      }
      function cracks(x,y,t,seed,hex,a=1,count=7,len=240,spread=TAU){
        if(a<=0)return;
        for(let i=0;i<count;i++){
          const base=seed+i*17,ang=hash(base)*spread+(spread===TAU?0:-spread/2);
          const grow=out(cl((t-hash(base+2)*.08)/.34));
          if(grow<=0)continue;
          const pts=[[x,y]],seg=4+Math.floor(hash(base+4)*3),max=len*(.55+hash(base+6)*.7)*grow;
          for(let j=1;j<=seg;j++){
            const q=j/seg,off=(hash(base+j*5)-.5)*max*.24;
            pts.push([x+Math.cos(ang)*max*q+Math.cos(ang+Math.PI/2)*off,y+Math.sin(ang)*max*q*.34+Math.sin(ang+Math.PI/2)*off*.34]);
          }
          // Drawn segment by segment so each crack tapers to a hairline at its tip. A constant-width
          // web of bright lines reads as scribble, not as broken ground.
          for(let j=0;j<pts.length-1;j++){
            const w0=1-cl(j/(pts.length-1))*.72;
            line(pts[j],pts[j+1],rgba(darken(hex,.55),a*.75),3.2*grow*w0,.9);
            line(pts[j],pts[j+1],rgba(hex,a*.85),1.5*grow*w0,.9);
            if(j<2)line(pts[j],pts[j+1],rgba('#ffffff',a*.4),.55*grow*w0,.9);
          }
        }
      }
      // Digital tear: horizontal bars offset in RGB, used by the tier-3 fracture moves.
      function glitch(x,y,w,h,t,seed,hex,a=1){
        if(a<=0||quality<.4)return;
        const bars=Math.ceil((quality<.7?4:8));
        for(let i=0;i<bars;i++){
          const k=seed+i*13+Math.floor(t*12),yy=y+(hash(k)-.5)*h,ww=w*(.12+hash(k+3)*.4),xx=x+(hash(k+5)-.5)*w*.7;
          const off=(hash(k+7)-.5)*10;
          g.save();g.globalAlpha*=cl(a*(.18+hash(k+9)*.5));
          g.fillStyle=rgba(hex,.75);g.fillRect(xx,yy,ww,1.5+hash(k+11)*2.5);
          g.fillStyle=rgba('#7af0ff',.45);g.fillRect(xx+off,yy+1.5,ww*.6,1.2);
          g.fillStyle=rgba('#ff5a8a',.35);g.fillRect(xx-off,yy+2.5,ww*.5,1.1);
          g.restore();
        }
      }
      function glassPane(cx,cy,w,h,rot,fill,edge,a=1){
        if(a<=0)return;
        const pts=[[-w/2,-h/2],[w/2,-h/2],[w/2,h/2],[-w/2,h/2]].map(([px,py])=>[cx+px*Math.cos(rot)-py*Math.sin(rot),cy+px*Math.sin(rot)+py*Math.cos(rot)]);
        poly(pts,fill,a*.5,edge,a*.8);
        const edgeColor=String(edge).startsWith('rgba')||String(edge).startsWith('rgb')?edge:rgba(edge,a*.6);
        stroke([pts[0],pts[2]],edgeColor,1,a*.5);
        stroke([pts[1],pts[3]],edgeColor,1,a*.35);
      }
      function shards(x,y,t,seed,hex,accent,a=1,count=16,power=1){
        for(let i=0;i<Math.ceil(count*(quality<.6?.5:1));i++){
          const born=.1+hash(seed+i)*.18,age=t-born;if(age<0)continue;
          const lif=1.2+hash(seed+i*9)*.8;if(age>lif)continue;
          const ang=hash(seed+i*3)*TAU,v=(110+hash(seed+i*5)*260)*power;
          const px=x+Math.cos(ang)*v*age,py=y+Math.sin(ang)*v*.55*age+210*age*age;
          const f=Math.pow(1-age/lif,1.2)*a;
          glassPane(px,py,7+hash(seed+i*7)*16,5+hash(seed+i*11)*20,age*(hash(seed+i)-.5)*9,rgba(hex,f*.55),rgba(i%3?accent:hex,f),f);
        }
      }
      // Perspective rune: flat concentric mechanics on the ground, with optional star polygon.
      function rune(x,y,r,t,hex,a=1,sides=6,spin=1,star=true){
        if(a<=0)return;
        pool(r*1.02,darken(hex,.8),a*.3,.27,y,x);
        ring(x,y,r,rgba(hex,a*.55),a*.8,2);
        ring(x,y,r*.76,rgba(hex,a*.4),a*.5,1,0,0,TAU,.27);
        const pts=[];
        for(let i=0;i<=sides;i++){const an=i*TAU/sides+t*.7*spin;pts.push([x+Math.cos(an)*r*.92,y+Math.sin(an)*r*.92*.27])}
        stroke(pts,rgba(hex,a*.7),1.3,a*.8);
        if(star)for(let i=0;i<sides;i++){
          const a1=i*TAU/sides+t*.7*spin,a2=a1+TAU*(sides>5?2.4:1.5);
          line([x+Math.cos(a1)*r*.9,y+Math.sin(a1)*r*.9*.27],[x+Math.cos(a2)*r*.9,y+Math.sin(a2)*r*.9*.27],rgba(hex,a*.42),1,a*.6);
        }
        for(let i=0;i<sides;i++){
          const an=i*TAU/sides-t*.9*spin,px=x+Math.cos(an)*r,py=y+Math.sin(an)*r*.27;
          poly([[px,py-4],[px+3,py],[px,py+4],[px-3,py]],rgba(hex,a*.65),1);
        }
      }
      function beam(x0,y0,x1,y1,w,hex,a=1){
        if(a<=0)return;
        line([x0,y0],[x1,y1],rgba(hex,a*.2),w*3.4,a*.8);
        line([x0,y0],[x1,y1],rgba(hex,a*.55),w,a*.9);
        line([x0,y0],[x1,y1],rgba('#ffffff',a*.9),Math.max(.6,w*.22),a*.95);
      }
      function pillar(x,y,h,w,hex,a=1){
        if(a<=0||h<=0)return;
        const grad=g.createLinearGradient(0,y,0,y-h);
        grad.addColorStop(0,rgba(hex,a*.85));grad.addColorStop(.45,rgba(hex,a*.5));grad.addColorStop(1,rgba(hex,0));
        const pts=[[x-w,y],[x-w*.35,y-h],[x+w*.35,y-h],[x+w,y]];
        poly(pts,grad,a);
        contour([[x-w,y],[x-w*.35,y-h],[x+w*.35,y-h],[x+w,y]],hex,Math.max(1.1,w*.12),a*.5);
        hotEdge([[x-w*.35,y-h],[x+w*.35,y-h]],Math.max(.9,w*.2),a*.8);
        line([x,y],[x,y-h],rgba('#ffffff',a*.7),Math.max(.8,w*.18),a*.95);
        glow(x,y-h*.55,w*2.2,hex,a*.32,2.1);
      }
      function flame(x,y,size,hex,accent,a=1,t=0){
        if(a<=0)return;
        // A tapered three-tongue flame; drawn additively so it reads as light, not paint.
        for(const [sx,sw,hh,al] of [[-.34,.5,.72,.55],[0,.72,1,.85],[.34,.45,.62,.5]]){
          const pts=[[x+sx*size,y],[x+sx*size-sw*size*.6,y-size*hh*.45],[x+sx*size+Math.sin(t*7+sx*4)*size*.16,y-size*hh],[x+sx*size+sw*size*.6,y-size*hh*.45]];
          poly(pts,rgba(hex,a*al*.75),1,accent,a*al*.4);
        }
        glow(x,y-size*.55,size*1.1,hex,a*.4,1.35);
        glow(x,y-size*.4,size*.42,accent,a*.5,1.2);
      }
      function petal(x,y,size,rot,hex,a=1,edge=null){
        if(a<=0)return;
        g.save();g.translate(x,y);g.rotate(rot);g.globalAlpha*=cl(a);
        const shape=()=>{g.beginPath();g.moveTo(0,0);g.bezierCurveTo(size*.75,-size*.55,size*.9,size*.2,0,size*.85);g.bezierCurveTo(-size*.55,size*.25,-size*.5,-size*.4,0,0);g.closePath()};
        if(edge){g.strokeStyle=rgba(edge,cl(a*.95));g.lineWidth=Math.min(size*.3,minW(size*.26));shape();g.stroke()}
        g.fillStyle=rgba(hex,a);shape();g.fill();
        // A short bright crease down the petal: reads as a petal, not a dot, at game scale.
        g.globalCompositeOperation='lighter';g.strokeStyle=rgba('#ffffff',a*.5);
        g.lineWidth=Math.min(size*.16,minW(size*.1));
        g.beginPath();g.moveTo(0,size*.06);g.quadraticCurveTo(size*.1,size*.34,size*.02,size*.7);g.stroke();
        g.restore();
      }
      function arrow(x,y,ang,size,hex,a=1){
        if(a<=0)return;
        g.save();g.translate(x,y);g.rotate(ang);g.globalAlpha*=cl(a);
        poly([[size,0],[size*.1,-size*.28],[-size*.9,0],[size*.1,size*.28]],rgba(hex,a*.8),1,'#ffffff',1);
        g.restore();
      }
      function sparkle(x,y,r,hex,a=1,rot=0){
        if(a<=0)return;
        const pts=[];
        for(let i=0;i<8;i++){const an=rot+i*TAU/8,rr=i%2?r*.24:r;pts.push([x+Math.cos(an)*rr,y+Math.sin(an)*rr])}
        poly(pts,rgba(hex,a*.85),1,'#ffffff',a*.35);
        glow(x,y,r*1.3,hex,a*.35,1);
      }

      // Every cast first deepens the air above the boss's own piece of ground. Bright RO fields
      // (Prontera green, Izlude surf) otherwise swallow additive light; this is a colour grade, not
      // an opaque card, so the terrain and the hero stay visible under it.
      function stageWash(s,t,a){
        const fade=Math.pow(1-cl(t/(s.life*.95)),.8)*a;
        if(fade<=.02)return;
        // Contact light only: a small additive glow under the boss. Nothing tints or darkens the
        // field itself, so the terrain keeps its own colour and the effect keeps its definition.
        glow(0,-4,120+s.tierScale*54,s.colors[0],.1*fade,1,.06);
      }
      // Luminous shapes get a dark outer rim so they keep their silhouette on pale terrain.
      function rim(pts,hex,a=.5,w=3){
        if(a<=0)return;stroke(pts,rgba(darken(hex,.72),a),w,a*.9,'source-over');
      }

      // ---- patterns ----------------------------------------------------------------------
      const P={};

      // Prontera · Mastering
      P.jellyBarrage=(s,t)=>{
        const [c1,c2,core]=s.colors,q=t/s.life,a=1-cl((q-.86)/.14);
        pool(250,'#2a4a1a',.34*a);
        glow(0,-90,130,c1,.2*a,1.1);
        const n=9;
        for(let i=0;i<n;i++){
          const born=.05+hash(s.seed+i)*.5,age=t-born;if(age<0||age>1.1)continue;
          const side=i%2?1:-1,tx=side*(50+hash(s.seed+i*7)*200),ty=-10-hash(s.seed+i*3)*16;
          const fall=cl(age/.62),arc=Math.sin(fall*Math.PI);
          const x=lerp(side*76,tx,fall),y=lerp(-330,ty,fall)-arc*(80+hash(s.seed+i)*80);
          const bounce=age>.62?Math.abs(Math.sin((age-.62)*11))*(1-cl((age-.62)/.5))*46:0;
          const r=22+hash(s.seed+i*5)*18;
          // squash on impact, stretch mid-flight
          const st2=1+arc*.22;
          g.save();g.translate(x,y-bounce);g.rotate(fall*2+i);g.scale(st2,2-st2);
          const jshape=[[-r,0],[-r*.72,-r*.92],[0,-r*1.24],[r*.82,-r*.82],[r,0],[r*.62,r*.72],[0,r*.94],[-r*.72,r*.62]];
          const jgrad=g.createRadialGradient(-r*.28,-r*.52,r*.1,0,0,r*1.35);
          jgrad.addColorStop(0,rgba(lighten(c1,.5),.95));jgrad.addColorStop(.45,rgba(c1,.9));
          jgrad.addColorStop(1,rgba(darken(c1,.3),.92));
          poly(jshape,jgrad,1,rgba(darken(c1,.55),.9),2.4);
          poly([[-r*.34,0],[-r*.2,-r*.7],[r*.16,-r*.5],[r*.34,0],[r*.16,r*.5],[-r*.2,r*.34]],rgba(core,.5),1);
          poly([[-r*.5,-r*.5],[r*.05,-r*.78],[-r*.12,-r*.28]],rgba('#ffffff',.75),1);
          g.restore();
          glow(x,y-bounce,r*1.7,c1,.34,1);
          if(age>.62){const bp=(age-.62)/.5;shock(x,ty,bp,c2,a*.75,80);sparks(x,ty,age-.62,s.seed+i*31,c2,a*.8,8,.6)}
        }
        if(t<.5){const p=out(t/.5);ring(0,0,240*p,rgba(c1,a*.55),a*.7,2.4)}
        if(t>.55)sparks(0,-20,t-.55,s.seed+400,c2,a*.85,22,1);
      }
      P.kingsBounce=(s,t)=>{
        const [c1,c2,core,accent]=s.colors,a=1-cl((t/s.life-.88)/.12),p=out(cl(t/.42));
        const yBase=-20,yTop=-330,drop=t<.42?lerp(yTop,yBase,inQ(cl(t/.42))):yBase;
        pool(300,c1,.12*a);
        rune(0,0,190*(0.5+.5*p),t,c1,a*.6,8,1.2,true);
        // crown
        g.save();g.translate(0,drop);g.rotate(Math.sin(t*5)*.03);
        const w=112,h=64;
        const crown=[[-w,-h*.2],[-w*.72,-h],[-w*.3,-h*.45],[0,-h*1.15],[w*.3,-h*.45],[w*.72,-h],[w,-h*.2]];
        const cg=g.createLinearGradient(0,-h*1.15,0,h*.1);
        cg.addColorStop(0,rgba(lighten(c2,.45),a*.98));cg.addColorStop(.55,rgba(c2,a*.98));
        cg.addColorStop(1,rgba(darken(c2,.35),a*.98));
        poly(crown,cg,1,rgba(darken(c2,.55),a*.95),2);
        contour(crown,lighten(c2,.15),Math.max(1.6,w*.05),a*.9);
        hotEdge([[-w*.72,-h],[0,-h*1.15],[w*.72,-h]],Math.max(1.2,w*.03),a*.85,core);
        const band=[[-w,-h*.2],[w,-h*.2],[w*.86,h*.35],[-w*.86,h*.35]];
        const bg=g.createLinearGradient(0,-h*.2,0,h*.35);
        bg.addColorStop(0,rgba(lighten(c1,.25),a*.9));bg.addColorStop(1,rgba(darken(c1,.4),a*.95));
        poly(band,bg);contour(band,darken(c2,.3),Math.max(1.3,w*.04),a*.8);
        hotEdge([[-w,-h*.2],[w,-h*.2]],Math.max(1,w*.028),a*.7,core);
        for(const [gx,gy] of [[-.72,-.5],[0,-1.12],[.72,-.5]])sparkle(gx*w,gy*h,13,accent,a*.9,t);
        glow(0,-h*.2,w*1.9,accent,a*.35,1);
        g.restore();
        if(t>.4){
          const bt=t-.4;
          shock(0,0,cl(bt/.55),c2,a*.9,340);
          for(let i=0;i<3;i++){const start=i*.11,bq=cl((bt-start)/.55);if(bq<=0||bq>=1)continue;
            const rr=lerp(30,300,bq),yy=-10-Math.sin(bq*Math.PI)*90;
            for(const side of [-1,1])glow(side*rr,yy,26*Math.sin(bq*Math.PI)+8,c1,a*(1-bq)*.8,1);
          }
          sparks(0,-30,bt,s.seed+7,accent,a*.9,26,1.1);
        }
      };

      // Izlude · Drake
      P.anchorTyphoon=(s,t)=>{
        const [c1,c2,core,deep]=s.colors,a=1-cl((t/s.life-.85)/.15),slam=cl((t-.55)/.28);
        pool(330,deep,.3*a);
        rune(0,0,240,t,c1,a*.35,8,1.3,false);
        for(let i=0;i<3;i++){
          const an=t*2.4+i*TAU/3,rr=120+i*34;
          ring(0,-14,rr,rgba(c1,a*.5),a*.6,2.4+t%1,an,an+2.4,.3);
          glow(Math.cos(an)*rr,-14+Math.sin(an)*rr*.3,24,c2,a*.55,1);
          for(let j=0;j<6;j++){const q=an+j*.4;glow(Math.cos(q)*rr,-14+Math.sin(q)*rr*.3,4,c1,a*.35,1)}
        }
        const spin=t*4.2,lift=-74-Math.sin(cl(t/.55)*Math.PI)*118;
        // spectral anchor: shaft, stock, crown and two curved flukes
        g.save();g.translate(0,lift);g.rotate(spin);
        stroke([[0,-92],[0,96]],rgba(deep,a*.75),13,a*.8,'source-over');
        stroke([[0,-92],[0,96]],rgba(c2,a*.9),7,a*.9);
        stroke([[0,-92],[0,96]],rgba(core,a*.55),2,a*.8);
        line([-42,-66],[42,-66],rgba(c2,a*.85),5,a*.9);
        ring(0,-104,24,rgba(c1,a*.5),a*.8,3,0,0,TAU,.84);
        ring(0,-104,10,rgba(core,a*.7),a*.9,2,0,0,TAU,.84);
        for(const side of [-1,1]){
          const pts=[];for(let i=0;i<=18;i++){const q=i/18,an=lerp(-.25,Math.PI*.92,q);pts.push([side*Math.cos(an)*84,q*52+22+Math.sin(an)*26])}
          stroke(pts,rgba(deep,a*.7),9,a*.8,'source-over');
          stroke(pts,rgba(c2,a*.9),5,a*.9);
          stroke(pts,rgba(core,a*.5),1.6,a*.75);
          poly([[side*84,66],[side*101,44],[side*72,42]],rgba(deep,a*.6),1,rgba(core,a*.75),1.4);
        }
        glow(0,-10,54,c1,a*.22,1.6);
        g.restore();
        if(slam>0&&slam<1){
          if(t>.55&&t<.66)glow(0,10,130,'#ffffff',a*.6,1.3);
          shock(0,0,slam,c2,a*.95,360);
          ring(0,0,250*slam,rgba(core,a*.5),a*.55,2.4,0,0,TAU,.26);
          // foam crown: bright droplets thrown up along the impact ring
          for(let i=0;i<Math.ceil(16*quality);i++){
            const an=i*TAU/16+.2,rr=lerp(20,215,slam);
            glow(Math.cos(an)*rr,Math.sin(an)*rr*.26-Math.sin(slam*Math.PI)*46,6+Math.sin(slam*Math.PI)*7,core,a*(1-slam*.5)*.7,1);
          }
          sparks(0,4,slam,s.seed+21,c2,a*.85,26,1.1);
        }
        if(t>.62)for(let i=0;i<8;i++){const an=i*TAU/8+t,x=Math.cos(an)*235*slam,y=Math.sin(an)*68*slam;glow(x,y,10,c1,a*.4,1)}
      }
      P.cutlassCross=(s,t)=>{
        const [c1,c2,core,deep]=s.colors,a=1-cl((t/s.life-.84)/.16);
        const p1=out(cl(t/.3)),p2=out(cl((t-.14)/.3));
        pool(340,deep,.14*a);
        // Two diagonal cuts that genuinely cross at the boss, so the move reads as an X, not two
        // stacked arcs. Each one bows away from the other, which is what sells it as a slash.
        const sweep=(flip,p)=>{
          const pts=[];for(let i=0;i<=26;i++){const q=i/26*Math.min(1,p*1.04),u=lerp(-1,1,q);
            pts.push([u*300,-6+flip*(u*74)+flip*Math.sin(Math.PI*cl(q))*30])}
          return pts;
        };
        blade(sweep(1,p1),18,c1,a*.97,core);
        blade(sweep(-1,p2),15,c2,a*.94,core);
        if(t>.28){
          const f=cl((t-.28)/.3);
          glow(0,20,90*(1-f)+20,c2,a*.5*(1-f),1);
          sparkle(0,20,60*(1-f*.5),core,a*(1-f),t*3);
          if(f>=1||f>.2)shock(0,0,cl((t-.32)/.6),c1,a*.7,300);
          sparks(0,16,t-.3,s.seed+33,c2,a*.85,26,1.1);
        }
        for(let i=0;i<Math.ceil(16*quality);i++){
          const born=.3+hash(s.seed+i)*.5,age=t-born;if(age<0||age>.9)continue;
          const ang=hash(s.seed+i*3)*TAU,rr2=age*240,q=age/.9;
          glow(Math.cos(ang)*rr2,-40+Math.sin(ang)*rr2*.5+age*age*130,3+hash(s.seed+i*5)*4,core,a*(1-q)*.75,1);
        }
      };

      // Geffen · Baphomet
      P.goatSigil=(s,t)=>{
        const [c1,c2,core,deep]=s.colors,a=1-cl((t/s.life-.85)/.15);
        const ign=out(cl(t/.34));
        pool(340,deep,.13*a);
        rune(0,0,204*ign,t,c1,a*.9,5,-1.1,true);
        ring(0,0,330*ign,rgba(c2,a*.35),a*.5,1.5,0,0,TAU,.26);
        // pentagram strokes draw themselves
        const pts=[];for(let i=0;i<5;i++){const an=-Math.PI/2+i*TAU/5;pts.push([Math.cos(an)*270*ign,Math.sin(an)*270*.26*ign])}
        const order=[0,2,4,1,3,0];
        for(let i=0;i<order.length-1;i++){
          const bp=cl((t-.1-i*.055)/.18);if(bp<=0)continue;
          const a1=pts[order[i]],a2=pts[order[i+1]];
          const seg=[a1,[lerp(a1[0],a2[0],bp),lerp(a1[1],a2[1],bp)]];
          contour(seg,c1,Math.max(2.4,5.2/Math.max(.06,pxPerUnit)),a*.6);
          line(seg[0],seg[1],rgba(c2,a),3.4,a*.95);
          hotEdge(seg,1.1,a*.8,core);
        }
        for(let i=0;i<5;i++){
          const bp=cl((t-.32-i*.07)/.22);if(bp<=0)continue;
          const an=-Math.PI/2+i*TAU/5,px=Math.cos(an)*270*ign,py=Math.sin(an)*270*.26*ign;
          flame(px,py,88*bp*out(bp+0.1),c2,c1,a*.95*(1-bp*.3),t+i);
          glow(px,py-30,34,c2,a*.4,1);
          shock(px,py,bp,c2,a*.45,90);
        }
        // horned crest above the seal
        if(t>.18){const hp=out(cl((t-.18)/.3));
          for(const side of [-1,1]){
            const pts2=[];for(let i=0;i<=10;i++){const q=i/10;pts2.push([side*(50+q*95*hp),-250-q*36+Math.sin(q*3)*18])}
            ribbon(pts2,q=>10*(1-q*.72)*hp,rgba(c1,a*.32));
            stroke(pts2,rgba(core,a*.55),1.4,a*.7);
          }
          glow(0,-250,90,c2,a*.3,1.1);
        }
        if(t>.5)sparks(0,-120,t-.5,s.seed+55,c2,a*.75,22,.9);
        if(t>.75)soot(0,-40,t-.75,a*.6,c1);
      };
      P.hellRam=(s,t)=>{
        const [c1,c2,core,deep]=s.colors,a=1-cl((t/s.life-.85)/.15);
        pool(270,deep,.34*a);
        rune(0,0,200,t,c2,a*.28,5,-1.4,true);
        const cres=(dir,p,off)=>{
          const pts=[];for(let i=0;i<=22;i++){const q=i/22*cl(p*1.06);const an=lerp(.1,Math.PI*.95,q);
            pts.push([dir*(50+Math.cos(an)*208),off+Math.sin(an)*112-q*26])}
          return pts;
        };
        const p1=out(cl(t/.28)),p2=out(cl((t-.13)/.28));
        if(p1>0){ribbon(cres(1,p1,-172),q=>Math.sin(Math.PI*q)*44,rgba(c2,a*.18));blade(cres(1,p1,-172),20,c2,a*.95,core)}
        if(p2>0){ribbon(cres(-1,p2,-116),q=>Math.sin(Math.PI*q)*38,rgba(c1,a*.16));blade(cres(-1,p2,-116),17,c1,a*.95,core)}
        if(t>.2)sparks(0,-120,t-.2,s.seed+11,c2,a*.8,18,.9);
        if(t>.26&&t<.6){const f=cl((t-.26)/.34);glow(0,-150,120*(1-f),c2,a*.5*(1-f),1)}
        shock(0,0,cl((t-.3)/.6),c2,a*.6,250);
        for(let i=0;i<Math.ceil(10*quality);i++){
          const born=.3+hash(s.seed+i)*.5,age=t-born;if(age<0||age>.9)continue;
          const x=(hash(s.seed+i*5)-.5)*440,y=-130*age-90+age*age*170;
          glow(x,y,3+hash(s.seed+i*3)*5,c2,a*(1-age/.9)*.75,1);
        }
      }
      P.sandMaw=(s,t)=>{
        const [c1,c2,core,deep]=s.colors,a=1-cl((t/s.life-.84)/.16);
        const open=out(cl(t/.5)),shut=cl((t-1.55)/.36),r=196*open*(1-shut*.92);
        pool(258,deep,.42*a);
        for(let i=0;i<4;i++){
          ring(0,0,r*(1-i*.16),rgba(c1,a*(.72-i*.1)),a*.88,3.2+i,t*(2.2+i*.5)*(i%2?-1:1),0,TAU,.28);
        }
        // sand pulled inward
        for(let i=0;i<Math.ceil(26*quality);i++){
          const ang=hash(s.seed+i)*TAU,dist=lerp(250,14,cl((t-hash(s.seed+i*3)*.5)/1.5)),size=3+hash(s.seed+i*7)*4;
          glow(Math.cos(ang)*dist,Math.sin(ang)*dist*.28,size+4,c2,a*.5,1);
          line([Math.cos(ang)*dist,Math.sin(ang)*dist*.28],[Math.cos(ang)*(dist+16),Math.sin(ang)*(dist+16)*.28],rgba(c1,a*.4),1.4);
        }
        // ring of sand teeth
        for(let i=0;i<12;i++){
          const ang=i*TAU/12+t*.3,px=Math.cos(ang)*r,py=Math.sin(ang)*r*.28;
          const hh=(64+hash(s.seed+i)*38)*open*(1-shut);
          const tooth=[[px-11,py],[px,py-hh],[px+11,py]];
          poly(tooth,rgba(c2,a*.9));contour(tooth,darken(c2,.45),Math.max(1.4,3/Math.max(.06,pxPerUnit)),a*.7);
          hotEdge([[px-3,py],[px,py-hh],[px+3,py]],1.1,a*.75,core);
        }
        if(shut>0&&shut<1){
          glow(0,0,180*shut,c2,a*.5,1);
          shock(0,0,shut,c2,a*.95,330);
          sparks(0,0,shut,s.seed+77,c1,a*.9,34,1.3);
        }
        if(t>.2)cracks(0,0,t-.2,s.seed+9,c1,a*.34,6,190);
      };
      P.desertFang=(s,t)=>{
        const [c1,c2,core,deep]=s.colors,a=1-cl((t/s.life-.85)/.15);
        pool(300,deep,.24*a);
        for(let i=0;i<3;i++){
          const start=.05+i*.16,p=out(cl((t-start)/.3));if(p<=0)continue;
          const baseX=-170+i*74,ang=-.55+i*.35;
          const tip=[baseX+Math.cos(ang)*350*p,-40+Math.sin(ang)*220*p];
          const pts=[];for(let j=0;j<=14;j++){const q=j/10;pts.push([lerp(baseX,tip[0],q)+Math.sin(q*5+i)*10,lerp(0,tip[1],q)+q*18])}
          blade(pts,q=>30*Math.sin(Math.PI*cl(q))*(1-cl(q)*.82)+3,i%2?c1:c2,a*.95,core);
          // serrated barb along each fang
          for(let j=3;j<11;j+=2){const pt=pts[j];poly([[pt[0],pt[1]],[pt[0]+9,pt[1]+7],[pt[0]+2,pt[1]+13]],rgba(core,a*.5),1,rgba(deep,a*.5))}
          glow(tip[0],tip[1],30*(1-p*.5),c2,a*(1-p*.6)*.75,1);
        }
        for(let i=0;i<3;i++){
          const an=t*3+i*2.1;
          for(let j=0;j<6;j++){
            const q=(j/6+t*.4)%1,rr=36+q*76;
            glow(Math.cos(an+q*3)*rr,-q*150,5+q*8,c1,a*(1-q)*.5,1);
          }
        }
        if(t>.4){const f=cl((t-.4)/.45),fx2=-40+Math.cos(t*2)*20;
          sparkle(fx2,-40,80*(1-f*.6),core,a*(1-f),t*2);
          shock(0,0,f,c2,a*.55,250);
          sparks(fx2,0,t-.4,s.seed+61,c2,a*.8,22,1);
        }
      }
      P.tigerRampage=(s,t)=>{
        const [c1,c2,core,deep]=s.colors,a=1-cl((t/s.life-.85)/.15);
        pool(300,deep,.34*a);
        for(let k=0;k<3;k++){
          const start=.06+k*.17,p=out(cl((t-start)/.34));if(p<=0)continue;
          const dir=k%2?-1:1,base=-120+k*44;
          for(let i=0;i<3;i++){
            const pts=[];for(let j=0;j<=16;j++){const q=j/16*cl(p*1.04);
              pts.push([dir*lerp(-300,282,q),base+i*24+Math.sin(q*2.2+k)*40-q*44])}
            blade(pts,q=>15*Math.sin(Math.PI*cl(q))*(1-cl(q)*.25)+1.8,i%2?c1:c2,a*(1-i*.1),core);
          }
          sparks(dir*220,base+40,t-start-.22,s.seed+k*19,c2,a*.75,16,.9);
          ring(0,0,lerp(90,300,p),rgba(c1,a*.28*(1-p*.5)),a*.4,2,0,0,TAU,.3);
        }
        if(t>.45){const f=cl((t-.45)/.5);glow(0,-60,140*(1-f),c1,a*.4*(1-f),1)}
      }
      P.rampartQuake=(s,t)=>{
        const [c1,c2,core,deep]=s.colors,a=1-cl((t/s.life-.84)/.16);
        pool(300,deep,.34*a);
        const stomp=cl((t-.2)/.2);
        if(t<.2){const p=t/.2;glow(0,-330+280*inQ(p),100,c1,a*.35,1);ring(0,0,90*p,rgba(c2,a*.4),a*.5,3)}
        if(stomp>0){
          cracks(0,0,t-.2,s.seed+5,c2,a*.95,10,330);
          shock(0,0,stomp,c1,a*.95,330);
          shock(0,0,cl(stomp*1.6),c2,a*.5,260);
          if(stomp<.5)glow(0,0,190*(1-stomp),core,a*.5,1);
          sparks(0,0,stomp,s.seed+41,c2,a*.9,34,1.2);
          for(let i=0;i<11;i++){
            const ang=i*TAU/11+.2,dist=130+hash(s.seed+i)*120,rp=out(cl((t-.28-hash(s.seed+i*3)*.14)/.3));
            if(rp<=0)continue;
            const hh=lerp(0,58+hash(s.seed+i*5)*54,rp)*(1-cl((t-1.8)/.5));
            const px=Math.cos(ang)*dist,py=Math.sin(ang)*dist*.28;
            const shard=[[px-21,py],[px-8,py-hh],[px+7,py-hh*.74],[px+23,py]];
            // Lit two-facet rock: a dark silhouette plus one bright face is what stops it reading
            // as a flat coloured triangle.
            poly(shard,rgba(darken(c2,.5),a*.96));
            poly([[px-8,py-hh],[px+7,py-hh*.74],[px+2,py]],rgba(c2,a*.8));
            poly([[px-8,py-hh],[px-1,py-hh*.3],[px-3,py]],rgba(lighten(c2,.28),a*.55));
            contour(shard,darken(c2,.62),Math.max(1.2,2.6/Math.max(.06,pxPerUnit)),a*.85);
            hotEdge([[px-8,py-hh],[px+7,py-hh*.74]],1.2,a*.85,core);
            glow(px,py-hh,22,c1,a*.26,1);
          }
          if(t>.5)for(let i=0;i<20;i++){const q=(t-.5)/.8,ang=hash(s.seed+i)*TAU,rr=lerp(70,270,q);
            glow(Math.cos(ang)*rr,Math.sin(ang)*rr*.28,4+hash(s.seed+i*3)*6,q<.6?c2:c1,a*(1-q)*.5,1)}
        }
      }
      P.tidalMaw=(s,t)=>{
        const [c1,c2,core,deep]=s.colors,a=1-cl((t/s.life-.86)/.14);
        pool(400,deep,.18*a);
        // whirlpool
        for(let i=0;i<4;i++)ring(0,0,90+i*54,rgba(c1,a*.35),a*.5,1.6+i*.4,t*(2+i*.4)*(i%2?-1:1),0,TAU,.27);
        for(let k=0;k<3;k++){
          const start=.08+k*.22,p=out(cl((t-start)/.45));if(p<=0)continue;
          const dir=k%2?-1:1;
          // A cresting arch, not a horizontal band: the wave has to lift and curl or it reads as a
          // flat stripe across the field.
          // Nested crests receding into the field - each one shorter and higher than the last, so
          // they read as a swell rather than three parallel lanes.
          const span=330-k*64,peak=96-k*22,base=-6-k*34;
          const pts=[];for(let j=0;j<=24;j++){const q=j/24*cl(p*1.05),bq=Math.pow(Math.sin(Math.PI*q),.8);
            pts.push([dir*lerp(-span,span+18,q),base-bq*peak-q*6+(q>.86?(q-.86)*70:0)])}
          body(pts,q=>Math.sin(Math.PI*q)*22*(1-q*.5)*(1-k*.12),c2,a*(1-k*.14),core);
          ribbon(pts,q=>Math.sin(Math.PI*q)*13*(1-q*.55),rgba(c1,a*.5*(1-k*.14)));
          // foam along the lip of the curl
          const lip=pts.slice(4,21).map(([x,y])=>[x,y-9]);
          ribbon(lip,q=>Math.sin(Math.PI*q)*7,rgba(core,a*.85));
          for(let j=0;j<10;j++){const pt=pts[Math.floor(j*pts.length/10)];glow(pt[0],pt[1]-8,9,c2,a*.5,1)}
        }
        if(t>.5){
          const q=cl((t-.5)/.5);
          ring(0,0,lerp(60,380,q),rgba(core,a*(1-q)*.5),a*(1-q)*.6,3,0,0,TAU,.26);
          for(let i=0;i<Math.ceil(14*quality);i++){const ang=hash(s.seed+i)*TAU,rr=lerp(40,300,q),x=Math.cos(ang)*rr,y=-Math.sin(q*Math.PI)*140+Math.sin(ang)*rr*.2;
            glow(x,y,3+hash(s.seed+i*3)*5,c1,a*(1-q)*.55,1)}
        }
      };
      P.abyssTentacles=(s,t)=>{
        const [c1,c2,core,deep]=s.colors,a=1-cl((t/s.life-.85)/.15);
        pool(420,deep,.24*a);
        for(let i=0;i<6;i++){
          const start=i*.07,rise=out(cl((t-start)/.4)),slam=cl((t-start-.55)/.2);
          if(rise<=0)continue;
          const ang=i*TAU/6+.35,baseR=170+hash(s.seed+i)*70;
          const bx=Math.cos(ang)*baseR,by=Math.sin(ang)*baseR*.28;
          const pts=[];
          for(let j=0;j<=18;j++){
            const q=j/18,hh=130*rise*(1-slam*.75);
            const sway=Math.sin(q*4+t*3+i)*(46*(1-q*.4));
            pts.push([lerp(bx,Math.cos(ang)*baseR*.22,q)+Math.cos(ang+Math.PI/2)*sway,by*lerp(1,.2,q)-hh*Math.sin(q*Math.PI*.92)]);
          }
          body(pts,q=>27*(1-q*.72)*Math.sin(Math.PI*cl(q*1.1))*.95,c2,a*.97,core);
          ribbon(pts,q=>7*(1-q*.75),rgba(lighten(c1,.28),a*.5));
          // suckers
          for(let j=2;j<16;j+=3){const pt=pts[j];glow(pt[0],pt[1],5,c1,a*.55,1);disc(pt[0],pt[1],2.4,2.4,rgba(deep,a*.5),a*.5)}
          if(slam>0&&slam<1){const tip=pts[pts.length-1];
            glow(tip[0],tip[1],34*(1-slam),c2,a*.5,1);
            shock(tip[0],0,slam,c1,a*.6,180);
            sparks(tip[0],0,slam,s.seed+i*13,c2,a*.7,10,.8);
          }
        }
        if(t>.55){const q=cl((t-.55)/.6);for(let i=0;i<Math.ceil(16*quality);i++){
          const ang=hash(s.seed+i*7)*TAU,rr=lerp(40,320,q);
          glow(Math.cos(ang)*rr,-q*120+Math.sin(ang)*rr*.2,3+hash(s.seed+i*3)*4,c1,a*(1-q)*.4,1)}}
      };

      // Louyang · Dragon Lord
      P.dragonAscension=(s,t)=>{
        const [c1,c2,core,deep]=s.colors,a=1-cl((t/s.life-.86)/.14);
        pool(340,deep,.5*a);
        const rise=out(cl(t/.85)),dive=cl((t-1.15)/.65);
        // Spiral body: two ribbons (body and belly) plus scale glints along its spine.
        const spine=[],inner=[];
        for(let j=0;j<=48;j++){
          const q=j/48,ang=q*TAU*1.5+t*.6,rr=lerp(96,150,q)*(1-dive*.6);
          const x=Math.cos(ang)*rr,y=6-q*250*rise+Math.sin(ang)*34;
          spine.push([x,y]);inner.push([x*Math.cos(.24)-y*Math.sin(.24),x*Math.sin(.24)+y*Math.cos(.24)]);
        }
        ribbon(spine,q=>Math.sin(Math.PI*q)*34*(1-q*.25),rgba(darken(c1,.6),a*.7));
        ribbon(spine,q=>Math.sin(Math.PI*q)*26*(1-q*.25),rgba(c1,a*.92));
        ribbon(inner,q=>Math.sin(Math.PI*q)*12*(1-q*.3),rgba(c2,a*.75));
        stroke(spine,rgba(core,a*.5),1.4,a*.7);
        for(let j=2;j<spine.length;j+=3){
          const pt=spine[j],n=spine[Math.min(j+1,spine.length-1)];
          const ang=Math.atan2(n[1]-pt[1],n[0]-pt[0]);
          poly([[pt[0]+Math.cos(ang+1.9)*11,pt[1]+Math.sin(ang+1.9)*11],[pt[0],pt[1]],[pt[0]+Math.cos(ang-1.9)*11,pt[1]+Math.sin(ang-1.9)*11]],rgba(core,a*.4),1);
          if(j%6===0)glow(pt[0],pt[1],9,c2,a*.45,1);
        }
        if(rise>.22){
          const head=spine[spine.length-1],hp=out(cl((rise-.22)/.5));
          g.save();g.translate(head[0],head[1]-6);g.rotate(-.5+Math.sin(t*3)*.12);g.scale(hp*1.15,hp*1.15);
          // skull, snout, jaw, eye, horns and a whisker
          poly([[0,-30],[38,-20],[58,2],[40,22],[6,30],[-22,12],[-16,-16]],rgba(darken(c1,.25),a*.9),1,rgba(c2,a*.95),2);
          poly([[58,2],[92,-6],[74,14],[52,12]],rgba(c2,a*.75),1,rgba(core,a*.7),1.4);
          poly([[-6,14],[34,16],[50,10],[30,26],[-4,26]],rgba(darken(c1,.5),a*.8),1,rgba(c2,a*.7),1.2);
          glow(30,-8,9,core,a*.95,1);glow(30,-8,3,'#ffffff',a,1);
          stroke([[14,-26],[34,-58],[62,-66]],rgba(c2,a*.85),3,a*.9);
          stroke([[-10,-22],[-30,-50],[-6,-58]],rgba(c2,a*.75),2.6,a*.85);
          stroke([[60,6],[96,18],[118,6]],rgba(c2,a*.55),1.6,a*.6);
          g.restore();
          glow(head[0],head[1],52,c1,a*.28,1);
        }
        if(dive>0){
          const path=[];for(let j=0;j<=30;j++){const q=j/30*cl(dive*1.03);
            path.push([lerp(50,400,q),lerp(-230,-20,q)+Math.sin(q*Math.PI)*80])}
          if(path.length>1){
            ribbon(path,q=>Math.sin(Math.PI*q)*34,rgba(c1,a*.3));
            blade(path,17,c2,a*.92,core);
          }
          sparks(400,-20,cl((dive-.85)/.15),s.seed+91,c2,a*.9,32,1.2);
          if(dive>.9){const f=cl((dive-.9)/.1);glow(400,-20,120*f,c2,a*.55*f,1);shock(400,0,f,c1,a*.6,160)}
          // burning trench the dive drags behind it
          for(let i=0;i<Math.ceil(18*quality);i++){const q=(i/18+dive*.2)%1;
            flame(lerp(50,400,q),4,26+hash(s.seed+i)*20,c1,c2,a*(1-q*.55)*(1-dive*.25)*.7,t+i)}
        }
        if(t>.3)sparks(0,-120,t-.3,s.seed+5,c2,a*.6,16,.7);
      }
      P.skyfallPillar=(s,t)=>{
        const [c1,c2,core,deep]=s.colors,a=1-cl((t/s.life-.85)/.15);
        pool(430,deep,.25*a);
        rune(0,0,300,t,c2,a*.55,8,1.4,true);
        for(let i=0;i<5;i++){
          const start=.05+i*.1,rise=out(cl((t-start)/.34));if(rise<=0)continue;
          const ang=-Math.PI/2+i*TAU/5,px=Math.cos(ang)*230,py=Math.sin(ang)*230*.28;
          pillar(px,py,300*rise*(1-cl((t-1.9)/.6)*.4),28+hash(s.seed+i)*10,c2,a*.85);
          flame(px,py,70*rise,c1,c2,a*.8,t+i);
          if(rise>.9)shock(px,py,cl((t-start-.34)/.5),c1,a*.6,180);
        }
        // meteor crown
        for(let i=0;i<5;i++){
          const born=.18+i*.1,age=t-born;if(age<0||age>1.1)continue;
          const fall=cl(age/.7),ang=-.6+i*.3;
          const x=lerp(Math.cos(ang)*380,Math.cos(ang)*60,fall),y=lerp(-520,-70,fall)+Math.sin(fall*Math.PI)*30;
          glow(x,y,26,c1,a*.6,1);glow(x,y,11,core,a*.85,1);
          stroke([[x+40,y-40],[x,y]],rgba(c2,a*.4),7,a*.5);
          if(fall>.95){shock(x,0,cl((age-.7)/.4),c2,a*.7,160);sparks(x,0,age-.7,s.seed+i*17,c1,a*.8,10,1)}
        }
        if(t>.35){
          const q=cl((t-.35)/.9);
          pillar(0,0,520*Math.sin(Math.PI*cl(q*1.1)),60*(1-q*.4),c1,a*.65);
          glow(0,-120,180*Math.sin(Math.PI*q),c2,a*.3,1.3);
        }
        if(t>.6)sparks(0,-60,t-.6,s.seed+31,c2,a*.6,18,.8);
      };

      // Amatsu · Shiranui
      P.foxfireBloom=(s,t)=>{
        const [c1,c2,core,deep]=s.colors,a=1-cl((t/s.life-.86)/.14);
        pool(400,deep,.2*a);
        rune(0,0,250,t,c2,a*.5,6,-1.6,false);
        // nine tails
        for(let i=0;i<9;i++){
          const start=i*.04,p=out(cl((t-start)/.5));if(p<=0)continue;
          const base=i*TAU/9+.2,pts=[];
          for(let j=0;j<=16;j++){
            const q=j/16,an=base+Math.sin(q*2.4+t*2)*.5,rr=lerp(60,300,q)*p;
            pts.push([Math.cos(an)*rr,Math.sin(an)*rr*.32-q*90]);
          }
          ribbon(pts,q=>26*Math.sin(Math.PI*q)*(1-q*.45),rgba(i%2?c1:c2,a*.35));
          ribbon(pts,q=>14*Math.sin(Math.PI*q),rgba(core,a*.28));
          const tip=pts[pts.length-1];
          flame(tip[0],tip[1],40*(1-cl((t-1.6)/.8)),i%2?c1:c2,c2,a*.7,t+i);
        }
        // spirit flames ring
        for(let i=0;i<7;i++){
          const an=i*TAU/7+t*.4,px=Math.cos(an)*210,py=Math.sin(an)*210*.3;
          const fp=cl((t-.16-i*.03)/.4);
          if(fp<=0)continue;
          glow(px,py-10,34*fp,c1,a*.4,1);
          flame(px,py,54*fp,i%2?c2:c1,c1,a*.8,t+i);
        }
        // petals
        for(let i=0;i<Math.ceil(20*quality);i++){
          const born=hash(s.seed+i)*.9,age=t-born;if(age<0||age>1.7)continue;
          const ang=hash(s.seed+i*3)*TAU,drift=age*.4;
          petal(Math.cos(ang)*(90+age*130)+Math.sin(age*2+i)*20,-40-age*120+Math.sin(ang)*40,6+hash(s.seed+i*7)*7,age*2+i,c1,a*.6*(1-age/1.7));
        }
        if(t>.55)glow(0,-90,140*Math.sin(cl((t-.55)/.7)*Math.PI),c1,a*.3,1);
      };
      P.sakuraStorm=(s,t)=>{
        const [c1,c2,core,deep]=s.colors,a=1-cl((t/s.life-.86)/.14);
        pool(330,darken(c1,.78),.24*a);
        // A petal cyclone crosses the map from the left. Each petal keeps a dark rim so the pinks
        // still read on Amatsu's own pink field.
        for(let i=0;i<Math.ceil(64*quality);i++){
          const born=hash(s.seed+i)*.5,age=t-born;if(age<0||age>2.2)continue;
          const q=cl(age/1.8),x=lerp(-400,400,q)+Math.sin(q*5.5+i)*84,y=-260+q*290+Math.cos(q*6.5+i*2)*78;
          const size=9+hash(s.seed+i*5)*13;
          petal(x,y,size,age*3.4+i,i%3?c1:core,a*(1-q*.75),i%3?'#4a1436':'#7a2444');
          if(i%8===0)glow(x,y,12,c2,a*(1-q)*.45,1);
        }
        for(let i=0;i<3;i++){const an=t*3+i*TAU/3;ring(0,-30,110+i*64,rgba(c1,a*.34),a*.45,1.6,an,an+3.8,.72)}
        const p=out(cl((t-.24)/.34));
        if(p>0){
          const pts=[];for(let j=0;j<=24;j++){const q=j/24*cl(p*1.05);const an=lerp(-2.4,.6,q);
            pts.push([Math.cos(an)*lerp(70,360,p),-46+Math.sin(an)*250])}
          ribbon(pts,q=>Math.sin(Math.PI*q)*64,rgba(c1,a*.24));
          blade(pts,21,c1,a*.98,core);
          for(let j=0;j<14;j++){const q=hash(s.seed+j*5),pt=pts[Math.floor(q*(pts.length-1))];
            petal(pt[0]+(hash(s.seed+j)-.5)*70,pt[1]+(hash(s.seed+j*3)-.5)*70,11,q*6+j,j%2?c2:core,a*.95,'#5a1a40')}
        }
        if(t>.34){const f=cl((t-.34)/.5);glow(0,-40,130*(1-f),c1,a*.5*(1-f),1);sparks(0,-40,t-.34,s.seed+13,c2,a*.8,26,.9)}
        for(let i=0;i<4;i++){const start=.22+i*.13,p2=cl((t-start)/.5);if(p2<=0||p2>=1)continue;
          const ang=i*TAU/4+.4,rr=lerp(50,280,p2),px=Math.cos(ang)*rr,py=Math.sin(ang)*rr*.28-60;
          for(let j=0;j<8;j++)petal(px+Math.cos(j*.9)*22,py+Math.sin(j*.9)*22,14,p2*3+j,c1,a*(1-p2)*.9,'#5a1a40');
          glow(px,py,28,c1,a*(1-p2)*.4,1);
        }
      }
      P.soulHarvest=(s,t)=>{
        const [c1,c2,core,deep]=s.colors,a=1-cl((t/s.life-.86)/.14);
        pool(330,deep,.5*a);
        rune(0,0,210,t,c2,a*.3,6,-1.2,false);
        for(let k=0;k<3;k++){
          const start=.04+k*.24,p=out(cl((t-start)/.42));if(p<=0)continue;
          const dir=k%2?-1:1;
          const cx=dir*lerp(-330,300,p),cy=-120+Math.sin(p*Math.PI)*34;
          // shaft runs down to the ground; the hooked blade rides its top edge.
          const shaft=[[cx-dir*150,cy+150],[cx,cy+6]];
          stroke(shaft,rgba(darken(c2,.78),a*.6),9,a*.7,'source-over');
          stroke(shaft,rgba(c2,a*.9),4,a*.95);
          const hook=[];
          for(let j=0;j<=16;j++){const q=j/16,an=lerp(-.55,Math.PI*.95,q);
            hook.push([cx+dir*Math.cos(an)*148,cy-8+Math.sin(an)*96])}
          // the reap itself: a wide luminous crescent behind the blade
          ribbon(hook,q=>Math.sin(Math.PI*cl(q))*17+3,rgba(c2,a*.3));
          ribbon(hook,q=>Math.sin(Math.PI*cl(q))*9+2,rgba(c1,a*.55));
          for(let j=0;j<Math.ceil(8*quality);j++){
            const age=t-start-j*.04;if(age<0||age>1.1)continue;
            glow(cx-dir*(30+age*110),cy+40+Math.sin(age*6+j)*24,5+age*9,c2,a*(1-age/1.1)*.55,1);
          }
          sparks(cx,cy,t-start-.3,s.seed+k*23,c1,a*.7,14,.8);
          ring(0,0,lerp(70,320,p),rgba(c1,a*.42*(1-p*.5)),a*.55,2,0,0,TAU,.26);
        }
        for(let i=0;i<Math.ceil(24*quality);i++){
          const born=hash(s.seed+i)*.8,age=t-born;if(age<0||age>1.8)continue;
          const x=(hash(s.seed+i*3)-.5)*480+Math.sin(age*3+i)*22,y=-age*150+Math.sin(age*4+i)*18;
          const f=a*(1-age/1.8)*.85;
          glow(x,y,7+f*8,c1,f,1);glow(x,y,2.5,core,f,1);
        }
        if(t>.5){const q=cl((t-.5)/.6);ring(0,0,lerp(60,400,q),rgba(c1,a*(1-q)*.5),a*(1-q)*.6,4,0,0,TAU,.26)}
      }
      P.deathVerdict=(s,t)=>{
        const [c1,c2,core,deep]=s.colors,a=1-cl((t/s.life-.85)/.15);
        pool(330,deep,.34*a);
        const stamp=cl((t-.3)/.25);
        rune(0,0,250,t,c1,a*.6,8,1.8,true);
        if(t>.12){
          const sp=out(cl((t-.12)/.3)),sc=1+(1-sp)*.45;
          g.save();g.translate(0,-6);g.scale(sc,sc*.52);g.globalAlpha*=cl(a*sp);
          g.fillStyle=rgba(darken(c1,.86),.8);g.beginPath();g.arc(0,0,158,0,TAU);g.fill();
          g.strokeStyle=rgba(c1,a*.75);g.lineWidth=5;g.beginPath();g.arc(0,0,158,0,TAU);g.stroke();
          // cranium, brow, jaw and sockets
          g.fillStyle=rgba(darken(c1,.72),a*.9);
          g.beginPath();g.ellipse(0,-16,86,80,0,0,TAU);g.fill();
          poly([[-58,34],[58,34],[40,96],[-40,96]],rgba(darken(c1,.72),a*.9));
          g.fillStyle=rgba('#07060c',a*.95);
          for(const sx of [-34,34]){g.beginPath();g.ellipse(sx,-24,25,29,sx>0?.18:-.18,0,TAU);g.fill();}
          poly([[0,2],[-16,34],[16,34]],rgba('#07060c',a*.95));
          for(let i=-2;i<=2;i++)poly([[i*13-4,58],[i*13+4,58],[i*13+3,82],[i*13-3,82]],rgba('#07060c',a*.8));
          g.fillStyle=rgba(core,a*.85);g.beginPath();g.arc(0,-10,7,0,TAU);g.fill();
          for(const sx of [-34,34])glow(sx,-24,26,c1,a*.45,1);
          // horns
          for(const side of [-1,1]){
            const pts2=[];for(let i=0;i<=10;i++){const q=i/10;pts2.push([side*(70+q*64),-84-q*46+Math.sin(q*2.6)*14])}
            stroke(pts2,rgba(darken(c1,.6),a*.7),9,a*.7,'source-over');
            stroke(pts2,rgba(c1,a*.85),4,a*.8);
          }
          g.restore();
        }
        if(t>.42){
          const bp=out(cl((t-.42)/.3)),fade=cl((t-1.9)/.7);
          glow(0,0,170*bp,c1,a*.55,1);
          beam(0,-520,0,0,74*bp*(1-fade),c1,a*.95);
          ring(0,0,150+40*Math.sin(cl((t-1.9)/.7)*Math.PI),rgba(core,a*.45),a*.45,2,0,0,TAU,.27);
          shock(0,0,cl((t-.6)/.6),c1,a*.75,330);
          sparks(0,0,t-.6,s.seed+71,c1,a*.85,28,1.1);
          // spectral nails pinning the seal
          for(let i=0;i<8;i++){
            const start=.5+i*.03,age=t-start;if(age<0||age>.5)continue;
            const an=i*TAU/8+.4,rp=out(cl(age/.16)),rr=lerp(230,160,rp);
            const px=Math.cos(an)*rr,py=Math.sin(an)*rr*.28;
            stroke([[px,py-70*(1-rp)],[px,py]],rgba(c2,a*.8),2.4,a*.85);
            glow(px,py,10,c2,a*.5,1);
          }
        }
        if(t>.4)for(let i=0;i<Math.ceil(16*quality);i++){
          const q=cl((t-.4)/1.4),x=(hash(s.seed+i*7)-.5)*440,y=-q*230+hash(s.seed+i)*60;
          glow(x,y,4,c1,a*(1-q)*.45,1);
        }
      }
      P.abyssalCross=(s,t)=>{
        const [c1,c2,core,deep]=s.colors,a=1-cl((t/s.life-.88)/.12);
        pool(400,deep,.32*a);
        glitch(0,-170,900,340,t,s.seed,c2,a*.85);
        const p1=out(cl(t/.3)),p2=out(cl((t-.12)/.3));
        // TWO crossing greatcut slashes: one descends left-to-right, the other mirrors it.
        const cut=(dir,p,offset)=>{
          const pts=[];
          for(let j=0;j<=26;j++){const q=j/26*cl(p*1.05);
            pts.push([dir*lerp(-500,420,q)+offset,lerp(-300,40,q)+Math.sin(q*Math.PI)*30])}
          return pts;
        };
        const l1=cut(1,p1,0),l2=cut(-1,p2,0);
        if(l1.length>1){
          ribbon(l1,q=>Math.sin(Math.PI*q)*62*(1-q*.2),rgba(c1,a*.2));
          blade(l1,26,c1,a*.95,core);
        }
        if(l2.length>1){
          ribbon(l2,q=>Math.sin(Math.PI*q)*54*(1-q*.2),rgba(c2,a*.18));
          blade(l2,23,c2,a*.95,core);
        }
        // The wound left by the first cut: a black seam with a live edge.
        if(p1>.5){
          const w=[];for(let j=0;j<40;j++){const q=j/39;w.push([lerp(-500,420,q),lerp(-300,40,q)+Math.sin(q*9+t*6)*8])}
          stroke(w,rgba('#0d0008',a*.8),12,a*.75,'source-over');
          stroke(w,rgba(c2,a*.6),2.4,a*.8);
        }
        if(t>.16)shards(0,-40,t-.16,s.seed,c1,c2,a*.85,Math.ceil(18*quality),1);
        if(t>.3){
          const f=cl((t-.3)/.55);
          glow(0,0,170*(1-f*.6),c1,a*.4*(1-f*.4),1);
          shock(0,0,f,c1,a*.85,380);
          shock(0,0,cl((t-.45)/.55),c2,a*.6,300);
          sparks(0,-20,t-.3,s.seed+9,c1,a*.85,32,1.3);
        }
        if(t>.7){
          const g2=cl((t-.7)/.5);
          glitch(0,-110,760,260,t*1.7,s.seed+31,'#ffffff',a*.7*(1-g2));
          for(let i=0;i<Math.ceil(20*quality);i++){
            const born=.35+hash(s.seed+i)*.7,age=t-born;if(age<0||age>1.4)continue;
            const x=(hash(s.seed+i*3)-.5)*680,y=-age*120+60*age*age+hash(s.seed+i*5)*60;
            glow(x,y,2.5+hash(s.seed+i)*4,i%3?c1:c2,a*(1-age/1.4)*.5,1);
          }
        }
      }
      P.chaosRequiem=(s,t)=>{
        const [c1,c2,core,deep]=s.colors,a=1-cl((t/s.life-.88)/.12);
        pool(400,deep,.5*a);
        rune(0,0,250*out(cl(t/.5)),t,c2,a*.4,7,-1.6,true);
        const collapse=cl((t-1.05)/.3);
        const cy=-190;
        if(t<1.35){
          const r=lerp(115,24,out(cl(t/1.3)))+Math.sin(t*9)*5;
          glow(0,cy,r*1.8,c2,a*.26,1,'#000000');
          g.save();g.globalCompositeOperation='lighter';g.globalAlpha*=a*.85;
          const grad=g.createRadialGradient(0,cy,0,0,cy,r);
          grad.addColorStop(0,rgba('#ffffff',.95));grad.addColorStop(.3,rgba(c2,.75));
          grad.addColorStop(.72,rgba(deep,.6));grad.addColorStop(1,rgba(deep,0));
          g.fillStyle=grad;g.beginPath();g.arc(0,cy,r,0,TAU);g.fill();g.restore();
          for(let i=0;i<Math.ceil(30*quality);i++){
            const ang=hash(s.seed+i)*TAU+t*(1.2+hash(s.seed+i*3)*2),rr=r*(1.1+hash(s.seed+i*5)*1.5);
            const px=Math.cos(ang)*rr,py=cy+Math.sin(ang)*rr*.7;
            glow(px,py,3+hash(s.seed+i*7)*5,c1,a*.6,1);
            line([px,py],[px*.55,cy+(py-cy)*.55],rgba(c1,a*.3),1.2);
          }
        }
        if(collapse>0){
          const f=collapse;
          if(f<1)glow(0,cy,240*(1-f)+30,'#ffffff',a*.6,1);
          shock(0,0,cl((t-1.15)/.6),c1,a*.95,400);
          shock(0,0,cl((t-1.3)/.6),c2,a*.85,320);
          shock(0,0,cl((t-1.45)/.6),c1,a*.65,460);
          glitch(0,-140,860,320,t*1.6,s.seed+7,c1,a*.9*(1-f*.4));
          for(let i=0;i<12;i++){
            const start=1.2+i*.022,p=out(cl((t-start)/.3));if(p<=0||p>=1)continue;
            const ang=i*TAU/12+.15,dist=150+hash(s.seed+i)*110,hh=lerp(0,140+hash(s.seed+i*3)*90,p)*(1-cl((p-.75)/.25));
            const px=Math.cos(ang)*dist,py=Math.sin(ang)*dist*.28;
            poly([[px-14,py],[px+Math.sin(i)*6,py-hh],[px+14,py]],rgba(darken(c1,.35),a*.9),1,rgba(c2,a*.75),1.3);
            glow(px,py-hh,16,c1,a*.3,1);
          }
          sparks(0,0,cl((t-1.15)/.6),s.seed+43,c1,a*.9,44,1.4);
          for(let i=0;i<Math.ceil(26*quality);i++){
            const born=1.15+hash(s.seed+i)*.6,age=t-born;if(age<0||age>1.5)continue;
            const ang=hash(s.seed+i*3)*TAU,rr=age*210;
            glow(Math.cos(ang)*rr,Math.sin(ang)*rr*.3-age*40,3+hash(s.seed+i*5)*5,i%2?c1:c2,a*(1-age/1.5)*.55,1);
          }
        }
      }
      P.memoryFracture=(s,t)=>{
        const [c1,c2,core,accent]=s.colors,a=1-cl((t/s.life-.88)/.12);
        pool(520,'#1a2340',.42*a);
        glitch(0,-200,1200,520,t*1.3,s.seed,c2,a*.7);
        const p=out(cl(t/.26));
        // single colossal diagonal slash
        const pts=[];for(let j=0;j<=30;j++){const q=j/30*cl(p*1.04);pts.push([lerp(-720,700,q),lerp(-420,300,q)+Math.sin(q*Math.PI)*40])}
        ribbon(pts,q=>Math.sin(Math.PI*q)*62,rgba(c1,a*.2));
        blade(pts,19,c1,a*.97,core);
        hotEdge(pts,2.4,a*.9,core);
        // chromatic split echoes
        stroke(pts.map(([x,y])=>[x+7,y-4]),rgba('#66e6ff',a*.45),2.2,a*.5);
        stroke(pts.map(([x,y])=>[x-7,y+4]),rgba(accent,a*.4),1.8,a*.45);
        // air shatters into panes
        if(t>.16)glassFall(t-.16,s.seed,a,c1,c2,accent);
        if(t>.3){
          const f=cl((t-.3)/.6);
          glow(0,40,200*(1-f*.5),c2,a*.28*(1-f*.4),1);
          shock(0,0,f,c2,a*.75,620);
          sparks(0,30,t-.3,s.seed+17,accent,a*.9,28,1.2);
          glitch(0,-60,1000,340,t*2,s.seed+9,accent,a*.6*(1-f*.5));
        }
        if(t>.7)for(let i=0;i<Math.ceil(18*quality);i++){
          const born=.4+hash(s.seed+i)*.8,age=t-born;if(age<0||age>1.3)continue;
          const x=(hash(s.seed+i*3)-.5)*900,y=-120-age*160+age*age*120;
          glow(x,y,3+hash(s.seed+i*5)*4,i%2?accent:c2,a*(1-age/1.3)*.5,1);
        }
      };
      P.thanatosJudgment=(s,t)=>{
        const [c1,c2,core,accent]=s.colors,a=1-cl((t/s.life-.88)/.12);
        pool(520,'#1a2340',.4*a);
        const open=out(cl(t/.45));
        // celestial gate
        for(let i=0;i<3;i++){
          ring(0,-300,lerp(30,220,open)*(1-i*.16),rgba(i===1?accent:c1,a*(.55-i*.12)),a*.6,2.4-i*.4,t*(i%2?-1:1)*1.2,0,TAU,1);
        }
        rune(0,0,360*open,t,c2,a*.55,12,-.8,true);
        // clock hands
        if(open>.6){
          const ca=t*1.4;
          line([0,-10],[Math.cos(ca)*330,-10+Math.sin(ca)*330*.26],rgba(accent,a*.55),2.4,a*.7);
          line([0,-10],[Math.cos(ca*.6)*230,-10+Math.sin(ca*.6)*230*.26],rgba(c1,a*.45),2,a*.6);
          glow(0,-10,16,accent,a*.5,1);
        }
        // converging shards
        for(let i=0;i<12;i++){
          const start=i*.03,p2=out(cl((t-.1-start)/.45));if(p2<=0)continue;
          const ang=i*TAU/12+.3,dist=lerp(360,60,p2);
          const px=Math.cos(ang)*dist,py=-240+Math.sin(ang)*dist*.6;
          poly([[px,py-14],[px+7,py],[px,py+14],[px-7,py]],rgba(c1,a*.2),1,rgba(core,a*.85),1.2);
          glow(px,py,12,accent,a*.35,1);
        }
        const beamP=cl((t-.6)/.22);
        if(beamP>0){
          const width=60*beamP*(1-cl((t-2.3)/.7)*.5);
          beam(0,-620,0,0,width,c1,a*.95);
          glow(0,-240,width*3,accent,a*.3,2.2);
          if(beamP>.9){
            shock(0,0,cl((t-.82)/.7),c1,a*.85,700);
            shock(0,0,cl((t-1)/.7),accent,a*.65,520);
            sparks(0,0,t-.8,s.seed+63,accent,a*.9,40,1.3);
          }
        }
        // ascending light
        for(let i=0;i<Math.ceil(26*quality);i++){
          const born=hash(s.seed+i)*1.2,age=t-born;if(age<0||age>2)continue;
          const x=(hash(s.seed+i*3)-.5)*760+Math.sin(age*2+i)*16,y=-age*180;
          glow(x,y,3+hash(s.seed+i*5)*5,i%3?accent:c2,a*(1-age/2)*.55,1);
        }
        glitch(0,-220,1100,440,t*1.4,s.seed+11,accent,a*.5);
      };

      // Thor Volcano · Ifrit (tier 3)
      P.primalEruption=(s,t)=>{
        const [c1,c2,core,deep]=s.colors,a=1-cl((t/s.life-.88)/.12);
        pool(540,deep,.4*a);
        // glowing fissures widen first
        cracks(0,0,t,s.seed+3,c1,a*.8,10,560);
        for(let i=0;i<8;i++){
          const start=.06+i*.09,rise=out(cl((t-start)/.3)),fall=cl((t-start-.7)/.5);if(rise<=0)continue;
          const ang=i*TAU/8+.2,dist=190+hash(s.seed+i)*180,px=Math.cos(ang)*dist,py=Math.sin(ang)*dist*.28;
          const hh=(190+hash(s.seed+i*3)*140)*rise*(1-fall*.7);
          // lava column
          const grad=g.createLinearGradient(0,py,0,py-hh);
          grad.addColorStop(0,rgba(c2,a*.9));grad.addColorStop(.5,rgba(c1,a*.55));grad.addColorStop(1,rgba(c1,0));
          poly([[px-26,py],[px-8,py-hh],[px+8,py-hh],[px+26,py]],grad,a,core,a*.4);
          line([px,py],[px,py-hh],rgba(core,a*.75),2.4,a*.85);
          glow(px,py-hh*.6,50,c1,a*.32,2);
          // ash and embers
          for(let j=0;j<Math.ceil(5*quality);j++){
            const born=start+.1+hash(s.seed+i*7+j)*.5,age=t-born;if(age<0||age>1.4)continue;
            const x=px+(hash(s.seed+i*11+j)-.5)*90,y=py-age*160+Math.sin(age*8+j)*30;
            glow(x,y,2.5+hash(j+i)*4,j%2?c1:'#ffb36b',a*(1-age/1.4)*.55,1);
          }
          if(rise>.85)shock(px,py,cl((t-start-.3)/.5),c1,a*.5,180);
        }
        if(t>.55){
          const f=cl((t-.55)/.8);
          pillar(0,0,560*Math.sin(Math.PI*cl(f*1.05)),70*(1-f*.4),c1,a*.55);
          glow(0,-140,220*Math.sin(Math.PI*f),c2,a*.3,1.5);
        }
        // smoke
        for(let i=0;i<Math.ceil(10*quality);i++){
          const born=.2+hash(s.seed+i)*.8,age=t-born;if(age<0||age>1.6)continue;
          glow((hash(s.seed+i*3)-.5)*520,-80-age*150,50+age*60,'#2a1000',a*(1-age/1.6)*.16,.9,'#331008');
        }
        sparks(0,0,t-.2,s.seed+33,c2,a*.7,30,1.2,.6);
      };
      P.ifritBlaze=(s,t)=>{
        const [c1,c2,core,deep]=s.colors,a=1-cl((t/s.life-.9)/.1);
        pool(560,deep,.42*a);
        // burning trench ahead of the cut
        const trench=out(cl(t/.4));
        if(trench>0){
          const pts=[[-820,26],[820,26]];
          stroke(pts,rgba(c1,a*.35*(1-cl((t-2.4)/.8))),26,a*.4);
          stroke(pts,rgba(c2,a*.75*(1-cl((t-2.4)/.8))),7,a*.8);
          stroke(pts,rgba(core,a*.6*(1-cl((t-2.4)/.8))),2,a*.8);
          for(let i=0;i<Math.ceil(22*quality);i++){
            const x=lerp(-800,800,(hash(s.seed+i)+t*.03)%1),h=12+hash(s.seed+i*3)*44;
            flame(x,26,h,c1,c2,a*(1-cl((t-2.4)/.8))*.6,t+i);
          }
        }
        // ONE colossal horizontal fire slash
        const p=out(cl(t/.32));
        const pts=[];
        for(let j=0;j<=44;j++){const q=j/44*cl(p*1.03);pts.push([lerp(-830,830,q),-60+Math.sin(q*Math.PI*1.3)*44-q*30])}
        ribbon(pts,q=>Math.sin(Math.PI*q)*120,rgba(c1,a*.15));
        ribbon(pts,q=>Math.sin(Math.PI*q)*78,rgba(c1,a*.32));
        ribbon(pts,q=>Math.sin(Math.PI*q)*42,rgba(c2,a*.7));
        ribbon(pts,q=>Math.pow(Math.sin(Math.PI*q),.7)*11,rgba(core,a*.98));
        // heat streaks + ember storm
        for(let i=0;i<Math.ceil(40*quality);i++){
          const born=hash(s.seed+i)*.5,age=t-born;if(age<0||age>1.8)continue;
          const q=hash(s.seed+i*3),x=lerp(-800,800,q),y=-60-age*(120+hash(s.seed+i*5)*160)+Math.sin(age*7+i)*22;
          glow(x,y,2.5+hash(s.seed+i*7)*5,i%3?c1:c2,a*(1-age/1.8)*.65,1);
          if(i%5===0)line([x,y],[x+12,y+4],rgba(c2,a*(1-age/1.8)*.3),1.2);
        }
        if(t>.34){
          const f=cl((t-.34)/.7);
          glitch(0,-90,1200,360,t*1.5,s.seed+5,c1,a*.55*(1-f*.4));
          shock(0,0,f,c1,a*.9,720);
          shock(0,0,cl((t-.5)/.7),c2,a*.7,560);
          sparks(0,20,t-.34,s.seed+71,c1,a*.9,46,1.5,.7);
        }
        if(t>.8){
          const f=cl((t-.8)/.6);
          glow(0,-20,340*(1-f*.5),c2,a*.35*(1-f),1.4);
          glitch(0,-200,1200,460,t*2.1,s.seed+23,'#ffffff',a*.5*(1-f));
        }
        if(t>.5)for(let i=0;i<Math.ceil(14*quality);i++){
          const born=.5+hash(s.seed+i)*.7,age=t-born;if(age<0||age>1.2)continue;
          glow((hash(s.seed+i*3)-.5)*1000,-age*120+40,24+age*26,'#2a0800',a*(1-age/1.2)*.16,2.4,'#331008');
        }
      };

      // ---- composer ---------------------------------------------------------------------
      function soot(x,y,t,a,hex){
        if(a<=0)return;
        for(let i=0;i<Math.ceil(8*quality);i++){
          const q=(i/8+t*.2)%1;
          glow(x+(hash(i*3.7)-.5)*300,y-q*160,28+q*40,'#241008',a*(1-q)*.2,1.4,'#2a1000');
        }
      }
      function glassFall(t,seed,a,hex,accent,edge){
        for(let i=0;i<Math.ceil(18*quality);i++){
          const born=hash(seed+i)*.3,age=t-born;if(age<0)continue;
          const lif=1.5+hash(seed+i*3)*.7;if(age>lif)continue;
          const ang=hash(seed+i*5)*TAU,dist=lerp(20,340,cl(age/.55));
          const px=Math.cos(ang)*dist,py=-60+Math.sin(ang)*dist*.5-age*age*160;
          const rot=age*(hash(seed+i*7)-.5)*6;
          glassPane(px,py,16+hash(seed+i*9)*26,12+hash(seed+i*11)*30,rot,rgba(hex,a*.22),rgba(i%4?accent:'#ffffff',a*.6),a*(1-age/lif));
        }
      }

      function spaced(text){return text.split('').join(' ')}

      function paint(id,time,detailLevel=1,seed=0){
        const s=SKILLS.get(id);
        if(!s||!Number.isFinite(time)||time<0||time>s.life+.05)return;
        const pattern=P[s.pattern];
        if(!pattern)return;
        quality=cl(detailLevel,.25,1);
        // Wide moves get less screen time than their animation needs. Fast-forward the pattern's
        // clock so the whole choreography still plays (nothing is cut off), and dim the entire
        // layer from `fadeAt` on so a full-field slash stops covering the fight shortly after
        // its impact frame. `stage` carries the choreography's own length/seed; the title card
        // and the cast clock keep using the real, shorter `s.life`.
        const rate=s.choreo/s.life,pt=Math.min(time*rate,s.choreo+.05);
        const stage={...s,life:s.choreo,seed:seed||0};
        const dim=1-smooth(cl((time/s.life-s.fadeAt)/Math.max(.001,1-s.fadeAt)));
        g.save();
        try{
          g.globalAlpha=cl(dim);
          stageWash(stage,pt,cl((s.choreo-pt)/.5));
          pattern(stage,pt);
        }finally{quality=1;g.restore()}
      }

      // Title card: drawn in screen space so it stays legible at every camera distance.
      // Title card: drawn in screen space so it stays legible at every camera distance.
      function namePlate(s,c,at,k,ratio){
        const t=c.age;
        if(!Number.isFinite(t)||!Number.isFinite(at[0])||!Number.isFinite(at[1])||!Number.isFinite(k))return;
        const a=Math.min(1,t/.14)*cl((s.life-t)/.4);
        if(!(a>.01))return;
        const tier=s.tier>=3,pop=1+.1*Math.pow(1-cl(t/.3),2);
        const fs=Math.round(cl(15,24+k*10,38));
        // Keep it above the head and the rising damage numbers, but never under the top HUD.
        const lift=cl(k*330,170,400);
        const y=cl(at[1]-lift-10*out(cl(t/.9)),72,at[1]-120);
        g.save();g.setTransform(ratio,0,0,ratio,0,0);
        g.globalAlpha*=cl(a);g.textAlign='center';g.textBaseline='middle';
        // Measure the real type so the plate hugs the name; guard for a canvas without measureText.
        let titleW=fs*Math.min(7.4,s.name.length*.62);
        try{const m=g.measureText&&g.measureText(s.name);if(m&&Number.isFinite(m.width)&&m.width>0)titleW=m.width*.5}catch(_){}
        const pad=titleW+fs*.5;
        const plateA=cl(a*.34);
        const grad=g.createLinearGradient(at[0]-pad,0,at[0]+pad,0);
        grad.addColorStop(0,rgba('#07050d',0));
        grad.addColorStop(.12,rgba('#07050d',plateA));
        grad.addColorStop(.88,rgba('#07050d',plateA));
        grad.addColorStop(1,rgba('#07050d',0));
        g.fillStyle=grad;
        g.fillRect(at[0]-pad,y-fs*1.28,pad*2,fs*1.92);
        g.font='700 '+Math.max(9,Math.round(fs*.38))+'px "Trebuchet MS",Verdana,sans-serif';
        g.fillStyle=rgba(s.colors[1],.95);
        g.fillText(spaced(tier?'CATACLYSM SKILL':'BOSS SKILL'),at[0],y-fs*.98);
        g.translate(at[0],y);g.scale(pop,pop);
        g.font='900 '+fs+'px "Trebuchet MS",Verdana,sans-serif';
        if(tier){
          g.fillStyle=rgba('#59e8ff',.55);g.fillText(s.name,fs*.09,0);
          g.fillStyle=rgba('#ff4f88',.45);g.fillText(s.name,-fs*.09,0);
        }
        g.lineWidth=Math.max(3,fs*.17);g.strokeStyle=rgba('#0a0713',.85);g.lineJoin='round';
        g.strokeText(s.name,0,0);
        g.fillStyle=rgba(s.colors[2],1);g.fillText(s.name,0,0);
        // Hairline rules either side, sized to the name.
        g.strokeStyle=rgba(s.colors[1],.55);g.lineWidth=minW(1);
        const ry=y+fs*.62,hw=Math.min(260,fs*Math.min(5.4,s.name.length*.56));
        g.beginPath();g.moveTo(-hw,ry);g.lineTo(-fs*.7,ry);g.moveTo(fs*.7,ry);g.lineTo(hw,ry);g.stroke();
        g.restore();
      }
      return {
        paint,
        // casts: [{id,age,x,z,scale,seed}]. project(x, y, z) -> [screenX, screenY].
        draw(casts,width,height,project,dpr=1,detailLevel=0){
          if(!g||!casts)return;
          const ratio=Math.min(2,Math.max(1,dpr));
          const w=Math.max(1,Math.round(width*ratio)),h=Math.max(1,Math.round(height*ratio));
          if(canvas.width!==w)canvas.width=w;
          if(canvas.height!==h)canvas.height=h;
          g.setTransform(1,0,0,1,0,0);
          g.clearRect(0,0,w,h);
          if(!casts.length)return;
          const dense=casts.length>2;
          const d=cl(detailLevel||(dense?.55:1),.25,1);
          for(const c of casts){
            const s=SKILLS.get(c.id);if(!s)continue;
            const at=project(c.x,0,c.z),top=project(c.x,3.05,c.z);
            // k is a RELATIVE factor: 1 at the reference camera (3.05 world units drawn as 120px).
            // Design coordinates below are therefore screen pixels at that reference, the same
            // convention the class skill renderer uses, and only the tier's composition size
            // separates a Prontera boss from an Abyss one.
            const k=cl(Math.hypot(top[0]-at[0],top[1]-at[1])/120,.05,3)*s.tierScale*(c.scale||1);
            if(![at[0],at[1],k].every(Number.isFinite)||k<=0)continue;
            g.save();
            pxPerUnit=k*ratio;
            g.setTransform(k*ratio,0,0,k*ratio,at[0]*ratio,at[1]*ratio);
            paint(c.id,c.age,d,c.seed||0);
            pxPerUnit=1;
            g.restore();
            namePlate(s,c,at,k,ratio);
          }
        }
      };
    }
  };
})();
