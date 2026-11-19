// Local-only tests for the fixed v411 staging launcher. No Wrangler, Cloudflare or remote D1 access.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {
  RIFT_RAID_STAGE,BASE_SCHEMA,RAID_COLUMN_SCHEMA,pagesConfig,socialConfig,extractBuild,migrationObjects,
  missingMigrationObjects,missingBaseSchema,missingRaidColumns,stageProbeSource,stagingDeploymentUrl,verifyDeployment,
} from '../staging/rift_raid_stage.mjs';

assert.equal(RIFT_RAID_STAGE.branch,'arena/6f878512-prontera-grind');
assert.equal(RIFT_RAID_STAGE.build,'2026-11-15 haven-v411 Rift Raid party previews and ready checks');
assert.equal(extractBuild(fs.readFileSync('index.html','utf8')),RIFT_RAID_STAGE.build);

const pages=pagesConfig(),social=socialConfig();
assert.match(pages,/name = "prontera-grind-staging"/);
assert.match(pages,/database_name = "pg-staging"/);
assert.match(pages,/database_id = "3a38c6fc-96a8-491d-b97b-fd536e575ca4"/);
assert.match(pages,/script_name = "prontera-social-staging"/);
assert.match(pages,/WRITE_GATE = "off"/);
assert.doesNotMatch(pages,/50a6448b-1f12-466c-a28a-10544bedf750|name = "horizonhaven"|script_name = "prontera-social"\s/);
assert.doesNotMatch(pages,/name = "GATE"|name = "prontera-gate"/);
assert.match(social,/name = "prontera-social-staging"/);
assert.match(social,/workers_dev = false/);
assert.match(social,/new_sqlite_classes = \["Social"\]/);
assert.doesNotMatch(social,/name = "prontera-social"\s|name = "prontera-gate"/);

const migration=fs.readFileSync(RIFT_RAID_STAGE.migration,'utf8');
const objects=migrationObjects(migration);
assert.equal(objects.length,23);
assert.equal(new Set(objects.map(x=>`${x.kind}:${x.name}`)).size,objects.length);
const complete=objects.map(x=>({type:x.kind,name:x.name}));
assert.deepEqual(missingMigrationObjects(complete,objects),[]);
assert.deepEqual(missingMigrationObjects(complete.slice(1),objects),[objects[0]]);
assert(objects.some(x=>x.kind==='table'&&x.name==='raid_accounts'));
assert(objects.some(x=>x.kind==='trigger'&&x.name==='raid_reward_apply'));
assert(objects.some(x=>x.kind==='index'&&x.name==='idx_raid_entries_daily'));
const scratch=new DatabaseSync(':memory:');
try{
  scratch.exec('PRAGMA foreign_keys=ON; CREATE TABLE users(id INTEGER PRIMARY KEY); CREATE TABLE grants(id INTEGER PRIMARY KEY,user_id INTEGER,kind TEXT,payload TEXT,note TEXT,created_by TEXT,created_at INTEGER); CREATE TABLE rate_limits(key TEXT PRIMARY KEY,count INTEGER,window_start INTEGER);');
  scratch.exec(migration);
  const actual=scratch.prepare("SELECT type,name FROM sqlite_master WHERE type IN ('table','index','trigger')").all();
  assert.deepEqual(missingMigrationObjects(actual,objects),[]);
  const actualRaidColumns=new Map(Object.keys(RAID_COLUMN_SCHEMA).map(table=>[table,new Set(scratch.prepare(`PRAGMA table_info(${table})`).all().map(row=>row.name))]));
  assert.deepEqual(missingRaidColumns(actualRaidColumns),[]);
  scratch.exec(migration);
}finally{scratch.close()}

const baseTables=Object.keys(BASE_SCHEMA).map(name=>({name}));
const baseColumns=new Map(Object.entries(BASE_SCHEMA).map(([name,columns])=>[name,new Set(columns)]));
assert.deepEqual(missingBaseSchema({tableRows:baseTables,columnsByTable:baseColumns}),[]);
const noEmail=new Map(baseColumns);noEmail.set('users',new Set(BASE_SCHEMA.users.filter(x=>x!=='email')));
assert.deepEqual(missingBaseSchema({tableRows:baseTables,columnsByTable:noEmail}),['column users.email']);
assert(missingBaseSchema({tableRows:baseTables.filter(x=>x.name!=='friends'),columnsByTable:baseColumns}).includes('table friends'));
const raidColumns=new Map(Object.entries(RAID_COLUMN_SCHEMA).map(([name,columns])=>[name,new Set(columns)]));
assert.deepEqual(missingRaidColumns(raidColumns),[]);
const brokenRaidColumns=new Map(raidColumns);brokenRaidColumns.set('raid_accounts',new Set(RAID_COLUMN_SCHEMA.raid_accounts.filter(x=>x!=='rift_shards')));
assert.deepEqual(missingRaidColumns(brokenRaidColumns),['raid_accounts.rift_shards']);
assert.deepEqual(missingRaidColumns(new Map()),[],'not-yet-created migration tables are not treated as malformed');

const token='a'.repeat(64),probe=stageProbeSource(token);
assert.match(probe,/X-Rift-Stage-Token/);
assert.match(probe,/rift-raid-stage:aaaaaaaaaaaaaaaa/);
assert.match(probe,/SELECT COUNT\(\*\) AS n FROM rate_limits/);
assert.doesNotMatch(probe,/SELECT \*|users|saves/);
assert.throws(()=>stageProbeSource('not-a-random-token'));
assert.equal(stagingDeploymentUrl('Upload complete https://abcdef12.prontera-grind-staging.pages.dev'),'https://abcdef12.prontera-grind-staging.pages.dev');
assert.throws(()=>stagingDeploymentUrl('https://main.prontera-grind-staging.pages.dev'));
assert.throws(()=>stagingDeploymentUrl('https://abcdef12.horizonhaven.pages.dev'));
assert.throws(()=>stagingDeploymentUrl('https://abcdef12.prontera-grind-staging.pages.dev https://1234abcd.prontera-grind-staging.pages.dev'));

const host='https://abcdef12.prontera-grind-staging.pages.dev',routes=[];
await verifyDeployment(host,token,async(target,options={})=>{
  const url=new URL(target);routes.push(url.pathname);
  if(url.pathname==='/version.txt')return new Response(RIFT_RAID_STAGE.build+'\n',{status:200});
  if(url.pathname==='/api/chatcheck')return new Response(JSON.stringify({ok:true,http:426}),{status:200,headers:{'Content-Type':'application/json'}});
  if(url.pathname==='/api/rift-stage-check'){
    assert.equal(options.headers?.['X-Rift-Stage-Token'],token);
    return new Response(JSON.stringify({match:true}),{status:200,headers:{'Content-Type':'application/json'}});
  }
  return new Response('',{status:404});
});
assert.deepEqual(routes,['/version.txt','/api/chatcheck','/api/rift-stage-check']);
await assert.rejects(verifyDeployment('https://abcdef12.horizonhaven.pages.dev',token,async()=>new Response()),/must be a unique deployment/);
await assert.rejects(verifyDeployment(host,token,async target=>{
  if(target.endsWith('/version.txt'))return new Response('wrong build',{status:200});
  return new Response('',{status:500});
}),/not the requested v411/);
await assert.rejects(verifyDeployment(host,token,async target=>{
  if(target.endsWith('/version.txt'))return new Response(RIFT_RAID_STAGE.build,{status:200});
  if(target.endsWith('/api/chatcheck'))return new Response(JSON.stringify({ok:false,http:503}),{status:200});
  return new Response('',{status:404});
}),/SOCIAL binding\/room/);
await assert.rejects(verifyDeployment(host,token,async target=>{
  if(target.endsWith('/version.txt'))return new Response(RIFT_RAID_STAGE.build,{status:200});
  if(target.endsWith('/api/chatcheck'))return new Response(JSON.stringify({ok:true,http:426}),{status:200});
  return new Response(JSON.stringify({match:false}),{status:200});
}),/did not contain the unique marker/);
await assert.rejects(verifyDeployment(host,token,async()=>{throw Error('network down')}),/request failed: network down/);

// Importing the launcher is deliberately local-only; all hosted actions are behind its Windows CLI entry point.
console.log('PASS: fixed v411 source guard data, staging-only configs, 0018 object detection, base-schema stop conditions, and deployment probes');
