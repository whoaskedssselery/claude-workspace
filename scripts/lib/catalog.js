// Everything about *what this package ships*: root paths, the domain/skill/
// preset catalog, the external-tools table, and the tiny dependency-free
// YAML subset parser/renderer preset and manifest files use. No knowledge of
// a specific project's workspace lives here — see manifest.js for that.

import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import https from 'node:https';

import { GLOBAL_PRESETS_DIR } from './i18n.js';
import { warn } from './log.js';
import { runVisible } from './proc.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(__dirname, '..', '..');

export const SKILLS_DIR = path.join(ROOT, 'skills');
export const PRESETS_DIR = path.join(ROOT, 'presets');
export const TEMPLATES_DIR = path.join(ROOT, 'templates');

let cachedPackageVersion;
/** This package's own version, for recording in workspace.yaml (see doctor's staleness check). */
export async function packageVersion() {
	if (!cachedPackageVersion) {
		const pkg = JSON.parse(await fs.readFile(path.join(ROOT, 'package.json'), 'utf8'));
		cachedPackageVersion = pkg.version;
	}
	return cachedPackageVersion;
}

/**
 * The version currently on npm's `latest` tag, for "claude-workspace
 * version" to compare itself against — same idea as npm's own "a newer
 * version of npm is available" notice. Best-effort and bounded: resolves
 * `null` (never throws, never hangs the command) on any failure — no
 * network, registry down, slow connection past `timeout`. This is an
 * optional nicety on top of the actual version number, not something
 * worth blocking or failing the command over.
 */
export function fetchLatestVersion({ timeout = 2500, url = 'https://registry.npmjs.org/claude-workspace/latest' } = {}) {
	return new Promise((resolve) => {
		let settled = false;
		const done = (value) => {
			if (settled) return;
			settled = true;
			resolve(value);
		};

		// https.get throws synchronously for a malformed URL rather than
		// emitting 'error' — guard it too, so this keeps its promise of never
		// throwing regardless of what "url" turns out to be.
		let req;
		try {
			req = https.get(url, { timeout }, (res) => {
				let data = '';
				res.on('data', (chunk) => (data += chunk));
				res.on('end', () => {
					try {
						done(JSON.parse(data).version ?? null);
					} catch {
						done(null);
					}
				});
			});
		} catch {
			done(null);
			return;
		}
		req.on('timeout', () => req.destroy());
		req.on('error', () => done(null));

		// Backstop in case destroy() doesn't trigger 'error' for some reason —
		// this must never be able to hang the command it's called from.
		const backstop = setTimeout(() => done(null), timeout + 1000);
		backstop.unref?.();
	});
}

/**
 * Tools that are their own installable project (their own installer, MCP
 * server or plugin marketplace) rather than a static skill file we can copy.
 * Listing a name here in a preset's `skills:` lets `init` install it for
 * real via its own non-interactive CLI, instead of just linking to it.
 */
export const EXTERNAL_TOOLS = {
	impeccable: {
		url: 'https://github.com/pbakaus/impeccable',
		manualInstall: 'npx impeccable install',
		steps: [{ command: 'npx', args: ['impeccable', 'install', '--providers=claude', '--scope=project'] }],
	},
	superpowers: {
		url: 'https://github.com/obra/superpowers',
		manualInstall: 'npx skills add obra/superpowers --agent claude-code --copy',
		steps: [{ command: 'npx', args: ['skills', 'add', 'obra/superpowers', '--agent', 'claude-code', '--copy', '-y'] }],
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
export const DOMAIN_DIRS = ['frontend', 'design', 'backend', 'fullstack', 'ml', 'devops', 'general', 'planning', 'formats'];

/**
 * Every skill/tool name init or sync can resolve, across all domains plus
 * external tools — used to validate --with= and suggest a fix for typos.
 */
export async function listKnownNames() {
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
export function editDistance(a, b) {
	const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
	for (let j = 0; j <= b.length; j++) dp[0][j] = j;
	for (let i = 1; i <= a.length; i++) {
		for (let j = 1; j <= b.length; j++) {
			dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] : 1 + Math.min(dp[i - 1][j - 1], dp[i - 1][j], dp[i][j - 1]);
		}
	}
	return dp[a.length][b.length];
}

export function suggestName(name, knownNames) {
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
export async function installExternalTool(name, tool, cwd) {
	console.log(`  installing "${name}" (${tool.url}) — output below is the installer's own, may take a while on a cold cache`);
	for (const step of tool.steps) {
		console.log(`    $ ${step.command} ${step.args.join(' ')}`);
		try {
			await runVisible(step.command, step.args, { cwd });
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
export function parseSimpleYaml(text) {
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

export function renderYamlList(items) {
	if (!items.length) return '  []';
	return items.map((item) => `  - ${item}`).join('\n');
}

export function renderMarkdownList(items) {
	if (!items.length) return '_none installed_';
	return items.map((item) => `- \`${item}\``).join('\n');
}

export async function listPresetNames(dir) {
	if (!existsSync(dir)) return [];
	return (await fs.readdir(dir)).filter((f) => f.endsWith('.yaml')).map((f) => f.replace(/\.yaml$/, ''));
}

/**
 * Kebab-case-ish names only (letters, digits, dot, underscore, hyphen) — no
 * "/", "\" or leading dot, so nothing built from user input (a preset name
 * typed into the wizard, a skill name passed to `add`/`remove`) can ever
 * resolve outside the directory it's joined into via ".." or an absolute
 * path segment.
 */
const SAFE_NAME_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/;
export function isSafeName(name) {
	return typeof name === 'string' && SAFE_NAME_PATTERN.test(name);
}

/**
 * Custom presets a project committed to its own repo
 * (<project>/.claude-workspace/presets/) — separate from
 * ~/.claude-workspace/presets/ (personal, all projects). This is how a
 * small team shares a preset: one person builds it in the wizard, picks
 * "project" scope, commits the file, and everyone else's `init
 * <that-name>` just works after a clone, no per-machine setup.
 */
export function projectPresetsDir(targetDir) {
	return path.join(targetDir, '.claude-workspace', 'presets');
}

/**
 * Built-in presets (PRESETS_DIR) take priority, then a project-local custom
 * preset committed to this repo, then a personal one saved globally via the
 * init wizard (~/.claude-workspace/presets/) — so `init <custom-name>`
 * keeps working non-interactively after it's been created once, whichever
 * scope it was saved at.
 */
export async function loadPreset(name, targetDir = process.cwd()) {
	if (!isSafeName(name)) {
		throw new Error(`Invalid preset name "${name}" — use only letters, digits, "-", "_" and ".".`);
	}
	const builtIn = path.join(PRESETS_DIR, `${name}.yaml`);
	const project = path.join(projectPresetsDir(targetDir), `${name}.yaml`);
	const global = path.join(GLOBAL_PRESETS_DIR, `${name}.yaml`);
	const file = existsSync(builtIn) ? builtIn : existsSync(project) ? project : existsSync(global) ? global : null;
	if (!file) {
		const available = [
			...(await listPresetNames(PRESETS_DIR)),
			...(await listPresetNames(projectPresetsDir(targetDir))),
			...(await listPresetNames(GLOBAL_PRESETS_DIR)),
		];
		throw new Error(`Preset "${name}" not found. Available presets: ${[...new Set(available)].join(', ') || '(none)'}`);
	}
	const text = await fs.readFile(file, 'utf8');
	return parseSimpleYaml(text);
}

/**
 * Skills live as a directory per skill (skills/<kind>/<name>/SKILL.md,
 * optionally with supporting files) and are installed the same way Claude
 * Code expects: .claude/skills/<name>/SKILL.md.
 */
export async function copySkill(kind, name, destDir) {
	if (!isSafeName(name)) return false;
	const src = path.join(SKILLS_DIR, kind, name);
	if (!existsSync(path.join(src, 'SKILL.md'))) return false;
	await fs.cp(src, path.join(destDir, name), { recursive: true });
	return true;
}

/**
 * A domain skill (as opposed to a core skill or an external tool) can live
 * under any of DOMAIN_DIRS — find and copy it from whichever one has it.
 */
export async function copyDomainSkill(name, destDir) {
	for (const kind of DOMAIN_DIRS) {
		if (await copySkill(kind, name, destDir)) return true;
	}
	return false;
}

/**
 * Pulls the `description:` field out of a SKILL.md's YAML frontmatter,
 * handling both `description: text` and the folded block style
 * (`description: >-` followed by indented continuation lines) that the
 * vendored skills use. No YAML dependency — just enough to display a
 * one-line summary in `list`.
 */
export function extractDescription(skillMd) {
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

export function truncate(text, max = 100) {
	return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

export async function describeSkill(kind, name) {
	const file = path.join(SKILLS_DIR, kind, name, 'SKILL.md');
	if (!existsSync(file)) return '';
	return truncate(extractDescription(await fs.readFile(file, 'utf8')));
}
