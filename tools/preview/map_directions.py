#!/usr/bin/env python3
"""Render proposal-only map layouts using the shipped terrain and scenery crops.
Usage: python tools/preview/map_directions.py /path/to/output/map-directions
Requires Pillow. Does not modify gameplay maps or source artwork.
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont, ImageFilter
import json, random, math, sys, html
ROOT=Path(__file__).resolve().parents[2]
OUT=Path(sys.argv[1]);OUT.mkdir(parents=True,exist_ok=True)
kit=json.loads((ROOT/'assets/kit/ro-spritesheet.json').read_text())
hd=json.loads((ROOT/'assets/kit/ro-tiles-hd.json').read_text())
atlas=Image.open(ROOT/'assets/kit/ro-spritesheet.png').convert('RGBA')
terrain=Image.open(ROOT/'assets/kit/ro-tiles-hd.png').convert('RGBA')
W,H=960,640
# Every biome retains its own terrain, vegetation and recognisable landmark.
BIOMES=[
 ('Prontera','grass_olive','dirt_path','water_frame_0',['tree_round_medium','tree_ancient_large','house_prontera','bush_cluster'],'Market gardens and old city roads'),
 ('Izlude','sand','limestone_pale','water_frame_0',['palm_1','palm_2','pier_post','boulder_round'],'Harbour walks and island coves'),
 ('Geffen','grass_geffen','ruin_cobble','water_dark_0',['tower_geffen','tree_dark_gnarled','crystal_cluster','standing_stone'],'Arcane courtyards and tower groves'),
 ('Morroc','sand_gold','sand_dark','water_frame_0',['cactus_1','cactus_2','ruin_pillar','ruin_arch'],'Caravan trails and sandstone ruins'),
 ('Payon','grass_forest','dirt_payon','water_frame_0',['tree_ancient_large','tree_round_medium','shrine_stone','bamboo_grove'],'Woodland shrines and winding streams'),
 ('Comodo','sand','rock_abyss','water_dark_0',['palm_3','boulder_round','stalagmite','crystal_cluster'],'Tidal caves and tropical shores'),
 ('Louyang','grass_jade','limestone_pale','paddy_water',['bamboo_grove','shrine_stone','lantern_stone','boulder_round'],'Terraced gardens and stone lanterns'),
 ('Amatsu','grass_blossom','ruin_cobble','water_frame_0',['tree_cherry','torii_gate','lantern_stone','bamboo_grove'],'Sakura avenues and shrine crossings'),
 ('Niflheim','waste_nifl','ruin_cobble','water_dark_0',['tree_dead','tree_dark_gnarled','tombstone','house_ruin'],'Broken lanes and haunted graveyards'),
 ('Abyss','rock_abyss','ruin_cobble','water_dark_0',['crystal_cluster','stalagmite','standing_stone','ruin_pillar'],'Crystal chasms and lost sanctuaries'),
]
# Resolve the actual atlas names rather than inventing replacements.
print('Sprites:', ', '.join(kit['sprites']))
ALIASES={'tree_round_medium':'tree_ancient_variant','bush_cluster':'tree_bush_bright','boulder_round':'rock_boulder_mossy','palm_1':'palm_tall','palm_2':'palm_double','palm_3':'palm_giant','cactus_1':'cactus_flower','cactus_2':'cactus_small','ruin_pillar':'pillar_broken','ruin_arch':'ruin_wall'}
def prop_name(n):
 if n in kit['sprites']:return n
 if ALIASES.get(n) in kit['sprites']:return ALIASES[n]
 # Called only for optional dressing, never replace a biome landmark.
 return next(k for k in kit['sprites'] if n.split('_')[0] in k)
def crop(name,kind='tiles'):
 src=terrain if kind=='tiles' and name in hd['tiles'] else atlas
 e=(hd['tiles'] if src is terrain else kit[kind])[name]
 return src.crop((e['x'],e['y'],e['x']+e['w'],e['y']+e['h']))
def tiled(name):
 tile=crop(name).resize((128,128),Image.Resampling.LANCZOS)
 im=Image.new('RGBA',(W,H))
 for y in range(0,H,128):
  for x in range(0,W,128):im.paste(tile,(x,y))
 return im
def layer(im,name,paint):
 mask=Image.new('L',(W,H));paint(ImageDraw.Draw(mask));im.paste(tiled(name),(0,0),mask.filter(ImageFilter.GaussianBlur(1.5)))
def sprite(im,name,x,y,scale=1):
 name=prop_name(name);e=kit['sprites'][name];art=crop(name,'sprites')
 scale=min(scale,1.25);art=art.resize((round(art.width*scale),round(art.height*scale)),Image.Resampling.NEAREST)
 im.alpha_composite(art,(round(x-e.get('anchorX',e['w']/2)*scale),round(y-e.get('anchorY',e['h'])*scale)))
DIRECTIONS=[('a','Garden trails','Winding roads, lush edges, three clear combat glades.','Best fit for the existing RO countryside.'),('b','Ancient courtyards','Stone plazas, landmark clusters, structured paths.','Strongest map identity and clearest combat spaces.'),('c','Waterside journeys','Curved shorelines, bridge crossings, framed vistas.','Most scenic; needs careful shoreline collision checks.')]
for m,(name,base,path,water,props,tag) in enumerate(BIOMES):
 for v,(key,title,desc,note) in enumerate(DIRECTIONS):
  rng=random.Random(7100+m*31+v);im=tiled(base)
  # Large continuous shapes avoid checkerboard noise. Paths use existing material crops.
  if v==0:
   line=[(440+int(95*math.sin(y/135)),y) for y in range(-40,H+50,12)]
   layer(im,path,lambda d:d.line(line,fill=255,width=92,joint="curve"))
   for x,y in [(390,160),(515,335),(400,530)]:layer(im,path,lambda d,x=x,y=y:d.ellipse((x-90,y-53,x+90,y+53),fill=255))
   layer(im,water,lambda d:d.ellipse((-110,220,210,560),fill=255))
  elif v==1:
   layer(im,path,lambda d:d.line([(480,0),(480,H)],fill=255,width=105))
   for cy in (170,455):
    layer(im,'ruin_cobble',lambda d,cy=cy:d.rounded_rectangle((280,cy-85,670,cy+85),radius=35,fill=255))
   layer(im,path,lambda d:d.line([(0,335),(W,335)],fill=255,width=70))
   layer(im,water,lambda d:d.rounded_rectangle((760,90,925,245),radius=50,fill=255))
  else:
   river=[(250+int(100*math.sin(y/130)),y) for y in range(-40,H+50,10)]
   layer(im,'riverbank_wall',lambda d:d.line(river,fill=255,width=160,joint="curve"))
   layer(im,water,lambda d:d.line(river,fill=255,width=132,joint="curve"))
   pathline=[(550+int(75*math.sin(y/130)),y) for y in range(-40,H+50,12)]
   layer(im,path,lambda d:d.line(pathline,fill=255,width=125,joint="curve"))
   layer(im,path,lambda d:d.ellipse((435,235,755,430),fill=255))
   layer(im,'bridge_red' if m==7 else 'bridge_planks',lambda d:d.rectangle((140,290,470,345),fill=255))
  dressing=[]
  # Keep the middle legible; depth comes from overlapping edge clusters.
  for side in (0,1):
   for i in range(15):
    x=rng.randint(-20,200) if side==0 else rng.randint(770,990)
    y=rng.randint(35,740)
    if v==2 and side==0:x-=60
    if (v==0 and side==0 and 220<y<570) or (v==1 and side==1 and 80<y<260) or (v==2 and abs(x-(250+100*math.sin(y/130)))<110):continue
    vegetation=[props[0],props[1]] if m not in (2,7,9) else ([props[1],'tree_bush_bright'] if m==2 else ['tree_cherry','bamboo_grove'] if m==7 else ['stalagmite','crystal_cluster'])
    dressing.append((y,vegetation[i%2],x,rng.uniform(.45,.7)))
  # Landmarks are deliberate, off the traversable center.
  landmark=props[2] if m not in (2,7,9) else props[0 if m in (2,9) else 1]
  dressing.extend([(195,landmark,690,.85),(485,props[3],735,.65),(610,props[0],130,.9)])
  for y,p,x,scale in sorted(dressing):sprite(im,p,x,y,scale)
  im.convert('RGB').save(OUT/f'{key}-{m}.jpg',quality=94,subsampling=0)
# Self-contained HTML references only sibling rendered images; no application integration.
opts=''.join(f'<option value="{m}">{name}</option>' for m,(name,*_) in enumerate(BIOMES))
cards=''.join(f'<article><span>OPTION {key.upper()}</span><h2>{title}</h2><img id="{key}" src="{key}-0.jpg" alt="{title} — Prontera layout concept"><p>{desc}</p><small>{note}</small></article>' for key,title,desc,note in DIRECTIONS)
page='''<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Midgard — map directions</title><style>
*{box-sizing:border-box}body{margin:0;background:#101b27;color:#e8edf4;font:15px system-ui}main{max-width:1680px;margin:auto;padding:40px 28px}header{display:flex;align-items:center;justify-content:space-between;gap:20px;margin-bottom:32px}h1{font-size:clamp(28px,4vw,48px);font-weight:500;margin:8px 0}p{line-height:1.6;color:#bec8d1}small{color:#8a9bab;line-height:1.6}span{font-size:11px;letter-spacing:2px;color:#d7b77a}select{font:inherit;background:#1b2834;color:#e8edf4;padding:12px;border:1px solid #d7b77a;border-radius:7px}section{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:18px}article{background:#131d29;padding:18px;border:1px solid #ffffff26;border-radius:10px}h2{font-size:23px;font-weight:500}img{width:100%;height:auto;border-radius:5px;cursor:zoom-in}footer{margin-top:25px;max-width:900px}a{color:#d7b77a}@media(max-width:900px){section{grid-template-columns:1fr}header{display:block}}
</style><main><header><div><span>PRONTERA GRIND / MAP STUDIES</span><h1>A more detailed Midgard.</h1><p>Three layout directions. Ten distinct biomes. Your existing fantasy art.</p></div><label>Explore a map <select id="map">OPTIONS</select></label></header><section>CARDS</section><footer><p><b>Suggested direction: A with B's landmarks.</b> Keep the countryside warmth, give each map a recognisable destination, and retain clear ground around fights.</p><small>Proposal renders, not live gameplay. These use the shipped high-resolution terrain and original scenery crops; no character or scenery art is repainted. All ten maps are included. Final implementation would preserve walkable combat areas, add terrain transitions and validate camera, depth sorting and phone performance. Click an image for its full-size study.</small></footer></main><script>
const names=NAMES;document.querySelector('#map').onchange=e=>{for(const id of ['a','b','c']){const im=document.getElementById(id);im.src=id+'-'+e.target.value+'.jpg';im.alt=names[e.target.value]+' — option '+id.toUpperCase()}};document.querySelectorAll('img').forEach(im=>im.onclick=()=>window.open(im.src,'_blank','noopener'));
</script></html>'''.replace('OPTIONS',opts).replace('CARDS',cards).replace('NAMES',json.dumps([b[0] for b in BIOMES]))
(OUT/'index.html').write_text(page)
# A concise visual comparison for chat, using the same actual concept renders.
font='/usr/share/fonts/dejavu-sans-fonts/DejaVuSans.ttf'
try:f=ImageFont.truetype(font,25);small=ImageFont.truetype(font,17)
except OSError:f=small=ImageFont.load_default()
board=Image.new('RGB',(1500,1190),'#101b27');d=ImageDraw.Draw(board)
d.text((28,22),'MIDGARD / THREE MAP DIRECTIONS',font=f,fill='#e8edf4')
for v,(key,title,*_) in enumerate(DIRECTIONS):d.text((v*500+18,76),key.upper()+' / '+title,font=f,fill='#d7b77a')
for row,m in enumerate((0,3,7)):
 for v,(key,*_) in enumerate(DIRECTIONS):
  im=Image.open(OUT/f'{key}-{m}.jpg').resize((476,317),Image.Resampling.LANCZOS);x=v*500+12;y=125+row*352;board.paste(im,(x,y));d.text((x+5,y+322),BIOMES[m][0],font=small,fill='#bec8d1')
board.save(OUT/'comparison.jpg',quality=93)
print('Rendered 30 map studies and gallery to',OUT)
