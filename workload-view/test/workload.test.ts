import { test } from "node:test"
import assert from "node:assert/strict"
import { resolveSetup, workload, type Options } from "../blocks/workload-view/src/workload.ts"
import type { SourceSnapshot } from "../blocks/workload-view/src/kit/sources.ts"

const r = (a: string, b: string) => ({ type: "daterange", start_date: a, end_date: b })
const U = (...ids: string[]) => ids.map((id) => ({ id, table: "notion_user" }))
const R = (...ids: string[]) => ids.map((id) => ({ id, table: "block" }))
function snap(schema: Record<string, { name: string; type: string }>, rows: Record<string, unknown>[]): SourceSnapshot {
	return { bound: true, truncated: false, propertySchemasById: schema, propertyIdsByKey: { name: "name" }, items: rows.map((v, i) => ({ id: (v.id as string) ?? `a${i}`, propertiesById: v, propertiesByKey: v })) }
}
const res = { userName: (id: string) => ({ u1: "Ada", u2: "Alan" })[id], pageTitle: (id: string) => ({ pa: "Ada", pb: "Alan", t1: "Platform", prj: "Checkout" })[id] }
const opts = (o: Partial<Options>): Options => ({ person: null, project: null, team: null, effort: null, dates: null, pPerson: null, pCap: null, mode: "percent", dayHours: 8, caps: {}, everyone: false, extra: [], workdays: true, bucket: "day", from: "2026-09-07", to: "2026-09-11", today: "2026-09-08", ...o })

// One database: person as people, project as select, team as select, workload in Notion's percent format.
const ONE = snap(
	{ name: { name: "Name", type: "title" }, who: { name: "Who", type: "people" }, proj: { name: "Project", type: "select" }, team: { name: "Team", type: "select" }, pct: { name: "Workload %", type: "number" }, when: { name: "Dates", type: "date" } },
	[
		{ name: "Checkout", who: U("u1"), proj: "Checkout", team: "Product", pct: 0.6, when: r("2026-09-07", "2026-09-11") },
		{ name: "Support", who: U("u1"), proj: "Support", team: "Product", pct: 0.5 },
		{ name: "Infra", who: U("u2"), proj: "Infra", team: "Platform", pct: 0.4, when: r("2026-09-09", "2026-09-10") },
		{ name: "no workload", who: U("u2") },
	]
)

test("the setup is guessed from names and types", () => {
	const s = resolveSetup({}, ONE)
	assert.deepEqual([s.person, s.project, s.team, s.effort, s.dates], ["who", "proj", "w:team", "pct", "when"])
	assert.equal(resolveSetup({ project: "" }, ONE).project, null)
})

test("one database: undated rows are ongoing, fractions are %, lanes grouped by team", () => {
	const W = workload(ONE, undefined, null, res, opts(resolveSetup({}, ONE)))
	assert.equal(W.fractions, true)
	assert.deepEqual(W.lanes.map((l) => [l.label, l.team]), [["Alan", "Platform"], ["Ada", "Product"]])
	const ada = W.lanes[1]
	assert.deepEqual(ada.total, [110, 110, 110, 110, 110])
	assert.equal(ada.overBuckets, 5)
	assert.equal(W.lanes[0].total[2], 40)
	assert.equal(W.skipped, 1)
	assert.deepEqual(W.series.map((s) => s.label), ["Checkout", "Infra", "Support"])
})

test("person and project as relations; local working time", () => {
	const REL = snap(
		{ name: { name: "Name", type: "title" }, member: { name: "Team member", type: "relation" }, prj: { name: "Project", type: "relation" }, pct: { name: "Allocation", type: "number" } },
		[{ name: "x", member: R("pa"), prj: R("prj"), pct: 40 }]
	)
	const s = resolveSetup({}, REL)
	assert.deepEqual([s.person, s.project], ["member", "prj"])
	const W = workload(REL, undefined, null, res, opts({ ...s, caps: { pa: 50 } }))
	const ada = W.lanes[0]
	assert.deepEqual([ada.label, ada.cap, ada.capFrom, ada.total[0]], ["Ada", 50, "local", 40])
	assert.equal(W.series[0].label, "Checkout")
})

test("a People database sets team (relation) and working time; people without allocations only when picked", () => {
	const PEOPLE = snap(
		{ title: { name: "Name", type: "title" }, user: { name: "Person", type: "people" }, team: { name: "Team", type: "relation" }, hours: { name: "Hours per week", type: "number" } },
		[
			{ id: "p1", title: "Ada Lovelace", user: U("u1"), team: R("t1"), hours: 20 },
			{ id: "p2", title: "Grace Hopper", team: R("t1") },
		]
	)
	const s = resolveSetup({}, ONE, PEOPLE)
	assert.deepEqual([s.team, s.pPerson, s.pCap], ["p:team", "user", "hours"])
	assert.deepEqual(workload(ONE, PEOPLE, null, res, opts(s)).lanes.map((l) => l.label).sort(), ["Ada Lovelace", "Alan"])
	assert.deepEqual(workload(ONE, PEOPLE, null, res, opts({ ...s, extra: ["p2"] })).lanes.map((l) => l.label).sort(), ["Ada Lovelace", "Alan", "Grace Hopper"])
	const W = workload(ONE, PEOPLE, null, res, opts({ ...s, everyone: true }))
	const byName = Object.fromEntries(W.lanes.map((l) => [l.label, l]))
	assert.deepEqual(Object.keys(byName).sort(), ["Ada Lovelace", "Alan", "Grace Hopper"])
	assert.equal(byName["Ada Lovelace"].team, "Platform")
	// 20 h of a 40 h week = 50% working time.
	assert.deepEqual([byName["Ada Lovelace"].cap, byName["Ada Lovelace"].capFrom], [50, "people"])
	assert.equal(byName["Grace Hopper"].total[0], 0)
	// In hours per day, 20 h/week is 4 h a day.
	const H = workload(ONE, PEOPLE, null, res, opts({ ...s, mode: "perDay" }))
	assert.equal(H.lanes.find((l) => l.label === "Ada Lovelace")!.cap, 4)
})
