import {SocialRoom} from './room.mjs';
export class Social {
 constructor(ctx){this.ctx=ctx;this.room=new SocialRoom();}
 async fetch(request){
 if(request.headers.get('Upgrade')?.toLowerCase()!=='websocket')return new Response('WebSocket required',{status:426});
 const identity=JSON.parse(request.headers.get('X-Social-Identity')||'null');if(!identity||!Number.isInteger(identity.id)||typeof identity.username!=='string')return new Response('Invalid identity',{status:400});
 const pair=new WebSocketPair(),client=pair[0],server=pair[1];server.accept();
 const c=this.room.connect(identity,s=>server.send(s),(code,reason)=>server.close(code,reason));
 server.addEventListener('message',e=>this.room.receive(c,e.data));server.addEventListener('close',()=>this.room.disconnect(c));server.addEventListener('error',()=>this.room.disconnect(c));
 if(await this.ctx.storage.getAlarm()===null)await this.ctx.storage.setAlarm(Date.now()+60000);
 return new Response(null,{status:101,webSocket:client});
 }
 async alarm(){this.room.sweep();if(this.room.clients.size)await this.ctx.storage.setAlarm(Date.now()+60000)}
}
export default {fetch(){return new Response('Not found',{status:404})}};
