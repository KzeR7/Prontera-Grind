/* Astral Raid — lightweight co-op & solo raid built directly on normal field combat.
 *
 * Architecture:
 * - Reuses the Astral Citadel field (S.mp = 10) and PGAstralScenery directly:
 *   identical bridge design, textures, lighting, and stage-walk transitions.
 * - 3 mob-clear stages across the Starlight Bridge + 1 final boss stage (Memory of Thanatos).
 * - Duration targets: Solo < 10:00 (600s limit), Party < 15:00 (900s limit).
 * - Evasion: BOTH walk out of the red telegraph zone (click/tap ground or WASD/Arrows)
 *   AND press DODGE (Space / Shift / HUD button) for a quick dash + i-frames on cooldown.
 * - Revive: Party-only (3s channel, restores 30% HP, max 3/run). Solo death ends the run;
 *   if all party members fall simultaneously, the party wipes.
 * - Durable Object discipline: Solo = 100% local (zero WS messages, zero DO calls).
 *   Party = existing plaza party + event/3s party-only relay (zero setAlarm, zero room broadcast).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(root);
  else root.PGRaid = factory(root);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';

  var STAGES = [
    {
      name: 'Starlit Approach',
      astral: 1,
      boss: false,
      camps: 8,
      desc: 'Retribution Angels & Despair Phantoms guarding the outer causeway',
    },
    {
      name: 'Fallen Arcade',
      astral: 2,
      boss: false,
      camps: 8,
      desc: 'Despair Phantoms & Tower Watchers along the shattered arches',
    },
    {
      name: 'Runic Observatory',
      astral: 3,
      boss: false,
      camps: 8,
      wardens: 2,
      desc: 'Tower Watchers, Death Whisperers & Agony Demon wardens',
    },
    {
      name: 'Sanctuary of Thanatos',
      astral: 5,
      boss: true,
      camps: 0,
      desc: 'Memory of Thanatos & his celestial vanguard',
    },
  ];

  var SOLO_LIMIT_SECS = 600;   // 10:00
  var PARTY_LIMIT_SECS = 900;  // 15:00
  var BOSS_HP_MULT = 2.2;
  var ESCORT_HP_MULT = 1.4;

  var DODGE_CD = 3.5;
  var DODGE_DASH = 5.5;
  var DODGE_IFRAMES = 0.8;
  var DODGE_HOLD = 0.95;

  var TELEGRAPH_INTERVAL = 5.4;
  var TELEGRAPH_LIFE = 2.4;
  var TELEGRAPH_DMG_PCT = 0.32;
  var TELEGRAPH_SLAM_R = 5.2;
  var TELEGRAPH_BRAND_R = 3.8;

  var REVIVE_CHANNEL = 3.0;
  var REVIVE_HP_PCT = 0.30;
  var REVIVE_MAX = 3;
  var RAID_PER_DAY = 2;
  var SYNC_INTERVAL_MS = 3000;

  var REWARDS = {
    solo: { shards: 20, zeny: 500000, echo: 100 },
    party: { shards: 30, zeny: 750000, echo: 150 },
    defeat: { shards: 5, zeny: 0, echo: 0 },
    assist: { shards: 0, zeny: 0, echo: 0 },
  };

  function social() {
    return (root && root.PGSocial) || (typeof window !== 'undefined' && window.PGSocial) || null;
  }
  function socialSend(msg) {
    try {
      var soc = social();
      if (soc && typeof soc.send === 'function') return !!soc.send(msg);
    } catch (e) {}
    return false;
  }
  function myId() {
    try {
      var soc = social();
      if (soc && soc.app && soc.app.room && Number.isInteger(soc.app.id)) return soc.app.id;
    } catch (e) {}
    return 0;
  }
  function partyInfo() {
    try {
      var soc = social();
      var p = soc && soc.app && soc.app.party;
      if (p && Array.isArray(p.members) && p.members.length) return p;
    } catch (e) {}
    return null;
  }
  function partySize() {
    var p = partyInfo();
    return p ? p.members.length : 1;
  }
  function isPartyLeader() {
    var p = partyInfo();
    if (!p) return false;
    return p.leader === myId();
  }
  function hpScale(n) {
    var count = Math.max(1, Math.min(3, Math.floor(Number(n) || 1)));
    if (count === 1) return 1;
    if (count === 2) return 2.2;
    return 3.2;
  }

  function raidDay() {
    if (typeof trialDay === 'function') return trialDay();
    return new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10);
  }
  function raidState() {
    if (typeof S === 'undefined' || !S) return { day: raidDay(), used: 0, clears: 0, bestSolo: 0, bestParty: 0 };
    if (!S.raid || typeof S.raid !== 'object' || Array.isArray(S.raid)) {
      S.raid = { day: raidDay(), used: 0, clears: 0, bestSolo: 0, bestParty: 0 };
    }
    if (S.raid.day !== raidDay()) {
      S.raid.day = raidDay();
      S.raid.used = 0;
    }
    S.raid.used = Math.max(0, Math.min(RAID_PER_DAY, Math.floor(Number(S.raid.used) || 0)));
    S.raid.clears = Math.max(0, Math.floor(Number(S.raid.clears) || 0));
    return S.raid;
  }
  function raidLeftToday() {
    return Math.max(0, RAID_PER_DAY - raidState().used);
  }

  var raid = {
    on: false,
    mode: 'solo',
    raidId: '',
    seed: 0,
    owner: null,
    user: null,
    assistOnly: false,
    stage: 0,
    stageActive: false,
    transition: null,
    startedAt: 0,
    elapsed: 0,
    limitSecs: SOLO_LIMIT_SECS,
    dmg0: 0,
    home: null,
    dodgeCd: 0,
    iframes: 0,
    dead: false,
    revives: 0,
    reviveChannel: 0,
    reviveTargetId: null,
    telegraph: null,
    telegraphCd: 3.0,
    telegraphKind: 0,
    moveTarget: null,
    manualHold: 0,
    keys: { w: false, a: false, s: false, d: false },
    syncAt: 0,
    party: [],
    partyCount: 1,
    result: null,
    _lobbyMode: null,
    _internalNav: false,
  };

  /* ---------- 3D Red Telegraph & Ground Move Marker (reused, zero per-frame allocs) ---------- */
  var visuals = { group: null, disc: null, fill: null, ring: null, moveRing: null, sceneRef: null };

  function ensureVisuals() {
    if (typeof THREE === 'undefined' || typeof scene === 'undefined' || !scene) return null;
    if (visuals.group && visuals.sceneRef === scene) return visuals;
    disposeVisuals();
    try {
      var g = new THREE.Group();
      g.name = 'raidTelegraphGroup';
      g.visible = false;

      var discGeo = new THREE.CircleGeometry(1, 48);
      discGeo.rotateX(-Math.PI / 2);
      var discMat = new THREE.MeshBasicMaterial({
        color: 0xd92638,
        transparent: true,
        opacity: 0.22,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
      var disc = new THREE.Mesh(discGeo, discMat);

      var fillGeo = new THREE.CircleGeometry(1, 48);
      fillGeo.rotateX(-Math.PI / 2);
      var fillMat = new THREE.MeshBasicMaterial({
        color: 0xff3b4e,
        transparent: true,
        opacity: 0.36,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
      var fill = new THREE.Mesh(fillGeo, fillMat);
      fill.position.y = 0.005;

      var ringGeo = new THREE.RingGeometry(0.93, 1.0, 48);
      ringGeo.rotateX(-Math.PI / 2);
      var ringMat = new THREE.MeshBasicMaterial({
        color: 0xff5c6c,
        transparent: true,
        opacity: 0.92,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
      var ring = new THREE.Mesh(ringGeo, ringMat);
      ring.position.y = 0.01;

      g.add(disc);
      g.add(fill);
      g.add(ring);
      scene.add(g);

      var mGeo = new THREE.RingGeometry(0.42, 0.58, 28);
      mGeo.rotateX(-Math.PI / 2);
      var mMat = new THREE.MeshBasicMaterial({
        color: 0x76eaff,
        transparent: true,
        opacity: 0.85,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
      var moveRing = new THREE.Mesh(mGeo, mMat);
      moveRing.visible = false;
      scene.add(moveRing);

      visuals = { group: g, disc: disc, fill: fill, ring: ring, moveRing: moveRing, sceneRef: scene };
      return visuals;
    } catch (e) {
      return null;
    }
  }

  function syncVisuals() {
    var v = ensureVisuals();
    if (!v) return;
    var floorY = 0.14;
    try {
      if (typeof actorFloorY === 'function') floorY = actorFloorY(0, 0) + 0.025;
    } catch (e) {}
    if (raid.on && raid.telegraph) {
      var tel = raid.telegraph;
      var prog = Math.max(0.05, Math.min(1, tel.age / Math.max(0.1, tel.life)));
      v.group.visible = true;
      v.group.position.set(tel.x, floorY, tel.z);
      v.disc.scale.set(tel.r, 1, tel.r);
      v.ring.scale.set(tel.r, 1, tel.r);
      v.fill.scale.set(tel.r * prog, 1, tel.r * prog);
      v.ring.material.opacity = 0.72 + 0.28 * Math.abs(Math.sin(tel.age * 9));
    } else {
      v.group.visible = false;
    }
    if (raid.on && raid.moveTarget && raid.moveTarget.left > 0) {
      v.moveRing.visible = true;
      v.moveRing.position.set(raid.moveTarget.x, floorY + 0.01, raid.moveTarget.z);
    } else {
      v.moveRing.visible = false;
    }
  }

  function disposeVisuals() {
    try {
      if (visuals.group && visuals.sceneRef) visuals.sceneRef.remove(visuals.group);
      if (visuals.moveRing && visuals.sceneRef) visuals.sceneRef.remove(visuals.moveRing);
    } catch (e) {}
    visuals = { group: null, disc: null, fill: null, ring: null, moveRing: null, sceneRef: null };
  }

  /* ---------- Eligibility & Stage Spawning ---------- */
  function canEnter(opts) {
    opts = opts || {};
    if (typeof S === 'undefined' || !S) return { ok: false, why: 'Not signed in.' };
    if (!opts.allowAssist && raidLeftToday() <= 0 && !S.gm) {
      return { ok: false, why: 'No raid entries left today (2/day). Reset at daily rollover.' };
    }
    var open = true;
    try { open = typeof ascensionOpen === 'function' ? ascensionOpen(10) : true; } catch (e) { open = true; }
    if (!open && !S.gm) {
      return { ok: false, why: 'Requires a fourth-job class (Base Lv 150) — same gate as Astral Citadel.' };
    }
    if (typeof TRIAL !== 'undefined' && TRIAL && TRIAL.on) return { ok: false, why: 'Leave Endless Echo first.' };
    if (typeof JOB_RITE !== 'undefined' && JOB_RITE && JOB_RITE.on) return { ok: false, why: 'Finish your Crucible trial first.' };
    return { ok: true };
  }

  function setupAstralField(astralStage) {
    raid._internalNav = true;
    try {
      if (typeof astralJourney !== 'undefined') astralJourney = null;
      if (typeof astralOriginStage !== 'undefined') astralOriginStage = astralStage;
      if (typeof lastKey !== 'undefined') lastKey = '';
      S.mp = 10;
      S.lvl = astralStage;
      S.kl = 0;
      if (typeof pl !== 'undefined' && pl) {
        var entryZ = (typeof Z1 !== 'undefined' ? Z1 : 12) - 1.5;
        pl.x = 0;
        pl.z = entryZ;
        pl.wz = entryZ;
        pl.wx = null;
        pl.wt = 0;
        pl.run = false;
      }
      if (typeof ascensionRoot !== 'undefined' && ascensionRoot && typeof ASTRAL_FOCUS !== 'undefined') {
        var midZ = ((typeof Z0 !== 'undefined' ? Z0 : -14) + (typeof Z1 !== 'undefined' ? Z1 : 12)) / 2;
        ascensionRoot.position.z = midZ - ASTRAL_FOCUS[astralStage - 1];
      }
      if (typeof buildDeco === 'function' && typeof scene !== 'undefined' && scene) {
        try { buildDeco(10); } catch (e) {}
      }
      if (typeof BGM !== 'undefined' && BGM && typeof BGM.sync === 'function') {
        try { BGM.sync(10); } catch (e) {}
      }
    } finally {
      raid._internalNav = false;
    }
  }

  function spawnRaidStage(idx) {
    var st = STAGES[idx];
    if (!st || !raid.on) return;
    raid.stage = idx;
    raid.stageActive = true;
    raid.transition = null;
    raid.telegraph = null;
    raid.telegraphCd = st.boss ? 2.6 : 999;
    raid.moveTarget = null;
    raid.manualHold = 0;

    try {
      S.mp = 10;
      S.lvl = st.astral;
      S.kl = 0;

      var scale = hpScale(raid.mode === 'party' ? raid.partyCount : 1);

      if (st.boss) {
        if (typeof spawn === 'function') spawn();
        if (typeof camps !== 'undefined') camps.length = 0;
        if (typeof mobs !== 'undefined' && mobs) {
          for (var i = 0; i < mobs.length; i++) {
            var mult = mobs[i].boss ? (BOSS_HP_MULT * scale) : (ESCORT_HP_MULT * scale);
            mobs[i].hp = Math.max(1, Math.floor(mobs[i].hp * mult));
            mobs[i].max = mobs[i].hp;
            // Raid boss arena has no camp leash so dodging across the bridge never triggers leash-heal.
            mobs[i].hx = null;
            mobs[i].hz = null;
          }
        }
      } else {
        if (typeof spawn === 'function') spawn();
        // Trim to the stage's fixed camp count so clear = all camps defeated (no infinite refill).
        var keepCamps = st.camps || 8;
        if (typeof camps !== 'undefined' && Array.isArray(camps) && typeof mobs !== 'undefined' && Array.isArray(mobs)) {
          // Keep the packs closest to the hero's entry -> deep bridge in order.
          var packOrder = camps.slice().sort(function (a, b) { return b.z - a.z; }).slice(0, keepCamps);
          var allowed = new Set(packOrder.map(function (c) { return c.i; }));
          var kept = mobs.filter(function (m) { return allowed.has(m.pack); });
          mobs.length = 0;
          for (var j = 0; j < kept.length; j++) mobs.push(kept[j]);
          camps.length = 0;
        }
        // Stage 3 adds Agony Demon wardens from Astral stage 4 at the far end of the observatory.
        if (st.wardens && typeof fieldOf === 'function' && typeof minionDef === 'function' && typeof mobs !== 'undefined') {
          var prevLvl = S.lvl;
          S.lvl = 4;
          var f4 = fieldOf(10, 4);
          var demonDef = (f4 && f4.mobs && f4.mobs.find(function (x) { return x.n === 'Agony Demon'; })) || null;
          for (var w = 0; w < st.wardens; w++) {
            var baseMob = minionDef(90 + w);
            if (demonDef) Object.assign(baseMob, demonDef);
            var st4 = typeof ascensionCombatStats === 'function' ? ascensionCombatStats(10, 4, false) : {};
            baseMob.hp = st4.hp || baseMob.hp;
            baseMob.max = baseMob.hp;
            baseMob.atk = st4.atk || baseMob.atk;
            baseMob.x = (w === 0 ? -2.2 : 2.2);
            baseMob.z = -9.5;
            baseMob.hx = baseMob.x;
            baseMob.hz = baseMob.z;
            mobs.push(baseMob);
          }
          S.lvl = prevLvl;
        }
        if (typeof mobs !== 'undefined' && mobs) {
          for (var mIdx = 0; mIdx < mobs.length; mIdx++) {
            mobs[mIdx].hp = Math.max(1, Math.floor(mobs[mIdx].hp * scale));
            mobs[mIdx].max = mobs[mIdx].hp;
          }
        }
        if (typeof activePack !== 'undefined' && typeof nearestPack === 'function') activePack = nearestPack();
        if (typeof mob !== 'undefined' && typeof packMob === 'function') mob = packMob();
        if (typeof resetBossSkill === 'function') resetBossSkill();
      }
      if (typeof ui === 'function') ui();
    } catch (e) {}
    syncPartySelf(true);
    updateHud(true);
  }

  /* ---------- Start / Stop / Lifecycle ---------- */
  function start(mode, opts) {
    opts = opts || {};
    if (raid.on) return false;
    var gate = canEnter();
    if (!gate.ok) {
      if (typeof log === 'function') log(gate.why, 'r0');
      return false;
    }
    if (mode === 'party') {
      var p = partyInfo();
      if (!p || p.members.length < 2) {
        if (typeof log === 'function') log('Party raid requires 2–3 real players in a Fountain Plaza party.', 'r0');
        return false;
      }
      if (!isPartyLeader()) {
        if (typeof log === 'function') log('Only the party leader can launch the Party Raid.', 'r0');
        return false;
      }
      var sent = socialSend({ type: 'raid_start' });
      if (!sent) {
        if (typeof log === 'function') log('Not connected to Fountain Plaza — reconnect or start a Solo raid.', 'r0');
        return false;
      }
      return 'waiting';
    }
    beginRun('solo', { seed: opts.seed || ((Math.random() * 1e9) | 0), partyMembers: null });
    return true;
  }

  function beginRun(mode, info) {
    info = info || {};
    var gate = canEnter({ allowAssist: mode === 'party' });
    if (!gate.ok) return false;

    var inPlaza = false;
    try {
      inPlaza = !!(typeof document !== 'undefined' && document.body && document.body.classList.contains('social-open'));
      if (inPlaza) {
        var soc = social();
        if (soc && typeof soc.setRaidSuspend === 'function') soc.setRaidSuspend(true);
        else document.body.classList.remove('social-open');
      }
    } catch (e) {}

    // Close any open field sub-windows so the raid view starts clean.
    try {
      if (typeof tabs !== 'undefined' && Array.isArray(tabs) && tabs.length) {
        tabs.length = 0;
        if (typeof renderWin === 'function') renderWin();
      }
    } catch (e) {}

    raid.on = true;
    raid.mode = mode === 'party' ? 'party' : 'solo';
    raid.raidId = info.raidId || ('raid-' + Date.now());
    raid.seed = info.seed || 0;
    raid.owner = typeof S !== 'undefined' ? S : null;
    raid.user = typeof currentUser !== 'undefined' ? currentUser : null;
    raid.startedAt = Date.now();
    raid.elapsed = 0;
    raid.limitSecs = raid.mode === 'party' ? PARTY_LIMIT_SECS : SOLO_LIMIT_SECS;
    raid.dodgeCd = 0;
    raid.iframes = 0;
    raid.dead = false;
    raid.revives = 0;
    raid.reviveChannel = 0;
    raid.reviveTargetId = null;
    raid.telegraph = null;
    raid.telegraphCd = 3.0;
    raid.telegraphKind = 0;
    raid.moveTarget = null;
    raid.manualHold = 0;
    raid.keys = { w: false, a: false, s: false, d: false };
    raid.result = null;
    raid.syncAt = 0;
    raid.transition = null;

    var members = Array.isArray(info.members) && info.members.length ? info.members : (partyInfo() && partyInfo().members) || [];
    raid.partyCount = raid.mode === 'party' ? Math.max(2, Math.min(3, members.length || 2)) : 1;

    var selfServerId = myId();
    if (raid.mode === 'party' && members.length) {
      raid.party = members.map(function (m) {
        var isMe = m.id === selfServerId;
        return {
          id: m.id,
          name: m.name || (isMe ? (S && S.name) || 'You' : 'Teammate'),
          cls: isMe && S ? S.cls || '' : (m.cls || ''),
          hp: 100,
          maxHp: 100,
          dps: 0,
          dmg: 0,
          stage: 0,
          dead: false,
          left: false,
          self: isMe,
        };
      });
    } else {
      raid.party = [{
        id: selfServerId,
        name: (typeof S !== 'undefined' && S && (S.name || currentUser)) || 'You',
        cls: (typeof S !== 'undefined' && S && S.cls) || '',
        hp: 100,
        maxHp: 100,
        dps: 0,
        dmg: 0,
        stage: 0,
        dead: false,
        left: false,
        self: true,
      }];
    }

    try {
      raid.home = {
        mp: S.mp,
        lvl: S.lvl,
        hp: S.hp,
        kl: S.kl,
        inPlaza: inPlaza,
      };
      raid.dmg0 = Number(S.dmg) || 0;
      S.hp = typeof maxHp === 'function' ? maxHp() : S.hp;
      var leftBefore = raidLeftToday();
      raid.assistOnly = leftBefore <= 0 && !S.gm;
      if (!raid.assistOnly) {
        raidState().used = Math.min(RAID_PER_DAY, raidState().used + 1);
      }
    } catch (e) {}

    hideLobby();
    hideResult();
    if (typeof document !== 'undefined' && document.body) {
      document.body.classList.add('raid-open', 'raid-' + raid.mode);
    }
    setupAstralField(STAGES[0].astral);
    spawnRaidStage(0);
    buildHudDom();
    updateHud(true);
    if (typeof save === 'function') try { save(); } catch (e) {}
    if (typeof log === 'function') {
      log('Astral Raid (' + (raid.mode === 'party' ? 'Party' : 'Solo') + ') started — clear 3 stages, then defeat Memory of Thanatos!', 'r4');
    }
    return true;
  }

  function endRun(cleared, reason, fromRemote) {
    if (!raid.on) return;
    var mode = raid.mode;
    var secs = Math.max(1, Math.round(raid.elapsed || ((Date.now() - raid.startedAt) / 1000)));
    var totalDmg = 0;
    try { totalDmg = Math.max(0, (Number(S && S.dmg) || 0) - raid.dmg0); } catch (e) {}
    var dps = Math.round(totalDmg / Math.max(1, secs));

    raid.on = false;
    raid.stageActive = false;
    raid.transition = null;
    raid.telegraph = null;
    raid.moveTarget = null;
    raid.dead = false;
    raid.reviveChannel = 0;
    raid.keys = { w: false, a: false, s: false, d: false };
    syncVisuals();

    var pay = raid.assistOnly
      ? REWARDS.assist
      : (cleared ? (mode === 'party' ? REWARDS.party : REWARDS.solo) : (reason === 'left' ? REWARDS.assist : REWARDS.defeat));

    try {
      if (typeof S !== 'undefined' && S && raid.owner === S) {
        if (pay.shards) {
          if (!Array.isArray(S.ascensionMat)) S.ascensionMat = [0, 0];
          S.ascensionMat[0] = (Number(S.ascensionMat[0]) || 0) + pay.shards;
        }
        if (pay.zeny) {
          if (typeof earnZeny === 'function') earnZeny(pay.zeny);
          else S.zeny = (Number(S.zeny) || 0) + pay.zeny;
        }
        if (pay.echo) S.shards = (Number(S.shards) || 0) + pay.echo;
        if (cleared) {
          var st = raidState();
          st.clears = (st.clears || 0) + 1;
          if (mode === 'party') st.bestParty = st.bestParty ? Math.min(st.bestParty, secs) : secs;
          else st.bestSolo = st.bestSolo ? Math.min(st.bestSolo, secs) : secs;
        }
      }
    } catch (e) {}

    var partySummary = raid.party.map(function (p) {
      return { name: p.name, cls: p.cls, dps: p.self ? dps : (p.dps || 0), self: !!p.self };
    });

    raid.result = {
      cleared: !!cleared,
      reason: reason || '',
      secs: secs,
      dps: dps,
      totalDmg: totalDmg,
      pay: pay,
      mode: mode,
      assistOnly: !!raid.assistOnly,
      party: partySummary,
    };

    if (mode === 'party' && !fromRemote) {
      socialSend({
        type: 'raid_end',
        raidId: raid.raidId,
        cleared: !!cleared,
        reason: reason || (cleared ? 'boss_down' : 'failed'),
        secs: secs,
        dps: dps,
      });
    }

    // Restore field & optional Plaza view.
    if (typeof document !== 'undefined' && document.body) {
      document.body.classList.remove('raid-open', 'raid-solo', 'raid-party');
    }
    var hud = el('raidHud');
    if (hud) hud.hidden = true;

    try {
      if (raid.home && typeof S !== 'undefined' && S && raid.owner === S) {
        raid._internalNav = true;
        S.mp = raid.home.mp;
        S.lvl = raid.home.lvl;
        S.hp = typeof maxHp === 'function' ? maxHp() : Math.max(1, raid.home.hp || 1);
        S.kl = raid.home.kl || 0;
        if (typeof lastKey !== 'undefined') lastKey = '';
        if (typeof gotoField === 'function') gotoField(S.mp, S.lvl);
        else if (typeof spawn === 'function') spawn();
        raid._internalNav = false;
        if (raid.home.inPlaza) {
          var soc = social();
          if (soc && typeof soc.setRaidSuspend === 'function') soc.setRaidSuspend(false);
        }
      }
    } catch (e) {
      raid._internalNav = false;
    }

    if (typeof save === 'function') try { save(); } catch (e) {}
    if (typeof ui === 'function') try { ui(); } catch (e) {}
    renderResult();
  }

  function leave() {
    if (raid.on) {
      endRun(false, 'left', false);
      return;
    }
    if (typeof document !== 'undefined' && document.body) {
      document.body.classList.remove('raid-open', 'raid-solo', 'raid-party');
    }
    hideLobby();
    hideResult();
  }

  /* ---------- Evasion: Walk Out (Ground Click + WASD/Arrows) & DODGE Button ---------- */
  function clampX(x) {
    var bx = (typeof BX_ !== 'undefined' ? BX_ : 12) - 0.8;
    return Math.max(-bx, Math.min(bx, x));
  }
  function clampZ(z) {
    var z0 = (typeof Z0 !== 'undefined' ? Z0 : -14) + 1.0;
    var z1 = (typeof Z1 !== 'undefined' ? Z1 : 12) - 0.8;
    return Math.max(z0, Math.min(z1, z));
  }

  function setGroundMove(worldX, worldZ) {
    if (!raid.on || raid.dead) return false;
    var x = clampX(worldX);
    var z = clampZ(worldZ);
    raid.moveTarget = { x: x, z: z, left: 2.6 };
    raid.manualHold = 2.6;
    syncVisuals();
    return true;
  }

  function handleCanvasClick(clientX, clientY) {
    if (!raid.on || raid.dead) return false;
    if (typeof THREE === 'undefined' || typeof cam === 'undefined' || typeof R === 'undefined' || !R || !cam) return false;
    try {
      var rect = R.domElement.getBoundingClientRect();
      if (!rect.width || !rect.height) return false;
      var ndcX = ((clientX - rect.left) / rect.width) * 2 - 1;
      var ndcY = -((clientY - rect.top) / rect.height) * 2 + 1;
      var ray = new THREE.Raycaster();
      ray.setFromCamera(new THREE.Vector2(ndcX, ndcY), cam);
      var floorY = typeof actorFloorY === 'function' ? actorFloorY() : 0.12;
      var dy = ray.ray.direction.y;
      if (Math.abs(dy) < 0.001) return false;
      var dist = (floorY - ray.ray.origin.y) / dy;
      if (dist <= 0 || dist > 160) return false;
      var hitX = ray.ray.origin.x + ray.ray.direction.x * dist;
      var hitZ = ray.ray.origin.z + ray.ray.direction.z * dist;
      return setGroundMove(hitX, hitZ);
    } catch (e) {
      return false;
    }
  }

  function onKey(key, down) {
    if (!raid.on) return false;
    var k = String(key || '').toLowerCase();
    if (k === ' ' || k === 'spacebar' || k === 'shift') {
      if (down) dodge();
      return true;
    }
    if (k === 'w' || k === 'arrowup') { raid.keys.w = !!down; return true; }
    if (k === 's' || k === 'arrowdown') { raid.keys.s = !!down; return true; }
    if (k === 'a' || k === 'arrowleft') { raid.keys.a = !!down; return true; }
    if (k === 'd' || k === 'arrowright') { raid.keys.d = !!down; return true; }
    if (k === 'r' && down && raid.mode === 'party') {
      revive();
      return true;
    }
    return false;
  }

  // Called by index.html update(dt): returns {x, z} when player is manually walking or holding dodge spot.
  function overrideMove(dt) {
    if (!raid.on || raid.dead || typeof pl === 'undefined' || !pl) return null;
    var ix = (raid.keys.d ? 1 : 0) - (raid.keys.a ? 1 : 0);
    var iz = (raid.keys.w ? 1 : 0) - (raid.keys.s ? 1 : 0);
    if (ix !== 0 || iz !== 0) {
      var angle = typeof az === 'number' ? az : 0;
      // Camera sits at (+sin(az), +cos(az)) looking toward origin; screen-forward is (-sin(az), -cos(az)),
      // screen-right is (+cos(az), -sin(az)).
      var fx = -Math.sin(angle), fz = -Math.cos(angle);
      var rx = Math.cos(angle), rz = -Math.sin(angle);
      var wx = fx * iz + rx * ix;
      var wz = fz * iz + rz * ix;
      var len = Math.hypot(wx, wz) || 1;
      wx /= len;
      wz /= len;
      raid.moveTarget = null;
      raid.manualHold = 0.75;
      return { x: clampX(pl.x + wx * 4.5), z: clampZ(pl.z + wz * 4.5) };
    }
    if (raid.moveTarget && raid.moveTarget.left > 0) {
      raid.moveTarget.left = Math.max(0, raid.moveTarget.left - dt);
      var d = Math.hypot(raid.moveTarget.x - pl.x, raid.moveTarget.z - pl.z);
      // Hold position at clicked point while a red telegraph is active so auto-combat doesn't yank back inside.
      if (d < 0.25 && !raid.telegraph) {
        raid.moveTarget = null;
      } else {
        return { x: raid.moveTarget.x, z: raid.moveTarget.z };
      }
    }
    if (raid.manualHold > 0) {
      raid.manualHold = Math.max(0, raid.manualHold - dt);
      return { x: pl.x, z: pl.z };
    }
    return null;
  }

  function dodge() {
    if (!raid.on || raid.dead) return false;
    if (raid.dodgeCd > 0) return false;
    if (typeof pl === 'undefined' || !pl) return false;
    try {
      var dx = 0, dz = 1;
      // Priority 1: if any keyboard direction is held, dash that way!
      var ix = (raid.keys.d ? 1 : 0) - (raid.keys.a ? 1 : 0);
      var iz = (raid.keys.w ? 1 : 0) - (raid.keys.s ? 1 : 0);
      if (ix !== 0 || iz !== 0) {
        var angle = typeof az === 'number' ? az : 0;
        var wx = -Math.sin(angle) * iz + Math.cos(angle) * ix;
        var wz = -Math.cos(angle) * iz - Math.sin(angle) * ix;
        var l1 = Math.hypot(wx, wz) || 1;
        dx = wx / l1;
        dz = wz / l1;
      } else if (raid.telegraph) {
        // Priority 2: dash directly away from the active red telegraph center!
        var vx = pl.x - raid.telegraph.x;
        var vz = pl.z - raid.telegraph.z;
        var d = Math.hypot(vx, vz);
        if (d > 0.15) {
          dx = vx / d;
          dz = vz / d;
        } else {
          // Standing dead-center on Soul Brand: dash toward bridge center/camera side.
          dx = pl.x > 0 ? -0.7 : 0.7;
          dz = pl.z > 0 ? -0.7 : 0.7;
        }
      } else {
        var boss = typeof mobs !== 'undefined' && mobs && mobs.find(function (m) { return m.boss && m.hp > 0; });
        if (boss) {
          var bx = pl.x - boss.x, bz = pl.z - boss.z, bd = Math.hypot(bx, bz) || 1;
          dx = bx / bd;
          dz = bz / bd;
        }
      }

      var nx = clampX(pl.x + dx * DODGE_DASH);
      var nz = clampZ(pl.z + dz * DODGE_DASH);
      // If wall-clamped into a short dash while inside a telegraph, try the opposite lateral direction.
      if (raid.telegraph && Math.hypot(nx - raid.telegraph.x, nz - raid.telegraph.z) < raid.telegraph.r + 0.4) {
        var altX = clampX(pl.x - dx * DODGE_DASH);
        var altZ = clampZ(pl.z - dz * DODGE_DASH);
        if (Math.hypot(altX - raid.telegraph.x, altZ - raid.telegraph.z) > Math.hypot(nx - raid.telegraph.x, nz - raid.telegraph.z)) {
          nx = altX;
          nz = altZ;
        }
      }
      pl.x = nx;
      pl.z = nz;
      pl.ry = -Math.atan2(dz, dx);
      raid.dodgeCd = DODGE_CD;
      raid.iframes = DODGE_IFRAMES;
      raid.moveTarget = { x: nx, z: nz, left: DODGE_HOLD };
      raid.manualHold = DODGE_HOLD;
      if (typeof engageTgt !== 'undefined') engageTgt = null;
      if (typeof addFloat === 'function') addFloat(pl.x, 2.6, pl.z, 'DODGE!', '#76eaff', false, 'evade');
      syncVisuals();
      updateHud(true);
      return true;
    } catch (e) {
      return false;
    }
  }

  /* ---------- Party-Only Revive ---------- */
  function revive() {
    if (!raid.on || raid.mode !== 'party' || raid.dead) return false;
    if (raid.revives >= REVIVE_MAX) return false;
    if (raid.reviveChannel > 0) return false;
    var target = raid.party.find(function (p) { return !p.self && p.dead && !p.left; });
    if (!target) return false;
    raid.reviveChannel = REVIVE_CHANNEL;
    raid.reviveTargetId = target.id;
    if (typeof log === 'function') log('Channeling revive on ' + target.name + ' (3.0s)…', 'r4');
    updateHud(true);
    return true;
  }

  /* ---------- Boss Telegraph Tick ---------- */
  function tickTelegraph(dt) {
    var st = STAGES[raid.stage];
    if (!st || !st.boss || !raid.stageActive) {
      raid.telegraph = null;
      return;
    }
    var boss = typeof mobs !== 'undefined' && mobs && mobs.find(function (m) { return m.boss && m.hp > 0; });
    if (!boss) {
      raid.telegraph = null;
      return;
    }
    if (!raid.telegraph) {
      raid.telegraphCd -= dt;
      if (raid.telegraphCd <= 0) {
        var isBrand = (raid.telegraphKind++ % 2) === 1;
        var tx = isBrand && typeof pl !== 'undefined' && pl ? pl.x : boss.x;
        var tz = isBrand && typeof pl !== 'undefined' && pl ? pl.z : boss.z;
        raid.telegraph = {
          name: isBrand ? 'Soul Brand' : 'Crimson Judgment',
          kind: isBrand ? 'brand' : 'slam',
          x: tx,
          z: tz,
          r: isBrand ? TELEGRAPH_BRAND_R : TELEGRAPH_SLAM_R,
          age: 0,
          life: TELEGRAPH_LIFE,
        };
      }
      return;
    }
    // Slam tracks boss; Soul Brand locks onto the floor coordinates where it was cast.
    if (raid.telegraph.kind === 'slam') {
      raid.telegraph.x = boss.x;
      raid.telegraph.z = boss.z;
    }
    raid.telegraph.age += dt;
    if (raid.telegraph.age >= raid.telegraph.life) {
      var landed = raid.telegraph;
      raid.telegraph = null;
      raid.telegraphCd = TELEGRAPH_INTERVAL;
      if (!raid.dead && typeof pl !== 'undefined' && pl && typeof S !== 'undefined' && S) {
        var dist = Math.hypot(pl.x - landed.x, pl.z - landed.z);
        if (dist <= landed.r) {
          if (raid.iframes > 0) {
            if (typeof addFloat === 'function') addFloat(pl.x, 2.5, pl.z, 'EVADED!', '#76eaff', false, 'evade');
          } else {
            var mhp = typeof maxHp === 'function' ? maxHp() : 1000;
            var dmg = Math.max(1, Math.floor(mhp * TELEGRAPH_DMG_PCT));
            S.hp = Math.max(0, S.hp - dmg);
            if (typeof hitAnim !== 'undefined') hitAnim = 1;
            if (typeof shake !== 'undefined' && S.cameraShake !== false) shake = Math.max(shake, 8);
            if (typeof damageFloat === 'function') damageFloat(pl.x, 2.4, pl.z, dmg, true, true);
            if (typeof log === 'function') {
              log(landed.name + ' struck you for ' + dmg.toLocaleString() + '! Move out of the red zone or press DODGE.', 'r0');
            }
          }
        } else if (dist <= landed.r + 3.5) {
          if (typeof addFloat === 'function') addFloat(pl.x, 2.5, pl.z, 'EVADED', '#7dffb3', false, 'evade');
        }
      }
    }
  }

  /* ---------- Teammate Co-op Assist Damage ---------- */
  function tickPartyAssist(dt) {
    if (raid.mode !== 'party' || !raid.stageActive) return;
    if (typeof mobs === 'undefined' || !mobs || !mobs.length) return;
    var allyDps = 0;
    for (var i = 0; i < raid.party.length; i++) {
      var p = raid.party[i];
      if (!p.self && !p.dead && !p.left && p.dps > 0 && p.stage >= raid.stage) {
        allyDps += p.dps;
      }
    }
    if (allyDps <= 0) return;
    var target = (typeof mob !== 'undefined' && mob && mobs.includes(mob) && mob.hp > 0)
      ? mob
      : (mobs.find(function (m) { return m.boss && m.hp > 0; }) || mobs[0]);
    if (!target || target.hp <= 0) return;
    var dealt = Math.max(1, Math.round(allyDps * dt));
    target.hp -= dealt;
    if (target.hp <= 0 && typeof kill === 'function') {
      kill(target);
    }
  }

  /* ---------- Main Per-Frame Raid Tick ---------- */
  function tick(dt) {
    if (!raid.on) return false;
    // Account / character switch safety guard.
    if ((typeof S !== 'undefined' && S !== raid.owner) || (typeof currentUser !== 'undefined' && currentUser !== raid.user)) {
      raid.on = false;
      disposeVisuals();
      if (typeof document !== 'undefined' && document.body) {
        document.body.classList.remove('raid-open', 'raid-solo', 'raid-party');
      }
      var h = el('raidHud');
      if (h) h.hidden = true;
      return false;
    }

    var step = Math.max(0, Math.min(0.25, Number(dt) || 0));
    raid.elapsed += step;
    raid.dodgeCd = Math.max(0, raid.dodgeCd - step);
    raid.iframes = Math.max(0, raid.iframes - step);

    // Time limit check (Solo 10:00 / Party 15:00).
    if (raid.elapsed >= raid.limitSecs) {
      endRun(false, 'Time limit reached (' + Math.floor(raid.limitSecs / 60) + ':00).');
      return true;
    }

    // Revive channel progress.
    if (raid.reviveChannel > 0) {
      if (raid.dead) {
        raid.reviveChannel = 0;
        raid.reviveTargetId = null;
      } else {
        raid.reviveChannel -= step;
        if (raid.reviveChannel <= 0) {
          raid.reviveChannel = 0;
          var target = raid.party.find(function (p) { return p.id === raid.reviveTargetId && p.dead && !p.left; }) ||
                       raid.party.find(function (p) { return !p.self && p.dead && !p.left; });
          raid.reviveTargetId = null;
          if (target) {
            target.dead = false;
            target.hp = Math.max(1, Math.floor(target.maxHp * REVIVE_HP_PCT));
            raid.revives++;
            socialSend({ type: 'raid_revive', raidId: raid.raidId, target: target.id });
            if (typeof log === 'function') log('Revived ' + target.name + '! (' + (REVIVE_MAX - raid.revives) + ' revives left)', 'r4');
          }
          updateHud(true);
        }
      }
    }

    // Boss red telegraph zone.
    tickTelegraph(step);

    // Teammate shared DPS contribution.
    tickPartyAssist(step);

    // Player death & party wipe check.
    if (typeof S !== 'undefined' && S) {
      if (raid.dead) {
        S.hp = 0;
      } else if (S.hp <= 0) {
        if (raid.mode === 'solo') {
          endRun(false, 'You were defeated — solo runs have no revive.');
          return true;
        }
        raid.dead = true;
        raid.reviveChannel = 0;
        raid.moveTarget = null;
        S.hp = 0;
        syncPartySelf(true);
        if (checkPartyWipe()) {
          endRun(false, 'All party members fell — the raid wiped.');
          return true;
        }
        if (typeof log === 'function') log('You are down! A living teammate can channel REVIVE (3s).', 'r0');
        updateHud(true);
      }
    }

    // Stage transition walk (waits in game-time for startAstralJourney to finish).
    if (raid.transition) {
      var walking = typeof astralJourney !== 'undefined' && !!astralJourney;
      if (!walking) {
        raid.transition.wait -= step;
        if (raid.transition.wait <= 0) {
          var nextIdx = raid.transition.next;
          raid.transition = null;
          spawnRaidStage(nextIdx);
        }
      }
    } else if (raid.stageActive && typeof mobs !== 'undefined' && Array.isArray(mobs) && mobs.length === 0) {
      raid.stageActive = false;
      raid.telegraph = null;
      if (raid.stage >= STAGES.length - 1) {
        endRun(true, 'Memory of Thanatos defeated!');
        return true;
      }
      var next = raid.stage + 1;
      var fromAstral = STAGES[raid.stage].astral;
      var toAstral = STAGES[next].astral;
      var startedWalk = false;
      if (typeof startAstralJourney === 'function' && fromAstral !== toAstral) {
        startedWalk = !!startAstralJourney(fromAstral, toAstral);
      }
      raid.transition = { next: next, wait: startedWalk ? 0.2 : 0.35 };
      if (typeof log === 'function') {
        log('Stage ' + (raid.stage + 1) + ' cleared! Advancing to ' + STAGES[next].name + '…', 'r4');
      }
      syncPartySelf(true);
      updateHud(true);
    }

    // Keep self stats fresh locally; relay to party every 3s.
    updateSelfEntry();
    if (raid.mode === 'party' && Date.now() - raid.syncAt >= SYNC_INTERVAL_MS) {
      syncPartySelf(false);
    }

    syncVisuals();
    if (!raid._hudAt || Date.now() - raid._hudAt >= 200) {
      raid._hudAt = Date.now();
      updateHud(false);
    }
    return true;
  }

  function checkPartyWipe() {
    if (raid.mode !== 'party') return raid.dead;
    var active = raid.party.filter(function (p) { return !p.left; });
    if (!active.length) return true;
    return active.every(function (p) { return p.dead; });
  }

  function updateSelfEntry() {
    var me = raid.party.find(function (p) { return p.self; });
    if (!me) {
      me = { id: myId(), name: (S && S.name) || 'You', cls: (S && S.cls) || '', self: true };
      raid.party.unshift(me);
    }
    if (typeof S !== 'undefined' && S) {
      me.name = S.name || (typeof currentUser === 'string' && currentUser) || me.name || 'You';
      me.cls = S.cls || me.cls || '';
      me.maxHp = typeof maxHp === 'function' ? Math.max(1, maxHp()) : Math.max(1, me.maxHp || 1);
      me.hp = raid.dead ? 0 : Math.max(0, Math.min(me.maxHp, Number(S.hp) || 0));
      var dmg = Math.max(0, (Number(S.dmg) || 0) - raid.dmg0);
      me.dmg = dmg;
      me.dps = raid.elapsed >= 1 ? Math.round(dmg / raid.elapsed) : 0;
      me.stage = raid.stage;
      me.dead = !!raid.dead;
    }
    return me;
  }

  function syncPartySelf(force) {
    var me = updateSelfEntry();
    raid.syncAt = Date.now();
    if (raid.mode !== 'party') return;
    socialSend({
      type: 'raid_sync',
      raidId: raid.raidId,
      hp: me.hp,
      maxHp: me.maxHp,
      dps: me.dps,
      stage: me.stage,
      dead: me.dead,
      cls: me.cls,
      force: !!force,
    });
  }

  /* ---------- Party WebSocket Handlers (called by assets/social.js) ---------- */
  function onStarted(msg) {
    if (!msg || raid.on) return;
    beginRun('party', {
      raidId: msg.raidId || '',
      seed: msg.seed || 0,
      members: Array.isArray(msg.members) ? msg.members : [],
    });
  }

  function onSync(msg) {
    if (!raid.on || raid.mode !== 'party' || !msg) return;
    var fromId = Number(msg.fromId);
    if (!Number.isInteger(fromId) || fromId === myId()) return;
    var entry = raid.party.find(function (p) { return p.id === fromId && !p.self; });
    if (!entry) {
      entry = { id: fromId, name: msg.name || 'Teammate', self: false, left: false };
      raid.party.push(entry);
    }
    if (msg.name) entry.name = msg.name;
    if (msg.cls) entry.cls = msg.cls;
    entry.maxHp = Math.max(1, Math.floor(Number(msg.maxHp) || 1));
    entry.hp = Math.max(0, Math.min(entry.maxHp, Math.floor(Number(msg.hp) || 0)));
    entry.dps = Math.max(0, Math.floor(Number(msg.dps) || 0));
    entry.stage = Math.max(0, Math.min(STAGES.length - 1, Math.floor(Number(msg.stage) || 0)));
    entry.dead = !!msg.dead;
    if (checkPartyWipe()) {
      endRun(false, 'All party members fell — the raid wiped.', true);
      return;
    }
    updateHud(true);
  }

  function onRevive(msg) {
    if (!raid.on || raid.mode !== 'party' || !msg) return;
    var targetId = Number(msg.target);
    var entry = raid.party.find(function (p) { return p.id === targetId; });
    if (entry) {
      entry.dead = false;
      entry.hp = Math.max(1, Math.floor(entry.maxHp * REVIVE_HP_PCT));
    }
    if ((entry && entry.self) || targetId === myId()) {
      if (raid.dead) {
        raid.dead = false;
        raid.iframes = 2.0;
        if (typeof S !== 'undefined' && S) {
          var mhp = typeof maxHp === 'function' ? maxHp() : 1000;
          S.hp = Math.max(1, Math.ceil(mhp * REVIVE_HP_PCT));
        }
        if (typeof pl !== 'undefined' && pl && typeof addFloat === 'function') {
          addFloat(pl.x, 2.8, pl.z, 'REVIVED!', '#ffd23f', true);
        }
        if (typeof log === 'function') log((msg.fromName || 'A teammate') + ' revived you at 30% HP!', 'r4');
        syncPartySelf(true);
      }
    }
    updateHud(true);
  }

  function onEnded(msg) {
    if (!raid.on || raid.mode !== 'party' || !msg) return;
    if (msg.cleared) {
      endRun(true, 'Memory of Thanatos defeated!', true);
      return;
    }
    if (msg.reason === 'left' || msg.reason === 'disconnect') {
      var leaver = raid.party.find(function (p) { return p.id === msg.fromId && !p.self; });
      if (leaver) {
        leaver.left = true;
        leaver.dead = true;
        leaver.dps = 0;
        if (typeof log === 'function') log((leaver.name || 'A teammate') + ' left the raid.', 'r0');
      }
      if (checkPartyWipe()) {
        endRun(false, 'All remaining party members fell — the raid ended.', true);
      } else {
        updateHud(true);
      }
      return;
    }
    if (msg.reason && String(msg.reason).indexOf('wipe') >= 0) {
      endRun(false, 'All party members fell — the raid wiped.', true);
    }
  }

  function onError(msg) {
    if (msg && msg.message && typeof log === 'function') log(msg.message, 'r0');
  }

  /* ---------- Formatting & UI ---------- */
  function el(id) {
    return typeof document !== 'undefined' ? document.getElementById(id) : null;
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function shortNum(n) {
    var v = Math.max(0, Math.round(Number(n) || 0));
    if (v >= 1e9) return (v / 1e9).toFixed(2) + 'B';
    if (v >= 1e6) return (v / 1e6).toFixed(2) + 'M';
    if (v >= 1e4) return (v / 1e3).toFixed(1) + 'K';
    return v.toLocaleString();
  }
  function fmtClock(sec) {
    var s = Math.max(0, Math.floor(Number(sec) || 0));
    return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
  }

  function showLobby() {
    var lobby = el('raidLobby');
    if (!lobby) return;
    if (raid.on) return;
    if (!raid._lobbyMode) {
      raid._lobbyMode = partySize() >= 2 ? 'party' : 'solo';
    }
    lobby.hidden = false;
    renderLobby();
  }
  function hideLobby() {
    var lobby = el('raidLobby');
    if (lobby) lobby.hidden = true;
  }

  function renderLobby() {
    var body = el('raidLobbyBody');
    if (!body) return;
    var gate = canEnter();
    var left = raidLeftToday();
    var st = raidState();
    var p = partyInfo();
    var ps = p ? p.members.length : 1;
    var inParty = ps >= 2;
    var leader = isPartyLeader();
    var mode = raid._lobbyMode || (inParty ? 'party' : 'solo');

    var stagesHtml = STAGES.map(function (s, i) {
      return '<li><span class="raid-stage-num">' + (i + 1) + '</span><div><b>' + esc(s.name) +
        (s.boss ? ' <em>BOSS</em>' : '') + '</b><small>' + esc(s.desc) + '</small></div></li>';
    }).join('');

    var partyStatusHtml = '';
    if (mode === 'party') {
      if (inParty) {
        var names = p.members.map(function (m) {
          return '<span class="raid-member-pill' + (m.id === p.leader ? ' is-leader' : '') + '">' +
            (m.id === p.leader ? '👑 ' : '') + esc(m.name) + '</span>';
        }).join('');
        partyStatusHtml = '<div class="raid-party-box"><div class="raid-party-pills">' + names + '</div>' +
          '<small>' + (leader
            ? 'Party ready (' + ps + '/3 players). Press Start Party Raid to bring everyone into Astral Raid together.'
            : 'Waiting for party leader to launch the raid — you will enter automatically.') + '</small></div>';
      } else {
        partyStatusHtml = '<div class="raid-party-box is-empty"><small>Party mode requires <b>2–3 real players</b> in a Fountain Plaza party (no AI companions).</small>' +
          '<button type="button" id="raidOpenPlazaBtn" class="raid-secondary-btn">👥 Open Fountain Plaza Party</button></div>';
      }
    } else {
      partyStatusHtml = '<div class="raid-party-box"><small><b>Solo mode:</b> just your character on the Starlight Bridge. Solo death ends the run immediately (no revive). Zero server traffic.</small></div>';
    }

    var canStartBtn = gate.ok && (mode === 'solo' || (inParty && leader));
    var startLabel = mode === 'party'
      ? (!inParty ? 'Need 2–3 Party Players' : (!leader ? 'Waiting for Party Leader…' : '⚔ Start Party Raid'))
      : '⚔ Start Solo Raid';

    var records = [];
    if (st.clears) records.push('Clears: ' + st.clears);
    if (st.bestSolo) records.push('Best Solo: ' + fmtClock(st.bestSolo));
    if (st.bestParty) records.push('Best Party: ' + fmtClock(st.bestParty));

    body.innerHTML =
      '<div class="raid-lobby-hero">' +
        '<img src="assets/atlas/astral-citadel.png?v=156" alt="Astral Citadel Starlight Bridge" width="750" height="350">' +
        '<button type="button" class="raid-close-x" id="raidCloseX" aria-label="Close Astral Raid lobby">&times;</button>' +
        '<div class="raid-lobby-title">' +
          '<span class="ui-eyebrow">ASTRAL CITADEL · CO-OP RAID PORTAL</span>' +
          '<h2>Astral Raid</h2>' +
          '<p>Three bridge assault stages + Memory of Thanatos · Solo &lt;10m · Party &lt;15m</p>' +
        '</div>' +
      '</div>' +
      '<div class="raid-tabs" role="tablist" aria-label="Raid mode">' +
        '<button type="button" role="tab" data-raid-mode="solo" aria-selected="' + (mode === 'solo') + '" class="' + (mode === 'solo' ? 'on' : '') + '">' +
          '<b>Solo Raid</b><small>You alone · &lt;10 min · No revive</small>' +
        '</button>' +
        '<button type="button" role="tab" data-raid-mode="party" aria-selected="' + (mode === 'party') + '" class="' + (mode === 'party' ? 'on' : '') + '">' +
          '<b>Party Raid</b><small>2–3 real players · &lt;15 min · Team revive</small>' +
        '</button>' +
      '</div>' +
      partyStatusHtml +
      '<ol class="raid-stages">' + stagesHtml + '</ol>' +
      '<div class="raid-mechanics">' +
        '<div><b>🔴 Red Telegraphs</b><span>Walk out (click ground or WASD/Arrows) OR press <b>DODGE</b> (Space) for quick dash + i-frames.</span></div>' +
        '<div><b>✚ Party Revive</b><span>Party only: living teammate channels 3s to revive fallen ally at 30% HP (up to 3/run).</span></div>' +
      '</div>' +
      '<div class="raid-rewards">' +
        '<div><b>Solo Clear</b><span>20 Astral Shards · 500,000 Zeny · 100 Echo Shards</span></div>' +
        '<div><b>Party Clear</b><span>30 Astral Shards · 750,000 Zeny · 150 Echo Shards</span></div>' +
        '<div><b>Defeat Consolation</b><span>5 Astral Shards</span></div>' +
      '</div>' +
      '<div class="raid-footer-meta">' +
        '<span class="raid-gate ' + (gate.ok ? '' : 'is-locked') + '">' +
          (gate.ok ? ('Entries left today: <b>' + left + ' / ' + RAID_PER_DAY + '</b>') : esc(gate.why)) +
        '</span>' +
        (records.length ? '<small>' + esc(records.join(' · ')) + '</small>' : '') +
      '</div>' +
      '<div class="raid-actions">' +
        '<button type="button" id="raidStartBtn" class="raid-primary-btn" ' + (canStartBtn ? '' : 'disabled') + '>' + startLabel + '</button>' +
        '<button type="button" id="raidCloseBtn" class="raid-ghost-btn">Close</button>' +
      '</div>';

    body.querySelectorAll('[data-raid-mode]').forEach(function (b) {
      b.onclick = function () {
        raid._lobbyMode = b.dataset.raidMode;
        renderLobby();
      };
    });
    var plazaBtn = el('raidOpenPlazaBtn');
    if (plazaBtn) {
      plazaBtn.onclick = function () {
        hideLobby();
        var soc = social();
        if (soc && typeof soc.enter === 'function') {
          Promise.resolve(soc.enter()).then(function () {
            var pBtn = el('socialPartyBtn');
            var pPanel = el('socialPartyPanel');
            if (pBtn && pPanel && pPanel.hidden) pBtn.click();
          });
        }
      };
    }
    var startBtn = el('raidStartBtn');
    if (startBtn) {
      startBtn.onclick = function () {
        var r = start(mode);
        if (r === true) hideLobby();
        else if (r === 'waiting') {
          hideLobby();
          if (typeof log === 'function') log('Launching Party Raid…', 'r4');
        } else {
          renderLobby();
        }
      };
    }
    var closeBtn = el('raidCloseBtn');
    if (closeBtn) closeBtn.onclick = hideLobby;
    var closeX = el('raidCloseX');
    if (closeX) closeX.onclick = hideLobby;
  }

  /* ---------- Stable Raid HUD (built once per run, updated via text/style) ---------- */
  function buildHudDom() {
    var hud = el('raidHud');
    if (!hud) return;
    hud.innerHTML =
      '<aside class="raid-left-col">' +
        '<section class="raid-card raid-party-card" aria-label="Party HP">' +
          '<header><span>RAID PARTY</span><small id="raidAliveCount">1/1 ALIVE</small></header>' +
          '<div id="raidPartyFrames" class="raid-frames"></div>' +
        '</section>' +
        '<section class="raid-card raid-dps-card" aria-label="DPS Meter">' +
          '<header><span>DPS METER</span><small id="raidTotalDps">0 DPS</small></header>' +
          '<div id="raidDpsRows" class="raid-dps-rows"></div>' +
        '</section>' +
      '</aside>' +
      '<section class="raid-top-center">' +
        '<div class="raid-top-bar">' +
          '<div class="raid-pips" id="raidPips"></div>' +
          '<div class="raid-stage-info"><b id="raidStageName">Stage 1</b><small id="raidEnemiesLeft"></small></div>' +
          '<div class="raid-timer" id="raidTimer">⏱ 0:00 / 10:00</div>' +
        '</div>' +
        '<div class="raid-boss" id="raidBossWrap" hidden>' +
          '<div class="raid-boss-head"><b id="raidBossName">Memory of Thanatos</b><span id="raidBossHpTxt">100%</span></div>' +
          '<div class="bar"><i id="raidBossFill" style="width:100%"></i></div>' +
        '</div>' +
        '<div class="raid-warn" id="raidWarnBanner" hidden></div>' +
      '</section>' +
      '<div class="raid-down" id="raidDownBanner" hidden>💀 You are down — waiting for a living teammate to channel REVIVE (3s)…</div>' +
      '<div class="raid-controls-hint">Click bridge or WASD / Arrows to walk out · <b>SPACE</b> or button to DODGE</div>' +
      '<div class="raid-actions-hud">' +
        '<button type="button" id="raidReviveBtn" class="raid-btn-revive" hidden>✚ REVIVE</button>' +
        '<button type="button" id="raidDodgeBtn" class="raid-btn-dodge">💨 DODGE <small>SPACE</small></button>' +
        '<button type="button" id="raidLeaveBtn" class="raid-btn-leave">Leave</button>' +
      '</div>';

    var dodgeBtn = el('raidDodgeBtn');
    if (dodgeBtn) dodgeBtn.onclick = function () { dodge(); };
    var reviveBtn = el('raidReviveBtn');
    if (reviveBtn) reviveBtn.onclick = function () { revive(); };
    var leaveBtn = el('raidLeaveBtn');
    if (leaveBtn) {
      leaveBtn.onclick = function () {
        if (typeof ask === 'function') {
          ask('Leave the Astral Raid? Your current run will end.', function () { endRun(false, 'left', false); }, { yes: 'Leave Raid', no: 'Stay' });
        } else {
          endRun(false, 'left', false);
        }
      };
    }
  }

  function updateHud() {
    var hud = el('raidHud');
    if (!hud) return;
    hud.hidden = !raid.on;
    if (!raid.on) return;
    if (!el('raidDodgeBtn')) buildHudDom();

    // 1. Stage pips, name, remaining count & timer.
    var pipsEl = el('raidPips');
    if (pipsEl) {
      pipsEl.innerHTML = STAGES.map(function (s, i) {
        var cls = i < raid.stage ? 'done' : (i === raid.stage ? 'on' : '');
        return '<i class="' + cls + '" title="' + esc(s.name) + '">' + (s.boss ? '☠' : (i + 1)) + '</i>';
      }).join('');
    }
    var st = STAGES[raid.stage] || STAGES[0];
    var stNameEl = el('raidStageName');
    if (stNameEl) stNameEl.textContent = (raid.stage + 1) + '/4 · ' + st.name;

    var remEl = el('raidEnemiesLeft');
    if (remEl) {
      if (raid.transition) {
        remEl.textContent = 'Advancing down the bridge…';
      } else {
        var cnt = (typeof mobs !== 'undefined' && Array.isArray(mobs)) ? mobs.length : 0;
        remEl.textContent = st.boss ? 'Final Boss Stage' : (cnt + (cnt === 1 ? ' enemy left' : ' enemies left'));
      }
    }

    var timerEl = el('raidTimer');
    if (timerEl) {
      var leftSec = Math.max(0, raid.limitSecs - raid.elapsed);
      timerEl.textContent = '⏱ ' + fmtClock(raid.elapsed) + ' / ' + fmtClock(raid.limitSecs);
      timerEl.classList.toggle('is-urgent', leftSec <= 90);
    }

    // 2. Boss HP bar & telegraph warning.
    var boss = null;
    try {
      if (typeof mobs !== 'undefined' && Array.isArray(mobs)) {
        boss = mobs.find(function (m) { return m.boss && m.hp > 0; }) || null;
      }
    } catch (e) {}
    var bossWrap = el('raidBossWrap');
    if (bossWrap) {
      bossWrap.hidden = !boss;
      if (boss) {
        var bPct = Math.max(0, Math.min(100, (boss.hp / Math.max(1, boss.max)) * 100));
        var bName = el('raidBossName');
        var bTxt = el('raidBossHpTxt');
        var bFill = el('raidBossFill');
        if (bName) bName.textContent = '☠ ' + boss.n;
        if (bTxt) bTxt.textContent = shortNum(boss.hp) + ' / ' + shortNum(boss.max) + ' (' + Math.ceil(bPct) + '%)';
        if (bFill) bFill.style.width = bPct.toFixed(1) + '%';
      }
    }

    var warnEl = el('raidWarnBanner');
    if (warnEl) {
      if (raid.telegraph) {
        var remT = Math.max(0, raid.telegraph.life - raid.telegraph.age);
        warnEl.hidden = false;
        warnEl.textContent = '⚠ ' + raid.telegraph.name.toUpperCase() + ' (' + remT.toFixed(1) + 's) — Walk out of red zone or press DODGE!';
      } else {
        warnEl.hidden = true;
      }
    }

    // 3. Party HP & Names.
    var activeParty = raid.party;
    var aliveCount = activeParty.filter(function (p) { return !p.dead && !p.left; }).length;
    var aliveEl = el('raidAliveCount');
    if (aliveEl) aliveEl.textContent = aliveCount + '/' + activeParty.length + ' ALIVE';

    var framesEl = el('raidPartyFrames');
    if (framesEl) {
      framesEl.innerHTML = activeParty.map(function (p) {
        var pct = p.dead ? 0 : Math.max(0, Math.min(100, (p.hp / Math.max(1, p.maxHp)) * 100));
        var stateCls = p.left ? ' dead' : (p.dead ? ' dead' : (pct < 30 ? ' low' : (pct < 60 ? ' mid' : '')));
        var statusTxt = p.left
          ? 'LEFT RAID'
          : (p.dead ? '💀 DOWN — Needs Revive' : (shortNum(p.hp) + ' / ' + shortNum(p.maxHp) + ' (' + Math.round(pct) + '%)'));
        return '<div class="raid-frame' + stateCls + (p.self ? ' is-self' : '') + '">' +
          '<div class="raid-frame-top"><b>' + esc(p.name) + (p.self ? ' <em>YOU</em>' : '') + '</b>' +
          (p.cls ? '<span class="raid-cls">' + esc(p.cls) + '</span>' : '') + '</div>' +
          '<div class="bar"><i style="width:' + pct.toFixed(1) + '%"></i></div>' +
          '<small>' + statusTxt + '</small></div>';
      }).join('');
    }

    // 4. DPS Meter (sorted highest DPS first, with Player Names + DPS + share bar).
    var totalDps = activeParty.reduce(function (s, p) { return s + (p.dps || 0); }, 0);
    var totDpsEl = el('raidTotalDps');
    if (totDpsEl) totDpsEl.textContent = shortNum(totalDps) + '/s';

    var dpsRowsEl = el('raidDpsRows');
    if (dpsRowsEl) {
      var sorted = activeParty.slice().sort(function (a, b) { return (b.dps || 0) - (a.dps || 0); });
      var topDps = Math.max(1, sorted[0] && sorted[0].dps ? sorted[0].dps : 1);
      dpsRowsEl.innerHTML = sorted.map(function (p, idx) {
        var share = totalDps > 0 ? Math.round(((p.dps || 0) / totalDps) * 100) : (idx === 0 ? 100 : 0);
        var wPct = Math.max(2, Math.min(100, ((p.dps || 0) / topDps) * 100));
        return '<div class="raid-dps-row' + (p.self ? ' is-self' : '') + '">' +
          '<div class="raid-dps-label"><span>' + (idx + 1) + '. ' + esc(p.name) + '</span><b>' + shortNum(p.dps || 0) + '/s <small>(' + share + '%)</small></b></div>' +
          '<div class="raid-dps-bar"><i style="width:' + (p.dps ? wPct.toFixed(1) : 0) + '%"></i></div>' +
        '</div>';
      }).join('');
    }

    // 5. Action Buttons (DODGE & Party-Only REVIVE) + Downed Banner.
    var dodgeBtn = el('raidDodgeBtn');
    if (dodgeBtn) {
      dodgeBtn.disabled = raid.dead || raid.dodgeCd > 0;
      if (raid.iframes > 0) {
        dodgeBtn.innerHTML = '✨ EVADING! <small>IFRAMES</small>';
      } else if (raid.dodgeCd > 0) {
        dodgeBtn.innerHTML = '💨 DODGE ' + raid.dodgeCd.toFixed(1) + 's <small>CD</small>';
      } else {
        dodgeBtn.innerHTML = '💨 DODGE <small>SPACE</small>';
      }
    }

    var reviveBtn = el('raidReviveBtn');
    if (reviveBtn) {
      if (raid.mode !== 'party') {
        reviveBtn.hidden = true;
      } else {
        reviveBtn.hidden = false;
        var deadMate = activeParty.some(function (p) { return !p.self && p.dead && !p.left; });
        var leftRev = Math.max(0, REVIVE_MAX - raid.revives);
        reviveBtn.disabled = raid.dead || !deadMate || leftRev <= 0 || raid.reviveChannel > 0;
        if (raid.reviveChannel > 0) {
          reviveBtn.innerHTML = '✚ REVIVING ' + raid.reviveChannel.toFixed(1) + 's…';
        } else {
          reviveBtn.innerHTML = '✚ REVIVE <small>' + leftRev + '/' + REVIVE_MAX + '</small>';
        }
      }
    }

    var downBanner = el('raidDownBanner');
    if (downBanner) downBanner.hidden = !raid.dead;
  }

  function renderHud() {
    updateHud(true);
  }

  /* ---------- Result Modal ---------- */
  function renderResult() {
    var box = el('raidResult');
    if (!box || !raid.result) return;
    var r = raid.result;
    var rewardParts = [];
    if (r.pay.shards) rewardParts.push(r.pay.shards + ' Astral Shards');
    if (r.pay.zeny) rewardParts.push(r.pay.zeny.toLocaleString() + ' Zeny');
    if (r.pay.echo) rewardParts.push(r.pay.echo + ' Echo Shards');
    var rewardLine = rewardParts.length
      ? rewardParts.join(' · ')
      : (r.assistOnly ? 'Assist run (daily reward limit already used today)' : 'No rewards earned (left early)');

    var dpsBreakdown = (r.party || []).map(function (p) {
      return '<li><span>' + esc(p.name) + (p.cls ? ' <small>(' + esc(p.cls) + ')</small>' : '') + '</span><b>' + shortNum(p.dps) + ' DPS</b></li>';
    }).join('');

    box.innerHTML =
      '<div class="raid-result-card">' +
        '<span class="ui-eyebrow">ASTRAL RAID · ' + (r.mode === 'party' ? 'PARTY CO-OP' : 'SOLO') + '</span>' +
        '<h2>' + (r.cleared ? '🏆 Memory of Thanatos Defeated!' : '💀 Raid Ended') + '</h2>' +
        '<p>' + (r.cleared
          ? ('Cleared in <b>' + fmtClock(r.secs) + '</b> · Personal DPS: <b>' + shortNum(r.dps) + '/s</b>')
          : esc(r.reason || 'The Starlight Bridge holds.')) + '</p>' +
        (dpsBreakdown ? '<ul class="raid-result-dps">' + dpsBreakdown + '</ul>' : '') +
        '<div class="raid-rewards"><div><b>Rewards Earned</b><span>' + esc(rewardLine) + '</span></div></div>' +
        '<div class="raid-actions">' +
          '<button type="button" id="raidResultClose" class="raid-primary-btn">Return</button>' +
        '</div>' +
      '</div>';
    box.hidden = false;
    var close = el('raidResultClose');
    if (close) close.onclick = hideResult;
  }

  function hideResult() {
    var box = el('raidResult');
    if (box) box.hidden = true;
    raid.result = null;
  }

  return {
    STAGES: STAGES,
    raid: raid,
    canEnter: canEnter,
    raidState: raidState,
    raidLeftToday: raidLeftToday,
    partySize: partySize,
    hpScale: hpScale,
    start: start,
    beginRun: beginRun,
    endRun: endRun,
    leave: leave,
    dodge: dodge,
    revive: revive,
    setGroundMove: setGroundMove,
    handleCanvasClick: handleCanvasClick,
    onKey: onKey,
    overrideMove: overrideMove,
    tick: tick,
    onStarted: onStarted,
    onSync: onSync,
    onRevive: onRevive,
    onEnded: onEnded,
    onError: onError,
    showLobby: showLobby,
    hideLobby: hideLobby,
    renderLobby: renderLobby,
    renderHud: renderHud,
    renderResult: renderResult,
    hideResult: hideResult,
    DODGE_CD: DODGE_CD,
    REVIVE_MAX: REVIVE_MAX,
    RAID_PER_DAY: RAID_PER_DAY,
    SOLO_LIMIT_SECS: SOLO_LIMIT_SECS,
    PARTY_LIMIT_SECS: PARTY_LIMIT_SECS,
  };
});
