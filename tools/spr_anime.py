"""Anime renderer (original art, RO-inspired) - novice + thief branch."""
import math
from spr_core import cell, ell, limb3, outline, poly, proj, shade
HERO_ANIME_SPECS = {
 'nov_m': dict(label='Novice male anime', cls='novice', wt='dagger',
  skin='#f0c49a', hair='#5a3a20', hair_hi='#8a6238', shirt='#f4ead0',
  vest='#d84a3a', collar='#b8382c', belt='#5a3a22', pants='#4a6ab0',
  boot='#6a4226', glove='#e8c890', metal='#e8ecf4'),
 'nov_f': dict(label='Novice female anime', cls='novice', wt='dagger',
  skin='#f6cfae', hair='#e07a3a', hair_hi='#f2a86a', shirt='#f8eed8',
  vest='#e85a4a', collar='#c04838', belt='#5a3a22', pants='#4a6ac0',
  boot='#6a4226', glove='#e8c890', metal='#e8ecf4', longhair=True),
 'thief_m': dict(label='Thief male HD anime', cls='thief_hd', wt='dagger',
  skin='#f2c69c', hair='#b82828', hair_hi='#e05848', shirt='#d8d2c2',
  vest='#8a8a92', collar='#c02828', belt='#4a3230', pants='#6a4a34',
  boot='#4a3a2c', glove='#3a343c', metal='#e8ecf4', ribbon='#c02828',
  kneepad='#c8a028'),
 'thief_f': dict(label='Thief female HD anime', cls='thief_hd', wt='dagger',
  skin='#f8d2b0', hair='#4a2c1c', hair_hi='#7a4c34', shirt='#e0d8c8',
  vest='#9a9aa2', collar='#c02828', belt='#5a3a32', pants='#6a4a34',
  boot='#4a3a2c', glove='#3a343c', metal='#e8ecf4', ribbon='#c02828',
  kneepad='#c8a028', longhair=True),
 'assassin_m': dict(label='Assassin male anime', cls='assassin', wt='katar',
  skin='#f0c49a', hair='#28282e', hair_hi='#4a4a5c', shirt='#5a4a8a',
  vest='#3c3468', collar='#2c2850', belt='#232336', pants='#34345c',
  boot='#2c2c44', glove='#6a5aaa', metal='#d8dcf0',
  hood='#463e78', hood_d='#332e5c', cape='#332e5c', mask='#c03a3a'),
 'assassin_f': dict(label='Assassin female anime', cls='assassin', wt='katar',
  skin='#f6cfae', hair='#8a4a6a', hair_hi='#b87a9a', shirt='#5a4a8a',
  vest='#3c3468', collar='#2c2850', belt='#232336', pants='#34345c',
  boot='#2c2c44', glove='#6a5aaa', metal='#d8dcf0',
  hood='#463e78', hood_d='#332e5c', cape='#332e5c', mask='#c03a3a',
  longhair=True),
 'xcross_m': dict(label='Assassin Cross male anime', cls='xcross', wt='katar',
  skin='#f0c49a', hair='#1a1a22', hair_hi='#3a3a4c', shirt='#3e3e6e',
  vest='#2a2a4e', collar='#c0a040', belt='#1c1c30', pants='#26263e',
  boot='#22223a', glove='#4e4e7e', metal='#f2f4ff',
  hood='#2e2e58', hood_d='#1c1c30', cape='#1c1c30', mask='#e03a3a'),
 'xcross_f': dict(label='Assassin Cross female anime', cls='xcross', wt='katar',
  skin='#f6cfae', hair='#5a3a5a', hair_hi='#8a6a8a', shirt='#3e3e6e',
  vest='#2a2a4e', collar='#c0a040', belt='#1c1c30', pants='#26263e',
  boot='#22223a', glove='#4e4e7e', metal='#f2f4ff',
  hood='#2e2e58', hood_d='#1c1c30', cape='#1c1c30', mask='#e03a3a',
  longhair=True),
}
NOVICE_SPECS = HERO_ANIME_SPECS
COL_KEYS = ('skin', 'hair', 'hair_hi', 'shirt', 'vest', 'collar',
 'belt', 'pants', 'boot', 'glove', 'metal', 'hood', 'hood_d', 'cape', 'mask',
 'ribbon', 'kneepad')
def prep(spec):
 s = dict(spec)
 for k in COL_KEYS:
  if isinstance(s.get(k), str):
   h = s[k].lstrip('#')
   s[k] = (int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16), 255)
 return s
def fringe(d, hcx, hcy, hrx, hry, hair, hair_hi, side, female):
 for i in range(5):
  fx = hcx - hrx * 0.8 + i * (hrx * 1.6 / 4)
  fl = hry * (0.55 + (0.25 if i % 2 == 0 else 0.0))
  poly(d, [(fx - 2.2, hcy - hry * 0.55), (fx + 2.2, hcy - hry * 0.55),
   (fx + side * 1.2, hcy - hry * 0.55 + fl)], hair)
 ell(d, hcx - hrx * 0.25, hcy - hry * 0.62, hrx * 0.5, hry * 0.22, hair_hi)
 ll = hry * (1.5 if female else 0.9)
 for s in (-1, 1):
  poly(d, [(hcx + s * hrx * 0.95, hcy - hry * 0.3),
   (hcx + s * (hrx * 0.95 + 2.2), hcy - hry * 0.3),
   (hcx + s * hrx * 0.7 + side, hcy + ll)], hair)
 if female:
  ell(d, hcx - side * (hrx + 3.2), hcy + hry * 1.1, 3.0, 6.0, hair)
  ell(d, hcx - side * (hrx + 3.2), hcy + hry * 0.2, 2.0, 3.0, hair_hi)
def draw_anime_novice(raw, dir_i, kind, fr):
 return draw_anime_hero(raw, dir_i, kind, fr)
def draw_anime_hero(raw, dir_i, kind, fr):
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
 cls = spec.get('cls', 'novice')
 hood, hood_d = spec.get('hood'), spec.get('hood_d')
 cape, mask = spec.get('cape'), spec.get('mask')
 skin, shirt = spec['skin'], spec['shirt']
 vest, collar = spec['vest'], spec['collar']
 pants, boot = spec['pants'], spec['boot']
 hair, hair_hi = spec['hair'], spec['hair_hi']
 glove, metal = spec['glove'], spec['metal']
 def pr(x, y, z=0.0):
  return proj(x + lean * (1 if z == 0 else 0), y, z, a, bob)
 def j(name, s):
  return P[name + ('1' if s > 0 else '-1')]
 if cape:
  sway = math.sin(kind * 2 + fr) * 1.2
  poly(d, [pr(-7.2, 45, -4)[:2], pr(7.2, 45, -4)[:2],
   pr(9.5 + sway, 24, -7)[:2], pr(-9.5 + sway, 24, -7)[:2]],
   shade(cape, .82))
  poly(d, [pr(-7.2, 45, -3.8)[:2], pr(7.2, 45, -3.8)[:2],
   pr(8.0 + sway, 30, -6.4)[:2], pr(-8.0 + sway, 30, -6.4)[:2]], cape)
  if cls == 'xcross':
   poly(d, [pr(-7.2, 45, -3.7)[:2], pr(7.2, 45, -3.7)[:2],
    pr(6.0 + sway, 36, -6.2)[:2], pr(-6.0 + sway, 36, -6.2)[:2]],
    shade(collar, .9))
 for s in (near, -near):
  k, f = j('knee', s), j('foot', s)
  limb3(d, (4.6 * s, 29, 0), k, 4.4, pants, False, a, bob)
  limb3(d, k, (f[0], f[1] + 3, f[2]), 4.0, shade(pants, .9), True, a, bob)
  bx, by, _ = proj(f[0], f[1] + 2.5, f[2], a, bob)
  ell(d, bx, by, 3.0, 3.4, boot)
  ell(d, bx + side * 1.6 + 1.2, by + 1.6, 2.8, 1.8, shade(boot, .8))
 shw, hipw = 6.6, 5.8
 poly(d, [pr(-shw, 45)[:2], pr(shw, 45)[:2],
  pr(hipw, 29)[:2], pr(-hipw, 29)[:2]], shirt)
 poly(d, [pr(-shw, 45, .1)[:2], pr(-shw * .2, 45, .1)[:2],
  pr(-hipw * .2, 29, .1)[:2], pr(-hipw, 29, .1)[:2]], shade(shirt, 1.14))
 poly(d, [pr(-shw - .6, 44, .2)[:2], pr(-1.6, 44, .2)[:2],
  pr(-1.6, 30, .2)[:2], pr(-hipw - .4, 30, .2)[:2]], vest)
 poly(d, [pr(1.6, 44, .2)[:2], pr(shw + .6, 44, .2)[:2],
  pr(hipw + .4, 30, .2)[:2], pr(1.6, 30, .2)[:2]], vest)
 poly(d, [pr(-3.4, 45.5, .3)[:2], pr(3.4, 45.5, .3)[:2],
  pr(0, 41.5, .3)[:2]], collar)
 ell(d, *pr(0, 38, .35)[:2], 1.0, 1.0, collar)
 ell(d, *pr(0, 34.5, .35)[:2], 1.0, 1.0, collar)
 poly(d, [pr(-hipw - .4, 29.5, .15)[:2], pr(hipw + .4, 29.5, .15)[:2],
  pr(hipw + .4, 27.2, .15)[:2], pr(-hipw - .4, 27.2, .15)[:2]], spec['belt'])
 ell(d, *pr(0, 28.4, .3)[:2], 1.6, 1.2, metal)
 for s in (near, -near):
  sh, el, hd = (s * shw * .9, 44, 0), j('elb', s), j('hand', s)
  limb3(d, sh, el, 4.6, shirt, True, a, bob)
  limb3(d, el, hd, 3.8, skin, True, a, bob)
  limb3(d, (hd[0], hd[1], hd[2]),
   (hd[0], hd[1] - 2.2, hd[2]), 4.2, glove, True, a, bob)
 hd = P['head']
 hcx, hcy, _ = proj(hd[0] + lean, hd[1] + 1.5, 0, a, bob)
 hrx, hry = 7.2, 8.6
 hooded = bool(hood)
 if female and not hooded:
  ell(d, hcx - side * 2.0, hcy + 3.0, hrx + 2.2, hry + 3.0, shade(hair, .88))
 elif not hooded:
  ell(d, hcx, hcy - 1.0, hrx + 1.2, hry * 0.75, shade(hair, .9))
 if hooded:
  ell(d, hcx, hcy - 0.8, hrx + 2.6, hry + 1.2, shade(hood, .85))
 ell(d, hcx, hcy, hrx, hry, skin)
 if hooded:
  ell(d, hcx - side * (hrx + 1.2), hcy + 2.5, 2.0, 4.2, hood)
  ell(d, hcx + side * (hrx + 1.2), hcy + 2.5, 2.0, 4.2, hood)
 if face > .85:
  ex = side * 2.4
  if hooded:
   ell(d, hcx, hcy - hry * 0.66, hrx + 1.6, hry * 0.42, hood)
   ell(d, hcx, hcy - hry * 0.62, hrx + 0.4, hry * 0.2, shade(hood, 1.25))
  else:
   fringe(d, hcx, hcy, hrx, hry, hair, hair_hi, side, female)
  for s in (-1, 1):
   ell(d, hcx + ex + s * 2.4, hcy + .9, 2.0, 2.7, (255, 255, 255, 255))
   ell(d, hcx + ex + s * 2.4, hcy + 1.3, 1.3, 1.9, (30, 32, 48, 255))
   ell(d, hcx + ex + s * 2.4 - .4, hcy + .4, .7, .7, (255, 255, 255, 255))
  ell(d, hcx + ex, hcy + 4.9, 1.4, .7, (178, 108, 98, 255))
  if mask:
   ell(d, hcx + ex, hcy + 3.4, hrx - 0.6, hry * 0.4, mask)
   ell(d, hcx + ex - 2.2, hcy + 1.6, 1.5, 1.0, (255, 232, 120, 255))
   ell(d, hcx + ex + 2.2, hcy + 1.6, 1.5, 1.0, (255, 232, 120, 255))
  elif hooded:
   pass
  else:
   ell(d, hcx - side * (hrx - .5), hcy + 1.2, 1.1, 1.8, hair)
 elif face < -.5:
  if hooded:
   ell(d, hcx, hcy - .6, hrx + 2.0, hry + 1.0, hood)
   ell(d, hcx - side * 1.0, hcy + hry * .7, hrx * .5, hry * .42,
    shade(hood, .9))
  else:
   ell(d, hcx, hcy - .6, hrx + 1.4, hry + .6, hair)
   ell(d, hcx - side * 1.0, hcy + hry * .75, hrx * .5, hry * .4, hair)
   poly(d, [(hcx - 2.5, hcy + hry * .9), (hcx + 2.5, hcy + hry * .9),
    (hcx + side, hcy + hry * 1.5)], shade(hair, .85))
 else:
  sg = 1 if side >= 0 else -1
  cap, caphi = (hood, shade(hood, 1.25)) if hooded else (hair, hair_hi)
  ell(d, hcx - sg * 1.5, hcy - 0.5, hrx + 1.4, hry + 0.6, cap)
  ell(d, hcx + sg * 1.0, hcy + 0.2, hrx * 0.78, hry * 0.9, skin)
  ell(d, hcx - sg * 0.5, hcy - hry * 0.58, hrx + 1.0, hry * 0.5, cap)
  ell(d, hcx - sg * 1.2, hcy - hry * 0.66, hrx * 0.42, hry * 0.16, caphi)
  if mask:
   ell(d, hcx + sg * 1.6, hcy + 3.0, 2.6, 2.0, mask)
  if not hooded:
   for i in range(3):
    fx = hcx + sg * (hrx * 0.1 + i * 1.8)
    poly(d, [(fx - 1.8, hcy - hry * 0.5), (fx + 1.8, hcy - hry * 0.5),
     (fx + sg * 0.8, hcy - hry * 0.5 + hry * 0.55)], hair)
  ell(d, hcx + sg * 4.1, hcy + 0.9, 1.9, 2.6, (255, 255, 255, 255))
  ell(d, hcx + sg * 4.1, hcy + 1.3, 1.2, 1.8, (30, 32, 48, 255))
  ell(d, hcx + sg * 3.7, hcy + 0.4, 0.65, 0.65, (255, 255, 255, 255))
 hd2 = j('hand', 1)
 wx, wy, _ = proj(hd2[0] + lean, hd2[1], hd2[2], a, bob)
 wang = (-0.7 - swing * 1.4) if kind == 2 else (-0.62 + P['sw'] * .45)
 if kind == 2 and fr in (1, 2):
  slash_arc(d, wx, wy, wang + math.pi * .5, 1.0, .9 if fr == 2 else .5)
 draw_weapon(d, wx, wy, wang, spec['wt'], metal, swing if kind == 2 else 0.0)
 return outline(im)


