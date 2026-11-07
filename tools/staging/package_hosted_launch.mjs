// Package a fixed-target, owner-run isolated staging rehearsal. No deployment.
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const files=['index.html','gm.html','assets/shop-catalog.js','assets/shop.css','assets/shop.js','assets/friends.css','assets/friends.js','assets/combat-audio.js','assets/bgm.js','assets/bgm-tracks.js','assets/social.css','assets/social.js','assets/social-rules.js','assets/social-poker.js','assets/social-scene.js',
 // v342: complete Sanctuary runtime and its catalog-driven, on-demand sprite pack.
 'assets/digimon-sanctuary.js','assets/digimon-battle.js','assets/social-battle.css','assets/social-digimon.js','assets/digimon/roster.js','assets/digimon/base-stats.js','assets/digimon/digidex-portraits.webp','assets/digimon/digidex-portraits.json','assets/digimon/index.json','assets/digimon/v3/catalog.json',
 'assets/digimon/v1/catalog.json','assets/digimon/v1/agumon.png','assets/digimon/v1/gabumon.png','assets/digimon/v1/patamon.png','assets/digimon/v1/palmon.png',
 'assets/digimon/sanctuary/arena-stone.webp','assets/digimon/sanctuary/timber-roof.webp','assets/digimon/sanctuary/walkway-wood.webp','assets/digimon/sanctuary/gym-sand.webp','assets/digimon/sanctuary/gym-plaster.webp',
 'assets/digimon/sanctuary/cc0/woodland-tree.webp','assets/digimon/sanctuary/cc0/medieval_wood.webp','assets/digimon/sanctuary/cc0/rough_pine_door.webp','assets/digimon/sanctuary/cc0/roof_09.webp',
 // v287: plaza pond fishing module + stylesheet (loaded by index.html alongside the social client).
 'assets/social-fishing.js','assets/social-fishing.css',
 'assets/ui/eclipse.css','assets/ui/mobile.css','assets/ui/mobile.js',
 'functions/_lib/db.js','functions/_lib/echo-board.js','functions/_lib/http.js','functions/_lib/friends.js',
 'functions/_lib/validate.js','functions/_lib/damage-monitor.js','functions/_lib/competition-baseline.js',
 'functions/_lib/competition-settlement.js','functions/_lib/unverified-echo.js',
 'functions/_lib/gate-binding.js','functions/_lib/shop.js','functions/api/save.js',
 'functions/api/board.js','functions/api/_middleware.js','functions/api/social.js','functions/api/friends.js',
 // v280: /api/me and /api/sessions now return the durable account id, which the save stamp needs.
 'functions/api/me.js','functions/api/sessions.js',
 'functions/api/shop/checkout.js','functions/api/gm/damage.js',
 // v325: the GM console's Cash Shop tab gained the one-button grant-all action, so the GM shop
 // endpoint is a runtime change this candidate contains - it ships with the package.
 'functions/api/gm/shop.js',
 // v263: the write-pause control endpoint. It answers 404 without the `GATE` binding, so packaging it
 // does not enable anything; it is listed because it is a runtime file this candidate contains.
 'functions/api/gate.js','migrations/0008_damage_monitoring.sql',
 'migrations/0009_competition_settlement.sql','migrations/0010_competition_baseline.sql',
 'migrations/0011_unverified_echo_launch.sql','migrations/0012_friends.sql',
 // v277: comment-only playbook for renaming an account to the owner name `GM`. It creates no schema
 // and changes no rows (tools/tests/migration_sim.js enforces that), but it ships so the packaged
 // deployment documents the same stop-and-check steps as this repo.
 'migrations/0013_gm_owner_name.sql',
 // v275: the build script itself. It generates `_headers`, which decides how long a player's browser
 // may keep the entry point. A staging package built with the old copy would serve a stale
 // index.html and reintroduce exactly the bug the v275 change fixes, so it ships with the package.
 'tools/build_site.sh',
 // v360: the Prontera Grand Aetherwell centerpiece - the vendored r128 GLTFLoader, the owner's
 // 5.6 MB GLB and its reference preview render, plus the build-script rule (tools/build_site.sh
 // above) that keeps the preview out of the published dist tree.
 'assets/vendor/GLTFLoader.r128.js','assets/Fountainfile/Prontera_Grand_Aetherwell.glb','assets/Fountainfile/Prontera_Grand_Aetherwell_Preview.png',
 // v283: Illustrated Rune-Midgard World Atlas assets referenced by index.html and verified by build_site.sh.
 'assets/world-map/world-map-cleaned.webp',
 'assets/world-map/birds-flock-a.webp',
 'assets/world-map/birds-flock-b.webp',
 'assets/world-map/cloud-direct.webp',
 'assets/world-map/cloud-mask-16x9.webp',
 'assets/world-map/cutout/prontera.png',
 'assets/world-map/cutout/geffen.png',
 'assets/world-map/cutout/payon.png',
 'assets/world-map/cutout/morroc.png',
 'assets/world-map/cutout/comodo.png',
 'assets/world-map/cutout/niflheim.png',
 'assets/world-map/cutout/amatsu.png',
  'assets/world-map/cutout/louyang.png',
  'assets/atlas/fountain-plaza.jpg',
  'functions/api/grants.js',
  'functions/api/messages.js',
  'assets/social/fish/MANIFEST.json',
  'assets/social/fish/abysssaw.png',
  'assets/social/fish/ambernail.png',
  'assets/social/fish/angelfin.png',
  'assets/social/fish/angeling.png',
  'assets/social/fish/arapaima.png',
  'assets/social/fish/arowana.png',
  'assets/social/fish/azurwhale.png',
  'assets/social/fish/bamboo.png',
  'assets/social/fish/baphobass.png',
  'assets/social/fish/barbel.png',
  'assets/social/fish/bass.png',
  'assets/social/fish/beluga.png',
  'assets/social/fish/betta.png',
  'assets/social/fish/bitterling.png',
  'assets/social/fish/bleak.png',
  'assets/social/fish/bluefin.png',
  'assets/social/fish/bream.png',
  'assets/social/fish/candyopus.png',
  'assets/social/fish/candyshrimp.png',
  'assets/social/fish/carp.png',
  'assets/social/fish/carpetshark.png',
  'assets/social/fish/catfish.png',
  'assets/social/fish/catshark.png',
  'assets/social/fish/chub.png',
  'assets/social/fish/cobblewhale.png',
  'assets/social/fish/coelacanth.png',
  'assets/social/fish/colossus.png',
  'assets/social/fish/crappie.png',
  'assets/social/fish/crawdad.png',
  'assets/social/fish/crownhorse.png',
  'assets/social/fish/crucian.png',
  'assets/social/fish/dace.png',
  'assets/social/fish/dart.png',
  'assets/social/fish/discus.png',
  'assets/social/fish/dragonet.png',
  'assets/social/fish/emberturtle.png',
  'assets/social/fish/emperium.png',
  'assets/social/fish/fountainfish.png',
  'assets/social/fish/galaxyopus.png',
  'assets/social/fish/gar.png',
  'assets/social/fish/gemsnail.png',
  'assets/social/fish/ghosthorse.png',
  'assets/social/fish/ghostring.png',
  'assets/social/fish/ghostshark.png',
  'assets/social/fish/glassback.png',
  'assets/social/fish/glasssnail.png',
  'assets/social/fish/goblin.png',
  'assets/social/fish/goby.png',
  'assets/social/fish/greatmaw.png',
  'assets/social/fish/greatwhite.png',
  'assets/social/fish/greenshell.png',
  'assets/social/fish/greywhale.png',
  'assets/social/fish/gudgeon.png',
  'assets/social/fish/guppy.png',
  'assets/social/fish/hammer.png',
  'assets/social/fish/hammerpup.png',
  'assets/social/fish/heartback.png',
  'assets/social/fish/hornshark.png',
  'assets/social/fish/hydrasquid.png',
  'assets/social/fish/ide.png',
  'assets/social/fish/killi.png',
  'assets/social/fish/koi.png',
  'assets/social/fish/kraken.png',
  'assets/social/fish/krill.png',
  'assets/social/fish/lantern.png',
  'assets/social/fish/lanternshark.png',
  'assets/social/fish/lanternshrimp.png',
  'assets/social/fish/lavasnail.png',
  'assets/social/fish/leafdragon.png',
  'assets/social/fish/leopardshark.png',
  'assets/social/fish/leviathan.png',
  'assets/social/fish/loach.png',
  'assets/social/fish/lobster.png',
  'assets/social/fish/mahi.png',
  'assets/social/fish/makoshark.png',
  'assets/social/fish/manta.png',
  'assets/social/fish/marlin.png',
  'assets/social/fish/mekong.png',
  'assets/social/fish/minnow.png',
  'assets/social/fish/mintwhale.png',
  'assets/social/fish/molly.png',
  'assets/social/fish/moonopus.png',
  'assets/social/fish/moonray.png',
  'assets/social/fish/moonturtle.png',
  'assets/social/fish/morayeel.png',
  'assets/social/fish/mudskip.png',
  'assets/social/fish/mullet.png',
  'assets/social/fish/nebulasnail.png',
  'assets/social/fish/ninespine.png',
  'assets/social/fish/nurseshark.png',
  'assets/social/fish/oarfish.png',
  'assets/social/fish/octo.png',
  'assets/social/fish/opalsnail.png',
  'assets/social/fish/paddlefish.png',
  'assets/social/fish/peppershrimp.png',
  'assets/social/fish/perch.png',
  'assets/social/fish/phoenixfish.png',
  'assets/social/fish/piranha.png',
  'assets/social/fish/platy.png',
  'assets/social/fish/porbeagle.png',
  'assets/social/fish/poring.png',
  'assets/social/fish/prismsnail.png',
  'assets/social/fish/pumpkinseed.png',
  'assets/social/fish/pupfish.png',
  'assets/social/fish/reedeel.png',
  'assets/social/fish/ribbonhorse.png',
  'assets/social/fish/ribbonsturgeon.png',
  'assets/social/fish/roach.png',
  'assets/social/fish/rosedolphin.png',
  'assets/social/fish/royalshrimp.png',
  'assets/social/fish/salmon.png',
  'assets/social/fish/sawfin.png',
  'assets/social/fish/seahorse.png',
  'assets/social/fish/seraphkoi.png',
  'assets/social/fish/shellsnail.png',
  'assets/social/fish/shrimplet.png',
  'assets/social/fish/silvershark.png',
  'assets/social/fish/smelt.png',
  'assets/social/fish/snapper.png',
  'assets/social/fish/spirlin.png',
  'assets/social/fish/squid.png',
  'assets/social/fish/starhull.png',
  'assets/social/fish/staropus.png',
  'assets/social/fish/starwhale.png',
  'assets/social/fish/stickle.png',
  'assets/social/fish/stingray.png',
  'assets/social/fish/sturgeon.png',
  'assets/social/fish/sunhorse.png',
  'assets/social/fish/sunny.png',
  'assets/social/fish/sunorca.png',
  'assets/social/fish/sunperch.png',
  'assets/social/fish/sunshark.png',
  'assets/social/fish/tadpole.png',
  'assets/social/fish/tench.png',
  'assets/social/fish/tetra.png',
  'assets/social/fish/thornhorse.png',
  'assets/social/fish/thresher.png',
  'assets/social/fish/tidehorse.png',
  'assets/social/fish/tigershark.png',
  'assets/social/fish/topminnow.png',
  'assets/social/fish/trout.png',
  'assets/social/fish/violetbeluga.png',
  'assets/social/fish/voidfin.png',
  'assets/social/fish/voidshrimp.png',
  'assets/social/fish/whaleshark.png',
  'assets/social/fish/zander.png'];
// The catalog is part of the integrity-checked payload. Require exactly the two
// per-form files it names; no 561-entry duplicate manifest can drift out of sync.
const digimonCatalog=JSON.parse(fs.readFileSync(path.join(root,'assets/digimon/v3/catalog.json'),'utf8'));
if(digimonCatalog.version!==3||Object.keys(digimonCatalog.species||{}).length!==280)throw Error('Complete Digimon v3 catalog required');
for(const record of Object.values(digimonCatalog.species))for(const key of ['image','meta'])files.push('assets/digimon/v3/'+record[key]);
if(process.argv.length!==3)throw Error('Usage: node tools/staging/package_hosted_launch.mjs <output.mjs>');
// Refuse to generate a mixed-version deployment if the runtime or assets have
// changed beyond this explicit overlay. The archive comes from the fixed base.
const base='7511a03c0787ec9b8d94cfc6658570ac402dc297';
// v275: tools/build_site.sh also decides the published cache headers (_headers). A staging package
// built with an older copy of it would ship the stale-entry-point bug the v275 change fixes, so the
// file stays on this list: a local change to it fails closed here instead of shipping quietly.
const relevant=p=>['index.html','gm.html','_routes.json','tools/build_site.sh'].includes(p)||
 p.startsWith('functions/')||p.startsWith('migrations/')||p.startsWith('assets/');
const baseEntries=execFileSync('git',['ls-tree','-rz','--full-tree',base],{cwd:root,maxBuffer:20*1024*1024}).toString().split('\0').filter(Boolean);
const baseline=new Map(baseEntries.map(entry=>{const m=entry.match(/^\d+ blob ([0-9a-f]+)\t([\s\S]+)$/);if(!m)throw Error('Unexpected archive tree');return [m[2],m[1]]}));
const all=execFileSync('git',['ls-files','--cached','--others','--exclude-standard','-z'],{cwd:root,maxBuffer:20*1024*1024}).toString().split('\0').filter(Boolean);
for(const p of new Set(all)){
 if(!relevant(p)||!fs.existsSync(path.join(root,p))||!fs.statSync(path.join(root,p)).isFile())continue;
 const b=fs.readFileSync(path.join(root,p));
 const hash=createHash('sha1').update(Buffer.from(`blob ${b.length}\0`)).update(b).digest('hex');
 if(hash!==baseline.get(p)&&!files.includes(p)){
  // Windows checkouts can have CRLF while the committed blob has LF. Ask Git
  // to apply its configured clean/eol filters, but ONLY for mismatched files;
  // a genuinely changed or newly added runtime file still fails closed.
  const cleaned=execFileSync('git',['hash-object','--path='+p,'--',p],{cwd:root,encoding:'utf8'}).trim();
  if(cleaned!==baseline.get(p))throw Error('Unpackaged runtime change: '+p);
 }
}
for(const p of baseline.keys())if(relevant(p)&&!fs.existsSync(path.join(root,p)))throw Error('Missing archive runtime file: '+p);

// v360: the Aetherwell GLB is binary like the atlases - utf8 would silently corrupt it.
const isBin=p=>/\.(?:png|webp|glb)$/i.test(p);
const data=Object.fromEntries(files.map(p=>[p,isBin(p)?'base64:'+fs.readFileSync(path.join(root,p)).toString('base64'):fs.readFileSync(path.join(root,p),'utf8')]));
const packed=gzipSync(Buffer.from(JSON.stringify(data))),hash=createHash('sha256').update(packed).digest('hex');
let src=fs.readFileSync(path.join(root,'tools/staging/hosted_launch_stage.mjs'),'utf8');
for(const [marker,value] of [['__LAUNCH_PACKAGE_PAYLOAD__',packed.toString('base64')],['__LAUNCH_PACKAGE_SHA256__',hash]]){
 if(src.split(marker).length!==2)throw Error('Unexpected package template');src=src.replace(marker,value);
}
const output=path.resolve(process.argv[2]);fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,src);
console.log(`Prepared ${output} (${packed.length} bytes compressed). No migration or deployment performed.`);
