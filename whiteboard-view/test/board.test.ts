import { test } from "node:test"
import assert from "node:assert/strict"
import { EMPTY_LOCAL, frameAt, FRAME_HEAD, FRAME_MIN_H, groupableProps, moveValues, readBoard, readLocal, resolveGroupBy, resolveSetup, storedPos, tidy, toColor, type ReadOptions } from "../blocks/whiteboard-view/src/board.ts"
import { seedSnapshot, type Seed } from "../blocks/whiteboard-view/src/kit/mock.ts"
import itemsSeed from "../data/worker_items.json" with { type: "json" }

const PAGES: Record<string, string> = { "ep-rt": "Release train", "ep-map": "Mapping rules v2", "ep-ci": "CI stability" }
const src = () => seedSnapshot(itemsSeed as Seed)
const opts = (o: Partial<ReadOptions> = {}): ReadOptions => ({ perRow: 4, showDone: true, visible: null, groupBy: resolveGroupBy(src(), "topic"), hideEmpty: false, pageTitle: (id) => PAGES[id], author: "author", done: "done", fix: "resolution", ...o })

test("select, multi-select and relation properties can group; auto picks the first", () => {
	const s = src()
	assert.deepEqual(groupableProps(s).map((p) => [p.id, p.kind]), [["topic", "select"], ["tags", "multi_select"], ["epic", "relation"]])
	assert.equal(resolveGroupBy(s, "auto")?.id, "topic")
	assert.equal(resolveGroupBy(s, "gone")?.id, "topic")
	assert.equal(resolveGroupBy(s, "none"), null)
	assert.equal(toColor("Default"), "gray")
	assert.equal(toColor("teal"), null)
})

test("select frames follow option order and colors; notes sit inside, done ones can be hidden", () => {
	const b = readBoard(src(), EMPTY_LOCAL, opts({ showDone: false }))
	assert.deepEqual(b.groups.map((g) => g.name), ["What went well", "What didn't", "Try next sprint", "Action items"])
	assert.deepEqual(b.groups.map((g) => g.color), ["green", "red", "blue", "purple"])
	const well = b.groups[0]
	const n1 = b.items.find((i) => i.id === "n1")!
	assert.equal(n1.groupId, "What went well")
	assert.equal(n1.x, well.x + 20)
	assert.equal(n1.y, well.y + FRAME_HEAD + 12)
	assert.equal(b.items.some((i) => i.id === "n6"), false)
	assert.equal(readBoard(src(), EMPTY_LOCAL, opts()).items.some((i) => i.id === "n6"), true)
	assert.equal(well.count, 3)
})

test("notes without a position fill free slots; loose ones go below the frames", () => {
	const b = readBoard(src(), EMPTY_LOCAL, opts())
	const well = b.groups[0]
	const n3 = b.items.find((i) => i.id === "n3")!
	assert.equal(n3.groupId, well.id)
	assert.ok(n3.x >= well.x && n3.y > well.y + FRAME_HEAD)
	const n12 = b.items.find((i) => i.id === "n12")!
	assert.equal(n12.groupId, null)
	assert.ok(n12.y >= Math.max(...b.groups.map((g) => g.y + g.h)))
})

test("relation frames are the linked pages; multi-select notes sit in their first option", () => {
	const byEpic = readBoard(src(), EMPTY_LOCAL, opts({ groupBy: resolveGroupBy(src(), "epic") }))
	assert.deepEqual(byEpic.groups.map((g) => g.name), ["CI stability", "Mapping rules v2", "Release train"])
	const byTags = readBoard(src(), EMPTY_LOCAL, opts({ groupBy: resolveGroupBy(src(), "tags") }))
	assert.equal(byTags.items.find((i) => i.id === "n5")!.groupId, "Process")
	assert.equal(readBoard(src(), EMPTY_LOCAL, opts({ groupBy: resolveGroupBy(src(), "epic"), hideEmpty: true })).groups.length, 3)
})

test("moving between frames rewrites only the value it was shown under", () => {
	assert.deepEqual(moveValues("select", ["A"], "A", "B"), ["B"])
	assert.deepEqual(moveValues("select", ["A"], "A", null), [])
	assert.deepEqual(moveValues("multi_select", ["A", "C"], "A", "B"), ["B", "C"])
	assert.deepEqual(moveValues("relation", ["p1", "p2"], "p1", null), ["p2"])
	assert.deepEqual(moveValues("multi_select", ["A", "B"], "A", "B"), ["B"])
})

test("frames wrap by perRow and later rows move below the tallest frame", () => {
	const b = readBoard(src(), EMPTY_LOCAL, opts({ perRow: 2 }))
	assert.equal(b.groups[2].x, b.groups[0].x)
	assert.ok(b.groups[2].y >= b.groups[0].y + FRAME_MIN_H)
})

test("stored positions are relative to the frame and round-trip", () => {
	const b = readBoard(src(), EMPTY_LOCAL, opts())
	const g = b.groups[1]
	assert.deepEqual(storedPos(b.groups, g.id, g.x + 55, g.y + FRAME_HEAD + 70), { x: 55, y: 70 })
	assert.deepEqual(storedPos(b.groups, null, 10.4, 20.6), { x: 10, y: 21 })
	assert.equal(frameAt(b.groups, g.x + 5, g.y + 5)?.id, g.id)
	assert.equal(frameAt(b.groups, -50, -50), undefined)
	const pos = [...tidy(g, b.items.filter((i) => i.groupId === g.id)).values()]
	assert.equal(pos[0].x, g.x + 20)
	assert.equal(pos[1].x, g.x + 200)
})

test("the local layer carries colors and drawings; filters never hide drawings", () => {
	const local = readLocal({ colors: { n1: "pink", n2: "neon" }, z: { n1: 3 }, ink: [{ id: "i1", type: "arrow", color: "blue", x: 5, y: 5, width: 10, height: 10, points: [[0, 0], [10, 10]], strokeWidth: 4, z: 1 }, { id: "bad", type: "laser", points: [[0, 0]] }] })
	assert.deepEqual(local.colors, { n1: "pink" })
	assert.equal(local.ink.length, 1)
	const b = readBoard(src(), local, opts({ visible: new Set(["n1"]) }))
	assert.deepEqual(b.items.filter((i) => i.type === "sticky").map((i) => [i.id, i.color, i.z]), [["n1", "pink", 3]])
	assert.equal(b.items.filter((i) => i.type !== "sticky").length, 1)
	assert.deepEqual(readLocal("nope"), EMPTY_LOCAL)
	assert.deepEqual(readLocal(JSON.parse('{"__proto__":{"x":1},"colors":{}}')).colors, {})
})

test("switching the grouping never stacks notes on each other or on frames", () => {
	for (const key of ["topic", "tags", "epic", "none"]) {
		const b = readBoard(src(), EMPTY_LOCAL, opts({ groupBy: resolveGroupBy(src(), key) }))
		const s = b.items.filter((i) => i.type === "sticky")
		for (const a of s)
			for (const c of s) if (a !== c) assert.ok(Math.abs(a.x - c.x) >= 96 || Math.abs(a.y - c.y) >= 96, `${key}: ${a.id} on ${c.id}`)
		for (const a of s.filter((i) => !i.groupId)) assert.equal(frameAt(b.groups, a.x + 80, a.y + 80), undefined, `${key}: ${a.id} on a frame`)
	}
})

test("frames fit their notes plus one free row; hand-set sizes win but never hide notes", async () => {
	const { ROW, FRAME_HEAD: HEAD, colsFor } = await import("../blocks/whiteboard-view/src/board.ts")
	const b = readBoard(src(), EMPTY_LOCAL, opts())
	for (const g of b.groups) {
		const notes = b.items.filter((i) => i.groupId === g.id)
		const bottom = Math.max(g.y + HEAD + 12, ...notes.map((n) => n.y + n.height + 20))
		assert.equal(g.y + g.h, bottom + ROW, g.name)
		assert.equal(g.auto, true)
	}
	const well = b.groups[0]
	const sized = readBoard(src(), { ...EMPTY_LOCAL, frames: { [well.id]: { w: 20 + 3 * ROW, h: 100 } } }, opts())
	const g = sized.groups[0]
	assert.equal(colsFor(g.w), 3)
	assert.equal(g.auto, false)
	assert.ok(Math.max(...sized.items.filter((i) => i.groupId === g.id).map((n) => n.y + n.height)) <= g.y + g.h)
	assert.ok(sized.groups[1].x > b.groups[1].x)
})

test("the optional fields are picked in the settings, guessed by name and type", () => {
	const s = seedSnapshot(itemsSeed as Seed, true)
	const auto = { groupBy: "auto", author: "auto", done: "auto", fix: "auto" }
	assert.deepEqual(resolveSetup(s, auto), { group: resolveGroupBy(s, "auto"), author: "author", done: "done", fix: "resolution" })
	assert.deepEqual(resolveSetup(s, { ...auto, author: "created_by", done: "none", fix: "gone" }).author, "created_by")
	assert.equal(resolveSetup(s, { ...auto, done: "none" }).done, null)
	const b = readBoard(s, EMPTY_LOCAL, opts({ author: "created_by" }))
	const n1 = b.items.find((i) => i.id === "n1")!
	assert.deepEqual(n1.authorIds, [(s.items.find((r) => r.id === "n1")!.propertiesById.created_by as { id: string }[])[0].id])
	assert.deepEqual(readBoard(s, EMPTY_LOCAL, opts()).items.find((i) => i.id === "n1")!.authorIds, ["user-ada-lovelace"])
	// Without a Done field nothing counts as done, and nothing is hidden for it.
	assert.equal(readBoard(s, EMPTY_LOCAL, opts({ done: null, showDone: false })).items.filter((i) => i.type === "sticky").length, s.items.length)
})

test("filtered boards pack their notes and shrink the frames", () => {
	const all = readBoard(src(), EMPTY_LOCAL, opts({ showDone: false }))
	const only = new Set(["n4", "n9"])
	const f = readBoard(src(), EMPTY_LOCAL, opts({ showDone: false, visible: only, compact: true }))
	const n9 = f.items.find((i) => i.id === "n9")!
	const g = f.groups.find((x) => x.id === n9.groupId)!
	assert.equal(n9.x, g.x + 20)
	assert.ok(f.groups.every((x, i) => x.h <= all.groups[i].h))
	assert.ok(Math.max(...f.groups.map((x) => x.y + x.h)) <= Math.max(...all.groups.map((x) => x.y + x.h)))
})
