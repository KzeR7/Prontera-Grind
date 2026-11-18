// MVP finish atomicity: drive the REAL finishReel closure, with a test-only export injected into
// the evaluated source. This is deliberately not a direct markMvpClaimed test: it verifies the
// normal catch -> auto-sale -> marker -> persist ordering under a presentation exception.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {JSDOM}=require('jsdom');
const root=path.join(__dirname,'..','..');
let source=fs.readFileSync(path.join(root,'assets/social-fishing.js'),'utf8');
const needle='get auto(){return ui.auto},\n};';
assert.ok(source.includes(needle),'test export insertion point moved');
source=source.replace(needle,`get auto(){return ui.auto},
 // Exposed only in this evaluated test copy; production source still returns the public API below.
 __testSetReel:v=>Object.assign(ui,v),__testFinishReel:finishReel,
};`);

const dom=new JSDOM('<!doctype html><body></body>',{runScripts:'outside-only',url:'https://pg.test/'}),w=dom.window;
const ctx=new Proxy({}, {get:(_,k)=>k==='createLinearGradient'||k==='createRadialGradient'?()=>({addColorStop(){}}):()=>{},set:()=>true});
w.HTMLCanvasElement.prototype.getContext=()=>ctx;
w.HTMLCanvasElement.prototype.toDataURL=()=> 'data:image/png;base64,';
w.requestAnimationFrame=()=>1;w.cancelAnimationFrame=()=>{};
w.eval(source);
const F=w.PGSocialFishing;
const host={fishing:F.normalize({settings:{fish:true,sound:false,autoSell:true}})};
const snapshots=[];
try{
  // A heavier existing MVP makes the newly landed one auto-sell, exercising all economic mutations.
  const prior=F.addCatch(host.fishing,{sp:'mvp_stormcoil',w:2999,mut:null,perfect:false},1);
  assert.ok(prior);
  F.bind({
    host:()=>host,
    save:()=>snapshots.push(JSON.parse(JSON.stringify(host.fishing))),
    scene:()=>({ fishing:{ setFishVisible(){}, escapeSplash(){}, catchFly(){throw Error('presentation failed after durable save')} } }),
  });
  F.setMvp({sp:'mvp_stormcoil',id:'mvp:abc:def',spawnedAt:1,endsAt:Date.now()+600000});
  const oldRandom=w.Math.random;w.Math.random=()=>0; // pass the exact 30% MVP landing roll
  F.__testSetReel({phase:'reel',holding:true,roll:{sp:'mvp_stormcoil',rarity:'mvp',w:1000,mut:null,mvpSpawnId:'mvp:abc:def'},reel:{perfect:true}});
  assert.throws(()=>F.__testFinishReel('catch'),/presentation failed after durable save/,
    'the injected scene failure occurs after finishReel reaches presentation');
  w.Math.random=oldRandom;

  assert.strictEqual(snapshots.length,1,'finishReel emits one durable economic snapshot, not catch/sale/marker fragments');
  const saved=snapshots[0];
  assert.ok(saved.mvpCaught.includes('mvp:abc:def'),'the same snapshot contains the one-per-spawn marker');
  assert.strictEqual(saved.stats.catches,2,'the same snapshot contains the completed MVP catch in Index progress');
  assert.ok(saved.coins>0,'the same snapshot contains its auto-sale proceeds');
  assert.strictEqual(saved.bag.length,1,'the auto-sold catch is absent while the prior kept fish remains');
  assert.ok(F.isMvpClaimed('mvp:abc:def'),'the live marker agrees with the durable snapshot after presentation fails');

  // A replacement spawn cannot be marked by a roll captured from the old spawn.
  F.setMvp({sp:'mvp_stormcoil',id:'mvp:abc:next',spawnedAt:2,endsAt:Date.now()+600000});
  F.__testSetReel({phase:'reel',holding:true,roll:{sp:'mvp_stormcoil',rarity:'mvp',w:1000,mut:null,mvpSpawnId:'mvp:abc:def'},reel:{perfect:true}});
  F.__testFinishReel('catch');
  assert.equal(F.isMvpClaimed('mvp:abc:next'),false,'a changed active spawn is never marked by the old roll');
  console.log('PASS MVP finish: catch/auto-sale/marker persist atomically before presentation');
}finally{
  if(F.setMvp._ticker){clearInterval(F.setMvp._ticker);F.setMvp._ticker=null}
  dom.window.close();
}
