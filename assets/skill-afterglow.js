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
    has:id=>catalog.has(id),life:2.2,
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
          // Single-target casts follow the monster's drawn size; area footprints retain their world scale.
          const scale=Math.max(.01,Math.hypot(top[0]-at[0],top[1]-at[1])/120)*(fx.areaScale||1)*(caster.has(fx.id)?1:(fx.targetScale||1));
          // A projected ground seal at the caster; no sprite art is modified.
          if(fx.magic&&fx.age<.4){
            const sealColor=/Acolyte|Priest/.test(catalog.get(fx.id)?.from||'')?[246,223,164]:[159,205,244];
            g.save();
            if(typeof PGSkillMaterials!=='undefined'&&PGSkillMaterials.ready()){
              const center=project(fx.x0,.04,fx.z0),right=project(fx.x0+1.6,.04,fx.z0),down=project(fx.x0,.04,fx.z0+1.6);
              g.setTransform((right[0]-center[0])*ratio,(right[1]-center[1])*ratio,(down[0]-center[0])*ratio,(down[1]-center[1])*ratio,center[0]*ratio,center[1]*ratio);
              PGSkillMaterials.draw(g,'seal',0,0,0,2.5,2.5,0,Math.max(0,1-fx.age/.4),'screen',sealColor);
            }else{
              g.setTransform(ratio,0,0,ratio,0,0);g.globalAlpha=Math.max(0,1-fx.age/.4);g.strokeStyle='rgb('+sealColor+')';g.lineWidth=1.5;
              for(const radius of [1.1,1.4]){g.beginPath();for(let i=0;i<=48;i++){const angle=i*Math.PI/24,point=project(fx.x0+Math.cos(angle)*radius,.04,fx.z0+Math.sin(angle)*radius);if(i)g.lineTo(...point);else g.moveTo(...point)}g.closePath();g.stroke()}
            }
            g.restore();
          }
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
          paint(fx.id,fx.age*1.65,detail);
          g.restore();
        }
      }};
    }
  };
})();
