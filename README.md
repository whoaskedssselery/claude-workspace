# Claude Workspace

Opinionated workspace manager for Claude Code.

Install learning-oriented presets with a single command:

```bash
npx claude-workspace init react-learning
```

This installs, into the current directory:

- `.claude/skills/` — the preset's skills, so they apply automatically without being invoked manually
- `.claude/workspace.yaml` — a manifest of the installed preset and skills
- `CLAUDE.md` — a generated project entry point (left untouched if one already exists)
- a small marked block appended to `.gitignore` (created if missing) for state that's genuinely
  personal and shouldn't be committed: `.claude/settings.local.json` and `.DS_Store`. `.claude/skills/`,
  `.claude/workspace.yaml` and `CLAUDE.md` are deliberately **not** ignored — they're the whole
  point of the tool and are meant to be committed and shared with the rest of the team.

Skills are installed the way Claude Code expects them: one directory per skill under
`.claude/skills/<name>/SKILL.md`.

## Presets

- **react-learning** — a learning-first setup for React/TypeScript projects. The human writes all
  application code; Claude teaches, reviews, designs and keeps commits clean
  ([learning-guard](skills/core/learning-guard/SKILL.md), [teacher](skills/core/teacher/SKILL.md),
  [health-review](skills/core/health-review/SKILL.md), [commit-discipline](skills/core/commit-discipline/SKILL.md)),
  plus two bundled skills:
  - [react-best-practices](skills/frontend/react-best-practices/SKILL.md) — vendored as-is from
    [vercel-labs/agent-skills](https://github.com/vercel-labs/agent-skills) (MIT).
  - [codegraph](skills/frontend/codegraph/SKILL.md) — usage guide for the
    [CodeGraph](https://github.com/colbymchenry/codegraph) MCP server; requires installing
    CodeGraph itself separately (`codegraph install`).

  **Impeccable** ([pbakaus/impeccable](https://github.com/pbakaus/impeccable)) and **Superpowers**
  ([obra/superpowers](https://github.com/obra/superpowers)) are listed in this preset too, but
  neither ships as a single portable skill file — both are full tools with their own installers, so
  vendoring a copy would drift from upstream immediately.

  By default `init` does **not** install them — it only prints the command, since not every project
  needs them and they shouldn't be pulled down on every `init` of every preset:
  - Impeccable: `npx impeccable install --providers=claude --scope=project`
  - Superpowers: `claude plugin marketplace add obra/superpowers-marketplace` then
    `claude plugin install superpowers@superpowers-marketplace --scope project`

  Pass `--with-external` to have `init` run those installers for you as part of the same command.
  If an installer isn't reachable even then (no network, `claude`/`npx` not on PATH), `init` doesn't
  fail — it prints the manual command instead and keeps going.

## Usage

```bash
npx claude-workspace init <preset> [targetDir] [--with-external]
```

## Roadmap

`sync`, `update`, `doctor`, `add` and `remove` are stubbed in the CLI (`claude-workspace <command>`)
but not implemented yet.

## Local development

This package isn't published to npm yet, so `npx claude-workspace init ...` won't resolve anywhere
until it is. To try it against a real project before publishing:

```bash
npm pack                        # produces claude-workspace-<version>.tgz
cd /path/to/some/test-project
npx -p /absolute/path/to/claude-workspace-<version>.tgz claude-workspace init react-learning .
```

`npx <tarball-path> <args>` (without `-p`) has been observed to silently do nothing on Windows/Git
Bash — no output, no error, exit code 0. Use the `-p <tarball> claude-workspace <args>` form above,
or just run the script directly with `node scripts/workspace.js init react-learning <targetDir>`.