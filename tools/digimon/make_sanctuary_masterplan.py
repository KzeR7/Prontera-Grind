#!/usr/bin/env python3
"""Compose a documented, non-runtime layout concept using a v328 scene capture."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
import math,textwrap
ROOT=Path(__file__).resolve().parents[2]
P=ROOT/'docs/proposals'
base=Image.open(P/'sanctuary-current-overhead.png').convert('RGBA')
art=Image.open(P/'sanctuary-world-art-concept.png').convert('RGB')
W,H=2400,1640
im=Image.new('RGB',(W,H),'#101f23');d=ImageDraw.Draw(im)
font='/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf';bold='/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf';serif='/usr/share/fonts/truetype/dejavu/DejaVuSerif.ttf'
def F(size,path=font):return ImageFont.truetype(path,size)
def txt(x,y,s,size=22,color='#d9e5df',path=font):d.text((x,y),s,font=F(size,path),fill=color)
def wrap(x,y,s,width=54,size=22,color='#c0d1c8',step=32):
 for line in textwrap.wrap(s,width=width,break_long_words=False):txt(x,y,line,size,color);y+=step
 return y
# Header.
d.rectangle((0,0,W,143),fill='#162b2d');d.line((0,142,W,142),fill='#527164',width=2)
txt(52,25,'SANCTUARY  /  MASTER PLAN',19,'#d3ba7b',bold)
txt(52,55,'A living Sanctuary in Fountain Plaza',42,'#f2f1dd',serif)
txt(1455,39,'CONCEPT FOR REVIEW',22,'#dfc987',bold)
txt(1455,73,'Layout proposal, not live gameplay',20,'#aac0b4')
# The game view is a captured, north-up debug camera; proposed marks are separate overlays.
scale=.90;mx,my=48,171
base=base.resize((round(base.width*scale),round(base.height*scale)),Image.Resampling.LANCZOS)
im.paste(base,(mx,my),base);d=ImageDraw.Draw(im)
ox,oy=mx+725*scale,my+665.5*scale;ppu=8.44278536*scale
def pt(x,z):return (round(ox+x*ppu),round(oy+z*ppu))
def box(x1,z1,x2,z2):
 a,b=pt(x1,z1),pt(x2,z2);return [a[0],a[1],b[0],b[1]]
# Draw onto a transparent layer so the actual existing map is visible under the plan.
overlay=Image.new('RGBA',(W,H));o=ImageDraw.Draw(overlay)
# Proposal: enlarged lake, gym, field, ring. Exact sizes are suggestions.
o.rounded_rectangle(box(-60,29.5,-14,57),radius=45,fill=(40,134,154,222),outline=(174,235,225,255),width=5)
# Deck intentionally spans from dry land to dry land across the lake.
o.rounded_rectangle(box(-62,41.2,-12,44.8),radius=7,fill=(143,92,53,255),outline=(248,221,165,255),width=3)
for x in range(-59,-12,3):
 p=pt(x,41.3);q=pt(x,44.7);o.line((p,q),fill=(234,201,151,210),width=1)
o.line((pt(-62,41),pt(-12,41)),fill=(251,226,174,255),width=3);o.line((pt(-62,45),pt(-12,45)),fill=(251,226,174,255),width=3)
# A new lake approach to central avenue.
o.line((pt(-12,43),pt(-9,43)),fill=(226,211,173,235),width=9)
# East areas: top-down symbols, not completed art.
o.rounded_rectangle(box(37,-35,70,-12),radius=20,fill=(100,70,49,228),outline=(241,200,134,255),width=4)
o.rounded_rectangle(box(34,12,70,42),radius=26,fill=(62,127,78,220),outline=(191,228,155,255),width=4)
o.rounded_rectangle(box(40,49,69,72),radius=22,fill=(65,83,78,230),outline=(224,196,128,255),width=4)
# Gym machines, two rows, each station corresponds to one existing example stat.
for x,z in [(39,-30),(53,-30),(39,-21),(53,-21)]:o.rounded_rectangle(box(x,z,x+11,z+6),radius=7,fill=(226,209,174,255),outline=(255,235,195,255),width=2)
# Farm creatures and boss icons on field.
for x,z,r in [(43,23,5),(51,28,5),(59,19,5),(47,35,5)]:
 px,py=pt(x,z);o.ellipse((px-r,py-r,px+r,py+r),fill=(241,235,190,255))
px,py=pt(63,34);o.regular_polygon((px,py,13),n_sides=5,rotation=0,fill=(243,194,116,255))
# Boxing ring, posts and ropes.
o.rounded_rectangle(box(46,53,63,67),radius=5,fill=(224,214,187,255),outline=(247,219,161,255),width=4)
for inset in [.9,1.6]:o.rectangle(box(46+inset,53+inset,63-inset,67-inset),outline=(166,83,73,255),width=2)
for x in [46,63]:
 for z in [53,67]:
  px,py=pt(x,z);o.ellipse((px-6,py-6,px+6,py+6),fill=(101,60,47,255),outline=(255,231,178,255),width=2)
# Existing east water to remove; dashed outline keeps it distinguishable from the proposed field.
a=box(14,35.5,32,48.5);x1,y1,x2,y2=a
for x in range(x1,x2,15):o.line((x,y1,min(x+9,x2),y1),fill=(255,163,139,255),width=3);o.line((x,y2,min(x+9,x2),y2),fill=(255,163,139,255),width=3)
for y in range(y1,y2,15):o.line((x1,y,x1,min(y+9,y2)),fill=(255,163,139,255),width=3);o.line((x2,y,x2,min(y+9,y2)),fill=(255,163,139,255),width=3)
# Circles for the three NPCs; positions are illustrative.
for x,z in [(31,11),(33,-11),(32,17)]:
 px,py=pt(x,z);o.ellipse((px-11,py-11,px+11,py+11),fill=(222,178,95,255),outline=(255,246,211,255),width=3)
im=Image.alpha_composite(im.convert('RGBA'),overlay);d=ImageDraw.Draw(im)
# Readable labels and numbered map keys.
def pill(x,z,label,bg='#18352f',fg='#f7f3de',size=15):
 px,py=pt(x,z);f=F(size,bold);bb=d.textbbox((0,0),label,font=f);w=bb[2]-bb[0]+18;h=bb[3]-bb[1]+12
 d.rounded_rectangle((px,py,px+w,py+h),radius=5,fill=bg,outline='#bed4be',width=1);d.text((px+9,py+4),label,font=f,fill=fg)
def number(x,z,n,color):
 px,py=pt(x,z);r=17;d.ellipse((px-r,py-r,px+r,py+r),fill=color,outline='#fff1d0',width=2);f=F(17,bold);bbox=d.textbbox((0,0),str(n),font=f);d.text((px-(bbox[2]-bbox[0])/2,py-(bbox[3]-bbox[1])/2-2),str(n),font=f,fill='#102523')
number(-57,31,1,'#2b7584');pill(-53,31,'WEST POND',size=15);pill(-48,45.3,'WALKABLE BRIDGE',size=12)
number(37,-33,2,'#805b37');pill(40,-33,'LIVE TRAINING GYM',size=14)
for (x,z,name) in [(39,-30,'POWER'),(53,-30,'GUARD'),(39,-21,'AGILITY'),(53,-21,'FOCUS')]:
 px,py=pt(x+1,z+1.8);d.text((px,py),name,font=F(12,bold),fill='#40362b')
number(37,14,3,'#3d8051');pill(40,14,'AUTO-PVE FIELD',size=14);pill(39,37,'MOBS + BOSSES',size=12)
number(43,51,4,'#8b6940');pill(46,49.5,'PVP BOXING RING',size=13)
# Small guide lines point from the role labels to the three proposed NPC positions.
for start,end in [((26,-11),(31,-11)),((27,11),(29.5,11)),((26,17),(30.5,17))]:d.line((pt(*start),pt(*end)),fill='#f7deb0',width=2)
# Clear the red hatch visually: location of old pond changes, not an extra feature.
pill(14,47,'OLD EAST POND REMOVED',bg='#643d36',size=11)
pill(16,-12,'TRAINER',bg='#68542f',size=10)
pill(14,9.4,'FOOD SELLER',bg='#68542f',size=10)
pill(14,16.3,'PVE GUIDE',bg='#68542f',size=10)
# Small labels outside map, avoiding game-detail overlay.
txt(mx,my+base.height+18,'NORTH UP  ·  CURRENT V328 MAP UNDERLAY  ·  PROPOSED PLACEMENTS',17,'#b5c9bc',bold)
txt(mx,my+base.height+49,'Existing east gym/house areas are replaced; shapes show use and approximate footprint.',17,'#9ab0a4')
# Right side: art concept and detailed key.
rx=1403;rw=944
d.rounded_rectangle((rx,171,rx+rw,1394),radius=16,fill='#192d2d',outline='#526c5f',width=2)
txt(rx+30,196,'DESIGN ATMOSPHERE',16,'#d7c184',bold)
txt(rx+30,222,'Isometric illustration',28,'#f3efe1',serif)
art=art.resize((884,round(884*art.height/art.width)),Image.Resampling.LANCZOS)
im.paste(art,(rx+30,271));d=ImageDraw.Draw(im);artbottom=271+art.height
txt(rx+30,artbottom+12,'AI concept only · not an in-game screenshot or exact map',17,'#a9c0b2')
y=artbottom+57
items=[('01','WEST POND + LONG BRIDGE','One larger fishing pond. The bridge connects both banks; keep access from the plaza.', '#79c7cc'),('02','EAST GYM + NPCs','Four distinct stat stations; food seller, trainer and PvE guide positioned at the paths.', '#e8be80'),('03','GRASSY AUTO-PVE','Open field for live companion battles, ordinary mobs and a larger boss encounter.', '#a8d396'),('04','BOXING RING PVP','Roped square ring with a clear approach and spectator space; separate from PvE.', '#e3bc78')]
for n,title,body,color in items:
 d.rounded_rectangle((rx+30,y,rx+80,y+40),radius=9,fill=color);d.text((rx+38,y+8),n,font=F(18,bold),fill='#15302a');txt(rx+96,y-2,title,19,'#edf0dc',bold);y=wrap(rx+96,y+28,body,67,17,'#b8c9bd',25)+18
# Footer supplies essential honesty and layout consequences.
d.line((48,1450,2350,1450),fill='#4e6b5e',width=2)
txt(50,1477,'WHAT CHANGES',18,'#e1c27f',bold)
txt(50,1510,'Remove the east pond, old east courts and two east houses; move or redesign the west house at the new pond.',20,'#d7e1d6')
txt(50,1542,'The pond footprint also touches the south-west house; resize or move it and review nearby garden / paving.',20,'#d7e1d6')
txt(50,1581,'Keep the central avenues, fountain, castle, poker and fishing. Sizes, paths and exact NPC positions need approval.',18,'#a8beb0')
output=P/'sanctuary-master-plan.png';im.convert('RGB').save(output,optimize=True)
print(output,im.size)
