import { resolveCountry } from "./countries"
import type { Feature, QuarterRef, RawRow } from "./types"

export const MANDATE_TAG = "mandate"
export const PRODUCT_NAME = "compliance transactions"

/**
 * Flatten a property value of unknown shape (string, {name}, rich text
 * fragments, or arrays of any of those) into a list of plain strings.
 */
export function toStringList(value: unknown): string[] {
	if (value === null || value === undefined) return []
	if (typeof value === "string") {
		const trimmed = value.trim()
		return trimmed === "" ? [] : [trimmed]
	}
	if (Array.isArray(value)) return value.flatMap(toStringList)
	if (typeof value === "object") {
		const record = value as Record<string, unknown>
		for (const key of ["name", "plain_text", "content", "value"]) {
			if (typeof record[key] === "string") return toStringList(record[key])
		}
	}
	return []
}

export function firstString(value: unknown): string | null {
	return toStringList(value)[0] ?? null
}

function quarterOfMonth(monthIndex: number): number {
	return Math.floor(monthIndex / 3) + 1
}

/**
 * Read an ETA of unknown shape into a quarter. Accepts date objects
 * ({start: ...} or Date), ISO date strings, and quarter spellings such as
 * "Q3 2026", "2026-Q3", or "2026/Q3".
 */
export function parseEta(value: unknown): QuarterRef | null {
	if (value === null || value === undefined) return null
	if (value instanceof Date && !Number.isNaN(value.getTime())) {
		return { year: value.getFullYear(), quarter: quarterOfMonth(value.getMonth()) }
	}
	if (typeof value === "object" && !Array.isArray(value)) {
		const record = value as Record<string, unknown>
		for (const key of ["start", "start_date", "date"]) {
			if (key in record) {
				const parsed = parseEta(record[key])
				if (parsed) return parsed
			}
		}
		return null
	}
	if (Array.isArray(value)) {
		for (const entry of value) {
			const parsed = parseEta(entry)
			if (parsed) return parsed
		}
		return null
	}
	if (typeof value !== "string") return null
	const text = value.trim()
	if (text === "") return null

	const quarterFirst = /^q([1-4])\s*[\s\-/·.]\s*(\d{4})$/i.exec(text)
	if (quarterFirst) {
		return { year: Number(quarterFirst[2]), quarter: Number(quarterFirst[1]) }
	}
	const yearFirst = /^(\d{4})\s*[\s\-/·.]\s*q([1-4])$/i.exec(text)
	if (yearFirst) {
		return { year: Number(yearFirst[1]), quarter: Number(yearFirst[2]) }
	}
	const isoDate = /^(\d{4})-(\d{2})(?:-(\d{2}))?/.exec(text)
	if (isoDate) {
		const month = Number(isoDate[2])
		if (month >= 1 && month <= 12) {
			return { year: Number(isoDate[1]), quarter: quarterOfMonth(month - 1) }
		}
	}
	return null
}

function containsIgnoreCase(values: string[], wanted: string): boolean {
	return values.some((value) => value.trim().toLowerCase() === wanted)
}

/** Tag includes "mandate" and product is "Compliance transactions" — both case-insensitive. */
export function matchesBoardFilter(row: RawRow): boolean {
	return (
		containsIgnoreCase(toStringList(row.tags), MANDATE_TAG) &&
		containsIgnoreCase(toStringList(row.product), PRODUCT_NAME)
	)
}

export function toFeature(row: RawRow): Feature {
	const countryInput = firstString(row.country) ?? firstString(row.title) ?? ""
	const resolved = resolveCountry(countryInput)
	return {
		id: row.id,
		countryName: resolved?.name ?? firstString(row.title) ?? "Unknown",
		iso2: resolved?.iso2 ?? null,
		scopes: toStringList(row.scopes),
		eta: parseEta(row.eta),
	}
}

/** Filter raw rows down to the board's features. */
export function rowsToFeatures(rows: RawRow[]): Feature[] {
	return rows.filter(matchesBoardFilter).map(toFeature)
}

/** Years that have at least one scheduled feature, ascending. */
export function availableYears(features: Feature[]): number[] {
	const years = new Set<number>()
	for (const feature of features) {
		if (feature.eta) years.add(feature.eta.year)
	}
	return [...years].sort((a, b) => a - b)
}

/** Prefer the current year, else the nearest upcoming year, else the last. */
export function defaultYear(years: number[], now: Date): number {
	const current = now.getFullYear()
	if (years.length === 0) return current
	if (years.includes(current)) return current
	const upcoming = years.find((year) => year > current)
	return upcoming ?? years[years.length - 1]
}

export function featuresForQuarter(
	features: Feature[],
	year: number,
	quarter: number
): Feature[] {
	return features
		.filter((f) => f.eta !== null && f.eta.year === year && f.eta.quarter === quarter)
		.sort((a, b) => a.countryName.localeCompare(b.countryName))
}

export function unscheduledCount(features: Feature[]): number {
	return features.filter((f) => f.eta === null).length
}

/** A quarter is complete once its last day is in the past. */
export function isQuarterComplete(year: number, quarter: number, now: Date): boolean {
	const firstOfNext = new Date(year, quarter * 3, 1)
	return now.getTime() >= firstOfNext.getTime()
}
