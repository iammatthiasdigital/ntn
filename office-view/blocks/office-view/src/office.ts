/**
 * Office model. Pure: rooms, places and bookings in, the office for a day out.
 *
 * Rooms hold places (desks, meeting rooms, phone booths, parking…). A
 * booking reserves one place for one person from a start to an end time.
 * Times are wall-clock minutes, as shown in Notion.
 */
import { asStrings, checkboxOf, numberOf, pointerIds, textOf, type Resolvers } from "./kit/filters/core"
import { prop, type SourceSnapshot } from "./kit/sources"

export type Place = {
	id: string
	name: string
	roomId: string | null
	type: string
	capacity: number | null
	features: string[]
	/** The Places database's "Always free" checkbox; null when the database has no such property. */
	free: boolean | null
}
export type Room = { id: string; name: string; floor: string; type: string; places: Place[] }
export type Booking = {
	id: string
	title: string
	placeId: string
	who: string[]
	whoNames: string[]
	day: string
	start: number
	end: number
	/** A date without a time: the whole day. */
	allDay: boolean
	note: string
	/** "Up for grabs": the booker is fine with someone else taking the place. */
	open: boolean
}

export type Office = { rooms: Room[]; places: Place[]; bookings: Booking[]; skipped: number }

/** `{start_date, start_time?, end_date?, end_time?}` → day and minutes. All-day bookings span the whole day. */
export function slotOf(v: unknown): { day: string; start: number; end: number; allDay: boolean } | null {
	if (!v || typeof v !== "object") return null
	const o = v as { start_date?: string; start_time?: string; end_date?: string; end_time?: string }
	if (typeof o.start_date !== "string") return null
	const min = (t?: string) => {
		const m = t?.match(/^(\d{1,2}):(\d{2})/)
		return m ? Number(m[1]) * 60 + Number(m[2]) : null
	}
	const s = min(o.start_time)
	const e = min(o.end_time)
	const day = o.start_date.slice(0, 10)
	if (s == null) return { day, start: 0, end: 24 * 60, allDay: true }
	// Bookings are single-day; an end on a later day runs to midnight.
	const end = o.end_date && o.end_date.slice(0, 10) !== day ? 24 * 60 : (e ?? s + 60)
	return { day, start: s, end: Math.max(end, s + 15), allDay: false }
}

export function readOffice(src: { rooms: SourceSnapshot; places: SourceSnapshot; bookings: SourceSnapshot }, res: Resolvers, visiblePlaces: Set<string> | null): Office {
	const name = (s: SourceSnapshot, r: { propertiesById: Record<string, unknown>; propertiesByKey: Record<string, unknown> }) => textOf(prop(s, r as never, "name")).trim() || "Untitled"
	const hasFree = src.places.propertyIdsByKey.free !== undefined
	const places: Place[] = src.places.items
		.filter((r) => !visiblePlaces || visiblePlaces.has(r.id))
		.map((r) => ({
			id: r.id,
			name: name(src.places, r),
			roomId: pointerIds(prop(src.places, r, "room"))[0] ?? null,
			type: textOf(prop(src.places, r, "type")).trim() || "Place",
			capacity: numberOf(prop(src.places, r, "capacity")),
			features: asStrings(prop(src.places, r, "features")),
			free: hasFree ? checkboxOf(prop(src.places, r, "free")) : null,
		}))
	const rooms: Room[] = src.rooms.items.map((r) => ({
		id: r.id,
		name: name(src.rooms, r),
		floor: textOf(prop(src.rooms, r, "floor")).trim(),
		type: textOf(prop(src.rooms, r, "type")).trim(),
		places: places.filter((p) => p.roomId === r.id),
	}))
	const orphans = places.filter((p) => !p.roomId || !rooms.some((r) => r.id === p.roomId))
	if (orphans.length) rooms.push({ id: "__none", name: src.rooms.bound ? "No room" : "Places", floor: "", type: "", places: orphans })

	let skipped = 0
	const bookings: Booking[] = []
	for (const r of src.bookings.items) {
		const placeId = pointerIds(prop(src.bookings, r, "place"))[0]
		const slot = slotOf(prop(src.bookings, r, "when"))
		if (!placeId || !slot) {
			skipped++
			continue
		}
		const who = pointerIds(prop(src.bookings, r, "who"))
		bookings.push({
			id: r.id,
			title: name(src.bookings, r),
			placeId,
			who,
			whoNames: who.map((id) => res.userName(id) ?? "Someone"),
			...slot,
			note: textOf(prop(src.bookings, r, "note")).trim(),
			open: checkboxOf(prop(src.bookings, r, "open")),
		})
	}
	return { rooms, places, bookings, skipped }
}

export const overlaps = (a: { start: number; end: number }, b: { start: number; end: number }) => a.start < b.end && b.start < a.end

export function bookingsOn(O: Office, placeId: string, day: string): Booking[] {
	return O.bookings.filter((b) => b.placeId === placeId && b.day === day).sort((a, b) => a.start - b.start)
}

/** Whether plans at a place may overlap: drop-in seating is shared, so bookings there are plans, not claims. */
const shared = (O: Office, placeId: string) => {
	const p = O.places.find((x) => x.id === placeId)
	return !!p && isDropIn(p)
}

/** The booking a new slot would clash with, if any. Bookings marked up for grabs, and plans at drop-in seating, don't block. */
export function clash(O: Office, placeId: string, day: string, start: number, end: number, except?: string): Booking | undefined {
	if (shared(O, placeId)) return undefined
	return bookingsOn(O, placeId, day).find((b) => b.id !== except && !b.open && overlaps(b, { start, end }))
}

/** Up-for-grabs bookings a new slot would take over. */
export function takesOver(O: Office, placeId: string, day: string, start: number, end: number): Booking[] {
	if (shared(O, placeId)) return []
	return bookingsOn(O, placeId, day).filter((b) => b.open && overlaps(b, { start, end }))
}

/** The place someone claims for whole days most often, and how often. */
export function usualPlace(O: Office, me: string | undefined): { placeId: string; count: number } | null {
	if (!me) return null
	const n = new Map<string, number>()
	// Whole-day claims show where someone sits; timed bookings are meetings and calls.
	for (const b of O.bookings) if (b.allDay && b.who.includes(me)) n.set(b.placeId, (n.get(b.placeId) ?? 0) + 1)
	const best = [...n.entries()].sort((a, b) => b[1] - a[1])[0]
	return best && best[1] >= 2 && O.places.some((p) => p.id === best[0]) ? { placeId: best[0], count: best[1] } : null
}

export type State = "free" | "partial" | "busy" | "mine" | "offered"

/** Place types that count as always free while the Places database has no "Always free" checkbox. */
const DROP_IN = /caf[eé]|canteen|kantine|mensa|kitchen|küche|break|pause|drop.?in|walk.?in|open seat|free seat|hot seat/i

/**
 * Whether a place is drop-in seating (always free, never booked): its
 * "Always free" checkbox in Notion, or, without that property, a
 * cafeteria-like type name.
 */
export function isDropIn(p: Pick<Place, "type" | "free">): boolean {
	return p.free ?? DROP_IN.test(p.type)
}

/** How taken a place is within the day's opening hours (or right now). */
export function stateOf(O: Office, placeId: string, day: string, open: number, close: number, me?: string, at?: number): State {
	const bs = bookingsOn(O, placeId, day)
	if (me && bs.some((b) => b.who.includes(me) && (at == null || (b.start <= at && at < b.end)))) return "mine"
	const now = at != null ? bs.filter((b) => b.start <= at && at < b.end) : bs
	if (now.length && now.every((b) => b.open)) return "offered"
	const firm = bs.filter((b) => !b.open)
	if (at != null) return firm.some((b) => b.start <= at && at < b.end) ? "busy" : "free"
	let used = 0
	for (const b of firm) used += Math.max(0, Math.min(b.end, close) - Math.max(b.start, open))
	return used <= 0 ? "free" : used >= close - open - 1 ? "busy" : "partial"
}

/** First free slot of `len` minutes from `from` (rounded to 15), within opening hours. */
export function firstFree(O: Office, placeId: string, day: string, from: number, len: number, open: number, close: number): number | null {
	let t = Math.max(open, Math.ceil(from / 15) * 15)
	for (; t + len <= close; t += 15) if (!clash(O, placeId, day, t, t + len)) return t
	return null
}

export const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`
export const parseHhmm = (s: string) => {
	const m = s.match(/^(\d{1,2}):(\d{2})/)
	return m ? Number(m[1]) * 60 + Number(m[2]) : null
}

export function addDay(iso: string, n: number): string {
	const [y, m, d] = iso.split("-").map(Number)
	const t = new Date(y, m - 1, d + n)
	return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`
}

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]
export function dayLabel(iso: string, today: string): string {
	const [y, m, d] = iso.split("-").map(Number)
	const t = new Date(y, m - 1, d)
	const rel = iso === today ? "Today · " : iso === addDay(today, 1) ? "Tomorrow · " : ""
	return `${rel}${DAYS[t.getDay()]}, ${MONTHS[m - 1]} ${d}`
}
