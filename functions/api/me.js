// GET /api/me -> 200 { u, gm, recoverySet } | 401
//
// The client calls this first on load: it is how the game knows the API exists at all, and whether
// this browser already has a session (so it can offer "continue as <name>" instead of showing the
// login card). A 401 here is normal and means "not logged in", not "broken".

import { currentUser, recoverySetFor } from '../_lib/auth.js';
import { json, guard, unauth } from '../_lib/http.js';

export const onRequestGet = guard(async ({ request, env }) => {
  const user = await currentUser(request, env.DB);
  // v307: say WHY there is no session, in a header so callers can still read the JSON body.
  //   none  - the request carried no session token at all (no cookie). In an embedded preview this
  //           is the normal shape of a browser that drops third-party cookies.
  //   ended - a token was presented but it is not a live session: another sign-in replaced it, it
  //           expired, or the account is gone. That is the real "signed in somewhere else".
  // The client used to show the takeover card for both, which made a lost cookie look like a hijack
  // and left the player with no way back in.
  if (!user) {
    const response = await unauth(request);
    response.headers.set('X-Server-Now', String(Date.now()));
    return response;
  }
  // v280: `id` lets the client stamp its save with the durable account identity, so a rename (which
  // changes the name, never the id) cannot strand the save. It is the caller's own id and nothing
  // else, so exposing it reveals nothing about other accounts.
  //
  // v412 (CPU): `recoverySet` comes from the session JOIN that `currentUser()` already ran, instead of
  // a second `SELECT * FROM users`. This endpoint is polled by every open tab every 45 s, so the extra
  // round trip was the most-repeated wasted read in the game.
  return json({ u: user.username, id: user.id, gm: user.gm, recoverySet: recoverySetFor(user) }, 200, { 'X-Server-Now': String(Date.now()) });
});
