import { useMemo, useState } from "react"
import { burn, defaultMeasure, fmtDay, fmtNum, isoOf, measureCandidates, type Bucket, type Missing, type Mode, type ScopeDate } from "./burn"
import { milestones, vibe } from "./vibe"
import { BurnChart, type Lines } from "./BurnChart"
import { dayIso, EMPTY_FILTERS } from "./kit/filters/core"
import { PropIcon } from "./kit/filters/icons"
import { ClockIcon, HashIcon, LineIcon, NavRow, Note, NumberRow, PickRow, Sep, SettingsShell, TableIcon, TargetIcon, ToggleRow } from "./kit/settings"
import type { BlockData } from "./kit/sources"
import { isoDay, oneOf, within } from "./kit/share"
import { Loading, Setup, Toolbar, useFiltered, usePersistentView, type WithFilters } from "./kit/toolbar"

export type Keys = "items"
type Ready = Extract<BlockData<Keys>, { status: "ready" }>

type View = WithFilters & {
	mode: Mode
	bucket: Bucket
	/** Number property to size items by; "" = automatic (Estimate or count), "count" = count. */
	measure: string
	start: string
	target: string
	window: number
	lines: Lines
	table: boolean
	scopeDate: ScopeDate
	missing: Missing
	/** The vibe check banner, milestone flags and confetti. */
	fun: boolean
}

const DEFAULT: View = {
	mode: "up",
	bucket: "week",
	measure: "",
	start: "",
	target: "",
	window: 4,
	lines: { scope: true, done: true, ideal: true, forecast: true },
	table: false,
	scopeDate: "created",
	missing: "avg",
	fun: true,
	filters: EMPTY_FILTERS,
	filterBar: true,
}

/** Imported views stay within what the settings allow. */
const sanitize = (v: View): View => ({
	...v,
	mode: oneOf(v.mode, ["up", "down"] as const, DEFAULT.mode),
	bucket: oneOf(v.bucket, ["day", "week", "month"] as const, DEFAULT.bucket),
	scopeDate: oneOf(v.scopeDate, ["created", "added"] as const, DEFAULT.scopeDate),
	missing: oneOf(v.missing, ["avg", "one", "zero"] as const, DEFAULT.missing),
	window: Math.round(within(v.window, 1, 52, DEFAULT.window)),
	start: isoDay(v.start),
	target: isoDay(v.target),
	lines: { ...DEFAULT.lines, ...v.lines },
})

export function BurnView({ data, theme }: { data: BlockData<Keys>; theme: "light" | "dark" }) {
	return (
		<div className="nb" data-theme={theme}>
			{data.status === "loading" ? (
				<Loading what="items" />
			) : data.status === "unbound" ? (
				<Setup title="Connect a database to draw the burn chart." missing={data.missing}>
					<li>
						<b>Items</b>: Name, Estimate (number, optional), Added (date, optional; else created time), Done (date). Any other property becomes filterable.
					</li>
				</Setup>
			) : (
				<Ready data={data} />
			)}
		</div>
	)
}

type Page = "root" | "chart" | "measure" | "bucket" | "lines" | "scope"

function Ready({ data }: { data: Ready }) {
	const [view, setView] = usePersistentView(data.storageKey, DEFAULT)
	const setUi = (f: Partial<View>) => setView((v) => ({ ...v, ...f }))
	const today = useMemo(() => dayIso(new Date()), [])
	const src = data.sources.items
	const { properties, visible, filtering } = useFiltered(src, view.filters, data.resolvers, today)
	const candidates = useMemo(() => measureCandidates(src), [src])
	const measure = view.measure === "count" ? null : view.measure && candidates.some((c) => c.id === view.measure) ? view.measure : defaultMeasure(src)
	const unit = measure ? (src.propertySchemasById[measure]?.name ?? "") : "items"
	const B = useMemo(
		() => burn(src, visible, { measure, scopeDate: view.scopeDate, missing: view.missing, today, start: view.start || null, target: view.target || null, window: view.window, bucket: view.bucket }),
		[src, visible, measure, view.scopeDate, view.missing, today, view.start, view.target, view.window, view.bucket]
	)
	const [page, setPage] = useState<Page>("root")

	const left = B.scopeNow - B.doneNow
	const perWeek = B.velocity * 7
	const late = B.target != null && B.forecast != null ? B.forecast - B.target : null

	const settings = (anchor: HTMLElement | null, close: () => void) => {
		const back = () => setPage("root")
		const shut = () => {
			setPage("root")
			close()
		}
		if (page === "chart")
			return (
				<SettingsShell anchor={anchor} onClose={shut} title="Chart" onBack={back}>
					<PickRow label="Burn-up" sub="Done climbs toward the scope line" selected={view.mode === "up"} onClick={() => setUi({ mode: "up" })} />
					<PickRow label="Burn-down" sub="Remaining work falls toward zero" selected={view.mode === "down"} onClick={() => setUi({ mode: "down" })} />
				</SettingsShell>
			)
		if (page === "scope")
			return (
				<SettingsShell anchor={anchor} onClose={shut} title="Joins the scope" onBack={back}>
					<PickRow label="Created time" sub="When the ticket was created in Notion" selected={view.scopeDate === "created"} onClick={() => setUi({ scopeDate: "created" })} />
					<PickRow label="Added property" sub="A date you set yourself; empty falls back to created time" selected={view.scopeDate === "added"} onClick={() => setUi({ scopeDate: "added" })} />
				</SettingsShell>
			)
		if (page === "measure")
			return (
				<SettingsShell anchor={anchor} onClose={shut} title="Measure" onBack={back}>
					<PickRow label="Count tickets" selected={measure == null} onClick={() => setUi({ measure: "count" })} />
					{candidates.map((c) => (
						<PickRow key={c.id} icon={<PropIcon type={c.type} />} label={c.name} selected={measure === c.id} onClick={() => setUi({ measure: c.id })} />
					))}
					<Note>Size tickets by a number property (story points, hours, €) or just count them.</Note>
					{measure ? (
						<>
							<Sep />
							<Note>Tickets without an estimate count as</Note>
							<PickRow label="The average estimate" selected={view.missing === "avg"} onClick={() => setUi({ missing: "avg" })} />
							<PickRow label="1" selected={view.missing === "one"} onClick={() => setUi({ missing: "one" })} />
							<PickRow label="0 (ignore them)" selected={view.missing === "zero"} onClick={() => setUi({ missing: "zero" })} />
						</>
					) : null}
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
		if (page === "lines")
			return (
				<SettingsShell anchor={anchor} onClose={shut} title="Lines" onBack={back}>
					{(["scope", "done", "ideal", "forecast"] as (keyof Lines)[]).map((k) => (
						<ToggleRow key={k} label={k === "done" ? (view.mode === "up" ? "Done" : "Remaining") : k[0].toUpperCase() + k.slice(1)} on={view.lines[k]} onChange={(on) => setUi({ lines: { ...view.lines, [k]: on } })} />
					))}
				</SettingsShell>
			)
		return (
			<SettingsShell anchor={anchor} onClose={shut} title="Chart settings">
				<NavRow icon={<LineIcon />} label="Chart" value={view.mode === "up" ? "Burn-up" : "Burn-down"} onClick={() => setPage("chart")} />
				<NavRow icon={<HashIcon />} label="Measure" value={measure ? unit : "Count"} onClick={() => setPage("measure")} />
				<NavRow icon={<ClockIcon />} label="Joins the scope" value={view.scopeDate === "created" ? "Created time" : "Added"} onClick={() => setPage("scope")} />
				<NavRow icon={<ClockIcon />} label="Time scale" value={view.bucket === "day" ? "Days" : view.bucket === "week" ? "Weeks" : "Months"} onClick={() => setPage("bucket")} />
				<NavRow icon={<LineIcon />} label="Lines" value={`${Object.values(view.lines).filter(Boolean).length} shown`} onClick={() => setPage("lines")} />
				<Sep />
				<label className="srow">
					<span className="srow-ic">
						<ClockIcon />
					</span>
					<span className="srow-l">Start</span>
					<input className="field" style={{ width: 150, flex: "none" }} type="date" value={view.start} onChange={(e) => setUi({ start: e.target.value })} />
				</label>
				<label className="srow">
					<span className="srow-ic">
						<TargetIcon />
					</span>
					<span className="srow-l">Target</span>
					<input className="field" style={{ width: 150, flex: "none" }} type="date" value={view.target} onChange={(e) => setUi({ target: e.target.value })} />
				</label>
				<NumberRow label="Velocity from last" value={view.window} min={1} onChange={(v) => setUi({ window: Math.max(1, Math.round(v)) })} suffix={view.bucket === "day" ? "days" : view.bucket + "s"} />
				<Sep />
				<ToggleRow icon={<TableIcon />} label="Table" on={view.table} onChange={(v) => setUi({ table: v })} />
				<ToggleRow icon={<TargetIcon />} label="Vibe check" sub="Status line, milestones and confetti" on={view.fun} onChange={(v) => setUi({ fun: v })} />
				<Note>Empty start uses the first item; the ideal line needs a target.</Note>
			</SettingsShell>
		)
	}

	return (
		<>
			<Toolbar
				title={view.mode === "up" ? "Burn-up" : "Burn-down"}
				view={view}
				setView={setView}
				properties={properties}
				filtering={filtering}
				today={today}
				settings={settings}
				share={{ block: "burnup", defaults: DEFAULT, schemas: src.propertySchemasById, sanitize }}
				actions={
					candidates.length ? (
						<div className="seg" role="radiogroup" aria-label="Measure">
							<button type="button" role="radio" aria-checked={measure == null} onClick={() => setUi({ measure: "count" })}>
								Tickets
							</button>
							<button type="button" role="radio" aria-checked={measure != null} onClick={() => setUi({ measure: "" })}>
								{measure ? unit : (src.propertySchemasById[defaultMeasure(src) ?? candidates[0].id]?.name ?? "Estimate")}
							</button>
						</div>
					) : null
				}
			/>
			<div className="stats">
				<Stat l="Scope" v={`${fmtNum(B.scopeNow)} ${unit}`} />
				<Stat l="Done" v={`${fmtNum(B.doneNow)}`} sub={B.scopeNow ? `${Math.round((B.doneNow / B.scopeNow) * 100)}%` : ""} />
				<Stat l="Remaining" v={fmtNum(left)} />
				<Stat l="Velocity" v={`${fmtNum(perWeek)}/wk`} sub={B.doneThisWeek ? `${B.doneThisWeek} closed this week` : ""} />
				<Stat
					l="Forecast"
					v={left <= 0 ? "Done" : B.forecast != null ? fmtDay(B.forecast) : "No progress yet"}
					sub={late == null || left <= 0 ? "" : late > 0 ? `${Math.ceil(late / 7)} wk late` : "on time"}
					tone={late == null || left <= 0 ? undefined : late > 0 ? "bad" : "good"}
				/>
			</div>
			{view.fun && B.items.length ? <VibeBanner B={B} /> : null}
			{B.items.length === 0 ? <div className="state">No items with dates{filtering ? " match the filters" : ""}.</div> : <BurnChart B={B} mode={view.mode} lines={view.lines} unit={measure ? unit : ""} flags={view.fun ? milestones(B) : []} />}
			{view.table && B.items.length ? (
				<div className="tablewrap">
					<table style={{ minWidth: 480 }}>
						<thead>
							<tr>
								<th>Item</th>
								<th>Added</th>
								<th>Done</th>
								<th className="n">{measure ? unit : "Count"}</th>
							</tr>
						</thead>
						<tbody>
							{[...B.items]
								.sort((a, b) => a.added - b.added)
								.map((i) => (
									<tr key={i.id}>
										<td>{i.name}</td>
										<td>{isoOf(i.added)}</td>
										<td>{i.done != null ? isoOf(i.done) : ""}</td>
										<td className="n">{fmtNum(i.size)}</td>
									</tr>
								))}
						</tbody>
					</table>
				</div>
			) : null}
			<div className="foot">
				{filtering ? (
					<span>
						{B.items.length} of {src.items.length - B.skipped} items match the filters.{" "}
						<button type="button" className="ghost sm" onClick={() => setUi({ filters: EMPTY_FILTERS })}>
							Clear filters
						</button>
					</span>
				) : null}
				{measure && B.guessed ? (
					<span>
						{B.guessed} tickets have no {unit} and count as {view.missing === "avg" ? "the average" : view.missing === "one" ? "1" : "0"}.
					</span>
				) : null}
				{B.skipped ? <span>{B.skipped} items have no Added, Done or created date and are left out.</span> : null}
				{src.truncated ? <span>Only the first 999 items are read.</span> : null}
			</div>
		</>
	)
}

function VibeBanner({ B }: { B: ReturnType<typeof burn> }) {
	const v = vibe(B, (d) => fmtDay(d))
	return (
		<div className={"vibe " + v.tone} role="status">
			<span className="vibe-e" aria-hidden="true">
				{v.emoji}
			</span>
			<span className="vibe-t">
				<b>{v.title}</b>
				<span>{v.line}</span>
			</span>
			{v.tone === "party" ? <Confetti /> : null}
		</div>
	)
}

const CONFETTI = ["#2383e2", "#d9730d", "#448361", "#9065b0", "#c14c8a", "#cb912f"]
function Confetti() {
	return (
		<span className="confetti" aria-hidden="true">
			{Array.from({ length: 28 }, (_, i) => (
				<i key={i} style={{ left: `${(i * 37) % 100}%`, background: CONFETTI[i % CONFETTI.length], animationDelay: `${(i % 7) * 0.12}s`, transform: `rotate(${i * 47}deg)` }} />
			))}
		</span>
	)
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
