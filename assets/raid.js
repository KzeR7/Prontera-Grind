/* Astral Raid — Solo (<10m) & Real-Player Party (<15m) Raid Mode
 * Reuses the existing Astral Citadel 3D bridge scenery (PGAstralScenery), monsters,
 * and Memory of Thanatos boss with active bridge bombardments, 5-shape boss mechanics,
 * anti-ranged pressure, synchronized PGBossFx AoE detonations, WASD/click + DODGE evasion,
 * party-only revive, and a dedicated Raid HUD.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(root);
  else root.PGRaid = factory(root);
})(typeof globalThis !== 'undefined' ? globalThis : window, function (root) {
  'use strict';

  var RAID_MAP = 10; // Astral Citadel
  var STAGES = [
    { idx: 0, astralStage: 1, name: 'Starlit Approach', desc: 'Retribution Angels & Despair Phantoms under Starfall bombardment', boss: false },
    { idx: 1, astralStage: 2, name: 'Fallen Arcade', desc: 'Despair Phantoms & Tower Watchers under Oblivion Beams', boss: false },
    { idx: 2, astralStage: 3, name: 'Runic Observatory', desc: 'Tower Watchers, Death Whisperers & Agony Demon wardens', boss: false },
    { idx: 3, astralStage: 5, name: 'Sanctuary of Thanatos', desc: 'Memory of Thanatos — 5-mechanic raid encounter', boss: true }
  ];

  var SOLO_LIMIT_S = 600;     // 10 minutes
  var PARTY_LIMIT_S = 900;    // 15 minutes
  var DAILY_LIMIT = 2;
  var MAX_PARTY_REVIVES = 3;
  var REVIVE_CHANNEL_S = 3.0;
  var DODGE_CD_S = 3.5;
  var DODGE_IFRAME_S = 0.75;
  var DODGE_DIST = 5.4;
  var SYNC_INTERVAL_S = 2.0;

  // Tuned from real 4th-job combat benchmarks:
  // Solo clears in ~4m10s–9m35s (<10m); 2-3p Party clears in ~7m–11m (<15m).
  var TRASH_CAMP_LIMIT = 8;
  var BOSS_HP_MULT = 2.2;
  var ESCORT_HP_MULT = 1.4;

  var REWARDS = {
    solo:  { shards: 20, zeny: 500000, echo: 100 },
    party: { shards: 30, zeny: 750000, echo: 150 },
    fail:  { shards: 5,  zeny: 0,      echo: 0 }
  };

  var raid = {
    on: false,
    _internalNav: false,
    mode: 'solo',          // 'solo' | 'party'
    raidId: '',
    seed: 1,
    stage: 0,              // 0..3
    startedAt: 0,
    elapsed: 0,
    limit: SOLO_LIMIT_S,
    dmg0: 0,
    dodgeCd: 0,
    iframes: 0,
    dead: false,
    revivesLeft: 0,
    reviving: null,        // { targetId, targetName, left }
    telegraph: null,       // active boss or bridge hazard
    voidPools: [],         // [{ x, z, r, left, tick }] lingering anti-ranged burn zones
    nextCastIn: 3.4,
    castSeq: 0,
    lastSkillKey: '',
    syncTimer: 0,
    hudTimer: 0,
    transition: null,      // { nextIdx, fallbackLeft }
    home: null,
    party: [],             // [{ id, name, cls, hp, maxHp, dps, stage, dead, self }]
    keys: { w: false, a: false, s: false, d: false },
    moveTarget: null,      // { x, z, left, hold }
    lobbyMode: 'solo',
    waitingPartyStart: false,
    hudBuilt: false,
    result: null
  };

  // Reusable Three.js hazard pool (zero per-cast allocation lag)
  var hazardGroup = null;
  var craterNodes = [];
  var beamNodes = [];
  var donutNode = null;
  var poolNodes = [];
  var moveRing = null;

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

  function canEnter(mode) {
    if (typeof S === 'undefined' || !S) return { ok: false, reason: 'Sign in first.' };
    if (raid.on) return { ok: false, reason: 'Already inside Astral Raid.' };
    if ((typeof TRIAL !== 'undefined' && TRIAL.on) || (typeof JOB_RITE !== 'undefined' && JOB_RITE.on)) {
      return { ok: false, reason: 'Finish your current trial first.' };
    }
    if (!isFourthUnlocked()) {
      return { ok: false, reason: 'Requires Base Lv 150 & a 4th-Job class (Astral Citadel tier).' };
    }
    if (!isGm() && raidLeftToday() <= 0) {
      return { ok: false, reason: 'Daily Raid limit reached (2/2 today). Resets at 00:00 UTC+8.' };
    }
    if (mode === 'party') {
      var p = socialParty();
      if (!p || p.members.length < 2) {
        return { ok: false, reason: 'Form a 2–3 player Party in the Social Hub first.' };
      }
      if (p.members.length > 3) {
        return { ok: false, reason: 'Astral Raid supports up to 3 party members.' };
      }
      if (!isPartyLeader()) {
        return { ok: false, reason: 'Waiting for your Party Leader to launch the raid.' };
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

  // ---------- Reusable Three.js Hazard Visuals ----------
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

    // 3D Falling Asteroid / Meteor + luminous tail
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

    // Outer danger band (unit inner=1, outer=4; scaled by innerR)
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

    // Render active lingering Void Pools
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

      if (shape === 'circle' || shape === 'multi') {
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

  // ---------- Hit Geometry for All 5 Hazard Shapes ----------
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
    var st = STAGES[stageIdx];
    if (!st) return;
    raid.stage = stageIdx;
    raid.telegraph = null;
    raid.voidPools = [];
    raid.nextCastIn = st.boss ? 2.8 : 3.2;
    raid.transition = null;
    raid.moveTarget = null;

    raid._internalNav = true;
    try {
      S.mp = RAID_MAP;
      S.lvl = st.astralStage;
      if (typeof astralOriginStage !== 'undefined') astralOriginStage = st.astralStage;
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
            var f4 = fieldOf(RAID_MAP, 4);
            var st3 = ascensionCombatStats(RAID_MAP, 3);
            var tpl = f4 && f4.mobs && f4.mobs[1];
            if (tpl && st3) {
              for (var w = 0; w < 2; w++) {
                var wx = w === 0 ? -2.6 : 2.6;
                var wz = -6.5 - w * 2.0;
                var hpW = Math.floor(st3.hp * 1.35);
                mobs.push(Object.assign({}, tpl, {
                  hp: hpW, max: hpW, atk: Math.floor(st3.atk * 1.1),
                  exp: 0, zeny: 0, drops: [], cardCh: 0,
                  x: wx, z: wz, hx: null, hz: null,
                  a: Math.random() * 6.28, size: 0.72, pack: 90 + w, boss: false,
                  spawn: 1, mapIndex: RAID_MAP, sec: f4.sec,
                  lvl: typeof fieldPower === 'function' ? fieldPower(RAID_MAP, 3) : 130,
                  at: 1.4, stun: 0, mag: true
                }));
              }
            }
          }
          // Disable camp leash on raid bridge mobs too so dodging never heals enemies
          for (var k = 0; k < mobs.length; k++) {
            mobs[k].hx = null;
            mobs[k].hz = null;
            if (scale > 1) {
              mobs[k].hp = Math.max(1, Math.floor(mobs[k].hp * scale));
              mobs[k].max = mobs[k].hp;
            }
          }
        } else {
          for (var i = 0; i < mobs.length; i++) {
            var mult = mobs[i].boss ? (BOSS_HP_MULT * scale) : (ESCORT_HP_MULT * scale);
            mobs[i].hp = Math.max(1, Math.floor(mobs[i].hp * mult));
            mobs[i].max = mobs[i].hp;
            mobs[i].hx = null;
            mobs[i].hz = null;
          }
        }
      }
      if (typeof respawn !== 'undefined') respawn = 1e9;
    } finally {
      raid._internalNav = false;
    }
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
      if (shape === 'donut') {
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
    var dest = clampToBridge(pl.x + dir.x * DODGE_DIST, pl.z + dir.z * DODGE_DIST);
    var faceDx = dest.x - pl.x, faceDz = dest.z - pl.z;
    if (Math.hypot(faceDx, faceDz) > 0.05) {
      pl.ry = -Math.atan2(faceDz, faceDx);
    }
    pl.x = dest.x;
    pl.z = dest.z;
    raid.moveTarget = { x: dest.x, z: dest.z, left: 1.0, holdOnly: true };
    if (typeof engageTgt !== 'undefined') engageTgt = null;
    if (typeof swing !== 'undefined') swing = null;
    if (typeof addFloat === 'function') addFloat(pl.x, 2.5, pl.z, 'DODGE!', '#76eaff', true, 'evade');
    updateMeshes();
    renderHud();
    return true;
  }

  // ---------- Stage 1–3 Bridge Bombardments & Stage 4 Boss Mechanics ----------
  function spawnBridgeHazard(dt) {
    if (typeof mobs === 'undefined' || !mobs.length || typeof pl === 'undefined' || !pl) return;
    raid.nextCastIn -= dt;
    if (raid.nextCastIn > 0) return;

    raid.castSeq++;
    var b = fieldBounds();
    var pick = raid.castSeq % 3;
    var stageGap = raid.stage === 0 ? 4.8 : (raid.stage === 1 ? 4.3 : 3.9);

    if (pick === 1) {
      //Astral Starfall: 3-4 falling 3D meteors across the bridge + player position
      var count = raid.stage >= 2 ? 4 : 3;
      var zones = [{ x: clampToBridge(pl.x, pl.z).x, z: clampToBridge(pl.x, pl.z).z, r: 3.1 }];
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
        zones: zones,
        x: zones[0].x,
        z: zones[0].z,
        dmgPct: 0.24,
        fx: 'lod_verdict',
        age: 0,
        life: 2.25
      };
    } else if (pick === 2) {
      // Oblivion Bridge Beam: crimson lance across or down the player's lane
      var crossBridge = (raid.castSeq % 2 === 0);
      var ang = crossBridge ? (Math.PI / 2 + (raid.stage === 2 ? 0.28 : 0)) : 0;
      raid.telegraph = {
        name: 'Sanctuary Lance',
        hint: 'OBLIVION BEAM — Sidestep off the laser lane!',
        shape: 'beam',
        x: clampToBridge(pl.x, pl.z).x,
        z: clampToBridge(pl.x, pl.z).z,
        ang: ang,
        width: 3.1,
        len: 24,
        dmgPct: 0.26,
        fx: 'tnt_fracture',
        age: 0,
        life: 2.15
      };
    } else {
      // Void Comet: anti-camping twin meteors that leave a burning Astral Void Pool
      var p1 = clampToBridge(pl.x, pl.z);
      var p2 = clampToBridge(-pl.x * 0.6, pl.z - 3.2);
      raid.telegraph = {
        name: 'Void Comet',
        hint: 'VOID COMET — Leaves a burning pool, reposition!',
        shape: 'multi',
        meteors: true,
        leavesPool: true,
        zones: [
          { x: p1.x, z: p1.z, r: 3.2 },
          { x: p2.x, z: p2.z, r: 3.0 }
        ],
        x: p1.x,
        z: p1.z,
        dmgPct: 0.22,
        fx: 'lod_harvest',
        age: 0,
        life: 2.2
      };
    }
    raid.nextCastIn = stageGap;
    if (typeof skillNameFloat === 'function') skillNameFloat(raid.telegraph.name);
  }

  function chooseBossSkill(boss) {
    var dist = (typeof pl !== 'undefined' && pl) ? Math.hypot(pl.x - boss.x, pl.z - boss.z) : 2.0;
    var isRangedPlayer = dist > 3.1 || (typeof C === 'function' && C() && C().wt && /bow|staff|book|gun|instrument|whip/i.test(C().wt.join(',')));
    var hpRatio = boss.max > 0 ? boss.hp / boss.max : 1;

    // Weight anti-ranged skills (donut + seeker) strongly when ranged classes / distant players are present
    var pool = isRangedPlayer
      ? ['donut', 'seeker', 'cross', 'donut', 'seeker', 'slam', 'cataclysm']
      : ['slam', 'donut', 'cross', 'seeker', 'cataclysm'];
    if (hpRatio > 0.75) {
      pool = pool.filter(function (k) { return k !== 'cataclysm'; });
    }
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
    var gap = hpRatio < 0.5 ? 3.8 : 4.5;
    var px = (typeof pl !== 'undefined' && pl) ? pl.x : 0;
    var pz = (typeof pl !== 'undefined' && pl) ? pl.z : 2;
    var dist = Math.hypot(px - boss.x, pz - boss.z);

    if (key === 'donut') {
      // ANTI-RANGED: inner circle (<3.7) around Thanatos is SAFE; entire outer arena explodes!
      raid.telegraph = {
        name: 'Eye of Abyss',
        hint: 'EYE OF ABYSS — RANGED DANGER! Run INSIDE the blue ring near Thanatos!',
        shape: 'donut',
        donut: true,
        x: boss.x,
        z: boss.z,
        innerR: 3.7,
        outerR: 16.0,
        dmgPct: 0.35,
        fx: 'abyss_requiem',
        age: 0,
        life: 2.5
      };
    } else if (key === 'seeker') {
      // ANTI-RANGED: hunts ranged standoff & leaves a 4.5s burning Void Pool so ranged cannot turret!
      var targetPt = dist > 2.8
        ? clampToBridge(px, pz)
        : clampToBridge(boss.x + 5.6 * Math.cos(raid.castSeq * 1.9), boss.z + 5.6 * Math.sin(raid.castSeq * 1.9));
      var flankA = clampToBridge(targetPt.x + 3.4 * Math.cos(raid.castSeq), targetPt.z - 2.8 * Math.sin(raid.castSeq));
      var flankB = clampToBridge(boss.x - (targetPt.x - boss.x) * 0.75, boss.z + 4.8);
      raid.telegraph = {
        name: 'Horizon Volley',
        hint: 'HORIZON VOLLEY — Hunts ranged distance & leaves Void Pool!',
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
        dmgPct: 0.30,
        fx: 'lod_harvest',
        age: 0,
        life: 2.15
      };
    } else if (key === 'cross') {
      // Rotating + / X Cross Beams across the Sanctuary
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
        dmgPct: 0.35,
        fx: 'abyss_cross',
        age: 0,
        life: 2.3
      };
    } else if (key === 'cataclysm') {
      // 5-Meteor Starfall Cataclysm covering both melee and ranged rings
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
        dmgPct: 0.28,
        fx: 'lod_verdict',
        age: 0,
        life: 2.4
      };
    } else {
      // Crimson Judgment: Point-Blank Supernova (punishes melee, get OUT!)
      raid.telegraph = {
        name: 'Crimson Judgment',
        hint: 'CRIMSON JUDGMENT — Point-blank slam! Move OUT or DODGE!',
        shape: 'circle',
        x: boss.x,
        z: boss.z,
        r: 5.4,
        dmgPct: 0.36,
        fx: 'tnt_judge',
        age: 0,
        life: 2.4
      };
    }

    raid.nextCastIn = gap;
    if (typeof skillNameFloat === 'function') skillNameFloat(raid.telegraph.name);
  }

  function applyRaidHazardDamage(dmgPct, label) {
    if (raid.dead || typeof S === 'undefined' || !S || typeof pl === 'undefined' || !pl) return;
    if (raid.iframes > 0) {
      if (typeof addFloat === 'function') addFloat(pl.x, 2.4, pl.z, 'EVADED!', '#76eaff', true, 'evade');
      return;
    }
    var raw = Math.max(1, Math.floor((typeof maxHp === 'function' ? maxHp() : 5000) * dmgPct));
    var taken = typeof absorbSoak === 'function' ? absorbSoak(raw) : raw;
    S.hp = Math.max(0, S.hp - taken);
    if (typeof hitAnim !== 'undefined') hitAnim = 1;
    if (typeof damageFloat === 'function' && typeof heroDamageY === 'function') {
      damageFloat(pl.x, heroDamageY(), pl.z, taken, true, true);
    }
    if (label && typeof addFloat === 'function') {
      addFloat(pl.x, 2.8, pl.z, label, '#ff5c78', true, 'incoming');
    }
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
          applyRaidHazardDamage(0.05, 'VOID BURN');
        }
      }
    }
  }

  function tickHazards(dt) {
    tickVoidPools(dt);

    var st = STAGES[raid.stage];
    if (!st) return;

    if (!raid.telegraph) {
      if (st.boss) {
        var boss = findBoss();
        if (boss) spawnBossSkill(boss, dt);
      } else {
        spawnBridgeHazard(dt);
      }
      updateMeshes();
      return;
    }

    var tg = raid.telegraph;
    tg.age += dt;
    // Donut & Point-Blank Slam track boss center while charging
    if (st.boss && (tg.shape === 'circle' || tg.shape === 'donut' || tg.shape === 'cross')) {
      var liveBoss = findBoss();
      if (liveBoss) {
        tg.x = liveBoss.x;
        tg.z = liveBoss.z;
      }
    }

    if (tg.age >= tg.life) {
      raid.telegraph = null;
      // Trigger synchronized PGBossFx 2D canvas explosion + screen shake at detonation!
      if (tg.fx && typeof triggerRaidBossFx === 'function') {
        triggerRaidBossFx(tg.fx, tg.x, tg.z, null);
      }
      // Spawn lingering anti-ranged Void Pool if flagged
      if (tg.leavesPool) {
        var poolPt = (Array.isArray(tg.zones) && tg.zones[0]) ? tg.zones[0] : { x: tg.x, z: tg.z };
        raid.voidPools.push({ x: poolPt.x, z: poolPt.z, r: 3.4, left: 4.5, tick: 0.35 });
        if (raid.voidPools.length > 3) raid.voidPools.shift();
      }
      // Real AoE hit check!
      if (!raid.dead && typeof pl !== 'undefined' && pl && hitByTelegraph(tg, pl.x, pl.z)) {
        applyRaidHazardDamage(tg.dmgPct || 0.32, tg.name.toUpperCase() + '!');
      }
    }
    updateMeshes();
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
      target.dead = false;
      target.hp = Math.max(1, Math.floor((target.maxHp || 1000) * 0.3));
      if (root.PGSocial && typeof root.PGSocial.send === 'function') {
        root.PGSocial.send({ type: 'raid_revive', raidId: raid.raidId, target: tid });
      }
      if (typeof log === 'function') log('Revived ' + target.name + '! (' + raid.revivesLeft + ' revives left)', 'r4', 'misc');
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
    me.hp = raid.dead ? 0 : Math.max(0, Math.round(S.hp || 0));
    me.maxHp = Math.max(1, Math.round(typeof maxHp === 'function' ? maxHp() : 1));
    me.dps = currentDps();
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
      cls: me.cls,
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
    raid.mode = mode === 'party' ? 'party' : 'solo';
    raid.raidId = String(opts.raidId || ('solo-' + Date.now()));
    raid.seed = Number(opts.seed) || 1;
    raid.stage = 0;
    raid.startedAt = Date.now();
    raid.elapsed = 0;
    raid.limit = raid.mode === 'party' ? PARTY_LIMIT_S : SOLO_LIMIT_S;
    raid.dmg0 = Number(S.dmg) || 0;
    raid.dodgeCd = 0;
    raid.iframes = 0;
    raid.dead = false;
    raid.revivesLeft = raid.mode === 'party' ? MAX_PARTY_REVIVES : 0;
    raid.reviving = null;
    raid.telegraph = null;
    raid.voidPools = [];
    raid.nextCastIn = 3.2;
    raid.castSeq = 0;
    raid.lastSkillKey = '';
    raid.syncTimer = 0.5;
    raid.hudTimer = 0;
    raid.transition = null;
    raid.waitingPartyStart = false;
    raid.keys = { w: false, a: false, s: false, d: false };
    raid.moveTarget = null;

    var selfId = myId();
    if (raid.mode === 'party' && Array.isArray(opts.members) && opts.members.length) {
      raid.party = opts.members.slice(0, 3).map(function (m) {
        var isMe = m.id === selfId || m.name === myName();
        return {
          id: m.id,
          name: m.name || 'Ally',
          cls: isMe ? (S.cls || 'Adventurer') : (m.cls || 'Ally'),
          hp: isMe ? Math.round(S.hp || 1) : 100,
          maxHp: isMe ? Math.round(typeof maxHp === 'function' ? maxHp() : 100) : 100,
          dps: 0,
          stage: 0,
          dead: false,
          self: isMe
        };
      });
      if (!selfEntry()) {
        raid.party.unshift({
          id: selfId, name: myName(), cls: S.cls || 'Adventurer',
          hp: Math.round(S.hp || 1), maxHp: Math.round(typeof maxHp === 'function' ? maxHp() : 1),
          dps: 0, stage: 0, dead: false, self: true
        });
      }
    } else {
      raid.party = [{
        id: selfId,
        name: myName(),
        cls: S.cls || 'Adventurer',
        hp: Math.round(S.hp || 1),
        maxHp: Math.round(typeof maxHp === 'function' ? maxHp() : 1),
        dps: 0,
        stage: 0,
        dead: false,
        self: true
      }];
    }

    S.hp = typeof maxHp === 'function' ? maxHp() : S.hp;
    hideLobby();
    hideResult();
    if (typeof document !== 'undefined' && document.body) document.body.classList.add('raid-open');
    buildHudDom();
    spawnRaidStage(0);
    if (typeof log === 'function') {
      log('Entered Astral Raid (' + (raid.mode === 'party' ? 'Party' : 'Solo') + ') — clear 3 stages and defeat Memory of Thanatos!', 'r4', 'misc');
    }
    if (typeof save === 'function') save();
    return true;
  }

  function start(mode) {
    var m = mode || raid.lobbyMode || 'solo';
    var gate = canEnter(m);
    if (!gate.ok) return false;
    if (m === 'party') {
      if (!root.PGSocial || typeof root.PGSocial.send !== 'function') return false;
      raid.waitingPartyStart = true;
      renderLobby();
      root.PGSocial.send({ type: 'raid_start' });
      return 'waiting';
    }
    return beginRun('solo', {});
  }

  function awardRewards(cleared) {
    if (typeof S === 'undefined' || !S) return { shards: 0, zeny: 0, echo: 0 };
    var r = cleared ? (raid.mode === 'party' ? REWARDS.party : REWARDS.solo) : REWARDS.fail;
    if (!Array.isArray(S.ascensionMat)) S.ascensionMat = [0, 0, 0];
    S.ascensionMat[0] = (Number(S.ascensionMat[0]) || 0) + r.shards;
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
    return r;
  }

  function finish(cleared, reason, fromNetwork) {
    if (!raid.on) return;
    refreshSelfStats();
    var elapsed = Math.max(1, Math.round(raid.elapsed));
    var myFinalDps = currentDps();
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
    raid.keys = { w: false, a: false, s: false, d: false };

    if (!fromNetwork && mode === 'party' && root.PGSocial && typeof root.PGSocial.send === 'function') {
      root.PGSocial.send({
        type: 'raid_end',
        raidId: rid,
        cleared: Boolean(cleared),
        reason: reason || (cleared ? 'boss_down' : 'failed'),
        secs: elapsed,
        dps: myFinalDps
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

    raid.result = {
      cleared: Boolean(cleared),
      reason: reason || (cleared ? 'Memory of Thanatos defeated!' : 'Raid ended'),
      mode: mode,
      secs: elapsed,
      dps: myFinalDps,
      party: partySnap,
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
    if (typeof swing !== 'undefined') swing = null;
    sendSync(true);
    renderHud();
    checkPartyWipe();
  }

  function beginStageAdvance() {
    var nextIdx = raid.stage + 1;
    if (nextIdx >= STAGES.length) {
      finish(true, 'Memory of Thanatos defeated!', false);
      return;
    }
    var fromAstral = STAGES[raid.stage].astralStage;
    var toAstral = STAGES[nextIdx].astralStage;
    raid.telegraph = null;
    raid.voidPools = [];
    raid.moveTarget = null;
    updateMeshes();

    var startedWalk = false;
    if (typeof startAstralJourney === 'function') {
      startedWalk = startAstralJourney(fromAstral, toAstral);
    }
    raid.transition = {
      nextIdx: nextIdx,
      fallbackLeft: startedWalk ? 8.0 : 0.6
    };
    renderHud();
  }

  // ---------- Per-frame Tick ----------
  function tick(dt) {
    if (!raid.on) return;
    var step = Math.max(0, Math.min(0.25, Number(dt) || 0));
    raid.elapsed += step;
    if (raid.dodgeCd > 0) raid.dodgeCd = Math.max(0, raid.dodgeCd - step);
    if (raid.iframes > 0) raid.iframes = Math.max(0, raid.iframes - step);

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
      var journeyActive = typeof astralJourney !== 'undefined' && Boolean(astralJourney);
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
      slot = { id: sender, name: msg.name || 'Ally', cls: msg.cls || 'Ally', hp: 100, maxHp: 100, dps: 0, stage: 0, dead: false, self: false };
      raid.party.push(slot);
    }
    if (!slot) return;
    if (msg.name) slot.name = String(msg.name).slice(0, 20);
    if (msg.cls) slot.cls = String(msg.cls).slice(0, 24);
    slot.hp = Math.max(0, Number(msg.hp) || 0);
    slot.maxHp = Math.max(1, Number(msg.maxHp) || 1);
    slot.dps = Math.max(0, Math.min(5e9, Number(msg.dps) || 0));
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
      if (p.id === msg.target || (p.self && msg.target === selfId)) {
        p.dead = false;
        p.hp = Math.max(1, Math.floor(p.maxHp * 0.3));
        if (p.self && raid.dead) {
          raid.dead = false;
          if (typeof S !== 'undefined' && S && typeof maxHp === 'function') {
            S.hp = Math.max(1, Math.ceil(maxHp() * 0.3));
          }
          if (typeof addFloat === 'function' && typeof pl !== 'undefined' && pl) {
            addFloat(pl.x, 2.6, pl.z, 'REVIVED!', '#7ef0b8', true, 'heal');
          }
          sendSync(true);
        }
      }
    }
    updateHud();
  }

  function onEnded(msg) {
    if (!raid.on || raid.mode !== 'party' || !msg) return;
    finish(Boolean(msg.cleared), msg.reason || (msg.cleared ? 'Memory of Thanatos defeated!' : 'Raid ended by party.'), true);
  }

  function onError(msg) {
    raid.waitingPartyStart = false;
    renderLobby();
    if (msg && msg.text && typeof log === 'function') log('Raid: ' + msg.text, 'r0', 'misc');
  }

  // ---------- UI: Portal Lobby ----------
  function showLobby(preferredMode) {
    if (raid.on) return;
    if (preferredMode === 'solo' || preferredMode === 'party') {
      raid.lobbyMode = preferredMode;
    } else if (socialParty() && socialParty().members.length >= 2) {
      raid.lobbyMode = 'party';
    }
    var el = $('raidLobby');
    if (!el) return;
    el.hidden = false;
    renderLobby();
  }

  function hideLobby() {
    var el = $('raidLobby');
    if (el) el.hidden = true;
    raid.waitingPartyStart = false;
  }

  function renderLobby() {
    var box = $('raidLobbyBody');
    if (!box) return;
    var mode = raid.lobbyMode;
    var gate = canEnter(mode);
    var left = raidLeftToday();
    var p = socialParty();
    var st = raidSaveState();

    var partyHtml = '';
    if (mode === 'party') {
      if (p && p.members.length >= 2) {
        partyHtml =
          '<div class="raid-party-box">' +
            '<div class="raid-party-head"><span>Party Roster (' + p.members.length + '/3)</span>' +
              '<span>' + (isPartyLeader() ? 'You are Leader' : 'Waiting for Leader') + '</span></div>' +
            '<div class="raid-party-chips">' +
              p.members.slice(0, 3).map(function (m) {
                return '<span class="raid-chip">' + (m.id === p.leader ? '★ ' : '') + escHtml(m.name) + '</span>';
              }).join('') +
            '</div>' +
          '</div>';
      } else {
        partyHtml =
          '<div class="raid-party-box raid-party-empty">' +
            '<span>No 2–3 player party active. Invite real players in the Social Hub Plaza first!</span>' +
            '<button type="button" class="raid-link-btn" data-raid-act="plaza">Open Social Hub</button>' +
          '</div>';
      }
    } else {
      partyHtml =
        '<div class="raid-party-box solo-note">' +
          '<b>Solo mode:</b> fight down the Starlight Bridge under live meteor & beam bombardment. Solo death ends the run immediately (no revive).' +
        '</div>';
    }

    var stagesHtml = STAGES.map(function (s, i) {
      return '<div class="raid-stage-item' + (s.boss ? ' boss' : '') + '">' +
        '<span class="raid-stage-num">' + (i + 1) + '</span>' +
        '<div><b>' + escHtml(s.name) + (s.boss ? ' <em>BOSS</em>' : '') + '</b><small>' + escHtml(s.desc) + '</small></div>' +
      '</div>';
    }).join('');

    var bestText = mode === 'party'
      ? (st.bestParty ? fmtClock(st.bestParty) : '—')
      : (st.bestSolo ? fmtClock(st.bestSolo) : '—');

    var entriesText = isGm()
      ? '<b class="raid-gm-tag">∞ Unlimited (GM)</b>'
      : '<b>' + left + ' / ' + DAILY_LIMIT + '</b>';

    box.innerHTML =
      '<div class="raid-banner">' +
        '<img src="assets/endgame/textures/astral-sky-plate-a4db60a4cc7a.webp" alt="">' +
        '<div class="raid-banner-shade"></div>' +
        '<div class="raid-banner-copy">' +
          '<span class="raid-eyebrow">ASTRAL CITADEL · CO-OP RAID PORTAL</span>' +
          '<h2>Astral Raid</h2>' +
          '<p>3 bombarded bridge stages + Memory of Thanatos · Solo &lt;10m · Party &lt;15m</p>' +
        '</div>' +
        '<button type="button" class="raid-close-x" data-raid-act="close" aria-label="Close">×</button>' +
      '</div>' +
      '<div class="raid-mode-tabs" role="tablist">' +
        '<button type="button" class="raid-mode-tab' + (mode === 'solo' ? ' on' : '') + '" data-raid-mode="solo">' +
          '<strong>Solo Raid</strong><span>1 player · &lt;10 min · No revive</span>' +
        '</button>' +
        '<button type="button" class="raid-mode-tab' + (mode === 'party' ? ' on' : '') + '" data-raid-mode="party">' +
          '<strong>Party Raid</strong><span>2–3 real players · &lt;15 min · Team revive</span>' +
        '</button>' +
      '</div>' +
      partyHtml +
      '<div class="raid-stages-grid">' + stagesHtml + '</div>' +
      '<div class="raid-rules-row">' +
        '<div class="raid-rule-card">' +
          '<b>☄ Bridge &amp; Boss Mechanics</b>' +
          '<span>Dodge falling meteors, cross beams, Eye of Abyss (get IN close!), &amp; Void Pools via WASD/click or <b>DODGE</b> (Space).</span>' +
        '</div>' +
        '<div class="raid-rule-card">' +
          '<b>✚ Party Revive</b>' +
          '<span>Party only: living teammate channels 3s to revive a fallen ally at 30% HP (up to 3/run).</span>' +
        '</div>' +
      '</div>' +
      '<div class="raid-rewards-bar">' +
        '<div><b>Solo Clear</b><span>20 Astral Shards · 500,000 Zeny · 100 Echo Shards</span></div>' +
        '<div><b>Party Clear</b><span>30 Astral Shards · 750,000 Zeny · 150 Echo Shards</span></div>' +
        '<div><b>Defeat Consolation</b><span>5 Astral Shards</span></div>' +
      '</div>' +
      '<div class="raid-lobby-foot">' +
        '<div class="raid-meta-line">' +
          '<span>Entries left today: ' + entriesText + (st.clears ? ' · Total clears: <b>' + st.clears + '</b> · Best: <b>' + bestText + '</b>' : '') + '</span>' +
          (gate.ok ? '' : '<span class="raid-gate-err">' + escHtml(gate.reason) + '</span>') +
        '</div>' +
        '<div class="raid-foot-btns">' +
          '<button type="button" class="raid-start-btn" data-raid-act="start" ' + (!gate.ok || raid.waitingPartyStart ? 'disabled' : '') + '>' +
            (raid.waitingPartyStart ? 'Launching Party Raid…' : (mode === 'party' ? '⚔ Launch Party Raid' : '⚔ Start Solo Raid')) +
          '</button>' +
          '<button type="button" class="raid-cancel-btn" data-raid-act="close">Close</button>' +
        '</div>' +
      '</div>';
  }

  // ---------- UI: Persistent Active Raid HUD ----------
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
        '<div class="raid-boss-wrap" id="raidBossWrap" hidden>' +
          '<div class="raid-boss-top"><b id="raidBossName"></b><span class="raid-boss-phase" id="raidBossPhase">PHASE I</span></div>' +
          '<div class="raid-boss-bar"><i id="raidBossFill"></i><span class="raid-boss-hp-num" id="raidBossHpText"></span></div>' +
        '</div>' +
        '<div class="raid-cast-banner" id="raidCastBar" hidden><i id="raidCastFill"></i><span id="raidCastText"></span></div>' +
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
      '<div class="raid-hud-bottom">' +
        '<div class="raid-move-hint">Click bridge or WASD / Arrows to walk · <b>SPACE</b> or button to DODGE</div>' +
        '<div class="raid-actions">' +
          '<button type="button" class="raid-revive-btn" id="raidReviveBtn" data-raid-act="revive" hidden></button>' +
          '<button type="button" class="raid-dodge-btn" id="raidDodgeBtn" data-raid-act="dodge"></button>' +
          '<button type="button" class="raid-leave-btn" data-raid-act="leave" title="Leave Raid">Leave</button>' +
        '</div>' +
      '</div>';
  }

  function updateHud() {
    if (!raid.on) return;
    buildHudDom();
    var st = STAGES[raid.stage] || STAGES[0];
    var rem = Math.max(0, raid.limit - raid.elapsed);

    var pipsEl = $('raidPips');
    if (pipsEl) {
      pipsEl.innerHTML = STAGES.map(function (s, i) {
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
        ? 'Advancing down the Starlight Bridge…'
        : (st.boss ? 'Sanctuary Boss Encounter' : (mobsLeft + (mobsLeft === 1 ? ' enemy' : ' enemies') + ' left · Bridge under fire'));
    }

    var clk = $('raidClock');
    if (clk) {
      clk.textContent = '⏱ ' + fmtClock(rem) + ' / ' + fmtClock(raid.limit);
      clk.className = 'raid-clock' + (rem < 90 ? ' warn' : '');
    }

    var bossWrap = $('raidBossWrap');
    var boss = st.boss ? findBoss() : null;
    if (bossWrap) {
      if (boss) {
        bossWrap.hidden = false;
        var bpct = Math.max(0, Math.min(100, (boss.hp / Math.max(1, boss.max)) * 100));
        $('raidBossName').textContent = '☠ ' + boss.n;
        $('raidBossPhase').textContent = bpct <= 50 ? 'PHASE II · ENRAGED' : 'PHASE I · SANCTUARY';
        $('raidBossHpText').textContent = fmtNum(boss.hp) + ' / ' + fmtNum(boss.max) + '  (' + bpct.toFixed(1) + '%)';
        $('raidBossFill').style.width = bpct.toFixed(1) + '%';
      } else {
        bossWrap.hidden = true;
      }
    }

    var castEl = $('raidCastBar');
    if (castEl) {
      if (raid.telegraph) {
        castEl.hidden = false;
        castEl.className = 'raid-cast-banner' + (raid.telegraph.donut ? ' donut' : '');
        var castLeft = Math.max(0, raid.telegraph.life - raid.telegraph.age);
        var cpct = Math.max(0, Math.min(100, (raid.telegraph.age / Math.max(0.1, raid.telegraph.life)) * 100));
        var cfill = $('raidCastFill');
        if (cfill) cfill.style.width = cpct.toFixed(1) + '%';
        var ctxt = $('raidCastText');
        if (ctxt) ctxt.textContent = '⚠ ' + (raid.telegraph.hint || raid.telegraph.name) + ' (' + castLeft.toFixed(1) + 's)';
      } else {
        castEl.hidden = true;
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

  function showResult(res) {
    var el = $('raidResult');
    var body = $('raidResultBody');
    if (!el || !body || !res) return;
    el.hidden = false;

    var dpsList = (res.party || []).slice().sort(function (a, b) { return (b.dps || 0) - (a.dps || 0); });
    var rew = res.rewards || { shards: 0, zeny: 0, echo: 0 };
    var rewParts = [];
    if (rew.shards > 0) rewParts.push(rew.shards + ' Astral Shards');
    if (rew.zeny > 0) rewParts.push(rew.zeny.toLocaleString('en-US') + ' Zeny');
    if (rew.echo > 0) rewParts.push(rew.echo + ' Echo Shards');

    body.innerHTML =
      '<div class="raid-result-card' + (res.cleared ? ' win' : ' fail') + '">' +
        '<div class="raid-result-head">' +
          '<span class="raid-eyebrow">' + (res.mode === 'party' ? 'ASTRAL RAID · PARTY' : 'ASTRAL RAID · SOLO') + '</span>' +
          '<h2>' + (res.cleared ? '🏆 Memory of Thanatos Defeated!' : '☠ Raid Ended') + '</h2>' +
          '<p class="raid-result-sub">' + escHtml(res.reason) + ' · Time: <b>' + fmtClock(res.secs) + '</b></p>' +
        '</div>' +
        '<div class="raid-result-dps">' +
          dpsList.map(function (p) {
            return '<div><span>' + escHtml(p.name) + ' <small>(' + escHtml(p.cls || '') + ')</small></span><b>' + fmtNum(p.dps || 0) + ' DPS</b></div>';
          }).join('') +
        '</div>' +
        '<div class="raid-rewards-bar">' +
          '<div><b>Rewards Earned</b><span>' + (rewParts.join(' · ') || 'None') + '</span></div>' +
        '</div>' +
        '<button type="button" class="raid-start-btn" data-raid-act="close-result">Return</button>' +
      '</div>';
  }

  function hideResult() {
    var el = $('raidResult');
    if (el) el.hidden = true;
  }

  // ---------- Delegated UI Click Binding ----------
  function bindEvents() {
    if (typeof document === 'undefined') return;
    document.addEventListener('click', function (e) {
      var modeBtn = e.target && e.target.closest ? e.target.closest('[data-raid-mode]') : null;
      if (modeBtn) {
        raid.lobbyMode = modeBtn.getAttribute('data-raid-mode') === 'party' ? 'party' : 'solo';
        raid.waitingPartyStart = false;
        renderLobby();
        return;
      }
      var actBtn = e.target && e.target.closest ? e.target.closest('[data-raid-act]') : null;
      if (!actBtn) return;
      var act = actBtn.getAttribute('data-raid-act');
      if (act === 'close') hideLobby();
      else if (act === 'close-result') hideResult();
      else if (act === 'start') start(raid.lobbyMode);
      else if (act === 'dodge') dodge();
      else if (act === 'revive') revive();
      else if (act === 'leave') {
        if (typeof ask === 'function') {
          ask('Leave the Astral Raid? Your current run will end.', function () { leave(); }, { yes: 'Leave Raid', no: 'Stay' });
        } else {
          leave();
        }
      } else if (act === 'plaza') {
        hideLobby();
        if (root.PGSocial && typeof root.PGSocial.enter === 'function') root.PGSocial.enter(0);
      }
    });
  }

  bindEvents();

  return {
    STAGES: STAGES,
    SOLO_LIMIT_S: SOLO_LIMIT_S,
    PARTY_LIMIT_S: PARTY_LIMIT_S,
    DAILY_LIMIT: DAILY_LIMIT,
    raid: raid,
    isGm: isGm,
    canEnter: canEnter,
    raidLeftToday: raidLeftToday,
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
    onStarted: onStarted,
    onSync: onSync,
    onRevive: onRevive,
    onEnded: onEnded,
    onError: onError,
    renderHud: renderHud,
    hideResult: hideResult
  };
});
