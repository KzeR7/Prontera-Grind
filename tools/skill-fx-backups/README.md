# Skill FX backup

`pre-afterglow/` preserves the original game effect mapping, sprite recipes,
procedural texture generator, geometry fallback and effect lifecycle from the
`grind-v135` working tree. The manifest records the source revision and SHA256
of each exact source block. Native character, skill-icon and pet artwork remains
in its existing source paths.

Verify the saved copy without changing the game:

```sh
python3 tools/skill-fx-backups/restore.py
```

Restore the two original FX blocks while keeping unrelated game fixes:

```sh
python3 tools/skill-fx-backups/restore.py --restore
bash tools/build_site.sh
```

The saved JavaScript blocks are restoration sources, not standalone modules.
Backup and proposal files live under `tools/`, which the publishing build excludes.
The approved visual reference is `tools/skill-fx-proposals/afterglow-v6.html`.
