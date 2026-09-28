/**
 * The block's top bar and filter plumbing: a title, the Notion-style filter
 * button with its property menu and filter bar, and the settings button.
 * View state (including filters) is remembered per block in localStorage;
 * the share button turns it into a code others can load.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { applyFilters, buildProperties, EMPTY_FILTERS, hasActiveFilters, newRule, type FilterState, type Resolvers } from "./filters/core"
import { FilterBar } from "./filters/FilterBar"
import { PropertyMenu } from "./filters/editors"
import { FilterIcon } from "./filters/icons"
import { Popover, useAnchor } from "./filters/popover"
import { SlidersIcon } from "./settings"
import { ShareIcon, ShareView, type ShareConfig } from "./ShareView"
import { filterRows, type SourceSnapshot } from "./sources"

export type WithFilters = { filters: FilterState; filterBar: boolean }

export function usePersistentView<T extends WithFilters>(key: string, defaults: T): [T, (f: (v: T) => T) => void] {
	const [view, setView] = useState<T>(() => {
		try {
			const raw = window.localStorage.getItem(key)
			if (raw) {
				const v = JSON.parse(raw) as Partial<T>
				return { ...defaults, ...v, filters: { ...EMPTY_FILTERS, ...v.filters } }
			}
		} catch {
			// Storage can be unavailable in the sandbox; fall back to defaults.
		}
		return defaults
	})
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

/** Filterable properties of `src` and the ids of rows that pass the filters. */
export function useFiltered(src: SourceSnapshot, filters: FilterState, resolvers: Resolvers, today: string) {
	const rows = useMemo(() => filterRows(src), [src])
	const properties = useMemo(() => buildProperties(src.propertySchemasById, rows, resolvers), [src.propertySchemasById, rows, resolvers])
	const visible = useMemo(() => new Set(applyFilters(filters, properties, rows, { today, meId: resolvers.meId }).map((r) => r.id)), [filters, properties, rows, today, resolvers.meId])
	return { properties, visible, filtering: hasActiveFilters(filters, properties) }
}

type ToolbarProps<T extends WithFilters> = {
	/** Text, or an element (e.g. an editable title). */
	title: ReactNode
	sub?: ReactNode
	view: T
	setView: (f: (v: T) => T) => void
	properties: ReturnType<typeof buildProperties>
	filtering: boolean
	today: string
	/** Renders the settings panel for the given anchor. */
	settings: (anchor: HTMLElement | null, close: () => void) => ReactNode
	/** Extra buttons before the filter button. */
	actions?: ReactNode
	/** View codes: copy this view for others, or load theirs. */
	share?: ShareConfig<T>
}

export function Toolbar<T extends WithFilters>({ title, sub, view, setView, properties, filtering, today, settings, actions, share }: ToolbarProps<T>) {
	const [openRuleId, setOpenRuleId] = useState<string | null>(null)
	const [openAdvanced, setOpenAdvanced] = useState(false)
	const fbtn = useAnchor()
	const sbtn = useAnchor()
	const shbtn = useAnchor()
	const anyFilter = view.filters.rules.length > 0 || !!view.filters.advanced
	const onFilterButton = () => (anyFilter ? setView((v) => ({ ...v, filterBar: !v.filterBar })) : fbtn.toggle())
	const onOpened = useCallback(() => setOpenRuleId(null), [])
	const onAdvancedOpened = useCallback(() => setOpenAdvanced(false), [])
	return (
		<>
			<div className="toolbar">
				<h2 className="ctitle">
					{title}
					{sub ? <span className="csub">{sub}</span> : null}
				</h2>
				<span className="spacer" />
				<div className="tools">
					{actions}
					<button type="button" ref={fbtn.ref} className={"tool" + (filtering ? " blue" : "")} onClick={onFilterButton} aria-label="Filter" aria-pressed={anyFilter && view.filterBar} title="Filter">
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
					<button type="button" ref={sbtn.ref} className="tool" aria-label="Settings" aria-pressed={sbtn.open} title="Settings" onClick={sbtn.toggle}>
						<SlidersIcon />
					</button>
					{sbtn.open ? settings(sbtn.el, sbtn.close) : null}
					{share ? (
						<button type="button" ref={shbtn.ref} className="tool" aria-label="Share view" aria-pressed={shbtn.open} title="Share view" onClick={shbtn.toggle}>
							<ShareIcon />
						</button>
					) : null}
					{share && shbtn.open ? <ShareView {...share} anchor={shbtn.el} onClose={shbtn.close} view={view} setView={setView} /> : null}
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
		</>
	)
}

export function Loading({ what }: { what: string }) {
	return (
		<div className="state">
			<span className="spinner" aria-hidden="true" />
			Loading {what}…
		</div>
	)
}

export function Setup({ title, missing, children }: { title: string; missing: string[]; children: ReactNode }) {
	return (
		<div className="setup">
			<b>{title}</b>
			<p>
				Open this block's data settings and connect{" "}
				{missing.map((m, i) => (
					<span key={m}>
						{i ? ", " : ""}
						<code>{m}</code>
					</span>
				))}
				:
			</p>
			<ul>{children}</ul>
		</div>
	)
}
