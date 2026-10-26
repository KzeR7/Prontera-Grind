/* Interactive design study only: no game imports, API requests or persistent storage. */
'use strict';
(() => {
  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const PATHS = {
    mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 6 9 7 9-7"/>',
    wheel: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="2"/><path d="M12 3v7m2 2h7M12 14v7M3 12h7m-4-6 5 5m2 2 5 5m0-12-5 5m-2 2-5 5"/>',
    gift: '<rect x="3" y="8" width="18" height="4" rx="1"/><path d="M5 12v9h14v-9M12 8v13"/><path d="M12 8S4 8 5 4s7 1 7 4Zm0 0s8 0 7-4-7 1-7 4Z"/>',
    notice: '<path d="m4 10 14-6v16L4 14v-4ZM7 15v5h4l-2-4m12-7v6"/>',
    star: '<path d="m12 2 2.7 6.3 6.8.7-5.1 4.5 1.6 6.7-6-3.5-6 3.5 1.6-6.7L2.5 9l6.8-.7L12 2Z"/>',
    spark: '<path d="m12 3 2.7 6.3L21 12l-6.3 2.7L12 21l-2.7-6.3L3 12l6.3-2.7L12 3Zm7-1v4m-2-2h4"/>',
    search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
    close: '<path d="m6 6 12 12M6 18 18 6"/>',
    check: '<path d="m5 12 4 4L19 6"/>',
    checkCircle: '<circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/>',
    shield: '<path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6l8-3Z"/><path d="m8 11 3 3 5-5"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 6v6l4 2"/>',
    arrow: '<path d="M4 12h16m-6-6 6 6-6 6"/>',
    back: '<path d="M20 12H4m6-6-6 6 6 6"/>',
    pickaxe: '<path d="m4 20 9-9m-7-7c5-1 10 2 14 7l-3 3C15 8 10 5 6 4Zm8 5-9 9 2 2 9-9"/>',
    gem: '<path d="m8 3 8 1 5 8-7 9-9-4-2-8 5-6Z"/><path d="m8 3 1 7 7-6M3 9l6 1-4 7m4-7 5 11 7-9-12-2Z"/>',
    coins: '<ellipse cx="10" cy="7" rx="7" ry="3"/><path d="M3 7v4c0 1.7 3.1 3 7 3s7-1.3 7-3V7M3 11v4c0 1.7 3.1 3 7 3m7-8c2.5.4 4 1.4 4 2.8 0 1.7-3.1 3-7 3m7-3v4c0 1.7-3.1 3-7 3-1.5 0-3-.2-4-.6"/>',
    exp: '<path d="m13 2-9 12h7l-1 8 10-13h-7l1-7Z"/>',
    pouch: '<path d="m8 3 2 5h4l2-5H8Zm2 5C6 11 3 14 5 18c2 4 12 4 14 0 2-4-1-7-5-10M8 8h8"/><path d="M10 12h4l-4 5h4"/>',
    card: '<rect x="5" y="3" width="14" height="18" rx="2" transform="rotate(9 12 12)"/><path d="m12 8 3 4-3 4-3-4 3-4Z"/>',
    scroll: '<path d="M7 4h12a2 2 0 0 1 2 2v3h-5V6a2 2 0 0 1 3-1M7 4a3 3 0 0 0-3 3v11m0 0H2v1a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V9M4 18h8v1a2 2 0 0 0 2 2"/><path d="m8 10 2 3 3-3"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-10v.2"/>',
    lock: '<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3m-4 5v2"/>',
    eye: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
    user: '<circle cx="12" cy="7" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2"/>',
    users: '<circle cx="9" cy="7" r="3"/><path d="M3 20v-2a6 6 0 0 1 12 0v2m1-16a3 3 0 0 1 0 6m2 4a5 5 0 0 1 3 5v1"/>',
    send: '<path d="m22 2-7 20-4-9-9-4L22 2ZM11 13 22 2"/>',
    bag: '<rect x="5" y="7" width="14" height="14" rx="3"/><path d="M9 7V5a3 3 0 0 1 6 0v2M5 12h14m-7-2v5"/>',
    sword: '<path d="m4 20 5-5m-3-3 6 6m-4-4L18 3l3 0 0 3-11 10M3 17l4 4"/>',
    paw: '<ellipse cx="12" cy="16" rx="6" ry="4"/><ellipse cx="5" cy="9" rx="2" ry="3"/><ellipse cx="10" cy="6" rx="2" ry="3"/><ellipse cx="16" cy="7" rx="2" ry="3"/><ellipse cx="20" cy="12" rx="2" ry="3"/>',
    map: '<path d="m3 5 6-2 6 3 6-2v16l-6 2-6-3-6 2V5Zm6-2v16m6-13v16"/>',
    refresh: '<path d="M20 7v5h-5M4 17v-5h5"/><path d="M5 8a8 8 0 0 1 14-3l1 7M4 12l1 7a8 8 0 0 0 14-3"/>',
    heart: '<path d="M20 5c-3-3-7-1-8 2-1-3-5-5-8-2s0 8 8 15c8-7 11-12 8-15Z"/>'
  };
  const icon = (name, cls = '') => `<svg class="ico ${cls}" viewBox="0 0 24 24" aria-hidden="true">${PATHS[name] || PATHS.spark}</svg>`;

  // Same seven rewards, amounts, rates and durations as DAILY_WHEEL_SEGMENTS in index.html.
  // The browser check pins this copied presentation fixture to the real game's source.
  const REWARDS = [
    { id:'ori', resource:'ori', amount:15, rate:33, title:'Oridecon ×15', desc:'Weapon refinement ore.', short:'ORIDECON', badge:'×15', icon:'pickaxe', color:'#d6ae7c', fill:'#362b23' },
    { id:'elu', resource:'elu', amount:15, rate:33, title:'Elunium ×15', desc:'Armor refinement ore.', short:'ELUNIUM', badge:'×15', icon:'gem', color:'#a4bed9', fill:'#233344' },
    { id:'buff_zeny', buff:'zeny', durationMin:30, pct:30, rate:11, title:'+30% Zeny gain', desc:'Monster Zeny gain boosted for 30 minutes.', short:'ZENY BOOST', badge:'+30%', icon:'coins', color:'#d9c58b', fill:'#33311f' },
    { id:'buff_exp', buff:'exp', durationMin:30, pct:30, rate:11, title:'+30% Base & Job EXP', desc:'Base and Job EXP boosted for 30 minutes.', short:'EXP BOOST', badge:'+30%', icon:'exp', color:'#95c5af', fill:'#1e3631' },
    { id:'zeny_pouch', zeny:500000, rate:7, title:'Zeny pouch · 500,000 Zeny', desc:'Added instantly to your Zeny balance.', short:'ZENY POUCH', badge:'500K', icon:'pouch', color:'#bfacd5', fill:'#2e293e' },
    { id:'random_card', randomCard:true, amount:1, rate:4, title:'Random Monster Card ×1', desc:'Excludes boss and Nightmare cards.', short:'MONSTER CARD', badge:'×1', icon:'card', color:'#d0a2b9', fill:'#382838' },
    { id:'refineScrolls', resource:'refineScrolls', amount:1, rate:1, title:'Refine Protection Scroll ×1', desc:'Prevents refinement loss at +5–+10.', short:'REFINE SCROLL', badge:'×1', icon:'scroll', color:'#e1c085', fill:'#3f3221' }
  ];
  const GIFT_CHOICES = {
    none: { label:'No attachment', icon:'mail', detail:'Announcement only' },
    ori: { label:'Oridecon', icon:'pickaxe', detail:'Weapon refinement material' },
    elu: { label:'Elunium', icon:'gem', detail:'Armor refinement material' },
    shards: { label:'Echo Shards', icon:'gem', detail:'Echo Shard Store currency' },
    nmat0: { label:'Void Core', icon:'gem', detail:'Nightmare material' },
    refineScrolls: { label:'Refine Protection Scroll', icon:'scroll', detail:'Refinement protection' },
    mythicScrolls: { label:'Mythic Protection Scroll', icon:'scroll', detail:'Mythic refinement protection' },
    ascMat0: { label:'Astral Shard', icon:'gem', detail:'Ascension material' },
    ascMat1: { label:'Primal Catalyst', icon:'gem', detail:'Ascension material' },
    ascMat2: { label:"Valkyrie's Sigil", icon:'gem', detail:'Mythic material' },
    zeny: { label:'Zeny', icon:'coins', detail:'Added to your Zeny balance' }
  };
  const EFFECT_DEFS = {
    warcry: { name:'War Cry', source:'Pet skill', desc:'Player ATK +15%. Does not stack with another pet or run alongside a MATK buff.', asset:'/assets/skill-icons/extra/pet_warcry.png', max:30000, group:'pet', color:'#c5b5df' },
    vital: { name:'Vital Aura', source:'Pet skill', desc:'Player Max HP +15%. Does not stack with another pet’s Vital Aura.', asset:'/assets/skill-icons/extra/pet_vital.png', max:30000, group:'pet', color:'#c5b5df' },
    'daily-zeny': { name:'+30% Zeny gain', source:'Daily roulette', desc:'Earn 30% more Zeny from monsters. Activates automatically when won.', icon:'coins', max:1800000, group:'daily', color:'#d6b77e' },
    'daily-exp': { name:'+30% Base & Job EXP', source:'Daily roulette', desc:'Earn 30% more Base and Job EXP from monsters. Activates automatically when won.', icon:'exp', max:1800000, group:'daily', color:'#94c6ac' }
  };
  const VIEWS = ['mail','roulette','buffs','gm'];
  const VIEW_LABELS = {mail:'PLAYER VIEW · MAIL & ANNOUNCEMENTS', roulette:'PLAYER VIEW · DAILY REWARD ROULETTE', buffs:'HUD PLACEMENT · PET & ROULETTE EFFECTS', gm:'GM-ONLY VIEW · ANNOUNCEMENT STUDIO'};
  const NOTES = {
    mail: [
      ['Scan first. Read comfortably.', 'A compact message list and a dedicated reading pane replace the long, crowded feed.'],
      ['Rewards never get buried.', 'An unclaimed-gifts filter, clear claim states and a separate “Claim all” action.'],
      ['Player mail stays player mail.', 'GM composing moves to its own workspace. On phones, tap a message to read it.']
    ],
    roulette: [
      ['A proper moment for the wheel.', 'A wider desktop panel and an approximately 400px wheel, up from the current 254px.'],
      ['Every description. Every chance.', 'Seven full-width rows, wrapping text and a dedicated percentage column. No ellipses.'],
      ['Only what belongs here.', 'No reserves or active-buff section. A demo spin shows an EXP win; the real odds stay unchanged.']
    ],
    buffs: [
      ['Just the icons. No frame.', 'Pet buffs and roulette boosts float together like the current HUD. No panel, heading or tile backgrounds.'],
      ['A lighter hover popup.', 'A 65%-opaque background lets the field show through. Text stays clear; hover, focus or tap to read.'],
      ['No buffs means nothing visible.', 'No empty-state box, label or placeholder. When the last effect expires, every buff element disappears.']
    ],
    gm: [
      ['A calmer, dedicated workspace.', 'Choose the audience, write the message, then attach an optional reward. Never inside the inbox.'],
      ['See exactly what players will get.', 'The live preview shares the player’s letter layout, including the enclosed reward.'],
      ['A deliberate send, not an accident.', 'Review recipients and gift quantity before confirming. This demo cannot contact real players.']
    ]
  };

  function messagesFixture() {
    return [
      {id:'maintenance',kind:'notice',from:'Horizon Haven team',when:'Today',date:'26 OCT 2026 · 10:30',read:true,body:'A thank-you from the team\n\nHello, adventurer,\n\nToday’s maintenance is complete, and the fields are open again. Thank you for your patience while we looked after the world.\n\nWe’ve enclosed a little something for your next refinement. See you in Prontera!\n\n— The Horizon Haven team',gift:{key:'ori',amount:20,claimed:false}},
      {id:'event-gift',kind:'event',from:'Horizon Haven team',when:'Today',date:'26 OCT 2026 · 09:00',read:false,body:'A gift for your next adventure\n\nA little preparation goes a long way.\n\nTake these refinement materials into your next adventure. Claim them below whenever you’re ready.\n\nHappy hunting,\nThe Horizon Haven team',gift:{key:'elu',amount:15,claimed:false}},
      {id:'daily-notice',kind:'notice',from:'Horizon Haven team',when:'Yesterday',date:'25 OCT 2026 · 18:00',read:false,body:'Your daily dose of good fortune\n\nYour free Daily Roulette spin resets at 00:00 UTC+8. There are seven possible rewards, and the exact chances are always listed beside the wheel.\n\nIf you win an EXP or Zeny boost, it activates automatically for 30 minutes. Find its timer alongside your pet buffs.',gift:null},
      {id:'field-event',kind:'event',from:'Horizon Haven team',when:'25 Oct',date:'25 OCT 2026 · 10:00',read:false,body:'The fields are calling\n\nReady for another adventure?\n\nChoose a destination from the World Atlas, check your equipment and bring your pets along. Your next favourite drop might be just around the corner.\n\nSee you in the fields!',gift:null},
      {id:'older-gift',kind:'notice',from:'Horizon Haven team',when:'24 Oct',date:'24 OCT 2026 · 12:00',read:true,body:'Your reward has arrived\n\nThanks for being part of Horizon Haven. This gift has already been claimed.\n\nClaimed rewards remain in your mail history, so you always know where they came from.',gift:{key:'zeny',amount:50000,claimed:true}},
      {id:'welcome',kind:'welcome',from:'Horizon Haven team',when:'23 Oct',date:'23 OCT 2026 · 08:00',read:true,body:'Welcome to Horizon Haven\n\nEvery great adventure starts somewhere.\n\nOfficial notices, event updates and GM gifts arrive here. Use the filters to find a notice or an unclaimed reward, then open the message to see the details.\n\nMake yourself at home, adventurer.',gift:null}
    ];
  }
  function sampleEffects(scenario = 'all') {
    if (scenario === 'empty') return [];
    if (scenario === 'expiring') return [{id:'warcry',remaining:4000},{id:'vital',remaining:8000},{id:'daily-zeny',remaining:18000},{id:'daily-exp',remaining:24000}];
    return [{id:'warcry',remaining:22000},{id:'vital',remaining:18000},{id:'daily-zeny',remaining:1626000},{id:'daily-exp',remaining:1092000}];
  }
  const defaultDraft = () => ({audience:'all',recipient:'',kind:'notice',headline:'A thank-you from the team',body:'Hello, adventurer,\n\nToday’s maintenance is complete, and the fields are open again. Thank you for your patience!\n\nWe’ve enclosed a little something for your next refinement.\n\n— The Horizon Haven team',gift:'ori',amount:20});
  function freshState() {
    return {view:'mail',device:'desktop',filter:'all',query:'',selected:'maintenance',mobileDetail:false,messages:messagesFixture(),spin:'ready',angle:0,effects:sampleEffects(),scenario:'all',paused:true,openEffect:null,pinnedEffect:null,draft:defaultDraft(),sent:0};
  }
  let state = freshState(), spinTimer = null, toastTimer = null, pendingDraft = null;
  let lastTick = performance.now();
  const mailTitle = m => m.body.split('\n')[0];
  const mailCopy = m => m.body.slice(m.body.indexOf('\n') + 1).trim();
  const unclaimed = () => state.messages.filter(m => m.gift && !m.gift.claimed).length;
  const unread = () => state.messages.filter(m => !m.read).length;
  const kindName = kind => ({notice:'Official notice',event:'Event notice',welcome:'Welcome'}[kind] || 'Official notice');
  const kindIcon = kind => ({notice:'notice',event:'star',welcome:'spark'}[kind] || 'notice');
  const giftName = gift => gift.key === 'zeny' ? `${Number(gift.amount).toLocaleString()} Zeny` : `${GIFT_CHOICES[gift.key].label} ×${Number(gift.amount).toLocaleString()}`;
  function filteredMessages() {
    const q = state.query.trim().toLocaleLowerCase();
    return state.messages.filter(m => (state.filter !== 'notices' || !m.gift) && (state.filter !== 'rewards' || (m.gift && !m.gift.claimed)) && (!q || `${m.body} ${m.from}`.toLocaleLowerCase().includes(q)));
  }
  function selectedMessage() {
    const rows = filteredMessages();
    if (!rows.some(m => m.id === state.selected)) state.selected = rows[0]?.id || null;
    return rows.find(m => m.id === state.selected) || null;
  }
  function windowHead({iconName,eyebrow,title,subtitle,extra='',close=true}) {
    return `<header class="window-head"><span class="window-emblem">${icon(iconName)}</span><div><p class="eyebrow">${eyebrow}</p><h2>${title}</h2><p class="window-subtitle">${subtitle}</p></div><div class="window-trailing">${extra}${close?`<button type="button" class="icon-button" data-view="buffs" aria-label="Close panel and view the field">${icon('close')}</button>`:''}</div></header>`;
  }
  function attachmentMarkup(gift, preview = false) {
    const choice = GIFT_CHOICES[gift.key];
    return `<div class="attachment-block"><p class="section-label">${icon('gift')} ENCLOSED REWARD</p><div class="attachment${gift.claimed?' is-claimed':''}"><span class="attachment-icon">${icon(choice.icon)}</span><div class="attachment-copy"><b>${esc(giftName(gift))}</b><small>${esc(choice.detail)}</small></div><span class="attachment-state">${gift.claimed?'✓ Claimed':'Ready to claim'}</span></div>${preview?'<span class="draft-button">Claim reward →</span>':''}</div>`;
  }
  function listMarkup() {
    const rows = filteredMessages();
    if (!rows.length) return `<div class="empty-state">${icon(state.filter==='rewards'?'gift':'search')}<h3>${state.query?'No matching messages':state.filter==='rewards'?'All gifts claimed':'Nothing here yet'}</h3><p>${state.query?'Try another word or clear your search.':'New messages will appear here.'}</p><button type="button" class="link-button" data-action="clear-filter">Show all mail ${icon('arrow')}</button></div>`;
    return rows.map(m => `<button type="button" class="mail-item${state.selected===m.id?' selected':''}" data-message="${esc(m.id)}" aria-pressed="${state.selected===m.id}" aria-label="${esc(mailTitle(m))}${!m.read?', unread':''}${m.gift&&!m.gift.claimed?', gift ready to claim':''}"><span class="item-meta"><span class="kind ${esc(m.kind)}">${icon(kindIcon(m.kind))}${esc(m.kind.toUpperCase())}</span><span>${esc(m.when)}</span></span><span class="item-title">${!m.read?'<i class="unread-dot" aria-hidden="true"></i>':''}${esc(mailTitle(m))}</span><span class="item-preview">${esc(mailCopy(m).replaceAll('\n',' '))}</span>${m.gift?`<span class="item-gift${m.gift.claimed?' claimed':''}">${icon(m.gift.claimed?'check':'gift')}${m.gift.claimed?'Reward claimed':esc(giftName(m.gift))}</span>`:''}</button>`).join('');
  }
  function readerMarkup(m) {
    if (!m) return `<div class="empty-state">${icon('mail')}<h3>A little room to breathe.</h3><p>Select a message to read it here.</p></div>`;
    return `<button type="button" class="link-button mobile-back" data-action="mail-back">${icon('back')} Back to inbox</button><div class="reader-topline"><span class="kind-label">${icon(kindIcon(m.kind))}${esc(kindName(m.kind).toUpperCase())}</span><time>${esc(m.date)}</time></div><h3 id="letterTitle" tabindex="-1">${esc(mailTitle(m))}</h3><div class="letter-sender"><span class="sender-seal" aria-hidden="true">H</span><span>${esc(m.from)}</span>${icon('shield')}<span class="sender-to">To: You</span></div><div class="letter-rule"></div><p class="letter-copy">${esc(mailCopy(m))}</p>${m.gift?attachmentMarkup(m.gift):''}<footer class="letter-actions">${m.gift?`<span class="delivery-hint${m.gift.claimed?' success':''}">${icon(m.gift.claimed?'checkCircle':'bag')}${m.gift.claimed?'Reward claimed in this demo.':'Rewards go straight to your inventory.'}</span>${m.gift.claimed?'<span class="pill green" tabindex="-1" id="claimDone">✓ Reward claimed</span>':`<button type="button" class="button primary" data-claim="${esc(m.id)}">Claim reward ${icon('arrow')}</button>`}`:`<span class="delivery-hint">${icon('checkCircle')}${m.read?'Message read':'Open this message to mark it read'}</span><span class="pill">No attachment</span>`}</footer>`;
  }
  function mailMarkup() {
    const m = selectedMessage();
    return `<section class="game-window mail-window${state.mobileDetail?' is-detail':''}">
      ${windowHead({iconName:'mail',eyebrow:'THE ROYAL POST',title:'Mail & announcements',subtitle:'Notes from the world. Gifts for your journey.',extra:`<span class="pill" id="mailUnreadCount"><i class="dot"></i>${unread()} unread</span>`})}
      <div class="mail-toolbar"><div class="mail-filters" role="group" aria-label="Filter mail"><button data-filter="all" aria-pressed="${state.filter==='all'}">All mail <span id="count-all">${state.messages.length}</span></button><button data-filter="notices" aria-pressed="${state.filter==='notices'}">Notices <span id="count-notices">${state.messages.filter(m=>!m.gift).length}</span></button><button data-filter="rewards" aria-pressed="${state.filter==='rewards'}">Rewards <span id="count-rewards">${unclaimed()}</span></button></div><div class="mail-tools"><button type="button" class="link-button" data-action="read-all" ${unread()?'':'disabled'}>${icon('check')} Mark all read</button><button type="button" class="button primary small" data-action="claim-all" ${unclaimed()?'':'disabled'}>${icon('gift')}<span>Claim all · ${unclaimed()}</span></button></div></div>
      <div class="mail-layout"><aside class="mail-list-panel" aria-label="Message list"><label class="mail-search">${icon('search')}<input type="search" id="mailSearch" placeholder="Find a message…" aria-label="Search mail" value="${esc(state.query)}"></label><div class="list-eyebrow">RECENT DISPATCHES</div><div class="mail-list" id="mailList">${listMarkup()}</div><div class="mail-list-footer">${icon('lock')} Official mail from Horizon Haven</div></aside><article class="mail-reader" id="mailReader" aria-label="Selected message">${readerMarkup(m)}</article></div>
    </section>`;
  }
  function refreshMail(focusId) {
    if (state.view !== 'mail') return;
    const m = selectedMessage();
    $('mailList').innerHTML = listMarkup();
    $('mailReader').innerHTML = readerMarkup(m);
    $('count-all').textContent = state.messages.length;
    $('count-notices').textContent = state.messages.filter(m=>!m.gift).length;
    $('count-rewards').textContent = unclaimed();
    $('mailUnreadCount').innerHTML = `<i class="dot"></i>${unread()} unread`;
    document.querySelector('[data-action="read-all"]').disabled = !unread();
    const claimAll = document.querySelector('[data-action="claim-all"]');
    claimAll.disabled = !unclaimed();
    claimAll.querySelector('span').textContent = `Claim all · ${unclaimed()}`;
    document.querySelectorAll('[data-filter]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.filter === state.filter)));
    document.querySelector('.mail-window').classList.toggle('is-detail', state.mobileDetail);
    if (focusId) $(focusId)?.focus({preventScroll:true});
  }
  function claimMessage(m) {
    if (!m?.gift || m.gift.claimed) return false;
    m.gift.claimed = true;
    m.read = true;
    return true;
  }

  function wheelMarkup() {
    const point = (r, a) => [220 + r * Math.cos(a*Math.PI/180), 220 + r * Math.sin(a*Math.PI/180)];
    const coords = p => p.map(v=>v.toFixed(3)).join(' ');
    const count = REWARDS.length, step = 360/count;
    const slices = REWARDS.map((reward,i) => {
      const center = -90 + i*step;
      const a = point(182,center-step/2), b = point(182,center+step/2), label = point(127,center);
      return `<g class="wheel-slice" data-wheel-slice="${reward.id}"><path d="M220 220 L${coords(a)} A182 182 0 0 1 ${coords(b)}Z" fill="${reward.fill}" stroke="#b79c6540" stroke-width="1"/><g transform="translate(${coords(label)})" fill="${reward.color}"><svg x="-15" y="-29" width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="${reward.color}" stroke-width="1.35" stroke-linecap="round" stroke-linejoin="round">${PATHS[reward.icon]}</svg><text class="wheel-amount" text-anchor="middle" y="20">${reward.badge}</text><text class="wheel-name" text-anchor="middle" y="36">${reward.short}</text></g></g>`;
    }).join('');
    const dots = Array.from({length:42},(_,i) => { const p = point(196,i*360/42); return `<circle cx="${p[0]}" cy="${p[1]}" r="${i%3===0?2.3:1}" fill="${i%3===0?'#dec48d':'#8b7953'}"/>`; }).join('');
    return `<svg class="wheel-svg" viewBox="0 0 440 440" role="img" aria-label="Seven-reward daily wheel. Equal visual slices; actual chances are listed beside the wheel."><defs><linearGradient id="rimGold" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#f0dfb1"/><stop offset=".45" stop-color="#a18551"/><stop offset="1" stop-color="#dfbe7e"/></linearGradient><radialGradient id="hubShade"><stop stop-color="#28343c"/><stop offset="1" stop-color="#14212c"/></radialGradient></defs><circle cx="220" cy="220" r="211" fill="none" stroke="#d6b77e16"/><circle cx="220" cy="220" r="204" fill="#0c151d" stroke="url(#rimGold)" stroke-width="2"/><circle cx="220" cy="220" r="187" fill="none" stroke="#d6b77e55"/>${dots}<g id="wheelRotor" class="wheel-rotor" style="transform:rotate(${state.angle}deg)">${slices}<circle cx="220" cy="220" r="172" fill="none" stroke="#d6b77e25" stroke-dasharray="1 5"/></g><circle cx="220" cy="220" r="58" fill="#0c151d" stroke="#d6b77e55" stroke-width="2"/><circle cx="220" cy="220" r="51" fill="url(#hubShade)" stroke="url(#rimGold)" stroke-width="1.5"/><circle cx="220" cy="220" r="43" fill="none" stroke="#d6b77e1c"/><path d="m220 178 4 5-4 5-4-5Z" fill="#d6b77e"/><text x="220" y="225" text-anchor="middle" fill="#e7d5ae" class="wheel-wordmark">H H</text><text x="220" y="244" text-anchor="middle" fill="#a89470" class="wheel-hub-copy">GOOD FORTUNE</text><path d="m220 44-12-28h24Z" fill="url(#rimGold)" stroke="#f4deb0" stroke-width="1"/><path d="m220 37-6-16h12Z" fill="#5c4727"/><circle cx="220" cy="12" r="4" fill="#eddaaa"/></svg>`;
  }
  function resetCountdown() {
    const shifted = Date.now() + 8*3600000;
    const ms = Math.floor(shifted/86400000+1)*86400000 - shifted;
    return `${Math.floor(ms/3600000)}h ${String(Math.floor(ms%3600000/60000)).padStart(2,'0')}m`;
  }
  function rouletteMarkup() {
    const ready = state.spin==='ready', done = state.spin==='done';
    return `<section class="game-window roulette-window">
      ${windowHead({iconName:'wheel',eyebrow:'A LITTLE LUCK, EVERY DAY',title:'Daily roulette',subtitle:'One free spin. Something worth coming back for.',extra:`<div class="reset-clock">${icon('clock')}<div><small>NEXT RESET · 00:00 UTC+8</small><b data-reset-clock>${resetCountdown()}</b></div></div>`})}
      <div class="roulette-content"><div class="wheel-column"><div class="available-label"><i></i>${ready?'1 FREE SPIN AVAILABLE':done?'TODAY’S DEMO REWARD CLAIMED':'A LITTLE GOOD FORTUNE…'}</div><div class="wheel-stage">${wheelMarkup()}</div><div class="wheel-under"><div id="spinStatus" role="status" aria-live="polite">${done?'<div class="spin-result"><small>DEMO RESULT · BOOST ACTIVATED</small><b>+30% Base &amp; Job EXP</b><span>30 minutes · find the timer with your pet buffs.</span></div>':''}</div><button type="button" class="button primary" id="spinButton" data-action="spin" ${ready?'':'disabled'}><span>${ready?'Spin for free':done?'Spun today · come back tomorrow':'Spinning…'}</span>${icon(ready?'arrow':done?'check':'wheel')}</button><p class="wheel-helper">${ready?'Free, once a day. No tickets needed.':'Resets daily at 00:00 UTC+8.'}<br><span>Next reset in <span data-reset-clock>${resetCountdown()}</span> · 00:00 UTC+8</span></p><p class="wheel-disclaimer">Equal visual slices. Exact chances are listed in the reward pool.</p></div></div>
      <div class="reward-column"><header class="reward-heading"><div><h3>Every reward, every chance.</h3><p>Seven possibilities. One is yours.</p></div><span class="odds-total">TOTAL<strong>100%</strong></span></header><div class="reward-list">${REWARDS.map(r=>`<div class="reward-row${r.id==='refineScrolls'?' legendary':''}${done&&r.id==='buff_exp'?' is-won':''}" data-reward="${r.id}" data-rate="${r.rate}" style="--reward-color:${r.color}"><span class="reward-icon">${icon(r.icon)}</span><div class="reward-copy"><b>${esc(r.title)}</b><small>${esc(r.desc)}</small>${r.id==='refineScrolls'?'<em>RARE FIND</em>':''}</div><div class="reward-rate"><b>${r.rate}<span>%</span></b><small>CHANCE</small></div></div>`).join('')}</div><p class="reward-footer">${icon('info')}Rewards are delivered immediately. Boosts activate when won.<br>Existing rewards and drop rates are unchanged.</p></div></div>
    </section>`;
  }
  function spin() {
    if (state.spin !== 'ready') return;
    const previous = state.angle;
    state.spin = 'spinning';
    const target = previous + 360*4 + (360 - 3*360/7);
    renderView();
    // Start with the old transform, then animate to the fixed demo EXP segment.
    requestAnimationFrame(() => requestAnimationFrame(() => {
      if ($('wheelRotor')) $('wheelRotor').style.transform = `rotate(${target}deg)`;
    }));
    state.angle = target;
    spinTimer = setTimeout(() => {
      spinTimer = null;
      state.spin = 'done';
      const exp = state.effects.find(e=>e.id==='daily-exp');
      if (exp) exp.remaining = EFFECT_DEFS['daily-exp'].max;
      else state.effects.push({id:'daily-exp',remaining:EFFECT_DEFS['daily-exp'].max});
      state.openEffect = null;
      state.pinnedEffect = null;
      state.scenario = 'all';
      if (state.view==='roulette' || state.view==='buffs') renderView();
      showToast('Demo: EXP boost activated for 30 minutes.', 'See active buffs', 'buffs');
    }, matchMedia('(prefers-reduced-motion: reduce)').matches ? 100 : 2650);
  }

  function effectTime(effect) {
    const sec = Math.max(0, Math.ceil(effect.remaining/1000));
    return EFFECT_DEFS[effect.id].group==='pet' ? `${String(sec).padStart(2,'0')}s` : `${String(Math.floor(sec/60)).padStart(2,'0')}:${String(sec%60).padStart(2,'0')}`;
  }
  function effectMarkup(effect) {
    const def = EFFECT_DEFS[effect.id], open = state.openEffect === effect.id;
    return `<button type="button" class="effect-button${effect.remaining<=10000?' expiring':''}" data-effect="${effect.id}" aria-label="${esc(def.name)} · ${esc(def.source)}; show details" aria-expanded="${open}" aria-controls="effectTooltip"${open?' aria-describedby="effectTooltip"':''}><span class="effect-tile ${def.group}${effect.id==='daily-exp'?' daily-exp':''}">${def.asset?`<img src="${def.asset}" alt="" width="38" height="38">`:icon(def.icon)}</span><span class="effect-time">${effectTime(effect)}</span></button>`;
  }
  function tooltipMarkup() {
    const effect = state.effects.find(e=>e.id===state.openEffect);
    if (!effect) return '';
    const def = EFFECT_DEFS[effect.id];
    return `<div class="tooltip-origin">${esc(def.source.toUpperCase())}</div><h3>${esc(def.name)}</h3><p>${esc(def.desc)}</p><div class="tooltip-time"><span>Time remaining${state.paused?' · preview paused':''}</span><b id="tooltipTimer">${effectTime(effect)}</b></div>`;
  }
  function effectsMarkup() {
    return `<div class="effects-anchor" id="effectsAnchor" ${state.effects.length?'':'hidden'}><div class="effect-tooltip" id="effectTooltip" role="tooltip" ${state.openEffect&&state.effects.some(e=>e.id===state.openEffect)?'':'hidden'}>${tooltipMarkup()}</div><section class="effects-tray" id="effectsTray" aria-label="Active pet and daily roulette effects" ${state.effects.length?'':'hidden'}><div class="effects-list">${['pet','daily'].map(group=>`<div class="effect-group" data-effect-group="${group}" role="group" aria-label="${group==='pet'?'Pet buffs':'Daily roulette boosts'}" ${state.effects.some(e=>EFFECT_DEFS[e.id].group===group)?'':'hidden'}>${state.effects.filter(e=>EFFECT_DEFS[e.id].group===group).map(effectMarkup).join('')}</div>`).join('')}</div></section></div>`;
  }
  function buffsMarkup() {
    return `<section class="game-window hud-window">${windowHead({iconName:'spark',eyebrow:'ALL YOUR EFFECTS, TOGETHER',title:'Just the buffs. No frame.',subtitle:'Floating icons like the current HUD, with a lighter hover popup.',extra:'<span class="pill green">HUD PLACEMENT PREVIEW</span>',close:false})}<div class="hud-scene"><div class="mock-player" aria-label="Example player HUD"><span class="mock-portrait">${icon('shield')}</span><div class="mock-player-copy"><b>Adventurer</b><small>Rune Knight · Lv. 150</small><div class="mock-health"></div></div></div><div class="mock-tools"><button type="button" data-view="mail" aria-label="Open proposed mail">${icon('mail')}Mail</button><button type="button" data-view="roulette" aria-label="Open proposed daily roulette">${icon('wheel')}Daily</button><div class="mock-map" aria-hidden="true"><div class="mock-map-art"></div><small>Prontera Field · Stage 1</small></div></div><div class="field-label"><small>BACK TO THE ADVENTURE</small><b>Prontera Field</b><span>Illustrative HUD placement · not a gameplay capture</span></div>${effectsMarkup()}<span class="hud-scene-caption">EXISTING FIELD ARTWORK<br>SHOWN FOR HUD CONTEXT</span><div class="mock-dock" aria-hidden="true"><div class="dock-items">${[['user','Character'],['sword','Equipment'],['bag','Inventory'],['spark','Skills'],['paw','Pets'],['map','Maps']].map(([i,t])=>`<span class="${t==='Pets'?'active':''}">${icon(i)}${t}</span>`).join('')}</div><div class="mock-exp"><span><small>BASE</small><i></i><b>63%</b></span><span><small>JOB</small><i></i><b>38%</b></span></div></div></div><footer class="hud-footnote"><span>${icon('info')}Hover, focus or tap an effect to see its source, bonus and remaining time.</span><span>No buffs → no box, frame or placeholder.</span></footer></section>`;
  }
  function contextMarkup() {
    $('contextActions').hidden = state.view !== 'buffs';
    $('contextActions').innerHTML = state.view==='buffs'?`<span class="context-label">Demo state</span>${[['all','All effects'],['expiring','Expiring soon'],['empty','No buffs']].map(([key,label])=>`<button type="button" data-scenario="${key}" aria-pressed="${state.scenario===key}">${label}</button>`).join('')}<button type="button" class="timer-control" data-action="toggle-timers" ${state.effects.length?'':'disabled'}>${state.paused?'▶ Start demo timers':'Ⅱ Pause demo timers'}</button>`:'';
  }
  function showEffect(id, pin = false) {
    if (!state.effects.some(e=>e.id===id)) id = null;
    state.openEffect = id;
    if (pin) state.pinnedEffect = id;
    const tooltip = $('effectTooltip');
    if (!tooltip) return;
    tooltip.hidden = !id;
    tooltip.innerHTML = tooltipMarkup();
    document.querySelectorAll('[data-effect]').forEach(b=>{
      const open = b.dataset.effect===id;
      b.setAttribute('aria-expanded',String(open));
      if (open) b.setAttribute('aria-describedby','effectTooltip'); else b.removeAttribute('aria-describedby');
    });
  }
  function patchEffects() {
    if (state.view !== 'buffs') return;
    // Keep surviving buttons in place: a ticking timer must not steal keyboard focus.
    document.querySelectorAll('[data-effect]').forEach(button => {
      const effect = state.effects.find(e=>e.id===button.dataset.effect);
      if (!effect) {
        const focused = document.activeElement===button;
        button.remove();
        if (focused) (document.querySelector('[data-effect]') || document.querySelector('[data-scenario="all"]'))?.focus({preventScroll:true});
        return;
      }
      button.querySelector('.effect-time').textContent = effectTime(effect);
      button.classList.toggle('expiring',effect.remaining<=10000);
    });
    document.querySelectorAll('[data-effect-group]').forEach(g=>g.hidden=!g.querySelector('[data-effect]'));
    $('effectsTray').hidden = !state.effects.length;
    $('effectsAnchor').hidden = !state.effects.length;
    const open = state.effects.find(e=>e.id===state.openEffect);
    if (!open) {state.pinnedEffect=null;showEffect(null);} else if ($('tooltipTimer')) $('tooltipTimer').textContent = effectTime(open);
  }

  function draftMessage(draft = state.draft) { return [draft.headline.trim(),draft.body.trim()].filter(Boolean).join('\n\n'); }
  function draftAsMail(draft = state.draft) {
    return {id:'draft',kind:draft.kind,from:'Horizon Haven team',when:'Just now',date:'JUST NOW',read:false,body:draftMessage(draft) || 'Your announcement',gift:draft.gift==='none'?null:{key:draft.gift,amount:Number(draft.amount)||0,claimed:false}};
  }
  function draftPreviewMarkup() {
    const m = draftAsMail();
    return `<div class="draft-card"><article class="mail-reader"><div class="reader-topline"><span class="kind-label">${icon(kindIcon(m.kind))}${esc(kindName(m.kind).toUpperCase())}</span></div><h3>${esc(state.draft.headline.trim() || 'Your announcement headline')}</h3><div class="letter-sender"><span class="sender-seal" aria-hidden="true">H</span><span>${esc(m.from)}</span>${icon('shield')}</div><div class="letter-rule"></div><p class="letter-copy">${esc(state.draft.body.trim() || 'Your message will appear here as you write it.')}</p>${m.gift?attachmentMarkup(m.gift,true):'<span class="pill">Announcement only · no attachment</span>'}</article></div>`;
  }
  function audienceSummary(draft = state.draft) { return draft.audience==='all'?'all players':draft.recipient.trim() || 'a selected player'; }
  function gmMarkup() {
    const d = state.draft;
    return `<section class="game-window gm-window">${windowHead({iconName:'send',eyebrow:'A LITTLE CARE GOES A LONG WAY',title:'Announcement studio',subtitle:'Write clearly. Preview first. Send with confidence.',extra:`<span class="pill">${icon('lock')} GM ONLY</span>`})}<div class="gm-layout"><form id="composerForm" class="composer-form"><fieldset class="composer-step"><legend><span>1</span> Choose your audience</legend><div class="audience-options" role="group" aria-label="Announcement audience"><button type="button" data-audience="all" aria-pressed="${d.audience==='all'}">${icon('users')}Everyone</button><button type="button" data-audience="player" aria-pressed="${d.audience==='player'}">${icon('user')}One player</button></div><label class="field" id="recipientField" ${d.audience==='all'?'hidden':''}><span>Player <small>Demo name only</small></span><input id="gmRecipient" placeholder="Enter a demo player name" maxlength="50" value="${esc(d.recipient)}" ${d.audience==='all'?'disabled':'required'}></label></fieldset>
      <fieldset class="composer-step"><legend><span>2</span> Write your message</legend><div class="form-row"><label class="field"><span>Headline <small>First line of the message</small></span><input id="gmHeadline" value="${esc(d.headline)}" placeholder="Give your message a clear heading" maxlength="140" required></label><label class="field"><span>Type</span><select id="gmKind">${['notice','event','welcome'].map(k=>`<option value="${k}" ${d.kind===k?'selected':''}>${k[0].toUpperCase()+k.slice(1)}</option>`).join('')}</select></label></div><label class="field"><span>Message</span><textarea id="gmBody" rows="5" maxlength="500" required>${esc(d.body)}</textarea></label><div class="message-meta"><span>Plain text. Headline and message are sent together.</span><span id="characterCount">${draftMessage().length} / 500</span></div></fieldset>
      <fieldset class="composer-step"><legend><span>3</span> Attach a reward <span class="optional-text" style="border:0;width:auto;color:var(--faint)">Optional</span></legend><div class="form-row"><label class="field"><span>Reward</span><select id="gmGift">${Object.entries(GIFT_CHOICES).map(([k,v])=>`<option value="${k}" ${d.gift===k?'selected':''}>${esc(v.label)}</option>`).join('')}</select></label><label class="field" id="amountField" ${d.gift==='none'?'hidden':''}><span>Quantity</span><input id="gmAmount" type="number" min="1" max="1000000000" step="1" value="${d.amount}" ${d.gift==='none'?'disabled':'required'}></label></div><p class="composer-note">${icon('info')}One optional attachment per message, as in the current in-game composer.</p></fieldset></form>
      <aside class="gm-preview" aria-label="Player-side announcement preview"><div class="preview-label"><span>${icon('eye')} WHAT THE PLAYER SEES</span><em>● LIVE PREVIEW</em></div><div id="draftPreview">${draftPreviewMarkup()}</div><p class="preview-assurance">${icon('shield')}The same letter layout players see in their inbox.<br>No GM tools appear in player mail.</p><div class="send-panel"><p id="audienceSummary">This announcement goes to <b>${esc(audienceSummary())}</b>.</p><button type="submit" form="composerForm" class="button primary" id="reviewSend">Review announcement ${icon('arrow')}</button><small>Preview only. You’ll confirm the audience and reward next.</small></div></aside></div></section>`;
  }
  function updateDraft() {
    if (state.view !== 'gm') return;
    const d = state.draft;
    d.headline = $('gmHeadline').value;
    d.body = $('gmBody').value;
    d.kind = $('gmKind').value;
    d.gift = $('gmGift').value;
    d.amount = $('gmAmount').value;
    d.recipient = $('gmRecipient').value;
    const count = draftMessage().length;
    $('characterCount').textContent = `${count} / 500`;
    $('characterCount').classList.toggle('invalid',count>500);
    $('gmBody').setCustomValidity(count>500?'Keep the headline and message together under 500 characters.':!d.body.trim()?'Write a message.':'');
    $('gmHeadline').setCustomValidity(!d.headline.trim()?'Add a headline.':'');
    $('gmRecipient').setCustomValidity(d.audience==='player'&&!d.recipient.trim()?'Choose a demo player.':'');
    $('recipientField').hidden = d.audience==='all';
    $('gmRecipient').disabled = d.audience==='all';
    $('gmRecipient').required = d.audience==='player';
    $('amountField').hidden = d.gift==='none';
    $('gmAmount').disabled = d.gift==='none';
    $('gmAmount').required = d.gift!=='none';
    $('draftPreview').innerHTML = draftPreviewMarkup();
    $('audienceSummary').innerHTML = `This announcement goes to <b>${esc(audienceSummary())}</b>.`;
  }
  function reviewSend(event) {
    event.preventDefault();
    updateDraft();
    if (!$('composerForm').reportValidity()) return;
    pendingDraft = structuredClone(state.draft);
    const mail = draftAsMail(pendingDraft);
    $('sendSummary').innerHTML = `<span>Audience</span><strong>${esc(pendingDraft.audience==='all'?'All players':pendingDraft.recipient.trim())}</strong><span style="margin-top:8px">Announcement</span><strong>${esc(pendingDraft.headline.trim())}</strong><span style="margin-top:8px">Attachment per recipient</span><strong>${mail.gift?esc(giftName(mail.gift)):'No attachment'}</strong>`;
    $('sendDialog').returnValue = '';
    $('sendDialog').showModal();
  }
  $('sendDialog').addEventListener('close', () => {
    if ($('sendDialog').returnValue==='send' && pendingDraft) {
      state.sent++;
      state.messages.unshift({...draftAsMail(pendingDraft),id:`demo-announcement-${state.sent}`,date:'JUST NOW · DEMO ONLY'});
      state.selected = `demo-announcement-${state.sent}`;
      state.filter = 'all';
      state.query = '';
      showToast('Demo announcement added to Mail. No players were contacted.', 'Open mail', 'mail');
    }
    pendingDraft = null;
  });

  function showToast(message, actionLabel, view) {
    clearTimeout(toastTimer);
    $('toast').innerHTML = `${esc(message)}${actionLabel?`<button type="button" data-view="${view}">${esc(actionLabel)} →</button>`:''}`;
    $('toast').hidden = false;
    toastTimer = setTimeout(() => {$('toast').hidden=true;},6000);
  }
  function renderView() {
    document.querySelectorAll('.view-tabs [data-view]').forEach(b=>{
      const on = b.dataset.view===state.view;
      b.setAttribute('aria-selected',String(on)); b.tabIndex = on?0:-1;
    });
    $('screen').setAttribute('aria-labelledby',`tab-${state.view}`);
    $('stageLabel').textContent = VIEW_LABELS[state.view];
    $('previewStage').classList.toggle('is-phone',state.device==='phone');
    document.querySelectorAll('[data-device]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.device===state.device)));
    $('screen').innerHTML = ({mail:mailMarkup,roulette:rouletteMarkup,buffs:buffsMarkup,gm:gmMarkup}[state.view])();
    $('designNotes').innerHTML = NOTES[state.view].map(([title,body],i)=>`<div class="design-note"><span>0${i+1}</span><div><h3>${title}</h3><p>${body}</p></div></div>`).join('');
    contextMarkup();
    if (state.view==='gm') updateDraft();
  }
  function changeView(view, focus = false) {
    if (!VIEWS.includes(view)) return;
    state.view = view;
    state.openEffect = null;
    state.pinnedEffect = null;
    state.mobileDetail = false;
    history.replaceState(null,'',`#${view}`);
    $('toast').hidden = true;
    renderView();
    if (focus) $('screen').focus({preventScroll:true});
  }
  function resetDemo() {
    clearTimeout(spinTimer);
    clearTimeout(toastTimer);
    pendingDraft = null;
    const {view,device} = state;
    state = freshState(); state.view = view; state.device = device;
    lastTick = performance.now();
    $('toast').hidden = true;
    renderView();
  }
  $('resetDemo').addEventListener('click', resetDemo);
  document.addEventListener('click', event => {
    const button = event.target.closest('button');
    if (!button || button.disabled) return;
    if (button.dataset.view) return changeView(button.dataset.view,!button.closest('.view-tabs'));
    if (button.dataset.device) {state.device=button.dataset.device;renderView();return;}
    if (button.dataset.filter) {state.filter=button.dataset.filter;state.mobileDetail=false;refreshMail();return;}
    if (button.dataset.message) {
      state.selected=button.dataset.message;
      state.messages.find(m=>m.id===state.selected).read=true;
      state.mobileDetail=true;
      refreshMail('letterTitle');
      return;
    }
    if (button.dataset.claim) {
      const m = state.messages.find(m=>m.id===button.dataset.claim);
      if (claimMessage(m)) {refreshMail('claimDone');showToast(`Demo reward claimed: ${giftName(m.gift)}.`);}
      return;
    }
    if (button.dataset.audience) {
      state.draft.audience=button.dataset.audience;
      document.querySelectorAll('[data-audience]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.audience===state.draft.audience)));
      updateDraft();
      if (state.draft.audience==='player') $('gmRecipient').focus();
      return;
    }
    if (button.dataset.scenario) {
      state.scenario=button.dataset.scenario;
      state.effects=sampleEffects(state.scenario);
      state.paused=true; state.openEffect=null; state.pinnedEffect=null;
      renderView();
      return;
    }
    if (button.dataset.effect) {
      const id=button.dataset.effect;
      const next=state.pinnedEffect===id?null:id;
      state.pinnedEffect=next; showEffect(next);
      return;
    }
    switch (button.dataset.action) {
      case 'read-all': state.messages.forEach(m=>m.read=true); refreshMail(); showToast('All demo messages marked as read. Gifts remain available.'); break;
      case 'claim-all': {const count=state.messages.filter(claimMessage).length; refreshMail(); showToast(`${count} demo rewards claimed. Nothing was added to a game account.`); break;}
      case 'clear-filter': state.filter='all'; state.query=''; $('mailSearch').value=''; refreshMail(); break;
      case 'mail-back': state.mobileDetail=false; refreshMail(); document.querySelector(`[data-message="${state.selected}"]`)?.focus({preventScroll:true}); break;
      case 'spin': spin(); break;
      case 'toggle-timers': state.paused=!state.paused; lastTick=performance.now(); contextMarkup(); showEffect(state.openEffect); break;
    }
  });
  document.addEventListener('input', event => {
    if (event.target.id==='mailSearch') {state.query=event.target.value;refreshMail();}
    if (event.target.closest('#composerForm')) updateDraft();
  });
  document.addEventListener('change', event => {
    if (event.target.closest('#composerForm')) updateDraft();
  });
  document.addEventListener('submit', event => {if (event.target.id==='composerForm') reviewSend(event);});
  document.addEventListener('pointerover', event => {
    const button=event.target.closest('[data-effect]');
    if (button && event.pointerType==='mouse' && !state.pinnedEffect && state.openEffect!==button.dataset.effect) showEffect(button.dataset.effect);
  });
  document.addEventListener('pointerout', event => {
    const anchor=event.target.closest('.effects-anchor');
    if (!anchor || event.pointerType!=='mouse' || anchor.contains(event.relatedTarget) || state.pinnedEffect) return;
    const focused=document.activeElement.closest('[data-effect]');
    showEffect(focused?.dataset.effect || null);
  });
  document.addEventListener('focusout', event => {
    const anchor=event.target.closest('.effects-anchor');
    if (!anchor || anchor.contains(event.relatedTarget)) return;
    state.pinnedEffect=null;
    showEffect(anchor.querySelector('[data-effect]:hover')?.dataset.effect || null);
  });
  document.addEventListener('focusin', event => {
    const button=event.target.closest('[data-effect]');
    if (button) showEffect(button.dataset.effect);
  });
  document.addEventListener('pointerdown', event => {
    if (state.view==='buffs' && !event.target.closest('.effects-anchor, .context-actions, .view-tabs')) {state.pinnedEffect=null;showEffect(null);}
  });
  document.addEventListener('keydown', event => {
    if (event.key==='Escape' && !$('sendDialog').open) {
      if (state.view==='buffs') {state.pinnedEffect=null;showEffect(null);}
      else if (state.view==='mail' && state.mobileDetail) {state.mobileDetail=false;refreshMail();}
      return;
    }
    const tab=event.target.closest('.view-tabs [data-view]');
    if (!tab || !['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) return;
    event.preventDefault();
    const current=VIEWS.indexOf(tab.dataset.view);
    const index=event.key==='Home'?0:event.key==='End'?VIEWS.length-1:(current+(event.key==='ArrowRight'?1:-1)+VIEWS.length)%VIEWS.length;
    changeView(VIEWS[index]); $(`tab-${VIEWS[index]}`).focus();
  });
  window.addEventListener('hashchange', () => {const v=location.hash.slice(1);if (VIEWS.includes(v)) changeView(v);});
  setInterval(() => {
    const now=performance.now(), delta=now-lastTick; lastTick=now;
    document.querySelectorAll('[data-reset-clock]').forEach(el=>el.textContent=resetCountdown());
    if (state.paused) return;
    state.effects.forEach(effect=>effect.remaining=Math.max(0,effect.remaining-delta));
    state.effects=state.effects.filter(effect=>effect.remaining>0);
    patchEffects();
    if (!state.effects.length) {state.paused=true;contextMarkup();}
  },1000);

  // Read-only diagnostics for the dedicated browser check. No reference to real S/save/cloud.
  window.PGMailProposal = {
    diagnostics: () => ({view:state.view,filter:state.filter,unread:unread(),unclaimed:unclaimed(),spin:state.spin,sent:state.sent,paused:state.paused,messages:structuredClone(state.messages),effects:structuredClone(state.effects),rewards:structuredClone(REWARDS),draftLength:draftMessage().length})
  };
  const initialView=location.hash.slice(1);
  if (VIEWS.includes(initialView)) state.view=initialView;
  renderView();
})();
