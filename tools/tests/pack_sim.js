// Runs the game's real pack code against the real pack data, outside a browser.
//   node tools/tests/pack_sim.js   (expects the inline JS + pack block extracted first)
const fs=require('fs'),vm=require('vm');
const block=fs.readFileSync(process.env.PACK_BLOCK || '/tmp/pack_block.js','utf8');
const draws=[];
class FakeImage{constructor(){this.width=0;this.height=0}set src(u){this._src=u;if(this.onload)this.onload()}}
const ctx={imageSmoothingEnabled:true,drawImage(){draws.push(arguments)}};
const canvas={width:0,height:0,getContext(){return ctx}};
const THREE={CanvasTexture:function(cv){this.cv=cv;this.repeat={set(){}};this.offset={set(){}}},
 NearestFilter:1,Sprite:function(m){this.material=m;this.center={set(){}};this.scale={set(){}};this.userData={}},
 SpriteMaterial:function(o){this.map=o.map}};
const sandbox={window:{},document:{createElement:()=>canvas},THREE,Image:FakeImage};
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(process.env.PACK_DATA || __dirname + '/../../assets/sprite_pack_data.js','utf8'),sandbox);
vm.runInContext(block+'\nthis.__x={PACK_BODY,packTex,packCache,packBodyFor};',sandbox);
const {PACK_BODY,packTex,packCache,packBodyFor}=sandbox.__x;
const PK=sandbox.window.SPRITE_PACK;
const classes=['Novice','Swordman','Knight','Lord Knight','Mage','Wizard','High Wizard','Archer','Hunter','Sniper','Thief','Assassin','Assassin Cross','Acolyte','Priest','High Priest','Merchant','Blacksmith','Whitesmith'];
let bad=[],own=[];
for(const c of classes){
  const b=packBodyFor(c,0);
  if(!b||!PK.bodies[b]){bad.push(c+': no body');continue}
  if(b!==PACK_BODY[c])own.push(c+'->'+b);
  packCache.clear();draws.length=0;packTex({cls:c,sex:'m',hair:0,tier:0});
  if(draws.length!==240)bad.push(`${c}: ${draws.length} tiles`);
}
console.log(bad.length?('   PROBLEMS: '+bad.join(' | ')):`   OK - all ${classes.length} classes composite a full 120 body + 120 head tile atlas`);
console.log('   classes on their OWN uploaded art: '+(own.length?own.join(', '):'none'));
console.log('   bodies in pack ('+Object.keys(PK.bodies).length+'): '+Object.keys(PK.bodies).join(' '));
