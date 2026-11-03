// Proof of concept: cut individual creatures out of the reference sheets the owner sent, key the
// flat background away, trim, and drop them to the size the game draws (96px).
//   node tools/fish_sprite_crops.js [dir]
// Writes docs/fish-crop-test-haven-v301.png. Nothing is wired into the game.
const fs=require('node:fs'),path=require('node:path');
const {createCanvas,loadImage}=require('@napi-rs/canvas');
const DIR=process.argv[2]||'/tmp/arena-coding-uploads';
const F=require(path.join(__dirname,'..','assets','social-fishing.js'));

const SHEETS=[
 {file:'image-10.png',label:'angelfish chart',minPx:900},
 {file:'image-9.png',label:'sea-slug chart',minPx:900},
 {file:'image-11.png',label:'cephalopod poster',minPx:1200},
 {file:'image-12.png',label:'creature grid',minPx:700},
];

function keyBackground(data,w,h){
 // flood fill from every border pixel over "background coloured" pixels, so dark eyes and
 // dark bodies inside the creature survive while the flat backdrop does not.
 const at=(x,y)=>(y*w+x)*4;
 let br=0,bg=0,bb=0,n=0;
 for(let x=0;x<w;x++)for(const y of [0,h-1]){const i=at(x,y);br+=data[i];bg+=data[i+1];bb+=data[i+2];n++}
 for(let y=0;y<h;y++)for(const x of [0,w-1]){const i=at(x,y);br+=data[i];bg+=data[i+1];bb+=data[i+2];n++}
 br/=n;bg/=n;bb/=n;
 const tol=64,tol2=tol*tol;
 const isBg=(x,y)=>{const i=at(x,y),dr=data[i]-br,dg=data[i+1]-bg,db=data[i+2]-bb;return dr*dr+dg*dg+db*db<=tol2};
 const seen=new Uint8Array(w*h),stack=[];
 for(let x=0;x<w;x++){stack.push(x,0,x,h-1)}
 for(let y=0;y<h;y++){stack.push(0,y,w-1,y)}
 while(stack.length){
  const y=stack.pop(),x=stack.pop();
  if(x<0||y<0||x>=w||y>=h)continue;
  const k=y*w+x;
  if(seen[k])continue;
  if(!isBg(x,y))continue;
  seen[k]=1;
  stack.push(x+1,y,x-1,y,x,y+1,x,y-1);
 }
 return seen; // 1 = background
}

function components(data,bgMask,w,h,minPx){
 const label=new Int32Array(w*h).fill(-1),out=[];
 let next=0;
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const k=y*w+x;
  if(bgMask[k]||label[k]!==-1)continue;
  const id=next++,stack=[k];
  label[k]=id;
  let minX=x,maxX=x,minY=y,maxY=y,count=0;
  while(stack.length){
   const p=stack.pop(),px=p%w,py=(p-px)/w;
   count++;
   if(px<minX)minX=px;if(px>maxX)maxX=px;if(py<minY)minY=py;if(py>maxY)maxY=py;
   const nb=[p-1,p+1,p-w,p+w],nx=[px-1,px+1,px,px],ny=[py,py,py-1,py+1];
   for(let i=0;i<4;i++){
    const X=nx[i],Y=ny[i];
    if(X<0||Y<0||X>=w||Y>=h)continue;
    const q=nb[i];
    if(label[q]!==-1||bgMask[q])continue;
    label[q]=id;stack.push(q);
   }
  }
  if(count>=minPx)out.push({id,count,minX,maxX,minY,maxY});
 }
 return {label,out};
}

function cut(data,label,comp,w,h){
 const bw=comp.maxX-comp.minX+1,bh=comp.maxY-comp.minY+1;
 const c=createCanvas(bw,bh),g=c.getContext('2d'),img=g.createImageData(bw,bh);
 for(let y=0;y<bh;y++)for(let x=0;x<bw;x++){
  const sx=comp.minX+x,sy=comp.minY+y,sk=sy*w+sx,dk=(y*bw+x)*4;
  const mine=label[sk]===comp.id;
  // one pixel of feather, so the cut edge is not a hard staircase
  const near=!mine&&((sx>0&&label[sk-1]===comp.id)||(sx<w-1&&label[sk+1]===comp.id)||(sy>0&&label[sk-w]===comp.id)||(sy<h-1&&label[sk+w]===comp.id));
  if(!mine&&!near)continue;
  const i=sk*4;
  img.data[dk]=data[i];img.data[dk+1]=data[i+1];img.data[dk+2]=data[i+2];
  img.data[dk+3]=mine?data[i+3]:Math.min(150,data[i+3]);
 }
 g.putImageData(img,0,0);
 return c;
}

(async()=>{
 const found=[];
 for(const sheet of SHEETS){
  const p=path.join(DIR,sheet.file);
  if(!fs.existsSync(p)){console.log('skip missing',p);continue}
  const img=await loadImage(p);
  const c=createCanvas(img.width,img.height),g=c.getContext('2d');
  g.drawImage(img,0,0);
  const {data}=g.getImageData(0,0,img.width,img.height);
  const bgMask=keyBackground(data,img.width,img.height);
  const {label,out}=components(data,bgMask,img.width,img.height,sheet.minPx);
  // reading order, so the sheet matches the source layout
  out.sort((a,b)=>{
   const ra=Math.floor((a.minY+a.maxY)/2/90),rb=Math.floor((b.minY+b.maxY)/2/90);
   return ra===rb?a.minX-b.minX:ra-rb;
  });
  let kept=0;
  for(const comp of out){
   const wpx=comp.maxX-comp.minX+1,hpx=comp.maxY-comp.minY+1;
   if(wpx<40||hpx<30)continue;             // letters, dots, stray specks
   if(wpx>img.width*0.92)continue;         // page-wide rules and headings
   const art=cut(data,label,comp,img.width,img.height);
   found.push({art,sheet:sheet.label,w:wpx,h:hpx});
   kept++;
  }
  console.log(sheet.file,sheet.label,'->',kept,'creatures');
 }

 // ---- contact sheet: the crops at the size the game draws them -------------------------------
 const CELL=126,PAD=24,COLS=10;
 const rows=Math.ceil(found.length/COLS);
 const W=PAD*2+COLS*CELL,H=150+rows*(CELL+16)+PAD;
 const out=createCanvas(W,H),og=out.getContext('2d');
 og.fillStyle='#12161d';og.fillRect(0,0,W,H);
 og.fillStyle='#eef3fb';og.font='bold 25px sans-serif';
 og.fillText('Cropped straight from your pins — background keyed, trimmed, 96px',PAD,PAD-6);
 og.fillStyle='#8fa0b8';og.font='14px sans-serif';
 og.fillText(found.length+' creatures recovered. Drawn at 96px on the game panel colour. Not wired into the game.',PAD,PAD+26);
 found.forEach((f,i)=>{
  const cx=PAD+(i%COLS)*CELL,cy=150+Math.floor(i/COLS)*(CELL+16);
  og.fillStyle='#1b2230';og.beginPath();og.roundRect?og.roundRect(cx,cy,CELL-6,CELL-6,14):og.rect(cx,cy,CELL-6,CELL-6);og.fill();
  const s=Math.min((CELL-30)/f.w,(CELL-30)/f.h);
  const dw=f.w*s,dh=f.h*s;
  og.imageSmoothingEnabled=true;
  og.drawImage(f.art,cx+(CELL-6-dw)/2,cy+(CELL-6-dh)/2,dw,dh);
 });
 fs.writeFileSync(path.join(__dirname,'..','docs','fish-crop-test-haven-v301.png'),out.toBuffer('image/png'));
 console.log('wrote docs/fish-crop-test-haven-v301.png');
})().catch(e=>{console.error(e);process.exitCode=1});
