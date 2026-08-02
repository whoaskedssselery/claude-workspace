import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { runVisible } from '../scripts/lib/proc.js';

// A real file rather than an inline `node -e "..."` string: shell: true on
// Windows joins command + args into one command-line for cmd.exe without
// re-quoting them, so an inline script containing parens/spaces (an arrow
// function, for instance) gets split into the wrong tokens — unrelated to
// runVisible itself, just how a stalling test process has to be spawned
// here to actually stall instead of failing on a syntax error.
let dir;
let stallingScript;
before(() => {
	dir = mkdtempSync(path.join(os.tmpdir(), 'claude-workspace-proc-test-'));
	stallingScript = path.join(dir, 'stall.mjs');
	writeFileSync(stallingScript, 'setInterval(function () {}, 1000);\n', 'utf8');
});
after(() => {
	rmSync(dir, { recursive: true, force: true });
});

// The original bug this guards against: execFile's `stdio` option is
// silently ignored (it's a spawn()-only option), so a "fix" that just adds
// stdio: 'inherit' to execFile does nothing — output stays buffered and
// invisible until the process exits, which is exactly why a slow npx/npm
// call looked like a frozen terminal. These tests exercise the real
// failure modes (non-zero exit, a stalled process) rather than asserting
// on captured stdout, since inherited stdio isn't capturable from here —
// the manual smoke test that caught the bug in the first place did that.
describe('runVisible', () => {
	test('resolves when the command exits 0', async () => {
		await assert.doesNotReject(() => runVisible('node', ['--version']));
	});

	test('rejects with a clear message when the command exits non-zero', async () => {
		await assert.rejects(() => runVisible('node', ['-e', 'process.exit(3)']), /exit code 3/);
	});

	test('rejects with a clear timeout message instead of hanging when the command stalls', async () => {
		await assert.rejects(() => runVisible('node', [stallingScript], { timeout: 300 }), /timed out after/);
	});
});
