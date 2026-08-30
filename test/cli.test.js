// Integration tests through the actual CLI boundary: spawns "node
// scripts/workspace.js ..." for real, the way a user (or npx/pnpm dlx)
// actually invokes it — argv parsing, flag splitting, usage/exit-code paths
// and isEntryPoint() included. Everything in workspace.test.js calls the
// library functions directly in-process and never touches any of that; this
// file exists because that boundary is exactly where this CLI has broken
// before (a stray backtick in printHelp's template literal, isEntryPoint()
// silently no-op-ing under pnpm's symlinked bins) and library-level tests
// can't catch it.
//
// Uses only the oss-contribution preset (core-only, no remote fetches) so
// this suite makes no network calls, same convention as workspace.test.js.

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtempSync, rmSync } from 'node:fs';
import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const execFileAsync = promisify(execFile);

const CLI_PATH = fileURLToPath(new URL('../scripts/workspace.js', import.meta.url));

// Own fake home, separate from workspace.test.js's — this suite spawns real
// child processes, so isolation has to travel via env rather than a
// same-process module-level override.
const fakeHome = mkdtempSync(path.join(os.tmpdir(), 'claude-workspace-cli-test-home-'));

after(() => {
	rmSync(fakeHome, { recursive: true, force: true });
});

function tmpDir() {
	return mkdtempSync(path.join(os.tmpdir(), 'claude-workspace-cli-test-'));
}

/** Runs the real CLI as a child process. Resolves with {stdout, stderr, code: 0} on success. */
function runCli(args, { cwd = process.cwd() } = {}) {
	return execFileAsync(process.execPath, [CLI_PATH, ...args], {
		cwd,
		env: { ...process.env, CLAUDE_WORKSPACE_HOME: fakeHome },
	}).then(
		({ stdout, stderr }) => ({ stdout, stderr, code: 0 }),
		(error) => ({ stdout: error.stdout ?? '', stderr: error.stderr ?? '', code: error.code ?? 1 })
	);
}

describe('CLI boundary', () => {
	test('--help exits 0 and prints usage', async () => {
		const { code, stdout } = await runCli(['--help']);
		assert.equal(code, 0);
		assert.match(stdout, /claude-workspace — prepare a project for Claude Code/);
	});

	test('unknown command exits 1', async () => {
		const { code, stderr } = await runCli(['not-a-real-command']);
		assert.equal(code, 1);
		assert.match(stderr, /Unknown command/);
	});

	test('init <preset> <targetDir> exits 0 and writes a real workspace', async () => {
		const dir = tmpDir();
		try {
			const { code } = await runCli(['init', 'oss-contribution', dir]);
			assert.equal(code, 0);
			assert.ok(existsSync(path.join(dir, '.claude', 'workspace.yaml')));
			assert.ok(existsSync(path.join(dir, '.claude', 'skills', 'codegraph', 'SKILL.md')));
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	test('init a second time on the same directory exits 1', async () => {
		const dir = tmpDir();
		try {
			await runCli(['init', 'oss-contribution', dir]);
			const { code, stderr } = await runCli(['init', 'debug', dir]);
			assert.equal(code, 1);
			assert.match(stderr, /already initialized/);
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	test('doctor exits 0 and reports installed core skills as ok', async () => {
		const dir = tmpDir();
		try {
			await runCli(['init', 'oss-contribution', dir]);
			const { code, stdout } = await runCli(['doctor', dir]);
			assert.equal(code, 0);
			assert.match(stdout, /core\s+codegraph\s+ok/);
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	test('add with no names exits 1 and prints usage', async () => {
		const dir = tmpDir();
		try {
			await runCli(['init', 'oss-contribution', dir]);
			const { code, stderr } = await runCli(['add'], { cwd: dir });
			assert.equal(code, 1);
			assert.match(stderr, /Usage: claude-workspace add/);
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	test('hide / unhide round trip through the CLI, hiding twice in a row exits 1', async () => {
		const dir = tmpDir();
		try {
			await runCli(['init', 'oss-contribution', dir]);

			const hideResult = await runCli(['hide', dir]);
			assert.equal(hideResult.code, 0);
			assert.equal(existsSync(path.join(dir, '.claude')), false);

			const hideAgain = await runCli(['hide', dir]);
			assert.equal(hideAgain.code, 1);
			assert.match(hideAgain.stderr, /Already hidden/);

			const unhideResult = await runCli(['unhide', dir]);
			assert.equal(unhideResult.code, 0);
			assert.ok(existsSync(path.join(dir, '.claude', 'workspace.yaml')));
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	test('remove on a never-initialized directory exits 1', async () => {
		const dir = tmpDir();
		try {
			const { code, stderr } = await runCli(['remove', 'codegraph'], { cwd: dir });
			assert.equal(code, 1);
			assert.match(stderr, /run "init" first/);
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});
});
