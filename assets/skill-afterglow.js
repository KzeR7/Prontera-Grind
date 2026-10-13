'use strict';
// One transparent battlefield canvas, shared by every cast. The combat loop owns time.
const PGSkillAfterglow=(()=>{
  const catalog=new Map(PGAfterglowAnimations.catalog.map(f=>[f.id,f]));
  // These refer to the study's drawing anchors, independently of gameplay skill type.
  const caster=new Set(['aid','quick','aura','jointbeat','frenzy','coat','mystic','iconc','sight',
    'wwalk','bless','iagi','asp','gloria','adren','thrust','cboost','dpois','ovthrust']);
  const path=new Set(['bowl','pierce','fireball','jup','meteor','dstr','blitz','sharp','falcon',
    'focus','soulb','sandat','vsplash','heal','cart','fdiver']);
  return {
    has:id=>catalog.has(id),life:3.6,
    create(canvas){
      const g=canvas.getContext('2d');if(!g)return null;
      const paint=PGAfterglowAnimations.create(g);
      return {draw(effects,width,height,project,dpr=1){
        const ratio=Math.min(2,Math.max(1,dpr));
        const w=Math.max(1,Math.round(width*ratio)),h=Math.max(1,Math.round(height*ratio));
        if(canvas.width!==w)canvas.width=w;if(canvas.height!==h)canvas.height=h;
        g.setTransform(1,0,0,1,0,0);g.clearRect(0,0,w,h);
        const active=effects.filter(f=>f.afterglow);
        const detail=active.length>=16?.35:active.length>=8||width<760?.6:1;
        for(const fx of active){
          const a=project(fx.x0,0,fx.z0),b=project(fx.x1,0,fx.z1);
          const at=caster.has(fx.id)?a:b;
          const x=caster.has(fx.id)?fx.x0:fx.x1,z=caster.has(fx.id)?fx.z0:fx.z1;
          const top=project(x,3.05,z);
          // Match the study's 120px target to the game's 3.05-unit creature billboard.
          const scale=Math.max(.01,Math.hypot(top[0]-at[0],top[1]-at[1])/120);
          const traveling=path.has(fx.id)&&Math.hypot(b[0]-a[0],b[1]-a[1])>1;
          const anchor=caster.has(fx.id)?252:785;
          let sx=scale,sy=0,yx=0,yy=scale,tx=at[0]-anchor*scale,ty=at[1]-500*scale;
          if(traveling){
            // Map both feet anchors onto the real flight path, including camera reversal.
            sx=(b[0]-a[0])/533;sy=(b[1]-a[1])/533;
            const distance=Math.hypot(sx,sy),facing=sx<0?-1:1;
            yx=-sy/distance*scale*facing;yy=sx/distance*scale*facing;
            tx=a[0]-252*sx-500*yx;ty=a[1]-252*sy-500*yy;
          }
          if(![sx,sy,yx,yy,tx,ty].every(Number.isFinite))continue;
          g.save();
          g.setTransform(sx*ratio,sy*ratio,yx*ratio,yy*ratio,tx*ratio,ty*ratio);
          paint(fx.id,fx.age,detail);
          g.restore();
        }
      }};
    }
  };
})();
