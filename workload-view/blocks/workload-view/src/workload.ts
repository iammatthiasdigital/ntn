/**
 * Workload model. Pure: assignment rows in, per-lane load curves out.
 *
 * Each assignment spreads its effort over its date range. Assignments are
 * grouped into lanes by any property (a person, a team, a machine, a
 * room…), so overlapping assignments add up and the load grows and shrinks
 * over time. Each lane's load is compared with its capacity per day.
 */
import { asStrings, dateOf, numberOf, pointerIds, textOf, type Resolvers } from "./kit/filters/core"
import { prop, type SourceSnapshot } from "./kit/sources"

export type Bucket = "day" | "week" | "month"
/**
 * How the Effort number is meant:
 * - total: hours for the whole assignment, spread evenly over its days
 * - perDay: hours per day while it runs
 * - percent: allocation in % of a full day
 */
export type EffortMode = "total" | "perDay" | "percent"

export type Options = {
	groupBy: string | null
	colorBy: string | null
	effort: string | null
	mode: EffortMode
	/** Default capacity per (work)day in hours; percent mode uses 100%. */
	capacity: number
	/** Per-person working time from a People database; missing people use the default. */
	people?: PersonCapacity[]
	workdays: boolean
	bucket: Bucket
	/** Local `YYYY-MM-DD`; empty = automatic. */
	from: string | null
	to: string | null
	today: string
}

/**
 * One row of the optional People database. `hoursPerWeek` sets the hours a
 * person works; `percent` is their share of a full-time week (e.g. 80).
 */
export type PersonCapacity = { ids: string[]; name: string; hoursPerWeek: number | null; percent: number | null }

export type Assignment = { id: string; name: string; start: number; end: number; perDay: number; color: string; lanes: string[] }
export type Series = { key: string; label: string; index: number }
export type Lane = {
	key: string
	label: string
	/** Average load per day, per bucket and color series. */
	load: number[][]
	total: number[]
	peak: number
	/** Share of capacity used over the visible range. */
	utilization: number
	overBuckets: number
	items: Assignment[]
	/** Capacity per (work)day in the chart's unit, and where it came from. */
	cap: number
	capFrom: "people" | "default"
	/** Readable working time, e.g. "32 h/wk" or "80%". */
	capLabel: string
}
export type Workload = {
	lanes: Lane[]
	series: Series[]
	buckets: number[]
	start: number
	end: number
	today: number
	/** The default capacity per day. */
	cap: number
	unit: string
	skipped: number
	/** Allocations were given as fractions (0.5) and scaled to %. */
	fractions: boolean
}

/* ---- days ---- */

export const toDay = (iso: string): number => {
	const [y, m, d] = iso.slice(0, 10).split("-").map(Number)
	return Math.round(Date.UTC(y, m - 1, d) / 86400000)
}
export const isoOf = (day: number): string => new Date(day * 86400000).toISOString().slice(0, 10)
const weekday = (day: number) => (new Date(day * 86400000).getUTCDay() + 6) % 7
export const isWorkday = (day: number) => weekday(day) < 5

export function bucketStart(day: number, b: Bucket): number {
	if (b === "day") return day
	if (b === "week") return day - weekday(day)
	const d = new Date(day * 86400000)
	return Math.round(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1) / 86400000)
}
export function nextBucket(day: number, b: Bucket): number {
	if (b === "day") return day + 1
	if (b === "week") return day + 7
	const d = new Date(day * 86400000)
	return Math.round(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1) / 86400000)
}

/* ---- columns ---- */

const GROUP_TYPES = ["people", "person", "select", "multi_select", "status", "relation", "rich_text", "text", "created_by", "formula", "rollup"]
const NUM_TYPES = ["number", "formula", "rollup"]

export type Column = { id: string; name: string; type: string }

/** Rows of the People database as capacities. */
export function readPeople(src: SourceSnapshot | undefined): PersonCapacity[] {
	if (!src?.bound) return []
	return src.items.map((r) => ({
		ids: pointerIds(prop(src, r, "person")),
		name: textOf(prop(src, r, "name")),
		hoursPerWeek: numberOf(prop(src, r, "hours")),
		percent: numberOf(prop(src, r, "workload")),
	}))
}

/** Percent mode fits an effort column named like an allocation (%, FTE, workload, allocation). */
export function looksLikePercent(name: string | undefined): boolean {
	return !!name && /%|percent|alloc|fte|workload|auslastung/i.test(name)
}

export function columns(src: SourceSnapshot) {
	const all = Object.entries(src.propertySchemasById).map(([id, s]) => ({ id, name: s.name ?? id, type: s.type }))
	return {
		group: all.filter((c) => GROUP_TYPES.includes(c.type)),
		effort: all.filter((c) => NUM_TYPES.includes(c.type) && src.items.some((r) => numberOf(r.propertiesById[c.id]) != null)),
	}
}

/** Bound manifest key when it's a valid choice, else the first column of a preferred type. */
export function pick(src: SourceSnapshot, chosen: string | null, key: string, cands: Column[], prefer: string[]): string | null {
	if (chosen === "") return null
	if (chosen && cands.some((c) => c.id === chosen)) return chosen
	const bound = src.propertyIdsByKey[key]
	if (bound && cands.some((c) => c.id === bound)) return bound
	for (const t of prefer) {
		const c = cands.find((x) => x.type === t)
		if (c) return c.id
	}
	return null
}

/** Lane / series keys and labels a property value stands for. */
function valuesOf(v: unknown, type: string, res: Resolvers): { key: string; label: string }[] {
	if (["people", "person", "created_by", "relation"].includes(type)) {
		return pointerIds(v).map((id) => ({ key: id, label: (type === "relation" ? res.pageTitle(id) : res.userName(id)) ?? "Unknown" }))
	}
	if (type === "multi_select") return asStrings(v).map((s) => ({ key: s.toLowerCase(), label: s }))
	const t = textOf(v).trim()
	return t ? [{ key: t.toLowerCase(), label: t }] : []
}

const NONE = "__none"

export function workload(src: SourceSnapshot, visible: Set<string> | null, res: Resolvers, o: Options): Workload {
	const schema = src.propertySchemasById
	const today = toDay(o.today)
	const cap = o.mode === "percent" ? 100 : o.capacity
	const unit = o.mode === "percent" ? "%" : "h"
	const countDay = (d: number) => !o.workdays || isWorkday(d)
	const perWeek = o.workdays ? 5 : 7
	// Notion's percent number format stores 50% as 0.5.
	const efforts = o.effort ? src.items.map((r) => numberOf(r.propertiesById[o.effort!])).filter((v): v is number => v != null) : []
	const fractions = o.mode === "percent" && efforts.length > 0 && efforts.every((v) => Math.abs(v) <= 1.5)
	const scale = fractions ? 100 : 1

	const laneLabel = new Map<string, string>()
	const seriesLabel = new Map<string, string>()
	const items: Assignment[] = []
	let skipped = 0
	for (const r of src.items) {
		if (visible && !visible.has(r.id)) continue
		const d = dateOf(prop(src, r, "dates"))
		const raw = o.effort ? numberOf(r.propertiesById[o.effort]) : null
		const effort = raw == null ? null : raw * scale
		if (!d || effort == null) {
			skipped++
			continue
		}
		const start = toDay(d.start)
		const end = Math.max(start, d.end ? toDay(d.end) : start)
		let days = 0
		for (let x = start; x <= end; x++) if (countDay(x)) days++
		const perDay = o.mode === "total" ? (days ? effort / days : 0) : effort
		const lanes = o.groupBy ? valuesOf(r.propertiesById[o.groupBy], schema[o.groupBy]?.type ?? "", res) : []
		for (const l of lanes) laneLabel.set(l.key, l.label)
		const colors = o.colorBy ? valuesOf(r.propertiesById[o.colorBy], schema[o.colorBy]?.type ?? "", res) : []
		for (const c of colors) seriesLabel.set(c.key, c.label)
		items.push({
			id: r.id,
			name: textOf(prop(src, r, "name")).trim() || "Untitled",
			start,
			end,
			// Shared assignments split their effort equally between lanes.
			perDay: perDay / Math.max(1, lanes.length),
			color: colors[0]?.key ?? NONE,
			lanes: lanes.length ? lanes.map((l) => l.key) : [NONE],
		})
	}

	const first = items.length ? Math.min(...items.map((i) => i.start)) : today
	const last = items.length ? Math.max(...items.map((i) => i.end)) : today + 30
	const start = bucketStart(o.from ? toDay(o.from) : first, o.bucket)
	const endDay = o.to ? toDay(o.to) : last
	const buckets: number[] = []
	for (let t = start; t <= endDay; t = nextBucket(t, o.bucket)) buckets.push(t)
	const end = buckets.length ? nextBucket(buckets[buckets.length - 1], o.bucket) : start + 1

	const series: Series[] = [...seriesLabel.entries()].sort((a, b) => a[1].localeCompare(b[1])).map(([key, label], index) => ({ key, label, index }))
	if (items.some((i) => i.color === NONE)) series.push({ key: NONE, label: o.colorBy ? "No value" : "Assignments", index: series.length })
	const sIdx = new Map(series.map((s) => [s.key, s.index]))

	const byLane = new Map<string, Assignment[]>()
	for (const i of items) for (const l of i.lanes) byLane.set(l, [...(byLane.get(l) ?? []), i])

	const capOf = (key: string, label: string): Pick<Lane, "cap" | "capFrom" | "capLabel"> => {
		const p = o.people?.find((x) => x.ids.includes(key)) ?? o.people?.find((x) => x.name.trim().toLowerCase() === label.trim().toLowerCase())
		const pct = p?.percent != null ? (p.percent <= 1.5 ? p.percent * 100 : p.percent) : null
		if (p && (p.hoursPerWeek != null || pct != null)) {
			const hours = p.hoursPerWeek ?? (o.capacity * perWeek * (pct ?? 100)) / 100
			const share = pct ?? (hours / (o.capacity * perWeek)) * 100
			return {
				cap: o.mode === "percent" ? share : hours / perWeek,
				capFrom: "people",
				capLabel: p.hoursPerWeek != null ? `${fmtNum(p.hoursPerWeek)} h/wk` : `${fmtNum(share)}%`,
			}
		}
		return { cap, capFrom: "default", capLabel: o.mode === "percent" ? "100%" : `${fmtNum(cap * perWeek)} h/wk` }
	}

	const lanes: Lane[] = [...byLane.entries()].map(([key, its]) => {
		const lc = capOf(key, key === NONE ? "" : (laneLabel.get(key) ?? key))
		const load = buckets.map(() => series.map(() => 0))
		let used = 0
		let avail = 0
		buckets.forEach((b, bi) => {
			const nb = nextBucket(b, o.bucket)
			let days = 0
			for (let x = b; x < nb; x++) if (countDay(x)) days++
			avail += days * lc.cap
			if (!days) return
			for (const i of its) {
				const lo = Math.max(b, i.start)
				const hi = Math.min(nb - 1, i.end)
				let n = 0
				for (let x = lo; x <= hi; x++) if (countDay(x)) n++
				if (!n) continue
				load[bi][sIdx.get(i.color)!] += (i.perDay * n) / days
				used += i.perDay * n
			}
		})
		const total = load.map((s) => s.reduce((a, b) => a + b, 0))
		return {
			key,
			label: key === NONE ? "Unassigned" : (laneLabel.get(key) ?? key),
			load,
			total,
			peak: Math.max(0, ...total),
			utilization: avail ? used / avail : 0,
			overBuckets: total.filter((t) => t > lc.cap + 1e-9).length,
			items: its.sort((a, b) => a.start - b.start || a.end - b.end),
			...lc,
		}
	})
	lanes.sort((a, b) => (a.key === NONE ? 1 : b.key === NONE ? -1 : a.label.localeCompare(b.label)))
	return { lanes, series, buckets, start, end, today, cap, unit, skipped, fractions }
}

export function fmtNum(n: number): string {
	return Number.isInteger(Math.round(n * 10) / 10) ? String(Math.round(n)) : n.toFixed(1)
}
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
export function fmtDay(day: number, year = false): string {
	const d = new Date(day * 86400000)
	return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}${year ? ` ’${String(d.getUTCFullYear()).slice(2)}` : ""}`
}
export function fmtBucket(day: number, b: Bucket): string {
	const d = new Date(day * 86400000)
	if (b === "month") return `${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`
	if (b === "week") return `Week of ${fmtDay(day, true)}`
	return fmtDay(day, true)
}
