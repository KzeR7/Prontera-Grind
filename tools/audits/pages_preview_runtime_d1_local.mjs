// Local workerd/D1 only: a preview must not touch even an accidentally bound DB.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),mod=require(process.env.PG_MINIFLARE_MODULE||'miniflare');
const source=fs.readFileSync('functions/api/_middleware.js','utf8').replace('export async function onRequest','async function onRequest');
const script=source+`\nexport default {async fetch(request,env){return onRequest({request,next:async()=>{
 const r=await env.DB.prepare('UPDATE probe SET n=n+1 RETURNING n').first();return Response.json(r);
}})}}`;
const options={host:'127.0.0.1',cf:false,modules:true,compatibilityDate:'2026-10-01',script,d1Databases:{DB:'synthetic-preview-guard'}};
const mf=new mod.Miniflare(mod.convertV4MiniflareOptions?mod.convertV4MiniflareOptions(options):options);
try{
 const db=await mf.getD1Database('DB');await db.exec('CREATE TABLE probe(n INTEGER); INSERT INTO probe VALUES(0);');
 for(const host of ['branch.prontera-grind.pages.dev','abcdef12.prontera-grind.pages.dev']){
  const r=await mf.dispatchFetch('https://'+host+'/api/save');assert.equal(r.status,503);
 }
 assert.equal((await db.prepare('SELECT n FROM probe').first()).n,0,'preview never touched bound database');
 for(const host of ['prontera-grind.pages.dev','abcdef12.prontera-grind-staging.pages.dev']){
  const r=await mf.dispatchFetch('https://'+host+'/api/save');assert.equal(r.status,200);
 }
 assert.equal((await db.prepare('SELECT n FROM probe').first()).n,2);
 console.log('PASS: disposable workerd middleware blocks preview DB access and permits production/staging hosts');
}finally{await mf.dispose()}
