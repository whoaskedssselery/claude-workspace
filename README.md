🇬🇧 English · [🇷🇺 Русский](README.ru.md)

# Claude Workspace

[![CI](https://github.com/whoaskedssselery/claude-workspace/actions/workflows/ci.yml/badge.svg)](https://github.com/whoaskedssselery/claude-workspace/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

Sets up a project for Claude Code with one command: a curated set of skills, a workspace manifest,
and a `CLAUDE.md` entry point — picked to match *how* you're working, not what tech stack you use.

## Install & run

```bash
npm install -g claude-workspace    # or: pnpm add -g / yarn global add / bun add -g
claude-workspace init
```

`init` with no arguments launches an interactive wizard — pick a preset, pick extra skills, confirm.
That's the normal way to use this tool. Don't want a global install? Every package manager has a
run-without-installing form:

```bash
npx claude-workspace init          # npm
pnpm dlx claude-workspace init     # pnpm
yarn dlx claude-workspace init     # yarn
bunx claude-workspace init         # bun
```

If a plain `pnpm add -g claude-workspace` ever installs an unexpectedly old version, that's pnpm
serving a stale local metadata cache, not this package — pin it explicitly to force a fresh
resolve: `pnpm add -g claude-workspace@latest`.

Already know what you want (CI, automation, repeat setup)? Skip the wizard by passing a preset name:

```bash
claude-workspace init <preset>
```

### What gets created

- `.claude/skills/` — the preset's skills, applied automatically, no manual invocation needed
- `.claude/workspace.yaml` — a manifest of what's installed, used by `sync`/`doctor`/`add`/`remove`
- `CLAUDE.md` — a generated project entry point (left alone if one already exists)
- a small marked block in `.gitignore` for the one thing that's genuinely personal:
  `.claude/settings.local.json` and `.DS_Store`

Everything else (`.claude/skills/`, `.claude/workspace.yaml`, `CLAUDE.md`) is meant to be committed
and shared with the team — that's the point of the tool.

## Presets

A preset is a *way of working*, not a tech stack — none of them are React-specific or
backend-specific. Pick the preset that matches your situation, then bolt on the actual technology
with `--with=` (next section).

| Preset | What it does | Use it for |
|---|---|---|
| `learning` | [learning-guard](skills/core/learning-guard/SKILL.md) + [teacher](skills/core/teacher/SKILL.md): the human writes the code, Claude teaches and reviews instead of writing it for you. | Learning a technology. Add the tech with `--with=` — e.g. `--with=react-best-practices`. |
| `project` | Normal coding, no restrictions, plus [health-review](skills/core/health-review/SKILL.md) and [commit-discipline](skills/core/commit-discipline/SKILL.md). | Day-to-day work on a real project. Add `--with=spike` for a specific throwaway/exploratory task. |
| `assignment` | [assignment-mode](skills/core/assignment-mode/SKILL.md): Claude can write the solution, but verifies it works and stays inside the stated requirements. | Coursework, take-home tests, graded exercises. Add `--with=assignment-defend` if you'll have to explain the work to a grader. |
| `redesign` | Drops the learning restrictions, adds [react-best-practices](skills/frontend/react-best-practices/SKILL.md). | Visual/UI work. Add `--with=claude-design` for structured design-artifact work. |
| `oss-contribution` | Minimal, convention-following diffs. | Contributing to someone else's repository. |
| `debug` | [debug-mode](skills/core/debug-mode/SKILL.md): forces reproduce → isolate → diagnose → fix, in that order, instead of trial-and-error guessing. | Chasing a real bug, especially one that's already survived a session or two of guess-and-check. |

Every preset also includes [codegraph](skills/core/codegraph/SKILL.md) (fast code navigation) and
`commit-discipline`.

## Adding more with `--with=`

`--with=<name,name,...>` bolts anything else onto a preset: a tech-specific skill, a format
variant, or an external tool — comma-separated, any number at once.

```bash
claude-workspace init learning . --with=react-best-practices
claude-workspace init learning . --with=api-designer,security-reviewer,database-optimizer
claude-workspace init assignment . --with=assignment-defend
claude-workspace init project . --with=spike
```

Run `claude-workspace list` to see every preset, skill and external tool this package knows about,
with a one-line description — the full catalog is large enough that it's easier to check this than
to read the repo. A misspelled name suggests the closest match instead of failing silently:

```
! "databse-optimizer" isn't a known skill or external tool — skipped (did you mean "database-optimizer"?)
```

### External tools

A few names in the catalog (`impeccable`, `superpowers`, `taste`, `ui-ux-pro-max`) aren't skill
files — they're separate tools with their own installer or plugin marketplace. `init` never
installs these automatically; by default it only prints the install command. Add `--with=<name>`
to actually run that tool's installer, or `--with-external` to install every external tool the
chosen preset lists.

This is different from [`add <url>`](#adding-a-skill-from-any-repository) below: external tools are
full separate projects, while `add` fetches a portable skill file into `.claude/skills/`.

## Adding a skill from any repository

```bash
claude-workspace add vercel-labs/agent-skills
claude-workspace add https://github.com/owner/repo/tree/main/skills/some-skill
```

Not limited to this package's own catalog — pass a URL, a git remote, or `owner/repo` shorthand,
and it's fetched via [`npx skills`](https://github.com/vercel-labs/skills) straight into
`.claude/skills/`, then recorded in `workspace.yaml` so `sync`/`doctor`/`remove` know about it too.
Add `--global` to install into `~/.claude/skills/` instead — available in every project on the
machine, not tied to (or recorded in) any one project.

## Managing an existing workspace

```bash
claude-workspace doctor            # is everything installed and up to date?
claude-workspace add <name...>     # add skills/tools to what's already installed
claude-workspace remove <name...>  # remove skills/tools
claude-workspace sync              # re-copy skill content after a package update
claude-workspace update            # update the package itself, then sync
```

`doctor` reports, per installed skill: **ok**, **outdated** (content drifted, run `sync`), or
**missing** — plus whether the recorded toolkit version matches what's running, and whether
`CLAUDE.md`/`.gitignore` are set up correctly.

`sync` re-copies whatever `.claude/workspace.yaml` declares, from the currently installed package —
run it after upgrading `claude-workspace` to pick up skill content changes. It also refreshes
remote (`add <url>`) skills and the `CLAUDE.md` block, but doesn't touch external tools (update
those with their own CLI).

`CLAUDE.md`'s generated section lives inside a marked block
(`<!-- claude-workspace:start/end -->`) — `sync` only refreshes what's inside the markers, so
anything you write outside them is never touched.

## Full command reference

```bash
claude-workspace init                                        (interactive wizard, needs a TTY)
claude-workspace init <preset> [targetDir] [--with-external] [--with=<name,...>] [--force]
claude-workspace list [--installed | --global] [targetDir]
claude-workspace sync [targetDir]
claude-workspace add <name...> [--global] [--skill=<name>]
claude-workspace remove <name...> [--global]
claude-workspace doctor [targetDir]
claude-workspace update [targetDir]
claude-workspace version
```

`--force` (on `init`) merges the `claude-workspace` block into an existing `CLAUDE.md` that doesn't
have one yet, instead of leaving the file untouched.

`--skill=<name>` (on `add`) pins one skill out of a multi-skill remote repo — without it, a bare
`owner/repo` source installs every skill that repo has.

`claude-workspace --help` prints this same reference with full flag descriptions.

## Interactive wizard

Run `init` with no preset name in a real terminal:

```bash
claude-workspace init
```

It walks through the same decisions step by step: **language** (Russian/English, remembered after
the first run) → **preset** (built-in, a saved custom one, or build one now) → **additional
skills** (checkbox list: domain skills, relevant format variants, external tools, each with a hint
from its `SKILL.md`) → confirm and install.

**Keyboard:** arrow keys or `j`/`k` to move, `space` to toggle, digits `1`-`9` to jump to (and
toggle) an item, `a`/`n` to select all/none, `enter` to confirm, `esc`/`Ctrl+C` to cancel without
writing anything.

Needs a real TTY (raw-mode keyboard input) — running it from a script, CI, or with piped stdin
falls back to an error telling you to pass a preset name instead.

## Custom presets

Building a custom preset in the wizard asks where to save it:

- `.claude-workspace/presets/<name>.yaml` in the current project — commit it, and the whole team
  gets `claude-workspace init <name>` working after a clone, no per-machine setup.
- `~/.claude-workspace/presets/<name>.yaml` — personal, available in any project on your machine.

You can also write one by hand in the same format as the built-in presets under
[`presets/`](presets/). Either location works with `init`/`list` exactly like a built-in preset.
Built-in presets always win on a name collision; a project-local one wins over a same-named global
one.

## Project structure

```
scripts/workspace.js     CLI entrypoint — argv parsing and --help text only
scripts/lib/catalog.js   what this package ships: presets, skills, external tools, the YAML parser
scripts/lib/manifest.js  a project's installed workspace: workspace.yaml, CLAUDE.md, .gitignore
scripts/lib/remote.js    fetching a skill from an arbitrary repo (`add <url>`)
scripts/lib/pm.js        package-manager / npx-dlx detection, used by `update`
scripts/lib/commands.js  command implementations, built on the four files above
scripts/lib/wizard.js    the interactive `init` wizard (loaded only when actually invoked)
scripts/lib/i18n.js      translated strings for the wizard
scripts/lib/prompt.js    the arrow-key prompt engine
scripts/lib/colors.js    ANSI styling helpers
scripts/lib/log.js       shared console warn/log helpers

presets/    built-in preset definitions (.yaml)
skills/     the skill catalog, one directory per skill under skills/<domain>/<name>/SKILL.md
templates/  CLAUDE.md and workspace.yaml templates used when generating a project's files
test/       the test suite (Node's built-in test runner)
```

`scripts/workspace.js` re-exports everything from `scripts/lib/`, so `wizard.js` and the tests can
import it all from one familiar path regardless of which file actually owns it.

## Local development

```bash
npm pack                        # produces claude-workspace-<version>.tgz
cd /path/to/some/test-project
npx -p /absolute/path/to/claude-workspace-<version>.tgz claude-workspace init learning .
```

`npx <tarball-path> <args>` (without `-p`) has been observed to silently do nothing on Windows/Git
Bash. Use the `-p <tarball> claude-workspace <args>` form above, or run the script directly:
`node scripts/workspace.js init learning <targetDir>`.

## Testing

```bash
npm test
```

Zero dependencies, including for tests — runs on Node's built-in test runner (Node 18/20/22 on
every push and PR). Covers the YAML parser, typo suggestions, `.gitignore` merging, `init`/`sync`/
`doctor`/`add`/`remove` end-to-end against real presets in a temp directory, custom presets, and
the wizard's non-interactive logic. The wizard's raw-mode keyboard loop needs a real TTY and is
exercised manually rather than in CI.

## Attribution

This package's own code is MIT (see [LICENSE](LICENSE)), but several skills under `skills/` are
vendored from other MIT-licensed projects rather than written for this repo. Each keeps its
original license and authorship; nothing here relicenses or claims them as original work.

| Source | License | Skills |
|---|---|---|
| [vercel-labs/agent-skills](https://github.com/vercel-labs/agent-skills) | MIT | `react-best-practices` |
| [jiji262/claude-design-skill](https://github.com/jiji262/claude-design-skill) | MIT | `claude-design` |
| [Jeffallan/claude-skills](https://github.com/Jeffallan/claude-skills) | MIT | `api-designer`, `security-reviewer`, `database-optimizer`, `microservices-architect`, `websocket-engineer`, `react-expert`, `vue-expert`, `graphql-architect`, `fullstack-guardian`, `ml-pipeline`, `rag-architect`, `fine-tuning-expert`, `pandas-pro`, `spark-engineer`, `devops-engineer`, `kubernetes-specialist`, `terraform-engineer`, `cloud-architect`, `code-reviewer`, `debugging-wizard`, `test-master`, `feature-forge` |

Everything under `skills/core/` and `skills/formats/` (`learning-guard`, `teacher`, `health-review`,
`commit-discipline`, `assignment-mode`, `codegraph`, `assignment-defend`, `spike`) is original to
this project, not vendored.

External tools (`impeccable`, `superpowers`, `taste`, `ui-ux-pro-max` — see [External
tools](#external-tools)) aren't vendored at all: `init`/`add` only ever run their own installer, so
their code lives and stays in their own repositories.

## License

[MIT](LICENSE)
