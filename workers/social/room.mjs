import '../../assets/social-rules.js';
const R=globalThis.PGSocialRules;
// A service binding is the only ingress. Identity is supplied by authenticated Pages.
export class SocialRoom {
 constructor({now=()=>Date.now()}={}){this.now=now;this.clients=new Map();this.history=[];this.serial=0;}
 send(c,event){try{c.send(JSON.stringify(event))}catch{this.disconnect(c)}}
 broadcast(event,filter=()=>true){for(const c of this.clients.values())if(filter(c))this.send(c,event)}
 connect(identity,send,close){
 const prior=this.clients.get(identity.id);if(prior){this.disconnect(prior);prior.close(4001,'Connected in another tab');}
 const c={id:identity.id,name:identity.username,send,close,room:0,at:this.now(),path:[],x:0,z:12,dir:0,sit:false,nextChat:0,seat:null,moveAt:0,lookAt:0,expires:this.now()+300000};
 this.clients.set(c.id,c);this.send(c,{type:'hello',id:c.id,name:c.name,history:this.history});return c;
 }
 cleanLook(look){if(!look||typeof look.cls!=='string'||look.cls.length>40||!look.appearance||JSON.stringify(look).length>1200)return null;return {cls:look.cls,appearance:look.appearance,refine:Math.max(0,Math.min(15,Number(look.refine)||0)),title:typeof look.title==='string'?look.title.replace(/[\u0000-\u001f\u007f]/g,'').slice(0,64):''};}
 snapshot(c){R.advance(c,this.now());return {id:c.id,name:c.name,room:c.room,x:c.x,z:c.z,dir:c.dir,sit:c.sit,path:c.path,at:c.at,look:c.look,seat:c.seat};}
 leave(c){const room=c.room;c.room=0;c.path=[];c.seat=null;if(room)this.broadcast({type:'left',id:c.id,room},p=>p.room===room);}
 disconnect(c){if(this.clients.get(c.id)!==c)return;this.leave(c);this.clients.delete(c.id)}
 receive(c,raw){
 if(this.clients.get(c.id)!==c)return;
 if(this.now()>c.expires){this.disconnect(c);c.close(4000,'Refresh session');return;}
 if(typeof raw!=='string'||raw.length>4096)return this.send(c,{type:'error',message:'Message is too large.'});
 let m;try{m=JSON.parse(raw)}catch{return}if(!m||typeof m!=='object')return;
 if(m.type==='ping')return this.send(c,{type:'pong'});
 if(m.type==='leave'){this.leave(c);return this.send(c,{type:'room',room:0,players:[]})}
 if(m.type==='join'){
 if(c.room)return;
 const look=this.cleanLook(m.look);if(!look)return;
 let room=1;while([...this.clients.values()].filter(p=>p.room===room).length>=R.CAPACITY)room++;
 const members=[...this.clients.values()].filter(p=>p.room===room);members.forEach(p=>R.advance(p,this.now()));
 const spawn=Array.from({length:R.CAPACITY},(_,i)=>({x:(i%5-2)*4,z:12+Math.floor(i/5)*4})).find(s=>members.every(p=>Math.hypot(p.x-s.x,p.z-s.z)>2))||{x:0,z:12};
 c.room=room;c.look=look;c.x=spawn.x;c.z=spawn.z;c.at=this.now();c.sit=false;c.path=[];c.seat=null;
 this.send(c,{type:'room',room,players:[...this.clients.values()].filter(p=>p.room===room).map(p=>this.snapshot(p))});
 return this.broadcast({type:'player',player:this.snapshot(c)},p=>p.room===room&&p!==c);
 }
 if(m.type==='look'&&c.room){const look=this.cleanLook(m.look);if(!look||this.now()-c.lookAt<100)return;c.lookAt=this.now();c.look=look;return this.broadcast({type:'player',player:this.snapshot(c)},p=>p.room===c.room)}
 if(m.type==='move'&&c.room){if(this.now()-c.moveAt<100)return;c.moveAt=this.now();R.advance(c,this.now());const route=R.path(c,{x:m.x,z:m.z});if(!route.length)return;c.path=route;c.sit=false;c.seat=null;return this.broadcast({type:'player',player:this.snapshot(c)},p=>p.room===c.room)}
 if(m.type==='seat'&&c.room){if(this.now()-c.moveAt<100||!Number.isInteger(m.id)||!R.SEATS[m.id])return;c.moveAt=this.now();R.advance(c,this.now());const seat=R.SEATS[m.id];if([...this.clients.values()].some(p=>p!==c&&p.room===c.room&&p.seat===seat.id))return this.send(c,{type:'error',message:'That bench is occupied.'});const route=R.path(c,seat);if(!route.length&&Math.hypot(c.x-seat.x,c.z-seat.z)>.5)return;c.path=route;c.sit=false;c.seat=seat.id;return this.broadcast({type:'player',player:this.snapshot(c)},p=>p.room===c.room)}
 if(m.type==='sit'&&c.room){if(this.now()-c.moveAt<100)return;c.moveAt=this.now();R.advance(c,this.now());c.path=[];c.seat=null;c.sit=!c.sit;return this.broadcast({type:'player',player:this.snapshot(c)},p=>p.room===c.room)}
 if(m.type!=='chat'&&m.type!=='emotion')return;
 if(this.now()<c.nextChat)return this.send(c,{type:'error',message:'Please wait 3 seconds between messages and emotions.'});
 const emotion=m.type==='emotion';const channel=emotion?'local':m.channel;
 if(!['world','whisper','local'].includes(channel)||(channel==='local'&&!c.room))return this.send(c,{type:'error',message:'Enter a plaza to use Local chat and emotions.'});
 if(emotion&&!R.EMOTIONS.includes(m.emotion))return;
 const body=emotion?'':typeof m.body==='string'?m.body.replace(/[\u0000-\u001f\u007f]/g,'').trim():'';if(!emotion&&(!body||body.length>300))return;
 let recipient;if(channel==='whisper'){recipient=[...this.clients.values()].find(p=>p.name.toLowerCase()===String(m.to).toLowerCase());if(!recipient)return this.send(c,{type:'error',message:'That player is offline.'})}
 c.nextChat=this.now()+R.CHAT_DELAY;
 const event={type:'message',id:++this.serial,at:this.now(),from:c.id,name:c.name,channel,body,room:channel==='local'?c.room:0,...(emotion?{emotion:m.emotion}:{}),...(recipient?{to:recipient.id,toName:recipient.name}:{})};
 if(channel==='world'){this.history.push(event);if(this.history.length>100)this.history.shift();this.broadcast(event)}
 else if(channel==='local')this.broadcast(event,p=>p.room===c.room);
 else {this.send(c,event);if(recipient!==c)this.send(recipient,event)}
 }
 sweep(){for(const c of this.clients.values())if(this.now()>c.expires){this.disconnect(c);c.close(4000,'Refresh session')}}
}
