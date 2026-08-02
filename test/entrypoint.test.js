import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, symlinkSync, cpSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REAL_SCRIPTS_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'scripts');

// Regression test for a real bug found testing against an actual pnpm
// global install: pnpm's global bin resolves through a symlink into its
// content-addressable store. The old entrypoint check compared
// `import.meta.url` against `pathToFileURL(process.argv[1])` with argv[1]
// left unresolved, so running the CLI through that symlink silently did
// nothing at all (no output, exit 0) instead of running main(). Confirmed
// fixed against the real pnpm install; this reproduces the same shape
// (invoking the entrypoint through a symlinked directory) without
// depending on pnpm being installed.
test('running the CLI through a symlinked directory still executes main() (not a silent no-op)', (t) => {
	const workDir = mkdtempSync(path.join(os.tmpdir(), 'claude-workspace-entrypoint-'));
	try {
		const realDir = path.join(workDir, 'real-store');
		cpSync(REAL_SCRIPTS_DIR, realDir, { recursive: true });
		// The real repo's scripts/workspace.js relies on the root
		// package.json's "type": "module" one directory up. Copying only
		// scripts/ into an unrelated temp tree loses that ancestor, so on a
		// Node version without ESM-syntax auto-detection (e.g. 18.x — this
		// repo's own oldest supported/CI-tested version) the copy gets
		// loaded as CommonJS and the "import" statements fail outright.
		writeFileSync(path.join(realDir, 'package.json'), JSON.stringify({ type: 'module' }), 'utf8');

		const packageDir = path.join(workDir, 'virtual', 'node_modules', 'claude-workspace');
		mkdirSync(packageDir, { recursive: true });
		const linkedScriptsDir = path.join(packageDir, 'scripts');

		try {
			symlinkSync(realDir, linkedScriptsDir, 'junction');
		} catch (error) {
			t.skip(`symlink/junction creation isn't permitted in this environment: ${error.message}`);
			return;
		}

		const output = execFileSync(process.execPath, [path.join(linkedScriptsDir, 'workspace.js'), '--help'], {
			encoding: 'utf8',
		});
		assert.match(output, /claude-workspace — prepare a project for Claude Code/);
	} finally {
		rmSync(workDir, { recursive: true, force: true });
	}
});
