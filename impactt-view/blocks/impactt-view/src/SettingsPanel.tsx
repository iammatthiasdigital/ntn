/**
 * Notion-style view settings: a popover with rows that drill into sub-pages
 * (back arrow in the header), switches for on/off options. Holds the KPI
 * choice, deviation default, goal, display toggles, lines and the legend.
 */
import { useState, type ReactNode } from "react"
import type { LineKey } from "./chart"
import { Popover } from "./filters/popover"
import { ArrowRight, Check, Close, PropIcon } from "./filters/icons"
import { fmt, type Goal, type GoalMode, type Kpi, type Timing } from "./model"
import type { Writer } from "./sources"
import { AVG_KPI_ID } from "./dataset"

export type SettingsPage = "root" | "kpi" | "column" | "timing" | "goal" | "lines" | "legend"

export type SettingsState = {
	kpiId: string | null
	kpiColumn: string | null
	timing: Timing
	goalModes: Record<string, GoalMode>
	compare: boolean
	table: boolean
	lines: Record<LineKey, boolean>
}

type Props = {
	anchor: HTMLElement | null
	onClose: () => void
	initialPage?: SettingsPage
	view: SettingsState
	setUi: (f: Partial<SettingsState>) => void
	kpis: Kpi[]
	k: Kpi
	G: Goal
	monthYear: (t: number) => string
	writer: Writer | null
	save: (p: Promise<string | null> | undefined) => void
	kpiBound: Record<string, string | undefined>
	onKpiChange: () => void
	/** Impacts columns that can name the KPI, and the one in use. */
	columns: { id: string; name: string; type: string }[]
	kpiColumn: string | null
}

/* ---------- icons (16px line glyphs, Notion style) ---------- */

const I = ({ children }: { children: ReactNode }) => (
	<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.25} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="ico">
		{children}
	</svg>
)

/** Notion's view-settings glyph: horizontal sliders. */
export const SlidersIcon = () => (
	<I>
		<path d="M2.5 4.5h6M11.5 4.5h2M2.5 11.5h2M7.5 11.5h6" />
		<circle cx="10" cy="4.5" r="1.5" />
		<circle cx="6" cy="11.5" r="1.5" />
	</I>
)
const TargetIcon = () => (
	<I>
		<circle cx="8" cy="8" r="5.5" />
		<circle cx="8" cy="8" r="2.5" />
		<circle cx="8" cy="8" r=".6" fill="currentColor" />
	</I>
)
const ClockIcon = () => (
	<I>
		<circle cx="8" cy="8" r="5.5" />
		<path d="M8 5v3.2l2.2 1.3" />
	</I>
)
const FlagIcon = () => (
	<I>
		<path d="M4 14V2.5M4 3h7.5l-1.8 2.8 1.8 2.7H4" />
	</I>
)
const LayersIcon = () => (
	<I>
		<rect x="2.5" y="5.5" width="8" height="8" rx="1.5" />
		<path d="M5.5 5.5V4a1.5 1.5 0 0 1 1.5-1.5h5A1.5 1.5 0 0 1 13.5 4v5a1.5 1.5 0 0 1-1.5 1.5h-1.5" strokeDasharray="2 1.6" />
	</I>
)
const TableIcon = () => (
	<I>
		<rect x="2.5" y="3" width="11" height="10" rx="1.5" />
		<path d="M2.5 6.5h11M2.5 9.8h11M6.5 6.5V13" />
	</I>
)
const LineIcon = () => (
	<I>
		<path d="M2.5 12.5 6 8.5l2.5 2 5-6" />
		<path d="M2.5 2.5v11h11" opacity=".5" />
	</I>
)
const InfoIcon = () => (
	<I>
		<circle cx="8" cy="8" r="5.5" />
		<path d="M8 7.3v3.5M8 5.2v.1" />
	</I>
)
const ColumnIcon = () => (
	<I>
		<rect x="2.5" y="2.5" width="11" height="11" rx="1.5" />
		<path d="M6.5 2.5v11" />
		<path d="M3.5 5h2M3.5 7.5h2M3.5 10h2" strokeWidth="1" />
	</I>
)
const BackIcon = () => (
	<I>
		<path d="M9.5 3.5 5 8l4.5 4.5" />
	</I>
)

/* ---------- building blocks ---------- */

export function Switch({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
	return (
		<button type="button" role="switch" aria-checked={on} aria-label={label} className={"switch" + (on ? " on" : "")} onClick={() => onChange(!on)}>
			<span />
		</button>
	)
}

function NavRow({ icon, label, value, onClick }: { icon: ReactNode; label: string; value?: string; onClick: () => void }) {
	return (
		<button type="button" className="srow" onClick={onClick}>
			<span className="srow-ic">{icon}</span>
			<span className="srow-l">{label}</span>
			{value ? <span className="srow-v">{value}</span> : null}
			<span className="srow-go">
				<ArrowRight />
			</span>
		</button>
	)
}

function ToggleRow({ icon, label, on, onChange }: { icon: ReactNode; label: ReactNode; on: boolean; onChange: (v: boolean) => void }) {
	return (
		<div className="srow" onClick={() => onChange(!on)} role="presentation">
			{icon ? <span className="srow-ic">{icon}</span> : null}
			<span className="srow-l">{label}</span>
			<span onClick={(e) => e.stopPropagation()} role="presentation">
				<Switch on={on} onChange={onChange} label={typeof label === "string" ? label : "Toggle"} />
			</span>
		</div>
	)
}

function PickRow({ label, sub, selected, onClick }: { label: string; sub?: string; selected: boolean; onClick: () => void }) {
	return (
		<button type="button" className="srow" role="menuitemradio" aria-checked={selected} onClick={onClick}>
			<span className="srow-l">
				{label}
				{sub ? <span className="srow-sub">{sub}</span> : null}
			</span>
			{selected ? (
				<span className="srow-check">
					<Check />
				</span>
			) : null}
		</button>
	)
}

function Header({ title, onBack, onClose }: { title: string; onBack?: () => void; onClose: () => void }) {
	return (
		<div className="shead">
			{onBack ? (
				<button type="button" className="ghost ic" aria-label="Back" onClick={onBack}>
					<BackIcon />
				</button>
			) : null}
			<span className="shead-t">{title}</span>
			<button type="button" className="ghost ic" aria-label="Close" onClick={onClose}>
				<Close />
			</button>
		</div>
	)
}

const LINES: { key: LineKey; label: string; icon: ReactNode }[] = [
	{ key: "plan", label: "Plan", icon: <line x1="0" y1="4" x2="20" y2="4" stroke="var(--tplan)" strokeWidth="1.2" strokeDasharray="2 4" strokeLinecap="round" /> },
	{ key: "actual", label: "Actual", icon: <line x1="0" y1="4" x2="20" y2="4" stroke="var(--tact)" strokeWidth="2.2" /> },
	{ key: "proj", label: "Projected", icon: <line x1="0" y1="4" x2="20" y2="4" stroke="var(--tproj)" strokeWidth="1.2" strokeDasharray="5 3" /> },
	{ key: "band", label: "Range", icon: <rect x="0" y="0" width="20" height="8" fill="var(--band)" /> },
	{ key: "goal", label: "Goal", icon: <line x1="0" y1="4" x2="20" y2="4" stroke="var(--goal)" strokeWidth="1.1" strokeDasharray="7 4" /> },
]

const TIMING_LABEL: Record<Timing, string> = { flexible: "Timeline moves", fixed: "Impact changes" }

/* ---------- panel ---------- */

export function SettingsPanel(p: Props) {
	const [page, setPage] = useState<SettingsPage>(p.initialPage ?? "root")
	const { view, setUi, k, G } = p
	const back = () => setPage("root")
	const goalLabel = `${G.mode === "plan" ? "From plan" : fmt(G.value, k.fmt)} · ${p.monthYear(G.by - 0.01)}`
	const linesOn = LINES.filter((l) => view.lines[l.key]).length

	let body: ReactNode
	const colName = p.columns.find((c) => c.id === p.kpiColumn)?.name
	if (page === "kpi") {
		body = (
			<>
				<Header title="KPI" onBack={back} onClose={p.onClose} />
				<div className="sbody" role="menu">
					{p.kpis.length === 0 ? <p className="snote">No impact rows name a KPI in this column yet.</p> : null}
					{p.kpis.map((x) => (
						<PickRow
							key={x.id}
							label={x.label}
							selected={x.id === k.id}
							onClick={() => {
								setUi({ kpiId: x.id })
								p.onKpiChange()
								back()
							}}
						/>
					))}
					{p.kpis.length > 1 ? (
						<>
							<div className="msep" />
							<PickRow
								label="All KPIs · average"
								sub="100% = every initiative reaches its planned impact, averaged over its KPIs"
								selected={k.id === AVG_KPI_ID}
								onClick={() => {
									setUi({ kpiId: AVG_KPI_ID })
									p.onKpiChange()
									back()
								}}
							/>
						</>
					) : null}
					<div className="msep" />
					<NavRow icon={<ColumnIcon />} label="KPIs from" value={colName ?? "None"} onClick={() => setPage("column")} />
				</div>
			</>
		)
	} else if (page === "column") {
		body = (
			<>
				<Header title="KPIs from" onBack={() => setPage("kpi")} onClose={p.onClose} />
				<div className="sbody" role="menu">
					<p className="snote">The Impacts column that names the KPI. Each value in it becomes a KPI you can chart.</p>
					{p.columns.map((c) => (
						<button
							type="button"
							key={c.id}
							className="srow"
							role="menuitemradio"
							aria-checked={c.id === p.kpiColumn}
							onClick={() => {
								setUi({ kpiColumn: c.id, kpiId: null })
								p.onKpiChange()
								setPage("kpi")
							}}
						>
							<span className="srow-ic">
								<PropIcon type={c.type} />
							</span>
							<span className="srow-l">{c.name}</span>
							<span className="srow-v">{c.type === "relation" ? "Relation" : c.type === "select" ? "Select" : "Multi-select"}</span>
							{c.id === p.kpiColumn ? (
								<span className="srow-check">
									<Check />
								</span>
							) : null}
						</button>
					))}
					{p.columns.length === 0 ? <p className="snote">Add a relation, select or multi-select property to the Impacts database.</p> : null}
				</div>
			</>
		)
	} else if (page === "timing") {
		body = (
			<>
				<Header title="If off plan" onBack={back} onClose={p.onClose} />
				<div className="sbody" role="menu">
					<PickRow label="Timeline moves" sub="Impact is kept, the end date slips" selected={view.timing === "flexible"} onClick={() => setUi({ timing: "flexible" })} />
					<PickRow label="Impact changes" sub="The date is fixed, the impact shrinks or grows" selected={view.timing === "fixed"} onClick={() => setUi({ timing: "fixed" })} />
					<p className="snote">Default for initiatives whose “If off plan” property is empty.</p>
				</div>
			</>
		)
	} else if (page === "goal") {
		body = <GoalPage {...p} onBack={back} />
	} else if (page === "lines") {
		body = (
			<>
				<Header title="Lines" onBack={back} onClose={p.onClose} />
				<div className="sbody">
					{LINES.map((l) => (
						<ToggleRow
							key={l.key}
							icon={
								<svg width="20" height="8" aria-hidden="true">
									{l.icon}
								</svg>
							}
							label={l.label}
							on={view.lines[l.key]}
							onChange={(on) => setUi({ lines: { ...view.lines, [l.key]: on } })}
						/>
					))}
				</div>
			</>
		)
	} else if (page === "legend") {
		body = (
			<>
				<Header title="Legend" onBack={back} onClose={p.onClose} />
				<div className="sbody legend-list">
					<div className="mhead">Bar style</div>
					<div className="lrow">
						<svg width="22" height="12">
							<rect x="1" y="1" width="20" height="10" rx="2" fill="var(--ink2)" fillOpacity=".16" stroke="var(--ink2)" strokeWidth="1.4" />
						</svg>
						Plan (translucent)
					</div>
					<div className="lrow">
						<svg width="22" height="12">
							<rect x="1" y="1" width="20" height="10" rx="2" fill="var(--ink2)" />
						</svg>
						Achieved (solid)
					</div>
					<div className="lrow">
						<svg width="22" height="12">
							<rect x="1" y="1" width="20" height="10" rx="2" fill="none" stroke="var(--ink2)" strokeWidth="0.9" strokeDasharray="4 3" />
						</svg>
						Projected (dashed)
					</div>
					<div className="mhead">Bar colour</div>
					{[
						["--s-up", "Upcoming"],
						["--s-ok", "In progress, will meet"],
						["--s-bad", "In progress, won’t meet"],
						["--s-met", "Done, met"],
						["--s-miss", "Done, impact missed"],
						["--s-late", "Done, late"],
					].map(([v, l]) => (
						<div className="lrow" key={v}>
							<svg width="22" height="12">
								<rect x="5" y="0" width="12" height="12" rx="2" fill={`var(${v})`} />
							</svg>
							{l}
						</div>
					))}
				</div>
			</>
		)
	} else {
		body = (
			<>
				<Header title="Chart settings" onClose={p.onClose} />
				<div className="sbody">
					<NavRow icon={<TargetIcon />} label="KPI" value={k.label} onClick={() => setPage("kpi")} />
					<NavRow icon={<FlagIcon />} label="Goal" value={goalLabel} onClick={() => setPage("goal")} />
					<NavRow icon={<ClockIcon />} label="If off plan" value={TIMING_LABEL[view.timing]} onClick={() => setPage("timing")} />
					<div className="msep" />
					<NavRow icon={<LineIcon />} label="Lines" value={`${linesOn} of ${LINES.length}`} onClick={() => setPage("lines")} />
					<ToggleRow icon={<LayersIcon />} label="Original + current plans" on={view.compare} onChange={(compare) => setUi({ compare })} />
					<ToggleRow icon={<TableIcon />} label="Table" on={view.table} onChange={(table) => setUi({ table })} />
					<div className="msep" />
					<NavRow icon={<InfoIcon />} label="Legend" onClick={() => setPage("legend")} />
				</div>
			</>
		)
	}

	return (
		<Popover anchor={p.anchor} onClose={p.onClose} width={300} className="settings">
			{body}
		</Popover>
	)
}

function GoalPage(p: Props & { onBack: () => void }) {
	const { k, G, view, setUi, writer, save, kpiBound } = p
	const [draft, setDraft] = useState<string | null>(null)
	const rowId = k.rowId
	const noRow = "Add this KPI to the KPIs database (same title) to save a goal"
	const canGoal = !!writer && !!rowId && kpiBound.goal !== undefined
	const canGoalBy = !!writer && !!rowId && kpiBound.goalBy !== undefined
	const gv = Math.round(G.value * (k.fmt === "pp" ? 10 : 1)) / (k.fmt === "pp" ? 10 : 1)
	const setMode = (mode: GoalMode) => setUi({ goalModes: { ...view.goalModes, [k.id]: mode } })
	return (
		<>
			<Header title="Goal" onBack={p.onBack} onClose={p.onClose} />
			<div className="sbody" role="menu">
				<PickRow label="From plan" sub={`Sum of planned impacts · ${fmt(G.plan, k.fmt)}`} selected={G.mode === "plan"} onClick={() => setMode("plan")} />
				<PickRow label="Custom" sub={G.custom != null ? `The KPI’s Goal · ${fmt(G.custom, k.fmt)}` : "Set your own target"} selected={G.mode === "custom"} onClick={() => setMode("custom")} />
				<div className="msep" />
				<label className="sfield">
					<span>Value</span>
					<input
						className="field"
						type="number"
						step="any"
						inputMode="decimal"
						value={draft ?? String(gv)}
						disabled={G.mode !== "custom" || !canGoal}
						title={!rowId ? noRow : !canGoal ? "Connect the KPI’s Goal property to edit it here" : G.mode !== "custom" ? "Choose Custom to set your own goal" : ""}
						onChange={(e) => setDraft(e.target.value)}
						onBlur={() => {
							if (draft == null) return
							const v = parseFloat(draft)
							setDraft(null)
							if (!isNaN(v) && v !== k.goal?.value) rowId && save(writer?.setGoal(rowId, v))
						}}
						onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
					/>
				</label>
				<label className="sfield">
					<span>Reach by</span>
					<input
						className="field"
						type="month"
						value={k.goal?.by?.slice(0, 7) ?? ""}
						disabled={!canGoalBy}
						title={!rowId ? noRow : !canGoalBy ? "Connect the KPI’s Goal by property to edit it here" : ""}
						onChange={(e) => /^\d{4}-\d{2}$/.test(e.target.value) && rowId && save(writer?.setGoalBy(rowId, e.target.value))}
					/>
				</label>
				<p className="snote">{rowId ? "Value and date are saved to the KPI in Notion." : noRow + "."}</p>
			</div>
		</>
	)
}
