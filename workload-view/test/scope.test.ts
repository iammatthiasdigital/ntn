import { test } from "node:test"
import assert from "node:assert/strict"
import { choices, inOption, linkedIds, optionFilter, resolveVia } from "../blocks/workload-view/src/scope.ts"
import { flatValue, pageToRow } from "../blocks/workload-view/src/kit/pageRow.ts"
import type { SourceSnapshot } from "../blocks/workload-view/src/kit/sources.ts"

function snap(schema: Record<string, { name: string; type: string; options?: string[] }>, rows: Record<string, unknown>[]): SourceSnapshot {
	return { bound: true, truncated: false, propertySchemasById: schema, propertyIdsByKey: {}, items: rows.map((v, i) => ({ id: (v.id as string) ?? `r${i}`, propertiesById: v, propertiesByKey: {} })) }
}
const TASKS = snap({ n: { name: "Name", type: "title" }, proj: { name: "Project", type: "select", options: ["Checkout", "Infra"] }, who: { name: "Owner", type: "select" } }, [
	{ id: "t1", n: "A", proj: "Checkout" },
	{ id: "t2", n: "B", proj: "Infra" },
])
const PROJECTS = snap({ n: { name: "Name", type: "title" }, lead: { name: "Lead", type: "relation" }, tasks: { name: "Tasks", type: "relation" } }, [
	{ id: "p1", n: "Checkout", tasks: [{ id: "t1", table: "block" }] },
])

test("projects come from a linked Projects database first, else a select of the tasks", () => {
	const linked = resolveVia("project", null, TASKS, PROJECTS)!
	assert.deepEqual(linked.via, { via: "link", source: "projects", prop: "tasks" })
	assert.deepEqual(choices(linked, TASKS, PROJECTS), [{ id: "p1", label: "Checkout", count: 1 }])
	assert.deepEqual(linkedIds(linked.via, PROJECTS, "p1"), ["t1"])
	const opt = resolveVia("project", null, TASKS, undefined)!
	assert.deepEqual(opt.via, { via: "option", prop: "proj", type: "select" })
	assert.deepEqual(choices(opt, TASKS, undefined).map((c) => c.id), ["Checkout", "Infra"])
	assert.deepEqual(optionFilter(opt.via, "Checkout"), { propertyId: "proj", select: { equals: "Checkout" } })
	assert.equal(inOption(opt.via, TASKS.items[0], "Checkout"), true)
	assert.equal(inOption(opt.via, TASKS.items[1], "Checkout"), false)
	assert.equal(resolveVia("project", "", TASKS, PROJECTS), null)
	// People by a select of the tasks named like a person.
	assert.equal(resolveVia("person", null, TASKS, undefined)?.key, "opt:who")
})

test("a page from pages.get reads like a query row", () => {
	const row = pageToRow(
		{
			id: "t9",
			properties: {
				Name: { id: "title", type: "title", title: [{ plain_text: "Ship it" }] },
				Project: { id: "a%3Db", type: "select", select: { name: "Checkout" } },
				Owner: { id: "x", type: "people", people: [{ id: "u1" }] },
				When: { id: "w", type: "date", date: { start: "2026-09-07", end: "2026-09-11" } },
			},
		},
		{ n: { name: "Name", type: "title" }, proj: { name: "Project", type: "select" }, who: { name: "Owner", type: "people" }, when: { name: "When", type: "date" } }
	)
	assert.deepEqual(row.propertiesById, { n: "Ship it", proj: "Checkout", who: [{ id: "u1", table: "notion_user" }], when: { type: "daterange", start_date: "2026-09-07", end_date: "2026-09-11" } })
	assert.deepEqual(flatValue({ type: "date", date: { start: "2026-09-07T09:30:00.000+02:00" } }), { type: "datetime", start_date: "2026-09-07", start_time: "09:30" })
})
