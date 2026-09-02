import { resolveCountry } from "./countries"
import type { Feature, QuarterRef, RawRow } from "./types"

export const MANDATE_TAG = "mandate"
/** Normalized singular form; "Compliance transaction(s)" both match. */
export const PRODUCT_NAME = "compliance transaction"

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

/**
 * Join a value's string fragments into one string. Unlike firstString this
 * survives rich text split into several runs (["K", "R"] → "KR").
 */
export function joinedText(value: unknown): string {
	return collectText(value).trim()
}

function collectText(value: unknown): string {
	if (value === null || value === undefined) return ""
	if (typeof value === "string") return value
	if (Array.isArray(value)) return value.map(collectText).join("")
	if (typeof value === "object") {
		const record = value as Record<string, unknown>
		for (const key of ["name", "plain_text", "content", "value"]) {
			if (typeof record[key] === "string") return record[key] as string
		}
	}
	return ""
}

export function firstString(value: unknown): string | null {
	return toStringList(value)[0] ?? null
}

/** Relation pointer ids ({id, table} entries) inside a property value. */
export function relationIds(value: unknown): string[] {
	if (!Array.isArray(value)) return []
	const ids: string[] = []
	for (const entry of value) {
		if (
			entry !== null &&
			typeof entry === "object" &&
			"id" in entry &&
			typeof (entry as { id: unknown }).id === "string" &&
			!("name" in entry) &&
			!("plain_text" in entry)
		) {
			ids.push((entry as { id: string }).id)
		}
	}
	return ids
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

function normalizeEnum(value: string): string {
	return value.trim().toLowerCase().replace(/\s+/g, " ")
}

export function matchesTag(values: string[]): boolean {
	return values.some((value) => normalizeEnum(value) === MANDATE_TAG)
}

/** "Compliance transaction" / "Compliance Transactions" both match. */
export function matchesProductName(name: string): boolean {
	return normalizeEnum(name).replace(/s$/, "") === PRODUCT_NAME
}

/**
 * How the board reads each row's filter properties. `tagsBound` /
 * `productBound` are false when the manifest slot has no mapped property —
 * an unbound filter is skipped instead of dropping every row.
 * `productTitleById` carries resolved titles for relation-shaped product
 * values (null = the related page could not be read).
 */
export type RowFilterContext = {
	tagsBound: boolean
	productBound: boolean
	productTitleById: ReadonlyMap<string, string | null>
}

export const MATCH_ALL_CONTEXT: RowFilterContext = {
	tagsBound: true,
	productBound: true,
	productTitleById: new Map(),
}

type RowVerdict = "match" | "no-match" | "unreadable-product"

function judgeRow(row: RawRow, context: RowFilterContext): RowVerdict {
	if (context.tagsBound && !matchesTag(toStringList(row.tags))) {
		return "no-match"
	}
	if (!context.productBound) return "match"
	const pointerIds = relationIds(row.product)
	if (pointerIds.length > 0) {
		const titles = pointerIds
			.map((id) => context.productTitleById.get(id))
			.filter((title): title is string => typeof title === "string")
		if (titles.length === 0) return "unreadable-product"
		return titles.some(matchesProductName) ? "match" : "no-match"
	}
	return toStringList(row.product).some(matchesProductName)
		? "match"
		: "no-match"
}

/** Tag includes "mandate" and product is "Compliance transaction(s)". */
export function matchesBoardFilter(
	row: RawRow,
	context: RowFilterContext = MATCH_ALL_CONTEXT
): boolean {
	return judgeRow(row, context) === "match"
}

export function toFeature(row: RawRow): Feature {
	const countryInput = joinedText(row.country)
	const resolved = resolveCountry(countryInput)
	const title = joinedText(row.title)
	// A country that resolves to a real region wins; otherwise give the
	// title a chance (covers rows where the country cell holds free text).
	const fromTitle = resolved?.iso2 ? null : resolveCountry(title)
	const best = resolved?.iso2 ? resolved : (fromTitle?.iso2 ? fromTitle : resolved ?? fromTitle)
	return {
		id: row.id,
		countryName: best?.name ?? (title || "Unknown"),
		iso2: best?.iso2 ?? null,
		scopes: toStringList(row.scopes),
		eta: parseEta(row.eta),
	}
}

export type BoardRows = {
	features: Feature[]
	/** Rows dropped because their product relation could not be read. */
	unreadableProduct: number
}

/** Filter raw rows down to the board's features. */
export function rowsToFeatures(
	rows: RawRow[],
	context: RowFilterContext = MATCH_ALL_CONTEXT
): BoardRows {
	const features: Feature[] = []
	let unreadableProduct = 0
	for (const row of rows) {
		const verdict = judgeRow(row, context)
		if (verdict === "match") features.push(toFeature(row))
		else if (verdict === "unreadable-product") unreadableProduct += 1
	}
	return { features, unreadableProduct }
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
