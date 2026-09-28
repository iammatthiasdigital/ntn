/**
 * Workload model. Pure: allocation rows in, per-person load curves out.
 *
 * One Workload database is enough: each row allocates a person (a people
 * property, or a relation to a person page) to a project (select or
 * relation) with a workload (%, or hours), optionally over dates — rows
 * without dates are ongoing. Teams come from a select or relation on the
 * row or on the person. An optional People database adds everyone (also
 * those without allocations), their team and their working time; without
 * it, working time is 100% unless set locally per person.
 */
import { asStrings, dateOf, numberOf, pointerIds, textOf, type Resolvers } from "./kit/filters/core"
import type { SourceRow, SourceSnapshot } from "./kit/sources"

export type Bucket = "day" | "week" | "month"
/**
 * How the workload number is meant:
 * - percent: share of a person's full time (50 = half; Notion's 0.5 works too)
 * - perDay: hours per day while it runs
 * - total: hours for the whole allocation, spread over its days
 */
export type EffortMode = "percent" | "perDay" | "total"

/** Which columns mean what. Team and capacity ids are prefixed "w:" (Workload) or "p:" (People). */
export type Setup = {
	person: string | null
	project: string | null
	team: string | null
	effort: string | null
	dates: string | null
	/** People database: the people property that matches the Workload's person column (optional). */
	pPerson: string | null
	/** People database: working time, hours per week or % of full time. */
	pCap: string | null
}

export type Options = Setup & {
	mode: EffortMode
	/** Hours in a full working day (hours modes). */
	dayHours: number
	/** Local working time per lane key, % of full time. */
	caps: Record<string, number>
	workdays: boolean
	bucket: Bucket
	from: string | null
	to: string | null
	today: string
}

export type Allocation = { id: string; name: string; start: number; end: number; ongoing: boolean; perDay: number; color: string }
export type Series = { key: string; label: string; index: number }
export type Lane = {
	key: string
	label: string
	team: string | null
	load: number[][]
	total: number[]
	peak: number
	utilization: number
	overBuckets: number
	items: Allocation[]
	/** Capacity per (work)day in the chart's unit. */
	cap: number
	/** Working time in % of full time, and where it came from. */
	share: number
	capFrom: "people" | "local" | "default"
}
export type Workload = {
	lanes: Lane[]
	series: Series[]
	buckets: number[]
	start: number
	end: number
	today: number
	unit: string
	skipped: number
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

export type Column = { id: string; name: string; type: string }
const cols = (src: SourceSnapshot | undefined, types: string[]): Column[] =>
	src?.bound ? Object.entries(src.propertySchemasById).filter(([, s]) => types.includes(s.type)).map(([id, s]) => ({ id, name: s.name ?? id, type: s.type })) : []

export const PERSON_TYPES = ["people", "relation", "select", "created_by"]
export const PROJECT_TYPES = ["select", "multi_select", "relation", "status"]
export const TEAM_TYPES = ["select", "multi_select", "relation"]
export const NUM_TYPES = ["number", "formula", "rollup"]

export function columns(work: SourceSnapshot, people?: SourceSnapshot) {
	return {
		person: cols(work, PERSON_TYPES),
		project: cols(work, PROJECT_TYPES),
		effort: cols(work, NUM_TYPES),
		dates: cols(work, ["date"]),
		team: [...cols(people, TEAM_TYPES).map((c) => ({ ...c, id: `p:${c.id}` })), ...cols(work, TEAM_TYPES).map((c) => ({ ...c, id: `w:${c.id}` }))],
		pPerson: cols(people, ["people"]),
		pCap: cols(people, NUM_TYPES),
	}
}

/** Workload columns named like an allocation (%, FTE, workload…) hold percentages. */
export function looksLikePercent(name: string | undefined): boolean {
	return !!name && /%|percent|alloc|fte|workload|auslastung/i.test(name)
}
const looksLikeHours = (name: string | undefined) => !!name && /hour|stunde|\bh\b|h\/w/i.test(name)

/** A chosen column when it still exists, else the best guess ("" = none, kept as none). */
function choose(chosen: string | null, list: Column[], guesses: ((c: Column) => boolean)[]): string | null {
	if (chosen === "") return null
	if (chosen && list.some((c) => c.id === chosen)) return chosen
	for (const g of guesses) {
		const c = list.find(g)
		if (c) return c.id
	}
	return null
}
const named = (re: RegExp) => (c: Column) => re.test(c.name)
const typed = (...t: string[]) => (c: Column) => t.includes(c.type)

/** Fills unset parts of the setup by column names and types. */
export function resolveSetup(s: Partial<Setup>, work: SourceSnapshot, people?: SourceSnapshot): Setup {
	const c = columns(work, people)
	const person = choose(s.person ?? null, c.person, [named(/person|who|member|resource|assignee|owner|mitarbeit/i), typed("people"), typed("relation")])
	const team = choose(s.team ?? null, c.team, [named(/team|squad|department|abteilung|group/i)])
	const project = choose(s.project ?? null, c.project.filter((x) => x.id !== person && `w:${x.id}` !== team), [named(/project|allocation|client|initiative|projekt|kunde/i), typed("select"), typed("relation")])
	return {
		person,
		project,
		team,
		effort: choose(s.effort ?? null, c.effort, [(x) => looksLikePercent(x.name), named(/effort|hours|stunden/i), () => true]),
		dates: choose(s.dates ?? null, c.dates, [named(/date|when|period|zeitraum/i), () => true]),
		pPerson: choose(s.pPerson ?? null, c.pPerson, [() => true]),
		pCap: choose(s.pCap ?? null, c.pCap, [named(/%|workload|fte|capacity|hours|kapazit|stunden/i)]),
	}
}

/* ---- values ---- */

type Val = { key: string; label: string }
function valuesOf(v: unknown, type: string, res: Resolvers): Val[] {
	if (["people", "created_by", "relation"].includes(type)) {
		return pointerIds(v).map((id) => ({ key: id, label: (type === "relation" ? res.pageTitle(id) : res.userName(id)) ?? (type === "relation" ? "Untitled" : "Someone") }))
	}
	if (type === "multi_select") return asStrings(v).map((s) => ({ key: s.toLowerCase(), label: s }))
	const t = textOf(v).trim()
	return t ? [{ key: t.toLowerCase(), label: t }] : []
}
const split = (id: string | null) => (id ? { db: id.slice(0, 1), id: id.slice(2) } : null)
const titleOf = (src: SourceSnapshot, r: SourceRow) => {
	const t = Object.entries(src.propertySchemasById).find(([, s]) => s.type === "title")?.[0]
	return t ? textOf(r.propertiesById[t]).trim() : ""
}

const NONE = "__none"

export function workload(work: SourceSnapshot, people: SourceSnapshot | undefined, visible: Set<string> | null, res: Resolvers, o: Options): Workload {
	const ws = work.propertySchemasById
	const today = toDay(o.today)
	const countDay = (d: number) => !o.workdays || isWorkday(d)
	const perWeek = o.workdays ? 5 : 7
	const pct = o.mode === "percent"
	const efforts = o.effort ? work.items.map((r) => numberOf(r.propertiesById[o.effort!])).filter((v): v is number => v != null) : []
	// Notion's percent number format stores 50% as 0.5.
	const fractions = pct && efforts.length > 0 && efforts.every((v) => Math.abs(v) <= 1.5)
	const scale = fractions ? 100 : 1
	const team = split(o.team)
	const pRows = people?.bound ? people.items : []

	/* People rows: who they are and how to find them. */
	const personRow = (v: Val): SourceRow | undefined =>
		pRows.find((r) => r.id === v.key) ??
		(o.pPerson ? pRows.find((r) => pointerIds(r.propertiesById[o.pPerson!]).includes(v.key)) : undefined) ??
		pRows.find((r) => titleOf(people!, r).toLowerCase() === v.label.toLowerCase())

	/* Allocations. */
	type Raw = { r: SourceRow; start: number | null; end: number | null; effort: number; lanes: Val[]; color: Val | undefined; team: Val | undefined }
	const raws: Raw[] = []
	let skipped = 0
	const seriesLabel = new Map<string, string>()
	for (const r of work.items) {
		if (visible && !visible.has(r.id)) continue
		const raw = o.effort ? numberOf(r.propertiesById[o.effort]) : null
		if (raw == null) {
			skipped++
			continue
		}
		const d = o.dates ? dateOf(r.propertiesById[o.dates]) : null
		const lanes = o.person ? valuesOf(r.propertiesById[o.person], ws[o.person]?.type ?? "", res) : []
		const color = o.project ? valuesOf(r.propertiesById[o.project], ws[o.project]?.type ?? "", res)[0] : undefined
		if (color) seriesLabel.set(color.key, color.label)
		const t = team?.db === "w" ? valuesOf(r.propertiesById[team.id], ws[team.id]?.type ?? "", res)[0] : undefined
		const start = d ? toDay(d.start) : null
		raws.push({ r, start, end: d ? Math.max(start!, d.end ? toDay(d.end) : start!) : null, effort: raw * scale, lanes, color, team: t })
	}

	/* Range: dated allocations, or the next quarter when everything is ongoing. */
	const dated = raws.filter((x) => x.start != null)
	const first = dated.length ? Math.min(...dated.map((x) => x.start!)) : today - 7
	const last = dated.length ? Math.max(...dated.map((x) => x.end!), today + 28) : today + 84
	const start = bucketStart(o.from ? toDay(o.from) : first, o.bucket)
	const endDay = o.to ? toDay(o.to) : last
	const buckets: number[] = []
	for (let t = start; t <= endDay && buckets.length < 400; t = nextBucket(t, o.bucket)) buckets.push(t)
	const end = buckets.length ? nextBucket(buckets[buckets.length - 1], o.bucket) : start + 1

	/* Lanes: people rows first (so everyone shows), then whoever else is allocated. */
	type LaneAcc = { key: string; label: string; row?: SourceRow; items: Allocation[]; teams: Map<string, { v: Val; n: number }> }
	const lanes = new Map<string, LaneAcc>()
	const laneFor = (v: Val): LaneAcc => {
		const row = v.key === NONE ? undefined : personRow(v)
		const key = row ? `p:${row.id}` : v.key
		let l = lanes.get(key)
		if (!l) {
			l = { key, label: row ? titleOf(people!, row) || v.label : v.label, row, items: [], teams: new Map() }
			lanes.set(key, l)
		}
		return l
	}
	if (!visible) for (const r of pRows) laneFor({ key: r.id, label: titleOf(people!, r) })
	for (const x of raws) {
		const who = x.lanes.length ? x.lanes : [{ key: NONE, label: "Unassigned" }]
		const s = x.start ?? start
		const e = x.end ?? end - 1
		let days = 0
		for (let d = s; d <= e; d++) if (countDay(d)) days++
		const perDay = o.mode === "total" ? (days ? x.effort / days : 0) : x.effort
		for (const v of who) {
			const l = laneFor(v)
			// Shared allocations split their workload equally.
			l.items.push({ id: x.r.id, name: titleOf(work, x.r) || "Untitled", start: s, end: e, ongoing: x.start == null, perDay: perDay / who.length, color: x.color?.key ?? NONE })
			if (x.team) l.teams.set(x.team.key, { v: x.team, n: (l.teams.get(x.team.key)?.n ?? 0) + 1 })
		}
	}

	const series: Series[] = [...seriesLabel.entries()].sort((a, b) => a[1].localeCompare(b[1])).map(([key, label], index) => ({ key, label, index }))
	if (raws.some((x) => !x.color)) series.push({ key: NONE, label: o.project ? "No project" : "Allocations", index: series.length })
	const sIdx = new Map(series.map((s) => [s.key, s.index]))
	const full = pct ? 100 : o.dayHours
	const capColName = o.pCap ? people?.propertySchemasById[o.pCap]?.name : undefined

	const out: Lane[] = [...lanes.values()].map((l) => {
		// Working time in % of full time: People column, else local, else 100%.
		let share = 100
		let capFrom: Lane["capFrom"] = "default"
		const pv = l.row && o.pCap ? numberOf(l.row.propertiesById[o.pCap]) : null
		if (pv != null) {
			share = looksLikeHours(capColName) ? (pv / (o.dayHours * perWeek)) * 100 : pv <= 1.5 ? pv * 100 : pv
			capFrom = "people"
		} else if (o.caps[l.key] != null) {
			share = o.caps[l.key]
			capFrom = "local"
		}
		const cap = (full * share) / 100
		let tv: Val | undefined
		if (team?.db === "p" && l.row) tv = valuesOf(l.row.propertiesById[team.id], people!.propertySchemasById[team.id]?.type ?? "", res)[0]
		else tv = [...l.teams.values()].sort((a, b) => b.n - a.n)[0]?.v
		const load = buckets.map(() => series.map(() => 0))
		let used = 0
		let avail = 0
		buckets.forEach((b, bi) => {
			const nb = nextBucket(b, o.bucket)
			let days = 0
			for (let d = b; d < nb; d++) if (countDay(d)) days++
			avail += days * cap
			if (!days) return
			for (const i of l.items) {
				let n = 0
				for (let d = Math.max(b, i.start); d <= Math.min(nb - 1, i.end); d++) if (countDay(d)) n++
				if (!n) continue
				load[bi][sIdx.get(i.color)!] += (i.perDay * n) / days
				used += i.perDay * n
			}
		})
		const total = load.map((s) => s.reduce((a, b) => a + b, 0))
		return {
			key: l.key,
			label: l.key === NONE ? "Unassigned" : l.label,
			team: tv?.label ?? null,
			load,
			total,
			peak: Math.max(0, ...total),
			utilization: avail ? used / avail : 0,
			overBuckets: total.filter((t) => t > cap + 1e-9).length,
			items: l.items.sort((a, b) => a.start - b.start || a.end - b.end),
			cap,
			share,
			capFrom,
		}
	})
	out.sort((a, b) => (a.key === NONE ? 1 : b.key === NONE ? -1 : (a.team ?? "￿").localeCompare(b.team ?? "￿") || a.label.localeCompare(b.label)))
	return { lanes: out, series, buckets, start, end, today, unit: pct ? "%" : "h", skipped, fractions }
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
