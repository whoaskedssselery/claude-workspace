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
 * How many terminal rows a render() is allowed to use for its scrollable body
 * (the part `windowSlice` below paginates), leaving room for `chromeLines`
 * (subtitle/message/footer) plus a one-row safety margin. Without this, a
 * render taller than what's left below the cursor forces the terminal to
 * auto-scroll *while it's being written* — which breaks the relative
 * moveCursor(-lineCount) redraw below: it can't move back to a start row
 * that's already scrolled out of the buffer, so clearScreenDown clears the
 * wrong region and old frames pile up in scrollback instead of being
 * overwritten (reproduced as: every keypress appears to reprint the whole
 * screen, and it's pinned to the bottom since new output keeps forcing the
 * view back down).
 */
/**
 * The "-1" used to just be a nominal safety margin; widened to "-3" after a
 * real 12-row terminal still showed a small (~2-line) leftover fragment per
 * step even with the reservation below in place — there's no visibility
 * into whether that's an off-by-a-couple-rows somewhere in this file or a
 * console-specific quirk in how it reports/rounds cursor movement, so this
 * trades a little more "N more above/below" pagination for headroom against
 * either.
 */
function terminalRowBudget(chromeLines) {
	const rows = process.stdout.rows || 24;
	return Math.max(3, rows - chromeLines - 3);
}

/** Slice `length` items down to `maxVisible`, keeping `cursor` in view. Returns { start, end } (end exclusive). */
export function windowSlice(length, cursor, maxVisible) {
	if (length <= maxVisible) return { start: 0, end: length };
	let start = Math.max(0, cursor - Math.floor(maxVisible / 2));
	start = Math.min(start, length - maxVisible);
	return { start, end: start + maxVisible };
}

/**
 * Renders `render()`, then re-renders in place after each keypress, until
 * `handleKey` returns a value other than undefined (which becomes the
 * resolved result). Esc/Ctrl+C rejects with CancelledError.
 *
 * Erases its own last frame before resolving/rejecting (rather than leaving
 * it on screen) so a multi-step wizard doesn't accumulate every previous
 * step's full menu — that accumulated height is what eventually stops
 * fitting the terminal and triggers the auto-scroll problem above, even for
 * steps whose own render is short.
 *
 * Bounding this step's own render to `rows` (via terminalRowBudget) isn't
 * enough by itself: whatever a *previous* step already left on screen above
 * the cursor (banner text, an earlier step's own render) eats into the same
 * fixed-height viewport, so there may be fewer rows actually free below the
 * cursor than `rows` — confirmed live on a real 12-row terminal, where a
 * render that fit in 12 rows on its own still triggered the same
 * auto-scroll-mid-write corruption because 4-5 of those rows were already
 * spoken for. Fixed by reserving `rows` blank lines up front (forcing
 * whatever scrolling is needed to happen in one predictable jump) and
 * moving back up to the top of that now-guaranteed-empty block before the
 * first real draw — from that known position, a render bounded to `rows`
 * can never again trigger a mid-write scroll for the rest of this step.
 *
 * That reservation is real terminal-writes-and-scrolls work, though — doing
 * it before *every single* prompt in a back-to-back sequence (e.g.
 * folderCheckbox's own select()-then-checkbox()-then-select()... loop, which
 * never lets anything else touch the screen in between) burns one full
 * `rows` worth of blank scrollback per step for no visual benefit, since
 * cleanup() already leaves the *previous* step's viewport fully blank and
 * correctly anchored. `reserveViewport: false` skips the reservation for
 * exactly that case — callers must only pass it when they can guarantee
 * nothing else has written to the terminal since the prior step's cleanup().
 */
function runInteractive({ render, handleKey, reserveViewport = true }) {
	requireTTY();
	return new Promise((resolve, reject) => {
		let lineCount = 0;

		function eraseLastFrame(extraMargin = 0) {
			if (lineCount === 0) return;
			// extraMargin (only ever passed by cleanup(), never by a mid-step
			// redraw): empirically, moving up by exactly lineCount can still
			// land a couple rows below where this frame actually started —
			// the same discrepancy terminalRowBudget's margin exists to leave
			// headroom for, which used to surface as leftover ghost text and,
			// now that renders stay within budget, as a few stray blank lines
			// before the next thing printed instead. Safe only as a one-off
			// on the way out of a step: the extra rows reclaimed are still
			// inside this step's own reserved viewport on the very first
			// redraw, but applying this on *every* mid-step redraw would
			// compound across keypresses and start eating into whatever the
			// wizard printed before this step began.
			readline.moveCursor(process.stdout, 0, -(lineCount + extraMargin));
			readline.cursorTo(process.stdout, 0);
			readline.clearScreenDown(process.stdout);
			lineCount = 0;
		}

		function reserveFreshViewport() {
			const rows = process.stdout.rows || 24;
			process.stdout.write('\n'.repeat(rows));
			readline.moveCursor(process.stdout, 0, -rows);
		}

		function draw() {
			const output = render();
			eraseLastFrame();
			process.stdout.write(output + '\n');
			lineCount = output.split('\n').length;
		}

		function cleanup() {
			eraseLastFrame(2);
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
		if (reserveViewport) reserveFreshViewport();
		draw();
		process.stdin.on('keypress', onKeypress);
	});
}

function renderSubtitle(subtitle) {
	return subtitle ? [dim(subtitle), ''] : [];
}

/**
 * Single-select arrow-key menu. `choices`: [{ label, value, hint }].
 * `reserveViewport` (default true): pass false only when the caller can
 * guarantee nothing has written to the terminal since a previous prompt's
 * cleanup — see runInteractive's own doc comment.
 */
export async function select(message, choices, { subtitle, initialCursor = 0, reserveViewport = true } = {}) {
	let cursor = initialCursor >= 0 && initialCursor < choices.length ? initialCursor : 0;
	const render = () => {
		const header = [...renderSubtitle(subtitle), bold(message)];
		const footer = ['', dim('  ↑/↓ move · 1-9 jump · enter select · esc cancel')];
		const budget = terminalRowBudget(header.length + footer.length + 1);
		const { start, end } = windowSlice(choices.length, cursor, budget);
		const lines = [...header];
		if (start > 0) lines.push(dim(`  ↑ ${start} more above`));
		choices.slice(start, end).forEach((choice, offset) => {
			const i = start + offset;
			const focused = i === cursor;
			const marker = focused ? cyan('❯') : ' ';
			const number = dim(i < 9 ? `${i + 1}.` : ' ');
			const label = focused ? bold(choice.label) : choice.label;
			const hint = choice.hint ? dim(`  — ${choice.hint}`) : '';
			lines.push(`  ${marker} ${number} ${label}${hint}`);
		});
		if (end < choices.length) lines.push(dim(`  ↓ ${choices.length - end} more below`));
		lines.push(...footer);
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
	return runInteractive({ render, handleKey, reserveViewport });
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
export async function checkbox(message, groups, { subtitle, initialSelected, reserveViewport = true } = {}) {
	const { items, renderEntries } = flattenGroups(groups);
	let cursor = 0;
	let selected = initialSelected
		? new Set(items.map((item, i) => (initialSelected.has(item.value) ? i : -1)).filter((i) => i >= 0))
		: new Set();

	const render = () => {
		const header = [...renderSubtitle(subtitle), bold(message), ''];
		const footer = [
			'',
			dim('  ↑/↓ move · 1-9 jump+toggle · space toggle · a all · n none · enter confirm · esc cancel'),
		];
		const budget = terminalRowBudget(header.length + footer.length + 1);
		const cursorPos = renderEntries.findIndex((entry) => entry.type === 'item' && entry.itemIndex === cursor);
		const { start, end } = windowSlice(renderEntries.length, cursorPos < 0 ? 0 : cursorPos, budget);
		const lines = [...header];
		if (start > 0) lines.push(dim(`  ↑ ${start} more above`));
		for (const entry of renderEntries.slice(start, end)) {
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
		if (end < renderEntries.length) lines.push(dim(`  ↓ ${renderEntries.length - end} more below`));
		lines.push(...footer);
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

	return runInteractive({ render, handleKey, reserveViewport });
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
export async function folderCheckbox(message, groups, { subtitle, doneLabel = 'Done — continue' } = {}) {
	const selected = new Set();
	let folderCursor = 0;
	// Only the very first screen of this whole folder-picking session needs
	// to reserve a fresh viewport — every screen after that is preceded
	// solely by another prompt.js cleanup() in this same loop (nothing else
	// writes to the terminal in between), which already leaves the viewport
	// blank and correctly anchored, so re-reserving would just burn another
	// full screen's worth of blank scrollback for no visible difference.
	let reserveViewport = true;

	for (;;) {
		const folderChoices = groups.map((group, i) => {
			const count = group.items.filter((item) => selected.has(item.value)).length;
			const label = group.title ?? `Skills ${i + 1}`;
			return { label: `${label}  ${count ? green(`(${count} selected)`) : dim('(none selected)')}`, value: i };
		});
		folderChoices.push({ label: green(`✓ ${doneLabel}`), value: '__done__' });

		const choice = await select(message, folderChoices, { subtitle, initialCursor: folderCursor, reserveViewport });
		reserveViewport = false;
		if (choice === '__done__') break;
		folderCursor = choice;

		const group = groups[choice];
		try {
			const result = await checkbox(group.title ?? '', [{ title: null, items: group.items }], {
				subtitle: [subtitle, group.title].filter(Boolean).join(' — '),
				initialSelected: selected,
				reserveViewport,
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
