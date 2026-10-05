// Runs the game's real pack code against the real pack data, outside a browser.
//   node tools/tests/pack_sim.js
// The block is read straight out of index.html (the same region the browser runs); set PACK_BLOCK
// to a file to test a different extraction.
const fs=require('fs'),vm=require('vm'),assert=require('assert'),path=require('path');
const block=process.env.PACK_BLOCK?fs.readFileSync(process.env.PACK_BLOCK,'utf8'):(()=>{
  const page=fs.readFileSync(path.join(__dirname,'..','..','index.html'),'utf8');
  const from=page.indexOf('const PACK_BODY='),to=page.indexOf('function ensureHero(',from);
  assert.ok(from>0&&to>from,'index.html must still carry the pack block (const PACK_BODY= ... function ensureHero()');
  return page.slice(from,to)})();
const draws=[];
class FakeImage{constructor(){this.width=0;this.height=0}set src(u){this._src=u;if(this.onload)this.onload()}}
const ctx={imageSmoothingEnabled:true,drawImage(){draws.push(arguments)}};
const canvas={width:0,height:0,getContext(){return ctx}};
const THREE={CanvasTexture:function(cv){this.cv=cv;this.image=cv;this.repeat={set(a,b){this.x=a;this.y=b}};this.offset={set(a,b){this.x=a;this.y=b}};this.clone=function(){const c=new THREE.CanvasTexture(cv);return c}},
 NearestFilter:1,Sprite:function(m){this.material=m;this.center={set(){}};this.scale={set(){}};this.userData={}},
 SpriteMaterial:function(o){this.map=o.map}};
const sandbox={window:{},document:{createElement:()=>canvas},$:()=>null,S:null,C:()=>({n:'Archer',tier:1}),THREE,Image:FakeImage};
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(process.env.PACK_DATA || __dirname + '/../../assets/sprite_pack_data.js','utf8'),sandbox);
vm.runInContext(block+'\nthis.__x={PACK_BODY,packTex,packCache,packBodyFor,mkPackHero};',sandbox);
const {PACK_BODY,packTex,packCache,packBodyFor,mkPackHero}=sandbox.__x;
const PK=sandbox.window.SPRITE_PACK;
const classes=['Novice','Swordman','Knight','Lord Knight','Mage','Wizard','High Wizard','Archer','Hunter','Sniper','Thief','Assassin','Assassin Cross','Acolyte','Priest','High Priest','Merchant','Blacksmith','Whitesmith'];
const classSkins={Novice:'novice',Swordman:'swordman',Knight:'knight','Lord Knight':'lord_knight',Mage:'mage',Wizard:'wizard','High Wizard':'high_wizard',Archer:'archer',Hunter:'hunter',Sniper:'sniper',Thief:'thief',Assassin:'assassin','Assassin Cross':'assassin_cross',Acolyte:'aco',Priest:'priest','High Priest':'high_priest',Merchant:'merchant',Blacksmith:'blacksmith',Whitesmith:'whitesmith'};
let bad=[],own=[];
for(const c of classes){
  const b=packBodyFor(c,0);
  const classSkin=classSkins[c];
  assert.ok(PK.bodies[classSkin],`${c} must have its own uploaded animated class skin`);
  assert.strictEqual(b,classSkin,`${c} must resolve to its own matching animated skin`);
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
// The pack is the fallback art now (the class skins are what the hero wears - see
// class_skin_sim.js), so what matters here is that a packed hero still carries its class body
// and the single 126x134 cell the rest of the renderer reads.
sandbox.S={cls:'Archer',sex:'f',hair:3};
const hero=mkPackHero({cls:'Archer',sex:'f',hair:3,tier:1});
assert.strictEqual(hero.userData.pack,1,'a packed hero is marked as pack art');
assert.strictEqual(hero.userData.body,'archer','and remembers which class body it wears');
assert.deepStrictEqual([hero.material.map.repeat.x,hero.material.map.repeat.y],[1/8,1/24],'one frame cell of the 8x24 atlas');
console.log('   OK - the animated pack still composes as the fallback hero art (Settings previews the skins)');
console.log(bad.length?('   PROBLEMS: '+bad.join(' | ')):`   OK - all ${classes.length} classes composite a full 120 body + 120 head tile atlas`);
console.log('   classes on their OWN uploaded art: '+(own.length?own.join(', '):'none'));
console.log('   bodies in pack ('+Object.keys(PK.bodies).length+'): '+Object.keys(PK.bodies).join(' '));
