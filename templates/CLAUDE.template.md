# CLAUDE.md

<!-- claude-workspace:start -->
This project was set up with `claude-workspace` using the **{{PRESET}}** preset.

## How to use the skills below

Skills in `.claude/skills/` are not automatically loaded into context — you decide when to consult
one, by matching what you're about to do against its description. Two things make that reliable:

- **Core behavior applies continuously, not once.** Re-check it before every matching action for
  the rest of the project — every commit, every review, every relevant piece of work — not just
  the first time you happen to read the file.
- **When more than one skill applies to the same piece of work, use all of them, not just the
  first match.** A change that touches both code quality and visual design should get a
  code-review pass *and* a design pass — stopping after one is the most common way these get
  under-used.

## Core behavior (check before the matching action, every time)

{{CORE_LIST}}

## Additional skills (use when the current task matches the description)

{{SKILLS_LIST}}

## Workspace manifest

The installed preset and skill versions are tracked in `.claude/workspace.yaml`. Run `npx claude-workspace sync` after pulling changes to keep skills up to date.
<!-- claude-workspace:end -->

<!-- Anything you add below this line is yours — "claude-workspace sync" only touches the block above. -->
