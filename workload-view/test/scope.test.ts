import { test } from "node:test"
import assert from "node:assert/strict"
import { linkProps, planLoad, reverseLinks } from "../blocks/workload-view/src/scope.ts"
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

const rule = (propertyId: string, operator: string, value: string[]) => ({ kind: "rule" as const, id: propertyId, propertyId, operator: operator as never, value })
const PEOPLE = snap({ n: { name: "Name", type: "title" }, team: { name: "Team", type: "relation" }, work: { name: "Assigned tasks", type: "relation" } }, [{ id: "pe1", n: "Ada", work: [{ id: "t2", table: "block" }] }])

test("nothing loads without a project or person filter", () => {
	assert.deepEqual(planLoad([], TASKS, [], {}, 100), { kind: "none" })
	// A rule without values doesn't count either.
	assert.deepEqual(planLoad([rule("proj", "is", [])], TASKS, [], {}, 100), { kind: "none" })
})

test("select and multi-select rules filter the query in Notion", () => {
	assert.deepEqual(planLoad([rule("proj", "is", ["Checkout"])], TASKS, [], {}, 100), { kind: "query", filter: { propertyId: "proj", select: { equals: "Checkout" } } })
	const M = snap({ n: { name: "Name", type: "title" }, tags: { name: "Projects", type: "multi_select" } }, [])
	assert.deepEqual(planLoad([rule("tags", "contains", ["A", "B"])], M, [], {}, 100), { kind: "query", filter: { propertyId: "tags", multi_select: { contains: ["A", "B"] } } })
})

test("Projects and People databases become filters that load their linked tasks", () => {
	const dbs = { projects: PROJECTS, people: PEOPLE }
	const links = linkProps(TASKS, dbs, { project: null, person: null })
	assert.deepEqual(
		links.map((l) => [l.id, l.name, l.link, l.virtual]),
		[
			["__project", "Project (Projects database)", "tasks", true],
			["__person", "Person", "work", true],
		]
	)
	assert.deepEqual(planLoad([rule("__project", "contains", ["p1"])], TASKS, links, dbs, 100), { kind: "link", ids: ["t1"], more: 0 })
	assert.deepEqual(planLoad([rule("__person", "contains", ["pe1"])], TASKS, links, dbs, 100), { kind: "link", ids: ["t2"], more: 0 })
	assert.deepEqual([...reverseLinks(PROJECTS, "tasks")], [["t1", ["p1"]]])
	// "None" turns a database's filter off.
	assert.equal(linkProps(TASKS, dbs, { project: "", person: null }).length, 1)
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
