// Run on /Updates/lord-knight-bundles/ in the shared browser. Starts an async audit;
// poll window.appearanceAudit. No external renderer is requested.
(()=>{
  if(window.appearanceAudit?.status==='running')throw Error('Audit already running');
  window.appearanceAudit={status:'running',looks:0,animations:0,frames:0,peakDecodedViews:0,maxDecodeMs:0};
  (async()=>{
    const result=window.appearanceAudit;
    const manifest=await (await fetch('manifest.json')).json();
    if(!manifest.complete||manifest.looks.length!==360)throw Error('Wait for all 360 bundles');
    const canvases=[];let requests=0;
    const loader=new AppearancePack.ActiveLook({catalogSha256:manifest.catalogSha256,
      fetcher:(...args)=>{requests++;return fetch(...args);},
      decode:async bytes=>{
        const started=performance.now(),strip=await decodeAppearancePng(bytes);
        result.maxDecodeMs=Math.max(result.maxDecodeMs,performance.now()-started);
        canvases.push(strip.cv);
        result.peakDecodedViews=Math.max(result.peakDecodedViews,canvases.filter(c=>c.width>0).length);
        // Every decoded frame must contain visible pixels and match metadata dimensions.
        const ctx=strip.cv.getContext('2d');
        for(let i=0;i<strip.n;i++){
          const pixels=ctx.getImageData(i*320,0,320,280).data;
          let opaque=false;for(let j=3;j<pixels.length;j+=4)if(pixels[j]){opaque=true;break;}
          if(!opaque)throw Error('Empty decoded browser frame');
        }
        return strip;
      }});
    try{
      for(const record of manifest.looks){
        for(const stance of manifest.stances)for(const direction of manifest.directions){
          const current=await loader.select(record,stance,direction);
          if(current.entry.stance!==stance||current.entry.direction!==direction)throw Error('Wrong native view');
          result.animations++;result.frames+=current.strip.n;
          if(loader.stats().decodedViews!==1||loader.stats().residentLooks!==1)throw Error('Unbounded cache');
          if(canvases.filter(c=>c.width>0).length!==1)throw Error('Previous canvas retained');
        }
        result.looks++;
      }
      if(requests!==360)throw Error('Expected one fetch per appearance; got '+requests);
      result.requests=requests;result.status='pass';result.webglAvailable=!!document.createElement('canvas').getContext('webgl');
    }finally{loader.dispose();result.remainingDecodedViews=canvases.filter(c=>c.width>0).length;}
  })().catch(error=>{window.appearanceAudit.status='failed';window.appearanceAudit.error=error.message;});
  return 'Started local bundle browser audit';
})()
