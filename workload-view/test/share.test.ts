import { test } from "node:test"
import assert from "node:assert/strict"
import { decodeView, encodeView, MAX_CODE } from "../blocks/workload-view/src/kit/share.ts"
import { EMPTY_FILTERS, type FilterState } from "../blocks/workload-view/src/kit/filters/core.ts"

type V = { filters: FilterState; filterBar: boolean; groupBy: string; perRow: number; fields: string[]; look: "a" | "b" }
const DEF: V = { filters: EMPTY_FILTERS, filterBar: true, groupBy: "auto", perRow: 4, fields: [], look: "a" }
const HERE = { p1: { name: "Topic", type: "select" }, p2: { name: "Tags", type: "multi_select" } }
const THERE = { q1: { name: "Topic", type: "select" }, q9: { name: "Owner", type: "people" } }
const view: V = {
	...DEF,
	groupBy: "p1",
	perRow: 3,
	fields: ["p1", "p2"],
	filters: { rules: [{ kind: "rule", id: "r1", propertyId: "p1", operator: "is", value: ["Action items"] }, { kind: "rule", id: "r2", propertyId: "p2", operator: "contains", value: ["Team"] }], advanced: null },
}

test("a view round-trips through its code", () => {
	const code = encodeView("whiteboard", view, HERE)
	assert.match(code, /^ntnview:whiteboard:[A-Za-z0-9_-]+$/)
	const d = decodeView(code, "whiteboard", DEF, HERE)
	assert.ok(d.ok)
	assert.deepEqual(d.view, view)
	assert.equal(d.renamed, 0)
})

test("property ids re-target by name on another database; unknown ones are dropped", () => {
	const d = decodeView(encodeView("whiteboard", view, HERE), "whiteboard", DEF, THERE)
	assert.ok(d.ok)
	assert.equal(d.view.groupBy, "q1")
	assert.deepEqual(d.view.filters.rules.map((r) => r.propertyId), ["q1"])
	assert.equal(d.droppedRules, 1)
	assert.equal(d.renamed, 1)
	assert.deepEqual(d.missing, ["Tags"])
})

test("codes are checked: kind, shape, size and prototype keys", () => {
	const code = encodeView("whiteboard", view, HERE)
	assert.equal(decodeView(code, "orgchart", DEF, HERE).ok, false)
	assert.equal(decodeView("hello", "whiteboard", DEF, HERE).ok, false)
	assert.equal(decodeView(code.slice(0, -6), "whiteboard", DEF, HERE).ok, false)
	assert.equal(decodeView("ntnview:whiteboard:" + "A".repeat(MAX_CODE), "whiteboard", DEF, HERE).ok, false)
	// Raw JSON, so "__proto__" is a real key rather than an object-literal prototype.
	const evil = '{"b":"whiteboard","v":1,"props":{},"view":{"perRow":"3; drop","look":{"x":1},"fields":[{"a":1}],"filterBar":false,"__proto__":{"polluted":true},"extra":1}}'
	const b64 = Buffer.from(evil).toString("base64url")
	const d = decodeView(`ntnview:whiteboard:${b64}`, "whiteboard", DEF, HERE)
	assert.ok(d.ok)
	assert.equal(d.view.perRow, 4)
	assert.equal(d.view.look, "a")
	assert.deepEqual(d.view.fields, [])
	assert.equal(d.view.filterBar, false)
	assert.equal("extra" in d.view, false)
	assert.equal(({} as Record<string, unknown>).polluted, undefined)
})

test("extras travel along", () => {
	const d = decodeView(encodeView("whiteboard", view, HERE, { ink: [1, 2] }), "whiteboard", DEF, HERE)
	assert.ok(d.ok)
	assert.deepEqual(d.extra, { ink: [1, 2] })
})
