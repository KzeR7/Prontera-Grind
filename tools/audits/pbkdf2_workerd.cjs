// Synthetic local-workerd PBKDF2 probe; no account DB, real credentials, deployment,
// or publicly accessible benchmark. Local limits/timings are NOT hosted quotas/CPU.
// PG_MINIFLARE_MODULE may name a locally installed Miniflare module directory.
const moduleName=process.env.PG_MINIFLARE_MODULE||'miniflare';
const mod=require(moduleName);
const version=require(moduleName+'/package.json').version;
const {Miniflare}=mod;
const script=`
async function derive(rounds){
  const key=await crypto.subtle.importKey('raw',new TextEncoder().encode('synthetic-only'),'PBKDF2',false,['deriveBits']);
  const salt=Uint8Array.from({length:16},(_,i)=>i);
  await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt,iterations:rounds},key,256);
}
export default {async fetch(request){
  const url=new URL(request.url),rounds=Number(url.searchParams.get('rounds')),mode=url.searchParams.get('mode');
  if(![20000,50000,100000,100001,600000].includes(rounds)||!['one','registration','upgrade','recovery'].includes(mode))
    return new Response('invalid test',{status:400});
  try{
    if(mode==='one') await derive(rounds);
    if(mode==='registration'){await derive(rounds);await derive(rounds)}
    if(mode==='upgrade'){await derive(20000);await derive(rounds)}
    if(mode==='recovery'){await derive(rounds);await Promise.all([derive(rounds),derive(rounds)])}
    return new Response('ok');
  }catch(e){return new Response(e.name+': '+e.message,{status:500})}
}};`;
const oldOptions={host:'127.0.0.1',cf:false,modules:true,compatibilityDate:'2026-10-01',script};
// Miniflare 5 uses a new schema; Miniflare 4 accepts the traditional options.
const options=mod.convertV4MiniflareOptions?mod.convertV4MiniflareOptions(oldOptions):oldOptions;
(async()=>{
  const mf=new Miniflare(options);
  try{
    async function attempt(mode,rounds){
      const start=performance.now();
      const res=await mf.dispatchFetch(`http://localhost/?mode=${mode}&rounds=${rounds}`);
      const body=await res.text();
      return {ok:res.ok,status:res.status,error:res.ok?undefined:body,ms:performance.now()-start};
    }
    // Start the runtime and warm up before recording samples.
    const warm=await attempt('one',20000);if(!warm.ok)throw Error('warmup: '+warm.error);
    const acceptance=[];
    for(const n of [20000,100000,100001,600000]){const r=await attempt('one',n);acceptance.push({iterations:n,ok:r.ok,status:r.status,...(r.error?{error:r.error}:{})});}
    const timings=[];
    for(const rounds of [20000,50000,100000,600000])for(const mode of ['one','registration','upgrade','recovery']){
      const values=[];let failure;
      for(let i=0;i<12;i++){const r=await attempt(mode,rounds);if(!r.ok){failure=r.error;break}values.push(r.ms)}
      values.sort((a,b)=>a-b);
      const round=n=>+n.toFixed(2);
      timings.push({rounds,mode,count:values.length,...(failure?{error:failure}:{medianMs:round((values[5]+values[6])/2),p90Ms:round(values[10])})});
    }
    console.log(JSON.stringify({runtime:'local Miniflare/workerd',miniflareVersion:version,compatibilityDate:'2026-10-01',node:process.version,
      warning:'Wall-clock request timings only; local workerd does not reproduce hosted CPU, quotas, iteration limits or D1. Synthetic inputs; no hashes returned.',acceptance,timings},null,2));
  }finally{await mf.dispose()}
})().catch(e=>{console.error(e);process.exitCode=1});
