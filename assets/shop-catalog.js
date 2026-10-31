/* Cash Shop catalog — the ONE price list. The game reads it as window.PGShop; the Pages Functions
   import the same file (like workers/social imports assets/social-rules.js), so the browser can never
   show a price the server would not charge.

   HOW TO CHANGE PRICES: edit SLOT_PRICES / PRICE_OVERRIDES / BUNDLES / SUPPLIES below, bump the ?v=
   query on the <script src="assets/shop-catalog.js"> tag in index.html, and deploy. No Stripe
   dashboard work is needed: Checkout Sessions are created with inline price_data from this list.
   Prices are whole cents (USD); Stripe refuses charges under 50 cents.

   v2 (2026-10-27, owner; updated 2026-10-31): one flat price per wardrobe slot — Head, Face and Mouth
   are $1.50, Wings are $2.00 — plus two BUNDLES: an $8 mixed unlock and a $25 Wardrobe bundle (all 52
   cosmetics currently in the shop; does not include future updates). The old per-item overrides are
   gone; a slot price is now the whole story.

   SKU shapes (stable identifiers, stored in D1 entitlements/orders — never rename an existing one):
     cos:<slot>:<accessoryId>   a permanent wardrobe unlock for the account, e.g. cos:backwear:wings
     sup:<resource>:<amount>    a consumable bundle delivered through the existing grants queue
     bnd:<bundleId>             a bundle. It resolves to `cos:` entitlements when the order is paid,
                                so ownership, the save gate and the GM console never change. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;root.PGShop=api})(typeof globalThis==='object'?globalThis:this,function(){
'use strict';
const VERSION=2,CURRENCY='usd',MIN_PRICE=50,MAX_QTY=10;
// Every accessory in a wardrobe slot costs the slot price unless it has an override.
const SLOT_PRICES={headwear:150,facewear:150,mouthwear:150,backwear:200};
// Kept for compatibility with older callers (and GM tooling): nothing is an exception any more.
const PRICE_OVERRIDES={};
// Consumables. `resource` and `amount` are exactly the gift payload the game already applies
// (gmApplyGift in index.html), so a purchase is delivered like a GM gift: once, on the next sync.
const RESOURCES={
 ori:{name:'Oridecon',group:'Refining ore',blurb:'Refines weapons. The Black Market sells it for 100,000z each.'},
 elu:{name:'Elunium',group:'Refining ore',blurb:'Refines armor and accessories. The Black Market sells it for 100,000z each.'},
 refineScrolls:{name:'Refine Protection Scroll',group:'Protection scrolls',blurb:'Protects one +5 and above refinement attempt from losing a rank. 80,000,000z in the Black Market.'},
 mythicScrolls:{name:'Mythic Protection Scroll',group:'Protection scrolls',blurb:'Protects one +11 to +15 Mythic refinement attempt. 100 Valkyrie\u2019s Sigils in the Black Market.'},
 ascMat0:{name:'Astral Shard',group:'Ascension materials',blurb:'Astral Citadel material for forging Mythic equipment.'},
 ascMat1:{name:'Primal Catalyst',group:'Ascension materials',blurb:'Thor Volcano material for forging Mythic equipment.'},
 ascMat2:{name:'Valkyrie\u2019s Sigil',group:'Ascension materials',blurb:'Rare Ascension drop used by every Mythic forge and the Mythic scroll exchange.'},
};
const SUPPLIES=[
 ['ori',50,199],['ori',300,899],['elu',50,199],['elu',300,899],
 ['refineScrolls',2,100],['refineScrolls',10,299],['mythicScrolls',2,249],['mythicScrolls',10,700],
 ['ascMat0',10,299],['ascMat0',30,799],['ascMat1',10,299],['ascMat1',30,799],['ascMat2',5,399],['ascMat2',15,999],
].map(([resource,amount,price])=>({sku:'sup:'+resource+':'+amount,kind:'supply',resource,amount,price,name:RESOURCES[resource].name+' \u00d7'+amount,group:RESOURCES[resource].group,blurb:RESOURCES[resource].blurb,maxQty:MAX_QTY}));

// Bundles. `take` is how many unlocks of each slot the price buys; the server rolls WHICH ones
// out of what the account does not own yet, when the payment clears, so the shop can never advertise
// a specific item it might not be able to hand over. A slot that is already full (every Head owned,
// say) spills into the remaining slots, so the player always receives the promised count until they
// own the whole wardrobe.
const BUNDLES=[
 {sku:'bnd:adventurer',name:'Adventurer Bundle',price:800,maxQty:1,group:'Bundles',
  blurb:'13 permanent unlocks rolled for you from what you do not own yet: 4 Head, 4 Face, 2 Mouth and 3 Wings.',
  take:{headwear:4,facewear:4,mouthwear:2,backwear:3}},
 {sku:'bnd:complete',name:'Wardrobe',price:2500,maxQty:1,group:'Bundles',
  blurb:'All 52 cosmetics in one purchase \u2014 Head, Face, Mouth and Wings styles (does not include future updates).',
  all:true},
].map(b=>Object.assign({kind:'bundle',slotLabel:'Bundle'},b));

const shuffle=a=>{for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));const t=a[i];a[i]=a[j];a[j]=t}return a};
// Every cosmetic SKU in the wardrobe, in slot order. The single source for "what can a bundle hold".
function allCosmetics(W){
 const out=[];
 for(const [slot,def] of Object.entries(W.ACCESSORIES))for(const id of Object.keys(def.items))if(id!=='none')out.push({slot,sku:'cos:'+slot+':'+id});
 return out;
}
// The SKUs a bundle hands over. `owned` is a Set, an array of SKUs, or null (nothing owned).
// Random by design: the same purchase made twice is very unlikely to give the same items.
function bundleSkus(W,bundle,owned){
 const has=owned&&typeof owned.has==='function'?sku=>owned.has(sku):sku=>Array.isArray(owned)&&owned.includes(sku);
 const mine=allCosmetics(W).filter(x=>!has(x.sku));
 if(!bundle)return [];
 if(bundle.all)return mine.map(x=>x.sku);
 const take=bundle.take||{},picked=[];
 for(const [slot,want] of Object.entries(take)){
  const pool=shuffle(mine.filter(x=>x.slot===slot&&!picked.includes(x.sku)));
  for(const x of pool.slice(0,Math.max(0,Math.min(Number(want)||0,pool.length))))picked.push(x.sku);
 }
 const want=Object.values(take).reduce((n,v)=>n+(Number(v)||0),0);
 if(picked.length<want){
  const rest=shuffle(mine.filter(x=>!picked.includes(x.sku)));
  for(const x of rest.slice(0,want-picked.length))picked.push(x.sku);
 }
 return picked;
}
// How many unlocks a bundle is worth in total, for the panel's "13 items" label.
const bundleSize=b=>b&&b.all?null:Object.values(b&&b.take||{}).reduce((n,v)=>n+(Number(v)||0),0);
function cosmetics(W){
 const out=[];
 for(const [slot,def] of Object.entries(W.ACCESSORIES))for(const [id,label] of Object.entries(def.items)){
  if(id==='none')continue;const sku='cos:'+slot+':'+id;
  out.push({sku,kind:'cosmetic',slot,slotLabel:def.label,id,name:label,price:PRICE_OVERRIDES[sku]??SLOT_PRICES[slot],group:def.label,maxQty:1});
 }
 return out;
}
function catalog(W){return {version:VERSION,currency:CURRENCY,slots:Object.keys(W.ACCESSORIES),items:[...cosmetics(W),...BUNDLES,...SUPPLIES]}}
function find(W,sku){return catalog(W).items.find(i=>i.sku===sku)||null}
// Which paid items a look is wearing, as SKUs. Legacy saves (halo/glasses/wings booleans) are read
// through the wardrobe's own normalize(), so the server and the game agree on exactly the same list.
function wornSkus(W,appearance){const a=W.normalize(appearance);if(!a)return [];return Object.keys(W.ACCESSORIES).filter(k=>a[k]!=='none').map(k=>'cos:'+k+':'+a[k])}
// The same look with every unowned paid slot set back to None. `owns(sku)` answers ownership.
function strip(W,appearance,owns){const a=W.normalize(appearance);if(!a)return null;for(const k of Object.keys(W.ACCESSORIES))if(a[k]!=='none'&&!owns('cos:'+k+':'+a[k]))a[k]='none';return W.normalize(a)}
function money(cents,currency=CURRENCY){const n=Math.max(0,Math.floor(Number(cents)||0))/100;try{return new Intl.NumberFormat('en-US',{style:'currency',currency:currency.toUpperCase()}).format(n)}catch(e){return currency.toUpperCase()+' '+n.toFixed(2)}}
const SKU_RE=/^(cos:[a-z]+:[A-Za-z0-9]+|sup:[A-Za-z0-9]+:[0-9]+|bnd:[a-z]+)$/;
return {VERSION,CURRENCY,MIN_PRICE,MAX_QTY,SLOT_PRICES,PRICE_OVERRIDES,RESOURCES,SUPPLIES,BUNDLES,SKU_RE,cosmetics,allCosmetics,bundleSkus,bundleSize,catalog,find,wornSkus,strip,money};
});
