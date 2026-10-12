// Read-only microbenchmark in the shared browser on /Updates/hair-color-preview/.
// Uses the CURRENT game's exact APNG decoder, not an invented stand-in.
(async()=>{
 const game=await (await fetch('/index.html')).text();
 const begin=game.indexOf('function skinBytes('),end=game.indexOf('async function skinDecodeView(',begin);
 if(begin<0||end<0)throw Error('Current decoder symbols missing');
 const decoderSource=game.slice(begin,end),decode=new Function(decoderSource+';return skinDecodePng;')();
 const sourceHash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(decoderSource)))).map(n=>n.toString(16).padStart(2,'0')).join('');
 const cases=[
  ['current walk','/Updates/Sprite/Swordman/lordknight male walking SE.png'],
  ['current attack','/Updates/Sprite/Swordman/lordknight male attack SE.png'],
  ['new idle','art/4008-m-sword-2-0-SE-idle.png'],
  ['new walk','art/4008-m-sword-2-0-SE-walk.png'],
  ['new attack','art/4008-m-sword-2-0-SE.png']
 ];
 const measurements=[];
 for(const [name,url] of cases){
  const response=await fetch(url);if(!response.ok)throw Error(url+' '+response.status);
  const bytes=new Uint8Array(await response.arrayBuffer());
  const times=[];let meta;
  for(let i=0;i<6;i++){
   const start=performance.now(),strip=await decode(bytes);const ms=performance.now()-start;
   if(!strip)throw Error('Current game decoder rejects '+name);
   meta={width:strip.w,height:strip.h,frames:strip.n,decodedRGBABytes:strip.w*strip.h*strip.n*4};
   if(i>0)times.push(ms);strip.cv.width=0;strip.cv.height=0;
  }
  times.sort((a,b)=>a-b);measurements.push({name,url,transferBytes:bytes.length,...meta,decodeMsMedian:times[2],decodeMsMax:times[4],runs:5,warmups:1});
 }
 const im=document.getElementById('male');if(!im?.complete)throw Error('Preview not ready');
 const canvas=document.createElement('canvas');canvas.width=320;canvas.height=280;const ctx=canvas.getContext('2d');
 const times=[];
 for(let i=0;i<20;i++){const t=performance.now();for(let j=0;j<100;j++){ctx.clearRect(0,0,320,280);ctx.drawImage(im,0,0)}times.push((performance.now()-t)/100)}
 times.sort((a,b)=>a-b);
 const glCanvas=document.createElement('canvas');const gl=glCanvas.getContext('webgl')||glCanvas.getContext('experimental-webgl');
 const result={userAgent:navigator.userAgent,hardwareConcurrency:navigator.hardwareConcurrency,decoderSha256:sourceHash,measurements,
  canvasDrawCallMs:{median:times[10],p95:times[19],batches:20,drawsPerBatch:100},webglAvailable:!!gl,
  limitations:'Microbenchmark on cloud Chromium. Decode times exclude network; canvas draw submission excludes GPU completion and full-game workload. Not a phone FPS or production latency test.'};
 if(gl)gl.getExtension('WEBGL_lose_context')?.loseContext();
 return result;
})()
