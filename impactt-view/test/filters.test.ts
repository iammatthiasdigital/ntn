import { test } from "node:test"
import assert from "node:assert/strict"
import {
	applyFilters,
	buildProperties,
	chipLabel,
	dateOf,
	hasActiveFilters,
	kindOf,
	ME,
	newRule,
	operatorsFor,
	relativeWindow,
	testRule,
	withOperator,
	type FilterProperty,
	type FilterRow,
	type FilterState,
	type Rule,
	type SchemaLike,
} from "../blocks/impactt-view/src/filters/core.ts"

const schemas: Record<string, SchemaLike> = {
	t: { name: "Name", type: "title" },
	st: {
		name: "Status",
		type: "status",
		options: [
			{ id: "o1", name: "Not started", color: "default" },
			{ id: "o2", name: "In progress", color: "blue" },
			{ id: "o3", name: "Done", color: "green" },
		],
		groups: [
			{ id: "g1", name: "To-do", option_ids: ["o1"] },
			{ id: "g2", name: "In progress", option_ids: ["o2"] },
			{ id: "g3", name: "Complete", option_ids: ["o3"] },
		],
	},
	team: { name: "Team", type: "select", options: [{ id: "a", name: "Growth", color: "green" }] },
	tags: { name: "Tags", type: "multi_select" },
	n: { name: "Budget", type: "number" },
	ok: { name: "Approved", type: "checkbox" },
	d: { name: "Plan", type: "date" },
	who: { name: "Owner", type: "people" },
	rel: { name: "Depends on", type: "relation" },
	f: { name: "Score", type: "formula" },
	uid: { name: "ID", type: "unique_id" },
	files: { name: "Files", type: "files" },
	btn: { name: "Run", type: "button" },
	created_time: { name: "Created time", type: "created_time" },
}

const rows: FilterRow[] = [
	{
		id: "r1",
		props: {
			t: "Private beta",
			st: "Done",
			team: "Product",
			tags: ["Launch"],
			n: 40,
			ok: true,
			d: { type: "daterange", start_date: "2026-03-01", end_date: "2026-05-31" },
			who: [{ id: "u-ada", table: "notion_user" }],
			f: "12.5",
			uid: "INIT-1",
			files: "spec.pdf",
			created_time: { type: "datetime", start_date: "2026-01-02", start_time: "23:30" },
		},
	},
	{
		id: "r2",
		props: {
			t: "Referral programme",
			st: "In progress",
			team: "Growth",
			tags: ["Acquisition", "Launch"],
			n: 60,
			ok: false,
			d: { type: "daterange", start_date: "2026-08-01", end_date: "2026-10-31" },
			who: [{ id: "u-grace", table: "notion_user" }],
			rel: [{ id: "r1", table: "block" }],
			f: "3",
			uid: "INIT-2",
		},
	},
	{ id: "r3", props: { t: "Second city", team: "growth", f: "", uid: "INIT-10" } },
]

const res = { userName: (id: string) => ({ "u-ada": "Ada", "u-grace": "Grace" })[id], pageTitle: (id: string) => (id === "r1" ? "Private beta" : undefined) }
const props = buildProperties(schemas, rows, res)
const P = (id: string) => props.find((p) => p.id === id) as FilterProperty
const ctx = { today: "2026-09-27", meId: "u-grace" }
const rule = (propertyId: string, operator: Rule["operator"], value: Rule["value"]): Rule => ({ kind: "rule", id: propertyId + operator, propertyId, operator, value })
const ids = (s: FilterState) => applyFilters(s, props, rows, ctx).map((r) => r.id)

test("every property type maps to a filter kind; buttons are skipped", () => {
	assert.deepEqual(
		props.map((p) => [p.name, p.kind]),
		[
			["Name", "text"],
			["Status", "status"],
			["Team", "select"],
			["Tags", "multi"],
			["Budget", "number"],
			["Approved", "checkbox"],
			["Plan", "date"],
			["Owner", "person"],
			["Depends on", "relation"],
			["Score", "number"],
			["ID", "number"],
			["Files", "files"],
			["Created time", "date"],
		]
	)
	assert.equal(kindOf("formula", ["true", "false"]), "checkbox")
	assert.equal(kindOf("rollup", ["2026-01-02 → 2026-02-01"]), "date")
	assert.equal(kindOf("formula", ["hello", "3"]), "text")
	assert.equal(kindOf("button"), null)
})

test("options merge schema options (with colors and status groups) and row values", () => {
	assert.deepEqual(
		P("st").options.map((o) => [o.label, o.color, o.group]),
		[
			["Not started", "default", "g1"],
			["In progress", "blue", "g2"],
			["Done", "green", "g3"],
		]
	)
	// "growth" in row 3 dedupes case-insensitively against "Growth".
	assert.deepEqual(P("team").options.map((o) => o.label), ["Growth", "Product"])
	assert.deepEqual(P("tags").options.map((o) => o.label), ["Launch", "Acquisition"])
	assert.deepEqual(P("who").options.map((o) => o.label), ["Me", "Ada", "Grace"])
	assert.deepEqual(P("rel").options.map((o) => o.label), ["Private beta"])
})

test("built-in timestamps can't be empty-checked", () => {
	assert.ok(!operatorsFor(P("created_time")).includes("empty"))
	assert.ok(operatorsFor(P("d")).includes("empty"))
})

test("text operators are case-insensitive", () => {
	assert.deepEqual(ids({ rules: [rule("t", "contains", "CITY")], advanced: null }), ["r3"])
	assert.deepEqual(ids({ rules: [rule("t", "starts_with", "p")], advanced: null }), ["r1"])
	assert.deepEqual(ids({ rules: [rule("t", "is_not", "second city")], advanced: null }), ["r1", "r2"])
})

test("select, status, multi-select", () => {
	assert.deepEqual(ids({ rules: [rule("team", "is", ["Growth"])], advanced: null }), ["r2", "r3"])
	assert.deepEqual(ids({ rules: [rule("st", "is_not", ["Done"])], advanced: null }), ["r2", "r3"])
	assert.deepEqual(ids({ rules: [rule("st", "empty", null)], advanced: null }), ["r3"])
	assert.deepEqual(ids({ rules: [rule("tags", "contains", ["Acquisition", "Nope"])], advanced: null }), ["r2"])
	assert.deepEqual(ids({ rules: [rule("tags", "not_contains", ["Launch"])], advanced: null }), ["r3"])
})

test("numbers, formulas as text, unique ids", () => {
	assert.deepEqual(ids({ rules: [rule("n", "gte", "50")], advanced: null }), ["r2"])
	assert.deepEqual(ids({ rules: [rule("n", "empty", null)], advanced: null }), ["r3"])
	assert.deepEqual(ids({ rules: [rule("f", "gt", "5")], advanced: null }), ["r1"])
	assert.deepEqual(ids({ rules: [rule("uid", "gt", "2")], advanced: null }), ["r3"])
})

test("checkbox, people with Me, relations, files", () => {
	assert.deepEqual(ids({ rules: [rule("ok", "is", true)], advanced: null }), ["r1"])
	assert.deepEqual(ids({ rules: [rule("ok", "is", false)], advanced: null }), ["r2", "r3"])
	assert.deepEqual(ids({ rules: [rule("who", "contains", [ME])], advanced: null }), ["r2"])
	assert.deepEqual(ids({ rules: [rule("who", "empty", null)], advanced: null }), ["r3"])
	assert.deepEqual(ids({ rules: [rule("rel", "contains", ["r1"])], advanced: null }), ["r2"])
	assert.deepEqual(ids({ rules: [rule("files", "not_empty", null)], advanced: null }), ["r1"])
})

test("dates: ranges, relative windows, built-in timestamps in UTC", () => {
	assert.deepEqual(ids({ rules: [rule("d", "is", { type: "exact", date: "2026-09-27" })], advanced: null }), ["r2"])
	assert.deepEqual(ids({ rules: [rule("d", "before", { type: "today" })], advanced: null }), ["r1", "r2"])
	assert.deepEqual(ids({ rules: [rule("d", "after", { type: "one_month_ago" })], advanced: null }), [])
	assert.deepEqual(
		ids({ rules: [rule("d", "between", { start: { type: "exact", date: "2026-05-15" }, end: { type: "exact", date: "2026-06-15" } })], advanced: null }),
		["r1"]
	)
	assert.deepEqual(ids({ rules: [rule("d", "relative", { dir: "past", n: 1, unit: "month" })], advanced: null }), ["r2"])
	assert.deepEqual(relativeWindow({ dir: "this", n: 1, unit: "week" }, "2026-09-27"), ["2026-09-21", "2026-09-27"])
	assert.deepEqual(relativeWindow({ dir: "next", n: 2, unit: "week" }, "2026-09-27"), ["2026-09-27", "2026-10-11"])
	assert.deepEqual(relativeWindow({ dir: "past", n: 1, unit: "month" }, "2026-03-31"), ["2026-02-28", "2026-03-31"])
	// 23:30 UTC on Jan 2 is Jan 2 or Jan 3 locally depending on TZ; either way a date comes out.
	assert.match(dateOf(rows[0].props.created_time, true)!.start, /^2026-01-0[23]$/)
})

test("rules without a value don't filter", () => {
	const r = newRule(P("team"))
	assert.deepEqual(ids({ rules: [r], advanced: null }), ["r1", "r2", "r3"])
	assert.equal(hasActiveFilters({ rules: [r], advanced: null }, props), false)
	assert.equal(chipLabel(r, P("team")).rest, "")
})

test("advanced filter: and/or with nested groups, ANDed with chips", () => {
	const s: FilterState = {
		rules: [rule("n", "not_empty", null)],
		advanced: {
			kind: "group",
			id: "g",
			conjunction: "or",
			children: [
				rule("team", "is", ["Product"]),
				{ kind: "group", id: "g2", conjunction: "and", children: [rule("st", "is", ["In progress"]), rule("ok", "is", false)] },
			],
		},
	}
	assert.deepEqual(ids(s), ["r1", "r2"])
	const empty: FilterState = { rules: [], advanced: { kind: "group", id: "g", conjunction: "and", children: [newRule(P("t"))] } }
	assert.deepEqual(ids(empty), ["r1", "r2", "r3"])
	assert.equal(hasActiveFilters(empty, props), false)
})

test("switching operators keeps compatible values", () => {
	const r = rule("t", "contains", "beta")
	assert.equal(withOperator(P("t"), r, "starts_with").value, "beta")
	assert.equal(withOperator(P("t"), r, "empty").value, null)
	const d = rule("d", "is", { type: "today" })
	assert.deepEqual(withOperator(P("d"), d, "relative").value, { dir: "past", n: 1, unit: "week" })
})

test("chip labels read like Notion's", () => {
	assert.deepEqual(chipLabel(rule("st", "is", ["Done", "In progress"]), P("st")), { name: "Status", rest: ": Done, In progress" })
	assert.deepEqual(chipLabel(rule("t", "not_contains", "x"), P("t")), { name: "Name", rest: " does not contain: x" })
	assert.deepEqual(chipLabel(rule("n", "gt", "1000"), P("n")), { name: "Budget", rest: " > 1,000" })
	assert.deepEqual(chipLabel(rule("ok", "is", true), P("ok")), { name: "Approved", rest: ": Checked" })
	assert.deepEqual(chipLabel(rule("d", "empty", null), P("d")), { name: "Plan", rest: ": Is empty" })
	assert.deepEqual(chipLabel(rule("d", "relative", { dir: "next", n: 2, unit: "week" }), P("d")), { name: "Plan", rest: " is relative to today: Next 2 weeks" })
	assert.equal(testRule(rule("t", "is", "private beta"), P("t"), rows[0], ctx), true)
})
