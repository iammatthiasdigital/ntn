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

test("paging keeps the scope's filter", async () => {
	const { both } = await import("../blocks/workload-view/src/kit/allRows.ts")
	const scope = { propertyId: "p", select: { equals: "Checkout" } }
	const from = { propertyId: "d", date: { on_or_after: "2026-09-07" } }
	assert.deepEqual(both(scope, from), { and: [scope, from] })
	assert.deepEqual(both({ and: [scope] }, from), { and: [scope, from] })
	assert.equal(both(undefined, from), from)
})
