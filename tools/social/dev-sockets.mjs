import {WebSocketServer} from 'ws';
import {SocialRoom} from '../../workers/social/room.mjs';
import {currentUser} from '../../functions/_lib/auth.js';
export function attachSocial(server,DB){
 const room=new SocialRoom(),wss=new WebSocketServer({noServer:true,maxPayload:4096});
 server.on('upgrade',async(req,socket,head)=>{
 try{const origin='http://'+req.headers.host;
 if(req.url!=='/api/social'||req.headers.origin!==origin){socket.end('HTTP/1.1 403 Forbidden\r\n\r\n');return;}
 const user=await currentUser({headers:{get:k=>req.headers[k.toLowerCase()]}},DB);
 if(!user){socket.end('HTTP/1.1 401 Unauthorized\r\n\r\n');return;}
 wss.handleUpgrade(req,socket,head,ws=>{const c=room.connect(user,s=>ws.send(s),(code,why)=>ws.close(code,why));ws.on('message',data=>room.receive(c,data.toString()));ws.on('close',()=>room.disconnect(c));ws.on('error',()=>room.disconnect(c));});
 }catch{socket.destroy()}});
 const timer=setInterval(()=>room.sweep(),60000);timer.unref();server.on('close',()=>{clearInterval(timer);wss.close()});
}
