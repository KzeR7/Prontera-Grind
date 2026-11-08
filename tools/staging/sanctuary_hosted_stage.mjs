// Owner-run, fixed-target Sanctuary staging deployment. No production project, database,
// credential, or working-tree edit is accepted. Generation/import has no hosted side effects.
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import https from 'node:https';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

export const SANCTUARY_STAGE=Object.freeze({
 commit:'adf4f99eef86aa7af3bc5effdb84cf362716cde3',
 build:'2026-11-08 haven-v362 plaza fingerprint guard — page and Social Worker must match',
 pagesProject:'prontera-grind-staging',
 branchUrl:'https://main.prontera-grind-staging.pages.dev',
 socialProject:'prontera-social-staging',
 dbName:'pg-staging',
 dbId:'3a38c6fc-96a8-491d-b97b-fd536e575ca4'
});

export function sanctuaryPagesConfig(){
 const s=SANCTUARY_STAGE;
 return `name = "${s.pagesProject}"\ncompatibility_date = "2026-10-01"\npages_build_output_dir = "dist"\n\n[[d1_databases]]\nbinding = "DB"\ndatabase_name = "${s.dbName}"\ndatabase_id = "${s.dbId}"\n\n[[durable_objects.bindings]]\nname = "SOCIAL"\nclass_name = "Social"\nscript_name = "${s.socialProject}"\n`;
}

export function sanctuarySocialConfig(){
 const s=SANCTUARY_STAGE;
 return `name = "${s.socialProject}"\nmain = "index.mjs"\ncompatibility_date = "2026-10-01"\nworkers_dev = false\n\n[[durable_objects.bindings]]\nname = "SOCIAL"\nclass_name = "Social"\n\n[[migrations]]\ntag = "v1"\nnew_sqlite_classes = ["Social"]\n`;
}

export function sanctuaryDeploymentUrl(output){
 const urls=String(output).match(/https:\/\/[a-z0-9-]+\.prontera-grind-staging\.pages\.dev\b/g)||[];
 const url=urls.find(x=>/^https:\/\/[0-9a-f]{8}\.prontera-grind-staging\.pages\.dev$/.test(x));
 assert(url,'Could not identify the unique Sanctuary staging deployment URL. Inspect staging before retrying.');
 return url;
}

function run(command,args,{cwd,allowOutput=false}={}){
 const p=spawnSync(command,args,{cwd,encoding:'utf8',timeout:300000,maxBuffer:20*1024*1024,
  env:{...process.env,WRANGLER_SEND_METRICS:'false',CI:'true'}});
 if(p.error||p.status!==0)throw Error(`${path.basename(command)} failed (exit ${p.status??'unavailable'}). ${allowOutput?(p.stderr||p.stdout||'').slice(-2000):'Check staging access and tools privately.'}`);
 return p.stdout;
}

function npxCli(){
 const found=process.platform==='win32'?run('where.exe',['npx.cmd']).split(/\r?\n/).map(x=>x.trim()).filter(Boolean):[];
 const dirs=[path.dirname(process.execPath),...found.map(x=>path.dirname(x))];
 const candidates=dirs.flatMap(d=>[path.join(d,'node_modules','npm','bin','npx-cli.js'),path.resolve(d,'..','lib','node_modules','npm','bin','npx-cli.js')]);
 const result=candidates.find(x=>fs.existsSync(x));
 if(!result)throw Error('Could not find npm npx-cli.js. No staging resource was changed.');
 return result;
}

// Pages deploy reads wrangler.toml from its cwd. Other commands select our fixed file explicitly.
function wrangler(cwd,args){
 const config=args[0]==='pages'?[]:['--config','wrangler.toml'];
 return run(process.execPath,[npxCli(),'--yes','wrangler@4.154.0',...args,...config],{cwd});
}

function jsonWrangler(cwd,args){
 const text=wrangler(cwd,args);
 try{return JSON.parse(text)}catch{throw Error('Wrangler returned an unreadable staging response. Inspect it privately before retrying.')}
}

function repoWithStageCommit(){
 const candidates=[process.cwd(),path.join(os.homedir(),'Desktop','Prontera-Grind'),path.join(os.homedir(),'Desktop','Prontera-Grind-staging')];
 for(const repo of candidates){
  if(!fs.existsSync(path.join(repo,'.git')))continue;
  const result=spawnSync('git',['-C',repo,'rev-parse','--verify',SANCTUARY_STAGE.commit+'^{commit}'],{encoding:'utf8'});
  if(result.status===0&&result.stdout.trim()===SANCTUARY_STAGE.commit)return repo;
 }
 throw Error('Cannot find the reviewed v350 commit in a Prontera-Grind checkout. Fetch PR #180 first; nothing was deployed.');
}

// v360: undici's fetch rejects `Upgrade` as a fetch-spec forbidden header (the owner's first
// v360 verify died with UND_ERR_INVALID_ARG), but /api/social needs that header to get past
// its WebSocket gate (426) to the binding (503) and session (401) checks. The default
// transport therefore probes upgrade requests over raw node:https/http - which has no
// forbidden-header list and never follows redirects - and keeps fetch for everything else.
const defaultGet=async(target,options={})=>{
 if(options.headers&&options.headers.Upgrade){
  const u=new URL(target);
  return await new Promise((resolve,reject)=>{
   const req=(u.protocol==='https:'?https:http).request(u,{method:'GET',headers:options.headers},res=>{res.resume();resolve({status:res.statusCode})});
   req.setTimeout(30000,()=>req.destroy(Error('network timeout')));
   req.on('error',reject);req.end();
  });
 }
 return fetch(target,{...options,signal:AbortSignal.timeout(30000)});
};
export async function verifyDeployment(url,getImpl=defaultGet){
 async function get(route,options={}){
  try{return await getImpl(url+route,options)}
  catch(e){throw Error(`Staging ${route} request failed: ${e?.cause?.code||e.message||'network error'}`)}
 }
 const version=await get('/version.txt',{cache:'no-store'});
 assert.equal(version.status,200,'Staging /version.txt returned HTTP '+version.status);
 assert.equal((await version.text()).trim(),SANCTUARY_STAGE.build,'The staged site is not the reviewed v350 build');
 // With no session, the Function must reach the auth check (401). A missing SOCIAL binding is 503.
 const social=await get('/api/social',{headers:{Origin:url,Upgrade:'websocket'},redirect:'manual'});
 assert.equal(social.status,401,'Staging /api/social returned HTTP '+social.status+'; expected 401 with the binding present and no session');
}

async function main(){
 assert.equal(process.platform,'win32','Run this owner launcher on the existing Windows staging setup.');
 assert.equal(process.argv.length,2,'This fixed-target staging launcher takes no arguments.');
 const repo=repoWithStageCommit();
 const bash=['D:\\Git\\bin\\bash.exe','C:\\Program Files\\Git\\bin\\bash.exe','C:\\Program Files (x86)\\Git\\bin\\bash.exe'].find(x=>fs.existsSync(x));
 assert(bash,'Cannot find Git bash.exe. Nothing was deployed.');
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'pg-sanctuary-stage-'));
 const archive=path.join(temp,'reviewed.tar');
 console.log('Preparing an untouched temporary copy of reviewed commit '+SANCTUARY_STAGE.commit.slice(0,7)+'…');
 run('git',['-C',repo,'archive','--format=tar','--output='+archive,SANCTUARY_STAGE.commit]);
 run('tar.exe',['-xf',archive,'-C',temp]);fs.unlinkSync(archive);
 fs.writeFileSync(path.join(temp,'wrangler.toml'),sanctuaryPagesConfig());
 fs.writeFileSync(path.join(temp,'workers','social','wrangler.toml'),sanctuarySocialConfig());
 run(bash,['tools/build_site.sh'],{cwd:temp,allowOutput:true});

 const db=jsonWrangler(temp,['d1','info','DB','--json']);
 assert.equal(db.uuid,SANCTUARY_STAGE.dbId,'The remote database is not the fixed pg-staging database. Stopped.');
 assert.equal(db.name,SANCTUARY_STAGE.dbName,'The remote database name is not pg-staging. Stopped.');
 const schema=jsonWrangler(temp,['d1','execute','DB','--remote','--json','--command','SELECT (SELECT COUNT(*) FROM users) AS users, (SELECT COUNT(*) FROM sessions) AS sessions, (SELECT COUNT(*) FROM saves) AS saves, (SELECT COUNT(*) FROM friends) AS friends;']);
 assert(Array.isArray(schema)&&schema.every(x=>x.success===true),'The isolated staging account schema is incomplete; no deployment was made.');

 console.log('Verified pg-staging. Deploying only '+SANCTUARY_STAGE.socialProject+'…');
 wrangler(path.join(temp,'workers','social'),['deploy']);
 console.log('Deploying only '+SANCTUARY_STAGE.pagesProject+' with the staging Social binding…');
 const url=sanctuaryDeploymentUrl(wrangler(temp,['pages','deploy','dist','--project-name',SANCTUARY_STAGE.pagesProject,'--branch','main']));
 console.log('\nStaging deployment: '+url);
 console.log('Staging branch URL: '+SANCTUARY_STAGE.branchUrl+' (the project root may belong to an older production branch)');
 try{await verifyDeployment(url);console.log('Sanctuary staging is verified and ready.')}
 catch(e){console.error('VERIFY: deployment completed, but automatic verification did not pass: '+String(e.message||e));console.log('Open the staging URL above and check it in your browser before retrying anything.')}
 console.log('Use synthetic accounts only. Open two isolated browser profiles for two-player PvP.');
 console.log('No production project/database was targeted. Temporary audited copy: '+temp);
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(e=>{console.error('STOP: '+String(e.message||e));process.exitCode=1});
