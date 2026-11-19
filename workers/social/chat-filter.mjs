// workers/social/chat-filter.mjs — Deterministic, local World chat word filter.
//
// Policy scope:
//   - Enforced on World chat (`channel === 'world'`) for all users including GM/owner.
//   - Local (plaza) and Whisper (direct) chat are NOT filtered by this module.
//   - Targets English profanity, slurs, and severe harassment (does not claim universal
//     language coverage).
//   - Zero external calls, zero DO alarms/messages, zero D1 writes.

export const CHAT_POLICY_VERSION = '2026-11-19.v1';
export const REJECT_MESSAGE = 'Please rephrase your message.';

// Whole-token blocked words (normalized lowercase, ASCII).
const BLOCKED_WORDS = new Set([
  'fuck', 'fucker', 'fucking', 'fucked', 'fucks', 'motherfucker',
  'shit', 'shitty', 'bullshit', 'shitting',
  'bitch', 'bitches', 'bitching',
  'cunt', 'cunts',
  'dick', 'dicks', 'dickhead',
  'cock', 'cocks', 'cocksucker',
  'pussy', 'pussies',
  'whore', 'whores', 'slut', 'sluts',
  'bastard', 'bastards',
  'asshole', 'assholes', 'dumbass', 'jackass',
  'nigger', 'niggers', 'nigga', 'niggas',
  'faggot', 'faggots', 'fag', 'fags',
  'retard', 'retards', 'retarded',
  'kike', 'spic', 'chink', 'wetback', 'tranny',
  'kys',
]);

// Multi-word blocked phrases (normalized space-separated tokens).
const BLOCKED_PHRASES = [
  'kill yourself',
  'go die',
  'suck my dick',
  'son of a bitch',
];

// Explicit allowlist of benign words & game terms that must never be blocked.
export const ALLOWLIST = new Set([
  'class', 'classes', 'classic', 'assassin', 'assassins', 'assault',
  'pass', 'passed', 'passing', 'password', 'compass', 'glass', 'grass',
  'bass', 'mass', 'massive', 'ambassador', 'cockatrice', 'peacock',
  'dickens', 'therapist', 'hell', 'hello', 'shell', 'dam', 'damn',
]);

const LEET_MAP = {
  '0': 'o',
  '1': 'i',
  '3': 'e',
  '4': 'a',
  '5': 's',
  '7': 't',
  '@': 'a',
  '$': 's',
  '!': 'i',
};

// Strip zero-width & invisible formatting characters, NFKD-decompose, remove combining marks.
function stripInvisibleAndDiacritics(str) {
  return String(str || '')
    .replace(/[\u200B-\u200F\u202A-\u202E\u2060-\u206F\uFEFF\u00AD]/g, '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function deobfuscateToken(tok) {
  let out = '';
  for (let i = 0; i < tok.length; i++) {
    const ch = tok[i];
    out += LEET_MAP[ch] || ch;
  }
  // Collapse 3+ repeated characters to 1 (e.g. "fuuuuck" -> "fuck", "shiiiit" -> "shit").
  return out.replace(/(.)\1{2,}/g, '$1');
}

export function isWorldChatAllowed(text) {
  const cleaned = stripInvisibleAndDiacritics(text);
  if (!cleaned) return true;

  // Tokenize on non-alphanumeric (keeping @, $, ! for leetspeak inside words).
  const rawTokens = cleaned.split(/[^a-z0-9@$!]+/).filter(Boolean);
  if (!rawTokens.length) return true;

  const normTokens = rawTokens.map(deobfuscateToken);

  for (const tok of normTokens) {
    if (ALLOWLIST.has(tok)) continue;
    if (BLOCKED_WORDS.has(tok)) return false;
  }

  // Check multi-word phrases on normalized token sequence.
  const joined = normTokens.join(' ');
  for (const phrase of BLOCKED_PHRASES) {
    if (joined.includes(phrase)) return false;
  }

  // Check spaced-out single-letter obfuscation (e.g. "f u c k" -> "fuck").
  let run = '';
  for (const tok of normTokens) {
    if (tok.length === 1) {
      run += tok;
    } else {
      if (run.length >= 3 && !ALLOWLIST.has(run) && BLOCKED_WORDS.has(run)) return false;
      run = '';
    }
  }
  if (run.length >= 3 && !ALLOWLIST.has(run) && BLOCKED_WORDS.has(run)) return false;

  return true;
}
