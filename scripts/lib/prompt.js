import readline from 'node:readline';
import { bold, dim, cyan, green, underline } from './colors.js';

/**
 * Pure, unit-testable cursor/selection logic, kept separate from the raw
 * terminal rendering below (which needs a real TTY and can't meaningfully
 * be driven from an automated test).
 */
export function moveCursor(current, delta, length) {
	if (length === 0) return 0;
	return (current + delta + length) % length;
}

export function toggleAt(selected, index) {
	const next = new Set(selected);
	if (next.has(index)) next.delete(index);
	else next.add(index);
	return next;
}

/** Flattens {title, items}[] groups into a single indexable item list, keeping group headers as separate non-selectable render entries. */
export function flattenGroups(groups) {
	const items = [];
	const renderEntries = [];
	for (const group of groups) {
		if (group.title) renderEntries.push({ type: 'header', title: group.title });
		for (const item of group.items) {
			renderEntries.push({ type: 'item', itemIndex: items.length });
			items.push(item);
		}
	}
	return { items, renderEntries };
}

/** '1'-'9' -> 0-based index, if it's within range; used for the numbered quick-jump/select shortcut. Anything else -> null. */
export function digitIndex(str, length) {
	if (typeof str !== 'string' || !/^[1-9]$/.test(str)) return null;
	const index = Number(str) - 1;
	return index < length ? index : null;
}

export class CancelledError extends Error {
	constructor() {
		super('Cancelled.');
		this.name = 'CancelledError';
	}
}

function requireTTY() {
	if (!process.stdin.isTTY || !process.stdout.isTTY) {
		throw new Error(
			'This needs an interactive terminal (TTY). Run with explicit flags instead — see --help.'
		);
	}
}

/**
 * Renders `render()`, then re-renders in place after each keypress, until
 * `handleKey` returns a value other than undefined (which becomes the
 * resolved result). Esc/Ctrl+C rejects with CancelledError.
 */
function runInteractive({ render, handleKey }) {
	requireTTY();
	return new Promise((resolve, reject) => {
		let lineCount = 0;

		function draw() {
			const output = render();
			if (lineCount > 0) {
				readline.moveCursor(process.stdout, 0, -lineCount);
				readline.cursorTo(process.stdout, 0);
				readline.clearScreenDown(process.stdout);
			}
			process.stdout.write(output + '\n');
			lineCount = output.split('\n').length;
		}

		function cleanup() {
			process.stdin.removeListener('keypress', onKeypress);
			if (process.stdin.isTTY) process.stdin.setRawMode(false);
			process.stdin.pause();
		}

		function onKeypress(str, key) {
			if ((key.ctrl && key.name === 'c') || key.name === 'escape') {
				cleanup();
				reject(new CancelledError());
				return;
			}
			const result = handleKey(key, str);
			if (result !== undefined) {
				cleanup();
				resolve(result);
				return;
			}
			draw();
		}

		readline.emitKeypressEvents(process.stdin);
		process.stdin.setRawMode(true);
		process.stdin.resume();
		draw();
		process.stdin.on('keypress', onKeypress);
	});
}

function renderSubtitle(subtitle) {
	return subtitle ? [dim(subtitle), ''] : [];
}

/** Single-select arrow-key menu. `choices`: [{ label, value, hint }]. */
export async function select(message, choices, { subtitle, initialCursor = 0 } = {}) {
	let cursor = initialCursor >= 0 && initialCursor < choices.length ? initialCursor : 0;
	const render = () => {
		const lines = [...renderSubtitle(subtitle), bold(message)];
		choices.forEach((choice, i) => {
			const focused = i === cursor;
			const marker = focused ? cyan('❯') : ' ';
			const number = dim(i < 9 ? `${i + 1}.` : ' ');
			const label = focused ? bold(choice.label) : choice.label;
			const hint = choice.hint ? dim(`  — ${choice.hint}`) : '';
			lines.push(`  ${marker} ${number} ${label}${hint}`);
		});
		lines.push('', dim('  ↑/↓ move · 1-9 jump · enter select · esc cancel'));
		return lines.join('\n');
	};
	const handleKey = (key, str) => {
		const jump = digitIndex(str, choices.length);
		if (jump !== null) return choices[jump].value;
		if (key.name === 'up' || key.name === 'k') cursor = moveCursor(cursor, -1, choices.length);
		else if (key.name === 'down' || key.name === 'j') cursor = moveCursor(cursor, 1, choices.length);
		else if (key.name === 'return') return choices[cursor].value;
		return undefined;
	};
	return runInteractive({ render, handleKey });
}

/** Yes/no arrow-key confirm, localized labels supplied by the caller. */
export async function confirm(message, { yesLabel = 'Yes', noLabel = 'No', defaultYes = true, subtitle } = {}) {
	const yes = { label: yesLabel, value: true };
	const no = { label: noLabel, value: false };
	return select(message, defaultYes ? [yes, no] : [no, yes], { subtitle });
}

/**
 * Multi-select checkbox menu grouped under (non-selectable) section
 * headers. `groups`: [{ title, items: [{ label, value, hint }] }].
 * Returns the array of selected `value`s.
 */
export async function checkbox(message, groups, { subtitle, initialSelected } = {}) {
	const { items, renderEntries } = flattenGroups(groups);
	let cursor = 0;
	let selected = initialSelected
		? new Set(items.map((item, i) => (initialSelected.has(item.value) ? i : -1)).filter((i) => i >= 0))
		: new Set();

	const render = () => {
		const lines = [...renderSubtitle(subtitle), bold(message), ''];
		for (const entry of renderEntries) {
			if (entry.type === 'header') {
				lines.push(`  ${bold(underline(entry.title))}`);
				continue;
			}
			const item = items[entry.itemIndex];
			const focused = entry.itemIndex === cursor;
			const marker = focused ? cyan('❯') : ' ';
			const box = selected.has(entry.itemIndex) ? green('[x]') : '[ ]';
			const number = dim(entry.itemIndex < 9 ? `${entry.itemIndex + 1}.` : ' ');
			const label = focused ? bold(item.label) : item.label;
			const hint = item.hint ? dim(`  — ${item.hint}`) : '';
			lines.push(`  ${marker} ${number} ${box} ${label}${hint}`);
		}
		lines.push(
			'',
			dim('  ↑/↓ move · 1-9 jump+toggle · space toggle · a all · n none · enter confirm · esc cancel')
		);
		return lines.join('\n');
	};

	const handleKey = (key, str) => {
		const jump = digitIndex(str, items.length);
		if (jump !== null) {
			cursor = jump;
			selected = toggleAt(selected, cursor);
			return undefined;
		}
		if (key.name === 'up' || key.name === 'k') cursor = moveCursor(cursor, -1, items.length);
		else if (key.name === 'down' || key.name === 'j') cursor = moveCursor(cursor, 1, items.length);
		else if (key.name === 'space') selected = toggleAt(selected, cursor);
		else if (str === 'a') selected = new Set(items.map((_, i) => i));
		else if (str === 'n') selected = new Set();
		else if (key.name === 'return') return [...selected].sort((a, b) => a - b).map((i) => items[i].value);
		return undefined;
	};

	return runInteractive({ render, handleKey });
}

/**
 * Multi-select across grouped "folders" instead of one flat checkbox list —
 * pick a folder, checkbox just its items, land back on the folder list,
 * repeat, then "Done". Exists because a single flat list long enough to
 * exceed the terminal's height breaks the redraw-in-place approach
 * `runInteractive` uses (moving the cursor up more rows than are actually
 * visible just pins it at the top of the viewport, which reads as "jumps
 * back to the start" on every keypress) — keeping each screen to one
 * folder's worth of items keeps it well under any real terminal's height.
 * `groups`: [{ title, items: [{ label, value, hint }] }], same shape
 * `checkbox` takes. Returns the flat array of all selected values across
 * every folder, in catalog order (not selection order).
 */
export async function folderCheckbox(message, groups, { subtitle } = {}) {
	const selected = new Set();
	let folderCursor = 0;

	for (;;) {
		const folderChoices = groups.map((group, i) => {
			const count = group.items.filter((item) => selected.has(item.value)).length;
			const label = group.title ?? `Skills ${i + 1}`;
			return { label: `${label}  ${count ? green(`(${count} selected)`) : dim('(none selected)')}`, value: i };
		});
		folderChoices.push({ label: green(`✓ ${message}`), value: '__done__' });

		const choice = await select(message, folderChoices, { subtitle, initialCursor: folderCursor });
		if (choice === '__done__') break;
		folderCursor = choice;

		const group = groups[choice];
		try {
			const result = await checkbox(group.title ?? '', [{ title: null, items: group.items }], {
				subtitle: [subtitle, group.title].filter(Boolean).join(' — '),
				initialSelected: selected,
			});
			for (const item of group.items) {
				if (result.includes(item.value)) selected.add(item.value);
				else selected.delete(item.value);
			}
		} catch (error) {
			if (error instanceof CancelledError) continue; // esc backs out to the folder list, not the whole wizard
			throw error;
		}
	}

	return [...selected];
}

/** Plain line-based text input (works without raw mode). */
export function textInput(message, { default: defaultValue = '' } = {}) {
	return new Promise((resolve) => {
		const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
		const suffix = defaultValue ? dim(` (${defaultValue})`) : '';
		rl.question(`${bold(message)}${suffix}: `, (answer) => {
			rl.close();
			resolve(answer.trim() || defaultValue);
		});
	});
}
