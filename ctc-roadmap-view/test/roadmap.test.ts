import assert from "node:assert/strict"
import { test } from "node:test"
import {
	accentFor,
	isHexColor,
	withAlpha,
} from "../blocks/ctc-roadmap-view/src/colors"
import {
	countryNameFromIso2,
	flagEmoji,
	resolveCountry,
} from "../blocks/ctc-roadmap-view/src/countries"
import {
	availableYears,
	defaultYear,
	featuresForQuarter,
	filterOptions,
	fitTo169,
	isQuarterComplete,
	joinedText,
	makeContext,
	matchesBoardFilter,
	matchesProductName,
	parseEta,
	relationIds,
	rowsToCoverage,
	rowsToFeatures,
	toStringList,
} from "../blocks/ctc-roadmap-view/src/roadmap"
import type { RawRow } from "../blocks/ctc-roadmap-view/src/types"

const PRODUCTS: ReadonlyMap<string, string | null> = new Map([
	["prod-ctc", "Compliance Transaction"],
	["prod-tax", "Tax Reporting"],
	["prod-broken", null],
])

const CTX = makeContext({ productTitleById: PRODUCTS })

function row(overrides: Partial<RawRow>): RawRow {
	return {
		id: "r1",
		title: "France",
		tags: [{ name: "Mandate" }],
		product: [{ id: "prod-ctc", table: "block" }],
		eta: { start: "2026-04-01" },
		country: "FR",
		scopes: [{ name: "B2B" }],
		salesStatus: "Roadmap",
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

test("product matching accepts singular and plural, any case, custom terms", () => {
	assert.equal(matchesProductName("Compliance transactions"), true)
	assert.equal(matchesProductName("Compliance Transaction"), true)
	assert.equal(matchesProductName("compliance TRANSACTION"), true)
	assert.equal(matchesProductName("Tax Reporting"), false)
	assert.equal(matchesProductName("Tax Reports", "tax report"), true)
	assert.equal(matchesProductName("Compliance Transaction", "tax report"), false)
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

test("filter terms are configurable multi-selects", () => {
	const custom = makeContext({
		productTitleById: PRODUCTS,
		tagTerms: ["Regulatory", "mandate"],
		productTerms: ["tax reporting", "Compliance transaction"],
	})
	const taxRow = row({
		tags: ["regulatory"],
		product: [{ id: "prod-tax", table: "block" }],
	})
	assert.equal(matchesBoardFilter(taxRow, custom), true)
	assert.equal(matchesBoardFilter(row({}), custom), true)
	// Empty selections switch the filter off entirely
	const off = makeContext({
		productTitleById: PRODUCTS,
		tagTerms: [],
		productTerms: [],
	})
	assert.equal(matchesBoardFilter(row({ tags: ["anything"] }), off), true)
})

test("scope filter applies when scopes are selected", () => {
	const b2c = makeContext({ productTitleById: PRODUCTS, scopeTerms: ["b2c"] })
	assert.equal(matchesBoardFilter(row({ scopes: ["B2B", "B2C"] }), b2c), true)
	assert.equal(matchesBoardFilter(row({ scopes: ["B2B"] }), b2c), false)
	// Empty selection = scope filter off
	assert.equal(matchesBoardFilter(row({ scopes: ["B2B"] }), CTX), true)
})

test("unbound filter slots are skipped instead of dropping everything", () => {
	const unboundProduct = makeContext({
		productTitleById: PRODUCTS,
		productBound: false,
	})
	assert.equal(matchesBoardFilter(row({ product: undefined }), unboundProduct), true)
	const unboundTags = makeContext({ productTitleById: PRODUCTS, tagsBound: false })
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

test("coverage lanes: shared filters, sales status any case, distinct countries", () => {
	const coverage = rowsToCoverage(
		[
			row({ id: "a1", country: "DE", salesStatus: "AVAILABLE" }),
			// same country twice, different spellings → one entry
			row({ id: "a2", country: "germany", salesStatus: "Available" }),
			row({ id: "a3", country: "FR", salesStatus: { name: "available" } }),
			// roadmap lane
			row({ id: "r1", country: "KR", salesStatus: "Roadmap" }),
			row({ id: "r2", country: "South Korea", salesStatus: "roadmap" }),
			// the shared tag filter applies to coverage too
			row({ id: "x0", tags: ["other"], country: "AT", salesStatus: "Available" }),
			// wrong product → dropped
			row({
				id: "x1",
				country: "IT",
				salesStatus: "Available",
				product: [{ id: "prod-tax", table: "block" }],
			}),
			// no matching status → ignored
			row({ id: "x2", country: "ES", salesStatus: "Lost" }),
		],
		CTX
	)
	assert.deepEqual(
		coverage.available.map((f) => f.countryName),
		["France", "Germany"]
	)
	assert.deepEqual(
		coverage.roadmap.map((f) => f.countryName),
		["South Korea"]
	)
	// Scope selection narrows coverage as well
	const b2g = rowsToCoverage(
		[
			row({ id: "s1", country: "DE", salesStatus: "Available", scopes: ["B2G"] }),
			row({ id: "s2", country: "FR", salesStatus: "Available", scopes: ["B2B"] }),
		],
		makeContext({ productTitleById: PRODUCTS, scopeTerms: ["b2g"] })
	)
	assert.deepEqual(
		b2g.available.map((f) => f.countryName),
		["Germany"]
	)
})

test("filterOptions renders distinct values from the database", () => {
	const options = filterOptions(
		[
			row({ id: "a", tags: ["Mandate", "compliance"], scopes: ["B2B", "B2G"] }),
			row({
				id: "b",
				tags: ["MANDATE"],
				scopes: ["b2b"],
				salesStatus: "Available",
				product: "Custom product",
			}),
		],
		PRODUCTS
	)
	assert.deepEqual(options.tags, ["compliance", "Mandate"])
	assert.deepEqual(options.products, ["Compliance Transaction", "Custom product"])
	assert.deepEqual(options.scopes, ["B2B", "B2G"])
	assert.deepEqual(options.statuses, ["Available", "Roadmap"])
})

test("coverage respects custom status terms and unbound status slot", () => {
	const custom = makeContext({
		productTitleById: PRODUCTS,
		availableTerms: ["Live"],
	})
	const live = rowsToCoverage(
		[row({ id: "a", country: "AT", salesStatus: "live" })],
		custom
	)
	assert.equal(live.available.length, 1)
	const unbound = makeContext({ productTitleById: PRODUCTS, statusBound: false })
	const none = rowsToCoverage(
		[row({ id: "a", country: "AT", salesStatus: "Available" })],
		unbound
	)
	assert.deepEqual([none.available.length, none.roadmap.length], [0, 0])
})

test("country resolution: ISO codes, names, aliases, messy input", () => {
	assert.equal(countryNameFromIso2("FR"), "France")
	assert.deepEqual(resolveCountry("de"), { name: "Germany", iso2: "DE" })
	assert.equal(resolveCountry("KR")?.name, "South Korea")
	assert.equal(resolveCountry(" kr ")?.iso2, "KR")
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
	assert.equal(features[1].countryName, "tbd")
	assert.equal(features[1].iso2, null)
})

test("lane colors: validation, soft alpha, and legible accents", () => {
	assert.equal(isHexColor("#def15d"), true)
	assert.equal(isHexColor("def15d"), false)
	assert.equal(isHexColor("#def15dff"), false)
	assert.equal(withAlpha("#def15d", "26"), "#def15d26")
	assert.equal(withAlpha("#0054ff", "10"), "#0054ff10")

	function brightness(hex: string): number {
		return (
			parseInt(hex.slice(1, 3), 16) +
			parseInt(hex.slice(3, 5), 16) +
			parseInt(hex.slice(5, 7), 16)
		)
	}
	for (const base of ["#def15d", "#0054ff"]) {
		const light = accentFor(base, "light")
		const dark = accentFor(base, "dark")
		assert.match(light, /^#[0-9a-f]{6}$/)
		assert.match(dark, /^#[0-9a-f]{6}$/)
		assert.ok(brightness(light) < brightness(base), `${base} light accent darker`)
		assert.ok(brightness(dark) >= brightness(base), `${base} dark accent lighter`)
	}
})

test("fitTo169 returns the smallest containing 16:9 canvas", () => {
	assert.deepEqual(fitTo169(3200, 1000), { width: 3200, height: 1800 })
	const tall = fitTo169(1000, 3000)
	assert.ok(tall.width >= 1000 && tall.height >= 3000)
	assert.ok(Math.abs(tall.width / tall.height - 16 / 9) < 0.01)
	const exact = fitTo169(1600, 900)
	assert.deepEqual(exact, { width: 1600, height: 900 })
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
