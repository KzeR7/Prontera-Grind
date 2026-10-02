from PIL import Image
b = Image.open('assets/herobody_thief_m.png')
h = Image.open('assets/herohead_spiky_m.png')
comp = Image.new('RGBA', (64 * 8, 96 * 2), (20, 20, 30, 255))
for d in range(8):
    c = b.crop((d * 64, 0, d * 64 + 64, 96)).copy()
    c.alpha_composite(h.crop((d * 64, 0, d * 64 + 64, 96)))
    comp.alpha_composite(c, (d * 64, 0))
    c2 = b.crop((d * 64, 2 * 96, d * 64 + 64, 3 * 96)).copy()
    c2.alpha_composite(h.crop((d * 64, 2 * 96, d * 64 + 64, 3 * 96)))
    comp.alpha_composite(c2, (d * 64, 96))
comp.save('assets/_preview_layered_thief.png')
print('composite preview saved', comp.size)
