// Prototype code from commit 407e27b4 (not applied). See README.md for where each part goes.

// 1) Append inside const ASC_SETS={...} after the "infernal" entry (add a comma after it):
  // haven-v432: Ragnarok Online look of celestial. Same map, material, bonuses and cost; its own pieces, so
  // wearing it counts toward this set only.
  valkyrie:{
    name:'Valkyrie',map:10,mat:0,look:'celestial',
    pieces:{
      weapon:{sword:'Valkyrie Balmung',katar:'Valkyrie Loki\'s Nail',staff:'Valkyrie Dea Staff',dagger:'Valkyrie Ginnungagap',bow:'Valkyrie Elven Bow',axe:'Valkyrie Celestial Axe',mace:'Valkyrie Hammer',spear:'Valkyrie Gigantic Lance',book:'Valkyrie Saga',knuckle:'Valkyrie Battle Glove',instrument:'Valkyrie Lute',whip:'Valkyrie Chain Whip',shuriken:'Valkyrie Wing Huuma',gun:'Valkyrie Gold Lux'},
      armor:'Valkyrie Brynhild',head:'Valkyrie Helm',off:'Valkyrie Hervor Alvitr',
      leg:'Valkyrian Shoes',acc:'Valkyrie Wing Brooch'
    }
  },
  // haven-v432: Ragnarok Online look of voidwalker. Same map, material, bonuses and cost; its own pieces, so
  // wearing it counts toward this set only.
  thanatos:{
    name:'Thanatos',map:10,mat:0,look:'voidwalker',
    pieces:{
      weapon:{sword:'Thanatos Sword',katar:'Thanatos Katar',staff:'Thanatos Staff',dagger:'Thanatos Dagger',bow:'Thanatos Bow',axe:'Thanatos Axe',mace:'Thanatos Hammer',spear:'Thanatos Spear',book:'Thanatos Grimoire',knuckle:'Thanatos Knuckle',instrument:'Thanatos Violin',whip:'Thanatos Whip',shuriken:'Thanatos Thunderstorm Huuma',gun:'Thanatos Dusk'},
      armor:'Thanatos Tenebris',head:'Thanatos Despero Mask',off:'Thanatos Shadow Guard',
      leg:'Thanatos Shadow Walk',acc:'Thanatos Death Loop'
    }
  },
  // haven-v432: Ragnarok Online look of ethereal. Same map, material, bonuses and cost; its own pieces, so
  // wearing it counts toward this set only.
  archangel:{
    name:'Archangel',map:10,mat:0,look:'ethereal',
    pieces:{
      weapon:{sword:'Archangel Feather Blade',katar:'Archangel Chakram',staff:'Archangel Divine Cross',dagger:'Archangel Weihna',bow:'Archangel Ixion Wings',axe:'Archangel End Sectora',mace:'Archangel Noble Cross',spear:'Archangel Longinus',book:'Archangel Scripture',knuckle:'Archangel Claw of Flash',instrument:'Archangel Harp',whip:'Archangel Rapture Rose',shuriken:'Archangel Wave Huuma',gun:'Archangel Gate Keeper'},
      armor:'Archangel Protection',head:'Archangel Helm',off:'Archangel Holy Guard',
      leg:'Archangel Reincarnation',acc:'Archangel Ring'
    }
  },
  // haven-v432: Ragnarok Online look of primal. Same map, material, bonuses and cost; its own pieces, so
  // wearing it counts toward this set only.
  ifrit:{
    name:'Ifrit',map:11,mat:1,look:'primal',
    pieces:{
      weapon:{sword:'Ifrit Solar Sword',katar:'Ifrit Krishna',staff:'Ifrit Wizardry Staff',dagger:'Ifrit Kindle Dagger',bow:'Ifrit Burning Bow',axe:'Ifrit Ignus Steel',mace:'Ifrit Judgement Mace',spear:'Ifrit Hellfire',book:'Ifrit Flame Codex',knuckle:'Ifrit Magma Fist',instrument:'Ifrit Burning Guitar',whip:'Ifrit Red Flame Whip',shuriken:'Ifrit Blaze Huuma',gun:'Ifrit Inferno'},
      armor:'Ifrit Crimson Robe',head:'Ifrit Mask',off:'Ifrit Sol Shield',
      leg:'Ifrit Crimson Shoes',acc:'Ifrit Flame Lord Ring'
    }
  },
  // haven-v432: Ragnarok Online look of molten. Same map, material, bonuses and cost; its own pieces, so
  // wearing it counts toward this set only.
  thor:{
    name:'Thor',map:11,mat:1,look:'molten',
    pieces:{
      weapon:{sword:'Thor Naght Sieger',katar:'Thor Drill Katar',staff:'Thor Jormungand',dagger:'Thor Krieg',bow:'Thor Giant Crossbow',axe:'Thor Stonehammer',mace:'Thor War Hammer',spear:'Thor Ahlspiess',book:'Thor Rune Codex',knuckle:'Thor Electric Fist',instrument:'Thor Thunder Bass',whip:'Thor Electric Eel',shuriken:'Thor Storm Huuma',gun:'Thor Thunder P'},
      armor:'Thor Egir Armor',head:'Thor Power Helm',off:'Thor Giant Shield',
      leg:'Thor Siege Greaves',acc:'Thor Iron Wrist'
    }
  },
  // haven-v432: Ragnarok Online look of infernal. Same map, material, bonuses and cost; its own pieces, so
  // wearing it counts toward this set only.
  diabolus:{
    name:'Diabolus',map:11,mat:1,look:'infernal',
    pieces:{
      weapon:{sword:'Diabolus Gladius',katar:'Diabolus Blood Tears',staff:'Diabolus Baculum',dagger:'Diabolus Cursed Dagger',bow:'Diabolus Arcus',axe:'Diabolus Doom Slayer',mace:'Diabolus Bloody Cross',spear:'Diabolus Crescent Scythe',book:'Diabolus Grimoire',knuckle:'Diabolus Iron Nail',instrument:'Diabolus Berserk Guitar',whip:'Diabolus Rosebine',shuriken:'Diabolus Blood Huuma',gun:'Diabolus Destroyer'},
      armor:'Diabolus Armor',head:'Diabolus Bone Helm',off:'Diabolus Shield of Death',
      leg:'Diabolus Boots',acc:'Diabolus Bloody Ring'
    }
  }

// 2) Directly after the closing "};" of ASC_SETS - the RO looks share their parent's bonuses and cost:
for(const set of Object.values(ASC_SETS))if(set.look){const base=ASC_SETS[set.look];set.bonuses=base.bonuses;set.cost=base.cost}

// 3) Merge into RO_ITEM_ICON_CANDIDATES.mythic (icons must be copied to assets/equipment-icons/ first):
const RO_LOOK_ICONS={"valkyrie":{"sword":1161,"dagger":13002,"axe":1383,"mace":16051,"staff":2005,"katar":1262,"bow":1746,"armor":2383,"head":5171,"off":2182,"leg":2421,"acc":2890,"spear":1490,"book":1585,"knuckle":1822,"instrument":1935,"whip":1973,"shuriken":13300,"gun":13106},"thanatos":{"sword":13441,"dagger":13093,"axe":28100,"mace":16028,"staff":1669,"katar":28000,"bow":18119,"armor":15055,"head":18530,"off":2135,"leg":2426,"acc":2732,"spear":1438,"book":1562,"knuckle":1836,"instrument":1933,"whip":1988,"shuriken":13315,"gun":13153},"archangel":{"sword":13420,"dagger":13047,"axe":1393,"mace":16029,"staff":2001,"katar":1285,"bow":1737,"armor":2355,"head":5025,"off":2110,"leg":2420,"acc":2743,"spear":1469,"book":1572,"knuckle":1841,"instrument":1926,"whip":1963,"shuriken":13314,"gun":13167},"ifrit":{"sword":1136,"dagger":1247,"axe":1392,"mace":16013,"staff":1473,"katar":1284,"bow":1730,"armor":15027,"head":5420,"off":2165,"leg":2469,"acc":2678,"spear":1471,"book":1564,"knuckle":1818,"instrument":1914,"whip":1965,"shuriken":13303,"gun":13162},"thor":{"sword":13412,"dagger":13046,"axe":1385,"mace":1548,"staff":2020,"katar":1270,"bow":18110,"armor":15061,"head":5495,"off":2160,"leg":2483,"acc":2719,"spear":1478,"book":1573,"knuckle":1820,"instrument":1919,"whip":1972,"shuriken":13316,"gun":13168},"diabolus":{"sword":13449,"dagger":1241,"axe":1370,"mace":16017,"staff":1676,"katar":1271,"bow":18125,"armor":2375,"head":5529,"off":2177,"leg":2433,"acc":2760,"spear":1466,"book":1561,"knuckle":1837,"instrument":1920,"whip":1985,"shuriken":13313,"gun":13160}};
