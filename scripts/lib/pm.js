// Figuring out which package manager (if any) is responsible for a globally
// installed copy of this CLI, and whether this run is a throwaway one
// (npx/dlx) with no global copy to update at all — used only by the
// `update` command.

/**
 * Update commands for every package manager that can install an npm-
 * registry package globally. `npx`/`dlx`/`bunx` don't need updating (they
 * always fetch latest), so only the "install globally" managers matter here.
 */
export const PACKAGE_MANAGER_UPDATE_COMMANDS = {
	npm: { command: 'npm', args: ['install', '-g', 'claude-workspace@latest'] },
	pnpm: { command: 'pnpm', args: ['add', '-g', 'claude-workspace@latest'] },
	yarn: { command: 'yarn', args: ['global', 'add', 'claude-workspace@latest'] },
	bun: { command: 'bun', args: ['add', '-g', 'claude-workspace@latest'] },
};

/**
 * Best-effort guess at which package manager manages a globally-installed
 * binary, from the real (symlink-resolved) path of the running script —
 * each manager's global install directory has a recognizable fragment in
 * it. Falls back to npm, since Node always ships it and it's the most
 * common case.
 */
export function detectPackageManager(realScriptPath) {
	const normalized = realScriptPath.replace(/\\/g, '/').toLowerCase();
	if (normalized.includes('/pnpm/')) return 'pnpm';
	if (normalized.includes('/.bun/')) return 'bun';
	if (normalized.includes('/yarn/')) return 'yarn';
	return 'npm';
}

/**
 * True when this process was launched via a throwaway runner (npm's
 * npx / `npm exec`, or an equivalent dlx run from pnpm/yarn) rather than a
 * persistent global install. In that case there is no global copy to
 * update — `npm install -g` would "succeed" but only leave behind an
 * unwanted global install the user never asked for, since the next `npx`
 * run always re-fetches latest regardless.
 *
 * `npm_command === 'exec'` is set by npm itself for both `npx` and
 * `npm exec` (npm 7+) and is the reliable signal; the path fragment check
 * is a best-effort fallback for pnpm/yarn dlx, whose cache directories are
 * named accordingly. Not exhaustive (e.g. bunx has no equivalent public
 * signal at the time of writing) — worst case for an undetected runner is
 * the previous behavior, not a regression.
 */
export function isEphemeralRun(realScriptPath) {
	if (process.env.npm_command === 'exec') return true;
	const normalized = realScriptPath.replace(/\\/g, '/').toLowerCase();
	return normalized.includes('_npx/') || normalized.includes('/dlx/');
}
