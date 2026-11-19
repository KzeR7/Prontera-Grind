/* Runtime routing for the approved expanded-class review choices. */
(function(root){'use strict';
const keepOld=new Set(['cr_grand','cr_holyx','pa_press','rg_vanish','rg_over','rg_cannon','rg_earth','rg_genesis','so_diamond','so_varetyr','su_tiger','su_rampage','su_gate','su_sky','ch_asura','ro_strip','ro_back','ro_raid','sc_masq','dn_rain','ko_cross','mo_chain','ch_glacier','ch_palm','ch_crush','st_plag','st_full','st_stalk','nj_spear','so_grave','ge_thorn','ge_spore','ge_hell','su_knuckle','sc_fatal','sc_feint',
 'mo_sphere','bd_bragi','bd_music','dn_service','dn_sling','bd_vulcan','dn_tarot',
 'nj_cicada','nj_blaze','nj_final','nj_slash','ko_shadow',
 'gs_coin','gs_rapid','gs_desp','gs_track','gs_triple','gs_bull','gs_fling',
 'rb_fire','rb_round','rb_dragon','rb_slug','rb_heat','rb_crimson','rb_platinum','rb_god',
 'so_psychic','so_strike','ge_cart','ge_weed','ge_fire','bd_metal','dn_swing','bd_reverb','mw_echo']);
function has(id){return !keepOld.has(id)&&(root.PGReviewPolishFx.has(id)||root.PGClassIdentityFx.has(id)||root.PGExpandedFxConcepts.has(id))}
function keepsSignature(id){return !has(id)||['pa_chain','ko_soul','ko_petal','mo_triple'].includes(id)}
function keepsShared(id){return !has(id)||id==='nj_kunai'||id==='mo_triple'}
function draw(g,fx,project){
 if(!has(fx.reviewId)||fx.reviewId==='mo_triple')return;
 const id=fx.reviewId,dx=fx.x1-fx.x0,dz=fx.z1-fx.z0,len=Math.hypot(dx,dz),nx=len>1e-6?-dz/len:0,nz=len>1e-6?dx/len:1;
 // Review-space caster and target are mapped to the actual cast endpoints and terrain.
 const P=(x,y,z)=>{const q=(x+1.65)/3.3;return project(fx.x0+dx*q+nx*z,y,fx.z0+dz*q+nz*z)};
 g.save();
 if(id==='su_rising'){const a=P(-1.65,0,0);g.translate(a[0],a[1]);g.scale(2,2);g.translate(-a[0],-a[1]);}
 if(root.PGReviewPolishFx.replaces(id))root.PGReviewPolishFx.draw(g,id,fx.age,P);
 else if(root.PGClassIdentityFx.has(id))root.PGClassIdentityFx.draw(g,id,fx.age,P);
 else if(root.PGResearchedFx.has(id))root.PGResearchedFx.draw(g,id,fx.age,P);
 else root.PGExpandedFxConcepts.draw(g,id,fx.age,P);
 if(!root.PGReviewPolishFx.replaces(id))root.PGReviewPolishFx.draw(g,id,fx.age,P);
 g.restore();
}
root.PGApprovedExpandedFx={has,keepsSignature,keepsShared,draw};
})(globalThis);
