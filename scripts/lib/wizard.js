import path from 'node:path';
import { existsSync } from 'node:fs';
import fs from 'node:fs/promises';

import { select, checkbox, confirm, textInput, CancelledError } from './prompt.js';
import { loadConfig, saveConfig, t, presetHint, supportedLanguages, GLOBAL_PRESETS_DIR } from './i18n.js';
import {
	PRESETS_DIR,
	SKILLS_DIR,
	DOMAIN_DIRS,
	EXTERNAL_TOOLS,
	loadPreset,
	listPresetNames,
	installPreset,
	describeSkill,
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

async function buildDomainGroup(kind, excluded) {
	const names = (await domainSkillNames(kind)).filter((name) => !excluded.has(name));
	if (!names.length) return null;
	const items = await Promise.all(
		names.map(async (name) => ({ label: name, value: name, hint: await describeSkill(kind, name) }))
	);
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

function externalToolsGroup(excluded) {
	const items = Object.entries(EXTERNAL_TOOLS)
		.filter(([name]) => !excluded.has(name))
		.map(([name, tool]) => ({ label: name, value: name, hint: tool.url }));
	return items.length ? { title: null, items } : null;
}

/** Additional-skills checkbox for an existing preset — domain skills, relevant format variants, external tools. */
async function buildAdditionalGroups(lang, presetName, alreadyIncluded) {
	const excluded = new Set(alreadyIncluded);
	const groups = [];

	const domainItems = [];
	for (const kind of DOMAIN_DIRS) {
		if (kind === 'formats') continue;
		const group = await buildDomainGroup(kind, excluded);
		if (group) domainItems.push(...group.items.map((item) => ({ ...item, label: `${kind}/${item.label}` })));
	}
	if (domainItems.length) groups.push({ title: t(lang, 'domainSkillsHeader'), items: domainItems });

	const formatGroup = await buildFormatGroup(presetName, excluded);
	if (formatGroup) groups.push({ title: t(lang, 'formatVariantsHeader'), items: formatGroup.items });

	const externalGroup = externalToolsGroup(excluded);
	if (externalGroup) groups.push({ title: t(lang, 'externalToolsHeader'), items: externalGroup.items });

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
		const group = await buildDomainGroup(kind, new Set());
		if (group) groups.push(group);
	}
	const externalGroup = externalToolsGroup(new Set());
	if (externalGroup) groups.push({ title: t(lang, 'externalToolsHeader'), items: externalGroup.items });
	return groups;
}

async function resolveLanguage() {
	const config = await loadConfig();
	if (config.language && supportedLanguages().includes(config.language)) {
		return config.language;
	}
	const lang = await select('Choose interface language / Выберите язык интерфейса', [
		{ label: 'Русский', value: 'ru' },
		{ label: 'English', value: 'en' },
	]);
	await saveConfig({ ...config, language: lang });
	return lang;
}

function printSummary(lang, { presetName, core, skills, external }) {
	console.log(`\n${t(lang, 'summaryTitle')}\n`);
	console.log(`  ${t(lang, 'summaryPreset')}: ${presetName}`);
	console.log(`  core: ${core.join(', ') || t(lang, 'none')}`);
	console.log(`  ${t(lang, 'summarySkills')}: ${skills.join(', ') || t(lang, 'none')}`);
	console.log(`  ${t(lang, 'summaryExternal')}: ${external.join(', ') || t(lang, 'none')}`);
	console.log(`\n  ${t(lang, 'summaryFiles')}:`);
	console.log('  • .claude/skills/');
	console.log('  • .claude/workspace.yaml');
	console.log('  • CLAUDE.md');
	console.log('  • .gitignore');
	console.log('');
}

async function saveCustomPreset(name, core, skills) {
	await fs.mkdir(GLOBAL_PRESETS_DIR, { recursive: true });
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
	await fs.writeFile(path.join(GLOBAL_PRESETS_DIR, `${name}.yaml`), yaml, 'utf8');
}

export { buildAdditionalGroups, buildFullCatalogGroups, saveCustomPreset };

export async function runWizard(targetDir) {
	let lang;
	try {
		lang = await resolveLanguage();

		const builtIn = await listPresetNames(PRESETS_DIR);
		const custom = await listPresetNames(GLOBAL_PRESETS_DIR);

		const presetChoices = [
			...builtIn.sort().map((name) => ({ label: name, value: name, hint: presetHint(lang, name) })),
			...custom.sort().map((name) => ({ label: `${name} (custom)`, value: name, hint: '' })),
			{ label: t(lang, 'createCustomPreset'), value: '__custom__' },
		];

		const presetChoice = await select(t(lang, 'choosePreset'), presetChoices);

		let presetName;
		let presetObj;

		if (presetChoice === '__custom__') {
			presetName = await textInput(t(lang, 'customPresetName'), { default: 'my-custom' });
			const groups = await buildFullCatalogGroups(lang);
			const selected = await checkbox(t(lang, 'selectSkillsForPreset'), groups);

			const coreNames = new Set(await domainSkillNames('core'));
			const core = selected.filter((name) => coreNames.has(name));
			const skills = selected.filter((name) => !coreNames.has(name));

			const save = await confirm(t(lang, 'saveGlobally'), {
				yesLabel: t(lang, 'saveGloballyYes', { name: presetName }),
				noLabel: t(lang, 'saveGloballyNo'),
				defaultYes: true,
			});
			if (save) await saveCustomPreset(presetName, core, skills);

			presetObj = { name: presetName, core, skills };
		} else {
			presetName = presetChoice;
			presetObj = await loadPreset(presetName);

			const groups = await buildAdditionalGroups(lang, presetName, presetObj.skills ?? []);
			const additional = groups.length ? await checkbox(t(lang, 'additionalSkills'), groups) : [];
			presetObj = { ...presetObj, skills: [...(presetObj.skills ?? []), ...additional] };
		}

		const externalChosen = (presetObj.skills ?? []).filter((name) => EXTERNAL_TOOLS[name]);
		let installExternalNow = false;
		if (externalChosen.length) {
			installExternalNow = await confirm(t(lang, 'installExternalNow'), {
				yesLabel: t(lang, 'yes'),
				noLabel: t(lang, 'no'),
				defaultYes: true,
			});
		}

		printSummary(lang, {
			presetName,
			core: presetObj.core ?? [],
			skills: (presetObj.skills ?? []).filter((name) => !EXTERNAL_TOOLS[name]),
			external: externalChosen,
		});

		const proceed = await confirm(t(lang, 'continueQuestion'), {
			yesLabel: t(lang, 'yes'),
			noLabel: t(lang, 'no'),
			defaultYes: true,
		});
		if (!proceed) {
			console.log(`\n${t(lang, 'cancelled')}\n`);
			return;
		}

		await installPreset(presetObj, presetName, targetDir, { withExternal: installExternalNow });
	} catch (error) {
		if (error instanceof CancelledError) {
			console.log(`\n${lang ? t(lang, 'cancelled') : 'Cancelled.'}\n`);
			return;
		}
		throw error;
	}
}
