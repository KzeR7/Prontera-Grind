// BACKUP of the live class-skin ANIMATION code, extracted verbatim from index.html.
//
// Read Updates/ApngAnimation/README.md first: it explains, for a future update, what the uploaded
// files are (multi-frame looping APNGs), how the game decodes and plays them, the traps that cost
// time, and the exact steps to follow when new art arrives.
//
// This file is a copy for reading and restoring - the game runs the block inside index.html.
// Regenerate / verify with:
//     python3 tools/backup_apng_code.py
//     python3 tools/backup_apng_code.py --check
// (class_skin_sim.js runs --check, so this copy cannot go stale unnoticed.)

// ----- Class skins (assets/class_skins_data.js, built by tools/make_class_skins.py) -----
// The owner's class art is one complete 200x200 ANIMATED PNG per supplied view: walking S,
// walking SE, walking NE and attacking SE (High Priest also supplies its own walking N).
// Every one of those files is several full-frame RGBA images in a row, each with its own delay,
// looping forever (num_plays = 0) - so the game DECODES those frames itself and plays them on the
// file's own clock, painting the frame that is due right now onto the 200x200 canvas that is the
// hero's texture.  v52 tried to lean on the browser instead ("copy whatever frame the decoded
// <img> is showing"); browsers pause an APNG that is not painted on screen, so the hero sat on
// frame 0.  Nothing here is invented, re-timed or re-encoded: frame order, per-frame delays and
// the endless loop come from the file, and the test suite decodes every file and compares every
// frame against Pillow's own rendering of it.
const SKIN_SIZE=200;                       // every supplied canvas is 200x200
const SKIN_VIEW={0:['S',0],1:['SE',1],2:['SE',1],3:['NE',1],4:['NE',0],5:['NE',0],6:['SE',0],7:['SE',0]};
// Attacking is drawn by the single SE attack animation: the left-hand facings (SW, W, NW) get it
// mirrored, everything else the drawn swing.  Both are named here, in one list, so it is testable.
const SKIN_ATTACK_MIRROR=[0,1,1,1,0,0,0,0];
// One constant scale per class and gender: the hero already stood 72px of the old pack cell tall.
const SKIN_H=72*PACK_K;
const SKIN_STRIP_KEEP=18;                  // decoded view strips kept alive at once (~23 MB of canvas)
const SKIN_CACHE_MAX=24;                   // hidden <img> decoders kept alive when frames cannot be read
const skinStrips=new Map(),skinStripOrder=[],skinDocs={},skinDocOrder=[],skinPacks=new Map(),skinWarned={},skinDecoding={};
// Reading the frames needs fetch + DecompressionStream; a page opened straight off the disk
// (file://) has neither, so there the game shows the art without its frames and says so.
const SKIN_FILE_PROTOCOL=(typeof location!=='undefined'&&location.protocol==='file:');
const SKIN_DECODE=!SKIN_FILE_PROTOCOL&&typeof DecompressionStream==='function'&&typeof fetch==='function'&&typeof Response==='function';
let skinBroken=SKIN_FILE_PROTOCOL;
function skinNow(){return (typeof performance!=='undefined'&&performance.now)?performance.now():Date.now()}
// A hidden-but-painted <img> is the last-resort path when the frames cannot be read (and it is
// what keeps the art visible at all on an old browser): display:none is exactly what browsers
// are allowed to skip, so the decoder lives in the corner instead.
function skinLayer(){let el=$('skinDecoders');if(!el){el=document.createElement('div');el.id='skinDecoders';
  el.setAttribute('aria-hidden','true');
  el.style.cssText='position:fixed;left:0;top:0;width:1px;height:1px;overflow:hidden;opacity:0;pointer-events:none;z-index:-1';
  document.body.appendChild(el)}return el}
function skinDoc(url){
  const cached=skinDocs[url];
  if(cached)return cached;
  const im=new Image();im.alt='';im.draggable=false;im.decoding='async';
  im.style.cssText='width:'+SKIN_SIZE+'px;height:'+SKIN_SIZE+'px';
  skinDocs[url]=im;skinDocOrder.push(url);
  if(skinDocOrder.length>SKIN_CACHE_MAX){const old=skinDocOrder.shift();
    if(old&&old!==url)delete skinDocs[old]}
  im.onload=()=>{heroKey='';drawAppearancePreview();drawClassPreview()};
  im.src=encodeURI(url);
  skinLayer().appendChild(im);
  return im}
function skinMakeImg(p,view,url,why){
  let im=skinDocs[url];
  if(!im){
    skinBroken=true;
    im=skinDoc(url);
    im.onerror=()=>{const key=im.dataset.warn||'';if(!skinWarned[key]){skinWarned[key]=1;
      log('Class skin art could not load ('+decodeURI(url)+'). The animated fallback sprite is used instead.','r0')}}
    if(why&&!skinWarned[url]){skinWarned[url]=1;
      log('Class skin animation could not be read ('+decodeURI(url)+'): '+why+'. The art is drawn without its frames - serve the game over http (python3 -m http.server) to see it animate.','r0')}}
  im.dataset.warn=String(p&&p.files?p.files[view]:'')+'|'+view}
// ---- APNG frames, decoded here ------------------------------------------------------------
function skinBytes(parts){let n=0;for(const p of parts)n+=p.length;const out=new Uint8Array(n);
  let o=0;for(const p of parts){out.set(p,o);o+=p.length}return out}
async function skinInflate(bytes){
  const stream=new DecompressionStream('deflate'),writer=stream.writable.getWriter();
  writer.write(bytes);writer.close();
  return new Uint8Array(await new Response(stream.readable).arrayBuffer())}
function skinPaeth(a,b,c){const p=a+b-c,pa=Math.abs(p-a),pb=Math.abs(p-b),pc=Math.abs(p-c);
  return pa<=pb&&pa<=pc?a:pb<=pc?b:c}
// PNG filter reconstruction (RFC 2083 section 6), 8-bit RGBA rows only - which is what the art is.
function skinUnfilter(raw,w,h,bpp){
  const stride=w*bpp,out=new Uint8Array(stride*h);
  for(let y=0;y<h;y++){
    const filter=raw[y*(stride+1)],line=y*stride,prev=line-stride,src=y*(stride+1)+1;
    for(let x=0;x<stride;x++){
      const value=raw[src+x],a=x>=bpp?out[line+x-bpp]:0,b=y?out[prev+x]:0,c=(y&&x>=bpp)?out[prev+x-bpp]:0;
      out[line+x]=(filter===0?value
        :filter===1?value+a
        :filter===2?value+b
        :filter===3?value+((a+b)>>1)
        :filter===4?value+skinPaeth(a,b,c)
        :value)&255}}
  return out}
// One APNG -> one horizontal strip of its decoded frames, in file order.
async function skinDecodePng(bytes){
  if(!bytes||bytes.length<8||bytes[0]!==137||bytes[1]!==80||bytes[2]!==78||bytes[3]!==71)return null;
  const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  let p=8,width=0,height=0,depth=0,type=0,interlace=0,frames=null;
  const parts=[];
  while(p+8<=bytes.length){
    const length=view.getUint32(p),kind=String.fromCharCode(bytes[p+4],bytes[p+5],bytes[p+6],bytes[p+7]);
    if(kind==='IHDR'){width=view.getUint32(p+8);height=view.getUint32(p+12);depth=bytes[p+16];type=bytes[p+17];interlace=bytes[p+20]}
    else if(kind==='acTL')frames=view.getUint32(p+8);
    else if(kind==='fcTL')parts.push({rect:{x:view.getUint32(p+20),y:view.getUint32(p+24),w:view.getUint32(p+12),h:view.getUint32(p+16)},
      dispose:bytes[p+32],blend:bytes[p+33],delay:[view.getUint16(p+28),view.getUint16(p+30)],chunks:[]});
    else if(kind==='IDAT'){if(!parts.length)parts.push({rect:{x:0,y:0,w:width,h:height},dispose:0,blend:0,delay:[0,100],chunks:[]});
      parts[0].chunks.push(bytes.subarray(p+8,p+8+length))}
    else if(kind==='fdAT'&&parts.length)parts[parts.length-1].chunks.push(bytes.subarray(p+12,p+8+length));
    p+=12+length;
    if(kind==='IEND')break}
  if(!frames||!parts.length||!width||!height||depth!==8||type!==6||interlace)return null;
  if(parts.length!==frames)return null;
  const shown=new Uint8ClampedArray(width*height*4);       // the picture as displayed, starts transparent
  const out=[];
  for(const part of parts){
    if(!part.chunks.length)return null;
    const pixels=skinUnfilter(await skinInflate(skinBytes(part.chunks)),part.rect.w,part.rect.h,4);
    const saved=part.dispose===2?shown.slice():null;       // APNG_DISPOSE_OP_PREVIOUS
    for(let y=0;y<part.rect.h;y++)for(let x=0;x<part.rect.w;x++){
      const from=(y*part.rect.w+x)*4,to=((part.rect.y+y)*width+part.rect.x+x)*4,alpha=pixels[from+3];
      if(part.blend===1&&alpha<255){                        // APNG_BLEND_OP_OVER
        const keep=shown[to+3]*(255-alpha)/255;
        shown[to]=(pixels[from]*alpha+shown[to]*keep)/(alpha+keep||1);
        shown[to+1]=(pixels[from+1]*alpha+shown[to+1]*keep)/(alpha+keep||1);
        shown[to+2]=(pixels[from+2]*alpha+shown[to+2]*keep)/(alpha+keep||1);
        shown[to+3]=alpha+keep}
      else{shown[to]=pixels[from];shown[to+1]=pixels[from+1];shown[to+2]=pixels[from+2];shown[to+3]=alpha}}
    out.push(shown.slice());
    if(part.dispose===1){                                   // APNG_DISPOSE_OP_BACKGROUND
      for(let y=0;y<part.rect.h;y++)for(let x=0;x<part.rect.w;x++){const to=((part.rect.y+y)*width+part.rect.x+x)*4;
        shown[to]=shown[to+1]=shown[to+2]=shown[to+3]=0}}
    else if(part.dispose===2&&saved)shown.set(saved)}
  const cv=document.createElement('canvas');cv.width=width*out.length;cv.height=height;
  const ctx=cv.getContext('2d');ctx.imageSmoothingEnabled=false;
  for(let i=0;i<out.length;i++)ctx.putImageData(new ImageData(out[i],width,height),i*width,0);
  return {cv,n:out.length,w:width,h:height}}
async function skinDecodeView(url){
  const response=await fetch(encodeURI(url));
  if(!response.ok)throw Error('HTTP '+response.status);
  return skinDecodePng(new Uint8Array(await response.arrayBuffer()))}
// ---- which decoded strips stay in memory ------------------------------------------------
function skinPinnedUrls(){
  const pin=new Set();
  const add=p=>{if(p&&p.files)for(const v in p.files)pin.add(p.dir+'/'+p.files[v])};
  add(heroSpr&&heroSpr.userData.skin?heroSpr.userData.skin.p:null);
  if(S){add(skinPack(S.cls,S.sex));if(selK)add(skinPack(selK,S.sex))}
  return pin}
function skinEvict(){
  const pin=skinPinnedUrls();
  while(skinStripOrder.length>SKIN_STRIP_KEEP){
    let i=0;while(i<skinStripOrder.length&&pin.has(skinStripOrder[i]))i++;
    if(i>=skinStripOrder.length)break;                     // everything left is in use
    const url=skinStripOrder.splice(i,1)[0],gone=skinStrips.get(url);
    skinStrips.delete(url);
    if(gone&&gone.cv){gone.cv.width=1;gone.cv.height=1}}}
function skinStrip(p,view){
  const url=p.dir+'/'+p.files[view],strip=skinStrips.get(url);
  if(strip){const i=skinStripOrder.indexOf(url);if(i>=0)skinStripOrder.splice(i,1);skinStripOrder.push(url)}
  return strip||null}
function skinViewEnsure(p,view){
  const url=p.dir+'/'+p.files[view];
  if(skinStrips.has(url)||skinDocs[url]||skinDecoding[url])return;
  if(!SKIN_DECODE){skinMakeImg(p,view,url,SKIN_FILE_PROTOCOL?'the page is not being served over http':'this browser cannot decode the frames');return}
  skinDecoding[url]=1;
  skinDecodeView(url).then(strip=>{
    delete skinDecoding[url];
    if(strip&&strip.n===p.frames[view]){
      skinStrips.set(url,strip);skinStripOrder.push(url);skinEvict();
      heroKey='';drawAppearancePreview();drawClassPreview();
      if(p.name&&skinLoaded(p)&&!skinWarned['ready:'+p.name]){skinWarned['ready:'+p.name]=1;
        // one plain line in the log so the player can see the frames arrived and are playing
        const bits=Object.keys(p.files).map(v=>p.frames[v]+' '+v).join(', ');
        log('Class skin animation ready: '+p.name+' - '+bits+' frames, played with the file\'s own delays.')}}
    else skinMakeImg(p,view,url,strip&&strip.n!==p.frames[view]?'the file has '+strip.n+' frames, the manifest says '+p.frames[view]:'the file could not be read as an animation');
  }).catch(err=>{delete skinDecoding[url];skinMakeImg(p,view,url,err&&err.message)})}
// One pack per class and gender: the measured art data, the file's own delays in seconds, and the
// promise to decode every supplied view.
function skinPack(cls,sex){
  const key=String(cls)+'|'+(sex==='f'?'f':'m'),cached=skinPacks.get(key);
  if(cached!==undefined)return cached;
  const all=window.CLASS_SKINS,rec=all&&all.classes&&all.classes[cls]?all.classes[cls][sex==='f'?'f':'m']:null;
  let p=null;
  if(rec){p={dir:all.dir,name:String(cls)+' '+(sex==='f'?'female':'male'),files:rec.files,frames:rec.frames,delays:rec.delays,secs:{},total:{},height:rec.height,anchor:rec.anchor};
    for(const v in rec.files){
      const d=rec.delays[v]||[];
      // an APNG delay denominator of 0 means 100 (spec); seconds here, the unit the clock is in
      const secs=d.map(e=>e[0]/(e[1]||100));
      p.secs[v]=secs;p.total[v]=secs.reduce((a,b)=>a+b,0)}
    for(const v in rec.files)skinViewEnsure(p,v)}
  skinPacks.set(key,p);return p}
function skinImage(p,view){const im=p&&skinDocs[p.dir+'/'+p.files[view]];return im&&im.complete&&im.naturalWidth>0?im:null}
function skinStripOf(p,view){return p?skinStrips.get(p.dir+'/'+p.files[view])||null:null}
function skinViewReady(p,view){return !!(skinStripOf(p,view)||skinImage(p,view))}
// The whole class and gender waits for every supplied view: a half-loaded class would show the
// wrong view for a moment, and the animated pack is always there to cover the wait.
function skinLoaded(p){if(!p)return false;for(const v in p.files)if(!skinViewReady(p,v))return false;return true}
// Which supplied animation a facing and an action draw, and whether it is mirrored.  dir 4 (straight
// up) uses High Priest's own N file when the class has one; otherwise the NE view stands in.
function skinRoute(p,dir,atk){
  if(atk>0)return{view:'attack',mirror:!!SKIN_ATTACK_MIRROR[dir]};
  if(dir===4&&p&&p.files&&p.files.N)return{view:'N',mirror:false};
  const v=SKIN_VIEW[dir];return{view:v[0],mirror:!!v[1]}}
function mkSkinHero(p){
  const cv=document.createElement('canvas');cv.width=SKIN_SIZE;cv.height=SKIN_SIZE;
  const tex=new THREE.CanvasTexture(cv);tex.magFilter=tex.minFilter=THREE.NearestFilter;tex.generateMipmaps=false;
  const s=new THREE.Sprite(new THREE.SpriteMaterial({map:tex,transparent:true,alphaTest:.12}));
  const px=SKIN_H/(p.height||90);                      // world units per source pixel, one per class/gender
  s.scale.set(SKIN_SIZE*px,SKIN_SIZE*px,1);
  // anchor: the figure's own centre x and its ground line, so the feet stay put while frames advance
  s.center.set((p.anchor[0]||SKIN_SIZE/2)/SKIN_SIZE,1-(p.anchor[1]||SKIN_SIZE)/SKIN_SIZE);
  s.userData.skin={p,cv,tex,view:'',mirror:null,route:'',t0:0};
  return s}
// Which frame is due right now: walk the file's own delays, wrap at their total, forever.
function skinFrameIndex(p,view,ms){
  const secs=p.secs[view],total=p.total[view]||0;
  if(!secs||!secs.length||!(total>0))return 0;
  let t=(ms/1000)%total;if(t<0)t+=total;
  for(let i=0;i<secs.length;i++){t-=secs[i];if(t<0)return i}
  return secs.length-1}
// The source to copy from for a view, and where its due frame starts in that source.
function skinFrameOf(p,view,now){
  const strip=skinStrip(p,view);
  if(strip)return{img:strip.cv,sx:skinFrameIndex(p,view,now===undefined?skinNow():now)*strip.w,sw:strip.w,sh:strip.h};
  const im=skinImage(p,view);
  return im?{img:im,sx:0,sw:SKIN_SIZE,sh:SKIN_SIZE}:null}
// Paint the frame that is due for this facing onto the hero's canvas; the browser-playing-the-file
// version of this could not be trusted to advance, so the clock and the frames are both ours now.
function captureSkinFrame(spr,route,now){
  const sk=spr.userData.skin,p=sk.p,nowMs=now===undefined?skinNow():now;
  const key=route.view+(route.mirror?'|m':'');
  const changed=sk.route!==key;
  if(changed){sk.route=key;sk.t0=nowMs}               // a new view or a new swing starts at its frame 0
  const frame=skinFrameOf(p,route.view,nowMs-sk.t0);
  if(!frame){
    // nothing to draw: for the facing already on screen keep the frame it is showing (a decoded
    // view that was dropped from the cache reloads in the background), but never show one facing's
    // art while the player is facing another - there the sprite hides until its frames arrive.
    skinViewEnsure(p,route.view);                     // the cache may have dropped it - ask again (idempotent)
    if(!changed&&sk.painted)return false;
    spr.visible=false;return false}
  spr.visible=true;sk.painted=true;
  const ctx=sk.cv.getContext('2d');
  ctx.setTransform(1,0,0,1,0,0);
  ctx.clearRect(0,0,SKIN_SIZE,SKIN_SIZE);             // transparency preserved - no background is painted
  ctx.imageSmoothingEnabled=false;                    // pixel art stays pixel art
  if(route.mirror){ctx.translate(SKIN_SIZE,0);ctx.scale(-1,1)}
  ctx.drawImage(frame.img,frame.sx,0,frame.sw,frame.sh,0,0,SKIN_SIZE,SKIN_SIZE);
  ctx.setTransform(1,0,0,1,0,0);
  sk.view=route.view;sk.mirror=route.mirror;
  sk.tex.needsUpdate=true;                            // the GPU texture follows the canvas next render
  return true}

