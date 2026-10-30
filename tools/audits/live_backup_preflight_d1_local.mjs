// Synthetic local workerd/D1 schema preflight; never contacts production.
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
import {describeSchema} from '../staging/live_backup_preflight.mjs';
const m=createRequire(import.meta.url)(process.env.PG_MINIFLARE_MODULE||'miniflare');
const opts={host:'127.0.0.1',cf:false,modules:true,compatibilityDate:'2026-10-01',script:'export default { fetch(){return new Response("synthetic only")} }',d1Databases:{DB:'preflight-synthetic'}};
const mf=new m.Miniflare(m.convertV4MiniflareOptions?m.convertV4MiniflareOptions(opts):opts);
try {
 const db=await mf.getD1Database('DB');await db.exec('CREATE TABLE users(id INTEGER PRIMARY KEY,email TEXT COLLATE NOCASE); CREATE UNIQUE INDEX idx_users_email ON users(email COLLATE NOCASE) WHERE email IS NOT NULL; CREATE TABLE saves(user_id INTEGER); CREATE TABLE sessions(user_id INTEGER);');
 const q=async x=>(await db.prepare(x).all()).results;
 const data=describeSchema({tables:await q("SELECT name FROM sqlite_master WHERE type='table'"),columns:await q('PRAGMA table_info(users)'),indexes:await q('PRAGMA index_list(users)'),indexColumns:await q('PRAGMA index_xinfo(idx_users_email)'),ledger:null});
 assert.equal(data.uniqueEmailIndex,'present');assert.equal(data.emailColumn,'present');
 console.log('PASS: disposable workerd/D1 supports schema inspection and email-index checks');
} finally {await mf.dispose()}
