import path from 'node:path';
import { existsSync } from 'node:fs';
import fs from 'node:fs/promises';

import { select, folderCheckbox, confirm, textInput, CancelledError } from './prompt.js';
import { bold, cyan, green, dim, red } from './colors.js';
import { loadConfig, saveConfig, t, presetHint, supportedLanguages, GLOBAL_PRESETS_DIR } from './i18n.js';
import {
	PRESETS_DIR,
	SKILLS_DIR,
	DOMAIN_DIRS,
	EXTERNAL_TOOLS,
	REMOTE_SKILLS,
	namesInDomain,
	loadPreset,
	listPresetNames,
	installPreset,
	describeSkill,
	truncate,
	isSafeName,
	projectPresetsDir,
	looksLikeSkillSource,
	parseSimpleYaml,
	hiddenDir,
} from '../workspace.js';

/** Format-variant skills that only make sense with specific presets — shown only then. */
const FORMAT_RELEVANCE = {
	'assignment-defend': ['assignment'],
	spike: ['project'],
};

async function domainSkillNames(kind) {
	const dir = path.join(SKILLS_DIR, kind);
	if (!existsSync(dir)) return [];
	return (await fs.readdir(dir)).sort();
}

/**
 * One checkbox group for a catalog domain (frontend/, backend/, ...) — items
 * come from REMOTE_SKILLS (fetched from their author's repo on first use)
 * and EXTERNAL_TOOLS (own installer) that share that domain, not from a
 * physical skills/<kind>/ directory: only skills/core and skills/formats are
 * still vendored in this repo.
 */
function buildDomainGroup(kind, excluded) {
	const names = namesInDomain(kind).filter((name) => !excluded.has(name));
	if (!names.length) return null;
	const items = names.map((name) => {
		const skill = REMOTE_SKILLS[name];
		if (skill) return { label: name, value: name, hint: truncate(skill.description) };
		const tool = EXTERNAL_TOOLS[name];
		return { label: name, value: name, hint: tool.url };
	});
	return { title: `${kind}/`, items };
}

async function buildFormatGroup(presetName, excluded) {
	const names = (await domainSkillNames('formats')).filter(
		(name) => !excluded.has(name) && (FORMAT_RELEVANCE[name] ?? []).includes(presetName)
	);
	if (!names.length) return null;
	const items = await Promise.all(
		names.map(async (name) => ({ label: name, value: name, hint: await describeSkill('formats', name) }))
	);
	return { title: null, items };
}

/**
 * Additional-skills folders for an existing preset — one folder per domain
 * (frontend/, backend/, ...), each mixing catalog skills and external tools,
 * plus relevant format variants. One group per folder (not merged into one
 * flat list) so each is small enough to fit a terminal screen — see
 * folderCheckbox in prompt.js.
 */
async function buildAdditionalGroups(lang, presetName, alreadyIncluded) {
	const excluded = new Set(alreadyIncluded);
	const groups = [];

	for (const kind of DOMAIN_DIRS) {
		const group = buildDomainGroup(kind, excluded);
		if (group) groups.push(group);
	}

	const formatGroup = await buildFormatGroup(presetName, excluded);
	if (formatGroup) groups.push({ title: t(lang, 'formatVariantsHeader'), items: formatGroup.items });

	return groups;
}

/** Full catalog checkbox for building a custom preset from scratch — grouped by directory, core included. */
async function buildFullCatalogGroups(lang) {
	const groups = [];
	const coreNames = await domainSkillNames('core');
	if (coreNames.length) {
		const items = await Promise.all(
			coreNames.map(async (name) => ({ label: name, value: name, hint: await describeSkill('core', name) }))
		);
		groups.push({ title: 'core/', items });
	}
	for (const kind of DOMAIN_DIRS) {
		const group = buildDomainGroup(kind, new Set());
		if (group) groups.push(group);
	}
	return groups;
}

function printBanner() {
	console.log(`\n${bold(cyan(`  ${t('en', 'wizardTitle')}`))}`);
	console.log(dim('  ────────────────────────────'));
}

async function resolveLanguage() {
	const config = await loadConfig();
	if (config.language && supportedLanguages().includes(config.language)) {
		return config.language;
	}
	const lang = await select(
		'Choose interface language / Выберите язык интерфейса',
		[
			{ label: 'Русский', value: 'ru' },
			{ label: 'English', value: 'en' },
		],
		{ subtitle: 'Language / Язык' }
	);
	await saveConfig({ ...config, language: lang });
	return lang;
}

function summaryLine(label, value, empty) {
	const shown = value.length ? green(value.join(', ')) : dim(empty);
	return `  ${dim(label + ':')} ${shown}`;
}

function printSummary(lang, { presetName, core, skills, external }) {
	console.log(`\n${bold(t(lang, 'summaryTitle'))}\n`);
	console.log(summaryLine(t(lang, 'summaryPreset'), [presetName], ''));
	console.log(summaryLine('core', core, t(lang, 'none')));
	console.log(summaryLine(t(lang, 'summarySkills'), skills, t(lang, 'none')));
	console.log(summaryLine(t(lang, 'summaryExternal'), external, t(lang, 'none')));
	console.log(`\n  ${dim(t(lang, 'summaryFiles') + ':')}`);
	for (const file of ['.claude/skills/', '.claude/workspace.yaml', 'CLAUDE.md', '.claude/hide.yaml']) {
		console.log(`  ${green('✓')} ${file}`);
	}
	console.log('');
}

/** `dir` defaults to the personal, all-projects location; pass projectPresetsDir(targetDir) to commit it to the current repo instead, for a team to share via git. */
async function saveCustomPreset(name, core, skills, dir = GLOBAL_PRESETS_DIR) {
	if (!isSafeName(name)) {
		throw new Error(`Invalid preset name "${name}" — use only letters, digits, "-", "_" and ".".`);
	}
	await fs.mkdir(dir, { recursive: true });
	const renderList = (items) => (items.length ? items.map((n) => `  - ${n}`).join('\n') : '  []');
	const yaml = [
		`name: ${name}`,
		'',
		'core:',
		renderList(core),
		'',
		'skills:',
		renderList(skills),
		'',
	].join('\n');
	await fs.writeFile(path.join(dir, `${name}.yaml`), yaml, 'utf8');
}

export { buildAdditionalGroups, buildFullCatalogGroups, saveCustomPreset };

export async function runWizard(targetDir) {
	let lang;
	printBanner();
	try {
		lang = await resolveLanguage();
		console.log(`\n${dim(t(lang, 'wizardTagline'))}`);

		// A hidden project has no .claude/workspace.yaml right now (it's in the
		// stash) — without this check the existence test just below would read
		// that as "never initialized" and walk straight into a fresh install,
		// colliding with what "unhide" expects to restore later.
		if (existsSync(hiddenDir(targetDir))) {
			console.log(`\n${dim(t(lang, 'currentlyHidden'))}\n`);
			return;
		}

		const existingWorkspacePath = path.join(targetDir, '.claude', 'workspace.yaml');
		if (existsSync(existingWorkspacePath)) {
			const existingManifest = parseSimpleYaml(await fs.readFile(existingWorkspacePath, 'utf8'));
			const keepGoing = await confirm(t(lang, 'alreadyInitialized', { preset: existingManifest.preset ?? '?' }), {
				yesLabel: t(lang, 'alreadyInitializedYes'),
				noLabel: t(lang, 'alreadyInitializedNo'),
				defaultYes: false,
				subtitle: t(lang, 'stepAlreadyInitialized'),
			});
			if (!keepGoing) {
				console.log(`\n${dim(t(lang, 'alreadyInitializedHint'))}\n`);
				return;
			}
		}

		const builtIn = await listPresetNames(PRESETS_DIR);
		const projectCustom = await listPresetNames(projectPresetsDir(targetDir));
		const globalCustom = await listPresetNames(GLOBAL_PRESETS_DIR);

		const presetChoices = [
			...builtIn.sort().map((name) => ({ label: name, value: name, hint: presetHint(lang, name) })),
			...projectCustom.sort().map((name) => ({ label: `${name} (custom, project)`, value: name, hint: '' })),
			...globalCustom
				.filter((name) => !projectCustom.includes(name))
				.sort()
				.map((name) => ({ label: `${name} (custom, global)`, value: name, hint: '' })),
			{ label: t(lang, 'createCustomPreset'), value: '__custom__' },
		];

		const presetChoice = await select(t(lang, 'choosePreset'), presetChoices, {
			subtitle: t(lang, 'stepPreset'),
		});

		let presetName;
		let presetObj;

		if (presetChoice === '__custom__') {
			do {
				presetName = await textInput(t(lang, 'customPresetName'), { default: 'my-custom' });
				if (!isSafeName(presetName)) console.log(`  ${red(t(lang, 'invalidPresetName'))}`);
			} while (!isSafeName(presetName));
			const groups = await buildFullCatalogGroups(lang);
			const selected = await folderCheckbox(t(lang, 'selectSkillsForPreset'), groups, {
				subtitle: t(lang, 'stepCustomSkills'),
				doneLabel: t(lang, 'doneFolderPicking'),
			});

			const coreNames = new Set(await domainSkillNames('core'));
			const core = selected.filter((name) => coreNames.has(name));
			const skills = selected.filter((name) => !coreNames.has(name));

			// A preset's skills list can carry a remote (URL/repo) source too, not
			// just this package's own catalog — asked as free text since there's
			// no way to enumerate "any GitHub repo" as checkbox items.
			for (;;) {
				const remoteInput = await textInput(t(lang, 'addRemoteToPreset'), { default: '' });
				if (!remoteInput) break;
				if (!looksLikeSkillSource(remoteInput)) {
					console.log(`  ${red(t(lang, 'notAUrl'))}`);
					continue;
				}
				skills.push(remoteInput);
			}

			const saveScope = await select(
				t(lang, 'saveScopeQuestion'),
				[
					{ label: t(lang, 'saveScopeProject'), value: 'project' },
					{ label: t(lang, 'saveScopeGlobal'), value: 'global' },
					{ label: t(lang, 'saveScopeNone'), value: 'none' },
				],
				{ subtitle: t(lang, 'stepSaveGlobally') }
			);
			if (saveScope === 'project') await saveCustomPreset(presetName, core, skills, projectPresetsDir(targetDir));
			else if (saveScope === 'global') await saveCustomPreset(presetName, core, skills);

			presetObj = { name: presetName, core, skills };
		} else {
			presetName = presetChoice;
			presetObj = await loadPreset(presetName, targetDir);

			const groups = await buildAdditionalGroups(lang, presetName, presetObj.skills ?? []);
			const additional = groups.length
				? await folderCheckbox(t(lang, 'additionalSkills'), groups, {
						subtitle: t(lang, 'stepAdditionalSkills'),
						doneLabel: t(lang, 'doneFolderPicking'),
					})
				: [];
			presetObj = { ...presetObj, skills: [...(presetObj.skills ?? []), ...additional] };
		}

		const externalChosen = (presetObj.skills ?? []).filter((name) => EXTERNAL_TOOLS[name]);
		let installExternalNow = false;
		if (externalChosen.length) {
			installExternalNow = await confirm(t(lang, 'installExternalNow'), {
				yesLabel: t(lang, 'yes'),
				noLabel: t(lang, 'no'),
				defaultYes: true,
				subtitle: t(lang, 'stepExternalInstall'),
			});
		}

		printSummary(lang, {
			presetName,
			core: presetObj.core ?? [],
			skills: (presetObj.skills ?? []).filter((name) => !EXTERNAL_TOOLS[name]),
			external: externalChosen,
		});

		const proceed = await confirm(t(lang, 'continueQuestion'), {
			yesLabel: t(lang, 'proceedYes'),
			noLabel: t(lang, 'proceedNo'),
			defaultYes: true,
			subtitle: t(lang, 'stepConfirm'),
		});
		if (!proceed) {
			console.log(`\n${dim(t(lang, 'cancelled'))}\n`);
			return;
		}

		await installPreset(presetObj, presetName, targetDir, { withExternal: installExternalNow });
		console.log(bold(green(`${t(lang, 'done')}\n`)));
	} catch (error) {
		if (error instanceof CancelledError) {
			console.log(`\n${dim(lang ? t(lang, 'cancelled') : 'Cancelled.')}\n`);
			return;
		}
		throw error;
	}
}
