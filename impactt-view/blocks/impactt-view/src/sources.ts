/**
 * Shared types for the data layer: what the view receives from either the
 * hosted Notion hook or the standalone mock, and how it writes back.
 */
import type { Resolvers } from "./filters/core"
import type { Sources } from "./dataset"
import type { Growth, Timing } from "./model"

/** Write-backs; each resolves to an error message, or null on success. */
export type Writer = {
	setTiming: (initiativeId: string, v: Timing | null) => Promise<string | null>
	setGrowth: (initiativeId: string, v: Growth) => Promise<string | null>
	setGoal: (kpiId: string, value: number | null) => Promise<string | null>
	/** `YYYY-MM`: stored as the month's last day. */
	setGoalBy: (kpiId: string, ym: string) => Promise<string | null>
}

export type ImpacttData =
	| { status: "loading" }
	| { status: "unbound"; missing: string[] }
	| {
			status: "ready"
			sources: Sources
			resolvers: Resolvers
			writer: Writer | null
			/** Where filters and view settings are remembered. */
			storageKey: string
	  }

export const TIMING_NAMES: Record<Timing, string> = { flexible: "Timeline moves", fixed: "Impact changes" }
export const GROWTH_NAMES: Record<Growth, string> = { linear: "Linear", exp: "Exponential" }

export function lastDayOf(ym: string): string {
	const [y, m] = ym.split("-").map(Number)
	return `${ym}-${String(new Date(y, m, 0).getDate()).padStart(2, "0")}`
}
