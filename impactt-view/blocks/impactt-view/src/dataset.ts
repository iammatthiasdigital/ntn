/**
 * Turns the three bound data sources (initiatives, KPIs, impacts) into the
 * chart's Dataset. Pure: the hosted hook and the standalone mock both feed
 * it source snapshots, so tests cover exactly what renders in Notion.
 * Parsing is tolerant — select wording, relation-or-text links, missing
 * optional properties — and whatever can't be used is counted, not dropped
 * silently.
 */
import { asStrings, dateOf, dayIso, numberOf, pointerIds, textOf, type FilterRow, type SchemaLike } from "./filters/core"
import type { Dataset, Fmt, GoalMode, Growth, Initiative, Kpi, Timing } from "./model"

export type SourceRow = {
	id: string
	propertiesById: Record<string, unknown>
	propertiesByKey: Record<string, unknown>
}

export type SourceSnapshot = {
	/** False when the slot isn't connected to a database (or failed to load). */
	bound: boolean
	items: SourceRow[]
	propertySchemasById: Record<string, SchemaLike>
	propertyIdsByKey: Record<string, string | undefined>
	/** More rows exist beyond the 999-row read limit. */
	truncated: boolean
	/** The bound collection's id, when the host reports it. */
	collectionId?: string
}

export type Sources = { initiatives: SourceSnapshot; kpis: SourceSnapshot; impacts: SourceSnapshot }

export type BuildOptions = {
	/** Local `YYYY-MM-DD`. */
	today: string
	timing: Timing
	/** Per KPI id, a goal mode chosen in the block (else: custom when a Goal is set). */
	goalModes: Record<string, GoalMode>
	/** Raw property id of the Impacts column to take KPIs from; null = automatic. */
	kpiColumn?: string | null
	/** Titles of related pages, for relation KPIs without a KPIs database row. */
	pageTitle?: (id: string) => string | undefined
}

export const KPI_COLUMN_TYPES = ["relation", "select", "multi_select"]

/** Impacts columns that can name the KPI: relations, selects and multi-selects (not the Initiative link). */
export function kpiColumnCandidates(src: Sources): { id: string; name: string; type: string }[] {
	const initCol = src.impacts.propertyIdsByKey.initiative
	return Object.entries(src.impacts.propertySchemasById)
		.filter(([id, s]) => KPI_COLUMN_TYPES.includes(s.type) && id !== initCol)
		.map(([id, s]) => ({ id, name: s.name ?? id, type: s.type }))
}

/** `kpiColumn` value meaning "number columns in the Initiatives database". */
export const COLUMNS_SOURCE = "__columns"

const PLAN_RE = /^(.*?)[\s·:\-–(]*\b(planned|plan|target|estimated|estimate)\)?\s*$/i
const DONE_RE = /^(.*?)[\s·:\-–(]*\b(achieved|actual|now|current|spent|used|delivered)\)?\s*$/i
const NUMERIC = ["number", "formula", "rollup"]

export type ColumnPair = { key: string; label: string; plan: string; done?: string }

/**
 * KPIs kept directly on the Initiatives database as pairs of number columns
 * named "<KPI> planned" / "<KPI> achieved" (also plan/target/estimate and
 * actual/now/spent/used/delivered). A pair without a KPI name is "Impact".
 */
export function kpiColumnPairs(src: Sources): ColumnPair[] {
	const plans = new Map<string, { label: string; id: string }>()
	const dones = new Map<string, string>()
	for (const [id, sch] of Object.entries(src.initiatives.propertySchemasById)) {
		if (!NUMERIC.includes(sch.type) || !sch.name) continue
		const pm = sch.name.match(PLAN_RE)
		if (pm) {
			const label = pm[1].trim() || "Impact"
			plans.set(label.toLowerCase(), { label, id })
			continue
		}
		const dm = sch.name.match(DONE_RE)
		if (dm) dones.set((dm[1].trim() || "Impact").toLowerCase(), id)
	}
	return [...plans.entries()].map(([k, v]) => ({ key: `col:${k}`, label: v.label, plan: v.id, done: dones.get(k) }))
}

/** The chosen source if it's still available, else the bound `kpi` slot, else the first Impacts column, else Initiatives columns. */
export function kpiColumnOf(src: Sources, chosen: string | null): string | null {
	const c = src.impacts.bound ? kpiColumnCandidates(src) : []
	const pairs = kpiColumnPairs(src)
	if (chosen === COLUMNS_SOURCE && pairs.length) return COLUMNS_SOURCE
	if (chosen && c.some((x) => x.id === chosen)) return chosen
	const bound = src.impacts.propertyIdsByKey.kpi
	if (bound && c.some((x) => x.id === bound)) return bound
	return c[0]?.id ?? (pairs.length ? COLUMNS_SOURCE : null)
}

export function parseKind(v: unknown, label: string): "impact" | "effort" {
	const s = textOf(v).toLowerCase()
	if (s) return /effort|cost|budget|time|spend/.test(s) ? "effort" : "impact"
	return /effort|person.?days|hours|story points|spent|capacity/i.test(label) ? "effort" : "impact"
}

export type Built = {
	/** Raw property id of the Impacts column the KPIs come from, or null if there's none. */
	kpiColumn: string | null
	/** All initiatives that have a plan window, in database order. */
	dataset: Dataset
	/** Rows for the filter engine, keyed by raw property id. */
	rows: FilterRow[]
	skipped: {
		/** Initiative names without a usable Plan date. */
		noPlan: string[]
		/** Impact rows whose initiative or KPI couldn't be matched, or without a Planned number. */
		impacts: number
	}
}

const month = (iso: string) => iso.slice(0, 7)

function endOfMonth(ym: string): string {
	const [y, m] = ym.split("-").map(Number)
	return dayIso(new Date(y, m, 0))
}

export function parseTiming(v: unknown): Timing | undefined {
	const s = textOf(v).toLowerCase()
	if (!s) return undefined
	if (/impact|fixed|date/.test(s)) return "fixed"
	if (/timeline|flex|move|slip/.test(s)) return "flexible"
	return undefined
}

export function parseGrowth(v: unknown): Growth | undefined {
	const s = textOf(v).toLowerCase()
	if (!s) return undefined
	if (/exp/.test(s)) return "exp"
	if (/lin/.test(s)) return "linear"
	return undefined
}

export function parseUnit(v: unknown): Fmt {
	const s = textOf(v).toLowerCase()
	if (/%|percent|pp|rate/.test(s)) return "pp"
	if (/€|eur/.test(s)) return "eur"
	if (/\$|usd|dollar/.test(s)) return "usd"
	return "count"
}

export function parseDirection(v: unknown): "up" | "down" {
	return /decrease|down|lower|reduce|burn|less/.test(textOf(v).toLowerCase()) ? "down" : "up"
}

/** Relation pointers, or — if the host sends text — ids of rows with that title. */
function linkIds(v: unknown, byTitle: Map<string, string>): string[] {
	const ids = pointerIds(v)
	if (ids.length) return ids.map((s) => byTitle.get(s.toLowerCase()) ?? s)
	if (typeof v !== "string") return []
	return v
		.split(/\s*,\s*/)
		.map((s) => byTitle.get(s.trim().toLowerCase()))
		.filter((s): s is string => !!s)
}

export function buildDataset(src: Sources, opts: BuildOptions): Built {
	const p = (row: SourceRow, key: string) => row.propertiesByKey[key]
	const initiatives: Initiative[] = []
	const noPlan: string[] = []
	const months: string[] = [month(opts.today)]
	for (const row of src.initiatives.items) {
		const name = textOf(p(row, "name")).trim() || "Untitled"
		const plan = dateOf(p(row, "plan"))
		if (!plan) {
			noPlan.push(name)
			continue
		}
		const planEnd = plan.end ?? endOfMonth(month(plan.start))
		const planStart = plan.end ? plan.start : month(plan.start)
		const start = dateOf(p(row, "start"))
		const done = dateOf(p(row, "done"))
		const it: Initiative = {
			id: row.id,
			name,
			plan: [planStart, planEnd <= plan.start ? plan.start : planEnd],
			impact: {},
		}
		if (start) it.start = start.start
		if (done) it.done = done.end ?? done.start
		const timing = parseTiming(p(row, "timing"))
		if (timing) it.timing = timing
		const growth = parseGrowth(p(row, "growth"))
		if (growth) it.growth = growth
		const note = textOf(p(row, "note")).trim()
		if (note) it.note = note
		months.push(month(plan.start), month(it.plan[1]))
		if (it.start) months.push(month(it.start))
		initiatives.push(it)
	}

	/* ---- KPIs: the distinct values of the chosen Impacts column ---- */
	const col = kpiColumnOf(src, opts.kpiColumn ?? null)
	const pairs = col === COLUMNS_SOURCE ? kpiColumnPairs(src) : []
	const colType = col === COLUMNS_SOURCE ? "columns" : col ? src.impacts.propertySchemasById[col]?.type : undefined
	const kpiRows = src.kpis.bound ? src.kpis.items : []
	const kpiRowById = new Map(kpiRows.map((r) => [r.id, r]))
	const kpiRowByTitle = new Map(kpiRows.map((r) => [textOf(p(r, "name")).trim().toLowerCase(), r]))
	/** KPI keys an impact row points at: page ids (relation) or `opt:<name>` (select / multi-select). */
	const kpiKeysOf = (row: SourceRow): { key: string; label?: string }[] => {
		if (!col) return []
		const raw = row.propertiesById[col]
		if (colType === "relation") {
			const ids = pointerIds(raw)
			if (ids.length) return ids.map((id) => ({ key: id }))
			// Text fallback: match KPI row titles.
			return asStrings(raw)
				.flatMap((t) => t.split(/\s*,\s*/))
				.map((t) => kpiRowByTitle.get(t.toLowerCase()))
				.filter((r): r is SourceRow => !!r)
				.map((r) => ({ key: r.id }))
		}
		return asStrings(raw).map((name) => ({ key: `opt:${name.trim().toLowerCase()}`, label: name.trim() }))
	}
	const found = new Map<string, { label?: string; values: number[] }>()
	for (const pr of pairs) {
		const values = src.initiatives.items.map((r) => numberOf(r.propertiesById[pr.plan])).filter((v): v is number => v != null)
		if (values.length) found.set(pr.key, { label: pr.label, values })
	}
	for (const row of colType === "columns" ? [] : src.impacts.items) {
		const planned = numberOf(p(row, "planned"))
		for (const { key, label } of kpiKeysOf(row)) {
			const e = found.get(key) ?? { label, values: [] }
			if (planned != null) e.values.push(planned)
			found.set(key, e)
		}
	}
	// Order: select options as the schema lists them, KPI rows as the database lists them, then first use.
	const optionOrder = (src.impacts.propertySchemasById[col ?? ""]?.options ?? []).map((o) => `opt:${o.name.toLowerCase()}`)
	const rowOrder = kpiRows.map((r) => r.id)
	const rank = (key: string) => {
		const i = colType === "relation" ? rowOrder.indexOf(key) : optionOrder.indexOf(key)
		return i < 0 ? Number.MAX_SAFE_INTEGER : i
	}
	const keys = [...found.keys()].map((key, i) => ({ key, i })).sort((x, y) => rank(x.key) - rank(y.key) || x.i - y.i).map((x) => x.key)

	const kpis: Kpi[] = []
	for (const key of keys) {
		const info = found.get(key)!
		const row = colType === "relation" ? kpiRowById.get(key) : info.label ? kpiRowByTitle.get(info.label.toLowerCase()) : undefined
		const label =
			(row ? textOf(p(row, "name")).trim() : "") || info.label || opts.pageTitle?.(key) || "Untitled KPI"
		const goal = row ? numberOf(p(row, "goal")) : null
		const goalBy = row ? dateOf(p(row, "goalBy")) : null
		let spread = row ? numberOf(p(row, "range")) : null
		if (spread != null && spread > 1) spread /= 100
		const allDown = info.values.length > 0 && info.values.every((v) => v < 0)
		const mode: GoalMode = opts.goalModes[key] ?? (goal != null ? "custom" : "plan")
		const k: Kpi = {
			id: key,
			label,
			fmt: parseUnit(row && p(row, "unit") != null ? p(row, "unit") : /%|€|\$|percent|rate/i.test(label) ? label : ""),
			base: (row ? numberOf(p(row, "baseline")) : null) ?? 0,
			direction: row && textOf(p(row, "direction")) ? parseDirection(p(row, "direction")) : allDown ? "down" : "up",
			kind: parseKind(row ? p(row, "kind") : undefined, label),
			goal: { mode },
		}
		if (row) k.rowId = row.id
		if (spread != null && spread >= 0) k.spread = spread
		if (goal != null) k.goal!.value = goal
		if (goalBy) {
			k.goal!.by = goalBy.end ?? goalBy.start
			months.push(month(k.goal!.by))
		}
		kpis.push(k)
	}

	/* ---- impacts ---- */
	const initByTitle = new Map(initiatives.map((i) => [i.name.toLowerCase(), i.id]))
	const initById = new Map(initiatives.map((i) => [i.id, i]))
	let skippedImpacts = 0
	for (const pr of pairs) {
		for (const row of src.initiatives.items) {
			const it = initById.get(row.id)
			const planned = numberOf(row.propertiesById[pr.plan])
			if (!it || planned == null) continue
			const achieved = pr.done ? numberOf(row.propertiesById[pr.done]) : null
			it.impact[pr.key] = achieved != null ? { plan: planned, now: achieved } : { plan: planned }
		}
	}
	for (const row of colType === "columns" ? [] : src.impacts.items) {
		const planned = numberOf(p(row, "planned"))
		const achieved = numberOf(p(row, "achieved"))
		const inits = linkIds(p(row, "initiative"), initByTitle)
		const ks = kpiKeysOf(row).map((x) => x.key)
		const targets = inits.map((id) => initById.get(id)).filter((i): i is Initiative => !!i)
		if (planned == null || targets.length === 0 || ks.length === 0) {
			// Impacts of initiatives without a plan are already reported there.
			const planless = inits.length > 0 && targets.length === 0 && src.initiatives.items.some((r) => inits.includes(r.id))
			if (!planless) skippedImpacts++
			continue
		}
		for (const it of targets) {
			for (const kid of ks) {
				const cur = it.impact[kid]
				it.impact[kid] = cur
					? { plan: cur.plan + planned, now: (cur.now ?? 0) + (achieved ?? 0) }
					: achieved != null
						? { plan: planned, now: achieved }
						: { plan: planned }
			}
		}
	}

	return {
		kpiColumn: col,
		dataset: {
			start: months.sort()[0],
			today: opts.today,
			timing: opts.timing,
			kpis,
			initiatives,
		},
		rows: src.initiatives.items.map((r) => ({ id: r.id, props: r.propertiesById })),
		skipped: { noPlan, impacts: skippedImpacts },
	}
}

/** Names of declared properties that aren't connected, per data source. */
export function unboundProperties(src: Sources, required: Record<keyof Sources, string[]>): string[] {
	const out: string[] = []
	for (const key of Object.keys(required) as (keyof Sources)[]) {
		for (const prop of required[key]) if (src[key].bound && src[key].propertyIdsByKey[prop] === undefined) out.push(`${key}.${prop}`)
	}
	return out
}

export const AVG_KPI_ID = "__avg"

/**
 * Average mode for several KPIs (all of them, or the ones in `kpiIds`):
 * every initiative that moves at least one of them gets an equal share of a
 * 100% goal, and its achieved share is that share times the mean of its
 * per-KPI reach (achieved ÷ planned, capped at ±300%). With `includeAll`,
 * initiatives that move none of them take part too, judged by delivery only:
 * a done one has reached its share, others count as planned. The goal date
 * is the latest goal date among the KPIs; the range is their mean range.
 */
export function averageDataset(D: Dataset, kpiIds?: string[], includeAll = false): Dataset {
	const ks = kpiIds?.length ? D.kpis.filter((k) => kpiIds.includes(k.id)) : D.kpis
	const moves = (i: Initiative) => ks.some((k) => i.impact[k.id] && i.impact[k.id].plan !== 0)
	const members = D.initiatives.filter((i) => includeAll || moves(i))
	const share = members.length ? 100 / members.length : 0
	const initiatives = D.initiatives.map((it): Initiative => {
		if (!members.includes(it)) return { ...it, impact: {} }
		if (!moves(it)) return { ...it, impact: { [AVG_KPI_ID]: it.done ? { plan: share, now: share } : { plan: share } } }
		const reach: number[] = []
		let anyNow = false
		for (const k of ks) {
			const imp = it.impact[k.id]
			if (!imp || imp.plan === 0) continue
			if (imp.now != null) anyNow = true
			reach.push(Math.max(-3, Math.min(3, (imp.now ?? 0) / imp.plan)))
		}
		const mean = reach.reduce((a, b) => a + b, 0) / reach.length
		return { ...it, impact: { [AVG_KPI_ID]: anyNow ? { plan: share, now: share * mean } : { plan: share } } }
	})
	const bys = ks.map((k) => k.goal?.by).filter((b): b is string => !!b).sort()
	const spreads = ks.map((k) => k.spread ?? 0.3)
	const kpi: Kpi = {
		id: AVG_KPI_ID,
		label: ks.length === D.kpis.length ? "All KPIs · average reach" : `Average of ${ks.map((k) => k.label).join(", ")}`,
		fmt: "pp",
		base: 0,
		direction: "up",
		spread: spreads.reduce((a, b) => a + b, 0) / (spreads.length || 1),
		goal: { mode: "custom", value: 100, ...(bys.length ? { by: bys[bys.length - 1] } : {}) },
	}
	return { ...D, kpis: [kpi], initiatives }
}
