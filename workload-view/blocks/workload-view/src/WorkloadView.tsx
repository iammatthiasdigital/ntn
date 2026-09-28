import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import { dayIso, EMPTY_FILTERS, textOf } from "./kit/filters/core"
import { PropIcon } from "./kit/filters/icons"
import { ClockIcon, ColumnIcon, HashIcon, LayersIcon, NavRow, Note, NumberRow, PersonIcon, PickRow, Sep, SettingsShell, TargetIcon, ToggleRow } from "./kit/settings"
import type { BlockData, SourceRow, SourceSnapshot } from "./kit/sources"
import { linkChoices, linkProps, optionProps, planLoad, reverseLinks, withLinkOptions } from "./scope"
import { isoDay, oneOf, within } from "./kit/share"
import { Loading, Setup, Toolbar, useFiltered, usePersistentView, type WithFilters } from "./kit/toolbar"
import { bucketStart, columns, fmtBucket, fmtDay, fmtNum, isoOf, nextBucket, resolveSetup, TITLE, toDay, workload, type Bucket, type Column, type EffortMode, type Lane, type Workload } from "./workload"

export type Keys = "assignments" | "people" | "projects"
type Ready = Extract<BlockData<Keys>, { status: "ready" }>

/** Column choices: null = automatic (by name and type), "" = none. */
type View = WithFilters & {
	person: string | null
	/** Group by (a select, multi-select, status or relation). */
	team: string | null
	effort: string | null
	dates: string | null
	pPerson: string | null
	pCap: string | null
	/** What lanes measure: task count (default) or an effort property. */
	mode: EffortMode
	/** Hours in a full working day (hour modes). */
	dayHours: number
	/** Working time per person (lane key), % of full time; local to this browser and the view code. */
	caps: Record<string, number>
	/** Everyone in the People database gets a lane, not only people with allocations. */
	everyone: boolean
	/** People rows added by hand (shown without allocations). */
	extra: string[]
	workdays: boolean
	/** Show tasks without a date as ongoing (off: they're left out). */
	undated: boolean
bucket: Bucket
	from: string
	to: string
	bars: boolean
	/** What bars say: property ids, TITLE = the title. At least one. */
	labels: string[]
	/** The Projects / People relation that points to their tasks; null = automatic, "" = none. */
	projectVia: string | null
	personVia: string | null
}

const DEFAULT: View = {
	person: null,
	team: null,
	effort: null,
	dates: null,
	pPerson: null,
	pCap: null,
	mode: "count",
	dayHours: 8,
	caps: {},
	everyone: false,
	extra: [],
	workdays: true,
	undated: false,
bucket: "week",
	from: "",
	to: "",
	bars: false,
	labels: [TITLE],
	projectVia: null,
	personVia: null,
	filters: EMPTY_FILTERS,
	filterBar: true,
}

/** Imported views stay within what the settings allow. */
const sanitize = (v: View): View => {
	const caps: Record<string, number> = {}
	for (const [k, n] of Object.entries(v.caps ?? {})) if (typeof n === "number" && k.length < 100) caps[k] = within(n, 0, 200, 100)
	return {
		...v,
		mode: oneOf(v.mode, ["count", "total", "perDay", "percent"] as const, DEFAULT.mode),
		labels: Array.isArray(v.labels) && v.labels.length ? v.labels.filter((x) => typeof x === "string" && x.length < 100).slice(0, 8) : [TITLE],
		bucket: oneOf(v.bucket, ["day", "week", "month"] as const, DEFAULT.bucket),
		dayHours: within(v.dayHours, 0.5, 24, DEFAULT.dayHours),
		caps,
		everyone: v.everyone === true,
		extra: Array.isArray(v.extra) ? v.extra.filter((x) => typeof x === "string" && x.length < 100).slice(0, 500) : [],
		from: isoDay(v.from),
		to: isoDay(v.to),
}
}

/** Linked tasks are loaded one page at a time; a project with more than this many is cut short. */
const MAX_LINKED = 1500
/** Task bars are off (and locked) above this many tasks: too many to draw. */
const MAX_BARS = 1000
/** Task counts: lanes share a 0–20 scale; a lane with more at once gets its own. */
const COUNT_SCALE = 20

const PALETTE = ["blue", "orange", "green", "purple", "pink", "yellow", "brown", "red", "gray"]
const color = (i: number) => `var(--d-${PALETTE[i % PALETTE.length]})`
const MODE_LABEL: Record<EffortMode, string> = { count: "Task count", percent: "Effort, % of full time", total: "Effort, spread", perDay: "Effort per day" }

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

type Page = "root" | "projectVia" | "personVia" | "person" | "labels" | "team" | "effort" | "dates" | "pPerson" | "pCap" | "mode" | "bucket" | "shown"

function Ready({ data }: { data: Ready }) {
	const [view, setView] = usePersistentView(data.storageKey, DEFAULT)
	const setUi = (f: Partial<View>) => setView((v) => ({ ...v, ...f }))
	const today = useMemo(() => dayIso(new Date()), [])
	// The task database's schema, and (in the mock, or for a project picked from a select) its rows.
	const base = data.sources.assignments
	const ppl = data.sources.people?.bound ? data.sources.people : undefined
	const prj = data.sources.projects?.bound ? data.sources.projects : undefined
	const cols = useMemo(() => columns(base, ppl), [base, ppl])
	const setup = useMemo(() => resolveSetup(view, base, ppl), [view, base, ppl])

	/* ---- what loads: named by the filter bar (a project or a person), nothing otherwise ---- */
	const dbs = useMemo(() => ({ projects: prj, people: ppl }), [prj, ppl])
	const links = useMemo(() => linkProps(base, dbs, { project: view.projectVia, person: view.personVia }), [base, dbs, view.projectVia, view.personVia])
	const plan = useMemo(() => planLoad(view.filters.rules, base, links, dbs, MAX_LINKED), [view.filters.rules, base, links, dbs])
	const { setQuery, fetchRow } = data
	// Option rules (select, status, multi-select) filter the query in Notion; otherwise only the schema is read.
	const qFilter = plan.kind === "query" ? plan.filter : null
	const qKey = JSON.stringify(qFilter)
	useEffect(
		() => setQuery?.("assignments", qFilter ? { limit: 999, filter: qFilter, sortBy: setup.dates, empty: view.undated } : { limit: 1 }),
		// eslint-disable-next-line react-hooks/exhaustive-deps
		[setQuery, qKey, setup.dates, view.undated]
	)
	// Projects/People rows link to their tasks: those are loaded one by one, a few at a time.
	const ids = plan.kind === "link" ? plan.ids : null
	const idsKey = ids ? ids.join(",") : ""
	const [linked, setLinked] = useState<{ key: string; rows: SourceRow[]; done: number } | null>(null)
	const [reload, setReload] = useState(0)
	useEffect(() => {
		if (!ids || !fetchRow) return setLinked(null)
		let stop = false
		const queue = [...ids]
		const rows: SourceRow[] = []
		let done = 0
		setLinked({ key: idsKey, rows: [], done: 0 })
		const next = async (): Promise<void> => {
			const id = queue.shift()
			if (!id || stop) return
			const r = await fetchRow("assignments", id)
			done++
			if (r) rows.push(r)
			if (!stop && (done % 25 === 0 || queue.length === 0)) setLinked({ key: idsKey, rows: [...rows], done })
			return next()
		}
		void Promise.all([next(), next(), next(), next()])
		return () => {
			stop = true
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [idsKey, reload, fetchRow])
	const loadingLinked = !!ids && !!fetchRow && ids.length > 0 && (!linked || linked.key !== idsKey || linked.done < ids.length)
	// Virtual Project/Person values: the Projects/People rows that link to each task.
	const virtual = useMemo(() => links.filter((l) => l.virtual).map((l) => ({ id: l.id, name: l.name, rev: reverseLinks(dbs[l.source], l.link) })), [links, dbs])
	const src: SourceSnapshot = useMemo(() => {
		const items =
			plan.kind === "none" ? [] : plan.kind === "link" ? (fetchRow ? (linked?.key === idsKey ? linked.rows : []) : base.items.filter((r) => ids!.includes(r.id))) : base.items
		const schemas = { ...base.propertySchemasById }
		for (const v of virtual) schemas[v.id] = { name: v.name, type: "relation" }
		const rows = virtual.length ? items.map((r) => ({ ...r, propertiesById: { ...r.propertiesById, ...Object.fromEntries(virtual.map((v) => [v.id, (v.rev.get(r.id) ?? []).map((id) => ({ id, table: "block" }))])) } })) : items
		return { ...base, propertySchemasById: schemas, items: rows, truncated: plan.kind === "link" ? plan.more > 0 : plan.kind === "query" && base.truncated, loading: plan.kind === "query" ? base.loading : loadingLinked }
	}, [plan, base, fetchRow, linked, idsKey, ids, virtual, loadingLinked])
	const filtered = useFiltered(src, view.filters, data.resolvers, today)
	const properties = useMemo(() => withLinkOptions(filtered.properties, links, dbs), [filtered.properties, links, dbs])
	const { visible, filtering } = filtered
	// Views saved before task counts had mode null (automatic effort); every view now says what it measures.
	const mode: EffortMode = view.mode ?? "count"
	const count = mode === "count"
	// From and To are never empty: without dates of your own, half a year back and ahead.
	const from = view.from || isoOf(toDay(today) - 182)
	const to = view.to || isoOf(toDay(today) + 182)
const all = useMemo(
		() => workload(src, ppl, filtering ? visible : null, data.resolvers, { ...setup, mode, dayHours: view.dayHours, caps: view.caps, everyone: view.everyone, extra: view.extra, workdays: view.workdays, bucket: view.bucket, from, to, labels: view.labels, undated: view.undated, today }),
	[src, ppl, visible, filtering, data.resolvers, setup, mode, view.dayHours, view.caps, view.everyone, view.extra, view.workdays, view.bucket, from, to, view.labels, view.undated, today]
)
// People picked in a Person filter (from the People database) show alone: their shared tasks name others too.
const personLink = links.find((l) => l.kind === "person")
const only = useMemo(() => {
	const r = personLink ? view.filters.rules.find((x) => x.propertyId === personLink.id && Array.isArray(x.value) && x.value.length) : undefined
	return r ? new Set((r.value as string[]).map((id) => `p:${id}`)) : null
}, [personLink, view.filters.rules])
const WL = useMemo(() => (only ? { ...all, lanes: all.lanes.filter((l) => only.has(l.person)) } : all), [all, only])
	// People rows with allocations always have a lane; the others can be added.
	const allocated = useMemo(() => new Set(WL.lanes.filter((l) => l.items.length && l.key.startsWith("p:")).map((l) => l.key.slice(2))), [WL])
	const others = useMemo(() => {
		const t = ppl ? Object.entries(ppl.propertySchemasById).find(([, c]) => c.type === "title")?.[0] : undefined
		return (ppl?.items ?? [])
			.filter((r) => !allocated.has(r.id))
			.map((r) => ({ id: r.id, name: textOf(t ? r.propertiesById[t] : "").trim() || "Untitled" }))
			.sort((a, b) => a.name.localeCompare(b.name))
	}, [ppl, allocated])
	const extraShown = view.extra.filter((id) => others.some((o) => o.id === id)).length
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
			case "projectVia":
			case "personVia": {
				const own = page === "projectVia" ? prj : ppl
				const cur = links.find((l) => l.source === (page === "projectVia" ? "projects" : "people"))
				return (
					<SettingsShell anchor={anchor} onClose={shut} title={page === "projectVia" ? "Projects → tasks" : "People → tasks"} onBack={back}>
						<PickRow label="Automatic" sub="A relation named like tasks" selected={view[page] === null} onClick={() => setUi({ [page]: null })} />
						<PickRow label="None" sub="No filter from this database" selected={view[page] === ""} onClick={() => setUi({ [page]: "" })} />
						<Sep />
						{linkChoices(own).map((c) => (
							<PickRow key={c.id} icon={<PropIcon type="relation" />} label={c.name} selected={view[page] !== null && cur?.link === c.id} onClick={() => setUi({ [page]: c.id })} />
						))}
						<Note>The relation from each {page === "projectVia" ? "project" : "person"} to their tasks. Its rows become a filter; picking some loads just their tasks.</Note>
					</SettingsShell>
				)
			}
			case "person":
				return colPage("Person", cols.person, setup.person, "person", "Whose time the row allocates: a people property, or a relation to a person page.")
			case "team":
				return colPage("Group by", cols.team, setup.team, "team", "A select or relation. On the tasks, a person shows in each group they have tasks in; on the People database, in their own group.", "No groups")
			case "effort":
				return colPage("Effort", cols.effort, setup.effort, "effort", "A number: % of someone's time, or hours (see Measure).")
			case "labels": {
				const all = [{ id: TITLE, name: "Title", type: "title" }, ...cols.labels]
				return (
					<SettingsShell anchor={anchor} onClose={shut} title="Bar label" onBack={back}>
						{all.map((c) => {
							const on = view.labels.includes(c.id)
							return (
								<PickRow
									key={c.id}
									icon={<PropIcon type={c.type} />}
									label={c.name}
									checkbox
									selected={on}
									// At least one stays ticked.
									onClick={() => (on ? view.labels.length > 1 && setUi({ labels: view.labels.filter((x) => x !== c.id) }) : setUi({ labels: [...view.labels, c.id] }))}
								/>
							)
						})}
						<Note>Bars show the ticked values joined by “·”, in the order ticked.</Note>
					</SettingsShell>
				)
			}
			case "dates":
				return colPage("Dates", cols.dates, setup.dates, "dates", "Rows without dates count as ongoing.", "No dates (all ongoing)")
			case "pPerson":
				return colPage("Match people by", cols.pPerson, setup.pPerson, "pPerson", "Rows of the People database are matched by this person, by relation, or by name.", "Name only")
			case "pCap":
				return colPage("Working time", cols.pCap, setup.pCap, "pCap", "Hours per week (column named with hours) or % of full time. Empty = set per person on the board.", "Set on the board")
			case "mode":
				return (
					<SettingsShell anchor={anchor} onClose={shut} title="Measure" onBack={back}>
						<PickRow label="Task count" sub="How many tasks run at once. No effort property needed." selected={mode === "count"} onClick={() => setUi({ mode: "count" })} />
						<Sep />
						<PickRow label="Effort, spread over the task" sub="Effort ÷ the task's days (workdays only when that's on), e.g. 40 h over 2 weeks = 4 h a day" selected={mode === "total"} onClick={() => setUi({ mode: "total" })} />
						<PickRow label="Effort per day" sub="Hours every day while it runs" selected={mode === "perDay"} onClick={() => setUi({ mode: "perDay" })} />
						<PickRow label="Effort as % of full time" sub="50 = half of someone's time. Notion's percent format works too." selected={mode === "percent"} onClick={() => setUi({ mode: "percent" })} />
					</SettingsShell>
				)
			case "shown":
				return (
					<SettingsShell anchor={anchor} onClose={shut} title="People shown" onBack={back}>
						<PickRow label="People in the workload" sub="Everyone with an allocation, plus the people ticked below" selected={!view.everyone} onClick={() => setUi({ everyone: false })} />
						<PickRow label="Everyone in People" sub="Also people without allocations" selected={view.everyone} onClick={() => setUi({ everyone: true })} />
						{!view.everyone && others.length ? (
							<>
								<Sep />
								{others.map((o) => (
									<PickRow
										key={o.id}
										icon={<PersonIcon />}
										label={o.name}
										checkbox
										selected={view.extra.includes(o.id)}
										onClick={() => setUi({ extra: view.extra.includes(o.id) ? view.extra.filter((x) => x !== o.id) : [...view.extra, o.id] })}
									/>
								))}
							</>
						) : null}
						<Note>People with allocations always show. Tick others from the People database to see their free time too.</Note>
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
				{prj ? <NavRow icon={<LayersIcon />} label="Projects → tasks" value={links.find((l) => l.source === "projects") ? (linkChoices(prj).find((c) => c.id === links.find((l) => l.source === "projects")!.link)?.name ?? "—") : "None"} onClick={() => setPage("projectVia")} /> : null}
				{ppl ? <NavRow icon={<PersonIcon />} label="People → tasks" value={links.find((l) => l.source === "people") ? (linkChoices(ppl).find((c) => c.id === links.find((l) => l.source === "people")!.link)?.name ?? "—") : "None"} onClick={() => setPage("personVia")} /> : null}
				{prj || ppl ? <Sep /> : null}
				<NavRow icon={<PersonIcon />} label="Person" value={nameOf(setup.person, cols.person)} onClick={() => setPage("person")} />
				<NavRow icon={<ClockIcon />} label="Dates" value={nameOf(setup.dates, cols.dates)} onClick={() => setPage("dates")} />
				<NavRow icon={<ColumnIcon />} label="Group by" value={nameOf(setup.team, cols.team)} onClick={() => setPage("team")} />
				<NavRow icon={<LayersIcon />} label="Bar label" value={view.labels.map((id) => (id === TITLE ? "Title" : (cols.labels.find((c) => c.id === id)?.name ?? "—"))).join(" · ")} onClick={() => setPage("labels")} />
				<NavRow icon={<HashIcon />} label="Measure" value={MODE_LABEL[mode]} onClick={() => setPage("mode")} />
				{count ? null : <NavRow icon={<HashIcon />} label="Effort" value={nameOf(setup.effort, cols.effort)} onClick={() => setPage("effort")} />}
				{ppl ? (
					<>
						<NavRow icon={<PersonIcon />} label="Match people by" value={nameOf(setup.pPerson, cols.pPerson)} onClick={() => setPage("pPerson")} />
						<NavRow icon={<PersonIcon />} label="People shown" value={view.everyone ? "Everyone" : extraShown ? `In the workload + ${extraShown}` : "In the workload"} onClick={() => setPage("shown")} />
						{count ? null : <NavRow icon={<TargetIcon />} label="Working time" value={setup.pCap ? nameOf(setup.pCap, cols.pCap) : "On the board"} onClick={() => setPage("pCap")} />}
					</>
				) : null}
				<Sep />
				{mode === "perDay" || mode === "total" ? <NumberRow label="Hours in a full day" value={view.dayHours} step={0.5} min={0.5} onChange={(v) => setUi({ dayHours: v })} suffix="h" /> : null}
				<NavRow icon={<ClockIcon />} label="Time scale" value={view.bucket === "day" ? "Days" : view.bucket === "week" ? "Weeks" : "Months"} onClick={() => setPage("bucket")} />
				<ToggleRow icon={<TargetIcon />} label="Workdays only" sub="Weekends carry no load or capacity" on={view.workdays} onChange={(v) => setUi({ workdays: v })} />
				{setup.dates ? <ToggleRow icon={<ClockIcon />} label="Tasks without a date" sub="Show them as ongoing across the whole range" on={view.undated} onChange={(v) => setUi({ undated: v })} /> : null}
				{tooMany ? (
					<Note>Task bars are off for more than {MAX_BARS} tasks.</Note>
				) : (
					<ToggleRow icon={<LayersIcon />} label="Show tasks" sub="Task bars under each person" on={view.bars} onChange={(v) => setUi({ bars: v })} />
				)}
				<Sep />
				<label className="srow">
					<span className="srow-l">From</span>
					<input className="field" style={{ width: 150, flex: "none" }} type="date" value={from} onChange={(e) => setUi({ from: e.target.value })} />
				</label>
				<label className="srow">
					<span className="srow-l">To</span>
					<input className="field" style={{ width: 150, flex: "none" }} type="date" value={to} onChange={(e) => setUi({ to: e.target.value })} />
				</label>
				<Note>
					{ppl ? "The People database adds groups, working time and people to show." : "Only people with tasks are shown; connect a People database to add others."}
					{count ? "" : " Click “works …” on a person to set their working time locally."} Only the picked project's or person's tasks are loaded.
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
	// What the filter bar has to name to load anything.
	const optNames = optionProps(base).map((id) => base.propertySchemasById[id]?.name ?? "")
	const hasKind = (kind: "project" | "person", re: RegExp) => links.some((l) => l.kind === kind) || optNames.some((n) => re.test(n))
	const scopeNames =
		[hasKind("project", /project|projekt|client|kunde|epic/i) ? "a Project" : "", hasKind("person", /person|owner|assignee|who|member/i) ? "a Person" : ""].filter(Boolean).join(" or ") ||
		"a select, status or multi-select"
	// Too many tasks to draw as bars: the switch is locked off.
	const tooMany = src.items.length > MAX_BARS || src.truncated
	const over = new Set(WL.lanes.filter((l) => l.overBuckets > 0).map((l) => l.person)).size
	const teams = new Set(WL.lanes.map((l) => l.team).filter(Boolean)).size
	const people = new Set(WL.lanes.filter((l) => l.person !== "__none").map((l) => l.person)).size
	const groupName = setup.team ? (cols.team.find((c) => c.id === setup.team)?.name ?? "group") : "group"
	return (
		<>
			<Toolbar
				title="Workload"
				sub={`${people} ${people === 1 ? "person" : "people"}${teams ? ` · ${teams} ${teams === 1 ? "group" : "groups"} by ${groupName}` : ""}`}
				view={view}
				setView={setView}
				properties={properties}
				filtering={filtering}
				today={today}
				settings={settings}
				filterHint={plan.kind === "none" ? `Add ${scopeNames} filter to load tasks` : undefined}
				share={{ block: "workload", defaults: DEFAULT, schemas: { ...ppl?.propertySchemasById, ...src.propertySchemasById }, sanitize }}
			/>
			{plan.kind === "none" ? (
				<div className="state">
					Add {scopeNames} filter (filter button) to load a workload. Nothing is loaded until then, so even a huge task database stays quick.
				</div>
			) : (
				<>
				{src.loading || loadingLinked ? (
					<div className="loadline">{ids && fetchRow ? `Loading tasks ${Math.min(linked?.key === idsKey ? linked.done : 0, ids.length)} / ${ids.length}…` : "Loading tasks…"}</div>
				) : ids && fetchRow ? (
					<div className="loadline">
						{ids.length} linked task{ids.length === 1 ? "" : "s"} loaded.{" "}
						<button type="button" className="ghost sm" title="Load these tasks again" onClick={() => setReload((n) => n + 1)}>
							Refresh
						</button>
					</div>
				) : null}
			<div className="stats">
				<Stat l="People" v={String(people)} sub={teams ? `in ${teams} ${teams === 1 ? "group" : "groups"}` : ""} />
				{WL.capacity ? <Stat l="Over capacity" v={String(over)} sub={over ? "at some point" : ""} tone={over ? "bad" : undefined} /> : <Stat l="Tasks" v={String(new Set(WL.lanes.flatMap((l) => l.items.map((i) => i.id))).size)} />}
				<Stat l="Range" v={`${fmtDay(WL.start)} – ${fmtDay(WL.end - 1, true)}`} />
			</div>
			{!setup.person || (!count && !setup.effort) ? (
				<div className="state">
					Pick the {!setup.person ? "Person" : "Effort"} property in the settings (sliders button) to draw the workload.
				</div>
			) : WL.lanes.length === 0 ? (
				<div className="state">No tasks{filtering ? " match the filters" : ""}.</div>
			) : (
				<Lanes WL={WL} bucket={view.bucket} bars={view.bars && !tooMany} group={groupName} onCap={setCap} />
			)}
			{WL.capacity ? (
				<div className="legend">
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
				{WL.skipped ? <span>{WL.skipped} rows have no effort and are left out.</span> : null}
				{WL.undated ? <span>{WL.undated} tasks without a date are left out.</span> : null}
		{src.truncated ? <span>{plan.kind === "link" ? `Only the first ${MAX_LINKED} of ${ids!.length + plan.more} linked tasks are loaded.` : "Some tasks could not be read (Notion returns 999 per query, and more than that share one date)."}</span> : null}
	</div>
	</>
	)}
	</>
	)
}

const LABEL_W = 170
const CHART_H = 72
const BAR_H = 16

function Lanes({ WL, bucket, bars, group, onCap }: { WL: Workload; bucket: Bucket; bars: boolean; group: string; onCap: (key: string, share: number | null) => void }) {
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
	// Effort lanes share one scale. Task counts share 0–25 (people differ a lot); a lane with more at once gets its own.
	const yShared = WL.capacity ? Math.max(...WL.lanes.map((l) => Math.max(l.cap * 1.25, l.peak * 1.05)), 1) : COUNT_SCALE

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
				const yMax = WL.capacity || lane.peak <= COUNT_SCALE ? yShared : Math.ceil(lane.peak * 1.1)
				const y = (v: number) => CHART_H - (v / yMax) * (CHART_H - 6)
				return (
					<Fragment key={lane.key}>
						{WL.lanes.some((l) => l.team) && (li === 0 || lane.team !== WL.lanes[li - 1].team) ? <div className="team-h">{lane.team ?? `No ${group}`}</div> : null}
					<div className="lane">
						<div className="lane-h" style={narrow ? undefined : { width: LABEL_W - 12 }}>
							<b title={lane.label}>{lane.label}</b>
							{WL.capacity ? (
								<>
									<span className={lane.overBuckets ? "bad" : ""}>
										{Math.round(lane.utilization * 100)}% used · peak {fmtNum(lane.peak)}
										{WL.unit === "%" ? "%" : ` ${WL.unit}`}
									</span>
									<CapLabel lane={lane} unit={WL.unit} onCap={onCap} />
								</>
							) : (
								<span>
									{lane.items.length} task{lane.items.length === 1 ? "" : "s"} · up to {fmtNum(lane.peak)} at once
								</span>
							)}
						</div>
						<svg width={W} height={h} className="lane-svg" role="img" aria-label={`Workload of ${lane.label}`}>
							{ticks.map((t, i) => (i % every ? null : <line key={t} x1={x(t)} x2={x(t)} y1={0} y2={h} stroke="var(--grid)" />))}
							{!WL.capacity ? (
								<text x={L + plotW - 4} y={10} textAnchor="end" className={"axis" + (yMax > COUNT_SCALE ? " scaled" : "")}>
									{yMax > COUNT_SCALE ? `scale 0–${yMax}` : `0–${COUNT_SCALE}`}
								</text>
							) : null}
							{WL.buckets.map((b, bi) => {
								const x0 = x(b)
								const x1 = x(nextBucket(b, bucket))
								const w = Math.max(1, x1 - x0 - (x1 - x0 > 6 ? 1.5 : 0))
								let acc = 0
								const over = WL.capacity && lane.total[bi] > lane.cap + 1e-9
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
							{WL.capacity ? <line x1={L} x2={L + plotW} y1={y(lane.cap)} y2={y(lane.cap)} stroke="var(--ink2)" strokeDasharray="4 3" /> : null}
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
												<title>{`${it.label} · ${fmtDay(it.start)}–${fmtDay(it.end, true)}${WL.capacity ? ` · ${fmtNum(it.perDay)} ${WL.unit}/day` : ""}`}</title>
												<rect x={bx} y={by} width={bw} height={BAR_H} rx={3} fill={color(si)} opacity={0.22} stroke={color(si)} strokeOpacity={0.6} />
												{bw > 40 ? (
													<text x={bx + 5} y={by + 12} className="barlbl">
														{fit(it.label, bw - 10)}
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
						<span>{WL.unit === "tasks" ? "Tasks at once" : WL.unit === "%" ? "Allocated" : "Total per day"}</span>
						<span className={WL.capacity && tip.lane.total[tip.bi] > tip.lane.cap ? "bad" : ""}>
							{fmtNum(tip.lane.total[tip.bi])}
							{WL.capacity ? ` / ${fmtNum(tip.lane.cap)} ${WL.unit}` : ""}
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
	if (lane.capFrom === "people" || lane.person === "__none") return <span className="capl" title={lane.capFrom === "people" ? "From the People database" : undefined}>{lane.person === "__none" ? "" : text}</span>
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
					onCap(lane.person, e.target.value === "" ? null : Number(e.target.value))
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
