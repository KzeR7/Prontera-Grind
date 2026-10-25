// Dev-only: render a contact sheet of every boss skill effect, straight from assets/boss-fx.js.
//
//   npm install --no-save --package-lock=false @napi-rs/canvas
//   node tools/render_boss_fx_sheet.js [out.png] [seconds]
//
// It loads the real module and calls PGBossFx.create(canvas).draw() with a projector that mimics
// the game camera (3.05 world units -> 120 px), paints one frame per skill on its map's sky/ground,
// and writes a single PNG. Nothing here ships: tools/ is excluded from the published build.
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
let createCanvas=null;
try{({createCanvas}=require('@napi-rs/canvas'))}catch(e){
  console.log('render_boss_fx_sheet: skipped (npm install --no-save @napi-rs/canvas)');process.exit(0);
}
const root=path.resolve(__dirname,'..');
const out=process.argv[2]||path.join(root,'Updates/boss-skill-fx/sheet-all-moves.png');
const at=Number(process.argv[3]||0.46);            // fraction of each move's life to capture
const box={console,Math,document:{createElement:()=>createCanvas(96,96)},devicePixelRatio:1};
vm.createContext(box);
vm.runInContext(fs.readFileSync(path.join(root,'assets/boss-fx.js'),'utf8'),box);
const ev=code=>vm.runInContext(code,box);
const fx=ev('PGBossFx');
const SKY=['#8ecff5','#8ee0f0','#9a90c8','#f0d9a0','#8fc8a0','#7fe0e0','#c8e0a0','#f0c0d8','#4a3a5a','#1a1020','#100c23','#230c10'];
const GROUND=['#7cc46a','#6fc2b0','#8c8caa','#dcc78e','#4f8f4a','#3fae9a','#7aa85a','#d88aa8','#6a6a8a','#3a2a3a','#302b42','#231715'];
const vw=620,vh=388,cols=3;
const ids=fx.BOSSES.flatMap(b=>b.skills.map(s=>s.id));
const rows=Math.ceil(ids.length/cols);
const sheet=createCanvas(cols*vw,rows*vh),sheetCtx=sheet.getContext('2d');
const field=createCanvas(vw,vh),fieldCtx=field.getContext('2d');
const layerCanvas=createCanvas(vw,vh);
const layer=fx.create(layerCanvas);
ids.forEach((id,i)=>{
  const s=fx.spec(id),x=(i%cols)*vw,y=Math.floor(i/cols)*vh;
  const grad=fieldCtx.createLinearGradient(0,0,0,vh*.61);
  grad.addColorStop(0,SKY[s.map]);grad.addColorStop(1,SKY[s.map]);
  fieldCtx.fillStyle=grad;fieldCtx.fillRect(0,0,vw,vh*.61);
  fieldCtx.fillStyle=GROUND[s.map];fieldCtx.fillRect(0,vh*.61,vw,vh*.39);
  fieldCtx.globalAlpha=.1;fieldCtx.strokeStyle='#000';
  for(let g=0;g<16;g++){const gy=vh*.61+g*g*.5;fieldCtx.beginPath();fieldCtx.moveTo(0,gy);fieldCtx.lineTo(vw,gy);fieldCtx.stroke()}
  fieldCtx.globalAlpha=1;
  const ctx=layerCanvas.getContext('2d');
  ctx.clearRect(0,0,vw,vh);
  layer.draw([{id,age:s.life*at,x:0,z:0,seed:9,scale:1}],vw,vh,(px,py,pz)=>[vw/2,vh*.66-py*40],1,1);
  fieldCtx.drawImage(layerCanvas,0,0);
  sheetCtx.drawImage(field,x,y);
  sheetCtx.fillStyle='rgba(0,0,0,.5)';sheetCtx.fillRect(x,y,300,22);
  sheetCtx.fillStyle='#fff';sheetCtx.font='700 13px sans-serif';
  sheetCtx.fillText(`${s.boss} · ${s.name} (T${s.tier})`,x+8,y+15);
});
fs.mkdirSync(path.dirname(out),{recursive:true});
fs.writeFileSync(out,sheet.toBuffer('image/png'));
console.log('wrote '+out+' ('+ids.length+' moves)');
