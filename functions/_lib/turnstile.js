// Verify a Cloudflare Turnstile token. If TURNSTILE_SECRET is unset (local wrangler / tests),
// verification is skipped so offline play still works.
export async function verifyTurnstile(env, request, token) {
  const secret = env && env.TURNSTILE_SECRET;
  if (!secret) return { ok: true, skipped: true };
  if (!token || typeof token !== 'string' || token.length < 20 || token.length > 4096) {
    return { ok: false };
  }
  const ip = request.headers.get('CF-Connecting-IP') || '';
  const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ secret, response: token, remoteip: ip }),
  });
  const out = await res.json().catch(() => ({}));
  return { ok: !!out.success };
}
