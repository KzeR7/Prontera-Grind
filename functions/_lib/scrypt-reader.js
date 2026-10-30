// Reader-only compatibility for a future password migration. This release never writes
// scrypt hashes. Do not enable writes before hosted tests and an approved rollback plan.
// Exactly one fixed profile is accepted; stored input cannot select CPU/memory cost.
import { scryptSync, timingSafeEqual } from 'node:crypto';
import { Buffer } from 'node:buffer';

export function verifyScryptV1(secret, encoded) {
  if (typeof encoded !== 'string') return false;
  const parts = encoded.split('$');
  if (parts.length !== 3 || parts[0] !== 'pg-scrypt-v1' ||
      !/^[A-Za-z0-9_-]{22}$/.test(parts[1]) || !/^[A-Za-z0-9_-]{43}$/.test(parts[2])) return false;
  const salt = Buffer.from(parts[1], 'base64url'), expected = Buffer.from(parts[2], 'base64url');
  if (salt.length !== 16 || expected.length !== 32 || salt.toString('base64url') !== parts[1] ||
      expected.toString('base64url') !== parts[2]) return false;
  // Runtime/resource failures propagate instead of being disguised as invalid credentials.
  const actual = scryptSync(secret, salt, 32, { N: 16384, r: 8, p: 5, maxmem: 32 * 1024 * 1024 });
  return timingSafeEqual(actual, expected);
}
