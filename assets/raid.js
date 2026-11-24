/* Raid Dungeons — Solo (<20m) & Real-Player Party (<25m) Co-op Raid Mode
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
      bossCardKey: 'raid:matk',
      bossCardName: 'Sovereign Thanatos Card',
      img: 'assets/atlas/astral-citadel.png?v=156',
      banner: 'assets/atlas/astral-citadel.png?v=156',
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
      bossCardKey: 'raid:atk',
      bossCardName: 'Primordial Ifrit Card',
      img: 'assets/atlas/thor-volcano.png?v=162',
      banner: 'assets/atlas/thor-volcano.png?v=162',
      comingSoon: false,
      stages: [
        { idx: 0, astralStage: 1, name: 'Molten Approach', desc: 'Magma Slags & Fire Imps across the obsidian causeway + Tectonic Faults', boss: false },
        { idx: 1, astralStage: 2, name: 'Basalt Forge', desc: 'Fire Imps & Kasas between twin lava cascades + Magma Surges', boss: false },
        { idx: 2, astralStage: 3, name: 'Magma Conduit', desc: 'Salamanders & Obsidian Golem wardens before the Sanctum Bridge', boss: false },
        { idx: 3, astralStage: 5, name: 'Sanctum of Ifrit', desc: 'Ifrit, Volcano Lord — Breath, Ring Surge, Pinwheel, Tsunami & Spires', boss: true }
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

  var SOLO_LIMIT_S = 1200;    // 20 minutes
  var PARTY_LIMIT_S = 1500;   // 25 minutes
  var SOLO_GRACE_LEAVE_S = 10; // Solo voluntary exit within 10s (except death) keeps daily entry
  var DAILY_LIMIT = 2;
  var MAX_PARTY_REVIVES = 3;
  var REVIVE_CHANNEL_S = 3.0;
  var DODGE_CD_S = 3.5;
  var DODGE_IFRAME_S = 0.75;
  var DODGE_DIST = 5.6;
  var SYNC_INTERVAL_S = 2.0;

  // Stage 1-3 mobs: v455 baseline + 120% buff (Astral 2.2x; Thor 1.1x normalized to 1.25x Astral curve).
  // Stage 4 Bosses & escorts: reduced 30% HP from v456, with softened Boss ATK/cleave/telegraph damage (v462).
  var TRASH_CAMP_LIMIT = 8;
  var RAID_BOSS_ARMOR = 0.50;
  var TRASH_HP_MULT_ASTRAL = 2.2;
  var TRASH_HP_MULT_THOR = 1.1;
  var BOSS_HP_MULT_ASTRAL = 8.96;
  var BOSS_HP_MULT_THOR = 5.6;
  var ESCORT_HP_MULT_ASTRAL = 4.2;
  var ESCORT_HP_MULT_THOR = 2.52;
  var BOSS_ATK_MULT = 1.12;
  var ESCORT_ATK_MULT = 0.85;
  var BOSS_CLEAVE_INTERVAL_S = 4.2;
  var BOSS_CLEAVE_PCT = 0.09;

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
    impacts: [],           // [{ x, z, r, age, life, volcanic }] 3D impact eruption bursts
    nextCastIn: 0.75,
    bossCleaveIn: 2.5,
    castSeq: 0,
    lastSkillKey: '',
    pillarCastDone: false,
    syncTimer: 0,
    hudTimer: 0,
    transition: null,      // { nextIdx, fallbackLeft }
    home: null,
    entryConsumed: false,
    activePartyScaleCount: 1,
    party: [],             // [{ id, name, cls, sex, appearance, hp, maxHp, dps, dmgTaken, support, revives, stage, dead, disconnected, self }]
    keys: { w: false, a: false, s: false, d: false },
    moveTarget: null,      // { x, z, left, holdOnly }
    holdGround: false,     // v467: player-armed "never auto-approach" switch
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
  var CONE_HALF_ARC = 0.96; // ~55 deg each side = 110 deg frontal magma fan

  // v467 (owner): raid creatures read LARGER than the same species on the ordinary Ascension field.
  // The raid re-uses maps 10/11, so the field's own measurement (mobVisualScale in index.html) stays
  // untouched outside a run; inside a run it is multiplied by this. Art only - hitboxes, reach and
  // damage are unchanged, and bosses get the larger share so the sanctum still towers.
  // v468 (owner: "raid monster can go a little bigger, up to 2x the normal"): 1.25 -> 1.6 for the
  // trash and 1.4 -> 2.0 for the boss, i.e. a raid boss is now exactly twice the field creature of
  // the same species. The index.html ceiling moves with it (640px / 62% of the field) so the extra
  // size is drawn instead of being clipped back to the field's 320px.
  var RAID_MONSTER_VISUAL_BOOST = 1.6;
  var RAID_BOSS_VISUAL_BOOST = 2.0;
  function mobVisualBoost(isBoss) {
    if (!raid.on) return 1;
    return isBoss ? RAID_BOSS_VISUAL_BOOST : RAID_MONSTER_VISUAL_BOOST;
  }
  var hazardGroup = null;
  var craterNodes = [];
  var beamNodes = [];
  var donutNode = null;
  var coneNode = null;
  var ringWavesNode = null;
  var lavaWallNode = null;
  var poolNodes = [];
  var impactNodes = [];
  var pillarArenaNode = null;
  var pillarNodes = [];
  var casterNode = null;
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

  var RAID_MIN_BASE_LV = 120;
  var RAID_MIN_JOB_TIER = 3;

  function isRaidEligible() {
    if (typeof S === 'undefined' || !S) return false;
    if (isGm()) return true;
    if ((Number(S.lv) || 0) < RAID_MIN_BASE_LV) return false;
    if (typeof fourthJob === 'function' && fourthJob()) return true;
    var c = (typeof C === 'function') ? C() : (typeof CLASSES !== 'undefined' && CLASSES ? CLASSES[S.cls] : null);
    return Boolean(c && Number(c.tier) >= RAID_MIN_JOB_TIER);
  }
  var isFourthUnlocked = isRaidEligible;

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
    if (!isRaidEligible()) {
      return { ok: false, reason: 'Requires Base Lv 120 & at least a 3rd-Job class.' };
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
        return { ok: false, reason: 'Invite a trainer above — a party of 2–3 launches the raid.' };
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
    if (count === 2) return 2.25;
    return 3.45;
  }

  function partyAtkScale(count) {
    if (count <= 1) return 1;
    if (count === 2) return 1.32;
    return 1.58;
  }

  function activePartyCount() {
    if (!Array.isArray(raid.party) || !raid.party.length) return 1;
    var cnt = 0;
    for (var i = 0; i < raid.party.length; i++) {
      if (raid.party[i] && !raid.party[i].disconnected) cnt++;
    }
    return Math.max(1, cnt);
  }

  function rescaleActiveRaidMobs(oldCount, newCount) {
    if (oldCount === newCount || typeof mobs === 'undefined' || !Array.isArray(mobs)) return;
    var hpRatio = partyHpScale(newCount) / Math.max(0.01, partyHpScale(oldCount));
    var atkRatio = partyAtkScale(newCount) / Math.max(0.01, partyAtkScale(oldCount));
    for (var i = 0; i < mobs.length; i++) {
      var m = mobs[i];
      if (!m || m.hp <= 0) continue;
      m.max = Math.max(1, Math.floor((m.max || m.hp) * hpRatio));
      m.hp = Math.max(1, Math.min(m.max, Math.floor(m.hp * hpRatio)));
      m.atk = Math.max(1, Math.floor((m.atk || 100) * atkRatio));
    }
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
      if (mobs[i] && (mobs[i]._raidPillarRoot || mobs[i]._raidCasterRoot)) {
        mobs[i].fixed = false;
        mobs[i]._raidPillarRoot = false;
        mobs[i]._raidCasterRoot = false;
      }
    }
  }

  function pickStageCaster(targetX, targetZ) {
    if (typeof mobs === 'undefined' || !Array.isArray(mobs) || !mobs.length) return null;
    var best = null;
    var bestScore = -1e9;
    for (var i = 0; i < mobs.length; i++) {
      var m = mobs[i];
      if (!m || m.hp <= 0 || m.boss) continue;
      var d = Math.hypot((targetX || 0) - m.x, (targetZ || 0) - m.z);
      var hpFrac = m.max > 0 ? (m.hp / m.max) : 1;
      // Prefer healthy, heavy volcanic/astral casters within clear line-of-sight range
      var weight = (m.max || 100) * 0.002 + hpFrac * 3.0 - Math.abs(d - 5.5) * 0.35;
      if (/Golem|Kasa|Salamander|Baron|Executor|Dame|Mistress/i.test(m.n || '')) weight += 2.5;
      if (weight > bestScore) {
        bestScore = weight;
        best = m;
      }
    }
    return best;
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

  function spawnSanctuaryPillars(bx, bz, desiredCount) {
    var targetCount = Math.max(1, Math.min(3, Number(desiredCount) || 3));
    var b = fieldBounds();
    var minX = -b.bx + 2.0, maxX = b.bx - 2.0;
    var minZ = b.z0 + 2.4, maxZ = b.z1 - 2.0;
    var chosen = [];
    var baseRot = Math.random() * Math.PI * 2;

    for (var attempt = 0; attempt < 60 && chosen.length < targetCount; attempt++) {
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

    // Deterministic safe fallback guarantees valid pillars even near arena walls
    var fallbackAngles = [0.35, 2.42, 4.52, 1.45, 3.55, 5.45];
    for (var f = 0; f < fallbackAngles.length && chosen.length < targetCount; f++) {
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

  // ---------- Reusable Three.js Hazard & Pillar Visuals (Fog-Immune + 3D Volcanic Eruptions) ----------
  function hazardBasicMat(THREE, hex, op) {
    return new THREE.MeshBasicMaterial({
      color: hex,
      transparent: op < 1,
      opacity: op,
      side: THREE.DoubleSide,
      depthWrite: op >= 1,
      fog: false,
      toneMapped: false
    });
  }

  function applyHazardRenderOrder(rootObj, order) {
    if (!rootObj || !rootObj.traverse) return;
    rootObj.traverse(function (o) {
      if (o.isMesh) {
        o.renderOrder = order;
        o.frustumCulled = false;
      }
    });
  }

  function makeCraterNode(THREE) {
    var g = new THREE.Group();
    g.visible = false;

    var fill = new THREE.Mesh(
      new THREE.CircleGeometry(1, 40),
      hazardBasicMat(THREE, 0xff2448, 0.36)
    );
    fill.rotation.x = -Math.PI / 2;
    g.add(fill);

    var border = new THREE.Mesh(
      new THREE.RingGeometry(0.91, 1.0, 44),
      hazardBasicMat(THREE, 0xff8ea2, 0.96)
    );
    border.rotation.x = -Math.PI / 2;
    border.position.y = 0.012;
    g.add(border);

    var inner = new THREE.Mesh(
      new THREE.RingGeometry(0.02, 0.16, 40),
      hazardBasicMat(THREE, 0xffe28a, 0.84)
    );
    inner.rotation.x = -Math.PI / 2;
    inner.position.y = 0.018;
    g.add(inner);

    var meteor = new THREE.Group();
    meteor.visible = false;
    var core = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.56, 1),
      hazardBasicMat(THREE, 0xfff3c4, 1)
    );
    meteor.add(core);
    var aura = new THREE.Mesh(
      new THREE.SphereGeometry(0.78, 12, 10),
      hazardBasicMat(THREE, 0xff4668, 0.65)
    );
    meteor.add(aura);
    var tail = new THREE.Mesh(
      new THREE.ConeGeometry(0.58, 4.4, 12, 1, true),
      hazardBasicMat(THREE, 0xff854a, 0.55)
    );
    tail.position.set(0, 2.2, 0);
    meteor.add(tail);
    g.add(meteor);

    applyHazardRenderOrder(g, 15);
    return { group: g, fill: fill, border: border, inner: inner, meteor: meteor, core: core, aura: aura, tail: tail };
  }

  function makeCasterNode(THREE) {
    var g = new THREE.Group();
    g.visible = false;
    var outerRing = new THREE.Mesh(
      new THREE.RingGeometry(0.95, 1.32, 36),
      hazardBasicMat(THREE, 0xff9426, 0.94)
    );
    outerRing.rotation.x = -Math.PI / 2;
    outerRing.position.y = 0.03;
    g.add(outerRing);

    var innerSeal = new THREE.Mesh(
      new THREE.RingGeometry(0.46, 0.68, 8),
      hazardBasicMat(THREE, 0xffe680, 0.92)
    );
    innerSeal.rotation.x = -Math.PI / 2;
    innerSeal.position.y = 0.04;
    g.add(innerSeal);

    var chargeCol = new THREE.Mesh(
      new THREE.CylinderGeometry(0.92, 1.18, 1.65, 16, 1, true),
      hazardBasicMat(THREE, 0xff5a14, 0.42)
    );
    chargeCol.position.y = 0.84;
    g.add(chargeCol);

    applyHazardRenderOrder(g, 17);
    return { group: g, outerRing: outerRing, innerSeal: innerSeal, chargeCol: chargeCol };
  }

  function makeBeamNode(THREE) {
    var g = new THREE.Group();
    g.visible = false;

    var fill = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      hazardBasicMat(THREE, 0xff244c, 0.42)
    );
    fill.rotation.x = -Math.PI / 2;
    g.add(fill);

    var core = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      hazardBasicMat(THREE, 0xffe38a, 0.78)
    );
    core.rotation.x = -Math.PI / 2;
    core.position.y = 0.014;
    g.add(core);

    var railL = new THREE.Mesh(
      new THREE.PlaneGeometry(0.12, 1),
      hazardBasicMat(THREE, 0xffb45c, 0.98)
    );
    railL.rotation.x = -Math.PI / 2;
    railL.position.y = 0.02;
    g.add(railL);

    var railR = railL.clone();
    g.add(railR);

    // 3D Vertical Erupting Magma Fire-Curtain along volcanic fault trenches & rotating pinwheel spokes!
    var fireWall = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1.85),
      hazardBasicMat(THREE, 0xff5a14, 0.58)
    );
    fireWall.rotation.y = Math.PI / 2;
    fireWall.position.y = 0.92;
    fireWall.visible = false;
    g.add(fireWall);

    var fireCrest = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 0.62),
      hazardBasicMat(THREE, 0xfff09e, 0.85)
    );
    fireCrest.rotation.y = Math.PI / 2;
    fireCrest.position.y = 0.34;
    fireCrest.visible = false;
    g.add(fireCrest);

    applyHazardRenderOrder(g, 15);
    return { group: g, fill: fill, core: core, railL: railL, railR: railR, fireWall: fireWall, fireCrest: fireCrest };
  }

  function makeDonutNode(THREE) {
    var g = new THREE.Group();
    g.visible = false;

    var danger = new THREE.Mesh(
      new THREE.RingGeometry(1, 4.0, 56),
      hazardBasicMat(THREE, 0xff2248, 0.38)
    );
    danger.rotation.x = -Math.PI / 2;
    g.add(danger);

    var safeRing = new THREE.Mesh(
      new THREE.RingGeometry(0.89, 1.0, 48),
      hazardBasicMat(THREE, 0x5cf2ff, 0.98)
    );
    safeRing.rotation.x = -Math.PI / 2;
    safeRing.position.y = 0.02;
    g.add(safeRing);

    var safeFill = new THREE.Mesh(
      new THREE.CircleGeometry(0.95, 44),
      hazardBasicMat(THREE, 0x3ce8b5, 0.20)
    );
    safeFill.rotation.x = -Math.PI / 2;
    safeFill.position.y = 0.01;
    g.add(safeFill);

    applyHazardRenderOrder(g, 15);
    return { group: g, danger: danger, safeRing: safeRing, safeFill: safeFill };
  }

  function makePoolNode(THREE) {
    var g = new THREE.Group();
    g.visible = false;
    var fill = new THREE.Mesh(
      new THREE.CircleGeometry(1, 36),
      hazardBasicMat(THREE, 0x9c2cff, 0.50)
    );
    fill.rotation.x = -Math.PI / 2;
    g.add(fill);
    var ring = new THREE.Mesh(
      new THREE.RingGeometry(0.86, 1.0, 36),
      hazardBasicMat(THREE, 0xff5492, 0.96)
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.015;
    g.add(ring);
    var plume = new THREE.Mesh(
      new THREE.CylinderGeometry(0.55, 0.88, 1.15, 18, 1, true),
      hazardBasicMat(THREE, 0xff8a24, 0.42)
    );
    plume.position.y = 0.58;
    g.add(plume);
    applyHazardRenderOrder(g, 14);
    return { group: g, fill: fill, ring: ring, plume: plume };
  }

  function makeImpactNode(THREE) {
    var g = new THREE.Group();
    g.visible = false;
    var geyser = new THREE.Mesh(
      new THREE.CylinderGeometry(0.28, 1.05, 4.6, 16, 1, true),
      hazardBasicMat(THREE, 0xff7b1f, 0.85)
    );
    geyser.position.y = 2.3;
    g.add(geyser);
    var core = new THREE.Mesh(
      new THREE.ConeGeometry(0.58, 5.2, 12),
      hazardBasicMat(THREE, 0xfff2a8, 0.92)
    );
    core.position.y = 2.6;
    g.add(core);
    var ring = new THREE.Mesh(
      new THREE.RingGeometry(0.76, 1.0, 40),
      hazardBasicMat(THREE, 0xffcf66, 0.96)
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.03;
    g.add(ring);
    applyHazardRenderOrder(g, 17);
    return { group: g, geyser: geyser, core: core, ring: ring };
  }

  function makePillarArenaNode(THREE) {
    var g = new THREE.Group();
    g.visible = false;
    var floorFill = new THREE.Mesh(
      new THREE.CircleGeometry(24, 56),
      hazardBasicMat(THREE, 0xff163c, 0.36)
    );
    floorFill.rotation.x = -Math.PI / 2;
    g.add(floorFill);

    var shockWave = new THREE.Mesh(
      new THREE.RingGeometry(0.86, 1.0, 52),
      hazardBasicMat(THREE, 0xffe07d, 0.96)
    );
    shockWave.rotation.x = -Math.PI / 2;
    shockWave.position.y = 0.018;
    g.add(shockWave);

    var vortexFunnel = new THREE.Mesh(
      new THREE.CylinderGeometry(3.4, 0.7, 3.2, 20, 1, true),
      hazardBasicMat(THREE, 0xff6e1a, 0.44)
    );
    vortexFunnel.position.y = 1.6;
    vortexFunnel.visible = false;
    g.add(vortexFunnel);

    applyHazardRenderOrder(g, 14);
    return { group: g, floorFill: floorFill, shockWave: shockWave, vortexFunnel: vortexFunnel };
  }

  // v471 (owner: "the pillar is so ugly, replace it with a nicer sprite"): the old pillar was a flat
  // grey tube with a coloured hoop. It is now a carved crystal monolith: a hexagonal stone plinth, a
  // tapered crystal with a lit core, two orbiting rune rings, a bladed crown with shards, a soft ground
  // glow and a falling light trail. Every colour is still set per raid (Astral cyan / Thor ember) and
  // every part is additive-blended geometry with fog off, so it stays readable through the arena fog.
  function pillarColumnTexture(THREE) {
    var c = document.createElement('canvas');
    c.width = 16; c.height = 128;
    var x = c.getContext('2d');
    var g = x.createLinearGradient(0, 128, 0, 0);
    g.addColorStop(0, 'rgba(255,255,255,0.98)');
    g.addColorStop(0.35, 'rgba(255,255,255,0.72)');
    g.addColorStop(0.78, 'rgba(255,255,255,0.30)');
    g.addColorStop(1, 'rgba(255,255,255,0.06)');
    x.fillStyle = g; x.fillRect(0, 0, 16, 128);
    // a few darker facet seams so the crystal reads as cut stone, not a light tube
    x.globalCompositeOperation = 'destination-out';
    for (var i = 0; i < 4; i++) { x.fillStyle = 'rgba(0,0,0,0.30)'; x.fillRect(i * 4 + 1, 0, 1.2, 128); }
    x.globalCompositeOperation = 'source-over';
    var t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
    t.magFilter = t.minFilter = THREE.LinearFilter;
    t.generateMipmaps = false;
    return t;
  }

  function pillarGlowTexture(THREE) {
    var c = document.createElement('canvas');
    c.width = c.height = 128;
    var x = c.getContext('2d');
    var g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, 'rgba(255,255,255,0.95)');
    g.addColorStop(0.42, 'rgba(255,255,255,0.30)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g; x.fillRect(0, 0, 128, 128);
    var t = new THREE.CanvasTexture(c);
    t.magFilter = t.minFilter = THREE.LinearFilter;
    t.generateMipmaps = false;
    return t;
  }

  function makePillarNode(THREE) {
    var g = new THREE.Group();
    g.visible = false;

    var stoneMat = hazardBasicMat(THREE, 0x2b3149, 1);
    var glowTex = pillarGlowTexture(THREE);

    // 1) ground glow + carved plinth
    var glow = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 3.4), new THREE.MeshBasicMaterial({
      map: glowTex, color: 0x76ffd8, transparent: true, opacity: 0.75,
      blending: THREE.AdditiveBlending, depthWrite: false, fog: false, toneMapped: false
    }));
    glow.rotation.x = -Math.PI / 2;
    glow.position.y = 0.03;
    g.add(glow);

    var plinth = new THREE.Mesh(new THREE.CylinderGeometry(1.02, 1.22, 0.34, 6), stoneMat);
    plinth.position.y = 0.17;
    g.add(plinth);

    var plinthLip = new THREE.Mesh(new THREE.CylinderGeometry(1.3, 1.36, 0.1, 6),
      hazardBasicMat(THREE, 0x171b2b, 1));
    plinthLip.position.y = 0.05;
    g.add(plinthLip);

    var baseRing = new THREE.Mesh(new THREE.RingGeometry(0.98, 1.28, 32),
      hazardBasicMat(THREE, 0x76ffd8, 0.98));
    baseRing.rotation.x = -Math.PI / 2;
    baseRing.position.y = 0.35;
    g.add(baseRing);

    // 2) the crystal itself - outer cut shell, lit core, both tinted per raid
    var columnWrap = new THREE.Group();
    var columnTex = pillarColumnTexture(THREE);
    var shaftMat = new THREE.MeshBasicMaterial({
      map: columnTex, color: 0x9fb4e8, transparent: true, opacity: 0.92,
      side: THREE.DoubleSide, depthWrite: false, fog: false, toneMapped: false
    });
    var shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.78, 4.5, 6, 1, true), shaftMat);
    shaft.position.y = 2.6;
    columnWrap.add(shaft);

    var core = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.34, 4.2, 6),
      hazardBasicMat(THREE, 0xcfe9ff, 0.62));
    core.material.blending = THREE.AdditiveBlending;
    core.material.depthWrite = false;
    core.position.y = 2.55;
    columnWrap.add(core);

    var collar = new THREE.Mesh(new THREE.TorusGeometry(0.72, 0.055, 6, 26),
      hazardBasicMat(THREE, 0xfff0a8, 0.95));
    collar.material.blending = THREE.AdditiveBlending;
    collar.rotation.x = Math.PI / 2;
    collar.position.y = 0.52;
    columnWrap.add(collar);

    // 3) rune rings orbiting the shaft (runeBand keeps its old name for the animation code)
    var runeBand = new THREE.Mesh(new THREE.TorusGeometry(0.86, 0.045, 6, 30),
      hazardBasicMat(THREE, 0x6af7d0, 0.95));
    runeBand.material.blending = THREE.AdditiveBlending;
    runeBand.rotation.x = Math.PI / 2;
    runeBand.position.y = 1.55;
    columnWrap.add(runeBand);

    var runeUpper = new THREE.Mesh(new THREE.TorusGeometry(0.66, 0.038, 6, 30),
      hazardBasicMat(THREE, 0x6af7d0, 0.8));
    runeUpper.material.blending = THREE.AdditiveBlending;
    runeUpper.rotation.x = Math.PI / 2 - 0.18;
    runeUpper.position.y = 3.2;
    columnWrap.add(runeUpper);

    // 4) crown blade + orbiting shards
    var crown = new THREE.Mesh(new THREE.OctahedronGeometry(0.5, 0),
      hazardBasicMat(THREE, 0xfff0a8, 1));
    crown.material.blending = THREE.AdditiveBlending;
    crown.position.y = 5.05;
    columnWrap.add(crown);

    var shards = [];
    for (var s = 0; s < 3; s++) {
      var shard = new THREE.Mesh(new THREE.OctahedronGeometry(0.15, 0), hazardBasicMat(THREE, 0xfff0a8, 0.9));
      shard.material.blending = THREE.AdditiveBlending;
      shard.position.set(Math.cos(s * 2.09) * 0.95, 4.3, Math.sin(s * 2.09) * 0.95);
      columnWrap.add(shard);
      shards.push(shard);
    }
    g.add(columnWrap);

    // 5) the falling trail, shown only while the pillar is still in the air
    var trail = new THREE.Mesh(new THREE.ConeGeometry(0.52, 5.2, 8, 1, true), new THREE.MeshBasicMaterial({
      color: 0xbff6ff, transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending,
      depthWrite: false, side: THREE.DoubleSide, fog: false, toneMapped: false
    }));
    trail.position.y = 7.2;
    g.add(trail);

    // 6) the safe-lane shadow (unchanged geometry - the hit test reads spawnSanctuaryPillars, not this)
    var shadowPivot = new THREE.Group();
    var shadowFill = new THREE.Mesh(
      new THREE.PlaneGeometry(5.4, 3.1),
      hazardBasicMat(THREE, 0x28f0a8, 0.44)
    );
    shadowFill.rotation.x = -Math.PI / 2;
    shadowFill.position.set(2.85, 0.022, 0);
    shadowPivot.add(shadowFill);

    var shadowEdgeL = new THREE.Mesh(
      new THREE.PlaneGeometry(5.4, 0.15),
      hazardBasicMat(THREE, 0x9effe4, 0.98)
    );
    shadowEdgeL.rotation.x = -Math.PI / 2;
    shadowEdgeL.position.set(2.85, 0.028, -1.55);
    shadowPivot.add(shadowEdgeL);

    var shadowEdgeR = shadowEdgeL.clone();
    shadowEdgeR.position.set(2.85, 0.028, 1.55);
    shadowPivot.add(shadowEdgeR);

    g.add(shadowPivot);
    applyHazardRenderOrder(g, 16);

    return {
      group: g, columnWrap: columnWrap, shaft: shaft, core: core, collar: collar,
      runeBand: runeBand, runeUpper: runeUpper, crown: crown, shards: shards,
      baseRing: baseRing, glow: glow, plinth: plinth, trail: trail,
      shadowPivot: shadowPivot, shadowFill: shadowFill
    };
  }

  function makeConeNode(THREE) {
    var g = new THREE.Group();
    g.visible = false;
    var arc = CONE_HALF_ARC * 2;

    var fill = new THREE.Mesh(
      new THREE.CircleGeometry(1, 48, -CONE_HALF_ARC, arc),
      hazardBasicMat(THREE, 0xff3b0d, 0.48)
    );
    fill.rotation.x = -Math.PI / 2;
    g.add(fill);

    var rim = new THREE.Mesh(
      new THREE.RingGeometry(0.92, 1.0, 48, 1, -CONE_HALF_ARC, arc),
      hazardBasicMat(THREE, 0xffe47a, 0.98)
    );
    rim.rotation.x = -Math.PI / 2;
    rim.position.y = 0.016;
    g.add(rim);

    var wave = new THREE.Mesh(
      new THREE.RingGeometry(0.80, 1.0, 48, 1, -CONE_HALF_ARC, arc),
      hazardBasicMat(THREE, 0xfff3ad, 0.88)
    );
    wave.rotation.x = -Math.PI / 2;
    wave.position.y = 0.022;
    g.add(wave);

    function makeFlank(sign) {
      var piv = new THREE.Group();
      piv.rotation.y = sign * CONE_HALF_ARC;
      var bar = new THREE.Mesh(
        new THREE.PlaneGeometry(1, 0.032),
        hazardBasicMat(THREE, 0xffe47a, 0.98)
      );
      bar.rotation.x = -Math.PI / 2;
      bar.position.set(0.5, 0.024, 0);
      piv.add(bar);
      return piv;
    }
    g.add(makeFlank(-1));
    g.add(makeFlank(1));

    // 3D Surging Flame Plumes inside the magma cone!
    var plumes = [];
    for (var fp = -1; fp <= 1; fp++) {
      var pCone = new THREE.Mesh(
        new THREE.ConeGeometry(0.055, 0.24, 10, 1, true),
        hazardBasicMat(THREE, fp === 0 ? 0xffe57f : 0xff6e1c, 0.72)
      );
      pCone.rotation.z = -Math.PI * 0.42;
      pCone.userData.angOff = fp * 0.48;
      g.add(pCone);
      plumes.push(pCone);
    }

    applyHazardRenderOrder(g, 15);
    return { group: g, fill: fill, rim: rim, wave: wave, plumes: plumes };
  }

  function makeRingWavesNode(THREE) {
    var g = new THREE.Group();
    g.visible = false;

    var innerCore = new THREE.Mesh(
      new THREE.CircleGeometry(4.3, 48),
      hazardBasicMat(THREE, 0xff330a, 0.50)
    );
    innerCore.rotation.x = -Math.PI / 2;
    g.add(innerCore);

    var innerRim = new THREE.Mesh(
      new THREE.RingGeometry(4.02, 4.3, 48),
      hazardBasicMat(THREE, 0xffe27a, 0.98)
    );
    innerRim.rotation.x = -Math.PI / 2;
    innerRim.position.y = 0.018;
    g.add(innerRim);

    var safeBand = new THREE.Mesh(
      new THREE.RingGeometry(4.32, 8.28, 52),
      hazardBasicMat(THREE, 0x2df5b4, 0.28)
    );
    safeBand.rotation.x = -Math.PI / 2;
    safeBand.position.y = 0.01;
    g.add(safeBand);

    var outerCaldera = new THREE.Mesh(
      new THREE.RingGeometry(8.3, 18.0, 56),
      hazardBasicMat(THREE, 0xff2b08, 0.46)
    );
    outerCaldera.rotation.x = -Math.PI / 2;
    g.add(outerCaldera);

    var outerRim = new THREE.Mesh(
      new THREE.RingGeometry(8.3, 8.62, 52),
      hazardBasicMat(THREE, 0xffe27a, 0.98)
    );
    outerRim.rotation.x = -Math.PI / 2;
    outerRim.position.y = 0.018;
    g.add(outerRim);

    var pulseInner = new THREE.Mesh(
      new THREE.RingGeometry(0.86, 1.0, 44),
      hazardBasicMat(THREE, 0xfff0a3, 0.88)
    );
    pulseInner.rotation.x = -Math.PI / 2;
    pulseInner.position.y = 0.024;
    g.add(pulseInner);

    // 8 Erupting 3D Magma Geyser Cones ringing the inner & outer danger zones!
    var geysers = [];
    for (var gi = 0; gi < 8; gi++) {
      var gy = new THREE.Mesh(
        new THREE.ConeGeometry(0.68, 2.6, 8, 1, true),
        hazardBasicMat(THREE, gi % 2 === 0 ? 0xff781f : 0xffd86e, 0.72)
      );
      var gang = (gi / 8) * Math.PI * 2;
      var grad = gi % 2 === 0 ? 2.6 : 10.6;
      gy.position.set(Math.cos(gang) * grad, 1.3, Math.sin(gang) * grad);
      g.add(gy);
      geysers.push(gy);
    }

    applyHazardRenderOrder(g, 15);
    return { group: g, innerCore: innerCore, safeBand: safeBand, outerCaldera: outerCaldera, pulseInner: pulseInner, geysers: geysers };
  }

  function makeLavaWallNode(THREE) {
    var g = new THREE.Group();
    g.visible = false;

    function makeSlab() {
      var wrap = new THREE.Group();
      var fill = new THREE.Mesh(
        new THREE.PlaneGeometry(1, 1),
        hazardBasicMat(THREE, 0xff380c, 0.48)
      );
      fill.rotation.x = -Math.PI / 2;
      wrap.add(fill);
      var crest = new THREE.Mesh(
        new THREE.PlaneGeometry(1, 1),
        hazardBasicMat(THREE, 0xffe07d, 0.82)
      );
      crest.rotation.x = -Math.PI / 2;
      crest.position.y = 0.018;
      wrap.add(crest);
      var borderF = new THREE.Mesh(
        new THREE.PlaneGeometry(1, 0.16),
        hazardBasicMat(THREE, 0xffcb63, 0.98)
      );
      borderF.rotation.x = -Math.PI / 2;
      borderF.position.y = 0.024;
      wrap.add(borderF);
      var borderB = borderF.clone();
      wrap.add(borderB);

      // Towering 3D Rolling Tsunami Magma Wave Wall!
      var waveBody = new THREE.Mesh(
        new THREE.BoxGeometry(1, 2.15, 0.85),
        hazardBasicMat(THREE, 0xff5414, 0.68)
      );
      waveBody.position.y = 1.08;
      wrap.add(waveBody);
      var waveFoam = new THREE.Mesh(
        new THREE.BoxGeometry(1, 0.42, 1.02),
        hazardBasicMat(THREE, 0xfff09e, 0.90)
      );
      waveFoam.position.y = 2.08;
      wrap.add(waveFoam);

      return { wrap: wrap, fill: fill, crest: crest, borderF: borderF, borderB: borderB, waveBody: waveBody, waveFoam: waveFoam };
    }

    var left = makeSlab();
    var right = makeSlab();
    g.add(left.wrap);
    g.add(right.wrap);

    var safeGate = new THREE.Group();
    var gateFill = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      hazardBasicMat(THREE, 0x2df5b4, 0.30)
    );
    gateFill.rotation.x = -Math.PI / 2;
    gateFill.position.y = 0.012;
    safeGate.add(gateFill);

    var gateRailL = new THREE.Mesh(
      new THREE.PlaneGeometry(0.16, 1),
      hazardBasicMat(THREE, 0x9effe4, 0.98)
    );
    gateRailL.rotation.x = -Math.PI / 2;
    gateRailL.position.y = 0.026;
    safeGate.add(gateRailL);
    var gateRailR = gateRailL.clone();
    safeGate.add(gateRailR);
    g.add(safeGate);

    applyHazardRenderOrder(g, 15);
    return { group: g, left: left, right: right, safeGate: safeGate, gateFill: gateFill, gateRailL: gateRailL, gateRailR: gateRailR };
  }

  function ensureMeshes() {
    if (typeof THREE === 'undefined' || typeof scene === 'undefined' || !scene) return false;
    if (!hazardGroup) {
      hazardGroup = new THREE.Group();
      hazardGroup.position.y = 0.14;
      craterNodes = [];
      for (var i = 0; i < 5; i++) {
        var c = makeCraterNode(THREE);
        hazardGroup.add(c.group);
        craterNodes.push(c);
      }
      beamNodes = [];
      for (var b = 0; b < 4; b++) {
        var bm = makeBeamNode(THREE);
        hazardGroup.add(bm.group);
        beamNodes.push(bm);
      }
      donutNode = makeDonutNode(THREE);
      hazardGroup.add(donutNode.group);
      coneNode = makeConeNode(THREE);
      hazardGroup.add(coneNode.group);
      ringWavesNode = makeRingWavesNode(THREE);
      hazardGroup.add(ringWavesNode.group);
      lavaWallNode = makeLavaWallNode(THREE);
      hazardGroup.add(lavaWallNode.group);

      poolNodes = [];
      for (var p = 0; p < 3; p++) {
        var plNode = makePoolNode(THREE);
        hazardGroup.add(plNode.group);
        poolNodes.push(plNode);
      }

      impactNodes = [];
      for (var im = 0; im < 4; im++) {
        var impNode = makeImpactNode(THREE);
        hazardGroup.add(impNode.group);
        impactNodes.push(impNode);
      }

      pillarArenaNode = makePillarArenaNode(THREE);
      hazardGroup.add(pillarArenaNode.group);
      pillarNodes = [];
      for (var k = 0; k < 3; k++) {
        var pkNode = makePillarNode(THREE);
        hazardGroup.add(pkNode.group);
        pillarNodes.push(pkNode);
      }

      casterNode = makeCasterNode(THREE);
      hazardGroup.add(casterNode.group);
    }
    if (!hazardGroup.parent) scene.add(hazardGroup);

    if (!moveRing) {
      moveRing = new THREE.Mesh(
        new THREE.RingGeometry(0.42, 0.58, 28),
        hazardBasicMat(THREE, 0x6ce8ff, 0.90)
      );
      moveRing.rotation.x = -Math.PI / 2;
      moveRing.renderOrder = 18;
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
    for (var b = 0; b < beamNodes.length; b++) {
      beamNodes[b].group.visible = false;
      if (beamNodes[b].fireWall) beamNodes[b].fireWall.visible = false;
      if (beamNodes[b].fireCrest) beamNodes[b].fireCrest.visible = false;
    }
    if (donutNode) donutNode.group.visible = false;
    if (coneNode) coneNode.group.visible = false;
    if (ringWavesNode) ringWavesNode.group.visible = false;
    if (lavaWallNode) lavaWallNode.group.visible = false;
    for (var p = 0; p < poolNodes.length; p++) poolNodes[p].group.visible = false;
    for (var im = 0; im < impactNodes.length; im++) impactNodes[im].group.visible = false;
    if (pillarArenaNode) pillarArenaNode.group.visible = false;
    for (var k = 0; k < pillarNodes.length; k++) pillarNodes[k].group.visible = false;
    if (casterNode) casterNode.group.visible = false;
  }

  function floorYAt(x, z) {
    if (typeof actorFloorY === 'function') {
      try { return actorFloorY(x, z) + 0.08; } catch (_) {}
    }
    return 0.08;
  }

  function wrapAngle(a) {
    while (a > Math.PI) a -= Math.PI * 2;
    while (a < -Math.PI) a += Math.PI * 2;
    return a;
  }

  function styleBeamNode(bn, volcanic, pct, len) {
    bn.fill.material.color.setHex(volcanic ? 0xff3b0d : 0xff244c);
    bn.core.material.color.setHex(volcanic ? 0xffe885 : 0xffcf7c);
    bn.railL.material.color.setHex(volcanic ? 0xffcf5c : 0xff8599);
    bn.railR.material.color.setHex(volcanic ? 0xffcf5c : 0xff8599);
    if (bn.fireWall && bn.fireCrest) {
      bn.fireWall.visible = Boolean(volcanic);
      bn.fireCrest.visible = Boolean(volcanic);
      if (volcanic) {
        var hScale = 0.45 + 0.95 * (pct || 0.5);
        bn.fireWall.scale.set(len || 24, hScale, 1);
        bn.fireWall.position.y = 0.92 * hScale;
        bn.fireWall.material.opacity = 0.42 + 0.32 * (pct || 0.5);
        bn.fireCrest.scale.set(len || 24, 0.8 + 0.6 * (pct || 0.5), 1);
        bn.fireCrest.position.y = 0.28 + 0.25 * (pct || 0.5);
      }
    }
  }

  function updateMeshes() {
    if (!ensureMeshes()) return;
    hideAllHazardMeshes();
    var isThor = activeDungeon().id === 'thor';

    for (var p = 0; p < raid.voidPools.length && p < poolNodes.length; p++) {
      var vp = raid.voidPools[p];
      var pn = poolNodes[p];
      var magmaPool = Boolean(vp.volcanic || isThor);
      pn.fill.material.color.setHex(magmaPool ? 0xff4610 : 0x9c2cff);
      pn.ring.material.color.setHex(magmaPool ? 0xffe066 : 0xff5492);
      if (pn.plume) pn.plume.material.color.setHex(magmaPool ? 0xff7b1c : 0xb254ff);
      pn.group.visible = true;
      pn.group.position.set(vp.x, floorYAt(vp.x, vp.z) - 0.06, vp.z);
      pn.group.scale.set(vp.r, 1, vp.r);
      var fade = Math.min(1, vp.left / 0.8);
      pn.fill.material.opacity = (0.46 + 0.12 * Math.sin(vp.left * 8)) * fade;
      pn.ring.material.opacity = 0.95 * fade;
      if (pn.plume) {
        pn.plume.scale.set(1, 0.8 + 0.35 * Math.sin(vp.left * 9), 1);
        pn.plume.material.opacity = 0.38 * fade;
      }
    }

    for (var im = 0; im < raid.impacts.length && im < impactNodes.length; im++) {
      var imp = raid.impacts[im];
      var inod = impactNodes[im];
      var ik = Math.max(0, Math.min(1, imp.age / Math.max(0.1, imp.life)));
      var isVolcImp = Boolean(imp.volcanic || isThor);
      inod.geyser.material.color.setHex(isVolcImp ? 0xff6e18 : 0xd946ff);
      inod.core.material.color.setHex(isVolcImp ? 0xfff3ad : 0x9ef4ff);
      inod.ring.material.color.setHex(isVolcImp ? 0xffd666 : 0xff80b5);
      inod.group.visible = true;
      inod.group.position.set(imp.x, floorYAt(imp.x, imp.z) - 0.06, imp.z);
      var rGrow = imp.r * (0.45 + 0.75 * ik);
      var yFade = 1 - ik;
      inod.geyser.scale.set(Math.max(0.4, imp.r * 0.32), 0.55 + 1.15 * Math.sin(ik * Math.PI), Math.max(0.4, imp.r * 0.32));
      inod.geyser.material.opacity = 0.86 * yFade;
      inod.core.scale.set(Math.max(0.4, imp.r * 0.26), 0.65 + 1.25 * Math.sin(ik * Math.PI), Math.max(0.4, imp.r * 0.26));
      inod.core.material.opacity = 0.94 * yFade;
      inod.ring.scale.set(rGrow, rGrow, 1);
      inod.ring.material.opacity = 0.95 * yFade;
    }

    var tg = raid.telegraph;
    if (tg) {
      var pct = Math.max(0.06, Math.min(1, tg.age / tg.life));
      var pulse = 0.38 + 0.24 * pct + 0.08 * Math.sin(tg.age * 16);
      var shape = tg.shape || 'circle';

      if (casterNode && tg.casterRef && tg.casterRef.hp > 0) {
        var cx0 = tg.casterRef.x, cz0 = tg.casterRef.z;
        var isVolcCast = Boolean(tg.volcanic || isThor);
        casterNode.outerRing.material.color.setHex(isVolcCast ? 0xff9426 : 0x62e8ff);
        casterNode.innerSeal.material.color.setHex(isVolcCast ? 0xffe680 : 0xc084fc);
        casterNode.chargeCol.material.color.setHex(isVolcCast ? 0xff5a14 : 0x7c3aed);
        casterNode.group.visible = true;
        casterNode.group.position.set(cx0, floorYAt(cx0, cz0) - 0.06, cz0);
        var cScale = 0.92 + 0.32 * pct + 0.06 * Math.sin(tg.age * 14);
        casterNode.outerRing.scale.set(cScale, cScale, 1);
        casterNode.innerSeal.rotation.z = tg.age * 4.2;
        casterNode.innerSeal.scale.set(0.85 + 0.45 * pct, 0.85 + 0.45 * pct, 1);
        casterNode.chargeCol.scale.set(0.85 + 0.25 * pct, 0.45 + 0.85 * pct, 0.85 + 0.25 * pct);
        casterNode.chargeCol.material.opacity = 0.26 + 0.30 * pct;
      }

      if (shape === 'pillars' && pillarArenaNode) {
        var isVolcSpire = Boolean(tg.volcanicSpires);
        pillarArenaNode.floorFill.material.color.setHex(isVolcSpire ? 0xff330a : 0xff163c);
        pillarArenaNode.shockWave.material.color.setHex(isVolcSpire ? 0xffe278 : 0xffcf6e);
        pillarArenaNode.group.visible = true;
        pillarArenaNode.group.position.set(tg.x, floorYAt(tg.x, tg.z) - 0.08, tg.z);
        pillarArenaNode.floorFill.material.opacity = 0.30 + 0.24 * pct + 0.07 * Math.sin(tg.age * 18);
        var waveR = Math.max(0.6, pct * 20.0);
        pillarArenaNode.shockWave.scale.set(waveR, waveR, 1);
        if (pillarArenaNode.vortexFunnel) {
          pillarArenaNode.vortexFunnel.visible = isVolcSpire;
          pillarArenaNode.vortexFunnel.rotation.y = tg.age * 4.5;
          pillarArenaNode.vortexFunnel.material.opacity = 0.34 + 0.22 * pct;
        }

        var pList = Array.isArray(tg.pillars) ? tg.pillars : [];
        var dropT = Math.min(1, tg.age / 0.55);
        var colY = isVolcSpire ? (-(1 - dropT) * 3.8) : ((1 - dropT) * (1 - dropT) * 13.5);
        for (var pk = 0; pk < pList.length && pk < pillarNodes.length; pk++) {
          var pd = pList[pk];
          var pNode = pillarNodes[pk];
          pNode.shaft.material.color.setHex(isVolcSpire ? 0xff9a54 : 0x9fb4e8);
          pNode.shaft.material.opacity = 0.78 + 0.16 * Math.sin(tg.age * 6 + pk);
          pNode.runeBand.material.color.setHex(isVolcSpire ? 0xff9426 : 0x6af7d0);
          pNode.crown.material.color.setHex(isVolcSpire ? 0xffe06e : 0xfff0a8);
          pNode.baseRing.material.color.setHex(isVolcSpire ? 0xffbe4a : 0x76ffd8);
          pNode.core.material.color.setHex(isVolcSpire ? 0xffd08a : 0xcfe9ff);
          pNode.core.material.opacity = 0.45 + 0.3 * (0.5 + 0.5 * Math.sin(tg.age * 7 + pk));
          pNode.collar.material.color.setHex(isVolcSpire ? 0xffb24a : 0xa8fff0);
          pNode.runeUpper.material.color.setHex(isVolcSpire ? 0xff7a2a : 0x6af7d0);
          pNode.runeUpper.rotation.z = tg.age * 1.6 + pk;
          pNode.runeBand.rotation.z = -tg.age * 1.1;
          pNode.glow.material.color.setHex(isVolcSpire ? 0xff7a2a : 0x76ffd8);
          pNode.glow.material.opacity = 0.55 + 0.25 * Math.sin(tg.age * 5 + pk);
          pNode.trail.material.color.setHex(isVolcSpire ? 0xffc46a : 0xbff6ff);
          pNode.trail.visible = !isVolcSpire && dropT < 1;
          pNode.trail.position.y = Math.max(4.6, 7.2 + (1 - dropT) * 6.0);
          for (var sh = 0; sh < pNode.shards.length; sh++) {
            var shardMesh = pNode.shards[sh];
            var shAng = tg.age * 2.4 + sh * 2.094;
            shardMesh.position.set(Math.cos(shAng) * (0.95 + 0.08 * Math.sin(tg.age * 3 + sh)), 4.3 + 0.22 * Math.sin(tg.age * 4 + sh), Math.sin(shAng) * (0.95 + 0.08 * Math.sin(tg.age * 3 + sh)));
            shardMesh.material.color.setHex(isVolcSpire ? 0xffd06e : 0xdff6ff);
            shardMesh.rotation.x = tg.age * 1.7 + sh;
            shardMesh.rotation.y = tg.age * 2.1 + sh;
          }
          pNode.group.visible = true;
          pNode.group.position.set(pd.x, floorYAt(pd.x, pd.z) - 0.08, pd.z);
          pNode.columnWrap.position.y = colY;
          pNode.crown.rotation.y = tg.age * 3.5;
          var rayAng = Math.atan2(pd.z - tg.z, pd.x - tg.x);
          pNode.shadowPivot.rotation.y = -rayAng;
          pNode.shadowPivot.visible = dropT >= 0.35;
          pNode.shadowFill.material.opacity = 0.38 + 0.14 * Math.sin(tg.age * 10);
        }
      } else if (shape === 'cone' && coneNode) {
        var cr = tg.r || 15.0;
        coneNode.group.visible = true;
        coneNode.group.position.set(tg.x, floorYAt(tg.x, tg.z) - 0.08, tg.z);
        coneNode.group.rotation.y = -(tg.ang || 0);
        coneNode.group.scale.set(cr, cr * 0.42, cr);
        coneNode.fill.material.opacity = pulse + 0.08;
        var wFrac = Math.max(0.14, pct);
        coneNode.wave.scale.set(wFrac, wFrac, 1);
        if (coneNode.plumes) {
          for (var cp = 0; cp < coneNode.plumes.length; cp++) {
            var plm = coneNode.plumes[cp];
            var pr = 0.14 + ((pct + cp * 0.28) % 0.82);
            var pa = plm.userData.angOff;
            plm.position.set(Math.cos(pa) * pr, 0.09 + 0.06 * Math.sin(tg.age * 14 + cp), Math.sin(pa) * pr);
            plm.rotation.y = -pa;
            plm.material.opacity = 0.55 + 0.30 * pct;
          }
        }
      } else if (shape === 'ringwaves' && ringWavesNode) {
        ringWavesNode.group.visible = true;
        ringWavesNode.group.position.set(tg.x, floorYAt(tg.x, tg.z) - 0.08, tg.z);
        ringWavesNode.innerCore.material.opacity = pulse + 0.08;
        ringWavesNode.outerCaldera.material.opacity = pulse + 0.06;
        ringWavesNode.safeBand.material.opacity = 0.24 + 0.08 * Math.sin(tg.age * 10);
        var pScale = pct < 0.5 ? (0.4 + (pct * 2) * 3.9) : (8.3 + ((pct - 0.5) * 2) * 9.5);
        ringWavesNode.pulseInner.scale.set(pScale, pScale, 1);
        if (ringWavesNode.geysers) {
          for (var rg = 0; rg < ringWavesNode.geysers.length; rg++) {
            var gyM = ringWavesNode.geysers[rg];
            var gh = 0.45 + 1.15 * pct + 0.22 * Math.sin(tg.age * 14 + rg);
            gyM.scale.set(1, gh, 1);
            gyM.position.y = 1.3 * gh;
            gyM.material.opacity = 0.48 + 0.36 * pct;
          }
        }
      } else if (shape === 'triskelion') {
        var curAng = (tg.ang || 0) + (tg.rotSpeed || 0.68) * (tg.age || 0);
        var sLen = tg.len || 15.6;
        var sW = tg.width || 2.55;
        for (var s = 0; s < 3 && s < beamNodes.length; s++) {
          var sNode = beamNodes[s];
          styleBeamNode(sNode, true, pct, sLen);
          var spokeAng = curAng + s * (Math.PI * 2 / 3);
          var cx = tg.x + Math.cos(spokeAng) * sLen * 0.5;
          var cz = tg.z + Math.sin(spokeAng) * sLen * 0.5;
          var beamAng = spokeAng + Math.PI * 0.5;
          sNode.group.visible = true;
          sNode.group.position.set(cx, floorYAt(cx, cz) - 0.08, cz);
          sNode.group.rotation.y = -beamAng;
          sNode.fill.scale.set(sW, sLen, 1);
          sNode.fill.material.opacity = pulse + 0.08;
          sNode.core.scale.set(Math.max(0.14, sW * pct), sLen, 1);
          sNode.core.material.opacity = 0.58 + 0.34 * pct;
          sNode.railL.position.x = -sW * 0.5;
          sNode.railL.scale.set(1, sLen, 1);
          sNode.railR.position.x = sW * 0.5;
          sNode.railR.scale.set(1, sLen, 1);
        }
      } else if (shape === 'lava_wall' && lavaWallNode) {
        var halfW = 14.5;
        var depth = tg.depth || 7.2;
        var gapX = tg.gapX || 0;
        var gapHW = tg.gapHalfW || 2.6;
        var wy = floorYAt(0, tg.z) - 0.08;
        var waveZ = (-0.42 + 0.84 * pct) * depth;
        var waveH = 0.55 + 0.75 * pct;
        lavaWallNode.group.visible = true;
        lavaWallNode.group.position.set(0, wy, tg.z);

        var leftEdge = gapX - gapHW;
        var leftW = Math.max(0, leftEdge - (-halfW));
        lavaWallNode.left.wrap.visible = leftW > 0.15;
        if (leftW > 0.15) {
          lavaWallNode.left.wrap.position.set(-halfW + leftW * 0.5, 0, 0);
          lavaWallNode.left.fill.scale.set(leftW, depth, 1);
          lavaWallNode.left.fill.material.opacity = pulse + 0.08;
          lavaWallNode.left.crest.scale.set(leftW, Math.max(0.22, depth * pct), 1);
          lavaWallNode.left.borderF.position.z = depth * 0.5;
          lavaWallNode.left.borderF.scale.set(leftW, 1, 1);
          lavaWallNode.left.borderB.position.z = -depth * 0.5;
          lavaWallNode.left.borderB.scale.set(leftW, 1, 1);
          lavaWallNode.left.waveBody.scale.set(leftW, waveH, 1);
          lavaWallNode.left.waveBody.position.set(0, 1.08 * waveH, waveZ);
          lavaWallNode.left.waveFoam.scale.set(leftW, 1, 1);
          lavaWallNode.left.waveFoam.position.set(0, 2.08 * waveH, waveZ);
        }

        var rightEdge = gapX + gapHW;
        var rightW = Math.max(0, halfW - rightEdge);
        lavaWallNode.right.wrap.visible = rightW > 0.15;
        if (rightW > 0.15) {
          lavaWallNode.right.wrap.position.set(rightEdge + rightW * 0.5, 0, 0);
          lavaWallNode.right.fill.scale.set(rightW, depth, 1);
          lavaWallNode.right.fill.material.opacity = pulse + 0.08;
          lavaWallNode.right.crest.scale.set(rightW, Math.max(0.22, depth * pct), 1);
          lavaWallNode.right.borderF.position.z = depth * 0.5;
          lavaWallNode.right.borderF.scale.set(rightW, 1, 1);
          lavaWallNode.right.borderB.position.z = -depth * 0.5;
          lavaWallNode.right.borderB.scale.set(rightW, 1, 1);
          lavaWallNode.right.waveBody.scale.set(rightW, waveH, 1);
          lavaWallNode.right.waveBody.position.set(0, 1.08 * waveH, waveZ);
          lavaWallNode.right.waveFoam.scale.set(rightW, 1, 1);
          lavaWallNode.right.waveFoam.position.set(0, 2.08 * waveH, waveZ);
        }

        var gateW = gapHW * 2;
        lavaWallNode.safeGate.position.set(gapX, 0, 0);
        lavaWallNode.gateFill.scale.set(gateW, depth, 1);
        lavaWallNode.gateFill.material.opacity = 0.26 + 0.10 * Math.sin(tg.age * 10);
        lavaWallNode.gateRailL.position.x = -gapHW;
        lavaWallNode.gateRailL.scale.set(1, depth, 1);
        lavaWallNode.gateRailR.position.x = gapHW;
        lavaWallNode.gateRailR.scale.set(1, depth, 1);
      } else if (shape === 'fissure_lanes' && Array.isArray(tg.beams)) {
        for (var fl = 0; fl < tg.beams.length && fl < beamNodes.length; fl++) {
          var lane = tg.beams[fl];
          var lNode = beamNodes[fl];
          styleBeamNode(lNode, true, pct, lane.len);
          lNode.group.visible = true;
          lNode.group.position.set(lane.x, floorYAt(lane.x, lane.z) - 0.08, lane.z);
          lNode.group.rotation.y = -(lane.ang || 0);
          lNode.fill.scale.set(lane.width, lane.len, 1);
          lNode.fill.material.opacity = pulse + 0.08;
          lNode.core.scale.set(Math.max(0.14, lane.width * pct), lane.len, 1);
          lNode.core.material.opacity = 0.58 + 0.34 * pct;
          lNode.railL.position.x = -lane.width * 0.5;
          lNode.railL.scale.set(1, lane.len, 1);
          lNode.railR.position.x = lane.width * 0.5;
          lNode.railR.scale.set(1, lane.len, 1);
        }
      } else if (shape === 'circle' || shape === 'multi') {
        var zones = shape === 'multi' && Array.isArray(tg.zones)
          ? tg.zones
          : [{ x: tg.x, z: tg.z, r: tg.r || 4.0 }];
        var isVolcCrater = Boolean(tg.volcanic);
        for (var i = 0; i < zones.length && i < craterNodes.length; i++) {
          var zc = zones[i];
          var cn = craterNodes[i];
          cn.fill.material.color.setHex(isVolcCrater ? 0xff3b0d : 0xff2448);
          cn.border.material.color.setHex(isVolcCrater ? 0xffcf5c : 0xff8ea2);
          if (cn.aura) cn.aura.material.color.setHex(isVolcCrater ? 0xff5a14 : 0xff4668);
          if (cn.tail) cn.tail.material.color.setHex(isVolcCrater ? 0xffaa2b : 0xff854a);
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
            if (tg.lobFrom) {
              // Monster-lobbed parabolic magma bomb arcing directly from the casting mob into the impact crater!
              var ox = tg.lobFrom.x - zc.x;
              var oz = tg.lobFrom.z - zc.z;
              var arcPeak = 4.6;
              var curX = ox * fall;
              var curZ = oz * fall;
              var curY = fall * 1.85 + 4 * pct * fall * arcPeak + 0.28;
              cn.meteor.position.set(curX, curY, curZ);
              var vx = -ox;
              var vz = -oz;
              var vy = -1.85 + 4 * (1 - 2 * pct) * arcPeak;
              var vLen = Math.hypot(vx, vy, vz) || 1;
              if (typeof THREE !== 'undefined' && THREE.Vector3 && cn.meteor.quaternion && cn.meteor.quaternion.setFromUnitVectors) {
                cn.meteor.quaternion.setFromUnitVectors(
                  new THREE.Vector3(0, 1, 0),
                  new THREE.Vector3(-vx / vLen, -vy / vLen, -vz / vLen)
                );
              } else {
                cn.meteor.rotation.set(0, 0, -0.22);
              }
              if (cn.tail) {
                cn.tail.scale.set(0.85, 0.52, 0.85);
                cn.tail.position.set(0, 1.15, 0);
              }
            } else {
              var h = 15.5 * fall;
              cn.meteor.position.set(-fall * 3.2, h + 0.35, -fall * 2.4);
              cn.meteor.rotation.set(0, 0, -0.22);
              if (cn.tail) {
                cn.tail.scale.set(1, 1, 1);
                cn.tail.position.set(0, 2.2, 0);
              }
            }
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
        donutNode.danger.material.opacity = pulse + 0.06;
        donutNode.safeFill.material.opacity = 0.20 + 0.06 * Math.sin(tg.age * 10);
      } else if (shape === 'beam' || shape === 'cross') {
        var count = shape === 'cross' ? 2 : 1;
        for (var b = 0; b < count && b < beamNodes.length; b++) {
          var bn = beamNodes[b];
          var ang = (tg.ang || 0) + (b === 1 ? Math.PI / 2 : 0);
          var w = tg.width || 3.0;
          var len = tg.len || 24;
          var waveLen = tg.growFromCaster ? Math.max(1.4, len * pct) : len;
          styleBeamNode(bn, Boolean(tg.volcanic), pct, waveLen);
          bn.group.visible = true;
          bn.group.position.set(tg.x, floorYAt(tg.x, tg.z) - 0.08, tg.z);
          bn.group.rotation.y = -ang;
          if (tg.growFromCaster && bn.fireWall && bn.fireCrest) {
            var zShift = -(len - waveLen) * 0.5;
            bn.fireWall.position.z = zShift;
            bn.fireCrest.position.z = zShift;
          } else if (bn.fireWall && bn.fireCrest) {
            bn.fireWall.position.z = 0;
            bn.fireCrest.position.z = 0;
          }
          bn.fill.scale.set(w, len, 1);
          bn.fill.material.opacity = pulse;
          bn.core.scale.set(Math.max(0.1, w * pct), len, 1);
          bn.core.material.opacity = 0.52 + 0.32 * pct;
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
      moveRing.material.opacity = Math.min(0.92, raid.moveTarget.left * 1.4);
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

  // ---------- Hit Geometry for Astral & Thor Volcano Hazard Shapes ----------
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
    if (shape === 'cone') {
      var cdx = px - tg.x, cdz = pz - tg.z;
      var cd = Math.hypot(cdx, cdz);
      if (cd > (tg.r || 15.0)) return false;
      if (cd < 0.65) return true;
      var diff = wrapAngle(Math.atan2(cdz, cdx) - (tg.ang || 0));
      return Math.abs(diff) <= (tg.halfArc || CONE_HALF_ARC);
    }
    if (shape === 'ringwaves') {
      var rd = Math.hypot(px - tg.x, pz - tg.z);
      var innerSafe = tg.innerSafeR || 4.3;
      var outerSafe = tg.outerSafeR || 8.3;
      return rd < innerSafe || (rd > outerSafe && rd <= (tg.r || 18.0));
    }
    if (shape === 'triskelion') {
      var curAng = (tg.ang || 0) + (tg.rotSpeed || 0.68) * (tg.age || 0);
      var sLen = tg.len || 15.6;
      var sW = tg.width || 2.55;
      for (var s = 0; s < 3; s++) {
        var spokeAng = curAng + s * (Math.PI * 2 / 3);
        var cx = tg.x + Math.cos(spokeAng) * sLen * 0.5;
        var cz = tg.z + Math.sin(spokeAng) * sLen * 0.5;
        if (pointInBeam(px, pz, cx, cz, spokeAng + Math.PI * 0.5, sW, sLen)) return true;
      }
      return false;
    }
    if (shape === 'lava_wall') {
      var depth = tg.depth || 7.2;
      var gapX = tg.gapX || 0;
      var gapHW = tg.gapHalfW || 2.6;
      return Math.abs(pz - tg.z) <= depth * 0.5 && Math.abs(px - gapX) > gapHW;
    }
    if (shape === 'fissure_lanes' && Array.isArray(tg.beams)) {
      for (var fl = 0; fl < tg.beams.length; fl++) {
        var lane = tg.beams[fl];
        if (pointInBeam(px, pz, lane.x, lane.z, lane.ang || 0, lane.width || 2.65, lane.len || 24)) return true;
      }
      return false;
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
  function spawnRaidStage(stageIdx, arrivedOnFoot) {
    var dng = activeDungeon();
    var stages = dng.stages;
    var st = stages[stageIdx];
    if (!st) return;
    releaseBossAnchor();
    raid.stage = stageIdx;
    raid.telegraph = null;
    raid.voidPools = [];
    raid.impacts = [];
    raid.nextCastIn = st.boss ? 3.8 : 1.6;
    raid.bossCleaveIn = BOSS_CLEAVE_INTERVAL_S;
    raid.pillarCastDone = false;
    raid.transition = null;
    raid.moveTarget = null;

    var mapId = dng.mapId || 10;
    raid._internalNav = true;
    try {
      S.mp = mapId;
      S.lvl = st.astralStage;
      // v471: a raid can begin (or jump) from ANY field stage. The astral/thor scenery is one
      // continuous world whose root z is the stage, so a non-walk jump must re-seat the world, the
      // hero and the camera together - otherwise stage-1 mobs spawn on the last field stage's map and
      // the first transition shifts the world from the wrong origin ("flying off into space").
      if (!arrivedOnFoot && typeof snapAstralStage === 'function') {
        try { snapAstralStage(st.astralStage); } catch (e) { /* scenery not built yet: the build will place it */ }
      }
      if (typeof astralOriginStage !== 'undefined') astralOriginStage = (mapId === 10 || mapId === 11) ? st.astralStage : 0;
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
        if (arrivedOnFoot && stageIdx > 0) {
          pl.x = Math.max(-b.bx + 1.0, Math.min(b.bx - 1.0, pl.x));
          pl.z = Math.max(b.z0 + 1.5, Math.min(b.z1 - 1.5, pl.z));
        } else {
          pl.x = 0;
          pl.z = st.boss ? 2.5 : (b.z1 - 2.2);
        }
        pl.wz = pl.z;
        pl.wx = null;
        pl.wt = 0;
      }
      if (typeof spawn === 'function') spawn();
      if (typeof camps !== 'undefined') camps = [];
      if (typeof respawn !== 'undefined') respawn = 999;

      var pCount = activePartyCount();
      raid.activePartyScaleCount = pCount;
      var scale = partyHpScale(pCount);
      var atkParty = partyAtkScale(pCount);
      var nowT = (typeof t === 'number' && Number.isFinite(t)) ? t : 0;
      var trashHpMult = mapId === 11 ? TRASH_HP_MULT_THOR : TRASH_HP_MULT_ASTRAL;
      var bossHpMult = mapId === 11 ? BOSS_HP_MULT_THOR : BOSS_HP_MULT_ASTRAL;
      var escortHpMult = mapId === 11 ? ESCORT_HP_MULT_THOR : ESCORT_HP_MULT_ASTRAL;
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
            mobs[k].provokeUntil = nowT + 86400;
            mobs[k].hp = Math.max(1, Math.floor(mobs[k].hp * trashHpMult * scale));
            mobs[k].max = mobs[k].hp;
            mobs[k].atk = Math.max(1, Math.floor((mobs[k].atk || 100) * 1.25 * atkParty));
          }
        } else {
          for (var i = 0; i < mobs.length; i++) {
            var mult = mobs[i].boss ? (bossHpMult * scale) : (escortHpMult * scale);
            var atkMult = (mobs[i].boss ? BOSS_ATK_MULT : ESCORT_ATK_MULT) * atkParty;
            mobs[i].hp = Math.max(1, Math.floor(mobs[i].hp * mult));
            mobs[i].max = mobs[i].hp;
            mobs[i].atk = Math.max(1, Math.floor((mobs[i].atk || 500) * atkMult));
            mobs[i].hx = null;
            mobs[i].hz = null;
            mobs[i].provokeUntil = nowT + 86400;
            if (mobs[i].boss) {
              mobs[i].raidArmor = RAID_BOSS_ARMOR;
            }
          }
        }
        if (typeof nearestPack === 'function' && typeof activePack !== 'undefined') {
          activePack = nearestPack();
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

  function onKey(key, down, repeat) {
    if (!raid.on) return false;
    var k = String(key || '').toLowerCase();
    var isDown = Boolean(down);
    var isRepeat = Boolean(repeat);
    if (isDown && k === 'enter') {
      if (isRepeat) return true;
      raid.keys = { w: false, a: false, s: false, d: false };
      raid.chatMinimized = false;
      var box = $('raidChatBox');
      if (box) box.classList.remove('minimized');
      var inp = $('raidChatInput');
      if (inp) inp.focus();
      return true;
    }
    if (isDown && k === 'h') {
      if (!isRepeat) toggleHoldGround();
      return true;
    }
    if (k === 'w' || k === 'arrowup') { raid.keys.w = isDown; return true; }
    if (k === 's' || k === 'arrowdown') { raid.keys.s = isDown; return true; }
    if (k === 'a' || k === 'arrowleft') { raid.keys.a = isDown; return true; }
    if (k === 'd' || k === 'arrowright') { raid.keys.d = isDown; return true; }
    if (isDown && (k === ' ' || k === 'shift')) {
      if (!isRepeat) dodge();
      return true;
    }
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

  function snapToCombat() {
    if (typeof mobs === 'undefined' || !Array.isArray(mobs) || !mobs.length || typeof pl === 'undefined' || !pl) return;
    var best = null, bestD = 1e9;
    for (var i = 0; i < mobs.length; i++) {
      var m = mobs[i];
      if (!m || m.hp <= 0) continue;
      var d = Math.hypot(m.x - pl.x, m.z - pl.z);
      if (m.boss) d -= 0.8;
      if (d < bestD) { bestD = d; best = m; }
    }
    if (best) {
      if (typeof mob !== 'undefined') mob = best;
      if (typeof engageTgt !== 'undefined') engageTgt = best;
      if (typeof engageWait !== 'undefined') engageWait = 0;
      if (typeof activePack !== 'undefined') activePack = best.pack;
      if (typeof pAtkT === 'number') pAtkT = Math.min(pAtkT, 0.02);
    }
  }

  function isManualMove() {
    if (!raid.on || raid.dead) return false;
    if (raid.keys.w || raid.keys.a || raid.keys.s || raid.keys.d) return true;
    if (raid.moveTarget && raid.moveTarget.left > 0 && typeof pl !== 'undefined' && pl) {
      if (Math.hypot(raid.moveTarget.x - pl.x, raid.moveTarget.z - pl.z) > 0.25) return true;
    }
    return false;
  }

  // v467 (owner: "auto attacking runs me out of the pillar shadow"): the shared field AI walks the
  // hero into reach of the nearest monster whenever the player is not steering. During a
  // hide-behind-pillar wipe that undoes the whole mechanic - the player parks in the green shadow,
  // the hero strolls back out and eats the 68% blast. Auto-approach is now suspended for the entire
  // charge of a pillar wipe, and Hold Ground suspends it on demand. Neither ever stops a swing that
  // is already in reach: only the walking is refused.
  function pillarWipeCharging() {
    var tg = raid.telegraph;
    if (!tg) return false;
    if (tg.mustHideBehindPillar) return true;
    return tg.shape === 'pillars' && Array.isArray(tg.pillars) && tg.pillars.length > 0;
  }

  function inPillarShadow() {
    var tg = raid.telegraph;
    if (!tg || tg.shape !== 'pillars' || !Array.isArray(tg.pillars) || !tg.pillars.length) return false;
    if (typeof pl === 'undefined' || !pl) return false;
    return isBehindAnyPillar(tg.x, tg.z, tg.pillars, pl.x, pl.z);
  }

  function holdGroundActive() {
    return Boolean(raid.holdGround) || pillarWipeCharging();
  }

  function toggleHoldGround() {
    if (!raid.on) return false;
    raid.holdGround = !raid.holdGround;
    pushSystemChat(raid.holdGround
      ? '⏸ Hold Ground ON — auto-approach off. WASD / click still moves; attacks in reach continue.'
      : '▶ Hold Ground OFF — auto-approach resumed.');
    renderHud();
    return raid.holdGround;
  }

  function overrideMove(dt) {
    if (!raid.on || raid.dead || typeof pl === 'undefined' || !pl) return null;
    var kv = keyVector();
    if (kv) {
      raid.moveTarget = null;
      raid._wasManualMoving = true;
      return { x: clampToBridge(pl.x + kv.x * 4.5, pl.z + kv.z * 4.5).x, z: clampToBridge(pl.x + kv.x * 4.5, pl.z + kv.z * 4.5).z, moving: true };
    }
    if (raid.moveTarget) {
      raid.moveTarget.left -= dt;
      var d = Math.hypot(raid.moveTarget.x - pl.x, raid.moveTarget.z - pl.z);
      if (raid.moveTarget.left <= 0) {
        raid.moveTarget = null;
        raid._wasManualMoving = false;
        snapToCombat();
        return null;
      }
      if (d <= 0.28) {
        if (!raid.telegraph) {
          raid.moveTarget = null;
          raid._wasManualMoving = false;
          snapToCombat();
          return null;
        }
        raid.moveTarget.holdOnly = true;
        return { x: raid.moveTarget.x, z: raid.moveTarget.z, moving: false };
      }
      raid._wasManualMoving = true;
      return { x: raid.moveTarget.x, z: raid.moveTarget.z, moving: true };
    }
    if (raid._wasManualMoving) {
      raid._wasManualMoving = false;
      snapToCombat();
    }
    // moving:false pins the hero where they stand without clearing the field AI's target, so an
    // in-reach monster still gets hit and the hero simply refuses to walk.
    if (holdGroundActive()) return { x: pl.x, z: pl.z, moving: false };
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
      } else if (shape === 'cone') {
        var relAng = wrapAngle(Math.atan2(pz - tg.z, px - tg.x) - (tg.ang || 0));
        var outAng = (tg.ang || 0) + (relAng >= 0 ? 1 : -1) * ((tg.halfArc || CONE_HALF_ARC) + 0.48);
        var safeConePt = clampToBridge(tg.x + Math.cos(outAng) * 4.4, tg.z + Math.sin(outAng) * 4.4);
        var cdx = safeConePt.x - px, cdz = safeConePt.z - pz, cl = Math.hypot(cdx, cdz);
        if (cl > 0.1) return { x: cdx / cl, z: cdz / cl };
      } else if (shape === 'ringwaves') {
        var rvx = px - tg.x, rvz = pz - tg.z;
        var rd = Math.hypot(rvx, rvz);
        var targetMid = ((tg.innerSafeR || 4.3) + (tg.outerSafeR || 8.3)) * 0.5;
        if (rd < 0.1) return { x: 0, z: 1 };
        var signR = rd < targetMid ? 1 : -1;
        return { x: (rvx / rd) * signR, z: (rvz / rd) * signR };
      } else if (shape === 'triskelion') {
        var endAng = (tg.ang || 0) + (tg.rotSpeed || 0.68) * (tg.life || 2.5);
        var bestSlice = endAng + Math.PI / 3;
        var bestDelta = 1e9;
        var pAng = Math.atan2(pz - tg.z, px - tg.x);
        for (var ts = 0; ts < 3; ts++) {
          var candAng = endAng + ts * (Math.PI * 2 / 3) + Math.PI / 3;
          var dAng = Math.abs(wrapAngle(candAng - pAng));
          if (dAng < bestDelta) { bestDelta = dAng; bestSlice = candAng; }
        }
        var safePinPt = clampToBridge(tg.x + Math.cos(bestSlice) * 5.2, tg.z + Math.sin(bestSlice) * 5.2);
        var tdx = safePinPt.x - px, tdz = safePinPt.z - pz, tl = Math.hypot(tdx, tdz);
        if (tl > 0.1) return { x: tdx / tl, z: tdz / tl };
      } else if (shape === 'lava_wall') {
        var gapX = tg.gapX || 0;
        if (Math.abs(px - gapX) > (tg.gapHalfW || 2.6) - 0.35) {
          return { x: gapX > px ? 1 : -1, z: 0 };
        }
        return { x: 0, z: pz >= tg.z ? 1 : -1 };
      } else if (shape === 'fissure_lanes' && Array.isArray(tg.beams) && tg.beams.length) {
        var fAng = tg.beams[0].ang || 0;
        var fnx = Math.cos(fAng), fnz = Math.sin(fAng);
        var bestOff = 0, bestClear = -1;
        var candidatesOff = [-8.4, -2.8, 2.8, 8.4];
        for (var co = 0; co < candidatesOff.length; co++) {
          var testPt = clampToBridge(tg.x + fnx * candidatesOff[co], tg.z + fnz * candidatesOff[co]);
          if (!hitByTelegraph(tg, testPt.x, testPt.z)) {
            var dCand = Math.hypot(testPt.x - px, testPt.z - pz);
            var score = 100 - dCand;
            if (score > bestClear) { bestClear = score; bestOff = candidatesOff[co]; }
          }
        }
        var ridgePt = clampToBridge(tg.x + fnx * bestOff, tg.z + fnz * bestOff);
        var rdx = ridgePt.x - px, rdz = ridgePt.z - pz, rl = Math.hypot(rdx, rdz);
        if (rl > 0.1) return { x: rdx / rl, z: rdz / rl };
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
    if (!keyVector() && raid.telegraph) {
      var tg = raid.telegraph;
      if (tg.shape === 'pillars' && Array.isArray(tg.pillars) && tg.pillars.length) {
        var nearestSafe = null, nearestD = 1e9;
        for (var k = 0; k < tg.pillars.length; k++) {
          var spt = pillarSafeSpot(tg.x, tg.z, tg.pillars[k]);
          var d0 = Math.hypot(spt.x - pl.x, spt.z - pl.z);
          if (d0 < nearestD) { nearestD = d0; nearestSafe = spt; }
        }
        if (nearestSafe && nearestD <= DODGE_DIST) stepDist = nearestD;
      } else if (tg.shape === 'ringwaves') {
        var curR = Math.hypot(pl.x - tg.x, pl.z - tg.z);
        var midR = ((tg.innerSafeR || 4.3) + (tg.outerSafeR || 8.3)) * 0.5;
        var needR = Math.abs(midR - curR);
        if (needR > 0.2 && needR < DODGE_DIST) stepDist = needR;
      } else if (tg.shape === 'lava_wall') {
        var needGap = Math.abs((tg.gapX || 0) - pl.x);
        if (needGap > 0.2 && needGap < DODGE_DIST) stepDist = needGap;
      }
    }

    var dest = clampToBridge(pl.x + dir.x * stepDist, pl.z + dir.z * stepDist);
    var faceDx = dest.x - pl.x, faceDz = dest.z - pl.z;
    if (Math.hypot(faceDx, faceDz) > 0.05) {
      pl.ry = -Math.atan2(faceDz, faceDx);
    }
    pl.x = dest.x;
    pl.z = dest.z;
    if (raid.telegraph) {
      var holdRem = Math.max(0.25, Math.min(1.6, (raid.telegraph.life - raid.telegraph.age) + 0.1));
      raid.moveTarget = { x: dest.x, z: dest.z, left: holdRem, holdOnly: true };
    } else {
      raid.moveTarget = null;
    }
    if (typeof swing !== 'undefined') swing = null;
    snapToCombat();
    if (typeof addFloat === 'function') addFloat(pl.x, 2.5, pl.z, 'DODGE!', '#76eaff', true, 'evade');
    updateMeshes();
    renderHud();
    return true;
  }

  // ---------- Stage 1–3 Monster-Cast Skills & Stage 4 Boss Mechanics (Including Pillar Wipe!) ----------
  function spawnBridgeHazard(dt) {
    if (typeof mobs === 'undefined' || !mobs.length || typeof pl === 'undefined' || !pl) return;
    raid.nextCastIn -= dt;
    if (raid.nextCastIn > 0) return;

    var caster = pickStageCaster(pl.x, pl.z);
    if (!caster) return;

    raid.castSeq++;
    var b = fieldBounds();
    var isThor = raid.dungeonId === 'thor';
    var pick = raid.castSeq % 3;
    var stageGap = raid.stage === 0 ? 4.4 : (raid.stage === 1 ? 3.9 : 3.5);

    caster.fixed = true;
    caster._raidCasterRoot = true;
    caster.run = false;
    caster.atkAnim = 1;
    caster.ry = Math.atan2(pl.z - caster.z, caster.x - pl.x);

    var anchor = clampToBridge(pl.x, pl.z);
    var distToPl = Math.hypot(anchor.x - caster.x, anchor.z - caster.z);
    var aimDir = distToPl > 0.2 ? Math.atan2(anchor.z - caster.z, anchor.x - caster.x) : (Math.PI * 0.5);

    if (isThor) {
      // Thor Volcano Stages 1–3: every hazard visibly originates & animates directly out of the casting Volcano mob!
      if (pick === 1) {
        var fissureLen = Math.max(12.5, Math.min(16.5, distToPl + 5.2));
        var fCx = caster.x + Math.cos(aimDir) * fissureLen * 0.5;
        var fCz = caster.z + Math.sin(aimDir) * fissureLen * 0.5;
        raid.telegraph = {
          name: 'Magma Fissure',
          hint: caster.n.toUpperCase() + ' SLAMS A MAGMA FISSURE — Sidestep off the fault line!',
          shape: 'beam',
          volcanic: true,
          growFromCaster: true,
          casterRef: caster,
          casterX: caster.x,
          casterZ: caster.z,
          x: fCx,
          z: fCz,
          ang: aimDir + Math.PI * 0.5,
          width: 2.75,
          len: fissureLen,
          dmgPct: 0.24,
          age: 0,
          life: 2.2
        };
      } else if (pick === 2) {
        var bombZones = [{ x: anchor.x, z: anchor.z, r: 3.05 }];
        if (raid.stage >= 1) {
          var sideAng = aimDir + ((raid.castSeq % 2 === 0) ? 0.65 : -0.65);
          var secondPt = clampToBridge(
            caster.x + Math.cos(sideAng) * Math.max(4.5, distToPl * 0.85),
            caster.z + Math.sin(sideAng) * Math.max(4.5, distToPl * 0.85)
          );
          bombZones.push({ x: secondPt.x, z: secondPt.z, r: 2.85 });
        }
        raid.telegraph = {
          name: 'Magma Bomb',
          hint: caster.n.toUpperCase() + ' HURLS MAGMA BOMBS — Move out of the impact craters!',
          shape: 'multi',
          volcanic: true,
          meteors: true,
          leavesPool: true,
          lobFrom: { x: caster.x, z: caster.z },
          casterRef: caster,
          casterX: caster.x,
          casterZ: caster.z,
          poolSpot: { x: anchor.x, z: anchor.z },
          zones: bombZones,
          x: anchor.x,
          z: anchor.z,
          dmgPct: 0.23,
          age: 0,
          life: 2.25
        };
      } else {
        raid.telegraph = {
          name: 'Flame Breath',
          hint: caster.n.toUpperCase() + ' INHALES FLAME BREATH — Step outside its frontal cone!',
          shape: 'cone',
          volcanic: true,
          casterRef: caster,
          casterX: caster.x,
          casterZ: caster.z,
          x: caster.x,
          z: caster.z,
          ang: aimDir,
          halfArc: 0.72,
          r: Math.max(9.6, Math.min(12.2, distToPl + 3.8)),
          dmgPct: 0.22,
          age: 0,
          life: 2.2
        };
      }
      raid.nextCastIn = stageGap;
      if (typeof addFloat === 'function') {
        addFloat(caster.x, 2.35, caster.z, caster.n + ' · ' + raid.telegraph.name + '!', '#ffb35c', true, 'skill');
      }
      if (typeof skillNameFloat === 'function') skillNameFloat(raid.telegraph.name);
      return;
    }

    if (pick === 1) {
      var count = raid.stage >= 2 ? 4 : 3;
      var zones = [{ x: anchor.x, z: anchor.z, r: 3.1 }];
      for (var i = 1; i < count; i++) {
        var ox = ((i % 2 === 0 ? 1 : -1) * (2.6 + (i * 1.5) % 4.5));
        var oz = Math.max(b.z0 + 2, Math.min(b.z1 - 2, pl.z - 3.5 + (i - 1.5) * 4.2));
        var cz = clampToBridge(ox, oz);
        zones.push({ x: cz.x, z: cz.z, r: 2.9 });
      }
      raid.telegraph = {
        name: 'Astral Starfall',
        hint: 'FALLING METEORS — Move or DODGE out of craters!',
        shape: 'multi',
        meteors: true,
        casterRef: caster,
        casterX: caster.x,
        casterZ: caster.z,
        zones: zones,
        x: zones[0].x,
        z: zones[0].z,
        dmgPct: 0.23,
        age: 0,
        life: 2.25
      };
    } else if (pick === 2) {
      var lanceLen = Math.max(13.0, Math.min(18.0, distToPl + 5.5));
      var lCx = caster.x + Math.cos(aimDir) * lanceLen * 0.5;
      var lCz = caster.z + Math.sin(aimDir) * lanceLen * 0.5;
      raid.telegraph = {
        name: 'Sanctuary Lance',
        hint: 'ENERGY BEAM — Sidestep off ' + caster.n + '\'s laser lane!',
        shape: 'beam',
        casterRef: caster,
        casterX: caster.x,
        casterZ: caster.z,
        x: lCx,
        z: lCz,
        ang: aimDir + Math.PI * 0.5,
        width: 2.95,
        len: lanceLen,
        dmgPct: 0.25,
        age: 0,
        life: 2.2
      };
    } else {
      var p1 = anchor;
      var p2 = clampToBridge(-pl.x * 0.6, pl.z - 3.2);
      raid.telegraph = {
        name: 'Void Comet',
        hint: 'COMET STRIKE — Hurled by ' + caster.n + ', reposition!',
        shape: 'multi',
        meteors: true,
        leavesPool: true,
        lobFrom: { x: caster.x, z: caster.z },
        casterRef: caster,
        casterX: caster.x,
        casterZ: caster.z,
        zones: [
          { x: p1.x, z: p1.z, r: 3.2 },
          { x: p2.x, z: p2.z, r: 3.0 }
        ],
        x: p1.x,
        z: p1.z,
        dmgPct: 0.22,
        age: 0,
        life: 2.25
      };
    }
    raid.nextCastIn = stageGap;
    if (typeof addFloat === 'function') {
      addFloat(caster.x, 2.35, caster.z, caster.n + ' · ' + raid.telegraph.name + '!', '#93e6ff', true, 'skill');
    }
    if (typeof skillNameFloat === 'function') skillNameFloat(raid.telegraph.name);
  }

  function chooseBossSkill(boss) {
    var dist = (typeof pl !== 'undefined' && pl) ? Math.hypot(pl.x - boss.x, pl.z - boss.z) : 2.0;
    var isRangedPlayer = dist > 3.1 || (typeof C === 'function' && C() && C().wt && /bow|staff|book|gun|instrument|whip/i.test(C().wt.join(',')));
    var hpRatio = boss.max > 0 ? boss.hp / boss.max : 1;
    var isThor = raid.dungeonId === 'thor';

    if (isThor) {
      // Ifrit, Volcano Lord: 6 bespoke volcanic raid mechanics (distinct from Astral Citadel!)
      if (!raid.pillarCastDone && (hpRatio <= 0.78 || raid.castSeq >= 2)) {
        raid.pillarCastDone = true;
        raid.castSeq++;
        raid.lastSkillKey = 'obsidian_spires';
        return 'obsidian_spires';
      }
      var thorPool = isRangedPlayer
        ? ['ringwaves', 'lava_wall', 'obsidian_spires', 'triskelion', 'fissure_lanes', 'cone']
        : ['cone', 'ringwaves', 'obsidian_spires', 'triskelion', 'lava_wall', 'fissure_lanes'];
      var thorCand = thorPool.filter(function (k) { return k !== raid.lastSkillKey; });
      if (!thorCand.length) thorCand = thorPool;
      var thorKey = thorCand[(raid.castSeq++) % thorCand.length];
      raid.lastSkillKey = thorKey;
      return thorKey;
    }

    // Astral Citadel: Memory of Thanatos signature celestial/void kit
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
    // Balanced raid boss cadence on BOTH Astral & Thor Volcano (~6.2s rest normal, ~4.8s enraged below 50% HP)
    var gap = hpRatio < 0.5 ? 4.8 : 6.2;
    var px = (typeof pl !== 'undefined' && pl) ? pl.x : 0;
    var pz = (typeof pl !== 'undefined' && pl) ? pl.z : 2;
    var dist = Math.hypot(px - boss.x, pz - boss.z);
    boss.atkAnim = 1;

    if (key === 'obsidian_spires') {
      var bSp = fieldBounds();
      boss.x = Math.max(-bSp.bx + 4.5, Math.min(bSp.bx - 4.5, boss.x));
      boss.z = Math.max(bSp.z0 + 5.0, Math.min(bSp.z1 - 4.5, boss.z));
      boss.fixed = true;
      boss._raidPillarRoot = true;
      var spires = spawnSanctuaryPillars(boss.x, boss.z, 2);
      raid.telegraph = {
        name: 'Supernova Cataclysm',
        hint: 'SUPERNOVA CATACLYSM — Magma vortex pulls you in! HIDE BEHIND AN OBSIDIAN SPIRE!',
        shape: 'pillars',
        volcanic: true,
        volcanicSpires: true,
        pullSpeed: 1.28,
        pillars: spires,
        x: boss.x,
        z: boss.z,
        dmgPct: 0.68,
        bypassShield: true,
        mustHideBehindPillar: true,
        fx: 'ifr_eruption',
        age: 0,
        life: 4.4
      };
      gap = hpRatio < 0.5 ? 5.8 : 7.2;
      pushSystemChat('⚠ ' + boss.n + ' unleashes Supernova Cataclysm! Resist the pull & hide behind an Obsidian Spire!');
    } else if (key === 'cone') {
      boss.fixed = true;
      boss._raidPillarRoot = true;
      var aimAng = dist > 0.25 ? Math.atan2(pz - boss.z, px - boss.x) : (Math.PI * 0.5);
      raid.telegraph = {
        name: 'Molten Breath',
        hint: 'MOLTEN BREATH — 110° frontal magma cone! Dash behind ' + boss.n + '\'s flank!',
        shape: 'cone',
        volcanic: true,
        x: boss.x,
        z: boss.z,
        ang: aimAng,
        halfArc: CONE_HALF_ARC,
        r: 15.2,
        dmgPct: 0.34,
        fx: 'ifr_blaze',
        age: 0,
        life: 2.15
      };
    } else if (key === 'ringwaves') {
      raid.telegraph = {
        name: 'Tectonic Ring Surge',
        hint: 'TECTONIC RING SURGE — Core & outer rim erupt! Stand in the GREEN MID-RING (4–8m)!',
        shape: 'ringwaves',
        volcanic: true,
        x: boss.x,
        z: boss.z,
        innerSafeR: 4.3,
        outerSafeR: 8.3,
        r: 18.0,
        dmgPct: 0.32,
        fx: 'ifr_eruption',
        age: 0,
        life: 2.35
      };
    } else if (key === 'triskelion') {
      var spinSign = (raid.castSeq % 2 === 0) ? 1 : -1;
      var startSpokeAng = Math.atan2(pz - boss.z, px - boss.x) - spinSign * 0.52;
      raid.telegraph = {
        name: 'Hellfire Pinwheel',
        hint: 'HELLFIRE PINWHEEL — Rotating 3-spoke lava wheel! Rotate with the safe slice!',
        shape: 'triskelion',
        volcanic: true,
        x: boss.x,
        z: boss.z,
        ang: startSpokeAng,
        rotSpeed: 0.68 * spinSign,
        width: 2.55,
        len: 15.6,
        dmgPct: 0.32,
        fx: 'ifr_blaze',
        age: 0,
        life: 2.45
      };
    } else if (key === 'lava_wall') {
      var bWall = fieldBounds();
      var wallZ = Math.max(bWall.z0 + 3.8, Math.min(bWall.z1 - 3.8, pz));
      var breachSlots = [-5.4, 0, 5.4];
      var breachX = breachSlots[raid.castSeq % breachSlots.length];
      if (Math.abs(px - breachX) < 1.8) {
        breachX = breachSlots[(raid.castSeq + 1) % breachSlots.length];
      }
      raid.telegraph = {
        name: 'Pyroclastic Tsunami',
        hint: 'PYROCLASTIC TSUNAMI — Align with the glowing green Safe Breach!',
        shape: 'lava_wall',
        volcanic: true,
        x: breachX,
        z: wallZ,
        gapX: breachX,
        gapHalfW: 2.6,
        depth: 7.4,
        dmgPct: 0.34,
        fx: 'dl_skyfall',
        age: 0,
        life: 2.35
      };
    } else if (key === 'fissure_lanes') {
      var laneAng = (raid.castSeq % 2 === 0) ? 0 : (Math.PI / 2);
      var lnx = Math.cos(laneAng), lnz = Math.sin(laneAng);
      var centerPt = clampToBridge(px, pz);
      var poolSpotA = clampToBridge(centerPt.x + lnx * 5.6, centerPt.z + lnz * 5.6);
      raid.telegraph = {
        name: 'Caldera Fault Lines',
        hint: 'CALDERA FAULT LINES — Sidestep onto a safe basalt ridge between the 3 magma faults!',
        shape: 'fissure_lanes',
        volcanic: true,
        leavesPool: true,
        poolSpot: poolSpotA,
        x: centerPt.x,
        z: centerPt.z,
        beams: [
          { x: centerPt.x - lnx * 5.6, z: centerPt.z - lnz * 5.6, ang: laneAng, width: 2.65, len: 26 },
          { x: centerPt.x, z: centerPt.z, ang: laneAng, width: 2.65, len: 26 },
          { x: centerPt.x + lnx * 5.6, z: centerPt.z + lnz * 5.6, ang: laneAng, width: 2.65, len: 26 }
        ],
        dmgPct: 0.30,
        fx: 'ed_quake',
        age: 0,
        life: 2.20
      };
    } else if (key === 'pillars') {
      // Anchor boss at the epicenter while channeling the whole-floor blast so pillar shadows stay rock-solid!
      var b = fieldBounds();
      boss.x = Math.max(-b.bx + 4.5, Math.min(b.bx - 4.5, boss.x));
      boss.z = Math.max(b.z0 + 5.0, Math.min(b.z1 - 4.5, boss.z));
      boss.fixed = true;
      boss._raidPillarRoot = true;
      var pillars = spawnSanctuaryPillars(boss.x, boss.z, 3);
      var wipeName = 'Oblivion Extinction';
      raid.telegraph = {
        name: wipeName,
        hint: wipeName.toUpperCase() + ' — HIDE BEHIND A PILLAR (green shadow away from Boss)!',
        shape: 'pillars',
        pillars: pillars,
        x: boss.x,
        z: boss.z,
        dmgPct: 0.68,
        bypassShield: true,
        mustHideBehindPillar: true,
        fx: 'abyss_requiem',
        age: 0,
        life: 4.2
      };
      gap = hpRatio < 0.5 ? 5.8 : 7.2;
      pushSystemChat('⚠ ' + boss.n + ' charges ' + wipeName + '! Hide in a Pillar shadow!');
    } else if (key === 'donut') {
      raid.telegraph = {
        name: 'Eye of Abyss',
        hint: 'EYE OF ABYSS — Run INSIDE the safe blue ring near ' + boss.n + '!',
        shape: 'donut',
        donut: true,
        x: boss.x,
        z: boss.z,
        innerR: 3.7,
        outerR: 16.0,
        dmgPct: 0.32,
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
        name: 'Horizon Volley',
        hint: 'HORIZON VOLLEY — Hunts ranged distance & leaves burning pool!',
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
        dmgPct: 0.28,
        fx: 'lod_harvest',
        age: 0,
        life: 2.15
      };
    } else if (key === 'cross') {
      var baseAng = (raid.castSeq % 2 === 0) ? 0 : (Math.PI / 4);
      raid.telegraph = {
        name: 'Abyssal Cross',
        hint: 'ABYSSAL CROSS — Step into one of the 4 safe quadrants!',
        shape: 'cross',
        x: boss.x,
        z: boss.z,
        ang: baseAng,
        width: 2.8,
        len: 26,
        dmgPct: 0.32,
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
        name: 'Starfall Cataclysm',
        hint: 'STARFALL CATACLYSM — Weave between the 5 falling meteors!',
        shape: 'multi',
        meteors: true,
        zones: zones,
        x: boss.x,
        z: boss.z,
        dmgPct: 0.30,
        fx: 'lod_verdict',
        age: 0,
        life: 2.35
      };
    } else {
      raid.telegraph = {
        name: 'Crimson Judgment',
        hint: 'CRIMSON JUDGMENT — Heavy point-blank slam! Move OUT or DODGE!',
        shape: 'circle',
        x: boss.x,
        z: boss.z,
        r: 5.5,
        dmgPct: 0.34,
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
    if (S.hp <= 0) {
      handlePlayerDown();
    }
  }

  function tickBossCleave(boss, dt) {
    if (!boss || raid.dead || typeof pl === 'undefined' || !pl) return;
    if (raid.telegraph && raid.telegraph.shape === 'pillars') return;
    raid.bossCleaveIn -= dt;
    if (raid.bossCleaveIn > 0) return;
    raid.bossCleaveIn = BOSS_CLEAVE_INTERVAL_S;
    var dist = Math.hypot(pl.x - boss.x, pl.z - boss.z);
    var pScale = partyAtkScale(activePartyCount());
    var basePct = Math.min(0.16, BOSS_CLEAVE_PCT * pScale);
    var pct = dist <= 4.2 ? basePct : (basePct * 0.72);
    var isThor = raid.dungeonId === 'thor';
    var label = dist <= 4.2 ? (isThor ? 'MOLTEN CLEAVE' : 'BOSS CLEAVE') : (isThor ? 'CALDERA HEATWAVE' : 'ASTRAL PULSE');
    applyRaidHazardDamage(pct, label, { bypassShield: false });
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
          applyRaidHazardDamage(0.05, (vp.volcanic || raid.dungeonId === 'thor') ? 'MAGMA BURN' : 'VOID BURN');
        }
      }
    }
  }

  function pushImpactBurst(tg) {
    if (!tg) return;
    var volc = Boolean(tg.volcanic || raid.dungeonId === 'thor');
    var pts = [];
    if (tg.shape === 'multi' && Array.isArray(tg.zones) && tg.zones.length) {
      for (var i = 0; i < Math.min(2, tg.zones.length); i++) {
        pts.push({ x: tg.zones[i].x, z: tg.zones[i].z, r: tg.zones[i].r || 3.2 });
      }
    } else if (tg.shape === 'cone') {
      var ca = tg.ang || 0, cr = (tg.r || 13.5) * 0.55;
      pts.push({ x: tg.x + Math.cos(ca) * cr, z: tg.z + Math.sin(ca) * cr, r: 4.4 });
    } else if (tg.shape === 'lava_wall') {
      pts.push({ x: -7.5, z: tg.z, r: 4.0 });
      pts.push({ x: 7.5, z: tg.z, r: 4.0 });
    } else if (tg.shape === 'fissure_lanes' && Array.isArray(tg.beams) && tg.beams.length) {
      pts.push({ x: tg.beams[0].x, z: tg.beams[0].z, r: 3.8 });
      if (tg.beams.length > 1) pts.push({ x: tg.beams[tg.beams.length - 1].x, z: tg.beams[tg.beams.length - 1].z, r: 3.8 });
    } else {
      pts.push({ x: tg.x || 0, z: tg.z || 0, r: tg.r ? Math.min(7.5, tg.r) : 5.2 });
    }
    for (var k = 0; k < pts.length; k++) {
      raid.impacts.push({ x: pts[k].x, z: pts[k].z, r: pts[k].r, age: 0, life: 0.58, volcanic: volc });
    }
    while (raid.impacts.length > 4) raid.impacts.shift();
  }

  function tickImpacts(dt) {
    if (!raid.impacts.length) return;
    for (var i = raid.impacts.length - 1; i >= 0; i--) {
      raid.impacts[i].age += dt;
      if (raid.impacts[i].age >= raid.impacts[i].life) {
        raid.impacts.splice(i, 1);
      }
    }
  }

  function tickHazards(dt) {
    tickVoidPools(dt);
    tickImpacts(dt);

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
    if (!st.boss && tg.casterRef) {
      var casterAlive = tg.casterRef.hp > 0 && typeof mobs !== 'undefined' && Array.isArray(mobs) && mobs.indexOf(tg.casterRef) !== -1;
      if (!casterAlive) {
        releaseBossAnchor();
        raid.telegraph = null;
        if (typeof addFloat === 'function') {
          addFloat(tg.casterX || tg.x, 2.2, tg.casterZ || tg.z, 'CAST INTERRUPTED!', '#7ef7c4', true, 'evade');
        }
        updateMeshes();
        return;
      }
      tg.casterRef.run = false;
      if (typeof pl !== 'undefined' && pl) {
        tg.casterRef.ry = Math.atan2(pl.z - tg.casterRef.z, tg.casterRef.x - pl.x);
      }
      if (!tg._releaseAnimPlayed && tg.age >= tg.life * 0.78) {
        tg._releaseAnimPlayed = true;
        tg.casterRef.atkAnim = 1;
      }
    }
    tg.age += dt;
    if (st.boss && liveBoss && (tg.shape === 'circle' || tg.shape === 'donut' || tg.shape === 'cross' || tg.shape === 'ringwaves' || tg.shape === 'triskelion')) {
      tg.x = liveBoss.x;
      tg.z = liveBoss.z;
    }

    // Volcanic Supernova Vortex: gently pulls players toward Ifrit unless moving/holding behind an Obsidian Spire!
    if (tg.pullSpeed > 0 && !raid.dead && typeof pl !== 'undefined' && pl) {
      var pdx = tg.x - pl.x, pdz = tg.z - pl.z;
      var pdist = Math.hypot(pdx, pdz);
      if (pdist > 1.6) {
        var pullStep = Math.min(pdist - 1.6, tg.pullSpeed * dt);
        var pulled = clampToBridge(pl.x + (pdx / pdist) * pullStep, pl.z + (pdz / pdist) * pullStep);
        pl.x = pulled.x;
        pl.z = pulled.z;
      }
    }

    if (tg.age >= tg.life) {
      raid.telegraph = null;
      releaseBossAnchor();
      pushImpactBurst(tg);

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
        var poolPt = tg.poolSpot || ((Array.isArray(tg.zones) && tg.zones[0]) ? tg.zones[0] : { x: tg.x, z: tg.z });
        raid.voidPools.push({
          x: poolPt.x,
          z: poolPt.z,
          r: 3.4,
          left: 4.5,
          tick: 0.35,
          volcanic: Boolean(tg.volcanic || raid.dungeonId === 'thor')
        });
        if (raid.voidPools.length > 3) raid.voidPools.shift();
      }

      if (!raid.dead && typeof pl !== 'undefined' && pl) {
        if (hitByTelegraph(tg, pl.x, pl.z)) {
          applyRaidHazardDamage(tg.dmgPct || 0.32, tg.name.toUpperCase() + '!', {
            bypassShield: Boolean(tg.bypassShield),
            ignoreIframes: Boolean(tg.mustHideBehindPillar)
          });
        } else if (tg.shape === 'pillars') {
          if (typeof addFloat === 'function') {
            addFloat(pl.x, 2.7, pl.z, tg.volcanicSpires ? 'SHIELDED BY SPIRE!' : 'SHIELDED BY PILLAR!', '#6effc8', true, 'evade');
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
    var prevRoster = raid.lobbyRoster;
    var prevCount = prevRoster && Array.isArray(prevRoster.members) ? prevRoster.members.length : 0;
    var prevPartyId = prevRoster ? prevRoster.partyId : null;
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
    var lobbyEl = $('raidLobby');
    var shouldAutoOpen = !raid.on && lobbyEl && lobbyEl.hidden && msg.members.length >= 2 && (prevPartyId !== msg.partyId || prevCount < msg.members.length || msg.summon);
    if ((msg.summon && !raid.on && msg.leader !== selfId) || shouldAutoOpen) {
      if (lobbyEl && lobbyEl.hidden) {
        raid.lobbyMode = 'party';
        lobbyEl.hidden = false;
        if (socialParty()) announceReadyState(isPartyLeader());
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
      if (!m.self && m.dead && !m.disconnected) return m;
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

  function applyReviveEvent(ev) {
    if (!raid.on || raid.mode !== 'party' || !ev) return false;
    var selfId = myId();
    var fromId = ev.fromId;
    var targetId = ev.target;
    var revId = typeof ev.reviveId === 'string' && ev.reviveId ? ev.reviveId : '';
    var targetSlot = null;
    for (var ti = 0; ti < raid.party.length; ti++) {
      var cand = raid.party[ti];
      if (cand.id === targetId || (cand.self && targetId === selfId)) {
        targetSlot = cand;
        break;
      }
    }
    if (!targetSlot || targetSlot.disconnected) return false;

    if (!raid.appliedRevives) raid.appliedRevives = {};
    if (!raid.pendingLocalRevives) raid.pendingLocalRevives = {};

    if (revId && raid.appliedRevives[revId]) {
      if (Number.isInteger(ev.revivesLeft)) {
        raid.revivesLeft = Math.max(0, Math.min(MAX_PARTY_REVIVES, ev.revivesLeft));
        updateHud();
      }
      return false;
    }
    if (!ev.localOrigin && fromId === selfId && raid.pendingLocalRevives[targetId] != null &&
        (raid.elapsed - raid.pendingLocalRevives[targetId]) <= 15) {
      delete raid.pendingLocalRevives[targetId];
      if (revId) raid.appliedRevives[revId] = true;
      if (Number.isInteger(ev.revivesLeft)) {
        raid.revivesLeft = Math.max(0, Math.min(MAX_PARTY_REVIVES, ev.revivesLeft));
        updateHud();
      }
      return false;
    }

    if (raid.revivesLeft <= 0 && !Number.isInteger(ev.revivesLeft)) return false;
    if (revId) raid.appliedRevives[revId] = true;
    if (ev.localOrigin) raid.pendingLocalRevives[targetId] = raid.elapsed;

    if (Number.isInteger(ev.revivesLeft)) {
      raid.revivesLeft = Math.max(0, Math.min(MAX_PARTY_REVIVES, ev.revivesLeft));
    } else {
      raid.revivesLeft = Math.max(0, raid.revivesLeft - 1);
    }

    for (var i = 0; i < raid.party.length; i++) {
      var p = raid.party[i];
      if (p.id === fromId || (p.self && fromId === selfId)) {
        if (p.self) {
          raid.revivesDone = (raid.revivesDone || 0) + 1;
          raid.supportScore += 250000;
        } else {
          p.revives = (p.revives || 0) + 1;
          p.support = (p.support || 0) + 250000;
        }
      }
    }

    targetSlot.dead = false;
    targetSlot.hp = Math.max(1, Math.floor((targetSlot.maxHp || 1000) * 0.3));
    if (targetSlot.self && raid.dead) {
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

    if (ev.localOrigin) {
      pushSystemChat(myName() + ' revived ' + targetSlot.name + '!');
      if (typeof log === 'function') log('Revived ' + targetSlot.name + '! (' + raid.revivesLeft + ' revives left)', 'r4', 'misc');
    } else if (ev.fromName) {
      pushSystemChat(ev.fromName + ' revived a fallen teammate!');
    }
    refreshSelfStats();
    updateHud();
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
    if (!target || !target.dead || target.disconnected) {
      raid.reviving = null;
      return;
    }
    raid.reviving.left -= dt;
    if (raid.reviving.left <= 0) {
      var tid = raid.reviving.targetId;
      raid.reviving = null;
      raid.reviveNonce = (raid.reviveNonce || 0) + 1;
      var revId = String(raid.raidId || 'raid') + ':' + String(myId()) + ':' + String(raid.reviveNonce);
      if (!applyReviveEvent({
        reviveId: revId,
        fromId: myId(),
        fromName: myName(),
        target: tid,
        localOrigin: true
      })) return;
      if (root.PGSocial && typeof root.PGSocial.send === 'function') {
        root.PGSocial.send({ type: 'raid_revive', raidId: raid.raidId, reviveId: revId, target: tid });
      }
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
        // v471: leaving from a later raid stage has the same shape as entering from one - re-seat the
        // home stage instead of leaving the scenery where the raid left it.
        if (typeof snapAstralStage === 'function') {
          try { snapAstralStage(raid.home.astralOrigin || S.lvl || 1); } catch (e) {}
        }
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
    if (isGm()) {
      raid.entryConsumed = false;
      return;
    }
    var st = raidSaveState();
    st.used = (Number(st.used) || 0) + 1;
    raid.entryConsumed = true;
  }

  function refundDailyEntry() {
    if (!raid.entryConsumed || isGm()) return false;
    var st = raidSaveState();
    st.used = Math.max(0, (Number(st.used) || 0) - 1);
    raid.entryConsumed = false;
    return true;
  }

  function beginRun(mode, opts) {
    opts = opts || {};
    if (raid.on) return false;
    if (typeof S === 'undefined' || !S) return false;

    var chosenId = opts.dungeonId === 'thor' ? 'thor' : 'astral';
    var dng = dungeonDef(chosenId);

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
    raid.reviveNonce = 0;
    raid.appliedRevives = {};
    raid.pendingLocalRevives = {};
    raid.reviving = null;
    raid.telegraph = null;
    raid.voidPools = [];
    raid.impacts = [];
    raid.nextCastIn = 0.75;
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
    raid.holdGround = false;
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
          disconnected: false,
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

  function awardRewards(cleared, skipFailRewards) {
    var dng = activeDungeon();
    if (typeof S === 'undefined' || !S || (!cleared && skipFailRewards)) {
      return { shards: 0, sigils: 0, matName: dng.matName, zeny: 0, echo: 0 };
    }
    var r = cleared ? (raid.mode === 'party' ? REWARDS.party : REWARDS.solo) : REWARDS.fail;
    if (!Array.isArray(S.ascensionMat)) S.ascensionMat = [0, 0, 0];
    var mIdx = dng.matIdx === 1 ? 1 : 0;
    S.ascensionMat[mIdx] = (Number(S.ascensionMat[mIdx]) || 0) + r.shards;
    if (r.sigils > 0) S.ascensionMat[2] = (Number(S.ascensionMat[2]) || 0) + r.sigils;
    if (r.zeny > 0) S.zeny = (Number(S.zeny) || 0) + r.zeny;
    if (r.echo > 0) S.shards = (Number(S.shards) || 0) + r.echo;

    var st = raidSaveState();
    var bossCardDrop = null;
    var titleDrop = null;
    var milestoneTitles = [];
    if (cleared) {
      st.clears = (Number(st.clears) || 0) + 1;
      var secs = Math.max(1, Math.round(raid.elapsed));
      if (raid.mode === 'party') {
        if (!st.bestParty || secs < st.bestParty) st.bestParty = secs;
      } else {
        if (!st.bestSolo || secs < st.bestSolo) st.bestSolo = secs;
      }

      // 1) 10% Raid Boss Accessory Card Drop — each dungeon only drops its own boss card:
      //    Astral Citadel -> Sovereign Thanatos Card (MATK +15%), Thor Volcano -> Primordial Ifrit Card (ATK +15%)
      if (typeof RAID_BOSS_CARDS !== 'undefined' && Array.isArray(RAID_BOSS_CARDS) && RAID_BOSS_CARDS.length > 0 && Math.random() < 0.10) {
        var cardDef = null;
        for (var ci = 0; ci < RAID_BOSS_CARDS.length; ci++) {
          if (RAID_BOSS_CARDS[ci] && RAID_BOSS_CARDS[ci].cardKey === dng.bossCardKey) { cardDef = RAID_BOSS_CARDS[ci]; break; }
        }
        if (!cardDef) cardDef = RAID_BOSS_CARDS[0];
        if (cardDef && typeof newCard === 'function' && typeof addCard === 'function') {
          var rolledCard = newCard(cardDef);
          if (addCard(rolledCard, { label: cardDef.n })) {
            bossCardDrop = cardDef.n;
            if (typeof log === 'function') {
              log('🃏 RAID BOSS CARD DROP! Obtained ' + cardDef.n + ' (Accessory · ' + (cardDef.stat === 'matk' ? 'Magic Power +15%' : 'ATK % +15') + ')!', 'r4', 'card');
            }
            if (typeof addFloat === 'function' && typeof pl !== 'undefined' && pl) {
              addFloat(pl.x, 3.4, pl.z, '🃏 ' + cardDef.n + '!', '#ffd86b', true);
            }
          }
        }
      }

      // 1b) 10% Raidbound pet drop (v469) - the same band as the card above, rolled once per clear.
      // The pet data, the fold and the price tables all live in index.html, so the raid only asks for
      // the roll for ITS dungeon (Astral Citadel / Thor Volcano) and never duplicates pet data here.
      // Silently returns null until the five native atlases ship: client-side only, no DO traffic.
      var raidboundPet = null;
      if (typeof raidboundDrop === 'function') {
        try { raidboundPet = raidboundDrop(dng && dng.id === 'thor' ? 'thor' : 'astral'); } catch (e) { raidboundPet = null; }
      }

      // 2) 10% Exclusive Raid Title Drop (Astral Stormbringer [Purple] / Volcanic Overlord [Red])
      if (Math.random() < 0.10) {
        if (!Array.isArray(S.titleAwards)) S.titleAwards = [];
        var dropPool = ['astral-stormbringer', 'volcanic-overlord'];
        var unownedDrops = dropPool.filter(function (tid) { return S.titleAwards.indexOf(tid) === -1; });
        if (unownedDrops.length > 0) {
          var preferred = dng.id === 'thor' ? 'volcanic-overlord' : 'astral-stormbringer';
          var chosenTid = unownedDrops.indexOf(preferred) !== -1 && Math.random() < 0.65
            ? preferred
            : unownedDrops[Math.floor(Math.random() * unownedDrops.length)];
          S.titleAwards.push(chosenTid);
          var tMeta = (typeof PGTitles !== 'undefined' && PGTitles.find) ? PGTitles.find(chosenTid) : null;
          titleDrop = tMeta ? tMeta.name : chosenTid;
          if (typeof log === 'function') {
            log('⚡ EXCLUSIVE RAID TITLE DROP! Unlocked "' + titleDrop + '"' + (tMeta && tMeta.electricName ? ' (' + tMeta.electricName + ' FX)' : '') + '!', 'r4', 'misc');
          }
          if (typeof addFloat === 'function' && typeof pl !== 'undefined' && pl) {
            addFloat(pl.x, 3.8, pl.z, '⚡ TITLE: ' + titleDrop + '!', (tMeta && tMeta.electricColor) || '#c259ff', true);
          }
        }
      }

      // 3) Sync Raid Clear Milestone Titles (10 -> Raid Vanguard, 20 -> Citadel Breaker, 30 -> Sovereign Conqueror)
      if (typeof PGTitles !== 'undefined' && typeof PGTitles.sync === 'function') {
        var newlyAdded = PGTitles.sync(S, typeof CLASSES !== 'undefined' ? CLASSES : {});
        for (var ti = 0; ti < newlyAdded.length; ti++) {
          var mTitle = PGTitles.find ? PGTitles.find(newlyAdded[ti]) : null;
          if (mTitle && mTitle.category === 'raid') {
            milestoneTitles.push(mTitle.name);
            if (typeof log === 'function') {
              log('⚡ RAID MILESTONE TITLE UNLOCKED! "' + mTitle.name + '" (' + (mTitle.electricName || 'Static Lightning') + ' FX)!', 'r4', 'misc');
            }
          }
        }
      }
    }
    return {
      shards: r.shards,
      sigils: r.sigils || 0,
      matName: dng.matName,
      zeny: r.zeny,
      echo: r.echo,
      bossCardDrop: bossCardDrop,
      titleDrop: titleDrop,
      raidboundPet: raidboundPet,
      milestoneTitles: milestoneTitles
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

  function finish(cleared, reason, fromNetwork, finishOpts) {
    if (!raid.on) return;
    finishOpts = finishOpts || {};
    var dng = activeDungeon();
    refreshSelfStats();
    var elapsed = Math.max(1, Math.round(raid.elapsed));
    var me = selfEntry();
    var myFinalDps = me ? me.dps : currentDps();
    var partySnap = raid.party.map(function (p) { return Object.assign({}, p); });
    var mode = raid.mode;
    var rid = raid.raidId;
    var refundedEntry = Boolean(finishOpts.refundedEntry);

    raid.on = false;
    raid.lastFinishedRaidId = rid;
    raid.dead = false;
    raid.entryConsumed = false;
    raid.reviving = null;
    raid.telegraph = null;
    raid.voidPools = [];
    raid.transition = null;
    raid.moveTarget = null;
    raid.myReady = false;
    raid.keys = { w: false, a: false, s: false, d: false };

    if (mode === 'party' && !finishOpts.skipNetworkEnd && root.PGSocial && typeof root.PGSocial.send === 'function') {
      root.PGSocial.send({
        type: 'raid_end',
        raidId: rid,
        cleared: Boolean(cleared),
        reason: finishOpts.networkReason || reason || (cleared ? 'boss_down' : 'failed'),
        secs: elapsed,
        dps: myFinalDps,
        dmgTaken: me ? me.dmgTaken : raid.dmgTaken,
        support: me ? me.support : raid.supportScore,
        revives: me ? me.revives : raid.revivesDone
      });
    }

    var paid = awardRewards(Boolean(cleared), Boolean(finishOpts.skipFailRewards));
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
      refundedEntry: refundedEntry,
      reason: reason || (cleared ? (dng.bossName + ' defeated!') : 'Raid failed'),
      mode: mode,
      secs: elapsed,
      dps: myFinalDps,
      party: partySnap,
      commendations: comms,
      rewards: paid
    };
    if (!finishOpts.silentResult) {
      showResult(raid.result);
    }
    if (typeof ui === 'function') ui();
    if (typeof save === 'function') save();
  }

  function leave(opts) {
    if (!raid.on) return;
    var silent = (opts === true) || Boolean(opts && opts.silent);
    var graceLock = Boolean(opts && typeof opts === 'object' && opts.graceLock);
    var aliveNow = !raid.dead && (typeof S === 'undefined' || !S || (Number(S.hp) || 0) > 0);
    var inSoloGrace = raid.mode === 'solo' && aliveNow && (raid.elapsed <= SOLO_GRACE_LEAVE_S || graceLock);
    if (inSoloGrace) {
      var refunded = refundDailyEntry();
      if (typeof log === 'function') {
        log('↩ Exited Solo Raid within 10s — daily Raid entry kept!', 'r2', 'misc');
      }
      finish(false, 'Left within 10s — daily Raid entry kept!', false, {
        skipFailRewards: true,
        refundedEntry: refunded,
        silentResult: silent
      });
      return;
    }
    finish(false, 'Left the raid.', false, {
      networkReason: 'left',
      silentResult: silent
    });
  }

  function checkPartyWipe() {
    if (!raid.on || raid.mode !== 'party') return;
    var anyAlive = false;
    for (var i = 0; i < raid.party.length; i++) {
      if (!raid.party[i].disconnected && !raid.party[i].dead) { anyAlive = true; break; }
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
    raid.impacts = [];
    raid.moveTarget = null;
    releaseBossAnchor();
    updateMeshes();

    var startedWalk = false;
    if ((dng.mapId === 10 || dng.mapId === 11) && typeof startAstralJourney === 'function') {
      startedWalk = startAstralJourney(fromAstral, toAstral);
    }
    raid.transition = {
      nextIdx: nextIdx,
      walked: startedWalk,
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
    if (typeof respawn !== 'undefined') respawn = 999;
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
      var curMapId = activeDungeon().mapId;
      var journeyActive = (curMapId === 10 || curMapId === 11) && typeof astralJourney !== 'undefined' && Boolean(astralJourney);
      if (!journeyActive || raid.transition.fallbackLeft <= 0) {
        var nxt = raid.transition.nextIdx;
        var arrivedOnFoot = Boolean(raid.transition.walked && !journeyActive);
        raid.transition = null;
        spawnRaidStage(nxt, arrivedOnFoot);
      }
      return;
    }

    if (typeof mobs !== 'undefined' && Array.isArray(mobs) && mobs.length > 0) {
      var curT = (typeof t === 'number' && Number.isFinite(t)) ? t : 0;
      for (var mi = 0; mi < mobs.length; mi++) {
        if (mobs[mi] && mobs[mi].hp > 0) {
          mobs[mi].hx = null;
          mobs[mi].hz = null;
          mobs[mi].provokeUntil = curT + 86400;
        }
      }
      if (typeof nearestPack === 'function' && typeof activePack !== 'undefined') {
        var hasPack = false;
        for (var pk = 0; pk < mobs.length; pk++) {
          if (mobs[pk] && mobs[pk].hp > 0 && mobs[pk].pack === activePack) { hasPack = true; break; }
        }
        if (!hasPack) activePack = nearestPack();
      }
    }

    tickHazards(step);
    if (!raid.on || raid.dead) return;
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
    if (!msg || raid.on) return;
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
    if (raid.raidId && msg.raidId !== raid.raidId) return;
    var sender = msg.fromId;
    if (sender == null || sender === myId()) return;
    var slot = null;
    for (var i = 0; i < raid.party.length; i++) {
      if (raid.party[i].id === sender) { slot = raid.party[i]; break; }
    }
    if (!slot || slot.disconnected) return;
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
    if (raid.raidId && msg.raidId !== raid.raidId) return;
    var applied = applyReviveEvent({
      reviveId: typeof msg.reviveId === 'string' && msg.reviveId ? msg.reviveId : '',
      fromId: msg.fromId,
      fromName: msg.fromName,
      target: msg.target,
      revivesLeft: msg.revivesLeft,
      localOrigin: false
    });
    if (!applied) return;
    if (msg.fromName && msg.fromId !== myId()) {
      pushSystemChat(msg.fromName + ' revived a fallen teammate!');
    }
    updateHud();
  }

  function onEnded(msg) {
    if (!msg) return;
    if (!raid.on) {
      if (raid.result && raid.result.mode === 'party' && msg.fromId != null &&
          raid.lastFinishedRaidId && msg.raidId === raid.lastFinishedRaidId) {
        var updated = false;
        for (var u = 0; u < raid.result.party.length; u++) {
          var rp = raid.result.party[u];
          if (rp.id === msg.fromId && !rp.self && !rp.disconnected) {
            if (msg.dps != null) rp.dps = Math.max(0, Number(msg.dps) || 0);
            if (msg.dmgTaken != null) rp.dmgTaken = Math.max(0, Number(msg.dmgTaken) || 0);
            if (msg.support != null) rp.support = Math.max(0, Number(msg.support) || 0);
            if (msg.revives != null) rp.revives = Math.max(0, Number(msg.revives) || 0);
            updated = true;
          }
        }
        if (updated) {
          raid.result.commendations = computeCommendations(raid.result.party);
          var resEl = $('raidResult');
          if (resEl && !resEl.hidden) showResult(raid.result);
        }
      }
      return;
    }
    if (raid.mode !== 'party') return;
    if (msg.statsOnly) return;
    if (raid.raidId && msg.raidId !== raid.raidId) return;
    if (msg.fromId != null && msg.fromId !== myId()) {
      var senderSlot = null;
      for (var sIdx = 0; sIdx < raid.party.length; sIdx++) {
        if (raid.party[sIdx].id === msg.fromId) { senderSlot = raid.party[sIdx]; break; }
      }
      if (!senderSlot || senderSlot.disconnected) return;
    }
    var rStr = String(msg.reason || '');
    var isPeerExit = !msg.cleared && msg.fromId != null && msg.fromId !== myId() &&
      (rStr === 'disconnect' || rStr === 'left' || /^left/i.test(rStr));

    if (isPeerExit) {
      var prevScaleCnt = raid.activePartyScaleCount || activePartyCount();
      var peerName = msg.name || 'Teammate';
      for (var k = 0; k < raid.party.length; k++) {
        if (raid.party[k].id === msg.fromId && !raid.party[k].self) {
          peerName = raid.party[k].name || peerName;
          raid.party[k].dps = 0;
          if (msg.dmgTaken != null) raid.party[k].dmgTaken = Math.max(0, Number(msg.dmgTaken) || 0);
          if (msg.support != null) raid.party[k].support = Math.max(0, Number(msg.support) || 0);
          if (msg.revives != null) raid.party[k].revives = Math.max(0, Number(msg.revives) || 0);
          raid.party[k].hp = 0;
          raid.party[k].dead = true;
          raid.party[k].disconnected = true;
        }
      }
      var newScaleCnt = activePartyCount();
      rescaleActiveRaidMobs(prevScaleCnt, newScaleCnt);
      raid.activePartyScaleCount = newScaleCnt;
      var verb = rStr === 'disconnect' ? 'disconnected' : 'left the raid';
      pushSystemChat('⚠ ' + peerName + ' ' + verb + ' — remaining party continues! Monster HP & ATK rescaled for ' + newScaleCnt + ' player(s).');
      updateHud();
      checkPartyWipe();
      return;
    }

    if (msg.fromId != null) {
      for (var i = 0; i < raid.party.length; i++) {
        if (raid.party[i].id === msg.fromId && !raid.party[i].self && !raid.party[i].disconnected) {
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

  // v466: feedback line for the Ready Room's direct party invite (no re-render, so the
  // message stays visible instead of being replaced by the fresh lobby markup).
  function setInviteNote(text, isError) {
    var box = $('raidLobbyBody');
    if (!box) return;
    var note = box.querySelector('.raid-party-invite-note');
    if (!note) return;
    note.textContent = text;
    note.classList.toggle('is-error', Boolean(isError));
    note.classList.toggle('is-ok', !isError && Boolean(text));
  }

  // v466: the Ready Room shows the party as character previews instead of the stage
  // list (the Map -> Dungeons panel already lists all four stages), and the empty
  // state invites trainers directly instead of only linking to the Social Hub.
  function selfLobbyInfo() {
    return {
      id: myId(),
      name: myName(),
      cls: (typeof S !== 'undefined' && S && S.cls) || 'Adventurer',
      lv: (typeof S !== 'undefined' && S && S.lv) || 150,
      sex: (typeof S !== 'undefined' && S && S.sex === 'f') ? 'f' : 'm',
      appearance: myAppearance(),
      self: true,
      ready: false,
      leader: false
    };
  }

  function lobbyInviteCandidates() {
    var soc = root.PGSocial && root.PGSocial.app;
    var out = [];
    if (!soc || !soc.room || !soc.connected || !soc.players) return out;
    var me = myId();
    var taken = {};
    var party = socialParty();
    if (party && Array.isArray(party.members)) {
      for (var i = 0; i < party.members.length; i++) taken[party.members[i].id] = true;
    }
    var roster = soc.partyRoster;
    if (Array.isArray(roster)) {
      for (var r = 0; r < roster.length; r++) {
        var entry = roster[r];
        if (!entry || !Array.isArray(entry.members)) continue;
        for (var k = 0; k < entry.members.length; k++) taken[entry.members[k]] = true;
      }
    }
    var list = [];
    if (typeof soc.players.forEach === 'function') soc.players.forEach(function (pl) { list.push(pl); });
    else if (Array.isArray(soc.players)) list = soc.players;
    for (var n = 0; n < list.length; n++) {
      var pl = list[n];
      if (!pl || pl.id == null || pl.id === me || taken[pl.id]) continue;
      if (!Number.isInteger(Number(pl.id)) || Number(pl.id) <= 0) continue;
      if (pl.room != null && soc.room != null && Number(pl.room) !== Number(soc.room)) continue;
      out.push({ id: Number(pl.id), name: pl.name || ('Trainer ' + pl.id) });
    }
    out.sort(function (a, b) { return String(a.name).localeCompare(String(b.name)); });
    return out.slice(0, 24);
  }

  function inviteRowHtml(compact) {
    var soc = root.PGSocial && root.PGSocial.app;
    var inPlaza = Boolean(soc && soc.room && soc.connected && typeof root.PGSocial.send === 'function');
    var candidates = inPlaza ? lobbyInviteCandidates() : [];
    var opts = candidates.length
      ? candidates.map(function (c) { return '<option value="' + c.id + '">' + escHtml(c.name) + '</option>'; }).join('')
      : '<option value="">' + (inPlaza ? 'No free trainers in this plaza' : 'Enter the plaza to invite trainers') + '</option>';
    var actionBtn = inPlaza
      ? '<button type="button" class="raid-link-btn" data-raid-act="invite"' + (candidates.length ? '' : ' disabled') + '>✉ Send Invite</button>'
      : '<button type="button" class="raid-link-btn" data-raid-act="plaza">🚪 Enter Plaza &amp; Invite</button>';
    return '<div class="raid-party-invite' + (compact ? ' compact' : '') + '">' +
        '<label for="raidPartyInvitee">Invite a trainer</label>' +
        '<div class="raid-party-invite-controls">' +
          '<select id="raidPartyInvitee" class="raid-party-invite-select" aria-label="Choose a trainer to invite to your party"' + (candidates.length ? '' : ' disabled') + '>' + opts + '</select>' +
          actionBtn +
        '</div>' +
        (inPlaza
          ? '<small class="raid-party-invite-note">' + (candidates.length
              ? 'Your invite opens a party pop-up for that trainer — they join with one click.'
              : 'Every trainer in this plaza is already in a party. Wait for someone to leave theirs.') + '</small>'
          : '<small class="raid-party-invite-note">Party invites need the Fountain Plaza. Enter Plaza keeps this Ready Room open and fills the trainer list as soon as you arrive.</small>') +
      '</div>';
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
      var members = (p && p.members.length) ? lobbyMembers() : [];
      var hasParty = members.length >= 2;
      var readyCnt = members.filter(function (m) { return m.ready; }).length;
      var allReady = hasParty && allPartyMembersReady();
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
        } else if (!members.length && sIdx === 0) {
          var selfCid = 'raidLobbyPortrait_self';
          var selfInfo = selfLobbyInfo();
          portraitsToPaint.push({ canvasId: selfCid, info: selfInfo });
          slotsHtml +=
            '<div class="raid-ready-card is-self">' +
              '<span class="raid-role-tag">Your character</span>' +
              '<div class="raid-pedestal">' +
                '<canvas id="' + selfCid + '" class="raid-portrait-canvas" width="104" height="112"></canvas>' +
              '</div>' +
              '<div class="raid-ready-name">' + escHtml(selfInfo.name) + ' (You)</div>' +
              '<div class="raid-ready-cls">Lv ' + escHtml(selfInfo.lv) + ' · ' + escHtml(selfInfo.cls) + '</div>' +
              '<span class="raid-ready-pill">⏳ WAITING FOR PARTY</span>' +
            '</div>';
        } else {
          slotsHtml +=
            '<div class="raid-ready-card is-empty">' +
              '<span class="raid-role-tag">Open Slot</span>' +
              '<div class="raid-ready-cls">' + (members.length ? '2–3 Players Supported' : 'Invite a trainer below') + '</div>' +
            '</div>';
        }
      }

      partyHtml =
        '<div class="raid-party-box">' +
          '<div class="raid-party-head">' +
            '<span><b>Party Ready Room — ' + escHtml(dng.name) + '</b> (' + Math.max(1, members.length) + '/3 Adventurers)</span>' +
            (hasParty
              ? '<div class="raid-party-head-actions">' +
                  (isPartyLeader() ? '<button type="button" class="raid-link-btn" data-raid-act="summon">📣 Summon Party</button>' : '') +
                  '<span class="raid-ready-count' + (allReady ? ' all' : '') + '">' + readyCnt + '/' + members.length + ' READY</span>' +
                '</div>'
              : '') +
          '</div>' +
          (!hasParty
            ? '<div class="raid-party-empty"><span>' + (members.length
                ? 'You are alone in this party. Invite another trainer — Raids need 2–3 adventurers.'
                : 'No 2–3 player party yet. Invite a trainer from the Fountain Plaza and they join with one click.') + '</span></div>'
            : '') +
          '<div class="raid-ready-grid">' + slotsHtml + '</div>' +
          (members.length >= 3
            ? ''
            : (hasParty && !isPartyLeader()
                ? '<div class="raid-party-invite"><small class="raid-party-invite-note">Only the Party Leader can invite another trainer.</small></div>'
                : inviteRowHtml(!hasParty))) +
          (hasParty
            ? '<div class="raid-lobby-chat">' +
                '<div class="raid-lobby-chat-log" id="raidLobbyChatFeed"></div>' +
                '<form class="raid-chat-form" id="raidLobbyChatForm">' +
                  '<input id="raidLobbyChatInput" class="raid-chat-input" type="text" maxlength="160" autocomplete="off" placeholder="Chat with your party before launch…">' +
                  '<button type="submit" class="raid-chat-send">Send</button>' +
                '</form>' +
              '</div>'
            : '') +
        '</div>';
    } else {
      var soloCid = 'raidLobbyPortrait_solo';
      var soloInfo = selfLobbyInfo();
      portraitsToPaint.push({ canvasId: soloCid, info: soloInfo });
      partyHtml =
        '<div class="raid-party-box solo-note" style="display:flex;align-items:center;gap:14px;">' +
          '<div class="raid-pedestal" style="flex:none;width:84px;height:92px;">' +
            '<canvas id="' + soloCid + '" class="raid-portrait-canvas" width="84" height="92" style="width:84px;height:92px;"></canvas>' +
          '</div>' +
          '<div><b>Solo Challenger: ' + escHtml(myName()) + '</b><br>' +
          'Challenge ' + escHtml(dng.name) + ' (' + escHtml(dng.bossName) + '). Solo death ends the run immediately (no revive).</div>' +
        '</div>';
    }


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
          '<p>Everyone presses Ready · Party Leader presses Start · 25:00 limit · 3 shared revives</p>' +
        '</div>' +
        '<button type="button" class="raid-close-x" data-raid-act="close" aria-label="Close">×</button>' +
      '</div>' +
      partyHtml +
      '<div class="raid-rewards-bar">' +
        '<div><b>Party Clear</b><span>30 ' + escHtml(dng.matName) + ' · 1 Valkyrie\'s Sigil · 750,000 Zeny · 150 Echo Shards · 10% ' + escHtml(dng.bossCardName || 'Boss Acc Card') + ' · 10% Raid Title <small>(two separate rolls - 1% for both in one clear)</small></span></div>' +
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
        '<div class="raid-move-hint">WASD / Click floor to move · <b>SPACE</b> to DODGE · <b>ENTER</b> to Chat · <b>H</b> Hold Ground</div>' +
        '<div class="raid-actions">' +
          '<button type="button" class="raid-revive-btn" id="raidReviveBtn" data-raid-act="revive" hidden></button>' +
          '<button type="button" class="raid-hold-btn" id="raidHoldBtn" data-raid-act="hold" aria-pressed="false" title="Hold Ground: stop auto-approach so the hero never walks out of cover">⏸ HOLD</button>' +
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
        var baseArmor = typeof boss.raidArmor === 'number' ? boss.raidArmor : 0;
        var penPct = typeof starArmorPenPct === 'function' ? starArmorPenPct() : 0;
        var effArmorPct = Math.round(Math.max(0, baseArmor * 100 - penPct));
        var armorTag = baseArmor > 0 ? (' · 🛡 ' + effArmorPct + '% ARMOR') : '';
        $('raidBossName').textContent = '☠ ' + boss.n;
        $('raidBossPhase').textContent = (bpct <= 50 ? 'PHASE II · ENRAGED' : 'PHASE I · SANCTUM') + armorTag;
        $('raidBossHpText').textContent = fmtNum(boss.hp) + ' / ' + fmtNum(boss.max) + '  (' + bpct.toFixed(1) + '%)';
        $('raidBossFill').style.width = bpct.toFixed(1) + '%';
      } else {
        bossWrap.hidden = true;
        bossWrap.style.display = 'none';
      }
    }

    var holdBtn = $('raidHoldBtn');
    if (holdBtn) {
      var held = Boolean(raid.holdGround);
      if (holdBtn.classList.contains('is-on') !== held) holdBtn.classList.toggle('is-on', held);
      var pressed = held ? 'true' : 'false';
      if (holdBtn.getAttribute('aria-pressed') !== pressed) holdBtn.setAttribute('aria-pressed', pressed);
      var holdLabel = held ? '⏸ HOLDING' : '⏸ HOLD';
      if (holdBtn.textContent !== holdLabel) holdBtn.textContent = holdLabel;
    }

    var castEl = $('raidCastBar');
    if (castEl) {
      if (raid.telegraph) {
        castEl.hidden = false;
        castEl.style.display = '';
        var extraCls = raid.telegraph.shape === 'pillars'
          ? ' pillars'
          : ((raid.telegraph.donut || raid.telegraph.shape === 'ringwaves' || raid.telegraph.shape === 'lava_wall') ? ' donut' : '');
        castEl.className = 'raid-cast-banner' + extraCls;
        var castLeft = Math.max(0, raid.telegraph.life - raid.telegraph.age);
        var cpct = Math.max(0, Math.min(100, (raid.telegraph.age / Math.max(0.1, raid.telegraph.life)) * 100));
        var cfill = $('raidCastFill');
        if (cfill) cfill.style.width = cpct.toFixed(1) + '%';
        var ctxt = $('raidCastText');
        if (ctxt) {
          var coverTag = inPillarShadow() ? ' · ✅ IN COVER' : '';
          ctxt.textContent = '⚠ ' + (raid.telegraph.hint || raid.telegraph.name) + ' (' + castLeft.toFixed(1) + 's)' + coverTag;
        }
      } else {
        castEl.hidden = true;
        castEl.style.display = 'none';
      }
    }

    var aliveCnt = raid.party.filter(function (p) { return !p.disconnected && !p.dead; }).length;
    var connCnt = raid.party.filter(function (p) { return !p.disconnected; }).length || raid.party.length;
    var aliveEl = $('raidPartyAlive');
    if (aliveEl) aliveEl.textContent = aliveCnt + '/' + connCnt + ' ALIVE';

    var partyRowsEl = $('raidPartyRows');
    if (partyRowsEl) {
      partyRowsEl.innerHTML = raid.party.map(function (p) {
        var isOff = Boolean(p.disconnected);
        var pct = (isOff || p.dead) ? 0 : Math.max(0, Math.min(100, Math.round((p.hp / Math.max(1, p.maxHp)) * 100)));
        var subLabel = isOff ? '⚡ OFFLINE' : (p.dead ? '☠ DOWNED' : (fmtNum(p.hp) + ' / ' + fmtNum(p.maxHp)));
        return '<div class="raid-member' + ((isOff || p.dead) ? ' dead' : (pct < 35 ? ' low' : '')) + '">' +
          '<div class="raid-member-top">' +
            '<b>' + escHtml(p.name) + (p.self ? ' (You)' : '') + '</b>' +
            '<small>' + escHtml(p.cls || '') + '</small>' +
          '</div>' +
          '<div class="raid-hp-bar"><i style="width:' + pct + '%"></i></div>' +
          '<div class="raid-member-sub"><span>' + subLabel + '</span><span>' + (isOff ? 'DISC' : (pct + '%')) + '</span></div>' +
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
    if (rew.bossCardDrop) {
      lootTiles.push(
        '<div class="raid-loot-item rare-card">' +
          '<span class="raid-loot-icon">🃏</span>' +
          '<div class="raid-loot-meta"><b>' + escHtml(rew.bossCardDrop) + '</b><small>10% Raid Boss Accessory Card!</small></div>' +
        '</div>'
      );
    }
    if (rew.raidboundPet && rew.raidboundPet.name) {
      lootTiles.push(
        '<div class="raid-loot-item rare-card">' +
          '<span class="raid-loot-icon">🐾</span>' +
          '<div class="raid-loot-meta"><b>' + escHtml(rew.raidboundPet.name) + '</b><small>10% Raidbound pet' + (rew.raidboundPet.folded ? ' · folded into Bond' : '') + '!</small></div>' +
        '</div>'
      );
    }
    if (rew.titleDrop) {
      lootTiles.push(
        '<div class="raid-loot-item rare-title">' +
          '<span class="raid-loot-icon">⚡</span>' +
          '<div class="raid-loot-meta"><b>Title: ' + escHtml(rew.titleDrop) + '</b><small>10% Exclusive Static Lightning FX</small></div>' +
        '</div>'
      );
    }
    if (Array.isArray(rew.milestoneTitles) && rew.milestoneTitles.length > 0) {
      for (var mti = 0; mti < rew.milestoneTitles.length; mti++) {
        lootTiles.push(
          '<div class="raid-loot-item rare-title">' +
            '<span class="raid-loot-icon">⚡</span>' +
            '<div class="raid-loot-meta"><b>Title: ' + escHtml(rew.milestoneTitles[mti]) + '</b><small>Raid Milestone Static Lightning FX</small></div>' +
          '</div>'
        );
      }
    }
    if (!lootTiles.length) {
      lootTiles.push(
        '<div class="raid-loot-item">' +
          '<span class="raid-loot-icon">' + (res.refundedEntry ? '↩' : '—') + '</span>' +
          '<div class="raid-loot-meta"><b>' + (res.refundedEntry ? 'Daily Raid Entry Kept' : 'No Items Received') + '</b><small>' + (res.refundedEntry ? 'Exited Solo within 10s (no attempt spent)' : 'Run ended early') + '</small></div>' +
        '</div>'
      );
    }

    body.innerHTML =
      '<div class="raid-result-card' + (res.cleared ? ' win' : ' fail') + '">' +
        '<div class="raid-result-head">' +
          '<span class="raid-eyebrow">' +
            escHtml(dngTitle) + (res.mode === 'party' ? ' · PARTY ' : ' · SOLO ') +
            (res.cleared ? 'COMPLETE' : (res.refundedEntry ? 'EARLY EXIT' : 'FAILED')) +
          '</span>' +
          '<h2>' + (res.cleared ? ('🏆 Raid Complete — ' + escHtml(bossTitle) + ' Defeated!') : (res.refundedEntry ? '↩ Raid Exited — Entry Kept!' : '☠ Raid Failed')) + '</h2>' +
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
      else if (act === 'hold') toggleHoldGround();
      else if (act === 'revive') revive();
      else if (act === 'leave') {
        var graceEligible = raid.mode === 'solo' && !raid.dead &&
          (typeof S === 'undefined' || !S || (Number(S.hp) || 0) > 0) &&
          raid.elapsed <= SOLO_GRACE_LEAVE_S;
        if (typeof ask === 'function') {
          var promptMsg = graceEligible
            ? 'Leave Solo Raid within 10s? Your daily Raid entry will be KEPT (no consolation rewards).'
            : (raid.mode === 'party'
              ? 'Leave the Party Raid? Your run will end, while remaining teammates can continue.'
              : 'Leave the Raid? Your current run will end and use 1 daily entry.');
          ask(promptMsg, function () { leave({ graceLock: graceEligible }); }, { yes: 'Leave Raid', no: 'Stay' });
        } else {
          leave({ graceLock: graceEligible });
        }
      } else if (act === 'invite') {
        var invitee = $('raidPartyInvitee');
        var targetId = invitee && invitee.value ? Number(invitee.value) : NaN;
        if (!Number.isInteger(targetId) || targetId <= 0) {
          setInviteNote('Pick a trainer from the list first.', true);
          return;
        }
        var socApp = root.PGSocial && root.PGSocial.app;
        if (!root.PGSocial || typeof root.PGSocial.send !== 'function' || !socApp || !socApp.room || !socApp.connected) {
          setInviteNote('Party invites need the Fountain Plaza — use Enter Plaza & Invite.', true);
          return;
        }
        var targetName = invitee.options[invitee.selectedIndex] ? invitee.options[invitee.selectedIndex].textContent : 'a trainer';
        if (root.PGSocial.send({ type: 'party_invite', targetId: targetId })) {
          setInviteNote('Party invite sent to ' + targetName + ' — it opens their party pop-up.');
        } else {
          setInviteNote('That invite could not be sent. Check the plaza connection.', true);
        }
      } else if (act === 'plaza') {
        // v466: entering the plaza keeps the Ready Room open, then refills the trainer list
        // once the room has joined so the invite is one click away.
        if (!root.PGSocial || typeof root.PGSocial.enter !== 'function') return;
        var entered = root.PGSocial.enter(0);
        var tries = 0;
        var waitsForPlaza = function () {
          if (raid.on) return;
          var lobby = $('raidLobby');
          if (!lobby || lobby.hidden) return;
          var appNow = root.PGSocial && root.PGSocial.app;
          if (appNow && appNow.room && appNow.connected) { renderLobby(); return; }
          if (++tries > 20) {
            // Solo / offline plaza never joins a shared room: drop the modal so the plaza stays usable.
            hideLobby();
            if (typeof log === 'function') log('Party invites need a cloud-connected plaza room — the Ready Room closed so you can play in the plaza.', 'r0', 'misc');
            return;
          }
          if (typeof setTimeout === 'function') setTimeout(waitsForPlaza, 700);
        };
        if (entered && typeof entered.then === 'function') entered.then(waitsForPlaza, function () {});
        else if (typeof setTimeout === 'function') setTimeout(waitsForPlaza, 700);
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

  // ---------- Continuous 3D Thor Volcano Raid Causeway & Caldera Boss Sanctum ----------
  var VOLCANO_RAID_FOCUS = [-8, -46, -86, -132, -142];
  var VOLCANO_RIGHT = [
    [14.6, 24], [15.2, 12], [14.8, 0], [15.8, -10], [14.6, -20], [13.8, -27],
    [13.4, -31], [15.4, -40], [15.8, -48], [14.2, -58], [13.5, -65],
    [13.4, -70], [15.6, -80], [15.8, -90], [14.2, -99], [13.4, -105],
    // Narrowed Obsidian Connecting Bridge leading visibly into Ifrit's Sanctum!
    [9.2, -108], [8.8, -114], [9.4, -119],
    // Grand 53.6-unit Circular Obsidian Caldera Boss Sanctuary centered at z = -142!
    [18.8, -123], [24.2, -130], [26.8, -142], [25.0, -154], [20.4, -162], [12.5, -168], [0, -170]
  ];
  var VOLCANO_OUTLINE = [
    [0, 24]
  ].concat(
    VOLCANO_RIGHT,
    VOLCANO_RIGHT.slice(0, -1).reverse().map(function (pt) { return [-pt[0], pt[1]]; })
  );

  var volcanoEndgameImgs = { stone: null, lava: null, started: false, callbacks: [] };
  function ensureVolcanoEndgameImgs(cb) {
    if (cb) volcanoEndgameImgs.callbacks.push(cb);
    if (volcanoEndgameImgs.started || typeof Image === 'undefined') return;
    volcanoEndgameImgs.started = true;
    function loadOne(key, url) {
      var img = new Image();
      img.decoding = 'async';
      img.onload = function () {
        volcanoEndgameImgs[key] = img;
        for (var i = 0; i < volcanoEndgameImgs.callbacks.length; i++) {
          try { volcanoEndgameImgs.callbacks[i](); } catch (_) {}
        }
      };
      img.src = url;
    }
    loadOne('stone', 'assets/endgame/textures/weathered-stone-b2af8375d71a.webp');
    loadOne('lava', 'assets/endgame/textures/molten-basalt-33dab0df2735.webp');
  }

  function volcHash(n) {
    var s = Math.sin(n * 127.1 + 311.7) * 43758.5453123;
    return s - Math.floor(s);
  }

  function normalizePlanarUvs(geo, tileMeters) {
    if (!geo || !geo.attributes || !geo.attributes.position) return;
    var pos = geo.attributes.position;
    var uv = geo.attributes.uv;
    if (!uv || uv.count !== pos.count) return;
    var scale = 1 / Math.max(1, tileMeters || 12);
    for (var i = 0; i < pos.count; i++) {
      var x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
      uv.setXY(i, (x + y * 0.35) * scale, (z + y * 0.35) * scale);
    }
    uv.needsUpdate = true;
  }

  function paintVolcanicStoneCanvas(cv, stoneImg) {
    var ctx = cv && cv.getContext ? cv.getContext('2d') : null;
    if (!ctx) return;
    var w = cv.width, h = cv.height;
    ctx.fillStyle = '#3b251c';
    ctx.fillRect(0, 0, w, h);

    if (stoneImg) {
      ctx.globalAlpha = 0.88;
      ctx.drawImage(stoneImg, 0, 0, w * 0.5, h * 0.5);
      ctx.drawImage(stoneImg, w * 0.5, 0, w * 0.5, h * 0.5);
      ctx.drawImage(stoneImg, 0, h * 0.5, w * 0.5, h * 0.5);
      ctx.drawImage(stoneImg, w * 0.5, h * 0.5, w * 0.5, h * 0.5);
      ctx.globalAlpha = 1;
      // Warm volcanic basalt grade over the weathered stone photo grain
      ctx.fillStyle = 'rgba(42, 18, 12, 0.44)';
      ctx.fillRect(0, 0, w, h);
    } else {
      // Crisp procedural volcanic slag & basalt blocks before WebP finishes decoding
      for (var p = 0; p < 240; p++) {
        var px = volcHash(p * 3 + 1) * w;
        var py = volcHash(p * 3 + 2) * h;
        var pr = 8 + volcHash(p * 3 + 3) * 34;
        var sh = 30 + Math.floor(volcHash(p * 7) * 32);
        ctx.fillStyle = 'rgba(' + (sh + 16) + ',' + sh + ',' + Math.max(14, sh - 6) + ',0.55)';
        ctx.beginPath();
        ctx.arc(px, py, pr, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Dark fractured basalt joint lines across the stone surface
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (var c = 0; c < 26; c++) {
      var cx = volcHash(c * 11 + 5) * w;
      var cy = volcHash(c * 11 + 9) * h;
      var ang = volcHash(c * 13) * Math.PI * 2;
      ctx.strokeStyle = 'rgba(14, 7, 6, 0.68)';
      ctx.lineWidth = 2.6 + (c % 3) * 1.1;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      for (var s = 1; s <= 5; s++) {
        ang += (volcHash(c * 19 + s) - 0.5) * 1.1;
        cx += Math.cos(ang) * (w * 0.08);
        cy += Math.sin(ang) * (h * 0.08);
        ctx.lineTo(cx, cy);
      }
      ctx.stroke();

      // Subtle glowing ember veins inside every third deep fracture (like Ascension Thor Volcano!)
      if (c % 3 === 0) {
        ctx.strokeStyle = 'rgba(255, 106, 24, 0.52)';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
    }

    // Ash & scorched pumice grit speckles for sharp close-up ground detail
    for (var g = 0; g < 420; g++) {
      var gx = volcHash(g * 5 + 17) * w;
      var gy = volcHash(g * 5 + 23) * h;
      var gs = 1.2 + volcHash(g * 5 + 29) * 3.2;
      ctx.fillStyle = g % 5 === 0 ? 'rgba(130, 88, 68, 0.32)' : 'rgba(18, 10, 9, 0.38)';
      ctx.fillRect(gx, gy, gs, gs);
    }
  }

  function paintMoltenLavaCanvas(cv, lavaImg) {
    var ctx = cv && cv.getContext ? cv.getContext('2d') : null;
    if (!ctx) return;
    var w = cv.width, h = cv.height;
    var bg = ctx.createLinearGradient(0, 0, w, h);
    bg.addColorStop(0, '#621404');
    bg.addColorStop(0.5, '#b82e08');
    bg.addColorStop(1, '#581003');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    if (lavaImg) {
      ctx.globalAlpha = 0.86;
      ctx.drawImage(lavaImg, 0, 0, w, h);
      ctx.globalAlpha = 1;
    } else {
      for (var i = 0; i < 48; i++) {
        var x = volcHash(i * 7 + 1) * w;
        var y = volcHash(i * 7 + 2) * h;
        var r = 16 + (i % 5) * 11;
        var rg = ctx.createRadialGradient(x, y, 2, x, y, r);
        rg.addColorStop(0, i % 3 === 0 ? '#ffe484' : '#ff8c1f');
        rg.addColorStop(0.55, '#d9380a');
        rg.addColorStop(1, 'rgba(65,10,3,0)');
        ctx.fillStyle = rg;
        ctx.fillRect(0, 0, w, h);
      }
    }

    ctx.strokeStyle = 'rgba(255, 218, 106, 0.62)';
    ctx.lineWidth = 2.6;
    for (var v = 0; v < 12; v++) {
      ctx.beginPath();
      var sy = (v / 12) * h;
      ctx.moveTo(0, sy);
      for (var sx = 0; sx <= w; sx += 32) {
        ctx.lineTo(sx, sy + Math.sin((sx / w) * Math.PI * 2 + v) * 10);
      }
      ctx.stroke();
    }
  }

  function makeVolcanoCanvasTex(THREE, w, h, painter, repeatX, repeatY) {
    if (typeof document === 'undefined' || !document.createElement) return null;
    var cv = document.createElement('canvas');
    cv.width = w;
    cv.height = h;
    var ctx = cv.getContext && cv.getContext('2d');
    if (!ctx) return null;
    painter(cv);
    var tex = new THREE.CanvasTexture(cv);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    if (repeatX || repeatY) tex.repeat.set(repeatX || 1, repeatY || 1);
    tex.userData = { canvas: cv };
    return tex;
  }

  function buildVolcanoRaidWorld(stage) {
    if (typeof THREE === 'undefined') return null;
    var stNum = Math.max(1, Math.min(5, Number(stage) || 1));
    var worldScene = new THREE.Scene();
    var skyCol = new THREE.Color(0x1f0a06);
    worldScene.background = skyCol;
    worldScene.fog = new THREE.FogExp2(0x2d1109, 0.0020);

    var scenery = new THREE.Group();
    scenery.name = 'thor-raid-causeway';
    worldScene.add(scenery);

    // Ascension Thor Volcano warm directional + caldera rim bounce lighting
    var hemiLight = new THREE.HemisphereLight(0xffb882, 0x5c1a08, 0.86);
    worldScene.add(hemiLight);
    var keyLight = new THREE.DirectionalLight(0xffd49e, 1.12);
    keyLight.position.set(28, 54, 24);
    worldScene.add(keyLight);
    var lavaBounce = new THREE.DirectionalLight(0xff5c18, 0.68);
    lavaBounce.position.set(-18, -14, -90);
    worldScene.add(lavaBounce);

    var ownedTextures = [];
    var disposed = false;

    // 1. Real Molten-Basalt WebP + Flowing Magma Veins Texture (Sea, Floor Pools & Spills)
    var lavaTex = makeVolcanoCanvasTex(THREE, 512, 512, function (cv) {
      paintMoltenLavaCanvas(cv, volcanoEndgameImgs.lava);
    }, 8, 10);
    if (lavaTex) ownedTextures.push(lavaTex);

    var poolLavaTex = makeVolcanoCanvasTex(THREE, 512, 512, function (cv) {
      paintMoltenLavaCanvas(cv, volcanoEndgameImgs.lava);
    }, 1, 1);
    if (poolLavaTex) ownedTextures.push(poolLavaTex);

    // 2. Real Weathered-Stone WebP + Fractured Volcanic Basalt & Ember-Seam Floor Texture
    var deckTex = makeVolcanoCanvasTex(THREE, 512, 512, function (cv) {
      paintVolcanicStoneCanvas(cv, volcanoEndgameImgs.stone);
    }, 1, 1);
    if (deckTex) ownedTextures.push(deckTex);

    var rockWallTex = makeVolcanoCanvasTex(THREE, 512, 512, function (cv) {
      paintVolcanicStoneCanvas(cv, volcanoEndgameImgs.stone);
    }, 2, 2);
    if (rockWallTex) ownedTextures.push(rockWallTex);

    var onEndgameImgReady = function () {
      if (disposed) return;
      if (volcanoEndgameImgs.lava) {
        if (lavaTex && lavaTex.userData.canvas) {
          paintMoltenLavaCanvas(lavaTex.userData.canvas, volcanoEndgameImgs.lava);
          lavaTex.needsUpdate = true;
        }
        if (poolLavaTex && poolLavaTex.userData.canvas) {
          paintMoltenLavaCanvas(poolLavaTex.userData.canvas, volcanoEndgameImgs.lava);
          poolLavaTex.needsUpdate = true;
        }
      }
      if (volcanoEndgameImgs.stone) {
        if (deckTex && deckTex.userData.canvas) {
          paintVolcanicStoneCanvas(deckTex.userData.canvas, volcanoEndgameImgs.stone);
          deckTex.needsUpdate = true;
        }
        if (rockWallTex && rockWallTex.userData.canvas) {
          paintVolcanicStoneCanvas(rockWallTex.userData.canvas, volcanoEndgameImgs.stone);
          rockWallTex.needsUpdate = true;
        }
      }
    };
    ensureVolcanoEndgameImgs(onEndgameImgReady);

    var lavaSeaMat = new THREE.MeshBasicMaterial({
      color: lavaTex ? 0xffffff : 0xc8370c,
      map: lavaTex || null
    });
    var lavaSea = new THREE.Mesh(new THREE.PlaneGeometry(260, 270), lavaSeaMat);
    lavaSea.rotation.x = -Math.PI / 2;
    lavaSea.position.set(0, -2.4, -78);
    scenery.add(lavaSea);

    // 3. Textured Volcanic Causeway Deck (y = 0.02 so hazardGroup at y = 0.14 is 100% unoccluded!) + Extruded Cliff
    var routeShape = new THREE.Shape();
    routeShape.moveTo(VOLCANO_OUTLINE[0][0], -VOLCANO_OUTLINE[0][1]);
    for (var oi = 1; oi < VOLCANO_OUTLINE.length; oi++) {
      routeShape.lineTo(VOLCANO_OUTLINE[oi][0], -VOLCANO_OUTLINE[oi][1]);
    }
    routeShape.closePath();

    var cliffGeo = new THREE.ExtrudeGeometry(routeShape, {
      depth: 2.65,
      bevelEnabled: true,
      bevelThickness: 0.24,
      bevelSize: 0.38,
      bevelSegments: 2,
      curveSegments: 8
    });
    cliffGeo.rotateX(-Math.PI / 2);
    normalizePlanarUvs(cliffGeo, 11);
    var cliffMat = new THREE.MeshStandardMaterial({
      color: rockWallTex ? 0x8a6456 : 0x261816,
      map: rockWallTex || null,
      bumpMap: rockWallTex || null,
      bumpScale: 0.35,
      roughness: 0.92,
      metalness: 0.08
    });
    var cliffMesh = new THREE.Mesh(cliffGeo, cliffMat);
    cliffMesh.position.y = -2.68;
    cliffMesh.userData.outline = VOLCANO_OUTLINE;
    scenery.add(cliffMesh);

    var deckGeo = new THREE.ShapeGeometry(routeShape, 8);
    deckGeo.rotateX(-Math.PI / 2);
    normalizePlanarUvs(deckGeo, 13);
    var deckMat = new THREE.MeshStandardMaterial({
      color: deckTex ? 0xdcc6bc : 0x452d26,
      map: deckTex || null,
      bumpMap: deckTex || null,
      bumpScale: 0.36,
      roughness: 0.86,
      metalness: 0.10
    });
    var deckMesh = new THREE.Mesh(deckGeo, deckMat);
    deckMesh.position.y = 0.02;
    scenery.add(deckMesh);

    // Shared Materials for Ascension Thor Volcano Small Details (Basalt Strata, Rubble, Lava Pools, Spills, Calderas)
    var rockMat = new THREE.MeshStandardMaterial({
      color: rockWallTex ? 0x9c7464 : 0x3b2620,
      map: rockWallTex || null,
      bumpMap: rockWallTex || null,
      bumpScale: 0.30,
      roughness: 0.90,
      metalness: 0.10
    });
    var strataDarkMat = new THREE.MeshStandardMaterial({
      color: rockWallTex ? 0x563932 : 0x211514,
      map: rockWallTex || null,
      roughness: 0.92,
      metalness: 0.12
    });
    var strataRustMat = new THREE.MeshStandardMaterial({
      color: rockWallTex ? 0xb56d4f : 0x5c3222,
      map: rockWallTex || null,
      roughness: 0.88,
      metalness: 0.08
    });
    var obsidianMat = new THREE.MeshStandardMaterial({
      color: 0x1c141c,
      bumpMap: rockWallTex || null,
      bumpScale: 0.16,
      roughness: 0.44,
      metalness: 0.42
    });
    var poolLavaMat = new THREE.MeshBasicMaterial({
      color: poolLavaTex ? 0xffffff : 0xff6e18,
      map: poolLavaTex || null
    });
    var crustRimMat = new THREE.MeshStandardMaterial({
      color: 0x1e1110,
      roughness: 0.95,
      metalness: 0.06
    });
    var magmaGlowMat = new THREE.MeshBasicMaterial({ color: 0xff761c });
    var goldSealMat = new THREE.MeshBasicMaterial({
      color: 0xffb845,
      transparent: true,
      opacity: 0.62,
      side: THREE.DoubleSide,
      depthWrite: false
    });

    // Subtle recessed glowing magma-vein guide down the causeway (y = 0.026 so hazards at y = 0.14 sit cleanly above!)
    var spineA = new THREE.Mesh(
      new THREE.PlaneGeometry(0.92, 136),
      new THREE.MeshBasicMaterial({ color: 0xff5a14, transparent: true, opacity: 0.44, depthWrite: false })
    );
    spineA.rotation.x = -Math.PI / 2;
    spineA.position.set(0, 0.025, -52);
    scenery.add(spineA);

    var spineCore = new THREE.Mesh(
      new THREE.PlaneGeometry(0.28, 136),
      new THREE.MeshBasicMaterial({ color: 0xffd269, transparent: true, opacity: 0.68, depthWrite: false })
    );
    spineCore.rotation.x = -Math.PI / 2;
    spineCore.position.set(0, 0.028, -52);
    scenery.add(spineCore);

    // 4. Ascension Detail Helper A: Hexagonal Layered Basalt Column Clusters with Geological Strata Bands!
    var hexShaftGeo = new THREE.CylinderGeometry(1, 1.06, 1, 6);
    var hexBandGeo = new THREE.CylinderGeometry(1.05, 1.07, 1, 6);
    var emberCapGeo = new THREE.OctahedronGeometry(0.48, 0);
    function addBasaltCluster(cx, cz, radius, height, seed, withEmber) {
      var grp = new THREE.Group();
      grp.position.set(cx, -0.25, cz);
      for (var n = 0; n < 4; n++) {
        var ang = n * 1.7 + seed;
        var dist = n === 0 ? 0 : radius * (0.58 + volcHash(seed * 7 + n) * 0.28);
        var cr = radius * (n === 0 ? 0.56 : 0.34 + volcHash(seed * 11 + n) * 0.16);
        var ch = height * (n === 0 ? 1.0 : 0.46 + volcHash(seed * 13 + n) * 0.44);
        var ox = Math.cos(ang) * dist, oz = Math.sin(ang) * dist;
        var shaft = new THREE.Mesh(hexShaftGeo, n === 0 ? rockMat : strataDarkMat);
        shaft.scale.set(cr, ch, cr);
        shaft.position.set(ox, ch * 0.5, oz);
        shaft.rotation.y = ang * 0.5;
        grp.add(shaft);

        // Ascension geological strata rings along the hexagonal shaft
        for (var b = 1; b <= 2; b++) {
          var bh = ch * (0.12 + b * 0.02);
          var band = new THREE.Mesh(hexBandGeo, b === 1 ? strataDarkMat : strataRustMat);
          band.scale.set(cr, bh, cr);
          band.position.set(ox, ch * (0.28 * b + 0.14), oz);
          band.rotation.y = shaft.rotation.y;
          grp.add(band);
        }
      }
      if (withEmber) {
        var flame = new THREE.Mesh(emberCapGeo, magmaGlowMat);
        flame.position.set(0, height + 0.38, 0);
        grp.add(flame);
      }
      scenery.add(grp);
    }

    var basaltSpecs = [
      // Stage 1: Molten Approach
      [-13.4, 15, 1.55, 4.8, true], [13.4, 15, 1.55, 4.8, true],
      [-14.1, 2, 1.75, 5.8, false], [14.1, 2, 1.75, 5.8, false],
      [-13.6, -13, 1.60, 5.2, true], [13.6, -13, 1.60, 5.2, true],
      // Bridge 1 Gate (-29)
      [-12.3, -29, 1.65, 7.8, true], [12.3, -29, 1.65, 7.8, true],
      // Stage 2: Basalt Forge
      [-14.2, -41, 1.80, 6.2, false], [14.2, -41, 1.80, 6.2, false],
      [-13.8, -55, 1.65, 5.6, true], [13.8, -55, 1.65, 5.6, true],
      // Bridge 2 Gate (-67)
      [-12.3, -67, 1.70, 8.2, true], [12.3, -67, 1.70, 8.2, true],
      // Stage 3: Magma Conduit
      [-14.4, -79, 1.85, 6.5, false], [14.4, -79, 1.85, 6.5, false],
      [-13.7, -95, 1.70, 6.0, true], [13.7, -95, 1.70, 6.0, true],
      // Connecting Boss Bridge Sanctum Gate Towers (-107 & -119)
      [-8.4, -107, 1.55, 9.2, true], [8.4, -107, 1.55, 9.2, true],
      [-8.0, -113.5, 1.35, 5.8, false], [8.0, -113.5, 1.35, 5.8, false],
      [-8.7, -119, 1.65, 10.2, true], [8.7, -119, 1.65, 10.2, true],
      // Stage 4: Outer Sanctum Basalt Sentinels
      [-21.5, -128, 2.1, 7.6, true], [21.5, -128, 2.1, 7.6, true],
      [-24.6, -142, 2.3, 8.8, false], [24.6, -142, 2.3, 8.8, false],
      [-20.8, -157, 2.2, 8.4, true], [20.8, -157, 2.2, 8.4, true]
    ];
    for (var bi = 0; bi < basaltSpecs.length; bi++) {
      var bs = basaltSpecs[bi];
      addBasaltCluster(bs[0], bs[1], bs[2], bs[3], bi * 1.37 + 0.5, bs[4]);
    }

    // 5. Ascension Detail Helper B: Scattered Volcanic Rubble & Slag Boulders along Curbs & Sanctum!
    var rubbleStoneGeo = new THREE.DodecahedronGeometry(1, 0);
    function addRubblePile(cx, cz, count, spread, scaleBase, seed) {
      var grp = new THREE.Group();
      grp.position.set(cx, 0.03, cz);
      for (var r = 0; r < count; r++) {
        var ang = volcHash(seed * 11 + r) * Math.PI * 2;
        var dist = volcHash(seed * 17 + r) * spread;
        var sx = scaleBase * (0.45 + volcHash(seed * 23 + r) * 0.72);
        var sy = sx * (0.42 + volcHash(seed * 29 + r) * 0.36);
        var sz = sx * (0.72 + volcHash(seed * 31 + r) * 0.45);
        var stone = new THREE.Mesh(rubbleStoneGeo, r % 3 === 0 ? strataRustMat : (r % 2 === 0 ? rockMat : strataDarkMat));
        stone.scale.set(sx, sy, sz);
        stone.position.set(Math.cos(ang) * dist, sy * 0.36, Math.sin(ang) * dist);
        stone.rotation.set(volcHash(seed + r) * 0.6, volcHash(seed * 3 + r) * 3.1, volcHash(seed * 5 + r) * 0.6);
        grp.add(stone);
      }
      scenery.add(grp);
    }

    var rubbleSpots = [
      [-12.2, 19, 6, 1.8, 0.68], [12.4, 8, 5, 1.6, 0.62],
      [-12.6, -6, 6, 1.9, 0.72], [12.3, -21, 6, 1.7, 0.66],
      [-12.5, -35, 5, 1.7, 0.65], [12.8, -48, 7, 2.1, 0.74],
      [-12.4, -61, 6, 1.8, 0.68], [12.6, -74, 6, 1.9, 0.70],
      [-12.8, -88, 7, 2.1, 0.75], [12.2, -101, 5, 1.6, 0.64],
      [-16.8, -125, 7, 2.3, 0.82], [17.2, -125, 7, 2.3, 0.82],
      [-22.4, -135, 8, 2.5, 0.88], [22.4, -149, 8, 2.5, 0.88],
      [-15.5, -163, 7, 2.4, 0.85], [15.5, -163, 7, 2.4, 0.85]
    ];
    for (var ri = 0; ri < rubbleSpots.length; ri++) {
      var rs = rubbleSpots[ri];
      addRubblePile(rs[0], rs[1], rs[2], rs[3], rs[4], ri * 2.1 + 1.3);
    }

    // 6. Ascension Detail Helper C: Hand-Shaped Irregular Bubbling Lava Pools with Cooling Basalt Crusts!
    function addLavaPool(cx, cz, rx, rz, rot, seed) {
      var pts = [];
      for (var i = 0; i < 18; i++) {
        var a = (i / 18) * Math.PI * 2;
        var wob = 0.76 + volcHash(seed * 13 + i) * 0.34;
        pts.push(new THREE.Vector2(Math.cos(a) * rx * wob, Math.sin(a) * rz * wob));
      }
      var pShape = new THREE.Shape(pts);
      pShape.closePath();

      var rimGeo = new THREE.ExtrudeGeometry(pShape, {
        depth: 0.11,
        bevelEnabled: true,
        bevelThickness: 0.05,
        bevelSize: 0.22,
        bevelSegments: 1,
        curveSegments: 6
      });
      rimGeo.rotateX(-Math.PI / 2);
      var rim = new THREE.Mesh(rimGeo, crustRimMat);
      rim.position.set(cx, -0.02, cz);
      rim.rotation.y = rot;
      scenery.add(rim);

      var surfGeo = new THREE.ShapeGeometry(pShape, 6);
      surfGeo.rotateX(-Math.PI / 2);
      normalizePlanarUvs(surfGeo, 7);
      var surf = new THREE.Mesh(surfGeo, poolLavaMat);
      surf.position.set(cx, 0.032, cz);
      surf.rotation.y = rot;
      scenery.add(surf);
    }

    // Tucked onto the outer shoulders so the central combat lane & hazard telegraphs stay crystal-clear!
    var poolSpecs = [
      [-11.2, 6, 2.4, 1.5, 0.25], [11.4, -17, 2.3, 1.4, -0.30],
      [-11.6, -46, 2.6, 1.6, 0.18], [11.5, -58, 2.2, 1.4, -0.22],
      [-11.6, -84, 2.7, 1.6, 0.32], [11.6, -92, 2.3, 1.5, -0.28],
      [-18.6, -134, 3.2, 2.0, 0.40], [18.8, -137, 3.1, 1.9, -0.35],
      [-17.2, -153, 3.0, 1.9, -0.25], [17.4, -154, 3.2, 2.0, 0.30]
    ];
    for (var pli = 0; pli < poolSpecs.length; pli++) {
      var psp = poolSpecs[pli];
      addLavaPool(psp[0], psp[1], psp[2], psp[3], psp[4], pli * 3.7 + 0.9);
    }

    // 7. Ascension Detail Helper D: Pouring Molten Lava Spills over Causeway Cliff Edges!
    function addLavaSpill(cx, cz, width, dropH, rotY) {
      var spShape = new THREE.Shape();
      spShape.moveTo(-width * 0.42, 0);
      spShape.quadraticCurveTo(-width * 0.56, -dropH * 0.48, -width * 0.32, -dropH);
      spShape.lineTo(width * 0.34, -dropH);
      spShape.quadraticCurveTo(width * 0.58, -dropH * 0.44, width * 0.40, 0);
      spShape.closePath();
      var spGeo = new THREE.ExtrudeGeometry(spShape, {
        depth: 0.22,
        bevelEnabled: true,
        bevelThickness: 0.06,
        bevelSize: 0.06,
        bevelSegments: 1
      });
      normalizePlanarUvs(spGeo, 6);
      var spMesh = new THREE.Mesh(spGeo, poolLavaMat);
      spMesh.position.set(cx, 0.01, cz);
      spMesh.rotation.y = rotY;
      scenery.add(spMesh);
    }

    var spillSpecs = [
      [-14.7, -4, 2.1, 2.6, -Math.PI * 0.5], [14.7, -11, 2.2, 2.6, Math.PI * 0.5],
      [-15.1, -44, 2.6, 2.7, -Math.PI * 0.5], [15.1, -51, 2.5, 2.7, Math.PI * 0.5],
      [-15.2, -83, 2.6, 2.7, -Math.PI * 0.5], [15.2, -89, 2.4, 2.7, Math.PI * 0.5],
      [-25.4, -140, 3.0, 2.8, -Math.PI * 0.5], [25.4, -145, 3.0, 2.8, Math.PI * 0.5]
    ];
    for (var spi = 0; spi < spillSpecs.length; spi++) {
      var sps = spillSpecs[spi];
      addLavaSpill(sps[0], sps[1], sps[2], sps[3], sps[4]);
    }

    // Overhead Volcanic Obsidian Gateway Lintels at the 3 Connecting Bridges (-29, -67, -119)
    var gateZs = [
      [-29, 25.8, 7.8],
      [-67, 25.8, 8.2],
      [-119, 18.8, 10.2]
    ];
    var lintelGeo = new THREE.BoxGeometry(1, 0.92, 1.35);
    for (var gi = 0; gi < gateZs.length; gi++) {
      var gz = gateZs[gi];
      var lintel = new THREE.Mesh(lintelGeo, obsidianMat);
      lintel.scale.set(gz[1], 1, 1);
      lintel.position.set(0, gz[2] + 0.15, gz[0]);
      scenery.add(lintel);
      var trim = new THREE.Mesh(new THREE.BoxGeometry(gz[1] * 0.80, 0.22, 1.48), magmaGlowMat);
      trim.position.set(0, gz[2] - 0.22, gz[0]);
      scenery.add(trim);
    }

    // 8. Stage 2 Landmark: Twin Pouring Molten Lava Cascades & Sculpted Basalt Cliffs (z = -39 & -52)
    var cascadeTex = makeVolcanoCanvasTex(THREE, 128, 256, function (cv) {
      paintMoltenLavaCanvas(cv, volcanoEndgameImgs.lava);
    }, 1, 2);
    if (cascadeTex) ownedTextures.push(cascadeTex);
    var cascadeMat = new THREE.MeshBasicMaterial({
      color: cascadeTex ? 0xffffff : 0xff7b1f,
      map: cascadeTex || null,
      side: THREE.DoubleSide
    });
    var cliffBlockGeo = new THREE.ConeGeometry(6.8, 18.5, 7);
    normalizePlanarUvs(cliffBlockGeo, 9);
    var fallGeo = new THREE.PlaneGeometry(3.5, 15.8);
    var cascadeZs = [-39, -52];
    for (var ci = 0; ci < cascadeZs.length; ci++) {
      for (var sgn = -1; sgn <= 1; sgn += 2) {
        var cliff = new THREE.Mesh(cliffBlockGeo, rockMat);
        cliff.position.set(sgn * 26.0, 6.3, cascadeZs[ci]);
        scenery.add(cliff);
        var fall = new THREE.Mesh(fallGeo, cascadeMat);
        fall.position.set(sgn * 21.4, 5.0, cascadeZs[ci]);
        fall.rotation.y = sgn < 0 ? (Math.PI * 0.42) : (-Math.PI * 0.42);
        scenery.add(fall);
      }
    }

    // 9. Ascension Detail Helper E: Sculpted Ribbed Volcano Caldera Cones with Glowing Magma Craters!
    function addSculptedVolcano(vx, vz, rTop, rBot, h, seed) {
      var grp = new THREE.Group();
      grp.position.set(vx, -2.2, vz);
      var coneG = new THREE.CylinderGeometry(rTop, rBot, h, 20, 6, true);
      var pos = coneG.attributes.position;
      for (var i = 0; i < pos.count; i++) {
        var x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
        var u = (y + h * 0.5) / h;
        var ang = Math.atan2(z, x);
        var ridge = 1 + Math.sin(ang * 6 + seed) * 0.08 * (1 - u * 0.4) + Math.cos(ang * 11 - u * 5) * 0.05;
        pos.setXYZ(i, x * ridge, y, z * ridge);
      }
      coneG.computeVertexNormals();
      normalizePlanarUvs(coneG, 12);
      var body = new THREE.Mesh(coneG, rockMat);
      body.position.y = h * 0.5;
      grp.add(body);

      var rimTorus = new THREE.Mesh(new THREE.TorusGeometry(rTop * 0.96, rTop * 0.16, 8, 20), crustRimMat);
      rimTorus.rotation.x = Math.PI * 0.5;
      rimTorus.position.y = h - 0.12;
      grp.add(rimTorus);

      var lake = new THREE.Mesh(new THREE.CircleGeometry(rTop * 0.84, 20), poolLavaMat);
      lake.rotation.x = -Math.PI * 0.5;
      lake.position.y = h - 0.25;
      grp.add(lake);
      scenery.add(grp);
    }

    addSculptedVolcano(-33, -14, 2.8, 8.6, 10.5, 1.1);
    addSculptedVolcano(33, -18, 2.6, 8.2, 9.8, 2.4);
    addSculptedVolcano(-29, -85, 3.2, 9.4, 12.2, 3.7);
    addSculptedVolcano(29, -85, 3.2, 9.4, 12.2, 5.1);
    addSculptedVolcano(-40, -138, 4.2, 12.5, 16.5, 6.3);
    addSculptedVolcano(40, -138, 4.2, 12.5, 16.5, 7.9);
    // Colossal Titan Volcano behind Ifrit's Sanctum (z = -194)
    addSculptedVolcano(0, -194, 10.8, 38.0, 36.0, 9.2);

    // 10. Stage 4 Terminus: Sanctum of Ifrit (z = -142) — Broken Basalt Rim Wall, Rib Spikes & Recessed Seal
    var sealGroup = new THREE.Group();
    sealGroup.position.set(0, 0.028, -142);
    var outerSeal = new THREE.Mesh(new THREE.RingGeometry(17.8, 18.6, 56), goldSealMat);
    outerSeal.rotation.x = -Math.PI / 2;
    sealGroup.add(outerSeal);
    var midSeal = new THREE.Mesh(new THREE.RingGeometry(10.8, 11.35, 48), goldSealMat);
    midSeal.rotation.x = -Math.PI / 2;
    sealGroup.add(midSeal);
    var coreSeal = new THREE.Mesh(new THREE.RingGeometry(4.0, 4.45, 40), goldSealMat);
    coreSeal.rotation.x = -Math.PI / 2;
    sealGroup.add(coreSeal);
    scenery.add(sealGroup);

    // Ascension-style Broken Basalt Caldera Rim Segments framing Stage 4 (leaving +Z bridge entrance wide open!)
    var rimBlockGeo = new THREE.BoxGeometry(2.3, 1, 1.65);
    for (var rb = 0; rb < 44; rb++) {
      var rAng = (rb / 44) * Math.PI * 2;
      var rx = Math.cos(rAng) * 25.6;
      var rz = -142 + Math.sin(rAng) * 25.6;
      // Leave wide open gateway where the connecting bridge meets the Sanctum (+Z around z = -117..-124, |x| < 11)
      if (rz > -124.5 && Math.abs(rx) < 11.8) continue;
      if (rb % 7 === 3) continue; // natural broken volcanic gaps!
      var rh = 1.4 + volcHash(rb * 13 + 7) * 2.6;
      var seg = new THREE.Mesh(rimBlockGeo, rb % 3 === 0 ? strataDarkMat : rockMat);
      seg.scale.set(1, rh, 1);
      seg.position.set(rx, rh * 0.5 - 0.15, rz);
      seg.rotation.y = -rAng + Math.PI * 0.5;
      scenery.add(seg);
    }

    // Jagged Obsidian Crown Spikes leaning inward over the northern & side Sanctum rim
    var spikeGeo = new THREE.ConeGeometry(1.38, 9.2, 5);
    for (var sk = 0; sk < 10; sk++) {
      var sang = -Math.PI * 0.12 + (sk / 9) * (Math.PI * 1.24);
      var rad = 25.8;
      var sx = Math.cos(sang) * rad;
      var sz = -142 - Math.sin(sang) * rad;
      if (sz > -124 && Math.abs(sx) < 12) continue;
      var spike = new THREE.Mesh(spikeGeo, obsidianMat);
      spike.position.set(sx, 3.5, sz);
      spike.rotation.z = (sx > 0 ? -0.20 : 0.20);
      spike.rotation.x = 0.15;
      scenery.add(spike);
    }

    // 11. Rising Volcanic Ember Particles along the entire causeway -> Sanctum
    var emberCount = 180;
    var emberPos = new Float32Array(emberCount * 3);
    var emberSeeds = new Float32Array(emberCount);
    for (var ei = 0; ei < emberCount; ei++) {
      emberPos[ei * 3] = ((ei * 37) % 56) - 28;
      emberPos[ei * 3 + 1] = ((ei * 19) % 18) * 0.9;
      emberPos[ei * 3 + 2] = 20 - ((ei * 53) % 192);
      emberSeeds[ei] = (ei * 0.73) % 6.28;
    }
    var emberGeo = new THREE.BufferGeometry();
    emberGeo.setAttribute('position', new THREE.BufferAttribute(emberPos, 3));
    var emberMat = new THREE.PointsMaterial({
      color: 0xffad3d,
      size: 0.42,
      transparent: true,
      opacity: 0.86,
      depthWrite: false
    });
    var embers = new THREE.Points(emberGeo, emberMat);
    scenery.add(embers);

    var routeMeta = {
      start: 24,
      end: -170,
      focus: VOLCANO_RAID_FOCUS.slice(),
      outline: VOLCANO_OUTLINE
    };

    return {
      scene: worldScene,
      scenery: scenery,
      kind: 'thor-raid',
      stage: stNum,
      route: routeMeta,
      view: { focus: VOLCANO_RAID_FOCUS[stNum - 1] || -8 },
      update: function (seconds, motion) {
        if (motion === false) return;
        var s = Number(seconds) || 0;
        if (lavaTex) {
          lavaTex.offset.y = (s * 0.030) % 1;
          lavaTex.offset.x = Math.sin(s * 0.22) * 0.04;
        }
        if (poolLavaTex) {
          poolLavaTex.offset.x = Math.sin(s * 0.35) * 0.05;
          poolLavaTex.offset.y = (s * 0.018) % 1;
        }
        if (cascadeTex) {
          cascadeTex.offset.y = -(s * 0.42) % 1;
        }
        sealGroup.rotation.y = s * 0.10;
        var arr = emberGeo.attributes.position.array;
        for (var k = 0; k < emberCount; k++) {
          var idx = k * 3;
          var y = ((s * (1.2 + (k % 5) * 0.22) + emberSeeds[k] * 3.0) % 16.5) - 1.2;
          arr[idx + 1] = y;
          arr[idx] = (((k * 37) % 56) - 28) + Math.sin(s * 0.9 + emberSeeds[k]) * 1.1;
        }
        emberGeo.attributes.position.needsUpdate = true;
      },
      dispose: function () {
        disposed = true;
        var cbIdx = volcanoEndgameImgs.callbacks.indexOf(onEndgameImgReady);
        if (cbIdx >= 0) volcanoEndgameImgs.callbacks.splice(cbIdx, 1);
        worldScene.traverse(function (obj) {
          if (obj.geometry && typeof obj.geometry.dispose === 'function') obj.geometry.dispose();
          if (obj.material) {
            var mats = Array.isArray(obj.material) ? obj.material : [obj.material];
            for (var mi = 0; mi < mats.length; mi++) {
              if (mats[mi] && typeof mats[mi].dispose === 'function') mats[mi].dispose();
            }
          }
        });
        for (var ti = 0; ti < ownedTextures.length; ti++) {
          if (ownedTextures[ti] && typeof ownedTextures[ti].dispose === 'function') {
            ownedTextures[ti].dispose();
          }
        }
      }
    };
  }

  bindEvents();

  return {
    DUNGEONS: DUNGEONS,
    STAGES: STAGES,
    SOLO_LIMIT_S: SOLO_LIMIT_S,
    PARTY_LIMIT_S: PARTY_LIMIT_S,
    SOLO_GRACE_LEAVE_S: SOLO_GRACE_LEAVE_S,
    DAILY_LIMIT: DAILY_LIMIT,
    raid: raid,
    isGm: isGm,
    isEligible: isRaidEligible,
    canEnter: canEnter,
    onLethalHp: handlePlayerDown,
    allPartyMembersReady: allPartyMembersReady,
    toggleReady: toggleReady,
    sendChat: sendChat,
    setChatSize: setChatSize,
    cycleChatPreset: cycleChatPreset,
    isBehindAnyPillar: isBehindAnyPillar,
    spawnSanctuaryPillars: spawnSanctuaryPillars,
    buildVolcanoRaidWorld: buildVolcanoRaidWorld,
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
    holdGroundActive: holdGroundActive,
    inPillarShadow: inPillarShadow,
    toggleHoldGround: toggleHoldGround,
    mobVisualBoost: mobVisualBoost,
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
