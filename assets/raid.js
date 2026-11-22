/* Raid Dungeons — Solo (<10m) & Real-Player Party (<15m) Co-op Raid Mode
 * Supports Astral Citadel (Map 10, Memory of Thanatos) & Thor Volcano (Map 11, Ifrit),
 * plus previewing future Raid Dungeons inside Map -> Dungeons.
 * Features active stage bombardments, 6-shape boss mechanics including the whole-floor
 * Pillar Line-of-Sight wipe ("Oblivion Extinction" / "Cataclysmic Eruption"),
 * elevated boss threat, WASD/click + DODGE evasion, resizable live Raid Chat,
 * Party Ready Room with character previews, party-only revive,
 * and an End-of-Raid Commendation & Loot Showcase Popup.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(root);
  else root.PGRaid = factory(root);
})(typeof globalThis !== 'undefined' ? globalThis : window, function (root) {
  'use strict';

  var DUNGEONS = {
    astral: {
      id: 'astral',
      mapId: 10,
      name: 'Astral Citadel',
      bossName: 'Memory of Thanatos',
      matIdx: 0,
      matName: 'Astral Shards',
      img: 'assets/atlas/astral-citadel.png?v=156',
      banner: 'assets/endgame/textures/astral-sky-plate-a4db60a4cc7a.webp',
      comingSoon: false,
      stages: [
        { idx: 0, astralStage: 1, name: 'Starlit Approach', desc: 'Retribution Angels & Despair Phantoms under Starfall bombardment', boss: false },
        { idx: 1, astralStage: 2, name: 'Fallen Arcade', desc: 'Despair Phantoms & Tower Watchers under Oblivion Beams', boss: false },
        { idx: 2, astralStage: 3, name: 'Runic Observatory', desc: 'Tower Watchers, Death Whisperers & Agony Demon wardens', boss: false },
        { idx: 3, astralStage: 5, name: 'Sanctuary of Thanatos', desc: 'Memory of Thanatos — 6-mechanic raid encounter', boss: true }
      ]
    },
    thor: {
      id: 'thor',
      mapId: 11,
      name: 'Thor Volcano',
      bossName: 'Ifrit',
      matIdx: 1,
      matName: 'Primal Catalysts',
      img: 'assets/atlas/thor-volcano.png?v=162',
      banner: 'assets/atlas/thor-volcano.png?v=162',
      comingSoon: false,
      stages: [
        { idx: 0, astralStage: 1, name: 'Molten Approach', desc: 'Magma Slags & Fire Imps under Pyroclasm bombardment', boss: false },
        { idx: 1, astralStage: 2, name: 'Basalt Forge', desc: 'Fire Imps & Kasas under Tectonic Beams', boss: false },
        { idx: 2, astralStage: 3, name: 'Magma Conduit', desc: 'Salamanders & Obsidian Golem wardens', boss: false },
        { idx: 3, astralStage: 5, name: 'Sanctum of Ifrit', desc: 'Ifrit, Volcano Lord — 6-mechanic raid encounter', boss: true }
      ]
    },
    abyss: {
      id: 'abyss',
      mapId: null,
      name: 'Niflheim Abyssal Sanctum',
      bossName: 'Lord of Death',
      matIdx: 2,
      matName: 'Abyssal Relics',
      img: 'assets/world-map/cutout/niflheim.png?v=283',
      banner: 'assets/world-map/cutout/niflheim.png?v=283',
      comingSoon: true,
      stages: [
        { idx: 0, astralStage: 1, name: 'Wailing Gates', desc: 'Ghost Hounds & Banshees in freezing mist', boss: false },
        { idx: 1, astralStage: 2, name: 'Soul Catacombs', desc: 'Death Knights & Soul Eaters', boss: false },
        { idx: 2, astralStage: 3, name: 'Cursed Reliquary', desc: 'Abyss Knights & Doom Wardens', boss: false },
        { idx: 3, astralStage: 5, name: 'Throne of the Dead', desc: 'Lord of Death — Coming in a future update', boss: true }
      ]
    }
  };

  var STAGES = DUNGEONS.astral.stages;

  var SOLO_LIMIT_S = 600;     // 10 minutes
  var PARTY_LIMIT_S = 900;    // 15 minutes
  var DAILY_LIMIT = 2;
  var MAX_PARTY_REVIVES = 3;
  var REVIVE_CHANNEL_S = 3.0;
  var DODGE_CD_S = 3.5;
  var DODGE_IFRAME_S = 0.75;
  var DODGE_DIST = 5.6;
  var SYNC_INTERVAL_S = 2.0;

  // Tuned from real 4th-job combat benchmarks:
  // Solo clears in ~4m10s–9m35s (<10m); 2-3p Party clears in ~7m–11m (<15m).
  var TRASH_CAMP_LIMIT = 8;
  var BOSS_HP_MULT = 2.2;
  var ESCORT_HP_MULT = 1.4;
  var BOSS_ATK_MULT = 2.35;
  var ESCORT_ATK_MULT = 1.55;
  var BOSS_CLEAVE_INTERVAL_S = 2.5;
  var BOSS_CLEAVE_PCT = 0.16;

  var REWARDS = {
    solo:  { shards: 20, sigils: 0, zeny: 500000, echo: 100 },
    party: { shards: 30, sigils: 1, zeny: 750000, echo: 150 },
    fail:  { shards: 5,  sigils: 0, zeny: 0,      echo: 0 }
  };

  var CHAT_PRESETS = [
    { label: 'S', w: 256, h: 168 },
    { label: 'M', w: 320, h: 228 },
    { label: 'L', w: 430, h: 326 }
  ];

  var SUPPORT_CLASS_RE = /arch bishop|cardinal|royal guard|imperial guard|maestro|wanderer|troubadour|trouvere|sorcerer|elemental master|genetic|biolo|soul ascetic|priest|high priest|paladin/i;

  function loadSavedChatSize() {
    try {
      if (typeof localStorage !== 'undefined') {
        var raw = localStorage.getItem('pg_raid_chat_size');
        if (raw) {
          var parsed = JSON.parse(raw);
          if (parsed && Number.isFinite(parsed.w) && Number.isFinite(parsed.h)) {
            return {
              w: Math.max(220, Math.min(580, Math.round(parsed.w))),
              h: Math.max(148, Math.min(440, Math.round(parsed.h)))
            };
          }
        }
      }
    } catch (_) {}
    return { w: 310, h: 220 };
  }

  function saveChatSize(w, h) {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('pg_raid_chat_size', JSON.stringify({ w: w, h: h }));
      }
    } catch (_) {}
  }

  var raid = {
    on: false,
    _internalNav: false,
    dungeonId: 'astral',   // 'astral' | 'thor'
    mode: 'solo',          // 'solo' | 'party'
    raidId: '',
    seed: 1,
    stage: 0,              // 0..3
    startedAt: 0,
    elapsed: 0,
    limit: SOLO_LIMIT_S,
    dmg0: 0,
    dmgTaken: 0,
    supportScore: 0,
    revivesDone: 0,
    lastHp: 0,
    dodgeCd: 0,
    iframes: 0,
    dead: false,
    revivesLeft: 0,
    reviving: null,        // { targetId, targetName, left }
    telegraph: null,       // active boss or bridge hazard
    voidPools: [],         // [{ x, z, r, left, tick }] lingering anti-ranged burn zones
    nextCastIn: 3.4,
    bossCleaveIn: 2.5,
    castSeq: 0,
    lastSkillKey: '',
    pillarCastDone: false,
    syncTimer: 0,
    hudTimer: 0,
    transition: null,      // { nextIdx, fallbackLeft }
    home: null,
    party: [],             // [{ id, name, cls, sex, appearance, hp, maxHp, dps, dmgTaken, support, revives, stage, dead, self }]
    keys: { w: false, a: false, s: false, d: false },
    moveTarget: null,      // { x, z, left, holdOnly }
    lobbyMode: 'party',
    lobbyDungeon: 'astral',
    lobbyRoster: null,     // { partyId, leader, dungeonId, members:[{id,name,cls,lv,sex,appearance,ready}] }
    myReady: false,
    waitingPartyStart: false,
    hudBuilt: false,
    chatLog: [],           // [{ id, name, text, self, sys }]
    chatMinimized: false,
    chatSize: loadSavedChatSize(),
    chatPresetIdx: 1,
    result: null
  };

  // Reusable Three.js hazard pool (zero per-cast allocation lag)
  var hazardGroup = null;
  var craterNodes = [];
  var beamNodes = [];
  var donutNode = null;
  var poolNodes = [];
  var pillarArenaNode = null;
  var pillarNodes = [];
  var moveRing = null;

  // Offscreen scratch canvas + gentle idle timer for character previews
  var portraitScratch = null;
  var portraitTimer = 0;
  var portraitTargets = [];

  function $(id) {
    return typeof document !== 'undefined' ? document.getElementById(id) : null;
  }

  function escHtml(v) {
    return String(v == null ? '' : v)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function fmtNum(n) {
    n = Math.max(0, Math.floor(Number(n) || 0));
    if (n >= 1e9) return (n / 1e9).toFixed(2) + 'B';
    if (n >= 1e6) return (n / 1e6).toFixed(2) + 'M';
    if (n >= 1e4) return (n / 1e3).toFixed(1) + 'K';
    return n.toLocaleString('en-US');
  }

  function fmtClock(sec) {
    sec = Math.max(0, Math.ceil(Number(sec) || 0));
    var m = Math.floor(sec / 60);
    var s = sec % 60;
    return m + ':' + (s < 10 ? '0' : '') + s;
  }

  function dungeonDef(id) {
    return DUNGEONS[id] || DUNGEONS.astral;
  }

  function activeDungeon() {
    return dungeonDef(raid.dungeonId);
  }

  function activeStages() {
    return activeDungeon().stages;
  }

  function isGm() {
    if (typeof S !== 'undefined' && S && S.gm) return true;
    if (typeof CLOUD !== 'undefined' && CLOUD && CLOUD.gm) return true;
    return false;
  }

  function myId() {
    var soc = root.PGSocial && root.PGSocial.app;
    if (soc && soc.id != null) return soc.id;
    if (typeof CLOUD !== 'undefined' && CLOUD && CLOUD.id != null) return CLOUD.id;
    return 'self';
  }

  function myName() {
    if (typeof CLOUD !== 'undefined' && CLOUD && CLOUD.user) return CLOUD.user;
    if (typeof currentUser === 'string' && currentUser) return currentUser;
    return 'Adventurer';
  }

  function myAppearance() {
    if (typeof S !== 'undefined' && S && S.appearance && typeof S.appearance === 'object') {
      return S.appearance;
    }
    return null;
  }

  function todayKey() {
    if (typeof trialDay === 'function') return trialDay();
    return new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);
  }

  function raidSaveState() {
    if (typeof S === 'undefined' || !S) return { day: todayKey(), used: 0, clears: 0, bestSolo: 0, bestParty: 0 };
    var d = todayKey();
    if (!S.raid || typeof S.raid !== 'object') {
      S.raid = { day: d, used: 0, clears: 0, bestSolo: 0, bestParty: 0 };
    }
    if (S.raid.day !== d) {
      S.raid.day = d;
      S.raid.used = 0;
    }
    return S.raid;
  }

  function raidLeftToday() {
    if (isGm()) return Infinity;
    var st = raidSaveState();
    return Math.max(0, DAILY_LIMIT - (Number(st.used) || 0));
  }

  function isFourthUnlocked() {
    if (typeof S === 'undefined' || !S) return false;
    if (isGm()) return true;
    if (typeof C === 'function') {
      var c = C();
      if (c && c.t >= 3 && S.lv >= 150) return true;
    }
    return S.lv >= 150;
  }

  function socialParty() {
    var soc = root.PGSocial && root.PGSocial.app;
    if (!soc || !soc.party || !Array.isArray(soc.party.members)) return null;
    return soc.party;
  }

  function isPartyLeader() {
    var soc = root.PGSocial && root.PGSocial.app;
    var p = socialParty();
    if (!soc || !p) return false;
    return p.leader === soc.id;
  }

  function lobbyMembers() {
    var p = socialParty();
    if (!p || !Array.isArray(p.members)) return [];
    var selfId = myId();
    var rosterMap = {};
    if (raid.lobbyRoster && raid.lobbyRoster.partyId === p.id && Array.isArray(raid.lobbyRoster.members)) {
      for (var i = 0; i < raid.lobbyRoster.members.length; i++) {
        var rm = raid.lobbyRoster.members[i];
        rosterMap[rm.id] = rm;
      }
    }
    return p.members.slice(0, 3).map(function (mem) {
      var isMe = mem.id === selfId || mem.name === myName();
      var info = rosterMap[mem.id] || {};
      var isLead = mem.id === p.leader;
      return {
        id: mem.id,
        name: mem.name || info.name || 'Ally',
        cls: isMe && typeof S !== 'undefined' && S ? (S.cls || 'Adventurer') : (info.cls || 'Adventurer'),
        lv: isMe && typeof S !== 'undefined' && S ? (S.lv || 150) : (info.lv || 150),
        sex: isMe && typeof S !== 'undefined' && S ? (S.sex === 'f' ? 'f' : 'm') : (info.sex === 'f' ? 'f' : 'm'),
        appearance: isMe ? myAppearance() : (info.appearance || null),
        leader: isLead,
        self: isMe,
        ready: isLead ? true : (info.ready != null ? Boolean(info.ready) : (isMe ? Boolean(raid.myReady) : false))
      };
    });
  }

  function allPartyMembersReady() {
    var p = socialParty();
    if (!p || p.members.length < 2 || p.members.length > 3) return false;
    var list = lobbyMembers();
    for (var i = 0; i < list.length; i++) {
      if (!list[i].leader && !list[i].ready) return false;
    }
    return true;
  }

  function firstUnreadyMember() {
    var list = lobbyMembers();
    for (var i = 0; i < list.length; i++) {
      if (!list[i].leader && !list[i].ready) return list[i];
    }
    return null;
  }

  function canBaseEnter(dungeonId) {
    var d = dungeonDef(dungeonId || raid.lobbyDungeon || 'astral');
    if (d.comingSoon) return { ok: false, reason: d.name + ' is coming in a future update.' };
    if (typeof S === 'undefined' || !S) return { ok: false, reason: 'Sign in first.' };
    if (raid.on) return { ok: false, reason: 'Already inside a Raid.' };
    if ((typeof TRIAL !== 'undefined' && TRIAL.on) || (typeof JOB_RITE !== 'undefined' && JOB_RITE.on)) {
      return { ok: false, reason: 'Finish your current trial first.' };
    }
    if (!isFourthUnlocked()) {
      return { ok: false, reason: 'Requires Base Lv 150 & a 4th-Job class (Ascension tier).' };
    }
    if (!isGm() && raidLeftToday() <= 0) {
      return { ok: false, reason: 'Daily Raid limit reached (2/2 today). Resets at 00:00 UTC+8.' };
    }
    return { ok: true, reason: '' };
  }

  function canEnter(mode, dungeonId) {
    var base = canBaseEnter(dungeonId);
    if (!base.ok) return base;
    if (mode === 'party') {
      var p = socialParty();
      if (!p || p.members.length < 2) {
        return { ok: false, reason: 'Form a 2–3 player Party in the Social Hub first.' };
      }
      if (p.members.length > 3) {
        return { ok: false, reason: 'Raid Dungeons support up to 3 party members.' };
      }
      if (!isPartyLeader()) {
        return { ok: false, reason: 'Press Ready below — your Party Leader will start the raid.' };
      }
      var unready = firstUnreadyMember();
      if (unready) {
        return { ok: false, reason: 'Waiting for ' + unready.name + ' to press Ready.' };
      }
    }
    return { ok: true, reason: '' };
  }

  function partyHpScale(count) {
    if (count <= 1) return 1;
    if (count === 2) return 2.2;
    return 3.2;
  }

  function findBoss() {
    if (typeof mobs === 'undefined' || !Array.isArray(mobs)) return null;
    for (var i = 0; i < mobs.length; i++) {
      if (mobs[i] && mobs[i].boss && mobs[i].hp > 0) return mobs[i];
    }
    return null;
  }

  function releaseBossAnchor() {
    if (typeof mobs === 'undefined' || !Array.isArray(mobs)) return;
    for (var i = 0; i < mobs.length; i++) {
      if (mobs[i] && mobs[i]._raidPillarRoot) {
        mobs[i].fixed = false;
        mobs[i]._raidPillarRoot = false;
      }
    }
  }

  function fieldBounds() {
    var bx = typeof BX_ === 'number' ? BX_ : 9.5;
    var z0 = typeof Z0 === 'number' ? Z0 : -11;
    var z1 = typeof Z1 === 'number' ? Z1 : 11;
    return { bx: bx, z0: z0, z1: z1 };
  }

  function clampToBridge(x, z) {
    var b = fieldBounds();
    return {
      x: Math.max(-b.bx + 0.6, Math.min(b.bx - 0.6, x)),
      z: Math.max(b.z0 + 0.6, Math.min(b.z1 - 0.6, z))
    };
  }

  // ---------- Pillar Line-of-Sight Geometry ----------
  function isBehindPillar(bx, bz, p, px, pz) {
    if (!p) return false;
    var vx = p.x - bx;
    var vz = p.z - bz;
    var distBP = Math.hypot(vx, vz);
    if (distBP < 0.05) return false;
    var ux = vx / distBP;
    var uz = vz / distBP;
    var dx = px - p.x;
    var dz = pz - p.z;
    // Distance projected behind the pillar along Boss -> Pillar ray
    var along = dx * ux + dz * uz;
    // Lateral offset from the pillar's shadow centerline
    var perp = Math.abs(-dx * uz + dz * ux);
    var halfW = (p.r || 1.05) + 0.55 + Math.max(0, along) * 0.18;
    return along >= -0.35 && along <= 5.8 && perp <= halfW;
  }

  function isBehindAnyPillar(bx, bz, pillars, px, pz) {
    if (!Array.isArray(pillars) || !pillars.length) return false;
    for (var i = 0; i < pillars.length; i++) {
      if (isBehindPillar(bx, bz, pillars[i], px, pz)) return true;
    }
    return false;
  }

  function pillarSafeSpot(bx, bz, p) {
    var vx = p.x - bx;
    var vz = p.z - bz;
    var d = Math.hypot(vx, vz) || 1;
    var ux = vx / d;
    var uz = vz / d;
    return clampToBridge(p.x + ux * 1.9, p.z + uz * 1.9);
  }

  function spawnSanctuaryPillars(bx, bz) {
    var b = fieldBounds();
    var minX = -b.bx + 2.0, maxX = b.bx - 2.0;
    var minZ = b.z0 + 2.4, maxZ = b.z1 - 2.0;
    var chosen = [];
    var baseRot = Math.random() * Math.PI * 2;

    for (var attempt = 0; attempt < 60 && chosen.length < 3; attempt++) {
      var ang = baseRot + (attempt * 2.17) + (Math.random() - 0.5) * 0.65;
      var dist = 4.1 + Math.random() * 2.3;
      var ux = Math.cos(ang), uz = Math.sin(ang);
      var kx = bx + ux * dist;
      var kz = bz + uz * dist;
      // Ensure BOTH the pillar AND 2.4 units of floor behind it lie inside walkable bounds!
      var backX = kx + ux * 2.4;
      var backZ = kz + uz * 2.4;
      if (kx < minX || kx > maxX || kz < minZ || kz > maxZ) continue;
      if (backX < minX + 0.4 || backX > maxX - 0.4 || backZ < minZ + 0.4 || backZ > maxZ - 0.4) continue;
      var tooClose = false;
      for (var c = 0; c < chosen.length; c++) {
        if (Math.hypot(chosen[c].x - kx, chosen[c].z - kz) < 4.6) {
          tooClose = true;
          break;
        }
      }
      if (tooClose) continue;
      chosen.push({ x: Math.round(kx * 100) / 100, z: Math.round(kz * 100) / 100, r: 1.05 });
    }

    // Deterministic safe fallback guarantees 3 valid pillars even near arena walls
    var fallbackAngles = [0.35, 2.42, 4.52, 1.45, 3.55, 5.45];
    for (var f = 0; f < fallbackAngles.length && chosen.length < 3; f++) {
      var fa = fallbackAngles[f];
      var fx = Math.max(minX + 1.2, Math.min(maxX - 1.2, bx + Math.cos(fa) * 4.4));
      var fz = Math.max(minZ + 1.2, Math.min(maxZ - 1.2, bz + Math.sin(fa) * 4.4));
      if (Math.hypot(fx - bx, fz - bz) < 2.2) fz = bz + 4.2;
      var dup = false;
      for (var j = 0; j < chosen.length; j++) {
        if (Math.hypot(chosen[j].x - fx, chosen[j].z - fz) < 3.2) dup = true;
      }
      if (!dup) chosen.push({ x: Math.round(fx * 100) / 100, z: Math.round(fz * 100) / 100, r: 1.05 });
    }
    return chosen;
  }

  // ---------- Character Sprite Preview Renderer (Lobby & Result Popup) ----------
  function drawFallbackCrest(ctx, w, h, info) {
    ctx.clearRect(0, 0, w, h);
    var grad = ctx.createRadialGradient(w * 0.5, h * 0.45, 6, w * 0.5, h * 0.45, w * 0.48);
    grad.addColorStop(0, 'rgba(154, 118, 255, 0.45)');
    grad.addColorStop(1, 'rgba(20, 14, 42, 0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    ctx.fillStyle = '#dcd2ff';
    ctx.beginPath();
    ctx.arc(w * 0.5, h * 0.34, 13, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#8d6be8';
    ctx.beginPath();
    ctx.moveTo(w * 0.32, h * 0.78);
    ctx.quadraticCurveTo(w * 0.5, h * 0.44, w * 0.68, h * 0.78);
    ctx.closePath();
    ctx.fill();
    if (info && info.cls) {
      ctx.fillStyle = '#f5d384';
      ctx.font = 'bold 10px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(String(info.cls).slice(0, 12), w * 0.5, h - 8);
    }
  }

  function paintSinglePortrait(target) {
    if (!target || !target.canvasId) return;
    var cv = $(target.canvasId);
    if (!cv || typeof cv.getContext !== 'function') return;
    var info = target.info || {};
    var cls = info.cls || (typeof S !== 'undefined' && S && S.cls) || 'Rune Knight';
    var sex = info.sex === 'f' ? 'f' : 'm';

    if (info.self && typeof drawSkinPreview === 'function') {
      try {
        drawSkinPreview(target.canvasId, null, cls, sex);
        return;
      } catch (_) {}
    }

    if (!info.self && typeof wardrobeStore !== 'undefined' && wardrobeStore &&
        typeof PGWardrobe !== 'undefined' && PGWardrobe &&
        typeof wardrobeSupported === 'function' && wardrobeSupported(cls)) {
      try {
        var wAppearance = info.appearance && typeof info.appearance === 'object'
          ? info.appearance
          : { version: 1, sex: sex };
        var entry = wardrobeStore.select('raid:' + String(info.id || info.name || 'ally'), wAppearance, cls);
        if (entry && entry.ready && entry.look) {
          if (!portraitScratch && typeof document !== 'undefined') {
            portraitScratch = document.createElement('canvas');
            portraitScratch.width = 320;
            portraitScratch.height = 320;
          }
          var sctx = portraitScratch && portraitScratch.getContext && portraitScratch.getContext('2d');
          var dctx = cv.getContext('2d');
          if (sctx && dctx) {
            sctx.clearRect(0, 0, 320, 320);
            var nowMs = typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();
            PGWardrobe.draw(sctx, entry.look, 'idle', 0, nowMs);
            var w = cv.width || 104, h = cv.height || 112;
            dctx.clearRect(0, 0, w, h);
            dctx.imageSmoothingEnabled = false;
            var sx = 97, sy = 72, sw = 126, sh = 134;
            var scale = Math.min((w - 6) / sw, (h - 6) / sh);
            var dw = Math.round(sw * scale), dh = Math.round(sh * scale);
            dctx.drawImage(portraitScratch, sx, sy, sw, sh, Math.round((w - dw) / 2), Math.round((h - dh) / 2), dw, dh);
            return;
          }
        } else if (entry && entry.promise && !entry._raidHooked) {
          entry._raidHooked = true;
          entry.promise.then(function () { paintActivePortraits(); }).catch(function () {});
        }
      } catch (_) {}
    }

    if (typeof drawSkinPreview === 'function') {
      try {
        drawSkinPreview(target.canvasId, null, cls, sex);
        return;
      } catch (_) {}
    }

    try {
      var ctx2 = cv.getContext('2d');
      if (ctx2) drawFallbackCrest(ctx2, cv.width || 104, cv.height || 112, info);
    } catch (_) {}
  }

  function paintActivePortraits() {
    var lobbyVis = $('raidLobby') && !$('raidLobby').hidden;
    var resVis = $('raidResult') && !$('raidResult').hidden;
    if (!lobbyVis && !resVis) {
      if (portraitTimer) {
        clearInterval(portraitTimer);
        portraitTimer = 0;
      }
      return;
    }
    for (var i = 0; i < portraitTargets.length; i++) {
      paintSinglePortrait(portraitTargets[i]);
    }
  }

  function registerPortraits(list) {
    portraitTargets = Array.isArray(list) ? list : [];
    paintActivePortraits();
    if (!portraitTimer && portraitTargets.length && typeof setInterval === 'function') {
      portraitTimer = setInterval(paintActivePortraits, 180);
    }
  }

  // ---------- Reusable Three.js Hazard & Pillar Visuals ----------
  function makeCraterNode(THREE) {
    var g = new THREE.Group();
    g.visible = false;

    var fill = new THREE.Mesh(
      new THREE.CircleGeometry(1, 40),
      new THREE.MeshBasicMaterial({ color: 0xff2448, transparent: true, opacity: 0.24, side: THREE.DoubleSide, depthWrite: false })
    );
    fill.rotation.x = -Math.PI / 2;
    g.add(fill);

    var border = new THREE.Mesh(
      new THREE.RingGeometry(0.93, 1.0, 44),
      new THREE.MeshBasicMaterial({ color: 0xff6e86, transparent: true, opacity: 0.92, side: THREE.DoubleSide, depthWrite: false })
    );
    border.rotation.x = -Math.PI / 2;
    border.position.y = 0.01;
    g.add(border);

    var inner = new THREE.Mesh(
      new THREE.RingGeometry(0.02, 0.14, 40),
      new THREE.MeshBasicMaterial({ color: 0xffd27d, transparent: true, opacity: 0.72, side: THREE.DoubleSide, depthWrite: false })
    );
    inner.rotation.x = -Math.PI / 2;
    inner.position.y = 0.015;
    g.add(inner);

    var meteor = new THREE.Group();
    meteor.visible = false;
    var core = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.52, 1),
      new THREE.MeshBasicMaterial({ color: 0xfff0b8 })
    );
    meteor.add(core);
    var aura = new THREE.Mesh(
      new THREE.SphereGeometry(0.74, 12, 10),
      new THREE.MeshBasicMaterial({ color: 0xff4668, transparent: true, opacity: 0.58, depthWrite: false })
    );
    meteor.add(aura);
    var tail = new THREE.Mesh(
      new THREE.ConeGeometry(0.55, 4.2, 12, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xff7b4a, transparent: true, opacity: 0.45, side: THREE.DoubleSide, depthWrite: false })
    );
    tail.position.set(0, 2.1, 0);
    meteor.add(tail);
    g.add(meteor);

    return { group: g, fill: fill, border: border, inner: inner, meteor: meteor, core: core };
  }

  function makeBeamNode(THREE) {
    var g = new THREE.Group();
    g.visible = false;

    var fill = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({ color: 0xff244c, transparent: true, opacity: 0.25, side: THREE.DoubleSide, depthWrite: false })
    );
    fill.rotation.x = -Math.PI / 2;
    g.add(fill);

    var core = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({ color: 0xffcf7c, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false })
    );
    core.rotation.x = -Math.PI / 2;
    core.position.y = 0.012;
    g.add(core);

    var railL = new THREE.Mesh(
      new THREE.PlaneGeometry(0.08, 1),
      new THREE.MeshBasicMaterial({ color: 0xff8599, transparent: true, opacity: 0.95, side: THREE.DoubleSide, depthWrite: false })
    );
    railL.rotation.x = -Math.PI / 2;
    railL.position.y = 0.015;
    g.add(railL);

    var railR = railL.clone();
    g.add(railR);

    return { group: g, fill: fill, core: core, railL: railL, railR: railR };
  }

  function makeDonutNode(THREE) {
    var g = new THREE.Group();
    g.visible = false;

    var danger = new THREE.Mesh(
      new THREE.RingGeometry(1, 4.0, 56),
      new THREE.MeshBasicMaterial({ color: 0xff2248, transparent: true, opacity: 0.28, side: THREE.DoubleSide, depthWrite: false })
    );
    danger.rotation.x = -Math.PI / 2;
    g.add(danger);

    var safeRing = new THREE.Mesh(
      new THREE.RingGeometry(0.9, 1.0, 48),
      new THREE.MeshBasicMaterial({ color: 0x5cf2ff, transparent: true, opacity: 0.95, side: THREE.DoubleSide, depthWrite: false })
    );
    safeRing.rotation.x = -Math.PI / 2;
    safeRing.position.y = 0.018;
    g.add(safeRing);

    var safeFill = new THREE.Mesh(
      new THREE.CircleGeometry(0.95, 44),
      new THREE.MeshBasicMaterial({ color: 0x3ce8b5, transparent: true, opacity: 0.14, side: THREE.DoubleSide, depthWrite: false })
    );
    safeFill.rotation.x = -Math.PI / 2;
    safeFill.position.y = 0.01;
    g.add(safeFill);

    return { group: g, danger: danger, safeRing: safeRing, safeFill: safeFill };
  }

  function makePoolNode(THREE) {
    var g = new THREE.Group();
    g.visible = false;
    var fill = new THREE.Mesh(
      new THREE.CircleGeometry(1, 36),
      new THREE.MeshBasicMaterial({ color: 0x9c2cff, transparent: true, opacity: 0.34, side: THREE.DoubleSide, depthWrite: false })
    );
    fill.rotation.x = -Math.PI / 2;
    g.add(fill);
    var ring = new THREE.Mesh(
      new THREE.RingGeometry(0.88, 1.0, 36),
      new THREE.MeshBasicMaterial({ color: 0xff5492, transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.012;
    g.add(ring);
    return { group: g, fill: fill, ring: ring };
  }

  function makePillarArenaNode(THREE) {
    var g = new THREE.Group();
    g.visible = false;
    var floorFill = new THREE.Mesh(
      new THREE.CircleGeometry(22, 56),
      new THREE.MeshBasicMaterial({ color: 0xff163c, transparent: true, opacity: 0.26, side: THREE.DoubleSide, depthWrite: false })
    );
    floorFill.rotation.x = -Math.PI / 2;
    g.add(floorFill);

    var shockWave = new THREE.Mesh(
      new THREE.RingGeometry(0.85, 1.0, 52),
      new THREE.MeshBasicMaterial({ color: 0xffcf6e, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false })
    );
    shockWave.rotation.x = -Math.PI / 2;
    shockWave.position.y = 0.014;
    g.add(shockWave);

    return { group: g, floorFill: floorFill, shockWave: shockWave };
  }

  function makePillarNode(THREE) {
    var g = new THREE.Group();
    g.visible = false;

    // Falling 3D Runic Stone Monolith
    var columnWrap = new THREE.Group();
    var shaft = new THREE.Mesh(
      new THREE.CylinderGeometry(0.72, 0.92, 3.8, 8),
      new THREE.MeshBasicMaterial({ color: 0x6f7a9f })
    );
    shaft.position.y = 1.9;
    columnWrap.add(shaft);

    var runeBand = new THREE.Mesh(
      new THREE.CylinderGeometry(0.8, 0.8, 0.42, 8),
      new THREE.MeshBasicMaterial({ color: 0x6af7d0 })
    );
    runeBand.position.y = 2.15;
    columnWrap.add(runeBand);

    var crown = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.56, 0),
      new THREE.MeshBasicMaterial({ color: 0xfff0a8 })
    );
    crown.position.y = 4.25;
    columnWrap.add(crown);
    g.add(columnWrap);

    var baseRing = new THREE.Mesh(
      new THREE.RingGeometry(0.95, 1.18, 32),
      new THREE.MeshBasicMaterial({ color: 0x76ffd8, transparent: true, opacity: 0.95, side: THREE.DoubleSide, depthWrite: false })
    );
    baseRing.rotation.x = -Math.PI / 2;
    baseRing.position.y = 0.02;
    g.add(baseRing);

    // Directional Safe Shadow Lane extending behind the pillar away from the Boss!
    var shadowPivot = new THREE.Group();
    var shadowFill = new THREE.Mesh(
      new THREE.PlaneGeometry(5.4, 3.1),
      new THREE.MeshBasicMaterial({ color: 0x28f0a8, transparent: true, opacity: 0.34, side: THREE.DoubleSide, depthWrite: false })
    );
    shadowFill.rotation.x = -Math.PI / 2;
    shadowFill.position.set(2.85, 0.018, 0);
    shadowPivot.add(shadowFill);

    var shadowEdgeL = new THREE.Mesh(
      new THREE.PlaneGeometry(5.4, 0.12),
      new THREE.MeshBasicMaterial({ color: 0x8effdf, transparent: true, opacity: 0.92, side: THREE.DoubleSide, depthWrite: false })
    );
    shadowEdgeL.rotation.x = -Math.PI / 2;
    shadowEdgeL.position.set(2.85, 0.024, -1.55);
    shadowPivot.add(shadowEdgeL);

    var shadowEdgeR = shadowEdgeL.clone();
    shadowEdgeR.position.set(2.85, 0.024, 1.55);
    shadowPivot.add(shadowEdgeR);

    g.add(shadowPivot);

    return { group: g, columnWrap: columnWrap, crown: crown, shadowPivot: shadowPivot, shadowFill: shadowFill };
  }

  function ensureMeshes() {
    if (typeof THREE === 'undefined' || typeof scene === 'undefined' || !scene) return false;
    if (!hazardGroup) {
      hazardGroup = new THREE.Group();
      hazardGroup.position.y = 0.09;
      craterNodes = [];
      for (var i = 0; i < 5; i++) {
        var c = makeCraterNode(THREE);
        hazardGroup.add(c.group);
        craterNodes.push(c);
      }
      beamNodes = [];
      for (var b = 0; b < 2; b++) {
        var bm = makeBeamNode(THREE);
        hazardGroup.add(bm.group);
        beamNodes.push(bm);
      }
      donutNode = makeDonutNode(THREE);
      hazardGroup.add(donutNode.group);

      poolNodes = [];
      for (var p = 0; p < 3; p++) {
        var plNode = makePoolNode(THREE);
        hazardGroup.add(plNode.group);
        poolNodes.push(plNode);
      }

      pillarArenaNode = makePillarArenaNode(THREE);
      hazardGroup.add(pillarArenaNode.group);
      pillarNodes = [];
      for (var k = 0; k < 3; k++) {
        var pkNode = makePillarNode(THREE);
        hazardGroup.add(pkNode.group);
        pillarNodes.push(pkNode);
      }
    }
    if (!hazardGroup.parent) scene.add(hazardGroup);

    if (!moveRing) {
      moveRing = new THREE.Mesh(
        new THREE.RingGeometry(0.42, 0.58, 28),
        new THREE.MeshBasicMaterial({ color: 0x6ce8ff, transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false })
      );
      moveRing.rotation.x = -Math.PI / 2;
      moveRing.visible = false;
    }
    if (!moveRing.parent) scene.add(moveRing);
    return true;
  }

  function hideAllHazardMeshes() {
    for (var i = 0; i < craterNodes.length; i++) {
      craterNodes[i].group.visible = false;
      craterNodes[i].meteor.visible = false;
    }
    for (var b = 0; b < beamNodes.length; b++) beamNodes[b].group.visible = false;
    if (donutNode) donutNode.group.visible = false;
    for (var p = 0; p < poolNodes.length; p++) poolNodes[p].group.visible = false;
    if (pillarArenaNode) pillarArenaNode.group.visible = false;
    for (var k = 0; k < pillarNodes.length; k++) pillarNodes[k].group.visible = false;
  }

  function floorYAt(x, z) {
    if (typeof actorFloorY === 'function') {
      try { return actorFloorY(x, z) + 0.08; } catch (_) {}
    }
    return 0.09;
  }

  function updateMeshes() {
    if (!ensureMeshes()) return;
    hideAllHazardMeshes();

    for (var p = 0; p < raid.voidPools.length && p < poolNodes.length; p++) {
      var vp = raid.voidPools[p];
      var pn = poolNodes[p];
      pn.group.visible = true;
      pn.group.position.set(vp.x, floorYAt(vp.x, vp.z) - 0.07, vp.z);
      pn.group.scale.set(vp.r, 1, vp.r);
      var fade = Math.min(1, vp.left / 0.8);
      pn.fill.material.opacity = (0.28 + 0.1 * Math.sin(vp.left * 7)) * fade;
      pn.ring.material.opacity = 0.85 * fade;
    }

    var tg = raid.telegraph;
    if (tg) {
      var pct = Math.max(0.05, Math.min(1, tg.age / tg.life));
      var pulse = 0.22 + 0.24 * pct + 0.07 * Math.sin(tg.age * 16);
      var shape = tg.shape || 'circle';

      if (shape === 'pillars' && pillarArenaNode) {
        pillarArenaNode.group.visible = true;
        pillarArenaNode.group.position.set(tg.x, floorYAt(tg.x, tg.z) - 0.08, tg.z);
        pillarArenaNode.floorFill.material.opacity = 0.18 + 0.22 * pct + 0.06 * Math.sin(tg.age * 18);
        var waveR = Math.max(0.6, pct * 20.0);
        pillarArenaNode.shockWave.scale.set(waveR, waveR, 1);

        var pList = Array.isArray(tg.pillars) ? tg.pillars : [];
        var dropT = Math.min(1, tg.age / 0.55);
        var dropY = (1 - dropT) * (1 - dropT) * 13.5;
        for (var pk = 0; pk < pList.length && pk < pillarNodes.length; pk++) {
          var pd = pList[pk];
          var pNode = pillarNodes[pk];
          pNode.group.visible = true;
          pNode.group.position.set(pd.x, floorYAt(pd.x, pd.z) - 0.08, pd.z);
          pNode.columnWrap.position.y = dropY;
          pNode.crown.rotation.y = tg.age * 3.5;
          var rayAng = Math.atan2(pd.z - tg.z, pd.x - tg.x);
          pNode.shadowPivot.rotation.y = -rayAng;
          pNode.shadowPivot.visible = dropT >= 0.45;
          pNode.shadowFill.material.opacity = 0.28 + 0.14 * Math.sin(tg.age * 10);
        }
      } else if (shape === 'circle' || shape === 'multi') {
        var zones = shape === 'multi' && Array.isArray(tg.zones)
          ? tg.zones
          : [{ x: tg.x, z: tg.z, r: tg.r || 4.0 }];
        for (var i = 0; i < zones.length && i < craterNodes.length; i++) {
          var zc = zones[i];
          var cn = craterNodes[i];
          cn.group.visible = true;
          cn.group.position.set(zc.x, floorYAt(zc.x, zc.z) - 0.08, zc.z);
          cn.fill.scale.set(zc.r, zc.r, 1);
          cn.border.scale.set(zc.r, zc.r, 1);
          var grow = Math.max(0.1, pct * zc.r);
          cn.inner.scale.set(grow, grow, 1);
          cn.fill.material.opacity = pulse;

          if (tg.meteors) {
            cn.meteor.visible = true;
            var fall = 1 - pct;
            var h = 15.5 * fall;
            cn.meteor.position.set(-fall * 3.2, h + 0.35, -fall * 2.4);
            cn.meteor.rotation.z = -0.22;
            cn.core.rotation.y = tg.age * 8;
            cn.core.rotation.x = tg.age * 6;
          } else {
            cn.meteor.visible = false;
          }
        }
      } else if (shape === 'donut' && donutNode) {
        donutNode.group.visible = true;
        donutNode.group.position.set(tg.x, floorYAt(tg.x, tg.z) - 0.08, tg.z);
        var ir = tg.innerR || 3.7;
        donutNode.group.scale.set(ir, 1, ir);
        donutNode.danger.material.opacity = pulse + 0.05;
        donutNode.safeFill.material.opacity = 0.14 + 0.06 * Math.sin(tg.age * 10);
      } else if (shape === 'beam' || shape === 'cross') {
        var count = shape === 'cross' ? 2 : 1;
        for (var b = 0; b < count && b < beamNodes.length; b++) {
          var bn = beamNodes[b];
          var ang = (tg.ang || 0) + (b === 1 ? Math.PI / 2 : 0);
          var w = tg.width || 3.0;
          var len = tg.len || 24;
          bn.group.visible = true;
          bn.group.position.set(tg.x, floorYAt(tg.x, tg.z) - 0.08, tg.z);
          bn.group.rotation.y = -ang;
          bn.fill.scale.set(w, len, 1);
          bn.fill.material.opacity = pulse;
          bn.core.scale.set(Math.max(0.08, w * pct), len, 1);
          bn.core.material.opacity = 0.42 + 0.3 * pct;
          bn.railL.position.x = -w * 0.5;
          bn.railL.scale.set(1, len, 1);
          bn.railR.position.x = w * 0.5;
          bn.railR.scale.set(1, len, 1);
        }
      }
    }

    if (raid.moveTarget && raid.moveTarget.left > 0 && !raid.moveTarget.holdOnly) {
      moveRing.visible = true;
      moveRing.position.set(raid.moveTarget.x, floorYAt(raid.moveTarget.x, raid.moveTarget.z), raid.moveTarget.z);
      moveRing.material.opacity = Math.min(0.9, raid.moveTarget.left * 1.4);
    } else if (moveRing) {
      moveRing.visible = false;
    }
  }

  function clearMeshes() {
    if (hazardGroup) {
      hideAllHazardMeshes();
      if (hazardGroup.parent) hazardGroup.parent.remove(hazardGroup);
    }
    if (moveRing) {
      moveRing.visible = false;
      if (moveRing.parent) moveRing.parent.remove(moveRing);
    }
  }

  // ---------- Hit Geometry for All 6 Hazard Shapes ----------
  function pointInBeam(px, pz, bx, bz, ang, width, len) {
    var dx = px - bx;
    var dz = pz - bz;
    var ca = Math.cos(ang);
    var sa = Math.sin(ang);
    var lx = dx * ca + dz * sa;
    var lz = -dx * sa + dz * ca;
    return Math.abs(lx) <= width * 0.5 && Math.abs(lz) <= len * 0.5;
  }

  function hitByTelegraph(tg, px, pz) {
    if (!tg) return false;
    var shape = tg.shape || 'circle';
    if (shape === 'pillars') {
      return !isBehindAnyPillar(tg.x, tg.z, tg.pillars, px, pz);
    }
    if (shape === 'circle') {
      return Math.hypot(px - tg.x, pz - tg.z) <= (tg.r || 4.0);
    }
    if (shape === 'donut') {
      var d = Math.hypot(px - tg.x, pz - tg.z);
      return d >= (tg.innerR || 3.7) && d <= (tg.outerR || 15.0);
    }
    if (shape === 'beam') {
      return pointInBeam(px, pz, tg.x, tg.z, tg.ang || 0, tg.width || 3.0, tg.len || 24);
    }
    if (shape === 'cross') {
      var a = tg.ang || 0;
      var w = tg.width || 2.8;
      var l = tg.len || 24;
      return pointInBeam(px, pz, tg.x, tg.z, a, w, l) || pointInBeam(px, pz, tg.x, tg.z, a + Math.PI / 2, w, l);
    }
    if (shape === 'multi' && Array.isArray(tg.zones)) {
      for (var i = 0; i < tg.zones.length; i++) {
        var zc = tg.zones[i];
        if (Math.hypot(px - zc.x, pz - zc.z) <= zc.r) return true;
      }
      return false;
    }
    return false;
  }

  // ---------- Spawning Raid Stages ----------
  function spawnRaidStage(stageIdx) {
    var dng = activeDungeon();
    var stages = dng.stages;
    var st = stages[stageIdx];
    if (!st) return;
    releaseBossAnchor();
    raid.stage = stageIdx;
    raid.telegraph = null;
    raid.voidPools = [];
    raid.nextCastIn = st.boss ? 2.4 : 3.2;
    raid.bossCleaveIn = BOSS_CLEAVE_INTERVAL_S;
    raid.pillarCastDone = false;
    raid.transition = null;
    raid.moveTarget = null;

    var mapId = dng.mapId || 10;
    raid._internalNav = true;
    try {
      S.mp = mapId;
      S.lvl = st.astralStage;
      if (typeof astralOriginStage !== 'undefined') astralOriginStage = mapId === 10 ? st.astralStage : 0;
      if (typeof astralJourney !== 'undefined') astralJourney = null;
      if (typeof lastKey !== 'undefined') lastKey = '';
      if (typeof mobs !== 'undefined') mobs = [];
      if (typeof mob !== 'undefined') mob = null;
      if (typeof camps !== 'undefined') camps = [];
      if (typeof drops !== 'undefined') drops = [];
      if (typeof engageTgt !== 'undefined') engageTgt = null;
      if (typeof activePack !== 'undefined') activePack = 0;
      if (typeof swing !== 'undefined') swing = null;
      if (typeof pl !== 'undefined' && pl) {
        var b = fieldBounds();
        pl.x = 0;
        pl.z = st.boss ? 2.5 : (b.z1 - 2.2);
        pl.wx = null;
        pl.wt = 0;
      }
      if (typeof spawn === 'function') spawn();
      if (typeof camps !== 'undefined') camps = [];

      var scale = partyHpScale(Math.max(1, raid.party.length));
      if (typeof mobs !== 'undefined' && Array.isArray(mobs)) {
        if (!st.boss) {
          var allowedPacks = [];
          for (var p = 0; p < mobs.length; p++) {
            var pk = mobs[p].pack;
            if (allowedPacks.indexOf(pk) < 0) allowedPacks.push(pk);
          }
          allowedPacks = allowedPacks.slice(0, TRASH_CAMP_LIMIT);
          mobs = mobs.filter(function (m) { return allowedPacks.indexOf(m.pack) >= 0; });

          if (stageIdx === 2 && typeof fieldOf === 'function' && typeof ascensionCombatStats === 'function') {
            var f4 = fieldOf(mapId, 4);
            var st3 = ascensionCombatStats(mapId, 3);
            var tpl = f4 && f4.mobs && f4.mobs[1];
            if (tpl && st3) {
              for (var w = 0; w < 2; w++) {
                var wx = w === 0 ? -2.6 : 2.6;
                var wz = -6.5 - w * 2.0;
                var hpW = Math.floor(st3.hp * 1.35);
                mobs.push(Object.assign({}, tpl, {
                  hp: hpW, max: hpW, atk: Math.floor(st3.atk * 1.35),
                  exp: 0, zeny: 0, drops: [], cardCh: 0,
                  x: wx, z: wz, hx: null, hz: null,
                  a: Math.random() * 6.28, size: 0.72, pack: 90 + w, boss: false,
                  spawn: 1, mapIndex: mapId, sec: f4.sec,
                  lvl: typeof fieldPower === 'function' ? fieldPower(mapId, 3) : 130,
                  at: 1.4, stun: 0, mag: true
                }));
              }
            }
          }
          for (var k = 0; k < mobs.length; k++) {
            mobs[k].hx = null;
            mobs[k].hz = null;
            mobs[k].atk = Math.max(1, Math.floor((mobs[k].atk || 100) * 1.25));
            if (scale > 1) {
              mobs[k].hp = Math.max(1, Math.floor(mobs[k].hp * scale));
              mobs[k].max = mobs[k].hp;
            }
          }
        } else {
          for (var i = 0; i < mobs.length; i++) {
            var mult = mobs[i].boss ? (BOSS_HP_MULT * scale) : (ESCORT_HP_MULT * scale);
            var atkMult = mobs[i].boss ? BOSS_ATK_MULT : ESCORT_ATK_MULT;
            mobs[i].hp = Math.max(1, Math.floor(mobs[i].hp * mult));
            mobs[i].max = mobs[i].hp;
            mobs[i].atk = Math.max(1, Math.floor((mobs[i].atk || 500) * atkMult));
            mobs[i].hx = null;
            mobs[i].hz = null;
          }
        }
      }
      if (typeof respawn !== 'undefined') respawn = 1e9;
    } finally {
      raid._internalNav = false;
    }
    pushSystemChat('Stage ' + (stageIdx + 1) + '/4 — ' + st.name);
    sendSync(true);
    renderHud();
  }

  // ---------- Movement, Evasion & DODGE ----------
  function setGroundMove(wx, wz, holdSec) {
    if (!raid.on || raid.dead) return;
    var c = clampToBridge(wx, wz);
    raid.moveTarget = { x: c.x, z: c.z, left: holdSec || 2.8, holdOnly: false };
    updateMeshes();
  }

  function handleCanvasClick(clientX, clientY) {
    if (!raid.on || raid.dead) return false;
    if (typeof THREE === 'undefined' || typeof cam === 'undefined' || typeof R === 'undefined' || !R || !R.domElement) return false;
    var rect = R.domElement.getBoundingClientRect();
    if (!rect.width || !rect.height) return false;
    var ndcX = ((clientX - rect.left) / rect.width) * 2 - 1;
    var ndcY = -((clientY - rect.top) / rect.height) * 2 + 1;
    var ray = new THREE.Raycaster();
    ray.setFromCamera(new THREE.Vector2(ndcX, ndcY), cam);
    var planeY = typeof pl !== 'undefined' && pl ? floorYAt(pl.x, pl.z) : 0;
    var plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -planeY);
    var hit = new THREE.Vector3();
    if (ray.ray.intersectPlane(plane, hit)) {
      setGroundMove(hit.x, hit.z, 2.8);
      return true;
    }
    return false;
  }

  function onKey(key, down) {
    if (!raid.on) return false;
    var k = String(key || '').toLowerCase();
    if (down && k === 'enter') {
      raid.keys = { w: false, a: false, s: false, d: false };
      raid.chatMinimized = false;
      var box = $('raidChatBox');
      if (box) box.classList.remove('minimized');
      var inp = $('raidChatInput');
      if (inp) inp.focus();
      return true;
    }
    if (k === 'w' || k === 'arrowup') { raid.keys.w = down; return true; }
    if (k === 's' || k === 'arrowdown') { raid.keys.s = down; return true; }
    if (k === 'a' || k === 'arrowleft') { raid.keys.a = down; return true; }
    if (k === 'd' || k === 'arrowright') { raid.keys.d = down; return true; }
    if (down && (k === ' ' || k === 'shift')) { dodge(); return true; }
    return false;
  }

  function keyVector() {
    var ix = (raid.keys.d ? 1 : 0) - (raid.keys.a ? 1 : 0);
    var iz = (raid.keys.s ? 1 : 0) - (raid.keys.w ? 1 : 0);
    if (!ix && !iz) return null;
    var a = typeof az === 'number' ? az : 0;
    var ca = Math.cos(a), sa = Math.sin(a);
    var wx = ix * ca + iz * sa;
    var wz = -ix * sa + iz * ca;
    var len = Math.hypot(wx, wz) || 1;
    return { x: wx / len, z: wz / len };
  }

  function isManualMove() {
    if (!raid.on || raid.dead) return false;
    if (raid.keys.w || raid.keys.a || raid.keys.s || raid.keys.d) return true;
    if (raid.moveTarget && raid.moveTarget.left > 0 && typeof pl !== 'undefined' && pl) {
      if (Math.hypot(raid.moveTarget.x - pl.x, raid.moveTarget.z - pl.z) > 0.22) return true;
    }
    return false;
  }

  function overrideMove(dt) {
    if (!raid.on || raid.dead || typeof pl === 'undefined' || !pl) return null;
    var kv = keyVector();
    if (kv) {
      raid.moveTarget = null;
      return clampToBridge(pl.x + kv.x * 4.5, pl.z + kv.z * 4.5);
    }
    if (raid.moveTarget) {
      raid.moveTarget.left -= dt;
      var d = Math.hypot(raid.moveTarget.x - pl.x, raid.moveTarget.z - pl.z);
      if (raid.moveTarget.left <= 0) {
        raid.moveTarget = null;
        return null;
      }
      if (d <= 0.22) {
        raid.moveTarget.holdOnly = true;
      }
      return { x: raid.moveTarget.x, z: raid.moveTarget.z };
    }
    return null;
  }

  function smartEscapeDirection(px, pz) {
    var tg = raid.telegraph;
    if (tg) {
      var shape = tg.shape || 'circle';
      if (shape === 'pillars' && Array.isArray(tg.pillars) && tg.pillars.length) {
        var bestSpot = null, bestDist = 1e9;
        for (var k = 0; k < tg.pillars.length; k++) {
          var sp = pillarSafeSpot(tg.x, tg.z, tg.pillars[k]);
          var sd = Math.hypot(sp.x - px, sp.z - pz);
          if (sd < bestDist) { bestDist = sd; bestSpot = sp; }
        }
        if (bestSpot && bestDist > 0.1) {
          return { x: (bestSpot.x - px) / bestDist, z: (bestSpot.z - pz) / bestDist };
        }
      } else if (shape === 'donut') {
        var dxIn = tg.x - px, dzIn = tg.z - pz;
        var dIn = Math.hypot(dxIn, dzIn);
        if (dIn >= (tg.innerR || 3.7) - 0.3 && dIn > 0.05) {
          return { x: dxIn / dIn, z: dzIn / dIn };
        }
      } else if (shape === 'beam') {
        var perp = (tg.ang || 0);
        var nx = Math.cos(perp), nz = Math.sin(perp);
        var side = ((px - tg.x) * nx + (pz - tg.z) * nz) >= 0 ? 1 : -1;
        return { x: nx * side, z: nz * side };
      } else if (shape === 'cross') {
        var diag = (tg.ang || 0) + Math.PI / 4;
        return { x: Math.cos(diag), z: Math.sin(diag) };
      } else if (shape === 'multi' && Array.isArray(tg.zones) && tg.zones.length) {
        var nearest = tg.zones[0], best = 1e9;
        for (var i = 0; i < tg.zones.length; i++) {
          var dist = Math.hypot(px - tg.zones[i].x, pz - tg.zones[i].z);
          if (dist < best) { best = dist; nearest = tg.zones[i]; }
        }
        var mx = px - nearest.x, mz = pz - nearest.z, ml = Math.hypot(mx, mz);
        if (ml > 0.1) return { x: mx / ml, z: mz / ml };
      } else {
        var ox = px - tg.x, oz = pz - tg.z, ol = Math.hypot(ox, oz);
        if (ol > 0.1) return { x: ox / ol, z: oz / ol };
      }
    }
    var boss = findBoss();
    if (boss) {
      var bx = px - boss.x, bz = pz - boss.z, bl = Math.hypot(bx, bz);
      if (bl > 0.1) return { x: -bz / bl, z: bx / bl };
    }
    return { x: 0, z: 1 };
  }

  function dodge() {
    if (!raid.on || raid.dead || raid.dodgeCd > 0) return false;
    if (typeof pl === 'undefined' || !pl) return false;
    raid.dodgeCd = DODGE_CD_S;
    raid.iframes = DODGE_IFRAME_S;
    raid.reviving = null;

    var dir = keyVector() || smartEscapeDirection(pl.x, pl.z);
    var stepDist = DODGE_DIST;
    if (!keyVector() && raid.telegraph && raid.telegraph.shape === 'pillars' && Array.isArray(raid.telegraph.pillars) && raid.telegraph.pillars.length) {
      var nearestSafe = null, nearestD = 1e9;
      for (var k = 0; k < raid.telegraph.pillars.length; k++) {
        var spt = pillarSafeSpot(raid.telegraph.x, raid.telegraph.z, raid.telegraph.pillars[k]);
        var d0 = Math.hypot(spt.x - pl.x, spt.z - pl.z);
        if (d0 < nearestD) { nearestD = d0; nearestSafe = spt; }
      }
      if (nearestSafe && nearestD <= DODGE_DIST) stepDist = nearestD;
    }

    var dest = clampToBridge(pl.x + dir.x * stepDist, pl.z + dir.z * stepDist);
    var faceDx = dest.x - pl.x, faceDz = dest.z - pl.z;
    if (Math.hypot(faceDx, faceDz) > 0.05) {
      pl.ry = -Math.atan2(faceDz, faceDx);
    }
    pl.x = dest.x;
    pl.z = dest.z;
    raid.moveTarget = { x: dest.x, z: dest.z, left: 1.4, holdOnly: true };
    if (typeof engageTgt !== 'undefined') engageTgt = null;
    if (typeof swing !== 'undefined') swing = null;
    if (typeof addFloat === 'function') addFloat(pl.x, 2.5, pl.z, 'DODGE!', '#76eaff', true, 'evade');
    updateMeshes();
    renderHud();
    return true;
  }

  // ---------- Stage 1–3 Bombardments & Stage 4 Boss Mechanics (Including Pillar Wipe!) ----------
  function spawnBridgeHazard(dt) {
    if (typeof mobs === 'undefined' || !mobs.length || typeof pl === 'undefined' || !pl) return;
    raid.nextCastIn -= dt;
    if (raid.nextCastIn > 0) return;

    raid.castSeq++;
    var b = fieldBounds();
    var isThor = raid.dungeonId === 'thor';
    var pick = raid.castSeq % 3;
    var stageGap = raid.stage === 0 ? 4.6 : (raid.stage === 1 ? 4.1 : 3.7);

    if (pick === 1) {
      var count = raid.stage >= 2 ? 4 : 3;
      var zones = [{ x: clampToBridge(pl.x, pl.z).x, z: clampToBridge(pl.x, pl.z).z, r: 3.1 }];
      for (var i = 1; i < count; i++) {
        var ox = ((i % 2 === 0 ? 1 : -1) * (2.6 + (i * 1.5) % 4.5));
        var oz = Math.max(b.z0 + 2, Math.min(b.z1 - 2, pl.z - 3.5 + (i - 1.5) * 4.2));
        var cz = clampToBridge(ox, oz);
        zones.push({ x: cz.x, z: cz.z, r: 2.9 });
      }
      raid.telegraph = {
        name: isThor ? 'Volcanic Meteor' : 'Astral Starfall',
        hint: 'FALLING METEORS — Move or DODGE out of craters!',
        shape: 'multi',
        meteors: true,
        zones: zones,
        x: zones[0].x,
        z: zones[0].z,
        dmgPct: 0.32,
        age: 0,
        life: 2.2
      };
    } else if (pick === 2) {
      var crossBridge = (raid.castSeq % 2 === 0);
      var ang = crossBridge ? (Math.PI / 2 + (raid.stage === 2 ? 0.28 : 0)) : 0;
      raid.telegraph = {
        name: isThor ? 'Tectonic Beam' : 'Sanctuary Lance',
        hint: 'ENERGY BEAM — Sidestep off the laser lane!',
        shape: 'beam',
        x: clampToBridge(pl.x, pl.z).x,
        z: clampToBridge(pl.x, pl.z).z,
        ang: ang,
        width: 3.1,
        len: 24,
        dmgPct: 0.34,
        age: 0,
        life: 2.1
      };
    } else {
      var p1 = clampToBridge(pl.x, pl.z);
      var p2 = clampToBridge(-pl.x * 0.6, pl.z - 3.2);
      raid.telegraph = {
        name: isThor ? 'Magma Comet' : 'Void Comet',
        hint: 'COMET STRIKE — Leaves a burning pool, reposition!',
        shape: 'multi',
        meteors: true,
        leavesPool: true,
        zones: [
          { x: p1.x, z: p1.z, r: 3.2 },
          { x: p2.x, z: p2.z, r: 3.0 }
        ],
        x: p1.x,
        z: p1.z,
        dmgPct: 0.30,
        age: 0,
        life: 2.15
      };
    }
    raid.nextCastIn = stageGap;
    if (typeof skillNameFloat === 'function') skillNameFloat(raid.telegraph.name);
  }

  function chooseBossSkill(boss) {
    var dist = (typeof pl !== 'undefined' && pl) ? Math.hypot(pl.x - boss.x, pl.z - boss.z) : 2.0;
    var isRangedPlayer = dist > 3.1 || (typeof C === 'function' && C() && C().wt && /bow|staff|book|gun|instrument|whip/i.test(C().wt.join(',')));
    var hpRatio = boss.max > 0 ? boss.hp / boss.max : 1;

    // Guarantee the signature Pillar whole-floor wipe once below 78% HP, and regularly in rotation!
    if (!raid.pillarCastDone && (hpRatio <= 0.78 || raid.castSeq >= 2)) {
      raid.pillarCastDone = true;
      raid.castSeq++;
      raid.lastSkillKey = 'pillars';
      return 'pillars';
    }

    var pool = isRangedPlayer
      ? ['donut', 'seeker', 'pillars', 'cross', 'donut', 'seeker', 'cataclysm']
      : ['slam', 'donut', 'pillars', 'cross', 'seeker', 'cataclysm'];
    var candidates = pool.filter(function (k) { return k !== raid.lastSkillKey; });
    if (!candidates.length) candidates = pool;
    var key = candidates[(raid.castSeq++) % candidates.length];
    raid.lastSkillKey = key;
    return key;
  }

  function spawnBossSkill(boss, dt) {
    raid.nextCastIn -= dt;
    if (raid.nextCastIn > 0) return;

    var key = chooseBossSkill(boss);
    var hpRatio = boss.max > 0 ? boss.hp / boss.max : 1;
    var gap = hpRatio < 0.5 ? 2.8 : 3.6;
    var px = (typeof pl !== 'undefined' && pl) ? pl.x : 0;
    var pz = (typeof pl !== 'undefined' && pl) ? pl.z : 2;
    var dist = Math.hypot(px - boss.x, pz - boss.z);
    var isThor = raid.dungeonId === 'thor';

    if (key === 'pillars') {
      // Anchor boss at the epicenter while channeling the whole-floor blast so pillar shadows stay rock-solid!
      var b = fieldBounds();
      boss.x = Math.max(-b.bx + 4.5, Math.min(b.bx - 4.5, boss.x));
      boss.z = Math.max(b.z0 + 5.0, Math.min(b.z1 - 4.5, boss.z));
      boss.fixed = true;
      boss._raidPillarRoot = true;
      var pillars = spawnSanctuaryPillars(boss.x, boss.z);
      var wipeName = isThor ? 'Cataclysmic Eruption' : 'Oblivion Extinction';
      raid.telegraph = {
        name: wipeName,
        hint: wipeName.toUpperCase() + ' — HIDE BEHIND A PILLAR (green shadow away from Boss)!',
        shape: 'pillars',
        pillars: pillars,
        x: boss.x,
        z: boss.z,
        dmgPct: 0.88,
        bypassShield: true,
        mustHideBehindPillar: true,
        fx: 'abyss_requiem',
        age: 0,
        life: 4.2
      };
      gap = hpRatio < 0.5 ? 3.4 : 4.2;
      pushSystemChat('⚠ ' + boss.n + ' charges ' + wipeName + '! Hide in a Pillar shadow!');
    } else if (key === 'donut') {
      raid.telegraph = {
        name: isThor ? 'Caldera Ring' : 'Eye of Abyss',
        hint: (isThor ? 'CALDERA RING' : 'EYE OF ABYSS') + ' — Run INSIDE the safe blue ring near ' + boss.n + '!',
        shape: 'donut',
        donut: true,
        x: boss.x,
        z: boss.z,
        innerR: 3.7,
        outerR: 16.0,
        dmgPct: 0.50,
        fx: 'abyss_requiem',
        age: 0,
        life: 2.45
      };
    } else if (key === 'seeker') {
      var targetPt = dist > 2.8
        ? clampToBridge(px, pz)
        : clampToBridge(boss.x + 5.6 * Math.cos(raid.castSeq * 1.9), boss.z + 5.6 * Math.sin(raid.castSeq * 1.9));
      var flankA = clampToBridge(targetPt.x + 3.4 * Math.cos(raid.castSeq), targetPt.z - 2.8 * Math.sin(raid.castSeq));
      var flankB = clampToBridge(boss.x - (targetPt.x - boss.x) * 0.75, boss.z + 4.8);
      raid.telegraph = {
        name: isThor ? 'Pyroclasm Volley' : 'Horizon Volley',
        hint: (isThor ? 'PYROCLASM VOLLEY' : 'HORIZON VOLLEY') + ' — Hunts ranged distance & leaves burning pool!',
        shape: 'multi',
        meteors: true,
        leavesPool: true,
        zones: [
          { x: targetPt.x, z: targetPt.z, r: 3.5 },
          { x: flankA.x, z: flankA.z, r: 3.1 },
          { x: flankB.x, z: flankB.z, r: 3.1 }
        ],
        x: targetPt.x,
        z: targetPt.z,
        dmgPct: 0.45,
        fx: 'lod_harvest',
        age: 0,
        life: 2.15
      };
    } else if (key === 'cross') {
      var baseAng = (raid.castSeq % 2 === 0) ? 0 : (Math.PI / 4);
      raid.telegraph = {
        name: isThor ? 'Tectonic Cross' : 'Abyssal Cross',
        hint: (isThor ? 'TECTONIC CROSS' : 'ABYSSAL CROSS') + ' — Step into one of the 4 safe quadrants!',
        shape: 'cross',
        x: boss.x,
        z: boss.z,
        ang: baseAng,
        width: 2.8,
        len: 26,
        dmgPct: 0.50,
        fx: 'abyss_cross',
        age: 0,
        life: 2.25
      };
    } else if (key === 'cataclysm') {
      var zones = [{ x: clampToBridge(px, pz).x, z: clampToBridge(px, pz).z, r: 3.2 }];
      for (var m = 0; m < 4; m++) {
        var ang = raid.castSeq * 0.9 + m * (Math.PI / 2);
        var rad = (m % 2 === 0) ? 3.4 : 6.6;
        var pt = clampToBridge(boss.x + Math.cos(ang) * rad, boss.z + Math.sin(ang) * rad);
        zones.push({ x: pt.x, z: pt.z, r: 3.0 });
      }
      raid.telegraph = {
        name: isThor ? 'Inferno Cataclysm' : 'Starfall Cataclysm',
        hint: (isThor ? 'INFERNO CATACLYSM' : 'STARFALL CATACLYSM') + ' — Weave between the 5 falling meteors!',
        shape: 'multi',
        meteors: true,
        zones: zones,
        x: boss.x,
        z: boss.z,
        dmgPct: 0.46,
        fx: 'lod_verdict',
        age: 0,
        life: 2.35
      };
    } else {
      raid.telegraph = {
        name: isThor ? 'Magma Judgment' : 'Crimson Judgment',
        hint: (isThor ? 'MAGMA JUDGMENT' : 'CRIMSON JUDGMENT') + ' — Heavy point-blank slam! Move OUT or DODGE!',
        shape: 'circle',
        x: boss.x,
        z: boss.z,
        r: 5.5,
        dmgPct: 0.52,
        fx: 'tnt_judge',
        age: 0,
        life: 2.35
      };
    }

    raid.nextCastIn = gap;
    if (typeof skillNameFloat === 'function') skillNameFloat(raid.telegraph.name);
  }

  function applyRaidHazardDamage(dmgPct, label, opts) {
    opts = opts || {};
    if (raid.dead || typeof S === 'undefined' || !S || typeof pl === 'undefined' || !pl) return;
    if (!opts.ignoreIframes && raid.iframes > 0) {
      if (typeof addFloat === 'function') addFloat(pl.x, 2.4, pl.z, 'EVADED!', '#76eaff', true, 'evade');
      return;
    }
    var raw = Math.max(1, Math.floor((typeof maxHp === 'function' ? maxHp() : 5000) * dmgPct));
    var taken = (!opts.bypassShield && typeof absorbSoak === 'function') ? absorbSoak(raw) : raw;
    if (raw > taken) {
      raid.supportScore += (raw - taken);
    }
    var beforeHp = Math.max(0, Math.round(S.hp || 0));
    S.hp = Math.max(0, S.hp - taken);
    var actualLoss = Math.max(0, beforeHp - Math.round(S.hp || 0));
    raid.dmgTaken += actualLoss;
    raid.lastHp = Math.round(S.hp || 0);
    if (typeof hitAnim !== 'undefined') hitAnim = 1;
    if (typeof damageFloat === 'function' && typeof heroDamageY === 'function') {
      damageFloat(pl.x, heroDamageY(), pl.z, taken, true, true);
    }
    if (label && typeof addFloat === 'function') {
      addFloat(pl.x, 2.8, pl.z, label, '#ff5c78', true, 'incoming');
    }
  }

  function tickBossCleave(boss, dt) {
    if (!boss || raid.dead || typeof pl === 'undefined' || !pl) return;
    if (raid.telegraph && raid.telegraph.shape === 'pillars') return;
    raid.bossCleaveIn -= dt;
    if (raid.bossCleaveIn > 0) return;
    raid.bossCleaveIn = BOSS_CLEAVE_INTERVAL_S;
    var dist = Math.hypot(pl.x - boss.x, pl.z - boss.z);
    var pct = dist <= 4.2 ? BOSS_CLEAVE_PCT : (BOSS_CLEAVE_PCT * 0.72);
    applyRaidHazardDamage(pct, dist <= 4.2 ? 'BOSS CLEAVE' : 'ASTRAL PULSE', { bypassShield: false });
  }

  function tickVoidPools(dt) {
    if (!raid.voidPools.length) return;
    for (var i = raid.voidPools.length - 1; i >= 0; i--) {
      var vp = raid.voidPools[i];
      vp.left -= dt;
      vp.tick -= dt;
      if (vp.left <= 0) {
        raid.voidPools.splice(i, 1);
        continue;
      }
      if (vp.tick <= 0) {
        vp.tick = 0.5;
        if (!raid.dead && typeof pl !== 'undefined' && pl && Math.hypot(pl.x - vp.x, pl.z - vp.z) <= vp.r) {
          applyRaidHazardDamage(0.08, 'VOID BURN');
        }
      }
    }
  }

  function tickHazards(dt) {
    tickVoidPools(dt);

    var stages = activeStages();
    var st = stages[raid.stage];
    if (!st) return;

    var liveBoss = st.boss ? findBoss() : null;
    if (liveBoss) tickBossCleave(liveBoss, dt);

    if (!raid.telegraph) {
      if (st.boss) {
        if (liveBoss) spawnBossSkill(liveBoss, dt);
      } else {
        spawnBridgeHazard(dt);
      }
      updateMeshes();
      return;
    }

    var tg = raid.telegraph;
    tg.age += dt;
    if (st.boss && liveBoss && (tg.shape === 'circle' || tg.shape === 'donut' || tg.shape === 'cross')) {
      tg.x = liveBoss.x;
      tg.z = liveBoss.z;
    }

    if (tg.age >= tg.life) {
      raid.telegraph = null;
      releaseBossAnchor();

      // Only Stage 4 Boss triggers PGBossFx ("BOSS SKILL" banner); Stages 1–3 use clean impact shake/audio!
      if (st.boss && tg.fx && typeof triggerRaidBossFx === 'function') {
        triggerRaidBossFx(tg.fx, tg.x, tg.z, null);
      } else {
        if (typeof shake !== 'undefined' && typeof S !== 'undefined' && S && S.cameraShake !== false) {
          shake = Math.max(shake, 0.32);
        }
        if (typeof CombatAudio !== 'undefined' && CombatAudio.hit && typeof S !== 'undefined' && S) {
          CombatAudio.hit(true, S.sfx !== false, 'axe', 'skill');
        }
      }

      if (tg.leavesPool) {
        var poolPt = (Array.isArray(tg.zones) && tg.zones[0]) ? tg.zones[0] : { x: tg.x, z: tg.z };
        raid.voidPools.push({ x: poolPt.x, z: poolPt.z, r: 3.4, left: 4.5, tick: 0.35 });
        if (raid.voidPools.length > 3) raid.voidPools.shift();
      }

      if (!raid.dead && typeof pl !== 'undefined' && pl) {
        if (hitByTelegraph(tg, pl.x, pl.z)) {
          applyRaidHazardDamage(tg.dmgPct || 0.45, tg.name.toUpperCase() + '!', {
            bypassShield: Boolean(tg.bypassShield),
            ignoreIframes: Boolean(tg.mustHideBehindPillar)
          });
        } else if (tg.shape === 'pillars') {
          if (typeof addFloat === 'function') {
            addFloat(pl.x, 2.7, pl.z, 'SHIELDED BY PILLAR!', '#6effc8', true, 'evade');
          }
        }
      }
    }
    updateMeshes();
  }

  // ---------- Resizable Raid Chat ----------
  function applyChatBoxSize() {
    var box = $('raidChatBox');
    if (!box) return;
    var w = Math.max(220, Math.min(580, Math.round(raid.chatSize.w || 310)));
    var h = Math.max(148, Math.min(440, Math.round(raid.chatSize.h || 220)));
    raid.chatSize.w = w;
    raid.chatSize.h = h;
    box.style.width = w + 'px';
    if (!raid.chatMinimized) {
      box.style.height = h + 'px';
    } else {
      box.style.height = '';
    }
  }

  function setChatSize(w, h) {
    raid.chatSize = {
      w: Math.max(220, Math.min(580, Math.round(Number(w) || 310))),
      h: Math.max(148, Math.min(440, Math.round(Number(h) || 220)))
    };
    raid.chatMinimized = false;
    var box = $('raidChatBox');
    if (box) box.classList.remove('minimized');
    applyChatBoxSize();
    saveChatSize(raid.chatSize.w, raid.chatSize.h);
    return raid.chatSize;
  }

  function cycleChatPreset() {
    raid.chatPresetIdx = ((raid.chatPresetIdx || 0) + 1) % CHAT_PRESETS.length;
    var p = CHAT_PRESETS[raid.chatPresetIdx];
    setChatSize(p.w, p.h);
    var btn = $('raidChatSizeBtn');
    if (btn) btn.textContent = p.label;
    return p;
  }

  function appendChatEntry(entry) {
    raid.chatLog.push(entry);
    if (raid.chatLog.length > 50) raid.chatLog.shift();
    renderChatFeeds();
  }

  function pushSystemChat(text) {
    appendChatEntry({ id: 'sys-' + Date.now() + '-' + Math.random(), sys: true, text: String(text || '') });
  }

  function sendChat(rawText) {
    var clean = String(rawText == null ? '' : rawText).replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 160);
    if (!clean) return false;
    var p = socialParty();
    var soc = root.PGSocial && root.PGSocial.app;
    var canRelay = Boolean(p && p.members.length >= 2 && soc && soc.connected && typeof root.PGSocial.send === 'function');
    if (canRelay) {
      root.PGSocial.send({ type: 'raid_chat', text: clean });
      return true;
    }
    appendChatEntry({
      id: 'local-' + Date.now(),
      fromId: myId(),
      name: myName(),
      text: clean,
      self: true,
      sys: false
    });
    return true;
  }

  function onChat(msg) {
    if (!msg || !msg.text) return;
    var isMe = msg.fromId === myId();
    appendChatEntry({
      id: msg.id || ('net-' + Date.now()),
      fromId: msg.fromId,
      name: msg.name || 'Ally',
      text: String(msg.text).slice(0, 160),
      self: isMe,
      sys: false
    });
  }

  function renderChatListInto(el) {
    if (!el) return;
    el.innerHTML = '';
    if (!raid.chatLog.length) {
      var empty = document.createElement('div');
      empty.className = 'raid-chat-msg sys';
      empty.textContent = 'Raid comms ready — press Enter or tap a callout to chat.';
      el.appendChild(empty);
      return;
    }
    for (var i = 0; i < raid.chatLog.length; i++) {
      var m = raid.chatLog[i];
      var row = document.createElement('div');
      if (m.sys) {
        row.className = 'raid-chat-msg sys';
        row.textContent = '✦ ' + m.text;
      } else {
        row.className = 'raid-chat-msg' + (m.self ? ' me' : '');
        var who = document.createElement('b');
        who.textContent = (m.name || 'Ally') + ':';
        row.appendChild(who);
        row.appendChild(document.createTextNode(m.text));
      }
      el.appendChild(row);
    }
    el.scrollTop = el.scrollHeight;
  }

  function renderChatFeeds() {
    renderChatListInto($('raidChatFeed'));
    renderChatListInto($('raidLobbyChatFeed'));
  }

  // ---------- Party Ready Room Actions ----------
  function announceReadyState(summon) {
    if (!root.PGSocial || typeof root.PGSocial.send !== 'function') return;
    var p = socialParty();
    if (!p) return;
    var payload = {
      type: 'raid_ready',
      dungeonId: raid.lobbyDungeon || 'astral',
      cls: (typeof S !== 'undefined' && S && S.cls) || 'Adventurer',
      lv: (typeof S !== 'undefined' && S && S.lv) || 150,
      sex: (typeof S !== 'undefined' && S && S.sex === 'f') ? 'f' : 'm',
      summon: Boolean(summon)
    };
    if (!isPartyLeader()) payload.ready = Boolean(raid.myReady);
    root.PGSocial.send(payload);
  }

  function toggleReady() {
    var base = canBaseEnter(raid.lobbyDungeon);
    if (!base.ok) return false;
    if (isPartyLeader()) return false;
    raid.myReady = !raid.myReady;
    announceReadyState(false);
    renderLobby();
    return raid.myReady;
  }

  function onLobby(msg) {
    if (!msg || !Array.isArray(msg.members)) return;
    if (msg.dungeonId === 'thor' || msg.dungeonId === 'astral') {
      raid.lobbyDungeon = msg.dungeonId;
    }
    raid.lobbyRoster = {
      partyId: msg.partyId,
      leader: msg.leader,
      dungeonId: raid.lobbyDungeon,
      members: msg.members
    };
    var selfId = myId();
    for (var i = 0; i < msg.members.length; i++) {
      if (msg.members[i].id === selfId && msg.members[i].id !== msg.leader) {
        raid.myReady = Boolean(msg.members[i].ready);
      }
    }
    if (msg.summon && !raid.on && msg.leader !== selfId) {
      var lobbyEl = $('raidLobby');
      if (lobbyEl && lobbyEl.hidden) {
        raid.lobbyMode = 'party';
        lobbyEl.hidden = false;
      }
    }
    if ($('raidLobby') && !$('raidLobby').hidden) {
      renderLobby();
    }
  }

  // ---------- Party Revive & Multiplayer Sync ----------
  function downedTeammate() {
    if (raid.mode !== 'party') return null;
    for (var i = 0; i < raid.party.length; i++) {
      var m = raid.party[i];
      if (!m.self && m.dead) return m;
    }
    return null;
  }

  function revive() {
    if (!raid.on || raid.mode !== 'party' || raid.dead) return false;
    if (raid.revivesLeft <= 0 || raid.reviving) return false;
    var target = downedTeammate();
    if (!target) return false;
    raid.reviving = { targetId: target.id, targetName: target.name, left: REVIVE_CHANNEL_S };
    renderHud();
    return true;
  }

  function tickRevive(dt) {
    if (!raid.reviving) return;
    if (raid.dead || raid.revivesLeft <= 0) {
      raid.reviving = null;
      return;
    }
    var target = null;
    for (var i = 0; i < raid.party.length; i++) {
      if (raid.party[i].id === raid.reviving.targetId) { target = raid.party[i]; break; }
    }
    if (!target || !target.dead) {
      raid.reviving = null;
      return;
    }
    raid.reviving.left -= dt;
    if (raid.reviving.left <= 0) {
      var tid = raid.reviving.targetId;
      raid.reviving = null;
      raid.revivesLeft = Math.max(0, raid.revivesLeft - 1);
      raid.revivesDone = (raid.revivesDone || 0) + 1;
      raid.supportScore += 250000;
      target.dead = false;
      target.hp = Math.max(1, Math.floor((target.maxHp || 1000) * 0.3));
      if (root.PGSocial && typeof root.PGSocial.send === 'function') {
        root.PGSocial.send({ type: 'raid_revive', raidId: raid.raidId, target: tid });
      }
      pushSystemChat(myName() + ' revived ' + target.name + '!');
      if (typeof log === 'function') log('Revived ' + target.name + '! (' + raid.revivesLeft + ' revives left)', 'r4', 'misc');
      sendSync(true);
      renderHud();
    }
  }

  function selfEntry() {
    for (var i = 0; i < raid.party.length; i++) {
      if (raid.party[i].self) return raid.party[i];
    }
    return null;
  }

  function currentDps() {
    if (typeof S === 'undefined' || !S) return 0;
    var dealt = Math.max(0, (Number(S.dmg) || 0) - raid.dmg0);
    return Math.round(dealt / Math.max(1, raid.elapsed));
  }

  function refreshSelfStats() {
    var me = selfEntry();
    if (!me || typeof S === 'undefined' || !S) return;
    me.cls = S.cls || 'Adventurer';
    me.sex = S.sex === 'f' ? 'f' : 'm';
    me.appearance = myAppearance();
    me.hp = raid.dead ? 0 : Math.max(0, Math.round(S.hp || 0));
    me.maxHp = Math.max(1, Math.round(typeof maxHp === 'function' ? maxHp() : 1));
    me.dps = currentDps();
    me.dmgTaken = Math.max(0, Math.round(raid.dmgTaken || 0));
    me.support = Math.max(0, Math.round(raid.supportScore || 0));
    me.revives = Math.max(0, Math.round(raid.revivesDone || 0));
    me.stage = raid.stage;
    me.dead = raid.dead;
  }

  function sendSync(force) {
    refreshSelfStats();
    if (raid.mode !== 'party' || !raid.on) return;
    if (!root.PGSocial || typeof root.PGSocial.send !== 'function') return;
    var me = selfEntry();
    if (!me) return;
    raid.syncTimer = SYNC_INTERVAL_S;
    root.PGSocial.send({
      type: 'raid_sync',
      raidId: raid.raidId,
      hp: me.hp,
      maxHp: me.maxHp,
      dps: me.dps,
      dmgTaken: me.dmgTaken,
      support: me.support,
      revives: me.revives,
      cls: me.cls,
      sex: me.sex,
      stage: raid.stage,
      dead: raid.dead,
      force: Boolean(force)
    });
  }

  function tickPartyAssist(dt) {
    if (raid.mode !== 'party' || typeof mobs === 'undefined' || !mobs.length) return;
    var remoteDps = 0;
    for (var i = 0; i < raid.party.length; i++) {
      var m = raid.party[i];
      if (!m.self && !m.dead && m.dps > 0) remoteDps += m.dps;
    }
    if (remoteDps <= 0) return;
    var dmg = remoteDps * dt;
    var target = findBoss() || (typeof mob !== 'undefined' && mob && mob.hp > 0 ? mob : mobs[0]);
    if (!target || target.hp <= 0) return;
    target.hp -= dmg;
    if (target.hp <= 0 && typeof kill === 'function') {
      kill(target);
    }
  }

  // ---------- Start / Finish / Lifecycle ----------
  function snapshotHome() {
    if (typeof S === 'undefined' || !S) return null;
    return {
      mp: S.mp,
      lvl: S.lvl,
      hp: S.hp,
      astralOrigin: typeof astralOriginStage !== 'undefined' ? astralOriginStage : 0
    };
  }

  function restoreHome() {
    releaseBossAnchor();
    clearMeshes();
    raid._internalNav = true;
    try {
      if (typeof S !== 'undefined' && S && raid.home) {
        S.mp = raid.home.mp;
        S.lvl = raid.home.lvl;
        S.hp = typeof maxHp === 'function' ? maxHp() : Math.max(1, raid.home.hp);
        if (typeof astralOriginStage !== 'undefined') astralOriginStage = raid.home.astralOrigin || 0;
        if (typeof astralJourney !== 'undefined') astralJourney = null;
        if (typeof lastKey !== 'undefined') lastKey = '';
        if (typeof mobs !== 'undefined') mobs = [];
        if (typeof mob !== 'undefined') mob = null;
        if (typeof camps !== 'undefined') camps = [];
        if (typeof drops !== 'undefined') drops = [];
        if (typeof respawn !== 'undefined') respawn = 0.25;
      }
    } finally {
      raid._internalNav = false;
    }
  }

  function consumeDailyEntry() {
    if (isGm()) return;
    var st = raidSaveState();
    st.used = (Number(st.used) || 0) + 1;
  }

  function beginRun(mode, opts) {
    opts = opts || {};
    if (typeof S === 'undefined' || !S) return false;

    var chosenId = opts.dungeonId === 'thor' ? 'thor' : 'astral';
    var dng = dungeonDef(chosenId);

    if (root.PGSocial && root.PGSocial.app && root.PGSocial.app.visible && typeof root.PGSocial.leave === 'function') {
      root.PGSocial.leave();
    }
    if (root.PGSocial && typeof root.PGSocial.setRaidSuspend === 'function') {
      root.PGSocial.setRaidSuspend(true);
    }
    if (typeof tabs !== 'undefined' && Array.isArray(tabs)) {
      tabs.length = 0;
      if (typeof renderWin === 'function') renderWin();
    }

    consumeDailyEntry();
    raid.home = snapshotHome();
    raid.on = true;
    raid.dungeonId = chosenId;
    raid.mode = mode === 'party' ? 'party' : 'solo';
    raid.raidId = String(opts.raidId || ('solo-' + Date.now()));
    raid.seed = Number(opts.seed) || 1;
    raid.stage = 0;
    raid.startedAt = Date.now();
    raid.elapsed = 0;
    raid.limit = raid.mode === 'party' ? PARTY_LIMIT_S : SOLO_LIMIT_S;
    raid.dmg0 = Number(S.dmg) || 0;
    raid.dmgTaken = 0;
    raid.supportScore = 0;
    raid.revivesDone = 0;
    raid.dodgeCd = 0;
    raid.iframes = 0;
    raid.dead = false;
    raid.revivesLeft = raid.mode === 'party' ? MAX_PARTY_REVIVES : 0;
    raid.reviving = null;
    raid.telegraph = null;
    raid.voidPools = [];
    raid.nextCastIn = 3.2;
    raid.bossCleaveIn = BOSS_CLEAVE_INTERVAL_S;
    raid.castSeq = 0;
    raid.lastSkillKey = '';
    raid.pillarCastDone = false;
    raid.syncTimer = 0.5;
    raid.hudTimer = 0;
    raid.transition = null;
    raid.waitingPartyStart = false;
    raid.myReady = false;
    raid.keys = { w: false, a: false, s: false, d: false };
    raid.moveTarget = null;
    if (raid.mode === 'solo') raid.chatLog = [];

    S.hp = typeof maxHp === 'function' ? maxHp() : S.hp;
    raid.lastHp = Math.round(S.hp || 0);

    var selfId = myId();
    if (raid.mode === 'party' && Array.isArray(opts.members) && opts.members.length) {
      raid.party = opts.members.slice(0, 3).map(function (m) {
        var isMe = m.id === selfId || m.name === myName();
        return {
          id: m.id,
          name: m.name || 'Ally',
          cls: isMe ? (S.cls || 'Adventurer') : (m.cls || 'Adventurer'),
          sex: isMe ? (S.sex === 'f' ? 'f' : 'm') : (m.sex === 'f' ? 'f' : 'm'),
          appearance: isMe ? myAppearance() : (m.appearance || null),
          hp: isMe ? Math.round(S.hp || 1) : 100,
          maxHp: isMe ? Math.round(typeof maxHp === 'function' ? maxHp() : 100) : 100,
          dps: 0,
          dmgTaken: 0,
          support: 0,
          revives: 0,
          stage: 0,
          dead: false,
          self: isMe
        };
      });
      if (!selfEntry()) {
        raid.party.unshift({
          id: selfId, name: myName(), cls: S.cls || 'Adventurer',
          sex: S.sex === 'f' ? 'f' : 'm', appearance: myAppearance(),
          hp: Math.round(S.hp || 1), maxHp: Math.round(typeof maxHp === 'function' ? maxHp() : 1),
          dps: 0, dmgTaken: 0, support: 0, revives: 0, stage: 0, dead: false, self: true
        });
      }
    } else {
      raid.party = [{
        id: selfId,
        name: myName(),
        cls: S.cls || 'Adventurer',
        sex: S.sex === 'f' ? 'f' : 'm',
        appearance: myAppearance(),
        hp: Math.round(S.hp || 1),
        maxHp: Math.round(typeof maxHp === 'function' ? maxHp() : 1),
        dps: 0,
        dmgTaken: 0,
        support: 0,
        revives: 0,
        stage: 0,
        dead: false,
        self: true
      }];
    }

    hideLobby();
    hideResult();
    if (typeof document !== 'undefined' && document.body) document.body.classList.add('raid-open');
    buildHudDom();
    applyChatBoxSize();
    renderChatFeeds();
    spawnRaidStage(0);
    if (typeof log === 'function') {
      log('Entered ' + dng.name + ' Raid (' + (raid.mode === 'party' ? 'Party' : 'Solo') + ') — clear 3 stages and defeat ' + dng.bossName + '!', 'r4', 'misc');
    }
    if (typeof save === 'function') save();
    return true;
  }

  function start(mode, dungeonId) {
    var m = mode || raid.lobbyMode || 'solo';
    var dId = dungeonId || raid.lobbyDungeon || 'astral';
    var gate = canEnter(m, dId);
    if (!gate.ok) {
      if (typeof log === 'function') log('Raid: ' + gate.reason, 'r0', 'misc');
      return false;
    }
    if (m === 'party') {
      if (!root.PGSocial || typeof root.PGSocial.send !== 'function') return false;
      raid.lobbyDungeon = dId;
      raid.waitingPartyStart = true;
      renderLobby();
      root.PGSocial.send({ type: 'raid_start', dungeonId: dId });
      return 'waiting';
    }
    return beginRun('solo', { dungeonId: dId });
  }

  function startDirectSolo(dungeonId) {
    var dId = dungeonId || 'astral';
    var gate = canEnter('solo', dId);
    if (!gate.ok) {
      if (typeof log === 'function') log('Raid: ' + gate.reason, 'r0', 'misc');
      if (typeof renderWin === 'function') renderWin();
      return false;
    }
    return beginRun('solo', { dungeonId: dId });
  }

  function openDungeons(subMode) {
    if (raid.on) return;
    if (typeof openDungeonsTab === 'function') {
      openDungeonsTab(subMode || 'raid');
      return;
    }
    showLobby('party', 'astral');
  }

  function awardRewards(cleared) {
    var dng = activeDungeon();
    if (typeof S === 'undefined' || !S) return { shards: 0, sigils: 0, matName: dng.matName, zeny: 0, echo: 0 };
    var r = cleared ? (raid.mode === 'party' ? REWARDS.party : REWARDS.solo) : REWARDS.fail;
    if (!Array.isArray(S.ascensionMat)) S.ascensionMat = [0, 0, 0];
    var mIdx = dng.matIdx === 1 ? 1 : 0;
    S.ascensionMat[mIdx] = (Number(S.ascensionMat[mIdx]) || 0) + r.shards;
    if (r.sigils > 0) S.ascensionMat[2] = (Number(S.ascensionMat[2]) || 0) + r.sigils;
    if (r.zeny > 0) S.zeny = (Number(S.zeny) || 0) + r.zeny;
    if (r.echo > 0) S.shards = (Number(S.shards) || 0) + r.echo;

    var st = raidSaveState();
    if (cleared) {
      st.clears = (Number(st.clears) || 0) + 1;
      var secs = Math.max(1, Math.round(raid.elapsed));
      if (raid.mode === 'party') {
        if (!st.bestParty || secs < st.bestParty) st.bestParty = secs;
      } else {
        if (!st.bestSolo || secs < st.bestSolo) st.bestSolo = secs;
      }
    }
    return {
      shards: r.shards,
      sigils: r.sigils || 0,
      matName: dng.matName,
      zeny: r.zeny,
      echo: r.echo
    };
  }

  function computeCommendations(partyList) {
    var list = Array.isArray(partyList) && partyList.length ? partyList : [];
    if (!list.length) return { byId: {} };

    var bestDps = list[0];
    var bestTank = list[0];
    var bestSup = list[0];

    for (var i = 1; i < list.length; i++) {
      var p = list[i];
      if ((p.dps || 0) > (bestDps.dps || 0)) bestDps = p;
      if ((p.dmgTaken || 0) > (bestTank.dmgTaken || 0)) bestTank = p;

      var pSup = (p.support || 0) + (p.revives || 0) * 250000 + (SUPPORT_CLASS_RE.test(p.cls || '') ? 500 : 0);
      var curSup = (bestSup.support || 0) + (bestSup.revives || 0) * 250000 + (SUPPORT_CLASS_RE.test(bestSup.cls || '') ? 500 : 0);
      if (pSup > curSup) bestSup = p;
    }

    var byId = {};
    function give(member, badge) {
      if (!member) return;
      var key = String(member.id != null ? member.id : member.name);
      if (!byId[key]) byId[key] = [];
      byId[key].push(badge);
    }
    give(bestDps, { kind: 'dps', label: '⚔ High DPS' });
    give(bestTank, { kind: 'tank', label: '🛡 Taken Highest Damage' });
    give(bestSup, { kind: 'sup', label: '✚ Best Support' });
    return {
      byId: byId,
      highDps: bestDps,
      highestDamageTaken: bestTank,
      bestSupport: bestSup
    };
  }

  function finish(cleared, reason, fromNetwork) {
    if (!raid.on) return;
    var dng = activeDungeon();
    refreshSelfStats();
    var elapsed = Math.max(1, Math.round(raid.elapsed));
    var me = selfEntry();
    var myFinalDps = me ? me.dps : currentDps();
    var partySnap = raid.party.map(function (p) { return Object.assign({}, p); });
    var mode = raid.mode;
    var rid = raid.raidId;

    raid.on = false;
    raid.dead = false;
    raid.reviving = null;
    raid.telegraph = null;
    raid.voidPools = [];
    raid.transition = null;
    raid.moveTarget = null;
    raid.myReady = false;
    raid.keys = { w: false, a: false, s: false, d: false };

    if (!fromNetwork && mode === 'party' && root.PGSocial && typeof root.PGSocial.send === 'function') {
      root.PGSocial.send({
        type: 'raid_end',
        raidId: rid,
        cleared: Boolean(cleared),
        reason: reason || (cleared ? 'boss_down' : 'failed'),
        secs: elapsed,
        dps: myFinalDps,
        dmgTaken: me ? me.dmgTaken : raid.dmgTaken,
        support: me ? me.support : raid.supportScore,
        revives: me ? me.revives : raid.revivesDone
      });
    }

    var paid = awardRewards(Boolean(cleared));
    restoreHome();
    if (root.PGSocial && typeof root.PGSocial.setRaidSuspend === 'function') {
      root.PGSocial.setRaidSuspend(false);
    }
    if (typeof document !== 'undefined' && document.body) document.body.classList.remove('raid-open');
    var hud = $('raidHud');
    if (hud) hud.hidden = true;

    var comms = computeCommendations(partySnap);
    raid.result = {
      dungeonName: dng.name,
      bossName: dng.bossName,
      cleared: Boolean(cleared),
      reason: reason || (cleared ? (dng.bossName + ' defeated!') : 'Raid failed'),
      mode: mode,
      secs: elapsed,
      dps: myFinalDps,
      party: partySnap,
      commendations: comms,
      rewards: paid
    };
    showResult(raid.result);
    if (typeof ui === 'function') ui();
    if (typeof save === 'function') save();
  }

  function leave() {
    if (!raid.on) return;
    finish(false, 'Left the raid.', false);
  }

  function checkPartyWipe() {
    if (!raid.on || raid.mode !== 'party') return;
    var anyAlive = false;
    for (var i = 0; i < raid.party.length; i++) {
      if (!raid.party[i].dead) { anyAlive = true; break; }
    }
    if (!anyAlive) {
      finish(false, 'All party members fell — party wipe!', false);
    }
  }

  function handlePlayerDown() {
    if (!raid.on || raid.dead) return;
    if (raid.mode === 'solo') {
      finish(false, 'You were defeated — solo runs have no revive.', false);
      return;
    }
    raid.dead = true;
    raid.reviving = null;
    raid.moveTarget = null;
    if (typeof S !== 'undefined' && S) S.hp = 0;
    raid.lastHp = 0;
    if (typeof swing !== 'undefined') swing = null;
    pushSystemChat(myName() + ' has fallen! Teammates can channel Revive.');
    sendSync(true);
    renderHud();
    checkPartyWipe();
  }

  function beginStageAdvance() {
    var dng = activeDungeon();
    var stages = dng.stages;
    var nextIdx = raid.stage + 1;
    if (nextIdx >= stages.length) {
      finish(true, dng.bossName + ' defeated!', false);
      return;
    }
    var fromAstral = stages[raid.stage].astralStage;
    var toAstral = stages[nextIdx].astralStage;
    raid.telegraph = null;
    raid.voidPools = [];
    raid.moveTarget = null;
    releaseBossAnchor();
    updateMeshes();

    var startedWalk = false;
    if (dng.mapId === 10 && typeof startAstralJourney === 'function') {
      startedWalk = startAstralJourney(fromAstral, toAstral);
    }
    raid.transition = {
      nextIdx: nextIdx,
      fallbackLeft: startedWalk ? 8.0 : 0.55
    };
    renderHud();
  }

  // ---------- Per-frame Tick ----------
  function trackHpDeltas(step) {
    if (typeof S === 'undefined' || !S) return;
    var curHp = Math.max(0, Math.round(S.hp || 0));
    if (curHp < raid.lastHp) {
      raid.dmgTaken += (raid.lastHp - curHp);
    } else if (curHp > raid.lastHp && !raid.dead) {
      raid.supportScore += (curHp - raid.lastHp);
    }
    raid.lastHp = curHp;
    if (!raid.dead && SUPPORT_CLASS_RE.test(S.cls || '')) {
      raid.supportScore += Math.round(320 * step);
    }
  }

  function tick(dt) {
    if (!raid.on) return;
    var step = Math.max(0, Math.min(0.25, Number(dt) || 0));
    raid.elapsed += step;
    if (raid.dodgeCd > 0) raid.dodgeCd = Math.max(0, raid.dodgeCd - step);
    if (raid.iframes > 0) raid.iframes = Math.max(0, raid.iframes - step);

    trackHpDeltas(step);

    if (raid.elapsed >= raid.limit) {
      finish(false, 'Time limit reached (' + fmtClock(raid.limit) + ').', false);
      return;
    }

    if (typeof S !== 'undefined' && S && S.hp <= 0 && !raid.dead) {
      handlePlayerDown();
      if (!raid.on) return;
    }

    if (raid.transition) {
      raid.transition.fallbackLeft -= step;
      var journeyActive = activeDungeon().mapId === 10 && typeof astralJourney !== 'undefined' && Boolean(astralJourney);
      if (!journeyActive || raid.transition.fallbackLeft <= 0) {
        var nxt = raid.transition.nextIdx;
        raid.transition = null;
        spawnRaidStage(nxt);
      }
      return;
    }

    tickHazards(step);
    tickRevive(step);
    tickPartyAssist(step);

    if (typeof mobs !== 'undefined' && Array.isArray(mobs) && mobs.length === 0) {
      beginStageAdvance();
      if (!raid.on) return;
    }

    raid.syncTimer -= step;
    if (raid.syncTimer <= 0) sendSync(false);

    raid.hudTimer -= step;
    if (raid.hudTimer <= 0) {
      raid.hudTimer = 0.16;
      refreshSelfStats();
      updateHud();
    }
  }

  // ---------- Multiplayer Event Handlers ----------
  function onStarted(msg) {
    if (!msg) return;
    if (!isFourthUnlocked() || (!isGm() && raidLeftToday() <= 0)) {
      raid.waitingPartyStart = false;
      renderLobby();
      return;
    }
    beginRun('party', {
      dungeonId: msg.dungeonId || raid.lobbyDungeon || 'astral',
      raidId: msg.raidId,
      seed: msg.seed,
      members: msg.members || []
    });
  }

  function onSync(msg) {
    if (!raid.on || raid.mode !== 'party' || !msg) return;
    var sender = msg.fromId;
    if (sender === myId()) return;
    var slot = null;
    for (var i = 0; i < raid.party.length; i++) {
      if (raid.party[i].id === sender) { slot = raid.party[i]; break; }
    }
    if (!slot && raid.party.length < 3) {
      slot = {
        id: sender, name: msg.name || 'Ally', cls: msg.cls || 'Adventurer',
        sex: msg.sex === 'f' ? 'f' : 'm', appearance: null,
        hp: 100, maxHp: 100, dps: 0, dmgTaken: 0, support: 0, revives: 0, stage: 0, dead: false, self: false
      };
      raid.party.push(slot);
    }
    if (!slot) return;
    if (msg.name) slot.name = String(msg.name).slice(0, 20);
    if (msg.cls) slot.cls = String(msg.cls).slice(0, 24);
    if (msg.sex === 'f' || msg.sex === 'm') slot.sex = msg.sex;
    slot.hp = Math.max(0, Number(msg.hp) || 0);
    slot.maxHp = Math.max(1, Number(msg.maxHp) || 1);
    slot.dps = Math.max(0, Math.min(5e9, Number(msg.dps) || 0));
    if (msg.dmgTaken != null) slot.dmgTaken = Math.max(0, Number(msg.dmgTaken) || 0);
    if (msg.support != null) slot.support = Math.max(0, Number(msg.support) || 0);
    if (msg.revives != null) slot.revives = Math.max(0, Number(msg.revives) || 0);
    slot.stage = Math.max(0, Math.min(3, Number(msg.stage) || 0));
    slot.dead = Boolean(msg.dead);

    if (slot.stage > raid.stage && !raid.transition) {
      spawnRaidStage(slot.stage);
    }
    checkPartyWipe();
    updateHud();
  }

  function onRevive(msg) {
    if (!raid.on || raid.mode !== 'party' || !msg) return;
    raid.revivesLeft = Math.max(0, raid.revivesLeft - 1);
    var selfId = myId();
    for (var i = 0; i < raid.party.length; i++) {
      var p = raid.party[i];
      if (p.id === msg.fromId && !p.self) {
        p.revives = (p.revives || 0) + 1;
        p.support = (p.support || 0) + 250000;
      }
      if (p.id === msg.target || (p.self && msg.target === selfId)) {
        p.dead = false;
        p.hp = Math.max(1, Math.floor(p.maxHp * 0.3));
        if (p.self && raid.dead) {
          raid.dead = false;
          if (typeof S !== 'undefined' && S && typeof maxHp === 'function') {
            S.hp = Math.max(1, Math.ceil(maxHp() * 0.3));
            raid.lastHp = Math.round(S.hp);
          }
          if (typeof addFloat === 'function' && typeof pl !== 'undefined' && pl) {
            addFloat(pl.x, 2.6, pl.z, 'REVIVED!', '#7ef0b8', true, 'heal');
          }
          sendSync(true);
        }
      }
    }
    if (msg.fromName) pushSystemChat(msg.fromName + ' revived a fallen teammate!');
    updateHud();
  }

  function onEnded(msg) {
    if (!raid.on || raid.mode !== 'party' || !msg) return;
    if (msg.fromId != null) {
      for (var i = 0; i < raid.party.length; i++) {
        if (raid.party[i].id === msg.fromId && !raid.party[i].self) {
          if (msg.dps != null) raid.party[i].dps = Math.max(0, Number(msg.dps) || 0);
          if (msg.dmgTaken != null) raid.party[i].dmgTaken = Math.max(0, Number(msg.dmgTaken) || 0);
          if (msg.support != null) raid.party[i].support = Math.max(0, Number(msg.support) || 0);
          if (msg.revives != null) raid.party[i].revives = Math.max(0, Number(msg.revives) || 0);
        }
      }
    }
    finish(Boolean(msg.cleared), msg.reason || (msg.cleared ? (activeDungeon().bossName + ' defeated!') : 'Raid ended by party.'), true);
  }

  function onError(msg) {
    raid.waitingPartyStart = false;
    renderLobby();
    var txt = msg && (msg.message || msg.text);
    if (txt && typeof log === 'function') log('Raid: ' + txt, 'r0', 'misc');
  }

  // ---------- UI: Party Ready Room Modal ----------
  function showLobby(preferredMode, dungeonId) {
    if (raid.on) return;
    if (dungeonId && DUNGEONS[dungeonId] && !DUNGEONS[dungeonId].comingSoon) {
      raid.lobbyDungeon = dungeonId;
    }
    if (preferredMode === 'solo' || preferredMode === 'party') {
      raid.lobbyMode = preferredMode;
    } else {
      raid.lobbyMode = 'party';
    }
    var el = $('raidLobby');
    if (!el) return;
    el.hidden = false;
    if (raid.lobbyMode === 'party' && socialParty()) {
      announceReadyState(isPartyLeader());
    }
    renderLobby();
  }

  function hideLobby() {
    var el = $('raidLobby');
    if (el) el.hidden = true;
    raid.waitingPartyStart = false;
    paintActivePortraits();
  }

  function renderLobby() {
    var box = $('raidLobbyBody');
    if (!box) return;
    var mode = raid.lobbyMode || 'party';
    var dng = dungeonDef(raid.lobbyDungeon || 'astral');
    var baseGate = canBaseEnter(dng.id);
    var gate = canEnter(mode, dng.id);
    var left = raidLeftToday();
    var p = socialParty();
    var st = raidSaveState();
    var portraitsToPaint = [];

    var partyHtml = '';
    if (mode === 'party') {
      if (p && p.members.length >= 2) {
        var members = lobbyMembers();
        var readyCnt = members.filter(function (m) { return m.ready; }).length;
        var allReady = allPartyMembersReady();
        var slotsHtml = '';
        for (var sIdx = 0; sIdx < 3; sIdx++) {
          var mem = members[sIdx];
          if (mem) {
            var cid = 'raidLobbyPortrait_' + sIdx;
            portraitsToPaint.push({ canvasId: cid, info: mem });
            slotsHtml +=
              '<div class="raid-ready-card' + (mem.ready ? ' is-ready' : '') + '">' +
                '<span class="raid-role-tag' + (mem.leader ? ' leader' : '') + '">' +
                  (mem.leader ? '👑 Party Leader' : 'Party Member') +
                '</span>' +
                '<div class="raid-pedestal">' +
                  '<canvas id="' + cid + '" class="raid-portrait-canvas" width="104" height="112"></canvas>' +
                '</div>' +
                '<div class="raid-ready-name">' + escHtml(mem.name) + (mem.self ? ' (You)' : '') + '</div>' +
                '<div class="raid-ready-cls">Lv ' + escHtml(mem.lv) + ' · ' + escHtml(mem.cls) + '</div>' +
                '<span class="raid-ready-pill' + (mem.ready ? ' ok' : '') + '">' +
                  (mem.leader ? '★ LEADER' : (mem.ready ? '✓ READY' : '⏳ NOT READY')) +
                '</span>' +
              '</div>';
          } else {
            slotsHtml +=
              '<div class="raid-ready-card is-empty">' +
                '<span class="raid-role-tag">Open Slot</span>' +
                '<div class="raid-ready-cls">2–3 Players Supported</div>' +
              '</div>';
          }
        }

        partyHtml =
          '<div class="raid-party-box">' +
            '<div class="raid-party-head">' +
              '<span><b>Party Ready Room — ' + escHtml(dng.name) + '</b> (' + members.length + '/3 Adventurers)</span>' +
              '<div class="raid-party-head-actions">' +
                (isPartyLeader() ? '<button type="button" class="raid-link-btn" data-raid-act="summon">📣 Summon Party</button>' : '') +
                '<span class="raid-ready-count' + (allReady ? ' all' : '') + '">' + readyCnt + '/' + members.length + ' READY</span>' +
              '</div>' +
            '</div>' +
            '<div class="raid-ready-grid">' + slotsHtml + '</div>' +
            '<div class="raid-lobby-chat">' +
              '<div class="raid-lobby-chat-log" id="raidLobbyChatFeed"></div>' +
              '<form class="raid-chat-form" id="raidLobbyChatForm">' +
                '<input id="raidLobbyChatInput" class="raid-chat-input" type="text" maxlength="160" autocomplete="off" placeholder="Chat with your party before launch…">' +
                '<button type="submit" class="raid-chat-send">Send</button>' +
              '</form>' +
            '</div>' +
          '</div>';
      } else {
        partyHtml =
          '<div class="raid-party-box">' +
            '<div class="raid-party-empty">' +
              '<span>No 2–3 player party active. Invite real players in the Social Hub Plaza first!</span>' +
              '<button type="button" class="raid-link-btn" data-raid-act="plaza">Open Social Hub</button>' +
            '</div>' +
          '</div>';
      }
    } else {
      var soloCid = 'raidLobbyPortrait_solo';
      portraitsToPaint.push({
        canvasId: soloCid,
        info: {
          id: myId(),
          name: myName(),
          cls: (typeof S !== 'undefined' && S && S.cls) || 'Adventurer',
          lv: (typeof S !== 'undefined' && S && S.lv) || 150,
          sex: (typeof S !== 'undefined' && S && S.sex === 'f') ? 'f' : 'm',
          appearance: myAppearance(),
          self: true
        }
      });
      partyHtml =
        '<div class="raid-party-box solo-note" style="display:flex;align-items:center;gap:14px;">' +
          '<div class="raid-pedestal" style="flex:none;width:84px;height:92px;">' +
            '<canvas id="' + soloCid + '" class="raid-portrait-canvas" width="84" height="92" style="width:84px;height:92px;"></canvas>' +
          '</div>' +
          '<div><b>Solo Challenger: ' + escHtml(myName()) + '</b><br>' +
          'Challenge ' + escHtml(dng.name) + ' (' + escHtml(dng.bossName) + '). Solo death ends the run immediately (no revive).</div>' +
        '</div>';
    }

    var stagesHtml = dng.stages.map(function (s, i) {
      return '<div class="raid-stage-item' + (s.boss ? ' boss' : '') + '">' +
        '<span class="raid-stage-num">' + (i + 1) + '</span>' +
        '<div><b>' + escHtml(s.name) + (s.boss ? ' <em>BOSS</em>' : '') + '</b><small>' + escHtml(s.desc) + '</small></div>' +
      '</div>';
    }).join('');

    var entriesText = isGm()
      ? '<b class="raid-gm-tag">∞ Unlimited (GM)</b>'
      : '<b>' + left + ' / ' + DAILY_LIMIT + '</b>';

    var primaryBtnHtml = '';
    if (mode === 'party' && p && p.members.length >= 2 && !isPartyLeader()) {
      primaryBtnHtml =
        '<button type="button" class="raid-ready-btn' + (raid.myReady ? ' is-on' : '') + '" data-raid-act="toggle-ready" ' + (!baseGate.ok ? 'disabled' : '') + '>' +
          (raid.myReady ? '✓ Ready! (Click to Unready)' : '✓ Press Ready') +
        '</button>';
    } else if (mode === 'party') {
      var allOk = gate.ok && !raid.waitingPartyStart;
      var startLabel = raid.waitingPartyStart
        ? 'Launching Party Raid…'
        : (allPartyMembersReady() ? '⚔ Start Party Raid (All Ready!)' : '⏳ Start Party Raid (Waiting for Ready)');
      primaryBtnHtml =
        '<button type="button" class="raid-start-btn" data-raid-act="start" ' + (!allOk ? 'disabled' : '') + '>' +
          startLabel +
        '</button>';
    } else {
      primaryBtnHtml =
        '<button type="button" class="raid-start-btn" data-raid-act="start" ' + (!gate.ok ? 'disabled' : '') + '>' +
          '⚔ Start Solo Raid' +
        '</button>';
    }

    var statusNote = '';
    if (mode === 'party' && p && p.members.length >= 2 && !isPartyLeader()) {
      statusNote = !baseGate.ok
        ? '<span class="raid-gate-err">' + escHtml(baseGate.reason) + '</span>'
        : '<span style="color:#8ef4c6;font-weight:700;">' + (raid.myReady ? 'Ready confirmed — waiting for Party Leader to Start!' : 'Press Ready so your Party Leader can launch!') + '</span>';
    } else if (!gate.ok) {
      statusNote = '<span class="raid-gate-err">' + escHtml(gate.reason) + '</span>';
    }

    box.innerHTML =
      '<div class="raid-banner">' +
        '<img src="' + escHtml(dng.banner || dng.img) + '" alt="">' +
        '<div class="raid-banner-shade"></div>' +
        '<div class="raid-banner-copy">' +
          '<span class="raid-eyebrow">PARTY RAID READY ROOM · ' + escHtml(dng.name.toUpperCase()) + '</span>' +
          '<h2>' + escHtml(dng.name) + ' — Party Preview</h2>' +
          '<p>Everyone presses Ready · Party Leader presses Start · 15:00 limit · 3 shared revives</p>' +
        '</div>' +
        '<button type="button" class="raid-close-x" data-raid-act="close" aria-label="Close">×</button>' +
      '</div>' +
      partyHtml +
      '<div class="raid-stages-grid">' + stagesHtml + '</div>' +
      '<div class="raid-rewards-bar">' +
        '<div><b>Party Clear</b><span>30 ' + escHtml(dng.matName) + ' · 1 Valkyrie\'s Sigil · 750,000 Zeny · 150 Echo Shards</span></div>' +
      '</div>' +
      '<div class="raid-lobby-foot">' +
        '<div class="raid-meta-line">' +
          '<span>Entries left today: ' + entriesText + (st.clears ? ' · Total clears: <b>' + st.clears + '</b>' : '') + '</span>' +
          statusNote +
        '</div>' +
        '<div class="raid-foot-btns">' +
          primaryBtnHtml +
          '<button type="button" class="raid-cancel-btn" data-raid-act="close">Back</button>' +
        '</div>' +
      '</div>';

    renderChatFeeds();
    registerPortraits(portraitsToPaint);
  }

  // ---------- UI: Persistent Active Raid HUD (with Resizable Raid Chat & Stage-4-Only Boss HP Bar) ----------
  function buildHudDom() {
    var hud = $('raidHud');
    if (!hud) return;
    hud.hidden = false;
    if (raid.hudBuilt) return;
    raid.hudBuilt = true;
    hud.innerHTML =
      '<div class="raid-hud-top">' +
        '<div class="raid-stage-pill">' +
          '<div class="raid-pips" id="raidPips"></div>' +
          '<div class="raid-stage-text"><b id="raidStageName"></b><small id="raidStageSub"></small></div>' +
          '<div class="raid-clock" id="raidClock"></div>' +
        '</div>' +
        '<div class="raid-boss-wrap" id="raidBossWrap" hidden style="display:none">' +
          '<div class="raid-boss-top"><b id="raidBossName"></b><span class="raid-boss-phase" id="raidBossPhase">PHASE I</span></div>' +
          '<div class="raid-boss-bar"><i id="raidBossFill"></i><span class="raid-boss-hp-num" id="raidBossHpText"></span></div>' +
        '</div>' +
        '<div class="raid-cast-banner" id="raidCastBar" hidden style="display:none"><i id="raidCastFill"></i><span id="raidCastText"></span></div>' +
      '</div>' +
      '<div class="raid-hud-left">' +
        '<div class="raid-card">' +
          '<div class="raid-card-hd"><span>RAID PARTY</span><span id="raidPartyAlive"></span></div>' +
          '<div id="raidPartyRows"></div>' +
        '</div>' +
        '<div class="raid-card">' +
          '<div class="raid-card-hd"><span>DPS METER</span><span id="raidTotalDps"></span></div>' +
          '<div id="raidDpsRows"></div>' +
        '</div>' +
      '</div>' +
      '<div class="raid-chat-box" id="raidChatBox">' +
        '<div class="raid-chat-hd">' +
          '<span>💬 RAID CHAT</span>' +
          '<div class="raid-chat-hd-btns">' +
            '<button type="button" class="raid-chat-size-btn" id="raidChatSizeBtn" data-raid-act="cycle-chat-size" title="Cycle Chat Size (S / M / L)">M</button>' +
            '<button type="button" class="raid-chat-min-btn" data-raid-act="toggle-chat" title="Minimize/Expand Chat">–</button>' +
            '<span class="raid-chat-resize-grip" data-raid-chat-resize="1" title="Drag to resize chat box">⤡</span>' +
          '</div>' +
        '</div>' +
        '<div class="raid-chat-feed" id="raidChatFeed"></div>' +
        '<div class="raid-chat-quick">' +
          '<button type="button" class="raid-quick-pill" data-raid-quick="Hide behind Pillar!">Behind Pillar!</button>' +
          '<button type="button" class="raid-quick-pill" data-raid-quick="Stack IN near boss!">Stack IN!</button>' +
          '<button type="button" class="raid-quick-pill" data-raid-quick="Need Revive please!">Help / Revive!</button>' +
          '<button type="button" class="raid-quick-pill" data-raid-quick="Nice clear! GG!">GG!</button>' +
        '</div>' +
        '<form class="raid-chat-form" id="raidChatForm">' +
          '<input id="raidChatInput" class="raid-chat-input" type="text" maxlength="160" autocomplete="off" placeholder="Enter to chat…">' +
          '<button type="submit" class="raid-chat-send">Send</button>' +
        '</form>' +
      '</div>' +
      '<div class="raid-hud-bottom">' +
        '<div class="raid-move-hint">WASD / Click floor to move · <b>SPACE</b> to DODGE · <b>ENTER</b> to Chat</div>' +
        '<div class="raid-actions">' +
          '<button type="button" class="raid-revive-btn" id="raidReviveBtn" data-raid-act="revive" hidden></button>' +
          '<button type="button" class="raid-dodge-btn" id="raidDodgeBtn" data-raid-act="dodge"></button>' +
          '<button type="button" class="raid-leave-btn" data-raid-act="leave" title="Leave Raid">Leave</button>' +
        '</div>' +
      '</div>';
    applyChatBoxSize();
  }

  function updateHud() {
    if (!raid.on) return;
    buildHudDom();
    var stages = activeStages();
    var st = stages[raid.stage] || stages[0];
    var rem = Math.max(0, raid.limit - raid.elapsed);

    var pipsEl = $('raidPips');
    if (pipsEl) {
      pipsEl.innerHTML = stages.map(function (s, i) {
        var cls = i < raid.stage ? 'done' : (i === raid.stage ? 'now' : '');
        return '<span class="raid-pip ' + cls + '">' + (s.boss ? '☠' : (i + 1)) + '</span>';
      }).join('');
    }
    var stName = $('raidStageName');
    if (stName) stName.textContent = (raid.stage + 1) + '/4 · ' + st.name;

    var mobsLeft = (typeof mobs !== 'undefined' && Array.isArray(mobs)) ? mobs.length : 0;
    var stSub = $('raidStageSub');
    if (stSub) {
      stSub.textContent = raid.transition
        ? 'Advancing to the next stage…'
        : (st.boss ? 'Sanctum Boss Encounter' : (mobsLeft + (mobsLeft === 1 ? ' enemy' : ' enemies') + ' left · Arena under fire'));
    }

    var clk = $('raidClock');
    if (clk) {
      clk.textContent = '⏱ ' + fmtClock(rem) + ' / ' + fmtClock(raid.limit);
      clk.className = 'raid-clock' + (rem < 90 ? ' warn' : '');
    }

    // Show Boss HP Bar ONLY when actively fighting the Stage 4 Boss!
    var bossWrap = $('raidBossWrap');
    var boss = (st && st.boss && !raid.transition) ? findBoss() : null;
    if (bossWrap) {
      if (boss && boss.hp > 0) {
        bossWrap.hidden = false;
        bossWrap.style.display = '';
        var bpct = Math.max(0, Math.min(100, (boss.hp / Math.max(1, boss.max)) * 100));
        $('raidBossName').textContent = '☠ ' + boss.n;
        $('raidBossPhase').textContent = bpct <= 50 ? 'PHASE II · ENRAGED' : 'PHASE I · SANCTUM';
        $('raidBossHpText').textContent = fmtNum(boss.hp) + ' / ' + fmtNum(boss.max) + '  (' + bpct.toFixed(1) + '%)';
        $('raidBossFill').style.width = bpct.toFixed(1) + '%';
      } else {
        bossWrap.hidden = true;
        bossWrap.style.display = 'none';
      }
    }

    var castEl = $('raidCastBar');
    if (castEl) {
      if (raid.telegraph) {
        castEl.hidden = false;
        castEl.style.display = '';
        var extraCls = raid.telegraph.shape === 'pillars' ? ' pillars' : (raid.telegraph.donut ? ' donut' : '');
        castEl.className = 'raid-cast-banner' + extraCls;
        var castLeft = Math.max(0, raid.telegraph.life - raid.telegraph.age);
        var cpct = Math.max(0, Math.min(100, (raid.telegraph.age / Math.max(0.1, raid.telegraph.life)) * 100));
        var cfill = $('raidCastFill');
        if (cfill) cfill.style.width = cpct.toFixed(1) + '%';
        var ctxt = $('raidCastText');
        if (ctxt) ctxt.textContent = '⚠ ' + (raid.telegraph.hint || raid.telegraph.name) + ' (' + castLeft.toFixed(1) + 's)';
      } else {
        castEl.hidden = true;
        castEl.style.display = 'none';
      }
    }

    var aliveCnt = raid.party.filter(function (p) { return !p.dead; }).length;
    var aliveEl = $('raidPartyAlive');
    if (aliveEl) aliveEl.textContent = aliveCnt + '/' + raid.party.length + ' ALIVE';

    var partyRowsEl = $('raidPartyRows');
    if (partyRowsEl) {
      partyRowsEl.innerHTML = raid.party.map(function (p) {
        var pct = p.dead ? 0 : Math.max(0, Math.min(100, Math.round((p.hp / Math.max(1, p.maxHp)) * 100)));
        return '<div class="raid-member' + (p.dead ? ' dead' : (pct < 35 ? ' low' : '')) + '">' +
          '<div class="raid-member-top">' +
            '<b>' + escHtml(p.name) + (p.self ? ' (You)' : '') + '</b>' +
            '<small>' + escHtml(p.cls || '') + '</small>' +
          '</div>' +
          '<div class="raid-hp-bar"><i style="width:' + pct + '%"></i></div>' +
          '<div class="raid-member-sub"><span>' + (p.dead ? '☠ DOWNED' : (fmtNum(p.hp) + ' / ' + fmtNum(p.maxHp))) + '</span><span>' + pct + '%</span></div>' +
        '</div>';
      }).join('');
    }

    var totalDps = 0;
    for (var i = 0; i < raid.party.length; i++) totalDps += raid.party[i].dps || 0;
    var totEl = $('raidTotalDps');
    if (totEl) totEl.textContent = fmtNum(totalDps) + '/s';

    var sorted = raid.party.slice().sort(function (a, b) { return (b.dps || 0) - (a.dps || 0); });
    var topDps = Math.max(1, sorted[0] ? sorted[0].dps : 1);
    var dpsRowsEl = $('raidDpsRows');
    if (dpsRowsEl) {
      dpsRowsEl.innerHTML = sorted.map(function (p) {
        var share = totalDps > 0 ? Math.round(((p.dps || 0) / totalDps) * 100) : 0;
        var barW = Math.max(3, Math.round(((p.dps || 0) / topDps) * 100));
        return '<div class="raid-dps-row">' +
          '<i style="width:' + barW + '%"></i>' +
          '<span>' + escHtml(p.name) + '</span>' +
          '<b>' + fmtNum(p.dps || 0) + '/s (' + share + '%)</b>' +
        '</div>';
      }).join('');
    }

    var dodgeBtn = $('raidDodgeBtn');
    if (dodgeBtn) {
      dodgeBtn.disabled = raid.dead || raid.dodgeCd > 0;
      dodgeBtn.innerHTML = raid.dodgeCd > 0
        ? 'DODGE · ' + raid.dodgeCd.toFixed(1) + 's'
        : '💨 DODGE <small>SPACE</small>';
    }

    var revBtn = $('raidReviveBtn');
    if (revBtn) {
      if (raid.mode === 'party') {
        revBtn.hidden = false;
        var ally = downedTeammate();
        revBtn.disabled = raid.dead || !ally || raid.revivesLeft <= 0 || Boolean(raid.reviving);
        revBtn.textContent = raid.reviving
          ? ('Channeling Revive… ' + raid.reviving.left.toFixed(1) + 's')
          : ('✚ REVIVE' + (ally ? ' ' + ally.name : '') + ' (' + raid.revivesLeft + ')');
      } else {
        revBtn.hidden = true;
      }
    }
  }

  function renderHud() {
    updateHud();
  }

  // ---------- UI: End-of-Raid Commendation & Loot Showcase Popup ----------
  function showResult(res) {
    var el = $('raidResult');
    if (!el || !res) return;
    var body = $('raidResultBody') || el;
    el.hidden = false;

    var partyList = Array.isArray(res.party) && res.party.length ? res.party : [];
    var comms = res.commendations || computeCommendations(partyList);
    var rew = res.rewards || { shards: 0, sigils: 0, matName: 'Astral Shards', zeny: 0, echo: 0 };
    var matLabel = rew.matName || 'Astral Shards';
    var dngTitle = (res.dungeonName || 'Astral Citadel').toUpperCase();
    var bossTitle = res.bossName || 'Thanatos';
    var portraitsToPaint = [];

    var showcaseHtml = partyList.map(function (p, idx) {
      var key = String(p.id != null ? p.id : p.name);
      var badges = (comms.byId && comms.byId[key]) || [];
      var cid = 'raidResultPortrait_' + idx;
      portraitsToPaint.push({ canvasId: cid, info: p });

      var badgesHtml = badges.map(function (b) {
        return '<span class="raid-badge ' + escHtml(b.kind) + '">' + escHtml(b.label) + '</span>';
      }).join('');

      var supLabel = fmtNum(p.support || 0) + (p.revives ? ' (' + p.revives + ' Rev)' : '');
      return '<div class="raid-showcase-card' + (p.self ? ' is-self' : '') + '">' +
        '<div class="raid-comm-badges">' + badgesHtml + '</div>' +
        '<div class="raid-pedestal">' +
          '<canvas id="' + cid + '" class="raid-portrait-canvas" width="108" height="118"></canvas>' +
        '</div>' +
        '<div class="raid-ready-name">' + escHtml(p.name) + (p.self ? ' (You)' : '') + '</div>' +
        '<div class="raid-ready-cls">' + escHtml(p.cls || 'Adventurer') + '</div>' +
        '<div class="raid-showcase-stats">' +
          '<div><span>DPS</span><b>' + fmtNum(p.dps || 0) + '/s</b></div>' +
          '<div><span>Damage Taken</span><b>' + fmtNum(p.dmgTaken || 0) + '</b></div>' +
          '<div><span>Support Score</span><b>' + supLabel + '</b></div>' +
        '</div>' +
      '</div>';
    }).join('');

    var lootTiles = [];
    if (rew.shards > 0) {
      lootTiles.push(
        '<div class="raid-loot-item">' +
          '<span class="raid-loot-icon">✦</span>' +
          '<div class="raid-loot-meta"><b>+' + rew.shards + ' ' + escHtml(matLabel) + '</b><small>' + (res.cleared ? 'Sanctum Trophy' : 'Consolation Drop') + '</small></div>' +
        '</div>'
      );
    }
    if (rew.sigils > 0) {
      lootTiles.push(
        '<div class="raid-loot-item">' +
          '<span class="raid-loot-icon">♛</span>' +
          '<div class="raid-loot-meta"><b>+' + rew.sigils + ' Valkyrie\'s Sigil</b><small>Mythic Evolution</small></div>' +
        '</div>'
      );
    }
    if (rew.zeny > 0) {
      lootTiles.push(
        '<div class="raid-loot-item">' +
          '<span class="raid-loot-icon zeny">◈</span>' +
          '<div class="raid-loot-meta"><b>+' + rew.zeny.toLocaleString('en-US') + ' Zeny</b><small>Raid Bounty</small></div>' +
        '</div>'
      );
    }
    if (rew.echo > 0) {
      lootTiles.push(
        '<div class="raid-loot-item">' +
          '<span class="raid-loot-icon echo">❖</span>' +
          '<div class="raid-loot-meta"><b>+' + rew.echo + ' Echo Shards</b><small>Resonance Reward</small></div>' +
        '</div>'
      );
    }
    if (!lootTiles.length) {
      lootTiles.push(
        '<div class="raid-loot-item">' +
          '<span class="raid-loot-icon">—</span>' +
          '<div class="raid-loot-meta"><b>No Items Received</b><small>Run ended early</small></div>' +
        '</div>'
      );
    }

    body.innerHTML =
      '<div class="raid-result-card' + (res.cleared ? ' win' : ' fail') + '">' +
        '<div class="raid-result-head">' +
          '<span class="raid-eyebrow">' +
            escHtml(dngTitle) + (res.mode === 'party' ? ' · PARTY ' : ' · SOLO ') +
            (res.cleared ? 'COMPLETE' : 'FAILED') +
          '</span>' +
          '<h2>' + (res.cleared ? ('🏆 Raid Complete — ' + escHtml(bossTitle) + ' Defeated!') : '☠ Raid Failed') + '</h2>' +
          '<p class="raid-result-sub">' + escHtml(res.reason) + ' · Duration: <b>' + fmtClock(res.secs) + '</b></p>' +
        '</div>' +
        '<div class="raid-showcase-grid">' + showcaseHtml + '</div>' +
        '<div class="raid-loot-section">' +
          '<div class="raid-loot-hd"><span>Items Received</span><small>Delivered to your inventory</small></div>' +
          '<div class="raid-loot-grid">' + lootTiles.join('') + '</div>' +
        '</div>' +
        '<button type="button" class="raid-start-btn" data-raid-act="close-result">Leave Raid</button>' +
      '</div>';

    registerPortraits(portraitsToPaint);
  }

  function hideResult() {
    var el = $('raidResult');
    if (el) el.hidden = true;
    paintActivePortraits();
  }

  // ---------- Delegated UI Click, Drag-Resize & Form Binding ----------
  function bindEvents() {
    if (typeof document === 'undefined') return;

    var dragChat = null;

    document.addEventListener('pointerdown', function (e) {
      var grip = e.target && e.target.closest ? e.target.closest('[data-raid-chat-resize]') : null;
      if (!grip) return;
      var box = $('raidChatBox');
      if (!box) return;
      e.preventDefault();
      e.stopPropagation();
      raid.chatMinimized = false;
      box.classList.remove('minimized');
      var rect = box.getBoundingClientRect();
      dragChat = {
        startX: e.clientX,
        startY: e.clientY,
        startW: rect.width || raid.chatSize.w || 310,
        startH: rect.height || raid.chatSize.h || 220
      };
    });

    document.addEventListener('pointermove', function (e) {
      if (!dragChat) return;
      var nw = dragChat.startW + (e.clientX - dragChat.startX);
      // Anchored at bottom-left, so dragging UP increases height!
      var nh = dragChat.startH - (e.clientY - dragChat.startY);
      setChatSize(nw, nh);
    });

    function stopChatDrag() {
      dragChat = null;
    }
    document.addEventListener('pointerup', stopChatDrag);
    document.addEventListener('pointercancel', stopChatDrag);

    document.addEventListener('click', function (e) {
      var modeBtn = e.target && e.target.closest ? e.target.closest('[data-raid-mode]') : null;
      if (modeBtn) {
        raid.lobbyMode = modeBtn.getAttribute('data-raid-mode') === 'party' ? 'party' : 'solo';
        raid.waitingPartyStart = false;
        if (raid.lobbyMode === 'party' && socialParty()) announceReadyState(false);
        renderLobby();
        return;
      }

      var quickBtn = e.target && e.target.closest ? e.target.closest('[data-raid-quick]') : null;
      if (quickBtn) {
        sendChat(quickBtn.getAttribute('data-raid-quick'));
        return;
      }

      var actBtn = e.target && e.target.closest ? e.target.closest('[data-raid-act]') : null;
      if (!actBtn) return;
      var act = actBtn.getAttribute('data-raid-act');
      if (act === 'close') hideLobby();
      else if (act === 'close-result') hideResult();
      else if (act === 'start') start(raid.lobbyMode, raid.lobbyDungeon);
      else if (act === 'toggle-ready') toggleReady();
      else if (act === 'summon') announceReadyState(true);
      else if (act === 'cycle-chat-size') cycleChatPreset();
      else if (act === 'toggle-chat') {
        raid.chatMinimized = !raid.chatMinimized;
        var cb = $('raidChatBox');
        if (cb) cb.classList.toggle('minimized', raid.chatMinimized);
        applyChatBoxSize();
        actBtn.textContent = raid.chatMinimized ? '+' : '–';
      }
      else if (act === 'dodge') dodge();
      else if (act === 'revive') revive();
      else if (act === 'leave') {
        if (typeof ask === 'function') {
          ask('Leave the Raid? Your current run will end.', function () { leave(); }, { yes: 'Leave Raid', no: 'Stay' });
        } else {
          leave();
        }
      } else if (act === 'plaza') {
        hideLobby();
        if (root.PGSocial && typeof root.PGSocial.enter === 'function') root.PGSocial.enter(0);
      }
    });

    document.addEventListener('submit', function (e) {
      var form = e.target;
      if (!form || (form.id !== 'raidChatForm' && form.id !== 'raidLobbyChatForm')) return;
      e.preventDefault();
      var inp = form.id === 'raidChatForm' ? $('raidChatInput') : $('raidLobbyChatInput');
      if (!inp) return;
      var val = inp.value;
      inp.value = '';
      sendChat(val);
      if (form.id === 'raidChatForm') inp.blur();
    });

    document.addEventListener('focusin', function (e) {
      if (e.target && e.target.id === 'raidChatInput') {
        raid.keys = { w: false, a: false, s: false, d: false };
      }
    });
  }

  bindEvents();

  return {
    DUNGEONS: DUNGEONS,
    STAGES: STAGES,
    SOLO_LIMIT_S: SOLO_LIMIT_S,
    PARTY_LIMIT_S: PARTY_LIMIT_S,
    DAILY_LIMIT: DAILY_LIMIT,
    raid: raid,
    isGm: isGm,
    canEnter: canEnter,
    allPartyMembersReady: allPartyMembersReady,
    toggleReady: toggleReady,
    sendChat: sendChat,
    setChatSize: setChatSize,
    cycleChatPreset: cycleChatPreset,
    isBehindAnyPillar: isBehindAnyPillar,
    spawnSanctuaryPillars: spawnSanctuaryPillars,
    computeCommendations: computeCommendations,
    raidLeftToday: raidLeftToday,
    openDungeons: openDungeons,
    startDirectSolo: startDirectSolo,
    showLobby: showLobby,
    hideLobby: hideLobby,
    renderLobby: renderLobby,
    start: start,
    leave: leave,
    finish: finish,
    dodge: dodge,
    revive: revive,
    tick: tick,
    onKey: onKey,
    isManualMove: isManualMove,
    overrideMove: overrideMove,
    setGroundMove: setGroundMove,
    handleCanvasClick: handleCanvasClick,
    hitByTelegraph: hitByTelegraph,
    onLobby: onLobby,
    onChat: onChat,
    onStarted: onStarted,
    onSync: onSync,
    onRevive: onRevive,
    onEnded: onEnded,
    onError: onError,
    renderHud: renderHud,
    hideResult: hideResult
  };
});
