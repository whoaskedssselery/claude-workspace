#!/usr/bin/env node

// CLI entrypoint: argv parsing and --help text only. Every command's actual
// behavior lives in scripts/lib/ — see:
//   lib/catalog.js    what this package ships (presets, skills, external tools)
//   lib/manifest.js   a project's installed workspace (.claude/workspace.yaml, CLAUDE.md, .gitignore)
//   lib/remote.js     fetching a skill from an arbitrary repo ("add <url>")
//   lib/pm.js         package-manager detection for "update"
//   lib/commands.js   the command implementations, built on the four above
//   lib/wizard.js     the interactive "init" wizard (only loaded when actually needed)
// This file re-exports the full set below so nothing else has to know that
// split happened — wizard.js and the test suite still import everything
// from here.

import path from 'node:path';
import { realpathSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { init, sync, list, doctor, hide, unhide, addSkills, removeSkills, updatePackage } from './lib/commands.js';
import { packageVersion, fetchLatestVersion } from './lib/catalog.js';

const COMING_SOON = new Set([]);

function printHelp() {
	console.log(`
claude-workspace — prepare a project for Claude Code in one command

Usage:
  claude-workspace init                                       (interactive wizard, needs a TTY)
  claude-workspace init <preset> [targetDir] [--with-external] [--with=<name,...>] [--force]
  claude-workspace list [--installed | --global] [targetDir]
  claude-workspace sync [targetDir]
  claude-workspace add <name...> [--global]       (current directory unless --global)
  claude-workspace remove <name...> [--global]    (current directory unless --global)
  claude-workspace doctor [targetDir]
  claude-workspace hide [targetDir]
  claude-workspace unhide [targetDir]
  claude-workspace update [targetDir]
  claude-workspace version

Commands:
  init            The primary way to use this tool: with no preset name, in
                  an interactive terminal, runs the step-by-step wizard —
                  pick (or build) a preset, pick additional skills, confirm,
                  done. With a preset name, runs non-interactively instead —
                  the scriptable/advanced path: install a preset's skills,
                  workspace manifest and CLAUDE.md directly from flags
                  (targetDir defaults to the current directory).

                  --with=<name,name,...>  also install these skills/tools,
                    from ANY domain (skills/{frontend,design,backend,...}) or
                    external tool (Impeccable, Superpowers, Taste,
                    UI UX Pro Max) — not just ones the preset already lists.
                    This is how a generic preset like "learning" picks up a
                    specific stack, e.g.:
                      init learning . --with=react-best-practices
                      init learning . --with=api-designer,security-reviewer

                  External tools a preset lists are NOT installed by default
                  — only their install command is printed. --with-external
                  installs all of them; --with=<name> installs just that one
                  (works for external tools too, not only domain skills).

                  --force  merge a fresh claude-workspace block into an
                    existing CLAUDE.md instead of leaving it untouched (only
                    needed the first time — once the block exists, "sync"
                    keeps it current automatically).

  list            Show every preset, skill and external tool this package
                  knows about, with a one-line description each.
                  --installed shows only what's actually in targetDir's
                  .claude/workspace.yaml instead of the full catalog.
                  --global shows skills installed with "add --global"
                  instead (in ~/.claude/skills/, not tied to any project).

  sync            Re-copy the skills declared in .claude/workspace.yaml from
                  the currently installed claude-workspace package (picks up
                  skill content updates), refresh remote (URL-added) skills,
                  and refresh the claude-workspace block in CLAUDE.md.
                  Doesn't re-install external tools. Doesn't touch anything
                  installed with --global — those aren't project state.

  add <name...>   Add one or more skills/external tools to an existing
                  workspace (installs it and records it in workspace.yaml).
                  A name that looks like a URL, git remote or "owner/repo"
                  is fetched from that repo via "npx skills" instead of this
                  package's own catalog — never written into this package's
                  own repo, only into the target project's .claude/skills/.
                  Requires "init" to have been run first.

                  --global  installs a URL/repo source into
                    ~/.claude/skills/ instead — available in every project
                    on the machine automatically from then on, no per-project
                    "add" needed, and not tied to (or recorded in) any one
                    project's workspace.yaml. Only for remote sources — this
                    package's own catalog skills are already available
                    everywhere without installing them anywhere.

                  --skill=<name>  pin one skill out of a multi-skill remote
                    repo. Without it, a bare "owner/repo" source installs
                    EVERY skill the repo has (this runs non-interactively,
                    so there's no prompt to pick just one) — pass this, or a
                    direct .../tree/main/skills/<name> URL, to avoid that.

  remove <name...> Remove one or more skills/tools/remote entries from an
                  existing workspace (deletes the installed skill and drops
                  it from workspace.yaml). For an external tool this only
                  stops tracking it — the tool itself isn't uninstalled.
                  --global removes a skill installed with "add --global".

  doctor          Reports whether declared skills are actually installed,
                  whether their content matches this package's current
                  version (or has drifted — run sync), whether the recorded
                  toolkit version matches what's running, and whether
                  CLAUDE.md / the .gitignore block are in place.

  hide            Temporarily moves everything claude-workspace put into the
                  project — .claude/skills/, .claude/workspace.yaml, the
                  generated CLAUDE.md block, each currently-installed
                  skill/tool's own declared extra paths (see "creates:" in
                  catalog.js / a skill's own SKILL.md frontmatter), and
                  anything listed in .claude-workspace/hide.yaml — into a
                  stash OUTSIDE the project (~/.claude-workspace/hidden/),
                  so nothing is left in the project tree and it looks like
                  it did before "init" ever ran. Doesn't touch .gitignore.

                  .claude-workspace/hide.yaml lets you list extra files or
                  folders (relative to the project root) to sweep up too —
                  anything hide has no other way to know about, e.g.:
                    paths:
                      - .env.local
                      - notes/
                  Optional; committed like a custom preset, so the whole
                  team gets the same hide behavior after a clone.

  unhide          Reverses "hide": restores the exact pre-hide snapshot and
                  removes the stash. Not a merge — whatever changed while
                  hidden to the hidden files themselves is discarded.

  update          Best-effort "npm install -g claude-workspace@latest",
                  then "sync". Safe under npx/pnpm dlx (detected and
                  skipped — nothing global to update there).

  version         Print the installed claude-workspace version. Also checks
                  npm's "latest" tag (best-effort, ~2.5s timeout, never
                  fails or hangs the command) and prints an update notice
                  with the command to run if a newer one exists.

Custom presets: the init wizard can build one on the fly and save it either
to .claude-workspace/presets/<name>.yaml in the current project (commit it —
your team gets it too after a clone) or to
~/.claude-workspace/presets/<name>.yaml (personal, any project). Either way,
"claude-workspace init <name>" then works non-interactively too, same as any
built-in preset.
`);
}

function targetDirFrom(args) {
	const [dir] = args.filter((arg) => !arg.startsWith('--'));
	return path.resolve(dir ?? process.cwd());
}

async function main() {
	const [, , command, ...args] = process.argv;

	if (!command || command === '--help' || command === '-h') {
		printHelp();
		return;
	}

	if (command === 'version' || command === '--version' || command === '-v') {
		const current = await packageVersion();
		console.log(current);
		const latest = await fetchLatestVersion();
		if (latest && latest !== current) {
			console.log(`\nA newer version is available: ${latest} (you have ${current}).`);
			console.log('Update with: claude-workspace update');
		}
		return;
	}

	if (command === 'list') {
		const installedOnly = args.includes('--installed');
		const global = args.includes('--global') || args.includes('-g');
		await list({ installedOnly, global, targetDir: targetDirFrom(args) });
		return;
	}

	if (command === 'init') {
		const withExternal = args.includes('--with-external');
		const force = args.includes('--force');
		const withArg = args.find((arg) => arg.startsWith('--with='));
		const withNames = withArg
			? withArg
					.slice('--with='.length)
					.split(',')
					.map((s) => s.trim())
					.filter(Boolean)
			: null;
		const positional = args.filter((arg) => !arg.startsWith('--'));
		const [presetName, targetDir = process.cwd()] = positional;

		if (!presetName) {
			if (!process.stdin.isTTY) {
				console.error(
					'Usage: claude-workspace init <preset> [targetDir] [--with-external] [--with=<name,name,...>] [--force]\n' +
						'(No preset given and no interactive terminal — the wizard needs a TTY. Pass a preset name instead.)'
				);
				process.exitCode = 1;
				return;
			}
			const { runWizard } = await import('./lib/wizard.js');
			await runWizard(process.cwd());
			return;
		}

		await init(presetName, path.resolve(targetDir), { withExternal, withNames, force });
		return;
	}

	if (command === 'sync') {
		await sync(targetDirFrom(args));
		return;
	}

	if (command === 'add') {
		const global = args.includes('--global') || args.includes('-g');
		const skillArg = args.find((arg) => arg.startsWith('--skill='));
		const skill = skillArg ? skillArg.slice('--skill='.length) : null;
		const names = args.filter((arg) => !arg.startsWith('-'));
		if (!names.length) {
			console.error(
				'Usage: claude-workspace add <name...> [--global] [--skill=<name>] (operates on the current directory unless --global)'
			);
			process.exitCode = 1;
			return;
		}
		await addSkills(process.cwd(), names, { global, skill });
		return;
	}

	if (command === 'remove') {
		const global = args.includes('--global') || args.includes('-g');
		const names = args.filter((arg) => !arg.startsWith('-'));
		if (!names.length) {
			console.error(
				'Usage: claude-workspace remove <name...> [--global] (operates on the current directory unless --global)'
			);
			process.exitCode = 1;
			return;
		}
		await removeSkills(process.cwd(), names, { global });
		return;
	}

	if (command === 'doctor') {
		await doctor(targetDirFrom(args));
		return;
	}

	if (command === 'hide') {
		await hide(targetDirFrom(args));
		return;
	}

	if (command === 'unhide') {
		await unhide(targetDirFrom(args));
		return;
	}

	if (command === 'update') {
		await updatePackage(targetDirFrom(args));
		return;
	}

	if (COMING_SOON.has(command)) {
		console.log(`"${command}" is not implemented yet.`);
		return;
	}

	console.error(`Unknown command "${command}".`);
	printHelp();
	process.exitCode = 1;
}

// Only run the CLI when this file is the actual entrypoint (`node
// scripts/workspace.js ...` or the `claude-workspace` bin) — not when it's
// imported by the test suite, which needs the functions below without
// triggering argv parsing or process.exit.
//
// process.argv[1] is compared against the *resolved* real path, not the raw
// one: Node resolves symlinks when computing import.meta.url for the entry
// module (preserveSymlinks defaults to false), but never touches argv[1]
// itself. Package managers that install global bins as symlinks into a
// content-addressable store (pnpm's is the common case) make argv[1] and
// import.meta.url differ even though this file genuinely is the entrypoint
// — without resolving here, the CLI silently does nothing under pnpm.
function isEntryPoint() {
	if (!process.argv[1]) return false;
	try {
		return import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href;
	} catch {
		return false;
	}
}

if (isEntryPoint()) {
	main().catch((error) => {
		console.error(`\nError: ${error.message}`);
		process.exitCode = 1;
	});
}

// Re-exported so wizard.js and the test suite can import everything from
// this one familiar path — see the file-header comment for where each of
// these actually lives.
export {
	parseSimpleYaml,
	renderYamlList,
	renderMarkdownList,
	editDistance,
	suggestName,
	isSafeName,
	extractDescription,
	extractCreates,
	resolveCreatedPaths,
	truncate,
	copySkill,
	loadPreset,
	listPresetNames,
	projectPresetsDir,
	projectHideConfigPath,
	describeSkill,
	listKnownNames,
	packageVersion,
	fetchLatestVersion,
	SKILLS_DIR,
	PRESETS_DIR,
	TEMPLATES_DIR,
	DOMAIN_DIRS,
	EXTERNAL_TOOLS,
	REMOTE_SKILLS,
	namesInDomain,
} from './lib/catalog.js';

export {
	ensureGitignore,
	requireWorkspace,
	writeWorkspaceManifest,
	writeClaudeMd,
	encodeRemoteList,
	decodeRemoteList,
	checkSkillStatus,
	hiddenDir,
	hideWorkspace,
	unhideWorkspace,
	readHideConfig,
	GITIGNORE_MARKER_START,
	GITIGNORE_MARKER_END,
} from './lib/manifest.js';

export {
	looksLikeSkillSource,
	normalizeSkillSource,
	fetchRemoteSkill,
	listGlobalSkills,
	recordGlobalSkill,
	forgetGlobalSkill,
	GLOBAL_CLAUDE_SKILLS_DIR,
} from './lib/remote.js';

export { detectPackageManager, isEphemeralRun } from './lib/pm.js';

export { init, installPreset, sync, list, doctor, hide, unhide, addSkills, removeSkills, updatePackage } from './lib/commands.js';
