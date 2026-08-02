import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { moveCursor, toggleAt, flattenGroups } from '../scripts/lib/prompt.js';
import { t, presetHint, supportedLanguages } from '../scripts/lib/i18n.js';

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
});
