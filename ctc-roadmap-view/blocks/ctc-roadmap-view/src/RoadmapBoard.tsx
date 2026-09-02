import { useMemo, useState } from "react"
import {
	DEFAULT_DONE_COLOR,
	DEFAULT_TODO_COLOR,
	DONE_SOFT_ALPHA,
	TODO_SOFT_ALPHA,
	accentFor,
	isHexColor,
	withAlpha,
} from "./colors"
import { flagEmoji } from "./countries"
import { MOCK_FEATURES, MOCK_PRODUCT_TITLES, MOCK_ROWS } from "./mockData"
import {
	ALL_TERM,
	availableYears,
	defaultYear,
	featuresForQuarter,
	filterOptions,
	fitTo169,
	isQuarterComplete,
	makeContext,
	rowsToCoverage,
	unscheduledCount,
	type FilterOptions,
} from "./roadmap"
import type { BlockSettings } from "./settings"
import type { Coverage, Feature, RoadmapDataState } from "./types"

const QUARTERS = [1, 2, 3, 4] as const
const COLOR_STORAGE_KEY = "ctc-roadmap-colors"

/** 1×1 transparent PNG for images the exporter can't fetch (CORS). */
const IMAGE_PLACEHOLDER =
	"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=="

type LaneColors = { done: string; todo: string }

function loadColors(): LaneColors {
	try {
		const raw = window.localStorage.getItem(COLOR_STORAGE_KEY)
		if (raw) {
			const parsed = JSON.parse(raw) as Partial<LaneColors>
			return {
				done: isHexColor(parsed.done) ? parsed.done : DEFAULT_DONE_COLOR,
				todo: isHexColor(parsed.todo) ? parsed.todo : DEFAULT_TODO_COLOR,
			}
		}
	} catch {
		// Storage unavailable in this sandbox — fall through to defaults.
	}
	return { done: DEFAULT_DONE_COLOR, todo: DEFAULT_TODO_COLOR }
}

function storeColors(colors: LaneColors): void {
	try {
		window.localStorage.setItem(COLOR_STORAGE_KEY, JSON.stringify(colors))
	} catch {
		// Best effort only.
	}
}

type ContentData = {
	features: Feature[]
	coverage: Coverage
	statusBound: boolean
	filterOptions: FilterOptions
	notes?: BoardNotes
}

type ExportPreview = {
	dataUrl: string
	width: number
	height: number
	slide: boolean
	name: string
}

type BoardNotes = {
	truncated?: boolean
	unreadableProduct?: number
	unboundFilters?: string[]
}

export function RoadmapBoard({
	data,
	theme,
	settings,
	onSettingsChange,
	now = new Date(),
}: {
	data: RoadmapDataState
	theme: "light" | "dark"
	settings: BlockSettings
	onSettingsChange: (next: BlockSettings) => void
	now?: Date
}): React.ReactNode {
	const [colors, setColors] = useState<LaneColors>(loadColors)
	function updateColors(next: LaneColors): void {
		setColors(next)
		storeColors(next)
	}
	const styleVars = {
		"--mr-done-border": colors.done,
		"--mr-done-bg": withAlpha(colors.done, DONE_SOFT_ALPHA),
		"--mr-done-accent": accentFor(colors.done, theme),
		"--mr-todo-border": colors.todo,
		"--mr-todo-bg": withAlpha(colors.todo, TODO_SOFT_ALPHA),
		"--mr-todo-accent": accentFor(colors.todo, theme),
	} as React.CSSProperties

	const sample = useMemo<ContentData>(() => {
		const coverage = rowsToCoverage(
			MOCK_ROWS,
			makeContext({ productTitleById: MOCK_PRODUCT_TITLES })
		)
		return {
			features: MOCK_FEATURES,
			coverage: { available: coverage.available, roadmap: coverage.roadmap },
			statusBound: true,
			filterOptions: filterOptions(MOCK_ROWS, MOCK_PRODUCT_TITLES),
		}
	}, [])

	if (data.status === "loading") {
		return (
			<Shell theme={theme} style={styleVars}>
				<div className="mr-status">Loading mandates…</div>
			</Shell>
		)
	}
	if (data.status === "empty") {
		return (
			<Shell theme={theme} style={styleVars}>
				<div className="mr-status">
					No features match the current filters — adjust them in the ⚙
					settings.
					{data.unreadableProduct ? (
						<>
							{" "}
							{data.unreadableProduct} row
							{data.unreadableProduct === 1 ? "" : "s"} matched but their
							Product relation could not be read — check that the block has
							access to the related product pages.
						</>
					) : null}
				</div>
			</Shell>
		)
	}
	const unbound = data.status === "unbound"
	const content: ContentData = unbound
		? sample
		: {
				features: data.features,
				coverage: data.coverage,
				statusBound: data.statusBound,
				filterOptions: data.filterOptions,
				notes: data,
			}
	return (
		<Shell theme={theme} style={styleVars}>
			{unbound && (
				<div className="mr-hint mr-noexport">
					Sample data — bind the <strong>Features</strong> data source to show
					your mandates.
				</div>
			)}
			<Content
				content={content}
				colors={colors}
				onColorsChange={updateColors}
				settings={settings}
				onSettingsChange={onSettingsChange}
				now={now}
			/>
		</Shell>
	)
}

function Shell({
	theme,
	style,
	children,
}: {
	theme: "light" | "dark"
	style: React.CSSProperties
	children: React.ReactNode
}): React.ReactNode {
	return (
		<div className="mr" data-theme={theme} style={style}>
			{children}
		</div>
	)
}

function Content({
	content,
	colors,
	onColorsChange,
	settings,
	onSettingsChange,
	now,
}: {
	content: ContentData
	colors: LaneColors
	onColorsChange: (next: LaneColors) => void
	settings: BlockSettings
	onSettingsChange: (next: BlockSettings) => void
	now: Date
}): React.ReactNode {
	const { features, coverage, statusBound, notes } = content
	const options = content.filterOptions
	const view = settings.view
	const years = useMemo(() => availableYears(features), [features])
	const [pickedYear, setPickedYear] = useState<number | null>(null)
	const fallbackYear = defaultYear(years, now)
	const year = pickedYear ?? fallbackYear
	const yearOptions = useMemo(() => {
		const all = new Set(years)
		all.add(year)
		return [...all].sort((a, b) => a - b)
	}, [years, year])
	const yearIndex = yearOptions.indexOf(year)
	const [settingsOpen, setSettingsOpen] = useState(false)
	const [exporting, setExporting] = useState(false)
	const [exportFailed, setExportFailed] = useState(false)
	const [preview, setPreview] = useState<ExportPreview | null>(null)

	/**
	 * Export the active view on a transparent background — the kanban
	 * always as the 4-column year grid with condensed two-across cards —
	 * optionally padded to a 16:9 canvas for slide decks. The result opens
	 * in a preview (Notion's sandbox blocks direct downloads, so the image
	 * can be copied/saved from there).
	 */
	async function handleExport(
		event: React.MouseEvent<HTMLButtonElement>
	): Promise<void> {
		const root = event.currentTarget.closest(".mr")
		if (!(root instanceof HTMLElement) || exporting) return
		const target = root.querySelector(".mr-exportable")
		if (!(target instanceof HTMLElement)) return
		setExporting(true)
		setExportFailed(false)
		root.classList.add("is-exporting")
		try {
			// Force a synchronous reflow so the export layout is applied before
			// the capture clones computed styles. The SVG is rasterized by hand
			// instead of via toPng, whose decode step waits on an animation
			// frame and hangs when the tab isn't visible.
			void target.offsetWidth
			const contentWidth = target.offsetWidth
			const contentHeight = target.offsetHeight
			const { toSvg } = await import("html-to-image")
			const svgUrl = await toSvg(target, {
				imagePlaceholder: IMAGE_PLACEHOLDER,
				filter: (node) =>
					!(
						node instanceof HTMLElement &&
						node.classList.contains("mr-noexport")
					),
			})
			const size = settings.exportSlide
				? fitTo169(contentWidth * 2, contentHeight * 2)
				: { width: contentWidth * 2, height: contentHeight * 2 }
			const dataUrl = rasterize(
				await loadImage(svgUrl),
				contentWidth * 2,
				contentHeight * 2,
				settings.exportSlide
			)
			setPreview({
				dataUrl,
				width: size.width,
				height: size.height,
				slide: settings.exportSlide,
				name: view === "kanban" ? `ctc-roadmap-${year}.png` : "ctc-coverage.png",
			})
		} catch {
			setExportFailed(true)
		} finally {
			root.classList.remove("is-exporting")
			setExporting(false)
		}
	}

	function downloadPreview(): void {
		if (!preview) return
		const link = document.createElement("a")
		link.download = preview.name
		link.href = preview.dataUrl
		link.click()
	}

	function patch(partial: Partial<BlockSettings>): void {
		onSettingsChange({ ...settings, ...partial })
	}

	return (
		<>
			<header className="mr-header">
				<div className="mr-heading">
					<div className="mr-kicker">Global e-invoicing compliance</div>
					<h1 className="mr-title">
						{view === "kanban" ? (
							<>
								Mandate Delivery Roadmap{" "}
								<span className="mr-title-year">{year}</span>
							</>
						) : (
							<>Country Coverage Status Key</>
						)}
					</h1>
				</div>
				<div className="mr-controls mr-noexport">
					<div className="mr-tabs" role="tablist" aria-label="View">
						<button
							type="button"
							role="tab"
							aria-selected={view === "kanban"}
							className={view === "kanban" ? "is-active" : ""}
							onClick={() => patch({ view: "kanban" })}
						>
							Roadmap
						</button>
						<button
							type="button"
							role="tab"
							aria-selected={view === "coverage"}
							className={view === "coverage" ? "is-active" : ""}
							onClick={() => patch({ view: "coverage" })}
						>
							Coverage
						</button>
					</div>
					<div className="mr-colors" role="group" aria-label="Board colors">
						<label className="mr-color" title="Delivered / roadmap lane color">
							<input
								type="color"
								value={colors.done}
								onChange={(event) =>
									onColorsChange({ ...colors, done: event.target.value })
								}
							/>
							<span>{view === "kanban" ? "Delivered" : "Roadmap"}</span>
						</label>
						<label className="mr-color" title="Upcoming / available lane color">
							<input
								type="color"
								value={colors.todo}
								onChange={(event) =>
									onColorsChange({ ...colors, todo: event.target.value })
								}
							/>
							<span>{view === "kanban" ? "Upcoming" : "Available"}</span>
						</label>
					</div>
					{view === "kanban" && (
						<div className="mr-year-picker" role="group" aria-label="Roadmap year">
							<button
								type="button"
								className="mr-year-step"
								aria-label="Previous year"
								disabled={yearIndex <= 0}
								onClick={() => setPickedYear(yearOptions[yearIndex - 1])}
							>
								‹
							</button>
							<select
								className="mr-year-select"
								aria-label="Year"
								value={year}
								onChange={(event) => setPickedYear(Number(event.target.value))}
							>
								{yearOptions.map((option) => (
									<option key={option} value={option}>
										{option}
									</option>
								))}
							</select>
							<button
								type="button"
								className="mr-year-step"
								aria-label="Next year"
								disabled={yearIndex >= yearOptions.length - 1}
								onClick={() => setPickedYear(yearOptions[yearIndex + 1])}
							>
								›
							</button>
						</div>
					)}
					<div className="mr-settings-wrap">
						<button
							type="button"
							className="mr-gear"
							aria-label="Settings"
							aria-expanded={settingsOpen}
							onClick={() => setSettingsOpen((open) => !open)}
						>
							⚙
						</button>
						{settingsOpen && (
							<SettingsPanel
								settings={settings}
								onPatch={patch}
								options={options}
							/>
						)}
					</div>
					<button
						type="button"
						className="mr-export"
						onClick={handleExport}
						disabled={exporting}
					>
						{exporting ? "Exporting…" : "Export PNG"}
					</button>
					{exportFailed && (
						<span className="mr-export-error" role="alert">
							Export failed
						</span>
					)}
				</div>
			</header>
			{view === "kanban" ? (
				<KanbanView features={features} year={year} now={now} />
			) : (
				<CoverageView coverage={coverage} statusBound={statusBound} />
			)}
			<BoardFootnotes
				view={view}
				unscheduled={unscheduledCount(features)}
				notes={notes}
			/>
			{preview && (
				<ExportModal
					preview={preview}
					onDownload={downloadPreview}
					onClose={() => setPreview(null)}
				/>
			)}
		</>
	)
}

function ExportModal({
	preview,
	onDownload,
	onClose,
}: {
	preview: ExportPreview
	onDownload: () => void
	onClose: () => void
}): React.ReactNode {
	return (
		<div className="mr-modal-backdrop mr-noexport" onClick={onClose}>
			<div
				className="mr-modal"
				role="dialog"
				aria-label="Export preview"
				onClick={(event) => event.stopPropagation()}
			>
				<div className="mr-modal-head">
					<span className="mr-modal-title">{preview.name}</span>
					<span className="mr-modal-format">
						{preview.width} × {preview.height} px ·{" "}
						{preview.slide ? "16:9 slide" : "natural size"}
					</span>
				</div>
				<div className="mr-modal-imgwrap">
					<img
						className="mr-modal-img"
						src={preview.dataUrl}
						alt="Exported board"
					/>
				</div>
				<div className="mr-modal-hint">
					If the download doesn't start (Notion blocks downloads from
					blocks), right-click the image and choose “Copy image” or “Save
					image as…”.
				</div>
				<div className="mr-modal-actions">
					<button type="button" className="mr-export" onClick={onDownload}>
						Download
					</button>
					<button type="button" className="mr-modal-close" onClick={onClose}>
						Close
					</button>
				</div>
			</div>
		</div>
	)
}

/** Case-insensitive membership used by the dropdown UI. */
function isSelected(selected: string[], value: string): boolean {
	const key = value.trim().toLowerCase()
	return selected.some((entry) => entry.trim().toLowerCase() === key)
}

function toggleValue(selected: string[], value: string): string[] {
	return isSelected(selected, value)
		? selected.filter(
				(entry) => entry.trim().toLowerCase() !== value.trim().toLowerCase()
			)
		: [...selected, value]
}

/**
 * Multi-select dropdown with an "All" option. `allMode` decides what All
 * stores: "empty" (no selection = filter off, used by the shared filters)
 * or "sentinel" (the ALL_TERM wildcard, used by the status lanes where an
 * empty selection legitimately means an empty lane).
 */
function MultiDropdown({
	label,
	options,
	selected,
	allMode,
	onChange,
}: {
	label: string
	options: string[]
	selected: string[]
	allMode: "empty" | "sentinel"
	onChange: (next: string[]) => void
}): React.ReactNode {
	const [open, setOpen] = useState(false)
	const values = selected.filter((entry) => entry !== ALL_TERM)
	const allActive =
		allMode === "empty" ? values.length === 0 : selected.includes(ALL_TERM)

	function summary(): string {
		if (allActive) return "All"
		if (values.length === 0) return "None"
		if (values.length <= 2) return values.join(", ")
		return `${values.length} selected`
	}

	function pickAll(): void {
		onChange(allMode === "empty" ? [] : [ALL_TERM])
	}

	function pick(option: string): void {
		// Leaving "All" starts a fresh selection with just the picked value.
		onChange(allActive ? [option] : toggleValue(values, option))
	}

	return (
		<div className="mr-dd">
			<div className="mr-dd-label">{label}</div>
			<button
				type="button"
				className="mr-dd-btn"
				aria-haspopup="listbox"
				aria-expanded={open}
				onClick={() => setOpen((value) => !value)}
			>
				<span className="mr-dd-summary">{summary()}</span>
				<span className="mr-dd-caret" aria-hidden="true">
					▾
				</span>
			</button>
			{open && (
				<>
					<div className="mr-dd-backdrop" onClick={() => setOpen(false)} />
					<div className="mr-dd-menu" role="listbox" aria-label={label}>
						<button
							type="button"
							className="mr-dd-item"
							role="option"
							aria-selected={allActive}
							onClick={pickAll}
						>
							<span className={`mr-dd-check${allActive ? " is-on" : ""}`} />
							<span>All</span>
						</button>
						{options.length === 0 ? (
							<div className="mr-dd-empty">No values in the database</div>
						) : (
							options.map((option) => {
								const active = !allActive && isSelected(values, option)
								return (
									<button
										key={option}
										type="button"
										className="mr-dd-item"
										role="option"
										aria-selected={active}
										onClick={() => pick(option)}
									>
										<span className={`mr-dd-check${active ? " is-on" : ""}`} />
										<span>{option}</span>
									</button>
								)
							})
						)}
					</div>
				</>
			)}
		</div>
	)
}

function SettingsPanel({
	settings,
	onPatch,
	options,
}: {
	settings: BlockSettings
	onPatch: (partial: Partial<BlockSettings>) => void
	options: FilterOptions
}): React.ReactNode {
	return (
		<div className="mr-settings" role="dialog" aria-label="Block settings">
			<div className="mr-settings-title">
				Filters — both views, case-insensitive
			</div>
			<MultiDropdown
				label="Tags"
				allMode="empty"
				options={options.tags}
				selected={settings.tagTerms}
				onChange={(tagTerms) => onPatch({ tagTerms })}
			/>
			<MultiDropdown
				label="Product"
				allMode="empty"
				options={options.products}
				selected={settings.productTerms}
				onChange={(productTerms) => onPatch({ productTerms })}
			/>
			<MultiDropdown
				label="Scopes"
				allMode="empty"
				options={options.scopes}
				selected={settings.scopeTerms}
				onChange={(scopeTerms) => onPatch({ scopeTerms })}
			/>
			<MultiDropdown
				label="“Available” statuses"
				allMode="sentinel"
				options={options.statuses}
				selected={settings.availableTerms}
				onChange={(availableTerms) => onPatch({ availableTerms })}
			/>
			<MultiDropdown
				label="“Roadmap” statuses"
				allMode="sentinel"
				options={options.statuses}
				selected={settings.roadmapTerms}
				onChange={(roadmapTerms) => onPatch({ roadmapTerms })}
			/>
			<div className="mr-settings-title">Export format</div>
			<select
				className="mr-settings-select"
				aria-label="Export format"
				value={settings.exportSlide ? "slide" : "natural"}
				onChange={(event) =>
					onPatch({ exportSlide: event.target.value === "slide" })
				}
			>
				<option value="slide">16:9 slide canvas</option>
				<option value="natural">Natural size (fit to width)</option>
			</select>
		</div>
	)
}

function KanbanView({
	features,
	year,
	now,
}: {
	features: Feature[]
	year: number
	now: Date
}): React.ReactNode {
	return (
		<div className="mr-board mr-exportable">
			{QUARTERS.map((quarter) => {
				const complete = isQuarterComplete(year, quarter, now)
				const items = featuresForQuarter(features, year, quarter)
				return (
					<section
						key={quarter}
						className={`mr-col ${complete ? "is-complete" : "is-upcoming"}`}
						aria-label={`Q${quarter} ${year}${complete ? " (completed)" : ""}`}
					>
						<h2 className="mr-col-title">
							Q{quarter} {year}
						</h2>
						<div className="mr-col-rule" />
						{items.length === 0 ? (
							<div className="mr-col-empty">No mandates</div>
						) : (
							<div className="mr-cards">
								{items.map((feature) => (
									<FeatureCard key={feature.id} feature={feature} />
								))}
							</div>
						)}
					</section>
				)
			})}
		</div>
	)
}

function CoverageView({
	coverage,
	statusBound,
}: {
	coverage: Coverage
	statusBound: boolean
}): React.ReactNode {
	if (!statusBound) {
		return (
			<div className="mr-status">
				Map the <strong>Sales status</strong> property of the Features data
				source to use the coverage view.
			</div>
		)
	}
	return (
		<div className="mr-coverage mr-exportable">
			<CoveragePanel
				kind="available"
				title="Available"
				items={coverage.available}
			/>
			<CoveragePanel kind="roadmap" title="Roadmap" items={coverage.roadmap} />
		</div>
	)
}

function CoveragePanel({
	kind,
	title,
	items,
}: {
	kind: "available" | "roadmap"
	title: string
	items: Feature[]
}): React.ReactNode {
	return (
		<section className={`mr-cov-panel is-${kind}`} aria-label={title}>
			<h2 className="mr-cov-head">{title}</h2>
			{items.length === 0 ? (
				<div className="mr-col-empty">No countries</div>
			) : (
				<div className="mr-cov-grid">
					{items.map((feature) => (
						<div key={feature.id} className="mr-cov-pill">
							<span className="mr-cov-flag" aria-hidden="true">
								<CardIcon feature={feature} />
							</span>
							<span className="mr-cov-name">{feature.countryName}</span>
						</div>
					))}
				</div>
			)}
		</section>
	)
}

function BoardFootnotes({
	view,
	unscheduled,
	notes,
}: {
	view: BlockSettings["view"]
	unscheduled: number
	notes: BoardNotes | undefined
}): React.ReactNode {
	const lines: string[] = []
	if (notes?.truncated) {
		lines.push(
			"Only the first 999 rows could be read — the board may be incomplete."
		)
	}
	if (view === "kanban" && unscheduled > 0) {
		lines.push(
			`${unscheduled} matching ${unscheduled === 1 ? "item" : "items"} without an ETA ${unscheduled === 1 ? "isn't" : "aren't"} shown.`
		)
	}
	if (notes?.unreadableProduct) {
		lines.push(
			`${notes.unreadableProduct} ${notes.unreadableProduct === 1 ? "row was" : "rows were"} skipped because the Product relation could not be read.`
		)
	}
	if (notes?.unboundFilters?.length) {
		lines.push(
			`${notes.unboundFilters.join(" and ")} ${notes.unboundFilters.length === 1 ? "is" : "are"} not mapped, so that filter is off.`
		)
	}
	if (lines.length === 0) return null
	return (
		<div className="mr-note mr-noexport">
			{lines.map((line) => (
				<div key={line}>{line}</div>
			))}
		</div>
	)
}

function FeatureCard({ feature }: { feature: Feature }): React.ReactNode {
	return (
		<article className="mr-card">
			<div className="mr-card-flag" aria-hidden="true">
				<CardIcon feature={feature} />
			</div>
			<div className="mr-card-country">{feature.countryName}</div>
			{feature.scopes.length > 0 && (
				<div className="mr-card-scopes">({feature.scopes.join(", ")})</div>
			)}
		</article>
	)
}

function CardIcon({ feature }: { feature: Feature }): React.ReactNode {
	if (feature.icon?.type === "url") {
		return <img className="mr-card-flag-img" src={feature.icon.url} alt="" />
	}
	if (feature.icon?.type === "emoji") {
		return <span className="mr-card-flag-emoji">{feature.icon.emoji}</span>
	}
	return (
		<span className="mr-card-flag-emoji">
			{feature.iso2 ? flagEmoji(feature.iso2) : "🌐"}
		</span>
	)
}

function loadImage(url: string): Promise<HTMLImageElement> {
	return new Promise((resolve, reject) => {
		const image = new Image()
		image.onload = () => resolve(image)
		image.onerror = reject
		image.src = url
	})
}

/**
 * Draw the captured SVG at 2× onto a transparent canvas — padded to the
 * smallest containing 16:9 canvas when `slide` is set, so the PNG drops
 * straight onto a slide deck.
 */
function rasterize(
	image: HTMLImageElement,
	contentWidth: number,
	contentHeight: number,
	slide: boolean
): string {
	const { width, height } = slide
		? fitTo169(contentWidth, contentHeight)
		: { width: contentWidth, height: contentHeight }
	const canvas = document.createElement("canvas")
	canvas.width = width
	canvas.height = height
	const context = canvas.getContext("2d")
	if (!context) throw new Error("canvas 2d context unavailable")
	context.drawImage(
		image,
		Math.round((width - contentWidth) / 2),
		Math.round((height - contentHeight) / 2),
		contentWidth,
		contentHeight
	)
	return canvas.toDataURL("image/png")
}
