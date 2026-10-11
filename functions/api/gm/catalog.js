import { currentUser, isGm } from '../../_lib/auth.js';
import { json, guard, fail } from '../../_lib/http.js';
import { GM_CATALOG } from '../../_lib/gm-catalog.js';
export const onRequestGet=guard(async({request,env})=>{
 const user=await currentUser(request,env.DB);
 if(!user)return fail('Not logged in.',401);
 if(!isGm(user))return fail('Not a GM.',403);
 return json(GM_CATALOG);
});
