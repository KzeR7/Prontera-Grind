import { currentUser,isGm } from '../../_lib/auth.js';
import { json,guard,readJson,fail } from '../../_lib/http.js';
import { checkGrant } from '../../_lib/validate.js';
import { giftPayload } from '../../_lib/gm-tools.js';
export const onRequestPost=guard(async({request,env})=>{
 const user=await currentUser(request,env.DB);
 if(!user)return fail('Not logged in.',401);
 if(!isGm(user))return fail('Not a GM.',403);
 const body=await readJson(request,8192),D=env.DB;
 if(typeof body.requestId!=='string'||!/^[-a-zA-Z0-9]{16,80}$/.test(body.requestId))return fail('Missing gift request ID.',400);
 const requestId=user.id+':'+body.requestId;
 if(!['gift','zeny'].includes(body.kind))return fail('Select a gift kind.',400);
 if(body.kind==='zeny'&&(!Number.isInteger(body.amount)||body.amount<=0))return fail('Enter a positive whole-number Zeny amount.',400);
 const kind=body.kind;
 const payload=kind==='zeny'?checkGrant('zeny',{amount:body.amount}):giftPayload(body);
 if(kind==='zeny'&&payload.amount<=0)return fail('Server gifts must have a positive amount.',400);
 const note=String(body.note||'').slice(0,200),now=Date.now();
 const existing=await D.prepare('SELECT * FROM gm_gift_batches WHERE request_id = ?').bind(requestId).first();
 if(existing&&(existing.kind!==kind||existing.payload!==JSON.stringify(payload)||existing.note!==note))return fail('This request ID already belongs to a different gift.',409);
 if(existing){const count=await D.prepare('SELECT COUNT(*) AS n FROM grants WHERE batch_id=?').bind(requestId).first();return json({ok:true,recipients:count.n,note:'Already queued for '+count.n+' accounts.'});}
 await D.batch([
   D.prepare(`INSERT OR IGNORE INTO gm_gift_batches(request_id,created_by,created_at,max_user_id,kind,payload,note)
    SELECT ?,?,?,COALESCE(MAX(id),0),?,?,? FROM users`).bind(requestId,user.username,now,kind,JSON.stringify(payload),note),
   D.prepare(`INSERT INTO events(at,actor,user_id,kind,detail) SELECT ?,?,NULL,'gm-mass-gift',? WHERE changes() > 0`).bind(now,user.username,requestId+' '+kind+' '+(body.catalogId||'Zeny')+' x'+body.amount),
   D.prepare(`INSERT OR IGNORE INTO grants(user_id,kind,payload,note,created_by,created_at,batch_id)
    SELECT u.id,b.kind,b.payload,b.note,b.created_by,b.created_at,b.request_id
    FROM users u JOIN gm_gift_batches b ON b.request_id=? WHERE u.id<=b.max_user_id AND u.banned=0`).bind(requestId),
 ]);
 const count=await D.prepare('SELECT COUNT(*) AS n FROM grants WHERE batch_id=?').bind(requestId).first();
 return json({ok:true,recipients:count.n,note:'Queued for '+count.n+' accounts. Offline players receive it when they return.'});
});
