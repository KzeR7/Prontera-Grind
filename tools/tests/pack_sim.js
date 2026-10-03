// Runs the game's real pack code against the real pack data, outside a browser.
//   node tools/tests/pack_sim.js   (expects the inline JS + pack block extracted first)
const fs=require('fs'),vm=require('vm'),assert=require('assert');
const block=fs.readFileSync(process.env.PACK_BLOCK || '/tmp/pack_block.js','utf8');
const draws=[];
class FakeImage{constructor(){this.width=0;this.height=0}set src(u){this._src=u;if(this.onload)this.onload()}}
const ctx={imageSmoothingEnabled:true,drawImage(){draws.push(arguments)}};
const canvas={width:0,height:0,getContext(){return ctx}};
const THREE={CanvasTexture:function(cv){this.cv=cv;this.image=cv;this.repeat={set(){}};this.offset={set(){}}},
 NearestFilter:1,Sprite:function(m){this.material=m;this.center={set(){}};this.scale={set(){}};this.userData={}},
 SpriteMaterial:function(o){this.map=o.map}};
const sandbox={window:{},document:{createElement:()=>canvas},$:()=>null,S:null,C:()=>({n:'Archer',tier:1}),THREE,Image:FakeImage};
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(process.env.PACK_DATA || __dirname + '/../../assets/sprite_pack_data.js','utf8'),sandbox);
vm.runInContext(block+'\nthis.__x={PACK_BODY,packTex,packCache,packBodyFor,drawHairPreview};',sandbox);
const {PACK_BODY,packTex,packCache,packBodyFor,drawHairPreview}=sandbox.__x;
const PK=sandbox.window.SPRITE_PACK;
const classes=['Novice','Swordman','Knight','Lord Knight','Mage','Wizard','High Wizard','Archer','Hunter','Sniper','Thief','Assassin','Assassin Cross','Acolyte','Priest','High Priest','Merchant','Blacksmith','Whitesmith'];
let bad=[],own=[];
for(const c of classes){
  const b=packBodyFor(c,0);
  if(!b||!PK.bodies[b]){bad.push(c+': no body');continue}
  if(b!==PACK_BODY[c])own.push(c+'->'+b);
  packCache.clear();draws.length=0;packTex({cls:c,sex:'m',hair:0,tier:0});
  if(draws.length!==240)bad.push(`${c}: ${draws.length} tiles`);
  const anchors=PK.bodies[b].anchors;let call=1;
  for(let a=0;a<3;a++)for(let d=0;d<8;d++)for(let f=0;f<PK.frames[a];f++){
    const args=Array.from(draws[call]),an=anchors[a][d][f];
    assert.strictEqual(args[1],d*64,`${c} head source direction ${d}`);
    assert.strictEqual(args[2],0,`${c} male hair row`);
    assert.strictEqual(args[5],f*PK.cellW+PK.padL+an[0]-32,`${c} head attach x at a${a}/d${d}/f${f}`);
    assert.strictEqual(args[6],(a*8+d)*PK.cellH+PK.padT+an[1]-48,`${c} head attach y at a${a}/d${d}/f${f}`);
    call+=2;
  }
}
const previewCalls=[],previewCtx={imageSmoothingEnabled:true,clearRect(){},drawImage(...args){previewCalls.push(args)}},
      previewCanvas={width:126,height:134,getContext(){return previewCtx}},previewLabel={style:{}};
sandbox.$=id=>id==='hairPreview'?previewCanvas:id==='hairPreviewLoading'?previewLabel:null;
sandbox.S={cls:'Archer',sex:'f',hair:3};drawHairPreview();
const preview=packCache.get('archer|female|3');
assert.ok(preview&&preview.image,'Settings must reuse a real packed female hairstyle texture');
assert.strictEqual(previewCalls.length,1,'the preview draws one composed front/idle cell');
assert.strictEqual(previewCalls[0][0],preview.image,'the selected class, gender and hair combination is what gets shown');
assert.deepStrictEqual(Array.from(previewCalls[0]).slice(1),[0,0,126,134,0,0,126,134]);
assert.strictEqual(previewLabel.style.display,'none','the loading message hides after the pack is ready');
console.log('   OK - Settings draws the selected female hair from the packed Archer sprite');
console.log(bad.length?('   PROBLEMS: '+bad.join(' | ')):`   OK - all ${classes.length} classes composite a full 120 body + 120 head tile atlas`);
console.log('   classes on their OWN uploaded art: '+(own.length?own.join(', '):'none'));
console.log('   bodies in pack ('+Object.keys(PK.bodies).length+'): '+Object.keys(PK.bodies).join(' '));
