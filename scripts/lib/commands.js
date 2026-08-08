// The actual command implementations (install/sync/doctor/add/remove/
// update/list) — orchestrates catalog.js (what this package ships),
// manifest.js (a project's installed workspace) and remote.js (fetching
// from an arbitrary repo). This is what scripts/workspace.js's CLI parsing
// calls into; kept separate so the two can be read independently — argv
// parsing here would just be noise, and none of this needs to know argv
// exists.

import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { GLOBAL_PRESETS_DIR } from './i18n.js';
import { warn } from './log.js';
import { runVisible } from './proc.js';
import {
	SKILLS_DIR,
	PRESETS_DIR,
	DOMAIN_DIRS,
	EXTERNAL_TOOLS,
	REMOTE_SKILLS,
	namesInDomain,
	isSafeName,
	loadPreset,
	listPresetNames,
	projectPresetsDir,
	copySkill,
	installExternalTool,
	listKnownNames,
	suggestName,
	describeSkill,
	truncate,
	parseSimpleYaml,
	packageVersion,
} from './catalog.js';
import {
	ensureGitignore,
	requireWorkspace,
	writeWorkspaceManifest,
	writeClaudeMd,
	decodeRemoteList,
	checkSkillStatus,
	GITIGNORE_MARKER_START,
} from './manifest.js';
import {
	looksLikeSkillSource,
	normalizeSkillSource,
	fetchRemoteSkill,
	listGlobalSkills,
	forgetGlobalSkill,
	GLOBAL_CLAUDE_SKILLS_DIR,
} from './remote.js';
import { PACKAGE_MANAGER_UPDATE_COMMANDS, detectPackageManager, isEphemeralRun } from './pm.js';

const __filename = fileURLToPath(import.meta.url);

/**
 * Does the actual install work for an already-resolved preset object —
 * shared by `init` (which loads the preset by name) and the interactive
 * wizard (which may have just built one on the fly and not saved it
 * anywhere yet, so there's no name to load).
 */
export async function installPreset(preset, presetName, targetDir, { withExternal = false, withNames = null, force = false } = {}) {
	const claudeDir = path.join(targetDir, '.claude');
	const skillsDestDir = path.join(claudeDir, 'skills');
	await fs.mkdir(skillsDestDir, { recursive: true });

	console.log(`\nInstalling preset "${presetName}" into ${targetDir}\n`);

	const installedCore = [];
	for (const name of preset.core ?? []) {
		const ok = await copySkill('core', name, skillsDestDir);
		if (ok) installedCore.push(name);
		else warn(`core skill "${name}" not found in ${SKILLS_DIR}/core — skipped`);
	}

	// --with=<names> can name ANY known skill/tool, not just ones the preset
	// already lists — that's how a generic preset like `learning` picks up a
	// specific technology (e.g. --with=react-best-practices,api-designer) at
	// init time instead of needing a dedicated preset per stack.
	const requestedNames = [...new Set([...(preset.skills ?? []), ...(withNames ?? [])])];

	const installedSkills = [];
	const installedExternal = [];
	const installedRemote = [];
	const remoteNames = new Set();
	for (const name of requestedNames) {
		// A preset's skills: list (or --with=) can name a remote source too —
		// not just this package's own catalog — so a custom preset can bundle
		// "always pull in this URL" alongside catalog skills.
		if (looksLikeSkillSource(name)) {
			if (installedRemote.some((r) => normalizeSkillSource(r.source) === normalizeSkillSource(name))) {
				warn(`"${name}" was already fetched from an equivalent source — skipped`);
				continue;
			}
			const added = await fetchRemoteSkill(targetDir, name);
			if (!added.length) {
				warn(`nothing new appeared in .claude/skills/ from "${name}" — not recorded`);
				continue;
			}
			for (const addedName of added) {
				installedRemote.push({ name: addedName, source: name });
				remoteNames.add(addedName);
			}
			continue;
		}
		const external = EXTERNAL_TOOLS[name];
		if (external) {
			const wanted = withExternal || (withNames?.includes(name) ?? false);
			if (!wanted) {
				warn(`"${name}" is a separate tool, not installed automatically. Run with --with=${name} to install it, or by hand:`);
				warn(`    ${external.manualInstall}`);
				continue;
			}
			const ok = await installExternalTool(name, external, targetDir);
			if (ok) installedExternal.push(name);
			continue;
		}
		// A format variant (spike, assignment-defend) is still vendored in this
		// repo, same as core — copied directly rather than fetched.
		if (await copySkill('formats', name, skillsDestDir)) {
			installedSkills.push(name);
			continue;
		}
		// Everything else in the catalog (frontend/backend/design/... skills) is
		// fetched on demand from its author's own repo, pinned to one skill —
		// see REMOTE_SKILLS in catalog.js and remote.js's fetchRemoteSkill.
		const catalogEntry = REMOTE_SKILLS[name];
		if (catalogEntry) {
			if (remoteNames.has(name)) {
				warn(`"${name}" was already fetched — skipped`);
				continue;
			}
			const added = await fetchRemoteSkill(targetDir, catalogEntry.source, { skill: catalogEntry.skillName });
			if (!added.length) {
				warn(`nothing new appeared in .claude/skills/ from "${name}" (${catalogEntry.source}) — not recorded`);
				continue;
			}
			for (const addedName of added) {
				installedRemote.push({ name: addedName, source: catalogEntry.source });
				remoteNames.add(addedName);
			}
			continue;
		}
		const suggestion = suggestName(name, await listKnownNames());
		warn(`"${name}" isn't a known skill or external tool — skipped` + (suggestion ? ` (did you mean "${suggestion}"?)` : ''));
	}

	await writeWorkspaceManifest(targetDir, presetName, installedCore, installedSkills, installedExternal, installedRemote);
	const claudeMdResult = await writeClaudeMd(
		targetDir,
		presetName,
		installedCore,
		[...installedSkills, ...installedExternal, ...installedRemote.map((r) => r.name)],
		{ force }
	);

	await ensureGitignore(targetDir);

	console.log(`\nDone.`);
	console.log(`  .claude/skills/  (${installedCore.length + installedSkills.length + installedRemote.length} skill file(s))`);
	console.log(`  external tools installed: ${installedExternal.length ? installedExternal.join(', ') : 'none'}`);
	console.log(`  .claude/workspace.yaml`);
	console.log(`  CLAUDE.md (${claudeMdResult})`);
	console.log(`  .gitignore  (.claude/settings.local.json, .DS_Store)\n`);
}

/** Loads a preset by name (built-in, project-local or saved globally) and installs it. */
export async function init(presetName, targetDir, opts = {}) {
	const preset = await loadPreset(presetName, targetDir);
	return installPreset(preset, presetName, targetDir, opts);
}

/**
 * Re-copies whatever skills/core+skills/workspace.yaml declares from the
 * currently installed claude-workspace package — picks up skill content
 * updates without re-running init. Also refreshes the claude-workspace block
 * in CLAUDE.md (safe now that it's marker-delimited — see writeClaudeMd)
 * and re-fetches any remote (URL-added) skills, but doesn't re-run external
 * tools' installers (those update themselves; see each tool's own update
 * command).
 */
export async function sync(targetDir) {
	const workspacePath = path.join(targetDir, '.claude', 'workspace.yaml');
	if (!existsSync(workspacePath)) {
		throw new Error(`No .claude/workspace.yaml found in ${targetDir} — run "init" first.`);
	}
	const manifest = parseSimpleYaml(await fs.readFile(workspacePath, 'utf8'));
	const skillsDestDir = path.join(targetDir, '.claude', 'skills');
	await fs.mkdir(skillsDestDir, { recursive: true });

	console.log(`\nSyncing skills declared in ${workspacePath}\n`);

	let updated = 0;
	for (const name of manifest.core ?? []) {
		if (await copySkill('core', name, skillsDestDir)) updated++;
		else warn(`core skill "${name}" not found in ${SKILLS_DIR}/core — skipped`);
	}

	const remote = decodeRemoteList(manifest.remote);
	const remoteNames = new Set(remote.map((r) => r.name));

	// manifest.skills is now only ever format variants (spike,
	// assignment-defend — still vendored in this repo, refreshed by copy) —
	// except for a workspace.yaml written before domain skills moved to
	// remote, where it may still list one by its old name; migrate that into
	// the remote: list instead of failing to find it.
	const remainingSkills = [];
	for (const name of manifest.skills ?? []) {
		if (await copySkill('formats', name, skillsDestDir)) {
			updated++;
			remainingSkills.push(name);
			continue;
		}
		const catalogEntry = REMOTE_SKILLS[name];
		if (catalogEntry) {
			if (!remoteNames.has(name)) {
				const added = await fetchRemoteSkill(targetDir, catalogEntry.source, { skill: catalogEntry.skillName });
				if (added.length) updated++;
				for (const addedName of added) {
					remote.push({ name: addedName, source: catalogEntry.source });
					remoteNames.add(addedName);
				}
			}
			continue;
		}
		warn(`"${name}" isn't a known skill — skipped (external tools aren't refreshed by sync)`);
	}

	for (const { name, source } of remote) {
		if (!source) {
			warn(`remote skill "${name}" has no recorded source — re-add it with "claude-workspace add <url>"`);
			continue;
		}
		// Pin back to the single skill this name resolves to in the catalog, if
		// any — otherwise a multi-skill source (e.g. Jeffallan/claude-skills)
		// would re-fetch every skill it has, not just the one that was added.
		const catalogEntry = REMOTE_SKILLS[name];
		const added = await fetchRemoteSkill(targetDir, source, catalogEntry ? { skill: catalogEntry.skillName } : {});
		if (added.length) updated++;
		else warn(`could not refresh remote skill "${name}" from ${source}`);
	}

	await writeWorkspaceManifest(
		targetDir,
		manifest.preset ?? 'custom',
		manifest.core ?? [],
		remainingSkills,
		manifest.external ?? [],
		remote
	);
	const claudeMdResult = await writeClaudeMd(
		targetDir,
		manifest.preset ?? 'custom',
		manifest.core ?? [],
		[...remainingSkills, ...(manifest.external ?? []), ...remote.map((r) => r.name)],
		{ force: false }
	);

	await ensureGitignore(targetDir);

	console.log(`\nDone. Refreshed ${updated} skill(s). CLAUDE.md ${claudeMdResult}.`);
	const external = manifest.external ?? [];
	console.log(
		external.length
			? `External tools (${external.join(', ')}) were not touched — update each with its own CLI.`
			: `No external tools recorded — nothing else to update.`
	);
	console.log('');
}

/**
 * Reports on the health of an existing workspace: whether declared skills
 * are actually installed, whether their content matches what this version
 * of the package ships (vs. having drifted, e.g. after a package update),
 * whether the recorded toolkit version matches what's actually running, and
 * whether CLAUDE.md / the .gitignore block are in place.
 */
export async function doctor(targetDir) {
	const workspacePath = requireWorkspace(targetDir);
	const manifest = parseSimpleYaml(await fs.readFile(workspacePath, 'utf8'));
	const installedSkillsDir = path.join(targetDir, '.claude', 'skills');

	console.log(`\nChecking workspace in ${targetDir}`);
	console.log(`Preset: ${manifest.preset ?? '(unknown)'}`);

	const runningVersion = await packageVersion();
	const recordedVersion = manifest.toolVersion;
	if (!recordedVersion) {
		console.log(`Toolkit version: (unknown — recorded before this was tracked; run sync to start recording it)`);
	} else if (recordedVersion !== runningVersion) {
		console.log(
			`Toolkit version: this workspace was last synced with ${recordedVersion}, you're running ${runningVersion} — run sync to refresh`
		);
	} else {
		console.log(`Toolkit version: ${runningVersion} (matches what you're running)`);
	}
	console.log('');

	for (const name of manifest.core ?? []) {
		console.log(`  core      ${name.padEnd(24)} ${await checkSkillStatus('core', name, installedSkillsDir)}`);
	}
	for (const name of manifest.skills ?? []) {
		console.log(`  skill     ${name.padEnd(24)} ${await checkSkillStatus('formats', name, installedSkillsDir)}`);
	}
	for (const { name, source } of decodeRemoteList(manifest.remote)) {
		const present = existsSync(path.join(installedSkillsDir, name, 'SKILL.md'));
		console.log(`  remote    ${name.padEnd(24)} ${present ? `from ${source}` : 'MISSING — run sync'}`);
	}
	for (const name of manifest.external ?? []) {
		console.log(`  external  ${name.padEnd(24)} declared — check with its own status/update command`);
	}

	const claudeMdOk = existsSync(path.join(targetDir, 'CLAUDE.md'));
	console.log(`\n  CLAUDE.md          ${claudeMdOk ? 'present' : 'MISSING'}`);

	const gitignorePath = path.join(targetDir, '.gitignore');
	const gitignoreOk = existsSync(gitignorePath) && (await fs.readFile(gitignorePath, 'utf8')).includes(GITIGNORE_MARKER_START);
	console.log(`  .gitignore block   ${gitignoreOk ? 'present' : 'MISSING — run sync'}`);

	console.log('\nRun "claude-workspace sync" to refresh anything marked outdated or missing.\n');
}

/**
 * `global: true` installs a remote (URL/repo) source into ~/.claude/skills/
 * instead of this project's .claude/skills/ — available in every project on
 * the machine from then on (Claude Code already reads its personal skills
 * directory everywhere), so it's how to add a skill once instead of
 * per-project. Deliberately doesn't touch or require a project's
 * workspace.yaml at all: a global skill isn't this project's concern.
 * Only remote sources make sense here — this package's own catalog skills
 * are already available to every project without installing them anywhere
 * (they're just copied from the installed npm package on `init`/`sync`).
 */
async function addGlobalSkills(names, skill) {
	const existing = await listGlobalSkills();
	for (const name of names) {
		if (!looksLikeSkillSource(name)) {
			warn(
				`"${name}" — global install only takes a URL/repo source. This package's own skills are already available in every project without installing them anywhere.`
			);
			continue;
		}
		if (existing.some((e) => normalizeSkillSource(e.source) === normalizeSkillSource(name))) {
			warn(`"${name}" was already installed globally from an equivalent source — skipped`);
			continue;
		}
		const added = await fetchRemoteSkill(process.cwd(), name, { global: true, skill });
		if (!added.length) {
			warn(`nothing new appeared in ~/.claude/skills/ from "${name}" — not recorded`);
			continue;
		}
		console.log(`\nInstalled globally: ${added.join(', ')} — available in every project automatically, not tied to this one.\n`);
	}
}

/**
 * Adds one or more skills/external tools/remote sources to an existing
 * workspace: copies the skill (or runs the external tool's installer, or
 * fetches a remote source via `npx skills`) and records it in
 * workspace.yaml. Names already present in the workspace are skipped.
 * `global: true` bypasses all of that — see addGlobalSkills above. `skill`
 * pins one skill out of a multi-skill remote source (see fetchRemoteSkill);
 * only meaningful together with a single remote `names` entry.
 */
export async function addSkills(targetDir, names, { global = false, skill = null } = {}) {
	if (global) return addGlobalSkills(names, skill);

	const workspacePath = requireWorkspace(targetDir);
	const manifest = parseSimpleYaml(await fs.readFile(workspacePath, 'utf8'));
	const core = manifest.core ?? [];
	const skills = new Set(manifest.skills ?? []);
	const external = new Set(manifest.external ?? []);
	const remote = decodeRemoteList(manifest.remote);
	const remoteNames = new Set(remote.map((r) => r.name));
	const skillsDestDir = path.join(targetDir, '.claude', 'skills');
	await fs.mkdir(skillsDestDir, { recursive: true });

	for (const name of names) {
		if (looksLikeSkillSource(name)) {
			if (remote.some((r) => normalizeSkillSource(r.source) === normalizeSkillSource(name))) {
				warn(`"${name}" was already added from an equivalent source — skipped`);
				continue;
			}
			const added = await fetchRemoteSkill(targetDir, name, { skill });
			if (!added.length) {
				warn(`nothing new appeared in .claude/skills/ from "${name}" — not recorded`);
				continue;
			}
			for (const addedName of added) {
				if (remoteNames.has(addedName)) continue;
				remote.push({ name: addedName, source: name });
				remoteNames.add(addedName);
			}
			continue;
		}
		if (core.includes(name) || skills.has(name) || external.has(name) || remoteNames.has(name)) {
			warn(`"${name}" is already part of this workspace — skipped`);
			continue;
		}
		const tool = EXTERNAL_TOOLS[name];
		if (tool) {
			const ok = await installExternalTool(name, tool, targetDir);
			if (ok) external.add(name);
			continue;
		}
		if (await copySkill('formats', name, skillsDestDir)) {
			skills.add(name);
			continue;
		}
		const catalogEntry = REMOTE_SKILLS[name];
		if (catalogEntry) {
			const added = await fetchRemoteSkill(targetDir, catalogEntry.source, { skill: catalogEntry.skillName });
			if (!added.length) {
				warn(`nothing new appeared in .claude/skills/ from "${name}" (${catalogEntry.source}) — not recorded`);
				continue;
			}
			for (const addedName of added) {
				if (remoteNames.has(addedName)) continue;
				remote.push({ name: addedName, source: catalogEntry.source });
				remoteNames.add(addedName);
			}
			continue;
		}
		if (isSafeName(name) && existsSync(path.join(SKILLS_DIR, 'core', name, 'SKILL.md'))) {
			warn(`"${name}" is a core skill, bundled by presets rather than added individually — use "init" with a preset that includes it instead.`);
			continue;
		}
		const suggestion = suggestName(name, await listKnownNames());
		warn(`"${name}" isn't a known skill or external tool — skipped` + (suggestion ? ` (did you mean "${suggestion}"?)` : ''));
	}

	await writeWorkspaceManifest(targetDir, manifest.preset ?? 'custom', core, [...skills], [...external], remote);
	await ensureGitignore(targetDir);
	console.log(
		`\nAdded. .claude/skills/ now has ${core.length + skills.size + remote.length} skill(s); external: ${[...external].join(', ') || 'none'}; remote: ${remote.map((r) => r.name).join(', ') || 'none'}.\n`
	);
}

/** Removes one or more globally-installed (--global add'ed) skills from ~/.claude/skills/. */
async function removeGlobalSkills(names) {
	for (const name of names) {
		if (!isSafeName(name)) continue;
		const dir = path.join(GLOBAL_CLAUDE_SKILLS_DIR, name);
		if (existsSync(dir)) await fs.rm(dir, { recursive: true, force: true });
		await forgetGlobalSkill(name);
	}
	console.log(`\nRemoved globally: ${names.join(', ')}.\n`);
}

/**
 * Removes one or more skills/tools/remote entries from an existing
 * workspace: deletes the installed skill directory and drops it from
 * workspace.yaml. For an external tool, this only stops tracking it here —
 * it does not uninstall the tool itself (use its own uninstall command for
 * that). `global: true` removes a globally-installed skill instead — see
 * removeGlobalSkills above.
 */
export async function removeSkills(targetDir, names, { global = false } = {}) {
	if (global) return removeGlobalSkills(names);

	const workspacePath = requireWorkspace(targetDir);
	const manifest = parseSimpleYaml(await fs.readFile(workspacePath, 'utf8'));
	let core = manifest.core ?? [];
	let skills = manifest.skills ?? [];
	let external = manifest.external ?? [];
	let remote = decodeRemoteList(manifest.remote);
	const skillsDestDir = path.join(targetDir, '.claude', 'skills');

	for (const name of names) {
		const wasCore = core.includes(name);
		const wasSkill = skills.includes(name);
		const wasExternal = external.includes(name);
		const wasRemote = remote.some((r) => r.name === name);
		if (!wasCore && !wasSkill && !wasExternal && !wasRemote) {
			warn(`"${name}" isn't part of this workspace — skipped`);
			continue;
		}
		core = core.filter((n) => n !== name);
		skills = skills.filter((n) => n !== name);
		external = external.filter((n) => n !== name);
		remote = remote.filter((r) => r.name !== name);

		if (isSafeName(name)) {
			const dir = path.join(skillsDestDir, name);
			if (existsSync(dir)) await fs.rm(dir, { recursive: true, force: true });
		}
		if (wasExternal) warn(`"${name}" is no longer tracked, but the tool itself was NOT uninstalled — use its own uninstall command.`);
	}

	await writeWorkspaceManifest(targetDir, manifest.preset ?? 'custom', core, skills, external, remote);
	console.log(`\nRemoved. Remaining: ${core.length + skills.length + remote.length} skill(s); external: ${external.join(', ') || 'none'}.\n`);
}

async function updatePackage(targetDir) {
	let realScriptPath = __filename;
	try {
		realScriptPath = await fs.realpath(process.argv[1] ?? __filename);
	} catch {
		// process.argv[1] not resolvable (e.g. run from a REPL) — keep the default.
	}

	if (isEphemeralRun(realScriptPath)) {
		console.log('\nRunning via npx/dlx — that already always uses the latest version, nothing to install.');
	} else {
		const { command, args } = PACKAGE_MANAGER_UPDATE_COMMANDS[detectPackageManager(realScriptPath)];
		console.log(`\nUpdating the global claude-workspace package (${command} ${args.join(' ')})...`);
		try {
			await runVisible(command, args);
			console.log('Package updated.');
		} catch (error) {
			warn(`Could not update the global package: ${error.message.split('\n')[0]}`);
			warn(`If you installed globally, update it yourself: ${command} ${args.join(' ')}`);
		}
	}
	await sync(targetDir);
}
export { updatePackage };

/** Shows only what's actually installed in targetDir's workspace.yaml, not the full catalog. */
async function listInstalled(targetDir) {
	const workspacePath = requireWorkspace(targetDir);
	const manifest = parseSimpleYaml(await fs.readFile(workspacePath, 'utf8'));
	console.log(`\nInstalled in ${targetDir} (preset: ${manifest.preset ?? 'unknown'}):\n`);
	console.log(`  core:      ${(manifest.core ?? []).join(', ') || '(none)'}`);
	console.log(`  skills:    ${(manifest.skills ?? []).join(', ') || '(none)'}`);
	console.log(`  external:  ${(manifest.external ?? []).join(', ') || '(none)'}`);
	console.log(`  remote:    ${(manifest.remote ?? []).join(', ') || '(none)'}`);
	console.log(`  toolkit version at last sync: ${manifest.toolVersion ?? '(unknown)'}`);
	console.log('');
}

/** Shows skills installed globally (via "add <url> --global"), independent of any one project. */
async function listGlobalInstalled() {
	const entries = await listGlobalSkills();
	console.log(`\nInstalled globally (${GLOBAL_CLAUDE_SKILLS_DIR}):\n`);
	if (!entries.length) {
		console.log('  (none — install one with "claude-workspace add <url> --global")');
	} else {
		for (const { name, source } of entries) console.log(`  ${name.padEnd(24)} from ${source}`);
	}
	console.log('');
}

export async function list({ installedOnly = false, global = false, targetDir = process.cwd() } = {}) {
	if (global) {
		return listGlobalInstalled();
	}
	if (installedOnly) {
		return listInstalled(targetDir);
	}

	const presetFiles = (await listPresetNames(PRESETS_DIR)).map((name) => ({ name, scope: null }));
	const projectPresetFiles = (await listPresetNames(projectPresetsDir(targetDir))).map((name) => ({ name, scope: 'project' }));
	const globalPresetFiles = (await listPresetNames(GLOBAL_PRESETS_DIR)).map((name) => ({ name, scope: 'global' }));

	console.log('\nPresets (claude-workspace init <preset>):\n');
	for (const { name, scope } of [...presetFiles, ...projectPresetFiles, ...globalPresetFiles].sort((a, b) =>
		a.name.localeCompare(b.name)
	)) {
		const preset = await loadPreset(name, targetDir);
		const parts = [`core: ${(preset.core ?? []).join(', ') || '(none)'}`];
		if (preset.skills?.length) parts.push(`skills: ${preset.skills.join(', ')}`);
		console.log(`  ${name.padEnd(18)} ${parts.join('  |  ')}${scope ? `  (custom, ${scope})` : ''}`);
	}

	console.log('\nCore skills (installed only via a preset\'s own core: list):\n');
	for (const name of (await fs.readdir(path.join(SKILLS_DIR, 'core'))).sort()) {
		console.log(`  ${name.padEnd(20)} ${await describeSkill('core', name)}`);
	}

	console.log('\nFormat variants (add with --with=<name>, relevant presets only):\n');
	for (const name of (await fs.readdir(path.join(SKILLS_DIR, 'formats'))).sort()) {
		console.log(`  ${name.padEnd(20)} ${await describeSkill('formats', name)}`);
	}

	console.log(
		'\nAttachable skills (add with --with=<name>, from any preset — fetched from their own repo on first use; external tools need their own installer, run with --with=<name> or --with-external):\n'
	);
	for (const kind of DOMAIN_DIRS) {
		const names = namesInDomain(kind);
		if (!names.length) continue;
		console.log(`  ${kind}/`);
		for (const name of names) {
			const skill = REMOTE_SKILLS[name];
			if (skill) {
				console.log(`    ${name.padEnd(22)} ${truncate(skill.description)}  (from ${skill.source})`);
				continue;
			}
			const tool = EXTERNAL_TOOLS[name];
			console.log(`    ${name.padEnd(22)} ${tool.url}  (external tool, own installer)`);
		}
	}
	console.log('');
}
