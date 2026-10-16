const assert=require('node:assert/strict'),fs=require('node:fs'),crypto=require('node:crypto'),{createGame}=require('./helpers/game');
const g=createGame(),ev=g.ev;
try{
 ev(`S=fresh();S.cls='Rune Knight';S.lv=150;S.st.agi=150;S.eq.head=makeMythicEquipment('celestial','head').item;S.eq.head.aff=[{k:'aspd',v:1000}];ascState().level=50;ascState().stats[S.cls]={haste:10};`);
 assert.ok(Math.abs(ev('aspd()')-5/48)<1e-9,'192 ASPD caps the interval after Haste');
 assert.match(ev('V.stats()'),/ASPD <b>192<\/b>/,'sheet reflects the 192 combat cap');
 // All sections and rarity tiers share the physical/magic headgear options.
 for(let sec=0;sec<=6;sec++)assert.equal(ev(`affixPool({slot:'head',sec:${sec}}).join()`),'str,dex,int,vit,hp,atk,matk');
 for(let sec=0;sec<=5;sec++)for(let tier=0;tier<=4;tier++)for(const [key,roll]of [['str',.01],['dex',.22],['atk',.79]]){
  ev(`Math.random=()=>${roll};window.head=genGear({k:'head',n:'Headgear regression'},150,${sec},false,${tier},9,10)`);
  assert.equal(ev('head.aff[0].k'),key,'physical options reach the real generator');
  assert.ok(ev('head.aff[0].v>0'));
 }
 ev(`S.eq.head={...head,id:987,locked:false,aff:[{k:'int',v:12},{k:'hp',v:150}]};window.oldHead=JSON.stringify(S.eq.head);lsPut(saveKey(),JSON.stringify(S));S=load()`);
 assert.equal(ev('JSON.stringify(S.eq.head)'),ev('oldHead'),'existing headgear rolls survive reload');
 for(const [sec,tier]of [[0,0],[0,1],[0,2],[0,3],[0,4],[4,4],[5,4],[6,4]]){
  ev(`S=fresh();S.cls='Rune Knight';S.lv=150;S.zeny=1e12;Math.random=()=>0;S.eq.head=${sec===6?"makeMythicEquipment('celestial','head').item":`genGear({k:'head',n:'Paid headgear test'},150,${sec},false,${tier},9,10)`};window.rawHead=JSON.stringify(S.eq.head.aff);reforge('head',true)`);
  assert.equal(ev('S.reforgePending.after[0].k'),'str','all grades can offer physical stats in a paid reforge');
  assert.equal(ev('JSON.stringify(S.eq.head.aff)'),ev('rawHead'),'paid offer preserves current rolls until accepted');
  ev('resolveReforge(true)');assert.equal(ev('S.eq.head.aff[0].k'),'str');
 }


 for(const roll of [.8,1,1.25]){
  const v=k=>ev(`affixValue('${k}',6,4,${roll},10)`);
  assert.ok(v('hp')>=v('vit')*11&&v('hp')<=v('vit')*13,'HP roll increase reverted; tuning belongs in stat conversion');
  assert.ok(v('cdm')<v('luk')*.8,'CDM roll increase reverted; conversion retune remains a proposal');
 }
 ev(`S.jobs[S.cls]={jl:1,jx:0};for(let i=0;i<120;i++)addJob(Math.round(fieldExpReward(11,5)*.7));`);
 assert.ok(ev('jobOf().jl')<50,'120 top-map regular kills cannot max a fresh fourth job');
 const manifest=JSON.parse(fs.readFileSync('assets/equipment-icons/mythic-manifest.json'));
 for(const a of manifest.assets){const b=fs.readFileSync('assets/equipment-icons/'+a.file);assert.equal(b.subarray(1,4).toString(),'PNG');assert.equal(crypto.createHash('sha256').update(b).digest('hex'),a.sha256)}
 for(const [set,slots]of Object.entries(manifest.sets))for(const [kind,id]of Object.entries(slots)){
  const weapon=['sword','dagger','axe','mace','staff','katar','bow'].includes(kind),slot=weapon?'weapon':kind;
  assert.equal(ev(`gearItemIconId(makeMythicEquipment('${set}','${slot}','${kind}').item)`),id);
 }
 ev(`tabs.push('skills');renderWin()`);
 assert.equal(g.window.document.querySelectorAll('.eclipse-skill-description').length,g.window.document.querySelectorAll('.sk[data-a=ssel]').length,'every skill tile shows its own description inline (v171 restores the pre-streamline text)');
 assert.ok(g.window.document.querySelectorAll('.eclipse-skill-description').length>0,'the restored tiles are not empty');
 assert.ok(g.window.document.querySelector('.ui-selected-skill'));
 assert.equal(g.window.document.querySelectorAll('.class-lineage-overview').length,0,'lineage belongs only to Class Tree');
 ev(`tabs.splice(0,tabs.length,'job');eclipseJobsBrowse=true;renderWin()`);
 assert.equal(g.window.document.querySelectorAll('.class-lineage-overview .tn').length,25);
 console.log('PASS: post-cap ASPD display, physical headgear, HP/CDM specialization, 42 native hashes, all 72 Mythic slot mappings, restored skill descriptions and skill/class separation.');
}finally{g.close()}
