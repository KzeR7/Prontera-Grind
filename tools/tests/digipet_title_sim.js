// v373: DigiPet titles and the fishing-title colour. Pure-module checks: every title's rarity colour,
// that a locked title can never be worn, that partner wins and training points add up across the
// party (not just the best partner), and that the fishing title takes its tone colour.
const assert = require('node:assert/strict'), path = require('node:path');
const G = require(path.join(__dirname, '..', '..', 'assets', 'digimon-sanctuary.js'));
const F = require(path.join(__dirname, '..', '..', 'assets', 'social-fishing.js'));

// Every title has a tier and a colour from the rarity palette, and the ids are unique.
const ids = G.DIGI_TITLES.map(t => t.id);
assert.equal(new Set(ids).size, ids.length, 'title ids are unique');
for (const t of G.DIGI_TITLES) {
  assert.ok(G.DIGI_TITLE_COLOR[t.tier], t.id + ' has a known rarity tier');
  assert.match(G.digiTitleColor(t), /^#[0-9a-f]{6}$/i, t.id + ' has a hex colour');
  assert.ok(t.goal > 0 && typeof t.cur === 'function', t.id + ' has a goal and a counter');
}
assert.equal(G.digiTitleColor(null), '', 'no worn title has no colour');

// Owned count, wins and points are summed across the party; stage and mastery take the best partner.
const party = [
  { wins: 30, stage: 1, mastery: 2, stats: { power: 12, guard: 12, agility: 0, focus: 0 } },
  { wins: 20, stage: 3, mastery: 6, stats: { power: 6, guard: 6, agility: 6, focus: 6 } },
];
const st = G.digiTitleStats(party, 2);
assert.equal(st.wins, 50, 'wins add up across the party');
assert.equal(st.points, 24 + 24, 'training points add up across the party');
assert.equal(st.stage, 3, 'stage is the best partner');
assert.equal(st.mastery, 6, 'mastery is the best partner');
assert.equal(st.owned, 2);

// Thresholds: a title unlocks at its goal and not one short of it.
assert.equal(G.digiTitleUnlocked(G.DIGI_TITLE_BY_ID['battle-tested'], st), true, 'battle-tested at 50 wins (goal 25)');
assert.equal(G.digiTitleUnlocked(G.DIGI_TITLE_BY_ID['grinder'], st), false, 'grinder needs 150 wins');
assert.equal(G.digiTitleUnlocked(G.DIGI_TITLE_BY_ID['stable-keeper'], st), false, 'stable keeper needs 6 owned');

// Only an earned title can be worn; unknown ids and locked ids read as none.
assert.equal(G.equippedDigiTitle('battle-tested', st).name, 'Battle-Tested');
assert.equal(G.equippedDigiTitle('grinder', st), null, 'a locked title is not worn');
assert.equal(G.equippedDigiTitle('made-up', st), null, 'an unknown title is not worn');
assert.equal(G.equippedDigiTitle(undefined, st), null, 'no saved title is not worn');

// Bad saved values are clamped, never trusted.
const junk = G.digiTitleStats([{ wins: 'lots', stage: 99, mastery: -4, stats: { power: 1, guard: 1, agility: 1, focus: 1 } }], -3);
assert.equal(junk.owned, 0);
assert.equal(junk.wins, 0);
assert.equal(junk.mastery, 0);
assert.equal(junk.stage, G.MAX_EVOLUTIONS, 'stage is capped at the game limit');
assert.equal(G.digiTitleUnlocked(G.DIGI_TITLE_BY_ID['mega-tamer'], G.digiTitleStats([{ stage: 3, stats: { power: 0, guard: 0, agility: 0, focus: 0 } }], 1)), true, 'final form on the longest line unlocks Mega Tamer');

// Fishing title colour follows its tone, and falls back to the rarity colour when the tone is unnamed.
assert.equal(F.titleColor(F.FISHING_TITLE_BY_ID['mutation-hunter']), '#ff7a7a', 'a crimson-tone title is crimson');
assert.equal(F.titleColor(null), '', 'no worn fishing title has no colour');
assert.match(F.titleColor(F.FISHING_TITLE_BY_ID['tide-regular']), /^#[0-9a-f]{6}$/i, 'an unnamed tone still gets a colour');
console.log('digipet title sim: all checks passed');
