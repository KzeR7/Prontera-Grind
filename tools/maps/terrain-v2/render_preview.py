#!/usr/bin/env python3
"""Render the terrain-v2 proposal boards (dev-only, no runtime dependency).

    /tmp/venv/bin/python tools/maps/terrain-v2/render_preview.py
    node tools/maps/terrain-v2/sample_heights.js /tmp/heights.json
    /tmp/venv/bin/python tools/maps/terrain-v2/render_preview.py --heights /tmp/heights.json

Writes, into docs/proposals/terrain-v2/:
  board-topdown.png   shipped v1 vs proposed v2, hillshaded, all ten fields
  board-ingame.png    the real game camera (38 deg FOV, 44 unit distance,
                      pitch ~0.78 rad) ray-marched over both heightfields
  metrics.json        relief / slope / feature counts used in the proposal

Requires numpy and Pillow. Nothing here ships to the player and nothing is
imported by the game; it exists so the owner can judge the change by eye.
"""
import argparse, json, math, os, subprocess, sys
import numpy as np
from PIL import Image, ImageDraw

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..'))
OUT = os.path.join(ROOT, 'docs', 'proposals', 'terrain-v2')
LABEL = ['Prontera', 'Izlude', 'Geffen', 'Morocc', 'Payon', 'Comodo', 'Louyang', 'Amatsu', 'Niflheim', 'Abyss']


# ---------------------------------------------------------------- analysis ----
def slope_deg(h, step):
    dy, dx = np.gradient(h, step)
    return np.degrees(np.arctan(np.hypot(dx, dy)))


def metrics(h, step, band=None):
    """Numbers the proposal quotes. `peaks` uses a ~7-unit window so it counts
    landforms rather than noise; `reliefBand` is relief inside the visible arena
    band (|x| < 30, -34 < z < 15), which is what the camera actually shows."""
    s = slope_deg(h, step)
    win_px = max(3, int(round(7.0 / step)))
    if win_px % 2 == 0:
        win_px += 1
    k = win_px // 2
    p = np.pad(h, k, mode='edge')
    win = np.lib.stride_tricks.sliding_window_view(p, (win_px, win_px))
    peaks = int((((h == win.max(axis=(2, 3))) & (h > h.mean() + 0.15))).sum())
    lap = np.abs(np.gradient(np.gradient(h, step, axis=0), step, axis=0)
                 + np.gradient(np.gradient(h, step, axis=1), step, axis=1))
    # anisotropy: how strongly the surface is organised in one direction (dunes/ridges
    # score high, domes score ~0). This is the "does it have a grain" number.
    gy, gx = np.gradient(h, step)
    J = np.array([[np.mean(gx * gx), np.mean(gx * gy)], [np.mean(gx * gy), np.mean(gy * gy)]])
    ev = np.linalg.eigvalsh(J)
    aniso = float((ev[1] - ev[0]) / max(1e-9, ev[1] + ev[0]))
    sub = h[band] if band is not None else h
    return {
        'relief': round(float(h.max() - h.min()), 2),
        'reliefBand': round(float(sub.max() - sub.min()), 2),
        'slopeMean': round(float(s.mean()), 2),
        'slopeP95': round(float(np.percentile(s, 95)), 2),
        'slopeMax': round(float(s.max()), 2),
        'peaks': peaks,
        'curvatureP95': round(float(np.percentile(lap, 95)), 4),
        'flatPct': round(float(100 * (s < 3).mean()), 1),
        'steepPct': round(float(100 * (s > 35).mean()), 2),
        'anisotropy': round(aniso, 3),
    }


def radial_symmetry(h):
    """How close is the field to its own 180 degree rotation? v1's rounded blobs on a
    symmetric ripple score high; a field with a real ridge and a real basin scores low."""
    flipped = h[::-1, ::-1]
    return round(float(np.corrcoef(h.ravel(), flipped.ravel())[0, 1]), 3)


def cross_map(hs):
    """Mean correlation between every pair of fields — the 'all maps feel the same'
    number. Falls as destinations gain their own landform."""
    flat = [h.ravel() - h.mean() for h in hs]
    vals = []
    for i in range(len(flat)):
        for j in range(i + 1, len(flat)):
            vals.append(float(np.corrcoef(flat[i], flat[j])[0, 1]))
    return round(float(np.mean(vals)), 3)


# ------------------------------------------------------------- top-down art ----
GRASS = np.array([0.42, 0.60, 0.31])
DIRT = np.array([0.62, 0.55, 0.39])
ROCK = np.array([0.47, 0.45, 0.43])
SAND = np.array([0.78, 0.72, 0.52])
WATER = np.array([0.22, 0.42, 0.50])


def pond_r(water, X, Z):
    ang = np.arctan2((Z - water['z']) / water['rz'], (X - water['x']) / water['rx'])
    return np.hypot((X - water['x']) / water['rx'], (Z - water['z']) / water['rz']) / (1 + .09 * np.sin(ang * 3) + .05 * np.cos(ang * 5))


def palette(s, X, Z, design):
    t = np.clip(s / 30.0, 0, 1)[..., None]
    ground = np.where(t < .5, GRASS + (DIRT - GRASS) * (t / .5), DIRT + (ROCK - DIRT) * ((t - .5) / .5))
    w = design.get('water')
    if w:
        r = pond_r(w, X, Z)
        beach = np.clip(1 - (r - .9) / .5, 0, 1)[..., None]
        ground = ground * (1 - beach) + SAND * beach
    return ground, s


def hillshade(h, step):
    dy, dx = np.gradient(h, step)
    nx, ny, nz = -dx, -dy, np.ones_like(h)
    n = np.sqrt(nx * nx + ny * ny + nz * nz)
    lx, ly, lz = -0.5, -0.55, 0.67
    return np.clip((nx * lx + ny * ly + nz * lz) / n, 0, 1)


def topdown(h, step, design, label, size=340):
    N = h.shape[0]
    R = 45
    X, Z = np.meshgrid(np.linspace(-R, R, N), np.linspace(-R, R, N))
    ground, s = palette(slope_deg(h, step), X, Z, design)
    sh = hillshade(h, step)[..., None]
    rgb = np.clip(ground * (0.45 + 0.85 * sh), 0, 1)
    w = design.get('water')
    if w:
        r = pond_r(w, X, Z)
        below = (h < w['level']) & (r <= 1.32)   # clip to the same ellipse the game's pond mesh uses
        if below.any():
            rgb[below] = (WATER * (0.7 + 0.5 * sh))[below]
    im = Image.fromarray((rgb * 255).astype(np.uint8)).resize((size, size), Image.LANCZOS)
    ImageDraw.Draw(im).text((6, 5), label, fill=(255, 255, 255))
    return im


# -------------------------------------------------------- in-game ray march ----
def ingame(h, step, design, eye_h=0.0, W=520, Hh=300, dist=44.0, pitch=0.78, fov=38.0, target_y=0.9, fog_near=55.0, fog_span=55.0):
    """Ray-march the heightfield through the game's own camera transform.

    Camera: az=0 (looking down -Z from +Z), pitch .78 rad, distance 44, focus on the
    hero at the origin — the values index.html uses for native fields.
    """
    N = h.shape[0]
    R = 45
    focus = np.array([0.0, target_y + eye_h, -2.0])
    cam = np.array([0.0, math.sin(pitch) * dist + .5, math.cos(pitch) * dist - 2.0])
    fwd = focus - cam
    fwd /= np.linalg.norm(fwd)
    right = np.cross(np.array([0.0, 1.0, 0.0]), fwd)
    right /= np.linalg.norm(right)
    up = np.cross(fwd, right)
    th = math.tan(math.radians(fov) / 2)

    px = (np.arange(W) + .5) / W * 2 - 1
    py = 1 - (np.arange(Hh) + .5) / Hh * 2
    px, py = np.meshgrid(px, py)
    dirs = fwd[None, None, :] + (px[..., None] * th * (W / Hh) * right) + (py[..., None] * th * up)
    dirs /= np.linalg.norm(dirs, axis=2, keepdims=True)

    def sample(x, z):
        gx = np.clip((x + R) / step, 0, N - 1.001)
        gz = np.clip((z + R) / step, 0, N - 1.001)
        ix, iz = np.floor(gx).astype(int), np.floor(gz).astype(int)
        u, v = gx - ix, gz - iz
        a, b = h[iz, ix], h[iz, ix + 1]
        c, d = h[iz + 1, ix], h[iz + 1, ix + 1]
        return np.where(u + v <= 1, a + (b - a) * u + (c - a) * v, d + (c - d) * (1 - u) + (b - d) * (1 - v))

    t = np.zeros((Hh, W))
    hit = np.zeros((Hh, W), bool)
    depth = np.full((Hh, W), np.inf)
    pos = np.zeros((Hh, W, 3))
    step_len = 0.22
    for i in range(1100):
        p = cam[None, None, :] + dirs * t[..., None]
        hh = sample(p[..., 0], p[..., 2])
        now = (~hit) & (p[..., 1] < hh)
        if now.any():
            depth[now] = t[now]
            pos[now] = p[now]
            hit |= now
        if hit.all():
            break
        t = np.where(hit, t, t + step_len)

    # sample the slope field where the rays landed
    sx = np.clip((pos[..., 0] + R) / step, 0, N - 1).astype(int)
    sz = np.clip((pos[..., 2] + R) / step, 0, N - 1).astype(int)
    ground, s = palette(slope_deg(h, step)[sz, sx], pos[..., 0], pos[..., 2], design)
    gy, gx = np.gradient(h, step)
    nx, ny, nz = -gx, -gy, np.ones_like(h)
    nrm = np.sqrt(nx * nx + ny * ny + nz * nz)
    def normal_at(x, z):
        gx_ = np.clip((x + R) / step, 0, N - 1).astype(int)
        gz_ = np.clip((z + R) / step, 0, N - 1).astype(int)
        return np.stack([nx[gz_, gx_] / nrm[gz_, gx_], ny[gz_, gx_] / nrm[gz_, gx_], nz[gz_, gx_] / nrm[gz_, gx_]], -1)
    nrmv = normal_at(pos[..., 0], pos[..., 2])
    light = np.array([-.5, .55, .67]); light /= np.linalg.norm(light)
    lam = np.clip((nrmv * light).sum(-1), 0, 1)[..., None] * .8 + .35

    rgb = np.clip(ground * lam, 0, 1)
    w = design.get('water')
    if w:
        r = pond_r(w, pos[..., 0], pos[..., 2])
        wet = hit & (pos[..., 1] < w['level'] + .02) & (r <= 1.32)
        if wet.any():
            rgb[wet] = (WATER * (0.75 + 0.4 * lam))[wet]

    # faint topographic bands where the ray landed: structure reads even on gentle ground
    band = np.abs(((pos[..., 1] / 1.0) % 1) - .5)
    band = (band < .045) & hit
    rgb[band] *= .90

    sky = np.clip(0.55 + 0.4 * py[..., None], 0, 1) * np.array([0.72, 0.83, 0.95])
    fog = np.clip((depth - fog_near) / fog_span, 0, 1)[..., None]
    rgb = np.where(hit[..., None], rgb, sky)
    rgb = rgb * (1 - fog) + sky * fog
    return Image.fromarray((np.clip(rgb, 0, 1) * 255).astype(np.uint8))


# --------------------------------------------------------------------- main ----
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--heights', default='/tmp/heights.json')
    ap.add_argument('--only', default='', help='comma-separated map indices for the in-game board')
    ap.add_argument('--variants', action='store_true', help='also render the intensity variant board')
    a = ap.parse_args()
    if not os.path.exists(a.heights):
        print('sampling heights...')
        subprocess.run(['node', os.path.join(ROOT, 'tools/maps/terrain-v2/sample_heights.js'), a.heights], check=True)
    d = json.load(open(a.heights))
    N, step = d['N'], d['step']
    os.makedirs(OUT, exist_ok=True)

    h1 = [np.array(g, dtype=np.float64).reshape(N, N) for g in d['v1']['grids']]
    h2 = [np.array(g, dtype=np.float64).reshape(N, N) for g in d['v2']['grids']]

    R = d['R']
    xs = np.linspace(-R, R, N)
    band = np.ix_(np.where((xs > -34) & (xs < 15))[0], np.where((xs > -30) & (xs < 30))[0])
    stats = {'v1': [], 'v2': []}
    for m in range(10):
        stats['v1'].append({**metrics(h1[m], step, band), 'radialSymmetry': radial_symmetry(h1[m])})
        stats['v2'].append({**metrics(h2[m], step, band), 'radialSymmetry': radial_symmetry(h2[m])})
    summary = {'perMap': stats, 'crossMapCorrelation': {'v1': cross_map(h1), 'v2': cross_map(h2)}}
    json.dump(summary, open(os.path.join(OUT, 'metrics.json'), 'w'), indent=1)

    # top-down board: two rows per state interleaved so the eye compares pairs
    W = 340
    im = Image.new('RGB', (W * 5, W * 4 + 78), (16, 17, 19))
    dr = ImageDraw.Draw(im)
    dr.text((8, 8), 'v195 landform (kept as legacyHeight): 1.1 + 3 Gaussian mounds + 1 valley + one sine ripple, same recipe x10', fill=(235, 235, 235))
    for m in range(10):
        im.paste(topdown(h1[m], step, d['v1']['designs'][m], LABEL[m]), ((m % 5) * W, 26 + (m // 5) * W))
    dr.text((8, 26 + 2 * W + 12), 'SHIPPED v2 (assets/native-fields.js): ridged landform + benches + drainage + per-map signature, lane-aware', fill=(235, 235, 235))
    for m in range(10):
        im.paste(topdown(h2[m], step, d['v2']['designs'][m], LABEL[m]), ((m % 5) * W, 26 + 2 * W + 30 + (m // 5) * W))
    p1 = os.path.join(OUT, 'board-topdown.png')
    im.save(p1)
    print('wrote', p1)

    only = [int(v) for v in a.only.split(',')] if a.only else [0, 2, 3, 6, 9]
    im = Image.new('RGB', (520 * len(only), 300 * 2 + 34), (16, 17, 19))
    dr = ImageDraw.Draw(im)
    dr.text((8, 9), 'GAME CAMERA - v195 landform (top) vs shipped v2 (bottom): 38 deg FOV, distance 44, pitch .78', fill=(235, 235, 235))
    for k, m in enumerate(only):
        im.paste(ingame(h1[m], step, d['v1']['designs'][m]), (k * 520, 30))
        im.paste(ingame(h2[m], step, d['v2']['designs'][m]), (k * 520, 330))
        dr.text((k * 520 + 8, 32), LABEL[m], fill=(255, 255, 255))
        dr.text((k * 520 + 8, 332), LABEL[m], fill=(255, 255, 255))
    p2 = os.path.join(OUT, 'board-ingame.png')
    im.save(p2)
    print('wrote', p2)

    if a.variants:
        variant_board(os.path.join(OUT, 'board-intensity.png'))




# ------------------------------------------------------------------ variants ----
def variant_board(out_path, maps=(0, 5, 6)):
    """Same landform at three intensities, so the owner can pick a dial position.
    'subtle' keeps the shipped calm feel, 'proposed' is the tuned recipe,
    'dramatic' pushes relief and cliffs for a bolder silhouette."""
    def sample(mul):
        njs = """
const V2=require(%(p)s);   // the shipped module; amp is a real dial in DESIGNS
const maps=%(m)s, N=141, R=45, st=2*R/(N-1), out=[];
for(const m of maps){
  const src=V2.DESIGNS[m];
  const d=Object.assign({},src);
  d.amp=(src.amp||1)*%(mul)s;
  if(src.bench)d.bench=Object.assign({},src.bench,{amount:src.bench.amount*%(bench)s});
  d.ridgeAmp=src.ridgeAmp*%(ridge)s;
  V2.DESIGNS[m]=d;
  const g=new Float64Array(N*N);
  for(let j=0;j<N;j++)for(let i=0;i<N;i++)g[j*N+i]=V2.terrainHeight(m,-R+i*st,-R+j*st);
  V2.DESIGNS[m]=src;
  out.push(Array.from(g));
}
console.log(JSON.stringify({N,step:st,grids:out}));
""" % {'p': json.dumps(os.path.join(ROOT, 'assets/native-fields.js')),
       'm': json.dumps(list(maps)), 'mul': mul,
       'bench': 0.7 if mul < 1 else (1.25 if mul > 1 else 1),
       'ridge': 1 if mul <= 1 else 1.15}
        return json.loads(subprocess.run(['node', '-e', njs], capture_output=True, text=True, check=True).stdout)

    designs = json.load(open('/tmp/heights.json'))['v2']['designs']

    variants = [(0.55, 'SUBTLE  (amp x0.55)'), (1.0, 'PROPOSED  (amp x1.0)'), (1.7, 'DRAMATIC  (amp x1.7)')]
    cell_w, cell_h = 400, 230
    im = Image.new('RGB', (cell_w * len(maps), (cell_h + 26) * len(variants) + 10), (16, 17, 19))
    dr = ImageDraw.Draw(im)
    for r, (mul, title) in enumerate(variants):
        s = sample(mul)
        N, step = s['N'], s['step']
        for c, m in enumerate(maps):
            h = np.array(s['grids'][c]).reshape(N, N)
            x = c * cell_w
            y = 10 + r * (cell_h + 26)
            dr.text((x + 8, y), '%s - %s' % (title, LABEL[m]), fill=(235, 235, 235))
            im.paste(ingame(h, step, designs[m], W=cell_w, Hh=cell_h, dist=44, pitch=0.78, fog_near=70, fog_span=80), (x, y + 20))
    im.save(out_path)
    print('wrote', out_path)


if __name__ == '__main__':
    main()
