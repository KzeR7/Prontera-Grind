// Exercise the real panel reconciler with deterministic scroll geometry.
const assert=require('node:assert/strict'),{createGame}=require('./helpers/game');const g=createGame(),ev=g.ev;
try{
 const proto=g.window.HTMLElement.prototype,base=proto.getBoundingClientRect;
 proto.getBoundingClientRect=function(){if(this.dataset.logId){const p=this.parentNode,top=[...p.children].indexOf(this)*30-p.scrollTop;return{top,bottom:top+30,left:0,right:300,width:300,height:30}}if(this.dataset.panelScroll==='events')return{top:0,bottom:120,left:0,right:300,width:300,height:120};return base.call(this)};
 ev(`tabs.splice(0,tabs.length,'log');logs=Array.from({length:80},(_,id)=>({id,m:'Event '+id,cat:'gear'}));renderWin()`);
 let feed=g.window.document.querySelector('[data-panel-scroll=events]');
 Object.defineProperties(feed,{scrollHeight:{get:()=>feed.children.length*30},clientHeight:{get:()=>120}});
 feed.scrollTop=300;const id=feed.children[10].dataset.logId;
 ev(`logs.shift();logs.push({id:80,m:'Arrived while reading',cat:'gear'});renderWin()`);
 assert.equal(g.window.document.querySelector('[data-panel-scroll=events]'),feed,'scroll container retained');assert.equal(feed.scrollTop,270,'evicted row compensated');assert.equal([...feed.children].find(n=>n.dataset.logId===id).getBoundingClientRect().top,0,'same event stays in view');
 feed.scrollTop=feed.scrollHeight-feed.clientHeight;ev(`logs.shift();logs.push({id:81,m:'Follow newest',cat:'gear'});renderWin()`);assert.equal(feed.scrollTop,feed.scrollHeight,'bottom follow requested (browser clamps to max)');
 console.log('PASS: history row preserved across capped-feed eviction, scroll container retained, newest events followed only at bottom.');
}finally{g.close()}
