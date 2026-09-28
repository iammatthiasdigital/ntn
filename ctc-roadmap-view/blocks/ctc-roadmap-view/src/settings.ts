/**
 * The block's view: which board, the board scope (tags, product), the
 * coverage lanes, lane colors and export format, plus the Notion-style
 * filters. Remembered per block in each viewer's browser (kit
 * usePersistentView); views saved by the earlier version of the block
 * (one global entry per browser) seed the defaults once.
 */
import { DEFAULT_DONE_COLOR, DEFAULT_TODO_COLOR, isHexColor } from "./colors"
import { EMPTY_FILTERS } from "./kit/filters/core"
import type { WithFilters } from "./kit/toolbar"

export type BlockView = "kanban" | "coverage"

export type View = WithFilters & {
	view: BlockView
	/** Tags to keep (both views); empty = filter off. */
	tagTerms: string[]
	/** Product names to keep (singular/plural match); empty = filter off. */
	productTerms: string[]
	/** Sales statuses of the AVAILABLE lane; ["*"] = any status. */
	availableTerms: string[]
	/** Sales statuses of the ROADMAP lane. */
	roadmapTerms: string[]
	/** Pad the exported PNG to a 16:9 canvas so it drops onto a slide. */
	exportSlide: boolean
	/** Lane colors: delivered quarters / roadmap lane, upcoming quarters / available lane. */
	done: string
	todo: string
	/** List rows in scope that miss an ETA, country, sales status or readable product. */
	showMissing: boolean
}

export const DEFAULT_VIEW: View = {
	view: "kanban",
	tagTerms: ["mandate"],
	productTerms: ["Compliance transaction"],
	availableTerms: ["available"],
	roadmapTerms: ["roadmap"],
	exportSlide: true,
	done: DEFAULT_DONE_COLOR,
	todo: DEFAULT_TODO_COLOR,
	showMissing: true,
	filters: EMPTY_FILTERS,
	filterBar: true,
}

const LEGACY_SETTINGS = "ctc-roadmap-settings"
const LEGACY_COLORS = "ctc-roadmap-colors"

function textList(value: unknown, fallback: string[]): string[] {
	if (!Array.isArray(value)) return [...fallback]
	return value.filter((e): e is string => typeof e === "string" && e.trim() !== "" && e.length < 200).slice(0, 100)
}

/** Clamps any view-shaped value (storage, view codes) to what the settings allow. */
export function sanitize(value: unknown): View {
	const r = value !== null && typeof value === "object" ? (value as Record<string, unknown>) : {}
	return {
		...DEFAULT_VIEW,
		...(r as Partial<View>),
		view: r.view === "coverage" ? "coverage" : "kanban",
		tagTerms: textList(r.tagTerms, DEFAULT_VIEW.tagTerms),
		productTerms: textList(r.productTerms, DEFAULT_VIEW.productTerms),
		availableTerms: textList(r.availableTerms, DEFAULT_VIEW.availableTerms),
		roadmapTerms: textList(r.roadmapTerms, DEFAULT_VIEW.roadmapTerms),
		exportSlide: typeof r.exportSlide === "boolean" ? r.exportSlide : DEFAULT_VIEW.exportSlide,
		done: isHexColor(r.done) ? r.done : DEFAULT_VIEW.done,
		todo: isHexColor(r.todo) ? r.todo : DEFAULT_VIEW.todo,
		showMissing: typeof r.showMissing === "boolean" ? r.showMissing : DEFAULT_VIEW.showMissing,
		filters: (r.filters as View["filters"]) ?? EMPTY_FILTERS,
		filterBar: typeof r.filterBar === "boolean" ? r.filterBar : true,
	}
}

/** Defaults, seeded from the previous version's per-browser settings when present. */
export function initialView(): View {
	try {
		const s = window.localStorage.getItem(LEGACY_SETTINGS)
		const c = window.localStorage.getItem(LEGACY_COLORS)
		if (!s && !c) return DEFAULT_VIEW
		const colors = c ? (JSON.parse(c) as Record<string, unknown>) : {}
		return sanitize({ ...(s ? JSON.parse(s) : {}), done: colors.done, todo: colors.todo, filters: EMPTY_FILTERS })
	} catch {
		return DEFAULT_VIEW
	}
}
