import {WebSocketServer} from 'ws';
import {SocialRoom} from '../../workers/social/room.mjs';
import {currentUser} from '../../functions/_lib/auth.js';
export function attachSocial(server,DB,{previewAuth=false}={}){
 const room=new SocialRoom(),wss=new WebSocketServer({noServer:true,maxPayload:4096});
 server.on('upgrade',async(req,socket,head)=>{
 try{const [pathname,query='']=String(req.url||'').split('?');
 const rawHost=String(req.headers['x-forwarded-host']||req.headers.host||'').split(',')[0].trim(),host=req.headers.host||'';
 const okOrigin=!!req.headers.origin&&(req.headers.origin==='http://'+host||req.headers.origin==='https://'+host||(rawHost&&(req.headers.origin==='http://'+rawHost||req.headers.origin==='https://'+rawHost)));
 if(pathname!=='/api/social'||(!previewAuth&&req.url!=='/api/social')||!okOrigin){socket.end('HTTP/1.1 403 Forbidden\r\n\r\n');return;}
 const ps=previewAuth&&!/\bpg_session=/.test(req.headers.cookie||'')?new URLSearchParams(query).get('preview_session'):null;
 const cookie=ps?(req.headers.cookie?req.headers.cookie+'; ':'')+'pg_session='+encodeURIComponent(ps):req.headers.cookie;
 const user=await currentUser({headers:{get:k=>k.toLowerCase()==='cookie'?cookie:req.headers[k.toLowerCase()]}},DB);
 if(!user){socket.end('HTTP/1.1 401 Unauthorized\r\n\r\n');return;}
 wss.handleUpgrade(req,socket,head,ws=>{const c=room.connect(user,s=>ws.send(s),(code,why)=>ws.close(code,why));ws.on('message',data=>room.receive(c,data.toString()));ws.on('close',()=>room.disconnect(c));ws.on('error',()=>room.disconnect(c));});
 }catch{socket.destroy()}});
 const timer=setInterval(()=>room.sweep(),60000);timer.unref();server.on('close',()=>{clearInterval(timer);wss.close()});
}
