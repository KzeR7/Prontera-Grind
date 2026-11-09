// The Royal Dispatch integration (2026-10-27): the mail index/reader split, the untruncated
// roulette reward pool, the shared buff strip and the separate GM announcement studio.
// These are presentation and flow regressions only. Rewards, drop rates, the roll, cloud sync
// and every saved balance keep their original functions, and this suite asserts that too.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {createGame}=require('./helpers/game');
const root=path.resolve(__dirname,'../..');
let html=fs.readFileSync(path.join(root,'index.html'),'utf8');
html=html.replace('</body>','<script>window.rdRealUI=ui;window.rdRealSave=save;window.rdRealBars=bars;</script></body>');
const g=createGame(html),doc=g.window.document,ev=g.ev;
let passed=0;
const css=fs.readFileSync(path.join(root,'assets/ui/eclipse.css'),'utf8');
const test=(name,fn)=>{
  ev(`S=fresh();S.auto=false;S.lv=150;S.zeny=1000;currentUser='dispatch-test';S.gm=false;tabs.length=0;expandedPanels.clear();sideOpen=false;$('modal').style.display='none';ui=window.rdRealUI;save=window.rdRealSave;bars=window.rdRealBars;petBuff={};petBuffSrc={};mailFilter='all';mailQuery='';mailSel=null;mailDetail=false;gmStudioPlayers=null;Object.assign(gmStudioDraft,{audience:'all',player:'',kind:'notice',headline:'',body:'',gift:'ori',amount:20,confirm:false,sending:false,status:''});$('gmStudioModal').classList.remove('on');$('mailDailyModal').classList.remove('on');S.dailyWheel={day:trialDay(),spun:0,lastReward:null,totalSpins:0,buffs:{zenyUntil:0,expUntil:0}};ui();`);
  fn();console.log('ok '+name);passed++;
};
const mailModal=()=>doc.getElementById('mailDailyModal');
const click=sel=>{const n=typeof sel==='string'?doc.querySelector(sel):sel;assert.ok(n,'missing '+sel);n.click();return n};
try{

test('mail is a compact index beside a reading pane, and no GM form lives inside it',()=>{
  ev('openMailDaily("mail")');
  const modal=mailModal();
  assert.ok(modal.classList.contains('on'),'the Mail shortcut opens the inbox');
  assert.ok(css.includes('#mailDailyModal .mail-daily-card{--rd-serif')&&css.includes('width:min(1184px,100%)'),
    'the card keeps the proposed ~1184px roulette width');
  assert.ok(css.includes('#mailDailyModal .mail-daily-card.is-mail{width:min(980px,100%);height:min(680px,calc(100dvh - 28px));}'),
    'mail gets a taller, narrower reader window instead of a short wide card');
  assert.ok(css.includes('.rd-mail-layout{display:grid;grid-template-columns:306px minmax(0,1fr)'),
    'a 306px message index sits beside the reading pane');
  assert.ok(modal.querySelector('.rd-list-panel')&&modal.querySelector('.rd-reader'),'both panes render');
  assert.equal(modal.querySelector('[data-a=gmcomposemail]'),null,'player mail carries no GM composer');
  assert.equal(modal.querySelector('#gmMailBody'),null,'the old in-inbox GM fields are gone');
  assert.equal(modal.querySelectorAll('[data-a=opengmstudio]').length,0,'a non-GM sees no Compose entry');
  assert.deepEqual([...modal.querySelectorAll('.rd-filters button')].map(b=>b.dataset.v),['all','notices','rewards'],
    'All mail, Notices and Rewards filters');
  assert.match(modal.querySelector('.rd-reader .rd-copy').textContent,/Welcome to Horizon Haven/,
    'the letter body is fully readable, not truncated');
});

test('opening the inbox marks nothing read; opening a message does',()=>{
  ev(`ensureMailState().push({id:'n1',kind:'notice',from:'Horizon Haven',at:Date.now(),body:'Second dispatch\\n\\nRead me in full.',read:false,gift:null});ui()`);
  ev('openMailDaily("mail")');
  assert.equal(ev('unreadOnlyMailCount()'),2,'both messages start unread');
  assert.equal(doc.getElementById('mailBadge').hidden,false,'the badge still counts them');
  assert.equal(ev('unreadOnlyMailCount()'),2,'merely opening the inbox leaves them unread');
  click('[data-a=openmailmsg][data-v=n1]');
  assert.equal(ev('unreadOnlyMailCount()'),1,'opening one message marks exactly that one read');
  assert.equal(ev('S.mail.find(m=>m.id==="n1").read'),true);
  assert.equal(ev('S.mail.find(m=>m.id==="welcome-1").read'),false,'the unopened one is untouched');
  assert.equal(ev('mailDetail'),true,'a tapped message drills into the letter on a narrow screen');
  click('[data-a=mailback]');
  assert.equal(ev('mailDetail'),false,'Back to inbox returns to the list');
});

test('marking mail read never consumes a gift, and Claim all never marks anything read',()=>{
  ev(`S.gm=true;ensureMailState().push({id:'g1',kind:'event',from:'Horizon Haven',at:Date.now(),body:'Gift inside\\n\\nTake it.',read:false,gift:{grantId:null,kind:'gift',payload:{resource:'ori',amount:5},label:'5 × Oridecon',claimed:false}});S.ore.ori=0;ui()`);
  ev('openMailDaily("mail")');
  assert.equal(ev('unclaimedMailGiftCount()'),1);
  ev('markAllMailRead()');
  assert.equal(ev('unclaimedMailGiftCount()'),1,'Mark all read leaves the gift unclaimed');
  assert.equal(ev('S.ore.ori'),0,'and grants nothing');
  click('[data-a=claimallmail]');
  assert.equal(ev('S.ore.ori'),5,'Claim all delivers the gift');
  assert.equal(ev('unclaimedMailGiftCount()'),0,'and leaves nothing unclaimed');
  click('[data-a=openmailmsg][data-v=g1]');
  assert.match(mailModal().querySelector('.rd-attachment-state').textContent,/Claimed/,'the letter reports the gift as claimed');
  assert.ok(mailModal().querySelector('.mail-claimed-tag'),'with a claimed badge in place of the action');
  assert.equal(mailModal().querySelectorAll('[data-a=claimmail]').length,0,'and no second claim action');
});

test('the Rewards filter isolates unclaimed gifts and Notices excludes them',()=>{
  ev(`ensureMailState().push({id:'n2',kind:'notice',from:'Horizon Haven',at:Date.now(),body:'Notice only\\n\\nNo gift.',read:false,gift:null},{id:'g2',kind:'event',from:'Horizon Haven',at:Date.now(),body:'Gift\\n\\nClaim it.',read:false,gift:{grantId:null,kind:'gift',payload:{resource:'elu',amount:7},label:'7 × Elunium',claimed:false}});ui()`);
  ev('openMailDaily("mail")');
  click('[data-a=mailfilter][data-v=rewards]');
  assert.deepEqual([...mailModal().querySelectorAll('.rd-item')].map(n=>n.dataset.v),['g2'],'Rewards shows only unclaimed gifts');
  click('[data-a=mailfilter][data-v=notices]');
  assert.ok(![...mailModal().querySelectorAll('.rd-item')].some(n=>n.dataset.v==='g2'),'Notices excludes anything with an attachment');
  click('[data-a=mailfilter][data-v=all]');
  assert.equal(mailModal().querySelectorAll('.rd-item').length,3,'All mail keeps everything, claimed or not');
});

test('searching redraws the list without disturbing the search box',()=>{
  ev(`ensureMailState().push({id:'s1',kind:'notice',from:'Horizon Haven',at:Date.now(),body:'Oridecon festival\\n\\nCome along.',read:true,gift:null});ui()`);
  ev('openMailDaily("mail")');
  const box=doc.getElementById('mailSearch');
  box.value='oridecon';
  box.dispatchEvent(new g.window.Event('input',{bubbles:true}));
  assert.equal(doc.getElementById('mailSearch'),box,'the search input itself is never replaced');
  assert.deepEqual([...mailModal().querySelectorAll('.rd-item')].map(n=>n.dataset.v),['s1'],'the list narrows as you type');
  box.value='zzz-no-match';
  box.dispatchEvent(new g.window.Event('input',{bubbles:true}));
  assert.equal(mailModal().querySelectorAll('.rd-item').length,0,'a dead search shows no rows');
  assert.match(mailModal().querySelector('.rd-list .rd-empty h3').textContent,/No matching messages/);
  click('[data-a=mailfilterclear]');
  assert.equal(ev('mailQuery'),'','Show all mail clears the search');
  assert.equal(mailModal().querySelectorAll('.rd-item').length,2);
});

test('roulette keeps every reward name, description and rate, with no reserves panel',()=>{
  ev('openMailDaily("daily")');
  const modal=mailModal();
  assert.ok(doc.getElementById('dailyRouletteWheel'),'the wheel still renders');
  assert.equal(doc.querySelectorAll('#dailyRouletteWheel .wheel-slice').length,7,'seven slices');
  const rows=[...modal.querySelectorAll('.rd-reward-row')];
  assert.equal(rows.length,7,'one full-width row per reward');
  assert.equal(rows.map(r=>r.dataset.wheelPrize).join(','),ev('DAILY_WHEEL_SEGMENTS.map(s=>s.id).join(",")'),'in pool order');
  assert.equal(rows.map(r=>r.dataset.wheelRate).join(','),'33,33,11,11,7,4,1','the unchanged drop rates');
  assert.equal(rows.reduce((a,r)=>a+Number(r.dataset.wheelRate),0),100);
  for(const r of rows){
    const copy=r.querySelector('.rd-reward-copy');
    assert.ok(copy.querySelector('b').textContent.trim().length>0,'every reward is named');
    assert.ok(copy.querySelector('small').textContent.trim().length>0,'every reward is described');
    assert.ok(!/\(\d+%\)/.test(copy.querySelector('small').textContent),'the rate is not duplicated inside the description');
    assert.ok(r.querySelector('.rd-reward-rate b').textContent.replace(/\s/g,'').endsWith('%'),'and has its own rate column');
  }
  assert.ok(css.includes('.rd-reward-copy b{')&&css.includes('white-space:normal;overflow-wrap:anywhere'),
    'reward text wraps instead of being ellipsised');
  assert.ok(!css.includes('.rp-copy b{'),'the old ellipsising prize rows are gone');
  assert.equal(modal.querySelector('.roulette-mat-stock'),null,'the reserves & active buffs panel is removed entirely');
  assert.equal(modal.textContent.includes('YOUR RESERVES'),false,'with no renamed copy of it either');
  assert.ok(css.includes('.rd-wheel-stage{width:min(100%,408px);aspect-ratio:1'),'the wheel stage is the proposed 408px');
  assert.ok(!css.includes('.roulette-stage{'),'and the old 254px stage rule is gone');
  assert.match(modal.querySelector('.rd-disclaimer').textContent,/Equal visual slices/,
    'equal sectors are labelled decorative');
  assert.ok(doc.getElementById('dailySpinBtn'),'one clear free-spin action');
  assert.match(modal.textContent,/00:00 UTC\+8/,'and a visible daily reset');
});

test('the spin still lands on the rolled slice and the rewards are unchanged',()=>{
  ev('openMailDaily("daily")');
  const before=JSON.stringify(ev('JSON.stringify(DAILY_WHEEL_SEGMENTS.map(s=>({id:s.id,weight:s.weight,rate:s.rate,amount:s.amount||0,durationMin:s.durationMin||0})))'));
  const oriBefore=ev('S.ore.ori');
  ev('ACT.spindaily(0)');
  assert.equal(ev('S.ore.ori'),oriBefore+15,'slice 0 awards 15 Oridecon');
  assert.match(mailModal().querySelector('.rd-spin-result b').textContent,/Oridecon/,'the result banner names the win');
  assert.ok(mailModal().querySelector('.rd-reward-row[data-wheel-prize=ori].is-won'),'and marks its row');
  assert.equal(ev('dailySpinsLeft()'),0);
  assert.equal(doc.getElementById('dailySpinBtn').disabled,true,'one free spin per day');
  ev("S.dailyWheel.day='2000-01-01';ui();renderMailDailyModal()");
  assert.equal(doc.getElementById('dailySpinBtn').disabled,false,'a new day restores it');
  assert.equal(JSON.stringify(ev('JSON.stringify(DAILY_WHEEL_SEGMENTS.map(s=>({id:s.id,weight:s.weight,rate:s.rate,amount:s.amount||0,durationMin:s.durationMin||0})))')),before,
    'no reward, amount or rate changed');
});

test('roulette boosts join the pet buff strip; the pill and any empty-state box are gone',()=>{
  assert.equal(doc.getElementById('dailyBuffPill'),null,'no timer pill under the Daily button');
  assert.ok(!css.includes('.minimap-buff-pill'),'and its styling is gone');
  assert.equal(doc.getElementById('hudBuffs').children.length,0,'no buffs means nothing displayed at all');
  assert.equal(doc.getElementById('hudBuffs').style.display,'none');
  ev(`petBuff={atk:20,atkT:45};petBuffSrc={atk:'Poring'};S.dailyWheel.buffs.zenyUntil=Date.now()+1200000;S.dailyWheel.buffs.expUntil=Date.now()+600000;ui()`);
  const hb=doc.getElementById('hudBuffs');
  assert.equal(hb.style.display,'flex','the strip shows while anything runs');
  assert.equal(hb.querySelectorAll('.pbx').length,1,'the pet buff keeps its own tile');
  assert.ok(hb.querySelector('#pet-buff-warcry img.buff-art'),'with its original supplied artwork');
  const zeny=hb.querySelector('#daily-fx-zeny'),exp=hb.querySelector('#daily-fx-exp');
  assert.ok(zeny&&exp,'both roulette boosts float in the same strip');
  assert.equal(zeny.querySelector('img'),null,'they use symbolic UI icons, never replacement sprite art');
  assert.match(zeny.querySelector('.s').textContent,/^\d+:\d\d$/,'each carries a countdown');
  assert.match(zeny.getAttribute('aria-label'),/\+30% Zeny gain/,'and a screen-reader description');
  assert.equal(zeny.querySelectorAll('b,p,time').length>=3,true,'the detail waits behind the tile');
  assert.ok(css.includes('#hudBuffs .efx-art .rd-ico{width:30px;height:30px;fill:none;stroke:currentColor;'),
    'the boost SVG has an explicit colored outline instead of inheriting a black fill');
  assert.ok(css.includes('#hudBuffs .efx-fly{')&&css.includes('background:rgba(17,29,41,.65)'),
    'the popup surface is 65% opaque, not nearly solid');
  assert.ok(css.includes('#hudBuffs .efx:hover .efx-fly,#hudBuffs .efx:focus .efx-fly'),'and stays closed until hover or focus');
});

test('a ticking countdown never reparents a focused tile, and expiry leaves no placeholder',()=>{
  ev(`S.dailyWheel.buffs.zenyUntil=Date.now()+90000;S.dailyWheel.buffs.expUntil=Date.now()+45000;ui()`);
  const hb=doc.getElementById('hudBuffs');
  const exp=hb.querySelector('#daily-fx-exp'),fly=exp.querySelector('[role=tooltip]');
  exp.focus();
  assert.equal(doc.activeElement,exp,'the tile takes focus');
  for(let i=0;i<10;i++)ev('S.dailyWheel.buffs.expUntil-=1000;bars()');
  assert.equal(hb.querySelector('#daily-fx-exp'),exp,'the surviving tile is the same node');
  assert.equal(exp.querySelector('[role=tooltip]'),fly,'its popup is the same node too');
  assert.equal(doc.activeElement,exp,'so focus is never stolen by a tick');
  assert.match(exp.querySelector('.s').textContent,/^0:3\d$/,'and its countdown updates in place');
  ev('S.dailyWheel.buffs.expUntil=Date.now()-1000;bars()');
  assert.equal(hb.querySelector('#daily-fx-exp'),null,'the expired boost is removed');
  assert.ok(hb.querySelector('#daily-fx-zeny'),'its neighbour survives');
  assert.notEqual(doc.activeElement,exp,'the removed tile takes the focus with it, as before');
  ev('S.dailyWheel.buffs.zenyUntil=Date.now()-1000;bars()');
  assert.equal(hb.children.length,0,'the last boost clears the region completely');
  assert.equal(hb.style.display,'none','no empty-state box, label or placeholder remains');
  assert.equal(hb.textContent.trim(),'','and no leftover text');
});

test('the GM studio is a separate screen: three steps, a live preview, then a confirmation',()=>{
  ev('S.gm=true;ui();openMailDaily("mail")');
  const compose=click('[data-a=opengmstudio]');
  const studio=doc.getElementById('gmStudioModal');
  assert.ok(studio.classList.contains('on'),'Compose opens the studio');
  assert.ok(css.includes('#gmStudioModal{position:fixed;inset:0;display:none;align-items:center;justify-content:center;')&&css.includes('#gmStudioModal.on{display:flex}'),
    'the studio root is a hidden-by-default fixed overlay that appears when opened');
  assert.ok(css.includes('#gmStudioModal .mail-daily-card{')&&css.includes('height:min(780px,calc(100dvh - 28px))'),
    'the studio has a viewport-bounded, scrollable modal card');
  assert.ok(css.includes(':is(#mailDailyModal,#gmStudioModal) .rd-ico{width:15px;height:15px;stroke:currentColor;stroke-width:1.55;fill:none;'),
    'all studio symbols use the same sized outlined SVG styling as mail, preventing black fills and oversized default SVGs');
  assert.equal(studio.querySelectorAll('.rd-step').length,3,'audience, message and attachment steps');
  assert.ok(doc.getElementById('gmStudioPreview'),'with a player-side preview');
  assert.match(doc.getElementById('gmStudioPreview').textContent,/20 × Oridecon/,'the preview follows the form, attachment included');
  assert.equal(doc.querySelector('[data-a=gmstudiosend]'),null,'nothing can be sent before a review');
  doc.getElementById('gmStudioHeadline').value='Server maintenance';
  doc.getElementById('gmStudioBody').value='Back online at 10:00.';
  doc.getElementById('gmStudioBody').dispatchEvent(new g.window.Event('input',{bubbles:true}));
  assert.match(doc.getElementById('gmStudioPreview').textContent,/Server maintenance/,'the headline previews as the letter title');
  assert.match(doc.getElementById('gmStudioPreview').textContent,/Back online at 10:00\./,'and the body as the letter');
  assert.match(doc.getElementById('gmStudioCount').textContent,/^41 \/ 500$/,'headline and body share one 500-character budget');
  click('[data-a=gmstudioreview]');
  assert.match(doc.getElementById('gmStudioPanel').textContent,/all players/,'the confirmation names the audience');
  assert.match(doc.getElementById('gmStudioPanel').textContent,/20 × Oridecon/,'and the per-recipient gift');
  click('[data-a=gmstudiocancel]');
  assert.equal(doc.getElementById('gmStudioHeadline').value,'Server maintenance','cancelling keeps the draft');
  assert.equal(doc.querySelector('[data-a=gmstudiosend]'),null,'and returns to editing');
  click('[data-a=gmstudioreview]');
  click('[data-a=gmstudiosend]');
  assert.equal(ev('S.mail[0].body'),'Server maintenance\n\nBack online at 10:00.','the headline is the first line of the stored body');
  assert.equal(ev('S.mail[0].gift.payload.amount'),20,'the attachment is delivered with it');
  assert.equal(doc.getElementById('gmStudioHeadline').value,'','a sent announcement clears the composer');
});

test('the studio refuses an over-budget message and never posts a typed name as a player id',()=>{
  ev('S.gm=true;ui();openGmStudio()');
  doc.getElementById('gmStudioHeadline').value='x'.repeat(200);
  doc.getElementById('gmStudioBody').value='y'.repeat(400);
  doc.getElementById('gmStudioBody').dispatchEvent(new g.window.Event('input',{bubbles:true}));
  assert.match(doc.getElementById('gmStudioCount').textContent,/602 \/ 500/,'the counter shows the overrun');
  assert.ok(doc.getElementById('gmStudioCount').classList.contains('invalid'),'and flags it');
  assert.equal(doc.querySelector('[data-a=gmstudioreview]').disabled,true,'an over-budget draft cannot be reviewed');
  doc.getElementById('gmStudioBody').value='short';
  doc.getElementById('gmStudioBody').dispatchEvent(new g.window.Event('input',{bubbles:true}));
  click('[data-a=gmstudioaudience][data-v=player]');
  const picker=doc.getElementById('gmStudioPlayer');
  assert.ok(picker,'targeting one player swaps in a picker');
  assert.equal(picker.tagName,'SELECT','never a free-text name field');
  click('[data-a=gmstudioreview]');
  assert.match(doc.getElementById('gmStudioPanel').textContent,/Choose the player/,'an unresolved recipient is refused');
  assert.equal(doc.querySelector('[data-a=gmstudiosend]'),null,'and cannot be sent');
  ev('gmStudioPlayers=[{id:4242,u:"Ada"}];gmStudioDraft.player="4242";renderGmStudio()');
  assert.match(doc.getElementById('gmStudioPanel').textContent,/Ada/,'the confirmation names the resolved player');
  ev('closeGmStudio()');
  assert.ok(!doc.getElementById('gmStudioModal').classList.contains('on'),'closing the studio leaves the game running');
  assert.equal(ev('S.mail.length'),1,'and sent nothing');
});

test('cloud mail, claim receipts and the roll keep their original functions',()=>{
  for(const fn of['syncCloudMail','claimSingleMailEntry','claimMailGift','claimAllMailGifts','markAllMailRead','refreshCloudMail','pickDailyWheelIndex','spinDailyRoulette','gmApplyGift','dailyRouletteCardPool']){
    assert.equal(ev(`typeof ${fn}`),'function',fn+' still exists');
  }
  assert.equal(ev('dailyRouletteCardPool().every(c=>!c.bossCard&&!c.nightmare)'),true,'the card pool still excludes Boss and Nightmare');
  const rolls=new Set();
  for(let i=0;i<400;i++)rolls.add(ev('pickDailyWheelIndex()'));
  assert.ok(rolls.size>=5,'the roll still covers the pool, not just the demo slice');
});

console.log(`${passed} passed`);
}catch(err){console.error(err);process.exit(1)}
