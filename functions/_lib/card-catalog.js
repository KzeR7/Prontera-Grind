// The card catalog, server-side. GENERATED from the page's own cardDefinition()/CARD_CATALOG - do not
// hand-edit a row; regenerate it with tools/tests/save_codec_catalog_sim.mjs watching.
//
// Why this exists: every field of a modern card (family, n, stat, v, effects, fit, g, bossCard, map,
// nightmare) is a PURE FUNCTION of its cardKey - the page's own repairProgression() already overwrites
// all of them from CARD_CATALOG on every load, so they are a cache, not data. Codec v3 therefore stores
// a card as `[catalogId, id]` (plus `stars`) and rebuilds the rest from this table. That is not the
// forbidden "rebuild by re-rolling": nothing is generated or randomised, the table is fixed data, and a
// card whose id is not here keeps its full stored copy (see unpackCard).
//
// THE FIRST ELEMENT IS A PERMANENT NUMERIC ID, NOT AN ARRAY POSITION AND NOT A ROW INDEX. A save stores
// that id, so rows here may be added, removed or re-sorted without changing what an existing save
// decodes to. The rule for maintaining this table:
//
//   * an existing row's id NEVER changes, is never reused, and is never renumbered;
//   * a new card takes the next id above the current maximum;
//   * a removed card's id is retired, not recycled.
//
// Ids are small integers rather than the quoted cardKey because the id is written on every card in
// every save: `"9:6:1"` is 7 chars against `86`, and at 5000 cards that is ~20,000 chars.
// tools/tests/save_codec_catalog_sim.mjs pins every id, so a regeneration that renumbers anything
// fails immediately.
//
// Row layout: [id, cardKey, family, stat, v, effects, fit, g, bossCard, map, nightmare]
export const CARD_CATALOG_ROWS = [
  [1,"0:0:0","Poring Card","luk",3,[["luk",3]],["acc"],0,0,0,0],
  [2,"0:0:1","Poring Card","luk",4,[["luk",4]],["acc"],0,0,0,1],
  [3,"0:10:0","Mastering Card","hpPct",5,[["hpPct",5]],["armor","head","off"],3,1,0,0],
  [4,"0:10:1","Mastering Card","hpPct",6,[["hpPct",6]],["armor","head","off"],3,1,0,1],
  [5,"0:1:0","Fabre Card","hp",50,[["hp",50]],["head","armor"],0,0,0,0],
  [6,"0:1:1","Fabre Card","hp",63,[["hp",63]],["head","armor"],0,0,0,1],
  [7,"0:2:0","Lunatic Card","agi",3,[["agi",3]],["armor","leg","acc"],0,0,0,0],
  [8,"0:2:1","Lunatic Card","agi",4,[["agi",4]],["armor","leg","acc"],0,0,0,1],
  [9,"0:3:0","Drops Card","dex",3,[["dex",3]],["weapon","acc"],0,0,0,0],
  [10,"0:3:1","Drops Card","dex",4,[["dex",4]],["weapon","acc"],0,0,0,1],
  [11,"0:4:0","Chonchon Card","move",3,[["move",3]],["leg","acc"],0,0,0,0],
  [12,"0:4:1","Chonchon Card","move",4,[["move",4]],["leg","acc"],0,0,0,1],
  [13,"0:5:0","Willow Card","int",3,[["int",3],["matk",4]],["weapon","head","acc"],0,0,0,0],
  [14,"0:5:1","Willow Card","int",4,[["int",4],["matk",4]],["weapon","head","acc"],0,0,0,1],
  [15,"0:6:0","Rocker Card","str",3,[["str",3]],["weapon","acc"],0,0,0,0],
  [16,"0:6:1","Rocker Card","str",4,[["str",4]],["weapon","acc"],0,0,0,1],
  [17,"0:7:0","Poporing Card","vit",3,[["vit",3]],["armor","off","head"],0,0,0,0],
  [18,"0:7:1","Poporing Card","vit",4,[["vit",4]],["armor","off","head"],0,0,0,1],
  [19,"0:8:0","Savage Bebe Card","hpPct",4,[["hpPct",4]],["armor","head","off"],0,0,0,0],
  [20,"0:8:1","Savage Bebe Card","hpPct",5,[["hpPct",5]],["armor","head","off"],0,0,0,1],
  [21,"0:9:0","Peco Peco Card","move",3,[["move",3]],["leg","acc"],0,0,0,0],
  [22,"0:9:1","Peco Peco Card","move",4,[["move",4]],["leg","acc"],0,0,0,1],
  [23,"10:0:0","Retribution Angel Card","matk",6,[["matk",6]],["weapon","head"],2,0,10,0],
  [24,"10:1:0","Despair Phantom Card","mdef",30,[["mdef",30]],["head","armor","off"],2,0,10,0],
  [25,"10:2:0","Tower Watcher Card","def",30,[["def",30]],["armor","off","leg"],2,0,10,0],
  [26,"10:3:0","Death Whisperer Card","int",18,[["int",18]],["weapon","head","acc"],2,0,10,0],
  [27,"10:4:0","Agony Demon Card","atk",16,[["atk",16]],["weapon"],2,0,10,0],
  [28,"10:5:0","Memory of Thanatos Card","matk",8,[["matk",8]],["weapon","head"],3,1,10,0],
  [29,"11:0:0","Magma Slag Card","hpPct",8,[["hpPct",8]],["armor","head","off"],2,0,11,0],
  [30,"11:1:0","Fire Imp Card","field",12,[["field",12]],["weapon","acc"],2,0,11,0],
  [31,"11:2:0","Kasa Card","matk",6,[["matk",6]],["weapon","head"],2,0,11,0],
  [32,"11:3:0","Salamander Card","aspd",10,[["aspd",10]],["armor","leg"],2,0,11,0],
  [33,"11:4:0","Obsidian Golem Card","def",30,[["def",30]],["armor","off","leg"],2,0,11,0],
  [34,"11:5:0","Ifrit Card","atk",20,[["atk",20]],["weapon"],3,1,11,0],
  [35,"1:0:0","Marina Card","matk",3,[["matk",3]],["weapon","head"],1,0,1,0],
  [36,"1:0:1","Marina Card","matk",4,[["matk",4]],["weapon","head"],1,0,1,1],
  [37,"1:10:0","Drake Card","atk",8,[["atk",8]],["weapon"],3,1,1,0],
  [38,"1:10:1","Drake Card","atk",10,[["atk",10]],["weapon"],3,1,1,1],
  [39,"1:1:0","Pupa Card","hpPct",6,[["hpPct",6]],["armor","head","off"],1,0,1,0],
  [40,"1:1:1","Pupa Card","hpPct",8,[["hpPct",8]],["armor","head","off"],1,0,1,1],
  [41,"1:2:0","Crab Card","def",8,[["def",8]],["armor","off","leg"],1,0,1,0],
  [42,"1:2:1","Crab Card","def",10,[["def",10]],["armor","off","leg"],1,0,1,1],
  [43,"1:3:0","Sea Otter Card","agi",6,[["agi",6]],["armor","leg","acc"],1,0,1,0],
  [44,"1:3:1","Sea Otter Card","agi",8,[["agi",8]],["armor","leg","acc"],1,0,1,1],
  [45,"1:4:0","Muka Card","vit",6,[["vit",6]],["armor","off","head"],1,0,1,0],
  [46,"1:4:1","Muka Card","vit",8,[["vit",8]],["armor","off","head"],1,0,1,1],
  [47,"1:5:0","Anacondaq Card","crit",2,[["crit",2]],["weapon","acc"],1,0,1,0],
  [48,"1:5:1","Anacondaq Card","crit",3,[["crit",3]],["weapon","acc"],1,0,1,1],
  [49,"1:6:0","Thief Bug Card","aspd",5,[["aspd",5]],["armor","leg"],1,0,1,0],
  [50,"1:6:1","Thief Bug Card","aspd",6,[["aspd",6]],["armor","leg"],1,0,1,1],
  [51,"1:7:0","Marse Card","int",6,[["int",6]],["weapon","head","acc"],1,0,1,0],
  [52,"1:7:1","Marse Card","int",8,[["int",8]],["weapon","head","acc"],1,0,1,1],
  [53,"1:8:0","Ambernite Card","def",8,[["def",8]],["armor","off","leg"],1,0,1,0],
  [54,"1:8:1","Ambernite Card","def",10,[["def",10]],["armor","off","leg"],1,0,1,1],
  [55,"1:9:0","Kukre Card","dex",6,[["dex",6]],["weapon","acc"],1,0,1,0],
  [56,"1:9:1","Kukre Card","dex",8,[["dex",8]],["weapon","acc"],1,0,1,1],
  [57,"2:0:0","Skeleton Card","atk",6,[["atk",6]],["weapon"],1,0,2,0],
  [58,"2:0:1","Skeleton Card","atk",8,[["atk",8]],["weapon"],1,0,2,1],
  [59,"2:10:0","Baphomet Card","matk",4,[["matk",4]],["weapon","head"],3,1,2,0],
  [60,"2:10:1","Baphomet Card","matk",5,[["matk",5]],["weapon","head"],3,1,2,1],
  [61,"2:1:0","Zombie Card","vit",6,[["vit",6]],["armor","off","head"],1,0,2,0],
  [62,"2:1:1","Zombie Card","vit",8,[["vit",8]],["armor","off","head"],1,0,2,1],
  [63,"2:2:0","Ghoul Card","str",6,[["str",6]],["weapon","acc"],1,0,2,0],
  [64,"2:2:1","Ghoul Card","str",8,[["str",8]],["weapon","acc"],1,0,2,1],
  [65,"2:3:0","Poison Spore Card","hp",100,[["hp",100]],["head","armor"],1,0,2,0],
  [66,"2:3:1","Poison Spore Card","hp",125,[["hp",125]],["head","armor"],1,0,2,1],
  [67,"2:4:0","Whisper Card","matk",3,[["matk",3]],["weapon","head"],1,0,2,0],
  [68,"2:4:1","Whisper Card","matk",4,[["matk",4]],["weapon","head"],1,0,2,1],
  [69,"2:5:0","Bat Familiar Card","move",3,[["move",3]],["leg","acc"],1,0,2,0],
  [70,"2:5:1","Bat Familiar Card","move",4,[["move",4]],["leg","acc"],1,0,2,1],
  [71,"2:6:0","Dark Priest Card","int",6,[["int",6]],["weapon","head","acc"],1,0,2,0],
  [72,"2:6:1","Dark Priest Card","int",8,[["int",8]],["weapon","head","acc"],1,0,2,1],
  [73,"2:7:0","Wraith Card","mdef",8,[["mdef",8]],["head","armor","off"],1,0,2,0],
  [74,"2:7:1","Wraith Card","mdef",10,[["mdef",10]],["head","armor","off"],1,0,2,1],
  [75,"2:8:0","Evil Druid Card","matk",3,[["matk",3]],["weapon","head"],1,0,2,0],
  [76,"2:8:1","Evil Druid Card","matk",4,[["matk",4]],["weapon","head"],1,0,2,1],
  [77,"2:9:0","Marionette Card","crit",2,[["crit",2]],["weapon","acc"],1,0,2,0],
  [78,"2:9:1","Marionette Card","crit",3,[["crit",3]],["weapon","acc"],1,0,2,1],
  [79,"3:0:0","Scorpion Card","crit",2,[["crit",2]],["weapon","acc"],1,0,3,0],
  [80,"3:0:1","Scorpion Card","crit",3,[["crit",3]],["weapon","acc"],1,0,3,1],
  [81,"3:10:0","Phreeoni Card","crit",3,[["crit",3]],["weapon","acc"],3,1,3,0],
  [82,"3:10:1","Phreeoni Card","crit",4,[["crit",4]],["weapon","acc"],3,1,3,1],
  [83,"3:1:0","Sand Man Card","def",8,[["def",8]],["armor","off","leg"],1,0,3,0],
  [84,"3:1:1","Sand Man Card","def",10,[["def",10]],["armor","off","leg"],1,0,3,1],
  [85,"3:2:0","Desert Wolf Card","field",8,[["field",8]],["weapon","acc"],1,0,3,0],
  [86,"3:2:1","Desert Wolf Card","field",10,[["field",10]],["weapon","acc"],1,0,3,1],
  [87,"3:3:0","Cactus Card","vit",6,[["vit",6]],["armor","off","head"],1,0,3,0],
  [88,"3:3:1","Cactus Card","vit",8,[["vit",8]],["armor","off","head"],1,0,3,1],
  [89,"3:4:0","Pasana Card","str",6,[["str",6]],["weapon","acc"],1,0,3,0],
  [90,"3:4:1","Pasana Card","str",8,[["str",8]],["weapon","acc"],1,0,3,1],
  [91,"3:5:0","Horn Card","def",8,[["def",8]],["armor","off","leg"],1,0,3,0],
  [92,"3:5:1","Horn Card","def",10,[["def",10]],["armor","off","leg"],1,0,3,1],
  [93,"3:6:0","Mummy Card","hpPct",6,[["hpPct",6]],["armor","head","off"],1,0,3,0],
  [94,"3:6:1","Mummy Card","hpPct",8,[["hpPct",8]],["armor","head","off"],1,0,3,1],
  [95,"3:7:0","Isis Card","agi",6,[["agi",6]],["armor","leg","acc"],1,0,3,0],
  [96,"3:7:1","Isis Card","agi",8,[["agi",8]],["armor","leg","acc"],1,0,3,1],
  [97,"3:8:0","Anubis Card","atk",6,[["atk",6]],["weapon"],1,0,3,0],
  [98,"3:8:1","Anubis Card","atk",8,[["atk",8]],["weapon"],1,0,3,1],
  [99,"3:9:0","Minorous Card","str",6,[["str",6]],["weapon","acc"],1,0,3,0],
  [100,"3:9:1","Minorous Card","str",8,[["str",8]],["weapon","acc"],1,0,3,1],
  [101,"4:0:0","Spore Card","vit",6,[["vit",6]],["armor","off","head"],1,0,4,0],
  [102,"4:0:1","Spore Card","vit",8,[["vit",8]],["armor","off","head"],1,0,4,1],
  [103,"4:10:0","Eddga Card","atk",8,[["atk",8]],["weapon"],3,1,4,0],
  [104,"4:10:1","Eddga Card","atk",10,[["atk",10]],["weapon"],3,1,4,1],
  [105,"4:1:0","Wolf Card","field",8,[["field",8]],["weapon","acc"],1,0,4,0],
  [106,"4:1:1","Wolf Card","field",10,[["field",10]],["weapon","acc"],1,0,4,1],
  [107,"4:2:0","Elder Willow Card","int",6,[["int",6]],["weapon","head","acc"],1,0,4,0],
  [108,"4:2:1","Elder Willow Card","int",8,[["int",8]],["weapon","head","acc"],1,0,4,1],
  [109,"4:3:0","Hornet Card","aspd",5,[["aspd",5]],["armor","leg"],1,0,4,0],
  [110,"4:3:1","Hornet Card","aspd",6,[["aspd",6]],["armor","leg"],1,0,4,1],
  [111,"4:4:0","Bigfoot Card","hpPct",6,[["hpPct",6]],["armor","head","off"],1,0,4,0],
  [112,"4:4:1","Bigfoot Card","hpPct",8,[["hpPct",8]],["armor","head","off"],1,0,4,1],
  [113,"4:5:0","Zenorc Card","agi",6,[["agi",6]],["armor","leg","acc"],1,0,4,0],
  [114,"4:5:1","Zenorc Card","agi",8,[["agi",8]],["armor","leg","acc"],1,0,4,1],
  [115,"4:6:0","Skel Archer Card","dex",6,[["dex",6]],["weapon","acc"],1,0,4,0],
  [116,"4:6:1","Skel Archer Card","dex",8,[["dex",8]],["weapon","acc"],1,0,4,1],
  [117,"4:7:0","Ancient Worm Card","def",8,[["def",8]],["armor","off","leg"],1,0,4,0],
  [118,"4:7:1","Ancient Worm Card","def",10,[["def",10]],["armor","off","leg"],1,0,4,1],
  [119,"4:8:0","Orc Warrior Card","atk",6,[["atk",6]],["weapon"],1,0,4,0],
  [120,"4:8:1","Orc Warrior Card","atk",8,[["atk",8]],["weapon"],1,0,4,1],
  [121,"4:9:0","Orc Archer Card","dex",6,[["dex",6]],["weapon","acc"],1,0,4,0],
  [122,"4:9:1","Orc Archer Card","dex",8,[["dex",8]],["weapon","acc"],1,0,4,1],
  [123,"5:0:0","Merman Card","atk",10,[["atk",10]],["weapon"],2,0,5,0],
  [124,"5:0:1","Merman Card","atk",13,[["atk",13]],["weapon"],2,0,5,1],
  [125,"5:1:0","Sea Witch Card","matk",4,[["matk",4]],["weapon","head"],2,0,5,0],
  [126,"5:1:1","Sea Witch Card","matk",5,[["matk",5]],["weapon","head"],2,0,5,1],
  [127,"5:2:0","Coral Crab Card","def",18,[["def",18]],["armor","off","leg"],2,0,5,0],
  [128,"5:2:1","Coral Crab Card","def",23,[["def",23]],["armor","off","leg"],2,0,5,1],
  [129,"5:3:0","Giant Eel Card","aspd",8,[["aspd",8]],["armor","leg"],2,0,5,0],
  [130,"5:3:1","Giant Eel Card","aspd",10,[["aspd",10]],["armor","leg"],2,0,5,1],
  [131,"5:4:0","Siren Card","crit",3,[["crit",3]],["weapon","acc"],2,0,5,0],
  [132,"5:4:1","Siren Card","crit",4,[["crit",4]],["weapon","acc"],2,0,5,1],
  [133,"5:5:0","Deep Jelly Card","hpPct",7,[["hpPct",7]],["armor","head","off"],2,0,5,0],
  [134,"5:5:1","Deep Jelly Card","hpPct",9,[["hpPct",9]],["armor","head","off"],2,0,5,1],
  [135,"5:6:0","Kraken Card","field",13,[["field",13]],["weapon","acc"],3,1,5,0],
  [136,"5:6:1","Kraken Card","field",16,[["field",16]],["weapon","acc"],3,1,5,1],
  [137,"6:0:0","Jiangshi Card","hpPct",7,[["hpPct",7]],["armor","head","off"],2,0,6,0],
  [138,"6:0:1","Jiangshi Card","hpPct",9,[["hpPct",9]],["armor","head","off"],2,0,6,1],
  [139,"6:1:0","Bamboo Fox Card","move",4,[["move",4]],["leg","acc"],2,0,6,0],
  [140,"6:1:1","Bamboo Fox Card","move",5,[["move",5]],["leg","acc"],2,0,6,1],
  [141,"6:2:0","Wild Boar Card","str",12,[["str",12]],["weapon","acc"],2,0,6,0],
  [142,"6:2:1","Wild Boar Card","str",15,[["str",15]],["weapon","acc"],2,0,6,1],
  [143,"6:3:0","Stone Golem Card","def",18,[["def",18]],["armor","off","leg"],2,0,6,0],
  [144,"6:3:1","Stone Golem Card","def",23,[["def",23]],["armor","off","leg"],2,0,6,1],
  [145,"6:4:0","Mantis Card","str",12,[["str",12],["atk",6]],["weapon","acc"],2,0,6,0],
  [146,"6:4:1","Mantis Card","str",15,[["str",15],["atk",6]],["weapon","acc"],2,0,6,1],
  [147,"6:5:0","Dragon Pup Card","atk",10,[["atk",10]],["weapon"],2,0,6,0],
  [148,"6:5:1","Dragon Pup Card","atk",13,[["atk",13]],["weapon"],2,0,6,1],
  [149,"6:6:0","Dragon Lord Card","atk",13,[["atk",13]],["weapon"],3,1,6,0],
  [150,"6:6:1","Dragon Lord Card","atk",16,[["atk",16]],["weapon"],3,1,6,1],
  [151,"7:0:0","Oni Card","atk",10,[["atk",10]],["weapon"],2,0,7,0],
  [152,"7:0:1","Oni Card","atk",13,[["atk",13]],["weapon"],2,0,7,1],
  [153,"7:1:0","Kappa Card","def",18,[["def",18]],["armor","off","leg"],2,0,7,0],
  [154,"7:1:1","Kappa Card","def",23,[["def",23]],["armor","off","leg"],2,0,7,1],
  [155,"7:2:0","Kitsune Card","move",4,[["move",4]],["leg","acc"],2,0,7,0],
  [156,"7:2:1","Kitsune Card","move",5,[["move",5]],["leg","acc"],2,0,7,1],
  [157,"7:3:0","Tengu Card","dex",12,[["dex",12]],["weapon","acc"],2,0,7,0],
  [158,"7:3:1","Tengu Card","dex",15,[["dex",15]],["weapon","acc"],2,0,7,1],
  [159,"7:4:0","Yuki Onna Card","matk",4,[["matk",4]],["weapon","head"],2,0,7,0],
  [160,"7:4:1","Yuki Onna Card","matk",5,[["matk",5]],["weapon","head"],2,0,7,1],
  [161,"7:5:0","Spirit Lantern Card","mdef",18,[["mdef",18]],["head","armor","off"],2,0,7,0],
  [162,"7:5:1","Spirit Lantern Card","mdef",23,[["mdef",23]],["head","armor","off"],2,0,7,1],
  [163,"7:6:0","Shiranui Card","matk",5,[["matk",5]],["weapon","head"],3,1,7,0],
  [164,"7:6:1","Shiranui Card","matk",6,[["matk",6]],["weapon","head"],3,1,7,1],
  [165,"8:0:0","Ghost Hound Card","field",12,[["field",12]],["weapon","acc"],2,0,8,0],
  [166,"8:0:1","Ghost Hound Card","field",15,[["field",15]],["weapon","acc"],2,0,8,1],
  [167,"8:1:0","Banshee Card","matk",6,[["matk",6]],["weapon","head"],2,0,8,0],
  [168,"8:1:1","Banshee Card","matk",8,[["matk",8]],["weapon","head"],2,0,8,1],
  [169,"8:2:0","Death Knight Card","atk",16,[["atk",16]],["weapon"],2,0,8,0],
  [170,"8:2:1","Death Knight Card","atk",20,[["atk",20]],["weapon"],2,0,8,1],
  [171,"8:3:0","Bone Worm Card","hpPct",8,[["hpPct",8]],["armor","head","off"],2,0,8,0],
  [172,"8:3:1","Bone Worm Card","hpPct",10,[["hpPct",10]],["armor","head","off"],2,0,8,1],
  [173,"8:4:0","Frost Wraith Card","mdef",30,[["mdef",30]],["head","armor","off"],2,0,8,0],
  [174,"8:4:1","Frost Wraith Card","mdef",38,[["mdef",38]],["head","armor","off"],2,0,8,1],
  [175,"8:5:0","Soul Eater Card","cdm",20,[["cdm",20]],["acc"],2,0,8,0],
  [176,"8:5:1","Soul Eater Card","cdm",25,[["cdm",25]],["acc"],2,0,8,1],
  [177,"8:6:0","Lord of Death Card","cdm",35,[["cdm",35]],["acc"],3,1,8,0],
  [178,"8:6:1","Lord of Death Card","cdm",50,[["cdm",50]],["acc"],3,1,8,1],
  [179,"9:0:0","Abyss Knight Card","cdm",20,[["cdm",20]],["weapon"],2,0,9,0],
  [180,"9:0:1","Abyss Knight Card","cdm",25,[["cdm",25]],["weapon"],2,0,9,1],
  [181,"9:1:0","Lava Slime Card","hpPct",8,[["hpPct",8]],["armor","head","off"],2,0,9,0],
  [182,"9:1:1","Lava Slime Card","hpPct",10,[["hpPct",10]],["armor","head","off"],2,0,9,1],
  [183,"9:2:0","Chaos Imp Card","matk",6,[["matk",6]],["weapon","head"],2,0,9,0],
  [184,"9:2:1","Chaos Imp Card","matk",8,[["matk",8]],["weapon","head"],2,0,9,1],
  [185,"9:3:0","Shadow Beast Card","crit",5,[["crit",5]],["weapon","acc"],2,0,9,0],
  [186,"9:3:1","Shadow Beast Card","crit",6,[["crit",6]],["weapon","acc"],2,0,9,1],
  [187,"9:4:0","Doom Tree Card","def",30,[["def",30]],["armor","off","leg"],2,0,9,0],
  [188,"9:4:1","Doom Tree Card","def",38,[["def",38]],["armor","off","leg"],2,0,9,1],
  [189,"9:5:0","Hell Worm Card","atk",16,[["atk",16]],["weapon"],2,0,9,0],
  [190,"9:5:1","Hell Worm Card","atk",20,[["atk",20]],["weapon"],2,0,9,1],
  [191,"9:6:0","Dark Lord Card","cdm",50,[["cdm",50]],["weapon"],3,1,9,0],
  [192,"9:6:1","Dark Lord Card","cdm",75,[["cdm",75]],["weapon"],3,1,9,1],
];


// Lookup by the permanent numeric id, NEVER by position.
const BY_ID = new Map(CARD_CATALOG_ROWS.map(r => [r[0], r]));
const BY_KEY = new Map(CARD_CATALOG_ROWS.map(r => [r[1], r]));

// The value the page stamps into every catalog card (cardDefinition -> PROGRESSION_VERSION). Every row
// here was generated from a card the page built, so they all carry this version.
export const CARD_VERSION = 1;

/** The catalog row for a permanent id, or null when this build does not know that card. */
export function catalogRow(catalogId) {
  const r = BY_ID.get(catalogId);
  return r === undefined ? null : r;
}

/** The permanent id for a cardKey, or null. Used when packing; never stored as a row position. */
export function catalogIdOf(cardKey) {
  const r = BY_KEY.get(cardKey);
  return r === undefined ? null : r[0];
}

/** Rebuild the derived half of a card from a catalog id. Returns null for an unknown id. */
export function catalogCard(catalogId) {
  const r = catalogRow(catalogId);
  if (!r) return null;
  return {
    card: 1, cardVersion: CARD_VERSION, cardKey: r[1], family: r[2], stat: r[3], v: r[4],
    effects: r[5].map(e => ({ k: e[0], v: e[1] })),
    fit: r[6].slice(), g: r[7], bossCard: r[8] === 1, map: r[9], nightmare: r[10] === 1,
    n: r[10] === 1 ? 'Nightmare ' + r[2] : r[2],
  };
}

/** Every id this build can decode, for the drift test. */
export const catalogIds = () => CARD_CATALOG_ROWS.map(r => r[0]);

/** The full id -> cardKey map, so the drift test can compare it against a pinned fixture. */
export const catalogIdMap = () => Object.fromEntries(CARD_CATALOG_ROWS.map(r => [r[0], r[1]]));
