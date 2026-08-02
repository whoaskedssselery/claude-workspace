🇬🇧 English · [🇷🇺 Русский](README.ru.md)

# Claude Workspace

[![CI](https://github.com/whoaskedssselery/claude-workspace/actions/workflows/ci.yml/badge.svg)](https://github.com/whoaskedssselery/claude-workspace/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

Opinionated workspace manager for Claude Code.

Prepare a project for a specific way of working — learning, day-to-day project work, a graded
assignment, a redesign, contributing to someone else's repo — with a single command. Install it
globally, with whichever package manager you use:

```bash
npm install -g claude-workspace    # or: pnpm add -g / yarn global add / bun add -g claude-workspace
claude-workspace init
```

That launches the [interactive wizard](#interactive-wizard) — pick (or build) a preset, pick
additional skills, confirm — which is the primary way to use this tool. Prefer scripting it
instead (CI, automation, or you already know exactly what you want)? Pass a preset name and flags
directly, no prompts:

```bash
claude-workspace init <preset>
```

Don't want a global install? Every package manager has a run-without-installing equivalent, and
they all work the same way:

| Package manager | Wizard | Scriptable |
|---|---|---|
| npm | `npx claude-workspace init` | `npx claude-workspace init <preset>` |
| pnpm | `pnpm dlx claude-workspace init` | `pnpm dlx claude-workspace init <preset>` |
| yarn | `yarn dlx claude-workspace init` | `yarn dlx claude-workspace init <preset>` |
| bun | `bunx claude-workspace init` | `bunx claude-workspace init <preset>` |

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
`claude-workspace list` for the full set with descriptions.

Everything above is a static, portable `SKILL.md` (+ optional reference files) with no installer of
its own, so `init` copies it directly whenever it's requested — no flag needed for domain skills.

## `--with=`: technologies and format variants

Presets don't hardcode a stack, so this is how you tell `init` what you actually want on top of the
preset's core behavior. `--with=` accepts **any** known skill name — domain skills, format variants
and external tools alike — comma-separated, and works for more than one at a time:

```bash
claude-workspace init learning . --with=react-best-practices
claude-workspace init learning . --with=api-designer,security-reviewer,database-optimizer
claude-workspace init redesign . --with=taste,claude-design
claude-workspace init assignment . --with=assignment-defend
claude-workspace init project . --with=feature-forge
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

## Interactive wizard

**This is the primary way to use the tool.** Run `init` with no preset name in an interactive
terminal:

```bash
claude-workspace init
```

Flags and preset names — everything documented above — are the scriptable/advanced path for CI,
automation, or when you already know exactly what you want; the wizard is what you reach for day
to day.

It walks through the same decisions step by step instead of requiring flags up front, each screen
tagged with which step you're on:

1. **Language** — Russian or English. Remembered in `~/.claude-workspace/config.json`, so it only
   asks once, ever.
2. **Preset** — pick a built-in one, a custom preset you saved before, or "build a custom preset."
3. **Additional skills** — a checkbox list split into domain skills, relevant format variants
   (only `assignment-defend` for `assignment`, only `spike` for `project` — never both), and
   external tools, each with a one-line hint pulled straight from its `SKILL.md`.
4. If any external tools were selected: **install them now, or just show the commands?**
5. **Confirm** — a colored summary of exactly what will be created, then proceeds (or cancels).

Building a custom preset instead walks the full catalog (every `skills/` folder plus external
tools) and, at the end, asks where to **save it**: to `.claude-workspace/presets/<name>.yaml` in
the current project (commit it — your team gets it too after a clone), to
`~/.claude-workspace/presets/<name>.yaml` (personal, any project), or not at all. Either saved
location makes `claude-workspace init <name>` work non-interactively afterward, exactly like a
built-in preset (see [Custom presets](#custom-presets)).

**Keyboard:** arrow keys (or `j`/`k`) to move, `space` to toggle a checkbox item, digits `1`-`9` to
jump straight to (and, in checkboxes, toggle) one of the first nine items, `a`/`n` to select
all/none in a checkbox, `enter` to confirm, `esc`/`Ctrl+C` to cancel at any point without writing
anything.

The whole thing is zero-dependency — no `inquirer`, just Node's built-in `readline` plus plain ANSI
codes for the color/bold/dim styling (automatically off when output isn't a real terminal, or when
`NO_COLOR` is set — https://no-color.org). It needs a real TTY for the raw-mode keyboard input;
running it from a script, CI, or with stdin piped from a file falls back to a clear error telling
you to pass a preset name instead.

## Custom presets

Presets aren't limited to the five built-in ones. A custom preset — built via the wizard's "build
a custom preset" path, or written by hand in the same format as the built-in ones under
[`presets/`](presets/) — lives in one of two places:

- `.claude-workspace/presets/<name>.yaml` in the current project — commit it, and every teammate
  gets `claude-workspace init <name>` working right after they clone, no per-machine setup.
- `~/.claude-workspace/presets/<name>.yaml` — personal, available in any project on your machine,
  never shared.

Both are picked up by `init`/`list` exactly like a built-in preset. Built-in presets always take
priority on a name collision, so a custom preset can't accidentally shadow `learning`, `project`,
etc.; a project-local preset takes priority over a same-named global one.

## Adding a skill from any repository

```bash
claude-workspace add vercel-labs/agent-skills
claude-workspace add https://github.com/owner/repo/tree/main/skills/some-skill
```

`add` isn't limited to this package's own catalog — pass anything that looks like a URL, a git
remote, or `owner/repo` shorthand, and it's fetched via [`npx skills`](https://github.com/vercel-labs/skills)
(the same CLI this project already vendors `react-best-practices` from) straight into
`.claude/skills/`, then recorded in `workspace.yaml` under a `remote:` section so `sync`/`doctor`/
`remove` all know about it too. `sync` re-fetches it from the recorded source to pick up upstream
changes; `remove` deletes the local copy and stops tracking it (the skill's own repo is untouched).

## Managing an existing workspace

```bash
claude-workspace doctor            # is everything actually installed, and up to date?
claude-workspace add <name...>     # add one or more skills/tools to what's already installed
claude-workspace remove <name...>  # remove one or more skills/tools
claude-workspace update            # npm install -g claude-workspace@latest, then sync
```

`doctor` reports, for every skill declared in `.claude/workspace.yaml`: **ok** (installed and
matches this package's current version), **outdated** (installed but content has drifted — run
`sync`), or **missing**. It also prints the `claude-workspace` version this workspace was last
synced with vs. the one you're currently running (flagging a mismatch — useful in a team where not
everyone updates on the same day) and checks `CLAUDE.md` and the `.gitignore` block are present.

`add`/`remove` work like a single-shot version of `--with=` — they install (or uninstall) a
skill and update `workspace.yaml` to match, without re-running the whole `init` flow. Removing an
external tool only stops tracking it in `workspace.yaml`; it does not run the tool's own
uninstaller.

`update` is best-effort: it guesses which package manager manages the running install from its
real file path (pnpm/yarn/bun each have a recognizable global-install directory; anything else
defaults to npm) and runs that manager's global-update command. Under `npx`/`pnpm dlx` (detected
via npm's own `npm_command=exec` signal, plus a path-based check for pnpm/yarn) that step is
skipped entirely rather than leaving behind a global install nobody asked for — those runners
already fetch latest every time. Either way it finishes with a `sync`.

`CLAUDE.md` is a marker-delimited block (`<!-- claude-workspace:start/end -->`) rather than an
all-or-nothing file: `sync` refreshes what's inside the markers on every run, and anything you or a
teammate write outside them is never touched. `init --force` merges the block into an existing
`CLAUDE.md` that doesn't have one yet (rather than overwriting the file, which is what `--force`
used to do).

## Usage

```bash
claude-workspace init                                       (interactive wizard, needs a TTY)
claude-workspace init <preset> [targetDir] [--with-external] [--with=<name,...>] [--force]
claude-workspace list [--installed]
claude-workspace sync [targetDir]
claude-workspace add <name...>
claude-workspace remove <name...>
claude-workspace doctor [targetDir]
claude-workspace update [targetDir]
```

`list` prints every preset, skill and external tool this package knows about with a one-line
description each — the catalog's grown enough that it's easier to check this than to read the repo.
`list --installed` instead shows only what's actually in the current directory's
`.claude/workspace.yaml`.

`sync` re-copies whatever `.claude/workspace.yaml` declares from the currently installed
`claude-workspace` package — use it after upgrading the package to pick up skill content updates
without re-running `init`. It also refreshes the `claude-workspace` block in `CLAUDE.md` and
re-fetches any remote (URL-added) skills, but doesn't re-run external tools' installers (update
those with their own CLI, e.g. `codegraph upgrade`, `uipro update`).

`init --force` merges a fresh `claude-workspace` block into an existing `CLAUDE.md` that doesn't
have one yet, instead of leaving it untouched — see [Managing an existing
workspace](#managing-an-existing-workspace) for how the marker-delimited block works.

## Roadmap

Deliberately not built (yet):

- **Pinning a skill's exact version/hash in `workspace.yaml`.** Skills currently aren't versioned
  independently of the package itself; adding real per-skill pinning is a bigger design question
  (what does "pin" mean across a package update?) than fits alongside everything else here.
- **Monorepo support**, **post-init hooks**, **export/import of a whole workspace config.** No
  concrete need for these yet — happy to design them properly once there's a real use case driving
  the requirements, rather than guessing at the shape now.

## Project structure

```
scripts/workspace.js   CLI entrypoint — argv parsing and --help text only
scripts/lib/catalog.js   what this package ships: presets, skills, external tools, the YAML subset parser
scripts/lib/manifest.js  a project's installed workspace: workspace.yaml, the CLAUDE.md block, .gitignore
scripts/lib/remote.js    fetching a skill from an arbitrary repo ("add <url>")
scripts/lib/pm.js        package-manager / npx-dlx detection, used by "update"
scripts/lib/commands.js  the command implementations, built on the four above
scripts/lib/wizard.js    the interactive "init" wizard (only loaded when actually invoked)
scripts/lib/{i18n,prompt,colors}.js   wizard building blocks (translated strings, the arrow-key prompt engine, ANSI styling)
```

Each file re-exports through `scripts/workspace.js`, so `wizard.js` and the tests import
everything from that one familiar path regardless of which lib file actually owns it.

## Local development

Published on npm, so both the global install and `npx` forms shown in the Quick start above work
against the latest published version. To try an unreleased local change before publishing it:

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
extraction, `.gitignore` merging (idempotency and preserving existing content), `init`/`sync`/
`doctor`/`add`/`remove` end-to-end against real presets and skills in a temp directory, custom
presets saved to an isolated fake `~/.claude-workspace` (via a `CLAUDE_WORKSPACE_HOME` env override
so tests never touch your real home directory), i18n string lookups, and the wizard's non-
interactive data-building logic (which skills/format-variants get offered for which preset). The
wizard's actual raw-mode keyboard loop needs a real TTY and isn't something an automated test can
drive meaningfully, so that part is exercised manually rather than in CI. Runs on Node 18/20/22 on
every push and PR.

## License

[MIT](LICENSE)
