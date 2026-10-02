"""The player-character sprite renderer (male/female, back view, class looks)."""
import math
from spr_core import cell, ell, limb3, outline, poly, proj, shade
from spr_pose import pose, draw_weapon, slash_arc

SKIN_M, SKIN_F = '#f0c49a', '#f6cfae'

HERO_SPECS = {
    # --- RO-mobile novice: cream shirt + red vest, blue jeans, big brown boots ---
    'nov_m': dict(label='Novice (male)', wt='dagger', skin=SKIN_M, hair='#6a4a28',
                  cloth='#f4ead0', vest='#d84a3a', straps='#7a4a22',
                  pants='#4a6ab0', boot='#7a4a22', glove='#e8c890', metal='#e8ecf4'),
    'nov_f': dict(label='Novice (female)', wt='dagger', skin=SKIN_F, hair='#e8905a',
                  cloth='#f8eed8', vest='#e85a4a', straps='#7a4a22',
                  pants='#5a7ac0', boot='#7a4a22', glove='#e8c890', metal='#e8ecf4',
                  longhair=True, shw=7.0, hipw=7.0),
    # --- RO thief: green bandana hood + dark-green coat, fingerless red gloves ---
    'thief_m': dict(label='Thief (male)', wt='dagger', skin=SKIN_M, hair='#3a2a18',
                    cloth='#5aaa4a', vest='#3a7a34', straps='#2e5a28', pants='#3c4a30',
                    boot='#5a3a20', glove='#c04a3a', metal='#d8dce8',
                    hood='#4a9a3e', cape='#2e6a28'),
    'thief_f': dict(label='Thief (female)', wt='dagger', skin=SKIN_F, hair='#c07030',
                    cloth='#5aaa4a', vest='#3a7a34', straps='#2e5a28', pants='#3c4a30',
                    boot='#5a3a20', glove='#c04a3a', metal='#d8dce8',
                    hood='#4a9a3e', cape='#2e6a28',
                    longhair=True, shw=7.0, hipw=7.0),
    # --- RO assassin: purple-black bodysuit, red mask scarf, twin katars ---
    'assassin_m': dict(label='Assassin (male)', wt='katar', skin=SKIN_M, hair='#28282e',
                       cloth='#5a4a8a', vest='#3c3468', straps='#8a7aba', pants='#34345c',
                       boot='#2c2c44', glove='#6a5aaa', metal='#d8dcf0',
                       hood='#463e78', cape='#332e5c', mask='#c03a3a'),
    'assassin_f': dict(label='Assassin (female)', wt='katar', skin=SKIN_F, hair='#8a4a6a',
                       cloth='#5a4a8a', vest='#3c3468', straps='#8a7aba', pants='#34345c',
                       boot='#2c2c44', glove='#6a5aaa', metal='#d8dcf0',
                       hood='#463e78', cape='#332e5c', mask='#c03a3a',
                       longhair=True, shw=7.0, hipw=7.0),
    # --- RO assassin cross: darker + gold trim, crimson-lined black cape ---
    'xcross_m': dict(label='Assassin Cross (male)', wt='katar', skin=SKIN_M, hair='#1a1a22',
                     cloth='#3e3e6e', vest='#2a2a4e', straps='#c0a040', pants='#26263e',
                     boot='#22223a', glove='#4e4e7e', metal='#f2f4ff',
                     hood='#2e2e58', cape='#1c1c30', mask='#e03a3a'),
    'xcross_f': dict(label='Assassin Cross (female)', wt='katar', skin=SKIN_F, hair='#5a3a5a',
                     cloth='#3e3e6e', vest='#2a2a4e', straps='#c0a040', pants='#26263e',
                     boot='#22223a', glove='#4e4e7e', metal='#f2f4ff',
                     hood='#2e2e58', cape='#1c1c30', mask='#e03a3a',
                     longhair=True, shw=7.0, hipw=7.0),
}

COL_KEYS = ('skin', 'hair', 'cloth', 'vest', 'straps', 'pants', 'boot', 'glove',
            'metal', 'hood', 'cape', 'mask')


def prep(spec):
    """Resolve hex strings in a spec to rgba tuples."""
    s = dict(spec)
    for k in COL_KEYS:
        if isinstance(s.get(k), str):
            h = s[k].lstrip('#')
            s[k] = (int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16), 255)
    return s


# Head styles for the layered system. Each style draws a full head in every
# direction (same 8-dir x 10-row layout as bodies) with a transparent neck
# area so it sits on any headless body. Original art only.
HEAD_SPECS = {
    'spiky_m': dict(label='Spiky short hair (male)', skin='#f0c49a',
                    hair='#b82828', hair_hi='#e05848'),
    'ponytail_f': dict(label='Ponytail (female)', skin='#f6cfae',
                       hair='#4a2c1c', hair_hi='#7a4c34', longhair=True),
    'bowl_m': dict(label='Bowl cut (male)', skin='#f0c49a',
                   hair='#5a3a20', hair_hi='#8a6238'),
    'long_f': dict(label='Long straight (female)', skin='#f6cfae',
                   hair='#e07a3a', hair_hi='#f2a86a', longhair=True),
}

HEAD_COL_KEYS = ('skin', 'hair', 'hair_hi')


def prep_head(spec):
    """Resolve hex strings in a head spec to rgba tuples."""
    s = dict(spec)
    for k in HEAD_COL_KEYS:
        if isinstance(s.get(k), str):
            h = s[k].lstrip('#')
            s[k] = (int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16), 255)
    return s


def draw_head(raw, dir_i, kind, fr):
    """Render one 64x96 head cell (transparent everywhere but the head)."""
    from spr_pose import pose
    spec = raw if isinstance(raw.get('skin'), tuple) else prep_head(raw)
    im, d = cell()
    a = dir_i * math.pi / 4
    face = math.cos(a)
    side = math.sin(a)
    P = pose(kind, fr, 'dagger')
    bob, lean = P['bob'], P['lean']
    female = bool(spec.get('longhair'))
    skin, hair, hair_hi = spec['skin'], spec['hair'], spec['hair_hi']
    hd = P['head']
    hcx, hcy, _ = proj(hd[0] + lean, hd[1] + 1.5, 0, a, bob)
    hrx, hry = 7.2, 8.6
    if female:
        ell(d, hcx - side * 2.0, hcy + 3.0, hrx + 2.2, hry + 3.0,
            shade(hair, .88))
        ell(d, hcx - side * 3.4, hcy + 8.0, 2.6, 5.4, hair)
    else:
        ell(d, hcx, hcy - 1.0, hrx + 1.2, hry * 0.75, shade(hair, .9))
    ell(d, hcx, hcy, hrx, hry, skin)
    if face > .85:
        ex = side * 2.4
        for i in range(5):
            fx = hcx - hrx * 0.8 + i * (hrx * 1.6 / 4)
            fl = hry * (0.55 + (0.25 if i % 2 == 0 else 0.0))
            poly(d, [(fx - 2.2, hcy - hry * 0.55),
                     (fx + 2.2, hcy - hry * 0.55),
                     (fx + side * 1.2, hcy - hry * 0.55 + fl)], hair)
        ell(d, hcx - hrx * 0.25, hcy - hry * 0.62, hrx * 0.5, hry * 0.22,
            hair_hi)
        for s in (-1, 1):
            ell(d, hcx + ex + s * 2.4, hcy + .9, 2.0, 2.7,
                (255, 255, 255, 255))
            ell(d, hcx + ex + s * 2.4, hcy + 1.3, 1.3, 1.9, (30, 32, 48, 255))
            ell(d, hcx + ex + s * 2.4 - .4, hcy + .4, .7, .7,
                (255, 255, 255, 255))
        ell(d, hcx + ex, hcy + 4.9, 1.4, .7, (178, 108, 98, 255))
    elif face < -.5:
        ell(d, hcx, hcy - .6, hrx + 1.4, hry + .6, hair)
        if female:
            ell(d, hcx - side * 2.2, hcy + 5.0, 3.4, 6.4, hair)
        else:
            ell(d, hcx - side, hcy + 3.0, hrx * .7, hry * .55,
                shade(hair, .85))
    else:
        sg = 1 if side >= 0 else -1
        ell(d, hcx - sg * 1.5, hcy - 0.5, hrx + 1.4, hry + 0.6, hair)
        ell(d, hcx + sg * 1.0, hcy + 0.2, hrx * 0.78, hry * 0.9, skin)
        ell(d, hcx - sg * 0.5, hcy - hry * 0.58, hrx + 1.0, hry * 0.5, hair)
        ell(d, hcx - sg * 1.2, hcy - hry * 0.66, hrx * 0.42, hry * 0.16,
            hair_hi)
        ell(d, hcx + sg * 4.1, hcy + 0.9, 1.9, 2.6, (255, 255, 255, 255))
        ell(d, hcx + sg * 4.1, hcy + 1.3, 1.2, 1.8, (30, 32, 48, 255))
        ell(d, hcx + sg * 3.7, hcy + 0.4, 0.65, 0.65, (255, 255, 255, 255))
    return outline(im)


def draw_human(raw, dir_i, kind, fr):
    """Render one 64x96 character cell (headless when spec has headless=True)."""
    spec = raw if isinstance(raw.get('skin'), tuple) else prep(raw)
    headless = bool(spec.get('headless'))
    im, d = cell()
    a = dir_i * math.pi / 4
    face = math.cos(a)                 #  1 = facing camera, -1 = facing away
    side = math.sin(a)                 # >0 = body turned to screen right
    P = pose(kind, fr, spec['wt'])
    bob, swing, lean = P['bob'], P['swing'], P['lean']
    near = 1 if side >= 0 else -1       # limb nearer the camera

    skin, cloth, pants = spec['skin'], spec['cloth'], spec['pants']
    boot, hair = spec['boot'], spec['hair']
    glove = spec.get('glove', (196, 140, 58, 255))
    metal = spec.get('metal', (206, 208, 216, 255))
    sleeve = spec.get('sleeve', shade(cloth, .92))

    def pr(x, y, z=0.0):
        return proj(x + lean * (1 if z == 0 else 0), y, z, a, bob)

    def j(name, s):
        return P[name + ('1' if s > 0 else '-1')]

    if spec.get('cape'):
        cp = spec['cape']
        poly(d, [pr(-7.4, 44, -3.5)[:2], pr(7.4, 44, -3.5)[:2],
                 pr(10.5, 25, -7)[:2], pr(-10.5, 25, -7)[:2]], shade(cp, .84))
        poly(d, [pr(-7.4, 44, -3.4)[:2], pr(7.4, 44, -3.4)[:2],
                 pr(9, 33, -6.2)[:2], pr(-9, 33, -6.2)[:2]], cp)

    for s in (near, -near):                            # legs, far side first
        k, f = j('knee', s), j('foot', s)
        limb3(d, (5.4 * s, 29, 0), k, 5.4, pants, False, a, bob)
        limb3(d, k, (f[0], f[1] + 3, f[2]), 5.0, shade(boot, .86), True, a, bob)
        limb3(d, (k[0], k[1] + 1, k[2]), (f[0], f[1] + 3.5, f[2]), 4.0, boot, True, a, bob)

    shw, hipw = spec.get('shw', 7.8), spec.get('hipw', 6.6)          # torso
    poly(d, [pr(-shw, 44)[:2], pr(shw, 44)[:2], pr(hipw, 28)[:2], pr(-hipw, 28)[:2]], cloth)
    poly(d, [pr(-shw, 44, .1)[:2], pr(shw * .3, 44, .1)[:2],
             pr(hipw * .3, 28, .1)[:2], pr(-hipw, 28, .1)[:2]], shade(cloth, 1.16))
    poly(d, [pr(-hipw, 28, .1)[:2], pr(hipw, 28, .1)[:2],
             pr(hipw, 25, .1)[:2], pr(-hipw, 25, .1)[:2]], shade(cloth, .6))
    if spec.get('vest'):
        poly(d, [pr(-shw * .85, 43, .2)[:2], pr(shw * .85, 43, .2)[:2],
                 pr(hipw * .8, 32, .2)[:2], pr(-hipw * .8, 32, .2)[:2]], spec['vest'])
    if spec.get('straps'):
        poly(d, [pr(-shw * .9, 44, .3)[:2], pr(-shw * .25, 44, .3)[:2],
                 pr(hipw * .25, 30, .3)[:2], pr(-hipw * .25, 30, .3)[:2]], spec['straps'])

    for s in (near, -near):                            # arms, far side first
        sh, el, hd = (s * shw * .9, 43, 0), j('elb', s), j('hand', s)
        limb3(d, sh, el, 5.4, skin, True, a, bob)
        limb3(d, el, hd, 4.8, skin, True, a, bob)
        limb3(d, sh, (el[0], el[1] + 1, el[2]), 6.4, sleeve, True, a, bob)
        limb3(d, (hd[0], hd[1], hd[2]), (hd[0], hd[1] - 2.5, hd[2]), 5.4, glove, True, a, bob)

    hd = P['head']                                     # head
    if headless:
        hd2 = j('hand', 1)                             # weapon only
        wx, wy, _ = proj(hd2[0] + lean, hd2[1], hd2[2], a, bob)
        wang = (-0.7 - swing * 1.4) if kind == 2 else (-0.62 + P['sw'] * .45)
        if kind == 2 and spec['wt'] != 'bow' and fr in (1, 2):
            slash_arc(d, wx, wy, wang + math.pi * .5, 1.0, .9 if fr == 2 else .5)
        draw_weapon(d, wx, wy, wang, spec['wt'], metal, swing if kind == 2 else 0.0)
        return outline(im)
    hcx, hcy, _ = proj(hd[0] + lean, hd[1], 0, a, bob)
    hrx, hry = 6.6, 7.4
    hood = spec.get('hood')
    if spec.get('longhair'):                           # hair mass behind
        ell(d, hcx - side * 1.6, hcy + 3.4, hrx + 1.8, hry + 2.6, shade(hair, .86))
        ell(d, hcx - side * 4.2, hcy + 9.0, 2.6, 5.2, shade(hair, .9))
    if hood:                                          # hood shell behind head
        ell(d, hcx, hcy - .6, hrx + 2.4, hry + 1.0, shade(hood, .88))
    ell(d, hcx, hcy, hrx, hry, skin)
    if face > .3:                                      # face, when visible
        ex = side * 2.2
        if not hood:                                   # brows for bare faces
            ell(d, hcx, hcy - hry * .58, hrx + .8, hry * .5, hair)
            ell(d, hcx - side * 2.9, hcy + 1.4, 1.8, hry * .6, hair)
        ell(d, hcx + ex - 2.1, hcy + .2, 1.5, 1.9, (28, 22, 18, 255))
        ell(d, hcx + ex + 2.1, hcy + .2, 1.5, 1.9, (28, 22, 18, 255))
        ell(d, hcx + ex - 2.4, hcy - .5, .6, .6, (255, 255, 255, 255))
        ell(d, hcx + ex + 1.8, hcy - .5, .6, .6, (255, 255, 255, 255))
        ell(d, hcx + ex, hcy + 3.6, 1.5, .7, (178, 108, 98, 255))
    else:                                              # back of the head
        ell(d, hcx, hcy - hry * .16, hrx * .96, hry * .86, hair)
        ell(d, hcx - side * 2.2, hcy + 4.4, hrx * .55, hry * .5, shade(hair, .9))
    if hood:                                          # hood front: brim + crown
        ell(d, hcx, hcy - hry * .74, hrx + 2.2, hry * .40, hood)
        ell(d, hcx - side * (hrx + .6), hcy - 1.2, 2.4, hry * .8, shade(hood, .94))
        ell(d, hcx + side * (hrx + .6), hcy - 1.2, 2.4, hry * .8, shade(hood, .94))
        ell(d, hcx, hcy - hry * .70, hrx + .6, hry * .22, shade(hood, 1.22))
    if spec.get('mask'):
        ell(d, hcx, hcy + hry * .40, hrx - .5, hry * .46, spec['mask'])
        ell(d, hcx, hcy + hry * .30, hrx - .5, hry * .22, shade(spec['mask'], 1.25))
        if face > .3:                                  # glowing eyes on the mask
            gx = side * 1.8
            ell(d, hcx + gx - 2.2, hcy + hry * .12, 1.6, 1.1, (255, 232, 120, 255))
            ell(d, hcx + gx + 2.2, hcy + hry * .12, 1.6, 1.1, (255, 232, 120, 255))

    hd2 = j('hand', 1)                                 # weapon
    wx, wy, _ = proj(hd2[0] + lean, hd2[1], hd2[2], a, bob)
    wang = (-0.7 - swing * 1.4) if kind == 2 else (-0.62 + P['sw'] * .45)
    if kind == 2 and spec['wt'] != 'bow' and fr in (1, 2):
        slash_arc(d, wx, wy, wang + math.pi * .5, 1.0, .9 if fr == 2 else .5)
    draw_weapon(d, wx, wy, wang, spec['wt'], metal, swing if kind == 2 else 0.0)
    return outline(im)