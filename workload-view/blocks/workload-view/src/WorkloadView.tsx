import { Fragment, useLayoutEffect, useMemo, useRef, useState } from "react"
import { dayIso, EMPTY_FILTERS } from "./kit/filters/core"
import { PropIcon } from "./kit/filters/icons"
import { ClockIcon, ColumnIcon, HashIcon, LayersIcon, NavRow, Note, NumberRow, PersonIcon, PickRow, Sep, SettingsShell, TargetIcon, ToggleRow } from "./kit/settings"
import type { BlockData } from "./kit/sources"
import { isoDay, oneOf, within } from "./kit/share"
import { Loading, Setup, Toolbar, useFiltered, usePersistentView, type WithFilters } from "./kit/toolbar"
import { bucketStart, columns, fmtBucket, fmtDay, fmtNum, looksLikePercent, nextBucket, resolveSetup, workload, type Bucket, type Column, type EffortMode, type Lane, type Workload } from "./workload"

export type Keys = "assignments" | "people"
type Ready = Extract<BlockData<Keys>, { status: "ready" }>

/** Column choices: null = automatic (by name and type), "" = none. */
type View = WithFilters & {
	person: string | null
	project: string | null
	team: string | null
	effort: string | null
	dates: string | null
	pPerson: string | null
	pCap: string | null
	/** null = automatic: % unless the column is named like hours. */
	mode: EffortMode | null
	/** Hours in a full working day (hour modes). */
	dayHours: number
	/** Working time per person (lane key), % of full time; local to this browser and the view code. */
	caps: Record<string, number>
	workdays: boolean
	bucket: Bucket
	from: string
	to: string
	bars: boolean
}

const DEFAULT: View = {
	person: null,
	project: null,
	team: null,
	effort: null,
	dates: null,
	pPerson: null,
	pCap: null,
	mode: null,
	dayHours: 8,
	caps: {},
	workdays: true,
	bucket: "week",
	from: "",
	to: "",
	bars: true,
	filters: EMPTY_FILTERS,
	filterBar: true,
}

/** Imported views stay within what the settings allow. */
const sanitize = (v: View): View => {
	const caps: Record<string, number> = {}
	for (const [k, n] of Object.entries(v.caps ?? {})) if (typeof n === "number" && k.length < 100) caps[k] = within(n, 0, 200, 100)
	return {
		...v,
		mode: oneOf(v.mode, ["total", "perDay", "percent", null] as const, DEFAULT.mode),
		bucket: oneOf(v.bucket, ["day", "week", "month"] as const, DEFAULT.bucket),
		dayHours: within(v.dayHours, 0.5, 24, DEFAULT.dayHours),
		caps,
		from: isoDay(v.from),
		to: isoDay(v.to),
	}
}

const PALETTE = ["blue", "orange", "green", "purple", "pink", "yellow", "brown", "red", "gray"]
const color = (i: number) => `var(--d-${PALETTE[i % PALETTE.length]})`
const MODE_LABEL: Record<EffortMode, string> = { percent: "% of full time", total: "Hours in total", perDay: "Hours per day" }

export function WorkloadView({ data, theme }: { data: BlockData<Keys>; theme: "light" | "dark" }) {
	return (
		<div className="nb" data-theme={theme}>
			{data.status === "loading" ? (
				<Loading what="the workload" />
			) : data.status === "unbound" ? (
				<Setup title="Connect your workload database." missing={data.missing}>
					<li>
						<b>Workload</b>: one row per allocation, with a person (people or relation), a project (select or relation), a workload % and optionally
						dates and a team. Which column is which is set in the block's settings.
					</li>
					<li>
						<b>People</b> (optional): everyone on the team, with their team and working time.
					</li>
				</Setup>
			) : (
				<Ready data={data} />
			)}
		</div>
	)
}

type Page = "root" | "person" | "project" | "team" | "effort" | "dates" | "pPerson" | "pCap" | "mode" | "bucket"

function Ready({ data }: { data: Ready }) {
	const [view, setView] = usePersistentView(data.storageKey, DEFAULT)
	const setUi = (f: Partial<View>) => setView((v) => ({ ...v, ...f }))
	const today = useMemo(() => dayIso(new Date()), [])
	const src = data.sources.assignments
	const ppl = data.sources.people?.bound ? data.sources.people : undefined
	const { properties, visible, filtering } = useFiltered(src, view.filters, data.resolvers, today)
	const cols = useMemo(() => columns(src, ppl), [src, ppl])
	const setup = useMemo(() => resolveSetup(view, src, ppl), [view, src, ppl])
	const effortName = setup.effort ? src.propertySchemasById[setup.effort]?.name : undefined
	const mode: EffortMode = view.mode ?? (/hour|stunde/i.test(effortName ?? "") && !looksLikePercent(effortName) ? "total" : "percent")
	const WL = useMemo(
		() => workload(src, ppl, filtering ? visible : null, data.resolvers, { ...setup, mode, dayHours: view.dayHours, caps: view.caps, workdays: view.workdays, bucket: view.bucket, from: view.from || null, to: view.to || null, today }),
		[src, ppl, visible, filtering, data.resolvers, setup, mode, view.dayHours, view.caps, view.workdays, view.bucket, view.from, view.to, today]
	)
	const nameOf = (id: string | null, list: Column[]) => (id ? (list.find((c) => c.id === id)?.name ?? "—") : "None")
	const [page, setPage] = useState<Page>("root")

	const settings = (anchor: HTMLElement | null, close: () => void) => {
		const back = () => setPage("root")
		const shut = () => {
			setPage("root")
			close()
		}
		const colPage = (title: string, list: Column[], cur: string | null, key: keyof View, note: string, none?: string) => (
			<SettingsShell anchor={anchor} onClose={shut} title={title} onBack={back}>
				<PickRow label="Automatic" sub="Picked by name and type" selected={view[key] === null} onClick={() => setUi({ [key]: null } as Partial<View>)} />
				{none ? <PickRow label={none} selected={view[key] === ""} onClick={() => setUi({ [key]: "" } as Partial<View>)} /> : null}
				<Sep />
				{list.map((c) => (
					<PickRow key={c.id} icon={<PropIcon type={c.type} />} label={c.name} sub={c.id.startsWith("p:") ? "People database" : c.id.startsWith("w:") ? "Workload database" : undefined} selected={view[key] !== null && cur === c.id} onClick={() => setUi({ [key]: c.id } as Partial<View>)} />
				))}
				{list.length === 0 ? <Note>No suitable property yet.</Note> : null}
				<Note>{note}</Note>
			</SettingsShell>
		)
		switch (page) {
			case "person":
				return colPage("Person", cols.person, setup.person, "person", "Whose time the row allocates: a people property, or a relation to a person page.")
			case "project":
				return colPage("Project", cols.project, setup.project, "project", "What the time goes to: a select or a relation. Colors the load.", "No projects")
			case "team":
				return colPage("Team", cols.team, setup.team, "team", "Groups people into teams: a select or relation on the person (People) or on the row.", "No teams")
			case "effort":
				return colPage("Workload", cols.effort, setup.effort, "effort", "A number: 50 or 50% of someone's time, or hours (see Workload is).")
			case "dates":
				return colPage("Dates", cols.dates, setup.dates, "dates", "Rows without dates count as ongoing.", "No dates (all ongoing)")
			case "pPerson":
				return colPage("Match people by", cols.pPerson, setup.pPerson, "pPerson", "Rows of the People database are matched by this person, by relation, or by name.", "Name only")
			case "pCap":
				return colPage("Working time", cols.pCap, setup.pCap, "pCap", "Hours per week (column named with hours) or % of full time. Empty = set per person on the board.", "Set on the board")
			case "mode":
				return (
					<SettingsShell anchor={anchor} onClose={shut} title="Workload is" onBack={back}>
						<PickRow label="% of full time" sub="50 = half of someone's time. Notion's percent format works too." selected={mode === "percent"} onClick={() => setUi({ mode: "percent" })} />
						<PickRow label="Hours per day" sub="4 h every day while it runs" selected={mode === "perDay"} onClick={() => setUi({ mode: "perDay" })} />
						<PickRow label="Hours in total" sub="40 h spread over the allocation's days" selected={mode === "total"} onClick={() => setUi({ mode: "total" })} />
					</SettingsShell>
				)
			case "bucket":
				return (
					<SettingsShell anchor={anchor} onClose={shut} title="Time scale" onBack={back}>
						{(["day", "week", "month"] as Bucket[]).map((b) => (
							<PickRow key={b} label={b === "day" ? "Days" : b === "week" ? "Weeks" : "Months"} selected={view.bucket === b} onClick={() => setUi({ bucket: b })} />
						))}
					</SettingsShell>
				)
		}
		return (
			<SettingsShell anchor={anchor} onClose={shut} title="Workload settings">
				<NavRow icon={<PersonIcon />} label="Person" value={nameOf(setup.person, cols.person)} onClick={() => setPage("person")} />
				<NavRow icon={<LayersIcon />} label="Project" value={nameOf(setup.project, cols.project)} onClick={() => setPage("project")} />
				<NavRow icon={<ColumnIcon />} label="Team" value={nameOf(setup.team, cols.team)} onClick={() => setPage("team")} />
				<NavRow icon={<HashIcon />} label="Workload" value={nameOf(setup.effort, cols.effort)} onClick={() => setPage("effort")} />
				<NavRow icon={<ClockIcon />} label="Dates" value={nameOf(setup.dates, cols.dates)} onClick={() => setPage("dates")} />
				{ppl ? (
					<>
						<NavRow icon={<PersonIcon />} label="Match people by" value={nameOf(setup.pPerson, cols.pPerson)} onClick={() => setPage("pPerson")} />
						<NavRow icon={<TargetIcon />} label="Working time" value={setup.pCap ? nameOf(setup.pCap, cols.pCap) : "On the board"} onClick={() => setPage("pCap")} />
					</>
				) : null}
				<Sep />
				<NavRow icon={<HashIcon />} label="Workload is" value={MODE_LABEL[mode]} onClick={() => setPage("mode")} />
				{mode !== "percent" ? <NumberRow label="Hours in a full day" value={view.dayHours} step={0.5} min={0.5} onChange={(v) => setUi({ dayHours: v })} suffix="h" /> : null}
				<NavRow icon={<ClockIcon />} label="Time scale" value={view.bucket === "day" ? "Days" : view.bucket === "week" ? "Weeks" : "Months"} onClick={() => setPage("bucket")} />
				<ToggleRow icon={<TargetIcon />} label="Workdays only" sub="Weekends carry no load or capacity" on={view.workdays} onChange={(v) => setUi({ workdays: v })} />
				<ToggleRow icon={<LayersIcon />} label="Show allocations" on={view.bars} onChange={(v) => setUi({ bars: v })} />
				<Sep />
				<label className="srow">
					<span className="srow-l">From</span>
					<input className="field" style={{ width: 150, flex: "none" }} type="date" value={view.from} onChange={(e) => setUi({ from: e.target.value })} />
				</label>
				<label className="srow">
					<span className="srow-l">To</span>
					<input className="field" style={{ width: 150, flex: "none" }} type="date" value={view.to} onChange={(e) => setUi({ to: e.target.value })} />
				</label>
				<Note>
					{ppl ? "A People database adds everyone, their team and working time." : "Connect a People database to list everyone, even without allocations."} Click “works …” on a person to set their working time
					locally.
				</Note>
			</SettingsShell>
		)
	}

	const setCap = (key: string, share: number | null) =>
		setView((v) => {
			const caps = { ...v.caps }
			if (share == null || share === 100) delete caps[key]
			else caps[key] = within(share, 0, 200, 100)
			return { ...v, caps }
		})
	const over = WL.lanes.filter((l) => l.overBuckets > 0).length
	const teams = new Set(WL.lanes.map((l) => l.team).filter(Boolean)).size
	const people = WL.lanes.filter((l) => l.key !== "__none").length
	return (
		<>
			<Toolbar
				title="Workload"
				sub={`${people} ${people === 1 ? "person" : "people"}${teams ? ` · ${teams} team${teams === 1 ? "" : "s"}` : ""}`}
				view={view}
				setView={setView}
				properties={properties}
				filtering={filtering}
				today={today}
				settings={settings}
				share={{ block: "workload", defaults: DEFAULT, schemas: { ...ppl?.propertySchemasById, ...src.propertySchemasById }, sanitize }}
			/>
			<div className="stats">
				<Stat l="People" v={String(people)} sub={teams ? `in ${teams} team${teams === 1 ? "" : "s"}` : ""} />
				<Stat l="Over capacity" v={String(over)} sub={over ? "at some point" : ""} tone={over ? "bad" : undefined} />
				<Stat l="Range" v={`${fmtDay(WL.start)} – ${fmtDay(WL.end - 1, true)}`} />
			</div>
			{!setup.person || !setup.effort ? (
				<div className="state">
					Pick the {!setup.person ? "Person" : "Workload"} column in the settings (sliders button) to draw the workload.
				</div>
			) : WL.lanes.length === 0 ? (
				<div className="state">No allocations{filtering ? " match the filters" : ""}.</div>
			) : (
				<Lanes WL={WL} bucket={view.bucket} bars={view.bars} onCap={setCap} />
			)}
			{WL.series.length > 1 || setup.project ? (
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
				{WL.skipped ? <span>{WL.skipped} rows have no workload and are left out.</span> : null}
				{src.truncated ? <span>Only the first 999 rows are read.</span> : null}
			</div>
		</>
	)
}

const LABEL_W = 170
const CHART_H = 72
const BAR_H = 16

function Lanes({ WL, bucket, bars, onCap }: { WL: Workload; bucket: Bucket; bars: boolean; onCap: (key: string, share: number | null) => void }) {
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
			{WL.lanes.map((lane, li) => {
				const rows = bars ? packRows(lane) : []
				const nRows = rows.length ? Math.max(...rows) + 1 : 0
				const h = CHART_H + (bars ? nRows * (BAR_H + 3) + 6 : 0)
				const y = (v: number) => CHART_H - (v / yMax) * (CHART_H - 6)
				return (
					<Fragment key={lane.key}>
						{WL.lanes.some((l) => l.team) && (li === 0 || lane.team !== WL.lanes[li - 1].team) ? <div className="team-h">{lane.team ?? "No team"}</div> : null}
					<div className="lane">
						<div className="lane-h" style={narrow ? undefined : { width: LABEL_W - 12 }}>
							<b title={lane.label}>{lane.label}</b>
							<span className={lane.overBuckets ? "bad" : ""}>
								{Math.round(lane.utilization * 100)}% used · peak {fmtNum(lane.peak)}
								{WL.unit === "%" ? "%" : ` ${WL.unit}`}
							</span>
							<CapLabel lane={lane} unit={WL.unit} onCap={onCap} />
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
					</Fragment>
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

/** "works 80%": click to set a person's working time locally (unless People provides it). */
function CapLabel({ lane, unit, onCap }: { lane: Lane; unit: string; onCap: (key: string, share: number | null) => void }) {
	const [edit, setEdit] = useState(false)
	const text = `works ${fmtNum(lane.share)}%${unit === "h" ? ` · ${fmtNum(lane.cap)} h/day` : ""}`
	if (lane.capFrom === "people" || lane.key === "__none") return <span className="capl" title={lane.capFrom === "people" ? "From the People database" : undefined}>{lane.key === "__none" ? "" : text}</span>
	if (!edit)
		return (
			<button type="button" className="capl capl-b" title="Set this person's working time (saved in this view)" onClick={() => setEdit(true)}>
				{text}
				{lane.capFrom === "local" ? "" : " (default)"}
			</button>
		)
	return (
		<span className="capl">
			works{" "}
			<input
				className="field capin"
				type="number"
				min={0}
				max={200}
				step={5}
				autoFocus
				defaultValue={Math.round(lane.share)}
				onBlur={(e) => {
					onCap(lane.key, e.target.value === "" ? null : Number(e.target.value))
					setEdit(false)
				}}
				onKeyDown={(e) => {
					if (e.key === "Enter") e.currentTarget.blur()
					if (e.key === "Escape") setEdit(false)
				}}
			/>
			%
		</span>
	)
}
