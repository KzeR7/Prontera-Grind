import * as C from '../../functions/_lib/save-codec.js';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { createGame } = require('./helpers/game');
const g = createGame(), ev = g.ev;

// a REAL 415 KB save, at Demonz's field budget, built from the game's own generator
const save = ev(`(()=>{
  S=load();
  const slots=['weapon','armor','head','off','leg','acc'];
  const items=[];
  for(let i=0;i<892;i++){
    const map=i%10, sec=i%6, k=i%6;
    items.push(genGear({k:slots[k],n:'Plate Armor',quality:1},145,sec,false,undefined,map,10));
  }
  const cards=[];
  for(let i=0;i<1232;i++)cards.push({id:1712345678000+i,name:['Shadow Beast Card','Doom Tree Card','Hell Worm Card','Dark Lord Card'][i%4],v:[3,5,8,13][i%4],key:['crit','atk','def','matk'][i%4],tier:[0,1,2,3][i%4],slot:['armor','weapon','head','acc'][i%4]});
  const fish=[];
  for(let i=0;i<818;i++)fish.push({id:'fish'+i,sp:['Magikarp','Poring Fish','Golden Koi','Tuna'][i%4],w:Math.round((1+(i%50))*1.37*100)/100,mut:i%7?null:['shiny','giant'][i%2],at:1712345678901+i,perfect:i%5===0});
  return {owner:'demonz',accountId:1,lv:145,inv:items,cards,fishing:{bagTier:6,bag:fish},zeny:1234567,st:{str:99,agi:99},pts:0,kills:50000};})()`);
g.close();

const before = JSON.stringify(save);
const packed = C.packSave(save);
const packedStr = JSON.stringify(packed);
const back = C.unpackSave(JSON.parse(packedStr));
const after = JSON.stringify(back);

let fails=0;
const ok=(n,c,d)=>{ if(c)console.log('  ok   '+n); else {fails++;console.log('  FAIL '+n+(d?' -> '+d:''))} };

ok('the REAL save round-trips byte for byte', before===after);
ok('items        : '+save.inv.length+' -> '+back.inv.length, save.inv.length===back.inv.length);
ok('cards        : '+save.cards.length+' -> '+back.cards.length, save.cards.length===back.cards.length);
ok('fish         : '+save.fishing.bag.length+' -> '+back.fishing.bag.length, save.fishing.bag.length===back.fishing.bag.length);
ok('fishing bagTier preserved', back.fishing.bagTier===6);
ok('zeny / st / kills preserved', back.zeny===save.zeny && JSON.stringify(back.st)===JSON.stringify(save.st) && back.kills===save.kills);

// EVERY item, EVERY field - the acceptance test the owner asked for
let bad=[];
for(let i=0;i<save.inv.length;i++){
  const a=save.inv[i],b=back.inv[i];
  for(const k of new Set([...Object.keys(a),...Object.keys(b)])){
    if(JSON.stringify(a[k])!==JSON.stringify(b[k])) bad.push('item'+i+'.'+k);
  }
}
ok('every field of all '+save.inv.length+' items identical', bad.length===0, bad.slice(0,5).join(','));
let cbad=[], fbad=[];
for(let i=0;i<save.cards.length;i++){const a=save.cards[i],b=back.cards[i];
  for(const k of new Set([...Object.keys(a),...Object.keys(b)])) if(JSON.stringify(a[k])!==JSON.stringify(b[k])) cbad.push('card'+i+'.'+k);}
for(let i=0;i<save.fishing.bag.length;i++){const a=save.fishing.bag[i],b=back.fishing.bag[i];
  for(const k of new Set([...Object.keys(a),...Object.keys(b)])) if(JSON.stringify(a[k])!==JSON.stringify(b[k])) fbad.push('fish'+i+'.'+k);}
ok('every field of all '+save.cards.length+' cards identical', cbad.length===0, cbad.slice(0,4).join(','));
ok('every field of all '+save.fishing.bag.length+' fish identical', fbad.length===0, fbad.slice(0,4).join(','));

// the numbers the player would notice
const tot=a=>a.reduce((s,it)=>s+(it.val||0),0);
const aff=a=>a.reduce((s,it)=>s+it.aff.reduce((t,x)=>t+x.v,0),0);
ok('summed item value identical', tot(save.inv)===tot(back.inv));
ok('summed affix value identical', aff(save.inv)===aff(back.inv));

console.log('');
console.log('  SAVE SIZE :'+String(before.length.toLocaleString()).padStart(9)+' B -> '+packedStr.length.toLocaleString()+' B   ('+(100*(1-packedStr.length/before.length)).toFixed(1)+'% smaller)');
console.log('  300 KB ceiling:', (before.length/1024).toFixed(0)+' KB is refused;  '+(packedStr.length/1024).toFixed(0)+' KB fits'+(packedStr.length<307200?'  ✔':'  ✘'));
console.log('');
console.log(fails?fails+' FAILED':'ALL PASSED');
process.exit(fails?1:0);
