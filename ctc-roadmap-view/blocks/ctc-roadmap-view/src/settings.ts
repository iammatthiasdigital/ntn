/**
 * Block settings, editable on the page so wording changes in the database
 * (a renamed tag, product, or sales status) don't require a code change.
 * All matching is case-insensitive. Persisted per browser, best effort.
 */

export type BlockView = "kanban" | "coverage"

export type BlockSettings = {
	view: BlockView
	/** Tag that marks a mandate row (kanban view). */
	tagTerm: string
	/** Product name to keep; singular/plural both match. */
	productTerm: string
	/** Sales status that puts a country into the AVAILABLE lane. */
	availableTerm: string
	/** Sales status that puts a country into the ROADMAP lane. */
	roadmapTerm: string
	/** Pad the exported PNG to a 16:9 canvas so it drops onto a slide. */
	exportSlide: boolean
}

export const DEFAULT_SETTINGS: BlockSettings = {
	view: "kanban",
	tagTerm: "mandate",
	productTerm: "Compliance transaction",
	availableTerm: "available",
	roadmapTerm: "roadmap",
	exportSlide: true,
}

const STORAGE_KEY = "ctc-roadmap-settings"

function sanitize(value: unknown): BlockSettings {
	const record =
		value !== null && typeof value === "object"
			? (value as Record<string, unknown>)
			: {}
	function text(key: keyof BlockSettings): string {
		const raw = record[key]
		return typeof raw === "string" && raw.trim() !== ""
			? raw
			: (DEFAULT_SETTINGS[key] as string)
	}
	return {
		view: record.view === "coverage" ? "coverage" : "kanban",
		tagTerm: text("tagTerm"),
		productTerm: text("productTerm"),
		availableTerm: text("availableTerm"),
		roadmapTerm: text("roadmapTerm"),
		exportSlide:
			typeof record.exportSlide === "boolean"
				? record.exportSlide
				: DEFAULT_SETTINGS.exportSlide,
	}
}

export function loadSettings(): BlockSettings {
	try {
		const raw = window.localStorage.getItem(STORAGE_KEY)
		if (raw) return sanitize(JSON.parse(raw))
	} catch {
		// Storage unavailable in this sandbox — fall through to defaults.
	}
	return { ...DEFAULT_SETTINGS }
}

export function storeSettings(settings: BlockSettings): void {
	try {
		window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
	} catch {
		// Best effort only.
	}
}
