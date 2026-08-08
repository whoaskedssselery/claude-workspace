// Everything about *a specific project's installed workspace*: the
// .gitignore marker block, .claude/workspace.yaml (including the
// "name=source" encoding for remote skills), and the marker-delimited
// CLAUDE.md block — as opposed to catalog.js, which only knows what this
// package ships, not what any particular project has installed.

import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

import { warn } from './log.js';
import { TEMPLATES_DIR, SKILLS_DIR, packageVersion, renderYamlList, renderMarkdownList } from './catalog.js';

export const GITIGNORE_MARKER_START = '# --- claude-workspace: local Claude Code state (do not remove this block) ---';
export const GITIGNORE_MARKER_END = '# --- end claude-workspace ---';
const GITIGNORE_BLOCK = [GITIGNORE_MARKER_START, '.claude/settings.local.json', '.DS_Store', GITIGNORE_MARKER_END, ''].join(
	'\n'
);

/**
 * Adds a small, marked block to the project's .gitignore for state that is
 * genuinely personal/local (Claude Code's own settings.local.json, OS
 * cruft) — never for .claude/skills or CLAUDE.md, which are the whole point
 * of this tool and are meant to be committed and shared with the team.
 * Idempotent: skips if the marker is already present.
 */
export async function ensureGitignore(targetDir) {
	const gitignorePath = path.join(targetDir, '.gitignore');
	const existing = existsSync(gitignorePath) ? await fs.readFile(gitignorePath, 'utf8') : '';
	if (existing.includes(GITIGNORE_MARKER_START)) return;

	const separator = existing && !existing.endsWith('\n') ? '\n\n' : existing ? '\n' : '';
	await fs.writeFile(gitignorePath, existing + separator + GITIGNORE_BLOCK, 'utf8');
}

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
 * Writes (or updates in place) the claude-workspace-generated section of
 * CLAUDE.md, wrapped in HTML-comment markers so it can be told apart from
 * anything a team member added by hand around it — mirrors the .gitignore
 * marker-block approach above. Three outcomes:
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
	const claudeTemplate = await fs.readFile(path.join(TEMPLATES_DIR, 'CLAUDE.template.md'), 'utf8');
	const rendered = claudeTemplate
		.replace('{{PRESET}}', presetName)
		.replace('{{CORE_LIST}}', renderMarkdownList(core))
		.replace('{{SKILLS_LIST}}', renderMarkdownList(skills));

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
