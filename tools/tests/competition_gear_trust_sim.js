// Synthetic proof of the current trust boundary, not an anti-cheat or a leaderboard.
// The server must not treat a plausible item in a browser-authored save as proof
// that it was earned. Real gameplay, gear and old saves must remain intact.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { freshDb, makeD1 } from '../dev_server.js';
import { onRequestPost as register } from '../../functions/api/register.js';
import { onRequestPut as save } from '../../functions/api/save.js';
import { onRequestGet as board } from '../../functions/api/board.js';
const require=createRequire(import.meta.url), {createGame}=require('./helpers/game');
const game=createGame(), sqlite=freshDb(), DB=makeD1(sqlite), env={DB};
const req=(route,method,body,cookie)=>new Request('https://game.test/api/'+route,{
  method,headers:{...(body?{'Content-Type':'application/json'}:{}),...(cookie?{Cookie:cookie}:{})},
  ...(body?{body:JSON.stringify(body)}:{})});
try {
  // This looks exactly like gear produced by the real drop generator, but is
  // created in a test browser without any kill, drop, spend or server receipt.
  const sample=JSON.parse(game.ev(`(()=>{S=fresh();return JSON.stringify(genGear({k:'dagger',n:'Test Knife'},15,5,false,4,9,15))})()`));
  assert.ok(sample.val>0&&sample.aff.length>0);
  const signup=await register({request:req('register','POST',{u:'GearProof',p:'Synthetic-pass-123!',email:'gearproof@example.test'}),env});
  assert.equal(signup.status,201);
  const cookie=signup.headers.get('set-cookie').split(';')[0];
  const state=JSON.parse(game.ev('JSON.stringify(fresh())'));
  state.owner='GearProof';state.eq.weapon=sample;
  const upload=await save({request:req('save','PUT',{owner:'GearProof',version:0,blob:JSON.stringify(state)},cookie),env});
  assert.equal(upload.status,200,'personal save intentionally remains compatible');
  const saved=JSON.parse(sqlite.prepare("SELECT s.blob FROM saves s JOIN users u ON u.id=s.user_id WHERE u.username='GearProof'").get().blob);
  assert.deepEqual(saved.eq.weapon,sample,'plausible client-minted gear is accepted into personal saves');
  const result=await board({request:req('board?board=echo','GET',null,cookie),env});assert.equal(result.status,200);assert.equal((await result.json()).integrity,'unverified');
  assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM leaderboard_echo').get().n,0);
  assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM grants').get().n,0);
  console.log('PASS: realistic client-minted gear is preserved in personal saves, and the board explicitly reports unverified integrity');
} finally { sqlite.close(); game.close(); }
