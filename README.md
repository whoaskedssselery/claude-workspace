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

## Skill layout

- `skills/core/` — behavioral skills plus **CodeGraph**. Copied into every preset regardless of
  domain. CodeGraph moved here from `frontend/` because it's a general code-navigation tool, useful
  well beyond React — keeping it core avoids re-explaining/re-invoking it per domain and saves
  tokens: [learning-guard](skills/core/learning-guard/SKILL.md), [teacher](skills/core/teacher/SKILL.md),
  [health-review](skills/core/health-review/SKILL.md), [commit-discipline](skills/core/commit-discipline/SKILL.md),
  [codegraph](skills/core/codegraph/SKILL.md) (usage guide for the
  [CodeGraph](https://github.com/colbymchenry/codegraph) MCP server — requires installing CodeGraph
  itself separately, `codegraph install`).
- `skills/frontend/` — [react-best-practices](skills/frontend/react-best-practices/SKILL.md),
  vendored as-is from [vercel-labs/agent-skills](https://github.com/vercel-labs/agent-skills) (MIT).
- `skills/design/` — [claude-design](skills/design/claude-design/SKILL.md), vendored from
  [jiji262/claude-design-skill](https://github.com/jiji262/claude-design-skill) (MIT): turns Claude
  into an HTML-artifact designer (decks, landing pages, prototypes).
- `skills/backend/` — [api-designer](skills/backend/api-designer/SKILL.md) and
  [security-reviewer](skills/backend/security-reviewer/SKILL.md), vendored from
  [Jeffallan/claude-skills](https://github.com/Jeffallan/claude-skills) (MIT).

Each of the above is a static, portable `SKILL.md` (+ optional reference files) with no installer of
its own, so `init` always copies it directly — no flag needed.

## External tools

Some named skills are full tools with their own installer or plugin marketplace, not a portable
file — vendoring a copy would drift from upstream immediately. `init` never pulls these down by
default; it only prints the install command, since not every project needs them:

| Name            | Source                                                                          | Install command |
|------------------|---------------------------------------------------------------------------------|------------------|
| `impeccable`     | [pbakaus/impeccable](https://github.com/pbakaus/impeccable)                     | `npx impeccable install --providers=claude --scope=project` |
| `superpowers`    | [obra/superpowers](https://github.com/obra/superpowers)                         | `claude plugin marketplace add obra/superpowers-marketplace` then `claude plugin install superpowers@superpowers-marketplace --scope project` |
| `taste`          | [Leonxlnx/taste-skill](https://github.com/Leonxlnx/taste-skill)                 | `npx skills add https://github.com/Leonxlnx/taste-skill --skill "design-taste-frontend"` |
| `ui-ux-pro-max`  | [nextlevelbuilder/ui-ux-pro-max-skill](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill) | `npm install -g ui-ux-pro-max-cli` then `uipro init --ai claude` |

Pick what you actually want installed:

```bash
npx claude-workspace init redesign . --with=taste            # just this one
npx claude-workspace init redesign . --with=taste,impeccable  # a specific subset
npx claude-workspace init redesign . --with-external          # everything the preset lists
```

If an installer isn't reachable even then (no network, `claude`/`npx` not on PATH), `init` doesn't
fail — it prints the manual command instead and keeps going.

## Presets

- **react-learning** — learning-first React/TypeScript: full core, `react-best-practices`;
  `impeccable` and `superpowers` listed as external.
- **redesign** — for projects that need visual work done, not a learning exercise, so it drops
  `learning-guard`/`teacher` and keeps `health-review` + `commit-discipline` + `codegraph`. Skills:
  `claude-design`, `react-best-practices`; external: `taste`, `ui-ux-pro-max`, `impeccable`.
- **backend-learning** — same learning philosophy as react-learning, aimed at API/backend work.
  Full core; skills: `api-designer`, `security-reviewer`.

## Usage

```bash
npx claude-workspace init <preset> [targetDir] [--with-external] [--with=<name,name,...>]
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