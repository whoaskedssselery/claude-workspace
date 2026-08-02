import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { moveCursor, toggleAt, flattenGroups, digitIndex } from '../scripts/lib/prompt.js';
import { t, presetHint, supportedLanguages } from '../scripts/lib/i18n.js';
import { bold, dim, isColorEnabled } from '../scripts/lib/colors.js';

describe('prompt: moveCursor', () => {
	test('wraps forward past the end', () => {
		assert.equal(moveCursor(2, 1, 3), 0);
	});

	test('wraps backward past the start', () => {
		assert.equal(moveCursor(0, -1, 3), 2);
	});

	test('returns 0 for an empty list', () => {
		assert.equal(moveCursor(0, 1, 0), 0);
	});
});

describe('prompt: toggleAt', () => {
	test('adds an index not yet selected', () => {
		const result = toggleAt(new Set([1]), 2);
		assert.deepEqual([...result].sort(), [1, 2]);
	});

	test('removes an index already selected', () => {
		const result = toggleAt(new Set([1, 2]), 2);
		assert.deepEqual([...result], [1]);
	});

	test('does not mutate the input set', () => {
		const input = new Set([1]);
		toggleAt(input, 2);
		assert.deepEqual([...input], [1]);
	});
});

describe('prompt: flattenGroups', () => {
	test('keeps group headers out of the selectable item list', () => {
		const { items, renderEntries } = flattenGroups([
			{ title: 'frontend/', items: [{ label: 'a', value: 'a' }] },
			{ title: 'backend/', items: [{ label: 'b', value: 'b' }, { label: 'c', value: 'c' }] },
		]);
		assert.equal(items.length, 3);
		assert.deepEqual(items.map((i) => i.value), ['a', 'b', 'c']);
		assert.equal(renderEntries.filter((e) => e.type === 'header').length, 2);
		assert.equal(renderEntries.filter((e) => e.type === 'item').length, 3);
	});

	test('handles a group with no title', () => {
		const { renderEntries } = flattenGroups([{ items: [{ label: 'a', value: 'a' }] }]);
		assert.equal(renderEntries.filter((e) => e.type === 'header').length, 0);
	});
});

describe('prompt: digitIndex', () => {
	test('maps "1".."9" to 0-based indices', () => {
		assert.equal(digitIndex('1', 10), 0);
		assert.equal(digitIndex('9', 10), 8);
	});

	test('returns null when the digit is past the list length', () => {
		assert.equal(digitIndex('5', 3), null);
	});

	test('returns null for non-digit input', () => {
		assert.equal(digitIndex('a', 10), null);
		assert.equal(digitIndex('0', 10), null);
		assert.equal(digitIndex(undefined, 10), null);
	});
});

describe('colors', () => {
	test('wrapping is a no-op (colors disabled) outside a TTY, as in this test run', () => {
		// node --test runs with stdout piped, so process.stdout.isTTY is
		// falsy here — exactly the case colors.js is meant to detect and
		// stay plain for.
		assert.equal(isColorEnabled, false);
		assert.equal(bold('x'), 'x');
		assert.equal(dim('x'), 'x');
	});
});

describe('i18n: t', () => {
	test('returns the string for a known language/key', () => {
		assert.equal(t('en', 'yes'), 'Yes');
		assert.equal(t('ru', 'yes'), 'Да');
	});

	test('falls back to English for an unknown language', () => {
		assert.equal(t('fr', 'yes'), 'Yes');
	});

	test('interpolates {vars} into the template', () => {
		const result = t('en', 'saveGloballyYes', { name: 'my-preset' });
		assert.match(result, /my-preset/);
	});

	test('returns the raw key for an unknown key', () => {
		assert.equal(t('en', 'not-a-real-key'), 'not-a-real-key');
	});
});

describe('i18n: presetHint / supportedLanguages', () => {
	test('has a hint for every built-in preset, in every supported language', () => {
		const presets = ['learning', 'project', 'assignment', 'redesign', 'oss-contribution'];
		for (const lang of supportedLanguages()) {
			for (const preset of presets) {
				assert.ok(presetHint(lang, preset).length > 0, `${lang}/${preset}`);
			}
		}
	});

	test('supportedLanguages includes en and ru', () => {
		assert.ok(supportedLanguages().includes('en'));
		assert.ok(supportedLanguages().includes('ru'));
	});

	test('every wizard step tag resolves to a real (non-key-echo) string in both languages', () => {
		const stepKeys = [
			'stepLanguage',
			'stepPreset',
			'stepAdditionalSkills',
			'stepCustomName',
			'stepCustomSkills',
			'stepSaveGlobally',
			'stepExternalInstall',
			'stepConfirm',
		];
		for (const lang of supportedLanguages()) {
			for (const key of stepKeys) {
				assert.notEqual(t(lang, key), key, `${lang}/${key}`);
			}
		}
	});
});
