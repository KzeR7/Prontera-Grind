#!/usr/bin/env python3
"""Export the checked studio, source archive and native artwork contact sheets."""
import argparse
import base64
import json
import os
import zipfile
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont, ImageSequence

ROOT=Path(__file__).resolve().parents[1]
STUDIO=ROOT/'Updates/hair-color-preview'


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output',type=Path,default=Path(os.environ.get('WORKSPACE_ROOT',str(ROOT.parents[3])))/'output/hair-color')
    args=parser.parse_args();out=args.output;out.mkdir(parents=True,exist_ok=True)
    catalog=json.loads((STUDIO/'catalog.json').read_text())
    audit=json.loads((STUDIO/'audit.json').read_text())
    rows={r['key']:r for r in audit['cases']}
    summary=json.loads((STUDIO/'validation-summary.json').read_text())
    if summary['cachedLooks']!=len(rows) or any(r['status']!='pass' for r in rows.values()):
        raise SystemExit('Run the asset checks successfully before exporting')
    fontdir=Path('/usr/share/fonts/dejavu-sans-fonts')
    def label(draw,xy,text,size=18,color='#e5edef',bold=False):
        font=ImageFont.truetype(str(fontdir/('DejaVuSans-Bold.ttf' if bold else 'DejaVuSans.ttf')),size)
        draw.text(xy,text,font=font,fill=color)
    def actor(board,key,cx,bottom,max_width,max_height):
        with Image.open(STUDIO/'art'/(key+'-still.png')) as source:
            art=source.convert('RGBA');art=art.crop(art.getbbox())
            scale=min(3,max_width/art.width,max_height/art.height)
            art=art.resize((round(art.width*scale),round(art.height*scale)),Image.Resampling.NEAREST)
            board.paste(art,(round(cx-art.width/2),bottom-art.height),art)
    for sex,name in [('m','male'),('f','female')]:
        board=Image.new('RGB',(1220,1320),'#14232d');draw=ImageDraw.Draw(board)
        label(draw,(28,24),f'{name.upper()} / 20 SELECTED HAIRSTYLES',30,bold=True)
        label(draw,(28,70),'Native palette 0 · Lord Knight · sword · halo, glasses and wings',17,color='#a3b8c2')
        for i,hair in enumerate(catalog['hairs'][sex]):
            x=20+(i%5)*240;y=116+(i//5)*285
            draw.rounded_rectangle((x,y,x+220,y+266),radius=12,fill='#213640',outline='#415763')
            label(draw,(x+14,y+12),f'Style {hair}',19,color='#e4c887',bold=True)
            actor(board,f'4008-{sex}-sword-{hair}-0-SE',x+110,y+253,195,207)
        label(draw,(28,1275),'Original source colors and attachment data. Available to every class in the studio.',17,color='#a3b8c2')
        board.save(out/(name+'-20-styles.png'))
    board=Image.new('RGB',(1640,780),'#14232d');draw=ImageDraw.Draw(board)
    label(draw,(24,20),'NATIVE HAIR PALETTES / IDs 0–8',29,bold=True)
    label(draw,(24,64),'Source entries can repeat colors. The preview retains their original IDs.',18,color='#a3b8c2')
    for row,(sex,name) in enumerate([('m','MALE'),('f','FEMALE')]):
        hair=catalog['hairs'][sex][0];y=105+row*310
        label(draw,(24,y),f'{name} · STYLE {hair}',16,color='#e4c887',bold=True)
        for i in range(9):
            x=15+i*180
            draw.rounded_rectangle((x,y+30,x+170,y+291),radius=9,fill='#213640',outline='#415763')
            label(draw,(x+13,y+42),f'Palette {i}',16,color='#e4c887')
            actor(board,f'4008-{sex}-sword-{hair}-{i}-SE',x+85,y+277,155,205)
    label(draw,(24,741),'Native palette changes only; no CSS tints or painted replacements.',17,color='#a3b8c2')
    board.save(out/'native-colors.png')

    # A fixed canvas and origin preserve authored foot placement across motion.
    animations={}
    for sex in ['m','f']:
        for stance in catalog['stances']:
            key=f'4008-{sex}-sword-2-0-SE'+('' if stance=='attack' else '-'+stance)
            row=rows[key]
            with Image.open(STUDIO/'art'/row['file']) as source:
                animations[(sex,stance)]=([(f.convert('RGBA'),round(f.info.get('duration',100))) for f in ImageSequence.Iterator(source)])
    movie=[]
    for clock in range(0,7200,100):
        board=Image.new('RGB',(1020,760),'#14232d');draw=ImageDraw.Draw(board)
        label(draw,(24,20),'IDLE / WALKING / ATTACK',30,bold=True)
        label(draw,(24,66),'Lord Knight · native motion · style 2 / palette 0 · male and female',17,color='#a3b8c2')
        for row,(sex,name) in enumerate([('m','MALE'),('f','FEMALE')]):
            for col,stance in enumerate(catalog['stances']):
                x=15+col*335;y=110+row*310
                draw.rounded_rectangle((x,y,x+320,y+294),radius=10,fill='#213640',outline='#415763')
                label(draw,(x+12,y+10),name+' · '+catalog['stances'][stance]['label'],16,color='#e4c887')
                frames=animations[(sex,stance)];t=clock%sum(d for _,d in frames)
                for art,delay in frames:
                    if t<delay:break
                    t-=delay
                board.paste(art,(x,y+20),art)
        label(draw,(24,735),'Weapons can be stowed during native idle/walk. No manual hand offsets.',15,color='#a3b8c2')
        movie.append(board)
    movie[0].save(out/'stances.png')
    movie[0].save(out/'stances.gif',save_all=True,append_images=movie[1:],duration=100,loop=0,optimize=False)

    html=(STUDIO/'index.html').read_text()
    html=html.replace('<link rel="stylesheet" href="preview.css">','<style>'+(STUDIO/'preview.css').read_text()+'</style>')
    scripts=['catalog.js','manifest.js','model.js','preview.js']
    for name in scripts:html=html.replace(f'<script src="{name}" defer></script>','')
    for id,name,mime in [('handoffLink','INTEGRATION-HANDOFF.md','text/markdown'),('auditLink','audit.json','application/json'),('performanceLink','PERFORMANCE-AND-HOSTING.md','text/markdown')]:
        encoded=base64.b64encode((STUDIO/name).read_bytes()).decode()
        html=html.replace(f'id="{id}" href="{name}"',f'id="{id}" download="{name}" href="data:{mime};base64,{encoded}"')
    images={}
    for row in rows.values():
        starter=row['job']==4008 and row['weapon']=='sword' and row['hair']==catalog['hairs'][row['sex']][0] and row['palette']==0
        gallery=row['job']==4008 and row['weapon']=='sword' and row['palette']==0 and row['direction']=='SE' and row['stance']=='idle'
        names=[row['file'],row['file'].replace('.png','-still.png')] if starter else [row['file'].replace('.png','-still.png')] if gallery else []
        for name in names:
            images[name]='data:image/png;base64,'+base64.b64encode((STUDIO/'art'/name).read_bytes()).decode()
    code='\n'.join((STUDIO/name).read_text() for name in scripts[:3])
    code+='\nwindow.HAIR_COMPACT=true;window.HAIR_IMAGES='+json.dumps(images,separators=(',',':'))+';\n'+(STUDIO/'preview.js').read_text()
    html=html.replace('</body>','<script>'+code+'</script></body>')
    target=out/'hair-color-studio.html';target.write_text(html)
    if target.stat().st_size>25_000_000:
        raise SystemExit('Standalone exceeds Outputs size limit; use a source archive/local server for this larger cache')
    for name in ['INTEGRATION-HANDOFF.md','PERFORMANCE-AND-HOSTING.md','catalog.json','validation-summary.json','browser-benchmark.json','asset-costs.json']:
        (out/name).write_bytes((STUDIO/name).read_bytes())
    with zipfile.ZipFile(out/'hair-color-source.zip','w',zipfile.ZIP_DEFLATED) as archive:
        for file in sorted(STUDIO.rglob('*')):
            if file.is_file() and file.name!='export-check.html' and 'art' not in file.relative_to(STUDIO).parts:archive.write(file,str(file.relative_to(ROOT)))
        for rel in ['tools/fetch_hair_colors.py','tools/fetch_class_weapons.py','tools/class_weapon_catalog.json',
                    'tools/export_hair_colors.py','tools/measure_appearance_costs.py','tools/benchmark_appearance_browser.js','tools/check_hair_color_browser.js','tools/tests/hair_color_sim.js','tools/tests/hair_color_assets.py','tools/preview_server.py']:
            archive.write(ROOT/rel,rel)
    # Split art by stance to keep every downloadable artifact below 25 MB.
    for stance in catalog['stances']:
        path=out/('hair-color-art-'+stance+'.zip')
        with zipfile.ZipFile(path,'w',zipfile.ZIP_DEFLATED) as archive:
            for row in rows.values():
                if row['stance']!=stance:continue
                for file in [row['file'],row['file'].replace('.png','-still.png')]:
                    asset=STUDIO/'art'/file;archive.write(asset,str(asset.relative_to(ROOT)))
        if path.stat().st_size>25_000_000:raise SystemExit('Art archive exceeds output limit; split into smaller batches')
    for name in ['male-20-styles.png','female-20-styles.png','native-colors.png']:
        with Image.open(out/name) as check:check.verify()
    print(f'Exported {len(images)} embedded images; {target.stat().st_size:,}-byte standalone; three contact sheets, handoff, cost report, source ZIP and three art archives.')


if __name__=='__main__':main()
