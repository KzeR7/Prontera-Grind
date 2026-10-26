# Archived: attack-speed / movement research (2026-10-13)

**This is not a current brief.** It is a frozen record, kept because it holds the
measurements behind the movement cap and the ASPD proposals. Nothing here
describes today's game and nothing here authorizes a change.

- **Prepared:** 2026-10-13, build `2026-10-13 haven-v139 Movement cap`.
- **Base revision:** `4e4102c7d625126af1b6851505a5b6db6f2a22bc` in a different
  fork (`Kingz0007/Prontera-Grind`) with vercel-sandbox checkout paths. Those
  paths and that repository do not exist in this checkout.
- **What was actually done:** a 30% movement-cap reduction, implemented locally,
  with tests and docs, and left **uncommitted** — see
  `local-movement-changes.patch`. Everything else in the report is research.
- **What was never done:** no attack-speed formula was applied to repository
  source. All four ASPD variants were measured in temporary in-memory copies.
  Its "current user intent" section (keep ASPD 182, cut movement 30%, explore
  crit resistance) is a 2026-10-13 request, not a standing instruction.

## Contents

| File | What it is |
| --- | --- |
| `HANDOFF.md` | The research handoff and full report |
| `research/` | Exact formulas (`aspd-formulas.json`), raw combat samples, and the portable benchmark / comparison / extended-boss scripts |
| `local-movement-changes.patch` | The uncommitted edits as they stood (check against the base revision before applying; the current tree has moved far past it) |
| `validation-record.md` | Detailed execution record, prior failures, final hashes, limitations |
| `original-research-scripts/` | Scratch audits; may carry sandbox-specific paths |
| `manifest.json` | SHA256 identities for the bundled files, relative to this folder |

## Before using any of it

Read [AGENTS.md](../../../AGENTS.md), [Game design](../../GAME-DESIGN.md),
[Decisions](../../DECISIONS.md), [Code map](../../CODE-MAP.md) and
[Testing](../../TESTING.md) in the current checkout first. If a number here
conflicts with current code, the code and its tests win — record the correction
as a new entry in the [update log](../../UPDATE-LOG.md) rather than trusting this
snapshot.
