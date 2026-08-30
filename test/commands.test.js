import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Must be set before workspace.js (and its static import of lib/i18n.js) is
// ever loaded in this process, so GLOBAL_PRESETS_DIR/CONFIG_PATH point at a
// throwaway directory instead of the real ~/.claude-workspace.
const fakeHome = mkdtempSync(path.join(os.tmpdir(), 'claude-workspace-home-'));
process.env.CLAUDE_WORKSPACE_HOME = fakeHome;

const { init, doctor, addSkills, removeSkills, loadPreset, readHideConfig } = await import('../scripts/workspace.js');
const { GLOBAL_PRESETS_DIR, loadConfig, saveConfig } = await import('../scripts/lib/i18n.js');

function tmpDir() {
	return mkdtempSync(path.join(os.tmpdir(), 'claude-workspace-test-'));
}

after(() => {
	rmSync(fakeHome, { recursive: true, force: true });
});

describe('config (isolated via CLAUDE_WORKSPACE_HOME)', () => {
	test('GLOBAL_PRESETS_DIR is redirected away from the real home directory', () => {
		assert.ok(GLOBAL_PRESETS_DIR.startsWith(fakeHome));
	});

	test('loadConfig returns {} when no config file exists yet', async () => {
		assert.deepEqual(await loadConfig(), {});
	});

	test('saveConfig then loadConfig round-trips', async () => {
		await saveConfig({ language: 'ru' });
		assert.deepEqual(await loadConfig(), { language: 'ru' });
	});
});

describe('custom presets (saved globally)', () => {
	before(async () => {
		await fs.mkdir(GLOBAL_PRESETS_DIR, { recursive: true });
		await fs.writeFile(
			path.join(GLOBAL_PRESETS_DIR, 'my-custom.yaml'),
			'name: my-custom\n\ncore:\n  - commit-discipline\n\nskills:\n  - spike\n',
			'utf8'
		);
	});

	test('loadPreset finds a custom preset when there is no built-in one by that name', async () => {
		const preset = await loadPreset('my-custom');
		assert.equal(preset.name, 'my-custom');
		assert.deepEqual(preset.core, ['commit-discipline']);
		assert.deepEqual(preset.skills, ['spike']);
	});

	test('init installs a custom preset the same way as a built-in one', async () => {
		const dir = tmpDir();
		try {
			await init('my-custom', dir, {});
			assert.ok(existsSync(path.join(dir, '.claude', 'skills', 'commit-discipline', 'SKILL.md')));
			assert.ok(existsSync(path.join(dir, '.claude', 'skills', 'spike', 'SKILL.md')));
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});
});

describe('doctor', () => {
	test('reports ok for freshly installed skills, and flags a missing one', async () => {
		const dir = tmpDir();
		const logs = [];
		const originalLog = console.log;
		console.log = (msg) => logs.push(msg);
		try {
			await init('oss-contribution', dir, {});
			await fs.rm(path.join(dir, '.claude', 'skills', 'codegraph'), { recursive: true, force: true });

			await doctor(dir);

			const output = logs.join('\n');
			assert.match(output, /commit-discipline\s+ok/);
			assert.match(output, /codegraph\s+missing/);
		} finally {
			console.log = originalLog;
			rmSync(dir, { recursive: true, force: true });
		}
	});

	test('throws when there is no workspace to check', async () => {
		const dir = tmpDir();
		try {
			await assert.rejects(() => doctor(dir), /No \.claude\/workspace\.yaml found/);
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});
});

describe('addSkills / removeSkills', () => {
	test('add installs a new skill and records it; remove uninstalls and drops it', async () => {
		const dir = tmpDir();
		try {
			await init('oss-contribution', dir, {});

			await addSkills(dir, ['spike']);
			assert.ok(existsSync(path.join(dir, '.claude', 'skills', 'spike', 'SKILL.md')));
			let workspaceYaml = await fs.readFile(path.join(dir, '.claude', 'workspace.yaml'), 'utf8');
			assert.match(workspaceYaml, /skills:\s*\n\s*- spike/);

			await removeSkills(dir, ['spike']);
			assert.equal(existsSync(path.join(dir, '.claude', 'skills', 'spike')), false);
			workspaceYaml = await fs.readFile(path.join(dir, '.claude', 'workspace.yaml'), 'utf8');
			assert.doesNotMatch(workspaceYaml, /spike/);
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	test('add skips a name already present in the workspace', async () => {
		const dir = tmpDir();
		try {
			await init('oss-contribution', dir, {});
			await addSkills(dir, ['commit-discipline']);
			const workspaceYaml = await fs.readFile(path.join(dir, '.claude', 'workspace.yaml'), 'utf8');
			const occurrences = workspaceYaml.split('commit-discipline').length - 1;
			assert.equal(occurrences, 1);
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	test('remove warns but does not throw for a name not in the workspace', async () => {
		const dir = tmpDir();
		try {
			await init('oss-contribution', dir, {});
			await removeSkills(dir, ['not-installed']);
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	test('remove drops the removed name\'s own paths from hide.yaml too, keeping .claude/CLAUDE.md', async () => {
		const dir = tmpDir();
		try {
			// codegraph is core in oss-contribution, and declares "creates: [.codegraph]"
			// in its own SKILL.md frontmatter — seeded into hide.yaml by "init".
			await init('oss-contribution', dir, {});
			let paths = await readHideConfig(dir);
			assert.ok(paths.includes('.codegraph'));

			await removeSkills(dir, ['codegraph']);

			paths = await readHideConfig(dir);
			assert.ok(!paths.includes('.codegraph'));
			assert.ok(paths.includes('.claude'));
			assert.ok(paths.includes('CLAUDE.md'));
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});
});
