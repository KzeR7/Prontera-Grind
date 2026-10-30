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
if(args.length>1 || (args.length===1 && args[0]!=='--local')) throw new Error('Usage: node hosted_pbkdf2_probe.mjs [--local]');
const local=args[0]==='--local';
const token=randomBytes(32).toString('hex');
const digest=createHash('sha256').update(token).digest('hex');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'pg-hash-preview-'));
let child;
const script=`const expected=${JSON.stringify(digest)};
async function authorised(request){
  const header=request.headers.get('Authorization')||'';
  if(!header.startsWith('Bearer '))return false;
  const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(header.slice(7)));
  const actual=[...new Uint8Array(bytes)].map(b=>b.toString(16).padStart(2,'0')).join('');
  let diff=actual.length^expected.length;for(let i=0;i<expected.length;i++)diff|=actual.charCodeAt(i)^expected.charCodeAt(i);
  return diff===0;
}
async function derive(iterations){
  const key=await crypto.subtle.importKey('raw',new TextEncoder().encode('synthetic-only'),'PBKDF2',false,['deriveBits']);
  await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt:new Uint8Array(16),iterations},key,256);
}
export default {async fetch(request){
  if(!(await authorised(request)))return new Response('unauthorised',{status:401});
  const u=new URL(request.url),mode=u.searchParams.get('mode'),iterations=Number(u.searchParams.get('iterations'));
  if(!['one','registration','recovery'].includes(mode)||![20000,100000,100001,600000].includes(iterations))
    return new Response('invalid',{status:400});
  try {
    if(mode==='one')await derive(iterations);
    if(mode==='registration'){await derive(iterations);await derive(iterations)}
    if(mode==='recovery'){await derive(iterations);await Promise.all([derive(iterations),derive(iterations)])}
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
  const workerName='pg-hash-preview-'+randomBytes(8).toString('hex');
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
  const bad=await fetch(base+'?mode=one&iterations=20000');
  assert.equal(bad.status,401,'probe must reject unauthorised requests before hashing');
  const results=[];
  async function probe(mode,iterations){
    const started=performance.now();
    try {
      const r=await fetch(base+`?mode=${mode}&iterations=${iterations}`,{headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(30000)});
      const text=await r.text();let json;try{json=JSON.parse(text)}catch{json=null}
      return {mode,iterations,status:r.status,accepted:r.ok&&json?.ok===true,
        ...(json?.message?{error:json.error,message:json.message}:{...(!r.ok?{error:'non-JSON or runtime error'}:{})}),
        elapsedMs:+(performance.now()-started).toFixed(1)};
    }catch(e){return {mode,iterations,accepted:false,error:'request failed or timed out',elapsedMs:+(performance.now()-started).toFixed(1)}}
  }
  for(const n of [20000,100000,100001,600000])results.push(await probe('one',n));
  if(results.at(-1).accepted){results.push(await probe('registration',600000));results.push(await probe('recovery',600000));}
  console.log(JSON.stringify({environment:local?'LOCAL ONLY — not hosted proof':'Cloudflare remote preview',
    note:'Synthetic inputs, no database. Elapsed time includes networking and is not CPU usage. A few successful requests do not prove sustained hosted quota or endpoint safety.',results},null,2));
}finally{await stop();fs.rmSync(temp,{recursive:true,force:true})}
