import { useMemo, useState } from "react"
import { flagEmoji } from "./countries"
import { MOCK_FEATURES } from "./mockData"
import {
	availableYears,
	defaultYear,
	featuresForQuarter,
	isQuarterComplete,
	unscheduledCount,
} from "./roadmap"
import type { Feature, RoadmapDataState } from "./types"

const QUARTERS = [1, 2, 3, 4] as const

/** 1×1 transparent PNG for images the exporter can't fetch (CORS). */
const IMAGE_PLACEHOLDER =
	"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=="

export function RoadmapBoard({
	data,
	theme,
	now = new Date(),
}: {
	data: RoadmapDataState
	theme: "light" | "dark"
	now?: Date
}): React.ReactNode {
	if (data.status === "loading") {
		return (
			<Shell theme={theme}>
				<div className="mr-status">Loading mandates…</div>
			</Shell>
		)
	}
	if (data.status === "empty") {
		return (
			<Shell theme={theme}>
				<div className="mr-status">
					No matching features. The board shows rows tagged{" "}
					<strong>mandate</strong> with product{" "}
					<strong>Compliance transaction(s)</strong>.
					{data.unreadableProduct ? (
						<>
							{" "}
							{data.unreadableProduct} row
							{data.unreadableProduct === 1 ? "" : "s"} matched the tag but
							their Product relation could not be read — check that the block
							has access to the related product pages.
						</>
					) : null}
				</div>
			</Shell>
		)
	}
	const unbound = data.status === "unbound"
	return (
		<Shell theme={theme}>
			{unbound && (
				<div className="mr-hint mr-noexport">
					Sample data — bind the <strong>Features</strong> data source to show
					your mandates.
				</div>
			)}
			<Board
				features={unbound ? MOCK_FEATURES : data.features}
				notes={unbound ? undefined : data}
				theme={theme}
				now={now}
			/>
		</Shell>
	)
}

function Shell({
	theme,
	children,
}: {
	theme: "light" | "dark"
	children: React.ReactNode
}): React.ReactNode {
	return (
		<div className="mr" data-theme={theme}>
			{children}
		</div>
	)
}

type BoardNotes = {
	truncated?: boolean
	unreadableProduct?: number
	unboundFilters?: string[]
}

function Board({
	features,
	notes,
	theme,
	now,
}: {
	features: Feature[]
	notes: BoardNotes | undefined
	theme: "light" | "dark"
	now: Date
}): React.ReactNode {
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
	const unscheduled = unscheduledCount(features)
	const [exporting, setExporting] = useState(false)
	const [exportFailed, setExportFailed] = useState(false)

	async function handleExport(
		event: React.MouseEvent<HTMLButtonElement>
	): Promise<void> {
		const root = event.currentTarget.closest(".mr")
		if (!(root instanceof HTMLElement) || exporting) return
		setExporting(true)
		setExportFailed(false)
		try {
			const { toPng } = await import("html-to-image")
			const dataUrl = await toPng(root, {
				pixelRatio: 2,
				backgroundColor: theme === "dark" ? "#191919" : "#ffffff",
				imagePlaceholder: IMAGE_PLACEHOLDER,
				filter: (node) =>
					!(
						node instanceof HTMLElement &&
						node.classList.contains("mr-noexport")
					),
			})
			const link = document.createElement("a")
			link.download = `ctc-roadmap-${year}.png`
			link.href = dataUrl
			link.click()
		} catch {
			setExportFailed(true)
		} finally {
			setExporting(false)
		}
	}

	return (
		<>
			<header className="mr-header">
				<div className="mr-heading">
					<div className="mr-kicker">Global e-invoicing compliance</div>
					<h1 className="mr-title">
						Mandate Delivery Roadmap <span className="mr-title-year">{year}</span>
					</h1>
				</div>
				<div className="mr-controls mr-noexport">
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
			<div className="mr-board">
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
			<BoardFootnotes unscheduled={unscheduled} notes={notes} />
		</>
	)
}

function BoardFootnotes({
	unscheduled,
	notes,
}: {
	unscheduled: number
	notes: BoardNotes | undefined
}): React.ReactNode {
	const lines: string[] = []
	if (notes?.truncated) {
		lines.push(
			"Only the first 999 rows could be read — the board may be incomplete."
		)
	}
	if (unscheduled > 0) {
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
