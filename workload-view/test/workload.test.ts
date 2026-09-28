import { test } from "node:test"
import assert from "node:assert/strict"
import { workload } from "../blocks/workload-view/src/workload.ts"
import type { SourceSnapshot } from "../blocks/workload-view/src/kit/sources.ts"

const r = (a: string, b: string) => ({ type: "daterange", start_date: a, end_date: b })
const P = (...ids: string[]) => ids.map((id) => ({ id, table: "notion_user" }))
function src(rows: Record<string, unknown>[]): SourceSnapshot {
	return {
		bound: true,
		truncated: false,
		propertySchemasById: { name: { name: "Name", type: "title" }, who: { name: "Who", type: "people" }, dates: { name: "Dates", type: "date" }, effort: { name: "Effort", type: "number" }, project: { name: "Project", type: "select" } },
		propertyIdsByKey: { name: "name", who: "who", dates: "dates", effort: "effort", project: "project" },
		items: rows.map((v, i) => ({ id: `a${i}`, propertiesById: v, propertiesByKey: v })),
	}
}
const res = { userName: (id: string) => ({ u1: "Ada", u2: "Alan" })[id], pageTitle: () => undefined }
// Mon 2026-09-07 … Fri 2026-09-11 is one work week.
const S = src([
	{ name: "X", who: P("u1"), dates: r("2026-09-07", "2026-09-11"), effort: 40, project: "Alpha" },
	{ name: "Y", who: P("u1"), dates: r("2026-09-09", "2026-09-10"), effort: 8, project: "Beta" },
	{ name: "Z", who: P("u1", "u2"), dates: r("2026-09-07", "2026-09-07"), effort: 4, project: "Alpha" },
	{ name: "no effort", who: P("u2"), dates: r("2026-09-07", "2026-09-08") },
])
const o = { groupBy: "who", colorBy: "project", effort: "effort", mode: "total" as const, capacity: 8, workdays: true, bucket: "day" as const, from: null, to: null, today: "2026-09-08" }

test("overlapping assignments add up per day; shared ones split", () => {
	const W = workload(S, null, res, o)
	assert.deepEqual(W.lanes.map((l) => l.label), ["Ada", "Alan"])
	const ada = W.lanes[0]
	// Mon: 8 (X) + 2 (half of Z); Wed: 8 (X) + 4 (Y) = 12, over capacity.
	assert.deepEqual(ada.total.slice(0, 5), [10, 8, 12, 12, 8])
	assert.equal(ada.peak, 12)
	assert.equal(ada.overBuckets, 3)
	assert.equal(W.lanes[1].total[0], 2)
	assert.equal(W.skipped, 1)
	assert.deepEqual(W.series.map((s) => s.label), ["Alpha", "Beta"])
})

test("weekly buckets average per workday; percent mode uses 100 as capacity", () => {
	const W = workload(S, null, res, { ...o, bucket: "week" })
	assert.equal(W.lanes[0].total[0], 50 / 5)
	const P2 = workload(src([{ name: "Half", who: P("u1"), dates: r("2026-09-07", "2026-09-11"), effort: 50 }]), null, res, { ...o, mode: "percent", colorBy: null })
	assert.equal(P2.cap, 100)
	assert.equal(P2.lanes[0].total[0], 50)
	assert.equal(P2.lanes[0].utilization, 0.5)
})

test("any property can group the lanes", () => {
	const W = workload(S, null, res, { ...o, groupBy: "project", colorBy: null })
	assert.deepEqual(W.lanes.map((l) => l.label), ["Alpha", "Beta"])
})

test("% allocation needs no hours; fractions are scaled; People sets each capacity", () => {
	const A = src([
		{ name: "Half", who: P("u1"), dates: r("2026-09-07", "2026-09-11"), effort: 0.5 },
		{ name: "Also half", who: P("u2"), dates: r("2026-09-07", "2026-09-11"), effort: 0.5 },
	])
	const people = [
		{ ids: ["u1"], name: "Ada", hoursPerWeek: 20, percent: null },
		{ ids: [], name: "alan", hoursPerWeek: null, percent: 0.4 },
	]
	const W = workload(A, null, res, { ...o, mode: "percent", colorBy: null, people })
	assert.equal(W.fractions, true)
	const [ada, alan] = W.lanes
	assert.equal(ada.total[0], 50)
	// 20 h of a 40 h week = 50%, matched by person; Alan 40%, matched by name.
	assert.deepEqual([ada.cap, ada.capFrom, ada.capLabel], [50, "people", "20 h/wk"])
	assert.deepEqual([alan.cap, alan.overBuckets > 0], [40, true])
	// In hours, Ada's 20 h/week is 4 h a day.
	const H = workload(src([{ name: "X", who: P("u1"), dates: r("2026-09-07", "2026-09-11"), effort: 20 }]), null, res, { ...o, colorBy: null, people })
	assert.equal(H.lanes[0].cap, 4)
	assert.equal(H.lanes[0].overBuckets, 0)
})
