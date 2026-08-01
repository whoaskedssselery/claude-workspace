🇬🇧 English · [🇷🇺 Русский](README.ru.md)

# Claude Workspace

[![CI](https://github.com/whoaskedssselery/claude-workspace/actions/workflows/ci.yml/badge.svg)](https://github.com/whoaskedssselery/claude-workspace/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

Opinionated workspace manager for Claude Code.

Prepare a project for a specific way of working — learning, day-to-day project work, a graded
assignment, a redesign, contributing to someone else's repo — with a single command:

```bash
npx claude-workspace init <preset>
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

Presets are usage patterns, not tech stacks. None of them are React-specific or backend-specific —
pick the preset that matches *how* you're working, then bolt on the actual technology with `--with=`
(see below).

| Preset | Core behavior | For |
|---|---|---|
| `learning` | [learning-guard](skills/core/learning-guard/SKILL.md), [teacher](skills/core/teacher/SKILL.md), [health-review](skills/core/health-review/SKILL.md), [commit-discipline](skills/core/commit-discipline/SKILL.md), [codegraph](skills/core/codegraph/SKILL.md) | Learning any technology. The human writes all application code; Claude teaches, reviews, and designs. These core skills describe pure teaching/review *patterns* and don't name a single technology anywhere — tell Claude what you're actually learning, and add it with `--with=` (see below). |
| `project` | health-review, commit-discipline, codegraph | Day-to-day work on an existing/production project. No learning restrictions — Claude writes code normally. Add `--with=spike` for a specific piece of throwaway/exploratory work — see [Format variants](#format-variants). |
| `assignment` | [assignment-mode](skills/core/assignment-mode/SKILL.md), commit-discipline, codegraph | University coursework, take-home tests, graded exercises. Claude may write the solution directly, verifies it actually works, and stays inside the stated requirements. Add `--with=assignment-defend` if the grader will ask the human to explain the work — see [Format variants](#format-variants). |
| `redesign` | health-review, commit-discipline, codegraph | Projects that need visual work, not a learning exercise — drops learning-guard/teacher. Skills: [react-best-practices](skills/frontend/react-best-practices/SKILL.md); external: `taste`, `ui-ux-pro-max`, `impeccable`. Add `--with=claude-design` for [HTML-artifact design work](skills/design/claude-design/SKILL.md) — not installed by default, since not every redesign needs a full design-artifact mode. |
| `oss-contribution` | commit-discipline, codegraph | Contributing to someone else's repository — minimal, convention-following diffs. |

## Format variants

Some presets have two genuinely different behaviors depending on circumstances outside the code
itself — not a technology choice, a *how strict/how much explanation* choice. These live in
`skills/formats/` and attach the same way a tech skill does, via `--with=`:

- **Assignment: submit vs. defend.** Some graders only run the code and check the output; others
  question the submission or require an oral defense. `assignment` already verifies the solution
  works either way — add [`assignment-defend`](skills/formats/assignment-defend/SKILL.md) when the
  human will actually have to explain or defend it: it adds a short defense sheet, an offer to quiz
  the human on the material, and a deeper walkthrough on request.

  ```bash
  npx claude-workspace init assignment . --with=assignment-defend
  ```

- **Project: spike vs. production.** Sometimes you just want to know if an idea works; sometimes
  you're shipping. `project`'s defaults (health-review, commit-discipline) assume the latter. Add
  [`spike`](skills/formats/spike/SKILL.md) when you explicitly want to move fast and throw the code
  away — it relaxes those defaults for that specific piece of work and flags clearly before spike
  code gets treated as production-ready.

  ```bash
  npx claude-workspace init project . --with=spike
  ```

## Skill catalog

- **`skills/core/`** — behavioral skills, copied into every preset that lists them. `codegraph` lives
  here (not under a domain) because it's a general code-navigation tool useful across every domain,
  not just frontend — keeping it core avoids re-explaining/re-invoking it per stack and saves tokens.
- **`skills/frontend/`** — react-best-practices (vendored from
  [vercel-labs/agent-skills](https://github.com/vercel-labs/agent-skills), MIT), plus
  react-expert, vue-expert and graphql-architect (from
  [Jeffallan/claude-skills](https://github.com/Jeffallan/claude-skills), MIT).
- **`skills/design/`** — [claude-design](skills/design/claude-design/SKILL.md), vendored from
  [jiji262/claude-design-skill](https://github.com/jiji262/claude-design-skill) (MIT).
- **`skills/backend/`** — api-designer, security-reviewer, database-optimizer,
  microservices-architect and websocket-engineer.
- **`skills/fullstack/`** — fullstack-guardian (frontend/backend consistency, shared contracts).
- **`skills/ml/`** — ml-pipeline, rag-architect, fine-tuning-expert, pandas-pro, spark-engineer.
- **`skills/devops/`** — devops-engineer, kubernetes-specialist, terraform-engineer, cloud-architect.
- **`skills/general/`** — code-reviewer, debugging-wizard, test-master — cross-cutting, not tied to
  one domain.
- **`skills/planning/`** — [feature-forge](skills/planning/feature-forge/SKILL.md): structured
  requirements workshops — user stories, EARS-format requirements, acceptance criteria,
  implementation checklists. Not bundled into any preset by default; add it with `--with=feature-forge`
  wherever you want a planning pass before building.
- **`skills/formats/`** — original, not vendored: [assignment-defend](skills/formats/assignment-defend/SKILL.md)
  and [spike](skills/formats/spike/SKILL.md), optional behavioral variants (see
  [Format variants](#format-variants)).

Everything in `skills/frontend`, `backend`, `fullstack`, `ml`, `devops`, `general` and `planning`
(other than react-best-practices and claude-design) is vendored from
[Jeffallan/claude-skills](https://github.com/Jeffallan/claude-skills) (MIT) — run
`npx claude-workspace list` for the full set with descriptions.

Everything above is a static, portable `SKILL.md` (+ optional reference files) with no installer of
its own, so `init` copies it directly whenever it's requested — no flag needed for domain skills.

## `--with=`: technologies and format variants

Presets don't hardcode a stack, so this is how you tell `init` what you actually want on top of the
preset's core behavior. `--with=` accepts **any** known skill name — domain skills, format variants
and external tools alike — comma-separated, and works for more than one at a time:

```bash
npx claude-workspace init learning . --with=react-best-practices
npx claude-workspace init learning . --with=api-designer,security-reviewer,database-optimizer
npx claude-workspace init redesign . --with=taste,claude-design
npx claude-workspace init assignment . --with=assignment-defend
npx claude-workspace init project . --with=feature-forge
```

It isn't limited to what the chosen preset already lists — `learning` ships with an empty skill
list precisely so `--with=` is the only thing that decides which stack you're learning.

A misspelled name doesn't fail silently — `init`/`sync` suggest the closest known match:

```
! "databse-optimizer" isn't a known skill or external tool — skipped (did you mean "database-optimizer"?)
```

## External tools

Some named skills are full tools with their own installer or plugin marketplace, not a portable
file — vendoring a copy would drift from upstream immediately. `init` never pulls these down by
default; it only prints the install command:

| Name | Source | Install command |
|---|---|---|
| `impeccable` | [pbakaus/impeccable](https://github.com/pbakaus/impeccable) | `npx impeccable install --providers=claude --scope=project` |
| `superpowers` | [obra/superpowers](https://github.com/obra/superpowers) | `claude plugin marketplace add obra/superpowers-marketplace` then `claude plugin install superpowers@superpowers-marketplace --scope project` |
| `taste` | [Leonxlnx/taste-skill](https://github.com/Leonxlnx/taste-skill) | `npx skills add https://github.com/Leonxlnx/taste-skill --skill "design-taste-frontend"` |
| `ui-ux-pro-max` | [nextlevelbuilder/ui-ux-pro-max-skill](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill) | `npm install -g ui-ux-pro-max-cli` then `uipro init --ai claude` |

`--with=<name>` installs that one for real (runs its installer); `--with-external` installs every
external tool the chosen preset lists. Without either, `init` just prints the command. If an
installer isn't reachable even then (no network, `claude`/`npx` not on PATH), `init` doesn't fail —
it prints the manual command instead and keeps going.

## Usage

```bash
npx claude-workspace list
npx claude-workspace init <preset> [targetDir] [--with-external] [--with=<name,name,...>]
npx claude-workspace sync [targetDir]
```

`list` prints every preset, skill and external tool this package knows about with a one-line
description each — the catalog's grown enough that it's easier to check this than to read the repo.

`sync` re-copies whatever `.claude/workspace.yaml` declares from the currently installed
`claude-workspace` package — use it after upgrading the package to pick up skill content updates
without re-running `init`. It leaves `CLAUDE.md` alone and doesn't re-run external tools' installers
(update those with their own CLI, e.g. `codegraph upgrade`, `uipro update`).

## Roadmap

`update`, `doctor`, `add` and `remove` are stubbed in the CLI (`claude-workspace <command>`) but not
implemented yet.

## Local development

This package isn't published to npm yet, so `npx claude-workspace init ...` won't resolve anywhere
until it is. To try it against a real project before publishing:

```bash
npm pack                        # produces claude-workspace-<version>.tgz
cd /path/to/some/test-project
npx -p /absolute/path/to/claude-workspace-<version>.tgz claude-workspace init learning .
```

`npx <tarball-path> <args>` (without `-p`) has been observed to silently do nothing on Windows/Git
Bash — no output, no error, exit code 0. Use the `-p <tarball> claude-workspace <args>` form above,
or just run the script directly with `node scripts/workspace.js init learning <targetDir>`.

## Testing

Zero dependencies, including for tests — they run on Node's built-in test runner:

```bash
npm test
```

Covers the YAML sub-parser, the Levenshtein typo-suggestion logic, frontmatter description
extraction, `.gitignore` merging (including idempotency and preserving existing content), and
`init`/`sync` end-to-end against real presets and skills in a temp directory. CI runs this on
Node 18/20/22 on every push and PR.

## License

[MIT](LICENSE)
