/* Rift Raid dungeon renderer (haven-v449).
 *
 * Draws the four-stage Thanatos raid INSIDE the game's own WebGL scene. The authority is the server
 * (functions/_lib/raid-engine.js); this file only interpolates, draws and converts input to intents.
 *
 * What it shares with the field, deliberately:
 *   - the scene, camera, renderer and frame loop (there is no second canvas and no second loop)
 *   - the class skins (assets/class_skins_data.js) and the native mob frames (assets/mobs/v1)
 *   - the same lighting palette as the Astral field
 * What it owns:
 *   - four raid layouts (assets/astral-raid-scenes.js) on their own patch of the plane
 *   - party proxies, enemy billboards, telegraph meshes and the in-viewport HUD
 *
 * Cost: the renderer sends one move intent per destination (at most one every 180 ms locally, which
 * the API further throttles to 220 ms), never a per-frame position. Nothing here calls the network.
 */
(function (root) {
  'use strict';
  const THREE = root.THREE;
  const $ = id => document.getElementById(id);
  const num = (n, f = 0) => (Number.isFinite(Number(n)) ? Number(n) : f);
  const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
  const lerp = (a, b, k) => a + (b - a) * k;
  const esc = v => (typeof root.esc === 'function' ? root.esc(v) : String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])));

  const ORIGIN = -320;              // raid space sits away from the field's 0..-245 route
  const MODE_MONSTERS = 88;         // a map id that has no native field, so nothing else loads
  const VISUAL = { member: 2.1, mob: 2.7, boss: 5.0, anchor: 2.9 };
  const WALK_SPEED = 9.6;           // matches the engine's raid walk speed
  const TELEGRAPH = { fill: 0xff7a4a, edge: 0xffd9a0, ward: 0x8ff0a0 };

  const D = {
    on: false,
    runId: '',
    run: null,
    stageKey: '',
    world: null,
    mount: null,
    hooks: null,
    hero: null,
    entities: new Map(),
    telegraphs: new Map(),
    snapshots: [],
    clockOffset: 0,
    myId: 0,
    targetId: '',
    lastMoveAt: 0,
    pendingMove: null,
    inputBound: false,
    keys: new Set(),
    stats: { frames: 0, moves: 0, focus: 0 },
  };

  const me = () => ((D.run && D.run.members) || []).find(m => m.id === D.myId) || ((D.run && D.run.members) || [])[0] || null;

  // ---------------------------------------------------------------- clock ------
  function serverNow() {
    if (!D.snapshots.length) return Date.now() + D.clockOffset;
    const offsets = D.snapshots.map(s => s.at - s.received).sort((a, b) => a - b);
    return Date.now() + offsets[Math.floor(offsets.length / 2)];
  }
  function noteSnapshot(run, receivedAt = Date.now()) {
    const at = num(run && run.serverNow, 0);
    if (at <= 0) return;
    // A settled run's snapshot carries the frozen server clock of the last tick, so it must never be
    // used to calibrate the live clock — that would shift every countdown by the age of the run.
    if (run.state && run.state !== 'active') return;
    D.snapshots.push({ at, received: receivedAt });
    if (D.snapshots.length > 9) D.snapshots.shift();
    if (D.snapshots.length === 1) D.clockOffset = at - receivedAt;
  }

  // ---------------------------------------------------------------- art --------
  // Native mob frames: the same files the field loads, so the raid's monsters are the game's own art.
  const mobTextures = new Map();
  function mobTexture(spriteId, frame = 0) {
    const key = spriteId + ':' + frame;
    if (mobTextures.has(key)) return mobTextures.get(key);
    const texture = new THREE.Texture();
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.NearestFilter;
    texture.generateMipmaps = false;
    mobTextures.set(key, texture);
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.onload = () => { texture.image = image; texture.needsUpdate = true; };
    image.onerror = () => { mobTextures.delete(key); };
    // frame 0 is the idle cell of the 24-frame sheet, laid out 16 actions x 8 directions:
    // the field indexes (atk?16:run?8:0)+dir, so the first cell is the front-facing idle pose.
    image.src = 'assets/mobs/v1/' + spriteId + '-' + frame + '.png';
    return texture;
  }

  // Party art: the game's class skin files, read from the same manifest the field uses. Each member is
  // their own class and gender, so a trio looks like three characters, not three copies.
  const skinCache = new Map();
  function skinUrl(cls, sex, kind = 'S') {
    const skins = root.CLASS_SKINS;
    if (!skins || !skins.classes) return '';
    const set = skins.classes[cls] && (skins.classes[cls][sex] || skins.classes[cls].m);
    if (!set || !set.files) return '';
    const file = kind === 'attack' ? set.files.attack : (set.files[kind] || set.files.S || set.files.SE);
    return file ? encodeURI((skins.dir || 'Updates/Sprite') + '/' + file) : '';
  }
  function skinTexture(cls, sex, kind) {
    const url = skinUrl(cls, sex, kind);
    if (!url) return null;
    const key = url;
    if (skinCache.has(key)) return skinCache.get(key);
    const texture = new THREE.Texture();
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.NearestFilter;
    texture.generateMipmaps = false;
    skinCache.set(key, texture);
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.onload = () => { texture.image = image; texture.needsUpdate = true; };
    image.onerror = () => { skinCache.delete(key); };
    image.src = url;
    return texture;
  }

  function billboard(texture, height) {
    const material = new THREE.SpriteMaterial({ map: texture, transparent: true, alphaTest: 0.06, depthWrite: false });
    const sprite = new THREE.Sprite(material);
    sprite.center.set(0.5, 0.02);
    const geoScale = height / 512;
    sprite.scale.set(512 * geoScale * 1.0, height, 1);
    return sprite;
  }

  // A generated silhouette is the honest fallback: it is drawn, not borrowed, and it still reads as a
  // threat (crystal body, horns, one bright eye) on the first frame before the sheet arrives.
  function silhouette(kind, tint) {
    const cv = document.createElement('canvas');
    cv.width = 128; cv.height = 128;
    const ctx = cv.getContext('2d');
    ctx.translate(64, 64);
    const glow = tint || '#a88fe5';
    if (kind === 'anchor') {
      ctx.strokeStyle = glow; ctx.lineWidth = 4;
      for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.ellipse(0, 0, 52 - i * 12, 18 + i * 10, i * 0.7, 0, Math.PI * 2); ctx.stroke(); }
    } else {
      const boss = kind === 'boss';
      ctx.fillStyle = boss ? '#3a2a4e' : '#2a3350';
      ctx.beginPath(); ctx.moveTo(0, -56); ctx.lineTo(38, -8); ctx.lineTo(26, 48); ctx.lineTo(-26, 48); ctx.lineTo(-38, -8); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = glow; ctx.lineWidth = 3.5; ctx.stroke();
      ctx.fillStyle = glow;
      ctx.beginPath(); ctx.moveTo(-22, -44); ctx.lineTo(-46, -66); ctx.lineTo(-12, -50); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(22, -44); ctx.lineTo(46, -66); ctx.lineTo(12, -50); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.ellipse(0, -6, 9, 5, 0, 0, Math.PI * 2); ctx.fill();
    }
    const tex = new THREE.CanvasTexture(cv);
    tex.minFilter = THREE.LinearFilter;
    return tex;
  }

  // ---------------------------------------------------------------- scene ------
  function ensureWorld(stageKey) {
    if (D.world && D.stageKey === stageKey) return D.world;
    disposeWorld();
    const scenes = root.PGAstralRaidScenes;
    if (!scenes) return null;
    let world;
    try { world = scenes.build(stageKey, {}); } catch (error) { console.error('Raid scenery failed', error); return null; }
    D.world = world;
    D.stageKey = stageKey;
    D.mount = new THREE.Group();
    D.mount.position.set(0, 0, ORIGIN);
    for (const child of [...world.scene.children]) D.mount.add(child);
    D.sky = world.scene.background;
    D.fog = world.scene.fog;
    return world;
  }

  // The exit portal is a real thing on the floor: a glowing gate at the layout's own exit point that
  // lights up the moment the stage objective is complete. Walking into it sends the one interaction
  // the server accepts for it; nothing here advances a stage.
  function portalMesh() {
    if (D.portal) return D.portal;
    const group = new THREE.Group();
    const ringMat = new THREE.MeshBasicMaterial({ color: 0xffd9a0, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.5, 0.14, 8, 30), ringMat);
    ring.position.y = 1.7;
    group.add(ring);
    const ground = new THREE.Mesh(
      new THREE.CircleGeometry(1.7, 28),
      new THREE.MeshBasicMaterial({ color: 0xffd9a0, transparent: true, opacity: 0.14, depthWrite: false, side: THREE.DoubleSide }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = 0.06;
    group.add(ground);
    group.visible = false;
    D.mount.add(group);
    D.portal = { group, ring, ringMat, ground, open: false };
    return D.portal;
  }

  function syncPortal(run) {
    const b = D.world && D.world;
    if (!D.mount) return;
    const portal = portalMesh();
    const at = b ? b.exit : null;
    if (!at) { portal.group.visible = false; return; }
    portal.group.position.set(at.x, 0, at.z);
    portal.open = run.stageCleared === true;
    portal.group.visible = portal.open;
  }

  // Online play is about the party, not just the ground: a stack of small markers under the HUD
  // shows every teammate's health so a reviver knows who to reach. Built from the same snapshot.
  function hudPartyRows(run) {
    return (run.members || []).map(m => {
      const pct = clamp(num(m.hp) / Math.max(1, num(m.maxHp)) * 100, 0, 100);
      return '<div class="raid-hud-member ' + (m.downed ? 'down ' : '') + (m.id === D.myId ? 'you' : '') + '">' +
        '<div class="raid-hud-member-head"><span>' + esc(m.name || '') + '</span><small>' + (m.downed ? 'DOWN' : Math.round(pct) + '%') + '</small></div>' +
        '<div class="raid-hud-bar"><i style="width:' + pct.toFixed(1) + '%"></i></div></div>';
    }).join('');
  }

  function disposeWorld() {
    for (const id of [...D.entities.keys()]) dropEntity(id);
    for (const id of [...D.telegraphs.keys()]) dropTelegraph(id);
    if (D.mount && D.mount.parent) D.mount.parent.remove(D.mount);
    D.mount = null;
    D.portal = null;
    D.pendingMove = null;
    if (D.world) { try { D.world.dispose(); } catch (_) {} }
    D.world = null;
    D.stageKey = '';
  }

  // index.html calls this from its own draw(): true means the raid is on screen. The field's HUD,
  // drops and mobs are already hidden by the pre-draw block.
  // The dungeon carries its own lighting rig (assets/astral-raid-scenes.js), exactly like the Astral
  // map does, so the field's daylight rig is switched off while a raid is on screen — otherwise the
  // two add up and the paving blows out to white. The field's values are saved on the way in and put
  // back on the way out, so a normal field frame is unchanged by this feature.
  const RAID_LIGHT = { hemi: 0, sun: 0 };
  function applyLook(scene) {
    if (D.look && D.look.scene === scene) return;
    const look = { scene, background: scene.background, fog: scene.fog, hemi: [], sun: [] };
    // Only the field's own lights are dimmed. The dungeon carries its own rig inside the mount, and
    // touching those would flatten the layout's authored lighting.
    const own = new Set();
    if (D.mount) D.mount.traverse(o => own.add(o));
    scene.traverse(o => {
      if (own.has(o)) return;
      if (o.isHemisphereLight) look.hemi.push({ light: o, intensity: o.intensity });
      else if (o.isDirectionalLight) look.sun.push({ light: o, intensity: o.intensity });
    });
    D.look = look;
    for (const l of look.hemi) l.light.intensity = RAID_LIGHT.hemi;
    for (const l of look.sun) l.light.intensity = RAID_LIGHT.sun;
  }
  // Called from the field's own draw() when the raid stops being on screen.
  function detach() {
    const look = D.look;
    if (look) {
      for (const l of look.hemi) l.light.intensity = l.intensity;
      for (const l of look.sun) l.light.intensity = l.intensity;
      // The field rebuilds its sky on a map/boss key change, and the key does not change just
      // because a raid ended, so the field's own background/fog are put back here.
      if (look.scene.background === D.sky) look.scene.background = look.background;
      if (look.scene.fog === D.fog) look.scene.fog = look.fog;
      D.look = null;
    }
    if (D.mount && D.mount.parent) D.mount.parent.remove(D.mount);
    D.hudDirty = true;
    return true;
  }

  function attach() {
    if (!D.on) return false;
    const scene = hookScene();
    if (!scene) return false;
    if (!D.world && !ensureWorld(D.stageKey || 'approach')) return false;
    if (D.mount && D.mount.parent !== scene) scene.add(D.mount);
    applyLook(scene);
    if (D.sky && scene.background !== D.sky) scene.background = D.sky;
    if (D.fog && scene.fog !== D.fog) scene.fog = D.fog;
    return true;
  }

  // ---------------------------------------------------------------- start ------
  function begin(frameHost, runId, stageKey, myId) {
    if (frameHost && typeof frameHost === 'object' && (frameHost.scene || frameHost.canvas || frameHost.player)) D.hooks = frameHost;
    D.on = true;
    D.runId = runId || '';
    D.myId = Number(myId) || 0;
    D.stageKey = stageKey || 'approach';
    if (D.world && D.world.stage !== D.stageKey) disposeWorld();
    const spawn = stageSpawn();
    D.heroPos = { x: spawn.x, z: spawn.z };
    D.dest = null;
    D.lastMoveAt = 0;
    if (D.hooks && D.hooks.map) D.hooks.map(MODE_MONSTERS);
    hudVisible(true);
    bindInput();
  }

  function end() {
    D.on = false;
    disposeWorld();
    hudVisible(false);
    D.run = null;
    D.snapshots.length = 0;
    D.dest = null;
    D.portal = null;
    if (D.hooks && D.hooks.map) D.hooks.map(null);
  }

  function stageSpawn() {
    const b = D.world && D.world.bounds;
    if (!b) return { x: 0, z: 8 };
    if (b.kind === 'circle') return { x: 0, z: b.r - 2.2 };
    return { x: 0, z: b.maxZ - 2.2 };
  }

  // ---------------------------------------------------------------- input ------
  function hookCanvas() {
    const h = D.hooks;
    if (!h) return null;
    return typeof h.canvas === 'function' ? h.canvas() : h.canvas || null;
  }
  function hookCamera() {
    const h = D.hooks;
    if (!h) return null;
    return typeof h.camera === 'function' ? h.camera() : h.camera || null;
  }
  function hookScene() {
    const h = D.hooks;
    if (!h) return null;
    return typeof h.scene === 'function' ? h.scene() : h.scene || null;
  }

  function bindInput() {
    if (D.inputBound) return;
    const canvas = hookCanvas();
    if (!canvas) return;
    D.inputBound = true;

    const destOf = (clientX, clientY) => {
      const host = hookCamera();
      if (!host) return null;
      const rect = canvas.getBoundingClientRect();
      const ndc = new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
      const raycaster = new THREE.Raycaster();
      raycaster.setFromCamera(ndc, host);
      const hit = new THREE.Vector3();
      if (!raycaster.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), hit)) return null;
      return { x: hit.x, z: hit.z - ORIGIN };
    };

    let pointer = null;
    canvas.addEventListener('pointerdown', event => {
      if (!D.on || event.button > 0) return;
      pointer = { id: event.pointerId, x: event.clientX, y: event.clientY, moved: 0 };
    });
    canvas.addEventListener('pointermove', event => {
      if (!pointer || pointer.id !== event.pointerId) return;
      pointer.moved += Math.abs(event.clientX - pointer.x) + Math.abs(event.clientY - pointer.y);
      pointer.x = event.clientX; pointer.y = event.clientY;
    });
    canvas.addEventListener('pointerup', event => {
      if (!D.on || !pointer || pointer.id !== event.pointerId) return;
      const moved = pointer.moved;
      pointer = null;
      if (moved > 8) return;                       // a drag is the camera
      const target = pickEnemy(event.clientX, event.clientY);
      if (target) { requestFocus(target); return; }
      const dest = destOf(event.clientX, event.clientY);
      if (dest) requestMove(dest.x, dest.z);
    });
    canvas.addEventListener('pointercancel', () => { pointer = null; });

    root.addEventListener('keydown', event => {
      if (!D.on) return;
      if (event.target && /input|textarea|select/i.test(event.target.tagName || '')) return;
      const key = String(event.key || '').toLowerCase();
      if (!'wasd'.startsWith(key[0] || 'x') && !key.startsWith('arrow')) return;
      D.keys.add(key);
      event.preventDefault();
    });
    root.addEventListener('keyup', event => { D.keys.delete(String(event.key || '').toLowerCase()); });
    root.addEventListener('blur', () => D.keys.clear());
  }

  // Screen-space pick: project every live enemy and take the closest one within a thumb's radius.
  function pickEnemy(clientX, clientY) {
    const cam = hookCamera();
    const canvas = hookCanvas();
    if (!cam || !canvas || !D.mount) return '';
    const rect = canvas.getBoundingClientRect();
    const px = clientX - rect.left, py = clientY - rect.top;
    let best = '', bestD = 64 * 64;
    const v = new THREE.Vector3();
    for (const ent of D.entities.values()) {
      if (!ent.id || ent.kind === 'member' || ent.kind === 'self' || ent.dead) continue;
      v.set(ent.group.position.x, VISUAL.mob * 0.55, ent.group.position.z + ORIGIN).project(cam);
      const sx = (v.x + 1) / 2 * rect.width, sy = (1 - v.y) / 2 * rect.height;
      const d = (sx - px) * (sx - px) + (sy - py) * (sy - py);
      if (d < bestD) { bestD = d; best = ent.id; }
    }
    return best;
  }

  function keyVector() {
    let x = 0, z = 0;
    if (D.keys.has('a') || D.keys.has('arrowleft')) x -= 1;
    if (D.keys.has('d') || D.keys.has('arrowright')) x += 1;
    if (D.keys.has('w') || D.keys.has('arrowup')) z -= 1;
    if (D.keys.has('s') || D.keys.has('arrowdown')) z += 1;
    return x || z ? { x: x * 4.6, z: z * 4.6 } : null;
  }

  function requestMove(x, z) {
    const mine = me();
    if (!D.on || !mine || mine.downed || mine.hp <= 0) return;
    const now = performance.now();
    if (now - D.lastMoveAt < 180) { D.pendingMove = { x, z }; return; }
    D.lastMoveAt = now;
    D.stats.moves++;
    // The destination is recorded, not teleported to: the hero walks there at the raid's own speed,
    // and the server confirms the same arrival. The field's `pl` follows this point every frame, so
    // the game's real hero sprite is the one walking.
    D.dest = { x, z };
    D.destAt = now;
    // Movement intent reaches the room, which advances the walk from the destination. Between
    // snapshots the hero is drawn walking toward the same point at the same speed, so the client
    // never has to send a position per frame to look smooth.
    if (root.PGRaid && typeof root.PGRaid.move === 'function') root.PGRaid.move(x, z);
    hudTip('Walking to the marker — drag to look, tap an enemy to focus');
  }

  function requestFocus(id) {
    if (!D.on || !id) return;
    D.targetId = id;
    D.stats.focus++;
    const ent = D.entities.get('e' + id);
    if (root.PGRaid && typeof root.PGRaid.focus === 'function') root.PGRaid.focus(id);
    hudTip(ent ? 'Focused: ' + (ent.name || id) : 'Focused');
  }

  // ---------------------------------------------------------------- entities ---
  function entityFor(key, kind, ref) {
    if (D.entities.has(key)) return D.entities.get(key);
    const group = new THREE.Group();
    let sprite;
    if (kind === 'member') {
      const cls = (ref && ref.cls) || 'Novice', sex = (ref && ref.sex) || 'm';
      const texture = skinTexture(cls, sex, 'S') || skinTexture('Novice', 'm', 'S');
      sprite = texture ? billboard(texture, VISUAL.member * 1.25) : billboard(silhouette('member', '#67dce5'), VISUAL.member);
      sprite.userData.cls = cls; sprite.userData.sex = sex;
    } else {
      const spriteId = (ref && ref.spriteId) || 0;
      const texture = spriteId ? mobTexture(spriteId, 0) : null;
      const size = kind === 'boss' ? VISUAL.boss : kind === 'anchor' ? VISUAL.anchor : VISUAL.mob;
      sprite = billboard(texture || silhouette(kind), size);
      sprite.userData.spriteId = spriteId;
    }
    group.add(sprite);
    const shadow = new THREE.Mesh(
      new THREE.CircleGeometry(0.9, 18),
      new THREE.MeshBasicMaterial({ color: 0x05070f, transparent: true, opacity: 0.45, depthWrite: false }),
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.03;
    group.add(shadow);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0x67dce5, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide });
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.82, 1.0, 26), ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.05;
    group.add(ring);
    const ent = {
      key, kind, group, sprite, shadow, ring, ringMat,
      id: '', name: '', cls: '', x: 0, z: 0, tx: 0, tz: 0,
      hp: 1, maxHp: 1, lastHp: 1, hitAt: 0, downed: false, dead: false,
      casting: null, face: 1, appearedAt: performance.now(),
    };
    D.mount.add(group);
    D.entities.set(key, ent);
    return ent;
  }

  function dropEntity(key) {
    const ent = D.entities.get(key);
    if (!ent) return;
    if (ent.group.parent) ent.group.parent.remove(ent.group);
    ent.group.traverse(o => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) { if (o.material.map && o.material.map.userData && o.material.map.userData.owned) o.material.map.dispose(); o.material.dispose(); }
    });
    D.entities.delete(key);
  }

  function reconcile(run) {
    if (!run || !D.mount) return;
    D.run = run;
    const members = new Set(), enemies = new Set();
    for (const m of run.members || []) {
      const key = 'm' + m.id;
      members.add(key);
      const ent = entityFor(key, 'member', m);
      ent.id = m.id;
      ent.name = m.name || '';
      ent.x = num(m.x); ent.z = num(m.z);
      ent.tx = ent.x; ent.tz = ent.z;
      ent.hp = num(m.hp); ent.maxHp = Math.max(1, num(m.maxHp));
      ent.downed = m.downed === true;
      ent.group.visible = m.id !== D.myId;       // the local player is the game's real hero sprite
      if (ent.sprite.userData.cls !== m.cls && ent.sprite.material) {
        const tex = skinTexture(m.cls || 'Novice', m.sex || 'm', 'S');
        if (tex) { ent.sprite.material.map = tex; ent.sprite.material.needsUpdate = true; ent.sprite.userData.cls = m.cls; }
      }
    }
    for (const e of run.enemies || []) {
      const key = 'e' + e.id;
      enemies.add(key);
      const ent = entityFor(key, e.kind, e);
      ent.id = e.id;
      ent.name = e.name || '';
      ent.x = num(e.x); ent.z = num(e.z);
      ent.tx = ent.x; ent.tz = ent.z;
      ent.hp = num(e.hp); ent.maxHp = Math.max(1, num(e.maxHp));
      ent.dead = e.dead === true || ent.hp <= 0;
      ent.casting = e.casting || null;
      if (ent.hp < ent.lastHp) ent.hitAt = performance.now();
      ent.lastHp = ent.hp;
      ent.group.visible = !ent.dead;
      if (ent.sprite.userData.spriteId !== e.spriteId) {
        const tex = e.spriteId ? mobTexture(e.spriteId, 0) : null;
        if (tex && ent.sprite.material) { ent.sprite.material.map = tex; ent.sprite.material.needsUpdate = true; ent.sprite.userData.spriteId = e.spriteId; }
      }
    }
    for (const key of [...D.entities.keys()]) {
      if (key[0] === 'm' && !members.has(key)) dropEntity(key);
      if (key[0] === 'e' && !enemies.has(key)) dropEntity(key);
    }
    syncTelegraphs(run);
    syncPortal(run);
  }

  // ---------------------------------------------------------------- telegraphs -
  function telegraphFor(kind, id) {
    const key = kind + ':' + id;
    if (D.telegraphs.has(key)) return D.telegraphs.get(key);
    const group = new THREE.Group();
    const fillMat = new THREE.MeshBasicMaterial({ color: TELEGRAPH.fill, transparent: true, opacity: 0.16, depthWrite: false, side: THREE.DoubleSide });
    const edgeMat = new THREE.MeshBasicMaterial({ color: TELEGRAPH.edge, transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide });
    const fill = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), fillMat);
    fill.rotation.x = -Math.PI / 2;
    fill.position.y = 0.055;
    group.add(fill);
    const edge = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), edgeMat);
    edge.rotation.x = -Math.PI / 2;
    edge.position.y = 0.065;
    group.add(edge);
    const te = { key, kind, id, group, fill, edge, fillMat, edgeMat, ward: null, wardFill: null };
    D.mount.add(group);
    D.telegraphs.set(key, te);
    return te;
  }

  function dropTelegraph(key) {
    const te = D.telegraphs.get(key);
    if (!te) return;
    for (const part of [te.group, te.ward, te.wardFill]) {
      if (!part) continue;
      if (part.parent) part.parent.remove(part);
      part.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
    }
    D.telegraphs.delete(key);
  }

  function wardMeshes(te, radius) {
    if (!te.ward) {
      te.ward = new THREE.Mesh(
        new THREE.TorusGeometry(1, 0.05, 4, 72),
        new THREE.MeshBasicMaterial({ color: TELEGRAPH.ward, transparent: true, opacity: 0.95, depthWrite: false }),
      );
      te.ward.rotation.x = -Math.PI / 2;
      te.wardFill = new THREE.Mesh(
        new THREE.CircleGeometry(1, 48),
        new THREE.MeshBasicMaterial({ color: TELEGRAPH.ward, transparent: true, opacity: 0.22, depthWrite: false }),
      );
      te.wardFill.rotation.x = -Math.PI / 2;
      D.mount.add(te.ward, te.wardFill);
    }
    te.ward.scale.setScalar(radius);
    te.wardFill.scale.setScalar(radius);
  }

  function syncTelegraphs(run) {
    const live = new Set();
    for (const mech of run.mechanics || []) {
      if (mech.resolvedAt || !mech.endsAt) continue;
      live.add(mech.kind + ':' + mech.id);
      if (mech.kind === 'sweep') {
        const te = telegraphFor('sweep', mech.id);
        const width = (mech.halfWidth || 2) * 2, depth = 42;
        te.fill.scale.set(width, depth, 1);
        te.fill.position.set(mech.x, 0.055, 0);
        te.edge.scale.set(width + 0.3, depth, 1);
        te.edge.position.set(mech.x, 0.065, 0);
      } else if (mech.kind === 'soul-cleave') {
        const te = telegraphFor('soul-cleave', mech.id);
        const length = mech.length || 22, half = mech.halfWidth || 2.6, angle = mech.angle || 0;
        const cx = mech.originX + Math.cos(angle) * length / 2, cz = mech.originZ + Math.sin(angle) * length / 2;
        // A plane rotated about y by -angle inside the ground plane: texture x runs along the cone.
        te.fill.scale.set(length, half * 2, 1);
        te.fill.rotation.set(-Math.PI / 2, 0, -angle);
        te.fill.position.set(cx, 0.055, cz);
        te.edge.scale.set(length, half * 2 + 0.18, 1);
        te.edge.rotation.set(-Math.PI / 2, 0, -angle);
        te.edge.position.set(cx, 0.065, cz);
      } else if (mech.kind === 'astral-cataclysm') {
        const te = telegraphFor('cataclysm', mech.id);
        // The danger is the whole floor; the ward is the only safe ground and is always drawn.
        te.fill.scale.set(120, 80, 1);
        te.fill.position.set(0, 0.05, 0);
        te.fillMat.color.setHex(0x8a2a3a);
        te.edge.scale.set(0.01, 0.01, 1);
        wardMeshes(te, mech.safeRadius || 3.4);
        te.ward.position.set(mech.safeX, 0.08, mech.safeZ);
        te.wardFill.position.set(mech.safeX, 0.075, mech.safeZ);
      } else if (mech.kind === 'ritual') {
        const te = telegraphFor('ritual', mech.id);
        te.fill.scale.set(0.01, 0.01, 1);
        te.edge.scale.set(0.01, 0.01, 1);
      }
    }
    for (const [key, te] of [...D.telegraphs]) if (!live.has(key)) dropTelegraph(key);
  }

  // ---------------------------------------------------------------- frame -------
  // Called from the game's own draw(): interpolation, health rings, hit flash, ward pulse.
  function tick(dt) {
    if (!D.on || !D.mount) return;
    const now = performance.now();
    // dt is optional and a 0 means "figure it out": the field's draw() passes 0 because the raid keeps
    // its own clock, so a zero must never freeze the walk. The real per-frame delta is capped so a tab
    // that was away snaps instead of sliding.
    if (!Number.isFinite(dt) || dt <= 0) dt = D.lastTick ? Math.min(0.1, (now - D.lastTick) / 1000) : 0.016;
    D.lastTick = now;
    const k = clamp(dt * 10, 0, 1);
    // Walk toward the latest destination. The hero is drawn here; the server advances the same walk.
    if (D.dest && D.heroPos) {
      const dx = D.dest.x - D.heroPos.x, dz = D.dest.z - D.heroPos.z;
      const dist = Math.hypot(dx, dz);
      if (dist < 0.08) { D.heroPos.x = D.dest.x; D.heroPos.z = D.dest.z; D.dest = null; D.walking = false; }
      else {
        const step = Math.min(dist, WALK_SPEED * dt);
        D.heroPos.x += dx / dist * step;
        D.heroPos.z += dz / dist * step;
        D.walking = true;
      }
    }
    if (!D.dest) D.walking = false;
    // The field's hero sprite is the raid's hero: it walks while the raid walks (index.html reads
    // walking() through PGField's proxy hero state).
    if (D.hooks && D.hooks.player) { const p = typeof D.hooks.player === 'function' ? D.hooks.player() : D.hooks.player; if (p) p.run = !!D.walking; }
    for (const ent of D.entities.values()) {
      if (ent.kind === 'member' && ent.id === D.myId) { ent.group.visible = false; continue; }
      ent.x = lerp(ent.x, ent.tx, k);
      ent.z = lerp(ent.z, ent.tz, k);
      ent.group.position.set(ent.x, 0, ent.z);
      const flash = Math.max(0, 1 - (now - ent.hitAt) / 190);
      if (ent.sprite.material) {
        ent.sprite.material.color.setRGB(1, 1 - flash * 0.55, 1 - flash * 0.75);
        ent.sprite.material.opacity = ent.downed ? 0.42 : 1;
        ent.sprite.material.transparent = true;
      }
      const focused = ent.id && ent.id === D.targetId;
      ent.ringMat.opacity = focused ? 0.9 : ent.downed ? 0.5 : 0;
      ent.ringMat.color.setHex(ent.downed ? 0xff6a6a : focused ? 0xffd9a0 : 0x67dce5);
      ent.ring.scale.setScalar(ent.kind === 'boss' ? 1.9 : 1.05);
      if (ent.kind === 'boss' || ent.kind === 'anchor') {
        ent.group.position.y = Math.sin(now / 900 + ent.x) * 0.05;
      }
    }
    // The exit portal: pulse it, and treat "walk into it" as the interaction. The server decides
    // whether the stage is actually cleared, so a client that guesses wrong gets a plain refusal.
    if (D.portal && D.portal.open) {
      const since = (now - (D.lastPortalAt || 0)) / 1000;
      D.portal.ring.rotation.z = since * 0.7;
      D.portal.ringMat.opacity = 0.45 + 0.2 * Math.sin(now / 380);
      D.portal.ground.material.opacity = 0.12 + 0.06 * Math.sin(now / 380);
      const mine2 = me();
      if (mine2 && !mine2.downed && now - (D.lastPortalAt || 0) > 1500) {
        const dx = num(mine2.x) - D.portal.group.position.x, dz = num(mine2.z) - D.portal.group.position.z;
        if (dx * dx + dz * dz < 2.6 * 2.6) {
          D.lastPortalAt = now;
          if (root.PGRaid && typeof root.PGRaid.portal === 'function') root.PGRaid.portal();
        }
      }
    }
    const at = serverNow();
    for (const te of D.telegraphs.values()) {
      const mech = D.run && (D.run.mechanics || []).find(m => m.id === te.id && !m.resolvedAt);
      if (!mech) continue;
      const total = Math.max(1, mech.endsAt - mech.startsAt);
      const left = clamp((mech.endsAt - at) / total, 0, 1);
      te.fillMat.opacity = 0.1 + (1 - left) * 0.24;
      te.edgeMat.opacity = 0.5 + 0.4 * Math.abs(Math.sin(at / 150));
      if (te.wardFill) te.wardFill.material.opacity = 0.18 + 0.08 * Math.sin(at / 220);
    }
    if (D.world) D.world.update(now / 1000);
    D.hudAt = D.hudAt || 0;
    if (D.run && now - D.hudAt > 180) { D.hudAt = now; hudUpdate(D.run); }
    // Keyboard: one intent every 180 ms while a key is held, never one per frame.
    const vec = keyVector();
    if (vec && D.heroPos && now - D.lastMoveAt >= 180) {
      requestMove(D.heroPos.x + vec.x, D.heroPos.z + vec.z);
    } else if (D.pendingMove && now - D.lastMoveAt >= 180) {
      const p = D.pendingMove;
      D.pendingMove = null;
      requestMove(p.x, p.z);
    }
    D.stats.frames++;
  }

  // ---------------------------------------------------------------- HUD --------
  const HUD_HTML = `<div class="raid-hud" id="raidHud" hidden>
  <div class="raid-hud-top">
    <div class="raid-hud-stage"><span class="raid-hud-step" id="raidHudStep">1 / 4</span><b id="raidHudStage">Starlit Approach</b><small id="raidHudObjective">Clear the packs</small></div>
    <div class="raid-hud-timer"><span id="raidHudClock">0:00</span><small>stage</small></div>
  </div>
  <div class="raid-hud-warning" id="raidHudWarning" hidden><span></span><b></b></div>
  <div class="raid-hud-boss" id="raidHudBoss" hidden>
    <div class="raid-hud-boss-head"><span id="raidHudBossName">Thanatos</span><small id="raidHudBossPct">100%</small></div>
    <div class="raid-hud-bar"><i id="raidHudBossBar"></i></div>
  </div>
  <div class="raid-hud-party" id="raidHudParty"></div>
  <div class="raid-hud-tip" id="raidHudTip">Tap the ground to move · tap an enemy to focus</div>
</div>`;

  function hudVisible(on) {
    let el = $('raidHud');
    if (on && !el) {
      const holder = document.createElement('div');
      holder.innerHTML = HUD_HTML.trim();
      el = holder.firstElementChild;
      const layer = $('raidHudLayer') || document.body;
      layer.appendChild(el);
    }
    if (el) el.hidden = !on;
  }
  function hudTip(text) {
    const tip = $('raidHudTip');
    if (!tip) return;
    tip.textContent = text;
    clearTimeout(D.tipTimer);
    D.tipTimer = setTimeout(() => { const t = $('raidHudTip'); if (t) t.textContent = 'Tap the ground to move · tap an enemy to focus'; }, 2800);
  }
  function setText(id, text) { const el = $(id); if (el) el.textContent = text; }
  function clock(ms) {
    const s = Math.max(0, Math.ceil(num(ms) / 1000));
    return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
  }
  function hudUpdate(run) {
    if (!run || !D.on) return;
    setText('raidHudStep', (num(run.stageIndex, 0) + 1) + ' / 4');
    setText('raidHudStage', run.stageName || 'Rift Raid');
    const boss = (run.enemies || []).find(e => e.kind === 'boss');
    const box = $('raidHudBoss');
    if (boss) {
      if (box) box.hidden = false;
      setText('raidHudBossName', boss.name || 'Thanatos');
      const pct = Math.round((num(boss.hp) / Math.max(1, num(boss.maxHp))) * 100);
      setText('raidHudBossPct', pct + '%');
      const bar = $('raidHudBossBar');
      if (bar) bar.style.width = clamp(pct, 0, 100) + '%';
      setText('raidHudObjective', 'Defeat Thanatos');
    } else {
      if (box) box.hidden = true;
      const summary = run.summary || {};
      const left = num(summary.requiredAlive, 0);
      setText('raidHudObjective', run.stageCleared ? 'Exit portal open — walk into it' : left + ' enem' + (left === 1 ? 'y' : 'ies') + ' left');
    }
    setText('raidHudClock', clock(num(run.stageEndsAt) - serverNow()));
    const party = $('raidHudParty');
    if (party) party.innerHTML = hudPartyRows(run);
    const warn = $('raidHudWarning');
    if (warn) {
      const at = serverNow();
      const live = (run.mechanics || []).filter(m => !m.resolvedAt && m.endsAt > at).sort((a, b) => a.endsAt - b.endsAt)[0];
      if (live) {
        const label = live.kind === 'soul-cleave' ? 'SOUL CLEAVE · leave the cone'
          : live.kind === 'astral-cataclysm' ? 'ASTRAL CATACLYSM · get in the ward'
            : live.kind === 'ritual' ? 'RITUAL OF RUIN · kill the sources'
              : 'ASTRAL SWEEP · leave the strip';
        warn.hidden = false;
        warn.dataset.kind = live.kind;
        const span = warn.querySelector('span'), bold = warn.querySelector('b');
        if (span) span.textContent = label;
        if (bold) bold.textContent = Math.max(0, (num(live.endsAt) - at) / 1000).toFixed(1) + 's';
      } else warn.hidden = true;
    }
  }

  root.PGRaidDungeon = {
    begin, end, attach, detach, tick, reconcile, noteSnapshot, hudUpdate, bindInput,
    requestMove, requestFocus, serverNow, stageSpawn,
    // The dungeon lives on its own patch of the plane, so everything the field reads has to be
    // shifted by this much: heroPos() is local raid space, and the field's player/camera sit at
    // local + origin.
    origin: ORIGIN,
    heroPos: () => D.heroPos,
    get active() { return D.on; },
    get stageKey() { return D.stageKey; },
    get targetId() { return D.targetId; },
    get stats() { return D.stats; },
    _state: D,
    _pick: (x, y) => pickEnemy(x, y),
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
