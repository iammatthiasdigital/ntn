import { test } from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { buildDataset, parseDirection, parseGrowth, parseTiming, parseUnit, type SourceSnapshot, type Sources } from "../blocks/impactt-view/src/dataset.ts"
import { createTime, fmt, fmtD, goalOf, model, span } from "../blocks/impactt-view/src/model.ts"

type Seed = { schema: Record<string, { name: string; type: string }>; rows: ({ id: string } & Record<string, unknown>)[] }

function snap(file: string): SourceSnapshot {
	const seed = JSON.parse(readFileSync(new URL(`../data/${file}`, import.meta.url), "utf8")) as Seed
	const ids: Record<string, string> = {}
	for (const k of Object.keys(seed.schema)) ids[k] = k
	return {
		bound: true,
		truncated: false,
		propertySchemasById: seed.schema,
		propertyIdsByKey: ids,
		items: seed.rows.map(({ id, ...v }) => ({ id, propertiesById: v, propertiesByKey: v })),
	}
}

const sources: Sources = {
	initiatives: snap("worker_initiatives.json"),
	kpis: snap("worker_kpis.json"),
	impacts: snap("worker_impacts.json"),
}
const opts = { today: "2026-09-27", timing: "flexible" as const, goalModes: {} }

test("tolerant parsing of select wording", () => {
	assert.equal(parseTiming("Impact changes"), "fixed")
	assert.equal(parseTiming("timeline MOVES"), "flexible")
	assert.equal(parseTiming(""), undefined)
	assert.equal(parseGrowth("Exponential"), "exp")
	assert.equal(parseUnit("Percent"), "pp")
	assert.equal(parseUnit("EUR"), "eur")
	assert.equal(parseUnit("USD"), "usd")
	assert.equal(parseUnit("Number"), "count")
	assert.equal(parseDirection("Decrease"), "down")
	assert.equal(parseDirection(undefined), "up")
})

test("the seed databases rebuild the Impactt sample", () => {
	const { dataset: D, skipped } = buildDataset(sources, opts)
	assert.equal(D.initiatives.length, 9)
	assert.equal(D.kpis.length, 4)
	assert.deepEqual(skipped, { noPlan: [], impacts: 0 })
	assert.equal(D.start, "2026-03")
	const android = D.initiatives.find((i) => i.name === "Android app")!
	assert.deepEqual(android.plan, ["2026-09-01", "2026-11-30"])
	assert.equal(android.timing, "fixed")
	assert.deepEqual(android.impact["kpi-wau"], { plan: 5000, now: 1100 })
	assert.deepEqual(android.impact["kpi-churn"], { plan: -1, now: -0.2 })
	const mrr = D.kpis.find((k) => k.label === "MRR")!
	assert.equal(mrr.goal?.mode, "plan")
	assert.equal(mrr.fmt, "eur")
	const churn = D.kpis.find((k) => k.label === "Monthly churn")!
	assert.equal(churn.direction, "down")
	assert.equal(churn.goal?.mode, "custom")
})

test("model numbers match the standalone chart", () => {
	const { dataset: D } = buildDataset(sources, opts)
	const time = createTime(D.start, D.today)
	const wau = D.kpis.find((k) => k.label === "Weekly active users")!
	const M = model(D, time, wau)
	const G = goalOf(D, time, wau, M)
	assert.equal(M.list.length, 6)
	assert.equal(fmt(M.actAt(M.T), "count"), "4.9k")
	assert.equal(fmt(G.value, "count"), "30k")
	assert.equal(fmt(G.proj, "count"), "28.1k")
	const st = Object.fromEntries(M.list.map((o) => [o.it.name, o.st]))
	assert.deepEqual(st, {
		"Private beta": "miss",
		"Public launch": "late",
		"Referral programme": "delayed",
		"Android app": "bad",
		"University partnerships": "up",
		"Second city": "up",
	})
	const S = span(D, time)
	assert.ok(S.t0 <= 2 && S.t1 >= 16)
})

test("filtered datasets restack; unmatched impacts and planless rows are counted", () => {
	const { dataset: D } = buildDataset(sources, opts)
	const onlyGrowth = { ...D, initiatives: D.initiatives.filter((i) => ["Public launch", "Referral programme", "Second city"].includes(i.name)) }
	const time = createTime(onlyGrowth.start, onlyGrowth.today)
	const wau = D.kpis[0]
	const M = model(onlyGrowth, time, wau)
	assert.equal(M.list[0].base, 0)
	assert.equal(M.list[1].base, 2600)
	assert.equal(fmtD(M.planTotal, "count"), "+17.5k")

	const broken: Sources = {
		...sources,
		initiatives: {
			...sources.initiatives,
			items: sources.initiatives.items.map((r) =>
				r.id === "init-city" ? { ...r, propertiesByKey: { ...r.propertiesByKey, plan: undefined } } : r
			),
		},
		impacts: {
			...sources.impacts,
			items: [...sources.impacts.items, { id: "x", propertiesById: {}, propertiesByKey: { planned: 5, initiative: [{ id: "nope", table: "block" }], kpi: [{ id: "kpi-wau", table: "block" }] } }],
		},
	}
	const b = buildDataset(broken, opts)
	assert.deepEqual(b.skipped.noPlan, ["Second city"])
	// The planless initiative's own impacts aren't double-counted; the dangling one is.
	assert.equal(b.skipped.impacts, 1)
})

test("impact links also resolve by title when the host sends text", () => {
	const textual: Sources = {
		...sources,
		impacts: {
			...sources.impacts,
			items: [(() => {
				const v = { initiative: "Premium tier", kpi: "mrr", planned: 100, achieved: 10 }
				return { id: "i1", propertiesById: v, propertiesByKey: v }
			})()],
		},
	}
	const { dataset } = buildDataset(textual, opts)
	assert.deepEqual(dataset.initiatives.find((i) => i.name === "Premium tier")!.impact, { "kpi-mrr": { plan: 100, now: 10 } })
})

test("KPIs come from the chosen Impacts column: relation, select or multi-select", () => {
	const auto = buildDataset(sources, opts)
	assert.equal(auto.kpiColumn, "kpi")
	assert.deepEqual(auto.dataset.kpis.map((k) => k.label), ["Weekly active users", "MRR", "Week-4 retention", "Monthly churn"])

	// Select column: KPI ids are option names; details still come from KPI rows with the same title.
	const bySelect = buildDataset(sources, { ...opts, kpiColumn: "kpiTag" })
	assert.equal(bySelect.kpiColumn, "kpiTag")
	const churn = bySelect.dataset.kpis.find((k) => k.label === "Monthly churn")!
	assert.equal(churn.id, "opt:monthly churn")
	assert.equal(churn.rowId, "kpi-churn")
	assert.equal(churn.direction, "down")
	assert.equal(fmt(churn.base, churn.fmt), "12%")
	assert.deepEqual(bySelect.dataset.initiatives.find((i) => i.name === "Android app")!.impact["opt:weekly active users"], { plan: 5000, now: 1100 })

	// Multi-select without a KPIs database: one impact row feeds several KPIs; defaults fill the rest.
	const multi: Sources = {
		initiatives: sources.initiatives,
		kpis: { ...sources.kpis, bound: false, items: [] },
		impacts: {
			bound: true,
			truncated: false,
			propertyIdsByKey: { initiative: "ini", planned: "pl", achieved: "ac" },
			propertySchemasById: { ini: { name: "Initiative", type: "relation" }, tags: { name: "Metrics", type: "multi_select" }, pl: { name: "Planned", type: "number" }, ac: { name: "Achieved", type: "number" } },
			items: [
				{ id: "m1", propertiesById: { tags: ["Signups", "Cost (€)"] }, propertiesByKey: { initiative: [{ id: "init-beta", table: "block" }], planned: -50, achieved: -20 } },
			],
		},
	}
	const m = buildDataset(multi, opts)
	assert.equal(m.kpiColumn, "tags")
	assert.deepEqual(m.dataset.kpis.map((k) => [k.label, k.fmt, k.direction, k.rowId]), [
		["Signups", "count", "down", undefined],
		["Cost (€)", "eur", "down", undefined],
	])
	assert.deepEqual(m.dataset.initiatives[0].impact, { "opt:signups": { plan: -50, now: -20 }, "opt:cost (€)": { plan: -50, now: -20 } })
})

test("average mode: equal shares of a 100% goal, achieved by mean reach across KPIs", async () => {
	const { averageDataset, AVG_KPI_ID } = await import("../blocks/impactt-view/src/dataset.ts")
	const { dataset: D } = buildDataset(sources, opts)
	const A = averageDataset(D)
	assert.equal(A.kpis.length, 1)
	assert.equal(A.kpis[0].goal?.value, 100)
	const android = A.initiatives.find((i) => i.name === "Android app")!.impact[AVG_KPI_ID]!
	// 9 initiatives → 11.1% each; Android reached 1100/5000, 0.5/3, 0.2/1 → mean ≈ 0.184.
	assert.equal(Math.round(android.plan * 10) / 10, 11.1)
	assert.equal(Math.round(android.now! * 100) / 100, Math.round((100 / 9) * ((0.22 + 1 / 6 + 0.2) / 3) * 100) / 100)
	const time = createTime(A.start, A.today)
	const M = model(A, time, A.kpis[0])
	assert.equal(Math.round(M.planTotal), 100)
	assert.equal(goalOf(A, time, A.kpis[0], M).by > 0, true)
})
