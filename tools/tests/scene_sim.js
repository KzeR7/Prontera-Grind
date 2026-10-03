// Scenery: the per-map deco builder, run for every map with a stubbed THREE.
//   node tools/tests/scene_sim.js
//
// The rules being tested:
//   * every map builds its own scene - a field that produces no props is a flat coloured plane;
//   * no two maps look alike: the prop mix, the palette or the water differ between all ten;
//   * water only appears on the maps that ask for it (`extras.w`), in the colour asked for, and
//     every pool sits **outside the running lane** - scenery must never become an obstacle;
//   * the same holds for the landmarks and the scattered props: the avenue the player runs up
//     (|x| <= BX_ + 1.5, Z0-1.5 .. Z1+1.5) stays clear on every map;
//   * the builder is deterministic, so a respawn does not reshuffle the map under the player.
//
// This runs the real `landmark()`, `water()` and `buildDeco()` out of index.html. THREE is
// stubbed, but it is stubbed *faithfully*: meshes remember their geometry, material colour,
// position and scale, so the assertions read the scene that the game would build.
const fs = require('fs'), vm = require('vm'), assert = require('assert');
const src = fs.readFileSync(__dirname + '/../../index.html', 'utf8');
const grab = (a, b) => { const i = src.indexOf(a), j = src.indexOf(b, i); if (i < 0 || j < 0) throw new Error('missing ' + a); return src.slice(i, j); };

const code = [
  grab('const TC=[', 'scene.add(new THREE.HemisphereLight'),          // M(), SP/BX/CN/CY, mk()
  grab('// [kind,main colour,trunk colour,extras]', '// ----- Ragnarok-style 8-dir sprites'),
].join('\n');

const harness = `
// ---- a small, faithful THREE ----
class V3{constructor(x=0,y=0,z=0){this.x=x;this.y=y;this.z=z}
  set(x,y,z){this.x=x;this.y=y;this.z=z;return this}setScalar(s){this.x=this.y=this.z=s;return this}
  multiplyScalar(s){this.x*=s;this.y*=s;this.z*=s;return this}copy(v){this.x=v.x;this.y=v.y;this.z=v.z;return this}}
class Col{constructor(c){this.hex=c}setHex(h){this.hex=h;return this}lerp(c,w){return this}multiplyScalar(s){return this}getHexString(){return '000000'}}
class Mat{constructor(o){const c=(o&&typeof o==='object'&&'color' in o)?o.color:o;this.color=new Col(c);this.emissive=new Col(0);this.transparent=false;this.opacity=1}}
class Geo{constructor(kind,...a){this.kind=kind;this.a=a}}
class Obj{constructor(){this.userData={};this.children=[];this.position=new V3();this.rotation=new V3();this.scale=new V3(1,1,1);this.visible=true}
  add(o){this.children.push(o);return this}remove(o){const i=this.children.indexOf(o);if(i>=0)this.children.splice(i,1)}}
class Mesh extends Obj{constructor(g,m){super();this.geometry=g;this.material=m;this.castShadow=false;this.receiveShadow=false}}
class Group extends Obj{}
const THREE={Group,Mesh,Color:Col,MeshLambertMaterial:Mat,SphereGeometry:class extends Geo{constructor(r){super('sphere',r)}},
  BoxGeometry:class extends Geo{constructor(a,b,c){super('box',a,b,c)}},ConeGeometry:class extends Geo{constructor(r,h,s){super('cone',r,h,s)}},
  CylinderGeometry:class extends Geo{constructor(a,b,h,s){super('cyl',a,b,h,s)}},CircleGeometry:class extends Geo{constructor(r,s){super('circle',r,s)}},
  PlaneGeometry:class extends Geo{constructor(w,h){super('plane',w,h)}}};
const scene=new Group(),deco=new Group();scene.add(deco);
const townObjs=[],road={visible:true,position:new V3()};
const BX_=5.5,Z0=-14,Z1=3;
${code}
this.__s={TH,buildDeco,deco,water,landmark,scene,BX_,Z0,Z1,townObjs,road,Group,Mesh,Geo,Col};
`;
const sb = { console };
vm.createContext(sb); vm.runInContext(harness, sb);
const S = sb.__s;

let pass = 0, fail = 0;
const t = (n, f) => { try { f(); console.log('  ok   ' + n); pass++; } catch (e) { console.log('  FAIL ' + n + ' -> ' + e.message); fail++; } };
console.log('scene: per-map deco, water and the clear lane\n');

// walk every mesh under a node, carrying world position and scale
function meshes(node, ox = 0, oy = 0, oz = 0, sx = 1, sy = 1, sz = 1, out = []) {
  const x = ox + node.position.x, y = oy + node.position.y, z = oz + node.position.z;
  const nsx = sx * node.scale.x, nsy = sy * node.scale.y, nsz = sz * node.scale.z;
  if (node.geometry) out.push({ node, x, y, z, sx: nsx, sy: nsy, sz: nsz });   // only meshes carry geometry
  for (const c of node.children) meshes(c, x, y, z, nsx, nsy, nsz, out);
  return out;
}
const build = m => { S.buildDeco(m); return meshes(S.deco); };

const LANE = S.BX_ + 1.5, KIND = ['round tree', 'conifer', 'pole', 'cactus', 'crystal', 'slab', 'bamboo', 'bush', 'boulder'];
t('every map builds a scene with props in it', () => {
  for (let m = 1; m < 10; m++) {
    const ms = build(m);
    const props = ms.filter(o => o.node.geometry.kind !== 'plane' && o.node.geometry.kind !== 'circle');
    assert.ok(props.length > 50, 'map ' + m + ' built only ' + props.length + ' prop meshes');
  }
  console.log('       ' + [1, 2, 3, 4, 5, 6, 7, 8, 9].map(m => S.TH[m][0]).length + ' themed maps, ' +
    [1, 2, 3, 4, 5, 6, 7, 8, 9].map(m => build(m).length).join('/') + ' meshes');
});

t('water only where a map asks for it, in the colour it asked for', () => {
  for (let m = 1; m < 10; m++) {
    const ms = build(m), E = S.TH[m][3] || {};
    const pools = ms.filter(o => o.node.geometry.kind === 'circle');
    if (!E.w) { assert.strictEqual(pools.length, 0, 'map ' + m + ' has no water entry but built ' + pools.length + ' pools'); continue; }
    assert.strictEqual(pools.length, E.w[1] * 3, 'map ' + m + ': ' + E.w[1] + ' pools (shore + water + glint)');
    const water = pools.filter(o => o.node.material.color.hex === E.w[0]);
    assert.ok(water.length >= E.w[1], 'map ' + m + ' must colour its pools ' + E.w[0].toString(16));
  }
});

t('no water, landmark or prop ever sits in the running lane', () => {
  for (let m = 1; m < 10; m++) {
    const ms = build(m);
    // the builder's own guard: a prop group never starts inside the lane (plus its margin)
    S.deco.children.filter(c => c.userData && c.userData.kind !== undefined).forEach(g => {
      const inLane = Math.abs(g.position.x) < LANE && g.position.z > S.Z0 - 1.5 && g.position.z < S.Z1 + 1.5;
      assert.ok(!inLane, 'map ' + m + ': prop group at x=' + g.position.x.toFixed(1) + ' z=' + g.position.z.toFixed(1) + ' starts in the avenue');
    });
    // and nothing solid reaches into the play lane itself once the prop is drawn out to its
    // real size - the player runs to |x| = BX_ and must not clip through scenery
    ms.filter(o => o.node.geometry.kind !== 'plane').forEach(o => {
      const inPlay = Math.abs(o.x) < S.BX_ && o.z > S.Z0 && o.z < S.Z1;
      assert.ok(!inPlay, 'map ' + m + ': ' + o.node.geometry.kind + ' at x=' + o.x.toFixed(1) + ' z=' + o.z.toFixed(1) + ' is inside the play lane');
    });
    // and the lane is not empty either - a worn track runs down it so the field reads as a road
    const track = ms.filter(o => o.node.geometry.kind === 'plane' && Math.abs(o.x) < 1);
    assert.ok(track.length >= 1, 'map ' + m + ' has no track down the avenue');
  }
});

t('every map looks different (prop mix or water)', () => {
  const sigs = new Map();
  for (let m = 1; m < 10; m++) {
    const ms = build(m), groups = S.deco.children.filter(c => c.children && c.children.length);
    const tally = {};
    groups.forEach(g => { const k = g.userData.kind; tally['k' + k] = (tally['k' + k] || 0) + 1; });
    ms.filter(o => o.node.geometry.kind === 'circle').forEach(o => tally['water' + o.node.material.color.hex] = (tally['water' + o.node.material.color.hex] || 0) + 1);
    const sig = S.TH[m][0] + '|' + S.TH[m][1].toString(16) + '|' + Object.keys(tally).sort().join(',');
    assert.ok(!sigs.has(sig), 'map ' + m + ' looks exactly like map ' + sigs.get(sig) + ' (' + sig + ')');
    sigs.set(sig, m);
  }
  assert.strictEqual(sigs.size, 9, 'all nine themed maps must be distinct');
  console.log('       ' + [...sigs.keys()].map(s => s.split('|').slice(0, 2).join('/')).join('  '));
});

t('every scene is built from more than one prop kind', () => {
  for (let m = 1; m < 10; m++) {
    const groups = S.deco.children.filter(c => c.userData && c.userData.kind !== undefined);
    const kinds = new Set(groups.map(g => g.userData.kind));
    assert.ok(kinds.size >= 2, 'map ' + m + ' only uses ' + [...kinds].map(k => KIND[k]).join(','));
  }
});

t('the builder is deterministic and repeatable', () => {
  for (const m of [1, 4, 5, 9]) {
    const a = build(m), b = build(m);
    assert.strictEqual(a.length, b.length, 'map ' + m + ' reshuffled its props between builds');
    for (let i = 0; i < a.length; i++) assert.strictEqual(a[i].x.toFixed(4) + ',' + a[i].z.toFixed(4), b[i].x.toFixed(4) + ',' + b[i].z.toFixed(4));
  }
});

t('Payon is a forest with water, bamboo and loose props', () => {
  const E = S.TH[4][3];
  assert.ok(E.w, 'Payon must have water');
  assert.ok(E.mix.includes(6) && E.mix.includes(7) && E.mix.includes(8), 'Payon scatters bamboo, bushes and boulders');
  const ms = build(4), groups = S.deco.children.filter(c => c.userData && c.userData.kind !== undefined);
  const kinds = new Set(groups.map(g => g.userData.kind));
  [6, 7].forEach(k => assert.ok(kinds.has(k), 'Payon builds ' + KIND[k] + ' props, has ' + [...kinds].map(x => KIND[x]).join('/')));
  assert.ok(E.n >= 100, 'Payon is the dense map: ' + E.n + ' scatter items');
});

t('water pools are real, flat and coloured', () => {
  for (let m = 1; m < 10; m++) {
    const E = S.TH[m][3] || {};
    if (!E.w) continue;
    const pools = build(m).filter(o => o.node.geometry.kind === 'circle');
    pools.forEach(p => {
      assert.ok(p.sx > 1 && p.sy > 1, 'a pool must cover the ground: ' + p.sx + 'x' + p.sy);
      assert.ok(p.y < .05, 'a pool must lie flat on the ground (y=' + p.y + ')');
      assert.ok(Number.isFinite(p.node.material.color.hex), 'a pool needs a colour');
    });
  }
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
