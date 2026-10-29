// Synthetic Cloudflare PREVIEW probe; no production deploy, account database or real credentials.
// Default: remote preview on Cloudflare. --local is only a harness check, NOT hosted evidence.
// A random per-run access token is held in memory; only its SHA-256 digest enters the temporary worker.
import assert from 'node:assert/strict';
import { randomBytes, createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';

const args=process.argv.slice(2);
if(args.length>1 || (args.length===1 && args[0]!=='--local')) throw new Error('Usage: node hosted_scrypt_probe.mjs [--local]');
const local=args[0]==='--local';
const token=randomBytes(32).toString('hex');
const digest=createHash('sha256').update(token).digest('hex');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'pg-scrypt-preview-'));
let child;
const script=`import {scryptSync} from 'node:crypto';
const expected=${JSON.stringify(digest)};
async function authorised(request){
  const header=request.headers.get('Authorization')||'';
  if(!header.startsWith('Bearer '))return false;
  const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(header.slice(7)));
  const actual=[...new Uint8Array(bytes)].map(b=>b.toString(16).padStart(2,'0')).join('');
  let diff=actual.length^expected.length;for(let i=0;i<expected.length;i++)diff|=actual.charCodeAt(i)^expected.charCodeAt(i);
  return diff===0;
}
function derive(){scryptSync('synthetic-only','0123456789abcdef',32,{N:16384,r:8,p:5,maxmem:32*1024*1024})}
export default {async fetch(request){
  if(!(await authorised(request)))return new Response('unauthorised',{status:401});
  const mode=new URL(request.url).searchParams.get('mode');
  if(!['vector','one','registration','recovery'].includes(mode))return new Response('invalid',{status:400});
  try {
    if(mode==='vector'){
      const actual=scryptSync('','',64,{N:16,r:1,p:1,maxmem:1024*1024}).toString('hex');
      const expectedVector='77d6576238657b203b19ca42c18a0497f16b4844e3074ae8dfdffa3fede21442fcd0069ded0948f8326a753a0fc81f17e8d3e0fb2e0d3628cf35e20c38d18906';
      return Response.json({ok:actual===expectedVector});
    }
    derive();if(mode==='registration'||mode==='recovery')derive();if(mode==='recovery')derive();
    return Response.json({ok:true});
  } catch(e) {return Response.json({ok:false,error:String(e.name||'Error'),message:String(e.message||'').slice(0,300)},{status:422})}
}};`;
function freePort(){return new Promise((resolve,reject)=>{const s=net.createServer();s.on('error',reject);s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>resolve(p))})})}
async function stop(){
  if(!child||child.exitCode!==null)return;
  const done=new Promise(resolve=>child.once('exit',resolve));
  if(process.platform==='win32'){
    // taskkill is a Windows system tool; the PID is created by this process, never user input.
    await new Promise(resolve=>{const k=spawn('taskkill',['/pid',String(child.pid),'/T','/F'],{stdio:'ignore'});k.once('exit',resolve);k.once('error',resolve)});
  }else{try{process.kill(-child.pid,'SIGTERM')}catch{}}
  await Promise.race([done,new Promise(resolve=>setTimeout(resolve,3000))]);
}
try {
  fs.writeFileSync(path.join(temp,'probe.mjs'),script);
  // A unique preview worker, no routes or bindings: never load the repository config or its D1.
  const workerName='pg-scrypt-preview-'+randomBytes(8).toString('hex');
  fs.writeFileSync(path.join(temp,'wrangler.jsonc'),JSON.stringify({name:workerName,main:'probe.mjs',compatibility_date:'2026-10-01'},null,2));
  const port=await freePort();
  const argv=['--yes','wrangler@4.154.0','dev',...(local?[]:['--remote']),'--config','wrangler.jsonc','--ip','127.0.0.1','--port',String(port),'--show-interactive-dev-session=false'];
  // Every argument above is fixed by this script, except a locally generated integer port.
  const command=process.platform==='win32'?(process.env.ComSpec||'cmd.exe'):'npx';
  const childArgs=process.platform==='win32'?['/d','/s','/c','npx.cmd '+argv.join(' ')]:argv;
  child=spawn(command,childArgs,{cwd:temp,env:{...process.env,WRANGLER_SEND_METRICS:'false'},stdio:['ignore','pipe','pipe'],detached:process.platform!=='win32'});
  let output='';
  await new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>reject(new Error('Preview startup timed out; check your Wrangler login and network.')),120000);
    function recv(d){output+=d.toString().replaceAll(token,'[redacted]');if(output.includes('Ready on http')){clearTimeout(timer);resolve()}}
    child.stdout.on('data',recv);child.stderr.on('data',recv);
    child.once('error',e=>{clearTimeout(timer);reject(e)});
    // Do not print Wrangler logs: they can contain account or preview information.
    child.once('exit',code=>{clearTimeout(timer);reject(new Error('Preview exited ('+code+'). Check Wrangler login, account selection and network privately.'))});
  });
  const base=`http://127.0.0.1:${port}/`;
  const bad=await fetch(base+'?mode=one');
  assert.equal(bad.status,401,'probe must reject unauthorised requests before hashing');
  const results=[];
  async function probe(mode){
    const started=performance.now();
    try {
      const r=await fetch(base+`?mode=${mode}`,{headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(30000)});
      const text=await r.text();let json;try{json=JSON.parse(text)}catch{json=null}
      return {mode,status:r.status,accepted:r.ok&&json?.ok===true,
        ...(json?.message?{error:json.error,message:json.message}:{...(!r.ok?{error:'non-JSON or runtime error'}:{})}),
        elapsedMs:+(performance.now()-started).toFixed(1)};
    }catch(e){return {mode,accepted:false,error:'request failed or timed out',elapsedMs:+(performance.now()-started).toFixed(1)}}
  }
  results.push(await probe('vector'));
  if(results.at(-1).accepted)results.push(await probe('one'));
  if(results.at(-1).mode==='one' && results.at(-1).accepted){results.push(await probe('registration'));results.push(await probe('recovery'));}
  console.log(JSON.stringify({environment:local?'LOCAL ONLY — not hosted proof':'Cloudflare remote preview',
    candidate:'scrypt N=16384, r=8, p=5; one, two and three sequential synthetic derivations',
    note:'Synthetic inputs, no database. Elapsed time includes networking and is not CPU usage. A few successful requests do not prove sustained hosted quota, resource safety, concurrency or endpoint safety.',results},null,2));
}finally{await stop();fs.rmSync(temp,{recursive:true,force:true})}
