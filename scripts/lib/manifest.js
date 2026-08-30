// Everything about *a specific project's installed workspace*: the
// .claude/workspace.yaml manifest (including the "name=source" encoding for
// remote skills), the marker-delimited CLAUDE.md block, and the project's own
// hide.yaml — as opposed to catalog.js, which only knows what this package
// ships, not what any particular project has installed.
//
// No .gitignore handling lives here (or anywhere): .claude/skills/,
// workspace.yaml and CLAUDE.md are meant to be committed, and anything that
// genuinely shouldn't be — a local file, a personal note — is the project's
// own hide.yaml's job (see readHideConfig/recordHideConfigPaths below),
// swept out of the tree entirely by "hide" right before a commit rather than
// permanently excluded from one.

import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

import { warn } from './log.js';
import { GLOBAL_DIR } from './i18n.js';
import {
	TEMPLATES_DIR,
	SKILLS_DIR,
	EXTERNAL_TOOLS,
	extractDescription,
	parseSimpleYaml,
	packageVersion,
	renderYamlList,
	projectHideConfigPath,
} from './catalog.js';

export function requireWorkspace(targetDir) {
	const workspacePath = path.join(targetDir, '.claude', 'workspace.yaml');
	if (!existsSync(workspacePath)) {
		throw new Error(`No .claude/workspace.yaml found in ${targetDir} — run "init" first.`);
	}
	return workspacePath;
}

/** "name=source" — the flat list-of-strings shape parseSimpleYaml supports, no nested-map parsing needed. */
export function encodeRemoteList(remote) {
	return remote.map(({ name, source }) => `${name}=${source}`);
}
export function decodeRemoteList(lines) {
	return (lines ?? []).map((line) => {
		const i = line.indexOf('=');
		return i === -1 ? { name: line, source: '' } : { name: line.slice(0, i), source: line.slice(i + 1) };
	});
}

export async function writeWorkspaceManifest(targetDir, presetName, core, skills, external, remote = []) {
	const claudeDir = path.join(targetDir, '.claude');
	await fs.mkdir(claudeDir, { recursive: true });
	const workspaceTemplate = await fs.readFile(path.join(TEMPLATES_DIR, 'workspace.template.yaml'), 'utf8');
	const workspaceYaml = workspaceTemplate
		.replace('{{VERSION}}', await packageVersion())
		.replace('{{PRESET}}', presetName)
		.replace('{{CORE_LIST}}', renderYamlList(core))
		.replace('{{SKILLS_LIST}}', renderYamlList(skills))
		.replace('{{EXTERNAL_LIST}}', renderYamlList(external))
		.replace('{{REMOTE_LIST}}', renderYamlList(encodeRemoteList(remote)));
	await fs.writeFile(path.join(claudeDir, 'workspace.yaml'), workspaceYaml, 'utf8');
}

const CLAUDE_MD_MARKER_START = '<!-- claude-workspace:start -->';
const CLAUDE_MD_MARKER_END = '<!-- claude-workspace:end -->';

/**
 * A skill's one-line description is the whole reason it gets invoked at
 * all — Claude Code decides to consult a skill by matching the task at
 * hand against that description, so surfacing it directly in CLAUDE.md
 * (rather than just the bare name) means the "when to use this" signal is
 * sitting in context even before anything decides to read the skill file
 * itself. Reads from wherever the skill actually landed
 * (targetDir/.claude/skills/<name>/SKILL.md) rather than this package's own
 * catalog, so it works uniformly for core, format, catalog and `add <url>`
 * skills alike — whatever is really installed, not just what claude-workspace
 * shipped. External tools have no SKILL.md to read; fall back to their URL.
 */
async function describeInstalledSkill(skillsDestDir, name) {
	const file = path.join(skillsDestDir, name, 'SKILL.md');
	if (existsSync(file)) {
		const description = extractDescription(await fs.readFile(file, 'utf8'));
		if (description) return description;
	}
	if (EXTERNAL_TOOLS[name]) return `Separate tool, own installer — ${EXTERNAL_TOOLS[name].url}`;
	return '';
}

export async function renderSkillList(names, skillsDestDir) {
	if (!names.length) return '_none installed_';
	const lines = await Promise.all(
		names.map(async (name) => {
			const description = await describeInstalledSkill(skillsDestDir, name);
			return description ? `- **${name}** — ${description}` : `- **${name}**`;
		})
	);
	return lines.join('\n');
}

/**
 * Writes (or updates in place) the claude-workspace-generated section of
 * CLAUDE.md, wrapped in HTML-comment markers so it can be told apart from
 * anything a team member added by hand around it. Three outcomes:
 *  - file doesn't exist yet: write it fresh (whole template, markers included)
 *  - file exists and already has the markers: replace only what's between
 *    them, byte-for-byte preserving everything outside — safe to call from
 *    `sync` on every run, not just `init --force`
 *  - file exists without markers (hand-written, or from before this existed):
 *    left untouched unless `force`, which appends the block at the end
 *    rather than overwriting the file
 */
export async function writeClaudeMd(targetDir, presetName, core, skills, { force = false } = {}) {
	const claudeMdPath = path.join(targetDir, 'CLAUDE.md');
	const skillsDestDir = path.join(targetDir, '.claude', 'skills');
	const claudeTemplate = await fs.readFile(path.join(TEMPLATES_DIR, 'CLAUDE.template.md'), 'utf8');
	const rendered = claudeTemplate
		.replace('{{PRESET}}', presetName)
		.replace('{{CORE_LIST}}', await renderSkillList(core, skillsDestDir))
		.replace('{{SKILLS_LIST}}', await renderSkillList(skills, skillsDestDir));

	if (!existsSync(claudeMdPath)) {
		await fs.writeFile(claudeMdPath, rendered, 'utf8');
		return 'written';
	}

	const blockStart = rendered.indexOf(CLAUDE_MD_MARKER_START);
	const blockEnd = rendered.indexOf(CLAUDE_MD_MARKER_END) + CLAUDE_MD_MARKER_END.length;
	const block = rendered.slice(blockStart, blockEnd);

	const existing = await fs.readFile(claudeMdPath, 'utf8');
	const existingStart = existing.indexOf(CLAUDE_MD_MARKER_START);
	const existingEnd = existing.indexOf(CLAUDE_MD_MARKER_END);
	if (existingStart !== -1 && existingEnd !== -1 && existingEnd > existingStart) {
		const updated = existing.slice(0, existingStart) + block + existing.slice(existingEnd + CLAUDE_MD_MARKER_END.length);
		await fs.writeFile(claudeMdPath, updated, 'utf8');
		return 'updated';
	}

	if (!force) {
		warn(
			'CLAUDE.md already exists without a claude-workspace block — left untouched. Pass --force on "init" to append one, or merge manually from templates/CLAUDE.template.md.'
		);
		return 'skipped';
	}

	await fs.writeFile(claudeMdPath, existing.trimEnd() + '\n\n' + block + '\n', 'utf8');
	return 'appended';
}

/**
 * Where `hide` stashes a project's claude-workspace state — deliberately
 * OUTSIDE the project directory (under GLOBAL_DIR, next to presets/ and
 * config.json — same personal, machine-wide location, overridable via
 * CLAUDE_WORKSPACE_HOME for tests). A stash living inside the project (e.g.
 * <project>/.claude-workspace/hidden/) is still a folder an IDE's project
 * tree shows, `.gitignore` or not — gitignoring only keeps it out of git,
 * not out of view. Keying it off a hash of the resolved project path keeps
 * multiple projects' stashes apart without needing anything inside the
 * project itself.
 */
export function hiddenDir(targetDir) {
	const id = crypto.createHash('sha1').update(path.resolve(targetDir)).digest('hex').slice(0, 16);
	return path.join(GLOBAL_DIR, 'hidden', id);
}

/**
 * Moves every path the project's own hide.yaml lists (see readHideConfig
 * below) into the stash, one subfolder per path so unhide can put each back
 * at its original location. hide.yaml is the only source "hide" consults for
 * this — a just-installed name's own known extra paths (impeccable's
 * .impeccable/, codegraph's .codegraph/, ...) are written into it once, at
 * install time, by recordHideConfigPaths, so hide itself stays a single flat
 * sweep instead of re-deriving them from workspace.yaml on every run.
 */
async function moveHiddenPaths(targetDir, hidden, paths) {
	const moved = [];
	for (const rel of paths) {
		const src = path.join(targetDir, rel);
		if (!existsSync(src)) continue;
		const stashName = `custom__${rel.replace(/[\\/]/g, '_')}`;
		await fs.mkdir(path.join(hidden, 'extra'), { recursive: true });
		await fs.rename(src, path.join(hidden, 'extra', stashName));
		moved.push({ rel, stashName });
	}
	return moved;
}

/**
 * Extra paths (relative to the project root) hide.yaml asks "hide" to sweep
 * up. Missing file or an empty/absent `paths:` list is fine — hide just has
 * nothing to do. Each entry is checked to resolve inside targetDir, so a
 * ".." or absolute entry can't move something from outside the project
 * into the stash — it's skipped with a warning instead.
 */
export async function readHideConfig(targetDir) {
	const file = projectHideConfigPath(targetDir);
	if (!existsSync(file)) return [];

	const root = path.resolve(targetDir);
	const paths = parseSimpleYaml(await fs.readFile(file, 'utf8')).paths ?? [];
	return paths.filter((rel) => {
		const resolved = path.resolve(root, rel);
		const safe = !path.isAbsolute(rel) && (resolved === root || resolved.startsWith(root + path.sep));
		if (!safe) warn(`.claude/hide.yaml: ignoring "${rel}" — not a path inside the project.`);
		return safe;
	});
}

/**
 * Appends paths to this project's .claude/hide.yaml, creating the file (and
 * its directory) if needed, and de-duplicating against whatever it already
 * lists. Called by seedHideConfig (commands.js) after "init"/"add"/"sync" —
 * with `.claude` and `CLAUDE.md` themselves always included, plus whatever a
 * just-installed name's own `creates:` declares (see resolveCreatedPaths in
 * catalog.js) — that's the one moment claude-workspace actually knows what a
 * name just added, so it's recorded here instead of "hide" re-deriving it
 * from workspace.yaml on every run.
 */
export async function recordHideConfigPaths(targetDir, paths) {
	if (!paths.length) return;
	const file = projectHideConfigPath(targetDir);
	const existing = existsSync(file) ? (parseSimpleYaml(await fs.readFile(file, 'utf8')).paths ?? []) : [];
	const merged = [...new Set([...existing, ...paths])];
	await fs.mkdir(path.dirname(file), { recursive: true });
	await fs.writeFile(file, `paths:\n${renderYamlList(merged)}\n`, 'utf8');
}

/**
 * Removes paths from this project's .claude/hide.yaml — the inverse of
 * recordHideConfigPaths, called by "remove" (commands.js) with a removed
 * name's own `creates:` paths, so a skill/tool that's no longer installed
 * doesn't leave its swept path listed forever. `.claude` and `CLAUDE.md`
 * themselves are never at risk here — they aren't any name's `creates:`
 * value, only seedHideConfig adds those, unconditionally, at install time.
 * `stillNeeded` (another currently-installed name's own creates paths) is
 * subtracted from what gets dropped, so removing one skill doesn't stop
 * hiding a path a different installed skill still needs swept. Missing
 * file is a no-op.
 */
export async function forgetHideConfigPaths(targetDir, paths, stillNeeded = []) {
	if (!paths.length) return;
	const file = projectHideConfigPath(targetDir);
	if (!existsSync(file)) return;
	const existing = parseSimpleYaml(await fs.readFile(file, 'utf8')).paths ?? [];
	const drop = new Set(paths.filter((p) => !stillNeeded.includes(p)));
	if (!drop.size) return;
	const remaining = existing.filter((p) => !drop.has(p));
	await fs.writeFile(file, `paths:\n${renderYamlList(remaining)}\n`, 'utf8');
}

/**
 * Temporarily moves everything the project's own .claude/hide.yaml lists
 * (see readHideConfig above, and recordHideConfigPaths for how it gets
 * populated — `.claude` and `CLAUDE.md` by default, plus a just-installed
 * name's own known extra paths like impeccable's .impeccable/, codegraph's
 * .codegraph/, claude-design's product-facts.md, and anything the user added
 * by hand) out of the project entirely, into the stash (see hiddenDir
 * above), so the project looks exactly like it did before `init` ever ran.
 * hide.yaml is the only thing "hide" consults — no separate handling for
 * .claude/skills/, workspace.yaml or CLAUDE.md's generated block; both of
 * those are already covered by the `.claude`/`CLAUDE.md` entries hide.yaml
 * carries by default. hide.yaml lives inside `.claude/` itself, so sweeping
 * `.claude` as a whole takes it along too — nothing extra to special-case.
 *
 * This is a stash, not a sync: `unhideWorkspace` restores the pre-hide
 * snapshot byte-for-byte rather than trying to merge in whatever changed
 * while hidden.
 */
export async function hideWorkspace(targetDir) {
	const hidden = hiddenDir(targetDir);
	if (existsSync(hidden)) {
		throw new Error(`Already hidden — run "claude-workspace unhide" before hiding again.`);
	}
	if (!existsSync(path.join(targetDir, '.claude', 'workspace.yaml'))) {
		throw new Error(`No .claude/workspace.yaml found in ${targetDir} — nothing to hide.`);
	}

	await fs.mkdir(hidden, { recursive: true });

	const customPaths = await readHideConfig(targetDir);
	const movedPaths = await moveHiddenPaths(targetDir, hidden, customPaths);
	if (movedPaths.length) {
		await fs.writeFile(path.join(hidden, 'extra-dirs.json'), JSON.stringify(movedPaths, null, 2) + '\n', 'utf8');
	}

	return { hiddenDir: hidden, movedPaths: movedPaths.map((e) => e.rel) };
}

/** Reverses hideWorkspace — restores the exact pre-hide snapshot and removes the stash. */
export async function unhideWorkspace(targetDir) {
	const hidden = hiddenDir(targetDir);
	if (!existsSync(hidden)) {
		throw new Error(`Nothing hidden in ${targetDir} — run "claude-workspace hide" first.`);
	}

	const extraManifestPath = path.join(hidden, 'extra-dirs.json');
	let movedPaths = [];
	if (existsSync(extraManifestPath)) {
		movedPaths = JSON.parse(await fs.readFile(extraManifestPath, 'utf8'));
		for (const { rel, stashName } of movedPaths) {
			const src = path.join(hidden, 'extra', stashName);
			if (!existsSync(src)) continue;
			const dest = path.join(targetDir, rel);
			await fs.mkdir(path.dirname(dest), { recursive: true });
			await fs.rename(src, dest);
		}
	}

	await fs.rm(hidden, { recursive: true, force: true });
	return { movedPaths: movedPaths.map((e) => e.rel) };
}

/**
 * Compares an installed skill's SKILL.md against the version currently in
 * this package. Only meaningful for `kind`s this package actually vendors
 * (`core`, `formats`) — everything else (REMOTE_SKILLS, external tools) is
 * fetched from its own author's repo, not shipped here, so there's nothing
 * local to diff against; doctor checks those for presence only. Only checks
 * SKILL.md itself (not reference files) — good enough signal for "this has
 * changed upstream, run sync" without a full recursive diff.
 */
export async function checkSkillStatus(kind, name, installedSkillsDir) {
	const installedSkillMd = path.join(installedSkillsDir, name, 'SKILL.md');
	if (!existsSync(installedSkillMd)) return 'missing';

	const sourceDir = path.join(SKILLS_DIR, kind, name);
	if (!existsSync(path.join(sourceDir, 'SKILL.md'))) return 'no longer in this package';

	const [installedContent, sourceContent] = await Promise.all([
		fs.readFile(installedSkillMd, 'utf8'),
		fs.readFile(path.join(sourceDir, 'SKILL.md'), 'utf8'),
	]);
	return installedContent === sourceContent ? 'ok' : 'outdated — run sync';
}
