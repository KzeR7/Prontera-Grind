// Exercise the actual recovery UI handlers against a DOM, without production data.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { JSDOM } from 'jsdom';

const src=fs.readFileSync('index.html','utf8');
const begin=src.indexOf('// Recovery never sends the password or code');
const end=src.indexOf('// ---------- update watcher',begin);
assert.ok(begin>=0 && end>begin,'real recovery handlers must be present');
const code=src.slice(begin,end);
const okCode='ABCD-EFGH-JKMN-PQRS';
function harness(handler) {
  const dom=new JSDOM(src,{url:'https://game.test/'});
  const doc=dom.window.document, $=id=>doc.getElementById(id), calls=[];
  let mode='', error='';
  const ctx=vm.createContext({$,CLOUD:{api:true},setMode:m=>{mode=m},showErr:m=>{error=m},
    cloudFetch:async (...args)=>{calls.push(args);return handler(...args)}});
  vm.runInContext(code,ctx);
  const fill=()=>{$('recoverUser').value='Player';$('recoverEmail').value='player@example.test';
    $('recoverCode').value='OLD1-OLD2-OLD3-OLD4';$('recoverPassword').value='New-password-123';$('recoverConfirm').value='New-password-123'};
  return {dom,$,calls,fill,mode:()=>mode,error:()=>error,ctx};
}
const response=(status,data)=>({status,ok:status>=200&&status<300,json:async()=>data});
{
  const h=harness(async()=>response(200,{recovery:okCode})), {$}=h;
  $('username').value='Player';$('recoveryOpen').click();
  assert.equal($('recoverUser').value,'Player');assert.equal($('loginForm').hidden,true);
  assert.equal($('authTabs').hidden,true);assert.equal($('recoveryForm').hidden,false);
  assert.equal($('recoverySuccess').hidden,true);assert.equal($('authHeading').textContent,'Recover account');
  assert.equal($('recoveryForm').querySelectorAll('.form-group').length,5,'each input uses the login field layout');
  h.fill();$('recoverConfirm').value='mismatch';
  await $('recoveryForm').onsubmit({preventDefault(){}});
  assert.equal(h.calls.length,0);assert.match($('recoverStatus').textContent,/do not match/i);
  $('recoverClose').click();assert.equal($('loginForm').hidden,false);assert.equal($('authTabs').hidden,false);
  assert.equal($('recoverCode').value,'');assert.equal($('recoverPassword').value,'');assert.equal(h.mode(),'login');
  h.dom.window.close();
}
{
  let finish; const h=harness(()=>new Promise(resolve=>{finish=resolve})), {$}=h;
  $('recoveryOpen').click();h.fill();
  const pending=$('recoveryForm').onsubmit({preventDefault(){}});
  assert.equal($('recoverSubmit').disabled,true);assert.equal($('recoverClose').disabled,true);
  await $('recoveryForm').onsubmit({preventDefault(){}});assert.equal(h.calls.length,1,'double submission is blocked');
  finish(response(200,{recovery:okCode}));await pending;
  assert.equal($('loginForm').hidden,true);assert.equal($('recoveryForm').hidden,true);
  assert.equal($('recoverySuccess').hidden,false);assert.equal($('recoverNewCode').textContent,okCode);
  assert.equal($('recoverCode').value,'');assert.equal($('recoverPassword').value,'');
  assert.match($('recoverDone').textContent,/back to login/i);
  $('recoverDone').click();
  assert.equal($('loginForm').hidden,false);assert.equal($('recoverySuccess').hidden,true);
  assert.equal($('recoverNewCode').textContent,'','one-time code cleared after acknowledgement');
  assert.equal($('username').value,'Player');assert.equal($('password').value,'');
  assert.equal(h.mode(),'login');assert.equal(h.dom.window.document.activeElement,$('password'));
  h.dom.window.close();
}
{
  const h=harness(async()=>response(400,{err:'Recovery details are incorrect or unavailable.'})), {$}=h;
  $('recoveryOpen').click();h.fill();await $('recoveryForm').onsubmit({preventDefault(){}});
  assert.equal($('recoveryForm').hidden,false);assert.equal($('recoverySuccess').hidden,true);
  assert.match($('recoverStatus').textContent,/incorrect/);assert.equal($('recoverClose').disabled,false);
  h.dom.window.close();
}
{
  const h=harness(async()=>response(200,{})), {$}=h;
  $('recoveryOpen').click();h.fill();await $('recoveryForm').onsubmit({preventDefault(){}});
  assert.equal($('recoveryForm').hidden,true);assert.equal($('recoverySuccess').hidden,false);
  assert.equal($('recoverNewCode').hidden,true);assert.match($('recoverSuccessDetail').textContent,/could not be displayed/i);
  $('recoverDone').click();assert.equal($('loginForm').hidden,false);h.dom.window.close();
}
{
  const h=harness(async()=>response(500,{err:'Server error.'})), {$}=h;
  $('recoveryOpen').click();h.fill();await $('recoveryForm').onsubmit({preventDefault(){}});
  assert.match($('recoverStatus').textContent,/reset may have completed/i);h.dom.window.close();
}
{
  const h=harness(async()=>{throw new Error('Network unavailable')}), {$}=h;
  $('recoveryOpen').click();h.fill();await $('recoveryForm').onsubmit({preventDefault(){}});
  assert.match($('recoverStatus').textContent,/reset may have completed/i);
  assert.equal($('recoveryForm').hidden,false);assert.equal($('recoverClose').disabled,false);h.dom.window.close();
}
console.log('PASS: recovery layout structure, validation, cancel, one-time code acknowledgement, return to login, error and missing-code handling');
