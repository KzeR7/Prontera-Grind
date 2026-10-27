# `old_equipment_tab` — pre-change Equipment rarity UI backup

Created from the working tree before this task's UI edit. This keeps the previous Equipment navigation and Loadout rarity markup/styles available for the PR; unrelated game code is not duplicated.

Snapshot of the Loadout's rarity interface and tab list immediately before replacing its static rarity legend plus duplicate dropdown with clickable rarity chips. The game build script publishes only `index.html`, `gm.html`, `_routes.json`, `assets/` and `Updates/Sprite/`, so this source backup is kept in the repository but is not shipped to players.

To restore the previous rarity UI, copy the preserved `eclipseInventoryTools()` implementation and its rarity-control CSS below back into `index.html` and `assets/ui/eclipse.css`. The existing `filtergear` action remains the handler for the rarity buttons.

## Equipment tabs before the change

```js
const SUBS={equip:[['equip0','Loadout'],['refine','Refine'],['reforge','Affixes'],['cardsWork','Cards'],['autosell','Auto-sell'],['ascension','Ascension Forge']],status:[['stats','Stats'],['ascstats','Ascension stats']],bag:[['bag','Items'],['cards','Cards']],skills:[['skilllist','Skills'],['skillasc','Ascension Skills']]};
V.equip=()=>subBar('equip')+(V[sub.equip]||V.equip0)();
```

## `index.html` — previous Loadout inventory tools

```js
function eclipseInventoryTools(){const known=new Set(eclipseInventoryState?.owner===S?eclipseInventoryState.ids:S.inv.map(it=>String(it.id))),n=S.inv.filter(it=>!known.has(String(it.id))).length;
 const categories=[['all','All gear'],['weapon','Weapons'],['armor','Armor'],['acc','Accessories']];
 const rarityOptions=`<button data-a="filtergear" data-v="-1" aria-pressed="${eclipseRarity<0}">All</button>${RARALL.map((r,i)=>`<button data-a="filtergear" data-v="${i}" class="eclipse-rarity-filter r${i}" title="Show only ${ECLIPSE_RARITY_NAMES[i]} equipment" aria-pressed="${eclipseRarity===i}">${ECLIPSE_RARITY_NAMES[i]}</button>`).join('')}`;
 return `<div class="eclipse-inventory-tools"><label class="eclipse-search-label"><span class="eclipse-visually-hidden">Find equipment</span><input data-eclipse-search aria-label="Find equipment" value="${esc(eclipseSearch)}" placeholder="Search equipment…"></label><div class="eclipse-slot-filters" role="group" aria-label="Equipment type">${categories.map(([id,label])=>`<button data-a="filtergearslot" data-v="${id}" aria-pressed="${eclipseSlotFilter===id}">${label}</button>`).join('')}</div><div class="eclipse-rarity-legend" role="list" aria-label="Equipment rarity key"><span class="eclipse-rarity-key-title">Rarity</span>${ECLIPSE_RARITY_NAMES.map((label,i)=>`<span class="eclipse-rarity-key" role="listitem"><span class="eclipse-rarity-chip" data-eclipse-rarity="${i}" style="--rarity-color:${ECLIPSE_RARITY_COLORS[i]}" role="img" aria-label="${label}">${ECLIPSE_RARITY_CODES[i]}</span><small>${label}</small></span>`).join('')}</div><details class="eclipse-rarity-control" data-ui-disclosure="equipment-rarity-filter"><summary>Rarity: ${eclipseRarity<0?'All':ECLIPSE_RARITY_NAMES[eclipseRarity]}</summary><div class="eclipse-filters">${rarityOptions}</div></details><div class="eclipse-new-drops"><span>Items stay in place while farming</span><button data-a="newdrops" ${n?'':'disabled'}>${n?'Show '+n+' new drops →':'Up to date'}</button></div></div>`;
}
```

## `assets/ui/eclipse.css` — previous static legend and duplicate selector

```css
/* Previous rarity-button palette when the selector was expanded. */
#wins .eclipse-filters .eclipse-rarity-filter{--filter-color:#b5c2ce;color:var(--filter-color);border:1px solid color-mix(in srgb,var(--filter-color) 30%,transparent);background:color-mix(in srgb,var(--filter-color) 5%,transparent)}
#wins .eclipse-filters .r1{--filter-color:#68df9b}#wins .eclipse-filters .r2{--filter-color:#6aafff}#wins .eclipse-filters .r3{--filter-color:#c18aff}#wins .eclipse-filters .r4{--filter-color:#ffd26e}#wins .eclipse-filters .r5{--filter-color:#9d8dff}#wins .eclipse-filters .r6{--filter-color:#ff85cf}
#wins .eclipse-filters .eclipse-rarity-filter[aria-pressed=true]{border-color:var(--filter-color);background:color-mix(in srgb,var(--filter-color) 20%,transparent);box-shadow:inset 0 -2px var(--filter-color)}
#wins .eclipse-rarity-legend{display:flex;flex-wrap:wrap;align-items:center;gap:5px 8px;padding:8px 0 2px;border-top:1px solid var(--e-line);border-bottom:1px solid var(--e-line)}
#wins .eclipse-rarity-key-title{width:100%;font-size:7px;letter-spacing:1px;text-transform:uppercase;color:var(--e-muted)}
#wins .eclipse-rarity-key{display:inline-flex;align-items:center;gap:4px;min-width:0}
#wins .eclipse-rarity-key small{font-size:8px;color:var(--e-muted);white-space:nowrap}
#wins .eclipse-rarity-control{margin:0;border:0;padding:0}
#wins .eclipse-rarity-control>summary{display:flex;justify-content:space-between;align-items:center;min-height:27px;padding:4px 1px;color:var(--e-muted);font-size:9px;cursor:pointer;list-style:none}
#wins .eclipse-rarity-control>summary::-webkit-details-marker{display:none}
#wins .eclipse-rarity-control>summary:after{content:'⌄';color:var(--gold);font-size:13px}
#wins .eclipse-rarity-control[open]>summary:after{content:'⌃'}
#wins .eclipse-rarity-control .eclipse-filters{display:flex;flex-wrap:wrap;gap:4px;margin:0;padding:3px 0 7px}
#wins .eclipse-rarity-control .eclipse-filters button{min-height:26px;padding:4px 6px;border:1px solid var(--e-line);border-radius:4px;background:transparent;color:var(--e-muted);font:600 8px var(--e-font)}
#wins .eclipse-rarity-control .eclipse-filters button[aria-pressed=true]{background:var(--e-soft);border-color:var(--gold);color:var(--gold)}
/* Previous phone overrides. */
#wins .eclipse-rarity-key-title{width:auto;margin-right:2px}
#wins .eclipse-rarity-legend{gap:6px 9px;padding:8px 0}
#wins .eclipse-rarity-key small{font-size:8px}
#wins .eclipse-rarity-control>summary{min-height:33px;font-size:10px}
#wins .eclipse-rarity-legend{gap:5px 7px}
#wins .eclipse-rarity-key small{font-size:7px}
```
