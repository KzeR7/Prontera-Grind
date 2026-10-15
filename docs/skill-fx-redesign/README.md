# Skill FX redesign: execution handoff

Status: **proposal, ready for implementation in a new chat**. No replacement artwork or new runtime behavior is delivered by this proposal. The existing V149 effects remain a comparison baseline, not an approved quality target.

## Owner's direction

- Aim for the clarity, material richness and impact of original PC Ragnarok Online, with improved detail and presentation.
- Preserve the existing skill directions and movement. Improve graphics and contact animation.
- Grimtooth: smaller blades/teeth, many surrounding the monster, like a worm's toothed mouth. Keep that custom design rather than copying RO's spike trail.
- Avoid childish shapes, glossy plastic, weak translucent impacts and generic particle decoration.
- Prove the result with one finished Grimtooth, then Sonic Blow and Fire Bolt, before expanding the style across the roster.

## Read in order

1. [Execution plan](EXECUTION-PLAN.md): phases, renderer changes, checks and delivery.
2. [Art direction](ART-DIRECTION.md): material treatment, asset workflow, rejection criteria.
3. [Skill inventory](skill-inventory.json): 75 rendered skills joined to actual game definitions; 16 passive skills explicitly excluded.
4. [Pilot specifications](pilot-specs.json): concrete art, timing and scale targets for the three pilots.
5. [Asset register](asset-register.json): 15 proposed asset groups and production briefs.
6. [Research sources](research-sources.json): pinned technical evidence and limitations.
7. [New-chat prompt](NEW-CHAT-PROMPT.md): paste this to continue.

The JSON files use `schemaVersion: 1`. `observed` fields describe current code; `proposed` fields are starting design targets, not measurements or claims of completion. Inventory production status is intentionally `not_started` for every skill. Original combat fields are a snapshot for comparison, never a replacement balance configuration.

## Baseline and transport

Repository: `kingz0010/Prontera-Grind`; base `bd763574290afdaf68d6b3143fe2ddb0344e3322`; local build `2026-10-15 haven-v149 Maw and impact`.

The accompanying downloadable ZIP contains this proposal, baseline captures, a tracked binary patch, nonignored untracked source files, and SHA256 manifests. See its `RESTORE.md` before applying anything. A new chat or checkout does not automatically inherit this task's dirty tree, output files, runtime dependencies, processes, or permissions.

PR creation is pending: this task has Manual permissions. The owner must select Full access and request PR creation again in a later turn. No PR URL exists yet. A proposal-only PR should contain this directory and the appended update-log entry; existing implementation changes should be carried separately and described as an unapproved baseline.
