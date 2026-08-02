// Zero-dependency ANSI styling. Disabled automatically when stdout isn't a
// TTY (piped/redirected) or NO_COLOR is set (https://no-color.org), so
// output stays clean in logs/CI without any extra flag.
const enabled = Boolean(process.stdout.isTTY) && !process.env.NO_COLOR;

function wrap(open, close) {
	return (str) => (enabled ? `\x1b[${open}m${str}\x1b[${close}m` : String(str));
}

export const isColorEnabled = enabled;

export const bold = wrap(1, 22);
export const dim = wrap(2, 22);
export const underline = wrap(4, 24);
export const cyan = wrap(36, 39);
export const green = wrap(32, 39);
export const yellow = wrap(33, 39);
export const red = wrap(31, 39);
export const magenta = wrap(35, 39);
export const gray = dim;
