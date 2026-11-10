// Proposal-only regression: the redesign request is documentation, not a gameplay implementation.
import assert from 'node:assert/strict';
import fs from 'node:fs';

const file='docs/proposals/digipet-rift-campaign-proposal-2026-11-09.md';
const proposal=fs.readFileSync(file,'utf8');
assert.match(proposal,/Status: proposal only, not approved and not implemented/i);
assert.match(proposal,/Build a three-partner team, rescue the five lost Data Anchors, then defeat the Null Sovereign/,
  'the player-facing goal must be a clear campaign destination, not a full-index checklist');
assert.match(proposal,/Keep collection optional/i);
assert.match(proposal,/Remove timed stat training from the campaign path/);
assert.match(proposal,/Remove equipment and forge rolls from the campaign path/);
assert.match(proposal,/A loss ends that attempt without deleting a partner or campaign progress already earned/);
assert.match(proposal,/Until those choices are approved, the existing DigiPet system remains unchanged; this is a design proposal only/);
console.log('PASS DigiPet redesign proposal: clear player goal, optional collection, less chore-driven play, and explicit proposal-only boundary');
