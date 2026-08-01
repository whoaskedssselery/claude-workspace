import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
	parseSimpleYaml,
	renderYamlList,
	renderMarkdownList,
	editDistance,
	suggestName,
	extractDescription,
	truncate,
	copySkill,
	copyDomainSkill,
	loadPreset,
	ensureGitignore,
	init,
	sync,
	SKILLS_DIR,
} from '../scripts/workspace.js';

function tmpDir() {
	return mkdtempSync(path.join(os.tmpdir(), 'claude-workspace-test-'));
}

describe('parseSimpleYaml', () => {
	test('parses scalars and lists, ignoring comments and blank lines', () => {
		const text = `
name: react-learning

# a comment
core:
  - learning-guard
  - teacher

skills: []
`;
		const result = parseSimpleYaml(text);
		assert.equal(result.name, 'react-learning');
		assert.deepEqual(result.core, ['learning-guard', 'teacher']);
		assert.deepEqual(result.skills, []);
	});

	test('a real preset file round-trips', async () => {
		const text = await fs.readFile(path.join(SKILLS_DIR, '..', 'presets', 'oss-contribution.yaml'), 'utf8');
		const result = parseSimpleYaml(text);
		assert.equal(result.name, 'oss-contribution');
		assert.ok(result.core.includes('commit-discipline'));
		assert.ok(result.core.includes('codegraph'));
	});
});

describe('renderYamlList / renderMarkdownList', () => {
	test('renders an empty list as inline []', () => {
		assert.equal(renderYamlList([]), '  []');
	});

	test('renders a non-empty list as dashed items', () => {
		assert.equal(renderYamlList(['a', 'b']), '  - a\n  - b');
	});

	test('markdown list falls back to a placeholder when empty', () => {
		assert.equal(renderMarkdownList([]), '_none installed_');
	});

	test('markdown list renders items as inline code', () => {
		assert.equal(renderMarkdownList(['a', 'b']), '- `a`\n- `b`');
	});
});

describe('editDistance / suggestName', () => {
	test('identical strings have distance 0', () => {
		assert.equal(editDistance('react', 'react'), 0);
	});

	test('classic kitten/sitting example is 3', () => {
		assert.equal(editDistance('kitten', 'sitting'), 3);
	});

	test('suggests the closest name for a small typo', () => {
		const known = ['api-designer', 'security-reviewer', 'database-optimizer'];
		assert.equal(suggestName('api-designr', known), 'api-designer');
		assert.equal(suggestName('databse-optimizer', known), 'database-optimizer');
	});

	test('does not suggest anything for an unrelated name', () => {
		const known = ['api-designer', 'security-reviewer'];
		assert.equal(suggestName('totally-unrelated-xyz', known), null);
	});
});

describe('extractDescription', () => {
	test('reads a single-line description', () => {
		const md = `---\nname: foo\ndescription: A short description.\n---\n\n# Foo\n`;
		assert.equal(extractDescription(md), 'A short description.');
	});

	test('reads a folded (>-) multi-line description', () => {
		const md = [
			'---',
			'name: foo',
			'description: >-',
			'  This description',
			'  spans multiple lines.',
			'license: MIT',
			'---',
			'',
			'# Foo',
		].join('\n');
		assert.equal(extractDescription(md), 'This description spans multiple lines.');
	});

	test('returns empty string when there is no frontmatter', () => {
		assert.equal(extractDescription('# Just a heading\n'), '');
	});
});

describe('truncate', () => {
	test('leaves short text untouched', () => {
		assert.equal(truncate('short', 100), 'short');
	});

	test('truncates long text with an ellipsis', () => {
		const long = 'x'.repeat(150);
		const result = truncate(long, 100);
		assert.equal(result.length, 100);
		assert.ok(result.endsWith('…'));
	});
});

describe('copySkill / copyDomainSkill', () => {
	let dest;
	before(() => {
		dest = tmpDir();
	});
	after(() => {
		rmSync(dest, { recursive: true, force: true });
	});

	test('copies a real core skill directory', async () => {
		const ok = await copySkill('core', 'commit-discipline', dest);
		assert.equal(ok, true);
		assert.ok(existsSync(path.join(dest, 'commit-discipline', 'SKILL.md')));
	});

	test('returns false for a skill that does not exist', async () => {
		const ok = await copySkill('core', 'does-not-exist', dest);
		assert.equal(ok, false);
	});

	test('copyDomainSkill finds a skill across domain folders', async () => {
		const ok = await copyDomainSkill('react-best-practices', dest);
		assert.equal(ok, true);
		assert.ok(existsSync(path.join(dest, 'react-best-practices', 'SKILL.md')));
	});

	test('copyDomainSkill returns false for an unknown name', async () => {
		const ok = await copyDomainSkill('not-a-real-skill', dest);
		assert.equal(ok, false);
	});
});

describe('loadPreset', () => {
	test('loads a real preset', async () => {
		const preset = await loadPreset('oss-contribution');
		assert.equal(preset.name, 'oss-contribution');
	});

	test('throws a helpful error for an unknown preset', async () => {
		await assert.rejects(() => loadPreset('does-not-exist'), /Preset "does-not-exist" not found/);
	});
});

describe('ensureGitignore', () => {
	let dir;
	before(() => {
		dir = tmpDir();
	});
	after(() => {
		rmSync(dir, { recursive: true, force: true });
	});

	test('creates .gitignore with the marked block when none exists', async () => {
		await ensureGitignore(dir);
		const content = await fs.readFile(path.join(dir, '.gitignore'), 'utf8');
		assert.ok(content.includes('.claude/settings.local.json'));
		assert.ok(content.includes('.DS_Store'));
	});

	test('is idempotent — running it again does not duplicate the block', async () => {
		await ensureGitignore(dir);
		const content = await fs.readFile(path.join(dir, '.gitignore'), 'utf8');
		const occurrences = content.split('.claude/settings.local.json').length - 1;
		assert.equal(occurrences, 1);
	});

	test('preserves pre-existing content in an existing .gitignore', async () => {
		const dir2 = tmpDir();
		try {
			await fs.writeFile(path.join(dir2, '.gitignore'), 'node_modules/\ndist/\n', 'utf8');
			await ensureGitignore(dir2);
			const content = await fs.readFile(path.join(dir2, '.gitignore'), 'utf8');
			assert.ok(content.includes('node_modules/'));
			assert.ok(content.includes('dist/'));
			assert.ok(content.includes('.claude/settings.local.json'));
		} finally {
			rmSync(dir2, { recursive: true, force: true });
		}
	});
});

describe('init', () => {
	test('installs a minimal preset end-to-end', async () => {
		const dir = tmpDir();
		try {
			await init('oss-contribution', dir, {});

			assert.ok(existsSync(path.join(dir, '.claude', 'skills', 'commit-discipline', 'SKILL.md')));
			assert.ok(existsSync(path.join(dir, '.claude', 'skills', 'codegraph', 'SKILL.md')));

			const workspaceYaml = await fs.readFile(path.join(dir, '.claude', 'workspace.yaml'), 'utf8');
			assert.ok(workspaceYaml.includes('preset: oss-contribution'));

			assert.ok(existsSync(path.join(dir, 'CLAUDE.md')));
			assert.ok(existsSync(path.join(dir, '.gitignore')));
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	test('does not overwrite an existing CLAUDE.md', async () => {
		const dir = tmpDir();
		try {
			await fs.writeFile(path.join(dir, 'CLAUDE.md'), 'hand-written content\n', 'utf8');
			await init('oss-contribution', dir, {});
			const content = await fs.readFile(path.join(dir, 'CLAUDE.md'), 'utf8');
			assert.equal(content, 'hand-written content\n');
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	test('--with= pulls in a domain skill not listed by the preset', async () => {
		const dir = tmpDir();
		try {
			await init('learning', dir, { withNames: ['react-best-practices'] });
			assert.ok(existsSync(path.join(dir, '.claude', 'skills', 'react-best-practices', 'SKILL.md')));
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	test('external tools are not installed without --with-external or a matching --with=', async () => {
		const dir = tmpDir();
		try {
			await init('redesign', dir, {});
			assert.equal(existsSync(path.join(dir, '.claude', 'skills', 'taste')), false);
			const workspaceYaml = await fs.readFile(path.join(dir, '.claude', 'workspace.yaml'), 'utf8');
			assert.match(workspaceYaml, /external:\s*\n\s*\[\]/);
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});
});

describe('sync', () => {
	test('refreshes skills declared in an existing workspace.yaml', async () => {
		const dir = tmpDir();
		try {
			await init('oss-contribution', dir, {});
			// Simulate a project that has since declared an extra skill by hand.
			const workspacePath = path.join(dir, '.claude', 'workspace.yaml');
			let workspaceYaml = await fs.readFile(workspacePath, 'utf8');
			workspaceYaml = workspaceYaml.replace('skills:\n  []', 'skills:\n  - api-designer');
			await fs.writeFile(workspacePath, workspaceYaml, 'utf8');

			await sync(dir);

			assert.ok(existsSync(path.join(dir, '.claude', 'skills', 'api-designer', 'SKILL.md')));
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	test('throws when there is no workspace.yaml to sync', async () => {
		const dir = tmpDir();
		try {
			await assert.rejects(() => sync(dir), /No \.claude\/workspace\.yaml found/);
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});
});
