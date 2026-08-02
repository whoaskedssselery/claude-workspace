import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';

// ~/.claude-workspace/config.json — currently just the wizard's remembered
// interface language, but its own directory since custom presets
// (~/.claude-workspace/presets/) live alongside it. Overridable via
// CLAUDE_WORKSPACE_HOME so tests never touch the real home directory.
export const GLOBAL_DIR = process.env.CLAUDE_WORKSPACE_HOME
	? path.resolve(process.env.CLAUDE_WORKSPACE_HOME)
	: path.join(os.homedir(), '.claude-workspace');
export const CONFIG_PATH = path.join(GLOBAL_DIR, 'config.json');
export const GLOBAL_PRESETS_DIR = path.join(GLOBAL_DIR, 'presets');

export async function loadConfig() {
	if (!existsSync(CONFIG_PATH)) return {};
	try {
		return JSON.parse(await fs.readFile(CONFIG_PATH, 'utf8'));
	} catch {
		return {};
	}
}

export async function saveConfig(config) {
	await fs.mkdir(GLOBAL_DIR, { recursive: true });
	await fs.writeFile(CONFIG_PATH, JSON.stringify(config, null, 2) + '\n', 'utf8');
}

/**
 * Strings for the interactive `init` wizard only — the rest of the CLI
 * (warnings, `list`, `doctor`, etc.) stays English-only, and skill
 * descriptions are always shown in their original vendored English rather
 * than translated, to avoid 29+ descriptions silently drifting from their
 * source SKILL.md over time.
 */
const STRINGS = {
	en: {
		wizardTitle: 'Claude Workspace',
		wizardTagline: 'Let\'s set up this project.',
		stepLanguage: 'Language',
		stepPreset: 'Preset',
		stepAdditionalSkills: 'Additional skills',
		stepCustomName: 'Custom preset',
		stepCustomSkills: 'Custom preset — skills',
		stepSaveGlobally: 'Custom preset — save',
		stepExternalInstall: 'External tools',
		stepConfirm: 'Confirm',
		chooseLanguage: 'Choose interface language',
		langRu: 'Русский',
		langEn: 'English',
		choosePreset: 'Choose a preset (or build your own)',
		createCustomPreset: 'Build a custom preset',
		additionalSkills: 'Any additional skills to add?',
		domainSkillsHeader: 'Domain skills',
		formatVariantsHeader: 'Format variants',
		externalToolsHeader: 'External tools (own installer)',
		coreSkillsIncluded: 'Core skills already included',
		installExternalNow: 'Install the selected external tools now?',
		yes: 'Yes',
		no: 'No, just show me the commands',
		customPresetName: 'Name for the new preset',
		selectSkillsForPreset: 'Choose skills for this preset',
		saveGlobally: 'Save this preset globally, to reuse in other projects?',
		saveGloballyYes: 'Yes → saved to ~/.claude-workspace/presets/{name}.yaml',
		saveGloballyNo: 'No → this project only',
		targetDirectory: 'Target directory',
		summaryTitle: 'About to create:',
		summaryPreset: 'Preset',
		summarySkills: 'Skills',
		summaryExternal: 'External',
		summaryFiles: 'Files',
		continueQuestion: 'Continue?',
		cancelled: 'Cancelled — nothing was written.',
		done: 'Done!',
		none: '(none)',
		invalidPresetName: 'Use only letters, digits, "-", "_" and "." — no "/" or spaces.',
	},
	ru: {
		wizardTitle: 'Claude Workspace',
		wizardTagline: 'Настроим этот проект.',
		stepLanguage: 'Язык',
		stepPreset: 'Пресет',
		stepAdditionalSkills: 'Дополнительные скиллы',
		stepCustomName: 'Свой пресет',
		stepCustomSkills: 'Свой пресет — скиллы',
		stepSaveGlobally: 'Свой пресет — сохранение',
		stepExternalInstall: 'External tools',
		stepConfirm: 'Подтверждение',
		chooseLanguage: 'Выберите язык интерфейса',
		langRu: 'Русский',
		langEn: 'English',
		choosePreset: 'Выберите пресет (или создайте свой)',
		createCustomPreset: 'Создать свой пресет',
		additionalSkills: 'Какие дополнительные skills добавить?',
		domainSkillsHeader: 'Domain skills',
		formatVariantsHeader: 'Варианты формата',
		externalToolsHeader: 'External tools (свой установщик)',
		coreSkillsIncluded: 'Core-скиллы уже включены',
		installExternalNow: 'Установить выбранные external tools прямо сейчас?',
		yes: 'Да',
		no: 'Нет, только показать команды',
		customPresetName: 'Название нового пресета',
		selectSkillsForPreset: 'Выберите skills для этого пресета',
		saveGlobally: 'Сохранить этот пресет глобально, для других проектов?',
		saveGloballyYes: 'Да → сохранится в ~/.claude-workspace/presets/{name}.yaml',
		saveGloballyNo: 'Нет → только для текущего проекта',
		targetDirectory: 'Целевая директория',
		summaryTitle: 'Будет создано:',
		summaryPreset: 'Пресет',
		summarySkills: 'Skills',
		summaryExternal: 'External',
		summaryFiles: 'Файлы',
		continueQuestion: 'Продолжить?',
		cancelled: 'Отменено — ничего не записано.',
		done: 'Готово!',
		none: '(нет)',
		invalidPresetName: 'Только буквы, цифры, "-", "_" и "." — без "/" и пробелов.',
	},
};

/** Short, wizard-only hints for the built-in presets, in each language. */
const PRESET_HINTS = {
	en: {
		learning: 'learning: the human writes code, Claude teaches and reviews',
		project: 'day-to-day work on an existing project',
		assignment: 'coursework / homework / take-home',
		redesign: 'visual/UI-UX rework',
		'oss-contribution': 'contributing to someone else\'s repository',
	},
	ru: {
		learning: 'обучение: человек пишет код, Claude учит и ревьюит',
		project: 'обычная работа над проектом',
		assignment: 'курсовая / домашнее задание / take-home',
		redesign: 'визуальная переработка (UI/UX)',
		'oss-contribution': 'вклад в чужой репозиторий',
	},
};

export function t(lang, key, vars = {}) {
	const template = STRINGS[lang]?.[key] ?? STRINGS.en[key] ?? key;
	return template.replace(/\{(\w+)\}/g, (_, name) => vars[name] ?? '');
}

export function presetHint(lang, name) {
	return PRESET_HINTS[lang]?.[name] ?? PRESET_HINTS.en[name] ?? '';
}

export function supportedLanguages() {
	return Object.keys(STRINGS);
}
