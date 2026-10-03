/* Morocc desert kit - the owner's attachment, verbatim.
 *
 * Source: the "morocc map" single-file demo the owner attached (Updates/morocc map on main).
 * Its generator paints the desert tiles and 2.5D billboards into canvases at load time; the
 * game then crops from those canvases exactly as it crops from assets/kit/ro-spritesheet.png.
 *
 * NOTHING in this file was drawn, traced, recoloured or edited by this repo - the two
 * functions below are copied unchanged from the attachment so the desert art is the
 * attachment's own art, not a substitute for it.
 *
 *   window.MOROCC_KIT.atlas() -> { canvas, manifest }   (1280x620 atlas + per-tile canvases)
 *   window.MOROCC_KIT.map()   -> { meta, cells, sprites } (the 48x32 desert ruins design)
 */
(function (global) {
  'use strict';

function createMoroccSpriteAtlas() {
    const W = 1280, H = 620;
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');

    const manifest = {
      tiles: {},
      sprites: {},
      character: { x: 1000, y: 490, frameW: 64, frameH: 80, frames: 4 }
    };

    // Deterministic PRNG for consistent procedural textures
    let seed = 1337;
    const rand = () => {
      seed = (seed * 16807) % 2147483647;
      return (seed - 1) / 2147483646;
    };

    // Helper: generate 128x128 seamless desert & ruin tiles
    function makeTile(tx, ty, name, painterFn) {
      const tc = document.createElement('canvas');
      tc.width = 128;
      tc.height = 128;
      painterFn(tc.getContext('2d'), 128, 128);
      ctx.drawImage(tc, tx, ty);
      manifest.tiles[name] = { x: tx, y: ty, w: 128, h: 128, canvas: tc };
    }

    // Tile 1: Main Morocc Golden-Tan Desert Sand (with subtle RO grid border)
    makeTile(16, 16, 'sand', (c, w, h) => {
      c.fillStyle = '#92754b';
      c.fillRect(0, 0, w, h);
      for (let i = 0; i < 950; i++) {
        const x = rand() * w, y = rand() * h;
        const r = 2 + rand() * 8;
        c.fillStyle = rand() > 0.5 ? 'rgba(168, 138, 92, 0.16)' : 'rgba(112, 86, 52, 0.16)';
        c.beginPath();
        c.ellipse(x, y, r * 1.6, r * 0.7, 0.2, 0, Math.PI * 2);
        c.fill();
      }
      // Subtle wind ripple lines
      c.strokeStyle = 'rgba(182, 150, 102, 0.15)';
      c.lineWidth = 1.5;
      for (let y = 8; y < h; y += 16) {
        c.beginPath();
        c.moveTo(0, y);
        c.bezierCurveTo(42, y - 4, 84, y + 4, w, y);
        c.stroke();
      }
    });

    // Tile 2: Disturbed Dark Desert Earth (halo around cobblestone ruins & palm shadows)
    makeTile(160, 16, 'sand_dark', (c, w, h) => {
      c.fillStyle = '#6c5434';
      c.fillRect(0, 0, w, h);
      for (let i = 0; i < 800; i++) {
        const x = rand() * w, y = rand() * h;
        const r = 2 + rand() * 7;
        c.fillStyle = rand() > 0.45 ? 'rgba(84, 64, 38, 0.24)' : 'rgba(130, 102, 64, 0.18)';
        c.beginPath();
        c.arc(x, y, r, 0, Math.PI * 2);
        c.fill();
      }
    });

    // Tile 3: Ancient Stone Cobblestone Ruin Floor (grey-brown masonry blocks)
    makeTile(304, 16, 'ruin_cobble', (c, w, h) => {
      c.fillStyle = '#5c5244';
      c.fillRect(0, 0, w, h);
      const rows = 8, cols = 6;
      const bh = h / rows, bw = w / cols;
      for (let r = 0; r < rows; r++) {
        const offset = (r % 2) * (bw * 0.5);
        for (let col = -1; col <= cols; col++) {
          const bx = col * bw + offset + 1.5;
          const by = r * bh + 1.5;
          const shade = 104 + Math.floor((rand() - 0.5) * 26);
          c.fillStyle = `rgb(${shade + 6}, ${shade}, ${shade - 8})`;
          c.fillRect(bx, by, bw - 3, bh - 3);
          c.strokeStyle = 'rgba(210, 198, 178, 0.25)';
          c.strokeRect(bx + 0.5, by + 0.5, bw - 4, bh - 4);
        }
      }
    });

    // Tile 4: Dark Stratified Desert Cliff Rock (matching left/right crags & northern ridge)
    makeTile(448, 16, 'cliff', (c, w, h) => {
      c.fillStyle = '#473a2b';
      c.fillRect(0, 0, w, h);
      for (let i = 0; i < 420; i++) {
        const x = rand() * w, y = rand() * h;
        c.fillStyle = rand() > 0.5 ? 'rgba(118, 102, 82, 0.24)' : 'rgba(32, 24, 16, 0.32)';
        c.beginPath();
        c.moveTo(x, y);
        c.lineTo(x + 14, y - 8);
        c.lineTo(x + 8, y + 16);
        c.closePath();
        c.fill();
      }
      // Diagonal rock strata crevices
      c.strokeStyle = 'rgba(22, 16, 10, 0.55)';
      c.lineWidth = 2;
      for (let k = -w; k < w * 2; k += 22) {
        c.beginPath();
        c.moveTo(k, 0);
        c.lineTo(k - 36, h);
        c.stroke();
      }
    });

    // Helper: paint a drooping feathery desert palm frond from (x0, y0) at angle & length
    function drawPalmFrond(c, x0, y0, angle, length, curveDown, tintShift = 0) {
      const steps = 26;
      const pts = [];
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const px = x0 + Math.cos(angle) * length * t;
        const py = y0 + Math.sin(angle) * length * t + (t * t) * curveDown;
        pts.push({ x: px, y: py, t });
      }
      // Central rachis stem
      c.save();
      c.strokeStyle = '#7c6e2e';
      c.lineWidth = 2.4;
      c.beginPath();
      c.moveTo(pts[0].x, pts[0].y);
      for (const p of pts) c.lineTo(p.x, p.y);
      c.stroke();

      // Individual pointed leaflets along both sides of the frond
      for (let i = 2; i < steps; i++) {
        const p = pts[i];
        const env = Math.sin(p.t * Math.PI);
        const leafLen = (10 + env * 18);
        for (const side of [-1, 1]) {
          const lAngle = angle + side * 0.85 + p.t * 0.35 * side;
          const lx = p.x + Math.cos(lAngle) * leafLen;
          const ly = p.y + Math.sin(lAngle) * leafLen + 5;
          const g = Math.min(255, Math.max(40, Math.floor(118 + env * 34 + side * 14 + tintShift)));
          const r = Math.floor(g * 0.78);
          const b = Math.floor(g * 0.28);
          c.fillStyle = `rgba(${r}, ${g}, ${b}, 0.94)`;
          c.beginPath();
          c.moveTo(p.x, p.y);
          c.lineTo((p.x + lx) * 0.5 - 2, (p.y + ly) * 0.5 - 2);
          c.lineTo(lx, ly);
          c.lineTo((p.x + lx) * 0.5 + 2, (p.y + ly) * 0.5 + 2);
          c.closePath();
          c.fill();
        }
      }
      c.restore();
    }

    // Helper: paint diamond-scaled palm trunk along a quadratic curve
    function drawScalyPalmTrunk(c, x0, y0, cx, cy, x1, y1, baseW, topW, detailedScales = true) {
      const steps = detailedScales ? 28 : 18;
      for (let i = 0; i < steps; i++) {
        const t = i / steps;
        const inv = 1 - t;
        const px = inv * inv * x0 + 2 * inv * t * cx + t * t * x1;
        const py = inv * inv * y0 + 2 * inv * t * cy + t * t * y1;
        const rw = baseW * (1 - t) + topW * t;
        const rh = (Math.hypot(x1 - x0, y1 - y0) / steps) * 0.82;

        // Base ring segment
        c.fillStyle = '#5c4628';
        c.beginPath();
        c.ellipse(px, py, rw, rh, 0.15, 0, Math.PI * 2);
        c.fill();

        if (detailedScales) {
          // Diamond overlapping palm bark scales (matching foreground palm in image-1.png)
          const cols = 4;
          for (let col = -cols; col <= cols; col++) {
            const frac = (col + (i % 2) * 0.5) / (cols + 0.8);
            if (Math.abs(frac) > 0.92) continue;
            const sx = px + frac * rw * 0.92;
            const sy = py + (1 - Math.abs(frac)) * 2;
            const sw = (rw / cols) * 0.88;
            const sh = rh * 0.92;

            c.fillStyle = frac < 0.15 ? '#cbb07c' : '#9c8050';
            c.strokeStyle = '#3d2d18';
            c.lineWidth = 1.1;
            c.beginPath();
            c.moveTo(sx, sy - sh);
            c.lineTo(sx + sw, sy);
            c.lineTo(sx, sy + sh);
            c.lineTo(sx - sw, sy);
            c.closePath();
            c.fill();
            c.stroke();
          }
        } else {
          c.fillStyle = '#a88c5c';
          c.beginPath();
          c.ellipse(px - rw * 0.15, py, rw * 0.78, rh * 0.72, 0.15, 0, Math.PI * 2);
          c.fill();
        }
      }
    }

    // Sprite 1: Giant Foreground Curved Palm Tree (`palm_giant` — right foreground of image-1.png)
    {
      const sx = 16, sy = 156, sw = 380, sh = 450;
      const sc = document.createElement('canvas');
      sc.width = sw; sc.height = sh;
      const c = sc.getContext('2d');

      // Ground shadow
      c.fillStyle = 'rgba(28, 20, 10, 0.35)';
      c.beginPath();
      c.ellipse(125, sh - 22, 46, 16, 0, 0, Math.PI * 2);
      c.fill();

      // Curved diamond-scaled trunk leaning from (125, 428) up-right to (215, 118)
      drawScalyPalmTrunk(c, 125, sh - 22, 185, 275, 212, 118, 28, 12, true);

      // Dark underside fronds
      const crownX = 212, crownY = 115;
      const backAngles = [-2.85, -2.4, -1.9, -1.2, -0.6, -0.15, 0.35, 0.85, 2.45];
      for (const ang of backAngles) {
        drawPalmFrond(c, crownX, crownY, ang, 138, 42, -26);
      }
      // Bright sunlit top & drooping foreground fronds
      const frontAngles = [-2.65, -2.15, -1.65, -1.05, -0.45, 0.1, 0.55, 1.05, 1.55, 2.05, 2.65];
      for (const ang of frontAngles) {
        drawPalmFrond(c, crownX, crownY, ang, 152, 48, 8);
      }

      ctx.drawImage(sc, sx, sy);
      manifest.sprites.palm_giant = { x: sx, y: sy, w: sw, h: sh, anchorX: 125, anchorY: sh - 22 };
    }

    // Sprite 2: Tall Slender Desert Palm (`palm_tall`)
    {
      const sx = 406, sy = 156, sw = 210, sh = 300;
      const sc = document.createElement('canvas');
      sc.width = sw; sc.height = sh;
      const c = sc.getContext('2d');
      c.fillStyle = 'rgba(28, 20, 10, 0.32)';
      c.beginPath();
      c.ellipse(105, sh - 16, 36, 12, 0, 0, Math.PI * 2);
      c.fill();
      drawScalyPalmTrunk(c, 105, sh - 16, 96, 175, 108, 78, 11, 5, false);
      for (let a = 0; a < Math.PI * 2; a += 0.52) {
        drawPalmFrond(c, 108, 78, a, 84, 28, -6);
      }
      ctx.drawImage(sc, sx, sy);
      manifest.sprites.palm_tall = { x: sx, y: sy, w: sw, h: sh, anchorX: 105, anchorY: sh - 16 };
    }

    // Sprite 3: Twin-Trunk Oasis Palm (`palm_double`)
    {
      const sx = 624, sy = 156, sw = 230, sh = 300;
      const sc = document.createElement('canvas');
      sc.width = sw; sc.height = sh;
      const c = sc.getContext('2d');
      c.fillStyle = 'rgba(28, 20, 10, 0.35)';
      c.beginPath();
      c.ellipse(115, sh - 16, 44, 14, 0, 0, Math.PI * 2);
      c.fill();
      drawScalyPalmTrunk(c, 102, sh - 16, 86, 175, 78, 86, 10, 5, false);
      drawScalyPalmTrunk(c, 126, sh - 16, 142, 175, 152, 76, 11, 5, false);
      for (let a = 0; a < Math.PI * 2; a += 0.58) {
        drawPalmFrond(c, 78, 86, a, 74, 24, -10);
        drawPalmFrond(c, 152, 76, a + 0.25, 78, 26, 4);
      }
      ctx.drawImage(sc, sx, sy);
      manifest.sprites.palm_double = { x: sx, y: sy, w: sw, h: sh, anchorX: 115, anchorY: sh - 16 };
    }

    // Sprite 4: Flowering Desert Cactus (`cactus_flower` — lower-center of image-1.png)
    {
      const sx = 864, sy = 156, sw = 110, sh = 160;
      const sc = document.createElement('canvas');
      sc.width = sw; sc.height = sh;
      const c = sc.getContext('2d');
      const cx = 55, by = sh - 12;

      c.fillStyle = 'rgba(28, 20, 10, 0.32)';
      c.beginPath();
      c.ellipse(cx, by, 22, 8, 0, 0, Math.PI * 2);
      c.fill();

      // Main ribbed columnar cactus stem
      c.fillStyle = '#5e8229';
      c.strokeStyle = '#2d4211';
      c.lineWidth = 1.5;
      c.beginPath();
      c.roundRect(cx - 13, by - 118, 26, 118, 13);
      c.fill();
      c.stroke();

      // Vertical cactus ribs
      for (let rx = -9; rx <= 9; rx += 4.5) {
        c.strokeStyle = rx < 0 ? '#8eb34c' : '#3d5918';
        c.lineWidth = 1.4;
        c.beginPath();
        c.moveTo(cx + rx, by - 114);
        c.lineTo(cx + rx * 0.85, by - 2);
        c.stroke();
      }

      // Side cactus arm bud (right side)
      c.fillStyle = '#688f30';
      c.beginPath();
      c.ellipse(cx + 14, by - 66, 11, 14, 0.25, 0, Math.PI * 2);
      c.fill();
      c.stroke();

      // Blooming White & Gold Desert Flower on upper-left stem (exact detail from image-1.png!)
      const fx = cx - 8, fy = by - 92;
      for (let a = 0; a < Math.PI * 2; a += Math.PI / 6) {
        c.fillStyle = '#f7f5eb';
        c.beginPath();
        c.ellipse(fx + Math.cos(a) * 7, fy + Math.sin(a) * 7, 5, 2.5, a, 0, Math.PI * 2);
        c.fill();
      }
      c.fillStyle = '#d69e28';
      c.beginPath();
      c.arc(fx, fy, 4.2, 0, Math.PI * 2);
      c.fill();

      ctx.drawImage(sc, sx, sy);
      manifest.sprites.cactus_flower = { x: sx, y: sy, w: sw, h: sh, anchorX: cx, anchorY: by };
    }

    // Sprite 5: Small Desert Cactus (`cactus_small`)
    {
      const sx = 984, sy = 156, sw = 80, sh = 105;
      const sc = document.createElement('canvas');
      sc.width = sw; sc.height = sh;
      const c = sc.getContext('2d');
      const cx = 40, by = sh - 10;
      c.fillStyle = '#5c8028';
      c.strokeStyle = '#2d4211';
      c.lineWidth = 1.5;
      c.beginPath();
      c.roundRect(cx - 8, by - 68, 16, 68, 8);
      c.fill();
      c.stroke();
      c.beginPath();
      c.roundRect(cx + 6, by - 48, 14, 10, 5);
      c.fill();
      c.stroke();
      ctx.drawImage(sc, sx, sy);
      manifest.sprites.cactus_small = { x: sx, y: sy, w: sw, h: sh, anchorX: cx, anchorY: by };
    }

    // Sprite 6: Standing White-Stone Shrine Pillar (`ruin_pillar` — 2 pillars on left of image-1.png)
    {
      const sx = 1074, sy = 156, sw = 120, sh = 175;
      const sc = document.createElement('canvas');
      sc.width = sw; sc.height = sh;
      const c = sc.getContext('2d');
      const cx = 60, by = sh - 14;

      // Ground shadow
      c.fillStyle = 'rgba(28, 20, 10, 0.36)';
      c.beginPath();
      c.ellipse(cx + 4, by + 2, 34, 12, 0, 0, Math.PI * 2);
      c.fill();

      // Tapered Trapezoidal Limestone Pedestal Base (3D front + side faces)
      // Front sunlit face
      c.fillStyle = '#d8ccb8';
      c.strokeStyle = '#6e6250';
      c.lineWidth = 1.5;
      c.beginPath();
      c.moveTo(cx - 26, by + 4);
      c.lineTo(cx + 12, by - 2);
      c.lineTo(cx + 8, by - 64);
      c.lineTo(cx - 20, by - 58);
      c.closePath();
      c.fill();
      c.stroke();

      // Right shaded face
      c.fillStyle = '#a89a84';
      c.beginPath();
      c.moveTo(cx + 12, by - 2);
      c.lineTo(cx + 26, by - 12);
      c.lineTo(cx + 20, by - 72);
      c.lineTo(cx + 8, by - 64);
      c.closePath();
      c.fill();
      c.stroke();

      // Stone block mortar lines on pedestal
      c.strokeStyle = 'rgba(92, 78, 62, 0.55)';
      for (let yOff of [18, 36, 50]) {
        c.beginPath();
        c.moveTo(cx - 24, by - yOff);
        c.lineTo(cx + 10, by - yOff - 5);
        c.lineTo(cx + 22, by - yOff - 13);
        c.stroke();
      }

      // Middle Lantern / Shrine Chamber with dark recessed window
      c.fillStyle = '#dfd4c2';
      c.fillRect(cx - 18, by - 104, 26, 40);
      c.strokeRect(cx - 18, by - 104, 26, 40);
      c.fillStyle = '#4a3f32';
      c.fillRect(cx - 12, by - 94, 14, 20);

      c.fillStyle = '#b0a28c';
      c.beginPath();
      c.moveTo(cx + 8, by - 64);
      c.lineTo(cx + 20, by - 72);
      c.lineTo(cx + 20, by - 110);
      c.lineTo(cx + 8, by - 104);
      c.closePath();
      c.fill();
      c.stroke();

      // Stepped Cornice & Finial Cap
      c.fillStyle = '#e5dac8';
      c.beginPath();
      c.moveTo(cx - 24, by - 104);
      c.lineTo(cx + 12, by - 108);
      c.lineTo(cx + 24, by - 116);
      c.lineTo(cx - 12, by - 114);
      c.closePath();
      c.fill();
      c.stroke();

      c.fillStyle = '#d2c5b0';
      c.beginPath();
      c.moveTo(cx - 14, by - 112);
      c.lineTo(cx, by - 134);
      c.lineTo(cx + 14, by - 114);
      c.closePath();
      c.fill();
      c.stroke();

      ctx.drawImage(sc, sx, sy);
      manifest.sprites.ruin_pillar = { x: sx, y: sy, w: sw, h: sh, anchorX: cx, anchorY: by };
    }

    // Sprite 7: Fallen Broken Stone Column (`ruin_column_fallen` — left of image-1.png)
    {
      const sx = 864, sy = 335, sw = 190, sh = 85;
      const sc = document.createElement('canvas');
      sc.width = sw; sc.height = sh;
      const c = sc.getContext('2d');
      c.save();
      c.translate(95, 44);
      c.rotate(-0.34);
      c.fillStyle = 'rgba(28, 20, 10, 0.35)';
      c.fillRect(-74, -6, 148, 22);
      c.fillStyle = '#d6cab6';
      c.strokeStyle = '#6b5e4c';
      c.lineWidth = 1.5;
      c.fillRect(-72, -12, 144, 22);
      c.strokeRect(-72, -12, 144, 22);
      // Fluted grooves along fallen column
      for (let gy = -7; gy <= 6; gy += 4) {
        c.beginPath();
        c.moveTo(-70, gy);
        c.lineTo(70, gy);
        c.stroke();
      }
      c.restore();
      ctx.drawImage(sc, sx, sy);
      manifest.sprites.ruin_column_fallen = { x: sx, y: sy, w: sw, h: sh, anchorX: 95, anchorY: 48 };
    }

    // Sprite 8: Short Broken Fluted Column Stump (`ruin_stump` — bottom-left of image-1.png)
    {
      const sx = 1064, sy = 335, sw = 85, sh = 90;
      const sc = document.createElement('canvas');
      sc.width = sw; sc.height = sh;
      const c = sc.getContext('2d');
      const cx = 42, by = 74;
      c.fillStyle = '#d4c8b4';
      c.strokeStyle = '#695c4a';
      c.lineWidth = 1.5;
      c.fillRect(cx - 18, by - 46, 36, 46);
      c.strokeRect(cx - 18, by - 46, 36, 46);
      c.fillStyle = '#e4dac8';
      c.beginPath();
      c.ellipse(cx, by - 46, 18, 7, 0, 0, Math.PI * 2);
      c.fill();
      c.stroke();
      for (let gx = -12; gx <= 12; gx += 6) {
        c.beginPath();
        c.moveTo(cx + gx, by - 40);
        c.lineTo(cx + gx, by - 2);
        c.stroke();
      }
      ctx.drawImage(sc, sx, sy);
      manifest.sprites.ruin_stump = { x: sx, y: sy, w: sw, h: sh, anchorX: cx, anchorY: by };
    }

    // Sprite 9: Stone Ruin Border Curb Beam (`ruin_curb` — framing cobblestone patch)
    {
      const sx = 864, sy = 430, sw = 180, sh = 55;
      const sc = document.createElement('canvas');
      sc.width = sw; sc.height = sh;
      const c = sc.getContext('2d');
      c.save();
      c.translate(90, 28);
      c.rotate(-0.18);
      c.fillStyle = '#d8ccb8';
      c.strokeStyle = '#645846';
      c.lineWidth = 1.5;
      c.beginPath();
      c.moveTo(-76, 4);
      c.lineTo(68, 4);
      c.lineTo(80, -8);
      c.lineTo(-64, -8);
      c.closePath();
      c.fill();
      c.stroke();
      // Segment cracks
      for (let kx = -45; kx <= 45; kx += 30) {
        c.beginPath();
        c.moveTo(kx, -8);
        c.lineTo(kx - 6, 4);
        c.stroke();
      }
      c.restore();
      ctx.drawImage(sc, sx, sy);
      manifest.sprites.ruin_curb = { x: sx, y: sy, w: sw, h: sh, anchorX: 90, anchorY: 32 };
    }

    // Sprite 10: Desert Spine / Vertebrae Bone Fossil (`desert_bone` — bottom-right of image-1.png)
    {
      const sx = 1064, sy = 430, sw = 110, sh = 65;
      const sc = document.createElement('canvas');
      sc.width = sw; sc.height = sh;
      const c = sc.getContext('2d');
      for (let i = 0; i < 6; i++) {
        const t = i / 5;
        const bx = 24 + t * 62;
        const by = 44 - Math.sin(t * Math.PI) * 18;
        c.fillStyle = '#ded4b4';
        c.strokeStyle = '#6e6448';
        c.lineWidth = 1.3;
        c.beginPath();
        c.ellipse(bx, by, 7 - t * 2, 9 - t * 2.5, 0.4 + t * 0.5, 0, Math.PI * 2);
        c.fill();
        c.stroke();
      }
      ctx.drawImage(sc, sx, sy);
      manifest.sprites.desert_bone = { x: sx, y: sy, w: sw, h: sh, anchorX: 55, anchorY: 48 };
    }

    // Sprite 11: 4-Frame Ragnarok Online Adventurer Character
    {
      const chX = manifest.character.x, chY = manifest.character.y;
      const cw = 64, ch = 80;
      for (let f = 0; f < 4; f++) {
        const ox = chX + f * cw + 32;
        const oy = chY + ch - 10;
        const bob = (f === 1 || f === 3) ? -2 : 0;
        const swing = f === 1 ? -5 : (f === 3 ? 5 : 0);

        ctx.fillStyle = 'rgba(20, 14, 8, 0.42)';
        ctx.beginPath();
        ctx.ellipse(ox, oy, 14, 6, 0, 0, Math.PI * 2);
        ctx.fill();

        // Boots
        ctx.strokeStyle = '#4a331e';
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.moveTo(ox - 5, oy - 16); ctx.lineTo(ox - 5 + swing, oy - 2);
        ctx.moveTo(ox + 5, oy - 16); ctx.lineTo(ox + 5 - swing, oy - 2);
        ctx.stroke();

        // Desert Assassin / Adventurer Cloak & Tunic
        ctx.fillStyle = '#a8322d';
        ctx.beginPath();
        ctx.moveTo(ox - 13, oy - 14 + bob);
        ctx.lineTo(ox - 9, oy - 38 + bob);
        ctx.lineTo(ox + 9, oy - 38 + bob);
        ctx.lineTo(ox + 13, oy - 14 + bob);
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = '#e6dcc4';
        ctx.fillRect(ox - 8, oy - 38 + bob, 16, 22);
        ctx.fillStyle = '#b88e38';
        ctx.fillRect(ox - 8, oy - 24 + bob, 16, 4);

        // Head & Spiky Hair
        ctx.fillStyle = '#f5cfa8';
        ctx.beginPath();
        ctx.arc(ox, oy - 45 + bob, 8.5, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#d48838';
        ctx.beginPath();
        ctx.moveTo(ox - 10, oy - 45 + bob);
        ctx.lineTo(ox - 12, oy - 55 + bob);
        ctx.lineTo(ox - 4, oy - 52 + bob);
        ctx.lineTo(ox, oy - 60 + bob);
        ctx.lineTo(ox + 5, oy - 52 + bob);
        ctx.lineTo(ox + 12, oy - 55 + bob);
        ctx.lineTo(ox + 10, oy - 45 + bob);
        ctx.closePath();
        ctx.fill();
      }
    }

    return { canvas, manifest };
  }

function createMoroccMapData() {
    const GW = 48, GH = 32;
    const heights = Array.from({ length: GH + 1 }, () => new Float32Array(GW + 1));

    // Helper: check if cell is part of the rocky cliffs (northern ridge, left crags, right crag)
    function isCliff(gx, gy) {
      // Northern horizon rocky escarpment (gy 1..4)
      if (gy >= 1 && gy <= 4 && gx >= 3 && gx <= 46) return true;
      // Top-most rocky mesa peaks (gx 11..19, 23..30 at gy 0..1)
      if (gy === 0 && ((gx >= 11 && gx <= 19) || (gx >= 23 && gx <= 31))) return true;
      // Left upper rocky mound (gx 3..10, gy 6..9)
      if (gy >= 6 && gy <= 9 && gx >= 3 && gx <= 10 && Math.hypot(gx - 6.5, (gy - 7.8) * 1.4) < 3.6) return true;
      // Left main rocky crag behind ruins (gx 0..9, gy 10..19)
      if (gy >= 10 && gy <= 19 && gx <= 9.2 - Math.abs(gy - 14.5) * 0.85) return true;
      // Right rocky crag behind giant palm (gx 36..47, gy 9..19)
      if (gy >= 9 && gy <= 19 && gx >= 40.5 - (1 - Math.abs(gy - 14.5) / 5.5) * 5.2) return true;
      return false;
    }

    function isSky(gx, gy) {
      if (gy === 0 && !isCliff(gx, gy)) return true;
      if (gy <= 3 && gx <= 3 - gy) return true;
      return false;
    }

    function isCobbleRuin(gx, gy) {
      // Angled diamond/trapezoid patch of ancient stone cobblestones at (gx 12..20, gy 17..21)
      const dx = gx - 16.2;
      const dy = gy - 19.3;
      return Math.abs(dx * 0.42 + dy * 0.85) < 1.85 && Math.abs(dx * 0.85 - dy * 0.35) < 3.4;
    }

    function isDarkSand(gx, gy) {
      // Disturbed dark earth surrounding cobblestone ruins (gx 10..23, gy 16..23)
      if (Math.hypot((gx - 16.2) * 0.68, (gy - 19.5) * 1.05) < 4.4) return true;
      // Shaded scrub patches in mid-right desert
      if (Math.hypot((gx - 29.5) * 0.75, (gy - 14.2) * 1.2) < 2.2) return true;
      if (Math.hypot((gx - 27.5) * 0.75, (gy - 10.5) * 1.2) < 2.0) return true;
      return false;
    }

    // Compute 3D vertex heights (.gnd)
    for (let vy = 0; vy <= GH; vy++) {
      for (let vx = 0; vx <= GW; vx++) {
        let h = 1.2 + Math.sin(vx * 0.22) * Math.cos(vy * 0.25) * 0.32;

        // Northern cliff plateau rise
        if (vy <= 4) {
          h += (4.5 - vy) * 0.85;
          if (vy <= 1 && ((vx >= 11 && vx <= 19) || (vx >= 23 && vx <= 31))) {
            h += 1.6;
          }
        }
        // Left upper mound
        const dLeftUp = Math.hypot((vx - 6.5) / 3.8, (vy - 8.0) / 2.2);
        if (dLeftUp < 1.0) h += (1.0 - dLeftUp) * 2.4;

        // Left main rocky crag
        const dLeftCrag = Math.hypot((vx - 3.2) / 6.5, (vy - 14.5) / 4.8);
        if (dLeftCrag < 1.0) h += (1.0 - dLeftCrag) * 4.2;

        // Right rocky crag
        const dRightCrag = Math.hypot((vx - 44.0) / 7.2, (vy - 14.5) / 5.0);
        if (dRightCrag < 1.0) h += (1.0 - dRightCrag) * 4.4;

        // Gentle central dune ridge around mid-ground palms (vy 6..12)
        if (vy >= 5 && vy <= 12 && vx >= 12 && vx <= 34) {
          h += Math.sin(((vy - 5) / 7) * Math.PI) * 0.75;
        }

        heights[vy][vx] = +h.toFixed(2);
      }
    }

    const cells = [];
    for (let gy = 0; gy < GH; gy++) {
      const row = [];
      for (let gx = 0; gx < GW; gx++) {
        let type = 'sand';
        let walkable = true;
        if (isSky(gx, gy)) {
          type = 'sky';
          walkable = false;
        } else if (isCliff(gx, gy)) {
          type = 'cliff';
          walkable = false;
        } else if (isCobbleRuin(gx, gy)) {
          type = 'ruin_cobble';
          walkable = true;
        } else if (isDarkSand(gx, gy)) {
          type = 'sand_dark';
          walkable = true;
        }
        row.push({
          x: gx,
          y: gy,
          type,
          walkable,
          h: [heights[gy][gx], heights[gy][gx + 1], heights[gy + 1][gx + 1], heights[gy + 1][gx]]
        });
      }
      cells.push(row);
    }

    // Place all 34 sprites matching the Morocc Desert reference image
    const sprites = [
      // 1. Giant Foreground Curved Palm Tree (Right foreground)
      { id: 'm1', type: 'palm_giant', x: 33.4, y: 28.4, scale: 1.24, flip: false },

      // 2. Flowering Desert Cactus in lower-center foreground + smaller cacti
      { id: 'm2', type: 'cactus_flower', x: 23.2, y: 25.0, scale: 1.05, flip: false },
      { id: 'm3', type: 'cactus_small',  x: 35.4, y: 24.4, scale: 0.95, flip: false },
      { id: 'm4', type: 'cactus_small',  x: 29.2, y: 9.2,  scale: 0.72, flip: true },
      { id: 'm5', type: 'cactus_small',  x: 13.6, y: 7.4,  scale: 0.68, flip: false },

      // 3. Ancient White-Stone Desert Ruins (Lower-left quadrant)
      { id: 'm6',  type: 'ruin_pillar',        x: 8.8,  y: 17.6, scale: 0.96, flip: false },
      { id: 'm7',  type: 'ruin_pillar',        x: 7.8,  y: 24.6, scale: 1.08, flip: false },
      { id: 'm8',  type: 'ruin_column_fallen', x: 3.8,  y: 21.4, scale: 1.02, flip: false },
      { id: 'm9',  type: 'ruin_stump',         x: 1.4,  y: 25.2, scale: 0.95, flip: false },
      { id: 'm10', type: 'ruin_curb',          x: 14.8, y: 16.9, scale: 1.05, flip: false },
      { id: 'm11', type: 'ruin_curb',          x: 14.0, y: 21.6, scale: 0.92, flip: false },

      // 4. Half-Buried Desert Bone Fossil (Bottom-right beside giant palm)
      { id: 'm12', type: 'desert_bone', x: 37.6, y: 29.1, scale: 1.00, flip: false },

      // 5. Left Foreground & Left Cliff Palm Trees
      { id: 'm13', type: 'palm_giant',  x: 3.6,  y: 19.2, scale: 0.88, flip: true },
      { id: 'm14', type: 'palm_double', x: 6.5,  y: 10.4, scale: 0.84, flip: false },
      { id: 'm15', type: 'palm_tall',   x: 8.4,  y: 10.0, scale: 0.78, flip: true },
      { id: 'm16', type: 'palm_tall',   x: 2.2,  y: 8.2,  scale: 0.75, flip: false },
      { id: 'm17', type: 'palm_double', x: 6.2,  y: 3.6,  scale: 0.76, flip: false },
      { id: 'm18', type: 'palm_tall',   x: 8.8,  y: 3.4,  scale: 0.70, flip: true },

      // 6. Mid-Ground Oasis Palm Trees across central desert
      { id: 'm19', type: 'palm_tall',   x: 11.8, y: 9.2,  scale: 0.68, flip: false },
      { id: 'm20', type: 'palm_tall',   x: 15.6, y: 9.8,  scale: 0.72, flip: true },
      { id: 'm21', type: 'palm_double', x: 18.4, y: 9.4,  scale: 0.90, flip: false },
      { id: 'm22', type: 'palm_tall',   x: 20.6, y: 10.6, scale: 0.96, flip: false },
      { id: 'm23', type: 'palm_tall',   x: 24.4, y: 11.4, scale: 0.82, flip: true },
      { id: 'm24', type: 'palm_tall',   x: 25.8, y: 11.8, scale: 0.76, flip: false },
      { id: 'm25', type: 'palm_tall',   x: 30.8, y: 12.4, scale: 0.95, flip: false },
      { id: 'm26', type: 'palm_double', x: 34.2, y: 13.2, scale: 0.98, flip: true },
      { id: 'm27', type: 'palm_tall',   x: 46.2, y: 7.4,  scale: 0.85, flip: false },

      // 7. Distant Horizon Ridge Palms
      { id: 'm28', type: 'palm_tall',   x: 11.2, y: 3.8,  scale: 0.58, flip: false },
      { id: 'm29', type: 'palm_tall',   x: 13.4, y: 4.2,  scale: 0.56, flip: true },
      { id: 'm30', type: 'palm_tall',   x: 17.5, y: 3.5,  scale: 0.60, flip: false },
      { id: 'm31', type: 'palm_tall',   x: 29.0, y: 3.6,  scale: 0.58, flip: true },
      { id: 'm32', type: 'palm_tall',   x: 31.2, y: 3.8,  scale: 0.55, flip: false },
      { id: 'm33', type: 'palm_tall',   x: 35.5, y: 3.2,  scale: 0.62, flip: false },
      { id: 'm34', type: 'palm_tall',   x: 41.5, y: 3.0,  scale: 0.60, flip: true }
    ];

    return {
      meta: {
        name: 'moc_fild_desert_ruins',
        gridWidth: GW,
        gridHeight: GH,
        format: 'RO-2.5D-GND-GAT'
      },
      cameraDefault: { yaw: 0.0, pitch: 0.68, zoom: 1.0, panX: 0, panY: -6 },
      cells,
      sprites
    };
  }

  global.MOROCC_KIT = { atlas: createMoroccSpriteAtlas, map: createMoroccMapData };
})(typeof window !== 'undefined' ? window : this);
