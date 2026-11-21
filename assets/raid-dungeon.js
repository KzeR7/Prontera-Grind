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
  // Must equal RAID_RULES.walkSpeed (9.6). It was 10.5, so the client's own walk outran the engine's
  // and every snapshot dragged the hero backwards - visible as a stutter while holding a key.
  const WALK_SPEED = 9.6;
  const EDGE_PAD = 0.6;             // how far from the deck edge the hero may stand
  // The engine refuses a move closer than 220 ms to the previous one (`moveMinIntervalMs`). Pacing
  // below that number is what made movement feel broken: half the intents were 429s.
  const MOVE_INTERVAL = 240;
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
    facing: 0,
    lastMoveAt: 0,
    pendingMove: null,
    inputBound: false,
    listeners: [],
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
  // The Astral field draws itself from real stone and space images, loaded through
  // PGJourneyMaterials + runtime-manifest.json. The raid asked for none of them - `scenes.build(key,
  // {})` - so every surface fell back to flat colour while the same builder painted the field with
  // texture. That is why the dungeon looked like untextured blocks next to the Astral map that
  // already ships: the textures were there the whole time and were simply never handed over.
  // Loaded once per session, guarded, and the build is retried with them the moment they arrive.
  let surfacesPromise = null;
  function journeySurfaces() {
    if (surfacesPromise) return surfacesPromise;
    surfacesPromise = (async () => {
      try {
        const load = root.PGJourneyMaterials
          || await new Promise((resolve, reject) => {
            const tag = document.createElement('script');
            tag.src = 'assets/endgame/journey-materials.js';
            tag.onload = () => resolve(root.PGJourneyMaterials);
            tag.onerror = () => reject(new Error('journey-materials.js did not load'));
            document.head.appendChild(tag);
          });
        if (!load || typeof load.create !== 'function') return null;
        let manifest = null;
        try {
          const response = await fetch('assets/endgame/textures/runtime-manifest.json');
          if (response.ok) manifest = await response.json();
        } catch { /* the materials factory copes without a manifest */ }
        const materials = load.create(manifest, url => new Promise((resolve, reject) => {
          const image = new Image();
          image.onload = () => resolve(image);
          image.onerror = reject;
          image.src = url;
        }));
        const ready = await materials.ensure('astral');
        return (ready && ready.images) || null;
      } catch (error) {
        console.warn('Raid textures unavailable, using flat materials', error);
        return null;
      }
    })();
    return surfacesPromise;
  }

  let texturedRetry = false;
  let astralRequested = false;
  let loadedSurfaces = null;
  // Stage index into the real Astral route (1..5). The raid walks the four named spans, which are the
  // same spans the field's Ascension route already renders.
  const STAGE_SPAN = { approach: 1, arcade: 3, observatory: 4, sanctuary: 5 };

  function ensureWorld(stageKey) {
    if (D.world && D.stageKey === stageKey) return D.world;
    disposeWorld();
    const surfaces = loadedSurfaces;
    let world = null;
    // Use the REAL map. `assets/astral-scenery.js` is the shipped, textured Astral route - the one
    // the field already draws - and it exports the fight area it was built around (`arena`). The
    // first pass re-implemented this look in a second file, which is how a 228-line map that already
    // worked became 584 lines of nearly-the-same-scenery with its own bounds, its own fog and its own
    // lighting to get wrong. Build the real one and read its numbers.
    // The shipped map is loaded on demand by the Ascension route, so a raid that starts first must
    // ask for it. Loading is fire-and-forget: this frame draws the fallback scenes, and the moment
    // the real map arrives `texturedRetry` below forces one rebuild on the good map.
    if (!root.PGAstralScenery && !astralRequested) {
      astralRequested = true;
      const tag = document.createElement('script');
      tag.src = 'assets/astral-scenery.js';
      tag.onload = () => { if (D.on) D.world = null; };
      tag.onerror = () => console.warn('Astral map unavailable; arena keeps its own scenery');
      document.head.appendChild(tag);
    }
    const real = root.PGAstralScenery;
    if (real && typeof real.build === 'function') {
      try { world = real.build(STAGE_SPAN[stageKey] || 1, surfaces ? { surfaces } : {}); } catch (error) { console.error('Astral map failed to build', error); world = null; }
      if (world) world.raidArena = world.arena;
    }
    // Fall back to the purpose-built raid scenes only if the shipped map is unavailable, so a load
    // order change can never leave the arena empty.
    if (!world) {
      const scenes = root.PGAstralRaidScenes;
      if (!scenes) return null;
      try { world = scenes.build(stageKey, surfaces ? { surfaces } : {}); } catch (error) { console.error('Raid scenery failed', error); return null; }
    }
    // The first build happens before the images finish loading; rebuild once, when they land, so
    // the player's first run is not the flat-colour version.
    if (!surfaces && !texturedRetry) {
      texturedRetry = true;
      journeySurfaces().then(loaded => {
        if (!loaded) return;
        loadedSurfaces = loaded;
        if (D.on) { D.world = null; /* rebuild on the next frame with textures */ }
      });
    }
    D.world = world;
    D.stageKey = stageKey;
    D.mount = new THREE.Group();
    // The real map is authored in route coordinates (its spans sit at z = -8, -74, -140, -208). The
    // raid works in flat local space, so the mounted copy is shifted by the span's focus: whatever
    // the map declares as the arena centre becomes local z = 0.
    D.mount.position.set(0, 0, ORIGIN);
    const focus = arenaFocus();
    if (focus) for (const child of [...world.scene.children]) child.position.z -= focus;
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
    D.walking = false;
    D.keys.clear();
    // The walk flag is written straight onto the field's own hero proxy, so leaving the run has to
    // put it back. Before this, a hero who was mid-step when the arena ended kept `run = true` on the
    // field, and the field's sprite walked in place with no destination to reach.
    if (D.hooks && D.hooks.player) {
      const p = typeof D.hooks.player === 'function' ? D.hooks.player() : D.hooks.player;
      if (p) p.run = false;
    }
    // Take the arena's input off the field's canvas: it was bound in begin() and never removed, so
    // taps and keys kept being interpreted as raid moves after the fight was over.
    for (const [target, type, fn, opts] of D.listeners || []) {
      try { target.removeEventListener(type, fn, opts); } catch { /* target already gone */ }
    }
    D.listeners = [];
    D.inputBound = false;
    if (D.hooks && D.hooks.map) D.hooks.map(null);
  }

  function stageSpawn() {
    const b = boundsOf(D.stageKey);
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

  // Every listener bound below is kept so end() can take it off again. Without that the arena's
  // input stayed live after the run: pointer and key handlers kept firing against a disposed world,
  // and the field could not have its own input model back cleanly.
  function bindInput() {
    if (D.inputBound) return;
    const canvas = hookCanvas();
    if (!canvas) return;
    D.inputBound = true;
    D.listeners = [];
    const on = (target, type, fn, opts) => { target.addEventListener(type, fn, opts); D.listeners.push([target, type, fn, opts]); };

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
    on(canvas, 'pointerdown', event => {
      if (!D.on || event.button > 0) return;
      pointer = { id: event.pointerId, x: event.clientX, y: event.clientY, moved: 0 };
    });
    on(canvas, 'pointermove', event => {
      if (!pointer || pointer.id !== event.pointerId) return;
      pointer.moved += Math.abs(event.clientX - pointer.x) + Math.abs(event.clientY - pointer.y);
      pointer.x = event.clientX; pointer.y = event.clientY;
    });
    on(canvas, 'pointerup', event => {
      if (!D.on || !pointer || pointer.id !== event.pointerId) return;
      const moved = pointer.moved;
      pointer = null;
      if (moved > 8) return;                       // a drag is the camera
      const target = pickEnemy(event.clientX, event.clientY);
      if (target) { requestFocus(target); return; }
      const dest = destOf(event.clientX, event.clientY);
      if (dest) requestMove(dest.x, dest.z);
    });
    on(canvas, 'pointercancel', () => { pointer = null; });

    on(root, 'keydown', event => {
      if (!D.on) return;
      if (event.target && /input|textarea|select/i.test(event.target.tagName || '')) return;
      const key = String(event.key || '').toLowerCase();
      // `'wasd'.startsWith(key[0])` was true only for W: 'wasd'.startsWith('a') is false, so A, S
      // and D were never recorded and only W ever moved the hero. Test membership, not a prefix.
      if (!'wasd'.includes(key) && !key.startsWith('arrow')) return;
      D.keys.add(key);
      event.preventDefault();
    });
    on(root, 'keyup', event => { D.keys.delete(String(event.key || '').toLowerCase()); });
    on(root, 'blur', () => D.keys.clear());
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

  // The playable rectangle for a stage, straight from the scenery module so the client and the deck
  // cannot disagree. The observatory is a disc, so it is reported as its bounding square and the
  // circular deck is what actually bounds it; the pad keeps the hero off the rim either way.
  // The playable rectangle, taken from the map that is actually on screen.
  //
  // The real Astral map is a long route; a fight happens on one span of it, and the map says which
  // span: `arena {halfWidth, z0, z1}` around a focus point. Reading that is the whole point of
  // building on the real map - the floor, the bounds and the camera all come from one place instead
  // of three that can disagree.
  function boundsOf(stageKey) {
    if (D.world && D.world.raidArena) {
      const a = D.world.raidArena, focus = D.world.view && Number.isFinite(D.world.view.focus) ? D.world.view.focus : 0;
      return { minX: -a.halfWidth, maxX: a.halfWidth, minZ: a.z0 - focus, maxZ: a.z1 - focus };
    }
    const scenes = root.PGAstralRaidScenes;
    const b = (scenes && scenes.BOUNDS && (scenes.BOUNDS[stageKey] || scenes.BOUNDS.approach)) || null;
    if (!b) return { minX: -13, maxX: 13, minZ: -20, maxZ: 20 };
    if (b.kind === 'circle') return { minX: -b.r, maxX: b.r, minZ: -b.r, maxZ: b.r };
    return b;
  }

  // Where the map says the party joins the fight: the near edge of the span, centre.
  function arenaFocus() {
    if (D.world && D.world.view && Number.isFinite(D.world.view.focus)) return D.world.view.focus;
    return 0;
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
    if (now - D.lastMoveAt < MOVE_INTERVAL) { D.pendingMove = { x, z }; return; }
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
    // A health bar over the head, the way an MMO reads a fight. There was no per-enemy bar at all
    // before - only a boss bar in the HUD - so the player could not tell whether an attack was doing
    // anything, or whether a mob that vanished had actually been killed.
    let bar = null;
    if (kind !== 'member') {
      const canvas = document.createElement('canvas');
      canvas.width = 128; canvas.height = 20;
      const texture = new THREE.CanvasTexture(canvas);
      texture.minFilter = THREE.LinearFilter; texture.magFilter = THREE.LinearFilter;
      const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false, depthWrite: false });
      bar = new THREE.Sprite(material);
      bar.center.set(0.5, 0.5);
      bar.scale.set(kind === 'boss' ? 3.4 : 2.1, kind === 'boss' ? 0.42 : 0.26, 1);
      bar.position.y = kind === 'boss' ? 4.6 : kind === 'anchor' ? 3.1 : 2.35;
      bar.renderOrder = 12;
      group.add(bar);
      bar.userData = { canvas, texture, shownHp: -1, shownMax: -1, shownDead: null };
    }
    const ent = {
      key, kind, group, sprite, shadow, ring, ringMat, bar,
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
    if (ent.bar) {
      if (ent.bar.material) { if (ent.bar.material.map) ent.bar.material.map.dispose(); ent.bar.material.dispose(); }
    }
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
      // Your own seat is drawn by the field's hero sprite, so the engine's position for you is the
      // one thing this panel must feed back: the engine walks the member, resolves the damage and
      // decides what is in reach. The client used to keep its own private `heroPos` with no one
      // reconciling the two, so on screen the hero stood at the entrance while the engine had it
      // killing packs - mobs died out of reach and vanished. Adopt the authoritative position
      // (plus the intent the client is already walking toward) and let the field's sprite follow.
      if (m.id === D.myId && Number.isFinite(Number(m.x)) && Number.isFinite(Number(m.z))) {
        // Correct, never snap: the local walk in tick() is the thing the player sees move, and the
        // engine's figure is the truth to converge on. A hard assignment stuttered on every snapshot;
        // taking the error out over a few frames keeps the sprite smooth while staying honest. A gap
        // larger than a body length is a real desync (a resume, a stage change), so that one is taken
        // whole rather than slid through the scenery.
        const ex = num(m.x) - D.heroPos.x, ez = num(m.z) - D.heroPos.z;
        if (Math.hypot(ex, ez) > 4) { D.heroPos.x = num(m.x); D.heroPos.z = num(m.z); D.dest = null; }
        else { D.heroPos.x += ex * 0.35; D.heroPos.z += ez * 0.35; }
      }
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
    // A mob that leaves the snapshot has just died - the run only removes a cleared enemy. Dropping
    // it on the same frame is why every kill read as "it disappeared": no death beat, no chance to
    // see the last hit land. Dead enemies stay as inert corpses (dimmed, no bar) for a moment so the
    // kill is legible, then go.
    const nowMs = performance.now();
    for (const key of [...D.entities.keys()]) {
      if (key[0] === 'm' && !members.has(key)) { dropEntity(key); continue; }
      if (key[0] !== 'e' || enemies.has(key)) continue;
      const ent = D.entities.get(key);
      if (!ent) continue;
      if (!ent.goneAt) {
        ent.goneAt = nowMs;
        ent.dead = true;
        ent.deathAt = nowMs;
        if (ent.bar) ent.bar.visible = false;
        if (ent.sprite && ent.sprite.material) { ent.sprite.material.opacity = 0.55; ent.sprite.material.transparent = true; }
      }
      const age = (nowMs - ent.goneAt) / 1000;
      if (age > 1.1) { dropEntity(key); continue; }
      // Sink and fade: a small, unmistakable "that one is dead".
      ent.group.position.y = -age * 0.55;
      if (ent.sprite && ent.sprite.material) ent.sprite.material.opacity = Math.max(0, 0.55 * (1 - age / 1.1));
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

  // ---------------------------------------------------------------- bars --------
  // Redrawn only when the numbers move: a canvas upload per enemy per frame is the kind of thing that
  // is invisible on a desktop and painful on a phone. The bar hides itself once the mob is dead, which
  // is also the answer to "why did that walk off the screen" - it died, and now it says so.
  function drawBar(ent, focused) {
    const bar = ent.bar, u = bar.userData;
    const hp = Math.max(0, ent.hp), maxHp = Math.max(1, ent.maxHp);
    if (u.shownHp === hp && u.shownMax === maxHp && u.shownDead === ent.dead && u.shownFocus === focused) return;
    u.shownHp = hp; u.shownMax = maxHp; u.shownDead = ent.dead; u.shownFocus = focused;
    const c = u.canvas, ctx = c.getContext('2d');
    ctx.clearRect(0, 0, c.width, c.height);
    const w = c.width, h = c.height;
    // Frame
    ctx.fillStyle = 'rgba(6,10,14,0.82)';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = focused ? 'rgba(255,217,160,0.95)' : 'rgba(140,168,170,0.55)';
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, w - 2, h - 2);
    // Fill
    const frac = Math.max(0, Math.min(1, hp / maxHp));
    ctx.fillStyle = ent.kind === 'boss' ? '#d8693f' : frac > 0.5 ? '#7ed08a' : frac > 0.22 ? '#e0bb62' : '#d4564a';
    ctx.fillRect(3, 3, Math.max(0, (w - 6) * frac), h - 6);
    bar.material.map.needsUpdate = true;
    bar.visible = true;
    if (!ent.dead) {
      const dist = D.heroPos ? Math.hypot(ent.x - D.heroPos.x, ent.z - D.heroPos.z) : 0;
      // Fade a bar that is genuinely far away so a crowded hall stays readable, but never hide one
      // the player is fighting.
      bar.material.opacity = focused || ent.kind === 'boss' ? 1 : dist > 26 ? 0.28 : 1;
    }
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
        // The engine clamps every destination to the stage, but the client interpolated to whatever
        // point it was given - so a tap outside the deck walked the hero off the platform into empty
        // space. Clamp here too, and drop the destination once it is pinned to the edge.
        const b = boundsOf(D.stageKey);
        const cx = clamp(D.heroPos.x, b.minX + EDGE_PAD, b.maxX - EDGE_PAD);
        const cz = clamp(D.heroPos.z, b.minZ + EDGE_PAD, b.maxZ - EDGE_PAD);
        if (cx !== D.heroPos.x || cz !== D.heroPos.z) {
          D.heroPos.x = cx; D.heroPos.z = cz; D.dest = null; D.walking = false;
        }
        D.facing = Math.atan2(dx, dz);   // the field reads this for the sprite's 8-way facing
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
      if (ent.bar) drawBar(ent, focused);
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
    // Keyboard: one intent per MOVE_INTERVAL while a key is held, never one per frame. This used to
    // be 180 ms against the engine's 220 ms floor, so every second intent was refused with "You are
    // already moving" - the hero stuttered and, worse, never quite reached a pack to fight it.
    const vec = keyVector();
    if (vec && D.heroPos && now - D.lastMoveAt >= MOVE_INTERVAL) {
      requestMove(D.heroPos.x + vec.x, D.heroPos.z + vec.z);
    } else if (D.pendingMove && now - D.lastMoveAt >= MOVE_INTERVAL) {
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
  <div class="raid-hud-tip" id="raidHudTip">WASD walk · tap the ground to move · tap an enemy to focus</div>
  <button type="button" class="raid-hud-exit" id="raidHudExit" aria-label="Leave the fight view">Leave</button>
</div>`;

  // The field's own controls are hidden for the duration of a fight, so the arena has to offer its
  // own way out. "Leave" only closes the fight *view* - it never settles or abandons a run, because a
  // solo run lives in this tab and closing the view is what parks it on its checkpoint.
  function bindHudExit() {
    const btn = document.getElementById('raidHudExit');
    if (!btn || btn.dataset.bound === '1') return;
    btn.dataset.bound = '1';
    btn.addEventListener('click', () => {
      try { if (root.PGRaid && typeof root.PGRaid.close === 'function') root.PGRaid.close(); } catch { /* already closed */ }
    });
  }

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
    if (on) bindHudExit();
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
    // The field turns the hero sprite toward this angle. Without it the raid left `pl.run` set and
    // nothing else, so the sprite walked in place facing one way for the whole fight.
    facing: () => D.facing,
    // Whether the hero is mid-step, so the field plays a walk cycle instead of a frozen idle.
    walking: () => !!D.walking,
    get active() { return D.on; },
    get stageKey() { return D.stageKey; },
    get targetId() { return D.targetId; },
    get stats() { return D.stats; },
    _state: D,
    _pick: (x, y) => pickEnemy(x, y),
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
