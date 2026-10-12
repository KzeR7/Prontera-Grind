'use strict';
(async()=>{
  const $=id=>document.getElementById(id), canvas=$('character'), ctx=canvas.getContext('2d');
  const reduced=matchMedia('(prefers-reduced-motion: reduce)');
  $('still').checked=reduced.matches;
  let manifest,loader,request=0,started=0,lastPaint='',currentView=null;
  const selected={m:{head:2,palette:0},f:{head:2,palette:0}};
  const labels={S:'South',SE:'South-east',NE:'North-east'};
  function fill(){
    const sex=$('sex').value;
    $('hair').replaceChildren(...manifest.hairs[sex].map(head=>new Option('Style '+head,head)));
    $('palette').replaceChildren(...manifest.palettes[sex].map(p=>new Option(p.label,p.id)));
    $('hair').value=selected[sex].head; $('palette').value=selected[sex].palette;
  }
  async function load(){
    if(!manifest)return;
    const token=++request,sex=$('sex').value,head=Number($('hair').value),palette=Number($('palette').value);
    selected[sex]={head,palette};
    const stance=$('stance').value,direction=$('direction').value;
    $('attack-controls').hidden=stance!=='attack';
    $('status').textContent='Loading selected appearance…';$('retry').hidden=true;
    try {
      const record=manifest.looks.find(r=>r.sex===sex&&r.head===head&&r.palette===palette);
      if(!record)throw Error('This appearance has not been built yet');
      const result=await loader.select(record,stance,direction);
      if(token!==request||!result)return;
      currentView={stance,direction};started=performance.now();lastPaint='';
      $('appearance').textContent=`${sex==='m'?'Male':'Female'} · Style ${head} · Palette ${palette}`;
      $('status').textContent='Ready · all nine animations are in this local appearance bundle.';
      const stats=loader.stats();
      $('memory').textContent=`1 appearance · 1 decoded view · ${(stats.decodedBytes/1048576).toFixed(2)} MiB frame pixels · ${(stats.compressedBytes/1024).toFixed(0)} KiB bundle. Temporary decoder memory is additional.`;
    } catch(error){
      if(token!==request)return;
      $('status').textContent=`Could not load selection. ${loader.current?'Previous appearance is still shown. ':''}${error.message}`;
      $('retry').hidden=false;
    }
  }
  function paint(now){
    const current=loader?.current;
    if(current&&currentView){
      const {entry,strip}=current;
      const frame=$('still').checked?0:AppearancePack.frameAt(entry.durations,now-started,currentView.stance!=='attack',currentView.stance==='attack'?Number($('swing').value):null);
      const mirror=$('mirror').checked,key=[current.record.sha256,entry.key,frame,mirror].join('|');
      if(key!==lastPaint){
        ctx.clearRect(0,0,320,280);ctx.save();ctx.imageSmoothingEnabled=false;
        if(mirror){ctx.translate(320,0);ctx.scale(-1,1);}
        ctx.drawImage(strip.cv,frame*320,0,320,280,0,0,320,280);ctx.restore();lastPaint=key;
        $('view-label').textContent=labels[currentView.direction]+(mirror?' · mirrored preview':' · authored view');
        $('frame-label').textContent=`Frame ${frame+1} / ${entry.frames}`;
      }
    }
    requestAnimationFrame(paint);
  }
  async function boot(){
    try{
      const response=await fetch('manifest.json');if(!response.ok)throw Error('Catalog request failed');
      manifest=await response.json();
      if(manifest.schemaVersion!==1||!manifest.looks?.length)throw Error('No local bundles available');
      loader=new AppearancePack.ActiveLook({catalogSha256:manifest.catalogSha256,decode:decodeAppearancePng});
      window.spriteWorkshop={loader,manifest,load}; // Read-only inspection and regression entry point.
      $('coverage').textContent=`${manifest.looks.length} / 360 appearances · ${manifest.looks.length*9} local animations · 20 styles per gender · 9 palette IDs.`;
      fill();await load();
    }catch(error){$('status').textContent='Could not start workshop: '+error.message;$('retry').hidden=false;}
  }
  $('sex').addEventListener('change',()=>{if(manifest){fill();load();}});
  for(const id of ['hair','palette','stance','direction'])$(id).addEventListener('change',load);
  $('retry').addEventListener('click',()=>loader?load():boot());
  $('replay').addEventListener('click',()=>{started=performance.now();});
  $('swing').addEventListener('input',()=>{$('swing-label').textContent=$('swing').value+' ms';started=performance.now();});
  $('still').addEventListener('change',()=>{started=performance.now();});
  reduced.addEventListener('change',event=>{$('still').checked=event.matches;started=performance.now();});
  // pagehide may enter the back-forward cache; pageshow restores the active view.
  addEventListener('pagehide',()=>{++request;loader?.dispose();currentView=null;});
  addEventListener('pageshow',event=>{if(event.persisted)load();});
  requestAnimationFrame(paint);await boot();
})();
