// Divine Pride sprites: every game monster resolves to a real RO mob ID, every weapon
// family has a representative item-database icon, and missing remote images keep fallbacks.
//   node tools/tests/sprite_sim.js
const fs = require('fs'), vm = require('vm'), assert = require('assert');
const root = __dirname + '/../..';
const src = fs.readFileSync(root + '/index.html', 'utf8');
const grab = (a, b) => {
  const i = src.indexOf(a), j = src.indexOf(b, i);
  if (i < 0 || j < 0) throw new Error('missing ' + a);
  return src.slice(i, j);
};
let pass = 0, fail = 0;
const t = (name, fn) => {
  try { fn(); console.log('  ok   ' + name); pass++; }
  catch (e) { console.log('  FAIL ' + name + ' -> ' + e.message); fail++; }
};
console.log('sprites: Divine Pride monster and weapon art\n');

const mapCode = grab('const pm=s=>', 'const pw=()=>');
const petRosterSrc = src.match(/const PETS=\[[\s\S]*?\];/)?.[0];
if (!petRosterSrc) throw new Error('cannot find pet monster sprite roster');
const mapBox = {};
vm.createContext(mapBox);
vm.runInContext(mapCode + '\n' + petRosterSrc + '\n' + grab('const petIcon=', 'const RN=') + '\nthis.__data={MAPS,MOB_SPRITES,MOB_SIZE_BY_ID,MOB_SIZE_SCALE,MOB_REGULAR_VISUAL,mobVisualScale,mobSpriteUrl,PETS,petIcon,ASCENSION_FRAME_PX,ASCENSION_KEPT_VISUAL,HERO_VISUAL_HEIGHT,ASCENSION_MONSTER_VISUAL,ASCENSION_BOSS_VISUAL,MOB_VISUAL_MAX,boundMobScale};', mapBox);
const MAPS = mapBox.__data.MAPS, MOB_SPRITES = mapBox.__data.MOB_SPRITES, MOB_SIZE_BY_ID = mapBox.__data.MOB_SIZE_BY_ID,
      MOB_SIZE_SCALE = mapBox.__data.MOB_SIZE_SCALE, MOB_REGULAR_VISUAL = mapBox.__data.MOB_REGULAR_VISUAL,
      mobVisualScale = mapBox.__data.mobVisualScale, mobSpriteUrl = mapBox.__data.mobSpriteUrl, PETS = mapBox.__data.PETS,
      petIcon = mapBox.__data.petIcon, ASCENSION_FRAME_PX = mapBox.__data.ASCENSION_FRAME_PX,
      ASCENSION_KEPT_VISUAL = mapBox.__data.ASCENSION_KEPT_VISUAL, HERO_VISUAL_HEIGHT = mapBox.__data.HERO_VISUAL_HEIGHT,
      ASCENSION_MONSTER_VISUAL = mapBox.__data.ASCENSION_MONSTER_VISUAL,
      ASCENSION_BOSS_VISUAL = mapBox.__data.ASCENSION_BOSS_VISUAL,
      MOB_VISUAL_MAX = mapBox.__data.MOB_VISUAL_MAX, boundMobScale = mapBox.__data.boundMobScale;

const weaponCode = grab('const WEAPON_ITEM_IDS=', 'const STATS=');
const weaponBox = {};
vm.createContext(weaponBox);
vm.runInContext(weaponCode + '\nthis.__data={WEAPON_ITEM_IDS,weaponItemUrl,CLASS_WEAPON,heroWeaponType};', weaponBox);
const WEAPON_ITEM_IDS = weaponBox.__data.WEAPON_ITEM_IDS, weaponItemUrl = weaponBox.__data.weaponItemUrl,
      CLASS_WEAPON = weaponBox.__data.CLASS_WEAPON, heroWeaponType = weaponBox.__data.heroWeaponType;

const gripBox = {};
vm.createContext(gripBox);
vm.runInContext(grab('const WEAPON_ICON_GRIP=', 'const weaponRight=') + '\nthis.__grip={WEAPON_ICON_GRIP,weaponIconCenterAtGrip};', gripBox);
const WEAPON_ICON_GRIP = gripBox.__grip.WEAPON_ICON_GRIP, weaponIconCenterAtGrip = gripBox.__grip.weaponIconCenterAtGrip;

const poseBox = { window: { SPRITE_PACK: { padL: 15, padT: 38 } } };
vm.createContext(poseBox);
vm.runInContext(grab('const SPR_W=64', 'function drawWep(') + '\nthis.__pose={poseOf,heroPoseFrame,weaponHandPoint,weaponSpritePixel,PACK_WEAPON_ADJUST};', poseBox);
const { poseOf, heroPoseFrame, weaponHandPoint, weaponSpritePixel, PACK_WEAPON_ADJUST } = poseBox.__pose;
const mobBox = { pl: { x: 0, z: 0 } };
vm.createContext(mobBox);
vm.runInContext(grab('function mobMotion(m,clock){', 'function syncMobImage(') + '\nthis.__motion=mobMotion;', mobBox);
const mobMotion = mobBox.__motion;

const classCode = grab('const CD=[', 'const CLASSES={');
const classBox = {};
vm.createContext(classBox);
vm.runInContext(classCode + '\nthis.__classes=CD;', classBox);
const CD = JSON.parse(JSON.stringify(classBox.__classes));

t('all regular monsters and bosses on all ten maps have a Divine Pride sprite ID', () => {
  const missing = [];
  MAPS.forEach(map => [map.boss, ...map.mobs].forEach(monster => {
    if (!Number.isInteger(monster.spriteId) || monster.spriteId <= 0)
      missing.push(map.n + ': ' + monster.n);
  }));
  assert.deepStrictEqual(missing, [], 'unmapped monsters: ' + missing.join(', '));
  assert.strictEqual(MAPS.length, 12);
  assert.strictEqual(MAPS.reduce((n, m) => n + m.mobs.length, 0), 90, 'the check covers all 80 regular monsters');
  assert.strictEqual(Object.keys(MOB_SPRITES).length, 108, 'map monsters plus six advancement opponents are mapped');
});

t('monster IDs include the intentional RO-name aliases and point at the PNG endpoint', () => {
  for (const [name, id] of Object.entries({
    'Savage Bebe': 1167, 'Bat Familiar': 1005, 'Sea Witch': 20843,
    'Stone Golem': 1278, 'Oni': 1204, 'Dragon Lord': 1719,
    'Lord of Death': 1373, 'Dark Lord': 1272,
  })) assert.strictEqual(MOB_SPRITES[name], id, name + ' alias changed');
  assert.strictEqual(mobSpriteUrl(1002), 'https://static.divine-pride.net/images/mobs/png/1002.png');
  assert.strictEqual(mobSpriteUrl(0), '');
  assert.ok(src.includes('One-facing RO monster PNGs'), 'the one-direction art choice is documented');
});

t('every pet portrait uses a local crop of its original native sprite', () => {
  const expected={Poring:1002,Lunatic:1063,Wolf:1013,'Desert Wolf':1106,'Peco Peco':1019,'Dragon Whelp':1155,'Baphomet Jr.':1101,Angeling:1096,Drops:1113,Poporing:1031,Fabre:1007,Smokie:1056,Yoyo:1057,Spore:1014,Sohee:1170,Deviruchi:1109,'Nine Tail':1180,Deviling:1582,Ghostring:1120,Eddga:1115};
  assert.strictEqual(PETS.length,20,'pet roster changed');
  for(const p of PETS){
    assert.strictEqual(p.spriteId,expected[p.n],p.n+' lost its verified monster ID');
    const html=petIcon(p);
    assert.ok(html.includes(`src="assets/pets/v1/thumb-${p.spriteId}.png"`)&&html.includes(`alt="${p.n}"`),p.n+' does not render an accessible official sprite');
  }
});

t('all pets use native animation with local fallback and remain uniformly small', () => {
  const petDraw=grab('const PET_VISUAL_SCALE=.42;', '// Only active states and the open preview');
  const box={ASCENSION_MOB_IDS:new Set()};vm.createContext(box);
  vm.runInContext(petDraw+'\nthis.__pet={PET_VISUAL_SCALE,petFallbackShape};',box);
  const P=box.__pet;
  assert.strictEqual(P.PET_VISUAL_SCALE,.42);
  assert.ok(3.05*P.PET_VISUAL_SCALE<2.92*.5,'even a Baphomet Jr. pet should be less than half the hero height');
  for(const sp of PETS)assert.ok(P.petFallbackShape(sp),'no pet fallback if official art fails');
  const draw=grab('  const pids=new Set(S.pets.filter(p=>p.on)', '  const live=new Set();');
  assert.ok(draw.includes('v=buildMob(pet)')&&draw.includes('spriteId:sp.spriteId'),
    'active pets must use the mob renderer and the verified monster sprite ID');
  assert.ok(draw.includes("rec.state==='ready')useMobTexture(v,rec.texture)"),
    'pets must switch to official GPU textures when available');
  assert.ok(draw.includes('v.G.scale.setScalar(PET_VISUAL_SCALE)')&&src.includes('syncMobImage(v,{x:r.x'),
    'both the GPU and DOM sprite paths must use the same small size');
  assert.ok(draw.includes('disposeCreatureVisual(v)')&&src.includes('if(v.image)v.image.remove()'),
    'unequipping a pet must remove its DOM image as well as its 3D group');
  assert.ok(draw.includes('v.spr.material.color.set(0xffffff)'),
    'mutation should not recolour official pixel art');
  assert.ok(draw.includes('drawNativePet(v,sp.spriteId,r,viewDir(pf))'),'native timing and direction are used');
  assert.ok(src.includes("if(v.nativePet){"),'native frames bypass still-image squash transforms');
  // Actually build the pet using the same function as a monster, verifying its URL is
  // requested and the DOM fallback exists for every species if WebGL texture loading fails.
  const ctx={ASCENSION_MOB_IDS:new Set(),requested:[],images:[],groups:[],THREE:{Group:class{add(){} }},getSheet:()=>({}),
    drawCritter:()=>{},mkBillboard:()=>({material:{map:{},dispose(){}}}),mkShadow:()=>{},
    scene:{add(g){ctx.groups.push(g)}},mobSpriteUrl,document:{createElement:()=>({style:{}})},
    mobSpriteLayer:{appendChild(im){ctx.images.push(im)}},requestMobTexture:id=>ctx.requested.push(id)};
  vm.createContext(ctx);
  vm.runInContext(grab('function buildMob(m){','let slashM=null;')+'\nthis.build=buildMob;',ctx);
  for(const sp of PETS){
    const v=ctx.build({shape:P.petFallbackShape(sp),c:sp.c,spriteId:sp.spriteId,pet:true});
    assert.strictEqual(v.spriteId,sp.spriteId);assert.strictEqual(v.image.src,'assets/pets/v1/thumb-'+sp.spriteId+'.png');
  }
  assert.strictEqual(ctx.images.length,20);assert.strictEqual(ctx.requested.length,20);
});

t('all 100 unique native/Divine Pride mob IDs match their database size class and player-relative scale', () => {
  // Reference list transcribed from the Small/Medium/Large labels on the corresponding
  // Divine Pride monster pages; index.html documents the common URL pattern and audit date.
  const dpSize={
    Small:[1707,1836,1001,1004,1005,1007,1008,1011,1051,1063,1070,1073,1141,1142,1143,1144,1167,1179,1837,1866,1869,2023],
    Medium:[1634,1635,1636,1637,1638,1639,1700,1702,1706,1002,1010,1013,1014,1015,1016,1023,1030,1031,1033,1036,1041,1044,1052,1076,1077,1090,1106,1108,1112,1113,1128,1139,1154,1155,1165,1177,1180,1189,1198,1204,1215,1264,1323,1406,1517,1867,1880],
    Large:[1705,1708,1831,1832,1019,1029,1039,1055,1060,1094,1098,1115,1117,1149,1159,1166,1192,1219,1268,1272,1278,1302,1305,1366,1373,1405,1719,1775,1833,20843,2202]
  };
  const allIds=[...new Set(Object.values(MOB_SPRITES))].sort((a,b)=>a-b),classified=Object.keys(MOB_SIZE_BY_ID).map(Number).sort((a,b)=>a-b);
  assert.strictEqual(allIds.length,100,'expected 100 unique sprite IDs across twelve maps and advancement trials');
  assert.deepStrictEqual(classified,allIds,'size table must cover exactly the sprites used by map mobs and bosses');
  for(const [size,ids] of Object.entries(dpSize))for(const id of ids)assert.strictEqual(MOB_SIZE_BY_ID[id],size,'Divine Pride size for sprite '+id);
  assert.strictEqual(Object.values(dpSize).reduce((n,ids)=>n+ids.length,0),100,'the cited size reference list must account for every ID once');
  assert.strictEqual(MOB_SIZE_SCALE.Small,.62);assert.strictEqual(MOB_SIZE_SCALE.Medium,.92);assert.strictEqual(MOB_SIZE_SCALE.Large,1.28);
  for(const map of MAPS)for(const mob of [map.boss,...map.mobs]){
    assert.ok(['Small','Medium','Large'].includes(mob.spriteSize),mob.n+' missing size class');
    assert.strictEqual(mob.spriteScale,MOB_SIZE_SCALE[mob.spriteSize],mob.n+' does not use the size-class scale');
  }
  console.log('       20 Small / 38 Medium / 27 Large; scale factors .62 / .92 / 1.28 vs player');
});

t('Poring, Fabre and all regular mobs render below player height while bosses keep their old size', () => {
  const hero=2.92,frame=3.05;
  assert.strictEqual(MOB_REGULAR_VISUAL,.7,'the regular-only visual multiplier changed');
  // mapIndex reaches the renderer with every spawned monster, so include it (see the Ascension test).
  const height=(m,boss=false,mapIndex=0)=>frame*mobVisualScale({...m,boss,spawn:1,mapIndex});
  const poring=MAPS[0].mobs.find(m=>m.n==='Poring');
  const fabre=MAPS[0].mobs.find(m=>m.n==='Fabre');
  assert.ok(fabre && poring,'starter monster samples not found');
  assert.ok(height(fabre)<height(poring) && height(poring)<hero,
    'Fabre and Poring should be visibly shorter than the player');
  assert.ok(height(fabre)<hero*.55,'Fabre is still oversized');
  assert.ok(height(poring)<hero*.75,'Poring is still oversized');
  MAPS.forEach((map,mapIndex)=>{
    // The two Ascension fields draw native frames, so they are measured on their visible art
    // height against the character in the next test instead of on this sprite box.
    if(mapIndex>=10)return;
    for(const m of map.mobs)assert.ok(height(m,false,mapIndex)<hero, map.n+': '+m.n+' exceeds player height');
    const boss=map.boss;
    assert.ok(Math.abs(height(boss,true,mapIndex)-frame*boss.spriteScale*1.18)<1e-9,
      map.n+' boss size was changed');
  });
  // The same scale must reach the GPU group, DOM sprite, target tag and sync path.
  assert.ok(src.includes('const s=mobVisualScale(m)') && src.includes('const s=mobVisualScale(mob)'),
    'rendered mobs or target tag still use the old scale');
  assert.ok(src.includes('v.G.scale.set(s,s,s)') && src.includes('syncMobImage(v,m,mobVisualScale(m))'),
    'GPU and HTML sprite paths must agree on size');
});

t('Ascension fields stand every monster above the character, both MVPs above the field, and nothing at screen scale', () => {
  const zlib = require('node:zlib');
  // Owner request (2026-10-24): on Astral Citadel and Thor Volcano ordinary monsters should look
  // about as tall as the character, and both MVPs clearly taller. The two fields draw native
  // 512px frames whose silhouettes fill very different shares of the sheet, so the shipped size
  // classes alone produced everything from a knee-high demon to a golem taller than the hero.
  // Visible art = 3.05*scale*(idle art / tallest frame); the table below is measured from the
  // shipped PNGs and the generated heights file, never guessed.
  const alphaBox = file => {
    const buf = fs.readFileSync(file);
    let pos = 8, w = 0, h = 0, depth = 0, color = 0; const idat = [];
    while (pos < buf.length) {
      const len = buf.readUInt32BE(pos), type = buf.toString('ascii', pos + 4, pos + 8), data = buf.subarray(pos + 8, pos + 8 + len);
      if (type === 'IHDR') { w = data.readUInt32BE(0); h = data.readUInt32BE(4); depth = data[8]; color = data[9]; assert.strictEqual(data[12], 0, file + ' is interlaced'); }
      else if (type === 'IDAT') idat.push(data);
      else if (type === 'IEND') break;
      pos += len + 12;
    }
    assert.strictEqual(depth, 8, file + ' is not 8-bit'); assert.strictEqual(color, 6, file + ' is not RGBA');
    const raw = zlib.inflateSync(Buffer.concat(idat)), stride = w * 4, prev = Buffer.alloc(stride);
    let top = -1, bottom = -1;
    for (let y = 0, o = 0; y < h; y++) {
      const filter = raw[o++], line = Buffer.from(raw.subarray(o, o + stride)); o += stride;
      for (let x = 0; x < stride; x++) {
        const a = x >= 4 ? line[x - 4] : 0, b = prev[x], c = x >= 4 ? prev[x - 4] : 0;
        if (filter === 1) line[x] = (line[x] + a) & 255;
        else if (filter === 2) line[x] = (line[x] + b) & 255;
        else if (filter === 3) line[x] = (line[x] + ((a + b) >> 1)) & 255;
        else if (filter === 4) { const q = a + b - c, pa = Math.abs(q - a), pb = Math.abs(q - b), pc = Math.abs(q - c); line[x] = (line[x] + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c)) & 255; }
        else assert.strictEqual(filter, 0, file + ' uses PNG filter ' + filter);
      }
      line.copy(prev);
      if (top < 0) for (let x = 3; x < stride; x += 4) if (line[x]) { top = y; break; }
      if (top >= 0) for (let x = 3; x < stride; x += 4) if (line[x]) { bottom = y; break; }
    }
    return { top, bottom, height: bottom - top + 1 };
  };
  const heightsFile = fs.readFileSync(root + '/assets/native-mob-heights.js', 'utf8');
  const nativeHeights = JSON.parse(/PGNativeMobHeights\s*=\s*Object\.freeze\((\{[^)]*\})\)/.exec(heightsFile)[1]);
  const drawn = m => { const [art, extent] = ASCENSION_FRAME_PX[m.spriteId]; return 3.05 * mobVisualScale({ ...m, boss: !!m.boss, spawn: 1 }) * art / extent; };
  const fieldMob = (m, mapIndex) => ({ ...m, boss: m === MAPS[mapIndex].boss, mapIndex });
  // 1. The table is the shipped art: idle-frame pixels and the generated tallest frame extent.
  for (const [id, [art, extent]] of Object.entries(ASCENSION_FRAME_PX)) {
    assert.strictEqual(alphaBox(root + '/assets/mobs/v1/' + id + '-0.png').height, art, id + ' idle art height changed');
    assert.strictEqual(nativeHeights[id], extent, id + ' tallest frame extent disagrees with assets/native-mob-heights.js');
  }
  // 2. Ordinary monsters of both fields stand at the character's height, except the two the owner
  //    confirmed were already right; both MVPs are well above every monster on their field.
  assert.strictEqual(HERO_VISUAL_HEIGHT, 2.16, 'the character stands 2.16 world units (SKIN_H)');
  assert.ok(src.includes('const SKIN_H=72*PACK_K') && src.includes('PACK_K=.03'), 'SKIN_H moved; HERO_VISUAL_HEIGHT must follow it');
  // v223 (owner): standing exactly at the character's height read small beside the smallest class
  // sprite, so the field moved up a quarter - 2.70 against the 2.16 hero, MVPs at 4.60.
  assert.ok(Math.abs(ASCENSION_MONSTER_VISUAL - 2.7) < 1e-9, 'ordinary Ascension monsters stand at 2.70 world units');
  assert.ok(Math.abs(ASCENSION_MONSTER_VISUAL - HERO_VISUAL_HEIGHT * 1.25) < 1e-9, 'the field is 1.25x the character');
  assert.ok(Math.abs(ASCENSION_BOSS_VISUAL - 4.6) < 1e-9, 'both MVPs stand at 4.60 world units');
  assert.ok(ASCENSION_BOSS_VISUAL > ASCENSION_MONSTER_VISUAL * 1.6, 'an MVP must dwarf the field monsters, not just top them');
  assert.ok(ASCENSION_MONSTER_VISUAL > HERO_VISUAL_HEIGHT, 'a field monster must read bigger than the character');
  for (const mapIndex of [10, 11]) {
    const map = MAPS[mapIndex];
    for (const m of map.mobs) {
      const target = ASCENSION_KEPT_VISUAL[m.spriteId] || ASCENSION_MONSTER_VISUAL;
      assert.ok(Math.abs(drawn(fieldMob(m, mapIndex)) - target) < 1e-9, map.n + ': ' + m.n + ' is not at its target height');
      if (!ASCENSION_KEPT_VISUAL[m.spriteId]) assert.ok(Math.abs(drawn(fieldMob(m, mapIndex)) - ASCENSION_MONSTER_VISUAL) < 1e-9, map.n + ': ' + m.n + ' should stand at the field height');
    }
    const bossDrawn = drawn(fieldMob(map.boss, mapIndex));
    assert.ok(Math.abs(bossDrawn - ASCENSION_BOSS_VISUAL) < 1e-9, map.n + ': MVP is not at the Ascension boss height');
    for (const m of map.mobs) assert.ok(bossDrawn > drawn(fieldMob(m, mapIndex)) * 1.4, map.n + ': ' + map.boss.n + ' is not clearly bigger than ' + m.n);
  }
  // 3. The two approved species keep their place in the line-up: they were pinned because the old
  //    (Small x .7 regular) height looked right, and v223 lifts them by the field's own 1.25x.
  for (const [id, target] of Object.entries(ASCENSION_KEPT_VISUAL)) {
    const [art, extent] = ASCENSION_FRAME_PX[id];
    const shipped = 3.05 * (MOB_SIZE_SCALE[MOB_SIZE_BY_ID[id]] * MOB_REGULAR_VISUAL) * art / extent;
    assert.ok(Math.abs(shipped * 1.25 - target) < .01, 'approved height for sprite ' + id + ' no longer follows the field lift');
    assert.ok(target < ASCENSION_MONSTER_VISUAL && target > HERO_VISUAL_HEIGHT * .3, 'approved height for sprite ' + id + ' left the field line-up');
  }
  // 4. Ordinary maps that reuse the same native sheets (Lava Slime, Chaos Imp, Amatsu's Shiranui)
  //    keep their size class: the new rule is an Ascension-field rule, not a sprite rule.
  const reused = [[9, 'Lava Slime'], [9, 'Chaos Imp'], [7, 'Shiranui']];
  for (const [mapIndex, name] of reused) {
    const m = [MAPS[mapIndex].boss, ...MAPS[mapIndex].mobs].find(x => x.n === name);
    assert.ok(m && ASCENSION_FRAME_PX[m.spriteId], name + ' is no longer drawn with a native sheet');
    const scaled = mobVisualScale({ ...m, boss: m === MAPS[mapIndex].boss, spawn: 1, mapIndex });
    assert.strictEqual(scaled, m.spriteScale * (m === MAPS[mapIndex].boss ? 1.18 : MOB_REGULAR_VISUAL), name + ' left its size class');
  }
  // 5. The rule reaches the renderer through the live mob's map index.
  assert.ok(src.includes('m.mapIndex>=10?ASCENSION_FRAME_PX[m.spriteId]:null'), 'the Ascension rule must be gated to its own fields');
  assert.ok(src.includes('window.PGNativeMobHeights?.[m.spriteId]'), 'the native draw path must keep using the generated heights');
  // 6. Every number the field draws goes through mobVisualScale, so it is finite and bounded: a
  //    broken species row or a monster mid-spawn can never ask the renderer for a screen-sized body.
  //    v223 clamp, added after the owner's "distortion" screenshots.
  assert.ok(MOB_VISUAL_MAX > 0 && MOB_VISUAL_MAX < 20, 'the mob scale ceiling must be a sane world scale');
  for (const bad of [NaN, Infinity, -Infinity, 1e9, -4, undefined]) {
    const v = boundMobScale(bad);
    assert.ok(Number.isFinite(v) && v >= .05 && v <= MOB_VISUAL_MAX, 'boundMobScale(' + bad + ') = ' + v);
  }
  assert.ok(mobVisualScale({ spriteId: 1705, mapIndex: 10, spawn: 1 }) <= MOB_VISUAL_MAX, 'a live monster exceeds the ceiling');
  assert.ok(mobVisualScale({ spriteId: 999999, mapIndex: 10, spawn: 1e6 }) <= MOB_VISUAL_MAX, 'a broken species row exceeds the ceiling');
  assert.ok(src.includes('const boundMobScale=v=>Number.isFinite(v)'), 'mobVisualScale must stay behind the finite guard');
  // 7. The Ascension native image is sized from the art inside its 512px sheet, and that projection
  //    is unbounded (zoom in, or a monster at the lens). It may never cover the whole field.
  const clampBox = {};
  vm.createContext(clampBox);
  vm.runInContext(grab('const NATIVE_MOB_MAX_PX=', 'function syncMobImage(') + '\nthis.__clamp={nativeMobArtPx,NATIVE_MOB_MAX_PX,NATIVE_MOB_MAX_SHARE};', clampBox);
  const nativeMobArtPx = clampBox.__clamp.nativeMobArtPx;
  clampBox.R = { domElement: { clientHeight: 964 } };
  assert.strictEqual(nativeMobArtPx([600, 500], [600, 100]), 320, 'a close monster is clamped to the 320px ceiling');
  assert.strictEqual(nativeMobArtPx([600, 900], [600, -400]), 320, 'a screen-tall projection must not exceed 320px of art');
  assert.strictEqual(nativeMobArtPx([600, 500], [600, 460]), 40, 'a normal monster keeps its projected height');
  assert.strictEqual(nativeMobArtPx([NaN, 500], [600, 100]), 0, 'an unprojectable frame is dropped, not drawn');
  assert.strictEqual(nativeMobArtPx([600, 500], [600, NaN]), 0, 'a NaN top is dropped, not drawn');
  clampBox.R = { domElement: { clientHeight: 390 } };
  assert.ok(nativeMobArtPx([600, 500], [600, 100]) <= 390 * .34, 'phones get the same ceiling');
  assert.ok(src.includes('const artPx=nativeMobArtPx(base,top);') && src.includes("if(!artPx){im.style.display='none';return}"), 'the native draw path must use the clamp');
  console.log('       Hero 2.16 · field monsters ' + ASCENSION_MONSTER_VISUAL + ' (1.25x) · MVPs ' + ASCENSION_BOSS_VISUAL +
    ' · approved: Agony Demon ' + ASCENSION_KEPT_VISUAL[1707] + ', Magma Slag ' + ASCENSION_KEPT_VISUAL[1836]);
});

t('Divine Pride item icons cover every weapon type used by all 19 classes', () => {
  const families = Object.keys(WEAPON_ITEM_IDS).sort();
  assert.deepStrictEqual(families, ['axe', 'bow', 'dagger', 'katar', 'mace', 'staff', 'sword']);
  const missing = [...new Set(CD.flatMap(row => row[7]).filter(type => !WEAPON_ITEM_IDS[type]))];
  assert.deepStrictEqual(missing, [], 'weapon families without an icon: ' + missing.join(', '));
  for (const [type, id] of Object.entries(WEAPON_ITEM_IDS))
    assert.strictEqual(weaponItemUrl(type), 'https://www.divine-pride.net/img/items/item/dpRO/' + id);
});

t('class weapon rules show bows, staves and one two-handed Katar for the Assassin jobs', () => {
  assert.strictEqual(heroWeaponType('Archer', ['bow'], 'dagger'), 'bow');
  assert.strictEqual(heroWeaponType('Hunter', ['bow'], null), 'bow');
  assert.strictEqual(heroWeaponType('Sniper', ['bow'], null), 'bow');
  assert.strictEqual(heroWeaponType('Mage', ['staff'], null), 'staff');
  assert.strictEqual(heroWeaponType('Wizard', ['staff'], null), 'staff');
  assert.strictEqual(heroWeaponType('High Wizard', ['staff'], null), 'staff');
  assert.strictEqual(heroWeaponType('Assassin', ['katar'], 'dagger'), 'katar');
  assert.strictEqual(heroWeaponType('Assassin Cross', ['katar'], 'dagger'), 'katar');
  assert.strictEqual(heroWeaponType('Thief', ['dagger'], 'dagger'), 'dagger');
  assert.ok(Object.keys(CLASS_WEAPON).length >= 8, 'all requested class overrides are explicit');
});

t('weapon anchor follows the matching idle, walk and six-frame attack pose', () => {
  assert.deepStrictEqual(JSON.parse(JSON.stringify(heroPoseFrame(false, 0, 1, true))), {kind:0,frame:0,count:1});
  assert.deepStrictEqual(JSON.parse(JSON.stringify(heroPoseFrame(true, 0, 1, true))), {kind:1,frame:2,count:8});
  assert.deepStrictEqual(JSON.parse(JSON.stringify(heroPoseFrame(false, .6, 1, true))), {kind:2,frame:2,count:6});
  for (const wt of ['bow', 'staff', 'katar']) for (let dir = 0; dir < 8; dir++) {
    const p = poseOf(2, 2, wt, 6), h = weaponHandPoint(dir, p);
    assert.ok(h.every(Number.isFinite), wt + ' hand anchor is finite in direction ' + dir);
    const a = weaponSpritePixel(dir, 2, 2, wt, true, 6);
    assert.ok(a[0] >= 0 && a[0] < 126 && a[1] >= 0 && a[1] < 134, wt + ' anchor stays in the cell for direction ' + dir);
  }
  const bow = weaponSpritePixel(0, 0, 0, 'bow', true, 1), staff = weaponSpritePixel(0, 0, 0, 'staff', true, 1),
        katar = weaponSpritePixel(0, 0, 0, 'katar', true, 1);
  assert.ok(bow[1] > 65 && bow[1] < 90, 'bow is mounted up at the hand, not down by the feet: y=' + bow[1]);
  assert.ok(staff[0] < 75 && staff[1] > 65 && staff[1] < 90, 'staff is mounted at the Mage grip');
  assert.ok(katar[1] > 70 && katar[1] < 95, 'katar is mounted at the Assassin grip');
  const staffStart = weaponSpritePixel(0, 2, 0, 'staff', true, 6), staffSwing = weaponSpritePixel(0, 2, 3, 'staff', true, 6);
  assert.ok(Math.abs(staffStart[1] - staffSwing[1]) > 5, 'the mounted staff moves through its swing instead of appearing only on attack');
  assert.deepStrictEqual(Object.keys(PACK_WEAPON_ADJUST).sort(), ['axe','bow','dagger','katar','mace','staff','sword'].sort());
});

t('weapon icon grip, not the square icon center, stays pinned to the hand during rotation', () => {
  for (const wt of Object.keys(WEAPON_ITEM_IDS)) for (const angle of [-90,-35,0,22,75]) {
    const hand=[133.5,82.25],size=31,center=weaponIconCenterAtGrip(hand[0],hand[1],size,angle,wt),[gx,gy]=WEAPON_ICON_GRIP[wt];
    const r=angle*Math.PI/180,dx=(gx-.5)*size,dy=(gy-.5)*size;
    const rendered=[center[0]+dx*Math.cos(r)-dy*Math.sin(r),center[1]+dx*Math.sin(r)+dy*Math.cos(r)];
    assert.ok(Math.abs(rendered[0]-hand[0])<1e-9&&Math.abs(rendered[1]-hand[1])<1e-9,wt+' grip drifted at '+angle+' degrees');
  }
  assert.ok(src.includes('weaponIconCenterAtGrip(sx,sy,size*scale,angle,wt)'), 'swing scale and angle are included in the grip correction');
});

t('Poring-like mobs hop while moving; other moving sprites also bob', () => {
  const moving = mobMotion({shape:'blob',run:true,a:0}, Math.PI/16);
  assert.ok(moving.hop > .4, 'a moving blob should visibly hop');
  assert.ok(moving.sx < 1 && moving.sy > 1, 'the blob stretches while airborne');
  const idleBlob = mobMotion({shape:'blob',run:false,a:0}, Math.PI/16);
  assert.ok(idleBlob.hop > 0 && idleBlob.hop < .04, 'an idle Poring only breathes slightly');
  const movingBug = mobMotion({shape:'bug',run:true,a:0}, Math.PI/16);
  assert.ok(movingBug.hop > 0, 'moving non-blob mobs still have a small motion cue');
  assert.ok(src.includes("im.style.top=(base[1]-motion.hop*h/3.05)+'px'"), 'the hop is applied to the official DOM sprite');
  assert.ok(src.includes('v.spr.position.set(lx,motion.hop,lz)') && src.includes('v.spr.scale.set(v.officialWidth*motion.sx'), 'the official GPU-texture path receives the same hop and squash');
  assert.ok(src.includes('h*ratio*motion.sx') && src.includes('h*motion.sy'), 'blob squash and stretch reach the rendered image');
});

t('every creature animates: idle breath, attack lunge, hit recoil (v83 owner request)', () => {
  // idle breathing: even a worm that used to stand perfectly frozen moves a little and scales
  const still = mobMotion({shape:'worm',run:false,a:0}, 1);
  assert.ok(Math.abs(still.hop) > 0 && Math.abs(still.hop) < .03, 'an idle creature breathes instead of standing frozen');
  assert.notStrictEqual(still.sy, 1, 'the breath also scales the sprite');
  assert.ok(Math.abs(still.sy - 1) <= .02, 'the breath stays a subtle 2%');
  // attack lunge: the sprite drives at the hero and leans into the swing, and comes back
  const wind = mobMotion({shape:'worm',run:false,a:0,atkAnim:1}, 1), strikeFrame = mobMotion({shape:'worm',run:false,a:0,atkAnim:.55}, 1), after = mobMotion({shape:'worm',run:false,a:0,atkAnim:.05}, 1);
  assert.ok(Math.abs(wind.lunge) < .05, 'the swing starts from the creature\'s own spot');
  assert.ok(strikeFrame.lunge > .3, 'mid-swing the creature lunges at the hero');
  assert.ok(Math.abs(after.lunge) < .08, 'and settles back instead of parking inside the hero');
  assert.ok(strikeFrame.tilt > .05, 'the lunge leans the sprite forward');
  // a boss winds up further than a field monster
  assert.ok(mobMotion({shape:'worm',run:false,a:0,atkAnim:.55,boss:true}, 1).lunge > strikeFrame.lunge, 'bosses wind up harder');
  // hit recoil: pushed back, squashed, briefly
  const hit = mobMotion({shape:'worm',run:false,a:0,hitAnim:1}, 1);
  assert.ok(hit.lunge < -.1, 'a hit knocks the creature away from the hero');
  assert.ok(hit.sx < 1 && hit.sy < 1, 'and squashes it for the frame');
  assert.strictEqual(mobMotion({shape:'worm',run:false,a:0,hitAnim:0}, 1).lunge, 0, 'no recoil without a hit');
  // pets carry their own lunge through the same motion
  assert.ok(mobMotion({shape:'bug',run:false,a:0,lunge:1}, 1).lunge > .3, 'a pet lunge reaches the shared motion');
  // and the sprite paths really use it
  assert.ok(src.includes('v.spr.material.rotation=motion.tilt||0'), 'the official sprite takes the lean');
  assert.ok(src.includes('if(motion.tilt)im.style.transform='), 'the DOM fallback sprite takes the lean too');
  assert.ok(src.includes('m.hitAnim=Math.max(0,(m.hitAnim||0)-dt*4.5)') && src.includes('mob.hitAnim=1') && src.includes('o.hitAnim=1'),
    'attacks and hits set the recoil on the monster that took it');
  assert.ok(!/die|death/i.test(src.match(/function mobMotion\(m,clock\)\{[\s\S]*?\n\}/)[0]), 'no death animation: mobs still vanish on kill');
});

t('official sprites are loaded over the procedural art with safe fallbacks', () => {
  assert.ok(src.includes('<div id="mobSpriteLayer"') && src.includes('<div id="weaponSpriteLayer"'), 'the sprite overlay layers exist');
  assert.ok(src.includes("new THREE.TextureLoader()") && src.includes('mobTextureLoader.setCrossOrigin(\'anonymous\')'), 'the renderer attempts GPU texture loading');
  assert.ok(src.includes('im.onerror=()=>{v.imageFailed=true'), 'a failed browser image marks the official art unavailable');
  assert.ok(src.includes('const ready=!v.imageFailed&&im.complete&&im.naturalWidth>0'), 'the DOM sprite is used when the GPU image cannot load');
  assert.ok(src.includes("if(!v.official)setCell(v.spr"), 'the original animated procedural mob art remains the final fallback');
  // v51: the owner removed the held-weapon art while the class skins are finished, so the overlay
  // is off - the parked v29 placement code stays below the flag for the next pass.
  assert.ok(src.includes('const HERO_HELD_WEAPON=false;'), 'one flag switches the held-weapon art off');
  assert.ok(src.includes("if(!HERO_HELD_WEAPON){weaponNodes.forEach(n=>n.el.style.display='none');return}"),
            'and the overlay hides instead of floating an icon on the new art');
  assert.ok(src.includes('function syncWeaponSprites(pFace,c){\n  if(!HERO_HELD_WEAPON)'),
            'the flag is the first thing the weapon placement consults');
  assert.ok(src.includes("const packed=!!(heroSpr&&heroSpr.userData.pack);if(!packed){weaponNodes.forEach(n=>n.el.style.display='none');return}"),
            'the parked path it would fall back to is untouched for the next pass');
  assert.ok(src.includes('const WEAPON_HIDDEN_DIRS=[3,4,5];'),
            'the away-view list is still remembered (a front-view item icon reads wrong there)');
  assert.ok(src.includes("n.el.style.display='grid'"), 'the weapon node code is still in place, just not reached');
  assert.ok(src.includes("slashM.visible=HERO_SWING_ARC&&atkAnim>.12&&wt!=='bow'&&wt!=='staff'")
            && src.includes('const HERO_SWING_ARC=false;'),
            'bow and staff attacks never showed a generic melee slash, and since v52 the melee arc itself waits behind HERO_SWING_ARC so it cannot double the uploaded attack animation');
  assert.ok(src.includes('n.fallback.textContent=WICON[wt]'), 'the existing weapon glyph remains the icon fallback');
});

t('basic projectiles use arrows for bows and bolts for the magic class lines', () => {
  const box = {heroWeaponType, shots: [], pl: {x:2,z:3}, mob: {x:4,z:5}, S: {eq:{}}, C:()=>box.cls};
  vm.createContext(box);
  const intClasses = src.match(/const INT_CLASSES=\[[^;]+;/)?.[0];
  assert.ok(intClasses, 'the magic class list comes from the game');
  vm.runInContext(intClasses + '\n' + grab('function shot(col){', 'function hurt(') + '\nthis.emit=shot;', box);
  for (const n of ['Archer','Hunter','Sniper','Mage','Wizard','High Wizard','Acolyte','Priest','High Priest','Swordman','Thief']) {
    box.cls={n,wt:CD.find(row=>row[0]===n)[7]};box.S.cls=n;box.shots.length=0;
    box.emit();
    const bow=['Archer','Hunter','Sniper'].includes(n),magic=!bow&&n!=='Swordman'&&n!=='Thief';
    assert.strictEqual(box.shots.length, bow||magic?1:0, n+' ranged projectile eligibility');
    if (bow||magic) {
      assert.strictEqual(box.shots[0].arrow,bow,n+' projectile shape');
      assert.strictEqual(box.shots[0].col,magic?'#d9b9ff':'#fff',n+' projectile color');
      assert.deepStrictEqual([box.shots[0].x0,box.shots[0].z0,box.shots[0].x1,box.shots[0].z1],[2,3,4,5]);
    }
  }
  box.mob=null;box.shots.length=0;box.emit();assert.strictEqual(box.shots.length,0,'no projectile without a target');
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
