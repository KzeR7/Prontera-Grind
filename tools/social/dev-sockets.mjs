import {WebSocketServer} from 'ws';
import {SocialRoom,FISHING_MVP_IDS,SOCIAL_MAX_ROOMS} from '../../workers/social/room.mjs';
import {currentUser} from '../../functions/_lib/auth.js';

const response=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});

export function attachSocial(server,DB,{previewAuth=false}={}){
 const room=new SocialRoom(),wss=new WebSocketServer({noServer:true,maxPayload:4096});
 server.on('upgrade',async(req,socket,head)=>{
  try{
   const [pathname,query='']=String(req.url||'').split('?');
   const rawHost=String(req.headers['x-forwarded-host']||req.headers.host||'').split(',')[0].trim(),host=req.headers.host||'';
   const okOrigin=!!req.headers.origin&&(req.headers.origin==='http://'+host||req.headers.origin==='https://'+host||(rawHost&&(req.headers.origin==='http://'+rawHost||req.headers.origin==='https://'+rawHost)));
   if(pathname!=='/api/social'||(!previewAuth&&req.url!=='/api/social')||!okOrigin){socket.end('HTTP/1.1 403 Forbidden\r\n\r\n');return;}
   const ps=previewAuth&&!/\bpg_session=/.test(req.headers.cookie||'')?new URLSearchParams(query).get('preview_session'):null;
   const cookie=ps?(req.headers.cookie?req.headers.cookie+'; ':'')+'pg_session='+encodeURIComponent(ps):req.headers.cookie;
   const user=await currentUser({headers:{get:k=>k.toLowerCase()==='cookie'?cookie:req.headers[k.toLowerCase()]}},DB);
   if(!user){socket.end('HTTP/1.1 401 Unauthorized\r\n\r\n');return;}
   wss.handleUpgrade(req,socket,head,ws=>{const c=room.connect(user,s=>ws.send(s),(code,why)=>ws.close(code,why));ws.on('message',data=>room.receive(c,data.toString()));ws.on('close',()=>room.disconnect(c));ws.on('error',()=>room.disconnect(c));});
  }catch{socket.destroy()}
 });
 const timer=setInterval(()=>room.sweep(),60000),battleTimer=setInterval(()=>room.tickBattles(),250);timer.unref();battleTimer.unref();server.on('close',()=>{clearInterval(timer);clearInterval(battleTimer);wss.close()});
 // Offline Pages preview binding. The public route still authenticates the account in the Pages
 // handler; this private shim mirrors the Social Worker command so the console works without Cloudflare.
 return {
  idFromName:name=>{if(name!=='world')throw Error('Unknown local Social object');return name},
  get:()=>({fetch:async request=>{
   const url=new URL(request.url);if(url.pathname!=='/gm/fishing-mvp')return new Response('Not found',{status:404});
   if(request.method!=='POST')return response({err:'POST required'},405);
   let admin=null;try{admin=JSON.parse(request.headers.get('X-Social-Admin')||'null')}catch{}
   if(!admin||!Number.isInteger(admin.id)||admin.id<1||typeof admin.username!=='string'||!Number.isInteger(admin.gm)||admin.gm<1)return response({err:'Authenticated GM identity required'},403);
   let body=null;try{body=await request.json()}catch{}
   if(!body||typeof body!=='object'||Array.isArray(body))return response({err:'Invalid spawn request'},400);
   const roomId=body.room,species=body.species===null||body.species===''||body.species===undefined?null:body.species;
   if(!Number.isInteger(roomId)||roomId<1||roomId>SOCIAL_MAX_ROOMS)return response({err:`Choose a plaza room from 1 to ${SOCIAL_MAX_ROOMS}.`},400);
   if(species!==null&&(typeof species!=='string'||!FISHING_MVP_IDS.includes(species)))return response({err:'Unknown Fishing MVP'},400);
   if(room.mvpActive.has(roomId))return response({err:'An MVP is already active in that plaza room.'},409);
   const spawn=room.spawnMvp(roomId,Date.now(),species);
   return spawn?response({ok:true,...spawn}):response({err:'The Social room could not spawn that MVP.'},409);
  }})
 };
}
