import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import { AUTO_UNIT, ImpactChart, RANGES, type ChartUI, type RangeKey } from "./chart"
import { averageDataset, AVG_KPI_ID, buildDataset, kpiColumnCandidates } from "./dataset"
import { applyFilters, buildProperties, dayIso, EMPTY_FILTERS, hasActiveFilters, newRule, type FilterState } from "./filters/core"
import { FilterBar } from "./filters/FilterBar"
import { PropertyMenu } from "./filters/editors"
import { Chevron, FilterIcon } from "./filters/icons"
import { SettingsPanel, SlidersIcon, type SettingsPage } from "./SettingsPanel"
import { Popover, useAnchor } from "./filters/popover"
import { createTime, fmtD, fmtMo, goalOf, model, span, type GoalMode, type Growth, type Timing, type TimeUnit } from "./model"
import type { ImpacttData, Writer } from "./sources"

type ViewState = ChartUI & {
	kpiId: string | null
	table: boolean
	timing: Timing
	goalModes: Record<string, GoalMode>
	/** Impacts column the KPIs come from; null = automatic. */
	kpiColumn: string | null
	filterBar: boolean
	filters: FilterState
}

const DEFAULT_VIEW: ViewState = {
	unit: "months",
	range: "all",
	scrollT: null,
	compare: false,
	lines: { plan: true, actual: true, proj: true, band: true, goal: true },
	kpiId: null,
	table: true,
	timing: "flexible",
	goalModes: {},
	kpiColumn: null,
	filterBar: true,
	filters: EMPTY_FILTERS,
}

function loadView(key: string): ViewState {
	try {
		const raw = window.localStorage.getItem(key)
		if (raw) {
			const v = JSON.parse(raw) as Partial<ViewState>
			return { ...DEFAULT_VIEW, ...v, lines: { ...DEFAULT_VIEW.lines, ...v.lines }, filters: { ...EMPTY_FILTERS, ...v.filters } }
		}
	} catch {
		// Storage can be unavailable in the sandbox; fall back to defaults.
	}
	return DEFAULT_VIEW
}

function usePersistentView(key: string): [ViewState, (f: (v: ViewState) => ViewState) => void] {
	const [view, setView] = useState(() => loadView(key))
	const timer = useRef<number | undefined>(undefined)
	useEffect(() => {
		window.clearTimeout(timer.current)
		timer.current = window.setTimeout(() => {
			try {
				window.localStorage.setItem(key, JSON.stringify(view))
			} catch {
				// Best effort only.
			}
		}, 250)
	}, [key, view])
	return [view, setView]
}

export function ImpacttView({ data, theme }: { data: ImpacttData; theme: "light" | "dark" }) {
	return (
		<div className="impactt" data-theme={theme}>
			{data.status === "loading" ? (
				<div className="state">
					<span className="spinner" aria-hidden="true" />
					Loading initiatives…
				</div>
			) : data.status === "unbound" ? (
				<Setup missing={data.missing} />
			) : (
				<Ready data={data} />
			)}
		</div>
	)
}

function Setup({ missing }: { missing: string[] }) {
	return (
		<div className="setup">
			<b>Connect your databases to draw the Impactt chart.</b>
			<p>
				Open this block's data settings and connect{" "}
				{missing.length ? missing.map((m, i) => <span key={m}>{i ? ", " : ""}<code>{m}</code></span>) : "the data sources"}:
			</p>
			<ul>
				<li>
					<b>Initiatives</b> — Name, Plan (date range), Started, Done, If off plan, Growth, Note. Any other property becomes filterable.
				</li>
				<li>
					<b>KPIs</b> — Name, Unit, Baseline, Direction, Goal, Goal by, Range ±.
				</li>
				<li>
					<b>Impacts</b> — one row per initiative and KPI: Initiative and KPI relations, Planned and Achieved numbers.
				</li>
			</ul>
		</div>
	)
}

type Ready = Extract<ImpacttData, { status: "ready" }>

function Ready({ data }: { data: Ready }) {
	const [view, setView] = usePersistentView(data.storageKey)
	const today = useMemo(() => dayIso(new Date()), [])
	const [msg, setMsg] = useState<string | null>(null)
	const [openRuleId, setOpenRuleId] = useState<string | null>(null)
	const [openAdvanced, setOpenAdvanced] = useState(false)

	const built = useMemo(
		() =>
			buildDataset(data.sources, {
				today,
				timing: view.timing,
				goalModes: view.goalModes,
				kpiColumn: view.kpiColumn,
				pageTitle: data.resolvers.pageTitle,
			}),
		[data.sources, today, view.timing, view.goalModes, view.kpiColumn, data.resolvers.pageTitle]
	)
	const properties = useMemo(
		() => buildProperties(data.sources.initiatives.propertySchemasById, built.rows, data.resolvers),
		[data.sources.initiatives.propertySchemasById, built.rows, data.resolvers]
	)
	const visible = useMemo(() => {
		const rows = applyFilters(view.filters, properties, built.rows, { today, meId: data.resolvers.meId })
		return new Set(rows.map((r) => r.id))
	}, [view.filters, properties, built.rows, today, data.resolvers.meId])
	const filtering = hasActiveFilters(view.filters, properties)

	const Dall = useMemo(() => ({ ...built.dataset, initiatives: built.dataset.initiatives.filter((i) => visible.has(i.id)) }), [built.dataset, visible])
	// Average mode: several KPIs folded into one "% of goal reached" scale.
	const avgOn = view.kpiId === AVG_KPI_ID && Dall.kpis.length > 1
	const D = useMemo(() => (avgOn ? averageDataset(Dall) : Dall), [avgOn, Dall])
	const time = useMemo(() => createTime(D.start, D.today), [D.start, D.today])
	const k = D.kpis.find((x) => x.id === view.kpiId) ?? D.kpis[0]
	const calc = useMemo(() => {
		if (!k) return null
		const M = model(D, time, k)
		return { M, G: goalOf(D, time, k, M), S: span(D, time) }
	}, [D, time, k])

	const writer = data.writer
	const save = useCallback(
		async (p: Promise<string | null> | undefined) => {
			if (!p) return
			const err = await p
			setMsg(err ? `Couldn't save: ${err}` : null)
		},
		[setMsg]
	)

	/* ---- chart ---- */
	const boardRef = useRef<HTMLElement>(null)
	const wrapRef = useRef<HTMLDivElement>(null)
	const scrollerRef = useRef<HTMLDivElement>(null)
	const stageRef = useRef<SVGSVGElement>(null)
	const overRef = useRef<SVGSVGElement>(null)
	const tipRef = useRef<HTMLDivElement>(null)
	const monthRef = useRef<HTMLSpanElement>(null)
	const rowsRef = useRef<HTMLTableSectionElement>(null)
	const chartRef = useRef<ImpactChart | null>(null)
	const scrollTRef = useRef(view.scrollT)
	const scrollTimer = useRef<number | undefined>(undefined)
	const hasKpi = !!k
	useLayoutEffect(() => {
		if (!hasKpi) return
		const chart = new ImpactChart(
			{
				board: boardRef.current!,
				wrap: wrapRef.current!,
				scroller: scrollerRef.current!,
				stage: stageRef.current!,
				over: overRef.current!,
				tip: tipRef.current!,
				curmonth: monthRef.current!,
			},
			{
				onActive: (id) => rowsRef.current?.querySelectorAll<HTMLTableRowElement>("tr[data-id]").forEach((tr) => tr.classList.toggle("on", tr.dataset.id === id)),
				onScroll: (t) => {
					scrollTRef.current = t
					window.clearTimeout(scrollTimer.current)
					scrollTimer.current = window.setTimeout(() => setView((v) => (v.scrollT === t ? v : { ...v, scrollT: t })), 300)
				},
			}
		)
		chartRef.current = chart
		return () => {
			chart.destroy()
			chartRef.current = null
		}
	}, [hasKpi, setView])

	const chartUi = useMemo<ChartUI>(
		() => ({ unit: view.unit, range: view.range, scrollT: null, compare: view.compare, lines: view.lines }),
		[view.unit, view.range, view.compare, view.lines]
	)
	const draw = useCallback(() => {
		if (!chartRef.current || !calc || !k) return
		chartRef.current.render({ D, time, k, ...calc, ui: { ...chartUi, scrollT: scrollTRef.current } })
	}, [D, time, k, calc, chartUi])
	useLayoutEffect(() => {
		draw()
	}, [draw, view.table])
	/** Forget the scroll position (Today, range changes): the chart re-centres on today. */
	const resetScroll = () => {
		window.clearTimeout(scrollTimer.current)
		scrollTRef.current = null
		setView((v) => ({ ...v, scrollT: null }))
	}
	useEffect(() => {
		const wrap = wrapRef.current
		if (!wrap) return
		let w = wrap.clientWidth
		let t: number | undefined
		const ro = new ResizeObserver(() => {
			if (wrap.clientWidth === w) return
			w = wrap.clientWidth
			window.clearTimeout(t)
			t = window.setTimeout(draw, 120)
		})
		ro.observe(wrap)
		return () => {
			ro.disconnect()
			window.clearTimeout(t)
		}
	}, [draw])

	/* ---- toolbar: KPI title, settings ---- */
	const kpiBtn = useAnchor()
	const setBtn = useAnchor()
	const [settings, setSettings] = useState<{ page: SettingsPage; anchor: HTMLElement | null } | null>(null)
	const openSettings = (page: SettingsPage, anchor: HTMLElement | null) => setSettings({ page, anchor })

	/* ---- toolbar: filter button ---- */
	const fbtn = useAnchor()
	const onFilterButton = () => {
		const any = view.filters.rules.length > 0 || !!view.filters.advanced
		if (!any) fbtn.toggle()
		else setView((v) => ({ ...v, filterBar: !v.filterBar }))
	}
	const onOpened = useCallback(() => setOpenRuleId(null), [])
	const onAdvancedOpened = useCallback(() => setOpenAdvanced(false), [])

	const anyFilter = view.filters.rules.length > 0 || !!view.filters.advanced
	const hidden = built.dataset.initiatives.length - Dall.initiatives.length
	const setUi = (f: Partial<ViewState>) => setView((v) => ({ ...v, ...f }))

	return (
		<>
			<div className="toolbar">
				<button type="button" ref={kpiBtn.ref} className="kpititle" onClick={() => openSettings("kpi", kpiBtn.el)} aria-haspopup="dialog" title="Choose KPI">
					<span>{k?.label ?? "No KPI"}</span>
					<Chevron />
				</button>
				<span className="spacer" />
				<div className="tools">
					<button
						type="button"
						ref={fbtn.ref}
						className={"tool" + (filtering ? " blue" : "")}
						onClick={onFilterButton}
						aria-label="Filter"
						aria-pressed={anyFilter && view.filterBar}
						title="Filter"
					>
						<FilterIcon />
					</button>
					{fbtn.open ? (
						<Popover anchor={fbtn.el} onClose={fbtn.close} width={260}>
							<PropertyMenu
								properties={properties}
								onPick={(p) => {
									const r = newRule(p)
									setView((v) => ({ ...v, filterBar: true, filters: { ...v.filters, rules: [...v.filters.rules, r] } }))
									setOpenRuleId(r.id)
									fbtn.close()
								}}
							/>
						</Popover>
					) : null}
					<button
						type="button"
						ref={setBtn.ref}
						className="tool"
						aria-label="Chart settings"
						aria-pressed={!!settings}
						title="Chart settings"
						onClick={() => (settings ? setSettings(null) : openSettings("root", setBtn.el))}
					>
						<SlidersIcon />
					</button>
					{settings && k && calc ? (
						<SettingsPanel
							key={settings.page + (settings.anchor === kpiBtn.el ? "k" : "s")}
							anchor={settings.anchor}
							initialPage={settings.page}
							onClose={() => setSettings(null)}
							view={view}
							setUi={setUi}
							kpis={Dall.kpis}
							k={k}
							G={calc.G}
							monthYear={time.monthYear}
							writer={writer}
							save={save}
							kpiBound={data.sources.kpis.propertyIdsByKey}
							onKpiChange={() => chartRef.current?.setPin(null)}
							columns={kpiColumnCandidates(data.sources)}
							kpiColumn={built.kpiColumn}
						/>
					) : null}
				</div>
			</div>

			{anyFilter && view.filterBar ? (
				<FilterBar
					properties={properties}
					state={view.filters}
					today={today}
					onChange={(filters) => setView((v) => ({ ...v, filters }))}
					openRuleId={openRuleId}
					onOpened={onOpened}
					openAdvanced={openAdvanced}
					onAdvancedOpened={onAdvancedOpened}
				/>
			) : null}

			{!k ? (
				<div className="state">
					{built.kpiColumn
						? "No impact rows name a KPI yet. Fill in the KPI column in the Impacts database."
						: "The Impacts database needs a KPI column (a relation, select or multi-select). Choose it in the chart settings."}
				</div>
			) : (
				<>
					<section className="board" aria-label="Impactt chart" ref={boardRef}>
						<div className="tlbar">
							<span className="curmonth" ref={monthRef} />
							<span className="spacer" />
							<select
								className="dd"
								aria-label="Visible time range"
								value={view.range}
								onChange={(e) => {
									const range = e.target.value as RangeKey
									resetScroll()
									setView((v) => ({ ...v, range, unit: AUTO_UNIT[range] }))
								}}
							>
								<option value="1M">1 month</option>
								<option value="3M">3 months</option>
								<option value="6M">6 months</option>
								<option value="1Y">1 year</option>
								<option value="2Y">2 years</option>
								<option value="all">Everything</option>
							</select>
							<select className="dd" aria-label="Time scale" value={view.unit} onChange={(e) => setUi({ unit: e.target.value as TimeUnit })}>
								<option value="days">Days</option>
								<option value="weeks">Weeks</option>
								<option value="months">Months</option>
								<option value="quarters">Quarters</option>
								<option value="years">Years</option>
							</select>
							<button type="button" className="ghost ic big" aria-label="Earlier" disabled={!RANGES[view.range]} onClick={() => chartRef.current?.scrollBy(-1)}>
								‹
							</button>
							<button type="button" className="ghost today" disabled={!RANGES[view.range]} onClick={() => {
									resetScroll()
									draw()
								}}>
								Today
							</button>
							<button type="button" className="ghost ic big" aria-label="Later" disabled={!RANGES[view.range]} onClick={() => chartRef.current?.scrollBy(1)}>
								›
							</button>
						</div>
						<div className="chartwrap" ref={wrapRef}>
							<div className="scroller" ref={scrollerRef}>
								<svg ref={stageRef} className="stage" role="img" aria-label="Initiatives as stacked Gantt bars sized by KPI impact, with plan, actual and projected totals and a goal line" />
							</div>
							<svg ref={overRef} className="over" aria-hidden="true" />
						</div>
						{view.table ? (
							<Table D={D} time={time} k={k} calc={calc!} writer={writer} save={save} rowsRef={rowsRef} chart={chartRef} timingBound={data.sources.initiatives.propertyIdsByKey} filtering={filtering} />
						) : null}
						<div className="tip" ref={tipRef} />
					</section>
				</>
			)}

			<Footnotes
				shown={D.initiatives.length}
				total={built.dataset.initiatives.length}
				hidden={hidden}
				filtering={filtering}
				noPlan={built.skipped.noPlan}
				impacts={built.skipped.impacts}
				truncated={data.sources.initiatives.truncated || data.sources.impacts.truncated}
				impactsBound={data.sources.impacts.bound}
				msg={msg}
				onClear={() => setView((v) => ({ ...v, filters: EMPTY_FILTERS }))}
			/>
		</>
	)
}

type Calc = { M: ReturnType<typeof model>; G: ReturnType<typeof goalOf>; S: ReturnType<typeof span> }
type Ctx = { D: ReturnType<typeof buildDataset>["dataset"]; time: ReturnType<typeof createTime>; k: NonNullable<ReturnType<typeof buildDataset>["dataset"]["kpis"][number]>; calc: Calc }

function Table({
	D,
	time,
	k,
	calc,
	writer,
	save,
	rowsRef,
	chart,
	timingBound,
	filtering,
}: Ctx & {
	filtering: boolean
	writer: Writer | null
	save: (p: Promise<string | null> | undefined) => void
	rowsRef: React.RefObject<HTMLTableSectionElement | null>
	chart: React.RefObject<ImpactChart | null>
	timingBound: Record<string, string | undefined>
}) {
	const { M } = calc
	const f = k.fmt
	const defLab = D.timing === "fixed" ? "impact changes" : "timeline moves"
	const canTiming = !!writer && timingBound.timing !== undefined
	const canGrowth = !!writer && timingBound.growth !== undefined
	const dT = M.projTotal - M.planTotal
	const now = M.actAt(M.T) - k.base
	return (
		<div className="tablewrap">
			<table>
				<thead>
					<tr>
						<th>Initiative</th>
						<th>Plan</th>
						<th>Status</th>
						<th>If off plan</th>
						<th>Growth</th>
						<th className="n">Planned</th>
						<th className="n">Achieved</th>
						<th className="n">Projected</th>
						<th className="n">Deviation</th>
					</tr>
				</thead>
				<tbody ref={rowsRef}>
					{M.list.map((o) => {
						let dev = "–"
						let cls = ""
						if (o.state !== "planned") {
							const parts: string[] = []
							if (o.state === "done" || o.timing === "fixed") parts.push(fmtD(o.dImp, f))
							if (o.state === "done" ? Math.abs(o.dT) > 0.1 : o.timing !== "fixed") parts.push(fmtMo(o.dT))
							dev = parts.join(" · ") || "on plan"
							cls = ["miss", "late", "bad"].includes(o.st) ? "neg" : ""
						}
						return (
							<tr
								key={o.id}
								data-id={o.id}
								tabIndex={0}
								onMouseEnter={() => chart.current && !chart.current.pinned && chart.current.setHov(o.id)}
								onMouseLeave={() => chart.current && !chart.current.pinned && chart.current.setHov(null)}
								onClick={() => chart.current?.setPin(chart.current.pinned === o.id ? null : o.id)}
								onKeyDown={(e) => e.key === "Enter" && chart.current?.setPin(chart.current.pinned === o.id ? null : o.id)}
							>
								<td>{o.it.name}</td>
								<td className="win">{time.mWin(o.pa, o.pe)}</td>
								<td>
									<span className="chip" style={{ background: `color-mix(in srgb, ${o.color} 20%, transparent)` }}>
										{o.status}
									</span>
								</td>
								<td>
									<select
										aria-label={`If ${o.it.name} is off plan`}
										value={o.it.timing ?? ""}
										disabled={!canTiming}
										onClick={(e) => e.stopPropagation()}
										onChange={(e) => save(writer?.setTiming(o.id, (e.target.value || null) as Timing | null))}
									>
										<option value="">Default ({defLab})</option>
										<option value="flexible">Timeline moves</option>
										<option value="fixed">Impact changes</option>
									</select>
								</td>
								<td>
									<select
										aria-label={`Growth curve for ${o.it.name}`}
										value={o.growth}
										disabled={!canGrowth}
										onClick={(e) => e.stopPropagation()}
										onChange={(e) => save(writer?.setGrowth(o.id, e.target.value as Growth))}
									>
										<option value="linear">Linear</option>
										<option value="exp">Exponential</option>
									</select>
								</td>
								<td className="n">{fmtD(o.P, f)}</td>
								<td className="n">{o.state === "planned" ? "–" : fmtD(o.N, f)}</td>
								<td className="n">{o.state === "planned" ? <span className="muted">= plan</span> : fmtD(o.proj, f)}</td>
								<td className={"n " + cls}>{dev}</td>
							</tr>
						)
					})}
					<tr className="total">
						<td>{filtering ? "Filtered initiatives" : "All initiatives"}</td>
						<td />
						<td />
						<td />
						<td />
						<td className="n">{fmtD(M.planTotal - k.base, f)}</td>
						<td className="n">{fmtD(now, f)}</td>
						<td className="n">{fmtD(M.projTotal - k.base, f)}</td>
						<td className={"n " + (dT * M.dir < 0 ? "neg" : "pos")}>{fmtD(dT, f)}</td>
					</tr>
				</tbody>
			</table>
		</div>
	)
}

function Footnotes(p: {
	shown: number
	total: number
	hidden: number
	filtering: boolean
	noPlan: string[]
	impacts: number
	truncated: boolean
	impactsBound: boolean
	msg: string | null
	onClear: () => void
}) {
	const notes: React.ReactNode[] = []
	if (p.filtering)
		notes.push(
			<span key="f">
				Showing {p.shown} of {p.total} initiatives{p.hidden ? ` · ${p.hidden} hidden by filters` : ""}.{" "}
				<button type="button" className="link" onClick={p.onClear}>
					Clear filters
				</button>
			</span>
		)
	if (p.noPlan.length)
		notes.push(
			<span key="p">
				{p.noPlan.length === 1 ? `“${p.noPlan[0]}” has` : `${p.noPlan.length} initiatives have`} no Plan date and {p.noPlan.length === 1 ? "isn’t" : "aren’t"} drawn.
			</span>
		)
	if (!p.impactsBound) notes.push(<span key="b">Connect the Impacts database to size the bars.</span>)
	if (p.impacts) notes.push(<span key="i">{p.impacts} impact row{p.impacts === 1 ? "" : "s"} couldn’t be matched to an initiative and KPI, or lack a Planned number.</span>)
	if (p.truncated) notes.push(<span key="t">Only the first 999 rows of a database are read.</span>)
	if (p.msg) notes.push(<span key="m" className="neg">{p.msg}</span>)
	if (!notes.length) return null
	return <div className="foot">{notes}</div>
}
