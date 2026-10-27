# Equipment workspace fixes — review captures

`preview.png` is a before/after sheet for the four Equipment-window fixes in build
`2026-10-27 haven-v243 equipment workspace polish`:

1. Affixes / Cards / Auto-sell windows were clamped 102px shorter than Loadout; all six
   sub-tabs now share one window box.
2. The close button was overlapped by the expand glyph (the framed 38px title badge also
   matched the tool icons); tool glyphs are pinned back to 18px.
3. The paid-offer decisions (keep / use new affixes / try again) moved from the comparison
   column and the footer into the right-hand Affixes rail.
4. The workspace windows now carry Loadout's 2px gold frame, and the duplicate Zeny that
   the workspaces printed in the title bar is gone.

Captured with headless Chromium at 1826x963 from the local preview server
(`python3 tools/preview_server.py 8000`), with a synthetic Guillotine Cross in Mythic
Voidwalker gear. "Before" is the unmodified working tree at `f1ed73e`; "after" is this
change. Regenerate by re-running the same probe against both trees.
