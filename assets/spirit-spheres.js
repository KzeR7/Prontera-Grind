// Persistent Spirit Spheres reuse the existing signature effect's orb artwork.
// A controller owns its material, not its shared texture; callers own group placement.
(function(root){
'use strict';
const classes=new Set(['Monk','Champion','Sura']);let texture=null;
function create(T){
 if(!T||!root.PGSignatureFx?.orbCanvas)return null;
 if(!texture){texture=new T.CanvasTexture(root.PGSignatureFx.orbCanvas());texture.magFilter=T.LinearFilter;texture.minFilter=T.LinearFilter;texture.generateMipmaps=false;}
 const group=new T.Group(),material=new T.SpriteMaterial({map:texture,transparent:true,depthTest:true,depthWrite:false,blending:T.AdditiveBlending});
 group.userData.spiritSpheres=true;const orbs=[];
 for(let i=0;i<5;i++){const orb=new T.Sprite(material);orb.scale.set(.65,.65,1);orb.visible=false;group.add(orb);orbs.push(orb);}
 function update(count,seconds){const n=Math.max(0,Math.min(5,Math.floor(Number(count)||0))),clock=Number.isFinite(seconds)?seconds:0;
  for(let i=0;i<5;i++){const orb=orbs[i];orb.visible=i<n;if(!orb.visible)continue;const angle=clock*1.3+i*Math.PI*2/n;orb.position.set(Math.cos(angle)*1.15,1.2+Math.sin(angle*2)*.2,Math.sin(angle)*.65);}}
 return {group,update,dispose(){material.dispose();group.remove(...orbs);}};
}
root.PGSpiritSpheres={isClass:cls=>classes.has(cls),create};
})(globalThis);
