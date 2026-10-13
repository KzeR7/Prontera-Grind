# Agent guide — Prontera Grind

Start here before changing the game. This is the shared guide for coding agents;
keep it short and keep detailed explanations in the linked documents.

## First five minutes

1. Read [Game design](docs/GAME-DESIGN.md) and [Decisions](docs/DECISIONS.md).
2. Use [Code map](docs/CODE-MAP.md) to find the system you are changing. Read its
   implementation, relevant tests, and linked asset notes before editing.
3. Read [Development and testing](docs/TESTING.md) for setup, previews and checks.
4. Check `git status --short` and your task's branch/access instructions. Preserve
   unrelated edits. Identify the functions/files your change will touch.
5. For overlapping work, follow [Working with multiple agents](docs/WORKFLOW.md).

Read only the relevant system details after this orientation. Do not load the
entire update log or large generated sprite data to discover how the game works.

## Current architecture

Prontera Grind is a browser Ragnarok-flavoured idle/grind game. Most game logic,
HTML and CSS are in `index.html`, with Three.js loaded from a CDN. Separate modules
under `assets/` handle native wardrobe, pets and skill artwork. Cloud accounts,
saves and GM tools use Cloudflare Pages Functions (`functions/`) and D1 SQL
(`migrations/`). `bash tools/build_site.sh` assembles the static site into `dist/`.
There is no root package manifest and no JavaScript bundler.

## Rules to preserve

- Preserve saves, account ownership, stable class/skill/item IDs, equipment
  identity and numeric pet-species ordering. Cover migrations and account switches
  when changing state. Never duplicate items during a class change.
- Pets come from monster drops; there is no hatching. Played classes restore their
  own progression and equipment. Cosmetics do not change combat or jobs.
- Preserve supplied/native sprite pixels, placement and timing. Do not invent,
  repaint, recolour or substitute sprite art. Current native assets have distinct
  male/female bodies; the old shared-body rule applies only to the legacy pack.
  Preserve all eight directions and idle/walk/attack. Use the system's actual
  metadata, not the legacy pack's fixed frame counts or guessed anchors.
- Edit asset sources/generators and regenerate their outputs together. Follow the
  relevant manifest and README. Montage recutting uses `tools/montage.py`.
- Keep changes scoped to the task. Avoid broad formatting, file extraction or
  balance changes as part of an unrelated fix. Tests extract source by string
  boundaries, so moving code can require updating the real-code harness.
- Add meaningful regression coverage when adding/changing game behavior. Run
  affected checks during development. Before any push, all suites and the required
  checks in [Testing](docs/TESTING.md#before-pushing) must pass. A skip is not a pass.
- Do not put secrets in the repo or change the shared GM password for a preview.
  Use the disposable local server described in Testing.
- Respect the user's delivery instructions and the environment's permitted branch.
  Do not push to or merge `main`, deploy, or message other tasks just because an
  older handover tells you to. Report only actions and results actually verified.

## Completion and update log

For every repository change, append a short entry to
[docs/UPDATE-LOG.md](docs/UPDATE-LOG.md). Existing entries are append-only: never
rewrite, reorder or delete them; correct an old claim in a new entry.

For a player-visible change, also bump `const BUILD` in `index.html`. Coordinate
that label with overlapping work; do not guess a version from an old log entry.
Documentation-only changes do not need a game build bump.

Use plain English for the owner:

```markdown
### YYYY-MM-DD — `<build tag or documentation topic>`
* **Changed:** What changed and what the player or agent will notice.
* **Try it:** How to see the change, or which guide to read.
* **Checks:** What passed; what failed, skipped or remains unavailable.
* **Delivery:** Local changes, commit, push, PR or deployment actually completed.
```

If you only read files or publish an existing commit, no new log entry is needed.
Update the relevant current guide when architecture, commands or game rules change.

## Current guidance and history

The linked handbook is the current starting point. `READ-ME-FIRST.md` and
`TOOLS-START-HERE.md` retain useful tool details but also contain older descriptions;
check them against the current source and system READMEs. When these disagree,
inspect the code/tests and correct the current guide rather than copying an old
claim. New user instructions take precedence over repository guidance.

- [Update history](docs/UPDATE-LOG.md): read specific entries only when needed.
- [Archived agent notes](docs/history/AGENT-NOTES.md): old rationale and procedures.
