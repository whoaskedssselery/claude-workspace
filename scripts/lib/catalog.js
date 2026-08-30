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
 * `domain` places it alongside the portable skills in REMOTE_SKILLS for
 * catalog listing/wizard grouping purposes only — it has no effect on how
 * the tool is actually installed (still its own steps, never a skill copy).
 *
 * `creates`: project-root paths (files or folders) this tool's own installer
 * is known to add *besides* .claude/skills/ — recorded into the project's
 * own .claude/hide.yaml the moment the tool is installed (see
 * resolveCreatedPaths below and recordHideConfigPaths in manifest.js), so
 * "hide" later moves these into its stash too, and "unhide" puts them back,
 * same as everything else. Declared right here, next to the entry it
 * belongs to, rather than in a separate list elsewhere that's easy to forget
 * to update when a new tool is added. Best-effort: an installer that writes
 * somewhere undocumented/unpredictable (ui-ux-pro-max here) simply isn't
 * listed, and hide won't know to touch it.
 */
export const EXTERNAL_TOOLS = {
	impeccable: {
		domain: 'design',
		url: 'https://github.com/pbakaus/impeccable',
		manualInstall: 'npx impeccable install',
		steps: [{ command: 'npx', args: ['impeccable', 'install', '--providers=claude', '--scope=project'] }],
		creates: ['.impeccable'],
	},
	superpowers: {
		domain: 'general',
		url: 'https://github.com/obra/superpowers',
		manualInstall: 'npx skills add obra/superpowers --agent claude-code --copy',
		steps: [{ command: 'npx', args: ['skills', 'add', 'obra/superpowers', '--agent', 'claude-code', '--copy', '-y'] }],
	},
	taste: {
		domain: 'design',
		url: 'https://github.com/Leonxlnx/taste-skill',
		manualInstall: 'npx skills add https://github.com/Leonxlnx/taste-skill --skill "design-taste-frontend" --agent claude-code --copy',
		steps: [
			{
				command: 'npx',
				args: [
					'skills',
					'add',
					'https://github.com/Leonxlnx/taste-skill',
					'--skill',
					'design-taste-frontend',
					'--agent',
					'claude-code',
					'--copy',
				],
			},
		],
		// Without --agent claude-code --copy above (fixed, but older installs
		// predate the fix), the "skills" CLI defaults to its own agent-agnostic
		// .agents/skills/ instead of .claude/skills/ — still swept up by hide.
		creates: ['.agents'],
	},
	'ui-ux-pro-max': {
		domain: 'design',
		url: 'https://github.com/nextlevelbuilder/ui-ux-pro-max-skill',
		manualInstall: 'npm install -g ui-ux-pro-max-cli && uipro init --ai claude',
		steps: [
			{ command: 'npm', args: ['install', '-g', 'ui-ux-pro-max-cli'] },
			{ command: 'uipro', args: ['init', '--ai', 'claude'] },
		],
	},
};

/**
 * Portable skills this package knows *about* but does not vendor a copy of —
 * only `skills/core` (this project's own work) and `skills/formats` (small
 * behavioral variants, also original to this project) ship as files in this
 * repo. Everything else is fetched on demand from its original author's repo
 * via the same `npx skills add` mechanism as `add <url>` (see remote.js),
 * pinned to one skill with `--skill <skillName>` so a multi-skill source repo
 * doesn't pull in siblings the user didn't ask for.
 */
export const REMOTE_SKILLS = {
	'react-best-practices': {
		domain: 'frontend',
		source: 'vercel-labs/agent-skills',
		skillName: 'react-best-practices',
		description: 'React and Next.js performance optimization guidelines from Vercel Engineering.',
	},
	'claude-design': {
		domain: 'design',
		source: 'jiji262/claude-design-skill',
		skillName: 'claude-design',
		description:
			'Produce thoughtful, high-fidelity design artifacts in HTML — landing pages, slide decks, interactive prototypes, animated videos, posters, wireframes, and visual explorations.',
		// Working files the skill itself instructs writing to the project root
		// (fact-verification findings, brand asset inventory).
		creates: ['product-facts.md', 'brand-spec.md'],
	},
	'api-designer': {
		domain: 'backend',
		source: 'Jeffallan/claude-skills',
		skillName: 'api-designer',
		description: 'Use when designing REST or GraphQL APIs, creating OpenAPI specifications, or planning API architecture.',
	},
	'security-reviewer': {
		domain: 'backend',
		source: 'Jeffallan/claude-skills',
		skillName: 'security-reviewer',
		description: 'Identifies security vulnerabilities, generates structured audit reports with severity ratings, and provides actionable remediation guidance.',
	},
	'database-optimizer': {
		domain: 'backend',
		source: 'Jeffallan/claude-skills',
		skillName: 'database-optimizer',
		description: 'Optimizes database queries and improves performance across PostgreSQL and MySQL systems.',
	},
	'microservices-architect': {
		domain: 'backend',
		source: 'Jeffallan/claude-skills',
		skillName: 'microservices-architect',
		description: 'Designs distributed system architectures, decomposes monoliths into bounded-context services, recommends communication patterns.',
	},
	'websocket-engineer': {
		domain: 'backend',
		source: 'Jeffallan/claude-skills',
		skillName: 'websocket-engineer',
		description: 'Use when building real-time communication systems with WebSockets or Socket.IO.',
	},
	'react-expert': {
		domain: 'frontend',
		source: 'Jeffallan/claude-skills',
		skillName: 'react-expert',
		description: 'Use when building React 18+ applications in .jsx or .tsx files, Next.js App Router projects, or create-react-app setups.',
	},
	'vue-expert': {
		domain: 'frontend',
		source: 'Jeffallan/claude-skills',
		skillName: 'vue-expert',
		description: 'Builds Vue 3 components with Composition API patterns, configures Nuxt 3 SSR/SSG projects, sets up Pinia stores.',
	},
	'graphql-architect': {
		domain: 'frontend',
		source: 'Jeffallan/claude-skills',
		skillName: 'graphql-architect',
		description: 'Use when designing GraphQL schemas, implementing Apollo Federation, or building real-time subscriptions.',
	},
	'fullstack-guardian': {
		domain: 'fullstack',
		source: 'Jeffallan/claude-skills',
		skillName: 'fullstack-guardian',
		description: 'Builds security-focused full-stack web applications by implementing integrated frontend and backend components with layered security.',
	},
	'ml-pipeline': {
		domain: 'ml',
		source: 'Jeffallan/claude-skills',
		skillName: 'ml-pipeline',
		description: 'Designs and implements production-grade ML pipeline infrastructure: experiment tracking, feature engineering, training pipelines.',
	},
	'rag-architect': {
		domain: 'ml',
		source: 'Jeffallan/claude-skills',
		skillName: 'rag-architect',
		description: 'Designs and implements production-grade RAG systems by chunking documents, generating embeddings, configuring vector stores.',
	},
	'fine-tuning-expert': {
		domain: 'ml',
		source: 'Jeffallan/claude-skills',
		skillName: 'fine-tuning-expert',
		description: 'Use when fine-tuning LLMs, training custom models, or adapting foundation models for specific tasks.',
	},
	'pandas-pro': {
		domain: 'ml',
		source: 'Jeffallan/claude-skills',
		skillName: 'pandas-pro',
		description: 'Performs pandas DataFrame operations for data analysis, manipulation, and transformation.',
	},
	'spark-engineer': {
		domain: 'ml',
		source: 'Jeffallan/claude-skills',
		skillName: 'spark-engineer',
		description: 'Use when writing Spark jobs, debugging performance issues, or configuring cluster settings for Apache Spark applications.',
	},
	'devops-engineer': {
		domain: 'devops',
		source: 'Jeffallan/claude-skills',
		skillName: 'devops-engineer',
		description: 'Creates Dockerfiles, configures CI/CD pipelines, writes Kubernetes manifests, and generates Terraform/Pulumi infrastructure templates.',
	},
	'kubernetes-specialist': {
		domain: 'devops',
		source: 'Jeffallan/claude-skills',
		skillName: 'kubernetes-specialist',
		description: 'Use when deploying or managing Kubernetes workloads: deployment manifests, pod security policies, service configuration.',
	},
	'terraform-engineer': {
		domain: 'devops',
		source: 'Jeffallan/claude-skills',
		skillName: 'terraform-engineer',
		description: 'Use when implementing infrastructure as code with Terraform across AWS, Azure, or GCP.',
	},
	'cloud-architect': {
		domain: 'devops',
		source: 'Jeffallan/claude-skills',
		skillName: 'cloud-architect',
		description: 'Designs cloud architectures, creates migration plans, generates cost optimization recommendations, and produces disaster recovery strategies.',
	},
	'code-reviewer': {
		domain: 'general',
		source: 'Jeffallan/claude-skills',
		skillName: 'code-reviewer',
		description: 'Analyzes code diffs and files to identify bugs, security vulnerabilities, code smells, and N+1 query patterns.',
	},
	'debugging-wizard': {
		domain: 'general',
		source: 'Jeffallan/claude-skills',
		skillName: 'debugging-wizard',
		description: 'Parses error messages, traces execution flow through stack traces, correlates log entries to identify failure points.',
	},
	'test-master': {
		domain: 'general',
		source: 'Jeffallan/claude-skills',
		skillName: 'test-master',
		description: 'Generates test files, creates mocking strategies, analyzes code coverage, designs test architectures.',
	},
	'feature-forge': {
		domain: 'planning',
		source: 'Jeffallan/claude-skills',
		skillName: 'feature-forge',
		description: 'Conducts structured requirements workshops to produce feature specifications, user stories, EARS-format functional requirements.',
		// Saves each spec as specs/{feature_name}.spec.md — the whole directory,
		// since the filename varies per feature.
		creates: ['specs'],
	},
};

/**
 * Domain categories used to group the catalog (REMOTE_SKILLS + EXTERNAL_TOOLS)
 * for display in `list` and the wizard. `formats` is a physical directory
 * (skills/formats) of small behavioral variants original to this project —
 * it stays vendored, unlike every other domain.
 */
export const DOMAIN_DIRS = ['frontend', 'design', 'backend', 'fullstack', 'ml', 'devops', 'general', 'planning'];

/** Every REMOTE_SKILLS/EXTERNAL_TOOLS name belonging to one domain, sorted. */
export function namesInDomain(domain) {
	const names = [
		...Object.entries(REMOTE_SKILLS)
			.filter(([, entry]) => entry.domain === domain)
			.map(([name]) => name),
		...Object.entries(EXTERNAL_TOOLS)
			.filter(([, tool]) => tool.domain === domain)
			.map(([name]) => name),
	];
	return names.sort();
}

/**
 * Every skill/tool name init or sync can resolve — this package's own
 * vendored core/formats skills, the remote-skill catalog, and external tools
 * — used to validate --with= and suggest a fix for typos.
 */
export async function listKnownNames() {
	const names = [];
	for (const kind of ['core', 'formats']) {
		const dir = path.join(SKILLS_DIR, kind);
		if (!existsSync(dir)) continue;
		for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
			if (entry.isDirectory()) names.push(entry.name);
		}
	}
	names.push(...Object.keys(REMOTE_SKILLS));
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
 * A project's own, single list of paths for "hide" to sweep up — the whole
 * source "hide" consults, no separate special-casing for .claude/skills/,
 * workspace.yaml or CLAUDE.md's generated block anywhere else. "init"
 * seeds it with `.claude` and `CLAUDE.md` themselves (which is why those
 * don't need their own entries), plus whatever a just-installed name's own
 * `creates:` declares (see resolveCreatedPaths below and
 * recordHideConfigPaths in manifest.js) — "add"/"sync" keep it current the
 * same way, and "remove" drops a removed name's entries again (see
 * forgetHideConfigPaths in manifest.js). Add entries by hand for anything
 * claude-workspace has no other way to know about — a tool set up by hand,
 * a personal note, a local file that just shouldn't be visible during a
 * screen-share.
 *
 * Lives *inside* `.claude/` deliberately, not in a separate directory:
 * `.claude` is itself one of the paths "hide" sweeps as a single unit, so
 * hide.yaml — along with the rest of `.claude/` — goes into the stash and
 * comes back with it on "unhide", the same as everything else it lists.
 * Nothing extra to preserve, and nothing left behind in the project root
 * besides `.claude/` and `CLAUDE.md` either way. Committed like the rest of
 * `.claude/`, so the whole team gets the same hide behavior after a clone.
 */
export function projectHideConfigPath(targetDir) {
	return path.join(targetDir, '.claude', 'hide.yaml');
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

/**
 * Pulls a plain `creates:` list out of a SKILL.md's YAML frontmatter (see
 * codegraph's SKILL.md for an example) — reuses parseSimpleYaml on just the
 * frontmatter block rather than a bespoke parser like extractDescription's,
 * since a plain list (no folded-string handling needed) is exactly the
 * shape parseSimpleYaml already supports.
 */
export function extractCreates(skillMd) {
	const lines = skillMd.split(/\r?\n/);
	if (lines[0]?.trim() !== '---') return [];
	const end = lines.indexOf('---', 1);
	const frontmatter = lines.slice(1, end === -1 ? undefined : end).join('\n');
	return parseSimpleYaml(frontmatter).creates ?? [];
}

/**
 * The project-root paths (files or folders, besides .claude/skills/ itself)
 * a given name is known to add — resolved once, right after that name is
 * installed, so its extra paths can be written straight into the project's
 * hide.yaml (see recordHideConfigPaths in manifest.js) instead of "hide"
 * having to re-derive them from workspace.yaml on every run. Checks, in
 * order: an external tool's own `creates` (catalog.js), a REMOTE_SKILLS
 * catalog entry's `creates`, or — for a core/format skill, which this
 * package vendors — a `creates:` list declared right in its own SKILL.md
 * frontmatter, so a new core skill documents its own footprint instead of
 * needing a change somewhere else too.
 */
export async function resolveCreatedPaths(name) {
	if (EXTERNAL_TOOLS[name]) return EXTERNAL_TOOLS[name].creates ?? [];
	if (REMOTE_SKILLS[name]) return REMOTE_SKILLS[name].creates ?? [];
	for (const kind of ['core', 'formats']) {
		const file = path.join(SKILLS_DIR, kind, name, 'SKILL.md');
		if (existsSync(file)) return extractCreates(await fs.readFile(file, 'utf8'));
	}
	return [];
}
