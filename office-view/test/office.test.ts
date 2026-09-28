import { test } from "node:test"
import assert from "node:assert/strict"
import { clash, firstFree, readOffice, slotOf, stateOf, takesOver, usualPlace } from "../blocks/office-view/src/office.ts"
import type { SourceSnapshot } from "../blocks/office-view/src/kit/sources.ts"

function src(rows: Record<string, unknown>[]): SourceSnapshot {
	return { bound: true, truncated: false, propertySchemasById: {}, propertyIdsByKey: {}, items: rows.map(({ id, ...v }) => ({ id: id as string, propertiesById: v, propertiesByKey: v })) }
}
const at = (day: string, s: string, e: string) => ({ type: "datetimerange", start_date: day, start_time: s, end_date: day, end_time: e })
const rel = (id: string) => [{ id, table: "block" }]
const sources = {
	rooms: src([{ id: "r1", name: "Open space", floor: "1" }]),
	places: src([
		{ id: "p1", name: "Desk 1", room: rel("r1"), type: "Desk" },
		{ id: "p2", name: "Booth", type: "Phone booth" },
	]),
	bookings: src([
		{ id: "b1", name: "x", place: rel("p1"), who: [{ id: "u1", table: "notion_user" }], when: at("2026-09-28", "09:00", "12:00") },
		{ id: "b2", name: "y", place: rel("p1"), who: [{ id: "u2", table: "notion_user" }], when: at("2026-09-28", "13:00", "14:00") },
		{ id: "b3", name: "no place", when: at("2026-09-28", "09:00", "10:00") },
	]),
}
const res = { userName: (id: string) => id.toUpperCase(), pageTitle: () => undefined }

test("rooms hold places; places without a room are grouped", () => {
	const O = readOffice(sources, res, null)
	assert.deepEqual(O.rooms.map((r) => [r.name, r.places.map((p) => p.name)]), [["Open space", ["Desk 1"]], ["No room", ["Booth"]]])
	assert.equal(O.skipped, 1)
	assert.deepEqual(slotOf({ start_date: "2026-09-28" }), { day: "2026-09-28", start: 0, end: 1440, allDay: true })
})

test("clashes, first free slot and state", () => {
	const O = readOffice(sources, res, null)
	const day = "2026-09-28"
	assert.equal(clash(O, "p1", day, 11 * 60, 12 * 60 + 30)?.id, "b1")
	assert.equal(clash(O, "p1", day, 12 * 60, 13 * 60), undefined)
	assert.equal(firstFree(O, "p1", day, 9 * 60, 90, 8 * 60, 18 * 60), 14 * 60)
	assert.equal(stateOf(O, "p1", day, 8 * 60, 18 * 60), "partial")
	assert.equal(stateOf(O, "p1", day, 8 * 60, 18 * 60, "u1"), "mine")
	assert.equal(stateOf(O, "p1", day, 8 * 60, 18 * 60, "u2", 10 * 60), "busy")
	assert.equal(stateOf(O, "p2", day, 8 * 60, 18 * 60), "free")
})

test("up-for-grabs bookings don't block; whole-day claims make the usual spot", () => {
	const day = "2026-09-28"
	const O = readOffice(
		{
			...sources,
			bookings: src([
				{ id: "g1", place: rel("p1"), who: [{ id: "u2", table: "notion_user" }], when: { type: "date", start_date: day }, open: true, note: "Gone at 12" },
				{ id: "c1", place: rel("p2"), who: [{ id: "u1", table: "notion_user" }], when: { type: "date", start_date: "2026-09-21" } },
				{ id: "c2", place: rel("p2"), who: [{ id: "u1", table: "notion_user" }], when: { type: "date", start_date: "2026-09-22" } },
				{ id: "m1", place: rel("p1"), who: [{ id: "u1", table: "notion_user" }], when: at("2026-09-23", "10:00", "11:00") },
			]),
		},
		res,
		null
	)
	assert.equal(O.bookings[0].allDay, true)
	assert.equal(O.bookings[0].note, "Gone at 12")
	assert.equal(stateOf(O, "p1", day, 480, 1080), "offered")
	assert.equal(clash(O, "p1", day, 480, 1080), undefined)
	assert.deepEqual(takesOver(O, "p1", day, 600, 660).map((b) => b.id), ["g1"])
	// Two whole-day claims on the booth beat one timed meeting.
	assert.deepEqual(usualPlace(O, "u1"), { placeId: "p2", count: 2 })
})

test("drop-in seating: the Always free checkbox, or cafeteria-like types without it", async () => {
	const { isDropIn } = await import("../blocks/office-view/src/office.ts")
	assert.equal(isDropIn({ type: "Cafeteria seat", free: null }), true)
	assert.equal(isDropIn({ type: "Kantine", free: null }), true)
	assert.equal(isDropIn({ type: "Desk", free: null }), false)
	assert.equal(isDropIn({ type: "Lounge", free: true }), true)
	assert.equal(isDropIn({ type: "Cafeteria seat", free: false }), false)
	const withFree = { ...sources, places: { ...src([{ id: "p1", name: "Bar", type: "Lounge", free: true }, { id: "p2", name: "Desk", type: "Desk" }]), propertyIdsByKey: { free: "free" } } }
	assert.deepEqual(readOffice(withFree, res, null).places.map((p) => p.free), [true, false])
	assert.equal(readOffice(sources, res, null).places[0].free, null)
})

test("plans at drop-in seating never clash", () => {
	const cafe = { ...src([{ id: "c1", name: "Long tables", type: "Cafeteria seat" }]) }
	const O = readOffice({ ...sources, places: cafe, bookings: src([{ id: "d1", name: "Dinner", place: rel("c1"), when: at("2026-09-28", "18:00", "20:00") }]) }, res, null)
	assert.equal(clash(O, "c1", "2026-09-28", 18 * 60, 19 * 60), undefined)
	assert.deepEqual(takesOver(O, "c1", "2026-09-28", 18 * 60, 19 * 60), [])
	assert.equal(firstFree(O, "c1", "2026-09-28", 18 * 60, 60, 8 * 60, 22 * 60), 18 * 60)
})
