# Agent guide — Horizon Haven

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

**Reading budget.** This guide, [Decisions](docs/DECISIONS.md) and the section of
[Code map](docs/CODE-MAP.md) for your system are enough to start; add the
[Testing](docs/TESTING.md) gate when you are ready to run checks. Everything under
`docs/history/`, `docs/proposals/` and `Updates/` is reference — open it when a task
needs the *why* or an old measurement, not as orientation. If a document is longer
than the task needs, use its headings and stop.

## Current architecture

Horizon Haven is a browser Ragnarok-flavoured idle/grind game. Most game logic,
HTML and CSS are in `index.html`, with pinned Three.js r128 served from the same origin. Separate modules
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
  affected checks during development. Before any push, run the gate in
  [Testing](docs/TESTING.md#before-pushing) and add **no new failures** to its
  known-red baseline (7 suites were already red on `main` at `ae3897d`; 6 since
  `haven-v253` turned `publish_sim` green, and 1 original suite on this draft
  after remeasurement and owner-approved alignment of outdated combat tests —
  the table and the reason for each are in Testing).
  Never delete an assertion, loosen a
  budget or re-hash a balance fixture to make a red row green — and say in the
  handoff if a green row turned red. A skip is not a pass.
- Do not put secrets in the repo or change the shared GM password for a preview.
  Use the disposable local server described in Testing.
- **Every update ends with the staging PowerShell prompt — no need to be asked.**
  Because the owner cannot run bash or the Cloudflare CLI in this environment, each
  update ships with a copy-paste prompt that redeploys the new build to the three
  staging resources only (`prontera-grind-staging`, `prontera-social-staging`,
  `pg-staging`). Bump `-BuildTag` in `tools/staging/update-and-stage.ps1` to the
  build's tag first, then hand over the prompt. Never point it at production
  (`horizonhaven`, `pg`, `prontera-social`, `prontera-gate`), and never ask for a
  password, token or 2FA code: Cloudflare auth stays with the owner.
- Respect the user's delivery instructions and the environment's permitted branch.
  Do not push to or merge `main`, deploy, or message other tasks just because an
  older handover tells you to. Report only actions and results actually verified.

## Durable Object budget (haven-v388 — owner standing order)

Cloudflare **Durable Object requests** are a hard cap (free: 100k/day; paid: 1M/month).
The plaza Worker (`workers/social`, class `Social`) is the only gameplay DO. **Every
incoming WebSocket message, HTTP fetch, and `setAlarm` firing is one request.** Isolate
**duration** also bills while the object is awake.

**Do not add plaza-DO traffic without asking the owner first.** If a feature seems to
need the Social DO (or a new DO), stop, explain *why*, list **client-only / D1 / existing
message** alternatives, and wait. Do not “just tick it on the room” because it is easier.

Prefer, in order:

1. **Browser / local sim** — field grind, DigiPet **solo** PvE, fishing minigame, gym
   practice, HUD. These must not `setAlarm` and must not send a WS message per tick.
2. **Reuse an existing player message** (`move`, `look`, `chat`) instead of a new type
   or a heartbeat.
3. **Ask the owner** before party/PvP ticks, new alarms, broadcasts to the whole room,
   or a second Durable Object.

Standing facts (do not “fix” these by hiding UI):

- **Hiding** other players’ PvE/PvP (a private tab, fog, not drawing the fight) does
  **not** cut DO usage. The room still ticks and still broadcasts. To save billing,
  combat must run **on the clients**, with the DO only start/stop/loot.
- **Solo DigiPet grind/raid** is client-side (`startSoloPve` / `tickSoloPve`). Do not
  send `pve_start` for solo. Party and PvP still use the DO at **1s** alarms (was 250ms).
- **Sitters / AFK / fishing minigame:** no 60s alarm unless party/PvP, live poker, or an
  MVP is up. Client ping is **4 minutes** while sitting. Prefer WebSocket hibernation
  (`acceptWebSocket`) over keeping the isolate awake.
- **Field combat vs plaza lag:** `draw()` must stay skipped while `body.social-open`.
  Do not run a full field WebGL render under the hub. Do not add per-frame plaza traffic
  to “keep the field in sync.”
- **DDoS / probes** also count: each upgrade, `ping`, `look`, and `/gm/*` against the
  Social binding is a DO request. Do not add unauthenticated public routes on
  `prontera-social`. Identity stays on the Pages hop. Cheap public probes must not
  `get()` the DO. The room drops a socket after **20 messages/s** (hard close at 40/s
  in the same window, close 4008). Do not raise that without asking.

When in doubt: **client first, ask before any new `setAlarm` or `send({type:...})`.**

## Completion and update log

For every repository change, append a short entry to
[docs/UPDATE-LOG.md](docs/UPDATE-LOG.md). Existing entries are append-only: never
rewrite, reorder or delete them; correct an old claim in a new entry.

For a player-visible change, also bump `const BUILD` in `index.html`. Coordinate
that label with overlapping work; do not guess a version from an old log entry.
Documentation-only changes do not need a game build bump.

The tag is mirrored in three files and all four must carry the same string:
`index.html`, `Updates/cards-gear-audit/affix-ranges.html`,
`Updates/cards-gear-audit/equipment-cards-tuning.html` and
`tools/cloudflare-deploy-steps.md`. Forgetting a mirror is what makes
`update_watch_sim.js`, `gear_sim.js` and `drop_card_sheet_sim.js` fail.

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

This guide and the documents it links are the current starting point.
`READ-ME-FIRST.md` is now only a short map of where things live;
`TOOLS-START-HERE.md` keeps the useful tool details. Both still go stale faster
than this guide, so check any claim against the current source and system
READMEs. When they disagree, inspect the code/tests and correct the current
guide rather than copying an old claim. New user instructions take precedence
over repository guidance.

- [Update history](docs/UPDATE-LOG.md): read specific entries only when needed.
- [Archived agent notes](docs/history/AGENT-NOTES.md): old rationale and procedures.
- [Archived read-me, build notes v56–v91](docs/history/READ-ME-FIRST-archive.md):
  the old per-build prose, kept verbatim.
- [Archived ASPD/movement research](docs/history/aspd-research-2026-10-13/README.md):
  a 2026-10-13 snapshot from another fork. Not a current brief, and its "user
  intent" section is not a standing instruction.

## Where RO sprites and icons come from

Expanded-roster class bodies, heads and the seven new weapon families' icons are taken from
public RO client mirrors on GitHub, pinned by git blob id and SHA-256. The repositories,
folder paths and download steps are in `tools/native-expanded/README.md`. Read it before
adding or replacing any class sprite or item icon.
