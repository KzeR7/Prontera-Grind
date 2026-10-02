"""HD thief renderer - detailed costume, original pixels."""
import math
from spr_core import cell, ell, limb3, outline, poly, proj, shade
from spr_anime import prep
def draw_thief_hd(raw, dir_i, kind, fr):
 from spr_pose import pose, draw_weapon, slash_arc
 spec = raw if isinstance(raw.get('skin'), tuple) else prep(raw)
 im, d = cell()
 a = dir_i * math.pi / 4
 face = math.cos(a)
 side = math.sin(a)
 P = pose(kind, fr, spec['wt'])
 bob, swing, lean = P['bob'], P['swing'], P['lean']
 near = 1 if side >= 0 else -1
 female = bool(spec.get('longhair'))
 skin, shirt = spec['skin'], spec['shirt']
 vest, ribbon = spec['vest'], spec.get('ribbon')
 pants, boot = spec['pants'], spec['boot']
 hair, hair_hi = spec['hair'], spec['hair_hi']
 glove, metal = spec['glove'], spec['metal']
 kneepad = spec.get('kneepad')
 def pr(x, y, z=0.0):
  return proj(x + lean * (1 if z == 0 else 0), y, z, a, bob)
 def j(name, s):
  return P[name + ('1' if s > 0 else '-1')]
 for s in (near, -near):
  k, f = j('knee', s), j('foot', s)
  limb3(d, (5.6 * s, 30, 0), k, 6.8, pants, False, a, bob)
  limb3(d, k, (f[0], f[1] + 2.5, f[2]), 6.0, pants, False, a, bob)
  kpx, kpy = pr(k[0], k[1] - 1, k[2])[0], pr(k[0], k[1] - 1, k[2])[1]
  if kneepad:
   ell(d, kpx, kpy, 3.4, 3.0, kneepad)
   ell(d, kpx - 1, kpy - 1, 1.4, 1.2, shade(kneepad, 1.3))
  bx, by, _ = proj(f[0], f[1] + 2.5, f[2], a, bob)
  ell(d, bx, by + 1.0, 3.8, 3.0, shade(boot, .75))
  ell(d, bx, by, 3.6, 3.2, boot)
  ell(d, bx - 1.2, by - 1.0, 1.6, 1.4, shade(boot, 1.35))
  ell(d, bx + side * 1.6 + 1.4, by + 1.4, 3.0, 1.8, shade(boot, .85))
 shw, hipw = 7.6, 7.0
 poly(d, [pr(-shw, 46)[:2], pr(shw, 46)[:2],
  pr(hipw, 32)[:2], pr(-hipw, 32)[:2]], shirt)
 poly(d, [pr(-shw, 46, .1)[:2], pr(-1.5, 46, .1)[:2],
  pr(-1.5, 32, .1)[:2], pr(-hipw, 32, .1)[:2]], shade(shirt, 1.12))
 poly(d, [pr(1.5, 46, .1)[:2], pr(shw, 46, .1)[:2],
  pr(hipw, 32, .1)[:2], pr(1.5, 32, .1)[:2]], shade(shirt, .88))
 poly(d, [pr(-shw - .8, 45, .25)[:2], pr(-2.0, 45, .25)[:2],
  pr(-2.4, 33, .25)[:2], pr(-hipw - .6, 33, .25)[:2]], vest)
 poly(d, [pr(2.0, 45, .25)[:2], pr(shw + .8, 45, .25)[:2],
  pr(hipw + .6, 33, .25)[:2], pr(2.4, 33, .25)[:2]], vest)
 poly(d, [pr(-2.0, 45, .3)[:2], pr(2.0, 45, .3)[:2],
  pr(1.4, 34, .3)[:2], pr(-1.4, 34, .3)[:2]], shade(vest, .7))
 if ribbon:
  poly(d, [pr(-2.6, 41, .4)[:2], pr(2.6, 41, .4)[:2],
   pr(0, 38.4, .4)[:2]], ribbon)
  poly(d, [pr(-4.4, 39.6, .4)[:2], pr(-1.2, 39.2, .4)[:2],
   pr(-2.8, 36.6, .4)[:2]], ribbon)
  poly(d, [pr(4.4, 39.6, .4)[:2], pr(1.2, 39.2, .4)[:2],
   pr(2.8, 36.6, .4)[:2]], ribbon)
 poly(d, [pr(-3.6, 46.5, .3)[:2], pr(3.6, 46.5, .3)[:2],
  pr(0, 42.5, .3)[:2]], shade(shirt, .8))
 poly(d, [pr(-hipw - .5, 31.5, .15)[:2], pr(hipw + .5, 31.5, .15)[:2],
  pr(hipw + .5, 28.8, .15)[:2], pr(-hipw - .5, 28.8, .15)[:2]], spec['belt'])
 ell(d, *pr(0, 30.2, .3)[:2], 1.7, 1.3, metal)
 poly(d, [pr(-hipw - .5, 28.8, .1)[:2], pr(hipw + .5, 28.8, .1)[:2],
  pr(hipw + .2, 26.5, .1)[:2], pr(-hipw - .2, 26.5, .1)[:2]], shade(pants, .8))
 for s in (near, -near):
  sh, el, hd = (s * shw * .9, 44, 0), j('elb', s), j('hand', s)
  limb3(d, sh, el, 5.4, shirt, True, a, bob)
  ell(d, *pr(sh[0], sh[1] - 2, sh[2])[:2], 3.4, 2.2, shade(shirt, .85))
  limb3(d, el, hd, 4.4, skin, True, a, bob)
  limb3(d, (hd[0], hd[1], hd[2]),
   (hd[0], hd[1] - 2.6, hd[2]), 4.8, glove, True, a, bob)
  ell(d, *pr(hd[0], hd[1] - 3.2, hd[2])[:2], 2.0, 1.2, shade(glove, 1.3))
 hd = P['head']
 hcx, hcy, _ = proj(hd[0] + lean, hd[1] + 1.5, 0, a, bob)
 hrx, hry = 7.4, 8.8
 if female:
  ell(d, hcx - side * 2.4, hcy + 2.0, 4.2, 8.0, shade(hair, .9))
  ell(d, hcx - side * 3.4, hcy + 9.0, 2.6, 5.4, hair)
  ell(d, hcx - side * 3.4, hcy + 4.0, 1.6, 2.4, hair_hi)
  ell(d, hcx, hcy - 1.4, hrx + 1.6, hry * 0.7, hair)
 else:
  for i, (ox, oy, w, h) in enumerate(
   [(-4, -7, 3.2, 4.5), (-1, -8, 3.4, 5.2), (2, -8, 3.4, 5.2),
    (5, -7, 3.0, 4.2), (-6, -4, 2.6, 3.6), (7, -4, 2.6, 3.6)]):
   ell(d, hcx + ox + side * (1.5 if i > 3 else 0), hcy + oy, w, h, hair)
  ell(d, hcx - 1.5, hcy - hry * 0.72, 3.0, 1.6, hair_hi)
 ell(d, hcx, hcy, hrx, hry, skin)
 ell(d, hcx - hrx * .3, hcy + 1.5, hrx * .6, hry * .5, shade(skin, 1.06))
 if face > .85:
  ex = side * 2.4
  if not female:
   for i in range(5):
    fx = hcx - hrx * .85 + i * (hrx * 1.7 / 4)
    poly(d, [(fx - 2.0, hcy - hry * .5), (fx + 2.0, hcy - hry * .5),
     (fx + side, hcy - hry * .5 + hry * .5)], hair)
  else:
   ell(d, hcx, hcy - hry * .6, hrx + .6, hry * .42, hair)
   ell(d, hcx - hrx * .2, hcy - hry * .62, hrx * .4, hry * .16, hair_hi)
  for s in (-1, 1):
   ell(d, hcx + ex + s * 2.5, hcy + .6, 2.1, 2.9, (255, 255, 255, 255))
   ell(d, hcx + ex + s * 2.5, hcy + 1.0, 1.5, 2.1, (42, 30, 20, 255))
   ell(d, hcx + ex + s * 2.5, hcy + 1.2, .8, 1.2, (20, 12, 10, 255))
   ell(d, hcx + ex + s * 2.5 - .5, hcy + .0, .75, .75, (255, 255, 255, 255))
  poly(d, [(hcx + ex - 2.6, hcy + .2), (hcx + ex + 2.6, hcy + .2),
   (hcx + ex + 2.6, hcy - .6), (hcx + ex - 2.6, hcy - .6)],
   shade(hair, .92) if female else hair)
  ell(d, hcx + ex, hcy + 4.9, 1.5, .8, (178, 108, 98, 255))
  if female:
   ell(d, hcx - side * (hrx + .5), hcy + 2.0, 1.8, 3.4, hair)
   ell(d, hcx + side * (hrx + .5), hcy + 2.0, 1.8, 3.4, hair)
 elif face < -.5:
  ell(d, hcx, hcy - .5, hrx + 1.6, hry + .8, hair)
  if female:
   ell(d, hcx - side * 2.2, hcy + 5.0, 3.4, 6.4, hair)
   ell(d, hcx - side * 2.2, hcy + 1.0, 2.0, 3.0, shade(hair, 1.15))
  else:
   ell(d, hcx - side, hcy + 3.0, hrx * .7, hry * .55, shade(hair, .85))
 else:
  sg = 1 if side >= 0 else -1
  ell(d, hcx - sg * 1.5, hcy - 0.5, hrx + 1.6, hry + 0.8, hair)
  ell(d, hcx + sg * 1.0, hcy + 0.2, hrx * 0.8, hry * 0.92, skin)
  ell(d, hcx - sg * 0.5, hcy - hry * 0.58, hrx + 1.1, hry * 0.52, hair)
  ell(d, hcx - sg * 1.2, hcy - hry * 0.68, hrx * 0.44, hry * 0.16, hair_hi)
  ell(d, hcx + sg * 4.2, hcy + 0.6, 2.0, 2.8, (255, 255, 255, 255))
  ell(d, hcx + sg * 4.2, hcy + 1.0, 1.4, 2.0, (42, 30, 20, 255))
  ell(d, hcx + sg * 3.8, hcy + 0.1, .7, .7, (255, 255, 255, 255))
 hd2 = j('hand', 1)
 wx, wy, _ = proj(hd2[0] + lean, hd2[1], hd2[2], a, bob)
 wang = (-0.7 - swing * 1.4) if kind == 2 else (-0.62 + P['sw'] * .45)
 if kind == 2 and fr in (1, 2):
  slash_arc(d, wx, wy, wang + math.pi * .5, 1.15, .9 if fr == 2 else .5)
 draw_weapon(d, wx, wy, wang, spec['wt'], metal, swing if kind == 2 else 0.0)
 return outline(im)


