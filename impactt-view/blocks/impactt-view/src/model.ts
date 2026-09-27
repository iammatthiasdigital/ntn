/**
 * Impactt model: a Gantt chart where each bar's height is the KPI change an
 * initiative delivers, stacked from the KPI's baseline toward its goal.
 * Pure — no DOM. Time is measured in months since `Dataset.start`
 * (fractional within a month), so month-granular and day-granular inputs mix.
 */

export type Fmt = "count" | "eur" | "usd" | "pp"
export type Timing = "flexible" | "fixed"
export type Growth = "linear" | "exp"
export type GoalMode = "plan" | "custom"

export type Kpi = {
	id: string
	/** The KPIs-database row describing this KPI, when there is one. */
	rowId?: string
	label: string
	fmt: Fmt
	/** Value before the first initiative. */
	base: number
	/** "down" for burndown KPIs (churn, cost). */
	direction?: "up" | "down"
	/**
	 * "effort": the bars are work (hours, person-days, cost) rather than an
	 * outcome. Planned = estimate, achieved = spent; spending more than
	 * planned is the bad case, and the goal is a budget.
	 */
	kind?: "impact" | "effort"
	/** Projection uncertainty as a fraction, e.g. 0.3 = ±30%. */
	spread?: number
	goal?: { mode?: GoalMode; value?: number; by?: string }
}

export type Initiative = {
	id: string
	name: string
	/** Planned window, `YYYY-MM` or `YYYY-MM-DD`; the end is inclusive. */
	plan: [string, string]
	start?: string
	done?: string
	timing?: Timing
	growth?: Growth
	note?: string
	/** Per KPI id: the planned change and what it has achieved so far. */
	impact: Record<string, { plan: number; now?: number }>
}

export type Dataset = {
	/** `YYYY-MM`: month 0 of the time axis. */
	start: string
	/** `YYYY-MM-DD`. */
	today: string
	/** Default deviation handling for initiatives without their own. */
	timing: Timing
	kpis: Kpi[]
	initiatives: Initiative[]
}

export const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
export const MONTH = [
	"January", "February", "March", "April", "May", "June",
	"July", "August", "September", "October", "November", "December",
]

export const clamp = (v: number, a: number, b: number): number => Math.max(a, Math.min(b, v))

/* ---------- time ---------- */

export type TimeUnit = "days" | "weeks" | "months" | "quarters" | "years"
export type Tick = { a: number; b: number; d: Date }

export type Time = ReturnType<typeof createTime>

export function createTime(start: string, todayIso: string) {
	const [by, bm] = start.split("-").map(Number)
	const b = { y: by, m: bm - 1 }
	function idx(s: string, isEnd = false): number {
		const p = s.split("-").map(Number)
		const mi = (p[0] - b.y) * 12 + (p[1] - 1 - b.m)
		if (p.length < 3) return isEnd ? mi + 1 : mi
		const dim = new Date(p[0], p[1], 0).getDate()
		return mi + (p[2] - (isEnd ? 0 : 1)) / dim
	}
	function toDate(t: number): Date {
		const i = Math.floor(t)
		const y = b.y + Math.floor((b.m + i) / 12)
		const m = (((b.m + i) % 12) + 12) % 12
		const dim = new Date(y, m + 1, 0).getDate()
		return new Date(y, m, 1 + Math.min(dim - 1, Math.floor((t - i) * dim + 1e-6)))
	}
	function fromDate(d: Date): number {
		const dim = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()
		return (d.getFullYear() - b.y) * 12 + d.getMonth() - b.m + (d.getDate() - 1) / dim
	}
	const yy = (d: Date) => String(d.getFullYear()).slice(2)
	const dLab = (t: number) => {
		const d = toDate(t)
		return `${d.getDate()} ${MON[d.getMonth()]} ’${yy(d)}`
	}
	const mWin = (a: number, z: number) => {
		const d1 = toDate(a)
		const d2 = toDate(z - 0.01)
		return `${MON[d1.getMonth()]} ’${yy(d1)}–${MON[d2.getMonth()]} ’${yy(d2)}`
	}
	const monthYear = (t: number) => {
		const d = toDate(t)
		return `${MON[d.getMonth()]} ${d.getFullYear()}`
	}
	function ticks(unit: TimeUnit, v0: number, v1: number): Tick[] {
		const out: Tick[] = []
		let d = toDate(v0)
		d = new Date(d.getFullYear(), d.getMonth(), d.getDate())
		if (unit === "weeks") d.setDate(d.getDate() - ((d.getDay() + 6) % 7))
		else if (unit === "months") d = new Date(d.getFullYear(), d.getMonth(), 1)
		else if (unit === "quarters") d = new Date(d.getFullYear(), Math.floor(d.getMonth() / 3) * 3, 1)
		else if (unit === "years") d = new Date(d.getFullYear(), 0, 1)
		for (let g = 0; g < 4000; g++) {
			const a = fromDate(d)
			if (a >= v1) break
			let n: Date
			if (unit === "days") n = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)
			else if (unit === "weeks") n = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 7)
			else if (unit === "months") n = new Date(d.getFullYear(), d.getMonth() + 1, 1)
			else if (unit === "quarters") n = new Date(d.getFullYear(), d.getMonth() + 3, 1)
			else n = new Date(d.getFullYear() + 1, 0, 1)
			out.push({ a, b: fromDate(n), d: new Date(d) })
			d = n
		}
		return out
	}
	return { idx, toDate, fromDate, dLab, mWin, monthYear, ticks, today: idx(todayIso, false) }
}

export function isoWeek(d: Date): number {
	const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
	const day = t.getUTCDay() || 7
	t.setUTCDate(t.getUTCDate() + 4 - day)
	const y0 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1))
	return Math.ceil(((t.getTime() - y0.getTime()) / 864e5 + 1) / 7)
}

export function tickLabel(u: TimeUnit, d: Date, w: number): string {
	if (u === "days") return String(d.getDate())
	if (u === "weeks") return w < 30 ? String(isoWeek(d)) : "W" + isoWeek(d)
	if (u === "months") return w < 30 ? MON[d.getMonth()][0] : MON[d.getMonth()]
	if (u === "quarters") return "Q" + (Math.floor(d.getMonth() / 3) + 1)
	return String(d.getFullYear())
}

/* ---------- numbers ---------- */

const CUR: Partial<Record<Fmt, string>> = { eur: "€", usd: "$" }

export function fmt(v: number | null | undefined, f: Fmt): string {
	if (v == null || isNaN(v)) return "–"
	if (f === "pp") return Math.round(v * 10) / 10 + "%"
	const a = Math.abs(v)
	const k = a >= 1000 ? (Math.round(a / 100) / 10).toLocaleString("en") + "k" : Math.round(a).toLocaleString("en")
	const cur = CUR[f] ?? ""
	return (v < 0 && Math.round(a) !== 0 ? "−" : "") + cur + k
}

export function fmtD(v: number | null | undefined, f: Fmt): string {
	if (v == null || isNaN(v)) return "–"
	if (Math.abs(v) < 1e-9) return "±0"
	const s = v > 0 ? "+" : "−"
	if (f === "pp") return s + Math.round(Math.abs(v) * 10) / 10 + " pp"
	return s + fmt(Math.abs(v), f)
}

export function fmtMo(m: number): string {
	const a = Math.abs(m)
	if (a < 0.1) return "on time"
	return (m > 0 ? "+" : "−") + (a < 1 ? Math.round(a * 4.35) + " wk" : Math.round(a * 10) / 10 + " mo")
}

export function niceMax(v: number): number {
	if (v <= 0) return 10
	const e = Math.pow(10, Math.floor(Math.log10(v)))
	for (const m of [1, 1.2, 1.5, 2, 2.5, 3, 3.5, 4, 5, 6, 7, 8, 10]) if (m * e >= v * 1.04) return m * e
	return 10 * e
}

/* ---------- model ---------- */

const K = 3
export const CURVE: Record<Growth, { f: (u: number) => number; inv: (v: number) => number }> = {
	linear: { f: (u) => u, inv: (v) => v },
	exp: {
		f: (u) => (Math.exp(K * u) - 1) / (Math.exp(K) - 1),
		inv: (v) => Math.log(1 + v * (Math.exp(K) - 1)) / K,
	},
}
const ramp = (t: number, a: number, b: number) => (b <= a ? (t >= b ? 1 : 0) : clamp((t - a) / (b - a), 0, 1))

export type StateKey = "up" | "ok" | "delayed" | "bad" | "met" | "miss" | "late"
export const STATE: Record<StateKey, { c: string; l: string }> = {
	up: { c: "var(--s-up)", l: "Upcoming" },
	ok: { c: "var(--s-ok)", l: "On track" },
	delayed: { c: "var(--s-ok)", l: "Delayed, meets goal" },
	bad: { c: "var(--s-bad)", l: "Won’t meet" },
	met: { c: "var(--s-met)", l: "Done, met" },
	miss: { c: "var(--s-miss)", l: "Impact missed" },
	late: { c: "var(--s-late)", l: "Done late" },
}

/** One initiative's contribution to one KPI. */
export type Item = {
	it: Initiative
	id: string
	/** Planned and achieved change. */
	P: number
	N: number
	sg: number
	/** Plan start / end, actual start, actual end (done only). */
	pa: number
	pe: number
	D: number
	sa: number
	ea: number
	timing: Timing
	growth: Growth
	state: "done" | "planned" | "active"
	/** Projected final impact and projected end. */
	proj: number
	pend: number
	expected?: number
	est: (t: number) => number
	dImp: number
	dT: number
	st: StateKey
	color: string
	status: string
	/** Stack offset: where this bar starts on the value axis. */
	base: number
}

export type Model = {
	list: Item[]
	T: number
	planAt: (t: number) => number
	actAt: (t: number) => number
	projAt: (t: number, m?: number) => number
	planTotal: number
	projTotal: number
	hi: number
	lo: number
	dir: 1 | -1
}

const EFFORT_LABEL: Record<StateKey, string> = {
	up: "Upcoming",
	ok: "On track",
	delayed: "Delayed, within budget",
	bad: "Will overrun",
	met: "Done, within effort",
	miss: "Done, over effort",
	late: "Done late",
}

function item(D: Dataset, time: Time, it: Initiative, k: Kpi, goalBy: number): Item | null {
	const raw = it.impact[k.id]
	if (!raw) return null
	const T = time.today
	const { idx } = time
	const o = { it, id: it.id } as Item
	o.P = raw.plan
	o.N = raw.now ?? 0
	o.sg = Math.sign(o.P) || 1
	o.pa = idx(it.plan[0])
	o.pe = idx(it.plan[1], true)
	o.D = o.pe - o.pa
	o.sa = it.start ? idx(it.start) : o.pa
	o.timing = it.timing || D.timing
	o.growth = it.growth || "linear"
	const C = CURVE[o.growth]
	if (it.done) {
		o.state = "done"
		o.ea = idx(it.done, true)
		o.proj = o.N
		o.pend = o.ea
		o.est = (t) => o.N * C.f(ramp(t, o.sa, o.ea))
	} else if (T < o.sa || (!it.start && T < o.pa)) {
		o.state = "planned"
		o.proj = o.P
		o.pend = o.pe
		o.est = (t) => o.P * C.f(ramp(t, o.pa, o.pe))
	} else {
		o.state = "active"
		if (o.timing === "fixed") {
			const span = Math.max(0.05, o.pe - o.sa)
			const u = clamp((T - o.sa) / span, 0.02, 1)
			const exp = o.P * C.f(u)
			o.expected = exp
			const r = exp ? o.N / exp : 1
			o.proj = u >= 1 ? o.N : o.P * clamp(r, o.P ? o.N / o.P : 0, 3)
			o.pend = o.pe
			const pr = o.proj
			const sa = o.sa
			const pe = o.pe
			o.est = (t) => pr * C.f(ramp(t, sa, pe))
		} else {
			o.proj = o.P
			const v = o.P ? o.N / o.P : 1
			if (v >= 1) o.pend = T
			else {
				const uEff = Math.max(0.01, C.inv(clamp(v, 0.001, 1)))
				o.pend = o.sa + Math.min((T - o.sa) / uEff, Math.max(o.D, 0.05) * 4)
			}
			o.expected = o.P * C.f(clamp((T - o.sa) / Math.max(o.D, 0.05), 0, 1))
			const P = o.P
			const sa = o.sa
			const pend = o.pend
			o.est = (t) => P * C.f(ramp(t, sa, pend))
		}
	}
	o.dImp = o.proj - o.P
	o.dT = o.pend - o.pe
	// For effort, the bad deviation is spending more than planned.
	const short = k.kind === "effort" ? o.dImp * o.sg > Math.abs(o.P) * 0.01 : o.dImp * o.sg < -Math.abs(o.P) * 0.01
	const late = o.dT > 0.1
	if (o.state === "done") o.st = short ? "miss" : o.timing === "fixed" && late ? "late" : "met"
	else if (o.state === "planned") o.st = "up"
	else o.st = (o.timing === "fixed" && short) || o.pend > goalBy + 0.01 ? "bad" : late ? "delayed" : "ok"
	o.color = STATE[o.st].c
	o.status = k.kind === "effort" ? EFFORT_LABEL[o.st] : STATE[o.st].l
	return o
}

export function model(D: Dataset, time: Time, k: Kpi): Model {
	const T = time.today
	const gBy = k.goal?.by ? time.idx(k.goal.by, true) : Infinity
	const list = D.initiatives.map((it) => item(D, time, it, k, gBy)).filter((o): o is Item => o !== null)
	const big = (a: number, b: number) => (Math.abs(a) >= Math.abs(b) ? a : b)
	let b = k.base
	let pt = k.base
	let hi = k.base
	let lo = k.base
	list.forEach((o) => {
		o.base = b
		const h = o.state === "done" ? o.N : big(o.P, o.proj)
		b += h
		pt += o.proj
		hi = Math.max(hi, o.base + o.P, o.base + o.proj, o.base + h)
		lo = Math.min(lo, o.base + o.P, o.base + o.proj)
	})
	const planAt = (t: number) => k.base + list.reduce((s, o) => s + o.P * CURVE[o.growth].f(ramp(t, o.pa, o.pe)), 0)
	const estAt = (t: number) => k.base + list.reduce((s, o) => s + o.est(t), 0)
	const projAt = (t: number, m = 1) => {
		const a = estAt(T)
		return a + (estAt(t) - a) * m
	}
	return {
		list,
		T,
		planAt,
		actAt: estAt,
		projAt,
		planTotal: k.base + list.reduce((s, o) => s + o.P, 0),
		projTotal: pt,
		hi,
		lo,
		// Positive gap = good: above goal for outcomes, below budget for effort.
		dir: (k.direction === "down") !== (k.kind === "effort") ? -1 : 1,
	}
}

/** Whole months covering every initiative, goal date, and today. */
export function span(D: Dataset, time: Time): { t0: number; t1: number } {
	let a = Infinity
	let b = -Infinity
	for (const k of D.kpis) {
		for (const o of model(D, time, k).list) {
			a = Math.min(a, o.pa, o.sa)
			b = Math.max(b, o.pe, o.pend)
		}
		if (k.goal?.by) b = Math.max(b, time.idx(k.goal.by, true))
	}
	a = Math.min(a, time.today - 1)
	b = Math.max(b, time.today + 1)
	return { t0: Math.floor(a), t1: Math.ceil(b) }
}

export type Goal = {
	by: number
	mode: GoalMode
	value: number
	plan: number
	proj: number
	custom?: number
	/** Projected minus goal, signed so that positive is good. */
	gap: number
}

export function goalOf(D: Dataset, time: Time, k: Kpi, M: Model): Goal {
	const g = k.goal || {}
	const by = g.by ? time.idx(g.by, true) : span(D, time).t1
	const plan = M.planAt(by)
	const proj = M.projAt(by)
	const mode: GoalMode = g.mode === "custom" ? "custom" : "plan"
	const value = mode === "custom" ? (g.value ?? plan) : plan
	return { by, mode, value, plan, proj, custom: g.value, gap: (proj - value) * M.dir }
}
