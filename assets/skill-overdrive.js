'use strict';
// Prismatic Overdrive: procedural, resolution-independent class skill choreography.
// This paints effects only. Native actor pixels, damage, cast spacing and cooldowns are untouched.
const PGSkillOverdrive=(()=>{
  const sourceCatalog=typeof PGAfterglowAnimations!=='undefined'?[...PGAfterglowAnimations.catalog]:[];
  const ascension=[
    {id:'rk_enchant',name:'Enchant Blade',from:'Rune Knight',type:'buff',family:'rk_enchant',color:'#ffb45e',ascension:true},
    {id:'wl_vortex',name:'Tetra Vortex',from:'Warlock',type:'act',family:'wl_vortex',color:'#bd9aff',ascension:true},
    {id:'rg_unlimit',name:'Unlimit',from:'Ranger',type:'buff',family:'rg_unlimit',color:'#9ce5b0',ascension:true},
    {id:'gc_claw',name:'Dark Claw',from:'Guillotine Cross',type:'act',family:'gc_claw',color:'#d89dff',ascension:true},
    {id:'ab_epiclesis',name:'Epiclesis',from:'Arch Bishop',type:'buff',family:'ab_epiclesis',color:'#fff0b7',ascension:true},
    {id:'mc_magma',name:'Magma Eruption',from:'Mechanic',type:'act',family:'mc_magma',color:'#ffbd77',ascension:true}
  ];
  const catalog=[...sourceCatalog,...ascension],specs=new Map(),TAU=Math.PI*2;
  const P={
    sword:['#ffb52e','#ff4f72','#fff1b8'],mage:['#63e7ff','#a970ff','#ffffff'],
    fire:['#ff6b35','#ffcf4a','#fff4cf'],ice:['#55d9ff','#8b8bff','#e8fdff'],
    lightning:['#8d7bff','#52e7ff','#ffffff'],archer:['#72f1a7','#2dd4bf','#efff8a'],
    thief:['#d94dff','#6c5cff','#55f6ff'],holy:['#ffe58a','#fff8dc','#7fe7ff'],
    machine:['#ff9138','#ffd166','#43e0d0'],novice:['#8fffc1','#fff2a8','#75dcff']
  };
  const copy=(p,over=[])=>[over[0]||p[0],over[1]||p[1],over[2]||p[2]];
  function D(id,pattern,o={},signature=''){
    const row=catalog.find(f=>f.id===id);if(!row)throw Error('Unknown Overdrive skill: '+id);
    specs.set(id,{id,pattern,colors:o.colors||copy(P.mage),signature:signature||row.name+' — '+pattern,
      anchor:o.anchor||(row.type!=='act'?'caster':'target'),travel:!!o.travel,life:o.life||2.05,
      seed:o.seed||[...id].reduce((n,c)=>(n*33+c.charCodeAt(0))>>>0,5381),...o});
  }
  // Novice and sword line — broad kinetic shapes, solar fractures and weapon constellations.
  D('aid','firstAid',{colors:P.novice,anchor:'caster',life:1.35},'A small mint cross, one fine ground ring and six quiet rising lights.');
  D('bash','slash',{colors:P.sword,angle:.62,count:1,power:1.15},'One solar cleave with a white-hot edge and a delayed pressure ring.');
  D('endure','slash',{colors:P.sword,angle:-1.18,count:2,rise:true},'Twin rising crescents lift a fountain of gold splinters.');
  D('provoke','nova',{colors:copy(P.sword,['#ff496c','#ffad32']),variant:'challenge',power:.8},'A war sigil locks on, snaps shut and detonates into crimson rays.');
  D('bowl','spin',{colors:P.sword,count:4,power:1.2},'A rolling ring of four solar blades ricochets through a ground shockwave.');
  D('pierce','thrust',{colors:P.sword,count:3,spacing:.13,weapon:'sword'},'Three complete sword silhouettes drive forward through narrow pressure collars.');
  D('quick','aura',{colors:P.sword,variant:'quicken',anchor:'caster'},'Two clean sword-edge streaks circle once while four short speed lines rise.');
  D('spiral','flurry',{colors:P.sword,count:5,spacing:.11,spiral:true},'Five cuts wind into a helical sword cage before collapsing inward.');
  D('aura','aura',{colors:P.sword,variant:'weapon',anchor:'caster'},'A spectral greatsword assembles from orbiting segments and ignites.');
  D('jointbeat','aura',{colors:P.sword,variant:'parry',anchor:'caster',life:1.45},'Crossed prism guards catch a shower of sparks inside a rotating ward.');
  D('frenzy','aura',{colors:copy(P.sword,['#ff5a36','#ffbf36']),variant:'rage',anchor:'caster'},'A volcanic crest erupts through three rising ribbons of weapon-fire.');
  D('mbrk','nova',{colors:P.fire,variant:'fire',power:1.15},'A compressed fire ring ruptures into a radial wall of molten crescents.');
  D('spearboom','thrust',{colors:P.sword,count:2,guard:true,spacing:.24,weapon:'sword'},'A prism guard flashes before two returning sword counters punch through.');
  D('tblow','slash',{colors:copy(P.sword,['#ff674d','#ffbd4a']),angle:.9,count:1,power:1.45,heavy:true},'A heavy diagonal wound tears open a glowing fault line and falling embers.');

  // Mage line — elemental geometry, moving spell circuits and impossible celestial weather.
  D('fire','meteor',{colors:P.fire,count:3,small:true,spacing:.16},'Three comet needles braid downward, each blooming into a separate fire crown.');
  D('nap','lightning',{colors:copy(P.lightning,['#b677ff','#6ee7ff']),count:3,spacing:.12},'Three violet lightning lances fork into a crawling electric root system.');
  D('coat','aura',{colors:P.mage,variant:'shield',anchor:'caster'},'A faceted mana shell folds shut panel by panel beneath an arcane orbit.');
  D('fireball','projectile',{colors:P.fire,variant:'orb',travel:true,power:1.15},'A spinning fire sun drags a braided plasma wake into a spherical blast.');
  D('fdiver','projectile',{colors:P.ice,variant:'ice',travel:true,power:.9},'A glacial spear carries a spiralling snow wake and flash-freezes on contact.');
  D('storm','frost',{colors:P.ice,count:10,power:1.25,scale:.72},'A contained blizzard ring crystallises into a compact circle of ice.');
  D('jup','jupitel',{colors:copy(P.lightning,['#ffe45c','#7be7ff']),travel:true},'A charged sphere rushes forward and unpacks four branching electric contacts.');
  D('amp','meteor',{colors:P.fire,count:7,spacing:.11,power:1.3,scale:.72},'Seven smaller meteors land inside a tightly grouped impact zone.');
  D('tstorm','trap',{colors:copy(P.machine,['#ffc46b','#6ee7ff']),variant:'earth',count:6},'A rippling fault line fires six levitating stone monoliths upward in sequence.');
  D('fnova','lightning',{colors:copy(P.lightning,['#ffcc55','#ff6f91']),count:8,storm:true,spacing:.065,power:1.25,scale:.70},'Eight compact lightning strikes land within a contained storm circuit.');
  D('meteor','projectile',{colors:copy(P.thief,['#ff6b55','#c768ff']),variant:'shard',travel:true},'A psychic rail-spike stretches space behind it and shatters into prism splinters.');
  D('grav','gravity',{colors:copy(P.thief,['#a775ff','#5136b8']),power:1.25},'A miniature event horizon bends orbiting light inward before an implosive snap.');
  D('mystic','aura',{colors:copy(P.thief,['#bd7bff','#6de7ff']),variant:'arcane',anchor:'caster'},'Three spell circuits converge into a levitating hexagonal amplifier.');
  D('napalm','flurry',{colors:copy(P.fire,['#ff7b43','#d75cff']),count:5,psychic:true,spacing:.1},'Five spectral pressure ghosts detonate in alternating colours and directions.');

  // Archer line — holographic targeting, luminous fletching and spectral predators.
  D('dstr','volley',{colors:P.archer,count:2,travel:true,spacing:.1},'Twin arrows fly on intertwined light rails and strike as one paired constellation.');
  D('iconc','aura',{colors:P.archer,variant:'concentrate',anchor:'caster'},'Four range brackets calibrate into one quiet emerald targeting iris.');
  D('ashower','volley',{colors:P.archer,count:16,rain:true,spacing:.035,power:1.1},'Sixteen neon-fletched arrows stitch a glowing grid across the entire target zone.');
  D('blitz','summon',{colors:P.archer,variant:'falcon',travel:true,count:1},'A spectral falcon folds its wings and dives through three concentric speed rings.');
  D('sharp','volley',{colors:P.archer,count:1,travel:true,marked:true},'A four-dimensional reticle collapses onto one impossible, piercing shot.');
  D('landmine','trap',{colors:copy(P.machine,['#d8ff72','#55e6a5']),variant:'mine',count:5},'A holographic mine arms in three ticks before throwing a radial shrapnel flower.');
  D('falcon','summon',{colors:P.archer,variant:'falcon',travel:true,count:3,power:1.2},'Three falcon echoes cross in a feathered storm around the lead strike.');
  D('focus','projectile',{colors:P.archer,variant:'arrow',travel:true,power:1.25},'A lance-sized arrow drills a visible tunnel through the air.');
  D('sight','aura',{colors:P.archer,variant:'trueSight',anchor:'caster',power:1.15},'A single golden eye opens above the caster and sweeps one thin sightline outward.');
  D('pharrow','trap',{colors:P.archer,variant:'snare',count:6},'A clockwork snare unfolds from a rune and clamps shut with spectral chains.');
  D('wwalk','aura',{colors:P.archer,variant:'wind',anchor:'caster'},'Long turquoise slipstreams orbit the caster while luminous feathers race upward.');

  // Thief line — ultraviolet rifts, glitch echoes and cuts that arrive before the blade.
  D('env','quickCut',{colors:P.thief},'Two short, straight dagger flashes arrive in opposite directions—no giant crescent.');
  D('dodge','feint',{colors:P.thief,travel:true},'A cyan decoy steps aside before one low violet dagger cut crosses its path.');
  D('sandat','volley',{colors:P.thief,count:7,fan:true,travel:true,spacing:.035},'Seven void daggers unfold into a fan, each with its own broken-pixel wake.');
  D('sonic','sonicBlow',{colors:copy(P.thief,['#ff4fd8','#35e7ff','#fff7fd']),count:8,scale:1,cadence:1.65},'Eight alternating sonic arcs gain neon-orchid and glacial-cyan split edges, tapered trails and compact prismatic contacts.');
  D('grim','rift',{colors:P.thief,variant:'teeth',count:18,power:1.1},'A circular void maw grows two rings of inward-facing luminous teeth.');
  D('vdust','crossCut',{colors:P.thief},'Two broad, flat blade planes form a clean X and split apart at the centre.');
  D('vsplash','dashCut',{colors:P.thief,travel:true},'Five shadow bodies tear a broad wake through the target before a heavy horizontal sever.');
  D('mAss','nova',{colors:P.thief,anchor:'caster',power:1.25},'V216 proposal restored: a caster-centred void nova releases three pressure rings and twelve radial blades.');
  D('soulb','soulBreaker',{colors:P.thief,travel:true,power:1.2},'Twin soul katars call a giant reaper whose diagonal cleave releases violet spirit fire.');
  D('sdestroy','deathmark',{colors:P.thief},'Four dagger pins lock a blinking death rune before the centre collapses inward.');
  D('akatar','phantomRush',{colors:P.thief,power:1.2},'Three distinct phantom attackers converge from separate directions with straight katar thrusts.');
  D('dpois','aura',{colors:P.thief,variant:'envenom',anchor:'caster'},'Two daggers cross once as three violet-green venom drops fall from their edges.');

  // Acolyte line — cathedral-scale seals, celestial mechanisms and volumetric sacred light.
  D('holy','holy',{colors:P.holy,variant:'pillar',power:1},'A cathedral seal answers a descending pillar with a crown of sacred rays.');
  D('heal','projectile',{colors:P.holy,variant:'holy',travel:true,echo:true},'An eight-point seraph star flies to the target and echoes healing light home.');
  D('bless','aura',{colors:P.holy,variant:'blessing',anchor:'caster'},'A small golden cross descends into three opening halo arcs and eight quiet light beads.');
  D('iagi','aura',{colors:P.holy,variant:'agility',anchor:'caster'},'Two slim wing sweeps and four rising lines suggest speed without filling the screen.');
  D('signum','slash',{colors:P.holy,angle:-.15,count:1,holy:true,power:1.15},'A towering radiant crescent sweeps sideways, shedding a curved river of stars.');
  D('magnus','holy',{colors:P.holy,variant:'nova',count:4,power:1.25},'Four judgment pillars descend around a rotating twelve-point exorcism seal.');
  D('sanct','holy',{colors:P.holy,variant:'pillar',count:1,power:1.2},'A luminous veil parts around one impossibly tall judgment column.');
  D('asp','aura',{colors:P.holy,variant:'holyWeapon',anchor:'caster'},'A thin holy filament traces the weapon and finishes in one small consecration cross.');
  D('kyrie','holy',{colors:P.holy,variant:'penance',count:5},'Five sacred diamonds converge and stamp a radiant cross onto the target.');
  D('tundead','holy',{colors:P.holy,variant:'banish',power:1.2},'An ivory banishment star unfolds into a blinding spherical wave of motes.');
  D('judex','holy',{colors:P.holy,variant:'barrage',count:6,power:1.15},'Six seraphic bolts arrive from different heavens in a perfectly timed barrage.');
  D('assum','holy',{colors:P.holy,variant:'consecrate',count:8},'Eight light stations rise from an immense consecration mandala.');
  D('gloria','aura',{colors:P.holy,variant:'gloria',anchor:'caster'},'Celestial rings become a floating crown while five bright spirits ascend.');
  D('basilica','holy',{colors:P.holy,variant:'judgment',count:12,power:1.5},'A twelve-point judgment engine opens before a cathedral-sized final beam.');

  // Merchant line — enchanted industry, coin cascades, gearworks and excessive firepower.
  D('mammo','machine',{colors:P.machine,variant:'coins',count:14},'A golden impact launches spinning zeny coins with glittering ballistic trails.');
  D('cartrev','machine',{colors:P.machine,variant:'cart',count:2},'A rune-powered cart drifts around the target on twin amber skid rails.');
  D('hammer','machine',{colors:P.machine,variant:'hammer',power:1.25},'A colossal forge-hammer spins down into a piston-ring impact and flying steel.');
  D('adren','aura',{colors:P.machine,variant:'adrenaline',anchor:'caster'},'A compact dynamo spins up beside three rising piston bars.');
  D('wperf','machine',{colors:P.machine,variant:'armor',count:5},'A hexagonal armour plate cracks along molten seams and bursts apart.');
  D('ovthrust','aura',{colors:P.machine,variant:'overdrive',anchor:'caster'},'Six furnace nodes lock into a hexagonal engine and redline together.');
  D('cart','machine',{colors:P.machine,variant:'cart',count:1,power:1.35},'A rocket-assisted cart powerslides into a massive gear-shaped shockwave.');
  D('thrust','aura',{colors:P.machine,variant:'powerThrust',anchor:'caster',power:1.15},'Three horizontal power bands clamp around one vertical weapon filament.');
  D('cboost','aura',{colors:P.machine,variant:'boost',anchor:'caster'},'Twin plasma exhausts ignite beneath a rotating induction pad.');
  D('meltdown','machine',{colors:copy(P.fire,['#ff7847','#ffd166']),variant:'armor',count:7,power:1.25},'White-hot fractures race across a metal shell before it explodes into shrapnel.');

  // Fourth jobs — the same class DNA pushed into cinematic signature moves.
  D('rk_charge','bladeWave',{colors:P.sword,travel:true,power:1.25},'A broad vertical sword-pressure wave travels on a glowing ground trench.');
  D('rk_burst','nova',{colors:P.fire,variant:'fire',anchor:'caster',power:1.45},'A dragon-shaped fire corona explodes outward through three molten shock rings.');
  D('rk_ward','dragonBreath',{colors:P.fire,travel:true,power:1.35},'A pressurised cone of white-gold fire rolls forward with curling flame sheets and a scorched finish.');
  D('rk_spear','thrust',{colors:P.sword,count:9,spacing:.055,power:1.25,weapon:'spear'},'Nine fully drawn spears with long shafts fire in a rapid phalanx.');
  D('rk_wind','spin',{colors:copy(P.archer,['#a8ffcb','#ffcf6b']),count:5,anchor:'caster',power:1.3},'Five enormous wind blades orbit at different inclinations around the caster.');
  D('wl_chain','chainLightning',{colors:P.thief,travel:true,power:1.25},'A horizontal lightning chain jumps between five bright junctions instead of falling from the sky.');
  D('wl_seal','gravity',{colors:P.thief,variant:'soul',power:1.05,invert:true},'A soul sphere expands through nested rune membranes and bursts inside-out.');
  D('wl_det','meteor',{colors:copy(P.fire,['#ff5151','#c65cff']),count:1,power:1.55,huge:true},'One crimson planet shatters the skyline and leaves a levitating molten crater.');
  D('wl_frost','frost',{colors:P.ice,count:14,anchor:'caster',power:1.45},'A caster-centred glacier blooms outward as a rotating field of ice roses.');
  D('wl_comet','meteor',{colors:copy(P.thief,['#ba68ff','#ff7b66']),count:1,power:1.7,huge:true,comet:true},'A void comet drags a violet galaxy into a cataclysmic prismatic impact.');
  D('rg_hunt','volley',{colors:P.archer,count:3,travel:true,marked:true,spacing:.09},'Three aimed bolts pass through successive holographic sight gates.');
  D('rg_warg','summon',{colors:P.archer,variant:'wolf',travel:true,count:1},'A giant spectral warg leaps through a trail of emerald claw constellations.');
  D('rg_storm','volley',{colors:P.archer,count:24,rain:true,spacing:.025,power:1.4},'A full arrow tempest darkens the sky before the ground erupts in green light.');
  D('rg_bite','summon',{colors:P.archer,variant:'wolf',travel:true,count:2,root:true},'Two warg spirits cross-pounce and pin the target beneath luminous fangs.');
  D('rg_cluster','trap',{colors:P.machine,variant:'cluster',count:7,power:1.35},'Seven cluster charges separate in mid-air and detonate as a synchronized flower.');
  D('gc_cross','crossImpact',{colors:P.thief,power:1.35},'Three scissor-like katar crosses close in sequence, each with a separate contact flash.');
  D('gc_slip','darkIllusion',{colors:P.thief,travel:true,power:1.2},'One shadow exchanges places with its afterimage and opens a short vertical darkness seam.');
  D('gc_veil','aura',{colors:P.thief,variant:'hallucination',anchor:'caster'},'Two offset mirror selves glitch across a thin violet evasion shell.');
  D('gc_roll','spin',{colors:P.thief,count:2,anchor:'caster',life:.46,fast:true},'V216 proposal restored: twin broad orbital blades make a fast caster-centred circuit.');
  D('gc_ripper','ripper',{colors:P.thief,travel:true,power:1.35},'A flat blade-cross travels straight, then opens into vertical and horizontal shears at the target.');
  D('ab_chain','holy',{colors:P.holy,variant:'barrage',count:3,power:1.25},'Three judgment halos stamp the ground in rapid succession.');
  D('ab_judge','holy',{colors:P.holy,variant:'judgment',count:8,power:1.55},'Adoramus opens a radiant celestial gate and fires its central spear of light.');
  D('ab_ward','aura',{colors:P.holy,variant:'praefatio',anchor:'caster',power:1.2},'Six rounded shield petals close into a quiet golden barrier.');
  D('ab_duple','aura',{colors:P.holy,variant:'duple',anchor:'caster'},'Twin suns orbit on intersecting paths and join above the caster.');
  D('ab_highness','aura',{colors:P.holy,variant:'highnessHeal',anchor:'caster',power:1.25},'One bright restoration cross blooms softly while twelve small lights rise.');
  D('mc_gat','volley',{colors:P.machine,count:9,travel:true,gun:true,spacing:.04},'Nine tracer rounds stitch a glowing mechanical rhythm across the target.');
  D('mc_over','projectile',{colors:P.machine,variant:'cannon',travel:true,power:1.5},'A cannon shell drags orange Mach rings into an industrial sunburst.');
  D('mc_rocket','spin',{colors:P.machine,count:6,anchor:'caster',power:1.4},'A six-bladed axe tornado spins through a cage of orange machining sparks.');
  D('mc_boomerang','projectile',{colors:P.machine,variant:'axe',travel:true,power:1.2},'A gigantic energy axe cartwheels outward with a returning afterimage.');
  D('mc_swing','machine',{colors:P.machine,variant:'hammer',axe:true,power:1.4},'A titanic axe head crushes a gear sigil flat in one furnace-bright impact.');

  // Ascension signatures are full citizens of the new renderer, not generic fallback effects.
  D('rk_enchant','aura',{colors:P.sword,variant:'enchant',anchor:'caster',power:1.35},'Four elemental blades fuse into one prismatic weapon above a dragon seal.');
  D('wl_vortex','vortex',{colors:P.mage,power:1.5},'Fire, frost, storm and void spiral together before a four-colour annihilation beam.');
  D('rg_unlimit','aura',{colors:P.archer,variant:'unlimit',anchor:'caster',power:1.4},'The targeting iris breaks its limits and becomes an orbiting crown of arrows.');
  D('gc_claw','rift',{colors:P.thief,variant:'claw',count:5,power:1.35},'Five enormous void claws close around a persistent-looking death sigil.');
  D('ab_epiclesis','holy',{colors:P.holy,variant:'epiclesis',count:8,anchor:'caster',power:1.45},'A living sanctuary grows from concentric seals, wings and ascending healing stars.');
  D('mc_magma','nova',{colors:P.fire,variant:'magma',power:1.55},'A volcanic engine punches upward through lava cracks and a rotating ash crown.');

  const cl=(v,a=0,b=1)=>Math.max(a,Math.min(b,v)),mix=(a,b,t)=>a+(b-a)*t;
  const smooth=t=>{t=cl(t);return t*t*(3-2*t)},out=t=>1-Math.pow(1-cl(t),3);
  const env=(t,start,life,attack=.035)=>t<=start||t>=start+life?0:Math.min(1,(t-start)/attack)*Math.pow(cl((start+life-t)/(life*.68)),1.25);
  const hash=n=>{const x=Math.sin(n*127.1+311.7)*43758.5453123;return x-Math.floor(x)};
  const rgba=(hex,a=1)=>{const h=String(hex||'#ffffff').replace('#',''),v=h.length===3?[...h].map(x=>x+x).join(''):h;return `rgba(${parseInt(v.slice(0,2),16)||0},${parseInt(v.slice(2,4),16)||0},${parseInt(v.slice(4,6),16)||0},${cl(a)})`};
  function create(g){
    let quality=1,enabled=true;const glowCache=new Map();
    function glowTexture(color){
      if(glowCache.has(color))return glowCache.get(color);
      let cv=null;if(typeof document!=='undefined'&&document.createElement){cv=document.createElement('canvas');cv.width=cv.height=96;const x=cv.getContext('2d');if(x){const r=x.createRadialGradient(48,48,0,48,48,48);r.addColorStop(0,rgba('#ffffff',.96));r.addColorStop(.1,rgba(color,.9));r.addColorStop(.34,rgba(color,.34));r.addColorStop(.7,rgba(color,.07));r.addColorStop(1,rgba(color,0));x.fillStyle=r;x.fillRect(0,0,96,96)}}
      glowCache.set(color,cv);return cv;
    }
    function save(fn,blend){g.save();if(blend)g.globalCompositeOperation=blend;try{fn()}finally{g.restore()}}
    function glow(x,y,r,color,a=1,ry=1){if(a<=0||r<=0||quality<.45&&r<12)return;const tex=glowTexture(color);save(()=>{g.globalAlpha*=cl(a);g.translate(x,y);g.scale(1,ry);if(tex)g.drawImage(tex,-r,-r,r*2,r*2);else{const q=g.createRadialGradient(0,0,0,0,0,r);q.addColorStop(0,rgba(color,a));q.addColorStop(1,rgba(color,0));g.fillStyle=q;g.fillRect(-r,-r,r*2,r*2)}},'lighter')}
    function material(name,t,x,y,w,h,a=1,angle=0,tint=null,blend='screen'){if(quality<.55&&(name==='smoke'||name==='seal'))return false;return a>0&&typeof PGSkillMaterials!=='undefined'&&PGSkillMaterials.ready()?PGSkillMaterials.draw(g,name,t*16,x,y,w,h,angle,a,blend,tint):false}
    function tint(hex){const v=String(hex).replace('#','');return [parseInt(v.slice(0,2),16)||0,parseInt(v.slice(2,4),16)||0,parseInt(v.slice(4,6),16)||0]}
    function line(points,color,w=2,a=1,blend=null){if(a<=0||points.length<2)return;save(()=>{g.globalAlpha*=cl(a);g.strokeStyle=color;g.lineWidth=Math.max(.1,w);g.lineCap='round';g.lineJoin='round';g.beginPath();points.forEach((p,i)=>i?g.lineTo(p[0],p[1]):g.moveTo(p[0],p[1]));g.stroke()},blend)}
    function beamLine(points,color,w,a=1){if(quality<.55){line(points,color,w*1.8,a*.42,'lighter');line(points,'#ffffff',Math.max(.45,w*.2),a,'lighter');return}if(quality<.9){line(points,color,w*2.6,a*.18,'lighter');line(points,color,w,a*.85,'lighter');line(points,'#ffffff',Math.max(.45,w*.22),a,'lighter');return}line(points,color,w*4,a*.07,'lighter');line(points,color,w*2,a*.24,'lighter');line(points,color,w,a*.88,'lighter');line(points,'#ffffff',Math.max(.45,w*.22),a,'lighter')}
    function poly(points,color,a=1,stroke=null,w=1){if(a<=0)return;save(()=>{g.globalAlpha*=cl(a);g.fillStyle=color;g.beginPath();points.forEach((p,i)=>i?g.lineTo(p[0],p[1]):g.moveTo(p[0],p[1]));g.closePath();g.fill();if(stroke){g.strokeStyle=stroke;g.lineWidth=w;g.stroke()}},color.startsWith?.('#')?'lighter':null)}
    function ellipse(x,y,rx,ry,color,a=1,w=2,rot=0,start=0,end=TAU){if(a<=0)return;save(()=>{g.globalAlpha*=cl(a);g.strokeStyle=color;g.lineWidth=w;g.beginPath();g.ellipse(x,y,Math.max(.05,rx),Math.max(.05,ry),rot,start,end);g.stroke()},'lighter')}
    function seal(x,y,r,color,a,t,sides=8){
      if(a<=0)return;save(()=>{g.translate(x,y);g.scale(1,.29);material('seal',t,0,0,r*2.65,r*2.65,a*.48,t*.12,tint(color))});for(const [q,w,spin]of (quality<.55?[[1,2,1],[.48,1.2,.6]]:[[1,2,1],[.78,1,-1.4],[.48,1.2,.6]])){ellipse(x,y,r*q,r*q*.29,color,a*(q===1?.9:.55),w,0);const pts=[];for(let i=0;i<=sides;i++){const an=i*TAU/sides+t*.6*spin;pts.push([x+Math.cos(an)*r*q,y+Math.sin(an)*r*q*.29])}line(pts,color,w,a*.55,'lighter')}
      for(let i=0;i<sides;i+=quality<.45?2:1){const an=i*TAU/sides-t*.85,c=Math.cos(an),s=Math.sin(an),px=x+c*r*.9,py=y+s*r*.9*.29;line([[px-c*5-s*3,py-s*1.4+c],[px+c*5+s*3,py+s*1.4-c]],color,1.3,a*.8,'lighter');poly([[px,py-3],[px+2.5,py],[px,py+3],[px-2.5,py]],rgba(color,a*.75))}
    }
    function shock(x,y,p,color,a=1,size=150){if(p<=0||p>=1)return;const r=mix(12,size,out(p)),fade=(1-p)*a;ellipse(x,y,r,r*.29,color,fade,3.2*(1-p)+.6);ellipse(x,y,r*.78,r*.78*.29,'#ffffff',fade*.38,1);if(p<.55)ellipse(x,y,r*1.13,r*1.13*.29,color,fade*.24,8)}
    function star(x,y,r,color,a=1,rot=0,count=8){if(a<=0)return;glow(x,y,r*.7,color,a*.55);if(quality<.55)count=Math.max(4,Math.ceil(count/2));for(let i=0;i<count;i++){const an=rot+i*TAU/count,long=i%2?r:r*.55;line([[x+Math.cos(an)*r*.1,y+Math.sin(an)*r*.1],[x+Math.cos(an)*long,y+Math.sin(an)*long]],i%2?color:'#ffffff',i%2?1.4:2,a,'lighter')}poly([[x,y-6],[x+3,y],[x,y+6],[x-3,y]],rgba('#ffffff',a))}
    function arcPoints(x,y,rx,ry,a0,a1,rot=0,n=40){const pts=[];for(let i=0;i<n;i++){const a=mix(a0,a1,i/(n-1)),xx=Math.cos(a)*rx,yy=Math.sin(a)*ry;pts.push([x+xx*Math.cos(rot)-yy*Math.sin(rot),y+xx*Math.sin(rot)+yy*Math.cos(rot)])}return pts}
    function ribbon(points,width,color,a=1){if(points.length<3||a<=0)return;const left=[],right=[];for(let i=0;i<points.length;i++){const p=points[i],prev=points[Math.max(0,i-1)],next=points[Math.min(points.length-1,i+1)],dx=next[0]-prev[0],dy=next[1]-prev[1],l=Math.hypot(dx,dy)||1,q=i/(points.length-1),w=width*Math.pow(Math.sin(q*Math.PI),.65);left.push([p[0]-dy/l*w,p[1]+dx/l*w]);right.push([p[0]+dy/l*w,p[1]-dx/l*w])}if(quality>.45)poly([...left,...right.reverse()],rgba(color,a*.3));line(points,color,width*.65,a*.44,'lighter');line(points,'#ffffff',Math.max(.55,width*.09),a*.95,'lighter')}
    function slash(x,y,p,color,secondary,a=1,angle=0,size=1){if(p<=0||p>=1.15)return;const pts=arcPoints(x,y,112*size,67*size,-2.75,mix(-2.75,.55,cl(p)),angle,Math.max(3,Math.floor(44*cl(p))));ribbon(pts,16*size,color,a);const tip=pts[pts.length-1];glow(tip[0],tip[1],25*size,secondary,a*.8);const echo=arcPoints(x,y,91*size,50*size,-2.6,mix(-2.6,.35,cl(p)),angle,36);line(echo,secondary,1.2,a*.55,'lighter')}
    function burst(x,y,t,seed,colors,count=24,power=1,gravity=85){
      if(t<0||t>1.5)return;const n=Math.max(quality<.45?3:5,Math.ceil(count*quality));for(let i=0;i<n;i++){const born=hash(seed+i*7)*.07,a=t-born,life=.45+hash(seed+i*11)*.65;if(a<0||a>life)continue;const an=hash(seed+i*13)*TAU,v=(75+hash(seed+i*17)*240)*power,xx=x+Math.cos(an)*v*a,yy=y+Math.sin(an)*v*a*.62+gravity*a*a,f=Math.pow(1-a/life,1.4),col=colors[i%colors.length],len=4+hash(seed+i*19)*15;line([[xx-Math.cos(an)*len,yy-Math.sin(an)*len*.62],[xx,yy]],i%4===0?'#ffffff':col,.7+f*1.5,f,'lighter');if(i%5===0){glow(xx,yy,6+f*5,col,f*.5);poly([[xx,yy-3],[xx+2,yy],[xx,yy+3],[xx-2,yy]],rgba(col,f))}}
    }
    function inward(x,y,t,seed,colors,count=30,radius=180){if(t<0||t>1.4)return;const n=Math.max(8,Math.ceil(count*quality));for(let i=0;i<n;i++){const q=cl(t/(.55+hash(seed+i)*.55)),an=hash(seed+i*3)*TAU+q*(4+hash(seed+i*5)*6),r=radius*(1-out(q))*(.4+hash(seed+i*7)*.8),xx=x+Math.cos(an)*r,yy=y+Math.sin(an)*r*.48;line([[xx+Math.cos(an)*14,yy+Math.sin(an)*7],[xx,yy]],colors[i%2],1.4,(1-q)*.9,'lighter');if(i%4===0)glow(xx,yy,9,colors[i%2],(1-q)*.7)}}
    function impact(x,y,t,c,power=1,seed=1){const a=env(t,0,.65,.008);if(!a)return;const hit=Math.pow(1-cl(t/.16),2);if(quality<.45){glow(x,y,68*power,c[0],a*.65);star(x,y,52*power,c[2],hit,t*2,4);shock(x,y+50,t/.65,c[0],a*.7,120*power);burst(x,y,t,seed,c,10*power,power);return}glow(x,y,92*power,c[0],a*.78);glow(x,y,48*power,'#ffffff',hit);material('flare',t,x,y,145*power,145*power,a*.95,t*.7,tint(c[0]));if(t>.08)material('smoke',t,x,y+22,150*power,85*power,env(t,.08,.75)*.28,t*.15,null,'source-over');star(x,y,82*power,c[2],hit,t*2,10);shock(x,y+50,t/.65,c[0],a,160*power);burst(x,y,t,seed,c,34*power,power);if(hit>0){ellipse(x,y,32*power+hit*25,58*power,c[1],hit*.75,2,.55);ellipse(x,y,32*power+hit*25,58*power,c[0],hit*.75,2,-.55)}}
    function cracks(x,y,t,c,seed,count=8,size=150){const a=env(t,0,1.1,.02);if(quality<.45)count=Math.max(3,Math.ceil(count*.4));for(let i=0;i<count;i++){const an=i*TAU/count+hash(seed+i)*.35,r=size*out(cl(t/.35))*(.65+hash(seed+i+8)*.45),pts=[[x,y]];for(let j=1;j<5;j++){const rr=r*j/4,off=(hash(seed+i*20+j)-.5)*20;pts.push([x+Math.cos(an)*rr-Math.sin(an)*off,y+Math.sin(an)*rr*.3+Math.cos(an)*off*.3])}line(pts,c[0],4,a*.18,'lighter');line(pts,c[1],1.2,a*.85,'lighter')}}
    function crystal(x,y,h,w,color,a=1,rot=0){if(h<=0||a<=0)return;save(()=>{g.translate(x,y);g.rotate(rot);poly([[-w,0],[-w*.55,-h*.65],[0,-h],[w*.55,-h*.68],[w,0]],rgba(color,a*.26),1,color,1.3);line([[0,-h],[0,0],[-w,0]],'#ffffff',.8,a*.7,'lighter');line([[0,-h],[w*.55,-h*.68],[w,0]],color,1.6,a,'lighter')})}
    function bolt(x,y,h,color,seed,a=1,width=3){const pts=[];for(let j=0;j<13;j++){const q=j/12,off=j===0||j===12?0:(hash(seed+j*17+Math.floor(h*2))-.5)*34;pts.push([x+off,y-q*230])}beamLine(pts,color,width,a);for(let j=3;j<11;j+=3){const p=pts[j],side=j%2?1:-1,branch=[p,[p[0]+side*16,p[1]+8],[p[0]+side*29,p[1]-3],[p[0]+side*43,p[1]+16]];beamLine(branch,color,width*.45,a*.65)}return pts[12]}
    function arrow(x,y,angle,color,a=1,size=1){save(()=>{g.translate(x,y);g.rotate(angle);g.scale(size,size);line([[-52,0],[10,0]],color,7,a*.16,'lighter');line([[-45,0],[10,0]],color,2,a,'lighter');line([[-30,0],[10,0]],'#ffffff',.65,a,'lighter');poly([[24,0],[5,-7],[10,0],[5,7]],rgba(color,a),1,'#ffffff',.8);line([[-34,0],[-44,-7]],color,2,a,'lighter');line([[-34,0],[-44,7]],color,2,a,'lighter')})}
    function gear(x,y,r,teeth,color,a=1,rot=0){const pts=[];for(let i=0;i<teeth*2;i++){const an=rot+i*Math.PI/teeth,rr=i%2?r:r*.78;pts.push([x+Math.cos(an)*rr,y+Math.sin(an)*rr])}pts.push(pts[0]);line(pts,color,3,a*.75,'lighter');ellipse(x,y,r*.47,r*.47,color,a*.7,2);for(let i=0;i<teeth;i+=2){const an=rot+i*TAU/teeth;line([[x+Math.cos(an)*r*.48,y+Math.sin(an)*r*.48],[x+Math.cos(an)*r*.76,y+Math.sin(an)*r*.76]],color,1,a*.5,'lighter')}}
    function wing(x,y,side,p,color,a){for(let i=0;i<7;i++){const q=i/6,len=(45+i*10)*p,root=[x+side*8,y+i*3],tip=[x+side*(25+len),y-45+i*13-len*.28],mid=[x+side*(22+len*.55),y-65+i*10];const pts=[];for(let j=0;j<18;j++){const u=j/17,v=1-u;pts.push([v*v*root[0]+2*v*u*mid[0]+u*u*tip[0],v*v*root[1]+2*v*u*mid[1]+u*u*tip[1]])}ribbon(pts,5-i*.35,i%2?color:'#ffffff',a*(1-q*.45))}}
    function feather(x,y,side,color,a=1,rot=0){if(a<=0)return;save(()=>{g.translate(x,y);g.rotate(rot);poly([[0,0],[side*4,-6],[side*2,-15],[side*-2,-7]],rgba(color,a*.3),1,color,.7);line([[0,0],[side*2,-13]],'#ffffff',.55,a*.7,'lighter')})}
    function sword(x,y,size,rot,color,a=1){save(()=>{g.translate(x,y);g.rotate(rot);g.scale(size,size);poly([[-6,35],[0,-58],[6,35],[0,48]],rgba(color,a*.35),1,color,2);line([[0,-52],[0,35]],'#ffffff',1,a,'lighter');line([[-18,26],[18,26]],color,5,a,'lighter');poly([[-4,35],[4,35],[3,55],[-3,55]],rgba(color,a*.8))})}
    function falcon(x,y,p,color,a=1,size=1){save(()=>{g.translate(x,y);g.scale(size,size);const flap=Math.sin(p*TAU*2)*15,wings=[[-3,-5],[-29,-28-flap],[-72,-38-flap],[-52,-16-flap],[-22,-7],[0,4],[24,13+flap],[63,34+flap],[72,25+flap],[35,8+flap],[7,-3]];poly(wings,rgba(color,a*.17),1,color,2);line([[-48,-21-flap],[-19,-7],[1,1],[29,13+flap],[55,24+flap]],'#ffffff',1,a*.8,'lighter');poly([[18,-4],[37,0],[19,5]],rgba('#ffffff',a));glow(0,0,45*size,color,a*.35)})}
    function wolf(x,y,p,color,a=1,size=1){save(()=>{g.translate(x,y);g.scale(size,size);const run=Math.sin(p*TAU*2)*6,pts=[[-55,3],[-34,-8],[-12,-11],[0,-30],[10,-13],[30,-10],[44,-2],[28,7],[15,8],[6,29+run],[-2,9],[-24,10],[-39,27-run],[-34,5],[-55,3]];poly(pts,rgba(color,a*.12),1,color,3);line([[-31,-5],[-6,-5],[16,-4],[35,-1]],'#ffffff',1,a*.8,'lighter');poly([[29,-7],[33,-3],[28,0]],rgba('#ffffff',a));glow(0,0,50,color,a*.25)})}
    function dagger(x,y,size,rot,color,a=1){save(()=>{g.translate(x,y);g.rotate(rot);g.scale(size,size);poly([[-4,18],[0,-36],[4,18],[0,25]],rgba(color,a*.38),1,color,1.5);line([[0,-31],[0,18]],'#ffffff',.65,a*.85,'lighter');line([[-11,17],[11,17]],color,3,a,'lighter');line([[0,20],[0,31]],color,4,a,'lighter')})}
    function spear(x,y,color,a=1,size=1){save(()=>{g.translate(x,y);g.scale(size,size);line([[-82,0],[30,0]],color,5,a*.32,'lighter');line([[-78,0],[28,0]],'#ffffff',1,a*.7,'lighter');poly([[54,0],[25,-8],[32,0],[25,8]],rgba(color,a*.42),1,'#ffffff',1);line([[-30,-8],[-30,8]],color,3,a,'lighter');line([[-78,0],[-88,-5]],color,2,a,'lighter');line([[-78,0],[-88,5]],color,2,a,'lighter')})}
    function thrustSword(x,y,color,a=1,size=1){save(()=>{g.translate(x,y);g.scale(size,size);poly([[-8,-11],[43,-7],[72,0],[43,7],[-8,11]],rgba(color,a*.4),1,'#ffffff',1.2);line([[0,0],[62,0]],'#ffffff',.8,a*.8,'lighter');line([[-14,-23],[-14,23]],color,5,a,'lighter');line([[-14,0],[-38,0]],color,6,a,'lighter');poly([[-43,-5],[-36,0],[-43,5],[-49,0]],rgba(color,a*.7),1,'#ffffff',.7)})}
    function crossCutMark(x,y,r,color,a=1,w=8,rot=0){save(()=>{g.translate(x,y);g.rotate(rot);beamLine([[-r,-r*.55],[r,r*.55]],color,w,a);beamLine([[-r,r*.55],[r,-r*.55]],color,w,a)})}
    function katar(x,y,size,rot,color,a=1){save(()=>{g.translate(x,y);g.rotate(rot);g.scale(size,size);for(let i=-1;i<=1;i++)dagger(i*10,0,.8,-.12*i,color,a);line([[-18,24],[18,24]],color,4,a*.8,'lighter')})}
    function phantom(x,y,p,color,a=1,size=1){save(()=>{g.translate(x,y);g.scale(size,size);poly([[-14,-33],[0,-48],[15,-33],[10,-20],[25,8],[16,37],[-4,23],[-27,39],[-20,4],[-30,-7],[-12,-20]],rgba(color,a*.13),1,color,1.5);line([[-6,-31],[8,-31]],'#ffffff',2,a,'lighter');sword(18,1,.65,-.9,color,a*.85);glow(0,0,42,color,a*.25)})}

    const patterns={
      slash(s,t){const [c,d,h]=s.colors,x=785,y=438,a=env(t,0,s.life,.02),count=s.count||1;seal(x,500,92,c,a*.35,t,6);for(let i=0;i<count;i++){const start=.06+i*.12,p=cl((t-start)/.38),amp=env(t,start,.85,.01),ang=(s.angle||0)+(i-(count-1)/2)*.48;slash(x,y+(s.rise?35:0),p,i%2?d:c,h,amp,ang,s.power||1);impact(x,y,t-start-.31,s.colors,(s.power||1)*(s.heavy?1.15:.72),s.seed+i*31)}if(s.holy)for(let i=0;i<8;i++){const q=(t*.5+i/8)%1;star(x+Math.cos(i)*70,490-q*130,7,h,a*.5,q*TAU,4)}if(s.void)riftTear(x,y,t,c,d,a)},
      flurry(s,t){const [c,d,h]=s.colors,x=785,y=438,count=s.count||4,spacing=s.spacing||.08;seal(x,500,105,c,env(t,0,s.life)*.4,-t,s.cross?4:8);for(let i=0;i<count;i++){const start=.04+i*spacing,p=cl((t-start)/.22),amp=env(t,start,.48,.008),ang=(i%2?-.78:.78)+(s.spiral?i*.52:0)+(s.cross?(i%2?0:.35):0);slash(x+(i%3-1)*8,y+(i-count/2)*3,p,i%2?d:c,h,amp,ang,s.psychic?.8:1);if(amp&&i%2===0)star(x,y,38,c,amp*.5,i,6);if(s.afterimage)phantom(x-90+i*130,y+15,p,d,amp*.35,.75);impact(x,y,t-start-.18,s.colors,.45,s.seed+i*17)}if(s.psychic)for(let i=0;i<count;i++)glow(x+Math.cos(i*2.4)*90,y+Math.sin(i*2.4)*40,45,c,env(t,.1+i*.08,.65)*.35)},
      thrust(s,t){const [c,d,h]=s.colors,x=785,y=438,count=s.count||3;seal(x,500,80,c,env(t,0,s.life)*.35,t,4);for(let i=0;i<count;i++){const start=.04+i*(s.spacing||.1),p=out(cl((t-start)/.25)),a=env(t,start,.58,.008),xx=mix(x-210,x+65,p),yy=y+(i-(count-1)/2)*10;if(s.weapon==='spear'){line([[x-190,yy],[xx,yy]],i%2?d:c,8,a*.18,'lighter');beamLine([[x-160,yy],[xx,yy]],i%2?d:c,2.2,a);spear(xx,yy,i%2?d:c,a,.72);for(let j=0;j<3;j++)ellipse(mix(x-160,xx,j/2)+Math.sin(t*4+i)*5,yy,7+p*8,24,c,a*(1-j*.2),1.5)}else{line([[xx-72,yy],[xx-24,yy]],i%2?d:c,6,a*.24,'lighter');line([[xx-64,yy],[xx-24,yy]],h,.8,a*.65,'lighter');thrustSword(xx,yy,i%2?d:c,a,.95);ellipse(xx-24,yy,9+p*5,29,c,a*.45,1.2)}impact(x,yy,t-start-.22,s.colors,.55,s.seed+i*29)}if(s.guard){gear(x-50,y,55,8,h,env(t,0,.35),-.3);star(x-50,y,55,h,env(t,0,.3,.005))}},
      spin(s,t){if(t>s.life)return;const [c,d,h]=s.colors,x=s.anchor==='caster'?252:785,y=s.anchor==='caster'?455:445,a=env(t,0,s.life,.015),p=cl(t/(s.fast?.2:.7)),count=s.count||4;seal(x,500,110,c,a*.6,t*(s.fast?8:2),count);for(let i=0;i<count;i++){const ang=p*TAU*(s.fast?1:1.3)+i*TAU/count,pts=arcPoints(x,y,105+i%2*18,46+i%2*9,ang,ang+2.2,i%2?.18:-.18,30);ribbon(pts,s.fast?12:18,i%2?d:c,a*.8);const px=x+Math.cos(ang+2.2)*115,py=y+Math.sin(ang+2.2)*50;sword(px,py,.42,ang+1.5,h,a*.7)}shock(x,500,cl(t/.75),c,a,180*(s.power||1));burst(x,y,t-.25,s.seed,s.colors,32,s.power||1)},
      projectile(s,t){const [c,d,h]=s.colors,A=[252,425],B=[785,438],start=.05,flight=s.variant==='arrow'?.3:.48,p=cl((t-start)/flight),e=smooth(p),curve=s.variant==='crescent'?35:-35,pt=q=>[mix(A[0],B[0],q),mix(A[1],B[1],q)+Math.sin(q*Math.PI)*curve],pos=pt(e),a=env(t,start,flight+.18,.015);seal(A[0],500,60,c,env(t,0,.5)*.55,t,6);for(let i=14;i>=0;i--){const q=cl(e-i*.018),u=pt(q),fade=(1-i/15)*a;line([[u[0]-18,u[1]],[u[0],u[1]]],i%3?c:d,2+(14-i)*.35,fade*.24,'lighter');if(i%4===0)glow(u[0],u[1],24,c,fade*.22)}glow(pos[0],pos[1],s.variant==='cannon'?52:40,c,a*.8);if(s.variant==='orb')material('fireball',t,pos[0],pos[1],100,100,a*.95,t*2);if(s.variant==='arrow'||s.variant==='wave')arrow(pos[0],pos[1],0,h,a,s.variant==='wave'?1.8:1.25);else if(s.variant==='ice')crystal(pos[0],pos[1]+20,70,16,c,a,-Math.PI/2);else if(s.variant==='crescent'||s.variant==='ripper'||s.variant==='axe'){slash(pos[0],pos[1],.8,c,d,a,t*9,s.variant==='crescent'?1.15:.65);if(s.variant==='ripper')for(let j=0;j<4;j++){const an=t*8+j*TAU/4;sword(pos[0]+Math.cos(an)*45,pos[1]+Math.sin(an)*22,.25,an,h,a)}}else if(s.variant==='holy')star(pos[0],pos[1],35,h,a,t*2,8);else if(s.variant==='shard')poly([[pos[0]+45,pos[1]],[pos[0]-25,pos[1]-14],[pos[0]-10,pos[1]],[pos[0]-25,pos[1]+14]],rgba(c,a*.5),1,h,2);else{ellipse(pos[0],pos[1],30,30,c,a,3,t*4);ellipse(pos[0],pos[1],20,30,h,a*.7,1,-t*5);star(pos[0],pos[1],22,h,a,t*3,6)}impact(B[0],B[1],t-start-flight,s.colors,s.power||1,s.seed);if(s.echo){const q=cl((t-.8)/.5),u=pt(1-q);star(u[0],u[1],18,h,env(t,.8,.6)*.8,t,4)}},
      volley(s,t){const [c,d,h]=s.colors,count=s.count||2,x=785,y=445;seal(x,500,s.rain?145:75,c,env(t,0,s.life)*.5,t,s.rain?8:4);for(let i=0;i<count;i++){const start=.03+i*(s.spacing||.06),p=out(cl((t-start)/(s.rain?.32:.38))),a=env(t,start,s.rain?.75:.58,.008),spread=s.rain?((i%6)-2.5)*48:s.fan?(i-(count-1)/2)*20:(i-(count-1)/2)*11,tx=x+spread,ty=y+(s.rain?Math.floor(i/6)*18:spread*.3),A=s.rain?[tx+95,90]:s.fan?[252,420]:[252,420+(i-(count-1)/2)*9],px=mix(A[0],tx,p),py=mix(A[1],ty,p),ang=Math.atan2(ty-A[1],tx-A[0]);arrow(px,py,ang,i%3===0?h:i%2?d:c,a,s.gun?.65:1);if(s.gun&&i%3===0)star(A[0],A[1],16,c,a*.6,0,6);if(s.rain&&p>.85)shock(tx,500,cl((t-start-.28)/.4),c,a*.45,48);impact(tx,ty,t-start-(s.rain?.32:.38),s.colors,s.rain?.28:.4,s.seed+i*13)}if(s.marked){const p=1-cl(t/.42),r=35+p*95;ellipse(x,y,r,r*.55,h,env(t,0,.6),2,t*2);for(let i=0;i<4;i++){const an=i*TAU/4+t;line([[x+Math.cos(an)*r,y+Math.sin(an)*r*.55],[x+Math.cos(an)*(r-18),y+Math.sin(an)*(r-18)*.55]],h,3,env(t,0,.55),'lighter')}}},
      lightning(s,t){const [c,d,h]=s.colors,count=s.count||3,x=785,y=450;seal(x,500,s.storm?150:105,c,env(t,0,s.life)*.65,t,s.storm?12:6);for(let i=0;i<count;i++){const start=.03+i*(s.spacing||.09),a=env(t,start,.5,.005),px=x+(i?Math.cos(i*2.4)*(s.storm?115:65):0),py=y+(i?Math.sin(i*2.4)*28:0);bolt(px,py,Math.floor((t-start)*24),i%2?d:c,s.seed+i*41,a,s.storm?4:3);glow(px,py,65,c,a*.45);burst(px,py,t-start,s.seed+i*19,s.colors,12,.6);if(s.chain&&i){const prev=i-1,ax=x+Math.cos(prev*2.4)*65,ay=y+Math.sin(prev*2.4)*28;beamLine([[ax,ay],[mix(ax,px,.5)+Math.sin(t*40+i)*18,mix(ay,py,.5)-15],[px,py]],h,1.8,a)}}if(s.storm)for(let i=0;i<4;i++)ellipse(x,160+i*22,130-i*16,30,c,env(t,0,1)*.13,16)},
      meteor(s,t){const [c,d,h]=s.colors,count=s.count||3,x=785,y=448;seal(x,500,150*(s.power||1),c,env(t,0,s.life)*.55,t,8);for(let i=0;i<count;i++){const start=.02+i*(s.spacing||.12),flight=s.small?.32:.5,p=out(cl((t-start)/flight)),a=env(t,start,flight+.8,.01),spread=s.huge?0:(i-(count-1)/2)*(s.small?42:48),tx=x+spread,ty=y+Math.sin(i*2.2)*20,sx=tx-150-(i%2)*55,sy=65-(i%3)*30,px=mix(sx,tx,p),py=mix(sy,ty,p),sz=(s.huge?1.65:s.small?.55:.85)*(1+(s.comet?.2:0));for(let j=0;j<8;j++){const q=cl(p-j*.025),ux=mix(sx,tx,q),uy=mix(sy,ty,q);line([[ux-35*sz,uy-65*sz],[ux,uy]],j%2?c:d,(10-j)*sz,a*.13,'lighter');if(j%3===0)material('flame',t+j*.07,ux,uy,70*sz,105*sz,a*.34,-.55)}glow(px,py,65*sz,c,a*.55);save(()=>{g.translate(px,py);g.rotate(t*3+i);const rock=[];for(let j=0;j<9;j++){const an=j*TAU/9,r=(28+hash(s.seed+i*30+j)*15)*sz;rock.push([Math.cos(an)*r,Math.sin(an)*r])}if(!material('meteor',t,0,0,100*sz,125*sz,a*.98))poly(rock,rgba('#271b35',a*.95));line([...rock,rock[0]],c,4*sz,a,'lighter');for(let j=0;j<4;j++){const an=j*TAU/4;line([[0,0],[Math.cos(an)*25*sz,Math.sin(an)*25*sz]],h,2*sz,a*.8,'lighter')}glow(0,0,25*sz,h,a*.5)});impact(tx,ty,t-start-flight,s.colors,(s.power||1)*(s.small?.55:1),s.seed+i*37);cracks(tx,500,t-start-flight,s.colors,s.seed+i,6,90*sz)}},
      frost(s,t){const [c,d,h]=s.colors,x=s.anchor==='caster'?252:785,y=448,a=env(t,0,s.life),count=s.count||10,p=out(cl(t/.8));seal(x,500,165*(s.power||1),c,a*.8,-t,10);for(let ring=0;ring<3;ring++){const pts=arcPoints(x,500,45+p*(90+ring*30),15+p*(30+ring*9),t*(ring%2?-3:3)+ring,t*(ring%2?-3:3)+ring+5.2,0,60);ribbon(pts,5,c,a*.45)}for(let i=0;i<count;i++){const an=i*TAU/count+t*.4,r=(35+(i%3)*42)*p,px=x+Math.cos(an)*r,py=490+Math.sin(an)*r*.28,hgt=(45+hash(s.seed+i)*105)*out(cl((t-i*.025)/.5));material('ice',t+i*.1,px,py-hgt*.45,45+hgt*.25,hgt*1.3,a*.72,0,tint(i%2?c:d),'screen');crystal(px,py,hgt,10+hash(s.seed+i+9)*12,i%2?c:d,a,(hash(s.seed+i+3)-.5)*.3);if(i%2===0)star(px,py-hgt,9,h,a*.6,t+i,4)}const n=Math.ceil(35*quality);for(let i=0;i<n;i++){const q=(t*.35+hash(s.seed+i))%1,an=hash(s.seed+i*7)*TAU+q*4,r=30+q*160;star(x+Math.cos(an)*r,480+Math.sin(an)*r*.25-q*110,3+i%3,h,a*(1-q)*.6,an,4)}shock(x,500,cl(t/.9),h,a,200*(s.power||1))},
      gravity(s,t){const [c,d,h]=s.colors,x=785,y=425,a=env(t,0,s.life),p=cl(t/.95);seal(x,500,140,c,a*.6,-t*2,8);inward(x,y,t,s.seed,s.colors,46,210);for(let i=0;i<5;i++){const r=45+i*17+Math.sin(t*5+i)*6;ellipse(x,y,r,r*(s.invert?.8:.45),i%2?d:c,a*(1-i*.12),2,i*.35+t*(i%2?-2:2),i*.7,i*.7+4.7)}save(()=>{g.globalAlpha*=a*.88;g.fillStyle=s.invert?rgba(c,.25):'#05030d';g.beginPath();g.ellipse(x,y,45+Math.sin(t*4)*4,45+Math.sin(t*4)*4,0,0,TAU);g.fill()});glow(x,y,85,c,a*.32);star(x,y,32,h,a*.7,-t*2,6);if(t>.85){const q=t-.85;impact(x,y,q,s.colors,(s.power||1)*1.2,s.seed);shock(x,500,q/.7,d,a,230)}},
      nova(s,t){const [c,d,h]=s.colors,x=s.anchor==='caster'?252:785,y=s.anchor==='caster'?450:440,a=env(t,0,s.life),p=out(cl((t-.08)/.65));seal(x,500,155,c,a*.7,t,8);for(let i=0;i<3;i++)shock(x,500,cl((t-.08-i*.11)/.75),i%2?d:c,a,170+i*45);for(let i=0;i<12;i++){const an=i*TAU/12+t*.35,r=25+p*120,px=x+Math.cos(an)*r,py=480+Math.sin(an)*r*.3,ht=(35+hash(s.seed+i)*95)*Math.sin(cl((t-.04)/1.1)*Math.PI);if(s.variant==='magma'||s.variant==='fire'){const pts=[[px-12,py],[px-6,py-ht*.6],[px+Math.sin(t*7+i)*10,py-ht],[px+7,py-ht*.45],[px+13,py]];poly(pts,rgba(i%2?c:d,a*.34),1,c,1.4);material('flame',t+i*.08,px,py-ht*.45,55,Math.max(30,ht*1.35),a*.8,0,tint(i%2?c:d));glow(px,py-ht*.4,28,c,a*.28)}else sword(px,py,.45,an+Math.PI/2,i%2?c:d,a*.65)}burst(x,y,t-.12,s.seed,s.colors,55,s.power||1,120);cracks(x,500,t-.08,s.colors,s.seed,12,180);impact(x,y,t-.1,s.colors,s.power||1,s.seed)},
      holy(s,t){const [c,d,h]=s.colors,x=s.anchor==='caster'?252:785,y=445,a=env(t,0,s.life),count=s.count||1;seal(x,500,130*(s.power||1),c,a*.9,t,s.variant==='judgment'?12:8);seal(x,500,95,d,a*.45,-t*1.4,6);const beams=s.variant==='barrage'||s.variant==='nova'?count:1;for(let i=0;i<beams;i++){const start=.08+i*.1,amp=env(t,start,1.05,.025),an=i*TAU/Math.max(1,beams),r=beams>1?75:0,px=x+Math.cos(an)*r,py=490+Math.sin(an)*r*.28,w=(s.variant==='judgment'?42:24)*(1+Math.sin(t*5+i)*.1);glow(px,py-95,w*2.2,c,amp*.4,2.4);beamLine([[px,85],[px,py]],c,w,amp*.5);beamLine([[px,90],[px,py]],h,Math.max(2,w*.16),amp);for(let j=0;j<4;j++)ellipse(px,py-j*48,18+j*9,5,h,amp*.5,1.2,t+j);star(px,py-65,38,h,amp,t+i,8);burst(px,py-30,t-start,s.seed+i*17,s.colors,15,.65,-35)}const feathers=Math.ceil((s.power||1)*16*quality);for(let i=0;i<feathers;i++){const q=(t*.3+hash(s.seed+i))%1,an=hash(s.seed+i*3)*TAU+t*.3,r=30+q*120,px=x+Math.cos(an)*r,py=485+Math.sin(an)*r*.25-q*140;feather(px,py,i%2?1:-1,h,a*(1-q)*.65,an+.4)}if(s.variant==='penance'||s.variant==='judgment'){for(let i=0;i<count;i++){const q=out(cl(t/.45)),an=i*TAU/count,r=130*(1-q),px=x+Math.cos(an)*r,py=y+Math.sin(an)*r*.5;poly([[px,py-13],[px+8,py],[px,py+13],[px-8,py]],rgba(h,a*.45),1,c,1.4)}star(x,y,95*(s.power||1),h,env(t,.35,.6,.005),0,4)}if(s.variant==='consecrate'||s.variant==='epiclesis')for(let i=0;i<count;i++){const an=i*TAU/count+t*.2,px=x+Math.cos(an)*100,py=490+Math.sin(an)*30;sword(px,py-35,.45,0,h,a*.7)}impact(x,y,t-.35,s.colors,(s.power||1)*.8,s.seed)},
      quickCut(s,t){
        const [c,d,h]=s.colors,x=785,y=438;for(let i=0;i<2;i++){const start=.03+i*.12,p=out(cl((t-start)/.2)),a=env(t,start,.38,.008),A=i?[x-105,y+55]:[x-95,y-65],B=i?[x+95,y-45]:[x+110,y+35],ex=mix(A[0],B[0],p),ey=mix(A[1],B[1],p);beamLine([A,[ex,ey]],i?c:d,7,a);dagger(ex,ey,.55,Math.atan2(B[1]-A[1],B[0]-A[0])-Math.PI/2,h,a);star(ex,ey,10,h,a,0,4)}impact(x,y,t-.36,s.colors,.45,s.seed)
      },
      feint(s,t){
        const [c,d,h]=s.colors,p=out(cl((t-.04)/.38)),a=env(t,0,1.05),x=mix(252,785,p);phantom(330,410,t,c,a*(1-p)*.55,.85);phantom(x,440,t,d,a*.55,.9);line([[270,455],[x,455]],c,3,a*.25,'lighter');if(t>.38){const q=out(cl((t-.38)/.18));beamLine([[685,455],[685+200*q,425]],c,9,env(t,.38,.45));dagger(785,440,.7,Math.PI/2,h,a)}impact(785,440,t-.45,s.colors,.6,s.seed)
      },
      sonicBlow(s,t){
        const [c,d,h]=s.colors,x=785,y=430,count=s.count||8,time=t*(s.cadence||1);
        // Preserve the current game's rapid eight-contact cadence; only the palette and trail design change.
        for(let i=0;i<count;i++){
          const a=time-(.25+i*.09);if(a<0||a>.7)continue;
          const p=cl(a/.2),tail=cl((a-.16)/.44),pts=[],echo=[];
          for(let k=0;k<55;k++){
            const u=mix(tail,p,k/54),ang=-2.8+u*4.2,r=125-i*3,px=x+Math.cos(ang)*r,py=y+Math.sin(ang)*r*.4+Math.cos(ang)*(i%2?48:-48);
            pts.push([px,py]);echo.push([px+Math.cos(ang)*5,py+Math.sin(ang)*2.5]);
          }
          const col=i%2?d:c,other=i%2?c:d,amp=1-smooth((a-.24)/.46);
          ribbon(pts,11,col,amp*.88);line(pts,h,.85,amp*.72,'lighter');
          if(quality>.75){
            line(echo,other,2.1,amp*.48,'lighter');
            const tip=pts[pts.length-1],prev=pts[pts.length-2],ang=Math.atan2(tip[1]-prev[1],tip[0]-prev[0]);
            save(()=>{g.translate(tip[0],tip[1]);g.rotate(ang);poly([[14,0],[-8,-3],[-3,0],[-8,3]],rgba(h,amp*.78))},'lighter');
          }
          const hit=a-.13,hx=775+hash(i)*24,hy=423+hash(i+17)*33;
          if(hit>=0&&hit<.28){
            const ha=1-hit/.28;material('flare',a,hx,hy,52,52,ha*.55,i*.37,tint(col));star(hx,hy,19+8*(1-ha),h,ha,i*.7,4);
            for(let k=0;k<3;k++){const an=i*.9+k*2.1;line([[hx+Math.cos(an)*5,hy+Math.sin(an)*5],[hx+Math.cos(an)*(12+hit*65),hy+Math.sin(an)*(12+hit*65)]],other,.8,ha*.62,'lighter')}
          }
          burst(x,442,hit,s.seed+i*39,[col,other,h],8,.3,25);
        }
        glow(x,443,42,d,env(time,.37,.82)*.1);
      },
      crossCut(s,t){
        const [c,d,h]=s.colors,x=785,y=438,p=out(cl(t/.28)),a=env(t,0,.9),r=125*p;crossCutMark(x,y,r,c,a,11);line([[x-r,y-r*.55],[x+r,y+r*.55]],h,1,a*.8,'lighter');line([[x-r,y+r*.55],[x+r,y-r*.55]],h,1,a*.8,'lighter');katar(x-105,y+65,.48,-.7,d,a*.7);katar(x+105,y-65,.48,2.45,c,a*.7);impact(x,y,t-.32,s.colors,.65,s.seed)
      },
      dashCut(s,t){
        const [c,d,h]=s.colors,p=out(cl((t-.03)/.38)),a=env(t,0,1.3),x=mix(252,865,p),wake=[[252,465],[410,425],[585,462],[x,435]];ribbon(wake,25,c,a*.52);line(wake,h,1,a*.35,'lighter');for(let i=4;i>=0;i--){const q=cl(p-i*.055),px=mix(252,865,q),py=440+Math.sin(q*Math.PI)*18,amp=a*(1-i/6)*.62;glow(px,py,42,i%2?c:d,amp*.3);phantom(px,py,t+i*.12,i%2?c:d,amp,.82+i*.045)}for(let i=0;i<12;i++){const q=hash(s.seed+i)*p,px=mix(270,850,q),py=390+hash(s.seed+i*7)*105;line([[px-55,py+8],[px+22,py-4]],i%3?c:d,1.5,a*(1-q)*.6,'lighter')}const amp=env(t,.38,.95,.005);ribbon([[650,472],[724,432],[812,450],[930,410]],28,d,amp*.85);line([[650,472],[724,432],[812,450],[930,410]],h,1.6,amp*.85,'lighter');line([[665,487],[735,450],[820,465],[916,432]],c,7,amp*.45,'lighter');katar(895,420,.82,Math.PI/2,h,amp);material('smoke',t,795,445,270,175,amp*.48,0,tint(c),'screen');burst(785,445,t-.4,s.seed,s.colors,36,.85,25);impact(785,445,t-.46,s.colors,1,s.seed);shock(785,500,cl((t-.44)/.6),c,amp,170)
      },
      soulBreaker(s,t){
        const [c,d,h]=s.colors,p=smooth(cl((t-.04)/.44)),a=env(t,.04,1.25),x=mix(252,785,p);for(const side of [-1,1]){const y=425+side*18,pts=[[252,y],[mix(252,x,.35),y+side*18],[mix(252,x,.72),y-side*12],[x,y]];ribbon(pts,12,side<0?c:d,a*.55);glow(x,y,42,side<0?c:d,a*.6);material('flame',t+side*.1,x-25,y,85,115,a*.5,-Math.PI/2,tint(side<0?c:d),'screen');katar(x,y,.82,Math.PI/2,side<0?c:d,a)}const amp=env(t,.4,1.1,.006),q=out(cl((t-.4)/.24));inward(785,440,t-.34,s.seed,s.colors,26,170);material('flame',t,785,390,205,260,amp*.6,0,tint(c),'screen');material('smoke',t,785,420,260,210,amp*.45,0,tint(d),'screen');phantom(785,mix(300,360,q),t,c,amp*.78,1.65);for(let i=-1;i<=1;i++){const pts=[[785+i*30,495],[785+i*45,455],[785+i*20,405],[785+i*35,350]];ribbon(pts,7,i?d:c,amp*.35)}ribbon([[685,520],[738,455],[815,405],[890,330]],28,c,amp*.9);line([[685,520],[738,455],[815,405],[890,330]],h,1.6,amp*.9,'lighter');line([[700,534],[752,474],[827,425],[880,365]],d,8,amp*.5,'lighter');katar(850,382,1.12,.75,h,amp);star(785,440,55,h,amp,t,6);burst(785,445,t-.43,s.seed,s.colors,38,.9,15);impact(785,445,t-.48,s.colors,1.1,s.seed)
      },
      deathmark(s,t){
        const [c,d,h]=s.colors,x=785,y=435,p=out(cl(t/.45)),a=env(t,0,1.2);for(let i=0;i<4;i++){const an=i*TAU/4+Math.PI/4,r=110*(1-p)+32,px=x+Math.cos(an)*r,py=y+Math.sin(an)*r*.65;dagger(px,py,.55,an-Math.PI/2,i%2?c:d,a)}poly([[x,y-48*p],[x+48*p,y],[x,y+48*p],[x-48*p,y]],rgba(c,a*.08),1,c,2);ellipse(x,y,22,22,d,a*.6,1.5,t);line([[x-10,y-4],[x-3,y-1]],h,2,a,'lighter');line([[x+10,y-4],[x+3,y-1]],h,2,a,'lighter');if(t>.5)inward(x,y,t-.5,s.seed,s.colors,18,95);impact(x,y,t-.63,s.colors,.8,s.seed)
      },
      phantomRush(s,t){
        const [c,d,h]=s.colors,a=env(t,0,1.25);for(let i=0;i<3;i++){const start=.03+i*.09,p=out(cl((t-start)/.34)),amp=env(t,start,.55,.01),sx=785+(i-1)*170,sy=i===1?290:440+(i-1)*65,x=mix(sx,785+(i-1)*12,p),y=mix(sy,438+(i-1)*8,p);phantom(x,y,t+i,i%2?c:d,amp*.7,.82);katar(x+28,y,.42,Math.PI/2,i%2?d:c,amp);line([[sx,sy],[x,y]],c,2,amp*.22,'lighter');if(p>.85)beamLine([[x-45,y-15],[x+50,y+15]],h,3,amp)}impact(785,445,t-.52,s.colors,.8,s.seed)
      },
      crossImpact(s,t){
        const [c,d,h]=s.colors,x=785,y=438;for(let i=0;i<3;i++){const start=.04+i*.16,p=out(cl((t-start)/.16)),a=env(t,start,.38,.006),r=110*p;crossCutMark(x+(i-1)*8,y,r,i%2?c:d,a,10,i===1?.22:i===2?-.18:0);if(p>.7)star(x,y,25,h,a,0,4);impact(x,y,t-start-.16,s.colors,.35,s.seed+i*17)}
      },
      darkIllusion(s,t){
        const [c,d,h]=s.colors,p=smooth(cl((t-.04)/.38)),a=env(t,0,1.1);phantom(252,440,t,c,a*(1-p)*.65,.9);phantom(785,438,t+.2,d,a*p*.65,.9);for(let i=0;i<6;i++){const q=i/5,x=mix(280,750,q),yy=405+(i%2)*55;line([[x-35,yy],[x+25,yy]],i%2?c:d,1.5,a*Math.sin(q*Math.PI)*.5,'lighter')}if(t>.4)riftTear(785,438,t-.4,c,d,env(t,.4,.6));impact(785,445,t-.48,s.colors,.75,s.seed)
      },
      ripper(s,t){
        const [c,d,h]=s.colors,p=smooth(cl((t-.04)/.4)),a=env(t,.04,1.15),x=mix(252,785,p),y=430;beamLine([[x-32,y],[x+32,y]],c,5,a);beamLine([[x,y-32],[x,y+32]],d,5,a);line([[252,y-18],[x-25,y-18]],d,2,a*.35,'lighter');line([[252,y+18],[x-25,y+18]],c,2,a*.35,'lighter');if(t>.4){const q=out(cl((t-.4)/.2)),amp=env(t,.4,.6,.005);beamLine([[785,445-140*q],[785,445+140*q]],c,14,amp);beamLine([[785-155*q,445],[785+155*q,445]],d,14,amp);line([[785,305],[785,585]],h,1.2,amp,'lighter');line([[630,445],[940,445]],h,1.2,amp,'lighter');star(785,445,45,h,amp,0,4)}impact(785,445,t-.47,s.colors,.9,s.seed)
      },
      firstAid(s,t){
        const [c,d,h]=s.colors,x=252,y=440,a=env(t,0,s.life),p=out(cl(t/.4));glow(x,y-45,30,c,a*.22);beamLine([[x,y-65],[x,y-25]],h,2.4,a*.8);beamLine([[x-15,y-45],[x+15,y-45]],h,2.4,a*.8);ellipse(x,500,38+16*p,11+4*p,c,a*.38,1);for(let i=0;i<6;i++){const q=(t*.38+i/6)%1,px=x-28+i*11;glow(px,482-q*75,4,i%2?c:h,a*(1-q)*.45)}
      },
      bladeWave(s,t){
        const [c,d,h]=s.colors,start=.04,flight=.46,p=out(cl((t-start)/flight)),a=env(t,start,flight+.45),x=mix(275,785,p),y=438;glow(252,440,35,c,env(t,0,.35)*.35);line([[270,500],[x,500]],c,3,a*.25,'lighter');for(let k=0;k<2;k++){const xx=x-k*22,pts=[[xx-28,y-88],[xx+5,y-52],[xx+20,y],[xx+5,y+52],[xx-28,y+88]];ribbon(pts,k?7:14,k?d:c,a*(k?.45:.8));line(pts,h,k?.6:1,a*.7,'lighter')}impact(785,445,t-start-flight,s.colors,s.power||1,s.seed);cracks(785,500,t-start-flight,s.colors,s.seed,6,100)
      },
      dragonBreath(s,t){
        const [c,d,h]=s.colors,start=.035,p=out(cl((t-start)/.5)),a=env(t,start,1.25,.02),ox=275,oy=425,tip=mix(305,785,p);glow(ox,oy,45,c,a*.45);for(let k=-1;k<=1;k++){const pts=[[ox,oy],[mix(ox,tip,.32),oy+k*9+Math.sin(t*9+k)*8],[mix(ox,tip,.7),oy+k*23+Math.sin(t*7+k)*12],[tip,oy+k*38]];ribbon(pts,k===0?30:20,k===0?h:k<0?c:d,a*(k===0?.38:.58))}beamLine([[ox,oy],[tip,oy]],h,5,a*.65);for(let i=0;i<9;i++){const q=(i+1)/9;if(q>p+.08)continue;const px=mix(ox,tip,q),py=oy+Math.sin(t*8+i*1.7)*12*q,sz=24+q*48;glow(px,py,sz,i%2?c:d,a*.42);material('flame',t+i*.09,px,py,55+q*55,75+q*65,a*.68,-Math.PI/2,tint(i%2?c:d));if(i%2===0)ellipse(px,oy,8+q*5,22+q*32,c,a*.24,1.1)}const embers=Math.ceil(18*quality);for(let i=0;i<embers;i++){const q=hash(s.seed+i)*p,px=mix(ox,tip,q),py=oy+(hash(s.seed+i*7)-.5)*95*q;line([[px-10,py-3],[px,py]],i%3?c:h,1,a*(1-q)*.65,'lighter')}impact(785,445,t-.54,s.colors,1.15,s.seed);cracks(785,500,t-.52,s.colors,s.seed,9,145);shock(785,500,cl((t-.52)/.65),d,a*.65,155)
      },
      jupitel(s,t){
        const [c,d,h]=s.colors,p=smooth(cl((t-.04)/.42)),a=env(t,.04,1.05),x=mix(252,785,p),y=430-Math.sin(p*Math.PI)*35;glow(x,y,52,c,a*.7);ellipse(x,y,23,23,h,a,2,t*5);ellipse(x,y,34,18,c,a*.65,1.5,-t*6);for(let i=0;i<8;i++){const q=cl(p-i*.035),px=mix(252,785,q),py=430-Math.sin(q*Math.PI)*35;line([[px-22,py],[px,py]],i%2?c:d,3,a*(1-i/8)*.4,'lighter')}if(p>.68)for(let i=0;i<4;i++){const an=i*TAU/4+t*.2,ex=785+Math.cos(an)*85,ey=445+Math.sin(an)*55,pts=[];for(let j=0;j<9;j++){const q=j/8,off=j===0||j===8?0:(hash(s.seed+i*30+j)-.5)*20;pts.push([mix(x,ex,q)+off,mix(y,ey,q)-off*.3])}beamLine(pts,i%2?c:d,2.4,a*cl((p-.68)/.2));star(ex,ey,12,h,a,t+i,4)}impact(785,445,t-.48,s.colors,.8,s.seed)
      },
      chainLightning(s,t){
        const [c,d,h]=s.colors,a=env(t,0,1.35),nodes=[];for(let i=0;i<5;i++)nodes.push([252+i*(533/4),430+Math.sin(i*2.2)*34]);for(let i=0;i<4;i++){const start=.04+i*.1,amp=env(t,start,.55,.01),A=nodes[i],B=nodes[i+1],pts=[];for(let j=0;j<11;j++){const q=j/10,off=j===0||j===10?0:(hash(s.seed+i*40+j+Math.floor(t*18))-.5)*30;pts.push([mix(A[0],B[0],q),mix(A[1],B[1],q)+off])}beamLine(pts,i%2?c:d,3.2,amp)}for(let i=0;i<5;i++){const amp=env(t,.03+i*.1,.65),n=nodes[i];glow(n[0],n[1],28,i%2?c:d,amp*.5);star(n[0],n[1],18,h,amp,t+i,4)}impact(785,445,t-.48,s.colors,.85,s.seed)
      },
      aura(s,t){
        const [c,d,h]=s.colors,x=252,y=440,a=env(t,0,s.life),p=out(cl(t/.48)),v=s.variant;
        // Buffs share only a restrained ground cue. Their symbols and motion stay distinct.
        ellipse(x,500,58+12*p,17+3*p,c,a*.32,1.2);glow(x,y-35,38,c,a*.1);
        if(v==='quicken'){
          for(const side of [-1,1]){const pts=arcPoints(x,y-10,62,38,side<0?-2.4:-.7,side<0?-.7:2.4,side*.22,28);line(pts,side<0?c:d,4,a*.7,'lighter');line(pts,h,.7,a*.8,'lighter')}
          for(let i=0;i<4;i++){const q=(t*.9+i*.22)%1;line([[x-34+i*22,486-q*85],[x-34+i*22,474-q*85]],c,1.4,a*(1-q),'lighter')}
        }else if(v==='weapon'){
          sword(x,y-60,.92,0,c,a);for(let i=0;i<4;i++){const an=i*TAU/4+t,r=75*(1-p)+18;dagger(x+Math.cos(an)*r,y-55+Math.sin(an)*r*.35,.35,an,c,a*.7)}star(x,y-105,18,h,a,0,4);
        }else if(v==='parry'){
          sword(x-12,y-32,.82,-.72,c,a);sword(x+12,y-32,.82,.72,d,a);const pts=arcPoints(x,y-20,72,82,-2.5,-.65,0,30);line(pts,h,3,a*.65,'lighter');star(x,y-32,24,h,env(t,.12,.35),0,4);
        }else if(v==='rage'){
          for(let i=0;i<5;i++){const px=x+(i-2)*23,hh=(45+hash(s.seed+i)*55)*p;material('flame',t+i*.1,px,492-hh*.45,38,hh*1.25,a*.62,0,tint(i%2?c:d));poly([[px-8,494],[px,494-hh],[px+8,494]],rgba(i%2?c:d,a*.24),1,c,.8)}shock(x,500,cl(t/.6),c,a*.5,105);
        }else if(v==='shield'){
          for(let i=0;i<4;i++){const an=i*TAU/4+t*.35,rr=64*p;ellipse(x,y-28,rr,88*p,i%2?c:d,a*.42,1.5,an,an+.15,an+1.25)}poly([[x,y-110],[x+55,y-65],[x+38,y+15],[x,y+43],[x-38,y+15],[x-55,y-65]],rgba(c,a*.05),1,c,1.2);
        }else if(v==='arcane'){
          const r=48+8*Math.sin(t*3);poly([[x,y-105-r],[x+r,y-55],[x,y-5+r],[x-r,y-55]],rgba(c,a*.06),1,c,1.6);gear(x,y-55,40,6,d,a*.6,-t*.5);for(let i=0;i<3;i++)star(x+(i-1)*38,y-125+Math.abs(i-1)*20,9,h,a,t+i,4);
        }else if(v==='concentrate'){
          const r=58-18*p;ellipse(x,y-35,r,r*.55,c,a*.75,1.5);ellipse(x,y-35,16,16,h,a*.8,1);glow(x,y-35,20,c,a*.45);for(let i=0;i<4;i++){const an=i*TAU/4+Math.PI/4,rr=95-35*p,px=x+Math.cos(an)*rr,py=y-35+Math.sin(an)*rr*.55;line([[px-Math.cos(an)*16,py-Math.sin(an)*8],[px,py],[px-Math.sin(an)*10,py+Math.cos(an)*6]],c,1.4,a,'lighter')}
        }else if(v==='trueSight'){
          const open=Math.sin(cl(t/.55)*Math.PI)*38,top=[[x-65,y-80],[x-30,y-80-open],[x,y-85-open],[x+30,y-80-open],[x+65,y-80]],bottom=[[x-65,y-80],[x-30,y-80+open],[x,y-75+open],[x+30,y-80+open],[x+65,y-80]];line(top,c,2,a,'lighter');line(bottom,c,2,a,'lighter');ellipse(x,y-80,18,Math.max(3,open*.7),h,a,1.4);glow(x,y-80,25,h,a*.65);line([[x+72,y-80],[x+135,y-80]],c,1,a*.5,'lighter');
        }else if(v==='wind'){
          for(const side of [-1,1]){const pts=arcPoints(x,485,80,24,side<0?2.8:-.3,side<0?5.8:2.7,side*.12,32);ribbon(pts,5,side<0?c:d,a*.45)}for(let i=0;i<5;i++){const q=(t*.45+i/5)%1;feather(x-45+i*22,480-q*85,i%2?1:-1,h,a*(1-q)*.55,i*.4)}
        }else if(v==='envenom'){
          dagger(x-12,y-48,.85,-.65,c,a);dagger(x+12,y-48,.85,.65,d,a);for(let i=0;i<3;i++){const q=(t*.5+i/3)%1,px=x-25+i*25;glow(px,y-5+q*55,7,c,a*(1-q)*.5);poly([[px,y+q*55],[px-3,y-6+q*55],[px+3,y-6+q*55]],rgba(i%2?c:d,a*(1-q)*.7))}
        }else if(v==='blessing'){
          const cy=mix(y-145,y-75,p);glow(x,cy,34,h,a*.45);beamLine([[x,cy-25],[x,cy+25]],h,3,a*.8);beamLine([[x-17,cy-5],[x+17,cy-5]],h,3,a*.8);for(let i=0;i<3;i++){const pts=arcPoints(x,y-25,35+i*18,12+i*6,Math.PI+.2,TAU-.2,0,28);line(pts,i%2?c:h,1.3,a*(.8-i*.15),'lighter')}for(let i=0;i<8;i++){const an=i*TAU/8+t*.35;glow(x+Math.cos(an)*68,y-35+Math.sin(an)*25,5,h,a*.55)}
        }else if(v==='agility'){
          for(const side of [-1,1])for(let i=0;i<3;i++){const pts=[[x+side*8,y-15-i*9],[x+side*(38+i*12),y-50-i*11],[x+side*(65+i*10),y-42-i*7]];line(pts,i===1?h:c,2.2-i*.35,a*(.75-i*.12),'lighter')}for(let i=0;i<4;i++){const q=(t*.7+i*.25)%1;line([[x-30+i*20,485-q*75],[x-30+i*20,470-q*75]],c,1.2,a*(1-q),'lighter')}
        }else if(v==='holyWeapon'){
          sword(x,y-55,.68,0,h,a*.75);line([[x,y-120],[x,y+5]],c,1.2,a*.75,'lighter');beamLine([[x-16,y-112],[x+16,y-112]],h,2,a*.75);beamLine([[x,y-128],[x,y-96]],h,2,a*.75);
        }else if(v==='gloria'){
          const pts=arcPoints(x,y-70,55,20,.15,Math.PI-.15,0,32);line(pts,c,4,a*.65,'lighter');for(let i=0;i<5;i++){const an=.25+i*(Math.PI-.5)/4,px=x+Math.cos(an)*55,py=y-70-Math.sin(an)*20;star(px,py-10,10,h,a,t+i,4)}glow(x,y-82,40,c,a*.18);
        }else if(v==='adrenaline'){
          gear(x,y-45,38,10,c,a*.75,t*2);for(let i=0;i<3;i++){const hh=(30+i*14)*p;poly([[x-48+i*48,490],[x-39+i*48,490-hh],[x-30+i*48,490]],rgba(i%2?c:d,a*.28),1,c,1)}
        }else if(v==='overdrive'){
          gear(x,y-40,50,12,c,a*.7,t);for(let i=0;i<6;i++){const an=i*TAU/6-t,px=x+Math.cos(an)*65,py=y-40+Math.sin(an)*28;glow(px,py,12,i%2?d:c,a*.45);ellipse(px,py,5,5,h,a,1)}
        }else if(v==='powerThrust'){
          for(let i=0;i<3;i++){const yy=y-70+i*30,w=65-i*10;line([[x-w,yy],[x+w,yy]],i%2?c:d,4-i,a*.55,'lighter');line([[x-w,yy],[x+w,yy]],h,.6,a*.7,'lighter')}sword(x,y-48,.7,0,h,a);
        }else if(v==='boost'){
          for(const side of [-1,1]){glow(x+side*35,475,28,c,a*.45,1.5);beamLine([[x+side*35,493],[x+side*45,430]],c,6,a*.35);ellipse(x+side*35,490,16,5,d,a*.6,1.2)}
        }else if(v==='hallucination'){
          phantom(x-28,y+12,t,c,a*.3,.72);phantom(x+30,y+5,t+.2,d,a*.24,.72);for(let i=0;i<4;i++){const yy=y-90+i*42;line([[x-65+(i%2)*18,yy],[x+55-(i%2)*15,yy]],i%2?c:d,1,a*.45,'lighter')}
        }else if(v==='praefatio'){
          for(let i=0;i<6;i++){const an=i*TAU/6,rr=48*(1-p)+12;ellipse(x+Math.cos(an)*rr,y-32+Math.sin(an)*rr*.5,32,68,i%2?c:h,a*.35,1.5,an,an+.15,an+1.15)}ellipse(x,y-32,58,88,c,a*.35,1.2);
        }else if(v==='duple'){
          for(let i=0;i<2;i++){const an=t*2+i*Math.PI,px=x+Math.cos(an)*58,py=y-55+Math.sin(an)*24;glow(px,py,25,i?c:h,a*.55);star(px,py,16,i?c:h,a,-an,6)}ellipse(x,y-55,58,24,c,a*.35,1,t);
        }else if(v==='highnessHeal'){
          glow(x,y-55,55,h,a*.4);beamLine([[x,y-115],[x,y+5]],h,5,a*.8);beamLine([[x-38,y-55],[x+38,y-55]],h,5,a*.8);for(let i=0;i<12;i++){const q=(t*.35+i/12)%1,an=i*2.4;glow(x+Math.cos(an)*45,485-q*125,5,i%2?c:h,a*(1-q)*.55)}
        }else if(v==='enchant'){
          const colors=['#ff654d','#5de4ff','#ffe76b','#c268ff'];for(let i=0;i<4;i++){const an=i*TAU/4+t,r=65*(1-p)+12;dagger(x+Math.cos(an)*r,y-55+Math.sin(an)*r*.35,.65,an,colors[i],a)}sword(x,y-55,.85,0,h,a*p);
        }else if(v==='unlimit'){
          ellipse(x,y-40,62,36,c,a*.6,1.5,t);ellipse(x,y-40,24,24,h,a*.7,1);for(let i=0;i<8;i++){const an=i*TAU/8+t;arrow(x+Math.cos(an)*82,y-40+Math.sin(an)*34,an+Math.PI/2,c,a*.55,.4)}
        }
      },
      summon(s,t){const [c,d,h]=s.colors,start=.04,flight=.42,p=smooth(cl((t-start)/flight)),a=env(t,start,flight+.55,.015),x=mix(250,785,p),y=425-Math.sin(p*Math.PI)*55;for(let i=8;i>=0;i--){const q=cl(p-i*.025),px=mix(250,785,q),py=425-Math.sin(q*Math.PI)*55;line([[px-30,py],[px,py]],i%2?c:d,4,a*(1-i/9)*.3,'lighter')}if(s.variant==='wolf')wolf(x,y,p,c,a,1.25);else for(let i=0;i<(s.count||1);i++)falcon(x-i*38,y+i*18,p+i*.1,i%2?d:c,a*(1-i*.2),1.1);if(s.root)for(let i=0;i<4;i++)ellipse(785,490,35+i*15,12+i*4,c,a*.6,2,t+i);impact(785,445,t-start-flight,s.colors,s.power||1,s.seed);burst(x,y,t*.4,s.seed,s.colors,20,.5,-20)},
      machine(s,t){const [c,d,h]=s.colors,x=785,y=445,a=env(t,0,s.life),v=s.variant;seal(x,500,110,c,a*.6,t,8);gear(x,500,120,12,c,a*.4,-t*.6);if(v==='coins'){impact(x,y,t-.12,s.colors,1,s.seed);for(let i=0;i<(s.count||12);i++){const b=t-.12-hash(s.seed+i)*.06;if(b<0||b>1.2)continue;const an=hash(s.seed+i*3)*TAU,v0=90+hash(s.seed+i*7)*170,px=x+Math.cos(an)*v0*b,py=y-Math.abs(Math.sin(an))*v0*b+150*b*b,amp=1-b/1.2;save(()=>{g.translate(px,py);g.rotate(b*8+i);ellipse(0,0,Math.max(2,Math.abs(Math.cos(b*12))*10),13,c,amp,3);ellipse(0,0,6,9,h,amp*.7,1);line([[-2,-5],[-2,5]],h,2,amp,'lighter')})}}else if(v==='hammer'){const p=out(cl(t/.42)),rot=mix(-1.4,2.75,p),amp=env(t,0,1.2);save(()=>{g.translate(x,y-70);g.rotate(rot);const pts=s.axe?[[-65,-125],[5,-155],[60,-125],[15,-75],[-20,-85]]:[[-62,-135],[50,-135],[60,-120],[50,-100],[-62,-100]];poly(pts,rgba(c,amp*.18),1,c,4);line([...pts,pts[0]],h,1.2,amp,'lighter');beamLine([[0,25],[0,-103]],c,7,amp*.6);for(let i=0;i<5;i++)line([[-8,15-i*7],[8,12-i*7]],h,2,amp,'lighter')});impact(x,y,t-.4,s.colors,s.power||1,s.seed);cracks(x,500,t-.4,s.colors,s.seed,10,170)}else if(v==='cart'){const p=cl(t/.65),an=p*TAU*(s.count>1?1:.55),px=x+Math.cos(an)*125*(1-p*.45),py=480+Math.sin(an)*45;line(arcPoints(x,480,125,45,0,an,0,45),c,12,a*.25,'lighter');save(()=>{g.translate(px,py);g.rotate(-an*.2);poly([[-58,-42],[45,-42],[62,-5],[-45,-5]],rgba(c,a*.12),1,c,3);for(const xx of [-30,38])gear(xx,5,18,8,h,a,-t*7);line([[-40,-30],[45,-30]],h,2,a,'lighter')});impact(x,y,t-.45,s.colors,s.power||1,s.seed)}else if(v==='armor'){const p=cl(t/.45),amp=env(t,0,1.1);for(let i=0;i<(s.count||5);i++){const an=i*TAU/(s.count||5),r=p*75,px=x+Math.cos(an)*r,py=y+Math.sin(an)*r*.6;save(()=>{g.translate(px,py);g.rotate(an+p*2);poly([[-24,-30],[22,-30],[32,0],[8,34],[-18,25]],rgba(c,amp*.12),1,c,2);line([[-20,-25],[0,0],[-12,20]],h,1.5,amp,'lighter');line([[20,-25],[0,0],[25,5]],d,2,amp,'lighter')})}impact(x,y,t-.35,s.colors,s.power||1,s.seed)}},
      trap(s,t){const [c,d,h]=s.colors,x=785,y=455,a=env(t,0,s.life),v=s.variant;seal(x,500,v==='earth'?155:105,c,a*.75,t,v==='snare'?6:8);if(v==='earth'){for(let i=0;i<(s.count||6);i++){const start=i*.09,p=out(cl((t-start)/.35)),px=x+(i-(s.count-1)/2)*38,hh=(70+hash(s.seed+i)*90)*p;crystal(px,495,hh,20,i%2?c:d,a);impact(px,455,t-start-.28,s.colors,.45,s.seed+i)}}else if(v==='snare'){const p=out(cl(t/.35));for(const side of [-1,1]){save(()=>{g.translate(x,y+35);g.rotate(side*mix(1.1,.15,p));const pts=[];for(let i=0;i<7;i++)pts.push([side*(18+i*8),-i*8]);line(pts,c,9,a*.4,'lighter');for(const q of pts)poly([[q[0],q[1]-12],[q[0]+side*7,q[1]],[q[0],q[1]+5]],rgba(h,a*.5),1,c,1)});for(let i=0;i<4;i++)ellipse(x,y+35,35+i*16,12+i*5,c,a*.6,2,t*(i%2?-1:1))}impact(x,y,t-.3,s.colors,.7,s.seed)}else{const count=s.count||5;for(let i=0;i<count;i++){const start=.1+i*.07,p=out(cl((t-start)/.3)),an=i*TAU/count,r=(1-p)*100,px=x+Math.cos(an)*r,py=y+Math.sin(an)*r*.5;gear(px,py,14,6,c,a,t*4+i);impact(px,py,t-start-.3,s.colors,v==='cluster'?.75:.55,s.seed+i*23)}if(v==='mine'){gear(x,485,45,8,h,a,t*3);for(let i=0;i<3;i++)ellipse(x,485,55+i*15,18+i*5,i===2?d:c,env(t,i*.12,.4),3)}}},
      rift(s,t){const [c,d,h]=s.colors,x=785,y=435,a=env(t,0,s.life),v=s.variant;seal(x,500,115,c,a*.55,-t,6);for(let i=0;i<4;i++)ellipse(x,y,60+i*16,85-i*7,i%2?d:c,a*(.5-i*.07),2,t*(i%2?-2:2)+i,0,4.8);glow(x,y,75,c,a*.25);if(v==='teeth'){const p=out(cl(t/.4));for(let i=0;i<(s.count||18);i++){const an=i*TAU/(s.count||18)+t*.25,r=95*p,px=x+Math.cos(an)*r,py=y+Math.sin(an)*r*.55;save(()=>{g.translate(px,py);g.rotate(an+Math.PI/2);poly([[-6,0],[0,30],[6,0],[0,8]],rgba(c,a*.35),1,h,1)})}impact(x,y,t-.35,s.colors,1,s.seed)}else if(v==='dash'||v==='phantom'){for(let i=0;i<(s.count||3);i++){const start=i*.07,p=out(cl((t-start)/.35)),px=mix(x+(i-(s.count-1)/2)*170,x,p),py=y+(i%2?35:-25)*(1-p);phantom(px,py,p,i%2?d:c,env(t,start,.65)*.7,1);slash(x,y,cl((t-start-.2)/.25),c,d,env(t,start+.2,.5),i%2?-.8:.8,.8)}impact(x,y,t-.45,s.colors,s.power||1,s.seed)}else if(v==='mark'||v==='claw'){const count=s.count||4;for(let i=0;i<count;i++){const an=i*TAU/count+t*.2,p=out(cl(t/.4)),r=110*(1-p)+25,px=x+Math.cos(an)*r,py=y+Math.sin(an)*r*.6;sword(px,py,.45,an+Math.PI/2,i%2?d:c,a)}const r=45+Math.sin(t*8)*4;poly([[x,y-r],[x+r,y],[x,y+r],[x-r,y]],rgba(c,a*.15),1,h,2);star(x,y,70,h,env(t,.35,.55),t,4);if(v==='claw')for(let i=0;i<5;i++)slash(x,y,cl((t-i*.05)/.3),c,d,env(t,i*.05,.7),-1.1+i*.45,.8)}else riftTear(x,y,t,c,d,a);burst(x,y,t-.25,s.seed,s.colors,35,s.power||1,30)},
      vortex(s,t){const colors=['#ff654d','#5de4ff','#ffe76b','#c268ff'],x=785,y=430,p=out(cl(t/.8)),a=env(t,0,s.life);seal(x,500,150,'#b98aff',a*.8,t,4);for(let i=0;i<4;i++){const an=i*TAU/4+t*(3+i*.15),r=190*(1-p)+25,px=x+Math.cos(an)*r,py=y+Math.sin(an)*r*.65;glow(px,py,48,colors[i],a*.8);star(px,py,32,colors[i],a,-an,6);for(let j=0;j<4;j++){const q=j/4,rr=r+q*35;line([[px+Math.cos(an)*rr,py+Math.sin(an)*rr*.65],[px,py]],colors[i],1,a*.1,'lighter')}inward(x,y,t*.8,s.seed+i*43,[colors[i],'#ffffff'],10,160)}if(t>.65){const q=t-.65;for(let i=0;i<4;i++){const an=i*TAU/4+q*2;beamLine([[x+Math.cos(an)*20,y+Math.sin(an)*20],[x+Math.cos(an)*160,y+Math.sin(an)*80]],colors[i],8,env(q,0,.8)*.5)}impact(x,y,q,['#ffffff','#bd7bff','#ffffff'],1.6,s.seed);shock(x,500,q/.8,'#ffffff',1,240)}}
    };
    function riftTear(x,y,t,c,d,a){const p=out(cl(t/.3)),pts=[];for(let i=0;i<9;i++){const q=i/8;pts.push([x+(i%2?1:-1)*10*p,y-100+q*200])}beamLine(pts,c,5,a*.6);line(pts,'#ffffff',1,a,'lighter');for(const side of [-1,1]){const echo=pts.map(([px,py])=>[px+side*22*p,py]);line(echo,side>0?c:d,3,a*.45,'lighter')}}
    return(id,time,detail=1)=>{
      const s=specs.get(id);if(!s||!Number.isFinite(time)||time<0)return;const t=time/1.65;if(t>s.life+.08)return;quality=cl(detail,.25,1);g.save();try{g.globalAlpha*=enabled?1:0;if(!s.travel){const x=s.anchor==='caster'?252:785,k=s.scale||Math.min(1.25,1.08+(s.power||1)*.06);g.translate(x,500);g.scale(k,k);g.translate(-x,-500)}patterns[s.pattern](s,t)}finally{g.restore();quality=1}
    };
  }
  let active=true;
  return {catalog,specs,has:id=>specs.has(id),create,
    get enabled(){return active},setEnabled(value){active=!!value},
    anchor:id=>specs.get(id)?.anchor||'target',travel:id=>!!specs.get(id)?.travel,
    get size(){return specs.size}};
})();
// Install over the preserved renderer. Disabling Overdrive restores the complete legacy fallback.
if(typeof PGAfterglowAnimations!=='undefined'&&!PGAfterglowAnimations.overdriveInstalled){
  const legacyCreate=PGAfterglowAnimations.create,known=new Set(PGAfterglowAnimations.catalog.map(f=>f.id));
  PGAfterglowAnimations.catalog.push(...PGSkillOverdrive.catalog.filter(f=>f.ascension&&!known.has(f.id)));
  PGAfterglowAnimations.overdriveInstalled=true;PGAfterglowAnimations.legacyCreate=legacyCreate;
  PGAfterglowAnimations.create=g=>{const legacy=legacyCreate(g),overdrive=PGSkillOverdrive.create(g);return(id,t,detail=1)=>(PGSkillOverdrive.enabled&&PGSkillOverdrive.has(id)?overdrive:legacy)(id,t,detail)};
}
