// Fetching a skill from an arbitrary repo — "claude-workspace add <url>" —
// as opposed to catalog.js, which only knows about skills vendored inside
// this package.

import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import { warn } from './log.js';

const execFileAsync = promisify(execFile);

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
 * a teammate — the whole point of adding this to a *shared* project.
 * Returns the names of whatever showed up new in .claude/skills/ (a repo
 * can contain more than one skill).
 */
export async function fetchRemoteSkill(targetDir, source) {
	const skillsDestDir = path.join(targetDir, '.claude', 'skills');
	await fs.mkdir(skillsDestDir, { recursive: true });
	const before = new Set(await fs.readdir(skillsDestDir));

	console.log(`  fetching "${source}" via npx skills...`);
	try {
		await execFileAsync('npx', ['skills', 'add', source, '--agent', 'claude-code', '--copy', '-y'], {
			cwd: targetDir,
			shell: true,
		});
	} catch (error) {
		warn(`"npx skills add ${source}" failed: ${error.message.split('\n')[0]}`);
		warn(`try it yourself: npx skills add ${source} --agent claude-code --copy`);
		return [];
	}

	const after = await fs.readdir(skillsDestDir);
	return after.filter((name) => !before.has(name));
}
