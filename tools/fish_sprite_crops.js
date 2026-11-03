// Proof of concept: cut individual creatures out of the reference sheets the owner sent, key the
// flat background away, trim, and drop them to the size the game draws (96px).
//   node tools/fish_sprite_crops.js [dir]
// Writes docs/fish-crop-test-haven-v303.png. Nothing is wired into the game.
const fs=require('node:fs'),path=require('node:path');
const {createCanvas,loadImage}=require('@napi-rs/canvas');
const DIR=process.argv[2]||'/tmp/arena-coding-uploads';
const F=require(path.join(__dirname,'..','assets','social-fishing.js'));

// Order matters: the first four sheets own indices 0-96, which the shipped mapping references.
// New sheets are appended so a re-map never silently moves an existing fish.
const SHEETS=[
 {file:'image-10.png',label:'angelfish chart',minPx:900},
 {file:'image-9.png',label:'sea-slug chart',minPx:900},
 {file:'image-11.png',label:'cephalopod poster',minPx:1200},
 {file:'image-12.png',label:'creature grid',minPx:700},
 {file:'image-14.png',label:'chibi sharks',minPx:900},
 {file:'image-15.png',label:'sea turtles',minPx:1400},
 {file:'image-16.png',label:'reef fish',minPx:900},
 {file:'image-17.png',label:'star octopus',minPx:1400},
 {file:'image-18.png',label:'crystal snails',minPx:1200},
 {file:'image-19.png',label:'reef fish II',minPx:900},
 {file:'image-21.png',label:'shark grid',minPx:700},
 {file:'image-22.png',label:'shrimp and amphipods',minPx:900},
 {file:'image-23.png',label:'seahorses',minPx:900},
 // v303: every creature on this sheet carries a translucent mahoukarP stamp. Cropping around it is
 // impossible (it sits on the body), so this sheet is flagged clean:true and the stamp is scrubbed
 // after the cut. The two non-creatures (a star blob, the artist's signature) are dropped below.
 {file:'image-20.png',label:'whales',minPx:1400,clean:true},
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


// v303 (owner): the whale sheet carries a faint "mahoukarP" logo and credit line stamped over every
// creature. It is translucent art drawn ON the body, so there is no way to crop around it, and both
// automatic removals that were tried damaged the drawing itself (a per-pixel scrub left the stamp
// half-there and ringed the white spots; a full inpaint flattened the belly and ate the spot
// pattern). The seven creatures are therefore used as drawn - the mark is faint enough to be
// invisible at the 32-64px the game renders - and the sheet is only flagged clean:true so its two
// non-creatures (a star blob and the artist's signature line) are rejected by the size filter.

// Which crop becomes which species. Chosen by silhouette + palette, not by grid position:
// the angelfish chart covers the disc-bodied fish, the slugs the small odd bottom-dwellers,
// the cephalopod poster the squid/octopus line, and the odd fish from the creature grid the
// torpedo-shaped pond fish. Everything not listed here stays on the procedural painter.
const MAPPING={
  0:'pumpkinseed', 1:'angelfin', 2:'crappie', 3:'perch', 4:'sunny', 5:'tetra', 6:'betta', 7:'emperium',
  8:'molly', 9:'guppy', 10:'killi', 11:'platy', 12:'koi', 13:'smelt', 14:'seraphkoi', 15:'loach', 16:'mudskip',
  17:'tadpole', 19:'stickle', 22:'spirlin', 24:'goby', 25:'ninespine', 26:'topminnow', 36:'angeling', 37:'octo',
  38:'squid', 39:'hydrasquid', 47:'kraken', 48:'colossus', 64:'oarfish', 65:'tench', 66:'bleak', 67:'lobster',
  68:'fountainfish', 69:'crucian', 70:'poring', 71:'ghostring', 72:'trout', 73:'mahi', 75:'dragonet',
  76:'coelacanth', 78:'reedeel', 79:'phoenixfish', 80:'carp', 81:'snapper', 99:'whaleshark', 105:'paddlefish',
  109:'ribbonsturgeon', 111:'beluga', 118:'greenshell', 119:'moonturtle', 120:'glassback', 121:'pupfish',
  124:'lantern', 125:'emberturtle', 127:'heartback', 128:'starhull', 129:'minnow', 130:'bitterling',
  131:'discus', 132:'dace', 133:'chub', 134:'sunperch', 135:'roach', 136:'gudgeon', 137:'dart', 138:'bream',
  139:'bass', 140:'catfish', 141:'gar', 142:'barbel', 143:'ide', 144:'piranha', 145:'zander', 146:'mullet',
  147:'salmon', 148:'arowana', 149:'marlin', 150:'staropus', 152:'candyopus', 154:'moonopus', 158:'galaxyopus',
  159:'gemsnail', 161:'shellsnail', 163:'ambernail', 167:'glasssnail', 171:'opalsnail', 175:'lavasnail',
  181:'nebulasnail', 185:'prismsnail', 211:'greatwhite', 212:'nurseshark', 213:'morayeel', 214:'catshark',
  215:'cobblewhale', 216:'hornshark', 217:'greatmaw', 218:'bluefin', 219:'baphobass', 220:'thresher',
  221:'sawfin', 222:'makoshark', 224:'leopardshark', 227:'lanternshark', 228:'carpetshark', 229:'bamboo',
  230:'stingray', 231:'goblin', 232:'abysssaw', 235:'hammerpup', 236:'hammer', 237:'ghostshark',
  239:'silvershark', 240:'porbeagle', 241:'manta', 242:'arapaima', 243:'sturgeon', 244:'mekong', 245:'voidfin',
  249:'tigershark', 250:'moonray', 251:'leviathan', 254:'sunshark', 256:'candyshrimp', 258:'voidshrimp',
  259:'krill', 260:'shrimplet', 266:'lanternshrimp', 269:'peppershrimp', 271:'crawdad', 274:'royalshrimp',
   295:'sunorca', 296:'rosedolphin', 297:'violetbeluga', 298:'greywhale', 299:'mintwhale', 300:'azurwhale',
 301:'starwhale',
 280:'seahorse', 281:'crownhorse', 284:'sunhorse', 287:'ribbonhorse', 289:'leafdragon', 291:'thornhorse',
  292:'ghosthorse', 294:'tidehorse',
};

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
  const seenHashes=new Set();
  for(const comp of out){
   const wpx=comp.maxX-comp.minX+1,hpx=comp.maxY-comp.minY+1;
   if(wpx<40||hpx<30)continue;             // letters, dots, stray specks
   if(wpx>img.width*0.92)continue;         // page-wide rules and headings
   if(sheet.clean&&comp.count<5200)continue; // the star blob and the signature line
   const art=cut(data,label,comp,img.width,img.height);
   // the same sheet was uploaded twice; drop byte-identical crops
   const hsh=require('node:crypto').createHash('md5').update(art.toBuffer('image/png')).digest('hex');
   if(seenHashes.has(hsh))continue;
   seenHashes.add(hsh);
   if(process.env.DUMP&&sheet.clean){const dd=path.join('/tmp',process.env.DUMP);fs.mkdirSync(dd,{recursive:true});fs.writeFileSync(path.join(dd,'c'+found.length+'.png'),art.toBuffer('image/png'))}
   found.push({art,sheet:sheet.label,w:wpx,h:hpx,file:sheet.file,index:found.length});
   kept++;
  }
  console.log(sheet.file,sheet.label,'->',kept,'creatures, indices',found.length-kept+'..'+(found.length-1));
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
 fs.writeFileSync(path.join(__dirname,'..','docs','fish-crop-test-haven-v303.png'),out.toBuffer('image/png'));
 console.log('wrote docs/fish-crop-test-haven-v303.png');

 // Numbered index sheet, for deciding which crop becomes which species.
 if(process.env.INDEX){
  const IC=150,IPAD=22,ICOLS=8,irows=Math.ceil(found.length/ICOLS);
  const iw=IPAD*2+ICOLS*IC,ih=IPAD*2+irows*IC;
  const ic=createCanvas(iw,ih),ig=ic.getContext('2d');
  ig.fillStyle='#0d1117';ig.fillRect(0,0,iw,ih);
  found.forEach((f,i)=>{
   const cx=IPAD+(i%ICOLS)*IC,cy=IPAD+Math.floor(i/ICOLS)*IC;
   ig.fillStyle='#1b2230';ig.beginPath();ig.roundRect?ig.roundRect(cx,cy,IC-6,IC-6,12):ig.rect(cx,cy,IC-6,IC-6);ig.fill();
   const sc=Math.min((IC-26)/f.w,(IC-26)/f.h),dw=f.w*sc,dh=f.h*sc;
   ig.drawImage(f.art,cx+(IC-6-dw)/2,cy+(IC-6-dh)/2,dw,dh);
   ig.fillStyle='#ffd24d';ig.font='bold 13px sans-serif';ig.fillText(String(i),cx+6,cy+IC-12);
  });
  fs.writeFileSync('/tmp/fish-crops-index.png',ic.toBuffer('image/png'));
  // per-sheet indices for the new uploads, so a mapping can be read off one picture at a time
  const bySheet=new Map();
  found.forEach(f=>{if(f.index>=97){if(!bySheet.has(f.file))bySheet.set(f.file,[]);bySheet.get(f.file).push(f)}});
  for(const [file,list] of bySheet){
   const PC=150,PP=20,PCOLS=6,prow=Math.ceil(list.length/PCOLS);
   const pw=PP*2+PCOLS*PC,ph=60+prow*PC;
   const pc=createCanvas(pw,ph),pg=pc.getContext('2d');
   pg.fillStyle='#0d1117';pg.fillRect(0,0,pw,ph);
   pg.fillStyle='#eef3fb';pg.font='bold 18px sans-serif';
   pg.fillText(file+' — indices '+list[0].index+'..'+list[list.length-1].index,PP,PP+6);
   list.forEach((f,i)=>{
    const cx=PP+(i%PCOLS)*PC,cy=50+Math.floor(i/PCOLS)*PC;
    pg.fillStyle='#1b2230';pg.beginPath();pg.roundRect?pg.roundRect(cx,cy,PC-6,PC-6,10):pg.rect(cx,cy,PC-6,PC-6);pg.fill();
    const sc=Math.min((PC-26)/f.w,(PC-26)/f.h),dw=f.w*sc,dh=f.h*sc;
    pg.drawImage(f.art,cx+(PC-6-dw)/2,cy+(PC-6-dh)/2,dw,dh);
    pg.fillStyle='#ffd24d';pg.font='bold 13px sans-serif';pg.fillText(String(f.index),cx+6,cy+PC-12);
   });
   fs.writeFileSync('/tmp/fish-index-'+file.replace(/\D/g,'')+'.png',pc.toBuffer('image/png'));
  }
  fs.writeFileSync('/tmp/fish-crops.json',JSON.stringify(found.map((f,i)=>({i,sheet:f.sheet,w:f.w,h:f.h,ar:+(f.w/f.h).toFixed(2)})),null,0));
  console.log('wrote /tmp/fish-crops-index.png + json');
 }

 // ---- ship-ready assets: 96x96 transparent PNGs, one per mapped species ----------------------
 const OUT=path.join(__dirname,'..','assets','social','fish');
 fs.mkdirSync(OUT,{recursive:true});
 const manifest={},mapped=[];
 const px=128;
 for(const [i,id] of Object.entries(MAPPING)){
  const f=found[+i];
  if(!f){console.log('missing crop index',i);continue}
  const c=createCanvas(px,px),g=c.getContext('2d');
  const fit=(px-6)/Math.max(f.w,f.h);
  const dw=f.w*fit,dh=f.h*fit;
  g.imageSmoothingEnabled=true;
  try{g.imageSmoothingQuality='high'}catch{}
  g.drawImage(f.art,(px-dw)/2,(px-dh)/2,dw,dh);
  fs.writeFileSync(path.join(OUT,id+'.png'),c.toBuffer('image/png'));
  manifest[id]='assets/social/fish/'+id+'.png';
  mapped.push({id,crop:+i,w:f.w,h:f.h});
 }
 fs.writeFileSync(path.join(OUT,'MANIFEST.json'),JSON.stringify(manifest,null,1));
 fs.writeFileSync('/tmp/fish-art-snippet.txt','const FISH_ART='+JSON.stringify(manifest)+';');
 console.log('wrote',mapped.length,'species assets to assets/social/fish');

 // mapping contact sheet for review: the crop and the species it now becomes
 if(process.env.INDEX){
  const MC=132,MP=22,MCOLS=8,mrows=Math.ceil(mapped.length/MCOLS);
  const mw=MP*2+MCOLS*MC,mh=120+mrows*(MC+14)+MP;
  const mc=createCanvas(mw,mh),mg=mc.getContext('2d');
  mg.fillStyle='#12161d';mg.fillRect(0,0,mw,mh);
  mg.fillStyle='#eef3fb';mg.font='bold 24px sans-serif';
  mg.fillText('Crop → species mapping',MP,MP-6);
  mg.fillStyle='#8fa0b8';mg.font='14px sans-serif';
  mg.fillText(mapped.length+' of 100 species get a real drawing; the rest are painted in the same candy style.',MP,MP+26);
  mapped.forEach((m,i)=>{
   const cx=MP+(i%MCOLS)*MC,cy=120+Math.floor(i/MCOLS)*(MC+14);
   mg.fillStyle='#1b2230';mg.beginPath();mg.roundRect?mg.roundRect(cx,cy,MC-6,MC-6,12):mg.rect(cx,cy,MC-6,MC-6);mg.fill();
   const sc=Math.min((MC-26)/m.w,(MC-26)/m.h),dw=m.w*sc,dh=m.h*sc;
   mg.drawImage(found[m.crop].art,cx+(MC-6-dw)/2,cy+(MC-6-dh)/2,dw,dh);
   mg.fillStyle='#93a2b8';mg.font='11px sans-serif';mg.textAlign='center';
   mg.fillText(m.id,cx+(MC-6)/2,cy+MC-12);mg.textAlign='left';
  });
  fs.writeFileSync('/tmp/fish-mapping.png',mc.toBuffer('image/png'));
  console.log('wrote /tmp/fish-mapping.png');
 }
})().catch(e=>{console.error(e);process.exitCode=1});
