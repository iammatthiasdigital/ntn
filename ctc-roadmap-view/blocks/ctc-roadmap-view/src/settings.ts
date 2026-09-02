/**
 * Block settings, editable on the page so wording changes in the database
 * (a renamed tag, product, or sales status) don't require a code change.
 * Filters hold the selected values (multi-select against lists rendered
 * from the database); matching is case-insensitive. An empty tag/product
 * selection switches that filter off. Persisted per browser, best effort.
 */

export type BlockView = "kanban" | "coverage"

export type BlockSettings = {
	view: BlockView
	/** Tags to keep (both views); empty = filter off. */
	tagTerms: string[]
	/** Product names to keep (singular/plural match); empty = filter off. */
	productTerms: string[]
	/** Scopes to keep (both views); empty = filter off. */
	scopeTerms: string[]
	/** Sales statuses of the AVAILABLE lane; empty = empty lane. */
	availableTerms: string[]
	/** Sales statuses of the ROADMAP lane; empty = empty lane. */
	roadmapTerms: string[]
	/** Pad the exported PNG to a 16:9 canvas so it drops onto a slide. */
	exportSlide: boolean
}

export const DEFAULT_SETTINGS: BlockSettings = {
	view: "kanban",
	tagTerms: ["mandate"],
	productTerms: ["Compliance transaction"],
	scopeTerms: [],
	availableTerms: ["available"],
	roadmapTerms: ["roadmap"],
	exportSlide: true,
}

const STORAGE_KEY = "ctc-roadmap-settings"

function textList(value: unknown, legacy: unknown, fallback: string[]): string[] {
	if (Array.isArray(value)) {
		return value.filter(
			(entry): entry is string => typeof entry === "string" && entry.trim() !== ""
		)
	}
	// Migration from the free-text single-term settings.
	if (typeof legacy === "string" && legacy.trim() !== "") return [legacy]
	return [...fallback]
}

function sanitize(value: unknown): BlockSettings {
	const record =
		value !== null && typeof value === "object"
			? (value as Record<string, unknown>)
			: {}
	return {
		view: record.view === "coverage" ? "coverage" : "kanban",
		tagTerms: textList(record.tagTerms, record.tagTerm, DEFAULT_SETTINGS.tagTerms),
		productTerms: textList(
			record.productTerms,
			record.productTerm,
			DEFAULT_SETTINGS.productTerms
		),
		scopeTerms: textList(record.scopeTerms, undefined, DEFAULT_SETTINGS.scopeTerms),
		availableTerms: textList(
			record.availableTerms,
			record.availableTerm,
			DEFAULT_SETTINGS.availableTerms
		),
		roadmapTerms: textList(
			record.roadmapTerms,
			record.roadmapTerm,
			DEFAULT_SETTINGS.roadmapTerms
		),
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
	return sanitize({})
}

export function storeSettings(settings: BlockSettings): void {
	try {
		window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
	} catch {
		// Best effort only.
	}
}
