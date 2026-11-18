// Exercise the real emblem renderer and verify compressed icons preserve every source pixel.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import sharp from 'sharp';
const require=createRequire(import.meta.url);
const {createGame}=require('./helpers/game');
const g=createGame();
let checked=0,webp=0;
try{
 for(const [name,file] of g.ev('Object.entries(RO_ICONS)')){
  const host=g.window.document.createElement('div');
  host.innerHTML=g.ev('eclipseClassEmblem('+JSON.stringify(name)+')');
  const img=host.querySelector('img.class-ro-icon');
  assert.ok(img,'native emblem for '+name);
  assert.equal(img.getAttribute('src'),'assets/ro_icons/'+file);
  assert.equal(img.getAttribute('alt'),name);
  const png=path.join('assets/ro_icons',file.replace(/\.webp$/,'.png'));
  const original=await sharp(fs.readFileSync(png)).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  const actual=await sharp(fs.readFileSync(path.join('assets/ro_icons',file))).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  assert.equal(actual.info.width,original.info.width,name+' width');
  assert.equal(actual.info.height,original.info.height,name+' height');
  assert.ok(actual.data.equals(original.data),name+' must preserve source RGBA pixels');
  if(file.endsWith('.webp'))webp++;
  checked++;
 }
 assert.ok(checked>=47,'complete native Class Tree map');
 assert.ok(webp>0,'lossless runtime WebPs are used');
 console.log(`PASS: ${checked} real class emblems preserve original pixels (${webp} WebPs)`);
}finally{g.close()}
