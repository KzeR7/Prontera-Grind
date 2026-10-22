import {currentUser} from '../_lib/auth.js';
import {json,guard} from '../_lib/http.js';
export const onRequestGet=guard(async({request,env})=>{
 if(request.headers.get('Origin')!==new URL(request.url).origin)return json({error:'Origin rejected'},403);
 const user=await currentUser(request,env.DB);if(!user)return json({error:'Sign in to chat'},401);
 if(request.headers.get('Upgrade')?.toLowerCase()!=='websocket')return json({error:'WebSocket required'},426);
 if(!env.SOCIAL)return json({error:'Social service is not configured'},503);
 return env.SOCIAL.get(env.SOCIAL.idFromName('world')).fetch(new Request('https://social/connect',{headers:{Upgrade:'websocket','X-Social-Identity':JSON.stringify({id:user.id,username:user.username})}}));
});
