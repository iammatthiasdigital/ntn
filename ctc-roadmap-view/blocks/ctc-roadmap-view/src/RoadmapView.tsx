/**
 * CTC mandate roadmap in the shared Notion UI: the kit's top bar (title,
 * filter, settings, share), Notion-style filter bar over the Features
 * database, settings popover, and two boards — a quarterly kanban and a
 * country coverage key — that export as PNG.
 */
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react"
import { pages } from "@notionhq/custom-blocks"
import { accentFor, DONE_SOFT_ALPHA, TODO_SOFT_ALPHA, withAlpha } from "./colors"
import { flagEmoji } from "./countries"
import { dayIso } from "./kit/filters/core"
import { ColumnIcon, LayersIcon, NavRow, Note, PickRow, Sep, SettingsShell, TableIcon, TargetIcon, ToggleRow } from "./kit/settings"
import type { BlockData, SourceSnapshot } from "./kit/sources"
import { Loading, Setup, Toolbar, useFiltered, usePersistentView } from "./kit/toolbar"
import {
	ALL_TERM,
	availableYears,
	defaultYear,
	featuresForQuarter,
	filterOptions,
	fitTo169,
	isQuarterComplete,
	makeContext,
	joinedText,
	relationIds,
	rowsToCoverage,
	rowsToFeatures,
	unscheduledCount,
} from "./roadmap"
import { initialView, sanitize, type View } from "./settings"
import type { Coverage, Feature, FeatureIcon, RawRow } from "./types"

export type Keys = "features" | "products"
type Ready = Extract<BlockData<Keys>, { status: "ready" }>

const QUARTERS = [1, 2, 3, 4] as const
/** 1×1 transparent PNG for images the exporter can't fetch (CORS). */
const IMAGE_PLACEHOLDER = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=="

export function RoadmapView({ data, theme }: { data: BlockData<Keys>; theme: "light" | "dark" }) {
	return (
		<div className="nb ctc" data-theme={theme}>
			{data.status === "loading" ? (
				<Loading what="mandates" />
			) : data.status === "unbound" ? (
				<Setup title="Connect a Features database to show the mandate roadmap." missing={data.missing}>
					<li>
						<b>Features</b>: Name (title), Tags (multi-select), Product (relation), ETA (date), Country (text: FR or France), Scopes (multi-select), Sales status
						(status).
					</li>
					<li>
						<b>Products</b> (optional): the database the Product relation points to, so product names can be read.
					</li>
				</Setup>
			) : (
				<Ready data={data} theme={theme} />
			)}
		</div>
	)
}

const rawRow = (src: SourceSnapshot, id: string, byKey: Record<string, unknown>): RawRow => ({
	id,
	title: byKey.name,
	tags: src.propertyIdsByKey.tags ? byKey.tags : undefined,
	product: byKey.product,
	eta: byKey.eta,
	country: byKey.country,
	scopes: byKey.scopes,
	salesStatus: byKey.salesStatus,
})

/** Page icons (flags) for the rows on screen, fetched once each, https only. */
function useIcons(ids: string[], enabled: boolean): ReadonlyMap<string, FeatureIcon | null> {
	const [icons, setIcons] = useState<ReadonlyMap<string, FeatureIcon | null>>(new Map())
	const asked = useRef(new Set<string>())
	const key = ids.join("\n")
	useEffect(() => {
		if (!enabled) return
		const todo = ids.filter((id) => !asked.current.has(id)).slice(0, 200)
		if (!todo.length) return
		for (const id of todo) asked.current.add(id)
		let cancelled = false
		void (async () => {
			const found = new Map<string, FeatureIcon | null>()
			const queue = [...todo]
			await Promise.all(
				Array.from({ length: 5 }, async () => {
					for (let id = queue.shift(); id !== undefined; id = queue.shift()) {
						try {
							const r = await pages.get(id as Parameters<typeof pages.get>[0])
							found.set(id, r.status === "success" ? toIcon(r.page.icon as IconLike) : null)
						} catch {
							found.set(id, null)
						}
					}
				})
			)
			if (!cancelled) setIcons((prev) => new Map([...prev, ...found]))
		})()
		return () => {
			cancelled = true
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [key])
	return icons
}

type IconLike = { type?: string; emoji?: string; external?: { url?: string }; file?: { url?: string } } | null | undefined
function toIcon(icon: IconLike): FeatureIcon | null {
	if (!icon) return null
	if (icon.type === "emoji" && icon.emoji) return { type: "emoji", emoji: icon.emoji }
	const url = icon.type === "external" ? icon.external?.url : icon.type === "file" ? icon.file?.url : undefined
	try {
		return url && new URL(url).protocol === "https:" ? { type: "url", url } : null
	} catch {
		return null
	}
}

type Page = "root" | "view" | "tags" | "product" | "available" | "roadmap" | "colors" | "export"

function Ready({ data, theme }: { data: Ready; theme: "light" | "dark" }) {
	const defaults = useMemo(initialView, [])
	const [view, setView] = usePersistentView(data.storageKey, defaults)
	const setUi = (f: Partial<View>) => setView((v) => ({ ...v, ...f }))
	const today = useMemo(() => dayIso(new Date()), [])
	const now = useMemo(() => new Date(), [])
	const src = data.sources.features
	const { properties, visible, filtering } = useFiltered(src, view.filters, data.resolvers, today)
	const bound = (k: string) => src.propertyIdsByKey[k] !== undefined

	/* ---- rows, product names, scope ---- */
	const allRows = useMemo(() => src.items.map((r) => rawRow(src, r.id, r.propertiesByKey)), [src])
	const rows = useMemo(() => (filtering ? allRows.filter((r) => visible.has(r.id)) : allRows), [allRows, visible, filtering])
	const productIds = useMemo(() => [...new Set(allRows.flatMap((r) => relationIds(r.product)))], [allRows])
	const titles = useMemo(() => new Map(productIds.map((id) => [id, data.resolvers.pageTitle(id) ?? null])), [productIds, data.resolvers])
	// Product titles resolve lazily; give them a moment before calling rows unreadable.
	const [grace, setGrace] = useState(true)
	useEffect(() => {
		const t = window.setTimeout(() => setGrace(false), 4000)
		return () => window.clearTimeout(t)
	}, [])
	const pending = grace && bound("product") && productIds.some((id) => titles.get(id) == null)
	const context = useMemo(
		() =>
			makeContext({
				tagsBound: bound("tags"),
				productBound: bound("product"),
				scopesBound: false,
				statusBound: bound("salesStatus"),
				tagTerms: view.tagTerms,
				productTerms: view.productTerms,
				availableTerms: view.availableTerms,
				roadmapTerms: view.roadmapTerms,
				productTitleById: titles,
			}),
		// eslint-disable-next-line react-hooks/exhaustive-deps
		[src.propertyIdsByKey, view.tagTerms, view.productTerms, view.availableTerms, view.roadmapTerms, titles]
	)
	const board = useMemo(() => rowsToFeatures(rows, context), [rows, context])
	const cov = useMemo(() => rowsToCoverage(rows, context), [rows, context])
	const options = useMemo(() => filterOptions(allRows, titles), [allRows, titles])
	const icons = useIcons(useMemo(() => [...board.features, ...cov.available, ...cov.roadmap].map((f) => f.id), [board, cov]), !data.storageKey.endsWith(":mock"))
	const withIcon = (f: Feature): Feature => ({ ...f, icon: icons.get(f.id) ?? undefined })
	const features = useMemo(() => board.features.map(withIcon), [board, icons]) // eslint-disable-line react-hooks/exhaustive-deps
	const coverage: Coverage = useMemo(() => ({ available: cov.available.map(withIcon), roadmap: cov.roadmap.map(withIcon) }), [cov, icons]) // eslint-disable-line react-hooks/exhaustive-deps

	/* ---- rows in scope that can't be placed ---- */
	const missing = useMemo(() => {
		const byId = new Map(rows.map((r) => [r.id, r]))
		const name = (r: RawRow) => joinedText(r.title) || "Untitled"
		const out = new Map<string, Missing>()
		const add = (r: RawRow, p: string) => {
			const m = out.get(r.id) ?? { id: r.id, name: name(r), missing: [] }
			if (!m.missing.includes(p)) m.missing.push(p)
			out.set(r.id, m)
		}
		// In scope without the product check: unreadable products show up here.
		const loose = rowsToFeatures(rows, { ...context, productBound: false })
		const inScope = new Set(board.features.map((f) => f.id))
		const onCoverage = new Set([...cov.available, ...cov.roadmap].map((f) => f.id))
		for (const f of loose.features) {
			const r = byId.get(f.id)!
			if (!inScope.has(f.id)) {
				if (bound("product") && relationIds(r.product).some((id) => titles.get(id) == null)) add(r, "readable Product")
				continue
			}
			if (!joinedText(r.country) && !f.iso2) add(r, "Country")
			// Each board lists what it needs; a row the other board shows isn't missing.
			if (view.view === "kanban" && !f.eta && !onCoverage.has(f.id)) add(r, "ETA")
			if (view.view === "coverage" && bound("salesStatus") && !joinedText(r.salesStatus) && !f.eta) add(r, "Sales status")
		}
		return [...out.values()].sort((a, b) => a.name.localeCompare(b.name))
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [rows, context, board, cov, titles, view.view])

	/* ---- year ---- */
	const years = useMemo(() => availableYears(features), [features])
	const [picked, setPicked] = useState<number | null>(null)
	const year = picked ?? defaultYear(years, now)
	const yearList = useMemo(() => [...new Set([...years, year])].sort((a, b) => a - b), [years, year])
	const yi = yearList.indexOf(year)

	/* ---- export ---- */
	const boardRef = useRef<HTMLDivElement>(null)
	const [exporting, setExporting] = useState(false)
	const [exportFailed, setExportFailed] = useState(false)
	const [preview, setPreview] = useState<{ url: string; w: number; h: number; name: string } | null>(null)
	const exportPng = async () => {
		const target = boardRef.current?.querySelector(".ctc-exportable")
		if (!(target instanceof HTMLElement) || exporting) return
		setExporting(true)
		setExportFailed(false)
		const mr = target.closest(".mr")
		mr?.classList.add("is-exporting")
		try {
			void target.offsetWidth
			const w = target.offsetWidth
			const h = target.offsetHeight
			const { toSvg } = await import("html-to-image")
			const svg = await toSvg(target, { imagePlaceholder: IMAGE_PLACEHOLDER })
			const img = await new Promise<HTMLImageElement>((ok, fail) => {
				const i = new Image()
				i.onload = () => ok(i)
				i.onerror = fail
				i.src = svg
			})
			const size = view.exportSlide ? fitTo169(w * 2, h * 2) : { width: w * 2, height: h * 2 }
			const canvas = document.createElement("canvas")
			canvas.width = size.width
			canvas.height = size.height
			const ctx = canvas.getContext("2d")
			if (!ctx) throw new Error("no canvas")
			ctx.drawImage(img, Math.round((size.width - w * 2) / 2), Math.round((size.height - h * 2) / 2), w * 2, h * 2)
			setPreview({ url: canvas.toDataURL("image/png"), w: size.width, h: size.height, name: view.view === "kanban" ? `ctc-roadmap-${year}.png` : "ctc-coverage.png" })
		} catch {
			setExportFailed(true)
		} finally {
			mr?.classList.remove("is-exporting")
			setExporting(false)
		}
	}

	/* ---- settings ---- */
	const [page, setPage] = useState<Page>("root")
	const terms = (label: string, values: string[], sel: string[], allMode: "empty" | "sentinel", set: (t: string[]) => void, note: string) => {
		const own = sel.filter((s) => s !== ALL_TERM)
		const all = allMode === "empty" ? own.length === 0 : sel.includes(ALL_TERM)
		const has = (v: string) => own.some((s) => s.trim().toLowerCase() === v.trim().toLowerCase())
		return (
			<>
				<PickRow label="All" sub={allMode === "empty" ? "Filter off" : "Any value"} checkbox selected={all} onClick={() => set(allMode === "empty" ? [] : [ALL_TERM])} />
				<Sep />
				{values.map((v) => (
					<PickRow
						key={v}
						label={v}
						checkbox
						selected={!all && has(v)}
						onClick={() => set(all ? [v] : has(v) ? own.filter((s) => s.trim().toLowerCase() !== v.trim().toLowerCase()) : [...own, v])}
					/>
				))}
				{values.length === 0 ? <Note>No {label.toLowerCase()} in the database yet.</Note> : <Note>{note}</Note>}
			</>
		)
	}
	const summary = (sel: string[], allMode: "empty" | "sentinel") => (allMode === "empty" ? sel.length === 0 : sel.includes(ALL_TERM)) ? "All" : sel.length === 0 ? "None" : sel.length <= 2 ? sel.join(", ") : `${sel.length} selected`
	const settings = (anchor: HTMLElement | null, close: () => void) => {
		const shut = () => {
			setPage("root")
			close()
		}
		const back = () => setPage("root")
		const shell = (title: string, body: React.ReactNode) => (
			<SettingsShell anchor={anchor} onClose={shut} title={title} onBack={back}>
				{body}
			</SettingsShell>
		)
		switch (page) {
			case "view":
				return shell(
					"Board",
					<>
						<PickRow label="Roadmap" sub="Mandates by quarter of their ETA" selected={view.view === "kanban"} onClick={() => setUi({ view: "kanban" })} />
						<PickRow label="Coverage" sub="Countries by sales status" selected={view.view === "coverage"} onClick={() => setUi({ view: "coverage" })} />
					</>
				)
			case "tags":
				return shell("Tags", terms("Tags", options.tags, view.tagTerms, "empty", (t) => setUi({ tagTerms: t }), "Rows with any of these tags are on the board (any case)."))
			case "product":
				return shell("Product", terms("Products", options.products, view.productTerms, "empty", (t) => setUi({ productTerms: t }), "Singular and plural both match."))
			case "available":
				return shell("“Available” statuses", terms("Statuses", options.statuses, view.availableTerms, "sentinel", (t) => setUi({ availableTerms: t }), "Coverage: countries in the Available lane."))
			case "roadmap":
				return shell("“Roadmap” statuses", terms("Statuses", options.statuses, view.roadmapTerms, "sentinel", (t) => setUi({ roadmapTerms: t }), "Coverage: countries in the Roadmap lane."))
			case "colors":
				return shell(
					"Colors",
					<>
						<ColorRow label="Delivered · Roadmap" value={view.done} onChange={(done) => setUi({ done })} />
						<ColorRow label="Upcoming · Available" value={view.todo} onChange={(todo) => setUi({ todo })} />
						<Sep />
						<PickRow label="ecosio defaults" sub="Lime and blue" selected={false} onClick={() => setUi({ done: "#def15d", todo: "#0054ff" })} />
					</>
				)
			case "export":
				return shell(
					"Export format",
					<>
						<PickRow label="16:9 slide canvas" sub="Padded so it drops onto a slide" selected={view.exportSlide} onClick={() => setUi({ exportSlide: true })} />
						<PickRow label="Natural size" selected={!view.exportSlide} onClick={() => setUi({ exportSlide: false })} />
					</>
				)
		}
		return (
			<SettingsShell anchor={anchor} onClose={shut} title="Roadmap settings">
				<NavRow icon={<ColumnIcon />} label="Board" value={view.view === "kanban" ? "Roadmap" : "Coverage"} onClick={() => setPage("view")} />
				<Sep />
				<NavRow icon={<TargetIcon />} label="Tags" value={bound("tags") ? summary(view.tagTerms, "empty") : "Not mapped"} onClick={() => setPage("tags")} />
				<NavRow icon={<TargetIcon />} label="Product" value={bound("product") ? summary(view.productTerms, "empty") : "Not mapped"} onClick={() => setPage("product")} />
				<NavRow icon={<TableIcon />} label="“Available” statuses" value={summary(view.availableTerms, "sentinel")} onClick={() => setPage("available")} />
				<NavRow icon={<TableIcon />} label="“Roadmap” statuses" value={summary(view.roadmapTerms, "sentinel")} onClick={() => setPage("roadmap")} />
				<Sep />
				<NavRow icon={<LayersIcon />} label="Colors" onClick={() => setPage("colors")} />
				<ToggleRow label="Show items with missing properties" sub="A list under the board: rows in scope without an ETA, country, sales status or readable product" on={view.showMissing} onChange={(v) => setUi({ showMissing: v })} />
				<Sep />
				<NavRow icon={<LayersIcon />} label="Export format" value={view.exportSlide ? "16:9 slide" : "Natural size"} onClick={() => setPage("export")} />
				<Note>Use the filter button for anything else, e.g. Scopes contains B2B.</Note>
			</SettingsShell>
		)
	}

	const style = {
		"--mr-done-border": view.done,
		"--mr-done-bg": withAlpha(view.done, DONE_SOFT_ALPHA),
		"--mr-done-accent": accentFor(view.done, theme),
		"--mr-todo-border": view.todo,
		"--mr-todo-bg": withAlpha(view.todo, TODO_SOFT_ALPHA),
		"--mr-todo-accent": accentFor(view.todo, theme),
		"--lane-done": view.done,
		"--lane-done-bg": withAlpha(view.done, DONE_SOFT_ALPHA),
		"--lane-done-ink": accentFor(view.done, theme),
		"--lane-todo": view.todo,
		"--lane-todo-bg": withAlpha(view.todo, TODO_SOFT_ALPHA),
		"--lane-todo-ink": accentFor(view.todo, theme),
	} as CSSProperties
	const kanban = view.view === "kanban"
	const count = kanban ? features.filter((f) => f.eta?.year === year).length : coverage.available.length + coverage.roadmap.length
	const notes: string[] = []
	if (src.truncated) notes.push("Only the first 999 rows could be read, so the board may be incomplete.")
	const unscheduled = unscheduledCount(features)
	const unreadable = Math.max(board.unreadableProduct, cov.unreadableProduct)
	if (!view.showMissing && (unscheduled || unreadable) && !pending)
		notes.push(`${unscheduled + unreadable} matching item${unscheduled + unreadable === 1 ? " is" : "s are"} missing properties and not shown. Turn on “Show items with missing properties” in the settings to list them.`)
	const unmapped = [bound("tags") ? "" : "Tags", bound("product") ? "" : "Product"].filter(Boolean)
	if (unmapped.length) notes.push(`${unmapped.join(" and ")} ${unmapped.length === 1 ? "is" : "are"} not mapped, so that filter is off.`)

	return (
		<div ref={boardRef} style={style}>
			<Toolbar
				title={kanban ? `Mandate roadmap ${year}` : "Country coverage"}
				sub={kanban ? `${count} mandate${count === 1 ? "" : "s"}` : `${count} countr${count === 1 ? "y" : "ies"}`}
				view={view}
				setView={setView}
				properties={properties}
				filtering={filtering}
				today={today}
				settings={settings}
				actions={
					<button type="button" className="tool" title={exporting ? "Exporting…" : "Export PNG"} aria-label="Export PNG" disabled={exporting} onClick={() => void exportPng()}>
						<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.25} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
							<path d="M8 2.5v8M5 7.5l3 3 3-3M3 12.5h10" />
						</svg>
					</button>
				}
				share={{ block: "ctc-roadmap", defaults, schemas: src.propertySchemasById, sanitize }}
			/>
			<div className="daybar">
				<div className="seg" role="radiogroup" aria-label="Board">
					<button type="button" role="radio" aria-checked={kanban} onClick={() => setUi({ view: "kanban" })}>
						Roadmap
					</button>
					<button type="button" role="radio" aria-checked={!kanban} onClick={() => setUi({ view: "coverage" })}>
						Coverage
					</button>
				</div>
				{kanban ? (
					<>
						<button type="button" className="ghost ic" aria-label="Previous year" disabled={yi <= 0} onClick={() => setPicked(yearList[yi - 1])}>
							‹
						</button>
						<select className="sel quiet ctc-year" aria-label="Year" value={year} onChange={(e) => setPicked(Number(e.target.value))}>
							{yearList.map((y) => (
								<option key={y} value={y}>
									{y}
								</option>
							))}
						</select>
						<button type="button" className="ghost ic" aria-label="Next year" disabled={yi >= yearList.length - 1} onClick={() => setPicked(yearList[yi + 1])}>
							›
						</button>
					</>
				) : null}
				<span className="spacer" />
				<span className="ctc-key">
					<i style={{ background: view.done }} /> {kanban ? "Delivered" : "Roadmap"}
					<i style={{ background: view.todo }} /> {kanban ? "Upcoming" : "Available"}
				</span>
				{exportFailed ? <span className="ctc-err">Export failed</span> : null}
			</div>
			{pending ? (
				<Loading what="product names" />
			) : !kanban && !bound("salesStatus") ? (
				<div className="setup">Map the Sales status property of the Features database to use the coverage board.</div>
			) : (
				<div className="mr" data-theme={theme}>
					{kanban ? <Kanban features={features} year={year} now={now} /> : <CoverageBoard coverage={coverage} />}
				</div>
			)}
			{view.showMissing && missing.length > 0 && !pending ? <MissingList items={missing} /> : null}
			{notes.length ? (
				<div className="ctc-notes">
					{notes.map((n) => (
						<div key={n}>{n}</div>
					))}
				</div>
			) : null}
			{preview ? <ExportPreview p={preview} onClose={() => setPreview(null)} /> : null}
		</div>
	)
}

function ColorRow({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
	return (
		<label className="srow">
			<span className="srow-ic">
				<span className="ctc-swatch" style={{ background: value }} />
			</span>
			<span className="srow-l">{label}</span>
			<input className="ctc-color" type="color" value={value} onChange={(e) => onChange(e.target.value)} />
		</label>
	)
}

function Kanban({ features, year, now }: { features: Feature[]; year: number; now: Date }) {
	return (
		<div className="mr-board ctc-exportable">
			{QUARTERS.map((q) => {
				const done = isQuarterComplete(year, q, now)
				const items = featuresForQuarter(features, year, q)
				return (
					<section key={q} className={`mr-col ${done ? "is-complete" : "is-upcoming"}`} aria-label={`Q${q} ${year}${done ? " (completed)" : ""}`}>
						<h2 className="mr-col-title">
							Q{q} {year}
						</h2>
						<div className="mr-col-rule" />
						{items.length === 0 ? (
							<div className="mr-col-empty">No mandates</div>
						) : (
							<div className="mr-cards">
								{items.map((f) => (
									<article key={f.id} className="mr-card">
										<div className="mr-card-flag" aria-hidden="true">
											<Flag f={f} />
										</div>
										<div className="mr-card-country">{f.countryName}</div>
										{f.scopes.length > 0 && <div className="mr-card-scopes">({f.scopes.join(", ")})</div>}
									</article>
								))}
							</div>
						)}
					</section>
				)
			})}
		</div>
	)
}

function CoverageBoard({ coverage }: { coverage: Coverage }) {
	const panel = (kind: "available" | "roadmap", title: string, items: Feature[]) => (
		<section className={`mr-cov-panel is-${kind}`} aria-label={title}>
			<h2 className="mr-cov-head">{title}</h2>
			{items.length === 0 ? (
				<div className="mr-col-empty">No countries</div>
			) : (
				<div className="mr-cov-grid">
					{items.map((f) => (
						<div key={f.id} className="mr-cov-pill">
							<span className="mr-cov-flag" aria-hidden="true">
								<Flag f={f} />
							</span>
							<span className="mr-cov-name">{f.countryName}</span>
						</div>
					))}
				</div>
			)}
		</section>
	)
	return (
		<div className="mr-coverage ctc-exportable">
			{panel("available", "Available", coverage.available)}
			{panel("roadmap", "Roadmap", coverage.roadmap)}
		</div>
	)
}

function Flag({ f }: { f: Feature }) {
	if (f.icon?.type === "url") return <img className="mr-card-flag-img" src={f.icon.url} alt="" referrerPolicy="no-referrer" loading="lazy" />
	if (f.icon?.type === "emoji") return <span className="mr-card-flag-emoji">{f.icon.emoji}</span>
	return <span className="mr-card-flag-emoji">{f.iso2 ? flagEmoji(f.iso2) : "🌐"}</span>
}

type Missing = { id: string; name: string; missing: string[] }

/** The rows that pass the board's scope but can't be placed: what each one is missing. */
function MissingList({ items }: { items: Missing[] }) {
	return (
		<details className="ctc-missing" open>
			<summary>
				Missing properties<span>{items.length} item{items.length === 1 ? "" : "s"} missing or incomplete on the board</span>
			</summary>
			<ul>
				{items.map((m) => (
					<li key={m.id}>
						<b>{m.name}</b>
						{m.missing.map((p) => (
							<span key={p} className="tag tag-red">
								no {p}
							</span>
						))}
					</li>
				))}
			</ul>
		</details>
	)
}

function ExportPreview({ p, onClose }: { p: { url: string; w: number; h: number; name: string }; onClose: () => void }) {
	return (
		<div className="ctc-modal-bg" onClick={onClose}>
			<div className="ctc-modal" role="dialog" aria-label="Export preview" onClick={(e) => e.stopPropagation()}>
				<div className="shead">
					<span className="shead-t">{p.name}</span>
					<span className="muted">
						{p.w} × {p.h}
					</span>
				</div>
				<img className="ctc-modal-img" src={p.url} alt="Exported board" />
				<p className="snote">Notion blocks downloads from blocks: right-click the image and choose Copy image or Save image as….</p>
				<div className="sh-row" style={{ padding: "0 12px 12px", justifyContent: "flex-end" }}>
					<button type="button" className="sh-btn primary" onClick={onClose}>
						Done
					</button>
				</div>
			</div>
		</div>
	)
}
