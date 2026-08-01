---
name: commit-discipline
description: Enforces clean, meaningful Git history in learning projects. Encourages atomic commits, logical grouping of changes, clear commit messages and disciplined staging while respecting learning-guard.
---

# Commit Discipline

## Purpose

Create a clean Git history that serves as project documentation and supports future review, debugging and learning.

Every commit should represent one meaningful step in the project's evolution.

---

# Commit Philosophy

## One Logical Change

Each commit should have one clear purpose.

Prefer:

- one feature;
- one bug fix;
- one refactoring;
- one styling improvement.

Avoid mixing unrelated changes.

---

## Atomic Commits

Each commit should be:

- atomic;
- understandable;
- reversible;
- independently meaningful.

Someone reading the history should understand *why* the project changed.

---

## Preserve Signal

Prefer fewer high-quality commits over many small ones.

Avoid micro-commits for:

- formatting;
- small renames;
- isolated style tweaks;
- trivial cleanup.

Unless those changes are the actual purpose of the commit.

---

# Before Committing

Review the staged changes.

Check that they:

- belong to the same logical change;
- contain no accidental files;
- contain no temporary debugging code;
- contain no commented-out experiments;
- contain no placeholder implementations.

If the previous commit has not been shared and the new change clearly belongs with it, consider amending instead of creating another commit.

---

# Commit Messages

Prefer Conventional Commits when appropriate:

- `feat:`
- `fix:`
- `refactor:`
- `style:`
- `docs:`
- `test:`
- `chore:`

Rules:

- use the imperative mood ("add", "fix", "extract");
- keep the title concise (ideally ≤72 characters);
- prioritize clarity over strict convention.

Add a commit body only when additional context would help future readers.

The body should explain:

- why the change was made;
- important trade-offs;
- migration notes (if relevant).

Do not repeat the title.

---

# Staging

Stage only files related to the current logical change.

Avoid `git add .` unless every modified file belongs to the same commit.

---

# When to Commit

Create a commit when:

- the user explicitly requests it;
- a logical unit of work is complete;
- before switching to a substantially different task.

Prefer committing at stable checkpoints where:

- the project builds;
- the completed work is coherent;
- the change can be reviewed independently.

If the user explicitly asks for a commit, do not ask for confirmation again.

If they do not, suggest that the work is ready to commit when appropriate.

---

# Examples

Good:

- `feat: add product filtering by category`
- `fix: correct mobile padding on checkout page`
- `refactor: extract product search hook`
- `style: improve ProductCard spacing and hover states`

Avoid:

- `update`
- `fix`
- `small fix`
- `wip`
- multiple commits that together represent one logical change

---

# Collaboration

Respect **learning-guard** at all times.

Commits must never become a way to bypass the user's responsibility for writing production code.

Maintain a clean history so that **health-review** can better identify project evolution, regressions and learning progress.

Never add:

- `Co-authored-by`
- AI signatures
- generated attribution