/* TEMP verification harness v3 - maps the sprite quad exactly as the GPU does. */
function __vlog(){console.log('[VERIFY] '+Array.prototype.join.call(arguments,' '))}
window.addEventListener('load',function(){
 setTimeout(function(){
   try{document.getElementById('username').value='GM';
        document.getElementById('password').value='gm1234';
        submitAuth();__vlog('LOGIN='+document.getElementById('loginOverlay').style.display);}
   catch(e){__vlog('LOGIN_ERR='+e.message)}
 },40);
 setTimeout(function(){
  try{
   var keys=Object.keys(window.SPRITE_ATLASES||{});
   keys.forEach(function(k){loadAtlas(k)});
   var iv=setInterval(function(){
     if(ATLAS_PEND.length)return;
     clearInterval(iv);
     var bad=[];
     atlasTex.forEach(function(t,k){if(!t||!t.image||t.image.width!==512||t.image.height!==960)bad.push(k)});
     __vlog('ATLASES='+keys.length+' BAD='+(bad.length?bad.join(','):'none'));

     var oldBg=scene.background,oldFog=scene.fog;
     scene.background=new THREE.Color(0xff00ff);scene.fog=null;

     function shot(label){
       lastKey='';draw();
       var hidden=[];
       scene.traverse(function(o){
         if((o.isMesh||o.isSprite)&&o!==heroSpr&&o.visible){o.visible=false;hidden.push(o)}});
       heroSpr.visible=true;
       R.render(scene,cam);

       var gl=R.domElement;
       var c2=document.createElement('canvas');c2.width=gl.width;c2.height=gl.height;
       var g2=c2.getContext('2d');g2.drawImage(gl,0,0,c2.width,c2.height);
       var d=g2.getImageData(0,0,c2.width,c2.height).data;

       /* Exact sprite quad: centre(.5,0) => spans x -w/2..w/2, y 0..h in view space. */
       cam.updateMatrixWorld();R.render(scene,cam);
       var w=heroSpr.scale.x,h=heroSpr.scale.y;
       var v=new THREE.Vector3(P.position.x,P.position.y,P.position.z);
       var view=v.clone().applyMatrix4(cam.matrixWorldInverse);
       function projPt(vx,vy){
         var t=new THREE.Vector4(vx,vy,view.z,1).applyMatrix4(cam.projectionMatrix);
         return [(t.x/t.w*.5+.5)*gl.width,(-t.y/t.w*.5+.5)*gl.height]}
       var bl=projPt(view.x-w/2,view.y),br=projPt(view.x+w/2,view.y);
       var tl=projPt(view.x-w/2,view.y+h),tr=projPt(view.x+w/2,view.y+h);

       var map=heroSpr.material.map;
       var col=Math.round(map.offset.x*SPR_DIRS),row=Math.round((1-map.offset.y)*SPR_ROWS-1);
       var cv=document.createElement('canvas');cv.width=64;cv.height=96;
       cv.getContext('2d').drawImage(map.image,col*64,row*96,64,96,0,0,64,96);
       var cd=cv.getContext('2d').getImageData(0,0,64,96).data;

       var n=0,tot=0,yy,xx,ci,sx,sy,fi;
       for(yy=0;yy<96;yy++)for(xx=0;xx<64;xx++){
         ci=(yy*64+xx)*4;
         if(cd[ci+3]<250)continue;
         var u=xx/63,vv=1-yy/95;              /* bilinear across the quad */
         var lx=bl[0]+(br[0]-bl[0])*u, ly=bl[1]+(tl[1]-bl[1])*vv;
         sx=Math.round(lx);sy=Math.round(ly);
         if(sx<0||sy<0||sx>=c2.width||sy>=c2.height)continue;
         fi=(sy*c2.width+sx)*4;tot++;
         if(Math.abs(d[fi]-cd[ci])<26&&Math.abs(d[fi+1]-cd[ci+1])<26&&Math.abs(d[fi+2]-cd[ci+2])<26)n++}
       __vlog(label+' CELL='+col+','+row+' QUAD='+bl[0].toFixed(0)+','+bl[1].toFixed(0)+
              '..'+tr[0].toFixed(0)+','+tr[1].toFixed(0)+' PX='+tot+' MATCH='+n+' '+
              (tot?(100*n/tot).toFixed(0):0)+'%');
       hidden.forEach(function(o){o.visible=true});
     }

     S.cls='Novice';S.sex='m';shot('NOVICE_M');
     S.sex='f';shot('NOVICE_F');
     S.cls='Thief';S.sex='m';shot('THIEF_M');
     S.cls='Assassin';S.sex='f';shot('ASSASSIN_F');
     S.cls='Assassin Cross';S.sex='f';shot('XCROSS_F');
     S.cls='Novice';S.sex='m';

     /* ---- mobs: same check on a live mob mesh ---- */
     function shotMob(name){
       var m={n:name,shape:'blob',c:0xffffff};
       var v=buildMob(m);
       var img=v.spr.material.map.image;
       var baked=!!(v.pending===null&&img&&img.width===512&&img.height===960);
       __vlog('MOB_'+name.replace(/\W/g,'_')+' BAKED='+baked+' IMG='+(img?(img.width+'x'+img.height):'canvas'));
       scene.remove(v.G);
     }
     ['Poring','Drops','Poporing','Mastering','Fabre','Lunatic','Savage Bebe',
      'Chonchon','Peco Peco','Willow','Rocker'].forEach(shotMob);

     /* ---- late-swap: a mob whose atlas is still loading must be upgraded ---- */
     (function(){
       var key='mob:Poring';
       delete atlasTex.get(key);                       // pretend it is not loaded yet
       atlasTex.set(key,null);
       var v=buildMob({n:'Poring',shape:'blob',c:0xffffff});
       mobMesh.set('__test',v);                        // register like the real draw loop
       var before=v.spr.material.map.image;
       var wasPending=v.pending===key;
       loadAtlas(key);
       __vlog('LATESWAP pendingBefore='+wasPending+' imgBefore='+(before?(before.width+'x'+before.height):'canvas'));
       setTimeout(function(){
         var after=v.spr.material.map.image;
         __vlog('LATESWAP imgAfter='+(after?(after.width+'x'+after.height):'canvas')+
                ' swapped='+(after&&after.width===512));
         mobMesh.delete('__test');scene.remove(v.G);
         scene.background=oldBg;scene.fog=oldFog;
         __vlog('RESULT='+(bad.length===0?'ALL_ATLASES_OK':'ATLAS_PROBLEMS'));
       },2500);
     })();
   },150);
  }catch(e){__vlog('ERR='+e.message+' line'+e.lineno)}
  window.requestAnimationFrame=function(){return 0};
 },400);
});