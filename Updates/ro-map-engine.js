/**
 * RagnarokMapRenderer — 2.5D Isometric/Perspective Terrain & Sprite Map Engine
 * Inspired by Ragnarok Online (.gnd heightmap mesh + .gat walkable grid + depth-sorted 2D billboard sprites)
 *
 * Usage in any HTML5 game:
 *   const mapEngine = new RagnarokMapRenderer(canvasElement, {
 *     mapData: roMapDataJson,
 *     spriteSheetImage: imgElement,
 *     spriteManifest: roSpritesheetJson
 *   });
 *   mapEngine.start();
 */
(function (global) {
  'use strict';

  class RagnarokMapRenderer {
    constructor(canvas, options = {}) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');

      this.mapData = options.mapData || null;
      this.atlasImg = options.spriteSheetImage || null;
      this.manifest = options.spriteManifest || null;
      this.referenceImg = options.referenceImage || null;

      // Camera state (classic Ragnarok Online 2.5D perspective)
      this.camera = {
        yaw: 0.0,          // Horizontal orbit angle in radians
        pitch: 0.72,       // Vertical tilt angle in radians (~41 deg)
        zoom: 1.0,         // Zoom multiplier
        panX: 0.0,         // Screen-space pan offset X
        panY: -8.0         // Screen-space pan offset Y
      };

      // Rendering options
      this.options = {
        renderMode: options.renderMode || 'modular_25d', // 'modular_25d' | 'hybrid_ref' | 'split_compare'
        splitRatio: 0.5,
        showWalkGrid: options.showWalkGrid !== undefined ? options.showWalkGrid : false,
        showHoverCursor: true,
        canopyTransparency: true,
        windSway: true,
        waterSpeed: 1.0,
        sunlightAzimuth: -2.35,
        brushSize: 1
      };

      // Interactive state
      this.hoveredCell = null;
      this.selectedSprite = null;
      this.activePath = [];

      // Playable RO Adventurer character state
      this.character = {
        x: 25.5,
        y: 11.5,
        z: 1.8,
        dir: 0,       // 0: South, 1: West, 2: North, 3: East
        frame: 0,
        animTimer: 0,
        speed: 4.8,   // cells per second
        path: [],
        targetCell: null,
        targetRipple: 0
      };

      // Offscreen caches for tile patterns and static terrain mesh
      this.tileCanvases = {};
      this.terrainCacheCanvas = document.createElement('canvas');
      this.terrainCacheCtx = this.terrainCacheCanvas.getContext('2d');
      this.terrainCacheDirty = true;
      this._lastCamHash = '';

      this.time = 0;
      this.fps = 60;
      this._frameCount = 0;
      this._lastFpsTime = performance.now();
      this._rafId = null;

      if (this.atlasImg && this.manifest) {
        this._extractTileCanvases();
      }
      if (this.mapData) {
        this.syncCharacterHeight();
      }
    }

    setAssets(atlasImg, manifest, referenceImg) {
      this.atlasImg = atlasImg;
      this.manifest = manifest;
      if (referenceImg) this.referenceImg = referenceImg;
      this._extractTileCanvases();
      this.invalidateTerrain();
    }

    loadMapData(mapData) {
      this.mapData = JSON.parse(JSON.stringify(mapData));
      if (this.mapData.cameraDefault) {
        Object.assign(this.camera, this.mapData.cameraDefault);
      }
      this.syncCharacterHeight();
      this.invalidateTerrain();
    }

    exportMapJSON() {
      return JSON.stringify(this.mapData, null, 2);
    }

    invalidateTerrain() {
      this.terrainCacheDirty = true;
    }

    _extractTileCanvases() {
      if (!this.atlasImg || !this.manifest || !this.manifest.tiles) return;
      this.tileCanvases = {};
      for (const [name, rect] of Object.entries(this.manifest.tiles)) {
        const c = document.createElement('canvas');
        c.width = rect.w;
        c.height = rect.h;
        const cx = c.getContext('2d');
        cx.drawImage(this.atlasImg, rect.x, rect.y, rect.w, rect.h, 0, 0, rect.w, rect.h);
        this.tileCanvases[name] = c;
      }
    }

    // Project 3D grid coordinate (gx, gy, gz) into 2D canvas screen space + depth
    project3D(gx, gy, gz = 0) {
      const gw = this.mapData ? this.mapData.meta.gridWidth : 48;
      const gh = this.mapData ? this.mapData.meta.gridHeight : 32;
      const W = this.canvas.width;
      const H = this.canvas.height;

      const baseScale = Math.min(W / (gw * 0.94), H / (gh * 0.76));
      const scale = baseScale * this.camera.zoom;

      const dx = gx - gw * 0.5;
      const dy = gy - gh * 0.5;

      const cosY = Math.cos(this.camera.yaw);
      const sinY = Math.sin(this.camera.yaw);

      const rx = dx * cosY - dy * sinY;
      const ry = dx * sinY + dy * cosY;

      // Subtle RO perspective foreshortening along camera depth axis
      const fov = 1.0 / Math.max(0.45, 1.0 - ry * 0.0068);
      const sinP = Math.sin(this.camera.pitch);
      const cosP = Math.cos(this.camera.pitch);

      const sx = W * 0.5 + this.camera.panX + rx * scale * fov;
      const sy = H * 0.52 + this.camera.panY + (ry * sinP * scale * 0.92 - gz * scale * 0.34 * cosP) * fov;
      const depth = ry * cosP + gz * 0.12;

      return { x: sx, y: sy, depth, scale: scale * fov };
    }

    // Get interpolated terrain height at any continuous (gx, gy) coordinate
    getHeightAt(gx, gy) {
      if (!this.mapData) return 0;
      const gw = this.mapData.meta.gridWidth;
      const gh = this.mapData.meta.gridHeight;
      const cx = Math.max(0, Math.min(gw - 1, Math.floor(gx)));
      const cy = Math.max(0, Math.min(gh - 1, Math.floor(gy)));
      const cell = this.mapData.cells[cy][cx];
      if (!cell) return 0;
      if (cell.type === 'bridge' && this.mapData.bridge) {
        return this.mapData.bridge.deckHeight || 1.85;
      }
      const fx = gx - cx;
      const fy = gy - cy;
      const [h00, h10, h11, h01] = cell.h;
      const top = h00 * (1 - fx) + h10 * fx;
      const bot = h01 * (1 - fx) + h11 * fx;
      return top * (1 - fy) + bot * fy;
    }

    getCell(gx, gy) {
      if (!this.mapData) return null;
      const gw = this.mapData.meta.gridWidth;
      const gh = this.mapData.meta.gridHeight;
      if (gx < 0 || gx >= gw || gy < 0 || gy >= gh) return null;
      return this.mapData.cells[gy][gx];
    }

    // Raycast / pick 3D terrain cell under screen coordinate (mx, my)
    pickCellAtScreen(mx, my) {
      if (!this.mapData) return null;
      const gw = this.mapData.meta.gridWidth;
      const gh = this.mapData.meta.gridHeight;
      let bestCell = null;
      let bestDepth = -Infinity;

      for (let gy = 0; gy < gh; gy++) {
        for (let gx = 0; gx < gw; gx++) {
          const cell = this.mapData.cells[gy][gx];
          const isBridge = cell.type === 'bridge';
          const bh = this.mapData.bridge ? this.mapData.bridge.deckHeight : 1.85;
          const h00 = isBridge ? bh : cell.h[0];
          const h10 = isBridge ? bh : cell.h[1];
          const h11 = isBridge ? bh : cell.h[2];
          const h01 = isBridge ? bh : cell.h[3];

          const p00 = this.project3D(gx, gy, h00);
          const p10 = this.project3D(gx + 1, gy, h10);
          const p11 = this.project3D(gx + 1, gy + 1, h11);
          const p01 = this.project3D(gx, gy + 1, h01);

          if (this._pointInQuad(mx, my, p00, p10, p11, p01)) {
            const avgDepth = (p00.depth + p10.depth + p11.depth + p01.depth) * 0.25;
            if (avgDepth >= bestDepth) {
              bestDepth = avgDepth;
              bestCell = cell;
            }
          }
        }
      }
      return bestCell;
    }

    _pointInQuad(px, py, a, b, c, d) {
      return (
        this._pointInTri(px, py, a, b, c) ||
        this._pointInTri(px, py, a, c, d)
      );
    }

    _pointInTri(px, py, a, b, c) {
      const d1 = (px - b.x) * (a.y - b.y) - (a.x - b.x) * (py - b.y);
      const d2 = (px - c.x) * (b.y - c.y) - (b.x - c.x) * (py - c.y);
      const d3 = (px - a.x) * (c.y - a.y) - (c.x - a.x) * (py - a.y);
      const hasNeg = (d1 < 0) || (d2 < 0) || (d3 < 0);
      const hasPos = (d1 > 0) || (d2 > 0) || (d3 > 0);
      return !(hasNeg && hasPos);
    }

    // Built-in A* Pathfinding on the .gat walkable cell table
    findPath(startX, startY, goalX, goalY) {
      if (!this.mapData) return [];
      const gw = this.mapData.meta.gridWidth;
      const gh = this.mapData.meta.gridHeight;
      const sx = Math.max(0, Math.min(gw - 1, Math.floor(startX)));
      const sy = Math.max(0, Math.min(gh - 1, Math.floor(startY)));
      const tx = Math.max(0, Math.min(gw - 1, Math.floor(goalX)));
      const ty = Math.max(0, Math.min(gh - 1, Math.floor(goalY)));

      const targetCell = this.getCell(tx, ty);
      if (!targetCell || !targetCell.walkable) return [];
      if (sx === tx && sy === ty) return [];

      const key = (x, y) => y * gw + x;
      const open = [{ x: sx, y: sy, g: 0, f: Math.hypot(tx - sx, ty - sy) }];
      const cameFrom = new Map();
      const gScore = new Map();
      const closed = new Set();
      gScore.set(key(sx, sy), 0);

      const dirs = [
        [0, -1, 1], [1, 0, 1], [0, 1, 1], [-1, 0, 1],
        [-1, -1, 1.414], [1, -1, 1.414], [1, 1, 1.414], [-1, 1, 1.414]
      ];

      let steps = 0;
      while (open.length > 0 && steps++ < 2500) {
        open.sort((a, b) => a.f - b.f);
        const cur = open.shift();
        const cKey = key(cur.x, cur.y);
        if (cur.x === tx && cur.y === ty) {
          const path = [];
          let k = cKey;
          while (cameFrom.has(k)) {
            const cy = Math.floor(k / gw);
            const cx = k % gw;
            path.unshift({ x: cx + 0.5, y: cy + 0.5 });
            k = cameFrom.get(k);
          }
          return path;
        }
        closed.add(cKey);

        for (const [dx, dy, cost] of dirs) {
          const nx = cur.x + dx;
          const ny = cur.y + dy;
          const nCell = this.getCell(nx, ny);
          if (!nCell || !nCell.walkable) continue;
          // Prevent cutting corners across water/cliffs on diagonal steps
          if (dx !== 0 && dy !== 0) {
            const c1 = this.getCell(cur.x + dx, cur.y);
            const c2 = this.getCell(cur.x, cur.y + dy);
            if (!c1 || !c1.walkable || !c2 || !c2.walkable) continue;
          }
          const nKey = key(nx, ny);
          if (closed.has(nKey)) continue;

          const tentativeG = gScore.get(cKey) + cost;
          if (!gScore.has(nKey) || tentativeG < gScore.get(nKey)) {
            cameFrom.set(nKey, cKey);
            gScore.set(nKey, tentativeG);
            const h = Math.hypot(tx - nx, ty - ny);
            const existing = open.find(o => o.x === nx && o.y === ny);
            if (existing) {
              existing.g = tentativeG;
              existing.f = tentativeG + h;
            } else {
              open.push({ x: nx, y: ny, g: tentativeG, f: tentativeG + h });
            }
          }
        }
      }
      return [];
    }

    moveCharacterTo(gx, gy) {
      const path = this.findPath(this.character.x, this.character.y, gx, gy);
      if (path.length > 0) {
        this.character.path = path;
        this.character.targetCell = { x: Math.floor(gx), y: Math.floor(gy) };
        this.character.targetRipple = 1.0;
        return true;
      }
      return false;
    }

    syncCharacterHeight() {
      this.character.z = this.getHeightAt(this.character.x, this.character.y);
    }

    update(dt) {
      this.time += dt;

      // Update character movement along A* path
      const ch = this.character;
      if (ch.targetRipple > 0) {
        ch.targetRipple = Math.max(0, ch.targetRipple - dt * 1.4);
      }
      if (ch.path && ch.path.length > 0) {
        const next = ch.path[0];
        const dx = next.x - ch.x;
        const dy = next.y - ch.y;
        const dist = Math.hypot(dx, dy);
        const step = ch.speed * dt;

        // Update facing direction
        if (Math.abs(dx) > Math.abs(dy)) {
          ch.dir = dx > 0 ? 3 : 1;
        } else {
          ch.dir = dy > 0 ? 0 : 2;
        }

        if (dist <= step) {
          ch.x = next.x;
          ch.y = next.y;
          ch.path.shift();
        } else {
          ch.x += (dx / dist) * step;
          ch.y += (dy / dist) * step;
        }
        ch.z = this.getHeightAt(ch.x, ch.y);
        ch.animTimer += dt * 9.0;
        ch.frame = Math.floor(ch.animTimer) % 4;
      } else {
        ch.frame = 0;
      }
    }

    // Render cached 3D terrain mesh (.gnd) to offscreen buffer
    _rebuildTerrainCache() {
      const W = this.canvas.width;
      const H = this.canvas.height;
      if (this.terrainCacheCanvas.width !== W || this.terrainCacheCanvas.height !== H) {
        this.terrainCacheCanvas.width = W;
        this.terrainCacheCanvas.height = H;
      }
      const ctx = this.terrainCacheCtx;
      ctx.clearRect(0, 0, W, H);

      if (!this.mapData) return;
      const gw = this.mapData.meta.gridWidth;
      const gh = this.mapData.meta.gridHeight;

      // Collect and depth-sort all non-water terrain quads back-to-front
      const quads = [];
      for (let gy = 0; gy < gh; gy++) {
        for (let gx = 0; gx < gw; gx++) {
          const cell = this.mapData.cells[gy][gx];
          const [h00, h10, h11, h01] = cell.h;
          const p00 = this.project3D(gx, gy, h00);
          const p10 = this.project3D(gx + 1, gy, h10);
          const p11 = this.project3D(gx + 1, gy + 1, h11);
          const p01 = this.project3D(gx, gy + 1, h01);
          const avgDepth = (p00.depth + p10.depth + p11.depth + p01.depth) * 0.25;
          quads.push({ cell, gx, gy, p00, p10, p11, p01, avgDepth });
        }
      }
      quads.sort((a, b) => a.avgDepth - b.avgDepth);

      // Prepare repeating patterns from our sprite sheet tiles
      const patterns = {};
      for (const [tname, tcan] of Object.entries(this.tileCanvases)) {
        patterns[tname] = ctx.createPattern(tcan, 'repeat');
      }

      const sunX = Math.cos(this.options.sunlightAzimuth);
      const sunY = Math.sin(this.options.sunlightAzimuth);

      for (const q of quads) {
        const { cell, gx, gy, p00, p10, p11, p01 } = q;
        if (cell.type === 'water') continue; // Drawn dynamically in animated water pass

        // If cell is a bridge cell, draw riverbank/water underneath first
        const drawType = cell.type === 'bridge' ? 'bank' : cell.type;

        ctx.save();
        ctx.beginPath();
        ctx.moveTo(p00.x, p00.y);
        ctx.lineTo(p10.x, p10.y);
        ctx.lineTo(p11.x, p11.y);
        ctx.lineTo(p01.x, p01.y);
        ctx.closePath();

        // Choose base texture pattern & fallback color
        let pat = patterns.grass_olive;
        let fallback = '#4c5b25';
        if (drawType === 'grass_dark') {
          pat = patterns.grass_forest || pat;
          fallback = '#3a4a1c';
        } else if (drawType === 'dirt') {
          pat = patterns.dirt_path || pat;
          fallback = '#6d5735';
        } else if (drawType === 'cliff') {
          pat = patterns.cliff_rock || pat;
          fallback = '#64685c';
        } else if (drawType === 'bank') {
          pat = patterns.riverbank_wall || pat;
          fallback = '#36301d';
        }

        ctx.fillStyle = pat || fallback;
        ctx.fill();

        // Compute 3D slope normal shading (.gnd lightmap style)
        const [h00, h10, h11, h01] = cell.h;
        const slopeX = ((h10 + h11) - (h00 + h01)) * 0.5;
        const slopeY = ((h01 + h11) - (h00 + h10)) * 0.5;
        const lightDot = -(slopeX * sunX + slopeY * sunY);

        if (drawType === 'bank') {
          // Steep dark mossy embankment plunging into river
          ctx.fillStyle = 'rgba(14, 18, 8, 0.44)';
          ctx.fill();
        } else if (lightDot > 0.06) {
          const alpha = Math.min(0.28, lightDot * 0.22);
          ctx.fillStyle = `rgba(210, 230, 130, ${alpha.toFixed(3)})`;
          ctx.fill();
        } else if (lightDot < -0.06) {
          const alpha = Math.min(0.42, -lightDot * 0.28);
          ctx.fillStyle = `rgba(12, 18, 8, ${alpha.toFixed(3)})`;
          ctx.fill();
        }

        // Subtle RO terrain mesh seam smoothing
        ctx.strokeStyle = drawType === 'cliff' ? 'rgba(40,44,34,0.35)' : 'rgba(38,48,18,0.18)';
        ctx.lineWidth = 0.8;
        ctx.stroke();
        ctx.restore();
      }

      this.terrainCacheDirty = false;
    }

    // Draw animated multi-layered Ragnarok Online caustic river water
    _renderAnimatedWater(ctx) {
      if (!this.mapData) return;
      const gw = this.mapData.meta.gridWidth;
      const gh = this.mapData.meta.gridHeight;
      const waterLevel = this.mapData.meta.waterLevel || -0.15;

      const wf0 = this.tileCanvases.water_frame_0;
      const wf1 = this.tileCanvases.water_frame_1;
      const pat0 = wf0 ? ctx.createPattern(wf0, 'repeat') : null;
      const pat1 = wf1 ? ctx.createPattern(wf1, 'repeat') : null;

      const scrollX1 = (this.time * 22 * this.options.waterSpeed) % 128;
      const scrollY1 = (this.time * 14 * this.options.waterSpeed) % 128;
      const scrollX2 = (-this.time * 16 * this.options.waterSpeed) % 128;
      const scrollY2 = (this.time * 19 * this.options.waterSpeed) % 128;

      for (let gy = 0; gy < gh; gy++) {
        for (let gx = 0; gx < gw; gx++) {
          const cell = this.mapData.cells[gy][gx];
          if (cell.type !== 'water' && cell.type !== 'bridge') continue;

          // Gentle vertex wave ripple on water surface
          const w00 = waterLevel + Math.sin(this.time * 2.6 + gx * 0.7 + gy * 0.5) * 0.05;
          const w10 = waterLevel + Math.sin(this.time * 2.6 + (gx + 1) * 0.7 + gy * 0.5) * 0.05;
          const w11 = waterLevel + Math.sin(this.time * 2.6 + (gx + 1) * 0.7 + (gy + 1) * 0.5) * 0.05;
          const w01 = waterLevel + Math.sin(this.time * 2.6 + gx * 0.7 + (gy + 1) * 0.5) * 0.05;

          const p00 = this.project3D(gx, gy, w00);
          const p10 = this.project3D(gx + 1, gy, w10);
          const p11 = this.project3D(gx + 1, gy + 1, w11);
          const p01 = this.project3D(gx, gy + 1, w01);

          ctx.save();
          ctx.beginPath();
          ctx.moveTo(p00.x, p00.y);
          ctx.lineTo(p10.x, p10.y);
          ctx.lineTo(p11.x, p11.y);
          ctx.lineTo(p01.x, p01.y);
          ctx.closePath();
          ctx.clip();

          // Base deep RO cobalt water fill
          ctx.fillStyle = '#0c487c';
          ctx.fillRect(
            Math.min(p00.x, p01.x) - 2,
            Math.min(p00.y, p10.y) - 2,
            Math.max(p10.x, p11.x) - Math.min(p00.x, p01.x) + 4,
            Math.max(p01.y, p11.y) - Math.min(p00.y, p10.y) + 4
          );

          // Layer 1 scrolling RO water texture
          if (pat0) {
            ctx.save();
            ctx.translate(scrollX1, scrollY1);
            ctx.fillStyle = pat0;
            ctx.fill();
            ctx.restore();
          }

          // Layer 2 counter-scrolling caustic shimmer
          if (pat1) {
            ctx.save();
            ctx.globalAlpha = 0.48 + 0.12 * Math.sin(this.time * 3.0 + gx * 0.4);
            ctx.translate(scrollX2, scrollY2);
            ctx.fillStyle = pat1;
            ctx.fill();
            ctx.restore();
          }

          // Bright cyan caustic highlight bands in mid-stream
          const causticGlow = 0.14 + 0.10 * Math.sin(this.time * 3.4 + gx * 0.8 - gy * 0.6);
          ctx.fillStyle = `rgba(75, 205, 250, ${causticGlow.toFixed(3)})`;
          ctx.fill();

          // Check if adjacent to non-water bank to add authentic RO dark navy shoreline edge shadow
          let bankNeighbors = 0;
          for (const [dx, dy] of [[-1,0],[1,0],[0,-1],[0,1]]) {
            const nc = this.getCell(gx + dx, gy + dy);
            if (nc && nc.type !== 'water' && nc.type !== 'bridge') bankNeighbors++;
          }
          if (bankNeighbors > 0) {
            ctx.fillStyle = `rgba(6, 20, 40, ${(0.24 * bankNeighbors).toFixed(2)})`;
            ctx.fill();
          }

          ctx.restore();
        }
      }
    }

    // Render the 3D Wooden Plank Bridge & 4 Banded Stone Pillars
    _renderBridge3D(ctx) {
      if (!this.mapData || !this.mapData.bridge) return;
      const deckH = this.mapData.bridge.deckHeight || 1.85;
      const waterH = this.mapData.meta.waterLevel || -0.15;

      // Find all bridge cells
      const gw = this.mapData.meta.gridWidth;
      const gh = this.mapData.meta.gridHeight;
      let minX = gw, maxX = 0, minY = gh, maxY = 0, found = false;

      for (let gy = 0; gy < gh; gy++) {
        for (let gx = 0; gx < gw; gx++) {
          if (this.mapData.cells[gy][gx].type === 'bridge') {
            found = true;
            if (gx < minX) minX = gx;
            if (gx + 1 > maxX) maxX = gx + 1;
            if (gy < minY) minY = gy;
            if (gy + 1 > maxY) maxY = gy + 1;
          }
        }
      }
      if (!found) return;

      // 1. Cast dark shadow on the water underneath the bridge
      const sw00 = this.project3D(minX + 0.2, minY + 0.3, waterH + 0.02);
      const sw10 = this.project3D(maxX - 0.2, minY + 0.3, waterH + 0.02);
      const sw11 = this.project3D(maxX - 0.2, maxY - 0.3, waterH + 0.02);
      const sw01 = this.project3D(minX + 0.2, maxY - 0.3, waterH + 0.02);
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(sw00.x, sw00.y);
      ctx.lineTo(sw10.x, sw10.y);
      ctx.lineTo(sw11.x, sw11.y);
      ctx.lineTo(sw01.x, sw01.y);
      ctx.closePath();
      ctx.fillStyle = 'rgba(4, 14, 28, 0.55)';
      ctx.fill();
      ctx.restore();

      // 2. Draw arched wooden bridge planks from north (minY) to south (maxY)
      const numPlanks = Math.max(8, Math.round((maxY - minY) * 3));
      for (let i = 0; i < numPlanks; i++) {
        const t0 = i / numPlanks;
        const t1 = (i + 0.82) / numPlanks;
        const y0 = minY + t0 * (maxY - minY);
        const y1 = minY + t1 * (maxY - minY);
        const arch0 = deckH + Math.sin(t0 * Math.PI) * 0.35;
        const arch1 = deckH + Math.sin(t1 * Math.PI) * 0.35;

        const p00 = this.project3D(minX + 0.15, y0, arch0);
        const p10 = this.project3D(maxX - 0.15, y0, arch0);
        const p11 = this.project3D(maxX - 0.15, y1, arch1);
        const p01 = this.project3D(minX + 0.15, y1, arch1);

        ctx.save();
        ctx.beginPath();
        ctx.moveTo(p00.x, p00.y);
        ctx.lineTo(p10.x, p10.y);
        ctx.lineTo(p11.x, p11.y);
        ctx.lineTo(p01.x, p01.y);
        ctx.closePath();
        ctx.fillStyle = i % 2 === 0 ? '#7d6339' : '#6f5630';
        ctx.fill();
        ctx.strokeStyle = '#2d2212';
        ctx.lineWidth = 1.1;
        ctx.stroke();
        ctx.restore();
      }

      // 3. Draw Left & Right timber side rails
      for (const railX of [minX + 0.22, maxX - 0.38]) {
        const r00 = this.project3D(railX, minY, deckH + 0.12);
        const r10 = this.project3D(railX + 0.22, minY, deckH + 0.12);
        const r11 = this.project3D(railX + 0.22, maxY, deckH + 0.12);
        const r01 = this.project3D(railX, maxY, deckH + 0.12);
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(r00.x, r00.y);
        ctx.lineTo(r10.x, r10.y);
        ctx.lineTo(r11.x, r11.y);
        ctx.lineTo(r01.x, r01.y);
        ctx.closePath();
        ctx.fillStyle = '#584426';
        ctx.fill();
        ctx.strokeStyle = '#281d0e';
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.restore();
      }

      // 4. Draw the 4 Corner Banded Stone-and-Wood Bridge Pillars (matching image-1.png)
      const postRect = this.manifest && this.manifest.sprites ? this.manifest.sprites.river_stone_post : null;
      const corners = [
        { x: minX + 0.25, y: minY + 0.3 },
        { x: maxX - 0.25, y: minY + 0.3 },
        { x: minX + 0.25, y: maxY - 0.3 },
        { x: maxX - 0.25, y: maxY - 0.3 }
      ];
      for (const c of corners) {
        const pt = this.project3D(c.x, c.y, deckH);
        if (this.atlasImg && postRect) {
          const scale = (pt.scale / 32) * 0.92;
          const dw = postRect.w * scale;
          const dh = postRect.h * scale;
          ctx.drawImage(
            this.atlasImg,
            postRect.x, postRect.y, postRect.w, postRect.h,
            pt.x - postRect.anchorX * scale,
            pt.y - postRect.anchorY * scale,
            dw, dh
          );
        }
      }
    }

    // Draw Ragnarok Online .gat Walkable Grid & Hovered Cell Quad
    _renderWalkGridAndCursor(ctx) {
      if (!this.mapData) return;
      const gw = this.mapData.meta.gridWidth;
      const gh = this.mapData.meta.gridHeight;
      const bh = this.mapData.bridge ? this.mapData.bridge.deckHeight : 1.85;

      if (this.options.showWalkGrid) {
        ctx.save();
        for (let gy = 0; gy < gh; gy++) {
          for (let gx = 0; gx < gw; gx++) {
            const cell = this.mapData.cells[gy][gx];
            const isBridge = cell.type === 'bridge';
            const p00 = this.project3D(gx, gy, isBridge ? bh : cell.h[0]);
            const p10 = this.project3D(gx + 1, gy, isBridge ? bh : cell.h[1]);
            const p11 = this.project3D(gx + 1, gy + 1, isBridge ? bh : cell.h[2]);
            const p01 = this.project3D(gx, gy + 1, isBridge ? bh : cell.h[3]);

            ctx.beginPath();
            ctx.moveTo(p00.x, p00.y);
            ctx.lineTo(p10.x, p10.y);
            ctx.lineTo(p11.x, p11.y);
            ctx.lineTo(p01.x, p01.y);
            ctx.closePath();

            if (cell.walkable) {
              ctx.strokeStyle = isBridge ? 'rgba(90, 230, 255, 0.48)' : 'rgba(110, 255, 140, 0.28)';
              ctx.fillStyle = isBridge ? 'rgba(60, 190, 255, 0.14)' : 'rgba(80, 220, 110, 0.07)';
            } else {
              ctx.strokeStyle = 'rgba(255, 80, 80, 0.24)';
              ctx.fillStyle = 'rgba(220, 40, 40, 0.08)';
            }
            ctx.lineWidth = 1;
            ctx.fill();
            ctx.stroke();
          }
        }
        ctx.restore();
      }

      // Draw active A* path breadcrumbs
      if (this.character.path && this.character.path.length > 0) {
        ctx.save();
        for (const step of this.character.path) {
          const cx = Math.floor(step.x);
          const cy = Math.floor(step.y);
          const cell = this.getCell(cx, cy);
          if (!cell) continue;
          const isBridge = cell.type === 'bridge';
          const p00 = this.project3D(cx + 0.2, cy + 0.2, isBridge ? bh : cell.h[0]);
          const p10 = this.project3D(cx + 0.8, cy + 0.2, isBridge ? bh : cell.h[1]);
          const p11 = this.project3D(cx + 0.8, cy + 0.8, isBridge ? bh : cell.h[2]);
          const p01 = this.project3D(cx + 0.2, cy + 0.8, isBridge ? bh : cell.h[3]);
          ctx.beginPath();
          ctx.moveTo(p00.x, p00.y);
          ctx.lineTo(p10.x, p10.y);
          ctx.lineTo(p11.x, p11.y);
          ctx.lineTo(p01.x, p01.y);
          ctx.closePath();
          ctx.fillStyle = 'rgba(80, 255, 180, 0.28)';
          ctx.strokeStyle = 'rgba(120, 255, 200, 0.75)';
          ctx.lineWidth = 1.5;
          ctx.fill();
          ctx.stroke();
        }
        ctx.restore();
      }

      // Draw RO click target ripple
      if (this.character.targetCell && this.character.targetRipple > 0) {
        const tc = this.character.targetCell;
        const hz = this.getHeightAt(tc.x + 0.5, tc.y + 0.5);
        const pt = this.project3D(tc.x + 0.5, tc.y + 0.5, hz);
        const rad = (1.1 - this.character.targetRipple * 0.7) * pt.scale * 0.7;
        ctx.save();
        ctx.strokeStyle = `rgba(95, 255, 175, ${this.character.targetRipple.toFixed(2)})`;
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.ellipse(pt.x, pt.y, rad, rad * 0.58, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }

      // Draw Classic Ragnarok Online 3D Ground Cell Hover Cursor
      if (this.options.showHoverCursor && this.hoveredCell) {
        const hc = this.hoveredCell;
        const bRadius = Math.max(0, (this.options.brushSize || 1) - 1);
        ctx.save();
        for (let dy = -bRadius; dy <= bRadius; dy++) {
          for (let dx = -bRadius; dx <= bRadius; dx++) {
            const cell = this.getCell(hc.x + dx, hc.y + dy);
            if (!cell) continue;
            const isBridge = cell.type === 'bridge';
            const p00 = this.project3D(cell.x, cell.y, isBridge ? bh : cell.h[0]);
            const p10 = this.project3D(cell.x + 1, cell.y, isBridge ? bh : cell.h[1]);
            const p11 = this.project3D(cell.x + 1, cell.y + 1, isBridge ? bh : cell.h[2]);
            const p01 = this.project3D(cell.x, cell.y + 1, isBridge ? bh : cell.h[3]);

            ctx.beginPath();
            ctx.moveTo(p00.x, p00.y);
            ctx.lineTo(p10.x, p10.y);
            ctx.lineTo(p11.x, p11.y);
            ctx.lineTo(p01.x, p01.y);
            ctx.closePath();

            if (cell.walkable) {
              ctx.fillStyle = 'rgba(72, 245, 168, 0.34)';
              ctx.strokeStyle = 'rgba(130, 255, 210, 0.95)';
            } else {
              ctx.fillStyle = 'rgba(255, 75, 75, 0.32)';
              ctx.strokeStyle = 'rgba(255, 120, 120, 0.92)';
            }
            ctx.lineWidth = 2.2;
            ctx.fill();
            ctx.stroke();
          }
        }
        ctx.restore();
      }
    }

    // Depth-sorted rendering of all 2.5D Environment Sprites & Playable RO Character
    _renderDepthSortedSprites(ctx) {
      if (!this.mapData || !this.atlasImg || !this.manifest) return;

      const renderItems = [];
      const charScreen = this.project3D(this.character.x, this.character.y, this.character.z);

      // Add playable RO Adventurer character
      renderItems.push({
        kind: 'character',
        depth: charScreen.depth,
        screen: charScreen
      });

      // Add all map billboard sprites
      for (const sp of this.mapData.sprites) {
        const gz = this.getHeightAt(sp.x, sp.y);
        const screen = this.project3D(sp.x, sp.y, gz);
        renderItems.push({
          kind: 'sprite',
          sp,
          gz,
          depth: screen.depth,
          screen
        });
      }

      // Sort back-to-front by 3D depth
      renderItems.sort((a, b) => a.depth - b.depth);

      for (const item of renderItems) {
        if (item.kind === 'character') {
          this._drawCharacter(ctx, item.screen);
        } else {
          this._drawBillboardSprite(ctx, item.sp, item.screen, charScreen);
        }
      }
    }

    _drawCharacter(ctx, pt) {
      const charDef = this.manifest.character && this.manifest.character.ro_adventurer;
      if (!charDef) return;
      const scale = (pt.scale / 32) * 0.95;
      const fw = charDef.frameW;
      const fh = charDef.frameH;
      const sx = charDef.x + (this.character.frame % charDef.frames) * fw;
      const sy = charDef.y;
      const dw = fw * scale;
      const dh = fh * scale;

      ctx.save();
      ctx.drawImage(
        this.atlasImg,
        sx, sy, fw, fh,
        pt.x - dw * 0.5,
        pt.y - dh * 0.88,
        dw, dh
      );

      // Classic RO green HP/SP bar over character head
      const barW = 34 * scale;
      const barH = Math.max(3, 4 * scale);
      const bx = pt.x - barW * 0.5;
      const by = pt.y - dh * 0.96;
      ctx.fillStyle = 'rgba(10, 16, 24, 0.85)';
      ctx.fillRect(bx - 1, by - 1, barW + 2, barH * 2 + 3);
      ctx.fillStyle = '#25e858';
      ctx.fillRect(bx, by, barW, barH);
      ctx.fillStyle = '#2898ff';
      ctx.fillRect(bx, by + barH + 1, barW * 0.88, barH);
      ctx.restore();
    }

    _drawBillboardSprite(ctx, sp, pt, charScreen) {
      const rect = this.manifest.sprites[sp.type];
      if (!rect) return;

      const scale = (pt.scale / 32) * (sp.scale || 1.0);
      const dw = rect.w * scale;
      const dh = rect.h * scale;
      const ax = rect.anchorX * scale;
      const ay = rect.anchorY * scale;

      // Check if character or hovered cursor is occluded behind a tree canopy
      let alpha = 1.0;
      const isTree = sp.type.startsWith('tree_');
      if (this.options.canopyTransparency && isTree) {
        const charBehind = charScreen.depth < pt.depth;
        const dx = Math.abs(charScreen.x - pt.x);
        const dy = pt.y - charScreen.y;
        if (charBehind && dx < dw * 0.42 && dy > 0 && dy < dh * 0.88) {
          alpha = 0.45;
        }
      }

      // Gentle foliage wind sway for trees and bushes
      let swaySkew = 0;
      if (this.options.windSway && isTree) {
        swaySkew = Math.sin(this.time * 1.8 + sp.x * 0.65 + sp.y * 0.45) * 0.024;
      }

      ctx.save();
      ctx.translate(pt.x, pt.y);
      if (sp.flip) ctx.scale(-1, 1);
      if (swaySkew !== 0) ctx.transform(1, 0, swaySkew, 1, 0, 0);
      ctx.globalAlpha = alpha;

      ctx.drawImage(
        this.atlasImg,
        rect.x, rect.y, rect.w, rect.h,
        -ax, -ay, dw, dh
      );

      // Highlight selected sprite in Editor mode
      if (this.selectedSprite && this.selectedSprite.id === sp.id) {
        ctx.strokeStyle = '#ffdf40';
        ctx.lineWidth = 2;
        ctx.strokeRect(-ax, -ay, dw, dh);
      }
      ctx.restore();
    }

    render() {
      const W = this.canvas.width;
      const H = this.canvas.height;
      const ctx = this.ctx;

      // Check if camera changed to rebuild static 3D terrain cache
      const camHash = `${W}x${H}_${this.camera.yaw.toFixed(3)}_${this.camera.pitch.toFixed(3)}_${this.camera.zoom.toFixed(3)}_${this.camera.panX.toFixed(1)}_${this.camera.panY.toFixed(1)}`;
      if (this.terrainCacheDirty || camHash !== this._lastCamHash) {
        this._rebuildTerrainCache();
        this._lastCamHash = camHash;
      }

      // Sky / Deep forest abyss background
      const grad = ctx.createLinearGradient(0, 0, 0, H);
      grad.addColorStop(0, '#182210');
      grad.addColorStop(1, '#0e160a');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, W, H);

      // 1. Render Animated Caustic River Water
      this._renderAnimatedWater(ctx);

      // 2. Composite Cached 3D Terrain Mesh (.gnd)
      ctx.drawImage(this.terrainCacheCanvas, 0, 0);

      // Optional Reference Backdrop Blend (in 'hybrid_ref' mode when camera is at reference angle)
      if (this.options.renderMode === 'hybrid_ref' && this.referenceImg) {
        ctx.save();
        ctx.globalAlpha = 0.52;
        ctx.drawImage(this.referenceImg, 0, 0, W, H);
        ctx.restore();
        // Re-render live water caustics softly over the river so water still flows!
        ctx.save();
        ctx.globalAlpha = 0.65;
        this._renderAnimatedWater(ctx);
        ctx.restore();
      }

      // 3. Render 3D Wooden Bridge & Stone Pillars
      this._renderBridge3D(ctx);

      // 4. Render Walkable .gat Cell Grid & Hover Cursor
      this._renderWalkGridAndCursor(ctx);

      // 5. Render Depth-Sorted 2.5D Sprites & RO Adventurer Character
      this._renderDepthSortedSprites(ctx);

      // Optional Split-Screen Reference Image Comparison
      if (this.options.renderMode === 'split_compare' && this.referenceImg) {
        const splitX = Math.floor(W * this.options.splitRatio);
        ctx.save();
        ctx.beginPath();
        ctx.rect(0, 0, splitX, H);
        ctx.clip();
        ctx.drawImage(this.referenceImg, 0, 0, W, H);
        ctx.restore();

        // Divider bar
        ctx.save();
        ctx.strokeStyle = '#ffdf50';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(splitX, 0);
        ctx.lineTo(splitX, H);
        ctx.stroke();

        ctx.fillStyle = 'rgba(15, 22, 32, 0.85)';
        ctx.fillRect(splitX - 135, 14, 125, 26);
        ctx.fillRect(splitX + 10, 14, 155, 26);
        ctx.fillStyle = '#ffdf50';
        ctx.font = 'bold 12px sans-serif';
        ctx.fillText('REFERENCE IMAGE', splitX - 125, 31);
        ctx.fillStyle = '#65ffb8';
        ctx.fillText('2.5D SPRITE MAP ENGINE', splitX + 18, 31);
        ctx.restore();
      }
    }

    start() {
      if (this._rafId) return;
      let last = performance.now();
      const loop = (now) => {
        const dt = Math.min(0.05, (now - last) / 1000);
        last = now;
        this._frameCount++;
        if (now - this._lastFpsTime >= 500) {
          this.fps = Math.round((this._frameCount * 1000) / (now - this._lastFpsTime));
          this._frameCount = 0;
          this._lastFpsTime = now;
        }
        this.update(dt);
        this.render();
        this._rafId = requestAnimationFrame(loop);
      };
      this._rafId = requestAnimationFrame(loop);
    }

    stop() {
      if (this._rafId) {
        cancelAnimationFrame(this._rafId);
        this._rafId = null;
      }
    }
  }

  global.RagnarokMapRenderer = RagnarokMapRenderer;
})(typeof window !== 'undefined' ? window : this);
