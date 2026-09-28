import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as RPointerEvent, type ReactNode } from "react"
import { asStrings, checkboxOf, dateOf, dayIso, EMPTY_FILTERS, formatDay, pointerIds, textOf, type FilterProperty, type Resolvers } from "./kit/filters/core"
import { Tag } from "./kit/filters/editors"
import { PropIcon } from "./kit/filters/icons"
import { ColumnIcon, LayersIcon, NavRow, Note, NumberRow, PickRow, Sep, SettingsShell, TableIcon, TargetIcon } from "./kit/settings"
import type { BlockData } from "./kit/sources"
import { oneOf, within } from "./kit/share"
import { Loading, Setup, Toolbar, useFiltered, usePersistentView, type WithFilters } from "./kit/toolbar"
import { current, exitDateId, hueFor, initials, managers, openToLevel, prune, readPeople, type Person } from "./org"
import { ancestorsOf, buildForest, chainToRoot, layoutForest, type Size } from "./tree"

export type Keys = "people"
type Ready = Extract<BlockData<Keys>, { status: "ready" }>

type View = WithFilters & {
	/** Property ids shown on the cards, in order. */
	fields: string[]
	/** Select-like property that tints the cards; "" for none. */
	colorBy: string
	/** What filters do with people who don't match. */
	filtered: "hide" | "dim"
	/** How far the chart is open when it loads (0: leaders only). */
	startOpen: number
	height: number
}

const DEFAULT: View = { fields: [], colorBy: "", filtered: "hide", startOpen: 0, height: 560, filters: EMPTY_FILTERS, filterBar: true }
/** Imported views stay within what the settings allow. */
const sanitize = (v: View): View => ({
	...v,
	fields: v.fields.filter((f) => typeof f === "string").slice(0, 12),
	filtered: oneOf(v.filtered, ["hide", "dim"] as const, DEFAULT.filtered),
	startOpen: oneOf(v.startOpen, [0, 1, 2, 99], DEFAULT.startOpen),
	height: Math.round(within(v.height, 320, 4000, DEFAULT.height)),
})
const CARD_W = 212
const FIELD_H = 24
const ZOOMS = [0.2, 0.3, 0.45, 0.6, 0.75, 0.9, 1, 1.15, 1.3] as const
const MOVE_MS = 260

export function OrgView({ data, theme }: { data: BlockData<Keys>; theme: "light" | "dark" }) {
	return (
		<div className="nb" data-theme={theme}>
			{data.status === "loading" ? (
				<Loading what="the org chart" />
			) : data.status === "unbound" ? (
				<Setup title="Connect a People database to draw the org chart." missing={data.missing}>
					<li>
						<b>People</b>: Name (title), Role (text), Reports to (relation to the same database), and optionally Exit date (date): anyone with one is left out.
						Every other property can be shown on the cards, used to color them, and filtered on.
					</li>
				</Setup>
			) : (
				<Ready data={data} />
			)}
		</div>
	)
}

type Pan = { tx: number; ty: number; s: number }

function Ready({ data }: { data: Ready }) {
	const [view, setView] = usePersistentView(data.storageKey, DEFAULT)
	const setUi = (f: Partial<View>) => setView((v) => ({ ...v, ...f }))
	const today = useMemo(() => dayIso(new Date()), [])
	const src = data.sources.people
	const res = data.resolvers
	const { properties: allProps, visible, filtering } = useFiltered(src, view.filters, res, today)
	// Leavers are out for everyone, so their Exit date is no use as a filter or card field.
	const exitId = exitDateId(src)
	const properties = useMemo(() => allProps.filter((p) => p.id !== exitId), [allProps, exitId])
	const everyone = useMemo(() => readPeople(src), [src])
	const leavers = useMemo(() => everyone.filter((p) => p.left).length, [everyone])
	const all = useMemo(() => current(everyone), [everyone])
	const people = useMemo(() => (filtering && view.filtered === "hide" ? prune(all, visible) : all), [all, visible, filtering, view.filtered])
	const forest = useMemo(() => buildForest(people), [people])
	const propById = useMemo(() => new Map(properties.map((p) => [p.id, p])), [properties])
	const nameId = src.propertyIdsByKey.name
	const roleId = src.propertyIdsByKey.role
	const relId = src.propertyIdsByKey.reportsTo
	const fields = view.fields.map((id) => propById.get(id)).filter((p): p is FilterProperty => !!p)
	const colorProp = propById.get(view.colorBy)
	const size: Size = useMemo(() => ({ w: CARD_W, h: 70 + fields.length * FIELD_H }), [fields.length])

	/* ---- open / closed ---- */
	const [open, setOpen] = useState<ReadonlySet<string>>(() => (filtering ? managers(people) : openToLevel(people, view.startOpen)))
	const filterKey = JSON.stringify(view.filters) + view.filtered
	const firstFilter = useRef(true)
	useEffect(() => {
		// A new filter opens the chart to show every match; clearing it closes it again.
		if (firstFilter.current) return void (firstFilter.current = false)
		setOpen(filtering ? managers(people) : openToLevel(people, view.startOpen))
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [filterKey])
	const layout = useMemo(() => layoutForest(forest.roots, open, size), [forest, open, size])

	/* ---- viewport ---- */
	const vpRef = useRef<HTMLDivElement>(null)
	const [pan, setPan] = useState<Pan>({ tx: 0, ty: 24, s: 1 })
	const panRef = useRef(pan)
	panRef.current = pan
	const [moving, setMoving] = useState(false)
	const moveTimer = useRef<number | undefined>(undefined)
	const glide = useCallback(() => {
		setMoving(true)
		window.clearTimeout(moveTimer.current)
		moveTimer.current = window.setTimeout(() => setMoving(false), MOVE_MS + 40)
	}, [])
	const centerOn = useCallback(
		(id: string, s = panRef.current.s, lay = layout) => {
			const p = lay.positions.get(id)
			const el = vpRef.current
			if (!p || !el) return
			glide()
			setPan({ s, tx: el.clientWidth / 2 - (p.x + size.w / 2) * s, ty: Math.min(el.clientHeight / 2 - (p.y + size.h / 2) * s, 40 - p.y * s + (p.y > 0 ? 80 : 0)) })
		},
		[layout, size, glide]
	)
	const home = useCallback(() => {
		const el = vpRef.current
		if (!el) return
		const w = layout.width
		const s = Math.max(ZOOMS[0], Math.min(1, (el.clientWidth - 48) / Math.max(w, 1)))
		glide()
		setPan({ s, tx: (el.clientWidth - w * s) / 2, ty: 56 })
	}, [layout, glide])
	const fit = useCallback(() => {
		const el = vpRef.current
		if (!el) return
		const w = Math.max(layout.width, size.w)
		const h = Math.max(layout.height, size.h)
		const s = Math.max(ZOOMS[0], Math.min(1.15, (el.clientWidth - 64) / w, (el.clientHeight - 120) / h))
		glide()
		setPan({ s, tx: (el.clientWidth - w * s) / 2, ty: 64 + Math.max(0, (el.clientHeight - 120 - h * s) / 2) })
	}, [layout, size, glide])
	const didHome = useRef(false)
	useLayoutEffect(() => {
		if (!didHome.current && layout.positions.size) {
			didHome.current = true
			home()
		}
	}, [layout, home])

	// Keep the card that was toggled still: move the view along with the relayout.
	const anchor = useRef<{ id: string; x: number; y: number } | null>(null)
	useLayoutEffect(() => {
		const a = anchor.current
		anchor.current = null
		const p = a ? layout.positions.get(a.id) : undefined
		if (!a || !p || (p.x === a.x && p.y === a.y)) return
		glide()
		setPan((v) => ({ ...v, tx: v.tx - (p.x - a.x) * v.s, ty: v.ty - (p.y - a.y) * v.s }))
	}, [layout, glide])

	const zoomAt = useCallback((s2: number, cx?: number, cy?: number) => {
		const el = vpRef.current
		if (!el) return
		const { tx, ty, s } = panRef.current
		const px = cx ?? el.clientWidth / 2
		const py = cy ?? el.clientHeight / 2
		setPan({ s: s2, tx: px - ((px - tx) / s) * s2, ty: py - ((py - ty) / s) * s2 })
	}, [])
	const zoomStep = useCallback(
		(dir: 1 | -1, cx?: number, cy?: number) => {
			const s = panRef.current.s
			const next = dir > 0 ? (ZOOMS.find((z) => z > s + 0.01) ?? ZOOMS[ZOOMS.length - 1]) : ([...ZOOMS].reverse().find((z) => z < s - 0.01) ?? ZOOMS[0])
			glide()
			zoomAt(next, cx, cy)
		},
		[zoomAt, glide]
	)
	useEffect(() => {
		const el = vpRef.current
		if (!el) return
		let acc = 0
		const onWheel = (e: WheelEvent) => {
			e.preventDefault()
			if (e.ctrlKey || e.metaKey) {
				acc += e.deltaY
				if (Math.abs(acc) < 24) return
				const r = el.getBoundingClientRect()
				zoomStep(acc < 0 ? 1 : -1, e.clientX - r.left, e.clientY - r.top)
				acc = 0
				return
			}
			const k = e.deltaMode === 1 ? 18 : 1
			setPan((v) => ({ ...v, tx: v.tx - e.deltaX * k, ty: v.ty - e.deltaY * k }))
		}
		el.addEventListener("wheel", onWheel, { passive: false })
		return () => el.removeEventListener("wheel", onWheel)
	}, [zoomStep])
	const drag = useRef<{ id: number; x: number; y: number; moved: boolean } | null>(null)
	const [dragging, setDragging] = useState(false)
	const onDown = (e: RPointerEvent<HTMLDivElement>) => {
		if (e.button !== 0 || (e.target as Element).closest(".oc-ui, .oc-card")) return
		drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY, moved: false }
		setDragging(true)
		e.currentTarget.setPointerCapture(e.pointerId)
	}
	const onMove = (e: RPointerEvent<HTMLDivElement>) => {
		const d = drag.current
		if (!d || d.id !== e.pointerId) return
		const dx = e.clientX - d.x
		const dy = e.clientY - d.y
		d.x = e.clientX
		d.y = e.clientY
		if (dx || dy) d.moved = true
		setPan((v) => ({ ...v, tx: v.tx + dx, ty: v.ty + dy }))
	}
	const onUp = (e: RPointerEvent<HTMLDivElement>) => {
		if (drag.current?.id !== e.pointerId) return
		if (!drag.current.moved) setSelected(null)
		drag.current = null
		setDragging(false)
	}

	/* ---- selection, hover, toggling ---- */
	const [selected, setSelected] = useState<string | null>(null)
	const [hovered, setHovered] = useState<string | null>(null)
	const chain = useMemo(() => {
		const f = hovered ?? selected
		return f && forest.nodesById.has(f) ? chainToRoot(f, forest.parentById) : new Set<string>()
	}, [hovered, selected, forest])
	const toggle = (id: string) => {
		const p = layout.positions.get(id)
		if (p) anchor.current = { id, ...p }
		setOpen((o) => {
			const n = new Set(o)
			if (n.has(id)) n.delete(id)
			else n.add(id)
			return n
		})
	}
	/** Opens everyone above a person and brings them into view. */
	const reveal = (id: string) => {
		const up = ancestorsOf(id, forest.parentById)
		const next = new Set([...open, ...up])
		setOpen(next)
		setSelected(id)
		centerOn(id, Math.max(panRef.current.s, 0.9), layoutForest(forest.roots, next, size))
	}
	const [legendPick, setLegendPick] = useState<string | null>(null)
	useEffect(() => setLegendPick(null), [view.colorBy])

	/* ---- search ---- */
	const [q, setQ] = useState("")
	const [qi, setQi] = useState(0)
	const matches = useMemo(() => {
		const s = q.trim().toLowerCase()
		if (!s) return []
		return people
			.map((p) => ({ p, score: p.name.toLowerCase().startsWith(s) ? 0 : p.name.toLowerCase().includes(s) ? 1 : p.role.toLowerCase().includes(s) ? 2 : -1 }))
			.filter((m) => m.score >= 0)
			.sort((a, b) => a.score - b.score || a.p.name.localeCompare(b.p.name))
			.slice(0, 8)
			.map((m) => m.p)
	}, [q, people])
	useEffect(() => setQi(0), [q])
	const searchRef = useRef<HTMLInputElement>(null)
	useEffect(() => {
		const k = (e: KeyboardEvent) => {
			const t = e.target as HTMLElement | null
			if (e.key === "/" && !(t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable))) {
				e.preventDefault()
				searchRef.current?.focus()
			}
		}
		window.addEventListener("keydown", k)
		return () => window.removeEventListener("keydown", k)
	}, [])

	/* ---- settings ---- */
	const [page, setPage] = useState<"root" | "fields" | "color" | "start" | "filtered">("root")
	const extra = properties.filter((p) => p.id !== nameId && p.id !== relId)
	const colorable = properties.filter((p) => p.kind === "select" || p.kind === "status" || p.kind === "multi")
	const START = ["Leaders only", "One level open", "Two levels open", "Everything open"]
	const settings = (anchorEl: HTMLElement | null, close: () => void) => {
		const back = () => setPage("root")
		const shut = () => {
			setPage("root")
			close()
		}
		if (page === "fields")
			return (
				<SettingsShell anchor={anchorEl} onClose={shut} title="Card properties" onBack={back}>
					{extra.length === 0 ? <Note>Add properties to the People database (Team, Location, Start date…) to show them here.</Note> : null}
					{extra.map((p) => (
						<PickRow
							key={p.id}
							checkbox
							icon={<PropIcon type={p.type} />}
							label={p.name}
							selected={view.fields.includes(p.id)}
							onClick={() => setUi({ fields: view.fields.includes(p.id) ? view.fields.filter((x) => x !== p.id) : [...view.fields, p.id] })}
						/>
					))}
					<Note>Shown on every card in this order, below the name{roleId ? " and role" : ""}.</Note>
				</SettingsShell>
			)
		if (page === "color")
			return (
				<SettingsShell anchor={anchorEl} onClose={shut} title="Color cards by" onBack={back}>
					<PickRow label="None" selected={!view.colorBy} onClick={() => setUi({ colorBy: "" })} />
					{colorable.map((p) => (
						<PickRow key={p.id} icon={<PropIcon type={p.type} />} label={p.name} selected={view.colorBy === p.id} onClick={() => setUi({ colorBy: p.id })} />
					))}
					{colorable.length === 0 ? <Note>Add a select property (e.g. Team) to color the cards by it.</Note> : null}
				</SettingsShell>
			)
		if (page === "start")
			return (
				<SettingsShell anchor={anchorEl} onClose={shut} title="When the chart opens" onBack={back}>
					{START.map((label, i) => (
						<PickRow key={label} label={label} sub={i === 0 ? "Everyone else is folded under their manager" : undefined} selected={view.startOpen === (i === 3 ? 99 : i)} onClick={() => setUi({ startOpen: i === 3 ? 99 : i })} />
					))}
				</SettingsShell>
			)
		if (page === "filtered")
			return (
				<SettingsShell anchor={anchorEl} onClose={shut} title="People who don't match" onBack={back}>
					<PickRow label="Hide them" sub="Matches link up to their nearest shown manager" selected={view.filtered === "hide"} onClick={() => setUi({ filtered: "hide" })} />
					<PickRow label="Fade them" sub="Keep the whole tree, highlight the matches" selected={view.filtered === "dim"} onClick={() => setUi({ filtered: "dim" })} />
				</SettingsShell>
			)
		return (
			<SettingsShell anchor={anchorEl} onClose={shut} title="Org chart settings">
				<NavRow icon={<TableIcon />} label="Card properties" value={fields.length ? `${fields.length} shown` : "None"} onClick={() => setPage("fields")} />
				<NavRow icon={<LayersIcon />} label="Color by" value={colorProp?.name ?? "None"} onClick={() => setPage("color")} />
				<NavRow icon={<ColumnIcon />} label="On load" value={START[view.startOpen >= 99 ? 3 : view.startOpen] ?? START[0]} onClick={() => setPage("start")} />
				<NavRow icon={<TargetIcon />} label="Filtered people" value={view.filtered === "hide" ? "Hidden" : "Faded"} onClick={() => setPage("filtered")} />
				<Sep />
				<NumberRow label="Chart height" value={view.height} min={320} step={40} onChange={(v) => setUi({ height: Math.max(320, Math.min(4000, Math.round(v))) })} suffix="px" />
				<Note>
					{exitId
						? `People with an exit date are left out for everyone${leavers ? ` (${leavers} right now)` : ""}; their reports move up to the next manager.`
						: "Add an Exit date (date) to the People database to leave people who have left out of the chart."}
				</Note>
			</SettingsShell>
		)
	}

	/* ---- render ---- */
	const colorOf = (p: Person): string | undefined => {
		if (!colorProp) return undefined
		const name = asStrings(p.row.propertiesById[colorProp.id])[0]
		return name ? (colorProp.options.find((o) => o.value === name)?.color ?? "default") : undefined
	}
	const legend = colorProp ? colorProp.options.filter((o) => people.some((p) => asStrings(p.row.propertiesById[colorProp.id]).includes(o.value))) : []
	const dimOf = (p: Person) => (filtering && view.filtered === "dim" && !visible.has(p.id)) || (legendPick !== null && colorProp && !asStrings(p.row.propertiesById[colorProp.id]).includes(legendPick))
	const shown = layout.positions.size
	const matchCount = filtering ? people.filter((p) => visible.has(p.id)).length : people.length
	const sub = filtering ? `${matchCount} of ${all.length} people` : `${all.length} people`

	return (
		<div className="oc-wrap">
			<Toolbar
				title="Org chart"
				sub={sub}
				view={view}
				setView={setView}
				properties={properties}
				filtering={filtering}
				today={today}
				settings={settings}
				share={{ block: "orgchart", defaults: DEFAULT, schemas: src.propertySchemasById, sanitize }}
			/>
			<div
				ref={vpRef}
				className={"oc-vp" + (dragging ? " dragging" : "")}
				style={{ height: view.height }}
				onPointerDown={onDown}
				onPointerMove={onMove}
				onPointerUp={onUp}
				onPointerCancel={onUp}
				tabIndex={0}
				role="application"
				aria-label="Org chart. Drag to pan, Ctrl+scroll to zoom, / to search."
				onKeyDown={(e) => {
					if (e.target !== e.currentTarget) return
					const k = e.key
					if (k === "+" || k === "=") zoomStep(1)
					else if (k === "-") zoomStep(-1)
					else if (k === "0" || k.toLowerCase() === "f") fit()
					else if (k === "Escape") setSelected(null)
					else if (k.startsWith("Arrow")) setPan((v) => ({ ...v, tx: v.tx + (k === "ArrowLeft" ? 60 : k === "ArrowRight" ? -60 : 0), ty: v.ty + (k === "ArrowUp" ? 60 : k === "ArrowDown" ? -60 : 0) }))
					else return
					e.preventDefault()
				}}
			>
				{people.length === 0 ? (
					<div className="oc-empty">{filtering ? "Nobody matches the filters." : "No people yet. Add rows to the People database."}</div>
				) : null}
				<div className={"oc-world" + (moving ? " moving" : "")} style={{ transform: `translate(${pan.tx}px, ${pan.ty}px) scale(${pan.s})` }}>
					<svg className="oc-edges" width={Math.max(layout.width, 1)} height={Math.max(layout.height, 1)} aria-hidden="true">
						{layout.edges.map(({ from, to }) => {
							const a = layout.positions.get(from)!
							const b = layout.positions.get(to)!
							const skipped = forest.nodesById.get(to)!.person.skipped
							return <path key={to} className={"oc-edge" + (chain.has(to) ? " on" : "") + (skipped ? " skip" : "")} style={{ d: `path("${edgePath(a, b, size)}")` } as CSSProperties} />
						})}
					</svg>
					{[...layout.positions].map(([id, pos]) => {
						const node = forest.nodesById.get(id)!
						const p = node.person
						const isOpen = open.has(id)
						return (
							<Card
								key={id}
								p={p}
								x={pos.x}
								y={pos.y}
								size={size}
								tint={colorOf(p)}
								fields={fields}
								res={res}
								direct={node.directCount}
								total={node.totalCount}
								open={isOpen}
								selected={selected === id}
								inChain={chain.has(id)}
								dim={!!dimOf(p)}
								onToggle={() => toggle(id)}
								onSelect={() => {
									if (panRef.current.s < 0.75) centerOn(id, 1)
									setSelected((s) => (s === id ? null : id))
								}}
								onHover={(h) => setHovered((c) => (h ? id : c === id ? null : c))}
							/>
						)
					})}
				</div>

				<div className="oc-search oc-ui">
					<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
						<circle cx="7" cy="7" r="4.5" />
						<path d="m10.5 10.5 3 3" />
					</svg>
					<input
						ref={searchRef}
						value={q}
						placeholder="Find someone…  /"
						aria-label="Find a person"
						onChange={(e) => setQ(e.target.value)}
						onKeyDown={(e) => {
							if (e.key === "ArrowDown") setQi((i) => Math.min(i + 1, matches.length - 1))
							else if (e.key === "ArrowUp") setQi((i) => Math.max(i - 1, 0))
							else if (e.key === "Enter" && matches[qi]) {
								reveal(matches[qi].id)
								setQ("")
							} else if (e.key === "Escape") setQ("")
							else return
							e.preventDefault()
						}}
					/>
					{matches.length ? (
						<div className="oc-matches" role="listbox">
							{matches.map((m, i) => (
								<button
									key={m.id}
									type="button"
									role="option"
									aria-selected={i === qi}
									className={i === qi ? "on" : ""}
									onMouseEnter={() => setQi(i)}
									onClick={() => {
										reveal(m.id)
										setQ("")
									}}
								>
									<Face p={m} small />
									<span className="oc-m-n">{m.name}</span>
									<span className="oc-m-r">{m.role}</span>
								</button>
							))}
						</div>
					) : null}
				</div>

				{legend.length ? (
					<div className="oc-legend oc-ui">
						{legend.map((o) => (
							<button key={o.value} type="button" className={legendPick === o.value ? "on" : legendPick ? "off" : ""} title={`Highlight ${o.value}`} onClick={() => setLegendPick((c) => (c === o.value ? null : o.value))}>
								<span className={`oc-swatch dot-${(o.color ?? "default").replace(/_background$/, "")}`} />
								{o.label}
							</button>
						))}
					</div>
				) : null}

				<div className="oc-controls oc-ui">
					<button type="button" title="Fold everyone under their manager" onClick={() => setOpen(new Set())}>
						Fold all
					</button>
					<button type="button" title="Open every team" onClick={() => setOpen(managers(people))}>
						Open all
					</button>
					<span className="oc-sep" />
					<button type="button" aria-label="Zoom out" onClick={() => zoomStep(-1)}>
						−
					</button>
					<button type="button" className="oc-z" title="Fit the chart (0)" onClick={fit}>
						{Math.round(pan.s * 100)}%
					</button>
					<button type="button" aria-label="Zoom in" onClick={() => zoomStep(1)}>
						+
					</button>
				</div>
				<span className="oc-count" aria-live="polite">
					{shown} of {people.length} on screen
				</span>
			</div>
		</div>
	)
}

function edgePath(a: { x: number; y: number }, b: { x: number; y: number }, size: Size): string {
	const sx = a.x + size.w / 2
	const sy = a.y + size.h + 14
	const ex = b.x + size.w / 2
	const ey = b.y
	const midY = sy + (ey - sy) / 2
	const dx = ex - sx
	const r = Math.min(12, Math.abs(dx) / 2, Math.abs(ey - midY))
	const dir = dx >= 0 ? 1 : -1
	// Always the same command list, so CSS can animate between shapes.
	return `M ${sx} ${sy} L ${sx} ${midY - r} Q ${sx} ${midY} ${sx + dir * r} ${midY} L ${ex - dir * r} ${midY} Q ${ex} ${midY} ${ex} ${midY + r} L ${ex} ${ey}`
}

function Face({ p, small }: { p: Person; small?: boolean }) {
	const hue = hueFor(p.id)
	return (
		<span className={"oc-face" + (small ? " sm" : "")} style={{ background: `var(--t-${hue})`, color: `var(--d-${hue})` }} aria-hidden="true">
			{initials(p.name)}
		</span>
	)
}

type CardProps = {
	p: Person
	x: number
	y: number
	size: Size
	tint?: string
	fields: FilterProperty[]
	res: Resolvers
	direct: number
	total: number
	open: boolean
	selected: boolean
	inChain: boolean
	dim: boolean
	onToggle: () => void
	onSelect: () => void
	onHover: (h: boolean) => void
}

function Card({ p, x, y, size, tint, fields, res, direct, total, open, selected, inChain, dim, onToggle, onSelect, onHover }: CardProps) {
	const c = tint?.replace(/_background$/, "")
	return (
		<div
			className={"oc-node" + (dim ? " dim" : "")}
			style={{ transform: `translate(${x}px, ${y}px)`, width: size.w } as CSSProperties}
			onPointerEnter={() => onHover(true)}
			onPointerLeave={() => onHover(false)}
		>
			{p.via ? (
				<div className="oc-via" title={`Reports to ${p.via} (hidden by the filters)`}>
					↑ {p.via}
				</div>
			) : null}
			<div
				className={"oc-card" + (selected ? " sel" : "") + (inChain ? " chain" : "")}
				style={{ height: size.h, ...(c ? { "--tint": `var(--d-${c})`, "--tint-bg": `var(--t-${c})` } : {}) } as CSSProperties}
				role="button"
				tabIndex={0}
				aria-pressed={selected}
				onClick={onSelect}
				onKeyDown={(e) => {
					if (e.key === "Enter" || e.key === " ") {
						e.preventDefault()
						onSelect()
					} else if ((e.key === "ArrowDown" && !open) || (e.key === "ArrowUp" && open)) {
						if (direct) {
							e.preventDefault()
							onToggle()
						}
					}
				}}
			>
				{c ? <span className="oc-stripe" /> : null}
				<div className="oc-head">
					<Face p={p} />
					<div className="oc-who">
						<div className="oc-name" title={p.name}>
							{p.name}
						</div>
						{p.role ? (
							<div className="oc-role" title={p.role}>
								{p.role}
							</div>
						) : null}
					</div>
				</div>
				{fields.length ? (
					<div className="oc-fields">
						{fields.map((f) => (
							<div key={f.id} className="oc-field" title={f.name}>
								<PropIcon type={f.type} size={12} />
								<FieldValue f={f} v={p.row.propertiesById[f.id]} res={res} />
							</div>
						))}
					</div>
				) : null}
			</div>
			{selected && direct ? (
				<div className="oc-stats">
					{direct} direct · {total} total
				</div>
			) : null}
			{direct ? (
				<button type="button" className={"oc-pill oc-ui" + (open ? " open" : "")} aria-expanded={open} title={open ? "Fold this team" : `Show ${direct} direct report${direct === 1 ? "" : "s"}`} onClick={onToggle}>
					{open ? (
						<svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
							<path d="M2 6.5 5 3.5l3 3" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
						</svg>
					) : (
						<>
							<span className="oc-stack" aria-hidden="true" />
							{total}
						</>
					)}
				</button>
			) : null}
		</div>
	)
}

function FieldValue({ f, v, res }: { f: FilterProperty; v: unknown; res: Resolvers }): ReactNode {
	const empty = <span className="oc-nil">—</span>
	switch (f.kind) {
		case "select":
		case "status":
		case "multi": {
			const names = asStrings(v)
			if (!names.length) return empty
			return (
				<span className="oc-tags">
					{names.map((n) => (
						<Tag key={n} color={f.options.find((o) => o.value === n)?.color}>
							{n}
						</Tag>
					))}
				</span>
			)
		}
		case "person": {
			const names = pointerIds(v).map((id) => res.userName(id) ?? "Someone")
			return names.length ? <span className="oc-txt">{names.join(", ")}</span> : empty
		}
		case "relation": {
			const names = pointerIds(v).map((id) => res.pageTitle(id) ?? "Untitled")
			return names.length ? <span className="oc-txt">{names.join(", ")}</span> : empty
		}
		case "date": {
			const d = dateOf(v)
			return d ? <span className="oc-txt">{formatDay(d.start)}</span> : empty
		}
		case "checkbox":
			return checkboxOf(v) ? <span className="oc-txt">✓ {f.name}</span> : empty
		default: {
			const t = textOf(v).trim()
			return t ? <span className="oc-txt">{t}</span> : empty
		}
	}
}

