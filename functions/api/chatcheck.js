// GET /api/chatcheck -> 200 { ok, verdict, http, detail, rules }
//
// WHY THIS EXISTS (v365)
// ----------------------
// The plaza socket is a WebSocket upgrade. When that upgrade fails the browser tells JavaScript
// nothing: no status, no body, no reason - only "connection failed" and then `close 1006`. That
// silence is why "chat is down" took three separate incidents to diagnose from the outside.
//
// After v364 the page can at least say "The API is healthy, so the plaza Worker itself is not
// answering" - true, but it still cannot say WHY the Worker refused. This endpoint answers that on
// the server, where the binding actually lives:
//
//   * is `SOCIAL` bound at all in this deployment?
//   * if it is, does a real request into the Durable Object succeed, and what does it answer?
//   * and - the one that matters for v362's mismatch class - does the Worker's rules fingerprint
//     match this page's?
//
// It deliberately probes the DO with a NON-upgrade request. `Social.fetch()` answers 426
// ("WebSocket required") to a plain request only AFTER its storage is ready - it awaits `this.ready`
// first - so a 426 is proof that the object exists, its bindings resolve, and its state loaded.
// Any 5xx means the object itself is refusing. That distinction is invisible from the browser over
// a websocket upgrade, which is exactly the point.
//
// It is read-only and touches no player row: no session lookup, no D1 read, no writes. The caller
// is a signed-in player holding a socket in their hand, and everything returned is either public
// build identity (the rules fingerprint the room already broadcasts to every client) or a reason
// string that a stranger could not use for anything.
import { json, guard } from '../_lib/http.js';

export const onRequestGet = guard(async ({ env }) => {
  const out = { ok: false, verdict: '', http: 0, detail: '', rules: null };

  // 1. The binding. A Pages deployment that lost its wrangler.toml bindings (a manual upload from a
  //    directory that did not include it) answers here, and nowhere else visible to a browser.
  const social = env && env.SOCIAL;
  if (!social) {
    return json({
      ...out,
      verdict: 'This deployment has no SOCIAL binding, so it cannot reach the plaza Worker at all.',
      detail: 'The Pages project was deployed without the wrangler.toml bindings. Redeploy from the repo (or reconnect the Git integration) rather than uploading a directory by hand.',
    });
  }

  // 2. The hop. This is the exact call functions/api/social.js makes before it returns the upgrade,
  //    minus the websocket headers. Whatever it answers is the real state of the Worker.
  let stub;
  try {
    stub = social.get(social.idFromName('world'));
  } catch (e) {
    return json({
      ...out,
      verdict: 'The SOCIAL binding is present but malformed: it is not a Durable Object namespace.',
      detail: String((e && e.message) || e),
    });
  }

  let res = null;
  let failure = '';
  try {
    res = await stub.fetch(new Request('https://social/connect', {
      method: 'GET',
      headers: {
        // A well-formed but not-webSocket upgrade: the object must reach `WebSocket required`.
        'X-Social-Identity': JSON.stringify({ id: 0, username: '__chatcheck__', friends: [], gm: false }),
      },
    }));
  } catch (e) {
    failure = String((e && e.message) || e);
  }

  if (!res) {
    out.http = 0;
    out.verdict = 'The plaza Worker could not be reached from this deployment: the request into the Durable Object threw.';
    out.detail = failure;
    return json(out);
  }

  const http = res.status;
  out.http = http;
  // The object answers 426 to a non-websocket request once its storage is ready. That is a SUCCESS
  // for this probe: the object exists, its bindings resolve and its state loaded.
  if (http === 426) {
    out.ok = true;
    // v367: "reachable" is not the whole story. A 426 proves the object loads, but the greeting a real
    // socket needs is written later and can fail on its own - and when it does the client only sees a
    // close, never the cause. The room records its last greeting failure; report it here so this
    // endpoint stops reassuring a player whose socket is being refused.
    const greet = res.headers.get('X-Greet-Failed');
    if (greet) {
      out.ok = false;
      out.verdict = 'The plaza Worker is reachable, but it could not greet the last connection: ' + greet;
      out.detail = 'A socket that cannot be greeted is closed immediately (code 4002). This is a room-side fault, not a binding or session problem.';
    } else {
      out.verdict = 'The plaza Worker is reachable and its storage loaded. Chat should connect.';
    }
  } else if (http === 400) {
    out.verdict = 'The plaza Worker answered "Invalid identity": the probe request was rejected before reaching the room.';
  } else if (http === 503) {
    // Room.fetch() answers 503 "Poker ledger unavailable" when its storage read fails (v326). This is
    // the one failure that survives a redeploy, so name it precisely.
    out.verdict = 'The plaza Worker refused the connection because its storage could not be read (503).';
    out.detail = 'The Durable Object exists but a storage read failed. It retries on the next connection; if it persists, the object needs attention in the dashboard.';
  } else if (http >= 500) {
    out.verdict = 'The plaza Worker answered HTTP ' + http + ' - the object is up but is refusing work.';
  } else {
    out.verdict = 'The plaza Worker answered an unexpected HTTP ' + http + '.';
  }

  // 3. The v362 mismatch class, answered for real. The room broadcasts its own fingerprint to every
  //    client; this compares the two builds without needing a socket to stay open. A mismatch means
  //    the page and the Worker were deployed from different commits.
  try {
    const body = await res.text();
    const m = body.match(/[0-9]+(?:\/[0-9]+){7}/);
    if (m) out.rules = m[0];
  } catch { /* a body we cannot read tells us nothing extra */ }

  if (res && res.headers && typeof res.headers.get === 'function') {
    const roomBuild = res.headers.get('X-Room-Build');
    if (roomBuild) out.roomBuild = roomBuild;
  }
  return json(out);
});
