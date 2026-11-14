# Native expanded-roster sprites

`tools/make_expanded_pack.py` renders the 40 expanded-roster hero bodies (20 classes, male
and female) straight from Ragnarok Online client files, the way the client composes them.

- `roact.py` - small SPR / ACT reader and frame painter (Python + Pillow, no other tools).
- `source-manifest.json` - every source file: repository, commit, path, git blob id, size
  and SHA-256. Bodies and the reference head come from `devilm/costume-ro`
  (`data/sprite/인간족/몸통` and `머리통`); the Gunslinger's held gun comes from
  `rAthena-Thailand/ClientROThailand`.
- `output-manifest.json` - SHA-256 of every file in `assets/sprite-pack-x/`; this is what
  `--check` compares.

```
python3 tools/make_expanded_pack.py          # needs `gh` (GitHub API) and Pillow; ~4 minutes
python3 tools/make_expanded_pack.py --check  # offline
```

Downloads land in `.cache/native-expanded/` and are never committed. Pixels are not
redrawn or recoloured. The older sheets in `Sprite/` are kept as the owner's uploads but
are no longer the source of these bodies.
