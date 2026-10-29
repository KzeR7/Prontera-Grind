// Small, bounded concurrent abuse smoke test. Loopback + in-memory SQLite, synthetic users only.
import assert from 'node:assert/strict';
import { start } from '../dev_server.js';
const srv=await start({port:0,host:'127.0.0.1'});
const base=`http://127.0.0.1:${srv.port}`;
async function post(route,data){
  const r=await fetch(base+route,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
  // Consume but never display response bodies (registration contains synthetic recovery codes).
  await r.arrayBuffer();return r.status;
}
const counts=xs=>Object.fromEntries([...new Set(xs)].sort().map(x=>[x,xs.filter(y=>y===x).length]));
try{
  const start=performance.now();
  const regs=await Promise.all(Array.from({length:12},(_,i)=>post('/api/register',{
    u:'LoadPlayer'+i,p:'Synthetic-password-123!',email:`load${i}@example.test`})));
  assert.deepEqual(counts(regs),{'201':10,'429':2},'concurrent registration limit');
  const attempts=await Promise.all(Array.from({length:12},()=>post('/api/sessions',{
    u:'LoadPlayer0',p:'Wrong-synthetic-password!'})));
  assert.deepEqual(counts(attempts),{'401':5,'429':7},'concurrent per-account login limit');
  console.log(JSON.stringify({environment:'loopback Node/SQLite, synthetic only',
    registration:counts(regs),loginAttempts:counts(attempts),
    elapsedMs:Math.round(performance.now()-start),
    note:'Only 12 concurrent requests per scenario; this is not Cloudflare, WAF, D1, hosted CPU, sustained load or capacity testing.'},null,2));
}finally{await srv.close();srv.sqlite.close()}
