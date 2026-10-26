/* Static visual mockups only. Navigation changes the presented screen, not game state.
   No imports of index.html, accounts, auto-sell or reforge execution; no persistence. */
'use strict';
(() => {
  const $ = selector => document.querySelector(selector);
  const icons = {
    shield: '<path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6z"/><path d="m8 12 3 3 5-6"/>',
    sword: '<path d="m14 4 6-1-1 6-9 9-4-4zM4 12l8 8M3 21l4-4"/>',
    check: '<path d="m5 12 4 4L19 6"/>',
    rotate: '<path d="M20 8a8 8 0 1 0 .5 7M20 3v6h-6"/>',
    chevron: '<path d="m8 5 7 7-7 7"/>',
    down: '<path d="m5 9 7 7 7-7"/>',
    arrow: '<path d="M4 12h16m-6-6 6 6-6 6"/>',
    close: '<path d="m6 6 12 12M6 18 18 6"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    coin: '<circle cx="12" cy="12" r="8.5"/><path d="M9 8h6l-6 8h6M12 5v2m0 10v2"/>',
    ore: '<path d="m9 3 8 3 4 8-6 7-11-4-1-8zM9 3l-1 9 7 9m2-15-9 6 13 2"/>',
    shard: '<path d="m13 2 6 9-8 11-6-10zM13 2l-2 12 8-3M5 12l6 2v8"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-10v.5"/>',
    search: '<circle cx="10" cy="10" r="6"/><path d="m15 15 5 5"/>',
    lock: '<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V6a4 4 0 0 1 8 0v4m-4 4v3"/>',
    card: '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="m12 7 4 5-4 5-4-5z"/>',
    sparkle: '<path d="m12 2 2.5 7.5L22 12l-7.5 2.5L12 22l-2.5-7.5L2 12l7.5-2.5z"/>',
    tune: '<path d="M4 7h16M4 17h16"/><circle cx="8" cy="7" r="2.5" fill="var(--panel)"/><circle cx="16" cy="17" r="2.5" fill="var(--panel)"/>',
    star: '<path d="m12 2 2.6 6.4L21 11l-6.4 2.6L12 20l-2.6-6.4L3 11l6.4-2.6z"/>',
    merge: '<path d="M4 6h5l3 3-3 3H4M20 18h-5l-3-3 3-3h5M9 9h6M9 15h6"/>',
    diamond: '<path d="m12 2 9 10-9 10-9-10zM3 12h18M12 2l-3 10 3 10 3-10z"/>',
  };
  const svg = (name, extra = '') => `<svg class="icon ${extra}" viewBox="0 0 24 24" aria-hidden="true">${icons[name] || icons.sparkle}</svg>`;
  // Equipment grade is explicit fixture data, never inferred from the icon or
  // refinement rank. Mythic uses a distinct cyan so it cannot be confused with
  // Legendary gold; the M code and full name still identify it without color.
  const RARITY_META = [
    {name:'Common', code:'C', color:'#b5c2ce', label:'Common'},
    {name:'Fine', code:'F', color:'#68df9b', label:'Fine'},
    {name:'Rare', code:'R', color:'#6aafff', label:'Rare'},
    {name:'Epic', code:'E', color:'#c18aff', label:'Epic'},
    {name:'Legendary', code:'L', color:'#ffd26e', label:'Legendary'},
    {name:'N', code:'N', color:'#9d8dff', label:'Nightmare'},
    {name:'N+', code:'N+', color:'#ff85cf', label:'Nightmare+'},
    {name:'Mythic', code:'M', color:'#3ddad9', label:'Mythic · cyan'},
  ];
  const rarityBadge = rarity => {
    const r=RARITY_META[rarity];
    return `<span class="rarity-badge" data-rarity="${rarity}" style="--rarity-color:${r.color}" role="img" aria-label="Rarity: ${r.name}" title="${r.label}">${r.code}</span>`;
  };
  const tile = (id, rank = '', rarity = 7) => {
    const r=RARITY_META[rarity];
    return `<span class="icon-tile rarity-${rarity}" data-rarity="${rarity}" style="--rarity-color:${r.color}"><img src="/assets/equipment-icons/${id}.png" alt="" draggable="false">${rarityBadge(rarity)}${rank ? `<i class="rank">+${rank}</i>` : ''}</span>`;
  };
  const rarityLegend = () => `<div class="rarity-legend" role="list" aria-label="Equipment rarity key"><span class="legend-title">Rarity</span>${RARITY_META.map((r,i)=>`<span class="rarity-key" role="listitem" data-rarity="${i}" style="--rarity-color:${r.color}">${rarityBadge(i)}<span>${r.label}</span></span>`).join('')}</div>`;
  const button = (label, type = '', icon = '') => `<span class="visual-button ${type}">${icon ? svg(icon) : ''}${label}</span>`;
  const pill = (label, type = '', icon = '') => `<span class="pill ${type}">${icon ? svg(icon) : '<i class="dot"></i>'}${label}</span>`;
  const currentItem = {name: 'Celestial Blade', icon: 500049, rank: 10};
  const gear = [
    ['Main hand', 'Celestial Blade', 500049, 10],
    ['Headgear', 'Celestial Circlet', 430002, 8],
    ['Armor', 'Celestial Vestments', 450264, 9],
    ['Off-hand', 'Celestial Aegis', 460040, 7],
    ['Footwear', 'Celestial Greaves', 470196, 8],
    ['Accessory 1', 'Celestial Signet', 490327, 6],
    ['Accessory 2', 'Celestial Signet', 490327, 6],
  ];
  // Ranges and single/full quotes match the current real helpers for a Celestial
  // Mythic sword, sec=6/tier=4/mp=0. These are examples, not a player's equipment.
  const affixes = [
    {name:'STR', value:'+66', min:44, max:69, position:88, kind:'shield'},
    {name:'ATK', value:'+62%', min:42, max:66, position:83, kind:'shield'},
    {name:'Crit', value:'+25%', min:17, max:27, position:80, kind:'shield'},
    {name:'AGI', value:'+46', min:44, max:69, position:8, kind:'rotate', reroll:true},
  ];
  // Static card examples from the current CARD_CATALOG. `gameEffects` preserves
  // the game's exact text for the checker; `effects` is the readable proposal copy.
  const CARD_GRADE_META = [
    {name:'Common', color:'#e0e5ec'},
    {name:'Uncommon', color:'#94efb2'},
    {name:'Rare', color:'#9ecaff'},
    {name:'Legendary', color:'#ffe197'},
  ];
  const CARD_FIT_LABELS = {weapon:'Weapon',head:'Head',armor:'Armor',off:'Shield',leg:'Footwear',acc:'Accessory'};
  const cardExamples = [
    {name:'Poring Card', family:'Poring Card', grade:0, gameEffects:['LUK +3'], effects:['LUK +3'], fit:['acc'], copies:7, boss:false, value:3, note:'Accessory only'},
    {name:'Willow Card', family:'Willow Card', grade:0, gameEffects:['INT +3','Magic Power +4%'], effects:['INT +3','Magic Power +4%'], fit:['weapon','head','acc'], copies:2, boss:false, value:3, note:'Weapon · Head · Accessory'},
    {name:'Marina Card', family:'Marina Card', grade:1, gameEffects:['Magic Power +3%'], effects:['Magic Power +3%'], fit:['weapon','head'], copies:4, boss:false, value:3, note:'Weapon · Head'},
    {name:'Mantis Card', family:'Mantis Card', grade:2, gameEffects:['STR +12','ATK % +6'], effects:['STR +12','ATK +6%'], fit:['weapon','acc'], copies:3, boss:false, value:12, note:'Weapon · Accessory', selected:true},
    {name:'Eddga Card', family:'Eddga Card', grade:3, gameEffects:['ATK % +8'], effects:['ATK +8%'], fit:['weapon'], copies:1, boss:true, value:8, note:'Weapon · Boss card'},
    {name:'Fabre Card', family:'Fabre Card', grade:0, gameEffects:['Max HP +50'], effects:['Max HP +50'], fit:['head','armor'], copies:2, boss:false, value:50, note:'Head · Armor'},
  ];
  const cardRules = [
    ['Only cards that fit the equipment are offered', 'A weapon card cannot be inserted into footwear or armor.'],
    ['One card per monster family on each item', 'Normal and Nightmare versions of a monster share the same family.'],
    ['At most two boss cards and two Crit DMG cards per item', 'The current socket limits stay unchanged.'],
    ['Cards are never silently discarded', 'Compatible cards transfer on replacement; incompatible cards stay on the old item. Bulk sale returns inserted cards.'],
  ];

  const notes = {
    loadout: [
      ['One place for gear', 'Loadout, Refine, Affixes, Cards and Auto-sell share a predictable home. Bag links to the same card and sell settings.'],
      ['Less hunting for actions', 'Keep the equipped hero, roomy inventory and one item inspector. Put upgrade actions beside the selected piece.'],
      ['Rarity at a glance', 'A compact key explains C, F, R, E, L, N, N+ and M. Mythic is cyan, clearly separate from Legendary gold.'],
    ],
    affixes: [
      ['One piece at a time', 'A compact gear picker replaces the stack of every item’s reforge form. The selected piece stays in view.'],
      ['Keep versus reroll', 'Green rows stay unchanged for this attempt. Gold rows reroll; their stat type can change too. No new lock currency.'],
      ['Know the full price', 'See the exact Zeny, ore and material quote before paying. Compare the new offer before replacing your affixes.'],
    ],
    autosell: [
      ['Sell these → keep these', 'Choose rarities first, then protections. Add only the affix conditions you need, instead of scanning 14 empty inputs.'],
      ['Rules you can read', 'A plain-English summary makes “any” versus “all” understandable. Show why sample gear is sold or kept.'],
      ['Apply is not bulk sell', 'Draft changes do nothing until applied to future drops. Selling existing bag items remains a separate reviewed action.'],
    ],
    cards: [
      ['One home for cards', 'Collection, compatible slots, copies, stars and socket location stay together. Card Mastery remains a separate loose-card action.'],
      ['Rules before the click', 'Show why a card fits, why two copies cannot share one item, and the exact duplicate cost before merging or removal.'],
      ['Cards stay accounted for', 'Insert, remove, transfer, bulk sale and Mastery all preserve card ownership. Auto-sell protects socketed gear by default.'],
    ],
    offer: [
      ['Your current gear stays', 'A paid roll does not overwrite the item. Clearly mark the three unchanged affixes and the one proposed replacement.'],
      ['Different is not always better', 'AGI becoming ASPD is a different stat, not a promised DPS upgrade. Avoid misleading green “better” labels.'],
      ['Two clear decisions', 'Keep current or use the new affixes. Any “roll again” action must show a fresh full quote and pay again.'],
    ],
  };
  const captions = {
    loadout: '01 / LOADOUT — EVERYTHING WHERE YOU EXPECT IT.',
    affixes: '02 / AFFIXES — KEEP WHAT WORKS. REROLL WHAT DOESN’T.',
    autosell: '03 / AUTO-SELL — SELL THESE. KEEP THESE. REVIEW FIRST.',
    cards: '05 / CARDS — SEE THE CARD, THE FIT AND THE RULE.',
    offer: '04 / REFORGE RESULT — A CLEAR DECISION, NOT A GUESS.',
  };

  function chrome(view, body, footer) {
    const selected = view === 'offer' ? 'affixes' : view;
    return `<section class="window ${view}-window" aria-label="${view === 'autosell' ? 'Auto-sell' : view === 'offer' ? 'Reforge result' : view === 'loadout' ? 'Equipment loadout' : view === 'cards' ? 'Cards and sockets' : 'Affixes'} static mockup">
      <header class="window-head"><span class="head-emblem">${svg('sword')}</span><div><p class="eyebrow">YOUR ADVENTURE, REFINED</p><h2>Equipment</h2></div><div class="window-trailing"><span class="wallet">${svg('coin')}<span>${view === 'offer' ? '17,480,000' : '24,680,000'}<small>Zeny</small></span></span><span class="close-visual">${svg('close')}</span></div></header>
      <nav class="subnav" aria-label="Equipment proposal navigation"><a href="#loadout" ${selected === 'loadout' ? 'aria-current="page"' : ''}>Loadout</a><span title="Existing Refine screen is retained; not redrawn in this proposal">Refine</span><a href="#affixes" ${selected === 'affixes' ? 'aria-current="page"' : ''}>Affixes</a><a href="#cards" ${selected === 'cards' ? 'aria-current="page"' : ''}>Cards <small class="nav-new">WORKSPACE</small></a><a href="#autosell" ${selected === 'autosell' ? 'aria-current="page"' : ''}>Auto-sell <small class="nav-new">NEW HOME</small></a><span title="Existing forge is retained; not redrawn in this proposal">Ascension Forge</span><span class="nav-note">RUNE KNIGHT · BASE 150</span></nav>
      ${body}${footer}
    </section>`;
  }
  function gearSidebar(offer = false) {
    return `<aside class="gear-sidebar"><p class="micro">Equipped gear <span>7 pieces</span></p><div class="gear-list">${gear.map(([slot,name,id,rank],i) => `<div class="gear-row ${!i ? 'selected' : ''}">${tile(id,rank)}<div class="gear-copy"><small>${slot}</small><b>${name}</b></div>${!i ? svg('chevron') : ''}</div>`).join('')}</div><p class="sidebar-note">${offer ? 'Resolve this paid offer before starting another reforge.' : 'Select an equipped piece to inspect and reforge its affixes.'}</p></aside>`;
  }
  const mobilePicker = () => `<div class="mobile-picker"><span class="micro">Selected gear</span> Main hand · Celestial Blade ${svg('down')}</div>`;
  function itemHeading() {
    return `<div class="item-heading">${tile(currentItem.icon,currentItem.rank)}<div><p class="micro">MYTHIC · MAIN HAND · EQUIPPED</p><h3>+10 Celestial Blade</h3><small>Sword · 4 random affixes</small></div>${pill('Celestial set','muted')}</div>`;
  }
  function affixRows() {
    return affixes.map(a => `<div class="affix-row ${a.reroll ? 'reroll' : ''}"><span class="affix-glyph">${svg(a.kind)}</span><div><div class="affix-value"><b>${a.name} ${a.value}</b><span>${a.reroll ? 'Selected' : 'Unchanged'}</span></div><div class="roll-range"><span class="roll-track"><i style="width:${a.position}%"></i></span><span>Range ${a.min}–${a.max}${a.name === 'ATK' || a.name === 'Crit' ? '%' : ''}</span></div></div><span class="row-state">${svg(a.reroll ? 'rotate' : 'shield')}${a.reroll ? 'Reroll' : 'Keep'}</span></div>`).join('');
  }
  function cost(symbol, name, value, have) {
    return `<div class="cost-row"><span class="cost-symbol">${svg(symbol)}</span><div><p class="cost-main"><span>${name}</span><b>${value}</b></p><small>Owned ${have} <span>· Enough</span></small></div></div>`;
  }
  function quote() {
    return `<aside class="quote"><p class="micro">THIS ATTEMPT</p><h4>A small, focused change.</h4><div class="selection-split"><div><b>1</b><span>affix to reroll</span></div><div><b>3</b><span>affixes kept</span></div></div><div class="costs">${cost('coin','Zeny','7,200,000','24,680,000')}${cost('ore','Oridecon','32','128')}${cost('shard','Astral Shards','5','28')}</div><p class="ready">${svg('check')} All costs covered</p><p class="price-note">Selective reforging costs more because your other affixes are protected for this roll.</p><div class="quote-alt"><b>Want to change every affix?</b><p>Full reforge replaces all four. Nothing is protected.</p><span>Full reforge · 1,200,000 Zeny</span></div></aside>`;
  }
  function affixView() {
    const body = `${mobilePicker()}<div class="affix-layout">${gearSidebar()}<section class="affix-editor">${itemHeading()}<div class="affix-instruction"><div><h4>Choose what to reroll</h4><p class="helper">Unselected affixes stay exactly as they are.</p></div><span>1 of 4 selected</span></div><div class="affix-rows">${affixRows()}</div><div class="pool-link"><span>Possible replacement affixes</span><small>5 available ${svg('chevron')}</small></div><p class="roll-note">${svg('info')} A reroll can change both the stat and its value. No duplicate stats.</p></section>${quote()}</div>`;
    const footer = `<footer class="workbench-footer"><div class="footer-warning">${svg('info')}<div><b>You pay when you roll, not when you accept.</b><p>Your current affixes stay until you choose a new offer. Costs are not refunded.</p></div></div><div class="footer-actions"><a class="text-action" href="#offer">See result mockup ${svg('arrow')}</a>${button('Reforge 1 affix','primary','rotate')}</div></footer>`;
    return chrome('affixes',body,footer);
  }
  const rarityNames = RARITY_META.map(r=>r.name);
  const rarityColors = RARITY_META.map(r=>r.color);
  function rarityOptions() {
    return `<div class="rarity-options">${rarityNames.map((n,i) => `<div class="rarity-option ${i<3 ? 'active' : ''}" data-rarity="${i}" style="--rarity:${rarityColors[i]};--rarity-color:${rarityColors[i]}"><i>${i<3 ? svg('check') : ''}</i><b>${n}</b></div>`).join('')}</div>`;
  }
  function condition(stat, min) {
    return `<div class="condition"><span class="fake-select">${stat} ${svg('down')}</span><span class="comparison-word">at least ≥</span><span class="fake-number">${min}</span><span class="unit">%</span><span class="remove-visual">${svg('close')}</span></div>`;
  }
  function protection(icon, name, help) {
    return `<div class="protection-option">${svg(icon)}<div><b>${name}</b><small>${help}</small></div><span class="toggle"></span></div>`;
  }
  function example(id, name, reason, action, rarity) {
    return `<div class="preview-example">${tile(id,'',rarity)}<div><b>${name}</b><small>${reason}</small></div><span class="${action === 'Keep' ? 'kept' : ''}">${action}</span></div>`;
  }
  function autoSellView() {
    const body = `<div class="sell-topline"><div><h3>Make room for better drops.</h3><p>Decide what can go, and what should stay.</p></div>${pill('Draft · Not active','muted')}</div><div class="sell-layout"><section class="rule-builder"><section class="step-section"><div class="step-title"><span class="step-number">1</span><h4>What can be sold?</h4><small>Choose rarities</small></div>${rarityOptions()}<p class="helper">Only selected rarities can be sold. All others stay in your bag.</p></section><section class="step-section"><div class="step-title"><span class="step-number">2</span><h4>What should be kept?</h4><small>Safety first</small></div><div class="protection-options">${protection('sparkle','Refined equipment','Any piece with +1 or higher')}${protection('card','Gear with inserted cards','Empty sockets are separate')}</div><div class="affix-rule-head"><span class="fake-select">Keep matching affixes ${svg('down')}</span><div class="match-selector">Match <span class="segment"><span class="active">ANY</span><span>ALL</span></span> condition</div></div><div class="condition-rows">${condition('ATK',20)}${condition('Crit',8)}</div><p class="condition-add">${svg('plus')} Add affix condition</p><p class="helper">Keep a piece if ATK is at least 20% <b>or</b> Crit is at least 8%.</p></section><div class="advanced-line"><span>${svg('tune')} Advanced filters ${svg('down')}</span><small>Slots, weapons, exact names &amp; empty sockets</small></div></section><aside class="sell-summary"><div class="section-head"><div class="step-title" style="margin:0"><span class="step-number">3</span><h4>Check your rules</h4></div></div><p class="summary-sentence">Sell <strong>Common, Fine &amp; Rare</strong> drops, unless they are <span class="keep">refined</span>, have <span class="keep">inserted cards</span>, or have:<br><span class="keep">ATK ≥ 20%</span><span class="summary-logic">OR</span><span class="keep">Crit ≥ 8%</span></p><div class="always-protected">${svg('shield')}<div><b>Always protected</b><p>Locked gear, equipped items, saved class loadouts &amp; paid reforge offers.</p></div></div><section class="sample-preview"><div class="section-head"><p class="micro">DRAFT PREVIEW</p><span class="sample-tag">42 sample items</span></div><div class="preview-totals"><div><b>18</b><small>would sell</small></div><div><b>24</b><small>would keep</small></div></div>${example(1101,'Blade','Common · no keep rule','Sell',0)}${example(1250,'Katar','Rare · ATK +24%','Keep',2)}${example(2401,'+3 Sandals','Fine · refined','Keep',1)}<p class="preview-value"><span>Sample sale value</span><b>64,200 Zeny</b></p></section><p class="helper">Illustrative preview only. The real screen would list every matched item and its keep/sell reason.</p></aside></div>`;
    const footer = `<footer class="workbench-footer"><div class="footer-warning">${svg('shield')}<div><b>Applies to future drops, including offline loot.</b><p>Your existing bag is not sold. Bulk selling has its own preview and confirmation.</p></div></div><div class="footer-actions">${button('Discard draft')}${button('Apply to new drops','primary','check')}</div></footer>`;
    return chrome('autosell',body,footer);
  }
  function loadoutView() {
    const slots = [['head',430002,8,'Headgear'],['weapon',500049,10,'Main hand'],['armor',450264,9,'Armor'],['off',460040,7,'Off-hand'],['leg',470196,8,'Footwear'],['acc1',490327,6,'Accessory'],['acc2',490327,6,'Accessory']];
    const bagExamples = [
      [500054,7,3], [13454,7,4], [510061,7,5], [450270,7,6], [470197,7], [490328,7],
      [1101,2], [1207,2], [1250,2], [1501,2], [1601,2], [18130,2],
      [15378,3], [15379,3], [22200,3], [430002,3], [490104,3], [1680,3],
      [1217,0], [1137,1], [1527,4], [1232,5], [460023,6], [490451,0],
    ];
    const body = `<div class="loadout-layout"><aside class="equipped-column"><div class="section-head"><p class="micro">EQUIPPED</p>${pill('7 / 7','muted')}</div><div class="loadout-doll"><div class="doll-orbit"></div><canvas id="nativeHero" class="native-hero" width="216" height="312" role="img" aria-label="Original native Rune Knight, static idle pose"></canvas>${slots.map(([key,id,rank,label])=>`<div class="doll-slot ${key} ${key === 'weapon' ? 'selected' : ''}">${tile(id,rank)}<small>${label}</small></div>`).join('')}</div><div class="character-caption"><b>Rune Knight</b><small>Base 150 · Job 50</small></div><div class="character-facts"><div><span>ATK</span><b>8,420</b></div><div><span>DEF</span><b>1,280</b></div><div><span>Crit</span><b>60%</b></div><div><span>ASPD</span><b>186</b></div></div></aside><section class="inventory-column"><div class="section-head"><h3>Your inventory</h3><span class="minor">42 / 1,000</span></div><div class="search-visual">${svg('search')} Search equipment…</div><div class="filter-row"><span class="active">All gear</span><span>Weapons</span><span>Armor</span><span>Accessories</span></div>${rarityLegend()}<div class="fresh-drops"><span>Items stay in place while farming</span><span>Show 3 new drops ↗</span></div><div class="inventory-grid">${Array.from({length:30},(_,i) => {
      const item=bagExamples[i];
      if(!item)return '<div class="bag-tile empty"></div>';
      const [id,rarity,rank='']=item;
      return `<div class="bag-tile rarity-${rarity}" data-rarity="${rarity}" style="--rarity-color:${RARITY_META[rarity].color}">${tile(id,rank,rarity)}${[0,4,16].includes(i) ? `<span class="tile-lock" title="Locked">${svg('lock')}</span>` : ''}</div>`;
    }).join('')}</div><div class="inventory-count"><span>Showing 24 sample pieces</span><span>Rarity: All ${svg('down')}</span></div><div class="inventory-bottom"><span class="toggle"></span><div><b>Auto-equip higher base value</b><p>Affixes and cards are not compared automatically.</p></div></div></section><aside class="item-inspector"><p class="micro">SELECTED · EQUIPPED</p><div class="item-heading">${tile(500049,10)}<div><p class="micro">MYTHIC · SWORD</p><h3>+10 Celestial Blade</h3><small>Main hand · Celestial set</small></div></div><div class="item-power"><span>WEAPON ATK</span><b>1,250</b></div><div class="inspector-affixes">${affixes.map(a=>`<div><span>◇ ${a.name}</span><b>${a.value}</b></div>`).join('')}</div><div class="socket-visual"><p class="micro">CARD SOCKETS · 1 / 3 FILLED</p><p>${svg('card')} 1 inserted card</p><p>${svg('plus')} 2 empty sockets · Insert a card</p><a class="socket-link" href="#cards">Manage cards ${svg('arrow')}</a></div><div class="inspector-actions">${button('Refine equipment','primary','sparkle')}<a class="visual-button" href="#affixes">Manage affixes ${svg('arrow')}</a><div>${button('Unequip')}${button('Lock gear','','lock')}</div></div></aside></div>`;
    const footer = `<footer class="workbench-footer"><div class="footer-warning">${svg('info')}<div><b>Selecting an item only inspects it. Equipping or selling is always an explicit action.</b></div></div><a class="text-action" href="#autosell">Configure auto-sell ${svg('arrow')}</a></footer>`;
    return chrome('loadout',body,footer);
  }
  const cardGradeBadge = c => `<span class="card-grade-badge" style="--card-grade:${CARD_GRADE_META[c.grade].color}"><i></i>${CARD_GRADE_META[c.grade].name}</span>`;
  function cardRow(c) {
    const fits=c.fit.map(k=>CARD_FIT_LABELS[k]).join(' / ');
    return `<div class="card-row ${c.selected?'selected':''}" data-card-name="${c.name}" data-card-grade="${c.grade}" style="--card-grade:${CARD_GRADE_META[c.grade].color}">
      <span class="card-art small">${svg('card')}</span>
      <span class="card-copy"><b>${c.name}${c.boss?' <em>BOSS</em>':''}</b><small>${c.effects.join(' · ')}</small><small>${fits}</small></span>
      <span class="card-count">×${c.copies}</span>
    </div>`;
  }
  function cardsView() {
    const selected=cardExamples.find(c=>c.selected);
    const body=`<div class="cards-topline"><div><h3>Cards, without the guesswork.</h3><p>See effects, copies, fit and location before you socket, remove or merge.</p></div><div class="cards-meta">${pill('17 loose · 5 socketed','muted')}${pill('Existing rules','green','shield')}</div></div>
      <div class="cards-layout"><aside class="card-collection"><div class="section-head"><p class="micro">CARD COLLECTION</p><span class="minor">6 kinds shown</span></div><div class="search-visual">${svg('search')} Search cards or effects…</div><div class="card-grade-filters"><span class="active">All grades</span><span>Common</span><span>Uncommon</span><span>Rare</span><span>Legendary</span></div><div class="card-list">${cardExamples.map(cardRow).join('')}</div><p class="helper">Starred cards are protected from Card Mastery donations and resets. Normal and Nightmare copies merge separately.</p></aside>
      <section class="card-detail"><div class="section-head"><p class="micro">SELECTED LOOSE CARD</p>${cardGradeBadge(selected)}</div><div class="card-hero"><span class="card-art large">${svg('card')}<i>${svg('star')}</i></span><div><h3>${selected.name}</h3><small>Monster family · ${selected.family}</small><small>Loose card · ${selected.copies} identical copies</small></div>${pill('Fits Main hand','green','check')}</div>
      <div class="card-facts"><div><span>EFFECTS</span><div class="card-effects">${selected.effects.map(e=>`<b>${e}</b>`).join('')}</div></div><div><span>COMPATIBLE SLOTS</span><div class="card-fit-chips">${selected.fit.map(k=>`<span>${CARD_FIT_LABELS[k]}</span>`).join('')}</div></div></div>
      <div class="card-actions">${button('Insert into Main hand','primary','plus')}${button('Merge to ★ · 1 extra copy','soft','merge')}${button(`Sell 1 · ${(selected.value*150).toLocaleString('en-US')} Zeny`,'','coin')}</div>
      <div class="card-rule-box"><p class="micro">BEFORE YOU ACT</p><div class="card-rule-grid">${cardRules.map(([title,copy],i)=>`<div class="card-rule"><span>0${i+1}</span><div><b>${title}</b><p>${copy}</p></div></div>`).join('')}</div></div>
      <div class="card-mastery">${svg('sparkle')}<div><b>Card Mastery stays separate.</b><p>Only loose cards can be dedicated. Socketed cards and starred cards are not consumed by Mastery donations or resets.</p></div></div></section>
      <aside class="socket-panel"><div class="section-head"><p class="micro">SOCKETS ON THIS ITEM</p><span class="minor">1 / 3 filled</span></div><div class="socket-item">${tile(500049,10,7)}<div><b>+10 Celestial Blade</b><small>Main hand · 3 card sockets</small></div></div><div class="socket-list"><div class="socket-row filled"><span class="card-art small">${svg('card')}</span><div class="socket-copy"><b>Rocker Card</b><small>STR +3 · Common</small></div><span class="socket-remove">Remove · 200 Zeny</span></div><div class="socket-row empty"><span class="card-art small">${svg('plus')}</span><div class="socket-copy"><b>Empty socket</b><small>Insert a compatible loose card</small></div></div><div class="socket-row empty"><span class="card-art small">${svg('plus')}</span><div class="socket-copy"><b>Empty socket</b><small>Insert a compatible loose card</small></div></div></div>
      <p class="socket-note">Removal returns the card to your collection and shows its Zeny cost first.</p><div class="card-safety">${svg('shield')}<div><b>Auto-sell protects inserted cards.</b><p>Socketed gear is kept by default. A reviewed bulk sale returns inserted cards before selling the item.</p></div></div><a class="text-action" href="#autosell">Review auto-sell protection ${svg('arrow')}</a></aside></div>`;
    const footer=`<footer class="workbench-footer"><div class="footer-warning">${svg('info')}<div><b>Compatible cards transfer when you replace gear. Cards that cannot fit stay on the old item.</b><p>Inserting, removing, merging, selling and Card Mastery remain separate explicit actions.</p></div></div><div class="footer-actions">${button('Back to Loadout')}${button('Open Card Mastery','primary','sparkle')}</div></footer>`;
    return chrome('cards',body,footer);
  }
  function offerView() {
    const rows = affixes.map((a,i) => `<div class="compare-row ${i===3 ? 'changed' : ''}"><span>${a.name} ${a.value}${i===3 ? '<small>Current affix · stays until replaced</small>' : ''}</span>${svg('arrow')}<b>${i===3 ? 'ASPD +45%<small>Possible range 32–50%</small>' : a.name+' '+a.value}</b><span class="status">${i===3 ? 'Different stat' : 'Unchanged'}</span></div>`).join('');
    const body = `${mobilePicker()}<div class="affix-layout offer-layout">${gearSidebar(true)}<section class="affix-editor">${itemHeading()}<p class="offer-banner">${svg('check')} Reforge complete. Review before replacing.</p><div class="compare-head"><span>CURRENT</span><span></span><span>NEW OFFER</span><span></span></div>${rows}<p class="compare-note">Three affixes are unchanged. AGI would become ASPD.<br>A different stat is not automatically an upgrade for your build.</p></section><aside class="quote"><p class="micro">PAID OFFER</p><h4>The choice is yours.</h4><div class="paid-summary"><div><span>Zeny spent</span><b>7,200,000</b></div><div><span>Oridecon spent</span><b>32</b></div><div><span>Astral Shards spent</span><b>5</b></div></div><p class="offer-safe">${svg('shield')} Your current affixes are still equipped. This offer survives a reload.</p><p class="price-note">No extra charge to keep the current affixes or use this offer. The paid roll cannot be refunded.</p><div class="quote-alt"><b>Want to try again?</b><p>Keep current &amp; reroll again must show a new quote. Another roll costs the same materials and Zeny.</p><span>Next attempt · 7,200,000 Zeny + materials</span></div></aside></div>`;
    const footer = `<footer class="workbench-footer offer-footer"><div class="footer-warning">${svg('info')}<div><b>Nothing changes until you decide.</b><p>Keeping current does not return the reforge cost.</p></div></div><div class="footer-actions">${button('Keep current')}${button('Use new affixes','primary','check')}</div></footer>`;
    return chrome('offer',body,footer);
  }
  const views = {loadout:loadoutView,affixes:affixView,autosell:autoSellView,cards:cardsView,offer:offerView};
  let view = 'affixes';
  let renderId = 0;
  let nativeStore;
  let nativeLook;
  async function drawNativeHero(id) {
    // Read-only native asset renderer, frozen at idle time 0. No character/save lookup.
    try {
      nativeStore ||= new PGFourthJobs.Store({base:'/assets/wardrobe/fourth/v1/',fetcher:async(url,options)=>{
        // Finish the original local download before handing it to the native
        // streaming reader; the reader still verifies the original size/hash.
        const response=await fetch(url,options);
        return new Response(await response.arrayBuffer(),{status:response.status,headers:response.headers});
      }});
      nativeLook ||= await nativeStore.select('equipment-visual-only',PGWardrobe.defaults('m'),'Rune Knight');
      if(id !== renderId || !$('#nativeHero')) return;
      const source=document.createElement('canvas');source.width=320;source.height=280;
      const ctx=source.getContext('2d');PGWardrobe.draw(ctx,nativeLook,'idle',1,0);
      const rgba=ctx.getImageData(0,0,320,280).data;
      let x0=320,y0=280,x1=0,y1=0;
      for(let y=0;y<280;y++) for(let x=0;x<320;x++) if(rgba[(y*320+x)*4+3]) {x0=Math.min(x0,x);y0=Math.min(y0,y);x1=Math.max(x1,x);y1=Math.max(y1,y);}
      if(x1<x0||y1<y0) throw Error('Native character is blank');
      const canvas=$('#nativeHero'),out=canvas.getContext('2d');out.imageSmoothingEnabled=false;
      // Center the visible native pose, not the transparent source frame. Keep
      // its scale/aspect and align its ground contact to the orbit's center.
      const w=x1-x0+1,h=y1-y0+1,scale=Math.min(2.5,(canvas.width-24)/w,(canvas.height-48)/h);
      const floor=canvas.height-24;
      out.clearRect(0,0,canvas.width,canvas.height);
      out.drawImage(source,x0,y0,w,h,(canvas.width-w*scale)/2,floor-h*scale,w*scale,h*scale);
      canvas.dataset.ready='true';
    } catch(error) {
      const canvas=$('#nativeHero');
      if(canvas) {canvas.dataset.error=error.message;canvas.setAttribute('aria-label','Native character could not load');}
      console.error(error);
    }
  }
  function revealActiveTab() {
    const active=$('.subnav [aria-current="page"]');if(!active)return;
    const nav=active.parentElement,item=active.getBoundingClientRect(),frame=nav.getBoundingClientRect();
    if(item.left<frame.left)nav.scrollLeft-=frame.left-item.left+12;
    else if(item.right>frame.right)nav.scrollLeft+=item.right-frame.right+12;
  }
  function render() {
    const hash=location.hash.slice(1);
    view=Object.hasOwn(views,hash)?hash:'affixes';
    const id=++renderId;
    $('#visual').innerHTML=views[view]();
    $('#stageLabel').textContent=captions[view];
    $('#designNotes').innerHTML=notes[view].map(([heading,copy],i)=>`<article class="design-note"><span>0${i+1}</span><div><b>${heading}</b><p>${copy}</p></div></article>`).join('');
    document.querySelectorAll('.review-tabs a').forEach(a=>{if(a.dataset.view===view)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current');});
    revealActiveTab();
    // Finish the same-document review navigation before starting native downloads.
    if(view==='loadout') requestAnimationFrame(()=>requestAnimationFrame(()=>{
      if(id===renderId) drawNativeHero(id);
    }));
  }
  document.querySelectorAll('[data-device]').forEach(button=>button.addEventListener('click',()=>{
    $('#visual').classList.toggle('phone',button.dataset.device==='phone');
    document.querySelectorAll('[data-device]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));
    revealActiveTab();
  }));
  window.addEventListener('hashchange',render);
  render();
  // Test metadata exposes synthetic visuals only, not gameplay objects or actions.
  window.PGEquipmentVisual={diagnostics:()=>({view,staticOnly:true,affixes:affixes.map(a=>({...a})),rarities:[...rarityNames],rarityColors:RARITY_META.map(r=>r.color),rarityBadges:RARITY_META.map(r=>({name:r.name,code:r.code,color:r.color})),gradeNames:CARD_GRADE_META.map(g=>g.name),cards:cardExamples.map(c=>({name:c.name,family:c.family,grade:CARD_GRADE_META[c.grade].name,gameEffects:[...c.gameEffects],effects:[...c.effects],fit:[...c.fit],boss:c.boss,value:c.value,copies:c.copies})),cardRules:cardRules.map(([title,copy])=>({title,copy})),singleQuote:{zeny:7200000,ore:32,ascMat:5},fullQuote:{zeny:1200000,ore:0,ascMat:0}})};
})();
