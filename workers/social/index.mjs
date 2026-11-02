import {SocialRoom,cleanWorldHistory} from './room.mjs';
const HISTORY_KEY='world-history-v1';
export class Social {
 constructor(ctx){
  this.ctx=ctx;this.historyWrites=Promise.resolve();
  this.room=new SocialRoom({onWorldMessage:()=>this.saveHistory()});
  // SQLite Durable Object storage survives eviction/restarts. Do not admit a socket until
  // the backlog is loaded, otherwise a restart race can send an apparently empty hello.
  this.historyReady=ctx.storage.get(HISTORY_KEY).then(saved=>{
   this.room.history=cleanWorldHistory(saved);
   this.room.serial=Math.max(this.room.serial,...this.room.history.map(m=>m.id));
  }).catch(error=>console.error('World history load failed',error));
 }
 saveHistory(){
  const snapshot=this.room.history.slice();
  const storage=this.ctx.storage;
  this.historyWrites=this.historyWrites.then(()=>storage.put(HISTORY_KEY,snapshot)).catch(error=>console.error('World history save failed',error));
 }
 async fetch(request){
  await this.historyReady;
 if(request.headers.get('Upgrade')?.toLowerCase()!=='websocket')return new Response('WebSocket required',{status:426});
 const identity=JSON.parse(request.headers.get('X-Social-Identity')||'null');if(!identity||!Number.isInteger(identity.id)||typeof identity.username!=='string')return new Response('Invalid identity',{status:400});
 const pair=new WebSocketPair(),client=pair[0],server=pair[1];server.accept();
 const c=this.room.connect(identity,s=>server.send(s),(code,reason)=>server.close(code,reason));
 server.addEventListener('message',e=>this.room.receive(c,e.data));server.addEventListener('close',()=>this.room.disconnect(c));server.addEventListener('error',()=>this.room.disconnect(c));
 if(await this.ctx.storage.getAlarm()===null)await this.ctx.storage.setAlarm(Date.now()+60000);
 return new Response(null,{status:101,webSocket:client});
 }
 async alarm(){await this.historyReady;this.room.sweep();await this.historyWrites;if(this.room.clients.size||this.room.resumes.size)await this.ctx.storage.setAlarm(Date.now()+60000)}
}
export default {fetch(){return new Response('Not found',{status:404})}};
