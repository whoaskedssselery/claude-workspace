#!/usr/bin/env node

import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import { GLOBAL_PRESETS_DIR } from './lib/i18n.js';

const execFileAsync = promisify(execFile);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
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
 * tech skill does. `general` holds cross-cutting skills (code review,
 * debugging, testing strategy) that aren't tied to one domain.
 */
const DOMAIN_DIRS = [
	'frontend',
	'design',
	'backend',
	'fullstack',
	'ml',
	'devops',
	'general',
	'planning',
	'formats',
];

/**
 * Every skill/tool name init or sync can resolve, across all domains plus
 * external tools — used to validate --with= and suggest a fix for typos.
 */
async function listKnownNames() {
	const names = [];
	for (const kind of DOMAIN_DIRS) {
		const dir = path.join(SKILLS_DIR, kind);
		if (!existsSync(dir)) continue;
		for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
			if (entry.isDirectory()) names.push(entry.name);
		}
	}
	names.push(...Object.keys(EXTERNAL_TOOLS));
	return names;
}

/** Levenshtein edit distance, for suggesting a fix when --with= has a typo. */
function editDistance(a, b) {
	const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
	for (let j = 0; j <= b.length; j++) dp[0][j] = j;
	for (let i = 1; i <= a.length; i++) {
		for (let j = 1; j <= b.length; j++) {
			dp[i][j] =
				a[i - 1] === b[j - 1]
					? dp[i - 1][j - 1]
					: 1 + Math.min(dp[i - 1][j - 1], dp[i - 1][j], dp[i][j - 1]);
		}
	}
	return dp[a.length][b.length];
}

function suggestName(name, knownNames) {
	let best = null;
	let bestDistance = Infinity;
	for (const candidate of knownNames) {
		const distance = editDistance(name, candidate);
		if (distance < bestDistance) {
			bestDistance = distance;
			best = candidate;
		}
	}
	// Only suggest when the typo is plausibly small relative to the name's length.
	return best && bestDistance <= Math.max(2, Math.ceil(name.length / 3)) ? best : null;
}

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

async function listPresetNames(dir) {
	if (!existsSync(dir)) return [];
	return (await fs.readdir(dir)).filter((f) => f.endsWith('.yaml')).map((f) => f.replace(/\.yaml$/, ''));
}

/**
 * Built-in presets (PRESETS_DIR) take priority; falls back to custom
 * presets a user saved globally via the init wizard
 * (~/.claude-workspace/presets/), so `init <custom-name>` keeps working
 * non-interactively after it's been created once.
 */
async function loadPreset(name) {
	const builtIn = path.join(PRESETS_DIR, `${name}.yaml`);
	const custom = path.join(GLOBAL_PRESETS_DIR, `${name}.yaml`);
	const file = existsSync(builtIn) ? builtIn : existsSync(custom) ? custom : null;
	if (!file) {
		const available = [...(await listPresetNames(PRESETS_DIR)), ...(await listPresetNames(GLOBAL_PRESETS_DIR))];
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

async function writeWorkspaceManifest(targetDir, presetName, core, skills, external) {
	const claudeDir = path.join(targetDir, '.claude');
	await fs.mkdir(claudeDir, { recursive: true });
	const workspaceTemplate = await fs.readFile(path.join(TEMPLATES_DIR, 'workspace.template.yaml'), 'utf8');
	const workspaceYaml = workspaceTemplate
		.replace('{{PRESET}}', presetName)
		.replace('{{CORE_LIST}}', renderYamlList(core))
		.replace('{{SKILLS_LIST}}', renderYamlList(skills))
		.replace('{{EXTERNAL_LIST}}', renderYamlList(external));
	await fs.writeFile(path.join(claudeDir, 'workspace.yaml'), workspaceYaml, 'utf8');
}

/**
 * Does the actual install work for an already-resolved preset object —
 * shared by `init` (which loads the preset by name) and the interactive
 * wizard (which may have just built one on the fly and not saved it
 * anywhere yet, so there's no name to load).
 */
async function installPreset(preset, presetName, targetDir, { withExternal = false, withNames = null, force = false } = {}) {
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
		if (ok) {
			installedSkills.push(name);
			continue;
		}
		const suggestion = suggestName(name, await listKnownNames());
		warn(
			`"${name}" isn't a known skill or external tool — skipped` +
				(suggestion ? ` (did you mean "${suggestion}"?)` : '')
		);
	}

	await writeWorkspaceManifest(targetDir, presetName, installedCore, installedSkills, installedExternal);

	const claudeMdPath = path.join(targetDir, 'CLAUDE.md');
	if (existsSync(claudeMdPath) && !force) {
		warn('CLAUDE.md already exists — left untouched. Pass --force to overwrite, or merge manually from templates/CLAUDE.template.md.');
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

/** Loads a preset by name (built-in or saved globally) and installs it. */
async function init(presetName, targetDir, opts = {}) {
	const preset = await loadPreset(presetName);
	return installPreset(preset, presetName, targetDir, opts);
}

/**
 * Re-copies whatever skills/core+skills/workspace.yaml declares from the
 * currently installed claude-workspace package — picks up skill content
 * updates without re-running init. Doesn't touch CLAUDE.md (may have been
 * hand-edited) or re-run external tools' installers (those update
 * themselves; see each tool's own update command).
 */
async function sync(targetDir) {
	const workspacePath = path.join(targetDir, '.claude', 'workspace.yaml');
	if (!existsSync(workspacePath)) {
		throw new Error(`No .claude/workspace.yaml found in ${targetDir} — run "init" first.`);
	}
	const manifest = parseSimpleYaml(await fs.readFile(workspacePath, 'utf8'));
	const skillsDestDir = path.join(targetDir, '.claude', 'skills');
	await fs.mkdir(skillsDestDir, { recursive: true });

	console.log(`\nSyncing skills declared in ${workspacePath}\n`);

	let updated = 0;
	for (const name of manifest.core ?? []) {
		if (await copySkill('core', name, skillsDestDir)) updated++;
		else warn(`core skill "${name}" not found in ${SKILLS_DIR}/core — skipped`);
	}
	for (const name of manifest.skills ?? []) {
		if (await copyDomainSkill(name, skillsDestDir)) updated++;
		else warn(`"${name}" isn't a known skill — skipped (external tools aren't refreshed by sync)`);
	}

	await ensureGitignore(targetDir);

	console.log(`\nDone. Refreshed ${updated} skill(s).`);
	const external = manifest.external ?? [];
	console.log(
		external.length
			? `External tools (${external.join(', ')}) were not touched — update each with its own CLI.`
			: `No external tools recorded — nothing else to update.`
	);
	console.log('');
}

function requireWorkspace(targetDir) {
	const workspacePath = path.join(targetDir, '.claude', 'workspace.yaml');
	if (!existsSync(workspacePath)) {
		throw new Error(`No .claude/workspace.yaml found in ${targetDir} — run "init" first.`);
	}
	return workspacePath;
}

/** Finds which domain folder (if any) currently has this skill, for doctor's staleness check. */
function findDomainSkillSource(name) {
	for (const kind of DOMAIN_DIRS) {
		const dir = path.join(SKILLS_DIR, kind, name);
		if (existsSync(path.join(dir, 'SKILL.md'))) return dir;
	}
	return null;
}

/**
 * Compares an installed skill's SKILL.md against the version currently in
 * this package. Only checks SKILL.md itself (not reference files) — good
 * enough signal for "this has changed upstream, run sync" without a full
 * recursive diff.
 */
async function checkSkillStatus(kind, name, installedSkillsDir) {
	const installedSkillMd = path.join(installedSkillsDir, name, 'SKILL.md');
	if (!existsSync(installedSkillMd)) return 'missing';

	const sourceDir = kind === 'core' ? path.join(SKILLS_DIR, 'core', name) : findDomainSkillSource(name);
	if (!sourceDir) return 'no longer in this package';

	const [installedContent, sourceContent] = await Promise.all([
		fs.readFile(installedSkillMd, 'utf8'),
		fs.readFile(path.join(sourceDir, 'SKILL.md'), 'utf8'),
	]);
	return installedContent === sourceContent ? 'ok' : 'outdated — run sync';
}

/**
 * Reports on the health of an existing workspace: whether declared skills
 * are actually installed, whether their content matches what this version
 * of the package ships (vs. having drifted, e.g. after a package update),
 * and whether CLAUDE.md / the .gitignore block are in place.
 */
async function doctor(targetDir) {
	const workspacePath = requireWorkspace(targetDir);
	const manifest = parseSimpleYaml(await fs.readFile(workspacePath, 'utf8'));
	const installedSkillsDir = path.join(targetDir, '.claude', 'skills');

	console.log(`\nChecking workspace in ${targetDir}`);
	console.log(`Preset: ${manifest.preset ?? '(unknown)'}\n`);

	for (const name of manifest.core ?? []) {
		console.log(`  core      ${name.padEnd(24)} ${await checkSkillStatus('core', name, installedSkillsDir)}`);
	}
	for (const name of manifest.skills ?? []) {
		console.log(`  skill     ${name.padEnd(24)} ${await checkSkillStatus('domain', name, installedSkillsDir)}`);
	}
	for (const name of manifest.external ?? []) {
		console.log(`  external  ${name.padEnd(24)} declared — check with its own status/update command`);
	}

	const claudeMdOk = existsSync(path.join(targetDir, 'CLAUDE.md'));
	console.log(`\n  CLAUDE.md          ${claudeMdOk ? 'present' : 'MISSING'}`);

	const gitignorePath = path.join(targetDir, '.gitignore');
	const gitignoreOk =
		existsSync(gitignorePath) && (await fs.readFile(gitignorePath, 'utf8')).includes(GITIGNORE_MARKER_START);
	console.log(`  .gitignore block   ${gitignoreOk ? 'present' : 'MISSING — run sync'}`);

	console.log('\nRun "claude-workspace sync" to refresh anything marked outdated or missing.\n');
}

/**
 * Adds one or more skills/external tools to an existing workspace: copies
 * the skill (or runs the external tool's installer) and records it in
 * workspace.yaml. Names already present in the workspace are skipped.
 */
async function addSkills(targetDir, names) {
	const workspacePath = requireWorkspace(targetDir);
	const manifest = parseSimpleYaml(await fs.readFile(workspacePath, 'utf8'));
	const core = manifest.core ?? [];
	const skills = new Set(manifest.skills ?? []);
	const external = new Set(manifest.external ?? []);
	const skillsDestDir = path.join(targetDir, '.claude', 'skills');
	await fs.mkdir(skillsDestDir, { recursive: true });

	for (const name of names) {
		if (core.includes(name) || skills.has(name) || external.has(name)) {
			warn(`"${name}" is already part of this workspace — skipped`);
			continue;
		}
		const tool = EXTERNAL_TOOLS[name];
		if (tool) {
			const ok = await installExternalTool(name, tool, targetDir);
			if (ok) external.add(name);
			continue;
		}
		const ok = await copyDomainSkill(name, skillsDestDir);
		if (ok) {
			skills.add(name);
			continue;
		}
		const suggestion = suggestName(name, await listKnownNames());
		warn(`"${name}" isn't a known skill or external tool — skipped` + (suggestion ? ` (did you mean "${suggestion}"?)` : ''));
	}

	await writeWorkspaceManifest(targetDir, manifest.preset ?? 'custom', core, [...skills], [...external]);
	await ensureGitignore(targetDir);
	console.log(`\nAdded. .claude/skills/ now has ${core.length + skills.size} skill(s); external: ${[...external].join(', ') || 'none'}.\n`);
}

/**
 * Removes one or more skills/tools from an existing workspace: deletes the
 * installed skill directory and drops it from workspace.yaml. For an
 * external tool, this only stops tracking it here — it does not uninstall
 * the tool itself (use its own uninstall command for that).
 */
async function removeSkills(targetDir, names) {
	const workspacePath = requireWorkspace(targetDir);
	const manifest = parseSimpleYaml(await fs.readFile(workspacePath, 'utf8'));
	let core = manifest.core ?? [];
	let skills = manifest.skills ?? [];
	let external = manifest.external ?? [];
	const skillsDestDir = path.join(targetDir, '.claude', 'skills');

	for (const name of names) {
		const wasCore = core.includes(name);
		const wasSkill = skills.includes(name);
		const wasExternal = external.includes(name);
		if (!wasCore && !wasSkill && !wasExternal) {
			warn(`"${name}" isn't part of this workspace — skipped`);
			continue;
		}
		core = core.filter((n) => n !== name);
		skills = skills.filter((n) => n !== name);
		external = external.filter((n) => n !== name);

		const dir = path.join(skillsDestDir, name);
		if (existsSync(dir)) await fs.rm(dir, { recursive: true, force: true });
		if (wasExternal) warn(`"${name}" is no longer tracked, but the tool itself was NOT uninstalled — use its own uninstall command.`);
	}

	await writeWorkspaceManifest(targetDir, manifest.preset ?? 'custom', core, skills, external);
	console.log(`\nRemoved. Remaining: ${core.length + skills.length} skill(s); external: ${external.join(', ') || 'none'}.\n`);
}

/**
 * Best-effort `npm install -g claude-workspace@latest`, then `sync`. The
 * global update step is skipped gracefully (not treated as an error) when
 * it fails — e.g. the CLI was run via npx, which already always uses the
 * latest version, so there's nothing global to update.
 */
/**
 * Update commands for every package manager that can install an npm-
 * registry package globally. `npx`/`dlx`/`bunx` don't need updating (they
 * always fetch latest), so only the "install globally" managers matter here.
 */
const PACKAGE_MANAGER_UPDATE_COMMANDS = {
	npm: { command: 'npm', args: ['install', '-g', 'claude-workspace@latest'] },
	pnpm: { command: 'pnpm', args: ['add', '-g', 'claude-workspace@latest'] },
	yarn: { command: 'yarn', args: ['global', 'add', 'claude-workspace@latest'] },
	bun: { command: 'bun', args: ['add', '-g', 'claude-workspace@latest'] },
};

/**
 * Best-effort guess at which package manager manages a globally-installed
 * binary, from the real (symlink-resolved) path of the running script —
 * each manager's global install directory has a recognizable fragment in
 * it. Falls back to npm, since Node always ships it and it's the most
 * common case.
 */
function detectPackageManager(realScriptPath) {
	const normalized = realScriptPath.replace(/\\/g, '/').toLowerCase();
	if (normalized.includes('/pnpm/')) return 'pnpm';
	if (normalized.includes('/.bun/')) return 'bun';
	if (normalized.includes('/yarn/')) return 'yarn';
	return 'npm';
}

async function updatePackage(targetDir) {
	let pm = 'npm';
	try {
		pm = detectPackageManager(await fs.realpath(process.argv[1] ?? __filename));
	} catch {
		// process.argv[1] not resolvable (e.g. run from a REPL) — default to npm.
	}
	const { command, args } = PACKAGE_MANAGER_UPDATE_COMMANDS[pm];

	console.log(`\nUpdating the global claude-workspace package (${command} ${args.join(' ')})...`);
	try {
		await execFileAsync(command, args, { shell: true });
		console.log('Package updated.');
	} catch (error) {
		warn(`Could not update the global package: ${error.message.split('\n')[0]}`);
		warn('If you run this via npx/pnpm dlx/bunx, that already always uses the latest version — nothing to do here.');
		warn(`If you installed globally, update it yourself: ${command} ${args.join(' ')}`);
	}
	await sync(targetDir);
}

/**
 * Pulls the `description:` field out of a SKILL.md's YAML frontmatter,
 * handling both `description: text` and the folded block style
 * (`description: >-` followed by indented continuation lines) that the
 * vendored skills use. No YAML dependency — just enough to display a
 * one-line summary in `list`.
 */
function extractDescription(skillMd) {
	const lines = skillMd.split(/\r?\n/);
	if (lines[0]?.trim() !== '---') return '';
	const end = lines.indexOf('---', 1);
	const frontmatter = lines.slice(1, end === -1 ? undefined : end);

	const startIdx = frontmatter.findIndex((line) => /^description:/.test(line));
	if (startIdx === -1) return '';

	const firstLine = frontmatter[startIdx].replace(/^description:\s*/, '').trim();
	if (firstLine && firstLine !== '>-' && firstLine !== '|' && firstLine !== '>') {
		return firstLine.replace(/^["']|["']$/g, '');
	}

	const continuation = [];
	for (let i = startIdx + 1; i < frontmatter.length; i++) {
		if (!/^\s/.test(frontmatter[i])) break;
		continuation.push(frontmatter[i].trim());
	}
	return continuation.join(' ');
}

function truncate(text, max = 100) {
	return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

async function describeSkill(kind, name) {
	const file = path.join(SKILLS_DIR, kind, name, 'SKILL.md');
	if (!existsSync(file)) return '';
	return truncate(extractDescription(await fs.readFile(file, 'utf8')));
}

/** Shows only what's actually installed in targetDir's workspace.yaml, not the full catalog. */
async function listInstalled(targetDir) {
	const workspacePath = requireWorkspace(targetDir);
	const manifest = parseSimpleYaml(await fs.readFile(workspacePath, 'utf8'));
	console.log(`\nInstalled in ${targetDir} (preset: ${manifest.preset ?? 'unknown'}):\n`);
	console.log(`  core:      ${(manifest.core ?? []).join(', ') || '(none)'}`);
	console.log(`  skills:    ${(manifest.skills ?? []).join(', ') || '(none)'}`);
	console.log(`  external:  ${(manifest.external ?? []).join(', ') || '(none)'}`);
	console.log('');
}

async function list({ installedOnly = false, targetDir = process.cwd() } = {}) {
	if (installedOnly) {
		return listInstalled(targetDir);
	}

	const presetFiles = (await listPresetNames(PRESETS_DIR)).map((name) => ({ name, custom: false }));
	const customPresetFiles = (await listPresetNames(GLOBAL_PRESETS_DIR)).map((name) => ({ name, custom: true }));

	console.log('\nPresets (claude-workspace init <preset>):\n');
	for (const { name, custom } of [...presetFiles, ...customPresetFiles].sort((a, b) => a.name.localeCompare(b.name))) {
		const preset = await loadPreset(name);
		const parts = [`core: ${(preset.core ?? []).join(', ') || '(none)'}`];
		if (preset.skills?.length) parts.push(`skills: ${preset.skills.join(', ')}`);
		console.log(`  ${name.padEnd(18)} ${parts.join('  |  ')}${custom ? '  (custom)' : ''}`);
	}

	console.log('\nCore skills (installed only via a preset\'s own core: list):\n');
	for (const name of (await fs.readdir(path.join(SKILLS_DIR, 'core'))).sort()) {
		console.log(`  ${name.padEnd(20)} ${await describeSkill('core', name)}`);
	}

	console.log('\nAttachable skills (add with --with=<name>, from any preset):\n');
	for (const kind of DOMAIN_DIRS) {
		const dir = path.join(SKILLS_DIR, kind);
		if (!existsSync(dir)) continue;
		const names = (await fs.readdir(dir)).sort();
		if (!names.length) continue;
		console.log(`  ${kind}/`);
		for (const name of names) {
			console.log(`    ${name.padEnd(22)} ${await describeSkill(kind, name)}`);
		}
	}

	console.log('\nExternal tools (own installer — need --with=<name> or --with-external to actually install):\n');
	for (const [name, tool] of Object.entries(EXTERNAL_TOOLS)) {
		console.log(`  ${name.padEnd(18)} ${tool.url}`);
	}
	console.log('');
}

const COMING_SOON = new Set([]);

function printHelp() {
	console.log(`
claude-workspace — prepare a project for Claude Code in one command

Usage:
  claude-workspace init                                       (interactive wizard, needs a TTY)
  claude-workspace init <preset> [targetDir] [--with-external] [--with=<name,...>] [--force]
  claude-workspace list [--installed] [targetDir]
  claude-workspace sync [targetDir]
  claude-workspace add <name...>       (operates on the current directory)
  claude-workspace remove <name...>    (operates on the current directory)
  claude-workspace doctor [targetDir]
  claude-workspace update [targetDir]

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

                  --force  overwrite an existing CLAUDE.md instead of
                    leaving it untouched.

  list            Show every preset, skill and external tool this package
                  knows about, with a one-line description each.
                  --installed shows only what's actually in targetDir's
                  .claude/workspace.yaml instead of the full catalog.

  sync            Re-copy the skills declared in .claude/workspace.yaml from
                  the currently installed claude-workspace package (picks up
                  skill content updates). Doesn't touch CLAUDE.md or
                  re-install external tools.

  add <name...>   Add one or more skills/external tools to an existing
                  workspace (installs it and records it in workspace.yaml).
                  Requires "init" to have been run already.

  remove <name...> Remove one or more skills/tools from an existing
                  workspace (deletes the installed skill and drops it from
                  workspace.yaml). For an external tool this only stops
                  tracking it — the tool itself isn't uninstalled.

  doctor          Reports whether declared skills are actually installed,
                  whether their content matches this package's current
                  version (or has drifted — run sync), and whether
                  CLAUDE.md / the .gitignore block are in place.

  update          Best-effort "npm install -g claude-workspace@latest",
                  then "sync". Safe to run even under npx (which already
                  always uses the latest version).

Custom presets: the init wizard can build one on the fly and, if you say
yes, save it to ~/.claude-workspace/presets/<name>.yaml — after that,
"claude-workspace init <name>" works non-interactively too, same as any
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

	if (command === 'list') {
		const installedOnly = args.includes('--installed');
		await list({ installedOnly, targetDir: targetDirFrom(args) });
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
		const names = args.filter((arg) => !arg.startsWith('--'));
		if (!names.length) {
			console.error('Usage: claude-workspace add <name...> (operates on the current directory)');
			process.exitCode = 1;
			return;
		}
		await addSkills(process.cwd(), names);
		return;
	}

	if (command === 'remove') {
		const names = args.filter((arg) => !arg.startsWith('--'));
		if (!names.length) {
			console.error('Usage: claude-workspace remove <name...> (operates on the current directory)');
			process.exitCode = 1;
			return;
		}
		await removeSkills(process.cwd(), names);
		return;
	}

	if (command === 'doctor') {
		await doctor(targetDirFrom(args));
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
const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
	main().catch((error) => {
		console.error(`\nError: ${error.message}`);
		process.exitCode = 1;
	});
}

export {
	parseSimpleYaml,
	renderYamlList,
	renderMarkdownList,
	editDistance,
	suggestName,
	extractDescription,
	truncate,
	copySkill,
	copyDomainSkill,
	loadPreset,
	listPresetNames,
	ensureGitignore,
	init,
	installPreset,
	writeWorkspaceManifest,
	sync,
	list,
	doctor,
	addSkills,
	removeSkills,
	updatePackage,
	detectPackageManager,
	describeSkill,
	listKnownNames,
	SKILLS_DIR,
	PRESETS_DIR,
	TEMPLATES_DIR,
	DOMAIN_DIRS,
	EXTERNAL_TOOLS,
};
