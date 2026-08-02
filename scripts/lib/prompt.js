import readline from 'node:readline';

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

/** Single-select arrow-key menu. `choices`: [{ label, value, hint }]. */
export async function select(message, choices) {
	let cursor = 0;
	const render = () => {
		const lines = [message];
		choices.forEach((choice, i) => {
			const marker = i === cursor ? '❯' : ' ';
			const hint = choice.hint ? `  — ${choice.hint}` : '';
			lines.push(`  ${marker} ${choice.label}${hint}`);
		});
		return lines.join('\n');
	};
	const handleKey = (key) => {
		if (key.name === 'up' || key.name === 'k') cursor = moveCursor(cursor, -1, choices.length);
		else if (key.name === 'down' || key.name === 'j') cursor = moveCursor(cursor, 1, choices.length);
		else if (key.name === 'return') return choices[cursor].value;
		return undefined;
	};
	return runInteractive({ render, handleKey });
}

/** Yes/no arrow-key confirm, localized labels supplied by the caller. */
export async function confirm(message, { yesLabel = 'Yes', noLabel = 'No', defaultYes = true } = {}) {
	const yes = { label: yesLabel, value: true };
	const no = { label: noLabel, value: false };
	return select(message, defaultYes ? [yes, no] : [no, yes]);
}

/**
 * Multi-select checkbox menu grouped under (non-selectable) section
 * headers. `groups`: [{ title, items: [{ label, value, hint }] }].
 * Returns the array of selected `value`s.
 */
export async function checkbox(message, groups) {
	const { items, renderEntries } = flattenGroups(groups);
	let cursor = 0;
	let selected = new Set();

	const render = () => {
		const lines = [message, ''];
		for (const entry of renderEntries) {
			if (entry.type === 'header') {
				lines.push(`  ${entry.title}`);
				continue;
			}
			const item = items[entry.itemIndex];
			const marker = entry.itemIndex === cursor ? '❯' : ' ';
			const box = selected.has(entry.itemIndex) ? '[x]' : '[ ]';
			const hint = item.hint ? `  — ${item.hint}` : '';
			lines.push(`  ${marker} ${box} ${item.label}${hint}`);
		}
		lines.push('', '  (up/down move, space toggle, enter confirm, esc cancel)');
		return lines.join('\n');
	};

	const handleKey = (key) => {
		if (key.name === 'up' || key.name === 'k') cursor = moveCursor(cursor, -1, items.length);
		else if (key.name === 'down' || key.name === 'j') cursor = moveCursor(cursor, 1, items.length);
		else if (key.name === 'space') selected = toggleAt(selected, cursor);
		else if (key.name === 'return') return [...selected].sort((a, b) => a - b).map((i) => items[i].value);
		return undefined;
	};

	return runInteractive({ render, handleKey });
}

/** Plain line-based text input (works without raw mode). */
export function textInput(message, { default: defaultValue = '' } = {}) {
	return new Promise((resolve) => {
		const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
		const suffix = defaultValue ? ` (${defaultValue})` : '';
		rl.question(`${message}${suffix}: `, (answer) => {
			rl.close();
			resolve(answer.trim() || defaultValue);
		});
	});
}
