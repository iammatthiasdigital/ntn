/**
 * Burn-up / burn-down model. Pure: items in, time series out.
 *
 * Each item has a size (1, or a number property), the day it joined the
 * scope and, once finished, the day it was done. Scope and done are summed
 * per time bucket; the ideal line runs from the start to the target; the
 * forecast extends the recent velocity until done meets scope.
 */
import { dateOf, numberOf } from "./kit/filters/core"
import { prop, type SourceSnapshot } from "./kit/sources"

export type Bucket = "day" | "week" | "month"
export type Mode = "up" | "down"

export type Item = { id: string; name: string; size: number; added: number; done: number | null; /** No estimate: size is the fallback. */ guessed: boolean }
/** When an item joined the scope: its created time (default) or the Added date property. */
export type ScopeDate = "created" | "added"
/** Size of items without an estimate: 0, 1, or the average estimate of the others. */
export type Missing = "avg" | "one" | "zero"

export type BurnOptions = {
	/** Property id of a number column to size items by; null = count items. */
	measure: string | null
	scopeDate?: ScopeDate
	missing?: Missing
	/** Local `YYYY-MM-DD`. */
	today: string
	/** Optional fixed start / target (`YYYY-MM-DD`). */
	start: string | null
	target: string | null
	/** Buckets of history used for the velocity. */
	window: number
	bucket: Bucket
}

export type Point = { t: number; scope: number; done: number }

export type Burn = {
	items: Item[]
	/** Rows left out because they have no usable date. */
	skipped: number
	start: number
	end: number
	today: number
	target: number | null
	points: Point[]
	scopeNow: number
	doneNow: number
	/** Items without an estimate, sized by the fallback. */
	guessed: number
	/** Scope and done at the start of the velocity window, for the vibe check. */
	windowStart: Point
	/** Items finished in the last 7 days. */
	doneThisWeek: number
	/** Size finished per day, over the velocity window. */
	velocity: number
	/** Day the forecast reaches the current scope; null when velocity is 0. */
	forecast: number | null
	ideal: [Point, Point] | null
}

/* ---- days as integers (local calendar) ---- */

export const toDay = (iso: string): number => {
	const [y, m, d] = iso.slice(0, 10).split("-").map(Number)
	return Math.round(Date.UTC(y, m - 1, d) / 86400000)
}
export const isoOf = (day: number): string => new Date(day * 86400000).toISOString().slice(0, 10)

export function bucketStart(day: number, b: Bucket): number {
	if (b === "day") return day
	const d = new Date(day * 86400000)
	if (b === "week") return day - ((d.getUTCDay() + 6) % 7)
	return toDay(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-01`)
}
export function nextBucket(day: number, b: Bucket): number {
	if (b === "day") return day + 1
	if (b === "week") return day + 7
	const d = new Date(day * 86400000)
	return Math.round(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1) / 86400000)
}

/** Number-like columns an item can be sized by. */
export function measureCandidates(src: SourceSnapshot): { id: string; name: string; type: string }[] {
	return Object.entries(src.propertySchemasById)
		.filter(([, s]) => ["number", "formula", "rollup"].includes(s.type))
		.filter(([id]) => src.items.some((r) => numberOf(r.propertiesById[id]) != null))
		.map(([id, s]) => ({ id, name: s.name ?? id, type: s.type }))
}

/** The bound `estimate` column, if it holds numbers; else count. */
export function defaultMeasure(src: SourceSnapshot): string | null {
	const id = src.propertyIdsByKey.estimate
	return id && measureCandidates(src).some((c) => c.id === id) ? id : null
}

function dayOf(v: unknown): number | null {
	const d = dateOf(v)
	return d ? toDay(d.start) : null
}

export function readItems(src: SourceSnapshot, measure: string | null, scopeDate: ScopeDate = "created", missing: Missing = "avg"): { items: Item[]; skipped: number } {
	const createdId = Object.entries(src.propertySchemasById).find(([, s]) => s.type === "created_time")?.[0]
	const rows: (Omit<Item, "size" | "guessed"> & { est: number | null })[] = []
	let skipped = 0
	for (const r of src.items) {
		const done = dayOf(prop(src, r, "done"))
		const created = createdId ? dayOf(r.propertiesById[createdId]) : null
		const addedProp = dayOf(prop(src, r, "added"))
		// Created time first (every Notion row has one); the Added property can override or fill in.
		const added = (scopeDate === "added" ? (addedProp ?? created) : (created ?? addedProp)) ?? done
		if (added == null) {
			skipped++
			continue
		}
		rows.push({
			id: r.id,
			name: String(prop(src, r, "name") ?? "").trim() || "Untitled",
			added,
			done: done != null ? Math.max(done, added) : null,
			est: measure ? numberOf(r.propertiesById[measure]) : null,
		})
	}
	const known = rows.map((x) => x.est).filter((v): v is number => v != null)
	const avg = known.length ? known.reduce((a, b) => a + b, 0) / known.length : 1
	const fallback = missing === "zero" ? 0 : missing === "one" ? 1 : avg
	const items = rows.map(({ est, ...x }) => ({ ...x, size: !measure ? 1 : (est ?? fallback), guessed: !!measure && est == null }))
	return { items, skipped }
}

export function burn(src: SourceSnapshot, visible: Set<string> | null, o: BurnOptions): Burn {
	const read = readItems(src, o.measure, o.scopeDate, o.missing)
	const items = visible ? read.items.filter((i) => visible.has(i.id)) : read.items
	const today = toDay(o.today)
	const target = o.target ? toDay(o.target) : null
	const first = items.length ? Math.min(...items.map((i) => i.added)) : today
	const start = bucketStart(o.start ? toDay(o.start) : first, o.bucket)

	const at = (t: number): Point => {
		let scope = 0
		let done = 0
		for (const i of items) {
			if (i.added <= t) scope += i.size
			if (i.done != null && i.done <= t) done += i.size
		}
		return { t, scope, done }
	}
	const now = at(today)

	// Velocity over the last `window` buckets up to today.
	let from = bucketStart(today, o.bucket)
	for (let k = 0; k < o.window; k++) from = bucketStart(from - 1, o.bucket)
	from = Math.max(from, start)
	const span = Math.max(1, today - from)
	const velocity = Math.max(0, (now.done - at(from).done) / span)
	const left = now.scope - now.done
	const forecast = left <= 0 ? today : velocity > 0 ? today + Math.ceil(left / velocity) : null

	const lastDone = Math.max(today, ...items.map((i) => i.done ?? 0))
	const horizon = Math.max(lastDone, target ?? 0, forecast != null && forecast < today + 3 * 365 ? forecast : today)
	const end = nextBucket(bucketStart(horizon, o.bucket), o.bucket)

	// Recorded lines run from the start to today; the forecast takes over after.
	const hist: Point[] = []
	for (let t = start; t <= today; t = nextBucket(t, o.bucket)) hist.push(at(t))
	if (!hist.length || hist[hist.length - 1].t !== today) hist.push(now)

	const ideal: [Point, Point] | null = target != null && target > start ? [{ t: start, scope: now.scope, done: 0 }, { t: target, scope: now.scope, done: now.scope }] : null

	const ws = at(from)
	const doneThisWeek = items.filter((i) => i.done != null && i.done > today - 7 && i.done <= today).length
	return { guessed: items.filter((i) => i.guessed).length, windowStart: ws, doneThisWeek, items, skipped: read.skipped, start, end, today, target, points: hist, scopeNow: now.scope, doneNow: now.done, velocity, forecast, ideal }
}

export function fmtNum(n: number): string {
	if (Math.abs(n) >= 1000) return (n / 1000).toFixed(Math.abs(n) >= 10000 ? 0 : 1).replace(/\.0$/, "") + "k"
	return Number.isInteger(n) ? String(n) : n.toFixed(1)
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
export function fmtDay(day: number, withYear = true): string {
	const d = new Date(day * 86400000)
	return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}${withYear ? ` ’${String(d.getUTCFullYear()).slice(2)}` : ""}`
}
