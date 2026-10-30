// Owner-run READ-ONLY check of live `pg` against the 0008–0011 contract.
// Fixed target, no arguments, no writes: it never calls apply() and never runs a
// migration. Use it when the launch tables already exist and you need to know
// whether that is a complete application or a partial one.
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {TABLES,TRIGGERS,INDEXES,TABLE_QUERY,TRIGGER_QUERY,INDEX_QUERY,CONFIG_QUERY,createRemote}
 from './live_additive_migrations.mjs';

// Reads the live schema. Uses only queries the migration tool already allowlists,
// all of them SELECT/PRAGMA. Returns name lists, never row data.
export function collectLaunchSchema(db){
 const tables=db.query(TABLE_QUERY).map(x=>x.name);
 const triggers=db.query(TRIGGER_QUERY).map(x=>x.name);
 const indexes=db.query(INDEX_QUERY).map(x=>x.name);
 const columns={};
 for(const name of Object.keys(TABLES))
  if(tables.includes(name))columns[name]=db.query(`PRAGMA table_info(${name});`).map(x=>x.name);
 const config=tables.includes('unverified_echo_config')?db.query(CONFIG_QUERY):[];
 return {tables,columns,triggers,indexes,config};
}

// Pure comparison against the contract the migration tool checks after applying,
// reported as a complete list of gaps instead of stopping at the first one.
export function evaluateLaunchSchema(snapshot){
 const {tables=[],columns={},triggers=[],indexes=[],config=[]}=snapshot||{};
 const missingTables=Object.keys(TABLES).filter(n=>!tables.includes(n));
 const badColumns=[];
 for(const [name,expected] of Object.entries(TABLES)){
  if(!tables.includes(name))continue;
  const actual=columns[name];
  if(!Array.isArray(actual)){badColumns.push({table:name,expected,actual:null});continue}
  if(JSON.stringify(actual)!==JSON.stringify(expected))badColumns.push({table:name,expected,actual});
 }
 const missingTriggers=TRIGGERS.filter(n=>!triggers.includes(n));
 const missingIndexes=INDEXES.filter(n=>!indexes.includes(n));
 const configProblems=[];
 if(missingTables.includes('unverified_echo_config'))configProblems.push('config table is missing');
 else if(config.length!==1)configProblems.push('expected exactly one config row, found '+config.length);
 else{
  if(Number(config[0].starts_at)!==0)configProblems.push('starts_at is not 0');
  if(config[0].ruleset!=='unverified-save-v1')configProblems.push('ruleset is not unverified-save-v1');
 }
 const ok=!missingTables.length&&!badColumns.length&&!missingTriggers.length&&!missingIndexes.length&&!configProblems.length;
 return {ok,missingTables,badColumns,missingTriggers,missingIndexes,configProblems};
}
function main(){
 assert.equal(process.platform,'win32','This fixed check is for the owner Windows setup');
 assert.equal(process.argv.length,2,'This check takes no arguments.');
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'pg-launch-schema-check-'));
 try{
  const db=createRemote(temp);
  console.log('Reading the live schema. This performs no writes and runs no migration.');
  db.verify();
  const result=evaluateLaunchSchema(collectLaunchSchema(db));
  console.log(JSON.stringify(result,null,2));
  if(!result.ok){
   console.error('STOP: live pg does not match a complete 0008–0011 application. Do NOT run the migration tool: it refuses on existing launch tables, and it cannot repair a partial one.');
   process.exitCode=1;
   return;
  }
  console.log('PASS: live pg already matches the full 0008–0011 contract (tables, columns, triggers, indexes and launch config). Do NOT run live_additive_migrations.mjs — there is nothing left to apply.');
 }finally{fs.rmSync(temp,{recursive:true,force:true})}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))
 try{main()}catch(e){console.error('STOP: '+String(e.message||'Live schema check failed.'));process.exitCode=1}
