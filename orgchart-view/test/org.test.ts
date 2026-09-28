import { test } from "node:test"
import assert from "node:assert/strict"
import { current, exitDateId, managers, openToLevel, prune, readPeople } from "../blocks/orgchart-view/src/org.ts"
import { buildForest, layoutForest } from "../blocks/orgchart-view/src/tree.ts"
import { seedSnapshot, type Seed } from "../blocks/orgchart-view/src/kit/mock.ts"
import peopleSeed from "../data/worker_people.json" with { type: "json" }

const people = () => readPeople(seedSnapshot(peopleSeed as Seed))
const size = { w: 200, h: 100 }

test("the chart starts closed: only the leader is laid out", () => {
	const ps = people()
	const f = buildForest(ps)
	const lay = layoutForest(f.roots, openToLevel(ps, 0), size)
	assert.deepEqual([...lay.positions.keys()], ["p-ceo"])
	assert.equal(layoutForest(f.roots, openToLevel(ps, 1), size).positions.size, 5)
	assert.equal(layoutForest(f.roots, managers(ps), size).positions.size, ps.length)
})

test("filtering links people to their nearest shown manager", () => {
	const ps = people()
	const keep = new Set(["p-ceo", "p-e1", "p-d1"])
	const out = prune(ps, keep)
	const e1 = out.find((p) => p.id === "p-e1")!
	assert.deepEqual(e1.managerIds, ["p-ceo"])
	assert.equal(e1.skipped, 2)
	assert.equal(e1.via, "Jonas Weber")
	assert.equal(out.find((p) => p.id === "p-ceo")!.via, undefined)
})

test("people whose whole chain is hidden become roots", () => {
	const out = prune(people(), new Set(["p-e1", "p-e2"]))
	assert.deepEqual(out.map((p) => p.managerIds), [[], []])
	assert.equal(buildForest(out).roots.length, 2)
})

test("card height feeds the layout", () => {
	const ps = people()
	const f = buildForest(ps)
	const lay = layoutForest(f.roots, openToLevel(ps, 1), { w: 200, h: 140 })
	const y = [...lay.positions.values()].map((p) => p.y)
	assert.equal(Math.max(...y), 140 + 48)
})

test("people with an exit date are out for everyone; their reports move up", () => {
	const snap = seedSnapshot(peopleSeed as Seed)
	assert.equal(exitDateId(snap), "exitDate")
	const all = readPeople(snap)
	assert.deepEqual(all.filter((p) => p.left).map((p) => p.id), ["p-em2", "p-s2"])
	const now = current(all)
	assert.equal(now.some((p) => p.left), false)
	assert.equal(now.length, all.length - 2)
	const e4 = now.find((p) => p.id === "p-e4")!
	assert.deepEqual(e4.managerIds, ["p-cto"])
	assert.equal(e4.via, undefined)
	assert.equal(e4.skipped, 0)
	// Unmapped, a date property named like an exit date is picked up.
	const byName = { ...snap, propertyIdsByKey: { ...snap.propertyIdsByKey, exitDate: undefined }, propertySchemasById: { ...snap.propertySchemasById, exitDate: { name: "Leaving date", type: "date" } } }
	assert.equal(exitDateId(byName), "exitDate")
})
