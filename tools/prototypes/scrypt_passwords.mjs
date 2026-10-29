// RESEARCH ONLY: disconnected authentication adapter; never imported by Functions.
// This is NOT an approved migration or a production hash format. Tested only with synthetic data.
// It accepts exactly one bounded profile to avoid attacker-controlled CPU or memory parameters.
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { verifyPassword as verifyLegacy } from '../../functions/_lib/auth.js';

const PREFIX='pg-scrypt-v1', OPTIONS=Object.freeze({N:16384,r:8,p:5,maxmem:32*1024*1024});
function parse(encoded){
  if(typeof encoded!=='string')return null;
  const p=encoded.split('$');
  if(p.length!==3||p[0]!==PREFIX||!/^[A-Za-z0-9_-]{22}$/.test(p[1])||!/^[A-Za-z0-9_-]{43}$/.test(p[2]))return null;
  const salt=Buffer.from(p[1],'base64url'),hash=Buffer.from(p[2],'base64url');
  if(salt.length!==16||hash.length!==32||salt.toString('base64url')!==p[1]||hash.toString('base64url')!==p[2])return null;
  return {salt,hash};
}
export function hashCandidate(secret){
  const salt=randomBytes(16),hash=scryptSync(secret,salt,32,OPTIONS);
  return `${PREFIX}$${salt.toString('base64url')}$${hash.toString('base64url')}`;
}
export async function verifyCandidate(secret,stored,{upgrade=true}={}){
  // Existing PBKDF2 verifier is invoked without its own discarded upgrade; only verified
  // legacy passwords are upgraded. Recovery callers must pass upgrade:false because a
  // successful recovery rotates the code instead of rehashing the consumed code.
  if(typeof stored==='string'&&stored.startsWith('pbkdf2$')){
    const legacy=await verifyLegacy(secret,stored,{upgrade:false});
    return {ok:legacy.ok,upgrade:legacy.ok&&upgrade?hashCandidate(secret):null};
  }
  const parsed=parse(stored);
  if(!parsed)return {ok:false,upgrade:null};
  const actual=scryptSync(secret,parsed.salt,32,OPTIONS);
  return {ok:timingSafeEqual(actual,parsed.hash),upgrade:null};
}
