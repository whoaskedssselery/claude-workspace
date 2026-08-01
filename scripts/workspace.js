#!/usr/bin/env node

import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const SKILLS_DIR = path.join(ROOT, 'skills');
const PRESETS_DIR = path.join(ROOT, 'presets');
const TEMPLATES_DIR = path.join(ROOT, 'templates');

function warn(message) {
	console.warn(`  ! ${message}`);
}

/**
 * Tools that are their own installable project (their own installer, MCP
 * server or plugin marketplace) rather than a static skill file we can copy.
 * Listing a name here in a preset's `skills:` lets `init` install it for
 * real via its own non-interactive CLI, instead of just linking to it.
 */
const EXTERNAL_TOOLS = {
	impeccable: {
		url: 'https://github.com/pbakaus/impeccable',
		manualInstall: 'npx impeccable install',
		steps: [{ command: 'npx', args: ['impeccable', 'install', '--providers=claude', '--scope=project'] }],
	},
	superpowers: {
		url: 'https://github.com/obra/superpowers',
		manualInstall:
			'/plugin marketplace add obra/superpowers-marketplace && /plugin install superpowers@superpowers-marketplace',
		steps: [
			{ command: 'claude', args: ['plugin', 'marketplace', 'add', 'obra/superpowers-marketplace'] },
			{ command: 'claude', args: ['plugin', 'install', 'superpowers@superpowers-marketplace', '--scope', 'project'] },
		],
	},
	taste: {
		url: 'https://github.com/Leonxlnx/taste-skill',
		manualInstall: 'npx skills add https://github.com/Leonxlnx/taste-skill --skill "design-taste-frontend"',
		steps: [
			{
				command: 'npx',
				args: ['skills', 'add', 'https://github.com/Leonxlnx/taste-skill', '--skill', 'design-taste-frontend'],
			},
		],
	},
	'ui-ux-pro-max': {
		url: 'https://github.com/nextlevelbuilder/ui-ux-pro-max-skill',
		manualInstall: 'npm install -g ui-ux-pro-max-cli && uipro init --ai claude',
		steps: [
			{ command: 'npm', args: ['install', '-g', 'ui-ux-pro-max-cli'] },
			{ command: 'uipro', args: ['init', '--ai', 'claude'] },
		],
	},
};

/**
 * Domain folders that hold vendored, portable skills (as opposed to
 * skills/core, which is copied into every preset regardless of domain).
 * `formats` holds optional behavioral variants (assignment-defend, spike)
 * that attach to a preset's baseline behavior via --with=, the same way a
 * tech skill does.
 */
const DOMAIN_DIRS = ['frontend', 'design', 'backend', 'formats'];

/**
 * Runs an external tool's own installer as a child process. Falls back to
 * printing the manual command if the installer isn't on PATH or fails
 * (network down, tool not installed, etc.) rather than aborting `init`.
 */
async function installExternalTool(name, tool, cwd) {
	console.log(`  installing "${name}" (${tool.url})`);
	for (const step of tool.steps) {
		console.log(`    $ ${step.command} ${step.args.join(' ')}`);
		try {
			await execFileAsync(step.command, step.args, { cwd, shell: true });
		} catch (error) {
			warn(`auto-install of "${name}" failed: ${error.message.split('\n')[0]}`);
			warn(`install it yourself: ${tool.manualInstall}`);
			return false;
		}
	}
	return true;
}

/**
 * Minimal parser for the flat "key: value" / "key:\n  - item" YAML subset
 * used by preset and template files, so the CLI has no external dependency.
 */
function parseSimpleYaml(text) {
	const result = {};
	let currentListKey = null;

	for (const rawLine of text.split(/\r?\n/)) {
		const line = rawLine.replace(/#.*$/, '').trimEnd();
		if (!line.trim()) continue;

		const listItemMatch = line.match(/^\s*-\s+(.+)$/);
		if (listItemMatch && currentListKey) {
			result[currentListKey].push(listItemMatch[1].trim());
			continue;
		}

		const keyValueMatch = line.match(/^(\w[\w-]*):\s*(.*)$/);
		if (keyValueMatch) {
			const [, key, value] = keyValueMatch;
			if (value === '' || value === '[]') {
				result[key] = [];
				currentListKey = value === '' ? key : null;
			} else {
				result[key] = value;
				currentListKey = null;
			}
			continue;
		}
	}

	return result;
}

function renderYamlList(items) {
	if (!items.length) return '  []';
	return items.map((item) => `  - ${item}`).join('\n');
}

function renderMarkdownList(items) {
	if (!items.length) return '_none installed_';
	return items.map((item) => `- \`${item}\``).join('\n');
}

async function loadPreset(name) {
	const file = path.join(PRESETS_DIR, `${name}.yaml`);
	if (!existsSync(file)) {
		const available = (await fs.readdir(PRESETS_DIR))
			.filter((f) => f.endsWith('.yaml'))
			.map((f) => f.replace(/\.yaml$/, ''));
		throw new Error(
			`Preset "${name}" not found. Available presets: ${available.join(', ') || '(none)'}`
		);
	}
	const text = await fs.readFile(file, 'utf8');
	return parseSimpleYaml(text);
}

/**
 * Skills live as a directory per skill (skills/<kind>/<name>/SKILL.md,
 * optionally with supporting files) and are installed the same way Claude
 * Code expects: .claude/skills/<name>/SKILL.md.
 */
async function copySkill(kind, name, destDir) {
	const src = path.join(SKILLS_DIR, kind, name);
	if (!existsSync(path.join(src, 'SKILL.md'))) return false;
	await fs.cp(src, path.join(destDir, name), { recursive: true });
	return true;
}

/**
 * A domain skill (as opposed to a core skill or an external tool) can live
 * under any of DOMAIN_DIRS — find and copy it from whichever one has it.
 */
async function copyDomainSkill(name, destDir) {
	for (const kind of DOMAIN_DIRS) {
		if (await copySkill(kind, name, destDir)) return true;
	}
	return false;
}

const GITIGNORE_MARKER_START = '# --- claude-workspace: local Claude Code state (do not remove this block) ---';
const GITIGNORE_MARKER_END = '# --- end claude-workspace ---';
const GITIGNORE_BLOCK = [
	GITIGNORE_MARKER_START,
	'.claude/settings.local.json',
	'.DS_Store',
	GITIGNORE_MARKER_END,
	'',
].join('\n');

/**
 * Adds a small, marked block to the project's .gitignore for state that is
 * genuinely personal/local (Claude Code's own settings.local.json, OS
 * cruft) — never for .claude/skills or CLAUDE.md, which are the whole point
 * of this tool and are meant to be committed and shared with the team.
 * Idempotent: skips if the marker is already present.
 */
async function ensureGitignore(targetDir) {
	const gitignorePath = path.join(targetDir, '.gitignore');
	const existing = existsSync(gitignorePath) ? await fs.readFile(gitignorePath, 'utf8') : '';
	if (existing.includes(GITIGNORE_MARKER_START)) return;

	const separator = existing && !existing.endsWith('\n') ? '\n\n' : existing ? '\n' : '';
	await fs.writeFile(gitignorePath, existing + separator + GITIGNORE_BLOCK, 'utf8');
}

async function init(presetName, targetDir, { withExternal = false, withNames = null } = {}) {
	const preset = await loadPreset(presetName);

	const claudeDir = path.join(targetDir, '.claude');
	const skillsDestDir = path.join(claudeDir, 'skills');
	await fs.mkdir(skillsDestDir, { recursive: true });

	console.log(`\nInstalling preset "${presetName}" into ${targetDir}\n`);

	const installedCore = [];
	for (const name of preset.core ?? []) {
		const ok = await copySkill('core', name, skillsDestDir);
		if (ok) installedCore.push(name);
		else warn(`core skill "${name}" not found in ${SKILLS_DIR}/core — skipped`);
	}

	// --with=<names> can name ANY known skill/tool, not just ones the preset
	// already lists — that's how a generic preset like `learning` picks up a
	// specific technology (e.g. --with=react-best-practices,api-designer) at
	// init time instead of needing a dedicated preset per stack.
	const requestedNames = [...new Set([...(preset.skills ?? []), ...(withNames ?? [])])];

	const installedSkills = [];
	const installedExternal = [];
	for (const name of requestedNames) {
		const external = EXTERNAL_TOOLS[name];
		if (external) {
			const wanted = withExternal || (withNames?.includes(name) ?? false);
			if (!wanted) {
				warn(`"${name}" is a separate tool, not installed automatically. Run with --with=${name} to install it, or by hand:`);
				warn(`    ${external.manualInstall}`);
				continue;
			}
			const ok = await installExternalTool(name, external, targetDir);
			if (ok) installedExternal.push(name);
			continue;
		}
		const ok = await copyDomainSkill(name, skillsDestDir);
		if (ok) installedSkills.push(name);
		else warn(`"${name}" isn't a known skill or external tool — skipped`);
	}

	const workspaceTemplate = await fs.readFile(
		path.join(TEMPLATES_DIR, 'workspace.template.yaml'),
		'utf8'
	);
	const workspaceYaml = workspaceTemplate
		.replace('{{PRESET}}', presetName)
		.replace('{{CORE_LIST}}', renderYamlList(installedCore))
		.replace('{{SKILLS_LIST}}', renderYamlList(installedSkills))
		.replace('{{EXTERNAL_LIST}}', renderYamlList(installedExternal));
	await fs.writeFile(path.join(claudeDir, 'workspace.yaml'), workspaceYaml, 'utf8');

	const claudeMdPath = path.join(targetDir, 'CLAUDE.md');
	if (existsSync(claudeMdPath)) {
		warn('CLAUDE.md already exists — left untouched. Merge manually from templates/CLAUDE.template.md if needed.');
	} else {
		const claudeTemplate = await fs.readFile(
			path.join(TEMPLATES_DIR, 'CLAUDE.template.md'),
			'utf8'
		);
		const claudeMd = claudeTemplate
			.replace('{{PRESET}}', presetName)
			.replace('{{CORE_LIST}}', renderMarkdownList(installedCore))
			.replace('{{SKILLS_LIST}}', renderMarkdownList([...installedSkills, ...installedExternal]));
		await fs.writeFile(claudeMdPath, claudeMd, 'utf8');
	}

	await ensureGitignore(targetDir);

	console.log(`\nDone.`);
	console.log(`  .claude/skills/  (${installedCore.length + installedSkills.length} skill file(s))`);
	console.log(`  external tools installed: ${installedExternal.length ? installedExternal.join(', ') : 'none'}`);
	console.log(`  .claude/workspace.yaml`);
	console.log(`  CLAUDE.md${existsSync(claudeMdPath) ? '' : ' (not written)'}`);
	console.log(`  .gitignore  (.claude/settings.local.json, .DS_Store)\n`);
}

const COMING_SOON = new Set(['sync', 'update', 'doctor', 'add', 'remove']);

function printHelp() {
	console.log(`
claude-workspace — prepare a project for Claude Code in one command

Usage:
  claude-workspace init <preset> [targetDir] [--with-external] [--with=<name,name,...>]

Commands:
  init <preset>   Install a preset's skills, workspace manifest and CLAUDE.md
                  (targetDir defaults to the current directory).

                  --with=<name,name,...>  also install these skills/tools,
                    from ANY domain (skills/{frontend,design,backend}) or
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

Coming soon:
  ${[...COMING_SOON].join(', ')}
`);
}

async function main() {
	const [, , command, ...args] = process.argv;

	if (!command || command === '--help' || command === '-h') {
		printHelp();
		return;
	}

	if (command === 'init') {
		const withExternal = args.includes('--with-external');
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
			console.error('Usage: claude-workspace init <preset> [targetDir] [--with-external] [--with=<name,name,...>]');
			process.exitCode = 1;
			return;
		}
		await init(presetName, path.resolve(targetDir), { withExternal, withNames });
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

main().catch((error) => {
	console.error(`\nError: ${error.message}`);
	process.exitCode = 1;
});
