/* Preview navigation only: URL state never reads or writes game saves. */
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.PGJourneyNavigation=factory();})(typeof globalThis==='object'?globalThis:this,function(){
'use strict';
function parse(search){const p=new URLSearchParams(search),raw=p.get('stage'),n=raw&&/^\d{1,2}$/.test(raw)?Number(raw):1;return{destination:p.get('map')==='thor'?'thor':'astral',stage:n>=1&&n<=10?n:1,overview:p.get('view')==='overview'};}
function search(destination,stage,overview=false){if(!['astral','thor'].includes(destination)||!Number.isInteger(stage)||stage<1||stage>10)throw new RangeError('Invalid preview location');const p=new URLSearchParams({map:destination,stage:String(stage)});if(destination==='astral'&&overview)p.set('view','overview');return'?'+p;}
function shortcut(event){if(event.altKey||event.ctrlKey||event.metaKey||event.repeat)return null;const el=event.target;if(el&&(el.isContentEditable||el.closest&&el.closest('input,select,textarea,button,a,summary,[contenteditable]')))return null;return{ArrowLeft:'previous',ArrowRight:'next',' ':'pause',Home:'first',End:'last'}[event.key]||null;}
return Object.freeze({parse,search,shortcut});
});
