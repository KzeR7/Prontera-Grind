#!/usr/bin/env node
// Field sheet: every boss move composited over the real Prontera field capture, at true game scale,
// so crispness and "does this leave a hard edge on the ground" can be judged against the actual
// battlefield instead of a transparent checkerboard.
//
//   node tools/render_boss_fx_field_sheet.js Updates/boss-skill-fx/sheet-field.png
//   node tools/render_boss_fx_field_sheet.js out.png bj_jelly,dk_cross 3 250
//
// One row per move; `cols` frames of that move (spread over its life) sit side by side.
// Needs @napi-rs/canvas:  npm install --no-save --package-lock=false @napi-rs/canvas
const fs=require('fs'),vm=require('vm'),path=require('path');
const root=path.join(__dirname,'..');
let canvas;
try{canvas=require('@napi-rs/canvas')}catch(e){
  console.error('render_boss_fx_field_sheet: needs @napi-rs/canvas — npm install --no-save @napi-rs/canvas');
  process.exit(2);
}
const {createCanvas,loadImage}=canvas;

const outFile=process.argv[2]||path.join(root,'Updates/boss-skill-fx/sheet-field.png');
const idArg=process.argv[3]||'';
const cols=Math.max(1,+(process.argv[4]||2));
const rowH=Math.max(120,+(process.argv[5]||250));
const cellW=700;

// The module boots without a DOM as long as a 2d context can be produced from document.createElement.
const box={console,Math,document:{createElement:()=>createCanvas(96,96)},devicePixelRatio:1};
vm.createContext(box);
vm.runInContext(fs.readFileSync(path.join(root,'assets/boss-fx.js'),'utf8'),box);
const fx=vm.runInContext('PGBossFx',box);

const ids=idArg?idArg.split(',').filter(Boolean):fx.BOSSES.flatMap(b=>b.skills.map(s=>s.id));
const specs=ids.map(id=>{const s=fx.spec(id);if(!s){console.error('unknown move id:',id);process.exit(1)}return s});

(async()=>{
  const bg=await loadImage(path.join(root,'tools/skill-fx-proposals/prontera-field.webp'));
  const SW=bg.width,SH=bg.height;                       // 1440 x 841
  const AX=SW*.5,AY=SH*.66;                             // the hero's feet in that capture
  const project=(x,y)=>[AX,AY-y*(120/3.05)];            // same reference camera the game uses
  const sheet=createCanvas(cellW*cols,specs.length*rowH),sctx=sheet.getContext('2d');
  const layerC=createCanvas(SW,SH),lctx=layerC.getContext('2d');
  const layer=fx.create(layerC);

  specs.forEach((s,row)=>{
    for(let i=0;i<cols;i++){
      const frac=cols===1?.46:.34+.28*i/(cols-1);
      const age=frac*s.life;
      lctx.clearRect(0,0,SW,SH);
      layer.draw([{id:s.id,age,x:0,z:0,seed:13,scale:1}],SW,SH,project,1,1);
      const sx=AX-cellW/2, sy=Math.max(0,AY-rowH*.72);
      sctx.drawImage(bg,sx,sy,cellW,rowH,i*cellW,row*rowH,cellW,rowH);
      sctx.drawImage(layerC,sx,sy,cellW,rowH,i*cellW,row*rowH,cellW,rowH);
      sctx.fillStyle='rgba(0,0,0,.5)';sctx.fillRect(i*cellW,row*rowH,230,20);
      sctx.fillStyle='#fff';sctx.font='700 13px sans-serif';
      sctx.fillText(`${s.boss} · ${s.name} t=${age.toFixed(2)}`,i*cellW+6,row*rowH+14);
    }
  });
  fs.mkdirSync(path.dirname(outFile),{recursive:true});
  fs.writeFileSync(outFile,sheet.toBuffer('image/png'));
  console.log('wrote',outFile,sheet.width+'x'+sheet.height);
})();
