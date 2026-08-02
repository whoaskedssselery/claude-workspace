import { test, describe, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// listGlobalSkills/recordGlobalSkill/forgetGlobalSkill read/write
// GLOBAL_DIR/global-skills.json — point that at a throwaway temp dir before
// importing anything, exactly like wizard.test.js does for presets, so this
// never touches the real ~/.claude-workspace on the machine running the tests.
const fakeHome = mkdtempSync(path.join(os.tmpdir(), 'claude-workspace-remote-home-'));
process.env.CLAUDE_WORKSPACE_HOME = fakeHome;

const { looksLikeSkillSource, listGlobalSkills, recordGlobalSkill, forgetGlobalSkill, GLOBAL_CLAUDE_SKILLS_DIR } = await import(
	'../scripts/workspace.js'
);

after(() => {
	rmSync(fakeHome, { recursive: true, force: true });
});

describe('looksLikeSkillSource', () => {
	test('true for URLs, git remotes and owner/repo shorthand', () => {
		assert.ok(looksLikeSkillSource('https://github.com/vercel-labs/agent-skills'));
		assert.ok(looksLikeSkillSource('git@github.com:vercel-labs/agent-skills.git'));
		assert.ok(looksLikeSkillSource('vercel-labs/agent-skills'));
	});

	test('false for a plain catalog-style name', () => {
		assert.equal(looksLikeSkillSource('react-best-practices'), false);
		assert.equal(looksLikeSkillSource('commit-discipline'), false);
	});
});

describe('GLOBAL_CLAUDE_SKILLS_DIR', () => {
	test('points at ~/.claude/skills, not the claude-workspace config dir', () => {
		assert.ok(GLOBAL_CLAUDE_SKILLS_DIR.replace(/\\/g, '/').endsWith('.claude/skills'));
	});
});

describe('global skills record (recordGlobalSkill / listGlobalSkills / forgetGlobalSkill)', () => {
	test('starts empty', async () => {
		assert.deepEqual(await listGlobalSkills(), []);
	});

	test('records and lists an entry', async () => {
		await recordGlobalSkill('web-design-guidelines', 'vercel-labs/agent-skills');
		const entries = await listGlobalSkills();
		assert.deepEqual(entries, [{ name: 'web-design-guidelines', source: 'vercel-labs/agent-skills' }]);
	});

	test('re-recording the same name replaces rather than duplicates it', async () => {
		await recordGlobalSkill('web-design-guidelines', 'a-different/source');
		const entries = await listGlobalSkills();
		assert.equal(entries.length, 1);
		assert.equal(entries[0].source, 'a-different/source');
	});

	test('forgetGlobalSkill removes just that entry', async () => {
		await recordGlobalSkill('another-skill', 'owner/repo');
		await forgetGlobalSkill('web-design-guidelines');
		const entries = await listGlobalSkills();
		assert.deepEqual(entries, [{ name: 'another-skill', source: 'owner/repo' }]);
	});
});
