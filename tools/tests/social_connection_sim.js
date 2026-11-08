// Real chat UI: yielding to another tab must not restart an eviction loop.
const assert=require('node:assert/strict'),fs=require('node:fs'),{JSDOM}=require('jsdom');
const dom=new JSDOM('<div id="view"><div id="feedWrap"></div></div>',{url:'http://localhost/',runScripts:'outside-only'}),w=dom.window;
try{
 let now=1000000;w.Date.now=()=>now;
 Object.assign(w,{CLOUD:{on:true,user:'connection-tester'},S:{cls:'Novice',eq:{}},tabs:[],wardrobeAppearance:()=>({version:1,sex:'m'}),logShown:()=>[],openTab:()=>{},setInterval:fn=>{if(fn.name!=='worldTrainingTick'&&fn.name!=='battleUITick')w.sessionTick=fn},PGSocialScene:{}});
 const sockets=[];w.WebSocket=class{constructor(){this.readyState=1;this.sent=[];sockets.push(this)}close(){this.readyState=3}send(raw){this.sent.push(JSON.parse(raw))}};
 for(const p of ['assets/digimon/roster.js','assets/digimon/base-stats.js','assets/social-rules.js','assets/social.js'])w.eval(fs.readFileSync(p,'utf8'));
 const app=w.PGSocial.app,hello=ws=>ws.onmessage({data:JSON.stringify({type:'hello',id:7,history:[]})});
 w.sessionTick();assert.equal(sockets.length,1);hello(sockets[0]);
 sockets[0].onclose({code:4001,reason:'Connected in another tab'});
 for(let i=0;i<40;i++){now+=2000;w.sessionTick()}
 assert.equal(sockets.length,1,'the displaced tab must not auto-evict the new owner');
 w.dispatchEvent(new w.Event('online'));w.document.dispatchEvent(new w.Event('visibilitychange'));
 assert.equal(sockets.length,1,'network/focus events must also respect the other tab');
 w.CLOUD.on=false;w.CLOUD.user=null;w.sessionTick();
 w.CLOUD.on=true;w.CLOUD.user='connection-tester';w.sessionTick();
 assert.equal(sockets.length,2,'a genuine logout/login clears the block for the same account');hello(sockets[1]);
 sockets[1].onclose({code:1006,reason:''});now+=30000;w.sessionTick();
 assert.equal(sockets.length,3,'network failures still reconnect automatically');hello(sockets[2]);
 sockets[2].onclose({code:4000,reason:'Refresh session'});w.sessionTick();
 assert.equal(sockets.length,4,'planned session refresh reconnects immediately');
 console.log('PASS chat connection lifecycle: 4001 stays yielded, logout/login recovers, network and refresh reconnect');
}finally{w.close()}
