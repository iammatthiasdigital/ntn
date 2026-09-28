import { useLayoutEffect, useMemo, useRef, useState } from "react"
import { dayIso, EMPTY_FILTERS } from "./kit/filters/core"
import { PropIcon } from "./kit/filters/icons"
import { ClockIcon, ColumnIcon, HashIcon, LayersIcon, NavRow, Note, NumberRow, PersonIcon, PickRow, Sep, SettingsShell, TargetIcon, ToggleRow } from "./kit/settings"
import type { BlockData } from "./kit/sources"
import { isoDay, oneOf, within } from "./kit/share"
import { Loading, Setup, Toolbar, useFiltered, usePersistentView, type WithFilters } from "./kit/toolbar"
import { bucketStart, columns, looksLikePercent, readPeople, fmtBucket, fmtDay, fmtNum, nextBucket, pick, workload, type Bucket, type EffortMode, type Lane, type Workload } from "./workload"

export type Keys = "assignments" | "people"
type Ready = Extract<BlockData<Keys>, { status: "ready" }>

type View = WithFilters & {
	/** Property ids; null = automatic, "" = none (color only). */
	groupBy: string | null
	colorBy: string | null
	effort: string | null
	/** null = automatic: % for allocation-like columns, else total hours. */
	mode: EffortMode | null
	capacity: number
	workdays: boolean
	bucket: Bucket
	from: string
	to: string
	bars: boolean
}

const DEFAULT: View = {
	groupBy: null,
	colorBy: null,
	effort: null,
	mode: null,
	capacity: 8,
	workdays: true,
	bucket: "week",
	from: "",
	to: "",
	bars: true,
	filters: EMPTY_FILTERS,
	filterBar: true,
}

/** Imported views stay within what the settings allow. */
const sanitize = (v: View): View => ({
	...v,
	mode: oneOf(v.mode, ["total", "perDay", "percent", null] as const, DEFAULT.mode),
	bucket: oneOf(v.bucket, ["day", "week", "month"] as const, DEFAULT.bucket),
	capacity: within(v.capacity, 0.5, 24, DEFAULT.capacity),
	from: isoDay(v.from),
	to: isoDay(v.to),
})

const PALETTE = ["blue", "orange", "green", "purple", "pink", "yellow", "brown", "red", "gray"]
const color = (i: number) => `var(--d-${PALETTE[i % PALETTE.length]})`
const MODE_LABEL: Record<EffortMode, string> = { percent: "% allocation", total: "Hours in total", perDay: "Hours per day" }

export function WorkloadView({ data, theme }: { data: BlockData<Keys>; theme: "light" | "dark" }) {
	return (
		<div className="nb" data-theme={theme}>
			{data.status === "loading" ? (
				<Loading what="assignments" />
			) : data.status === "unbound" ? (
				<Setup title="Connect a database to draw the workload." missing={data.missing}>
					<li>
						<b>Assignments</b>: Name, Who (people, or any property to group by), Dates (date range), Effort (a % allocation or hours), Project (optional, for colors).
					</li>
					<li>
						<b>People</b> (optional): Name, Person, Hours per week, Workload %. Sets each person's own capacity.
					</li>
				</Setup>
			) : (
				<Ready data={data} />
			)}
		</div>
	)
}

type Page = "root" | "group" | "color" | "effort" | "mode" | "bucket"

function Ready({ data }: { data: Ready }) {
	const [view, setView] = usePersistentView(data.storageKey, DEFAULT)
	const setUi = (f: Partial<View>) => setView((v) => ({ ...v, ...f }))
	const today = useMemo(() => dayIso(new Date()), [])
	const src = data.sources.assignments
	const { properties, visible, filtering } = useFiltered(src, view.filters, data.resolvers, today)
	const cols = useMemo(() => columns(src), [src])
	const groupBy = pick(src, view.groupBy, "who", cols.group, ["people", "select", "relation"])
	const colorBy = pick(src, view.colorBy, "project", cols.group.filter((c) => c.id !== groupBy), [])
	const effort = pick(src, view.effort, "effort", cols.effort, ["number", "formula", "rollup"])
	const mode: EffortMode = view.mode ?? (looksLikePercent(effort ? src.propertySchemasById[effort]?.name : undefined) ? "percent" : "total")
	const people = useMemo(() => readPeople(data.sources.people), [data.sources.people])
	const name = (id: string | null) => (id ? (src.propertySchemasById[id]?.name ?? id) : "None")
	const WL = useMemo(
		() => workload(src, visible, data.resolvers, { groupBy, colorBy, effort, mode, capacity: view.capacity, people, workdays: view.workdays, bucket: view.bucket, from: view.from || null, to: view.to || null, today }),
		[src, visible, data.resolvers, groupBy, colorBy, effort, mode, people, view.capacity, view.workdays, view.bucket, view.from, view.to, today]
	)
	const [page, setPage] = useState<Page>("root")

	const settings = (anchor: HTMLElement | null, close: () => void) => {
		const back = () => setPage("root")
		const shut = () => {
			setPage("root")
			close()
		}
		const colPage = (title: string, list: typeof cols.group, cur: string | null, set: (id: string | null) => void, none?: string) => (
			<SettingsShell anchor={anchor} onClose={shut} title={title} onBack={back}>
				{none ? <PickRow label={none} selected={cur == null} onClick={() => set("")} /> : null}
				{list.map((c) => (
					<PickRow key={c.id} icon={<PropIcon type={c.type} />} label={c.name} selected={cur === c.id} onClick={() => set(c.id)} />
				))}
				{list.length === 0 ? <Note>No suitable property in this database.</Note> : null}
			</SettingsShell>
		)
		if (page === "group") return colPage("Group by", cols.group, groupBy, (id) => setUi({ groupBy: id }))
		if (page === "color") return colPage("Color by", cols.group.filter((c) => c.id !== groupBy), colorBy, (id) => setUi({ colorBy: id }), "None")
		if (page === "effort") return colPage("Effort", cols.effort, effort, (id) => setUi({ effort: id }))
		if (page === "mode")
			return (
				<SettingsShell anchor={anchor} onClose={shut} title="Effort is" onBack={back}>
					<PickRow label="% allocation" sub="50 = half of someone's time. No hours involved." selected={mode === "percent"} onClick={() => setUi({ mode: "percent" })} />
					<PickRow label="Hours in total" sub="40 h, spread evenly over the assignment's days" selected={mode === "total"} onClick={() => setUi({ mode: "total" })} />
					<PickRow label="Hours per day" sub="4 h every day while it runs" selected={mode === "perDay"} onClick={() => setUi({ mode: "perDay" })} />
					<Note>Picked automatically from the column name ("%", "Allocation", "FTE", "Workload" → %).</Note>
				</SettingsShell>
			)
		if (page === "bucket")
			return (
				<SettingsShell anchor={anchor} onClose={shut} title="Time scale" onBack={back}>
					{(["day", "week", "month"] as Bucket[]).map((b) => (
						<PickRow key={b} label={b === "day" ? "Days" : b === "week" ? "Weeks" : "Months"} selected={view.bucket === b} onClick={() => setUi({ bucket: b })} />
					))}
				</SettingsShell>
			)
		return (
			<SettingsShell anchor={anchor} onClose={shut} title="Workload settings">
				<NavRow icon={<PersonIcon />} label="Group by" value={name(groupBy)} onClick={() => setPage("group")} />
				<NavRow icon={<LayersIcon />} label="Color by" value={name(colorBy)} onClick={() => setPage("color")} />
				<NavRow icon={<HashIcon />} label="Effort" value={name(effort)} onClick={() => setPage("effort")} />
				<NavRow icon={<ColumnIcon />} label="Effort is" value={MODE_LABEL[mode]} onClick={() => setPage("mode")} />
				<NavRow icon={<ClockIcon />} label="Time scale" value={view.bucket === "day" ? "Days" : view.bucket === "week" ? "Weeks" : "Months"} onClick={() => setPage("bucket")} />
				<Sep />
				{mode !== "percent" ? <NumberRow label={people.length ? "Default hours per day" : "Hours per day"} value={view.capacity} step={0.5} min={0} onChange={(v) => setUi({ capacity: v })} suffix="h" /> : null}
				<Note>
					{data.sources.people?.bound
						? `Working time comes from People for ${WL.lanes.filter((l) => l.capFrom === "people").length} of ${WL.lanes.length}; the rest use ${mode === "percent" ? "100%" : "the default"}.`
						: "Connect a People database (Hours per week, Workload %) to give everyone their own capacity."}
				</Note>
				<ToggleRow icon={<TargetIcon />} label="Workdays only" sub="Weekends carry no load or capacity" on={view.workdays} onChange={(v) => setUi({ workdays: v })} />
				<ToggleRow icon={<LayersIcon />} label="Show assignments" on={view.bars} onChange={(v) => setUi({ bars: v })} />
				<Sep />
				<label className="srow">
					<span className="srow-l">From</span>
					<input className="field" style={{ width: 150, flex: "none" }} type="date" value={view.from} onChange={(e) => setUi({ from: e.target.value })} />
				</label>
				<label className="srow">
					<span className="srow-l">To</span>
					<input className="field" style={{ width: 150, flex: "none" }} type="date" value={view.to} onChange={(e) => setUi({ to: e.target.value })} />
				</label>
				<Note>Empty dates fit all assignments. Shared assignments split their effort between the people or values they're grouped under.</Note>
			</SettingsShell>
		)
	}

	const over = WL.lanes.filter((l) => l.overBuckets > 0).length
	return (
		<>
			<Toolbar
				title="Workload"
				sub={groupBy ? `by ${name(groupBy)}` : undefined}
				view={view}
				setView={setView}
				properties={properties}
				filtering={filtering}
				today={today}
				settings={settings}
				share={{ block: "workload", defaults: DEFAULT, schemas: { ...data.sources.people?.propertySchemasById, ...src.propertySchemasById }, sanitize }}
			/>
			<div className="stats">
				<Stat l={name(groupBy)} v={String(WL.lanes.length)} />
				<Stat
					l="Capacity"
					v={mode === "percent" ? "100%" : `${fmtNum(WL.cap)} h/day`}
					sub={WL.lanes.some((l) => l.capFrom === "people") ? `${WL.lanes.filter((l) => l.capFrom === "people").length} from People` : "default"}
				/>
				<Stat l="Over capacity" v={String(over)} sub={over ? "at some point" : ""} tone={over ? "bad" : undefined} />
				<Stat l="Range" v={`${fmtDay(WL.start)} – ${fmtDay(WL.end - 1, true)}`} />
			</div>
			{!effort ? (
				<div className="state">Add a number property for the effort, then choose it in the settings.</div>
			) : WL.lanes.length === 0 ? (
				<div className="state">No assignments with dates and effort{filtering ? " match the filters" : ""}.</div>
			) : (
				<Lanes WL={WL} bucket={view.bucket} bars={view.bars} />
			)}
			{WL.series.length > 1 || colorBy ? (
				<div className="legend">
					{WL.series.map((s) => (
						<span key={s.key} className="key">
							<i style={{ background: color(s.index) }} />
							{s.label}
						</span>
					))}
					<span className="key">
						<svg width="20" height="8" aria-hidden="true">
							<line x1="0" x2="20" y1="4" y2="4" stroke="var(--ink2)" strokeDasharray="4 3" />
						</svg>
						Capacity
					</span>
				</div>
			) : null}
			<div className="foot">
				{filtering ? (
					<span>
						Filtered.{" "}
						<button type="button" className="ghost sm" onClick={() => setUi({ filters: EMPTY_FILTERS })}>
							Clear filters
						</button>
					</span>
				) : null}
				{WL.skipped ? <span>{WL.skipped} assignments have no dates or effort and are left out.</span> : null}
				{src.truncated ? <span>Only the first 999 assignments are read.</span> : null}
			</div>
		</>
	)
}

const LABEL_W = 170
const CHART_H = 72
const BAR_H = 16

function Lanes({ WL, bucket, bars }: { WL: Workload; bucket: Bucket; bars: boolean }) {
	const wrap = useRef<HTMLDivElement>(null)
	const [W, setW] = useState(700)
	const [tip, setTip] = useState<{ lane: Lane; bi: number; x: number; y: number } | null>(null)
	useLayoutEffect(() => {
		const el = wrap.current
		if (!el) return
		const ro = new ResizeObserver(() => setW(Math.max(320, el.clientWidth)))
		ro.observe(el)
		setW(Math.max(320, el.clientWidth))
		return () => ro.disconnect()
	}, [])
	const narrow = W < 560
	const L = narrow ? 0 : LABEL_W
	const plotW = W - L - 8
	const x = (d: number) => L + ((d - WL.start) / Math.max(1, WL.end - WL.start)) * plotW
	const yMax = Math.max(...WL.lanes.map((l) => Math.max(l.cap * 1.25, l.peak * 1.05)), 1)

	// Axis ticks: months, or weeks for short ranges.
	const tickB: Bucket = WL.end - WL.start > 100 ? "month" : "week"
	const ticks: number[] = []
	const t0 = bucketStart(WL.start, tickB)
	for (let t = t0 < WL.start ? nextBucket(t0, tickB) : t0; t < WL.end; t = nextBucket(t, tickB)) ticks.push(t)
	const every = Math.max(1, Math.ceil(ticks.length / Math.max(2, Math.floor(plotW / 64))))

	return (
		<div className={"lanes" + (narrow ? " narrow" : "")} ref={wrap} onPointerLeave={() => setTip(null)}>
			<svg width={W} height={22} className="axisrow" aria-hidden="true">
				{ticks.map((t, i) =>
					i % every ? null : (
						<text key={t} x={x(t) + 2} y={15} className="axis">
							{tickB === "month" ? fmtBucket(t, "month").replace(/ \d+$/, (y) => (new Date(t * 86400000).getUTCMonth() === 0 ? ` ’${y.trim().slice(2)}` : "")) : fmtDay(t)}
						</text>
					)
				)}
				<line x1={x(WL.today)} x2={x(WL.today)} y1={16} y2={22} stroke="var(--today)" />
			</svg>
			{WL.lanes.map((lane) => {
				const rows = bars ? packRows(lane) : []
				const nRows = rows.length ? Math.max(...rows) + 1 : 0
				const h = CHART_H + (bars ? nRows * (BAR_H + 3) + 6 : 0)
				const y = (v: number) => CHART_H - (v / yMax) * (CHART_H - 6)
				return (
					<div className="lane" key={lane.key}>
						<div className="lane-h" style={narrow ? undefined : { width: LABEL_W - 12 }}>
							<b title={lane.label}>{lane.label}</b>
							<span className={lane.overBuckets ? "bad" : ""}>
								{Math.round(lane.utilization * 100)}% used · peak {fmtNum(lane.peak)}
								{WL.unit === "%" ? "%" : ` ${WL.unit}`}
							</span>
							<span className="capl" title={lane.capFrom === "people" ? "From the People database" : "Default capacity"}>
								works {lane.capLabel}
								{lane.capFrom === "people" ? "" : " (default)"}
							</span>
						</div>
						<svg width={W} height={h} className="lane-svg" role="img" aria-label={`Workload of ${lane.label}`}>
							{ticks.map((t, i) => (i % every ? null : <line key={t} x1={x(t)} x2={x(t)} y1={0} y2={h} stroke="var(--grid)" />))}
							{WL.buckets.map((b, bi) => {
								const x0 = x(b)
								const x1 = x(nextBucket(b, bucket))
								const w = Math.max(1, x1 - x0 - (x1 - x0 > 6 ? 1.5 : 0))
								let acc = 0
								const over = lane.total[bi] > lane.cap + 1e-9
								return (
									<g
										key={b}
										onPointerMove={(e) => {
											const r = wrap.current!.getBoundingClientRect()
											setTip({ lane, bi, x: e.clientX - r.left, y: e.clientY - r.top })
										}}
									>
										<rect x={x0} y={0} width={x1 - x0} height={CHART_H} fill={over ? "var(--overbg)" : "transparent"} />
										{lane.load[bi].map((v, si) => {
											if (v <= 0) return null
											const top = y(acc + v)
											const r = <rect key={si} x={x0} y={top} width={w} height={y(acc) - top} fill={color(WL.series[si].index)} opacity={0.85} />
											acc += v
											return r
										})}
										{over ? <rect x={x0} y={y(lane.total[bi])} width={w} height={2} fill="var(--bad)" /> : null}
									</g>
								)
							})}
							<line x1={L} x2={L + plotW} y1={y(lane.cap)} y2={y(lane.cap)} stroke="var(--ink2)" strokeDasharray="4 3" />
							<line x1={L} x2={L + plotW} y1={CHART_H} y2={CHART_H} stroke="var(--line)" />
							<line x1={x(WL.today)} x2={x(WL.today)} y1={0} y2={h} stroke="var(--today)" />
							{bars
								? lane.items.map((it, i) => {
										const bx = x(Math.max(it.start, WL.start))
										const bw = Math.max(3, x(Math.min(it.end + 1, WL.end)) - bx)
										const by = CHART_H + 6 + rows[i] * (BAR_H + 3)
										const si = WL.series.find((s) => s.key === it.color)?.index ?? 0
										return (
											<g key={it.id}>
												<title>{`${it.name} · ${fmtDay(it.start)}–${fmtDay(it.end, true)} · ${fmtNum(it.perDay)} ${WL.unit}/day`}</title>
												<rect x={bx} y={by} width={bw} height={BAR_H} rx={3} fill={color(si)} opacity={0.22} stroke={color(si)} strokeOpacity={0.6} />
												{bw > 40 ? (
													<text x={bx + 5} y={by + 12} className="barlbl">
														{fit(it.name, bw - 10)}
													</text>
												) : null}
											</g>
										)
									})
								: null}
						</svg>
					</div>
				)
			})}
			{tip ? (
				<div className="btip" style={{ left: Math.min(W - 230, tip.x + 12), top: tip.y + 12 }}>
					<b>
						{tip.lane.label} · {fmtBucket(WL.buckets[tip.bi], bucket)}
					</b>
					{WL.series.map((s, si) =>
						tip.lane.load[tip.bi][si] > 0 ? (
							<div key={s.key}>
								<span>
									<i className="sw" style={{ background: color(s.index) }} />
									{s.label}
								</span>
								<span>
									{fmtNum(tip.lane.load[tip.bi][si])} {WL.unit}
								</span>
							</div>
						) : null
					)}
					<div>
						<span>{WL.unit === "%" ? "Allocated" : "Total per day"}</span>
						<span className={tip.lane.total[tip.bi] > tip.lane.cap ? "bad" : ""}>
							{fmtNum(tip.lane.total[tip.bi])} / {fmtNum(tip.lane.cap)} {WL.unit}
						</span>
					</div>
				</div>
			) : null}
		</div>
	)
}

/** Stacks overlapping assignments into rows, first free row wins. */
function packRows(lane: Lane): number[] {
	const ends: number[] = []
	return lane.items.map((it) => {
		let r = ends.findIndex((e) => e < it.start)
		if (r < 0) r = ends.length
		ends[r] = it.end
		return r
	})
}

function fit(s: string, px: number): string {
	const max = Math.floor(px / 6.3)
	return s.length <= max ? s : s.slice(0, Math.max(1, max - 1)) + "…"
}

function Stat({ l, v, sub, tone }: { l: string; v: string; sub?: string; tone?: "good" | "bad" }) {
	return (
		<div className="stat">
			<span className="stat-l">{l}</span>
			<span className="stat-v">
				{v}
				{sub ? <span className={"stat-s" + (tone ? " " + tone : "")}>{sub}</span> : null}
			</span>
		</div>
	)
}
