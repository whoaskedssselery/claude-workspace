// Running an external command (npx, npm, a tool's own installer) so its
// progress is actually visible and it can't hang forever — used by every
// call site that shells out to something network-dependent (installing an
// external tool, fetching a remote skill, updating the package itself).
//
// Three things every one of those call sites got wrong before this
// existed, found one at a time by actually reproducing the hang instead of
// guessing:
//  1. child_process.execFile always pipes stdout/stderr into an in-memory
//     buffer that's only surfaced after the process exits — its `stdio`
//     option is silently ignored (that's a spawn()-only option), so
//     setting it on execFile does nothing. A slow npm/npx download (cold
//     cache, slow registry) looked exactly like a frozen terminal.
//  2. Switching to spawn() with stdio: 'inherit' fixes that, but...
//  3. spawn()'s own built-in `timeout` option does not reliably kill a
//     `shell: true` process tree on Windows — sending SIGTERM to the
//     cmd.exe wrapper doesn't cascade to the actual node/npm/npx process
//     it launched, so the child keeps running as an orphan and the
//     promise never settles. Confirmed by watching a supposedly-timed-out
//     test hang for minutes until the orphaned process was killed by PID
//     by hand. Needs an explicit process-tree kill: `taskkill /T /F` on
//     Windows, a killed process group (via `detached: true` +
//     `process.kill(-pid)`) elsewhere.

import { spawn, spawnSync } from 'node:child_process';

/** Generous but finite — real installs can be slow (cold npx cache, first-time download), but should not hang forever. */
export const DEFAULT_TIMEOUT_MS = 3 * 60 * 1000;

function killTree(child) {
	if (process.platform === 'win32') {
		spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F']);
	} else {
		try {
			process.kill(-child.pid, 'SIGKILL'); // negative pid: the whole process group `detached: true` put it in
		} catch {
			try {
				child.kill('SIGKILL');
			} catch {
				// already gone
			}
		}
	}
}

/**
 * Runs a command with its output streamed straight to this process's
 * stdout/stderr (so the user sees real progress, not silence) and a
 * timeout so a stalled network call fails with a clear message instead of
 * hanging indefinitely — the timeout is enforced by explicitly killing the
 * whole process tree (see killTree above), not spawn()'s own `timeout`
 * option, which doesn't reliably do that on Windows.
 */
export function runVisible(command, args, { cwd, timeout = DEFAULT_TIMEOUT_MS } = {}) {
	return new Promise((resolve, reject) => {
		const child = spawn(command, args, {
			cwd,
			// Windows only: resolves npx/npm's .cmd shims, which CreateProcess can't
			// launch directly. On POSIX this is unnecessary *and* unsafe — shell:
			// true with an args array joins them into one string with no escaping,
			// so any shell metacharacter in an arg (a "(" in a test command, a ";"
			// in a user-supplied URL) gets interpreted by /bin/sh instead of passed
			// through literally.
			shell: process.platform === 'win32',
			stdio: 'inherit',
			detached: process.platform !== 'win32',
		});

		let timedOut = false;
		const timer = setTimeout(() => {
			timedOut = true;
			killTree(child);
		}, timeout);
		timer.unref?.();

		child.on('error', (error) => {
			clearTimeout(timer);
			reject(error);
		});

		child.on('close', (code) => {
			clearTimeout(timer);
			if (timedOut) {
				reject(
					new Error(
						`timed out after ${Math.round(timeout / 1000)}s waiting for "${command} ${args.join(' ')}" — check your network connection and try again`
					)
				);
				return;
			}
			if (code !== 0) {
				reject(new Error(`Command failed with exit code ${code}: ${command} ${args.join(' ')}`));
				return;
			}
			resolve();
		});
	});
}
