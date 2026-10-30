// Defence-in-depth routing, independent of Cloudflare's binding inheritance.
import assert from 'node:assert/strict';
import { onRequest } from '../../functions/api/_middleware.js';
const check=async host=>{
 let reached=false;
 const r=await onRequest({request:new Request('https://'+host+'/api/save'),next:()=>{reached=true;return new Response('next')}});
 return {r,reached};
};
for(const host of ['branch.horizonhaven.pages.dev','02df8a40.horizonhaven.pages.dev','BRANCH.HORIZONHAVEN.PAGES.DEV.','branch.prontera-grind.pages.dev','abcdef12.prontera-grind.pages.dev','BRANCH.PRONTERA-GRIND.PAGES.DEV.']){
 const {r,reached}=await check(host);assert.equal(r.status,503);assert.equal(reached,false);assert.match((await r.json()).err,/disabled/);
}
for(const host of ['horizonhaven.pages.dev','prontera-grind.pages.dev','prontera-grind-staging.pages.dev','abcdef12.prontera-grind-staging.pages.dev','localhost']){
 const {r,reached}=await check(host);assert.equal(r.status,200);assert.equal(reached,true);
}
let reached=false;
const proxy=await onRequest({request:new Request('http://127.0.0.1:8787/api/me',{headers:{Host:'branch.horizonhaven.pages.dev'}}),next:()=>{reached=true;return new Response('next')}});
assert.equal(proxy.status,503);assert.equal(reached,false,'external Host cannot bypass preview refusal');
const legacyProxy=await onRequest({request:new Request('http://127.0.0.1:8787/api/me',{headers:{Host:'branch.prontera-grind.pages.dev'}}),next:()=>{reached=true;return new Response('next')}});
assert.equal(legacyProxy.status,503);assert.equal(reached,false,'legacy preview Host still refused');
console.log('PASS: production-project preview APIs fail closed; production hostname and isolated staging are unaffected');
