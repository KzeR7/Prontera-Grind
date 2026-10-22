import assert from 'node:assert/strict';
import {WebSocket} from 'ws';
import {start,makeD1} from '../dev_server.js';
import {onRequestGet} from '../../functions/api/social.js';
const service=await start({port:0}),base='http://127.0.0.1:'+service.port;
const sockets=[];
try{
 const make=async u=>{const r=await fetch(base+'/api/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({u,p:'SyntheticSocial123!'})});assert.equal(r.status,201);return r.headers.get('set-cookie').split(';')[0]};
 const [ca,cb]=await Promise.all([make('social_api_a'),make('social_api_b')]);
 async function rejected(cookie,origin){return new Promise(resolve=>{const ws=new WebSocket(base.replace('http','ws')+'/api/social',{headers:{Cookie:cookie,Origin:origin}});ws.on('unexpected-response',(_,res)=>{ws.terminate();resolve(res.statusCode)});ws.on('error',()=>{});})}
 assert.equal(await rejected('',base),401);assert.equal(await rejected(ca,'https://elsewhere.invalid'),403);
 async function socket(cookie){return new Promise((resolve,reject)=>{const ws=new WebSocket(base.replace('http','ws')+'/api/social',{headers:{Cookie:cookie,Origin:base}});const events=[];ws.on('error',reject);ws.on('message',raw=>{const e=JSON.parse(raw);events.push(e);if(e.type==='hello')resolve({ws,events})});sockets.push(ws)})}
 const a=await socket(ca),b=await socket(cb);const wait=async fn=>{const end=Date.now()+3000;while(!fn()){if(Date.now()>end)throw Error('Socket assertion timed out');await new Promise(r=>setTimeout(r,10))}};
 a.ws.send(JSON.stringify({type:'chat',channel:'whisper',to:'social_api_b',body:'private <script> text'}));await wait(()=>b.events.some(e=>e.body==='private <script> text'));assert.equal(b.events.at(-1).name,'social_api_a');
 a.ws.send(JSON.stringify({type:'join',look:{cls:'Novice',appearance:{version:1,sex:'m'}}}));b.ws.send(JSON.stringify({type:'join',look:{cls:'Novice',appearance:{version:1,sex:'m'}}}));await wait(()=>a.events.some(e=>e.type==='room')&&b.events.some(e=>e.type==='room'));
 b.ws.send(JSON.stringify({type:'emotion',emotion:'heart'}));await wait(()=>a.events.some(e=>e.emotion==='heart'));
 a.ws.close();await wait(()=>b.events.some(e=>e.type==='left'));
 let forwarded;const proxy=await onRequestGet({request:new Request(base+'/api/social',{headers:{Origin:base,Cookie:ca,Upgrade:'websocket','X-Social-Identity':'{\"id\":999}'}}),env:{DB:makeD1(service.sqlite),SOCIAL:{idFromName:n=>n,get:()=>({fetch:async request=>{forwarded=request;return new Response('bound')}})}}});assert.equal(proxy.status,200);assert.equal(forwarded.method,'GET');assert.equal(forwarded.headers.get('Upgrade'),'websocket');assert.equal(JSON.parse(forwarded.headers.get('X-Social-Identity')).username,'social_api_a');assert.notEqual(JSON.parse(forwarded.headers.get('X-Social-Identity')).id,999);
 const noOrigin=await onRequestGet({request:new Request(base+'/api/social'),env:{}});assert.equal(noOrigin.status,403);
 // HTTPS Origin matching Host succeeds without x-forwarded-proto (proxy WebSocket tunnels), while preview_session stays disabled on non-preview servers.
 const httpsOrigin='https://127.0.0.1:'+service.port;
 const httpsClient=await new Promise((resolve,reject)=>{const ws=new WebSocket(base.replace('http','ws')+'/api/social',{headers:{Cookie:ca,Origin:httpsOrigin}});ws.on('error',reject);ws.on('message',raw=>{const e=JSON.parse(raw);if(e.type==='hello')resolve(ws)});sockets.push(ws)});
 httpsClient.close();
 const nonPreviewToken=await new Promise(resolve=>{const ws=new WebSocket(base.replace('http','ws')+'/api/social?preview_session=fake',{headers:{Origin:base}});ws.on('unexpected-response',(_,res)=>{ws.terminate();resolve(res.statusCode)});ws.on('error',()=>{})});
 assert.equal(nonPreviewToken,403);
 // Throwaway --gm-all preview server supports cross-site iframe cookie blocking via X-Preview-Session / preview_session while keeping cross-origin 403.
 const preview=await start({port:0,gmAll:true}),pbase='http://127.0.0.1:'+preview.port,pOrigin='https://127.0.0.1:'+preview.port;
 try{
  const reg=await fetch(pbase+'/api/register',{method:'POST',headers:{'Content-Type':'application/json',Origin:pOrigin},body:JSON.stringify({u:'preview_iframe_a',p:'SyntheticSocial123!'})});
  assert.equal(reg.status,201);
  const setCookie=reg.headers.get('set-cookie')||'';assert.match(setCookie,/SameSite=None;\s*Partitioned/i);
  const ptok=reg.headers.get('x-preview-session');assert(ptok&&ptok.length>16);
  const me=await fetch(pbase+'/api/me',{headers:{Origin:pOrigin,'X-Preview-Session':ptok}});assert.equal(me.status,200);assert.equal((await me.json()).u,'preview_iframe_a');
  const pws=await new Promise((resolve,reject)=>{const ws=new WebSocket(pbase.replace('http','ws')+'/api/social?preview_session='+encodeURIComponent(ptok),{headers:{Origin:pOrigin}});const events=[];ws.on('error',reject);ws.on('message',raw=>{const e=JSON.parse(raw);events.push(e);if(e.type==='hello'){ws.send(JSON.stringify({type:'join',look:{cls:'Novice',appearance:{version:1,sex:'m'}}}))}if(e.type==='room')resolve({ws,events})})});
  const roomEvt=pws.events.find(e=>e.type==='room');assert.equal(roomEvt.room,1);assert.equal(roomEvt.players[0].name,'preview_iframe_a');pws.ws.terminate();
  const badOrigin=await new Promise(resolve=>{const ws=new WebSocket(pbase.replace('http','ws')+'/api/social?preview_session='+encodeURIComponent(ptok),{headers:{Origin:'https://evil.invalid'}});ws.on('unexpected-response',(_,res)=>{ws.terminate();resolve(res.statusCode)});ws.on('error',()=>{})});
  assert.equal(badOrigin,403);
 }finally{await preview.close();preview.sqlite.close()}
 console.log('PASS real WebSockets: session cookie authentication, HTTPS proxy & cross-site preview fallback, cross-origin rejection, whisper identity/content, plaza emotions and disconnect presence; Pages rejects absent Origin');
}finally{for(const ws of sockets)ws.terminate();await service.close();service.sqlite.close()}
