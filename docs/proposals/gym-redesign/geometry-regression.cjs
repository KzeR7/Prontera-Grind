/* Run with Node where the repo's three r128 dependency is installed. */
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const T=require('three');
const source=fs.readFileSync(__dirname+'/gym-redesign.js','utf8');
const start=source.indexOf('function mergeInto(geos){');
const end=source.indexOf('\nfunction box(',start);
assert(start>=0&&end>start,'mergeInto source anchors');
const context={T};vm.createContext(context);
vm.runInContext(source.slice(start,end),context);
const inputs=[
  new T.LatheGeometry([new T.Vector2(0,0),new T.Vector2(.4,0),new T.Vector2(.3,3),new T.Vector2(0,3)],9),
  new T.TorusGeometry(.4,.05,5,14).translate(50,0,0),
  new T.SphereGeometry(.4,14,10).translate(100,0,0),
  new T.BoxGeometry(1,1,1).toNonIndexed().translate(150,0,0)
];
for(const g of inputs)g.setAttribute('color',new T.BufferAttribute(new Float32Array(g.attributes.position.count*3).fill(1),3));
const expected=inputs.reduce((n,g)=>n+(g.index?g.index.count:g.attributes.position.count),0);
const out=context.mergeInto(inputs),p=out.attributes.position;
assert.equal(p.count,expected,'all original triangles retained');
assert.equal(p.count%3,0,'complete triangle list');
const a=new T.Vector3(),b=new T.Vector3();
for(let i=0;i<p.count;i+=3)for(const [j,k] of [[0,1],[1,2],[2,0]]){
  a.fromBufferAttribute(p,i+j);b.fromBufferAttribute(p,i+k);
  assert(a.distanceTo(b)<4,'triangle must not bridge separated objects');
}
assert(inputs[0].index,'merge does not mutate the input topology');
console.log('PASS: indexed lathe/torus/sphere and triangle-list box preserve topology without cross-object streaks');
