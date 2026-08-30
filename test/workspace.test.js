import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Must be set before workspace.js (and its static import of lib/i18n.js) is
// ever loaded in this process, so GLOBAL_DIR — and therefore hide/unhide's
// hiddenDir(), which now lives under it rather than inside the project —
// points at a throwaway directory instead of the real ~/.claude-workspace.
const fakeHome = mkdtempSync(path.join(os.tmpdir(), 'claude-workspace-test-home-'));
process.env.CLAUDE_WORKSPACE_HOME = fakeHome;

const {
	parseSimpleYaml,
	renderYamlList,
	renderSkillList,
	editDistance,
	suggestName,
	extractDescription,
	extractCreates,
	resolveCreatedPaths,
	truncate,
	copySkill,
	REMOTE_SKILLS,
	EXTERNAL_TOOLS,
	namesInDomain,
	loadPreset,
	projectPresetsDir,
	init,
	installPreset,
	writeClaudeMd,
	writeWorkspaceManifest,
	encodeRemoteList,
	decodeRemoteList,
	addSkills,
	packageVersion,
	fetchLatestVersion,
	sync,
	doctor,
	hide,
	unhide,
	hiddenDir,
	projectHideConfigPath,
	readHideConfig,
	detectPackageManager,
	isEphemeralRun,
	isSafeName,
	SKILLS_DIR,
} = await import('../scripts/workspace.js');

after(() => {
	rmSync(fakeHome, { recursive: true, force: true });
});

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

describe('renderYamlList', () => {
	test('renders an empty list as inline []', () => {
		assert.equal(renderYamlList([]), '  []');
	});

	test('renders a non-empty list as dashed items', () => {
		assert.equal(renderYamlList(['a', 'b']), '  - a\n  - b');
	});
});

describe('renderSkillList', () => {
	test('falls back to a placeholder when empty', async () => {
		assert.equal(await renderSkillList([], '/does/not/exist'), '_none installed_');
	});

	test('renders a bare name (no bold, no description) when no SKILL.md is found and it is not a known external tool', async () => {
		assert.equal(await renderSkillList(['not-installed'], '/does/not/exist'), '- **not-installed**');
	});

	test('reads the description from the skill actually installed at skillsDestDir', async () => {
		const dir = tmpDir();
		try {
			await fs.mkdir(path.join(dir, 'demo-skill'), { recursive: true });
			await fs.writeFile(
				path.join(dir, 'demo-skill', 'SKILL.md'),
				'---\nname: demo-skill\ndescription: Does the demo thing.\n---\n\n# Demo\n',
				'utf8'
			);
			assert.equal(await renderSkillList(['demo-skill'], dir), '- **demo-skill** — Does the demo thing.');
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	test('falls back to the URL for a known external tool with no SKILL.md', async () => {
		const line = await renderSkillList(['impeccable'], '/does/not/exist');
		assert.match(line, /^- \*\*impeccable\*\* — Separate tool, own installer — https:\/\/github\.com\/pbakaus\/impeccable$/);
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

describe('extractCreates', () => {
	test('reads a creates: list from frontmatter', () => {
		const md = `---\nname: foo\ndescription: bar\ncreates:\n  - .foo\n  - some/nested/dir\n---\n\n# Foo\n`;
		assert.deepEqual(extractCreates(md), ['.foo', 'some/nested/dir']);
	});

	test('returns an empty array when there is no creates: key', () => {
		const md = `---\nname: foo\ndescription: bar\n---\n\n# Foo\n`;
		assert.deepEqual(extractCreates(md), []);
	});

	test('returns an empty array when there is no frontmatter', () => {
		assert.deepEqual(extractCreates('# Just a heading\n'), []);
	});
});

describe('resolveCreatedPaths', () => {
	test('reads an external tool\'s own creates list', async () => {
		assert.deepEqual(await resolveCreatedPaths('impeccable'), ['.impeccable']);
	});

	test('reads a REMOTE_SKILLS catalog entry\'s own creates list', async () => {
		assert.deepEqual(await resolveCreatedPaths('feature-forge'), ['specs']);
	});

	test('reads a vendored core skill\'s own frontmatter creates list', async () => {
		assert.deepEqual(await resolveCreatedPaths('codegraph'), ['.codegraph']);
	});

	test('returns an empty array for a name with nothing declared', async () => {
		assert.deepEqual(await resolveCreatedPaths('commit-discipline'), []);
	});

	test('returns an empty array for an unknown name', async () => {
		assert.deepEqual(await resolveCreatedPaths('not-a-real-name'), []);
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

describe('copySkill', () => {
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

	test('copies a real format-variant skill directory', async () => {
		const ok = await copySkill('formats', 'spike', dest);
		assert.equal(ok, true);
		assert.ok(existsSync(path.join(dest, 'spike', 'SKILL.md')));
	});
});

// Domain skills (frontend, backend, design, ...) are no longer vendored in
// this repo — they're fetched on demand from their author's own source repo
// (see remote.js's fetchRemoteSkill), so there's nothing local left to copy.
// These tests cover the catalog data that drives that fetch instead.
describe('REMOTE_SKILLS / EXTERNAL_TOOLS / namesInDomain', () => {
	test('every remote skill entry has a domain, a source repo and a description', () => {
		for (const [name, entry] of Object.entries(REMOTE_SKILLS)) {
			assert.ok(entry.domain, `${name} missing domain`);
			assert.ok(entry.source, `${name} missing source`);
			assert.ok(entry.skillName, `${name} missing skillName`);
			assert.ok(entry.description, `${name} missing description`);
		}
	});

	test('every external tool now carries a domain for catalog grouping', () => {
		for (const [name, tool] of Object.entries(EXTERNAL_TOOLS)) {
			assert.ok(tool.domain, `${name} missing domain`);
		}
	});

	test('namesInDomain merges remote skills and external tools sharing a domain', () => {
		const design = namesInDomain('design');
		assert.ok(design.includes('claude-design'));
		assert.ok(design.includes('taste'));
		assert.ok(design.includes('ui-ux-pro-max'));
		assert.ok(design.includes('impeccable'));
	});

	test('namesInDomain returns an empty array for an unknown domain', () => {
		assert.deepEqual(namesInDomain('not-a-real-domain'), []);
	});
});

describe('loadPreset', () => {
	test('loads a real preset', async () => {
		const preset = await loadPreset('oss-contribution');
		assert.equal(preset.name, 'oss-contribution');
	});

	test('debug preset uses debug-mode, commit-discipline and codegraph', async () => {
		const preset = await loadPreset('debug');
		assert.deepEqual(preset.core, ['debug-mode', 'commit-discipline', 'codegraph']);
	});

	test('throws a helpful error for an unknown preset', async () => {
		await assert.rejects(() => loadPreset('does-not-exist'), /Preset "does-not-exist" not found/);
	});

	test('rejects a path-traversal preset name instead of resolving it', async () => {
		await assert.rejects(() => loadPreset('../../etc/passwd'), /Invalid preset name/);
	});
});

describe('isSafeName', () => {
	test('accepts kebab-case, dots and underscores', () => {
		assert.ok(isSafeName('react-best-practices'));
		assert.ok(isSafeName('my_custom.v2'));
	});

	test('rejects anything that could escape a joined directory', () => {
		assert.equal(isSafeName('../escape'), false);
		assert.equal(isSafeName('a/b'), false);
		assert.equal(isSafeName('a\\b'), false);
		assert.equal(isSafeName('.hidden'), false);
		assert.equal(isSafeName(''), false);
	});
});

describe('detectPackageManager', () => {
	test('detects pnpm from a pnpm global-store-style path', () => {
		assert.equal(
			detectPackageManager('/home/user/.local/share/pnpm/global/5/node_modules/claude-workspace/scripts/workspace.js'),
			'pnpm'
		);
	});

	test('detects bun from a bun global-install-style path', () => {
		assert.equal(
			detectPackageManager('/home/user/.bun/install/global/node_modules/claude-workspace/scripts/workspace.js'),
			'bun'
		);
	});

	test('detects yarn from a yarn global-style path', () => {
		assert.equal(
			detectPackageManager('/home/user/.config/yarn/global/node_modules/claude-workspace/scripts/workspace.js'),
			'yarn'
		);
	});

	test('defaults to npm for a typical npm global path', () => {
		assert.equal(
			detectPackageManager('/usr/local/lib/node_modules/claude-workspace/scripts/workspace.js'),
			'npm'
		);
	});

	test('is case-insensitive and normalizes Windows-style backslashes', () => {
		assert.equal(
			detectPackageManager('C:\\Users\\me\\AppData\\Local\\pnpm\\global\\5\\node_modules\\claude-workspace\\scripts\\workspace.js'),
			'pnpm'
		);
	});
});

describe('isEphemeralRun', () => {
	const originalNpmCommand = process.env.npm_command;
	after(() => {
		if (originalNpmCommand === undefined) delete process.env.npm_command;
		else process.env.npm_command = originalNpmCommand;
	});

	test('true when npm set npm_command=exec (npx / npm exec)', () => {
		process.env.npm_command = 'exec';
		assert.equal(isEphemeralRun('/usr/local/lib/node_modules/claude-workspace/scripts/workspace.js'), true);
		delete process.env.npm_command;
	});

	test('true for an npm npx cache path even without the env var', () => {
		assert.equal(isEphemeralRun('/home/user/.npm/_npx/abc123/node_modules/claude-workspace/scripts/workspace.js'), true);
	});

	test('true for a pnpm dlx cache path', () => {
		assert.equal(isEphemeralRun('/home/user/.local/share/pnpm/dlx/abc123/node_modules/claude-workspace/scripts/workspace.js'), true);
	});

	test('false for a regular global npm install', () => {
		delete process.env.npm_command;
		assert.equal(isEphemeralRun('/usr/local/lib/node_modules/claude-workspace/scripts/workspace.js'), false);
	});
});

// looksLikeSkillSource itself is covered in test/remote.test.js, alongside
// the rest of remote.js.

describe('encodeRemoteList / decodeRemoteList', () => {
	test('round-trips name/source pairs through the flat yaml-list shape', () => {
		const remote = [
			{ name: 'web-design-guidelines', source: 'vercel-labs/agent-skills' },
			{ name: 'foo', source: 'https://github.com/a/b' },
		];
		const decoded = decodeRemoteList(encodeRemoteList(remote));
		assert.deepEqual(decoded, remote);
	});

	test('decodeRemoteList tolerates undefined (no remote: section yet)', () => {
		assert.deepEqual(decodeRemoteList(undefined), []);
	});
});

describe('projectPresetsDir + loadPreset project scope', () => {
	test('loadPreset finds a preset committed to <project>/.claude-workspace/presets/', async () => {
		const dir = tmpDir();
		try {
			const presetsDir = projectPresetsDir(dir);
			await fs.mkdir(presetsDir, { recursive: true });
			await fs.writeFile(
				path.join(presetsDir, 'team-preset.yaml'),
				'name: team-preset\n\ncore:\n  - commit-discipline\n\nskills: []\n',
				'utf8'
			);

			const preset = await loadPreset('team-preset', dir);
			assert.deepEqual(preset.core, ['commit-discipline']);
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	test('a built-in preset name always wins over a project-local one', async () => {
		const dir = tmpDir();
		try {
			const presetsDir = projectPresetsDir(dir);
			await fs.mkdir(presetsDir, { recursive: true });
			await fs.writeFile(path.join(presetsDir, 'project.yaml'), 'name: project\n\ncore:\n  - codegraph\n\nskills: []\n', 'utf8');

			const preset = await loadPreset('project', dir);
			assert.notDeepEqual(preset.core, ['codegraph']);
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});
});

describe('writeClaudeMd', () => {
	test('writes a fresh file with markers when none exists', async () => {
		const dir = tmpDir();
		try {
			const result = await writeClaudeMd(dir, 'project', ['health-review'], ['api-designer']);
			assert.equal(result, 'written');
			const content = await fs.readFile(path.join(dir, 'CLAUDE.md'), 'utf8');
			assert.ok(content.includes('<!-- claude-workspace:start -->'));
			assert.ok(content.includes('health-review'));
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	test('updates only the marked block, preserving hand-written content around it', async () => {
		const dir = tmpDir();
		try {
			await writeClaudeMd(dir, 'project', ['health-review'], []);
			const claudeMdPath = path.join(dir, 'CLAUDE.md');
			const original = await fs.readFile(claudeMdPath, 'utf8');
			await fs.writeFile(claudeMdPath, original + '\n## My own notes\n\nDo not touch this.\n', 'utf8');

			const result = await writeClaudeMd(dir, 'project', ['health-review', 'commit-discipline'], []);
			assert.equal(result, 'updated');
			const updated = await fs.readFile(claudeMdPath, 'utf8');
			assert.ok(updated.includes('commit-discipline'));
			assert.ok(updated.includes('## My own notes'));
			assert.ok(updated.includes('Do not touch this.'));
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	test('a hand-written CLAUDE.md with no markers is left untouched without --force', async () => {
		const dir = tmpDir();
		try {
			await fs.writeFile(path.join(dir, 'CLAUDE.md'), 'hand-written, no markers\n', 'utf8');
			const result = await writeClaudeMd(dir, 'project', [], []);
			assert.equal(result, 'skipped');
			const content = await fs.readFile(path.join(dir, 'CLAUDE.md'), 'utf8');
			assert.equal(content, 'hand-written, no markers\n');
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	test('force appends the block to a marker-less file instead of overwriting it', async () => {
		const dir = tmpDir();
		try {
			await fs.writeFile(path.join(dir, 'CLAUDE.md'), 'hand-written, no markers\n', 'utf8');
			const result = await writeClaudeMd(dir, 'project', ['health-review'], [], { force: true });
			assert.equal(result, 'appended');
			const content = await fs.readFile(path.join(dir, 'CLAUDE.md'), 'utf8');
			assert.ok(content.includes('hand-written, no markers'));
			assert.ok(content.includes('<!-- claude-workspace:start -->'));
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});
});

describe('fetchLatestVersion', () => {
	// The property that actually matters after the runVisible hang bug: this
	// must NEVER hang the command that calls it, no matter what the network
	// does. Forces the failure path with an unroutable address (RFC 5737
	// TEST-NET-1 — guaranteed to black-hole, never a real response) instead
	// of trusting a plain timeout number to mean anything on its own.
	test('resolves null (not a hang, not a throw) when the request never gets a response', async () => {
		const start = Date.now();
		const result = await fetchLatestVersion({ url: 'https://192.0.2.1/', timeout: 300 });
		assert.equal(result, null);
		assert.ok(Date.now() - start < 5000, 'did not hang waiting on an unroutable host');
	});

	test('resolves null for a malformed URL instead of throwing', async () => {
		const result = await fetchLatestVersion({ url: 'not a url', timeout: 300 });
		assert.equal(result, null);
	});
});

describe('toolVersion tracking', () => {
	test('init records the running package version in workspace.yaml', async () => {
		const dir = tmpDir();
		try {
			await init('oss-contribution', dir, {});
			const workspaceYaml = await fs.readFile(path.join(dir, '.claude', 'workspace.yaml'), 'utf8');
			const version = await packageVersion();
			assert.ok(workspaceYaml.includes(`toolVersion: ${version}`));
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	test('doctor reports a match when the recorded version equals the running one', async () => {
		const dir = tmpDir();
		const originalLog = console.log;
		const lines = [];
		try {
			await init('oss-contribution', dir, {});
			console.log = (msg) => lines.push(String(msg));
			await doctor(dir);
		} finally {
			console.log = originalLog;
			rmSync(dir, { recursive: true, force: true });
		}
		assert.ok(lines.some((l) => l.includes('matches what you')));
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
			// Nothing claude-workspace adds is gitignored — "hide" is how you keep
			// it out of a commit, not a permanent exclusion.
			assert.equal(existsSync(path.join(dir, '.gitignore')), false);
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	test('installs the debug preset end-to-end', async () => {
		const dir = tmpDir();
		try {
			await init('debug', dir, {});
			assert.ok(existsSync(path.join(dir, '.claude', 'skills', 'debug-mode', 'SKILL.md')));
			const workspaceYaml = await fs.readFile(path.join(dir, '.claude', 'workspace.yaml'), 'utf8');
			assert.ok(workspaceYaml.includes('preset: debug'));
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

	test('--with= pulls in a format variant not listed by the preset', async () => {
		const dir = tmpDir();
		try {
			await init('project', dir, { withNames: ['spike'] });
			assert.ok(existsSync(path.join(dir, '.claude', 'skills', 'spike', 'SKILL.md')));
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	test('external tools are not installed without --with-external or a matching --with=', async () => {
		const dir = tmpDir();
		try {
			// A hand-built preset with only an external tool in `skills:` (no
			// REMOTE_SKILLS entry) — avoids installPreset also trying to fetch
			// react-best-practices over the network, the way the "redesign"
			// built-in preset would, for a test that isn't about remote fetches.
			await installPreset({ core: [], skills: ['taste'] }, 'external-only-test', dir, {});
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
			workspaceYaml = workspaceYaml.replace('skills:\n  []', 'skills:\n  - spike');
			await fs.writeFile(workspacePath, workspaceYaml, 'utf8');

			await sync(dir);

			assert.ok(existsSync(path.join(dir, '.claude', 'skills', 'spike', 'SKILL.md')));
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

describe('addSkills', () => {
	test('skips a remote source already recorded under an equivalent spelling, without touching the network', async () => {
		// Real bug: "add https://github.com/x/y.git" recorded "y", then later
		// "add https://github.com/x/y" (no .git) re-ran the whole fetch instead
		// of recognizing it as the same source and skipping — this asserts the
		// second call never gets past the pre-check by using a source that
		// would error immediately if fetchRemoteSkill were actually invoked
		// (no "skills" package reachable/relevant here), and confirming the
		// workspace.yaml's remote: list is untouched either way.
		const dir = tmpDir();
		const originalWarn = console.warn;
		const warnings = [];
		console.warn = (msg) => warnings.push(String(msg));
		try {
			await writeWorkspaceManifest(dir, 'project', ['commit-discipline'], [], [], [
				{ name: 'writing-plans', source: 'https://github.com/obra/superpowers.git' },
			]);
			await addSkills(dir, ['https://github.com/obra/superpowers']);

			assert.ok(
				warnings.some((w) => w.includes('already added from an equivalent source')),
				'skipped via the pre-check, not by attempting (and failing) a real fetch'
			);
			const workspaceYaml = await fs.readFile(path.join(dir, '.claude', 'workspace.yaml'), 'utf8');
			assert.equal(workspaceYaml.match(/writing-plans=/g)?.length, 1, 'not duplicated');
		} finally {
			console.warn = originalWarn;
			rmSync(dir, { recursive: true, force: true });
		}
	});
});

describe('hide / unhide', () => {
	test('init seeds hide.yaml with .claude and CLAUDE.md by default, no separate .claude/skills/ or workspace.yaml entries', async () => {
		const dir = tmpDir();
		try {
			await init('oss-contribution', dir, {});
			const paths = await readHideConfig(dir);
			assert.ok(paths.includes('.claude'));
			assert.ok(paths.includes('CLAUDE.md'));
			assert.ok(!paths.some((p) => p.includes('skills')));
			assert.ok(!paths.some((p) => p.includes('workspace.yaml')));
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	test('hide moves the whole .claude/ and CLAUDE.md into the stash, leaving no trace in the project', async () => {
		const dir = tmpDir();
		try {
			await init('oss-contribution', dir, {});
			await hide(dir);

			assert.equal(existsSync(path.join(dir, '.claude')), false);
			assert.equal(existsSync(path.join(dir, 'CLAUDE.md')), false);
			// hide.yaml lives inside .claude/, so sweeping .claude as a whole
			// takes it along too — nothing at all is left in the project root,
			// so an IDE's project tree (or `git status`) shows nothing extra.
			assert.equal(existsSync(path.join(dir, '.claude-workspace')), false);
			assert.equal(existsSync(path.join(hiddenDir(dir), 'extra', 'custom__.claude', 'skills', 'commit-discipline')), true);
			assert.equal(existsSync(path.join(hiddenDir(dir), 'extra', 'custom__.claude', 'workspace.yaml')), true);
			assert.equal(existsSync(path.join(hiddenDir(dir), 'extra', 'custom__.claude', 'hide.yaml')), true);
			assert.equal(existsSync(path.join(hiddenDir(dir), 'extra', 'custom__CLAUDE.md')), true);
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	test('unhide restores everything exactly as it was before hide', async () => {
		const dir = tmpDir();
		try {
			await init('oss-contribution', dir, {});
			const workspaceYamlBefore = await fs.readFile(path.join(dir, '.claude', 'workspace.yaml'), 'utf8');
			const claudeMdBefore = await fs.readFile(path.join(dir, 'CLAUDE.md'), 'utf8');

			await hide(dir);
			await unhide(dir);

			assert.equal(existsSync(hiddenDir(dir)), false);
			assert.ok(existsSync(path.join(dir, '.claude', 'skills', 'commit-discipline', 'SKILL.md')));
			const workspaceYamlAfter = await fs.readFile(path.join(dir, '.claude', 'workspace.yaml'), 'utf8');
			const claudeMdAfter = await fs.readFile(path.join(dir, 'CLAUDE.md'), 'utf8');
			assert.equal(workspaceYamlAfter, workspaceYamlBefore);
			assert.equal(claudeMdAfter, claudeMdBefore);
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	test('hide sweeps up a currently-installed name\'s own extra paths (codegraph is core, seeded into hide.yaml at init time), and unhide puts them back', async () => {
		const dir = tmpDir();
		try {
			// codegraph is part of oss-contribution's core: list already —
			// its .codegraph/ folder (declared in its own SKILL.md frontmatter)
			// was written into hide.yaml by "init" itself, no manual entry needed.
			await init('oss-contribution', dir, {});
			await fs.mkdir(path.join(dir, '.codegraph'), { recursive: true });
			await fs.writeFile(path.join(dir, '.codegraph', 'index.db'), 'fake-index', 'utf8');

			await hide(dir);
			assert.equal(existsSync(path.join(dir, '.codegraph')), false);
			assert.equal(existsSync(path.join(hiddenDir(dir), 'extra', 'custom__.codegraph', 'index.db')), true);

			await unhide(dir);
			assert.equal(existsSync(path.join(dir, '.codegraph', 'index.db')), true);
			assert.equal(existsSync(hiddenDir(dir)), false);
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	test('sync re-seeds hide.yaml from a recorded external tool\'s catalog entry, and hide sweeps it up', async () => {
		const dir = tmpDir();
		try {
			await init('oss-contribution', dir, {});
			await fs.mkdir(path.join(dir, '.impeccable'), { recursive: true });
			await fs.writeFile(path.join(dir, '.impeccable', 'config.json'), '{}', 'utf8');
			const workspacePath = path.join(dir, '.claude', 'workspace.yaml');
			let workspaceYaml = await fs.readFile(workspacePath, 'utf8');
			workspaceYaml = workspaceYaml.replace('external:\n  []', 'external:\n  - impeccable');
			await fs.writeFile(workspacePath, workspaceYaml, 'utf8');
			// installExternalTool never ran for "impeccable" here — workspace.yaml
			// was edited by hand — so hide.yaml doesn't know about .impeccable/
			// yet; sync re-derives it from EXTERNAL_TOOLS' `creates:` for every
			// name workspace.yaml currently records.
			await sync(dir);

			await hide(dir);
			assert.equal(existsSync(path.join(dir, '.impeccable')), false);
			assert.equal(existsSync(path.join(hiddenDir(dir), 'extra', 'custom__.impeccable', 'config.json')), true);

			await unhide(dir);
			assert.equal(existsSync(path.join(dir, '.impeccable', 'config.json')), true);
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	test('hide leaves a folder alone when nothing recorded it into hide.yaml', async () => {
		// Scoped to what's actually listed in hide.yaml: a tool set up by hand,
		// bypassing claude-workspace entirely (never installed, never synced),
		// is out of scope by design — nothing ever wrote its path there.
		const dir = tmpDir();
		try {
			await init('oss-contribution', dir, {});
			await fs.mkdir(path.join(dir, '.impeccable'), { recursive: true });

			await hide(dir);
			assert.equal(existsSync(path.join(dir, '.impeccable')), true);
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	test('hide sweeps up paths listed in .claude/hide.yaml even though nothing recorded them, and unhide puts them back', async () => {
		const dir = tmpDir();
		try {
			await init('oss-contribution', dir, {});
			await fs.mkdir(path.join(dir, 'notes'), { recursive: true });
			await fs.writeFile(path.join(dir, 'notes', 'secret.md'), 'shh', 'utf8');
			await fs.writeFile(path.join(dir, '.env.local'), 'SECRET=1', 'utf8');
			const existingPaths = await readHideConfig(dir);
			await fs.writeFile(
				projectHideConfigPath(dir),
				`paths:\n${[...existingPaths, 'notes', '.env.local'].map((p) => `  - ${p}`).join('\n')}\n`,
				'utf8'
			);

			await hide(dir);
			assert.equal(existsSync(path.join(dir, 'notes')), false);
			assert.equal(existsSync(path.join(dir, '.env.local')), false);
			assert.equal(existsSync(path.join(hiddenDir(dir), 'extra', 'custom__notes', 'secret.md')), true);
			assert.equal(existsSync(path.join(hiddenDir(dir), 'extra', 'custom__.env.local')), true);

			await unhide(dir);
			assert.equal(existsSync(path.join(dir, 'notes', 'secret.md')), true);
			assert.equal(existsSync(path.join(dir, '.env.local')), true);
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	test('hide.yaml entries that try to escape the project are ignored with a warning', async () => {
		const dir = tmpDir();
		const originalWarn = console.warn;
		const warnings = [];
		console.warn = (...args) => warnings.push(args.join(' '));
		try {
			await init('oss-contribution', dir, {});
			await fs.writeFile(projectHideConfigPath(dir), 'paths:\n  - ../outside\n  - /etc/passwd\n', 'utf8');

			const paths = await readHideConfig(dir);
			assert.deepEqual(paths, []);
			assert.ok(warnings.some((w) => w.includes('../outside')));
			assert.ok(warnings.some((w) => w.includes('/etc/passwd')));
		} finally {
			console.warn = originalWarn;
			rmSync(dir, { recursive: true, force: true });
		}
	});

	test('missing hide.yaml file reads as an empty list', async () => {
		const dir = tmpDir();
		try {
			await init('oss-contribution', dir, {});
			await fs.rm(projectHideConfigPath(dir), { force: true });
			assert.deepEqual(await readHideConfig(dir), []);
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	test('hide throws when there is nothing to hide', async () => {
		const dir = tmpDir();
		try {
			await assert.rejects(() => hide(dir), /nothing to hide/);
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	test('hide throws when already hidden', async () => {
		const dir = tmpDir();
		try {
			await init('oss-contribution', dir, {});
			await hide(dir);
			await assert.rejects(() => hide(dir), /Already hidden/);
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	test('unhide throws when nothing is hidden', async () => {
		const dir = tmpDir();
		try {
			await init('oss-contribution', dir, {});
			await assert.rejects(() => unhide(dir), /Nothing hidden/);
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});
});
