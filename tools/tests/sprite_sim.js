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
vm.runInContext(mapCode + '\n' + petRosterSrc + '\n' + grab('const petIcon=', 'const RN=') + '\nthis.__data={MAPS,MOB_SPRITES,MOB_SIZE_BY_ID,MOB_SIZE_SCALE,mobSpriteUrl,PETS,petIcon};', mapBox);
const MAPS = mapBox.__data.MAPS, MOB_SPRITES = mapBox.__data.MOB_SPRITES, MOB_SIZE_BY_ID = mapBox.__data.MOB_SIZE_BY_ID,
      MOB_SIZE_SCALE = mapBox.__data.MOB_SIZE_SCALE, mobSpriteUrl = mapBox.__data.mobSpriteUrl, PETS = mapBox.__data.PETS,
      petIcon = mapBox.__data.petIcon;

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
const mobBox = {};
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
  assert.strictEqual(MAPS.length, 10);
  assert.strictEqual(MAPS.reduce((n, m) => n + m.mobs.length, 0), 80, 'the check covers all 80 regular monsters');
  assert.strictEqual(Object.keys(MOB_SPRITES).length, 90, '80 regular names plus ten boss names are mapped');
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

t('every pet portrait is a real Divine Pride monster PNG, not an emoji placeholder', () => {
  const expected={Poring:1002,Lunatic:1063,Wolf:1013,'Desert Wolf':1106,'Peco Peco':1019,'Dragon Whelp':1155,'Baphomet Jr.':1101,Angeling:1096};
  assert.strictEqual(PETS.length,8,'pet roster changed');
  for(const p of PETS){
    assert.strictEqual(p.spriteId,expected[p.n],p.n+' lost its verified monster ID');
    const html=petIcon(p);
    assert.ok(html.includes(`src="${mobSpriteUrl(p.spriteId)}"`)&&html.includes(`alt="${p.n}"`),p.n+' does not render an accessible official sprite');
  }
});

t('all 85 unique Divine Pride mob IDs match their database size class and player-relative scale', () => {
  // Reference list transcribed from the Small/Medium/Large labels on the corresponding
  // Divine Pride monster pages; index.html documents the common URL pattern and audit date.
  const dpSize={
    Small:[1001,1004,1005,1007,1008,1011,1051,1063,1070,1073,1141,1142,1143,1144,1167,1179,1837,1866,1869,2023],
    Medium:[1002,1010,1013,1014,1015,1016,1023,1030,1031,1033,1036,1041,1044,1052,1076,1077,1090,1106,1108,1112,1113,1128,1139,1154,1155,1165,1177,1180,1189,1198,1204,1215,1264,1323,1406,1517,1867,1880],
    Large:[1019,1029,1039,1055,1060,1094,1098,1115,1117,1149,1159,1166,1192,1219,1268,1272,1278,1302,1305,1366,1373,1405,1719,1775,1833,20843,2202]
  };
  const allIds=[...new Set(Object.values(MOB_SPRITES))].sort((a,b)=>a-b),classified=Object.keys(MOB_SIZE_BY_ID).map(Number).sort((a,b)=>a-b);
  assert.strictEqual(allIds.length,85,'expected 85 unique sprite IDs across the ten-map roster');
  assert.deepStrictEqual(classified,allIds,'size table must cover exactly the sprites used by map mobs and bosses');
  for(const [size,ids] of Object.entries(dpSize))for(const id of ids)assert.strictEqual(MOB_SIZE_BY_ID[id],size,'Divine Pride size for sprite '+id);
  assert.strictEqual(Object.values(dpSize).reduce((n,ids)=>n+ids.length,0),85,'the cited size reference list must account for every ID once');
  assert.strictEqual(MOB_SIZE_SCALE.Small,.62);assert.strictEqual(MOB_SIZE_SCALE.Medium,.92);assert.strictEqual(MOB_SIZE_SCALE.Large,1.28);
  for(const map of MAPS)for(const mob of [map.boss,...map.mobs]){
    assert.ok(['Small','Medium','Large'].includes(mob.spriteSize),mob.n+' missing size class');
    assert.strictEqual(mob.spriteScale,MOB_SIZE_SCALE[mob.spriteSize],mob.n+' does not use the size-class scale');
  }
  console.log('       20 Small / 38 Medium / 27 Large; scale factors .62 / .92 / 1.28 vs player');
});

t('Divine Pride item icons cover every weapon type used by all 19 classes', () => {
  const families = Object.keys(WEAPON_ITEM_IDS).sort();
  assert.deepStrictEqual(families, ['axe', 'bow', 'dagger', 'katar', 'mace', 'staff', 'sword']);
  const missing = [...new Set(CD.flatMap(row => row[7]).filter(type => !WEAPON_ITEM_IDS[type]))];
  assert.deepStrictEqual(missing, [], 'weapon families without an icon: ' + missing.join(', '));
  for (const [type, id] of Object.entries(WEAPON_ITEM_IDS))
    assert.strictEqual(weaponItemUrl(type), 'https://www.divine-pride.net/img/items/item/dpRO/' + id);
});

t('class weapon rules show bows, staves and a single katar for the requested jobs', () => {
  assert.strictEqual(heroWeaponType('Archer', ['bow'], 'dagger'), 'bow');
  assert.strictEqual(heroWeaponType('Hunter', ['bow'], null), 'bow');
  assert.strictEqual(heroWeaponType('Sniper', ['bow'], null), 'bow');
  assert.strictEqual(heroWeaponType('Mage', ['staff'], null), 'staff');
  assert.strictEqual(heroWeaponType('Wizard', ['staff'], null), 'staff');
  assert.strictEqual(heroWeaponType('High Wizard', ['staff'], null), 'staff');
  assert.strictEqual(heroWeaponType('Assassin', ['dagger', 'katar'], 'dagger'), 'katar');
  assert.strictEqual(heroWeaponType('Assassin Cross', ['dagger', 'katar'], 'dagger'), 'katar');
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
  assert.strictEqual(mobMotion({shape:'worm',run:false,a:0}, 1).hop, 0, 'stationary non-blob mobs do not float');
  assert.ok(src.includes("im.style.top=(base[1]-motion.hop*h/3.05)+'px'"), 'the hop is applied to the official DOM sprite');
  assert.ok(src.includes('v.spr.position.y=motion.hop;') && src.includes('v.spr.scale.set(v.officialWidth*motion.sx'), 'the official GPU-texture path receives the same hop and squash');
  assert.ok(src.includes('h*ratio*motion.sx') && src.includes('h*motion.sy'), 'blob squash and stretch reach the rendered image');
});

t('official sprites are loaded over the procedural art with safe fallbacks', () => {
  assert.ok(src.includes('<div id="mobSpriteLayer"') && src.includes('<div id="weaponSpriteLayer"'), 'the sprite overlay layers exist');
  assert.ok(src.includes("new THREE.TextureLoader()") && src.includes('mobTextureLoader.setCrossOrigin(\'anonymous\')'), 'the renderer attempts GPU texture loading');
  assert.ok(src.includes('im.onerror=()=>{v.imageFailed=true'), 'a failed browser image marks the official art unavailable');
  assert.ok(src.includes('const ready=!v.imageFailed&&im.complete&&im.naturalWidth>0'), 'the DOM sprite is used when the GPU image cannot load');
  assert.ok(src.includes("if(!v.official)setCell(v.spr"), 'the original animated procedural mob art remains the final fallback');
  assert.ok(src.includes('function syncWeaponSprites(pFace,c){\n  const packed=!!(heroSpr&&heroSpr.userData.pack)'), 'weapon art is mounted to the current packed hero pose');
  assert.ok(src.includes("if(pose.kind!==2){weaponNodes.forEach(n=>n.el.style.display='none');return}"),
            'v26: the held weapon is drawn only on attack frames - idle and walking are bare-handed');
  assert.ok(src.includes('const WEAPON_HIDDEN_DIRS=[3,4,5];'),
            'v27: the away-facing views (NW, N, NE) hide the weapon - a front-view item icon reads wrong there');
  assert.ok(src.includes("if(WEAPON_HIDDEN_DIRS.indexOf(dir)>=0){weaponNodes.forEach(n=>n.el.style.display='none');return}"),
            'v27: the hidden-view list is what the weapon code consults');
  assert.ok(src.includes("n.el.style.display='grid'"), 'the weapon node is still shown while the attack animation plays');
  assert.ok(src.includes("if(!mob||heroWeaponType(C().n,C().wt,S.eq.weapon&&S.eq.weapon.wt)!=='bow')return"), 'only the Archer weapon family emits the basic arrow projectile');
  assert.ok(src.includes("slashM.visible=atkAnim>.12&&wt!=='bow'&&wt!=='staff'"), 'bow and staff attacks do not show a generic melee slash');
  assert.ok(src.includes('n.fallback.textContent=WICON[wt]'), 'the existing weapon glyph remains the icon fallback');
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
