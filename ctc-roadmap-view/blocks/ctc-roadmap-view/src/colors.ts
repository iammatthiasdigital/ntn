/**
 * Column color derivation. The user picks one base color per lane
 * (delivered / upcoming); the soft column fill and the legible accent for
 * header text are derived from it.
 */

export const DEFAULT_DONE_COLOR = "#def15d"
export const DEFAULT_TODO_COLOR = "#0054ff"

/** Alpha byte (hex) of the soft column fill, per lane — from the palette:
 * #def15d26 for delivered, #0054ff10 for upcoming. */
export const DONE_SOFT_ALPHA = "26"
export const TODO_SOFT_ALPHA = "10"

export function isHexColor(value: unknown): value is string {
	return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value)
}

/** "#rrggbb" + "aa" → "#rrggbbaa". */
export function withAlpha(hex6: string, alphaHex: string): string {
	return `${hex6}${alphaHex}`
}

type Hsl = { h: number; s: number; l: number }

function hexToHsl(hex6: string): Hsl {
	const r = parseInt(hex6.slice(1, 3), 16) / 255
	const g = parseInt(hex6.slice(3, 5), 16) / 255
	const b = parseInt(hex6.slice(5, 7), 16) / 255
	const max = Math.max(r, g, b)
	const min = Math.min(r, g, b)
	const l = (max + min) / 2
	if (max === min) return { h: 0, s: 0, l }
	const d = max - min
	const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
	let h: number
	if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6
	else if (max === g) h = ((b - r) / d + 2) / 6
	else h = ((r - g) / d + 4) / 6
	return { h, s, l }
}

function hslToHex({ h, s, l }: Hsl): string {
	function channel(n: number): string {
		const k = (n + h * 12) % 12
		const a = s * Math.min(l, 1 - l)
		const value = l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))
		return Math.round(value * 255)
			.toString(16)
			.padStart(2, "0")
	}
	return `#${channel(0)}${channel(8)}${channel(4)}`
}

/**
 * A variant of the base color legible as text: darkened for the light
 * theme, lightened for the dark theme. Hue and saturation are kept.
 */
export function accentFor(hex6: string, theme: "light" | "dark"): string {
	const hsl = hexToHsl(hex6)
	const l = theme === "light" ? Math.min(hsl.l, 0.36) : Math.max(hsl.l, 0.68)
	return hslToHex({ ...hsl, l })
}
