// Prototype copy of the game APNG decoder at e69ebb9. No live game dependency.
// Original block SHA-256: c8c0d99a5d0819b563c85af36659d94bf031f6a3883368c5c82e34400c9c02b7
// Inflate uses a stream pipeline so decompression failures reject normally.
function skinBytes(parts){let n=0;for(const p of parts)n+=p.length;const out=new Uint8Array(n);
  let o=0;for(const p of parts){out.set(p,o);o+=p.length}return out}
async function skinInflate(bytes){
  return new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate'))).arrayBuffer())}
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

window.decodeAppearancePng=skinDecodePng;
