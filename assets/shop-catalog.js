/* Cash Shop catalog — the ONE price list. The game reads it as window.PGShop; the Pages Functions
   import the same file (like workers/social imports assets/social-rules.js), so the browser can never
   show a price the server would not charge.

   HOW TO CHANGE PRICES: edit SLOT_PRICES / PRICE_OVERRIDES / SUPPLIES below, bump the ?v= query on the
   <script src="assets/shop-catalog.js"> tag in index.html, and deploy. No Stripe dashboard work is
   needed: Checkout Sessions are created with inline price_data from this list. Prices are whole cents
   (USD); Stripe refuses charges under 50 cents.

   SKU shapes (stable identifiers, stored in D1 entitlements/orders — never rename an existing one):
     cos:<slot>:<accessoryId>   a permanent wardrobe unlock for the account, e.g. cos:backwear:wings
     sup:<resource>:<amount>    a consumable bundle delivered through the existing grants queue */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;root.PGShop=api})(typeof globalThis==='object'?globalThis:this,function(){
'use strict';
const VERSION=1,CURRENCY='usd',MIN_PRICE=50,MAX_QTY=10;
// Every accessory in a wardrobe slot costs the slot price unless it has an override.
const SLOT_PRICES={headwear:249,facewear:199,mouthwear:149,backwear:499};
const PRICE_OVERRIDES={
 'cos:headwear:dragonHelm':349,'cos:headwear:goldDragonHelm':399,
 'cos:backwear:twilightWings':599,'cos:backwear:sandalphonWings':599,'cos:backwear:evilScythe':699,'cos:backwear:blackThunder':699,
};
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
 ['refineScrolls',1,199],['refineScrolls',5,799],['mythicScrolls',1,499],['mythicScrolls',3,1299],
 ['ascMat0',10,299],['ascMat0',30,799],['ascMat1',10,299],['ascMat1',30,799],['ascMat2',5,399],['ascMat2',15,999],
].map(([resource,amount,price])=>({sku:'sup:'+resource+':'+amount,kind:'supply',resource,amount,price,name:RESOURCES[resource].name+' \u00d7'+amount,group:RESOURCES[resource].group,blurb:RESOURCES[resource].blurb,maxQty:MAX_QTY}));
function cosmetics(W){
 const out=[];
 for(const [slot,def] of Object.entries(W.ACCESSORIES))for(const [id,label] of Object.entries(def.items)){
  if(id==='none')continue;const sku='cos:'+slot+':'+id;
  out.push({sku,kind:'cosmetic',slot,slotLabel:def.label,id,name:label,price:PRICE_OVERRIDES[sku]??SLOT_PRICES[slot],group:def.label,maxQty:1});
 }
 return out;
}
function catalog(W){return {version:VERSION,currency:CURRENCY,slots:Object.keys(W.ACCESSORIES),items:[...cosmetics(W),...SUPPLIES]}}
function find(W,sku){return catalog(W).items.find(i=>i.sku===sku)||null}
// Which paid items a look is wearing, as SKUs. Legacy saves (halo/glasses/wings booleans) are read
// through the wardrobe's own normalize(), so the server and the game agree on exactly the same list.
function wornSkus(W,appearance){const a=W.normalize(appearance);if(!a)return [];return Object.keys(W.ACCESSORIES).filter(k=>a[k]!=='none').map(k=>'cos:'+k+':'+a[k])}
// The same look with every unowned paid slot set back to None. `owns(sku)` answers ownership.
function strip(W,appearance,owns){const a=W.normalize(appearance);if(!a)return null;for(const k of Object.keys(W.ACCESSORIES))if(a[k]!=='none'&&!owns('cos:'+k+':'+a[k]))a[k]='none';return W.normalize(a)}
function money(cents,currency=CURRENCY){const n=Math.max(0,Math.floor(Number(cents)||0))/100;try{return new Intl.NumberFormat('en-US',{style:'currency',currency:currency.toUpperCase()}).format(n)}catch(e){return currency.toUpperCase()+' '+n.toFixed(2)}}
const SKU_RE=/^(cos:[a-z]+:[A-Za-z0-9]+|sup:[A-Za-z0-9]+:[0-9]+)$/;
return {VERSION,CURRENCY,MIN_PRICE,MAX_QTY,SLOT_PRICES,PRICE_OVERRIDES,RESOURCES,SUPPLIES,SKU_RE,cosmetics,catalog,find,wornSkus,strip,money};
});
