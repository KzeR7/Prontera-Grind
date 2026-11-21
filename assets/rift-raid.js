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
    // Entry-screen state: which rift map is selected, and whether the party seats are showing.
    entryRaid: 'thanatos', entryMode: 'solo',
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
    #raidOverlay{position:fixed;inset:0;z-index:260;display:flex;align-items:flex-start;justify-content:center;background:radial-gradient(circle at 50% 0%,#20343a 0,#091113 58%,#040809 100%);color:#f0e8d2;overflow-y:auto;overflow-x:hidden;-webkit-overflow-scrolling:touch}
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
    /* ---------------------------------------------------------------- entry screen ----
       Ragnarok Origin's dungeon window, and every mobile MMO of its shape, reads the same way:
       a column of destinations on the left, the selected destination's detail (what you will
       fight, what it does, what you get) on the right, and the actions that start it pinned to
       the bottom. The old screen was two prose columns with the map names as four square chips
       and the start buttons buried under a paragraph. This is that layout done properly:
       three zones, one visual hierarchy, and the start buttons always at the bottom edge. */
    .raid-entry{display:grid;grid-template-columns:minmax(214px,268px) minmax(0,1fr);grid-template-rows:minmax(0,1fr) auto;gap:10px;min-height:0;flex:1}
    .raid-maps{grid-row:1;display:flex;flex-direction:column;gap:7px;min-height:0}
    .raid-maps-head{display:flex;align-items:baseline;gap:8px;padding:0 2px 4px}
    .raid-maps-head b{font:700 12px/1 ui-monospace,monospace;letter-spacing:.16em;text-transform:uppercase;color:#8fb0aa}
    .raid-map-list{display:flex;flex-direction:column;gap:7px;overflow:auto;padding-right:2px;min-height:0}
    .raid-map{display:grid;grid-template-columns:44px minmax(0,1fr);gap:10px;align-items:center;padding:9px 10px;
      border:1px solid #33504a;border-radius:11px;background:linear-gradient(180deg,#132523,#0c1718);cursor:pointer;
      text-align:left;color:inherit;font:inherit;transition:border-color .14s,transform .14s,background .14s}
    .raid-map:hover{border-color:#5c8f84}
    .raid-map:focus-visible{outline:2px solid var(--focus,#e9d39a);outline-offset:2px}
    .raid-map[aria-pressed="true"]{border-color:#d5b06e;background:linear-gradient(180deg,#23322c,#15201d);box-shadow:0 0 0 1px #d5b06e55 inset}
    .raid-map .ico{width:44px;height:44px;border-radius:9px;display:grid;place-items:center;font-size:19px;
      background:radial-gradient(circle at 50% 30%,#3b5a63,#101d22);border:1px solid #3f5f58;color:#cfe6df}
    .raid-map .txt{min-width:0;display:flex;flex-direction:column;gap:2px;align-items:flex-start}
    .raid-map .no{font:700 10px/1 ui-monospace,monospace;color:#8fb0aa;letter-spacing:.14em;white-space:nowrap}
    .raid-map .nm{font:700 13px/1.25 Georgia,serif;color:#f2e6c4;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%}
    .raid-map .ob{font-size:11px;color:#9db6b1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%}
    .raid-map[data-locked="1"]{opacity:.55;cursor:not-allowed}

    .raid-detail{grid-row:1;display:flex;flex-direction:column;gap:9px;min-height:0;overflow:auto;padding-right:2px}
    .raid-hero{position:relative;border-radius:14px;overflow:hidden;border:1px solid #3d5a53;background:
      radial-gradient(120% 100% at 78% 18%,#2c4a52 0,#101d24 46%,#080f13 100%);padding:14px 15px 13px}
    .raid-hero::after{content:"";position:absolute;inset:0;background:
      repeating-linear-gradient(115deg,#ffffff05 0 2px,transparent 2px 7px);pointer-events:none}
    .raid-hero .kicker{font:700 10px/1 ui-monospace,monospace;letter-spacing:.2em;text-transform:uppercase;color:#8fb0aa}
    .raid-hero h3{margin:5px 0 4px;font:700 clamp(19px,3.4vw,25px)/1.1 Georgia,serif;color:#f6e7c0}
    .raid-hero p{margin:0;font-size:12.5px;line-height:1.5;color:#b9cec9;max-width:62ch}
    .raid-hero .mech{margin-top:9px;display:flex;flex-wrap:wrap;gap:6px}
    .raid-chip{font-size:11px;padding:4px 9px;border-radius:99px;border:1px solid #3b5a66;background:#0d1b22;color:#a9c6d2}
    .raid-chip.bad{border-color:#8d4a44;background:#1e0d0e;color:#f0b7ac}
    .raid-chip.warn{border-color:#9a6c3a;background:#241a0c;color:#f0c27a}

    .raid-foes{display:grid;grid-template-columns:repeat(auto-fill,minmax(186px,1fr));gap:7px;align-items:start}
    .raid-foe{display:flex;align-items:center;gap:8px;padding:7px 8px;border-radius:10px;border:1px solid #2f4b47;background:#0b1517;min-width:0}
    .raid-foe.boss{border-color:#9a6c3a;background:linear-gradient(180deg,#241a0c,#160f07);grid-column:span 2}
    /* The sheets are not a sprite grid the way the dungeon's atlas reader assumed: each 512x512 file
       holds one ~76x128 monster at roughly x224-300 / y281-410, not a 64x32 cell at the origin.
       Cropping that box (scale 512/78 vertically keeps it undistorted) is what makes the portrait
       show the actual mob instead of an empty square. */
    .raid-foe .port{width:38px;height:64px;flex:none;image-rendering:pixelated;background-repeat:no-repeat;
      background-size:249.4px 249.4px;background-position:-109.1px -136.9px;border-radius:5px;background-color:#0a1216}
    .raid-foe .foe-txt{min-width:0;flex:1 1 auto}
    .raid-foe .fn{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .raid-foe .fn{font-size:11.5px;font-weight:700;color:#e7efe9;line-height:1.2}
    .raid-foe .fk{font:700 9px/1.3 ui-monospace,monospace;letter-spacing:.12em;text-transform:uppercase;color:#8fb0aa}
    .raid-foe.boss .fk{color:#f0c27a}
    .raid-foe .fh{margin-top:3px;height:3px;border-radius:2px;background:#20302f;overflow:hidden}
    .raid-foe .fh i{display:block;height:100%;background:#c9593f}

    .raid-legend{display:flex;flex-wrap:wrap;gap:10px;font-size:11.5px;color:#9db6b1}
    .raid-legend div{display:flex;align-items:center;gap:5px}
    .raid-legend kbd{font:700 10px/1 ui-monospace,monospace;background:#152a2a;border:1px solid #3d5f58;border-bottom-width:2px;
      border-radius:5px;padding:3px 5px;color:#dfeee8}

    /* The bottom bar: the two ways into the dungeon, and the party preview when party is chosen. */
    .raid-launch{grid-column:1/-1;grid-row:2;display:flex;flex-direction:column;gap:8px;
      border-top:1px solid #2f4a45;padding-top:10px}
    .raid-slots{display:none;gap:8px;align-items:stretch}
    .raid-slots[data-on="1"]{display:flex}
    .raid-slot{flex:1 1 0;min-width:0;display:flex;align-items:center;gap:9px;padding:8px 10px;border-radius:11px;
      border:1px dashed #40615a;background:#0a1416}
    .raid-slot.filled{border-style:solid;border-color:#d5b06e55;background:linear-gradient(180deg,#1a2823,#101a18)}
    .raid-slot .av{width:38px;height:43px;border-radius:8px;display:grid;place-items:center;flex:none;
      background:radial-gradient(circle at 50% 35%,#2e4a52,#0d181b);border:1px solid #3d5a53;font-size:15px;color:#8fb0aa}
    .raid-slot .nm{font-size:12px;font-weight:700;color:#eee6d0;line-height:1.25;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .raid-slot .sub{font:700 9.5px/1.3 ui-monospace,monospace;letter-spacing:.1em;text-transform:uppercase;color:#8fb0aa}
    .raid-slot .sub.ok{color:#9adaa8}
    .raid-slot .sub.hot{color:#f0c27a}
    .raid-slot .st{margin-left:auto;font:700 9.5px/1.2 ui-monospace,monospace;letter-spacing:.1em;text-transform:uppercase;color:#8fb0aa;text-align:right}
    .raid-launch-row{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
    .raid-launch-row .raid-btn{min-height:46px;font-size:13.5px;padding:0 18px}
    .raid-launch-note{font-size:11.5px;color:#9db6b1;margin-left:auto}
    /* Phone: the three zones stack and each one sizes to its content. Naming the rows explicitly is
       what was missing - with only 'auto auto auto' the detail panel (row 1 in the desktop grid)
       collapsed and the whole screen went blank below the map strip. */
    @media(max-width:760px){
      .raid-entry{display:flex;flex-direction:column;flex:0 0 auto;gap:9px}
      .raid-maps,.raid-detail{display:flex;flex-direction:column;gap:8px;overflow:visible}
      .raid-map-list{flex-direction:row;overflow-x:auto;overflow-y:hidden;padding-bottom:4px}
      .raid-map{min-width:196px;flex:none}
      .raid-hero{padding:12px}
      .raid-hero p{font-size:12px}
      .raid-legend{display:none}
      .raid-launch{display:block}
      .raid-launch-row{flex-direction:column;align-items:stretch}
      .raid-launch-row .raid-btn{width:100%;flex:none}
      .raid-launch-note{margin-left:0;order:9;text-align:center}
      .raid-slots{flex-direction:column}
      .raid-foes{grid-template-columns:repeat(2,minmax(0,1fr))}
      .raid-foe.boss{grid-column:span 2}
    }
    @media(max-width:520px){
      .raid-slots{flex-direction:column}
    }
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
    /* The brief: during a raid, nothing but the raid. Every field layer that can paint over the
       dungeon is listed here rather than discovered one at a time, so a future field panel is only
       a problem if someone adds it without reading this rule. */
    body.raid-fighting #eclipseHeader,body.raid-fighting #hud,body.raid-fighting #dock,
    body.raid-fighting #xp-dock,body.raid-fighting #hudBuffs,body.raid-fighting #heroTitle,
    body.raid-fighting #comboFieldStatus,body.raid-fighting #tag,body.raid-fighting #prog,
    body.raid-fighting #tooltip,body.raid-fighting #toast,body.raid-fighting #xp-dock,
    body.raid-fighting #wins,body.raid-fighting #welcomePanel,body.raid-fighting #offlineCard,
    body.raid-fighting #adventureGuide,body.raid-fighting #eventBanner,body.raid-fighting #guildBar,
    body.raid-fighting #socialDock,body.raid-fighting #pgDock,body.raid-fighting .eclipse-toast,
    body.raid-fighting #activityTicker,body.raid-fighting #pgQuest,body.raid-fighting #dailyCard,
    body.raid-fighting #mailCard,body.raid-fighting #rouletteCard{display:none!important}
    /* Whatever is left of the field's own chrome must not sit on top of the arena: the raid layer
       is above it, and the canvas keeps pointer events for movement. */
    body.raid-fighting #raidHudLayer{pointer-events:none}
    body.raid-fighting #raidHudLayer .raid-hud-exit{position:absolute;right:10px;top:12px;min-width:56px;min-height:40px;
      border-radius:10px;border:1px solid #6d7e6b;background:#132422dd;color:#f0e8d2;font:700 12px/1 system-ui,sans-serif;
      letter-spacing:.06em;cursor:pointer;pointer-events:auto}
    body.raid-fighting #raidHudLayer .raid-hud-exit:hover{border-color:#d5b06e;color:#f6e7c0}
    body.raid-fighting #raidHudLayer .raid-hud-exit,
    body.raid-fighting #raidHudLayer [data-raid-action]{pointer-events:auto}
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
      const map = event.target.closest('button[data-raid-map]');
      if (map && !map.disabled) {
        // The map list is a local choice: it changes what the right-hand panel describes, not what
        // the server holds, so it repaints from state instead of refetching the lobby.
        R.entryRaid = map.dataset.raidMap;
        render();
        return;
      }
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
        R.entryMode = 'solo';
        R.busy = 'start';
        await startSoloRun();
      } else if (action === 'start') {
        R.busy = 'start';
        const data = await api('', { action: 'start', mode: 'party' });
        R.activeRun = data.run; adoptRun(data.run); R.view = 'arena'; R.result = null; R.lastResultId = '';
        if (data.run && ['cleared', 'failed'].includes(data.run.state)) await settle(data.run.id);
      } else if (action === 'party') {
        // Pressing Party first reveals the seats (you + two empty slots) so a player can see who is
        // already waiting before joining anything. Pressing it again when a party exists refreshes
        // the roster rather than silently leaving and rejoining.
        R.entryMode = 'party';
        R.busy = 'party';
        const data = await api('', { action: 'party', partyAction: 'join' });
        R.party = data.party; R.view = 'lobby';
        // The lobby reuses the existing plaza socket so another member's ready/start arrives as a
        // room message rather than a polling request.
        if (typeof PGSocial !== 'undefined' && typeof PGSocial.enter === 'function') { try { PGSocial.enter(); } catch {} }
      } else if (action === 'leaveparty') {
        const data = await api('', { action: 'party', partyAction: 'leave' });
        R.party = data.party; R.view = 'lobby'; R.entryMode = 'solo';
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

  // ---------------------------------------------------------------- entry screen data ----
  // Every destination the raid will grow into. Only VARKAS'S RIFT is open today; the rest are shown
  // so the map list reads as a raid browser rather than a single button, and each says plainly that
  // it is not open yet. Nothing here can be started: `open === false` disables the card.
  const RAIDS = Object.freeze([
    Object.freeze({
      key: 'thanatos', no: 'I', name: "Thanatos's Rift", open: true,
      objective: 'Clear the packs', tag: 'OPEN',
      blurb: 'The Astral bridge held by Thanatos. Four stages along one causeway: the Starlit Approach, '
        + 'the Fallen Arcade, the Runic Observatory, then the Sanctuary itself.',
      mechs: [['Sweep', 'warn'], ['Cone', 'bad'], ['Ward', 'warn'], ['Ritual', 'bad']],
      foes: [
        { id: 1702, n: 'Retribution Angel', k: 'Melee', hp: 1 },
        { id: 1705, n: 'Despair Phantom', k: 'Melee', hp: 1 },
        { id: 1700, n: 'Tower Watcher', k: 'Ranged', hp: 1 },
        { id: 1706, n: 'Death Whisperer', k: 'Melee', hp: 1 },
        { id: 1707, n: 'Agony Demon', k: 'Melee', hp: 1 },
        { id: 1708, n: 'Thanatos', k: 'Boss', hp: 1, boss: true },
      ],
      stages: ['Starlit Approach', 'Fallen Arcade', 'Runic Observatory', "Thanatos's Sanctuary"],
    }),
    Object.freeze({ key: 'valkyrie', no: 'II', name: "Valkyrie's Descent", open: false, tag: 'SOON',
      objective: 'Not open yet', blurb: 'A second rift, behind the same two daily entries. Not part of this update.' }),
    Object.freeze({ key: 'abyss', no: 'III', name: 'The Sunken Abyss', open: false, tag: 'SOON',
      objective: 'Not open yet', blurb: 'Drowned halls under the Astral sea. Not part of this update.' }),
  ]);

  function selectedRaid() {
    const want = R.entryRaid || (RAIDS.find(r => r.open) || RAIDS[0]).key;
    return RAIDS.find(r => r.key === want) || RAIDS[0];
  }

  // One enemy portrait per row, using the same mob art the dungeon draws. It is the sprite the
  // player will actually meet, so the preview is the thing itself rather than a stand-in icon.
  function foeRow(foe) {
    // The mob art is a 512x512 sheet: 8 columns of directions by 16 rows of actions, so one pose is a
    // 64x32 cell. Rendering the sheet whole is what made the previews look like coloured smears, so
    // the cell is cropped here and drawn at 2x. Same source the dungeon itself uses.
    return `<div class="raid-foe${foe.boss ? ' boss' : ''}">
      <span class="port" role="img" aria-label="${esc(foe.n)}"
            style="background-image:url(assets/mobs/v1/${num(foe.id)}-0.png)"></span>
      <div class="foe-txt">
        <div class="fk">${esc(foe.k)}</div>
        <div class="fn">${esc(foe.n)}</div>
        <div class="fh"><i style="width:${Math.round(num(foe.hp, 1) * 100)}%"></i></div>
      </div></div>`;
  }

  // The party preview: the player's own slot, then the two empty seats a party raid fills. This is
  // the shape the brief asked for - press Party and you see who is already in and where the others
  // will sit, before anything starts.
  function slotRail(party, members) {
    // You are always the first seat, even before a party exists. Keying purely off the party roster
    // meant pressing Party with no room yet rendered three anonymous "Empty slot" cards - no "you",
    // which is the one thing the preview has to show. When the room does list you, its entry wins
    // (it carries ready/eligible state); otherwise a local stand-in is built from your own save.
    const mine = members.find(m => m.id === myId()) || null;
    const others = members.filter(m => m.id !== myId());
    const you = mine || {
      id: myId(), name: soloMemberName(null), cls: typeof S === 'object' && S ? (S.cls || '') : '',
      ready: false, eligible: R.eligibility ? R.eligibility.eligible !== false : true,
      entriesLeft: R.eligibility?.entriesLeft, _local: true,
    };
    const seats = [you, ...others];
    while (seats.length < 3) seats.push(null);
    return seats.slice(0, 3).map((m, i) => {
      if (!m) {
        return `<div class="raid-slot" aria-label="Empty slot">
          <div class="av" aria-hidden="true">+</div>
          <div style="min-width:0"><div class="nm">Empty slot</div>
          <div class="sub">${party ? 'Waiting for a friend' : 'Form a party to invite'}</div></div>
        </div>`;
      }
      const you = m.id === myId();
      const status = m.ready ? ['Ready', 'ok'] : m.eligible === false ? [esc(m.reason || 'Not eligible'), 'hot'] : ['Not ready', ''];
      return `<div class="raid-slot filled">
        <div class="av" aria-hidden="true">${you ? '★' : '⚔'}</div>
        <div style="min-width:0">
          <div class="nm">${esc(m.name)}${you ? ' · you' : ''}</div>
          <div class="sub">${esc(m.cls || 'No cloud save')}${m.magic ? ' · magic' : ''}</div>
        </div>
        <div class="st"><span class="sub ${status[1]}">${status[0]}</span><br>${m.eligible && m.entriesLeft != null ? num(m.entriesLeft) + ' ent' : ''}</div>
      </div>`;
    }).join('');
  }

  function renderEntryBar(raid, eligible, active) {
    const party = R.party;
    const members = party?.members || [];
    const shown = R.entryMode === 'party';
    const canSolo = raid.open && !active && (R.eligibility ? R.eligibility.eligible === true : true);
    const note = active ? 'You already have an active raid — resume it first.'
      : !raid.open ? 'This rift is not open yet.'
        : !canSolo ? esc(R.eligibility?.reason || 'Both entries for today are used. Reset is 00:00 Malaysia time.')
          : '';
    return `<div class="raid-launch">
      <div class="raid-slots" data-on="${shown ? 1 : 0}" id="raidSlots">${slotRail(party, members)}</div>
      <div class="raid-launch-row">
        <button class="raid-btn primary" data-raid-action="solo" ${canSolo ? '' : 'disabled'}>
          Solo · 1 character</button>
        <button class="raid-btn ${shown ? 'primary' : ''}" data-raid-action="party" ${raid.open && !active ? '' : 'disabled'}>
          ${party ? 'Party · ' + members.length + '/3 ready up' : 'Party · 2–3 players'}</button>
        ${party ? `<button class="raid-btn small" data-raid-action="ready" data-raid-value="${members.some(m => m.id === myId() && m.ready) ? 'off' : 'on'}">
            ${members.some(m => m.id === myId() && m.ready) ? 'Unready' : 'Ready'}</button>
          ${party.isLeader ? `<button class="raid-btn primary small" data-raid-action="start" ${party.canStart ? '' : 'disabled'}>Start dive</button>` : '<span class="raid-tag">Waiting for leader</span>'}
          <button class="raid-btn danger small" data-raid-action="leaveparty">Leave</button>` : ''}
        ${active ? '<button class="raid-btn small primary" data-raid-action="refresh">Resume run</button>' : ''}
        <span class="raid-launch-note">${note}</span>
      </div>
    </div>`;
  }

  function renderLobby() {
    const a = R.account || {};
    const party = R.party;
    const members = party?.members || [];
    const active = R.activeRun;
    const raid = selectedRaid();
    const eligible = active ? false : (R.eligibility ? R.eligibility.eligible === true : a.entriesLeft > 0);
    return `${errorBox()}
      <div class="raid-entry">
        <section class="raid-maps" aria-label="Raid destinations">
          <div class="raid-maps-head"><b>Rift maps</b><span class="raid-tag">${num(a.entriesLeft)}/2 entries</span></div>
          <div class="raid-map-list">
            ${RAIDS.map(r => `<button class="raid-map" type="button" data-raid-map="${esc(r.key)}"
                aria-pressed="${r.key === raid.key ? 'true' : 'false'}" data-locked="${r.open ? 0 : 1}"
                ${r.open ? '' : 'disabled'}>
              <span class="ico" aria-hidden="true">${r.open ? '◈' : '⌛'}</span>
              <span class="txt"><span class="no">${esc(r.no)} · ${esc(r.tag)}</span>
                <span class="nm">${esc(r.name)}</span><span class="ob">${esc(r.objective)}</span></span>
            </button>`).join('')}
          </div>
        </section>

        <section class="raid-detail" aria-label="Selected raid">
          <div class="raid-hero">
            <div class="kicker">${esc(raid.no)} · ${esc(raid.tag)}</div>
            <h3>${esc(raid.name)}</h3>
            <p>${esc(raid.blurb)}</p>
            ${raid.open ? `<div class="mech">${raid.mechs.map(([m, k]) => `<span class="raid-chip ${k}">${esc(m)}</span>`).join('')}
              <span class="raid-chip">~7 min</span><span class="raid-chip">2 entries / day</span></div>` : ''}
          </div>
          ${raid.open ? `<div class="raid-foes">${raid.foes.map(foeRow).join('')}</div>
          <div class="raid-legend">
            <div><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> walk</div>
            <div>tap a mob to focus · automatic attacks</div>
            <div>step out of red, into amber</div>
          </div>` : `<p class="raid-muted">${esc(raid.blurb)}</p>`}
        </section>

        ${renderEntryBar(raid, eligible, active)}
      </div>
      ${renderForge()}
      ${renderCards()}`;
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
