/* Player-character Rift Raid client (v449: the four-stage Astral dungeon).
 *
 * This file is the *interface* around the dungeon: the lobby (solo/party setup, entries, rules), the
 * in-viewport HUD's data, reconnect/resume, and the results screen. The dungeon itself is drawn by
 * assets/raid-dungeon.js inside the game's own WebGL scene, and every rule is the server's.
 *
 * The client sends three things to the room, and nothing else:
 *   - a destination (`move`) when the player taps the ground or holds a direction key
 *   - a focus target (`focus`) when the player taps an enemy
 *   - a paid interaction (`interact` at a portal, `revive`) which the server validates
 * Automatic combat, hazard timing, damage, downing and the wipe all resolve on the server from the
 * class snapshot the room built at activation.
 *
 * There is no lane arena, no Strike/Heavy button and no second renderer here. The overlay is only
 * shown when the player is not inside the run; during combat it steps out of the way of the viewport.
 */
(function () {
  'use strict';
  const esc = value => (typeof globalThis.esc === 'function' ? globalThis.esc(value) : String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])));
  const num = (n, fallback = 0) => (Number.isFinite(Number(n)) ? Number(n) : fallback);
  const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
  // The boss portrait in the lobby is the native sheet's own idle frame - the same art the raid
  // spawns in the arena, not a separate commission.
  const BOSS_ART = 'assets/mobs/v1/1708-0.png';

  const R = {
    open: false, busy: '', error: '', view: 'lobby', account: null, party: null, eligibility: null,
    activeRun: null, run: null, result: null, rewardRows: [], targetId: '',
    // A solo run is executed locally and is NOT the same thing as `run` (which is a public snapshot
    // the renderer reads). `solo` is the live engine object; `soloRunning` keeps a lobby refresh from
    // tearing it down; `resumeRunId` is the run this tab already holds a checkpoint for.
    solo: null, soloRunning: false, soloStop: null, resumeRunId: '', resumeRulesVersion: '',
    soloResumed: false, activeRunLocal: null, resumeAttempted: false,
    pending: new Map(), lastSync: 0, stageSeen: -1,
    timer: null, partyAction: false, codeOpen: false, notice: '', lastResultId: '', settling: false,
    deadlineSettledFor: '', forgeExtra: 0, inRun: false, lastPollAt: 0,
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
  // Every countdown in this panel is stage time on the server's clock, so it must read the same
  // clock the renderer's HUD does: the median of the snapshot offsets, not the device's wall clock.
  const serverNow = () => {
    const rd = globalThis.PGRaidDungeon;
    if (rd && rd.active && typeof rd.serverNow === 'function') { try { return rd.serverNow(); } catch {} }
    return Date.now() + R.serverOffset;
  };
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
    /* A thumb is not a mouse. The compact variant is 36px, which is fine on a desktop and below the
       44px touch minimum on a phone; the booster rows are real choices a player has to hit. */
    @media(max-width:720px),(pointer:coarse){.raid-btn.small{min-height:44px;padding:8px 12px}}
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
    .raid-timer{font:700 30px/1 ui-monospace,monospace;color:#f6e6bc;letter-spacing:.06em}
    .raid-timer.low{color:#ff9c86}
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
    /* The run frame. The FIGHT is not drawn here - it is the game's own WebGL scene. This panel is
       the stage/objective/party frame plus the two interactions a stage can ask for. */
    .raid-runbar{display:flex;align-items:center;gap:12px;margin:2px 0 6px;padding:9px 12px;border:1px solid #37514c;border-radius:11px;background:linear-gradient(90deg,#0b1a1a,#0a1418)}
    .raid-runbar-stage{display:flex;flex-direction:column;gap:1px;min-width:0;flex:1}
    .raid-runbar-stage b{font:700 15px/1.2 Georgia,serif;color:#f2dfb4}
    .raid-runbar-stage small{font-size:11px;color:#9fb8b1}
    .raid-runbar-clock{font:700 24px/1 ui-monospace,monospace;color:#f6e6bc;letter-spacing:.05em}
    .raid-runbar-clock.low{color:#ff9c86}
    .raid-runbar-flag{margin:-2px 0 8px;padding:0 12px;font:700 12px/1.4 system-ui,sans-serif;color:#ffe0a2;opacity:0;transition:opacity .25s ease}
    .raid-runbar-flag.on{opacity:1}
    .raid-stages{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:7px;margin:10px 0 0}
    .raid-stage{display:flex;flex-direction:column;gap:2px;border:1px solid #35504b;border-radius:9px;background:#0a1717;padding:8px}
    .raid-stage span{font:700 10px/1 ui-monospace,monospace;letter-spacing:.18em;color:#8fb6ae}
    .raid-stage b{font:700 12px/1.25 system-ui,sans-serif;color:#f0e2c4}
    .raid-stage small{font-size:10px;color:#93aaa4}
    .raid-avatar{width:38px;height:44px;image-rendering:pixelated}

    /* In-viewport HUD (assets/raid-dungeon.js). It sits on the field, never over a safe area's floor
       marker: the top bar is one line and the party strip hugs the bottom-left. */
    #raidHudLayer{position:fixed;inset:0;pointer-events:none;z-index:44}
    .raid-hud{position:absolute;inset:0;pointer-events:none;font-family:system-ui,-apple-system,Segoe UI,sans-serif;color:#e9f0ff}
    .raid-hud[hidden]{display:none}
    /* The stage/timer row is the raid's own header, so it sits just under the game's top bar rather
       than under it. 112px clears the header on desktop; the media query below tightens it on phones,
       where the top bar wraps. */
    /* A raid is its own screen: the field's combat pill, minimap, side rail, chat and quest chips are
       field-only chrome and are put away for the fight. The player's portrait card, the bottom dock
       and the top bar stay, so every control they already know is still where it was. */
    body.raid-fighting #eclipseCombat,body.raid-fighting #minimapTools,body.raid-fighting #sideRail,
    body.raid-fighting #eclipseMapCard,body.raid-fighting #feedWrap,body.raid-fighting #eclipseCompanions,
    body.raid-fighting #pgQuests,body.raid-fighting #hint,body.raid-fighting #tag,
    body.raid-fighting #socialChat{display:none!important}
    /* The raid is its own screen, so the FIELD's furniture goes with the rest of it. Leaving the
       header, the portrait card, the hotbar and the stat footer up put a farming HUD on top of a
       dungeon: the arena was squeezed into the gap between them and read as a broken field rather
       than a fight. The raid draws its own stage/timer header, its own party rows and its own
       objective line, and its exit is the panel's close button, so none of this is needed here. */
    body.raid-fighting #eclipseHeader,body.raid-fighting #hud,body.raid-fighting #dock,
    body.raid-fighting #xp-dock,body.raid-fighting #hudBuffs,body.raid-fighting #heroTitle,
    body.raid-fighting #comboFieldStatus{display:none!important}
    /* With the field chrome gone the arena owns the whole viewport, and the raid HUD hangs from the
       top edge instead of the 64px the field header used to occupy. */
    body.raid-fighting #raidHudLayer .raid-hud-top{top:14px}
    /* The dungeon canvas is a field of its own: kill the field's vignette/edges so the arena edges
       are what the player sees, and keep the whole scene clickable while the HUD stays inert. */
    body.raid-fighting #ov{cursor:crosshair}
    /* A phone has no room for a second HUD row: tighten the stage card and the party stack. */
    @media(max-width:700px){
      body.raid-fighting #raidHudLayer .raid-hud-top{top:8px;max-width:calc(100vw - 16px)}
      body.raid-fighting #raidHudLayer .raid-hud-party{bottom:12px;width:min(150px,42vw)}
    }
    .raid-hud-top{position:absolute;left:50%;transform:translateX(-50%);top:64px;display:flex;align-items:stretch;gap:8px;max-width:min(560px,92vw)}
    .raid-hud-stage{flex:1;min-width:0;display:flex;flex-direction:column;gap:1px;padding:7px 12px;border-radius:10px;background:#070c1acc;border:1px solid #3a4a72;backdrop-filter:blur(3px)}
    .raid-hud-step{font:700 9px/1 ui-monospace,monospace;letter-spacing:.18em;color:#8fa7d8}
    .raid-hud-stage b{font:700 14px/1.2 Georgia,serif;color:#f4e6c6}
    .raid-hud-stage small{font-size:11px;color:#a9bad8}
    .raid-hud-timer{flex:none;display:flex;flex-direction:column;align-items:flex-end;justify-content:center;padding:6px 12px;border-radius:10px;background:#070c1acc;border:1px solid #3a4a72}
    .raid-hud-timer span{font:700 22px/1 ui-monospace,monospace;color:#f6e6bc}
    .raid-hud-timer small{font-size:9px;letter-spacing:.16em;text-transform:uppercase;color:#8fa7d8}
    .raid-hud-warning{position:absolute;left:50%;top:150px;transform:translateX(-50%);display:flex;align-items:center;gap:9px;padding:7px 13px;border-radius:99px;background:#26070dd9;border:1px solid #b04a3a;color:#ffd6c4;font:700 12px/1.2 system-ui,sans-serif;box-shadow:0 4px 18px #0009}
    .raid-hud-warning[hidden]{display:none}
    .raid-hud-warning b{font:700 13px/1 ui-monospace,monospace;color:#ffe6a8;min-width:38px;text-align:right}
    .raid-hud-warning[data-kind="astral-cataclysm"]{background:#07260fd9;border-color:#54a06a;color:#d6ffdf}
    .raid-hud-warning[data-kind="soul-cleave"]{background:#26070dd9;border-color:#b04a3a}
    .raid-hud-warning[data-kind="ritual"]{background:#1d0a2ad9;border-color:#9b6ad0;color:#ecd9ff}
    .raid-hud-boss{position:absolute;left:50%;top:202px;transform:translateX(-50%);width:min(520px,72vw)}
    .raid-hud-boss[hidden]{display:none}
    .raid-hud-boss-head{display:flex;justify-content:space-between;align-items:baseline;font:700 11px/1.2 system-ui,sans-serif;color:#ffd9a0;text-shadow:0 1px 3px #000}
    .raid-hud-bar{height:9px;border-radius:6px;background:#1a0f1ecc;border:1px solid #6a4b62;overflow:hidden}
    .raid-hud-bar i{display:block;height:100%;background:linear-gradient(90deg,#8b2f4a,#e0805a);transition:width .22s ease}
    .raid-hud-party{position:absolute;left:10px;bottom:96px;pointer-events:none;display:flex;flex-direction:column;gap:4px;width:min(210px,46vw)}
    .raid-hud-member{padding:4px 7px;border-radius:8px;background:#070c1ab8;border:1px solid #33456b}
    .raid-hud-member.you{border-color:#d5b06e}
    .raid-hud-member.down{border-color:#9d4a44;background:#1d0c0ccc}
    .raid-hud-member-head{display:flex;justify-content:space-between;font-size:10px;color:#dbe6ff}
    .raid-hud-member-head small{font:700 9px/1 ui-monospace,monospace;color:#a8bade}
    .raid-hud-member.down .raid-hud-member-head small{color:#ff9c86}
    .raid-hud-member .raid-hud-bar{height:6px;margin-top:3px}
    .raid-hud-member .raid-hud-bar i{background:linear-gradient(90deg,#2f8f5e,#93e6ac)}
    .raid-hud-member.down .raid-hud-bar i{background:#773b37}
    .raid-hud-tip{position:absolute;left:50%;bottom:96px;transform:translateX(-50%);padding:4px 10px;border-radius:99px;background:#070c1a99;border:1px solid #33456b;font:600 10px/1.3 system-ui,sans-serif;color:#b9c8e6;white-space:nowrap;max-width:60vw;overflow:hidden;text-overflow:ellipsis}
    @media(max-width:640px){.raid-hud-tip{display:none}.raid-hud-warning{top:160px}.raid-hud-boss{top:214px;width:86vw}}
    .raid-spacer{flex:1}
  </style>
  <div class="raid-shell">
    <header class="raid-head">
      <div><div class="raid-sub">Player-character encounter · 1–3 adventurers</div><h2 id="raidTitle">Rift Raid</h2></div>
      <span id="raidEntries" class="raid-tag">— entries</span>
      <span id="raidConn" class="raid-tag">Connecting…</span>
      <button class="raid-close" id="raidClose" type="button" aria-label="Close Rift Raid">✕</button>
    </header>
    <div id="raidStageToast" class="raid-runbar-flag" role="status" aria-live="polite"></div>
    <div id="raidBody" class="raid-spacer"></div>
    <footer class="raid-note" id="raidFoot">Server-owned damage, timing and rewards. Your field keeps farming in the background.</footer>
  </div>
</div>`);
    $('raidClose').addEventListener('click', close);
    $('raidOverlay').addEventListener('click', event => {
      const button = event.target.closest('button[data-raid-action]');
      if (button && !button.disabled) handle(button.dataset.raidAction, button.dataset.raidValue || '');
    });
  }

  // The overlay belongs to the lobby and the between-stage screen. Once a live run is being fought,
  // the fight is the screen: the panel steps aside and only the field HUD stays up (the Resume
  // button already told the player this). Opening again from the lobby still shows the panel first.
  function syncOverlayToRun() {
    const el = $('raidOverlay');
    if (!el) return;
    const fighting = R.open && R.view === 'arena' && R.run?.state === 'active';
    el.hidden = !R.open || fighting;
    const body = document.body;
    if (body) {
      body.classList.toggle('raid-open', R.open);
      // Field-only chrome is put away for the duration of a fight (the CSS lives in this sheet).
      body.classList.toggle('raid-fighting', fighting);
    }
  }

  async function open() {
    installShell();
    R.open = true;
    R.error = '';
    syncOverlayToRun();
    document.body.classList.add('raid-open');
    // Reuse the existing plaza socket for party actions. It is the same connection/message channel
    // the game already uses; there is no raid WebSocket and no second renderer.
    if (!R.party && typeof PGSocial !== 'undefined' && typeof PGSocial.enter === 'function') {
      try { PGSocial.enter(); } catch {}
    }
    await refresh();
    // A reload while a solo run is in flight lands here: the server still holds the reservation, so
    // the tab resumes that run instead of offering a second entry. `startSoloRun` looks for the local
    // checkpoint first and never reserves while one is readable.
    if (R.activeRunLocal && !R.soloRunning && !R.resumeAttempted) {
      R.resumeAttempted = true;
      await startSoloRun();
      return;
    }
    // The overlay itself has no ticker: the run panel is repainted from adoptRun/syncArena, and the
    // in-run HUD is driven by the renderer. The only interval is the run poll, started when a run is
    // actually adopted and stopped when it ends.
  }
  function close() {
    R.open = false;
    syncOverlayToRun();
    // Closing the overlay never stops the run and never stops the poll: the HUD is driven by the
    // 2 s run poll for as long as the server says the run is active, and the poll stops itself the
    // moment it is not. That is what keeps a solo player's HUD live while the panel is closed.
    if (!R.inRun && !(R.run && R.run.state === 'active')) stopPolling();
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
      // A solo run is reported as `activeReservation`, not `activeRun`: it is a reservation (identity,
      // seed, clock, roster) with no simulated state, and adopting it as a run snapshot replaced the
      // live HUD with `{state: undefined}`. Older builds sent the reservation itself as `activeRun`
      // with `local: true`; both are accepted here, and neither is ever adopted as run state.
      R.activeRunLocal = data.activeReservation
        || ((R.activeRun && R.activeRun.local) ? R.activeRun : null);
      if (R.activeRun && R.activeRun.local) R.activeRun = null;
      R.lastSync = Date.now();
      if (data.activeRunError) R.error = data.activeRunError;
      // A solo run lives only in this tab, so the server has nothing to say about it: `activeRun` is
      // null while one is in progress. Without this guard a lobby refresh (login, an account sync)
      // would tear down a local run that is still being played.
      if (R.soloRunning) { render(); return; }
      // A local run the server still considers active is THIS tab's run (or one this account left
      // behind). Adopting its identity is what lets a reloaded tab find its checkpoint instead of
      // reserving a second entry. The server marks these `local: true`; a co-op run never is.
      if (R.activeRunLocal) {
        R.resumeRunId = R.activeRunLocal.id;
        R.resumeRulesVersion = R.activeRunLocal.rulesVersion || '';
        // The tab already holds a live local run: this is a lobby refresh (a login, an account sync),
        // not a rejoin. Adopting anything here would overwrite the HUD with reservation data.
        if (R.solo || R.soloRunning) { render(); return; }
      }
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

  // The run is the server's. The client mirrors it, and on a new run or a stage change it hands the
  // renderer the new stage. Nothing here computes damage or a mechanic.
  function adoptRun(run) {
    if (!run) return;
    const isNew = R.run?.id !== run.id;
    R.run = run;
    R.stageSeen = num(run.stageIndex, 0);
    // Every login starts in the plaza, and the plaza is a screen of its own: the field does not draw
    // behind it. A raid is fought on the field, so adopting a live run steps out first — the same path
    // as the hub's own Field button (PGSocial.leave), not a second way out of the plaza.
    if (run.state === 'active') {
      try {
        if (document.body && document.body.classList.contains('social-open')
          && typeof PGSocial !== 'undefined' && PGSocial && typeof PGSocial.leave === 'function') PGSocial.leave();
      } catch {}
      // The fight is the screen: any window left open from the plaza (the guide opens itself on the
      // first trip to the field) would sit on top of it. This is the same close Escape performs.
      try {
        if (isNew && typeof escapeUI === 'function' && typeof tabs !== 'undefined' && tabs.length) escapeUI();
      } catch {}
    }
    if (globalThis.PGRaidDungeon) {
      try {
        const rd = globalThis.PGRaidDungeon;
        rd.noteSnapshot(run);
        if (num(run.serverNow, 0) > 0) R.serverOffset = num(run.serverNow) - Date.now();
        // Only a live run keeps the dungeon mounted. The moment it ends the field comes back and the
        // results are shown as a panel over it, which is also what a player expects after a wipe.
        const live = run.state === 'active';
        if (live) {
          if (!rd.active || rd.stageKey !== run.stageKey) {
            rd.begin(dungeonHooks(), run.id, run.stageKey, myId());
            rd.reconcile(run);
          } else {
            rd.reconcile(run);
          }
        } else {
          rd.end();
        }
        R.inRun = run.state === 'active';
        rd.hudUpdate(run);
      } catch (error) { console.error('Raid dungeon update failed', error); }
    }
    // A stage transition is a visible move for the whole party: the overlay announces it once, and
    // the renderer has already rebuilt the layout.
    if (isNew) {
      R.notice = '';
      stopPolling();
      if (run.state === 'active') startPolling();
    }
    updateRunOverlay(run);
  }

  // ---- the run overlay ---------------------------------------------------------------------------
  // During combat the overlay is closed and only the field HUD (assets/raid-dungeon.js) is on screen.
  // It re-opens by itself for a stage transition or a terminal result, and for nothing else.
  function updateRunOverlay(run) {
    if (!run) return;
    if (run.state === 'active') {
      if (R.open && R.view === 'arena') {
        // Re-open the panel for the one stage announcement, then step back out of the fight.
        syncOverlayToRun();
        // A transition is worth one short announcement, not a modal: the player is still playing.
        const announce = document.getElementById('raidStageToast');
        if (announce) {
          announce.textContent = 'Stage ' + (num(run.stageIndex) + 1) + ' of 4 · ' + (run.stageName || '');
          announce.classList.add('on');
          clearTimeout(R.toastTimer);
          R.toastTimer = setTimeout(() => announce.classList.remove('on'), 2600);
        }
      }
      return;
    }
    // A terminal run. A solo run's claim comes from the LOCAL run -- the only thing that knows what
    // the browser actually reached -- because `settle` with no claim is a different request (no
    // `result`), and the server rejects that with "The run result was not reported." Two paths supply
    // it: the live loop's `onEnd` keeps the run on the record before clearing `R.solo`, and a reload
    // that restored an already-terminal checkpoint does the same. A co-op run sends no claim at all:
    // the room's snapshot is the authority there.
    const local = R.solo || R.lastLocalRun || null;
    settle(run.id, local && (run.local || local.local) ? local : null);
  }

  // The room is read only for the events the socket does not carry: a teammate's revive hold, a
  // reconnect, or a stage transition. 2 s while the run is live, stopped the moment it ends or the
  // player leaves the tab. This is the ONLY recurring request in the raid.
  function startPolling() {
    stopPolling();
    R.lastPollAt = Date.now();
    R.timer = setInterval(pollRun, 2000);
  }
  function stopPolling() {
    if (R.timer) { clearInterval(R.timer); R.timer = null; }
  }
  async function pollRun() {
    // A solo run is simulated in this tab. There is no room to poll, and a sync would return the
    // reservation (which carries no run state) — adopting that is what replaced the live HUD with
    // `{state: undefined}` one frame after the run started.
    if (R.solo || R.soloRunning) { stopPolling(); return; }
    const run = R.run;
    if (!run || run.state !== 'active') { stopPolling(); return; }
    if (typeof document !== 'undefined' && document.hidden) return;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
    R.lastPollAt = Date.now();
    try {
      const data = await api('', { action: 'sync', runId: run.id });
      // A local reservation is not run state; adopting it would blank the arena.
      if (data.run && !data.run.local) adoptRun(data.run);
      if (data.settlement) {
        // The run ended while the panel was closed: show the result the server actually paid.
        stopPolling();
        R.result = data.settlement;
        R.rewardRows = data.settlement.rewards || [];
        R.view = 'results';
        if (!R.open) open().catch(() => {});
        else render();
      }
      if (data.missing) { stopPolling(); R.error = data.err || 'That raid no longer exists.'; if (R.open) render(); }
    } catch (error) {
      // A failed poll is not a failed run. The next tick retries; the room still owns the state.
      if (error && error.status === 404) { stopPolling(); if (R.open) render(); }
    }
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

  // ---- solo: executed here, in this tab ----------------------------------------------------------
  // A solo run is NOT installed in the Social room. `start` is the only call that reserves anything:
  // an authenticated Pages Function that writes the daily entry and returns the run identity, seed,
  // rules version and profile snapshot. From there the run is simulated locally by the same engine
  // module the co-op room imports (assets/raid-engine/raid-engine.js), so a complete solo run makes
  // zero raid-related Durable Object requests -- no install, no socket, no snapshot poll, no alarm.
  //
  // Recovery, in the order it can happen:
  //   * a checkpoint exists for this account + run id + rules version -> resume it, never re-reserve;
  //   * the checkpoint is missing -> the server decides whether an entry is left (it may answer with
  //     the run this account already owns, which is what makes a lost response safe);
  //   * the checkpoint is BROKEN (unreadable, wrong rules, storage refused) -> stop and say so. This
  //     is the one case that must not fall through to a fresh paid entry.
  async function startSoloRun() {
    const solo = globalThis.PGRaidSolo;
    if (!solo || typeof solo.begin !== 'function') {
      R.error = 'The local raid runner did not load. Reload the page and try again.';
      R.busy = ''; render(); return;
    }
    const accountKey = String(R.account?.userId || myId() || 'anon');
    // Resume before reserving. A tab that was closed mid-run must continue the run it already paid
    // for rather than buying a second entry.
    if (R.resumeRunId) {
      const saved = solo.loadCheckpoint(accountKey, R.resumeRunId, R.resumeRulesVersion || '');
      if (saved.status === 'ok') {
        R.busy = '';
        R.soloResumed = true;
        // A checkpoint that was already terminal when the tab closed: the fight is over and only the
        // settlement is outstanding. Settling it with its own claim is what makes a reload that races
        // the settle recover the rewards instead of showing an empty lobby.
        // Nothing has imported the engine yet on a reloaded tab, and `snapshotSync` needs it in
        // memory. Warm it first; if it cannot load, say so instead of falling through to a second
        // paid entry.
        try { await solo.warm(); } catch (error) {
          R.error = 'Your saved solo run could not be restored (the raid engine did not load). Reload to try again.';
          R.busy = ''; render(); return;
        }
        if (saved.run.state !== 'active') {
          // Keep the terminal local run reachable: `updateRunOverlay` builds the settle claim from it,
          // and the restore path is precisely the case where `R.solo` has already been cleared.
          R.lastLocalRun = saved.run;
          R.solo = null; R.soloRunning = false;
          R.result = null; R.lastResultId = '';
          R.view = 'results';
          try { adoptRun(solo.snapshotSync(saved.run, saved.run.finishedAt || saved.run.updatedAt)); } catch (error) { console.error('Solo restore failed', error); }
          await settle(saved.run.id, saved.run);
          return;
        }
        startSoloLoop(saved.run, accountKey);
        return;
      }
      if (saved.status === 'broken') {
        R.error = 'Your saved solo run could not be restored (' + (saved.why || 'unreadable') + '). '
          + 'It was not restarted, so today\'s entry is not spent. Reload to try again.';
        R.busy = ''; render(); return;
      }
    }
    let data;
    try {
      data = await api('', { action: 'start', mode: 'solo' });
    } catch (error) {
      R.error = error.message || 'The raid lobby could not be reached.';
      R.busy = ''; render(); return;
    }
    if (!data || !data.run) {
      R.error = data?.err || 'The raid could not start.';
      R.busy = ''; render(); return;
    }
    // The server may hand back a run that already exists for this account (a lost response, a
    // reopened tab). Its id is the identity the checkpoint is scoped by.
    const reservation = {
      runId: data.run.id,
      seed: data.run.seed,
      startedAt: data.run.startedAt,
      deadlineAt: data.run.deadlineAt,
      rulesVersion: data.run.rulesVersion || data.rulesVersion || '',
      // `run.profile` is the server's own snapshot of this member. The public `run.members` entries
      // carry flat fields and NO `profile`, so reading one from there silently produced a 1,000 HP
      // member; the `members[0].profile` fallback is kept only for a response from an older build.
      member: { id: myId(), name: soloMemberName(data), profile: data.run.profile || data.run.members?.[0]?.profile },
    };
    if (['cleared', 'failed'].includes(data.run.state)) {
      // The server already considers this run over: adopt and settle it, do not simulate it again.
      R.activeRun = data.run; adoptRun(data.run); R.view = 'results';
      R.busy = ''; await settle(data.run.id); return;
    }
    const run = await solo.begin(reservation);
    R.resumeRunId = run.id;
    R.resumeRulesVersion = reservation.rulesVersion;
    R.busy = '';
    R.soloResumed = false;
    startSoloLoop(run, accountKey);
  }

  // The name the arena shows for you. `account.name` is the authoritative one; the older builds sent
  // no name at all on the account payload, which is why every player read "Adventurer" in the solo
  // HUD. Fall back through the page's own signed-in name before the generic label, so a stale page
  // still greets the right person.
  function soloMemberName(data) {
    const fromRun = (data?.run?.members || []).find(m => Number(m.id) === Number(myId()));
    const candidates = [R.account?.name, fromRun?.name,
      typeof currentUser === 'string' ? currentUser : '', R.account?.username];
    for (const c of candidates) if (typeof c === 'string' && c.trim()) return c.trim().slice(0, 32);
    return 'Adventurer';
  }

  // The local loop. It reads the clock, lets the engine resolve the elapsed cells, mirrors the
  // result into the same renderer co-op uses, and settles once at the end. `every` is 100 ms only
  // because that is a comfortable animation cadence: correctness does not depend on it, which is
  // what lets a backgrounded tab resume identically.
  function startSoloLoop(run, accountKey) {
    const solo = globalThis.PGRaidSolo;
    R.soloRunning = true;
    stopPolling(); // there is no room to poll for a local run
    R.activeRun = null;
    R.view = 'arena';
    R.result = null;
    R.lastResultId = '';
    adoptRun(solo.snapshotSync(run));
    R.solo = run;
    if (typeof R.soloStop === 'function') { try { R.soloStop(); } catch {} }
    R.soloStop = solo.loop(run, {
      every: 100,
      accountKey,
      serverOffset: num(R.serverOffset, 0),
      onFrame: (local, snap) => {
        // `R.solo` is the live engine run (what input mutates); `R.run` is the snapshot the renderer
        // and the HUD read. Keeping both in one place is what stops a frame from drawing a stale run.
        R.solo = local;
        try { adoptRun(snap || local); } catch (error) { console.error('Solo frame failed', error); }
      },
      onEnd: async (local) => {
        R.soloStop = null;
        R.soloRunning = false;
        R.solo = null;
        R.lastLocalRun = local;
        // Persist the terminal state once so a reload that races the settle still shows the result
        // instead of starting a new run.
        solo.saveCheckpoint(local, accountKey);
        const snapshot = solo.snapshotSync(local, local.finishedAt || local.updatedAt);
        try { adoptRun(snapshot); } catch (error) { console.error('Solo end failed', error); }
        await settle(local.id, local);
      },
      onError: (error) => { R.error = error.message || 'The solo run hit an error.'; },
    });
  }

  // The solo claim: what the LOCAL run reached, in the only shape the server accepts. It carries no
  // reward amount -- the server pays its own tables and clamps the contribution to what this run could
  // physically have produced. `result` is only attached for a run the server reserved with
  // `local: true`; a co-op settle sends nothing extra and the room's snapshot speaks for it.
  function soloClaim(run) {
    if (!run) return null;
    return {
      outcome: run.state === 'cleared' ? 'clear' : 'failed',
      finishedAt: Math.round(run.finishedAt || run.updatedAt),
      damage: Math.round(num(run.members?.[0]?.damage)),
      support: Math.round(num(run.members?.[0]?.support)),
      actions: Math.round(num(run.members?.[0]?.actions)),
    };
  }

  async function settle(runId, localRun = null) {
    if (!runId || R.settling || (R.result && R.result.acknowledged !== false)) return;
    R.settling = true;
    try {
      const claim = localRun ? soloClaim(localRun) : null;
      const data = await api('', claim ? { action: 'settle', runId, result: claim } : { action: 'settle', runId });
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
        await startSoloRun();
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
      } else if (action === 'revive') {
        const target = (R.run?.members || []).find(m => m.downed && m.id !== myId());
        if (target) await sendPaid('revive', { targetId: target.id });
      } else if (action === 'portal') {
        await sendPaid('interact', { targetId: 'portal' });
      } else if (action === 'leave') {
        close();
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

  function newActionId() {
    return 'raid:' + (globalThis.crypto?.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));
  }

  // Paid interactions are receipted by the server: it stores the action id and replays the first
  // result, so a retry after a lost response can never revive twice or open a portal twice.
  async function sendPaid(kind, extra = {}) {
    const run = R.run;
    if (!run || run.state !== 'active') return null;
    const key = kind + ':' + (extra.targetId || '');
    const actionId = actionIdFor(key);
    // Solo: the paid action is applied to the LOCAL run by the shared engine. It still goes through
    // `applyRaidAction`, so the receipt/cooldown/range rules are the same ones the room applies; what
    // changes is only where the call is made. No request leaves the tab.
    if (R.solo) {
      try {
        const result = await globalThis.PGRaidSolo.act(R.solo, kind, { ...extra, actionId, at: R.solo.updatedAt });
        R.pending.delete(key);
        if (result && result.run) adoptRun(globalThis.PGRaidSolo.snapshotSync(result.run, result.run.updatedAt));
        return result;
      } catch (error) {
        R.error = error.message || 'That action could not be applied.';
        render();
        return null;
      }
    }
    try {
      const data = await api('', { action: 'act', runId: run.id, combatAction: kind, actionId, ...extra });
      if (data.run) adoptRun(data.run);
      R.pending.delete(key);
      if (data.settlement) {
        R.result = data.settlement; R.rewardRows = data.settlement.rewards || []; R.view = 'results';
        render();
      }
      return data;
    } catch (error) {
      // Keep the action id: the receipt is what makes the retry safe.
      R.error = error.message || 'No response from the room. Retry the same action.';
      render();
      return null;
    }
  }

  // A destination intent. Deliberately fire-and-forget: a refused move (the server's 220 ms floor) is
  // not something to show the player, and the next destination supersedes it anyway.
  function sendMove(x, z) {
    const run = R.run;
    if (!run || run.state !== 'active') return;
    const at = globalThis.PGRaidDungeon ? globalThis.PGRaidDungeon.serverNow() : Date.now();
    if (at - num(R.lastMoveSentAt) < 200) return;
    R.lastMoveSentAt = at;
    if (R.solo) {
      // A local destination intent. The engine's own floor and stale-ordering rules still apply.
      globalThis.PGRaidSolo.act(R.solo, 'move', { x, z, actionId: newActionId(), at: R.solo.updatedAt })
        .catch(error => { R.error = error.message || 'That move could not be applied.'; });
      return;
    }
    api('', { action: 'act', runId: run.id, combatAction: 'move', actionId: newActionId(), x, z })
      .then(data => { if (data && data.run) adoptRun(data.run); })
      .catch(() => {});
  }
  function sendFocus(targetId) {
    const run = R.run;
    if (!run || run.state !== 'active' || !targetId) return;
    if (R.solo) {
      globalThis.PGRaidSolo.act(R.solo, 'focus', { targetId, actionId: newActionId(), at: R.solo.updatedAt })
        .catch(error => { R.error = error.message || 'That target could not be selected.'; });
      return;
    }
    api('', { action: 'act', runId: run.id, combatAction: 'focus', actionId: newActionId(), targetId })
      .then(data => { if (data && data.run) adoptRun(data.run); })
      .catch(() => {});
  }

  function tick() {
    if (!R.open) return;
    if (R.run && R.view === 'arena') paintArenaHud(R.run);
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
    syncOverlayToRun();
    const a = R.account || {};
    setText('raidEntries', (num(a.entriesLeft)) + ' / 2 entries');
    const conn = $('raidConn');
    if (conn) {
      const online = typeof navigator === 'undefined' || navigator.onLine !== false;
      conn.textContent = online ? (R.lastSync && Date.now() - R.lastSync < 60000 ? 'Room linked' : 'Room ready') : 'Offline';
      conn.classList.toggle('bad', !online);
    }
    if (R.view === 'results') body.innerHTML = renderResults();
    else if (R.view === 'arena' || (R.run && R.run.state === 'active')) {
      // Keep the run panel alive across updates instead of rewriting the whole body: a rewrite
      // would restart every avatar canvas and drop keyboard focus.
      if (R.run && body.querySelector('#raidRunClock')) { syncArena(); return; }
      R.arenaKey = '';
      body.innerHTML = R.run ? renderArena() : renderLobby();
      if (R.run) syncArena();
    }
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
      <p class="raid-muted">Stars are permanent weapon upgrades: +2% ATK in every zone and +1.5% defence penetration against Thanatos and shielded enemies per star (penetration caps at their 16% armour). A failed forge never removes a star.</p>
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
          <div class="raid-eyebrow">Four stages · one dungeon</div>
          <h3 class="raid-h">Walk to Thanatos.</h3>
          <p class="raid-muted">The Starlit Approach, the Fallen Arcade, the Runic Observatory, then Thanatos's Sanctuary. Your character keeps their real gear, class skills and automatic combat: you choose where to stand and what to hit. Every stage has one telegraphed mechanic, and the boss has three — a cone you step out of, a cataclysm you shelter from in the marked ward, and a ritual you interrupt by killing its sources. A full run takes about seven minutes.</p>
          <div class="raid-stages">${['Starlit Approach','Fallen Arcade','Runic Observatory',"Thanatos's Sanctuary"].map((name, i) => `<div class="raid-stage"><span>${i + 1}</span><b>${name}</b><small>${['Clear the packs', 'Break the rift anchors', 'Stop the ritual', 'Defeat Thanatos'][i]}</small></div>`).join('')}</div>
          <div class="raid-note" style="margin-top:10px">Solo or with two or three adventurers. Enemy health is scaled from the party's measured damage, and incoming damage is never multiplied by party size, so a solo run needs no second player, no simultaneous switches and no dedicated healer.</div>
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
              <canvas id="raidAv${i}" class="raid-avatar" width="42" height="48" data-class="${esc(m.cls || 'Novice')}" data-sex="${esc(m.sex || 'm')}"></canvas>
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
        <div class="raid-eyebrow">Earned, never sold · unchanged rules</div>
        <p class="raid-note">Rewards are settled on the server and applied to your save through the existing grant queue: a full clear pays its own ledger row plus a fractured chest, and a failed run still pays a pity chest. Your first clear unlocks the Rift Aura, and qualifying clears unlock four Rift titles in the Mastery Index (filter: Rift Raid). Entries stay at two per day (00:00 Malaysia time). No Cash Shop item is involved, and this update does not change the economy, the card collection or the forge.</p>
      </section>`;
  }

  function hpBar(hp, max) {
    return `<div class="raid-bar hp"><i style="width:${pct(hp, max)}%"></i></div>`;
  }

  // ---- the run view -----------------------------------------------------------------------------
  // The dungeon is drawn by the game itself; this panel is the run's *frame*: which stage, what the
  // objective is, the party, and the two interactions a stage can ask for. It never draws the fight.
  const STAGE_TIPS = [
    'Walk the bridge, clear every pack, then take the exit portal. One wide sweep is telegraphed: step out of the marked strip.',
    'Two rift anchors shield the guards and heal them. Kill both anchors first, then finish the pack.',
    'The ritual sources are the priority: kill them before the channel ends. If the ritual completes, the whole circle is hit.',
    'Thanatos. Leave the cone before it fires, stand in the ward for the cataclysm, and kill the ritual sources.',
  ];

  // The host is the game's own frame. The renderer mounts on the same scene/camera/canvas/hero and the
  // field's own objects are hidden (index.html) rather than rebuilt, so the map is restored untouched.
  function dungeonHooks() {
    const f = globalThis.PGField;
    if (!f) return null;
    try {
      return {
        scene: f.scene && f.scene(), camera: f.camera && f.camera(), canvas: f.canvas && f.canvas(),
        player: f.player && f.player(),
      };
    } catch { return null; }
  }

  function objectiveOf(run) {
    const summary = run.summary || {};
    if (run.stageCleared) return 'Exit portal open';
    if ((run.enemies || []).some(e => e.kind === 'boss')) return 'Defeat Thanatos';
    const left = num(summary.requiredAlive, 0);
    return left + ' enem' + (left === 1 ? 'y' : 'ies') + ' left';
  }

  function renderArena() {
    const run = R.run;
    if (!run) return renderLobby();
    const mine = (run.members || []).find(m => m.id === myId()) || null;
    const downed = (run.members || []).filter(m => m.downed);
    const stage = num(run.stageIndex, 0);
    const tip = STAGE_TIPS[clamp(stage, 0, 3)] || '';
    const left = Math.max(0, num(run.stageEndsAt) - serverNow());
    return `<div id="raidErrorSlot">${errorBox()}</div>
      <div class="raid-runbar">
        <div class="raid-runbar-stage"><span class="raid-eyebrow">Stage ${stage + 1} of 4</span><b>${esc(run.stageName || '')}</b><small>${esc(objectiveOf(run))}</small></div>
        <div class="raid-runbar-clock ${left < 30000 ? 'low' : ''}" id="raidRunClock">${clock(left)}</div>
      </div>
      <p class="raid-note">${esc(tip)}</p>
      <div class="raid-party">${(run.members || []).map(m => {
        const p = pct(m.hp, m.maxHp);
        const reviving = m.downed && m.reviveProgress > 0;
        return `<article class="raid-pcard ${m.downed ? 'down' : ''} ${m.id === myId() ? 'you' : ''}">
          <div class="phead"><canvas class="raid-avatar" width="38" height="44" data-class="${esc(m.cls || 'Novice')}" data-sex="${esc(m.sex || 'm')}"></canvas>
            <div><div class="pname">${esc(m.name || '')}${m.id === myId() ? ' · you' : ''}</div>
            <div class="pmeta">${esc(m.cls || 'Adventurer')} · ${m.magic ? 'MATK' : 'ATK'} ${fmt(m.dps)}</div></div></div>
          ${hpBar(m.hp, m.maxHp)}
          <div class="raid-row" style="justify-content:space-between"><small>${m.downed ? (reviving ? 'Reviving ' + Math.round(m.reviveProgress * 100) + '%' : 'Downed · needs a living teammate') : fmt(m.hp) + ' / ' + fmt(m.maxHp)}</small><small>${Math.round(p)}%</small></div>
        </article>`;
      }).join('')}</div>
      <div class="raid-row" style="margin-top:10px">
        ${run.stageCleared ? `<button class="raid-btn primary" data-raid-action="portal">Enter the exit portal</button>` : `<span class="raid-note">The exit unlocks when every required enemy in this stage is defeated.</span>`}
        ${downed.length && mine && !mine.downed ? `<button class="raid-btn danger" data-raid-action="revive">Revive ${esc(downed[0].name || 'teammate')}</button>` : ''}
        <button class="raid-btn ghost small" data-raid-action="leave">Close panel</button>
      </div>
      <p class="raid-note" style="margin-top:8px">Stepping out hides this panel but does not leave the run: your character keeps fighting on the field, and the HUD stays on screen. Tap the ground to move, tap an enemy to focus, and use the Resume button to come back here.</p>`;
  }

  function paintArenaHud(run) {
    if (!run) return;
    const clockEl = $('raidRunClock');
    if (clockEl) {
      const left = Math.max(0, num(run.stageEndsAt) - serverNow());
      clockEl.textContent = clock(left);
      clockEl.classList.toggle('low', left < 30000);
    }
  }

  function syncArena() {
    // The run panel is rebuilt only when a visible fact changed; the field HUD is repainted by the
    // renderer every ~180 ms from the same snapshot, so there is nothing to do at 60 fps here.
    const body = $('raidBody');
    if (!body) return;
    const key = [R.run?.id, R.run?.stageIndex, R.run?.stageCleared, (R.run?.members || []).map(m => m.downed ? 1 : 0).join('')].join(':');
    if (R.arenaKey === key) { paintArenaHud(R.run); return; }
    R.arenaKey = key;
    body.innerHTML = renderArena();
    for (const canvas of body.querySelectorAll('canvas[data-class]')) {
      try { if (typeof drawSkinPreview === 'function') drawSkinPreview(canvas.id, null, canvas.dataset.class, canvas.dataset.sex || 'm'); } catch {}
    }
  }

  function rewardText(row) {
    // A chest row carries its roll under `rewards`; the API flattens it, but reading both shapes here
    // means an older cached response still renders its real numbers instead of "Recorded".
    const paid = row && row.rewards && typeof row.rewards === 'object' ? row.rewards : row;
    const bits = [];
    if (num(paid.riftShards)) bits.push(fmt(paid.riftShards) + ' Rift Shards');
    if (num(paid.sigils)) bits.push(fmt(paid.sigils) + " Valkyrie's Sigils");
    if (num(paid.regionalMaterials)) bits.push(fmt(paid.regionalMaterials) + ' Astral Shards');
    if (num(paid.zeny)) bits.push(fmt(paid.zeny) + ' Zeny');
    return bits.join(' · ') || 'Recorded';
  }

  function rewardStageName(index) {
    const names = ['the Starlit Approach', 'the Fallen Arcade', 'the Runic Observatory', "Thanatos's Sanctuary"];
    return names[clamp(num(index), 0, 3)] || 'the dungeon';
  }

  function renderResults() {
    const r = R.result || {};
    const rows = R.rewardRows.length ? R.rewardRows : (r.rewards || []);
    const cards = Array.isArray(r.cards) ? r.cards : [];
    const cleared = r.outcome === 'clear' || r.outcomeState === 'cleared';
    return `${errorBox()}<section class="raid-panel raid-results">
      <div class="raid-eyebrow">${cleared ? 'Dungeon cleared' : 'Run ended'}</div>
      <div class="big">${cleared ? 'Thanatos falls.' : 'The sanctuary holds.'}</div>
      <p class="raid-muted">${cleared
        ? 'All four stages cleared and settled. Your first clear also unlocks the Rift Aura; the Rift Raid filter in the Mastery Index lists the earned titles.'
        : `The run ended on ${esc(rewardStageName(r.stageIndex))}. A pity chest is still paid, and your entries are not refunded.`} ${r.acknowledged === false ? 'The room has not acknowledged the result yet; retry settlement to release it.' : ''}</p>
      <div class="raid-rewards">${rows.map(row => `<div class="raid-reward"><small>${esc(row.kind || 'reward')}</small><b>${esc(rewardText(row))}</b></div>`).join('') || '<div class="raid-reward">Rewards are applied to your save through the grant queue.</div>'}${cards.map(card => `<div class="raid-reward" style="border-color:#8b6a3a"><small>${esc(card.kind)} card</small><b>${esc(card.name || cardName(card.cardKey))}</b></div>`).join('')}</div>
      <div class="raid-row" style="justify-content:center"><button class="raid-btn primary" data-raid-action="lobby">Return to lobby</button>${r.acknowledged === false ? '<button class="raid-btn" data-raid-action="settle">Retry settlement</button>' : ''}</div>
    </section>`;
  }

  globalThis.PGRaid = {
    open, close, refresh, receive, receiveParty, api, settle,
    // Called by the dungeon renderer for the two inputs it owns. Both are intents the server
    // validates; neither carries a result.
    move: sendMove,
    focus: sendFocus,
    revive: () => { const target = (R.run?.members || []).find(m => m.downed && m.id !== myId()); return target ? sendPaid('revive', { targetId: target.id }) : null; },
    portal: () => sendPaid('interact', { targetId: 'portal' }),
    get state() { return R; },
    get inRun() { return R.inRun; },
    // Test/handoff hooks; the browser UI never calls these directly.
    _render: render,
    _adopt: adoptRun,
    _poll: pollRun,
    _stop: stopPolling,
  };
})();
