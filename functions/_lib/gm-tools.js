import { GM_CATALOG } from './gm-catalog.js';
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
  const s=JSON.parse(blob);
  // A deliberate whitelist: account/session information never comes from a save.
  return {cls:s.cls,lv:s.lv,hp:s.hp,exp:s.exp,pts:s.pts,st:s.st,jobs:s.jobs,skills:s.sk,
    stats:s.gmStats||null,equipment:s.eq||{},inventory:s.inv||[],pets:s.pets||[],
    cards:s.cards||[],ore:s.ore||{},shards:s.shards||0};
}
export function equipmentPayload(body,blob) {
  if(!blob)bad('This player has no cloud save yet.');
  const s=JSON.parse(blob),eq=s.eq||{},inv=s.inv||[];
  const item=[...Object.values(eq),...inv].find(x=>x && String(x.id)===String(body.itemId));
  if(!item||item.card||item.ore)bad('Select equipment this player still owns.');
  if(body.mode==='equip'){
    const cls=GM_CATALOG.classes[s.cls];
    if(!cls||!inv.includes(item))bad('Select equipment from their bag.');
    const dual=cls.wt.includes('dagger')&&cls.wt.includes('katar');
    const shield=/^(Novice|Swordman|Knight|Lord Knight|Acolyte|Priest|High Priest|Merchant|Blacksmith|Whitesmith)$/.test(s.cls);
    const fits=body.slot==='off'?(item.slot==='off'&&shield||item.wt==='dagger'&&dual):body.slot==='acc1'||body.slot==='acc2'?item.slot==='acc':item.slot===body.slot;
    if(!GM_CATALOG.slots.some(x=>x.id===body.slot)||!fits||Math.min(3,item.sec||0)>Math.max(1,cls.tier)||item.slot==='weapon'&&!cls.wt.includes(item.wt)||body.slot==='off'&&eq.weapon?.wt==='katar')bad('That item does not fit their current class or slot.');
    return {mode:'equip',itemId:item.id,slot:body.slot};
  }
  if(body.mode!=='affixes')bad('Unknown equipment action.');
  if(s.reforgePending&&String(s.reforgePending.id)===String(item.id))bad('The player must resolve their paid reforge offer before this edit.');
  const pool=GM_CATALOG.entries.find(x=>x.type==='gear'&&x.item.slot===item.slot&&x.item.wt===item.wt)?.affixes||[];
  if(!integer(body.refine,0,10))bad('Refinement must be 0–10.');
  if(!Array.isArray(body.aff)||body.aff.length>3||body.aff.some(a=>!a||!pool.includes(a.k)||!Number.isFinite(a.v)||a.v<1||a.v>10000)||new Set(body.aff.map(a=>a.k)).size!==body.aff.length)bad('Choose up to three different, valid affixes with values 1–10,000.');
  return {mode:'affixes',itemId:item.id,refine:body.refine,aff:body.aff.map(({k,v})=>({k,v}))};
}
