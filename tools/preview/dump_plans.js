// tools/preview/dump_plans.js — dump the ten map plans the game really builds.
//   node tools/preview/dump_plans.js [out.json] [stage=1]
//
// It pulls the kit block straight out of `index.html` (the same string-boundary grab the test
// suites use) and runs `kitPlan(m, stage)` in a VM with only the geometry the plan needs. The JSON it
// writes is what `render_plans.py` paints into a top-down PNG so a layout change can be looked at
// without a browser. Nothing here is shipped to the player and nothing here draws art.
const fs = require('fs'), vm = require('vm'), path = require('path');
const R = path.join(__dirname, '..', '..');
const src = fs.readFileSync(path.join(R, 'index.html'), 'utf8');
const grab = (a, b) => { const i = src.indexOf(a), j = src.indexOf(b, i); if (i < 0 || j < 0) throw new Error('missing ' + a); return src.slice(i, j); };

const PAY = JSON.parse(fs.readFileSync(path.join(R, 'assets/kit/ro-map-payon.json'), 'utf8'));
const MOR = JSON.parse(fs.readFileSync(path.join(R, 'assets/kit/ro-map-morocc.json'), 'utf8'));
const MAN = JSON.parse(fs.readFileSync(path.join(R, 'assets/kit/ro-spritesheet.json'), 'utf8'));

const code = grab('// ----- The map kit', '// ----- Ragnarok-style 8-dir sprites');
const harness = `
const MANJ=__MAN__,MORJ=__MOR__,PAYJ=__PAY__;
class Col{constructor(){this.hex=0}setHex(h){this.hex=h;return this}lerp(){return this}multiplyScalar(){return this}}
class Mat{constructor(o){Object.assign(this,o||{});this.map=(o&&o.map)||null;this.color=new Col();this.emissive=new Col();this.needsUpdate=false}}
class Obj{constructor(){this.children=[];this.position={x:0,y:0,z:0,set(){}};this.rotation={x:0,y:0,z:0,set(){}};this.scale={x:1,y:1,z:1,set(){}};this.visible=true;this.userData={}}
  add(o){this.children.push(o);return this}remove(o){const i=this.children.indexOf(o);if(i>=0)this.children.splice(i,1)}}
class Tex{constructor(img){this.image=img;this.repeat={x:1,y:1,set(a,b){this.x=a;this.y=b}};this.needsUpdate=false;this.anisotropy=1}clone(){return new Tex(this.image)}}
const THREE={CanvasTexture:Tex,NearestFilter:1,LinearMipMapLinearFilter:2,RepeatWrapping:3,
  Mesh:class extends Obj{constructor(g,m){super();this.geometry=g;this.material=m}},
  Sprite:class extends Obj{constructor(m){super();this.material=m;this.center={x:.5,y:0,set(a,b){this.x=a;this.y=b}}}},
  PlaneGeometry:class{constructor(w,h){this.w=w;this.h=h}},MeshLambertMaterial:Mat,SpriteMaterial:Mat};
const fakeCanvas=()=>({width:0,height:0,getContext:()=>({imageSmoothingEnabled:true,set fillStyle(v){this._f=v},get fillStyle(){return this._f},
  createPattern:()=>({pat:1}),fillRect(){},drawImage(){},translate(){},scale(){},save(){},restore(){}})});
const document={createElement:()=>fakeCanvas()};
const scene=new Obj(),deco=new Obj();scene.add(deco);
const BX_=13,Z0=-28,Z1=12;

${code}
KIT.png={};KIT.man=MANJ;KIT.des={payon:PAYJ,morocc:MORJ};KIT.ok=1;
this.__p={plan:(m,l=1)=>kitPlan(m,l),KIT,KIT_MAP};
`;
const sb = { console, Promise, Image: function () { this.onload = null; this.onerror = null; }, fetch: () => ({ then: () => ({ catch: () => ({}) }) }) };
vm.createContext(sb);
vm.runInContext(harness.replace('__MAN__', JSON.stringify(MAN)).replace('__MOR__', JSON.stringify(MOR))
  .replace('__PAY__', JSON.stringify(PAY)), sb);

const out = { arena: { BX: 13, Z0: -28, Z1: 12, far: 90 }, maps: {} };
for (let m = 0; m < 10; m++) {
  const p = sb.__p.plan(m, Number(process.argv[3] || 1));
  if (!p) { console.error('map ' + m + ' has no plan'); process.exit(1); }
  out.maps[m] = { base: p.base, base2: p.base2, cells: p.cells, water: p.water, props: p.props, deck: p.deck };
}
const dest = process.argv[2] || '/tmp/plans.json';
fs.writeFileSync(dest, JSON.stringify(out));
const tally = p => p.props.reduce((a, x) => (a[x.type] = (a[x.type] || 0) + 1, a), {});
for (let m = 0; m < 10; m++) {
  const p = out.maps[m], xs = p.props.map(x => Math.abs(x.x));
  console.log('map ' + m + ': ' + p.cells.length + ' cells, ' + p.props.length + ' props, ' +
    'x span ' + Math.min(...xs).toFixed(1) + '-' + Math.max(...xs).toFixed(1) + ', z span ' +
    Math.min(...p.props.map(x => x.z)).toFixed(1) + '..' + Math.max(...p.props.map(x => x.z)).toFixed(1));
}
console.log('wrote ' + dest);
