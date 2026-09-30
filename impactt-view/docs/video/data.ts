/**
 * Runs the block's own model on the explainer's enterprise scenario and
 * writes the numbers the video animates (bars, curves, goal) to data.js, so
 * every value in the video is what the chart would compute.
 *
 *   npx tsx docs/video/data.ts
 */
import { writeFileSync } from "node:fs"
import { createTime, fmtMo, goalOf, model, MONTH, niceMax, span, type Dataset } from "../../blocks/impactt-view/src/model.ts"

/** A B2B product moving upmarket: six initiatives against an enterprise ARR goal. */
const D: Dataset = {
	start: "2026-01",
	today: "2026-09-30",
	timing: "flexible",
	kpis: [
		{
			id: "arr",
			label: "Enterprise ARR",
			fmt: "usd",
			base: 0,
			spread: 0.3,
			goal: { mode: "custom", value: 12_000_000, by: "2027-06" },
		},
	],
	initiatives: [
		{ id: "sso", name: "SSO & SCIM", plan: ["2026-01", "2026-03"], done: "2026-03", impact: { arr: { plan: 1_000_000, now: 1_000_000 } } },
		{ id: "soc2", name: "SOC 2 Type II", plan: ["2026-03", "2026-06"], done: "2026-07", impact: { arr: { plan: 1_500_000, now: 1_300_000 } } },
		{ id: "crm", name: "CRM integration", plan: ["2026-06", "2026-09"], start: "2026-07-01", impact: { arr: { plan: 2_000_000, now: 900_000 } } },
		{ id: "eu", name: "EU data residency", plan: ["2026-08", "2026-12"], timing: "fixed", impact: { arr: { plan: 2_500_000, now: 400_000 } } },
		{ id: "partner", name: "Partner channel", plan: ["2026-11", "2027-03"], impact: { arr: { plan: 2_500_000 } } },
		{ id: "ai", name: "AI add-on", plan: ["2027-02", "2027-06"], impact: { arr: { plan: 3_000_000 } } },
	],
}

const time = createTime(D.start, D.today)
const k = D.kpis[0]
const M = model(D, time, k)
const G = goalOf(D, time, k, M)
const S = span(D, time)
const sp = k.spread ?? 0.3
// The same value axis the block draws.
const yMax = niceMax(Math.max(M.hi, M.planTotal, k.base, M.projAt(S.t1, 1 + sp), G.value))

// The block writes a million as "$1,000k"; the video shortens it to "$1M".
const short = (n: number) => String(Math.round(n * 10) / 10)
const money = (v: number) => {
	const a = Math.abs(v)
	return (v < 0 ? "−" : "") + "$" + (a >= 1e6 ? short(a / 1e6) + "M" : a >= 1e3 ? short(a / 1e3) + "k" : short(a))
}

const round = (v: number, d = 3) => Math.round(v * 10 ** d) / 10 ** d
const sample = (a: number, b: number, f: (t: number) => number) => {
	const out: [number, number][] = []
	const n = Math.max(2, Math.round((b - a) * 30))
	for (let s = 0; s <= n; s++) {
		const t = a + ((b - a) * s) / n
		out.push([round(t), Math.round(f(t))])
	}
	return out
}

const window = (a: number, b: number) => {
	const d1 = time.toDate(a)
	const d2 = time.toDate(b - 0.01)
	const m = (d: Date) => MONTH[d.getMonth()].slice(0, 3)
	return `${m(d1)}${d1.getFullYear() === d2.getFullYear() ? "" : " " + d1.getFullYear()} – ${m(d2)} ${d2.getFullYear()}`
}
const goalDate = time.toDate(G.by - 0.01)

let planBase = k.base
const bars = M.list.map((o) => {
	const end = o.state === "done" ? o.ea : Math.min(M.T, o.pend)
	const bar = {
		id: o.id,
		name: o.it.name,
		state: o.state,
		st: o.st,
		timing: o.timing,
		pa: round(o.pa),
		pe: round(o.pe),
		sa: round(o.sa),
		/** Where the solid fill ends: the finish, or today. */
		end: round(end),
		pend: round(o.pend),
		P: o.P,
		N: o.N,
		proj: Math.round(o.proj),
		/** Stack offset as drawn, and as it was planned. */
		base: Math.round(o.base),
		planBase,
		impact: "+" + money(o.P),
		planned: money(o.P),
		achieved: money(o.N),
		/** The planned window in words, e.g. "Feb – Jun 2027". */
		window: window(o.pa, o.pe),
		/** What the initiative had delivered at each moment up to `end`. */
		fill: o.state === "planned" ? [] : sample(o.sa, end, o.est),
		dev: o.state === "planned" ? "upcoming" : o.timing === "fixed" || o.state === "done" ? `${money(o.dImp)} vs plan` : fmtMo(o.dT),
	}
	planBase += o.P
	return bar
})

const quarters = time.ticks("quarters", S.t0, S.t1).map((c, i) => {
	const q = "Q" + (Math.floor(c.d.getMonth() / 3) + 1)
	return { a: round(c.a), b: round(c.b), label: i === 0 || c.d.getMonth() === 0 ? `${q} ${c.d.getFullYear()}` : q }
})

const gap = Math.abs(G.proj - G.value)
const out = {
	kpi: k.label,
	/** Month 0 of the time axis, as [year, month index]. */
	start: D.start.split("-").map((n, i) => Number(n) - i),
	today: round(M.T),
	t0: S.t0,
	t1: S.t1,
	yMax,
	yTicks: [0, 1, 2, 3, 4, 5].map((i) => ({ v: (yMax * i) / 5, label: money((yMax * i) / 5) })),
	quarters,
	bars,
	now: { actual: Math.round(M.actAt(M.T)), label: money(M.actAt(M.T)) },
	plan: { total: M.planTotal, label: `Plan ${money(M.planTotal)}` },
	goal: {
		value: G.value,
		by: round(G.by),
		proj: Math.round(G.proj),
		label: `Goal ${money(G.value)} by ${time.monthYear(G.by - 0.01)}`,
		headline: money(G.value),
		byLong: `${MONTH[goalDate.getMonth()]} ${goalDate.getFullYear()}`,
		projLabel: money(G.proj),
		/** Share of the goal reached today, in percent. */
		reached: Math.round((M.actAt(M.T) / G.value) * 100),
		gapLabel: `Projected ${money(G.proj)} · ${money(gap)} ${G.gap < 0 ? "short" : "ahead"}`,
		gap: `${money(gap)} ${G.gap < 0 ? "short" : "ahead"}`,
		monthsLeft: Math.round(G.by - M.T),
	},
	curves: {
		plan: sample(S.t0, S.t1, M.planAt),
		actual: sample(S.t0, M.T, M.actAt),
		proj: sample(M.T, G.by, (t) => M.projAt(t)),
		projHi: sample(M.T, G.by, (t) => M.projAt(t, 1 + sp)),
		projLo: sample(M.T, G.by, (t) => M.projAt(t, 1 - sp)),
	},
}

writeFileSync(
	new URL("./data.js", import.meta.url),
	"// Generated by data.ts from the block's model. Do not edit.\nwindow.IMPACTT_FILM = " + JSON.stringify(out) + "\n"
)
console.log(`today ${out.today} · actual ${out.now.label} · ${out.plan.label} · ${out.goal.label} · ${out.goal.gapLabel} · ${out.goal.monthsLeft} months left · y max ${money(yMax)}`)
for (const b of bars) console.log(`${b.name.padEnd(20)} ${b.state.padEnd(8)} ${b.st.padEnd(8)} ${b.impact.padEnd(7)} now ${money(b.N).padEnd(6)} proj ${money(b.proj).padEnd(6)} base ${money(b.base).padEnd(6)} ${b.pa}–${b.pe} → ${b.pend}  ${b.dev}`)
