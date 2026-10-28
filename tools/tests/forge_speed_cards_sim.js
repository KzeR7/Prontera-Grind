// v254 owner request, three checks in one place:
//  1. Ascension Forge stays reachable for a fourth job - including the off-hand shield that the
//     fourth jobs had silently lost - and a closed action names the exact shortage.
//  2. Simulation speed is a GM testing control. A player is always 1x and never sees the button.
//  3. Bag → Cards can list only the cards that can actually merge right now.
const assert = require('node:assert/strict');
const { createGame } = require('./helpers/game');
const g = createGame(), ev = g.ev, doc = g.window.document;
const box = html => { const b = doc.createElement('div'); b.innerHTML = html; return b; };
let passed = 0;
const test = (n, fn) => { ev('speed=1'); fn(); console.log('ok ' + n); passed++; };
try {
  test('fourth-job shield classes keep the off-hand slot and can forge an N+ shield', () => {
    ev(`S=fresh();S.lv=175;S.auto=false;S.cls='Rune Knight';S.jobs[S.cls]={jl:70,jx:0};
      S.zeny=1000;S.ascensionMat=[0,0,0];S.inv=[];
      S.eq.weapon={id:9502,name:'Blade',slot:'weapon',wt:'sword',sec:5,tier:4,val:100,r:0,cards:[],aff:[],slots:2};
      S.eq.off={id:9501,name:'Bulwark',slot:'off',sec:5,tier:4,val:100,r:0,cards:[],aff:[],slots:1};`);
    assert.equal(ev('fourthJob()'), true);
    assert.equal(ev('canShield()'), true, 'a Rune Knight fights with a shield');
    assert.equal(ev('canUse(S.eq.off)'), true);
    assert.ok(ev('ascensionCandidates().some(x=>x.id===9501)'), 'the N+ shield is offered');
    ev(`ascensionSetPick='celestial';ascensionItemPick='9501'`);
    const b = box(ev('ascensionForgePanel()'));
    assert.equal(b.querySelectorAll('.ascension-costs>div').length, 3, 'the shield recipe is priced');
    assert.match(b.querySelector('.ascension-item-change').textContent, /Mythic Celestial Aegis/);
    // Every fourth-job line in the other shield list (the load-time repair) is honoured here too.
    for (const cls of ['Rune Knight', 'Arch Bishop', 'Mechanic']) {
      ev(`S.cls='${cls}'`);
      assert.equal(ev('canShield()'), true, cls + ' keeps its shield');
    }
    for (const cls of ['Warlock', 'Ranger', 'Guillotine Cross']) {
      ev(`S.cls='${cls}'`);
      assert.equal(ev('canShield()'), false, cls + ' still has no shield');
    }
    ev(`S.cls='Rune Knight'`);
  });

  test('a closed forge action names the shortage and opens when it is paid', () => {
    ev(`ascensionSetPick='celestial';S.ascensionMat=[0,0,0];S.zeny=0;ascensionItemPick='9501'`);
    let b = box(ev('ascensionForgePanel()')), btn = b.querySelector('[data-a=transformasc]');
    assert.equal(btn.disabled, true);
    assert.match(btn.textContent, /missing Astral Shard \+15/);
    assert.match(btn.textContent, /Zeny \+/);
    ev(`S.ascensionMat=[26,0,3];S.zeny=104000000`);
    b = box(ev('ascensionForgePanel()')); btn = b.querySelector('[data-a=transformasc]');
    assert.equal(btn.disabled, false);
    assert.equal(btn.textContent.trim(), 'Ascend selected equipment');
    // Switching the set no longer drops the chosen item (the old pick was cleared to '').
    ev(`ACT.ascset('molten')`);
    assert.equal(ev('ascensionItemPick'), '9501');
    b = box(ev('ascensionForgePanel()'));
    assert.ok(b.querySelector('[data-a=transformasc]'), 'the preview survives a set change');
    assert.match(b.querySelector('[data-a=transformasc]').textContent, /Primal Catalyst|missing/);
  });

  test('simulation speed is a GM control and players stay at 1x', () => {
    ev(`S=fresh();S.gm=false;speed=4;renderWin()`);
    assert.equal(ev(`$('spd').hidden`), true, 'players never see the button');
    assert.equal(ev('speed'), 1, 'a leftover multiplier is dropped');
    assert.equal(ev(`$('spd').textContent`), 'Speed x1');
    ev(`$('spd').click()`);
    assert.equal(ev('speed'), 1, 'a hidden control cannot raise the speed');
    ev(`S.gm=true;renderWin()`);
    assert.equal(ev(`$('spd').hidden`), false, 'the GM keeps the testing control');
    ev(`$('spd').click()`);
    assert.equal(ev('speed'), 2);
    ev(`$('spd').click()`);
    assert.equal(ev('speed'), 4);
    // `syncSpeed()` is the only writer outside the guarded click, so a demotion (or a reload on
    // a player account) drops the multiplier back to 1x before the next frame reads it.
    ev(`S.gm=false;renderWin()`);
    assert.equal(ev('speed'), 1, 'the next refresh clamps a demoted account to 1x');
  });

  test('Bag → Cards lists only mergeable cards when the filter is on', () => {
    ev(`S=fresh();S.auto=false;S.cards=[
      {id:11,card:1,cardKey:'0:1:0',n:'Poring',g:0,stat:'str',v:3,effects:[{k:'str',v:3}],fit:['weapon']},
      {id:12,card:1,cardKey:'0:1:0',n:'Poring',g:0,stat:'str',v:3,effects:[{k:'str',v:3}],fit:['weapon']},
      {id:13,card:1,cardKey:'2:3:0',n:'Zombie',g:1,stat:'vit',v:4,effects:[{k:'vit',v:4}],fit:['armor']}];
      openTab('bag');sub.bag='cards';collectionGrade=-1;collectionMergeOnly=false;selC=null;`);
    let b = box(ev('V.bag()'));
    assert.equal(b.querySelectorAll('.grid .cell').length, 2, 'both card kinds are listed');
    const toggle = b.querySelector('[data-a=cardmerge]');
    assert.equal(toggle.getAttribute('aria-pressed'), 'false');
    assert.match(toggle.textContent, /Mergeable now \(1\)/);
    ev(`ACT.cardmerge('1')`);
    b = box(ev('V.bag()'));
    assert.equal(b.querySelectorAll('.grid .cell').length, 1, 'only the pair that can merge is listed');
    assert.equal(b.querySelector('[data-a=cardmerge]').getAttribute('aria-pressed'), 'true');
    // The filter follows the real rule: losing the spare copy empties it again.
    ev(`S.cards=S.cards.filter(c=>c.id!==12)`);
    b = box(ev('V.bag()'));
    assert.equal(b.querySelectorAll('.grid .cell').length, 0);
    assert.match(b.textContent, /Nothing can merge right now/);
    // ★ / ★★ costs grow 1 → 3 → 5, and the detail button reports the shortfall.
    ev(`S.cards=[
      {id:21,card:1,cardKey:'3:2:0',n:'Whisper',g:1,stat:'vit',v:4,effects:[{k:'vit',v:4}],fit:['armor'],stars:1},
      {id:22,card:1,cardKey:'3:2:0',n:'Whisper',g:1,stat:'vit',v:4,effects:[{k:'vit',v:4}],fit:['armor']}];
      selC=cardGroup(S.cards[0]);collectionMergeOnly=false;`);
    assert.equal(ev('cardMergeable(S.cards[0])'), false, 'a ★ merge needs three unstarred copies');
    b = box(ev('V.bag()'));
    assert.match(b.querySelector('[data-a=mergecard]').textContent, /need 2 more/);
    ev(`S.cards.push(...[0,1,2].map(i=>({id:30+i,card:1,cardKey:'3:2:0',n:'Whisper',g:1,stat:'vit',v:4,effects:[{k:'vit',v:4}],fit:['armor']})))`);
    assert.equal(ev('cardMergeable(S.cards[0])'), true);
    b = box(ev('V.bag()'));
    assert.match(b.querySelector('[data-a=mergecard]').textContent, /3 extra copies/);
    assert.match(b.querySelector('[data-a=cardmerge]').textContent, /Mergeable now/);
  });
  console.log(passed + ' checks passed');
} finally { g.close() }
