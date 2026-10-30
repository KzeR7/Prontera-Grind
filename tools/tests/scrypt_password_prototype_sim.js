// Synthetic-only prototype: not wired to real accounts, endpoints, or Pages Functions.
import assert from 'node:assert/strict';
import { hashPassword as legacyHash } from '../../functions/_lib/auth.js';
import { hashCandidate, verifyCandidate } from '../prototypes/scrypt_passwords.mjs';

const password='Synthetic-password-123!',other='Incorrect-synthetic-password';
const legacy=await legacyHash(password,20000);
assert.deepEqual(await verifyCandidate(other,legacy),{ok:false,upgrade:null});
const valid=await verifyCandidate(password,legacy);
assert.equal(valid.ok,true);assert.match(valid.upgrade,/^pg-scrypt-v1\$/);
assert.equal((await verifyCandidate(password,valid.upgrade)).ok,true);
assert.deepEqual(await verifyCandidate(other,valid.upgrade),{ok:false,upgrade:null});
assert.deepEqual(await verifyCandidate(password,legacy,{upgrade:false}),{ok:true,upgrade:null});
const second=hashCandidate(password);
assert.notEqual(second,valid.upgrade,'random salts must prevent identical hashes');
assert.equal((await verifyCandidate(password,second)).ok,true);
for(const malformed of ['',null,'unknown$a$b','pg-scrypt-v1$AA$AA',valid.upgrade+'$',
  valid.upgrade.replace('pg-scrypt-v1','pg-scrypt-v2'),valid.upgrade.replace(/.$/,'!')]){
  assert.deepEqual(await verifyCandidate(password,malformed),{ok:false,upgrade:null});
}
console.log('PASS: disconnected synthetic scrypt hashing, bounded format, legacy verification/upgrade, incorrect password, recovery-style no-upgrade, random salts and malformed input.');
