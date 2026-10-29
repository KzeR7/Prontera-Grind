// Local, synthetic workerd-only scrypt feasibility probe; not an auth implementation.
// No deployed worker, public endpoint, account DB, real passwords or secrets.
import { createRequire } from 'node:module';
const require=createRequire(import.meta.url),name=process.env.PG_MINIFLARE_MODULE||'miniflare';
const mod=require(name),version=require(name+'/package.json').version;
const script=`import {scryptSync} from 'node:crypto';
const expected='77d6576238657b203b19ca42c18a0497f16b4844e3074ae8dfdffa3fede21442fcd0069ded0948f8326a753a0fc81f17e8d3e0fb2e0d3628cf35e20c38d18906';
function derive(){scryptSync('synthetic-only','0123456789abcdef',32,{N:16384,r:8,p:5,maxmem:32*1024*1024})}
export default {async fetch(req){
 const mode=new URL(req.url).searchParams.get('mode');
 try{
  if(mode==='vector')return Response.json({ok:scryptSync('','',64,{N:16,r:1,p:1,maxmem:1024*1024}).toString('hex')===expected});
  if(mode==='one')derive();else if(mode==='register'){derive();derive()}
  else if(mode==='recovery'){derive();derive();derive()}
  else return new Response('invalid',{status:400});
  return Response.json({ok:true});
 }catch(e){return Response.json({ok:false,error:String(e.name),message:String(e.message).slice(0,200)},{status:422})}
}};`;
const old={host:'127.0.0.1',cf:false,modules:true,compatibilityDate:'2026-10-01',script};
const mf=new mod.Miniflare(mod.convertV4MiniflareOptions?mod.convertV4MiniflareOptions(old):old);
try{
 async function attempt(mode){const start=performance.now();const r=await mf.dispatchFetch('http://localhost/?mode='+mode);const data=await r.json();return {ok:r.ok&&data.ok===true,...(!data.ok?{error:data.error,message:data.message}:{}),ms:performance.now()-start}}
 const vector=await attempt('vector');if(!vector.ok)throw Error('RFC 7914 synthetic test vector failed: '+JSON.stringify(vector));
 const warm=await attempt('one');if(!warm.ok)throw Error('local scrypt probe unavailable: '+JSON.stringify(warm));
 const results=[];
 for(const mode of ['one','register','recovery']){
  const values=[];for(let i=0;i<5;i++){const r=await attempt(mode);if(!r.ok)throw Error(mode+' failed: '+JSON.stringify(r));values.push(r.ms)}
  values.sort((a,b)=>a-b);results.push({mode,samples:values.length,medianWallMs:+values[2].toFixed(2),minWallMs:+values[0].toFixed(2),maxWallMs:+values[4].toFixed(2)});
 }
 console.log(JSON.stringify({runtime:'local Miniflare/workerd',miniflareVersion:version,node:process.version,
  compatibilityDate:'2026-10-01',vector:'RFC 7914 empty password/salt: passed',
  candidate:'scrypt N=16384, r=8, p=5, maxmem=32 MiB, 32-byte output (synthetic inputs)',
  warning:'Only five sequential samples, local request wall time, not hosted CPU, memory pressure, limits, cost or D1. No hashes returned; do not deploy based on this.',results},null,2));
}finally{await mf.dispose()}
