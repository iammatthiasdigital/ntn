import { test } from "node:test"
import assert from "node:assert/strict"
import { filterEmpty, filterFrom, mergeRows, nextStart, pageKey } from "../blocks/workload-view/src/kit/allRows.ts"

const row = (id: string, when?: string, n?: number) => ({ id, propertiesById: { d: when ? { type: "date", start_date: when } : undefined, n } as Record<string, unknown> })

test("pages by the first date property, else a number", () => {
	assert.deepEqual(pageKey({ t: { type: "title" }, n: { type: "number" }, d: { type: "date" } }), { id: "d", kind: "date" })
	assert.deepEqual(pageKey({ n: { type: "number" } }), { id: "n", kind: "number" })
	assert.equal(pageKey({ t: { type: "title" } }), null)
})

test("the next page starts at the last value; empties are queried apart", () => {
	const k = { id: "d", kind: "date" as const }
	assert.equal(nextStart(k, [row("a", "2026-01-01"), row("b", "2026-02-01"), row("c")]), "2026-02-01")
	assert.deepEqual(filterFrom(k, "2026-02-01"), { propertyId: "d", date: { on_or_after: "2026-02-01" } })
	assert.deepEqual(filterEmpty({ id: "n", kind: "number" }), { propertyId: "n", number: { is_empty: true } })
	assert.equal(nextStart({ id: "n", kind: "number" }, [row("a", undefined, 3), row("b", undefined, 7)]), 7)
})

test("boundary rows are merged by id", () => {
	const merged = mergeRows([[row("a"), row("b")], [row("b"), row("c")]])
	assert.deepEqual(merged.map((r) => r.id), ["a", "b", "c"])
})

test("From–To is read one Monday-based week per query", async () => {
	const { weeksOf, weekFilter } = await import("../blocks/workload-view/src/kit/allRows.ts")
	// Wed 2026-09-09 to Tue 2026-09-22: three weeks, from Monday the 7th.
	assert.deepEqual(weeksOf("2026-09-09", "2026-09-22"), [
		["2026-09-07", "2026-09-14"],
		["2026-09-14", "2026-09-21"],
		["2026-09-21", "2026-09-28"],
	])
	assert.equal(weeksOf("2026-01-01", "2026-12-31").length, 53)
	assert.deepEqual(weekFilter("d", ["2026-09-07", "2026-09-14"]), { and: [{ propertyId: "d", date: { on_or_after: "2026-09-07" } }, { propertyId: "d", date: { before: "2026-09-14" } }] })
})
