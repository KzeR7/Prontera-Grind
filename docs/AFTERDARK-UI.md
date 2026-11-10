# Afterdark hub UI (haven-v378)

The owner-approved Afterdark study is implemented in the existing social UI.
The main field retains its arrangement and its Moonstone/Aurora/Ember palettes.

## Controls and presentation

- Compact top controls, with native fish/companion art; More exposes the real
  field destinations, including Equipment and the Refine subtab, without leaving.
- The minimap is at the top, including the phone shell. Its north/south avenue
  now follows x=0, and its gym uses the shared angled wall segments. Expanded
  map, relationship/activity markers and legend remain available.
- The bottom monitor reads the existing field HUD rate values. A hub-first
  account says **Field not started**; session/gate pauses say **Field paused**.
  Neither displays stale rates as active farming. Actual trials are labelled.
- DigiPet retains Partners / DigiDex / Pet Bag / Evolution, four independent
  slots, existing actions and native animated canvases. The selected partner
  has a larger native canvas; training gauges use actual stats, and equipped
  slots reuse the existing gear painter.
- Latest-main DigiPet titles keep their own section after the training and
  equipment blocks; wearing and removing a title still goes through
  `equipDigiTitle`, and `PGSocial.refreshDigimon()` still repaints the panel.
- One management window is foregrounded at a time. Opening another minimizes
  the poker UI without standing up, and hides the fishing inventory without
  stopping a cast. The original leave confirmations still own leaving activities.
- Running gym/PvE/ring activities get a compact actionable status while a
  management window is open. The upstream one-line DigiPet panel (`#sapMin`,
  `Open`, `Stop`) is unchanged and still expands in place.
- Shared chat keeps stable channel nodes, history, unread, whisper recipient,
  emotions, typed RO commands, player actions and resize/minimize handlers. The
  emotion tray still opens inside the chat box below the channel tabs. Field
  chat derives its colours from the field palette; only the hub uses the new
  accent treatment.

## Verification — Windows, Node 22.23.4

Source: GitHub API archive; latest incorporated main is
`7a43867d5554fe4863280109cb7d87844308e51e` (PRs #200 and #201). No clone.
Dependencies follow `docs/TESTING.md`.

- Latest-base gate: **217 configured checks attempted, 206 pass, 11 fail**.
  Every remaining failure reproduces on the untouched latest-main snapshot in
  this environment, so this branch adds no red rows. No dependency skip counted
  as a pass.
- Remaining failures: `card_star_balance_sim`, `class_skin_sim`,
  `hosted_launch_stage_sim`, `hosted_scrypt_prepare_sim`,
  `hosted_scrypt_reader_probe_sim`, `preview_fields_sim`, `publish_sim`,
  `session_lost_sim`, `skill_balance_sim`, `sprite_viewer_sim`,
  `weapon_proposal_sim`. Causes include unavailable Git history, Windows
  path/Python-launcher/SQLite cleanup assumptions and the existing classic
  publish-size ceiling. Budgets and balance fixtures are unchanged.
- `node tools/tests/afterdark_ui_sim.js` passes real field-window routing,
  exclusivity, all four DigiPet views, native portrait/gauges, phone map painting,
  hub-first/session-loss rate states, and stable chat controls.
  `digipet_title_sim`, `emote_tray_sim`, `digimon_index_sim`,
  `digimon_sanctuary_ui_sim`, `social_ui_sim`, `social_fishing_sim`,
  `social_table_chat_sim` and `update_watch_sim` all pass on the merged source.
- `bash tools/build_site.sh` succeeds. Real Chromium against the built site with
  a disposable local account passes 24 panel-bound/overflow checks at 1440,
  1000 and 390 pixels, the three field-chat palettes, native sprite loading,
  live WebGL plaza rendering and continued field kills/rates after hub re-entry.
  The same run wears and removes a DigiPet title, checks the title section's
  place in the panel, shrinks and expands the one-line activity panel, and
  confirms the emotion tray opens below the chat tabs with all 32 emotes.
  No page exceptions or failed local asset responses. The CDN Three r128 file
  was supplied locally with identical bytes/SRI, not a renderer stub.

This is local browser/Worker verification, not a hosted deployment or physical
phone performance certification. The full gate is not green for the reasons above.
