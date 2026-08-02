// Fetching a skill from an arbitrary repo — "claude-workspace add <url>" —
// as opposed to catalog.js, which only knows about skills vendored inside
// this package. Never writes into *this package's own* skills/ tree: the
// destination is always either the target project's .claude/skills/ or (for
// --global) the user's own ~/.claude/skills/, which Claude Code already
// applies to every project on the machine — nothing here is ever committed
// back to claude-workspace's repo.

import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import { warn } from './log.js';
import { GLOBAL_DIR } from './i18n.js';

const execFileAsync = promisify(execFile);

/**
 * ~/.claude/skills/ — Claude Code's own personal, cross-project skills
 * directory (as opposed to a project's .claude/skills/). This is real HOME,
 * not overridable via CLAUDE_WORKSPACE_HOME like GLOBAL_DIR — it belongs to
 * Claude Code, not to claude-workspace's own config.
 */
export const GLOBAL_CLAUDE_SKILLS_DIR = path.join(os.homedir(), '.claude', 'skills');

/** Where claude-workspace itself remembers what it has installed globally, for `list --installed --global` / `remove --global`. */
const GLOBAL_SKILLS_RECORD_PATH = path.join(GLOBAL_DIR, 'global-skills.json');

async function loadGlobalSkillsRecord() {
	if (!existsSync(GLOBAL_SKILLS_RECORD_PATH)) return [];
	try {
		return JSON.parse(await fs.readFile(GLOBAL_SKILLS_RECORD_PATH, 'utf8'));
	} catch {
		return [];
	}
}

async function saveGlobalSkillsRecord(entries) {
	await fs.mkdir(GLOBAL_DIR, { recursive: true });
	await fs.writeFile(GLOBAL_SKILLS_RECORD_PATH, JSON.stringify(entries, null, 2) + '\n', 'utf8');
}

export async function listGlobalSkills() {
	return loadGlobalSkillsRecord();
}

export async function recordGlobalSkill(name, source) {
	const entries = (await loadGlobalSkillsRecord()).filter((e) => e.name !== name);
	entries.push({ name, source });
	await saveGlobalSkillsRecord(entries);
}

export async function forgetGlobalSkill(name) {
	const entries = (await loadGlobalSkillsRecord()).filter((e) => e.name !== name);
	await saveGlobalSkillsRecord(entries);
}

/**
 * True when `name` looks like a source `npx skills add` understands (a URL,
 * a git remote, or "owner/repo" shorthand) rather than a name from this
 * package's own catalog — our own skill/tool names are always a single
 * kebab-case segment, never containing "/" or a "scheme:" prefix, so this
 * can't collide with a real catalog name.
 */
export function looksLikeSkillSource(name) {
	return /^(https?:|git@)/i.test(name) || name.includes('/');
}

/**
 * Fetches a skill from an arbitrary repo via `npx skills add` — the CLI
 * from vercel-labs/skills (https://github.com/vercel-labs/skills, already
 * vendored from for react-best-practices and used for the "taste" external
 * tool in catalog.js), which already speaks GitHub/GitLab URLs, "owner/repo"
 * shorthand and plain git remotes, so there's no reason to reimplement any
 * of that here. `--copy` is required rather than the tool's own default:
 * `skills add` prefers symlinking to a canonical copy elsewhere on the
 * installer's machine, which wouldn't survive being committed and cloned by
 * a teammate for a project-scoped install.
 *
 * `global: true` installs to ~/.claude/skills/ instead (the CLI's own `-g`
 * flag) — Claude Code already applies that to every project on the machine,
 * so it's the way to add a skill once instead of per-project. Returns the
 * names of whatever showed up new in the destination (a repo can contain
 * more than one skill).
 *
 * `skill`: pins one skill by name out of a multi-skill repo. Matters because
 * `-y` (needed to skip the tool's own interactive confirmation, since this
 * is called non-interactively) makes an unqualified `owner/repo` source
 * install *every* skill the repo has rather than prompting — passing a
 * direct path to one skill's subdirectory in `source` avoids this too, but
 * `skill` is the documented, simpler way when you don't know that path.
 */
export async function fetchRemoteSkill(targetDir, source, { global = false, skill = null } = {}) {
	const skillsDestDir = global ? GLOBAL_CLAUDE_SKILLS_DIR : path.join(targetDir, '.claude', 'skills');
	await fs.mkdir(skillsDestDir, { recursive: true });
	const before = new Set(await fs.readdir(skillsDestDir));

	console.log(`  fetching "${source}"${skill ? ` (skill: ${skill})` : ''} via npx skills${global ? ' (global)' : ''}...`);
	const args = ['skills', 'add', source, '--agent', 'claude-code', '--copy', '-y'];
	if (global) args.push('-g');
	if (skill) args.push('--skill', skill);
	try {
		await execFileAsync('npx', args, { cwd: targetDir, shell: true });
	} catch (error) {
		warn(`"npx ${args.join(' ')}" failed: ${error.message.split('\n')[0]}`);
		warn(`try it yourself: npx ${args.join(' ')}`);
		return [];
	}

	const after = await fs.readdir(skillsDestDir);
	const added = after.filter((name) => !before.has(name));
	if (global) {
		for (const name of added) await recordGlobalSkill(name, source);
	}
	return added;
}
