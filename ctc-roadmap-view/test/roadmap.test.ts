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
	joinedText,
	matchesBoardFilter,
	matchesProductName,
	parseEta,
	relationIds,
	rowsToFeatures,
	toStringList,
	type RowFilterContext,
} from "../blocks/ctc-roadmap-view/src/roadmap"
import type { RawRow } from "../blocks/ctc-roadmap-view/src/types"

const PRODUCTS: ReadonlyMap<string, string | null> = new Map([
	["prod-ctc", "Compliance Transaction"],
	["prod-tax", "Tax Reporting"],
	["prod-broken", null],
])

const CTX: RowFilterContext = {
	tagsBound: true,
	productBound: true,
	productTitleById: PRODUCTS,
}

function row(overrides: Partial<RawRow>): RawRow {
	return {
		id: "r1",
		title: "France",
		tags: [{ name: "Mandate" }],
		product: [{ id: "prod-ctc", table: "block" }],
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

test("joinedText merges rich-text runs", () => {
	assert.equal(joinedText(["K", "R"]), "KR")
	assert.equal(joinedText("  KR "), "KR")
	assert.equal(joinedText([{ plain_text: "South " }, { plain_text: "Korea" }]), "South Korea")
	assert.equal(joinedText(undefined), "")
})

test("relationIds extracts pointer arrays only", () => {
	assert.deepEqual(
		relationIds([{ id: "a", table: "block" }, { id: "b", table: "block" }]),
		["a", "b"]
	)
	assert.deepEqual(relationIds([{ name: "B2B" }]), [])
	assert.deepEqual(relationIds("Compliance"), [])
})

test("parseEta handles dates, date objects, and quarter spellings", () => {
	assert.deepEqual(parseEta("2026-02-15"), { year: 2026, quarter: 1 })
	assert.deepEqual(parseEta({ start: "2026-12-31" }), { year: 2026, quarter: 4 })
	assert.deepEqual(parseEta({ start_date: "2026-12-31" }), { year: 2026, quarter: 4 })
	assert.deepEqual(parseEta("Q3 2026"), { year: 2026, quarter: 3 })
	assert.deepEqual(parseEta("2026-Q1"), { year: 2026, quarter: 1 })
	assert.deepEqual(parseEta(new Date(2026, 6, 1)), { year: 2026, quarter: 3 })
	assert.equal(parseEta("soon"), null)
	assert.equal(parseEta(null), null)
})

test("product matching accepts singular and plural, any case", () => {
	assert.equal(matchesProductName("Compliance transactions"), true)
	assert.equal(matchesProductName("Compliance Transaction"), true)
	assert.equal(matchesProductName("compliance TRANSACTION"), true)
	assert.equal(matchesProductName("Compliance  transactions "), true)
	assert.equal(matchesProductName("Tax Reporting"), false)
})

test("board filter resolves relation products through the title map", () => {
	assert.equal(matchesBoardFilter(row({}), CTX), true)
	assert.equal(
		matchesBoardFilter(row({ product: [{ id: "prod-tax", table: "block" }] }), CTX),
		false
	)
	// Plain select/text values still work
	assert.equal(matchesBoardFilter(row({ product: "compliance TRANSACTIONS" }), CTX), true)
	assert.equal(matchesBoardFilter(row({ tags: ["MANDATE"] }), CTX), true)
	assert.equal(matchesBoardFilter(row({ tags: [{ name: "invoicing" }] }), CTX), false)
})

test("unbound filter slots are skipped instead of dropping everything", () => {
	const unboundProduct: RowFilterContext = { ...CTX, productBound: false }
	assert.equal(matchesBoardFilter(row({ product: undefined }), unboundProduct), true)
	const unboundTags: RowFilterContext = { ...CTX, tagsBound: false }
	assert.equal(matchesBoardFilter(row({ tags: undefined }), unboundTags), true)
	// But a bound-and-empty property still fails the filter
	assert.equal(matchesBoardFilter(row({ tags: [] }), CTX), false)
})

test("unreadable product relations are counted, not silently dropped", () => {
	const result = rowsToFeatures(
		[
			row({ id: "ok" }),
			row({ id: "broken", product: [{ id: "prod-broken", table: "block" }] }),
			row({ id: "missing", product: [{ id: "prod-unknown", table: "block" }] }),
		],
		CTX
	)
	assert.equal(result.features.length, 1)
	assert.equal(result.unreadableProduct, 2)
})

test("country resolution: ISO codes, names, aliases, messy input", () => {
	assert.equal(countryNameFromIso2("FR"), "France")
	assert.deepEqual(resolveCountry("de"), { name: "Germany", iso2: "DE" })
	assert.equal(resolveCountry("KR")?.name, "South Korea")
	assert.equal(resolveCountry(" kr ")?.iso2, "KR")
	assert.equal(resolveCountry("KR ")?.iso2, "KR")
	assert.equal(resolveCountry("KR - South Korea")?.iso2, "KR")
	assert.equal(resolveCountry("Korea (KR)")?.iso2, "KR")
	assert.equal(resolveCountry("USA")?.iso2, "US")
	assert.equal(resolveCountry("UAE")?.iso2, "AE")
	assert.equal(resolveCountry("Türkiye")?.iso2, "TR")
	assert.equal(resolveCountry("Turkey")?.iso2, "TR")
	assert.deepEqual(resolveCountry("Atlantis"), { name: "Atlantis", iso2: null })
	assert.equal(resolveCountry(""), null)
	assert.equal(flagEmoji("FR"), "🇫🇷")
})

test("rowsToFeatures filters, resolves fragmented countries, and buckets", () => {
	const { features } = rowsToFeatures(
		[
			row({ id: "a", country: "PE", eta: { start: "2026-01-15" } }),
			row({ id: "b", country: ["K", "R"], eta: { start: "2026-02-01" } }),
			row({ id: "c", country: "DE", tags: [{ name: "other" }] }),
			row({ id: "d", country: "ES", eta: null }),
		],
		CTX
	)
	assert.deepEqual(
		features.map((f) => f.countryName),
		["Peru", "South Korea", "Spain"]
	)
	assert.deepEqual(
		featuresForQuarter(features, 2026, 1).map((f) => f.countryName),
		["Peru", "South Korea"]
	)
	assert.deepEqual(availableYears(features), [2026])
})

test("falls back to the title when the country cell doesn't resolve", () => {
	const { features } = rowsToFeatures(
		[
			row({ country: undefined, title: "Japan" }),
			row({ id: "r2", country: "tbd", title: "Japan mandate rollout" }),
		],
		CTX
	)
	assert.equal(features[0].iso2, "JP")
	// "tbd" doesn't resolve and neither does the title — country text passes through
	assert.equal(features[1].countryName, "tbd")
	assert.equal(features[1].iso2, null)
})

test("defaultYear prefers current, then next upcoming, then last", () => {
	const now = new Date(2026, 8, 2)
	assert.equal(defaultYear([2025, 2026, 2027], now), 2026)
	assert.equal(defaultYear([2027, 2028], now), 2027)
	assert.equal(defaultYear([2024, 2025], now), 2025)
	assert.equal(defaultYear([], now), 2026)
})

test("quarter completion is relative to now", () => {
	const now = new Date(2026, 8, 2) // Sep 2, 2026 → Q3
	assert.equal(isQuarterComplete(2026, 2, now), true)
	assert.equal(isQuarterComplete(2026, 3, now), false)
	assert.equal(isQuarterComplete(2025, 4, now), true)
	assert.equal(isQuarterComplete(2027, 1, now), false)
})
