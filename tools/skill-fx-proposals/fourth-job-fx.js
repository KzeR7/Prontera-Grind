// Fourth-job choreography, revised against the owner's skill-fx-demo.mp4.
// Native actor art is separate and is never rotated, tinted or repainted here.
const PGFourthJobVisuals=(()=>{
  const rows=/* FOURTH_SKILL_ROWS */[];
  const catalog=rows.map(([id,name,from,color,kind,count,type,spacing])=>({id,name,from,color,kind,count,type,spacing,family:id,fx:{at:type!=='act'||['spin','fireburst','frost'].includes(kind)?'caster':'target'}}));
  const byId=new Map(catalog.map(f=>[f.id,f])),tau=Math.PI*2;
  function aura(g,x,y,time,color='#dfc582',scale=1){
    g.save();g.translate(x,y);g.scale(scale,scale);g.strokeStyle=color;g.lineWidth=1;
    g.globalAlpha*=.25+.08*Math.sin(time*2);
    for(const r of [24,31]){g.beginPath();g.ellipse(0,0,r,r*.32,0,0,tau);g.stroke()}
    for(let i=0;i<6;i++){const a=time*.35+i*tau/6,px=Math.cos(a)*28,py=Math.sin(a)*9;g.beginPath();g.moveTo(px,py-3);g.lineTo(px+2,py);g.lineTo(px,py+3);g.lineTo(px-2,py);g.closePath();g.stroke()}
    g.restore();
  }
  function create(g){
    const env=(t,start,life,attack=.035)=>t<=start||t>=start+life?0:Math.min(1,(t-start)/attack)*Math.pow(Math.min(1,(start+life-t)/(life*.7)),1.4);
    const line=(points,color,width,alpha)=>{if(alpha<=0)return;g.save();g.globalAlpha*=Math.min(1,alpha);g.strokeStyle=color;g.lineWidth=width;g.lineJoin='round';g.lineCap='round';g.beginPath();points.forEach(([x,y],i)=>i?g.lineTo(x,y):g.moveTo(x,y));g.stroke();g.restore()};
    const glow=(x,y,rx,ry,color,alpha)=>{if(alpha<=0)return;g.save();g.globalCompositeOperation='lighter';g.globalAlpha*=Math.min(1,alpha);g.translate(x,y);g.scale(1,ry/rx);const gradient=g.createRadialGradient(0,0,0,0,0,rx);gradient.addColorStop(0,'#fffdf0');gradient.addColorStop(.13,color);gradient.addColorStop(1,'transparent');g.fillStyle=gradient;g.beginPath();g.arc(0,0,rx,0,tau);g.fill();g.restore()};
    const ellipse=(x,y,rx,ry,color,alpha,width=2)=>{if(alpha<=0)return;g.save();g.globalAlpha*=Math.min(1,alpha);g.strokeStyle=color;g.lineWidth=width;g.beginPath();g.ellipse(x,y,Math.max(.1,rx),Math.max(.1,ry),0,0,tau);g.stroke();g.restore()};
    // Filled taper gives the arc a bright blade, a broad body and a vanishing tail.
    const crescent=(x,y,rx,ry,angle,length,width,color,alpha)=>{
      if(alpha<=0)return;g.save();g.globalCompositeOperation='lighter';g.globalAlpha*=Math.min(1,alpha);g.fillStyle=color;g.beginPath();
      for(let side=0;side<2;side++)for(let j=0;j<=22;j++){
        const u=side?1-j/22:j/22,a=angle+u*length,w=Math.sin(Math.PI*u)*width*(side?-.24:1),px=x+Math.cos(a)*(rx+w),py=y+Math.sin(a)*(ry+w*.6);
        if(!side&&!j)g.moveTo(px,py);else g.lineTo(px,py);
      }g.closePath();g.fill();g.restore();
    };
    const motes=(x,y,t,color,count,reach=90,vertical=0)=>{
      const a=env(t,0,.8);if(!a)return;
      for(let i=0;i<count;i++){const angle=i*2.39996,velocity=.4+(i%5)*.14,r=(8+t*reach)*velocity,px=x+Math.cos(angle)*r,py=y+Math.sin(angle)*r*.55-t*vertical;
        line([[px,py],[px-Math.cos(angle)*(4+i%3*3),py-Math.sin(angle)*5]],i%3?'#fffbe9':color,1+i%2,a*.85);
        if(i%4===0)glow(px,py,5,5,color,a*.4);
      }
    };
    const seal=(x,y,t,color,alpha,r=67)=>{
      ellipse(x,y,r,r*.32,color,alpha,2);ellipse(x,y,r*.87,r*.28,'#fff6ce',alpha*.6,1);
      for(let i=0;i<10;i++){const a=i*tau/10+t*.25,px=x+Math.cos(a)*r,py=y+Math.sin(a)*r*.32;line([[px-3,py-4],[px+3,py+4]],color,1.5,alpha*.65)}
    };
    const material=(name,t,x,y,w,h,a,color=null)=>{
      if(a>0&&typeof PGSkillMaterials!=='undefined'&&PGSkillMaterials.ready())PGSkillMaterials.draw(g,name,Math.min(7,Math.floor(Math.max(0,t)*12)),x,y,w,h,0,a,'screen',color);
    };
    return (id,time,detail=1)=>{
      const f=byId.get(id);if(!f||!Number.isFinite(time))return;
      const t=time/1.65;if(t<0||t>2.15||id==='gc_roll'&&t>=.2)return;
      const x=785,y=445,feet=496,c=f.color,small=detail<=.5,n=small?8:18;
      g.save();
      try{
        if(['spin','ripper','wave'].includes(f.kind)){
          const fast=id==='gc_roll',life=fast?.2:.7,p=t/(fast?.2:.55),a=env(t,0,life,.012),px=x+(f.kind==='wave'?-110*Math.max(0,1-p):0);
          glow(px,feet-18,90,45,c,a*.45);
          for(let i=0;i<3;i++){
            const angle=p*tau+i*tau/3;
            crescent(px,feet-30,65+i*12,24+i*6,angle,2.4,13-i*3,c,a*.6);
            crescent(px,feet-30,65+i*12,24+i*6,angle+.12,1.9,4,'#ffffff',a);
          }
          ellipse(px,feet,35+p*52,11+p*18,c,a*.6,2);
          motes(px,feet-20,fast?t*3:t,c,n,80);
        }else if(f.kind==='cross'||f.kind==='cuts'){
          const count=f.kind==='cross'?7:Math.max(3,f.count),spacing=f.kind==='cross'?.055:.1;
          for(let i=0;i<count;i++){
            const hit=t-.025-i*spacing,a=env(hit,0,.28),angle=i%2?-.75:.75,yy=y+(i-count/2)*5;
            g.save();g.translate(x,yy);g.rotate(angle);
            crescent(0,0,73,14,.12,Math.PI,15,c,a*.65);crescent(0,-2,73,14,.15,Math.PI,4,'#ffffff',a);
            line([[-58,0],[66,0]],'#fff8ed',2,a);g.restore();
            glow(x,yy,35,35,c,a*.3);motes(x,yy,hit,c,small?3:5,120);
          }
        }else if(['fireburst','breath','meteor','comet','bomb','frost','burst','detonate'].includes(f.kind)){
          const cold=f.kind==='frost',impact=f.kind==='bomb'?.55:['meteor','comet'].includes(f.kind)?.32:.08,hit=t-impact,a=env(hit,0,1.1),color=cold?'#91e8ff':['detonate'].includes(f.kind)?c:'#ffab45';
          if(f.kind==='bomb'&&t<impact){seal(x,feet,t,'#ffbc65',env(t,0,impact+.05),42);glow(x,feet-5,18,12,'#ff9444',env(t,0,impact));}
          if(['meteor','comet'].includes(f.kind)){
            const p=Math.min(1,t/impact),fade=env(t,0,impact+.14),px=x-90*(1-p),py=y-190*(1-p);
            line([[px-45,py-100],[px,py]],color,18,fade*.3);line([[px-20,py-65],[px,py]],'#fff4cb',7,fade);
            material('meteor',t,px,py,90,115,fade);
          }
          if(f.kind==='breath'){
            for(let i=0;i<7;i++){const p=Math.max(0,t-i*.045),a=env(p,0,.65);const px=x-150+Math.min(1,p/.3)*180,py=y+Math.sin(i*2)*23;
              material('flame',p,px,py,80+i*6,70,a*.8);glow(px,py,35,25,'#ff9b38',a*.35);
            }
          }
          glow(x,feet-30,100+Math.max(0,hit)*25,100,color,a*.6);
          ellipse(x,feet,18+Math.max(0,hit)*155,7+Math.max(0,hit)*53,color,a,4);
          seal(x,feet,hit,color,a*.45,45+Math.max(0,hit)*60);
          for(let i=0;i<(small?5:9);i++){
            const angle=i*2.39996,r=20+Math.max(0,hit)*85,px=x+Math.cos(angle)*r,py=feet-15+Math.sin(angle)*r*.35;
            material(cold?'ice':'flame',hit,px,py-25,50+i%3*14,cold?115:90,a*.8);
            if(cold)line([[px-9,py],[px,py-60],[px+8,py],[px-9,py]],'#d8faff',2,a*.75);
          }
          motes(x,y,hit,color,n,150,cold?25:80);
          material('smoke',hit,x,feet-40,160,100,a*.22);
        }else if(f.kind==='lightning'||f.kind==='chain'){
          const count=f.kind==='lightning'?4:3;
          for(let i=0;i<count;i++){
            const hit=t-.04-i*.1,a=env(hit,0,.42),px=x+(i?Math.cos(i*2.4)*85:0),py=y+(i?Math.sin(i*2.4)*30:0),points=[];
            for(let j=0;j<10;j++)points.push([px+(j%2?1:-1)*(j?9+Math.sin(j*9+t*45)*11:0),py-170+j*19]);
            line(points,c,10,a*.22);line(points,'#c8eaff',4,a);line(points,'#ffffff',1.5,a);
            if(i)line([[x,y],[x+20,y-20],[px-12,py+7],[px,py]],c,2,a);
            glow(px,py,48,64,c,a*.55);motes(px,py,hit,c,small?4:8,80);
          }
        }else if(f.kind==='judgment'||f.kind==='ward'||f.kind==='seal'){
          const holy=f.from==='Arch Bishop',color=holy?'#ffe7a1':c,a=env(t,.04,1.6),hit=t-.15;
          seal(x,feet,t,color,a,60+Math.min(1,t)*18);
          glow(x,feet-50,75,115,color,a*.24);
          if(f.kind==='judgment'){
            const a=env(hit,0,1.1);
            glow(x,y,45,145,color,a*.7);
            for(const [width,alpha]of [[24,.18],[10,.5],[3,1]])line([[x,feet-205],[x,feet]],width===3?'#ffffff':color,width,a*alpha);
            for(let side of [-1,1]){
              crescent(x+side*9,feet-85,90,35,side<0?.2:3.4,2.6,15,color,a*.65);
              crescent(x+side*9,feet-85,90,35,side<0?.25:3.45,2.4,4,'#ffffff',a);
            }
            motes(x,y,hit,color,n,110,-35);
          }else{
            const r=55+Math.sin(Math.min(1,t)*Math.PI)*12;
            ellipse(x,feet-58,r,72,color,a*.6,2);crescent(x,feet-58,r,72,t*2,2.7,6,'#fffdf1',a*.65);
            for(let i=0;i<8;i++){const angle=i*tau/8+t*.5,px=x+Math.cos(angle)*60,py=feet-15+Math.sin(angle)*18-t*22;glow(px,py,4,9,color,a*.8)}
            material('seal',t,x,feet,135,50,a*.4);
          }
        }else if(f.kind==='arrows'||f.kind==='gatling'||f.kind==='pounce'){
          const count=f.kind==='arrows'?14:f.kind==='gatling'?6:3;
          for(let i=0;i<count;i++){
            const start=i*(f.kind==='arrows'?.035:.085),hit=t-start-.2,a=env(t,start,.3),p=Math.min(1,Math.max(0,(t-start)/.2)),tx=x+(i%5-2)*(f.kind==='arrows'?23:6),ty=y+30+Math.floor(i/5)*7;
            const px=tx-(1-p)*(f.kind==='arrows'?60:140),py=ty-(1-p)*(f.kind==='arrows'?160:25);
            line([[px-14,py-(f.kind==='arrows'?38:3)],[px,py]],c,6,a*.28);line([[px-14,py-(f.kind==='arrows'?38:3)],[px,py]],'#fffbe6',2,a);
            glow(tx,ty,20,25,c,env(hit,0,.22)*.7);motes(tx,ty,hit,c,small?2:4,65);
          }
          if(f.kind==='arrows')ellipse(x,feet,90,30,c,env(t,.2,.65),2);
        }else if(f.kind==='wolf'){
          const p=Math.min(1,t/.32),px=x-130*(1-p),py=y+8-20*Math.sin(p*Math.PI),a=env(t,0,.65);
          glow(px,py,75,40,c,a*.5);
          const outline=[[px-50,py+4],[px-30,py-7],[px-9,py-10],[px-2,py-28],[px+10,py-13],[px+26,py-8],[px+37,py+2],[px+15,py+10],[px+6,py+30],[px-1,py+10],[px-23,py+10],[px-35,py+28],[px-31,py+6]];
          line(outline,c,8,a*.25);line(outline,'#e5fff5',2,a);motes(x,y,t-.25,c,n,110);
          for(let i=0;i<3;i++)crescent(x,y,55+i*8,20,t*4+i,2,4,'#ffffff',env(t,.25+i*.04,.4));
        }else if(f.kind==='cannon'||f.kind==='rocket'){
          const p=Math.min(1,t/.24),px=x-160*(1-p),a=env(t,0,.32),hit=t-.24;
          line([[px-70,y-10],[px,y]],'#ff9d4f',17,a*.25);line([[px-30,y-4],[px,y]],'#fff3c3',6,a);glow(px,y,23,15,c,a);
          material('fireball',t,px,y,55,50,a);
          glow(x,y,110,110,'#ffbd62',env(hit,0,.75)*.7);motes(x,y,hit,c,n,160,35);
          material('flame',hit,x,y,135,145,env(hit,0,.8)*.9);material('smoke',hit,x,feet-20,180,110,env(hit,.15,.85)*.4);
          ellipse(x,feet,15+Math.max(0,hit)*150,6+Math.max(0,hit)*48,c,env(hit,0,.7),4);
        }
      }finally{g.restore()}
    };
  }
  return {catalog,create,aura};
})();
PGAfterglowAnimations.catalog.push(...PGFourthJobVisuals.catalog);
{
  const original=PGAfterglowAnimations.create,ids=new Set(PGFourthJobVisuals.catalog.map(f=>f.id));
  PGAfterglowAnimations.create=g=>{const base=original(g),fourth=PGFourthJobVisuals.create(g);return(id,t,detail=1)=>(ids.has(id)?fourth:base)(id,t,detail)};
}
