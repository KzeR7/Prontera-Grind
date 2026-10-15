'use strict';
// One preloaded atlas, shared by all effects. Failed/pending images use vector fallbacks.
const PGSkillMaterials=(()=>{
  const names=['flame','fireball','smoke','flare','brush','ice','meteor','seal'];
  const atlas=typeof Image==='function'?new Image():null;
  if(atlas)atlas.src='data:image/webp;base64,__ATLAS_DATA__';
  const tinted=new Map(),size=128,frames=8;
  const ready=()=>!!(atlas&&atlas.complete&&atlas.naturalWidth===1024&&atlas.naturalHeight===1024);
  return {ready,draw(g,name,frame,x,y,width,height,angle=0,alpha=1,blend='screen',tint=null){
    const row=names.indexOf(name);if(!ready()||row<0||!Number.isFinite(frame))return false;
    if(alpha<=0||width<=0||height<=0)return true;
    const f=((Math.floor(frame)%frames)+frames)%frames;
    let source=atlas,sx=f*size,sy=row*size;
    if(tint){
      const key=name+f+':'+tint.join(',');let cached=tinted.get(key);
      if(!cached){
        cached=document.createElement('canvas');cached.width=cached.height=size;
        const ctx=cached.getContext('2d');if(!ctx)return false;
        ctx.drawImage(atlas,sx,sy,size,size,0,0,size,size);
        ctx.globalCompositeOperation='source-in';ctx.fillStyle='rgb('+tint+')';ctx.fillRect(0,0,size,size);
        if(tinted.size>=96)tinted.delete(tinted.keys().next().value);tinted.set(key,cached);
      }
      source=cached;sx=sy=0;
    }
    g.save();g.translate(x,y);g.rotate(angle);g.globalCompositeOperation=blend;g.globalAlpha*=Math.min(1,alpha);
    g.drawImage(source,sx,sy,size,size,-width/2,-height/2,width,height);g.restore();return true;
  }};
})();
