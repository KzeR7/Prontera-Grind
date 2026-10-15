/* Uses the existing audited native wardrobe pack, unchanged pixels/actions/anchors/delays. */
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory;else root.PGJourneyHero=factory(root.THREE,root.PGWardrobe);})(typeof globalThis==='object'?globalThis:this,function(THREE,Wardrobe){
'use strict';
function create({createCanvas=()=>document.createElement('canvas'),store=null,className='Lord Knight',appearance=null,onStatus=()=>{}}={}){
 if(!store)store=new Wardrobe.Store({base:'/assets/wardrobe/v5/'});
 const canvas=createCanvas(),ctx=canvas.getContext('2d'),root=new THREE.Group();root.name='Native journey character';
 let disposed=false,look=null,texture=null,sprite=null,painted='',state='loading',error='',pending=null;
 function load(){if(disposed)return Promise.resolve(false);if(pending)return pending;
  state='loading';error='';onStatus(state,error);
  pending=store.select('journey',appearance||Wardrobe.defaults('m'),className).then(value=>{
   if(disposed){store.dispose();return false;}if(!value)throw Error('Native character selection was cancelled');look=value;
   const catalog=store.catalog;if(!catalog||catalog.width!==320||catalog.height!==280||!Array.isArray(catalog.anchor))throw Error('Native character canvas contract changed');
   canvas.width=catalog.width;canvas.height=catalog.height;
   if(!sprite){texture=new THREE.CanvasTexture(canvas);texture.encoding=THREE.sRGBEncoding;texture.magFilter=texture.minFilter=THREE.NearestFilter;texture.generateMipmaps=false;
    sprite=new THREE.Sprite(new THREE.SpriteMaterial({map:texture,transparent:true,alphaTest:.08,depthWrite:false,toneMapped:false}));root.add(sprite);}
   const unit=2.16/look.base.figureHeight;sprite.scale.set(catalog.width*unit,catalog.height*unit,1);sprite.center.set(catalog.anchor[0]/catalog.width,1-catalog.anchor[1]/catalog.height);sprite.position.y=.055;
   state='ready';painted='';onStatus(state,'');return true;
  }).catch(e=>{if(!disposed){state='failed';error=e.message;onStatus(state,error);}return false;}).finally(()=>{pending=null;});return pending;
 }
 const ready=load();
 return{root,ready,retry:load,get status(){return state;},get error(){return error;},
  update(ms,walking,direction=4,freezeIdle=false){if(disposed||!look||state!=='ready')return false;const stance=walking?'walk':'idle',time=freezeIdle&&!walking?0:ms;
   const key=stance+direction+':'+Wardrobe.animationKey(look,stance,direction,time);if(key===painted)return false;
   Wardrobe.draw(ctx,look,stance,direction,time);texture.needsUpdate=true;painted=key;return true;
  },diagnostics(){return{status:state,error,painted,className,native:true,verifiedFiles:look?look.ids.flatMap(id=>{const rec=store.catalog.assets[id];return[{file:rec.meta,sha256:rec.metaSha256,bytes:rec.metaBytes},{file:rec.image,sha256:rec.imageSha256,bytes:rec.imageBytes}];}):[],figureHeight:look&&look.base.figureHeight,decodedBytes:store.pixelBytes};},
  dispose(){if(disposed)return;disposed=true;if(texture)texture.dispose();if(sprite)sprite.material.dispose();root.clear();store.dispose();look=null;}
 };
}
return Object.freeze({create});
});
