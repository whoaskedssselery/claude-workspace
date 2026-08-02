import { test, describe, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const fakeHome = mkdtempSync(path.join(os.tmpdir(), 'claude-workspace-wizard-home-'));
process.env.CLAUDE_WORKSPACE_HOME = fakeHome;

const { buildAdditionalGroups, buildFullCatalogGroups, saveCustomPreset } = await import('../scripts/lib/wizard.js');
const { GLOBAL_PRESETS_DIR } = await import('../scripts/lib/i18n.js');

after(() => {
	rmSync(fakeHome, { recursive: true, force: true });
});

// Exercises the non-interactive data-building functions the wizard uses to
// feed the checkbox prompt — the raw-mode keyboard loop itself needs a real
// TTY and isn't something an automated test can drive meaningfully, but
// everything that decides *what* gets shown is plain async logic and is
// covered here.
describe('wizard: buildAdditionalGroups', () => {
	test('assignment-defend is offered for the assignment preset', async () => {
		const groups = await buildAdditionalGroups('en', 'assignment', []);
		const values = groups.flatMap((g) => g.items.map((i) => i.value));
		assert.ok(values.includes('assignment-defend'));
		assert.ok(!values.includes('spike'));
	});

	test('spike is offered for the project preset, not assignment-defend', async () => {
		const groups = await buildAdditionalGroups('en', 'project', []);
		const values = groups.flatMap((g) => g.items.map((i) => i.value));
		assert.ok(values.includes('spike'));
		assert.ok(!values.includes('assignment-defend'));
	});

	test('neither format variant is offered for a preset that is not relevant', async () => {
		const groups = await buildAdditionalGroups('en', 'oss-contribution', []);
		const values = groups.flatMap((g) => g.items.map((i) => i.value));
		assert.ok(!values.includes('spike'));
		assert.ok(!values.includes('assignment-defend'));
	});

	test('already-included skills are excluded from the offered list', async () => {
		const groups = await buildAdditionalGroups('en', 'redesign', ['react-best-practices', 'taste']);
		const values = groups.flatMap((g) => g.items.map((i) => i.value));
		assert.ok(!values.includes('react-best-practices'));
		assert.ok(!values.includes('taste'));
		assert.ok(values.includes('ui-ux-pro-max'));
	});

	test('every item has a non-empty hint pulled from its SKILL.md or tool URL', async () => {
		const groups = await buildAdditionalGroups('en', 'learning', []);
		const allItems = groups.flatMap((g) => g.items);
		assert.ok(allItems.length > 0);
		for (const item of allItems) {
			assert.ok(item.hint && item.hint.length > 0, item.value);
		}
	});
});

describe('wizard: buildFullCatalogGroups', () => {
	test('includes a core/ group and at least one domain group', async () => {
		const groups = await buildFullCatalogGroups('en');
		const titles = groups.map((g) => g.title);
		assert.ok(titles.includes('core/'));
		assert.ok(titles.includes('backend/'));
		assert.ok(titles.includes('frontend/'));
	});

	test('core group includes learning-guard and assignment-mode', async () => {
		const groups = await buildFullCatalogGroups('en');
		const core = groups.find((g) => g.title === 'core/');
		const values = core.items.map((i) => i.value);
		assert.ok(values.includes('learning-guard'));
		assert.ok(values.includes('assignment-mode'));
	});
});

describe('wizard: saveCustomPreset', () => {
	test('writes a preset yaml that loadPreset can read back', async () => {
		await saveCustomPreset('wizard-test-preset', ['commit-discipline', 'codegraph'], ['api-designer']);
		const file = path.join(GLOBAL_PRESETS_DIR, 'wizard-test-preset.yaml');
		assert.ok(existsSync(file));

		const { loadPreset } = await import('../scripts/workspace.js');
		const preset = await loadPreset('wizard-test-preset');
		assert.deepEqual(preset.core, ['commit-discipline', 'codegraph']);
		assert.deepEqual(preset.skills, ['api-designer']);
	});

	test('writes [] for an empty list rather than an empty block', async () => {
		await saveCustomPreset('wizard-empty-preset', [], []);
		const content = await fs.readFile(path.join(GLOBAL_PRESETS_DIR, 'wizard-empty-preset.yaml'), 'utf8');
		assert.match(content, /core:\s*\n\s*\[\]/);
		assert.match(content, /skills:\s*\n\s*\[\]/);
	});
});
