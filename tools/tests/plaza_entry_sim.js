// Drive the shipped navigation code with a pending (stub) scene, independently of GPU speed.
const fs=require('node:fs'), assert=require('node:assert/strict'),{JSDOM}=require('jsdom');
(async()=>{
 const dom=new JSDOM('<div id="view"><div id="feedWrap"></div></div>',{url:'http://localhost',runScripts:'outside-only'}),w=dom.window;
 try{
 Object.assign(w,{S:{cls:'Novice',eq:{}},currentUser:'first',CLOUD:{on:false,user:null},tabs:[],setInterval(){},openTab(){},wardrobeAppearance:()=>({version:1,sex:'m'}),logShown:()=>[]});
 w.HTMLCanvasElement.prototype.getContext=()=>null;
 const scene={active:false,clearPlayers(){},putPlayer(){},cameraState:{},fishing:{setRig(){}}};
 let creations=0,resolve,reject;
 w.PGSocialScene={create:()=>{creations++;return new Promise((r,j)=>{resolve=r;reject=j})}};
 for(const f of ['digimon/roster','digimon/base-stats','social-rules','social-poker','wardrobe','digimon-sanctuary','digimon-battle','social'])w.eval(fs.readFileSync('assets/'+f+'.js','utf8'));
 const {enter,leave,app}=w.PGSocial;
 w.CLOUD.id=11;w.CLOUD.epoch=1;
 const a=enter();leave();const b=enter();leave();const c=enter();
 assert.equal(app.wanted,true,'latest plaza intent wins while creation is pending');assert.equal(creations,1);
 w.S={...w.S}; // same account adopted its save during this visit
 reject(Error('test asset deadline'));await Promise.all([a,b,c]);assert.match(w.document.querySelector('#plazaRenderNotice').textContent,/retry/i);
 leave();assert(!app.wanted);const old=enter();assert.equal(creations,2,'retry creates once');
 w.currentUser='second';w.S={cls:'Novice',eq:{}};resolve(scene);await old;
 assert(!scene.active,'old account completion cannot activate');
 const now=enter();await now;assert(scene.active,'new account can activate cached scenery');assert.equal(creations,2);assert(w.document.querySelector('#plazaRenderNotice').hidden);
 leave();assert(!scene.active);assert(w.document.querySelector('#socialHub').hidden);
 app.scene=null;const same=enter();w.S={...w.S};resolve(scene);await same;
 assert.equal(creations,3,'adopting the save did not restart scene creation');
 assert(scene.active&&app.wanted,'a replacement save for the same player/ID/session must activate');
 assert(w.document.querySelector('#plazaRenderNotice').hidden);leave();
 for(const key of ['id','epoch']){
  app.scene=null;const stale=enter();w.CLOUD[key]++;resolve(scene);await stale;
  assert(!scene.active,`changed ${key} blocks activation even with unchanged player and save`);leave();
 }
 // A logout begins before the save/session drain finishes (the username can still match).
 app.scene=null;const signingOut=enter();w.CLOUD.signingOut=true;resolve(scene);await signingOut;
 assert(!scene.active,'logout in progress fences even a matching owner and epoch');
 leave();w.CLOUD.signingOut=false;
 app.scene=null;w.PGSocial.pokerOpen('bank');leave();resolve(scene);
 await new Promise(setImmediate);assert(!app.wanted,'an abandoned poker visit cannot pull the player out of Field');
 console.log('PASS same-account adoption, rejection/retry, changed account/session, field exit and scene reuse');
 }finally{w.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
