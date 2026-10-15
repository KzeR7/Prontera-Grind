/* In-game scenery exploration shell. No save, unlock, combat or reward mutations. */
(function(){'use strict';
const TITLES={astral:'Astral Citadel',thor:'Thor Volcano'};
let dialog=null,frame=null,returnFocus=null,destination=null;
function destroyFrame(){try{frame?.contentWindow?.PGJourneyPreview?.dispose();}catch(_){}frame?.remove();frame=null;}
function close(){
 if(!dialog)return;
 destroyFrame();const old=dialog;dialog=null;old.remove();window.dispatchEvent(new Event('pg-exploration-close'));
 const focus=returnFocus?.isConnected?returnFocus:document.querySelector('[data-a="explore"][data-v="'+destination+'"]');
 destination=null;returnFocus=null;focus?.focus();
}
function open(kind,character={}){
 if(!Object.hasOwn(TITLES,kind))return false;
 if(dialog)close();destination=kind;returnFocus=document.activeElement;
 dialog=document.createElement('dialog');dialog.className='endgame-dialog';dialog.setAttribute('aria-labelledby','endgameHeading');
 dialog.innerHTML='<header><div><small>WORLD ATLAS / SCENERY EXPLORATION</small><h2 id="endgameHeading"></h2><p>No combat, rewards or saved stage changes here. Your current field keeps farming.</p></div><div class="endgame-dialog-actions"><button type="button" data-retry>Reload scene</button><button type="button" data-close autofocus>Return to game ×</button></div></header><div class="endgame-frame-host"></div>';
 dialog.querySelector('h2').textContent=TITLES[kind];
 const url=new URL('assets/endgame/explore.html',document.baseURI);url.searchParams.set('map',kind);
 // Only a disposable visual snapshot crosses into the isolated scene. Never an account/save blob.
 const snapshot={className:typeof character.className==='string'?character.className.slice(0,40):'Lord Knight',appearance:window.PGWardrobe?.normalize(character.appearance)||null};
 url.hash=encodeURIComponent(JSON.stringify(snapshot));
 function load(){const next=frame?.contentWindow?.location.href||url.href;destroyFrame();frame=document.createElement('iframe');frame.title=TITLES[destination]+' scenery exploration';frame.src=next;frame.setAttribute('allow','fullscreen');dialog.querySelector('.endgame-frame-host').replaceChildren(frame);}
 dialog.querySelector('[data-close]').onclick=close;dialog.querySelector('[data-retry]').onclick=load;
 dialog.addEventListener('cancel',e=>{e.preventDefault();close();});document.body.append(dialog);load();dialog.showModal();dialog.querySelector('[data-close]').focus();return true;
}
addEventListener('message',e=>{if(!dialog||e.origin!==location.origin||e.source!==frame?.contentWindow)return;if(e.data?.type==='pg-endgame-close')close();else if(e.data?.type==='pg-endgame-destination'&&Object.hasOwn(TITLES,e.data.destination)){destination=e.data.destination;dialog.querySelector('h2').textContent=TITLES[destination];frame.title=TITLES[destination]+' scenery exploration';}});
window.PGMapExploration=Object.freeze({open,close,isOpen:()=>!!dialog});
})();
