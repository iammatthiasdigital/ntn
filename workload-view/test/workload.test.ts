import { test } from "node:test"
import assert from "node:assert/strict"
import { resolveSetup, TITLE, workload, type Options } from "../blocks/workload-view/src/workload.ts"
import type { SourceSnapshot } from "../blocks/workload-view/src/kit/sources.ts"

const r = (a: string, b: string) => ({ type: "daterange", start_date: a, end_date: b })
const U = (...ids: string[]) => ids.map((id) => ({ id, table: "notion_user" }))
const R = (...ids: string[]) => ids.map((id) => ({ id, table: "block" }))
function snap(schema: Record<string, { name: string; type: string }>, rows: Record<string, unknown>[]): SourceSnapshot {
	return { bound: true, truncated: false, propertySchemasById: schema, propertyIdsByKey: { name: "name" }, items: rows.map((v, i) => ({ id: (v.id as string) ?? `a${i}`, propertiesById: v, propertiesByKey: v })) }
}
const res = { userName: (id: string) => ({ u1: "Ada", u2: "Alan" })[id], pageTitle: (id: string) => ({ pa: "Ada", pb: "Alan", t1: "Platform", prj: "Checkout" })[id] }
const opts = (o: Partial<Options>): Options => ({ person: null, team: null, effort: null, dates: null, pPerson: null, pCap: null, mode: "percent", dayHours: 8, caps: {}, everyone: false, extra: [], labels: [TITLE], workdays: true, bucket: "day", from: "2026-09-07", to: "2026-09-11", today: "2026-09-08", ...o })

// One database: person as people, project and team as selects, workload in Notion's percent format.
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
	assert.deepEqual([s.person, s.team, s.effort, s.dates], ["who", "w:team", "pct", "when"])
	assert.equal(resolveSetup({ team: "" }, ONE).team, null)
})

test("task count is the default measure: tasks at once, no capacity, no effort needed", () => {
	const W = workload(ONE, undefined, null, res, opts({ ...resolveSetup({}, ONE), team: null, mode: "count" }))
	assert.equal(W.capacity, false)
	assert.equal(W.skipped, 0)
	const ada = W.lanes.find((l) => l.label === "Ada")!
	assert.deepEqual(ada.total, [2, 2, 2, 2, 2])
	// Alan: the dated task on the 9th and 10th, plus the ongoing one.
	assert.deepEqual(W.lanes.find((l) => l.label === "Alan")!.total, [1, 1, 2, 2, 1])
	assert.equal(ada.overBuckets, 0)
})

test("effort: undated rows are ongoing, fractions are %, lanes grouped by a property of the tasks", () => {
	const W = workload(ONE, undefined, null, res, opts(resolveSetup({}, ONE)))
	assert.equal(W.fractions, true)
	assert.equal(W.capacity, true)
	assert.deepEqual(W.lanes.map((l) => [l.label, l.team]), [["Alan", "Platform"], ["Ada", "Product"]])
	const ada = W.lanes[1]
	assert.deepEqual(ada.total, [110, 110, 110, 110, 110])
	assert.equal(ada.overBuckets, 5)
	assert.equal(W.lanes[0].total[2], 40)
	assert.equal(W.skipped, 1)
})

test("grouped by project, a person shows in each group with only its tasks", () => {
	const W = workload(ONE, undefined, null, res, opts({ ...resolveSetup({}, ONE), team: "w:proj", mode: "count" }))
	assert.deepEqual(
		W.lanes.map((l) => [l.team, l.label, l.items.length]),
		[
			["Checkout", "Ada", 1],
			["Infra", "Alan", 1],
			["Support", "Ada", 1],
			[null, "Alan", 1],
		]
	)
	assert.equal(new Set(W.lanes.map((l) => l.person)).size, 2)
})

test("total effort is spread over the task's workdays", () => {
	const T = snap({ name: { name: "Name", type: "title" }, who: { name: "Who", type: "people" }, h: { name: "Hours", type: "number" }, when: { name: "When", type: "date" } }, [
		// Mon–Sun: 40 h over 5 workdays = 8 h a day, nothing on the weekend.
		{ name: "Build", who: U("u1"), h: 40, when: r("2026-09-07", "2026-09-13") },
	])
	const W = workload(T, undefined, null, res, opts({ ...resolveSetup({}, T), mode: "total", to: "2026-09-13" }))
	assert.deepEqual(W.lanes[0].total, [8, 8, 8, 8, 8, 0, 0])
})

test("bar labels join the chosen properties", () => {
	const W = workload(ONE, undefined, null, res, opts({ ...resolveSetup({}, ONE), mode: "count", labels: [TITLE, "proj", "team"] }))
	assert.equal(W.lanes.find((l) => l.label === "Ada")!.items.find((i) => i.name === "Checkout")!.label, "Checkout · Checkout · Product")
})

test("person as a relation; local working time", () => {
	const REL = snap(
		{ name: { name: "Name", type: "title" }, member: { name: "Team member", type: "relation" }, pct: { name: "Allocation", type: "number" } },
		[{ name: "x", member: R("pa"), pct: 40 }]
	)
	const s = resolveSetup({}, REL)
	assert.equal(s.person, "member")
	const W = workload(REL, undefined, null, res, opts({ ...s, caps: { pa: 50 } }))
	const ada = W.lanes[0]
	assert.deepEqual([ada.label, ada.cap, ada.capFrom, ada.total[0]], ["Ada", 50, "local", 40])
})

test("a People database sets the group (relation) and working time; people without tasks only when picked", () => {
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
