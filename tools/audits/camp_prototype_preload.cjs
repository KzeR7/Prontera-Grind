// Opt-in Node preload for comparing existing suites with an unapproved in-memory
// camp-radius prototype. Reads/writes no game file. Never use for production/builds.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const game=path.resolve(__dirname,'../../index.html'),read=fs.readFileSync;
fs.readFileSync=function(file,...args){
  const data=read.call(this,file,...args);
  if(typeof file!=='string'||path.resolve(file)!==game)return data;
  assert.equal(typeof data,'string','prototype requires a UTF-8 read of index.html');
  const a='CAMP_RING_MAX*1.45',b='CAMP_RING_MAX*1.75';
  assert.equal(data.split(a).length,2);assert.equal(data.split(b).length,2);
  process.stderr.write('AUDIT: unapproved camp prototype substituted in memory; no file changed\n');
  return data.replace(a,'3.35').replace(b,'3.35');
};
