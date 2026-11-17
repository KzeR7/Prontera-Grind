import { GM_CATALOG } from './gm-catalog.js';
import { unpackSave } from './save-codec.js';
import { DIGIMON_STARTER_EGG_CAP, FISHING_BAIT, FISHING_RODS } from './gm-systems.js';
import { HttpError } from './http.js';
const bad = message => { throw new HttpError(400, message); };
const integer = (v,min,max) => Number.isInteger(v) && v>=min && v<=max;
export function giftPayload(body) {
  const entry=GM_CATALOG.entries.find(x=>x.id===body.catalogId);
  if(!entry)bad('Select an item from the catalog.');
  if(!integer(body.amount,1,entry.resource?1000000:100))bad('Quantity must be a whole number: 1–100 items, or 1–1,000,000 resources.');
  return entry.resource?{resource:entry.resource,amount:body.amount}:{item:entry.item,amount:body.amount};
}
export function inspectSave(blob) {
  if(!blob)return null;
  // v414: a stored blob may be compact (tuple rows). Unpack first, or every array below is
  // a tuple the GM form cannot read. unpackSave is a no-op on an old, ordinary save.
  const s=unpackSave(JSON.parse(blob)),fish=s.fishing&&typeof s.fishing==='object'&&!Array.isArray(s.fishing)?s.fishing:null,
    bag=s.digimonBag&&typeof s.digimonBag==='object'&&!Array.isArray(s.digimonBag)?s.digimonBag:null,
    count=(value,max)=>Math.max(0,Math.min(max,Math.floor(Number(value)||0))),rodIds=new Set(FISHING_RODS.map(x=>x.id));
  // A deliberate whitelist: account/session information never comes from a save. Only the
  // resource summary needed by the GM form is exposed for Fishing and DigiPet.
  return {cls:s.cls,lv:s.lv,hp:s.hp,exp:s.exp,pts:s.pts,st:s.st,jobs:s.jobs,skills:s.sk,
    stats:s.gmStats||null,equipment:s.eq||{},inventory:s.inv||[],pets:s.pets||[],
    cards:s.cards||[],ore:s.ore||{},shards:s.shards||0,ascensionMat:s.ascensionMat||[0,0,0],nmMat:s.nmMat||[],refineScrolls:s.refineScrolls||0,mythicScrolls:s.mythicScrolls||0,
    fishing:fish?{coins:count(fish.coins,1_000_000_000),rod:rodIds.has(fish.rod)?fish.rod:'twig',rods:Array.isArray(fish.rods)?[...new Set(['twig',...fish.rods.filter(id=>rodIds.has(id))])]:['twig'],bait:Object.fromEntries(FISHING_BAIT.map(x=>[x.id,count(fish.bait?.[x.id],999)]))}:null,
    digimonBag:bag?{coins:count(bag.coins??50,999999),eggs:count(bag.eggs,DIGIMON_STARTER_EGG_CAP),ownedCount:Array.isArray(bag.owned)?Math.min(bag.owned.length,280):0,gearCount:bag.gear?.items&&typeof bag.gear.items==='object'?Object.keys(bag.gear.items).length:0}:null};
}
export function systemsPayload(body) {
  const system=body.system,resource=body.resource,amount=body.amount,id=body.resourceId;
  if(system==='fishing'){
    if(resource==='fishcoins'&&integer(amount,1,1_000_000_000))return{system,resource,amount};
    if(resource==='rod'&&FISHING_RODS.some(x=>x.id===id))return{system,resource,id};
    if(resource==='bait'&&FISHING_BAIT.some(x=>x.id===id)&&integer(amount,1,999))return{system,resource,id,amount};
  }
  if(system==='digimon'){
    if(resource==='petcoins'&&integer(amount,1,999_999))return{system,resource,amount};
    // The bag itself checks the remaining unowned starter-pool capacity at delivery time.
    if(resource==='eggs'&&integer(amount,1,DIGIMON_STARTER_EGG_CAP))return{system,resource,amount};
  }
  bad('Choose a valid Fishing or DigiPet resource and quantity.');
}
export function equipmentPayload(body,blob) {
  if(!blob)bad('This player has no cloud save yet.');
  const s=unpackSave(JSON.parse(blob)),eq=s.eq||{},inv=s.inv||[];   // v414: stored blobs may be compact
  const item=[...Object.values(eq),...inv].find(x=>x && String(x.id)===String(body.itemId));
  if(!item||item.card||item.ore)bad('Select equipment this player still owns.');
  if(body.mode==='equip'){
    const cls=GM_CATALOG.classes[s.cls];
    if(!cls||!inv.includes(item))bad('Select equipment from their bag.');
    const dual=cls.wt.includes('dagger')&&cls.wt.includes('katar');
    const shield=/^(Novice|Swordman|Knight|Lord Knight|Acolyte|Priest|High Priest|Merchant|Blacksmith|Whitesmith|Rune Knight|Arch Bishop|Mechanic)$/.test(s.cls);
    const fits=body.slot==='off'?(item.slot==='off'&&shield||item.wt==='dagger'&&dual):body.slot==='acc1'||body.slot==='acc2'?item.slot==='acc':item.slot===body.slot;
    if(!GM_CATALOG.slots.some(x=>x.id===body.slot)||!fits||Math.min(3,item.sec||0)>Math.max(1,cls.tier)||item.slot==='weapon'&&!cls.wt.includes(item.wt)||body.slot==='off'&&eq.weapon?.wt==='katar')bad('That item does not fit their current class or slot.');
    return {mode:'equip',itemId:item.id,slot:body.slot};
  }
  if(body.mode!=='affixes')bad('Unknown equipment action.');
  if(s.reforgePending&&String(s.reforgePending.id)===String(item.id))bad('The player must resolve their paid reforge offer before this edit.');
  const pool=GM_CATALOG.entries.find(x=>x.type==='gear'&&x.item.slot===item.slot&&x.item.wt===item.wt)?.affixes||[];
  if(!integer(body.refine,0,item.sec===6?15:10))bad('Refinement must be 0–10, or 0–15 for Mythic.');
  if(!Array.isArray(body.aff)||body.aff.length>(item.sec===6?4:3)||body.aff.some(a=>!a||!pool.includes(a.k)||!Number.isFinite(a.v)||a.v<1||a.v>10000)||new Set(body.aff.map(a=>a.k)).size!==body.aff.length)bad('Choose up to three (four for Mythic) different, valid affixes with values 1–10,000.');
  return {mode:'affixes',itemId:item.id,refine:body.refine,aff:body.aff.map(({k,v})=>({k,v}))};
}
