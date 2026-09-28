import { test } from "node:test"
import assert from "node:assert/strict"
import { burn, toDay } from "../blocks/burnup-view/src/burn.ts"
import type { SourceSnapshot } from "../blocks/burnup-view/src/kit/sources.ts"

const d = (s: string) => ({ type: "date", start_date: s })
function src(rows: Record<string, unknown>[]): SourceSnapshot {
	return {
		bound: true,
		truncated: false,
		propertySchemasById: { est: { name: "Estimate", type: "number" }, added: { name: "Added", type: "date" }, done: { name: "Done", type: "date" } },
		propertyIdsByKey: { estimate: "est", added: "added", done: "done" },
		items: rows.map((v, i) => ({ id: `r${i}`, propertiesById: { est: v.estimate, added: v.added, done: v.done }, propertiesByKey: v })),
	}
}
const S = src([
	{ name: "A", estimate: 5, added: d("2026-09-01"), done: d("2026-09-07") },
	{ name: "B", estimate: 3, added: d("2026-09-01"), done: d("2026-09-14") },
	{ name: "C", estimate: 2, added: d("2026-09-10") },
	{ name: "D", estimate: 4, added: d("2026-09-20") },
	{ name: "no date" },
])
const base = { today: "2026-09-21", start: null, target: null, window: 4, bucket: "week" as const }

test("scope and done add up by date; rows without dates are counted", () => {
	const B = burn(S, null, { ...base, measure: null })
	assert.equal(B.scopeNow, 4)
	assert.equal(B.doneNow, 2)
	assert.equal(B.skipped, 1)
	const sized = burn(S, null, { ...base, measure: "est" })
	assert.equal(sized.scopeNow, 14)
	assert.equal(sized.doneNow, 8)
	assert.equal(sized.points[0].t, toDay("2026-08-31"))
})

test("forecast extends recent velocity until done meets scope", () => {
	const B = burn(S, null, { ...base, measure: "est" })
	// 8 done over the window; 6 left.
	assert.ok(B.velocity > 0)
	assert.equal(B.forecast, B.today + Math.ceil(6 / B.velocity))
	const withTarget = burn(S, null, { ...base, measure: "est", target: "2026-10-31" })
	assert.deepEqual(withTarget.ideal?.map((p) => p.t), [toDay("2026-08-31"), toDay("2026-10-31")])
})

test("filters restrict the items", () => {
	const B = burn(S, new Set(["r0", "r2"]), { ...base, measure: "est" })
	assert.equal(B.scopeNow, 7)
	assert.equal(B.doneNow, 5)
})
