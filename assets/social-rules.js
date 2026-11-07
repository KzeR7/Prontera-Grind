/* Shared plaza layout/navigation: server and browser use the same walkable space. */
(function(root,factory){const data=typeof module==='object'&&module.exports?require('./digimon/roster.js'):root.PGDigimonRoster;const api=factory(data);if(typeof module==='object'&&module.exports)module.exports=api;root.PGSocialRules=api})(globalThis,DATA=>{
'use strict';
if(!DATA)throw Error('Digimon roster data must load before social rules');
// v225 (owner): plaza walking uses the character's own field run speed instead of a flat 5 u/s.
// The field game reports moveSpd(true) in its look, the room validates it into this band, and both
// server and client read it here, so nobody rubber-bands. SPEED stays the fallback for older
// clients, and for a Pages Worker that still strips the field. A new client + new Worker always
// agree; an old Worker echoes no speed, so the client falls back to the same 5 u/s it advances at.
// LIMIT is retained for legacy callers; east and west are now intentionally asymmetric.
const LIMIT=74,MIN_X=-74,MAX_X=102,MIN_Z=-74,MAX_Z=126,SPEED=5,MIN_SPEED=2,MAX_SPEED=13,CAPACITY=20,CHAT_DELAY=3000;
const EMOTIONS=['surprise','question','music','heart','love','sweat','idea','anger','cloud','money','dots','rock','scissors','paper','kiss','ok','dead','sorry','laugh','smile','cry','shy','kissheart','think','hmm','blush','drool','meh','panic','sleep','mail','gg'];
// The former east houses and southwest houses make room for the approved Sanctuary and lake.
const BUILDINGS=[{name:'stall',x:-32,z:-15,size:4.5,rotation:Math.PI/2,w:4.5,d:4.5},{name:'cart',x:32,z:-15,size:4.5,rotation:-Math.PI/2,w:4.5,d:4.5},{name:'hall',x:0,z:-57,size:62,rotation:Math.PI,w:62,d:39},...[-1,1].map(side=>({name:'tower',x:side*33,z:-59,size:22,w:22,d:22})),...[-25].map(z=>({name:'house',x:-46,z,size:21,rotation:-Math.PI/2,w:21,d:21}))];
// The Sanctuary begins on the south-east green, alongside the lake, not north of the avenue.
const SANCTUARY=[{id:'gym',x:69,z:25.5,w:52,d:27},{id:'farm',x:70,z:64,w:52,d:34},{id:'ring',x:71,z:105,w:48,d:27}];
const SANCTUARY_RING={x:68,z:104,w:18,d:16,height:.8};
const SANCTUARY_PLANTERS=[],SANCTUARY_ARCHES=[];
// v357 (owner: "the trees are ugly - use real Ragnarok-style ones, and place them like a
// landscape, not a grid"): entries may carry a kind - pine (izlude fir), palm (morocc),
// broad (payon broadleaf) or sakura (amatsu cherry) - rendered from the repo's own native
// RO field model sets. Kindless entries stay prontera atlas trees. Placement is clustered
// groves with varied depth and spacing along borders, banks and landmarks; the old straight
// species runs are gone. All trees remain shared pathfinding obstacles.
const SANCTUARY_TREES=[
 ...[46,50,54,84,88,92].map(x=>({x,z:10.2,behindGym:true})),
 ...[47,62,82,100].map(z=>({x:12,z})),
 {x:100,z:14},{x:100,z:41},{x:100,z:57},{x:100,z:71},{x:100,z:85},{x:100,z:104},{x:100,z:121},
 {x:15,z:119},{x:26,z:119},
 // v357 west border groves (between the plaza and the Sanctuary).
 {x:11,z:29,kind:'pine'},{x:14.5,z:33,kind:'broad'},{x:9,z:36.5,kind:'sakura'},
 {x:13.5,z:52,kind:'broad'},{x:10,z:56,kind:'pine'},
 {x:11,z:71,kind:'pine'},{x:14.5,z:75,kind:'sakura'},{x:9,z:78.5,kind:'broad'},
 {x:12.5,z:93,kind:'broad'},{x:15.5,z:96.5,kind:'pine'},
 {x:10,z:111,kind:'sakura'},{x:13,z:114.5,kind:'pine'},
 // v357 east edge groves, set back from the fence line at varied depths.
 {x:97,z:27,kind:'pine'},{x:101,z:30,kind:'broad'},
 {x:97,z:49,kind:'sakura'},{x:101,z:52,kind:'pine'},
 {x:96,z:64,kind:'broad'},
 {x:97,z:77,kind:'pine'},{x:101,z:80,kind:'sakura'},
 {x:96,z:92,kind:'broad'},{x:99.5,z:95,kind:'pine'},
 {x:97.5,z:112,kind:'sakura'},
 // v357 south hedge fill.
 {x:38,z:118,kind:'broad'},{x:42,z:121,kind:'pine'},{x:52,z:120,kind:'sakura'},
 // v357 lake west-bank wood - a dense mixed grove, not a line.
 {x:-64,z:56,kind:'broad'},{x:-67,z:60,kind:'palm'},{x:-62,z:63,kind:'sakura'},
 {x:-66,z:68,kind:'broad'},{x:-63,z:72,kind:'pine'},
 {x:-67,z:84,kind:'broad'},{x:-63,z:88,kind:'palm'},
 {x:-66,z:100,kind:'broad'},{x:-62,z:104,kind:'sakura'},
 // v357 lake east bank accents behind the angler chairs.
 {x:-12,z:58,kind:'sakura'},{x:-9,z:76,kind:'broad'},{x:-12,z:90,kind:'pine'},
 // v357 formal sakura pair framing the great hall steps.
 {x:-10,z:-33,kind:'sakura'},{x:10,z:-33,kind:'sakura'},
 // v357 gym flank pair, west of the wing wall.
 {x:40,z:22,kind:'pine'},{x:40.5,z:33,kind:'broad'},
 // v357 loose hedgerow screening the grind field's north fence (outside the battle ground).
 {x:49,z:43,kind:'broad'},{x:53,z:44.5,kind:'pine'},{x:60,z:43.5,kind:'sakura'},
 {x:80,z:43.8,kind:'pine'},{x:87,z:44.2,kind:'broad'},{x:91,z:43.2,kind:'pine'},
 // v357 ring-side pair and a north-east anchor.
 {x:50,z:94,kind:'pine'},{x:54,z:97.5,kind:'sakura'},{x:89,z:112.5,kind:'broad'}
];
const SANCTUARY_OBSTACLES=SANCTUARY_TREES.map(t=>({...t,r:.7}));
// Gym wall, end posts, shop structures and signs. The center of the gym is open.
const SANCTUARY_BARRIERS=[
 ...[43,49,89,95].map(x=>({kind:'gym-post',x,z:29,w:.5,d:.5})),
 ...[43.75,48.25,89.75,94.25].map(x=>({kind:'gym-front',x,z:29,w:1.5,d:.45})),
 {kind:'food',x:22,z:41,w:5.5,d:4},{kind:'trainer',x:22,z:56,w:5,d:4},
 {kind:'guide',x:22,z:72,w:5,d:4},
 ...[49,64,79,90].map(z=>({kind:'lamp',x:31,z,w:.5,d:.5})),
 {kind:'stand',x:83.4,z:104.9,w:3.5,d:21},{kind:'stand',x:68.15,z:115.8,w:29.3,d:3.3},{kind:'stand-corner',x:82.8,z:115.3,w:4.2,d:4.2}
];
// Bevelled meadow fence, with wide north, west and south gates. Shared segment
// collision matches the rendered rails, including angled corner pieces.
// Back wings are true angled segments, shared by geometry, pathfinding and Worker.
const SANCTUARY_GYM_WALLS=[[43,18.5,65,12.5],[65,12.5,73,12.5],[73,12.5,95,18.5],[43,18.5,43,29],[95,18.5,95,29]].map(([x1,z1,x2,z2])=>({x1,z1,x2,z2}));
const SANCTUARY_GYM_FENCES=[[45,38.5,62,38.5],[76,38.5,93,38.5]].map(([x1,z1,x2,z2])=>({x1,z1,x2,z2}));
const SANCTUARY_FENCES=[
 [44,52,49,47],[49,47,62,47],[70,47,91,47],[91,47,96,52],
 [96,52,96,76],[96,76,91,81],[91,81,72,81],[64,81,49,81],
 [49,81,44,76],[44,76,44,64],[44,57,44,52]
].map(([x1,z1,x2,z2])=>({x1,z1,x2,z2}));
const ALL_SANCTUARY_FENCES=[...SANCTUARY_FENCES,...SANCTUARY_GYM_FENCES,...SANCTUARY_GYM_WALLS];
function fenceBlocked(x,z){return ALL_SANCTUARY_FENCES.some(f=>{const dx=f.x2-f.x1,dz=f.z2-f.z1,t=Math.max(0,Math.min(1,((x-f.x1)*dx+(z-f.z1)*dz)/(dx*dx+dz*dz))),ex=x-f.x1-t*dx,ez=z-f.z1-t*dz;return ex*ex+ez*ez<.55*.55})}
// v357 (owner: "the ring should be entered only from the stairs"): the boxing ring is a
// raised platform and the ropes are a real barrier. The perimeter band of the ring is
// unwalkable everywhere except the west stair mouth; the interior stays walkable so
// battles, stairs and clicks keep working. The BFS in path() routes through the mouth.
function ringBlocked(x,z){const r=SANCTUARY_RING;
 if(Math.abs(x-r.x)>r.w/2||Math.abs(z-r.z)>r.d/2)return false;
 if(Math.abs(x-r.x)<r.w/2-.9&&Math.abs(z-r.z)<r.d/2-.9)return false;
 return !(x<r.x-r.w/2+1.1&&Math.abs(z-r.z)<=1.75)}
// Distinct gym apparatus are reserved per plaza; the owner can move away while a
// companion trains. Anchor points identify the prop, not a client-supplied location.
const GYM_STATIONS={power:[{x:52.5,z:30.5},{x:56.5,z:30.5},{x:60.5,z:30.5}],guard:[{x:60,z:21},{x:63,z:21},{x:66,z:21}],agility:[{x:72,z:26},{x:75,z:26},{x:78,z:26}],focus:[{x:83,z:27},{x:86,z:27},{x:89,z:27}]};
// The same generated 280-form whitelist runs in the browser and Social Worker.
// Unknown names and path-like values never become cosmetic look or gym payloads.
const cleanDigimon=value=>DATA.clean(value);
// All four original garden trees remain; the lake now starts farther south.
const GARDENS=[...[-1,1].flatMap(x=>[-1,1].map(z=>({x:x*23,z:z*23,w:12,d:12})))];
const TREES=GARDENS.map(g=>({x:g.x,z:g.z,size:8}));
// North–south, broad irregular lake; shape, collisions, fishing
// and the shader use the same radial shoreline. The bridge spans its width, bank to bank.
const PONDS=[{x:-38,z:73,w:38,d:60}];
// Broad, softly rounded bays and gentle irregularities, not a pointed symmetric ellipse.
function pondRadius(a){const c=Math.abs(Math.cos(a)),s=Math.abs(Math.sin(a)),b=Math.pow(Math.pow(c,2.5)+Math.pow(s,2.5),-.4);return b*(1+.065*Math.sin(3*a+.45)+.04*Math.sin(5*a-1.2)+.018*Math.sin(8*a+.8)+.022*Math.sin(11*a+.7))}
function pondContains(p,x,z,pad=0){
 const hx=Math.max(.1,p.w/2+pad),hz=Math.max(.1,p.d/2+pad),nx=(x-p.x)/hx,nz=(z-p.z)/hz;
 return Math.hypot(nx,nz)<=pondRadius(Math.atan2(nz,nx));
}
function pondBoundary(p,a,offset=0){const r=pondRadius(a);return {x:p.x+Math.cos(a)*(p.w/2*r+offset),z:p.z+Math.sin(a)*(p.d/2*r+offset)}}
// Exact closest distance to a fine polygon of the same outline, including curved corners.
const pondOutlines=new WeakMap();
function pondDistance(p,x,z){if(pondContains(p,x,z))return 0;let pts=pondOutlines.get(p);if(!pts){pts=Array.from({length:97},(_,i)=>pondBoundary(p,i*Math.PI*2/96));pondOutlines.set(p,pts)}let best=Infinity;
 for(let i=1;i<pts.length;i++){const prev=pts[i-1],next=pts[i],dx=next.x-prev.x,dz=next.z-prev.z,t=Math.max(0,Math.min(1,((x-prev.x)*dx+(z-prev.z)*dz)/(dx*dx+dz*dz)));best=Math.min(best,Math.hypot(x-prev.x-dx*t,z-prev.z-dz*t))}return best}
function clampPond(p,x,z,inset=1){const hx=p.w/2-inset,hz=p.d/2-inset,nx=(x-p.x)/hx,nz=(z-p.z)/hz,a=Math.atan2(nz,nx),r=pondRadius(a),len=Math.hypot(nx,nz),scale=len>r?r/len:1;return {x:p.x+nx*scale*hx,z:p.z+nz*scale*hz}}
// The southern lobe is offset west: place the cascade on its real shoreline.
const SOUTH_LIP=pondBoundary(PONDS[0],1.77);
const POND_FALLS=[{x:SOUTH_LIP.x,z:SOUTH_LIP.z+.3,w:6,h:3.6,dir:-1,intoPond:true}];
const SHORE_ROCKS=[];
const shore=(angle,offset)=>pondBoundary(PONDS[0],angle,offset);
const LAKE_BRIDGE={x:PONDS[0].x,z:PONDS[0].z,span:44,width:4.2,deck:.3,arch:2.9};
const POND_PROPS=[{
 bridge:LAKE_BRIDGE,
 paths:[{name:'west',x1:-71,x2:LAKE_BRIDGE.x-LAKE_BRIDGE.span/2+.3,z:LAKE_BRIDGE.z,width:5.2},
  {name:'east',x1:LAKE_BRIDGE.x+LAKE_BRIDGE.span/2-.3,x2:-8.8,z:LAKE_BRIDGE.z,width:5.2}],
 crag:{x:POND_FALLS[0].x,z:POND_FALLS[0].z+1.3,hx:3.8,hz:1.2},
 stands:[{x:LAKE_BRIDGE.x,z:LAKE_BRIDGE.z,name:'bridge'},{x:LAKE_BRIDGE.x-11,z:LAKE_BRIDGE.z,name:'bridge-west'},{x:LAKE_BRIDGE.x+11,z:LAKE_BRIDGE.z,name:'bridge-east'},
  {...shore(-.48,2.1),name:'north-east'},{...shore(.5,2.1),name:'south-east'},
  {...shore(-2.65,2.1),name:'north-west'},{...shore(2.65,2.1),name:'south-west'},
  {...shore(-Math.PI/2,2),name:'north'}],
 lanterns:[-1,1].flatMap(side=>[-1,1].map(bank=>({x:LAKE_BRIDGE.x+bank*(LAKE_BRIDGE.span/2+1.7),z:LAKE_BRIDGE.z+side*(LAKE_BRIDGE.width/2+2)}))),
 blossoms:[...[-2.88,-2.3,-1.76,-1.34,-.86,-.3,.3,.87,1.18,1.96,2.3,2.88].map((a,i)=>({...shore(a,4),scale:i%3===0?1.16:1})),...[-2.55,-2,-1.13,-.58,.58,2.55].map(a=>({...shore(a,7),scale:.88})),...[-2.65,-2.12,-1.53,-1.02,-.72,.05,.48,.73,1.45,1.7,2.15,2.72,3.08].map((a,i)=>({...shore(a,6.5),scale:i%3===0?1.04:.92}))].filter(t=>!(Math.abs(t.z-LAKE_BRIDGE.z)<6&&(t.x<LAKE_BRIDGE.x-LAKE_BRIDGE.span/2+5||t.x>LAKE_BRIDGE.x+LAKE_BRIDGE.span/2-5))&&!(Math.abs(t.x-POND_FALLS[0].x)<11&&t.z>POND_FALLS[0].z-3)),
 boulders:[-2.7,-1.75,-.85,.85,2.65].map((a,i)=>({...shore(a,1.3),r:.45+(i%2)*.12})),
 falls:POND_FALLS[0]
}];
// The source "lamp" is a stone column; it is not used as street furniture.
// v269: Each of the 12 metal park benches seats 2 adventurers side-by-side (24 total bench seats).
// v356 (owner: "bench needs to be able to be seated"): the boxing ring stands, the gym court and
// the grind-field fence line get viewing benches too. They take bench ids 16-22, so their seats
// land at 32-45 - strictly after the pond chairs' 24-31 - and no existing reservation moves.
const BENCHES=[
 ...[-1,1].flatMap(side=>[-1,1].flatMap(bank=>[11,15,19].map(x=>({x:bank*x,z:side*13,dir:side===1?4:0,rotation:side===1?Math.PI:0,height:.95,size:3.4})))),
 // v356: east ringside stand (facing the ring, dir 2 = west).
 ...[[79.8,98],[79.8,110]].map(([x,z],i)=>({id:16+i,x,z,dir:2,rotation:-Math.PI/2,height:.95,size:3.4})),
 // v356: south ringside stand (facing north, dir 4).
 ...[[62,112.8],[74,112.8]].map(([x,z],i)=>({id:18+i,x,z,dir:4,rotation:Math.PI,height:.95,size:3.4})),
 // v356: gym court entrance bench, facing the training yard (dir 0 = south).
 {id:20,x:69,z:16.2,dir:0,rotation:0,height:.95,size:3.4},
 // v356: grind-field north fence, looking south across the wild field (dir 0).
 ...[[56,44],[84,44]].map(([x,z],i)=>({id:21+i,x,z,dir:0,rotation:0,height:.95,size:3.4}))
].map((b,i)=>{const id=b.id??i;return {...b,id,seats:[id*2,id*2+1]}});
// v288: 8 single-seat wooden angler chairs on the pond rims (4 per pond), facing the water.
// They take seat ids 24-31, after the 24 bench seats, so bench reservations are untouched.
// v308: the pairs moved out to +-4.8 so the wider bridge and the rock face of the cascade have room.
// Keep all eight old seat IDs, relocated around the enlarged pond.
const CHAIRS=[-2.55,-2.0,-1.13,-.58,.58,1.13,2.0,2.55].map((a,i)=>{
 const p=shore(a,1.8),dir=(Math.round(Math.atan2(p.x-PONDS[0].x,PONDS[0].z-p.z)/(Math.PI/4))+8)%8;
 return {...p,id:24+i,dir,rotation:-dir*Math.PI/4,height:.66,size:1.1};
});
// v356: SEATS stays a dense id-keyed array - every consumer (room validation, client sit
// pose, partner-swap) reads R.SEATS[seatId]. Bench seats fill 0-23 and 32-45, the pond
// chairs 24-31, so assigning by id keeps SEATS[id].id===id true for all 46 entries.
const SEATS=[];
for(const seat of [
 ...BENCHES.flatMap(b=>[-1,1].map((slotSign,slot)=>({id:b.id*2+slot,bench:b.id,slot,x:b.x+slotSign,sitX:b.x+slotSign*.74,z:b.z,dir:b.dir,rotation:b.rotation,height:b.height,size:b.size}))),
 ...CHAIRS.map(c=>({id:c.id,bench:100+c.id,slot:0,x:c.x,sitX:c.x,z:c.z,dir:c.dir,rotation:c.rotation,height:c.height,size:c.size}))
])SEATS[seat.id]=seat;

// v266: Two Plaza Hold'em tables along the West Promenade (Table 1 at (-27,-1) & Table 2 at (-39,-1)).
function makePokerTable(tableId,label,sub,cx,cz,dealerSpec){
 const base=tableId*6;
 const seats=[
  {id:base+0,tableId,seatIndex:0,label:'Seat 1',x:cx-3,z:cz-1,dir:6,rotation:Math.PI/2,height:.72},
  {id:base+1,tableId,seatIndex:1,label:'Seat 2',x:cx-3,z:cz+1,dir:6,rotation:Math.PI/2,height:.72},
  {id:base+2,tableId,seatIndex:2,label:'Seat 3',x:cx-1,z:cz+2,dir:4,rotation:Math.PI,height:.72},
  {id:base+3,tableId,seatIndex:3,label:'Seat 4',x:cx+1,z:cz+2,dir:4,rotation:Math.PI,height:.72},
  {id:base+4,tableId,seatIndex:4,label:'Seat 5',x:cx+3,z:cz+1,dir:2,rotation:-Math.PI/2,height:.72},
  {id:base+5,tableId,seatIndex:5,label:'Seat 6',x:cx+3,z:cz-1,dir:2,rotation:-Math.PI/2,height:.72},
 ];
 return {
  id:tableId,label,sub,
  table:{x:cx,z:cz,w:4.4,d:2.8,minX:cx-2.3,maxX:cx+2.3,minZ:cz-2.7,maxZ:cz+1.4},
  dealer:{...dealerSpec,tableId,x:cx,z:cz-2.3,approach:{x:cx,z:cz+3},dir:0},
  seats,
 };
}
const POKER_TABLES=[
 makePokerTable(0,'Table 1','Plaza West',-27,-2,{
  id:'dealer-vane',name:'Dealer Vane',role:"Table 1 · Hold'em",cls:'Whitesmith',rugColor:0x4a2127,trimColor:0xb89652,
  appearance:{version:1,sex:'m',heads:{m:19,f:2},colors:{m:6,f:0},halo:false,glasses:false,wings:false,headwear:'classicHat',facewear:'sunglasses',mouthwear:'pokerCard',backwear:'none',outfit:'none'}
 }),
 makePokerTable(1,'Table 2','West Avenue',-39,-2,{
  id:'dealer-mira',name:'Dealer Mira',role:"Table 2 · Hold'em",cls:'Sniper',rugColor:0x1d3148,trimColor:0xc7a862,
  appearance:{version:1,sex:'f',heads:{m:19,f:14},colors:{m:6,f:3},halo:false,glasses:false,wings:false,headwear:'redBeret',facewear:'sunglasses',mouthwear:'pokerCard',backwear:'none',outfit:'none'}
 }),
];
const POKER={
 tables:POKER_TABLES,
 table:POKER_TABLES[0].table,
 dealer:POKER_TABLES[0].dealer,
 dealers:POKER_TABLES.map(t=>t.dealer),
 seats:POKER_TABLES.flatMap(t=>t.seats),
};

function pokerBlocked(x,z){return POKER_TABLES.some(({table:t})=>x>=t.minX&&x<=t.maxX&&z>=t.minZ&&z<=t.maxZ);}
// v309: the cascade's boulder heap is solid - you walk around it instead of standing inside it.
function cragBlocked(x,z){return POND_PROPS.some(pr=>pr.crag&&Math.abs(x-pr.crag.x)<=pr.crag.hx&&Math.abs(z-pr.crag.z)<=pr.crag.hz)}
function onBridge(x,z){return POND_PROPS.some(({bridge:b})=>Math.abs(x-b.x)<=b.span/2&&Math.abs(z-b.z)<=b.width/2-.35)}
function walkable(x,z){return Number.isFinite(x)&&Number.isFinite(z)&&x>=MIN_X&&x<=MAX_X&&z>=MIN_Z&&z<=MAX_Z&&Math.hypot(x,z)>5.6&&!pokerBlocked(x,z)&&!cragBlocked(x,z)&&!fenceBlocked(x,z)&&!ringBlocked(x,z)&&SANCTUARY_OBSTACLES.every(o=>Math.hypot(x-o.x,z-o.z)>o.r+.25)&&SANCTUARY_BARRIERS.every(b=>Math.abs(x-b.x)>b.w/2+.3||Math.abs(z-b.z)>b.d/2+.3)&&BUILDINGS.every(b=>Math.abs(x-b.x)>b.w/2+.7||Math.abs(z-b.z)>b.d/2+.7)&&GARDENS.every(g=>Math.abs(x-g.x)>g.w/2+.5||Math.abs(z-g.z)>g.d/2+.5)&&(onBridge(x,z)||PONDS.every(p=>!pondContains(p,x,z,.5)));}
function path(from,to){
 if(!walkable(to.x,to.z))return [];
 const start=[Math.round(from.x),Math.round(from.z)],end=[Math.round(to.x),Math.round(to.z)],key=(x,z)=>x+','+z;
 const queue=[start],prev=new Map([[key(...start),null]]);let found=null;
 for(let i=0;i<queue.length;i++){const [x,z]=queue[i];if(x===end[0]&&z===end[1]){found=[x,z];break}
 for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]]){const nx=x+dx,nz=z+dz,k=key(nx,nz);if(prev.has(k)||!walkable(nx,nz)||!walkable(x+dx,z)||!walkable(x,z+dz))continue;prev.set(k,[x,z]);queue.push([nx,nz]);}}
 if(!found)return [];const route=[];for(let p=found;prev.get(key(...p));p=prev.get(key(...p)))route.unshift({x:p[0],z:p[1]});return route;
}
function walkSpeed(p){const value=Number(p&&p.look&&p.look.speed);return Number.isFinite(value)&&value>0?Math.max(MIN_SPEED,Math.min(MAX_SPEED,value)):SPEED}
function advance(p,now){let distance=Math.max(0,(now-p.at)/1000)*walkSpeed(p);p.at=now;while(p.path.length&&distance>0){const t=p.path[0],dx=t.x-p.x,dz=t.z-p.z,d=Math.hypot(dx,dz);p.dir=(Math.round(Math.atan2(-dx,dz)/(Math.PI/4))+8)%8;if(d<=distance){p.x=t.x;p.z=t.z;p.path.shift();distance-=d}else{p.x+=dx/d*distance;p.z+=dz/d*distance;break}}if(!p.path.length&&Number.isInteger(p.seat)&&SEATS[p.seat]){p.sit=true;p.dir=SEATS[p.seat].dir}else if(!p.path.length&&Number.isInteger(p.pokerSeat)&&POKER.seats[p.pokerSeat]){p.sit=true;p.dir=POKER.seats[p.pokerSeat].dir}return p;}
return {LIMIT,MIN_X,MAX_X,MIN_Z,MAX_Z,SPEED,MIN_SPEED,MAX_SPEED,walkSpeed,CAPACITY,CHAT_DELAY,EMOTIONS,BUILDINGS,SANCTUARY,SANCTUARY_ARCHES,SANCTUARY_PLANTERS,SANCTUARY_TREES,SANCTUARY_OBSTACLES,SANCTUARY_BARRIERS,SANCTUARY_FENCES,SANCTUARY_GYM_FENCES,SANCTUARY_GYM_WALLS,SANCTUARY_RING,GYM_STATIONS,fenceBlocked,ringBlocked,cleanDigimon,GARDENS,TREES,PONDS,POND_FALLS,POND_PROPS,SHORE_ROCKS,CHAIRS,BENCHES,SEATS,POKER,pondRadius,pondContains,pondBoundary,pondDistance,clampPond,cragBlocked,onBridge,walkable,path,advance};
});
