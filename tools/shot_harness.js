/* TEMP verification harness - delete after use. */
function __vlog(){console.log('[SHOT] '+Array.prototype.join.call(arguments,' '))}
function __dump(tag){
  R.render(scene,cam);
  try{
    var url=R.domElement.toDataURL('image/png');
    __vlog('LEN '+tag+' '+url.length);
    var CH=3000;
    for(var c=0;c<url.length;c+=CH)
      console.log('[CHUNK|'+tag+'|'+c+']'+url.slice(c,c+CH));
  }catch(e){__vlog('toDataURL failed: '+e.message)}
}
window.addEventListener('load',function(){
 setTimeout(function(){
   try{document.getElementById('username').value='GM';
        document.getElementById('password').value=window.PG_GM_PASS||'';   // set by the runner; never stored heresubmitAuth();__vlog('login ok S='+(S?'yes':'NO'));}
   catch(e){__vlog('ERR '+e.message)}
 },40);
 setTimeout(function(){
  try{
   mobs=[];mob=null;S.mp=0;
   var cases=[['THIEF_M','Thief','m'],['THIEF_F','Thief','f'],
              ['ASSASSIN_M','Assassin','m'],['ASSASSIN_F','Assassin','f'],
              ['XCROSS_M','Assassin Cross','m'],['XCROSS_F','Assassin Cross','f']];
   for(var i=0;i<cases.length;i++){
     S.cls=cases[i][1];S.sex=cases[i][2];draw();__dump(cases[i][0]);
   }
   window.requestAnimationFrame=function(){return 0};
  }catch(e){__vlog('ERR2 '+e.message)}
 },400);
});