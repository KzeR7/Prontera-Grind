import {currentUser} from '../_lib/auth.js';
import { json, guard, unauth } from '../_lib/http.js';
import {friendsInstalled,listFor} from '../_lib/friends.js';
// The plaza socket. Identity is resolved HERE, from the session cookie, and passed to the private
// Worker; the accepted-friends list travels with it so the plaza can draw a friend's name
// differently without a second round trip (and without the room needing a database binding).
// A server without migration 0012 still connects - with an empty list.
export const onRequestGet=guard(async({request,env})=>{
 if(request.headers.get('Origin')!==new URL(request.url).origin)return json({error:'Origin rejected'},403);
 if(request.headers.get('Upgrade')?.toLowerCase()!=='websocket')return json({error:'WebSocket required'},426);
 if(!env.SOCIAL)return json({error:'Social service is not configured'},503);
 const user=await currentUser(request,env.DB);if(!user)return await unauth(request,'Sign in to chat');
 let friends=[];
 try{if(await friendsInstalled(env.DB))friends=(await listFor(env.DB,user.id)).friends.map(f=>f.id)}catch(e){friends=[]}
 // v279 (owner): the GM tag. `gm` is resolved from the session's own row, exactly like `friends`, so a
 // client can never claim it - the Worker trusts this header and only this header. It travels as a
 // boolean so the room never has to care about the 0/1/2 levels, only "is this account staff".
 return env.SOCIAL.get(env.SOCIAL.idFromName('world')).fetch(new Request('https://social/connect',{headers:{Upgrade:'websocket','X-Social-Identity':JSON.stringify({id:user.id,username:user.username,friends,gm:Number(user.gm)>0})}}));
});
