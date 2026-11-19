// Publish-only JSON whitespace and standalone CSS comment reduction. Sources stay untouched.
// Only these four kit documents are plain JSON fetched with response.json(); native
// metadata has byte/hash contracts and MUST NOT be processed here.
'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const FILES=Object.freeze(['ro-map-payon.json','ro-map-morocc.json','ro-spritesheet.json','ro-tiles-hd.json']);
// Include the plaza styles so the new guide fits the existing classic delivery ceiling.
// publish_sim compares every parsed rule before/after; no stylesheet semantics change.
const CSS_FILES=Object.freeze(['assets/ui/eclipse.css','assets/ui/mobile.css','assets/social.css','assets/social-fishing.css']);
function stripStandaloneCssComments(css){
 let quote='',last=0,out='';
 for(let i=0;i<css.length;i++){
  const ch=css[i];
  if(ch==='\\'){i++;continue}
  if(quote){if(ch===quote)quote='';continue}
  if(ch==='"'||ch==="'"){quote=ch;continue}
  if(ch!=='/'||css[i+1]!=='*')continue;
  const end=css.indexOf('*/',i+2);
  if(end<0)throw Error('Unclosed CSS comment');
  const startLine=css.lastIndexOf('\n',i-1)+1,nextLine=css.indexOf('\n',end+2);
  if(!css.slice(startLine,i).trim()&&!css.slice(end+2,nextLine<0?css.length:nextLine).trim()){
   out+=css.slice(last,i);last=end+2;
  }
  i=end+1;
 }
 return out+css.slice(last);
}
function optimize(output){
 let saved=0;
 // index.html's static head stylesheet is subject to the same parsed-rule contract.
 const htmlPath=path.join(output,'index.html'),html=fs.readFileSync(htmlPath,'utf8');
 const compact=html.replace(/<style>([\s\S]*?)<\/style>/,(_,css)=>'<style>'+stripStandaloneCssComments(css)+'</style>');
 if(compact!==html){fs.writeFileSync(htmlPath,compact);saved+=Buffer.byteLength(html)-Buffer.byteLength(compact);}

 for(const file of FILES){
  const target=path.join(output,'assets/kit',file),before=fs.readFileSync(target),value=JSON.parse(before.toString('utf8')),after=Buffer.from(JSON.stringify(value));
  // Reject any number/structure change (including negative zero); don't silently rewrite content.
  assert.deepEqual(JSON.parse(after.toString('utf8')),value,'Delivery JSON must preserve parsed values: '+file);
  if(after.length<before.length){fs.writeFileSync(target,after);saved+=before.length-after.length;}
 }
 for(const file of CSS_FILES){
  const target=path.join(output,file),before=fs.readFileSync(target,'utf8'),after=stripStandaloneCssComments(before);
  if(after!==before){fs.writeFileSync(target,after);saved+=Buffer.byteLength(before)-Buffer.byteLength(after)}
 }
 return saved;
}
if(require.main===module){if(!process.argv[2])throw Error('Pass the assembled publish directory');console.log('  JSON whitespace / CSS comments removed: '+optimize(path.resolve(process.argv[2]))+' bytes (source art/native packs unchanged)');}
module.exports={FILES,CSS_FILES,stripStandaloneCssComments,optimize};
