// Read-only GM review of client-reported damage observations. A flag is not a
// cheating determination, and this endpoint never modifies a player or prize.
import { currentUser, isGm } from '../../_lib/auth.js';
import { json, guard, fail } from '../../_lib/http.js';
import * as db from '../../_lib/db.js';

export const onRequestGet = guard(async ({request,env}) => {
  const user=await currentUser(request,env.DB);
  if(!user)return fail('Not logged in.',401);
  if(!isGm(user))return fail('Not a GM.',403);
  const value=new URL(request.url).searchParams.get('id');
  let playerId=null;
  if(value!==null){
    if(!/^[1-9][0-9]*$/.test(value)||!Number.isSafeInteger(Number(value)))return fail('Invalid player.',400);
    playerId=Number(value);
    if(!await db.userById(env.DB,playerId))return fail('No such account.',404);
  }
  try {
    const results=playerId===null ? await db.recentDamageAlerts(env.DB,100) : await db.damageSamplesFor(env.DB,playerId);
    return json(playerId===null ? {alerts:results.results} : {samples:results.results});
  } catch(e) {
    if(/no such table/i.test(String(e?.message||e)))return fail('Damage monitoring has not been set up on this database.',503);
    throw e;
  }
});
