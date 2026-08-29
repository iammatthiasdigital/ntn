import assert from "node:assert/strict"
import { test } from "node:test"
import {
	countryNameFromIso2,
	flagEmoji,
	resolveCountry,
} from "../blocks/ctc-roadmap-view/src/countries"
import {
	availableYears,
	defaultYear,
	featuresForQuarter,
	isQuarterComplete,
	matchesBoardFilter,
	parseEta,
	rowsToFeatures,
	toStringList,
} from "../blocks/ctc-roadmap-view/src/roadmap"
import type { RawRow } from "../blocks/ctc-roadmap-view/src/types"

function row(overrides: Partial<RawRow>): RawRow {
	return {
		id: "r1",
		title: "France",
		tags: [{ name: "Mandate" }],
		product: { name: "Compliance Transactions" },
		eta: { start: "2026-04-01" },
		country: "FR",
		scopes: [{ name: "B2B" }],
		...overrides,
	}
}

test("toStringList flattens strings, option objects, and arrays", () => {
	assert.deepEqual(toStringList("B2B"), ["B2B"])
	assert.deepEqual(toStringList({ name: "B2G" }), ["B2G"])
	assert.deepEqual(toStringList([{ name: "a" }, "b", null]), ["a", "b"])
	assert.deepEqual(toStringList(undefined), [])
	assert.deepEqual(toStringList("  "), [])
})

test("parseEta handles dates, date objects, and quarter spellings", () => {
	assert.deepEqual(parseEta("2026-02-15"), { year: 2026, quarter: 1 })
	assert.deepEqual(parseEta({ start: "2026-12-31" }), { year: 2026, quarter: 4 })
	assert.deepEqual(parseEta("Q3 2026"), { year: 2026, quarter: 3 })
	assert.deepEqual(parseEta("q3/2026"), { year: 2026, quarter: 3 })
	assert.deepEqual(parseEta("2026-Q1"), { year: 2026, quarter: 1 })
	assert.deepEqual(parseEta(new Date(2026, 6, 1)), { year: 2026, quarter: 3 })
	assert.equal(parseEta("soon"), null)
	assert.equal(parseEta(null), null)
	assert.equal(parseEta({ start: null }), null)
})

test("board filter is case-insensitive on tag and product", () => {
	assert.equal(matchesBoardFilter(row({})), true)
	assert.equal(
		matchesBoardFilter(
			row({ tags: ["MANDATE"], product: "compliance TRANSACTIONS" })
		),
		true
	)
	assert.equal(matchesBoardFilter(row({ tags: [{ name: "invoicing" }] })), false)
	assert.equal(matchesBoardFilter(row({ product: { name: "Tax" } })), false)
	assert.equal(matchesBoardFilter(row({ tags: [] })), false)
	// multi_select products still match when one option is the product
	assert.equal(
		matchesBoardFilter(
			row({ product: [{ name: "Compliance transactions" }, { name: "Other" }] })
		),
		true
	)
})

test("country resolution: ISO codes, names, aliases, diacritics", () => {
	assert.equal(countryNameFromIso2("FR"), "France")
	assert.deepEqual(resolveCountry("de"), { name: "Germany", iso2: "DE" })
	assert.deepEqual(resolveCountry("France"), { name: "France", iso2: "FR" })
	assert.equal(resolveCountry("USA")?.iso2, "US")
	assert.equal(resolveCountry("UAE")?.iso2, "AE")
	assert.equal(resolveCountry("Türkiye")?.iso2, "TR")
	assert.equal(resolveCountry("Turkey")?.iso2, "TR")
	assert.equal(resolveCountry("South Korea")?.iso2, "KR")
	assert.equal(resolveCountry("new zealand")?.iso2, "NZ")
	// Unknown input passes through as the display name
	assert.deepEqual(resolveCountry("Atlantis"), { name: "Atlantis", iso2: null })
	assert.equal(resolveCountry(""), null)
	assert.equal(flagEmoji("FR"), "🇫🇷")
})

test("rowsToFeatures filters, resolves, and buckets", () => {
	const features = rowsToFeatures([
		row({ id: "a", country: "PE", eta: { start: "2026-01-15" } }),
		row({ id: "b", country: "Poland", eta: { start: "2026-02-01" } }),
		row({ id: "c", country: "DE", tags: [{ name: "other" }] }),
		row({ id: "d", country: "ES", eta: null }),
	])
	assert.deepEqual(
		features.map((f) => f.countryName),
		["Peru", "Poland", "Spain"]
	)
	const q1 = featuresForQuarter(features, 2026, 1)
	assert.deepEqual(
		q1.map((f) => f.countryName),
		["Peru", "Poland"]
	)
	assert.deepEqual(availableYears(features), [2026])
})

test("falls back to the title when no country property is bound", () => {
	const features = rowsToFeatures([row({ country: undefined, title: "Japan" })])
	assert.equal(features[0].countryName, "Japan")
	assert.equal(features[0].iso2, "JP")
})

test("defaultYear prefers current, then next upcoming, then last", () => {
	const now = new Date(2026, 7, 29)
	assert.equal(defaultYear([2025, 2026, 2027], now), 2026)
	assert.equal(defaultYear([2027, 2028], now), 2027)
	assert.equal(defaultYear([2024, 2025], now), 2025)
	assert.equal(defaultYear([], now), 2026)
})

test("quarter completion is relative to now", () => {
	const now = new Date(2026, 7, 29) // Aug 29, 2026 → Q3
	assert.equal(isQuarterComplete(2026, 1, now), true)
	assert.equal(isQuarterComplete(2026, 2, now), true)
	assert.equal(isQuarterComplete(2026, 3, now), false)
	assert.equal(isQuarterComplete(2026, 4, now), false)
	assert.equal(isQuarterComplete(2025, 4, now), true)
	assert.equal(isQuarterComplete(2027, 1, now), false)
})
