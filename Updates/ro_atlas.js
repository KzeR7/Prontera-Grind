// ============================================================================
//  RO SPRITE ATLAS v2 — "closer to real Ragnarok Online"
//  Original painterly art (no ripped client assets) painted procedurally in JS.
//  Technique that produces the RO look:
//    * every sprite/tile is painted at 2x and downsampled (airbrushed anti-alias)
//    * consistent TOP-LEFT key light, cool shadow lobes to the lower-right
//    * desaturated bases, one accent colour per map family
//    * soft baked contact shadow under each prop, strong dark silhouette
//  Exports: ro-spritesheet.png (2048x2048 RGBA) + ro-spritesheet.json manifest
// ============================================================================
function createRoAtlas() {
  const AWW = 2048, AWH = 2048;      // atlas size
  const GUT = 16;                    // gutter between tiles
  const TILE = 128;                  // tile size in the atlas
  const SS = 2;                      // supersample factor for everything

  const canvas = document.createElement('canvas');
  canvas.width = AWW;
  canvas.height = AWH;
  const ctx = canvas.getContext('2d');

  const manifest = {
    meta: { image: 'ro-spritesheet.png', size: { w: AWW, h: AWH }, format: 'RGBA8888' },
    tiles: {},
    sprites: {},
    character: {}
  };

  // ---------------------------------------------------------------- toolkit --
  let seed = 20261003;
  const rand = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
  const rr = (a, b) => a + rand() * (b - a);
  const ri = (a, b) => Math.floor(rr(a, b + 1));
  const pick = (arr) => arr[(rand() * arr.length) | 0];

  const mk = (w, h) => {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    return c;
  };
  const ell = (c, x, y, rx, ry, rot = 0) => {
    c.beginPath(); c.ellipse(x, y, Math.max(0.1, Math.abs(rx)), Math.max(0.1, Math.abs(ry)), rot, 0, Math.PI * 2);
  };
  // soft airbrush dot: radial gradient, squared falloff like RO's ground blend
  const soft = (c, x, y, r, col, a = 1) => {
    const g = c.createRadialGradient(x, y, 0, x, y, Math.max(0.5, r));
    g.addColorStop(0, col.replace('ALPHA', (a).toFixed(3)));
    g.addColorStop(0.55, col.replace('ALPHA', (a * 0.55).toFixed(3)));
    g.addColorStop(1, col.replace('ALPHA', '0'));
    c.fillStyle = g;
    c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill();
  };
  const hex = (n) => n.toString(16).padStart(2, '0');
  const shade = (rgb, k) => `rgb(${Math.max(0, Math.min(255, rgb[0] * k)) | 0},${Math.max(0, Math.min(255, rgb[1] * k)) | 0},${Math.max(0, Math.min(255, rgb[2] * k)) | 0})`;
  const rgba = (rgb, a) => `rgba(${rgb[0] | 0},${rgb[1] | 0},${rgb[2] | 0},${a})`;

  // ------------------------------------------------------------------ tiles --
  // Tiles tile seamlessly LEFT-RIGHT and TOP-BOTTOM: every dab is stamped 9x
  // (wrapped), and the edge strip is feathered so the seam disappears.
  let tileX = GUT, tileY = GUT;
  function addTile(name, painter, opts) {
    const o = opts || {};
    const big = mk(TILE * SS, TILE * SS);
    const bc = big.getContext('2d');
    bc.fillStyle = o.base;
    bc.fillRect(0, 0, TILE * SS, TILE * SS);
    painter(bc, TILE * SS, TILE * SS);
    const t = mk(TILE, TILE);
    const tc = t.getContext('2d');
    tc.imageSmoothingEnabled = true;
    tc.imageSmoothingQuality = 'high';
    tc.drawImage(big, 0, 0, TILE, TILE);
    if (tileX + TILE > AWW - GUT) { tileX = GUT; tileY += TILE + GUT; }
    ctx.drawImage(t, tileX, tileY);
    manifest.tiles[name] = { x: tileX, y: tileY, w: TILE, h: TILE };
    tileX += TILE + GUT;
  }
  // wrapped dab helpers for tiles
  function tDab(c, S, x, y, r, col, a) {
    for (let ox = -1; ox <= 1; ox++) for (let oy = -1; oy <= 1; oy++) soft(c, x + ox * S, y + oy * S, r, col, a);
  }
  function tBlob(c, S, x, y, rx, ry, rot, col) {
    for (let ox = -1; ox <= 1; ox++) for (let oy = -1; oy <= 1; oy++) {
      c.fillStyle = col;
      ell(c, x + ox * S, y + oy * S, rx, ry, rot);
      c.fill();
    }
  }
  // mottled ground base: big soft patches + fine grain (the RO airbrush ground)
  function ground(c, S, baseTone, patchCols, grainCols, nPatch, nGrain) {
    for (let i = 0; i < nPatch; i++) {
      tDab(c, S, rand() * S, rand() * S, rr(14, 46), pick(patchCols), rr(0.20, 0.55));
    }
    for (let i = 0; i < nGrain; i++) {
      tDab(c, S, rand() * S, rand() * S, rr(1.5, 5.5), pick(grainCols), rr(0.10, 0.32));
    }
  }
  // a few hand-drawn blades / pebbles to break the noise up
  function blades(c, S, col, n, len) {
    c.strokeStyle = col; c.lineWidth = 1.4;
    for (let i = 0; i < n; i++) {
      const x = rand() * S, y = rand() * S, l = rr(len * 0.6, len);
      c.beginPath(); c.moveTo(x, y); c.quadraticCurveTo(x + rr(-3, 3), y - l * 0.6, x + rr(-4, 4), y - l);
      c.stroke();
    }
  }
  function pebbles(c, S, cols, n, maxR) {
    for (let i = 0; i < n; i++) {
      const x = rand() * S, y = rand() * S, r = rr(1.5, maxR);
      tBlob(c, S, x, y, r, r * rr(0.6, 0.9), rand() * 3, pick(cols));
      tDab(c, S, x - r * 0.35, y - r * 0.35, r * 0.8, 'rgba(255,255,240,ALPHA)', 0.22);
    }
  }
  // tile-specific seam darkening like RO (edge of a surface type)
  function edgeShade(c, S, col, w) {
    c.save();
    const g1 = c.createLinearGradient(0, 0, w, 0);
    g1.addColorStop(0, col); g1.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = g1; c.fillRect(0, 0, w, S);
    const g2 = c.createLinearGradient(S, 0, S - w, 0);
    g2.addColorStop(0, col); g2.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = g2; c.fillRect(S - w, 0, w, S);
    c.restore();
  }

  // ---- grass family (olive = Prontera, forest = Payon, bright, flowers, dead)
  const grassOlive = { base: '#41451a', patch: ['rgba(92,87,42,ALPHA)', 'rgba(64,74,30,ALPHA)', 'rgba(52,58,22,ALPHA)'], grain: ['rgba(126,138,64,ALPHA)', 'rgba(58,64,26,ALPHA)', 'rgba(88,96,40,ALPHA)'] };
  addTile('grass_olive', (c, S) => {
    ground(c, S, 0, grassOlive.patch, grassOlive.grain, 34, 700);
    blades(c, S, 'rgba(118,130,58,0.28)', 240, 7);
    blades(c, S, 'rgba(58,66,26,0.30)', 200, 6);
  }, { base: grassOlive.base });

  addTile('grass_forest', (c, S) => {
    ground(c, S, 0, ['rgba(70,86,32,ALPHA)', 'rgba(48,60,22,ALPHA)', 'rgba(60,52,28,ALPHA)'], ['rgba(96,116,44,ALPHA)', 'rgba(40,50,18,ALPHA)', 'rgba(74,64,34,ALPHA)'], 40, 780);
    blades(c, S, 'rgba(104,124,48,0.26)', 260, 7);
    for (let i = 0; i < 40; i++) { // fallen leaf litter
      tBlob(c, S, rand() * S, rand() * S, rr(2, 5), rr(1.2, 3), rand() * 3, pick(['rgba(122,96,44,0.45)', 'rgba(88,70,34,0.45)', 'rgba(140,112,52,0.35)']));
    }
  }, { base: '#3b4c19' });

  addTile('grass_bright', (c, S) => {
    ground(c, S, 0, ['rgba(104,120,48,ALPHA)', 'rgba(78,96,36,ALPHA)', 'rgba(88,88,44,ALPHA)'], ['rgba(150,166,74,ALPHA)', 'rgba(84,98,38,ALPHA)'], 32, 660);
    blades(c, S, 'rgba(150,168,72,0.30)', 260, 8);
  }, { base: '#525a22' });

  addTile('grass_flowers', (c, S) => {
    ground(c, S, 0, grassOlive.patch, grassOlive.grain, 30, 620);
    blades(c, S, 'rgba(118,130,58,0.26)', 200, 7);
    // scattered white daisies / yellow dots, sparse like RO flower fields
    for (let i = 0; i < 46; i++) {
      const x = rand() * S, y = rand() * S, r = rr(1.8, 3.4);
      tBlob(c, S, x, y, r, r * 0.8, 0, pick(['rgba(240,240,220,0.95)', 'rgba(232,226,190,0.9)']));
      tDab(c, S, x, y, r * 2.2, 'rgba(255,255,240,ALPHA)', 0.25);
    }
    for (let i = 0; i < 16; i++) {
      const x = rand() * S, y = rand() * S;
      tBlob(c, S, x, y, 2.2, 1.8, 0, 'rgba(226,196,72,0.9)');
    }
  }, { base: grassOlive.base });

  addTile('grass_dead', (c, S) => {
    ground(c, S, 0, ['rgba(72,62,52,ALPHA)', 'rgba(52,44,38,ALPHA)', 'rgba(60,54,42,ALPHA)'], ['rgba(96,82,64,ALPHA)', 'rgba(44,38,34,ALPHA)'], 36, 700);
    blades(c, S, 'rgba(112,96,70,0.30)', 220, 7);
    for (let i = 0; i < 26; i++) { // ash flecks
      tDab(c, S, rand() * S, rand() * S, rr(1, 3), 'rgba(180,172,158,ALPHA)', 0.28);
    }
  }, { base: '#3a332c' });

  // ---- dirt family
  const dirtBase = { base: '#5c4a2c', patch: ['rgba(120,98,58,ALPHA)', 'rgba(84,68,40,ALPHA)', 'rgba(70,56,34,ALPHA)'], grain: ['rgba(150,124,74,ALPHA)', 'rgba(70,54,32,ALPHA)'] };
  addTile('dirt_path', (c, S) => {
    ground(c, S, 0, dirtBase.patch, dirtBase.grain, 34, 760);
    pebbles(c, S, ['rgba(140,126,100,0.55)', 'rgba(112,100,78,0.5)'], 26, 3.6);
    edgeShade(c, S, 'rgba(40,30,16,0.30)', 22);
  }, { base: dirtBase.base });

  addTile('dirt_worn', (c, S) => {
    ground(c, S, 0, ['rgba(138,116,76,ALPHA)', 'rgba(96,80,50,ALPHA)'], ['rgba(168,142,92,ALPHA)', 'rgba(78,64,40,ALPHA)'], 30, 700);
    for (let i = 0; i < 16; i++) { // wheel-rut streaks
      const y = rand() * S;
      tDab(c, S, rand() * S, y, rr(10, 30), 'rgba(160,136,90,ALPHA)', 0.18);
    }
    pebbles(c, S, ['rgba(150,138,112,0.45)'], 18, 3);
  }, { base: '#6a563a' });

  addTile('dirt_roots', (c, S) => {
    ground(c, S, 0, dirtBase.patch, dirtBase.grain, 30, 640);
    c.strokeStyle = 'rgba(74,54,32,0.85)'; c.lineCap = 'round';
    for (let i = 0; i < 14; i++) {
      const x = rand() * S, y = rand() * S, a = rand() * Math.PI * 2, len = rr(24, 62);
      for (let ox = -1; ox <= 1; ox++) for (let oy = -1; oy <= 1; oy++) {
        c.lineWidth = rr(2.4, 5.5);
        c.beginPath();
        c.moveTo(x + ox * S, y + oy * S);
        c.quadraticCurveTo(x + ox * S + Math.cos(a) * len * 0.5 + rr(-14, 14), y + oy * S + Math.sin(a) * len * 0.5 + rr(-14, 14),
          x + ox * S + Math.cos(a) * len, y + oy * S + Math.sin(a) * len);
        c.stroke();
      }
    }
  }, { base: '#52432a' });

  // ---- sand family
  addTile('sand_light', (c, S) => {
    ground(c, S, 0, ['rgba(190,168,122,ALPHA)', 'rgba(158,136,96,ALPHA)'], ['rgba(212,192,148,ALPHA)', 'rgba(140,120,84,ALPHA)'], 30, 780);
    pebbles(c, S, ['rgba(196,178,140,0.4)', 'rgba(150,132,100,0.4)'], 16, 2.6);
  }, { base: '#7a6647' });

  addTile('sand_ripples', (c, S) => {
    ground(c, S, 0, ['rgba(190,168,122,ALPHA)', 'rgba(150,128,90,ALPHA)'], ['rgba(214,196,152,ALPHA)', 'rgba(136,116,80,ALPHA)'], 26, 640);
    c.lineWidth = 2.2; c.lineCap = 'round';
    for (let i = 0; i < 26; i++) {
      const y = (i / 26) * S + rr(-6, 6);
      c.strokeStyle = i % 2 ? 'rgba(212,192,148,0.34)' : 'rgba(150,128,90,0.30)';
      for (let ox = -1; ox <= 1; ox++) {
        c.beginPath();
        for (let x = -20; x <= S + 20; x += 18) {
          c.lineTo(x + ox * S, y + Math.sin((x + i * 22) * 0.045) * 5);
        }
        c.stroke();
      }
    }
  }, { base: '#7a6647' });

  // ---- rock family
  function rockTile(c, S, baseCol, light, dark, mossAmt) {
    c.fillStyle = baseCol;
    c.fillRect(0, 0, S, S);
    // chunky rocks
    for (let i = 0; i < 46; i++) {
      const x = rand() * S, y = rand() * S, w = rr(14, 34), h = rr(10, 24), rot = rr(-0.5, 0.5);
      const pts = [];
      const n = 7;
      for (let k = 0; k < n; k++) {
        const a = (k / n) * Math.PI * 2 + rr(-0.2, 0.2);
        pts.push([Math.cos(a) * w * rr(0.7, 1.05), Math.sin(a) * h * rr(0.7, 1.05)]);
      }
      for (let ox = -1; ox <= 1; ox++) for (let oy = -1; oy <= 1; oy++) {
        c.save(); c.translate(x + ox * S, y + oy * S); c.rotate(rot);
        c.fillStyle = pick([light, baseCol, dark]);
        c.beginPath(); c.moveTo(pts[0][0], pts[0][1]);
        for (const p of pts.slice(1)) c.lineTo(p[0], p[1]);
        c.closePath(); c.fill();
        c.fillStyle = rgba([255, 250, 235], 0.16);
        ell(c, -w * 0.2, -h * 0.35, w * 0.5, h * 0.3, -0.2); c.fill();
        c.fillStyle = rgba([20, 16, 12], 0.30);
        ell(c, w * 0.15, h * 0.42, w * 0.55, h * 0.28, 0.15); c.fill();
        c.restore();
      }
    }
    if (mossAmt) {
      for (let i = 0; i < mossAmt; i++) tDab(c, S, rand() * S, rand() * S, rr(3, 11), pick(['rgba(78,104,44,ALPHA)', 'rgba(58,84,36,ALPHA)', 'rgba(96,120,52,ALPHA)']), rr(0.25, 0.6));
    }
  }
  addTile('cliff_rock', (c, S) => rockTile(c, S, '#4a4a45', '#6e6e66', '#32322c', 0), { base: '#4a4a45' });
  addTile('cliff_dark', (c, S) => rockTile(c, S, '#3a3a3c', '#565658', '#242426', 0), { base: '#3a3a3c' });
  addTile('cliff_moss', (c, S) => rockTile(c, S, '#464a40', '#666b5c', '#2e322a', 90), { base: '#464a40' });

  // ---- bank (shore) family
  addTile('riverbank_wall', (c, S) => {   // grey stone coping wall used by Payon
    rockTile(c, S, '#4e5049', '#6f7268', '#34362f', 40);
    c.fillStyle = 'rgba(28,32,22,0.34)';
    c.fillRect(0, 0, S, 18);
    c.fillStyle = 'rgba(220,222,205,0.12)';
    c.fillRect(0, 18, S, 5);
  }, { base: '#4e5049' });
  addTile('bank_sand', (c, S) => {
    ground(c, S, 0, ['rgba(196,176,132,ALPHA)', 'rgba(158,138,100,ALPHA)'], ['rgba(220,202,158,ALPHA)', 'rgba(140,120,86,ALPHA)'], 30, 700);
    for (let i = 0; i < 22; i++) tDab(c, S, rand() * S, rand() * S, rr(6, 20), 'rgba(120,112,86,ALPHA)', 0.22);
    pebbles(c, S, ['rgba(180,166,132,0.45)'], 20, 3);
  }, { base: '#8a7550' });
  addTile('bank_rock', (c, S) => {
    rockTile(c, S, '#5a5748', '#7c7966', '#3a382e', 20);
    for (let i = 0; i < 30; i++) tDab(c, S, rand() * S, rand() * S, rr(4, 14), 'rgba(150,140,110,ALPHA)', 0.18);
  }, { base: '#5a5748' });

  // ---- wood family
  function planks(c, S, cols, dark, light, gapCol, wear) {
    const pw = S / cols;
    c.fillStyle = gapCol; c.fillRect(0, 0, S, S);
    for (let i = 0; i < cols; i++) {
      const x = i * pw;
      const tone = rr(0.86, 1.14);
      c.fillStyle = shade(cols ? [138, 104, 62] : [138, 104, 62], tone);
      c.fillRect(x + 2, -4, pw - 4, S + 8);
      // grain
      c.strokeStyle = rgba([90, 64, 36], 0.35);
      c.lineWidth = 1.3;
      for (let k = 0; k < 5; k++) {
        const yy = rand() * S;
        c.beginPath();
        c.moveTo(x + 3, yy);
        c.quadraticCurveTo(x + pw * 0.5, yy + rr(-3, 3), x + pw - 3, yy + rr(-2, 2));
        c.stroke();
      }
      // knot
      if (rand() < 0.5) {
        const kx = x + pw * rr(0.3, 0.7), ky = rand() * S;
        ell(c, kx, ky, rr(2, 4), rr(1.6, 3), rand(), rgba([80, 56, 30], 0.6)); c.fill();
      }
      // top light / bottom shade on the plank edge
      c.fillStyle = rgba([230, 200, 150], 0.20);
      c.fillRect(x + 2, -4, pw - 4, rr(3, 6));
      c.fillStyle = rgba([60, 40, 20], 0.35);
      c.fillRect(x + pw - 6, -4, 4, S + 8);
      // nails
      c.fillStyle = rgba([70, 62, 52], 0.75);
      for (const ny of [rr(8, 16), S - rr(8, 16)]) { ell(c, x + pw * 0.5, ny, 1.6, 1.6); c.fill(); }
    }
    if (wear) {
      for (let i = 0; i < wear; i++) tDab(c, S, rand() * S, rand() * S, rr(4, 16), 'rgba(40,30,18,ALPHA)', rr(0.10, 0.28));
    }
  }
  addTile('bridge_planks', (c, S) => planks(c, S, 8, 0, 0, '#4a3620', 26), { base: '#8a6a3e' });
  addTile('bridge_red', (c, S) => {       // Amatsu lacquered red bridge deck
    planks(c, S, 7, 0, 0, '#4a1c16', 12);
    c.fillStyle = 'rgba(150,38,30,0.55)'; c.fillRect(0, 0, S, S);
    const g = c.createLinearGradient(0, 0, S, 0);
    g.addColorStop(0, 'rgba(196,60,44,0.45)');
    g.addColorStop(0.5, 'rgba(150,38,30,0.30)');
    g.addColorStop(1, 'rgba(110,26,22,0.45)');
    c.fillStyle = g; c.fillRect(0, 0, S, S);
  }, { base: '#9c2f24' });
  addTile('pier_planks', (c, S) => {
    planks(c, S, 6, 0, 0, '#5a462c', 18);
    c.fillStyle = 'rgba(150,140,120,0.22)'; c.fillRect(0, 0, S, S);   // sun-bleached
  }, { base: '#9a8258' });

  // ---- floor family
  addTile('cobble_old', (c, S) => {
    c.fillStyle = '#6a655c'; c.fillRect(0, 0, S, S);
    const n = 6, cell = S / n;
    for (let r = 0; r < n; r++) for (let k = -1; k <= n; k++) {
      const cx = (k + (r % 2) * 0.5) * cell + rr(-4, 4), cy = r * cell + rr(-4, 4);
      const rx = cell * rr(0.34, 0.46), ry = cell * rr(0.30, 0.44);
      for (let ox = -1; ox <= 1; ox++) {
        const px = cx + ox * S;
        c.fillStyle = shade([160, 154, 142], rr(0.86, 1.14));
        ell(c, px, cy, rx, ry, rr(-0.4, 0.4)); c.fill();
        c.fillStyle = rgba([255, 250, 235], 0.14);
        ell(c, px - rx * 0.2, cy - ry * 0.3, rx * 0.6, ry * 0.4); c.fill();
        c.fillStyle = rgba([60, 56, 50], 0.18);
        ell(c, px, cy + ry * 0.5, rx * 0.8, ry * 0.3); c.fill();
      }
    }
    for (let i = 0; i < 90; i++) tDab(c, S, rand() * S, rand() * S, rr(2, 9), pick(['rgba(90,96,64,ALPHA)', 'rgba(120,116,104,ALPHA)']), rr(0.14, 0.4));
  }, { base: '#6a655c' });
  addTile('paddy', (c, S) => {            // Louyang flooded rice field
    c.fillStyle = '#2c4a44'; c.fillRect(0, 0, S, S);
    // water sheen
    for (let i = 0; i < 22; i++) tDab(c, S, rand() * S, rand() * S, rr(12, 34), pick(['rgba(64,120,120,ALPHA)', 'rgba(30,68,72,ALPHA)', 'rgba(96,150,140,ALPHA)']), rr(0.20, 0.45));
    // rice seedlings in rows
    for (let r = 0; r < 7; r++) {
      const y = 10 + r * (S - 20) / 6;
      for (let k = 0; k < 12; k++) {
        const x = 6 + k * (S - 12) / 11 + rr(-3, 3);
        for (let ox = -1; ox <= 1; ox++) for (let oy = -1; oy <= 1; oy++) {
          c.strokeStyle = pick(['rgba(96,140,60,0.85)', 'rgba(72,116,48,0.85)', 'rgba(118,160,72,0.8)']);
          c.lineWidth = 1.5;
          c.beginPath();
          c.moveTo(x + ox * S, y + oy * S);
          c.lineTo(x + ox * S + rr(-4, 4), y + oy * S - rr(6, 12));
          c.stroke();
        }
      }
    }
    edgeShade(c, S, 'rgba(30,44,30,0.35)', 20);
  }, { base: '#2c4a44' });

  // ---- water family (animated pairs; frame_0 and frame_1 are offset so they
  //      cross-fade cleanly when the game flips between them)
  function waterTile(c, S, deep, mid, hi, foam, rippleOffset) {
    const g = c.createLinearGradient(0, 0, 0, S);
    g.addColorStop(0, deep); g.addColorStop(0.5, mid); g.addColorStop(1, deep);
    c.fillStyle = g; c.fillRect(0, 0, S, S);
    // broad soft colour patches (RO water is mottled, not banded)
    for (let i = 0; i < 26; i++) tDab(c, S, rand() * S, rand() * S, rr(16, 54), pick([mid, hi, deep]), rr(0.10, 0.26));
    // ripple lines
    c.lineCap = 'round';
    for (let i = 0; i < 16; i++) {
      const y = ((i / 16) * S + rippleOffset * 18) % S;
      c.strokeStyle = i % 3 === 0 ? rgba([255, 255, 255], 0.16) : rgba([190, 240, 255], 0.20);
      c.lineWidth = rr(1.6, 3.2);
      for (let ox = -1; ox <= 1; ox++) {
        c.beginPath();
        for (let x = -20; x <= S + 20; x += 14) {
          c.lineTo(x + ox * S, y + Math.sin((x + i * 26 + rippleOffset * 40) * 0.05) * 4.5);
        }
        c.stroke();
      }
    }
    for (let i = 0; i < 26; i++) tDab(c, S, rand() * S, rand() * S, rr(2, 7), foam, rr(0.12, 0.34));
  }
  addTile('water_frame_0', (c, S) => waterTile(c, S, '#144a5c', '#1f647a', '#3d92a8', 'rgba(200,244,255,ALPHA)', 0), { base: '#1f647a' });
  addTile('water_frame_1', (c, S) => waterTile(c, S, '#144a5c', '#206a80', '#4198ae', 'rgba(206,248,255,ALPHA)', 0.5), { base: '#1f647a' });
  addTile('sea_frame_0', (c, S) => waterTile(c, S, '#123f60', '#1f6285', '#41a8c4', 'rgba(220,250,255,ALPHA)', 0), { base: '#1f6285' });
  addTile('sea_frame_1', (c, S) => waterTile(c, S, '#124264', '#21688b', '#48b0cc', 'rgba(226,252,255,ALPHA)', 0.5), { base: '#1f6285' });
  addTile('cave_frame_0', (c, S) => waterTile(c, S, '#0a2430', '#103c50', '#1c5c74', 'rgba(120,200,220,ALPHA)', 0), { base: '#103c50' });
  addTile('cave_frame_1', (c, S) => waterTile(c, S, '#0a2632', '#124054', '#206278', 'rgba(126,206,226,ALPHA)', 0.5), { base: '#103c50' });

  // ---------------------------------------------------------------- sprites --
  // Packer keeps a 16px gutter around every crop so the game can sample safely.
  let px = GUT, py = GUT + Math.ceil((tileY + TILE + GUT) / 1), rowH = 0;
  function addSprite(name, w, h, ax, ay, painter) {
    const big = mk(Math.ceil(w * SS), Math.ceil(h * SS));
    const bc = big.getContext('2d');
    painter(bc, big.width, big.height);          // painter works in SS pixels
    const out = mk(w, h);
    const oc = out.getContext('2d');
    oc.imageSmoothingEnabled = true;
    oc.imageSmoothingQuality = 'high';
    oc.drawImage(big, 0, 0, w, h);
    if (px + w > AWW - GUT) { px = GUT; py += rowH + GUT; rowH = 0; }
    ctx.drawImage(out, px, py);
    manifest.sprites[name] = { x: px, y: py, w, h, anchorX: ax === undefined ? Math.round(w / 2) : ax, anchorY: ay === undefined ? h : ay };
    px += w + GUT;
    rowH = Math.max(rowH, h);
  }
  // light rig shared by every prop: TOP-LEFT warm key, cool rim lower-right
  const LIGHT = { dir: -0.75, warm: [255, 236, 190], cool: [150, 175, 205] };
  // baked soft contact shadow
  function contact(c, x, y, rx, ry, a) {
    const g = c.createRadialGradient(x, y, 0, x, y, Math.max(rx, ry));
    g.addColorStop(0, `rgba(18,22,14,${a})`);
    g.addColorStop(0.6, `rgba(18,22,14,${a * 0.55})`);
    g.addColorStop(1, 'rgba(18,22,14,0)');
    c.save();
    c.translate(x, y); c.scale(1, ry / Math.max(0.001, rx));
    c.fillStyle = g;
    c.beginPath(); c.arc(0, 0, rx, 0, Math.PI * 2); c.fill();
    c.restore();
  }
  // generic irregular rock body with facets + moss (used by boulders/crags)
  function rockBody(c, cx, by, w, h, cols, moss) {
    const hull = [];
    const n = 9;
    for (let i = 0; i < n; i++) {
      const a = Math.PI + (i / (n - 1)) * Math.PI;
      hull.push([cx + Math.cos(a) * w * rr(0.82, 1.0), by - h * rr(0.55, 1.0) + Math.sin(a) * h * 0.18]);
    }
    hull.push([cx + w * 0.95, by], [cx - w * 0.95, by]);
    c.fillStyle = cols[1];
    c.beginPath(); c.moveTo(hull[0][0], hull[0][1]);
    for (const p of hull.slice(1)) c.lineTo(p[0], p[1]);
    c.closePath(); c.fill();
    c.strokeStyle = rgba([24, 22, 18], 0.9); c.lineWidth = 2.4; c.stroke();
    // facets
    for (let i = 0; i < 7; i++) {
      const a = rr(-Math.PI * 0.9, -0.1), rad = rr(0.25, 0.75);
      const fx = cx + Math.cos(a) * w * rad, fy = by - h * rr(0.25, 0.8);
      c.fillStyle = pick([cols[0], cols[1], cols[2]]);
      c.beginPath();
      const fn = 5, fw = w * rr(0.28, 0.55), fh = h * rr(0.22, 0.4);
      for (let k = 0; k < fn; k++) {
        const aa = (k / fn) * Math.PI * 2 + rr(-0.25, 0.25);
        c.lineTo(fx + Math.cos(aa) * fw * rr(0.7, 1.05), fy + Math.sin(aa) * fh * rr(0.7, 1.05));
      }
      c.closePath(); c.fill();
    }
    // top-left light rim
    c.strokeStyle = rgba(LIGHT.warm, 0.30); c.lineWidth = 3;
    c.beginPath(); c.moveTo(hull[1][0] + 4, hull[1][1] + 6);
    for (let i = 2; i < 5; i++) c.lineTo(hull[i][0] - 3, hull[i][1] + 8);
    c.stroke();
    // bottom AO
    c.fillStyle = 'rgba(16,16,12,0.30)';
    ell(c, cx, by - h * 0.12, w * 0.9, h * 0.16); c.fill();
    if (moss) {
      for (let i = 0; i < moss; i++) {
        const a = rr(-Math.PI * 0.95, -0.15);
        const mx = cx + Math.cos(a) * w * rr(0.3, 0.95), my = by - h * rr(0.3, 0.95);
        c.fillStyle = pick(['rgba(88,112,52,0.85)', 'rgba(66,92,40,0.85)', 'rgba(108,130,60,0.8)']);
        ell(c, mx, my, rr(4, 12), rr(3, 8), rr(-0.5, 0.5)); c.fill();
      }
    }
  }
  // trunk painter: tapered, bark striations, root flare
  function trunk(c, x0, y0, x1, y1, wBase, wTop, colBase) {
    const ang = Math.atan2(y1 - y0, x1 - x0);
    const nx = Math.cos(ang + Math.PI / 2), ny = Math.sin(ang + Math.PI / 2);
    c.beginPath();
    c.moveTo(x0 + nx * wBase, y0 + ny * wBase);
    c.quadraticCurveTo((x0 + x1) / 2 + nx * wBase * 0.5, (y0 + y1) / 2 + ny * wBase * 0.5, x1 + nx * wTop, y1 + ny * wTop);
    c.lineTo(x1 - nx * wTop, y1 - ny * wTop);
    c.quadraticCurveTo((x0 + x1) / 2 - nx * wBase * 0.5, (y0 + y1) / 2 - ny * wBase * 0.5, x0 - nx * wBase, y0 - ny * wBase);
    c.closePath();
    c.fillStyle = colBase; c.fill();
    // striations along the trunk
    const len = Math.hypot(x1 - x0, y1 - y0), n = Math.max(4, (len / 9) | 0);
    for (let i = 0; i < n; i++) {
      const t = (i + rr(0.1, 0.9)) / n;
      const cx = x0 + (x1 - x0) * t, cy = y0 + (y1 - y0) * t;
      const wd = wBase + (wTop - wBase) * t;
      c.strokeStyle = i % 2 ? 'rgba(60,42,24,0.35)' : 'rgba(146,112,72,0.28)';
      c.lineWidth = rr(1, 2.6);
      c.beginPath();
      c.moveTo(cx - nx * wd * 0.7, cy - ny * wd * 0.7);
      c.lineTo(cx + nx * wd * 0.6, cy + ny * wd * 0.6);
      c.stroke();
    }
    // key light on the left edge, AO on the right edge
    c.strokeStyle = rgba([226, 196, 140], 0.30); c.lineWidth = 2.2;
    c.beginPath(); c.moveTo(x0 + nx * wBase * 0.85, y0 + ny * wBase * 0.85);
    c.quadraticCurveTo((x0 + x1) / 2 + nx * wBase * 0.45, (y0 + y1) / 2 + ny * wBase * 0.45, x1 + nx * wTop * 0.8, y1 + ny * wTop * 0.8);
    c.stroke();
    c.strokeStyle = 'rgba(30,20,12,0.35)'; c.lineWidth = 2.4;
    c.beginPath(); c.moveTo(x0 - nx * wBase * 0.85, y0 - ny * wBase * 0.85);
    c.quadraticCurveTo((x0 + x1) / 2 - nx * wBase * 0.45, (y0 + y1) / 2 - ny * wBase * 0.45, x1 - nx * wTop * 0.8, y1 - ny * wTop * 0.8);
    c.stroke();
  }
  // canopy: RO trees are clumps of round leaf masses, lit top-left, dark under
  function canopyClump(c, cx, cy, R, colSet, n, squash) {
    for (let i = 0; i < n; i++) {
      const a = rand() * Math.PI * 2;
      const rad = Math.pow(rand(), 0.6) * R;
      const x = cx + Math.cos(a) * rad * 1.12;
      const y = cy + Math.sin(a) * rad * (squash || 0.8);
      const r = R * rr(0.20, 0.36);
      // pick tone by height (top brighter) and side (left warmer)
      const up = (cy - y) / R, left = (cx - x) / R;
      let col = colSet[1];
      if (up > 0.15 && left > -0.2) col = colSet[0];
      else if (up < -0.25 || left < -0.35) col = colSet[2];
      c.fillStyle = col;
      ell(c, x, y, r * 1.12, r * 0.92, rr(-0.4, 0.4)); c.fill();
      // warm rim
      c.fillStyle = rgba(LIGHT.warm, 0.12);
      ell(c, x - r * 0.35, y - r * 0.4, r * 0.5, r * 0.36, -0.4); c.fill();
    }
    // leaf speckle for texture
    for (let i = 0; i < n * 3; i++) {
      const a = rand() * Math.PI * 2, rad = Math.pow(rand(), 0.5) * R * 1.1;
      const x = cx + Math.cos(a) * rad * 1.12, y = cy + Math.sin(a) * rad * (squash || 0.8);
      c.fillStyle = pick([rgba([255, 255, 230], 0.10), rgba([20, 26, 12], 0.16), colSet[0], colSet[2]]);
      ell(c, x, y, rr(2, 5), rr(1.6, 3.4), rand() * 3); c.fill();
    }
  }
  // tiny cross-shaped shrubs / flowers seen from above in RO maps
  function shrub(c, x, y, s, cols) {
    c.fillStyle = pick(cols);
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * Math.PI * 2 + 0.4;
      ell(c, x + Math.cos(a) * s * 0.5, y + Math.sin(a) * s * 0.5, s * 0.42, s * 0.30, a); c.fill();
    }
    ell(c, x, y, s * 0.34, s * 0.34); c.fill();
  }

  // ------------------------------------------------------------ BIG TREES ----
  // RO field trees: 3-4x character height, thick trunk, layered round clumps.
  const charH = 80;                      // reference: character frame height
  function bigTree(name, species) {
    const W = 340, H = 360, SSZ = 340;
    addSprite(name, SSZ, H, SSZ / 2, H - 12, (c, w, h) => {
      const cx = w * 0.5, by = h - 16;
      contact(c, cx, by, w * 0.30, w * 0.10, 0.34);
      // root flare + trunk
      const lean = species.lean;
      trunk(c, cx, by - 6, cx + lean, by - species.trunkH, species.baseW, species.topW, species.bark);
      // root buttresses
      c.fillStyle = species.bark;
      for (const s of [-1, 1]) {
        c.beginPath();
        c.moveTo(cx + s * species.baseW * 0.5, by - 10);
        c.quadraticCurveTo(cx + s * species.baseW * 1.6, by - 2, cx + s * species.baseW * 2.6, by + 4);
        c.quadraticCurveTo(cx + s * species.baseW * 1.2, by - 14, cx + s * species.baseW * 0.4, by - 26);
        c.closePath(); c.fill();
      }
      c.fillStyle = 'rgba(24,18,10,0.30)';
      for (const s of [-1, 1]) ell(c, cx + s * species.baseW * 1.5, by + 1, species.baseW * 1.1, 5, s * 0.2), c.fill();
      // branches into the canopy
      const bx = cx + lean, byy = by - species.trunkH;
      c.strokeStyle = species.barkDark; c.lineCap = 'round';
      for (const b of species.branches) {
        c.lineWidth = b.w;
        c.beginPath();
        c.moveTo(bx + b.x0, byy + b.y0);
        c.quadraticCurveTo(bx + b.x1, byy + b.y1, bx + b.x2, byy + b.y2);
        c.stroke();
      }
      // canopy: 3 stacked clumps (dark underside first)
      canopyClump(c, bx + species.c[0][0], byy + species.c[0][1], species.c[0][2], species.dark, 30, 0.72);
      canopyClump(c, bx + species.c[1][0], byy + species.c[1][1], species.c[1][2], species.mid, 34, 0.74);
      canopyClump(c, bx + species.c[2][0], byy + species.c[2][1], species.c[2][2], species.lit, 26, 0.7);
    });
  }
  bigTree('tree_canopy_broad', {
    trunkH: 150, baseW: 22, topW: 15, lean: 0, bark: '#6b5436', barkDark: '#54401f',
    branches: [{ x0: -14, y0: 6, x1: -52, y1: -34, x2: -78, y2: -30, w: 13 }, { x0: 12, y0: 4, x1: 54, y1: -36, x2: 82, y2: -28, w: 12 }, { x0: 0, y0: 0, x1: 6, y1: -44, x2: 2, y2: -74, w: 12 }],
    c: [[0, -96, 120], [-6, -150, 104], [-16, -184, 74]],
    dark: ['#2f4a1c', '#26401a', '#1c3014'], mid: ['#41672a', '#365a24', '#28461c'], lit: ['#5c8a38', '#4d7a30', '#3d6326']
  });
  bigTree('tree_canopy_deep', {
    trunkH: 168, baseW: 20, topW: 13, lean: 4, bark: '#5d4a30', barkDark: '#463420',
    branches: [{ x0: -12, y0: 8, x1: -46, y1: -40, x2: -70, y2: -40, w: 11 }, { x0: 10, y0: 6, x1: 44, y1: -42, x2: 68, y2: -36, w: 11 }, { x0: 0, y0: 0, x1: 0, y1: -50, x2: -4, y2: -84, w: 11 }],
    c: [[0, -108, 108], [-4, -164, 96], [6, -200, 66]],
    dark: ['#22391a', '#1b3015', '#152610'], mid: ['#2f4f22', '#28441c', '#203a17'], lit: ['#466b2c', '#3c6026', '#32521f']
  });
  bigTree('tree_canopy_pale', {
    trunkH: 132, baseW: 19, topW: 12, lean: -3, bark: '#75603f', barkDark: '#5a4628',
    branches: [{ x0: -12, y0: 6, x1: -48, y1: -30, x2: -74, y2: -22, w: 11 }, { x0: 12, y0: 4, x1: 50, y1: -32, x2: 76, y2: -24, w: 11 }],
    c: [[0, -86, 124], [0, -138, 112], [-6, -172, 78]],
    dark: ['#3c5624', '#334c1f', '#29401a'], mid: ['#527634', '#47692c', '#3b5926'], lit: ['#6f9a42', '#628a3a', '#517530']
  });
  // tall thin cluster tree (several slim trunks, small high canopy) — Payon/Louyang
  addSprite('tree_cluster_tall', 200, 360, 100, 348, (c, w, h) => {
    const cx = w * 0.5, by = h - 12;
    contact(c, cx, by, 74, 20, 0.30);
    const stems = [[-26, 250, -40, 0.86], [-6, 292, -10, 1.0], [18, 262, 30, 0.9]];
    for (const [sx, sh_, dx, sc] of stems) {
      trunk(c, cx + sx * 0.5, by - 6, cx + dx, by - sh_, 9 * sc, 6 * sc, '#5f4c31');
      canopyClump(c, cx + dx, by - sh_ - 30 * sc, 54 * sc, ['#4a6f2e', '#3a5a24', '#2b451b'], 20, 0.7);
      canopyClump(c, cx + dx - 6 * sc, by - sh_ - 52 * sc, 38 * sc, ['#5c8438', '#4a7030', '#385a24'], 16, 0.66);
    }
  });
  // sapling ~1x character
  addSprite('tree_sapling', 120, 150, 60, 142, (c, w, h) => {
    const cx = w * 0.5, by = h - 8;
    contact(c, cx, by, 34, 10, 0.28);
    trunk(c, cx, by - 4, cx + 2, by - 54, 7, 4.5, '#6a563a');
    canopyClump(c, cx + 2, by - 92, 40, ['#4e7430', '#3d5d26', '#2d481c'], 22, 0.74);
    canopyClump(c, cx - 2, by - 118, 28, ['#5f8c38', '#4d7530', '#3b5f24'], 16, 0.7);
  });
  // ---- blossom tree (Amatsu) : soft pink canopy over dark trunk
  addSprite('tree_blossom', 330, 350, 165, 338, (c, w, h) => {
    const cx = w * 0.5, by = h - 12;
    contact(c, cx, by, 94, 24, 0.30);
    trunk(c, cx, by - 6, cx - 6, by - 138, 20, 12, '#5b4432');
    c.strokeStyle = '#4c3826'; c.lineCap = 'round';
    for (const b of [[-16, 8, -64, -40, -96, -36, 12], [14, 6, 62, -44, 92, -34, 11], [0, 0, 4, -46, 0, -80, 11]]) {
      c.lineWidth = b[6];
      c.beginPath(); c.moveTo(cx + b[0], by - 138 + b[1]); c.quadraticCurveTo(cx + b[2], by - 138 + b[3], cx + b[4], by - 138 + b[5]); c.stroke();
    }
    const bx = cx - 6, byy = by - 138;
    canopyClump(c, bx, byy - 52, 112, ['#a8788c', '#8f6377', '#77505f'], 30, 0.68);
    canopyClump(c, bx - 4, byy - 96, 100, ['#c493a4', '#ad7a8d', '#956376'], 32, 0.68);
    canopyClump(c, bx + 8, byy - 130, 70, ['#e2b4c2', '#cb9aa9', '#b2838f'], 24, 0.64);
    // petal drift
    for (let i = 0; i < 60; i++) {
      c.fillStyle = pick(['rgba(240,200,214,0.75)', 'rgba(226,178,196,0.7)', 'rgba(255,226,236,0.6)']);
      ell(c, bx + rr(-140, 140), byy + rr(-190, 40), rr(2, 4.5), rr(1.4, 3), rand() * 3); c.fill();
    }
  });
  addSprite('tree_blossom_small', 190, 210, 95, 202, (c, w, h) => {
    const cx = w * 0.5, by = h - 8;
    contact(c, cx, by, 52, 14, 0.28);
    trunk(c, cx, by - 4, cx + 3, by - 76, 12, 7, '#5b4432');
    canopyClump(c, cx + 3, by - 104, 62, ['#a8788c', '#8f6377', '#77505f'], 22, 0.7);
    canopyClump(c, cx, by - 134, 54, ['#ddaabc', '#c58fa2', '#ab7688'], 22, 0.66);
    for (let i = 0; i < 30; i++) {
      c.fillStyle = pick(['rgba(240,200,214,0.7)', 'rgba(255,226,236,0.55)']);
      ell(c, cx + rr(-80, 80), by - rr(60, 180), rr(2, 4), rr(1.4, 2.6), rand() * 3); c.fill();
    }
  });

  // ---- Niflheim dead trees + graves
  addSprite('dead_tree_1', 260, 320, 130, 308, (c, w, h) => {
    const cx = w * 0.5, by = h - 10;
    contact(c, cx, by, 66, 18, 0.32);
    trunk(c, cx, by - 4, cx + 6, by - 150, 15, 7, '#3d3630');
    c.strokeStyle = '#38312b'; c.lineCap = 'round';
    const limbs = [
      [-6, -20, -58, -60, -84, -104, 9], [6, -34, 54, -74, 74, -120, 8],
      [2, -60, -30, -96, -44, -140, 7], [-2, -80, 24, -112, 34, -156, 6],
      [0, -100, -18, -128, -30, -168, 5]
    ];
    for (const [x0, y0, x1, y1, x2, y2, lw] of limbs) {
      c.lineWidth = lw;
      c.beginPath();
      c.moveTo(cx + 6 + x0, by - 150 + y0);
      c.quadraticCurveTo(cx + 6 + x1, by - 150 + y1, cx + 6 + x2, by - 150 + y2);
      c.stroke();
      // twiglets
      for (let k = 0; k < 3; k++) {
        c.lineWidth = lw * 0.4;
        const t = rr(0.5, 1);
        const tx = cx + 6 + x0 + (x2 - x0) * t, ty = by - 150 + y0 + (y2 - y0) * t;
        c.beginPath(); c.moveTo(tx, ty);
        c.lineTo(tx + rr(-24, 24), ty + rr(-26, -4));
        c.stroke();
      }
    }
    c.strokeStyle = 'rgba(206,196,178,0.22)'; c.lineWidth = 2;
    c.beginPath(); c.moveTo(cx - 4, by - 30); c.lineTo(cx + 2, by - 146); c.stroke();
  });
  addSprite('dead_tree_2', 220, 250, 110, 240, (c, w, h) => {
    const cx = w * 0.5, by = h - 8;
    contact(c, cx, by, 54, 14, 0.32);
    trunk(c, cx, by - 4, cx - 10, by - 110, 13, 6, '#3a332e');
    c.strokeStyle = '#352f2a'; c.lineCap = 'round';
    for (const [x0, y0, x1, y1, x2, y2, lw] of [
      [-8, -14, -48, -44, -70, -78, 8], [4, -26, 44, -56, 66, -92, 7], [0, -50, -22, -78, -34, -112, 5]
    ]) {
      c.lineWidth = lw;
      c.beginPath();
      c.moveTo(cx - 10 + x0, by - 110 + y0);
      c.quadraticCurveTo(cx - 10 + x1, by - 110 + y1, cx - 10 + x2, by - 110 + y2);
      c.stroke();
    }
  });
  addSprite('tombstone', 96, 108, 48, 100, (c, w, h) => {
    const cx = w * 0.5, by = h - 8;
    contact(c, cx, by, 30, 9, 0.30);
    // slab
    c.fillStyle = '#57524a';
    c.beginPath();
    c.moveTo(cx - 22, by - 4);
    c.lineTo(cx - 22, by - 52);
    c.quadraticCurveTo(cx, by - 82, cx + 22, by - 52);
    c.lineTo(cx + 22, by - 4);
    c.closePath(); c.fill();
    c.strokeStyle = 'rgba(26,24,20,0.85)'; c.lineWidth = 2.2; c.stroke();
    c.fillStyle = 'rgba(226,220,200,0.20)';
    c.beginPath(); c.moveTo(cx - 18, by - 50); c.quadraticCurveTo(cx, by - 76, cx + 4, by - 72);
    c.lineTo(cx + 4, by - 10); c.lineTo(cx - 18, by - 10); c.closePath(); c.fill();
    c.fillStyle = 'rgba(30,28,24,0.55)';
    c.fillRect(cx - 10, by - 44, 20, 3); c.fillRect(cx - 6, by - 36, 12, 3);
    // base
    c.fillStyle = '#4a463f'; c.fillRect(cx - 28, by - 8, 56, 8);
    c.fillStyle = 'rgba(20,18,14,0.4)'; c.fillRect(cx - 28, by - 1, 56, 3);
  });
  addSprite('bone_pile', 130, 78, 65, 70, (c, w, h) => {
    const cx = w * 0.5, by = h - 8;
    contact(c, cx, by, 40, 11, 0.26);
    const bone = (x, y, len, th, rot) => {
      c.save(); c.translate(x, y); c.rotate(rot);
      c.fillStyle = '#cfc4a4';
      c.beginPath();
      c.moveTo(-len / 2, -th / 2); c.lineTo(len / 2, -th / 2);
      c.lineTo(len / 2, th / 2); c.lineTo(-len / 2, th / 2); c.closePath(); c.fill();
      for (const s of [-1, 1]) { ell(c, s * len / 2, 0, th * 0.62, th * 0.62); c.fill(); }
      c.fillStyle = 'rgba(120,110,86,0.35)';
      c.fillRect(-len / 2, th * 0.1, len, th * 0.4);
      c.strokeStyle = 'rgba(90,82,62,0.6)'; c.lineWidth = 1.2;
      c.beginPath(); c.moveTo(-len / 2, -th / 2); c.lineTo(len / 2, -th / 2); c.stroke();
      c.restore();
    };
    bone(cx - 18, by - 12, 44, 9, -0.28);
    bone(cx + 16, by - 16, 38, 8, 0.22);
    bone(cx - 2, by - 24, 40, 9, 0.05);
    // skull
    c.fillStyle = '#d6cbaa';
    ell(c, cx + 22, by - 30, 11, 9.5, -0.1); c.fill();
    c.fillStyle = '#3b3830';
    ell(c, cx + 18, by - 32, 2.6, 2.8); c.fill();
    ell(c, cx + 26, by - 32, 2.6, 2.8); c.fill();
    c.fillStyle = '#cfc4a4'; c.fillRect(cx + 18, by - 24, 9, 5);
    c.fillStyle = 'rgba(90,82,62,0.5)';
    for (let i = 0; i < 3; i++) c.fillRect(cx + 18 + i * 3, by - 24, 1.2, 5);
  });
  addSprite('bone_ribs', 150, 96, 75, 88, (c, w, h) => {
    const cx = w * 0.5, by = h - 8;
    contact(c, cx, by, 46, 12, 0.26);
    c.strokeStyle = '#cfc4a4'; c.lineCap = 'round';
    for (let i = 0; i < 7; i++) {
      c.lineWidth = 5 - i * 0.3;
      c.beginPath();
      c.moveTo(cx - 30 + i * 10, by - 60 + i * 4);
      c.quadraticCurveTo(cx - 34 + i * 10, by - 34 + i * 5, cx - 26 + i * 10, by - 16 + i * 4);
      c.stroke();
    }
    c.lineWidth = 7;
    c.beginPath(); c.moveTo(cx - 34, by - 66); c.lineTo(cx + 42, by - 22); c.stroke();
  });

  return { canvas, manifest, SUPERSAMPLE: SS };
}
