// Synthetic-only: no credentials, Cloudflare calls, real backups or restores.
import assert from 'node:assert/strict';
import {validateIdentity,validateBookmark,validateTime,parseSingapore,singaporeTime,options,inspect,checkReadiness} from '../recovery/select_restore_point.mjs';
const now=Date.parse('2026-10-30T01:45:00.000Z'), DAY=86400000;
const valid={name:'pg',uuid:'50a6448b-1f12-466c-a28a-10544bedf750',version:'production'};
const mark='00000085-0000024c-00004c6d-8e61117bf38d7adb71b934ebbf891683';
validateIdentity(valid);
for(const value of [{...valid,name:'pg-staging'},{...valid,uuid:'incorrect'},{...valid,version:'alpha'},null])
 assert.throws(()=>validateIdentity(value));
assert.equal(validateBookmark({bookmark:mark}),mark);
for(const value of [{bookmark:'oops'},null,{bookmark:mark+'x'}])assert.throws(()=>validateBookmark(value));
assert.equal(parseSingapore('2026-10-30 09:44',now),now-60000);
assert.equal(singaporeTime(now),'2026-10-30 09:45:00 SGT (UTC+08:00)');
for(const value of ['2026-02-30 10:00','2026-10-30 09:46','2026-10-23 09:45','2026/10/30 09:40','2026-10-30 24:10',''])
 assert.throws(()=>parseSingapore(value,now));
assert.throws(()=>validateTime(now+1,now));assert.throws(()=>validateTime(now-7*DAY,now));
assert.equal(options(now).length,6);assert.equal(options(now)[5].at,now-6*DAY);
const calls=[];
const remote={info(){calls.push('identity');return valid},bookmark(timestamp){calls.push(timestamp);return {bookmark:mark}}};
assert.deepEqual(checkReadiness(remote,now),{current:mark,sixDays:mark});
assert.deepEqual(calls,['identity',undefined,'2026-10-24T01:45:00.000Z']);calls.length=0;
const result=inspect(remote,now-DAY,now);
assert.deepEqual(calls,['identity','2026-10-29T01:45:00.000Z']);assert.equal(result.bookmark,mark);
let called=false;assert.throws(()=>inspect({info(){called=true}},now-8*DAY,now));assert.equal(called,false);
called=false;assert.throws(()=>inspect({info(){return {...valid,uuid:'wrong'}},bookmark(){called=true}},now-DAY,now));assert.equal(called,false);
assert.throws(()=>inspect({info:()=>valid,bookmark:()=>({bookmark:'bad'})},now-DAY,now));
console.log('PASS: read-only D1 identity and bookmark validation, 7-day bounds, Singapore time selection and failure stops');
