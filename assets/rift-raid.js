/* Player-character Rift Raid client.
 *
 * One request-driven arena: lobby -> ready -> arena -> results. It deliberately does not create a
 * renderer; the boss is the existing Ascension boss art and party portraits reuse the native class
 * preview canvas. Countdowns and telegraphs are drawn locally from the server's fixed timestamps,
 * while the room remains the only authority for damage, downing, victory and rewards.
 */
(function () {
  'use strict';
  const esc = value => (typeof globalThis.esc === 'function' ? globalThis.esc(value) : String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])));
  const num = (n, fallback = 0) => (Number.isFinite(Number(n)) ? Number(n) : fallback);
  const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
  const BOSS_ART = 'assets/mobs/v1/thumb-1639.png';
  const LANES = ['left', 'center', 'right'];
  const LANE_LABEL = { left: 'Left', center: 'Center', right: 'Right' };

  const R = {
    open: false, busy: '', error: '', view: 'lobby', account: null, party: null, eligibility: null,
    activeRun: null, run: null, result: null, rewardRows: [], lane: 'center', targetId: 0,
    pending: new Map(), lastBossHp: 0, lastAutoAt: 0, serverOffset: 0, lastSync: 0,
    timer: null, partyAction: false, codeOpen: false, notice: '', lastResultId: '', settling: false,
    deadlineSettledFor: '', forgeExtra: 0,
  };

  // These mirror assets/rift-progression.js. The fallback keeps the overlay usable in isolation
  // (and in the jsdom UI smoke, which evaluates this file without the field bundle).
  const STAR_MAX = 20;
  const STAR_BOOSTERS = [
    { id: 0, name: 'Standard', extraShards: 0, chance: 0, note: 'No extra shards' },
    { id: 1, name: 'Steady', extraShards: 5, chance: 10, note: '+10% success' },
    { id: 2, name: 'Charged', extraShards: 12, chance: 24, note: '+24% success' },
    { id: 3, name: 'Overload', extraShards: 24, chance: 42, note: '+42% success' },
  ];
  const starsOf = item => clamp(Math.floor(num(item && item.stars)), 0, STAR_MAX);
  const starCost = star => 8 + Math.floor(clamp(num(star), 0, STAR_MAX) / 2) * 2;
  const starChance = star => clamp(92 - clamp(num(star), 0, STAR_MAX) * 3.8, 18, 92);
  function forgeQuote(star, extraId = 0) {
    const s = clamp(Math.floor(num(star)), 0, STAR_MAX);
    const booster = STAR_BOOSTERS.find(b => b.id === clamp(Math.floor(num(extraId)), 0, 3)) || STAR_BOOSTERS[0];
    const maxed = s >= STAR_MAX;
    return {
      star: s, nextStar: Math.min(STAR_MAX, s + 1), maxed, booster,
      baseCost: starCost(s), extraCost: booster.extraShards,
      totalCost: maxed ? 0 : starCost(s) + booster.extraShards,
      baseChance: starChance(s), chance: maxed ? 0 : clamp(starChance(s) + booster.chance, 0, 98),
    };
  }
  function cardName(key) {
    const known = (R.account?.cards || []).find(c => c.key === key);
    if (known) return known.name;
    return String(key || 'Raid card').split('-').map(x => x.charAt(0).toUpperCase() + x.slice(1)).join(' ');
  }

  const $ = id => document.getElementById(id);
  const overlay = () => $('raidOverlay');
  const setText = (id, text) => { const el = $(id); if (el) el.textContent = text; };
  const fmt = n => Math.max(0, Math.round(num(n))).toLocaleString();
  const clock = ms => {
    const s = Math.max(0, Math.ceil(num(ms) / 1000));
    return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
  };
  const serverNow = () => Date.now() + R.serverOffset;
  const pct = (a, b) => clamp((num(a) / Math.max(1, num(b))) * 100, 0, 100);

  async function api(path = '', body = null) {
    const options = body === null
      ? { credentials: 'include', cache: 'no-store' }
      : { method: 'POST', credentials: 'include', cache: 'no-store', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
    const response = await fetch('/api/raid' + path, options);
    const data = await response.json().catch(() => ({ err: 'The raid server returned an unreadable response.' }));
    if (!response.ok && !data.disabled) {
      const error = new Error(data.err || 'Raid request failed.');
      error.status = response.status; error.data = data; throw error;
    }
    return data;
  }

  function installShell() {
    if (overlay()) return;
    document.body.insertAdjacentHTML('beforeend', `
<div id="raidOverlay" hidden role="dialog" aria-modal="true" aria-labelledby="raidTitle">
  <style>
    #raidOverlay{position:fixed;inset:0;z-index:260;display:flex;align-items:stretch;justify-content:center;background:radial-gradient(circle at 50% 0%,#20343a 0,#091113 58%,#040809 100%);color:#f0e8d2;overflow:auto}
    #raidOverlay[hidden]{display:none}
    .raid-shell{width:min(1080px,100%);min-height:100%;padding:14px 14px 22px;display:flex;flex-direction:column;gap:12px}
    .raid-head{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
    .raid-head h2{margin:0;font:700 clamp(18px,4vw,26px)/1.1 Georgia,serif;letter-spacing:.02em;color:#f4dfaa}
    .raid-head .raid-sub{font-size:11px;text-transform:uppercase;letter-spacing:.16em;color:#93b2ae}
    .raid-head .raid-close{margin-left:auto;min-width:44px;min-height:44px;border:1px solid #6d7e6b;background:#132422;color:#f0e8d2;border-radius:9px;font-size:20px;cursor:pointer}
    .raid-tag{font-size:10px;text-transform:uppercase;letter-spacing:.13em;color:#9bb9b3;border:1px solid #34514e;border-radius:99px;padding:4px 8px;background:#0d1c1b}
    .raid-tag.hot{border-color:#9a6c3a;color:#f0c27a;background:#2a1b0c}
    .raid-panel{background:linear-gradient(180deg,#132524,#0d1819);border:1px solid #3d554f;border-radius:14px;padding:14px;box-shadow:0 12px 40px #0008}
    .raid-grid{display:grid;grid-template-columns:minmax(0,1.35fr) minmax(0,1fr);gap:12px}
    @media(max-width:720px){.raid-grid{grid-template-columns:1fr}.raid-shell{padding:9px 9px 18px}.raid-panel{padding:11px}}
    .raid-eyebrow{font-size:10px;text-transform:uppercase;letter-spacing:.16em;color:#8fb0a9;margin-bottom:4px}
    .raid-h{font:700 18px/1.2 Georgia,serif;color:#f4dfaa;margin:0 0 6px}
    .raid-muted{font-size:12px;color:#a9bcb6;line-height:1.5}
    .raid-row{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
    .raid-btn{min-height:44px;padding:9px 14px;border-radius:10px;border:1px solid #5e7468;background:#18302c;color:#f3ecd8;font:600 13px/1.1 system-ui,sans-serif;cursor:pointer}
    .raid-btn:hover{background:#22413a}.raid-btn:disabled{opacity:.45;cursor:not-allowed}
    .raid-btn.primary{background:linear-gradient(180deg,#c49a52,#8b642d);border-color:#e3c07d;color:#1a1306}
    .raid-btn.danger{background:#3d1d1d;border-color:#965454;color:#ffd9d0}
    .raid-btn.ghost{background:transparent;border-color:#3c5954}
    .raid-btn.small{min-height:36px;padding:6px 10px;font-size:12px}
    .raid-input{min-height:42px;padding:8px 10px;border-radius:9px;border:1px solid #426057;background:#081312;color:#f0e8d2;font:13px system-ui}
    .raid-member{display:flex;align-items:center;gap:9px;padding:8px;border:1px solid #2f4944;border-radius:10px;background:#0a1717;margin:6px 0}
    .raid-member canvas{width:42px;height:48px;image-rendering:pixelated;flex:none}
    .raid-member .nm{font-weight:700;font-size:13px}.raid-member .cls{font-size:11px;color:#9eb7b0}
    .raid-member .tags{margin-left:auto;text-align:right;font-size:10px;line-height:1.5;color:#a9bcb6}
    .raid-ready{color:#8de0a8}.raid-notready{color:#eab27d}
    .raid-stats{display:flex;gap:8px;flex-wrap:wrap;margin:8px 0}
    .raid-stat{border:1px solid #314d48;border-radius:9px;padding:7px 10px;background:#0a1817;min-width:92px}
    .raid-stat small{display:block;color:#89a8a1;font-size:9px;text-transform:uppercase;letter-spacing:.11em}
    .raid-stat b{font-size:15px;color:#f4dfaa}
    .raid-error{border:1px solid #8b4747;background:#2a1111;color:#ffd7cc;border-radius:9px;padding:8px 10px;font-size:12px;margin:8px 0}
    .raid-boss{position:relative;border:1px solid #4d5e45;border-radius:12px;overflow:hidden;background:radial-gradient(circle at 50% 35%,#34444b 0,#0b1417 70%);min-height:170px;display:flex;align-items:flex-end}
    .raid-boss img{position:absolute;inset:0;width:100%;height:100%;object-fit:contain;object-position:center 22%;filter:drop-shadow(0 0 16px #000a)}
    .raid-boss .boss-label{position:relative;z-index:1;padding:9px;width:100%;background:linear-gradient(transparent,#06100fdd)}
    .raid-boss.hit img{animation:raidHit .22s linear}
    @keyframes raidHit{0%,100%{transform:translateX(0)}35%{transform:translateX(-5px) scale(1.015)}70%{transform:translateX(4px)}}
    .raid-bar{height:14px;border-radius:8px;background:#2a1919;border:1px solid #6b4b3d;overflow:hidden}
    .raid-bar i{display:block;height:100%;background:linear-gradient(90deg,#b4413e,#e59a4a);transition:width .25s ease}
    .raid-bar.hp i{background:linear-gradient(90deg,#3c9a68,#8de0a8)}
    .raid-bar.ward i{background:linear-gradient(90deg,#3d6fb4,#87c3ff)}
    .raid-phase{display:flex;gap:4px;margin-top:6px}.raid-phase span{height:4px;flex:1;background:#31413b;border-radius:2px}.raid-phase span.on{background:#d1a35f}
    .raid-timer{font:700 30px/1 ui-monospace,monospace;color:#f6e6bc;letter-spacing:.06em}
    .raid-timer.low{color:#ff9c86}
    .raid-lanes{display:grid;grid-template-columns:repeat(3,1fr);gap:7px;margin:8px 0}
    .raid-lane{min-height:78px;border-radius:10px;border:1px solid #3f5d57;background:#0b1b19;color:#e9e0c8;padding:8px;cursor:pointer;position:relative;font:600 12px system-ui;display:flex;flex-direction:column;justify-content:space-between;align-items:center}
    .raid-lane small{font-weight:400;font-size:10px;color:#98b5ae}
    .raid-lane.safe{border-color:#4a7b60}.raid-lane.danger{border-color:#a8493f;background:linear-gradient(180deg,#391b19,#1b0d0d);animation:raidDanger 1.1s ease-in-out infinite}
    .raid-lane.chosen{outline:2px solid #e2bd76;outline-offset:1px}
    .raid-lane .hazard{position:absolute;inset:0;border-radius:9px;background:repeating-linear-gradient(135deg,#a8493f22 0 8px,#a8493f55 8px 16px);pointer-events:none}
    @keyframes raidDanger{50%{box-shadow:inset 0 0 26px #e45b3a55}}
    .raid-party{display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:8px}
    .raid-pcard{border:1px solid #35504b;border-radius:11px;background:#0a1717;padding:8px}
    .raid-pcard.down{border-color:#9d4a44;background:#1d0c0c}
    .raid-pcard.you{box-shadow:inset 0 0 0 1px #d5b06e}
    .raid-pcard .phead{display:flex;align-items:center;gap:7px;margin-bottom:6px}
    .raid-pcard canvas{width:38px;height:44px;image-rendering:pixelated}
    .raid-pcard .pname{font:700 12px system-ui}.raid-pcard .pmeta{font-size:10px;color:#9cb6af}
    .raid-pcard .pbar{height:11px;border-radius:6px;background:#271717;overflow:hidden;border:1px solid #5d403c;margin:4px 0}
    .raid-pcard .pbar i{display:block;height:100%;background:linear-gradient(90deg,#3d8f5e,#9be6ae)}
    .raid-pcard.down .pbar i{background:#773b37}
    .raid-actions{display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:7px;margin-top:9px}
    .raid-actions .raid-btn{min-height:48px;font-size:12px}
    .raid-actions .raid-btn small{display:block;font-weight:400;color:#b8c9c1;font-size:10px;margin-top:2px}
    .raid-feed{max-height:100px;overflow:auto;font-size:11px;color:#a6bdb5;background:#081312;border:1px solid #263d38;border-radius:8px;padding:7px;margin-top:8px}
    .raid-feed div{padding:2px 0;border-bottom:1px solid #152521}
    .raid-results{text-align:center}.raid-results .big{font:700 clamp(26px,7vw,46px)/1 Georgia,serif;color:#f4dfaa;margin:10px 0}
    .raid-rewards{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:8px;margin:12px 0}
    .raid-reward{border:1px solid #4d624c;border-radius:9px;padding:9px;background:#0b1918;font-size:12px}
    .raid-reward b{display:block;font-size:18px;color:#f0cc85}
    .raid-code{font:600 12px/1.4 ui-monospace,monospace;letter-spacing:.12em;color:#d7bd8a;background:#07110f;border:1px dashed #4e685b;padding:6px 8px;border-radius:7px}
    .raid-conn{font-size:10px;color:#93b2ae}.raid-conn.bad{color:#ffb09c}
    .raid-note{font-size:11px;color:#9ab2ab;line-height:1.45}
    .raid-floater{position:absolute;right:12px;top:10px;font:700 14px ui-monospace,monospace;color:#ffd28d;text-shadow:0 1px 2px #000;animation:raidFloat .8s ease-out forwards;pointer-events:none}
    @keyframes raidFloat{to{transform:translateY(-20px);opacity:0}}
    .raid-spacer{flex:1}
  </style>
  <div class="raid-shell">
    <header class="raid-head">
      <div><div class="raid-sub">Player-character encounter · 1–3 adventurers</div><h2 id="raidTitle">Rift Raid</h2></div>
      <span id="raidEntries" class="raid-tag">— entries</span>
      <span id="raidConn" class="raid-tag">Connecting…</span>
      <button class="raid-close" id="raidClose" type="button" aria-label="Close Rift Raid">✕</button>
    </header>
    <div id="raidBody" class="raid-spacer"></div>
    <footer class="raid-note" id="raidFoot">Server-owned damage, timing and rewards. Your field keeps farming in the background.</footer>
  </div>
</div>`);
    $('raidClose').addEventListener('click', close);
    $('raidOverlay').addEventListener('click', event => {
      const button = event.target.closest('button[data-raid-action]');
      if (button && !button.disabled) handle(button.dataset.raidAction, button.dataset.raidValue || '');
      const lane = event.target.closest('[data-raid-lane]');
      if (lane) { R.lane = lane.dataset.raidLane; render(); }
      const member = event.target.closest('[data-raid-target]');
      if (member) { R.targetId = Number(member.dataset.raidTarget) || 0; render(); }
    });
  }

  async function open() {
    installShell();
    R.open = true;
    R.error = '';
    $('raidOverlay').hidden = false;
    document.body.classList.add('raid-open');
    // Reuse the existing plaza socket for party actions. It is the same connection/message channel
    // the game already uses; there is no raid WebSocket and no second renderer.
    if (!R.party && typeof PGSocial !== 'undefined' && typeof PGSocial.enter === 'function') {
      try { PGSocial.enter(); } catch {}
    }
    await refresh();
    if (!R.timer) R.timer = setInterval(tick, 250);
  }
  function close() {
    R.open = false;
    const el = $('raidOverlay');
    if (el) el.hidden = true;
    document.body.classList.remove('raid-open');
    if (R.timer) { clearInterval(R.timer); R.timer = null; }
  }

  // Account clears are the authority for the earned aura and the four Rift Raid titles. Mirror the
  // count into the save once, then let the existing mastery-title sync award exactly the reached
  // milestones. Nothing here is a purchase or a second reward path.
  function syncAccountProgress(account) {
    if (!account) return;
    try {
      if (typeof S === 'undefined' || !S) return;
      const clears = Math.max(0, Math.floor(num(account.qualifyingClears)));
      let changed = false;
      if (clears > Math.max(0, Math.floor(num(S.raidClears)))) { S.raidClears = clears; changed = true; }
      if (clears > 0 && !S.riftAura) { S.riftAura = true; changed = true; }
      if (changed) {
        try { if (typeof PGTitles !== 'undefined') PGTitles.sync(S, typeof CLASSES !== 'undefined' ? CLASSES : {}); } catch {}
        try { if (typeof syncRiftCosmetics === 'function') syncRiftCosmetics(S); } catch {}
        try { if (typeof save === 'function') save(); } catch {}
        try { if (typeof ui === 'function') ui(); } catch {}
      } else {
        try { if (typeof syncRiftCosmetics === 'function') syncRiftCosmetics(S); } catch {}
      }
    } catch {}
  }

  async function refresh() {
    try {
      const data = await api();
      if (data.disabled) { R.error = data.err || 'Rift Raid is not enabled on this server yet.'; R.view = 'lobby'; render(); return; }
      R.account = data.account || null;
      syncAccountProgress(R.account);
      R.eligibility = data.eligibility || null;
      R.party = data.party || R.party;
      R.activeRun = data.activeRun || null;
      R.lastSync = Date.now();
      if (data.activeRunError) R.error = data.activeRunError;
      if (R.activeRun) {
        adoptRun(R.activeRun);
        if (['cleared', 'failed'].includes(R.activeRun.state)) await settle(R.activeRun.id);
        else R.view = 'arena';
      } else if (data.lastRun?.id && data.lastRun.id !== R.lastResultId && !R.result) {
        // A member who was offline when the run ended can still see the exact settled result once.
        await settle(data.lastRun.id);
        R.activeRun = null;
      } else if (R.view === 'results' && R.result) {
        // Keep the settled result on screen until the player closes it.
      } else if (R.view === 'arena' || R.view === 'results') {
        R.view = 'lobby'; R.result = null; R.rewardRows = []; R.run = null;
      }
      render();
    } catch (error) {
      R.error = error.message || 'The raid lobby could not be reached.';
      render();
    }
  }

  function adoptRun(run) {
    if (!run) return;
    if (R.run?.id !== run.id) R.deadlineSettledFor = '';
    R.run = run;
    R.serverOffset = num(run.serverNow, Date.now()) - Date.now();
    if (run.hazard) R.lane = R.lane || 'center';
    if (!R.targetId) {
      const living = (run.members || []).find(m => m.id !== myId() && m.hp > 0 && num(m.hp) < num(m.maxHp));
      R.targetId = living ? Number(living.id) : 0;
    }
    if (num(run.hpRemaining) < R.lastBossHp) {
      const boss = $('raidBossArt');
      if (boss) { boss.classList.remove('hit'); void boss.offsetWidth; boss.classList.add('hit'); }
    }
    R.lastBossHp = num(run.hpRemaining);
  }

  function myId() {
    // The API account carries the authenticated user id, so the arena still knows which card is
    // "you" after a reconnect that happens before the plaza socket has re-greeted.
    const fromApi = Number(R.account?.userId || 0);
    if (fromApi) return fromApi;
    try { return Number(globalThis.PGSocial?.app?.id || 0); } catch { return 0; }
  }

  function receive(run) {
    if (!run) return;
    const wasOpen = R.open;
    adoptRun(run);
    if (R.open) {
      if (['cleared', 'failed'].includes(run.state)) settle(run.id);
      else R.view = 'arena';
      render();
    } else if (['active', 'cleared', 'failed'].includes(run.state)) {
      // A party start is acknowledged on every participant's existing socket. Open the same arena
      // without a second polling loop.
      if (!wasOpen) open().catch(() => {});
    }
  }
  function receiveParty(party) {
    R.party = party || null;
    if (R.open) render();
  }

  async function settle(runId) {
    if (!runId || R.settling || (R.result && R.result.acknowledged !== false)) return;
    R.settling = true;
    try {
      const data = await api('', { action: 'settle', runId });
      if (data.ok || data.outcome) {
        R.result = data;
        R.lastResultId = runId;
        R.rewardRows = Array.isArray(data.rewards) ? data.rewards : [];
        R.view = 'results';
        render();
      } else {
        R.error = data.err || 'The result could not be settled yet. Retry.';
        render();
      }
    } catch (error) {
      R.error = error.message || 'The result could not be settled yet. Retry.';
      render();
    } finally {
      R.settling = false;
    }
  }

  function currentWeapon() {
    try { return typeof S !== 'undefined' && S && S.eq ? (S.eq.weapon || null) : null; } catch { return null; }
  }
  function shardBalance() {
    try { return typeof S !== 'undefined' && S ? Math.max(0, Math.floor(num(S.riftShards))) : 0; } catch { return 0; }
  }

  function forgeWeapon() {
    const weapon = currentWeapon();
    if (!weapon) { R.error = 'Equip a weapon before forging Rift stars.'; return; }
    const star = starsOf(weapon);
    const quote = forgeQuote(star, R.forgeExtra);
    if (quote.maxed) { R.error = 'This weapon already has all 20 Rift stars.'; return; }
    if (shardBalance() < quote.totalCost) {
      R.error = `You need ${fmt(quote.totalCost - shardBalance())} more Rift Shards for this attempt.`;
      return;
    }
    try {
      S.riftShards = shardBalance() - quote.totalCost;
      const success = Math.random() * 100 < quote.chance;
      if (success) weapon.stars = Math.min(STAR_MAX, star + 1);
      // A failure never removes a star. Only the shards are consumed, which is the owner's rule.
      R.notice = success
        ? `Forged ${weapon.name || 'weapon'} to ${weapon.stars} star${weapon.stars === 1 ? '' : 's'} (${quote.chance}% chance).`
        : `Forging failed at ${quote.chance}%. No star was lost; ${fmt(quote.totalCost)} Rift Shards were consumed.`;
      try { if (typeof log === 'function') log(R.notice, success ? 'r3' : 'r0', 'gear'); } catch {}
      try { if (typeof save === 'function') save(); } catch {}
      try { if (typeof ui === 'function') ui(); } catch {}
    } catch (error) {
      R.error = error.message || 'The forge could not complete this attempt.';
    }
  }

  async function handle(action, value) {
    if (!action) return;
    R.error = '';
    try {
      if (action === 'solo') {
        R.busy = 'start';
        const data = await api('', { action: 'start', mode: 'solo' });
        R.activeRun = data.run; adoptRun(data.run); R.view = 'arena'; R.result = null; R.lastResultId = '';
        if (data.run && ['cleared', 'failed'].includes(data.run.state)) await settle(data.run.id);
      } else if (action === 'start') {
        R.busy = 'start';
        const data = await api('', { action: 'start', mode: 'party' });
        R.activeRun = data.run; adoptRun(data.run); R.view = 'arena'; R.result = null; R.lastResultId = '';
        if (data.run && ['cleared', 'failed'].includes(data.run.state)) await settle(data.run.id);
      } else if (action === 'party') {
        R.busy = 'party';
        const data = await api('', { action: 'party', partyAction: 'join' });
        R.party = data.party; R.view = 'lobby';
        // The lobby reuses the existing plaza socket so another member's ready/start arrives as a
        // room message rather than a polling request.
        if (typeof PGSocial !== 'undefined' && typeof PGSocial.enter === 'function') { try { PGSocial.enter(); } catch {} }
      } else if (action === 'leaveparty') {
        const data = await api('', { action: 'party', partyAction: 'leave' });
        R.party = data.party; R.view = 'lobby';
      } else if (action === 'ready') {
        const ready = value !== 'off';
        const data = await api('', { action: 'ready', ready });
        R.party = data.party || R.party;
      } else if (action === 'forge-extra') {
        R.forgeExtra = clamp(Math.floor(num(value)), 0, 3);
      } else if (action === 'forge') {
        forgeWeapon();
      } else if (action === 'card') {
        R.busy = 'card';
        const data = await api('', { action: 'card', cardKey: value || '' });
        if (data.account) R.account = data.account;
      } else if (action === 'lobby') {
        R.result = null; R.rewardRows = []; R.run = null; R.activeRun = null; R.view = 'lobby';
        await refresh();
      } else if (action === 'refresh') {
        await refresh();
      } else if (['strike', 'dodge', 'ward', 'heal', 'revive'].includes(action)) {
        await sendCombat(action);
      } else if (action === 'settle') {
        await settle(R.run?.id || R.activeRun?.id);
      } else if (action === 'close') {
        close();
      }
    } catch (error) {
      R.error = error.message || 'That raid request failed.';
    } finally {
      R.busy = '';
      render();
    }
  }

  function actionIdFor(key) {
    let id = R.pending.get(key);
    if (!id) {
      id = 'raid:' + (globalThis.crypto?.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));
      R.pending.set(key, id);
    }
    return id;
  }

  async function sendCombat(action) {
    const run = R.run;
    if (!run || run.state !== 'active') return;
    const key = action + ':' + (action === 'dodge' ? R.lane : (['ward', 'heal', 'revive'].includes(action) ? R.targetId || '' : ''));
    const actionId = actionIdFor(key);
    const body = { action: 'act', runId: run.id, combatAction: action, actionId };
    if (action === 'dodge') body.zone = R.lane;
    if (['ward', 'heal', 'revive'].includes(action)) body.targetId = R.targetId || undefined;
    R.busy = key;
    try {
      const data = await api('', body);
      if (data.run) adoptRun(data.run);
      if (data.settlement) {
        R.result = data.settlement; R.rewardRows = data.settlement.rewards || []; R.view = 'results';
      }
      R.pending.delete(key);
    } catch (error) {
      // Keep the same action id: a lost response may have been accepted by the room. Retrying this
      // key replays the receipt instead of applying a second strike/heal/upgrade.
      R.error = error.message || 'No response from the room. Retry the same action.';
      throw error;
    } finally {
      R.busy = '';
      render();
    }
  }

  function tick() {
    if (!R.open) return;
    const timer = $('raidTimer');
    if (timer && R.run) {
      const left = num(R.run.deadlineAt) - serverNow();
      timer.textContent = clock(left);
      timer.classList.toggle('low', left < 30000);
    }
    const telegraph = $('raidTelegraph');
    if (telegraph && R.run?.hazard) {
      const left = num(R.run.hazard.endsAt) - serverNow();
      telegraph.textContent = left > 0 ? 'Resolves in ' + Math.max(0, (left / 1000).toFixed(1)) + 's' : 'Resolving…';
    }
    if (R.run?.state === 'active' && num(R.run.deadlineAt) <= serverNow() && !R.busy && !R.settling
      && R.deadlineSettledFor !== R.run.id) {
      // The local countdown is only a hint. Ask the room once; the server remains the authority, and
      // a failed attempt is retried by the explicit button or the next open, never every 250 ms.
      R.deadlineSettledFor = R.run.id;
      settle(R.run.id);
    }
  }

  function render() {
    const body = $('raidBody');
    if (!body) return;
    const a = R.account || {};
    setText('raidEntries', (num(a.entriesLeft)) + ' / 2 entries');
    const conn = $('raidConn');
    if (conn) {
      const online = typeof navigator === 'undefined' || navigator.onLine !== false;
      conn.textContent = online ? (R.lastSync && Date.now() - R.lastSync < 60000 ? 'Room linked' : 'Room ready') : 'Offline';
      conn.classList.toggle('bad', !online);
    }
    if (R.view === 'results') body.innerHTML = renderResults();
    else if (R.view === 'arena' || (R.run && R.run.state === 'active')) body.innerHTML = renderArena();
    else body.innerHTML = renderLobby();
    for (const canvas of body.querySelectorAll('canvas[data-class]')) {
      try { if (typeof drawSkinPreview === 'function') drawSkinPreview(canvas.id, null, canvas.dataset.class, canvas.dataset.sex || 'm'); } catch {}
    }
  }

  function errorBox() { return R.error ? `<div class="raid-error" role="alert">${esc(R.error)}</div>` : ''; }

  function renderForge() {
    const weapon = currentWeapon();
    const star = starsOf(weapon);
    const quote = forgeQuote(star, R.forgeExtra);
    const shards = shardBalance();
    const atk = star * 2;
    const pen = Math.min(30, star * 1.5);
    return `<section class="raid-panel raid-forge" style="margin-top:12px">
      <div class="raid-eyebrow">Rift Forge · weapon stars</div>
      <h3 class="raid-h">${weapon ? esc(weapon.name || 'Equipped weapon') : 'Equip a weapon first'}</h3>
      <p class="raid-muted">Stars are permanent weapon upgrades: +2% ATK in every zone and +1.5% defence penetration against the Rift Sovereign per star (penetration caps at the boss's 30% armour). A failed forge never removes a star.</p>
      <div class="raid-stats">
        <div class="raid-stat"><small>Stars</small><b>${star} / ${STAR_MAX}</b></div>
        <div class="raid-stat"><small>All-content ATK</small><b>+${atk}%</b></div>
        <div class="raid-stat"><small>Raid defence pen.</small><b>${pen.toFixed(1)}%</b></div>
        <div class="raid-stat"><small>Rift shards available</small><b>${fmt(shards)}</b></div>
      </div>
      ${weapon ? `<div class="raid-row" style="margin:8px 0 4px" role="group" aria-label="Extra shards for this forge attempt">
        ${STAR_BOOSTERS.map(b => `<button class="raid-btn small ${R.forgeExtra === b.id ? 'primary' : 'ghost'}" data-raid-action="forge-extra" data-raid-value="${b.id}" aria-pressed="${R.forgeExtra === b.id}">${b.name}<small style="display:block;font-weight:400">${b.extraShards ? '+' + b.extraShards + ' shards' : 'no extra'} · ${b.note}</small></button>`).join('')}
      </div>
      <div class="raid-row" style="justify-content:space-between;margin-top:8px">
        <span class="raid-note">${quote.maxed ? 'Maximum stars reached.' : `Attempt costs <b>${fmt(quote.totalCost)}</b> Rift Shards · success <b>${quote.chance}%</b>${quote.booster.chance ? ' (base ' + quote.baseChance + '% + ' + quote.booster.chance + '%)' : ''}`}</span>
        <button class="raid-btn primary" data-raid-action="forge" ${!weapon || quote.maxed || shards < quote.totalCost ? 'disabled' : ''}>${quote.maxed ? 'Maxed' : 'Forge ' + (star + 1) + '. star'}</button>
      </div>` : '<div class="raid-note">The forge reads the weapon currently equipped in your field save. Equip one, then open Rift Raid again.</div>'}
      ${R.notice ? `<div class="raid-note" style="margin-top:6px;color:#f0cc85">${esc(R.notice)}</div>` : ''}
    </section>`;
  }

  function renderCards() {
    const cards = R.account?.cards || [];
    const equipped = cards.find(c => c.equipped);
    return `<section class="raid-panel" style="margin-top:12px">
      <div class="raid-eyebrow">Raid cards · account-wide</div>
      <h3 class="raid-h">${equipped ? esc(equipped.name) + ' equipped' : 'Choose one card'}</h3>
      <p class="raid-muted">Cards drop from the clear, fractured and pity chests. Duplicates raise a card's rank; all three are account-wide, and only one can be equipped. Its effect is snapshotted when the next run starts.</p>
      <div class="raid-party">${cards.length ? cards.map(c => `<article class="raid-pcard ${c.equipped ? 'you' : ''}" style="border-color:${c.equipped ? '#d5b06e' : ''}">
        <div class="phead"><div><div class="pname">${esc(c.name)} ${c.rank ? '<span class="raid-tag">R' + c.rank + '</span>' : ''}</div><div class="pmeta">${c.copies ? c.copies + ' copies' : 'Not collected'}</div></div></div>
        <div class="raid-note">${esc(c.desc)}</div>
        <div class="raid-row" style="margin-top:6px"><button class="raid-btn small ${c.equipped ? 'ghost' : 'primary'}" data-raid-action="card" data-raid-value="${c.equipped ? '' : esc(c.key)}" ${c.copies ? '' : 'disabled'}>${c.equipped ? 'Unequip' : c.copies ? 'Equip' : 'Locked'}</button></div>
      </article>`).join('') : '<div class="raid-note">Card collection is loading. If this persists, the 0023 migration has not been applied on this server.</div>'}</div>
    </section>`;
  }

  function renderLobby() {
    const a = R.account || {};
    const party = R.party;
    const active = R.activeRun;
    const members = party?.members || [];
    const eligible = active ? false : (R.eligibility ? R.eligibility.eligible === true : a.entriesLeft > 0);
    return `${errorBox()}
      <div class="raid-grid">
        <section class="raid-panel">
          <div class="raid-eyebrow">The Rift Sovereign · one encounter</div>
          <h3 class="raid-h">Hold the line for six minutes.</h3>
          <p class="raid-muted">Three escort phases break before the Sovereign. Attacks are automatic; you choose lanes, guard or mend a teammate, and rescue the downed. A downed adventurer cannot act until a living teammate revives them.</p>
          <div class="raid-boss" style="margin:10px 0 12px"><img src="${BOSS_ART}" alt="The Rift Sovereign"><div class="boss-label"><b>Rift Sovereign</b><div class="raid-muted">Fracture Slam · Rift Sweep · 30% armour</div></div></div>
          <div class="raid-stats">
            <div class="raid-stat"><small>Entries left</small><b>${num(a.entriesLeft)} / 2</b></div>
            <div class="raid-stat"><small>Rift shards available</small><b>${fmt(shardBalance())}</b></div>
            <div class="raid-stat"><small>Pity / fractured</small><b>${num(a.chestsToday?.pity)} / ${num(a.chestsToday?.fractured)}</b></div>
          </div>
          ${active ? `<div class="raid-error">You already have an active raid. <button class="raid-btn small primary" data-raid-action="refresh">Resume</button></div>` : ''}
          ${eligible ? `<div class="raid-row"><button class="raid-btn primary" data-raid-action="solo">Solo raid · 1 character</button><button class="raid-btn" data-raid-action="party">Form / join party</button></div>`
            : `<div class="raid-note">${active ? 'Resolve the active run before opening another.' : esc(R.eligibility?.reason || (a.entriesLeft > 0 ? 'Sync a cloud save before joining.' : 'Both entries for today are used. The daily reset is 00:00 Malaysia time.'))}</div>`}
        </section>
        <section class="raid-panel">
          <div class="raid-eyebrow">Party lobby</div>
          <h3 class="raid-h">${party ? 'Ready check' : 'Two or three adventurers'}</h3>
          ${party ? `<div class="raid-row" style="margin-bottom:8px"><span class="raid-code">${esc(party.id)}</span><span class="raid-tag">${party.open ? 'Open' : 'Locked'}</span><span class="raid-tag">${party.isLeader ? 'You lead' : 'Member'}</span></div>` : `<p class="raid-muted">Form a party here, or open the same lobby from the Social Hub. The first player hosts the world lobby; a friend opens Rift Raid and presses Form / join party.</p>`}
          ${members.length ? members.map((m, i) => `
            <div class="raid-member">
              <canvas id="raidAv${i}" width="42" height="48" data-class="${esc(m.cls || 'Novice')}" data-sex="m"></canvas>
              <div><div class="nm">${esc(m.name)}${m.id === myId() ? ' · you' : ''}</div><div class="cls">${esc(m.cls || 'No cloud save')}${m.magic ? ' · magic' : ''}</div></div>
              <div class="tags"><span class="${m.ready ? 'raid-ready' : 'raid-notready'}">${m.ready ? 'Ready' : m.readyStored ? 'Ready stale' : 'Not ready'}</span><br>${m.eligible ? num(m.entriesLeft) + ' entries' : esc(m.reason || 'Not eligible')}</div>
            </div>`).join('') : '<div class="raid-note">No party yet. Form/join creates the lobby used by the Social Hub too.</div>'}
          ${party ? `<div class="raid-row" style="margin-top:8px">
            <button class="raid-btn ${members.some(m => m.id === myId() && m.ready) ? 'ghost' : 'primary'}" data-raid-action="ready" data-raid-value="${members.some(m => m.id === myId() && m.ready) ? 'off' : 'on'}">${members.some(m => m.id === myId() && m.ready) ? 'Unready' : 'Ready'}</button>
            ${party.isLeader ? `<button class="raid-btn primary" data-raid-action="start" ${party.canStart ? '' : 'disabled'}>Start raid</button>` : '<span class="raid-tag">Waiting for leader</span>'}
            <button class="raid-btn danger small" data-raid-action="leaveparty">Leave party</button>
          </div><div class="raid-note" style="margin-top:6px">${party.allReady ? 'All ready. The leader can start.' : 'Every member must ready. A roster or loadout change clears readiness.'}</div>` : ''}
        </section>
      </div>
      ${renderForge()}
      ${renderCards()}
      <section class="raid-panel" style="margin-top:12px">
        <div class="raid-eyebrow">Earned, never sold</div>
        <p class="raid-note">Rewards are settled on the server and applied to your save through the existing grant queue; a full clear pays its own ledger row plus a fractured chest, and a failed run still pays a pity chest. Your first clear unlocks the Rift Aura, and qualifying clears unlock four Rift titles in the Mastery Index (filter: Rift Raid). No Cash Shop item is involved.</p>
      </section>`;
  }

  function hpBar(hp, max) {
    return `<div class="raid-bar hp"><i style="width:${pct(hp, max)}%"></i></div>`;
  }

  function renderArena() {
    const run = R.run;
    if (!run) return renderLobby();
    const members = run.members || [];
    const bossPct = pct(run.hpRemaining, run.totalHp);
    const hazard = run.hazard;
    const zones = hazard?.dangerZones || [];
    const my = members.find(m => m.id === myId()) || members[0] || null;
    const canAct = !!my && my.hp > 0;
    const target = members.find(m => m.id === R.targetId) || null;
    const downed = members.filter(m => m.hp <= 0);
    const left = num(run.deadlineAt) - serverNow();
    const phase = clamp(num(run.phaseIndex), 0, 3);
    return `${errorBox()}
      <div class="raid-grid">
        <section class="raid-panel">
          <div class="raid-row"><div class="raid-eyebrow">${esc(run.phaseNames?.[phase] || 'The Rift Sovereign')}</div><span class="raid-tag ${hazard ? 'hot' : ''}">${hazard ? 'DANGER' : 'Stable'}</span><span class="raid-tag">${esc(run.state)}</span></div>
          <div class="raid-boss" id="raidBossArt"><img src="${BOSS_ART}" alt="The Rift Sovereign"><div class="boss-label">
            <div class="raid-row" style="justify-content:space-between"><b>Rift Sovereign</b><small class="raid-muted">${fmt(run.hpRemaining)} / ${fmt(run.totalHp)}</small></div>
            <div class="raid-bar" style="margin-top:4px"><i style="width:${bossPct}%"></i></div>
            <div class="raid-phase">${(run.phaseHps || []).map((_, i) => `<span class="${i <= phase ? 'on' : ''}"></span>`).join('')}</div>
          </div></div>
          <div class="raid-lanes" role="group" aria-label="Choose a lane">${LANES.map(lane => `<button class="raid-lane ${zones.includes(lane) ? 'danger' : 'safe'} ${R.lane === lane ? 'chosen' : ''}" data-raid-lane="${lane}" aria-pressed="${R.lane === lane}">${zones.includes(lane) ? '<span class="hazard"></span>' : ''}<b>${LANE_LABEL[lane]}</b><small>${zones.includes(lane) ? 'Danger zone' : 'Safe lane'}</small></button>`).join('')}</div>
          <div class="raid-row" style="justify-content:space-between"><span class="raid-muted" id="raidTelegraph">${hazard ? 'Resolves in ' + Math.max(0, (num(hazard.endsAt) - serverNow()) / 1000).toFixed(1) + 's' : 'Next hazard is scheduled by the server.'}</span><span class="raid-timer ${left < 30000 ? 'low' : ''}" id="raidTimer">${clock(left)}</span></div>
          <div class="raid-feed" id="raidFeed">${(run.members || []).map(m => `<div>${esc(m.name)} · ${m.hp <= 0 ? 'DOWN' : fmt(m.hp) + ' HP'} · ${fmt(m.damage)} damage${m.wardUntil > serverNow() ? ' · warded' : ''}</div>`).join('')}<div>${hazard ? 'Move out of ' + hazard.dangerZones.map(z => LANE_LABEL[z]).join(' + ') + ' before the telegraph closes.' : 'Auto attacks continue. Focus strike, guard or mend when needed.'}</div></div>
        </section>
        <section class="raid-panel">
          <div class="raid-eyebrow">Your party</div>
          <div class="raid-party">${members.map(m => `<article class="raid-pcard ${m.hp <= 0 ? 'down' : ''} ${m.id === myId() ? 'you' : ''}" data-raid-target="${m.id}">
            <div class="phead"><canvas id="raidArenaAv${m.id}" width="38" height="44" data-class="${esc(m.cls || 'Novice')}" data-sex="${esc(m.sex || 'm')}"></canvas><div><div class="pname">${esc(m.name)}${m.id === myId() ? ' · you' : ''}</div><div class="pmeta">${esc(m.cls || 'Adventurer')} · ${m.magic ? 'MATK' : 'ATK'} ${fmt(m.dps)}</div></div></div>
            ${hpBar(m.hp, m.maxHp)}
            <div class="raid-row" style="justify-content:space-between"><small>${m.hp <= 0 ? 'Downed · needs rescue' : fmt(m.hp) + ' / ' + fmt(m.maxHp)}</small><small>${m.wardUntil > serverNow() ? 'Ward' : ''}</small></div>
            <div class="raid-row" style="margin-top:4px">${m.hp <= 0 ? `<span class="raid-tag hot">Revive needed</span>` : m.id === myId() ? `<span class="raid-tag">You</span>` : `<button class="raid-btn small ${R.targetId === m.id ? 'primary' : 'ghost'}" data-raid-target="${m.id}">${R.targetId === m.id ? 'Targeted' : 'Target'}</button>`}</div>
          </article>`).join('')}</div>
          <div class="raid-actions">
            <button class="raid-btn primary" data-raid-action="strike" ${!canAct || R.busy === 'strike:' ? 'disabled' : ''}>Focus strike<small>${my ? 'Ready ' + Math.max(0, Math.ceil((num(my.strikeReadyAt) - serverNow()) / 1000)) + 's' : 'Server cooldown'}</small></button>
            <button class="raid-btn" data-raid-action="dodge" ${!canAct ? 'disabled' : ''}>Dodge to ${LANE_LABEL[R.lane]}<small>Emergency move</small></button>
            <button class="raid-btn" data-raid-action="ward" ${!canAct || !target || target.hp <= 0 ? 'disabled' : ''}>Guard${target ? ' · ' + esc(target.name) : ''}<small>−50% hazard damage</small></button>
            <button class="raid-btn" data-raid-action="heal" ${!canAct || !target || target.hp <= 0 || target.hp >= target.maxHp ? 'disabled' : ''}>Mend<small>25% max HP</small></button>
            <button class="raid-btn ${downed.length ? 'danger' : 'ghost'}" data-raid-action="revive" ${!canAct || !target || target.hp > 0 ? 'disabled' : ''}>Rescue${target ? ' · ' + esc(target.name) : ''}<small>A living teammate</small></button>
          </div>
          <div class="raid-note" style="margin-top:7px">Tap a lane to choose it; tap a party card to target. Lane and target stay selected across party updates. Strike never blocks Dodge.</div>
        </section>
      </div>
      <div class="raid-row" style="margin-top:10px"><button class="raid-btn ghost small" data-raid-action="refresh">Refresh from room</button><button class="raid-btn ghost small" data-raid-action="close">Back to field</button></div>`;
  }

  function rewardText(row) {
    const bits = [];
    if (num(row.riftShards)) bits.push(fmt(row.riftShards) + ' Rift Shards');
    if (num(row.sigils)) bits.push(fmt(row.sigils) + " Valkyrie's Sigils");
    if (num(row.regionalMaterials)) bits.push(fmt(row.regionalMaterials) + ' Astral Shards');
    if (num(row.zeny)) bits.push(fmt(row.zeny) + ' Zeny');
    return bits.join(' · ') || 'Recorded';
  }

  function renderResults() {
    const r = R.result || {};
    const rows = R.rewardRows.length ? R.rewardRows : (r.rewards || []);
    const cards = Array.isArray(r.cards) ? r.cards : [];
    const cleared = r.outcome === 'clear' || r.outcomeState === 'cleared';
    return `${errorBox()}<section class="raid-panel raid-results">
      <div class="raid-eyebrow">${cleared ? 'Encounter cleared' : 'Encounter failed'}</div>
      <div class="big">${cleared ? 'The Rift Sovereign falls.' : 'The party was overwhelmed.'}</div>
      <p class="raid-muted">${cleared ? 'Full clear settled. Your first clear also unlocked the Rift Aura; check the Rift Raid filter in the Mastery Index for the four earned titles.' : 'Pity chest settled. The next attempt can start from the lobby when entries are available.'} ${r.acknowledged === false ? 'The room has not acknowledged the result yet; retry settlement to release it.' : ''}</p>
      <div class="raid-rewards">${rows.map(row => `<div class="raid-reward"><small>${esc(row.kind || 'reward')}</small><b>${esc(rewardText(row))}</b></div>`).join('') || '<div class="raid-reward">Rewards are applied to your save through the grant queue.</div>'}${cards.map(card => `<div class="raid-reward" style="border-color:#8b6a3a"><small>${esc(card.kind)} card</small><b>${esc(card.name || cardName(card.cardKey))}</b></div>`).join('')}</div>
      <div class="raid-row" style="justify-content:center"><button class="raid-btn primary" data-raid-action="lobby">Return to lobby</button>${r.acknowledged === false ? '<button class="raid-btn" data-raid-action="settle">Retry settlement</button>' : ''}</div>
    </section>`;
  }

  globalThis.PGRaid = {
    open, close, refresh, receive, receiveParty, api,
    get state() { return R; },
    // Test/handoff hooks; the browser UI never calls these directly.
    _render: render,
  };
})();
