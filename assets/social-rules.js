/* Shared plaza layout/navigation: server and browser use the same walkable space. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;root.PGSocialRules=api})(globalThis,()=>{
'use strict';
// v225 (owner): plaza walking uses the character's own field run speed instead of a flat 5 u/s.
// The field game reports moveSpd(true) in its look, the room validates it into this band, and both
// server and client read it here, so nobody rubber-bands. SPEED stays the fallback for older
// clients, and for a Pages Worker that still strips the field. A new client + new Worker always
// agree; an old Worker echoes no speed, so the client falls back to the same 5 u/s it advances at.
const LIMIT=74,SPEED=5,MIN_SPEED=2,MAX_SPEED=13,CAPACITY=20,CHAT_DELAY=3000;
const EMOTIONS=['surprise','question','music','heart','love','sweat','idea','anger','cloud','money','dots','rock','scissors','paper','kiss','ok','dead','sorry','laugh','smile','cry','shy','kissheart','think','hmm','blush','drool','meh','panic','sleep','mail','gg'];
const BUILDINGS=[{name:'stall',x:-32,z:-15,size:4.5,rotation:Math.PI/2,w:4.5,d:4.5},{name:'cart',x:32,z:-15,size:4.5,rotation:-Math.PI/2,w:4.5,d:4.5},{name:'hall',x:0,z:-57,size:62,rotation:Math.PI,w:62,d:39},...[-1,1].map(side=>({name:'tower',x:side*33,z:-59,size:22,w:22,d:22})),...[-1,1].flatMap(side=>[-25,16,56].map(z=>({name:'house',x:side*46,z,size:21,rotation:side*Math.PI/2,w:21,d:21}))),...[-1,1].map(side=>({name:'house',x:side*27,z:65,size:17,rotation:Math.PI,w:17,d:17}))];
// Four planted corners leave both crossing avenues and the fountain promenade open.
const GARDENS=[...[-1,1].flatMap(x=>[-1,1].map(z=>({x:x*23,z:z*23,w:12,d:12})))];
const TREES=GARDENS.map(g=>({x:g.x,z:g.z,size:8}));
// v287: Two fishing ponds on the open south lawns, below the planted corner gardens
// (south of the tree canopies at z=23, north of the houses at z=56). Water is not walkable;
// players fish from the grass around the rim. Shared here so server paths agree with the client.
const PONDS=[-1,1].map(side=>({x:side*23,z:42,w:14,d:10}));
// The source "lamp" is a stone column; it is not used as street furniture.
// v269: Each of the 12 metal park benches seats 2 adventurers side-by-side (24 total bench seats).
const BENCHES=[...[-1,1].flatMap(side=>[-1,1].flatMap(bank=>[11,15,19].map(x=>({x:bank*x,z:side*13,dir:side===1?4:0,rotation:side===1?Math.PI:0,height:.95,size:3.4}))))].map((b,id)=>({...b,id,seats:[id*2,id*2+1]}));
const SEATS=BENCHES.flatMap(b=>[-1,1].map((slotSign,slot)=>({id:b.id*2+slot,bench:b.id,slot,x:b.x+slotSign,sitX:b.x+slotSign*.74,z:b.z,dir:b.dir,rotation:b.rotation,height:b.height,size:b.size})));

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
function walkable(x,z){return Number.isFinite(x)&&Number.isFinite(z)&&Math.abs(x)<=LIMIT&&Math.abs(z)<=LIMIT&&Math.hypot(x,z)>5.6&&!pokerBlocked(x,z)&&BUILDINGS.every(b=>Math.abs(x-b.x)>b.w/2+.7||Math.abs(z-b.z)>b.d/2+.7)&&GARDENS.every(g=>Math.abs(x-g.x)>g.w/2+.5||Math.abs(z-g.z)>g.d/2+.5)&&PONDS.every(p=>Math.abs(x-p.x)>p.w/2+.5||Math.abs(z-p.z)>p.d/2+.5);}
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
return {LIMIT,SPEED,MIN_SPEED,MAX_SPEED,walkSpeed,CAPACITY,CHAT_DELAY,EMOTIONS,BUILDINGS,GARDENS,TREES,PONDS,BENCHES,SEATS,POKER,walkable,path,advance};
});
