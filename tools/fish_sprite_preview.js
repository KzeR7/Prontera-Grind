// Review sheet: renders all 100 species through the game's own fishSprite(), so the crop loader and
// the painted fallback are exercised exactly as the pond draws them.
//   node tools/fish_sprite_preview.js
// Writes docs/fish-sprites-haven-v302.png and docs/fish-mutations-haven-v302.png
const path=require('node:path'),fs=require('node:fs');
const napi=require('@napi-rs/canvas');
const proto=Object.getPrototypeOf(napi.createCanvas(1,1).getContext('2d'));
const origDraw=proto.drawImage;
proto.drawImage=function(img,...rest){if(img&&img.__napi)img=img.__napi;return origDraw.call(this,img,...rest)};

global.document={createElement(tag){if(tag!=='canvas')return {};const c=napi.createCanvas(96,96);return c}};
let pending=0;
global.Image=class{
 constructor(){this.width=this.height=0}
 set src(v){
  pending++;
  const file=v.split('?')[0];
  napi.loadImage(path.join(__dirname,'..',file)).then(img=>{
   this.__napi=img;this.width=img.width;this.height=img.height;pending--;
   this.onload&&this.onload();
  }).catch(()=>{pending--});
 }
};
const F=require(path.join(__dirname,'..','assets','social-fishing.js'));
(async()=>{
 const t0=Date.now();
 while(pending>0||Date.now()-t0<300)await new Promise(r=>setTimeout(r,20));
 const COLS=10,CELL=112,ids=F.SPECIES.map(s=>s.id);
 const rows=Math.ceil(ids.length/COLS);
 const W=COLS*CELL+40,H=rows*CELL+90;
 const out=napi.createCanvas(W,H),g=out.getContext('2d');
 g.fillStyle='#12161d';g.fillRect(0,0,W,H);
 g.fillStyle='#eef3fb';g.font='bold 22px sans-serif';
 const art=Object.keys(require(path.join(__dirname,'..','assets','social','fish','MANIFEST.json'))).length;
 g.fillText('fishSprite() end to end — '+art+' crops, '+(ids.length-art)+' painted, in one grid',20,36);
 ids.forEach((id,i)=>{
  const cx=20+(i%COLS)*CELL,cy=60+Math.floor(i/COLS)*CELL;
  g.fillStyle='#1b2230';g.beginPath();g.roundRect?g.roundRect(cx,cy,CELL-8,CELL-8,12):g.rect(cx,cy,CELL-8,CELL-8);g.fill();
  const sp=F.fishSprite(id,null,96);
  if(sp)g.drawImage(sp,cx+8,cy+4,CELL-24,CELL-24);
  else{const c=napi.createCanvas(96,96),cc=c.getContext('2d');cc.font='52px serif';cc.textAlign='center';cc.fillStyle='#fff';cc.fillText(F.speciesById(id).glyph,48,66);g.drawImage(c,cx+8,cy+4,CELL-24,CELL-24)}
  g.fillStyle='#93a2b8';g.font='10px sans-serif';g.textAlign='center';
  g.fillText(id,cx+(CELL-8)/2,cy+CELL-14);g.textAlign='left';
 });
 fs.writeFileSync(path.join(__dirname,'..','docs','fish-sprites-haven-v302.png'),out.toBuffer('image/png'));
 // mutation sanity: golden / frozen / ghostly on a cropped and a painted species
 const MC=120;
 const m=napi.createCanvas(MC*6+40,MC+40),mg=m.getContext('2d');
 mg.fillStyle='#12161d';mg.fillRect(0,0,m.width,m.height);
 const cases=[['koi',null],['koi','golden'],['koi','frozen'],['greatwhite',null],['greatwhite','golden'],['greatwhite','ghostly']];
 cases.forEach(([id,mut],i)=>{
  const c=F.fishSprite(id,mut,96);if(c)mg.drawImage(c,20+i*MC,20,96,96);
  mg.fillStyle='#93a2b8';mg.font='12px sans-serif';mg.fillText(id+(mut?' · '+mut:''),20+i*MC,132);
 });
 fs.writeFileSync(path.join(__dirname,'..','docs','fish-mutations-haven-v302.png'),m.toBuffer('image/png'));
 console.log('ok, images settled:',pending===0);
})();
