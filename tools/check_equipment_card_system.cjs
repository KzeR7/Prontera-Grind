// Card-system smoke check using the real game helpers and action handlers.
// node tools/check_equipment_card_system.cjs
// npm install --no-save --package-lock=false jsdom three@0.128.0 ws
'use strict';
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const {createGame}=require('./tests/helpers/game.js');
const root=path.resolve(__dirname,'..');
const scratch=path.join(root,'.arena/equipment-review');
const report={checks:[]};
const game=createGame();
const ev=game.ev;
const check=(name,fn)=>{fn();report.checks.push(name);console.log('ok '+name)};
try{
  ev(`window.cardTestPrompt='';window.cardTestLog='';
    ask=(m,fn)=>{window.cardTestPrompt=m;if(fn)fn()};
    log=m=>{window.cardTestLog=m};
    window.cardTestDef=name=>CARD_CATALOG.find(c=>c.n===name&&!c.nightmare);
    window.cardTestCard=name=>newCard(cardTestDef(name));
    window.cardTestGear=(id,slot='weapon',slots=3,cards=[])=>({
      id,name:'Test '+id,slot,wt:slot==='weapon'?'sword':undefined,tier:0,sec:0,val:20,slots,cards,aff:[],r:0
    });
    window.cardTestReset=()=>{
      S=fresh();S.cls='Knight';S.zeny=100000;S.freeCardRemoval=false;
      S.cardIndex=emptyCardIndex();S.eq.weapon=cardTestGear(9001);S.inv=[];S.cards=[];
      S.autoSell=[true,true,true,true,true,true,true,true];S.autoSellRules=defaultAutoSellRules();
      selC=null;collectionGrade=-1;autoSellDraft=null;autoSellPreview=null;bulkSellSelection=null;
      cardTestPrompt='';cardTestLog='';
    };
    cardTestReset();`);

  check('card catalog keeps stable grades, effects, fits, families and boss flags',()=>{
    const actual=JSON.parse(ev(`JSON.stringify(['Poring Card','Willow Card','Marina Card','Mantis Card','Eddga Card','Fabre Card'].map(n=>{
      const c=cardTestDef(n);return {name:c.n,family:cardFamily(c),grade:GRADE[c.g],effects:cardEffects(c).map(cardEffectText),fit:c.fit,boss:!!c.bossCard,value:c.v}
    }))`));
    assert.deepEqual(actual,[
      {name:'Poring Card',family:'Poring Card',grade:'Common',effects:['LUK +3'],fit:['acc'],boss:false,value:3},
      {name:'Willow Card',family:'Willow Card',grade:'Common',effects:['INT +3','Magic Power +4%'],fit:['weapon','head','acc'],boss:false,value:3},
      {name:'Marina Card',family:'Marina Card',grade:'Uncommon',effects:['Magic Power +3%'],fit:['weapon','head'],boss:false,value:3},
      {name:'Mantis Card',family:'Mantis Card',grade:'Rare',effects:['STR +12','ATK % +6'],fit:['weapon','acc'],boss:false,value:12},
      {name:'Eddga Card',family:'Eddga Card',grade:'Legendary',effects:['ATK % +8'],fit:['weapon'],boss:true,value:8},
      {name:'Fabre Card',family:'Fabre Card',grade:'Common',effects:['Max HP +50'],fit:['head','armor'],boss:false,value:50}
    ]);
  });

  check('card collection renders filters, grades, selected details and loose-card actions',()=>{
    const html=ev(`(()=>{cardTestReset();const m=cardTestCard('Mantis Card');S.cards=[cardTestCard('Poring Card'),cardTestCard('Eddga Card'),m];selC=cardGroup(m);return JSON.stringify({html:V.cards(),location:ownedCardEntries().find(x=>x.card===m).location,loose:S.cards.includes(m)})})()`);
    const r=JSON.parse(html);
    assert.match(r.html,/All grades/);
    assert.match(r.html,/Common/);assert.match(r.html,/Uncommon/);assert.match(r.html,/Rare/);assert.match(r.html,/Legendary/);
    assert.match(r.html,/Mantis Card/);
    assert.match(r.html,/data-a="mergecard"/);
    assert.match(r.html,/data-a="sellcard"/);
    assert.equal(r.location,'Loose card');assert.equal(r.loose,true);
  });

  check('only compatible cards are offered and socket limits are enforced',()=>{
    const r=JSON.parse(ev(`(()=>{cardTestReset();
      S.cards=['Poring Card','Fabre Card','Rocker Card','Willow Card','Marina Card','Mantis Card','Eddga Card'].map(cardTestCard);
      selE='weapon';const html=insertUI(S.eq.weapon);
      const fit={rocker:cardFits(cardTestCard('Rocker Card'),S.eq.weapon),mantis:cardFits(cardTestCard('Mantis Card'),S.eq.weapon),poring:cardFits(cardTestCard('Poring Card'),S.eq.weapon),fabre:cardFits(cardTestCard('Fabre Card'),S.eq.weapon)};
      const duplicate=(()=>{const a=cardTestCard('Mantis Card'),b=cardTestCard('Mantis Card');S.eq.weapon.cards=[a];return socketWhy(b,S.eq.weapon)})();
      const boss=(()=>{const target=cardTestGear(9101,'weapon',4,[cardTestCard('Drake Card'),cardTestCard('Baphomet Card')]);return socketWhy(cardTestCard('Phreeoni Card'),target)})();
      const cdm=(()=>{const make=(n,v)=>({id:'cdm'+n,n,family:n,stat:'cdm',v,effects:[{k:'cdm',v}],fit:['weapon'],g:2,bossCard:false});const target=cardTestGear(9102,'weapon',4,[make('A',1),make('B',2)]);return socketWhy(make('C',3),target)})();
      const category=(()=>{const head=cardTestGear(9103,'head',3);return socketWhy(cardTestCard('Poring Card'),head)})();
      return JSON.stringify({html,fit,duplicate,boss,cdm,category})})()`));
    assert.match(r.html,/Rocker Card/);assert.match(r.html,/Mantis Card/);assert.match(r.html,/Eddga Card/);
    assert.doesNotMatch(r.html,/Poring Card|Fabre Card/);
    assert.deepEqual(r.fit,{rocker:true,mantis:true,poring:false,fabre:false});
    assert.match(r.duplicate,/Only one card from this monster family/);
    assert.match(r.boss,/At most two boss cards/);
    assert.match(r.cdm,/At most two Crit DMG cards/);
    assert.match(r.category,/does not fit/);
  });

  check('inserting, showing sockets and removing a card conserve the card and charge the fee',()=>{
    const r=JSON.parse(ev(`(()=>{cardTestReset();const c=cardTestCard('Mantis Card');S.cards=[c];S.zeny=1000;
      ACT.sock(String(c.id)+':weapon');
      const afterInsert={id:S.eq.weapon.cards[0]?.id,equipped:S.eq.weapon.cards.length,loose:S.cards.length};
      const html=cardSlots(S.eq.weapon,'weapon');
      ACT.unsock('weapon:0');
      const afterRemove={equipped:S.eq.weapon.cards.length,loose:S.cards.some(x=>x.id===c.id),zeny:S.zeny,fee:600};
      return JSON.stringify({afterInsert,empty:(html.match(/empty slot/g)||[]).length,removeButton:/data-a="unsock"/.test(html),cardId:c.id,afterRemove})})()`));
    assert.deepEqual(r.afterInsert,{id:r.cardId,equipped:1,loose:0});
    assert.equal(r.empty,2);assert.equal(r.removeButton,true);
    assert.deepEqual(r.afterRemove,{equipped:0,loose:true,zeny:400,fee:600});
  });

  check('replacing equipment transfers only compatible cards and leaves blocked cards on the old item',()=>{
    const r=JSON.parse(ev(`(()=>{cardTestReset();const fit=cardTestCard('Mantis Card'),blocked=cardTestCard('Poring Card');
      const old=cardTestGear(9201,'weapon',3,[fit,blocked]);const next=cardTestGear(9202,'weapon',2,[]);
      S.eq.weapon=old;S.inv=[next];transferEquipmentCards(old,next,'weapon');
      const result={next:next.cards.map(c=>c.n),old:old.cards.map(c=>c.n),ids:ownedCardEntries().map(x=>x.card.id),unique:new Set(ownedCardEntries().map(x=>x.card.id)).size};
      const wrong=cardTestGear(9203,'weapon',3,[cardTestCard('Rocker Card')]);const head=cardTestGear(9204,'head',3,[]);S.eq.weapon=wrong;S.inv=[head];transferEquipmentCards(wrong,head,'head');
      return JSON.stringify({...result,wrong:wrong.cards.length,head:head.cards.length})})()`));
    assert.deepEqual(r.next,['Mantis Card']);
    assert.deepEqual(r.old,['Poring Card']);
    assert.equal(r.ids.length,2);assert.equal(r.unique,2);
    assert.equal(r.wrong,1);assert.equal(r.head,0);
  });

  check('merging identical unstarred copies uses 1 extra copy and the +9% star multiplier',()=>{
    const r=JSON.parse(ev(`(()=>{cardTestReset();const a=cardTestCard('Mantis Card'),b=cardTestCard('Mantis Card');S.cards=[a,b];
      mergeCard(a.id);return JSON.stringify({stars:cardStars(a),loose:S.cards.length,effects:cardEffects(a).map(e=>e.v),prompt:cardTestPrompt,starredProtected:cardStars(a)>0&&cardMasteryCardByName('Mantis Card').length===0})})()`));
    assert.equal(r.stars,1);assert.equal(r.loose,1);
    assert.deepEqual(r.effects,[13.08,6.54]);
    assert.match(r.prompt,/Consume 1 extra/);
    assert.equal(r.starredProtected,true);
  });

  check('Card Mastery only consumes loose unstarred cards and never socketed cards',()=>{
    const r=JSON.parse(ev(`(()=>{cardTestReset();const loose=cardTestCard('Poring Card'),starred=cardTestCard('Poring Card'),socketed=cardTestCard('Poring Card');
      starred.stars=3;S.cards=[loose,starred];S.eq.weapon.cards=[socketed];
      ACT.indexcard(String(loose.id));const afterLoose={donated:S.cardIndex.donated,loose:S.cards.map(c=>c.n),socketed:S.eq.weapon.cards.length};
      ACT.indexcard(String(starred.id));ACT.indexcard(String(socketed.id));
      return JSON.stringify({afterLoose,final:{donated:S.cardIndex.donated,cards:S.cards.length,equipped:S.eq.weapon.cards.length},prompt:cardTestPrompt})})()`));
    assert.equal(r.afterLoose.donated,1);assert.deepEqual(r.afterLoose.loose,['Poring Card']);assert.equal(r.afterLoose.socketed,1);
    assert.deepEqual(r.final,{donated:1,cards:1,equipped:1});
    assert.match(r.prompt,/Dedicate one/);
  });

  check('auto-sell protects socketed gear and confirmed bulk sale returns its cards',()=>{
    const r=JSON.parse(ev(`(()=>{cardTestReset();const c=cardTestCard('Rocker Card');const item=cardTestGear(9301,'weapon',3,[c]);
      S.inv=[item];S.autoSellRules.refined=false;S.autoSellRules.socketed=true;
      const protectedReason=autoSellReason(item);
      S.autoSellRules.socketed=false;const unprotectedReason=autoSellReason(item);
      previewAutoSell(true);confirmAutoSell();
      return JSON.stringify({protectedReason,unprotectedReason,inv:S.inv.length,cards:S.cards.map(x=>x.n),zeny:S.zeny,previewCleared:!autoSellPreview})})()`));
    assert.equal(r.protectedReason,'Socketed');assert.equal(r.unprotectedReason,'');
    assert.equal(r.inv,0);assert.deepEqual(r.cards,['Rocker Card']);
    assert(r.zeny>100000);assert.equal(r.previewCleared,true);
  });

  fs.mkdirSync(scratch,{recursive:true});
  fs.writeFileSync(path.join(scratch,'card-system-report.json'),JSON.stringify(report,null,2)+'\n');
  console.log(`\nPASS ${report.checks.length} card-system checks using the real game helpers.`);
}finally{game.close()}
