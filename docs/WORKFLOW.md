# Working with multiple agents

Each task should be understandable and independently reviewable. Follow the user's
chosen coordination and delivery workflow; this guide does not authorize spawning
agents, messaging other tasks, merging or deploying.

## Before editing

- Check the branch, working-tree status and latest relevant code. Separate task
  sandboxes may have different starting revisions; shared agents may see the same files.
- State the goal, affected systems and intended checks in the task conversation.
- Identify shared edit areas: especially `index.html`, save migrations, asset
  catalogs and the update log. A separate branch does not prevent merge conflicts.
- If another task owns the same area, use the authorized coordination route to
  agree which change happens first. Avoid silently duplicating its work.

## During implementation

- Make the smallest complete change. Avoid whole-file formatting and incidental
  refactors of `index.html`; they obscure edits and increase conflicts.
- Share helpers only when needed. Check callers and extracted-test boundaries.
- Preserve unrelated dirty files. Do not reset or overwrite another task's work.
- Keep source assets, generated outputs and their manifests in agreement.
- Update current documentation in the same patch as the change it describes.
  Keep temporary screenshots, exports, databases and logs outside tracked source.

## Combining branches

When integration is part of your task, inspect both changes before resolving a
conflict. Preserve both behaviors and item/save compatibility, then rerun affected
checks on the combined result. Do not resolve a large HTML/catalog conflict by
accepting one entire side without understanding what that discards.

Update-log conflicts should retain every entry exactly once. Preserve historical
order; new concurrent entries can be appended sequentially. Agree a current build
label for combined player-visible changes and refresh any tests that deliberately
mirror it. Do not change balance fixture values just to make a conflict disappear.

## Handoff checklist

- Summarize the change, affected files and any compatibility impact.
- List checks actually run and their results, including skips and blockers.
- Append the entry required by [AGENTS.md](../AGENTS.md#completion-and-update-log).
- Bump the game build only for a player-visible change.
- Include the commit/branch or PR link only if it exists and is verified.
- Distinguish local work, pushed code, merged code and a verified deployment.

For an agent that does not discover repo instructions automatically, use this task
opening:

> Read AGENTS.md and the linked notes relevant to this task before editing. Preserve
> saves and unrelated changes. Identify affected files and checks, implement the
> requested change, update the relevant guide and append the update log. Follow this
> task's branch and delivery instructions.
